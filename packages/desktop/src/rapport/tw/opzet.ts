/**
 * 台灣結構計算書報告章節架構（階段 2b）
 *
 * 依據台灣工程慣例與 工作計畫.md §4 階段 2b 規劃之七章結構：
 *   1. 設計概要（工程概述、結構系統、專案角色與報告範圍）
 *   2. 設計規範（自動列出本報告各計算表引用的規範名稱與版次，支援去重與未標註處理）
 *   3. 材料強度（fc′、鋼筋 fy 與等級、鋼材等級）
 *   4. 載重（靜載重、活載重、地震力、風力；土木構造另有土壓、水壓、車載、水文）
 *   5. 分析（分析方法與模型、載重組合）
 *   6. 檢核（每張計算表一節，附控制 UC 與合格判定摘要）
 *   7. 附錄（計算表全文）
 *
 * 上游原版 OPZET 保持原樣不修改；本檔案定義台灣專用之 OPZET_TW 與相關推導函式。
 */
import { inTaal, type Meertalig } from "../meertalig.ts";
import type { Rapport } from "../model.ts";
import type { Blad, Knoop, Rapportknoop } from "../opzet.ts";

/** 台灣工程計算書章節架構定義 */
export const OPZET_TW: readonly Knoop[] = [
  {
    id: "tw-ontwerpoverzicht",
    titel: { en: "Design overview", nl: "Ontwerpoverzicht", "zh-TW": "設計概要" },
    niveau: 1,
    nieuwePagina: true,
    kinderen: [
      { id: "projectomschrijving", titel: { en: "Project description", nl: "Projectomschrijving", "zh-TW": "工程概述" }, niveau: 2, inhoud: "tekst" },
      { id: "toelichting", titel: { en: "Structural system", nl: "Constructiesysteem", "zh-TW": "結構系統" }, niveau: 2, inhoud: "tekst" },
      { id: "rol", titel: { en: "Role in project and report scope", nl: "Rol en bereik", "zh-TW": "專案角色與報告範圍" }, niveau: 2, inhoud: "rol" },
    ],
  },
  {
    id: "tw-normen",
    titel: { en: "Design codes", nl: "Ontwerpnormen", "zh-TW": "設計規範" },
    niveau: 1,
    nieuwePagina: true,
    inhoud: "tekst",
  },
  {
    id: "tw-materialen",
    titel: { en: "Material strengths", nl: "Materiaaleigenschappen", "zh-TW": "材料強度" },
    niveau: 1,
    nieuwePagina: true,
    inhoud: "materialen",
  },
  {
    id: "tw-belastingen",
    titel: { en: "Design loads", nl: "Belastingen", "zh-TW": "載重" },
    niveau: 1,
    nieuwePagina: true,
    inspringen: 1,
    kinderen: [
      { id: "tw-blijvend", titel: { en: "Dead loads (D)", nl: "Blijvende belasting", "zh-TW": "靜載重 (D)" }, niveau: 2, inhoud: "blijvend" },
      { id: "tw-veranderlijk", titel: { en: "Live loads (L)", nl: "Veranderlijke belasting", "zh-TW": "活載重 (L)" }, niveau: 2, inhoud: "veranderlijk" },
      { id: "tw-seismisch", titel: { en: "Seismic load (E)", nl: "Aardbeving", "zh-TW": "地震力 (E)" }, niveau: 2, inhoud: "tekst" },
      { id: "tw-wind", titel: { en: "Wind load (W)", nl: "Windbelasting", "zh-TW": "風力 (W)" }, niveau: 2, inhoud: "wind" },
      { id: "tw-gronddruk", titel: { en: "Earth pressure (H)", nl: "Gronddruk", "zh-TW": "土壓力 (H)" }, niveau: 2, inhoud: "tekst", optioneel: true },
      { id: "tw-waterdruk", titel: { en: "Water pressure (F)", nl: "Waterdruk", "zh-TW": "水壓力 (F)" }, niveau: 2, inhoud: "tekst", optioneel: true },
      { id: "tw-voertuig", titel: { en: "Vehicle load", nl: "Voertuigbelasting", "zh-TW": "車輛載重" }, niveau: 2, inhoud: "tekst", optioneel: true },
      { id: "tw-hydrologie", titel: { en: "Hydrology and runoff", nl: "Hydrologie", "zh-TW": "水文與流量" }, niveau: 2, inhoud: "tekst", optioneel: true },
    ],
  },
  {
    id: "tw-analyse",
    titel: { en: "Structural analysis", nl: "Berekeningsmethoden", "zh-TW": "分析" },
    niveau: 1,
    nieuwePagina: true,
    kinderen: [
      { id: "tw-analysemethode", titel: { en: "Analysis methods and models", nl: "Analysemethode en modellen", "zh-TW": "分析方法與模型" }, niveau: 2, inhoud: "tekst" },
      { id: "tw-combinaties", titel: { en: "Load combinations", nl: "Belastingcombinaties", "zh-TW": "載重組合" }, niveau: 2, inhoud: "factoren" },
    ],
  },
  {
    id: "berekeningen",
    titel: { en: "Structural verifications", nl: "Toetsing", "zh-TW": "檢核" },
    niveau: 1,
    nieuwePagina: true,
    inhoud: "berekeningen",
    optioneel: true,
  },
  {
    id: "tw-bijlagen",
    titel: { en: "Appendices", nl: "Bijlagen", "zh-TW": "附錄" },
    niveau: 1,
    nieuwePagina: true,
    inhoud: "tekst",
    optioneel: true,
  },
];

/** 附錄 A 標題（計算表全文） */
export const BIJLAGE_TW_A: Meertalig = {
  en: "Full calculation sheets",
  nl: "Volledige rekenbladen",
  "zh-TW": "計算表全文",
};

/** 台灣現行主要結構與土木設計規範目錄庫 */
export interface TwNormInfo {
  id: string;
  naam: string;
  editie: string;
  omschrijving: string;
}

export const TW_NORMEN_CATALOGUS: Record<string, TwNormInfo> = {
  rc112: {
    id: "rc112",
    naam: "建築物混凝土結構設計規範",
    editie: "112.08.10 修正（113.01.01 生效）",
    omschrijving: "適用於各類鋼筋混凝土結構構件之強度與使用性檢核",
  },
  steel99: {
    id: "steel99",
    naam: "鋼構造建築物鋼結構設計技術規範",
    editie: "99.09.16 修正（ASD / LRFD）",
    omschrijving: "適用於結構用鋼梁、鋼柱、斜撐與構架之設計與檢核",
  },
  seis113: {
    id: "seis113",
    naam: "建築物耐震設計規範及解說",
    editie: "113.03.01 修正發布施行",
    omschrijving: "工址地震力計算、動力分析與各類結構系統耐震檢核",
  },
  wind103: {
    id: "wind103",
    naam: "建築物耐風設計規範及解說",
    editie: "103.12.03 修正（104.01.01 生效）",
    omschrijving: "主要風抗力系統風力與局部構件風壓計算",
  },
  wind103full: {
    id: "wind103full",
    naam: "建築物耐風設計規範及解說",
    editie: "103.12.03 修正（104.01.01 生效）",
    omschrijving: "主要風抗力系統風力與局部構件風壓計算",
  },
  found112: {
    id: "found112",
    naam: "建築物基礎構造設計規範",
    editie: "112.06.20 修正（113.01.01 生效）",
    omschrijving: "淺基礎、樁基礎與擋土深開挖設計基準",
  },
  btr_struct: {
    id: "btr_struct",
    naam: "建築技術規則建築構造編",
    editie: "112.05.10 修正公布",
    omschrijving: "各類構造基本載重、耐震耐風通則與基本構件要求",
  },
  swc_tech: {
    id: "swc_tech",
    naam: "水土保持技術規範",
    editie: "114.05.07 修正施行",
    omschrijving: "山坡地開發水保設施、擋土牆與排水水文設計",
  },
  hwbridge: {
    id: "hwbridge",
    naam: "公路橋梁設計規範",
    editie: "98.12 版",
    omschrijving: "公路結構物、箱涵與車載設計",
  },
  hwbridge104: {
    id: "hwbridge104",
    naam: "公路橋梁設計規範（104 年修訂）",
    editie: "104.04.13 修訂",
    omschrijving: "公路結構物、箱涵與車載設計",
  },
  hwdrain107: {
    id: "hwdrain107",
    naam: "公路排水設計規範",
    editie: "107.02.06 修正",
    omschrijving: "公路邊溝、涵洞與逕流流量推估",
  },
};

/**
 * 自動彙整計算表引用之設計規範（含去重與無規範處理）
 */
export interface TwNormVerwijzing {
  normId: string;
  naam: string;
  editie: string;
  bladen: string[];
}

export function verzamelTwNormen(bladen: readonly { naam: string; norm?: string }[]): TwNormVerwijzing[] {
  const normMap = new Map<string, { naam: string; editie: string; bladen: string[] }>();
  const geenNormBladen: string[] = [];

  for (const b of bladen) {
    const raw = (b.norm ?? "").trim().toLowerCase();
    if (!raw) {
      geenNormBladen.push(b.naam);
      continue;
    }
    const cat = TW_NORMEN_CATALOGUS[raw];
    const normKey = cat ? cat.id : raw;
    const normNaam = cat ? cat.naam : b.norm!;
    const editie = cat ? cat.editie : "依最新發布版次";

    const item = normMap.get(normKey);
    if (item) {
      if (!item.bladen.includes(b.naam)) item.bladen.push(b.naam);
    } else {
      normMap.set(normKey, { naam: normNaam, editie, bladen: [b.naam] });
    }
  }

  const uit: TwNormVerwijzing[] = [];
  for (const [normId, val] of normMap.entries()) {
    uit.push({ normId, naam: val.naam, editie: val.editie, bladen: val.bladen });
  }

  if (geenNormBladen.length > 0) {
    uit.push({
      normId: "algemeen",
      naam: "結構力學基本原理",
      editie: "一般工程力學與平衡方程式",
      bladen: geenNormBladen,
    });
  }

  return uit;
}

/**
 * 檢核安全總結（worst-case 決策原則）：
 *   - 只要有任一計算表為 false → 總結「不合格」
 *   - 無不合格，但有任一未檢核或缺少 UC → 總結「未檢核」
 *   - 全部計算表均為 true 且有有效 UC → 總結「合格」
 *   - 無計算表 → 總結「未檢核」
 */
export type TwEindoordeel = "合格" | "不合格" | "未檢核";

export interface TwToetsResultaat {
  voldoet: boolean | null;
  nietGetoetst?: boolean;
  uc: number | null;
}

export function bepaalTwEindoordeel(resultaten: readonly TwToetsResultaat[]): {
  oordeel: TwEindoordeel;
  ucMax: number | null;
  aantal: number;
  geslaagd: number;
  afgekeurd: number;
  ongecontroleerd: number;
} {
  if (resultaten.length === 0) {
    return { oordeel: "未檢核", ucMax: null, aantal: 0, geslaagd: 0, afgekeurd: 0, ongecontroleerd: 0 };
  }

  let ucMax: number | null = null;
  let geslaagd = 0;
  let afgekeurd = 0;
  let ongecontroleerd = 0;

  for (const r of resultaten) {
    if (r.uc !== null && Number.isFinite(r.uc)) {
      if (ucMax === null || r.uc > ucMax) ucMax = r.uc;
    }

    if (r.voldoet === false) {
      afgekeurd++;
    } else if (r.voldoet === true && !r.nietGetoetst && r.uc !== null) {
      geslaagd++;
    } else {
      ongecontroleerd++;
    }
  }

  let oordeel: TwEindoordeel = "合格";
  if (afgekeurd > 0) {
    oordeel = "不合格";
  } else if (ongecontroleerd > 0 || geslaagd === 0) {
    oordeel = "未檢核";
  }

  return {
    oordeel,
    ucMax,
    aantal: resultaten.length,
    geslaagd,
    afgekeurd,
    ongecontroleerd,
  };
}

/**
 * 台灣架構章節空節點判斷
 */
function isTwLeeg(k: Knoop, r: Rapport, bladen: readonly Blad[]): boolean {
  switch (k.inhoud) {
    case "tekst":
      if (k.id === "tw-normen") return false; // 設計規範自動產生內容，永不為空
      if (k.id === "tw-bijlagen") {
        return bladen.length === 0 && r.bijlagen.length === 0 && (r.teksten[k.id] ?? "").trim() === "";
      }
      return (r.teksten[k.id] ?? "").trim() === "";
    case "blijvend":
      return r.belastingen.vloerenDaken.length === 0 && r.belastingen.wanden.length === 0;
    case "berekeningen":
      return bladen.length === 0;
    case undefined:
      return (k.kinderen ?? []).every((c) => isTwLeeg(c, r, bladen));
    default:
      return false;
  }
}

function valtTwWeg(k: Knoop, r: Rapport, bladen: readonly Blad[]): boolean {
  return k.optioneel === true && isTwLeeg(k, r, bladen);
}

function nieuwePaginaVoor(id: string, standaard: boolean | undefined, r: Rapport): boolean {
  return r.nieuwePagina[id] ?? standaard ?? false;
}

function staatInHoofdstuk(r: Rapport, b: Pick<Blad, "id" | "plek">): boolean {
  return r.inHoofdstuk[b.id] ?? b.plek === "hoofdstuk";
}

function bladKnopenTw(nummer: string, r: Rapport, bladen: Blad[]): Rapportknoop[] {
  let inBijlage = 0;
  return bladen.map((b, i): Rapportknoop => ({
    id: b.id,
    titel: b.naam,
    niveau: 2,
    nummer: `${nummer}.${i + 1}`,
    nieuwePagina: nieuwePaginaVoor(b.id, false, r),
    kinderen: [],
    blad: {
      id: b.id,
      naam: b.naam,
      bijlage: staatInHoofdstuk(r, b) ? "" : `A.${++inBijlage}`,
      ...(b.koppen?.length ? { koppen: b.koppen } : {}),
      ...(b.figuur ? { figuur: true } : {}),
    },
  }));
}

function bouwKnoopTw(k: Knoop, nummer: string, r: Rapport, bladen: Blad[]): Rapportknoop {
  const kinderen = k.inhoud === "berekeningen"
    ? bladKnopenTw(nummer, r, bladen)
    : (k.kinderen ?? [])
        .filter((c) => !valtTwWeg(c, r, bladen))
        .map((c, j) => bouwKnoopTw(c, c.niveau === 2 ? `${nummer}.${j + 1}` : "", r, bladen));
  const { titelNieuwbouw: _kop, ...rest } = k;
  return {
    ...rest,
    titel: inTaal(k.titel, r.taal),
    nummer,
    nieuwePagina: nieuwePaginaVoor(k.id, k.nieuwePagina, r),
    kinderen,
  };
}

/**
 * 依據台灣版架構（OPZET_TW）建構報告章節樹
 */
export function bouwTwOpzet(r: Rapport, bladen: Blad[]): Rapportknoop[] {
  return OPZET_TW
    .filter((k) => !valtTwWeg(k, r, bladen))
    .map((k, i) => bouwKnoopTw(k, String(i + 1), r, bladen));
}

/** 台灣版專屬章節預設標準文字 */
export const TW_STANDAARD_TEKSTEN: Record<string, Meertalig> = {
  "tw-normen": {
    en: "Structural design for this project conforms to the current Building Technical Regulations and relevant design specifications in Taiwan. Design standards and editions are detailed below.",
    nl: "Het constructief ontwerp voor dit project voldoet aan de geldende Bouwtechnische Voorschriften en normen in Taiwan. De toegepaste normen en edities staan hieronder vermeld.",
    "zh-TW": "本工程結構設計恪遵中華民國現行建築技術規則及各項結構設計規範，主要設計標準如下表所列。各項構件檢核引述之條文、公式與符號，均依各該規範最新公布版次為準。",
  },
  "tw-seismisch": {
    en: "Seismic actions are evaluated according to the Seismic Design Code for Buildings in Taiwan using equivalent static analysis and response spectrum dynamic analysis.",
    nl: "Aardbevingsbelastingen worden berekend volgens de Taiwanese aardbevingsnorm met behulp van statische en dynamische responsiespectrumanalyses.",
    "zh-TW": "依建築技術規則建築構造編及建築物耐震設計規範規定，工址地震力計算採靜力分析法及反應譜動力分析法辦理。",
  },
  "tw-analysemethode": {
    en: "Structural analysis is performed using a linear elastic 3D/2D frame model under combined gravity and lateral wind/seismic actions, accounting for member stiffness reductions and P-Delta second-order effects.",
    nl: "De constructieve analyse is uitgevoerd met behulp van een lineair elastisch raamwerkmodel onder zwaartekracht-, wind- en aardbevingscombinaties, met inbegrip van stijfheidsreducties en P-Delta-effecten.",
    "zh-TW": "結構系統分析採線彈性空間構架分析模型，考量垂直靜載重、活載重及側向地震力、風力之載重組合。各構件內力分析計入構件勁度折減與二次效應（P-Δ效應）。",
  },
  "tw-bijlagen": {
    en: "The appendices to this report contain the complete design and verification calculation sheets for all structural members.",
    nl: "De bijlagen van dit rapport bevatten de volledige berekeningsbladen en toetsingen voor alle constructieve onderdelen.",
    "zh-TW": "本報告附錄包含本案各項結構構件之詳細計算表，檢核過程、公式推導與數值詳見後附計算書全文。",
  },
};

