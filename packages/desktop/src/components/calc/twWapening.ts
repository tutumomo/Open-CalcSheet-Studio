/**
 * 台灣鋼筋與混凝土規格資料庫 — 依據 CNS 560、結構混凝土設計規範（rc112）。
 *
 * 提供台灣工程界標準竹節鋼筋規格（D10 至 D36）、鋼筋等級（SD280、SD420 等）
 * 以及常用混凝土設計強度。
 */

export interface TwStaalKwaliteit {
  /** 等級名稱，例如 "SD280"、"SD420" */
  naam: string;
  /** 規定降伏強度（MPa = N/mm²，CNS 560:2018） */
  fy: number;
  /** 規定抗拉強度（MPa = N/mm²，CNS 560:2018） */
  fu: number;
  /** 彈性模數（MPa = N/mm²，依 rc112 第 20.2.2.2 節明訂 Es = 200,000 MPa [200 GPa]） */
  Es: number;
  /** 是否為耐震銲接級鋼筋（W級，符合 rc112 第 20.2.2.5 節規定） */
  seismisch: boolean;
  /** 規範出處與狀態 */
  bron: string;
  /** 備註 */
  toelichting?: string;
}

export const TW_STAALKWALITEITEN: Record<string, TwStaalKwaliteit> = {
  SD280: {
    naam: "SD280",
    fy: 280,
    fu: 420,
    Es: 200000,
    seismisch: false,
    bron: "CNS 560:2018、rc112 §20.2.2.2",
    toelichting: "常用於樓板、梁箍筋、小梁",
  },
  SD280W: {
    naam: "SD280W",
    fy: 280,
    fu: 420,
    Es: 200000,
    seismisch: true,
    bron: "CNS 560:2018、rc112 §20.2.2.5",
    toelichting: "耐震銲接級",
  },
  SD420: {
    naam: "SD420",
    fy: 420,
    fu: 620,
    Es: 200000,
    seismisch: false,
    bron: "CNS 560:2018、rc112 §20.2.2.2",
    toelichting: "常用於主要梁柱主筋",
  },
  SD420W: {
    naam: "SD420W",
    fy: 420,
    fu: 560,
    Es: 200000,
    seismisch: true,
    bron: "CNS 560:2018、rc112 §20.2.2.5",
    toelichting: "耐震銲接級，耐震構材主筋指定使用",
  },
};

export interface TwBetonKwaliteit {
  /** 標稱強度名稱，例如 "210 kgf/cm²" 或 "21 MPa" */
  naam: string;
  /** 規定抗壓強度 fc'（MPa = N/mm²） */
  fc_MPa: number;
  /** 規定抗壓強度 fc'（kgf/cm²） */
  fc_kgf: number;
  /** 混凝土彈性模數 Ec（MPa，常重混凝土依 rc112 式 19.2.2.1.b 為 Ec = 3750 * sqrt(fc' MPa)） */
  Ec_MPa: number;
  /** 規範出處 */
  bron: string;
}

export const TW_BETONKWALITEITEN: Record<string, TwBetonKwaliteit> = {
  C210: {
    naam: "210 kgf/cm² (20.6 MPa)",
    fc_MPa: 20.6,
    fc_kgf: 210,
    Ec_MPa: Math.round(3750 * Math.sqrt(20.6)),
    bron: "rc112 §19.2.2.1 式(19.2.2.1.b)",
  },
  C245: {
    naam: "245 kgf/cm² (24.0 MPa)",
    fc_MPa: 24.0,
    fc_kgf: 245,
    Ec_MPa: Math.round(3750 * Math.sqrt(24.0)),
    bron: "rc112 §19.2.2.1 式(19.2.2.1.b)",
  },
  C280: {
    naam: "280 kgf/cm² (27.5 MPa)",
    fc_MPa: 27.5,
    fc_kgf: 280,
    Ec_MPa: Math.round(3750 * Math.sqrt(27.5)),
    bron: "rc112 §19.2.2.1 式(19.2.2.1.b)",
  },
  C350: {
    naam: "350 kgf/cm² (34.3 MPa)",
    fc_MPa: 34.3,
    fc_kgf: 350,
    Ec_MPa: Math.round(3750 * Math.sqrt(34.3)),
    bron: "rc112 §19.2.2.1 式(19.2.2.1.b)",
  },
  C420: {
    naam: "420 kgf/cm² (41.2 MPa)",
    fc_MPa: 41.2,
    fc_kgf: 420,
    Ec_MPa: Math.round(3750 * Math.sqrt(41.2)),
    bron: "rc112 §19.2.2.1 式(19.2.2.1.b)",
  },
};

/**
 * 台灣標準竹節鋼筋規格（CNS 560）。
 * id, 號數, 公稱直徑 db (mm), 公稱截面積 Ab (mm²), 公稱周長 (mm), 單位重 (kg/m)
 */
export type TwWapeningRegel = readonly [
  id: number,
  naam: string,
  db: number,
  Ab: number,
  omtrek: number,
  gewicht: number,
];

export const TW_WAPENING_TABEL: readonly TwWapeningRegel[] = [
  [1, "D10", 9.53, 71.33, 30.0, 0.560],
  [2, "D13", 12.7, 126.7, 40.0, 0.994],
  [3, "D16", 15.9, 198.6, 50.0, 1.560],
  [4, "D19", 19.1, 286.5, 60.0, 2.250],
  [5, "D22", 22.2, 387.1, 70.0, 3.040],
  [6, "D25", 25.4, 506.7, 80.0, 3.980],
  [7, "D29", 28.7, 646.9, 90.0, 5.080],
  [8, "D32", 32.2, 814.3, 101.0, 6.390],
  [9, "D36", 35.8, 1007.0, 112.0, 7.900],
];

export interface TwWapeningGrootheid {
  id: number;
  naam: string;
  /** 公稱直徑 db (mm) */
  db: number;
  /** 公稱截面積 Ab (mm²) */
  Ab: number;
  /** 公稱截面積 (cm²) */
  Ab_cm2: number;
  /** 公稱周長 (mm) */
  omtrek: number;
  /** 單位重 (kg/m) */
  gewicht: number;
}

export const TW_WAPENING: readonly TwWapeningGrootheid[] = TW_WAPENING_TABEL.map((r) => ({
  id: r[0],
  naam: r[1],
  db: r[2],
  Ab: r[3],
  Ab_cm2: r[3] / 100,
  omtrek: r[4],
  gewicht: r[5],
}));

/** 依鋼筋名稱取得規格（例如 "D16" 或 16） */
export function vindTwWapening(naamOfId: string | number): TwWapeningGrootheid | undefined {
  if (typeof naamOfId === "number") return TW_WAPENING.find((w) => w.id === naamOfId);
  const clean = naamOfId.trim().toUpperCase();
  return TW_WAPENING.find((w) => w.naam === clean || w.naam === `D${clean}`);
}

export const WAPENING_KOP = "'鋼筋規格表（CNS 560）:";

/**
 * 產生計算語言中的鋼筋矩陣：
 * id | db (mm) | Ab (mm²) | gewicht (kg/m)
 */
export function twWapeningMatrix(opties: { naam?: string } = {}): string {
  const matrixNaam = opties.naam ?? "rebar_table";
  const ids = TW_WAPENING_TABEL.map((r) => String(r[0])).join("; ");
  const dbs = TW_WAPENING_TABEL.map((r) => String(r[2])).join("; ");
  const abs = TW_WAPENING_TABEL.map((r) => String(r[3])).join("; ");
  const gws = TW_WAPENING_TABEL.map((r) => String(r[5])).join("; ");
  const uitleg = "id | db (mm) | Ab (mm²) | gewicht (kg/m)";
  return `${WAPENING_KOP} ${uitleg}\n${matrixNaam} = [${ids} | ${dbs} | ${abs} | ${gws}]`;
}

/**
 * 產生自鋼筋矩陣查表的計算語言算式：
 * db = hlookup(rebar_table; rebar_id; 1; 2)*mm
 * Ab = hlookup(rebar_table; rebar_id; 1; 3)*mm^2
 */
export function twWapeningOpzoeking(sleutel: string, matrixNaam = "rebar_table"): string {
  return [
    `d_b = hlookup(${matrixNaam}; ${sleutel}; 1; 2)*mm`,
    `A_b = hlookup(${matrixNaam}; ${sleutel}; 1; 3)*mm^2`,
    `w_b = hlookup(${matrixNaam}; ${sleutel}; 1; 4)*(kg/m)`,
  ].join("\n");
}
