/**
 * De REST-API onder /api/v1, op dezelfde brug als MCP.
 *
 * Rust geeft een REST-request door met methode, pad (met query) en body; hier
 * wordt de route gekozen en de tool uitgevoerd via voerToolUit — dezelfde weg
 * als MCP. De routes komen uit de registry (de `rest`-routes van elke tool),
 * dus REST en MCP kunnen niet uit elkaar lopen.
 *
 * Argumenten: de padparameters (`{id}`), de query (bij GET en DELETE; tekst
 * wordt omgezet naar het type uit het schema van de tool) en de JSON-body (bij
 * POST, PUT en PATCH) samen; een padparameter wint.
 *
 * Statussen: succes 200 (201 bij iets nieuws); VALIDATION 400, NOT_FOUND 404,
 * CONFLICT 409, CALC_ERROR 422, READ_ONLY 423, INTERNAL 500, NOT_AVAILABLE 501,
 * PAUSED 503. 401 (token) en 403 (Origin) geeft Rust zelf. Een fout heeft altijd
 * de vorm `{"error": {"code", "message", "data"?}}`.
 *
 * Vaste routes naast de tools: GET /api/v1 (overzicht), GET /api/v1/tools,
 * POST /api/v1/tools/{naam}, GET /api/v1/openapi.json.
 */
import type { HttpMethode, JsonSchema, McpContext, McpFoutCode, McpRestRoute, McpToolDef, McpToolResultaat } from "./contracts.ts";
import { voerToolUit } from "./uitvoeren.ts";
import { bouwOpenApi } from "./openapi.ts";

export const REST_BASIS = "/api/v1";

export interface RestAntwoord {
  status: number;
  body: string;
}

export interface RestDeps {
  tools: McpToolDef[];
  context: () => McpContext;
}

export const FOUT_STATUS: Record<McpFoutCode, number> = {
  VALIDATION: 400,
  NOT_FOUND: 404,
  CONFLICT: 409,
  CALC_ERROR: 422,
  UNIT_WARNING: 422,
  READ_ONLY: 423,
  INTERNAL: 500,
  NOT_AVAILABLE: 501,
  PAUSED: 503,
};

const json = (status: number, data: unknown): RestAntwoord => ({ status, body: JSON.stringify(data) });
const foutAntwoord = (status: number, code: string, message: string, data?: unknown): RestAntwoord =>
  json(status, { error: { code, message, ...(data !== undefined ? { data } : {}) } });

function vanResultaat(r: McpToolResultaat, succes: number): RestAntwoord {
  if (r.ok) return json(succes, r.data);
  return foutAntwoord(FOUT_STATUS[r.code] ?? 500, r.code, r.error, r.data);
}

// ── Routes ─────────────────────────────────────────────────────────────────

interface Route {
  tool: McpToolDef;
  route: McpRestRoute;
  delen: string[];
}

function splits(pad: string): string[] {
  return pad.split("/").filter((d) => d !== "");
}

/** Alle tool-routes; vaste delen gaan vóór parameters (`/sheets/pdf` vóór `/sheets/{id}`). */
export function routesVan(tools: McpToolDef[]): Route[] {
  const lijst: Route[] = [];
  for (const tool of tools) for (const route of tool.rest ?? []) lijst.push({ tool, route, delen: splits(route.path) });
  const gewicht = (r: Route) => r.delen.map((d) => (d.startsWith("{") ? "1" : "0")).join("");
  return lijst.sort((a, b) => a.delen.length - b.delen.length || gewicht(a).localeCompare(gewicht(b)));
}

function past(delen: string[], pad: string[]): Record<string, string> | null {
  if (delen.length !== pad.length) return null;
  const param: Record<string, string> = {};
  for (let i = 0; i < delen.length; i++) {
    const d = delen[i];
    if (d.startsWith("{") && d.endsWith("}")) {
      let w: string;
      try {
        w = decodeURIComponent(pad[i]);
      } catch {
        return null;
      }
      param[d.slice(1, -1)] = w;
    } else if (d !== pad[i]) {
      return null;
    }
  }
  return param;
}

/** Een querywaarde naar het type uit het schema: boolean, getal of lijst; anders tekst. */
function zetOm(waarden: string[], schema: JsonSchema | undefined): unknown {
  const types = schema?.type === undefined ? [] : Array.isArray(schema.type) ? schema.type : [schema.type];
  if (types.includes("array")) return waarden.flatMap((w) => w.split(",")).filter((w) => w !== "");
  const w = waarden[waarden.length - 1];
  if (types.includes("boolean") && /^(true|false|1|0)$/i.test(w)) return /^(true|1)$/i.test(w);
  if ((types.includes("integer") || types.includes("number")) && !types.includes("string") && w.trim() !== "" && Number.isFinite(Number(w))) return Number(w);
  return w;
}

function queryArgs(query: string, schema: JsonSchema): Record<string, unknown> {
  const per = new Map<string, string[]>();
  for (const [k, v] of new URLSearchParams(query)) per.set(k, [...(per.get(k) ?? []), v]);
  const uit: Record<string, unknown> = {};
  for (const [k, v] of per) uit[k] = zetOm(v, schema.properties?.[k]);
  return uit;
}

function leesBody(body: string): { ok: true; waarde: Record<string, unknown> } | { ok: false; fout: RestAntwoord } {
  if (body.trim() === "") return { ok: true, waarde: {} };
  let w: unknown;
  try {
    w = JSON.parse(body);
  } catch {
    return { ok: false, fout: foutAntwoord(400, "VALIDATION", "The request body is not valid JSON.") };
  }
  if (w === null || typeof w !== "object" || Array.isArray(w)) {
    return { ok: false, fout: foutAntwoord(400, "VALIDATION", "The request body must be a JSON object.") };
  }
  return { ok: true, waarde: w as Record<string, unknown> };
}

/** Wat GET /api/v1/tools geeft: elke tool met schema en routes. */
export function toolOverzicht(tools: McpToolDef[]): Record<string, unknown> {
  return {
    tools: tools.map((t) => ({
      name: t.name,
      description: t.description,
      kind: t.kind,
      inputSchema: t.inputSchema,
      annotations: t.annotations,
      routes: [
        ...(t.rest ?? []).map((r) => ({ method: r.method, path: `${REST_BASIS}${r.path}` })),
        { method: "POST", path: `${REST_BASIS}/tools/${t.name}` },
      ],
    })),
  };
}

/** Verwerkt één REST-request. Gooit nooit. */
export async function verwerkRest(methode: string, url: string, body: string, deps: RestDeps): Promise<RestAntwoord> {
  const m = methode.toUpperCase() as HttpMethode;
  const vraag = url.indexOf("?");
  const pad = vraag >= 0 ? url.slice(0, vraag) : url;
  const query = vraag >= 0 ? url.slice(vraag + 1) : "";
  const delen = splits(pad);
  if (delen[0] !== "api" || delen[1] !== "v1") return foutAntwoord(404, "NOT_FOUND", `No route ${pad}.`);
  const rest = delen.slice(2);

  // ── Vaste routes ──
  if (rest.length === 0) {
    if (m !== "GET") return foutAntwoord(405, "METHOD_NOT_ALLOWED", `${m} is not allowed on ${pad}.`);
    const ctx = deps.context();
    return json(200, {
      name: ctx.server.naam,
      version: ctx.server.versie,
      openapi: `${REST_BASIS}/openapi.json`,
      tools: `${REST_BASIS}/tools`,
      routes: routesVan(deps.tools).map((r) => `${r.route.method} ${REST_BASIS}${r.route.path}`),
    });
  }
  if (rest.length === 1 && rest[0] === "openapi.json") {
    if (m !== "GET") return foutAntwoord(405, "METHOD_NOT_ALLOWED", `${m} is not allowed on ${pad}.`);
    const ctx = deps.context();
    return json(200, bouwOpenApi(deps.tools, ctx.server));
  }
  if (rest[0] === "tools") {
    if (rest.length === 1) {
      if (m !== "GET") return foutAntwoord(405, "METHOD_NOT_ALLOWED", `${m} is not allowed on ${pad}.`);
      return json(200, toolOverzicht(deps.tools));
    }
    if (rest.length === 2) {
      if (m !== "POST") return foutAntwoord(405, "METHOD_NOT_ALLOWED", `Use POST ${pad} with the tool arguments as JSON body.`);
      let naam: string;
      try {
        naam = decodeURIComponent(rest[1]);
      } catch {
        naam = rest[1];
      }
      const tool = deps.tools.find((t) => t.name === naam);
      if (!tool) return foutAntwoord(404, "NOT_FOUND", `Unknown tool "${naam}". GET ${REST_BASIS}/tools lists them.`);
      const b = leesBody(body);
      if (!b.ok) return b.fout;
      return vanResultaat(await voerToolUit(tool, b.waarde, deps.context()), 200);
    }
  }

  // ── Tool-routes ──
  const kandidaten = routesVan(deps.tools)
    .map((r) => ({ r, param: past(r.delen, rest) }))
    .filter((x): x is { r: Route; param: Record<string, string> } => x.param !== null);
  if (kandidaten.length === 0) return foutAntwoord(404, "NOT_FOUND", `No route ${pad}. GET ${REST_BASIS} lists the routes.`);
  const raak = kandidaten.find((x) => x.r.route.method === m);
  if (!raak) {
    const mag = [...new Set(kandidaten.map((x) => x.r.route.method))].join(", ");
    return foutAntwoord(405, "METHOD_NOT_ALLOWED", `${m} is not allowed on ${pad}; use ${mag}.`);
  }
  const { tool, route } = raak.r;
  let args: Record<string, unknown> = {};
  if (m === "GET" || m === "DELETE") {
    args = queryArgs(query, tool.inputSchema);
  } else {
    const b = leesBody(body);
    if (!b.ok) return b.fout;
    args = b.waarde;
  }
  args = { ...args, ...raak.param };
  return vanResultaat(await voerToolUit(tool, args, deps.context()), route.status ?? 200);
}
