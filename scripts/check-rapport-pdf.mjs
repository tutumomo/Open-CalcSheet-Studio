/**
 * Controle van het overkoepelende rapport, in de PDF zelf.
 *
 * Maakt van een gemengd project (scripts/lib/gemengd-project.mjs) een echte PDF
 * langs dezelfde weg als "Rapport (PDF)" in de app: een eigen dev-server op een
 * vrije poort, een headless browser en scripts/rapport-pdf.mjs. Daarna leest dit
 * script de PDF met pdf.js en rekent het de nummers na:
 *
 *   1. de PDF heeft evenveel pagina's als het voorbeeld vellen, met op elke
 *      pagina dezelfde tekst als op dat vel;
 *   2. elke pagina draagt rechtsonder zijn eigen nummer, ook de pagina's van een
 *      ingevoegde PDF (staand, liggend, A3, A1) en de vellen van een werkmap;
 *   3. de inhoudsopgave noemt elk blad en elke kop die erin hoort, en bij elke
 *      regel staat de kop op precies die pagina en op geen eerdere;
 *   4. ingevoegde pagina's tellen mee: tussen twee bladen zit precies het aantal
 *      vellen van het blad ertussen;
 *   5. van een Markdown-tekst langer dan een vel valt niets af: elke regel staat
 *      precies één keer in de PDF, en op geen vel loopt iets over de rand;
 *   6. de knop "Rapport (PDF)" komt vanuit een koude start tot aan de printdialoog,
 *      met dezelfde vellen en nummers;
 *   7. in de app (nagebootste Rust-schil) vraagt die knop een bestandsnaam en schrijft
 *      hij zonder printdialoog; mislukt dat, dan volgt een melding en de printdialoog.
 *
 * Met --app-pdf gaan dezelfde controles ook over een PDF die de gebouwde app zelf
 * schreef (scripts/proef-rapport-app.mjs), en moet die pagina voor pagina gelijk zijn
 * aan de PDF van deze controle. Dat project heeft dezelfde bladen. Geef met --schaal
 * de schermschaal van de app mee (dat script meldt hem): de verdeling over de vellen
 * meet op het scherm, en een andere schaal kan een regel laten doorschuiven.
 *
 * Zonder Chrome of Edge op de machine slaat dit script zich over.
 *
 * Draaien:  node scripts/check-rapport-pdf.mjs [--bewaar map] [--app-pdf uit-de-app.pdf] [--schaal 1.5]
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bouwGemengdProject, BLADEN, KENMERKEN, LANG, MARKDOWN_KOPPEN, PDF_PAGINAS } from "./lib/gemengd-project.mjs";

const hier = dirname(fileURLToPath(import.meta.url));
const REPO = join(hier, "..");
const BROWSERS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  "/usr/bin/google-chrome",
  "/usr/bin/chromium",
];

let fouten = 0;
function meld(ok, tekst, detail) {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${ok || detail === undefined ? "" : `   (${detail})`}`);
  if (!ok) fouten++;
}

const browser = BROWSERS.find((p) => existsSync(p));
if (!browser) {
  console.log("Geen Chrome of Edge gevonden: deze controle is overgeslagen.");
  process.exit(0);
}

/** Een vrije poort; Vite luistert alleen op ::1. */
const vrijePoort = () => new Promise((ja, nee) => {
  const s = createServer();
  s.on("error", nee);
  s.listen(0, "::1", () => {
    const { port } = s.address();
    s.close(() => ja(port));
  });
});

const poort = await vrijePoort();
const server = spawn(process.execPath, [join(REPO, "node_modules/vite/bin/vite.js"), "--port", String(poort), "--strictPort"], {
  cwd: join(REPO, "packages/desktop"),
  stdio: "ignore",
});
const url = `http://localhost:${poort}`;

async function wachtOpServer() {
  for (let i = 0; i < 600; i++) {
    try {
      if ((await fetch(url, { signal: AbortSignal.timeout(1000) })).ok) return;
    } catch {
      // nog niet klaar
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("de dev-server startte niet binnen een minuut");
}

const bewaarIndex = process.argv.indexOf("--bewaar");
const bewaar = bewaarIndex > 0 ? resolve(process.argv[bewaarIndex + 1]) : null;
const appPdfIndex = process.argv.indexOf("--app-pdf");
const appPdf = appPdfIndex > 0 ? resolve(process.argv[appPdfIndex + 1]) : null;
const schaalIndex = process.argv.indexOf("--schaal");
const schaal = schaalIndex > 0 ? ["--schaal", process.argv[schaalIndex + 1]] : [];
const map = bewaar ?? mkdtempSync(join(tmpdir(), "rapport-pdf-controle-"));
mkdirSync(map, { recursive: true });
const projectPad = join(map, "gemengd.ifccalculation");
const pdfPad = join(map, "gemengd.pdf");
const vellenPad = join(map, "vellen.json");
const knopPad = join(map, "knop.json");

try {
  writeFileSync(projectPad, await bouwGemengdProject());
  await wachtOpServer();

  // Een tweede poging: bij een lege Vite-cache kan de eerste keer een herlaadbeurt treffen.
  let r;
  for (let poging = 0; poging < 2; poging++) {
    r = spawnSync(process.execPath, [join(hier, "rapport-pdf.mjs"), projectPad, pdfPad, "--url", url, "--browser", browser, "--beginwaarden", "--vellen", vellenPad, "--knop", knopPad, ...schaal], {
      encoding: "utf8",
      timeout: 300000,
    });
    if (r.status === 0) break;
  }
  if (r.status !== 0) throw new Error(`rapport-pdf.mjs mislukte:\n${r.stdout}\n${r.stderr}`);

  const paginas = await controleer(pdfPad);
  if (appPdf) {
    console.log(`\n${"═".repeat(72)}\nDe PDF uit de gebouwde app: ${appPdf}\n${"═".repeat(72)}`);
    vergelijk(await controleer(appPdf), paginas);
  }
} catch (e) {
  console.error(e?.stack ?? e);
  fouten++;
} finally {
  server.kill();
  if (!bewaar) rmSync(map, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);

// ── De PDF lezen ──────────────────────────────────────────────────────────────

/** De tekst van een pagina, in regels: stukken op dezelfde hoogte horen bij elkaar. */
function regelsVan(items) {
  const regels = [];
  const gesorteerd = items
    .filter((i) => i.str.trim() !== "")
    .map((i) => ({ tekst: i.str.trim(), x: i.transform[4], y: i.transform[5], grootte: Math.abs(i.transform[3]) }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  for (const stuk of gesorteerd) {
    const regel = regels.find((r) => Math.abs(r.y - stuk.y) <= 3);
    if (regel) regel.stukken.push(stuk);
    else regels.push({ y: stuk.y, stukken: [stuk] });
  }
  for (const r of regels) {
    r.stukken.sort((a, b) => a.x - b.x);
    r.tekst = r.stukken.map((s) => s.tekst).join(" ");
  }
  return regels;
}

async function leesPdf(pad) {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(pad)), verbosity: pdfjs.VerbosityLevel.ERRORS }).promise;
  const paginas = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const pagina = await doc.getPage(n);
    const { items } = await pagina.getTextContent();
    const { fnArray } = await pagina.getOperatorList();
    const afbeeldingen = fnArray.filter((f) => f === pdfjs.OPS.paintImageXObject).length;
    const { width: breedte, height: hoogte } = pagina.getViewport({ scale: 1 });
    // Links naar een plek in hetzelfde document, met de pagina waar ze heen gaan.
    const links = [];
    for (const a of await pagina.getAnnotations()) {
      if (a.subtype !== "Link" || !a.dest) continue;
      const doel = typeof a.dest === "string" ? await doc.getDestination(a.dest) : a.dest;
      if (!doel) continue;
      links.push({ rect: a.rect, naar: (await doc.getPageIndex(doel[0])) + 1 });
    }
    paginas.push({ n, breedte, hoogte, afbeeldingen, links, regels: regelsVan(items), tekst: items.map((i) => i.str).join("") });
  }
  return paginas;
}

function zonderWit(s) {
  return s.replace(/\s+/g, "");
}

/**
 * Hoeveel tekens van `a` ontbreken in `b`, ongeacht de volgorde: PDF en DOM geven de
 * tekst anders op een rij. Andersom telt niet: op papier staan ook de lijstnummers
 * en de voet, en die staan niet in de tekst van het vel.
 */
function ontbrekendeTekens(a, b) {
  const tel = new Map();
  for (const c of a) tel.set(c, (tel.get(c) ?? 0) + 1);
  for (const c of b) tel.set(c, (tel.get(c) ?? 0) - 1);
  return [...tel.values()].reduce((s, v) => s + Math.max(0, v), 0);
}

// ── De controles ──────────────────────────────────────────────────────────────

/** Dezelfde pagina's, voet en nummers als de PDF van deze controle, op de plaats af. */
function vergelijk(app, referentie) {
  console.log("\nGelijk aan de PDF van rapport-pdf.mjs");
  meld(app.length === referentie.length, "evenveel pagina's", `${app.length} tegen ${referentie.length}`);
  const paren = referentie.flatMap((r, i) => (app[i] ? [[app[i], r]] : []));
  const voet = (p) => p.regels.flatMap((r) => r.stukken).filter((s) => s.y < 60).map((s) => s.tekst).join(" ");
  const anders = (fn) => paren.filter(([a, r]) => fn(a) !== fn(r)).map(([a]) => a.n);
  const tekstAnders = paren.filter(([a, r]) => ontbrekendeTekens(zonderWit(r.tekst), zonderWit(a.tekst)) > zonderWit(r.tekst).length * 0.01).map(([a]) => a.n);
  meld(tekstAnders.length === 0, "op elke pagina dezelfde tekst", `anders op ${tekstAnders.join(", ")}`);
  const voetAnders = anders(voet);
  meld(voetAnders.length === 0, "op elke pagina dezelfde voet en hetzelfde nummer", `anders op ${voetAnders.join(", ")}`);
  const beeldenAnders = anders((p) => p.afbeeldingen);
  meld(beeldenAnders.length === 0, "op elke pagina evenveel afbeeldingen", `anders op ${beeldenAnders.join(", ")}`);
  // Hetzelfde rechtsonder en linksboven: dan staat het vel ook op dezelfde plek.
  const plaats = paren.filter(([a, r]) => {
    const hoek = (p) => {
      const stukken = p.regels.flatMap((x) => x.stukken);
      return stukken.length ? { x: Math.min(...stukken.map((s) => s.x)), y: Math.max(...stukken.map((s) => s.y)) } : { x: 0, y: 0 };
    };
    const ha = hoek(a);
    const hr = hoek(r);
    return Math.abs(ha.x - hr.x) > 1 || Math.abs(ha.y - hr.y) > 1;
  }).map(([a]) => a.n);
  meld(plaats.length === 0, "en die staan op dezelfde plek, op een punt na", `verschoven op ${plaats.join(", ")}`);
}

async function controleer(pad) {
  const paginas = await leesPdf(pad);
  const vellen = JSON.parse(readFileSync(vellenPad, "utf8"));
  console.log(`\n${paginas.length} pagina's in de PDF, ${vellen.length} vellen in het voorbeeld\n`);

  console.log("Voorbeeld en PDF");
  meld(paginas.length === vellen.length, "evenveel pagina's als vellen", `${paginas.length} tegen ${vellen.length}`);
  const anders = vellen.flatMap((vel, i) => {
    if (vel.formules || !paginas[i]) return [];
    const dom = zonderWit(vel.tekst);
    // Minstens twee tekens speling: op een vel met weinig tekst telt een dubbele punt in een SVG-lettertype anders al.
    return ontbrekendeTekens(dom, zonderWit(paginas[i].tekst)) > Math.max(2, dom.length * 0.02) ? [i + 1] : [];
  });
  meld(anders.length === 0, "op elke pagina staat de tekst van dat vel", `anders op ${anders.join(", ")}`);
  const overloop = vellen.flatMap((v, i) => (v.loopt > 1 ? [`${i + 1}: ${v.loopt} px`] : []));
  meld(overloop.length === 0, "op geen vel loopt iets over de rand", overloop.join("; "));

  console.log("\nDe knop Rapport (PDF)");
  const knop = JSON.parse(readFileSync(knopPad, "utf8"));
  meld(knop.melding === null, "komt tot aan de printdialoog", knop.melding);
  meld(knop.nummers?.length === paginas.length, "met evenveel vellen als de PDF", knop.nummers?.length);
  meld(knop.nummers?.every((n, i) => n === String(i + 1)), "die op volgorde genummerd zijn");
  meld(knop.beeldenNietKlaar === 0 && knop.laadt === 0, "en waarop niets meer wordt getekend", { niet: knop.beeldenNietKlaar, laadt: knop.laadt });
  meld(knop.inhoud?.some((n) => n !== ""), "de inhoudsopgave heeft zijn nummers");

  console.log("\nDe knop in de app (nagebootste Rust-schil)");
  const opVolgorde = (nummers) => nummers?.length === paginas.length && nummers.every((n, i) => n === String(i + 1));
  const bestand = knop.bestand;
  const geschreven = bestand.geschreven[0];
  meld(bestand.bestandsnamen.length === 1 && bestand.bestandsnamen[0].endsWith(".pdf"), "vraagt één keer een bestandsnaam, met .pdf als voorstel", bestand.bestandsnamen);
  meld(bestand.geschreven.length === 1 && geschreven.pad === "C:\\proef\\rapport.pdf", "schrijft naar dat bestand, met .pdf erachter", geschreven?.pad);
  meld(bestand.print.length === 0 && bestand.meldingen.length === 0, "zonder printdialoog en zonder melding", bestand.meldingen);
  meld(opVolgorde(geschreven?.nummers) && geschreven.beeldenNietKlaar === 0, "met dezelfde vellen en nummers als de PDF", geschreven?.nummers?.length);
  meld(geschreven?.appZichtbaar && geschreven.kopieBuitenBeeld, "de app blijft staan, de kopie staat buiten beeld", geschreven);
  meld(/\.\.\.|…/.test(geschreven?.status ?? ""), "de statusbalk zegt dat de PDF wordt gemaakt", geschreven?.status);
  meld(!bestand.bezig && bestand.statusNa.includes("rapport.pdf"), "en daarna waar hij staat", bestand.statusNa);

  const terugval = knop.terugval;
  meld(terugval.geschreven.length === 1 && terugval.geschreven[0].pad === "C:\\proef\\rapport.PDF", "een .PDF krijgt er geen tweede extensie bij", terugval.geschreven[0]?.pad);
  meld(terugval.meldingen.length === 1 && terugval.meldingen[0].includes("Schijf vol"), "lukt schrijven niet, dan zegt een melding waarom", terugval.meldingen);
  meld(terugval.print.length === 1 && opVolgorde(terugval.print[0].nummers), "en opent de printdialoog met dezelfde vellen", terugval.print.length);
  meld(terugval.print[0]?.meldingenVooraf === 1, "pas als de melding gelezen is", terugval.print[0]?.meldingenVooraf);
  meld(terugval.pdfGeschreven === null, "en de statusbalk meldt dan geen opgeslagen PDF", terugval.pdfGeschreven);

  const geannuleerd = knop.geannuleerd;
  meld(geannuleerd.bestandsnamen.length === 1 && geannuleerd.geschreven.length + geannuleerd.print.length === 0 && !geannuleerd.bezig,
    "annuleren bij de bestandsnaam doet verder niets", geannuleerd);

  const zonderBestand = knop.zonderBestand;
  meld(zonderBestand.bestandsnamen.length === 0 && zonderBestand.geschreven.length === 0 && zonderBestand.print.length === 1,
    "een afdruk zonder bestandsnaam (MCP-tool print, Ctrl+P) blijft naar de printdialoog gaan", zonderBestand);

  console.log("\nPaginanummers");
  const zonderNummer = paginas.filter((p) => {
    const onderaan = p.regels.flatMap((r) => r.stukken).filter((s) => s.y < 45 && s.x > p.breedte * 0.8);
    return !onderaan.some((s) => s.tekst === String(p.n));
  });
  meld(zonderNummer.length === 0, "elke pagina draagt rechtsonder zijn eigen nummer", `niet op ${zonderNummer.map((p) => p.n).join(", ")}`);
  const voetNummers = vellen.map((v) => v.nummer).join(",");
  meld(voetNummers === paginas.map((p) => p.n).join(","), "het voorbeeld telt net zo", voetNummers);
  const nietA4 = paginas.filter((p) => Math.abs(p.breedte - 595.28) > 1 || Math.abs(p.hoogte - 841.89) > 1);
  meld(nietA4.length === 0, "alle pagina's zijn A4 staand, ook die van een grotere of liggende PDF", `niet op ${nietA4.map((p) => p.n).join(", ")}`);

  console.log("\nInhoudsopgave");
  const inhoudBegin = paginas.findIndex((p) => p.regels.some((r) => r.tekst === "Inhoud"));
  const eersteHoofdstuk = paginas.findIndex((p) => p.regels.some((r) => r.tekst === "1 Inleiding"));
  meld(inhoudBegin === 1, "de inhoudsopgave staat na het voorblad", inhoudBegin + 1);
  const inhoudsPaginas = paginas.slice(inhoudBegin, eersteHoofdstuk);
  const naInhoud = paginas.slice(eersteHoofdstuk);

  // Een regel is: nummer (of niets), titel en rechts een paginanummer.
  const inhoudsregels = inhoudsPaginas.flatMap((p) => p.regels.map((r) => ({ ...r, blad: p })))
    .filter((r) => r.y > 45 && r.tekst !== "Inhoud")
    .map((r) => {
      const laatste = r.stukken[r.stukken.length - 1];
      const heeftPagina = /^\d+$/.test(laatste.tekst) && laatste.x > 480;
      const rest = (heeftPagina ? r.stukken.slice(0, -1) : r.stukken).map((s) => s.tekst).join(" ");
      // De link onder het paginanummer, als die er is.
      const link = heeftPagina
        ? r.blad.links.find(({ rect: [x1, y1, x2, y2] }) => laatste.x >= x1 - 1 && laatste.x <= x2 + 1 && r.y >= y1 - 2 && r.y <= y2 + 2)
        : undefined;
      return { tekst: rest, pagina: heeftPagina ? Number(laatste.tekst) : null, link };
    });
  const regelVoor = (tekst) => inhoudsregels.find((r) => r.tekst === tekst);

  // Elke regel met een nummer: de kop staat op die pagina, en niet eerder.
  const misplaatst = [];
  for (const r of inhoudsregels) {
    if (r.pagina === null) continue;
    // Het nummer en de naam van een blad in de bijlage staan los naast elkaar, in een kop met meer erin.
    const bijlage = /^(A\.\d+) (.+)$/.exec(r.tekst);
    const eerst = naInhoud.find((p) => {
      if (!bijlage) return p.regels.some((x) => x.tekst === r.tekst);
      const stukken = p.regels.flatMap((x) => x.stukken);
      // Op een tekenvel staan nummer en naam samen in de titelhoek.
      if (stukken.some((s) => s.tekst === r.tekst)) return true;
      return stukken.some((nr) => nr.tekst === bijlage[1] &&
        stukken.some((naam) => naam.tekst === bijlage[2] && naam.x > nr.x && Math.abs(naam.y - nr.y) < 12));
    });
    if (eerst?.n !== r.pagina) misplaatst.push(`"${r.tekst}" zegt ${r.pagina}, staat op ${eerst?.n ?? "geen enkele pagina"}`);
  }
  const metNummer = inhoudsregels.filter((r) => r.pagina !== null).length;
  meld(metNummer >= 30, `${metNummer} regels met een paginanummer`);
  meld(misplaatst.length === 0, "bij elke regel staat de kop op die pagina en op geen eerdere", misplaatst.join("; "));
  // In de PDF klik je door: elk paginanummer is een link naar zijn eigen pagina.
  const zonderLink = inhoudsregels.filter((r) => r.pagina !== null && r.link?.naar !== r.pagina)
    .map((r) => `"${r.tekst}" (${r.pagina}${r.link ? ` → ${r.link.naar}` : ", geen link"})`);
  meld(metNummer > 0 && zonderLink.length === 0, "elk paginanummer is een link naar die pagina", zonderLink.slice(0, 5).join("; "));

  const zoek = (titel, voorvoegsel) => inhoudsregels.find((r) => (voorvoegsel ? r.tekst.startsWith(voorvoegsel) : true) && r.tekst.endsWith(titel));
  const bladen = Object.values(BLADEN);
  const ontbreekt = bladen.filter((b) => !zoek(b.naam));
  meld(ontbreekt.length === 0, "elk blad staat erin: rekenblad, module, PDF, werkmap, Markdown, canvas, graaf, tekening, Jupyter en Marimo", ontbreekt.map((b) => b.naam).join(", "));
  const zonderPagina = bladen.filter((b) => zoek(b.naam) && zoek(b.naam).pagina === null);
  meld(zonderPagina.length === 0, "elk blad heeft een paginanummer", zonderPagina.map((b) => b.naam).join(", "));
  const koppen = [...MARKDOWN_KOPPEN.notitie, ...MARKDOWN_KOPPEN.logboek];
  const koppenWeg = koppen.filter((k) => regelVoor(k)?.pagina == null);
  meld(koppenWeg.length === 0, "de koppen uit de Markdown-bladen staan erin", koppenWeg.join(", "));
  meld(!regelVoor(BLADEN.notitie.naam.toUpperCase()) && inhoudsregels.filter((r) => r.tekst.endsWith(BLADEN.notitie.naam)).length === 1,
    "een kop gelijk aan de naam van het blad staat er niet nog eens");
  meld(regelVoor("Bijlage A Uitgebreide uitwerking berekeningen")?.pagina != null, "bijlage A heeft een paginanummer");
  meld(regelVoor("Bijlage B Constructieoverzicht")?.pagina === null, "een eigen bijlage heeft er geen: het document zit niet in het rapport");

  // De inhoudsopgave van hoofdstuk Berekeningen noemt elke paragraaf met zijn pagina.
  const hoofdstuk6 = paginas.find((p) => p.regels.some((r) => /^\d+ Berekeningen$/.test(r.tekst)));
  const paragrafen = hoofdstuk6.regels.filter((r) => /^\d+\.\d+ /.test(r.tekst) && /\s\d+$/.test(r.tekst));
  meld(paragrafen.length === bladen.length, `hoofdstuk Berekeningen noemt alle ${bladen.length} bladen met hun pagina`, paragrafen.length);
  const fouteParagrafen = paragrafen.filter((r) => {
    const tekst = r.tekst.replace(/\s\d+$/, "");
    const pagina = Number(/(\d+)$/.exec(r.tekst)[1]);
    return paginas[pagina - 1]?.regels.every((x) => x.tekst !== tekst);
  });
  meld(fouteParagrafen.length === 0, "en op die pagina staat de paragraaf", fouteParagrafen.map((r) => r.tekst).join("; "));

  console.log("\nIngevoegde pagina's tellen mee");
  const bijlageVan = (naam) => {
    const r = zoek(naam, "A.");
    return { tekst: r?.tekst, pagina: r?.pagina };
  };
  const pdf = bijlageVan(BLADEN.pdf.naam);
  const werkmap = bijlageVan(BLADEN.werkmap.naam);
  meld(werkmap.pagina - pdf.pagina === PDF_PAGINAS.length,
    `tussen het PDF-blad (p. ${pdf.pagina}) en het blad erna (p. ${werkmap.pagina}) zitten zijn ${PDF_PAGINAS.length} pagina's`,
    werkmap.pagina - pdf.pagina);
  const pdfVellen = paginas.slice(pdf.pagina - 1, pdf.pagina - 1 + PDF_PAGINAS.length);
  meld(pdfVellen.every((p) => p.afbeeldingen === 1), "elke pagina van de PDF staat als afbeelding op zijn eigen vel", pdfVellen.map((p) => p.afbeeldingen).join(","));
  const logboek = bijlageVan(BLADEN.logboek.naam);
  const werkmapVellen = paginas.slice(werkmap.pagina - 1, logboek.pagina - 1);
  meld(werkmapVellen.length >= 3 && werkmapVellen.every((p) => p.afbeeldingen >= 1),
    `de werkmap van 150 rijen loopt over ${werkmapVellen.length} vellen, elk met afbeelding`, werkmapVellen.length);

  console.log("\nCanvas, graaf, tekening, Jupyter, Marimo en de varianten van een rekenblad");
  for (const [soort, tekst] of Object.entries(KENMERKEN)) {
    const { pagina } = bijlageVan(BLADEN[soort].naam);
    const vel = pagina ? paginas[pagina - 1] : null;
    meld(vel?.regels.some((r) => zonderWit(r.tekst).includes(zonderWit(tekst))),
      `${BLADEN[soort].naam} staat op de pagina uit de inhoudsopgave (p. ${pagina})`, tekst);
  }

  console.log("\nEen Markdown-tekst langer dan een vel");
  const alles = paginas.slice(logboek.pagina - 1);
  const tekst = alles.flatMap((p) => p.regels.map((r) => r.tekst));
  const telRegels = (woord, aantal) => {
    const gevonden = new Map();
    for (const r of tekst) {
      const m = new RegExp(`${woord} (\\d+)(?!\\d)`).exec(r);
      if (m) gevonden.set(m[1], (gevonden.get(m[1]) ?? 0) + 1);
    }
    const weg = Array.from({ length: aantal }, (_, i) => String(i + 1)).filter((n) => gevonden.get(n) !== 1);
    return weg;
  };
  for (const [woord, aantal] of [["Lijstregel", LANG.lijst], ["Tabelregel", LANG.tabel], ["Coderegel", LANG.code]]) {
    const weg = telRegels(woord, aantal);
    meld(weg.length === 0, `elk van de ${aantal} stuks "${woord}" staat precies één keer in de PDF`, `niet: ${weg.slice(0, 8).join(", ")}`);
  }
  const lijstNummers = alles.flatMap((p) => p.regels).filter((r) => /^\d+\. Lijstregel \d+$/.test(r.tekst));
  const verkeerdNummer = lijstNummers.filter((r) => {
    const m = /^(\d+)\. Lijstregel (\d+)$/.exec(r.tekst);
    return m[1] !== m[2];
  });
  meld(lijstNummers.length === LANG.lijst && verkeerdNummer.length === 0, "de nummering van een lijst loopt door over de vellen",
    `${lijstNummers.length} regels, ${verkeerdNummer.length} verkeerd`);
  const alinea = zonderWit(alles.map((p) => p.tekst).join(""));
  const zinnenWeg = Array.from({ length: LANG.zinnen }, (_, i) => i + 1)
    .filter((i) => !alinea.includes(zonderWit(`Dit is zin nummer ${i} van een alinea`)));
  meld(zinnenWeg.length === 0 && alinea.includes("Eindevandealinea."), "van de lange alinea ontbreekt niets", zinnenWeg.slice(0, 8).join(", "));

  console.log("\nEen korte Markdown-tekst");
  const notitiePagina = paginas.find((p) => p.regels.some((r) => /^\d+\.\d+ Uitgangspunten fundering$/.test(r.tekst)));
  const notitieTot = paginas.find((p) => p.n > notitiePagina.n && p.regels.some((r) => /^\d+\.\d+ Logboek$/.test(r.tekst))) ?? notitiePagina;
  const notitieVellen = paginas.slice(notitiePagina.n - 1, notitieTot.n);
  const notitie = notitieVellen.flatMap((p) => p.regels.map((r) => r.tekst));
  meld(notitie.filter((r) => r === "Uitgangspunten fundering").length === 0, "de eerste kop gelijk aan de naam staat er niet dubbel");
  meld(notitie.includes("Grondslag") && notitie.includes("Aanpak"), "de koppen staan op papier");
  meld(notitie.some((r) => r.includes("Rc;d = 1200 kN")), "het codeblok staat op papier");
  meld(notitie.some((r) => r.startsWith("Laag") && r.includes("Soort")) && notitie.some((r) => r.includes("Klei")), "de tabel staat op papier");
  meld(notitie.some((r) => r.includes("voorbeeld.invalid")), "een afbeelding van buiten laadt niet zonder bevestiging: de naam van de host staat er");
  meld(notitie.some((r) => r.includes("foto/ontbreekt.png")), "een afbeelding die er niet is: het adres staat er");
  meld(notitieVellen.reduce((s, p) => s + p.afbeeldingen, 0) >= 2, "de afbeelding uit de tekst staat op papier, naast de werkmap");
  return paginas;
}
