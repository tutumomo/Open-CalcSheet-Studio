/**
 * De MCP-brug in de app: instellingen bewaren, de Rust-brug starten en stoppen
 * en de events `mcp://request` → dispatcher (MCP) of rest.ts (REST) →
 * `mcp://response` koppelen.
 *
 * Herkomst: de levenscyclus volgt `src/services/mcp/server.ts` van Open Planner
 * Studio (OpenAEC Foundation, LGPL-3.0-or-later), ingekort tot wat deze app
 * nodig heeft.
 *
 * Alle `@tauri-apps/*`-imports zijn dynamisch en staan achter `isTauri()`: in
 * een gewone browser (npm run dev) is er geen brug, en dan toont de app dat
 * netjes in plaats van fouten te gooien.
 *
 * Instellingen (preferences.json, via getSetting/setSetting):
 *   mcpAan          standaard true — de server staat standaard aan
 *   mcpPoort        standaard 3879; een dev-build 3880 (`standaardPoort` in koppeling.ts)
 *   mcpToken        bij de eerste start gemaakt; "Nieuw token" vervangt hem
 *   mcpAlleenLezen  standaard false
 */
import { getSetting, setSetting } from "../store";
import { version } from "../../package.json";
import { useMcpStatus, type McpStatus } from "./status";
import { MCP_SERVERNAAM, geldigePoort, nieuwToken, standaardPoort } from "./koppeling";
import { maakRequestHandler, maakSessies, type McpRequestEvent } from "./requestHandler";
import { verwerkMcpBericht } from "./dispatcher";
import { verwerkRest } from "./rest";
import { MCP_TOOLS } from "./tools";
import type { McpContext, McpOmgeving } from "./contracts";

const SLEUTEL = {
  aan: "mcpAan",
  poort: "mcpPoort",
  token: "mcpToken",
  alleenLezen: "mcpAlleenLezen",
} as const;

export function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

const zet = (p: Partial<McpStatus>) => useMcpStatus.setState(p);

/**
 * De sessies van deze app-sessie. Een herstart van de brug (andere poort) laat
 * ze staan; een nieuw token wist ze, want oude koppelingen gelden dan niet meer.
 */
const sessies = maakSessies();

/**
 * De omgeving op de echte stores (omgeving.ts). Pas bij het starten geladen:
 * omgeving.ts gebruikt de functies van Instellingen, en die importeren via de
 * tab weer dit bestand.
 */
let omgeving: McpOmgeving | null = null;

/** Per request vers: de gebruiker kan pauze en alleen-lezen tussendoor omzetten. */
function context(): McpContext {
  const s = useMcpStatus.getState();
  if (!omgeving) throw new Error("MCP environment not loaded yet");
  return {
    omgeving,
    alleenLezen: s.alleenLezen,
    gepauzeerd: s.gepauzeerd,
    server: { naam: MCP_SERVERNAAM, versie: version, poort: s.poort },
  };
}

function verwerk(body: string): Promise<string> {
  return verwerkMcpBericht(body, { tools: MCP_TOOLS, serverInfo: { name: MCP_SERVERNAAM, version }, context });
}

function verwerkRestRequest(methode: string, pad: string, body: string) {
  return verwerkRest(methode, pad, body, { tools: MCP_TOOLS, context });
}

// ── Levenscyclus ────────────────────────────────────────────────────────────

/** De afmeldfuncties van de gekoppelde listeners. Nooit twee keer koppelen: dan liep elk request dubbel. */
let afmelden: Array<() => void> = [];

function opruimen(): void {
  for (const af of afmelden) {
    try {
      af();
    } catch {
      /* al afgemeld */
    }
  }
  afmelden = [];
}

// Bij het vernieuwen van deze module (HMR tijdens ontwikkeling) de listeners
// van de oude versie afmelden; de nieuwe start de brug opnieuw.
if (import.meta.hot) import.meta.hot.dispose(() => opruimen());

/** Starten en stoppen strikt na elkaar, zodat een snelle aan-uit-aan geen dubbele brug geeft. */
let rij: Promise<void> = Promise.resolve();
function inRij(taak: () => Promise<void>): Promise<void> {
  const volgende = rij.then(taak, taak);
  rij = volgende.catch((e) => console.error("MCP-brug:", e));
  return volgende;
}

const melding = (e: unknown) => (e instanceof Error ? e.message : String(e));

async function startNu(): Promise<void> {
  if (!isTauri()) {
    zet({ toestand: "niet-beschikbaar", melding: "" });
    return;
  }
  opruimen();
  omgeving ??= (await import("./omgeving")).liveOmgeving;
  const { invoke } = await import("@tauri-apps/api/core");
  const { emit, listen } = await import("@tauri-apps/api/event");
  const { poort, token } = useMcpStatus.getState();
  zet({ toestand: "start", melding: "" });

  const opRequest = maakRequestHandler({ emit: (e, p) => emit(e, p), verwerk, verwerkRest: verwerkRestRequest, sessies });
  const afReq = await listen<McpRequestEvent>("mcp://request", (ev) => {
    void opRequest(ev.payload);
  });
  // Alleen "running" telt: fouten en stoppen leiden we af uit de uitkomst van
  // de commando's zelf, zodat een laat binnenkomend event de stand niet omgooit.
  const afStatus = await listen<{ state: string; port: number; message?: string }>("mcp://status", (ev) => {
    if (ev.payload.state === "running") zet({ toestand: "live", poort: ev.payload.port, melding: "" });
  });
  afmelden = [afReq, afStatus];

  const probeer = async (): Promise<string | null> => {
    try {
      await invoke("mcp_bridge_start", { port: poort, token });
      return null;
    } catch (e) {
      return melding(e);
    }
  };
  // Mislukt de eerste poging, dan kan de brug van een eerdere webview-sessie
  // nog draaien (herladen van het venster: hier staat alles weer op uit, Rust
  // luistert nog). Eén keer stoppen en opnieuw; pas die tweede mislukking telt.
  let fout = await probeer();
  if (fout !== null) {
    try {
      await invoke("mcp_bridge_stop");
    } catch {
      /* er draaide niets */
    }
    fout = await probeer();
  }
  if (fout !== null) {
    opruimen();
    // "kon niet binden" is de melding van mcp_bridge_start bij een bezette
    // poort; al het andere (bijv. een build zonder de brug) is een fout.
    zet({ toestand: /kon niet binden/i.test(fout) ? "poort-bezet" : "fout", melding: fout });
  } else {
    zet({ toestand: "live", melding: "" });
  }
}

async function stopNu(): Promise<void> {
  opruimen();
  if (isTauri()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("mcp_bridge_stop");
    } catch (e) {
      console.error("MCP-brug stoppen mislukt:", e);
    }
  }
  zet({ toestand: isTauri() ? "uit" : "niet-beschikbaar", melding: "" });
}

// ── Opstarten ──────────────────────────────────────────────────────────────

let init: Promise<void> | null = null;

/** De identifier van deze build (tauri.conf.json); buiten de desktop-app is er geen. */
async function eigenIdentifier(): Promise<string | undefined> {
  if (!isTauri()) return undefined;
  try {
    const { getIdentifier } = await import("@tauri-apps/api/app");
    return await getIdentifier();
  } catch {
    return undefined;
  }
}

async function laadInstellingen(): Promise<void> {
  // Een dev-build heeft een eigen identifier, en daarmee een eigen standaardpoort.
  const standaard = standaardPoort(await eigenIdentifier());
  const [aan, poort, token, alleenLezen] = await Promise.all([
    getSetting<boolean>(SLEUTEL.aan, true),
    getSetting<number>(SLEUTEL.poort, standaard),
    getSetting<string>(SLEUTEL.token, ""),
    getSetting<boolean>(SLEUTEL.alleenLezen, false),
  ]);
  let t = typeof token === "string" ? token : "";
  if (!/^[0-9a-f]{32,}$/i.test(t)) {
    t = nieuwToken();
    await setSetting(SLEUTEL.token, t);
  }
  zet({
    geladen: true,
    aan: aan !== false,
    poort: geldigePoort(poort) ? poort : standaard,
    standaard,
    token: t,
    alleenLezen: alleenLezen === true,
  });
}

/**
 * Leest de instellingen en start de brug als hij aan staat (standaard: aan).
 * Eén keer per app-sessie; een tweede aanroep (StrictMode) doet niets.
 */
export function initMcpBrug(): Promise<void> {
  if (!init) {
    init = laadInstellingen().then(() => {
      if (!isTauri()) {
        zet({ toestand: "niet-beschikbaar" });
        return;
      }
      if (useMcpStatus.getState().aan) return inRij(startNu);
      zet({ toestand: "uit" });
    });
  }
  return init;
}

// ── Wat de instellingen aanroepen ───────────────────────────────────────────

/** Zet de MCP-server aan of uit, bewaart de keuze en start of stopt de brug. */
export async function zetMcpAan(aan: boolean): Promise<void> {
  zet({ aan });
  await setSetting(SLEUTEL.aan, aan);
  await inRij(aan ? startNu : stopNu);
}

/** Een andere poort: bewaren en, als de brug aan staat, op die poort herstarten. */
export async function zetMcpPoort(poort: number): Promise<void> {
  if (!geldigePoort(poort)) return;
  zet({ poort });
  await setSetting(SLEUTEL.poort, poort);
  if (useMcpStatus.getState().aan) await inRij(async () => {
    await stopNu();
    await startNu();
  });
}

/**
 * Een nieuw token. Bestaande koppelingen werken daarna niet meer: de brug
 * herstart met het nieuwe token en de sessies vervallen.
 */
export async function vernieuwMcpToken(): Promise<void> {
  const token = nieuwToken();
  zet({ token });
  await setSetting(SLEUTEL.token, token);
  sessies.clear();
  if (useMcpStatus.getState().aan) await inRij(async () => {
    await stopNu();
    await startNu();
  });
}

/** Opnieuw proberen na "poort bezet" of een fout. */
export async function herstartMcpBrug(): Promise<void> {
  await inRij(async () => {
    await stopNu();
    await startNu();
  });
}

export async function zetMcpAlleenLezen(alleenLezen: boolean): Promise<void> {
  zet({ alleenLezen });
  await setSetting(SLEUTEL.alleenLezen, alleenLezen);
}

/** Pauzeren geldt alleen voor deze sessie: na een herstart staat de koppeling weer open. */
export function zetMcpGepauzeerd(gepauzeerd: boolean): void {
  zet({ gepauzeerd });
}
