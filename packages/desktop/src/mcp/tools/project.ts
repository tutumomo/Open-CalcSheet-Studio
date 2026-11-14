/**
 * Tools voor het project: lezen, nieuw, openen, opslaan, projectgegevens,
 * zichtbaarheid in de projectboom, het rapport en ongedaan maken.
 */
import type { McpContext, McpToolDef } from "../contracts.ts";
import { PROJECT_VELDEN, geldendeWaarde, getalWaarde, type VeldDef } from "../../store/projectGegevens.ts";
import { leesPad } from "../../rapport/pad.ts";
import { LEZEN, NIEUW, WEG, WIJZIGEN, alsTekst, fout, objectSchema, ok, tekstOfGetal, zoekBlad } from "./hulp.ts";
import { lijstVan } from "./bladen.ts";
import { base64Bytes } from "../../store/pdfBijlage.ts";
import { kenmerken } from "../kenmerken.ts";

// ── Projectgegevens ─────────────────────────────────────────────────────────

function veldJson(v: VeldDef, ruw: string): Record<string, unknown> {
  const uit: Record<string, unknown> = { name: v.naam, label: v.label, group: v.groep, type: v.type === "keuze" ? "choice" : v.type === "getal" ? "number" : "text", value: ruw };
  const geldend = geldendeWaarde(v, ruw);
  if (geldend !== ruw) uit.effectiveValue = geldend;
  if (v.opties) uit.options = v.opties.map((o) => ({ value: o.waarde, label: o.label }));
  if (v.hint) uit.hint = v.hint;
  return uit;
}

/** Een keuze herkennen aan waarde, label of het deel van het label vóór " — ". */
function kiesOptie(v: VeldDef, invoer: string): string | null {
  const opties = v.opties ?? [];
  if (opties.some((o) => o.waarde === invoer)) return invoer;
  const klein = invoer.trim().toLowerCase();
  const opLabel = opties.find(
    (o) => o.label.toLowerCase() === klein || o.label.split(" — ")[0].trim().toLowerCase() === klein,
  );
  return opLabel ? opLabel.waarde : null;
}

// ── Bestanden ───────────────────────────────────────────────────────────────

/**
 * Het rapport voor in een antwoord: een kaartbeeld van de situatiepagina heeft daar `bytes`
 * (de grootte van de JPEG) in plaats van de base64-tekst, zoals een PDF-blad. Het opgeslagen
 * rapport blijft ongemoeid.
 */
function zonderBeelden(x: unknown): unknown {
  if (Array.isArray(x)) return x.map(zonderBeelden);
  if (x === null || typeof x !== "object") return x;
  const o = x as Record<string, unknown>;
  if (typeof o.jpeg === "string" && typeof o.id === "string") {
    return { id: o.id, zoom: o.zoom, bytes: base64Bytes(o.jpeg) };
  }
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, zonderBeelden(v)]));
}

/**
 * Een waarde voor het pad `situatie` (of eronder): een kaart met een bekende id maar zonder
 * `jpeg` (zoals report_get hem geeft, met `bytes`) krijgt de JPEG van die id uit de huidige
 * situatie terug. Een kaart zonder bestaande tegenhanger blijft zoals hij is en valt later weg.
 */
function vulBeeldenAan(pad: string, waarde: unknown, huidig: unknown): unknown {
  if (pad !== "situatie" && !pad.startsWith("situatie.")) return waarde;
  const kaarten = (huidig as { situatie?: { kaarten?: { id: string; jpeg: string }[] } } | undefined)?.situatie?.kaarten ?? [];
  const aanvullen = (x: unknown): unknown => {
    if (Array.isArray(x)) return x.map(aanvullen);
    if (x === null || typeof x !== "object") return x;
    const o = x as Record<string, unknown>;
    if (typeof o.id === "string" && typeof o.jpeg !== "string") {
      const bestaand = kaarten.find((k) => k.id === o.id);
      if (bestaand) return { ...o, jpeg: bestaand.jpeg };
    }
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, aanvullen(v)]));
  };
  return aanvullen(waarde);
}

const EXTENSIE = ".ifccalculation";

function metExtensie(pad: string): string {
  return /\.ifccalculation$/i.test(pad) ? pad : `${pad}${EXTENSIE}`;
}

function zonderBureaublad(ctx: McpContext): ReturnType<typeof fout> | null {
  return ctx.omgeving.bestanden.beschikbaar()
    ? null
    : fout("NOT_AVAILABLE", "Files can only be opened and saved in the desktop app.");
}

/** Niet opgeslagen werk gaat niet ongemerkt verloren: zonder force een 409. */
function nietOpgeslagen(ctx: McpContext, force: unknown): ReturnType<typeof fout> | null {
  return ctx.omgeving.stand().dirty && force !== true
    ? fout("CONFLICT", "The open project has unsaved changes. Save it first (project_save), or pass force=true to discard them.")
    : null;
}

/** Een stuk van het rapport op een pad als "belastingen.wind" of "revisies.0". */
function opPad(rapport: unknown, pad: string): { gevonden: boolean; waarde: unknown } {
  let w: unknown = rapport;
  for (const deel of leesPad(pad)) {
    if (w === null || typeof w !== "object" || !(deel in (w as Record<string | number, unknown>))) return { gevonden: false, waarde: undefined };
    w = (w as Record<string | number, unknown>)[deel];
  }
  return { gevonden: true, waarde: w };
}

/** Bestaat de plek waar `pad` moet komen (de ouder)? Een nieuwe lijstregel achteraan mag. */
function ouderBestaat(rapport: unknown, pad: string): boolean {
  const delen = leesPad(pad);
  if (delen.length === 0) return false;
  const ouder = opPad(rapport, delen.slice(0, -1).join("."));
  return ouder.gevonden && ouder.waarde !== null && typeof ouder.waarde === "object";
}

export const PROJECTTOOLS: McpToolDef[] = [
  {
    name: "app_info",
    kind: "read",
    description:
      "Name and version of the app, which edition this build is (tw or upstream) together with the full release tag, commit and build date, the MCP and REST addresses, the OpenAPI document, and whether the API is read-only or paused. " +
      "Use edition and tag to tell the Taiwan build from the upstream build: they share the version number.",
    inputSchema: objectSchema({}),
    annotations: LEZEN,
    rest: [{ method: "GET", path: "/info" }],
    handler: async (_args, ctx) => {
      const basis = `http://127.0.0.1:${ctx.server.poort}`;
      const k = await kenmerken(ctx.server.versie);
      return ok({
        name: ctx.server.naam,
        version: ctx.server.versie,
        // Nieuw (P0-3): editie en volledige tag, zodat tw.4 en tw.5 uit elkaar te
        // houden zijn. `version` blijft het kale versienummer voor bestaande clients.
        edition: k.edition,
        tag: k.tag,
        commit: k.commit,
        buildDate: k.buildDate,
        desktop: ctx.omgeving.bestanden.beschikbaar(),
        mcp: `${basis}/mcp`,
        rest: `${basis}/api/v1`,
        openapi: `${basis}/api/v1/openapi.json`,
        readOnly: ctx.alleenLezen,
        paused: ctx.gepauzeerd,
      });
    },
  },

  {
    name: "project_get",
    kind: "read",
    description:
      "Read the open project: its name, file path, whether it has unsaved changes, the project data (fields that apply to every sheet, such as consequence class CC and wind region, with their options), the sheets (id, name, module, UC and verdict when known), " +
      "which parts are hidden from the project tree, and the undo/redo steps. UC is the governing unity check (UC_max); a sheet passes when UC <= 1.0 and the sheet's own verdict agrees. " +
      "By default UC is only reported for sheets evaluated through this API with their current input; pass evaluate=true to compute every sheet now.",
    inputSchema: objectSchema({
      evaluate: { type: "boolean", description: "Compute every sheet now (a large sheet can take a second or more). Default false." },
    }),
    annotations: LEZEN,
    rest: [{ method: "GET", path: "/project" }],
    handler: (args, ctx) => {
      const sheets = lijstVan(ctx, args.evaluate === true);
      const stand = ctx.omgeving.stand();
      const { project, rapport } = ctx.omgeving.speciaal;
      const actief = zoekBlad(stand, stand.activeId);
      return ok({
        projectName: stand.projectNaam,
        filePath: stand.bestandspad,
        unsaved: stand.dirty,
        activeView: actief ? "sheet" : stand.activeId === rapport ? "report" : stand.activeId === project ? "project-data" : "none",
        activeSheetId: actief ? actief.id : null,
        hidden: { projectData: stand.verborgen.gegevens === true, report: stand.verborgen.rapport === true },
        projectData: PROJECT_VELDEN.map((v) => veldJson(v, stand.gegevens[v.naam] ?? v.standaard)),
        sheets,
        undoSteps: stand.stappenTerug,
        redoSteps: stand.stappenVooruit,
        readOnly: ctx.alleenLezen,
      });
    },
  },

  {
    name: "project_new",
    kind: "mutate",
    description: "Start a new, empty project. Refused with CONFLICT when the open project has unsaved changes, unless force=true (then those changes are lost).",
    inputSchema: objectSchema({ force: { type: "boolean", description: "Discard unsaved changes." } }),
    annotations: { ...WEG, idempotentHint: false },
    rest: [{ method: "POST", path: "/project/new" }],
    handler: (args, ctx) => {
      const conflict = nietOpgeslagen(ctx, args.force);
      if (conflict) return conflict;
      ctx.omgeving.bestanden.nieuwProject();
      return ok({ projectName: ctx.omgeving.stand().projectNaam, sheets: 0 });
    },
  },

  {
    name: "project_open",
    kind: "mutate",
    description:
      "Open a project file (.ifccalculation, or an older .ifc-calculation/.cpd) from a path on this computer, as File > Open does; it is added to the recent files. " +
      "Refused with CONFLICT when the open project has unsaved changes, unless force=true. Desktop app only.",
    inputSchema: objectSchema(
      {
        path: { type: "string", minLength: 1, description: "Absolute path of the project file." },
        force: { type: "boolean", description: "Discard unsaved changes of the open project." },
      },
      ["path"],
    ),
    annotations: { ...WEG, idempotentHint: false },
    rest: [{ method: "POST", path: "/project/open" }],
    handler: async (args, ctx) => {
      const geen = zonderBureaublad(ctx);
      if (geen) return geen;
      const conflict = nietOpgeslagen(ctx, args.force);
      if (conflict) return conflict;
      await ctx.omgeving.bestanden.openProject(String(args.path));
      const stand = ctx.omgeving.stand();
      return ok({ projectName: stand.projectNaam, filePath: stand.bestandspad, sheets: stand.exemplaren.length });
    },
  },

  {
    name: "project_save",
    kind: "file",
    description:
      "Save the project over its own file, as File > Save does. When the project has no file yet (or was opened from an older format), pass path, or use project_save_as. Desktop app only.",
    inputSchema: objectSchema({ path: { type: "string", minLength: 1, description: "Save to this path instead (as project_save_as)." } }),
    annotations: WIJZIGEN,
    rest: [{ method: "POST", path: "/project/save" }],
    handler: async (args, ctx) => {
      const geen = zonderBureaublad(ctx);
      if (geen) return geen;
      const eigen = ctx.omgeving.stand().bestandspad;
      const pad = typeof args.path === "string" ? metExtensie(args.path) : eigen && /\.ifccalculation$/i.test(eigen) ? eigen : null;
      if (!pad) {
        return fout("VALIDATION", eigen
          ? `The project was opened from ${eigen}, an older format that is not overwritten silently. Pass a path (project_save_as).`
          : "The project has no file yet. Pass a path (project_save_as).");
      }
      await ctx.omgeving.bestanden.bewaarProject(pad);
      return ok({ filePath: pad, unsaved: ctx.omgeving.stand().dirty });
    },
  },

  {
    name: "project_save_as",
    kind: "file",
    description: "Save the project to a new path, as File > Save as does (.ifccalculation is added when missing). The project then continues in that file. Desktop app only.",
    inputSchema: objectSchema({ path: { type: "string", minLength: 1, description: "Absolute path of the new file." } }, ["path"]),
    annotations: WIJZIGEN,
    rest: [{ method: "POST", path: "/project/save-as" }],
    handler: async (args, ctx) => {
      const geen = zonderBureaublad(ctx);
      if (geen) return geen;
      const pad = metExtensie(String(args.path));
      await ctx.omgeving.bestanden.bewaarProject(pad);
      return ok({ filePath: pad, unsaved: ctx.omgeving.stand().dirty });
    },
  },

  {
    name: "recent_files",
    kind: "read",
    description: "The recently opened and saved project files (File > Recent).",
    inputSchema: objectSchema({}),
    annotations: LEZEN,
    rest: [{ method: "GET", path: "/project/recent" }],
    handler: async (_args, ctx) => ok({ files: await ctx.omgeving.bestanden.recent() }),
  },

  {
    name: "project_set_name",
    kind: "mutate",
    description: "Set the project name (the name of the project file and the heading of the printout). The project data field project_naam is separate (project_set_data).",
    inputSchema: objectSchema({ name: { type: "string", minLength: 1, description: "New project name." } }, ["name"]),
    annotations: WIJZIGEN,
    rest: [{ method: "PUT", path: "/project/name" }],
    handler: (args, ctx) => {
      const vorige = ctx.omgeving.stand().projectNaam;
      ctx.omgeving.acties.zetProjectNaam(String(args.name).trim());
      return ok({ projectName: ctx.omgeving.stand().projectNaam, previous: vorige });
    },
  },

  {
    name: "project_set_data",
    kind: "mutate",
    description:
      "Set project data fields (see projectData in project_get). Project data applies to every sheet, e.g. tw_klasse (Taiwan building use category 1-4), tw_terrein (terrain A/B/C = 1/2/3), tw_V10, tw_SDS, tw_SD1, project_nummer; and for the Eurocode sheets CC (consequence class), windgebied (wind region), terreincategorie (terrain category), DesignLife. " +
      "Pass name and value, or values {name: value} for several. For a choice field pass one of its option values (a label or the part of the label before ' — ' is also accepted). Only existing fields can be set; nothing is written if one value is invalid.",
    inputSchema: objectSchema({
      name: { type: "string", enum: PROJECT_VELDEN.map((v) => v.naam), description: "Field name." },
      value: { ...tekstOfGetal, description: "New value." },
      values: { type: "object", description: "Several fields at once: {name: value}.", additionalProperties: tekstOfGetal },
    }),
    annotations: WIJZIGEN,
    rest: [
      { method: "PATCH", path: "/project/data" },
      { method: "PATCH", path: "/project/gegevens" },
    ],
    handler: (args, ctx) => {
      const gevraagd: [string, unknown][] = [];
      if (typeof args.name === "string") {
        if (args.value === undefined) return fout("VALIDATION", "Pass value together with name.");
        gevraagd.push([args.name, args.value]);
      } else if (args.value !== undefined) {
        return fout("VALIDATION", "Pass name together with value.");
      }
      if (args.values && typeof args.values === "object") gevraagd.push(...Object.entries(args.values as Record<string, unknown>));
      if (gevraagd.length === 0) return fout("VALIDATION", "Pass name and value, or values.");
      const zetten: [string, string][] = [];
      for (const [naam, ruw] of gevraagd) {
        const veld = PROJECT_VELDEN.find((v) => v.naam === naam);
        if (!veld) return fout("VALIDATION", `Unknown project data field "${naam}".`, { fields: PROJECT_VELDEN.map((v) => v.naam) });
        const invoer = alsTekst(ruw);
        if (invoer === null) return fout("VALIDATION", `Value of ${naam} must be a string or a number.`);
        let waarde = invoer;
        if (veld.type === "keuze") {
          const gekozen = kiesOptie(veld, invoer);
          if (gekozen === null) {
            return fout("VALIDATION", `"${invoer}" is not an option of ${veld.naam}.`, {
              options: (veld.opties ?? []).map((o) => ({ value: o.waarde, label: o.label })),
            });
          }
          waarde = gekozen;
        } else if (veld.type === "getal") {
          const n = getalWaarde(invoer);
          if (n === undefined) return fout("VALIDATION", `"${invoer}" is not a number (field ${veld.naam}).`);
          waarde = String(n);
        }
        zetten.push([veld.naam, waarde]);
      }
      const voor = ctx.omgeving.stand().gegevens;
      const vorige = Object.fromEntries(zetten.map(([n]) => [n, voor[n] ?? PROJECT_VELDEN.find((v) => v.naam === n)!.standaard]));
      for (const [naam, waarde] of zetten) ctx.omgeving.acties.zetGegeven(naam, waarde);
      // Eén veld: dezelfde vorm als voorheen (name, value, previous).
      if (zetten.length === 1 && typeof args.name === "string" && !args.values) {
        return ok({ name: zetten[0][0], value: zetten[0][1], previous: vorige[zetten[0][0]] });
      }
      return ok({ set: Object.fromEntries(zetten), previous: vorige });
    },
  },

  {
    name: "project_set_visibility",
    kind: "mutate",
    description:
      "Hide or show the project data form or the report in the project tree (as removing/adding them in the app does). Hiding keeps their content; showing brings it back.",
    inputSchema: objectSchema(
      {
        part: { type: "string", enum: ["projectData", "report"], description: "Which part." },
        visible: { type: "boolean", description: "true = show in the project tree, false = hide." },
      },
      ["part", "visible"],
    ),
    annotations: WIJZIGEN,
    rest: [{ method: "PUT", path: "/project/visibility" }],
    handler: (args, ctx) => {
      const onderdeel = args.part === "projectData" ? "gegevens" : "rapport";
      ctx.omgeving.acties.zetVerborgen(onderdeel, args.visible !== true);
      const v = ctx.omgeving.stand().verborgen;
      return ok({ hidden: { projectData: v.gegevens === true, report: v.rapport === true } });
    },
  },

  {
    name: "report_get",
    kind: "read",
    description:
      "Read the structural report (cover, language, revisions, chapters, assumptions, loads, layout) or one part of it by path, e.g. 'taal', 'belastingen.wind', 'revisies' or 'revisies.0.omschrijving' (numbers are list indexes).",
    inputSchema: objectSchema({ path: { type: "string", description: "Dot path into the report. Default: the whole report." } }),
    annotations: LEZEN,
    rest: [{ method: "GET", path: "/report" }],
    handler: (args, ctx) => {
      const rapport = ctx.omgeving.stand().rapport;
      const pad = typeof args.path === "string" ? args.path.trim() : "";
      if (!pad) return ok({ report: zonderBeelden(rapport) });
      const gevonden = opPad(rapport, pad);
      if (!gevonden.gevonden) return fout("NOT_FOUND", `The report has nothing at "${pad}".`);
      return ok({ path: pad, value: zonderBeelden(gevonden.waarde) });
    },
  },

  {
    name: "report_set",
    kind: "mutate",
    description:
      "Set report fields by dot path (see report_get), e.g. {path: 'belastingen.wind.gebouwhoogte', value: '12'}. Text and checkbox fields take a string or boolean. Setting 'taal' ('en', 'nl') switches the report language: built-in texts switch along, text typed by the user stays. " +
      "A list or object value replaces that part (e.g. append a revision with path 'revisies.2'); the app then completes it to a valid report. Pass values {path: value} for several. The parent of each path must exist.",
    inputSchema: objectSchema({
      path: { type: "string", minLength: 1, description: "Dot path into the report." },
      value: { description: "New value: string, boolean, number, list or object." },
      values: { type: "object", description: "Several fields at once: {path: value}." },
    }),
    annotations: WIJZIGEN,
    rest: [{ method: "PATCH", path: "/report" }],
    handler: (args, ctx) => {
      const gevraagd: [string, unknown][] = [];
      if (typeof args.path === "string") {
        if (!("value" in args)) return fout("VALIDATION", "Pass value together with path.");
        gevraagd.push([args.path, args.value]);
      }
      if (args.values && typeof args.values === "object") gevraagd.push(...Object.entries(args.values as Record<string, unknown>));
      if (gevraagd.length === 0) return fout("VALIDATION", "Pass path and value, or values.");
      const rapport = ctx.omgeving.stand().rapport;
      for (const [pad] of gevraagd) {
        if (!ouderBestaat(rapport, pad)) return fout("NOT_FOUND", `The report has no place for "${pad}" (its parent does not exist).`);
      }
      for (const [pad, waarde] of gevraagd) {
        if (typeof waarde === "string" || typeof waarde === "boolean") ctx.omgeving.acties.zetRapportVeld(pad, waarde);
        else if (typeof waarde === "number") ctx.omgeving.acties.zetRapportVeld(pad, String(waarde));
        else ctx.omgeving.acties.zetRapportDeel(pad, vulBeeldenAan(pad, waarde, ctx.omgeving.stand().rapport));
      }
      const na = ctx.omgeving.stand().rapport;
      return ok({ set: Object.fromEntries(gevraagd.map(([pad]) => [pad, zonderBeelden(opPad(na, pad).waarde)])) });
    },
  },

  {
    name: "undo",
    kind: "mutate",
    description: "Undo the last change to the project (as Ctrl+Z in the app), whoever made it.",
    inputSchema: objectSchema({}),
    annotations: NIEUW,
    rest: [{ method: "POST", path: "/undo" }],
    handler: (_args, ctx) => {
      const voor = ctx.omgeving.stand().stappenTerug;
      if (voor === 0) return ok({ undone: false, undoSteps: 0, redoSteps: ctx.omgeving.stand().stappenVooruit });
      ctx.omgeving.acties.ongedaan();
      const na = ctx.omgeving.stand();
      return ok({ undone: true, undoSteps: na.stappenTerug, redoSteps: na.stappenVooruit });
    },
  },

  {
    name: "redo",
    kind: "mutate",
    description: "Redo the last undone change (as Ctrl+Y in the app).",
    inputSchema: objectSchema({}),
    annotations: NIEUW,
    rest: [{ method: "POST", path: "/redo" }],
    handler: (_args, ctx) => {
      const voor = ctx.omgeving.stand().stappenVooruit;
      if (voor === 0) return ok({ redone: false, undoSteps: ctx.omgeving.stand().stappenTerug, redoSteps: 0 });
      ctx.omgeving.acties.opnieuw();
      const na = ctx.omgeving.stand();
      return ok({ redone: true, undoSteps: na.stappenTerug, redoSteps: na.stappenVooruit });
    },
  },
];
