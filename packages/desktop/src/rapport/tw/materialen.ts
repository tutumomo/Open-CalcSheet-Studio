/**
 * 台灣結構計算書之採用材料規格與緊結件預設值、依種類聯動之規格建議清單及列印欄寬。
 *
 * 僅包含純 TypeScript 資料與函式（無 React／CSS 依賴），供 model.ts、UI 元件及
 * Node 24 檢查腳本直接載入。
 *
 * 依據規範：
 *   - 建築物混凝土結構設計規範（112.08.10 版，rc112 表 19.2.1.1、§20.2.2.4、§20.2.2.5）
 *   - CNS 560 鋼筋混凝土用鋼筋
 *   - 鋼構造建築物鋼結構設計技術規範（99.09.16 版，steel99 §3.2 表 3.2、§3.4、§3.5、表 10.3-1、表 10.3-2）
 *   - 木構造建築物設計及施工技術規範（110.01.26 版，表 4.3-1(a)/(b)、§4.5 CNS 11031、§4.6 CNS 11671）
 */
import { inTaal, type Meertalig } from "../meertalig.ts";
import type { Bevestigingsregel, Materiaalregel } from "../model.ts";

/** 可編輯下拉選單之選項（值＋說明）。 */
export interface TwSuggestieOptie {
  waarde: string;
  toelichting?: string;
}

interface TwMateriaalDef {
  type: Meertalig;
  soort: string;
  opmerking: Meertalig | string;
}

interface TwBevestigingDef {
  type: Meertalig;
  kwaliteit: string;
}

/**
 * 台灣報告第 3 章（材料強度）預設 5 列材料：
 * 第 3～5 列之備註寬度皆控制在 10.48 em 以內（materialen.ts OPMERKING_RUIMTE），
 * 確保列印時右側緊結件表格自第 3 列起並列對齊而不被往下推。
 */
export const TW_STANDAARD_MATERIALEN_DEF: readonly TwMateriaalDef[] = [
  {
    type: { en: "In-situ concrete", nl: "TPG Beton", "zh-TW": "場鑄混凝土" },
    soort: "fc'=280 kgf/cm²",
    opmerking: {
      en: "(equivalent 28 MPa; see design drawings for cover & exposure)",
      nl: "(circa 28 MPa; zie tekening voor dekking en milieuklasse)",
      "zh-TW": "（相當 28 MPa；保護層與暴露條件見設計圖）",
    },
  },
  {
    type: { en: "Reinforcing steel", nl: "Wapeningsstaal", "zh-TW": "鋼筋" },
    soort: "SD420W",
    opmerking: {
      en: "CNS 560 (SD280W may be used for #3-#4 stirrups)",
      nl: "CNS 560 (SD280W mogelijk voor beugels #3-#4)",
      "zh-TW": "CNS 560（#3～#4 箍筋可採 SD280W）",
    },
  },
  {
    type: { en: "Steel", nl: "Staal", "zh-TW": "結構用鋼材" },
    soort: "SN490B",
    opmerking: "CNS 13812",
  },
  {
    type: { en: "Grout under steel", nl: "Ondervoeging staal", "zh-TW": "鋼骨座漿無收縮水泥砂漿" },
    soort: "fc'=420 kgf/cm²",
    opmerking: {
      en: "Baseplate grout",
      nl: "Voetplaatvoeg",
      "zh-TW": "柱腳座漿",
    },
  },
  {
    type: { en: "Timber", nl: "Hout", "zh-TW": "木材" },
    soort: "針葉樹Ⅱ類（普通）",
    opmerking: {
      en: "Timber code 4.3",
      nl: "Houtnorm 4.3",
      "zh-TW": "木構規範 4.3",
    },
  },
];

/** 台灣報告預設 3 列緊結件。 */
export const TW_STANDAARD_BEVESTIGING_DEF: readonly TwBevestigingDef[] = [
  {
    type: { en: "High-strength bolts", nl: "Voorspanbouten", "zh-TW": "高強度螺栓" },
    kwaliteit: "F10T",
  },
  {
    type: { en: "Ordinary bolts", nl: "Gewone bouten", "zh-TW": "普通螺栓" },
    kwaliteit: "A307",
  },
  {
    type: { en: "Chemical anchors", nl: "Chemische Ankers", "zh-TW": "化學錨栓" },
    kwaliteit: "SUS304",
  },
];

const isMeertalig = (x: Meertalig | string): x is Meertalig => typeof x !== "string";

/** 供 model.ts MEEGELEVERD 擴充使用之台灣材料備註（避免與歐規既有條目重複）。 */
export const TW_MEEGELEVERD_MATERIAAL_OPMERKING: readonly Meertalig[] =
  TW_STANDAARD_MATERIALEN_DEF.map((m) => m.opmerking).filter(isMeertalig);

/** 供 model.ts MEEGELEVERD 擴充使用之台灣緊結件類型（排除已在歐規清單內之「化學錨栓」）。 */
export const TW_MEEGELEVERD_BEVESTIGING: readonly Meertalig[] =
  TW_STANDAARD_BEVESTIGING_DEF.slice(0, 2).map((b) => b.type);

/** 依報告語言產生台灣預設採用材料列。 */
export function twStandaardMaterialen(taal: string): Materiaalregel[] {
  return TW_STANDAARD_MATERIALEN_DEF.map((m) => ({
    type: inTaal(m.type, taal),
    soort: m.soort,
    opmerking: isMeertalig(m.opmerking) ? inTaal(m.opmerking, taal) : m.opmerking,
  }));
}

/** 依報告語言產生台灣預設緊結件列。 */
export function twStandaardBevestiging(taal: string): Bevestigingsregel[] {
  return TW_STANDAARD_BEVESTIGING_DEF.map((b) => ({
    type: inTaal(b.type, taal),
    kwaliteit: b.kwaliteit,
  }));
}

/** 台灣常用材料種類下拉建議清單。 */
export const TW_MATERIAAL_TYPEN: readonly TwSuggestieOptie[] = [
  { waarde: "場鑄混凝土", toelichting: "結構主體混凝土（rc112）" },
  { waarde: "預鑄混凝土", toelichting: "預鑄構件／預力基樁（rc112）" },
  { waarde: "打底混凝土", toelichting: "基礎底部墊層（PC）" },
  { waarde: "鋼筋", toelichting: "竹節鋼筋（CNS 560 / rc112）" },
  { waarde: "銲接鋼線網", toelichting: "樓板／面層配筋（CNS 6919）" },
  { waarde: "結構用鋼材", toelichting: "熱軋／銲接型鋼與鋼板（steel99 §3.2）" },
  { waarde: "結構用鋼管", toelichting: "方形／矩形／圓形鋼管（CNS 7141 / 4435）" },
  { waarde: "鋼骨座漿無收縮水泥砂漿", toelichting: "柱腳基板／機械底座灌漿" },
  { waarde: "木材", toelichting: "結構用製材或集成材（木構規範 §4.3）" },
  { waarde: "結構用集成材", toelichting: "CNS 11031（木構規範 §4.5）" },
  { waarde: "結構用合板", toelichting: "CNS 11671（木構規範 §4.6）" },
  { waarde: "磚石／砌體", toelichting: "紅磚（CNS 382）／混凝土空心磚（CNS 8905）" },
];

const GROUT_SOORTEN: readonly TwSuggestieOptie[] = [
  { waarde: "fc'=350 kgf/cm²", toelichting: "約 34.3 MPa，實務常用無收縮砂漿" },
  { waarde: "fc'=420 kgf/cm²", toelichting: "約 41.2 MPa，鋼骨柱腳座漿常用" },
  { waarde: "fc'=490 kgf/cm²", toelichting: "約 48.1 MPa，高強度無收縮灌漿" },
  { waarde: "fc'=560 kgf/cm²", toelichting: "約 54.9 MPa，高強度無收縮灌漿" },
  { waarde: "fc'=600 kgf/cm²", toelichting: "約 58.8 MPa，特高強度無收縮灌漿" },
];

const BETON_SOORTEN: readonly TwSuggestieOptie[] = [
  { waarde: "fc'=140 kgf/cm²", toelichting: "約 13.7 MPa，打底／非結構混凝土" },
  { waarde: "fc'=175 kgf/cm²", toelichting: "約 17.2 MPa，非結構／一般附屬構物" },
  { waarde: "fc'=210 kgf/cm²", toelichting: "約 20.6 MPa，rc112 表 19.2.1.1 一般最低下限 (21 MPa)" },
  { waarde: "fc'=245 kgf/cm²", toelichting: "約 24.0 MPa，常用中間強度等級" },
  { waarde: "fc'=280 kgf/cm²", toelichting: "約 27.5 MPa，rc112 表 19.2.1.1 耐震構材／場鑄樁下限 (28 MPa)" },
  { waarde: "fc'=350 kgf/cm²", toelichting: "約 34.3 MPa，rc112 表 19.2.1.1 預鑄預力打擊樁下限 (35 MPa)" },
  { waarde: "fc'=420 kgf/cm²", toelichting: "約 41.2 MPa，高強度混凝土" },
  { waarde: "fc'=490 kgf/cm²", toelichting: "約 48.1 MPa，高強度混凝土" },
  { waarde: "fc'=560 kgf/cm²", toelichting: "約 54.9 MPa，超高強度混凝土" },
];

const WAPENING_SOORTEN: readonly TwSuggestieOptie[] = [
  { waarde: "SD280", toelichting: "CNS 560，fy=2800 kgf/cm²，一般箍筋／樓板" },
  { waarde: "SD280W", toelichting: "CNS 560 耐震銲接級，rc112 §20.2.2.5" },
  { waarde: "SD420", toelichting: "CNS 560，fy=4200 kgf/cm²，一般主筋" },
  { waarde: "SD420W", toelichting: "CNS 560 耐震銲接級主筋，rc112 §20.2.2.5" },
  { waarde: "SD490", toelichting: "CNS 560，fy=4900 kgf/cm²" },
  { waarde: "SD490W", toelichting: "CNS 560 高強度耐震銲接級" },
  { waarde: "SD550W", toelichting: "CNS 560，rc112 表 20.2.2.4(a) 撓曲軸力設計上限 (550 MPa)" },
  { waarde: "CNS 6919", toelichting: "銲接鋼線網，rc112 表 20.2.2.4(a)" },
];

const STAAL_BUIS_SOORTEN: readonly TwSuggestieOptie[] = [
  { waarde: "STKR400", toelichting: "CNS 7141 一般結構用矩形碳鋼鋼管" },
  { waarde: "STKR490", toelichting: "CNS 7141 高強度結構用矩形碳鋼鋼管" },
  { waarde: "STK400", toelichting: "CNS 4435 一般結構用碳鋼鋼管" },
  { waarde: "STK490", toelichting: "CNS 4435 高強度結構用碳鋼鋼管" },
  { waarde: "ASTM A500 Gr.B", toelichting: "冷成型銲接／無縫結構用碳鋼管" },
  { waarde: "ASTM A500 Gr.C", toelichting: "高強度冷成型結構用碳鋼管" },
];

const STAAL_SOORTEN: readonly TwSuggestieOptie[] = [
  { waarde: "SS400", toelichting: "CNS 2473 一般結構用軋鋼料" },
  { waarde: "SM400A", toelichting: "CNS 2947 銲接結構用軋鋼料" },
  { waarde: "SM400B", toelichting: "CNS 2947 銲接結構用軋鋼料（具衝擊值）" },
  { waarde: "SM490A", toelichting: "CNS 2947 高強度銲接結構用鋼" },
  { waarde: "SM490B", toelichting: "CNS 2947 高強度銲接結構用鋼（具衝擊值）" },
  { waarde: "SM570", toelichting: "CNS 2947 高張力銲接結構用鋼" },
  { waarde: "SN400A", toelichting: "CNS 13812 建築結構用軋鋼料" },
  { waarde: "SN400B", toelichting: "CNS 13812 耐震建築結構用軋鋼料" },
  { waarde: "SN400C", toelichting: "CNS 13812 厚度方向保證建築結構用鋼" },
  { waarde: "SN490B", toelichting: "CNS 13812 高強度耐震建築結構用鋼" },
  { waarde: "SN490C", toelichting: "CNS 13812 高強度厚度方向保證建築鋼" },
  { waarde: "ASTM A36", toelichting: "一般碳素結構鋼" },
  { waarde: "ASTM A572 Gr.50", toelichting: "高強度低合金結構鋼" },
  { waarde: "ASTM A992", toelichting: "建築構架寬翼緣型鋼" },
];

const GLULAM_SOORTEN: readonly TwSuggestieOptie[] = [
  { waarde: "E65-F225", toelichting: "CNS 11031 結構用集成材（針葉樹）" },
  { waarde: "E75-F240", toelichting: "CNS 11031 結構用集成材（針葉樹）" },
  { waarde: "E85-F255", toelichting: "CNS 11031 結構用集成材（針葉樹）" },
  { waarde: "E95-F270", toelichting: "CNS 11031 結構用集成材（針葉樹）" },
  { waarde: "E105-F300", toelichting: "CNS 11031 結構用集成材（針葉樹）" },
  { waarde: "E120-F330", toelichting: "CNS 11031 結構用集成材（針葉樹）" },
  { waarde: "E135-F375", toelichting: "CNS 11031 結構用集成材（針葉樹）" },
  { waarde: "E150-F435", toelichting: "CNS 11031 結構用集成材（針葉樹）" },
];

const PLYWOOD_SOORTEN: readonly TwSuggestieOptie[] = [
  { waarde: "CNS 11671 特類", toelichting: "結構用合板 1 級（特類膠合，耐水，木構規範 §4.6）" },
  { waarde: "CNS 11671 1類", toelichting: "結構用合板 1 級（1 類膠合，高耐水，木構規範 §4.6）" },
  { waarde: "CNS 11671 2類", toelichting: "結構用合板（2 類膠合，室內，木構規範 §4.6）" },
];

const HOUT_SOORTEN: readonly TwSuggestieOptie[] = [
  { waarde: "針葉樹Ⅰ類（普通）", toelichting: "木構規範 表 4.3-1(a)，fc=75、fb=95 kgf/cm²" },
  { waarde: "針葉樹Ⅱ類（普通）", toelichting: "木構規範 表 4.3-1(a)，fc=70、fb=90 kgf/cm²" },
  { waarde: "針葉樹Ⅲ類（普通）", toelichting: "木構規範 表 4.3-1(a)，fc=65、fb=85 kgf/cm²" },
  { waarde: "針葉樹Ⅳ類（普通）", toelichting: "木構規範 表 4.3-1(a)，fc=60、fb=75 kgf/cm²" },
  { waarde: "針葉樹Ⅰ類（上等）", toelichting: "木構規範 表 4.3-1(b)，fc=90、fb=120 kgf/cm²" },
  { waarde: "針葉樹Ⅱ類（上等）", toelichting: "木構規範 表 4.3-1(b)，fc=85、fb=110 kgf/cm²" },
  { waarde: "針葉樹Ⅲ類（上等）", toelichting: "木構規範 表 4.3-1(b)，fc=80、fb=105 kgf/cm²" },
  { waarde: "針葉樹Ⅳ類（上等）", toelichting: "木構規範 表 4.3-1(b)，fc=75、fb=95 kgf/cm²" },
  { waarde: "闊葉樹Ⅰ類（普通）", toelichting: "木構規範 表 4.3-1(a)，fc=90、fb=130 kgf/cm²" },
  { waarde: "闊葉樹Ⅱ類（普通）", toelichting: "木構規範 表 4.3-1(a)，fc=70、fb=100 kgf/cm²" },
  { waarde: "闊葉樹Ⅲ類（普通）", toelichting: "木構規範 表 4.3-1(a)，fc=70、fb=90 kgf/cm²" },
  { waarde: "CNS 11031 E85-F255", toelichting: "結構用集成材（木構規範 §4.5）" },
  { waarde: "CNS 11031 E95-F270", toelichting: "結構用集成材（木構規範 §4.5）" },
  { waarde: "CNS 11031 E105-F300", toelichting: "結構用集成材（木構規範 §4.5）" },
  { waarde: "CNS 11031 E120-F330", toelichting: "結構用集成材（木構規範 §4.5）" },
];

const METSEL_SOORTEN: readonly TwSuggestieOptie[] = [
  { waarde: "CNS 382 一種磚", toelichting: "普通紅磚（一種）" },
  { waarde: "CNS 382 二種磚", toelichting: "普通紅磚（二種）" },
  { waarde: "CNS 8905 空心磚", toelichting: "建築用混凝土空心磚" },
];

const MATERIAAL_FALLBACK_SOORTEN: readonly TwSuggestieOptie[] = [
  BETON_SOORTEN[2],
  BETON_SOORTEN[4],
  BETON_SOORTEN[5],
  WAPENING_SOORTEN[1],
  WAPENING_SOORTEN[3],
  STAAL_SOORTEN[0],
  STAAL_SOORTEN[4],
  STAAL_SOORTEN[7],
  STAAL_SOORTEN[9],
  GROUT_SOORTEN[1],
  HOUT_SOORTEN[1],
];

/**
 * 依材料種類回傳對應之「強度等級 / 規格」建議清單。
 * 判斷順序刻意將「砂漿／灌漿」置於「混凝土」之前、「鋼管／鋼筋」置於「鋼材」之前、
 * 「集成材／合板」置於「木材」之前，避免複合字詞誤判分類。
 */
export function twMateriaalSoortOpties(type: string): readonly TwSuggestieOptie[] {
  const t = type.trim().toLowerCase();
  if (/砂漿|灌漿|座漿|grout|mortar|ondervoeg/.test(t)) return GROUT_SOORTEN;
  if (/混凝土|concrete|beton|\b(?:rc|pc)\b/.test(t)) return BETON_SOORTEN;
  if (/鋼管|tube|pipe|buis/.test(t)) return STAAL_BUIS_SOORTEN;
  if (/鋼筋|鋼線|rebar|wapening|mesh/.test(t)) return WAPENING_SOORTEN;
  if (/鋼|steel|staal/.test(t)) return STAAL_SOORTEN;
  if (/集成材|glulam|gelamineerd/.test(t)) return GLULAM_SOORTEN;
  if (/合板|板材|plywood|plaat/.test(t)) return PLYWOOD_SOORTEN;
  if (/木|timber|wood|hout/.test(t)) return HOUT_SOORTEN;
  if (/磚|砌體|masonry|brick|metsel/.test(t)) return METSEL_SOORTEN;
  return MATERIAAL_FALLBACK_SOORTEN;
}

/** 台灣常用緊結件種類下拉建議清單。 */
export const TW_BEVESTIGING_TYPEN: readonly TwSuggestieOptie[] = [
  { waarde: "高強度螺栓", toelichting: "摩阻型／承壓型接合（steel99 §10.3）" },
  { waarde: "普通螺栓", toelichting: "一般次結構／承壓式接合" },
  { waarde: "基礎錨栓", toelichting: "柱腳／設備基礎錨定（steel99 §3.4 CNS 4426）" },
  { waarde: "化學錨栓", toelichting: "植筋／後置化學錨栓" },
  { waarde: "膨脹錨栓", toelichting: "機械式後置膨脹錨栓" },
  { waarde: "銲條／銲材", toelichting: "鋼構電弧銲接材料（steel99 §3.5）" },
  { waarde: "剪力釘", toelichting: "合成梁剪力連接釘（steel99 §3.4）" },
  { waarde: "木構造螺栓／木螺釘", toelichting: "木構接合件（木構規範 第 6 章）" },
];

const HOOGSTERKTE_BOUT_KWALITEITEN: readonly TwSuggestieOptie[] = [
  { waarde: "F10T", toelichting: "steel99 表 10.3-1／10.3-2，CNS 4366" },
  { waarde: "S10T", toelichting: "扭斷型高強度螺栓，CNS 12209／JSS II 09" },
  { waarde: "F8T", toelichting: "CNS 4366（steel99 §3.4 解說：實務甚少使用）" },
  { waarde: "ASTM A325", toelichting: "steel99 §3.4 解說，高強度結構螺栓" },
  { waarde: "ASTM A490", toelichting: "steel99 §3.4 解說，超高強度結構螺栓" },
  { waarde: "ASTM F3125 Gr.A325", toelichting: "ASTM 整合版高強度結構螺栓" },
  { waarde: "ASTM F3125 Gr.A490", toelichting: "ASTM 整合版超高強度結構螺栓" },
];

const ANKER_KWALITEITEN: readonly TwSuggestieOptie[] = [
  { waarde: "ASTM F1554 Gr.36", toelichting: "結構用基礎錨栓（Fy=36 ksi）" },
  { waarde: "ASTM F1554 Gr.55", toelichting: "結構用基礎錨栓（Fy=55 ksi）" },
  { waarde: "ASTM F1554 Gr.105", toelichting: "高強度結構用基礎錨栓（Fy=105 ksi）" },
  { waarde: "A307", toelichting: "steel99 表 10.3-2 一般螺栓／錨栓" },
  { waarde: "SN400B", toelichting: "CNS 13812，柱腳錨栓常用" },
  { waarde: "SUS304", toelichting: "不鏽鋼化學／膨脹錨栓" },
  { waarde: "SUS316", toelichting: "耐蝕不鏽鋼化學／膨脹錨栓" },
  { waarde: "ISO 5.8", toelichting: "公制化學錨栓螺桿等級" },
  { waarde: "ISO 8.8", toelichting: "公制高強度化學錨栓螺桿等級" },
];

const HOUT_BEVESTIGING_KWALITEITEN: readonly TwSuggestieOptie[] = [
  { waarde: "A307", toelichting: "一般結構用螺栓" },
  { waarde: "SS400", toelichting: "CNS 2473 一般結構鋼材" },
  { waarde: "SUS304", toelichting: "不鏽鋼防蝕螺釘／螺栓" },
];

const GEWONE_BOUT_KWALITEITEN: readonly TwSuggestieOptie[] = [
  { waarde: "A307", toelichting: "steel99 表 10.3-2 一般承壓式螺栓" },
  { waarde: "SS400", toelichting: "CNS 2473 一般結構鋼材" },
  { waarde: "SUS304", toelichting: "不鏽鋼螺栓" },
  { waarde: "SUS316", toelichting: "耐蝕不鏽鋼螺栓" },
  { waarde: "ISO 4.6", toelichting: "公制一般強度等級" },
  { waarde: "ISO 8.8", toelichting: "公制高強度等級" },
];

const LAS_KWALITEITEN: readonly TwSuggestieOptie[] = [
  { waarde: "AWS E70XX", toelichting: "steel99 §3.5 解說，結構鋼常用銲材" },
  { waarde: "AWS E7016", toelichting: "低氫系被覆電弧銲條" },
  { waarde: "AWS E7018", toelichting: "低氫系鐵粉被覆電弧銲條" },
  { waarde: "AWS E80XX", toelichting: "高強度鋼結構用銲材" },
  { waarde: "CNS 13719", toelichting: "steel99 §3.5 軟鋼／高強度鋼用被覆銲條" },
  { waarde: "CNS 3506", toelichting: "steel99 §3.5 高強度鋼用被覆銲條" },
];

const DEUVEL_KWALITEITEN: readonly TwSuggestieOptie[] = [
  { waarde: "AWS D1.1 Type B", toelichting: "steel99 §3.4 解說，剪力連接釘" },
  { waarde: "CNS 4689", toelichting: "steel99 §3.4 電弧樁熔接用柱樁－剪力連接樁" },
  { waarde: "CNS 4688", toelichting: "steel99 §3.4 電弧樁熔接用柱樁－無螺紋樁" },
];

const BEVESTIGING_FALLBACK_KWALITEITEN: readonly TwSuggestieOptie[] = [
  HOOGSTERKTE_BOUT_KWALITEITEN[0],
  HOOGSTERKTE_BOUT_KWALITEITEN[1],
  HOOGSTERKTE_BOUT_KWALITEITEN[3],
  HOOGSTERKTE_BOUT_KWALITEITEN[4],
  GEWONE_BOUT_KWALITEITEN[0],
  ANKER_KWALITEITEN[0],
  ANKER_KWALITEITEN[1],
  ANKER_KWALITEITEN[5],
  ANKER_KWALITEITEN[6],
  LAS_KWALITEITEN[0],
];

/** 依緊結件種類回傳對應之「材質等級」建議清單。 */
export function twBevestigingKwaliteitOpties(type: string): readonly TwSuggestieOptie[] {
  const t = type.trim().toLowerCase();
  if (/高強度|high[- ]?strength|voorspan|摩擦|預力/.test(t)) return HOOGSTERKTE_BOUT_KWALITEITEN;
  if (/錨栓|anchor|anker/.test(t)) return ANKER_KWALITEITEN;
  if (/木|螺釘|coach|houtdraai/.test(t)) return HOUT_BEVESTIGING_KWALITEITEN;
  if (/普通|一般|ordinary|gewone|bolt|bout/.test(t)) return GEWONE_BOUT_KWALITEITEN;
  if (/銲|焊|weld/.test(t)) return LAS_KWALITEITEN;
  if (/剪力釘|stud/.test(t)) return DEUVEL_KWALITEITEN;
  return BEVESTIGING_FALLBACK_KWALITEITEN;
}

/**
 * 台灣版第 3 章材料表列印欄寬（總寬仍為 9 欄以內，維持 `opmerking` 佔 2 欄使
 * `materialen.ts` 的 `OPMERKING_RUIMTE` 碰撞檢查完全相容，同時將 `soort` 由 1 欄
 * 放寬至 2 欄，以容納 `fc'=280 kgf/cm²`、`針葉樹Ⅱ類（普通）` 等完整規格名稱）。
 */
export const KOLOMMEN_TW = {
  type: [1, 2],
  soort: [3, 2],
  opmerking: [5, 2],
  bevestigingType: [7, 2],
  bevestigingKwaliteit: [9, 1],
} as const satisfies Record<string, readonly [number, number]>;
