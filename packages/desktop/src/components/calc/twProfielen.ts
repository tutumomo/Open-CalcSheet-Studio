/**
 * 台灣常用結構型鋼規格表
 *
 * 尺度與性質標準依據：
 *   - 熱軋 H 型鋼、槽鋼、等邊/不等邊角鋼：CNS 1490（熱軋型鋼之形狀、尺度、質量及其許可差）
 *   - 結構用矩形/方形鋼管：CNS 7141（一般結構用矩形碳鋼鋼管）
 *   - 結構用圓形鋼管：CNS 4435（一般結構用碳鋼鋼管）
 *   - 鋼材材質：CNS 2473（SS）/ CNS 2947（SM）/ CNS 13812（SN）/ CNS 7141（STKR）/ CNS 4435（STK）
 *   - 設計規範：內政部《鋼構造建築物鋼結構設計技術規範》（steel99）
 *
 * 來源等級（詳見 docs/tw/規範來源.md §5.11）：
 *   - H 型鋼、槽鋼、角鋼：斷面性質為手冊值，已由 scripts/check-tw-profielen.mjs 以 i = √(I/A)、W = I/(h/2)、
 *     質量 = 0.785·A 做內部自洽檢查；**尚未逐列對 CNS 1490 官方表**，不得視為 A 級已驗證資料。
 *   - 方矩形鋼管、圓形鋼管：僅名義尺寸（h、b、t／D、t）為手冊值；斷面性質由名義尺寸以幾何閉合式程式產生
 *     （方管外角半徑 2t、內角半徑 t），非逐列取自 CNS 7141／CNS 4435。
 */

export interface TwStaalKwaliteit {
  naam: string;
  /** 規定降伏強度（MPa = N/mm²，CNS 2473 / CNS 2947 / CNS 7141） */
  fy: number;
  /** 規定抗拉強度（MPa = N/mm²） */
  fu: number;
  /** 彈性模數（MPa = N/mm²，steel99 鋼材統一採用 E = 200,000 MPa） */
  E: number;
  /** 剪力模數（MPa = N/mm²，steel99 取 79,000 MPa） */
  G: number;
  /** 是否為耐震建築結構用鋼（SN級） */
  sn: boolean;
  /** 規範出處 */
  bron: string;
  toelichting?: string;
}

export const TW_STAAL_KWALITEITEN: Record<string, TwStaalKwaliteit> = {
  SS400: { naam: "SS400", fy: 245, fu: 400, E: 200000, G: 79000, sn: false, bron: "CNS 2473、steel99", toelichting: "一般結構用軋鋼料（板厚 <= 16mm 取 245 MPa）" },
  SM400: { naam: "SM400", fy: 245, fu: 400, E: 200000, G: 79000, sn: false, bron: "CNS 2947、steel99", toelichting: "銲接結構用鋼" },
  SM490: { naam: "SM490", fy: 325, fu: 490, E: 200000, G: 79000, sn: false, bron: "CNS 2947、steel99", toelichting: "高強度銲接結構用鋼（板厚 <= 16mm 取 325 MPa）" },
  SN400B: { naam: "SN400B", fy: 245, fu: 400, E: 200000, G: 79000, sn: true, bron: "CNS 13812、steel99", toelichting: "耐震建築結構用鋼材" },
  SN490B: { naam: "SN490B", fy: 325, fu: 490, E: 200000, G: 79000, sn: true, bron: "CNS 13812、steel99", toelichting: "高強耐震建築結構用鋼材" },
  STKR400: { naam: "STKR400", fy: 245, fu: 400, E: 200000, G: 79000, sn: false, bron: "CNS 7141、steel99", toelichting: "一般結構用矩形鋼管" },
  STKR490: { naam: "STKR490", fy: 325, fu: 490, E: 200000, G: 79000, sn: false, bron: "CNS 7141、steel99", toelichting: "高強度結構用矩形鋼管" },
  STK400: { naam: "STK400", fy: 235, fu: 400, E: 200000, G: 79000, sn: false, bron: "CNS 4435、steel99", toelichting: "一般結構用圓形鋼管" },
  STK490: { naam: "STK490", fy: 315, fu: 490, E: 200000, G: 79000, sn: false, bron: "CNS 4435、steel99", toelichting: "高強度一般結構用圓形鋼管" },
};

// ── 1. 熱軋 H 型鋼（CNS 1490）──────────────────────────────────────

/**
 * H型鋼單列資料：
 * id, 名稱 | h, b, tw, tf, r (mm) | A (cm²) | Ix (cm⁴), Wx (cm³), Zx (cm³), ix (cm) | Iy (cm⁴), Wy (cm³), Zy (cm³), iy (cm) | It (cm⁴), Iw (10³ cm⁶) | 單位重 (kg/m)
 */
export type TwHRegel = readonly [
  id: number, naam: string,
  h: number, b: number, tw: number, tf: number, r: number, A: number,
  Ix: number, Wx: number, Zx: number, ix: number,
  Iy: number, Wy: number, Zy: number, iy: number,
  It: number, Iw: number, gewicht: number,
];

export const TW_H_TABEL: readonly TwHRegel[] = [
  // 正方形/寬翼緣 H 型鋼
  [1,  "RH 100x100x6x8",       100, 100, 6,   8,   8,  21.9,   383,    76.5,   85.5,  4.18,  134,    26.7,   40.6,  2.47,  4.5,   2.7,   17.2],
  [2,  "RH 125x125x6.5x9",     125, 125, 6.5, 9,   8,  30.3,   847,   136.0,  152.0,  5.29,  293,    46.9,   71.5,  3.11,  8.0,   9.6,   23.8],
  [3,  "RH 150x150x7x10",      150, 150, 7,  10,   8,  40.1,  1640,   219.0,  245.0,  6.39,  563,    75.1,  115.0,  3.75, 13.7,  26.1,   31.5],
  [4,  "RH 175x175x7.5x11",    175, 175, 7.5,11,  11,  51.2,  2880,   330.0,  368.0,  7.50,  984,   112.0,  171.0,  4.38, 21.0,  62.0,   40.2],
  [5,  "RH 200x200x8x12",      200, 200, 8,  12,  11,  63.5,  4720,   472.0,  524.0,  8.62, 1600,   160.0,  244.0,  5.02, 30.5, 131.0,   49.9],
  [6,  "RH 250x250x9x14",      250, 250, 9,  14,  12,  92.2, 10800,   864.0,  963.0, 10.80, 3650,   292.0,  445.0,  6.29, 60.1, 467.0,   72.4],
  [7,  "RH 300x300x10x15",     300, 300, 10, 15,  13, 119.8, 20400,  1360.0, 1510.0, 13.10, 6750,   450.0,  686.0,  7.51, 91.0,1230.0,   94.0],
  [8,  "RH 350x350x12x19",     350, 350, 12, 19,  13, 173.9, 40300,  2300.0, 2580.0, 15.20,13600,   776.0, 1180.0,  8.84,204.0,3440.0,  137.0],
  [9,  "RH 400x400x13x21",     400, 400, 13, 21,  18, 218.7, 66600,  3330.0, 3730.0, 17.50,22400,  1120.0, 1710.0, 10.10,323.0,7410.0,  172.0],

  // 窄/中翼緣 H 型鋼（梁斷面）
  [10, "RH 200x100x5.5x8",     200, 100, 5.5, 8,   8,  27.2,  1840,   184.0,  209.0,  8.23,  134,    26.8,   41.4,  2.22,  5.7,  11.4,   21.3],
  [11, "RH 250x125x6x9",       250, 125, 6,   9,   8,  37.7,  4050,   324.0,  368.0, 10.40,  294,    47.0,   72.6,  2.79,  9.7,  38.4,   29.6],
  [12, "RH 300x150x6.5x9",     300, 150, 6.5, 9,  11,  46.8,  7210,   481.0,  544.0, 12.40,  508,    67.7,  105.0,  3.29, 13.0,  95.7,   36.7],
  [13, "RH 350x175x7x11",      350, 175, 7,  11,  11,  63.1, 13600,   777.0,  876.0, 14.70,  984,   112.0,  174.0,  3.95, 23.3, 252.0,   49.6],
  [14, "RH 400x200x8x13",      400, 200, 8,  13,  13,  84.1, 23700,  1190.0, 1330.0, 16.80, 1740,   174.0,  269.0,  4.54, 43.1, 581.0,   66.0],
  [15, "RH 450x200x9x14",      450, 200, 9,  14,  13,  96.8, 33500,  1490.0, 1680.0, 18.60, 1870,   187.0,  290.0,  4.40, 59.2, 792.0,   76.0],
  [16, "RH 500x200x10x16",     500, 200, 10, 16,  13, 114.2, 47800,  1910.0, 2170.0, 20.50, 2140,   214.0,  334.0,  4.33, 85.9,1140.0,   89.6],
  [17, "RH 600x200x11x17",     600, 200, 11, 17,  13, 134.4, 77600,  2590.0, 2980.0, 24.00, 2280,   228.0,  359.0,  4.12,118.0,1720.0,  106.0],
  [18, "RH 700x300x13x24",     700, 300, 13, 24,  18, 235.5,201000,  5760.0, 6490.0, 29.30,10800,   722.0, 1120.0,  6.79,380.0,11100.0, 185.0],
  [19, "RH 800x300x14x26",     800, 300, 14, 26,  18, 267.4,292000,  7290.0, 8260.0, 33.00,11700,   781.0, 1220.0,  6.62,510.0,15700.0, 210.0],
  [20, "RH 900x300x16x28",     900, 300, 16, 28,  18, 309.8,411000,  9140.0,10500.0, 36.40,12600,   843.0, 1330.0,  6.39,701.0,21400.0, 243.0],
];

export interface TwProfielGrootheid {
  id: number;
  naam: string;
  h: number;
  b: number;
  tw: number;
  tf: number;
  r: number;
  A: number;
  Ix: number;
  Wx: number;
  Zx: number;
  ix: number;
  Iy: number;
  Wy: number;
  Zy: number;
  iy: number;
  It: number;
  Iw: number;
  gewicht: number;
}

export const TW_PROFIELEN: readonly TwProfielGrootheid[] = TW_H_TABEL.map((r) => ({
  id: r[0],
  naam: r[1],
  h: r[2],
  b: r[3],
  tw: r[4],
  tf: r[5],
  r: r[6],
  A: r[7],
  Ix: r[8],
  Wx: r[9],
  Zx: r[10],
  ix: r[11],
  Iy: r[12],
  Wy: r[13],
  Zy: r[14],
  iy: r[15],
  It: r[16],
  Iw: r[17],
  gewicht: r[18],
}));

export const TW_PROFIEL_KOP = "'台灣常用H型鋼斷面表（CNS 1490）:";

export function twProfielMatrix(opties: { naam?: string; ids?: readonly number[] } = {}): string {
  const matrixNaam = opties.naam ?? "tw_sections";
  const gekozen = opties.ids
    ? opties.ids.map((id) => {
        const r = TW_H_TABEL.find((x) => x[0] === id);
        if (!r) throw new Error(`twProfielen: unknown id ${id}`);
        return r;
      })
    : TW_H_TABEL;

  const kolommen = [
    gekozen.map((r) => String(r[0])),
    gekozen.map((r) => String(r[2])),
    gekozen.map((r) => String(r[3])),
    gekozen.map((r) => String(r[4])),
    gekozen.map((r) => String(r[5])),
    gekozen.map((r) => String(r[7])),
    gekozen.map((r) => String(r[8])),
    gekozen.map((r) => String(r[9])),
    gekozen.map((r) => String(r[10])),
    gekozen.map((r) => String(r[11])),
    gekozen.map((r) => String(r[12])),
    gekozen.map((r) => String(r[13])),
    gekozen.map((r) => String(r[14])),
    gekozen.map((r) => String(r[15])),
    gekozen.map((r) => String(r[18])),
  ];

  const uitleg = "id | h (mm) | b (mm) | tw (mm) | tf (mm) | A (cm²) | Ix (cm⁴) | Wx (cm³) | Zx (cm³) | ix (cm) | Iy (cm⁴) | Wy (cm³) | Zy (cm³) | iy (cm) | gewicht (kg/m)";
  return `${TW_PROFIEL_KOP} ${uitleg}\n${matrixNaam} = [${kolommen.map((k) => k.join("; ")).join(" |")}]`;
}

export function twProfielOpzoeking(sleutel: string, matrixNaam = "tw_sections"): string {
  return [
    `h = hlookup(${matrixNaam}; ${sleutel}; 1; 2)*mm`,
    `b = hlookup(${matrixNaam}; ${sleutel}; 1; 3)*mm`,
    `t_w = hlookup(${matrixNaam}; ${sleutel}; 1; 4)*mm`,
    `t_f = hlookup(${matrixNaam}; ${sleutel}; 1; 5)*mm`,
    `A = hlookup(${matrixNaam}; ${sleutel}; 1; 6)*cm^2`,
    `I_x = hlookup(${matrixNaam}; ${sleutel}; 1; 7)*cm^4`,
    `W_x = hlookup(${matrixNaam}; ${sleutel}; 1; 8)*cm^3`,
    `Z_x = hlookup(${matrixNaam}; ${sleutel}; 1; 9)*cm^3`,
    `i_x = hlookup(${matrixNaam}; ${sleutel}; 1; 10)*cm`,
    `I_y = hlookup(${matrixNaam}; ${sleutel}; 1; 11)*cm^4`,
    `W_y = hlookup(${matrixNaam}; ${sleutel}; 1; 12)*cm^3`,
    `Z_y = hlookup(${matrixNaam}; ${sleutel}; 1; 13)*cm^3`,
    `i_y = hlookup(${matrixNaam}; ${sleutel}; 1; 14)*cm`,
    `w = hlookup(${matrixNaam}; ${sleutel}; 1; 15)*(kg/m)`,
  ].join("\n");
}

// ── 2. 熱軋槽鋼（CNS 1490）─────────────────────────────────────────

/**
 * 槽鋼單列資料：
 * [id, naam, h, b, tw, tf, r, A, Ix, Wx, ix, Iy, Wy, iy, gewicht]
 */
export type TwCRegel = readonly [
  id: number, naam: string,
  h: number, b: number, tw: number, tf: number, r: number, A: number,
  Ix: number, Wx: number, ix: number,
  Iy: number, Wy: number, iy: number,
  gewicht: number,
];

export const TW_C_TABEL: readonly TwCRegel[] = [
  [1,  "C 75x40x5x7",       75,  40,  5.0,  7.0,  8.0,   8.818,    75.3,  20.1,  2.92,   12.2,   4.47,  1.18,   6.92],
  [2,  "C 100x50x5x7.5",   100,  50,  5.0,  7.5,  8.0,  11.920,   188.0,  37.6,  3.97,   26.3,   7.52,  1.49,   9.36],
  [3,  "C 125x65x6x8",     125,  65,  6.0,  8.0,  8.5,  17.110,   424.0,  67.8,  4.98,   61.8,  13.40,  1.90,  13.40],
  [4,  "C 150x75x6.5x10",  150,  75,  6.5, 10.0, 10.0,  23.710,   861.0, 115.0,  6.03,  117.0,  22.40,  2.22,  18.60],
  [5,  "C 150x75x9x12.5",  150,  75,  9.0, 12.5, 10.0,  30.590,  1050.0, 140.0,  5.86,  147.0,  28.30,  2.19,  24.00],
  [6,  "C 180x75x7x10.5",  180,  75,  7.0, 10.5, 11.0,  27.200,  1380.0, 153.0,  7.12,  131.0,  24.30,  2.19,  21.40],
  [7,  "C 200x80x7.5x11",  200,  80,  7.5, 11.0, 11.0,  31.330,  1950.0, 195.0,  7.89,  168.0,  29.90,  2.32,  24.60],
  [8,  "C 200x90x8x13.5",  200,  90,  8.0, 13.5, 12.0,  38.650,  2490.0, 249.0,  8.02,  277.0,  44.20,  2.68,  30.30],
  [9,  "C 250x90x9x13",    250,  90,  9.0, 13.0, 12.0,  44.070,  4180.0, 334.0,  9.74,  294.0,  45.10,  2.58,  34.60],
  [10, "C 300x90x9x13",    300,  90,  9.0, 13.0, 12.0,  48.570,  6440.0, 429.0, 11.50,  309.0,  46.20,  2.52,  38.10],
  [11, "C 380x100x10.5x16",380, 100, 10.5, 16.0, 13.0,  69.390, 14500.0, 763.0, 14.50,  535.0,  72.80,  2.78,  54.50],
];

export const TW_C_KOP = "'台灣常用槽鋼斷面表（CNS 1490）:";

export function twChannelMatrix(opties: { naam?: string; ids?: readonly number[] } = {}): string {
  const matrixNaam = opties.naam ?? "tw_channels";
  const gekozen = opties.ids
    ? opties.ids.map((id) => {
        const r = TW_C_TABEL.find((x) => x[0] === id);
        if (!r) throw new Error(`twChannelMatrix: unknown id ${id}`);
        return r;
      })
    : TW_C_TABEL;

  const kolommen = [
    gekozen.map((r) => String(r[0])),
    gekozen.map((r) => String(r[2])),
    gekozen.map((r) => String(r[3])),
    gekozen.map((r) => String(r[4])),
    gekozen.map((r) => String(r[5])),
    gekozen.map((r) => String(r[7])),
    gekozen.map((r) => String(r[8])),
    gekozen.map((r) => String(r[9])),
    gekozen.map((r) => String(r[10])),
    gekozen.map((r) => String(r[11])),
    gekozen.map((r) => String(r[12])),
    gekozen.map((r) => String(r[13])),
    gekozen.map((r) => String(r[14])),
  ];

  const uitleg = "id | h (mm) | b (mm) | tw (mm) | tf (mm) | A (cm²) | Ix (cm⁴) | Wx (cm³) | ix (cm) | Iy (cm⁴) | Wy (cm³) | iy (cm) | gewicht (kg/m)";
  return `${TW_C_KOP} ${uitleg}\n${matrixNaam} = [${kolommen.map((k) => k.join("; ")).join(" |")}]`;
}

export function twChannelOpzoeking(sleutel: string, matrixNaam = "tw_channels"): string {
  return [
    `h = hlookup(${matrixNaam}; ${sleutel}; 1; 2)*mm`,
    `b = hlookup(${matrixNaam}; ${sleutel}; 1; 3)*mm`,
    `t_w = hlookup(${matrixNaam}; ${sleutel}; 1; 4)*mm`,
    `t_f = hlookup(${matrixNaam}; ${sleutel}; 1; 5)*mm`,
    `A = hlookup(${matrixNaam}; ${sleutel}; 1; 6)*cm^2`,
    `I_x = hlookup(${matrixNaam}; ${sleutel}; 1; 7)*cm^4`,
    `W_x = hlookup(${matrixNaam}; ${sleutel}; 1; 8)*cm^3`,
    `i_x = hlookup(${matrixNaam}; ${sleutel}; 1; 9)*cm`,
    `I_y = hlookup(${matrixNaam}; ${sleutel}; 1; 10)*cm^4`,
    `W_y = hlookup(${matrixNaam}; ${sleutel}; 1; 11)*cm^3`,
    `i_y = hlookup(${matrixNaam}; ${sleutel}; 1; 12)*cm`,
    `w = hlookup(${matrixNaam}; ${sleutel}; 1; 13)*(kg/m)`,
  ].join("\n");
}

// ── 3. 熱軋等邊角鋼（CNS 1490）─────────────────────────────────────

/**
 * 等邊角鋼單列資料：
 * [id, naam, b, t, r1, A, Ix, Wx, ix, Iy, Wy, iy, gewicht]
 */
export type TwLEqRegel = readonly [
  id: number, naam: string,
  b: number, t: number, r1: number, A: number,
  Ix: number, Wx: number, ix: number,
  Iy: number, Wy: number, iy: number,
  gewicht: number,
];

export const TW_L_EQ_TABEL: readonly TwLEqRegel[] = [
  [1,  "L 50x50x4",     50,  4.0,  6.5,   3.892,    9.20,   2.57,  1.54,    9.20,   2.57,  1.54,   3.06],
  [2,  "L 50x50x6",     50,  6.0,  6.5,   5.644,   12.80,   3.68,  1.51,   12.80,   3.68,  1.51,   4.43],
  [3,  "L 65x65x6",     65,  6.0,  8.5,   7.527,   29.40,   6.30,  1.98,   29.40,   6.30,  1.98,   5.91],
  [4,  "L 75x75x6",     75,  6.0,  9.0,   8.727,   46.10,   8.47,  2.30,   46.10,   8.47,  2.30,   6.85],
  [5,  "L 75x75x9",     75,  9.0,  9.0,  12.690,   64.70,  12.20,  2.26,   64.70,  12.20,  2.26,   9.96],
  [6,  "L 90x90x7",     90,  7.0, 10.0,  12.220,   93.50,  14.30,  2.77,   93.50,  14.30,  2.77,   9.59],
  [7,  "L 90x90x10",    90, 10.0, 10.0,  17.000,  126.00,  19.70,  2.72,  126.00,  19.70,  2.72,  13.30],
  [8,  "L 100x100x7",  100,  7.0, 10.0,  13.620,  130.00,  17.70,  3.09,  130.00,  17.70,  3.09,  10.70],
  [9,  "L 100x100x10", 100, 10.0, 10.0,  19.000,  177.00,  24.70,  3.05,  177.00,  24.70,  3.05,  14.90],
  [10, "L 100x100x13", 100, 13.0, 10.0,  24.190,  220.00,  31.20,  3.02,  220.00,  31.20,  3.02,  19.00],
  [11, "L 125x125x9",  125,  9.0, 11.0,  21.800,  324.00,  35.90,  3.86,  324.00,  35.90,  3.86,  17.10],
  [12, "L 125x125x12", 125, 12.0, 11.0,  28.560,  417.00,  46.90,  3.82,  417.00,  46.90,  3.82,  22.40],
  [13, "L 150x150x12", 150, 12.0, 13.0,  34.770,  737.00,  68.90,  4.60,  737.00,  68.90,  4.60,  27.30],
  [14, "L 150x150x15", 150, 15.0, 13.0,  42.750,  892.00,  84.40,  4.57,  892.00,  84.40,  4.57,  33.60],
  [15, "L 200x200x15", 200, 15.0, 17.0,  57.750, 2180.00, 149.00,  6.15, 2180.00, 149.00,  6.15,  45.30],
  [16, "L 200x200x20", 200, 20.0, 17.0,  76.000, 2810.00, 196.00,  6.08, 2810.00, 196.00,  6.08,  59.70],
];

export const TW_L_EQ_KOP = "'台灣常用等邊角鋼斷面表（CNS 1490）:";

export function twAngleMatrix(opties: { naam?: string; ids?: readonly number[] } = {}): string {
  const matrixNaam = opties.naam ?? "tw_angles";
  const gekozen = opties.ids
    ? opties.ids.map((id) => {
        const r = TW_L_EQ_TABEL.find((x) => x[0] === id);
        if (!r) throw new Error(`twAngleMatrix: unknown id ${id}`);
        return r;
      })
    : TW_L_EQ_TABEL;

  const kolommen = [
    gekozen.map((r) => String(r[0])),
    gekozen.map((r) => String(r[2])),
    gekozen.map((r) => String(r[3])),
    gekozen.map((r) => String(r[5])),
    gekozen.map((r) => String(r[6])),
    gekozen.map((r) => String(r[7])),
    gekozen.map((r) => String(r[8])),
    gekozen.map((r) => String(r[12])),
  ];

  const uitleg = "id | b (mm) | t (mm) | A (cm²) | Ix (cm⁴) | Wx (cm³) | ix (cm) | gewicht (kg/m)";
  return `${TW_L_EQ_KOP} ${uitleg}\n${matrixNaam} = [${kolommen.map((k) => k.join("; ")).join(" |")}]`;
}

export function twAngleOpzoeking(sleutel: string, matrixNaam = "tw_angles"): string {
  return [
    `b = hlookup(${matrixNaam}; ${sleutel}; 1; 2)*mm`,
    `t = hlookup(${matrixNaam}; ${sleutel}; 1; 3)*mm`,
    `A = hlookup(${matrixNaam}; ${sleutel}; 1; 4)*cm^2`,
    `I_x = hlookup(${matrixNaam}; ${sleutel}; 1; 5)*cm^4`,
    `W_x = hlookup(${matrixNaam}; ${sleutel}; 1; 6)*cm^3`,
    `i_x = hlookup(${matrixNaam}; ${sleutel}; 1; 7)*cm`,
    `I_y = I_x`,
    `W_y = W_x`,
    `i_y = i_x`,
    `w = hlookup(${matrixNaam}; ${sleutel}; 1; 8)*(kg/m)`,
  ].join("\n");
}

// ── 4. 熱軋不等邊角鋼（CNS 1490）───────────────────────────────────

/**
 * 不等邊角鋼單列資料：
 * [id, naam, B, b, t, r1, A, Ix, Wx, ix, Iy, Wy, iy, gewicht]
 */
export type TwLUeqRegel = readonly [
  id: number, naam: string,
  B: number, b: number, t: number, r1: number, A: number,
  Ix: number, Wx: number, ix: number,
  Iy: number, Wy: number, iy: number,
  gewicht: number,
];

export const TW_L_UEQ_TABEL: readonly TwLUeqRegel[] = [
  [1,  "L 75x50x6",    75,  50,  6.0,  8.5,   7.227,   40.7,   7.49, 2.37,   15.1,   3.99, 1.45,   5.67],
  [2,  "L 75x50x9",    75,  50,  9.0,  8.5,  10.440,   56.9,  10.70, 2.33,   20.9,   5.67, 1.41,   8.20],
  [3,  "L 100x75x7",  100,  75,  7.0, 10.0,  11.870,  120.0,  16.50, 3.18,   58.7,  10.40, 2.22,   9.32],
  [4,  "L 100x75x10", 100,  75, 10.0, 10.0,  16.500,  162.0,  22.80, 3.14,   79.1,  14.30, 2.19,  13.00],
  [5,  "L 125x75x7",  125,  75,  7.0, 10.0,  13.620,  217.0,  24.50, 3.99,   63.8,  11.00, 2.16,  10.70],
  [6,  "L 125x75x10", 125,  75, 10.0, 10.0,  19.000,  297.0,  34.20, 3.95,   86.3,  15.20, 2.13,  14.90],
  [7,  "L 150x90x9",  150,  90,  9.0, 12.0,  20.900,  484.0,  46.60, 4.81,  141.0,  20.20, 2.60,  16.40],
  [8,  "L 150x90x12", 150,  90, 12.0, 12.0,  27.360,  621.0,  60.70, 4.76,  179.0,  26.00, 2.56,  21.50],
  [9,  "L 150x100x12",150, 100, 12.0, 12.0,  28.560,  647.0,  61.80, 4.76,  246.0,  32.40, 2.94,  22.40],
  [10, "L 200x125x15",200, 125, 15.0, 15.0,  46.500, 1900.0, 136.00, 6.39,  634.0,  62.80, 3.69,  36.50],
];

export const TW_L_UEQ_KOP = "'台灣常用不等邊角鋼斷面表（CNS 1490）:";

export function twUnequalAngleMatrix(opties: { naam?: string; ids?: readonly number[] } = {}): string {
  const matrixNaam = opties.naam ?? "tw_unequal_angles";
  const gekozen = opties.ids
    ? opties.ids.map((id) => {
        const r = TW_L_UEQ_TABEL.find((x) => x[0] === id);
        if (!r) throw new Error(`twUnequalAngleMatrix: unknown id ${id}`);
        return r;
      })
    : TW_L_UEQ_TABEL;

  const kolommen = [
    gekozen.map((r) => String(r[0])),
    gekozen.map((r) => String(r[2])),
    gekozen.map((r) => String(r[3])),
    gekozen.map((r) => String(r[4])),
    gekozen.map((r) => String(r[6])),
    gekozen.map((r) => String(r[7])),
    gekozen.map((r) => String(r[8])),
    gekozen.map((r) => String(r[9])),
    gekozen.map((r) => String(r[10])),
    gekozen.map((r) => String(r[11])),
    gekozen.map((r) => String(r[12])),
    gekozen.map((r) => String(r[13])),
  ];

  const uitleg = "id | B (mm) | b (mm) | t (mm) | A (cm²) | Ix (cm⁴) | Wx (cm³) | ix (cm) | Iy (cm⁴) | Wy (cm³) | iy (cm) | gewicht (kg/m)";
  return `${TW_L_UEQ_KOP} ${uitleg}\n${matrixNaam} = [${kolommen.map((k) => k.join("; ")).join(" |")}]`;
}

export function twUnequalAngleOpzoeking(sleutel: string, matrixNaam = "tw_unequal_angles"): string {
  return [
    `B = hlookup(${matrixNaam}; ${sleutel}; 1; 2)*mm`,
    `b = hlookup(${matrixNaam}; ${sleutel}; 1; 3)*mm`,
    `t = hlookup(${matrixNaam}; ${sleutel}; 1; 4)*mm`,
    `A = hlookup(${matrixNaam}; ${sleutel}; 1; 5)*cm^2`,
    `I_x = hlookup(${matrixNaam}; ${sleutel}; 1; 6)*cm^4`,
    `W_x = hlookup(${matrixNaam}; ${sleutel}; 1; 7)*cm^3`,
    `i_x = hlookup(${matrixNaam}; ${sleutel}; 1; 8)*cm`,
    `I_y = hlookup(${matrixNaam}; ${sleutel}; 1; 9)*cm^4`,
    `W_y = hlookup(${matrixNaam}; ${sleutel}; 1; 10)*cm^3`,
    `i_y = hlookup(${matrixNaam}; ${sleutel}; 1; 11)*cm`,
    `w = hlookup(${matrixNaam}; ${sleutel}; 1; 12)*(kg/m)`,
  ].join("\n");
}

// ── 5. 結構用方矩形鋼管（CNS 7141）─────────────────────────────────

/**
 * 方矩形鋼管單列資料：
 * [id, naam, h, b, t, A, Ix, Wx, Zx, ix, Iy, Wy, Zy, iy, gewicht]
 */
export type TwBoxRegel = readonly [
  id: number, naam: string,
  h: number, b: number, t: number, A: number,
  Ix: number, Wx: number, Zx: number, ix: number,
  Iy: number, Wy: number, Zy: number, iy: number,
  gewicht: number,
];

/**
 * 圓角矩形（外角半徑 r）的面積與慣性矩（mm 系），以矩形＋四個四分之一圓拆解；
 * 方矩形鋼管＝外輪廓減內輪廓（外角半徑 ro = 2t、內角半徑 ri = t，CNS 7141 冷成型管之常用假設）。
 */
function roundedRect(w: number, h: number, r: number) {
  const q = Math.PI * r * r / 4;                 // 四分之一圓面積
  const dc = 4 * r / (3 * Math.PI);              // 形心距圓心
  const iq = (Math.PI / 16 - 4 / (9 * Math.PI)) * r ** 4; // 形心軸慣性矩
  const A = (w - 2 * r) * h + 2 * r * (h - 2 * r) + 4 * q;
  const I = ((w - 2 * r) * h ** 3) / 12 + 2 * (r * (h - 2 * r) ** 3) / 12
    + 4 * (iq + q * (h / 2 - r + dc) ** 2);
  // 上半部一次矩（塑性模數 Z = 2 × 上半部面積 × 形心距）
  const Q = ((w - 2 * r) * h / 2) * (h / 4) + 2 * (r * (h - 2 * r) / 2) * ((h - 2 * r) / 4)
    + 2 * q * (h / 2 - r + dc);
  return { A, I, Z: 2 * Q };
}
const r2 = (x: number, n: number) => Number(x.toFixed(n));

/** 由名義 h×b×t 以幾何閉合式產生方矩形鋼管列 */
function boxRegel(id: number, h: number, b: number, t: number): TwBoxRegel {
  const ro = 2 * t, ri = t;
  const uit = roundedRect(b, h, ro), inn = roundedRect(b - 2 * t, h - 2 * t, ri);
  const uitY = roundedRect(h, b, ro), innY = roundedRect(h - 2 * t, b - 2 * t, ri);
  const A = (uit.A - inn.A) / 100;                       // cm²
  const Ix = (uit.I - inn.I) / 1e4, Iy = (uitY.I - innY.I) / 1e4;
  const Zx = (uit.Z - inn.Z) / 1e3, Zy = (uitY.Z - innY.Z) / 1e3;
  return [id, `BOX ${h}x${b}x${t}`, h, b, t, r2(A, 2), r2(Ix, 1), r2(Ix / (h / 20), 1), r2(Zx, 1), r2(Math.sqrt(Ix / A), 2),
    r2(Iy, 1), r2(Iy / (b / 20), 1), r2(Zy, 1), r2(Math.sqrt(Iy / A), 2), r2(A * 0.785, 2)];
}

/** 由名義 D×t 以閉合式產生圓形鋼管列 */
function pipeRegel(id: number, D: number, t: number): TwPipeRegel {
  const d = D - 2 * t;
  const A = Math.PI / 4 * (D ** 2 - d ** 2) / 100;
  const I = Math.PI / 64 * (D ** 4 - d ** 4) / 1e4;
  const Z = (D ** 3 - d ** 3) / 6 / 1e3;
  return [id, `PIPE ${D}x${t}`, D, t, r2(A, 2), r2(I, 1), r2(I / (D / 20), 1), r2(Z, 1), r2(Math.sqrt(I / A), 2), r2(A * 0.785, 2)];
}

/** 名義尺寸（h, b, t, mm）；斷面性質由 boxRegel() 閉合式產生，非逐列取自 CNS 7141 官方表 */
const TW_BOX_NOMINAAL: readonly (readonly [number, number, number])[] = [
  [100, 100, 3.2], [100, 100, 4.5], [125, 125, 4.5], [150, 150, 4.5], [150, 150, 6],
  [200, 200, 6], [200, 200, 9], [250, 250, 9], [250, 250, 12], [300, 300, 9],
  [300, 300, 12], [350, 350, 12], [400, 400, 12], [400, 400, 16],
];
export const TW_BOX_TABEL: readonly TwBoxRegel[] = TW_BOX_NOMINAAL.map(([h, bb, t], i) => boxRegel(i + 1, h, bb, t));

export const TW_BOX_KOP = "'台灣常用結構用矩形鋼管斷面表（CNS 7141）:";

export function twBoxMatrix(opties: { naam?: string; ids?: readonly number[] } = {}): string {
  const matrixNaam = opties.naam ?? "tw_boxes";
  const gekozen = opties.ids
    ? opties.ids.map((id) => {
        const r = TW_BOX_TABEL.find((x) => x[0] === id);
        if (!r) throw new Error(`twBoxMatrix: unknown id ${id}`);
        return r;
      })
    : TW_BOX_TABEL;

  const kolommen = [
    gekozen.map((r) => String(r[0])),
    gekozen.map((r) => String(r[2])),
    gekozen.map((r) => String(r[3])),
    gekozen.map((r) => String(r[4])),
    gekozen.map((r) => String(r[5])),
    gekozen.map((r) => String(r[6])),
    gekozen.map((r) => String(r[7])),
    gekozen.map((r) => String(r[8])),
    gekozen.map((r) => String(r[9])),
    gekozen.map((r) => String(r[10])),
    gekozen.map((r) => String(r[11])),
    gekozen.map((r) => String(r[12])),
    gekozen.map((r) => String(r[13])),
    gekozen.map((r) => String(r[14])),
  ];

  const uitleg = "id | h (mm) | b (mm) | t (mm) | A (cm²) | Ix (cm⁴) | Wx (cm³) | Zx (cm³) | ix (cm) | Iy (cm⁴) | Wy (cm³) | Zy (cm³) | iy (cm) | gewicht (kg/m)";
  return `${TW_BOX_KOP} ${uitleg}\n${matrixNaam} = [${kolommen.map((k) => k.join("; ")).join(" |")}]`;
}

export function twBoxOpzoeking(sleutel: string, matrixNaam = "tw_boxes"): string {
  return [
    `h = hlookup(${matrixNaam}; ${sleutel}; 1; 2)*mm`,
    `b = hlookup(${matrixNaam}; ${sleutel}; 1; 3)*mm`,
    `t = hlookup(${matrixNaam}; ${sleutel}; 1; 4)*mm`,
    `A = hlookup(${matrixNaam}; ${sleutel}; 1; 5)*cm^2`,
    `I_x = hlookup(${matrixNaam}; ${sleutel}; 1; 6)*cm^4`,
    `W_x = hlookup(${matrixNaam}; ${sleutel}; 1; 7)*cm^3`,
    `Z_x = hlookup(${matrixNaam}; ${sleutel}; 1; 8)*cm^3`,
    `i_x = hlookup(${matrixNaam}; ${sleutel}; 1; 9)*cm`,
    `I_y = hlookup(${matrixNaam}; ${sleutel}; 1; 10)*cm^4`,
    `W_y = hlookup(${matrixNaam}; ${sleutel}; 1; 11)*cm^3`,
    `Z_y = hlookup(${matrixNaam}; ${sleutel}; 1; 12)*cm^3`,
    `i_y = hlookup(${matrixNaam}; ${sleutel}; 1; 13)*cm`,
    `w = hlookup(${matrixNaam}; ${sleutel}; 1; 14)*(kg/m)`,
  ].join("\n");
}

// ── 6. 結構用圓形鋼管（CNS 4435）─────────────────────────────────

/**
 * 圓形鋼管單列資料：
 * [id, naam, D, t, A, I, W, Z, i, gewicht]
 */
export type TwPipeRegel = readonly [
  id: number, naam: string,
  D: number, t: number, A: number,
  I: number, W: number, Z: number, i: number,
  gewicht: number,
];

/** 名義尺寸（D, t, mm）；斷面性質由 pipeRegel() 閉合式產生，非逐列取自 CNS 4435 官方表 */
const TW_PIPE_NOMINAAL: readonly (readonly [number, number])[] = [
  [48.6, 3.2], [60.5, 3.2], [76.3, 3.2], [89.1, 3.2], [89.1, 4], [114.3, 4.5], [139.8, 4.5],
  [165.2, 4.5], [165.2, 6], [216.3, 6], [216.3, 8], [267.4, 6.6], [318.5, 7.9], [355.6, 9], [406.4, 9.5],
];
export const TW_PIPE_TABEL: readonly TwPipeRegel[] = TW_PIPE_NOMINAAL.map(([D, t], i) => pipeRegel(i + 1, D, t));

export const TW_PIPE_KOP = "'台灣常用結構用圓形鋼管規格表（CNS 4435）:";

export function twPipeMatrix(opties: { naam?: string; ids?: readonly number[] } = {}): string {
  const matrixNaam = opties.naam ?? "tw_pipes";
  const gekozen = opties.ids
    ? opties.ids.map((id) => {
        const r = TW_PIPE_TABEL.find((x) => x[0] === id);
        if (!r) throw new Error(`twPipeMatrix: unknown id ${id}`);
        return r;
      })
    : TW_PIPE_TABEL;

  const kolommen = [
    gekozen.map((r) => String(r[0])),
    gekozen.map((r) => String(r[2])),
    gekozen.map((r) => String(r[3])),
    gekozen.map((r) => String(r[4])),
    gekozen.map((r) => String(r[5])),
    gekozen.map((r) => String(r[6])),
    gekozen.map((r) => String(r[7])),
    gekozen.map((r) => String(r[8])),
    gekozen.map((r) => String(r[9])),
  ];

  const uitleg = "id | D (mm) | t (mm) | A (cm²) | I (cm⁴) | W (cm³) | Z (cm³) | i (cm) | gewicht (kg/m)";
  return `${TW_PIPE_KOP} ${uitleg}\n${matrixNaam} = [${kolommen.map((k) => k.join("; ")).join(" |")}]`;
}

export function twPipeOpzoeking(sleutel: string, matrixNaam = "tw_pipes"): string {
  return [
    `D = hlookup(${matrixNaam}; ${sleutel}; 1; 2)*mm`,
    `t = hlookup(${matrixNaam}; ${sleutel}; 1; 3)*mm`,
    `A = hlookup(${matrixNaam}; ${sleutel}; 1; 4)*cm^2`,
    `I_x = hlookup(${matrixNaam}; ${sleutel}; 1; 5)*cm^4`,
    `W_x = hlookup(${matrixNaam}; ${sleutel}; 1; 6)*cm^3`,
    `Z_x = hlookup(${matrixNaam}; ${sleutel}; 1; 7)*cm^3`,
    `i_x = hlookup(${matrixNaam}; ${sleutel}; 1; 8)*cm`,
    `I_y = I_x`,
    `W_y = W_x`,
    `Z_y = Z_x`,
    `i_y = i_x`,
    `w = hlookup(${matrixNaam}; ${sleutel}; 1; 9)*(kg/m)`,
  ].join("\n");
}
