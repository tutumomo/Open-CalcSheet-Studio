/**
 * 驗證台灣本土計算基礎設施（階段 3）：
 * 1. 中文結尾行解析（leesResultaat）及安全防護（不合格絕不判為合格）
 * 2. 鋼筋規格表（twWapening.ts）與查表矩陣
 * 3. 台灣常用型鋼規格表（twProfielen.ts）與查表矩陣
 * 4. 台灣 MKS 單位在計算語言中的計算正確性
 *
 * 執行：node scripts/valideer-tw-basis.mjs
 */
import { parse, evaluate } from "../packages/core/dist/index.js";
import { leesResultaat } from "../packages/desktop/src/components/calc/bladLezen.ts";
import {
  TW_WAPENING_TABEL,
  TW_WAPENING,
  twWapeningMatrix,
  twWapeningOpzoeking,
  vindTwWapening,
} from "../packages/desktop/src/components/calc/twWapening.ts";
import {
  TW_H_TABEL,
  TW_PROFIELEN,
  twProfielMatrix,
  twProfielOpzoeking,
} from "../packages/desktop/src/components/calc/twProfielen.ts";

let fouten = 0;
function toets(naam, ok, detail) {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${naam}${ok || detail === undefined ? "" : `\n         ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
}

console.log("1. 中文結尾行解析與安全防護（leesResultaat）");

{
  // 案例 1：正常合格
  const bron = `
# 測試梁檢核 — rc112
UC_max = 0.78
'控制 UC = 0.78 ≤ 1.0 → 合格
`;
  const nodes = evaluate(parse(bron));
  const r = leesResultaat(nodes, "測試梁");
  toets("合格案例：辨識標題", r.titel === "測試梁檢核");
  toets("合格案例：辨識規範", r.norm === "rc112");
  toets("合格案例：UC 正確", r.uc === 0.78);
  toets("合格案例：判定為合格 (voldoet === true)", r.voldoet === true);
  toets("合格案例：非未檢核", !r.nietGetoetst);
}

{
  // 案例 2：不合格（核心安全防護：不合格絕不被誤判為合格！）
  const bron = `
# 測試梁檢核 — rc112
UC_max = 1.25
'控制 UC = 1.25 > 1.0 → 不合格
`;
  const nodes = evaluate(parse(bron));
  const r = leesResultaat(nodes, "測試梁");
  toets("不合格案例：UC 正確", r.uc === 1.25);
  toets("不合格案例：判定為不合格 (voldoet === false)", r.voldoet === false);
  toets("不合格案例：防護機制（確認非 true）", r.voldoet !== true);
}

{
  // 案例 3：帶 HTML 標籤的結尾行
  const bron = `
# 柱檢核 — seis113
UC_max = 0.95
'控制 UC = 0.95 ≤ 1.0 → <b>合格</b>
`;
  const nodes = evaluate(parse(bron));
  const r = leesResultaat(nodes, "柱檢核");
  toets("HTML 標籤合格案例：判定為合格", r.voldoet === true);
  toets("HTML 標籤合格案例：UC = 0.95", r.uc === 0.95);
}

{
  // 案例 4：帶 HTML 標籤的不合格
  const bron = `
# 柱檢核 — seis113
UC_max = 1.05
'控制 UC = 1.05 > 1.0 → <span style="color:red">不合格</span>
`;
  const nodes = evaluate(parse(bron));
  const r = leesResultaat(nodes, "柱檢核");
  toets("HTML 標籤不合格案例：判定為不合格", r.voldoet === false);
}

{
  // 案例 5：UC_max 未顯式宣告，由結尾行提取
  const bron = `
# 懸臂梁檢核
'計算完成
'控制 UC = 0.62 → 合格
`;
  const nodes = evaluate(parse(bron));
  const r = leesResultaat(nodes, "懸臂梁");
  toets("隱含 UC：自結尾行提取 UC = 0.62", r.uc === 0.62);
  toets("隱含 UC：判定為合格", r.voldoet === true);
}

{
  // 案例 6：未檢核
  const bron = `
# 擋土牆分析
'總結：未檢核
`;
  const nodes = evaluate(parse(bron));
  const r = leesResultaat(nodes, "擋土牆");
  toets("未檢核案例：判定為 nietGetoetst", r.nietGetoetst === true);
  toets("未檢核案例：voldoet 為 null", r.voldoet === null);
}

{
  // 案例 7：無效輸入未檢核
  const bron = `
# 基礎檢核
'總結：無效輸入，未檢核
`;
  const nodes = evaluate(parse(bron));
  const r = leesResultaat(nodes, "基礎");
  toets("無效輸入未檢核案例：判定為 nietGetoetst", r.nietGetoetst === true);
}

console.log("\n2. 台灣鋼筋規格表（twWapening.ts）");
{
  toets("鋼筋規格總數為 9 種 (D10~D36)", TW_WAPENING_TABEL.length === 9);
  const d16 = vindTwWapening("D16");
  toets("D16 查詢成功", d16 !== undefined);
  toets("D16 公稱直徑 15.9 mm", d16?.db === 15.9);
  toets("D16 截面積 198.6 mm²", d16?.Ab === 198.6);
  toets("D16 單位重 1.56 kg/m", d16?.gewicht === 1.56);

  const d25 = vindTwWapening("25");
  toets("D25 模糊查詢成功", d25?.naam === "D25" && d25?.db === 25.4);

  // 測試矩陣與查表算式在計算核心中執行
  const matrix = twWapeningMatrix({ naam: "TW_REBAR" });
  const opzoek = twWapeningOpzoeking("rebar_id", "TW_REBAR");
  const bron = `
${matrix}
rebar_id = 3
${opzoek}
`;
  const nodes = evaluate(parse(bron));
  const dbNode = nodes.find((n) => n.name === "d_b");
  const abNode = nodes.find((n) => n.name === "A_b");
  const wbNode = nodes.find((n) => n.name === "w_b");
  toets("計算語言中查表 d_b: 15.9 mm", dbNode?.result === "15.9 mm");
  toets("計算語言中查表 A_b: 198.6 mm²", abNode?.result === "198.6 mm^2");
  toets("計算語言中查表 w_b: 1.56 kg/m", wbNode?.result === "1.56 kg / m");
}

console.log("\n3. 台灣型鋼規格表（twProfielen.ts）");
{
  toets("常用 H 型鋼數量為 20 種", TW_H_TABEL.length === 20);
  const rh400 = TW_PROFIELEN.find((p) => p.naam === "RH 400x200x8x13");
  toets("RH 400x200 查找成功", rh400 !== undefined);
  toets("RH 400x200 高度 h = 400 mm", rh400?.h === 400);
  toets("RH 400x200 寬度 b = 200 mm", rh400?.b === 200);
  toets("RH 400x200 斷面積 A = 84.1 cm²", rh400?.A === 84.1);
  toets("RH 400x200 強軸慣性矩 Ix = 23700 cm⁴", rh400?.Ix === 23700);

  // 測試型鋼矩陣查表
  const matrix = twProfielMatrix({ naam: "H_SECTIONS" });
  const opzoek = twProfielOpzoeking("section_id", "H_SECTIONS");
  const bron = `
${matrix}
section_id = 14
${opzoek}
`;
  const nodes = evaluate(parse(bron));
  const hNode = nodes.find((n) => n.name === "h");
  const bNode = nodes.find((n) => n.name === "b");
  const aNode = nodes.find((n) => n.name === "A");
  const ixNode = nodes.find((n) => n.name === "I_x");
  toets("型鋼查表 h: 400 mm", hNode?.result === "400 mm");
  toets("型鋼查表 b: 200 mm", bNode?.result === "200 mm");
  toets("型鋼查表 A: 84.1 cm²", aNode?.result === "84.1 cm^2");
  toets("型鋼查表 I_x: 23700 cm⁴", ixNode?.result === "23700 cm^4");
}

console.log("\n4. 台灣 MKS 單位在計算語言中的計算");
{
  const bron = `
fc = 280 kgf/cm^2
fy = 4200 kgf/cm^2
b = 30 cm
d = 50 cm
M = 15 tf*m
`;
  const nodes = evaluate(parse(bron));
  const fcNode = nodes.find((n) => n.name === "fc");
  const fyNode = nodes.find((n) => n.name === "fy");
  const mNode = nodes.find((n) => n.name === "M");
  toets("fc = 280 kgf/cm² 成功解析", fcNode?.result === "280 kgf / cm^2");
  toets("fy = 4200 kgf/cm² 成功解析", fyNode?.result === "4200 kgf / cm^2");
  toets("M = 15 tf m 成功解析", mNode?.result === "15 tf m");
}

console.log("\n5. 繁體中文結構報告模型（Stage 2a）");
{
  const { standaardRapport } = await import("../packages/desktop/src/rapport/model.ts");
  const { standaardTeksten } = await import("../packages/desktop/src/rapport/standaardteksten.ts");
  const { wisselTaal } = await import("../packages/desktop/src/rapport/taalwissel.ts");
  const { bouwOpzet, OPZET } = await import("../packages/desktop/src/rapport/opzet.ts");

  const datum = "09-11-2026";
  const tw = standaardRapport(datum, standaardTeksten("zh-TW"), "zh-TW");
  const nl = standaardRapport(datum, standaardTeksten("nl"), "nl");

  toets("zh-TW 報告建立成功且語言為 zh-TW", tw.taal === "zh-TW");
  toets("zh-TW 報告標題正確：結構計算書及說明", tw.titel === "結構計算書及說明");
  toets("zh-TW 報告規範正確", tw.normen.includes("台灣建築結構設計規範"));
  toets("zh-TW 預設工程角色：計畫主持結構技師", tw.rol.rol === "計畫主持結構技師");
  toets("zh-TW 預設建築種類：住宅", tw.uitgangspunten.soortBouwwerk === "住宅");
  toets("zh-TW 預設材料包含場鑄混凝土", tw.uitgangspunten.materialen.some((m) => m.type === "場鑄混凝土"));
  toets("zh-TW 預設材料包含鋼筋", tw.uitgangspunten.materialen.some((m) => m.type === "鋼筋"));
  toets("zh-TW 預設材料包含結構用鋼材", tw.uitgangspunten.materialen.some((m) => m.type === "結構用鋼材"));
  toets("zh-TW 引言包含繁中標準段落", tw.teksten.inleiding?.includes("本報告係應業主委託，由 {adviseur} 針對上述工程提出之結構設計計算書。"));

  // 章節架構測試
  const bladen = [{ id: "b1", naam: "RC梁檢核" }];
  const knopen = bouwOpzet(tw, bladen);
  toets("zh-TW 章節 1 標題為 簡介", knopen[0]?.titel === "簡介");
  toets("zh-TW 章節 2 標題為 專案資訊", knopen[1]?.titel === "專案資訊");
  toets("zh-TW 章節 3 標題為 結構系統", knopen[2]?.titel === "結構系統");
  toets("zh-TW 章節 4 標題為 設計基準", knopen[3]?.titel === "設計基準");
  toets("zh-TW 章節 5 標題為 載重條件", knopen[4]?.titel === "載重條件");
  toets("zh-TW 章節 6 標題為 結構計算", knopen[5]?.titel === "結構計算");

  // 雙向語言切換無損性測試
  const naarTw = wisselTaal(nl, "zh-TW");
  toets("荷蘭文轉 zh-TW：標題切換", naarTw.titel === "結構計算書及說明");
  toets("荷蘭文轉 zh-TW：角色切換", naarTw.rol.rol === "計畫主持結構技師");
  toets("荷蘭文轉 zh-TW：段落切換", naarTw.teksten.inleiding?.includes("本報告係應業主委託"));

  const terugNl = wisselTaal(naarTw, "nl");
  toets("zh-TW 切回荷蘭文無損性：標題", terugNl.titel === nl.titel);
  toets("zh-TW 切回荷蘭文無損性：角色", terugNl.rol.rol === nl.rol.rol);
  toets("zh-TW 切回荷蘭文無損性：建築種類", terugNl.uitgangspunten.soortBouwwerk === nl.uitgangspunten.soortBouwwerk);
  toets("zh-TW 切回荷蘭文無損性：引言段落", terugNl.teksten.inleiding === nl.teksten.inleiding);
}

if (fouten > 0) {
  console.error(`\n台灣本土基礎設施驗證失敗：${fouten} 項錯誤。`);
  process.exit(1);
}
console.log("\n台灣本土計算基礎設施驗證：全部通過！");
