/**
 * De platte tekeningen voor de Taiwanse modules: SVG naar WebP, in de stijl van
 * `tw-pile-cap.webp` (zie docs/modulebeelden.md). Elk beeld is een eenvoudige
 * doorsnede met kleurvlakken en pijlen; de maat is 540 × 312 (180 × 104 op het scherm).
 *
 * Draaien:  node scripts/maak-tw-modulebeelden.mjs [uitvoermap] [naam …]
 * Zonder uitvoermap schrijft het naar packages/desktop/src/assets/module-beelden.
 * scripts/check-modulebeelden.mjs controleert de uitkomst.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const BREEDTE = 540;
const HOOGTE = 312;
const MAP = fileURLToPath(new URL("../packages/desktop/src/assets/module-beelden/", import.meta.url));

// ── De kleuren van de Taiwanse beelden ──────────────────────────────────────
const GROND = "#f1efea";
const ZAND_BOVEN = "#efe4d0";
const ZAND_ONDER = "#e3d3b8";
const LIJN = "#8b9096";
const BETON = { boven: "#b4bfd0", links: "#94a4bb", rechts: "#7c8ca6" };
const STAAL = "#35536f";
const STAAL_DONKER = "#2a425b";
const TURKOOIS = "#58a99d";

/** Pijl met de punt naar beneden (richting = 1) of naar boven (richting = -1). */
function pijl(x, yTop, yOnder, kleur, dik = 9, richting = 1) {
  const kop = 26;
  const y = richting === 1 ? yOnder : yTop;
  const staart = richting === 1 ? yTop : yOnder;
  return `<line x1="${x}" y1="${staart}" x2="${x}" y2="${y}" stroke="${kleur}" stroke-width="${dik}" stroke-linecap="round"/>`
    + `<polygon points="${x},${y} ${x - kop / 2},${y - richting * kop * 0.75} ${x + kop / 2},${y - richting * kop * 0.75}" fill="${kleur}"/>`;
}

/** Staande paal: mantel en voet, met de grenslijn van de bodem. */
function paal(x, breedte, yTop, yVoet) {
  return `<rect x="${x}" y="${yTop}" width="${breedte}" height="${yVoet - yTop}" fill="${STAAL_DONKER}"/>`
    + `<rect x="${x - 8}" y="${yVoet - 14}" width="${breedte + 16}" height="14" fill="${STAAL}"/>`;
}

/** 基樁承載力：地盤剖面、單樁、載重與樁端／側阻抗力。 */
function twPileFoundation() {
  const delen = [];
  // Grond en lagen
  delen.push(`<rect x="0" y="0" width="${BREEDTE}" height="${HOOGTE}" fill="#ffffff"/>`);
  delen.push(`<rect x="0" y="120" width="${BREEDTE}" height="${HOOGTE - 120}" fill="${ZAND_BOVEN}"/>`);
  delen.push(`<rect x="0" y="232" width="${BREEDTE}" height="${HOOGTE - 232}" fill="${ZAND_ONDER}"/>`);
  delen.push(`<line x1="0" y1="120" x2="${BREEDTE}" y2="120" stroke="${LIJN}" stroke-width="1.6"/>`);
  delen.push(`<line x1="0" y1="232" x2="${BREEDTE}" y2="232" stroke="${LIJN}" stroke-width="1.6" stroke-dasharray="7 6"/>`);
  // Paal en funderingsblok
  delen.push(paal(255, 30, 104, 292));
  delen.push(`<rect x="180" y="82" width="180" height="24" fill="${STAAL}"/>`);
  delen.push(`<rect x="246" y="26" width="48" height="58" fill="${STAAL}"/>`);
  // Belasting van boven
  delen.push(pijl(270, 4, 24, TURKOOIS, 9, 1));
  // Grondweerstand aan de paalvoet en langs de mantel
  delen.push(pijl(270, 292, 264, TURKOOIS, 8, -1));
  for (const y of [148, 186, 224]) {
    delen.push(`<line x1="285" y1="${y}" x2="316" y2="${y}" stroke="${TURKOOIS}" stroke-width="5" stroke-linecap="round"/>`);
    delen.push(`<polygon points="322,${y} 308,${y - 8} 308,${y + 8}" fill="${TURKOOIS}"/>`);
  }
  // Grondwaterspiegel
  delen.push(`<line x1="0" y1="196" x2="${BREEDTE}" y2="196" stroke="#7fa8c4" stroke-width="2" stroke-dasharray="10 6"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BREEDTE}" height="${HOOGTE}" viewBox="0 0 ${BREEDTE} ${HOOGTE}">${delen.join("")}</svg>`;
}

const BEELDEN = {
  "tw-pile-foundation": twPileFoundation,
};

const [uitvoer = MAP, ...alleen] = process.argv.slice(2);
mkdirSync(uitvoer, { recursive: true });
for (const [naam, maak] of Object.entries(BEELDEN)) {
  if (alleen.length && !alleen.includes(naam)) continue;
  const svg = Buffer.from(maak());
  const uit = await sharp(svg, { density: 144 }).resize(BREEDTE, HOOGTE).webp({ quality: 86, effort: 6 }).toBuffer();
  writeFileSync(join(uitvoer, `${naam}.webp`), uit);
  console.log(`${naam}.webp: ${(uit.length / 1024).toFixed(1)} kB`);
}
