/**
 * Zuivere hulpfuncties voor externe MCP-servers in de AI-zijbalk (P2-15):
 * voorgedefinieerde sjablonen (`regs`, `OpenCADStudio`, ontwerp-engine,
 * aangepast stdio/http), configuratiemigratie en veilige tool-naamruimte
 * (`mcp__<server>__<tool>`).
 *
 * Zonder Tauri/React te toetsen in `scripts/check-ai-agent.mjs`.
 */
import type { AiGereedschap } from "../../tauri/ai.ts";
import type { McpExternStatus, McpExternTool, McpTransport } from "../../tauri/mcpExtern.ts";
import { maakProfielId } from "./profielen.ts";

export interface McpExternServerConfig {
  id: string;
  naam: string;
  actief: boolean;
  transport: McpTransport;
  /** Stdio: uitvoerbaar bestand, bijv. `python3` of `OpenCADStudio`. */
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  /** HTTP: eindpunt-URL van de Streamable HTTP / JSON-RPC MCP-server. */
  url?: string;
  headers?: Record<string, string>;
}

export interface McpExternSjabloon {
  id: string;
  naam: string;
  transport: McpTransport;
  command?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  url?: string;
}

export const MCP_EXTERN_SJABLONEN: McpExternSjabloon[] = [
  {
    id: "regs",
    naam: "Taiwan Regs (regs_server.py)",
    transport: "stdio",
    command: "python3",
    args: ["-E", "-P", "-X", "utf8", "tools/regs/regs_server.py", "--mcp"],
    cwd: "",
    env: { PYTHONIOENCODING: "utf-8" },
  },
  {
    id: "opencadstudio",
    naam: "OpenCADStudio",
    transport: "stdio",
    command: "OpenCADStudio",
    args: ["--mcp"],
  },
  {
    id: "design-engine",
    naam: "Design Engine (stdio)",
    transport: "stdio",
    command: "python3",
    args: [],
    env: { PYTHONIOENCODING: "utf-8" },
  },
  {
    id: "custom-stdio",
    naam: "Custom Stdio MCP",
    transport: "stdio",
    command: "",
    args: [],
  },
  {
    id: "custom-http",
    naam: "Custom HTTP MCP",
    transport: "http",
    url: "http://127.0.0.1:8080/mcp",
  },
];

export interface ExternToolIngang {
  volleNaam: string;
  serverId: string;
  serverNaam: string;
  tool: McpExternTool;
}

/**
 * Korte, geldige functienaam voor OpenAI/Anthropic/Gemini (`^[a-zA-Z0-9_-]{1,64}$`).
 * Als het totaal boven 64 tekens komt, kort de toolnaam deterministisch in met
 * behoud van unieke koppeling via de kaart (`vindExternTool`).
 */
export function externeToolNaam(serverId: string, toolNaam: string, gebruikt?: Set<string>): string {
  const schoon = (s: string) =>
    s
      .trim()
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "x";
  const prefix = `mcp__${schoon(serverId)}__`;
  const basis = `${prefix}${schoon(toolNaam)}`;
  let kandidaat = basis.length <= 64 ? basis : basis.slice(0, 64);
  if (!gebruikt) return kandidaat;
  let i = 2;
  while (gebruikt.has(kandidaat)) {
    const suffix = `_${i++}`;
    kandidaat = `${basis.slice(0, 64 - suffix.length)}${suffix}`;
  }
  gebruikt.add(kandidaat);
  return kandidaat;
}

/**
 * Bouwt voor alle verbonden externe MCP-servers de modelgereedschappen + een
 * opzoekkaart zodat een modelaanroep weer terug naar `(serverId, origNaam)` gaat.
 */
export function bouwExternToolKaart(
  servers: McpExternServerConfig[],
  statussen: Record<string, McpExternStatus>,
  gereserveerdeNamen: Iterable<string> = [],
): { gereedschap: AiGereedschap[]; kaart: Map<string, ExternToolIngang> } {
  const gebruikt = new Set<string>(gereserveerdeNamen);
  const gereedschap: AiGereedschap[] = [];
  const kaart = new Map<string, ExternToolIngang>();

  for (const srv of servers) {
    const st = statussen[srv.id];
    if (!st || !st.verbonden) continue;
    const serverLabel = st.server_naam?.trim() || srv.naam || srv.id;
    for (const tool of st.tools) {
      const volleNaam = externeToolNaam(srv.id, tool.naam, gebruikt);
      const schema =
        tool.schema && typeof tool.schema === "object" && !Array.isArray(tool.schema)
          ? tool.schema
          : { type: "object", properties: {} };
      gereedschap.push({
        naam: volleNaam,
        beschrijving: `[MCP ${serverLabel}] ${tool.beschrijving || tool.naam}`.trim(),
        schema,
      });
      kaart.set(volleNaam, {
        volleNaam,
        serverId: srv.id,
        serverNaam: serverLabel,
        tool,
      });
    }
  }
  return { gereedschap, kaart };
}

/** Splitst argumenttekst op spaties met ondersteuning voor enkele/dubbele aanhalingstekens. */
export function parseArgsTekst(tekst: string): string[] {
  const uit: string[] = [];
  let huidig = "";
  let quote: "'" | '"' | null = null;
  let heeftToken = false;

  for (let i = 0; i < tekst.length; i++) {
    const ch = tekst[i];
    if (quote !== null) {
      if (ch === quote) {
        quote = null;
      } else if (
        ch === "\\" &&
        quote === '"' &&
        i + 1 < tekst.length &&
        (tekst[i + 1] === '"' || tekst[i + 1] === "\\")
      ) {
        huidig += tekst[++i];
      } else {
        huidig += ch;
      }
      heeftToken = true;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
      heeftToken = true;
    } else if (/\s/.test(ch)) {
      if (heeftToken) {
        uit.push(huidig);
        huidig = "";
        heeftToken = false;
      }
    } else {
      huidig += ch;
      heeftToken = true;
    }
  }
  if (heeftToken) uit.push(huidig);
  return uit;
}

export function formatArgsTekst(args?: string[]): string {
  if (!args || args.length === 0) return "";
  return args
    .map((a) => (/[\s"']/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a))
    .join(" ");
}

/** Leest `KEY=VALUE`-regels naar een env-object; slaat lege regels en commentaar over. */
export function leesEnv(tekst: string): Record<string, string> {
  const uit: Record<string, string> = {};
  for (const raw of tekst.split(/\r?\n/)) {
    const regel = raw.trim();
    if (!regel || regel.startsWith("#")) continue;
    const eq = regel.indexOf("=");
    if (eq <= 0) continue;
    const k = regel.slice(0, eq).trim();
    const v = regel.slice(eq + 1).trim();
    if (k !== "") uit[k] = v;
  }
  return uit;
}

export function schrijfEnv(env?: Record<string, string>): string {
  if (!env) return "";
  return Object.entries(env)
    .map(([k, v]) => `${k}=${v}`)
    .join("\n");
}

function migreerEen(raw: unknown, bestaandeIds: string[]): McpExternServerConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const transport: McpTransport = r.transport === "http" ? "http" : "stdio";
  const naam = typeof r.naam === "string" && r.naam.trim() !== "" ? r.naam.trim() : "MCP Server";
  const ruwId = typeof r.id === "string" && r.id.trim() !== "" ? r.id.trim() : naam;
  const id = maakProfielId(ruwId, bestaandeIds);
  bestaandeIds.push(id);

  const args = Array.isArray(r.args)
    ? r.args.filter((x): x is string => typeof x === "string")
    : undefined;
  const env =
    r.env && typeof r.env === "object" && !Array.isArray(r.env)
      ? Object.fromEntries(
          Object.entries(r.env as Record<string, unknown>).filter(([, v]) => typeof v === "string") as [
            string,
            string,
          ][],
        )
      : undefined;
  const headers =
    r.headers && typeof r.headers === "object" && !Array.isArray(r.headers)
      ? Object.fromEntries(
          Object.entries(r.headers as Record<string, unknown>).filter(([, v]) => typeof v === "string") as [
            string,
            string,
          ][],
        )
      : undefined;

  return {
    id,
    naam,
    actief: Boolean(r.actief),
    transport,
    ...(typeof r.command === "string" ? { command: r.command } : {}),
    ...(args ? { args } : {}),
    ...(typeof r.cwd === "string" ? { cwd: r.cwd } : {}),
    ...(env && Object.keys(env).length > 0 ? { env } : {}),
    ...(typeof r.url === "string" ? { url: r.url } : {}),
    ...(headers && Object.keys(headers).length > 0 ? { headers } : {}),
  };
}

export function migreerMcpServers(bewaard: unknown): McpExternServerConfig[] {
  if (!Array.isArray(bewaard)) return [];
  const ids: string[] = [];
  const uit: McpExternServerConfig[] = [];
  for (const item of bewaard) {
    const s = migreerEen(item, ids);
    if (s) uit.push(s);
  }
  return uit;
}
