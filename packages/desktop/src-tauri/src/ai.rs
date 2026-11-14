//! De AI-assistent in de app: één verzoek naar de gekozen aanbieder, met de
//! sleutel of het OAuth-token uit de sleutelbos van het besturingssysteem.
//!
//! Waarom in Rust en niet in de webview: een verzoek naar een andere host wordt
//! door de webview tegengehouden (CORS), net als bij ERPNext (`src/erpnext.rs`).
//! En de sleutel of het token hoort niet in de webview of in `preferences.json`:
//! hij staat in de sleutelbos, onder de dienst [`DIENST`], per profiel, en gaat
//! alleen als header (of Gemini-query) mee naar het adres van die aanbieder.
//! Hij komt nooit terug naar de frontend en staat in geen foutmelding of log.
//!
//! De assistent zelf (de lus, de goedkeuring, de stappenlijst) staat in de
//! frontend: `src/components/ai/agent.ts`. Hier staat het gesprek met de
//! aanbieder, het ophalen van de modellenlijst, en OAuth 2.0:
//! - Standaard PKCE + lokale callback (o.a. Google Gemini, GitHub, eigen OAuth)
//! - Anthropic Claude Pro/Max OAuth (JSON token-exchange, Claude Code headers)
//! - OpenAI / ChatGPT Codex OAuth (poort 1455 + Device Code flow + Responses API)
//! - OpenRouter PKCE
//!
//! Protocollen (`aanbieder`):
//! - Anthropic (`/v1/messages`, plus OAuth Claude Code mode)
//! - OpenAI-compatible (`/v1/chat/completions`, plus ChatGPT Codex Responses API bij OAuth)
//! - Gemini (`:streamGenerateContent`, plus Cloud Code Assist `v1internal` bij OAuth)
//!
//! Zie docs/tw/OCSS接入實作計畫.md, P2-15.

use std::collections::HashMap;
use std::io::{BufRead, BufReader};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine as _;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::ipc::Channel;
use tauri_plugin_opener::OpenerExt;
use zeroize::Zeroizing;

/// De dienst in de sleutelbos. De gebruiker bij die dienst is het profiel-id
/// (bij API-sleutels) of `oauth:<id>` / `oauth_secret:<id>` (bij OAuth).
const DIENST: &str = "open-calcsheet-studio-ai";

/// Hoe lang één verzoek mag duren: verbinden kort, lezen ruim (een lang antwoord
/// komt druppelsgewijs binnen).
const VERBIND_TIJD: Duration = Duration::from_secs(20);
const LEES_TIJD: Duration = Duration::from_secs(180);
const OAUTH_WACHT_SECS: u64 = 180;
const DEVICE_WACHT_SECS: u64 = 900;

/// Publieke CLI OAuth-clientgegevens (RFC 8252 §8.5 installed apps).
const OPENAI_CODEX_CLIENT_ID: &str = "app_EMoamEEZ73f0CkXaXp7hrann";
const CODEX_RESPONSES_URL: &str = "https://chatgpt.com/backend-api/codex/responses";
const CODEX_MODELS_URL: &str = "https://chatgpt.com/backend-api/codex/models?client_version=0.99.0";
const CLOUDCODE_BASIS: &str = "https://cloudcode-pa.googleapis.com/v1internal";

/// De protocollen die dit bestand kent. Eigen derde-partij-modellen kiezen één
/// van deze drie (meestal `openai`).
pub const AANBIEDERS: [&str; 3] = ["anthropic", "openai", "gemini"];

/// Hoe een profiel zich aanmeldt bij de aanbieder.
#[derive(Debug, Clone, Copy, Default, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum AuthModus {
    #[default]
    ApiKey,
    OAuth,
    None,
}

/// Wat de assistent vraagt: één beurt, met de geschiedenis en het gereedschap.
#[derive(Debug, Clone, Deserialize)]
pub struct Verzoek {
    /// Het wire-protocol: `anthropic`, `openai` of `gemini`.
    pub aanbieder: String,
    /// Het profiel-id voor de sleutelbos (bijv. `deepseek`, `custom-1`). Zonder
    /// dit veld valt het terug op `aanbieder` (bestaande callers blijven werken).
    #[serde(default)]
    pub profiel: Option<String>,
    /// Hoe de aanmelding loopt: `apikey`, `oauth` of `none`.
    #[serde(default)]
    pub auth_modus: AuthModus,
    /// De basis-URL, bijvoorbeeld `https://api.anthropic.com`,
    /// `https://openrouter.ai/api/v1` of `http://127.0.0.1:3425`.
    pub endpoint: String,
    pub model: String,
    #[serde(default)]
    pub systeem: String,
    #[serde(default)]
    pub berichten: Vec<Bericht>,
    #[serde(default)]
    pub gereedschap: Vec<Gereedschap>,
    #[serde(default = "standaard_max_tokens")]
    pub max_tokens: u32,
    #[serde(default)]
    pub temperatuur: Option<f64>,
    /// Optionele extra HTTP-kopregels voor derdepartij-endpoints.
    #[serde(default)]
    pub extra_koppen: HashMap<String, String>,
    /// Optioneel GCP-project voor Gemini Code Assist OAuth (Workspace accounts).
    #[serde(default)]
    pub project_id: Option<String>,
}

fn standaard_max_tokens() -> u32 {
    4096
}

/// Eén beurt in de geschiedenis, in de vorm die alle aanbieders kunnen krijgen.
#[derive(Debug, Clone, Deserialize)]
pub struct Bericht {
    /// `user`, `assistant` of `tool`.
    pub rol: String,
    #[serde(default)]
    pub tekst: String,
    /// De gereedschapsaanroepen van een assistent-beurt.
    #[serde(default)]
    pub oproepen: Vec<Oproep>,
    /// De uitkomsten van gereedschap (rol `tool`).
    #[serde(default)]
    pub resultaten: Vec<Resultaat>,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
pub struct Oproep {
    pub id: String,
    pub naam: String,
    #[serde(default)]
    pub argumenten: Value,
}

#[derive(Debug, Clone, Deserialize)]
pub struct Resultaat {
    pub id: String,
    #[serde(default)]
    pub naam: String,
    pub inhoud: String,
    #[serde(default)]
    pub fout: bool,
}

/// Een gereedschap zoals de aanbieder het te zien krijgt: naam, uitleg en het
/// JSON-schema van de argumenten (hetzelfde schema als de MCP-tool).
#[derive(Debug, Clone, Deserialize)]
pub struct Gereedschap {
    pub naam: String,
    #[serde(default)]
    pub beschrijving: String,
    #[serde(default)]
    pub schema: Value,
}

/// Wat er onderweg terugkomt naar de zijbalk.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(tag = "soort", rename_all = "lowercase")]
pub enum Gebeurtenis {
    /// Een stuk tekst van het antwoord.
    Tekst { tekst: String },
    /// Een complete gereedschapsaanroep (na het sluiten van het blok).
    Oproep { id: String, naam: String, argumenten: Value },
    /// Het antwoord is klaar; `stopreden` is `einde`, `gereedschap` of `lengte`.
    Klaar { stopreden: String, invoer: u64, uitvoer: u64 },
    /// Er ging iets mis; de zijbalk toont de melding en stopt.
    Fout { melding: String },
}

/// De stopknop: één vlag voor het lopende verzoek. Een nieuw verzoek zet hem terug.
#[derive(Default)]
pub struct AiState {
    stop: Arc<AtomicBool>,
}

// ── Profiel-id en sleutelbos ─────────────────────────────────────────────────

/// Protocol-validatie (`anthropic`, `openai`, `gemini`).
fn aanbieder_naam(aanbieder: &str) -> Result<String, String> {
    let schoon = aanbieder.trim().to_ascii_lowercase();
    if !AANBIEDERS.contains(&schoon.as_str()) {
        return Err(format!("unknown provider \"{schoon}\""));
    }
    Ok(schoon)
}

/// Profiel-id als sleutelbos-gebruiker: alleen `[a-z0-9][a-z0-9_-]{0,63}`, zodat
/// het niet botst met interne voorvoegsels (`oauth:`, `oauth_secret:`).
pub fn profiel_id(id: &str) -> Result<String, String> {
    let schoon = id.trim().to_ascii_lowercase();
    let bytes = schoon.as_bytes();
    let geldig = !bytes.is_empty()
        && bytes.len() <= 64
        && bytes[0].is_ascii_alphanumeric()
        && bytes
            .iter()
            .all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || *b == b'-' || *b == b'_');
    if !geldig {
        return Err(format!("invalid profile id \"{schoon}\""));
    }
    Ok(schoon)
}

fn verzoek_profiel(v: &Verzoek) -> Result<String, String> {
    match &v.profiel {
        Some(p) if !p.trim().is_empty() => profiel_id(p),
        _ => aanbieder_naam(&v.aanbieder),
    }
}

fn oauth_sleutel_naam(profiel: &str) -> String {
    format!("oauth:{profiel}")
}

fn oauth_secret_naam(profiel: &str) -> String {
    format!("oauth_secret:{profiel}")
}

fn nu_sec() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

/// Opgeslagen OAuth-tokens in de sleutelbos (nooit naar de frontend gestuurd).
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
struct OAuthToken {
    access_token: String,
    #[serde(default)]
    refresh_token: Option<String>,
    #[serde(default)]
    expires_at: Option<u64>,
    #[serde(default)]
    token_type: Option<String>,
    #[serde(default)]
    scope: Option<String>,
    #[serde(default)]
    account: Option<String>,
    #[serde(default)]
    account_id: Option<String>,
    #[serde(default)]
    project_id: Option<String>,
    #[serde(default)]
    token_url: Option<String>,
    #[serde(default)]
    client_id: Option<String>,
    #[serde(default)]
    token_format: Option<String>,
}

/// Wat de frontend mag zien van een profiel (alleen status, nooit een geheim).
#[derive(Debug, Clone, Serialize, Default, PartialEq)]
pub struct ProfielAuthStatus {
    pub heeft_sleutel: bool,
    pub heeft_oauth: bool,
    pub heeft_client_secret: bool,
    pub oauth_verlopen: bool,
    pub oauth_heeft_refresh: bool,
    pub oauth_expires_at: Option<u64>,
    pub oauth_account: Option<String>,
    pub oauth_account_id: Option<String>,
    pub oauth_project_id: Option<String>,
}

fn status_uit_geheimen(
    heeft_sleutel: bool,
    oauth: Option<&OAuthToken>,
    heeft_client_secret: bool,
    nu: u64,
) -> ProfielAuthStatus {
    match oauth {
        Some(tok) => {
            let verlopen = tok.expires_at.is_some_and(|exp| nu.saturating_add(60) >= exp);
            ProfielAuthStatus {
                heeft_sleutel,
                heeft_oauth: !tok.access_token.is_empty(),
                heeft_client_secret,
                oauth_verlopen: verlopen,
                oauth_heeft_refresh: tok.refresh_token.as_ref().is_some_and(|r| !r.is_empty()),
                oauth_expires_at: tok.expires_at,
                oauth_account: tok.account.clone(),
                oauth_account_id: tok.account_id.clone(),
                oauth_project_id: tok.project_id.clone(),
            }
        }
        None => ProfielAuthStatus {
            heeft_sleutel,
            heeft_oauth: false,
            heeft_client_secret,
            oauth_verlopen: false,
            oauth_heeft_refresh: false,
            oauth_expires_at: None,
            oauth_account: None,
            oauth_account_id: None,
            oauth_project_id: None,
        },
    }
}

fn lees_profiel_status_sync(profiel: &str) -> Result<ProfielAuthStatus, String> {
    let heeft_sleutel = crate::erpnext::lees_geheim(DIENST, profiel)?.is_some();
    let oauth_raw = crate::erpnext::lees_geheim(DIENST, &oauth_sleutel_naam(profiel))?;
    let oauth: Option<OAuthToken> = oauth_raw
        .as_deref()
        .and_then(|s| serde_json::from_str::<OAuthToken>(s).ok());
    let heeft_client_secret =
        crate::erpnext::lees_geheim(DIENST, &oauth_secret_naam(profiel))?.is_some();
    Ok(status_uit_geheimen(
        heeft_sleutel,
        oauth.as_ref(),
        heeft_client_secret,
        nu_sec(),
    ))
}

/// Bewaar de API-sleutel van `aanbieder` (of profiel-id) in de sleutelbos; leeg wist hem.
#[tauri::command]
pub async fn ai_zet_sleutel(aanbieder: String, sleutel: String) -> Result<(), String> {
    let naam = profiel_id(&aanbieder)?;
    let sleutel = Zeroizing::new(sleutel);
    tauri::async_runtime::spawn_blocking(move || crate::erpnext::bewaar_geheim(DIENST, &naam, &sleutel))
        .await
        .map_err(|e| e.to_string())?
}

/// Staat er een API-sleutel voor dit profiel? De sleutel zelf komt niet mee.
#[tauri::command]
pub async fn ai_heeft_sleutel(aanbieder: String) -> bool {
    let Ok(naam) = profiel_id(&aanbieder) else {
        return false;
    };
    tauri::async_runtime::spawn_blocking(move || {
        matches!(crate::erpnext::lees_geheim(DIENST, &naam), Ok(Some(_)))
    })
    .await
    .unwrap_or(false)
}

/// Volledige auth-status van één profiel (API-sleutel, OAuth, client-secret).
#[tauri::command]
pub async fn ai_profiel_status(profiel: String) -> Result<ProfielAuthStatus, String> {
    let naam = profiel_id(&profiel)?;
    tauri::async_runtime::spawn_blocking(move || lees_profiel_status_sync(&naam))
        .await
        .map_err(|e| e.to_string())?
}

/// Bewaar of wis het OAuth `client_secret` in de sleutelbos.
#[tauri::command]
pub async fn ai_oauth_zet_client_secret(profiel: String, secret: String) -> Result<(), String> {
    let naam = profiel_id(&profiel)?;
    let secret = Zeroizing::new(secret);
    tauri::async_runtime::spawn_blocking(move || {
        crate::erpnext::bewaar_geheim(DIENST, &oauth_secret_naam(&naam), &secret)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Log uit bij OAuth voor dit profiel (wist alleen de OAuth-tokens, niet het
/// eventuele client_secret of de API-sleutel).
#[tauri::command]
pub async fn ai_oauth_logout(profiel: String) -> Result<(), String> {
    let naam = profiel_id(&profiel)?;
    let leeg = Zeroizing::new(String::new());
    tauri::async_runtime::spawn_blocking(move || {
        crate::erpnext::bewaar_geheim(DIENST, &oauth_sleutel_naam(&naam), &leeg)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Handmatig een OAuth access_token (en optioneel refresh_token) opslaan.
#[tauri::command]
pub async fn ai_oauth_zet_token(
    profiel: String,
    access_token: String,
    refresh_token: Option<String>,
    expires_in: Option<u64>,
    token_url: Option<String>,
    client_id: Option<String>,
) -> Result<ProfielAuthStatus, String> {
    let naam = profiel_id(&profiel)?;
    let access_token = access_token.trim().to_string();
    if access_token.is_empty() {
        return Err("access token cannot be empty".to_string());
    }
    let account = jwt_account(&access_token);
    let account_id = jwt_chatgpt_account_id(&access_token);
    let tok = OAuthToken {
        access_token,
        refresh_token: refresh_token.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
        expires_at: expires_in.map(|s| nu_sec().saturating_add(s)),
        token_type: Some("Bearer".to_string()),
        scope: None,
        account,
        account_id,
        project_id: None,
        token_url: token_url.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
        client_id: client_id.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
        token_format: None,
    };
    let json = Zeroizing::new(serde_json::to_string(&tok).map_err(|e| e.to_string())?);
    tauri::async_runtime::spawn_blocking(move || {
        crate::erpnext::bewaar_geheim(DIENST, &oauth_sleutel_naam(&naam), &json)?;
        lees_profiel_status_sync(&naam)
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── Het adres en de kopregels ────────────────────────────────────────────────

/// Toetst of een externe URL veilig is: `https://` met host, of `http://`
/// uitsluitend voor localhost / 127.0.0.1 / [::1]. Zonder user/password.
fn toets_url(ruw: &str, foutmelding: &str) -> Result<(String, url::Url), String> {
    let basis = ruw.trim().trim_end_matches('/');
    let url = url::Url::parse(basis).map_err(|_| foutmelding.to_string())?;
    let lokaal = matches!(url.host_str(), Some("localhost") | Some("127.0.0.1") | Some("[::1]"));
    let toegestaan = match url.scheme() {
        "https" => url.host_str().is_some_and(|h| !h.is_empty()),
        "http" => lokaal,
        _ => false,
    };
    if !toegestaan || !url.username().is_empty() || url.password().is_some() {
        return Err(foutmelding.to_string());
    }
    Ok((basis.to_string(), url))
}

fn schoon_pad_leeg(url: &url::Url) -> bool {
    let p = url.path();
    p.is_empty() || p == "/"
}

/// ChatGPT Plus/Pro OAuth tokens gebruiken de Codex Responses API op chatgpt.com,
/// tenzij de gebruiker bewust een eigen compatibele endpoint-URL heeft ingevuld.
fn is_codex_oauth(v: &Verzoek) -> bool {
    if !v.aanbieder.trim().eq_ignore_ascii_case("openai") || v.auth_modus != AuthModus::OAuth {
        return false;
    }
    let e = v.endpoint.trim().to_ascii_lowercase();
    e.is_empty() || e.contains("api.openai.com") || e.contains("chatgpt.com/backend-api")
}

/// Google Gemini OAuth gebruikt Cloud Code Assist `v1internal`, tenzij een eigen
/// Gemini-proxy-URL is ingesteld.
fn is_gemini_code_assist(v: &Verzoek) -> bool {
    if !v.aanbieder.trim().eq_ignore_ascii_case("gemini") || v.auth_modus != AuthModus::OAuth {
        return false;
    }
    let e = v.endpoint.trim().to_ascii_lowercase();
    e.is_empty()
        || e.contains("generativelanguage.googleapis.com")
        || e.contains("cloudcode-pa.googleapis.com")
}

/// Het adres van het verzoek. Alleen `https://`, of `http://` op localhost of
/// 127.0.0.1. Ondersteunt basis-URL's met of zonder `/v1` / `/v4` / volledig pad,
/// en stuurt OAuth-sessies van OpenAI en Gemini naar hun abonnement-endpoints.
fn adres(v: &Verzoek) -> Result<String, String> {
    let protocol = aanbieder_naam(&v.aanbieder)?;
    if is_codex_oauth(v) {
        return Ok(CODEX_RESPONSES_URL.to_string());
    }
    if is_gemini_code_assist(v) {
        return Ok(format!("{CLOUDCODE_BASIS}:streamGenerateContent?alt=sse"));
    }
    let fout = "the endpoint must start with https:// (or http://localhost for a local model)";
    let (basis, url) = toets_url(&v.endpoint, fout)?;
    match protocol.as_str() {
        "anthropic" => {
            if basis.ends_with("/messages") {
                Ok(basis)
            } else if schoon_pad_leeg(&url) {
                Ok(format!("{basis}/v1/messages"))
            } else {
                Ok(format!("{basis}/messages"))
            }
        }
        "openai" => {
            if basis.ends_with("/chat/completions") || basis.ends_with("/responses") {
                Ok(basis)
            } else if schoon_pad_leeg(&url) {
                Ok(format!("{basis}/v1/chat/completions"))
            } else {
                Ok(format!("{basis}/chat/completions"))
            }
        }
        // Gemini zet het model in het pad.
        _ => {
            let model = v.model.trim();
            if model.is_empty() || model.contains(['?', '#', '/']) || model.contains("..") {
                return Err("invalid Gemini model name".to_string());
            }
            if basis.contains(":streamGenerateContent") {
                Ok(basis)
            } else if schoon_pad_leeg(&url) {
                Ok(format!("{basis}/v1beta/models/{model}:streamGenerateContent?alt=sse"))
            } else {
                Ok(format!("{basis}/models/{model}:streamGenerateContent?alt=sse"))
            }
        }
    }
}

/// Adres om de beschikbare modellen bij de aanbieder op te vragen (`GET`).
fn modellen_adres(aanbieder: &str, endpoint: &str, auth_modus: AuthModus) -> Result<String, String> {
    let protocol = aanbieder_naam(aanbieder)?;
    let e = endpoint.trim().to_ascii_lowercase();
    if protocol == "openai"
        && auth_modus == AuthModus::OAuth
        && (e.is_empty() || e.contains("api.openai.com") || e.contains("chatgpt.com/backend-api"))
    {
        return Ok(CODEX_MODELS_URL.to_string());
    }
    let fout = "the endpoint must start with https:// (or http://localhost for a local model)";
    let (basis, url) = toets_url(endpoint, fout)?;
    let kaal = basis
        .strip_suffix("/chat/completions")
        .or_else(|| basis.strip_suffix("/responses"))
        .or_else(|| basis.strip_suffix("/messages"))
        .unwrap_or(&basis);
    let url_kaal = url::Url::parse(kaal).unwrap_or(url);
    match protocol.as_str() {
        "anthropic" | "openai" => {
            if schoon_pad_leeg(&url_kaal) {
                Ok(format!("{kaal}/v1/models"))
            } else {
                Ok(format!("{kaal}/models"))
            }
        }
        _ => {
            if schoon_pad_leeg(&url_kaal) {
                Ok(format!("{kaal}/v1beta/models"))
            } else {
                Ok(format!("{kaal}/models"))
            }
        }
    }
}

fn mag_extra_kop(naam: &str, waarde: &str) -> bool {
    let n = naam.trim();
    if n.is_empty()
        || n.contains([':', '\r', '\n'])
        || waarde.contains(['\r', '\n'])
        || n.chars().any(|c| c.is_control() || c.is_whitespace())
    {
        return false;
    }
    let laag = n.to_ascii_lowercase();
    !matches!(
        laag.as_str(),
        "host" | "content-length" | "connection" | "transfer-encoding" | "authorization" | "x-api-key"
    )
}

/// De kopregels, met de sleutel of het OAuth-token erin.
/// - `ApiKey`: Anthropic `x-api-key`, OpenAI `Bearer`, Gemini via queryparameter.
/// - `OAuth`: Anthropic Bearer; OpenAI Codex Bearer + `ChatGPT-Account-Id`;
///   Gemini Bearer.
/// - `None`: geen authenticatie-header.
fn kopregels(v: &Verzoek, sleutel: &str, account_id: Option<&str>) -> Vec<(String, String)> {
    let mut uit = vec![
        ("content-type".to_string(), "application/json".to_string()),
        ("accept".to_string(), "text/event-stream".to_string()),
    ];
    let proto = v.aanbieder.trim().to_ascii_lowercase();
    if proto == "anthropic" {
        uit.push(("anthropic-version".to_string(), "2023-06-01".to_string()));
    } else if is_codex_oauth(v) {
        uit.push(("openai-beta".to_string(), "responses=experimental".to_string()));
        uit.push(("originator".to_string(), "ocss".to_string()));
        if let Some(id) = account_id.filter(|s| !s.is_empty()) {
            uit.push(("chatgpt-account-id".to_string(), id.to_string()));
        }
    } else if is_gemini_code_assist(v) {
        uit.push(("user-agent".to_string(), "google-api-nodejs-client/9.15.1".to_string()));
        uit.push(("x-goog-api-client".to_string(), "gl-node/22.17.0".to_string()));
    }

    if v.auth_modus != AuthModus::None && !sleutel.is_empty() {
        match (proto.as_str(), v.auth_modus) {
            ("anthropic", AuthModus::ApiKey) => {
                uit.push(("x-api-key".to_string(), sleutel.to_string()));
            }
            ("gemini", AuthModus::ApiKey) => {}
            _ => {
                uit.push(("authorization".to_string(), format!("Bearer {sleutel}")));
            }
        }
    }

    for (naam, waarde) in &v.extra_koppen {
        if mag_extra_kop(naam, waarde) {
            uit.push((naam.trim().to_string(), waarde.trim().to_string()));
        }
    }
    uit
}

/// Alleen nodig als het niet om `AuthModus::None` gaat; voor een lokaal adres
/// mag `ApiKey` ook zonder opgeslagen sleutel door (magpie/Ollama).
fn is_lokaal_adres(endpoint: &str) -> bool {
    let Ok(url) = url::Url::parse(endpoint.trim()) else {
        return false;
    };
    matches!(url.host_str(), Some("localhost") | Some("127.0.0.1") | Some("[::1]"))
}

// ── OAuth 2.0 PKCE + Anthropic + OpenAI Codex + Gemini + OpenRouter ──────────

#[derive(Debug, Clone, Deserialize)]
pub struct OAuthStartVerzoek {
    pub profiel: String,
    /// `"pkce"` (standaard OAuth 2.0 + PKCE) of `"openrouter"` (OpenRouter PKCE).
    #[serde(default = "standaard_oauth_soort")]
    pub soort: String,
    pub auth_url: String,
    pub token_url: String,
    #[serde(default)]
    pub client_id: String,
    #[serde(default)]
    pub scopes: String,
    #[serde(default)]
    pub callback_port: Option<u16>,
    /// Callback-pad, bijv. `/callback` (Anthropic), `/auth/callback` (OpenAI),
    /// `/oauth2callback` (Google) of `/oauth/callback` (standaard).
    #[serde(default)]
    pub callback_path: Option<String>,
    /// Hostnaam in de redirect-URI (`localhost` of `127.0.0.1`).
    #[serde(default)]
    pub redirect_host: Option<String>,
    /// `"form"` (standaard) of `"json"` (o.a. Anthropic).
    #[serde(default)]
    pub token_format: Option<String>,
    /// Vaste gehoste redirect-URI (bijv. Anthropic copy-code flow); slaat
    /// de lokale callback-server over.
    #[serde(default)]
    pub custom_redirect_uri: Option<String>,
    /// Bij Anthropic hoort `state` gelijk aan `code_verifier` te zijn; zonder
    /// deze vlag wordt een losse willekeurige CSRF-state gegenereerd.
    #[serde(default)]
    pub state_is_verifier: bool,
    #[serde(default)]
    pub extra_params: HashMap<String, String>,
}

fn standaard_oauth_soort() -> String {
    "pkce".to_string()
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "soort", rename_all = "lowercase")]
pub enum OAuthGebeurtenis {
    /// De autorisatie-URL die in de browser is geopend (en het redirect-adres).
    Adres { url: String, redirect_uri: String },
    /// Device code (OpenAI Codex alternatieve aanmelding).
    Device { user_code: String, verification_url: String, interval: u64 },
    /// Browser kon niet vanzelf openen; gebruiker kan de URL kopiëren.
    Waarschuwing { melding: String },
}

#[derive(Clone)]
struct OAuthLopende {
    profiel: String,
    soort: String,
    token_url: String,
    client_id: String,
    redirect_uri: String,
    code_verifier: String,
    state: String,
    token_format: String,
    stuur_state_bij_wissel: bool,
}

#[derive(Default)]
pub struct OAuthState {
    stop: Arc<AtomicBool>,
    wachtend: Arc<Mutex<Option<OAuthLopende>>>,
}

/// RFC 7636: 43+ tekens uit `[A-Za-z0-9\-_]` (32 random bytes, base64url).
fn willekeurige_token(bytes_len: usize) -> Result<String, String> {
    let mut buf = vec![0u8; bytes_len];
    getrandom::fill(&mut buf).map_err(|e| format!("random generator failed: {e}"))?;
    Ok(URL_SAFE_NO_PAD.encode(&buf))
}

/// RFC 7636 S256: `BASE64URL-ENCODE(SHA256(ASCII(code_verifier)))`.
pub fn pkce_challenge(verifier: &str) -> String {
    let hash = Sha256::digest(verifier.as_bytes());
    URL_SAFE_NO_PAD.encode(hash)
}

fn schoon_callback_pad(pad: Option<&str>) -> String {
    let p = pad.unwrap_or("/oauth/callback").trim();
    if p.is_empty() {
        "/oauth/callback".to_string()
    } else if p.starts_with('/') {
        p.to_string()
    } else {
        format!("/{p}")
    }
}

fn schoon_redirect_host(host: Option<&str>) -> &'static str {
    match host.unwrap_or("").trim().to_ascii_lowercase().as_str() {
        "localhost" => "localhost",
        _ => "127.0.0.1",
    }
}

fn effectief_client_secret(profiel: &str, token_url: &str) -> Result<Option<Zeroizing<String>>, String> {
    if let Some(s) = crate::erpnext::lees_geheim(DIENST, &oauth_secret_naam(profiel))? {
        return Ok(Some(s));
    }
    if token_url.contains("googleapis.com") || profiel.contains("gemini") {
        if let Ok(s) = std::env::var("OCSS_GEMINI_OAUTH_CLIENT_SECRET") {
            let trimmed = s.trim();
            if !trimmed.is_empty() {
                return Ok(Some(Zeroizing::new(trimmed.to_string())));
            }
        }
    }
    Ok(None)
}

fn bouw_oauth_adres(
    v: &OAuthStartVerzoek,
    redirect_uri: &str,
    challenge: &str,
    state: &str,
) -> Result<String, String> {
    let fout = "the OAuth URL must start with https:// (or http://localhost)";
    let _ = toets_url(&v.auth_url, fout)?;
    let _ = toets_url(&v.token_url, fout)?;
    let mut u = url::Url::parse(v.auth_url.trim()).map_err(|_| fout.to_string())?;
    if v.soort == "openrouter" {
        u.query_pairs_mut()
            .append_pair("callback_url", redirect_uri)
            .append_pair("code_challenge", challenge)
            .append_pair("code_challenge_method", "S256");
        return Ok(u.to_string());
    }
    if v.client_id.trim().is_empty() {
        return Err("OAuth Client ID is required".to_string());
    }
    {
        let mut q = u.query_pairs_mut();
        q.append_pair("response_type", "code")
            .append_pair("client_id", v.client_id.trim())
            .append_pair("redirect_uri", redirect_uri)
            .append_pair("code_challenge", challenge)
            .append_pair("code_challenge_method", "S256")
            .append_pair("state", state);
        if !v.scopes.trim().is_empty() {
            q.append_pair("scope", v.scopes.trim());
        }
        for (k, val) in &v.extra_params {
            let k = k.trim();
            if !k.is_empty() && !val.trim().is_empty() {
                q.append_pair(k, val.trim());
            }
        }
    }
    Ok(u.to_string())
}

fn jwt_payload(token: &str) -> Option<Value> {
    let deel = token.split('.').nth(1)?;
    let bytes = URL_SAFE_NO_PAD.decode(deel).ok()?;
    serde_json::from_slice(&bytes).ok()
}

/// Probeert een leesbare account-aanduiding uit een eventueel JWT-payload te halen
/// (alleen als UI-label, nooit voor beveiligingsbeslissingen).
fn jwt_account(token: &str) -> Option<String> {
    let json = jwt_payload(token)?;
    json.get("email")
        .or_else(|| json.get("preferred_username"))
        .or_else(|| json.get("name"))
        .or_else(|| {
            json.get("https://api.openai.com/profile")
                .and_then(|p| p.get("email"))
        })
        .or_else(|| json.get("sub"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

/// Haalt `chatgpt_account_id` uit OpenAI Codex JWT (`id_token` of `access_token`).
fn jwt_chatgpt_account_id(token: &str) -> Option<String> {
    let json = jwt_payload(token)?;
    json.get("chatgpt_account_id")
        .or_else(|| {
            json.get("https://api.openai.com/auth")
                .and_then(|a| a.get("chatgpt_account_id"))
        })
        .or_else(|| {
            json.get("organizations")
                .and_then(|o| o.get(0))
                .and_then(|first| first.get("id"))
        })
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string())
}

/// Haalt Google-account e-mail op na login als het JWT dat nog niet gaf.
fn google_userinfo_email(access_token: &str) -> Option<String> {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(Duration::from_secs(5))
        .timeout_read(Duration::from_secs(5))
        .build();
    let resp = agent
        .get("https://www.googleapis.com/oauth2/v2/userinfo")
        .set("authorization", &format!("Bearer {access_token}"))
        .call()
        .ok()?;
    let tekst = resp.into_string().ok()?;
    let j: Value = serde_json::from_str(&tekst).ok()?;
    j.get("email").and_then(|v| v.as_str()).map(|s| s.to_string())
}

/// Parst het JSON- of form-urlencoded tokenantwoord van een OAuth-server (incl.
/// OpenRouter's `{"key": "..."}`).
fn parse_token_antwoord(
    tekst: &str,
    vorige_refresh: Option<&str>,
    token_url: Option<&str>,
    client_id: Option<&str>,
    token_format: Option<&str>,
    nu: u64,
) -> Result<OAuthToken, String> {
    if let Ok(j) = serde_json::from_str::<Value>(tekst) {
        if let Some(err) = j.get("error").and_then(|v| v.as_str()) {
            let oms = j
                .get("error_description")
                .and_then(|v| v.as_str())
                .unwrap_or(err);
            return Err(format!("OAuth error: {oms}"));
        }
        // OpenRouter PKCE geeft `{"key": "sk-or-..."}` terug.
        if let Some(key) = j.get("key").and_then(|v| v.as_str()).filter(|s| !s.is_empty()) {
            return Ok(OAuthToken {
                access_token: key.to_string(),
                refresh_token: None,
                expires_at: None,
                token_type: Some("Bearer".to_string()),
                scope: None,
                account: Some("OpenRouter".to_string()),
                account_id: None,
                project_id: None,
                token_url: None,
                client_id: None,
                token_format: None,
            });
        }
        if let Some(at) = j
            .get("access_token")
            .and_then(|v| v.as_str())
            .filter(|s| !s.is_empty())
        {
            let rt = j
                .get("refresh_token")
                .and_then(|v| v.as_str())
                .filter(|s| !s.is_empty())
                .map(|s| s.to_string())
                .or_else(|| vorige_refresh.map(|s| s.to_string()));
            let expires_at = j
                .get("expires_in")
                .and_then(|v| v.as_u64())
                .map(|sec| nu.saturating_add(sec));
            let id_tok = j.get("id_token").and_then(|v| v.as_str());
            let account = id_tok
                .and_then(jwt_account)
                .or_else(|| jwt_account(at))
                .or_else(|| {
                    j.get("account")
                        .and_then(|a| a.get("email_address").or_else(|| a.get("email")))
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string())
                });
            let account_id = id_tok
                .and_then(jwt_chatgpt_account_id)
                .or_else(|| jwt_chatgpt_account_id(at));
            return Ok(OAuthToken {
                access_token: at.to_string(),
                refresh_token: rt,
                expires_at,
                token_type: j.get("token_type").and_then(|v| v.as_str()).map(|s| s.to_string()),
                scope: j.get("scope").and_then(|v| v.as_str()).map(|s| s.to_string()),
                account,
                account_id,
                project_id: None,
                token_url: token_url.map(|s| s.to_string()),
                client_id: client_id.map(|s| s.to_string()),
                token_format: token_format.map(|s| s.to_string()),
            });
        }
    } else {
        // Sommige aanbieders (o.a. GitHub OAuth) sturen form-urlencoded terug.
        let mut map: HashMap<String, String> = HashMap::new();
        for (k, v) in url::form_urlencoded::parse(tekst.as_bytes()) {
            map.insert(k.into_owned(), v.into_owned());
        }
        if let Some(err) = map.get("error") {
            let oms = map.get("error_description").unwrap_or(err);
            return Err(format!("OAuth error: {oms}"));
        }
        if let Some(at) = map.get("access_token").filter(|s| !s.is_empty()) {
            return Ok(OAuthToken {
                access_token: at.clone(),
                refresh_token: map
                    .get("refresh_token")
                    .filter(|s| !s.is_empty())
                    .cloned()
                    .or_else(|| vorige_refresh.map(|s| s.to_string())),
                expires_at: map
                    .get("expires_in")
                    .and_then(|s| s.parse::<u64>().ok())
                    .map(|sec| nu.saturating_add(sec)),
                token_type: map.get("token_type").cloned(),
                scope: map.get("scope").cloned(),
                account: jwt_account(at),
                account_id: jwt_chatgpt_account_id(at),
                project_id: None,
                token_url: token_url.map(|s| s.to_string()),
                client_id: client_id.map(|s| s.to_string()),
                token_format: token_format.map(|s| s.to_string()),
            });
        }
    }
    Err("OAuth server returned neither an access_token nor a key".to_string())
}

/// Parst geplakte callback-invoer: volledige callback-URL, Anthropic's `code#state`
/// vorm, of een losse autorisatiecode.
fn parse_handmatige_invoer(
    invoer: &str,
    verwachte_state: Option<&str>,
) -> Result<String, String> {
    let trimmed = invoer.trim();
    if trimmed.is_empty() {
        return Err("callback URL or code cannot be empty".to_string());
    }
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        let u = url::Url::parse(trimmed).map_err(|_| "invalid callback URL".to_string())?;
        let mut map: HashMap<String, String> = HashMap::new();
        for (k, v) in u.query_pairs() {
            map.insert(k.into_owned(), v.into_owned());
        }
        if let Some(err) = map.get("error") {
            let desc = map.get("error_description").unwrap_or(err);
            return Err(format!("OAuth error: {desc}"));
        }
        // Anthropic copy-code zet soms `#state` achteraan de URL.
        let frag_state = u.fragment().filter(|s| !s.is_empty());
        if let Some(exp) = verwachte_state {
            let got = map
                .get("state")
                .map(|s| s.as_str())
                .or(frag_state)
                .unwrap_or("");
            if !got.is_empty() && got != exp {
                return Err("OAuth state mismatch in pasted URL".to_string());
            }
            if map.get("state").is_none() && frag_state.is_none() {
                return Err("OAuth state mismatch in pasted URL".to_string());
            }
        }
        return map
            .get("code")
            .filter(|s| !s.is_empty())
            .cloned()
            .ok_or_else(|| "no code parameter in callback URL".to_string());
    }
    // `code#state` (Anthropic hosted callback copy button)
    if let Some((code, st)) = trimmed.split_once('#') {
        if let Some(exp) = verwachte_state {
            if st.trim() != exp {
                return Err("OAuth state mismatch in pasted code".to_string());
            }
        }
        let c = code.trim();
        if c.is_empty() {
            return Err("callback code cannot be empty".to_string());
        }
        return Ok(c.to_string());
    }
    Ok(trimmed.to_string())
}

fn wissel_code_om(lopend: &OAuthLopende, code: &str) -> Result<ProfielAuthStatus, String> {
    let client_secret = effectief_client_secret(&lopend.profiel, &lopend.token_url)?;
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(VERBIND_TIJD)
        .timeout_read(VERBIND_TIJD)
        .build();

    let resp = if lopend.soort == "openrouter" {
        agent
            .post(lopend.token_url.trim())
            .set("accept", "application/json")
            .send_json(json!({
                "code": code,
                "code_verifier": lopend.code_verifier,
                "code_challenge_method": "S256",
            }))
    } else if lopend.token_format == "json" {
        let mut body = json!({
            "grant_type": "authorization_code",
            "client_id": lopend.client_id.trim(),
            "code": code,
            "redirect_uri": lopend.redirect_uri,
            "code_verifier": lopend.code_verifier,
        });
        if lopend.stuur_state_bij_wissel && !lopend.state.is_empty() {
            body["state"] = json!(lopend.state);
        }
        if let Some(ref cs) = client_secret {
            body["client_secret"] = json!(cs.as_str());
        }
        agent
            .post(lopend.token_url.trim())
            .set("accept", "application/json")
            .send_json(body)
    } else {
        let mut paren: Vec<(&str, &str)> = vec![
            ("grant_type", "authorization_code"),
            ("code", code),
            ("redirect_uri", &lopend.redirect_uri),
            ("client_id", lopend.client_id.trim()),
            ("code_verifier", &lopend.code_verifier),
        ];
        if let Some(ref cs) = client_secret {
            paren.push(("client_secret", cs.as_str()));
        }
        agent
            .post(lopend.token_url.trim())
            .set("accept", "application/json")
            .send_form(&paren)
    };

    let tekst = match resp {
        Ok(r) => r.into_string().map_err(|e| e.to_string())?,
        Err(ureq::Error::Status(status, r)) => {
            let body = r.into_string().unwrap_or_default();
            return Err(format!(
                "OAuth token exchange failed (HTTP {status}): {}",
                body.chars().take(300).collect::<String>()
            ));
        }
        Err(e) => return Err(format!("could not reach OAuth token endpoint: {e}")),
    };

    let mut tok = parse_token_antwoord(
        &tekst,
        None,
        Some(lopend.token_url.trim()),
        Some(lopend.client_id.trim()),
        Some(lopend.token_format.as_str()),
        nu_sec(),
    )?;
    if tok.account.is_none() && lopend.token_url.contains("googleapis.com") {
        tok.account = google_userinfo_email(&tok.access_token);
    }
    let json = Zeroizing::new(serde_json::to_string(&tok).map_err(|e| e.to_string())?);
    crate::erpnext::bewaar_geheim(DIENST, &oauth_sleutel_naam(&lopend.profiel), &json)?;
    lees_profiel_status_sync(&lopend.profiel)
}

/// Ververst het OAuth-token als het binnen 60 s verloopt en een `refresh_token`
/// beschikbaar is. Geeft het geldige `access_token`, optioneel `account_id` en
/// opgeslagen `project_id` terug.
fn haal_oauth_sessie_op(profiel: &str) -> Result<OAuthToken, String> {
    let raw = crate::erpnext::lees_geheim(DIENST, &oauth_sleutel_naam(profiel))?
        .ok_or_else(|| format!("not signed in with OAuth for {profiel}; sign in in Settings"))?;
    let tok: OAuthToken = serde_json::from_str(&raw)
        .map_err(|_| format!("stored OAuth credentials for {profiel} are unreadable; sign in again"))?;
    let nu = nu_sec();
    let moet_verversen = tok.expires_at.is_some_and(|exp| nu.saturating_add(60) >= exp);
    if !moet_verversen {
        return Ok(tok);
    }
    let Some(ref refresh) = tok.refresh_token.as_ref().filter(|s| !s.is_empty()) else {
        return Err(format!("OAuth session for {profiel} has expired; please sign in again"));
    };
    let Some(ref token_url) = tok.token_url.as_ref().filter(|s| !s.is_empty()) else {
        return Err(format!("OAuth session for {profiel} expired and has no token_url for refresh"));
    };
    let client_id = tok.client_id.as_deref().unwrap_or("");
    let client_secret = effectief_client_secret(profiel, token_url)?;
    let fmt = tok
        .token_format
        .as_deref()
        .unwrap_or_else(|| {
            if token_url.contains("anthropic.com") || token_url.contains("claude.com") {
                "json"
            } else {
                "form"
            }
        });

    let agent = ureq::AgentBuilder::new()
        .timeout_connect(VERBIND_TIJD)
        .timeout_read(VERBIND_TIJD)
        .build();
    let resp = if fmt == "json" {
        let mut body = json!({
            "grant_type": "refresh_token",
            "refresh_token": refresh.as_str(),
        });
        if !client_id.is_empty() {
            body["client_id"] = json!(client_id);
        }
        if let Some(ref cs) = client_secret {
            body["client_secret"] = json!(cs.as_str());
        }
        agent
            .post(token_url.trim())
            .set("accept", "application/json")
            .send_json(body)
    } else {
        let mut paren: Vec<(&str, &str)> = vec![
            ("grant_type", "refresh_token"),
            ("refresh_token", refresh.as_str()),
        ];
        if !client_id.is_empty() {
            paren.push(("client_id", client_id));
        }
        if let Some(ref cs) = client_secret {
            paren.push(("client_secret", cs.as_str()));
        }
        agent
            .post(token_url.trim())
            .set("accept", "application/json")
            .send_form(&paren)
    };
    let tekst = match resp {
        Ok(r) => r.into_string().map_err(|e| e.to_string())?,
        Err(ureq::Error::Status(status, r)) => {
            let body = r.into_string().unwrap_or_default();
            return Err(format!(
                "OAuth token refresh failed (HTTP {status}); please sign in again: {}",
                body.chars().take(200).collect::<String>()
            ));
        }
        Err(e) => return Err(format!("could not refresh OAuth token: {e}")),
    };
    let mut nieuw = parse_token_antwoord(
        &tekst,
        Some(refresh.as_str()),
        Some(token_url),
        tok.client_id.as_deref(),
        Some(fmt),
        nu_sec(),
    )?;
    if nieuw.account.is_none() {
        nieuw.account = tok.account;
    }
    if nieuw.account_id.is_none() {
        nieuw.account_id = tok.account_id;
    }
    if nieuw.project_id.is_none() {
        nieuw.project_id = tok.project_id;
    }
    let opslag = Zeroizing::new(serde_json::to_string(&nieuw).map_err(|e| e.to_string())?);
    crate::erpnext::bewaar_geheim(DIENST, &oauth_sleutel_naam(profiel), &opslag)?;
    Ok(nieuw)
}

/// Haalt of ontdekt het Google Cloud Code Assist-project (`loadCodeAssist` /
/// `onboardUser`) en slaat dat op bij het OAuth-token in de sleutelbos.
fn zorg_voor_gemini_project(
    profiel: &str,
    tok: &mut OAuthToken,
    gekozen_project: Option<&str>,
) -> Result<String, String> {
    if let Some(p) = gekozen_project.map(|s| s.trim()).filter(|s| !s.is_empty()) {
        return Ok(p.to_string());
    }
    if let Some(ref p) = tok.project_id.as_ref().filter(|s| !s.is_empty()) {
        return Ok((*p).clone());
    }
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(VERBIND_TIJD)
        .timeout_read(VERBIND_TIJD)
        .build();
    let meta = json!({
        "ideType": "IDE_UNSPECIFIED",
        "platform": "PLATFORM_UNSPECIFIED",
        "pluginType": "GEMINI",
    });
    let bearer = format!("Bearer {}", tok.access_token);
    let load_resp = agent
        .post(&format!("{CLOUDCODE_BASIS}:loadCodeAssist"))
        .set("authorization", &bearer)
        .set("content-type", "application/json")
        .set("user-agent", "google-api-nodejs-client/9.15.1")
        .set("x-goog-api-client", "gl-node/22.17.0")
        .send_json(json!({ "metadata": meta }));
    let load_json: Value = match load_resp {
        Ok(r) => serde_json::from_str(&r.into_string().map_err(|e| e.to_string())?)
            .map_err(|e| format!("invalid loadCodeAssist response: {e}"))?,
        Err(ureq::Error::Status(code, r)) => {
            let body = r.into_string().unwrap_or_default();
            return Err(format!(
                "Gemini Code Assist loadCodeAssist failed (HTTP {code}): {}",
                body.chars().take(300).collect::<String>()
            ));
        }
        Err(e) => return Err(format!("could not reach Gemini Code Assist: {e}")),
    };

    let mut project = load_json
        .get("cloudaicompanionProject")
        .and_then(|v| v.as_str())
        .filter(|s| !s.is_empty())
        .map(|s| s.to_string());

    if project.is_none() {
        let tier_id = load_json
            .get("allowedTiers")
            .and_then(|v| v.as_array())
            .and_then(|arr| {
                arr.iter()
                    .find(|t| t.get("isDefault").and_then(|b| b.as_bool()) == Some(true))
                    .or_else(|| arr.first())
            })
            .and_then(|t| t.get("id").and_then(|s| s.as_str()))
            .unwrap_or("free-tier");

        let mut onboard_req = json!({
            "tierId": tier_id,
            "metadata": meta,
        });
        if tier_id != "free-tier" && tier_id != "FREE" {
            // Standaard geen cloudaicompanionProject voor free-tier; Workspace
            // accounts geven project_id op in de UI als dat vereist is.
            onboard_req["metadata"]["duetProject"] = json!("");
        }
        let onboard_resp = agent
            .post(&format!("{CLOUDCODE_BASIS}:onboardUser"))
            .set("authorization", &bearer)
            .set("content-type", "application/json")
            .set("user-agent", "google-api-nodejs-client/9.15.1")
            .set("x-goog-api-client", "gl-node/22.17.0")
            .send_json(onboard_req);
        if let Ok(r) = onboard_resp {
            if let Ok(mut op) = serde_json::from_str::<Value>(&r.into_string().unwrap_or_default()) {
                for _ in 0..8 {
                    if op.get("done").and_then(|b| b.as_bool()) == Some(true) {
                        break;
                    }
                    let Some(op_name) = op.get("name").and_then(|v| v.as_str()) else {
                        break;
                    };
                    std::thread::sleep(Duration::from_secs(2));
                    let poll = agent
                        .get(&format!("{CLOUDCODE_BASIS}/{op_name}"))
                        .set("authorization", &bearer)
                        .call();
                    if let Ok(pr) = poll {
                        if let Ok(pj) = serde_json::from_str::<Value>(&pr.into_string().unwrap_or_default()) {
                            op = pj;
                        } else {
                            break;
                        }
                    } else {
                        break;
                    }
                }
                project = op
                    .pointer("/response/cloudaicompanionProject/id")
                    .or_else(|| op.pointer("/response/cloudaicompanionProject"))
                    .and_then(|v| v.as_str())
                    .filter(|s| !s.is_empty())
                    .map(|s| s.to_string());
            }
        }
    }

    let project = project.ok_or_else(|| {
        "Gemini Code Assist did not return a project; enter your GCP Project ID in the AI settings or enable Gemini for Google Cloud".to_string()
    })?;
    tok.project_id = Some(project.clone());
    if let Ok(opslag) = serde_json::to_string(tok) {
        let _ = crate::erpnext::bewaar_geheim(DIENST, &oauth_sleutel_naam(profiel), &Zeroizing::new(opslag));
    }
    Ok(project)
}

fn callback_html(ok: bool, titel: &str, tekst: &str) -> String {
    let kleur = if ok { "#146c43" } else { "#b02a37" };
    format!(
        "<!doctype html><html><head><meta charset=\"utf-8\"><title>{titel}</title>\
         <style>body{{font-family:system-ui,sans-serif;max-width:460px;margin:14vh auto;padding:24px;line-height:1.5}}\
         h1{{font-size:18px;color:{kleur};margin:0 0 8px}}p{{color:#444;margin:0}}</style></head>\
         <body><h1>{titel}</h1><p>{tekst}</p></body></html>"
    )
}

fn html_ontsnapping(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

/// Start een OAuth 2.0 PKCE (of OpenRouter PKCE) login in de systeembrowser,
/// luistert lokaal op `127.0.0.1` naar de callback, wisselt de code in voor een
/// token en bewaart dat in de sleutelbos.
#[tauri::command]
pub async fn ai_oauth_login(
    app: tauri::AppHandle,
    verzoek: OAuthStartVerzoek,
    kanaal: Channel<OAuthGebeurtenis>,
    staat: tauri::State<'_, OAuthState>,
) -> Result<ProfielAuthStatus, String> {
    let profiel = profiel_id(&verzoek.profiel)?;
    let code_verifier = willekeurige_token(32)?;
    let oauth_state = if verzoek.state_is_verifier {
        code_verifier.clone()
    } else {
        willekeurige_token(24)?
    };
    let challenge = pkce_challenge(&code_verifier);
    let token_format = match verzoek.token_format.as_deref() {
        Some("json") => "json".to_string(),
        _ => "form".to_string(),
    };
    let stuur_state_bij_wissel = verzoek.state_is_verifier || token_format == "json";

    // Gehoste copy-code callback (o.a. Anthropic hosted callback): geen lokale server.
    if let Some(custom_uri) = verzoek
        .custom_redirect_uri
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
    {
        let redirect_uri = custom_uri.to_string();
        let authorize_url = bouw_oauth_adres(&verzoek, &redirect_uri, &challenge, &oauth_state)?;
        let lopend = OAuthLopende {
            profiel,
            soort: verzoek.soort.clone(),
            token_url: verzoek.token_url.trim().to_string(),
            client_id: verzoek.client_id.trim().to_string(),
            redirect_uri: redirect_uri.clone(),
            code_verifier,
            state: oauth_state,
            token_format,
            stuur_state_bij_wissel,
        };
        {
            let mut slot = staat.wachtend.lock().map_err(|_| "lock poisoned".to_string())?;
            *slot = Some(lopend);
        }
        staat.stop.store(false, Ordering::SeqCst);
        let _ = kanaal.send(OAuthGebeurtenis::Adres {
            url: authorize_url.clone(),
            redirect_uri,
        });
        if let Err(e) = app.opener().open_url(&authorize_url, None::<&str>) {
            let _ = kanaal.send(OAuthGebeurtenis::Waarschuwing {
                melding: format!("could not open browser automatically: {e}"),
            });
        }
        // Geeft de huidige status terug; gebruiker plakt `code#state` via `ai_oauth_complete_manual`.
        return lees_profiel_status_sync(&profiel_id(&verzoek.profiel)?);
    }

    let gevraagde_poort = verzoek.callback_port.unwrap_or(0);
    let server = match tiny_http::Server::http(format!("127.0.0.1:{gevraagde_poort}")) {
        Ok(s) => s,
        Err(e) if gevraagde_poort == 1455 => {
            return Err(format!(
                "port 1455 is busy ({e}); close any other Codex login or use Device Code sign-in"
            ));
        }
        Err(_) if gevraagde_poort != 0 => tiny_http::Server::http("127.0.0.1:0")
            .map_err(|e| format!("could not start local OAuth callback listener: {e}"))?,
        Err(e) => return Err(format!("could not start local OAuth callback listener: {e}")),
    };
    let werkelijke_poort = server
        .server_addr()
        .to_ip()
        .map(|a| a.port())
        .ok_or_else(|| "could not read callback server port".to_string())?;
    let callback_pad = schoon_callback_pad(verzoek.callback_path.as_deref());
    let redirect_host = schoon_redirect_host(verzoek.redirect_host.as_deref());
    let redirect_uri = format!("http://{redirect_host}:{werkelijke_poort}{callback_pad}");
    let authorize_url = bouw_oauth_adres(&verzoek, &redirect_uri, &challenge, &oauth_state)?;

    let lopend = OAuthLopende {
        profiel,
        soort: verzoek.soort.clone(),
        token_url: verzoek.token_url.trim().to_string(),
        client_id: verzoek.client_id.trim().to_string(),
        redirect_uri: redirect_uri.clone(),
        code_verifier,
        state: oauth_state.clone(),
        token_format,
        stuur_state_bij_wissel,
    };
    {
        let mut slot = staat.wachtend.lock().map_err(|_| "lock poisoned".to_string())?;
        *slot = Some(lopend);
    }
    let stop = staat.stop.clone();
    stop.store(false, Ordering::SeqCst);

    let _ = kanaal.send(OAuthGebeurtenis::Adres {
        url: authorize_url.clone(),
        redirect_uri,
    });
    if let Err(e) = app.opener().open_url(&authorize_url, None::<&str>) {
        let _ = kanaal.send(OAuthGebeurtenis::Waarschuwing {
            melding: format!("could not open browser automatically: {e}"),
        });
    }

    let wacht_slot = staat.wachtend.clone();
    let is_openrouter = verzoek.soort == "openrouter";
    tauri::async_runtime::spawn_blocking(move || {
        let deadline = std::time::Instant::now() + Duration::from_secs(OAUTH_WACHT_SECS);
        let mut ontvangen_code: Option<String> = None;
        let mut ontvangen_fout: Option<String> = None;

        while std::time::Instant::now() < deadline {
            if stop.load(Ordering::SeqCst) {
                ontvangen_fout = Some("OAuth login cancelled".to_string());
                break;
            }
            match server.recv_timeout(Duration::from_millis(250)) {
                Ok(Some(req)) => {
                    let req_url = req.url().to_string();
                    if req_url.starts_with("/favicon.ico") {
                        let _ = req.respond(tiny_http::Response::from_string("").with_status_code(404));
                        continue;
                    }
                    let fake = format!("http://127.0.0.1{req_url}");
                    let Ok(parsed) = url::Url::parse(&fake) else {
                        let _ = req.respond(tiny_http::Response::from_string("Bad request").with_status_code(400));
                        continue;
                    };
                    if parsed.path() != callback_pad {
                        let _ = req.respond(tiny_http::Response::from_string("Not found").with_status_code(404));
                        continue;
                    }
                    let mut params: HashMap<String, String> = HashMap::new();
                    for (k, val) in parsed.query_pairs() {
                        params.insert(k.into_owned(), val.into_owned());
                    }
                    if let Some(err) = params.get("error") {
                        let desc = params.get("error_description").unwrap_or(err);
                        let html = callback_html(
                            false,
                            "OAuth 登入失敗 / OAuth sign-in failed",
                            &html_ontsnapping(desc),
                        );
                        let header = tiny_http::Header::from_bytes("Content-Type", "text/html; charset=utf-8").unwrap();
                        let _ = req.respond(tiny_http::Response::from_string(html).with_status_code(400).with_header(header));
                        ontvangen_fout = Some(format!("OAuth error: {desc}"));
                        break;
                    }
                    if !is_openrouter {
                        let got_state = params.get("state").map(|s| s.as_str()).unwrap_or("");
                        if got_state != oauth_state {
                            let html = callback_html(
                                false,
                                "State 不符 / Invalid OAuth state",
                                "CSRF state mismatch; please retry sign-in from Open CalcSheet Studio.",
                            );
                            let header = tiny_http::Header::from_bytes("Content-Type", "text/html; charset=utf-8").unwrap();
                            let _ = req.respond(tiny_http::Response::from_string(html).with_status_code(400).with_header(header));
                            ontvangen_fout = Some("OAuth state mismatch".to_string());
                            break;
                        }
                    }
                    if let Some(code) = params.get("code").filter(|s| !s.is_empty()) {
                        let html = callback_html(
                            true,
                            "OAuth 登入成功 / Sign-in complete",
                            "已完成授權，您可以關閉此分頁並返回 Open CalcSheet Studio。",
                        );
                        let header = tiny_http::Header::from_bytes("Content-Type", "text/html; charset=utf-8").unwrap();
                        let _ = req.respond(tiny_http::Response::from_string(html).with_status_code(200).with_header(header));
                        ontvangen_code = Some(code.clone());
                        break;
                    }
                    let _ = req.respond(tiny_http::Response::from_string("Missing code").with_status_code(400));
                }
                Ok(None) => continue,
                Err(e) => {
                    ontvangen_fout = Some(format!("OAuth callback listener failed: {e}"));
                    break;
                }
            }
        }

        // Claim `wachtend` als hij niet al handmatig is afgehandeld.
        let claim = wacht_slot.lock().ok().and_then(|mut s| s.take());
        if let Some(fout) = ontvangen_fout {
            return Err(fout);
        }
        let Some(code) = ontvangen_code else {
            return Err("OAuth sign-in timed out waiting for callback".to_string());
        };
        let Some(lopend) = claim else {
            return Err("OAuth session already completed".to_string());
        };
        wissel_code_om(&lopend, &code)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Device Code-aanmelding voor ChatGPT / OpenAI Codex (werkt ook zonder vrije poort
/// 1455 of bij externe browser).
#[tauri::command]
pub async fn ai_oauth_device_start(
    app: tauri::AppHandle,
    profiel: String,
    client_id: Option<String>,
    kanaal: Channel<OAuthGebeurtenis>,
    staat: tauri::State<'_, OAuthState>,
) -> Result<ProfielAuthStatus, String> {
    let profiel = profiel_id(&profiel)?;
    let cid = client_id
        .as_deref()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .unwrap_or(OPENAI_CODEX_CLIENT_ID)
        .to_string();
    let stop = staat.stop.clone();
    stop.store(false, Ordering::SeqCst);

    let agent = ureq::AgentBuilder::new()
        .timeout_connect(VERBIND_TIJD)
        .timeout_read(VERBIND_TIJD)
        .build();
    let cid_req = cid.clone();
    let start_resp = tauri::async_runtime::spawn_blocking(move || {
        let resp = agent
            .post("https://auth.openai.com/api/accounts/deviceauth/usercode")
            .set("accept", "application/json")
            .send_json(json!({ "client_id": cid_req }));
        match resp {
            Ok(r) => r.into_string().map_err(|e| e.to_string()),
            Err(ureq::Error::Status(code, r)) => {
                let body = r.into_string().unwrap_or_default();
                Err(format!(
                    "device code request failed (HTTP {code}): {}",
                    body.chars().take(200).collect::<String>()
                ))
            }
            Err(e) => Err(format!("could not request device code: {e}")),
        }
    })
    .await
    .map_err(|e| e.to_string())??;

    let dj: Value = serde_json::from_str(&start_resp)
        .map_err(|e| format!("invalid device code response: {e}"))?;
    let device_auth_id = dj
        .get("device_auth_id")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing device_auth_id".to_string())?
        .to_string();
    let user_code = dj
        .get("user_code")
        .and_then(|v| v.as_str())
        .ok_or_else(|| "missing user_code".to_string())?
        .to_string();
    let interval = dj
        .get("interval")
        .and_then(|v| v.as_u64().or_else(|| v.as_str().and_then(|s| s.parse().ok())))
        .unwrap_or(5)
        .max(3);
    let verification_url = "https://auth.openai.com/codex/device".to_string();

    let _ = kanaal.send(OAuthGebeurtenis::Device {
        user_code: user_code.clone(),
        verification_url: verification_url.clone(),
        interval,
    });
    if let Err(e) = app.opener().open_url(&verification_url, None::<&str>) {
        let _ = kanaal.send(OAuthGebeurtenis::Waarschuwing {
            melding: format!("could not open browser automatically: {e}"),
        });
    }

    tauri::async_runtime::spawn_blocking(move || {
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(VERBIND_TIJD)
            .timeout_read(VERBIND_TIJD)
            .build();
        let deadline = std::time::Instant::now() + Duration::from_secs(DEVICE_WACHT_SECS);
        while std::time::Instant::now() < deadline {
            for _ in 0..(interval * 4) {
                if stop.load(Ordering::SeqCst) {
                    return Err("Device code login cancelled".to_string());
                }
                std::thread::sleep(Duration::from_millis(250));
            }
            let poll = agent
                .post("https://auth.openai.com/api/accounts/deviceauth/token")
                .set("accept", "application/json")
                .send_json(json!({
                    "device_auth_id": device_auth_id,
                    "user_code": user_code,
                }));
            match poll {
                Ok(r) => {
                    let body = r.into_string().map_err(|e| e.to_string())?;
                    let pj: Value = serde_json::from_str(&body)
                        .map_err(|e| format!("invalid deviceauth token response: {e}"))?;
                    let code = pj
                        .get("authorization_code")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| "missing authorization_code".to_string())?;
                    let verifier = pj
                        .get("code_verifier")
                        .and_then(|v| v.as_str())
                        .ok_or_else(|| "missing code_verifier".to_string())?;
                    let lopend = OAuthLopende {
                        profiel,
                        soort: "pkce".to_string(),
                        token_url: "https://auth.openai.com/oauth/token".to_string(),
                        client_id: cid,
                        redirect_uri: "https://auth.openai.com/deviceauth/callback".to_string(),
                        code_verifier: verifier.to_string(),
                        state: String::new(),
                        token_format: "form".to_string(),
                        stuur_state_bij_wissel: false,
                    };
                    return wissel_code_om(&lopend, code);
                }
                Err(ureq::Error::Status(403 | 404, _)) => continue,
                Err(ureq::Error::Status(code, r)) => {
                    let body = r.into_string().unwrap_or_default();
                    if body.contains("authorization_pending") || body.contains("slow_down") {
                        continue;
                    }
                    return Err(format!(
                        "Device authorization failed (HTTP {code}): {}",
                        body.chars().take(200).collect::<String>()
                    ));
                }
                Err(_) => continue,
            }
        }
        Err("Device code sign-in timed out".to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Handmatige afronding voor wanneer de browser op een andere machine draait of
/// bij Anthropic's `code#state` copy-code flow.
#[tauri::command]
pub async fn ai_oauth_complete_manual(
    invoer: String,
    staat: tauri::State<'_, OAuthState>,
) -> Result<ProfielAuthStatus, String> {
    let lopend = {
        let mut slot = staat.wachtend.lock().map_err(|_| "lock poisoned".to_string())?;
        slot.take()
            .ok_or_else(|| "no pending OAuth sign-in to complete".to_string())?
    };
    staat.stop.store(true, Ordering::SeqCst);

    let verwachte_state = if lopend.soort == "openrouter" {
        None
    } else {
        Some(lopend.state.as_str())
    };
    let code = parse_handmatige_invoer(&invoer, verwachte_state)?;

    tauri::async_runtime::spawn_blocking(move || wissel_code_om(&lopend, &code))
        .await
        .map_err(|e| e.to_string())?
}

/// Annuleert een lopende OAuth-aanmelding.
#[tauri::command]
pub fn ai_oauth_cancel(staat: tauri::State<'_, OAuthState>) {
    staat.stop.store(true, Ordering::SeqCst);
    if let Ok(mut slot) = staat.wachtend.lock() {
        *slot = None;
    }
}

// ── Modellen ophalen ─────────────────────────────────────────────────────────

#[derive(Debug, Clone, Deserialize)]
pub struct ModelLijstVerzoek {
    pub aanbieder: String,
    #[serde(default)]
    pub profiel: Option<String>,
    pub endpoint: String,
    #[serde(default)]
    pub auth_modus: AuthModus,
    #[serde(default)]
    pub extra_koppen: HashMap<String, String>,
}

fn modellen_uit_json(aanbieder: &str, j: &Value) -> Vec<String> {
    let mut uit: Vec<String> = Vec::new();
    match aanbieder {
        "gemini" => {
            if let Some(arr) = j.get("models").and_then(|v| v.as_array()) {
                for m in arr {
                    if let Some(methods) = m.get("supportedGenerationMethods").and_then(|v| v.as_array()) {
                        let kan = methods.iter().any(|s| s.as_str() == Some("generateContent"));
                        if !kan {
                            continue;
                        }
                    }
                    if let Some(naam) = m.get("name").and_then(|v| v.as_str()) {
                        uit.push(naam.strip_prefix("models/").unwrap_or(naam).to_string());
                    }
                }
            }
        }
        _ => {
            let arr = j
                .get("data")
                .and_then(|v| v.as_array())
                .or_else(|| j.get("models").and_then(|v| v.as_array()))
                .or_else(|| j.as_array());
            if let Some(arr) = arr {
                for m in arr {
                    if let Some(id) = m
                        .get("id")
                        .or_else(|| m.get("slug"))
                        .or_else(|| m.get("name"))
                        .and_then(|v| v.as_str())
                    {
                        uit.push(id.to_string());
                    }
                }
            }
        }
    }
    uit.sort();
    uit.dedup();
    uit
}

/// Haalt beschikbare modellen op van `/v1/models`, `/v1beta/models` of Codex `/codex/models`.
#[tauri::command]
pub async fn ai_list_models(verzoek: ModelLijstVerzoek) -> Result<Vec<String>, String> {
    let proto = aanbieder_naam(&verzoek.aanbieder)?;
    let profiel = match &verzoek.profiel {
        Some(p) if !p.trim().is_empty() => profiel_id(p)?,
        _ => proto.clone(),
    };
    let mut url = modellen_adres(&proto, &verzoek.endpoint, verzoek.auth_modus)?;
    let auth_modus = verzoek.auth_modus;
    let extra_koppen = verzoek.extra_koppen.clone();
    let is_codex = url == CODEX_MODELS_URL;

    tauri::async_runtime::spawn_blocking(move || {
        let mut account_id: Option<String> = None;
        let sleutel = match auth_modus {
            AuthModus::None => Zeroizing::new(String::new()),
            AuthModus::OAuth => {
                let sessie = haal_oauth_sessie_op(&profiel)?;
                account_id = sessie.account_id;
                Zeroizing::new(sessie.access_token)
            }
            AuthModus::ApiKey => crate::erpnext::lees_geheim(DIENST, &profiel)?.unwrap_or_default(),
        };
        if proto == "gemini" && auth_modus == AuthModus::ApiKey && !sleutel.is_empty() {
            let sep = if url.contains('?') { '&' } else { '?' };
            url = format!(
                "{url}{sep}key={}",
                url::form_urlencoded::byte_serialize(sleutel.as_bytes()).collect::<String>()
            );
        }
        let agent = ureq::AgentBuilder::new()
            .timeout_connect(VERBIND_TIJD)
            .timeout_read(VERBIND_TIJD)
            .build();
        let mut req = agent.get(&url).set("accept", "application/json");
        if proto == "anthropic" {
            req = req.set("anthropic-version", "2023-06-01");
        }
        if is_codex {
            req = req.set("originator", "ocss");
            if let Some(ref aid) = account_id {
                req = req.set("chatgpt-account-id", aid);
            }
        }
        if auth_modus != AuthModus::None && !sleutel.is_empty() {
            match (proto.as_str(), auth_modus) {
                ("anthropic", AuthModus::ApiKey) => {
                    req = req.set("x-api-key", &sleutel);
                }
                ("gemini", AuthModus::ApiKey) => {}
                _ => {
                    req = req.set("authorization", &format!("Bearer {}", sleutel.as_str()));
                }
            }
        }
        for (naam, waarde) in &extra_koppen {
            if mag_extra_kop(naam, waarde) {
                req = req.set(naam.trim(), waarde.trim());
            }
        }
        let resp = match req.call() {
            Ok(r) => r.into_string().map_err(|e| e.to_string())?,
            Err(ureq::Error::Status(code, r)) => {
                let body = r.into_string().unwrap_or_default();
                return Err(foutmelding(code, &body));
            }
            Err(e) => return Err(format!("could not fetch models: {e}")),
        };
        let json: Value = serde_json::from_str(&resp).map_err(|e| format!("invalid models response: {e}"))?;
        Ok(modellen_uit_json(&proto, &json))
    })
    .await
    .map_err(|e| e.to_string())?
}

// ── Het lichaam van het verzoek ──────────────────────────────────────────────

/// Het JSON-lichaam voor de gekozen aanbieder. Puur, zodat de controles
/// (`cargo test --lib ai`) het zonder netwerk kunnen nalezen.
pub fn lichaam(v: &Verzoek, sleutel: &str) -> Value {
    if is_codex_oauth(v) {
        return lichaam_codex_responses(v);
    }
    if is_gemini_code_assist(v) {
        let project = v.project_id.as_deref().unwrap_or("").trim();
        return lichaam_gemini_code_assist(v, sleutel, project);
    }
    match v.aanbieder.trim().to_ascii_lowercase().as_str() {
        "anthropic" => lichaam_anthropic(v),
        "gemini" => lichaam_gemini(v, sleutel),
        _ => lichaam_openai(v),
    }
}

fn lichaam_anthropic(v: &Verzoek) -> Value {
    let mut berichten: Vec<Value> = Vec::new();
    for b in &v.berichten {
        match b.rol.as_str() {
            "assistant" => {
                let mut inhoud: Vec<Value> = Vec::new();
                if !b.tekst.trim().is_empty() {
                    inhoud.push(json!({ "type": "text", "text": b.tekst }));
                }
                for o in &b.oproepen {
                    inhoud.push(json!({
                        "type": "tool_use", "id": o.id, "name": o.naam, "input": o.argumenten
                    }));
                }
                berichten.push(json!({ "role": "assistant", "content": inhoud }));
            }
            "tool" => {
                let inhoud: Vec<Value> = b
                    .resultaten
                    .iter()
                    .map(|r| {
                        json!({
                            "type": "tool_result",
                            "tool_use_id": r.id,
                            "content": r.inhoud,
                            "is_error": r.fout,
                        })
                    })
                    .collect();
                berichten.push(json!({ "role": "user", "content": inhoud }));
            }
            _ => berichten.push(json!({ "role": "user", "content": b.tekst })),
        }
    }
    let mut body = json!({
        "model": v.model,
        "max_tokens": v.max_tokens,
        "stream": true,
        "messages": berichten,
    });
    if !v.systeem.trim().is_empty() {
        body["system"] = json!(v.systeem);
    }
    if let Some(t) = v.temperatuur {
        body["temperature"] = json!(t);
    }
    if !v.gereedschap.is_empty() {
        body["tools"] = Value::Array(
            v.gereedschap
                .iter()
                .map(|g| {
                    json!({
                        "name": g.naam,
                        "description": g.beschrijving,
                        "input_schema": if g.schema.is_null() { json!({"type": "object", "properties": {}}) } else { g.schema.clone() },
                    })
                })
                .collect(),
        );
    }
    body
}

fn lichaam_openai(v: &Verzoek) -> Value {
    let mut berichten: Vec<Value> = Vec::new();
    if !v.systeem.trim().is_empty() {
        berichten.push(json!({ "role": "system", "content": v.systeem }));
    }
    for b in &v.berichten {
        match b.rol.as_str() {
            "assistant" => {
                let mut m = json!({ "role": "assistant", "content": b.tekst });
                if !b.oproepen.is_empty() {
                    m["tool_calls"] = Value::Array(
                        b.oproepen
                            .iter()
                            .map(|o| {
                                json!({
                                    "id": o.id,
                                    "type": "function",
                                    "function": { "name": o.naam, "arguments": o.argumenten.to_string() },
                                })
                            })
                            .collect(),
                    );
                }
                berichten.push(m);
            }
            "tool" => {
                for r in &b.resultaten {
                    berichten.push(json!({
                        "role": "tool",
                        "tool_call_id": r.id,
                        "content": r.inhoud,
                    }));
                }
            }
            _ => berichten.push(json!({ "role": "user", "content": b.tekst })),
        }
    }
    let mut body = json!({
        "model": v.model,
        "max_tokens": v.max_tokens,
        "stream": true,
        "messages": berichten,
    });
    if let Some(t) = v.temperatuur {
        body["temperature"] = json!(t);
    }
    if !v.gereedschap.is_empty() {
        body["tools"] = Value::Array(
            v.gereedschap
                .iter()
                .map(|g| {
                    json!({
                        "type": "function",
                        "function": {
                            "name": g.naam,
                            "description": g.beschrijving,
                            "parameters": if g.schema.is_null() { json!({"type": "object", "properties": {}}) } else { g.schema.clone() },
                        },
                    })
                })
                .collect(),
        );
    }
    body
}

/// ChatGPT Codex Responses API (`/backend-api/codex/responses`).
fn lichaam_codex_responses(v: &Verzoek) -> Value {
    let mut input: Vec<Value> = Vec::new();
    for (idx, b) in v.berichten.iter().enumerate() {
        match b.rol.as_str() {
            "assistant" => {
                if !b.tekst.trim().is_empty() {
                    input.push(json!({
                        "type": "message",
                        "role": "assistant",
                        "status": "completed",
                        "id": format!("msg_ocss_{idx}"),
                        "content": [{ "type": "output_text", "text": b.tekst, "annotations": [] }],
                    }));
                }
                for o in &b.oproepen {
                    let call_id = o.id.split('|').next().unwrap_or(&o.id);
                    input.push(json!({
                        "type": "function_call",
                        "call_id": call_id,
                        "name": o.naam,
                        "arguments": o.argumenten.to_string(),
                    }));
                }
            }
            "tool" => {
                for r in &b.resultaten {
                    let call_id = r.id.split('|').next().unwrap_or(&r.id);
                    input.push(json!({
                        "type": "function_call_output",
                        "call_id": call_id,
                        "output": r.inhoud,
                    }));
                }
            }
            _ => {
                input.push(json!({
                    "role": "user",
                    "content": [{ "type": "input_text", "text": b.tekst }],
                }));
            }
        }
    }
    let instructions = if v.systeem.trim().is_empty() {
        "You are a helpful structural engineering assistant.".to_string()
    } else {
        v.systeem.clone()
    };
    let mut body = json!({
        "model": v.model,
        "store": false,
        "stream": true,
        "instructions": instructions,
        "input": input,
        "tool_choice": "auto",
        "parallel_tool_calls": true,
    });
    if !v.gereedschap.is_empty() {
        body["tools"] = Value::Array(
            v.gereedschap
                .iter()
                .map(|g| {
                    json!({
                        "type": "function",
                        "name": g.naam,
                        "description": g.beschrijving,
                        "parameters": if g.schema.is_null() { json!({"type": "object", "properties": {}}) } else { g.schema.clone() },
                        "strict": false,
                    })
                })
                .collect(),
        );
    }
    body
}

fn lichaam_gemini(v: &Verzoek, sleutel: &str) -> Value {
    let mut inhoud: Vec<Value> = Vec::new();
    for b in &v.berichten {
        match b.rol.as_str() {
            "assistant" => {
                let mut delen: Vec<Value> = Vec::new();
                if !b.tekst.trim().is_empty() {
                    delen.push(json!({ "text": b.tekst }));
                }
                for o in &b.oproepen {
                    delen.push(json!({ "functionCall": { "name": o.naam, "args": o.argumenten } }));
                }
                inhoud.push(json!({ "role": "model", "parts": delen }));
            }
            "tool" => {
                let delen: Vec<Value> = b
                    .resultaten
                    .iter()
                    .map(|r| {
                        let antwoord: Value = serde_json::from_str(&r.inhoud)
                            .unwrap_or_else(|_| json!({ "result": r.inhoud }));
                        json!({ "functionResponse": { "name": if r.naam.is_empty() { &r.id } else { &r.naam }, "response": antwoord } })
                    })
                    .collect();
                inhoud.push(json!({ "role": "user", "parts": delen }));
            }
            _ => inhoud.push(json!({ "role": "user", "parts": [{ "text": b.tekst }] })),
        }
    }
    let mut body = json!({ "contents": inhoud });
    if !v.systeem.trim().is_empty() {
        body["systemInstruction"] = json!({ "parts": [{ "text": v.systeem }] });
    }
    body["generationConfig"] = json!({ "maxOutputTokens": v.max_tokens });
    if let Some(t) = v.temperatuur {
        body["generationConfig"]["temperature"] = json!(t);
    }
    if !v.gereedschap.is_empty() {
        body["tools"] = json!([{
            "functionDeclarations": v.gereedschap.iter().map(|g| {
                let mut d = json!({ "name": g.naam, "description": g.beschrijving });
                if !g.schema.is_null() {
                    // Gemini kent geen `additionalProperties` en geen `$schema`.
                    d["parameters"] = schoon_schema(&g.schema);
                }
                d
            }).collect::<Vec<_>>()
        }]);
    }
    let _ = sleutel;
    body
}

fn lichaam_gemini_code_assist(v: &Verzoek, sleutel: &str, project: &str) -> Value {
    let inner = lichaam_gemini(v, sleutel);
    let mut body = json!({
        "model": v.model.trim(),
        "request": inner,
    });
    if !project.trim().is_empty() {
        body["project"] = json!(project.trim());
    }
    body
}

/// Haalt sleutels weg die Gemini niet kent, diep.
fn schoon_schema(s: &Value) -> Value {
    match s {
        Value::Object(o) => Value::Object(
            o.iter()
                .filter(|(k, _)| !matches!(k.as_str(), "additionalProperties" | "$schema" | "$id"))
                .map(|(k, v)| (k.clone(), schoon_schema(v)))
                .collect(),
        ),
        Value::Array(a) => Value::Array(a.iter().map(schoon_schema).collect()),
        _ => s.clone(),
    }
}

// ── Het antwoord lezen ───────────────────────────────────────────────────────

/// De stand van één antwoord: wat er al binnenkwam en wat er nog loopt.
#[derive(Default)]
pub struct Lus {
    aanbieder: String,
    /// Per blokindex (Anthropic / Codex) of tool-index (OpenAI) de lopende aanroep: `(call_id, naam, args)`.
    lopend: Vec<(String, String, String)>,
    stopreden: String,
    invoer: u64,
    uitvoer: u64,
    tekst_geweest: bool,
}

impl Lus {
    pub fn nieuw(aanbieder: &str) -> Self {
        Lus { aanbieder: aanbieder.trim().to_ascii_lowercase(), ..Default::default() }
    }

    /// Verwerkt één regel uit de stroom. Regels zonder `data:` (lege regels,
    /// `event:`-regels) leveren niets op.
    pub fn regel(&mut self, regel: &str) -> Vec<Gebeurtenis> {
        let Some(data) = regel.trim().strip_prefix("data:") else {
            return Vec::new();
        };
        let data = data.trim();
        if data.is_empty() || data == "[DONE]" {
            return Vec::new();
        }
        let Ok(json) = serde_json::from_str::<Value>(data) else {
            return Vec::new();
        };
        match self.aanbieder.as_str() {
            "anthropic" => self.anthropic(&json),
            "gemini" => self.gemini(&json),
            "codex" => self.codex(&json),
            _ => self.openai(&json),
        }
    }

    fn anthropic(&mut self, j: &Value) -> Vec<Gebeurtenis> {
        let mut uit = Vec::new();
        match j["type"].as_str().unwrap_or("") {
            "content_block_start" => {
                let i = j["index"].as_u64().unwrap_or(0) as usize;
                let blok = &j["content_block"];
                if blok["type"] == "tool_use" {
                    let id = blok["id"].as_str().unwrap_or("").to_string();
                    let naam = blok["name"].as_str().unwrap_or("").to_string();
                    let begin = blok["input"].to_string();
                    let begin = if begin == "null" || begin == "{}" { String::new() } else { begin };
                    if self.lopend.len() <= i {
                        self.lopend.resize(i + 1, Default::default());
                    }
                    self.lopend[i] = (id, naam, begin);
                }
                if blok["type"] == "text" {
                    if let Some(t) = blok["text"].as_str().filter(|t| !t.is_empty()) {
                        uit.push(Gebeurtenis::Tekst { tekst: t.to_string() });
                    }
                }
            }
            "content_block_delta" => {
                let i = j["index"].as_u64().unwrap_or(0) as usize;
                let d = &j["delta"];
                match d["type"].as_str().unwrap_or("") {
                    "text_delta" => {
                        if let Some(t) = d["text"].as_str().filter(|t| !t.is_empty()) {
                            uit.push(Gebeurtenis::Tekst { tekst: t.to_string() });
                        }
                    }
                    "input_json_delta" => {
                        if let Some(deel) = d["partial_json"].as_str() {
                            if let Some(slot) = self.lopend.get_mut(i) {
                                slot.2.push_str(deel);
                            }
                        }
                    }
                    _ => {}
                }
            }
            "content_block_stop" => {
                let i = j["index"].as_u64().unwrap_or(0) as usize;
                if let Some((id, naam, argumenten)) = self.lopend.get(i).cloned() {
                    if !naam.is_empty() {
                        uit.push(Gebeurtenis::Oproep {
                            id,
                            naam,
                            argumenten: argumenten_of_leeg(&argumenten),
                        });
                    }
                }
            }
            "message_start" => {
                if let Some(n) = j["message"]["usage"]["input_tokens"].as_u64() {
                    self.invoer = n;
                }
            }
            "message_delta" => {
                if let Some(r) = j["delta"]["stop_reason"].as_str() {
                    self.stopreden = match r {
                        "tool_use" => "gereedschap".to_string(),
                        "max_tokens" => "lengte".to_string(),
                        "end_turn" | "stop_sequence" => "einde".to_string(),
                        anders => anders.to_string(),
                    };
                }
                if let Some(n) = j["usage"]["output_tokens"].as_u64() {
                    self.uitvoer = n;
                }
            }
            "error" => {
                let melding = j["error"]["message"].as_str().unwrap_or("the provider reported an error");
                uit.push(Gebeurtenis::Fout { melding: melding.to_string() });
            }
            _ => {}
        }
        uit
    }

    fn openai(&mut self, j: &Value) -> Vec<Gebeurtenis> {
        let mut uit = Vec::new();
        if let Some(fout) = j.get("error") {
            let melding = fout["message"].as_str().unwrap_or("the provider reported an error");
            uit.push(Gebeurtenis::Fout { melding: melding.to_string() });
            return uit;
        }
        if let Some(n) = j["usage"]["prompt_tokens"].as_u64() {
            self.invoer = n;
        }
        if let Some(n) = j["usage"]["completion_tokens"].as_u64() {
            self.uitvoer = n;
        }
        let Some(keuze) = j["choices"].get(0) else {
            return uit;
        };
        let d = &keuze["delta"];
        if let Some(t) = d["content"].as_str().filter(|t| !t.is_empty()) {
            uit.push(Gebeurtenis::Tekst { tekst: t.to_string() });
        }
        if let Some(oproepen) = d["tool_calls"].as_array() {
            for o in oproepen {
                let i = o["index"].as_u64().unwrap_or(0) as usize;
                if self.lopend.len() <= i {
                    self.lopend.resize(i + 1, Default::default());
                }
                if let Some(id) = o["id"].as_str().filter(|s| !s.is_empty()) {
                    self.lopend[i].0 = id.to_string();
                }
                if let Some(naam) = o["function"]["name"].as_str().filter(|s| !s.is_empty()) {
                    self.lopend[i].1 = naam.to_string();
                }
                if let Some(deel) = o["function"]["arguments"].as_str() {
                    self.lopend[i].2.push_str(deel);
                }
            }
        }
        if let Some(r) = keuze["finish_reason"].as_str() {
            self.stopreden = match r {
                "tool_calls" => "gereedschap".to_string(),
                "length" => "lengte".to_string(),
                "stop" => "einde".to_string(),
                anders => anders.to_string(),
            };
            for (id, naam, argumenten) in std::mem::take(&mut self.lopend) {
                if !naam.is_empty() {
                    uit.push(Gebeurtenis::Oproep { id, naam, argumenten: argumenten_of_leeg(&argumenten) });
                }
            }
        }
        uit
    }

    /// Responses API SSE (`chatgpt.com/backend-api/codex/responses`).
    fn codex(&mut self, j: &Value) -> Vec<Gebeurtenis> {
        let mut uit = Vec::new();
        let soort = j["type"].as_str().unwrap_or("");
        match soort {
            "response.output_text.delta" | "response.refusal.delta" => {
                if let Some(t) = j["delta"].as_str().filter(|s| !s.is_empty()) {
                    uit.push(Gebeurtenis::Tekst { tekst: t.to_string() });
                    self.tekst_geweest = true;
                }
            }
            "response.output_item.added" => {
                let i = j["output_index"].as_u64().unwrap_or(0) as usize;
                let item = &j["item"];
                if item["type"] == "function_call" {
                    let call_id = item["call_id"]
                        .as_str()
                        .or_else(|| item["id"].as_str())
                        .unwrap_or("")
                        .to_string();
                    let naam = item["name"].as_str().unwrap_or("").to_string();
                    let init_args = item["arguments"].as_str().unwrap_or("").to_string();
                    if self.lopend.len() <= i {
                        self.lopend.resize(i + 1, Default::default());
                    }
                    self.lopend[i] = (call_id, naam, init_args);
                }
            }
            "response.function_call_arguments.delta" => {
                let i = j["output_index"].as_u64().unwrap_or(0) as usize;
                if let Some(deel) = j["delta"].as_str() {
                    if let Some(slot) = self.lopend.get_mut(i) {
                        slot.2.push_str(deel);
                    }
                }
            }
            "response.function_call_arguments.done" => {
                let i = j["output_index"].as_u64().unwrap_or(0) as usize;
                if let Some(volledig) = j["arguments"].as_str() {
                    if let Some(slot) = self.lopend.get_mut(i) {
                        slot.2 = volledig.to_string();
                    }
                }
            }
            "response.output_item.done" => {
                let i = j["output_index"].as_u64().unwrap_or(0) as usize;
                let item = &j["item"];
                if item["type"] == "function_call" {
                    let slot = self.lopend.get_mut(i).map(std::mem::take).unwrap_or_default();
                    let call_id = item["call_id"]
                        .as_str()
                        .filter(|s| !s.is_empty())
                        .unwrap_or(&slot.0)
                        .to_string();
                    let naam = item["name"]
                        .as_str()
                        .filter(|s| !s.is_empty())
                        .unwrap_or(&slot.1)
                        .to_string();
                    let args_str = item["arguments"]
                        .as_str()
                        .filter(|s| !s.is_empty())
                        .unwrap_or(&slot.2);
                    if !naam.is_empty() {
                        uit.push(Gebeurtenis::Oproep {
                            id: call_id,
                            naam,
                            argumenten: argumenten_of_leeg(args_str),
                        });
                        self.stopreden = "gereedschap".to_string();
                    }
                }
            }
            "response.completed" | "response.done" | "response.incomplete" => {
                let resp = &j["response"];
                if let Some(n) = resp["usage"]["input_tokens"].as_u64() {
                    self.invoer = n;
                }
                if let Some(n) = resp["usage"]["output_tokens"].as_u64() {
                    self.uitvoer = n;
                }
                for (id, naam, argumenten) in std::mem::take(&mut self.lopend) {
                    if !naam.is_empty() {
                        uit.push(Gebeurtenis::Oproep {
                            id,
                            naam,
                            argumenten: argumenten_of_leeg(&argumenten),
                        });
                        self.stopreden = "gereedschap".to_string();
                    }
                }
                if self.stopreden.is_empty() {
                    let status = resp["status"].as_str().unwrap_or("completed");
                    self.stopreden = match status {
                        "incomplete" => "lengte".to_string(),
                        _ => "einde".to_string(),
                    };
                }
            }
            "response.failed" | "error" => {
                let melding = j["response"]["error"]["message"]
                    .as_str()
                    .or_else(|| j["error"]["message"].as_str())
                    .or_else(|| j["message"].as_str())
                    .unwrap_or("the provider reported an error");
                uit.push(Gebeurtenis::Fout { melding: melding.to_string() });
            }
            _ => {}
        }
        uit
    }

    fn gemini(&mut self, j: &Value) -> Vec<Gebeurtenis> {
        // Cloud Code Assist wikkelt het antwoord in `{"response": {...}}`.
        let j = j.get("response").unwrap_or(j);
        let mut uit = Vec::new();
        if let Some(fout) = j.get("error") {
            let melding = fout["message"].as_str().unwrap_or("the provider reported an error");
            uit.push(Gebeurtenis::Fout { melding: melding.to_string() });
            return uit;
        }
        if let Some(n) = j["usageMetadata"]["promptTokenCount"].as_u64() {
            self.invoer = n;
        }
        if let Some(n) = j["usageMetadata"]["candidatesTokenCount"].as_u64() {
            self.uitvoer = n;
        }
        let Some(kandidaat) = j["candidates"].get(0) else {
            return uit;
        };
        if let Some(delen) = kandidaat["content"]["parts"].as_array() {
            for deel in delen {
                if let Some(t) = deel["text"].as_str().filter(|t| !t.is_empty()) {
                    uit.push(Gebeurtenis::Tekst { tekst: t.to_string() });
                    self.tekst_geweest = true;
                }
                if let Some(fc) = deel.get("functionCall") {
                    let naam = fc["name"].as_str().unwrap_or("").to_string();
                    if !naam.is_empty() {
                        uit.push(Gebeurtenis::Oproep {
                            id: format!("gemini-{}", self.lopend.len() + 1),
                            naam,
                            argumenten: fc["args"].clone(),
                        });
                        self.lopend.push((String::new(), String::new(), String::new()));
                    }
                }
            }
        }
        if let Some(r) = kandidaat["finishReason"].as_str() {
            self.stopreden = match r {
                "STOP" => {
                    // Een STOP met een aanroep erin is gewoon gereedschap.
                    if self.lopend.is_empty() { "einde".to_string() } else { "gereedschap".to_string() }
                }
                "MAX_TOKENS" => "lengte".to_string(),
                anders => anders.to_lowercase(),
            };
        }
        uit
    }

    /// De afsluitende gebeurtenis, met de stopreden en het tokengebruik.
    pub fn klaar(&self) -> Gebeurtenis {
        let stopreden = if self.stopreden.is_empty() {
            if self.lopend.is_empty() { "einde".to_string() } else { "gereedschap".to_string() }
        } else {
            self.stopreden.clone()
        };
        Gebeurtenis::Klaar { stopreden, invoer: self.invoer, uitvoer: self.uitvoer }
    }
}

/// De argumenten als object; leeg blijft een leeg object, geen `null`.
fn argumenten_of_leeg(tekst: &str) -> Value {
    let t = tekst.trim();
    if t.is_empty() {
        return json!({});
    }
    serde_json::from_str(t).unwrap_or_else(|_| json!({}))
}

// ── Het verzoek zelf ─────────────────────────────────────────────────────────

/// Eén beurt naar de aanbieder. De gebeurtenissen gaan per stuk door `kanaal`;
/// de functie komt terug als het antwoord klaar is, bij een fout of bij de stopknop.
#[tauri::command]
pub async fn ai_vraag(
    verzoek: Verzoek,
    kanaal: Channel<Gebeurtenis>,
    staat: tauri::State<'_, AiState>,
) -> Result<(), String> {
    let stop = staat.stop.clone();
    stop.store(false, Ordering::SeqCst);
    let protocol = aanbieder_naam(&verzoek.aanbieder)?;
    let profiel = verzoek_profiel(&verzoek)?;
    let adres = adres(&verzoek)?;
    let codex = is_codex_oauth(&verzoek);
    let gemini_ca = is_gemini_code_assist(&verzoek);

    let (sleutel, account_id, ontdekt_project): (Zeroizing<String>, Option<String>, Option<String>) =
        match verzoek.auth_modus {
            AuthModus::None => (Zeroizing::new(String::new()), None, None),
            AuthModus::OAuth => {
                let p = profiel.clone();
                let gekozen_project = verzoek.project_id.clone();
                let uit = tauri::async_runtime::spawn_blocking(move || -> Result<_, String> {
                    let mut sessie = haal_oauth_sessie_op(&p)?;
                    let mut proj = gekozen_project
                        .as_deref()
                        .map(str::trim)
                        .filter(|s| !s.is_empty())
                        .map(|s| s.to_string())
                        .or_else(|| sessie.project_id.clone());
                    if gemini_ca && proj.is_none() {
                        proj = Some(zorg_voor_gemini_project(&p, &mut sessie, None)?);
                    }
                    Ok((
                        Zeroizing::new(sessie.access_token),
                        sessie.account_id,
                        proj,
                    ))
                })
                .await
                .map_err(|e| e.to_string())?;
                match uit {
                    Ok(t) => t,
                    Err(melding) => {
                        let _ = kanaal.send(Gebeurtenis::Fout { melding });
                        return Ok(());
                    }
                }
            }
            AuthModus::ApiKey => {
                let p = profiel.clone();
                let gevonden = tauri::async_runtime::spawn_blocking(move || crate::erpnext::lees_geheim(DIENST, &p))
                    .await
                    .map_err(|e| e.to_string())??;
                match gevonden {
                    Some(s) => (s, None, None),
                    None if is_lokaal_adres(&verzoek.endpoint) => (Zeroizing::new(String::new()), None, None),
                    None => {
                        let _ = kanaal.send(Gebeurtenis::Fout {
                            melding: format!("no API key stored for {profiel}; set one in Settings, AI assistant"),
                        });
                        return Ok(());
                    }
                }
            }
        };

    let mut verzoek_met_project = verzoek;
    if ontdekt_project.is_some() {
        verzoek_met_project.project_id = ontdekt_project;
    }

    let body = lichaam(&verzoek_met_project, &sleutel);
    let adres = if protocol == "gemini"
        && verzoek_met_project.auth_modus == AuthModus::ApiKey
        && !sleutel.is_empty()
    {
        let sep = if adres.contains('?') { '&' } else { '?' };
        format!(
            "{adres}{sep}key={}",
            url::form_urlencoded::byte_serialize(sleutel.as_bytes()).collect::<String>()
        )
    } else {
        adres
    };
    let koppen = kopregels(&verzoek_met_project, &sleutel, account_id.as_deref());
    drop(sleutel);

    let lus_soort = if codex { "codex".to_string() } else { protocol };
    tauri::async_runtime::spawn_blocking(move || stuur(&lus_soort, &adres, &koppen, &body, &stop, &kanaal))
        .await
        .map_err(|e| e.to_string())?
}

/// Het blokkerende deel: versturen en regel voor regel lezen. Draait buiten de
/// hoofdthread, zodat het venster bruikbaar blijft.
fn stuur(
    aanbieder: &str,
    adres: &str,
    koppen: &[(String, String)],
    body: &Value,
    stop: &Arc<AtomicBool>,
    kanaal: &Channel<Gebeurtenis>,
) -> Result<(), String> {
    let agent = ureq::AgentBuilder::new()
        .timeout_connect(VERBIND_TIJD)
        .timeout_read(LEES_TIJD)
        .build();
    let mut vraag = agent.post(adres);
    for (naam, waarde) in koppen {
        vraag = vraag.set(naam, waarde);
    }
    let antwoord = match vraag.send_json(body.clone()) {
        Ok(a) => a,
        Err(ureq::Error::Status(code, a)) => {
            let tekst = a.into_string().unwrap_or_default();
            let melding = foutmelding(code, &tekst);
            let _ = kanaal.send(Gebeurtenis::Fout { melding });
            return Ok(());
        }
        Err(e) => {
            let _ = kanaal.send(Gebeurtenis::Fout { melding: format!("could not reach the model: {e}") });
            return Ok(());
        }
    };

    let mut lus = Lus::nieuw(aanbieder);
    let lezer = BufReader::new(antwoord.into_reader());
    for regel in lezer.lines() {
        if stop.load(Ordering::SeqCst) {
            let _ = kanaal.send(Gebeurtenis::Klaar {
                stopreden: "gestopt".to_string(),
                invoer: 0,
                uitvoer: 0,
            });
            return Ok(());
        }
        let Ok(regel) = regel else { break };
        for g in lus.regel(&regel) {
            let fout = matches!(g, Gebeurtenis::Fout { .. });
            let _ = kanaal.send(g);
            if fout {
                return Ok(());
            }
        }
    }
    let _ = kanaal.send(lus.klaar());
    Ok(())
}

/// De melding bij een HTTP-fout: de tekst van de aanbieder, ingekort. Een
/// sleutel staat er nooit in (die gaat alleen als header mee).
fn foutmelding(code: u16, tekst: &str) -> String {
    let kort: String = tekst.chars().take(400).collect();
    let kort = kort.trim();
    if kort.is_empty() {
        format!("the model answered with HTTP {code}")
    } else {
        format!("the model answered with HTTP {code}: {kort}")
    }
}

/// De stopknop van de zijbalk.
#[tauri::command]
pub fn ai_stop(staat: tauri::State<'_, AiState>) {
    staat.stop.store(true, Ordering::SeqCst);
}

#[cfg(test)]
mod tests {
    use super::*;

    fn verzoek(aanbieder: &str) -> Verzoek {
        Verzoek {
            aanbieder: aanbieder.to_string(),
            profiel: None,
            auth_modus: AuthModus::ApiKey,
            endpoint: "https://api.example.com".to_string(),
            model: "test-model".to_string(),
            systeem: "Je bent een constructeur.".to_string(),
            berichten: vec![
                Bericht {
                    rol: "user".to_string(),
                    tekst: "Reken blad 1 door".to_string(),
                    oproepen: vec![],
                    resultaten: vec![],
                },
                Bericht {
                    rol: "assistant".to_string(),
                    tekst: String::new(),
                    oproepen: vec![Oproep {
                        id: "call_1".to_string(),
                        naam: "sheet_evaluate".to_string(),
                        argumenten: json!({ "id": "ex-1" }),
                    }],
                    resultaten: vec![],
                },
                Bericht {
                    rol: "tool".to_string(),
                    tekst: String::new(),
                    oproepen: vec![],
                    resultaten: vec![Resultaat {
                        id: "call_1".to_string(),
                        naam: "sheet_evaluate".to_string(),
                        inhoud: "{\"check\":\"pass\"}".to_string(),
                        fout: false,
                    }],
                },
            ],
            gereedschap: vec![Gereedschap {
                naam: "sheet_evaluate".to_string(),
                beschrijving: "Reken een blad door.".to_string(),
                schema: json!({ "type": "object", "properties": { "id": { "type": "string" } } }),
            }],
            max_tokens: 1024,
            temperatuur: None,
            extra_koppen: HashMap::new(),
            project_id: None,
        }
    }

    #[test]
    fn anthropic_zet_de_geschiedenis_om() {
        let body = lichaam(&verzoek("anthropic"), "s3cret");
        assert_eq!(body["model"], "test-model");
        assert_eq!(body["stream"], true);
        assert_eq!(body["system"], "Je bent een constructeur.");
        let berichten = body["messages"].as_array().unwrap();
        assert_eq!(berichten.len(), 3);
        assert_eq!(berichten[0]["role"], "user");
        assert_eq!(berichten[1]["content"][0]["type"], "tool_use");
        assert_eq!(berichten[1]["content"][0]["name"], "sheet_evaluate");
        assert_eq!(berichten[2]["role"], "user");
        assert_eq!(berichten[2]["content"][0]["type"], "tool_result");
        assert_eq!(berichten[2]["content"][0]["tool_use_id"], "call_1");
        assert_eq!(body["tools"][0]["input_schema"]["type"], "object");
        assert!(!body.to_string().contains("s3cret"));
    }

    #[test]
    fn anthropic_oauth_gebruikt_bearer_zonder_api_key() {
        let mut v = verzoek("anthropic");
        v.auth_modus = AuthModus::OAuth;
        let body = lichaam(&v, "tok");
        assert_eq!(body["system"], "Je bent een constructeur.");
        let kop = kopregels(&v, "tok", None);
        assert!(kop.iter().any(|(k, val)| k == "authorization" && val == "Bearer tok"));
        assert!(kop.iter().any(|(k, val)| k == "anthropic-version" && val == "2023-06-01"));
        assert!(!kop.iter().any(|(k, _)| k == "x-api-key" || k == "user-agent"));
    }

    #[test]
    fn openai_zet_de_geschiedenis_om() {
        let body = lichaam(&verzoek("openai"), "s3cret");
        let berichten = body["messages"].as_array().unwrap();
        assert_eq!(berichten[0]["role"], "system");
        assert_eq!(berichten[1]["role"], "user");
        assert_eq!(berichten[2]["tool_calls"][0]["id"], "call_1");
        assert_eq!(berichten[2]["tool_calls"][0]["function"]["name"], "sheet_evaluate");
        assert_eq!(berichten[2]["tool_calls"][0]["function"]["arguments"], "{\"id\":\"ex-1\"}");
        assert_eq!(berichten[3]["role"], "tool");
        assert_eq!(berichten[3]["tool_call_id"], "call_1");
        assert_eq!(body["tools"][0]["function"]["name"], "sheet_evaluate");
    }

    #[test]
    fn openai_codex_oauth_bouwt_responses_api_en_leest_sse() {
        let mut v = verzoek("openai");
        v.auth_modus = AuthModus::OAuth;
        v.endpoint = "https://api.openai.com/v1".to_string();
        assert_eq!(adres(&v).unwrap(), CODEX_RESPONSES_URL);
        let body = lichaam(&v, "oauth-tok");
        assert_eq!(body["store"], false);
        assert_eq!(body["instructions"], "Je bent een constructeur.");
        let input = body["input"].as_array().unwrap();
        assert_eq!(input[0]["role"], "user");
        assert_eq!(input[1]["type"], "function_call");
        assert_eq!(input[2]["type"], "function_call_output");
        assert_eq!(body["tools"][0]["name"], "sheet_evaluate");
        assert_eq!(body["tools"][0]["strict"], false);

        let kop = kopregels(&v, "oauth-tok", Some("acct_123"));
        assert!(kop.iter().any(|(k, val)| k == "chatgpt-account-id" && val == "acct_123"));
        assert!(kop.iter().any(|(k, val)| k == "openai-beta" && val == "responses=experimental"));

        let mut lus = Lus::nieuw("codex");
        assert_eq!(
            lus.regel("data: {\"type\":\"response.output_text.delta\",\"delta\":\"UC \"}"),
            vec![Gebeurtenis::Tekst { tekst: "UC ".to_string() }]
        );
        assert!(lus
            .regel("data: {\"type\":\"response.output_item.added\",\"output_index\":1,\"item\":{\"type\":\"function_call\",\"call_id\":\"c1\",\"name\":\"sheet_get\",\"arguments\":\"\"}}")
            .is_empty());
        assert!(lus
            .regel("data: {\"type\":\"response.function_call_arguments.delta\",\"output_index\":1,\"delta\":\"{\\\"id\\\":\\\"b1\\\"}\"}")
            .is_empty());
        assert_eq!(
            lus.regel("data: {\"type\":\"response.output_item.done\",\"output_index\":1,\"item\":{\"type\":\"function_call\",\"call_id\":\"c1\",\"name\":\"sheet_get\",\"arguments\":\"{\\\"id\\\":\\\"b1\\\"}\"}}"),
            vec![Gebeurtenis::Oproep {
                id: "c1".to_string(),
                naam: "sheet_get".to_string(),
                argumenten: json!({ "id": "b1" }),
            }]
        );
        assert!(lus
            .regel("data: {\"type\":\"response.completed\",\"response\":{\"status\":\"completed\",\"usage\":{\"input_tokens\":50,\"output_tokens\":20}}}")
            .is_empty());
        assert_eq!(
            lus.klaar(),
            Gebeurtenis::Klaar { stopreden: "gereedschap".to_string(), invoer: 50, uitvoer: 20 }
        );
    }

    #[test]
    fn gemini_zet_de_geschiedenis_om_en_code_assist_wikkelt() {
        let body = lichaam(&verzoek("gemini"), "s3cret");
        let inhoud = body["contents"].as_array().unwrap();
        assert_eq!(inhoud[0]["role"], "user");
        assert_eq!(inhoud[1]["role"], "model");
        assert_eq!(inhoud[1]["parts"][0]["functionCall"]["name"], "sheet_evaluate");
        assert_eq!(inhoud[2]["parts"][0]["functionResponse"]["name"], "sheet_evaluate");
        assert_eq!(body["systemInstruction"]["parts"][0]["text"], "Je bent een constructeur.");
        assert_eq!(body["generationConfig"]["maxOutputTokens"], 1024);
        assert_eq!(body["tools"][0]["functionDeclarations"][0]["name"], "sheet_evaluate");
        assert!(schoon_schema(&json!({"additionalProperties": false, "type": "object"}))
            .get("additionalProperties")
            .is_none());

        let mut ca = verzoek("gemini");
        ca.auth_modus = AuthModus::OAuth;
        ca.endpoint = "https://generativelanguage.googleapis.com/v1beta".to_string();
        ca.project_id = Some("proj-99".to_string());
        assert_eq!(adres(&ca).unwrap(), format!("{CLOUDCODE_BASIS}:streamGenerateContent?alt=sse"));
        let ca_body = lichaam(&ca, "tok");
        assert_eq!(ca_body["project"], "proj-99");
        assert_eq!(ca_body["model"], "test-model");
        assert!(ca_body["request"]["contents"].is_array());
    }

    #[test]
    fn het_adres_per_aanbieder_en_derdepartij() {
        assert_eq!(adres(&verzoek("anthropic")).unwrap(), "https://api.example.com/v1/messages");
        assert_eq!(adres(&verzoek("openai")).unwrap(), "https://api.example.com/v1/chat/completions");
        assert!(adres(&verzoek("gemini")).unwrap().contains("/v1beta/models/test-model:streamGenerateContent"));
        let mut v = verzoek("openai");
        v.endpoint = "http://api.example.com".to_string();
        assert!(adres(&v).is_err());
        // magpie op localhost mag.
        v.endpoint = "http://127.0.0.1:3425".to_string();
        assert_eq!(adres(&v).unwrap(), "http://127.0.0.1:3425/v1/chat/completions");
        // Derdepartij met `/api/v1`, `/v1`, `/api/paas/v4` krijgt geen dubbel `/v1`.
        v.endpoint = "https://openrouter.ai/api/v1".to_string();
        assert_eq!(adres(&v).unwrap(), "https://openrouter.ai/api/v1/chat/completions");
        v.endpoint = "https://api.deepseek.com/v1".to_string();
        assert_eq!(adres(&v).unwrap(), "https://api.deepseek.com/v1/chat/completions");
        v.endpoint = "https://open.bigmodel.cn/api/paas/v4".to_string();
        assert_eq!(adres(&v).unwrap(), "https://open.bigmodel.cn/api/paas/v4/chat/completions");
    }

    #[test]
    fn jwt_en_handmatige_oauth_code_state() {
        // JWT payload: {"email":"u@example.com","https://api.openai.com/auth":{"chatgpt_account_id":"acct_abc"}}
        let payload = URL_SAFE_NO_PAD.encode(
            r#"{"email":"u@example.com","https://api.openai.com/auth":{"chatgpt_account_id":"acct_abc"}}"#,
        );
        let jwt = format!("aaa.{payload}.bbb");
        assert_eq!(jwt_account(&jwt).as_deref(), Some("u@example.com"));
        assert_eq!(jwt_chatgpt_account_id(&jwt).as_deref(), Some("acct_abc"));

        assert_eq!(
            parse_handmatige_invoer("abc123#st_xyz", Some("st_xyz")).unwrap(),
            "abc123"
        );
        assert!(parse_handmatige_invoer("abc123#fout", Some("st_xyz")).is_err());
        assert_eq!(
            parse_handmatige_invoer("https://auth.example.com/oauth/callback?code=c9&state=s9", Some("s9"))
                .unwrap(),
            "c9"
        );
    }

    #[test]
    fn sse_leest_anthropic_tekst_en_aanroep() {
        let mut lus = Lus::nieuw("anthropic");
        assert!(lus.regel("event: content_block_start").is_empty());
        assert_eq!(
            lus.regel("data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}"),
            vec![]
        );
        assert_eq!(
            lus.regel("data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Hallo \"}}"),
            vec![Gebeurtenis::Tekst { tekst: "Hallo ".to_string() }]
        );
        assert!(lus
            .regel("data: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"tool_use\",\"id\":\"tu_1\",\"name\":\"sheets_list\",\"input\":{}}}")
            .is_empty());
        assert!(lus
            .regel("data: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"a\\\":\"}}")
            .is_empty());
        assert!(lus
            .regel("data: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"1}\"}}")
            .is_empty());
        assert_eq!(
            lus.regel("data: {\"type\":\"content_block_stop\",\"index\":1}"),
            vec![Gebeurtenis::Oproep { id: "tu_1".to_string(), naam: "sheets_list".to_string(), argumenten: json!({ "a": 1 }) }]
        );
        assert!(lus
            .regel("data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\"},\"usage\":{\"output_tokens\":42}}")
            .is_empty());
        assert_eq!(
            lus.klaar(),
            Gebeurtenis::Klaar { stopreden: "gereedschap".to_string(), invoer: 0, uitvoer: 42 }
        );
    }

    #[test]
    fn sse_leest_openai_tekst_en_aanroep() {
        let mut lus = Lus::nieuw("openai");
        assert_eq!(
            lus.regel("data: {\"choices\":[{\"delta\":{\"content\":\"Hoi\"}}]}"),
            vec![Gebeurtenis::Tekst { tekst: "Hoi".to_string() }]
        );
        assert!(lus
            .regel("data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"c1\",\"function\":{\"name\":\"sheet_get\",\"arguments\":\"{\\\"id\\\":\"}}]}}]}")
            .is_empty());
        assert!(lus
            .regel("data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"\\\"b1\\\"}\"}}]}}]}")
            .is_empty());
        assert_eq!(
            lus.regel("data: {\"choices\":[{\"finish_reason\":\"tool_calls\"}]}"),
            vec![Gebeurtenis::Oproep { id: "c1".to_string(), naam: "sheet_get".to_string(), argumenten: json!({ "id": "b1" }) }]
        );
        assert_eq!(lus.klaar().stopreden(), "gereedschap");
    }

    #[test]
    fn sse_leest_gemini_en_code_assist_inpakking() {
        let mut lus = Lus::nieuw("gemini");
        assert_eq!(
            lus.regel("data: {\"response\":{\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Berekening\"}]}}],\"usageMetadata\":{\"promptTokenCount\":10,\"candidatesTokenCount\":5}}}"),
            vec![Gebeurtenis::Tekst { tekst: "Berekening".to_string() }]
        );
        let events = lus.regel(
            "data: {\"candidates\":[{\"content\":{\"parts\":[{\"functionCall\":{\"name\":\"sheet_evaluate\",\"args\":{\"id\":\"1\"}}}]},\"finishReason\":\"STOP\"}]}",
        );
        assert_eq!(
            events,
            vec![Gebeurtenis::Oproep { id: "gemini-1".to_string(), naam: "sheet_evaluate".to_string(), argumenten: json!({ "id": "1" }) }]
        );
        assert_eq!(
            lus.klaar(),
            Gebeurtenis::Klaar { stopreden: "gereedschap".to_string(), invoer: 10, uitvoer: 5 }
        );
    }

    #[test]
    fn foutmelding_korte_en_veilige_koppen() {
        let mut v = verzoek("openai");
        v.extra_koppen.insert("HTTP-Referer".to_string(), "https://ocss.tw".to_string());
        v.extra_koppen.insert("Authorization".to_string(), "Bearer evil".to_string());
        v.extra_koppen.insert("Bad\r\nHeader".to_string(), "x".to_string());
        let kop = kopregels(&v, "real-key", None);
        assert!(kop.iter().any(|(k, val)| k == "HTTP-Referer" && val == "https://ocss.tw"));
        assert!(!kop.iter().any(|(_, val)| val == "Bearer evil"));
        assert!(!kop.iter().any(|(k, _)| k.contains('\r')));
    }

    #[test]
    fn profiel_id_blokkeert_voorvoegsels_en_vreemde_tekens() {
        assert_eq!(profiel_id("DeepSeek-1").unwrap(), "deepseek-1");
        assert!(profiel_id("oauth:openai").is_err());
        assert!(profiel_id("").is_err());
        assert!(profiel_id("../a").is_err());
    }

    #[test]
    fn oauth_adres_modellen_en_status() {
        let v = OAuthStartVerzoek {
            profiel: "openrouter".to_string(),
            soort: "openrouter".to_string(),
            auth_url: "https://openrouter.ai/auth".to_string(),
            token_url: "https://openrouter.ai/api/v1/auth/keys".to_string(),
            client_id: "".to_string(),
            scopes: "".to_string(),
            callback_port: None,
            callback_path: None,
            redirect_host: None,
            token_format: None,
            custom_redirect_uri: None,
            state_is_verifier: false,
            extra_params: HashMap::new(),
        };
        let u = bouw_oauth_adres(&v, "http://127.0.0.1:4321/oauth/callback", "chal", "st").unwrap();
        assert!(u.contains("callback_url="));
        assert!(u.contains("code_challenge=chal"));

        let tok = parse_token_antwoord("{\"key\":\"sk-or-v1-abc\"}", None, None, None, None, 1000).unwrap();
        assert_eq!(tok.access_token, "sk-or-v1-abc");
        let st = status_uit_geheimen(false, Some(&tok), false, 1000);
        assert!(st.heeft_oauth);
        assert!(!st.oauth_verlopen);

        assert_eq!(
            modellen_adres("openai", "https://api.openai.com/v1", AuthModus::OAuth).unwrap(),
            CODEX_MODELS_URL
        );
        assert_eq!(
            modellen_adres("openai", "https://openrouter.ai/api/v1", AuthModus::ApiKey).unwrap(),
            "https://openrouter.ai/api/v1/models"
        );
        assert_eq!(
            modellen_adres("gemini", "https://generativelanguage.googleapis.com", AuthModus::ApiKey).unwrap(),
            "https://generativelanguage.googleapis.com/v1beta/models"
        );
        let lijst = modellen_uit_json(
            "openai",
            &json!({ "models": [ { "slug": "gpt-5.3-codex" }, { "id": "gpt-5.2" } ] }),
        );
        assert_eq!(lijst, vec!["gpt-5.2", "gpt-5.3-codex"]);
    }

    impl Gebeurtenis {
        fn stopreden(&self) -> &str {
            match self {
                Gebeurtenis::Klaar { stopreden, .. } => stopreden,
                _ => "",
            }
        }
    }
}
