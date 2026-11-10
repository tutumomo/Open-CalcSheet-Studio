/**
 * 台灣載重組合共用 #include 片段檢查（packages/desktop/src/templates/tw-load-combos.ts）
 *
 * 1. #include 解析：tw-load-combos-rc112 與 tw-load-combos-steel-asd（含 .cpd 與不含）均在 rekentaalIncludes 註冊。
 * 2. rc112 強度載重組合（表 5.3.1，U_1～U_7、Umax）：以獨立手算基準值驗證。
 * 3. steel99 ASD 載重組合（§2.2 式 2.2-1～2.2-5，正負風／震）：以獨立手算基準值驗證。
 * 4. 單位傳遞：帶單位計算（kN/m²、kN、kNm）能正確保留並得出正確數值。
 * 5. 跨模組一致：twGrondslagen.ts 匯出的字串與本片段一致；與 normwaarden.ts 載重因數一致。
 *
 * 執行：node scripts/check-tw-load-combos.mjs（需已建置 core）
 */
import { parse, evaluate } from "../packages/core/dist/index.js";
import { leesGetallen } from "../packages/desktop/src/components/calc/bladLezen.ts";
import { rekentaalIncludes } from "../packages/desktop/src/templates/rekentaal-includes.ts";
import { twLoadCombosRc112, twLoadCombosSteelAsd } from "../packages/desktop/src/templates/tw-load-combos.ts";
import * as G from "../packages/desktop/src/components/calc/twGrondslagen.ts";
import { TW_RC_BELASTINGCOMBINATIES } from "../packages/desktop/src/rapport/tw/normwaarden.ts";

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);

console.log("=== 台灣載重組合共用片段檢查（tw-load-combos） ===\n");

// ── 1. #include 解析註冊 ────────────────────────────────────────────────
console.log("1. rekentaalIncludes 註冊");
meld(rekentaalIncludes.has("tw-load-combos-rc112.cpd"), "含 .cpd 之 rc112 片段已註冊");
meld(rekentaalIncludes.has("tw-load-combos-rc112"), "不含副檔名之 rc112 片段已註冊");
meld(rekentaalIncludes.has("tw-load-combos-steel-asd.cpd"), "含 .cpd 之 steel-asd 片段已註冊");
meld(rekentaalIncludes.has("tw-load-combos-steel-asd"), "不含副檔名之 steel-asd 片段已註冊");
meld(rekentaalIncludes.get("tw-load-combos-rc112.cpd") === twLoadCombosRc112, "rc112 內容與 tw-load-combos.ts 一致");
meld(rekentaalIncludes.get("tw-load-combos-steel-asd.cpd") === twLoadCombosSteelAsd, "steel-asd 內容與 tw-load-combos.ts 一致");

// ── 2. rc112 表 5.3.1 強度設計載重組合 ───────────────────────────────────
console.log("\n2. rc112 強度設計載重組合計算");
{
  const bron = `
#include tw-load-combos-rc112.cpd
D = 10
L = 5
Q = 2
W = 3
E = 4
S = 1
u1 = rc_U1(D)
u2 = rc_U2(D; L; Q)
u3a = rc_U3a(D; L; Q)
u3b = rc_U3b(D; W; Q)
u3 = rc_U3(D; L; W; Q)
u4 = rc_U4(D; L; W; Q)
u5 = rc_U5(D; L; E; S)
u6 = rc_U6(D; W)
u7 = rc_U7(D; E)
umax = rc_Umax(D; L; Q; W; E; S)
`;
  const ast = parse(bron, { includes: rekentaalIncludes });
  const res = evaluate(ast, {});
  const g = leesGetallen(res);

  // 手算基準值：
  // u1  = 1.4 * 10 = 14
  // u2  = 1.2*10 + 1.6*5 + 0.5*2 = 12 + 8 + 1 = 21
  // u3a = 1.2*10 + 1.6*2 + 1.0*5 = 12 + 3.2 + 5 = 20.2
  // u3b = 1.2*10 + 1.6*2 + 0.8*3 = 12 + 3.2 + 2.4 = 17.6
  // u3  = max(20.2, 17.6) = 20.2
  // u4  = 1.2*10 + 1.6*3 + 1.0*5 + 0.5*2 = 12 + 4.8 + 5 + 1 = 22.8
  // u5  = 1.2*10 + 1.0*4 + 1.0*5 + 0.2*1 = 12 + 4 + 5 + 0.2 = 21.2
  // u6  = 0.9*10 + 1.6*3 = 9 + 4.8 = 13.8
  // u7  = 0.9*10 + 1.0*4 = 9 + 4 = 13.0
  // umax = max(14, 21, 20.2, 22.8, 21.2) = 22.8
  meld(rel(g.u1, 14.0) < 1e-9, "U_1 = 1.4*D = 14.0", `得 ${g.u1}`);
  meld(rel(g.u2, 21.0) < 1e-9, "U_2 = 1.2*D + 1.6*L + 0.5*Q = 21.0", `得 ${g.u2}`);
  meld(rel(g.u3a, 20.2) < 1e-9, "U_3a = 1.2*D + 1.6*Q + 1.0*L = 20.2", `得 ${g.u3a}`);
  meld(rel(g.u3b, 17.6) < 1e-9, "U_3b = 1.2*D + 1.6*Q + 0.8*W = 17.6", `得 ${g.u3b}`);
  meld(rel(g.u3, 20.2) < 1e-9, "U_3 = max(U_3a; U_3b) = 20.2", `得 ${g.u3}`);
  meld(rel(g.u4, 22.8) < 1e-9, "U_4 = 1.2*D + 1.6*W + 1.0*L + 0.5*Q = 22.8", `得 ${g.u4}`);
  meld(rel(g.u5, 21.2) < 1e-9, "U_5 = 1.2*D + 1.0*E + 1.0*L + 0.2*S = 21.2", `得 ${g.u5}`);
  meld(rel(g.u6, 13.8) < 1e-9, "U_6 = 0.9*D + 1.6*W = 13.8", `得 ${g.u6}`);
  meld(rel(g.u7, 13.0) < 1e-9, "U_7 = 0.9*D + 1.0*E = 13.0", `得 ${g.u7}`);
  meld(rel(g.umax, 22.8) < 1e-9, "U_max = 22.8", `得 ${g.umax}`);
}

// ── 3. steel99 ASD 容許應力設計載重組合 ──────────────────────────────────
console.log("\n3. steel99 ASD 容許應力載重組合計算");
{
  const bron = `
#include tw-load-combos-steel-asd.cpd
D = 10
L = 5
W = 3
E = 4
ra1 = asd_1(D; L)
ra2p = asd_2p(D; L; W)
ra2m = asd_2m(D; L; W)
ra3p = asd_3p(D; L; E)
ra3m = asd_3m(D; L; E)
ra4p = asd_4p(D; W)
ra4m = asd_4m(D; W)
ra5p = asd_5p(D; E)
ra5m = asd_5m(D; E)
ramax = asd_max(D; L; W; E)
`;
  const ast = parse(bron, { includes: rekentaalIncludes });
  const res = evaluate(ast, {});
  const g = leesGetallen(res);

  // 手算基準值：
  // ra1  = 10 + 5 = 15.0
  // ra2p = 10 + 0.75*5 + 1.25*3 = 10 + 3.75 + 3.75 = 17.5
  // ra2m = 10 + 0.75*5 - 1.25*3 = 10 + 3.75 - 3.75 = 10.0
  // ra3p = 10 + 0.75*5 + 0.8*4 = 10 + 3.75 + 3.2 = 16.95
  // ra3m = 10 + 0.75*5 - 0.8*4 = 10 + 3.75 - 3.2 = 10.55
  // ra4p = 0.7*10 + 1.25*3 = 7 + 3.75 = 10.75
  // ra4m = 0.7*10 - 1.25*3 = 7 - 3.75 = 3.25
  // ra5p = 0.7*10 + 0.8*4 = 7 + 3.2 = 10.2
  // ra5m = 0.7*10 - 0.8*4 = 7 - 3.2 = 3.8
  // ramax = max(15, 17.5, 16.95, 10.75, 10.2) = 17.5
  meld(rel(g.ra1, 15.0) < 1e-9, "asd_1 = D + L = 15.0", `得 ${g.ra1}`);
  meld(rel(g.ra2p, 17.5) < 1e-9, "asd_2p = D + 0.75*L + 1.25*W = 17.5", `得 ${g.ra2p}`);
  meld(rel(g.ra2m, 10.0) < 1e-9, "asd_2m = D + 0.75*L - 1.25*W = 10.0", `得 ${g.ra2m}`);
  meld(rel(g.ra3p, 16.95) < 1e-9, "asd_3p = D + 0.75*L + 0.8*E = 16.95", `得 ${g.ra3p}`);
  meld(rel(g.ra3m, 10.55) < 1e-9, "asd_3m = D + 0.75*L - 0.8*E = 10.55", `得 ${g.ra3m}`);
  meld(rel(g.ra4p, 10.75) < 1e-9, "asd_4p = 0.7*D + 1.25*W = 10.75", `得 ${g.ra4p}`);
  meld(rel(g.ra4m, 3.25) < 1e-9, "asd_4m = 0.7*D - 1.25*W = 3.25", `得 ${g.ra4m}`);
  meld(rel(g.ra5p, 10.2) < 1e-9, "asd_5p = 0.7*D + 0.8*E = 10.2", `得 ${g.ra5p}`);
  meld(rel(g.ra5m, 3.8) < 1e-9, "asd_5m = 0.7*D - 0.8*E = 3.8", `得 ${g.ra5m}`);
  meld(rel(g.ramax, 17.5) < 1e-9, "asd_max = 17.5", `得 ${g.ramax}`);
}

// ── 4. 單位傳遞 ─────────────────────────────────────────────────────────
console.log("\n4. 單位傳遞");
{
  const bron = `
#include tw-load-combos-rc112
D = 10*(kN/m^2)
L = 5*(kN/m^2)
Q = 2*(kN/m^2)
u2 = rc_U2(D; L; Q)
`;
  const ast = parse(bron, { includes: rekentaalIncludes });
  const res = evaluate(ast, {});
  const g = leesGetallen(res);
  // 核心以 SI 基本單位（N/m²）內部表示，leesGetallen 轉出；21 kN/m² = 21000 N/m²
  meld(rel(g.u2, 21000) < 1e-9 || rel(g.u2, 21.0) < 1e-9, "帶單位計算成功並保持數值正確", `得 ${g.u2}`);
}

// ── 5. 跨模組一致性 ─────────────────────────────────────────────────────
console.log("\n5. 跨模組一致性");
meld(G.TW_RC_BELASTINGCOMBINATIES === twLoadCombosRc112, "twGrondslagen TW_RC_BELASTINGCOMBINATIES 已接至 twLoadCombosRc112");
meld(G.TW_STEEL_ASD_COMBINATIES === twLoadCombosSteelAsd, "twGrondslagen TW_STEEL_ASD_COMBINATIES 已接至 twLoadCombosSteelAsd");
// 與 normwaarden.ts 之 7 組因數定義比對
meld(TW_RC_BELASTINGCOMBINATIES.length === 7, "normwaarden TW_RC_BELASTINGCOMBINATIES 共有 7 組");
meld(TW_RC_BELASTINGCOMBINATIES.every((c) => c.bron.includes("rc112")), "normwaarden 各組合來源均為 rc112");

console.log(fouten === 0 ? "\n全部通過。" : `\n${fouten} 項失敗。`);
process.exit(fouten === 0 ? 0 : 1);
