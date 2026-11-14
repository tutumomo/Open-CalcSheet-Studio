/**
 * De eenmalige opdrachten van de command line: `eval` en `render`, en de
 * hoofdmodus (`--headless`).
 *
 * Waarom in de frontend en niet in Rust: de 49 tools leven hier, en ze werken
 * op dezelfde stores als de app. Een tweede implementatie in Rust zou kunnen
 * afwijken; deze weg kan dat niet — de CLI roept letterlijk dezelfde tool aan
 * als de MCP-brug en de REST-API (zie `docs/tw/OCSS接入實作計畫.md`, P0-1).
 *
 * De opdracht komt van Rust (`cli_opdracht`, zie `src-tauri/src/cli.rs`):
 *   null                     → gewoon de app met venster
 *   {"command":"headless"}   → geen venster, wel API en MCP
 *   {"command":"eval",...}   → één keer rekenen, JSON op stdout, stoppen
 *   {"command":"render",...} → rekenblad naar PDF, stoppen
 */

import { MCP_TOOLS } from "./tools.ts";
import type { McpContext, McpToolResultaat } from "./contracts.ts";
import { voerToolUit } from "./uitvoeren.ts";
import { kenmerken } from "./kenmerken.ts";
import { version } from "../../package.json";

interface CliOpdracht {
  command: "headless" | "eval" | "render";
  /** Pad naar de rekentekst, of de tekst zelf bij `inline`. */
  source?: string;
  /** `true` als `source` de tekst zelf is (stdin). */
  inline?: boolean;
  /** Uitvoerpad voor `render`. */
  pdf?: string;
}

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Schrijft de uitvoer naar stdout van het proces en stopt met `code`. */
async function klaar(tekst: string, code: number): Promise<never> {
  const { invoke } = await import("@tauri-apps/api/core");
  // `cli_klaar` print en roept `std::process::exit`; de belofte komt dus nooit
  // terug. De await hieronder is er voor het geval dat ooit verandert.
  await invoke("cli_klaar", { tekst, code });
  throw new Error("cli_klaar returned");
}

async function leesBron(opdracht: CliOpdracht): Promise<string> {
  if (opdracht.inline) return opdracht.source ?? "";
  const pad = opdracht.source ?? "";
  if (!pad) throw new Error("no source given");
  const { readTextFile } = await import("@tauri-apps/plugin-fs");
  return await readTextFile(pad);
}

/** De omgeving van de echte app, zoals de brug hem ook gebruikt. */
async function context(): Promise<McpContext> {
  const { liveOmgeving } = await import("./omgeving");
  const { useMcpStatus } = await import("./status");
  return {
    omgeving: liveOmgeving,
    alleenLezen: false,
    gepauzeerd: false,
    server: { naam: "Open CalcSheet Studio", versie: version, poort: useMcpStatus.getState().poort },
  };
}

function tool(naam: string) {
  const def = MCP_TOOLS.find((t) => t.name === naam);
  if (!def) throw new Error(`unknown tool ${naam}`);
  return def;
}

function alsJson(uitkomst: McpToolResultaat): string {
  return JSON.stringify(uitkomst, null, 2);
}

/**
 * Voert de opdracht uit. Geeft `false` terug als de app gewoon met venster moet
 * starten; `true` betekent: geen venster (hoofdmodus). Bij `eval` en `render`
 * komt deze functie niet terug: het proces stopt met de juiste exitcode.
 */
export async function startCli(): Promise<boolean> {
  if (!isTauri()) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  let opdracht: CliOpdracht | null;
  try {
    opdracht = await invoke<CliOpdracht | null>("cli_opdracht");
  } catch {
    // Oudere build zonder dit commando: gewoon de app.
    return false;
  }
  if (!opdracht) return false;
  if (opdracht.command === "headless") return true;

  try {
    const ctx = await context();
    if (opdracht.command === "eval") {
      const source = await leesBron(opdracht);
      const uitkomst = await voerToolUit(tool("calc_evaluate"), { source, maxLines: 5000 }, ctx);
      if (!uitkomst.ok) await klaar(alsJson(uitkomst), 1);
      // De editie erbij, zodat een script weet welke build het antwoord gaf.
      const k = await kenmerken(version);
      const data = uitkomst.ok ? uitkomst.data : {};
      await klaar(JSON.stringify({ ...data, build: { edition: k.edition, tag: k.tag, commit: k.commit } }, null, 2), 0);
    }
    // render
    const source = await leesBron(opdracht);
    const toegevoegd = await voerToolUit(tool("sheet_add"), { source, name: "render" }, ctx);
    if (!toegevoegd.ok) await klaar(alsJson(toegevoegd), 1);
    const id = toegevoegd.ok ? String(toegevoegd.data.id ?? "") : "";
    if (!opdracht.pdf) {
      // Zonder --pdf: het blad als JSON, zodat een script kan zien wat er in het
      // blad staat zonder een bestand te schrijven.
      await klaar(JSON.stringify(toegevoegd.ok ? toegevoegd.data : {}, null, 2), 0);
    }
    const pdf = await voerToolUit(tool("export_pdf"), { path: opdracht.pdf, ids: [id] }, ctx);
    await klaar(alsJson(pdf), pdf.ok ? 0 : 1);
  } catch (e) {
    await klaar(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }, null, 2), 1);
  }
  return true;
}
