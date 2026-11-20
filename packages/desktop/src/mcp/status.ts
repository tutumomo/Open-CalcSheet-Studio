import { create } from "zustand";
import { MCP_STANDAARD_POORT } from "./koppeling";

/**
 * De toestand van de MCP-brug voor de schermen: de instellingen (aan, poort,
 * token, alleen-lezen), de pauzeknop en of de brug luistert. Wijzigen gaat via
 * de functies in brug.ts; die bewaren ook de instellingen.
 */
export type McpToestand =
  /** De brug staat uit (instelling) of is gestopt. */
  | "uit"
  /** Bezig met starten. */
  | "start"
  /** De brug luistert op 127.0.0.1:<poort>. */
  | "live"
  /** Starten mislukte: meestal is de poort al in gebruik. */
  | "poort-bezet"
  /** Iets anders ging mis; zie `melding`. */
  | "fout"
  /** Geen desktop-app (gewone browser): er is geen brug. */
  | "niet-beschikbaar";

export interface McpStatus {
  /** De instellingen zijn ingelezen; tot dan gelden de standaarden. */
  geladen: boolean;
  aan: boolean;
  poort: number;
  /** De poort die deze build zonder instelling gebruikt (koppeling.ts, `standaardPoort`). */
  standaard: number;
  token: string;
  alleenLezen: boolean;
  /** Tijdelijk: tools geven een melding in plaats van iets te doen. Niet bewaard. */
  gepauzeerd: boolean;
  toestand: McpToestand;
  melding: string;
}

/** De kleur van het statusbolletje, in de instellingen en in de statusbalk. */
export const MCP_STATUSKLEUR: Record<McpToestand, string> = {
  uit: "var(--theme-status-text-label)",
  start: "var(--oa-warning)",
  live: "var(--oa-success)",
  "poort-bezet": "var(--oa-warning)",
  fout: "var(--oa-error)",
  "niet-beschikbaar": "var(--theme-status-text-label)",
};

export const useMcpStatus = create<McpStatus>(() => ({
  geladen: false,
  aan: true,
  poort: MCP_STANDAARD_POORT,
  standaard: MCP_STANDAARD_POORT,
  token: "",
  alleenLezen: false,
  gepauzeerd: false,
  toestand: "uit",
  melding: "",
}));
