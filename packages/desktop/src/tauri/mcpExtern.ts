/**
 * De brug naar de externe MCP-client in Rust (`src-tauri/src/mcp_client.rs`,
 * P2-15).
 *
 * Hiermee verbindt de AI-zijbalk met externe MCP-servers over **stdio**
 * (bijv. `regs_server.py --mcp`, `OpenCADStudio --mcp`, eigen ontwerp-engine)
 * of **HTTP** (JSON-RPC 2.0 / Streamable HTTP). Eventuele geheime Bearer-tokens
 * staan uitsluitend in de sleutelbos van het besturingssysteem.
 */
import { invoke } from "@tauri-apps/api/core";
import { aiBeschikbaar } from "./ai.ts";

export type McpTransport = "stdio" | "http";

export interface McpServerConnectVerzoek {
  id: string;
  naam: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  url?: string;
  headers?: Record<string, string>;
}

export interface McpExternTool {
  server_id: string;
  naam: string;
  beschrijving: string;
  schema: Record<string, unknown>;
  read_only: boolean;
  destructive: boolean;
}

export interface McpExternStatus {
  id: string;
  verbonden: boolean;
  server_naam?: string | null;
  server_versie?: string | null;
  tools: McpExternTool[];
  fout?: string | null;
  heeft_geheim: boolean;
}

export interface McpExternCallUitkomst {
  ok: boolean;
  tekst: string;
  is_error: boolean;
  raw: unknown;
}

export async function mcpExternConnect(config: McpServerConnectVerzoek): Promise<McpExternStatus> {
  if (!aiBeschikbaar()) throw new Error("External MCP client requires the desktop app");
  return invoke<McpExternStatus>("mcp_extern_connect", { config });
}

export async function mcpExternDisconnect(id: string): Promise<McpExternStatus> {
  if (!aiBeschikbaar()) {
    return { id, verbonden: false, tools: [], heeft_geheim: false };
  }
  return invoke<McpExternStatus>("mcp_extern_disconnect", { id });
}

export async function mcpExternStatus(id: string): Promise<McpExternStatus> {
  if (!aiBeschikbaar()) {
    return { id, verbonden: false, tools: [], heeft_geheim: false };
  }
  return invoke<McpExternStatus>("mcp_extern_status", { id });
}

export async function mcpExternCall(
  id: string,
  tool: string,
  args: Record<string, unknown>,
): Promise<McpExternCallUitkomst> {
  if (!aiBeschikbaar()) throw new Error("External MCP client requires the desktop app");
  return invoke<McpExternCallUitkomst>("mcp_extern_call", { id, tool, arguments: args });
}

export async function mcpExternSetSecret(id: string, secret: string): Promise<boolean> {
  if (!aiBeschikbaar()) throw new Error("Keyring requires the desktop app");
  return invoke<boolean>("mcp_extern_set_secret", { id, secret });
}
