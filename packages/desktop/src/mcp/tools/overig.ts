/**
 * Tools voor alles rond het project: de online modulebibliotheek, de
 * formulebibliotheek, IFC/IFCX en PDF exporteren, afdrukken, de weergave en de
 * instellingen van de app.
 */
import { bouwProjectStep } from "@ifc-calc/core";
import type { McpContext, McpEenheden, McpInstellingen, McpToolDef, McpWeergave } from "../contracts.ts";
import { isLosBlad } from "../../store/spreadsheetBlad.ts";
import { PROJECT_FORMAAT_VERSIE } from "../../store/projectBestand.ts";
import { projectIfcx } from "../../store/projectIfcx.ts";
import { FORMULE_GROEPEN, type Formule } from "../../components/ribbon/formules.ts";
import { alleFormules } from "../../store/library.ts";
import { LEZEN, NIEUW, WEG, WIJZIGEN, fout, melding, objectSchema, ok, zoekBlad } from "./hulp.ts";

/**
 * Versies als jaar.week.nummer vergelijken: negatief als a ouder is dan b.
 * Dezelfde regel als in store/moduleBibliotheek.ts; daar staat hij in een
 * bestand met stores, dat Node niet laadt.
 */
function vergelijkVersie(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

// ── Formules ────────────────────────────────────────────────────────────────

function formuleJson(f: Formule, metCode: boolean): Record<string, unknown> {
  return {
    id: f.id,
    group: f.groep,
    name: f.naam.en,
    nameNl: f.naam.nl,
    ...(f.bron ? { source: f.bron } : {}),
    ...(f.uitleg ? { explanation: f.uitleg.en, explanationNl: f.uitleg.nl } : {}),
    ...(f.projectvariabelen?.length ? { usesProjectData: f.projectvariabelen } : {}),
    ...(f.library ? { library: f.library } : {}),
    ...(metCode ? { code: f.code } : {}),
    ...(metCode && f.codeEn ? { codeEn: f.codeEn } : {}),
  };
}

// ── IFC ─────────────────────────────────────────────────────────────────────

/**
 * De IFCX of de STEP van het hele project, of van één blad: hetzelfde document
 * als het projectbestand, met alle bladen. De STEP volgt uit dat document, dus
 * de twee vertellen hetzelfde. Met een id staat alleen dat blad erin, zonder het
 * rapport.
 */
function maakIfc(ctx: McpContext, formaat: "ifc" | "ifcx", id: string | null): { inhoud: string; naam: string } {
  const stand = ctx.omgeving.stand();
  const naam = stand.projectNaam || "Berekening";
  const basis = { versie: PROJECT_FORMAAT_VERSIE, naam, gegevens: stand.gegevens };
  let doc;
  if (id !== null) {
    const blad = zoekBlad(stand, id);
    if (!blad) throw Object.assign(new Error(`No sheet with id "${id}".`), { code: "NOT_FOUND" });
    doc = projectIfcx({ ...basis, exemplaren: [blad] });
    return { inhoud: formaat === "ifc" ? bouwProjectStep(doc) : JSON.stringify(doc, null, 2), naam: blad.naam };
  }
  doc = projectIfcx({ ...basis, exemplaren: stand.exemplaren, rapport: stand.rapport, verborgen: stand.verborgen });
  return { inhoud: formaat === "ifc" ? bouwProjectStep(doc) : JSON.stringify(doc, null, 2), naam };
}

function ifcFout(e: unknown) {
  const code = (e as { code?: string }).code;
  return fout(code === "NOT_FOUND" ? "NOT_FOUND" : code === "VALIDATION" ? "VALIDATION" : "CALC_ERROR", melding(e));
}

// ── Instellingen ────────────────────────────────────────────────────────────

/** De keuzes van Instellingen (components/settings/SettingsDialog.tsx, i18n/config.ts). */
const THEMAS = ["light", "dark", "blueprint", "high-contrast-dark", "high-contrast-light"];
const TALEN = ["auto", "en", "nl"];
const TEKSTGROOTTES = ["compact", "standard", "large"];
const EENHEDEN_SCHEMA = objectSchema({
  angleMode: { type: "string", enum: ["deg", "rad", "gra"] },
  defaultLength: { type: "string", enum: ["mm", "cm", "m"] },
  defaultForce: { type: "string", enum: ["N", "kN", "MN"] },
  defaultStress: { type: "string", enum: ["Pa", "kPa", "MPa", "GPa", "N/mm^2"] },
  returnAngleUnits: { type: "boolean" },
  stelsel: {
    type: "string",
    enum: ["blad", "si-mm", "si-m", "us", "tw-mks", "eigen"],
    description: "Unit system for new projects: 'blad' (as written in the sheet), 'si-mm', 'si-m', 'us' (US customary), 'tw-mks' (Taiwan MKS) or 'eigen' (per quantity). The open project's own system is the project data field 'eenheden'.",
  },
});

const WEERGAVEN: McpWeergave[] = ["code-visual", "code-output", "visual-output", "print-preview", "ifc"];

export const OVERIGE_TOOLS: McpToolDef[] = [
  {
    name: "library_list",
    kind: "read",
    description:
      "The online module library (the public module repository of the OpenAEC Foundation): every module with id, version, name, category, status and norms, and whether it is installed (and an update is available). " +
      "refresh=true fetches the catalog again. Needs internet.",
    inputSchema: objectSchema({ refresh: { type: "boolean", description: "Fetch the catalog again. Default: only the first time." } }),
    annotations: { ...LEZEN, openWorldHint: true },
    rest: [{ method: "GET", path: "/library" }],
    handler: async (args, ctx) => {
      const { modules, fout: f } = await ctx.omgeving.bibliotheek.catalogus(args.refresh === true);
      const geinstalleerd = ctx.omgeving.bibliotheek.geinstalleerd();
      if (f && modules.length === 0) return fout("NOT_AVAILABLE", `The module library could not be reached: ${f}`, { installed: Object.keys(geinstalleerd) });
      return ok({
        modules: modules.map((m) => {
          const hier = geinstalleerd[m.id];
          return {
            ...m,
            installed: hier !== undefined,
            ...(hier ? { installedVersion: hier.versie, updateAvailable: vergelijkVersie(hier.versie, m.versie) < 0 } : {}),
          };
        }),
        installed: Object.values(geinstalleerd).map((m) => ({ id: m.id, versie: m.versie, naam: m.naam })),
        ...(f ? { warning: f } : {}),
      });
    },
  },

  {
    name: "library_install",
    kind: "mutate",
    description:
      "Install (or update) a module from the online module library by id (see library_list). It then appears in modules_list and can be added with sheet_add; existing sheets keep their own copy of the text. Needs internet.",
    inputSchema: objectSchema({ id: { type: "string", minLength: 1, description: "Module id from library_list." } }, ["id"]),
    annotations: { ...NIEUW, openWorldHint: true },
    rest: [{ method: "POST", path: "/library/{id}/install" }],
    handler: async (args, ctx) => {
      const id = String(args.id);
      const { modules, fout: f } = await ctx.omgeving.bibliotheek.catalogus(false);
      if (!modules.some((m) => m.id === id)) {
        return f && modules.length === 0
          ? fout("NOT_AVAILABLE", `The module library could not be reached: ${f}`)
          : fout("NOT_FOUND", `The module library has no module "${id}".`, { modules: modules.map((m) => m.id) });
      }
      const mislukt = await ctx.omgeving.bibliotheek.installeer(id);
      if (mislukt) return fout("NOT_AVAILABLE", `Installing "${id}" failed: ${mislukt}`);
      const m = ctx.omgeving.bibliotheek.geinstalleerd()[id];
      return ok({ installed: id, version: m?.versie ?? null, templateId: id });
    },
  },

  {
    name: "library_remove",
    kind: "mutate",
    description: "Remove a module installed from the online module library. A built-in module with the same id comes back; sheets already in the project keep their text.",
    inputSchema: objectSchema({ id: { type: "string", minLength: 1, description: "Module id." } }, ["id"]),
    annotations: WEG,
    rest: [{ method: "DELETE", path: "/library/{id}" }],
    handler: (args, ctx) => {
      const id = String(args.id);
      if (!(id in ctx.omgeving.bibliotheek.geinstalleerd())) return fout("NOT_FOUND", `Module "${id}" is not installed from the library.`);
      ctx.omgeving.bibliotheek.verwijder(id);
      return ok({ removed: id });
    },
  },

  {
    name: "formulas_list",
    kind: "read",
    description:
      "Search the formula library: standard formulas from mechanics and the Eurocodes (EN 1990, 1991, 1992, 1993, 1995) as ready-to-run calculation text. " +
      "query searches names, explanations, sources and code; group limits to one group. includeCode=true adds the calculation text. Insert one with sheet_insert_formula. " +
      "Formulas with library are the worked examples of the app's Library panel; these and the beams and sections, whose drawing follows the input, have their text lines in Dutch in code and in English in codeEn.",
    inputSchema: objectSchema({
      query: { type: "string", description: "Search text." },
      group: { type: "string", enum: FORMULE_GROEPEN.map((g) => g.id), description: "Group id." },
      includeCode: { type: "boolean", description: "Include the calculation text. Default false." },
    }),
    annotations: LEZEN,
    rest: [{ method: "GET", path: "/formulas" }],
    handler: (args) => {
      const z = typeof args.query === "string" ? args.query.trim().toLowerCase() : "";
      const lijst = alleFormules().filter((f) => (args.group === undefined || f.groep === args.group) && (!z ||
        [f.naam.nl, f.naam.en, f.uitleg?.nl ?? "", f.uitleg?.en ?? "", f.bron ?? "", f.code, f.codeEn ?? ""].some((x) => x.toLowerCase().includes(z))));
      return ok({
        groups: FORMULE_GROEPEN.map((g) => ({ id: g.id, name: g.naam.en, nameNl: g.naam.nl })),
        count: lijst.length,
        formulas: lijst.map((f) => formuleJson(f, args.includeCode === true)),
      });
    },
  },

  {
    name: "formula_get",
    kind: "read",
    description: "One formula from the formula library, with its calculation text.",
    inputSchema: objectSchema({ id: { type: "string", minLength: 1, description: "Formula id." } }, ["id"]),
    annotations: LEZEN,
    rest: [{ method: "GET", path: "/formulas/{id}" }],
    handler: (args) => {
      const f = alleFormules().find((x) => x.id === args.id);
      return f ? ok(formuleJson(f, true)) : fout("NOT_FOUND", `Unknown formula "${String(args.id)}".`);
    },
  },

  {
    name: "ifc_get",
    kind: "read",
    description:
      "The IFC of the whole project or one sheet, as text: format 'ifcx' (IFCX JSON, the same document as the project file: every sheet with its text, input and results, and the report) or 'ifc' (IFC4X3 STEP with the same content: every sheet as a document and property sets). " +
      "Without id the whole project. To write it to a file, use export_ifc.",
    inputSchema: objectSchema(
      {
        format: { type: "string", enum: ["ifc", "ifcx"], description: "ifc = STEP, ifcx = JSON." },
        id: { type: "string", minLength: 1, description: "Sheet id. Default: the whole project." },
      },
      ["format"],
    ),
    annotations: LEZEN,
    rest: [{ method: "GET", path: "/export/ifc" }],
    handler: (args, ctx) => {
      try {
        const { inhoud } = maakIfc(ctx, args.format === "ifc" ? "ifc" : "ifcx", typeof args.id === "string" ? args.id : null);
        return ok({ format: args.format, content: inhoud });
      } catch (e) {
        return ifcFout(e);
      }
    },
  },

  {
    name: "export_ifc",
    kind: "file",
    description: "Write the IFCX (.ifcx, the same document as the project file) or IFC (STEP, .ifc) of the whole project or one sheet to a file. Desktop app only.",
    inputSchema: objectSchema(
      {
        format: { type: "string", enum: ["ifc", "ifcx"], description: "ifc = STEP, ifcx = JSON." },
        path: { type: "string", minLength: 1, description: "Absolute path of the file to write." },
        id: { type: "string", minLength: 1, description: "Sheet id. Default: the whole project." },
      },
      ["format", "path"],
    ),
    annotations: WIJZIGEN,
    rest: [{ method: "POST", path: "/export/ifc" }],
    handler: async (args, ctx) => {
      if (!ctx.omgeving.bestanden.beschikbaar()) return fout("NOT_AVAILABLE", "Writing files only works in the desktop app; use ifc_get for the content.");
      let inhoud: string;
      try {
        inhoud = maakIfc(ctx, args.format === "ifc" ? "ifc" : "ifcx", typeof args.id === "string" ? args.id : null).inhoud;
      } catch (e) {
        return ifcFout(e);
      }
      await ctx.omgeving.bestanden.schrijfTekst(String(args.path), inhoud);
      return ok({ format: args.format, path: args.path, characters: inhoud.length });
    },
  },

  {
    name: "export_pdf",
    kind: "file",
    description:
      "Write calculation sheets to a PDF file through the report engine (a cover page plus the sheets; without drawings). Only available in an app build that includes the report engine; otherwise NOT_AVAILABLE. " +
      "The full structural report with drawings is printed through the app's print dialog: use print and choose a PDF printer there.",
    inputSchema: objectSchema(
      {
        path: { type: "string", minLength: 1, description: "Absolute path of the PDF (.pdf is added when missing)." },
        ids: { type: "array", items: { type: "string" }, description: "Sheet ids. Default: every calculation sheet." },
      },
      ["path"],
    ),
    annotations: WIJZIGEN,
    rest: [{ method: "POST", path: "/export/pdf" }],
    handler: async (args, ctx) => {
      if (!ctx.omgeving.bestanden.beschikbaar()) return fout("NOT_AVAILABLE", "PDF export only works in the desktop app.");
      const stand = ctx.omgeving.stand();
      const ids = Array.isArray(args.ids) ? args.ids.map(String) : stand.exemplaren.filter((b) => !isLosBlad(b)).map((b) => b.id);
      for (const id of ids) {
        const blad = zoekBlad(stand, id);
        if (!blad) return fout("NOT_FOUND", `No sheet with id "${id}".`);
        if (isLosBlad(blad)) return fout("VALIDATION", `Sheet "${blad.naam}" is not a calculation sheet; the report engine only takes calculation sheets.`);
      }
      if (ids.length === 0) return fout("VALIDATION", "The project has no calculation sheets.");
      const pad = /\.pdf$/i.test(String(args.path)) ? String(args.path) : `${String(args.path)}.pdf`;
      const bytes = await ctx.omgeving.afdruk.pdfViaEngine(ids, pad);
      return ok({ path: pad, bytes, sheets: ids.length });
    },
  },

  {
    name: "print",
    kind: "ui",
    description:
      "Print from the app, as the Print buttons do: what='report' for the structural report (cover, chapters, sheets in appendix A), what='sheets' for calculation sheets (ids, default all). " +
      "The system print dialog opens in the app; the user picks the printer there, or a PDF printer to save a PDF. The app waits until the dialog is closed.",
    inputSchema: objectSchema(
      {
        what: { type: "string", enum: ["report", "sheets"], description: "The structural report or calculation sheets." },
        ids: { type: "array", items: { type: "string" }, description: "Only for sheets: these sheet ids. Default: all." },
      },
      ["what"],
    ),
    annotations: { ...LEZEN, readOnlyHint: false, idempotentHint: false },
    rest: [{ method: "POST", path: "/print" }],
    handler: (args, ctx) => {
      const stand = ctx.omgeving.stand();
      if (args.what === "report") {
        if (Array.isArray(args.ids)) return fout("VALIDATION", "ids only applies to what='sheets'.");
        ctx.omgeving.afdruk.start("rapport", null);
        return ok({ printing: "report", dialog: true });
      }
      const ids = Array.isArray(args.ids) ? args.ids.map(String) : null;
      for (const id of ids ?? []) if (!zoekBlad(stand, id)) return fout("NOT_FOUND", `No sheet with id "${id}".`);
      if ((ids ?? stand.exemplaren).length === 0) return fout("VALIDATION", "The project has no sheets to print.");
      ctx.omgeving.afdruk.start("bladen", ids);
      return ok({ printing: "sheets", ids: ids ?? stand.exemplaren.map((b) => b.id), dialog: true });
    },
  },

  {
    name: "view_get",
    kind: "read",
    description: "The view of the open sheet in the app: code-visual, code-output, visual-output, print-preview or ifc.",
    inputSchema: objectSchema({}),
    annotations: LEZEN,
    rest: [{ method: "GET", path: "/view" }],
    handler: (_args, ctx) => {
      const nu = ctx.omgeving.weergave.huidige();
      if (!nu) return fout("NOT_AVAILABLE", "The app window is not ready.");
      return ok({ view: nu.weergave, preview: nu.voorbeeld });
    },
  },

  {
    name: "view_set",
    kind: "ui",
    description:
      "Choose the view of the open sheet in the app: 'code-visual' (code and drawing), 'code-output' (code and worked-out calculation), 'visual-output' (drawing and calculation), " +
      "'print-preview' (the printout of the open sheet, or of the report when the report is open), or 'ifc' (the IFC of the whole project). A sheet without a drawing shows code and calculation.",
    inputSchema: objectSchema({ view: { type: "string", enum: WEERGAVEN, description: "The view." } }, ["view"]),
    annotations: { ...LEZEN, readOnlyHint: false },
    rest: [{ method: "PUT", path: "/view" }],
    handler: (args, ctx) => {
      const probleem = ctx.omgeving.weergave.kies(args.view as McpWeergave);
      if (probleem) return fout("NOT_AVAILABLE", probleem);
      return ok({ view: args.view });
    },
  },

  {
    name: "settings_get",
    kind: "read",
    description: "The app settings: theme, language, text size and units (angle mode, default display units).",
    inputSchema: objectSchema({}),
    annotations: LEZEN,
    rest: [{ method: "GET", path: "/settings" }],
    handler: async (_args, ctx) => {
      const s = await ctx.omgeving.instellingen.lees();
      return ok({ ...s, options: { theme: THEMAS, language: TALEN, textSize: TEKSTGROOTTES } });
    },
  },

  {
    name: "settings_set",
    kind: "mutate",
    description:
      "Change app settings, as Settings does: theme, language ('auto' follows the system), textSize, and units (any subset of angleMode, defaultLength, defaultForce, defaultStress, returnAngleUnits, stelsel). " +
      "Takes effect immediately and is saved.",
    inputSchema: objectSchema({
      theme: { type: "string", enum: THEMAS },
      language: { type: "string", enum: TALEN },
      textSize: { type: "string", enum: TEKSTGROOTTES },
      units: EENHEDEN_SCHEMA,
    }),
    annotations: WIJZIGEN,
    rest: [{ method: "PATCH", path: "/settings" }],
    handler: async (args, ctx) => {
      if (Object.keys(args).length === 0) return fout("VALIDATION", "Pass at least one setting.");
      const wijziging: Partial<McpInstellingen> = {};
      if (typeof args.theme === "string") wijziging.theme = args.theme;
      if (typeof args.language === "string") wijziging.language = args.language;
      if (typeof args.textSize === "string") wijziging.textSize = args.textSize;
      if (args.units && typeof args.units === "object") {
        const huidig = (await ctx.omgeving.instellingen.lees()).units;
        wijziging.units = { ...huidig, ...(args.units as Partial<McpEenheden>) };
      }
      return ok({ ...(await ctx.omgeving.instellingen.zet(wijziging)) });
    },
  },
];
