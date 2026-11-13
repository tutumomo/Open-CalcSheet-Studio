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

/** 公路橋梁耐震（hwbridgeseis108 第八章）：橋梁立面＋下部結構＋梁端防落＋動水壓＋地震土壓波浪箭頭 */
function twBridgeSeismic() {
  const delen = [];
  // 背景天空與地層
  delen.push(`<rect x="0" y="0" width="${BREEDTE}" height="190" fill="#eef4f9"/>`);
  delen.push(`<rect x="0" y="190" width="${BREEDTE}" height="122" fill="#d9cdb8"/>`);
  delen.push(`<line x1="0" y1="190" x2="${BREEDTE}" y2="190" stroke="#8c7853" stroke-width="2"/>`);
  // 水體（左側臨水）
  delen.push(`<rect x="40" y="110" width="160" height="80" fill="#c2dbee" opacity="0.6"/>`);
  delen.push(`<line x1="40" y1="110" x2="200" y2="110" stroke="#4a8ec2" stroke-width="2"/>`);
  // 左橋台（兼具擋土牆）
  delen.push(`<polygon points="40,90 80,90 80,240 40,240" fill="#88929b" stroke="#333" stroke-width="2"/>`);
  // 橋墩（中間）
  delen.push(`<rect x="250" y="80" width="40" height="160" fill="#88929b" stroke="#333" stroke-width="2"/>`);
  delen.push(`<rect x="230" y="70" width="80" height="16" fill="#6d7883" stroke="#333" stroke-width="2"/>`);
  delen.push(`<rect x="220" y="240" width="100" height="30" fill="#6d7883" stroke="#333" stroke-width="2"/>`);
  // 主梁 1（跨徑 1）
  delen.push(`<rect x="75" y="50" width="160" height="20" fill="#4a6572" stroke="#232f34" stroke-width="2"/>`);
  // 主梁 2（跨徑 2）
  delen.push(`<rect x="245" y="50" width="220" height="20" fill="#4a6572" stroke="#232f34" stroke-width="2"/>`);
  // 支承與防落長度標示 LN
  delen.push(`<circle cx="82" cy="74" r="4" fill="#f9a825"/>`);
  delen.push(`<polygon points="237,70 241,78 233,78" fill="#f9a825"/>`);
  delen.push(`<circle cx="253" cy="74" r="4" fill="#f9a825"/>`);
  delen.push(`<line x1="230" y1="92" x2="270" y2="92" stroke="#c62828" stroke-width="2"/>`);
  delen.push(`<text x="250" y="104" font-size="11" font-weight="bold" fill="#c62828" text-anchor="middle">LN</text>`);
  // 地震土壓箭頭（右側土層對橋台/牆之推力）
  delen.push(`<polygon points="470,120 440,120 446,116 446,124" fill="#b71c1c"/>`);
  delen.push(`<polygon points="480,150 440,150 446,146 446,154" fill="#b71c1c"/>`);
  delen.push(`<polygon points="490,180 440,180 446,176 446,184" fill="#b71c1c"/>`);
  delen.push(`<text x="495" y="154" font-size="11" font-weight="bold" fill="#b71c1c">PEa</text>`);
  // 地震動水壓箭頭（左側水對橋墩推力）
  delen.push(`<polygon points="170,140 210,140 204,136 204,144" fill="#0277bd"/>`);
  delen.push(`<polygon points="160,170 210,170 204,166 204,174" fill="#0277bd"/>`);
  delen.push(`<text x="145" y="158" font-size="11" font-weight="bold" fill="#0277bd">Pw</text>`);
  // 地盤震動波浪符號
  delen.push(`<path d="M 60 270 Q 75 260 90 270 T 120 270 T 150 270" fill="none" stroke="#e65100" stroke-width="3"/>`);
  delen.push(`<path d="M 370 270 Q 385 260 400 270 T 430 270 T 460 270" fill="none" stroke="#e65100" stroke-width="3"/>`);
  delen.push(`<text x="105" y="295" font-size="10" font-weight="bold" fill="#e65100" text-anchor="middle">kh · g</text>`);
  delen.push(`<text x="415" y="295" font-size="10" font-weight="bold" fill="#e65100" text-anchor="middle">FL, DE</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BREEDTE}" height="${HOOGTE}" viewBox="0 0 ${BREEDTE} ${HOOGTE}">${delen.join("")}</svg>`;
}

/** 木構造構材（wood100 第 4、5 章）：木梁＋木柱、載重、撓曲曲線與側撐 */
function twWoodMember() {
  const HOUT = "#c9a06a";
  const HOUT_DONKER = "#a97f4d";
  const delen = [];
  // Achtergrond
  delen.push(`<rect x="0" y="0" width="${BREEDTE}" height="${HOOGTE}" fill="#faf7f2"/>`);
  // Grondslag
  delen.push(`<rect x="0" y="262" width="${BREEDTE}" height="50" fill="${ZAND_ONDER}"/>`);
  delen.push(`<line x1="0" y1="262" x2="${BREEDTE}" y2="262" stroke="${LIJN}" stroke-width="2"/>`);
  // Timberkolommen
  delen.push(`<rect x="70" y="120" width="34" height="142" fill="${HOUT_DONKER}" stroke="#6d4f2c" stroke-width="2"/>`);
  delen.push(`<rect x="436" y="120" width="34" height="142" fill="${HOUT_DONKER}" stroke="#6d4f2c" stroke-width="2"/>`);
  // Timberbalk
  delen.push(`<rect x="55" y="84" width="430" height="36" fill="${HOUT}" stroke="#6d4f2c" stroke-width="2"/>`);
  // Houtnerf
  for (const x of [120, 190, 260, 330, 400]) {
    delen.push(`<line x1="${x}" y1="88" x2="${x}" y2="116" stroke="#8a6435" stroke-width="1.2" opacity="0.6"/>`);
  }
  // Belastingen op de balk
  for (const x of [180, 270, 360]) delen.push(pijl(x, 18, 84, TURKOOIS, 8, 1));
  // Doorbuigingskromme
  delen.push(`<path d="M 70 122 Q 270 190 470 122" fill="none" stroke="#c62828" stroke-width="2.4" stroke-dasharray="8 5"/>`);
  delen.push(`<text x="270" y="205" font-size="12" font-weight="bold" fill="#c62828" text-anchor="middle">δ</text>`);
  // Zijsteunen (steunplaten)
  delen.push(`<rect x="150" y="120" width="14" height="26" fill="#6d7883" stroke="#333" stroke-width="1.5"/>`);
  delen.push(`<rect x="376" y="120" width="14" height="26" fill="#6d7883" stroke="#333" stroke-width="1.5"/>`);
  // Aslijn en label
  delen.push(`<line x1="55" y1="76" x2="485" y2="76" stroke="${LIJN}" stroke-width="1" stroke-dasharray="4 5"/>`);
  delen.push(`<text x="270" y="34" font-size="13" font-weight="bold" fill="#6d4f2c" text-anchor="middle">M · Q · N</text>`);
  delen.push(`<text x="270" y="292" font-size="12" font-weight="bold" fill="#4a6572" text-anchor="middle">f_c · f_t · f_b · C_b</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BREEDTE}" height="${HOOGTE}" viewBox="0 0 ${BREEDTE} ${HOOGTE}">${delen.join("")}</svg>`;
}

/** 雙柱聯合基腳（found112 §4.1.2）：兩柱、聯合基腳板、線性基底壓力與兩柱間負彎矩 */
function twCombinedFooting() {
  const delen = [];
  // 背景與土層
  delen.push(`<rect x="0" y="0" width="${BREEDTE}" height="${HOOGTE}" fill="#ffffff"/>`);
  delen.push(`<rect x="0" y="212" width="${BREEDTE}" height="${HOOGTE - 212}" fill="${ZAND_BOVEN}"/>`);
  delen.push(`<rect x="0" y="248" width="${BREEDTE}" height="${HOOGTE - 248}" fill="${ZAND_ONDER}"/>`);
  delen.push(`<line x1="0" y1="212" x2="${BREEDTE}" y2="212" stroke="${LIJN}" stroke-width="1.6"/>`);
  delen.push(`<line x1="0" y1="248" x2="${BREEDTE}" y2="248" stroke="${LIJN}" stroke-width="1.6" stroke-dasharray="7 6"/>`);
  // 聯合基腳板（長向）與兩支柱
  delen.push(`<rect x="60" y="176" width="420" height="36" fill="${BETON.boven}" stroke="#5c6b80" stroke-width="2"/>`);
  delen.push(`<rect x="128" y="92" width="46" height="86" fill="${BETON.links}" stroke="#5c6b80" stroke-width="2"/>`);
  delen.push(`<rect x="366" y="92" width="46" height="86" fill="${BETON.rechts}" stroke="#5c6b80" stroke-width="2"/>`);
  // 基腳頂覆土
  delen.push(`<rect x="40" y="150" width="460" height="26" fill="${ZAND_BOVEN}" opacity="0.8"/>`);
  // 柱載重向下
  delen.push(pijl(151, 20, 88, TURKOOIS, 9, 1));
  delen.push(pijl(389, 20, 88, TURKOOIS, 9, 1));
  // 基底壓力（線性分布：左端大、右端小）
  for (let i = 0; i < 10; i++) {
    const x = 76 + i * 39;
    const len = 30 - i * 2.4;
    delen.push(pijl(x, 284, 284 - len, "#2e7d32", 6, -1));
  }
  delen.push(`<text x="270" y="304" font-size="11" font-weight="bold" fill="#2e7d32" text-anchor="middle">w(x) = w0 + k·x</text>`);
  // 兩柱間負彎矩示意（頂層受拉）
  delen.push(`<path d="M 174 158 Q 270 122 366 158" fill="none" stroke="#c62828" stroke-width="2.4" stroke-dasharray="8 5"/>`);
  delen.push(`<text x="270" y="112" font-size="12" font-weight="bold" fill="#c62828" text-anchor="middle">M⁻</text>`);
  // 剪力與彎矩標示
  delen.push(`<text x="270" y="62" font-size="12" font-weight="bold" fill="#4a6572" text-anchor="middle">V · M</text>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${BREEDTE}" height="${HOOGTE}" viewBox="0 0 ${BREEDTE} ${HOOGTE}">${delen.join("")}</svg>`;
}

const BEELDEN = {
  "tw-pile-foundation": twPileFoundation,
  "tw-bridge-seismic": twBridgeSeismic,
  "tw-wood-member": twWoodMember,
  "tw-combined-footing": twCombinedFooting,
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
