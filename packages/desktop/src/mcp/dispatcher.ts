/**
 * MCP-dispatcher — de JSON-RPC-afhandeling, zonder SDK.
 *
 * Krijgt de rauwe HTTP-body (JSON-RPC) en geeft de rauwe antwoord-body terug;
 * de Rust-brug geeft alleen bytes door. Ondersteund: initialize,
 * notifications/*, ping, tools/list en tools/call. Een tool draait via
 * `voerToolUit` (uitvoeren.ts), dezelfde weg als de REST-routes (rest.ts).
 *
 * Herkomst: opzet overgenomen uit Open Planner Studio
 * (`src/services/mcp/dispatcher.ts`, OpenAEC Foundation, LGPL-3.0-or-later),
 * vereenvoudigd tot wat deze app nodig heeft.
 */
import type { McpContext, McpToolDef, McpToolResultaat } from "./contracts.ts";
import { voerToolUit } from "./uitvoeren.ts";

export { controleerSchema } from "./uitvoeren.ts";

/** Protocolversies die we herkennen en dus mogen echoën (nieuwste eerst). */
const BEKENDE_VERSIES = new Set(["2025-06-18", "2025-03-26", "2024-11-05"]);
export const STANDAARD_PROTOCOLVERSIE = "2025-06-18";

/**
 * `InitializeResult.instructions`: de client zet dit in zijn systeemprompt.
 * Engels en kort, want het gaat met elk gesprek mee.
 */
export const MCP_INSTRUCTIES = [
  "Open CalcSheet Studio (Taiwan edition) is a desktop app for structural, geotechnical, drainage and load calculations. The tw-* modules follow Taiwan codes (RC 112, steel 99, seismic 113, wind 103, foundation 112, building technical regulations, soil and water conservation); the other modules follow the Eurocodes with the Dutch national annexes. Check each module's stated code before relying on it. You are working in the project the user has open.",
  "",
  "- A project has project data (consequence class CC, wind region, terrain category, design life, project header; these Eurocode-style items matter for the non-tw modules) that apply to every sheet, calculation sheets (each with its own calculation text and input values), PDF sheets and a structural report.",
  "- Start with project_get. Add modules with modules_list + sheet_add; read and change inputs with sheet_get + sheet_set_input; compute with sheet_evaluate. UC is a unity check: UC <= 1.0 passes.",
  "- Every change goes through the app's undo history (undo/redo) and marks the project unsaved; save only when the user asks (project_save). Never invent input values the user did not give you: say which values you assumed.",
  "- calc_evaluate computes loose calculation text without touching the project; formulas_list finds standard formulas to insert with sheet_insert_formula.",
].join("\n");

type JsonRpcId = string | number | null;

export interface DispatcherDeps {
  tools: McpToolDef[];
  serverInfo: { name: string; version: string };
  context: () => McpContext;
}

const resultaat = (id: JsonRpcId, result: unknown) => JSON.stringify({ jsonrpc: "2.0", id, result });
const foutbericht = (id: JsonRpcId, code: number, message: string) =>
  JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } });

/** Een tool-uitkomst als MCP-toolresultaat: tekst plus structuredContent. */
function verpak(r: McpToolResultaat): object {
  if (r.ok) {
    return { content: [{ type: "text", text: JSON.stringify(r.data) }], structuredContent: r.data, isError: false };
  }
  const body = { code: r.code, error: r.error, ...(r.data ? { data: r.data } : {}) };
  return { content: [{ type: "text", text: JSON.stringify(body) }], structuredContent: body, isError: true };
}

/**
 * Verwerkt één rauwe JSON-RPC-body en geeft de rauwe antwoord-body terug.
 * Een notificatie (bericht zonder `id`) geeft een lege tekst: geen antwoord.
 */
export async function verwerkMcpBericht(rauw: string, deps: DispatcherDeps): Promise<string> {
  let msg: unknown;
  try {
    msg = JSON.parse(rauw);
  } catch {
    return foutbericht(null, -32700, "Parse error");
  }
  if (Array.isArray(msg)) return foutbericht(null, -32600, "Batch arrays of JSON-RPC messages are not supported");
  if (msg === null || typeof msg !== "object") return foutbericht(null, -32600, "Invalid JSON-RPC message");

  const m = msg as { id?: JsonRpcId; method?: unknown; params?: Record<string, unknown> };
  const notificatie = !("id" in m);
  const id: JsonRpcId = notificatie ? null : (m.id ?? null);
  if (typeof m.method !== "string") {
    return notificatie ? "" : foutbericht(id, -32600, "Invalid JSON-RPC message: missing method");
  }
  if (notificatie) return "";

  switch (m.method) {
    case "initialize": {
      const gevraagd = m.params?.protocolVersion;
      const protocolVersion = typeof gevraagd === "string" && BEKENDE_VERSIES.has(gevraagd) ? gevraagd : STANDAARD_PROTOCOLVERSIE;
      return resultaat(id, {
        protocolVersion,
        capabilities: { tools: {} },
        serverInfo: deps.serverInfo,
        instructions: MCP_INSTRUCTIES,
      });
    }
    case "ping":
      return resultaat(id, {});
    case "tools/list":
      return resultaat(id, {
        tools: deps.tools.map((t) => ({
          name: t.name,
          description: t.description,
          inputSchema: t.inputSchema,
          annotations: t.annotations,
        })),
      });
    case "tools/call": {
      const naam = m.params?.name;
      const def = typeof naam === "string" ? deps.tools.find((t) => t.name === naam) : undefined;
      if (!def) return foutbericht(id, -32602, `Unknown tool: ${String(naam)}`);
      const uitkomst = await voerToolUit(def, m.params?.arguments ?? {}, deps.context());
      return resultaat(id, verpak(uitkomst));
    }
    default:
      return foutbericht(id, -32601, `Unknown method: ${m.method}`);
  }
}
