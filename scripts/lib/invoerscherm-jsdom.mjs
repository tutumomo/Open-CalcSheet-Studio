/**
 * Het invoerscherm van een rekenblad in jsdom, zonder browser en zonder dev-server.
 *
 * Bundelt het echte scherm (components/calc/invoer/) met esbuild en tekent het met
 * react-dom in jsdom, met de echte projectstore. De rekenworker draait in hetzelfde
 * proces: de module zet `self.onmessage`, en een nagebootste `Worker` roept die aan. Zo
 * loopt een controle dezelfde weg als de app: typen in een veld, wachten, de waarde in het
 * blad, de doorrekening en de velden die daaruit terugkomen.
 *
 * De bundel is gebouwd zoals scripts/lib/rapport-html.mjs dat voor het rapport doet; wat
 * vite regelt en esbuild niet kent, staat daar toegelicht. jsdom meet niets: het beeld
 * tekent op zijn beginmaat, en de indeling in de breedte is hier niet te zien.
 */
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { build } from "esbuild";
import { JSDOM } from "jsdom";

const hier = dirname(fileURLToPath(import.meta.url));
const SRC = join(hier, "../../packages/desktop/src");

const leesOfLeeg = (pad) => {
  try {
    return readFileSync(pad, "utf8");
  } catch {
    return "";
  }
};

const viteAchtervoegsels = {
  name: "vite-achtervoegsels",
  setup(b) {
    b.onResolve({ filter: /\?(raw|url)$/ }, (a) => {
      const [pad, soort] = a.path.split("?");
      return { path: resolve(a.resolveDir, pad), namespace: `vite-${soort}` };
    });
    b.onLoad({ filter: /.*/, namespace: "vite-raw" }, (a) => ({ contents: `export default ${JSON.stringify(leesOfLeeg(a.path))};`, loader: "js" }));
    b.onLoad({ filter: /.*/, namespace: "vite-url" }, () => ({ contents: 'export default "";', loader: "js" }));
    b.onLoad({ filter: /ModuleAfbeelding\.tsx$/ }, (a) => ({
      contents: readFileSync(a.path, "utf8").replace(/import\.meta\.glob\([\s\S]*?\)\s*(as [^;]+)?;/, "({});"),
      loader: "tsx",
    }));
  },
};

const INGANG = `
  import { flushSync } from "react-dom";
  import { createRoot } from "react-dom/client";
  import i18next from "./i18n/config";
  import { useProjectStore } from "./store/projectStore";
  import { invoerSchermVoor } from "./components/calc/invoer/invoerScherm";
  import { rekenversie } from "./components/calc/bladVersie";
  // De rekenworker in dit proces: zet self.onmessage (zie de nagebootste Worker hieronder).
  import "./rekenen/rekenWorker";

  export { i18next, useProjectStore, rekenversie };

  /** Tekent het invoerscherm van een blad, zoals de werkruimte het kiest. */
  export function teken(ex) {
    const plek = document.createElement("div");
    document.body.append(plek);
    const wortel = createRoot(plek);
    const keuze = invoerSchermVoor(ex);
    flushSync(() => wortel.render(keuze ? keuze.scherm : null));
    return {
      plek,
      metBeeld: keuze ? keuze.metBeeld : null,
      sluit: () => {
        flushSync(() => wortel.unmount());
        plek.remove();
      },
    };
  }
`;

/**
 * De bundel, geladen in jsdom. Geeft `teken(ex)`, de store, i18next, `rekenversie`, het
 * venster van jsdom, `rondes()` (hoe vaak de worker is gevraagd te rekenen) en
 * `fouten` (wat er naar console.error ging).
 */
export async function laadInvoerscherm() {
  const map = mkdtempSync(join(tmpdir(), "invoerscherm-"));
  const uit = join(map, "invoerscherm.mjs");
  try {
    await build({
      stdin: { contents: INGANG, resolveDir: SRC, loader: "tsx" },
      bundle: true,
      outfile: uit,
      format: "esm",
      platform: "node",
      mainFields: ["module", "main"],
      conditions: ["browser", "import", "default"],
      jsx: "automatic",
      logLevel: "error",
      plugins: [viteAchtervoegsels],
      loader: {
        ".css": "empty", ".png": "dataurl", ".svg": "text", ".webp": "dataurl", ".woff": "empty", ".woff2": "empty", ".ttf": "empty",
        ".wasm": "empty", ".geojson": "text",
      },
      define: {
        __LIBRARY_DEV__: '""',
        "import.meta.env.DEV": "false",
        "import.meta.env.BASE_URL": '"/"',
      },
      banner: { js: "import { createRequire as __maakRequire } from 'node:module'; const require = __maakRequire(import.meta.url);" },
    });
    const { window } = new JSDOM("<!doctype html><html><body></body></html>", { url: "http://localhost/", pretendToBeVisual: true });
    for (const naam of ["window", "document", "navigator", "localStorage", "HTMLElement", "Element", "Node", "getComputedStyle", "DOMParser", "CustomEvent", "Event", "requestAnimationFrame", "cancelAnimationFrame", "matchMedia", "MutationObserver", "Range", "DOMRect", "getSelection", "Text"]) {
      Object.defineProperty(globalThis, naam, { value: window[naam], configurable: true, writable: true });
    }
    window.matchMedia = window.matchMedia ?? (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
    globalThis.matchMedia = window.matchMedia;
    globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };

    // De rekenworker: een bericht gaat een tel later naar self.onmessage van de module, en
    // het antwoord een tel later terug, als kopie zoals tussen twee threads.
    let werker = null;
    let rondes = 0;
    globalThis.self = globalThis;
    globalThis.postMessage = (antwoord) => setTimeout(() => werker?.onmessage?.({ data: structuredClone(antwoord) }), 0);
    globalThis.Worker = class {
      constructor() {
        werker = this;
      }
      postMessage(verzoek) {
        rondes++;
        setTimeout(() => globalThis.onmessage({ data: structuredClone(verzoek) }), 0);
      }
    };

    const fouten = [];
    const echt = console.error;
    console.error = (...delen) => fouten.push(delen.map(String).join(" ").slice(0, 300));

    const module = await import(pathToFileURL(uit).href);
    // De app zet bij het opstarten de bewaarde taal en stand terug; dat moet eerst klaar zijn.
    await new Promise((klaar) => setTimeout(klaar, 200));
    return { ...module, window, rondes: () => rondes, fouten, herstelConsole: () => (console.error = echt) };
  } finally {
    // Node houdt de geladen module in het geheugen; het bestand kan weg.
    rmSync(map, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
