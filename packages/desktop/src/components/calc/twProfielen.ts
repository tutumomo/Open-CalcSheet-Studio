/**
 * 台灣常用結構型鋼規格表 — 依據 CNS 7110 / CNS 2473 / CNS 2947 / steel99。
 *
 * 包含台灣建築與土木結構最常用的熱軋 H 型鋼（寬翼緣、中翼緣、窄翼緣）、
 * 方形鋼管（Box）、槽鋼（Channel）及等邊角鋼（Equal Angle），
 * 以及常用結構鋼材等級（SS400、SM400、SM490、SN400B、SN490B）。
 */

export interface TwStaalKwaliteit {
  naam: string;
  /** 規定降伏強度（MPa = N/mm²，CNS 2473 / CNS 2947） */
  fy: number;
  /** 規定抗拉強度（MPa = N/mm²，CNS 2473 / CNS 2947） */
  fu: number;
  /** 彈性模數（MPa = N/mm²，steel99 鋼材統一採用 E = 200,000 MPa [200 GPa]） */
  E: number;
  /** 剪力模數（MPa = N/mm²，G = 77,000 ~ 79,000 MPa，steel99 取 79,000 MPa） */
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
};

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
  // ── 正方形/寬翼緣 H 型鋼 ──
  [1,  "RH 100x100x6x8",       100, 100, 6,   8,   8,  21.9,   383,    76.5,   85.5,  4.18,  134,    26.7,   40.6,  2.47,  4.5,   2.7,   17.2],
  [2,  "RH 125x125x6.5x9",     125, 125, 6.5, 9,   8,  30.3,   847,   136.0,  152.0,  5.29,  293,    46.9,   71.5,  3.11,  8.0,   9.6,   23.8],
  [3,  "RH 150x150x7x10",      150, 150, 7,  10,   8,  40.1,  1640,   219.0,  245.0,  6.39,  563,    75.1,  115.0,  3.75, 13.7,  26.1,   31.5],
  [4,  "RH 175x175x7.5x11",    175, 175, 7.5,11,  11,  51.2,  2880,   330.0,  368.0,  7.50,  984,   112.0,  171.0,  4.38, 21.0,  62.0,   40.2],
  [5,  "RH 200x200x8x12",      200, 200, 8,  12,  11,  63.5,  4720,   472.0,  524.0,  8.62, 1600,   160.0,  244.0,  5.02, 30.5, 131.0,   49.9],
  [6,  "RH 250x250x9x14",      250, 250, 9,  14,  12,  92.2, 10800,   864.0,  963.0, 10.80, 3650,   292.0,  445.0,  6.29, 60.1, 467.0,   72.4],
  [7,  "RH 300x300x10x15",     300, 300, 10, 15,  13, 119.8, 20400,  1360.0, 1510.0, 13.10, 6750,   450.0,  686.0,  7.51, 91.0,1230.0,   94.0],
  [8,  "RH 350x350x12x19",     350, 350, 12, 19,  13, 173.9, 40300,  2300.0, 2580.0, 15.20,13600,   776.0, 1180.0,  8.84,204.0,3440.0,  137.0],
  [9,  "RH 400x400x13x21",     400, 400, 13, 21,  18, 218.7, 66600,  3330.0, 3730.0, 17.50,22400,  1120.0, 1710.0, 10.10,323.0,7410.0,  172.0],

  // ── 窄/中翼緣 H 型鋼（梁斷面） ──
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

export const TW_PROFIEL_KOP = "'台灣常用H型鋼斷面表（CNS 7110）:";

/**
 * 產生計算語言中的 H 型鋼矩陣字串：
 * id | h (mm) | b (mm) | tw (mm) | tf (mm) | A (cm²) | Ix (cm⁴) | Wx (cm³) | Zx (cm³) | ix (cm) | Iy (cm⁴) | Wy (cm³) | Zy (cm³) | iy (cm) | gewicht (kg/m)
 */
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
    gekozen.map((r) => String(r[0])),   // id
    gekozen.map((r) => String(r[2])),   // h
    gekozen.map((r) => String(r[3])),   // b
    gekozen.map((r) => String(r[4])),   // tw
    gekozen.map((r) => String(r[5])),   // tf
    gekozen.map((r) => String(r[7])),   // A
    gekozen.map((r) => String(r[8])),   // Ix
    gekozen.map((r) => String(r[9])),   // Wx
    gekozen.map((r) => String(r[10])),  // Zx
    gekozen.map((r) => String(r[11])),  // ix
    gekozen.map((r) => String(r[12])),  // Iy
    gekozen.map((r) => String(r[13])),  // Wy
    gekozen.map((r) => String(r[14])),  // Zy
    gekozen.map((r) => String(r[15])),  // iy
    gekozen.map((r) => String(r[18])),  // gewicht
  ];

  const uitleg = "id | h (mm) | b (mm) | tw (mm) | tf (mm) | A (cm²) | Ix (cm⁴) | Wx (cm³) | Zx (cm³) | ix (cm) | Iy (cm⁴) | Wy (cm³) | Zy (cm³) | iy (cm) | gewicht (kg/m)";
  return `${TW_PROFIEL_KOP} ${uitleg}\n${matrixNaam} = [${kolommen.map((k) => k.join("; ")).join(" |")}]`;
}

/**
 * 產生自型鋼矩陣查表的計算語言算式：
 */
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
