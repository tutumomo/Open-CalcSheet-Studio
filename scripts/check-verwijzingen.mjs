/**
 * Waarden uit een ander blad: `#1.R_paal` in een formule of een invoerveld.
 *
 * Handberekening:
 *   blad 1: q_Ed = 1,35·5,5 + 1,5·20 = 37,425 kN/m², A = 3,6 · 3,6 = 12,96 m²,
 *           R_paal = 37,425 · 12,96 = 485,03 kN
 *   blad 2: V = 1,1 · #1.R_paal = 533,53 kN; veld F = #1.R_paal → 485,03 kN;
 *           veld G in m met #1.R_paal → fout (eenheid past niet)
 *   blad 3: #2.V / 2 = 266,77 kN (via blad 2 naar blad 1)
 *   blad 4 en 5 verwijzen naar elkaar: geen waarde, een melding
 *   een @toets-veld met #1.h_k (4 m): hetzelfde verzoek en dezelfde hash als 4000 mm
 *
 * Draaien:  node scripts/check-verwijzingen.mjs   (vereist een gebouwde core)
 */
import { parse, evaluate, evaluateMetScope, render, verwijzingenIn, vervangVerwijzingen, leesVerwijzing } from "../packages/core/dist/index.js";
import { scopeMetVerwijzingen, verwezenBladen } from "../packages/desktop/src/rekenen/verwijzingen.ts";
import { metBladRefs } from "../packages/desktop/src/store/bladRefs.ts";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};
const dichtbij = (a, b, tol = 0.01) => Math.abs(a - b) <= tol;
const kN = (v) => (v && typeof v.toNumber === "function" ? v.toNumber("kN") : NaN);

console.log("Lezen van verwijzingen");
meld(JSON.stringify(verwijzingenIn("a = #1.R_paal + #vloer.V_b,0\nb = #1.R_paal", { F: "#2.x" }))
  === JSON.stringify([{ ref: "1", naam: "R_paal" }, { ref: "vloer", naam: "V_b,0" }, { ref: "2", naam: "x" }]),
  "verwijzingenIn: rekentekst en invoer, elke verwijzing één keer");
meld(vervangVerwijzingen('k = "#b91c1c"') === 'k = "#b91c1c"', "een kleur tussen aanhalingstekens blijft staan");
meld(vervangVerwijzingen("a = #1.V_b,0*2") === "a = ref__1__V_b_0*2", "#1.V_b,0 wordt ref__1__V_b_0");
meld(leesVerwijzing(" #3.M_Ed ")?.ref === "3" && leesVerwijzing("12 kN") === null, "leesVerwijzing: alleen een hele verwijzing");
meld(verwijzingenIn("'Typ #1.R_paal in het veld V_Ed.\n# Kop met #2.x\nR = 5 kN', zie #3.y'").length === 0,
  "een verwijzing in uitleg, een kop of commentaar telt niet");

console.log("\nKenmerken van bladen");
const refs = metBladRefs([{ ref: "1" }, {}, { ref: "7" }, {}]).map((e) => e.ref);
meld(JSON.stringify(refs) === JSON.stringify(["1", "8", "7", "9"]), "een nieuw blad krijgt één meer dan het hoogste nummer", JSON.stringify(refs));
const zelfde = [{ ref: "1" }, { ref: "2" }];
meld(metBladRefs(zelfde) === zelfde, "met alle kenmerken blijft de lijst dezelfde");

console.log("\nDoorrekenen met verwijzingen");
const bladen = [
  { ref: "1", source: "q_Ed = 1.35*5.5 kN/m^2 + 1.5*20 kN/m^2\nA = 3.6 m*3.6 m\nR_paal = q_Ed*A to kN", waarden: {} },
  { ref: "2", source: "V = 1.1*#1.R_paal to kN\nF = ?{100}*(kN)\nG = ?{2}*(m)", waarden: { F: "#1.R_paal", G: "#1.R_paal" } },
  { ref: "3", source: "W = #2.V/2", waarden: {} },
  { ref: "4", source: "a = #5.b + 1", waarden: {} },
  { ref: "5", source: "b = #4.a + 1", waarden: {} },
];
const opties = {};
const reken = (blad) => {
  const scope = scopeMetVerwijzingen(blad.source, blad.waarden, {}, verwezenBladen(blad.source, blad.waarden, bladen), opties, {});
  return evaluateMetScope(parse(blad.source, opties), blad.waarden, scope, {});
};
const b2 = reken(bladen[1]);
meld(dichtbij(kN(b2.scope.V), 533.53), "V = 1,1 · #1.R_paal = 533,53 kN", String(b2.scope.V));
meld(dichtbij(kN(b2.scope.F), 485.03), "invoerveld F = #1.R_paal = 485,03 kN", String(b2.scope.F));
const tekst2 = b2.nodes.filter((n) => n.type === "text").map((n) => n.text).join(" ");
meld(/#1\.R_paal .*past niet bij de eenheid m/.test(tekst2), "veld G in m: melding dat de eenheid niet past", tekst2);
meld(render(b2.nodes).includes("\\#") || /#1\.R_paal|\\#\\text\{1\.\}/.test(render(b2.nodes)), "de formule toont #1.R_paal");
const b3 = reken(bladen[2]);
meld(dichtbij(kN(b3.scope.W), 266.77), "via via: #2.V/2 = 266,77 kN", String(b3.scope.W));
meld(verwezenBladen(bladen[2].source, {}, bladen).map((b) => b.ref).join(",") === "2,1", "verwezenBladen: blad 3 heeft blad 2 en blad 1 nodig");
const b4 = reken(bladen[3]);
const fout4 = b4.nodes.find((n) => n.name === "a")?.result ?? "";
meld(String(fout4).startsWith("Error"), "een kring rekent niet rond: blad 4 geeft een fout", String(fout4));
const los = evaluate(parse("H = ?{5}*(kN)"), { H: "#9.x" }, {});
meld(los.some((n) => n.type === "text" && /#9\.x niet gevonden/.test(n.text)), "onbekend blad: melding onder het veld");

console.log("\nEen verwijzing in een @toets-blok");
{
  const toets = (veld) => ["@toets kolom = check_steel_beam", '  profile_name = "HEA200"', `  length_m = ${veld}`, "@end", "UC = kolom.uc_max"].join("\n");
  const tb = [{ ref: "1", source: "h_k = 4 m", waarden: {} }, { ref: "2", source: toets("#1.h_k"), waarden: {} }];
  const sc = scopeMetVerwijzingen(tb[1].source, {}, {}, verwezenBladen(tb[1].source, {}, tb), {}, {});
  const metRef = evaluate(parse(tb[1].source), {}, sc, { toetsModus: "vragen" }).find((n) => n.type === "toets");
  const direct = evaluate(parse(toets("4000 mm")), {}, {}, { toetsModus: "vragen" }).find((n) => n.type === "toets");
  meld(metRef?.verzoek?.argumenten.length_m === 4 && metRef.hash === direct?.hash, "length_m = #1.h_k: het verzoek met 4, en dezelfde hash als 4000 mm", JSON.stringify(metRef?.verzoek));
  const antwoord = { ok: true, uitkomst: { beam_id: 1, uc_max: 0.42, status: "Ok", checks: [], governing_check_id: "x" } };
  const klaar = evaluate(parse(tb[1].source), {}, sc, { toetsingen: { [metRef?.hash]: antwoord } });
  meld(klaar.find((n) => n.type === "toets")?.status === "klaar" && dichtbij(Number(klaar.find((n) => n.name === "UC")?.waarde), 0.42, 1e-9), "met het antwoord rekent het blad verder met kolom.uc_max");
  const zonder = evaluate(parse(tb[1].source), {}, {}, { toetsModus: "vragen" }).find((n) => n.type === "toets");
  meld(zonder?.status === "fout" && !zonder.verzoek, "zonder de verwijzing op te lossen: een fout en geen verzoek (vóór het afdrukken lost femToetsing.ts hem dus op)");
}

console.log(fouten === 0 ? "\nAlle verwijzingen kloppen." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
