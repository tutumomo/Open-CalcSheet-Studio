//! Command-line interface: `--version`, `--help`, `--headless` en de
//! eenmalige opdrachten `eval` en `render`.
//!
//! Waarom dit bestaat: de app startte altijd een venster en negeerde elk
//! argument, dus een agent of CI kon hem niet aansturen en `--version` bleef
//! hangen (zie `docs/tw/OCSS接入實作計畫.md`, P0-1).
//!
//! Ontwerpkeuze: `--headless` maakt het venster **onsichtbaar** in plaats van
//! een tweede, hoofdloze implementatie van de 49 tools te bouwen. De webview
//! blijft het werk doen, dus de API en de MCP-brug gedragen zich precies als in
//! de gewone app (zelfde registry, zelfde token, zelfde poort). `eval` en
//! `render` lopen langs dezelfde weg: de TypeScript-laag voert ze uit en stuurt
//! de uitvoer terug via `cli_klaar`.
//!
//! Wat hier gebeurt is dus alleen: argumenten lezen, en de uitvoer van `--help`
//! en `--version` meteen printen zodat de app niet hoeft te starten.

use std::ffi::OsString;

/// Wat de app moet doen.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Opdracht {
    /// Gewoon de app met venster.
    Venster,
    /// `--headless` of `serve`: API en MCP-brug aan, geen venster.
    Hoofd,
    /// `--version`: versie en editie printen en stoppen.
    Versie,
    /// `--help`: het gebruik printen en stoppen.
    Help,
    /// `eval <bestand|->`: één keer rekenen en het resultaat printen.
    Eval {
        /// Pad naar de rekentekst, of `-` voor stdin.
        bron: String,
    },
    /// `render <bestand>`: een rekenblad naar PDF (of JSON) schrijven.
    Render {
        /// Pad naar de rekentekst.
        bron: String,
        /// Uitvoerpad voor de PDF; `None` betekent: alleen JSON naar stdout.
        pdf: Option<String>,
    },
}

impl Opdracht {
    /// Draait deze opdracht zonder venster? `--version` en `--help` komen hier
    /// nooit aan: die printen en stoppen vóór er een venster is.
    pub fn zonder_venster(&self) -> bool {
        matches!(self, Opdracht::Hoofd | Opdracht::Eval { .. } | Opdracht::Render { .. })
    }

    /// De opdracht als JSON voor de TypeScript-laag (`cli_opdracht`).
    ///
    /// `null` betekent: gewoon de app met venster. De frontend leest dit bij het
    /// opstarten; bij `headless`, `eval` en `render` toont hij geen venster.
    pub fn als_json(&self) -> serde_json::Value {
        match self {
            Opdracht::Venster => serde_json::Value::Null,
            Opdracht::Hoofd => serde_json::json!({ "command": "headless" }),
            Opdracht::Versie => serde_json::json!({ "command": "version" }),
            Opdracht::Help => serde_json::json!({ "command": "help" }),
            Opdracht::Eval { bron } => serde_json::json!({ "command": "eval", "source": bron }),
            Opdracht::Render { bron, pdf } => serde_json::json!({ "command": "render", "source": bron, "pdf": pdf }),
        }
    }
}

/// Leest de argumenten (zonder de programmanaam).
///
/// Onbekende argumenten geven `Help`: liever het gebruik tonen dan stil een
/// venster openen waar de aanroeper niets aan heeft.
pub fn parse<I: IntoIterator<Item = OsString>>(args: I) -> Opdracht {
    let lijst: Vec<String> = args.into_iter().map(|a| a.to_string_lossy().into_owned()).collect();
    let mut hoofd = false;
    let mut i = 0;
    while i < lijst.len() {
        let arg = lijst[i].as_str();
        match arg {
            "--version" | "-V" | "version" => return Opdracht::Versie,
            "--help" | "-h" | "help" => return Opdracht::Help,
            "--headless" | "serve" | "--serve" => {
                hoofd = true;
                i += 1;
            }
            "eval" => {
                let Some(bron) = lijst.get(i + 1).cloned() else { return Opdracht::Help };
                // `--json` is de standaarduitvoer; de vlag mag er staan maar
                // verandert niets. Onbekende vlaggen erachter negeren we niet:
                // dan liever het gebruik.
                if let Some(rest) = lijst.get(i + 2) {
                    if !is_vlag(rest) {
                        return Opdracht::Help;
                    }
                }
                return Opdracht::Eval { bron };
            }
            "render" => {
                let Some(bron) = lijst.get(i + 1).cloned() else { return Opdracht::Help };
                let mut pdf = None;
                let mut j = i + 2;
                while j < lijst.len() {
                    match lijst[j].as_str() {
                        "--pdf" => {
                            let Some(pad) = lijst.get(j + 1).cloned() else { return Opdracht::Help };
                            pdf = Some(pad);
                            j += 2;
                        }
                        vlag if is_vlag(vlag) => j += 1,
                        _ => return Opdracht::Help,
                    }
                }
                return Opdracht::Render { bron, pdf };
            }
            vlag if vlag.starts_with('-') && vlag != "-" => {
                // Onbekende vlag (ook de bekende maar hier niet geldige): het
                // gebruik tonen. Liever dat dan stil een venster openen.
                return Opdracht::Help;
            }
            _ => {
                // Een los pad (dubbelklik op een projectbestand) houdt het
                // gedrag van `startbestand`: gewoon de app met venster.
                i += 1;
            }
        }
    }
    if hoofd {
        Opdracht::Hoofd
    } else {
        Opdracht::Venster
    }
}

fn is_vlag(arg: &str) -> bool {
    matches!(arg, "--json" | "-j" | "--quiet" | "-q")
}

/// De tekst van `--version`: één regel, met editie en tag erbij zodat tw.4 en
/// tw.5 uit elkaar te houden zijn.
pub fn versie_tekst() -> String {
    format!(
        "{} {} (editie {}, commit {}, gebouwd {})",
        "Open CalcSheet Studio TW",
        crate::kenmerken::TAG,
        crate::kenmerken::EDITIE,
        crate::kenmerken::COMMIT,
        crate::kenmerken::BOUWDATUM,
    )
}

/// De tekst van `--help`.
pub fn help_tekst() -> String {
    format!(
        "{naam} {tag}

Gebruik:
  open-calcsheet-studio [project.ifccalculation]   de app met venster
  open-calcsheet-studio --headless                 API en MCP-brug, zonder venster
  open-calcsheet-studio eval <bestand|->           rekentekst één keer doorrekenen (JSON op stdout)
  open-calcsheet-studio render <bestand> --pdf <uit.pdf>
                                                   rekenblad naar PDF schrijven
  open-calcsheet-studio --version                  versie, editie en commit
  open-calcsheet-studio --help                     deze tekst

De API luistert op 127.0.0.1 (standaardpoort 3879) en vraagt het Bearer-token
uit Instellingen › API en AI-assistent. `GET /api/v1/health` antwoordt zonder
token met de editie en de versie. Zie docs/api.md en docs/mcp.md.",
        naam = "Open CalcSheet Studio TW",
        tag = crate::kenmerken::TAG,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn p(args: &[&str]) -> Opdracht {
        parse(args.iter().map(OsString::from))
    }

    #[test]
    fn zonder_argumenten_gewoon_het_venster() {
        assert_eq!(p(&[]), Opdracht::Venster);
    }

    #[test]
    fn versie_en_help_stoppen_meteen() {
        assert_eq!(p(&["--version"]), Opdracht::Versie);
        assert_eq!(p(&["-V"]), Opdracht::Versie);
        assert_eq!(p(&["--help"]), Opdracht::Help);
        assert_eq!(p(&["-h"]), Opdracht::Help);
        // Ook tussen andere argumenten: nooit een venster openen.
        assert_eq!(p(&["--headless", "--version"]), Opdracht::Versie);
    }

    #[test]
    fn hoofdmodus_herkent_beide_schrijfwijzen() {
        assert_eq!(p(&["--headless"]), Opdracht::Hoofd);
        assert_eq!(p(&["serve"]), Opdracht::Hoofd);
        assert_eq!(p(&["--serve"]), Opdracht::Hoofd);
        assert!(Opdracht::Hoofd.zonder_venster());
        assert!(!Opdracht::Venster.zonder_venster());
    }

    #[test]
    fn eval_neemt_een_bron() {
        assert_eq!(p(&["eval", "blad.ifccalculation"]), Opdracht::Eval { bron: "blad.ifccalculation".into() });
        assert_eq!(p(&["eval", "-"]), Opdracht::Eval { bron: "-".into() });
        assert_eq!(p(&["eval", "blad.ifccalculation", "--json"]), Opdracht::Eval { bron: "blad.ifccalculation".into() });
        // Zonder bron: het gebruik, geen venster.
        assert_eq!(p(&["eval"]), Opdracht::Help);
        // Een tweede pad is geen vlag: het gebruik.
        assert_eq!(p(&["eval", "a.txt", "b.txt"]), Opdracht::Help);
    }

    #[test]
    fn render_neemt_optioneel_een_pdf() {
        assert_eq!(p(&["render", "blad.txt", "--pdf", "uit.pdf"]), Opdracht::Render { bron: "blad.txt".into(), pdf: Some("uit.pdf".into()) });
        assert_eq!(p(&["render", "blad.txt"]), Opdracht::Render { bron: "blad.txt".into(), pdf: None });
        assert_eq!(p(&["render", "blad.txt", "--pdf"]), Opdracht::Help);
        assert_eq!(p(&["render"]), Opdracht::Help);
    }

    #[test]
    fn onbekende_vlag_toont_het_gebruik() {
        assert_eq!(p(&["--bestaatniet"]), Opdracht::Help);
        // Een onbekende vlag achter `eval` is geen vlag die we kennen: het gebruik.
        assert_eq!(p(&["eval", "blad.txt", "--bestaatniet"]), Opdracht::Help);
    }

    #[test]
    fn een_los_pad_blijft_een_dubbelklik() {
        assert_eq!(p(&["project.ifccalculation"]), Opdracht::Venster);
    }

    #[test]
    fn de_json_voor_de_frontend_klopt() {
        let w = Opdracht::Render { bron: "a.txt".into(), pdf: Some("b.pdf".into()) }.als_json();
        assert_eq!(w["command"], "render");
        assert_eq!(w["source"], "a.txt");
        assert_eq!(w["pdf"], "b.pdf");
        // Het venster is de standaard; de hoofdmodus zegt het expliciet.
        assert!(Opdracht::Venster.als_json().is_null());
        assert_eq!(Opdracht::Hoofd.als_json()["command"], "headless");
    }

    #[test]
    fn versie_en_help_noemen_de_tag() {
        let v = versie_tekst();
        assert!(v.contains(crate::kenmerken::TAG), "versietekst mist de tag: {v}");
        assert!(v.contains(crate::kenmerken::EDITIE), "versietekst mist de editie: {v}");
        let h = help_tekst();
        for woord in ["--headless", "eval", "render", "--pdf", "--version", "--help"] {
            assert!(h.contains(woord), "helptekst mist {woord}");
        }
    }
}
