/**
 * De inhoud van elk soort blad lezen en een blad laten draaien
 * (docs/OCSS_TW_開發需求規格.md, P2-11).
 *
 * - `sheet_read`: per soort de gegevens zelf: de cellen van een spreadsheet met de
 *   uitkomst van hun formules, de waarden van de nodes van een graaf, de bewaarde
 *   uitvoer van een Jupyter- of Marimo-notebook, de regels van een rekenblad.
 * - `sheet_run`: een notebook in de app laten draaien en de nieuwe uitvoer teruggeven;
 *   een graaf, spreadsheet of rekenblad rekent bij het lezen al door.
 * - `sheet_drawing`: een tekenblad als SVG of DXF, met de maten die aan het blad
 *   hangen ingevuld (docs/OCSS_TW_開發需求規格.md, P2-12).
 *
 * De leesregels staan in ../bladInhoud.ts en ../tekenInhoud.ts.
 */
import type { McpBlad, McpContext, McpToolDef, McpToolResultaat } from "../contracts.ts";
import { graafInhoud, jupyterInhoud, marimoInhoud, werkmapInhoud } from "../bladInhoud.ts";
import { koppelUitkomsten, tekenDxf, tekenInhoud, tekenSvg, type TekenInhoud } from "../tekenInhoud.ts";
import { velMaat, type TekenVel } from "../../store/tekenBlad.ts";
import { regels } from "../rekenen.ts";
import { markdownVerwijzingen, rekenTekstVerwijzingen, vulMarkdownIn } from "../../rekenen/tekstInvulling.ts";
import { projectScope } from "../../store/projectGegevens.ts";
import { evalOptiesVan } from "../../store/projectEenheden.ts";
import { rekentaalIncludes, rekentaalImageUrls } from "../../templates/rekentaal-includes.ts";
import { LEZEN, WIJZIGEN, bladSoort, bladUit, fout, idOptioneel, idVerplicht, melding, objectSchema, ok, rekenBlad, resultaatJson } from "./hulp.ts";

const STANDAARD_CELLEN = 2000;
const MAX_CELLEN = 20000;
const STANDAARD_TIJD_S = 90;
/** Ruim boven een gewone tekening, maar niet zo ruim dat één antwoord de client verstopt. */
const MAX_TEKENS = 4000000;
/** Onder de 120 s van de brug, zodat er nog een antwoord terug kan. */
const MAX_TIJD_S = 110;

async function inhoudVan(blad: McpBlad, ctx: McpContext, maxCellen: number): Promise<McpToolResultaat> {
  const basis = { id: blad.id, name: blad.naam, kind: bladSoort(blad) };
  switch (basis.kind) {
    case "spreadsheet": {
      if (!blad.xlsx) return ok({ ...basis, spreadsheet: null });
      try {
        return ok({ ...basis, spreadsheet: await werkmapInhoud(blad.xlsx.data, maxCellen) });
      } catch (e) {
        return fout("NOT_AVAILABLE", `The spreadsheet could not be read: ${melding(e)}`);
      }
    }
    case "graph":
      return ok({ ...basis, graph: blad.graaf ? graafInhoud(blad.graaf) : null });
    case "jupyter": {
      if (!blad.jupyter) return ok({ ...basis, jupyter: null });
      try {
        return ok({ ...basis, jupyter: jupyterInhoud(blad.jupyter.data) });
      } catch (e) {
        return fout("VALIDATION", `The Jupyter workspace of this sheet cannot be read: ${melding(e)}`);
      }
    }
    case "marimo":
      return ok({ ...basis, marimo: blad.marimo ? marimoInhoud(blad.marimo) : null });
    case "markdown": {
      if (!blad.md) return ok({ ...basis, markdown: null });
      // `{#2.R_paal}` erbij: de tekst zoals hij in de app staat, en wat er ingevuld is.
      const stand = ctx.omgeving.stand();
      const lijst = markdownVerwijzingen(blad.md.tekst);
      const omg = {
        bladen: stand.exemplaren.filter((e) => e.ref && e.source.trim()).map((e) => ({ ref: e.ref, source: e.source, waarden: e.waarden })),
        scope: projectScope(stand.gegevens),
        opties: { includes: rekentaalIncludes, imageUrls: rekentaalImageUrls },
        evalOpties: evalOptiesVan(stand.gegevens),
      };
      const waarden = rekenTekstVerwijzingen(lijst, omg);
      const ingevuld = vulMarkdownIn(blad.md.tekst, waarden);
      return ok({
        ...basis,
        markdown: {
          text: blad.md.tekst,
          ...(ingevuld !== blad.md.tekst ? { filled: ingevuld } : {}),
          references: lijst.map((v) => {
            const w = waarden.get(v.plek);
            return {
              placeholder: v.plek,
              ref: v.ref,
              name: v.naam,
              value: w?.tekst ?? null,
              ...(w?.eenheid ? { unit: w.eenheid } : {}),
              ...(w?.fout ? { error: w.fout } : {}),
              // Een waarde uit een ander blad is geen oordeel over dit blad.
              check: "unchecked",
            };
          }),
        },
      });
    }
    case "calculation": {
      const uitkomst = rekenBlad(blad, ctx.omgeving.stand().gegevens);
      if (!uitkomst.ok) return fout("CALC_ERROR", uitkomst.fout);
      const { regels: lijst, afgekapt } = regels(uitkomst.d.nodes, 5000, { bron: blad.source });
      return ok({ ...basis, result: resultaatJson(uitkomst.d.resultaat), lines: lijst, truncated: afgekapt });
    }
    case "drawing": {
      const { inhoud } = tekenVan(blad, ctx);
      return ok({ ...basis, drawing: inhoud });
    }
    default:
      return fout("VALIDATION", `A ${basis.kind} sheet has no content to read here; use sheet_get for the whole sheet.`);
  }
}

/** Het tekenvel van een blad, of een leeg A4 als het vel ontbreekt. */
function velVan(blad: McpBlad): TekenVel {
  return blad.tekenvel ?? { formaat: "A4", ligging: "staand", views: [] };
}

/**
 * De tekening van een blad met de waarden uit het rekenblad erin. De maten en
 * `{{…}}`-teksten van de tekening worden in het blad zelf uitgerekend, net als
 * in de editor (components/tekenen/waarden.ts).
 */
function tekenVan(blad: McpBlad, ctx: McpContext): { inhoud: TekenInhoud; uitkomsten: ReturnType<typeof koppelUitkomsten>; vel: TekenVel } {
  const stand = ctx.omgeving.stand();
  const vel = velVan(blad);
  const scope = projectScope(stand.gegevens);
  const opties = { includes: rekentaalIncludes, imageUrls: rekentaalImageUrls };
  const evalOpties = evalOptiesVan(stand.gegevens);
  return {
    vel,
    uitkomsten: koppelUitkomsten(vel, blad.source, blad.waarden, scope, opties, evalOpties),
    inhoud: tekenInhoud(vel, blad.source, blad.waarden, scope, opties, evalOpties, velMaat(vel)),
  };
}

function maxCellenUit(args: Record<string, unknown>): number {
  return typeof args.maxCells === "number" ? Math.min(MAX_CELLEN, Math.max(1, Math.floor(args.maxCells))) : STANDAARD_CELLEN;
}

export const INHOUDTOOLS: McpToolDef[] = [
  {
    name: "sheet_read",
    kind: "read",
    description:
      "Read the content of any sheet as data. Spreadsheet: every filled cell per worksheet (a1, kind, value, formula, displayed text; formulas give the result the spreadsheet engine computed). " +
      "Graph: the graph is computed and each node gives its output values (text, value or si_value), errors and warnings, plus the table of view nodes. " +
      "Jupyter: each notebook with its cells, source, execution count and stored outputs (stream text, results, errors; images only as their MIME type); cells never run have executionCount null. " +
      "Marimo: each cell's code and stored output as plain text. Calculation sheet: the outcome and the structured lines (as sheet_evaluate with lines=true). " +
      "Stored notebook output is what the notebook showed when it was last run in the app; call sheet_run to run it again first.",
    inputSchema: objectSchema({
      id: idOptioneel,
      maxCells: { type: "integer", minimum: 1, maximum: MAX_CELLEN, description: `Spreadsheet: at most this many filled cells in total. Default ${STANDAARD_CELLEN}.` },
    }),
    annotations: LEZEN,
    rest: [{ method: "GET", path: "/sheets/{id}/content" }],
    handler: async (args, ctx) => {
      const gevonden = bladUit(args, ctx, true);
      if ("fout" in gevonden) return gevonden.fout;
      return inhoudVan(gevonden.blad, ctx, maxCellenUit(args));
    },
  },
  {
    name: "sheet_run",
    kind: "mutate",
    description:
      "Run a sheet and return its new content (the same data as sheet_read). Jupyter: the sheet opens in the app, every code cell of the open notebook runs top to bottom (stopping after an error), and the new output is stored in the project. " +
      "Marimo: the notebook reloads, which runs every cell, and the output is stored once it stops changing. Graph, spreadsheet and calculation sheets compute when read, so this equals sheet_read. " +
      "Notebooks run only in the desktop app, and need its Python environment. completed=false means the run did not finish in time and the output may be stale or partial: do not rely on it.",
    inputSchema: objectSchema(
      {
        id: idVerplicht,
        timeoutSeconds: { type: "integer", minimum: 5, maximum: MAX_TIJD_S, description: `Notebook: wait at most this long. Default ${STANDAARD_TIJD_S}.` },
        maxCells: { type: "integer", minimum: 1, maximum: MAX_CELLEN, description: `Spreadsheet: at most this many filled cells. Default ${STANDAARD_CELLEN}.` },
      },
      ["id"],
    ),
    annotations: WIJZIGEN,
    rest: [{ method: "POST", path: "/sheets/{id}/run" }],
    handler: async (args, ctx) => {
      const gevonden = bladUit(args, ctx, false);
      if ("fout" in gevonden) return gevonden.fout;
      const { blad } = gevonden;
      const soort = bladSoort(blad);
      if (soort !== "jupyter" && soort !== "marimo") {
        const r = await inhoudVan(blad, ctx, maxCellenUit(args));
        return r.ok ? ok({ ...r.data, ran: true, completed: true }) : r;
      }
      const notebooks = ctx.omgeving.notebooks;
      if (!notebooks) return fout("NOT_AVAILABLE", "Running a notebook needs the desktop app.");
      const tijd = (typeof args.timeoutSeconds === "number" ? Math.min(MAX_TIJD_S, Math.max(5, args.timeoutSeconds)) : STANDAARD_TIJD_S) * 1000;
      let ronde: { klaar: boolean; melding?: string };
      try {
        ronde = await notebooks.voerUit(blad.id, tijd);
      } catch (e) {
        return fout("INTERNAL", `Running the notebook failed: ${melding(e)}`);
      }
      // Het venster zette de uitvoer in het project: lees het blad opnieuw.
      const nu = ctx.omgeving.stand().exemplaren.find((e) => e.id === blad.id);
      if (!nu) return fout("NOT_FOUND", "The sheet was removed while it ran.");
      const r = await inhoudVan(nu, ctx, maxCellenUit(args));
      if (!r.ok) return r;
      return ok({ ...r.data, ran: true, completed: ronde.klaar, ...(ronde.melding ? { message: ronde.melding } : {}) });
    },
  },
  {
    name: "sheet_drawing",
    kind: "read",
    description:
      "Export a drawing sheet as SVG or DXF, with the dimensions and {{…}} texts that hang on the calculation sheet filled in (a dimension 'L/2' follows the value of L). " +
      "Coordinates are millimetres in reality; SVG says so in the file (data-eenheid=\"mm\", width/height in mm) and DXF in $INSUNITS (4 = mm, 6 = m; unit sets which). In DXF the y-axis points up, as DXF expects. " +
      "The answer also lists every binding (expression, value, unit, error) and each view with its bounds in mm; bindings the calculation sheet cannot resolve are in unbound. " +
      "Symbols and arcs cannot become plain DXF entities without drawing them wrong: they are counted in skipped and left out of the DXF.",
    inputSchema: objectSchema(
      {
        id: idVerplicht,
        format: { type: "string", enum: ["svg", "dxf"], description: "Default svg." },
        view: { type: "string", minLength: 1, description: "Id or title of one view. Default: every view of the sheet." },
        unit: { type: "string", enum: ["mm", "m"], description: "DXF only: the unit of the coordinates. Default mm." },
      },
      ["id"],
    ),
    annotations: LEZEN,
    rest: [{ method: "GET", path: "/sheets/{id}/drawing" }],
    handler: (args, ctx) => {
      const gevonden = bladUit(args, ctx, true);
      if ("fout" in gevonden) return gevonden.fout;
      const { blad } = gevonden;
      if (bladSoort(blad) !== "drawing") return fout("VALIDATION", `Sheet "${blad.naam}" is not a drawing; sheet_read gives the content of the other kinds.`);
      const { inhoud, uitkomsten, vel } = tekenVan(blad, ctx);
      const format = args.format === "dxf" ? "dxf" : "svg";
      const unit = args.unit === "m" ? "m" : "mm";
      const gevraagd = typeof args.view === "string" && args.view.trim() !== "" ? args.view.trim() : null;
      const views = gevraagd ? vel.views.filter((v) => v.id === gevraagd || v.titel === gevraagd) : vel.views;
      if (gevraagd && views.length === 0) {
        const hebben = vel.views.map((v) => v.id).join(", ") || "none";
        return fout("VALIDATION", `This sheet has no view "${gevraagd}". The views are: ${hebben}.`);
      }
      const tekeningen = views.map((v) => {
        if (format === "dxf") {
          const { dxf, skipped, insunits } = tekenDxf(v, uitkomsten, unit);
          return { view: v.id, title: v.titel, unit, insunits, skipped, content: dxf, characters: dxf.length };
        }
        const { svg, bounds } = tekenSvg(v, uitkomsten);
        return { view: v.id, title: v.titel, bounds, content: svg, characters: svg.length, unit: "mm" };
      });
      const teGroot = tekeningen.find((t) => t.characters > MAX_TEKENS);
      if (teGroot) {
        return fout(
          "VALIDATION",
          `The ${format} of view "${teGroot.view}" is ${teGroot.characters} characters, above the limit of ${MAX_TEKENS}; export one view at a time${format === "dxf" ? " or use SVG" : ""}.`,
          { id: blad.id, format, views: tekeningen.map((t) => ({ view: t.view, characters: t.characters })) },
        );
      }
      return ok({
        id: blad.id,
        name: blad.naam,
        kind: "drawing",
        sheet: inhoud.sheet,
        format,
        ...(format === "dxf" ? { unit, insunits: tekeningen[0]?.insunits ?? (unit === "m" ? 6 : 4) } : {}),
        views: inhoud.views,
        bindings: inhoud.bindings,
        unbound: inhoud.unbound,
        drawings: tekeningen,
      });
    },
  },
];
