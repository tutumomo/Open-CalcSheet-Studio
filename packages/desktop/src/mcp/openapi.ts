/**
 * De OpenAPI 3.1-specificatie van de REST-API, gemaakt uit de registry: elke
 * REST-route van elke tool, plus de vaste routes. Geserveerd op
 * GET /api/v1/openapi.json — als enige route zonder token (alleen de
 * beschrijving, geen projectgegevens); de Origin-weigering geldt ook daar.
 */
import type { JsonSchema, McpToolDef } from "./contracts.ts";

const FOUTEN: Record<string, string> = {
  "400": "Invalid arguments (VALIDATION).",
  "401": "Missing or wrong Bearer token.",
  "403": "The request carried an Origin header (browsers are refused).",
  "404": "Unknown route, sheet, module, formula or report path (NOT_FOUND).",
  "409": "Unsaved changes would be lost; pass force=true (CONFLICT).",
  "422": "The calculation could not be computed (CALC_ERROR).",
  "423": "The API is read-only (READ_ONLY); the user can allow changes in Settings.",
  "500": "Internal error (INTERNAL).",
  "501": "Not available here: browser instead of the desktop app, no internet, or no report engine (NOT_AVAILABLE).",
  "503": "The user paused the API (PAUSED).",
};

function foutAntwoorden(codes: string[]): Record<string, unknown> {
  return Object.fromEntries(
    codes.map((c) => [c, { description: FOUTEN[c], content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } } }]),
  );
}

/** Welke foutstatussen een tool kan geven. */
function foutcodes(t: McpToolDef): string[] {
  const codes = ["400", "401", "403", "404", "500", "503"];
  if (t.kind === "mutate" || t.kind === "file") codes.push("423");
  if (/^(project_new|project_open)$/.test(t.name)) codes.push("409");
  if (/evaluate|ifc/.test(t.name)) codes.push("422");
  if (/^(project_open|project_save|project_save_as|recent_files|export_|library_|sheet_add_pdf|sheet_set_pdf|view_)/.test(t.name)) codes.push("501");
  return [...new Set(codes)].sort();
}

/** De eerste zin van een beschrijving, als samenvatting. */
const samenvatting = (tekst: string) => (tekst.match(/^.*?[.!?](\s|$)/)?.[0] ?? tekst).trim();

/** Een schema zonder de genoemde eigenschappen (die staan al in het pad). */
function zonder(schema: JsonSchema, namen: string[]): JsonSchema {
  if (namen.length === 0) return schema;
  const properties = Object.fromEntries(Object.entries(schema.properties ?? {}).filter(([k]) => !namen.includes(k)));
  const required = (schema.required ?? []).filter((k) => !namen.includes(k));
  return { ...schema, properties, ...(required.length ? { required } : { required: undefined }) };
}

export function bouwOpenApi(tools: McpToolDef[], server: { naam: string; versie: string; poort: number }): Record<string, unknown> {
  const paths: Record<string, Record<string, unknown>> = {};
  const voeg = (pad: string, methode: string, operatie: Record<string, unknown>) => {
    paths[pad] = { ...(paths[pad] ?? {}), [methode.toLowerCase()]: operatie };
  };

  for (const t of tools) {
    (t.rest ?? []).forEach((r, i) => {
      const padParams = [...r.path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1]);
      const props = t.inputSchema.properties ?? {};
      const parameters: Record<string, unknown>[] = padParams.map((p) => ({
        name: p,
        in: "path",
        required: true,
        schema: props[p] ?? { type: "string" },
      }));
      const operatie: Record<string, unknown> = {
        operationId: i === 0 ? t.name : `${t.name}_${i + 1}`,
        summary: samenvatting(t.description),
        description: t.description,
        tags: [t.name.split("_")[0]],
        "x-mcp-tool": t.name,
        "x-kind": t.kind,
      };
      if (r.method === "GET" || r.method === "DELETE") {
        for (const [naam, schema] of Object.entries(props)) {
          if (padParams.includes(naam)) continue;
          const type = Array.isArray(schema.type) ? schema.type : [schema.type];
          parameters.push({
            name: naam,
            in: "query",
            required: (t.inputSchema.required ?? []).includes(naam),
            schema,
            ...(type.includes("array") ? { style: "form", explode: false } : {}),
          });
        }
      } else {
        const body = zonder(t.inputSchema, padParams);
        const nodig = (body.required ?? []).length > 0;
        operatie.requestBody = { required: nodig, content: { "application/json": { schema: body } } };
      }
      if (parameters.length) operatie.parameters = parameters;
      const status = String(r.status ?? 200);
      operatie.responses = {
        [status]: { description: "Success.", content: { "application/json": { schema: { type: "object" } } } },
        ...foutAntwoorden(foutcodes(t)),
      };
      voeg(`/api/v1${r.path}`, r.method, operatie);
    });
  }

  // Generieke route: elke tool met de MCP-argumenten als body.
  voeg("/api/v1/tools/{name}", "POST", {
    operationId: "tools_call",
    summary: "Run any tool by name, with the MCP arguments as JSON body.",
    tags: ["tools"],
    parameters: [{ name: "name", in: "path", required: true, schema: { type: "string", enum: tools.map((t) => t.name) } }],
    requestBody: { required: false, content: { "application/json": { schema: { type: "object" } } } },
    responses: {
      "200": { description: "The tool result.", content: { "application/json": { schema: { type: "object" } } } },
      ...foutAntwoorden(["400", "401", "403", "404", "409", "422", "423", "500", "501", "503"]),
    },
  });
  voeg("/api/v1/tools", "GET", {
    operationId: "tools_list",
    summary: "Every tool with its JSON schema and routes.",
    tags: ["tools"],
    responses: { "200": { description: "The tools.", content: { "application/json": { schema: { type: "object" } } } }, ...foutAntwoorden(["401", "403"]) },
  });
  voeg("/api/v1", "GET", {
    operationId: "index",
    summary: "Name, version and the list of routes.",
    tags: ["tools"],
    responses: { "200": { description: "Overview.", content: { "application/json": { schema: { type: "object" } } } }, ...foutAntwoorden(["401", "403"]) },
  });
  voeg("/api/v1/health", "GET", {
    operationId: "health",
    summary: "Which build answers: edition (tw or upstream), version, full release tag, commit and build date. Readable without a token and answered by the bridge itself.",
    tags: ["tools"],
    security: [],
    responses: {
      "200": {
        description: "Health of the bridge.",
        content: {
          "application/json": {
            schema: {
              type: "object",
              properties: {
                status: { type: "string", enum: ["ok"] },
                name: { type: "string" },
                edition: { type: "string", description: "tw or upstream." },
                version: { type: "string", description: "Version number, for example 2026.46.1." },
                tag: { type: "string", description: "Full release tag, for example 2026.46.1-tw.1." },
                commit: { type: "string" },
                buildDate: { type: "string" },
                port: { type: "integer" },
                api: { type: "string" },
              },
            },
          },
        },
      },
      ...foutAntwoorden(["403"]),
    },
  });
  voeg("/api/v1/openapi.json", "GET", {
    operationId: "openapi",
    summary: "This document. Readable without a token.",
    tags: ["tools"],
    security: [],
    responses: { "200": { description: "The OpenAPI document.", content: { "application/json": { schema: { type: "object" } } } }, ...foutAntwoorden(["403"]) },
  });

  return {
    openapi: "3.1.0",
    info: {
      title: "Open CalcSheet Studio API",
      version: server.versie,
      description:
        "Local REST API of the desktop app, on the same bridge as the MCP server (POST /mcp). Only on 127.0.0.1; every route except this document " +
        "and /api/v1/health needs " +
        "'Authorization: Bearer <token>' (Settings > API and AI assistant); requests with an Origin header are refused. Each route runs the MCP tool named in x-mcp-tool.",
    },
    servers: [{ url: `http://127.0.0.1:${server.poort}` }],
    security: [{ bearer: [] }],
    components: {
      securitySchemes: { bearer: { type: "http", scheme: "bearer" } },
      schemas: {
        Error: {
          type: "object",
          required: ["error"],
          properties: {
            error: {
              type: "object",
              required: ["code", "message"],
              properties: {
                code: { type: "string", enum: ["VALIDATION", "NOT_FOUND", "CONFLICT", "CALC_ERROR", "READ_ONLY", "INTERNAL", "NOT_AVAILABLE", "PAUSED", "METHOD_NOT_ALLOWED", "TIMEOUT"] },
                message: { type: "string" },
                data: {},
              },
            },
          },
        },
      },
    },
    paths,
  };
}
