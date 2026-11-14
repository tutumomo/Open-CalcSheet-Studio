//! Bouwstap: naast `tauri_build` schrijft deze stap een paar kenmerken in het
//! binary, zodat de app (en de API) kan vertellen **welke** build er draait.
//!
//! Aanleiding: de Taiwan-versie en de upstream-versie delen dezelfde
//! versienummers (`2026.46.1`), dus zonder deze kenmerken is een `app_info`-
//! antwoord niet te herleiden tot een release (zie
//! `docs/tw/OCSS接入實作計畫.md`, P0-3).
//!
//! De waarden komen uit de omgeving bij het bouwen, met een redelijke
//! terugvalwaarde zodat een gewone `cargo build` op een ontwikkelmachine ook
//! iets zinnigs meldt:
//!
//! | variabele | betekenis | terugval |
//! |---|---|---|
//! | `OCSS_EDITION` | `tw` of `upstream` | afgeleid uit de `identifier` in `tauri.conf.json` |
//! | `OCSS_BUILD_TAG` | volledige release-tag, bijvoorbeeld `2026.46.1-tw.1` | `<versie>-<editie>` |
//! | `OCSS_BUILD_DATE` | bouwdatum (ISO, `JJJJ-MM-DD`) | datum van de laatste commit |
//! | `OCSS_GIT_COMMIT` | korte commit-hash | `git rev-parse --short HEAD`, anders `unknown` |
//!
//! Alle vier worden met `cargo:rustc-env` doorgegeven en in `lib.rs` met
//! `env!` gelezen.

use std::path::Path;
use std::process::Command;

fn main() {
    let manifest = std::env::var("CARGO_MANIFEST_DIR").unwrap_or_else(|_| ".".to_string());
    let config = Path::new(&manifest).join("tauri.conf.json");
    // De kenmerken hangen van deze twee bestanden af: wijzigt de versie of de
    // identifier, dan moet de stap opnieuw lopen.
    println!("cargo:rerun-if-changed={}", config.display());
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=OCSS_EDITION");
    println!("cargo:rerun-if-env-changed=OCSS_BUILD_TAG");
    println!("cargo:rerun-if-env-changed=OCSS_BUILD_DATE");
    println!("cargo:rerun-if-env-changed=OCSS_GIT_COMMIT");

    let versie = std::env::var("CARGO_PKG_VERSION").unwrap_or_else(|_| "0.0.0".to_string());
    let editie = std::env::var("OCSS_EDITION")
        .ok()
        .filter(|w| !w.trim().is_empty())
        .unwrap_or_else(|| editie_uit_config(&config));

    let tag = std::env::var("OCSS_BUILD_TAG")
        .ok()
        .filter(|w| !w.trim().is_empty())
        .unwrap_or_else(|| format!("{}-{}", versie, editie));

    let commit = std::env::var("OCSS_GIT_COMMIT")
        .ok()
        .filter(|w| !w.trim().is_empty())
        .or_else(|| git(&manifest, &["rev-parse", "--short", "HEAD"]))
        .unwrap_or_else(|| "unknown".to_string());

    let datum = std::env::var("OCSS_BUILD_DATE")
        .ok()
        .filter(|w| !w.trim().is_empty())
        .or_else(|| git(&manifest, &["log", "-1", "--format=%cs"]))
        .unwrap_or_else(|| "unknown".to_string());

    println!("cargo:rustc-env=OCSS_EDITION={}", editie);
    println!("cargo:rustc-env=OCSS_BUILD_TAG={}", tag);
    println!("cargo:rustc-env=OCSS_GIT_COMMIT={}", commit);
    println!("cargo:rustc-env=OCSS_BUILD_DATE={}", datum);

    tauri_build::build()
}

/// `tw` als de identifier met `tw.` begint, anders `upstream`. Zo hoeft de
/// release-workflow niets extra's mee te geven: de fork heeft een eigen
/// identifier (`tw.opencalcsheet.studio`), upstream niet.
fn editie_uit_config(config: &Path) -> String {
    let tekst = std::fs::read_to_string(config).unwrap_or_default();
    match serde_json::from_str::<serde_json::Value>(&tekst) {
        Ok(waarde) => {
            let id = waarde.get("identifier").and_then(|w| w.as_str()).unwrap_or("");
            if id.starts_with("tw.") {
                "tw".to_string()
            } else {
                "upstream".to_string()
            }
        }
        // Onleesbare config: de build faalt later vanzelf in tauri_build; hier
        // geen eigen fout, want dat zou de melding alleen maar verwarren.
        Err(_) => "unknown".to_string(),
    }
}

fn git(map: &str, args: &[&str]) -> Option<String> {
    let uit = Command::new("git").args(args).current_dir(map).output().ok()?;
    if !uit.status.success() {
        return None;
    }
    let tekst = String::from_utf8_lossy(&uit.stdout).trim().to_string();
    (!tekst.is_empty()).then_some(tekst)
}
