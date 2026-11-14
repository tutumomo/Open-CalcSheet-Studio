/**
 * De brug naar de AI-aanbieder in Rust (`src-tauri/src/ai.rs`).
 *
 * De webview kan zelf geen verzoek naar een andere host doen (CORS) en de sleutel
 * hoort niet in de webview. Daarom gaat het gesprek via Rust: dit bestand stuurt
 * één beurt (`ai_vraag`) en krijgt de gebeurtenissen van het antwoord terug via
 * een kanaal, zodat de zijbalk kan meetypen.
 *
 * De sleutel gaat alleen naar de sleutelbos (`ai_zet_sleutel`) en komt nooit
 * terug: `ai_heeft_sleutel` zegt alleen of er een is.
 */
import { Channel, invoke } from "@tauri-apps/api/core";

/** De aanbieders die `ai.rs` kent. `openai` dekt ook magpie en andere compatible endpoints. */
export type AiAanbieder = "anthropic" | "openai" | "gemini";

export interface AiOproep {
  id: string;
  naam: string;
  argumenten: unknown;
}

export interface AiResultaat {
  id: string;
  naam?: string;
  inhoud: string;
  fout?: boolean;
}

/** Eén beurt in de geschiedenis; dezelfde vorm voor elke aanbieder. */
export interface AiBericht {
  rol: "user" | "assistant" | "tool";
  tekst: string;
  oproepen?: AiOproep[];
  resultaten?: AiResultaat[];
}

export interface AiGereedschap {
  naam: string;
  beschrijving: string;
  schema: unknown;
}

export interface AiVerzoek {
  aanbieder: AiAanbieder;
  endpoint: string;
  model: string;
  systeem: string;
  berichten: AiBericht[];
  gereedschap: AiGereedschap[];
  /** Let op: de Rust-kant leest `max_tokens` (snake_case, zoals serde het veld noemt). */
  max_tokens: number;
  temperatuur?: number;
}

export type AiGebeurtenis =
  | { soort: "tekst"; tekst: string }
  | { soort: "oproep"; id: string; naam: string; argumenten: unknown }
  | { soort: "klaar"; stopreden: string; invoer: number; uitvoer: number }
  | { soort: "fout"; melding: string };

/** Is er een Rust-kant? In de browser (Vite-preview) niet. */
export const aiBeschikbaar = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Bewaar de sleutel van een aanbieder in de sleutelbos; leeg wist hem. */
export async function zetSleutel(aanbieder: AiAanbieder, sleutel: string): Promise<void> {
  await invoke("ai_zet_sleutel", { aanbieder, sleutel });
}

/** Staat er een sleutel voor deze aanbieder? */
export async function heeftSleutel(aanbieder: AiAanbieder): Promise<boolean> {
  if (!aiBeschikbaar()) return false;
  return invoke<boolean>("ai_heeft_sleutel", { aanbieder });
}

/** Eén beurt naar de aanbieder; `bij` krijgt elke gebeurtenis zodra hij binnen is. */
export async function vraag(
  verzoek: AiVerzoek,
  bij: (gebeurtenis: AiGebeurtenis) => void,
): Promise<void> {
  if (!aiBeschikbaar()) throw new Error("the AI assistant needs the desktop app");
  const kanaal = new Channel<AiGebeurtenis>();
  kanaal.onmessage = bij;
  await invoke("ai_vraag", { verzoek, kanaal });
}

/** De stopknop: het lopende verzoek stopt na de huidige regel. */
export async function stop(): Promise<void> {
  if (!aiBeschikbaar()) return;
  await invoke("ai_stop");
}
