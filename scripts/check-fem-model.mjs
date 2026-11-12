/**
 * Controle van het blok `@fem` (packages/core/src/femBlok.ts, femNet.ts,
 * femResultaat.ts): een blad bouwt een plaatmodel op, Open FEM Studio rekent het door
 * (`solve_open_fem_3d`) en het blad rekent verder met de uitkomsten.
 *
 * Toetst, zonder FEM Studio (de antwoorden staan vastgelegd in scripts/fixtures/fem/):
 *   • het lezen van het blok: de regels, #for, fouten per regel, een blok zonder @end;
 *   • het meshen: één raster van vierhoeken door alle plaatranden en veren, gedeelde
 *     knopen waar platen van verschillende dikte tegen elkaar liggen, geen hangende
 *     knopen, zijden niet langer dan de maas, het oppervlak per dikte, de belasting
 *     per geval, de veren op knopen en verdeeld over de paalkop;
 *   • de JSON tegen het schema van solve_open_fem_3d (scripts/fixtures/fem/
 *     solve_open_fem_3d.schema.json, uit tools/list van de server, zonder de teksten);
 *   • de hash: dezelfde invoer in mm of in m geeft hetzelfde antwoord, een andere
 *     combinatie vraagt niets nieuws aan FEM Studio;
 *   • zonder FEM Studio: wacht in de werkruimte, NIET GEREKEND elders en bij een fout,
 *     en dan geen enkele uitkomst in de scope;
 *   • met de vastgelegde antwoorden van de echte server: evenwicht per geval, de
 *     combinaties als lineaire som, de omhullende, de functies voor een punt en een
 *     strook, de symmetrie, het beeld op papier en in 3D, en een verwijzing uit een
 *     ander blad;
 *   • vastleggen: het verzoek zoals het bewaard wordt geeft precies dezelfde JSON als
 *     wat verzonden is, het antwoord wordt compact bewaard en teruggelezen, een raster
 *     dat tussen de gevallen verschilt wordt gemeld;
 *   • welke tools van FEM Studio een blad mag gebruiken (ook de lijst in Rust);
 *   • twee vergelijkingen met een bekende oplossing: Navier voor een vrij opgelegde
 *     vierkante plaat, en plaat_palen (packages/core/src/plaat.ts) voor een vlakke
 *     plaat op palen. De afwijkingen staan in de uitvoer.
 *
 * De antwoorden maakt scripts/proef-fem-model.mjs opnieuw met de echte server.
 *
 * Draaien:  node scripts/check-fem-model.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { existsSync, readFileSync } from "node:fs";
import {
  alsAntwoord,
  evaluate,
  evaluateMetScope,
  femArgumenten,
  femBewaar,
  femStrook,
  femVerzoekArgumenten,
  femWaarde,
  leesVastgelegdeToetsingen,
  parse,
  render,
  TOETS_UITGESLOTEN,
  toetsToolToegestaan,
} from "../packages/core/dist/index.js";
import { plaatOplossing } from "../packages/core/dist/plaat.js";
import * as cache from "../packages/desktop/src/rekenen/toetsCache.ts";
import { scopeMetVerwijzingen } from "../packages/desktop/src/rekenen/verwijzingen.ts";
import { NAVIER, PALEN, VLOER } from "./fixtures/fem/bladen.mjs";

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${ok || !detail ? "" : "  -> " + detail}`);
  if (!ok) fouten++;
}
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
const pct = (a, b) => `${((100 * (a - b)) / b).toFixed(2)} %`;
const fixtureUrl = (naam) => new URL(`./fixtures/fem/${naam}`, import.meta.url);
const leesFixture = (naam) => (existsSync(fixtureUrl(naam)) ? JSON.parse(readFileSync(fixtureUrl(naam), "utf8")) : null);

const femVan = (nodes) => {
  for (const n of nodes) {
    if (n.type === "fem") return n;
    const k = n.children ? femVan(n.children) : null;
    if (k) return k;
  }
  return null;
};
const vragen = (bron, opties = {}) => femVan(evaluate(parse(bron), {}, {}, { toetsModus: "vragen", ...opties }));
const metAntwoorden = (bron, records, modus = "lezen", extra = {}) => {
  const toetsingen = Object.fromEntries(Object.entries(records).map(([h, v]) => [h, alsAntwoord(v)]));
  return evaluateMetScope(parse(bron), {}, {}, { toetsingen, toetsModus: modus, ...extra });
};
const getal = (w) => (w && typeof w.toNumber === "function" ? w : w);
const inEenheid = (w, eenheid) => (w && typeof w.toNumber === "function" ? w.toNumber(eenheid) : Number(w));

// ── Een klein JSON-schema, genoeg voor het schema van solve_open_fem_3d ─────────
function valideer(schema, w, pad = "$", uit = []) {
  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : [];
  const soort = w === null ? "null" : Array.isArray(w) ? "array" : typeof w;
  if (types.length) {
    const past = types.some((t) => t === soort || (t === "integer" && Number.isInteger(w)) || (t === "number" && soort === "number"));
    if (!past) {
      uit.push(`${pad}: ${soort}, verwacht ${types.join("|")}`);
      return uit;
    }
  }
  if (schema.enum && !schema.enum.includes(w)) uit.push(`${pad}: ${JSON.stringify(w)} niet in ${JSON.stringify(schema.enum)}`);
  if (typeof w === "number") {
    if (!Number.isFinite(w)) uit.push(`${pad}: geen eindig getal`);
    if (schema.minimum !== undefined && w < schema.minimum) uit.push(`${pad}: ${w} < ${schema.minimum}`);
    if (schema.maximum !== undefined && w > schema.maximum) uit.push(`${pad}: ${w} > ${schema.maximum}`);
    if (schema.exclusiveMinimum !== undefined && !(w > schema.exclusiveMinimum)) uit.push(`${pad}: ${w} ≤ ${schema.exclusiveMinimum}`);
    if (schema.exclusiveMaximum !== undefined && !(w < schema.exclusiveMaximum)) uit.push(`${pad}: ${w} ≥ ${schema.exclusiveMaximum}`);
  }
  if (soort === "array") {
    if (schema.minItems !== undefined && w.length < schema.minItems) uit.push(`${pad}: minder dan ${schema.minItems} elementen`);
    if (schema.maxItems !== undefined && w.length > schema.maxItems) uit.push(`${pad}: meer dan ${schema.maxItems} elementen`);
    if (schema.items) w.forEach((x, i) => valideer(schema.items, x, `${pad}[${i}]`, uit));
  }
  if (soort === "object") {
    for (const r of schema.required ?? []) if (!(r in w)) uit.push(`${pad}: ${r} ontbreekt`);
    for (const [k, v] of Object.entries(w)) {
      const sub = schema.properties?.[k];
      if (sub) valideer(sub, v, `${pad}.${k}`, uit);
      else if (schema.additionalProperties === false) uit.push(`${pad}: ${k} staat niet in het schema`);
    }
  }
  return uit;
}

const schema = leesFixture("solve_open_fem_3d.schema.json");
meld(!!schema, "het schema van solve_open_fem_3d staat in scripts/fixtures/fem/");

// ── Lezen ───────────────────────────────────────────────────────────────────
console.log("\nHet blok lezen");
{
  const [n] = parse(VLOER).filter((x) => x.type === "fem");
  meld(n?.naam === "vloer" && n.fouten.length === 0, "@fem vloer … @end wordt één blok zonder fouten", JSON.stringify(n?.fouten));
  const soorten = JSON.stringify(n?.regels ?? []);
  meld(/"for"/.test(soorten) && /"combinatie"/.test(soorten) && /"geval"/.test(soorten), "met #for, gevallen en combinaties");
  const fout = parse("@fem x\n  plaat 0; 0; 1\n  vlaklast 1\n  onzin 3\n  geval G\n  geval G\n@end").find((x) => x.type === "fem");
  const f = (fout?.fouten ?? []).join(" | ");
  meld(/regel 1/.test(f) && /plaat/.test(f), "een plaat met te weinig maten is een fout op die regel", f);
  meld(/regel 2/.test(f) && /geval/.test(f), "een last vóór het eerste geval is een fout", f);
  meld(/regel 3/.test(f) && /onzin/.test(f), "een onbekend woord is een fout", f);
  meld(/regel 5/.test(f) && /G/.test(f), "een geval met een naam die er al is, is een fout", f);
  const open = parse("@fem x\n  maas 1 m").find((x) => x.type === "fem");
  meld((open?.fouten ?? []).some((t) => /@end/.test(t)), "een blok zonder @end is een fout");
  const naam = parse("@fem 1x\n@end").find((x) => x.type === "fem");
  meld(!naam, "een naam moet met een letter beginnen");
}

// ── Meshen ──────────────────────────────────────────────────────────────────
console.log("\nHet raster");
const vloerVragen = vragen(VLOER);
const model = vloerVragen?.verzoeken?.[0]?.bewaar;
{
  meld(vloerVragen?.status === "wacht" && vloerVragen.verzoeken?.length === 2, "twee gevallen: twee verzoeken aan FEM Studio", `${vloerVragen?.status} ${vloerVragen?.melding ?? ""}`);
  meld(vloerVragen?.verzoeken?.every((v) => v.tool === "solve_open_fem_3d" && /^t[0-9a-f]{16}$/.test(v.hash)), "elk verzoek is solve_open_fem_3d met een eigen hash");
  meld(model?.vorm === "fem-plaat/1", "het verzoek wordt bewaard als fem-plaat/1");
}
if (model) {
  const N = model.x.length;
  const E = model.el.length / 4;
  const knoop = (i) => [model.x[i], model.y[i]];
  let rechthoeken = true;
  let groot = 0;
  let tegenKlok = true;
  const oppPerDikte = new Map();
  let opp = 0;
  for (let e = 0; e < E; e++) {
    const [a, b, c, d] = model.el.slice(4 * e, 4 * e + 4).map(knoop);
    rechthoeken &&= a[1] === b[1] && b[0] === c[0] && c[1] === d[1] && d[0] === a[0];
    tegenKlok &&= b[0] > a[0] && c[1] > b[1];
    groot = Math.max(groot, b[0] - a[0], d[1] - a[1]);
    const A = (b[0] - a[0]) * (d[1] - a[1]);
    opp += A;
    const t = model.t[model.pl[e]];
    oppPerDikte.set(t, (oppPerDikte.get(t) ?? 0) + A);
  }
  meld(rechthoeken && tegenKlok, `${E} vierhoeken, alle rechthoekig en tegen de klok in`);
  meld(groot <= 0.5 + 1e-9, `geen zijde langer dan de maas van 0,5 m (grootste ${groot.toFixed(3)} m)`);
  meld(Math.abs(opp - 100) < 1e-9, `het oppervlak is 10 × 10 = 100 m² (${opp.toFixed(6)})`);
  const per = (t) => oppPerDikte.get(t) ?? 0;
  // Koppen: vier hoeken van 0,5 × 0,5, vier randen van 1 × 0,5 en één van 1 × 1 = 4 m².
  // Stroken: 2 × 10 × 1 − 1 (kruising) = 19 m², waarvan 3 m² onder een kop = 16 m².
  meld(Math.abs(per(0.45) - 4) < 1e-9 && Math.abs(per(0.35) - 16) < 1e-9 && Math.abs(per(0.25) - 80) < 1e-9,
    "per dikte: koppen 4 m², stroken 16 m², vloer 80 m² (de laatste plaat wint)",
    [...oppPerDikte].map(([t, a]) => `${t}: ${a}`).join(", "));

  // Gedeelde knopen: elke binnenzijde hoort bij precies twee elementen, en er ligt
  // nergens een knoop midden op een zijde (geen hangende knopen).
  const zijden = new Map();
  for (let e = 0; e < E; e++) {
    const k = model.el.slice(4 * e, 4 * e + 4);
    for (let z = 0; z < 4; z++) {
      const p = k[z], q = k[(z + 1) % 4];
      const sleutel = p < q ? `${p}-${q}` : `${q}-${p}`;
      (zijden.get(sleutel) ?? zijden.set(sleutel, []).get(sleutel)).push(e);
    }
  }
  let dikteSprong = 0;
  let meerDanTwee = 0;
  for (const els of zijden.values()) {
    if (els.length > 2) meerDanTwee++;
    if (els.length === 2 && model.t[model.pl[els[0]]] !== model.t[model.pl[els[1]]]) dikteSprong++;
  }
  meld(dikteSprong > 0 && meerDanTwee === 0, `${dikteSprong} zijden tussen platen van verschillende dikte, elk gedeeld door twee elementen met dezelfde twee knopen`);
  const xs = [...new Set(model.x)].sort((a, b) => a - b);
  const ys = [...new Set(model.y)].sort((a, b) => a - b);
  const opZijde = new Set();
  for (const s of zijden.keys()) {
    const [p, q] = s.split("-").map(Number);
    const [x0, x1] = [Math.min(model.x[p], model.x[q]), Math.max(model.x[p], model.x[q])];
    const [y0, y1] = [Math.min(model.y[p], model.y[q]), Math.max(model.y[p], model.y[q])];
    if (x0 === x1) for (const y of ys) if (y > y0 && y < y1) opZijde.add(`${x0},${y}`);
    if (y0 === y1) for (const x of xs) if (x > x0 && x < x1) opZijde.add(`${x},${y0}`);
  }
  const hangend = [...Array(N).keys()].filter((i) => opZijde.has(`${model.x[i]},${model.y[i]}`));
  meld(hangend.length === 0, "geen hangende knopen: het raster loopt door alle plaatranden", hangend.slice(0, 5).join(", "));
  for (const lijn of [0.5, 4.5, 5.5, 9.5, 0.2, 4.8, 5.2, 9.8]) {
    if (!xs.includes(lijn) || !ys.includes(lijn)) meld(false, `rasterlijn op ${lijn} m (plaatrand of paalkop)`);
  }
  meld(xs.includes(4.5) && xs.includes(4.8) && ys.includes(9.8), "rasterlijnen op elke plaatrand en op de rand van elke paalkop");

  // Veren: elke paal op een knoop, de veer over de knopen binnen de kop verdeeld.
  const somK = model.veren.reduce((s, v) => s + v.reduce((t, [, k]) => t + k, 0), 0);
  meld(model.veren.length === 9 && Math.abs(somK - 9 * 200000) < 1e-6, `9 veren, samen 9 × 200 MN/m (${somK})`);
  const aantal = model.veren.map((v) => v.length).join(",");
  meld(aantal === "3,4,3,4,5,4,3,4,3", `knopen per paalkop: 3 in een hoek, 4 aan een rand, 5 midden (${aantal})`);
  const midden = model.veren[4];
  meld(midden.some(([k]) => model.x[k] === 5 && model.y[k] === 5) && midden.every(([k]) => Math.hypot(model.x[k] - 5, model.y[k] - 5) <= 0.2 + 1e-9),
    "de middelste paal: de knoop op (5, 5) en de knopen binnen de kop van 400 mm");

  // De JSON tegen het schema, en de belasting per geval.
  const somLast = (args) => {
    const opp = new Map();
    for (const e of args.shellElements) {
      const [a, , c] = e.nodeIds.map((id) => args.nodes[id - 1]);
      opp.set(e.plateId, (opp.get(e.plateId) ?? 0) + (c.x - a.x) * (c.y - a.y));
    }
    const vlak = (args.surfaceLoads ?? []).reduce((s, l) => s - l.qzKnPerM2 * opp.get(l.plateId), 0);
    const punt = (args.nodalLoads ?? []).reduce((s, l) => s - l.fz, 0);
    return vlak + punt;
  };
  const [G, Q] = vloerVragen.verzoeken.map((v) => femArgumenten(v.bewaar));
  meld(JSON.stringify(femVerzoekArgumenten(vloerVragen.verzoeken[0])) === JSON.stringify(G) && Object.keys(vloerVragen.verzoeken[0].argumenten).length === 0,
    "de app maakt de JSON uit het rekenmodel (femVerzoekArgumenten); het verzoek draagt hem niet dubbel");
  if (schema) {
    const fG = valideer(schema, G);
    const fQ = valideer(schema, Q);
    meld(fG.length === 0 && fQ.length === 0, "de JSON van beide gevallen past in het schema van solve_open_fem_3d", [...fG, ...fQ].slice(0, 5).join("; "));
  }
  const ids = new Set(G.nodes.map((n) => n.id));
  const platen = new Set(G.plates.map((p) => p.id));
  meld(G.shellElements.every((e) => e.nodeIds.length === 4 && new Set(e.nodeIds).size === 4 && e.nodeIds.every((i) => ids.has(i)) && platen.has(e.plateId)),
    "elk element: vier verschillende, bestaande knopen en een bestaande plaat");
  meld(G.schemaVersion === 2 && G.analysis === "linear", "schemaVersion 2 en lineair");
  meld(G.supports.every((s) => ids.has(s.nodeId)) && new Set(G.supports.map((s) => s.nodeId)).size === G.supports.length, "één opleggingsregel per knoop");
  const inVlak = G.supports.filter((s) => s.ux || s.uy);
  meld(inVlak.length === 2 && G.supports.filter((s) => s.ux).length === 1, "in het vlak precies drie vrijheidsgraden vast (geen mechanisme, geen dwang)");
  // G: 25·(80·0,25 + 16·0,35 + 4·0,45) + 1·100 = 685 + 100 = 785 kN.
  meld(Math.abs(somLast(G) - 785) < 1e-6, `geval G: eigen gewicht per dikte plus 1 kN/m² = 785 kN (${somLast(G).toFixed(6)})`);
  // Q: 5 kN/m² op 5 × 10 m plus 20 kN = 270 kN.
  meld(Math.abs(somLast(Q) - 270) < 1e-6, `geval Q: 5 kN/m² op de helft plus 20 kN = 270 kN (${somLast(Q).toFixed(6)})`);
  const opKnoop = (args, x, y) => (args.nodalLoads ?? []).filter((l) => args.nodes[l.nodeId - 1].x === x && args.nodes[l.nodeId - 1].y === y);
  const pl = opKnoop(Q, 7.5, 7.5);
  meld(pl.length === 1 && pl[0].fz === -20, "de puntlast op een knoop, omlaag is −Z");
  // De vlaklast op 0..5 × 0..10 gaat als knooplasten, q·A/4 op elke hoek: een knoop met
  // vier elementen van 0,5 × 0,5 eromheen krijgt 4 · 5 · 0,25 / 4 = 1,25 kN.
  meld(Math.abs(opKnoop(Q, 2.5, 2.5)[0]?.fz + 1.25) < 1e-9 && opKnoop(Q, 6, 2.5).length === 0 && G.nodalLoads === undefined,
    "een vlaklast op een rechthoek: q·A/4 op elke hoek van de elementen eronder, en niets ernaast");
  meld(G.plates.length === new Set(model.pl).size && G.surfaceLoads.length === G.plates.length, "één plaat in de JSON per plaat uit het blok, elk met zijn eigen gewicht als vlaklast");
  meld(G.surfaceLoads.every((l) => l.qzKnPerM2 < 0 && l.qxKnPerM2 === 0 && l.qyKnPerM2 === 0), "vlaklasten omlaag zijn −Z");
  meld(new Set(G.nodes.map((n) => n.z)).size === 1, "alle knopen in één vlak");
}

// ── De hash ─────────────────────────────────────────────────────────────────
console.log("\nDe hash");
{
  const hashes = (bron) => (vragen(bron)?.verzoeken ?? []).map((v) => v.hash).join(",");
  const basis = hashes(VLOER);
  meld(basis && hashes(VLOER.replace("L = 5 m", "L = 5000 mm")) === basis, "L = 5 m of 5000 mm: dezelfde hashes");
  meld(hashes(VLOER.replace("combinatie UGT = 1.2*G", "combinatie UGT = 1.35*G")) === basis, "een andere factor in een combinatie vraagt niets nieuws aan FEM Studio");
  const ander = hashes(VLOER.replace("vlaklast 5 kN/m^2", "vlaklast 6 kN/m^2")).split(",");
  meld(ander.every((h) => !basis.includes(h)), "een andere last: alle gevallen opnieuw (het raster kan verschuiven)");
}

// ── Zonder FEM Studio ───────────────────────────────────────────────────────
console.log("\nZonder FEM Studio");
{
  const { nodes, scope } = evaluateMetScope(parse(VLOER), {}, {}, { toetsModus: "lezen" });
  const f = femVan(nodes);
  meld(f?.status === "niet-gerekend" && !f.verzoeken?.length, "elders dan de werkruimte: niet gerekend, geen verzoek");
  meld(!Object.keys(scope).some((k) => k.startsWith("vloer_")), "geen enkele uitkomst in de scope", Object.keys(scope).filter((k) => k.startsWith("vloer_")).join(", "));
  const mx = nodes.find((n) => n.name === "m_x");
  meld(/Error/.test(String(mx?.result)), "een regel die een uitkomst gebruikt, geeft een fout", String(mx?.result));
  const html = render(nodes);
  meld(/NIET GEREKEND/.test(html) && !/voldoet/i.test(html), "op het blad: NIET GEREKEND, nooit een uitkomst of oordeel");
  const fout = { ok: false, melding: "Open FEM Studio werkt alleen in de desktop-app" };
  const metFout = femVan(evaluate(parse(VLOER), {}, {}, {
    toetsModus: "vragen",
    toetsingen: Object.fromEntries(vloerVragen.verzoeken.map((v) => [v.hash, fout])),
  }));
  meld(metFout?.status === "fout" && /desktop-app/.test(metFout.melding) && metFout.opnieuw, "een fout van FEM Studio: niet gerekend met de reden, en opnieuw rekenen kan");
  const en = render(evaluate(parse(VLOER), {}, {}, { toetsModus: "lezen", taal: "en" }));
  meld(/NOT CALCULATED/.test(en), "in het Engels: NOT CALCULATED");
  const geenSteun = vragen("@fem x\n  materiaal 30 GPa; 0.2\n  plaat 0; 0; 4; 4; 0.2\n  geval G\n    vlaklast 1\n@end");
  meld(geenSteun?.status === "fout" && /steun|veer/i.test(geenSteun.melding) && !geenSteun.verzoeken?.length, "een model zonder steunpunten gaat niet naar FEM Studio", geenSteun?.melding);
  const nl = vragen("@fem x\n  materiaal 30 GPa; 0.2\n  analyse niet-lineair\n  plaat 0; 0; 4; 4; 0.2\n  veren 0; 0; 2; 2; 4; 4; 1e5\n  geval G\n    vlaklast 1\n@end");
  meld(nl?.status === "fout" && /lineair/.test(nl.melding), "niet-lineair kan FEM Studio voor platen nog niet: een eerlijke melding", nl?.melding);
}

// ── Met de antwoorden van de echte server ───────────────────────────────────
console.log("\nVloer op palen, met de vastgelegde antwoorden");
const vloerFix = leesFixture("vloer.json");
meld(!!vloerFix, "scripts/fixtures/fem/vloer.json staat er (node scripts/proef-fem-model.mjs --bewaar)");
if (vloerFix && model) {
  const records = leesVastgelegdeToetsingen(vloerFix.toetsingen);
  meld(Object.keys(records ?? {}).length === 2, "twee vastgelegde antwoorden, leesbaar als toetsingen van een blad");
  meld(vloerVragen.verzoeken.every((v) => records?.[v.hash]), "de hashes van het blad van nu vinden hun antwoord");
  const { nodes, scope } = metAntwoorden(VLOER, records ?? {});
  const f = femVan(nodes);
  meld(f?.status === "klaar", `het blok is klaar, zonder FEM Studio (${f?.status} ${f?.melding ?? ""})`);
  for (const g of f?.gevallen ?? []) {
    meld(rel(g.somR, g.somLast) < 1e-6, `geval ${g.naam}: ΣR = ${g.somR.toFixed(3)} kN = Σ last ${g.somLast.toFixed(3)} kN`);
  }
  const R = (naam) => scope[`vloer_${naam}_R`]?.toArray?.().flat().map((w) => inEenheid(w, "kN"));
  const [rG, rQ, rU, rB] = ["G", "Q", "UGT", "BGT"].map(R);
  meld(rU?.length === 9 && rU.every((r, i) => Math.abs(r - (1.2 * rG[i] + 1.5 * rQ[i])) < 1e-6), "UGT = 1,2·G + 1,5·Q: de paalreacties tellen lineair op");
  meld(rB?.every((r, i) => Math.abs(r - (rG[i] + rQ[i])) < 1e-6), "BGT = G + Q");
  const v = (k, e) => inEenheid(scope[k], e);
  meld(Math.abs(v("vloer_R_max", "kN") - Math.max(...rU, ...rB)) < 1e-9, `de omhullende R_max = ${v("vloer_R_max", "kN").toFixed(2)} kN, de grootste over de combinaties`);
  meld(Math.abs(v("vloer_UGT_R_max", "kN") - Math.max(...rU)) < 1e-9, "R_max per combinatie");
  meld(Math.abs(v("m_x", "kN") - v("vloer_UGT_mx_max", "kN")) < 1e-9, "m_x = vloer.UGT.mx_max: de punt in de naam is een liggend streepje");
  meld(rel(v("vloer_G_mx_max", "kN"), v("vloer_G_my_max", "kN")) < 1e-6 && rel(v("vloer_G_mx_min", "kN"), v("vloer_G_my_min", "kN")) < 1e-6,
    `symmetrie onder G: m_x,max = m_y,max = ${v("vloer_G_mx_max", "kN").toFixed(3)} kNm/m`);
  meld(v("vloer_G_mx_min", "kN") < 0 && v("vloer_G_mx_max", "kN") > 0, "trek boven boven de palen (negatief), trek onder in het veld (positief)");
  meld(v("w_BGT", "mm") > 0 && v("vloer_BGT_w_max", "mm") === v("w_BGT", "mm"), `doorbuiging omlaag positief: w_BGT = ${v("w_BGT", "mm").toFixed(3)} mm`);

  // Een waarde op een knoop is de waarde van FEM Studio op die knoop.
  const rek = (expr) => evaluateMetScope(parse(`${VLOER}\nuit = ${expr}`), {}, {}, { toetsingen: Object.fromEntries(Object.entries(records).map(([h, r]) => [h, alsAntwoord(r)])) }).scope.uit;
  const hG = vloerVragen.verzoeken[0].hash;
  const recG = records[hG];
  const knoopIndex = recG.verzoek.x.findIndex((x, i) => x === 2.5 && recG.verzoek.y[i] === 2.5);
  const wKnoop = -recG.uitkomst.uz[knoopIndex] * 1000;
  meld(Math.abs(inEenheid(rek('fem_waarde(vloer; "G"; "w"; 2.5 m; 2.5 m)'), "mm") - wKnoop) < 1e-9, `fem_waarde op een knoop: w = ${wKnoop.toFixed(4)} mm, de waarde van FEM Studio`);
  // De functies in het blad zijn dezelfde als in de kern (femWaarde, femStrook).
  const fm = scope.vloer;
  meld(Math.abs(inEenheid(rek('fem_waarde(vloer; "UGT"; "mx"; 3.3 m; 1.7 m)'), "kN") - femWaarde(fm, "UGT", "mx", 3.3, 1.7)) < 1e-9, "fem_waarde in het blad is femWaarde van de kern, in kNm/m");
  // Een strook: het gemiddelde over een rechthoek, tegen een fijne middelpuntsregel.
  const strook = inEenheid(rek('fem_strook(vloer; "UGT"; "mx"; 4.2 m; 1 m; 5.8 m; 4 m)'), "kN");
  let s = 0;
  const n = 64;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) s += femWaarde(fm, "UGT", "mx", 4.2 + ((i + 0.5) * 1.6) / n, 1 + ((j + 0.5) * 3) / n);
  }
  meld(rel(strook, s / (n * n)) < 2e-3, `fem_strook over 1,6 × 3 m = ${strook.toFixed(3)} kNm/m, een middelpuntsregel ${(s / (n * n)).toFixed(3)}`);
  const lijn = inEenheid(rek('fem_strook(vloer; "G"; "mx"; 5 m; 3.75 m; 5 m; 6.25 m)'), "kN");
  let sl = 0;
  for (let j = 0; j < 400; j++) sl += femWaarde(fm, "G", "mx", 5, 3.75 + ((j + 0.5) * 2.5) / 400);
  meld(rel(lijn, sl / 400) < 2e-3, `fem_strook over een lijn (kolomstrook boven de middelste paal) = ${lijn.toFixed(3)} kNm/m`);
  meld(Math.abs(femStrook(fm, "G", "w", 2.5, 2.5, 2.5, 2.5) - femWaarde(fm, "G", "w", 2.5, 2.5)) < 1e-12, "een strook van één punt is de waarde op dat punt");
  const buiten = evaluate(parse(`${VLOER}\nuit = fem_waarde(vloer; "G"; "w"; 11 m; 2 m)`), {}, {}, { toetsingen: Object.fromEntries(Object.entries(records).map(([h, r]) => [h, alsAntwoord(r)])) })
    .find((x) => x.name === "uit");
  meld(/Error/.test(String(buiten?.result)) && /geen plaat/.test(String(buiten?.result)), "een punt naast de vloer geeft een fout, geen waarde", String(buiten?.result));
  let geenSet = "";
  try {
    femWaarde(fm, "SLS", "w", 1, 1);
  } catch (e) {
    geenSet = e.message;
  }
  meld(/SLS/.test(geenSet) && /UGT/.test(geenSet), "een geval of combinatie die er niet is: een fout met de namen die er wel zijn", geenSet);

  // Op het blad en in beeld.
  const html = render(nodes);
  meld(/UGT/.test(html) && /BGT/.test(html) && /2026\.\d+\.\d+/.test(html), "op het blad: een tabel per combinatie en de versie van FEM Studio");
  const svg = String(rek('fem_svg(vloer; "UGT"; "mx")'));
  // De vlakken: elementen van dezelfde kleur naast elkaar zijn samengevoegd, en samen
  // bedekken ze de hele vloer (hier een vierkant), zonder gat of overlap.
  const rechthoeken = [...svg.matchAll(/<rect x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)" class="fem-el"/g)].map((r) => r.slice(1).map(Number));
  const [rx0, rx1, ry0, ry1] = [Math.min(...rechthoeken.map((r) => r[0])), Math.max(...rechthoeken.map((r) => r[0] + r[2])), Math.min(...rechthoeken.map((r) => r[1])), Math.max(...rechthoeken.map((r) => r[1] + r[3]))];
  const somOpp = rechthoeken.reduce((s, r) => s + r[2] * r[3], 0);
  meld(svg.startsWith("<svg") && rechthoeken.length > 0 && rechthoeken.length < recG.verzoek.el.length / 4 && rel(somOpp, (rx1 - rx0) * (ry1 - ry0)) < 0.01 && /kNm\/m/.test(svg),
    `fem_svg: een plattegrond in ${rechthoeken.length} vlakken voor ${recG.verzoek.el.length / 4} elementen, samen de hele vloer, met een legenda in kNm/m`);
  const metBeeld = (regel) => femVan(metAntwoorden(VLOER.replace("@end", `  ${regel}\n@end`), records).nodes);
  const kaart = metBeeld("beeld UGT mx");
  meld(kaart?.status === "klaar" && kaart.beelden?.length === 1 && kaart.beelden[0] === svg && /calc-fem-kaart/.test(render([kaart])),
    "beeld UGT mx in het blok: dezelfde plattegrond onder het blok, zonder iets nieuws aan FEM Studio te vragen");
  meld(/SLS/.test(metBeeld("beeld SLS mx")?.melding ?? "") && /grootheid/.test(metBeeld("beeld UGT zz")?.melding ?? ""), "een beeld van een onbekende combinatie of grootheid is een fout op die regel");
  const drieD = evaluate(parse(`${VLOER}\n@3d\neenheid m\nfem vloer BGT w\n@end`), {}, {}, { toetsingen: Object.fromEntries(Object.entries(records).map(([h, r]) => [h, alsAntwoord(r)])) });
  const scene = drieD.find((x) => x.type === "3d")?.scene;
  const net = scene?.elementen.find((e) => e.soort === "net");
  meld(net && net.punten.length === recG.verzoek.x.length && net.vlakken.length === recG.verzoek.el.length / 4, "@3d: fem vloer BGT w geeft een gekleurd vlak over het hele raster");
  const drieDHtml = render(drieD);
  meld(/calc-3d-terugval/.test(drieDHtml) && !/calc-3d-melding/.test(drieDHtml), "het 3D-beeld tekent ook als stilstaande projectie, zonder meldingen");

  // Uit een ander blad: de uitkomst met liggende streepjes, en het model zelf.
  const ander = ['m_Ed = #1.vloer_UGT_mx_max', 'w_p = fem_waarde(#1.vloer; "BGT"; "w"; 2.5 m; 2.5 m)'].join("\n");
  const opties = { toetsingen: Object.fromEntries(Object.entries(records).map(([h, r]) => [h, alsAntwoord(r)])), toetsModus: "lezen" };
  const refScope = scopeMetVerwijzingen(ander, {}, {}, [{ ref: "1", source: VLOER, waarden: {} }], {}, opties);
  const uitAnder = evaluateMetScope(parse(ander), {}, refScope, opties).scope;
  meld(Math.abs(inEenheid(uitAnder.m_Ed, "kN") - v("vloer_UGT_mx_max", "kN")) < 1e-9 && Math.abs(inEenheid(uitAnder.w_p, "mm") - femWaarde(fm, "BGT", "w", 2.5, 2.5)) < 1e-9,
    "uit een ander blad: #1.vloer_UGT_mx_max en fem_waarde(#1.vloer; …)");

  // Vastleggen: het bewaarde verzoek geeft dezelfde JSON, en past in het schema.
  meld(alsAntwoord(recG).verzoek === recG.verzoek, "alsAntwoord geeft het bewaarde verzoek mee (het raster)");
  if (schema) meld(valideer(schema, femArgumenten(recG.verzoek)).length === 0, "het bewaarde verzoek geeft weer JSON die in het schema past");
  const gebruikt = cache.gebruikteToetsingen({ ...records, t0000000000000000: records[hG] }, { nodes });
  meld(Object.keys(gebruikt ?? {}).length === 2, "bij het opslaan blijven alleen de antwoorden die het blok gebruikt");
  meld(cache.verzamelVerzoeken(vloerVragen ? [vloerVragen] : []).length === 2 && cache.toetsHashes([f]).length === 2, "de app ziet de verzoeken en de hashes van een @fem-blok");

  // Een raster dat tussen de gevallen verschilt (een andere CalcSheet maakte het ene).
  const scheef = structuredClone(records);
  const hQ = vloerVragen.verzoeken[1].hash;
  scheef[hQ].verzoek.x[1] += 0.01;
  const fs = femVan(metAntwoorden(VLOER, scheef).nodes);
  meld(fs?.status === "fout" && /raster/.test(fs.melding ?? ""), "een ander raster tussen de gevallen: een melding, geen gemengde uitkomst", fs?.melding);
  const versie = femVan(metAntwoorden(VLOER, records, "vragen", { fem: { versie: "2099.1.0" } }).nodes);
  meld(versie?.status === "klaar" && versie.verouderd?.versie === "2099.1.0" && versie.opnieuw, "een nieuwere FEM Studio: de oude uitkomst blijft, met de knop opnieuw rekenen");
}

console.log("\nHet antwoord compact bewaren");
const klein = leesFixture("klein-ruw.json");
meld(!!klein, "scripts/fixtures/fem/klein-ruw.json staat er");
if (klein) {
  const args = femArgumenten(klein.model);
  meld(JSON.stringify(args) === JSON.stringify(klein.argumenten), "het bewaarde verzoek geeft precies de JSON die verzonden is");
  const c = femBewaar(klein.model, klein.ruw);
  const N = klein.model.x.length;
  meld(c.vorm === "fem-plaat/1" && c.uz.length === N, `per knoop de verplaatsing (${N} knopen)`);
  const d = klein.ruw.displacements.find((x) => x.nodeId === 7);
  meld(Math.abs(c.uz[6] - d.uz) <= 1e-6 * Math.abs(d.uz), "de verplaatsing van knoop 7 is die van FEM Studio, op zes cijfers");
  const kapot = structuredClone(klein.ruw);
  kapot.displacements.pop();
  let geworpen = false;
  try {
    femBewaar(klein.model, kapot);
  } catch {
    geworpen = true;
  }
  meld(geworpen, "een antwoord waarin een knoop ontbreekt, wordt niet bewaard");
  meld(JSON.stringify(c).length < JSON.stringify(klein.ruw).length / 3, `compact: ${JSON.stringify(c).length} tekens tegen ${JSON.stringify(klein.ruw).length} van het antwoord`);
}

// ── De tools die een blad mag gebruiken ──────────────────────────────────────
console.log("\nDe tools van FEM Studio");
{
  const namen = leesFixture("tools-2026.44.2.json") ?? [];
  meld(namen.length > 100, `de lijst van tools/list van FEM Studio 2026.44.2 (${namen.length} tools)`);
  const ja = namen.filter(toetsToolToegestaan);
  const nee = namen.filter((t) => !toetsToolToegestaan(t));
  for (const t of ["solve_open_fem_3d", "solve_native_fem", "solve_frame3d", "solve_fem_model", "validate_fem_model", "check_fem_model", "check_plates", "concrete_mn_kappa", "compute_section_properties", "list_steel_grades", "fem_solver_status", "open_fem_3d_staalhal_maken"]) {
    if (!ja.includes(t)) meld(false, `${t} mag`);
  }
  meld(["solve_open_fem_3d", "solve_native_fem", "check_plates"].every((t) => ja.includes(t)), `${ja.length} rekentools mogen, waaronder solve_open_fem_3d en solve_native_fem`);
  const stuurt = nee.filter((t) => !/^(gui_|app_|project_|model3d_)/.test(t));
  meld(nee.every((t) => /^(gui_|app_|project_|model3d_|extensions_|generate_|load_)/.test(t) || ["open_fem_3d_ifc_importeren", "fem_resultaten_ifc_schrijven", "fem_resultaten_ifc_lezen"].includes(t)),
    `${nee.length} uitgesloten: de app sturen, het project, het model in de app en bestanden (${stuurt.join(", ")})`);
  meld(namen.filter((t) => /^(gui_|app_|project_|model3d_)/.test(t)).every((t) => !toetsToolToegestaan(t)), "geen enkele gui_*, app_*, project_* of model3d_*");
  meld(toetsToolToegestaan("solve_iets_nieuws") && !toetsToolToegestaan("gui_iets_nieuws"), "een nieuwe rekentool mag vanzelf, een nieuwe tool van de app niet");
  // Dezelfde uitsluiting in de Rust-kant (fem-brug).
  const rust = readFileSync(new URL("../packages/desktop/src-tauri/fem-brug/src/lib.rs", import.meta.url), "utf8");
  const lijst = (naam) => [...(rust.match(new RegExp(`const ${naam}: \\[&str; \\d+\\] = \\[([^\\]]*)\\]`))?.[1] ?? "").matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const rustV = lijst("UITGESLOTEN_VOORVOEGSELS");
  const rustN = lijst("UITGESLOTEN_NAMEN");
  meld(JSON.stringify(rustV) === JSON.stringify(TOETS_UITGESLOTEN.voorvoegsels) && JSON.stringify(rustN) === JSON.stringify(TOETS_UITGESLOTEN.namen),
    "de Rust-kant sluit precies dezelfde tools uit", `${rustV} / ${rustN}`);
}

// ── Navier ──────────────────────────────────────────────────────────────────
console.log("\nVrij opgelegde vierkante plaat (Navier)");
const navierFix = leesFixture("navier.json");
meld(!!navierFix, "scripts/fixtures/fem/navier.json staat er");
if (navierFix) {
  const { nodes, scope } = metAntwoorden(NAVIER, leesVastgelegdeToetsingen(navierFix.toetsingen) ?? {});
  meld(femVan(nodes)?.status === "klaar", "het blok is klaar");
  // Navier: w = 16q/(π⁶D)·Σ sin·sin/(mn(m²+n²)²)·a⁴, m_x = 16q·a²/π⁴·Σ (m²+νn²)/(mn(m²+n²)²)·sin·sin,
  // m, n oneven; in het midden is sin(mπ/2) = (−1)^((m−1)/2).
  const a = 6, t = 0.15, E = 30e6, nu = 0.2, q = 10;
  const D = (E * t ** 3) / (12 * (1 - nu * nu));
  let w = 0, mx = 0;
  for (let m = 1; m < 400; m += 2) {
    for (let n = 1; n < 400; n += 2) {
      const s = (-1) ** ((m - 1) / 2) * (-1) ** ((n - 1) / 2);
      const noemer = m * n * (m * m + n * n) ** 2;
      w += s / noemer;
      mx += (s * (m * m + nu * n * n)) / noemer;
    }
  }
  w *= (16 * q * a ** 4) / (Math.PI ** 6 * D);
  mx *= (16 * q * a * a) / Math.PI ** 4;
  const wFem = inEenheid(scope.w_m, "mm");
  const mFem = inEenheid(scope.m_m, "kN");
  // De plaat van FEM Studio is een Mindlin-plaat (MITC4) met zachte opleggingen (alleen
  // w vast): dwarskrachtvervorming en de randzone maken hem iets slapper dan Kirchhoff.
  // Met a/t = 40 is dat bij de doorbuiging ongeveer 2 % en bij het moment ongeveer 1 %.
  meld(rel(wFem, w * 1000) < 0.03, `w midden = ${wFem.toFixed(4)} mm, Navier ${(w * 1000).toFixed(4)} mm (${pct(wFem, w * 1000)})`);
  meld(rel(mFem, mx) < 0.02, `m_x midden = ${mFem.toFixed(4)} kNm/m, Navier ${mx.toFixed(4)} kNm/m (${pct(mFem, mx)})`);
  const g = femVan(nodes).gevallen[0];
  meld(rel(g.somR, q * a * a) < 1e-6, `ΣR = ${g.somR.toFixed(3)} kN = q·a² = ${q * a * a} kN`);
}

// ── Tegen plaat_palen ───────────────────────────────────────────────────────
console.log("\nVlakke plaat op palen, tegen plaat_palen (DKT)");
const palenFix = leesFixture("palen.json");
meld(!!palenFix, "scripts/fixtures/fem/palen.json staat er");
if (palenFix) {
  const records = leesVastgelegdeToetsingen(palenFix.toetsingen) ?? {};
  const { nodes, scope } = metAntwoorden(PALEN, records);
  meld(femVan(nodes)?.status === "klaar", "het blok is klaar");
  const dkt = plaatOplossing({ lx: 4, ly: 4, nbx: 3, nby: 3, t: 0.25, E: 30e6, nu: 0.2, k: 150000, dKop: 1, nEl: 16, q: [[10, 10, 10], [10, 10, 10], [10, 10, 10]] });
  const knoop = (x, y) => dkt.knopen[Math.round(y / 0.25) * (dkt.nx + 1) + Math.round(x / 0.25)];
  const pm = scope.palen;
  const R = scope.palen_Q_R.toArray().flat().map((w) => inEenheid(w, "kN"));
  const Rdkt = dkt.palen.map((p) => p.R);
  const paal = (i, j) => j * 4 + i;
  // Twee verschillende plaatmodellen: Kirchhoff met driehoeken (DKT, plaat.ts) en Mindlin
  // met vierhoeken (MITC4, FEM Studio), elk met een eigen middeling naar de knopen. Met
  // een maas van 0,25 m liggen de reacties binnen 0,4 %, de doorbuiging binnen 0,7 % en de
  // momenten binnen 3 %. Met 0,5 m (8 elementen per veld) kwam m_x in het midden van het
  // veld 11 % lager uit dan DKT: MITC4 benadert dat veldmoment op een grof raster van
  // onderen, en schuift bij een fijner raster naar DKT toe.
  const punten = [
    ["R hoekpaal", R[paal(0, 0)], Rdkt[paal(0, 0)], 0.01],
    ["R randpaal", R[paal(1, 0)], Rdkt[paal(1, 0)], 0.01],
    ["R binnenpaal", R[paal(1, 1)], Rdkt[paal(1, 1)], 0.01],
    ["w midden middenveld (mm)", femWaarde(pm, "Q", "w", 6, 6), knoop(6, 6).w * 1000, 0.02],
    ["w binnenpaal (mm)", femWaarde(pm, "Q", "w", 4, 4), knoop(4, 4).w * 1000, 0.02],
    ["m_x midden middenveld", femWaarde(pm, "Q", "mx", 6, 6), knoop(6, 6).mx, 0.05],
    ["m_x kolomstrook veldmidden", femWaarde(pm, "Q", "mx", 6, 4), knoop(6, 4).mx, 0.05],
    ["m_x boven binnenpaal", femWaarde(pm, "Q", "mx", 4, 4), knoop(4, 4).mx, 0.05],
  ];
  for (const [wat, fem, ref, tol] of punten) meld(rel(fem, ref) < tol, `${wat}: FEM Studio ${fem.toFixed(3)}, plaat_palen ${ref.toFixed(3)} (${pct(fem, ref)})`);
  meld(Math.abs(R.reduce((s, r) => s + r, 0) - 1440) < 1e-6, `ΣR = ${R.reduce((s, r) => s + r, 0).toFixed(4)} kN = 10 · 12 · 12`);
}

console.log(fouten === 0 ? "\nHet FEM-model klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
