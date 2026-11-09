/**
 * rapport-pdf — maakt zonder printdialoog een PDF van het constructierapport
 * van een projectbestand.
 *
 * Het script start een geïnstalleerde Chrome of Edge headless, stuurt die via
 * het DevTools-protocol aan (met de ingebouwde WebSocket van Node, dus zonder
 * extra afhankelijkheden), laadt het project in de draaiende dev-server en laat
 * de browser de afdruk als PDF wegschrijven. De PDF is daarmee precies wat
 * "Rapport (PDF)" in de app oplevert: dezelfde componenten, dezelfde CSS en
 * dezelfde paginering door Chromium.
 *
 * Gebruik:
 *   node scripts/rapport-pdf.mjs <projectbestand> <uit.pdf>
 *        [--bureau profiel.json] [--url http://localhost:3021] [--browser <pad>]
 *        [--beginwaarden] [--vellen vellen.json] [--knop knop.json] [--schaal 1.5]
 *
 *   --bureau   een bureauprofiel (JSON in de vorm van BureauProfiel); komt in
 *              rapport.bureau, zodat huisstijl en voet van dat profiel gelden.
 *   --url      de dev-server; standaard http://localhost:3021.
 *   --browser  chrome.exe of msedge.exe; standaard de eerste die bestaat van
 *              Chrome en Edge op hun gewone installatieplek.
 *   --beginwaarden  opent eerst elk blad een keer, zodat een parametrisch beeld
 *              zijn beginwaarden invult. Nodig voor een proefproject dat alleen
 *              templateId's heeft; een opgeslagen project heeft zijn invoer al.
 *   --vellen   schrijft per vel uit het voorbeeld het nummer, de tekst en of er
 *              iets afvalt naar een JSON-bestand, om met de PDF te vergelijken.
 *   --knop     gaat eerst de weg van de knop "Rapport (PDF)" in de browser, tot aan de
 *              printdialoog, en daarna die van de knop in de app, met een nagebootste
 *              Rust-schil. Schrijft naar een JSON-bestand wat daar klaarstaat.
 *   --schaal   de schermschaal van de browser (devicePixelRatio); standaard 1. De
 *              verdeling over de vellen meet op het scherm en hangt daar iets van af.
 *
 * Vereist:
 *   • een draaiende dev-server: npm --prefix packages/desktop run dev. Het script
 *     gebruikt de haak `window.__ocs` uit main.tsx, die alleen in dev bestaat.
 *   • een gebouwde core: npm --prefix packages/core run build. De app laadt
 *     packages/core/dist; zonder die map blijft de pagina leeg.
 *   • netwerk voor de lettertypen uit index.html, anders vallen ze terug.
 *
 * Valkuilen die het script afvangt:
 *   • Vite luistert alleen op ::1, dus localhost en niet 127.0.0.1. DevTools
 *     zelf luistert juist op 127.0.0.1.
 *   • De afdruk ruimt zichzelf op: App.tsx roept 250 ms na het starten
 *     window.print() aan en daarna klaar(), waarmee de afdrukweergave weer
 *     verdwijnt. Headless keert print() meteen terug. Daarom worden klaar en
 *     window.print eerst op een no-op gezet.
 *   • Een eigen import("/src/store/…") kan na een hot update een tweede
 *     store-exemplaar laden (met ?t=… in de URL) dat de app nooit leest. Via
 *     __ocs gebruikt het script de exemplaren die de app zelf gebruikt.
 *   • De headless pagina is een extra HMR-client: wijzig geen bronbestanden
 *     terwijl het script loopt, anders herlaadt Vite de pagina halverwege.
 */
import { spawn } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const BROWSERS = [
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
  "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
];
const GEBRUIK =
  "gebruik: node scripts/rapport-pdf.mjs <projectbestand> <uit.pdf> " +
  "[--bureau profiel.json] [--url http://localhost:3021] [--browser <pad>] [--beginwaarden] [--vellen vellen.json] [--knop knop.json] [--schaal 1.5]";

/** Een fout met een uitleg voor de gebruiker: gemeld zonder stacktrace. */
class Stop extends Error {}
const stop = (tekst) => {
  throw new Stop(tekst);
};
const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (tekst) => console.log(`[${(performance.now() / 1000).toFixed(1)} s] ${tekst}`);

/** Meldingen uit de pagina (fouten, mislukte modules); ze helpen bij een lege app. */
const meldingen = [];

function leesArgumenten(argv) {
  const los = [];
  const opties = { bureau: null, url: "http://localhost:3021", browser: null, help: false, beginwaarden: false, vellen: null, knop: null, schaal: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") opties.help = true;
    else if (a === "--beginwaarden") opties.beginwaarden = true;
    else if (a === "--bureau" || a === "--url" || a === "--browser" || a === "--vellen" || a === "--knop" || a === "--schaal") {
      const w = argv[++i];
      if (w === undefined || w.startsWith("--")) stop(`${a} verwacht een waarde.\n${GEBRUIK}`);
      opties[a.slice(2)] = w;
    } else if (a.startsWith("--")) stop(`onbekende optie ${a}.\n${GEBRUIK}`);
    else los.push(a);
  }
  if (opties.help) return { ...opties, project: null, uit: null };
  if (los.length !== 2) stop(`verwacht een projectbestand en een uitvoerbestand.\n${GEBRUIK}`);
  return { ...opties, project: resolve(los[0]), uit: resolve(los[1]) };
}

/** Alles wat vóór het starten van een browser te controleren is. */
async function controleerVooraf(o) {
  if (!existsSync(o.project)) stop(`projectbestand ${o.project} bestaat niet.`);
  if (!existsSync(join(REPO, "packages/core/dist/index.js"))) {
    stop("packages/core/dist ontbreekt: bouw eerst de core met `npm --prefix packages/core run build`. " +
      "Zonder die map blijft de app leeg.");
  }
  const browser = o.browser ?? BROWSERS.find((p) => existsSync(p));
  if (!browser) stop(`geen Chrome of Edge gevonden op ${BROWSERS.join(" of ")}; geef er een op met --browser.`);
  if (!existsSync(browser)) stop(`--browser ${browser} bestaat niet.`);

  let url;
  try {
    url = new URL(o.url);
  } catch {
    stop(`--url ${o.url} is geen geldige URL.`);
  }
  let antwoord;
  try {
    antwoord = await fetch(url, { signal: AbortSignal.timeout(5000) });
  } catch {
    const tip = url.hostname === "127.0.0.1" ? " Vite luistert alleen op ::1; gebruik http://localhost:3021." : "";
    stop(`geen dev-server op ${url.href}: start hem met \`npm --prefix packages/desktop run dev\`.${tip}`);
  }
  const html = await antwoord.text();
  if (!antwoord.ok || !html.includes('id="root"')) stop(`${url.href} geeft geen app-pagina (status ${antwoord.status}).`);

  let bureau = null;
  if (o.bureau) {
    if (!existsSync(o.bureau)) stop(`--bureau ${o.bureau} bestaat niet.`);
    try {
      bureau = JSON.parse(readFileSync(o.bureau, "utf8"));
    } catch (e) {
      stop(`--bureau ${o.bureau} is geen geldige JSON: ${e.message}`);
    }
    if (!bureau || typeof bureau !== "object" || Array.isArray(bureau)) stop(`--bureau ${o.bureau} bevat geen profiel (object).`);
  }

  const raw = readFileSync(o.project, "utf8");
  try {
    const inhoud = JSON.parse(raw);
    if (!inhoud.project && !inhoud.data) log(`let op: ${basename(o.project)} heeft geen project; de app opent het als los blad.`);
  } catch {
    log(`let op: ${basename(o.project)} is geen JSON; de app opent het als losse rekentekst.`);
  }
  return { browser, url: url.href, bureau, raw };
}

/** Start de browser met een eigen, tijdelijk profiel en een vrije debugpoort. */
function startBrowser(pad, profiel, schaal) {
  const proc = spawn(pad, [
    "--headless=new",
    "--remote-debugging-port=0",
    `--user-data-dir=${profiel}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1280,900",
    ...(schaal ? [`--force-device-scale-factor=${schaal}`] : []),
    "about:blank",
  ], { stdio: ["ignore", "ignore", "pipe"] });
  const b = { proc, stderr: "", fout: null, gestopt: false };
  proc.stderr.on("data", (d) => {
    b.stderr = (b.stderr + d).slice(-4000);
  });
  b.einde = new Promise((r) => {
    proc.on("exit", (code) => {
      b.gestopt = true;
      r(code);
    });
    proc.on("error", (e) => {
      b.fout = e;
      b.gestopt = true;
      r(null);
    });
  });
  return b;
}

/** De poort die de browser koos, uit <profiel>/DevToolsActivePort. */
async function debugPoort(b, profiel) {
  const bestand = join(profiel, "DevToolsActivePort");
  for (let i = 0; i < 150; i++) {
    if (b.fout) stop(`kan de browser niet starten: ${b.fout.message}`);
    if (b.gestopt) stop(`de browser stopte meteen.\n${b.stderr.trim()}`);
    if (existsSync(bestand)) {
      const poort = Number(readFileSync(bestand, "utf8").split(/\r?\n/)[0]);
      if (poort > 0) return poort;
    }
    await wacht(100);
  }
  stop(`de browser gaf binnen 15 s geen debugpoort.\n${b.stderr.trim()}`);
}

/** Minimale DevTools-client: commando's met antwoord, en luisteraars voor gebeurtenissen. */
class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.volgende = 0;
    this.open = new Map();
    this.luisteraars = new Set();
    ws.addEventListener("message", (ev) => {
      const b = JSON.parse(typeof ev.data === "string" ? ev.data : Buffer.from(ev.data).toString("utf8"));
      if (b.id !== undefined) {
        const w = this.open.get(b.id);
        if (!w) return;
        this.open.delete(b.id);
        if (b.error) w.nee(new Stop(`${w.methode} mislukte: ${b.error.message}`));
        else w.ja(b.result);
      } else {
        for (const f of [...this.luisteraars]) f(b);
      }
    });
    ws.addEventListener("close", () => {
      for (const w of this.open.values()) w.nee(new Stop("de verbinding met de browser is verbroken."));
      this.open.clear();
    });
  }

  static async verbind(url) {
    const ws = new WebSocket(url);
    await new Promise((ja, nee) => {
      ws.addEventListener("open", ja, { once: true });
      ws.addEventListener("error", () => nee(new Stop(`geen verbinding met ${url}.`)), { once: true });
    });
    return new Cdp(ws);
  }

  stuur(methode, params = {}, sessionId) {
    const id = ++this.volgende;
    this.ws.send(JSON.stringify(sessionId ? { id, method: methode, params, sessionId } : { id, method: methode, params }));
    return new Promise((ja, nee) => this.open.set(id, { ja, nee, methode }));
  }

  wachtOp(filter, ms, wat) {
    return new Promise((ja, nee) => {
      const f = (b) => {
        if (!filter(b)) return;
        klaar();
        ja(b);
      };
      const t = setTimeout(() => {
        klaar();
        nee(new Stop(`${wat} bleef na ${ms / 1000} s uit.`));
      }, ms);
      const klaar = () => {
        clearTimeout(t);
        this.luisteraars.delete(f);
      };
      this.luisteraars.add(f);
    });
  }

  sluit() {
    try {
      this.ws.close();
    } catch {
      // al dicht
    }
  }
}

async function hoofd() {
  const o = leesArgumenten(process.argv.slice(2));
  if (o.help) {
    console.log(GEBRUIK);
    return;
  }
  const { browser: browserPad, url, bureau, raw } = await controleerVooraf(o);
  mkdirSync(dirname(o.uit), { recursive: true });

  const profiel = mkdtempSync(join(tmpdir(), "rapport-pdf-"));
  let browser = null;
  let cdp = null;
  try {
    browser = startBrowser(browserPad, profiel, o.schaal);
    const poort = await debugPoort(browser, profiel);
    const versie = await (await fetch(`http://127.0.0.1:${poort}/json/version`)).json();
    cdp = await Cdp.verbind(versie.webSocketDebuggerUrl);
    log(`${basename(browserPad)} gestart (${versie.Browser})`);

    // Eén tabblad, met een platte sessie: elk paginacommando draagt die sessionId.
    const { targetId } = await cdp.stuur("Target.createTarget", { url: "about:blank" });
    const { sessionId } = await cdp.stuur("Target.attachToTarget", { targetId, flatten: true });
    const pagina = (methode, params) => cdp.stuur(methode, params, sessionId);
    cdp.luisteraars.add((b) => {
      if (b.sessionId !== sessionId) return;
      if (b.method === "Runtime.exceptionThrown") {
        const d = b.params.exceptionDetails;
        meldingen.push(`uitzondering: ${d.exception?.description ?? d.text}`);
      } else if (b.method === "Runtime.consoleAPICalled" && b.params.type === "error") {
        meldingen.push(`console.error: ${b.params.args.map((a) => a.value ?? a.description ?? "").join(" ")}`);
      } else if (b.method === "Log.entryAdded" && b.params.entry.level === "error") {
        // Een module die niet laadt (404) verschijnt alleen hier.
        const e = b.params.entry;
        meldingen.push(`${e.source}: ${e.text}${e.url ? ` (${e.url})` : ""}`);
      }
    });
    await pagina("Page.enable");
    await pagina("Runtime.enable");
    await pagina("Log.enable");

    const evalueer = async (expressie, wat) => {
      const r = await pagina("Runtime.evaluate", { expression: expressie, awaitPromise: true, returnByValue: true });
      if (r.exceptionDetails) {
        stop(`${wat} mislukte in de pagina: ${r.exceptionDetails.exception?.description ?? r.exceptionDetails.text}`);
      }
      return r.result.value;
    };
    const wachtTot = async (expressie, ms, fout) => {
      const tot = performance.now() + ms;
      while (performance.now() < tot) {
        if (await evalueer(expressie, "wachten")) return;
        await wacht(100);
      }
      stop(fout);
    };

    const geladen = cdp.wachtOp((b) => b.sessionId === sessionId && b.method === "Page.loadEventFired", 30000, "het laden van de app");
    const nav = await pagina("Page.navigate", { url });
    if (nav.errorText) stop(`${url} laden mislukte: ${nav.errorText}.`);
    await geladen;
    await wachtTot("(document.getElementById('root')?.childElementCount ?? 0) > 0", 20000,
      "de app verscheen niet (#root bleef leeg). Meestal ontbreekt packages/core/dist of laadt een module niet; zie de meldingen.");
    await wachtTot("typeof window.__ocs === 'object' && window.__ocs !== null", 5000,
      "window.__ocs ontbreekt. main.tsx zet die haak alleen in de dev-server (import.meta.env.DEV); " +
      "draait er een productie-build, of een versie van vóór de haak?");
    log("app geladen");

    const geladenProject = await evalueer(`(() => {
      const { useProjectStore, leesProjectBestand } = window.__ocs;
      useProjectStore.getState().laadProject(leesProjectBestand(${JSON.stringify(raw)}, ${JSON.stringify(basename(o.project, extname(o.project)))}));
      const bureau = ${JSON.stringify(bureau)};
      if (bureau) {
        // Het profiel wordt de vastgelegde kopie van dit rapport, net als
        // "Bijwerken uit bureauprofiel"; ontbrekende velden houden hun waarde.
        useProjectStore.getState().werkRapportBij((r) => ({
          ...r,
          bureau: { ...r.bureau, ...bureau, huisstijl: { ...r.bureau.huisstijl, ...(bureau.huisstijl ?? {}) } },
        }));
      }
      const s = useProjectStore.getState();
      return {
        naam: s.projectNaam,
        bladen: s.exemplaren.length,
        rapport: !!s.rapport && typeof s.rapport === "object",
        bureau: s.rapport?.bureau?.naam ?? "",
      };
    })()`, "het project laden");
    if (!geladenProject.rapport) stop("na het laden heeft het project geen rapport; heeft de dev-server de rapportstore al?");
    log(`project "${geladenProject.naam}" geladen: ${geladenProject.bladen} bladen` +
      (geladenProject.bureau ? `, bureau "${geladenProject.bureau}"` : ", bureau uit het live profiel"));

    if (o.beginwaarden) {
      // Een beeld vult zijn beginwaarden pas in als zijn blad actief is.
      const gevuld = await evalueer(`(async () => {
        const { useProjectStore } = window.__ocs;
        for (const e of useProjectStore.getState().exemplaren) {
          useProjectStore.getState().selecteer(e.id);
          await new Promise((r) => setTimeout(r, 900));
        }
        return useProjectStore.getState().exemplaren.length;
      })()`, "de bladen openen");
      log(`${gevuld} bladen geopend voor de beginwaarden van hun beeld`);
    }

    if (o.knop) {
      // De weg van de knop zelf, vanuit een koude start: de printdialoog wordt hier
      // een stand opnemen, en een melding komt niet op het scherm maar in het bestand.
      const knop = await evalueer(`(async () => {
        const { usePrintStore } = window.__ocs;
        const oudePrint = window.print;
        const oudeAlert = window.alert;
        const uitkomst = await new Promise((klaar) => {
          window.alert = (melding) => klaar({ melding: String(melding) });
          window.print = () => {
            const vellen = [...document.querySelectorAll(".rpa-drukvellen .av-pagina")];
            const beelden = [...document.querySelectorAll(".rpa-drukvellen img")];
            klaar({
              melding: null,
              nummers: vellen.map((v) => v.querySelector(".av-rapport-nummer")?.textContent ?? ""),
              inhoud: vellen[1] ? [...vellen[1].querySelectorAll("[data-inhoud-doel]")].map((e) => e.textContent) : [],
              beeldenNietKlaar: beelden.filter((b) => !b.complete).length,
              laadt: document.querySelectorAll(".rpa-drukvellen [data-afdruk-laadt]").length,
            });
          };
          usePrintStore.getState().afdrukken(null, "rapport");
        });
        // Het opruimen na de printdialoog afwachten; daarna opent het voorbeeld gewoon weer.
        for (let i = 0; i < 50 && usePrintStore.getState().bezig; i++) await new Promise((r) => setTimeout(r, 100));
        window.print = oudePrint;
        window.alert = oudeAlert;

        // De knop in de app: de dialoog en het schrijven komen hier uit een nagebootste
        // Rust-schil, die opneemt wat er op dat moment klaarstaat.
        const knopInApp = async ({ dialoog, schrijven, start }) => {
          const r = { bestandsnamen: [], geschreven: [], print: [], meldingen: [] };
          const stand = () => {
            const vellen = [...document.querySelectorAll(".rpa-drukvellen .av-pagina")];
            const kopie = document.querySelector(".rpa-drukvellen");
            return {
              nummers: vellen.map((v) => v.querySelector(".av-rapport-nummer")?.textContent ?? ""),
              beeldenNietKlaar: [...document.querySelectorAll(".rpa-drukvellen img")].filter((b) => !b.complete).length,
              appZichtbaar: getComputedStyle(document.getElementById("root")).display !== "none",
              kopieBuitenBeeld: kopie ? kopie.getBoundingClientRect().right <= 0 : null,
              status: document.querySelector(".status-bar-left .status-item-label")?.textContent ?? "",
            };
          };
          window.alert = (melding) => r.meldingen.push(String(melding));
          window.print = () => r.print.push({ ...stand(), meldingenVooraf: r.meldingen.length });
          window.__TAURI_INTERNALS__ = {
            invoke: async (opdracht, args) => {
              if (opdracht === "rapport_pdf_beschikbaar") return true;
              if (opdracht === "plugin:dialog|save") {
                r.bestandsnamen.push(args.options.defaultPath);
                return dialoog;
              }
              if (opdracht === "plugin:dialog|message") {
                // De gebruiker leest de melding even: pas daarna mag de printdialoog komen.
                await new Promise((klaar) => setTimeout(klaar, 200));
                r.meldingen.push(args.message);
                return "Ok";
              }
              if (opdracht === "rapport_pdf_schrijven") {
                r.geschreven.push({ pad: args.pad, ...stand() });
                return schrijven();
              }
              throw new Error("onverwachte opdracht: " + opdracht);
            },
          };
          try {
            start();
            // De knop begint met een vraag aan de schil en de dialoog: pas daarna is hij bezig.
            await new Promise((klaar) => setTimeout(klaar, 500));
            for (let i = 0; i < 600 && usePrintStore.getState().bezig; i++) await new Promise((klaar) => setTimeout(klaar, 100));
            r.bezig = usePrintStore.getState().bezig;
            await new Promise((klaar) => setTimeout(klaar, 100));
            r.statusNa = document.querySelector(".status-bar-left .status-item-label")?.textContent ?? "";
            r.pdfGeschreven = usePrintStore.getState().pdfGeschreven;
          } finally {
            delete window.__TAURI_INTERNALS__;
            window.print = oudePrint;
            window.alert = oudeAlert;
          }
          return r;
        };
        const klikKnop = () => {
          const knop = [...document.querySelectorAll(".ribbon-btn")].find((b) => /^(Rapport|Report|報告)$/.test(b.textContent.trim()));
          if (!knop) throw new Error("de knop Rapport staat niet in het lint");
          knop.click();
        };
        uitkomst.bestand = await knopInApp({ dialoog: "C:\\\\proef\\\\rapport", schrijven: () => 1234, start: klikKnop });
        uitkomst.terugval = await knopInApp({ dialoog: "C:\\\\proef\\\\rapport.PDF", schrijven: () => { throw "Schijf vol"; }, start: klikKnop });
        uitkomst.geannuleerd = await knopInApp({ dialoog: null, schrijven: () => 1234, start: klikKnop });
        // Wat de MCP-tool print en Ctrl+P doen: geen bestandsnaam, dus de printdialoog, ook in de app.
        uitkomst.zonderBestand = await knopInApp({ dialoog: null, schrijven: () => 1234, start: () => usePrintStore.getState().afdrukken(null, "rapport") });
        return uitkomst;
      })()`, "de weg van de knop");
      writeFileSync(resolve(o.knop), JSON.stringify(knop));
    }

    // Zelfde weg als "Rapport (PDF)" in de app: het afdrukvoorbeeld bouwt de
    // vellen, en een kopie daarvan gaat naar de printer (drukvellen.ts).
    await evalueer(`(async () => {
      const { useProjectStore, usePrintStore, wachtOpVellen, zetDrukvellenKlaar } = window.__ocs;
      useProjectStore.getState().selecteer("__rapport__");
      usePrintStore.getState().toonVoorbeeld(null, "rapport");
      await document.fonts.ready;
      await new Promise((r) => setTimeout(r, 1500));
      zetDrukvellenKlaar(await wachtOpVellen(20000));
      return true;
    })()`, "de vellen van het rapport klaarzetten");

    const staat = await evalueer(`(async () => {
      await document.fonts.ready;
      await window.__ocs.wachtOpDrukbeelden();
      // De parametrische beelden meten zich met een ResizeObserver: die vuurt
      // pas na een opmaakronde. Twee frames plus een halve seconde; zonder
      // zichtbaar venster valt requestAnimationFrame terug op de timer.
      await new Promise((r) => { requestAnimationFrame(() => requestAnimationFrame(r)); setTimeout(r, 1000); });
      await new Promise((r) => setTimeout(r, 500));
      const wortel = document.querySelector(".rpa-drukvellen");
      return {
        afdrukmodus: document.documentElement.classList.contains("rapportdruk"),
        secties: wortel ? wortel.querySelectorAll(".av-pagina").length : 0,
        tekens: wortel ? wortel.textContent.length : 0,
        lettertypen: [...new Set([...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family))],
      };
    })()`, "wachten op lettertypen en beelden");
    if (!staat.afdrukmodus) stop("html.rapportdruk staat niet aan: de vellen staan niet klaar.");
    if (staat.tekens === 0) stop("de afdrukweergave van het rapport is leeg.");
    log(`vellen klaar: ${staat.secties} vellen, lettertypen ${staat.lettertypen.join(", ") || "(systeem)"}`);

    if (o.vellen) {
      const vellen = await evalueer(`[...document.querySelectorAll(".rpa-drukvellen .av-pagina")].map((vel) => {
        const inhoud = vel.querySelector(".av-pagina-inhoud");
        return {
          nummer: vel.querySelector(".av-rapport-nummer")?.textContent ?? "",
          tekst: inhoud?.textContent ?? "",
          formules: inhoud?.querySelector(".katex") !== null,
          loopt: inhoud ? inhoud.scrollHeight - inhoud.clientHeight : 0,
        };
      })`, "de vellen lezen");
      writeFileSync(resolve(o.vellen), JSON.stringify(vellen));
    }

    // Als stroom: een rapport met twintig bladen en beelden past niet prettig
    // in één base64-antwoord.
    const { stream } = await pagina("Page.printToPDF", {
      preferCSSPageSize: true,
      printBackground: true,
      transferMode: "ReturnAsStream",
    });
    const delen = [];
    for (;;) {
      const { data, base64Encoded, eof } = await pagina("IO.read", { handle: stream, size: 1 << 20 });
      delen.push(Buffer.from(data, base64Encoded ? "base64" : "utf8"));
      if (eof) break;
    }
    await pagina("IO.close", { handle: stream });
    const pdf = Buffer.concat(delen);
    if (pdf.subarray(0, 5).toString("latin1") !== "%PDF-") stop("de browser gaf geen PDF terug.");
    writeFileSync(o.uit, pdf);
    const paginas = (pdf.toString("latin1").match(/\/Type\s*\/Page(?!s)/g) ?? []).length;
    log(`PDF geschreven: ${o.uit} (${paginas} pagina's, ${Math.round(pdf.length / 1024)} kB)`);
  } finally {
    if (cdp) {
      await Promise.race([cdp.stuur("Browser.close").catch(() => {}), wacht(3000)]);
      cdp.sluit();
    }
    if (browser && !browser.gestopt) {
      const code = await Promise.race([browser.einde, wacht(10000).then(() => "loopt nog")]);
      if (code === "loopt nog") browser.proc.kill();
      await wacht(300);
    }
    try {
      rmSync(profiel, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
    } catch (e) {
      console.warn(`let op: tijdelijk browserprofiel ${profiel} kon niet weg: ${e.message}`);
    }
  }
}

try {
  await hoofd();
} catch (e) {
  if (e instanceof Stop) console.error(`rapport-pdf: ${e.message}`);
  else console.error(`rapport-pdf: onverwachte fout: ${e?.stack ?? e}`);
  if (meldingen.length) {
    console.error("meldingen uit de pagina:");
    for (const m of meldingen.slice(0, 15)) console.error(`  - ${m.slice(0, 400)}`);
  }
  process.exitCode = 1;
}
