import { useEffect, useState } from "react";
import { version as pakketVersie } from "../../package.json";
import { kenmerken, type Kenmerken } from "../mcp/kenmerken";

/**
 * Het versienummer zoals de app het overal hoort te tonen.
 *
 * De bron is `app_kenmerken` uit Rust (zie `src-tauri/src/kenmerken.rs`): de
 * volledige release-tag met editie, bijvoorbeeld `2026.46.2-tw.11`. Zo staan
 * titelbalk, statusbalk, Backstage en Instellingen op één lijn, en melden
 * `app_info` en `GET /api/v1/health` hetzelfde. In de browser (Vite-preview) is
 * er geen Rust-kant; daar valt hij terug op het versienummer uit package.json.
 */
export function useAppVersie(): { label: string; kenmerken: Kenmerken | null } {
  const [k, setK] = useState<Kenmerken | null>(null);

  useEffect(() => {
    let weg = false;
    kenmerken(pakketVersie)
      .then((r) => {
        if (!weg) setK(r);
      })
      .catch(() => {
        // Geen antwoord: dan blijft het versienummer uit package.json staan.
      });
    return () => {
      weg = true;
    };
  }, []);

  return { label: k ? k.tag : pakketVersie, kenmerken: k };
}
