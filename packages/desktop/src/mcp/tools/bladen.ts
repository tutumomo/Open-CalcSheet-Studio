/**
 * Tools voor de bladen: modules, toevoegen, lezen, invoer, doorrekenen,
 * volgorde, PDF-bladen, formules invoegen en losse teksten doorrekenen.
 */
import type { JsonSchema, McpBlad, McpContext, McpMarkdown, McpToolDef } from "../contracts.ts";
import { projectScope } from "../../store/projectGegevens.ts";
import { bibliotheek, moduleCatalogus, modulesPerTemplate, type TreeNode } from "../../components/calc/projectTree.ts";
import { isPdfBlad, base64Bytes, bladnaamVoor } from "../../store/pdfBijlage.ts";
import { isLosBlad, isSpreadsheetBlad, lijktOpWerkmap, bladnaamVoorWerkmap, LEGE_WERKMAP } from "../../store/spreadsheetBlad.ts";
import { isMarkdownBlad, bladnaamVoorMarkdown, tekstUitBytes } from "../../store/markdownBlad.ts";
import { isGraafBlad } from "../../store/graafBlad.ts";
import { leesGraaf } from "../../graaf/model.ts";
import { isTekenBlad, leesTekenVel, velMaat, PAPIERFORMATEN, LIGGINGEN, type Ligging, type Papierformaat, type TekenVel } from "../../store/tekenBlad.ts";
import {
  isJupyterBlad, bladnaamVoorNotebook, pakWerkmapIn, pakWerkmapUit, startNotebook, uitBase64,
  START_NOTEBOOK, WERKMAP_MAX_BYTES, type WerkmapBestand,
} from "../../store/jupyterBlad.ts";
import { isMarimoBlad, bladnaamVoorMarimo, isMarimoCode, marimoCellen, marimoStartCode, MARIMO_MAX_TEKENS } from "../../store/marimoBlad.ts";
import { codeVan } from "../../components/ribbon/formules.ts";
import { alleFormules } from "../../store/library.ts";
import { jsonGetal, regels, rekenDoor, ucWaarden, type Doorrekening } from "../rekenen.ts";
import {
  LEEG_BLAD, LEEG_BLAD_NAAM, LEEG_BLAD_TEKST, LEZEN, NIEUW, WEG, WIJZIGEN,
  alsTekst, bekendeUitkomst, bladSoort, bladUit, fout, geenBlad, geenPdfBlad, idOptioneel, idVerplicht, invoerJson,
  kiesKeuze, korteNaam, objectSchema, ok, pdfUit, rekenBlad, resultaatJson, ruimUitkomstenOp, tekstOfGetal,
  veldenVan, vergeetBlad, zoekBlad,
} from "./hulp.ts";

/** Een blad in een lijst: id, naam, soort, en de UC als die bekend is. */
function bladRegel(b: McpBlad, actief: string, module: string | null, r: ReturnType<typeof bekendeUitkomst>, error?: string): Record<string, unknown> {
  return {
    id: b.id,
    name: b.naam,
    templateId: b.templateId,
    kind: bladSoort(b),
    module,
    active: b.id === actief,
    evaluated: r !== null,
    uc: r ? jsonGetal(r.uc) : null,
    passes: r ? r.voldoet : null,
    ...(error ? { error } : {}),
  };
}

const pdfBron: Record<string, JsonSchema> = {
  path: { type: "string", minLength: 1, description: "Path of a PDF file on this computer (desktop app only)." },
  base64: { type: "string", minLength: 1, description: "The PDF file as base64 (a data: prefix is allowed)." },
  fileName: { type: "string", description: "File name to store with the PDF. Default: the name in path, or document.pdf." },
  force: { type: "boolean", description: "Allow a PDF above 20 MB." },
};

/** De soorten bladen die sheet_add zelf maakt; een PDF heeft zijn eigen tool (sheet_add_pdf). */
const SOORTEN = ["calculation", "markdown", "graph", "drawing", "spreadsheet", "jupyter", "marimo"] as const;
type Soort = (typeof SOORTEN)[number];

const bestandBron: Record<string, JsonSchema> = {
  path: { type: "string", minLength: 1, description: "Path of the file on this computer (desktop app only)." },
  base64: { type: "string", minLength: 1, description: "The file as base64 (a data: prefix is allowed)." },
  fileName: { type: "string", description: "File name to store with the sheet." },
};

/** De bytes van een bestand uit `path` of `base64`, met de naam die het blad krijgt. */
async function bestandUit(
  args: Record<string, unknown>,
  ctx: McpContext,
): Promise<{ bestandsnaam: string; data: string; bytes: Uint8Array } | { fout: ReturnType<typeof fout> }> {
  const pad = typeof args.path === "string" ? args.path : null;
  const b64 = typeof args.base64 === "string" ? args.base64.replace(/^data:[^,]*,/, "").replace(/\s+/g, "") : null;
  if ((pad === null) === (b64 === null)) return { fout: fout("VALIDATION", "Pass either path or base64.") };
  let data: string;
  let bestandsnaam: string;
  if (pad !== null) {
    if (!ctx.omgeving.bestanden.beschikbaar()) {
      return { fout: fout("NOT_AVAILABLE", "Reading a file by path only works in the desktop app; pass base64 instead.") };
    }
    data = await ctx.omgeving.bestanden.leesBase64(pad);
    bestandsnaam = typeof args.fileName === "string" && args.fileName ? args.fileName : (pad.split(/[\\/]/).pop() ?? pad);
  } else {
    data = b64!;
    bestandsnaam = typeof args.fileName === "string" && args.fileName ? args.fileName : "file";
  }
  let bytes: Uint8Array;
  try {
    bytes = uitBase64(data);
  } catch {
    return { fout: fout("VALIDATION", `${bestandsnaam} is not valid base64.`) };
  }
  if (bytes.length === 0) return { fout: fout("VALIDATION", `${bestandsnaam} is empty.`) };
  return { bestandsnaam, data, bytes };
}

/** Een leeg tekenvel: A3 liggend met één view, zoals de app een nieuw tekenblad maakt. */
function leegTekenvel(titel: string, formaat: Papierformaat = "A3", ligging: Ligging = "liggend"): TekenVel {
  const maat = velMaat({ formaat, ligging });
  return {
    formaat,
    ligging,
    views: [{
      id: "view-1",
      titel,
      x: 15,
      y: 15,
      breedte: Math.max(40, Math.min(390, maat.breedte - 30)),
      hoogte: Math.max(30, Math.min(250, maat.hoogte - 30)),
      schaal: 50,
      x0: 0,
      y0: 0,
      elementen: [],
    }],
  };
}

/** Een nieuw Marimo-notebook in de taal van de app. */
async function startNotebookCode(ctx: McpContext): Promise<string> {
  const taal = (await ctx.omgeving.instellingen.lees()).language;
  if (taal.startsWith("nl")) {
    return marimoStartCode({ kop: "Reactief notebook", uitleg: "Start het notebook en beweeg een schuif: elke cel die ervan afhangt, rekent opnieuw." });
  }
  if (taal.startsWith("zh")) {
    return marimoStartCode({ kop: "響應式筆記本", uitleg: "按 Run 後拉動滑桿，所有相依的儲存格會自動重算。" });
  }
  return marimoStartCode({ kop: "Reactive notebook", uitleg: "Run the notebook and move a slider: every dependent cell recalculates." });
}

/** Een nieuwe Jupyter-werkmap met één startnotebook, in de taal van de app. */
async function startJupyterWerkmap(ctx: McpContext): Promise<{ bestandsnaam: string; data: string }> {
  const taal = (await ctx.omgeving.instellingen.lees()).language;
  const t = taal.startsWith("nl")
    ? { titel: "Notebook", kop: "Jupyter-notebook", uitleg: "Schrijf hier je eerste cel en voer hem uit met Shift+Enter." }
    : taal.startsWith("zh")
      ? { titel: "筆記本", kop: "Jupyter 筆記本", uitleg: "在這裡寫下第一個儲存格，按 Shift+Enter 執行。" }
      : { titel: "Notebook", kop: "Jupyter notebook", uitleg: "Write your first cell here and run it with Shift+Enter." };
  const bestanden: WerkmapBestand[] = [{ pad: START_NOTEBOOK, bytes: startNotebook(t) }];
  const bytes = pakWerkmapIn(bestanden);
  let ruw = "";
  for (let i = 0; i < bytes.length; i += 0x8000) ruw += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return { bestandsnaam: `${t.titel}.zip`, data: btoa(ruw) };
}

/** De samenvatting van een tekenvel, zoals sheet_get die zonder full geeft. */
function tekenvelSamenvatting(vel: TekenVel): Record<string, unknown> {
  return {
    paper: vel.formaat,
    orientation: vel.ligging,
    views: vel.views.map((v) => ({ title: v.titel, scale: v.schaal, shapes: v.elementen.length })),
  };
}

export const BLADTOOLS: McpToolDef[] = [
  {
    name: "modules_list",
    kind: "read",
    description:
      "List the calculation modules and library sheets that can be added with sheet_add (templateId and name), including modules installed from the online module library. " +
      "status: 'gereed' = checked against reference sheets, 'controleren' = verification present but not yet checked, 'raming' = quantity estimate only, 'concept' = input and drawing only. " +
      "To start an empty sheet with your own calculation text, call sheet_add without templateId.",
    inputSchema: objectSchema({}),
    annotations: LEZEN,
    rest: [{ method: "GET", path: "/modules" }],
    handler: (_args, ctx) => {
      const geinstalleerd = ctx.omgeving.bibliotheek.geinstalleerd();
      const gezien = new Set<string>();
      const modules: Record<string, unknown>[] = [];
      const loop = (nodes: TreeNode[], categorie: string, soort: "module" | "library") => {
        for (const n of nodes) {
          if (n.kind === "item") {
            if (!n.templateId || gezien.has(n.templateId)) continue;
            gezien.add(n.templateId);
            modules.push({
              templateId: n.templateId,
              name: ctx.omgeving.moduleNaam(n.templateId) ?? n.label,
              category: categorie,
              kind: soort,
              ...(n.status ? { status: n.status } : {}),
              published: n.gepubliceerd === true,
              fromLibrary: n.templateId in geinstalleerd,
              available: ctx.omgeving.sjabloon(n.templateId) !== undefined,
            });
          } else {
            loop(n.children, n.kind === "category" ? ctx.omgeving.groepNaam(n.id, n.label) : categorie, soort);
          }
        }
      };
      loop(moduleCatalogus, "Algemeen", "module");
      loop(bibliotheek, "Bibliotheek", "library");
      // Uit de online bibliotheek geïnstalleerd en niet in de vaste catalogus.
      for (const [id, info] of Object.entries(modulesPerTemplate)) {
        if (gezien.has(id)) continue;
        modules.push({
          templateId: id,
          name: ctx.omgeving.moduleNaam(id) ?? info.label,
          category: info.categorie,
          kind: "module",
          ...(info.status ? { status: info.status } : {}),
          published: geinstalleerd[id]?.gepubliceerd === true,
          fromLibrary: id in geinstalleerd,
          available: ctx.omgeving.sjabloon(id) !== undefined,
        });
      }
      return ok({ modules });
    },
  },

  {
    name: "sheets_list",
    kind: "read",
    description:
      "List the sheets of the project in order (id, name, kind calculation/pdf/spreadsheet/markdown/graph/drawing/jupyter/marimo, module, active, UC and verdict when known). " +
      "UC is reported for sheets evaluated through this API with their current input; pass evaluate=true to compute every sheet now.",
    inputSchema: objectSchema({
      evaluate: { type: "boolean", description: "Compute every calculation sheet now (a large sheet can take a second or more). Default false." },
    }),
    annotations: LEZEN,
    rest: [{ method: "GET", path: "/sheets" }],
    handler: (args, ctx) => ok({ sheets: lijstVan(ctx, args.evaluate === true) }),
  },

  {
    name: "sheet_add",
    kind: "mutate",
    description:
      "Add a sheet to the project and open it. kind picks the sort: 'calculation' (default), 'markdown', 'graph', 'drawing', 'spreadsheet', 'jupyter' or 'marimo'; a PDF has its own tool (sheet_add_pdf). " +
      "For a calculation sheet pass templateId (from modules_list), or omit it to add an empty sheet with your own calculation text in source. " +
      "For the other sorts pass their content: text (markdown), code (marimo), graph (graph), drawing/paper/orientation (drawing), path or base64 (spreadsheet XLSX, jupyter work folder ZIP). " +
      "Without content a sensible empty sheet is made (an empty Markdown text, a start notebook, an empty graph or A3 drawing, an empty workbook). name sets the sheet name.",
    inputSchema: objectSchema({
      kind: { type: "string", enum: [...SOORTEN], description: "Sort of sheet. Default 'calculation'." },
      templateId: { type: "string", minLength: 1, description: "Module to insert (calculation only; see modules_list). Omit for an empty sheet." },
      name: { type: "string", minLength: 1, description: "Name of the new sheet." },
      source: { type: "string", description: "Calculation text of an empty calculation sheet. Not allowed together with templateId." },
      text: { type: "string", description: "Markdown text (kind=markdown)." },
      code: { type: "string", description: "Marimo notebook code, a .py file (kind=marimo). Default: a start notebook." },
      graph: { type: "object", description: "Graph {versie, nodes, verbindingen} (kind=graph). Default: an empty graph." },
      drawing: { type: "object", description: "Drawing sheet {paper, orientation, views} (kind=drawing). Default: A3 landscape with one empty view." },
      paper: { type: "string", enum: [...PAPIERFORMATEN], description: "Paper size of a drawing sheet. Default A3." },
      orientation: { type: "string", enum: [...LIGGINGEN], description: "Orientation of a drawing sheet: staand (portrait) or liggend (landscape). Default liggend." },
      ...bestandBron,
      withCode: { type: "boolean", description: "jupyter/marimo: print the code in the report. Default true." },
      automatic: { type: "boolean", description: "jupyter: run every cell again after a change. Default false." },
    }),
    annotations: NIEUW,
    rest: [{ method: "POST", path: "/sheets", status: 201 }],
    handler: async (args, ctx) => {
      const soort = (typeof args.kind === "string" ? args.kind : "calculation") as Soort;
      const naam = typeof args.name === "string" ? args.name.trim() : "";
      if (soort !== "calculation" && args.templateId !== undefined) {
        return fout("VALIDATION", "templateId only applies to a calculation sheet.");
      }
      if (soort !== "calculation" && args.source !== undefined) {
        return fout("VALIDATION", "source only applies to a calculation sheet; pass the content of this sort instead (text, code, graph, drawing, path/base64).");
      }

      if (soort === "markdown") {
        let tekst = typeof args.text === "string" ? args.text : null;
        let bestandsnaam = typeof args.fileName === "string" ? args.fileName : "";
        if (tekst === null && (args.path !== undefined || args.base64 !== undefined)) {
          const gelezen = await bestandUit(args, ctx);
          if ("fout" in gelezen) return gelezen.fout;
          const uitBytes = tekstUitBytes(gelezen.bytes);
          if (uitBytes === null) return fout("VALIDATION", `${gelezen.bestandsnaam} is not a text file.`);
          tekst = uitBytes;
          bestandsnaam = gelezen.bestandsnaam;
        }
        const md: McpMarkdown = { bestandsnaam, tekst: tekst ?? "" };
        const basis = bestandsnaam ? bladnaamVoorMarkdown(bestandsnaam) : "Markdown";
        const id = ctx.omgeving.acties.voegMarkdownToe(basis, md);
        const blad = zoekBlad(ctx.omgeving.stand(), id);
        if (naam && blad && blad.naam !== naam) ctx.omgeving.acties.hernoem(id, naam);
        return ok({ id, name: zoekBlad(ctx.omgeving.stand(), id)?.naam ?? naam, kind: "markdown", characters: md.tekst.length });
      }

      if (soort === "marimo") {
        const code = typeof args.code === "string" ? args.code : await startNotebookCode(ctx);
        if (code.length > MARIMO_MAX_TEKENS) return fout("VALIDATION", `The notebook is larger than ${MARIMO_MAX_TEKENS} characters.`);
        if (!isMarimoCode(code)) {
          return fout("VALIDATION", "This is not a Marimo notebook: it must import marimo and define marimo.App().");
        }
        const bestandsnaam = typeof args.fileName === "string" ? args.fileName : "";
        const basis = bestandsnaam ? bladnaamVoorMarimo(bestandsnaam) : "Marimo";
        const id = ctx.omgeving.acties.voegMarimoToe(basis, { bestandsnaam, code, metCode: args.withCode !== false });
        const blad = zoekBlad(ctx.omgeving.stand(), id);
        if (naam && blad && blad.naam !== naam) ctx.omgeving.acties.hernoem(id, naam);
        return ok({ id, name: zoekBlad(ctx.omgeving.stand(), id)?.naam ?? naam, kind: "marimo", fileName: bestandsnaam, cells: marimoCellen(code).length });
      }

      if (soort === "graph") {
        if (args.graph === undefined) {
          const id = ctx.omgeving.acties.voegGraafToe("Graph");
          const blad = zoekBlad(ctx.omgeving.stand(), id);
          if (naam && blad && blad.naam !== naam) ctx.omgeving.acties.hernoem(id, naam);
          return ok({ id, name: zoekBlad(ctx.omgeving.stand(), id)?.naam ?? naam, kind: "graph", nodes: 0, connections: 0 });
        }
        const graaf = leesGraaf(args.graph);
        if (!graaf) return fout("VALIDATION", "graph is not a valid graph: {versie, nodes, verbindingen} with nodes that have an id, soort, x and y.");
        const id = ctx.omgeving.acties.voegGraafToe("Graph");
        ctx.omgeving.acties.zetGraaf(id, graaf);
        const blad = zoekBlad(ctx.omgeving.stand(), id);
        if (naam && blad && blad.naam !== naam) ctx.omgeving.acties.hernoem(id, naam);
        return ok({ id, name: zoekBlad(ctx.omgeving.stand(), id)?.naam ?? naam, kind: "graph", nodes: graaf.nodes.length, connections: graaf.verbindingen.length });
      }

      if (soort === "drawing") {
        const titel = naam || "View 1";
        let vel: TekenVel;
        if (args.drawing !== undefined) {
          const gelezen = leesTekenVel(args.drawing);
          if (!gelezen) return fout("VALIDATION", "drawing is not a valid drawing sheet: {paper, orientation, views}.");
          vel = gelezen;
        } else {
          const formaat = typeof args.paper === "string" ? (args.paper as Papierformaat) : "A3";
          const ligging = typeof args.orientation === "string" ? (args.orientation as Ligging) : "liggend";
          vel = leegTekenvel(titel, formaat, ligging);
        }
        const basis = bladnaamVoor("Drawing");
        const id = ctx.omgeving.acties.voegTekenbladToe(basis, vel);
        const blad = zoekBlad(ctx.omgeving.stand(), id);
        if (naam && blad && blad.naam !== naam) ctx.omgeving.acties.hernoem(id, naam);
        return ok({ id, name: zoekBlad(ctx.omgeving.stand(), id)?.naam ?? naam, kind: "drawing", ...tekenvelSamenvatting(vel) });
      }

      if (soort === "spreadsheet") {
        let xlsx: { bestandsnaam: string; data: string };
        if (args.path !== undefined || args.base64 !== undefined) {
          const gelezen = await bestandUit(args, ctx);
          if ("fout" in gelezen) return gelezen.fout;
          if (!lijktOpWerkmap(gelezen.bytes)) return fout("VALIDATION", `${gelezen.bestandsnaam} is not an XLSX file.`);
          xlsx = { bestandsnaam: gelezen.bestandsnaam, data: gelezen.data };
        } else {
          xlsx = { bestandsnaam: "", data: LEGE_WERKMAP };
        }
        const basis = xlsx.bestandsnaam ? bladnaamVoorWerkmap(xlsx.bestandsnaam) : "Spreadsheet";
        const id = ctx.omgeving.acties.voegSpreadsheetToe(basis, xlsx);
        const blad = zoekBlad(ctx.omgeving.stand(), id);
        if (naam && blad && blad.naam !== naam) ctx.omgeving.acties.hernoem(id, naam);
        return ok({ id, name: zoekBlad(ctx.omgeving.stand(), id)?.naam ?? naam, kind: "spreadsheet", fileName: xlsx.bestandsnaam, bytes: base64Bytes(xlsx.data) });
      }

      if (soort === "jupyter") {
        let jupyter: { bestandsnaam: string; data: string };
        let aantalBestanden: number | null = null;
        if (args.path !== undefined || args.base64 !== undefined) {
          const gelezen = await bestandUit(args, ctx);
          if ("fout" in gelezen) return gelezen.fout;
          if (gelezen.bytes.length > WERKMAP_MAX_BYTES) return fout("VALIDATION", `${gelezen.bestandsnaam} is larger than ${WERKMAP_MAX_BYTES / 1024 / 1024} MB.`);
          let bestanden: WerkmapBestand[];
          try {
            bestanden = pakWerkmapUit(gelezen.bytes);
          } catch (e) {
            return fout("VALIDATION", `${gelezen.bestandsnaam} is not a readable work folder (ZIP): ${e instanceof Error ? e.message : String(e)}`);
          }
          if (bestanden.length === 0) return fout("VALIDATION", `${gelezen.bestandsnaam} holds no files.`);
          aantalBestanden = bestanden.length;
          jupyter = { bestandsnaam: gelezen.bestandsnaam, data: gelezen.data };
        } else {
          jupyter = await startJupyterWerkmap(ctx);
        }
        const basis = jupyter.bestandsnaam ? bladnaamVoorNotebook(jupyter.bestandsnaam) : "Notebook";
        const id = ctx.omgeving.acties.voegJupyterToe(basis, {
          ...jupyter,
          metCode: args.withCode !== false,
          ...(args.automatic === true ? { automatisch: true } : {}),
        });
        const blad = zoekBlad(ctx.omgeving.stand(), id);
        if (naam && blad && blad.naam !== naam) ctx.omgeving.acties.hernoem(id, naam);
        return ok({
          id,
          name: zoekBlad(ctx.omgeving.stand(), id)?.naam ?? naam,
          kind: "jupyter",
          fileName: jupyter.bestandsnaam,
          bytes: base64Bytes(jupyter.data),
          ...(aantalBestanden !== null ? { files: aantalBestanden } : {}),
        });
      }

      // calculation
      const templateId = typeof args.templateId === "string" ? args.templateId : null;
      let bron: string;
      let basis: string;
      let tid: string;
      if (templateId !== null && templateId !== LEEG_BLAD) {
        if (typeof args.source === "string") return fout("VALIDATION", "Pass either templateId or source, not both. Use sheet_set_source afterwards to change the text.");
        const sjabloon = ctx.omgeving.sjabloon(templateId);
        if (sjabloon === undefined) {
          return fout("NOT_FOUND", `Unknown templateId "${templateId}". Call modules_list for the available modules.`);
        }
        bron = sjabloon;
        basis = korteNaam(ctx.omgeving.moduleNaam(templateId) ?? templateId);
        tid = templateId;
      } else {
        bron = typeof args.source === "string" ? args.source : LEEG_BLAD_TEKST;
        basis = LEEG_BLAD_NAAM;
        tid = LEEG_BLAD;
      }
      const id = ctx.omgeving.acties.voegToe(tid, basis, bron);
      let blad = zoekBlad(ctx.omgeving.stand(), id);
      if (naam && blad && blad.naam !== naam) {
        ctx.omgeving.acties.hernoem(id, naam);
        blad = zoekBlad(ctx.omgeving.stand(), id);
      }
      const { velden, fout: leesfout } = veldenVan(bron);
      return ok({
        id,
        name: blad?.naam ?? naam,
        kind: "calculation",
        templateId: tid,
        inputs: velden.map((v) => invoerJson(v, blad?.waarden ?? {}, bron)),
        ...(leesfout ? { parseError: leesfout } : {}),
      });
    },
  },

  {
    name: "sheet_add_pdf",
    kind: "mutate",
    description:
      "Add a PDF sheet: a PDF file (e.g. a supplier calculation or a FEM report) that sits between the calculation sheets and goes into the structural report. " +
      "Pass path (a PDF on this computer) or base64. name defaults to the file name without .pdf.",
    inputSchema: objectSchema({ ...pdfBron, name: { type: "string", minLength: 1, description: "Name of the new sheet." } }),
    annotations: NIEUW,
    rest: [{ method: "POST", path: "/sheets/pdf", status: 201 }],
    handler: async (args, ctx) => {
      const gelezen = await pdfUit(args, ctx);
      if ("fout" in gelezen) return gelezen.fout;
      const naam = typeof args.name === "string" && args.name.trim() ? args.name.trim() : bladnaamVoor(gelezen.pdf.bestandsnaam);
      const id = ctx.omgeving.acties.voegPdfToe(naam, gelezen.pdf);
      const blad = zoekBlad(ctx.omgeving.stand(), id);
      return ok({ id, name: blad?.naam ?? naam, fileName: gelezen.pdf.bestandsnaam, bytes: base64Bytes(gelezen.pdf.data) });
    },
  },

  {
    name: "sheet_get",
    kind: "read",
    description:
      "Read one sheet. A calculation sheet gives its text (source), its input fields and, unless evaluate=false, the outcome (title, norm, governing UC, verdict, UC values). " +
      "A PDF or spreadsheet gives the file name and size; Markdown gives its text; a graph its nodes and connections; a drawing a summary (pass full=true for the whole sheet); Jupyter its file name, size and files; Marimo its code, cell count and stored output.",
    inputSchema: objectSchema({
      id: idOptioneel,
      evaluate: { type: "boolean", description: "Compute the sheet to report the outcome (a large sheet can take a second). Default true." },
      full: { type: "boolean", description: "Drawing and Marimo: return the whole sheet (views with shapes, stored output) instead of a summary. Default false." },
    }),
    annotations: LEZEN,
    rest: [{ method: "GET", path: "/sheets/{id}" }],
    handler: (args, ctx) => {
      const gevonden = bladUit(args, ctx, true);
      if ("fout" in gevonden) return gevonden.fout;
      const { blad, stand } = gevonden;
      const basis = {
        id: blad.id,
        name: blad.naam,
        templateId: blad.templateId,
        kind: bladSoort(blad),
        module: ctx.omgeving.moduleNaam(blad.templateId),
        active: blad.id === stand.activeId,
        position: stand.exemplaren.indexOf(blad),
      };
      if (isPdfBlad(blad)) {
        return ok({ ...basis, pdf: blad.pdf ? { fileName: blad.pdf.bestandsnaam, bytes: base64Bytes(blad.pdf.data) } : null });
      }
      if (isSpreadsheetBlad(blad)) {
        return ok({ ...basis, spreadsheet: blad.xlsx ? { fileName: blad.xlsx.bestandsnaam, bytes: base64Bytes(blad.xlsx.data) } : null });
      }
      if (isMarkdownBlad(blad)) {
        return ok({ ...basis, markdown: blad.md ? { fileName: blad.md.bestandsnaam, text: blad.md.tekst } : null });
      }
      if (isGraafBlad(blad)) {
        return ok({ ...basis, graph: blad.graaf ?? null });
      }
      if (isTekenBlad(blad)) {
        const vel = blad.tekenvel;
        return ok({
          ...basis,
          drawing: vel ? (args.full === true ? vel : tekenvelSamenvatting(vel)) : null,
        });
      }
      if (isJupyterBlad(blad)) {
        const jupyter = blad.jupyter;
        let bestanden: string[] = [];
        if (jupyter) {
          try {
            bestanden = pakWerkmapUit(uitBase64(jupyter.data)).map((b) => b.pad);
          } catch {
            bestanden = [];
          }
        }
        return ok({
          ...basis,
          jupyter: jupyter
            ? { fileName: jupyter.bestandsnaam, bytes: base64Bytes(jupyter.data), withCode: jupyter.metCode, automatic: jupyter.automatisch === true, files: bestanden }
            : null,
        });
      }
      if (isMarimoBlad(blad)) {
        const nb = blad.marimo;
        return ok({
          ...basis,
          marimo: nb
            ? {
                fileName: nb.bestandsnaam,
                code: nb.code,
                withCode: nb.metCode,
                cells: marimoCellen(nb.code).length,
                outputCells: nb.uitvoer.filter((u) => u.trim()).length,
                ...(args.full === true ? { output: nb.uitvoer } : {}),
              }
            : null,
        });
      }
      const { velden, fout: leesfout } = veldenVan(blad.source);
      const veldnamen = new Set(velden.map((v) => v.naam));
      const data: Record<string, unknown> = {
        ...basis,
        source: blad.source,
        inputs: velden.map((v) => invoerJson(v, blad.waarden, blad.source)),
        otherValues: Object.fromEntries(Object.entries(blad.waarden).filter(([k]) => !veldnamen.has(k))),
      };
      if (leesfout) data.parseError = leesfout;
      if (args.evaluate !== false) {
        const uitkomst = rekenBlad(blad, stand.gegevens);
        data.result = uitkomst.ok
          ? { ...resultaatJson(uitkomst.d.resultaat), ucValues: ucWaarden(uitkomst.d.getallen) }
          : { error: uitkomst.fout };
      }
      return ok(data);
    },
  },

  {
    name: "sheet_set_source",
    kind: "mutate",
    description: "Replace the calculation text of a sheet. Input values already entered stay as they are. Undoable (undo). Returns the input fields of the new text.",
    inputSchema: objectSchema({ id: idVerplicht, source: { type: "string", description: "The new calculation text." } }, ["id", "source"]),
    annotations: WEG,
    rest: [{ method: "PUT", path: "/sheets/{id}/source" }],
    handler: (args, ctx) => {
      const gevonden = bladUit(args, ctx, false);
      if ("fout" in gevonden) return gevonden.fout;
      const pdf = geenPdfBlad(gevonden.blad);
      if (pdf) return pdf;
      const source = String(args.source);
      ctx.omgeving.acties.zetBron(gevonden.blad.id, source);
      const { velden, fout: leesfout } = veldenVan(source);
      const blad = zoekBlad(ctx.omgeving.stand(), gevonden.blad.id) ?? gevonden.blad;
      return ok({
        id: blad.id,
        name: blad.naam,
        lines: source.split("\n").length,
        inputs: velden.map((v) => invoerJson(v, blad.waarden, blad.source)),
        ...(leesfout ? { parseError: leesfout } : {}),
      });
    },
  },

  {
    name: "sheet_set_input",
    kind: "mutate",
    description:
      "Set input values of a sheet: an input field or a choice list (see inputs in sheet_get). Pass name and value for one value, or values as an object {name: value} for several. " +
      "For a choice list pass the option value (the option text is also accepted). Numbers may be given as number or text ('4.2' or '4,2'), in the unit of the field. Nothing is written if one value is invalid.",
    inputSchema: objectSchema(
      {
        id: idVerplicht,
        name: { type: "string", minLength: 1, description: "Input name." },
        value: { ...tekstOfGetal, description: "New value." },
        values: { type: "object", description: "Several values at once: {name: value}.", additionalProperties: tekstOfGetal },
      },
      ["id"],
    ),
    annotations: WIJZIGEN,
    rest: [{ method: "PATCH", path: "/sheets/{id}/inputs" }],
    handler: (args, ctx) => {
      const gevonden = bladUit(args, ctx, false);
      if ("fout" in gevonden) return gevonden.fout;
      const { blad } = gevonden;
      const pdf = geenPdfBlad(blad);
      if (pdf) return pdf;
      const gevraagd: [string, unknown][] = [];
      if (typeof args.name === "string") {
        if (args.value === undefined) return fout("VALIDATION", "Pass value together with name.");
        gevraagd.push([args.name, args.value]);
      } else if (args.value !== undefined) {
        return fout("VALIDATION", "Pass name together with value.");
      }
      if (args.values && typeof args.values === "object") gevraagd.push(...Object.entries(args.values as Record<string, unknown>));
      if (gevraagd.length === 0) return fout("VALIDATION", "Pass name and value, or values.");

      const { velden } = veldenVan(blad.source);
      const perNaam = new Map(velden.map((v) => [v.naam, v]));
      // Eerst alles controleren, dan pas schrijven: geen half uitgevoerde reeks.
      const zetten: [string, string][] = [];
      for (const [naam, ruw] of gevraagd) {
        const tekst = alsTekst(ruw);
        if (tekst === null) return fout("VALIDATION", `Value of ${naam} must be a string or a number.`);
        const veld = perNaam.get(naam);
        if (!veld) {
          // Een beeld bewaart soms eigen instellingen in de invoer van het blad; die mogen ook.
          if (blad.waarden[naam] !== undefined) {
            zetten.push([naam, tekst]);
            continue;
          }
          return fout("VALIDATION", `Sheet "${blad.naam}" has no input "${naam}".`, { inputs: velden.map((v) => v.naam) });
        }
        if (veld.soort === "keuze") {
          const gekozen = kiesKeuze(veld, tekst);
          if (gekozen === null) {
            return fout("VALIDATION", `"${tekst}" is not an option of ${naam}.`, {
              options: veld.keuzes.map((k) => ({ value: k.value, text: k.text })),
            });
          }
          zetten.push([naam, gekozen]);
        } else {
          zetten.push([naam, tekst]);
        }
      }
      for (const [naam, waarde] of zetten) ctx.omgeving.acties.zetWaarde(blad.id, naam, waarde);
      return ok({ id: blad.id, name: blad.naam, set: Object.fromEntries(zetten) });
    },
  },

  {
    name: "sheet_set_pdf",
    kind: "mutate",
    description: "Replace the PDF file of a PDF sheet (path or base64); name and position stay.",
    inputSchema: objectSchema({ id: idVerplicht, ...pdfBron }, ["id"]),
    annotations: WEG,
    rest: [{ method: "PUT", path: "/sheets/{id}/pdf" }],
    handler: async (args, ctx) => {
      const gevonden = bladUit(args, ctx, false);
      if ("fout" in gevonden) return gevonden.fout;
      if (!isPdfBlad(gevonden.blad)) return fout("VALIDATION", `Sheet "${gevonden.blad.naam}" is not a PDF sheet.`);
      const gelezen = await pdfUit(args, ctx);
      if ("fout" in gelezen) return gelezen.fout;
      ctx.omgeving.acties.zetPdf(gevonden.blad.id, gelezen.pdf);
      return ok({ id: gevonden.blad.id, name: gevonden.blad.naam, fileName: gelezen.pdf.bestandsnaam, bytes: base64Bytes(gelezen.pdf.data) });
    },
  },
  {
    name: "sheet_set_markdown",
    kind: "mutate",
    description: "Replace the text of a Markdown sheet. fileName and headingsInToc are optional; what you leave out stays as it is. Undoable (undo).",
    inputSchema: objectSchema(
      {
        id: idVerplicht,
        text: { type: "string", description: "The new Markdown text." },
        fileName: { type: "string", description: "Source file name to store with the sheet." },
        headingsInToc: { type: "boolean", description: "Keep the headings of this sheet in the table of contents of the report." },
      },
      ["id", "text"],
    ),
    annotations: WIJZIGEN,
    rest: [{ method: "PUT", path: "/sheets/{id}/markdown" }],
    handler: (args, ctx) => {
      const gevonden = bladUit(args, ctx, false);
      if ("fout" in gevonden) return gevonden.fout;
      const { blad } = gevonden;
      if (!isMarkdownBlad(blad)) return fout("VALIDATION", `Sheet "${blad.naam}" is not a Markdown sheet.`);
      const md: McpMarkdown = {
        bestandsnaam: typeof args.fileName === "string" ? args.fileName : (blad.md?.bestandsnaam ?? ""),
        tekst: String(args.text),
      };
      const koppenUit = typeof args.headingsInToc === "boolean" ? args.headingsInToc : blad.md?.koppenUit === true;
      if (koppenUit) md.koppenUit = true;
      ctx.omgeving.acties.zetMarkdown(blad.id, md);
      return ok({ id: blad.id, name: blad.naam, characters: md.tekst.length, lines: md.tekst.split("\n").length, headingsInToc: koppenUit });
    },
  },

  {
    name: "sheet_set_marimo",
    kind: "mutate",
    description:
      "Replace the code of a Marimo notebook sheet (a .py file with @app.cell blocks). The stored output belongs to the old code, so it is cleared unless clearOutput=false; the app computes new output when the user runs the notebook. Undoable (undo).",
    inputSchema: objectSchema(
      {
        id: idVerplicht,
        code: { type: "string", description: "The Marimo notebook as Python code." },
        fileName: { type: "string", description: "Source file name to store with the sheet." },
        withCode: { type: "boolean", description: "Print the code in the report. Default: keep the current setting." },
        clearOutput: { type: "boolean", description: "Drop the stored output of the old code. Default true." },
      },
      ["id", "code"],
    ),
    annotations: WIJZIGEN,
    rest: [{ method: "PUT", path: "/sheets/{id}/marimo" }],
    handler: (args, ctx) => {
      const gevonden = bladUit(args, ctx, false);
      if ("fout" in gevonden) return gevonden.fout;
      const { blad } = gevonden;
      if (!isMarimoBlad(blad)) return fout("VALIDATION", `Sheet "${blad.naam}" is not a Marimo sheet.`);
      const code = String(args.code);
      if (code.length > MARIMO_MAX_TEKENS) return fout("VALIDATION", `The notebook is larger than ${MARIMO_MAX_TEKENS} characters.`);
      if (!isMarimoCode(code)) return fout("VALIDATION", "This is not a Marimo notebook: it must import marimo and define marimo.App().");
      const bewaard = blad.marimo;
      const wissen = args.clearOutput !== false;
      ctx.omgeving.acties.zetMarimo(blad.id, {
        bestandsnaam: typeof args.fileName === "string" ? args.fileName : (bewaard?.bestandsnaam ?? ""),
        code,
        metCode: typeof args.withCode === "boolean" ? args.withCode : (bewaard?.metCode ?? true),
        uitvoer: wissen ? [] : (bewaard?.uitvoer ?? []),
      });
      return ok({ id: blad.id, name: blad.naam, cells: marimoCellen(code).length, outputCleared: wissen });
    },
  },

  {
    name: "sheet_set_graph",
    kind: "mutate",
    description: "Replace the whole graph of a graph sheet: nodes and connections as JSON ({versie, nodes, verbindingen}). The sheet recomputes its values from the graph. Undoable (undo).",
    inputSchema: objectSchema({ id: idVerplicht, graph: { type: "object", description: "The graph: {versie, nodes, verbindingen}." } }, ["id", "graph"]),
    annotations: WIJZIGEN,
    rest: [{ method: "PUT", path: "/sheets/{id}/graph" }],
    handler: (args, ctx) => {
      const gevonden = bladUit(args, ctx, false);
      if ("fout" in gevonden) return gevonden.fout;
      const { blad } = gevonden;
      if (!isGraafBlad(blad)) return fout("VALIDATION", `Sheet "${blad.naam}" is not a graph sheet.`);
      const graaf = leesGraaf(args.graph);
      if (!graaf) return fout("VALIDATION", "graph is not a valid graph: {versie, nodes, verbindingen} with nodes that have an id, soort, x and y.");
      ctx.omgeving.acties.zetGraaf(blad.id, graaf);
      return ok({ id: blad.id, name: blad.naam, nodes: graaf.nodes.length, connections: graaf.verbindingen.length });
    },
  },

  {
    name: "sheet_set_drawing",
    kind: "mutate",
    description:
      "Change a drawing sheet: pass drawing to replace the whole sheet ({paper, orientation, views}), or paper and/or orientation to change only the sheet size. A view holds shapes in mm; see sheet_get with full=true for the current sheet. Undoable (undo).",
    inputSchema: objectSchema({
      id: idVerplicht,
      drawing: { type: "object", description: "The whole drawing sheet {paper, orientation, views}." },
      paper: { type: "string", enum: [...PAPIERFORMATEN], description: "New paper size." },
      orientation: { type: "string", enum: [...LIGGINGEN], description: "New orientation: staand or liggend." },
    }, ["id"]),
    annotations: WIJZIGEN,
    rest: [{ method: "PUT", path: "/sheets/{id}/drawing" }],
    handler: (args, ctx) => {
      const gevonden = bladUit(args, ctx, false);
      if ("fout" in gevonden) return gevonden.fout;
      const { blad } = gevonden;
      if (!isTekenBlad(blad)) return fout("VALIDATION", `Sheet "${blad.naam}" is not a drawing sheet.`);
      if (args.drawing === undefined && args.paper === undefined && args.orientation === undefined) {
        return fout("VALIDATION", "Pass drawing, or paper and/or orientation.");
      }
      let vel: TekenVel;
      if (args.drawing !== undefined) {
        const gelezen = leesTekenVel(args.drawing);
        if (!gelezen) return fout("VALIDATION", "drawing is not a valid drawing sheet: {paper, orientation, views}.");
        vel = gelezen;
      } else {
        const huidig = blad.tekenvel ?? leegTekenvel(blad.naam);
        vel = {
          ...huidig,
          formaat: typeof args.paper === "string" ? (args.paper as Papierformaat) : huidig.formaat,
          ligging: typeof args.orientation === "string" ? (args.orientation as Ligging) : huidig.ligging,
        };
      }
      ctx.omgeving.acties.zetTekenVel(blad.id, vel);
      return ok({ id: blad.id, name: blad.naam, ...tekenvelSamenvatting(vel) });
    },
  },

  {
    name: "sheet_set_spreadsheet",
    kind: "mutate",
    description: "Replace the workbook (XLSX) of a spreadsheet sheet with a file from this computer (path) or base64. Name and position stay. Undoable (undo).",
    inputSchema: objectSchema({ id: idVerplicht, ...bestandBron }, ["id"]),
    annotations: WEG,
    rest: [{ method: "PUT", path: "/sheets/{id}/spreadsheet" }],
    handler: async (args, ctx) => {
      const gevonden = bladUit(args, ctx, false);
      if ("fout" in gevonden) return gevonden.fout;
      const { blad } = gevonden;
      if (!isSpreadsheetBlad(blad)) return fout("VALIDATION", `Sheet "${blad.naam}" is not a spreadsheet sheet.`);
      const gelezen = await bestandUit(args, ctx);
      if ("fout" in gelezen) return gelezen.fout;
      if (!lijktOpWerkmap(gelezen.bytes)) return fout("VALIDATION", `${gelezen.bestandsnaam} is not an XLSX file.`);
      const naam = typeof args.fileName === "string" && args.fileName ? args.fileName : (blad.xlsx?.bestandsnaam || gelezen.bestandsnaam);
      ctx.omgeving.acties.zetSpreadsheet(blad.id, { bestandsnaam: naam, data: gelezen.data });
      return ok({ id: blad.id, name: blad.naam, fileName: naam, bytes: gelezen.bytes.length });
    },
  },

  {
    name: "sheet_set_jupyter",
    kind: "mutate",
    description:
      "Replace the work folder (ZIP with .ipynb files) of a Jupyter sheet with a file from this computer (path) or base64. withCode and automatic are optional; what you leave out stays as it is. Undoable (undo).",
    inputSchema: objectSchema(
      {
        id: idVerplicht,
        ...bestandBron,
        withCode: { type: "boolean", description: "Print the code in the report." },
        automatic: { type: "boolean", description: "Run every cell again after a change." },
      },
      ["id"],
    ),
    annotations: WEG,
    rest: [{ method: "PUT", path: "/sheets/{id}/jupyter" }],
    handler: async (args, ctx) => {
      const gevonden = bladUit(args, ctx, false);
      if ("fout" in gevonden) return gevonden.fout;
      const { blad } = gevonden;
      if (!isJupyterBlad(blad)) return fout("VALIDATION", `Sheet "${blad.naam}" is not a Jupyter sheet.`);
      const gelezen = await bestandUit(args, ctx);
      if ("fout" in gelezen) return gelezen.fout;
      if (gelezen.bytes.length > WERKMAP_MAX_BYTES) return fout("VALIDATION", `${gelezen.bestandsnaam} is larger than ${WERKMAP_MAX_BYTES / 1024 / 1024} MB.`);
      let bestanden: WerkmapBestand[];
      try {
        bestanden = pakWerkmapUit(gelezen.bytes);
      } catch (e) {
        return fout("VALIDATION", `${gelezen.bestandsnaam} is not a readable work folder (ZIP): ${e instanceof Error ? e.message : String(e)}`);
      }
      if (bestanden.length === 0) return fout("VALIDATION", `${gelezen.bestandsnaam} holds no files.`);
      const huidig = blad.jupyter;
      const naam = typeof args.fileName === "string" && args.fileName ? args.fileName : (huidig?.bestandsnaam || gelezen.bestandsnaam);
      ctx.omgeving.acties.zetJupyter(blad.id, {
        bestandsnaam: naam,
        data: gelezen.data,
        metCode: typeof args.withCode === "boolean" ? args.withCode : (huidig?.metCode ?? true),
        ...(typeof args.automatic === "boolean" ? { automatisch: args.automatic } : (huidig?.automatisch !== undefined ? { automatisch: huidig.automatisch } : {})),
      });
      return ok({ id: blad.id, name: blad.naam, fileName: naam, bytes: gelezen.bytes.length, files: bestanden.length });
    },
  },


  {
    name: "sheet_rename",
    kind: "mutate",
    description: "Rename a sheet. The name shows in the project tree, the report and on the printout.",
    inputSchema: objectSchema({ id: idVerplicht, name: { type: "string", minLength: 1, description: "New name." } }, ["id", "name"]),
    annotations: WIJZIGEN,
    rest: [{ method: "PATCH", path: "/sheets/{id}" }],
    handler: (args, ctx) => {
      const gevonden = bladUit(args, ctx, false);
      if ("fout" in gevonden) return gevonden.fout;
      const naam = String(args.name).trim();
      if (!naam) return fout("VALIDATION", "name must not be empty.");
      ctx.omgeving.acties.hernoem(gevonden.blad.id, naam);
      return ok({ id: gevonden.blad.id, name: naam, previous: gevonden.blad.naam });
    },
  },

  {
    name: "sheet_duplicate",
    kind: "mutate",
    description: "Duplicate a sheet with its own copy of text and inputs, directly after the original, and open the copy. name sets the name of the copy.",
    inputSchema: objectSchema({ id: idVerplicht, name: { type: "string", minLength: 1, description: "Name of the copy." } }, ["id"]),
    annotations: NIEUW,
    rest: [{ method: "POST", path: "/sheets/{id}/duplicate", status: 201 }],
    handler: (args, ctx) => {
      const gevonden = bladUit(args, ctx, false);
      if ("fout" in gevonden) return gevonden.fout;
      const nieuw = ctx.omgeving.acties.dupliceer(gevonden.blad.id);
      if (!nieuw) return geenBlad(ctx.omgeving.stand(), gevonden.blad.id);
      const naam = typeof args.name === "string" ? args.name.trim() : "";
      if (naam) ctx.omgeving.acties.hernoem(nieuw, naam);
      const stand = ctx.omgeving.stand();
      const blad = zoekBlad(stand, nieuw);
      return ok({ id: nieuw, name: blad?.naam ?? naam, position: blad ? stand.exemplaren.indexOf(blad) : null, copyOf: gevonden.blad.id });
    },
  },

  {
    name: "sheet_move",
    kind: "mutate",
    description: "Move a sheet up or down in the project (and thus in the report and the printout). steps defaults to 1; the sheet stops at the top or bottom.",
    inputSchema: objectSchema(
      {
        id: idVerplicht,
        direction: { type: "string", enum: ["up", "down"], description: "up = towards the start of the project." },
        steps: { type: "integer", minimum: 1, maximum: 1000, description: "Number of places. Default 1." },
      },
      ["id", "direction"],
    ),
    annotations: { ...WIJZIGEN, idempotentHint: false },
    rest: [{ method: "POST", path: "/sheets/{id}/move" }],
    handler: (args, ctx) => {
      const gevonden = bladUit(args, ctx, false);
      if ("fout" in gevonden) return gevonden.fout;
      const richting = args.direction === "up" ? -1 : 1;
      const stappen = typeof args.steps === "number" ? args.steps : 1;
      const id = gevonden.blad.id;
      for (let i = 0; i < stappen; i++) {
        const lijst = ctx.omgeving.stand().exemplaren;
        const plek = lijst.findIndex((e) => e.id === id);
        const doel = plek + richting;
        if (doel < 0 || doel >= lijst.length) break;
        ctx.omgeving.acties.verplaats(id, richting);
      }
      const lijst = ctx.omgeving.stand().exemplaren;
      return ok({ id, position: lijst.findIndex((e) => e.id === id), order: lijst.map((e) => e.id) });
    },
  },

  {
    name: "sheet_remove",
    kind: "mutate",
    description: "Remove a sheet from the project. Undoable (undo).",
    inputSchema: objectSchema({ id: idVerplicht }, ["id"]),
    annotations: WEG,
    rest: [{ method: "DELETE", path: "/sheets/{id}" }],
    handler: (args, ctx) => {
      const gevonden = bladUit(args, ctx, false);
      if ("fout" in gevonden) return gevonden.fout;
      ctx.omgeving.acties.verwijder(gevonden.blad.id);
      vergeetBlad(gevonden.blad.id);
      const stand = ctx.omgeving.stand();
      return ok({ removed: gevonden.blad.id, name: gevonden.blad.naam, remainingSheets: stand.exemplaren.length });
    },
  },

  {
    name: "sheet_select",
    kind: "ui",
    description:
      "Open a sheet in the app so the user sees it. id is a sheet id, or 'project' for the project data form, or 'report' for the structural report. Does not change the project.",
    inputSchema: objectSchema({ id: { type: "string", minLength: 1, description: "Sheet id, 'project' or 'report'." } }, ["id"]),
    annotations: { ...LEZEN, readOnlyHint: false },
    rest: [{ method: "POST", path: "/sheets/{id}/select" }],
    handler: (args, ctx) => {
      const id = String(args.id);
      const { project, rapport } = ctx.omgeving.speciaal;
      const doel = id === "project" ? project : id === "report" || id === "rapport" ? rapport : id;
      const stand = ctx.omgeving.stand();
      if (doel !== project && doel !== rapport && !zoekBlad(stand, doel)) return geenBlad(stand, id);
      ctx.omgeving.acties.selecteer(doel);
      return ok({ selected: doel === project ? "project" : doel === rapport ? "report" : doel });
    },
  },

  {
    name: "sheet_evaluate",
    kind: "read",
    description:
      "Compute a sheet with its own inputs and the project data, and return the outcome: title, norm, governing UC (UC_max), verdict (passes), every UC value and the numbers the sheet shows (name → value in the sheet's unit). " +
      "Pass names to return only those numbers, or numbers=false to leave them out.",
    inputSchema: objectSchema({
      id: idOptioneel,
      numbers: { type: "boolean", description: "Include the numbers of the sheet. Default true." },
      names: { type: "array", items: { type: "string" }, description: "Only these numbers (variable names)." },
    }),
    annotations: LEZEN,
    rest: [{ method: "POST", path: "/sheets/{id}/evaluate" }],
    handler: (args, ctx) => {
      const gevonden = bladUit(args, ctx, true);
      if ("fout" in gevonden) return gevonden.fout;
      const { blad, stand } = gevonden;
      const pdf = geenPdfBlad(blad);
      if (pdf) return pdf;
      const uitkomst = rekenBlad(blad, stand.gegevens);
      if (!uitkomst.ok) return fout("CALC_ERROR", `Sheet "${blad.naam}" could not be computed: ${uitkomst.fout}`, { id: blad.id });
      const { resultaat, getallen } = uitkomst.d;
      const data: Record<string, unknown> = { id: blad.id, name: blad.naam, ...resultaatJson(resultaat), ucValues: ucWaarden(getallen) };
      if (Array.isArray(args.names)) {
        const gevraagd = args.names.filter((n): n is string => typeof n === "string");
        data.numbers = Object.fromEntries(gevraagd.map((n) => [n, n in getallen ? jsonGetal(getallen[n]) : null]));
      } else if (args.numbers !== false) {
        data.numbers = Object.fromEntries(Object.entries(getallen).map(([n, w]) => [n, jsonGetal(w)]));
      }
      return ok(data);
    },
  },

  {
    name: "sheet_insert_formula",
    kind: "mutate",
    description:
      "Insert a formula from the formula library (formulas_list) into a sheet's calculation text: its inputs with example values and the formula lines. " +
      "position: 'end' (default), 'start', or a line number to insert after (0 = before the first line). Returns the lines that were inserted.",
    inputSchema: objectSchema(
      {
        id: idVerplicht,
        formulaId: { type: "string", minLength: 1, description: "Formula id (from formulas_list)." },
        position: { type: ["string", "integer"], description: "'end', 'start' or a line number after which to insert." },
        language: { type: "string", enum: ["en", "nl"], description: "Language of the text lines of a worked example. Default: the language of the app." },
      },
      ["id", "formulaId"],
    ),
    annotations: NIEUW,
    rest: [{ method: "POST", path: "/sheets/{id}/formulas" }],
    handler: async (args, ctx) => {
      const gevonden = bladUit(args, ctx, false);
      if ("fout" in gevonden) return gevonden.fout;
      const pdf = geenPdfBlad(gevonden.blad);
      if (pdf) return pdf;
      const formule = alleFormules().find((f) => f.id === args.formulaId);
      if (!formule) return fout("NOT_FOUND", `Unknown formula "${String(args.formulaId)}". Call formulas_list.`);
      const regelsNu = gevonden.blad.source.split("\n");
      // Een lege slotregel telt niet mee als plek: "einde" is na de laatste echte regel.
      while (regelsNu.length > 0 && regelsNu[regelsNu.length - 1] === "") regelsNu.pop();
      const plekArg = args.position ?? "end";
      let na: number;
      if (plekArg === "end") na = regelsNu.length;
      else if (plekArg === "start") na = 0;
      else if (typeof plekArg === "number" && Number.isInteger(plekArg) && plekArg >= 0) na = Math.min(plekArg, regelsNu.length);
      else return fout("VALIDATION", "position must be 'end', 'start' or a line number >= 0.");
      // Alleen een fragment met tekst heeft twee talen; "auto" volgt het systeem, zoals de app.
      const ingesteld = formule.codeEn && typeof args.language !== "string" ? (await ctx.omgeving.instellingen.lees()).language : "";
      const taal = typeof args.language === "string" ? args.language : ingesteld === "auto" ? globalThis.navigator?.language : ingesteld;
      const tekst = codeVan(formule, taal);
      const fragment = tekst.split("\n");
      const nieuw = [...regelsNu.slice(0, na), ...fragment, ...regelsNu.slice(na)];
      ctx.omgeving.acties.zetBron(gevonden.blad.id, nieuw.join("\n") + "\n");
      return ok({
        id: gevonden.blad.id,
        formulaId: formule.id,
        fromLine: na + 1,
        toLine: na + fragment.length,
        inserted: tekst,
        ...(formule.projectvariabelen?.length ? { usesProjectData: formule.projectvariabelen } : {}),
      });
    },
  },

  {
    name: "calc_evaluate",
    kind: "read",
    description:
      "Compute a piece of calculation text without changing the project, and return the result line by line (headings, text, assignments with expression, result and unit, inputs, choices) plus the governing UC and verdict if the text has them. " +
      "The project data (CC, K_FI, windgebied, …) are available as variables unless useProjectData=false. values sets input fields and choice lists by name.",
    inputSchema: objectSchema(
      {
        source: { type: "string", description: "Calculation text." },
        values: { type: "object", description: "Input values {name: value}.", additionalProperties: tekstOfGetal },
        useProjectData: { type: "boolean", description: "Make the project data available as variables. Default true." },
        maxLines: { type: "integer", minimum: 1, maximum: 5000, description: "At most this many lines. Default 400." },
      },
      ["source"],
    ),
    annotations: LEZEN,
    rest: [{ method: "POST", path: "/evaluate" }],
    handler: (args, ctx) => {
      const source = String(args.source);
      const waarden: Record<string, string> = {};
      if (args.values && typeof args.values === "object") {
        for (const [k, w] of Object.entries(args.values as Record<string, unknown>)) {
          const t = alsTekst(w);
          if (t !== null) waarden[k] = t;
        }
      }
      const scope = args.useProjectData === false ? {} : projectScope(ctx.omgeving.stand().gegevens);
      let d: Doorrekening;
      try {
        d = rekenDoor(source, waarden, scope, "");
      } catch (e) {
        return fout("CALC_ERROR", `The text could not be computed: ${e instanceof Error ? e.message : String(e)}`);
      }
      const max = typeof args.maxLines === "number" ? args.maxLines : 400;
      const { regels: lijst, afgekapt } = regels(d.nodes, max);
      return ok({
        ...resultaatJson(d.resultaat),
        lines: lijst,
        truncated: afgekapt,
        errorLines: lijst.filter((r) => typeof r.error === "string").length,
        ucValues: ucWaarden(d.getallen),
      });
    },
  },
];

/** De bladen als lijst, met `nuRekenen` eerst doorgerekend; gedeeld met project_get. */
export function lijstVan(ctx: McpContext, nuRekenen: boolean): Record<string, unknown>[] {
  const stand = ctx.omgeving.stand();
  ruimUitkomstenOp(stand);
  return stand.exemplaren.map((b) => {
    const module = ctx.omgeving.moduleNaam(b.templateId);
    if (isLosBlad(b)) return bladRegel(b, stand.activeId, module, null);
    if (!nuRekenen) return bladRegel(b, stand.activeId, module, bekendeUitkomst(b, stand.gegevens));
    const uitkomst = rekenBlad(b, stand.gegevens);
    return uitkomst.ok ? bladRegel(b, stand.activeId, module, uitkomst.d.resultaat) : bladRegel(b, stand.activeId, module, null, uitkomst.fout);
  });
}
