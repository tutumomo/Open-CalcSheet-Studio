//! Open FEM Studio, headless in CalcSheet: het proces en het protocol.
//!
//! De normtoetsingen komen uit één bron: de server van Open FEM Studio
//! (`openaec-mcp-server`). CalcSheet levert hem mee als resource
//! (`fem-studio/`) en start hem bij de eerste aanroep als kindproces. Ze praten
//! MCP over stdin/stdout: één JSON-RPC-bericht per regel (`initialize`,
//! `notifications/initialized`, `tools/list`, `tools/call`). Er is geen poort en
//! geen sleutel.
//!
//! De server handelt elk verzoek als eigen taak af, dus de antwoorden komen niet
//! op volgorde terug. Een leesdraad koppelt ze op id aan het verzoek dat erop
//! wacht. Stopt het proces, dan krijgt elke wachtende aanroep een fout, en de
//! volgende aanroep start het opnieuw (`FemStudio::proces_via`).
//!
//! Alleen reken- en opzoektools mogen (`toegestaan`): nooit de tools die de app
//! van FEM Studio aansturen of bestanden lezen of schrijven.
//!
//! Deze crate kent Tauri niet; de app (`src/fem_studio.rs`) zoekt de server en
//! maakt de commando's. Zie
//! docs/superpowers/specs/2026-11-07-toetsing-via-fem-studio-design.md.

use std::collections::HashMap;
use std::io::{BufRead, BufReader, Write};
use std::path::{Path, PathBuf};
use std::process::{Child, ChildStdin, Command, Stdio};
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::mpsc::{channel, RecvTimeoutError, Sender};
use std::sync::{Arc, Mutex, OnceLock};
use std::time::Duration;

use serde_json::{json, Value};

/// De MCP-versie die de server spreekt.
pub const PROTOCOL: &str = "2025-06-18";
/// De naam van de server, in `fem-studio/` van de resources.
pub const SERVER_NAAM: &str = if cfg!(windows) { "openaec-mcp-server.exe" } else { "openaec-mcp-server" };
/// Starten en de lijst met tools: snel, of er is iets mis.
pub const TIJD_START: Duration = Duration::from_secs(30);
/// Eén toets; een model met tweede orde kan even duren.
pub const TIJD_AANROEP: Duration = Duration::from_secs(300);
/// De melding als het proces weg is.
pub const GESTOPT: &str = "FEM Studio is gestopt.";

type Antwoord = Result<Value, String>;
type Wachtend = Arc<Mutex<HashMap<u64, Sender<Antwoord>>>>;

// ── Het protocol ─────────────────────────────────────────────────────────────

/// Eén verzoek als regel, met de afsluitende regelovergang.
pub fn verzoek_regel(id: u64, methode: &str, params: Value) -> String {
    let mut regel = json!({ "jsonrpc": "2.0", "id": id, "method": methode, "params": params }).to_string();
    regel.push('\n');
    regel
}

fn notificatie_regel(methode: &str) -> String {
    let mut regel = json!({ "jsonrpc": "2.0", "method": methode }).to_string();
    regel.push('\n');
    regel
}

/// Een antwoord met zijn id. Een notificatie of een onleesbare regel geeft `None`;
/// een JSON-RPC-fout geeft `Err` met de melding.
pub fn lees_regel(regel: &str) -> Option<(u64, Antwoord)> {
    let v: Value = serde_json::from_str(regel.trim()).ok()?;
    let id = v.get("id")?.as_u64()?;
    if let Some(fout) = v.get("error") {
        let melding = fout.get("message").and_then(Value::as_str).unwrap_or("onbekende fout");
        return Some((id, Err(melding.to_owned())));
    }
    Some((id, Ok(v.get("result").cloned().unwrap_or(Value::Null))))
}

/// De uitkomst van een `tools/call`: `structuredContent`, of anders de tekst als
/// JSON. Bij `isError` een fout met de melding (zonder "Error: ") en de
/// gestructureerde fout van de server.
pub fn toolresultaat(resultaat: Value) -> Result<Value, Value> {
    let tekst = resultaat.pointer("/content/0/text").and_then(Value::as_str).unwrap_or("");
    if resultaat.get("isError").and_then(Value::as_bool) == Some(true) {
        let melding = tekst.strip_prefix("Error: ").unwrap_or(tekst);
        return Err(json!({
            "melding": melding,
            "gestructureerd": resultaat.get("structuredContent").cloned().unwrap_or(Value::Null),
        }));
    }
    match resultaat.get("structuredContent") {
        Some(s) if !s.is_null() => Ok(s.clone()),
        _ => serde_json::from_str(tekst)
            .map_err(|_| json!({ "melding": format!("Onleesbaar antwoord van FEM Studio: {tekst}") })),
    }
}

/// Wat de app niet mag aanroepen: de app van FEM Studio sturen (`gui_*`, `app_*`,
/// `extensions_*`), het project of het model in de app bijhouden (`project_*`,
/// `model3d_*`), en bestanden lezen of schrijven (`load_*`, `generate_*` en de
/// drie IFC-tools). Dezelfde lijst als de webview (`TOETS_UITGESLOTEN` in
/// packages/core/src/toetsBlok.ts); scripts/check-fem-model.mjs vergelijkt ze.
pub const UITGESLOTEN_VOORVOEGSELS: [&str; 7] = ["gui_", "app_", "project_", "model3d_", "extensions_", "load_", "generate_"];
pub const UITGESLOTEN_NAMEN: [&str; 3] = ["open_fem_3d_ifc_importeren", "fem_resultaten_ifc_schrijven", "fem_resultaten_ifc_lezen"];

/// Alle rekentools uit `tools/list` mogen, ook een die er later bij komt
/// (`solve_open_fem_3d`, `solve_native_fem`, `check_*`, `concrete_*`, …); alleen
/// wat in de uitsluitlijsten staat niet.
pub fn toegestaan(tool: &str) -> bool {
    let naam_klopt = tool.chars().next().is_some_and(|c| c.is_ascii_lowercase())
        && tool.chars().all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '_');
    naam_klopt && !UITGESLOTEN_VOORVOEGSELS.iter().any(|v| tool.starts_with(v)) && !UITGESLOTEN_NAMEN.contains(&tool)
}

/// Argumenten die naar een bestand wijzen, gaan niet mee: een toets krijgt zijn
/// model in het verzoek zelf (dezelfde regel als de clouddienst van FEM Studio).
pub fn argumenten_toegestaan(argumenten: &Value) -> bool {
    const PADEN: [&str; 8] = ["path", "project_path", "project", "pad", "output_path", "uitvoerpad", "save_as", "projectbestand"];
    match argumenten.as_object() {
        Some(velden) => !velden.keys().any(|k| PADEN.contains(&k.as_str())),
        None => argumenten.is_null(),
    }
}

/// Leest antwoorden tot het einde van de stroom en geeft elk aan wie erop wacht.
/// Aan het einde krijgt elke wachtende `GESTOPT`.
fn lees_lus(lezer: impl BufRead, wachtend: &Wachtend) {
    for regel in lezer.lines() {
        let Ok(regel) = regel else { break };
        if let Some((id, antwoord)) = lees_regel(&regel) {
            if let Some(zender) = wachtend.lock().unwrap().remove(&id) {
                let _ = zender.send(antwoord);
            }
        }
    }
    for (_, zender) in wachtend.lock().unwrap().drain() {
        let _ = zender.send(Err(GESTOPT.to_owned()));
    }
}

// ── Het proces ───────────────────────────────────────────────────────────────

/// De sha256 van een bestand, in hex.
pub fn sha256_van(pad: &Path) -> std::io::Result<String> {
    use sha2::{Digest, Sha256};
    use std::io::Read;
    let mut bestand = std::fs::File::open(pad)?;
    let mut hasher = Sha256::new();
    let mut buf = vec![0u8; 1 << 16];
    loop {
        let n = bestand.read(&mut buf)?;
        if n == 0 {
            break;
        }
        hasher.update(&buf[..n]);
    }
    Ok(hasher.finalize().iter().map(|b| format!("{b:02x}")).collect())
}

/// Eén draaiende server.
pub struct Proces {
    kind: Mutex<Child>,
    invoer: Mutex<ChildStdin>,
    wachtend: Wachtend,
    volgende: AtomicU64,
    levend: Arc<AtomicBool>,
    versie: String,
    pad: PathBuf,
    sha256: OnceLock<Option<String>>,
}

impl Proces {
    /// Start de server en doet `initialize`.
    pub fn start(pad: &Path) -> Result<Self, String> {
        let mut opdracht = Command::new(pad);
        opdracht.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::null());
        #[cfg(windows)]
        {
            use std::os::windows::process::CommandExt;
            // CREATE_NO_WINDOW: geen consolevenster naast de app.
            opdracht.creation_flags(0x0800_0000);
        }
        let mut kind = opdracht
            .spawn()
            .map_err(|e| format!("FEM Studio kon niet starten ({}): {e}", pad.display()))?;
        let uit = kind.stdout.take().ok_or("FEM Studio heeft geen uitvoer.")?;
        let invoer = kind.stdin.take().ok_or("FEM Studio heeft geen invoer.")?;
        let wachtend: Wachtend = Arc::default();
        let levend = Arc::new(AtomicBool::new(true));
        {
            let wachtend = wachtend.clone();
            let levend = levend.clone();
            std::thread::spawn(move || {
                lees_lus(BufReader::new(uit), &wachtend);
                levend.store(false, Ordering::SeqCst);
                // Wie zich tussen het einde van de stroom en hierboven aanmeldde.
                for (_, zender) in wachtend.lock().unwrap().drain() {
                    let _ = zender.send(Err(GESTOPT.to_owned()));
                }
            });
        }
        let mut proces = Proces {
            kind: Mutex::new(kind),
            invoer: Mutex::new(invoer),
            wachtend,
            volgende: AtomicU64::new(0),
            levend,
            versie: String::new(),
            pad: pad.to_path_buf(),
            sha256: OnceLock::new(),
        };
        let start = proces.roep(
            "initialize",
            json!({
                "protocolVersion": PROTOCOL,
                "capabilities": {},
                "clientInfo": { "name": "open-calcsheet-studio", "version": env!("CARGO_PKG_VERSION") },
            }),
            TIJD_START,
        )?;
        proces.versie = start.pointer("/serverInfo/version").and_then(Value::as_str).unwrap_or("").to_owned();
        proces.schrijf(&notificatie_regel("notifications/initialized"))?;
        Ok(proces)
    }

    /// De versie van de server (`serverInfo.version`).
    pub fn versie(&self) -> &str {
        &self.versie
    }

    /// Waar de server staat.
    pub fn pad(&self) -> &Path {
        &self.pad
    }

    /// De sha256 van het programma, in hex: de herkomst van een antwoord. Eén keer
    /// uitgerekend, bij de eerste vraag; `None` als het bestand niet te lezen is.
    pub fn sha256(&self) -> Option<String> {
        self.sha256.get_or_init(|| sha256_van(&self.pad).ok()).clone()
    }

    /// Of het proces nog loopt; na het einde van zijn uitvoer niet meer.
    pub fn levend(&self) -> bool {
        self.levend.load(Ordering::SeqCst)
    }

    fn schrijf(&self, regel: &str) -> Result<(), String> {
        let mut invoer = self.invoer.lock().unwrap();
        invoer
            .write_all(regel.as_bytes())
            .and_then(|_| invoer.flush())
            .map_err(|_| GESTOPT.to_owned())
    }

    /// Eén JSON-RPC-verzoek; wacht hoogstens `tijd` op het antwoord.
    pub fn roep(&self, methode: &str, params: Value, tijd: Duration) -> Result<Value, String> {
        if !self.levend() {
            return Err(GESTOPT.to_owned());
        }
        let id = self.volgende.fetch_add(1, Ordering::SeqCst) + 1;
        let (zender, ontvanger) = channel();
        self.wachtend.lock().unwrap().insert(id, zender);
        if !self.levend() {
            self.wachtend.lock().unwrap().remove(&id);
            return Err(GESTOPT.to_owned());
        }
        if let Err(e) = self.schrijf(&verzoek_regel(id, methode, params)) {
            self.wachtend.lock().unwrap().remove(&id);
            return Err(e);
        }
        match ontvanger.recv_timeout(tijd) {
            Ok(antwoord) => antwoord,
            Err(RecvTimeoutError::Timeout) => {
                self.wachtend.lock().unwrap().remove(&id);
                Err(format!("FEM Studio gaf binnen {} s geen antwoord.", tijd.as_secs()))
            }
            Err(RecvTimeoutError::Disconnected) => Err(GESTOPT.to_owned()),
        }
    }

    /// Eén toets of opzoeking: de tool moet mogen, de argumenten mogen niet naar
    /// een bestand wijzen. Een fout is `{melding, gestructureerd?}`.
    pub fn tool(&self, tool: &str, argumenten: Value) -> Result<Value, Value> {
        if !toegestaan(tool) {
            return Err(json!({ "melding": format!("De tool \"{tool}\" van FEM Studio is in CalcSheet niet toegestaan.") }));
        }
        if !argumenten_toegestaan(&argumenten) {
            return Err(json!({ "melding": "Een toets krijgt zijn model in het verzoek, niet als pad naar een bestand." }));
        }
        let resultaat = self
            .roep("tools/call", json!({ "name": tool, "arguments": argumenten }), TIJD_AANROEP)
            .map_err(|m| json!({ "melding": m }))?;
        toolresultaat(resultaat)
    }

    /// Stopt het proces; de leesdraad ziet dan het einde van de stroom.
    pub fn stop(&self) {
        let mut kind = self.kind.lock().unwrap();
        let _ = kind.kill();
        let _ = kind.wait();
    }
}

impl Drop for Proces {
    fn drop(&mut self) {
        self.stop();
    }
}

// ── Eén proces of geen ───────────────────────────────────────────────────────

/// De staat in de app: één proces of geen; het start bij de eerste aanroep.
#[derive(Default)]
pub struct FemStudio {
    proces: Mutex<Option<Arc<Proces>>>,
}

impl FemStudio {
    /// Het lopende proces, of een nieuw als er geen is of als het gestopt is.
    /// `vind` zoekt de server alleen als er een nieuw proces nodig is.
    pub fn proces_via(&self, vind: impl FnOnce() -> Result<PathBuf, String>) -> Result<Arc<Proces>, String> {
        let mut slot = self.proces.lock().unwrap();
        if let Some(p) = slot.as_ref() {
            if p.levend() {
                return Ok(p.clone());
            }
        }
        if let Some(oud) = slot.take() {
            oud.stop();
        }
        let proces = Arc::new(Proces::start(&vind()?)?);
        *slot = Some(proces.clone());
        Ok(proces)
    }

    /// Bij het afsluiten van de app.
    pub fn stop(&self) {
        if let Some(p) = self.proces.lock().unwrap().take() {
            p.stop();
        }
    }
}

// ── Waar de server staat, buiten de resources ────────────────────────────────

/// `OCSS_FEM_SERVER`, of een pad dat er niet is: dan een fout, geen stille terugval.
pub fn uit_omgeving() -> Option<Result<PathBuf, String>> {
    let pad = PathBuf::from(std::env::var_os("OCSS_FEM_SERVER")?);
    Some(if pad.is_file() {
        Ok(pad)
    } else {
        Err(format!("OCSS_FEM_SERVER wijst naar {}, maar daar staat geen bestand.", pad.display()))
    })
}

/// Waar een geïnstalleerde FEM Studio zijn server neerzet. De app gebruikt dit
/// alleen in een debug-build, tot de server meegeleverd wordt (FEM Studio #298).
pub fn geinstalleerd() -> Vec<PathBuf> {
    let mut paden = Vec::new();
    #[cfg(windows)]
    {
        for var in ["LOCALAPPDATA", "ProgramFiles"] {
            if let Some(basis) = std::env::var_os(var) {
                paden.push(PathBuf::from(basis).join("Open FEM Studio").join(SERVER_NAAM));
            }
        }
    }
    #[cfg(target_os = "macos")]
    paden.push(PathBuf::from("/Applications/Open FEM Studio.app/Contents/MacOS").join(SERVER_NAAM));
    #[cfg(target_os = "linux")]
    paden.push(PathBuf::from("/usr/bin").join(SERVER_NAAM));
    paden
}

// ── Toetsen ─────────────────────────────────────────────────────────────────

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Cursor;

    #[test]
    fn sha256_van_een_bestand() {
        let pad = std::env::temp_dir().join(format!("ocss-fem-brug-sha-{}", std::process::id()));
        std::fs::write(&pad, b"abc").unwrap();
        let hex = sha256_van(&pad).unwrap();
        std::fs::remove_file(&pad).ok();
        assert_eq!(hex, "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
        assert!(sha256_van(Path::new("bestaat-niet")).is_err());
    }

    #[test]
    fn verzoek_regel_is_een_regel() {
        let regel = verzoek_regel(7, "tools/call", json!({ "name": "x" }));
        assert!(regel.ends_with('\n'));
        assert_eq!(regel.matches('\n').count(), 1);
        let v: Value = serde_json::from_str(regel.trim()).unwrap();
        assert_eq!(v, json!({ "jsonrpc": "2.0", "id": 7, "method": "tools/call", "params": { "name": "x" } }));
    }

    #[test]
    fn notificatie_wordt_overgeslagen() {
        assert!(lees_regel(r#"{"jsonrpc":"2.0","method":"notifications/x"}"#).is_none());
        assert!(lees_regel("geen json").is_none());
    }

    #[test]
    fn rpc_fout_wordt_err() {
        let (id, antwoord) =
            lees_regel(r#"{"jsonrpc":"2.0","id":3,"error":{"code":-32601,"message":"Method not found: x"}}"#).unwrap();
        assert_eq!(id, 3);
        assert!(antwoord.unwrap_err().contains("Method not found"));
    }

    #[test]
    fn structured_content_gaat_voor() {
        let met = json!({ "content": [{ "type": "text", "text": "{\"a\":1}" }], "isError": false, "structuredContent": { "a": 2 } });
        assert_eq!(toolresultaat(met).unwrap(), json!({ "a": 2 }));
        let zonder = json!({ "content": [{ "type": "text", "text": "{\"a\":1}" }], "isError": false });
        assert_eq!(toolresultaat(zonder).unwrap(), json!({ "a": 1 }));
    }

    #[test]
    fn fout_uit_toolresultaat() {
        let fout = json!({
            "content": [{ "type": "text", "text": "Error: profiel onbekend" }],
            "isError": true,
            "structuredContent": { "error_code": "X" },
        });
        let e = toolresultaat(fout).unwrap_err();
        assert_eq!(e["melding"], "profiel onbekend");
        assert_eq!(e["gestructureerd"]["error_code"], "X");
    }

    #[test]
    fn alleen_toegestane_tools() {
        for ja in [
            "check_steel_beam", "list_steel_grades", "compute_section_properties", "concrete_mn_kappa", "check_fem_model", "portaal_maken",
            "solve_open_fem_3d", "solve_native_fem", "solve_frame3d", "solve_fem_model", "validate_fem_model", "fem_solver_status",
            "open_fem_3d_staalhal_maken", "een_nieuwe_rekentool",
        ] {
            assert!(toegestaan(ja), "{ja} hoort toegestaan te zijn");
        }
        for nee in [
            "gui_quit", "app_project_save", "project_new", "model3d_get", "load_fem_project", "open_fem_3d_ifc_importeren", "generate_steel_report_pdf",
            "fem_resultaten_ifc_schrijven", "fem_resultaten_ifc_lezen", "extensions_list", "project_import", "gui_nieuw", "", "Check_x", "check x",
        ] {
            assert!(!toegestaan(nee), "{nee} hoort geweigerd te worden");
        }
        assert!(!argumenten_toegestaan(&json!({ "uitvoerpad": "C:/x.ifc" })));
        assert!(argumenten_toegestaan(&json!({ "model": {} })));
        assert!(argumenten_toegestaan(&Value::Null));
        assert!(!argumenten_toegestaan(&json!({ "project_path": "C:/x.ifcfem" })));
        assert!(!argumenten_toegestaan(&json!("tekst")));
    }

    #[test]
    fn antwoorden_op_id_gekoppeld() {
        let wachtend: Wachtend = Arc::default();
        let (z1, o1) = channel();
        let (z2, o2) = channel();
        let (z3, o3) = channel();
        wachtend.lock().unwrap().extend([(1, z1), (2, z2), (3, z3)]);
        let stroom = concat!(
            r#"{"jsonrpc":"2.0","id":2,"result":{"b":2}}"#, "\n",
            r#"{"jsonrpc":"2.0","method":"notifications/x"}"#, "\n",
            r#"{"jsonrpc":"2.0","id":1,"result":{"a":1}}"#, "\n",
        );
        lees_lus(Cursor::new(stroom), &wachtend);
        assert_eq!(o1.recv().unwrap().unwrap(), json!({ "a": 1 }));
        assert_eq!(o2.recv().unwrap().unwrap(), json!({ "b": 2 }));
        // Id 3 kreeg geen antwoord: aan het einde van de stroom een fout.
        assert_eq!(o3.recv().unwrap().unwrap_err(), GESTOPT);
        assert!(wachtend.lock().unwrap().is_empty());
    }

    #[test]
    fn server_die_er_niet_is() {
        let fout = Proces::start(Path::new("bestaat-niet/openaec-mcp-server")).err().unwrap();
        assert!(fout.contains("kon niet starten"), "{fout}");
    }

    /// De echte server: `OCSS_FEM_SERVER` of de geïnstalleerde FEM Studio.
    /// `cargo test -- --ignored`
    fn echte() -> PathBuf {
        uit_omgeving()
            .map(|p| p.unwrap())
            .or_else(|| geinstalleerd().into_iter().find(|p| p.is_file()))
            .expect("geen FEM Studio: zet OCSS_FEM_SERVER of installeer Open FEM Studio")
    }

    #[test]
    #[ignore]
    fn echte_server() {
        let proces = Proces::start(&echte()).unwrap();
        assert!(!proces.versie().is_empty());
        assert_eq!(proces.sha256().map(|h| h.len()), Some(64));
        let lijst = proces.roep("tools/list", json!({}), TIJD_START).unwrap();
        let namen: Vec<&str> = lijst["tools"].as_array().unwrap().iter().filter_map(|t| t["name"].as_str()).collect();
        assert!(namen.contains(&"check_steel_beam"), "geen check_steel_beam: verkeerde editie?");
        assert!(proces.tool("list_steel_grades", json!({})).is_ok());
        assert!(proces.tool("check_steel_beam", json!({})).is_err());
        assert!(proces.tool("gui_quit", json!({})).is_err());
    }

    #[test]
    #[ignore]
    fn echte_staaltoets() {
        // HEA 200, S235, 4 m, alleen M_y = 50 kNm over de hele staaf, kipsteunen
        // aan beide einden: een UC tussen 0 en 1, met een maatgevende toets.
        let proces = Proces::start(&echte()).unwrap();
        let krachten = |x: f64| json!({ "combination_id": 1, "position_mm": x, "forces": { "n_ed": 0.0, "vy_ed": 0.0, "vz_ed": 0.0, "mt_ed": 0.0, "my_ed": 50.0, "mz_ed": 0.0 } });
        let uit = proces
            .tool(
                "check_steel_beam",
                json!({
                    "beam_id": 1, "profile_name": "HEA200", "steel_grade": "S235", "length_m": 4.0,
                    "forces_envelope": [krachten(0.0), krachten(2000.0), krachten(4000.0)],
                    "lateral_bracing": { "top_flange_positions": [0.0, 0.5, 1.0], "bottom_flange_positions": [0.0, 0.5, 1.0] },
                    "deflection_limit_class": "Roof", "deflection_limit_numerator": 250,
                    "deflection_actual_max_mm": 0.0, "is_cantilever": false, "consequence_class": "CC2",
                }),
            )
            .unwrap();
        let uc = uit["uc_max"].as_f64().expect("uc_max");
        assert!(uc > 0.0 && uc < 1.0, "uc_max = {uc}");
        assert!(uit["checks"].as_array().map_or(false, |c| !c.is_empty()));
    }

    #[test]
    #[ignore]
    fn echte_plaat() {
        // Het kleine plaatmodel van de controle van het @fem-blok
        // (scripts/fixtures/fem/klein-ruw.json): 2 × 2 m op vier veren, 25 knopen.
        let pad = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../../scripts/fixtures/fem/klein-ruw.json");
        let fixture: Value = serde_json::from_str(&std::fs::read_to_string(pad).unwrap()).unwrap();
        let proces = Proces::start(&echte()).unwrap();
        let uit = proces.tool("solve_open_fem_3d", fixture["argumenten"].clone()).unwrap();
        assert_eq!(uit["displacements"].as_array().map(Vec::len), Some(25));
        let som: f64 = uit["reactions"].as_array().unwrap().iter().filter_map(|r| r["fz"].as_f64()).sum();
        assert!((som - 40.0).abs() < 1e-6, "ΣR = {som}, de last is 10 kN/m² op 4 m²");
    }

    #[test]
    #[ignore]
    fn herstart_na_gestopt_proces() {
        let pad = echte();
        let fem = FemStudio::default();
        let eerste = fem.proces_via(|| Ok(pad.clone())).unwrap();
        eerste.stop();
        // De leesdraad ziet het einde van de stroom.
        for _ in 0..50 {
            if !eerste.levend() {
                break;
            }
            std::thread::sleep(Duration::from_millis(100));
        }
        assert!(eerste.roep("tools/list", json!({}), TIJD_START).is_err());
        let tweede = fem.proces_via(|| Ok(pad.clone())).unwrap();
        assert!(!Arc::ptr_eq(&eerste, &tweede));
        assert!(tweede.roep("tools/list", json!({}), TIJD_START).is_ok());
    }
}
