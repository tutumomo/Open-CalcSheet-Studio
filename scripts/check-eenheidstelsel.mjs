/**
 * Eenheden (issue #22): Amerikaanse eenheden, eigen eenheden in een blad en het
 * eenhedenstelsel dat alleen de weergave omrekent
 * (docs/superpowers/specs/2026-11-06-eenheden-design.md).
 *
 * Handberekening van de omrekeningen:
 *   1 psi = 6894,757 Pa, 1 ksi = 1000 psi    → 235 N/mm² = 235e6 / 6,894757e6 = 34,08 ksi
 *   1 lbf = 4,448222 N, 1 ft = 0,3048 m
 *   1 plf = lbf/ft = 14,594 N/m, 1 klf = 1000 plf  → 10 kN/m = 10000 / 14594 = 0,6852 klf
 *   1 psf = lbf/ft² = 47,880 Pa              → 2,4 kN/m² = 2400 / 47,880 = 50,13 psf
 *   1 ksf = 1000 psf                          → 100 kN/m² = 100000 / 47880 = 2,089 ksf
 *   1 pcf = lbf/ft³ = 157,09 N/m³             → 25 kN/m³ = 25000 / 157,09 = 159,1 pcf
 *
 * Draaien:  node scripts/check-eenheidstelsel.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { parse, evaluate, exprToLatex, render, grootheidVan, decimalenNa, STELSELS, toonInvoer, invoerNaarBron, zetProjectEenheden, omrekenen, eenheidUitBeeld, eenheidInBeeld } from "../packages/core/dist/index.js";
import { laadTemplate, reken } from "./lib/refcheck.mjs";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};

/** Alle nodes van een doorgerekend blad, ook die in blokken. */
function alleNodes(lijst, uit = []) {
  for (const n of lijst) {
    uit.push(n);
    if (Array.isArray(n.children)) alleNodes(n.children, uit);
  }
  return uit;
}

/** De laatste uitkomst van `naam` in een blad. */
function node(bron, naam, opties) {
  const nodes = alleNodes(evaluate(parse(bron), {}, {}, opties));
  return nodes.filter((n) => n.name === naam && typeof n.result === "string").pop();
}
const uitkomst = (bron, naam, opties) => node(bron, naam, opties)?.result;

console.log("Amerikaanse eenheden");
const gelijk = (bron, naam, verwacht, wat) => {
  const u = uitkomst(bron, naam);
  meld(u === verwacht, wat ?? `${bron.split("\n").pop()} → ${verwacht}`, u);
};
gelijk("s = 235 N/mm^2\nx = s to ksi", "x", "34.08 ksi");
gelijk("q = 10 kN/m\nx = q to klf", "x", "0.6852 klf");
gelijk("p = 2.4 kN/m^2\nx = p to psf", "x", "50.13 psf");
gelijk("p = 100 kN/m^2\nx = p to ksf", "x", "2.089 ksf");
gelijk("q = 1 kN/m\nx = q to plf", "x", "68.52 plf");
gelijk("g = 25 kN/m^3\nx = g to pcf", "x", "159.1 pcf");
gelijk("p = 50 psf\nx = p to kN/m^2", "x", "2.394 kN / m^2", "een getal met een nieuwe eenheid wordt herkend: 50 psf → 2.394 kN/m²");
gelijk("ksi = 2\ny = 3*ksi", "y", "6", "een variabele met de naam van een nieuwe eenheid blijft een variabele");

console.log("\nTaiwan MKS eenheden");
gelijk("s = 210 kgf/cm^2\nx = s to N/mm^2", "x", "20.59 N / mm^2");
gelijk("f = 9.80665 kN\nx = f to tf", "x", "1 tf");
gelijk("q = 9.80665 kN/m\nx = q to tf/m", "x", "1 tf / m");
gelijk("p = 9.80665 kN/m^2\nx = p to tf/m^2", "x", "1 tf / m^2");
gelijk("M = 9.80665 kN*m\nx = M to tf*m", "x", "1 tf m");

console.log("\nOpmaak");
const psi = exprToLatex("50 psi");
meld(psi.includes("\\text{psi}") && !psi.includes("\\psi"), "50 psi staat als eenheid, niet als ψ", psi);
const psi0 = exprToLatex("psi_0 * 2");
meld(psi0.includes("\\psi"), "de variabele ψ₀ blijft Grieks", psi0);
for (const e of ["kip", "lbf"]) {
  const l = exprToLatex(`3 ${e}`);
  meld(l.includes(`\\text{${e}}`), `3 ${e} staat als eenheid`, l);
}
const kipFt = uitkomst("F = 10 kip\na = 2 ft\nM = a*F", "M");
meld(/kip ft$/.test(kipFt ?? ""), "een moment in kip en ft: de lengte achteraan (kip ft), ook als ft eerst staat", kipFt);
const psiVar = exprToLatex("psi * 2");
meld(psiVar.includes("\\psi"), "een variabele psi (ψ) blijft Grieks", psiVar);

console.log("\nEigen eenheden");
gelijk(".kipf = 1000 lbf\nF = 3 kipf\nG = F to kN", "G", "13.34 kN", "een eigen eenheid uit een andere: 3 kipf = 13.34 kN");
gelijk(".EUR = 1\n.USD = 0.92 EUR\nP = 100 USD to EUR", "P", "92 EUR", "een nieuwe basiseenheid, met het getal vast aan de eenheid: 100 USD = 92 EUR");
const lek = uitkomst("F = 3 kipf", "F") ?? "";
meld(lek.startsWith("Error:"), "een eigen eenheid geldt niet in het volgende blad", lek);
/** De node van de definitieregel `.naam = …`. */
const definitie = (bron, naam) => alleNodes(evaluate(parse(bron))).find((n) => n.type === "eenheid-def" && n.name === naam);
const kN = definitie(".kN = 2 N", "kN");
meld(String(kN?.result ?? "").startsWith("Error:"), "een eigen eenheid met de naam van een bestaande geeft een fout", kN?.result);
gelijk(".kN = 2 N\nF = 1 kN to N", "F", "1000 N", "en de bestaande eenheid blijft wat hij was: 1 kN = 1000 N");
const dozijn = definitie(".dozijn = 12", "dozijn");
meld(String(dozijn?.result ?? "").startsWith("Error:"), "een getal zonder eenheid anders dan 1 geeft een fout", dozijn?.result);
const variabele = definitie("a = 2\n.a = 3 N", "a");
meld(String(variabele?.result ?? "").startsWith("Error:"), "een eigen eenheid met de naam van een variabele geeft een fout", variabele?.result);
for (const bron of [".5", ".Opmerking zonder is-teken"]) {
  const nodes = parse(bron);
  meld(!nodes.some((n) => n.type === "eenheid-def"), `"${bron}" is geen definitie van een eenheid`, JSON.stringify(nodes));
}
const html = render(evaluate(parse(".kipf = 1000 lbf")));
meld(html.includes("kipf") && html.includes("lbf") && !html.includes(".kipf") && !html.includes("Error"),
  "de definitieregel staat in beeld als eenheid, zonder de punt", html.slice(0, 200));

console.log("\nIndeling bij een grootheid");
const INDELING = {
  mm: "maat", in: "maat", m: "lengte", ft: "lengte",
  "mm^2": "doorsnedeOppervlakte", "m^2": "oppervlakte",
  "mm^3": "weerstandsmoment", "mm^4": "traagheidsmoment",
  kN: "kracht", "kN m": "moment", "kN / m": "lijnlast",
  "kN / m^2": "vlakbelasting", psf: "vlakbelasting",
  "N / mm^2": "spanning", MPa: "spanning", psi: "spanning",
  "kN / m^3": "volumegewicht", kg: "massa", degC: null,
  K: null, "K^-1": null, "1 / s": null,
  "kgf/cm^2": "spanning", "tf/m^2": "vlakbelasting", "kgf/m^2": "vlakbelasting",
  tf: "kracht", kgf: "kracht", "tf m": "moment", "tf / m": "lijnlast", "tf / m^3": "volumegewicht",
};
for (const [eenheid, verwacht] of Object.entries(INDELING)) {
  const g = grootheidVan(eenheid);
  meld(g === verwacht, `${eenheid} → ${verwacht}`, g);
}

console.log("\nWeergave in US customary");
const US = { stelsel: STELSELS.us };
const inStelsel = (bron, naam) => node(bron, naam, US)?.inStelsel;
const toont = (bron, naam, verwacht, wat) => {
  const w = inStelsel(bron, naam);
  meld(w?.result === verwacht, wat ?? `${bron.split("\n").pop()} → ${verwacht}`, JSON.stringify(w));
};
toont("L = 4.5 m", "L", "14.76 ft");
toont("b = 4500 mm", "b", "177.2 in");
toont("M = 10 kN*m", "M", "7.376 kip ft");
toont("f = 235 N/mm^2", "f", "34.08 ksi");
meld(inStelsel("dT = 20 K", "dT") === undefined, "een temperatuurverschil in K blijft staan");
const v = inStelsel("v = [1; 2] m", "v");
meld(/3\.281/.test(v?.result ?? "") && /6\.562/.test(v?.result ?? "") && /ft/.test(v?.result ?? "") && !/\bm\b/.test(v?.result ?? ""),
  "een vector in m: elk element in ft", JSON.stringify(v));
toont("z = 0 mm", "z", "0 in");
toont("n = -4.5 m", "n", "-14.76 ft");
const L45 = node("L = 4.5 m", "L", US);
meld(L45?.result === "4.5 m" && L45?.waarde === 4.5, "de rekenwaarde zelf blijft 4.5 m", JSON.stringify({ result: L45?.result, waarde: L45?.waarde }));

console.log("\nWeergave in Taiwan MKS");
const TW = { stelsel: STELSELS["tw-mks"] };
const inTwStelsel = (bron, naam) => node(bron, naam, TW)?.inStelsel;
const toontTw = (bron, naam, verwacht, wat) => {
  const w = inTwStelsel(bron, naam);
  meld(w?.result === verwacht, wat ?? `${bron.split("\n").pop()} → ${verwacht}`, JSON.stringify(w));
};
meld(inTwStelsel("L = 4.5 m", "L") === undefined, "een lengte in m blijft staan in tw-mks");
toontTw("b = 450 mm", "b", "45 cm");
toontTw("M = 9.80665 kN*m", "M", "1 tf m");
toontTw("F = 9.80665 kN", "F", "1 tf");
toontTw("f = 20.593965 N/mm^2", "f", "210 kgf / cm^2");
toontTw("g = 23.53596 kN/m^3", "g", "2.4 tf / m^3");

console.log("\nNotatie");
const f2 = inStelsel("x = 1234.567 mm:F2", "x");
meld(f2?.getoond === "48.605 in", "1234.567 mm:F2 → 48.605 in (een decimaal meer, zelfde nauwkeurigheid)", JSON.stringify(f2));
meld(decimalenNa(2, "mm", "in") === 3, "decimalenNa(2, mm, in) = 3", decimalenNa(2, "mm", "in"));
meld(decimalenNa(2, "in", "mm") === 1, "decimalenNa(2, in, mm) = 1", decimalenNa(2, "in", "mm"));

console.log("\nGeen gemengde regel");
const M = node("q = 0.9 kN/m\nL = 4 m\nM = q*L^2/8", "M", US);
const htmlM = render([M]);
meld(/klf/.test(htmlM) && /ft/.test(htmlM) && !/kN/.test(htmlM), "de ingevulde formule van M staat helemaal in klf en ft", htmlM.slice(0, 300));

console.log("\nEigen eenheden van buiten het blad (het project)");
const proj = alleNodes(evaluate(parse("F = 2 kipf\nG = F to kN", { eenheden: ["kipf"] }), {}, {},
  { eigenEenheden: [{ naam: "kipf", uitdrukking: "1000 lbf" }] })).find((n) => n.name === "G");
meld(proj?.result === "8.896 kN", "een eenheid van het project geldt in het blad: 2 kipf = 8.896 kN", proj?.result);
meld((uitkomst("F = 2 kipf", "F") ?? "").startsWith("Error:"), "en daarna niet meer");

console.log("\nBevindingen van het nakijken");
// 1. Een nieuwe basiseenheid bij elke doorrekening opnieuw (de app rekent bij elke toets).
for (let ronde = 1; ronde <= 3; ronde++) {
  gelijk(".EUR = 1\nP = 100 EUR", "P", "100 EUR", `een nieuwe basiseenheid werkt ook bij doorrekening ${ronde}`);
}
meld((uitkomst("P = 100 EUR", "P") ?? "").startsWith("Error:"), "en daarna nog steeds niet in een blad zonder de definitie");
// 2. Een regel die een eenheid gebruikt vóór die bestond (tijdens het typen), daarna mét definitie.
uitkomst("G = 3 dozen", "G");
gelijk(".dozen = 12 kg\nG = 3 dozen\nH = G to kg", "H", "36 kg", "een eigen eenheid werkt ook als dezelfde regel eerder zonder definitie werd doorgerekend");
// 3. Een stelsel verandert nooit een rekenwaarde, ook niet bij een temperatuur met #round of :F1.
const rondT = node("#round 1\nT = 20.123 degC\nU = T", "T", US);
const rondU = node("#round 1\nT = 20.123 degC\nU = T", "U", US);
meld(rondT?.result === "20.12 degC" && rondU?.result === "20.12 degC",
  "#round met een temperatuur: in het stelsel geen fout in de rekenwaarde", `${rondT?.result} / ${rondU?.result}`);
const f1 = node("T = 20.123 degC:F1", "T", US);
meld(f1?.getoond === "20.1 degC", "T:F1 houdt zijn notatie", JSON.stringify({ getoond: f1?.getoond, inStelsel: f1?.inStelsel }));
meld(decimalenNa(1, "degC", "degF") === 1, "decimalenNa met een verschoven eenheid (°C → °F) is een getal", decimalenNa(1, "degC", "degF"));
// 4. Zonder stelsel blijft een enkele letter na een getal een variabele (L, h, b zijn ook eenheden in mathjs).
for (const [expr, letter] of [["0.7 L", "L"], ["0.5 h", "h"], ["2 b", "b"]]) {
  const l = exprToLatex(expr);
  meld(!l.includes(`\\text{${letter}}`), `${expr}: ${letter} blijft een variabele`, l);
}
// 5. Een temperatuur gaat (nog) niet om: een verschil in °C is niet van een absolute temperatuur te onderscheiden.
meld(inStelsel("T = 20 degC", "T") === undefined, "een temperatuur in °C blijft staan");
meld(inStelsel("T_1 = 30 degC\nT_2 = 20 degC\ndT = T_1 - T_2", "dT") === undefined, "een temperatuurverschil in °C blijft staan");

console.log("\nInvoer");
meld(toonInvoer("4500", "mm", "in") === "177.165", "4500 mm in een veld in inch: 177.165", toonInvoer("4500", "mm", "in"));
const terug = (tekst, toon, bron) => JSON.stringify(invoerNaarBron(tekst, toon, bron));
meld(terug("12", "in", "mm") === '{"waarde":"304.8"}', "12 getypt in een veld in inch: 304.8 mm", terug("12", "in", "mm"));
meld(terug("12,5", "in", "mm") === '{"waarde":"317.5"}', "12,5 inch: 317.5 mm", terug("12,5", "in", "mm"));
meld(terug("5 m", "mm", "mm") === '{"waarde":"5000"}', "5 m in een veld in mm: 5000", terug("5 m", "mm", "mm"));
meld("fout" in invoerNaarBron("3 kip", "mm", "mm"), "3 kip in een veld in mm: een fout", terug("3 kip", "mm", "mm"));
meld(terug("12", "mm", "mm") === '{"waarde":"12"}', "een kaal getal in de eigen eenheid blijft letterlijk", terug("12", "mm", "mm"));
meld(terug("12,", "in", "mm") === '{"waarde":"304.8"}', "een getal halverwege (12,) rekent al om: 304.8 mm", terug("12,", "in", "mm"));
meld(terug("-", "in", "mm") === '{"waarde":"-"}' && terug("", "in", "mm") === '{"waarde":""}', "wat nog geen getal is, blijft staan", terug("-", "in", "mm"));
const veldUS = alleNodes(evaluate(parse("b = ?{4500}mm"), {}, {}, US)).find((n) => n.name === "b");
meld(veldUS?.toonEenheid === "in" && veldUS?.currentValue === "177.165", "een invoerveld in mm toont in US customary 177.165 in",
  JSON.stringify({ toon: veldUS?.toonEenheid, waarde: veldUS?.currentValue }));
const veldZonder = alleNodes(evaluate(parse("b = ?{4500}mm"))).find((n) => n.name === "b");
meld(veldZonder?.toonEenheid === undefined, "zonder stelsel geen andere eenheid");
const veldHtml = render(evaluate(parse("b = ?{4500}mm"), {}, {}, US));
meld(veldHtml.includes('data-toon-eenheid="in"') && veldHtml.includes('data-eenheid="mm"'), "het veld draagt de eenheid van de bron en die in beeld", veldHtml.slice(0, 300));
const aantal = alleNodes(evaluate(parse("n = ?{4}"), {}, {}, US)).find((n) => n.name === "n");
meld(aantal?.toonEenheid === undefined && aantal?.currentValue === "4", "een veld zonder eenheid verandert niet", JSON.stringify(aantal));

console.log("\nBevindingen van het nakijken, stap 2");
meld(terug("3/4", "in", "mm") === '{"waarde":"19.05"}', "3/4 in een veld in inch: 19.05 mm", terug("3/4", "in", "mm"));
meld(terug("2*6", "in", "mm") === '{"waarde":"304.8"}', "2*6 in een veld in inch: 304.8 mm", terug("2*6", "in", "mm"));
meld(terug("3/4", "mm", "mm") === '{"waarde":"3/4"}', "zonder omrekening blijft een uitdrukking letterlijk", terug("3/4", "mm", "mm"));
meld("fout" in invoerNaarBron("3 ki", "mm", "mm"), "een eenheid die nog niet af is (3 ki) wordt niet opgeslagen", terug("3 ki", "mm", "mm"));
let gooit = false;
try { toonInvoer("3", "kipf", "kip"); } catch { gooit = true; }
meld(!gooit, "toonInvoer met een onbekende eenheid gooit geen fout");
meld(terug("3 kipf", "kipf", "kipf") === '{"waarde":"3"}', "3 kipf in een veld in kipf: 3", terug("3 kipf", "kipf", "kipf"));
const kipfVeld = alleNodes(evaluate(parse(".kipf = 1000 lbf\nF = ?{2}kipf"), {}, {}, US)).find((n) => n.name === "F");
meld(kipfVeld?.toonEenheid === undefined, "een veld in een eigen eenheid van het blad rekent niet om", JSON.stringify(kipfVeld?.toonEenheid));
const fouteKeuze = alleNodes(evaluate(parse("F = ?{2}kN\nG = F*2"), {}, {}, { stelsel: { kracht: "kg" } })).find((n) => n.name === "G");
meld(!String(fouteKeuze?.result).startsWith("Error"), "een eenheid in het stelsel met de verkeerde dimensie breekt het blad niet", fouteKeuze?.result);
const fouten2 = zetProjectEenheden([{ naam: "d", uitdrukking: "5" }, { naam: "kipf", uitdrukking: "1000 lbf" }, { naam: "kipf2", uitdrukking: "2 kipf" }]);
meld(fouten2.has(0) && !fouten2.has(1) && !fouten2.has(2), "projecteenheden: een ongeldige geeft een melding, de rest werkt", JSON.stringify([...fouten2]));
gelijk("F = 2 kipf2\nG = F to kN", "G", "17.79 kN", "een projecteenheid uit een andere geldt in elk blad (2 kipf2 = 4 kipf = 17.79 kN)");
gelijk("d = 3\nz = 12 / 2 d", "z", "18", "een afgewezen projecteenheid (d) laat een variabele d met rust");
zetProjectEenheden([]);
meld((uitkomst("F = 2 kipf", "F") ?? "").startsWith("Error:"), "zonder projecteenheden is kipf weer onbekend");

console.log("\nVoor de beelden: omrekenen en de schrijfwijze in beeld");
meld(Math.abs(omrekenen(4500, "mm", "in") - 177.16535) < 1e-4, "4500 mm = 177,165 in", String(omrekenen(4500, "mm", "in")));
meld(Math.abs(omrekenen(12, "kN m", "kip ft") - 8.8507) < 1e-3, "12 kNm = 8,851 kip·ft", String(omrekenen(12, "kN m", "kip ft")));
for (const [in_, uit] of [["kN/m²", "kN/m^2"], ["kNm", "kN m"], ["kN/m¹", "kN/m"], ["kN/m1", "kN/m"], ["kN/m2", "kN/m^2"], ["kN/m3", "kN/m^3"], ["N/mm²", "N/mm^2"], ["kN·m", "kN m"], ["kN.m", "kN m"], ["mm", "mm"], ["mm⁴", "mm^4"], ["kNm/m", "kNm/m"], ["kNm²", "kN m^2"]]) {
  meld(eenheidUitBeeld(in_) === uit, `uit beeld: ${in_} → ${uit}`, eenheidUitBeeld(in_));
}
for (const [in_, uit] of [["kN / m^2", "kN/m²"], ["kip ft", "kip·ft"], ["N / mm^2", "N/mm²"], ["in^4", "in⁴"], ["klf", "klf"]]) {
  meld(eenheidInBeeld(in_) === uit, `in beeld: ${in_} → ${uit}`, eenheidInBeeld(in_));
}
meld(grootheidVan(eenheidUitBeeld("kNm")) === "moment" && grootheidVan(eenheidUitBeeld("kN/m¹")) === "lijnlast", "kNm is een moment en kN/m¹ een lijnlast");

console.log("\nModules");
const PROJECT = { CC: 2, K_FI: 1, rekenwijze: 1 };
for (const bestand of ["balklaag.ts", "ligger.ts"]) {
  const tpl = laadTemplate(bestand);
  const zonder = render(evaluate(parse(tpl), {}, PROJECT));
  const leeg = render(evaluate(parse(tpl), {}, PROJECT, {}));
  meld(zonder === leeg, `${bestand}: zonder stelsel dezelfde uitvoer als met {}`);
  const basis = JSON.stringify(reken(tpl, {}, PROJECT).values);
  for (const [naam, stelsel] of Object.entries(STELSELS)) {
    const met = JSON.stringify(reken(tpl, {}, PROJECT, { stelsel }).values);
    meld(met === basis, `${bestand}: met ${naam} precies dezelfde rekenwaarden, ook elke UC`);
  }
}

if (fouten > 0) {
  console.error(`\nEenheden: ${fouten} afwijking(en).`);
  process.exit(1);
}
console.log("\nEenheden: alles klopt.");
