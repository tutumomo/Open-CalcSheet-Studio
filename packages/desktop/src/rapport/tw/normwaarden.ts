/**
 * 台灣規範結構報告基準數值與載重資料（階段 2b）
 *
 * 來源分級依據 AGENTS.md §3：
 *   - A 級：Civil_Design_WorkBench 已驗證庫（tools/regs/verified/*.json）
 *   - B 級：全國法規資料庫官方全文條文（須註明發布日期與條號）
 *
 * 注意：絕不自行心算換算或憑記憶填寫規範數值；名稱與說明照錄原表，不自行增補。
 * 建築技術規則建築構造編第 17 條附表（樓地板活載重表）尚未入庫，依規定維持空表並標註待補。
 */

// ── 1. 載重組合（A 級：rc112 表 5.3.1）────────────────────────────────────────
export interface TwBelastingcombinatie {
  id: string;
  naam: string;
  formule: string;
  omschrijving: string;
  bron: string;
}

/**
 * 建築物混凝土結構設計規範（112.08.10）第 5.3 節表 5.3.1 載重組合
 * 出處：A 級 rc112_load_combinations_T531
 */
export const TW_RC_BELASTINGCOMBINATIES: readonly TwBelastingcombinatie[] = [
  {
    id: "5.3.1a",
    naam: "U_1",
    formule: "U = 1.4 D",
    omschrijving: "純靜載重控制",
    bron: "A 級：建築物混凝土結構設計規範 (rc112) 第 5.3 節表 5.3.1",
  },
  {
    id: "5.3.1b",
    naam: "U_2",
    formule: "U = 1.2 D + 1.6 L + 0.5 (Lr 或 S 或 R)",
    omschrijving: "靜載重與垂直活載重控制",
    bron: "A 級：建築物混凝土結構設計規範 (rc112) 第 5.3 節表 5.3.1",
  },
  {
    id: "5.3.1c",
    naam: "U_3",
    formule: "U = 1.2 D + 1.6 (Lr 或 S 或 R) + (1.0 L 或 0.8 W)",
    omschrijving: "屋頂活載重控制",
    bron: "A 級：建築物混凝土結構設計規範 (rc112) 第 5.3 節表 5.3.1",
  },
  {
    id: "5.3.1d",
    naam: "U_4",
    formule: "U = 1.2 D + 1.6 W + 1.0 L + 0.5 (Lr 或 S 或 R)",
    omschrijving: "風力控制（含活載重）",
    bron: "A 級：建築物混凝土結構設計規範 (rc112) 第 5.3 節表 5.3.1",
  },
  {
    id: "5.3.1e",
    naam: "U_5",
    formule: "U = 1.2 D + 1.0 E + 1.0 L + 0.2 S",
    omschrijving: "地震力控制（含活載重）",
    bron: "A 級：建築物混凝土結構設計規範 (rc112) 第 5.3 節表 5.3.1",
  },
  {
    id: "5.3.1f",
    naam: "U_6",
    formule: "U = 0.9 D + 1.6 W",
    omschrijving: "風力抗上浮與翻覆檢核",
    bron: "A 級：建築物混凝土結構設計規範 (rc112) 第 5.3 節表 5.3.1",
  },
  {
    id: "5.3.1g",
    naam: "U_7",
    formule: "U = 0.9 D + 1.0 E",
    omschrijving: "地震力抗上浮與翻覆檢核",
    bron: "A 級：建築物混凝土結構設計規範 (rc112) 第 5.3 節表 5.3.1",
  },
];

// ── 2. 屋頂活載重（A 級：建築技術規則建築構造編第 26 條）────────────────────────
export interface TwDakVeranderlijkRij {
  dakvorm: string;
  helling: string;
  klein_20: number; // ≤ 20 m² (kgf/m²)
  midden_60: number; // 20–60 m² (kgf/m²)
  groot_60: number; // > 60 m² (kgf/m²)
  bron: string;
}

/**
 * 建築技術規則建築構造編第 26 條屋頂最低活載重
 * 出處：A 級 btr_struct_roof_live_T26
 */
export const TW_DAK_VERANDERLIJK_T26: readonly TwDakVeranderlijkRij[] = [
  { dakvorm: "平頂", helling: "水平", klein_20: 100, midden_60: 80, groot_60: 60, bron: "A 級：建築技術規則建築構造編第 26 條 (btr_struct_roof_live_T26)" },
  { dakvorm: "拱頂", helling: "矢高與跨度比 1/6 以上", klein_20: 100, midden_60: 80, groot_60: 60, bron: "A 級：建築技術規則建築構造編第 26 條 (btr_struct_roof_live_T26)" },
  { dakvorm: "拱頂", helling: "矢高與跨度比 1/8 以上", klein_20: 100, midden_60: 80, groot_60: 60, bron: "A 級：建築技術規則建築構造編第 26 條 (btr_struct_roof_live_T26)" },
  { dakvorm: "坡頂", helling: "坡度 1/6 至 1/2", klein_20: 80, midden_60: 70, groot_60: 60, bron: "A 級：建築技術規則建築構造編第 26 條 (btr_struct_roof_live_T26)" },
  { dakvorm: "拱頂", helling: "矢高與跨度比 1/8 至 3/8", klein_20: 80, midden_60: 70, groot_60: 60, bron: "A 級：建築技術規則建築構造編第 26 條 (btr_struct_roof_live_T26)" },
  { dakvorm: "披頂", helling: "坡度 1/2 以上", klein_20: 60, midden_60: 60, groot_60: 60, bron: "A 級：建築技術規則建築構造編第 26 條 (btr_struct_roof_live_T26)" },
  { dakvorm: "拱頂", helling: "矢高與跨度比 3/8 以上", klein_20: 60, midden_60: 60, groot_60: 60, bron: "A 級：建築技術規則建築構造編第 26 條 (btr_struct_roof_live_T26)" },
];

// ── 3. 樓地板活載重（構造編第 17 條附表缺口處理）──────────────────────────────
export interface TwVloerVeranderlijkItem {
  gebruik: string;
  qlast_kgf: string | null;
  bron: string;
  opmerking?: string;
}

/**
 * 建築技術規則建築構造編第 17 條附表目前不在已驗證庫，依法規紀律保持空表，
 * 嚴禁自行臆測或憑記憶填寫。
 */
export const TW_VLOER_VERANDERLIJK_TABEL: readonly TwVloerVeranderlijkItem[] = [];

/** 報告與面板顯示之缺口警示文字 */
export const TW_VLOER_VERANDERLIJK_STATUS = "待補：建築技術規則建築構造編第 17 條附表";

/**
 * 構造編第 17 條其餘項次之官方條文明文規定（B 級來源，全國法規資料庫 LawAll，112.05.10 修正）
 */
export const TW_VERANDERLIJK_BIJZONDER: readonly TwVloerVeranderlijkItem[] = [
  {
    gebruik: "車庫及停車場等類似場所",
    qlast_kgf: "500",
    bron: "B 級：建築技術規則建築構造編第 17 條第 2 項（112.05.10 修正）",
    opmerking: "最低均布活載重 500 kgf/m²",
  },
  {
    gebruik: "走廊、樓梯（人群聚集之公共走廊、樓梯）",
    qlast_kgf: "500",
    bron: "B 級：建築技術規則建築構造編第 17 條第 3 項（112.05.10 修正）",
    opmerking: "走廊、樓梯與室載重相同；人群聚集處 ≥ 500 kgf/m²",
  },
  {
    gebruik: "屋頂露臺（人群聚集場所）",
    qlast_kgf: "300",
    bron: "B 級：建築技術規則建築構造編第 17 條第 4 項（112.05.10 修正）",
    opmerking: "屋頂露臺得較室載重減 50 kgf/m²；人群聚集處 ≥ 300 kgf/m²",
  },
  {
    gebruik: "辦公室活動隔牆附加載重",
    qlast_kgf: "100",
    bron: "B 級：建築技術規則建築構造編第 21 條（112.05.10 修正）",
    opmerking: "辦公室或類似應用之建築物採用活動隔牆者，按 100 kgf/m² 均佈活載重設計",
  },
];

// ── 4. 耐震用途係數 I（A 級：構造編第 43-1 條）────────────────────────────────
export interface TwSeismischI {
  categorie: string;
  waarde: number;
  omschrijving: string;
  bron: string;
}

/** 類別說明照錄已驗證表 btr_struct_seismic_I 之「說明」欄 */
export const TW_SEISMISCH_I: readonly TwSeismischI[] = [
  { categorie: "第一類", waarde: 1.5, omschrijving: "地震災害發生後必須維持機能以救濟大眾之重要建築物", bron: "A 級：建築技術規則建築構造編第 43-1 條 (btr_struct_seismic_I)" },
  { categorie: "第二類", waarde: 1.5, omschrijving: "儲存多量具有毒性、爆炸性等危險物品之建築物", bron: "A 級：建築技術規則建築構造編第 43-1 條 (btr_struct_seismic_I)" },
  { categorie: "第三類", waarde: 1.25, omschrijving: "第 17 條第 5 項所定人群聚集之場所達一定比例之建築物，或其他經中央主管建築機關認定之建築物", bron: "A 級：建築技術規則建築構造編第 43-1 條 (btr_struct_seismic_I)" },
  { categorie: "第四類", waarde: 1.0, omschrijving: "其他一般建築物", bron: "A 級：建築技術規則建築構造編第 43-1 條 (btr_struct_seismic_I)" },
];

// ── 5. 材料單位體積重量（A 級：構造編第 11 條）────────────────────────────────
export interface TwEenheidsgewicht {
  /** 材料名稱，照錄原表 */
  materiaal: string;
  /** 原表值（kgf/m³，條文寫作公斤／立方公尺；不小於此值） */
  rho_kg_m3: number;
  /** 由原表值換算：γ = ρ·g，g = 9.80665 m/s²（kN/m³，未捨入） */
  gamma_kN_m3: number;
  bron: string;
}

/** 1 kgf = 9.80665 N（與 core 單位定義一致） */
const G_N_PER_KGF = 9.80665;

const BRON_T11 = "A 級：建築技術規則建築構造編第 11 條 (btr_struct_unit_weight_T11)";

function eenheidsgewicht(materiaal: string, rho_kg_m3: number): TwEenheidsgewicht {
  return { materiaal, rho_kg_m3, gamma_kN_m3: (rho_kg_m3 * G_N_PER_KGF) / 1000, bron: BRON_T11 };
}

/** 結構計算常用之部分材料（第 11 條表列值，為下限值；配合設計或契約另訂者從其規定） */
export const TW_EENHEIDSGEWICHTEN: readonly TwEenheidsgewicht[] = [
  eenheidsgewicht("鋼筋混凝土", 2400),
  eenheidsgewicht("水泥混凝土", 2300),
  eenheidsgewicht("鋼", 7850),
  eenheidsgewicht("磚", 1900),
  eenheidsgewicht("砂石", 2000),
  eenheidsgewicht("花崗石", 2500),
  eenheidsgewicht("大理石", 2700),
];

// ── 6. 面層靜載重（A 級：構造編第 14 條地板面、第 15 條牆壁與粉刷貼面）────────
export interface TwOppervlakteGewicht {
  /** 名稱，照錄原表 */
  onderdeel: string;
  /** 原表分類（實舖地板／空舖地板／牆壁／牆面粉刷及貼面） */
  soort: string;
  /** kgf/m²；牆面粉刷及貼面為每 1 cm 厚之值 */
  gewicht_kgf_m2: number;
  bron: string;
}

const BRON_T14 = "A 級：建築技術規則建築構造編第 14 條 (btr_struct_floor_weight_T14)";
const BRON_T15 = "A 級：建築技術規則建築構造編第 15 條 (btr_struct_wall_weight_T15)";

export const TW_VLOER_AFWERKING_T14: readonly TwOppervlakteGewicht[] = [
  { onderdeel: "水泥沙漿粉光", soort: "實舖地板", gewicht_kgf_m2: 20, bron: BRON_T14 },
  { onderdeel: "磨石子", soort: "實舖地板", gewicht_kgf_m2: 24, bron: BRON_T14 },
  { onderdeel: "舖塊石", soort: "實舖地板", gewicht_kgf_m2: 30, bron: BRON_T14 },
  { onderdeel: "舖馬賽克", soort: "實舖地板", gewicht_kgf_m2: 20, bron: BRON_T14 },
  { onderdeel: "舖瀝青地磚", soort: "實舖地板", gewicht_kgf_m2: 25, bron: BRON_T14 },
  { onderdeel: "舖拼花地板", soort: "實舖地板", gewicht_kgf_m2: 15, bron: BRON_T14 },
  { onderdeel: "木地板（包括擱柵）", soort: "空舖地板", gewicht_kgf_m2: 15, bron: BRON_T14 },
  { onderdeel: "疊蓆（包括木板擱柵）", soort: "空舖地板", gewicht_kgf_m2: 35, bron: BRON_T14 },
];

export const TW_WAND_AFWERKING_T15: readonly TwOppervlakteGewicht[] = [
  { onderdeel: "紅磚牆 一磚厚", soort: "牆壁", gewicht_kgf_m2: 440, bron: BRON_T15 },
  { onderdeel: "混凝土空心磚牆 20 公分", soort: "牆壁", gewicht_kgf_m2: 250, bron: BRON_T15 },
  { onderdeel: "混凝土空心磚牆 15 公分", soort: "牆壁", gewicht_kgf_m2: 190, bron: BRON_T15 },
  { onderdeel: "混凝土空心磚牆 10 公分", soort: "牆壁", gewicht_kgf_m2: 130, bron: BRON_T15 },
  { onderdeel: "煤屑空心磚牆 20 公分", soort: "牆壁", gewicht_kgf_m2: 165, bron: BRON_T15 },
  { onderdeel: "煤屑空心磚牆 15 公分", soort: "牆壁", gewicht_kgf_m2: 135, bron: BRON_T15 },
  { onderdeel: "煤屑空心磚牆 10 公分", soort: "牆壁", gewicht_kgf_m2: 100, bron: BRON_T15 },
  { onderdeel: "空心紅磚牆", soort: "牆壁", gewicht_kgf_m2: 192, bron: BRON_T15 },
  { onderdeel: "白石磚牆 一磚厚", soort: "牆壁", gewicht_kgf_m2: 440, bron: BRON_T15 },
  { onderdeel: "魚鱗板牆", soort: "牆壁", gewicht_kgf_m2: 25, bron: BRON_T15 },
  { onderdeel: "灰板條牆", soort: "牆壁", gewicht_kgf_m2: 50, bron: BRON_T15 },
  { onderdeel: "甘蔗板牆", soort: "牆壁", gewicht_kgf_m2: 8, bron: BRON_T15 },
  { onderdeel: "夾板牆", soort: "牆壁", gewicht_kgf_m2: 6, bron: BRON_T15 },
  { onderdeel: "竹笆牆", soort: "牆壁", gewicht_kgf_m2: 48, bron: BRON_T15 },
  { onderdeel: "水泥沙漿粉刷", soort: "牆面粉刷及貼面（每 1 cm 厚）", gewicht_kgf_m2: 20, bron: BRON_T15 },
  { onderdeel: "貼面磚馬賽克", soort: "牆面粉刷及貼面（每 1 cm 厚）", gewicht_kgf_m2: 20, bron: BRON_T15 },
  { onderdeel: "貼搗擺磨石子", soort: "牆面粉刷及貼面（每 1 cm 厚）", gewicht_kgf_m2: 20, bron: BRON_T15 },
  { onderdeel: "洗石子或斬石子", soort: "牆面粉刷及貼面（每 1 cm 厚）", gewicht_kgf_m2: 20, bron: BRON_T15 },
  { onderdeel: "貼大理石片", soort: "牆面粉刷及貼面（每 1 cm 厚）", gewicht_kgf_m2: 30, bron: BRON_T15 },
  { onderdeel: "貼塊石片", soort: "牆面粉刷及貼面（每 1 cm 厚）", gewicht_kgf_m2: 25, bron: BRON_T15 },
];
