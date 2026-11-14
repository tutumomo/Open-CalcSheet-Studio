/**
 * Een nagebouwde app voor de controles van de API (check-mcp.mjs,
 * check-api.mjs): een projectstore, bestanden, modulebibliotheek,
 * instellingen, weergave en afdrukken in het geheugen, met dezelfde vorm als
 * packages/desktop/src/mcp/omgeving.ts.
 *
 * Doet wat de acties van projectStore.ts doen voor zover de tools het merken:
 * een nieuw blad krijgt "<basis> <n>" en wordt geselecteerd, elke wijziging zet
 * `dirty` en is ongedaan te maken. `acties` telt mee, zodat te zien is dat elke
 * mutatie via een store-actie loopt.
 */
import { readFileSync } from "node:fs";
import { modulesPerTemplate } from "../../packages/desktop/src/components/calc/projectTree.ts";
import { laadTemplate } from "./refcheck.mjs";
import { legeGegevens } from "../../packages/desktop/src/store/projectGegevens.ts";
import { normaliseerRapport, standaardRapport } from "../../packages/desktop/src/rapport/model.ts";
import { datumTekst } from "../../packages/desktop/src/rapport/revisies.ts";
import { standaardTeksten } from "../../packages/desktop/src/rapport/standaardteksten.ts";
import { leesPad, zetOpPad } from "../../packages/desktop/src/rapport/pad.ts";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE } from "../../packages/desktop/src/store/projectBestand.ts";
import { McpFout } from "../../packages/desktop/src/mcp/contracts.ts";

export const PROJECT_ID = "__projectgegevens__";
export const RAPPORT_ID = "__rapport__";

const nieuwRapport = () => standaardRapport(datumTekst(new Date()), standaardTeksten());

/** De namen van de modules per taal, uit de vertaalbestanden. */
const werkruimte = (taal) => JSON.parse(readFileSync(new URL(`../../packages/desktop/src/i18n/locales/${taal}/werkruimte.json`, import.meta.url), "utf8"));

/** Een klein, echt PDF-bestand (base64). */
export const PROEF_PDF = Buffer.from("%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n").toString("base64");

export function maakApp({ sjablonen = { ligger: laadTemplate("ligger.ts") }, bureaublad = true } = {}) {
  const leeg = () => ({
    projectNaam: "Proefproject",
    bestandspad: null,
    gegevens: legeGegevens(),
    exemplaren: [],
    activeId: PROJECT_ID,
    dirty: false,
    verborgen: {},
    rapport: nieuwRapport(),
  });
  const s = leeg();
  let verleden = [];
  let toekomst = [];
  // Het wegwerpwerkblad (session_new): het project en de geschiedenis opzij.
  let sessieStand = null;
  let sessieVerleden = [];
  let sessieToekomst = [];
  let teller = 0;
  const acties = [];
  const momentopname = () => ({ exemplaren: s.exemplaren, gegevens: s.gegevens, rapport: s.rapport, activeId: s.activeId });
  const wijzig = (naam, f) => {
    acties.push(naam);
    verleden.push(momentopname());
    toekomst = [];
    f();
    s.dirty = true;
  };
  const opBlad = (id, f) => {
    s.exemplaren = s.exemplaren.map((e) => (e.id === id ? f(e) : e));
  };
  const vrij = (basis, altijd = true) => {
    const bezet = new Set(s.exemplaren.map((e) => e.naam));
    if (!altijd && !bezet.has(basis)) return basis;
    for (let n = 1; ; n++) if (!bezet.has(`${basis} ${n}`)) return `${basis} ${n}`;
  };

  // Bestanden, bibliotheek, instellingen, weergave en afdruk in het geheugen.
  const schijf = new Map();
  const recent = [];
  const onthoud = (pad) => {
    const i = recent.findIndex((f) => f.path === pad);
    if (i >= 0) recent.splice(i, 1);
    recent.unshift({ path: pad, name: pad.split(/[\\/]/).pop().replace(/\.[^.]+$/, ""), timestamp: Date.now() });
  };
  const catalogus = [
    { id: "kolom", versie: "2026.40.1", naam: { nl: "Kolom", en: "Column" }, omschrijving: { nl: "", en: "" }, categorie: "Staal", status: "concept", gepubliceerd: false, normen: ["NEN-EN 1993-1-1"] },
  ];
  const geinstalleerd = {};
  let instellingen = {
    theme: "light",
    language: "en",
    textSize: "standard",
    units: { angleMode: "rad", defaultLength: "mm", defaultForce: "kN", defaultStress: "MPa", returnAngleUnits: false },
  };
  const app = { splitMode: "vu", activeView: "default", voorbeeld: null };
  const afdrukken = [];

  const omgeving = {
    stand: () => ({ ...s, stappenTerug: verleden.length, stappenVooruit: toekomst.length }),
    sjabloon: (id) => sjablonen[id],
    // Zoals in de app: de naam in de taal van de instellingen.
    moduleNaam: (id) => (modulesPerTemplate[id] ? (werkruimte(instellingen.language).catalogus.modules[id] ?? modulesPerTemplate[id].label) : null),
    groepNaam: (id, label) => werkruimte(instellingen.language).catalogus.groepen[id] ?? label,
    speciaal: { project: PROJECT_ID, rapport: RAPPORT_ID },
    acties: {
      voegToe(templateId, basis, source) {
        const id = `ex-${++teller}`;
        wijzig("voegToe", () => {
          s.exemplaren = [...s.exemplaren, { id, naam: vrij(basis), templateId, source, waarden: {} }];
          s.activeId = id;
        });
        return id;
      },
      voegPdfToe(naam, pdf) {
        const id = `ex-${++teller}`;
        wijzig("voegPdfToe", () => {
          s.exemplaren = [...s.exemplaren, { id, naam: vrij(naam, false), templateId: "pdf", source: "", waarden: {}, pdf }];
          s.activeId = id;
        });
        return id;
      },
      zetPdf: (id, pdf) => wijzig("zetPdf", () => opBlad(id, (e) => ({ ...e, pdf }))),
      voegSpreadsheetToe(naam, xlsx) {
        const id = `ex-${++teller}`;
        wijzig("voegSpreadsheetToe", () => {
          s.exemplaren = [...s.exemplaren, { id, naam: vrij(naam, false), templateId: "spreadsheet", source: "", waarden: {}, xlsx }];
          s.activeId = id;
        });
        return id;
      },
      zetSpreadsheet: (id, xlsx) => wijzig("zetSpreadsheet", () => opBlad(id, (e) => ({ ...e, xlsx }))),
      voegMarkdownToe(naam, md) {
        const id = `ex-${++teller}`;
        wijzig("voegMarkdownToe", () => {
          s.exemplaren = [...s.exemplaren, { id, naam: vrij(naam, false), templateId: "markdown", source: "", waarden: {}, md }];
          s.activeId = id;
        });
        return id;
      },
      zetMarkdown: (id, md) => wijzig("zetMarkdown", () => opBlad(id, (e) => ({ ...e, md }))),
      voegCanvasToe(naam) {
        const id = `ex-${++teller}`;
        wijzig("voegCanvasToe", () => {
          s.exemplaren = [...s.exemplaren, { id, naam: vrij(naam, false), templateId: "canvas", source: "", waarden: {} }];
          s.activeId = id;
        });
        return id;
      },
      voegGraafToe(naam) {
        const id = `ex-${++teller}`;
        wijzig("voegGraafToe", () => {
          s.exemplaren = [...s.exemplaren, { id, naam: vrij(naam, false), templateId: "graaf", source: "", waarden: {}, graaf: { versie: 1, nodes: [], verbindingen: [] } }];
          s.activeId = id;
        });
        return id;
      },
      zetGraaf: (id, graaf) => wijzig("zetGraaf", () => opBlad(id, (e) => ({ ...e, graaf }))),
      voegTekenbladToe(naam, tekenvel) {
        const id = `ex-${++teller}`;
        wijzig("voegTekenbladToe", () => {
          s.exemplaren = [...s.exemplaren, { id, naam: vrij(naam, false), templateId: "tekenblad", source: "", waarden: {}, tekenvel }];
          s.activeId = id;
        });
        return id;
      },
      zetTekenVel: (id, tekenvel) => wijzig("zetTekenVel", () => opBlad(id, (e) => ({ ...e, tekenvel }))),
      voegJupyterToe(naam, jupyter) {
        const id = `ex-${++teller}`;
        wijzig("voegJupyterToe", () => {
          s.exemplaren = [...s.exemplaren, { id, naam: vrij(naam, false), templateId: "jupyter", source: "", waarden: {}, jupyter }];
          s.activeId = id;
        });
        return id;
      },
      zetJupyter: (id, jupyter) => wijzig("zetJupyter", () => opBlad(id, (e) => ({ ...e, jupyter }))),
      voegMarimoToe(naam, marimo) {
        const id = `ex-${++teller}`;
        wijzig("voegMarimoToe", () => {
          s.exemplaren = [...s.exemplaren, { id, naam: vrij(naam, false), templateId: "marimo", source: "", waarden: {}, marimo: { ...marimo, uitvoer: marimo.uitvoer ?? [] } }];
          s.activeId = id;
        });
        return id;
      },
      zetMarimo: (id, marimo) => wijzig("zetMarimo", () => opBlad(id, (e) => ({ ...e, marimo: { ...marimo, uitvoer: marimo.uitvoer ?? [] } }))),
      dupliceer(id) {
        const bron = s.exemplaren.find((e) => e.id === id);
        if (!bron) return null;
        const nieuw = { ...bron, id: `ex-${++teller}`, naam: vrij(`${bron.naam} (kopie)`, false), waarden: { ...bron.waarden } };
        wijzig("dupliceer", () => {
          const i = s.exemplaren.findIndex((e) => e.id === id);
          const lijst = [...s.exemplaren];
          lijst.splice(i + 1, 0, nieuw);
          s.exemplaren = lijst;
          s.activeId = nieuw.id;
        });
        return nieuw.id;
      },
      verplaats: (id, richting) =>
        wijzig("verplaats", () => {
          const i = s.exemplaren.findIndex((e) => e.id === id);
          const j = i + richting;
          if (i < 0 || j < 0 || j >= s.exemplaren.length) return;
          const lijst = [...s.exemplaren];
          [lijst[i], lijst[j]] = [lijst[j], lijst[i]];
          s.exemplaren = lijst;
        }),
      hernoem: (id, naam) => wijzig("hernoem", () => opBlad(id, (e) => ({ ...e, naam }))),
      verwijder: (id) =>
        wijzig("verwijder", () => {
          s.exemplaren = s.exemplaren.filter((e) => e.id !== id);
          if (s.activeId === id) s.activeId = s.exemplaren[0]?.id ?? PROJECT_ID;
        }),
      selecteer: (id) => {
        acties.push("selecteer");
        s.activeId = id;
      },
      zetBron: (id, source) => wijzig("zetBron", () => opBlad(id, (e) => ({ ...e, source }))),
      zetWaarde: (id, naam, waarde) => wijzig("zetWaarde", () => opBlad(id, (e) => ({ ...e, waarden: { ...e.waarden, [naam]: waarde } }))),
      zetGegeven: (naam, waarde) => wijzig("zetGegeven", () => (s.gegevens = { ...s.gegevens, [naam]: waarde })),
      zetProjectNaam: (naam) => {
        acties.push("zetProjectNaam");
        s.projectNaam = naam;
        s.dirty = true;
      },
      zetVerborgen: (onderdeel, verborgen) => {
        acties.push("zetVerborgen");
        s.verborgen = { ...s.verborgen, [onderdeel]: verborgen || undefined };
        s.dirty = true;
      },
      zetRapportVeld: (pad, waarde) => wijzig("zetRapportVeld", () => (s.rapport = zetOpPad(s.rapport, leesPad(pad), waarde))),
      zetRapportDeel: (pad, waarde) =>
        wijzig("werkRapportBij", () => (s.rapport = normaliseerRapport(zetOpPad(s.rapport, leesPad(pad), waarde), datumTekst(new Date()), standaardTeksten))),
      ongedaan: () => {
        acties.push("ongedaan");
        const vorige = verleden.pop();
        if (!vorige) return;
        toekomst.push(momentopname());
        Object.assign(s, vorige, { dirty: true });
      },
      opnieuw: () => {
        acties.push("opnieuw");
        const volgende = toekomst.pop();
        if (!volgende) return;
        verleden.push(momentopname());
        Object.assign(s, volgende, { dirty: true });
      },
    },
    bestanden: {
      beschikbaar: () => bureaublad,
      nieuwProject: () => {
        acties.push("nieuwProject");
        Object.assign(s, leeg());
        verleden = [];
        toekomst = [];
      },
      // Een wegwerpwerkblad: het project gaat opzij en komt met eindigSessie terug.
      beginSessie: () => {
        if (sessieStand) return false;
        sessieStand = { ...s };
        sessieVerleden = verleden;
        sessieToekomst = toekomst;
        acties.push("nieuwProject");
        Object.assign(s, leeg());
        verleden = [];
        toekomst = [];
        return true;
      },
      eindigSessie: () => {
        if (!sessieStand) return false;
        const stand = sessieStand;
        sessieStand = null;
        Object.assign(s, stand);
        verleden = sessieVerleden;
        toekomst = sessieToekomst;
        return true;
      },
      sessieActief: () => sessieStand !== null,
      openProject: async (pad) => {
        if (!schijf.has(pad)) throw new McpFout("NOT_FOUND", `File not found: ${pad}`);
        acties.push("laadProject");
        const p = leesProjectBestand(schijf.get(pad), pad.split(/[\\/]/).pop().replace(/\.[^.]+$/, ""));
        Object.assign(s, leeg(), {
          projectNaam: p.projectNaam ?? "Nieuw project",
          gegevens: { ...legeGegevens(), ...(p.gegevens ?? {}) },
          exemplaren: p.exemplaren ?? [],
          rapport: p.rapport ?? nieuwRapport(),
          verborgen: p.verborgen ?? {},
          activeId: p.exemplaren?.[0]?.id ?? PROJECT_ID,
          bestandspad: pad,
          dirty: false,
        });
        verleden = [];
        toekomst = [];
        onthoud(pad);
      },
      bewaarProject: async (pad) => {
        acties.push("markeerOpgeslagen");
        schijf.set(pad, bouwProjectBestand({
          versie: PROJECT_FORMAAT_VERSIE, naam: s.projectNaam, gegevens: s.gegevens, exemplaren: s.exemplaren, rapport: s.rapport,
          verborgen: Object.keys(s.verborgen).length ? s.verborgen : undefined,
        }, null));
        s.bestandspad = pad;
        s.dirty = false;
        onthoud(pad);
      },
      recent: async () => recent.map((f) => ({ ...f })),
      leesBase64: async (pad) => {
        if (!schijf.has(pad)) throw new McpFout("NOT_FOUND", `File not found: ${pad}`);
        return Buffer.from(schijf.get(pad), "latin1").toString("base64");
      },
      schrijfTekst: async (pad, tekst) => {
        schijf.set(pad, tekst);
      },
    },
    bibliotheek: {
      catalogus: async () => ({ modules: catalogus.map((m) => ({ ...m })), fout: null }),
      geinstalleerd: () => ({ ...geinstalleerd }),
      installeer: async (id) => {
        const m = catalogus.find((x) => x.id === id);
        if (!m) return "not in the catalog";
        geinstalleerd[id] = { ...m };
        sjablonen[id] = `"${m.naam.nl}\nh = ? mm\n`;
        return null;
      },
      verwijder: (id) => {
        delete geinstalleerd[id];
        delete sjablonen[id];
      },
    },
    instellingen: {
      lees: async () => structuredClone(instellingen),
      zet: async (w) => {
        instellingen = { ...instellingen, ...structuredClone(w) };
        return structuredClone(instellingen);
      },
    },
    weergave: {
      huidige: () => ({
        weergave: app.voorbeeld ? "print-preview" : app.activeView === "ifc" ? "ifc" : { cv: "code-visual", cu: "code-output", vu: "visual-output" }[app.splitMode],
        voorbeeld: app.voorbeeld,
      }),
      kies: (w) => {
        const blad = s.exemplaren.some((e) => e.id === s.activeId);
        if (w === "print-preview") {
          app.voorbeeld = s.activeId === RAPPORT_ID ? "report" : "sheets";
          return null;
        }
        if (!blad) return "Open a sheet first (sheet_select).";
        app.voorbeeld = null;
        if (w === "ifc") app.activeView = "ifc";
        else {
          app.activeView = "default";
          app.splitMode = { "code-visual": "cv", "code-output": "cu", "visual-output": "vu" }[w];
        }
        return null;
      },
    },
    afdruk: {
      start: (soort, selectie) => afdrukken.push({ soort, selectie }),
      pdfViaEngine: async () => {
        throw new McpFout("NOT_AVAILABLE", "This build of the app has no report engine.");
      },
    },
    // sheet_run: zoals omgeving.ts het blad opent en het venster laat draaien; wat het
    // venster doet, geeft de controle zelf mee (`zetNotebookUitvoer`).
    notebooks: {
      voerUit: async (id, tijdMs) => {
        notebookRondes.push({ id, tijdMs });
        omgeving.acties.selecteer(id);
        return notebookUitvoer(id, tijdMs);
      },
    },
  };
  const notebookRondes = [];
  let notebookUitvoer = async () => ({ klaar: true });
  const zetNotebookUitvoer = (f) => {
    notebookUitvoer = f;
  };
  return { s, acties, omgeving, schijf, afdrukken, app, sjablonen, geinstalleerd, notebookRondes, zetNotebookUitvoer };
}

/** Een context zoals brug.ts hem per request bouwt. */
export function maakContext(omgeving, vlaggen) {
  return () => ({ omgeving, ...vlaggen, server: { naam: "open-calcsheet-studio", versie: "0.0.0-check", poort: 3879 } });
}
