//! Tauri-schil van Open CalcSheet Studio.
//!
//! De PDF-commando's hieronder gebruiken de OpenAEC-rapportengine
//! (`openaec-core`). Die is **optioneel**: standaard wordt hij niet meegebouwd,
//! zodat dit project op zichzelf te bouwen is zonder zusterrepo. Zonder de
//! `rapportengine`-feature bestaan de commando's nog wel — ze geven dan een
//! nette foutmelding in plaats van dat de aanroep in het niets valt.
//!
//! Afdrukken loopt in de app zelf via de browser
//! (`src/components/calc/PrintDocument.tsx`); die weg neemt ook de tekeningen
//! mee, wat de rapportengine niet doet. Zie `docs/backlog.md`. Het rapport kan
//! op die weg ook zonder printdialoog naar een bestand (`rapport_pdf`).
//!
//! De MCP-brug (`mcp_bridge`) is het lokale doorgeefluik voor een
//! AI-assistent; zie `docs/mcp.md`.
//!
//! De ERPNext-koppeling (`erpnext`) haalt de locatie van een project op; het
//! API-geheim staat in de sleutelbos van het besturingssysteem.

// De AI-assistent in de app: het gesprek met de modelaanbieder (src/ai.rs).
mod ai;
// Command-line: --version, --help, --headless, eval, render (src/cli.rs).
mod cli;
mod erpnext;
mod fem_studio;
mod jupyter_omgeving;
// Buildkenmerken (editie, tag, commit, bouwdatum): zie src/kenmerken.rs.
mod kenmerken;
mod mcp_bridge;
mod rapport_pdf;

#[cfg(feature = "rapportengine")]
mod rapport {
    /// Genereer een PDF met de openaec-core engine.
    ///
    /// Verwacht JSON die overeenkomt met het `ReportData`-schema van
    /// openaec-core (template, project, sections, ...) en geeft de bytes terug.
    pub fn genereer(report: serde_json::Value) -> Result<Vec<u8>, String> {
        let report_data: openaec_core::ReportData = serde_json::from_value(report)
            .map_err(|e| format!("Invalid ReportData JSON: {}", e))?;
        openaec_core::generate_pdf_bytes(&report_data)
            .map_err(|e| format!("PDF engine failed: {}", e))
    }
}

#[cfg(not(feature = "rapportengine"))]
mod rapport {
    pub fn genereer(_report: serde_json::Value) -> Result<Vec<u8>, String> {
        Err("Deze build bevat de OpenAEC-rapportengine niet. Bouw met \
             `--features rapportengine`, of gebruik Afdrukken (Ctrl+P) — die weg \
             neemt ook de tekeningen mee."
            .to_string())
    }
}

/// Genereer een PDF en geef de bytes terug.
#[tauri::command]
fn engine_generate_pdf(report: serde_json::Value) -> Result<Vec<u8>, String> {
    rapport::genereer(report)
}

/// Genereer een PDF en schrijf hem naar `path`. Geeft het aantal bytes terug.
#[tauri::command]
fn engine_save_pdf(report: serde_json::Value, path: String) -> Result<usize, String> {
    let bytes = rapport::genereer(report)?;
    std::fs::write(&path, &bytes)
        .map_err(|e| format!("Failed to write PDF to {}: {}", path, e))?;
    Ok(bytes.len())
}

/// Genereer een PDF in de tijdelijke map en geef het absolute pad terug.
/// Bedoeld voor de voorbeeldweergave in de app: de frontend wikkelt het pad met
/// `convertFileSrc()` en laadt het in een <iframe>.
///
/// De bestandsnaam draagt een tijdstempel, zodat twee voorbeelden elkaar niet
/// overschrijven.
#[tauri::command]
fn engine_preview_pdf(report: serde_json::Value) -> Result<String, String> {
    let bytes = rapport::genereer(report)?;
    let dir = std::env::temp_dir().join("open-calcsheet-studio");
    std::fs::create_dir_all(&dir).map_err(|e| format!("Failed to create temp dir: {}", e))?;
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let path = dir.join(format!("preview-{}.pdf", ts));
    std::fs::write(&path, &bytes).map_err(|e| format!("Failed to write preview PDF: {}", e))?;
    Ok(path.to_string_lossy().into_owned())
}

/// Het projectbestand waarmee de app is gestart. Een dubbelklik in de
/// Verkenner geeft via de bestandskoppeling het pad mee als argument.
/// De opdracht waarmee de app is gestart. De frontend leest hem bij het
/// opstarten: bij `headless`, `eval` en `render` komt er geen venster.
struct CliState(cli::Opdracht);

/// Wat de frontend moet doen: `null` (gewoon de app), `{"command":"headless"}`,
/// of een eenmalige opdracht (`eval`／`render`) met de bron erbij.
#[tauri::command]
fn cli_opdracht(state: tauri::State<'_, CliState>) -> serde_json::Value {
    state.0.als_json()
}

/// Het einde van een eenmalige opdracht: de uitvoer naar stdout en stoppen met
/// die exitcode. De frontend roept dit als laatste aan, zodat `eval` en `render`
/// in een script bruikbaar zijn (`&&`, `$(…)`).
#[tauri::command]
fn cli_klaar(tekst: String, code: i32) {
    use std::io::Write;
    let mut uit = std::io::stdout();
    let _ = uit.write_all(tekst.as_bytes());
    if !tekst.ends_with('\n') {
        let _ = uit.write_all(b"\n");
    }
    let _ = uit.flush();
    std::process::exit(code);
}

/// De kenmerken van deze build (editie, volledige tag, commit, bouwdatum).
///
/// De frontend zet ze in `app_info`; de MCP-brug gebruikt dezelfde module voor
/// `GET /api/v1/health`, zodat elk antwoord dezelfde waarden meldt.
#[tauri::command]
fn app_kenmerken() -> serde_json::Value {
    kenmerken::als_json()
}

/// Het projectbestand waarmee de app is gestart. Een dubbelklik in de
/// Verkenner geeft via de bestandskoppeling het pad mee als argument.
#[tauri::command]
fn startbestand() -> Option<String> {
    std::env::args_os().skip(1).find_map(|arg| {
        let pad = std::path::PathBuf::from(arg);
        let ext = pad.extension()?.to_str()?.to_ascii_lowercase();
        let bekend = matches!(ext.as_str(), "ifccalculation" | "ifc-calculation" | "cpd" | "cpdz");
        (bekend && pad.is_file()).then(|| pad.to_string_lossy().into_owned())
    })
}

/// Het hoofdvenster blijft op de app zelf: een link in de uitwerking mag het
/// niet wegsturen, want op een andere pagina is de hele app weg.
///
/// Alleen op Windows, omdat WebView2 hier alleen navigatie van het hoofdvenster
/// meldt en een `@iframe` dus gewoon blijft werken. Op de andere platformen is
/// dat niet getest.
#[cfg(windows)]
fn navigatie_bewaker() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("navigatie")
        .on_navigation(|_, url| match url.scheme() {
            "tauri" | "about" | "blob" | "data" => true,
            "http" | "https" => matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "tauri.localhost")),
            _ => false,
        })
        .build()
}

/// Haalt WebRTC weg uit elk document van de app, ook uit een frame dat een script
/// zelf maakt. De app gebruikt het zelf niet.
///
/// WebRTC gaat buiten de CSP om, naar elke host: een `@js`-blok met `netwerk=` kan in een
/// eigen srcdoc script van die host laden, en daar is WebRTC er weer. In WebView2 houdt
/// `webrtc 'block'` in de CSP dat niet tegen. De startvlag
/// `--force-webrtc-ip-handling-policy` ook niet, en de voorkeur `webrtc.ip_handling_policy`
/// alleen UDP: TURN over TCP blijft werken. De API moet dus weg, en dat kan alleen met een
/// script dat in elk document als eerste draait. Heeft dat hier niet gedraaid, dan start
/// een blok niet (jsLooptijd.js). Gemeten op Windows met scripts/proef-js-webrtc.mjs; op
/// de andere platformen is dat niet getest.
fn geen_webrtc() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("geen-webrtc")
        .js_init_script_on_all_frames(include_str!("geen_webrtc.js"))
        .build()
}

/// Zet voorspellende verbindingen in WebView2 uit, vóór het venster start.
///
/// Chromium opent al een verbinding voordat `frame-src` een navigatie weigert.
/// Een `@js`-blok zou zo een waarde in de hostnaam via DNS en TCP naar buiten
/// kunnen sturen, ook al komt er geen verzoek aan. De voorkeuren staan in de
/// map die WebView2 voor deze app gebruikt. Lukt dit niet, dan start de app
/// gewoon; een onleesbaar bestand blijft onaangeraakt.
#[cfg(windows)]
fn geen_voorspellende_verbindingen(identifier: &str) {
    let Some(basis) = std::env::var_os("LOCALAPPDATA") else { return };
    let map = std::path::PathBuf::from(basis).join(identifier).join("EBWebView").join("Default");
    let pad = map.join("Preferences");
    let mut voorkeuren = match std::fs::read_to_string(&pad) {
        Ok(tekst) => match serde_json::from_str::<serde_json::Value>(&tekst) {
            Ok(waarde) if waarde.is_object() => waarde,
            _ => return,
        },
        Err(fout) if fout.kind() == std::io::ErrorKind::NotFound => serde_json::json!({}),
        Err(_) => return,
    };
    if voorkeuren.pointer("/net/network_prediction_options").and_then(|w| w.as_i64()) == Some(2) {
        return;
    }
    let Some(alles) = voorkeuren.as_object_mut() else { return };
    let net = alles.entry("net").or_insert_with(|| serde_json::json!({}));
    if !net.is_object() {
        *net = serde_json::json!({});
    }
    net["network_prediction_options"] = serde_json::json!(2);

    if std::fs::create_dir_all(&map).is_err() {
        return;
    }
    let tijdelijk = map.join("Preferences.tmp");
    if std::fs::write(&tijdelijk, voorkeuren.to_string()).is_ok() {
        let _ = std::fs::rename(&tijdelijk, &pad);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // `--version` en `--help` printen en stoppen vóór er ook maar een venster,
    // webview of bridge bestaat: anders bleef de app hangen (P0-1).
    let opdracht = cli::parse(std::env::args_os().skip(1));
    match &opdracht {
        cli::Opdracht::Versie => {
            println!("{}", cli::versie_tekst());
            return;
        }
        cli::Opdracht::Help => {
            println!("{}", cli::help_tekst());
            return;
        }
        _ => {}
    }
    let context = tauri::generate_context!();
    #[cfg(windows)]
    geen_voorspellende_verbindingen(&context.config().identifier);
    let bouwer = tauri::Builder::default();
    #[cfg(windows)]
    let bouwer = bouwer.plugin(navigatie_bewaker());
    bouwer
        .plugin(geen_webrtc())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        // MCP-brug: één actieve brug of geen. Starten en stoppen doet de
        // frontend (src/mcp/brug.ts) met de twee commando's hieronder.
        // De opdracht van de command line, zodat de frontend weet of er een
        // venster moet komen en of er iets eenmaligs te doen is.
        .manage(CliState(opdracht))
        .manage(mcp_bridge::BridgeState::default())
        // De server van de Jupyter-bladen; start bij het eerste blad.
        .manage(jupyter_omgeving::JupyterOmgeving::default())
        // De server van Open FEM Studio voor de toetsing; start bij de eerste aanroep.
        .manage(fem_studio::FemStudio::default())
        // De stopknop van de AI-zijbalk.
        .manage(ai::AiState::default())
        .invoke_handler(tauri::generate_handler![
            engine_generate_pdf,
            engine_save_pdf,
            engine_preview_pdf,
            startbestand,
            app_kenmerken,
            cli_opdracht,
            cli_klaar,
            rapport_pdf::rapport_pdf_beschikbaar,
            rapport_pdf::rapport_pdf_schrijven,
            mcp_bridge::mcp_bridge_start,
            mcp_bridge::mcp_bridge_stop,
            jupyter_omgeving::jupyter_omgeving_start,
            erpnext::erpnext_zet_geheim,
            erpnext::erpnext_heeft_geheim,
            erpnext::erpnext_project_veld,
            fem_studio::fem_studio_status,
            fem_studio::fem_studio_licentie,
            fem_studio::fem_studio_tools,
            fem_studio::fem_studio_aanroep,
            ai::ai_zet_sleutel,
            ai::ai_heeft_sleutel,
            ai::ai_vraag,
            ai::ai_stop,
        ])
        .build(context)
        .expect("error while building tauri application")
        .run(|app, event| {
            // Het kindproces van FEM Studio gaat mee dicht.
            if let tauri::RunEvent::Exit = event {
                tauri::Manager::state::<fem_studio::FemStudio>(app).stop();
            }
        });
}
