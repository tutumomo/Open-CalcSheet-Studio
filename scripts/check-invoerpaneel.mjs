/**
 * Controle van het invoerscherm van een rekenblad
 * (packages/desktop/src/components/calc/invoer/).
 *
 * Een rekenblad zonder eigen parametrisch beeld krijgt een formulier uit zijn eigen
 * invoervelden; de bedrijfsvloer op palen krijgt daarboven een plattegrond en een
 * doorsnede die de invoer volgen. Toetst:
 *   • de velden: uit het doorgerekende blad, in de volgorde van het blad, onder zijn
 *     koppen, met toelichting en eenheid; een veld dat het blad nu niet toont (een tak
 *     van `#if` die niet gekozen is, `#hide`) staat er niet, en elk ingebouwd blad
 *     toont in het paneel precies de velden van zijn uitwerking;
 *   • de taal: de koppen en toelichtingen volgen de vertaling van het blad, de namen
 *     waarop de invoer wordt opgeslagen niet;
 *   • typen: een eenheid of een komma, zoals in een veld van het blad;
 *   • rustig rekenen: doortypen stuurt één waarde na een pauze, een veld verlaten
 *     stuurt meteen, en wat geen waarde is, gaat niet naar het blad;
 *   • welk blad welk scherm krijgt;
 *   • de vloer op palen: het model uit de invoer en de tekening binnen haar vak;
 *   • de code zelf: alleen tokens van het ontwerp, en het paneel schrijft alleen
 *     invoerwaarden (de rekenversie van een blad verandert er niet door).
 *
 * Handberekening van het vloermodel (L_x = L_y = 3,6 m, a_r = 0,3 m, 4 velden):
 *   B = 4·3600 + 2·300 = 15 000 mm, (4 + 1)² = 25 palen, de eerste op (300; 300).
 *   Ponskop 1000: op de hoekpaal van max(300 − 500; 0) = 0 tot 800, dus 800 breed;
 *   op de tweede paal (3900) van 3400 tot 4400.
 *   Strook 800 in x: de eerste van 0 tot 700 (700 breed), de tweede van 3500 tot 4300.
 *   Dikte bij de paal: kop max(t_k; h; t_s bij stroken), strook max(t_s; h).
 *
 * Draaien:  node scripts/check-invoerpaneel.mjs
 *           node scripts/check-invoerpaneel.mjs --blad <module.cpd>   (ook dat blad nalopen)
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { STELSELS, evaluate, parse, render } from "../packages/core/dist/index.js";
import {
  heeftInvoer,
  inBeeld,
  leesGetypt,
  leesInvoer,
  naamDelen,
  opentMetInvoer,
  pauzeVoor,
  platTekst,
  schermSoort,
  standaardInvoer,
  tekstDelen,
} from "../packages/desktop/src/components/calc/invoer/velden.ts";
import { InvoerWachtrij } from "../packages/desktop/src/components/calc/invoer/wachtrij.ts";
import {
  VLOER_OP_PALEN,
  beeldIndeling,
  tekenDoorsnede,
  tekenPlattegrond,
  vloerInvoer,
  vloerModel,
} from "../packages/desktop/src/components/calc/invoer/vloerOpPalen.ts";
import { invoervelden } from "../packages/desktop/src/components/calc/bladVersie.ts";
import { bronVoorUitvoer } from "../packages/desktop/src/templates/vertalingen.ts";
import { CANVAS_BLAD } from "../packages/desktop/src/store/canvasBlad.ts";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE } from "../packages/desktop/src/store/projectBestand.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import { ligger } from "../packages/desktop/src/templates/ligger.ts";
import { balklaag } from "../packages/desktop/src/templates/balklaag.ts";
import { tweepaalspoer } from "../packages/desktop/src/templates/tweepaalspoer.ts";
import { doorsnedeSpanningen } from "../packages/desktop/src/templates/doorsnede-spanningen.ts";
import { rekentaalDemo } from "../packages/desktop/src/templates/rekentaal-demo.ts";
import { rekentaalIncludes, rekentaalImageUrls } from "../packages/desktop/src/templates/rekentaal-includes.ts";
import { laadInvoerscherm } from "./lib/invoerscherm-jsdom.mjs";

const hier = dirname(fileURLToPath(import.meta.url));
const SRC = join(hier, "../packages/desktop/src");
const INVOER = join(SRC, "components/calc/invoer");

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${ok || !detail ? "" : "  -> " + detail}`);
  if (!ok) fouten++;
}
const json = (x) => JSON.stringify(x);
const opties = { includes: rekentaalIncludes, imageUrls: rekentaalImageUrls };
const reken = (bron, waarden = {}, evalOpties = {}) => evaluate(parse(bron, opties), waarden, { CC: 2, rekenwijze: 1 }, evalOpties);
const namenVan = (invoer) => invoer.groepen.flatMap((g) => g.velden.map((v) => v.naam));
const veld = (invoer, naam) => invoer.groepen.flatMap((g) => g.velden).find((v) => v.naam === naam);

const PROEF = `"Proefblad — invoer
'<i>Uitleg die niet in het paneel hoort.</i>
# Maten
L = ?{4.5}*(m)', overspanning<span class="kolom-3"></span>'
b = ?{75}mm', breedte, b<sub>w</sub>'
n = ?{3}', aantal'
@select klasse "Sterkteklasse"
  C24 = 24
  C30 = 30
@end
@select kop "Met een kop"
  nee = 0
  ja = 1
@end
#if kop ≡ 1
b_k = ?{1000}*(mm)', kop, breedte'
#else
'Geen kop.
#end if
#hide
geheim = ?{1}
#show
# Tussenkop zonder velden
'Alleen tekst.
# Belasting
q_k = ?{2.5}*(kN/m^2)', veranderlijk <span class="alleen-afdruk">(op papier)</span>'
F = ? kN
#for i = 1 : 2
m = ?{2}', in een lus'
#loop
UC_max = q_k/(5 kN/m^2)
`;

// De invoer van de bedrijfsvloer op palen, met de namen van de module. De maten van de
// ponskop en de strook staan hier achter een voorwaarde: het paneel toont ze dan niet,
// het beeld kent ze wel.
const VLOER = `"Vloer op palen — proefblad voor het invoerscherm
# Raster en vloer
L_x = ?{3.6}*(m)', paalafstand x'
L_y = ?{3.6}*(m)', paalafstand y'
n_v = ?{4}', velden per richting'
a_r = ?{0.3}*(m)', buitenste paalrij tot de vloerrand'
h = ?{250}*(mm)', vloerdikte'
d_kop = ?{400}*(mm)', paalkop'
@select ponskop "Ponskop boven elke paal"
  nee = 0
  ja = 1
@end
#if ponskop ≡ 1
b_k = ?{1000}*(mm)', ponskop, breedte'
t_k = ?{400}*(mm)', ponskop, dikte'
#end if
@select stroken "Versterkte stroken over de paalrijen"
  geen = 0
  in x = 1
  in y = 2
  in x en y = 3
@end
#if stroken > 0
b_s = ?{800}*(mm)', strook, breedte'
t_s = ?{350}*(mm)', strook, dikte'
#end if
# Belastingen
q_k = ?{20}*(kN/m^2)', veranderlijk'
`;

console.log("De velden van een blad");
{
  const invoer = leesInvoer(reken(PROEF));
  meld(json(invoer.groepen.map((g) => g.kop)) === json(["Maten", "Belasting"]),
    "de groepen zijn de koppen van het blad; een kop zonder velden (de titel, een tussenkop) vervalt", json(invoer.groepen.map((g) => g.kop)));
  meld(json(namenVan(invoer)) === json(["L", "b", "n", "klasse", "kop", "q_k", "F", "m"]),
    "de velden in de volgorde van het blad; niet in een tak die niet gekozen is, niet achter #hide, een lus telt één keer", json(namenVan(invoer)));
  const L = veld(invoer, "L");
  meld(L?.soort === "invoer" && L.eenheid === "m" && L.toonEenheid === "m" && L.waarde === "4.5" && L.standaard === "4.5" && platTekst(L.label) === "overspanning",
    "een ?-veld: eenheid, waarde, standaardwaarde en de toelichting zonder opmaak", json(L));
  meld(json(veld(invoer, "b")?.label) === json([{ tekst: "breedte, b" }, { tekst: "w", stand: "sub" }]),
    "een index in de toelichting blijft een index", json(veld(invoer, "b")?.label));
  const klasse = veld(invoer, "klasse");
  meld(klasse?.soort === "keuze" && klasse.waarde === "24" && json(klasse.keuzes) === json([{ tekst: "C24", waarde: "24" }, { tekst: "C30", waarde: "30" }]) && platTekst(klasse.label) === "Sterkteklasse",
    "een keuzelijst: het label, de keuzes en de gekozen waarde", json(klasse));
  meld(platTekst(veld(invoer, "q_k")?.label ?? []) === "veranderlijk", "wat alleen op papier staat, staat niet in het paneel", json(veld(invoer, "q_k")?.label));
  const F = veld(invoer, "F");
  meld(F?.eenheid === "kN" && F.label.length === 0 && F.standaard === "0", "een veld zonder toelichting en zonder standaardwaarde", json(F));

  const metKop = leesInvoer(reken(PROEF, { kop: "1", L: "6" }));
  meld(json(namenVan(metKop)) === json(["L", "b", "n", "klasse", "kop", "b_k", "q_k", "F", "m"]),
    "kiest de gebruiker de kop, dan komt het veld erbij op zijn plek in het blad", json(namenVan(metKop)));
  meld(veld(metKop, "L")?.waarde === "6" && veld(metKop, "kop")?.waarde === "1", "de waarden zijn die van het blad");
  meld(leesInvoer(reken(PROEF), { L: "L_span" }).groepen[0].velden[0].toonNaam === "L_span" && L?.toonNaam === "L",
    "de naam in beeld volgt de weergavenamen van de vertaling; de sleutel blijft de naam uit de rekentekst");

  meld(json(tekstDelen(", h<sub>ef</sub> in mm<sup>2</sup> &amp; meer<span class=\"kolom-3\"></span>")) === json([{ tekst: "h" }, { tekst: "ef", stand: "sub" }, { tekst: " in mm" }, { tekst: "2", stand: "sup" }, { tekst: " & meer" }]),
    "een toelichting: het leesteken vooraan en de opmaak eraf, sub en sup blijven", json(tekstDelen(", h<sub>ef</sub> in mm<sup>2</sup> &amp; meer<span class=\"kolom-3\"></span>")));
  meld(tekstDelen("<span class=\"kolom-4\"></span>").length === 0 && tekstDelen("").length === 0, "een toelichting zonder tekst is leeg");
  meld(json(naamDelen("L_x")) === json({ basis: "L", index: "x" }) && json(naamDelen("ε_cs_EC")) === json({ basis: "ε", index: "cs,EC" }) && json(naamDelen("h")) === json({ basis: "h", index: "" }),
    "een naam met een index: L_x is L met index x");

  // Wacht het blad op Open FEM Studio? Alleen in de werkruimte (de modus vragen).
  const toets = ["h = ?{4}*(m)", "@toets kolom = check_steel_beam", '  profile_name = "HEA200"', "  length_m = h", "@end"].join("\n");
  meld(leesInvoer(reken(toets, {}, { toetsModus: "vragen" })).wachtOpFem === true && leesInvoer(reken(toets, {}, { toetsModus: "lezen" })).wachtOpFem === false && invoer.wachtOpFem === false,
    "een blok dat op Open FEM Studio wacht, meldt het paneel als rekenen");
}

console.log("\nHet paneel toont wat de uitwerking toont");
{
  const BLADEN = { ligger, balklaag, tweepaalspoer, "doorsnede-spanningen": doorsnedeSpanningen, "rekentaal-demo": rekentaalDemo };
  for (const [id, bron] of Object.entries(BLADEN)) {
    const nodes = reken(bron);
    const html = render(nodes);
    const inUitwerking = new Set([...html.matchAll(/data-(?:prompt|var)="([^"]+)"/g)].map((m) => m[1].replace(/&amp;/g, "&")));
    const inPaneel = namenVan(leesInvoer(nodes));
    const alle = new Set(invoervelden(parse(bron, opties)).map((v) => v.naam));
    const ok = inPaneel.length === inUitwerking.size && inPaneel.every((n) => inUitwerking.has(n)) && inPaneel.every((n) => alle.has(n)) && new Set(inPaneel).size === inPaneel.length;
    meld(ok && inPaneel.length > 0, `${id}: ${inPaneel.length} velden, dezelfde als in de uitwerking (van de ${alle.size} in het blad)`,
      `paneel ${inPaneel.length}, uitwerking ${inUitwerking.size}`);
    meld(heeftInvoer(bron), `${id}: heeft invoer, dus een invoerscherm of een eigen beeld`);
  }
}

console.log("\nDe taal van het paneel");
{
  const nl = leesInvoer(reken(ligger));
  const uitvoer = bronVoorUitvoer(ligger, "en");
  const en = leesInvoer(reken(uitvoer.bron), uitvoer.namen);
  meld(json(namenVan(nl)) === json(namenVan(en)), "in het Engels dezelfde velden op dezelfde namen: de invoer blijft bij het blad");
  const koppenNl = nl.groepen.map((g) => g.kop);
  const koppenEn = en.groepen.map((g) => g.kop);
  meld(koppenNl.length === koppenEn.length && koppenEn.every((k, i) => k !== koppenNl[i]), "elke kop staat in de taal van de app", json(koppenEn));
  const labels = (i) => i.groepen.flatMap((g) => g.velden.map((v) => platTekst(v.label))).filter(Boolean);
  const gelijk = labels(en).filter((t, i) => t === labels(nl)[i] && /\p{L}{4}/u.test(t));
  meld(labels(en).length === labels(nl).length && gelijk.length < labels(nl).length / 4, "en de toelichtingen ook, via de vertaaltabel van het blad", json(gelijk.slice(0, 5)));
}

console.log("\nTypen in een veld");
{
  const mm = { eenheid: "mm", toonEenheid: "mm", standaard: "250" };
  meld(json(leesGetypt(mm, "300")) === json({ waarde: "300" }) && json(leesGetypt(mm, "0,3 m")) === json({ waarde: "300" }),
    "een getal blijft zoals getypt; 0,3 m in een veld in mm wordt 300", json(leesGetypt(mm, "0,3 m")));
  meld("fout" in leesGetypt(mm, "3 kN") && "fout" in leesGetypt(mm, "3 k"), "een eenheid die niet past of niet af is, wordt niet opgeslagen");
  meld(json(leesGetypt(mm, "#2.R_paal")) === json({ waarde: "#2.R_paal" }), "een verwijzing naar een ander blad gaat mee zoals getypt");
  meld(json(leesGetypt({ eenheid: "", toonEenheid: "" }, "3,5")) === json({ waarde: "3,5" }), "een veld zonder eenheid: de tekst, de kern leest de komma");

  // In het eenhedenstelsel: het veld toont voet, het blad bewaart meter.
  const us = veld(leesInvoer(reken(PROEF, { L: "4.5" }, { stelsel: STELSELS.us })), "L");
  meld(us?.eenheid === "m" && us.toonEenheid === "ft" && Math.abs(Number(us.waarde) - 14.7638) < 1e-3, "in US customary toont het veld voet en bewaart het meter", json(us));
  meld(us && json(leesGetypt(us, "10")) === json({ waarde: "3.048" }) && json(leesGetypt(us, "5 m")) === json({ waarde: "5" }), "10 in dat veld is 3,048 m; 5 m is 5 m");
  meld(us && inBeeld(us, "3.048") === "10" && inBeeld(us, undefined) === us.waarde && inBeeld(us, "") === "" && inBeeld(us, "#2.L") === "#2.L",
    "in rust toont het veld de opgeslagen waarde in zijn eenheid; niets opgeslagen is de standaardwaarde van het blad");
  meld(inBeeld(mm, "300") === "300" && inBeeld(mm, undefined) === "250", "zonder omrekening staat er wat er is opgeslagen");
}

console.log("\nRustig rekenen");
{
  // Een klok die alleen loopt als de controle dat zegt.
  const nep = () => {
    let nu = 0;
    let teller = 0;
    const wekkers = new Map();
    return {
      klok: { zet: (fn, ms) => (wekkers.set(++teller, { op: nu + ms, fn }), teller), wis: (id) => wekkers.delete(id) },
      verder: (ms) => {
        nu += ms;
        for (const [id, w] of [...wekkers]) if (w.op <= nu) (wekkers.delete(id), w.fn());
      },
    };
  };
  const maak = (pauze = 600) => {
    const k = nep();
    const gestuurd = [];
    let gemeld = 0;
    const rij = new InvoerWachtrij((naam, waarde) => gestuurd.push([naam, waarde]), pauze, () => gemeld++, k.klok);
    return { rij, gestuurd, verder: k.verder, gemeld: () => gemeld };
  };
  {
    const { rij, gestuurd, verder, gemeld } = maak();
    rij.typ("L_x", "3");
    verder(300);
    rij.typ("L_x", "3.");
    verder(300);
    rij.typ("L_x", "3.6");
    verder(599);
    meld(gestuurd.length === 0 && rij.wacht("L_x") === "3.6" && rij.aantal === 1, "doortypen stuurt niets zolang de pauze niet om is; het beeld kent de waarde al", json(gestuurd));
    verder(1);
    meld(json(gestuurd) === json([["L_x", "3.6"]]) && rij.wacht("L_x") === undefined && rij.aantal === 0, "na de pauze gaat de laatste waarde één keer naar het blad", json(gestuurd));
    verder(5000);
    meld(gestuurd.length === 1, "en daarna niets meer");
    meld(gemeld() >= 4, "elke wijziging meldt zich, zodat het beeld en de status meteen volgen");
  }
  {
    const { rij, gestuurd, verder } = maak();
    rij.typ("h", "300");
    rij.verlaat("h");
    meld(json(gestuurd) === json([["h", "300"]]), "het veld verlaten (of Enter) stuurt meteen");
    verder(5000);
    rij.verlaat("h");
    meld(gestuurd.length === 1, "en niet nog een keer als de pauze om is of het veld nog eens wordt verlaten");
  }
  {
    const { rij, gestuurd, verder } = maak();
    rij.typ("h", "300");
    rij.houdTegen("h");
    verder(5000);
    rij.verlaat("h");
    meld(gestuurd.length === 0 && rij.wacht("h") === undefined, "wordt de tekst iets wat geen waarde is, dan gaat er niets naar het blad, ook de waarde van daarvoor niet");
    rij.typ("h", "300");
    rij.vergeet("h");
    verder(5000);
    meld(gestuurd.length === 0, "Escape laat wat er wachtte vervallen");
    rij.typ("h", "300");
    rij.zetNu("h", "350");
    verder(5000);
    meld(json(gestuurd) === json([["h", "350"]]) && rij.aantal === 0, "een keuze of een maat in de tekening gaat meteen, en wat er voor dat veld wachtte vervalt", json(gestuurd));
  }
  {
    const { rij, gestuurd, verder } = maak();
    rij.typ("L_x", "4");
    verder(200);
    rij.typ("L_y", "5");
    verder(400);
    meld(json(gestuurd) === json([["L_x", "4"]]) && rij.wacht("L_y") === "5", "elk veld heeft zijn eigen pauze");
    rij.typ("h", "300");
    rij.stuurAlles();
    meld(json(gestuurd) === json([["L_x", "4"], ["L_y", "5"], ["h", "300"]]) && rij.aantal === 0, "gaat het blad dicht, dan gaat alles wat wacht eerst naar het blad", json(gestuurd));
  }
  const fem = "x = ?{1}\n@fem vloer\n  plaat 0; 0; 4; 4; 250 mm\n@end";
  meld(pauzeVoor(PROEF) > 0 && pauzeVoor(PROEF) <= 700 && pauzeVoor(fem) >= 2 * pauzeVoor(PROEF) && pauzeVoor(fem) <= 2500,
    "een blad dat Open FEM Studio laat rekenen, wacht langer met sturen", `${pauzeVoor(PROEF)} en ${pauzeVoor(fem)} ms`);
}

console.log("\nWelk blad welk scherm krijgt");
{
  meld(heeftInvoer(PROEF) && heeftInvoer("@select k \"Keuze\"\n  a = 1\n@end") && !heeftInvoer("x = 5\ny = x^2\n'is x = ? hier tekst") && !heeftInvoer(""),
    "een blad heeft invoer bij een ?-veld of een keuzelijst");
  const st = standaardInvoer(VLOER);
  meld(json(st.L_x) === json({ beginwaarde: "3.6", eenheid: "m" }) && json(st.b_k) === json({ beginwaarde: "1000", eenheid: "mm" }) && json(st.stroken) === json({ beginwaarde: "0", eenheid: "" }) && json(standaardInvoer(PROEF).F) === json({ beginwaarde: "0", eenheid: "kN" }),
    "de standaardwaarden uit de tekst zelf, ook van een veld achter een voorwaarde", json([st.L_x, st.b_k, st.stroken]));
  {
    // Dezelfde standaardwaarden als de kern leest, voor elk veld van elk ingebouwd blad.
    let mis = [];
    for (const bron of [ligger, balklaag, tweepaalspoer, doorsnedeSpanningen, rekentaalDemo, VLOER, PROEF]) {
      const uitTekst = standaardInvoer(bron);
      for (const v of invoervelden(parse(bron, opties))) {
        const t = uitTekst[v.naam];
        if (!t || t.beginwaarde !== v.beginwaarde || t.eenheid !== v.eenheid) mis.push(`${v.naam}: ${json(t)} tegen ${v.beginwaarde} ${v.eenheid}`);
      }
    }
    meld(mis.length === 0, "en dat zijn dezelfde als de rekenkern leest, voor elk veld van elk ingebouwd blad", mis.slice(0, 6).join("; "));
  }
  meld(VLOER_OP_PALEN === "vloer-op-palen", "het beeld van de vloer op palen hangt aan het templateId van de module: vloer-op-palen");
  meld(schermSoort({ templateId: "vloer-op-palen", source: VLOER }, false) === "vloer-op-palen", "een blad van die module krijgt het beeld");
  {
    // Ook uit een projectbestand, op een computer waar de module niet is geïnstalleerd: het
    // templateId en de tekst staan in het bestand zelf.
    const blad = { id: "ex-1", naam: "Vloer", templateId: VLOER_OP_PALEN, source: VLOER, waarden: { L_x: "4.2" }, elementen: [] };
    const bestand = bouwProjectBestand({ versie: PROJECT_FORMAAT_VERSIE, naam: "Proef", gegevens: legeGegevens(), exemplaren: [blad] }, null);
    const terug = leesProjectBestand(bestand, "Proef").exemplaren[0];
    meld(terug?.templateId === VLOER_OP_PALEN && terug.source === VLOER && terug.waarden.L_x === "4.2" && schermSoort(terug, false) === "vloer-op-palen" && opentMetInvoer(terug),
      "opslaan en openen houdt het templateId: het blad uit het projectbestand krijgt het beeld en opent ermee", json(terug && [terug.templateId, terug.waarden]));
  }
  meld(schermSoort({ templateId: "", source: VLOER }, false) === "paneel" && schermSoort({ templateId: "iets-anders", source: VLOER }, false) === "paneel",
    "dezelfde tekst onder een ander templateId: het paneel zonder beeld");
  meld(schermSoort({ templateId: "vloer-op-palen", source: PROEF }, false) === "paneel", "het templateId met een tekst zonder de maten van de vloer: het paneel zonder beeld");
  meld(schermSoort({ templateId: "ligger", source: ligger }, true) === null, "een blad met een eigen beeld houdt dat beeld");
  meld(schermSoort({ templateId: "", source: "x = 5" }, false) === null, "een blad zonder invoer heeft geen invoerscherm");
  meld(schermSoort({ templateId: CANVAS_BLAD, source: PROEF }, false) === null, "een canvas heeft zijn eigen scherm");

  // Waarmee een blad opent: een module met haar invoerscherm, een blad waar je de rekentekst
  // schrijft of leest met de code. Daar is het invoerscherm een tab erbij.
  meld(opentMetInvoer({ templateId: "vloer-op-palen" }) && opentMetInvoer({ templateId: "een-module-uit-de-bibliotheek" }), "een module opent met haar invoerscherm");
  meld(!opentMetInvoer({ templateId: "leeg" }) && !opentMetInvoer({ templateId: "" }) && !opentMetInvoer({}) && !opentMetInvoer({ templateId: "rekentaal-demo" }),
    "een eigen rekenblad, een los geopend bestand en de demo van de rekentaal openen met de code");
  const kiezer = readFileSync(join(SRC, "store/moduleKiezer.ts"), "utf8");
  const sjablonen = readFileSync(join(SRC, "templates/index.ts"), "utf8");
  meld(/const LEEG_BLAD = "leeg";/.test(kiezer) && sjablonen.includes('"rekentaal-demo": rekentaalDemo'), "en dat zijn de templateId's die de app aan die bladen geeft");
}

console.log("\nDe vloer op palen: het model");
{
  const st = standaardInvoer(VLOER);
  const model = (waarden = {}) => vloerModel(vloerInvoer(st, (naam) => waarden[naam]));
  const m = model();
  meld(m && m.n === 4 && m.Bx === 15000 && m.By === 15000 && m.palen.length === 25 && json(m.palen[0]) === json({ x: 300, y: 300 }) && json(m.palen[24]) === json({ x: 14700, y: 14700 }),
    "4 velden van 3,6 m met 0,3 m rand: 15 × 15 m en 25 palen", json(m && [m.n, m.Bx, m.By, m.palen.length]));
  meld(m && !m.kop && !m.stX && !m.stY && m.koppen.length === 0 && m.stroken.length === 0 && m.h === 250 && m.dKop === 400, "zonder ponskop en stroken een vlakke plaat");

  const k = model({ ponskop: "1" });
  meld(k && k.kop && k.koppen.length === 25 && json(k.koppen[0]) === json({ x: 0, y: 0, b: 800, h: 800 }) && json(k.koppen[6]) === json({ x: 3400, y: 3400, b: 1000, h: 1000 }) && k.tk === 400,
    "met een ponskop: 25 koppen van 1000, op de hoek afgesneden op de vloerrand (800)", json(k && [k.koppen[0], k.koppen[6], k.tk]));

  const sx = model({ stroken: "1" });
  meld(sx && sx.stX && !sx.stY && sx.stroken.length === 5 && json(sx.stroken[0]) === json({ x: 0, y: 0, b: 15000, h: 700 }) && json(sx.stroken[1]) === json({ x: 0, y: 3500, b: 15000, h: 800 }) && sx.ts === 350,
    "stroken in x: 5 stroken over de volle lengte, de buitenste afgesneden (700)", json(sx && [sx.stroken[0], sx.stroken[1]]));
  const sy = model({ stroken: "2" });
  meld(sy && !sy.stX && sy.stY && json(sy.stroken[1]) === json({ x: 3500, y: 0, b: 800, h: 15000 }), "stroken in y staan de andere kant op");
  meld(model({ stroken: "3" })?.stroken.length === 10, "in x en y: 10 stroken");

  meld(model({ ponskop: "1", stroken: "1", t_k: "300" })?.tk === 350 && model({ ponskop: "1", t_k: "200" })?.tk === 250 && model({ stroken: "1", t_s: "200" })?.ts === 250,
    "de dikte is nooit kleiner dan de vloer, en een kop op een strook nooit dunner dan de strook");
  meld(model({ n_v: "7" })?.n === 5 && model({ n_v: "2" })?.n === 3 && model({ n_v: "3.6" })?.n === 4 && model({ n_v: "3,4" })?.n === 3, "3 tot 5 velden per richting, zoals het blad afrondt");
  meld(model({ L_x: "7.2" })?.Bx === 29400 && model({ L_x: "7,2" })?.Bx === 29400 && model({ L_x: "7.2" })?.By === 15000, "een andere paalafstand in x, met een punt of een komma");
  meld(model({ L_x: "0" }) === null && model({ h: "-250" }) === null && model({ L_y: "abc" }) === null, "zonder positieve maten is er geen model");
  meld(model({ h: "" })?.h === 250 && model({ h: "  " })?.h === 250, "een leeggemaakt veld telt als zijn standaardwaarde, zoals in het blad");
  // De eenheid komt uit het blad: schrijft het blad de paalafstand in mm, dan is het model gelijk.
  const inMm = vloerModel(vloerInvoer({ ...st, L_x: { beginwaarde: "3600", eenheid: "mm" } }, () => undefined));
  meld(inMm?.Bx === 15000 && inMm.Lx === 3600, "de eenheid van een maat komt uit het blad");
}

console.log("\nDe vloer op palen: de tekening");
{
  const st = standaardInvoer(VLOER);
  const binnen = (p, t) => p.x >= 0 && p.x <= t.breedte && p.y >= 0 && p.y <= t.hoogte;
  const vakBinnen = (r, t) => r.x >= -0.01 && r.y >= -0.01 && r.x + r.b <= t.breedte + 0.01 && r.y + r.h <= t.hoogte + 0.01;
  for (const [naam, waarden] of [["vlakke plaat", {}], ["kop en stroken", { ponskop: "1", stroken: "3" }], ["langwerpig", { L_x: "7.2", n_v: "5", ponskop: "1" }]]) {
    const invoer = vloerInvoer(st, (n) => waarden[n]);
    const m = vloerModel(invoer);
    const p = tekenPlattegrond(m, invoer, 250, 230);
    const schaalX = p.vloer.b / m.Bx;
    const schaalY = p.vloer.h / m.By;
    meld(p.breedte === 250 && p.hoogte === 230 && vakBinnen(p.vloer, p) && Math.abs(schaalX - schaalY) < 1e-9 && Math.abs(schaalX - p.schaal) < 1e-9 && p.vloer.b >= 120,
      `plattegrond (${naam}): op schaal en binnen een vak van 250 × 230`, json(p.vloer));
    meld(p.palen.length === m.palen.length && p.palen.every((c) => c.x >= p.vloer.x && c.x <= p.vloer.x + p.vloer.b && c.y >= p.vloer.y && c.y <= p.vloer.y + p.vloer.h)
      && p.koppen.length === m.koppen.length && p.stroken.length === m.stroken.length && [...p.koppen, ...p.stroken].every((r) => vakBinnen(r, p)),
      `plattegrond (${naam}): elke paal, kop en strook op de vloer`);
    meld(json(p.maten.map((x) => x.naam).sort()) === json(["L_x", "L_y", "a_r", "n_v"]) && p.maten.every((x) => binnen(x, p)),
      `plattegrond (${naam}): de maten L_x, L_y, a_r en het aantal velden, elk in het vak`, json(p.maten.map((x) => [x.naam, Math.round(x.x), Math.round(x.y)])));

    const d = tekenDoorsnede(m, invoer, 240, 230);
    const verwacht = ["d_kop", "h", ...(m.kop ? ["b_k", "t_k"] : []), ...(m.stX || m.stY ? ["b_s", "t_s"] : [])].sort();
    meld(json(d.maten.map((x) => x.naam).sort()) === json(verwacht) && d.maten.every((x) => binnen(x, d)) && d.beton.every((pt) => binnen(pt, d)) && vakBinnen(d.paal, d),
      `doorsnede (${naam}): ${verwacht.join(", ")}, alles in een vak van 240 × 230`, json(d.maten.map((x) => [x.naam, Math.round(x.x), Math.round(x.y)])));
    meld(d.schaal * m.h >= 8, `doorsnede (${naam}): de vloer is minstens 8 px dik`, String(d.schaal * m.h));
    // De dikte bij de paal: de vloer, of de strook of de kop eronder.
    const bijPaal = Math.max(m.h, m.kop ? m.tk : 0, m.stX || m.stY ? m.ts : 0);
    const onderkant = Math.max(...d.beton.map((pt) => pt.y));
    meld(Math.abs(d.paal.y - (d.beton[0].y + bijPaal * d.schaal)) < 0.01 && Math.abs(d.paal.y - onderkant) < 0.01,
      `doorsnede (${naam}): de paal staat tegen de onderkant van het beton, ${bijPaal} mm onder de bovenkant`, `${d.paal.y} tegen ${onderkant}`);
  }
  {
    // Een kop die dunner is ingevuld dan de strook eronder: de tekening toont de dikte waarmee
    // het blad rekent (de strook, 350), de maatlijn meet wat er is ingevuld (300).
    const invoer = vloerInvoer(st, (n) => ({ ponskop: "1", stroken: "1", t_k: "300" })[n]);
    const m = vloerModel(invoer);
    const d = tekenDoorsnede(m, invoer, 240, 230);
    const top = d.beton[0].y;
    const staand = d.lijnen.filter((l) => !l.ligt).map((l) => Math.round((l.tot - top) / d.schaal));
    meld(m.tk === 350 && json(staand.sort((a, b) => a - b)) === json([250, 300, 350]) && d.maten.find((x) => x.naam === "t_k")?.waarde === 300,
      "een kop dunner dan de strook: getekend op 350 mm, gemeten wat er is ingevuld (300)", json(staand));
  }
  const invoer = vloerInvoer(st, (n) => ({ ponskop: "1", L_x: "4.2" })[n]);
  const p = tekenPlattegrond(vloerModel(invoer), invoer, 250, 230);
  const Lx = p.maten.find((x) => x.naam === "L_x");
  const d = tekenDoorsnede(vloerModel(invoer), invoer, 240, 230);
  const bk = d.maten.find((x) => x.naam === "b_k");
  meld(Lx?.waarde === 4.2 && Lx.eenheid === "m" && bk?.waarde === 1000 && bk.eenheid === "mm", "een maat draagt de waarde en de eenheid van zijn veld in het blad", json([Lx, bk]));

  const smal = beeldIndeling(494, 230);
  meld(smal.naast && smal.plattegrond.b + smal.doorsnede.b <= 494 && smal.plattegrond.b >= 220 && smal.doorsnede.b >= 220 && smal.plattegrond.h <= 230,
    "in het paneel van 518 px staan plattegrond en doorsnede naast elkaar", json(smal));
  const hoog = beeldIndeling(560, 620);
  meld(!hoog.naast && hoog.plattegrond.h + hoog.doorsnede.h <= 620 && hoog.plattegrond.b <= 560, "in een hoge kolom onder elkaar", json(hoog));
}

console.log("\nDe code van het paneel");
{
  const bestanden = readdirSync(INVOER);
  const tekst = (b) => readFileSync(join(INVOER, b), "utf8");
  const tokens = new Set([...readFileSync(join(SRC, "openaec/openaec-tokens.css"), "utf8").matchAll(/(--oa-[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
  const kleur = /#[0-9a-fA-F]{3,8}\b|\b(?:rgba?|hsla?)\(|:\s*(?:white|black|red|blue|green|gray|grey|orange|yellow)\b/;
  const metKleur = bestanden.flatMap((b) => tekst(b).split("\n").map((r, i) => [b, i + 1, r]).filter(([, , r]) => kleur.test(r)).map(([n, i, r]) => `${n}:${i} ${r.trim().slice(0, 60)}`));
  meld(metKleur.length === 0, "geen eigen kleuren in het paneel en het beeld", metKleur.slice(0, 6).join(" | "));
  const css = bestanden.filter((b) => b.endsWith(".css"));
  const variabelen = css.flatMap((b) => [...tekst(b).matchAll(/var\((--[a-z0-9-]+)/g)].map((m) => m[1]));
  const vreemd = [...new Set(variabelen.filter((v) => !tokens.has(v) && !v.startsWith("--ip-")))];
  meld(css.length > 0 && variabelen.length > 0 && vreemd.length === 0, "de opmaak gebruikt alleen bestaande tokens (--oa-*)", vreemd.join(", "));

  const code = bestanden.filter((b) => /\.tsx?$/.test(b)).map(tekst).join("\n");
  meld(!/\b(?:zetBron|seedWaarden|werkBladenBij)\b/.test(code) && /\bzetWaarde\b/.test(code),
    "het paneel schrijft alleen invoerwaarden (zetWaarde): de rekentekst en dus de rekenversie blijven zoals ze zijn");
  const app = readFileSync(join(SRC, "App.tsx"), "utf8");
  meld(/invoerSchermVoor\(/.test(app), "de werkruimte geeft een blad zonder eigen beeld het invoerscherm");
  const papier = ["components/calc/PrintBlad.tsx", "components/calc/varianten/VariantUitwerking.tsx"].map((b) => readFileSync(join(SRC, b), "utf8")).join("\n");
  meld(!/invoer\//.test(papier), "op papier en in de uitwerking van een variant staat het formulier niet");
  meld(/leesInvoer\(/.test(readFileSync(join(SRC, "rekenen/rekenWorker.ts"), "utf8")), "de velden komen uit dezelfde doorrekening als de uitwerking (de rekenworker)");
}

console.log("\nHet scherm zelf, in jsdom");
{
  const app = await laadInvoerscherm();
  await app.i18next.changeLanguage("nl");
  const { window } = app;
  const wacht = (ms) => new Promise((klaar) => setTimeout(klaar, ms));
  // Wachten tot iets waar is: de worker en de pauze van het paneel lopen op de klok.
  const tot = async (fn, ms = 20000) => {
    const eind = Date.now() + ms;
    while (Date.now() < eind) {
      if (fn()) return true;
      await wacht(25);
    }
    return !!fn();
  };
  const store = app.useProjectStore;
  // React leest de waarde van een veld via de setter van het element.
  const zetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
  const typ = (inp, tekst) => {
    zetter.call(inp, tekst);
    inp.dispatchEvent(new window.Event("input", { bubbles: true }));
  };

  // De vloer op palen: het blad van de module, zoals het uit een projectbestand komt.
  const id = store.getState().voegToe(VLOER_OP_PALEN, "Vloer op palen", VLOER);
  store.getState().selecteer(id);
  const ex = () => store.getState().exemplaren.find((e) => e.id === id);
  const versie = app.rekenversie(VLOER);
  const scherm = app.teken(ex());
  const { plek } = scherm;
  const rijVan = (naam) => [...plek.querySelectorAll(".ip-rij")].find((r) => r.querySelector(".ip-naam")?.getAttribute("title") === naam);
  const veldVan = (naam) => rijVan(naam)?.querySelector("input");
  const maat = (label) => [...plek.querySelectorAll(".vd-dim-num")].find((b) => b.textContent.startsWith(`${label}=`));
  const kopregel = () => plek.querySelector(".vd-head")?.textContent ?? "";

  meld(scherm.metBeeld === true && plek.querySelectorAll(".ip-tekening").length === 2 && maat("Lx")?.textContent === "Lx=3,60" && maat("h")?.textContent === "h=250",
    "de plattegrond en de doorsnede staan er meteen, vóór de eerste doorrekening", `${plek.querySelectorAll(".ip-tekening").length} tekeningen`);
  meld(plek.querySelectorAll(".ip-veld").length === 0 && plek.querySelector(".ip-leeg") !== null, "het formulier wacht op de doorrekening");
  meld(await tot(() => plek.querySelectorAll(".ip-veld").length > 0), "en staat er zodra het blad is doorgerekend");
  const koppen = [...plek.querySelectorAll(".ip-groep > .vd-ctrl-h")].map((k) => k.textContent);
  meld(json(koppen) === json(["Raster en vloer", "Belastingen"]) && plek.querySelectorAll(".ip-veld").length === 7 && plek.querySelectorAll(".ip-keuze").length === 2,
    "7 velden en 2 keuzelijsten onder de koppen van het blad", `${json(koppen)} ${plek.querySelectorAll(".ip-veld").length} ${plek.querySelectorAll(".ip-keuze").length}`);
  meld(veldVan("L_x")?.value === "3.6" && rijVan("L_x").querySelector(".ip-eenheid").textContent === "m" && rijVan("L_x").querySelector(".ip-label").textContent === "paalafstand x"
    && rijVan("q_k").querySelector(".ip-eenheid").textContent === "kN/m²", "een veld: naam, toelichting, waarde en eenheid (kN/m²)", rijVan("L_x")?.textContent);
  meld(veldVan("b_k") === undefined, "de maten van de ponskop staan achter een voorwaarde: nog niet in het formulier");

  // Typen: het beeld volgt meteen, het blad pas als het veld wordt verlaten.
  const rondes = app.rondes();
  const Lx = veldVan("L_x");
  Lx.focus();
  typ(Lx, "4");
  typ(Lx, "4.");
  typ(Lx, "4.2");
  meld(ex().waarden.L_x === undefined, "typen stuurt niets naar het blad");
  meld(await tot(() => maat("Lx")?.textContent === "Lx=4,20") && kopregel().includes("Nog niet verstuurd"), "het beeld volgt wel meteen, en de kop meldt dat de wijziging wacht", `${maat("Lx")?.textContent} | ${kopregel()}`);
  meld(app.rondes() === rondes, "er is niets opnieuw gerekend");
  Lx.blur();
  meld(await tot(() => ex().waarden.L_x === "4.2") && veldVan("L_x").value === "4.2", "het veld verlaten stuurt de waarde", String(ex().waarden.L_x));
  meld(await tot(() => app.rondes() > rondes), "en dan rekent het blad opnieuw");

  const h = veldVan("h");
  h.focus();
  typ(h, "300");
  meld(ex().waarden.h === undefined, "ook een pauze stuurt: eerst niets");
  meld(await tot(() => ex().waarden.h === "300", 5000) && window.document.activeElement === veldVan("h") && veldVan("h").value === "300",
    "en na de pauze de waarde, terwijl het veld de cursor en zijn tekst houdt", String(ex().waarden.h));
  typ(h, "3 kN");
  meld(await tot(() => veldVan("h").classList.contains("ip-fout")), "een eenheid die niet past krijgt een rode rand");
  h.blur();
  await wacht(50);
  meld(ex().waarden.h === "300" && veldVan("h").value === "300", "en wordt niet opgeslagen");

  // Een keuze gaat meteen; het veld achter de voorwaarde komt erbij.
  const ponskop = [...plek.querySelectorAll(".ip-keuze")].find((r) => r.textContent.includes("Ponskop boven elke paal"));
  ponskop.querySelector(".themed-select-trigger").click();
  await tot(() => ponskop.querySelector(".themed-select-item"));
  [...ponskop.querySelectorAll(".themed-select-item")].find((b) => b.textContent === "ja").click();
  meld(await tot(() => ex().waarden.ponskop === "1"), "een keuze gaat meteen naar het blad", String(ex().waarden.ponskop));
  meld(await tot(() => maat("bk")?.textContent === "bk=1000" && maat("tk")?.textContent === "tk=400") && plek.querySelectorAll(".ip-svg .ip-kop").length === 26,
    "de ponskop staat meteen in beeld: 25 koppen in de plattegrond en één in de doorsnede", String(plek.querySelectorAll(".ip-svg .ip-kop").length));
  meld(await tot(() => veldVan("b_k")?.value === "1000"), "na het doorrekenen staan de maten van de ponskop ook in het formulier");

  // Een maat in de tekening wijzigen, en ongedaan maken.
  maat("bk").click();
  await tot(() => plek.querySelector(".vd-dim-input"));
  const terPlekke = plek.querySelector(".vd-dim-input");
  typ(terPlekke, "1200");
  terPlekke.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Enter", bubbles: true }));
  meld(await tot(() => ex().waarden.b_k === "1200" && maat("bk")?.textContent === "bk=1200"), "een maat aanklikken en ter plekke wijzigen zet hem in het blad", String(ex().waarden.b_k));
  meld(await tot(() => veldVan("b_k")?.value === "1200"), "en het formulier volgt");
  store.getState().ongedaan();
  meld(await tot(() => ex().waarden.b_k === undefined && maat("bk")?.textContent === "bk=1000" && veldVan("b_k")?.value === "1000"),
    "ongedaan maken draait de maat terug: in het blad, in het beeld en in het formulier", `${ex().waarden.b_k} ${maat("bk")?.textContent}`);
  meld(ex().source === VLOER && app.rekenversie(ex().source) === versie, "de rekentekst en de rekenversie zijn niet veranderd");

  // De tekening kan weg, en wat nog wacht gaat bij het sluiten eerst naar het blad.
  const knop = plek.querySelector(".ip-voet button");
  knop.click();
  meld(await tot(() => plek.querySelectorAll(".ip-tekening").length === 0) && plek.querySelectorAll(".ip-veld").length === 9, "de tekening kan weg; het formulier blijft");
  const Ly = veldVan("L_y");
  Ly.focus();
  typ(Ly, "5");
  scherm.sluit();
  meld(ex().waarden.L_y === "5", "gaat het scherm dicht, dan gaat wat nog wacht eerst naar het blad", String(ex().waarden.L_y));

  // Een gewoon blad: het formulier zonder beeld.
  const id2 = store.getState().voegToe("", "Proef", PROEF);
  store.getState().selecteer(id2);
  const gewoon = app.teken(store.getState().exemplaren.find((e) => e.id === id2));
  meld(gewoon.metBeeld === false && await tot(() => gewoon.plek.querySelectorAll(".ip-veld").length === 6) && gewoon.plek.querySelectorAll(".ip-tekening").length === 0
    && json([...gewoon.plek.querySelectorAll(".ip-groep > .vd-ctrl-h")].map((k) => k.textContent)) === json(["Maten", "Belasting"]),
    "een blad zonder eigen beeld: het formulier uit zijn velden, zonder tekening", String(gewoon.plek.querySelectorAll(".ip-veld").length));
  gewoon.sluit();

  await wacht(100);
  app.herstelConsole();
  meld(app.fouten.length === 0, "zonder fouten in de console", app.fouten.slice(0, 4).join(" || "));
}

// Een blad van buiten nalopen, bijvoorbeeld de module uit de modulebibliotheek.
const i = process.argv.indexOf("--blad");
if (i > 0 && process.argv[i + 1]) {
  const pad = process.argv[i + 1];
  const bron = readFileSync(pad, "utf8");
  console.log(`\nHet blad ${pad}`);
  const invoer = leesInvoer(reken(bron, {}, { toetsModus: "lezen" }));
  for (const g of invoer.groepen) console.log(`     ${g.kop}: ${g.velden.map((v) => v.naam).join(", ")}`);
  meld(schermSoort({ templateId: VLOER_OP_PALEN, source: bron }, false) === "vloer-op-palen", "het blad krijgt het beeld van de vloer op palen");
  const st = standaardInvoer(bron);
  const namen = ["L_x", "L_y", "n_v", "a_r", "h", "d_kop", "ponskop", "b_k", "t_k", "stroken", "b_s", "t_s"];
  meld(namen.every((n) => st[n]), "elke naam waar het beeld aan bindt, is invoer van het blad", namen.filter((n) => !st[n]).join(", "));
  const m = vloerModel(vloerInvoer(st, () => undefined));
  meld(m !== null, "met de standaardwaarden van het blad is er een model", json(m && [m.n, m.Bx, m.By]));
}

console.log(fouten ? `\n${fouten} fout(en)` : "\nAlles in orde");
process.exit(fouten ? 1 : 0);
