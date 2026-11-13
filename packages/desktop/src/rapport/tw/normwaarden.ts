/**
 * 台灣規範結構報告基準數值與載重資料（階段 2b）
 *
 * 來源分級依據 AGENTS.md §3：
 *   - A 級：Civil_Design_WorkBench 已驗證庫（tools/regs/verified/*.json）
 *   - B 級：全國法規資料庫官方全文條文（須註明發布日期與條號）
 *
 * 注意：絕不自行心算換算或憑記憶填寫規範數值；名稱與說明照錄原表，不自行增補。
 * 建築技術規則建築構造編第 17 條附表（樓地板活載重表）為 B 級：2026-11-13 自全國法規資料庫官方
 * 附件（LawGetFile FileId=0000341671）逐列核對，用途欄為摘要而非條文全文；若 WorkBench 日後入庫，改 A 級並重新核對。
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

// ── 3. 樓地板活載重（構造編第 17 條附表，B 級）────────────────────────────────
export interface TwVloerVeranderlijkItem {
  gebruik: string;
  qlast_kgf: string | null;
  bron: string;
  opmerking?: string;
  /** 附表列序號（1 起，範本下拉的 id；0 保留給「自行輸入」） */
  id?: number;
  /** 使用組別，如 A-1、B-2、H-2 */
  groep?: string;
  /** 1 = 屬第 17 條「人群聚集之場所」（第 25 條不得折減），0 = 否 */
  menigte?: 0 | 1;
}

const BRON_T17 = "B 級：建築技術規則建築構造編第 17 條附表（112.05.10 修正；官方附件逐列核對）";
const T17_CROWD = "人群聚集判定：第 17 條第 5 項";

/**
 * 建築技術規則建築構造編第 17 條附表：樓地板用途與最低均布活載重（kgf/m²）。
 * 「用途」欄為摘要（保留判別組別所需的關鍵條件，如面積門檻、固定座位、住宿與否），完整場所清單以官方附件為準。
 * 同一組別依附表分列處理，列序與官方附件一致。
 * `menigte` 依第 17 條末項「人群聚集之場所適用範圍」判定：該項只列入 B-1、G-2、G-3、H-1、H-2 的部分場所，
 * 同一附表列內含列入與未列入場所時，取 1（不折減，偏保守）；G-2、H-2 因另可明確區分，拆成兩個選項。
 */
export const TW_VLOER_VERANDERLIJK_TABEL: readonly TwVloerVeranderlijkItem[] = [
  { id: 1, groep: "A-1", gebruik: "具固定座位之戲院、電影院、演藝場等；具固定座位且觀眾席 ≥ 200 m² 之音樂廳、集會堂等", qlast_kgf: "300", menigte: 1, bron: BRON_T17 },
  { id: 2, groep: "A-1", gebruik: "無固定座位之戲院、電影院等；無固定座位且觀眾席 ≥ 200 m² 之音樂廳、集會堂等", qlast_kgf: "400", menigte: 1, bron: BRON_T17 },
  { id: 3, groep: "A-1", gebruik: "觀眾席 ≥ 200 m² 之體育館（場）及設施", qlast_kgf: "500", menigte: 1, bron: BRON_T17 },
  { id: 4, groep: "A-2", gebruik: "車站（公路、鐵路、大眾捷運）、候船室、水運客站、航空站", qlast_kgf: "400", menigte: 1, bron: BRON_T17 },
  { id: 5, groep: "B-1", gebruik: "視聽歌唱場所、包廂式理髮與按摩場所、錄影帶（節目帶）播映場所", qlast_kgf: "300", menigte: 1, bron: BRON_T17, opmerking: `${T17_CROWD}未列包廂式理髮、按摩；因同列含已列入場所，取 1（偏保守）` },
  { id: 6, groep: "B-1", gebruik: "三溫暖、舞廳、舞場、酒家、酒吧、特種咖啡茶室、夜店、夜總會、遊藝場、俱樂部、電子遊戲場", qlast_kgf: "500", menigte: 1, bron: BRON_T17 },
  { id: 7, groep: "B-2", gebruik: "市場（超級市場、零售市場、攤販集中場）", qlast_kgf: "400", menigte: 1, bron: BRON_T17 },
  { id: 8, groep: "B-2", gebruik: "百貨公司、展覽場（館）、量販店、批發場所；樓地板面積 ≥ 500 m² 之店舖、零售場所", qlast_kgf: "500", menigte: 1, bron: BRON_T17 },
  { id: 9, groep: "B-3", gebruik: "飲酒店（無陪侍）、小吃街；樓地板面積 ≥ 300 m² 之餐廳、飲食店、飲料店", qlast_kgf: "300", menigte: 1, bron: BRON_T17 },
  { id: 10, groep: "B-4", gebruik: "觀光旅館客房部、旅社、旅館、賓館；樓地板面積 ≥ 500 m² 之招待所、供香客住宿場所", qlast_kgf: "200", menigte: 0, bron: BRON_T17 },
  { id: 11, groep: "C-1", gebruik: "變電所、飛機庫、汽車修理場；特殊工作場、具公害工廠、自來水廠、屠宰場、發電場、廢棄物處理場等", qlast_kgf: "500", menigte: 0, bron: BRON_T17 },
  { id: 12, groep: "C-2", gebruik: "洗車場、汽車商場、電信機房、攝影場、實驗室；一般工場、工作場、工廠", qlast_kgf: "500", menigte: 0, bron: BRON_T17 },
  { id: 13, groep: "C-2", gebruik: "倉庫（倉儲場）、書庫、貨物輸配所", qlast_kgf: "600", menigte: 0, bron: BRON_T17 },
  { id: 14, groep: "D-1", gebruik: "保齡球館、健身房、撞球場、室內高爾夫球練習場、美容瘦身中心、資訊休閒服務場所", qlast_kgf: "400", menigte: 1, bron: BRON_T17 },
  { id: 15, groep: "D-1", gebruik: "室內溜冰場、游泳池、球類運動場、機械遊樂場、兒童樂園、公共浴室、室內體育場所、少年服務機構等", qlast_kgf: "500", menigte: 1, bron: BRON_T17 },
  { id: 16, groep: "D-2", gebruik: "圖書館；具固定座位且觀眾席 < 200 m² 之音樂廳、集會堂、表演館（場）", qlast_kgf: "300", menigte: 1, bron: BRON_T17 },
  { id: 17, groep: "D-2", gebruik: "會議廳、展示廳、博物館、美術館、科學館等；無固定座位且觀眾席 < 200 m² 之音樂廳、集會堂、表演館（場）", qlast_kgf: "400", menigte: 1, bron: BRON_T17 },
  { id: 18, groep: "D-2", gebruik: "觀眾席 < 200 m² 之體育館（場）及設施", qlast_kgf: "500", menigte: 1, bron: BRON_T17 },
  { id: 19, groep: "D-3", gebruik: "國小校舍（教室、教學大樓等相關教學場所）", qlast_kgf: "250", menigte: 1, bron: BRON_T17 },
  { id: 20, groep: "D-4", gebruik: "國中、高中、專科學校、學院、大學校舍（教室、教學大樓等）", qlast_kgf: "250", menigte: 1, bron: BRON_T17 },
  { id: 21, groep: "D-5", gebruik: "補習（訓練）班、文康機構、兒童課後照顧服務中心、實驗教育教學場地、樓地板 ≤ 300 m² 之運動訓練班", qlast_kgf: "250", menigte: 1, bron: BRON_T17 },
  { id: 22, groep: "E", gebruik: "樓地板面積 < 500 m² 之供香客住宿場所", qlast_kgf: "200", menigte: 1, bron: BRON_T17 },
  { id: 23, groep: "E", gebruik: "寺廟、教堂、宗祠、宗教設施；殯儀館、禮廳、靈堂、納骨堂（塔）", qlast_kgf: "400", menigte: 1, bron: BRON_T17 },
  { id: 24, groep: "E", gebruik: "火化場", qlast_kgf: "500", menigte: 1, bron: BRON_T17 },
  { id: 25, groep: "F-1", gebruik: "供病房或住宿使用：≥ 10 床之醫院、療養院；樓地板 ≥ 1000 m² 之診所；≥ 500 m² 之護理之家與長照住宿機構等", qlast_kgf: "200", menigte: 1, bron: BRON_T17 },
  { id: 26, groep: "F-1", gebruik: "非供病房或住宿使用之同類場所（醫院、療養院、診所、護理之家、長照機構等）", qlast_kgf: "300", menigte: 1, bron: BRON_T17 },
  { id: 27, groep: "F-2", gebruik: "供住宿使用：身心障礙福利機構、特殊教育學校、日間型精神復健機構等", qlast_kgf: "200", menigte: 1, bron: BRON_T17 },
  { id: 28, groep: "F-2", gebruik: "非供住宿使用之同類場所", qlast_kgf: "300", menigte: 1, bron: BRON_T17 },
  { id: 29, groep: "F-3", gebruik: "兒童及少年安置教養機構、幼兒園、托嬰中心、早期療育機構等", qlast_kgf: "250", menigte: 1, bron: BRON_T17 },
  { id: 30, groep: "F-4", gebruik: "精神病院、傳染病院、勒戒所、監獄、看守所、感化院、觀護所、收容中心等", qlast_kgf: "300", menigte: 1, bron: BRON_T17 },
  { id: 31, groep: "G-1", gebruik: "含營業廳之金融機構、證券公司、票券金融機構、電信局、郵局、自來水及電力公司營業場所", qlast_kgf: "300", menigte: 1, bron: BRON_T17 },
  { id: 32, groep: "G-2", gebruik: "政府機關（公務機關）", qlast_kgf: "300", menigte: 1, bron: BRON_T17, opmerking: `${T17_CROWD}明列 G-2 之政府機關` },
  { id: 33, groep: "G-2", gebruik: "不含營業廳之金融機構、一般事務所、自由職業事務所、辦公室（廳）、員工文康室等其他辦公場所", qlast_kgf: "300", menigte: 0, bron: BRON_T17, opmerking: `${T17_CROWD}僅列 G-2 之政府機關，其他辦公場所不屬人群聚集；若有人群聚集之實際使用，改選「政府機關」或自行輸入` },
  { id: 34, groep: "G-3", gebruik: "衛生所、健康中心、捐血中心、美容院、洗衣店、公共廁所、診所與小型醫院、小型店舖與餐飲場所等", qlast_kgf: "300", menigte: 1, bron: BRON_T17, opmerking: `${T17_CROWD}僅列 G-3 之衛生所、健康中心、捐血中心、醫院、療養院、診所；因同列含未列入場所，取 1（偏保守）` },
  { id: 35, groep: "H-1", gebruik: "民宿（客房 ≥ 6 間）、宿舍、樓地板 < 500 m² 之招待所；< 500 m² 之護理之家、老人福利機構、身心障礙福利機構；住宅單位任一樓層分間 ≥ 6 個使用單元或設 ≥ 10 床位居室者等", qlast_kgf: "200", menigte: 1, bron: BRON_T17, opmerking: `${T17_CROWD}僅列 H-1 之護理、長照、福利機構等；因同列含宿舍、民宿、住宅等未列入場所，取 1（偏保守）` },
  { id: 36, groep: "H-2", gebruik: "集合住宅、住宅、民宿（客房 ≤ 5 間）、農舍", qlast_kgf: "200", menigte: 0, bron: BRON_T17, opmerking: `${T17_CROWD}僅列 H-2 之小型安養等機構，住宅不屬人群聚集` },
  { id: 37, groep: "H-2", gebruik: "小型安養機構、小型身心障礙者職業訓練與精神復健機構、小型社區式日間照顧、社區式家庭托顧、社區居住服務場所", qlast_kgf: "200", menigte: 1, bron: BRON_T17 },
  { id: 38, groep: "I", gebruik: "化工原料行、礦油行、瓦斯行、爆竹煙火場所、鋼瓶檢驗機構；加油（氣）站、天然氣加壓站", qlast_kgf: "300", menigte: 0, bron: BRON_T17 },
  { id: 39, groep: "I", gebruik: "石油煉製廠、液化石油氣分裝場、天然氣製造場", qlast_kgf: "500", menigte: 0, bron: BRON_T17 },
  { id: 40, groep: "I", gebruik: "液化石油氣容器儲存室、儲存石油廠庫", qlast_kgf: "600", menigte: 0, bron: BRON_T17 },
];

/** 報告與面板顯示之附表來源狀態（B 級；WorkBench 入庫後改 A 級） */
export const TW_VLOER_VERANDERLIJK_STATUS = "B 級：建築技術規則建築構造編第 17 條附表（112.05.10 修正；官方附件逐列核對，用途欄為摘要，以官方附件為準）";

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
