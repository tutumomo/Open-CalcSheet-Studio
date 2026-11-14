import { groepNaam, moduleNaam } from "../components/calc/moduleNaam";
import { useProjectStore, PROJECT_ID, RAPPORT_ID } from "../store/projectStore";
import { usePrintStore } from "../store/printStore";
import { useModuleBibliotheek, type CatalogusModule } from "../store/moduleBibliotheek";
import { leesProjectBestand } from "../store/projectBestand";
import { templates } from "../templates";
import { getSetting, setSetting } from "../store";
import { projectInhoud } from "../hooks/useBestandActies";
import { bewaarOudeVersie } from "../tauri/fileOps";
import { applyTheme, applyTextSize, themeId, UNITS_DEFAULTS, type UnitsSettings } from "../components/settings/SettingsDialog";
import { STANDAARD_TAAL, changeLanguage } from "../i18n/config";
import { leesPad, zetOpPad } from "../rapport/pad";
import { normaliseerRapport } from "../rapport/model";
import { datumTekst } from "../rapport/revisies";
import { standaardTeksten } from "../rapport/standaardteksten";
import { documentToReport, projectToReport } from "../lib/documentToReport";
import { projectScope } from "../store/projectGegevens";
import { rekenDoor } from "./rekenen";
import { wisSessie } from "../rekenen/toetsCache";
import { appKoppeling, type SplitModus } from "./appKoppeling";
import { voerNotebookUit } from "./notebookUitvoer";
import { McpFout, type McpBibliotheekModule, type McpInstellingen, type McpOmgeving, type McpWeergave } from "./contracts";

/**
 * De API-tools op de echte app. Lezen gaat via `getState()`; het project
 * wijzigen alleen via de bestaande acties van de projectstore — niets eromheen —
 * zodat elke wijziging in de geschiedenis staat (Ctrl+Z) en het project op
 * "niet opgeslagen" zet, precies alsof de gebruiker het zelf deed. Bestanden,
 * instellingen, de modulebibliotheek en het afdrukken lopen via dezelfde
 * functies als de knoppen van de app.
 */

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/**
 * Een wegwerpwerkblad (OCSS TW 開發需求規格 P0-5): het open project gaat opzij
 * en er komt een leeg project, zodat een client kan rekenen zonder het project
 * van de gebruiker aan te raken. `eindigSessie` zet alles terug — ook de vlag
 * "niet opgeslagen" en de stapel ongedaan maken — en ruimt de antwoorden op die
 * tijdens het werkblad zijn opgehaald.
 */
type SessieStand = Pick<
  ReturnType<typeof useProjectStore.getState>,
  "projectNaam" | "bestandspad" | "gegevens" | "exemplaren" | "rapport" | "activeId" | "verborgen" | "dirty" | "verleden" | "toekomst"
>;

let sessieStand: SessieStand | null = null;

function beginSessie(): boolean {
  if (sessieStand) return false;
  const s = useProjectStore.getState();
  sessieStand = {
    projectNaam: s.projectNaam,
    bestandspad: s.bestandspad,
    gegevens: s.gegevens,
    exemplaren: s.exemplaren,
    rapport: s.rapport,
    activeId: s.activeId,
    verborgen: s.verborgen,
    dirty: s.dirty,
    verleden: s.verleden,
    toekomst: s.toekomst,
  };
  s.nieuwProject();
  return true;
}

function eindigSessie(): boolean {
  if (!sessieStand) return false;
  const stand = sessieStand;
  sessieStand = null;
  useProjectStore.setState(stand);
  // De antwoorden van het werkblad horen niet bij het echte project.
  wisSessie();
  return true;
}

const fs = () => import("@tauri-apps/plugin-fs");

/** Een bestand dat er niet is, wordt NOT_FOUND (404) in plaats van een interne fout. */
async function lees<T>(pad: string, doe: () => Promise<T>): Promise<T> {
  try {
    return await doe();
  } catch (e) {
    const melding = e instanceof Error ? e.message : String(e);
    if (/os error (2|3)\b|not found|cannot find|no such file/i.test(melding)) throw new McpFout("NOT_FOUND", `File not found: ${pad}`);
    throw e;
  }
}

function bestandsnaam(pad: string): string {
  return (pad.split(/[/\\]/).pop() ?? pad).replace(/\.[^.]+$/, "");
}

/**
 * Het pad bij de recente bestanden zetten, zoals useBestandActies (`onthoud`)
 * en useRecentFiles dat doen: bovenaan, hooguit tien, en de lijsten in de app
 * horen het via het event.
 */
async function onthoud(pad: string): Promise<void> {
  const huidig = await getSetting<{ path: string }[]>("recentFiles", []);
  const nieuw = [
    { path: pad, name: bestandsnaam(pad), type: "report", timestamp: Date.now() },
    ...huidig.filter((f) => f.path !== pad),
  ].slice(0, 10);
  await setSetting("recentFiles", nieuw);
  window.dispatchEvent(new Event("recent-files-changed"));
}

function naarBase64(bytes: Uint8Array): string {
  let tekst = "";
  for (let i = 0; i < bytes.length; i += 0x8000) tekst += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(tekst);
}

function alsModule(m: CatalogusModule): McpBibliotheekModule {
  return {
    id: m.id,
    versie: m.versie,
    naam: m.naam,
    omschrijving: m.omschrijving,
    categorie: m.categorie,
    status: m.status,
    gepubliceerd: m.gepubliceerd,
    normen: m.normen,
    minimaleAppVersie: m.minimaleAppVersie,
  };
}

const SPLIT: Record<SplitModus, McpWeergave> = { cv: "code-visual", cu: "code-output", vu: "visual-output" };
const TERUG: Partial<Record<McpWeergave, SplitModus>> = { "code-visual": "cv", "code-output": "cu", "visual-output": "vu" };

async function leesInstellingen(): Promise<McpInstellingen> {
  const [theme, language, textSize, units] = await Promise.all([
    getSetting<string>("theme", "light"),
    getSetting<string>("language", STANDAARD_TAAL),
    getSetting<string>("textSize", "standard"),
    getSetting<UnitsSettings>("units", UNITS_DEFAULTS),
  ]);
  return { theme: themeId(theme), language, textSize, units: { ...UNITS_DEFAULTS, ...units } };
}

export const liveOmgeving: McpOmgeving = {
  stand: () => {
    const s = useProjectStore.getState();
    return {
      projectNaam: s.projectNaam,
      bestandspad: s.bestandspad,
      gegevens: s.gegevens,
      exemplaren: s.exemplaren,
      activeId: s.activeId,
      dirty: s.dirty,
      verborgen: s.verborgen,
      rapport: s.rapport,
      stappenTerug: s.verleden.length,
      stappenVooruit: s.toekomst.length,
    };
  },
  sjabloon: (templateId) => (Object.prototype.hasOwnProperty.call(templates, templateId) ? templates[templateId] : undefined),
  moduleNaam,
  groepNaam,
  speciaal: { project: PROJECT_ID, rapport: RAPPORT_ID },

  acties: {
    voegToe: (templateId, basisNaam, source) => useProjectStore.getState().voegToe(templateId, basisNaam, source),
    voegPdfToe: (naam, pdf) => useProjectStore.getState().voegPdfToe(naam, pdf),
    zetPdf: (id, pdf) => useProjectStore.getState().zetPdf(id, pdf),
    voegSpreadsheetToe: (naam, xlsx) => useProjectStore.getState().voegSpreadsheetToe(naam, xlsx),
    zetSpreadsheet: (id, xlsx) => useProjectStore.getState().zetSpreadsheet(id, xlsx),
    voegMarkdownToe: (naam, md) => useProjectStore.getState().voegMarkdownToe(naam, md),
    zetMarkdown: (id, md) => useProjectStore.getState().zetMarkdown(id, md),
    voegCanvasToe: (naam) => useProjectStore.getState().voegCanvasToe(naam),
    voegGraafToe: (naam) => useProjectStore.getState().voegGraafToe(naam),
    zetGraaf: (id, graaf) => useProjectStore.getState().zetGraaf(id, graaf),
    voegTekenbladToe: (naam, tekenvel) => useProjectStore.getState().voegTekenbladToe(naam, tekenvel),
    zetTekenVel: (id, tekenvel) => useProjectStore.getState().zetTekenVel(id, tekenvel),
    voegJupyterToe: (naam, jupyter) => useProjectStore.getState().voegJupyterToe(naam, jupyter),
    zetJupyter: (id, jupyter) => useProjectStore.getState().zetJupyter(id, jupyter),
    // Een nieuw notebook heeft nog geen uitvoer; de app bewaart die per cel.
    voegMarimoToe: (naam, marimo) => useProjectStore.getState().voegMarimoToe(naam, { ...marimo, uitvoer: marimo.uitvoer ?? [] }),
    zetMarimo: (id, marimo) => useProjectStore.getState().zetMarimo(id, { ...marimo, uitvoer: marimo.uitvoer ?? [] }),
    dupliceer: (id) => useProjectStore.getState().dupliceer(id),
    verplaats: (id, richting) => useProjectStore.getState().verplaats(id, richting),
    hernoem: (id, naam) => useProjectStore.getState().hernoem(id, naam),
    verwijder: (id) => useProjectStore.getState().verwijder(id),
    selecteer: (id) => useProjectStore.getState().selecteer(id),
    zetBron: (id, source) => useProjectStore.getState().zetBron(id, source),
    zetWaarde: (id, naam, waarde) => useProjectStore.getState().zetWaarde(id, naam, waarde),
    zetGegeven: (naam, waarde) => useProjectStore.getState().zetGegeven(naam, waarde),
    zetProjectNaam: (naam) => useProjectStore.getState().zetProjectNaam(naam),
    zetVerborgen: (onderdeel, verborgen) => useProjectStore.getState().zetVerborgen(onderdeel, verborgen),
    zetRapportVeld: (pad, waarde) => useProjectStore.getState().zetRapportVeld(pad, waarde),
    // Een heel stuk rapport: daarna aanvullen tot een geldig rapport, net als bij openen.
    zetRapportDeel: (pad, waarde) =>
      useProjectStore.getState().werkRapportBij((r) =>
        normaliseerRapport(zetOpPad(r, leesPad(pad), waarde), datumTekst(new Date()), standaardTeksten),
      ),
    ongedaan: () => useProjectStore.getState().ongedaan(),
    opnieuw: () => useProjectStore.getState().opnieuw(),
  },

  bestanden: {
    beschikbaar: isTauri,
    nieuwProject: () => useProjectStore.getState().nieuwProject(),
    beginSessie,
    eindigSessie,
    sessieActief: () => sessieStand !== null,
    openProject: async (pad) => {
      const raw = await lees(pad, async () => (await fs()).readTextFile(pad));
      const store = useProjectStore.getState();
      store.laadProject(leesProjectBestand(raw, bestandsnaam(pad)));
      store.markeerOpgeslagen(pad);
      await onthoud(pad);
    },
    bewaarProject: async (pad) => {
      await bewaarOudeVersie(pad);
      await (await fs()).writeTextFile(pad, projectInhoud());
      useProjectStore.getState().markeerOpgeslagen(pad);
      await onthoud(pad);
    },
    recent: async () => {
      const lijst = await getSetting<{ path: string; name: string; timestamp: number }[]>("recentFiles", []);
      return lijst.map((f) => ({ path: f.path, name: f.name, timestamp: f.timestamp }));
    },
    leesBase64: async (pad) => naarBase64(await lees(pad, async () => (await fs()).readFile(pad))),
    schrijfTekst: async (pad, tekst) => {
      await (await fs()).writeTextFile(pad, tekst);
    },
  },

  bibliotheek: {
    catalogus: async (vernieuw) => {
      if (vernieuw || useModuleBibliotheek.getState().catalogus === null) await useModuleBibliotheek.getState().haalCatalogus();
      const s = useModuleBibliotheek.getState();
      return { modules: (s.catalogus ?? []).map(alsModule), fout: s.fout };
    },
    geinstalleerd: () =>
      Object.fromEntries(Object.entries(useModuleBibliotheek.getState().geinstalleerd).map(([id, m]) => [id, alsModule(m)])),
    installeer: async (id) => {
      const m = useModuleBibliotheek.getState().catalogus?.find((x) => x.id === id);
      if (!m) return `module "${id}" is not in the catalog`;
      await useModuleBibliotheek.getState().installeer(m);
      const s = useModuleBibliotheek.getState();
      return s.geinstalleerd[id]?.versie === m.versie ? null : (s.fout ?? "unknown error");
    },
    verwijder: (id) => useModuleBibliotheek.getState().verwijder(id),
  },

  instellingen: {
    lees: leesInstellingen,
    zet: async (w) => {
      if (w.theme !== undefined) {
        applyTheme(w.theme);
        appKoppeling()?.setTheme(w.theme);
        await setSetting("theme", w.theme);
      }
      if (w.language !== undefined) {
        changeLanguage(w.language);
        await setSetting("language", w.language);
      }
      if (w.textSize !== undefined) {
        applyTextSize(w.textSize);
        await setSetting("textSize", w.textSize);
      }
      if (w.units !== undefined) {
        await setSetting("units", w.units);
        window.dispatchEvent(new CustomEvent("units-changed", { detail: w.units }));
      }
      return leesInstellingen();
    },
  },

  weergave: {
    huidige: () => {
      const app = appKoppeling();
      if (!app) return null;
      const p = usePrintStore.getState();
      const voorbeeld = p.voorbeeld ? (p.soort === "rapport" ? "report" : "sheets") : null;
      const weergave: McpWeergave = voorbeeld ? "print-preview" : app.activeView === "ifc" ? "ifc" : SPLIT[app.splitMode];
      return { weergave, voorbeeld };
    },
    kies: (w) => {
      const app = appKoppeling();
      if (!app) return "The app window is not ready.";
      const { activeId, exemplaren } = useProjectStore.getState();
      const blad = exemplaren.some((e) => e.id === activeId);
      const print = usePrintStore.getState();
      if (w === "print-preview") {
        app.setActiveView("default");
        if (activeId === RAPPORT_ID) print.toonVoorbeeld(null, "rapport");
        else print.toonVoorbeeld(blad ? [activeId] : null, "bladen");
        return null;
      }
      if (!blad) return "Open a sheet first (sheet_select): the project data form and the report have no code, drawing or IFC view.";
      print.sluitVoorbeeld();
      if (w === "ifc") {
        app.setActiveView("ifc");
        return null;
      }
      app.setActiveView("default");
      app.setSplitMode(TERUG[w]!);
      return null;
    },
  },

  afdruk: {
    start: (soort, selectie) => usePrintStore.getState().afdrukken(selectie, soort),
    pdfViaEngine: async (ids, pad) => {
      const { exemplaren, gegevens, projectNaam } = useProjectStore.getState();
      const scope = projectScope(gegevens);
      const bladen = ids.map((id) => {
        const ex = exemplaren.find((e) => e.id === id)!;
        return { naam: ex.naam, nodes: rekenDoor(ex.source, ex.waarden, scope, ex.naam).nodes };
      });
      const report = bladen.length === 1 ? documentToReport(bladen[0].nodes, bladen[0].naam) : projectToReport(bladen, projectNaam, gegevens);
      const { invoke } = await import("@tauri-apps/api/core");
      try {
        return await invoke<number>("engine_save_pdf", { report, path: pad });
      } catch (e) {
        const melding = e instanceof Error ? e.message : String(e);
        if (/rapportengine/i.test(melding)) {
          throw new McpFout(
            "NOT_AVAILABLE",
            "This build of the app has no report engine, so it cannot write a PDF by itself. Use the print tool and choose a PDF printer in the print dialog (that printout includes the drawings).",
          );
        }
        throw e;
      }
    },
  },

  notebooks: {
    voerUit: async (id, tijdMs) => {
      if (!isTauri()) return { klaar: false, melding: "Notebooks run only in the desktop app." };
      // Het venster van een notebook bestaat pas als het blad in de werkruimte open is.
      useProjectStore.getState().selecteer(id);
      usePrintStore.getState().sluitVoorbeeld();
      appKoppeling()?.setActiveView("default");
      return voerNotebookUit(id, tijdMs);
    },
  },
};
