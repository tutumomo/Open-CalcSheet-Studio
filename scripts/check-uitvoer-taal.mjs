/**
 * Controle van de uitvoer in de taal van de app.
 *
 *   1  het mechanisme: wat er wel en niet vertaald wordt, en dat de code gelijk blijft;
 *   2  per module: elke zichtbare tekst staat in de vertaaltabel, of is neutraal
 *      (symbolen, eenheden, normnummers). Ontbreekt er iets, dan somt dit script de
 *      regels op;
 *   3  de Engelse uitvoer van elke module, doorgerekend op alle schema's, doorzocht op
 *      Nederlandse woorden;
 *   4  de rekenuitkomsten: in beide talen dezelfde getallen en hetzelfde oordeel, en de
 *      invoer en de rekenversie kennen alleen de Nederlandse bron;
 *   5  de 3D-namen in het IFCX-document.
 *
 * Draaien:  node scripts/check-uitvoer-taal.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { parse, evaluate, render, leesIfcx } from "../packages/core/dist/index.js";
import { laadTemplate } from "./lib/refcheck.mjs";

const { doorloop, ontleed, vertaalBron, zichtbareTeksten, uitvoerBron } = await import("../packages/desktop/src/components/calc/uitvoerTaal.ts");
const { vertalingVoor, bronVoorUitvoer } = await import("../packages/desktop/src/templates/vertalingen.ts");
const { leesResultaat, leesGetallen } = await import("../packages/desktop/src/components/calc/bladLezen.ts");
const { balklaagEn } = await import("../packages/desktop/src/templates/balklaag.en.ts");
const { liggerEn } = await import("../packages/desktop/src/templates/ligger.en.ts");
const { rekentaalDemoEn } = await import("../packages/desktop/src/templates/rekentaal-demo.en.ts");
const { tweepaalspoerEn } = await import("../packages/desktop/src/templates/tweepaalspoer.en.ts");
const { doorsnedeSpanningenEn } = await import("../packages/desktop/src/templates/doorsnede-spanningen.en.ts");

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : `\n         ${detail}`}`);
};

/** Bladtekst zonder het commentaar boven de template-literal. */
const blad = (bestand, kop) => {
  const t = laadTemplate(bestand);
  return t.slice(t.indexOf(kop));
};
const MODULES = [
  { naam: "balklaag", bron: blad("balklaag.ts", '"Balklaag —'), v: balklaagEn },
  { naam: "ligger", bron: blad("ligger.ts", '"Ligger van hout of staal'), v: liggerEn },
  { naam: "demoblad", bron: blad("rekentaal-demo.ts", '"Open CalcSheet Studio demo'), v: rekentaalDemoEn },
  { naam: "tweepaalspoer", bron: blad("tweepaalspoer.ts", '"Tweepaalspoer —'), v: tweepaalspoerEn },
  { naam: "doorsnede", bron: blad("doorsnede-spanningen.ts", '"Spanningen in een doorsnede —'), v: doorsnedeSpanningenEn },
];

// ── 1. Het mechanisme ─────────────────────────────────────────────────────
console.log("\n1. Het mechanisme");
{
  const v = {
    marker: "x",
    tekst: {
      "Titel": "Title", "Mijn kop": "My heading", "veld 1": "span 1", "voldoet": "OK", "op veld 2": "on span 2",
      "Keuze": "Choice", "Eerste": "First", "uitleg over b<sub>sparing</sub>": "note on b<sub>opening</sub>", "sparing": "opening",
    },
    namen: { b_sparing: "b_opening", "M_Ed,veld": "M_Ed,span" },
  };
  const bron = [
    '"Titel',
    "# Mijn kop",
    "'<i>uitleg over b<sub>sparing</sub></i><span class=\"alleen-scherm\"></span>",
    "'Eigen tekst van de gebruiker",
    "b_sparing = ?*(mm)', veld 1<span class=\"kolom-3\"></span>'",
    'tekst = if(a > 0; "op veld 2"; "onbekend")',
    "'<span class=\"oordeel\" style=\"color: green\"> ≤ 1.0 → <b>voldoet</b></span>",
    "'  <text x=\"'p_x'\" y=\"'p_y + 4'\" text-anchor=\"middle\" style=\"fill:#64748B\">sparing</text>",
    "x = y', (veld 1)'",
    '@select keuze "Keuze"',
    "  Eerste = 1",
    "  Tweede = 2",
    "@end",
    "@ifcx balklaag hoogte=340",
    "#hide",
    "'veld 1 in een verborgen regel",
    "#show",
  ].join("\n");
  const uit = vertaalBron(bron, v, "en").split("\n");
  meld(uit[0] === '"Title', "de titel", uit[0]);
  meld(uit[1] === "# My heading", "een kop", uit[1]);
  meld(uit[2] === "'<i>note on b<sub>opening</sub></i><span class=\"alleen-scherm\"></span>", "een prozaregel, de opmaak blijft", uit[2]);
  meld(uit[3] === "'Eigen tekst van de gebruiker", "wat niet in de tabel staat, blijft staan", uit[3]);
  meld(uit[4] === "b_sparing = ?*(mm)', span 1<span class=\"kolom-3\"></span>'", "de toelichting verandert, de code en de naam niet", uit[4]);
  meld(uit[5] === 'tekst = if(a > 0; "on span 2"; "onbekend")', "een tekenreeks in een expressie", uit[5]);
  meld(uit[6].includes("<b>OK</b>") && uit[6].includes("≤ 1.0 →"), "het oordeel", uit[6]);
  meld(uit[7].endsWith('style="fill:#64748B">opening</text>') && uit[7].includes("'p_y + 4'"), "tekst in een tekening, de expressies blijven", uit[7]);
  meld(uit[8] === "x = y', (span 1)'", "leestekens aan de rand tellen niet mee", uit[8]);
  meld(uit[9] === '@select keuze "Choice"' && uit[10] === "  First = 1" && uit[11] === "  Tweede = 2", "een keuzelijst, de waarden blijven", uit.slice(9, 12).join(" | "));
  meld(uit[13] === "@ifcx balklaag taal=en hoogte=340", "het 3D-blok krijgt de taal", uit[13]);
  meld(uit[15] === "'veld 1 in een verborgen regel", "een verborgen regel staat nergens in beeld", uit[15]);
  meld(ontleed(" (veld 1), ").join("|") === " (|veld 1|), ", "ontleed", ontleed(" (veld 1), ").join("|"));
  meld(vertalingVoor(MODULES[0].bron, "nl") === null && vertalingVoor(MODULES[0].bron, "en") === balklaagEn, "Nederlands is de taal van de bron");
  meld(vertalingVoor('"Eigen blad\nx = 1', "en") === null, "een eigen blad heeft geen vertaling");
  meld(bronVoorUitvoer('"Eigen blad', "en").bron === '"Eigen blad', "en blijft zoals het is");
  meld(uitvoerBron("a", null, "en").bron === "a", "zonder tabel verandert er niets");
  void doorloop;
}

// ── 2. De tabellen ────────────────────────────────────────────────────────
console.log("\n2. De vertaaltabellen");
/** Woorden waaraan een onvertaald stukje te herkennen is; symbolen, eenheden en normnummers vallen erbuiten. */
const NL_WOORD = /\b(?:de|het|een|en|van|op|bij|met|voor|uit|naar|niet|geen|alleen|maar|ook|dan|als|is|zijn|wordt|worden|staat|staan|veld|balk|balken|ligger|steunpunt|oplegging|opleggingen|overstek|doorbuiging|buiging|afschuiving|oplegdruk|kip|knik|trilling|trillingen|raveelbalk|wisselbalk|sparing|onderslag|balklaag|veranderlijk|voldoet|voldoen|toets|toetsing|invoer|hoogte|breedte|lengte|lasten|last|puntlast|belasting|belastingen|belastinggeval|combinatie|combinaties|omhullende|maatgevend|maatgevende|eigen|gewicht|kruip|eindstand|bijkomend|momentaan|grootste|kleinste|zakking|dwarskracht|moment|hart|staal|hout|profiel|materiaal|doorsnede|klasse|tabel|formule|samenvatting|aangenomen|nader|onderzoek|tekst|blad|rekenblad)\b/i;
const OMITSYMBOL = (t) => t.replace(/<(sub|sup|code)>[^<]*<\/\1>/g, " ").replace(/<[^>]+>/g, " ").replace(/\bEN \d[\d-]*/g, " ");
for (const { naam, bron, v } of MODULES) {
  const alle = zichtbareTeksten(bron);
  const zonder = alle.filter((k) => !(k in v.tekst));
  const nederlands = zonder.filter((k) => NL_WOORD.test(OMITSYMBOL(k)));
  meld(nederlands.length === 0, `${naam}: ${alle.length} teksten, ${Object.keys(v.tekst).length} in de tabel, geen onvertaalde tekst`,
    `onvertaald:\n         ${nederlands.join("\n         ")}`);
  const ongebruikt = Object.keys(v.tekst).filter((k) => !alle.includes(k) && /\p{L}/u.test(k));
  meld(ongebruikt.length === 0, `${naam}: geen vervallen regels in de tabel`, `vervallen:\n         ${ongebruikt.join("\n         ")}`);
  const apostrof = Object.values(v.tekst).filter((w) => w.includes("'"));
  meld(apostrof.length === 0, `${naam}: geen rechte apostrof in een vertaling`, apostrof.join(" | "));
  const zonderMarker = !bron.includes(v.marker);
  meld(!zonderMarker, `${naam}: de marker staat in de bladtekst`, v.marker);
}

// ── 3. De Engelse uitvoer ─────────────────────────────────────────────────
console.log("\n3. De Engelse uitvoer, doorzocht op Nederlandse woorden");
/**
 * Wat nog Nederlands is en niet uit de tabel komt: de plaatshouder van een `@js`-blok
 * in de kern. Staat hier bewust, zodat het zichtbaar blijft tot het is opgelost.
 */
const BEKEND = /^JavaScript-blok, niet uitgevoerd$/;
function zoekNederlands(html) {
  const tekst = html
    .replace(/<annotation[\s\S]*?<\/annotation>/g, " ")
    .replace(/<span class="katex-mathml">[\s\S]*?<\/span><span class="katex-html"/g, '<span class="katex-html"')
    .replace(/<code>[\s\S]*?<\/code>/g, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ");
  const regels = tekst.split("\n").map((r) => r.trim()).filter((r) => /\p{L}{2}/u.test(r));
  const NL = /\b(?:het|een|van|bij|met|voor|uit|naar|niet|geen|alleen|maar|ook|dan|wordt|worden|staat|staan|veld|balk|balken|ligger|steunpunt|oplegging|opleggingen|overstek|doorbuiging|buiging|afschuiving|oplegdruk|kip|trilling|trillingen|raveelbalk|wisselbalk|sparing|onderslag|balklaag|veranderlijk|voldoet|voldoen|toets|toetsing|invoer|hoogte|breedte|lengte|lasten|puntlast|belasting|belastingen|belastinggeval|combinatie|combinaties|omhullende|maatgevend|maatgevende|eigen|gewicht|kruip|eindstand|bijkomend|momentaan|grootste|kleinste|zakking|dwarskracht|staal|hout|profiel|materiaal|doorsnede|klasse|tabel|formule|samenvatting|aangenomen|nader|onderzoek)\b/i;
  // Een functienaam in een formule is code, en de melding van de kern bij een @js-blok
  // staat hieronder apart.
  return [...new Set(regels.filter((r) => NL.test(r.replace(/\b[\p{L}_]+\(/gu, " ")) && !BEKEND.test(r)))];
}
const PROJECT = { CC: 2, K_FI: 1, rekenwijze: 0, DesignLife: 50, RC: 2 };
const BALKLAAG_GEVALLEN = [
  { schema: "1" }, { schema: "2", a_over: "900" }, { schema: "3", L_veld2: "3000", a_steun: "90" },
  { schema: "4", b_sparing: "2400", l_staart: "1800" }, { schema: "4", b_sparing: "2400", l_staart: "1200", l_sparing: "2400" },
  { schema: "1", ligger: "2", b_ond: "2.5" }, { schema: "1", doorsnede: "2", plaat: "4", t_vloer: "22" },
  { schema: "1", doorsnede: "2", plaat: "1" }, { schema: "3", L_veld2: "3000", doorsnede: "2", plaat: "4", t_vloer: "22" },
  { schema: "1", controleer: "0", controleer_trilling: "0" }, { schema: "1", L_d: "9000" },
];
const BALKLAAG_BASIS = {
  profiel: "12", sterkteklasse: "2", klimaat: "1", duurklasse: "2", ligger: "1", doorsnede: "1",
  L_d: "5000", a_opl: "50", hoh: "600", t_vloer: "18", E_beschot: "7000", b_vloer: "3",
  G_k: "1.0", Q_k: "1.75", F_k: "2", belastingcat: "2", controleer: "1", grensfactor: "0.004", grens_bij: "0.003",
  controleer_trilling: "1", "ζ": "0.01", a_tril: "1", b_tril: "120", g_bl: "0", a_steun: "0", n_w: "2", klasse_w: "0", l_sparing: "0",
};
const LIGGER_GEVALLEN = [
  {}, { materiaal: "2" }, { systeem: "2" }, { systeem: "3" }, { systeem: "4" }, { materiaal: "2", systeem: "2" },
];
{
  const gevonden = new Map();
  for (const invoer of BALKLAAG_GEVALLEN) {
    const u = bronVoorUitvoer(MODULES[0].bron, "en");
    const html = render(evaluate(parse(u.bron), { ...BALKLAAG_BASIS, ...invoer }, PROJECT), { namen: u.namen });
    for (const r of zoekNederlands(html)) if (!gevonden.has(r)) gevonden.set(r, JSON.stringify(invoer));
  }
  meld(gevonden.size === 0, `balklaag: ${BALKLAAG_GEVALLEN.length} gevallen, geen Nederlandse woorden`,
    [...gevonden].map(([r, g]) => `${r}   (${g})`).join("\n         "));

  const lig = new Map();
  for (const invoer of LIGGER_GEVALLEN) {
    const u = bronVoorUitvoer(MODULES[1].bron, "en");
    const html = render(evaluate(parse(u.bron), invoer, PROJECT), { namen: u.namen });
    for (const r of zoekNederlands(html)) if (!lig.has(r)) lig.set(r, JSON.stringify(invoer));
  }
  meld(lig.size === 0, `ligger: ${LIGGER_GEVALLEN.length} gevallen, geen Nederlandse woorden`,
    [...lig].map(([r, g]) => `${r}   (${g})`).join("\n         "));

  const u = bronVoorUitvoer(MODULES[2].bron, "en");
  const demo = zoekNederlands(render(evaluate(parse(u.bron), {}, PROJECT), { namen: u.namen }));
  meld(demo.length === 0, "demoblad: geen Nederlandse woorden", demo.join("\n         "));

  // De tweepaalspoer in al zijn takken: voldoet, voldoet niet, niet getoetst, ongeldig, buiten het blad.
  const POER = {
    l_poer: "2100", b_poer: "580", h_poer: "900", a_hoh: "1400", e_p: "50", t_in: "50",
    paalvorm: "1", p_x: "350", p_y: "350", kolomvorm: "1", c_x: "400", c_y: "400",
    betonklasse: "30", betonstaal: "2", milieu: "2", ondergrond: "1", d_g: "16", c_o: "60", c_z: "40",
    n_t: "6", d_t: "25", s_t: "70", lagen: "1", vorm_t: "2", l_op: "600", D_m: "125",
    d_s: "12", s_s: "100", n_s: "4", n_z: "5", d_z: "12", n_b: "3", d_b: "12", n_hp: "2", d_hp: "12", n_dw: "3", d_dw: "16",
    F_Ed: "1800", F_fr: "1200", dwars: "1",
  };
  const POER_GEVALLEN = [
    {}, { dwars: "0" }, { e_p: "0" }, { n_t: "2" }, { vorm_t: "1" }, { h_poer: "1100" }, { paalvorm: "2", kolomvorm: "2", p_x: "400", c_x: "450" },
    { F_Ed: "0" }, { l_poer: "1000" }, { n_s: "1" }, { l_op: "0" }, { h_poer: "80" }, { F_fr: "1900" },
    { betonstaal: "1" }, { d_t: "40" }, { a_hoh: "1650", l_poer: "2400" }, { c_x: "1000" }, { n_hp: "0" },
  ];
  const poer = new Map();
  const v = bronVoorUitvoer(MODULES[3].bron, "en");
  for (const invoer of POER_GEVALLEN) {
    const html = render(evaluate(parse(v.bron), { ...POER, ...invoer }, PROJECT), { namen: v.namen });
    for (const r of zoekNederlands(html)) if (!poer.has(r)) poer.set(r, JSON.stringify(invoer));
  }
  meld(poer.size === 0, `tweepaalspoer: ${POER_GEVALLEN.length} gevallen, geen Nederlandse woorden`,
    [...poer].map(([r, g]) => `${r}   (${g})`).join("\n         "));
  const rPoer = leesResultaat(evaluate(parse(v.bron), POER, PROJECT), "x");
  meld(rPoer.voldoet === true && rPoer.uc !== null && /Two-pile cap/.test(rPoer.titel), "tweepaalspoer: de slotregel en de kop in het Engels", JSON.stringify(rPoer));
  const rNiet = leesResultaat(evaluate(parse(v.bron), { ...POER, dwars: "0" }, PROJECT), "x");
  meld(rNiet.nietGetoetst === true && rNiet.voldoet === null && rNiet.uc === null, "tweepaalspoer: 'niet getoetst' in het Engels", JSON.stringify(rNiet));
  const rFout = leesResultaat(evaluate(parse(v.bron), { ...POER, n_t: "2" }, PROJECT), "x");
  meld(rFout.voldoet === false, "tweepaalspoer: 'voldoet niet' in het Engels", JSON.stringify(rFout));

  // Spanningen in een doorsnede: elke vorm, zonder en met grenswaarde, en de meldingen.
  const LAST = { N_x: "-200", M_y: "100", M_z: "10", V_y: "10", V_z: "80", f_y: "0" };
  const DOORSNEDE_GEVALLEN = [
    { vorm: "1", profiel: "24" }, { vorm: "1", profiel: "0", h: "300", b: "150", t_w: "7", t_f: "11", r: "15" },
    { vorm: "2", b: "100", h: "200" }, { vorm: "3", D: "100" }, { vorm: "4", D: "100", t: "10" },
    { vorm: "5", b: "100", h: "200", t_w: "5", t_f: "8" }, { vorm: "6", b: "150", h: "200", t_w: "10", t_f: "15" }, { vorm: "7", b: "100", h: "200", t_w: "8", t_f: "12" },
    { vorm: "2", b: "100", h: "200", f_y: "235" }, { vorm: "2", b: "1000", h: "1000", f_y: "235" }, { vorm: "2", b: "100", h: "200", M_y: "0", M_z: "0" },
    { vorm: "2", b: "1000", h: "1000", N_x: "5000" }, { vorm: "2", b: "1000", h: "1000", N_x: "-5000" },
    { vorm: "1", profiel: "0", h: "0", b: "150", t_w: "7", t_f: "11", r: "15" }, { vorm: "2", b: "0", h: "200" }, { vorm: "3", D: "0" }, { vorm: "4", D: "100", t: "60" },
    { vorm: "5", b: "100", h: "200", t_w: "60", t_f: "8" }, { vorm: "6", b: "150", h: "200", t_w: "10", t_f: "200" }, { vorm: "7", b: "100", h: "200", t_w: "8", t_f: "120" },
    { vorm: "2", b: "100", h: "200", f_y: "-1" },
  ];
  const ds = new Map();
  const vd = bronVoorUitvoer(MODULES[4].bron, "en");
  for (const invoer of DOORSNEDE_GEVALLEN) {
    const html = render(evaluate(parse(vd.bron), { ...LAST, ...invoer }, PROJECT), { namen: vd.namen });
    for (const r of zoekNederlands(html)) if (!ds.has(r)) ds.set(r, JSON.stringify(invoer));
  }
  meld(ds.size === 0, `doorsnede: ${DOORSNEDE_GEVALLEN.length} gevallen, geen Nederlandse woorden`,
    [...ds].map(([r, g]) => `${r}   (${g})`).join("\n         "));
}

// ── 4. De uitkomsten ──────────────────────────────────────────────────────
console.log("\n4. In beide talen dezelfde uitkomsten");
{
  for (const invoer of BALKLAAG_GEVALLEN) {
    const waarden = { ...BALKLAAG_BASIS, ...invoer };
    const nl = evaluate(parse(MODULES[0].bron), waarden, PROJECT);
    const u = bronVoorUitvoer(MODULES[0].bron, "en");
    const en = evaluate(parse(u.bron), waarden, PROJECT);
    const a = leesGetallen(nl), b = leesGetallen(en);
    const rNl = leesResultaat(nl, "x"), rEn = leesResultaat(en, "x");
    const verschil = Object.keys({ ...a, ...b }).filter((k) => a[k] !== b[k]);
    meld(verschil.length === 0, `${JSON.stringify(invoer)}: dezelfde getallen`, verschil.join(", "));
    meld(rNl.uc === rEn.uc && rNl.voldoet === rEn.voldoet && rEn.voldoet !== null, `  en hetzelfde oordeel (${rEn.voldoet})`, `${rNl.voldoet} tegen ${rEn.voldoet}`);
  }
  const u = bronVoorUitvoer(MODULES[0].bron, "en");
  const r = leesResultaat(evaluate(parse(u.bron), { ...BALKLAAG_BASIS, schema: "1" }, PROJECT), "x");
  meld(/Timber joist floor/.test(r.titel) && /EN 1995/.test(r.norm), "de kop van het blad in het Engels", `${r.titel} / ${r.norm}`);
  // De namen in beeld, de naam in de code gelijk.
  const html = render(evaluate(parse(u.bron), { ...BALKLAAG_BASIS, schema: "4", b_sparing: "2400", l_staart: "1800" }, PROJECT), { namen: u.namen });
  meld(/data-prompt="b_sparing"/.test(html) && />b_opening =<\/label>/.test(html), "een invoerveld: b_opening in beeld, b_sparing als sleutel");
  meld(!/>b_sparing =<\/label>/.test(html), "b_sparing staat nergens in beeld");
  meld(/\\text\{opening\}/.test(html) || /opening/.test(html), "de naam in een formule");
  // De Nederlandse uitvoer blijft precies wat hij was.
  const zelfde = bronVoorUitvoer(MODULES[0].bron, "nl");
  meld(zelfde.bron === MODULES[0].bron && zelfde.namen === undefined, "in het Nederlands verandert er niets aan de bron");
}

// ── 5. Het 3D-document ────────────────────────────────────────────────────
console.log("\n5. De namen in het IFCX-document");
{
  const u = bronVoorUitvoer(MODULES[0].bron, "en");
  const nodes = evaluate(parse(u.bron), { ...BALKLAAG_BASIS, schema: "4", b_sparing: "2400", l_staart: "1200", l_sparing: "2400" }, PROJECT);
  const vlak = (l) => l.flatMap((n) => (n.type === "conditional-branch" ? vlak(n.children) : [n]));
  const blok = vlak(nodes).find((n) => n.type === "ifcx");
  const namen = leesIfcx(blok.document).elementen.map((e) => e.naam);
  const nl = namen.filter((n) => /balk|oplegging|beschot|plaat|staart|raveel|wissel/i.test(n));
  meld(nl.length === 0, `Engelse elementnamen (${namen.length})`, nl.join(", "));
  meld(namen.some((n) => /Trimmer/.test(n)) && namen.some((n) => /Trimming joist/.test(n)) && namen.some((n) => /Tail joist/.test(n)), "trimmer, trimming joist, tail joist", namen.join(", "));
  const nlNodes = evaluate(parse(MODULES[0].bron), { ...BALKLAAG_BASIS, schema: "1" }, PROJECT);
  const nlBlok = vlak(nlNodes).find((n) => n.type === "ifcx");
  meld(leesIfcx(nlBlok.document).elementen.some((e) => /^Balk 1$/.test(e.naam)), "in het Nederlands Balk 1");
}

// ── 6. Meertalige slotregel in leesResultaat ──────────────────────────────
console.log("\n6. Meertalige slotregel in leesResultaat");
{
  const testSlot = (tekst) => leesResultaat([{ type: "text", text: tekst }], "test");
  const rNlPass = testSlot("Maatgevende UC = 0.85 → voldoet");
  meld(rNlPass.uc === 0.85 && rNlPass.voldoet === true, "Nederlands: Maatgevende UC = 0.85 → voldoet");
  const rEnPass = testSlot("Governing UC = 0.85 → OK");
  meld(rEnPass.uc === 0.85 && rEnPass.voldoet === true, "Engels: Governing UC = 0.85 → OK");
  const rZhPass = testSlot("控制 UC = 0.85 → 合格");
  meld(rZhPass.uc === 0.85 && rZhPass.voldoet === true, "Traditioneel Chinees: 控制 UC = 0.85 → 合格");
  const rZhFail = testSlot("控制 UC = 1.15 → 不合格");
  meld(rZhFail.uc === 1.15 && rZhFail.voldoet === false, "Traditioneel Chinees: 不合格 wordt niet als voldoet gezien");
  const rZhGeen = testSlot("總結：未檢核");
  meld(rZhGeen.nietGetoetst === true && rZhGeen.voldoet === null, "Traditioneel Chinees: 總結：未檢核");
}

console.log(fouten === 0 ? "\nUitvoer in de taal van de app: alles in orde." : `\n${fouten} controle(s) gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
