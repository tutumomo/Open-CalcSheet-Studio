/**
 * #include resolution table. Files referenced via `#include name.cpd`
 * in a calc source are looked up here and inlined at parse time.
 *
 * Add new entries by importing the raw file content via Vite's `?raw` suffix.
 *
 * Een SVG-bestand in deze tabel komt met `@img(naam.svg)` als tekening in het
 * blad (parser.ts, inlineSvgImages). In de SVG geen apostrof: die zou de regel
 * opsplitsen in formule en tekst.
 */

/**
 * Detail bij het voorbeeldblad (templates/rekentaal-demo.ts, hoofdstuk 12): een
 * ligger met kopplaat op een kolom, schematisch.
 */
const detailOplegging = `<svg viewBox="0 0 480 250" xmlns="http://www.w3.org/2000/svg" style="width:100%; max-width:560px; font-size:12px; font-family:sans-serif;">
  <rect width="480" height="250" rx="6" style="fill:#fafaf9"/>
  <!-- kolom: twee flenzen en het lijf, in aanzicht -->
  <rect x="70" y="14" width="44" height="222" style="fill:#e2e8f0; stroke:#334155; stroke-width:1.2"/>
  <line x1="80" y1="14" x2="80" y2="236" style="stroke:#334155; stroke-width:0.8"/>
  <line x1="104" y1="14" x2="104" y2="236" style="stroke:#334155; stroke-width:0.8"/>
  <!-- kopplaat -->
  <rect x="114" y="66" width="10" height="112" style="fill:#94a3b8; stroke:#1e293b; stroke-width:1.2"/>
  <!-- ligger: bovenflens, lijf en onderflens -->
  <rect x="124" y="76" width="300" height="9" style="fill:#cbd5e1; stroke:#1e293b; stroke-width:1.2"/>
  <rect x="124" y="85" width="300" height="74" style="fill:#e2e8f0; stroke:#1e293b; stroke-width:0.8"/>
  <rect x="124" y="159" width="300" height="9" style="fill:#cbd5e1; stroke:#1e293b; stroke-width:1.2"/>
  <line x1="424" y1="70" x2="424" y2="174" style="stroke:#64748b; stroke-width:1; stroke-dasharray:6 4"/>
  <!-- lasnaden tussen kopplaat en ligger -->
  <polygon points="124,85 131,85 124,92" style="fill:#1e293b"/>
  <polygon points="124,159 131,159 124,152" style="fill:#1e293b"/>
  <!-- bouten door kopplaat en kolomflens -->
  <rect x="96" y="93" width="38" height="8" style="fill:#475569"/>
  <rect x="134" y="90" width="6" height="14" style="fill:#475569"/>
  <rect x="96" y="143" width="38" height="8" style="fill:#475569"/>
  <rect x="134" y="140" width="6" height="14" style="fill:#475569"/>
  <!-- aanwijzers -->
  <line x1="92" y1="40" x2="170" y2="40" style="stroke:#64748b; stroke-width:0.8"/>
  <text x="176" y="44" style="fill:#334155">kolom (HE-profiel)</text>
  <line x1="119" y1="190" x2="170" y2="214" style="stroke:#64748b; stroke-width:0.8"/>
  <text x="176" y="218" style="fill:#334155">kopplaat, gelast aan de ligger</text>
  <line x1="137" y1="147" x2="200" y2="190" style="stroke:#64748b; stroke-width:0.8"/>
  <text x="206" y="194" style="fill:#334155">bouten 8.8</text>
  <text x="300" y="122" text-anchor="middle" style="fill:#334155; font-weight:700">IPE-ligger</text>
  <text x="470" y="244" text-anchor="end" style="fill:#64748b; font-size:10px">detail oplegging, schematisch</text>
</svg>`;

import { twLoadCombosRc112, twLoadCombosSteelAsd } from "./tw-load-combos.ts";

export const rekentaalIncludes: ReadonlyMap<string, string> = new Map([
  ["detail-oplegging.svg", detailOplegging],
  // 台灣載重組合共用片段（階段 2b／3；A 級已驗證庫，見 docs/tw/規範來源.md §5.12）
  ["tw-load-combos-rc112.cpd", twLoadCombosRc112],
  ["tw-load-combos-rc112", twLoadCombosRc112],
  ["tw-load-combos-steel-asd.cpd", twLoadCombosSteelAsd],
  ["tw-load-combos-steel-asd", twLoadCombosSteelAsd],
]);

/**
 * Raster images referenced inline via `<img src="./Images/Picture0.png">`.
 * Looked up by basename (case-insensitive) at parse time.
 */
export const rekentaalImageUrls: ReadonlyMap<string, string> = new Map();
