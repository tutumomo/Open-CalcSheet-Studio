import { invoke } from "@tauri-apps/api/core";

/**
 * De kenmerken van deze build: editie (`tw`／`upstream`), volledige release-tag,
 * commit en bouwdatum.
 *
 * Ze komen uit Rust (`app_kenmerken`, zie `src-tauri/src/kenmerken.rs`), zodat
 * de app, `app_info` en `GET /api/v1/health` hetzelfde melden. De Taiwan-versie
 * en de upstream-versie dragen hetzelfde versienummer; zonder deze kenmerken is
 * een draaiende app niet tot een release te herleiden
 * (zie `docs/tw/OCSS接入實作計畫.md`, P0-3).
 *
 * In de browser (Vite-preview, geen Tauri) is er geen Rust-kant; daar zeggen we
 * dat eerlijk (`edition: "browser"`) in plaats van een editie te verzinnen.
 */

export interface Kenmerken {
  /** `tw`, `upstream`, `unknown` of `browser`. */
  edition: string;
  /** Versienummer zonder editie-achtervoegsel, bijvoorbeeld `2026.46.1`. */
  version: string;
  /** Volledige release-tag, bijvoorbeeld `2026.46.1-tw.1`. */
  tag: string;
  /** Korte commit-hash van de build, of `unknown`. */
  commit: string;
  /** Bouwdatum (ISO), of `unknown`. */
  buildDate: string;
}

const isTauri = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

let bewaard: Kenmerken | null = null;

/**
 * De kenmerken van deze build. Het resultaat wordt één keer opgehaald en daarna
 * hergebruikt: ze veranderen per definitie niet tijdens een sessie.
 */
export async function kenmerken(versie: string): Promise<Kenmerken> {
  if (bewaard) return bewaard;
  if (!isTauri()) {
    bewaard = { edition: "browser", version: versie, tag: `${versie}-browser`, commit: "unknown", buildDate: "unknown" };
    return bewaard;
  }
  try {
    const w = await invoke<Partial<Kenmerken>>("app_kenmerken");
    bewaard = {
      edition: String(w.edition ?? "unknown"),
      version: String(w.version ?? versie),
      tag: String(w.tag ?? versie),
      commit: String(w.commit ?? "unknown"),
      buildDate: String(w.buildDate ?? "unknown"),
    };
  } catch {
    // Oudere build zonder dit commando: wel een antwoord, geen verzonnen tag.
    bewaard = { edition: "unknown", version: versie, tag: versie, commit: "unknown", buildDate: "unknown" };
  }
  return bewaard;
}
