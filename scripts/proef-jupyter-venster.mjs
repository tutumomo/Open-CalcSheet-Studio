/**
 * Proef van het Jupyter-blad in het echte venster: een Tauri-build, WebView2, en een
 * kernel die echt rekent. Vraagt een build en een bureaublad, en draait dus niet mee
 * in check-alles; zie scripts/check-jupyter.mjs voor wat zonder venster kan.
 *
 * Toetst:
 *   • een cel met numpy en matplotlib, import tussen scripts, pandas op een databestand;
 *   • opslaan via Ctrl+S in het notebook: bestanden en uitvoer komen in het projectbestand;
 *   • wegklikken en terugkomen: de kernel leeft nog en de iframe is niet herladen;
 *   • twee bladen delen geen bestanden, kernel of herkomst;
 *   • een notebook van iemand anders: niets draait uit zichzelf;
 *   • de afscherming: geen opdrachten van Tauri, geen bestanden van de app en geen
 *     verzoek naar buiten, vanuit de pagina en vanuit Python. Een eigen luisterpost
 *     (HTTP en UDP) telt wat er toch aankomt;
 *   • opnieuw openen en afdrukvoorbeeld zonder dat de kernel iets doet.
 *
 * Bouwen, met een eigen doelmap en vooral een eigen identifier: de opgeslagen appstaat
 * (`projectState`, recente bestanden) hangt aan de identifier, en deze proef opent en
 * bewaart projecten. Zonder eigen identifier overschrijft hij dus de staat van de gebruiker.
 *   CARGO_TARGET_DIR=<map> npm run tauri build -- --debug --no-bundle
 *     -c "{\"identifier\":\"studio.openstructuralcalculation.proef\"}"
 *
 * Draaien:
 *   node scripts/proef-jupyter-venster.mjs <pad-naar-exe> <map-voor-uitvoer>
 *
 * De app start met een eigen opslagmap en debugpoort; een draaiende app merkt er niets van.
 */
import { createServer } from "node:http";
import { createSocket } from "node:dgram";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { strFromU8, strToU8 } from "fflate";
import { startApp, NOTEBOOK_KLAAR } from "./lib/jupyter-venster.mjs";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE } from "../packages/desktop/src/store/projectBestand.ts";
import { bladenVoorIfc } from "../packages/desktop/src/store/projectIfcx.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import { JUPYTER_BLAD, pakWerkmapIn, pakWerkmapUit, uitBase64 } from "../packages/desktop/src/store/jupyterBlad.ts";

const [exe, uitMap] = process.argv.slice(2);
if (!exe || !uitMap) {
  console.error("Gebruik: node scripts/proef-jupyter-venster.mjs <pad-naar-exe> <map-voor-uitvoer>");
  process.exit(2);
}
const UIT = resolve(uitMap);
const OPSLAG = join(UIT, "opslag");
rmSync(OPSLAG, { recursive: true, force: true });
mkdirSync(UIT, { recursive: true });

let fouten = 0;
function meld(ok, tekst, extra = "") {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${extra ? `  (${extra})` : ""}`);
  if (!ok) fouten++;
}
const kop = (t) => console.log(`\n${t}`);
const wacht = (ms) => new Promise((klaar) => setTimeout(klaar, ms));

// ── De luisterpost ───────────────────────────────────────────────────────────
const hits = [];
const web = createServer((req, res) => {
  hits.push(`http ${req.method} ${req.headers.host}${req.url}`);
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "*");
  res.end("gelekt");
});
await new Promise((klaar) => web.listen(0, "127.0.0.1", klaar));
const POST = web.address().port;
const udp = createSocket("udp4");
udp.on("message", (_b, r) => hits.push(`udp ${r.address}:${r.port}`));
await new Promise((klaar) => udp.bind(0, "127.0.0.1", klaar));
const UDP = udp.address().port;

// ── Het project ──────────────────────────────────────────────────────────────
const nb = (cellen) => strToU8(`${JSON.stringify({
  cells: cellen,
  metadata: { kernelspec: { display_name: "Python (Pyodide)", language: "python", name: "python" } },
  nbformat: 4,
  nbformat_minor: 5,
}, null, 1)}\n`);
const code = (id, source, extra = {}) => ({ cell_type: "code", id, metadata: {}, execution_count: null, outputs: [], source, ...extra });

const WERKMAP_A = [
  {
    pad: "notebook.ipynb",
    bytes: nb([
      { cell_type: "markdown", id: "t", metadata: {}, source: "# Doorbuiging\n\nEen ligger met $q = 5$ kN/m." },
      code("c1", [
        "import numpy as np\nimport matplotlib.pyplot as plt\n",
        "x = np.linspace(0, 6, 61)\nM = 5 * x * (6 - x) / 2\n",
        "plt.plot(x, M)\nplt.title('Moment')\nplt.show()\nprint('Mmax =', M.max())\n",
      ].join("")),
      code("c2", "from helper import dubbel\nimport pandas as pd\ndf = pd.read_csv('data/invoer.csv', sep=';')\ndf['dubbel'] = dubbel(df['a'])\ndf\n"),
      code("c3", "import scipy\nwith open('uit.txt', 'w') as f:\n    f.write('geschreven vanuit Python')\nblijft = 41 + 1\nscipy.__version__\n"),
    ]),
  },
  { pad: "helper.py", bytes: strToU8("def dubbel(x):\n    return 2 * x\n") },
  { pad: "data/invoer.csv", bytes: strToU8("a;b\n1;2\n3;4\n") },
];
// De kernelnaam zoals een gewone Jupyter-installatie die schrijft.
const WERKMAP_B = [{
  pad: "ander.ipynb",
  bytes: strToU8(JSON.stringify({
    cells: [
      code("b1", "import os\nsorted(os.listdir('.'))\n"),
      // Een cel die de gebruiker zelf start, dus met vertrouwde uitvoer. Alle routes naar
      // script in het venster, ook WebRTC: dat kan een CSP niet tegenhouden.
      code("b2", [
        "from IPython.display import display, HTML, Javascript\n",
        `rtc = "const p = new RTCPeerConnection({iceServers:[{urls:'stun:127.0.0.1:${UDP}'}]}); p.createDataChannel('x'); p.createOffer().then((o) => p.setLocalDescription(o)); window.__js = 'rtc'"\n`,
        "display(Javascript(rtc))\n",
        `display(HTML("<b id='vet'>zichtbaar</b><script>" + rtc + "</script><img src=x onerror=\\"" + rtc + "\\"><svg onload=\\"" + rtc + "\\"></svg><a id='kl' href=\\"javascript:" + rtc + "\\">k</a><iframe srcdoc=\\"<script>parent.__js='srcdoc'</script>\\"></iframe>"))\n`,
        "display({'application/vnd.vegalite.v5+json': {'data': {'values': [{'a': 1}]}, 'mark': 'bar'}, 'text/plain': 'vega-tekst'}, raw=True)\n",
      ].join("")),
    ],
    metadata: { kernelspec: { display_name: "Python 3 (ipykernel)", language: "python", name: "python3" } },
    nbformat: 4,
    nbformat_minor: 5,
  })),
}];
const WERKMAP_C = [
  {
    pad: "van-iemand-anders.ipynb",
    bytes: nb([
      { cell_type: "markdown", id: "m", metadata: { trusted: true }, source: "<img src=x onerror=\"window.__gekaapt='markdown'\">\n\n# Let op" },
      code("k", "open('uitgevoerd.txt', 'w').write('dit had niet mogen draaien')\n", {
        metadata: { trusted: true },
        execution_count: 1,
        outputs: [{
          output_type: "display_data",
          metadata: {},
          data: {
            "application/javascript": "window.__gekaapt='javascript'",
            "text/html": "<img src=x onerror=\"window.__gekaapt='html'\"><script>window.__gekaapt='script'</script>",
            "text/plain": "kaal",
          },
        }],
      }),
    ]),
  },
  { pad: "json.py", bytes: strToU8("open('/drive/geschaduwd.txt', 'w').write('geladen')\n") },
];
const blad = (id, naam, bestanden, metCode = true) => ({
  id, naam, templateId: JUPYTER_BLAD, source: "", waarden: {}, elementen: [],
  jupyter: { bestandsnaam: "", data: Buffer.from(pakWerkmapIn(bestanden)).toString("base64"), metCode },
});
const project = {
  versie: PROJECT_FORMAAT_VERSIE, naam: "Proef", gegevens: legeGegevens(), rapport: undefined,
  exemplaren: [blad("ex-a", "Blad A", WERKMAP_A), blad("ex-b", "Blad B", WERKMAP_B), blad("ex-c", "Blad C", WERKMAP_C)],
};
const PROJECT = join(UIT, "proef.ifccalculation");
writeFileSync(PROJECT, bouwProjectBestand(project, bladenVoorIfc(project)));

const leesWerkmap = (id) => {
  const ex = leesProjectBestand(readFileSync(PROJECT, "utf8"), "proef").exemplaren.find((e) => e.id === id);
  return pakWerkmapUit(uitBase64(ex.jupyter.data));
};

// ── Hulp bij het venster ─────────────────────────────────────────────────────
async function kiesBlad(s, naam) {
  await s.voerUit(`[...document.querySelectorAll('.pb-naam')].find((e) => e.textContent.includes(${JSON.stringify(naam)})).closest('button').click()`);
}
/** De sessie van het zoveelste geopende blad; de URL in de targetlijst loopt soms achter. */
async function frameVan(s, teller) {
  return s.wachtOp(async () => {
    const lijst = [];
    for (const [sessie, f] of s.frames) {
      if (f.type !== "iframe") continue;
      const herkomst = await s.voerUit("location.origin", sessie).catch(() => "");
      if (/^http:\/\/blad-.*\.localhost/.test(herkomst)) lijst.push(sessie);
    }
    return lijst.length >= teller ? lijst[teller - 1] : null;
  }, { tekst: `iframe ${teller}`, ms: 30000 });
}
/** De sessie op deze herkomst; na herladen is dat een nieuwe. */
async function frameOp(s, herkomst) {
  return s.wachtOp(async () => {
    for (const [sessie, f] of [...s.frames].reverse()) {
      if (f.type === "iframe" && (await s.voerUit("location.origin", sessie).catch(() => "")) === herkomst) return sessie;
    }
    return null;
  }, { tekst: `iframe op ${herkomst}`, ms: 30000 });
}
const klaarVoorCel = (s, f) => s.wachtOp(
  () => s.voerUit(NOTEBOOK_KLAAR, f),
  { tekst: "kernel", ms: 180000 },
);
/**
 * Alle cellen uitvoeren, zoals met de knop. Doet dat niets, dan staat dat in de uitvoer van
 * de proef, zodat het niet onzichtbaar wegvalt.
 */
async function voerAllesUit(s, f) {
  for (let poging = 1; poging <= 3; poging++) {
    if (poging > 1) console.log(`     alles uitvoeren: poging ${poging}, de vorige deed niets`);
    await s.voerUit(`window.jupyterapp.commands.execute('notebook:run-all-cells')`, f);
    const eind = Date.now() + 20000;
    while (Date.now() < eind) {
      if (await s.voerUit(`[...document.querySelectorAll('.jp-InputPrompt')].some((p) => /\\[[*0-9]/.test(p.textContent)) ? 1 : 0`, f)) return;
      await wacht(500);
    }
  }
  throw new Error("Alles uitvoeren deed drie keer niets.");
}
/** Voert code uit in de kernel van dit frame en geeft stdout en het resultaat. */
const inKernel = (s, f, py) => s.voerUit(`new Promise((klaar, mis) => {
  const k = window.jupyterapp.shell.currentWidget.sessionContext.session.kernel;
  const fut = k.requestExecute({ code: ${JSON.stringify(py)}, store_history: false });
  let uit = '';
  fut.onIOPub = (m) => {
    const t = m.header.msg_type;
    if (t === 'stream') uit += m.content.text;
    if (t === 'execute_result') uit += m.content.data['text/plain'];
    if (t === 'error') uit += 'FOUT ' + m.content.ename + ': ' + m.content.evalue;
  };
  fut.done.then(() => klaar(uit), mis);
})`, f);

const app = await startApp({ exe, map: OPSLAG, argumenten: [PROJECT] });
const s = app.sessie;
const foto = async (naam) => writeFileSync(join(UIT, naam), await s.foto());

try {
  await s.wachtOp(() => s.voerUit(`[...document.querySelectorAll('.pb-naam')].some((e) => e.textContent.includes('Blad A')) ? 1 : 0`), { tekst: "de projectboom", ms: 60000 });
  await s.voerUit(`document.querySelector('.welkom-paneel button[aria-label]')?.click()`);
  const hoofdUrl = await s.voerUit("location.href");

  kop("Blad A: rekenen");
  await kiesBlad(s, "Blad A");
  const a = await frameVan(s, 1);
  await s.wachtOp(() => s.voerUit(`document.querySelector('.jp-Notebook') ? 1 : 0`, a), { tekst: "het notebook", ms: 90000 });
  meld(await s.voerUit(`document.querySelectorAll('.jp-OutputArea-output').length === 0 ? 1 : 0`, a) === 1, "bij het openen heeft nog niets gedraaid");
  const start = Date.now();
  await klaarVoorCel(s, a);
  console.log(`     kernel klaar na ${((Date.now() - start) / 1000).toFixed(1)} s`);
  await voerAllesUit(s, a);
  await s.wachtOp(() => s.voerUit(`document.querySelectorAll('.jp-Cell')[3]?.querySelector('.jp-InputPrompt')?.textContent.includes('[3]') && document.querySelector('.jp-RenderedImage img') ? 1 : 0`, a), { tekst: "de uitvoer", ms: 240000 });
  const uitvoer = await s.voerUit(`document.querySelector('.jp-Notebook').innerText`, a);
  meld(uitvoer.includes("Mmax = 22.5"), "numpy rekent: Mmax = q·L²/8 = 5·6²/8 = 22,5");
  meld(await s.voerUit(`document.querySelector('.jp-RenderedImage img').naturalWidth > 100 ? 1 : 0`, a) === 1, "matplotlib tekent een afbeelding");
  meld(await s.voerUit(`document.querySelector('.jp-RenderedHTMLCommon table.dataframe') ? 1 : 0`, a) === 1, "import uit helper.py en pandas op data/invoer.csv geven een tabel");
  meld(/\n?\s*2\s*\n?|dubbel/.test(uitvoer) && !/Traceback|Error/.test(uitvoer), "geen foutmelding in de cellen");
  const nummers = await s.voerUit(`(() => { const c = document.querySelector('.jp-RenderedHTMLCommon table.dataframe').closest('.jp-Cell'); return c.querySelector('.jp-InputPrompt').textContent.trim() + ' ' + c.querySelector('.jp-OutputPrompt').textContent.trim(); })()`, a);
  meld(/^\[(\d+)\]: \[\1\]:$/.test(nummers), "de uitvoer draagt hetzelfde nummer als zijn cel", nummers);
  meld(/1\.\d+\.\d+/.test(await inKernel(s, a, "import scipy; print(scipy.__version__)")), "scipy is beschikbaar");
  // Tegenproef in dezelfde kernel: zonder de terugval uit de brug is een nieuw script onvindbaar.
  const nieuw = await inKernel(s, a, [
    "import sys",
    "terugval = [f for f in sys.meta_path if getattr(f, '__name__', '') == 'ZoekOpnieuw']",
    "print('terugval', len(terugval))",
    "sys.meta_path[:] = [f for f in sys.meta_path if f not in terugval]",
    "open('nieuw_script.py', 'w').write('def drie():\\n    return 3\\n')",
    "try:",
    "    import nieuw_script",
    "    print('zonder gevonden')",
    "except ModuleNotFoundError:",
    "    print('zonder onvindbaar')",
    "sys.meta_path.extend(terugval)",
    "import nieuw_script",
    "print('met', nieuw_script.drie())",
  ].join("\n"));
  meld(nieuw.includes("terugval 1"), "de terugval staat één keer in de kernel", nieuw);
  meld(nieuw.includes("zonder onvindbaar"), "tegenproef: zonder terugval is een nieuw script onvindbaar", nieuw);
  meld(nieuw.includes("met 3"), "met de terugval is een nieuw script meteen te vinden", nieuw);
  const browser = await s.voerUit(`[...document.querySelectorAll('.jp-DirListing-itemName')].map((e) => e.textContent).join()`, a);
  meld(["helper.py", "data", "notebook.ipynb"].every((n) => browser.includes(n)), "de bestandsbrowser toont notebook, script en map", browser);
  await foto("1-numpy-matplotlib.png");

  kop("Opslaan");
  const voor = readFileSync(PROJECT, "utf8");
  await s.voerUit(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 's', ctrlKey: true, bubbles: true, cancelable: true }))`, a);
  await s.wachtOp(() => readFileSync(PROJECT, "utf8") !== voor, { tekst: "het projectbestand", ms: 30000 });
  const opgeslagen = leesWerkmap("ex-a");
  const nbOp = JSON.parse(strFromU8(opgeslagen.find((b) => b.pad === "notebook.ipynb").bytes));
  meld(nbOp.cells[1].outputs.some((u) => u.data?.["image/png"]), "de afbeelding staat in het projectbestand");
  meld(nbOp.cells[1].outputs.some((u) => u.text && [].concat(u.text).join("").includes("22.5")), "de tekstuitvoer ook");
  meld(strFromU8(opgeslagen.find((b) => b.pad === "uit.txt")?.bytes ?? strToU8("")) === "geschreven vanuit Python", "een bestand dat Python schreef ook");
  meld(strFromU8(opgeslagen.find((b) => b.pad === "data/invoer.csv").bytes).startsWith("a;b"), "het databestand blijft");

  kop("Wegklikken en twee bladen");
  await s.voerUit(`window.__nietHerladen = 1`, a);
  await kiesBlad(s, "Blad B");
  const b = await frameVan(s, 2);
  await s.wachtOp(() => s.voerUit(`document.querySelector('.jp-Notebook') ? 1 : 0`, b), { tekst: "notebook B", ms: 90000 });
  await klaarVoorCel(s, b);
  const lijstB = await inKernel(s, b, "import os; print(sorted(os.listdir('.')))");
  meld(lijstB.includes("ander.ipynb") && !lijstB.includes("helper.py"), "blad B ziet alleen zijn eigen bestanden", lijstB.trim());
  meld((await inKernel(s, b, "print('blijft' in globals())")).trim() === "False", "blad B heeft een eigen kernel");
  const urlA = await s.voerUit("location.origin", a);
  const urlB = await s.voerUit("location.origin", b);
  meld(urlA !== urlB, "elk blad een eigen herkomst", `${urlA} / ${urlB}`);
  const vanB = await s.voerUit(`fetch(${JSON.stringify(`${urlA}/lab/index.html`)}).then(() => 'gelukt', (e) => 'geweigerd')`, b);
  meld(vanB === "geweigerd", "blad B kan niet bij de herkomst van blad A");
  await kiesBlad(s, "Blad A");
  await wacht(500);
  meld(await s.voerUit(`window.__nietHerladen`, a) === 1, "terug op blad A: de iframe is niet herladen");
  meld((await inKernel(s, a, "print(blijft)")).trim() === "42", "en de kernel weet zijn variabelen nog");

  kop("Een notebook van iemand anders");
  await kiesBlad(s, "Blad C");
  const c = await frameVan(s, 3);
  await s.wachtOp(() => s.voerUit(`document.querySelector('.jp-Notebook') ? 1 : 0`, c), { tekst: "notebook C", ms: 90000 });
  await klaarVoorCel(s, c);
  const urlC = await s.voerUit("location.origin", c);
  await wacht(1500);
  meld((await s.voerUit(`String(window.__gekaapt)`, c)) === "undefined", "JavaScript en HTML uit de opgeslagen uitvoer draaien niet");
  const eigenBestanden = await inKernel(s, c, "import os; print(sorted(os.listdir('.')))");
  meld(!eigenBestanden.includes("uitgevoerd.txt"), "de code van de cel heeft niet gedraaid", eigenBestanden.trim());
  meld(!eigenBestanden.includes("geschaduwd.txt"), "een script met de naam van een Python-module wordt niet vanzelf geladen");

  kop("Afscherming: wat de pagina kan");
  const internals = await s.voerUit(`JSON.stringify({ internals: typeof window.__TAURI_INTERNALS__, tauri: typeof window.__TAURI__, ipc: typeof window.ipc, webview: typeof window.chrome?.webview })`, c);
  console.log(`     globale namen in de iframe: ${internals}`);
  const MERK = join(UIT, "uit-de-sandbox.txt").replace(/\\/g, "\\\\");
  const opdrachten = [
    ["jupyter_omgeving_start", {}],
    ["startbestand", {}],
    ["plugin:fs|read_text_file", { path: PROJECT.replace(/\\/g, "\\\\") }],
    ["plugin:fs|write_text_file", { path: MERK, contents: "gelekt" }],
    ["plugin:dialog|message", { message: "uit de sandbox" }],
    ["plugin:opener|open_url", { url: `http://127.0.0.1:${POST}/opener` }],
  ];
  for (const [opdracht, args] of opdrachten) {
    const r = await s.voerUit(`(() => {
      const t = window.__TAURI_INTERNALS__;
      if (!t?.invoke) return 'geen invoke';
      return Promise.race([
        t.invoke(${JSON.stringify(opdracht)}, ${JSON.stringify(args)}).then((w) => 'GELUKT ' + JSON.stringify(w).slice(0, 60), (e) => 'geweigerd: ' + String(e).slice(0, 80)),
        new Promise((klaar) => setTimeout(() => klaar('geen antwoord'), 4000)),
      ]);
    })()`, c);
    meld(!r.startsWith("GELUKT"), `opdracht ${opdracht}`, r);
  }
  meld(!existsSync(join(UIT, "uit-de-sandbox.txt")), "er is niets op schijf geschreven");
  const direct = await s.voerUit(`(() => {
    const berichten = ['{"cmd":"plugin:fs|write_text_file","callback":1,"error":2,"payload":{}}'];
    const uit = [];
    for (const naam of ['ipc', 'chrome.webview']) {
      const doel = naam === 'ipc' ? window.ipc : window.chrome?.webview;
      try { doel?.postMessage(berichten[0]); uit.push(naam + ': verstuurd'); } catch (e) { uit.push(naam + ': ' + e.message); }
    }
    return uit.join('; ');
  })()`, c);
  console.log(`     rechtstreeks postMessage: ${direct}`);

  const bij = (naam, js) => s.voerUit(`(async () => { try { return await (${js}); } catch (e) { return 'geweigerd: ' + String(e?.message ?? e).slice(0, 60); } })()`, naam);
  meld((await bij(c, `top.location.href`)).startsWith("geweigerd"), "de iframe kan het hoofdvenster niet lezen");
  meld((await bij(c, `top.document.title`)).startsWith("geweigerd"), "en zijn document niet");
  const naarBuiten = [
    ["fetch", `fetch('http://127.0.0.1:${POST}/fetch').then((r) => r.text())`],
    ["fetch zonder CORS", `fetch('http://127.0.0.1:${POST}/nocors', { mode: 'no-cors', method: 'POST', body: 'x' }).then(() => 'verstuurd')`],
    ["XMLHttpRequest", `new Promise((ok, mis) => { const x = new XMLHttpRequest(); x.open('GET', 'http://127.0.0.1:${POST}/xhr'); x.onload = () => ok(x.responseText); x.onerror = () => mis(new Error('geblokkeerd')); x.send(); })`],
    ["sendBeacon", `navigator.sendBeacon('http://127.0.0.1:${POST}/beacon', 'x') ? 'poging' : 'geweigerd: false'`],
    ["WebSocket", `new Promise((ok, mis) => { const w = new WebSocket('ws://127.0.0.1:${POST}/ws'); w.onopen = () => ok('open'); w.onerror = () => mis(new Error('geblokkeerd')); })`],
    ["afbeelding", `new Promise((ok, mis) => { const i = new Image(); i.onload = () => ok('geladen'); i.onerror = () => mis(new Error('geblokkeerd')); i.src = 'http://127.0.0.1:${POST}/img.png'; })`],
    ["script", `new Promise((ok, mis) => { const i = document.createElement('script'); i.onload = () => ok('geladen'); i.onerror = () => mis(new Error('geblokkeerd')); i.src = 'http://127.0.0.1:${POST}/s.js'; document.head.append(i); })`],
    ["stijlblad", `new Promise((ok, mis) => { const i = document.createElement('link'); i.rel = 'stylesheet'; i.onload = () => ok('geladen'); i.onerror = () => mis(new Error('geblokkeerd')); i.href = 'http://127.0.0.1:${POST}/s.css'; document.head.append(i); })`],
    ["dns-vooruitblik", `(() => { const i = document.createElement('link'); i.rel = 'preconnect'; i.href = 'http://prefetch.localhost:${POST}/'; document.head.append(i); return 'poging'; })()`],
    ["worker uit een blob", `new Promise((ok, mis) => { const w = new Worker(URL.createObjectURL(new Blob(["fetch('http://127.0.0.1:${POST}/worker').then(() => postMessage('ja'), () => postMessage('nee'))"]))); w.onmessage = (e) => e.data === 'ja' ? ok('gelukt') : mis(new Error('geblokkeerd')); w.onerror = () => mis(new Error('geblokkeerd')); })`],
    ["nieuw venster", `(() => { const w = window.open('http://127.0.0.1:${POST}/open'); return w ? 'GEOPEND' : 'geweigerd: geen venster'; })()`],
  ];
  for (const [naam, js] of naarBuiten) {
    const r = String(await bij(c, js));
    meld(!/gelekt|geladen$|^open$|^gelukt$|GEOPEND/.test(r), `${naam}`, r);
  }
  kop("Afscherming: wat Python kan");
  const py = [
    ["js.fetch", `import js\nfrom pyodide.ffi import JsException\ntry:\n    r = await js.fetch('http://127.0.0.1:${POST}/py-fetch')\n    print('GELUKT', r.status)\nexcept JsException as e:\n    print('geweigerd', e)`],
    ["pyodide.http.pyfetch", `from pyodide.http import pyfetch\ntry:\n    r = await pyfetch('http://127.0.0.1:${POST}/py-pyfetch')\n    print('GELUKT', r.status)\nexcept Exception as e:\n    print('geweigerd', type(e).__name__)`],
    ["pyodide.http.open_url", `from pyodide.http import open_url\ntry:\n    print('GELUKT', open_url('http://127.0.0.1:${POST}/py-open-url').read())\nexcept Exception as e:\n    print('geweigerd', type(e).__name__)`],
    ["urllib", `import urllib.request\ntry:\n    print('GELUKT', urllib.request.urlopen('http://127.0.0.1:${POST}/py-urllib').read())\nexcept Exception as e:\n    print('geweigerd', type(e).__name__)`],
    ["socket", `import socket\ntry:\n    so = socket.create_connection(('127.0.0.1', ${POST}), timeout=2)\n    so.sendall(b'GET /py-socket HTTP/1.0\\r\\n\\r\\n')\n    print('GELUKT', so.recv(10))\nexcept Exception as e:\n    print('geweigerd', type(e).__name__)`],
    ["%pip install", `import piplite\ntry:\n    await piplite.install('requests')\n    print('GELUKT')\nexcept Exception as e:\n    print('geweigerd', type(e).__name__)`],
  ];
  for (const [naam, code] of py) {
    const r = await inKernel(s, b, code);
    meld(!r.includes("GELUKT"), naam, r.trim().slice(0, 90));
  }
  const fs = await inKernel(s, b, `import os\nprint(sorted(os.listdir('/')))\nprint(os.path.exists('C:/Windows'), os.path.exists('/mnt'), os.getcwd())`);
  console.log(`     Python ziet: ${fs.trim().replace(/\n/g, " | ")}`);
  meld(!/Users|Windows'/.test(fs), "Python ziet de bestanden van de computer niet");

  kop("Afscherming: script uit de uitvoer van een cel");
  await voerAllesUit(s, b);
  await s.wachtOp(() => s.voerUit(`document.querySelector('#vet') ? 1 : 0`, b), { tekst: "de uitvoer van blad B", ms: 60000 });
  await s.voerUit(`document.querySelector('#kl')?.click()`, b);
  await wacht(3000);
  meld(await s.voerUit(`document.querySelector('#vet').textContent`, b) === "zichtbaar", "de HTML zelf staat er wel");
  meld((await s.voerUit(`String(window.__js)`, b)) === "undefined", "JavaScript, script, onerror, onload, javascript:-adres en srcdoc starten niet");
  meld((await s.voerUit(`document.querySelector('.jp-Notebook').innerText`, b)).includes("vega-tekst"), "Vega valt terug op zijn tekst");

  kop("Afscherming: navigeren");
  // Vanuit blad C, en deze volgorde: de laatste laat een foutpagina in de iframe achter.
  for (const [naam, js] of [
    ["de iframe kan het hoofdvenster niet wegsturen", `top.location.href = 'http://127.0.0.1:${POST}/top'`],
    ["de iframe kan zijn omhulsel niet wegsturen", `parent.location.href = 'http://127.0.0.1:${POST}/ouder'`],
    ["de iframe kan niet naar buiten navigeren", `location.href = 'http://127.0.0.1:${POST}/nav?geheim=1'`],
  ]) {
    await s.voerUit(`(() => { try { ${js}; return 'poging'; } catch (e) { return 'geweigerd'; } })()`, c).catch(() => "weg");
    await wacht(1500);
    const nu = await s.voerUit(`location.href`, c).catch(() => "foutpagina");
    meld(!nu.includes(`127.0.0.1:${POST}`) && (await s.voerUit("location.href")) === hoofdUrl, naam, nu);
  }

  await wacht(2500);
  meld(hits.length === 0, "de luisterpost heeft niets ontvangen", hits.join(", "));

  kop("Afdrukvoorbeeld uit de opgeslagen uitvoer");
  await kiesBlad(s, "Blad A");
  await s.voerUit(`[...document.querySelectorAll('.split-tab')].find((b) => /Print preview|Afdrukvoorbeeld/.test(b.textContent)).click()`);
  await s.wachtOp(() => s.voerUit(`document.querySelector('.print-opmaak .nb-beeld img') ? 1 : 0`), { tekst: "het voorbeeld", ms: 30000 });
  await wacht(1500);
  const papier = await s.voerUit(`document.querySelector('.print-opmaak').innerText`);
  meld(papier.includes("Doorbuiging") && papier.includes("import numpy") && papier.includes("22.5"), "tekst, code en uitvoer staan op papier");
  meld(await s.voerUit(`document.querySelector('.print-opmaak .nb-beeld img').naturalWidth > 100 ? 1 : 0`) === 1, "de afbeelding ook");
  meld(await s.voerUit(`document.querySelector('.print-opmaak table') ? 1 : 0`) === 1, "en de tabel");
  await foto("2-afdrukvoorbeeld.png");
  await s.voerUit(`[...document.querySelectorAll('.split-tab')].find((b) => /^Jupyter$/.test(b.textContent.trim())).click()`);
  await s.voerUit(`document.querySelector('.jupyter-keuze input').click()`);
  await s.voerUit(`[...document.querySelectorAll('.split-tab')].find((b) => /Print preview|Afdrukvoorbeeld/.test(b.textContent)).click()`);
  await wacht(1500);
  const zonderCode = await s.voerUit(`document.querySelector('.print-opmaak').innerText`);
  meld(!zonderCode.includes("import numpy") && zonderCode.includes("22.5"), "de keuze zonder code: de code weg, de uitvoer blijft");
  await s.voerUit(`[...document.querySelectorAll('.split-tab')].find((b) => /^Jupyter$/.test(b.textContent.trim())).click()`);
  meld(await s.voerUit(`window.__nietHerladen`, a) === 1, "de iframe bleef ook tijdens het afdrukvoorbeeld leven");

  kop("In het rapport");
  await s.voerUit(`[...document.querySelectorAll('.pb-naam')].find((e) => /^(Rapport|Report|報告)$/.test(e.textContent.trim())).closest('button').click()`);
  await wacht(500);
  await s.voerUit(`[...document.querySelectorAll('.split-tab')].find((b) => /Print preview|Afdrukvoorbeeld|列印預覽/.test(b.textContent)).click()`);
  await s.wachtOp(() => s.voerUit(`[...document.querySelectorAll('.av-pagina-inhoud .nb-beeld img')].some((i) => i.naturalWidth > 100) ? 1 : 0`), { tekst: "het rapport", ms: 40000 });
  meld(true, "de notebooks staan in het rapport, met hun afbeelding");
  await s.voerUit(`document.querySelector('.av-pagina-inhoud .nb-beeld img').scrollIntoView({ block: 'center' })`);
  await wacht(500);
  await foto("3-rapport.png");
  await s.voerUit(`[...document.querySelectorAll('.split-tab')].find((b) => /^(Rapport|Report|報告)$/.test(b.textContent.trim())).click()`);

  kop("Een omgeving die niet meer antwoordt");
  await kiesBlad(s, "Blad C");
  await s.wachtOp(() => s.voerUit(`document.querySelector('.jupyter-stil') ? 1 : 0`), { tekst: "de melding", ms: 40000 });
  meld(true, "de werkruimte meldt het, en het opslaan wachtte hoogstens een keer");
  await s.voerUit(`document.querySelector('.jupyter-stil button').click()`);
  const nieuwC = await frameOp(s, urlC);
  await s.wachtOp(() => s.voerUit(`document.querySelector('.jp-Notebook') ? 1 : 0`, nieuwC), { tekst: "notebook C", ms: 90000 });
  meld(await s.voerUit(`document.querySelector('.jupyter-stil') ? 0 : 1`) === 1, "opnieuw laden herstelt de omgeving uit het project");

  kop("Ongedaan maken in het project");
  await kiesBlad(s, "Blad A");
  await wacht(500);
  // Ongedaan maken loopt per wijziging, en de bladen B en C kwamen later dan A.
  const nieuwA = await s.wachtOp(async () => {
    await s.voerUit(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }))`);
    await wacht(2500);
    const f = await frameOp(s, urlA);
    const klaar = await s.voerUit(`(window.__nietHerladen === undefined && document.querySelector('.jp-Notebook')) ? 1 : 0`, f).catch(() => 0);
    return klaar ? f : null;
  }, { tekst: "de herladen iframe", ms: 60000, stap: 200 });
  meld(true, "de werkmap veranderde van buitenaf: de omgeving laadt opnieuw");
  await s.wachtOp(() => s.voerUit(`document.querySelectorAll('.jp-Cell').length >= 4 ? 1 : 0`, nieuwA), { tekst: "de cellen", ms: 30000 });
  meld(await s.voerUit(`document.querySelectorAll('.jp-Cell').length`, nieuwA) === 4, "en toont de eerdere stand uit het project");
} catch (err) {
  meld(false, `onverwacht: ${err.message}`);
  await foto("fout.png").catch(() => {});
} finally {
  app.stop();
}

// ── Opnieuw openen ───────────────────────────────────────────────────────────
await wacht(2000);
kop("Opnieuw openen");
const app2 = await startApp({ exe, map: OPSLAG, argumenten: [PROJECT], poort: 9378 });
const s2 = app2.sessie;
try {
  await s2.wachtOp(() => s2.voerUit(`[...document.querySelectorAll('.pb-naam')].some((e) => e.textContent.includes('Blad A')) ? 1 : 0`), { tekst: "de projectboom", ms: 60000 });
  await kiesBlad(s2, "Blad A");
  const a = await frameVan(s2, 1);
  // JupyterLab tekent alleen wat in beeld staat: eerst de cel met de afbeelding in beeld.
  await s2.wachtOp(() => s2.voerUit(`window.jupyterapp?.shell.currentWidget?.content?.widgets?.length === 4 ? 1 : 0`, a), { tekst: "de cellen", ms: 90000 });
  await s2.voerUit(`window.jupyterapp.shell.currentWidget.content.scrollToItem(1, 'start')`, a);
  await s2.wachtOp(() => s2.voerUit(`document.querySelector('.jp-RenderedImage img') ? 1 : 0`, a), { tekst: "de afbeelding", ms: 30000 });
  meld(true, "het notebook toont de opgeslagen afbeelding, zonder iets uit te voeren");
  const tekst = await s2.voerUit(`document.querySelector('.jp-Notebook').innerText`, a);
  meld(tekst.includes("22.5"), "en de tekstuitvoer");
  const lijst = await s2.voerUit(`[...document.querySelectorAll('.jp-DirListing-itemName')].map((e) => e.textContent).join()`, a);
  meld(["helper.py", "uit.txt", "data", "notebook.ipynb"].every((n) => lijst.includes(n)), "alle bestanden staan er weer", lijst);
  await s2.voerUit(`[...document.querySelectorAll('.split-tab')].find((b) => /Print preview|Afdrukvoorbeeld/.test(b.textContent)).click()`);
  await s2.wachtOp(() => s2.voerUit(`document.querySelector('.print-opmaak .nb-beeld img') ? 1 : 0`), { tekst: "het voorbeeld", ms: 30000 });
  meld(true, "het afdrukvoorbeeld werkt na opnieuw openen");
  await s2.voerUit(`[...document.querySelectorAll('.split-tab')].find((b) => /^Jupyter$/.test(b.textContent.trim())).click()`);
  await wacht(8000);
  meld(await s2.voerUit(`document.querySelector('.document-tab-modified') ? 0 : 1`) === 1, "alleen openen telt niet als wijziging");
  await s2.voerUit(`[...document.querySelectorAll('.split-tab')].find((b) => /Print preview|Afdrukvoorbeeld/.test(b.textContent)).click()`);
  await wacht(1000);
  writeFileSync(join(UIT, "4-heropend-afdruk.png"), await s2.foto());
  await s2.voerUit(`[...document.querySelectorAll('.split-tab')].find((b) => /^Jupyter$/.test(b.textContent.trim())).click()`);

  kop("Een nieuw blad");
  const aantal = () => s2.voerUit(`document.querySelectorAll('.pb-blad').length`);
  const voor = await aantal();
  await s2.voerUit(`document.querySelector('.pb-blad-toevoegen button').click()`);
  await s2.wachtOp(() => s2.voerUit(`document.querySelector('.rekentaal-menu-rij') ? 1 : 0`), { tekst: "het menu", ms: 5000 });
  await s2.voerUit(`[...document.querySelectorAll('.rekentaal-menu-rij')].find((b) => /^(Jupyter notebook|Jupyter-notebook)$/.test(b.textContent.trim())).click()`);
  await s2.wachtOp(async () => (await aantal()) === voor + 1, { tekst: "het nieuwe blad", ms: 10000 });
  meld(true, "vanuit de projectboom");
  const nieuw = await frameVan(s2, 2);
  await s2.wachtOp(() => s2.voerUit(`document.querySelector('.jp-Notebook')?.innerText.includes('matplotlib') ? 1 : 0`, nieuw), { tekst: "de startcel", ms: 90000 });
  meld(await s2.voerUit(`document.querySelectorAll('.jp-OutputArea-output').length === 0 ? 1 : 0`, nieuw) === 1, "het opent een notebook met een startcel, en die heeft niet gedraaid");
  await s2.voerUit(`document.querySelector('.pb-blad-toevoegen button').click()`);
  await s2.wachtOp(() => s2.voerUit(`document.querySelector('.rekentaal-menu-rij') ? 1 : 0`), { tekst: "het menu", ms: 5000 });
  await s2.voerUit(`[...document.querySelectorAll('.rekentaal-menu-rij')].find((b) => /^Module/.test(b.textContent.trim())).click()`);
  const tegel = `[...document.querySelectorAll('.mk-tegel')].find((b) => b.textContent.includes('Jupyter'))`;
  await s2.wachtOp(() => s2.voerUit(`${tegel} ? 1 : 0`), { tekst: "de tegel", ms: 10000 });
  await s2.voerUit(`${tegel}.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))`);
  await s2.wachtOp(async () => (await aantal()) === voor + 2, { tekst: "het blad uit Module toevoegen", ms: 10000 });
  meld(true, "en vanuit Module toevoegen");
} catch (err) {
  meld(false, `onverwacht: ${err.message}`);
  writeFileSync(join(UIT, "fout2.png"), await s2.foto());
} finally {
  app2.stop();
}

web.close();
udp.close();
console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
