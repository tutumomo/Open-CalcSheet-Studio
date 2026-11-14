//! De AI-assistent in de app: één verzoek naar de gekozen aanbieder, met de
//! sleutel uit de sleutelbos van het besturingssysteem.
//!
//! Waarom in Rust en niet in de webview: een verzoek naar een andere host wordt
//! door de webview tegengehouden (CORS), net als bij ERPNext (`src/erpnext.rs`).
//! En de sleutel hoort niet in de webview of in `preferences.json`: hij staat in
//! de sleutelbos, onder de dienst [`DIENST`], per aanbieder, en gaat alleen als
//! header mee naar het adres van die aanbieder. Hij komt nooit terug naar de
//! frontend en staat in geen foutmelding of log.
//!
//! De assistent zelf (de lus, de goedkeuring, de stappenlijst) staat in de
//! frontend: `src/components/ai/agent.ts`. Hier staat alleen het gesprek met de
//! aanbieder. De vorm van het verzoek en de gebeurtenissen is voor alle
//! aanbieders dezelfde, zodat de lus ze niet hoeft te kennen.
//!
//! Aanbieders: Anthropic (`/v1/messages`), OpenAI-compatible
//! (`/v1/chat/completions`, ook magpie op `http://127.0.0.1:3425` en andere
//! compatible endpoints) en Gemini (`:streamGenerateContent`). Antwoorden komen
//! binnen als server-sent events en gaan er per stuk uit, zodat de zijbalk
//! meteen kan meetypen.
//!
//! Zie docs/tw/OCSS接入實作計畫.md, P2-15.

use std::io::{BufRead, BufReader};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::ipc::Channel;
use zeroize::Zeroizing;

/// De dienst in de sleutelbos. De gebruiker bij die dienst is de aanbieder.
const DIENST: &str = "open-calcsheet-studio-ai";

/// Hoe lang één verzoek mag duren: verbinden kort, lezen ruim (een lang antwoord
/// komt druppelsgewijs binnen).
const VERBIND_TIJD: Duration = Duration::from_secs(20);
const LEES_TIJD: Duration = Duration::from_secs(180);

/// De aanbieders die dit bestand kent. De frontend kiest er één.
pub const AANBIEDERS: [&str; 3] = ["anthropic", "openai", "gemini"];

/// Wat de assistent vraagt: één beurt, met de geschiedenis en het gereedschap.
#[derive(Debug, Clone, Deserialize)]
pub struct Verzoek {
    /// `anthropic`, `openai` of `gemini`.
    pub aanbieder: String,
    /// De basis-URL, bijvoorbeeld `https://api.anthropic.com` of `http://127.0.0.1:3425`.
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

// ── Sleutelbos ───────────────────────────────────────────────────────────────

/// De aanbieder als sleutelbos-gebruiker: kleine letters en alleen letters en
/// cijfers, zodat een vreemde waarde nooit een andere ingang raakt.
fn aanbieder_naam(aanbieder: &str) -> Result<String, String> {
    let schoon = aanbieder.trim().to_ascii_lowercase();
    if !AANBIEDERS.contains(&schoon.as_str()) {
        return Err(format!("unknown provider \"{schoon}\""));
    }
    Ok(schoon)
}

/// Bewaar de sleutel van `aanbieder` in de sleutelbos; leeg wist hem.
#[tauri::command]
pub async fn ai_zet_sleutel(aanbieder: String, sleutel: String) -> Result<(), String> {
    let naam = aanbieder_naam(&aanbieder)?;
    let sleutel = Zeroizing::new(sleutel);
    tauri::async_runtime::spawn_blocking(move || crate::erpnext::bewaar_geheim(DIENST, &naam, &sleutel))
        .await
        .map_err(|e| e.to_string())?
}

/// Staat er een sleutel voor deze aanbieder? De sleutel zelf komt niet mee.
#[tauri::command]
pub async fn ai_heeft_sleutel(aanbieder: String) -> bool {
    let Ok(naam) = aanbieder_naam(&aanbieder) else {
        return false;
    };
    tauri::async_runtime::spawn_blocking(move || {
        matches!(crate::erpnext::lees_geheim(DIENST, &naam), Ok(Some(_)))
    })
    .await
    .unwrap_or(false)
}

// ── Het adres en de kopregels ────────────────────────────────────────────────

/// Het adres van het verzoek. Alleen `https://`, of `http://` op localhost of
/// 127.0.0.1 (magpie draait daar). Zonder gebruiker of wachtwoord in het adres.
fn adres(v: &Verzoek) -> Result<String, String> {
    let basis = v.endpoint.trim().trim_end_matches('/');
    let fout = || "the endpoint must start with https:// (or http://localhost for a local model)".to_string();
    let url = url::Url::parse(basis).map_err(|_| fout())?;
    let lokaal = matches!(url.host_str(), Some("localhost") | Some("127.0.0.1") | Some("[::1]"));
    let toegestaan = match url.scheme() {
        "https" => url.host_str().is_some_and(|h| !h.is_empty()),
        "http" => lokaal,
        _ => false,
    };
    if !toegestaan || !url.username().is_empty() || url.password().is_some() {
        return Err(fout());
    }
    let pad = match aanbieder_naam(&v.aanbieder)?.as_str() {
        "anthropic" => "/v1/messages",
        "openai" => "/v1/chat/completions",
        // Gemini zet het model in het pad en de sleutel in de query.
        _ => return Ok(format!("{basis}/v1beta/models/{}:streamGenerateContent?alt=sse", v.model.trim())),
    };
    Ok(format!("{basis}{pad}"))
}

/// De kopregels, met de sleutel erin. Anthropic wil `x-api-key` en een
/// versie-header, OpenAI een bearer-token, Gemini de sleutel in de query.
fn kopregels(v: &Verzoek, sleutel: &str) -> Vec<(String, String)> {
    let mut uit = vec![
        ("content-type".to_string(), "application/json".to_string()),
        ("accept".to_string(), "text/event-stream".to_string()),
    ];
    match v.aanbieder.trim().to_ascii_lowercase().as_str() {
        "anthropic" => {
            uit.push(("x-api-key".to_string(), sleutel.to_string()));
            uit.push(("anthropic-version".to_string(), "2023-06-01".to_string()));
        }
        "gemini" => {}
        _ => {
            if !sleutel.is_empty() {
                uit.push(("authorization".to_string(), format!("Bearer {sleutel}")));
            }
        }
    }
    uit
}

/// Bij Gemini gaat de sleutel als queryparameter mee; dat doet `adres`, hier
/// alleen of er een sleutel nodig is.
fn heeft_sleutel_nodig(v: &Verzoek) -> bool {
    !matches!(v.endpoint.trim(), e if e.contains("127.0.0.1") || e.contains("localhost"))
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
    /// De laatste Gemini-aanroep, die pas bij het sluiten van het blok compleet is.
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
    let naam = aanbieder_naam(&verzoek.aanbieder)?;
    let adres = adres(&verzoek)?;
    let sleutel = if heeft_sleutel_nodig(&verzoek) {
        let n = naam.clone();
        let gevonden = tauri::async_runtime::spawn_blocking(move || crate::erpnext::lees_geheim(DIENST, &n))
            .await
            .map_err(|e| e.to_string())??;
        match gevonden {
            Some(s) => s,
            None => {
                let _ = kanaal.send(Gebeurtenis::Fout {
                    melding: format!("no API key stored for {naam}; set one in Settings, AI assistant"),
                });
                return Ok(());
            }
        }
    } else {
        Zeroizing::new(String::new())
    };

    let body = lichaam(&verzoek, &sleutel);
    let adres = if naam == "gemini" {
        format!("{adres}&key={}", url::form_urlencoded::byte_serialize(sleutel.as_bytes()).collect::<String>())
    } else {
        adres
    };
    let koppen = kopregels(&verzoek, &sleutel);
    drop(sleutel);

    let soort = naam.clone();
    tauri::async_runtime::spawn_blocking(move || stuur(&soort, &adres, &koppen, &body, &stop, &kanaal))
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
        // Een uitkomst gaat als user-bericht met een tool_result-blok terug.
        assert_eq!(berichten[2]["role"], "user");
        assert_eq!(berichten[2]["content"][0]["type"], "tool_result");
        assert_eq!(berichten[2]["content"][0]["tool_use_id"], "call_1");
        assert_eq!(body["tools"][0]["input_schema"]["type"], "object");
        // De sleutel hoort niet in het lichaam.
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
        // De argumenten gaan als tekst mee, niet als object.
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
        // Wat Gemini niet kent, gaat eruit.
        assert!(schoon_schema(&json!({"additionalProperties": false, "type": "object"}))
            .get("additionalProperties")
            .is_none());
    }

    #[test]
    fn het_adres_per_aanbieder() {
        assert_eq!(adres(&verzoek("anthropic")).unwrap(), "https://api.example.com/v1/messages");
        assert_eq!(adres(&verzoek("openai")).unwrap(), "https://api.example.com/v1/chat/completions");
        assert!(adres(&verzoek("gemini")).unwrap().contains("/v1beta/models/test-model:streamGenerateContent"));
        // Het is geen https en geen localhost: nee.
        let mut v = verzoek("openai");
        v.endpoint = "http://api.example.com".to_string();
        assert!(adres(&v).is_err());
        // magpie op localhost mag.
        v.endpoint = "http://127.0.0.1:3425".to_string();
        assert_eq!(adres(&v).unwrap(), "http://127.0.0.1:3425/v1/chat/completions");
        // Een onbekende aanbieder bestaat niet.
        assert!(adres(&verzoek("openrouter")).is_err());
    }

    #[test]
    fn de_kopregels_per_aanbieder() {
        let koppen = kopregels(&verzoek("anthropic"), "s3cret");
        assert!(koppen.iter().any(|(k, v)| k == "x-api-key" && v == "s3cret"));
        assert!(koppen.iter().any(|(k, _)| k == "anthropic-version"));
        let koppen = kopregels(&verzoek("openai"), "s3cret");
        assert!(koppen.iter().any(|(k, v)| k == "authorization" && v == "Bearer s3cret"));
        // Zonder sleutel (magpie) gaat er geen lege header mee.
        let koppen = kopregels(&verzoek("openai"), "");
        assert!(!koppen.iter().any(|(k, _)| k == "authorization"));
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
        // Regels zonder data (lege regels, event:) leveren niets op.
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
