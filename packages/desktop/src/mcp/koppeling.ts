/**
 * Vaste gegevens van de MCP-koppeling en de tekst waarmee een client verbindt.
 * Zonder imports, zodat de controle (scripts/check-mcp.mjs) het in Node laadt.
 */

/**
 * De standaardpoort van de MCP-brug. Bewust een vaste, hoge poort, zodat een
 * eenmaal ingestelde client blijft werken; naast die van de andere
 * OpenAEC-programma's (Open Planner Studio: 3877). Te wijzigen in
 * Instellingen > AI-assistent (MCP). Zie docs/mcp.md.
 */
export const MCP_STANDAARD_POORT = 3879;

/**
 * De identifier van een dev-build (src-tauri/tauri.dev.conf.json, `npm run build:dev-exe`).
 * Een andere identifier geeft een eigen gegevensmap: eigen voorkeuren, een eigen
 * token en een eigen herstelstaat. Zo draait een dev-build naast de geïnstalleerde app.
 */
// 台灣版：dev-build 也用台灣版自己的 identifier，不會和上游的 dev-build 共用資料夾
export const DEV_IDENTIFIER = "tw.opencalcsheet.studio.dev";

/**
 * De poort waarop de brug van deze build standaard luistert: een dev-build één
 * hoger, zodat hij de poort van de geïnstalleerde app vrij laat.
 */
export function standaardPoort(identifier: string | undefined): number {
  return identifier === DEV_IDENTIFIER ? MCP_STANDAARD_POORT + 1 : MCP_STANDAARD_POORT;
}

/** De naam waaronder een client de server registreert (en `serverInfo.name`). */
export const MCP_SERVERNAAM = "open-calcsheet-studio";

/** Een poort die de brug mag gebruiken: een geheel getal boven de systeempoorten. */
export function geldigePoort(n: unknown): n is number {
  return typeof n === "number" && Number.isInteger(n) && n >= 1024 && n <= 65535;
}

/** Het adres van de MCP-server. Altijd loopback: de brug luistert nergens anders. */
export function mcpAdres(poort: number): string {
  return `http://127.0.0.1:${poort}/mcp`;
}

/**
 * De regel voor Claude Code. De header staat bewust achteraan: `--header` neemt
 * meerdere waarden, en vóór de naam zou hij die naam opslokken.
 */
export function claudeCodeCommando(poort: number, token: string): string {
  return `claude mcp add --transport http --scope user ${MCP_SERVERNAAM} ${mcpAdres(poort)} --header "Authorization: Bearer ${token}"`;
}

/** Een configuratieblok voor clients die een `mcpServers`-JSON lezen. */
export function clientConfiguratie(poort: number, token: string): string {
  return JSON.stringify(
    {
      mcpServers: {
        [MCP_SERVERNAAM]: {
          type: "http",
          url: mcpAdres(poort),
          headers: { Authorization: `Bearer ${token}` },
        },
      },
    },
    null,
    2,
  );
}

/** Een vers Bearer-token: 32 willekeurige bytes, hex (64 tekens). */
export function nieuwToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}

/** Het basisadres van de REST-API (zelfde brug, zelfde poort en token als MCP). */
export function restBasis(poort: number): string {
  return `http://127.0.0.1:${poort}/api/v1`;
}

/** De OpenAPI-specificatie; als enige route zonder token te lezen. */
export function openApiAdres(poort: number): string {
  return `${restBasis(poort)}/openapi.json`;
}

/** Een eerste REST-aanroep: het open project lezen. */
export function curlVoorbeeld(poort: number, token: string): string {
  return `curl -H "Authorization: Bearer ${token}" ${restBasis(poort)}/project`;
}
