//! Kenmerken van deze build: editie, volledige tag, commit en bouwdatum.
//!
//! De waarden komen van `build.rs` (`cargo:rustc-env`). Ze zijn nodig omdat de
//! Taiwan-versie en de upstream-versie hetzelfde versienummer dragen: zonder
//! editie en tag is een draaiende app of een `app_info`-antwoord niet te
//! herleiden tot een release (zie `docs/tw/OCSS接入實作計畫.md`, P0-3).
//!
//! Deze module is de enige plek waar die waarden vandaan komen: de Tauri-command
//! `app_kenmerken` geeft ze aan de TypeScript-laag, en de MCP-brug zet ze in het
//! antwoord van `GET /api/v1/health`. Zo melden REST, MCP en de app hetzelfde.

/// `tw`, `upstream` of `unknown`.
pub const EDITIE: &str = env!("OCSS_EDITION");
/// Volledige release-tag, bijvoorbeeld `2026.46.1-tw.1`.
pub const TAG: &str = env!("OCSS_BUILD_TAG");
/// Korte commit-hash van de build, of `unknown`.
pub const COMMIT: &str = env!("OCSS_GIT_COMMIT");
/// Bouwdatum (ISO), of `unknown`.
pub const BOUWDATUM: &str = env!("OCSS_BUILD_DATE");
/// Het versienummer uit `Cargo.toml` (zonder editie-achtervoegsel).
pub const VERSIE: &str = env!("CARGO_PKG_VERSION");

/// De kenmerken als JSON-object, met dezelfde sleutels in elk antwoord.
pub fn als_json() -> serde_json::Value {
    serde_json::json!({
        "edition": EDITIE,
        "version": VERSIE,
        "tag": TAG,
        "commit": COMMIT,
        "buildDate": BOUWDATUM,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn elke_waarde_is_gevuld() {
        for (naam, waarde) in [
            ("edition", EDITIE),
            ("version", VERSIE),
            ("tag", TAG),
            ("commit", COMMIT),
            ("buildDate", BOUWDATUM),
        ] {
            assert!(!waarde.trim().is_empty(), "{naam} is leeg");
        }
    }

    #[test]
    fn de_tag_begint_met_de_versie() {
        // `<versie>-<editie>` of `<versie>-tw.N`: de tag moet met het
        // versienummer beginnen, anders is hij niet aan de release te koppelen.
        assert!(TAG.starts_with(VERSIE), "tag {TAG} begint niet met {VERSIE}");
    }

    #[test]
    fn json_heeft_alle_sleutels() {
        let w = als_json();
        for sleutel in ["edition", "version", "tag", "commit", "buildDate"] {
            assert!(w.get(sleutel).is_some(), "{sleutel} ontbreekt");
        }
    }
}
