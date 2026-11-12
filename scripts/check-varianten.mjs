/**
 * Controle van de varianten van een blad (packages/desktop/src/store/varianten.ts,
 * rekenen/varianten.ts, store/projectBestand.ts en het attribuut
 * `ocss::blad::varianten` in packages/core/src/ifcx/).
 *
 * Toetst:
 *   • het model: de invoer van een variant (het blad plus de eigen waarden van de
 *     gekozen velden), een nieuwe naam, een cel zetten en wissen, velden weghalen,
 *     plakken uit een werkmap, een reeks, en het lezen van wat van buiten komt;
 *   • het bestand: opslaan en openen geeft dezelfde varianten, met een schema;
 *   • rekenen: een variant rekent als het blad met zijn eigen invoer, met de UC, het
 *     oordeel, de getallen en welke velden meedoen;
 *   • optimaliseren: per variant de kleinste waarde die voldoet, en nooit een waarde
 *     die niet voldoet;
 *   • toetsen: de vastgelegde antwoorden van FEM Studio voor de varianten blijven bij
 *     het opslaan in het bestand;
 *   • de tab: de velden met hun label en kop, en elke schermtekst van de tab in het
 *     Engels en het Nederlands;
 *   • papier: de tabellen onder het blad, met alleen de velden die verschillen.
 *
 * Handberekening van het toetsblad (M = 10 kNm, b = 75 mm, f = 24 N/mm²):
 *   W = b·h²/6, σ = M/W, UC = σ/f
 *   h = 225: W = 632 812,5 mm³, σ = 15,80 N/mm², UC = 0,658
 *   h = 200: W = 500 000 mm³,   σ = 20,00 N/mm², UC = 0,833
 *   h = 175: W = 382 812,5 mm³, σ = 26,12 N/mm², UC = 1,088
 *   h = 150: W = 281 250 mm³,   σ = 35,56 N/mm², UC = 1,481
 *   staal (b = 100 mm), h = 225: W = 843 750 mm³, σ = 11,85 N/mm², UC = 0,494
 *
 * Draaien:  node scripts/check-varianten.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import {
  leesVarianten,
  nieuweVariant,
  plakBlok,
  reeksWaarden,
  variantInvoer,
  zetCel,
  zetVelden,
} from "../packages/desktop/src/store/varianten.ts";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE } from "../packages/desktop/src/store/projectBestand.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import { readFileSync } from "node:fs";
import { alsAntwoord, evaluate, parse } from "../packages/core/dist/index.js";
import { kandidaten, oordeelVan, papierTabellen, rekenVariant, toetsDeel, variantToetsHashes, voldoetAan, zoekKleinste } from "../packages/desktop/src/rekenen/varianten.ts";
import * as cache from "../packages/desktop/src/rekenen/toetsCache.ts";
const { gebruikteToetsingen } = cache;
import { bladenVoorIfc } from "../packages/desktop/src/store/projectIfcx.ts";
import { readdirSync } from "node:fs";
import { DUBBELZINNIG, leesCel, variantVelden } from "../packages/desktop/src/components/calc/varianten/velden.ts";

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${ok || !detail ? "" : "  -> " + detail}`);
  if (!ok) fouten++;
}
const json = (x) => JSON.stringify(x);

console.log("Model");
{
  const v1 = { id: "a", naam: "V1", waarden: { h: "250", x: "9" } };
  meld(json(variantInvoer({ b: "75", h: "225" }, v1, ["h"])) === json({ b: "75", h: "250" }),
    "de invoer van een variant: het blad, plus de eigen waarden van de gekozen velden");
  meld(json(variantInvoer({ b: "75", h: "225" }, { id: "a", naam: "V1", waarden: { h: "" } }, ["h"])) === json({ b: "75", h: "225" }),
    "een lege eigen waarde volgt het blad");
  meld(json(variantInvoer({ b: "75" }, { id: "a", naam: "V1", waarden: { L_9: "4" } }, ["L_9"])) === json({ b: "75", L_9: "4" }),
    "een veld dat het blad (nog) niet heeft, gaat gewoon mee: de kern kent het dan niet");

  meld(nieuweVariant([{ id: "a", naam: "V1", waarden: {} }, { id: "b", naam: "V3", waarden: {} }]).naam === "V2",
    "een nieuwe variant krijgt het eerste vrije nummer");
  const n1 = nieuweVariant([]);
  const n2 = nieuweVariant([n1]);
  meld(n1.id !== n2.id && /^var-/.test(n1.id) && json(n1.waarden) === "{}", "een nieuwe variant heeft een eigen id en geen eigen waarden");
  meld(json(nieuweVariant([], { h: "300" }).waarden) === json({ h: "300" }), "of de meegegeven waarden");

  const vs = {
    velden: ["h", "L_1"],
    uitkomsten: [],
    lijst: [{ id: "a", naam: "V1", waarden: { h: "250", L_1: "4,5" }, gezocht: ["h"] }],
  };
  const gewist = zetCel(vs, "a", "h", "");
  meld(!("h" in gewist.lijst[0].waarden) && gewist.lijst[0].waarden.L_1 === "4,5", "een lege cel wist de eigen waarde");
  meld(!gewist.lijst[0].gezocht?.includes("h"), "en het teken van optimaliseren");
  meld(vs.lijst[0].waarden.h === "250", "het oude object blijft ongemoeid (ongedaan maken)");
  const getypt = zetCel(vs, "a", "h", "275");
  meld(getypt.lijst[0].waarden.h === "275" && !getypt.lijst[0].gezocht?.includes("h"), "typen zet de waarde en haalt het teken van optimaliseren weg");
  const minder = zetVelden(vs, ["L_1"]);
  meld(json(minder.velden) === json(["L_1"]) && !("h" in minder.lijst[0].waarden) && !minder.lijst[0].gezocht?.length,
    "een veld weghalen wist zijn eigen waarden en zijn teken");

  const plak = plakBlok({ velden: ["h", "L_1"], uitkomsten: [], lijst: [{ id: "a", naam: "V1", waarden: {} }] },
    "250\t275\t300\r\n4,5\t\t5\r\n", 0, 0);
  meld(plak.lijst.length === 3, "plakken: varianten erbij als het blok verder loopt, geen lege door de laatste regel", String(plak.lijst.length));
  meld(json(plak.lijst.map((v) => v.waarden)) === json([{ h: "250", L_1: "4,5" }, { h: "275" }, { h: "300", L_1: "5" }]),
    "plakken: rijen zijn velden, kolommen varianten, een lege cel volgt het blad", json(plak.lijst.map((v) => v.waarden)));
  meld(json(plak.lijst.map((v) => v.naam)) === json(["V1", "V2", "V3"]), "de nieuwe varianten heten V2 en V3");
  const plakMidden = plakBlok(plak, "9", 1, 2);
  meld(plakMidden.lijst[2].waarden.L_1 === "9" && plakMidden.lijst[2].waarden.h === "300", "plakken vanaf een gekozen cel");
  const plakTeVeel = plakBlok(plak, "1\n2\n3", 1, 0);
  meld(plakTeVeel.lijst[0].waarden.L_1 === "1" && json(plakTeVeel.velden) === json(["h", "L_1"]), "rijen voorbij het laatste veld vallen weg");
  const plakFout = plakBlok(plak, "abc\t260", 0, 0, (veld, w) => (/^\d+$/.test(w) ? w : null));
  meld(plakFout.lijst[0].waarden.h === "250" && plakFout.lijst[1].waarden.h === "260", "een ongeldige waarde laat de cel zoals hij was");

  meld(json(reeksWaarden(3, 4.5, 0.5)) === json([3, 3.5, 4, 4.5]), "een reeks van–tot–stap, met het eind erbij");
  meld(json(reeksWaarden(0.1, 0.3, 0.1)) === json([0.1, 0.2, 0.3]), "zonder afrondingsfouten in de getallen", json(reeksWaarden(0.1, 0.3, 0.1)));
  meld(json(reeksWaarden(5, 3, 1)) === json([5, 4, 3]), "ook aflopend");
  meld(json(reeksWaarden(0, 1, 0)) === "[]" && json(reeksWaarden(0, 1, NaN)) === "[]", "een stap van nul of geen getal: niets");
  meld(reeksWaarden(0, 100, 1).length === 50, "hoogstens 50 waarden");

  // De tabel toont alleen velden die het blad nog heeft: de rijen van het plakblok zijn die rijen.
  const metWeg = { velden: ["X_weg", "h", "L_1"], uitkomsten: [], lijst: [{ id: "a", naam: "V1", waarden: {} }] };
  const geplakt = plakBlok(metWeg, "250\t275\r\n4,5\t5", 0, 0, undefined, ["h", "L_1"]);
  meld(json(geplakt.lijst.map((v) => v.waarden)) === json([{ h: "250", L_1: "4,5" }, { h: "275", L_1: "5" }]),
    "plakken met een verdwenen veld: de rijen zijn de getoonde velden", json(geplakt.lijst.map((v) => v.waarden)));

  meld(leesVarianten(null) === undefined && leesVarianten({}) === undefined, "niets bruikbaars: geen varianten");
  const gelezen = leesVarianten({
    velden: ["h", 3, "L_1"],
    uitkomsten: ["w_fin", null],
    opPapier: true,
    lijst: [
      { id: "a", naam: "V1", waarden: { h: 250, L_1: "4" }, gezocht: ["h", 2] },
      { id: "a", naam: "", waarden: "kapot" },
      "geen variant",
    ],
    zoek: { veld: "h", van: "150", tot: "400", stap: "25", grens: 0.9 },
  });
  meld(json(gelezen?.velden) === json(["h", "L_1"]) && json(gelezen?.uitkomsten) === json(["w_fin"]), "alleen tekst in velden en uitkomsten");
  meld(gelezen?.lijst.length === 2 && json(gelezen.lijst[0].waarden) === json({ L_1: "4" }), "alleen tekst als waarde", json(gelezen?.lijst));
  meld(gelezen?.lijst[1].id !== "a" && gelezen?.lijst[1].naam === "V2" && json(gelezen?.lijst[1].waarden) === "{}",
    "een dubbel id krijgt een nieuw id, een lege naam een vrije");
  meld(json(gelezen?.lijst[0].gezocht) === json(["h"]) && gelezen?.opPapier === true && gelezen?.zoek?.grens === 0.9, "teken, vinkje en zoekopdracht blijven");
  meld(leesVarianten({ velden: [], uitkomsten: [], lijst: [] }) === undefined, "lege varianten: geen varianten");
  meld(leesVarianten({ velden: ["h"], lijst: [], zoek: { veld: 3 } })?.zoek === undefined, "een kapotte zoekopdracht valt weg");
}

console.log("\nBestand");
{
  const varianten = {
    velden: ["h", "L_1"],
    uitkomsten: ["w_fin"],
    opPapier: true,
    zoek: { veld: "h", van: "150", tot: "400", stap: "25", grens: 1 },
    lijst: [
      { id: "var-1", naam: "V1", waarden: { h: "250" }, gezocht: ["h"] },
      { id: "var-2", naam: "lang", waarden: { L_1: "4,5", h: "275" } },
    ],
  };
  const project = (vs) => ({
    versie: PROJECT_FORMAAT_VERSIE,
    naam: "Varianten",
    gegevens: legeGegevens(),
    exemplaren: [{ id: "ex-1", naam: "Ligger", templateId: "", source: "h = ?*(mm)\nL_1 = ?*(m)", waarden: { h: "225" }, elementen: [], ...(vs ? { varianten: vs } : {}) }],
  });
  const tekst = bouwProjectBestand(project(varianten), null);
  const doc = JSON.parse(tekst);
  meld(Object.keys(doc.schemas ?? {}).includes("ocss::blad::varianten"), "het attribuut heeft een schema in het bestand");
  const terug = leesProjectBestand(tekst, "x").exemplaren[0].varianten;
  meld(json(terug) === json(leesVarianten(varianten)), "opslaan en openen: dezelfde varianten", json(terug));
  meld(terug?.lijst[1].waarden.L_1 === "4,5", "een komma blijft een komma");
  const zonder = bouwProjectBestand(project(undefined), null);
  meld(!zonder.includes("ocss::blad::varianten\":") || !JSON.stringify(JSON.parse(zonder).data).includes("ocss::blad::varianten"),
    "een blad zonder varianten schrijft het attribuut niet");
  meld(leesProjectBestand(zonder, "x").exemplaren[0].varianten === undefined, "en opent zonder varianten");
}

const TOETSBLAD = [
  '"Toets',
  '@select materiaal "Materiaal"',
  "  Hout = 1",
  "  Staal = 2",
  "@end",
  "#if materiaal ≡ 1",
  "    b = ?{75}*(mm)', breedte'",
  "#else",
  "    b = 100 mm",
  "#end if",
  "h = ?{225}*(mm)', hoogte'",
  "M = 10 kN*m",
  "W = b*h^2/6 to mm^3",
  "sigma = M/W to N/mm^2",
  "UC_max = sigma/(24 N/mm^2)",
  "#if UC_max ≤ 1.0",
  "    'Maatgevende UC = 'UC_max' → voldoet",
  "#else",
  "    'Maatgevende UC = 'UC_max' → voldoet niet",
  "#end if",
].join("\n");
const dichtbij = (a, b, tol = 0.001) => typeof a === "number" && Math.abs(a - b) <= tol;
const reken = (waarden) => rekenVariant(TOETSBLAD, waarden, {}, "Toets");

console.log("\nRekenen");
{
  const blad = reken({});
  meld(dichtbij(blad.resultaat.uc, 0.658) && blad.resultaat.voldoet === true, "het blad: UC 0,658, voldoet", json(blad.resultaat));
  const laag = reken({ h: "150" });
  meld(dichtbij(laag.resultaat.uc, 1.481) && laag.resultaat.voldoet === false, "h = 150: UC 1,481, voldoet niet", json(laag.resultaat));
  meld(dichtbij(laag.getallen.W, 281250, 0.5), "de getallen van de variant: W = 281 250 mm³", String(laag.getallen.W));
  meld(/^35\.56? N/.test(laag.teksten.sigma ?? ""), "de getoonde tekst met eenheid: σ = 35,56 N/mm²", laag.teksten.sigma);
  const staal = reken({ materiaal: "2" });
  meld(dichtbij(staal.resultaat.uc, 0.494), "staal (b = 100 mm uit het blad): UC 0,494", String(staal.resultaat.uc));
  meld(!staal.actief.includes("b") && staal.actief.includes("h") && staal.actief.includes("materiaal"),
    "bij staal doet b niet mee, h en het materiaal wel", json(staal.actief));
  meld(reken({}).actief.includes("b"), "bij hout doet b mee");
  const kapot = rekenVariant('"Kapot\nx = (\ny = onbekend*2', {}, {}, "Kapot");
  meld(/^Error: Unexpected end/.test(kapot.fout ?? ""), "een regel met een fout: de eerste fout van het blad, voor in de tabel", kapot.fout);
  meld(reken({}).fout === undefined, "zonder fout geen fout");
}

console.log("\nOptimaliseren");
{
  const veldH = { naam: "h", soort: "invoer", beginwaarde: "225", eenheid: "mm", keuzes: [] };
  const zoek = { veld: "h", van: "150", tot: "300", stap: "25", grens: 1 };
  const reeks = ["150", "175", "200", "225", "250", "275", "300"];
  meld(json(kandidaten(veldH, zoek)) === json(reeks), "de kandidaten: van–tot–stap, oplopend", json(kandidaten(veldH, zoek)));
  meld(json(kandidaten(veldH, { ...zoek, van: "300", tot: "150" })) === json(reeks), "ook als van groter is dan tot: van klein naar groot");
  meld(json(kandidaten(veldH, { ...zoek, van: "1,5e2" })) === json(reeks), "een komma als decimaalteken");
  meld(kandidaten(veldH, { ...zoek, stap: "0" }).length === 0 && kandidaten(veldH, { ...zoek, van: "x" }).length === 0, "geen bruikbaar bereik: geen kandidaten");
  const keuze = { naam: "k", soort: "keuze", beginwaarde: "2", eenheid: "", keuzes: [
    { text: "C24", value: "2" }, { text: "C18", value: "1" }, { text: "C30", value: "3" }, { text: "GL24h", value: "4" },
  ] };
  meld(json(kandidaten(keuze, { veld: "k", van: "1", tot: "4", grens: 1 })) === json(["1", "3", "4"]),
    "een keuzelijst: van keuze tot keuze, in de volgorde van het blad");
  meld(json(kandidaten(keuze, { veld: "k", van: "4", tot: "1", grens: 1 })) === json(["1", "3", "4"]), "ook omgekeerd gekozen");

  const beoordeel = async (w) => reken({ h: w }).resultaat;
  const gevonden = await zoekKleinste(kandidaten(veldH, zoek), beoordeel, 1);
  meld(gevonden.waarde === "200", "de kleinste die voldoet: h = 200 (UC 0,833; 175 geeft 1,088)", json(gevonden));
  meld((await zoekKleinste(kandidaten(veldH, zoek), beoordeel, 0.8)).waarde === "225", "met een grens van 0,80: h = 225 (UC 0,658)");
  meld((await zoekKleinste(["150", "175"], beoordeel, 1)).geen === true, "niets voldoet: geen waarde");
  const zonderOordeel = async () => ({ titel: "", norm: "", uc: null, voldoet: null });
  meld((await zoekKleinste(["150", "175"], zonderOordeel, 1)).geen === true, "een blad zonder oordeel: geen waarde");
  meld((await zoekKleinste(["150", "175"], async () => null, 1)).geen === true, "een blad dat niet doorrekent: geen waarde");
  let gevraagd = 0;
  const afgebroken = await zoekKleinste(["150", "175", "200"], async (w) => (gevraagd++, beoordeel(w)), 1, () => gevraagd >= 1);
  meld(afgebroken.afgebroken === true && gevraagd === 1, "afbreken stopt het zoeken", json(afgebroken));

  meld(voldoetAan({ uc: 0.9, voldoet: true }, 1) && !voldoetAan({ uc: 0.9, voldoet: true }, 0.8), "voldoet: oordeel van het blad en UC binnen de grens");
  meld(!voldoetAan({ uc: 0.5, voldoet: false }, 1), "een blad dat afkeurt, voldoet nooit, ook niet met een lage UC");
  meld(!voldoetAan({ uc: 0.5, voldoet: null, nietGetoetst: true }, 1), "niet getoetst voldoet niet");
  meld(voldoetAan({ uc: null, voldoet: true }, 1) && !voldoetAan({ uc: null, voldoet: true }, 0.9), "zonder UC alleen bij een grens van 1 of hoger");
}

console.log("\nToetsen");
{
  const fixture = JSON.parse(readFileSync(new URL("./fixtures/toets-staal.json", import.meta.url), "utf8"));
  const bron = ["h = ?{3}*(m)", "@toets kolom = check_steel_beam", '  profile_name = "HEA200"', "  length_m = h", "@end", "UC_max = kolom.uc_max"].join("\n");
  const hashVan = (h) => evaluate(parse(bron), { h }, {}, { toetsModus: "vragen" }).find((n) => n.type === "toets").hash;
  const vast = (h) => ({
    tool: "check_steel_beam",
    verzoek: { profile_name: "HEA200", length_m: Number(h) },
    uitkomst: fixture.staal.structuredContent,
    datum: "2026-11-01T08:00:00.000Z",
    herkomst: { versie: "2026.44.2" },
  });
  const [h3, h4, h5, h6] = ["3", "4", "5", "6"].map(hashVan);
  meld(new Set([h3, h4, h5, h6]).size === 4, "elke invoer een eigen hash");
  const varianten = { velden: ["h"], uitkomsten: [], lijst: [
    { id: "a", naam: "V1", waarden: { h: "4" } },
    { id: "b", naam: "V2", waarden: { h: "5" } },
  ] };
  const ex = { id: "ex-1", naam: "Kolom", templateId: "", source: bron, waarden: { h: "3" }, elementen: [],
    toetsingen: { [h3]: vast("3"), [h4]: vast("4"), [h5]: vast("5"), [h6]: vast("6") } };
  meld(json(variantToetsHashes({ ...ex, varianten }, {}).sort()) === json([h4, h5].sort()), "de hashes van de varianten");
  meld(variantToetsHashes({ ...ex, source: "h = ?*(m)", varianten }, {}).length === 0 && variantToetsHashes(ex, {}).length === 0,
    "zonder @toets of zonder varianten: niets");
  const nodes = evaluate(parse(bron), ex.waarden, {}, { toetsModus: "lezen" });
  meld(Object.keys(gebruikteToetsingen(ex.toetsingen, { nodes }, [h4]) ?? {}).sort().join() === [h3, h4].sort().join(),
    "gebruikteToetsingen: wat de varianten gebruiken telt mee");
  const project = (e) => ({ versie: PROJECT_FORMAAT_VERSIE, naam: "Toets", gegevens: legeGegevens(), exemplaren: [e] });
  const opslaan = (p) => bouwProjectBestand(p, bladenVoorIfc(p));
  const terug = (tekst) => Object.keys(leesProjectBestand(tekst, "x").exemplaren[0].toetsingen ?? {}).sort().join();
  meld(terug(opslaan(project({ ...ex, varianten }))) === [h3, h4, h5].sort().join(), "opslaan met varianten: de antwoorden van blad en varianten blijven, de rest valt weg");
  meld(terug(opslaan(project(ex))) === h3, "zonder varianten: alleen die van het blad");

  // De worker heeft geen eigen cache: de antwoorden komen mee in de opties (variantRekenen.ts).
  const eigen = { toetsingen: { [h4]: alsAntwoord(vast("4")) }, toetsModus: "lezen" };
  const metAntwoord = rekenVariant(bron, { h: "4" }, {}, "Kolom", { evalOpties: eigen });
  meld(typeof metAntwoord.resultaat.uc === "number" && Math.abs(metAntwoord.getallen.UC_max - metAntwoord.resultaat.uc) < 1e-4,
    "meegegeven antwoorden gelden, ook zonder cache", json(metAntwoord.resultaat));
  const zonder = rekenVariant(bron, { h: "4" }, {}, "Kolom");
  meld(zonder.resultaat.uc === null || Number.isNaN(zonder.resultaat.uc) || zonder.getallen.kolom_uc_max === undefined,
    "zonder antwoord geen UC uit FEM Studio", json(zonder.getallen));

  // Een antwoord van deze sessie bij het blad vastleggen verandert niets aan de antwoorden:
  // dan geen nieuwe versie, anders rekent elke tabel met @toets bij elke vastlegging opnieuw.
  cache.wisSessie();
  cache.zetVastgelegd([]);
  cache.zetToetsAntwoord(h4, alsAntwoord(vast("4")), vast("4"));
  const v0 = cache.toetsVersie();
  cache.zetVastgelegd([{ [h4]: vast("4") }]);
  meld(cache.toetsVersie() === v0, "een sessieantwoord vastleggen: geen nieuwe versie");
  cache.zetVastgelegd([{ [h4]: vast("4"), [h5]: vast("5") }]);
  meld(cache.toetsVersie() > v0, "een vastgelegd antwoord dat de sessie niet had: wel een nieuwe versie");
  cache.wisSessie();
  cache.zetVastgelegd([]);

  // De sleutel van een kolom hangt alleen af van de antwoorden die hij gebruikt.
  const voor = toetsDeel(bron, [h4], { [h4]: alsAntwoord(vast("4")) });
  meld(toetsDeel("h = ?*(m)", [h4], {}) === "", "zonder @toets: geen toetsdeel in de sleutel");
  meld(toetsDeel(bron, undefined, {}) !== toetsDeel(bron, [h4], {}), "nog niet doorgerekend: een eigen deel");
  meld(toetsDeel(bron, [h4], { [h4]: alsAntwoord(vast("4")), [h5]: alsAntwoord(vast("5")) }) === voor, "een antwoord voor een andere invoer verandert de sleutel niet");
  meld(toetsDeel(bron, [h4], {}) !== voor && toetsDeel(bron, [h4], { [h4]: { ok: false, melding: "x" } }) !== voor, "een nieuw of mislukt antwoord voor deze invoer wel");
}

console.log("\nDe tab");
{
  const velden = variantVelden(parse([
    "# 1. Materiaal",
    '@select materiaal "Materiaal"',
    "  Hout = 1",
    "  Staal = 2",
    "@end",
    "#if materiaal ≡ 1",
    "    b = ?*(mm)', breedte<span class=\"kolom-3\"></span>'",
    "#end if",
    "#if materiaal ≡ 1",
    "    L_1 = ?*(m)', lengte van de uitkraging'",
    "#else",
    "    L_1 = ?*(m)', veld 1'",
    "    L_1 = ?*(m)', veld 1'",
    "#end if",
    "# 2. Belasting",
    "q_1,e = ?*(kN/m)', in b (0 in een van beide: driehoek)<span class=\"alleen-scherm\"></span>'",
    "N = ?*(kN)",
    "'Normale kracht",
  ].join("\n")));
  meld(json(velden.map((v) => v.naam)) === json(["materiaal", "b", "L_1", "q_1_e", "N"]), "alle velden, ook in een #if-tak", json(velden.map((v) => v.naam)));
  const per = Object.fromEntries(velden.map((v) => [v.naam, v]));
  meld(per.b.label === "breedte" && per.b.kop === "1. Materiaal" && per.b.eenheid === "mm", "het label naast het veld, de kop erboven en de eenheid", json(per.b));
  meld(per.materiaal.label === "Materiaal" && per.materiaal.soort === "keuze", "een keuzelijst met zijn label");
  meld(per.q_1_e.label === "in b (0 in een van beide: driehoek)" && per.q_1_e.kop === "2. Belasting", "uitleg zonder html en zonder komma vooraan", per.q_1_e.label);
  meld(per.N.label === "", "een tekstregel op een eigen regel is geen label", per.N.label);
  meld(per.L_1.label === "lengte van de uitkraging / veld 1", "een veld in meer takken: elk ander label één keer", per.L_1.label);

  // Elke vaste sleutel t("varianten.…") in de tab bestaat in beide talen.
  const map = new URL("../packages/desktop/src/components/calc/varianten/", import.meta.url);
  const bronnen = readdirSync(map).filter((f) => f.endsWith(".tsx")).map((f) => readFileSync(new URL(f, map), "utf8"));
  bronnen.push(readFileSync(new URL("../packages/desktop/src/App.tsx", import.meta.url), "utf8"));
  const sleutels = new Set(bronnen.flatMap((b) => [...b.matchAll(/\bt\(\s*["'`](varianten\.[\w.]+)["'`]/g)].map((m) => m[1])));
  const taal = (code) => JSON.parse(readFileSync(new URL(`../packages/desktop/src/i18n/locales/${code}/werkruimte.json`, import.meta.url), "utf8"));
  const heeft = (obj, pad) => {
    const delen = pad.split(".");
    const laatste = delen.pop();
    let o = obj;
    for (const d of delen) o = o?.[d];
    return o !== undefined && (laatste in o || `${laatste}_one` in o);
  };
  for (const code of ["en", "nl"]) {
    const ontbreekt = [...sleutels].filter((s) => !heeft(taal(code), s));
    meld(sleutels.size > 20 && ontbreekt.length === 0, `elke tekst van de tab in ${code} (${sleutels.size} sleutels)`, ontbreekt.join(", "));
  }
  const menu = ["bekijk", "overnemen", "alsBlad", "kopie", "hernoem", "verwijder"];
  meld(["en", "nl"].every((c) => menu.every((a) => taal(c).varianten?.menu?.[a])), "het menu van een variant, ook met een berekende sleutel");

  // Een cel leest wat je typt zoals een invoerveld, maar weigert een getal dat twee kanten op kan.
  const mm = { naam: "h", soort: "invoer", beginwaarde: "0", eenheid: "mm", keuzes: [] };
  const m = { naam: "L", soort: "invoer", beginwaarde: "0", eenheid: "m", keuzes: [] };
  meld(json(leesCel(m, "4500 mm")) === json({ waarde: "4.5" }) && json(leesCel(m, "4,5")) === json({ waarde: "4,5" }), "een eenheid erachter en een komma");
  meld(json(leesCel(m, "#2.L_1")) === json({ waarde: "#2.L_1" }), "een verwijzing naar een ander blad");
  for (const t of ["5.000", "12.500", "1.234,5", "1,234.5", "5,000"]) {
    meld(leesCel(mm, t).fout === DUBBELZINNIG, `"${t}" is dubbelzinnig (duizendtal of decimaal) en wordt niet opgeslagen`, json(leesCel(mm, t)));
  }
  meld(json(leesCel(mm, "0.125")) === json({ waarde: "0.125" }) && json(leesCel(mm, "5000")) === json({ waarde: "5000" }) && json(leesCel(mm, "12,5")) === json({ waarde: "12,5" }),
    "0.125, 5000 en 12,5 zijn gewoon getallen");
  meld("fout" in leesCel(mm, "3 kN"), "een eenheid die niet past");
  const keuzeVeld = { naam: "k", soort: "keuze", beginwaarde: "2", eenheid: "", keuzes: [{ text: "C24", value: "2" }, { text: "C30", value: "3" }] };
  meld(json(leesCel(keuzeVeld, "c30")) === json({ waarde: "3" }) && json(leesCel(keuzeVeld, "2")) === json({ waarde: "2" }) && "fout" in leesCel(keuzeVeld, "C99"),
    "een keuzelijst neemt de tekst of de waarde van een keuze");

  // Het oordeel van een kolom: een regel met een fout is nooit "voldoet".
  const r = (voldoet, extra = {}) => ({ resultaat: { titel: "", norm: "", uc: 0.5, voldoet }, ...extra });
  meld(oordeelVan(r(true)) === "voldoet" && oordeelVan(r(false)) === "voldoetNiet" && oordeelVan(r(null)) === "geen", "voldoet, voldoet niet, geen oordeel");
  meld(oordeelVan(r(true, { fout: "Error: x" })) === "nietGetoetst", "voldoet met een fout in het blad: niet getoetst");
  meld(oordeelVan({ resultaat: { titel: "", norm: "", uc: null, voldoet: null, nietGetoetst: true } }) === "nietGetoetst" && oordeelVan(null) === "geen", "niet getoetst, en geen uitkomst");
}

console.log("\nPapier");
{
  const velden = [
    { naam: "h", soort: "invoer", beginwaarde: "225", eenheid: "mm", keuzes: [] },
    { naam: "L_1", soort: "invoer", beginwaarde: "0", eenheid: "m", keuzes: [] },
    { naam: "q_1", soort: "invoer", beginwaarde: "0", eenheid: "kN/m", keuzes: [] },
  ];
  const lijst = Array.from({ length: 11 }, (_, i) => ({ id: `v${i}`, naam: `V${i + 1}`, waarden: i === 0 ? { q_1: "3,0", weg: "1" } : { h: String(200 + 25 * i) } }));
  const vs = { velden: ["h", "L_1", "q_1", "weg"], uitkomsten: [], lijst };
  const tabellen = papierTabellen(velden, vs, { h: "225", L_1: "4", q_1: "3" }, 8);
  meld(tabellen.length === 2 && tabellen[0].kolommen.length === 9 && tabellen[1].kolommen.length === 4,
    "11 varianten, 8 per tabel: twee tabellen met 9 en 4 kolommen", json(tabellen.map((t) => t.kolommen.length)));
  meld(tabellen.every((t) => t.kolommen[0] === null) && tabellen[1].kolommen[1]?.naam === "V9", "elke tabel begint met de kolom Blad, daarna de varianten op volgorde");
  meld(json(tabellen[0].rijen) === json(["h"]) && json(tabellen[1].rijen) === json(["h"]),
    "alleen de velden waarin een variant verschilt: q_1 = 3,0 is 3, L_1 heeft niemand, een veld dat het blad niet heeft valt weg", json(tabellen[0].rijen));
  meld(papierTabellen(velden, { ...vs, lijst: [] }, {}, 8).length === 0, "zonder varianten geen tabel");
}

console.log(fouten ? `\n${fouten} fout(en)` : "\nAlles in orde");
process.exit(fouten ? 1 : 0);
