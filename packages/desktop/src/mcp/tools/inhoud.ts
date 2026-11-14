/**
 * De inhoud van elk soort blad lezen en een blad laten draaien
 * (docs/OCSS_TW_開發需求規格.md, P2-11).
 *
 * - `sheet_read`: per soort de gegevens zelf: de cellen van een spreadsheet met de
 *   uitkomst van hun formules, de waarden van de nodes van een graaf, de bewaarde
 *   uitvoer van een Jupyter- of Marimo-notebook, de regels van een rekenblad.
 * - `sheet_run`: een notebook in de app laten draaien en de nieuwe uitvoer teruggeven;
 *   een graaf, spreadsheet of rekenblad rekent bij het lezen al door.
 *
 * De leesregels staan in ../bladInhoud.ts.
 */
import type { McpBlad, McpContext, McpToolDef, McpToolResultaat } from "../contracts.ts";
import { graafInhoud, jupyterInhoud, marimoInhoud, werkmapInhoud } from "../bladInhoud.ts";
import { regels } from "../rekenen.ts";
import { LEZEN, WIJZIGEN, bladSoort, bladUit, fout, idOptioneel, idVerplicht, melding, objectSchema, ok, rekenBlad, resultaatJson } from "./hulp.ts";

const STANDAARD_CELLEN = 2000;
const MAX_CELLEN = 20000;
const STANDAARD_TIJD_S = 90;
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
    case "markdown":
      return ok({ ...basis, markdown: blad.md ? { text: blad.md.tekst } : null });
    case "calculation": {
      const uitkomst = rekenBlad(blad, ctx.omgeving.stand().gegevens);
      if (!uitkomst.ok) return fout("CALC_ERROR", uitkomst.fout);
      const { regels: lijst, afgekapt } = regels(uitkomst.d.nodes, 5000, { bron: blad.source });
      return ok({ ...basis, result: resultaatJson(uitkomst.d.resultaat), lines: lijst, truncated: afgekapt });
    }
    default:
      return fout("VALIDATION", `A ${basis.kind} sheet has no content to read here; use sheet_get (full=true for a drawing).`);
  }
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
];
