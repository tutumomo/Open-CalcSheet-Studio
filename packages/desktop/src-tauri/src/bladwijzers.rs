//! Bladwijzers (de outline) achter een PDF van het rapport.
//!
//! De afdruk van WebView2 bewaart de links van de inhoudsopgave als benoemde
//! bestemmingen (`/Dests`), maar maakt geen bladwijzers. Die komen hier als aanvulling
//! achter het bestand: nieuwe objecten, de catalogus opnieuw met `/Outlines`, en een
//! tweede kruisverwijzingstabel met `/Prev`. De bytes die er al stonden, blijven staan.
//!
//! Zuiver en zonder afhankelijkheden: bytes in, de aanvulling uit. Herkent de functie de
//! opbouw van het bestand niet, dan geeft zij `None` en blijft de PDF zoals hij was.

#![cfg_attr(not(any(windows, target_os = "linux")), allow(dead_code))]

/// Eén regel van de inhoudsopgave: de titel, het niveau (1 = hoofdstuk) en de naam van
/// de bestemming in de PDF (het `id` van de kop op de vellen).
#[derive(Debug, Clone, serde::Deserialize)]
pub struct Kop {
    pub titel: String,
    pub niveau: u8,
    pub doel: String,
}

/// De aanvulling die achter `pdf` moet komen om de bladwijzers te tonen, of `None` als er
/// niets toe te voegen is of het bestand anders in elkaar zit dan verwacht.
pub fn aanvulling(pdf: &[u8], koppen: &[Kop]) -> Option<Vec<u8>> {
    let begin_tabel = laatste_getal_na(pdf, b"startxref")?;
    let staart = &pdf[vind_laatste(pdf, b"trailer")?..];
    let grootte = getal_na(staart, b"/Size")?;
    let wortel = getal_na(staart, b"/Root")?;
    let info = getal_na(staart, b"/Info");

    let catalogus = object_tekst(pdf, wortel)?;
    if vind(catalogus, b"/Outlines").is_some() {
        return None;
    }
    let bestemmingen = object_tekst(pdf, getal_na(catalogus, b"/Dests")?)?;
    // Alleen wat de PDF als bestemming kent: een bladwijzer zonder doel doet niets.
    let koppen: Vec<&Kop> = koppen
        .iter()
        .filter(|k| !k.titel.trim().is_empty() && is_naam(&k.doel) && vind(bestemmingen, format!("/{} ", k.doel).as_bytes()).is_some())
        .collect();
    if koppen.is_empty() {
        return None;
    }

    // De boom: de ouder van een kop is de laatste kop ervoor met een lager niveau.
    let n = koppen.len();
    let mut ouder: Vec<Option<usize>> = vec![None; n];
    let mut pad: Vec<usize> = Vec::new();
    for i in 0..n {
        while pad.last().is_some_and(|&p| koppen[p].niveau >= koppen[i].niveau) {
            pad.pop();
        }
        ouder[i] = pad.last().copied();
        pad.push(i);
    }
    let kinderen = |van: Option<usize>| -> Vec<usize> { (0..n).filter(|&i| ouder[i] == van).collect() };
    let nakomelingen = |i: usize| -> usize {
        let mut tel = 0;
        let mut j = i + 1;
        while j < n && koppen[j].niveau > koppen[i].niveau {
            tel += 1;
            j += 1;
        }
        tel
    };

    // Objectnummers: de wortel van de outline, dan elke kop.
    let outline = grootte;
    let nummer = |i: usize| grootte + 1 + i as u64;
    let mut uit: Vec<u8> = Vec::new();
    let mut plekken: Vec<(u64, usize)> = Vec::new();
    let basis = pdf.len();
    let mut object = |uit: &mut Vec<u8>, nr: u64, inhoud: String| {
        plekken.push((nr, basis + uit.len()));
        uit.extend_from_slice(format!("{nr} 0 obj\n{inhoud}\nendobj\n").as_bytes());
    };

    uit.extend_from_slice(b"\n");
    let top = kinderen(None);
    object(
        &mut uit,
        outline,
        format!("<</Type /Outlines /First {} 0 R /Last {} 0 R /Count {}>>", nummer(top[0]), nummer(*top.last()?), top.len()),
    );
    for i in 0..n {
        let broers = kinderen(ouder[i]);
        let plek = broers.iter().position(|&b| b == i)?;
        let mut d = format!(
            "<</Title {} /Parent {} 0 R /Dest /{}",
            titel_tekst(koppen[i].titel.trim()),
            ouder[i].map_or(outline, nummer),
            koppen[i].doel
        );
        if plek > 0 {
            d.push_str(&format!(" /Prev {} 0 R", nummer(broers[plek - 1])));
        }
        if plek + 1 < broers.len() {
            d.push_str(&format!(" /Next {} 0 R", nummer(broers[plek + 1])));
        }
        let eigen = kinderen(Some(i));
        if !eigen.is_empty() {
            // Een negatief aantal: de tak staat dichtgeklapt, zodat de hoofdstukken het eerst in beeld zijn.
            d.push_str(&format!(" /First {} 0 R /Last {} 0 R /Count -{}", nummer(eigen[0]), nummer(*eigen.last()?), nakomelingen(i)));
        }
        d.push_str(">>");
        object(&mut uit, nummer(i), d);
    }

    // De catalogus opnieuw, met de outline erbij.
    let kaal = std::str::from_utf8(catalogus).ok()?.trim();
    let kaal = kaal.strip_suffix(">>")?;
    if !kaal.starts_with("<<") {
        return None;
    }
    object(&mut uit, wortel, format!("{kaal}\n/Outlines {outline} 0 R\n/PageMode /UseOutlines>>"));

    // De tweede kruisverwijzingstabel: de catalogus, en de nieuwe objecten als één reeks.
    let tabel = basis + uit.len();
    let regel = |plek: usize| format!("{plek:010} 00000 n \n");
    let plek_van = |nr: u64| plekken.iter().find(|(n, _)| *n == nr).map(|(_, p)| *p);
    uit.extend_from_slice(b"xref\n");
    uit.extend_from_slice(format!("{wortel} 1\n{}", regel(plek_van(wortel)?)).as_bytes());
    uit.extend_from_slice(format!("{grootte} {}\n", n + 1).as_bytes());
    for nr in grootte..=grootte + n as u64 {
        uit.extend_from_slice(regel(plek_van(nr)?).as_bytes());
    }
    let info = info.map_or(String::new(), |i| format!("\n/Info {i} 0 R"));
    uit.extend_from_slice(
        format!("trailer\n<</Size {}\n/Root {wortel} 0 R{info}\n/Prev {begin_tabel}>>\nstartxref\n{tabel}\n%%EOF\n", grootte + 1 + n as u64).as_bytes(),
    );
    Some(uit)
}

/// Een naam die zonder omzetting in een PDF past: letters, cijfers, `-` en `_`.
fn is_naam(s: &str) -> bool {
    !s.is_empty() && s.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_')
}

/// Een titel als PDF-tekst: UTF-16BE met een BOM, als hex. Dan hoeft er niets te ontsnappen.
fn titel_tekst(titel: &str) -> String {
    let mut uit = String::from("<FEFF");
    for eenheid in titel.encode_utf16() {
        uit.push_str(&format!("{eenheid:04X}"));
    }
    uit.push('>');
    uit
}

fn vind(hooi: &[u8], naald: &[u8]) -> Option<usize> {
    hooi.windows(naald.len()).position(|w| w == naald)
}

fn vind_laatste(hooi: &[u8], naald: &[u8]) -> Option<usize> {
    hooi.windows(naald.len()).rposition(|w| w == naald)
}

/// Het eerste gehele getal na `sleutel`, met witruimte ertussen.
fn getal_na(tekst: &[u8], sleutel: &[u8]) -> Option<u64> {
    let rest = &tekst[vind(tekst, sleutel)? + sleutel.len()..];
    let begin = rest.iter().position(|b| !b.is_ascii_whitespace())?;
    let cijfers: Vec<u8> = rest[begin..].iter().copied().take_while(u8::is_ascii_digit).collect();
    std::str::from_utf8(&cijfers).ok()?.parse().ok()
}

fn laatste_getal_na(tekst: &[u8], sleutel: &[u8]) -> Option<u64> {
    getal_na(&tekst[vind_laatste(tekst, sleutel)?..], sleutel)
}

/// Wat tussen `nr 0 obj` en `endobj` staat. De laatste met dat nummer telt.
fn object_tekst(pdf: &[u8], nr: u64) -> Option<&[u8]> {
    let kop = format!("\n{nr} 0 obj");
    let begin = vind_laatste(pdf, kop.as_bytes())? + kop.len();
    let eind = vind(&pdf[begin..], b"endobj")?;
    Some(&pdf[begin..begin + eind])
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Een PDF zoals de afdruk hem schrijft, klein: één pagina, twee bestemmingen.
    fn proef() -> Vec<u8> {
        let mut pdf = Vec::new();
        let mut plekken = Vec::new();
        pdf.extend_from_slice(b"%PDF-1.4\n");
        let objecten = [
            "<</Producer (proef)>>",
            "<</Type /Page /Parent 3 0 R /MediaBox [0 0 595 842]>>",
            "<</Type /Pages /Kids [2 0 R] /Count 1>>",
            "<</inhoud-1 [2 0 R /XYZ 27 800 0]\n/inhoud-2 [2 0 R /XYZ 27 400 0]\n/inhoud-3 [2 0 R /XYZ 27 200 0]>>",
            "<</Type /Catalog\n/Pages 3 0 R\n/Dests 4 0 R\n/ViewerPreferences <</DisplayDocTitle true>>>>",
        ];
        for (i, o) in objecten.iter().enumerate() {
            plekken.push(pdf.len());
            pdf.extend_from_slice(format!("{} 0 obj\n{o}\nendobj\n", i + 1).as_bytes());
        }
        let tabel = pdf.len();
        pdf.extend_from_slice(b"xref\n0 6\n0000000000 65535 f \n");
        for p in plekken {
            pdf.extend_from_slice(format!("{p:010} 00000 n \n").as_bytes());
        }
        pdf.extend_from_slice(format!("trailer\n<</Size 6\n/Root 5 0 R\n/Info 1 0 R>>\nstartxref\n{tabel}\n%%EOF\n").as_bytes());
        pdf
    }

    fn kop(titel: &str, niveau: u8, doel: &str) -> Kop {
        Kop { titel: titel.into(), niveau, doel: doel.into() }
    }

    #[test]
    fn hoofdstuk_met_paragrafen() {
        let pdf = proef();
        let koppen = [kop("1 Inleiding", 1, "inhoud-1"), kop("1.1 Doel", 2, "inhoud-2"), kop("2 Belastingen (G)", 1, "inhoud-3")];
        let erbij = aanvulling(&pdf, &koppen).expect("een aanvulling");
        let tekst = String::from_utf8_lossy(&erbij);
        assert!(tekst.contains("6 0 obj\n<</Type /Outlines /First 7 0 R /Last 9 0 R /Count 2>>"), "{tekst}");
        assert!(tekst.contains("/Parent 6 0 R /Dest /inhoud-1 /Next 9 0 R /First 8 0 R /Last 8 0 R /Count -1>>"), "{tekst}");
        assert!(tekst.contains("/Parent 7 0 R /Dest /inhoud-2>>"), "{tekst}");
        assert!(tekst.contains("/Parent 6 0 R /Dest /inhoud-3 /Prev 7 0 R>>"), "{tekst}");
        assert!(tekst.contains("/ViewerPreferences <</DisplayDocTitle true>>\n/Outlines 6 0 R\n/PageMode /UseOutlines>>"), "{tekst}");
        assert!(tekst.contains("trailer\n<</Size 10\n/Root 5 0 R\n/Info 1 0 R\n/Prev "), "{tekst}");
        // Elke plek in de nieuwe tabel wijst naar het begin van zijn object.
        let heel = [pdf.clone(), erbij.clone()].concat();
        let tabel = laatste_getal_na(&heel, b"startxref").unwrap() as usize;
        assert!(heel[tabel..].starts_with(b"xref\n5 1\n"));
        let regels: Vec<&str> = std::str::from_utf8(&heel[tabel..]).unwrap().lines().collect();
        let plek = |r: &str| r[..10].parse::<usize>().unwrap();
        assert!(heel[plek(regels[2])..].starts_with(b"5 0 obj\n<</Type /Catalog"));
        assert_eq!(regels[3], "6 4");
        for (i, nr) in (6..=9).enumerate() {
            assert!(heel[plek(regels[4 + i])..].starts_with(format!("{nr} 0 obj\n").as_bytes()), "object {nr}");
        }
        assert!(regels.iter().all(|r| !r.ends_with(" n") || r.len() == 19), "een regel van de tabel is twintig bytes met zijn regeleinde");
    }

    #[test]
    fn titel_buiten_ascii_en_haakjes() {
        assert_eq!(titel_tekst("A (é)"), "<FEFF00410020002800E90029>");
    }

    #[test]
    fn zonder_bestemming_geen_bladwijzer() {
        let pdf = proef();
        assert!(aanvulling(&pdf, &[kop("Onbekend", 1, "inhoud-9"), kop("Vreemd", 1, "a b")]).is_none());
        let erbij = aanvulling(&pdf, &[kop("Onbekend", 1, "inhoud-9"), kop("Wel", 1, "inhoud-2")]).unwrap();
        assert!(String::from_utf8_lossy(&erbij).contains("/Count 1>>"));
    }

    #[test]
    fn een_paragraaf_zonder_hoofdstuk_ervoor_staat_bovenaan() {
        let erbij = aanvulling(&proef(), &[kop("1.1 Doel", 2, "inhoud-2"), kop("2 Belastingen", 1, "inhoud-3")]).unwrap();
        assert!(String::from_utf8_lossy(&erbij).contains("/First 7 0 R /Last 8 0 R /Count 2>>"));
    }

    #[test]
    fn twee_keer_of_een_vreemd_bestand_doet_niets() {
        let pdf = proef();
        let koppen = [kop("1 Inleiding", 1, "inhoud-1")];
        let heel = [pdf.clone(), aanvulling(&pdf, &koppen).unwrap()].concat();
        assert!(aanvulling(&heel, &koppen).is_none(), "er staat al een outline");
        assert!(aanvulling(b"geen pdf", &koppen).is_none());
        assert!(aanvulling(&pdf, &[]).is_none());
    }
}
