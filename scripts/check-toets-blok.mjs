/**
 * Controle van het blok `@toets` (packages/core/src/toetsBlok.ts): een normtoets
 * door Open FEM Studio.
 *
 * Toetst, zonder FEM Studio (de antwoorden komen uit een fixture met een echt
 * antwoord van check_steel_beam, scripts/fixtures/toets-staal.json):
 *   • lezen: naam, tool, velden, een regel zonder `=`, een blok zonder `@end`,
 *     een tool die niet mag;
 *   • omrekenen naar het schema: eenheden uit de naam van het veld, getallen,
 *     tekst, objecten, de matrixvorm van forces_envelope, een grootheid in een
 *     veld zonder eenheid;
 *   • de hash: dezelfde bij een andere eenheid van invoer, een andere bij een
 *     andere waarde;
 *   • het antwoord lezen: UC, oordeel, maatgevende toets, niet van toepassing,
 *     een profiel dat FEM Studio niet kent;
 *   • rekenen: de variabelen na het blok, de modus vragen (een verzoek) en
 *     lezen (niet getoetst), een veld met een fout (geen verzoek), #hide, een
 *     #if-tak die niet geldt;
 *   • de weergave: de tabel, de maatgevende rij, niet getoetst, Engels;
 *   • herkomst en opnieuw toetsen: een vastgelegd antwoord met datum en versie,
 *     de melding bij een andere versie of een ander schema (alleen in de modus
 *     vragen), de knop na een fout, een mislukte nieuwe toets, de versie één keer
 *     per blad, de hash van een schema, en het teruglezen van vastgelegde antwoorden.
 *
 * Draaien:  node scripts/check-toets-blok.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  parse, evaluate, render, defaultStyles, naarSchema, toetsHash, leesAntwoord, rekenUitdrukking,
  alsAntwoord, schemaHash, leesVastgelegdeToetsingen,
} from "../packages/core/dist/index.js";

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${ok || !detail ? "" : "  -> " + detail}`);
  if (!ok) fouten++;
}
const hier = dirname(fileURLToPath(import.meta.url));
const fixture = JSON.parse(readFileSync(join(hier, "fixtures", "toets-staal.json"), "utf8"));
const antwoord = fixture.staal.structuredContent;
const dichtbij = (a, b) => Math.abs(a - b) < 1e-9 * Math.max(1, Math.abs(b));

const blad = (h = "4 m", extra = "") => [
  `h = ${h}`,
  "N_Ed = -20 kN",
  "V_Ed = 25 kN",
  "M_Ed = 50 kN*m",
  extra,
  "@toets kolom = check_steel_beam",
  "  beam_id = 1",
  '  profile_name = "HEA200"',
  '  steel_grade = "S235"',
  "  length_m = h",
  "  forces_envelope = [1; 0; N_Ed; 0; V_Ed; 0; M_Ed; 0 | 1; h; N_Ed; 0; V_Ed; 0; M_Ed; 0]",
  "  lateral_bracing = {top_flange_positions: [0; 1], bottom_flange_positions: [0; 1]}",
  '  deflection_limit_class = "Roof"',
  "  deflection_limit_numerator = 250",
  "  deflection_actual_max_mm = -8 mm",
  "  is_cantilever = false",
  '  consequence_class = "CC2"',
  "@end",
  "UC_max = kolom.uc_max",
].join("\n");
const toetsVan = (nodes) => nodes.find((n) => n.type === "toets") ?? nodes.flatMap((n) => n.children ?? []).find((n) => n.type === "toets");

console.log("\nLezen");
{
  const [node] = parse("@toets kolom = check_steel_beam\n  length_m = 4\n  dit is geen veld\n  length_m = 5\n@end").filter((n) => n.type === "toets");
  meld(node.naam === "kolom" && node.tool === "check_steel_beam", "naam en tool");
  meld(node.velden.length === 1 && node.velden[0].veld === "length_m", "een veld met zijn uitdrukking");
  meld(node.fouten.some((f) => f.includes("veld = uitdrukking")) && node.fouten.some((f) => f.includes("staat er al")), "een regel zonder = en een dubbel veld zijn meldingen", JSON.stringify(node.fouten));
  const open = parse("@toets a = check_steel_beam\n  length_m = 4").find((n) => n.type === "toets");
  meld(open.fouten.some((f) => f.includes("@end")), "een blok zonder @end");
  const gui = parse("@toets a = gui_quit\n@end").find((n) => n.type === "toets");
  meld(gui.fouten.some((f) => f.includes("niet toegestaan")), "een tool die niet mag");
}

console.log("\nOmrekenen naar het schema");
{
  const r = (e) => rekenUitdrukking(e, {});
  meld(naarSchema("length_m", r("6000 mm")) === 6, "length_m = 6000 mm wordt 6");
  meld(dichtbij(naarSchema("a_net_mm2", r("12 cm^2")), 1200), "a_net_mm2 = 12 cm^2 wordt 1200");
  meld(dichtbij(naarSchema("q_equiv_n_per_mm", r("3 kN/m")), 3), "q_equiv_n_per_mm = 3 kN/m wordt 3");
  meld(naarSchema("deflection_limit_numerator", 250) === 250, "een getal blijft een getal");
  meld(naarSchema("profile_name", "HEA200") === "HEA200", "tekst blijft tekst");
  let fout = "";
  try { naarSchema("beam_id", r("4 m")); } catch (e) { fout = e.message; }
  meld(fout.includes("geen eenheid in zijn naam"), "een grootheid in een veld zonder eenheid is een fout", fout);
  fout = "";
  try { naarSchema("length_m", r("5 kN")); } catch (e) { fout = e.message; }
  meld(fout.includes("past niet"), "een eenheid die niet past is een fout", fout);
}

console.log("\nDe hash");
{
  meld(toetsHash("x", { length_m: rekenUitdrukking("6 m") }) === toetsHash("x", { length_m: rekenUitdrukking("6000 mm") }), "hash_eenheid_onafhankelijk: 6 m en 6000 mm geven dezelfde hash");
  meld(toetsHash("x", { length_m: rekenUitdrukking("6 m") }) !== toetsHash("x", { length_m: rekenUitdrukking("6.5 m") }), "een andere waarde, een andere hash");
  meld(toetsHash("x", { a: 1 }) !== toetsHash("y", { a: 1 }), "een andere tool, een andere hash");
  meld(/^t[0-9a-f]{16}$/.test(toetsHash("x", {})), "de vorm: t en 16 hextekens");
}

console.log("\nHet antwoord lezen");
{
  const u = leesAntwoord(antwoord);
  meld(dichtbij(u.uc_max, antwoord.uc_max) && u.status === "Ok" && u.voldoet, `UC ${u.uc_max?.toFixed(4)}, voldoet`);
  meld(u.maatgevend === "6.3.3_eq_6_62", "de maatgevende toets: 6.3.3 (6.62)");
  meld(u.toetsen.length === antwoord.checks.length && u.toetsen.every((t) => t.artikel && t.titel), "elke toets met artikel en titel");
  const trek = u.toetsen.find((t) => t.id === "6.2.3_tension");
  meld(trek.status === "NotApplicable" && trek.uc === null, "trek zonder trekkracht: niet van toepassing, geen UC");
  meld(u.toetsen.find((t) => t.id === "6.3.2_ltb")?.uc > 0, "de UC per toets uit het object uc");
  const fout = leesAntwoord(fixture.fout.structuredContent);
  meld(typeof fout.fout === "string" && fout.fout.includes("HEA999"), "een onbekend profiel: een fout met de melding van FEM Studio", fout.fout);
  meld(leesAntwoord({ iets: 1 }).fout !== undefined, "geen toetsresultaat: een fout");
  const twee = leesAntwoord({ results: [{ ...antwoord, beam_id: 1 }, { ...antwoord, beam_id: 2, uc_max: 1.2, status: "NotOk" }] });
  meld(twee.staven?.length === 2 && twee.uc_max === 1.2 && twee.status === "NotOk" && !twee.voldoet, "een model met twee staven: de hoogste UC, voldoet niet");
  const half = leesAntwoord([{ ...antwoord }, { ...antwoord, status: "NotApplicable" }]);
  meld(half.status === "NotApplicable" && !half.voldoet, "een staaf niet volledig getoetst: het geheel ook niet, en nooit voldoet");
}

console.log("\nRekenen");
{
  // Eerst zonder antwoord, in de modus vragen: een verzoek met de omgerekende argumenten.
  const vragen = evaluate(parse(blad()), {}, {}, { toetsModus: "vragen" });
  const t = toetsVan(vragen);
  meld(t?.status === "wacht" && t.verzoek?.tool === "check_steel_beam", "modus vragen zonder antwoord: wacht, met een verzoek", JSON.stringify(t?.melding));
  const a = t?.verzoek?.argumenten ?? {};
  meld(a.length_m === 4 && a.deflection_actual_max_mm === -8 && a.profile_name === "HEA200" && a.is_cantilever === false, "de argumenten: 4 m als 4, -8 mm als -8, tekst en ja/nee");
  meld(a.forces_envelope?.length === 2 && a.forces_envelope[1].position_mm === 4000 && a.forces_envelope[1].forces.my_ed === 50 && a.forces_envelope[0].forces.n_ed === -20, "forces_envelope als matrix: x in mm, M in kNm", JSON.stringify(a.forces_envelope));
  meld(JSON.stringify(a.lateral_bracing) === JSON.stringify({ top_flange_positions: [0, 1], bottom_flange_positions: [0, 1] }), "een object met vectoren", JSON.stringify(a.lateral_bracing));
  meld(vragen.find((n) => n.name === "UC_max")?.result?.startsWith("Error"), "zonder antwoord is kolom.uc_max nog onbekend");

  const lezen = toetsVan(evaluate(parse(blad()), {}, {}, {}));
  meld(lezen.status === "niet-getoetst" && !lezen.verzoek, "modus lezen zonder antwoord: niet getoetst, geen verzoek");

  // Met het antwoord: de variabelen na het blok.
  const toetsingen = { [t.hash]: { ok: true, uitkomst: antwoord, versie: fixture.versie } };
  const klaar = evaluate(parse(blad()), {}, {}, { toetsingen, toetsModus: "vragen" });
  const k = toetsVan(klaar);
  meld(k.status === "klaar" && k.versie === fixture.versie && !k.verzoek, "met het antwoord: klaar, met de versie van FEM Studio");
  const uc = klaar.find((n) => n.name === "UC_max");
  meld(uc && dichtbij(uc.waarde ?? Number(uc.result), antwoord.uc_max), "UC_max = kolom.uc_max rekent met de UC van FEM Studio", JSON.stringify(uc?.result));
  const metScope = evaluate(parse(blad() + "\nv = kolom.voldoet\nk = kolom.uc_6_3_2_ltb"), {}, {}, { toetsingen });
  meld(metScope.find((n) => n.name === "v")?.result?.trim() === "1", "kolom.voldoet = 1", JSON.stringify(metScope.find((n) => n.name === "v")?.result));
  meld(Number(metScope.find((n) => n.name === "k")?.waarde) > 0, "per toets: kolom.uc_6_3_2_ltb");

  const anders = toetsVan(evaluate(parse(blad("4000 mm")), {}, {}, { toetsingen }));
  meld(anders.status === "klaar", "h = 4000 mm in plaats van 4 m: hetzelfde antwoord, geen nieuw verzoek");

  const fout = toetsVan(evaluate(parse(blad()), {}, {}, { toetsingen: { [t.hash]: { ok: false, melding: "profiel onbekend" } } }));
  meld(fout.status === "fout" && fout.melding === "profiel onbekend", "antwoord_fout: niet getoetst met de melding");

  const veldfout = toetsVan(evaluate(parse(blad().replace("length_m = h", "length_m = onbekend")), {}, {}, { toetsModus: "vragen" }));
  meld(veldfout.status === "fout" && !veldfout.verzoek && veldfout.melding.includes("length_m"), "veldfout_geen_verzoek: de fout bij het veld, geen verzoek");

  const verborgen = evaluate(parse(blad().replace("@toets", "#hide\n@toets").replace("@end", "@end\n#show")), {}, {}, { toetsingen });
  const vt = toetsVan(verborgen);
  meld(vt?.verborgen === true && render(verborgen).indexOf("calc-toets-tabel") === -1, "verborgen_blok_rekent: niet op het blad");
  meld(dichtbij(Number(verborgen.find((n) => n.name === "UC_max")?.waarde), antwoord.uc_max), "maar de variabelen gelden wel");

  const tak = evaluate(parse(blad().replace("@toets", "#if h > 10 m\n@toets").replace("@end", "@end\n#end if")), {}, {}, { toetsModus: "vragen" });
  meld(!toetsVan(tak)?.verzoek, "if_tak_geen_verzoek: een tak die niet geldt, vraagt niets");
}

console.log("\nDe weergave");
{
  const hash = toetsVan(evaluate(parse(blad()), {}, {}, { toetsModus: "vragen" })).hash;
  const toetsingen = { [hash]: { ok: true, uitkomst: antwoord, versie: fixture.versie } };
  const html = render(evaluate(parse(blad()), {}, {}, { toetsingen }));
  meld(html.includes('class="calc-toets-tabel"') && (html.match(/<tr class/g) ?? []).length === antwoord.checks.length, "een tabel met een rij per toets");
  meld(/<tr class="maatgevend">[^]*?6\.62/.test(html), "de maatgevende rij gemarkeerd");
  meld(html.includes("n.v.t.") && html.includes("voldoet"), "niet van toepassing en voldoet");
  meld(html.includes("alleen-scherm") && html.includes("Afleiding"), "de afleiding alleen op het scherm");
  meld(/\.calc-toets-tabel th:nth-child\(n\+3\), \.calc-toets-tabel td:nth-child\(n\+3\) \{ white-space: nowrap; \}/.test(defaultStyles), "UC en oordeel breken niet af in een smal paneel");
  meld(html.includes("<td>art. 6.3.2.3 (tabel 6.3/<wbr>6.5) + NB.NB.2/<wbr>NB.4/<wbr>NB.7/<wbr>NB.11/<wbr>NB.13</td>"), "een lange verwijzing breekt na elke schuine streep");
  const nietGetoetst = render(evaluate(parse(blad()), {}, {}, {}));
  meld(nietGetoetst.includes("NIET GETOETST"), "zonder antwoord: NIET GETOETST");
  const en = render(evaluate(parse(blad()), {}, {}, { toetsingen, taal: "en" }));
  meld(en.includes("Code check") && en.includes("satisfies") && en.includes("0.58"), "in het Engels, met een punt als decimaalteken");
}

console.log("\nHerkomst en opnieuw toetsen");
{
  const hash = toetsVan(evaluate(parse(blad()), {}, {}, { toetsModus: "vragen" })).hash;
  const vast = {
    tool: "check_steel_beam",
    verzoek: { length_m: 4 },
    uitkomst: antwoord,
    datum: "2026-11-07T10:15:00.000Z",
    herkomst: { versie: "2026.44.2", sha256: "a".repeat(64), schema: "s0123456789abcdef" },
  };
  const toetsingen = { [hash]: alsAntwoord(vast) };
  const k = toetsVan(evaluate(parse(blad()), {}, {}, { toetsingen }));
  meld(k.status === "klaar" && k.versie === "2026.44.2" && k.datum === vast.datum, "een vastgelegd antwoord: klaar, met versie en datum");
  const html = render(evaluate(parse(blad()), {}, {}, { toetsingen }));
  meld(html.includes('<span class="alleen-scherm">, 7-11-2026</span>'), "de datum alleen op het scherm", html.match(/calc-toets-kop[^]*?<\/p>/)?.[0]);
  meld(!html.includes("data-toets-opnieuw"), "modus lezen: geen knop opnieuw toetsen");

  const nieuwer = { versie: "2026.46.1", schemas: { check_steel_beam: "s0123456789abcdef" } };
  const lezenNieuwer = toetsVan(evaluate(parse(blad()), {}, {}, { toetsingen, fem: nieuwer }));
  meld(!lezenNieuwer.verouderd && !lezenNieuwer.opnieuw, "modus lezen: ook bij een nieuwere FEM Studio geen melding (de afdruk)");
  const vNieuwer = evaluate(parse(blad()), {}, {}, { toetsingen, toetsModus: "vragen", fem: nieuwer });
  const vn = toetsVan(vNieuwer);
  meld(vn.status === "klaar" && vn.verouderd?.versie === "2026.46.1" && vn.opnieuw && !vn.verzoek, "andere versie: het oude antwoord geldt, met de melding en de knop; geen verzoek");
  const vnHtml = render(vNieuwer);
  meld(vnHtml.includes("Getoetst met versie 2026.44.2; deze CalcSheet heeft FEM Studio 2026.46.1.") && vnHtml.includes(`data-toets-opnieuw="${hash}"`) && /calc-toets-verouderd alleen-scherm/.test(vnHtml), "de melding en de knop, alleen op het scherm");
  meld(dichtbij(Number(vNieuwer.find((n) => n.name === "UC_max")?.waarde), antwoord.uc_max), "de variabelen gelden met het oude antwoord");
  const schema = toetsVan(evaluate(parse(blad()), {}, {}, { toetsingen, toetsModus: "vragen", fem: { versie: "2026.44.2", schemas: { check_steel_beam: "sffffffffffffffff" } } }));
  meld(schema.verouderd?.schema === true && schema.opnieuw, "ander schema bij dezelfde versie: melding en knop");
  const gelijk = toetsVan(evaluate(parse(blad()), {}, {}, { toetsingen, toetsModus: "vragen", fem: { versie: "2026.44.2", schemas: { check_steel_beam: "s0123456789abcdef" } } }));
  meld(!gelijk.verouderd && !gelijk.opnieuw, "dezelfde versie en hetzelfde schema: geen melding");
  const zonderFem = toetsVan(evaluate(parse(blad()), {}, {}, { toetsingen, toetsModus: "vragen" }));
  meld(!zonderFem.verouderd, "zonder FEM Studio op deze computer: het oude antwoord, zonder melding");

  const mislukt = { [hash]: { ...alsAntwoord(vast), waarschuwing: "time-out" } };
  const m = evaluate(parse(blad()), {}, {}, { toetsingen: mislukt, toetsModus: "vragen" });
  meld(toetsVan(m).status === "klaar" && render(m).includes("Opnieuw toetsen lukte niet: time-out") && render(m).includes("data-toets-opnieuw"), "opnieuw toetsen mislukt: het oude antwoord blijft, met de fout en de knop");

  const fout = evaluate(parse(blad()), {}, {}, { toetsingen: { [hash]: { ok: false, melding: "geen verbinding" } }, toetsModus: "vragen" });
  meld(toetsVan(fout).opnieuw && render(fout).includes("data-toets-opnieuw"), "na een fout: de knop opnieuw toetsen");
  const foutLezen = render(evaluate(parse(blad()), {}, {}, { toetsingen: { [hash]: { ok: false, melding: "geen verbinding" } } }));
  meld(!foutLezen.includes("data-toets-opnieuw"), "na een fout in de modus lezen: geen knop");

  // Twee blokken: dezelfde versie staat alleen bij het eerste, verschillende bij elk.
  const tweede = blad("5 m").split("\n").slice(5).join("\n").replace("@toets kolom", "@toets kolom2").replace("length_m = h", "length_m = 5 m").replace("UC_max = kolom.uc_max", "UC_2 = kolom2.uc_max");
  const twee = blad() + "\n" + tweede;
  const hash2 = evaluate(parse(twee), {}, {}, { toetsModus: "vragen" }).filter((n) => n.type === "toets")[1]?.hash;
  const versieKoppen = (v2) => {
    const t2 = { ...toetsingen, [hash2]: alsAntwoord({ ...vast, herkomst: { ...vast.herkomst, versie: v2 } }) };
    return (render(evaluate(parse(twee), {}, {}, { toetsingen: t2 })).match(/Open FEM Studio versie [0-9.]+/g) ?? []).length;
  };
  meld(!!hash2 && hash2 !== hash && versieKoppen("2026.44.2") === 1, "twee blokken met dezelfde versie: de versie één keer", `${hash2} ${versieKoppen("2026.44.2")}`);
  meld(versieKoppen("2026.45.0") === 2, "met verschillende versies: bij elk blok");

  meld(schemaHash({ a: 1, b: [1, 2] }) === schemaHash({ b: [1, 2], a: 1 }) && schemaHash({ a: 1 }) !== schemaHash({ a: 2 }) && /^s[0-9a-f]{16}$/.test(schemaHash({})), "de hash van een schema: volgorde van sleutels telt niet, inhoud wel");

  const gelezen = leesVastgelegdeToetsingen({
    [hash]: vast,
    geenHash: vast,
    t0000000000000001: { ...vast, tool: "" },
    t0000000000000002: { tool: "x", verzoek: {}, uitkomst: null },
    t0000000000000003: { ...vast, herkomst: { versie: 5, schema: "s1" } },
  });
  meld(Object.keys(gelezen ?? {}).sort().join() === [hash, "t0000000000000003"].sort().join(), "teruglezen: een ongeldige hash, geen tool of geen datum valt weg", JSON.stringify(Object.keys(gelezen ?? {})));
  meld(gelezen?.t0000000000000003?.herkomst.versie === undefined && gelezen?.t0000000000000003?.herkomst.schema === "s1", "een herkomst met een verkeerd type valt per veld weg");
  meld(leesVastgelegdeToetsingen({}) === undefined && leesVastgelegdeToetsingen([vast]) === undefined, "niets bruikbaars: undefined");
}

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
