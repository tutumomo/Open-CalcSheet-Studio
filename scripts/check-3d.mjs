/**
 * Controle van het 3D-blok (`@3d … @end`) in de rekenkern.
 *
 * Een `@3d`-blok beschrijft een ruimtelijk beeld, één element per regel, met
 * maten als getal of als `{{…}}` uit het blad (packages/core/src/drieD.ts).
 * De renderer schrijft `<div class="calc-3d" data-scene="…">` met de scène als
 * JSON en een stilstaande projectie als SVG; de app tekent er een draaibaar
 * beeld van. Dit script bewaakt:
 *   1. inlezen: elementen, instellingen, #for en #if in het blok;
 *   2. invulling: {{naam}} en {{formule}} met eenheden, omgerekend naar de
 *      eenheid van de scène (mm of m), een lengte als getal in de scène;
 *   3. de uitvoer: data-scene is geldige JSON gelijk aan de scène, de
 *      projectie heeft alleen getallen in zijn attributen;
 *   4. foutafhandeling: een onbekende regel, een maat te weinig, een
 *      onbekende naam of een blok zonder @end geeft een duidelijke melding in
 *      de uitwerking; de rest van het beeld en van het blad staat er gewoon.
 *
 * Draaien:  node scripts/check-3d.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { parse, evaluate, render } from "../packages/core/dist/index.js";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};

/** Parse, reken en render; de 3D-knopen van elke stap en de html. */
function doorreken(bron, waarden = {}) {
  const ast = parse(bron);
  const nodes = evaluate(ast, waarden);
  const html = render(nodes);
  const vlak = (lijst) => lijst.flatMap((n) => (n.type === "conditional-branch" ? vlak(n.children) : [n]));
  return {
    ast: ast.filter((n) => n.type === "3d"),
    drieD: vlak(nodes).filter((n) => n.type === "3d"),
    html,
  };
}

const ontsnap = (s) => s.replace(/&quot;/g, '"').replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const dichtbij = (a, b) => Math.abs(a - b) < 1e-6;

// ── 1 + 2. Een portaal: inlezen en invullen ─────────────────────────────────
console.log("\n1. Een portaal met invulling uit het blad");
{
  const bron = `"Portaal
L = 6 m
H = 3 m
h_p = 200 mm
b_p = 100 mm
V_b,0 = 27
n = 4
@3d
eenheid mm
camera iso
hoogte 280
// commentaar telt niet mee
kolom 0 0 0 {{H}} {{b_p}} {{h_p}}
kolom {{L}} 0 0 {{H}} {{b_p}} {{h_p}}
ibalk 0 0 {{H + h_p/2}} {{L}} 0 {{H + h_p/2}} {{b_p}} {{h_p}} 5.6 8.5
balk 0 500 {{H + 0.8 m}} 2.5m 500 {{H + 0.8 m}} 50 100 hout
#for i = 1 : n
balk {{(i - 1)*L/(n - 1)}} -1000 {{H + h_p}} {{(i - 1)*L/(n - 1)}} 1000 {{H + h_p}} 71 196 #8B6F47
#loop
#if n > 10
knoop 0 0 0 50
#else
knoop {{L}} 0 0 50 rood
#end if
lijnlast 0 0 {{H + h_p}} {{L}} 0 {{H + h_p}} 500 7
tekst {{L/2}} 0 {{H + 900}} "L = {{L}} m, it's V_b,0 = {{V_b,0}}"
oplegging 0 0 0 inklemming
oplegging {{L}} 0 0 rol 120
@end
'Na het blok: L = 'L`;
  const { ast, drieD, html } = doorreken(bron);
  meld(ast.length === 1, "de parser maakt één knoop van type '3d'");
  const n = ast[0] ?? { regels: [], instellingen: {}, fouten: [] };
  meld(n.instellingen.eenheid === "mm" && n.instellingen.camera === "iso" && n.instellingen.hoogte === "280",
    "instellingen eenheid, camera en hoogte gelezen", JSON.stringify(n.instellingen));
  meld(n.fouten.length === 0, "geen leesfouten", n.fouten.join(" | "));
  meld(n.regels.some((r) => r.soort === "for") && n.regels.some((r) => r.soort === "if"),
    "#for en #if in het blok worden blokken");

  const ev = drieD[0];
  meld(!!ev && ev.meldingen.length === 0, "doorgerekend zonder meldingen", ev?.meldingen.join(" | "));
  const el = ev?.scene.elementen ?? [];
  const balken = el.filter((e) => e.soort === "balk");
  const kolom2 = balken[1];
  meld(kolom2 && dichtbij(kolom2.van[0], 6000) && dichtbij(kolom2.naar[2], 3000),
    "{{L}} = 6 m wordt 6000 en {{H}} = 3 m wordt 3000 in een scène in mm", JSON.stringify(kolom2));
  const ib = el.find((e) => e.soort === "ibalk");
  meld(ib && dichtbij(ib.van[2], 3100) && ib.tw === 5.6 && ib.tf === 8.5,
    "{{H + h_p/2}} = 3100 (lengtes als getal in de scène), ibalk met tw en tf", JSON.stringify(ib));
  const hout = balken[2];
  meld(hout && dichtbij(hout.van[2], 3800) && dichtbij(hout.naar[0], 2500) && hout.kleur.toLowerCase() === "#e3c08a",
    "{{H + 0.8 m}} = 3800, 2.5m = 2500 en de kleur hout", JSON.stringify(hout));
  const ribben = balken.slice(3);
  meld(ribben.length === 4 && ribben.map((b) => b.van[0]).join(",") === "0,2000,4000,6000",
    "#for i = 1 : n tekent vier ribben op 0, 2000, 4000, 6000", ribben.map((b) => b.van[0]).join(","));
  meld(ribben.every((b) => b.kleur === "#8b6f47"), "een kleur als #rrggbb");
  const knopen = el.filter((e) => e.soort === "knoop");
  meld(knopen.length === 1 && dichtbij(knopen[0].plek[0], 6000) && knopen[0].kleur === "#dc2626",
    "#if n > 10 … #else kiest de else-tak", JSON.stringify(knopen));
  const pijlen = el.filter((e) => e.soort === "pijl");
  meld(pijlen.length === 7 && pijlen.every((p) => dichtbij(p.van[2] - p.naar[2], 500)),
    "lijnlast met n = 7: zeven pijlen van 500 lang omlaag", `${pijlen.length} pijlen`);
  const tekst = el.find((e) => e.soort === "tekst");
  meld(tekst?.tekst === "L = 6 m, it's V_b,0 = 27",
    "tekst: apostrof en komma blijven, {{L}} en {{V_b,0}} ingevuld zonder eenheid", tekst?.tekst);
  const opl = el.filter((e) => e.soort === "oplegging");
  meld(opl.length === 2 && opl[0].type === "inklemming" && opl[1].type === "rol" && opl[1].grootte === 120 && opl[0].grootte > 0,
    "opleggingen met soort en grootte (zonder grootte: naar de scène)", JSON.stringify(opl.map((o) => [o.type, o.grootte])));
  meld(ev?.scene.hoogte === 280 && ev?.scene.camera === "iso" && ev?.scene.raster === true,
    "hoogte, camera en raster in de scène");

  const m = html.match(/<div class="calc-3d" data-scene="([^"]*)">/);
  meld(!!m, "de renderer schrijft <div class=\"calc-3d\" data-scene=\"…\">");
  let scene = null;
  try {
    scene = JSON.parse(ontsnap(m?.[1] ?? ""));
  } catch (e) {
    meld(false, "data-scene is geldige JSON", e.message);
  }
  meld(scene && JSON.stringify(scene) === JSON.stringify(ev.scene), "data-scene is de doorgerekende scène");
  const svg = html.match(/<svg class="calc-3d-terugval"[\s\S]*?<\/svg>/)?.[0] ?? "";
  meld(svg.length > 0 && /<polygon /.test(svg) && /<line /.test(svg) && /<text /.test(svg),
    "stilstaande projectie als SVG met vlakken, lijnen en tekst");
  const attrs = [...svg.matchAll(/\s(x|y|x1|y1|x2|y2|cx|cy|r|points)="([^"]*)"/g)];
  const vreemd = attrs.filter(([, , w]) => !/^[-\d., ]+$/.test(w) || /NaN|Infinity/.test(w));
  meld(attrs.length > 50 && vreemd.length === 0, "de projectie heeft alleen getallen in zijn attributen",
    vreemd.slice(0, 2).map((a) => a[0]).join(" "));
  meld(/<div class="calc-3d-beeld" style="height:280px">/.test(html), "het beeld krijgt de hoogte uit het blok");
  meld(/Na het blok: L = 6/.test(html.replace(/<[^>]+>/g, "")), "het blad gaat na het blok gewoon verder");
}

// ── 2b. Eenheid m ───────────────────────────────────────────────────────────
console.log("\n2. Een scène in meters");
{
  const { drieD } = doorreken(`L = 4500 mm
@3d
eenheid m
balk 0 0 0 {{L}} 0 0 0.1 0.2
staaf 0 0 0 0 0 300cm
@end`);
  const el = drieD[0]?.scene.elementen ?? [];
  meld(dichtbij(el[0]?.naar[0], 4.5), "{{L}} = 4500 mm wordt 4.5 in een scène in m", JSON.stringify(el[0]));
  meld(dichtbij(el[1]?.naar[2], 3), "300cm wordt 3 in een scène in m", JSON.stringify(el[1]));
}

// ── 3. Foutafhandeling ──────────────────────────────────────────────────────
console.log("\n3. Fouten worden meldingen, geen crash");
{
  const bron = `"Fouten
L = 5 m
F = 10 kN
@3d
balk 0 0 0 {{L}} 0 0 100 200
balkk 1 2 3
kolom 0 0 0 1000 100
buis 0 0 0 {{L}} 0 0 {{onbekend}}
pijl 0 0 0 0 0 {{F}}
plaat 0 0 0 abc 100 10
camera schuin
#loop
@end
'Daarna: L = 'L`;
  let uit = null;
  try {
    uit = doorreken(bron);
    meld(true, "parse, evaluate en render gooien niet");
  } catch (e) {
    meld(false, "parse, evaluate en render gooien niet", e.message);
  }
  if (uit) {
    const ev = uit.drieD[0];
    const m = ev?.meldingen ?? [];
    const heeft = (re) => m.some((t) => re.test(t));
    meld(heeft(/regel 2: onbekend element "balkk"/), "onbekend element met regelnummer", m.join(" | "));
    meld(heeft(/regel 3: kolom verwacht 6 maten \(x y z0 z1 b h\), er staan er 5/), "een maat te weinig");
    meld(heeft(/regel 4: \{\{onbekend\}\} is niet uit te rekenen: Undefined symbol onbekend/), "onbekende naam in {{…}}");
    meld(heeft(/regel 5: \{\{F\}\} is geen lengte \(kN\)/), "een kracht als maat: geen lengte");
    meld(heeft(/regel 6: onbekende kleur of optie "abc"; een maat uit het blad schrijf je als \{\{abc\}\}/),
      "een naam zonder accolades: de melding wijst op {{…}}");
    meld(heeft(/regel 7: camera kent iso, voor, boven, zij/), "een onbekende camera");
    meld(heeft(/regel 8: #loop zonder #for/), "een losse #loop");
    meld(ev?.scene.elementen.length === 1 && ev.scene.elementen[0].soort === "balk",
      "de goede regel staat er nog: één balk getekend", JSON.stringify(ev?.scene.elementen.map((e) => e.soort)));
    // De tekst zoals de lezer hem ziet: een ingevuld getal staat in een eigen <span>.
    const tekst = uit.html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
    meld((uit.html.match(/<p class="calc-3d-melding">/g) ?? []).length === m.length && m.length >= 7,
      "elke melding staat in de uitwerking (calc-3d-melding)");
    meld(/onbekend element &quot;balkk&quot;|onbekend element "balkk"/.test(uit.html), "de melding noemt de regel in de uitwerking");
    meld(/Daarna: L = 5/.test(tekst), "de rest van het blad staat er gewoon");
  }

  const zonderEind = doorreken(`@3d
balk 0 0 0 1000 0 0 100 200
'nog een regel`);
  const m2 = zonderEind.drieD[0]?.meldingen ?? [];
  meld(m2.some((t) => /zonder @end/.test(t)), "een blok zonder @end geeft een melding", m2.join(" | "));

  const leeg = doorreken(`@3d
@end`);
  meld(leeg.drieD.length === 1 && /<svg class="calc-3d-terugval"/.test(leeg.html), "een leeg blok geeft een leeg beeld met raster");

  const ifZonderEind = doorreken(`@3d
#if 1
balk 0 0 0 1000 0 0 100 200
@end
'verder`);
  meld((ifZonderEind.drieD[0]?.meldingen ?? []).some((t) => /#if zonder #end if/.test(t)), "#if zonder #end if geeft een melding");
}

// ── 4. Zichtbaarheid en blokken eromheen ────────────────────────────────────
console.log("\n4. #hide, #pre en een blok binnen #if");
{
  const verborgen = doorreken(`#hide
@3d
balk 0 0 0 1000 0 0 100 200
@end
#show
'zichtbaar`);
  meld(verborgen.drieD.length === 0 && !/calc-3d/.test(verborgen.html), "#hide: geen beeld");

  const scherm = doorreken(`#pre
@3d
balk 0 0 0 1000 0 0 100 200
@end`);
  meld(/<div class="calc-3d alleen-scherm"/.test(scherm.html), "#pre: het beeld krijgt de klasse alleen-scherm");

  const inIf = doorreken(`a = 2
#if a > 1
@3d
#if a > 5
balk 0 0 0 1000 0 0 100 200
#else
balk 0 0 0 2000 0 0 100 200
#end if
@end
'binnen
#else
'buiten
#end if
'na`);
  const tekst = inIf.html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, " ");
  meld(inIf.drieD.length === 1 && inIf.drieD[0].scene.elementen[0]?.naar[0] === 2000,
    "een #if in een blok binnen een #if van het blad kiest goed");
  meld(/binnen/.test(tekst) && !/buiten/.test(tekst) && /\bna\b/.test(tekst), "de #if van het blad blijft heel");
}

console.log(fouten === 0 ? "\nAlle 3D-controles groen." : `\n${fouten} 3D-controle(s) gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
