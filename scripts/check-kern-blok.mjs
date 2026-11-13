/**
 * Controle van het blok `@kern` (packages/core/src/kernBlok.ts): een rekentool van Open
 * FEM Studio met geneste invoer, waarvan de uitkomst als getallen in het blad komt.
 *
 * Toetst, zonder FEM Studio (de antwoorden van de echte server staan in
 * scripts/fixtures/kern/antwoorden.json, opnieuw te maken met
 * `node scripts/proef-kern-blok.mjs --bewaar`):
 *   • lezen: naam, tool, paden met punten en een index, `per`, #for en #if, een regel
 *     zonder `=`, een blok zonder `@end`, een tool die niet mag;
 *   • omrekenen naar het schema: de eenheid uit de naam van het veld (thicknessMm,
 *     fcdMpa, length_m), een verhouding als getal, een grootheid in een veld zonder eenheid;
 *   • de hash: dezelfde bij een andere eenheid, een andere bij een andere waarde;
 *   • rekenen: vragen (een verzoek met geneste argumenten), lezen (niet gerekend en geen
 *     enkele uitkomst), met antwoord de uitkomsten als namen, een fout van FEM Studio,
 *     een fout in een veld (geen verzoek), #hide, een #if-tak die niet geldt;
 *   • een reeks (`per`): de aanroepen in één verzoek, een overgeslagen aanroep, de
 *     uitkomsten als vectoren, een antwoord dat niet bij de reeks past;
 *   • een lijst van objecten in de invoer (#for met een index) en in het antwoord;
 *   • de weergave: de kop met de versie, niet gerekend, de toelichting alleen op het
 *     scherm, Engels, en nergens een oordeel;
 *   • herkomst en opnieuw rekenen, het vastleggen bij een blad en het aanroepen zelf;
 *   • de uitkomsten van FEM Studio tegen een handberekening.
 *
 * Handberekeningen (de plaat van de fixture: h = 250 mm, de wapening 42 mm van de
 * onderkant en 40 mm van de bovenkant, f_yd = 500/1,15 = 434,78 N/mm²):
 *
 *   Drielagenmodel, zuiver m_x = 50 kNm/m. De buitenlagen zijn twee keer de afstand van
 *   de wapening tot het vlak dik (84 en 80 mm), dus de arm tussen hun middens is
 *   z = 250 − 42 − 40 = 168 mm. De trekkracht onder n_x = m/z = 50/0,168 = 297,62 kN/m,
 *   A_sx = n_x/f_yd = 297 619/434,78 = 684,5 mm²/m; tegen Ø12-150 (754 mm²/m) UC = 0,908.
 *   Ter vergelijking z = 0,9·d met d = 250 − 30 − 12 − 6 = 202 mm: z = 181,8 mm en
 *   A_s = 50·10⁶/(181,8·434,78) = 632,6 mm²/m; het drielagenmodel vraagt 8,2 % meer.
 *
 *   Met een wringend moment, m_x = 30, m_y = 20, m_xy = 10 kNm/m. Onder: n_x = 178,57,
 *   n_y = 119,05, n_xy = 59,52 kN/m; beide richtingen op trek, dus (bijlage F, F.2 t/m
 *   F.4) A_sx = (n_x + |n_xy|)/f_yd = 238,10·10³/434,78 = 547,6 mm²/m en
 *   A_sy = (119,05 + 59,52)·10³/434,78 = 410,7 mm²/m. Zonder m_xy: 410,7 en 273,8.
 *
 *   Steunpunt, m_x = m_y = −40, m_xy = 15 kNm/m. Boven: n_x = n_y = 238,10, |n_xy| = 89,29
 *   kN/m, A_s = (238,10 + 89,29)·10³/434,78 = 753,0 mm²/m per richting; zonder m_xy 547,6.
 *
 *   Scheurwijdte (NEN-EN 1992-1-1 7.3.4), Ø12-150 (754 mm²/m), c = 30 mm, d = 214 mm,
 *   x = 40 mm, σ_s = 300 N/mm², f_ct,eff = 2,9 N/mm², E_cm = 33 000 N/mm², k_t = 0,4:
 *   h_c,ef = min(2,5·(250 − 214); (250 − 40)/3; 250/2) = min(90; 70; 125) = 70 mm,
 *   ρ_p,eff = 754/(1000·70) = 0,010771, α_e = 200 000/33 000 = 6,0606,
 *   ε_sm − ε_cm = [300 − 0,4·(2,9/0,010771)·(1 + 6,0606·0,010771)]/200 000
 *               = (300 − 114,72)/200 000 = 0,9264·10⁻³ (≥ 0,6·300/200 000 = 0,9·10⁻³),
 *   s_r,max = 3,4·30 + 0,8·0,5·0,425·12/0,010771 = 102 + 189,4 = 291,4 mm (150 ≤ 5·(30 + 6)
 *   = 180 mm; de bovengrens van de nationale bijlage (50 − 0,8·30)·12 = 312 mm geldt niet),
 *   w_k = 291,4·0,9264·10⁻³ = 0,270 mm; tegen 0,30 mm UC = 0,90.
 *
 * Draaien:  node scripts/check-kern-blok.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as kern from "../packages/core/dist/index.js";
import * as cache from "../packages/desktop/src/rekenen/toetsCache.ts";
import { BATCH, DRIE, GEWEIGERD, REEKS, SCHEUR } from "./fixtures/kern/bladen.mjs";

const { parse, evaluateMetScope, render, rekenUitdrukking, toetsHash, alsAntwoord, leesVastgelegdeToetsingen, eenheidVanVeld } = kern;

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${ok || !detail ? "" : "  -> " + detail}`);
  if (!ok) fouten++;
}
/** Een deel van de controle dat op een blok steunt dat er (nog) niet is, telt als één fout. */
async function deel(titel, doe) {
  console.log(`\n${titel}`);
  try {
    await doe();
  } catch (e) {
    meld(false, "dit deel van de controle draait", e?.message ?? String(e));
  }
}

const hier = dirname(fileURLToPath(import.meta.url));
const fixturePad = join(hier, "fixtures", "kern", "antwoorden.json");
const fixture = existsSync(fixturePad) ? JSON.parse(readFileSync(fixturePad, "utf8")) : { versie: "", toetsingen: {}, geweigerd: "" };
const vast = leesVastgelegdeToetsingen(fixture.toetsingen) ?? {};
const antwoorden = Object.fromEntries(Object.entries(vast).map(([h, v]) => [h, alsAntwoord(v)]));

const dichtbij = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(1, Math.abs(b));
const alle = (nodes, uit = []) => {
  for (const n of nodes) {
    uit.push(n);
    if (n.children) alle(n.children, uit);
  }
  return uit;
};
const kernVan = (nodes) => alle(nodes).find((n) => n.type === "kern");
const reken = (bron, opties = {}) => evaluateMetScope(parse(bron), {}, {}, opties);
const getal = (w, eenheid) => (w && typeof w.toNumber === "function" ? w.toNumber(eenheid) : Number(w));

await deel("Lezen", () => {
  const node = parse("@kern drie = solve_native_fem\n  inputs.kind = \"threeLayer\"\n  inputs.input.samples[k + 1].forces.mx = 5\n  dit is geen veld\n@end").find((n) => n.type === "kern");
  meld(node?.naam === "drie" && node.tool === "solve_native_fem", "naam en tool");
  const velden = node.regels.filter((r) => r.soort === "veld");
  meld(velden.length === 2 && velden[0].pad.map((d) => d.naam).join(".") === "inputs.kind", "een veld met zijn pad en uitdrukking", JSON.stringify(velden));
  meld(velden[1].pad[2].naam === "samples" && velden[1].pad[2].index === "k + 1" && velden[1].pad[4].naam === "mx", "een index in het pad: samples[k + 1]", JSON.stringify(velden[1]?.pad));
  meld(node.fouten.some((f) => f.includes("regel 3") && f.includes("pad = uitdrukking")), "een regel zonder = is een melding met het regelnummer", JSON.stringify(node.fouten));
  const open = parse("@kern a = solve_native_fem\n  x = 4").find((n) => n.type === "kern");
  meld(open.fouten.some((f) => f.includes("@end")), "een blok zonder @end");
  const gui = parse("@kern a = gui_quit\n  x = 1\n@end").find((n) => n.type === "kern");
  meld(gui.fouten.some((f) => f.includes("niet toegestaan")), "een tool die niet mag");
  const per = parse("@kern a = solve_native_fem\n  per k = 1 : n\n  #for i = 1 : 2\n  x[i] = k\n  #loop\n  #if k > 1\n  y = 1\n  #else\n  y = 2\n  #end if\n@end").find((n) => n.type === "kern");
  meld(per.per?.teller === "k" && per.per.van === "1" && per.per.tot === "n" && !per.fouten.length, "per k = 1 : n", JSON.stringify(per.fouten));
  meld(per.regels[0]?.soort === "for" && per.regels[0].body.length === 1 && per.regels[1]?.soort === "if" && per.regels[1].anders.length === 1, "#for … #loop en #if … #else … #end if");
  const dubbel = parse("@kern a = solve_native_fem\n  per k = 1 : 2\n  per j = 1 : 2\n  #for i = 1 : 2\n  x = 1\n@end").find((n) => n.type === "kern");
  meld(dubbel.fouten.some((f) => f.includes("per staat er al")) && dubbel.fouten.some((f) => f.includes("#for zonder #loop")), "twee keer per, en een #for zonder #loop", JSON.stringify(dubbel.fouten));
  // De regels van het blok blijven zoals ze zijn: een pad met punten wordt geen naam met liggende streepjes.
  const naam = parse("Cs.Cd = 2\n@kern k = solve_native_fem\n  inputs.kind = Cs.Cd\n@end").find((n) => n.type === "kern");
  meld(naam.regels[0].pad.length === 2 && naam.regels[0].expr === "Cs_Cd", "het pad houdt zijn punten, de uitdrukking volgt de rekentaal (Cs.Cd is Cs_Cd)", JSON.stringify(naam.regels[0]));
});

await deel("Omrekenen naar het schema", () => {
  const r = (e) => rekenUitdrukking(e, {});
  const s = kern.naarKernSchema;
  meld(eenheidVanVeld("thicknessMm") === "mm" && eenheidVanVeld("fcdMpa") === "MPa" && eenheidVanVeld("sigmaSMpa") === "MPa" && eenheidVanVeld("bondedReinforcementAreaMm2") === "mm^2", "de eenheid uit een naam in camelCase: thicknessMm, fcdMpa, sigmaSMpa, …Mm2");
  meld(eenheidVanVeld("vRdcKnPerM") === "kN/m" && eenheidVanVeld("providedShearMm2PerM2") === "mm^2/m^2" && eenheidVanVeld("pressureKnM2") === "kN/m^2" && eenheidVanVeld("positionM") === "m", "vRdcKnPerM, providedShearMm2PerM2, pressureKnM2, positionM");
  meld(eenheidVanVeld("length_m") === "m" && eenheidVanVeld("a_net_mm2") === "mm^2" && eenheidVanVeld("mx") === null && eenheidVanVeld("asX") === null && eenheidVanVeld("M") === null && eenheidVanVeld("kT") === null, "de namen van @toets blijven gelden; mx, asX en kT hebben geen eenheid");
  meld(s("thicknessMm", r("0.25 m")) === 250, "thicknessMm = 0,25 m wordt 250");
  meld(dichtbij(s("eCmMpa", r("33 GPa")), 33000), "eCmMpa = 33 GPa wordt 33000");
  meld(s("mx", r("50 kN / (1 kN)")) === 50, "een verhouding (50 kN gedeeld door 1 kN) is een getal");
  meld(JSON.stringify(s("positionM", r("[500 mm, 2 m]"))) === "[0.5,2]", "een lijst: elk getal in de eenheid van het veld");
  meld(JSON.stringify(s("forces", { mx: 5, kind: "a", ok: true })) === JSON.stringify({ mx: 5, kind: "a", ok: true }), "een object met getallen, tekst en ja/nee");
  let fout = "";
  try { s("mx", r("50 kN"), "inputs.input.forces.mx"); } catch (e) { fout = e.message; }
  meld(fout.includes("inputs.input.forces.mx") && fout.includes("geen eenheid in zijn naam"), "een grootheid in een veld zonder eenheid is een fout met het pad", fout);
  fout = "";
  try { s("thicknessMm", r("5 kN")); } catch (e) { fout = e.message; }
  meld(fout.includes("past niet in mm"), "een eenheid die niet past is een fout", fout);
});

await deel("Rekenen: één aanroep", () => {
  const vragen = reken(DRIE, { toetsModus: "vragen" });
  const k = kernVan(vragen.nodes);
  meld(k?.status === "wacht" && k.verzoek?.tool === "solve_native_fem" && /^t[0-9a-f]{16}$/.test(k.hash ?? ""), "modus vragen zonder antwoord: wacht, met een verzoek en een hash", JSON.stringify(k?.melding));
  const a = k.verzoek.argumenten.inputs;
  meld(a.kind === "threeLayer" && a.input.thicknessMm === 250 && a.input.topSkinMm === 80 && a.input.bottomSkinMm === 84 && dichtbij(a.input.fydMpa, 500 / 1.15) && a.input.fcdMpa === 20, "geneste argumenten, omgerekend: 250 mm als 250, f_yd in MPa", JSON.stringify(a));
  meld(a.input.forces.mx === 50 && a.input.forces.vy === 0 && a.input.bottomReinforcement.asX === 754 && a.input.topReinforcement.asY === 524 && a.input.compressionModel === "ec2AnnexF", "een object als waarde, en velden met een pad naast elkaar");
  meld(vragen.scope.drie_result_leverArmMm === undefined && vragen.nodes.find((n) => n.name === "A_sx")?.result?.startsWith("Error"), "zonder antwoord bestaat geen enkele uitkomst");
  meld(toetsHash("solve_native_fem", {}) !== k.hash && kernVan(reken(DRIE.replace("h = 250 mm", "h = 0.25 m"), { toetsModus: "vragen" }).nodes).hash === k.hash, "h = 0,25 m in plaats van 250 mm: dezelfde hash");
  meld(kernVan(reken(DRIE.replace("m_x = 50 kN", "m_x = 51 kN"), { toetsModus: "vragen" }).nodes).hash !== k.hash, "een andere waarde, een andere hash");

  const lezen = reken(DRIE);
  const l = kernVan(lezen.nodes);
  meld(l.status === "niet-gerekend" && !l.verzoek && l.hash === k.hash, "modus lezen zonder antwoord: niet gerekend, geen verzoek");
  meld(Object.keys(lezen.scope).every((n) => !n.startsWith("drie_")), "en geen uitkomst in de scope");

  meld(!!antwoorden[k.hash], "de fixture heeft het antwoord van FEM Studio op deze invoer", `${k.hash}; draai node scripts/proef-kern-blok.mjs --bewaar`);
  const klaar = reken(DRIE, { toetsingen: antwoorden, toetsModus: "vragen" });
  const kk = kernVan(klaar.nodes);
  meld(kk.status === "klaar" && kk.versie === fixture.versie && !kk.verzoek && kk.aanroepen === 1, "met het antwoord: klaar, met de versie van FEM Studio");
  // De handberekening in de kop: z = 168 mm, A_sx = 684,5 mm²/m, UC = 0,908.
  meld(dichtbij(getal(klaar.scope.z, "mm"), 168), `de arm z = ${getal(klaar.scope.z, "mm")} mm (handberekening 168)`);
  const A = getal(klaar.scope.A_sx, "mm^2");
  const hand = (50e6 / 168) / (500 / 1.15);
  meld(dichtbij(A, hand, 1e-9) && Math.abs(A - 684.5) < 0.05, `A_sx = ${A.toFixed(2)} mm²/m = m/(z·f_yd) (handberekening 684,5)`);
  meld(dichtbij(getal(klaar.scope.UC), hand / 754, 1e-9), `UC = ${getal(klaar.scope.UC).toFixed(3)} tegen Ø12-150 (handberekening 0,908)`);
  const oud = 50e6 / (0.9 * 202) / (500 / 1.15);
  meld(Math.abs(oud - 632.6) < 0.05 && Math.abs(A / oud - 1.082) < 0.001, `met z = 0,9·d zou het ${oud.toFixed(1)} mm²/m zijn: het drielagenmodel vraagt ${((A / oud - 1) * 100).toFixed(1)} % meer`);
  meld(klaar.scope.drie_kind === "threeLayer" && klaar.scope.drie_result_bottom_reinforcementCase === "x-only" && klaar.scope.drie_result_status === "partial_check_passes", "tekst uit het antwoord: drie.kind, drie.result.bottom.reinforcementCase");
  meld(klaar.scope.drie_result_core_shearReinforcementRequired === undefined, "wat het antwoord leeg laat (null), bestaat niet");

  const anders = { ...antwoorden, [k.hash]: { ok: false, melding: fixture.geweigerd || "geweigerd" } };
  const fout = reken(DRIE, { toetsingen: anders, toetsModus: "vragen" });
  meld(kernVan(fout.nodes).status === "fout" && kernVan(fout.nodes).opnieuw === true && fout.scope.drie_result_leverArmMm === undefined, "een fout van FEM Studio: niet gerekend met de melding, geen uitkomst");
  meld(typeof fixture.geweigerd === "string" && /nuPrime/.test(fixture.geweigerd), "de echte server weigert ν' = 1,5 met een melding", fixture.geweigerd);
  meld(kernVan(reken(GEWEIGERD, { toetsModus: "vragen" }).nodes).hash !== k.hash, "en die invoer heeft een eigen hash");

  const veldfout = kernVan(reken(DRIE.replace("inputs.input.thicknessMm = h", "inputs.input.thicknessMm = onbekend"), { toetsModus: "vragen" }).nodes);
  meld(veldfout.status === "fout" && !veldfout.verzoek && veldfout.melding.includes("regel"), "een fout in een veld: de melding met het regelnummer, geen verzoek", veldfout.melding);
  const eenheid = kernVan(reken(DRIE.replace("mx: m_x/(1 kN)", "mx: m_x"), { toetsModus: "vragen" }).nodes);
  meld(eenheid.status === "fout" && eenheid.melding.includes("inputs.input.forces.mx"), "een grootheid in mx (zonder eenheid in de naam): een fout met het pad", eenheid.melding);
  const dubbel = kernVan(reken(DRIE.replace("inputs.kind = \"threeLayer\"", "inputs.kind = \"threeLayer\"\n  inputs.kind = \"x\""), { toetsModus: "vragen" }).nodes);
  meld(dubbel.status === "fout" && dubbel.melding.includes("staat er al"), "hetzelfde veld twee keer is een fout", dubbel.melding);

  const verborgen = reken(DRIE.replace("@kern", "#hide\n@kern").replace("@end", "@end\n#show"), { toetsingen: antwoorden });
  meld(kernVan(verborgen.nodes)?.verborgen === true && !render(verborgen.nodes).includes("calc-kern") && dichtbij(getal(verborgen.scope.z, "mm"), 168), "achter #hide: niet op het blad, de uitkomsten gelden wel");
  const tak = reken(DRIE.replace("@kern", "#if h > 1 m\n@kern").replace("@end", "@end\n#end if"), { toetsModus: "vragen" });
  meld(!kernVan(tak.nodes)?.verzoek, "een #if-tak die niet geldt, vraagt niets");

  // Een tweede blok met dezelfde naam ruimt de uitkomsten van het eerste op.
  const tweede = reken(`${DRIE}\n@kern drie = solve_native_fem\n  x = 1\n@end\nna = drie.result.leverArmMm`, { toetsingen: antwoorden });
  meld(tweede.scope.drie_result_leverArmMm === undefined && tweede.nodes.find((n) => n.name === "na")?.result?.startsWith("Error"), "een later blok met dezelfde naam en zonder antwoord: de oude uitkomsten zijn weg");
});

await deel("Een reeks aanroepen: per", () => {
  const vragen = reken(REEKS, { toetsModus: "vragen" });
  const k = kernVan(vragen.nodes);
  meld(k?.status === "wacht" && k.verzoek?.reeks?.length === 4 && k.aanroepen === 4 && k.overgeslagen === 1, "vier aanroepen in één verzoek, waarvan één overgeslagen", JSON.stringify(k?.melding));
  meld(k.verzoek.reeks[2] === null && k.verzoek.reeks[1].inputs.input.forces.mxy === 10 && k.verzoek.reeks[3].inputs.input.forces.mx === -40 && Object.keys(k.verzoek.argumenten).length === 0, "de rij zonder moment is null; elke aanroep heeft zijn eigen argumenten");
  meld(!!antwoorden[k.hash], "de fixture heeft het antwoord op de reeks", k.hash);
  const klaar = reken(REEKS, { toetsingen: antwoorden });
  const kk = kernVan(klaar.nodes);
  meld(kk.status === "klaar" && getal(klaar.scope.n) === 4, "klaar; reeks.aantal = 4");
  const v = (naam) => klaar.scope[naam]?.toArray?.() ?? [];
  meld(JSON.stringify(v("reeks_gerekend")) === "[1,1,0,1]", "reeks.gerekend: 1 per aanroep, 0 voor de overgeslagen", JSON.stringify(v("reeks_gerekend")));
  const ox = v("reeks_result_bottom_requiredAsXmm2PerM");
  const oy = v("reeks_result_bottom_requiredAsYmm2PerM");
  const bx = v("reeks_result_top_requiredAsXmm2PerM");
  meld(ox.length === 4 && Number.isNaN(ox[2]), "per veld een vector met een waarde per aanroep; NaN waar hij is overgeslagen", JSON.stringify(ox));
  // De handberekeningen in de kop.
  const fyd = 500 / 1.15;
  meld(dichtbij(ox[0], (50e6 / 168) / fyd, 1e-9), `rij 1 is de enkele aanroep: ${ox[0]?.toFixed(1)} mm²/m`);
  meld(dichtbij(ox[1], (30 + 10) * 1e6 / 168 / fyd, 1e-9) && Math.abs(ox[1] - 547.6) < 0.05 && dichtbij(oy[1], (20 + 10) * 1e6 / 168 / fyd, 1e-9) && Math.abs(oy[1] - 410.7) < 0.05, `rij 2, met m_xy: onder ${ox[1]?.toFixed(1)} en ${oy[1]?.toFixed(1)} mm²/m (handberekening 547,6 en 410,7)`);
  meld(dichtbij(bx[3], (40 + 15) * 1e6 / 168 / fyd, 1e-9) && Math.abs(bx[3] - 753.0) < 0.05 && ox[3] === 0, `rij 4, steunpunt met m_xy: boven ${bx[3]?.toFixed(1)} mm²/m (handberekening 753,0), onder niets`);
  meld(dichtbij(getal(klaar.scope.A_4b), bx[3]) && dichtbij(getal(klaar.scope.A_2x), ox[1]), "take(4; reeks.result.top.requiredAsXmm2PerM) in het blad");
  const tekst = v("reeks_result_top_reinforcementCase");
  meld(tekst[0] === "compression-only" && tekst[2] === "" && tekst[3] === "both-directions", "tekst per aanroep, leeg waar hij is overgeslagen", JSON.stringify(tekst));

  const kort = { ...antwoorden, [k.hash]: { ok: true, uitkomst: { reeks: [1, 2] } } };
  const mis = reken(REEKS, { toetsingen: kort });
  meld(kernVan(mis.nodes).status === "fout" && mis.scope.reeks_aantal === undefined, "een antwoord dat niet bij de reeks past: niet gerekend, geen uitkomst", kernVan(mis.nodes).melding);

  const leeg = reken("@kern niets = solve_native_fem\n  per k = 1 : 3\n  #if k > 5\n  x = k\n  #end if\n@end\nn = niets.aantal", { toetsModus: "vragen" });
  meld(kernVan(leeg.nodes).status === "klaar" && !kernVan(leeg.nodes).verzoek && getal(leeg.scope.n) === 3, "een reeks waarin alles is overgeslagen, vraagt niets");
  const veel = kernVan(reken("@kern veel = solve_native_fem\n  per k = 1 : 5000\n  x = k\n@end", { toetsModus: "vragen" }).nodes);
  meld(veel.status === "fout" && veel.melding.includes("2000"), "meer dan 2000 aanroepen is een fout", veel.melding);
});

await deel("Een lijst van objecten", () => {
  const vragen = reken(BATCH, { toetsModus: "vragen" });
  const k = kernVan(vragen.nodes);
  const s = k?.verzoek?.argumenten?.inputs?.input?.samples;
  meld(k?.status === "wacht" && Array.isArray(s) && s.length === 4 && s[3].id === "4" && s[1].forces.mxy === 10, "#for met een index in het pad bouwt een lijst van objecten", JSON.stringify(k?.melding ?? s?.[3]));
  meld(JSON.stringify(s?.[2].positionM) === "[1.5,0]", "positionM = [1500 mm; 0 m] gaat als [1.5, 0]", JSON.stringify(s?.[2]?.positionM));
  meld(!!antwoorden[k.hash], "de fixture heeft het antwoord op de lijst", k.hash);
  const klaar = reken(BATCH, { toetsingen: antwoorden });
  const reeks = reken(REEKS, { toetsingen: antwoorden });
  const bx = klaar.scope.batch_result_results_result_top_requiredAsXmm2PerM?.toArray?.() ?? [];
  const rx = reeks.scope.reeks_result_top_requiredAsXmm2PerM?.toArray?.() ?? [];
  meld(bx.length === 4 && [0, 1, 3].every((i) => dichtbij(bx[i], rx[i])), "een lijst objecten in het antwoord: per veld een vector, gelijk aan de reeks", JSON.stringify(bx));
  meld(getal(klaar.scope.batch_result_checkedPoints) === 4 && dichtbij(getal(klaar.scope.x_3), 1.5), "een lijst getallen per object wordt een matrix: take(3; 1; batch.result.results.positionM)");
  const gat = kernVan(reken("@kern g = solve_native_fem\n  lijst[1].a = 1\n  lijst[3].a = 3\n@end", { toetsModus: "vragen" }).nodes);
  meld(gat.status === "fout" && gat.melding.includes("lijst[2] ontbreekt"), "een lijst met een gat is een fout", gat.melding);
});

await deel("De scheurwijdte tegen de handberekening", () => {
  const k = kernVan(reken(SCHEUR, { toetsModus: "vragen" }).nodes);
  const a = k?.verzoek?.argumenten?.inputs?.input ?? {};
  meld(a.sigmaSMpa === 300 && a.widthMm === 1000 && a.eCmMpa === 33000 && a.wMaxMm === 0.3 && a.bondedReinforcementAreaMm2 === 754, "de argumenten in mm, mm² en MPa", JSON.stringify(a));
  meld(!!antwoorden[k.hash], "de fixture heeft het antwoord op de scheurwijdte", k.hash);
  const klaar = reken(SCHEUR, { toetsingen: antwoorden });
  // 7.3.4 met de hand, zie de kop.
  const hcef = Math.min(2.5 * (250 - 214), (250 - 40) / 3, 250 / 2);
  const rho = 754 / (1000 * hcef);
  const alfa = 200000 / 33000;
  const eps = Math.max((300 - 0.4 * (2.9 / rho) * (1 + alfa * rho)) / 200000, 0.6 * 300 / 200000);
  const sr = Math.min(3.4 * 30 + 0.8 * 0.5 * 0.425 * 12 / rho, Math.max((50 - 0.8 * 30) * 12, 15 * 12));
  const wk = sr * eps;
  meld(hcef === 70 && Math.abs(sr - 291.4) < 0.05 && Math.abs(eps - 0.9264e-3) < 1e-7 && Math.abs(wk - 0.270) < 0.0005, `de handberekening: h_c,ef = ${hcef} mm, s_r,max = ${sr.toFixed(1)} mm, ε = ${(eps * 1000).toFixed(4)} ‰, w_k = ${wk.toFixed(4)} mm`);
  meld(dichtbij(getal(klaar.scope.scheur_result_effectiveTensionHeightMm), hcef) && dichtbij(getal(klaar.scope.scheur_result_maximumCrackSpacingMm), sr, 1e-9) && dichtbij(getal(klaar.scope.scheur_result_strainDifference), eps, 1e-9), "FEM Studio geeft dezelfde h_c,ef, s_r,max en ε");
  meld(dichtbij(getal(klaar.scope.w_k, "mm"), wk, 1e-9) && dichtbij(getal(klaar.scope.UC_w), wk / 0.3, 1e-9), `w_k = ${getal(klaar.scope.w_k, "mm").toFixed(4)} mm, UC = ${getal(klaar.scope.UC_w).toFixed(3)} (handberekening 0,270 mm en 0,90)`);
  meld(klaar.scope.scheur_result_passes === 1 && klaar.scope.scheur_result_tensionStiffeningFloorGoverns === 0 && klaar.scope.scheur_result_crackSpacingEquation === "7.11", "ja en nee als 1 en 0; de gebruikte vergelijking als tekst");
});

await deel("De weergave", () => {
  const html = render(reken(DRIE, { toetsingen: antwoorden }).nodes);
  meld(html.includes('class="calc-kern"') && html.includes("<strong>Rekenkern drie</strong>") && html.includes("<code>solve_native_fem</code>") && html.includes(`Open FEM Studio versie ${fixture.versie}`), "de kop: de naam, de tool en de versie van FEM Studio");
  meld(html.includes("1 aanroep") && /<details class="calc-kern-details alleen-scherm">/.test(html) && html.includes("drie.result.leverArmMm"), "het aantal aanroepen; de invoer en de uitkomsten alleen op het scherm");
  const reeks = render(reken(REEKS, { toetsingen: antwoorden }).nodes);
  meld(reeks.includes("4 aanroepen, waarvan 1 overgeslagen"), "een reeks: 4 aanroepen, waarvan 1 overgeslagen");
  const niet = render(reken(DRIE).nodes);
  meld(niet.includes("NIET GEREKEND: er is geen antwoord van Open FEM Studio") && niet.includes("calc-kern-fout"), "zonder antwoord: NIET GEREKEND");
  const wacht = render(reken(DRIE, { toetsModus: "vragen" }).nodes);
  meld(wacht.includes("Wordt gerekend door Open FEM Studio…") && wacht.includes("calc-kern-wacht"), "in de werkruimte zonder antwoord: wordt gerekend");
  const en = render(reken(DRIE, { toetsingen: antwoorden, taal: "en" }).nodes);
  meld(en.includes("Calculation kernel drie") && en.includes("1 call") && en.includes("Input and result") && render(reken(DRIE, { taal: "en" }).nodes).includes("NOT CALCULATED"), "in het Engels");
  const blokken = [html, reeks, niet, wacht].map((h) => h.match(/<div class="calc-kern[^]*?<\/div>/)?.[0] ?? "");
  meld(blokken.every((b) => b && !/voldoet|satisf/i.test(b)), "het blok geeft nergens een oordeel");
  meld(kern.defaultStyles.includes(".calc-kern-melding"), "de opmaak staat bij de andere blokken");
});

await deel("Herkomst en opnieuw rekenen", () => {
  const hash = kernVan(reken(DRIE, { toetsModus: "vragen" }).nodes).hash;
  const v = vast[hash];
  meld(!!v && v.tool === "solve_native_fem" && typeof v.datum === "string" && v.herkomst.versie === fixture.versie, "het vastgelegde antwoord: de tool, de datum en de herkomst");
  const k = kernVan(reken(DRIE, { toetsingen: antwoorden }).nodes);
  meld(k.datum === v.datum && !k.opnieuw, "modus lezen: de datum, geen knop");
  const html = render(reken(DRIE, { toetsingen: antwoorden }).nodes);
  meld(/<span class="alleen-scherm">, \d+-\d+-\d{4}<\/span>/.test(html) && !html.includes("data-toets-opnieuw"), "de datum alleen op het scherm");
  const nieuwer = { versie: "2099.1.0", schemas: { solve_native_fem: v.herkomst.schema } };
  const vn = reken(DRIE, { toetsingen: antwoorden, toetsModus: "vragen", fem: nieuwer });
  const kn = kernVan(vn.nodes);
  meld(kn.status === "klaar" && kn.verouderd?.versie === "2099.1.0" && kn.opnieuw && !kn.verzoek && dichtbij(getal(vn.scope.z, "mm"), 168), "een andere versie van FEM Studio: het oude antwoord geldt, met de melding en de knop");
  const vnHtml = render(vn.nodes);
  meld(vnHtml.includes(`Gerekend met versie ${fixture.versie}; deze CalcSheet heeft FEM Studio 2099.1.0.`) && vnHtml.includes(`data-toets-opnieuw="${hash}"`), "de melding en de knop Opnieuw rekenen, met de hash van het blok");
  const schema = kernVan(reken(DRIE, { toetsingen: antwoorden, toetsModus: "vragen", fem: { versie: fixture.versie, schemas: { solve_native_fem: "sffffffffffffffff" } } }).nodes);
  meld(schema.verouderd?.schema === true && schema.opnieuw, "een ander schema bij dezelfde versie: melding en knop");
  meld(!kernVan(reken(DRIE, { toetsingen: antwoorden, fem: nieuwer }).nodes).verouderd, "modus lezen (de afdruk): geen melding");
  const mislukt = { ...antwoorden, [hash]: { ...antwoorden[hash], waarschuwing: "time-out" } };
  const m = reken(DRIE, { toetsingen: mislukt, toetsModus: "vragen" });
  meld(kernVan(m.nodes).status === "klaar" && render(m.nodes).includes("Opnieuw rekenen lukte niet: time-out"), "opnieuw rekenen mislukt: het oude antwoord blijft, met de fout erbij");
});

await deel("Vastleggen bij het blad en aanroepen", () => {
  const drie = reken(DRIE, { toetsModus: "vragen" }).nodes;
  const reeks = reken(REEKS, { toetsModus: "vragen" }).nodes;
  const hDrie = kernVan(drie).hash;
  const hReeks = kernVan(reeks).hash;
  meld(cache.verzamelVerzoeken(drie).length === 1 && cache.verzamelVerzoeken(reeks)[0]?.reeks?.length === 4, "de werkruimte vindt het verzoek van een @kern-blok, ook van een reeks");
  meld(cache.toetsHashes(drie).join() === hDrie && cache.toetsHashes(reken(DRIE, { toetsingen: antwoorden }).nodes).join() === hDrie, "en de hash, met of zonder antwoord");
  const beide = { [hDrie]: vast[hDrie], [hReeks]: vast[hReeks] };
  const na = cache.gebruikteToetsingen(beide, { nodes: reken(DRIE, { toetsingen: antwoorden }).nodes });
  meld(Object.keys(na ?? {}).join() === hDrie, "opslaan: een antwoord dat het blad niet meer gebruikt, valt weg");

  const verzoek = kernVan(reeks).verzoek;
  const gevraagd = [];
  return kern.kernAanroepen(verzoek, async (tool, argumenten) => {
    gevraagd.push(argumenten.inputs.input.forces.mx);
    return { tool, mx: argumenten.inputs.input.forces.mx };
  }).then(async (uit) => {
    meld(gevraagd.join() === "50,30,-40" && uit.reeks.length === 4 && uit.reeks[2] === null && uit.reeks[3].mx === -40, "kernAanroepen: elke aanroep van de reeks na elkaar, de overgeslagen als null", JSON.stringify(gevraagd));
    meld(JSON.stringify(kern.kernVerzoekBewaard(verzoek)) === JSON.stringify({ reeks: verzoek.reeks }) && kern.kernVerzoekBewaard(kernVan(drie).verzoek).inputs.kind === "threeLayer", "wat er bewaard wordt: de reeks, of de argumenten");
    let fout = "";
    try {
      await kern.kernAanroepen(verzoek, async (_t, a) => { if (a.inputs.input.forces.mx === 30) throw new Error("geweigerd"); return {}; });
    } catch (e) { fout = e.message; }
    meld(fout === "aanroep 2 van 4: geweigerd", "een fout in één aanroep is een fout van de reeks, met het nummer", fout);
    let omgeving = null;
    try {
      await kern.kernAanroepen(verzoek, async () => { throw Object.assign(new Error("no desktop app"), { code: "geenDesktop" }); });
    } catch (e) { omgeving = e; }
    meld(omgeving?.code === "geenDesktop" && omgeving.message === "no desktop app", "een fout van de omgeving (geen server) gaat door zoals hij is", omgeving?.message);
    const enkel = await kern.kernAanroepen(kernVan(drie).verzoek, async (_t, a) => a.inputs.kind);
    meld(enkel === "threeLayer", "zonder reeks: één aanroep met de argumenten");
  });
});

// De editor en de vertalingen: het blok vouwt in, staat in de aanvullijst en heeft zijn tekst in elke taal.
await deel("De editor", () => {
  const taal = readFileSync(join(hier, "..", "packages/desktop/src/components/calc/ifcCalcLanguage.ts"), "utf8");
  meld(/open: \/\^\\s\*@kern\\b\//.test(taal) && /label: "@kern"[^}]*sleutel: "kernBlok"/.test(taal), "@kern vouwt in en staat in de aanvullijst");
  for (const t of ["en", "nl"]) {
    const j = JSON.parse(readFileSync(join(hier, "..", `packages/desktop/src/i18n/locales/${t}/rekentaal.json`), "utf8"));
    meld(JSON.stringify(j).includes('"kernBlok"'), `de omschrijving van het blok in ${t}/rekentaal.json`);
  }
  const voorPapier = readFileSync(join(hier, "..", "packages/desktop/src/rekenen/femToetsing.ts"), "utf8");
  meld(cache.HEEFT_FEM_BLOK.test("x = 1\n  @kern a = solve_native_fem\n@end") && !cache.HEEFT_FEM_BLOK.test("'tekst over @kern") && voorPapier.includes("HEEFT_FEM_BLOK.test(ex.source)"), "vóór het afdrukken rekent ook een blad met @kern eerst");
});

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
