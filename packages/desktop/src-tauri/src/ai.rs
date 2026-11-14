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
//! aanbieder, het ophalen van de modellenlijst, en OAuth 2.0 (PKCE +
//! OpenRouter) via de systeembrowser en een tijdelijke lokale callbackserver.
//!
//! Protocollen (`aanbieder`):
//! - Anthropic (`/v1/messages`)
//! - OpenAI-compatible (`/v1/chat/completions`, ook OpenRouter, DeepSeek, Groq,
//!   Ollama, LM Studio, magpie en andere compatible endpoints)
//! - Gemini (`:streamGenerateContent`)
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
    token_url: Option<String>,
    #[serde(default)]
    client_id: Option<String>,
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
    let tok = OAuthToken {
        access_token,
        refresh_token: refresh_token.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
        expires_at: expires_in.map(|s| nu_sec().saturating_add(s)),
        token_type: Some("Bearer".to_string()),
        scope: None,
        account,
        token_url: token_url.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
        client_id: client_id.map(|s| s.trim().to_string()).filter(|s| !s.is_empty()),
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

/// Het adres van het verzoek. Alleen `https://`, of `http://` op localhost of
/// 127.0.0.1. Ondersteunt basis-URL's met of zonder `/v1` / `/v4` / volledig pad,
/// zodat derdepartij-endpoints zoals OpenRouter (`/api/v1`), Groq (`/openai/v1`),
/// Ollama (`/v1`) en Zhipu (`/api/paas/v4`) geen dubbel `/v1/v1` krijgen.
fn adres(v: &Verzoek) -> Result<String, String> {
    let fout = "the endpoint must start with https:// (or http://localhost for a local model)";
    let (basis, url) = toets_url(&v.endpoint, fout)?;
    let protocol = aanbieder_naam(&v.aanbieder)?;
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
            if basis.ends_with("/chat/completions") {
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
fn modellen_adres(aanbieder: &str, endpoint: &str) -> Result<String, String> {
    let fout = "the endpoint must start with https:// (or http://localhost for a local model)";
    let (basis, url) = toets_url(endpoint, fout)?;
    let protocol = aanbieder_naam(aanbieder)?;
    let kaal = basis
        .strip_suffix("/chat/completions")
        .or_else(|| basis.strip_suffix("/messages"))
        .unwrap_or(&basis);
    let url_kaal = url::Url::parse(kaal).unwrap_or(url);
    match protocol.as_str() {
        "anthropic" => {
            if schoon_pad_leeg(&url_kaal) {
                Ok(format!("{kaal}/v1/models"))
            } else {
                Ok(format!("{kaal}/models"))
            }
        }
        "openai" => {
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

/// De kopregels, met de sleutel of het OAuth-token erin.
/// - `ApiKey`: Anthropic `x-api-key`, OpenAI `Bearer`, Gemini via queryparameter.
/// - `OAuth`: alle drie via `Authorization: Bearer <access_token>`.
/// - `None`: geen authenticatie-header.
fn kopregels(v: &Verzoek, sleutel: &str) -> Vec<(String, String)> {
    let mut uit = vec![
        ("content-type".to_string(), "application/json".to_string()),
        ("accept".to_string(), "text/event-stream".to_string()),
    ];
    let proto = v.aanbieder.trim().to_ascii_lowercase();
    if proto == "anthropic" {
        uit.push(("anthropic-version".to_string(), "2023-06-01".to_string()));
    }
    if v.auth_modus == AuthModus::None || sleutel.is_empty() {
        return uit;
    }
    match (proto.as_str(), v.auth_modus) {
        ("anthropic", AuthModus::ApiKey) => {
            uit.push(("x-api-key".to_string(), sleutel.to_string()));
        }
        ("gemini", AuthModus::ApiKey) => {}
        _ => {
            uit.push(("authorization".to_string(), format!("Bearer {sleutel}")));
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

// ── OAuth 2.0 PKCE + OpenRouter ──────────────────────────────────────────────

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

fn bouw_oauth_adres(v: &OAuthStartVerzoek, redirect_uri: &str, challenge: &str, state: &str) -> Result<String, String> {
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

/// Probeert een leesbare account-aanduiding uit een eventueel JWT-payload te halen
/// (alleen als UI-label, nooit voor beveiligingsbeslissingen).
fn jwt_account(token: &str) -> Option<String> {
    let deel = token.split('.').nth(1)?;
    let bytes = URL_SAFE_NO_PAD.decode(deel).ok()?;
    let json: Value = serde_json::from_slice(&bytes).ok()?;
    json.get("email")
        .or_else(|| json.get("preferred_username"))
        .or_else(|| json.get("name"))
        .or_else(|| json.get("sub"))
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
}

/// Parst het JSON- of form-urlencoded tokenantwoord van een OAuth-server (incl.
/// OpenRouter's `{"key": "..."}`).
fn parse_token_antwoord(
    tekst: &str,
    vorige_refresh: Option<&str>,
    token_url: Option<&str>,
    client_id: Option<&str>,
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
                token_url: None,
                client_id: None,
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
            let account = id_tok.and_then(jwt_account).or_else(|| jwt_account(at));
            return Ok(OAuthToken {
                access_token: at.to_string(),
                refresh_token: rt,
                expires_at,
                token_type: j.get("token_type").and_then(|v| v.as_str()).map(|s| s.to_string()),
                scope: j.get("scope").and_then(|v| v.as_str()).map(|s| s.to_string()),
                account,
                token_url: token_url.map(|s| s.to_string()),
                client_id: client_id.map(|s| s.to_string()),
            });
        }
    } else {
        // Sommige aanbieders (o.a. oudere GitHub-apps) sturen form-urlencoded terug.
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
                token_url: token_url.map(|s| s.to_string()),
                client_id: client_id.map(|s| s.to_string()),
            });
        }
    }
    Err("OAuth server returned neither an access_token nor a key".to_string())
}

fn wissel_code_om(lopend: &OAuthLopende, code: &str) -> Result<ProfielAuthStatus, String> {
    let client_secret = crate::erpnext::lees_geheim(DIENST, &oauth_secret_naam(&lopend.profiel))?;
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
            return Err(format!("OAuth token exchange failed (HTTP {status}): {}", body.chars().take(300).collect::<String>()));
        }
        Err(e) => return Err(format!("could not reach OAuth token endpoint: {e}")),
    };

    let tok = parse_token_antwoord(
        &tekst,
        None,
        Some(lopend.token_url.trim()),
        Some(lopend.client_id.trim()),
        nu_sec(),
    )?;
    let json = Zeroizing::new(serde_json::to_string(&tok).map_err(|e| e.to_string())?);
    crate::erpnext::bewaar_geheim(DIENST, &oauth_sleutel_naam(&lopend.profiel), &json)?;
    lees_profiel_status_sync(&lopend.profiel)
}

/// Ververst het OAuth-token als het binnen 60 s verloopt en een `refresh_token`
/// beschikbaar is. Geeft het geldige `access_token` terug.
fn haal_oauth_token_op(profiel: &str) -> Result<Zeroizing<String>, String> {
    let raw = crate::erpnext::lees_geheim(DIENST, &oauth_sleutel_naam(profiel))?
        .ok_or_else(|| format!("not signed in with OAuth for {profiel}; sign in in Settings"))?;
    let tok: OAuthToken = serde_json::from_str(&raw)
        .map_err(|_| format!("stored OAuth credentials for {profiel} are unreadable; sign in again"))?;
    let nu = nu_sec();
    let moet_verversen = tok.expires_at.is_some_and(|exp| nu.saturating_add(60) >= exp);
    if !moet_verversen {
        return Ok(Zeroizing::new(tok.access_token));
    }
    let Some(ref refresh) = tok.refresh_token.as_ref().filter(|s| !s.is_empty()) else {
        return Err(format!("OAuth session for {profiel} has expired; please sign in again"));
    };
    let Some(ref token_url) = tok.token_url.as_ref().filter(|s| !s.is_empty()) else {
        return Err(format!("OAuth session for {profiel} expired and has no token_url for refresh"));
    };
    let client_id = tok.client_id.as_deref().unwrap_or("");
    let client_secret = crate::erpnext::lees_geheim(DIENST, &oauth_secret_naam(profiel))?;

    let agent = ureq::AgentBuilder::new()
        .timeout_connect(VERBIND_TIJD)
        .timeout_read(VERBIND_TIJD)
        .build();
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
    let tekst = match agent
        .post(token_url.trim())
        .set("accept", "application/json")
        .send_form(&paren)
    {
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
    let nieuw = parse_token_antwoord(
        &tekst,
        Some(refresh.as_str()),
        Some(token_url),
        tok.client_id.as_deref(),
        nu_sec(),
    )?;
    let opslag = Zeroizing::new(serde_json::to_string(&nieuw).map_err(|e| e.to_string())?);
    crate::erpnext::bewaar_geheim(DIENST, &oauth_sleutel_naam(profiel), &opslag)?;
    Ok(Zeroizing::new(nieuw.access_token))
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
    let oauth_state = willekeurige_token(24)?;
    let challenge = pkce_challenge(&code_verifier);

    let poort = verzoek.callback_port.unwrap_or(0);
    let server = tiny_http::Server::http(format!("127.0.0.1:{poort}"))
        .map_err(|e| format!("could not start local OAuth callback listener: {e}"))?;
    let werkelijke_poort = server
        .server_addr()
        .to_ip()
        .map(|a| a.port())
        .ok_or_else(|| "could not read callback server port".to_string())?;
    let redirect_uri = format!("http://127.0.0.1:{werkelijke_poort}/oauth/callback");
    let authorize_url = bouw_oauth_adres(&verzoek, &redirect_uri, &challenge, &oauth_state)?;

    let lopend = OAuthLopende {
        profiel,
        soort: verzoek.soort.clone(),
        token_url: verzoek.token_url.trim().to_string(),
        client_id: verzoek.client_id.trim().to_string(),
        redirect_uri: redirect_uri.clone(),
        code_verifier,
        state: oauth_state.clone(),
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

/// Handmatige afronding voor wanneer de browser op een andere machine draait:
/// gebruiker plakt het callback-adres (`http://127.0.0.1:.../oauth/callback?code=...`)
/// of alleen de autorisatiecode.
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

    let trimmed = invoer.trim();
    if trimmed.is_empty() {
        return Err("callback URL or code cannot be empty".to_string());
    }
    let code = if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        let u = url::Url::parse(trimmed).map_err(|_| "invalid callback URL".to_string())?;
        let mut map: HashMap<String, String> = HashMap::new();
        for (k, v) in u.query_pairs() {
            map.insert(k.into_owned(), v.into_owned());
        }
        if let Some(err) = map.get("error") {
            let desc = map.get("error_description").unwrap_or(err);
            return Err(format!("OAuth error: {desc}"));
        }
        if lopend.soort != "openrouter" {
            let st = map.get("state").map(|s| s.as_str()).unwrap_or("");
            if st != lopend.state {
                return Err("OAuth state mismatch in pasted URL".to_string());
            }
        }
        map.get("code")
            .filter(|s| !s.is_empty())
            .cloned()
            .ok_or_else(|| "no code parameter in callback URL".to_string())?
    } else {
        trimmed.to_string()
    };

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

/// Haalt beschikbare modellen op van `/v1/models` (OpenAI / Anthropic) of `/v1beta/models` (Gemini).
#[tauri::command]
pub async fn ai_list_models(verzoek: ModelLijstVerzoek) -> Result<Vec<String>, String> {
    let proto = aanbieder_naam(&verzoek.aanbieder)?;
    let profiel = match &verzoek.profiel {
        Some(p) if !p.trim().is_empty() => profiel_id(p)?,
        _ => proto.clone(),
    };
    let mut url = modellen_adres(&proto, &verzoek.endpoint)?;
    let auth_modus = verzoek.auth_modus;

    tauri::async_runtime::spawn_blocking(move || {
        let sleutel = match auth_modus {
            AuthModus::None => Zeroizing::new(String::new()),
            AuthModus::OAuth => haal_oauth_token_op(&profiel)?,
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
    /// Per blokindex (Anthropic) of tool-index (OpenAI) de lopende aanroep.
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
            // Bij OpenAI is er geen sluitbericht per aanroep: hier is hij klaar.
            for (id, naam, argumenten) in std::mem::take(&mut self.lopend) {
                if !naam.is_empty() {
                    uit.push(Gebeurtenis::Oproep { id, naam, argumenten: argumenten_of_leeg(&argumenten) });
                }
            }
        }
        uit
    }

    fn gemini(&mut self, j: &Value) -> Vec<Gebeurtenis> {
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

    let sleutel = match verzoek.auth_modus {
        AuthModus::None => Zeroizing::new(String::new()),
        AuthModus::OAuth => {
            let p = profiel.clone();
            match tauri::async_runtime::spawn_blocking(move || haal_oauth_token_op(&p))
                .await
                .map_err(|e| e.to_string())?
            {
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
                Some(s) => s,
                None if is_lokaal_adres(&verzoek.endpoint) => Zeroizing::new(String::new()),
                None => {
                    let _ = kanaal.send(Gebeurtenis::Fout {
                        melding: format!("no API key stored for {profiel}; set one in Settings, AI assistant"),
                    });
                    return Ok(());
                }
            }
        }
    };

    let body = lichaam(&verzoek, &sleutel);
    let adres = if protocol == "gemini" && verzoek.auth_modus == AuthModus::ApiKey && !sleutel.is_empty() {
        let sep = if adres.contains('?') { '&' } else { '?' };
        format!(
            "{adres}{sep}key={}",
            url::form_urlencoded::byte_serialize(sleutel.as_bytes()).collect::<String>()
        )
    } else {
        adres
    };
    let koppen = kopregels(&verzoek, &sleutel);
    drop(sleutel);

    tauri::async_runtime::spawn_blocking(move || stuur(&protocol, &adres, &koppen, &body, &stop, &kanaal))
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
    fn gemini_zet_de_geschiedenis_om() {
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
        v.endpoint = "https://openrouter.ai/api/v1/".to_string();
        assert_eq!(adres(&v).unwrap(), "https://openrouter.ai/api/v1/chat/completions");
        v.endpoint = "http://127.0.0.1:11434/v1".to_string();
        assert_eq!(adres(&v).unwrap(), "http://127.0.0.1:11434/v1/chat/completions");
        v.endpoint = "https://open.bigmodel.cn/api/paas/v4".to_string();
        assert_eq!(adres(&v).unwrap(), "https://open.bigmodel.cn/api/paas/v4/chat/completions");
        v.endpoint = "https://custom.example.com/proxy/v1/chat/completions".to_string();
        assert_eq!(adres(&v).unwrap(), "https://custom.example.com/proxy/v1/chat/completions");
        // Een onbekend protocol bestaat niet.
        assert!(adres(&verzoek("openrouter")).is_err());
    }

    #[test]
    fn de_kopregels_per_aanbieder_en_oauth() {
        let koppen = kopregels(&verzoek("anthropic"), "s3cret");
        assert!(koppen.iter().any(|(k, v)| k == "x-api-key" && v == "s3cret"));
        assert!(koppen.iter().any(|(k, _)| k == "anthropic-version"));
        // OAuth bij Anthropic en Gemini gebruikt Bearer i.p.v. x-api-key / query.
        let mut v = verzoek("anthropic");
        v.auth_modus = AuthModus::OAuth;
        let koppen = kopregels(&v, "oauth-tok");
        assert!(koppen.iter().any(|(k, v)| k == "authorization" && v == "Bearer oauth-tok"));
        assert!(!koppen.iter().any(|(k, _)| k == "x-api-key"));
        let mut vg = verzoek("gemini");
        vg.auth_modus = AuthModus::OAuth;
        let koppen = kopregels(&vg, "gem-tok");
        assert!(koppen.iter().any(|(k, v)| k == "authorization" && v == "Bearer gem-tok"));
        // OpenAI ApiKey gebruikt Bearer; AuthModus::None stuurt nooit auth.
        let koppen = kopregels(&verzoek("openai"), "s3cret");
        assert!(koppen.iter().any(|(k, v)| k == "authorization" && v == "Bearer s3cret"));
        let mut vn = verzoek("openai");
        vn.auth_modus = AuthModus::None;
        let koppen = kopregels(&vn, "s3cret");
        assert!(!koppen.iter().any(|(k, _)| k == "authorization"));
    }

    #[test]
    fn profiel_id_regels() {
        assert_eq!(profiel_id("DeepSeek-V3").unwrap(), "deepseek-v3");
        assert_eq!(profiel_id("custom_1").unwrap(), "custom_1");
        assert!(profiel_id("").is_err());
        assert!(profiel_id("oauth:abc").is_err());
        assert!(profiel_id("../secret").is_err());
        assert!(profiel_id("-begint-met-streep").is_err());
    }

    #[test]
    fn pkce_challenge_rfc7636_vector() {
        // Officieel testvoorbeeld uit RFC 7636 Appendix B.
        assert_eq!(
            pkce_challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
            "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM"
        );
    }

    #[test]
    fn oauth_token_antwoorden_worden_gelezen() {
        let tok = parse_token_antwoord(
            r#"{"access_token":"at-1","refresh_token":"rt-1","expires_in":3600,"token_type":"Bearer"}"#,
            None,
            Some("https://oauth.example.com/token"),
            Some("cid"),
            1000,
        )
        .unwrap();
        assert_eq!(tok.access_token, "at-1");
        assert_eq!(tok.refresh_token.as_deref(), Some("rt-1"));
        assert_eq!(tok.expires_at, Some(4600));
        // OpenRouter PKCE stuurt `{"key":"sk-or-..."}`.
        let or_tok = parse_token_antwoord(r#"{"key":"sk-or-v1-abc"}"#, None, None, None, 1000).unwrap();
        assert_eq!(or_tok.access_token, "sk-or-v1-abc");
        assert_eq!(or_tok.expires_at, None);
        // Form-urlencoded (bijv. GitHub) wordt ook herkend, met behoud van vorige refresh_token.
        let gh_tok = parse_token_antwoord(
            "access_token=tok_test_123&token_type=bearer",
            Some("old-rt"),
            None,
            None,
            1000,
        )
        .unwrap();
        assert_eq!(gh_tok.access_token, "tok_test_123");
        assert_eq!(gh_tok.refresh_token.as_deref(), Some("old-rt"));
        assert!(parse_token_antwoord(r#"{"error":"access_denied","error_description":"user cancelled"}"#, None, None, None, 1000).is_err());
    }

    #[test]
    fn modellenlijst_wordt_geparst() {
        let oa = modellen_uit_json("openai", &json!({"data": [{"id": "deepseek-reasoner"}, {"id": "deepseek-chat"}, {"id": "deepseek-chat"}]}));
        assert_eq!(oa, vec!["deepseek-chat", "deepseek-reasoner"]);
        let gem = modellen_uit_json("gemini", &json!({"models": [{"name": "models/gemini-2.5-pro"}]}));
        assert_eq!(gem, vec!["gemini-2.5-pro"]);
        assert_eq!(modellen_adres("openai", "https://openrouter.ai/api/v1").unwrap(), "https://openrouter.ai/api/v1/models");
        assert_eq!(modellen_adres("openai", "https://api.deepseek.com").unwrap(), "https://api.deepseek.com/v1/models");
    }

    #[test]
    fn anthropic_leest_tekst_en_een_aanroep() {
        let mut lus = Lus::nieuw("anthropic");
        assert_eq!(
            lus.regel("data: {\"type\":\"content_block_start\",\"index\":0,\"content_block\":{\"type\":\"text\",\"text\":\"\"}}"),
            vec![]
        );
        assert_eq!(
            lus.regel("data: {\"type\":\"content_block_delta\",\"index\":0,\"delta\":{\"type\":\"text_delta\",\"text\":\"Ik reken\"}}"),
            vec![Gebeurtenis::Tekst { tekst: "Ik reken".to_string() }]
        );
        assert_eq!(
            lus.regel("data: {\"type\":\"content_block_start\",\"index\":1,\"content_block\":{\"type\":\"tool_use\",\"id\":\"toolu_1\",\"name\":\"sheet_evaluate\",\"input\":{}}}"),
            vec![]
        );
        assert_eq!(
            lus.regel("data: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"{\\\"id\\\":\"}}"),
            vec![]
        );
        assert_eq!(
            lus.regel("data: {\"type\":\"content_block_delta\",\"index\":1,\"delta\":{\"type\":\"input_json_delta\",\"partial_json\":\"\\\"ex-1\\\"}\"}}"),
            vec![]
        );
        assert_eq!(
            lus.regel("data: {\"type\":\"content_block_stop\",\"index\":1}"),
            vec![Gebeurtenis::Oproep {
                id: "toolu_1".to_string(),
                naam: "sheet_evaluate".to_string(),
                argumenten: json!({ "id": "ex-1" }),
            }]
        );
        let _ = lus.regel("data: {\"type\":\"message_delta\",\"delta\":{\"stop_reason\":\"tool_use\"},\"usage\":{\"output_tokens\":42}}");
        assert_eq!(
            lus.klaar(),
            Gebeurtenis::Klaar { stopreden: "gereedschap".to_string(), invoer: 0, uitvoer: 42 }
        );
        assert_eq!(lus.regel(""), vec![]);
        assert_eq!(lus.regel("event: ping"), vec![]);
        assert_eq!(lus.regel("data: [DONE]"), vec![]);
    }

    #[test]
    fn openai_leest_tekst_en_een_aanroep() {
        let mut lus = Lus::nieuw("openai");
        assert_eq!(
            lus.regel("data: {\"choices\":[{\"delta\":{\"content\":\"Ik \"}}]}"),
            vec![Gebeurtenis::Tekst { tekst: "Ik ".to_string() }]
        );
        let _ = lus.regel("data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"id\":\"call_1\",\"function\":{\"name\":\"sheet_get\",\"arguments\":\"\"}}]}}]}");
        let _ = lus.regel("data: {\"choices\":[{\"delta\":{\"tool_calls\":[{\"index\":0,\"function\":{\"arguments\":\"{\\\"id\\\":\\\"ex-1\\\"}\"}}]}}]}");
        assert_eq!(
            lus.regel("data: {\"choices\":[{\"delta\":{},\"finish_reason\":\"tool_calls\"}],\"usage\":{\"prompt_tokens\":10,\"completion_tokens\":5}}"),
            vec![Gebeurtenis::Oproep {
                id: "call_1".to_string(),
                naam: "sheet_get".to_string(),
                argumenten: json!({ "id": "ex-1" }),
            }]
        );
        assert_eq!(
            lus.klaar(),
            Gebeurtenis::Klaar { stopreden: "gereedschap".to_string(), invoer: 10, uitvoer: 5 }
        );
    }

    #[test]
    fn gemini_leest_tekst_en_een_aanroep() {
        let mut lus = Lus::nieuw("gemini");
        assert_eq!(
            lus.regel("data: {\"candidates\":[{\"content\":{\"parts\":[{\"text\":\"Ik reken\"}]}}]}"),
            vec![Gebeurtenis::Tekst { tekst: "Ik reken".to_string() }]
        );
        assert_eq!(
            lus.regel("data: {\"candidates\":[{\"content\":{\"parts\":[{\"functionCall\":{\"name\":\"sheet_get\",\"args\":{\"id\":\"ex-1\"}}}]}}]}"),
            vec![Gebeurtenis::Oproep {
                id: "gemini-1".to_string(),
                naam: "sheet_get".to_string(),
                argumenten: json!({ "id": "ex-1" }),
            }]
        );
        let _ = lus.regel("data: {\"candidates\":[{\"content\":{\"parts\":[]},\"finishReason\":\"STOP\"}]}");
        match lus.klaar() {
            Gebeurtenis::Klaar { stopreden, .. } => assert_eq!(stopreden, "gereedschap"),
            anders => panic!("{anders:?}"),
        }
    }

    #[test]
    fn een_fout_van_de_aanbieder_wordt_een_melding() {
        let mut lus = Lus::nieuw("anthropic");
        let uit = lus.regel("data: {\"type\":\"error\",\"error\":{\"message\":\"overloaded\"}}");
        assert_eq!(uit, vec![Gebeurtenis::Fout { melding: "overloaded".to_string() }]);
        let mut lus = Lus::nieuw("openai");
        let uit = lus.regel("data: {\"error\":{\"message\":\"invalid key\"}}");
        assert_eq!(uit, vec![Gebeurtenis::Fout { melding: "invalid key".to_string() }]);
    }

    #[test]
    fn een_http_fout_wordt_ingekort() {
        assert_eq!(foutmelding(401, ""), "the model answered with HTTP 401");
        assert_eq!(foutmelding(400, " bad request "), "the model answered with HTTP 400: bad request");
        let lang = "x".repeat(1000);
        assert!(foutmelding(500, &lang).chars().count() < 450);
    }
}
