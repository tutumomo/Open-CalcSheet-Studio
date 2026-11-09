/**
 * De gewichtenbibliotheek: het programma (rapport/gewichtenBibliotheek.ts) en de gegevens
 * (library/gewichten/*.json).
 *
 *   1. meertalig.ts: Engels is de bron, een ontbrekende taal valt daarop terug;
 *   2. lezen: elk veld wordt gecontroleerd, een kapot bestand verandert niets;
 *   3. samenvoegen, toevoegen en wegschrijven;
 *   4. zoeken en filteren;
 *   5. invoegen in een opbouw: wat er in het rapport komt, is een kopie in getallen;
 *   6. de meegeleverde gegevens: eenheid en orde van grootte per categorie, bron en
 *      Engelse naam, unieke id's, p tegen d × ρ, en de omrekening van kg naar kN;
 *   7. de regels uit gewichten.ts staan er ongewijzigd in;
 *   8. een steekproef met de hand nagerekend, met het blad erbij;
 *   9. de app laadt de gegevens pas als het venster opent, en de teksten zijn compleet.
 *
 * Draaien:  node scripts/check-gewichten.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { inTaal } from "../packages/desktop/src/rapport/meertalig.ts";
import {
  aandachtspunten,
  alsGevellaagUitRegel,
  alsLaagUitRegel,
  alsOpbouwUitRegel,
  BANDBREEDTE,
  BIBLIOTHEEK_FORMAAT,
  BIBLIOTHEEK_VERSIE,
  bibliotheekAlsTekst,
  CATEGORIEEN,
  effectieveP,
  filterRegels,
  filterOpties,
  KG_NAAR_KN,
  leesBibliotheek,
  leesBibliotheekTekst,
  LEEG_EIGEN,
  maakRegel,
  openBestand,
  samenvoegenBestand,
  sorteerRegels,
  taalVoorRapport,
  verenigDelen,
  verwijderRegel,
  voegRegelToe,
  voegSamen,
  zichtbareRegels,
  zoekIndex,
} from "../packages/desktop/src/rapport/gewichtenBibliotheek.ts";
import { LAAGGROEPEN, OPBOUWEN, somVan } from "../packages/desktop/src/rapport/gewichten.ts";
import { gevelOpbouw, vlakOpbouw } from "../packages/desktop/src/rapport/opbouw.ts";

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const DESKTOP = join(WORTEL, "packages/desktop/src");
const GEGEVENS = join(WORTEL, "library/gewichten");

let fouten = 0;
function meld(ok, tekst, detail = "") {
  if (!ok) {
    fouten++;
    console.log(`  ✗  ${tekst}${detail ? `  -> ${detail}` : ""}`);
  } else console.log(`  ✓  ${tekst}`);
  return ok;
}
const gelijk = (tekst, a, b) => meld(JSON.stringify(a) === JSON.stringify(b), tekst, `${JSON.stringify(a)} is niet ${JSON.stringify(b)}`);
const bijna = (tekst, a, b, marge) => meld(Math.abs(a - b) <= marge, tekst, `${a} is niet ${b}`);
const kop = (tekst) => console.log(`\n${tekst}`);

// ── 1. meertalig.ts ─────────────────────────────────────────────────────────
kop("meertalig.ts");
gelijk("de gevraagde taal", inTaal({ en: "floor", nl: "vloer" }, "nl"), "vloer");
gelijk("een ontbrekende taal valt terug op Engels", inTaal({ en: "floor", nl: "vloer" }, "de"), "floor");

// ── 2. Lezen ────────────────────────────────────────────────────────────────
kop("Lezen: elk veld wordt gecontroleerd");
const regel = (over = {}) => ({
  id: "test-vloer-200",
  categorie: "vloeren",
  naam: { en: "hollow-core slab 200 mm", nl: "kanaalplaatvloer 200 mm" },
  p: 3.03,
  bron: { titel: "Testblad", url: "https://voorbeeld.invalid/blad.pdf", datum: "2024-03" },
  ...over,
});
const bestand = (regels = [regel()], over = {}) => ({
  formaat: BIBLIOTHEEK_FORMAAT,
  versie: BIBLIOTHEEK_VERSIE,
  naam: { en: "Test" },
  regels,
  ...over,
});
{
  const goed = leesBibliotheek(bestand());
  meld(goed.ok, "een goed bestand leest");
  gelijk("de regel komt ongewijzigd terug", goed.bibliotheek?.regels[0], regel());
  const vol = regel({
    d: 0.2, rho: 15, p: 3, toestand: "droog", leverancier: "Merk", regio: "NL",
    opmerking: { en: "note", nl: "opmerking" },
  });
  gelijk("alle velden blijven bewaard, in een vaste volgorde", Object.keys(leesBibliotheek(bestand([vol])).bibliotheek.regels[0]),
    ["id", "categorie", "naam", "d", "rho", "p", "toestand", "leverancier", "regio", "opmerking", "bron"]);
  const vreemd = leesBibliotheek(bestand([{ ...regel(), onzin: 1, html: "<script>" }])).bibliotheek.regels[0];
  gelijk("onbekende velden vallen weg", Object.keys(vreemd).includes("onzin") || Object.keys(vreemd).includes("html"), false);

  const weigert = (wat, x, soort) => {
    const u = leesBibliotheek(x);
    meld(!u.ok && (!soort || u.fout.soort === soort), `geweigerd: ${wat}`, JSON.stringify(u.ok ? "geaccepteerd" : u.fout));
  };
  weigert("niets", null, "geenBibliotheek");
  weigert("een lijst", [], "geenBibliotheek");
  weigert("een ander formaat", bestand(undefined, { formaat: "iets-anders" }), "geenBibliotheek");
  weigert("een nieuwere versie", bestand(undefined, { versie: BIBLIOTHEEK_VERSIE + 1 }), "teNieuw");
  weigert("een versie die geen getal is", bestand(undefined, { versie: "1" }), "geenBibliotheek");
  weigert("een naam zonder Engels", bestand(undefined, { naam: { nl: "Test" } }), "geenBibliotheek");
  weigert("regels die geen lijst zijn", bestand(undefined, { regels: {} }), "geenBibliotheek");
  const regelFout = (wat, over, veld) => {
    const u = leesBibliotheek(bestand([regel(), regel({ id: "tweede", ...over })]));
    meld(!u.ok && u.fout.soort === "regel" && u.fout.nummer === 2 && u.fout.veld === veld, `geweigerd: ${wat}, met de plek erbij`, JSON.stringify(u.ok ? "geaccepteerd" : u.fout));
  };
  regelFout("een id met spaties", { id: "een id" }, "id");
  regelFout("een onbekende categorie", { categorie: "sloten" }, "categorie");
  regelFout("een naam zonder Engels", { naam: { nl: "x" } }, "naam");
  regelFout("een lege naam", { naam: { en: "  " } }, "naam");
  regelFout("een naam met een rare taalcode", { naam: { en: "x", __proto__x: "y" } }, "naam");
  regelFout("p als tekst", { p: "3,03" }, "p");
  regelFout("p nul", { p: 0 }, "p");
  regelFout("p negatief", { p: -1 }, "p");
  regelFout("p oneindig", { p: Infinity }, "p");
  regelFout("ρ NaN", { rho: NaN }, "rho");
  regelFout("d negatief", { d: -0.1 }, "d");
  regelFout("geen waarde", { p: undefined }, "waarde");
  regelFout("alleen een dikte", { p: undefined, d: 0.2 }, "waarde");
  regelFout("een onbekende toestand", { toestand: "vochtig" }, "toestand");
  regelFout("een leverancier die geen tekst is", { leverancier: 3 }, "leverancier");
  regelFout("een regio die geen tekst is", { regio: {} }, "regio");
  regelFout("een opmerking zonder Engels", { opmerking: { nl: "x" } }, "opmerking");
  regelFout("geen bron", { bron: undefined }, "bron");
  regelFout("een bron zonder titel", { bron: { url: "https://x.invalid" } }, "bron.titel");
  regelFout("een script als adres", { bron: { titel: "x", url: "javascript:alert(1)" } }, "bron.url");
  regelFout("een bestand als adres", { bron: { titel: "x", url: "file:///c:/geheim.txt" } }, "bron.url");
  regelFout("een onleesbare datum", { bron: { titel: "x", datum: "gisteren" } }, "bron.datum");
  const dubbel = leesBibliotheek(bestand([regel(), regel()]));
  meld(!dubbel.ok && dubbel.fout.soort === "dubbelId", "geweigerd: een dubbel id in één bestand");
  const proto = leesBibliotheek(JSON.parse('{"formaat":"open-calcsheet-weight-library","versie":1,"naam":{"en":"x"},"regels":[{"id":"a","categorie":"vloeren","naam":{"en":"x","__proto__":{"y":1}},"p":1,"bron":{"titel":"x"}}]}'));
  meld(!proto.ok && ({}).y === undefined, "geweigerd: __proto__ als taalcode, en niets aan Object veranderd");

  const tekst = leesBibliotheekTekst("<html>");
  meld(!tekst.ok && tekst.fout.soort === "geenJson", "geweigerd: tekst die geen JSON is");
  meld(leesBibliotheekTekst(`﻿${JSON.stringify(bestand())}`).ok, "een byte-order mark vooraan mag");
  const groot = leesBibliotheekTekst(" ".repeat(32 * 1024 * 1024 + 1));
  meld(!groot.ok && groot.fout.soort === "teGroot", "geweigerd: een te groot bestand");
}

kop("Een kapot bestand verandert niets");
{
  const stand = { eigen: leesBibliotheek(bestand()).bibliotheek, gewijzigd: true };
  const voor = JSON.stringify(stand);
  for (const [wat, x] of [["geen JSON", "{kapot"], ["een kapotte regel", JSON.stringify(bestand([regel({ p: "x" })]))], ["een nieuwere versie", JSON.stringify(bestand(undefined, { versie: 99 }))]]) {
    const o = openBestand(stand, x);
    meld(o.stand === stand && o.fout !== null && JSON.stringify(stand) === voor, `openen met ${wat}: dezelfde stand en een melding`);
    const s = samenvoegenBestand(stand, x);
    meld(s.stand === stand && s.fout !== null && JSON.stringify(stand) === voor, `samenvoegen met ${wat}: dezelfde stand en een melding`);
  }
  const o = openBestand(stand, JSON.stringify(bestand([regel({ id: "nieuw" })])));
  gelijk("een goed bestand vervangt de eigen bibliotheek", [o.fout, o.stand.eigen.regels[0].id, o.stand.gewijzigd], [null, "nieuw", false]);
}

kop("Aandachtspunten: lezen gaat door, de melding blijft");
{
  gelijk("p gelijk aan d × ρ", aandachtspunten(regel({ d: 0.2, rho: 15, p: 3 })), []);
  gelijk("p wijkt meer dan 5% af van d × ρ", aandachtspunten(regel({ d: 0.2, rho: 15, p: 3.5 })), [{ soort: "tegenstrijdig", d_rho: 3 }]);
  gelijk("een hoog p, kg/m² vergeten om te rekenen", aandachtspunten(regel({ p: 268 })), [{ soort: "ordeVanGrootte", veld: "p" }]);
  gelijk("een hoge ρ, kg/m³ vergeten om te rekenen", aandachtspunten(regel({ categorie: "grond", p: undefined, rho: 1800 })), [{ soort: "ordeVanGrootte", veld: "rho" }]);
  gelijk("een hoge d, mm in plaats van m", aandachtspunten(regel({ d: 200 })), [{ soort: "ordeVanGrootte", veld: "d" }]);
  const u = leesBibliotheek(bestand([regel({ d: 0.2, rho: 15, p: 3.5 })]));
  gelijk("tegenstrijdig leest wel, met een melding", [u.ok, u.aandacht?.map((a) => a.id)], [true, ["test-vloer-200"]]);
  gelijk("een ingevulde p gaat voor d × ρ", effectieveP(regel({ d: 0.2, rho: 15, p: 3.5 })), 3.5);
  gelijk("zonder p: d × ρ", effectieveP(regel({ d: 0.2, rho: 15, p: undefined })), 3);
  gelijk("alleen ρ: geen gewicht per m²", effectieveP(regel({ rho: 15, p: undefined })), undefined);
}

// ── 3. Samenvoegen, toevoegen, wegschrijven ─────────────────────────────────
kop("Samenvoegen");
{
  const a = leesBibliotheek(bestand([regel(), regel({ id: "alleen-a" })])).bibliotheek;
  const b = leesBibliotheek(bestand([regel(), regel({ id: "alleen-a", p: 9 }), regel({ id: "alleen-b" })])).bibliotheek;
  const voorA = JSON.stringify(a);
  const voorB = JSON.stringify(b);
  const s = voegSamen(a, b);
  gelijk("een gelijke regel één keer, een afwijkende met een nieuw id, een nieuwe erbij",
    s.bibliotheek.regels.map((r) => r.id), ["test-vloer-200", "alleen-a", "alleen-a-2", "alleen-b"]);
  gelijk("wat er gebeurde wordt geteld", [s.toegevoegd, s.gelijk, s.hernoemd], [2, 1, 1]);
  gelijk("de afwijkende waarde blijft bij zijn nieuwe id", s.bibliotheek.regels[2].p, 9);
  meld(JSON.stringify(a) === voorA && JSON.stringify(b) === voorB, "beide bronnen blijven ongemoeid");
  const twee = voegSamen(s.bibliotheek, b);
  gelijk("nog een keer samenvoegen voegt alleen de afwijkende niet opnieuw toe", twee.bibliotheek.regels.length, 4);
  const opLeeg = samenvoegenBestand({ eigen: null, gewijzigd: false }, JSON.stringify(bestand()));
  gelijk("samenvoegen zonder eigen bibliotheek maakt er een", [opLeeg.stand.eigen.regels.length, opLeeg.stand.gewijzigd, opLeeg.stand.eigen.naam.en], [1, true, LEEG_EIGEN.en]);
}

kop("Toevoegen en wegschrijven");
{
  const leeg = { naamEn: "", naamNl: "", categorie: "vloeren", d: "", rho: "", rhoEenheid: "kN/m3", p: "", pEenheid: "kN/m2", toestand: "", leverancier: "", regio: "", opmerkingEn: "", opmerkingNl: "", bronTitel: "", bronUrl: "", bronDatum: "" };
  const bestaand = new Set(["eigen-mijn-vloer"]);
  const m = (over) => maakRegel({ ...leeg, ...over }, bestaand);
  gelijk("geen naam", m({ p: "3", bronTitel: "x" }).veld, "naam");
  gelijk("geen waarde", m({ naamEn: "x", bronTitel: "x" }).veld, "waarde");
  gelijk("geen bron", m({ naamEn: "x", p: "3" }).veld, "bron.titel");
  gelijk("een waarde die geen getal is", m({ naamEn: "x", p: "veel", bronTitel: "x" }).veld, "p");
  gelijk("een onveilig adres", m({ naamEn: "x", p: "3", bronTitel: "x", bronUrl: "javascript:x" }).veld, "bron.url");
  const r = m({ naamEn: "my floor", naamNl: "mijn vloer", p: "3,5", bronTitel: "Eigen meting" }).regel;
  gelijk("een komma als decimaalteken; id uit de naam, uniek gemaakt", [r.p, r.id], [3.5, "eigen-my-floor"]);
  const r2 = maakRegel({ ...leeg, naamEn: "Mijn vloer", p: "1", bronTitel: "x" }, bestaand).regel;
  gelijk("een id dat al bestaat krijgt een nummer", r2.id, "eigen-mijn-vloer-2");
  // 268 kg/m² × 0,00981 = 2,62908 kN/m²; 1850 kg/m³ × 0,00981 = 18,1485 kN/m³.
  const kg = m({ naamEn: "x", p: "268", pEenheid: "kg/m2", rho: "1850", rhoEenheid: "kg/m3", bronTitel: "Blad" }).regel;
  gelijk("kg/m² en kg/m³ worden omgerekend", [kg.p, kg.rho], [2.629, 18.149]);
  gelijk("en de omrekening staat erbij", kg.opmerking, { en: "268 kg/m² × 0.00981; 1850 kg/m³ × 0.00981", nl: "268 kg/m² × 0,00981; 1850 kg/m³ × 0,00981" });
  gelijk("alleen Nederlands ingevuld: dat wordt ook de Engelse bron", maakRegel({ ...leeg, naamNl: "vloer", p: "1", bronTitel: "x" }, bestaand).regel.naam, { en: "vloer", nl: "vloer" });

  const stand = voegRegelToe({ eigen: null, gewijzigd: false }, r);
  gelijk("toevoegen zonder eigen bibliotheek maakt er een", [stand.eigen.regels.length, stand.gewijzigd], [1, true]);
  const stand2 = voegRegelToe(stand, r2);
  gelijk("en voegt achteraan toe, zonder de vorige stand te wijzigen", [stand.eigen.regels.length, stand2.eigen.regels.length], [1, 2]);
  gelijk("verwijderen", verwijderRegel(stand2, r.id).eigen.regels.map((x) => x.id), [r2.id]);

  const b = stand2.eigen;
  const tekst = bibliotheekAlsTekst(b);
  gelijk("wegschrijven en teruglezen geeft hetzelfde", leesBibliotheekTekst(tekst).bibliotheek, b);
  meld(tekst.split("\n").filter((l) => l.includes('"id"')).length === 2, "elke regel op één regel tekst, zodat een wijziging in een vergelijking opvalt");
}

// ── 4. Zoeken en filteren ───────────────────────────────────────────────────
kop("Zoeken en filteren");
{
  const r = [
    regel({ id: "a", naam: { en: "hollow-core slab 200 mm", nl: "kanaalplaatvloer 200 mm" }, leverancier: "VBI", regio: "NL" }),
    regel({ id: "b", naam: { en: "hollow-core slab 1000 mm", nl: "kanaalplaatvloer 1000 mm" }, leverancier: "Lücking", regio: "DE" }),
    regel({ id: "c", categorie: "daken", naam: { en: "clay tile", nl: "keramische dakpan" }, leverancier: "VBI", regio: "BE", bron: { titel: "Pannenboek" } }),
    regel({ id: "d", categorie: "grond", naam: { en: "peat", nl: "veen" }, p: undefined, rho: 11, toestand: "verzadigd" }),
  ];
  const index = zoekIndex(r, "nl");
  const ids = (f) => filterRegels(index, { tekst: "", categorie: "", leverancier: "", regio: "", ...f }).map((x) => x.id);
  gelijk("niets ingevuld: alles", ids({}), ["a", "b", "c", "d"]);
  gelijk("zoeken in de naam", ids({ tekst: "dakpan" }), ["c"]);
  gelijk("ook in de andere taal", ids({ tekst: "tile" }), ["c"]);
  gelijk("alle woorden moeten voorkomen, in elke volgorde", ids({ tekst: "200 kanaalplaat" }), ["a"]);
  gelijk("accenten en hoofdletters maken niet uit", ids({ tekst: "LUCKING" }), ["b"]);
  gelijk("zoeken in de bron", ids({ tekst: "pannenboek" }), ["c"]);
  gelijk("op categorie", ids({ categorie: "daken" }), ["c"]);
  gelijk("op leverancier", ids({ leverancier: "VBI" }), ["a", "c"]);
  gelijk("op regio", ids({ regio: "DE" }), ["b"]);
  gelijk("samen", ids({ leverancier: "VBI", regio: "NL", tekst: "kanaal" }), ["a"]);
  gelijk("de keuzes voor de filters", [filterOpties(r, "leverancier"), filterOpties(r, "regio")], [["Lücking", "VBI"], ["BE", "DE", "NL"]]);
  gelijk("op naam en dan op getal gesorteerd, per categorie", sorteerRegels(r, "nl").map((x) => x.id), ["a", "b", "c", "d"]);
  const eigen = leesBibliotheek(bestand([regel({ id: "a", p: 9 }), regel({ id: "e" })])).bibliotheek;
  const zicht = zichtbareRegels(r, eigen);
  gelijk("een eigen regel gaat voor een meegeleverde met hetzelfde id", [zicht.length, zicht.find((x) => x.regel.id === "a").regel.p, zicht.find((x) => x.regel.id === "a").eigen], [5, 9, true]);
}

// ── 5. Invoegen ─────────────────────────────────────────────────────────────
kop("Invoegen in een opbouw");
{
  const naam = { en: "hollow-core slab 200 mm", nl: "kanaalplaatvloer 200 mm" };
  gelijk("gewicht per m²", alsLaagUitRegel(regel({ naam, p: 3.03 }), "nl"), { naam: "kanaalplaatvloer 200 mm", d: "", rho: "", p: "3,03" });
  gelijk("de naam volgt de taal", alsLaagUitRegel(regel({ naam, p: 3.03 }), "en").naam, "hollow-core slab 200 mm");
  gelijk("een taal zonder vertaling: Engels", alsLaagUitRegel(regel({ naam, p: 3.03 }), "de").naam, "hollow-core slab 200 mm");
  gelijk("alleen ρ: dikte leeg", alsLaagUitRegel(regel({ naam, p: undefined, rho: 20 }), "nl"), { naam: naam.nl, d: "", rho: "20,0", p: "" });
  gelijk("d en ρ", alsLaagUitRegel(regel({ naam, p: undefined, d: 0.1, rho: 20 }), "nl"), { naam: naam.nl, d: "0,100", rho: "20,0", p: "" });
  gelijk("p met een dikte: geen d zonder ρ in de tabel", alsLaagUitRegel(regel({ naam, p: 3.03, d: 0.2 }), "nl"), { naam: naam.nl, d: "", rho: "", p: "3,03" });
  // Zink 0,7 mm × 70,6 kN/m³ = 0,049 kN/m². Op drie decimalen zou d 0,001 worden en het gewicht 0,071.
  const dun = alsLaagUitRegel(regel({ naam, p: undefined, d: 0.0007, rho: 70.6 }), "nl");
  gelijk("een dikte die niet in drie decimalen past: het gewicht als p", dun, { naam: naam.nl, d: "", rho: "70,6", p: "0,049" });
  bijna("en de som in het rapport klopt dan", vlakOpbouw([dun]).som, 0.049, 1e-9);
  bijna("de som in het rapport voor d en ρ", vlakOpbouw([alsLaagUitRegel(regel({ p: undefined, d: 0.1, rho: 20 }), "nl")]).som, 2, 1e-9);
  gelijk("een nieuwe opbouw van één laag, met de naam als kop", alsOpbouwUitRegel(regel({ naam, p: 3.03 }), "nl"),
    { soort: "vlak", naam: "Kanaalplaatvloer 200 mm", lagen: [{ naam: naam.nl, d: "", rho: "", p: "3,03" }] });
  const gevel = alsGevellaagUitRegel(regel({ naam, p: 3.03 }), "nl");
  gelijk("als gevellaag: p ingevuld, h en vulling leeg", gevel, { naam: naam.nl, p: "3,03", h: "", vulling: "" });
  bijna("en q = p × h", gevelOpbouw([{ ...gevel, h: "3" }]).som, 9.09, 1e-9);
  gelijk("een gevellaag kan niet zonder gewicht per m²", alsGevellaagUitRegel(regel({ p: undefined, rho: 20 }), "nl"), null);
  gelijk("een gevellaag uit d × ρ", alsGevellaagUitRegel(regel({ naam, p: undefined, d: 0.1, rho: 20 }), "nl").p, "2,00");
  const r = regel({ naam, p: 3.03 });
  const laag = alsLaagUitRegel(r, "nl");
  laag.p = "9";
  gelijk("een eigen kopie: de bibliotheek blijft", r.p, 3.03);
  gelijk("de taal van het rapport gaat voor die van de app", [taalVoorRapport({ taal: "de" }, "nl-NL"), taalVoorRapport({}, "nl-NL")], ["de", "nl"]);
}

// ── 6. De meegeleverde gegevens ─────────────────────────────────────────────
kop("De meegeleverde gegevens");
const bestanden = existsSync(GEGEVENS) ? readdirSync(GEGEVENS).filter((f) => f.endsWith(".json")).sort() : [];
gelijk("één bestand per categorie", bestanden, [...CATEGORIEEN].sort().map((c) => `${c}.json`));
const delen = bestanden.map((f) => JSON.parse(readFileSync(join(GEGEVENS, f), "utf8")));
const totaal = verenigDelen(delen);
meld(totaal.ok, "alle delen lezen samen, zonder dubbele id's", JSON.stringify(totaal.ok ? "" : totaal.fout));
const REGELS = totaal.ok ? totaal.bibliotheek.regels : [];
console.log(`  ${REGELS.length} regels`);
{
  const stuk = [];
  for (const [i, deel] of delen.entries()) {
    const u = leesBibliotheek(deel);
    if (!u.ok) stuk.push(`${bestanden[i]}: ${JSON.stringify(u.fout)}`);
    else if (u.bibliotheek.regels.some((r) => `${r.categorie}.json` !== bestanden[i])) stuk.push(`${bestanden[i]}: regel in de verkeerde categorie`);
  }
  gelijk("elk deel is op zichzelf een geldige bibliotheek, met alleen zijn eigen categorie", stuk, []);

  const lijst = (tekst, f, detail = (r) => r.id) => {
    const mis = REGELS.filter(f);
    meld(mis.length === 0, tekst, mis.slice(0, 12).map(detail).join(", ") + (mis.length > 12 ? ` en ${mis.length - 12} andere` : ""));
  };
  lijst("elke regel een Engelse en een Nederlandse naam", (r) => !r.naam.en?.trim() || !r.naam.nl?.trim());
  lijst("elke regel een bron met titel", (r) => !r.bron?.titel?.trim());
  lijst("een bron buiten het eigen overzicht heeft een adres en een datum", (r) => !r.id.startsWith("eigen-") && (!r.bron.url || !r.bron.datum));
  lijst("geen bronnen met een delen-gelijk-licentie", (r) => /wikipedia\.org|wikimedia\.org|wikibooks\.org/i.test(r.bron.url ?? ""), (r) => r.bron.url);
  lijst("een opmerking heeft ook Nederlands", (r) => r.opmerking && !r.opmerking.nl);
  lijst("elke regel heeft een regio", (r) => !r.regio);
  const bandbreedte = (r) => aandachtspunten(r).some((a) => a.soort === "ordeVanGrootte");
  lijst("eenheid en orde van grootte per categorie", bandbreedte, (r) => `${r.id} (d ${r.d}, ρ ${r.rho}, p ${r.p})`);
  lijst("p en d × ρ spreken elkaar niet tegen", (r) => aandachtspunten(r).some((a) => a.soort === "tegenstrijdig"), (r) => `${r.id} (d ${r.d}, ρ ${r.rho}, p ${r.p})`);
  lijst("niet meer dan drie decimalen in p en ρ", (r) => [r.p, r.rho].some((v) => v !== undefined && Math.abs(v * 1000 - Math.round(v * 1000)) > 1e-6));

  // De omrekening staat aan de waarde: elk kg-getal in de opmerking wordt hier nagerekend.
  const leesKg = (tekst, eenheid) => {
    const m = new RegExp(`([0-9]+(?:\\.[0-9]+)?) ${eenheid} × 0\\.00981`).exec(tekst);
    return m ? Number(m[1]) : null;
  };
  let nagerekend = 0;
  const verkeerd = [];
  for (const r of REGELS) {
    const noot = r.opmerking?.en ?? "";
    const kgm2 = leesKg(noot, "kg/m²");
    if (kgm2 !== null) { nagerekend++; if (Math.abs(r.p - kgm2 * KG_NAAR_KN) > 0.00051) verkeerd.push(`${r.id}: ${kgm2} kg/m² en p ${r.p}`); }
    const kgm3 = leesKg(noot, "kg/m³");
    if (kgm3 !== null) { nagerekend++; if (Math.abs(r.rho - kgm3 * KG_NAAR_KN) > 0.00051) verkeerd.push(`${r.id}: ${kgm3} kg/m³ en ρ ${r.rho}`); }
    // 1 psf = 4,88243 kg/m²; 1 pcf = 16,0185 kg/m³.
    const psf = /([0-9]+(?:\.[0-9]+)?) psf × 4\.88243 × 0\.00981/.exec(noot);
    if (psf) { nagerekend++; if (Math.abs(r.p - Number(psf[1]) * 4.88243 * KG_NAAR_KN) > 0.00051) verkeerd.push(`${r.id}: ${psf[1]} psf en p ${r.p}`); }
    const pcf = /([0-9]+(?:\.[0-9]+)?) pcf × 16\.0185 × 0\.00981/.exec(noot);
    if (pcf) { nagerekend++; if (Math.abs(r.rho - Number(pcf[1]) * 16.0185 * KG_NAAR_KN) > 0.00051) verkeerd.push(`${r.id}: ${pcf[1]} pcf en ρ ${r.rho}`); }
    const nlNoot = r.opmerking?.nl ?? "";
    if (noot.includes("× 0.00981") && !nlNoot.includes("× 0,00981")) verkeerd.push(`${r.id}: de omrekening ontbreekt in het Nederlands`);
  }
  meld(verkeerd.length === 0, `omrekening van kg naar kN: ${nagerekend} waarden uit de opmerking nagerekend (1 kg = 0,00981 kN)`, verkeerd.slice(0, 8).join("; "));
  meld(nagerekend > 1000, "de omrekening wordt ook echt gevonden", String(nagerekend));

  // Kanaalplaten: door de kanalen lichter dan massief beton, maar niet minder dan 40% ervan,
  // en per reeks zwaarder naarmate dikker. Zo valt een verkeerd gelezen kolom op.
  const kanaal = REGELS.filter((r) => r.categorie === "vloeren" && /^kanaalplaat|spanbeton-kanaalplaat|^hollow-core/i.test(r.naam.nl) && r.d !== undefined && r.p !== undefined && r.d > 0.05);
  const licht = kanaal.filter((r) => r.p < 0.4 * r.d * 25 || r.p > 0.95 * r.d * 25);
  meld(kanaal.length > 40 && licht.length === 0, `${kanaal.length} kanaalplaten tussen 40% en 95% van massief beton`, licht.map((r) => `${r.id} ${r.p}`).slice(0, 8).join(", "));
  const reeksen = new Map();
  for (const r of REGELS.filter((x) => x.leverancier === "VBI" && /^kanaalplaatvloer \d+ mm \(VBI\)$/.test(x.naam.nl))) {
    reeksen.set(r.d, r.p);
  }
  const dikten = [...reeksen.keys()].sort((a, b) => a - b);
  meld(dikten.length >= 5 && dikten.every((d, i) => i === 0 || reeksen.get(d) > reeksen.get(dikten[i - 1])), `VBI: ${dikten.length} dikten, zwaarder naarmate dikker`, JSON.stringify([...reeksen]));

  // Nat en droog apart: bij een paar regels moet de natte zwaarder zijn dan de droge.
  const paren = new Map();
  for (const r of REGELS.filter((x) => x.toestand && x.p !== undefined)) {
    const sleutel = r.id.replace(/-(nat|droog|wet|dry|verzadigd|saturated)(-|$)/, "$2");
    paren.set(sleutel, { ...(paren.get(sleutel) ?? {}), [r.toestand]: r.p });
  }
  const omgekeerd = [...paren].filter(([, w]) => (w.nat !== undefined && w.droog !== undefined && w.nat < w.droog) || (w.verzadigd !== undefined && w.droog !== undefined && w.verzadigd < w.droog));
  meld(omgekeerd.length === 0, "nat of verzadigd is nooit lichter dan droog", omgekeerd.map(([k]) => k).slice(0, 8).join(", "));

  // Elke categorie is gevuld.
  const perCategorie = CATEGORIEEN.map((c) => [c, REGELS.filter((r) => r.categorie === c).length]);
  console.log(`  ${perCategorie.map(([c, n]) => `${c} ${n}`).join(", ")}`);
  meld(perCategorie.every(([, n]) => n >= 5), "elke categorie heeft regels");
}

// ── 7. De regels uit gewichten.ts ───────────────────────────────────────────
kop("De regels uit gewichten.ts");
{
  const eigen = REGELS.filter((r) => r.id.startsWith("eigen-"));
  meld(eigen.every((r) => r.bron.titel === "eigen gewichtenoverzicht"), "met als bron 'eigen gewichtenoverzicht'");
  const lagen = [...new Map(LAAGGROEPEN.flatMap((g) => g.lagen).map((l) => [l.naam, l])).values()];
  const mis = [];
  for (const l of lagen) {
    const r = eigen.find((x) => x.naam.nl === l.naam);
    if (!r) { mis.push(`${l.naam}: ontbreekt`); continue; }
    if (r.p !== l.p) mis.push(`${l.naam}: p ${r.p} en ${l.p}`);
    // Een regel met een vullingsgraad heeft in de bibliotheek alleen zijn p: die is geen d × ρ.
    const vulling = l.p !== undefined && l.d !== undefined && l.rho !== undefined && Math.abs(l.p - l.d * l.rho) > 1e-9;
    if (!vulling && (r.d !== l.d || r.rho !== l.rho)) mis.push(`${l.naam}: d ${r.d} en ${l.d}, ρ ${r.rho} en ${l.rho}`);
  }
  gelijk(`alle ${lagen.length} lagen, met dezelfde getallen`, mis, []);
  const samengesteld = OPBOUWEN.filter((o) => o.lagen.length > 1);
  const misO = samengesteld.filter((o) => {
    const r = eigen.find((x) => x.naam.nl === o.naam);
    return !r || Math.abs(r.p - somVan(o)) > 0.00051;
  });
  gelijk(`de ${samengesteld.length} opbouwen met meer lagen, met hun som als p`, misO.map((o) => o.naam), []);
}

// ── 8. Steekproef met de hand ───────────────────────────────────────────────
kop("Steekproef met de hand, met het blad erbij");
{
  // [id, veld, waarde volgens de hand]. De som staat bij elke regel; het getal komt uit het blad
  // dat in de regel als bron staat en is daar met de hand opgezocht.
  const STEEKPROEF = [
    // VBI, productblad kanaalplaatvloer 150: 268 kg/m² inclusief voegvulling.
    ["vbi-kanaalplaat-150", "p", 268 * 0.00981],
    // Silka, lijmblok LB10 high: 10,5 kg/blok × 16,7 blokken/m² = 175,35 kg/m².
    ["silka-lb10-high", "p", 10.5 * 16.7 * 0.00981],
    // Rockfon Blanka dB 46, 1200 × 600 × 50: 7,9 kg/m².
    ["rockfon-blanka-db46-50", "p", 7.9 * 0.00981],
    // Sandtoft Somerset: 43,7 kg/m² gelegd.
    ["sandtoft-somerset", "p", 43.7 * 0.00981],
    // Kingspan KS1000RW, 175 mm: 13,9 kg/m².
    ["kingspan-ks1000rw-nz-175", "p", 13.9 * 0.00981],
    // Rigips MW22RF, 255 mm, 2 × 12,5 mm op 2 × CW 100: 46,0 kg/m².
    ["rigips-mw22rf-255-2x12x5-cw100", "p", 46 * 0.00981],
    // binderholz AW02 b, 383,5 mm: 89,80 kg/m².
    ["binderholz-aw02b", "p", 89.8 * 0.00981],
    // Oldcastle Elematic H10, 10 inch: 71 psf; 71 × 4,88243 × 0,00981.
    ["oldcastle-elematic-h10", "p", 71 * 4.88243 * 0.00981],
    // Steel & Tube ComFlor 60, 200 mm droog: 3,88 kN/m² staat al in kN.
    ["steel-and-tube-comflor60-200-droog", "p", 3.88],
    // JSW SMD TR80+, 150 mm droog, normaalbeton: 2,45 kN/m².
    ["jsw-smd-tr80-150-droog", "p", 2.45],
    // Heidelberger VHD/VSD 18 cm, met verguss: 3,38 kN/m².
    ["heidelberger-vhd-vsd-18", "p", 3.38],
    // Hongkong DIL, gipsmortel: 18 kN/m³.
    ["hk-dil-gypsum-mortar", "rho", 18],
    // KBOB, koperplaat: 8900 kg/m³.
    ["kbob-copper-sheet", "rho", 8900 * 0.00981],
    // Knauf FE 50 Largo, droog, bovengrens: 2,1 kg/l = 2100 kg/m³.
    ["knauf-fe-50-largo-droog-max", "rho", 2100 * 0.00981],
    // Forbo Marmoleum 2,5 mm: 2900 g/m² = 2,9 kg/m².
    ["forbo-marmoleum-2-5", "p", 2.9 * 0.00981],
    // HUD Residential Structural Design Guide, water: 62,4 pcf; × 16,0185 × 0,00981.
    ["hud-rsdg-water", "rho", 62.4 * 16.0185 * 0.00981],
    // Op het beeld van de pagina nagekeken, want de tekstlaag van deze tabellen loopt door elkaar.
    // Ergon, technische gids 2.2.3: SP 150 inclusief voegvulling 2,45 kN/m²; SPZ 500 6,30 kN/m².
    ["ergon-sp-150", "p", 2.45],
    ["ergon-spz-500", "p", 6.3],
    // Ergon, technische gids 2.3.3: TTP 600 4,20 kN/m².
    ["ergon-ttp-600", "p", 4.2],
    // Calduran, assortimentsoverzicht: E100/538 99 kg/st × 1,85 st/m² = 183,15 kg/m².
    ["calduran-e100-538", "p", 99 * 1.85 * 0.00981],
    // Calduran: Waalformaat 2,1 kg/st × 68,7 st/m² = 144,27 kg/m².
    ["calduran-waalformaat", "p", 2.1 * 68.7 * 0.00981],
    // Van Nieuwpoort, productsheet breedplaat 50 mm: 125 kg/m².
    ["van-nieuwpoort-breedplaat-50", "p", 125 * 0.00981],
    // FP McCann, hollowcore load/span table: 250 mm 3,62 kN/m²; 260 mm 3,47 kN/m² (lichter, dat klopt).
    ["fp-mccann-hollowcore-250", "p", 3.62],
    ["fp-mccann-hollowcore-260", "p", 3.47],
    // Rigips MW11RF, 175 mm op CW 150: 24,0 kg/m².
    ["rigips-mw11rf-175-1x12x5-cw150", "p", 24 * 0.00981],
    // 台灣建築技術規則建築構造編第 11～15 條載重表
    ["tw-btr-t11-gewapend-beton", "rho", 2400 * 0.00981],
    ["tw-btr-t11-staal", "rho", 7850 * 0.00981],
    ["tw-btr-t14-cement-dekvloer", "p", 20 * 0.00981],
    ["tw-btr-t15-baksteenwand-240", "p", 440 * 0.00981],
    ["tw-btr-t12-romaanse-pan", "p", 60 * 0.00981],
    ["tw-btr-t13-brandwerende-plaat", "p", 20 * 0.00981],
  ];
  for (const [id, veld, hand] of STEEKPROEF) {
    const r = REGELS.find((x) => x.id === id);
    if (meld(!!r, `${id} bestaat`)) bijna(`${id}: ${veld} = ${hand.toFixed(3)}`, r[veld], hand, 0.00051);
  }
}

// ── 9. Laden en teksten ─────────────────────────────────────────────────────
kop("Laden en teksten");
{
  let groot = 0;
  for (const f of bestanden) {
    const s = statSync(join(GEGEVENS, f)).size;
    groot += s;
    meld(s <= 400 * 1024, `${f}: ${Math.round(s / 1024)} kB`);
  }
  meld(groot <= 1536 * 1024, `samen ${Math.round(groot / 1024)} kB`);

  const laden = readFileSync(join(DESKTOP, "rapport/gewichtenLaden.ts"), "utf8");
  meld(/import\.meta\.glob/.test(laden) && !/eager/.test(laden), "de delen laden pas op verzoek: elk deel is een eigen stuk in de bouw");
  const loop = (map) => readdirSync(map, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? loop(join(map, d.name)) : [join(map, d.name)]));
  const statisch = loop(DESKTOP).filter((p) => /\.tsx?$/.test(p) && /from\s+["'][^"']*library\/gewichten/.test(readFileSync(p, "utf8")));
  gelijk("niemand importeert de gegevens rechtstreeks", statisch, []);

  const en = JSON.parse(readFileSync(join(DESKTOP, "i18n/locales/en/gewichten.json"), "utf8"));
  const nl = JSON.parse(readFileSync(join(DESKTOP, "i18n/locales/nl/gewichten.json"), "utf8"));
  const sleutels = (o, voor = "") => Object.entries(o).flatMap(([k, v]) => (typeof v === "object" ? sleutels(v, `${voor}${k}.`) : [`${voor}${k}`]));
  gelijk("Engels en Nederlands hebben dezelfde sleutels", sleutels(en).sort(), sleutels(nl).sort());
  const bronnen = ["components/rapport/gewichten/GewichtenVenster.tsx", "components/rapport/gewichten/RegelFormulier.tsx", "components/rapport/gewichten/GewichtenSectie.tsx"].map((p) => readFileSync(join(DESKTOP, p), "utf8")).join("\n");
  meld(!/<form\b/.test(bronnen), "geen <form> rond ThemedSelect: die knoppen hebben geen type en zouden het versturen");
  const editor = readFileSync(join(DESKTOP, "components/rapport/paneel/OpbouwEditor.tsx"), "utf8");
  const gebruikt = [...bronnen.matchAll(/\bt\("([^"]+)"/g), ...editor.matchAll(/\btg\("([^"]+)"/g)].map((m) => m[1]);
  const alle = new Set(sleutels(en));
  const zoekMeervoud = (s) => alle.has(s) || alle.has(`${s}_one`);
  gelijk("elke gebruikte sleutel bestaat", gebruikt.filter((s) => !zoekMeervoud(s)), []);
  gelijk("de categorieën hebben een naam", CATEGORIEEN.filter((c) => !alle.has(`categorie.${c}`)), []);
  gelijk("de bandbreedte kent elke categorie", CATEGORIEEN.filter((c) => !BANDBREEDTE[c]), []);
  // Elk veld dat het lezen of het formulier kan melden, heeft een tekst.
  const velden = ["regel", "id", "categorie", "naam", "d", "rho", "p", "waarde", "toestand", "leverancier", "regio", "opmerking", "bron", "bron_titel", "bron_url", "bron_datum"];
  gelijk("elk veld heeft een naam in een foutmelding", velden.filter((v) => !alle.has(`veldNaam.${v}`)), []);
  gelijk("elk veld heeft een melding in het formulier", velden.filter((v) => v !== "regel" && !alle.has(`formulierFout.${v}`)), []);
  const config = readFileSync(join(DESKTOP, "i18n/config.ts"), "utf8");
  meld(/"gewichten"/.test(config) && /enGewichten/.test(config) && /nlGewichten/.test(config), "de teksten zijn aangemeld in i18n/config.ts");
}

console.log(fouten === 0 ? "\nGewichtenbibliotheek in orde." : `\n${fouten} fout(en) in de gewichtenbibliotheek.`);
process.exit(fouten === 0 ? 0 : 1);
