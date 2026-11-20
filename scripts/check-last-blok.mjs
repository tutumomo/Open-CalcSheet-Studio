/**
 * Controle van het blok `@last` (packages/core/src/lastBlok.ts): een lijnlast of puntlast
 * als som van belastingen maal hun factoren, gescheiden in blijvend (G) en veranderlijk (Q).
 *
 * Toetst:
 *   • lezen: de kop met en zonder naam en soort, regels met G en Q, factoren, een
 *     omschrijving, een `;` binnen haakjes en binnen aanhalingstekens, lege regels en
 *     commentaar, en wat er niet klopt;
 *   • rekenen: een lijnlast en een puntlast met de belastingen van het project
 *     (`EvalOpties.project`), de uitkomsten S, S,G en S,Q (S_G en S_Q bij een symbool
 *     zonder liggend streepje), verder rekenen in het blad, een andere eenheid in een
 *     regel, een waarde uit een ander blad;
 *   • de fouten: een verkeerde dimensie, een onbekende naam, een rekenfout, een ongeldige
 *     kop, een blok zonder `@end`; bij een fout bestaat geen enkele uitkomst;
 *   • de weergave: de kop, de tabel met zijn kolommen, de omschrijving uit de regel of uit
 *     het project, de totalen, Engels, het eenhedenstelsel, `#round`, `#hide` en `#pre`;
 *   • lezen, schrijven en weer lezen geeft hetzelfde;
 *   • een canvas-blad: een eenheid met het blok, en een latere eenheid die ermee rekent;
 *   • de editor, de vertalingen en de documentatie.
 *
 * Handberekeningen. De belastingen van het project:
 *   g_v3 = 7,75 kN/m² (vloer), g_w1 = 5,25 kN/m (wand), q_k1 = 1,75 kN/m² (categorie A).
 *
 *   Lijnlast q_L1 op ligger L1, belastingbreedte 3,6 m:
 *     vloer            7,75 · 3,6       = 27,90 kN/m   G
 *     wand             5,25 · 1         =  5,25 kN/m   G
 *     veranderlijk     1,75 · 3,6       =  6,30 kN/m   Q
 *     eigen gewicht    25 · 0,3 · 0,5   =  3,75 kN/m   G
 *     q_L1,G = 27,90 + 5,25 + 3,75 = 36,90 kN/m;  q_L1,Q = 6,30 kN/m;  q_L1 = 43,20 kN/m
 *     1,2 · 36,90 = 44,28 kN/m;  1,2 · 36,90 + 1,5 · 6,30 = 44,28 + 9,45 = 53,73 kN/m
 *     in klf (1 klf = 4,4482216 kN / 0,3048 m = 14,5939 kN/m): 43,20 / 14,5939 = 2,960 klf
 *
 *   Puntlast F_1 op kolom K1, oppervlak 3,6 · 5,4 = 19,44 m²:
 *     vloer            7,75 · 19,44     = 150,66 kN    G
 *     veranderlijk     1,75 · 3,6 · 5,4 =  34,02 kN    Q
 *     wand             5,25 · 5,4       =  28,35 kN    G
 *     grootste van 2 en 3 kN, twee keer =   6,00 kN    Q
 *     F_1,G = 150,66 + 28,35 = 179,01 kN;  F_1,Q = 34,02 + 6,00 = 40,02 kN;  F_1 = 219,03 kN
 *
 * Draaien:  node scripts/check-last-blok.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as kern from "../packages/core/dist/index.js";
import { schrijfEenheden } from "../packages/desktop/src/store/canvasBlad.ts";
import { rekenEenhedenDoor, rekenUitwerking } from "../packages/desktop/src/components/calc/canvasRekenen.ts";

const { parse, evaluateMetScope, render, rekenUitdrukking, verwijzingenIn, LAST_START_RE, leesLastKop, leesLastBlok, schrijfLastBlok, lastNamen, STELSELS } = kern;

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${ok || !detail ? "" : "  -> " + detail}`);
  if (!ok) fouten++;
}
/** Een deel van de controle dat omvalt, telt als één fout. */
function deel(titel, doe) {
  console.log(`\n${titel}`);
  try {
    doe();
  } catch (e) {
    meld(false, "dit deel van de controle draait", e?.message ?? String(e));
  }
}

const hier = dirname(fileURLToPath(import.meta.url));
const dichtbij = (a, b) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
const gelijk = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const alle = (nodes, uit = []) => {
  for (const n of nodes) {
    uit.push(n);
    if (n.children) alle(n.children, uit);
  }
  return uit;
};
const lastVan = (nodes) => alle(nodes).find((n) => n.type === "last");
const getal = (w, eenheid) => (w && typeof w.toNumber === "function" ? w.toNumber(eenheid) : Number(w));
/** Het blok in de uitwerking, zonder de formules eromheen. */
const blokRuw = (html) => html.match(/<div class="calc-last[^]*?<\/table><\/div>|<div class="calc-last[^]*?<\/div>/)?.[0] ?? "";
/** Het blok zonder de onzichtbare cijfers waarmee de getallen onder elkaar staan. */
const blokHtml = (html) => blokRuw(html).replace(/<span class="vul">[^<]*<\/span>/g, "");

/** De belastingen uit hoofdstuk 5, zoals de app ze vóór elk blad laat rekenen. */
const PROJECT = {
  bron: "g_v3 = 7.75 kN/m^2\ng_w1 = 5.25 kN/m\nq_k1 = 1.75 kN/m^2",
  namen: { g_v3: "1e–3e verdieping", q_k1: "Vloer, categorie A" },
};
const reken = (bron, opties = {}, scope = {}) => evaluateMetScope(parse(bron), {}, scope, { project: PROJECT, ...opties });

const LIJN = `@last q_L1 "Ligger L1, as 2" lijn
  g_v3; 3.6 m
  g_w1; 1

  // de veranderlijke belasting van de vloer
  Q: q_k1; 3.6 m; "vloer, categorie A"
  25 kN/m^3*0.3 m*0.5 m
@end`;
const PUNT = `@last F_1 "Kolom K1" punt
  g_v3; 3.6 m*5.4 m
  Q: q_k1; 3.6 m; 5.4 m
  g_w1; 5.4 m; "wand op as B"
  Q: max(2 kN; 3 kN); 2
@end`;

deel("Lezen: de kop", () => {
  meld(gelijk(leesLastKop('@last q_L1 "Ligger L1, as 2" lijn'), { symbool: "q_L1", naam: "Ligger L1, as 2", soort: "lijn", fouten: [] }), "symbool, naam en soort");
  meld(gelijk(leesLastKop("@last F_1 punt"), { symbool: "F_1", naam: "", soort: "punt", fouten: [] }), "zonder naam: @last F_1 punt");
  meld(gelijk(leesLastKop('@last Gk "Eigen gewicht"'), { symbool: "Gk", naam: "Eigen gewicht", soort: "lijn", fouten: [] }), "zonder soort is het een lijnlast");
  meld(gelijk(leesLastKop("@last q_L1"), { symbool: "q_L1", naam: "", soort: "lijn", fouten: [] }), "alleen het symbool");
  meld(gelijk(leesLastKop('  @Last σ_a,1 "x" PUNT  '), { symbool: "σ_a,1", naam: "x", soort: "punt", fouten: [] }), "hoofdletters, een Griekse letter en een komma in de index");
  meld(LAST_START_RE.test("@last q") && LAST_START_RE.test("@last") && !LAST_START_RE.test("@lastig q") && !LAST_START_RE.test("'@last q"), "LAST_START_RE herkent de kopregel, niet @lastig of een tekstregel");
  const mis = (kop, deel) => leesLastKop(kop).fouten.some((f) => f.startsWith("kop:") && f.includes(deel));
  meld(mis("@last", "het symbool ontbreekt") && mis('@last "Ligger" lijn', "het symbool ontbreekt"), "zonder symbool: een melding");
  meld(leesLastKop("@last punt").symbool === "" && leesLastKop("@last punt").soort === "punt" && mis("@last lijn", "het symbool ontbreekt") && leesLastKop('@last punt "Kolom" punt').symbool === "punt", "@last punt is de soort zonder symbool; met een naam erachter is punt het symbool");
  meld(mis('@last 1q "x"', "geen naam in de rekentaal") && mis("@last q-L1", "geen naam in de rekentaal") && mis("@last Gk,1", "geen naam in de rekentaal"), "een symbool dat geen naam is (1q, q-L1, Gk,1)");
  meld(mis('@last q_L1 "x" vlak', 'niet "vlak"'), "een andere soort dan lijn of punt");
  meld(mis('@last q_L1 "Ligger L1 lijn', "niet afgesloten"), "een naam zonder sluitend aanhalingsteken");
  meld(gelijk(lastNamen("q_L1"), { som: "q_L1", G: "q_L1,G", Q: "q_L1,Q" }) && gelijk(lastNamen("Gk"), { som: "Gk", G: "Gk_G", Q: "Gk_Q" }), "de namen van de uitkomsten: q_L1,G en q_L1,Q, of Gk_G en Gk_Q");
});

deel("Lezen: de regels", () => {
  const b = leesLastBlok(LIJN);
  meld(b.symbool === "q_L1" && b.naam === "Ligger L1, as 2" && b.soort === "lijn" && b.fouten.length === 0, "de kop van het blok", JSON.stringify(b.fouten));
  meld(b.regels.length === 4, "vier regels: lege regels en commentaar tellen niet", String(b.regels.length));
  meld(gelijk(b.regels[0], { soort: "G", bron: "g_v3", factoren: ["3.6 m"] }), "zonder voorvoegsel blijvend: bron en één factor", JSON.stringify(b.regels[0]));
  meld(gelijk(b.regels[2], { soort: "Q", bron: "q_k1", factoren: ["3.6 m"], omschrijving: "vloer, categorie A" }), "Q: met een omschrijving tussen aanhalingstekens", JSON.stringify(b.regels[2]));
  meld(gelijk(b.regels[3], { soort: "G", bron: "25 kN/m^3*0.3 m*0.5 m", factoren: [] }), "een uitdrukking als bron, zonder factor");
  const p = leesLastBlok(PUNT.split("\n"));
  meld(p.soort === "punt" && gelijk(p.regels[1].factoren, ["3.6 m", "5.4 m"]), "de regels van het blok als lijst; twee factoren");
  meld(gelijk(p.regels[3], { soort: "Q", bron: "max(2 kN; 3 kN)", factoren: ["2"] }), "een ; binnen haakjes splitst niet: max(2 kN; 3 kN)", JSON.stringify(p.regels[3]));
  const r = leesLastBlok('@last q lijn\n  G: g_v3; [1; 2]; "breedte; zie tekening"\n  q: q_k1\n@end\ndit telt niet');
  meld(gelijk(r.regels[0], { soort: "G", bron: "g_v3", factoren: ["[1; 2]"], omschrijving: "breedte; zie tekening" }), "G: mag er staan; een ; binnen rechte haken en binnen aanhalingstekens splitst niet", JSON.stringify(r.regels[0]));
  meld(r.regels.length === 2 && r.regels[1].soort === "Q" && r.fouten.length === 0, "q: in kleine letters; wat na @end staat, telt niet", JSON.stringify(r));
  const mis = leesLastBlok('@last q lijn\n  g_v3;; 3 m\n\n  ; "alleen tekst"\n  #if a > 1\n  "tekst"; g_v3\n@end');
  meld(mis.regels.length === 4 && mis.fouten.length === 4, "een regel met een fout blijft in de structuur staan", JSON.stringify(mis.fouten));
  meld(mis.fouten[0].startsWith("regel 1:") && mis.fouten[0].includes("lege factor"), "een lege factor, met het regelnummer", mis.fouten[0]);
  meld(mis.fouten[1].startsWith("regel 2:") && mis.fouten[1].includes("de bron ontbreekt"), "een regel zonder bron; de lege regel ervoor telt niet mee in het nummer", mis.fouten[1]);
  meld(mis.fouten[2] === "regel 3: #if werkt niet in een @last-blok", "#if werkt in dit blok niet", mis.fouten[2]);
  meld(mis.fouten[3].startsWith("regel 4:") && mis.fouten[3].includes("aan het eind"), "een omschrijving die niet aan het eind staat", mis.fouten[3]);
  meld(leesLastBlok("@last q lijn\n  g_v3").fouten.includes("@last-blok zonder @end"), "een blok zonder @end");
  meld(leesLastBlok("q = 2").fouten.length === 1 && leesLastBlok("").regels.length === 0, "tekst die niet met @last begint, is geen blok");
  const node = parse('Cs.Cd = 2\n@last q "L" lijn\n  g_v,3; Cs.Cd; "d\'accord, V_b,0"\n@end').find((n) => n.type === "last");
  meld(gelijk(node.regels[0].expr, ["g_v_3", "Cs_Cd"]) && node.regels[0].bron === "g_v,3" && node.regels[0].omschrijving === "d'accord, V_b,0", "de uitdrukkingen volgen de rekentaal (g_v,3 is g_v_3); de omschrijving blijft letterlijk, ook met een apostrof", JSON.stringify(node.regels[0]));
});

deel("Rekenen: een lijnlast", () => {
  const uit = reken(`${LIJN}\nq_G = q_L1,G*1.2\nq_Ed = 1.2*q_L1,G + 1.5*q_L1,Q\nq_L1,Q`);
  const b = lastVan(uit.nodes);
  meld(b?.status === "klaar" && b.soort === "lijn" && b.eenheid === "kN / m" && b.rijen.length === 4, "het blok is gerekend", b?.melding);
  meld(gelijk(b.rijen.map((r) => r.soort), ["G", "G", "Q", "G"]) && dichtbij(b.rijen[0].waarde, 27.9) && dichtbij(b.rijen[1].waarde, 5.25) && dichtbij(b.rijen[2].waarde, 6.3) && dichtbij(b.rijen[3].waarde, 3.75), "per regel de bijdrage: 27,9, 5,25, 6,3 en 3,75 kN/m", JSON.stringify(b.rijen.map((r) => r.waarde)));
  meld(dichtbij(getal(uit.scope.q_L1_G, "kN/m"), 36.9), `q_L1,G = ${getal(uit.scope.q_L1_G, "kN/m")} kN/m (handberekening 36,9)`);
  meld(dichtbij(getal(uit.scope.q_L1_Q, "kN/m"), 6.3), `q_L1,Q = ${getal(uit.scope.q_L1_Q, "kN/m")} kN/m (handberekening 6,3)`);
  meld(dichtbij(getal(uit.scope.q_L1, "kN/m"), 43.2), `q_L1 = ${getal(uit.scope.q_L1, "kN/m")} kN/m (handberekening 43,2)`);
  meld(String(uit.scope.q_L1) === "43.2 kN / m", "de uitkomst is een grootheid in kN/m", String(uit.scope.q_L1));
  meld(gelijk(b.uitkomsten.G, { naam: "q_L1,G", scope: "q_L1_G", waarde: b.uitkomsten.G.waarde, tekst: "36.9" }) && b.uitkomsten.som.tekst === "43.2" && b.uitkomsten.Q.naam === "q_L1,Q", "de uitkomsten bij het blok: de naam in de rekentaal, in de scope, en het getal", JSON.stringify(b.uitkomsten));
  const na = (naam) => uit.nodes.find((n) => n.name === naam);
  meld(dichtbij(na("q_G")?.waarde, 44.28) && na("q_G").unit === "kN / m", `verder rekenen: q_L1,G*1.2 = ${na("q_G")?.result} (handberekening 44,28 kN/m)`);
  meld(dichtbij(na("q_Ed")?.waarde, 53.73), `1.2*q_L1,G + 1.5*q_L1,Q = ${na("q_Ed")?.result} (handberekening 53,73 kN/m)`);
  meld(na("q_L1_Q")?.type === "var-display" && na("q_L1_Q").result === "6.3 kN / m", "q_L1,Q los op een regel toont zijn waarde");
  const eenheden = reken('@last q "andere eenheden" lijn\n  2 N/mm; 1\n  500 N/m; 2\n  Q: 0.5 kN/m^2; 2000 mm\n@end');
  meld(dichtbij(getal(eenheden.scope.q_G, "kN/m"), 3) && dichtbij(getal(eenheden.scope.q_Q, "kN/m"), 1) && String(eenheden.scope.q) === "4 kN / m", "regels in N/mm, N/m en mm tellen op in kN/m: G = 2 + 1 = 3, Q = 1", `${eenheden.scope.q_G} ${eenheden.scope.q_Q}`);
  const alleenQ = reken("@last q_2 lijn\n  Q: q_k1; 2 m\n@end");
  meld(getal(alleenQ.scope.q_2_G, "kN/m") === 0 && dichtbij(getal(alleenQ.scope.q_2_Q, "kN/m"), 3.5) && dichtbij(getal(alleenQ.scope.q_2, "kN/m"), 3.5), "alleen veranderlijk: het blijvende deel bestaat en is 0");
  const leeg = reken("@last q_3 lijn\n@end\nx = q_3 + q_3,G + q_3,Q");
  meld(lastVan(leeg.nodes).status === "klaar" && getal(leeg.scope.x, "kN/m") === 0, "een blok zonder regels: alle drie de uitkomsten zijn 0 kN/m");
  const min = reken("@last q_4 lijn\n  g_w1; 1\n  -2 kN/m; 1\n@end");
  meld(dichtbij(getal(min.scope.q_4_G, "kN/m"), 3.25), "een negatieve bijdrage telt mee: 5,25 − 2 = 3,25");
});

deel("Rekenen: een puntlast", () => {
  const uit = reken(`${PUNT}\nF_d = 1.2*F_1,G + 1.5*F_1,Q`);
  const b = lastVan(uit.nodes);
  meld(b?.status === "klaar" && b.soort === "punt" && b.eenheid === "kN", "het blok is gerekend", b?.melding);
  meld(dichtbij(b.rijen[0].waarde, 150.66) && dichtbij(b.rijen[1].waarde, 34.02) && dichtbij(b.rijen[2].waarde, 28.35) && dichtbij(b.rijen[3].waarde, 6), "per regel: 150,66, 34,02, 28,35 en 6 kN", JSON.stringify(b.rijen.map((r) => r.waarde)));
  meld(dichtbij(getal(uit.scope.F_1_G, "kN"), 179.01) && dichtbij(getal(uit.scope.F_1_Q, "kN"), 40.02) && dichtbij(getal(uit.scope.F_1, "kN"), 219.03), `F_1,G = ${getal(uit.scope.F_1_G, "kN").toFixed(2)}, F_1,Q = ${getal(uit.scope.F_1_Q, "kN").toFixed(2)}, F_1 = ${getal(uit.scope.F_1, "kN").toFixed(2)} kN (handberekening 179,01, 40,02 en 219,03)`);
  meld(dichtbij(getal(uit.scope.F_d, "kN"), 1.2 * 179.01 + 1.5 * 40.02), "verder rekenen met F_1,G en F_1,Q");
  const kaal = reken('@last Gk "zonder liggend streepje" punt\n  10 kN\n  Q: 4 kN; 0.5\n@end\nx = Gk_G + Gk_Q\ny = Gk');
  meld(getal(kaal.scope.Gk_G, "kN") === 10 && getal(kaal.scope.Gk_Q, "kN") === 2 && getal(kaal.scope.Gk, "kN") === 12, "een symbool zonder liggend streepje: Gk_G = 10, Gk_Q = 2, Gk = 12 kN");
  meld(getal(kaal.scope.x, "kN") === 12 && getal(kaal.scope.y, "kN") === 12 && gelijk(Object.values(lastVan(kaal.nodes).uitkomsten).map((u) => u.naam), ["Gk", "Gk_G", "Gk_Q"]), "en Gk_G + Gk_Q rekent in het blad");
  // `Q: F` is een voorvoegsel met een naam, geen formaataanduiding zoals in `x:F2`.
  const letters = reken("F = 10 kN\nP = 5 kN\n@last R punt\n  Q: F; 2\n  G: P; 1\n@end");
  meld(getal(letters.scope.R_Q, "kN") === 20 && getal(letters.scope.R_G, "kN") === 5, "een bron die F of P heet, blijft heel achter Q: en G:", lastVan(letters.nodes).melding);
  const tak = reken("#if g_w1 > 1 kN/m\n@last T_1 punt\n  g_w1; 2 m\n@end\n#else\n@last T_1 punt\n  g_w1; 4 m\n@end\n#end if\nx = T_1,G");
  meld(dichtbij(getal(tak.scope.x, "kN"), 10.5), "het blok in een #if-tak van het blad: alleen de tak die geldt rekent");
  const komma = reken('@last F_Ed,1 punt\n  10 kN\n@end\nx = 2*F_Ed,1,G');
  meld(getal(komma.scope.F_Ed_1_G, "kN") === 10 && getal(komma.scope.x, "kN") === 20 && lastVan(komma.nodes).uitkomsten.G.naam === "F_Ed,1,G", "een symbool met een komma in de index: F_Ed,1,G");
  // Een waarde uit een ander blad: de app zet hem onder ref__2__R_A in de scope.
  const blad = '@last F_2 "Kolom K2" punt\n  #2.R_A; 2; "uit #9.x"\n@end';
  meld(gelijk(verwijzingenIn(blad), [{ ref: "2", naam: "R_A" }]), "een verwijzing in een regel wordt gevonden, een # in de omschrijving niet", JSON.stringify(verwijzingenIn(blad)));
  const ander = reken(blad, {}, { ref__2__R_A: rekenUitdrukking("12 kN") });
  meld(getal(ander.scope.F_2_G, "kN") === 24, "#2.R_A; 2 rekent met de waarde uit blad 2: 24 kN");
  meld(lastVan(reken(blad).nodes).melding === "regel 1: de naam #2.R_A is niet bekend", "zonder die waarde: de melding noemt #2.R_A", lastVan(reken(blad).nodes).melding);
});

deel("De fouten", () => {
  const dim = reken('@last q_L1 "Ligger L1" lijn\n  g_w1; 1\n\n  // per abuis een oppervlak\n  g_v3; 3.6 m^2\n@end\nna = q_L1,G*1.2');
  const b = lastVan(dim.nodes);
  meld(b.status === "fout" && b.melding === "regel 2: g_v3 × 3.6 m^2 geeft 27.9 kN, verwacht kN/m", "een verkeerde dimensie: de regel, wat eruit kwam en wat verwacht werd", b.melding);
  meld(["q_L1", "q_L1_G", "q_L1_Q"].every((n) => !(n in dim.scope)) && !b.uitkomsten && b.rijen.length === 0, "bij een fout bestaat geen enkele uitkomst");
  meld(dim.nodes.find((n) => n.name === "na")?.result?.startsWith("Error"), "en een regel die ermee rekent, meldt dat de naam ontbreekt");
  const moment = lastVan(reken("@last q lijn\n  g_w1; 2 m; 3 m\n@end").nodes);
  meld(moment.melding === "regel 1: g_w1 × 2 m × 3 m geeft 31.5 kN·m, verwacht kN/m", "kN/m maal m maal m geeft kN·m", moment.melding);
  const punt = lastVan(reken("@last F punt\n  g_v3; 3.6 m\n@end").nodes);
  meld(punt.status === "fout" && punt.melding === "regel 1: g_v3 × 3.6 m geeft 27.9 kN/m, verwacht kN", "een puntlast verwacht een kracht", punt.melding);
  const kaal = lastVan(reken("@last q lijn\n  5; 2\n@end").nodes);
  meld(kaal.melding === "regel 1: 5 × 2 geeft 10 (zonder eenheid), verwacht kN/m", "een getal zonder eenheid", kaal.melding);
  const onbekend = reken("@last q_L1 lijn\n  g_w1; 1\n  g_v9; 3.6 m\n@end");
  meld(lastVan(onbekend.nodes).melding === "regel 2: de naam g_v9 is niet bekend" && !("q_L1" in onbekend.scope), "een onbekende naam, met het regelnummer", lastVan(onbekend.nodes).melding);
  const rekenfout = lastVan(reken("@last q lijn\n  g_w1; 2 +\n@end").nodes);
  meld(rekenfout.status === "fout" && rekenfout.melding.startsWith("regel 1: 2 +:"), "een uitdrukking die niet te rekenen is, met het deel van de regel", rekenfout.melding);
  const oneindig = lastVan(reken("@last q lijn\n  g_w1; 1/0\n@end").nodes);
  meld(oneindig.status === "fout" && oneindig.melding.includes("regel 1") && oneindig.melding.includes("geen eindig getal"), "delen door nul: geen eindig getal", oneindig.melding);
  const meer = lastVan(reken("@last q lijn\n  g_v9\n  5\n@end").nodes);
  meld(meer.melding.includes("regel 1:") && meer.melding.includes("regel 2:"), "twee regels met een fout staan er allebei");

  const kop = reken('@last 1q "x" lijn\n  g_w1; 1\n@end\ny = 2');
  meld(lastVan(kop.nodes).status === "fout" && lastVan(kop.nodes).melding.startsWith("kop:") && getal(kop.scope.y) === 2, "een ongeldige kop: het blok is een fout, het blad rekent verder", lastVan(kop.nodes).melding);
  meld(lastVan(reken('@last q_L1 "x" vlak\n  g_w1; 1\n@end').nodes).melding.includes("lijn of punt"), "een onbekende soort");
  meld(lastVan(reken("@last\n@end").nodes).melding.includes("het symbool ontbreekt"), "@last zonder symbool");
  const open = reken("@last q_L1 lijn\n  g_w1; 1\ny = 2");
  meld(lastVan(open.nodes).status === "fout" && lastVan(open.nodes).melding.includes("@last-blok zonder @end") && !("q_L1" in open.scope), "@last zonder @end", lastVan(open.nodes).melding);
  meld(lastVan(reken("@last q lijn\n  #if 1 > 0\n  g_w1; 1\n  #end if\n@end").nodes).melding.includes("#if werkt niet in een @last-blok"), "#if in het blok is een fout");

  // Een later blok met hetzelfde symbool dat niet rekent, laat de oude uitkomst niet staan.
  const tweede = reken("@last q_L1 lijn\n  g_w1; 1\n@end\neerst = q_L1\n@last q_L1 lijn\n  g_v9; 1\n@end\ndan = q_L1,G");
  meld(dichtbij(getal(tweede.scope.eerst, "kN/m"), 5.25) && !("q_L1" in tweede.scope) && !("q_L1_G" in tweede.scope) && tweede.nodes.find((n) => n.name === "dan").result.startsWith("Error"), "een later blok met hetzelfde symbool en een fout: de oude uitkomsten zijn weg");
  const opnieuw = reken("@last q_L1 lijn\n  g_w1; 1\n@end\n@last q_L1 lijn\n  g_w1; 2\n@end");
  meld(dichtbij(getal(opnieuw.scope.q_L1, "kN/m"), 10.5), "een later blok met hetzelfde symbool dat wel rekent, vervangt het eerste");
});

deel("De weergave", () => {
  const html = render(reken(`'Vooraf\n${LIJN}\nq_d = 1.2*q_L1,G`).nodes);
  const blok = blokHtml(html);
  meld(blok.startsWith('<div class="calc-last" data-last="q_L1">') && !blok.includes("alleen-scherm"), "het blok staat op het blad, ook op papier", blok.slice(0, 80));
  meld(blok.includes('<p class="calc-last-kop"><strong>Ligger L1, as 2</strong> — <var>q<sub>L1</sub></var>, lijnlast</p>'), "de kop: de naam vet, dan het symbool en lijnlast", blok.match(/<p class="calc-last-kop">.*?<\/p>/)?.[0]);
  // De tabel: het symbool in de kop, dan b, l en p_rep, en de bijdrage in de kolom G of Q.
  // Een kolom zet zijn eenheid in de kop als alle cellen dezelfde hebben; anders staat hij bij de cel.
  meld(blok.includes('<thead><tr><th><var>q<sub>L1</sub></var></th><th class="getal">b [m]</th><th class="getal">l [m]</th><th class="getal">p<sub>rep</sub></th><th class="getal">G</th><th class="getal">Q</th></tr></thead>'), "de kolommen: het symbool, b en l in m, p_rep, G en Q", blok.match(/<thead>.*?<\/thead>/)?.[0]);
  const rijen = [...blok.matchAll(/<tr class="(blijvend|veranderlijk)">(.*?)<\/tr>/g)].map((m) => m[2]);
  meld(rijen.length === 4, "een rij per regel", String(rijen.length));
  meld(rijen[0] === '<td>1e–3e verdieping <span class="calc-last-var"><var>g<sub>v3</sub></var></span></td><td class="getal">3.6</td><td class="getal">1</td><td class="getal">7.75 kN/m²</td><td class="getal">27.9</td><td class="getal"></td>', "de naam uit het project als omschrijving, de variabele er klein achter; b, l = 1 bij een lijnlast, p_rep, en de bijdrage in de kolom G", rijen[0]);
  meld(rijen[1] === '<td><var>g<sub>w1</sub></var></td><td class="getal">1</td><td class="getal">1</td><td class="getal">5.25 kN/m</td><td class="getal">5.25</td><td class="getal"></td>', "zonder omschrijving of naam in het project: de variabele; een kaal getal als maat", rijen[1]);
  meld(rijen[2] === '<td>vloer, categorie A <span class="calc-last-var"><var>q<sub>k1</sub></var></span></td><td class="getal">3.6</td><td class="getal">1</td><td class="getal">1.75 kN/m²</td><td class="getal"></td><td class="getal">6.3</td>', "de omschrijving uit de regel gaat voor de naam uit het project; de bijdrage in de kolom Q", rijen[2]);
  meld(rijen[3] === '<td></td><td class="getal"></td><td class="getal">1</td><td class="getal">3.75 kN/m</td><td class="getal">3.75</td><td class="getal"></td>', "een uitdrukking als bron zonder omschrijving: een witte cel, zonder b, en zijn uitkomst als p_rep", rijen[3]);
  meld(!blok.includes('class="totaal"'), "er is geen aparte rij Totaal meer");
  meld(blok.includes('<tfoot><tr class="som"><td colspan="3"></td><td class="getal">Σ</td><td class="getal" title="q_L1,G">36.9</td><td class="getal" title="q_L1,Q">6.3</td><td class="eenheid">[kN/m]</td></tr></tfoot>'), "onder de tabel de som: Σ, G = 36.9, Q = 6.3 en de eenheid", blok.match(/<tr class="som">.*?<\/tr>/)?.[0]);
  meld(html.indexOf("Vooraf") < html.indexOf("calc-last") && html.indexOf("calc-last") < html.lastIndexOf("calc-line"), "het blok staat op zijn plek tussen de regels van het blad");

  const punt = blokHtml(render(reken(PUNT).nodes));
  meld(punt.includes("<strong>Kolom K1</strong> — <var>F<sub>1</sub></var>, puntlast") && punt.includes('<td class="getal">19.44 m²</td><td class="getal"></td><td class="getal">7.75 kN/m²</td><td class="getal">150.7</td>') && punt.includes('<td class="getal">3.6 m</td><td class="getal">5.4</td><td class="getal">1.75 kN/m²</td>') && punt.includes('title="F_1,G">179</td><td class="getal" title="F_1,Q">40.02</td><td class="eenheid">[kN]</td>'), "een puntlast: puntlast in de kop, een oppervlak of twee maten, geen 1 bij l, de som in kN met vier cijfers", punt.match(/<tr class="som">.*?<\/tr>/)?.[0]);
  meld(punt.includes('<td>wand op as B <span class="calc-last-var"><var>g<sub>w1</sub></var></span></td>') && punt.includes('<td></td><td class="getal">2</td><td class="getal"></td><td class="getal">3 kN</td><td class="getal"></td><td class="getal">6</td>'), "een omschrijving bij een kale naam; een functie als bron");
  const ruw = blokRuw(html);
  meld(ruw.includes('<td class="getal">27.9<span class="vul">0</span></td>') && ruw.includes('title="q_L1,G">36.9<span class="vul">0</span></td>') && !ruw.includes('27.90'), "getallen in een kolom staan met het decimaalteken onder elkaar, zonder een nul erbij", ruw);
  const alleenG = blokHtml(render(reken("@last q_8 lijn\n  g_w1; 1\n@end").nodes));
  meld(alleenG.includes('title="q_8,G">5.25</td><td class="getal" title="q_8,Q"></td>'), "zonder veranderlijke regel is de som van Q wit, net als de cellen erboven", alleenG);
  const zonderNaam =blokHtml(render(reken("@last q_5 lijn\n  g_w1; 1\n@end").nodes));
  meld(!zonderNaam.includes("calc-last-kop") && zonderNaam.includes('<thead><tr><th><var>q<sub>5</sub></var></th><th class="getal">b [m]</th><th class="getal">l [m]</th><th class="getal">p<sub>rep</sub> [kN/m]</th>'), "zonder naam geen regel boven de tabel: het symbool staat in de kop; één eenheid in een kolom staat in de kop", zonderNaam.match(/<thead>.*?<\/thead>/)?.[0]);
  const tekens = blokHtml(render(reken('@last q_6 "A & <b>" lijn\n  g_w1; 1; "x < y"\n@end').nodes));
  meld(tekens.includes("<strong>A &amp; &lt;b&gt;</strong>") && tekens.includes("<td>x &lt; y <span"), "tekens in een naam of omschrijving blijven tekst");

  const en = blokHtml(render(reken(LIJN, { taal: "en" }).nodes));
  meld(en.includes(", line load</p>") && en.includes('<th class="getal">b [m]</th>') && en.includes("Σ"), "in het Engels: line load boven de tabel; de kolommen zijn symbolen en blijven gelijk", en.match(/<thead>.*?<\/thead>/)?.[0]);
  // Alleen de tekst in beeld: de klassen van de rijen heten in elke taal blijvend en veranderlijk.
  const enTekst = en.replace(/<[^>]+>/g, " ");
  meld(blokHtml(render(reken(PUNT, { taal: "en-US" }).nodes)).includes(", point load</p>") && !/lijnlast|puntlast|Belasting|Berekening|Totaal|blijvend|veranderlijk/.test(enTekst), "point load; geen Nederlands vast woord in de Engelse tabel", enTekst);
  const foutNl = blokHtml(render(reken("@last q_7 \"Ligger\" lijn\n  g_v9; 1\n@end").nodes));
  meld(foutNl.startsWith('<div class="calc-last calc-last-fout" data-last="q_7">') && foutNl.includes('<p class="calc-last-melding">NIET GEREKEND: regel 1: de naam g_v9 is niet bekend</p>') && !foutNl.includes("<table"), "een fout: NIET GEREKEND met de melding, zonder tabel", foutNl);
  meld(blokHtml(render(reken("@last q_7 lijn\n  g_v9; 1\n@end", { taal: "en" }).nodes)).includes("NOT CALCULATED: "), "in het Engels NOT CALCULATED");

  const us = reken(LIJN, { stelsel: STELSELS.us });
  const usBlok = blokHtml(render(us.nodes));
  meld(lastVan(us.nodes).eenheid === "klf" && usBlok.includes('<th class="getal">b [ft]</th><th class="getal">l [ft]</th>') && usBlok.includes('<td class="getal">11.81</td><td class="getal">1</td><td class="getal">161.9 psf</td>') && Math.abs(parseFloat(lastVan(us.nodes).uitkomsten.som.tekst) - 43.2 / 14.5939) < 0.001 && usBlok.includes('title="q_L1,G">2.528</td><td class="getal" title="q_L1,Q">0.4317</td><td class="eenheid">[klf]</td>'), "in het eenhedenstelsel US: ft in de kop van b en l, psf bij de cel, de som in klf", usBlok.match(/<tr class="som">.*?<\/tr>/)?.[0]);
  meld(String(us.scope.q_L1) === "43.2 kN / m" && dichtbij(lastVan(us.nodes).uitkomsten.som.waarde, 43.2), "het stelsel raakt alleen de weergave: de uitkomst blijft 43,2 kN/m");
  const usFout = lastVan(reken("@last q lijn\n  g_v3; 3.6 m^2\n@end", { stelsel: STELSELS.us }).nodes).melding;
  meld(usFout === "regel 1: g_v3 × 3.6 m^2 geeft 6.272 kip, verwacht klf", "een melding in dat stelsel: wat eruit kwam en wat verwacht werd in dezelfde eenheden (27,9 kN = 6,272 kip)", usFout);
  meld(blokHtml(render(reken(PUNT, { stelsel: STELSELS.us }).nodes)).includes('<td class="eenheid">[kip]</td>') && lastVan(reken(LIJN, { stelsel: STELSELS["si-mm"] }).nodes).eenheid === "kN / m", "een puntlast in kip; in SI blijft het kN/m");
  const rond = blokHtml(render(reken(`#round 1\n${PUNT}`).nodes));
  meld(rond.includes('<td class="getal">150.7</td>') && rond.includes('title="F_1,G">179</td>') && blokHtml(render(reken(`#round 2\n${PUNT}`).nodes)).includes('title="F_1,G">179.01</td>'), "#round geldt ook in de tabel: G = 179.01 kN met twee decimalen");

  const verborgen = reken(`#hide\n${LIJN}\n#show\nx = q_L1`);
  meld(lastVan(verborgen.nodes)?.verborgen === true && !render(verborgen.nodes).includes("calc-last") && dichtbij(getal(verborgen.scope.x, "kN/m"), 43.2), "achter #hide: niet op het blad, de uitkomsten gelden wel");
  const scherm = render(reken(`#pre\n${LIJN}\n#post\nx = q_L1`).nodes);
  meld(/<div class="calc-last alleen-scherm" data-last="q_L1">/.test(scherm) && !/<div class="calc-line[^"]* alleen-scherm/.test(scherm), "achter #pre: alleen op het scherm, en wat erna komt niet");
  meld(blokHtml(render(reken(LIJN).nodes, { namen: { g_v3: "g_floor", q_L1_G: "q_L1_perm" } })).includes("<var>g<sub>floor</sub></var>") , "de weergavenamen van het blad gelden ook in de tabel");
  meld(kern.defaultStyles.includes(".calc-last-tabel") && kern.defaultStyles.includes(".calc-last-melding"), "de opmaak staat bij de andere blokken");
  const print = readFileSync(join(hier, "..", "packages/desktop/src/components/calc/PrintDocument.css"), "utf8");
  meld(/\.print-opmaak \.print-blad \.calc-last \{/.test(print), "en de afdruk zet het blok in het korps van de tekst");
});

deel("Lezen, schrijven en weer lezen", () => {
  const tekst = '@last q_L1 "Ligger L1, as 2" lijn\n  g_v3; 3.6 m\n  g_w1; 1\n  Q: q_k1; 3.6 m; "vloer, categorie A"\n  25 kN/m^3*0.3 m*0.5 m\n@end';
  meld(schrijfLastBlok(leesLastBlok(LIJN)) === tekst, "het blok geschreven: de kop, twee spaties inspringen, @end; lege regels en commentaar vervallen", schrijfLastBlok(leesLastBlok(LIJN)));
  const rond = (bron) => {
    const een = leesLastBlok(bron);
    const twee = leesLastBlok(schrijfLastBlok(een));
    return gelijk(een, twee);
  };
  meld(rond(LIJN) && rond(PUNT), "lezen → schrijven → lezen geeft hetzelfde, voor de lijnlast en de puntlast");
  meld(rond("@last Gk\n@end") && schrijfLastBlok(leesLastBlok("@last Gk\n@end")) === "@last Gk lijn\n@end", "een blok zonder naam en regels; de soort staat er altijd");
  meld(rond('@last F_1 punt\n  G: g_v3; [1; 2]; "a; b"\n  q: max(1 kN; 2 kN)\n  g_w1; 5.4 m; ""\n@end'), "met G:, q:, een ; binnen haken en aanhalingstekens, en een lege omschrijving");
  meld(rond('@last q lijn\n  g_v3;; 3 m\n  ; "alleen tekst"\n  #if a > 1\n  Q:\n  ""\n@end'), "ook een blok met fouten in de regels komt gelijk terug");
  meld(rond("@last punt\n  g_w1; 5.4 m\n@end") && rond('@last "Kolom" punt\n@end') && rond("@last\n@end") && schrijfLastBlok({ symbool: "", naam: "", soort: "punt", regels: [] }) === "@last punt\n@end", "een blok zonder symbool houdt zijn soort en krijgt er geen symbool bij");
  meld(schrijfLastBlok({ symbool: " q L1 ", naam: "", soort: "lijn", regels: [] }) === "@last qL1 lijn\n@end", "een spatie in het symbool vervalt bij het schrijven");
  // Een structuur zoals een formulier hem maakt.
  const vorm = {
    symbool: "q_L2", naam: 'Ligger "L2"', soort: "lijn",
    regels: [
      { soort: "G", bron: "g_v3", factoren: ["2.4 m"] },
      { soort: "Q", bron: "q_k1", factoren: ["2.4 m", "0.5"], omschrijving: "halve\nbelasting" },
      { soort: "G", bron: "Q: 3 kN/m", factoren: [] },
    ],
  };
  const geschreven = schrijfLastBlok(vorm);
  meld(geschreven === '@last q_L2 "Ligger \'L2\'" lijn\n  g_v3; 2.4 m\n  Q: q_k1; 2.4 m; 0.5; "halve belasting"\n  G: Q: 3 kN/m\n@end', "een structuur uit een formulier: aanhalingstekens en een regeleinde in een tekst passen", geschreven);
  const terug = leesLastBlok(geschreven);
  meld(terug.fouten.length === 0 && terug.regels[2].soort === "G" && terug.regels[2].bron === "Q: 3 kN/m" && gelijk(terug.regels[1], { soort: "Q", bron: "q_k1", factoren: ["2.4 m", "0.5"], omschrijving: "halve belasting" }), "en leest terug zoals hij bedoeld is", JSON.stringify(terug));
  const uit = reken(schrijfLastBlok({ ...vorm, regels: vorm.regels.slice(0, 2) }));
  meld(dichtbij(getal(uit.scope.q_L2_G, "kN/m"), 18.6) && dichtbij(getal(uit.scope.q_L2_Q, "kN/m"), 2.1), "het geschreven blok rekent: G = 7,75 · 2,4 = 18,6 en Q = 1,75 · 2,4 · 0,5 = 2,1 kN/m");
});

deel("Een canvas-blad", () => {
  const bron = schrijfEenheden([
    { id: "last", x: 10, y: 10, tekst: LIJN },
    { id: "som", x: 10, y: 80, tekst: "q_d = q_L1,G*1.2" },
    { id: "kolom", x: 110, y: 80, tekst: `${PUNT}\nF_d = 1.2*F_1,G + 1.5*F_1,Q` },
  ]);
  const uit = rekenEenhedenDoor(bron, {}, {}, {}, { project: PROJECT });
  const perId = Object.fromEntries(uit.map((u) => [u.eenheid.id, u.nodes]));
  const blok = perId.last?.find((n) => n.type === "last");
  meld(perId.last?.length === 1 && blok?.status === "klaar" && blok.uitkomsten.som.tekst === "43.2", "een eenheid die uit een @last-blok bestaat, geeft een uitkomst", blok?.melding);
  const qd = perId.som?.find((n) => n.name === "q_d");
  meld(dichtbij(qd?.waarde, 44.28), `een latere eenheid rekent met q_L1,G: q_d = ${qd?.result} (handberekening 44,28 kN/m)`);
  const Fd = perId.kolom?.find((n) => n.name === "F_d");
  meld(perId.kolom?.[0]?.type === "last" && dichtbij(Fd?.waarde, 1.2 * 179.01 + 1.5 * 40.02), "een blok en een formule in dezelfde eenheid");
  const beeld = rekenUitwerking(bron, {}, {}, {}, undefined, { project: PROJECT });
  meld(beeld.eenheden?.find((e) => e.id === "last")?.html.includes('<table class="calc-last-tabel">') && beeld.eenheden.find((e) => e.id === "som").html.includes("calc-line"), "de uitwerking per eenheid: de tabel bij zijn eenheid");
  const stuk = rekenEenhedenDoor(schrijfEenheden([
    { id: "open", x: 10, y: 10, tekst: "@last q_L1 lijn\n  g_w1; 1" },
    { id: "na", x: 10, y: 60, tekst: "y = 2" },
  ]), {}, {}, {}, { project: PROJECT });
  meld(stuk[0].nodes[0]?.status === "fout" && stuk[1].nodes.find((n) => n.name === "y")?.waarde === 2, "een blok zonder @end blijft bij zijn eenheid: de volgende rekent gewoon");
});

// De editor, de vertalingen en de documentatie: het blok vouwt in, staat in de aanvullijst en heeft zijn tekst in elke taal.
deel("De editor en de naslag", () => {
  const taal = readFileSync(join(hier, "..", "packages/desktop/src/components/calc/ifcCalcLanguage.ts"), "utf8");
  meld(/open: \/\^\\s\*@last\\b\//.test(taal) && /label: "@last"[^}]*sleutel: "lastBlok"/.test(taal), "@last vouwt in en staat in de aanvullijst");
  meld(/@\(svg\|3d\|fem\|last\|end/.test(taal), "@last krijgt de kleur van een blok");
  const fragment = taal.match(/label: "@last"[^}]*apply: ("(?:[^"\\]|\\.)*")/)?.[1];
  const voorbeeld = fragment ? JSON.parse(fragment) : "";
  const uit = voorbeeld ? evaluateMetScope(parse(voorbeeld), {}, {}) : null;
  meld(!!uit && lastVan(uit.nodes)?.status === "klaar" && dichtbij(getal(uit.scope.q_L1, "kN/m"), 4.5 * 3.6 + 1.75 * 3.6), "het fragment uit de aanvullijst rekent zonder project: 4,5 · 3,6 + 1,75 · 3,6 = 22,5 kN/m", lastVan(uit?.nodes ?? [])?.melding);
  for (const t of ["en", "nl"]) {
    const j = JSON.parse(readFileSync(join(hier, "..", `packages/desktop/src/i18n/locales/${t}/rekentaal.json`), "utf8"));
    meld(typeof j.editor?.lastBlok === "string" && typeof j.editor?.lastUitkomst === "string", `de omschrijving van het blok in ${t}/rekentaal.json`);
  }
  const doc = readFileSync(join(hier, "..", "docs/rekentaal.md"), "utf8");
  meld(doc.includes("## Een lijnlast of puntlast uit belastingen: `@last`") && doc.includes("q_L1,G"), "het blok staat in docs/rekentaal.md");
});

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
