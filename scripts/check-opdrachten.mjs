/**
 * Wachtpost bij wat het lint aanbiedt: invoervelden met een standaardwaarde,
 * de afdrukopdrachten en een reeks kleinere fouten in de rekenkern.
 *
 *   1. Standaardwaarde van een invoerveld, zoals in de rekentaal: `L = ?{5000}mm`,
 *      `F_k = ?{3} kN`, `a = ? {2}`, `q = ?{2.5}*(kN/m)`. Zonder invoer van de
 *      gebruiker rekent het veld met de standaardwaarde en toont het hem; wat
 *      de gebruiker typt, wint. Een leeggemaakt veld rekent met de
 *      standaardwaarde en toont hem als placeholder. Zonder `{…}` blijft het 0.
 *   2. Afdrukopdrachten: `#deg`, `#rad`, `#gra` (voor de rest van het blad,
 *      daarna weer de stand van de app), `#val`, `#equ`, `#noc`, `#nosub`,
 *      `#novar`, `#varsub`, `#pre`, `#post`, `#round n` en `:F0`…`:F3`
 *      achter een uitdrukking.
 *   3. Kleinere fouten: `@img(detail.png)` bleef niet heel, `x in kN*m` las
 *      `2 in` als inch, `round()` van een grootheid met eenheid gaf een fout,
 *      een `;` in een tekenreeks werd `,`, een tekstconstante werd "NaN" in de
 *      formule, de hulpfuncties `__solver_N` kwamen in beeld, en een waarde in
 *      de toelichting achter een formule viel terug op losse tekst.
 *
 * Draaien:  node scripts/check-opdrachten.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { parse, evaluate, render, setAngleMode, nameToLatex } from "../packages/core/dist/index.js";

let fouten = 0;
let getest = 0;
const meld = (ok, wat, detail = "") => {
  getest++;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || detail === "" ? "" : "  -> " + detail}`);
};
const kop = (t) => console.log(`\n${t}`);

/** Alle knopen, ook die binnen een #if-tak. */
function plat(nodes) {
  const uit = [];
  const loop = (lijst) => {
    for (const n of lijst) {
      uit.push(n);
      if (Array.isArray(n.children)) loop(n.children);
    }
  };
  loop(nodes);
  return uit;
}

const ontsnap = (s) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, "&");

/** De LaTeX van elke formuleregel, in volgorde. */
const latexVan = (html) =>
  [...html.matchAll(/<annotation encoding="application\/x-tex">([\s\S]*?)<\/annotation>/g)].map((m) => ontsnap(m[1]));

/** De tekst van de alinea's in de uitwerking (zonder de formules). */
const tekstVan = (html) =>
  [...html.matchAll(/<p\b[^>]*>([\s\S]*?)<\/p>/g)]
    .map((m) => ontsnap(m[1].replace(/<[^>]+>/g, " ")))
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();

function reken(bron, waarden = {}, opties = {}) {
  const nodes = evaluate(parse(bron, opties.parse ?? {}), waarden, opties.scope);
  const html = render(nodes);
  const knopen = plat(nodes);
  const op = (naam) => knopen.find((n) => (n.type === "assignment" || n.type === "var-display") && n.name === naam);
  const veld = (naam) => knopen.find((n) => n.type === "input-prompt" && n.name === naam);
  /** De LaTeX van de regel van `naam` (de eerste die met `naam =` begint). */
  const regel = (naam) => latexVan(html).find((l) => l.startsWith(`${nameToLatex(naam)} =`)) ?? "";
  return { nodes, knopen, html, op, veld, regel, tekst: tekstVan(html) };
}

const getal = (n) => (n && typeof n.waarde === "number" ? n.waarde : Number.NaN);
const gelijk = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

// ─── 1. Standaardwaarde van een invoerveld ──────────────────────────────────
kop("1. Invoerveld met een standaardwaarde");
const bladInvoer = `L = ?{5000}mm
F_k = ?{3} kN
a = ? {2}
q = ?{2.5}*(kN/m)
b = ? mm
c = ?
e = ?{0,5}
L_2 = ?{4.2}m', overspanning'
A = L*2
F_d = 1.5*F_k
M = q*(L_2)^2/8 to kN*m
s = a + c + e`;
{
  const r = reken(bladInvoer);
  meld(gelijk(getal(r.op("A")), 10000) && r.op("A")?.unit === "mm", "L = ?{5000}mm rekent met 5000 mm (A = 2·L = 10000 mm)", r.op("A")?.result);
  meld(gelijk(getal(r.op("F_d")), 4.5) && r.op("F_d")?.unit === "kN", "F_k = ?{3} kN rekent met 3 kN", r.op("F_d")?.result);
  meld(gelijk(getal(r.op("s")), 2.5), "a = ? {2}, c = ? en e = ?{0,5}: 2 + 0 + 0,5", r.op("s")?.result);
  meld(gelijk(getal(r.op("M")), 2.5 * 4.2 * 4.2 / 8), "q = ?{2.5}*(kN/m) en L_2 = ?{4.2}m', toelichting'", r.op("M")?.result);
  const verwacht = { L: ["5000", "mm"], F_k: ["3", "kN"], a: ["2", ""], q: ["2.5", "kN/m"], b: ["0", "mm"], c: ["0", ""], e: ["0,5", ""], L_2: ["4.2", "m"] };
  for (const [naam, [waarde, eenheid]] of Object.entries(verwacht)) {
    const v = r.veld(naam);
    meld(v?.currentValue === waarde && v?.unit === eenheid, `veld ${naam} toont "${waarde}" met eenheid "${eenheid}"`, JSON.stringify(v));
  }
  meld(/data-prompt="L"\s+value="5000"/.test(r.html), "het invoerveld in de uitwerking heeft value=\"5000\"", r.html.match(/<input[^>]*data-prompt="L"[^>]*>/)?.[0]);
  meld(/calc-input-prompt[\s\S]*?data-prompt="L_2"[\s\S]*?calc-comment[^>]*>, overspanning/.test(r.html), "de toelichting staat naast het veld", "");
}
{
  const r = reken(bladInvoer, { L: "6000" });
  meld(gelijk(getal(r.op("A")), 12000) && r.veld("L")?.currentValue === "6000", "wat de gebruiker typt, wint (6000 → A = 12000 mm)", r.op("A")?.result);
}
{
  const r = reken(bladInvoer, { L: "", b: "" });
  meld(gelijk(getal(r.op("A")), 10000), "een leeggemaakt veld rekent met de standaardwaarde", r.op("A")?.result);
  meld(r.veld("L")?.currentValue === "" && /data-prompt="L"[^>]*placeholder="5000"/.test(r.html), "een leeg veld blijft leeg en toont de standaardwaarde als placeholder", r.html.match(/<input[^>]*data-prompt="L"[^>]*>/)?.[0]);
  const b = r.knopen.find((n) => n.type === "input-prompt" && n.name === "b");
  meld(b?.currentValue === "", "een leeg veld zonder standaardwaarde blijft leeg (rekent als 0)", JSON.stringify(b));
}
{
  const r = reken("a = ?{2}', 'b = ?{3}\nc = a*b");
  meld(gelijk(getal(r.op("c")), 6), "twee velden op één regel (a = ?{2}', 'b = ?{3})", r.op("c")?.result);
}

// ─── 2. Afdrukopdrachten ───────────────────────────────────────────────────
kop("2a. #deg, #rad, #gra: voor de rest van het blad, daarna de stand van de app");
{
  setAngleMode("rad");
  const r = reken("#deg\ns_1 = sin(30)\nt_1 = atan2(1; 1)\nk_1 = cot(45)\n#rad\ns_2 = sin(pi/6)\n#gra\ns_3 = sin(100)\n#Deg\nc_1 = acos(0.5)");
  meld(gelijk(getal(r.op("s_1")), 0.5), "#deg: sin(30) = 0,5", r.op("s_1")?.result);
  meld(gelijk(getal(r.op("t_1")), 45), "#deg: atan2(1; 1) = 45", r.op("t_1")?.result);
  meld(gelijk(getal(r.op("k_1")), 1), "#deg: cot(45) = 1", r.op("k_1")?.result);
  meld(gelijk(getal(r.op("s_2")), 0.5), "#rad: sin(π/6) = 0,5", r.op("s_2")?.result);
  meld(gelijk(getal(r.op("s_3")), 1), "#gra: sin(100) = 1", r.op("s_3")?.result);
  meld(gelijk(getal(r.op("c_1")), 60), "#Deg (hoofdletter): acos(0,5) = 60", r.op("c_1")?.result);
  const na = reken("s = sin(pi/2)");
  meld(gelijk(getal(na.op("s")), 1), "het volgende blad rekent weer in de stand van de app (rad)", na.op("s")?.result);
  setAngleMode("deg");
  const graden = reken("#rad\nx = sin(pi/2)");
  const weer = reken("y = sin(30)");
  meld(gelijk(getal(graden.op("x")), 1) && gelijk(getal(weer.op("y")), 0.5), "app op graden: #rad geldt alleen in dat blad", `${graden.op("x")?.result}, ${weer.op("y")?.result}`);
}

kop("2b. #val, #equ, #noc, #nosub, #novar, #varsub");
{
  const r = reken(`a = 2
b = 3
c_0 = a + b
#val
d = a*b
#noc
e = a - b
#equ
f = e*2
#nosub
g = a + b
#novar
h = a + b
#varsub
i = a + b`);
  const t = (naam) => r.regel(naam);
  meld(t("c_0").includes("a + b") && t("c_0").includes("2 + 3") && t("c_0").includes("{5}"), "standaard: formule, invulling en uitkomst", t("c_0"));
  meld(!t("d").includes("\\cdot") && t("d").includes("{6}"), "#val: alleen de uitkomst", t("d"));
  meld(t("e").includes("a - b") && !t("e").includes("-1"), "#noc: alleen de formule, geen uitkomst", t("e"));
  meld(gelijk(getal(r.op("f")), -2) && t("f").includes("e \\cdot 2") && t("f").includes("-1 \\cdot 2"), "#equ: weer alles, en #noc rekende wel door (f = 2·e = −2)", t("f"));
  meld(t("g").includes("a + b") && !t("g").includes("2 + 3") && t("g").includes("{5}"), "#nosub: formule en uitkomst, geen invulling", t("g"));
  meld(!t("h").includes("a + b") && t("h").includes("2 + 3") && t("h").includes("{5}"), "#novar: invulling en uitkomst, zonder variabelen", t("h"));
  meld(t("i").includes("a + b") && t("i").includes("2 + 3"), "#varsub: weer formule en invulling", t("i"));
}

kop("2c. #pre en #post (en #hide)");
{
  const r = reken(`'Altijd zichtbaar
#pre
'Alleen bij de invoer
x = ? {3}
#post
'In de uitwerking
#hide
'Verborgen
#post
'Weer zichtbaar
#pre
'Weer alleen invoer
#show
'Gewoon`);
  const regelVan = (tekst) => r.html.split("\n").find((l) => l.includes(tekst)) ?? "";
  meld(!regelVan("Altijd zichtbaar").includes("alleen-scherm"), "tekst vóór #pre is gewoon", regelVan("Altijd zichtbaar"));
  meld(regelVan("Alleen bij de invoer").includes("alleen-scherm"), "#pre: alleen op het scherm, niet op papier", regelVan("Alleen bij de invoer"));
  meld(/<div class="calc-input-prompt alleen-scherm"/.test(r.html), "#pre: ook het invoerveld", "");
  meld(regelVan("In de uitwerking") !== "" && !regelVan("In de uitwerking").includes("alleen-scherm"), "#post: in de uitwerking en op papier", regelVan("In de uitwerking"));
  meld(!r.html.includes("Verborgen") && regelVan("Weer zichtbaar") !== "", "#hide … #post: verborgen en daarna weer zichtbaar", "");
  meld(regelVan("Weer alleen invoer").includes("alleen-scherm") && !regelVan("Gewoon").includes("alleen-scherm"), "#show beëindigt #pre", regelVan("Gewoon"));
}

kop("2d. Decimalen: :F0 … :F3 en #round n");
{
  const r = reken(`x = 3.14159:F2
y = 2:F3
z = 2.71828 m:F1
n = 1234.5:F0
p = 1.005:F2
x:F1
'Tekst 'x:F3' mm
#round 1
r_1 = 2.345678
r_2 = 1234.5678 mm
'Ingevoegd 'r_1*1'
r_3 = r_1 + 1
#round 3
r_4 = 1/3
#round default
r_5 = 1/3`);
  const t = (naam) => r.regel(naam);
  meld(t("x").includes("{3.14}") && r.op("x")?.result === "3.142", ":F2 toont 3.14 (de uitkomst zelf blijft 3.142)", `${t("x")} | ${r.op("x")?.result}`);
  meld(t("y").includes("{2.000}"), ":F3 toont 2.000", t("y"));
  meld(t("z").includes("{2.7 \\; \\mathrm{m}}"), ":F1 met eenheid: 2.7 m", t("z"));
  meld(t("n").includes("{1235}"), ":F0 rondt af op een geheel getal", t("n"));
  meld(t("p").includes("{1.01}"), ":F2 rondt 1,005 af op 1.01", t("p"));
  meld(latexVan(r.html).some((l) => l === "x = 3.1"), "x:F1 als losse weergave: 3.1", latexVan(r.html).filter((l) => l.startsWith("x =")).join(" | "));
  meld(r.tekst.includes("Tekst 3.142 mm"), "ingevoegd in tekst: 'x:F3' → 3.142", r.tekst.slice(0, 200));
  meld(t("r_1").includes("{2.3}") && t("r_2").includes("{1234.6 \\; \\mathrm{mm}}"), "#round 1: 2.3 en 1234.6 mm", `${t("r_1")} | ${t("r_2")}`);
  meld(r.tekst.includes("Ingevoegd 2.3"), "#round 1 geldt ook voor een waarde in tekst", r.tekst);
  meld(gelijk(getal(r.op("r_3")), 3.345678), "#round verandert alleen de weergave, niet het rekenen", r.op("r_3")?.result);
  meld(t("r_4").includes("{0.333}") && t("r_5").includes("{0.3333}"), "#round 3 en #round default", `${t("r_4")} | ${t("r_5")}`);
}

// ─── 3. Kleinere fouten ────────────────────────────────────────────────────
kop("3a. @img: een gewone bestandsnaam, URL of data-URL blijft heel");
{
  const data = "data:image/png;base64,iVBORw0KGgo=";
  const r = reken(`@img(detail.png)\n@img(https://example.com/img/a.png)\n@img(${data})\n@img(./Images/Picture0.png)`, {}, {
    parse: { imageUrls: new Map([["Picture0.png", "/assets/p0.png"]]) },
  });
  const src = r.knopen.filter((n) => n.type === "image").map((n) => n.src);
  meld(src[0] === "detail.png", "@img(detail.png)", src[0]);
  meld(src[1] === "https://example.com/img/a.png", "@img(https://…/a.png)", src[1]);
  meld(src[2] === data, "@img(data:…)", src[2]);
  meld(src[3] === "/assets/p0.png", "een bekende afbeelding volgt de tabel met adressen", src[3]);
}

kop("3b. Omrekenen met to, | en in; in is ook de inch");
{
  const r = reken(`F = 10 kN
a = 2 m
x_1 = F*a/2 in kN*m
x_2 = F*a/2|kN*m
x_3 = F*a/2 to kN*m
x_4 = F*a/2 in N*mm
w = 3 in
w_mm = w to mm
'M = 'F*a/2 in kN*m' kNm
x_1|N*m`);
  for (const naam of ["x_1", "x_2", "x_3"]) {
    meld(gelijk(getal(r.op(naam)), 10) && r.op(naam)?.unit === "kN m", `${naam}: F·a/2 omgerekend naar kN·m = 10`, r.op(naam)?.result);
  }
  meld(gelijk(getal(r.op("x_4")), 1e7) && r.op("x_4")?.unit === "N mm", "in N*mm: 10⁷ N·mm", r.op("x_4")?.result);
  meld(gelijk(getal(r.op("w")), 3, 1e-9) && r.op("w")?.unit === "in" && gelijk(getal(r.op("w_mm")), 76.2), "w = 3 in blijft 3 inch (76,2 mm)", `${r.op("w")?.result}, ${r.op("w_mm")?.result}`);
  meld(r.tekst.includes("M = 10 kNm"), "omrekenen in een ingevoegde waarde", r.tekst);
  const vd = r.knopen.find((n) => n.type === "var-display" && n.name === "x_1");
  meld(vd && gelijk(getal(vd), 10000) && vd.unit === "N m", "losse weergave met omrekening: x_1|N*m = 10000 N·m", JSON.stringify(vd));
}

kop("3c. round() van een grootheid met eenheid: afronden in de getoonde eenheid");
{
  const r = reken(`L = 1234.5678 mm
r_1 = round(L; 1)
r_2 = round(L)
M = 12.3456 kN*m
r_3 = round(M; 2)
r_4 = round(2.345; 2)
r_5 = round(L/(1 mm); 2)`);
  meld(gelijk(getal(r.op("r_1")), 1234.6) && r.op("r_1")?.unit === "mm", "round(L; 1) = 1234.6 mm", r.op("r_1")?.result);
  meld(gelijk(getal(r.op("r_2")), 1235) && r.op("r_2")?.unit === "mm", "round(L) = 1235 mm", r.op("r_2")?.result);
  meld(gelijk(getal(r.op("r_3")), 12.35) && r.op("r_3")?.unit === "kN m", "round(M; 2) = 12.35 kN·m", r.op("r_3")?.result);
  meld(gelijk(getal(r.op("r_4")), 2.35) && gelijk(getal(r.op("r_5")), 1234.57), "round van een getal blijft gelijk", `${r.op("r_4")?.result}, ${r.op("r_5")?.result}`);
}

kop("3d. Tekenreeksen in een formule");
{
  const r = reken(`s = concat("a;b"; "c")
u = "cd"
n = 3
t = concat("ab"; u)
k = concat("n = "; string(n))`);
  meld(r.op("s")?.result === "a;bc", "een ; binnen een tekenreeks blijft een ;", r.op("s")?.result);
  meld(r.op("t")?.result === "abcd" && r.op("k")?.result === "n = 3", "functies met tekst rekenen", `${r.op("t")?.result}, ${r.op("k")?.result}`);
  const tex = latexVan(r.html).join(" | ");
  meld(!tex.includes("NaN") && tex.includes("ab"), "een tekstconstante staat als tekst in de formule, niet als NaN", tex);
}

kop("3e. De hulpfuncties van $Root, $Sup en andere blokken komen nooit in beeld");
{
  const r = reken(`N = 4
f(x) = x^2 - N
w = $Root{f(x) @ x = 0 : N}
m = $Sup{sin(x) @ x = 0 : N}
S = $Sum{k @ k = 1 : N}
g(y) = $Sum{k*y @ k = 1 : 3}
'w is 'w' en de som 'S`);
  meld(gelijk(getal(r.op("w")), 2, 1e-9) && gelijk(getal(r.op("S")), 10), "de blokken rekenen ($Root = 2, $Sum = 10)", `${r.op("w")?.result}, ${r.op("S")?.result}`);
  meld(!/solver|find_root|find\\_root|extremum|reeks|_cp_/i.test(r.html), "geen __solver_N, _find_root of _cp_ in de uitwerking", (r.html.match(/.{40}(solver|find_root|find\\_root|extremum|reeks|_cp_).{40}/i) ?? [""])[0]);
  const tex = latexVan(r.html);
  meld(tex.some((l) => l.startsWith("w =") && l.includes("Root")), "$Root staat als Root{…} in de formule", tex.filter((l) => l.startsWith("w =")).join(" | "));
  meld(tex.some((l) => l.startsWith("S =") && l.includes("\\sum")), "$Sum staat als ∑ in de formule", tex.filter((l) => l.startsWith("S =")).join(" | "));
  meld(r.tekst.includes("w is 2 en de som 10"), "ingevoegd in tekst", r.tekst.slice(-80));
}

kop("3f. Een waarde in de toelichting achter een formule");
{
  const r = reken("a = 2', waarde 'a*3' mm'\nb = 5', zie 'onbekend' hier'");
  const regelA = r.html.split("\n").find((l) => l.includes("calc-comment") && l.includes("waarde")) ?? "";
  // Het ingevulde getal staat in een calc-waarde, voor de komma op papier (decimaalteken.ts).
  meld(/<span class="calc-comment">, waarde <span class="calc-waarde">6<\/span> mm<\/span><\/div>/.test(regelA), "x = …', tekst 'expr' tekst' toont de waarde naast de formule", regelA.slice(-120));
  meld(!/<p class="calc-text">a\*3<\/p>/.test(r.html), "de expressie valt niet terug op een losse alinea", "");
  meld(/calc-comment">, zie onbekend hier</.test(r.html), "een expressie die niet rekent, blijft als tekst in de toelichting", (r.html.match(/calc-comment">[^<]*/g) ?? []).join(" | "));
}

console.log(
  fouten === 0
    ? `\nOpdrachten: alles klopt (${getest} controles).`
    : `\nOpdrachten: ${fouten} van ${getest} controles wijken af.`,
);
process.exit(fouten === 0 ? 0 : 1);
