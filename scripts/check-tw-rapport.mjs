/**
 * 台灣結構計算書報告架構檢核腳本（階段 2b）。
 *
 * 驗證範圍：
 * 1. 七章架構與目錄（OPZET_TW、bouwTwOpzet、inhoudsopgave、bijlagen）
 * 2. 規範目錄庫與動態彙整（verzamelTwNormen、去重與未標註規範處理）
 * 3. 檢核安全判定（bepaalTwEindoordeel：worst-case 原則、刻意不合格測試）
 * 4. 舊版報告向下相容性（normaliseerRapport、opzetSoort 預設與遷移）
 * 5. A 級與 B 級規範數值檢核（載重組合、屋頂活載重、用途係數、材料重量、第 17 條待補標記）
 * 6. 報告面板整合與 zh-TW 繁中輸出純淨度
 *
 * 執行方式：
 *   node scripts/check-tw-rapport.mjs
 */

import { normaliseerRapport, RAPPORT_VERSIE, standaardRapport } from "../packages/desktop/src/rapport/model.ts";
import { wisselTaal } from "../packages/desktop/src/rapport/taalwissel.ts";
import {
  BEVESTIGING_VANAF,
  OPMERKING_RUIMTE,
  bevestigingBegin,
  tekstBreedte,
} from "../packages/desktop/src/rapport/materialen.ts";
import {
  KOLOMMEN_TW,
  TW_BEVESTIGING_TYPEN,
  TW_MATERIAAL_TYPEN,
  twBevestigingKwaliteitOpties,
  twMateriaalSoortOpties,
} from "../packages/desktop/src/rapport/tw/materialen.ts";
import { inhoudsopgave, bijlagen, bouwOpzet } from "../packages/desktop/src/rapport/opzet.ts";
import {
  OPZET_TW,
  bouwTwOpzet,
  verzamelTwNormen,
  bepaalTwEindoordeel,
  TW_NORMEN_CATALOGUS,
  BIJLAGE_TW_A,
} from "../packages/desktop/src/rapport/tw/opzet.ts";
import {
  TW_RC_BELASTINGCOMBINATIES,
  TW_DAK_VERANDERLIJK_T26,
  TW_SEISMISCH_I,
  TW_EENHEIDSGEWICHTEN,
  TW_VLOER_VERANDERLIJK_TABEL,
  TW_VLOER_VERANDERLIJK_STATUS,
  TW_VERANDERLIJK_BIJZONDER,
  TW_VLOER_AFWERKING_T14,
  TW_WAND_AFWERKING_T15,
} from "../packages/desktop/src/rapport/tw/normwaarden.ts";
import * as twNormwaarden from "../packages/desktop/src/rapport/tw/normwaarden.ts";
import { TW_PROJECT_VELDEN } from "../packages/desktop/src/components/calc/twGrondslagen.ts";
import { vindKnoop, HOOFDSTUKKEN_TW } from "../packages/desktop/src/components/rapport/paneel/hulp.ts";

let fouten = 0;
let getest = 0;

function waar(wat, ok, detail = "") {
  getest++;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${wat}${ok || !detail ? "" : ` — ${detail}`}`);
}

console.log("\n1. 台灣報告七章架構與編號 (OPZET_TW / bouwTwOpzet)");
{
  waar("OPZET_TW 包含完整七個頂層章節", OPZET_TW.length === 7);

  const verwachteKoppen = [
    { id: "tw-ontwerpoverzicht", titel: "設計概要" },
    { id: "tw-normen", titel: "設計規範" },
    { id: "tw-materialen", titel: "材料強度" },
    { id: "tw-belastingen", titel: "載重" },
    { id: "tw-analyse", titel: "分析" },
    { id: "berekeningen", titel: "檢核" },
    { id: "tw-bijlagen", titel: "附錄" },
  ];

  for (let i = 0; i < verwachteKoppen.length; i++) {
    const k = OPZET_TW[i];
    const exp = verwachteKoppen[i];
    waar(`章節 ${i + 1} id 為 ${exp.id}`, k.id === exp.id);
    waar(`章節 ${i + 1} 中文標題為 ${exp.titel}`, k.titel["zh-TW"] === exp.titel);
    waar(`章節 ${i + 1} niveau 為 1`, k.niveau === 1);
  }

  // 測試有計算表時的章節樹建構
  const rTw = standaardRapport("09-11-2026", {}, "zh-TW");
  const testBladen = [
    { id: "b1", naam: "RC 梁設計與檢核 (B1)", norm: "rc112", plek: "bijlage", resultaat: { uc: 0.82, voldoet: true } },
    { id: "b2", naam: "RC 柱檢核 (C1)", norm: "rc112", plek: "bijlage", resultaat: { uc: 0.95, voldoet: true } },
  ];

  const knopen = bouwOpzet(rTw, testBladen);
  waar("台灣報告章節樹產生 7 個頂層節點", knopen.length === 7);
  for (let i = 0; i < knopen.length; i++) {
    waar(`節點 ${i + 1} 編號為 ${String(i + 1)}`, knopen[i].nummer === String(i + 1));
  }

  // 檢核目錄與附錄
  const io = inhoudsopgave(knopen);
  waar("目錄包含各章與節項目", io.length >= 7);
  // 頁碼本身由 check-paginering.mjs（paginaVanAnkers：由分頁結果推出，與實際頁一致）與
  // check-rapport-pdf.mjs（PDF 內標題落在目錄所指頁）驗證；台灣架構走同一條 inhoudsopgave 路徑，
  // 這裡確認它交給分頁的錨點可用：每項有編號、標題、錨點，且錨點不重複（重複時 paginaVanAnkers 取第一頁）。
  waar("目錄每項都有編號、標題與錨點", io.every((x) => x.nummer && x.titel && x.anker));
  waar("目錄錨點不重複", new Set(io.map((x) => x.anker)).size === io.length);
  waar("目錄編號不重複", new Set(io.map((x) => x.nummer)).size === io.length);
  const ioOntwerp = io.find((x) => x.anker === "tw-ontwerpoverzicht");
  const ioNormen = io.find((x) => x.anker === "tw-normen");
  const ioMaterialen = io.find((x) => x.anker === "tw-materialen");
  const ioBelastingen = io.find((x) => x.anker === "tw-belastingen");
  const ioAnalyse = io.find((x) => x.anker === "tw-analyse");
  const ioBerekeningen = io.find((x) => x.anker === "berekeningen");
  const ioBijlagen = io.find((x) => x.anker === "tw-bijlagen");

  waar("目錄包含設計概要章節 (1)", ioOntwerp?.titel === "設計概要" && ioOntwerp?.nummer === "1");
  waar("目錄包含設計規範章節 (2)", ioNormen?.titel === "設計規範" && ioNormen?.nummer === "2");
  waar("目錄包含材料強度章節 (3)", ioMaterialen?.titel === "材料強度" && ioMaterialen?.nummer === "3");
  waar("目錄包含載重章節 (4)", ioBelastingen?.titel === "載重" && ioBelastingen?.nummer === "4");
  waar("目錄包含分析章節 (5)", ioAnalyse?.titel === "分析" && ioAnalyse?.nummer === "5");
  waar("目錄包含檢核章節 (6)", ioBerekeningen?.titel === "檢核" && ioBerekeningen?.nummer === "6");
  waar("目錄包含附錄章節 (7)", ioBijlagen?.titel === "附錄" && ioBijlagen?.nummer === "7");

  const bList = bijlagen(rTw, testBladen);
  waar("附錄 A 標題為計算表全文", bList[0]?.titel === BIJLAGE_TW_A["zh-TW"]);
}

console.log("\n2. 設計規範目錄庫與動態彙整 (verzamelTwNormen)");
{
  waar("TW_NORMEN_CATALOGUS 收錄 rc112", Boolean(TW_NORMEN_CATALOGUS.rc112));
  waar("TW_NORMEN_CATALOGUS 收錄 steel99", Boolean(TW_NORMEN_CATALOGUS.steel99));
  waar("TW_NORMEN_CATALOGUS 收錄 seis113", Boolean(TW_NORMEN_CATALOGUS.seis113));
  waar("TW_NORMEN_CATALOGUS 收錄 btr_struct", Boolean(TW_NORMEN_CATALOGUS.btr_struct));

  // 1. 單張表
  const n1 = verzamelTwNormen([{ naam: "梁檢核", norm: "rc112" }]);
  waar("單張 rc112 產出一筆規範", n1.length === 1);
  waar("規範名稱包含建築物混凝土結構設計規範", n1[0].naam === "建築物混凝土結構設計規範");
  waar("引用計算表包含梁檢核", n1[0].bladen.includes("梁檢核"));

  // 2. 去重測試：兩張表同為 rc112
  const n2 = verzamelTwNormen([
    { naam: "梁檢核", norm: "rc112" },
    { naam: "柱檢核", norm: "rc112" },
  ]);
  waar("相同規範自動去重為 1 筆", n2.length === 1);
  waar("去重後 bladen 包含兩張計算表", n2[0].bladen.length === 2 && n2[0].bladen.includes("柱檢核"));

  // 3. 多部不同規範
  const n3 = verzamelTwNormen([
    { naam: "RC梁", norm: "rc112" },
    { naam: "鋼斜撐", norm: "steel99" },
    { naam: "耐震分析", norm: "seis113" },
  ]);
  waar("多規範正確列出 3 筆", n3.length === 3);

  // 4. 未標註規範的計算表
  const n4 = verzamelTwNormen([
    { naam: "力學簡化桁架", norm: "" },
    { naam: "RC梁", norm: "rc112" },
  ]);
  waar("未標註規範之計算表列入結構力學基本原理", n4.some((x) => x.normId === "algemeen" && x.bladen.includes("力學簡化桁架")));
}

console.log("\n3. 檢核安全判定與 worst-case 決策 (bepaalTwEindoordeel)");
{
  // 案例 1：全部合格
  const o1 = bepaalTwEindoordeel([
    { voldoet: true, uc: 0.75 },
    { voldoet: true, uc: 0.92 },
    { voldoet: true, uc: 0.60 },
  ]);
  waar("全部通過且有 UC → 合格", o1.oordeel === "合格");
  waar("最大控制 UC 正確", o1.ucMax === 0.92);
  waar("統計數量正確", o1.geslaagd === 3 && o1.afgekeurd === 0 && o1.ongecontroleerd === 0);

  // 案例 2：刻意製造不合格案例（即使只有 1 項不合格，全案總結必須為不合格）
  const o2 = bepaalTwEindoordeel([
    { voldoet: true, uc: 0.85 },
    { voldoet: false, uc: 1.15 },
    { voldoet: true, uc: 0.60 },
  ]);
  waar("任一表不合格 → 總結不合格（絕不誤判合格）", o2.oordeel === "不合格");
  waar("控制 UC 取全案最大值 1.15", o2.ucMax === 1.15);
  waar("不合格計數為 1", o2.afgekeurd === 1 && o2.geslaagd === 2);

  // 案例 3：含有未檢核或缺少 UC
  const o3 = bepaalTwEindoordeel([
    { voldoet: true, uc: 0.70 },
    { voldoet: null, uc: null, nietGetoetst: true },
  ]);
  waar("含未檢核項目且無不合格 → 總結未檢核", o3.oordeel === "未檢核");
  waar("未檢核計數為 1", o3.ongecontroleerd === 1 && o3.geslaagd === 1);

  // 案例 4：空列表
  const o4 = bepaalTwEindoordeel([]);
  waar("無計算表時 → 總結未檢核", o4.oordeel === "未檢核" && o4.aantal === 0);
}

console.log("\n4. 報告模型版本演進與向下相容 (normaliseerRapport)");
{
  waar("RAPPORT_VERSIE 已提升至 6", RAPPORT_VERSIE === 6);

  // 繁體中文新報告預設為 tw 架構
  const rTw = standaardRapport("09-11-2026", {}, "zh-TW");
  waar("新建 zh-TW 報告 opzetSoort 為 tw", rTw.opzetSoort === "tw");

  // 荷蘭文與英文新報告預設為 eurocode
  const rNl = standaardRapport("09-11-2026", {}, "nl");
  const rEn = standaardRapport("09-11-2026", {}, "en");
  waar("新建 nl 報告 opzetSoort 為 eurocode", rNl.opzetSoort === "eurocode");
  waar("新建 en 報告 opzetSoort 為 eurocode", rEn.opzetSoort === "eurocode");

  // 舊版報告（版本 < 6 或無 opzetSoort）標準化時，自動賦予 eurocode，絕不變更既有行為
  const oudRapportV5 = {
    versie: 5,
    taal: "nl",
    titel: "Oud project",
    revisies: [{ code: "A", datum: "2024-01-01", omschrijving: "Eerste uitgave", auteur: "Eng" }],
    // 故意無 opzetSoort
  };
  const normV5 = normaliseerRapport(oudRapportV5, "09-11-2026", {}, "nl");
  waar("舊版 v5 報告正規化後 opzetSoort 設為 eurocode", normV5.opzetSoort === "eurocode");
  waar("舊版 v5 報告正規化後版本提升至 6", normV5.versie === 6);

  // 舊版報告建構章節樹維持 Eurocode 5 章結構（無計算表時）
  const knopenEurocode = bouwOpzet(normV5, []);
  waar("Eurocode 舊版報告章節樹維持原 5 章結構", knopenEurocode.length === 5);
}

console.log("\n5. A 級與 B 級規範常數庫檢核 (normwaarden.ts)");
{
  // 載重組合（rc112 表 5.3.1）
  waar("TW_RC_BELASTINGCOMBINATIES 包含 7 組載重組合", TW_RC_BELASTINGCOMBINATIES.length === 7);
  const u1 = TW_RC_BELASTINGCOMBINATIES.find((c) => c.naam === "U_1");
  const u2 = TW_RC_BELASTINGCOMBINATIES.find((c) => c.naam === "U_2");
  const u5 = TW_RC_BELASTINGCOMBINATIES.find((c) => c.naam === "U_5");
  waar("U1 公式為 U = 1.4 D", u1?.formule === "U = 1.4 D");
  waar("U2 公式包含 1.2 D + 1.6 L", Boolean(u2?.formule.includes("1.2 D + 1.6 L")));
  waar("U5 公式包含 1.2 D + 1.0 E", Boolean(u5?.formule.includes("1.2 D + 1.0 E")));

  // 屋頂活載重（建築技術規則建築構造編第 26 條表，A 級 btr_struct_roof_live_T26）
  waar("TW_DAK_VERANDERLIJK_T26 包含 7 類屋頂坡度區分", TW_DAK_VERANDERLIJK_T26.length === 7);
  const platDak = TW_DAK_VERANDERLIJK_T26[0];
  waar("平屋頂活載重 ≤20m² 為 100 kgf/m²", platDak.klein_20 === 100);
  waar("平屋頂活載重 20–60m² 為 80 kgf/m²", platDak.midden_60 === 80);
  waar("平屋頂活載重 >60m² 為 60 kgf/m²", platDak.groot_60 === 60);

  // 用途係數 I（建築技術規則建築構造編第 43-1 條，A 級 seis_importance_I）
  const seisiI = TW_SEISMISCH_I.find((s) => s.categorie === "第一類")?.waarde;
  const seisiII = TW_SEISMISCH_I.find((s) => s.categorie === "第二類")?.waarde;
  const seisiIII = TW_SEISMISCH_I.find((s) => s.categorie === "第三類")?.waarde;
  const seisiIV = TW_SEISMISCH_I.find((s) => s.categorie === "第四類")?.waarde;
  waar("用途係數第 I 類為 1.5", seisiI === 1.5);
  waar("用途係數第 II 類為 1.5", seisiII === 1.5);
  waar("用途係數第 III 類為 1.25", seisiIII === 1.25);
  waar("用途係數第 IV 類為 1.0", seisiIV === 1.0);

  // 材料單位體積重量（建築技術規則建築構造編第 11 條，A 級 btr_struct_unit_weight_T11）
  const rcGewicht = TW_EENHEIDSGEWICHTEN.find((g) => g.materiaal === "鋼筋混凝土")?.rho_kg_m3;
  const staalGewicht = TW_EENHEIDSGEWICHTEN.find((g) => g.materiaal === "鋼")?.rho_kg_m3;
  const baksteenGewicht = TW_EENHEIDSGEWICHTEN.find((g) => g.materiaal === "磚")?.rho_kg_m3;
  waar("鋼筋混凝土單位重量為 2400 kgf/m³", rcGewicht === 2400);
  waar("鋼單位重量為 7850 kgf/m³", staalGewicht === 7850);
  waar("磚單位重量為 1900 kgf/m³", baksteenGewicht === 1900);
  // 已驗證表 btr_struct_unit_weight_T11 之名稱與值（逐列對照，名稱須照錄原表）
  const T11 = { 鋼筋混凝土: 2400, 水泥混凝土: 2300, 鋼: 7850, 磚: 1900, 砂石: 2000, 花崗石: 2500, 大理石: 2700 };
  waar("單位重名稱與值逐列等於第 11 條原表",
    TW_EENHEIDSGEWICHTEN.length === Object.keys(T11).length &&
    TW_EENHEIDSGEWICHTEN.every((g) => T11[g.materiaal] === g.rho_kg_m3));
  // γ 由 ρ 以 g = 9.80665 換算：2400 kgf/m³ → 23.53596 kN/m³（獨立手算）
  waar("γ 由 ρ·g 換算：鋼筋混凝土 23.53596 kN/m³",
    Math.abs(TW_EENHEIDSGEWICHTEN.find((g) => g.materiaal === "鋼筋混凝土").gamma_kN_m3 - 23.53596) < 1e-9);

  // 第 14 條、第 15 條（已驗證表 btr_struct_floor_weight_T14、btr_struct_wall_weight_T15）
  waar("第 14 條地板面重量 8 列，合計 184 kgf/m²",
    TW_VLOER_AFWERKING_T14.length === 8 && TW_VLOER_AFWERKING_T14.reduce((s, r) => s + r.gewicht_kgf_m2, 0) === 184);
  // 牆壁 14 列合計 2179，粉刷貼面 6 列合計 135（逐列手算）
  waar("第 15 條牆壁與粉刷貼面 20 列，合計 2314 kgf/m²",
    TW_WAND_AFWERKING_T15.length === 20 && TW_WAND_AFWERKING_T15.reduce((s, r) => s + r.gewicht_kgf_m2, 0) === 2314);
  waar("第 15 條紅磚牆一磚厚 440、混凝土空心磚牆 20 公分 250",
    TW_WAND_AFWERKING_T15.find((r) => r.onderdeel === "紅磚牆 一磚厚")?.gewicht_kgf_m2 === 440 &&
    TW_WAND_AFWERKING_T15.find((r) => r.onderdeel === "混凝土空心磚牆 20 公分")?.gewicht_kgf_m2 === 250);

  // 第 43-1 條第三類之說明照錄原表（不得改寫為列舉特定場所）
  waar("用途係數第三類說明照錄第 43-1 條原表",
    TW_SEISMISCH_I.find((s) => s.categorie === "第三類")?.omschrijving.startsWith("第 17 條第 5 項所定人群聚集之場所"));

  // 構造編第 17 條附表（B 級，官方附件 LawGetFile FileId=0000341671 於 2026-11-13 逐列核對）
  const T17 = TW_VLOER_VERANDERLIJK_TABEL;
  waar("第 17 條附表共 40 列且 id 為 1～40 連號", T17.length === 40 && T17.every((r, i) => r.id === i + 1));
  waar("第 17 條附表每列都有組別、用途、數值與 B 級出處",
    T17.every((r) => r.groep && r.gebruik && /^\d+$/.test(r.qlast_kgf ?? "") && (r.menigte === 0 || r.menigte === 1) && /^B 級：建築技術規則建築構造編第 17 條附表/.test(r.bron)));
  waar("第 17 條附表數值僅出現附表值 200/250/300/400/500/600", T17.every((r) => ["200", "250", "300", "400", "500", "600"].includes(r.qlast_kgf)));
  // 官方附表逐組別核對：[組別, 該組別各列之值（依附表列序）]
  const 官方 = [
    ["A-1", [300, 400, 500]], ["A-2", [400]], ["B-1", [300, 500]], ["B-2", [400, 500]], ["B-3", [300]], ["B-4", [200]],
    ["C-1", [500]], ["C-2", [500, 600]], ["D-1", [400, 500]], ["D-2", [300, 400, 500]], ["D-3", [250]], ["D-4", [250]], ["D-5", [250]],
    ["E", [200, 400, 500]], ["F-1", [200, 300]], ["F-2", [200, 300]], ["F-3", [250]], ["F-4", [300]],
    ["G-1", [300]], ["G-2", [300, 300]], ["G-3", [300]], ["H-1", [200]], ["H-2", [200, 200]], ["I", [300, 500, 600]],
  ];
  for (const [g, 值] of 官方) {
    const 實 = T17.filter((r) => r.groep === g).map((r) => Number(r.qlast_kgf));
    waar(`第 17 條附表 ${g} 組別數值 ${值.join("/")}`, 實.length === 值.length && 實.every((v, i) => v === 值[i]), `實際 ${實.join("/")}`);
  }
  waar("第 17 條附表組別清單與官方一致（無多餘或缺漏組別）", new Set(T17.map((r) => r.groep)).size === 官方.length);
  waar("樓地板活載重狀態標示 B 級並註明官方附件為準", /^B 級：建築技術規則建築構造編第 17 條附表/.test(TW_VLOER_VERANDERLIJK_STATUS) && TW_VLOER_VERANDERLIJK_STATUS.includes("以官方附件為準") && !TW_VLOER_VERANDERLIJK_STATUS.includes("待補"));
  // 人群聚集旗標：第 17 條末項只列入的組別不得標 0，未列入者不得標 1（混列取 1 偏保守）
  waar("A、D、E、F、G-1 各列人群聚集旗標為 1", T17.filter((r) => /^(A|D|E|F|G-1)/.test(r.groep)).every((r) => r.menigte === 1));
  waar("B-4、C、I 各列人群聚集旗標為 0", T17.filter((r) => /^(B-4|C|I)/.test(r.groep)).every((r) => r.menigte === 0));

  // 構造編第 17 條 B 級條文摘錄（含 LawAll 來源出處）
  waar("TW_VERANDERLIJK_BIJZONDER 包含 4 項官方核對法規條款", TW_VERANDERLIJK_BIJZONDER.length === 4);
  for (const item of TW_VERANDERLIJK_BIJZONDER) {
    waar(`條款「${item.gebruik}」標註 B 級出處`, item.bron.startsWith("B 級：建築技術規則建築構造編"));
  }

  // 不得有無出處之工程慣用數值（AGENTS.md §3）
  waar("常數庫不含無出處之慣用數值（TW_PRAKTIJK_AANNAME 已移除）", !("TW_PRAKTIJK_AANNAME" in twNormwaarden));
  waar("常數庫每一列都有 A 級或 B 級出處",
    [...TW_RC_BELASTINGCOMBINATIES, ...TW_DAK_VERANDERLIJK_T26, ...TW_VERANDERLIJK_BIJZONDER, ...TW_SEISMISCH_I,
      ...TW_EENHEIDSGEWICHTEN, ...TW_VLOER_AFWERKING_T14, ...TW_WAND_AFWERKING_T15]
      .every((r) => /^[AB] 級：/.test(r.bron)));
}

console.log("\n6. 報告面板整合與章節導覽 (HOOFDSTUKKEN_TW / vindKnoop)");
{
  waar("HOOFDSTUKKEN_TW 包含 5 個章節 ID", HOOFDSTUKKEN_TW.length === 5);
  waar("HOOFDSTUKKEN_TW 包含 tw-ontwerpoverzicht", HOOFDSTUKKEN_TW.includes("tw-ontwerpoverzicht"));
  waar("HOOFDSTUKKEN_TW 包含 tw-normen", HOOFDSTUKKEN_TW.includes("tw-normen"));
  waar("HOOFDSTUKKEN_TW 包含 tw-seismisch", HOOFDSTUKKEN_TW.includes("tw-seismisch"));
  waar("HOOFDSTUKKEN_TW 包含 tw-analysemethode", HOOFDSTUKKEN_TW.includes("tw-analysemethode"));
  waar("HOOFDSTUKKEN_TW 包含 tw-bijlagen", HOOFDSTUKKEN_TW.includes("tw-bijlagen"));

  const knoopNormen = vindKnoop("tw-normen");
  waar("vindKnoop 能正確定位 tw-normen", knoopNormen?.id === "tw-normen");
  waar("tw-normen 標題為設計規範", knoopNormen?.titel["zh-TW"] === "設計規範");

  const knoopAnalyse = vindKnoop("tw-analysemethode");
  waar("vindKnoop 能正確定位 tw-analysemethode", knoopAnalyse?.id === "tw-analysemethode");
}

console.log("\n7. 台灣專案參數 (twGrondslagen.ts)");
{
  const veld = (naam) => TW_PROJECT_VELDEN.find((v) => v.naam === naam);
  // seis113 第 2.5 節：S_DS = F_a·S_S^D、S_D1 = F_v·S_1^D，沒有 ASCE 7 的 2/3 係數
  for (const naam of ["tw_SDS", "tw_SD1"]) {
    waar(`${naam} 的說明不含 ASCE 7 之 2/3 係數，並引用 seis113 第 2.5 節`,
      !/2\s*\/\s*3/.test(veld(naam).hint) && veld(naam).hint.includes("seis113 第 2.5 節"));
  }
  // wind103full_V10_zones：六級 47.5／42.5／37.5／32.5／27.5／22.5 m/s
  const v10 = veld("tw_V10").opties.map((o) => o.waarde);
  waar("V10 選項為已驗證表之六級風速", JSON.stringify(v10) === JSON.stringify(["47.5", "42.5", "37.5", "32.5", "27.5", "22.5"]));
  // 臺南市中西、東、南、北、安平、安南區屬 37.5 m/s 區；放在較低風速區會低估風力
  const optie = (w) => veld("tw_V10").opties.find((o) => o.waarde === w).label;
  waar("臺南市區不列在 32.5 m/s 區", !optie("32.5").includes("臺南"));
  waar("每個 V10 選項的地名都屬於該風速區（抽查）",
    optie("37.5").includes("臺南市中西") && optie("32.5").includes("臺中市中") && optie("27.5").includes("烏日"));
}

console.log("\n8. 台灣版採用材料規格、緊結件預設值與聯動建議清單 (tw/materialen.ts)");
{
  const tw = standaardRapport("20-11-2026", {}, "zh-TW");
  const nl = standaardRapport("20-11-2026", {}, "nl");
  const en = standaardRapport("20-11-2026", {}, "en");

  // 預設材料 5 列與無歐規殘留
  const mat = tw.uitgangspunten.materialen;
  waar("zh-TW 預設材料為 5 列", mat.length === 5);
  waar("場鑄混凝土預設 fc'=280 kgf/cm²", mat.some((m) => m.type === "場鑄混凝土" && m.soort === "fc'=280 kgf/cm²"));
  waar("鋼筋預設 SD420W", mat.some((m) => m.type === "鋼筋" && m.soort === "SD420W"));
  waar("結構用鋼材預設 SN490B", mat.some((m) => m.type === "結構用鋼材" && m.soort === "SN490B"));
  waar("無收縮水泥砂漿預設 fc'=420 kgf/cm²", mat.some((m) => m.type === "鋼骨座漿無收縮水泥砂漿" && m.soort === "fc'=420 kgf/cm²"));
  waar("木材預設 針葉樹Ⅱ類（普通）", mat.some((m) => m.type === "木材" && m.soort === "針葉樹Ⅱ類（普通）"));

  const eurocodeSoorten = ["C20/25", "C24", "CE2+", "B500", "S235", "K50"];
  waar("zh-TW 預設材料不含歐規強度代號", mat.every((m) => !eurocodeSoorten.includes(m.soort)));

  // 預設緊結件 3 列與無歐規殘留
  const bev = tw.uitgangspunten.bevestiging;
  waar("zh-TW 預設緊結件為 3 列", bev.length === 3);
  waar("緊結件預設含 F10T / A307 / SUS304",
    bev.some((b) => b.type === "高強度螺栓" && b.kwaliteit === "F10T") &&
    bev.some((b) => b.type === "普通螺栓" && b.kwaliteit === "A307") &&
    bev.some((b) => b.type === "化學錨栓" && b.kwaliteit === "SUS304"));
  waar("zh-TW 預設緊結件不含歐規等級 8.8 / 4.6 / 5.8", bev.every((b) => !["8.8", "4.6", "5.8"].includes(b.kwaliteit)));

  // 歐規報告維持原樣
  waar("nl / en 報告維持原本 6 列歐規材料與 3 列歐規緊結件",
    nl.uitgangspunten.materialen.length === 6 &&
    en.uitgangspunten.materialen.length === 6 &&
    nl.uitgangspunten.materialen.some((m) => m.soort === "S235") &&
    en.uitgangspunten.materialen.some((m) => m.soort === "C20/25") &&
    nl.uitgangspunten.bevestiging.some((b) => b.kwaliteit === "8.8") &&
    en.uitgangspunten.bevestiging.some((b) => b.kwaliteit === "8.8"));

  // normaliseerRapport 向下相容性
  const opgeslagenTw = {
    versie: 6,
    taal: "zh-TW",
    opzetSoort: "tw",
    uitgangspunten: {
      materialen: [{ type: "場鑄混凝土", soort: "C20/25", opmerking: "舊檔自訂" }],
      bevestiging: [{ type: "螺栓", kwaliteit: "8.8" }],
    },
  };
  const normSaved = normaliseerRapport(opgeslagenTw, "20-11-2026", {}, "zh-TW");
  waar("已存檔報告之材料與緊結件原樣保留不覆寫",
    normSaved.uitgangspunten.materialen.length === 1 &&
    normSaved.uitgangspunten.materialen[0].soort === "C20/25" &&
    normSaved.uitgangspunten.bevestiging[0].kwaliteit === "8.8");

  const normV5 = normaliseerRapport({ versie: 5, taal: "nl" }, "20-11-2026", {}, "zh-TW");
  waar("舊版 v5 缺 materialen 時補歐規 6 列", normV5.opzetSoort === "eurocode" && normV5.uitgangspunten.materialen.length === 6);

  const normTwLeeg = normaliseerRapport({ versie: 6, taal: "zh-TW", opzetSoort: "tw" }, "20-11-2026", {}, "zh-TW");
  waar("v6 tw 缺 materialen 時補台灣 5 列",
    normTwLeeg.opzetSoort === "tw" &&
    normTwLeeg.uitgangspunten.materialen.length === 5 &&
    normTwLeeg.uitgangspunten.materialen[0].soort === "fc'=280 kgf/cm²");

  // 種類建議清單與依種類聯動
  waar("材料種類與緊結件種類清單非空", TW_MATERIAAL_TYPEN.length >= 10 && TW_BEVESTIGING_TYPEN.length >= 6);

  const betonOpties = twMateriaalSoortOpties("場鑄混凝土").map((o) => o.waarde);
  const verwachtFc = [140, 175, 210, 245, 280, 350, 420, 490, 560].map((v) => `fc'=${v} kgf/cm²`);
  waar("混凝土清單涵蓋 140～560 共 9 級", verwachtFc.every((v) => betonOpties.includes(v)));

  const groutOpties = twMateriaalSoortOpties("鋼骨座漿無收縮水泥砂漿").map((o) => o.waarde);
  waar("無收縮水泥砂漿不會誤分類為一般混凝土",
    groutOpties.includes("fc'=420 kgf/cm²") && !groutOpties.includes("fc'=140 kgf/cm²"));

  const rebarOpties = twMateriaalSoortOpties("鋼筋").map((o) => o.waarde);
  waar("鋼筋清單含 SD280～SD550W 與 CNS 6919",
    ["SD280", "SD280W", "SD420", "SD420W", "SD490", "SD490W", "SD550W", "CNS 6919"].every((v) => rebarOpties.includes(v)));

  const staalOpties = twMateriaalSoortOpties("結構用鋼材").map((o) => o.waarde);
  waar("結構鋼清單含 SS400／SM490B／SN490B／ASTM A36／A572 Gr.50／A992",
    ["SS400", "SM490B", "SN490B", "ASTM A36", "ASTM A572 Gr.50", "ASTM A992"].every((v) => staalOpties.includes(v)));

  const buisOpties = twMateriaalSoortOpties("結構用鋼管").map((o) => o.waarde);
  waar("鋼管清單含 STKR400／STKR490／STK400／STK490",
    ["STKR400", "STKR490", "STK400", "STK490"].every((v) => buisOpties.includes(v)) && !buisOpties.includes("SS400"));

  const houtOpties = twMateriaalSoortOpties("木材").map((o) => o.waarde);
  waar("木材清單含針葉樹／闊葉樹與 CNS 11031 集成材",
    houtOpties.includes("針葉樹Ⅱ類（普通）") &&
    houtOpties.includes("闊葉樹Ⅰ類（普通）") &&
    houtOpties.some((v) => v.includes("CNS 11031")));

  const glulamOpties = twMateriaalSoortOpties("結構用集成材").map((o) => o.waarde);
  waar("集成材清單含 CNS 11031 等級", glulamOpties.includes("E85-F255") && glulamOpties.includes("E120-F330"));

  const plaatOpties = twMateriaalSoortOpties("結構用合板").map((o) => o.waarde);
  waar("合板清單含 CNS 11671", plaatOpties.some((v) => v.includes("CNS 11671")));

  const metselOpties = twMateriaalSoortOpties("磚石／砌體").map((o) => o.waarde);
  waar("磚石清單含 CNS 382／CNS 8905", metselOpties.some((v) => v.includes("CNS 382")) && metselOpties.some((v) => v.includes("CNS 8905")));

  waar("未知材料種類回傳非空預設清單", twMateriaalSoortOpties("自訂複合材料").length > 0 && twMateriaalSoortOpties("").length > 0);

  // 緊結件聯動
  const hsOpties = twBevestigingKwaliteitOpties("高強度螺栓").map((o) => o.waarde);
  const gewOpties = twBevestigingKwaliteitOpties("普通螺栓").map((o) => o.waarde);
  const ankOpties = twBevestigingKwaliteitOpties("化學錨栓").map((o) => o.waarde);
  const lasOpties = twBevestigingKwaliteitOpties("銲條／銲材").map((o) => o.waarde);
  const studOpties = twBevestigingKwaliteitOpties("剪力釘").map((o) => o.waarde);
  waar("高強度螺栓清單含 F10T／S10T／A325／A490",
    ["F10T", "S10T", "ASTM A325", "ASTM A490"].every((v) => hsOpties.includes(v)));
  waar("普通螺栓清單含 A307／SS400／SUS304",
    ["A307", "SS400", "SUS304"].every((v) => gewOpties.includes(v)));
  waar("錨栓清單含 F1554／SUS304／SUS316",
    ["ASTM F1554 Gr.36", "SUS304", "SUS316"].every((v) => ankOpties.includes(v)));
  waar("銲材清單含 AWS E70XX／CNS 13719",
    lasOpties.includes("AWS E70XX") && lasOpties.includes("CNS 13719"));
  waar("剪力釘清單含 AWS D1.1／CNS 4689",
    studOpties.includes("AWS D1.1 Type B") && studOpties.includes("CNS 4689"));
  waar("未知緊結件種類回傳非空預設清單", twBevestigingKwaliteitOpties("自訂扣件").length > 0);

  // KOLOMMEN_TW 與並列對齊檢核
  const eind = (k) => k[0] + k[1] - 1;
  waar("KOLOMMEN_TW 欄位相接且最右欄不超過第 9 欄",
    eind(KOLOMMEN_TW.type) + 1 === KOLOMMEN_TW.soort[0] &&
    eind(KOLOMMEN_TW.soort) + 1 === KOLOMMEN_TW.opmerking[0] &&
    eind(KOLOMMEN_TW.opmerking) + 1 === KOLOMMEN_TW.bevestigingType[0] &&
    eind(KOLOMMEN_TW.bevestigingType) + 1 === KOLOMMEN_TW.bevestigingKwaliteit[0] &&
    eind(KOLOMMEN_TW.bevestigingKwaliteit) <= 9);
  waar("台灣預設材料第 3～5 列備註寬度小於等於 OPMERKING_RUIMTE，緊結件從第 3 列並列",
    mat.slice(BEVESTIGING_VANAF).every((m) => tekstBreedte(m.opmerking) <= OPMERKING_RUIMTE) &&
    bevestigingBegin(mat, bev.length) === BEVESTIGING_VANAF);

  // 語言雙向切換無損
  const naarTw = wisselTaal(nl, "zh-TW");
  const terugNl = wisselTaal(naarTw, "nl");
  waar("歐規 nl -> zh-TW -> nl 切換材料與緊結件無損",
    JSON.stringify(terugNl.uitgangspunten.materialen) === JSON.stringify(nl.uitgangspunten.materialen) &&
    JSON.stringify(terugNl.uitgangspunten.bevestiging) === JSON.stringify(nl.uitgangspunten.bevestiging));

  const twNaarEn = wisselTaal(tw, "en");
  const twTerug = wisselTaal(twNaarEn, "zh-TW");
  waar("台灣版 zh-TW -> en -> zh-TW 切換材料與緊結件無損",
    twNaarEn.uitgangspunten.materialen[0].type === "In-situ concrete" &&
    twNaarEn.uitgangspunten.bevestiging[0].type === "High-strength bolts" &&
    JSON.stringify(twTerug.uitgangspunten.materialen) === JSON.stringify(tw.uitgangspunten.materialen) &&
    JSON.stringify(twTerug.uitgangspunten.bevestiging) === JSON.stringify(tw.uitgangspunten.bevestiging));
}

console.log(`\n台灣報告架構檢核完成：共 ${getest} 項檢查，${fouten} 項失敗。`);
if (fouten > 0) {
  process.exit(1);
}
