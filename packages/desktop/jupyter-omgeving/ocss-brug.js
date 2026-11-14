/*
 * De brug tussen de app en de Jupyter-omgeving. Komt met een script-tag in
 * lab/index.html (scripts/bouw-jupyter-omgeving.mjs) en draait dus in de iframe
 * van een Jupyter-blad, niet in de app.
 *
 * De bestanden staan in het geheugen van de omgeving (jupyter-lite.json): het
 * projectbestand is de enige bewaarplek. De app stuurt ze hierheen en vraagt de
 * laatste stand terug; zie components/calc/JupyterVenster.tsx.
 *
 * Van de app:     laad { bestanden, open, automatisch }, vraagStand { id }, thema { donker }, automatisch { aan },
 *                 voerUit { id } (alles draaien, dan stand { id, bestanden })
 * Naar de app:    gereed, geladen, stand { id, bestanden }, gewijzigd, opslaan, fout { melding }
 *
 * Code in deze pagina kan dezelfde berichten sturen. De app behandelt ze daarom als
 * invoer van buiten: ze raken alleen de werkmap van dit blad.
 */
(function () {
  "use strict";

  const BRON = "ocss-jupyter";
  const THEMA = { licht: "JupyterLab Light", donker: "JupyterLab Dark" };
  /** Bestanden die als tekst in de omgeving horen, om ze in de editor te kunnen openen. */
  const TEKST = /\.(py|pyi|txt|md|markdown|csv|tsv|json|ya?ml|toml|ini|cfg|html?|css|js|ts|tex|xml|svg|rst|log|dat)$/i;

  /**
   * Python onthoudt per map welke bestanden erin staan en kijkt pas opnieuw als de
   * wijzigingstijd van de map verandert. Die is op /drive altijd 0, dus een script dat
   * er na de eerste import bijkomt, bleef onvindbaar (ModuleNotFoundError). Deze
   * terugval komt pas aan de beurt als een import mislukt, en zoekt dan nog één keer.
   * De laatste regel houdt de nummers van de cellen gelijk: dit telt niet als cel.
   */
  const ZOEK_OPNIEUW = `def _ocss_zoek_opnieuw():
    import importlib, importlib.machinery, sys
    class ZoekOpnieuw:
        @staticmethod
        def find_spec(naam, pad=None, doel=None):
            importlib.invalidate_caches()
            return importlib.machinery.PathFinder.find_spec(naam, pad, doel)
    if not any(getattr(f, "__name__", "") == "ZoekOpnieuw" for f in sys.meta_path):
        sys.meta_path.append(ZoekOpnieuw)
_ocss_zoek_opnieuw()
del _ocss_zoek_opnieuw
get_ipython().execution_count -= 1`;

  /** Zo lang na de laatste wijziging in de code begint een automatische ronde. */
  const PAUZE_MS = 800;

  let app = null;
  let bezig = false;
  let appHerkomst = "*";
  let automatisch = false;
  const gevolgd = new WeakSet();
  /** Per open notebook: wat de laatste ronde uitvoerde, en of er een ronde loopt. */
  const notebooks = new Map();

  /** Zet de terugval in elke kernel van een notebook, ook na herstarten. */
  function volgKernel(widget) {
    const sessie = widget?.sessionContext;
    if (!sessie || gevolgd.has(sessie)) return;
    gevolgd.add(sessie);
    const zet = () => {
      const kernel = sessie.session?.kernel;
      if (kernel) kernel.requestExecute({ code: ZOEK_OPNIEUW, silent: true, store_history: false }, true).done.catch(() => {});
    };
    sessie.kernelChanged.connect(zet);
    sessie.statusChanged.connect((_, status) => {
      if (status === "restarting" || status === "autorestarting") zet();
    });
    sessie.ready.then(zet, () => {});
  }

  /** De code van alle cellen: tekstcellen en uitvoer starten geen ronde. */
  function codeVan(paneel) {
    return paneel.model.sharedModel.cells
      .filter((cel) => cel.cell_type === "code")
      .map((cel) => cel.getSource())
      .join("\0");
  }

  /**
   * Voert de codecellen een voor een uit, in de cellen zelf. Niet met de opdracht Alles
   * uitvoeren: die zet de cursor op de laatste cel, en de gebruiker is juist aan het typen.
   * Na een fout staat er onder de fout niets meer: een oude uitkomst onder gewijzigde invoer
   * zou voor een nieuwe doorgaan.
   */
  async function draaiCellen(paneel, code) {
    const sessie = paneel.sessionContext;
    await sessie.ready;
    const kernel = sessie.session?.kernel;
    if (!kernel) return;
    let fout = false;
    for (const cel of [...paneel.content.widgets]) {
      if (cel.model.type !== "code") continue;
      if (paneel.isDisposed || codeVan(paneel) !== code) return;
      const bron = cel.model.sharedModel.getSource();
      cel.model.sharedModel.transact(() => cel.model.clearExecution(), false);
      if (fout || !bron.trim()) continue;
      cel.outputHidden = false;
      cel.model.trusted = true;
      cel.setPrompt("*");
      const toekomst = kernel.requestExecute({ code: bron, stop_on_error: true }, false, { cellId: cel.model.sharedModel.getId() });
      cel.outputArea.future = toekomst;
      const antwoord = await toekomst.done;
      cel.model.executionCount = antwoord.content.execution_count;
      fout = antwoord.content.status !== "ok";
    }
  }

  /** Eén ronde tegelijk; wat er intussen veranderde, krijgt een nieuwe. */
  async function ronde(paneel, stand) {
    if (stand.bezig || paneel.isDisposed) return;
    const code = codeVan(paneel);
    if (code === stand.uitgevoerd) return;
    stand.bezig = true;
    stand.uitgevoerd = code;
    try {
      await draaiCellen(paneel, code);
    } catch (err) {
      // Bijvoorbeeld een herstart van de kernel tijdens de ronde.
      console.warn("Automatisch uitvoeren:", err);
    } finally {
      stand.bezig = false;
    }
    if (automatisch) plan(paneel, stand);
  }

  function plan(paneel, stand) {
    clearTimeout(stand.timer);
    stand.timer = setTimeout(() => void ronde(paneel, stand), PAUZE_MS);
  }

  /** Volgt de code van een notebook. Openen is geen wijziging: daarbij draait er niets. */
  function volgNotebook(paneel) {
    if (!paneel?.content?.widgets || !paneel.sessionContext || !paneel.context || notebooks.has(paneel)) return;
    const stand = { uitgevoerd: null, bezig: false, timer: 0 };
    notebooks.set(paneel, stand);
    paneel.disposed.connect(() => {
      clearTimeout(stand.timer);
      notebooks.delete(paneel);
    });
    paneel.context.ready.then(() => {
      if (paneel.isDisposed) return;
      stand.uitgevoerd = codeVan(paneel);
      paneel.model.contentChanged.connect(() => {
        if (automatisch) plan(paneel, stand);
      });
    }, () => {});
  }

  /** De gebruiker zet de keuze aan: alles rekent meteen door. */
  function zetAutomatisch({ aan }) {
    automatisch = aan === true;
    for (const [paneel, stand] of notebooks) {
      clearTimeout(stand.timer);
      if (!automatisch || !paneel.context.isReady) continue;
      stand.uitgevoerd = null;
      void ronde(paneel, stand);
    }
  }

  function stuur(bericht) {
    window.top.postMessage({ bron: BRON, ...bericht }, appHerkomst);
  }

  function naarBase64(bytes) {
    let uit = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      uit += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    }
    return btoa(uit);
  }

  function uitBase64(tekst) {
    const los = atob(tekst.replace(/\s+/g, ""));
    const bytes = new Uint8Array(los.length);
    for (let i = 0; i < los.length; i++) bytes[i] = los.charCodeAt(i);
    return bytes;
  }

  function naam(pad) {
    return pad.split("/").pop();
  }

  async function schrijf(contents, { pad, bytes }) {
    if (pad.endsWith("/")) {
      const map = pad.slice(0, -1);
      await contents.save(map, { type: "directory", name: naam(map), path: map });
      return;
    }
    const basis = { name: naam(pad), path: pad };
    if (/\.ipynb$/i.test(pad)) {
      try {
        const content = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
        await contents.save(pad, { ...basis, type: "notebook", format: "json", content });
        return;
      } catch (err) {
        // Geen geldig notebook: als gewoon bestand bewaren, dan gaat er niets verloren.
        console.warn(`${pad} is geen geldig notebook:`, err);
      }
    }
    if (TEKST.test(pad)) {
      try {
        const content = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
        await contents.save(pad, { ...basis, type: "file", format: "text", content });
        return;
      } catch {
        // Geen UTF-8: dan binair.
      }
    }
    await contents.save(pad, { ...basis, type: "file", format: "base64", content: naarBase64(bytes) });
  }

  /** Alle mappen die in de lijst nodig zijn, van buiten naar binnen. */
  function mappenVan(bestanden) {
    const mappen = new Set();
    for (const { pad } of bestanden) {
      const delen = pad.split("/");
      for (let i = 1; i < delen.length; i++) mappen.add(`${delen.slice(0, i).join("/")}/`);
    }
    return [...mappen].sort((a, b) => a.length - b.length);
  }

  async function laad({ bestanden, open, automatisch: aan }) {
    bezig = true;
    automatisch = aan === true;
    try {
      const contents = app.serviceManager.contents;
      for (const pad of mappenVan(bestanden)) await schrijf(contents, { pad, bytes: new Uint8Array() });
      for (const bestand of bestanden) {
        if (!bestand.pad.endsWith("/")) await schrijf(contents, bestand);
      }
      // De app opent een notebook pas als de bestanden er staan; de kernel start dan
      // wel, maar geen enkele cel draait uit zichzelf.
      if (open) await app.commands.execute("docmanager:open", { path: open, factory: "Notebook" });
    } finally {
      bezig = false;
    }
    stuur({ soort: "geladen" });
  }

  async function lijst(contents, pad, uit) {
    const map = await contents.get(pad, { content: true });
    for (const item of map.content) {
      if (item.type === "directory") {
        uit.push({ pad: `${item.path}/`, bytes: new Uint8Array() });
        await lijst(contents, item.path, uit);
      } else {
        const m = await contents.get(item.path, { content: true });
        const inhoud = m.content;
        let bytes;
        if (m.format === "base64") bytes = uitBase64(inhoud);
        else if (m.format === "json" || typeof inhoud !== "string") {
          bytes = new TextEncoder().encode(`${JSON.stringify(inhoud, null, 1)}\n`);
        } else bytes = new TextEncoder().encode(inhoud);
        uit.push({ pad: item.path, bytes });
      }
    }
    return uit;
  }

  /** Bewaart de open documenten en geeft alles terug, ook de uitvoer van de cellen. */
  async function stand({ id }) {
    const contents = app.serviceManager.contents;
    await app.commands.execute("docmanager:save-all");
    const bestanden = await lijst(contents, "", []);
    window.top.postMessage({ bron: BRON, soort: "stand", id, bestanden }, appHerkomst);
  }

  const pauze = (ms) => new Promise((klaar) => setTimeout(klaar, ms));

  /**
   * Van de API (sheet_run): elk open notebook draait helemaal, ook als de code niet
   * veranderd is, en daarna gaat de stand met de nieuwe uitvoer terug. Een ronde die
   * al loopt, maakt eerst af.
   */
  async function voerUit({ id }) {
    // Het notebook opent vlak na `geladen`; even wachten tot het er is.
    for (let i = 0; i < 100 && notebooks.size === 0; i++) await pauze(100);
    for (const [paneel, st] of notebooks) {
      clearTimeout(st.timer);
      await paneel.context.ready;
      while (st.bezig) await pauze(100);
      st.uitgevoerd = null;
      await ronde(paneel, st);
    }
    await stand({ id });
  }

  async function zetThema({ donker }) {
    const thema = donker ? THEMA.donker : THEMA.licht;
    if (app.commands.hasCommand("apputils:change-theme")) {
      await app.commands.execute("apputils:change-theme", { theme: thema });
    }
  }

  window.addEventListener("message", (e) => {
    const b = e.data;
    if (e.source !== window.top || !b || b.bron !== BRON || !app) return;
    appHerkomst = e.origin;
    if (b.soort === "automatisch") {
      zetAutomatisch(b);
      return;
    }
    const klus = b.soort === "laad" ? laad(b) : b.soort === "vraagStand" ? stand(b) : b.soort === "thema" ? zetThema(b) : b.soort === "voerUit" ? voerUit(b) : null;
    klus?.catch((err) => {
      console.error("Jupyter-brug:", err);
      stuur({ soort: "fout", id: b.id, melding: String(err?.message ?? err) });
    });
  });

  // Ctrl+S bewaart ook het project, zoals overal in de app.
  window.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") stuur({ soort: "opslaan" });
  }, true);

  async function start() {
    while (!window.jupyterapp) await new Promise((klaar) => setTimeout(klaar, 50));
    const lab = window.jupyterapp;
    await lab.started;
    await lab.restored;
    app = lab;
    lab.serviceManager.contents.fileChanged.connect(() => {
      if (!bezig) stuur({ soort: "gewijzigd" });
    });
    // Alle tabbladen, niet alleen het actieve: zonder focus in het venster is dat leeg.
    const volgAlles = () => {
      for (const widget of lab.shell.widgets("main")) {
        volgKernel(widget);
        volgNotebook(widget);
      }
    };
    lab.shell.layoutModified.connect(volgAlles);
    lab.shell.currentChanged.connect(volgAlles);
    volgAlles();
    stuur({ soort: "gereed" });
  }

  start().catch((err) => {
    console.error("Jupyter-brug:", err);
    stuur({ soort: "fout", melding: String(err?.message ?? err) });
  });
})();
