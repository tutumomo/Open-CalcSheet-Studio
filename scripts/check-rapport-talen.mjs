/**
 * Controle van het rapport in een andere taal dan Nederlands.
 *
 *   1  de gegevens: een nieuw rapport volgt de taal van de app, een oud rapport krijgt
 *      Nederlands, onbruikbare invoer valt weg;
 *   2  de opzet, de standaardteksten en de normwaarden in beide talen, met dezelfde
 *      tekst-id's en ankers;
 *   3  wisselen van taal: wat de app meelevert wisselt mee, eigen tekst blijft staan en
 *      wordt onthouden;
 *   4  de bladspiegel: de Engelse koppen en labels passen in hun cel, op de breedtes van
 *      Segoe UI;
 *   5  de echte afdruk als html (lib/rapport-html.mjs): een oud rapport staat er tot op
 *      de letter hetzelfde als vóór deze wijziging (fixtures/rapport-oud-*.html), en een
 *      compleet Engels rapport bevat geen Nederlands, ook niet met de app op Nederlands.
 *
 * Draaien:  node scripts/check-rapport-talen.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 *
 * De gouden bestanden zijn gemaakt met de code van vóór de talen. Verander je de
 * opmaak van het rapport bewust, dan maakt `--bewaar` ze opnieuw; kijk dan het verschil na.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inTaal } from "../packages/desktop/src/rapport/meertalig.ts";
import {
  leesTaal, MEEGELEVERD, normaliseerRapport, RAPPORT_VERSIE, ROLLEN, SOORTEN_BOUWWERK, standaardRapport, TITELS,
} from "../packages/desktop/src/rapport/model.ts";
import {
  BIJLAGE_A, bijlagen, bouwOpzet, inhoudsopgave, inhoudVoorPaneel, OPZET, TEKST_IDS, titelVan,
} from "../packages/desktop/src/rapport/opzet.ts";
import { STANDAARD_TEKSTEN, standaardTeksten } from "../packages/desktop/src/rapport/standaardteksten.ts";
import { INVULVELDEN, tekstRegels, vulIn } from "../packages/desktop/src/rapport/invullen.ts";
import {
  belastingfactorTabel, CATEGORIEEN, fmt, notatie, windLabel,
} from "../packages/desktop/src/rapport/normwaarden.ts";
import {
  andereTaalVan, isNieuwRapport, metTekst, wisselTaal, zetVeldOpPad,
} from "../packages/desktop/src/rapport/taalwissel.ts";
import { leesPad } from "../packages/desktop/src/rapport/pad.ts";
import { balklaag } from "../packages/desktop/src/templates/balklaag.ts";
import { ligger } from "../packages/desktop/src/templates/ligger.ts";
import { tweepaalspoer } from "../packages/desktop/src/templates/tweepaalspoer.ts";
import { doorsnedeSpanningen } from "../packages/desktop/src/templates/doorsnede-spanningen.ts";
import { PDF_BLAD } from "../packages/desktop/src/store/pdfBijlage.ts";
import { SPREADSHEET_BLAD } from "../packages/desktop/src/store/spreadsheetBlad.ts";
import { GRAAF_BLAD } from "../packages/desktop/src/store/graafBlad.ts";
import { TEKEN_BLAD } from "../packages/desktop/src/store/tekenBlad.ts";
import { JUPYTER_BLAD } from "../packages/desktop/src/store/jupyterBlad.ts";
import { MARIMO_BLAD } from "../packages/desktop/src/store/marimoBlad.ts";
import { twRcBeam } from "../packages/desktop/src/templates/tw-rc-beam.ts";
import { twRetainingWall } from "../packages/desktop/src/templates/tw-retaining-wall.ts";
import { twDrainageChannel } from "../packages/desktop/src/templates/tw-drainage-channel.ts";

const hier = dirname(fileURLToPath(import.meta.url));
const lees = (pad) => readFileSync(join(hier, pad), "utf8").replace(/\r\n/g, "\n");
const BEWAAR = process.argv.includes("--bewaar");

let fouten = 0;
function toets(naam, ok, detail) {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${naam}${ok || detail === undefined ? "" : `\n         ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
}
/** Diepe vergelijking; de volgorde van sleutels telt niet. */
function zelfde(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && zelfde(a[k], b[k]));
}
const gelijk = (naam, kreeg, verwacht) => toets(naam, zelfde(kreeg, verwacht), `kreeg ${JSON.stringify(kreeg)}, verwacht ${JSON.stringify(verwacht)}`);
const kop = (t) => console.log(`\n${t}`);
const kloon = (x) => JSON.parse(JSON.stringify(x));

const VANDAAG = "05-11-2026";
const nieuw = (taal) => standaardRapport(VANDAAG, standaardTeksten(taal), taal);

/**
 * Nederlandse woorden die in een Engels rapport niet thuishoren. Geen woorden die ook
 * Engels zijn (in, is, of, over, want, project, norm).
 */
const NL_WOORD = new RegExp(`\\b(?:${[
  "het", "een", "van", "bij", "met", "voor", "uit", "naar", "niet", "geen", "alleen", "maar", "ook", "wordt", "worden", "zijn", "staat", "staan",
  "deze", "dit", "dat", "wel", "tenzij", "aangegeven", "bestaand", "bestaande", "constructie", "constructief", "constructieve", "constructeur",
  "berekening", "berekeningen", "belasting", "belastingen", "belastingklasse", "belastingfactoren", "belastingcombinaties",
  "uitgangspunten", "inleiding", "inhoud", "inhoudsopgave", "bijlage", "projectgegevens", "projectomschrijving", "toelichting", "aandachtspunten",
  "uitvoering", "verbouw", "renovatie", "nieuwbouw", "wijziging", "constructieprincipe", "belendingen", "stabiliteit", "fundatie", "fundering",
  "trillingen", "vervormingen", "verplaatsingen", "montage", "bouwfase", "rekenprogrammatuur", "temperatuursinvloeden", "aardbevingen",
  "sneeuw", "sneeuwbelastingen", "windbelastingen", "windgebied", "terreincategorie", "gebouwhoogte", "regenwateraccumulatie", "veranderlijke",
  "blijvende", "vloer", "vloeren", "daken", "wanden", "gevel", "gebouw", "bouwwerk", "hout", "staal", "beton", "wapeningsstaal", "plaatmateriaal",
  "ondervoeging", "bouten", "houtdraaibout", "ankers", "materiaaltype", "groep", "gunstig", "ongunstig", "overige", "overheers", "buitengewoon",
  "karakteristiek", "blijvend", "bouwjaar", "afgeleid", "beschikbaar", "onderdeel", "schuin", "vulling", "algemeen", "opdracht", "adviseur",
  "verantwoordelijk", "uitvoerend", "toegepaste", "normen", "documentgegevens", "datum", "documentkenmerk", "rapportstatus", "voldoet", "rekenversie",
  "kust", "onbebouwd", "bebouwd", "conservering", "verzinkt", "thermisch", "brandwerendheidseis", "brandscheiding", "vluchtroute", "hoofddraagconstructie",
  "ontwerp", "ontwerplevensduur", "ontwerplevensduurklasse", "betrouwbaarheidsklasse", "constructiegevolgklasse", "inspectie", "toepassing", "gebruikt",
  "plat", "dak", "rol", "soort", "naam", "bron", "ja", "nee", "getoetst", "tabel", "zie",
].join("|")})\\b`, "i");

// ── 1. De gegevens ──────────────────────────────────────────────────────────
kop("1. Het model");
{
  gelijk("inTaal: de gevraagde taal", inTaal({ en: "a", nl: "b" }, "nl"), "b");
  gelijk("inTaal: ontbreekt die, dan Engels", inTaal({ en: "a", nl: "b" }, "de"), "a");
  gelijk("de versie van de rapportopbouw is omhoog", RAPPORT_VERSIE, 6);

  const en = nieuw("en");
  const nl = nieuw("nl");
  gelijk("een nieuw rapport draagt zijn taal", [en.taal, nl.taal], ["en", "nl"]);
  gelijk("een nieuw rapport heeft geen teksten in een andere taal", en.tekstTaal, {});
  gelijk("zonder taal: Engels, niet Nederlands", standaardRapport(VANDAAG, {}).taal, "en");
  gelijk("de titel volgt de taal", [en.titel, nl.titel], ["Structural advice & calculations", "Constructieadvies & berekeningen"]);
  gelijk("Nederlands blijft wat het was: materialen",
    nl.uitgangspunten.materialen.map((m) => m.type),
    ["TPG Beton", "Hout", "Plaatmateriaal", "Wapeningsstaal", "Staal", "Ondervoeging staal"]);
  toets("elke standaardwaarde is in het Engels anders dan in het Nederlands", en.rol.rol !== nl.rol.rol
    && en.uitgangspunten.soortBouwwerk !== nl.uitgangspunten.soortBouwwerk
    && en.uitgangspunten.conserveringSlot !== nl.uitgangspunten.conserveringSlot
    && en.revisies[0].omschrijving !== nl.revisies[0].omschrijving);
  gelijk("getallen in de notatie van de taal", [en.belastingen.klassen[0].lichteScheidingswanden, nl.belastingen.klassen[0].lichteScheidingswanden], ["0.80", "0,80"]);
  gelijk("en in de vervormingseisen, de index blijft", [en.uitgangspunten.vervormingen[0].ueind, nl.uitgangspunten.vervormingen[0].ueind], ["0.004l_rep", "0,004l_rep"]);
  /** Alle tekst in een waarde, zonder de sleutels. */
  const teksten = (x) => (typeof x === "string" ? [x] : x && typeof x === "object" ? Object.values(x).flatMap(teksten) : []);
  // De beschikbaarheid in 4.6 is een code (Ja of Nee): de afdruk zet hem in de taal van het rapport.
  const { bestaand: _codes, ...uitgangspunten } = en.uitgangspunten;
  const rest = teksten([en.titel, en.normen, en.rol, uitgangspunten, en.revisies]).filter((t) => NL_WOORD.test(t));
  toets("de Engelse standaardwaarden bevatten geen Nederlands", rest.length === 0, rest);
  for (const [naam, lijst] of Object.entries(MEEGELEVERD)) {
    toets(`meegeleverd ${naam}: Engels en Nederlands`, lijst.every((m) => m.en.trim() !== "" && m.nl?.trim()));
  }
  toets("suggesties: elke regel in twee talen", [...TITELS, ...ROLLEN, ...SOORTEN_BOUWWERK].every((m) => m.en && m.nl));

  // Een oud bestand: geen taal, dus Nederlands, en de standaardwaarden die ontbreken ook.
  const oud = kloon(nl);
  delete oud.taal;
  delete oud.tekstTaal;
  oud.versie = 4;
  const open = normaliseerRapport(kloon(oud), VANDAAG, standaardTeksten);
  gelijk("een oud rapport krijgt Nederlands", [open.taal, open.tekstTaal], ["nl", {}]);
  gelijk("verder verandert er niets aan", open, { ...oud, versie: RAPPORT_VERSIE, taal: "nl", tekstTaal: {} });
  gelijk("opnieuw openen verandert niets meer", normaliseerRapport(kloon(open), VANDAAG, standaardTeksten), open);
  delete oud.uitgangspunten;
  delete oud.teksten;
  const leeg = normaliseerRapport(kloon(oud), VANDAAG, standaardTeksten);
  gelijk("wat in een oud rapport ontbreekt, wordt Nederlands aangevuld",
    [leeg.uitgangspunten.soortBouwwerk, leeg.teksten.rol], ["Woning", "{adviseur} heeft opdracht voor het constructieadvies voor dit project."]);
  gelijk("geen rapport: de taal van de app", normaliseerRapport(undefined, VANDAAG, standaardTeksten, "nl").taal, "nl");
  gelijk("een rapport van deze versie houdt zijn taal", normaliseerRapport(kloon(nieuw("en")), VANDAAG, standaardTeksten, "nl").taal, "en");

  // Onbetrouwbare invoer.
  gelijk("een taalcode is een taalcode", ["en", "nl", "de", "fr", "pt-BR", "__proto__", "constructor", "", 3, null, "e n", "<b>"].map(leesTaal),
    ["en", "nl", "de", "fr", "pt-BR", undefined, undefined, undefined, undefined, undefined, undefined, undefined]);
  const raar = { ...kloon(nieuw("en")), taal: "__proto__", tekstTaal: { rol: "nl", inleiding: 3, trillingen: "__proto__" } };
  const veilig = normaliseerRapport(raar, VANDAAG, standaardTeksten);
  gelijk("een onbruikbare taal: de standaard van deze versie", veilig.taal, "en");
  gelijk("tekstTaal: alleen geldige talen", veilig.tekstTaal, { rol: "nl" });
  gelijk("tekstTaal geen object: leeg", normaliseerRapport({ ...kloon(nieuw("en")), tekstTaal: "nl" }, VANDAAG, standaardTeksten).tekstTaal, {});
}

// ── 2. Opzet, teksten en normwaarden ────────────────────────────────────────
kop("2. De opzet in beide talen");
{
  const en = nieuw("en");
  const nl = nieuw("nl");
  const bladen = [{ id: "ex-a", naam: "Beam" }, { id: "ex-b", naam: "Column" }];
  en.inHoofdstuk = { "ex-a": true };
  nl.inHoofdstuk = { "ex-a": true };
  const koppen = (r) => inhoudsopgave(bouwOpzet(r, bladen), true).map((i) => `${i.nummer} ${i.titel}`);
  gelijk("Nederlands: dezelfde koppen als altijd", koppen(nl).slice(0, 8), [
    "1 Inleiding", "2 Projectgegevens", "2.1 Projectomschrijving", "2.2 Rol binnen het project en bereik rapport",
    "3 Constructie", "3.1 Toelichting constructie", "3.2 Aandachtspunten bij uitvoering", "4 Uitgangspunten",
  ]);
  gelijk("Engels: de koppen", koppen(en).slice(0, 8), [
    "1 Introduction", "2 Project details", "2.1 Project description", "2.2 Role in the project and scope of this report",
    "3 Structure", "3.1 Description of the structure", "3.2 Notes for construction", "4 Design basis",
  ]);
  toets("geen Nederlandse kop in het Engels", !koppen(en).some((k) => NL_WOORD.test(k)), koppen(en).filter((k) => NL_WOORD.test(k)));
  const ankers = (r) => inhoudsopgave(bouwOpzet(r, bladen), true).map((i) => i.anker);
  gelijk("de ankers veranderen niet met de taal", ankers(en), ankers(nl));
  const paneel = (r) => inhoudVoorPaneel(r, bladen);
  gelijk("het zijpaneel: dezelfde ankers en nummers", paneel(en).map((p) => [p.anker, p.nummer]), paneel(nl).map((p) => [p.anker, p.nummer]));
  gelijk("het zijpaneel staat in de taal van het rapport", [paneel(en)[0].titel, paneel(nl)[0].titel], ["Introduction", "Inleiding"]);
  gelijk("bijlage A in de taal van het rapport", [bijlagen(en, bladen)[0].titel, bijlagen(nl, bladen)[0].titel], [inTaal(BIJLAGE_A, "en"), "Uitgebreide uitwerking berekeningen"]);

  // titelVan bij nieuwbouw, in beide talen.
  const wijziging = OPZET[2].kinderen[0].kinderen.find((k) => k.id === "wijziging");
  gelijk("titelVan bij nieuwbouw", [titelVan(wijziging, en), titelVan(wijziging, nl)], ["Structural concept", "Constructieprincipe"]);
  const bestaand = (r) => ({ ...r, uitgangspunten: { ...r.uitgangspunten, bestaand: { ...r.uitgangspunten.bestaand, opnemen: true } } });
  gelijk("titelVan met een bestaande situatie", [titelVan(wijziging, bestaand(en)), titelVan(wijziging, bestaand(nl))], ["Alteration", "Wijziging"]);
  gelijk("een taal zonder vertaling valt terug op Engels", titelVan(OPZET[0], { ...en, taal: "fr" }), "Introduction");
  const allen = (lijst) => lijst.flatMap((k) => [k, ...allen(k.kinderen ?? [])]);
  toets("elke knoop heeft een titel in beide talen", allen(OPZET).every((k) => k.titel.en && k.titel.nl));
  toets("de Engelse titels bevatten geen Nederlands", !allen(OPZET).some((k) => NL_WOORD.test(k.titel.en)),
    allen(OPZET).filter((k) => NL_WOORD.test(k.titel.en)).map((k) => k.titel.en));
}

kop("2. De standaardteksten");
{
  gelijk("varianten voor precies de tekst-ids", Object.keys(STANDAARD_TEKSTEN).sort(), [...TEKST_IDS].sort());
  const alle = Object.entries(STANDAARD_TEKSTEN).flatMap(([id, l]) => l.map((v) => ({ id, ...v })));
  toets("elke variant in beide talen, label en tekst", alle.every((v) => v.label.en && v.label.nl && v.tekst.en && v.tekst.nl));
  // Een invulveld heet in elke taal hetzelfde.
  const zonderVeld = (t) => t.replace(/\{[A-Za-z]+\}/g, " ");
  const nl = alle.filter((v) => NL_WOORD.test(zonderVeld(v.tekst.en)) || NL_WOORD.test(v.label.en));
  toets("de Engelse varianten bevatten geen Nederlands", nl.length === 0, nl.map((v) => `${v.id}: ${v.label.en} / ${(zonderVeld(v.tekst.en).match(NL_WOORD) ?? v.label.en.match(NL_WOORD))?.[0]}`));
  const w = Object.fromEntries(INVULVELDEN.map((v) => [v, "x"]));
  gelijk("Engels: alleen bekende invulvelden", alle.map((v) => vulIn(v.tekst.en, w)).filter((t) => /\{[A-Za-z]+\}/.test(t)), []);
  const velden = (t) => (t.match(/\{[A-Za-z]+\}/g) ?? []).sort();
  gelijk("dezelfde invulvelden in beide talen", alle.filter((v) => !zelfde(velden(v.tekst.en), velden(v.tekst.nl))).map((v) => v.id), []);
  gelijk("Engels: geen subkoppen in de meegeleverde teksten", alle.flatMap((v) => tekstRegels(v.tekst.en, true)).filter((r) => r.kop).map((r) => r.tekst), []);
  gelijk("Engels: even veel regels als Nederlands", alle.filter((v) => v.tekst.en.split("\n").length !== v.tekst.nl.split("\n").length).map((v) => v.id), []);
  gelijk("standaardTeksten: de eerste variant in de taal", standaardTeksten("nl").regenwater, "Niet van toepassing");
  gelijk("standaardTeksten: Engels", standaardTeksten("en").regenwater, "Not applicable");
  gelijk("standaardTeksten: dezelfde tekst-ids in elke taal", Object.keys(standaardTeksten("en")), Object.keys(standaardTeksten("nl")));
  gelijk("standaardTeksten: zonder taal Engels", standaardTeksten().regenwater, "Not applicable");
}

kop("2. De normwaarden");
{
  const rij = (cc, taal, i) => belastingfactorTabel(cc, taal)[i];
  gelijk("Nederlands: dezelfde cellen", rij(2, "nl", 1).cellen, ["0,90", "1,35", "1,5ψ0", "1,5ψ0"]);
  gelijk("Engels: dezelfde waarden met een punt", rij(2, "en", 1).cellen, ["0.90", "1.35", "1.5ψ0", "1.5ψ0"]);
  gelijk("de formulenummers en codes blijven", belastingfactorTabel(2, "en").slice(0, 6).map((r) => r.naam), belastingfactorTabel(2, "nl").slice(0, 6).map((r) => r.naam));
  gelijk("de combinaties in het Engels", belastingfactorTabel(2, "en").slice(6).map((r) => r.naam),
    ["Accidental(6.11a/b)", "Characteristic(6.14b)", "Frequent(6.15b)", "Quasi-perm.(6.16b)"]);
  gelijk("en in het Nederlands", belastingfactorTabel(2, "nl").slice(6).map((r) => r.naam),
    ["Buitengewoon(6.11a/b)", "Karakteristiek(6.14b)", "Frequent(6.15b)", "Quasi-Blijvend(6.16b)"]);
  gelijk("de opmerking", [rij(2, "en", 6).opmerking, rij(2, "nl", 6).opmerking], ["not used", "niet gebruikt"]);
  gelijk("elke cel rekent gelijk in beide talen",
    [1, 2, 3].every((cc) => belastingfactorTabel(cc, "en").every((r, i) => zelfde(r.cellen?.map((c) => c.replace(".", ",")) ?? null, belastingfactorTabel(cc, "nl")[i].cellen))), true);
  gelijk("windLabel", [windLabel(1, 1, "en"), windLabel(2, 2, "en"), windLabel(3, 3, "en"), windLabel(3, 3, "nl")], ["1 coastal", "2 rural", "3 built-up", "3 bebouwd"]);
  gelijk("fmt: punt in het Engels, komma in het Nederlands", [fmt(0.56, 2, false, "en"), fmt(0.56, 2, false, "nl"), fmt(0.56, 2)], ["0.56", "0,56", "0,56"]);
  gelijk("notatie: Engels haalt de komma tussen cijfers weg", ["0,80", "0,004l_rep", "H/300", "< 20 mm", "12,5%", "a,b", "2, 3"].map((s) => notatie(s, "en")),
    ["0.80", "0.004l_rep", "H/300", "< 20 mm", "12.5%", "a,b", "2, 3"]);
  gelijk("notatie: Nederlands laat staan wat er staat", ["0,80", "0.80"].map((s) => notatie(s, "nl")), ["0,80", "0.80"]);
  toets("elke belastingcategorie in beide talen", CATEGORIEEN.every((c) => c.label.en && c.label.nl));
  gelijk("de ids van de categorieën blijven", CATEGORIEEN.slice(0, 2).map((c) => c.id), ["A-vloer", "A-trap"]);
  toets("de Engelse categorieën bevatten geen Nederlands", !CATEGORIEEN.some((c) => NL_WOORD.test(c.label.en)));
}

// ── 3. Wisselen van taal ────────────────────────────────────────────────────
kop("3. Wisselen van taal");
{
  const nl = nieuw("nl");
  const en = wisselTaal(nl, "en");
  gelijk("een nieuw rapport wisselen geeft hetzelfde als nieuw in die taal", en, nieuw("en"));
  gelijk("en terug", wisselTaal(en, "nl"), nl);
  toets("zelfde taal: niets verandert", wisselTaal(nl, "nl") === nl);
  toets("een onbruikbare taal: niets verandert", wisselTaal(nl, "__proto__") === nl);
  toets("nieuw rapport herkend, in elke taal", isNieuwRapport(nl) && isNieuwRapport(en));
  toets("een wijziging is geen nieuw rapport meer", !isNieuwRapport({ ...nl, kenmerk: "x" }) && !isNieuwRapport(metTekst(nl, "rol", "Eigen.")));
  toets("isNieuwRapport kijkt niet naar de datum", isNieuwRapport(standaardRapport("01-01-2020", standaardTeksten("en"), "en")));
  toets("isNieuwRapport: ook na opslaan en openen", isNieuwRapport(normaliseerRapport(kloon(nieuw("en")), VANDAAG, standaardTeksten)));

  // Alle varianten, in elke richting.
  let mis = [];
  for (const [id, varianten] of Object.entries(STANDAARD_TEKSTEN)) {
    for (const v of varianten) {
      const r = { ...nieuw("nl"), teksten: { [id]: v.tekst.nl } };
      const uit = wisselTaal(r, "en");
      if (uit.teksten[id] !== v.tekst.en || andereTaalVan(uit, id)) mis.push(`${id}: ${v.label.nl}`);
      if (wisselTaal(uit, "nl").teksten[id] !== v.tekst.nl) mis.push(`${id} terug: ${v.label.nl}`);
    }
  }
  gelijk("elke meegeleverde variant wisselt mee, heen en terug", mis, []);
  const crlf = { ...nieuw("nl"), teksten: { inleiding: `\n${STANDAARD_TEKSTEN.inleiding[0].tekst.nl.replace(/\n/g, "\r\n")}  ` } };
  gelijk("regeleinden en witruimte aan de rand tellen niet", wisselTaal(crlf, "en").teksten.inleiding, STANDAARD_TEKSTEN.inleiding[0].tekst.en);

  // Eigen tekst.
  const eigen = "Eigen tekst die de gebruiker heeft getypt.";
  const r0 = metTekst(nl, "belendingen", eigen);
  gelijk("getypte tekst krijgt de taal van het rapport", r0.tekstTaal, { belendingen: "nl" });
  gelijk("in dezelfde taal geen melding", andereTaalVan(r0, "belendingen"), null);
  const r1 = wisselTaal(r0, "en");
  gelijk("eigen tekst blijft staan", r1.teksten.belendingen, eigen);
  gelijk("de melding noemt de taal van de tekst", andereTaalVan(r1, "belendingen"), "nl");
  gelijk("een andere tekst heeft geen melding", andereTaalVan(r1, "rol"), null);
  const r2 = wisselTaal(r1, "nl");
  gelijk("terug in zijn eigen taal: geen melding meer", [r2.teksten.belendingen, andereTaalVan(r2, "belendingen")], [eigen, null]);
  gelijk("na een rondje is de stand weer gelijk", r2, r0);
  const r3 = metTekst(r1, "belendingen", "Own text, now in English.");
  gelijk("opnieuw typen: nu in de taal van het rapport", [andereTaalVan(r3, "belendingen"), r3.tekstTaal.belendingen], [null, "en"]);
  const r4 = metTekst(r1, "belendingen", STANDAARD_TEKSTEN.belendingen[0].tekst.en);
  gelijk("een meegeleverde variant kiezen: geen melding en niet onthouden", [andereTaalVan(r4, "belendingen"), r4.tekstTaal], [null, {}]);
  const r5 = metTekst(r1, "belendingen", "");
  gelijk("leegmaken: geen melding", [andereTaalVan(r5, "belendingen"), r5.tekstTaal], [null, {}]);
  gelijk("een lege tekst blijft leeg en krijgt geen taal", wisselTaal({ ...nl, teksten: { ...nl.teksten, rol: "" } }, "en").teksten.rol, "");
  // Een tekst van een oud rapport heeft nog geen taal: die was Nederlands.
  const oud = { ...nl, teksten: { ...nl.teksten, belendingen: eigen }, tekstTaal: {} };
  gelijk("een oude eigen tekst: de taal van het rapport voor de wissel", andereTaalVan(wisselTaal(oud, "en"), "belendingen"), "nl");
  const zonderVarianten = wisselTaal({ ...nl, teksten: { ...nl.teksten, "eigen-id": eigen } }, "en");
  gelijk("een tekst-id zonder vertaling: de tekst blijft en krijgt een melding", [zonderVarianten.teksten["eigen-id"], andereTaalVan(zonderVarianten, "eigen-id")], [eigen, "nl"]);
  const ids = (r) => Object.keys(r.teksten).sort();
  gelijk("de tekst-ids veranderen niet", ids(wisselTaal(nl, "en")), ids(nl));

  // De andere velden.
  const v = { ...kloon(nl), rol: { rol: "Constructeur", architect: "n.v.t.", datumOnderlegger: "12-03-2026" } };
  v.uitgangspunten.materialen.push({ type: "Metselwerk", soort: "CS12", opmerking: "eigen" });
  v.belastingen.wind.gebouwhoogte = "9,5";
  v.belastingen.vloerenDaken = [{ soort: "vlak", naam: "Dak", lagen: [{ naam: "pannen", d: "0,02", rho: "4,0", p: "" }] }];
  const w = wisselTaal(v, "en");
  gelijk("een meegeleverde suggestie wisselt mee", [w.rol.rol, w.rol.architect, w.titel], ["Structural engineer", "n/a", "Structural advice & calculations"]);
  gelijk("een eigen waarde blijft", [w.rol.datumOnderlegger, w.uitgangspunten.materialen.at(-1)], ["12-03-2026", { type: "Metselwerk", soort: "CS12", opmerking: "eigen" }]);
  gelijk("een materiaal wisselt mee, de sterkteklasse blijft", [w.uitgangspunten.materialen[0].type, w.uitgangspunten.materialen[0].soort], ["In-situ concrete", "C20/25"]);
  gelijk("een eigen getal gaat naar de notatie van de taal", [w.belastingen.wind.gebouwhoogte, w.belastingen.vloerenDaken[0].lagen[0].d], ["9.5", "0.02"]);
  gelijk("de naam van een eigen laag blijft", w.belastingen.vloerenDaken[0].lagen[0].naam, "pannen");
  gelijk("en terug", wisselTaal(w, "nl").belastingen.wind.gebouwhoogte, "9,5");
  gelijk("de revisie wisselt mee", w.revisies[0].omschrijving, "First issue");
  gelijk("de status blijft een code", w.revisies[0].status, "concept");
  gelijk("ja of nee blijft een code", w.uitgangspunten.bestaand.berekeningBeschikbaar, "Ja");

  // Via het pad, zoals de store en de API het doen.
  const p1 = zetVeldOpPad(nl, leesPad("taal"), "en");
  gelijk("het veld taal wisselt, het zet niet alleen", p1, wisselTaal(nl, "en"));
  gelijk("een onbruikbare taal via het pad verandert niets", zetVeldOpPad(nl, leesPad("taal"), "<b>"), nl);
  gelijk("een tekst via het pad onthoudt zijn taal", zetVeldOpPad(nl, leesPad("teksten.belendingen"), eigen).tekstTaal, { belendingen: "nl" });
  gelijk("een ander veld via het pad: gewoon zetten", zetVeldOpPad(nl, leesPad("kenmerk"), "K1").kenmerk, "K1");
}

// ── 4. De bladspiegel ───────────────────────────────────────────────────────
kop("4. De bladspiegel: past de Engelse tekst in zijn cel?");
{
  /** Breedtes in em van Segoe UI, gemeten (scripts/check-rapport.mjs). */
  const SEGOE = {
    a: 0.509, b: 0.588, c: 0.462, d: 0.589, e: 0.523, f: 0.313, g: 0.589, h: 0.566, i: 0.242, j: 0.242, k: 0.497, l: 0.242, m: 0.861, n: 0.566,
    o: 0.586, p: 0.588, q: 0.589, r: 0.348, s: 0.424, t: 0.339, u: 0.566, v: 0.479, w: 0.722, x: 0.459, y: 0.484, z: 0.452,
    A: 0.645, B: 0.573, C: 0.619, D: 0.701, E: 0.506, F: 0.488, G: 0.686, H: 0.71, I: 0.266, J: 0.357, K: 0.58, L: 0.471, M: 0.898, N: 0.748,
    O: 0.754, P: 0.56, Q: 0.754, R: 0.598, S: 0.531, T: 0.524, U: 0.687, V: 0.621, W: 0.934, X: 0.59, Y: 0.553, Z: 0.57,
    " ": 0.274, ".": 0.217, ",": 0.217, ";": 0.217, ":": 0.217, "(": 0.302, ")": 0.302, "-": 0.4, "/": 0.39, "&": 0.8,
  };
  const em = (t) => [...t].reduce((s, c) => s + (SEGOE[c] ?? 0.54), 0);
  /** Een kolom is 53,8 pt, de cel houdt aan weerszijden 1,4 pt vrij; de letter is 10 pt, vet zo'n 8% breder. */
  const past = (t, kolommen, vet = false) => em(t) * (vet ? 1.08 : 1) * 10 <= kolommen * 53.8 - 2.8;
  const rapport = JSON.parse(lees("../packages/desktop/src/i18n/locales/en/rapport.json"));
  const a = rapport.afdruk;
  const REGELS = [
    [a.voorblad.project, 3, true], [a.voorblad.inOpdrachtVan, 3, true], [a.voorblad.adviseur, 3], [a.voorblad.verantwoordelijk, 3], [a.voorblad.uitvoerend, 3],
    [a.voorblad.normen, 3], [a.voorblad.documentgegevens, 3], [`${a.voorblad.eersteDatumVoor}${a.voorblad.eersteDatumSup} ${a.voorblad.eersteDatumNa}`, 3],
    [a.voorblad.datumWijz, 2], [`${a.voorblad.datumWijz} AB`, 2], [a.voorblad.fase, 3], [a.voorblad.status, 3], [a.voorblad.kenmerk, 3],
    [a.bouwwerk.soort, 3], [a.bouwwerk.gevolgklasse, 3], [a.bouwwerk.betrouwbaarheidsklasse, 3], [a.bouwwerk.levensduurklasse, 3], [a.bouwwerk.levensduur, 3],
    [a.bouwwerk.supervisie, 3], [a.bouwwerk.inspectie, 3],
    [a.brand.hoofddraagconstructie, 4], [a.brand.brandscheiding, 4], [a.brand.vluchtroute, 4],
    [a.materialen.type, 2, true], [a.materialen.soort, 1, true],
    [a.factoren.groep, 1, true], [a.factoren.naam, 2, true], [a.factoren.gunstig, 1], [a.factoren.ongunstig, 1], [a.factoren.overheersend, 1], [a.factoren.overige, 1],
    [a.bestaand.bouwjaar, 3], [a.bestaand.bron, 1], [a.bestaand.norm, 3], [a.bestaand.afgeleid, 2], [a.bestaand.berekening, 3], [a.bestaand.materiaalgegevens, 3],
    [a.vervormingen.onderdeel, 3, true],
    [a.belastingen.terreincategorie, 2], [a.belastingen.gebouwhoogte, 2], [a.belastingen.klasse, 2], [`${a.belastingen.algemeen} qk+${a.belastingen.ls}`, 2],
    [`${a.belastingen.algemeen} qk`, 2], [`${a.belastingen.dakPlat} qk`, 2], [a.belastingen.dakSchuin, 2], [a.belastingen.dakQlast, 2],
    [a.belastingen.vulling, 1, true], [a.rol.architect, 4], [a.rol.datumOnderlegger, 4],
    // Past het niet in de kolom van de nummers, dan loopt het over de kolom ervoor (Inhoud.tsx).
    [`${a.inhoud.bijlage} AA`, 2, true],
  ];
  for (const [tekst, kolommen, vet] of REGELS) {
    if (tekst === undefined) {
      toets("een regel zonder tekst", false, "een sleutel in afdruk ontbreekt");
      continue;
    }
    toets(`"${tekst}" past in ${kolommen} kolom(men)`, past(tekst, kolommen, vet), `${(em(tekst) * (vet ? 1.08 : 1) * 10).toFixed(1)} pt van ${kolommen * 53.8 - 2.8} pt`);
  }
  const en = nieuw("en");
  for (const m of en.uitgangspunten.materialen) toets(`materiaal "${m.type}" past in 2 kolommen`, past(m.type, 2));
  for (const c of en.uitgangspunten.conservering) toets(`onderdeel "${c.onderdeel}" past in 2 kolommen`, past(c.onderdeel, 2));
  for (const c of en.uitgangspunten.conservering) toets(`systeem "${c.systeem}" past in 3 kolommen`, past(c.systeem, 3));
  for (const r of en.uitgangspunten.vervormingen) toets(`vervorming "${r.onderdeel}" past in 3 kolommen`, past(r.onderdeel, 3));
  for (const r of belastingfactorTabel(2, "en")) toets(`factor "${r.naam}" past in 2 kolommen`, past(r.naam, 2));
  // De kop staat over de volle breedte van 190 mm, op 14 pt: niets dat afbreekt.
  const allen = (lijst) => lijst.flatMap((k) => [k, ...allen(k.kinderen ?? [])]);
  for (const k of allen(OPZET)) {
    if (em(`4.12 ${k.titel.en}`) * 14 * 1.08 > 10 * 53.8) toets(`kop "${k.titel.en}" past op een regel`, false);
  }
  const zonderMarge = en.teksten.inleiding.split("\n").every((r) => !r.startsWith(" "));
  toets("de meegeleverde teksten beginnen niet met witruimte", zonderMarge);
}

// ── 5. De echte afdruk ──────────────────────────────────────────────────────
kop("5. De afdruk als html");
{
  const { laadRapportAfdruk, perRegel, zichtbareRegels } = await import("./lib/rapport-html.mjs");
  const m = await laadRapportAfdruk();
  const project = JSON.parse(lees("fixtures/rapport-oud.json"));
  const zet = (rapport, extra = {}) => m.useProjectStore.getState().laadProject({ ...project, ...extra, rapport });
  const taal = (t) => m.i18next.changeLanguage(t);

  /** Vergelijkt met het gouden bestand en noemt de eerste regel die verschilt. */
  const naastGoud = async (naam, bestand, rapport, appTaal, extra = {}) => {
    await taal(appTaal);
    zet(rapport, extra);
    const html = perRegel(m.teken());
    if (BEWAAR && (appTaal === "nl" || appTaal === "zh-TW")) writeFileSync(join(hier, bestand), `${html}\n`);
    const goud = lees(bestand).trimEnd();
    const a = html.split("\n");
    const b = goud.split("\n");
    const i = a.findIndex((r, j) => r !== b[j]);
    toets(naam, html === goud, i < 0 ? `${a.length} tegen ${b.length} regels` : `regel ${i + 1}:\n         nu:   ${a[i]?.slice(0, 300)}\n         goud: ${b[i]?.slice(0, 300)}`);
  };
  const v4 = project.rapport;
  const v1 = kloon(v4);
  delete v1.versie;
  delete v1.opmaak;
  await naastGoud("oud rapport (versie 4), app op Nederlands: tot op de letter hetzelfde", "fixtures/rapport-oud-v4.html", v4, "nl");
  await naastGoud("oud rapport (van vóór het versienummer), app op Nederlands: tot op de letter hetzelfde", "fixtures/rapport-oud-v1.html", v1, "nl");
  await naastGoud("oud rapport, app op Engels: het rapport blijft Nederlands", "fixtures/rapport-oud-v4.html", v4, "en");
  zet(v4);
  gelijk("een oud rapport krijgt in de store Nederlands", m.useProjectStore.getState().rapport.taal, "nl");

  // Een compleet Engels rapport: elk onderdeel gevuld, elke module, en de app op Nederlands.
  const en = kloon(nieuw("en"));
  for (const [id, varianten] of Object.entries(STANDAARD_TEKSTEN)) en.teksten[id] = varianten[0].tekst.en;
  en.kenmerk = "2026-001-C01";
  en.fase = "VO";
  en.opdrachtgeverAdres = "1 Example Street\nExampletown";
  en.verantwoordelijk = "A. Example";
  en.uitvoerend = "B. Example";
  en.revisies = [
    { code: "A", datum: "12-03-2026", omschrijving: "First issue", status: "concept" },
    { code: "B", datum: "02-04-2026", omschrijving: "After comments", status: "ter goedkeuring" },
    { code: "C", datum: "14-05-2026", omschrijving: "Final", status: "definitief" },
  ];
  en.uitgangspunten.brand = { hoofddraagconstructie: "60", brandscheiding: "30", vluchtroute: "-", verwijzing: "Building regulations" };
  en.uitgangspunten.bestaand = { opnemen: true, bouwjaar: "1955", bron: "archive drawing", berekeningBeschikbaar: "Nee", materiaalgegevensBeschikbaar: "Ja" };
  en.belastingen.wind.gebouwhoogte = "9";
  en.belastingen.wind.coefficienten[0].omschrijving = "facade, pressure";
  en.belastingen.klassen = [
    { categorie: "A-vloer", lichteScheidingswanden: "0.80", dakhelling: "", qlast: "" },
    { categorie: "B", lichteScheidingswanden: "", dakhelling: "", qlast: "" },
    { categorie: "H-dak", lichteScheidingswanden: "", dakhelling: "17.5", qlast: "2.0" },
  ];
  en.belastingen.vloerenDaken = [{ soort: "vlak", naam: "Upper floor", lagen: [
    { naam: "floor plate", d: "", rho: "", p: "0.30" }, { naam: "boarding", d: "0,02", rho: "4,0", p: "" },
  ] }];
  en.belastingen.wanden = [{ soort: "gevel", naam: "Front facade", lagen: [
    { naam: "masonry", p: "2.00", h: "3.00", vulling: "90%" }, { naam: "window frame", p: "0.75", h: "3.00", vulling: "10%" },
  ] }];
  en.toelichting = { "ex-a": "Own notes on this sheet." };
  en.inHoofdstuk = { "ex-a": true, "ex-md": true };
  en.bijlagen = ["Structural overview"];
  en.bureau = { ...en.bureau, naam: "Example Engineers", constructeurs: [{ naam: "A. Example", telefoon: "", email: "" }] };
  const module = (id, naam, source) => ({ id, naam, templateId: id, source, waarden: {}, elementen: [] });
  const exemplaren = [
    module("ex-a", "Timber joists", balklaag),
    module("ex-b", "Steel beam", ligger),
    module("ex-c", "Pile cap", tweepaalspoer),
    module("ex-d", "Section stresses", doorsnedeSpanningen),
    { id: "ex-md", naam: "Foundation notes", templateId: "markdown", source: "", waarden: {}, elementen: [], md: { bestandsnaam: "notes.md", tekst: "# Foundation\n\nOwn text.", beelden: {} } },
    // De andere bladsoorten zonder inhoud: dan zegt elke soort op papier wat er ontbreekt.
    ...[[PDF_BLAD, "Supplier sheet"], [SPREADSHEET_BLAD, "Quantities"], [GRAAF_BLAD, "Moments as graph"], [TEKEN_BLAD, "Floor plan"], [JUPYTER_BLAD, "Notebook"], [MARIMO_BLAD, "Sliders"]]
      .map(([templateId, naam], i) => ({ id: `ex-soort-${i}`, naam, templateId, source: "", waarden: {}, elementen: [] })),
  ];
  const gegevens = { ...project.gegevens, project_naam: "Example project", opdrachtgever: "Example Ltd", locatie: "Exampletown" };

  for (const app of ["nl", "en"]) {
    await taal(app);
    zet(en, { exemplaren, gegevens, projectNaam: "Example project" });
    const html = m.teken();
    const regels = zichtbareRegels(html);
    const nl = regels.filter((r) => NL_WOORD.test(r));
    toets(`Engels rapport, app op ${app === "nl" ? "Nederlands" : "Engels"}: ${regels.length} regels, geen Nederlands`, nl.length === 0, nl.slice(0, 25).join("\n         "));
    toets(`de vaste woorden staan er: app op ${app}`, ["Contents", "Introduction", "Design basis", "Loads", "Calculations", "Consequence class", "Design working life (t)"].every((w) => regels.some((r) => r.includes(w))),
      regels.slice(0, 12).join(" | "));
    toets(`de rekenbladen rekenen in het Engels: app op ${app}`, /Timber joist floor/.test(html) && !/Balklaag —/.test(html));
    toets(`de bladsoorten op papier in het Engels: app op ${app}`, ["PDF attachment", "The PDF file of this sheet is missing.", "The workbook of this sheet is missing.", "The graph of this sheet is missing.", "The sheet of this drawing is missing.", "The work folder of this sheet is missing.", "The notebook of this sheet is missing."].every((w) => regels.some((r) => r.includes(w))),
      regels.filter((r) => /missing|Spreadsheet|PDF/.test(r)).join(" | "));
    gelijk(`de taal van de app blijft staan: ${app}`, m.i18next.language, app);
    // Zonder de formules: een index als E_0,05 is een naam, geen getal.
    const kommas = [...perRegel(html).matchAll(/.{0,60}>(\d+,\d+)</g)].map((k) => k[0]);
    toets(`getallen met een punt in de vaste tabellen: app op ${app}`, html.includes(">0.56<") && kommas.length === 0, kommas.slice(0, 8).join(" | "));
    toets(`een eigen getal met een komma staat op papier in de notatie van het rapport: app op ${app}`, html.includes(">0.02<") && html.includes(">4.0<"));
  }

  // Dezelfde ankers in beide talen: de inhoudsopgave en het zijpaneel wijzen ernaar.
  const ankersVan = (html) => [...html.matchAll(/data-inhoud="([^"]*)"/g)].map((a) => a[1]);
  await taal("en");
  const nlRapport = kloon(en);
  zet(nlRapport, { exemplaren, gegevens, projectNaam: "Example project" });
  const ankersEn = ankersVan(m.teken());
  zet(wisselTaal(kloon(en), "nl"), { exemplaren, gegevens, projectNaam: "Example project" });
  const nlHtml = m.teken();
  gelijk("de ankers in de afdruk veranderen niet met de taal", ankersVan(nlHtml), ankersEn);
  toets("hetzelfde rapport in het Nederlands, app op Engels", /Timber joists/.test(nlHtml) && /Balklaag —|Houten balklaag/.test(nlHtml) && /Inhoud/.test(nlHtml));

  // Een compleet traditioneel Chinees rapport (zh-TW, zeven hoofdstukken):
  // elk onderdeel gevuld, Taiwanese rekenmodules, en controle op afwezigheid van restanten Nederlands en Engels.
  const zh = kloon(standaardRapport(VANDAAG, {}, "zh-TW"));
  for (const [id, varianten] of Object.entries(STANDAARD_TEKSTEN)) {
    if (varianten[0]?.tekst?.["zh-TW"]) zh.teksten[id] = varianten[0].tekst["zh-TW"];
  }
  zh.kenmerk = "2026-TW-001";
  zh.fase = "細部設計";
  zh.opdrachtgeverAdres = "台北市中正區重慶南路一段 1 號";
  zh.verantwoordelijk = "王大明 技師";
  zh.uitvoerend = "李小華 工程師";
  zh.revisies = [
    { code: "A", datum: "12-03-2026", omschrijving: "初版發行", status: "concept" },
    { code: "B", datum: "02-04-2026", omschrijving: "依審查意見修正", status: "ter goedkeuring" },
    { code: "C", datum: "14-05-2026", omschrijving: "定稿出版", status: "definitief" },
  ];
  zh.bureau = {
    ...zh.bureau,
    naam: "示範結構技師事務所",
    constructeurs: [{ naam: "王大明", telefoon: "02-23456789", email: "wang@example.com.tw" }],
  };
  zh.bijlagen = ["結構總配置圖", "地質鑽探報告書"];
  zh.toelichting = { "ex-beam": "主梁撓曲與剪力檢核計算說明" };
  zh.inHoofdstuk = { "ex-beam": true, "ex-wall": true, "ex-drain": true };

  const twExemplaren = [
    { id: "ex-beam", naam: "大梁檢核", templateId: "tw-rc-beam", source: twRcBeam, waarden: {}, elementen: [] },
    { id: "ex-wall", naam: "擋土牆檢核", templateId: "tw-retaining-wall", source: twRetainingWall, waarden: {}, elementen: [] },
    { id: "ex-drain", naam: "排水溝水理", templateId: "tw-drainage-channel", source: twDrainageChannel, waarden: {}, elementen: [] },
  ];
  const twGegevens = {
    ...project.gegevens,
    project_naam: "台北商業大樓新建工程",
    opdrachtgever: "台灣建設股份有限公司",
    locatie: "台北市中正區",
  };

  await naastGoud("繁中報告（七章架構），app 在繁中：與黃金檔一致", "fixtures/rapport-zh-TW.html", zh, "zh-TW", { exemplaren: twExemplaren, gegevens: twGegevens, projectNaam: "台北商業大樓新建工程" });
  await naastGoud("繁中報告，app 在英文：報告內容維持繁中不變", "fixtures/rapport-zh-TW.html", zh, "en", { exemplaren: twExemplaren, gegevens: twGegevens, projectNaam: "台北商業大樓新建工程" });

  // Geen Nederlands of Engels in het traditioneel Chinese rapport
  await taal("zh-TW");
  zet(zh, { exemplaren: twExemplaren, gegevens: twGegevens, projectNaam: "台北商業大樓新建工程" });
  const zhHtml = m.teken();
  const zhRegels = zichtbareRegels(zhHtml);

  const zhNl = zhRegels.filter((r) => NL_WOORD.test(r));
  toets(`繁中報告：${zhRegels.length} 行，無殘留荷蘭文`, zhNl.length === 0, zhNl.slice(0, 10).join(" | "));

  const EN_RAPPORT_WOORD = new RegExp(`\\b(?:${[
    "the", "and", "for", "with", "from", "into", "during", "including", "without", "between",
    "Contents", "Introduction", "Design basis", "Loads", "Calculations", "Consequence class",
    "Design working life", "Applied standards", "Document details", "Structural advice",
    "Responsible engineer", "Design engineer", "Appendix", "First issue", "Final report",
    "Material data", "Existing calculation", "Terrain category", "Building height",
  ].join("|")})\\b`, "i");

  const zhEn = zhRegels.filter((r) => EN_RAPPORT_WOORD.test(r));
  toets(`繁中報告非公式文字：無殘留英文`, zhEn.length === 0, zhEn.slice(0, 10).join(" | "));

  // Zeven hoofdstukken van de Taiwanese structuur staan op papier
  const twKoppen = ["設計概要", "設計規範", "材料強度", "載重", "分析", "檢核", "附錄"];
  toets("台灣報告七章標題完整呈現", twKoppen.every((k) => zhRegels.some((r) => r.includes(k))),
    twKoppen.filter((k) => !zhRegels.some((r) => r.includes(k))).join(", "));
  toets("台灣固定詞彙完整呈現", ["目錄", "適用規範", "負責工程師", "設計工程師", "文件資料", "計算書狀態"].every((w) => zhRegels.some((r) => r.includes(w))));
}

console.log(fouten === 0 ? "\nRapport in andere talen: alles in orde." : `\n${fouten} controle(s) gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
