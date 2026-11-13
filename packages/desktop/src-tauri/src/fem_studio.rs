//! Open FEM Studio, headless in CalcSheet: de commando's voor de webview.
//!
//! Het proces en het protocol staan in de crate `ocss-fem-brug` (`fem-brug/`),
//! die zonder Tauri te toetsen is. Hier staat alleen waar de server staat en wat
//! de webview kan vragen (`rekenen/femStudio.ts`).
//!
//! Waar de server staat, in deze volgorde:
//!   1. `OCSS_FEM_SERVER` (een eigen gebouwde server proberen);
//!   2. de resource `fem-studio/openaec-mcp-server(.exe)`, die een release meelevert;
//!   3. alleen in een debug-build: een geïnstalleerde FEM Studio, tot de server
//!      meegeleverd wordt (FEM Studio #298).

use std::path::PathBuf;

use serde::Serialize;
use serde_json::{json, Value};
use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

pub use ocss_fem_brug::FemStudio;
use ocss_fem_brug::{geinstalleerd, uit_omgeving, SERVER_NAAM, TIJD_START};

fn vind_server(app: &AppHandle) -> Result<PathBuf, String> {
    if let Some(pad) = uit_omgeving() {
        return pad;
    }
    if let Ok(pad) = app.path().resolve(format!("fem-studio/{SERVER_NAAM}"), BaseDirectory::Resource) {
        if pad.is_file() {
            return Ok(pad);
        }
    }
    if cfg!(debug_assertions) {
        if let Some(pad) = geinstalleerd().into_iter().find(|p| p.is_file()) {
            return Ok(pad);
        }
    }
    Err("FEM Studio is niet meegeleverd in deze versie van CalcSheet.".to_owned())
}

/// `code` zegt de webview welke vertaalde melding past: `nietMeegeleverd` (geen
/// server gevonden) of `startMislukt`; `reden` is de technische toelichting.
#[derive(Serialize)]
pub struct FemStatus {
    beschikbaar: bool,
    versie: Option<String>,
    pad: Option<String>,
    /// De sha256 van het programma, voor de herkomst van een antwoord.
    sha256: Option<String>,
    code: Option<&'static str>,
    reden: Option<String>,
}

/// Of FEM Studio er is, met zijn versie; start het proces als dat nodig is.
#[tauri::command]
pub async fn fem_studio_status(app: AppHandle) -> Result<FemStatus, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let staat = app.state::<FemStudio>();
        let uitkomst = match vind_server(&app) {
            Err(reden) => Err(("nietMeegeleverd", reden)),
            Ok(pad) => staat.proces_via(move || Ok(pad)).map_err(|reden| ("startMislukt", reden)),
        };
        match uitkomst {
            Ok(p) => FemStatus {
                beschikbaar: true,
                versie: Some(p.versie().to_owned()),
                pad: Some(p.pad().display().to_string()),
                sha256: p.sha256(),
                code: None,
                reden: None,
            },
            Err((code, reden)) => FemStatus { beschikbaar: false, versie: None, pad: None, sha256: None, code: Some(code), reden: Some(reden) },
        }
    })
    .await
    .map_err(|e| e.to_string())
}

/// De licentie van de meegeleverde server en de weg naar zijn broncode, uit de
/// bestanden die naast hem in de resources staan (`fem-studio/`). De server valt
/// onder de AGPL-3.0; `versie.json` noemt het bronarchief van precies die versie.
#[derive(Serialize)]
pub struct FemLicentie {
    /// De versie waar het bronarchief bij hoort.
    versie: Option<String>,
    /// De naam van het bronarchief en het adres waar het staat.
    bron: Option<String>,
    adres: Option<String>,
    /// De licentietekst en de vermeldingen van derden naast de server, als ze er zijn.
    licentie: Option<String>,
    vermeldingen: Option<String>,
}

/// Wat Instellingen › Over over de licentie van FEM Studio toont. Start niets.
#[tauri::command]
pub fn fem_studio_licentie(app: AppHandle) -> FemLicentie {
    let map = app.path().resolve("fem-studio", BaseDirectory::Resource).ok();
    let bestand = |naam: &str| {
        map.as_ref()
            .map(|m| m.join(naam))
            .filter(|p| p.is_file())
            .map(|p| p.display().to_string())
    };
    let versie: Option<Value> = map
        .as_ref()
        .and_then(|m| std::fs::read_to_string(m.join("versie.json")).ok())
        .and_then(|tekst| serde_json::from_str(&tekst).ok());
    let tekst = |pad: &[&str]| {
        let mut v = versie.as_ref()?;
        for sleutel in pad {
            v = v.get(sleutel)?;
        }
        v.as_str().map(str::to_owned)
    };
    FemLicentie {
        versie: tekst(&["versie"]),
        bron: tekst(&["bron", "naam"]),
        // Alleen een https-adres gaat naar de webview: die opent het in de browser.
        adres: tekst(&["bron", "url"]).filter(|u| u.starts_with("https://")),
        licentie: bestand("LICENSE-AGPL-3.0.txt"),
        vermeldingen: bestand("THIRD-PARTY-NOTICES.txt"),
    }
}

/// De tools met hun schema's (`tools/list`).
#[tauri::command]
pub async fn fem_studio_tools(app: AppHandle) -> Result<Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let proces = app.state::<FemStudio>().proces_via(|| vind_server(&app))?;
        proces.roep("tools/list", json!({}), TIJD_START)
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Eén toets of opzoeking (`tools/call`); alleen de reken- en opzoektools mogen.
/// Een fout is `{melding, gestructureerd?}`.
#[tauri::command]
pub async fn fem_studio_aanroep(app: AppHandle, tool: String, argumenten: Value) -> Result<Value, Value> {
    tauri::async_runtime::spawn_blocking(move || {
        let proces = app
            .state::<FemStudio>()
            .proces_via(|| vind_server(&app))
            .map_err(|m| json!({ "melding": m }))?;
        proces.tool(&tool, argumenten)
    })
    .await
    .map_err(|e| json!({ "melding": e.to_string() }))?
}
