//! De koppeling met ERPNext: de tekst van één veld van een project ophalen.
//!
//! De frontend kan ERPNext niet zelf vragen: de webview houdt zo'n verzoek naar een ander
//! domein tegen (CORS). Daarom gaat het via Rust (`erpnext_project_veld`).
//!
//! - Het adres, de API-sleutel en de naam van het veld staan in de instellingen van de app
//!   (`src/tauri/erpnext.ts`).
//! - Het API-geheim staat alleen in de sleutelbos van het besturingssysteem, onder de
//!   dienst [`DIENST`], **per herkomst**: schema, host en poort van het adres
//!   ([`herkomst`]). Een geheim dat voor de ene ERPNext is bewaard, gaat dus nooit naar een
//!   andere host, ook niet als het adres in de instellingen verandert.
//! - Het geheim gaat nooit terug naar de frontend en komt in geen foutmelding of log: het
//!   gaat alleen als header naar de herkomst waarvoor het bewaard is. Dat adres moet
//!   `https://` zijn; `http://localhost` mag, om te testen.
//! - Elk commando toetst eerst het adres, en raakt pas daarna de sleutelbos aan.
//!
//! De fouten hier zijn technisch en onvertaald: de leesbare zin eromheen komt uit de
//! vertalingen van de frontend.

use std::fmt::Write as _;
use std::time::Duration;

use zeroize::Zeroizing;

/// De dienst in de sleutelbos. De gebruiker bij die dienst is de herkomst van het adres.
const DIENST: &str = "open-calcsheet-studio-erpnext";
/// Hoe lang een verzoek mag duren, verbinden en lezen samen (zie [`vraag`]).
const TIJDSLIMIET: Duration = Duration::from_secs(15);

/// Bewaar het API-geheim voor de ERPNext op `adres` in de sleutelbos; een leeg geheim
/// wist het. Het geheim hoort bij de herkomst van het adres, niet bij het hele adres.
#[tauri::command]
pub async fn erpnext_zet_geheim(adres: String, geheim: String) -> Result<(), String> {
    let geheim = Zeroizing::new(geheim);
    los(move || bewaar_geheim(DIENST, &herkomst(&adres)?, &geheim)).await
}

/// Staat er een API-geheim in de sleutelbos voor de herkomst van `adres`? Het geheim zelf
/// komt niet mee. Een ongeldig adres: nee, zonder de sleutelbos aan te raken.
#[tauri::command]
pub async fn erpnext_heeft_geheim(adres: String) -> bool {
    los(move || Ok(lees_geheim(DIENST, &herkomst(&adres)?)?.is_some()))
        .await
        .unwrap_or(false)
}

/// De tekst van `data.{veld}` van project `project` in de ERPNext op `adres`; "" als het
/// veld leeg is of niet bestaat. Een fout van de server komt terug als "HTTP 404 …".
/// Zonder geheim voor de herkomst van `adres` gaat er geen verzoek uit.
#[tauri::command]
pub async fn erpnext_project_veld(
    adres: String,
    sleutel: String,
    project: String,
    veld: String,
) -> Result<String, String> {
    los(move || vraag_veld(DIENST, &adres, &sleutel, &project, &veld)).await
}

/// Doe `werk` op een eigen thread, buiten de hoofdthread: de sleutelbos kan om
/// toestemming vragen en een verzoek kan lang duren (zie [`vraag`]). Het venster blijft
/// dan bruikbaar.
async fn los<T: Send + 'static>(
    werk: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(werk).await.map_err(|e| e.to_string())?
}

/// Het adres van de installatie, getoetst: alleen `https://` met een host, of
/// `http://localhost` om te testen; zonder gebruikersnaam of wachtwoord erin. De fout
/// noemt het adres niet: daar kan een wachtwoord in staan.
fn toegestaan_adres(adres: &str) -> Result<url::Url, String> {
    let fout = || "the ERPNext address must start with https:// (or http://localhost for testing)".to_string();
    let basis = url::Url::parse(adres.trim()).map_err(|_| fout())?;
    let toegestaan = match basis.scheme() {
        "https" => basis.host_str().is_some_and(|h| !h.is_empty()),
        "http" => basis.host_str() == Some("localhost"),
        _ => false,
    };
    if !toegestaan || !basis.username().is_empty() || basis.password().is_some() {
        return Err(fout());
    }
    Ok(basis)
}

/// De herkomst van een toegestaan adres: schema, host en poort, zoals
/// `https://erp.voorbeeld.nl` of `http://localhost:8000`. Pad, zoekvraag en een
/// standaardpoort tellen niet mee. Dit is de gebruiker in de sleutelbos.
pub fn herkomst(adres: &str) -> Result<String, String> {
    Ok(toegestaan_adres(adres)?.origin().ascii_serialization())
}

/// De ingang in de sleutelbos voor `herkomst`. `dienst` is altijd [`DIENST`], behalve in
/// de proef.
pub(crate) fn sleutelbos(dienst: &str, herkomst: &str) -> Result<keyring::Entry, String> {
    keyring::Entry::new(dienst, herkomst).map_err(|e| format!("keychain: {e}"))
}

/// Het geheim voor `herkomst` uit de sleutelbos, of `None` als er geen is. Het wordt
/// gewist zodra het uit beeld gaat.
pub(crate) fn lees_geheim(dienst: &str, herkomst: &str) -> Result<Option<Zeroizing<String>>, String> {
    match sleutelbos(dienst, herkomst)?.get_password() {
        Ok(geheim) => Ok(Some(Zeroizing::new(geheim))),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(format!("keychain: {e}")),
    }
}

pub(crate) fn bewaar_geheim(dienst: &str, herkomst: &str, geheim: &str) -> Result<(), String> {
    let geheim = geheim.trim();
    if !geheim.is_empty() && !header_veilig(geheim) {
        return Err("the API secret contains characters that cannot be sent".to_string());
    }
    let ingang = sleutelbos(dienst, herkomst)?;
    if geheim.is_empty() {
        return match ingang.delete_credential() {
            Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
            Err(e) => Err(format!("keychain: {e}")),
        };
    }
    ingang.set_password(geheim).map_err(|e| format!("keychain: {e}"))
}

/// Mag deze tekst in de header? Een sleutel en een geheim van ERPNext zijn letters en
/// cijfers. Alles buiten zichtbare ASCII weigeren we hier, zodat ureq nooit een fout maakt
/// over een ongeldige header: die fout bevat de hele regel, en dus het geheim.
fn header_veilig(tekst: &str) -> bool {
    !tekst.is_empty() && tekst.bytes().all(|b| b.is_ascii_graphic())
}

fn vraag_veld(dienst: &str, adres: &str, sleutel: &str, project: &str, veld: &str) -> Result<String, String> {
    // Eerst het adres: zonder een toegestaan adres wordt het geheim niet eens gelezen.
    let url = project_url(adres, project)?;
    let herkomst = herkomst(adres)?;
    let veld = veld.trim();
    if veld.is_empty() {
        return Err("no field name".to_string());
    }
    let sleutel = sleutel.trim();
    if !header_veilig(sleutel) {
        return Err("the API key is empty or contains characters that cannot be sent".to_string());
    }
    // Alleen het geheim van deze herkomst: een andere host krijgt niets, en dan gaat er
    // ook geen verzoek uit.
    let geheim = lees_geheim(dienst, &herkomst)?.ok_or("no API secret in the keychain")?;
    vraag(&url, sleutel, &geheim, veld)
}

/// Het verzoek zelf, met het geheim al uit de sleutelbos.
///
/// De tijdslimiet van 15 s geldt voor het hele verzoek, maar begrenst een trage
/// DNS-opzoeking niet: ureq 2 kan die niet onderbreken. Het venster hangt dan toch niet,
/// want de commando's draaien via [`los`] op een eigen thread.
///
/// De header met het geheim staat in een [`Zeroizing`] en wordt na het verzoek gewist.
/// ureq maakt er intern nog een kopie van voor de verzending; die valt buiten ons bereik.
fn vraag(url: &str, sleutel: &str, geheim: &str, veld: &str) -> Result<String, String> {
    if !header_veilig(sleutel) {
        return Err("the API key is empty or contains characters that cannot be sent".to_string());
    }
    if !header_veilig(geheim) {
        return Err("the API secret contains characters that cannot be sent".to_string());
    }
    // Vooraf de juiste ruimte, zodat er bij het opbouwen geen kopie achterblijft.
    let mut kop = Zeroizing::new(String::with_capacity(6 + sleutel.len() + 1 + geheim.len()));
    kop.push_str("token ");
    kop.push_str(sleutel);
    kop.push(':');
    kop.push_str(geheim);

    // Geen omleidingen volgen: de header met het geheim gaat alleen naar dit adres.
    let agent = ureq::AgentBuilder::new()
        .timeout(TIJDSLIMIET)
        .redirects(0)
        .user_agent(concat!("open-calcsheet-studio/", env!("CARGO_PKG_VERSION")))
        .build();
    let antwoord = agent
        .get(url)
        .set("Accept", "application/json")
        .set("Authorization", &kop)
        .call();
    drop(kop);
    let antwoord = match antwoord {
        Ok(a) => a,
        Err(ureq::Error::Status(code, a)) => return Err(status_fout(code, a.status_text())),
        // Kan door header_veilig niet, maar deze fout noemt de header: nooit doorgeven.
        Err(ureq::Error::Transport(t)) if t.kind() == ureq::ErrorKind::BadHeader => {
            return Err("the API key or secret cannot be sent".to_string())
        }
        Err(ureq::Error::Transport(t)) => return Err(t.to_string()),
    };
    // Een omleiding (3xx) of een ander antwoord zonder inhoud telt als fout.
    if antwoord.status() != 200 {
        return Err(status_fout(antwoord.status(), antwoord.status_text()));
    }
    let tekst = antwoord.into_string().map_err(|e| format!("{url}: {e}"))?;
    veld_uit_antwoord(&tekst, veld)
}

fn status_fout(code: u16, tekst: &str) -> String {
    format!("HTTP {code} {tekst}").trim_end().to_string()
}

/// Het adres van het project `project` in ERPNext:
/// `{adres}/api/resource/Project/{project}`, met de projectnaam URL-gecodeerd.
///
/// Weigert een adres dat niet `https://` is of `http://localhost` (om te testen), en een
/// adres met een gebruikersnaam of wachtwoord erin. Een zoekvraag of anker in het adres
/// valt weg. De fout noemt het adres niet: daar kan een wachtwoord in staan.
pub fn project_url(adres: &str, project: &str) -> Result<String, String> {
    let mut basis = toegestaan_adres(adres)?;
    basis.set_query(None);
    basis.set_fragment(None);

    let project = project.trim();
    if project.is_empty() || project == "." || project == ".." {
        return Err(format!("not a project name: {project:?}"));
    }
    Ok(format!(
        "{}/api/resource/Project/{}",
        basis.as_str().trim_end_matches('/'),
        padstuk(project)
    ))
}

/// Codeer `tekst` als één stuk van een pad: alles behalve letters, cijfers en `-._~`
/// wordt `%XX`, ook een `/`.
fn padstuk(tekst: &str) -> String {
    let mut uit = String::with_capacity(tekst.len());
    for b in tekst.bytes() {
        if b.is_ascii_alphanumeric() || matches!(b, b'-' | b'.' | b'_' | b'~') {
            uit.push(b as char);
        } else {
            let _ = write!(uit, "%{b:02X}");
        }
    }
    uit
}

/// De tekst van `data.{veld}` uit het antwoord van ERPNext op `GET /api/resource/…`.
///
/// Een ontbrekend of leeg veld geeft "". Een getal of ja/nee komt als tekst terug. Geen
/// JSON, of JSON zonder `data`, is een fout: dan antwoordde iets anders dan ERPNext, zoals
/// een inlogpagina.
pub fn veld_uit_antwoord(json: &str, veld: &str) -> Result<String, String> {
    let waarde: serde_json::Value =
        serde_json::from_str(json).map_err(|e| format!("the answer is not JSON: {e}"))?;
    let data = waarde
        .get("data")
        .and_then(|d| d.as_object())
        .ok_or("the answer has no data")?;
    Ok(match data.get(veld.trim()) {
        None | Some(serde_json::Value::Null) => String::new(),
        Some(serde_json::Value::String(s)) => s.trim().to_string(),
        Some(ander) => ander.to_string(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn erpnext_project_url_codeert_de_projectnaam() {
        assert_eq!(
            project_url("https://erp.voorbeeld.nl", "PRJ-0001/A").unwrap(),
            "https://erp.voorbeeld.nl/api/resource/Project/PRJ-0001%2FA"
        );
    }

    #[test]
    fn erpnext_project_url_weigert_ander_schema() {
        assert!(project_url("ftp://x", "PRJ-0001").is_err());
    }

    #[test]
    fn erpnext_veld_uit_antwoord_geeft_de_tekst() {
        assert_eq!(
            veld_uit_antwoord(r#"{"data":{"custom_location":"52.09, 5.12"}}"#, "custom_location").unwrap(),
            "52.09, 5.12"
        );
    }

    #[test]
    fn erpnext_veld_uit_antwoord_ontbrekend_veld_is_leeg() {
        assert_eq!(veld_uit_antwoord(r#"{"data":{"name":"PRJ-0001"}}"#, "custom_location").unwrap(), "");
    }

    #[test]
    fn erpnext_veld_uit_antwoord_zonder_json_is_een_fout() {
        assert!(veld_uit_antwoord("<html>Login</html>", "custom_location").is_err());
    }

    #[test]
    fn erpnext_project_url_localhost_om_te_testen() {
        assert_eq!(
            project_url("http://localhost:8000/", "P 1&2").unwrap(),
            "http://localhost:8000/api/resource/Project/P%201%262"
        );
        assert_eq!(
            project_url("http://LOCALHOST", "P").unwrap(),
            "http://localhost/api/resource/Project/P"
        );
    }

    #[test]
    fn erpnext_project_url_weigert_onveilige_adressen() {
        for adres in [
            "http://erp.voorbeeld.nl",
            "http://localhost.voorbeeld.nl",
            "http://localhost:80@erp.voorbeeld.nl",
            "http://127.0.0.1:8000",
            "https://gebruiker:wachtwoord@erp.voorbeeld.nl",
            "erp.voorbeeld.nl",
            "",
        ] {
            assert!(project_url(adres, "PRJ-0001").is_err(), "{adres}");
        }
    }

    #[test]
    fn erpnext_project_url_fout_noemt_het_adres_niet() {
        let fout = project_url("https://gebruiker:wachtwoord@erp.voorbeeld.nl", "P").unwrap_err();
        assert!(!fout.contains("wachtwoord"), "{fout}");
    }

    #[test]
    fn erpnext_project_url_laat_zoekvraag_weg_en_houdt_het_pad() {
        assert_eq!(
            project_url("https://erp.voorbeeld.nl/?x=1#a", "P").unwrap(),
            "https://erp.voorbeeld.nl/api/resource/Project/P"
        );
        assert_eq!(
            project_url("https://voorbeeld.nl/erp/", "P").unwrap(),
            "https://voorbeeld.nl/erp/api/resource/Project/P"
        );
    }

    #[test]
    fn erpnext_project_url_weigert_lege_projectnaam() {
        for project in ["", "  ", ".", ".."] {
            assert!(project_url("https://erp.voorbeeld.nl", project).is_err(), "{project:?}");
        }
    }

    #[test]
    fn erpnext_padstuk_codeert_alles_behalve_ongereserveerd() {
        assert_eq!(padstuk("Ab-1._~"), "Ab-1._~");
        assert_eq!(padstuk("a/b?c#d%e"), "a%2Fb%3Fc%23d%25e");
        assert_eq!(padstuk("é"), "%C3%A9");
    }

    #[test]
    fn erpnext_veld_uit_antwoord_leeg_getal_en_zonder_data() {
        assert_eq!(veld_uit_antwoord(r#"{"data":{"custom_location":null}}"#, "custom_location").unwrap(), "");
        assert_eq!(veld_uit_antwoord(r#"{"data":{"custom_location":"  "}}"#, "custom_location").unwrap(), "");
        assert_eq!(veld_uit_antwoord(r#"{"data":{"n":12}}"#, "n").unwrap(), "12");
        assert!(veld_uit_antwoord(r#"{"message":"Not found"}"#, "custom_location").is_err());
        assert!(veld_uit_antwoord(r#"{"data":[]}"#, "custom_location").is_err());
    }

    /// Een kleine server op localhost die één verzoek beantwoordt; geeft het adres en de
    /// ontvangen Authorization-header terug (`None` als er binnen 10 s geen verzoek kwam).
    fn proefserver(
        status: u16,
        kop: Option<(&'static str, &'static str)>,
        inhoud: &'static str,
    ) -> (String, std::thread::JoinHandle<Option<String>>) {
        proefserver_wacht(status, kop, inhoud, Duration::from_secs(10))
    }

    fn proefserver_wacht(
        status: u16,
        kop: Option<(&'static str, &'static str)>,
        inhoud: &'static str,
        wacht: Duration,
    ) -> (String, std::thread::JoinHandle<Option<String>>) {
        let server = tiny_http::Server::http("127.0.0.1:0").unwrap();
        let poort = server.server_addr().to_ip().unwrap().port();
        let draad = std::thread::spawn(move || {
            let verzoek = server.recv_timeout(wacht).ok()??;
            let auth = verzoek
                .headers()
                .iter()
                .find(|h| h.field.equiv("Authorization"))
                .map(|h| h.value.to_string());
            let mut antwoord = tiny_http::Response::from_string(inhoud).with_status_code(status);
            if let Some((naam, waarde)) = kop {
                antwoord.add_header(tiny_http::Header::from_bytes(naam, waarde).unwrap());
            }
            let _ = verzoek.respond(antwoord);
            auth
        });
        (format!("http://localhost:{poort}"), draad)
    }

    #[test]
    fn erpnext_vraag_stuurt_de_sleutel_en_leest_het_veld() {
        let (adres, draad) = proefserver(200, None, r#"{"data":{"custom_location":"52.09, 5.12"}}"#);
        let url = project_url(&adres, "PRJ-0001/A").unwrap();
        assert_eq!(vraag(&url, "sleutel1", "geheim2", "custom_location").unwrap(), "52.09, 5.12");
        assert_eq!(draad.join().unwrap().as_deref(), Some("token sleutel1:geheim2"));
    }

    #[test]
    fn erpnext_vraag_meldt_de_http_status_zonder_geheim() {
        let (adres, draad) = proefserver(403, None, r#"{"exc_type":"AuthenticationError"}"#);
        let url = project_url(&adres, "P").unwrap();
        let fout = vraag(&url, "sleutel1", "geheim2", "custom_location").unwrap_err();
        assert!(fout.starts_with("HTTP 403"), "{fout}");
        assert!(!fout.contains("geheim2"), "{fout}");
        draad.join().unwrap();
    }

    #[test]
    fn erpnext_vraag_volgt_geen_omleiding() {
        let (adres, draad) = proefserver(302, Some(("Location", "https://elders.voorbeeld.nl/")), "");
        let url = project_url(&adres, "P").unwrap();
        let fout = vraag(&url, "sleutel1", "geheim2", "custom_location").unwrap_err();
        assert!(fout.starts_with("HTTP 302"), "{fout}");
        draad.join().unwrap();
    }

    #[test]
    fn erpnext_vraag_weigert_een_header_met_regelovergang() {
        // Er gaat niets de deur uit: de toets komt vóór het verzoek.
        let geheim = "g\r\nX-Ander: 1";
        let fout = vraag("http://localhost:9/api/resource/Project/P", "s", geheim, "v").unwrap_err();
        assert!(!fout.contains("X-Ander"), "{fout}");
    }

    /// Bewaart, leest en wist een geheim in de echte sleutelbos, onder een eigen proefdienst
    /// (niet die van de app). Niet in de gewone reeks: op een server zonder sleutelbos of
    /// met een toestemmingsvraag zou hij falen of wachten. Draaien met `--ignored`.
    ///
    /// Toetst ook de binding aan de herkomst: een geheim voor de ene herkomst is er niet voor
    /// een andere, en een verzoek naar een andere host gaat niet uit.
    #[test]
    #[ignore]
    fn erpnext_sleutelbos_bewaart_echt() {
        let proef = "open-calcsheet-studio-erpnext-proef";
        let lees = |h: &str| lees_geheim(proef, h).unwrap().map(|g| g.as_str().to_string());
        let hier = herkomst("https://erp.voorbeeld.nl/app").unwrap();
        let daar = herkomst("https://andere.voorbeeld.nl").unwrap();

        bewaar_geheim(proef, &hier, " proefgeheim ").unwrap();
        assert_eq!(lees(&hier).as_deref(), Some("proefgeheim"));
        assert_eq!(lees(&herkomst("https://erp.voorbeeld.nl:443/").unwrap()).as_deref(), Some("proefgeheim"));
        assert_eq!(lees(&daar), None, "een andere herkomst vindt het geheim niet");
        bewaar_geheim(proef, &hier, "").unwrap();
        assert_eq!(lees(&hier), None);
        bewaar_geheim(proef, &hier, "").unwrap();

        // Het hele verzoek: het geheim van server A gaat naar A, en niet naar server B.
        let (adres_a, draad_a) = proefserver(200, None, r#"{"data":{"custom_location":"52.09, 5.12"}}"#);
        let (adres_b, draad_b) = proefserver_wacht(200, None, r#"{"data":{}}"#, Duration::from_secs(2));
        let herkomst_a = herkomst(&adres_a).unwrap();
        bewaar_geheim(proef, &herkomst_a, "geheimA").unwrap();
        let uit_a = vraag_veld(proef, &adres_a, "sleutel1", "P", "custom_location");
        let uit_b = vraag_veld(proef, &adres_b, "sleutel1", "P", "custom_location");
        bewaar_geheim(proef, &herkomst_a, "").unwrap();
        assert_eq!(uit_a.unwrap(), "52.09, 5.12");
        assert_eq!(draad_a.join().unwrap().as_deref(), Some("token sleutel1:geheimA"));
        let fout_b = uit_b.unwrap_err();
        assert!(fout_b.contains("no API secret"), "{fout_b}");
        assert_eq!(draad_b.join().unwrap(), None, "server B kreeg geen verzoek");
    }

    #[test]
    fn erpnext_herkomst_is_schema_host_en_poort() {
        let h = herkomst("https://erp.voorbeeld.nl").unwrap();
        assert_eq!(h, "https://erp.voorbeeld.nl");
        assert_eq!(herkomst("https://erp.voorbeeld.nl/app").unwrap(), h);
        assert_eq!(herkomst("https://erp.voorbeeld.nl:443").unwrap(), h);
        assert_eq!(herkomst(" HTTPS://ERP.Voorbeeld.nl/?x=1#a ").unwrap(), h);
        assert_ne!(herkomst("https://andere.nl").unwrap(), h);
        assert_ne!(herkomst("https://erp.voorbeeld.nl:8443").unwrap(), h);
        assert_eq!(herkomst("http://localhost:8000/erp").unwrap(), "http://localhost:8000");
    }

    #[test]
    fn erpnext_herkomst_weigert_wat_project_url_weigert() {
        for adres in [
            "ftp://x",
            "http://erp.voorbeeld.nl",
            "http://localhost:80@erp.voorbeeld.nl",
            "https://gebruiker:wachtwoord@erp.voorbeeld.nl",
            "erp.voorbeeld.nl",
            "",
        ] {
            assert!(herkomst(adres).is_err(), "{adres}");
        }
    }

    #[test]
    fn erpnext_vraag_veld_toetst_het_adres_voor_de_sleutelbos() {
        // Een ongeldig adres geeft de adresfout, niet een fout van de sleutelbos.
        let fout = vraag_veld("open-calcsheet-studio-erpnext-proef", "http://erp.voorbeeld.nl", "s", "P", "v")
            .unwrap_err();
        assert!(fout.contains("https://"), "{fout}");
    }

    #[test]
    fn erpnext_header_veilig_weigert_regelovergang_en_leeg() {
        assert!(header_veilig("abc123DEF"));
        assert!(!header_veilig(""));
        assert!(!header_veilig("abc\r\nX-Ander: 1"));
        assert!(!header_veilig("a b"));
        assert!(!header_veilig("é"));
    }
}
