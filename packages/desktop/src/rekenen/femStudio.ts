/**
 * Open FEM Studio, headless in CalcSheet: de brug van de webview naar de server
 * die de Rust-kant als kindproces beheert (src-tauri/src/fem_studio.rs).
 *
 * De normtoetsingen komen uit één bron, FEM Studio. Hier staan alleen de drie
 * aanroepen; wat een rekenblad ermee doet, komt met het `@toets`-blok. Zie
 * docs/superpowers/specs/2026-11-07-toetsing-via-fem-studio-design.md.
 *
 * Buiten de desktop-app (de vite-preview, de controlescripts) is er geen server:
 * dan geeft de status `geenDesktop` en gooit een aanroep een `FemFout`.
 */

export type FemStatusCode = "nietMeegeleverd" | "startMislukt" | "geenDesktop";

export interface FemStatus {
  beschikbaar: boolean;
  /** De versie van de server (`serverInfo.version`). */
  versie?: string | null;
  /** Waar de server staat. */
  pad?: string | null;
  /** De sha256 van het programma van de server, voor de herkomst van een antwoord. */
  sha256?: string | null;
  /** Welke vertaalde melding past als hij er niet is. */
  code?: FemStatusCode | null;
  /** De technische toelichting, zoals de Rust-kant hem geeft. */
  reden?: string | null;
}

/** Een aanroep die niet lukte: de melding, en de gestructureerde fout van FEM Studio. */
export class FemFout extends Error {
  code: FemStatusCode | null;
  gestructureerd?: unknown;
  constructor(melding: string, gestructureerd?: unknown, code: FemStatusCode | null = null) {
    super(melding);
    this.name = "FemFout";
    this.code = code;
    this.gestructureerd = gestructureerd;
  }
}

function inDesktop(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

async function roep<T>(commando: string, argumenten?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(commando, argumenten);
}

/** Of FEM Studio er is, met zijn versie. Start de server als dat nodig is. */
export async function femStudioStatus(): Promise<FemStatus> {
  if (!inDesktop()) return { beschikbaar: false, code: "geenDesktop" };
  try {
    return await roep<FemStatus>("fem_studio_status");
  } catch (e) {
    return { beschikbaar: false, code: "startMislukt", reden: String(e) };
  }
}

/**
 * De licentie van de meegeleverde server en de weg naar zijn broncode, uit de
 * bestanden naast de server. FEM Studio valt onder de AGPL-3.0; CalcSheet start
 * hem als apart programma.
 */
export interface FemLicentie {
  /** De versie waar het bronarchief bij hoort. */
  versie?: string | null;
  /** De naam van het bronarchief van precies die versie. */
  bron?: string | null;
  /** Waar het bronarchief staat. */
  adres?: string | null;
  /** Het pad van de licentietekst naast de server. */
  licentie?: string | null;
  /** Het pad van de vermeldingen van derden naast de server. */
  vermeldingen?: string | null;
}

/** De licentie en de bron van de meegeleverde FEM Studio. Start de server niet. */
export async function femStudioLicentie(): Promise<FemLicentie | null> {
  if (!inDesktop()) return null;
  try {
    return await roep<FemLicentie>("fem_studio_licentie");
  } catch {
    return null;
  }
}

/** De tools van FEM Studio met hun schema's (`tools/list`). */
export async function femStudioTools(): Promise<unknown> {
  if (!inDesktop()) throw new FemFout("no desktop app", undefined, "geenDesktop");
  try {
    return await roep<unknown>("fem_studio_tools");
  } catch (e) {
    throw new FemFout(String(e));
  }
}

/** Eén toets of opzoeking (`tools/call`); alleen de reken- en opzoektools mogen. */
export async function femStudioAanroep(tool: string, argumenten: Record<string, unknown>): Promise<unknown> {
  if (!inDesktop()) throw new FemFout("no desktop app", undefined, "geenDesktop");
  try {
    return await roep<unknown>("fem_studio_aanroep", { tool, argumenten });
  } catch (e) {
    const fout = e as { melding?: unknown; gestructureerd?: unknown } | null;
    const melding = typeof fout?.melding === "string" ? fout.melding : String(e);
    throw new FemFout(melding, fout?.gestructureerd);
  }
}
