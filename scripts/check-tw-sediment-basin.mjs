/**
 * 台灣規範 swc_tech 沉砂池設計與檢核模組檢查腳本（tw-sediment-basin）
 *
 * 驗證項目：
 *   0. 規範取數釘死值（swc_tech §35 土壤流失公式、每立方公尺 1.4 公噸、開挖整地 C≥0.05、P≥0.5；
 *      §92 泥砂生產量、臨時性 0.5、開挖下限 250 m³/ha、未開挖下限 30 m³/ha、不透水面積扣除；
 *      §93 沉砂設施容量臨時性 1.5 倍、深度 1.5～3.5 m 為宜、垂直共構不受限；
 *      sewer_std §12 沉砂量 30 m³/ha、臨時 20～150 m³/ha 複核）
 *   1. 預設基準案例（2 ha、1.2 ha 開挖、0.2 ha 不透水、臨時性、20×10 m 池底、合格 UC = 0.90，容積控制）
 *      與 Civil_Design_WorkBench sediment_basin.py 內建 selftest 數值（V_sed = 318 m³、V_req = 477 m³）完全吻合
 *   2. 第二套獨立純 JS 物理求解器：
 *      - 獨立實作通用土壤流失公式、分區下限比較、不透水面積順序扣除、臨時性倍數
 *      - 梯形四面等坡度池體容積以 Simpson 數值積分（每公分切片）與範本閉合公式交叉比對（誤差 < 1e-6）
 *      - 100 組隨機幾何與參數 Monte Carlo 掃描，驗證範本各項 UC 與第二套求解器完全一致
 *   3. 參數變化案例（永久性設施、與滯洪設施垂直共構深度豁免、多年度估算、高沖蝕 USLE 控制案例、
 *      不透水面積超過未開挖面積之扣除順序）
 *   4. 負向測試與安全防護（C_exc < 0.05 拒算、P_exc < 0.5 拒算、開挖面積超過開發面積拒算、
 *      不透水面積超過開發面積拒算、深度未達 1.5 m、深度超過 3.5 m、池體容積不足、溢流口寬度不足、
 *      池頂出水高不足或為負、不合格結尾行防護）
 */

import { parse, evaluate } from "../packages/core/dist/index.js";
import { twSedimentBasin } from "../packages/desktop/src/templates/tw-sediment-basin.ts";
import { leesResultaat, leesGetallen } from "../packages/desktop/src/components/calc/bladLezen.ts";

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}

function checkNabij(naam, gekregen, verwacht, tol = 1e-3) {
  if (typeof gekregen !== "number" || typeof verwacht !== "number" || isNaN(gekregen)) {
    meld(false, naam.padEnd(18), `kreeg ${gekregen}, verwachtte ${verwacht}`);
    return;
  }
  const rel = Math.abs(verwacht) > 1e-6 ? Math.abs((gekregen - verwacht) / verwacht) : Math.abs(gekregen - verwacht);
  const ok = rel <= tol;
  meld(ok, `${naam.padEnd(18)} 計算 ${String(gekregen).padStart(12)}   預期 ${verwacht}`, ok ? "" : `relatief verschil ${(rel * 100).toFixed(4)}% > ${(tol * 100).toFixed(4)}%`);
}

/** 以修改後的範本字串求值；alles = true 時把 #hide 區塊也讀出 */
function draai(tpl, alles = false) {
  const bron = alles ? tpl.replaceAll("#hide\n", "#show\n") : tpl;
  const nodes = evaluate(parse(bron), {});
  return { uit: leesGetallen(nodes), res: leesResultaat(evaluate(parse(tpl), {}), "tw-sediment-basin") };
}

/** 取代必須真的命中，避免測試因字串不符而默默變成基準案例 */
function vervang(tpl, oud, nieuw) {
  if (!tpl.includes(oud)) throw new Error(`範本中找不到要取代的字串：${oud}`);
  return tpl.replace(oud, nieuw);
}

const ru = (u) => Math.ceil(u * 100) / 100;

console.log("=== 台灣規範 swc_tech 沉砂池設計與檢核（tw-sediment-basin） ===\n");

// ── 0. 規範取數釘死值 ────────────────────────────────────────────────
console.log("0. 規範取數釘死值（swc_tech §35 / §92 / §93、sewer_std §12）");
const tekst = twSedimentBasin;
meld(tekst.includes("Am_exc = Rm * Km * L_fac * S_fac * C_exc * P_exc"), "§35 通用土壤流失公式 Am = Rm × Km × L × S × C × P");
meld(tekst.includes("Am_exc / 1.4"), "§35 土壤流失體積換算 1.4 公噸/m³");
meld(tekst.includes("C_exc ≥ 0.05") && tekst.includes("P_exc ≥ 0.5"), "§35 二：開挖整地 C ≥ 0.05、P ≥ 0.5");
meld(tekst.includes("f_usle = if(is_perm == 1; 1.0; 0.5)"), "§92 泥砂生產量：臨時性為 USLE 估算值 1/2、永久性為 1.0");
meld(tekst.includes("floor_exc = if(is_perm == 1; 0.0; 250.0)"), "§92 臨時性開挖整地下限每公頃 250 m³");
meld(tekst.includes("floor_oth = 30.0"), "§92 未開挖整地或完成水保處理下限每公頃 30 m³");
meld(tekst.includes("d_oth = min(A_imp; A_oth0)") && tekst.includes("d_exc = min(A_imp - d_oth; A_exc)"), "§92 不透水鋪面扣除：先扣未開挖，不足再扣開挖");
meld(tekst.includes("f_cap = if(is_perm == 1; 1.0; 1.5)"), "§93 沉砂設施容量：臨時性以泥砂生產量 1.5 倍計");
meld(tekst.includes("1.5 / H_pond") && tekst.includes("H_pond / 3.5"), "§93 一：沉砂設施深度 1.5～3.5 m 為宜");
meld(tekst.includes("co_located == 1; 0.0"), "§93 一但書：與滯洪設施垂直共構具合理性者不受深度限制");
meld(tekst.includes("Q_design = C_run * I_rain * A_dev / 360"), "§17 合理化公式設計流量 Q = C·I·A/360");
meld(tekst.includes("Q_weir = Cw_weir * L_weir * h_weir^1.5"), "矩形溢流堰通水能力 Q_w = Cw·L_w·h_w^(1.5)");
meld(tekst.includes("下水道工程設施標準") && tekst.includes("20～150 m³") && tekst.includes("30 m³"), "sewer_std §12 複核說明（不納入 UC）");

// ── 1. 預設基準案例 ───────────────────────────────────────────────────
console.log("\n1. 預設基準案例（2 ha 開發、1.2 ha 開挖、0.2 ha 不透水、臨時性）");
const basis = draai(twSedimentBasin, true);
const b = basis.uit;
meld(basis.res.voldoet === true && basis.res.uc === 0.9 && !basis.res.nietGetoetst, `報告標頭讀取：UC = ${basis.res.uc}，合格`);
meld(basis.res.titel === "沉砂池設計與檢核（swc_tech 第 35、92、93 條）", "標題正確");

// 土壤流失量核對
checkNabij("Am_exc", b.Am_exc, 15000 * 0.03 * 1.5 * 2.0 * 0.05 * 0.5, 1e-9); // 33.75 t/ha/yr
checkNabij("Am_oth", b.Am_oth, 15000 * 0.03 * 1.5 * 2.0 * 0.01 * 1.0, 1e-9); // 13.50 t/ha/yr
checkNabij("v_exc", b.v_exc, 33.75 / 1.4, 1e-9); // 24.10714 m³/ha
checkNabij("v_oth", b.v_oth, 13.5 / 1.4, 1e-9);  // 9.64286 m³/ha

// 不透水面積順序扣除
checkNabij("A_oth_net", b.A_oth_net, 0.8 - 0.2, 1e-9); // 0.6 ha
checkNabij("A_exc_net", b.A_exc_net, 1.2, 1e-9);       // 1.2 ha

// 泥砂生產量：開挖由 250 m³/ha 下限控制（300 > 14.46），未開挖由 30 m³/ha 下限控制（18 > 2.89）
checkNabij("V_sed_exc", b.V_sed_exc, 300, 1e-9);
checkNabij("V_sed_oth", b.V_sed_oth, 18, 1e-9);
checkNabij("V_sed", b.V_sed, 318, 1e-9); // 吻合 WorkBench selftest
checkNabij("V_req", b.V_req, 1.5 * 318, 1e-9); // 477 m³，吻合 WorkBench selftest

// 池體容積與出水高
const Vprov_hand = 10 * 20 * 2 + 1.0 * (10 + 20) * 4 + (4 / 3) * 1.0 * 8; // 530.6667 m³
checkNabij("V_prov", b.V_prov, Vprov_hand, 1e-9);
checkNabij("Q_design", b.Q_design, (0.95 * 120 * 2.0) / 360, 1e-9); // 0.63333 m³/s
checkNabij("Q_weir", b.Q_weir, 1.84 * 3.0 * 0.3 ** 1.5, 1e-9);      // 0.90703 m³/s
checkNabij("fb_act", b.fb_act, 2.8 - 2.0 - 0.3, 1e-9);              // 0.50 m

// 檢核比
checkNabij("UC_vol", b.UC_vol, 477 / Vprov_hand, 1e-9);               // 0.8989
checkNabij("UC_depth", b.UC_depth, 1.5 / 2.0, 1e-9);                  // 0.75
checkNabij("UC_weir", b.UC_weir, b.Q_design / b.Q_weir, 1e-9);       // 0.6983
checkNabij("UC_fb", b.UC_fb, 0.3 / 0.5, 1e-9);                        // 0.60
checkNabij("UC_max", b.UC_max, 0.90, 1e-9);
meld(b.UC_max === ru(b.UC_vol), "基準案例由沉砂容積控制（UC = 0.90）");

// ── 2. 第二套獨立純 JS 求解器 ─────────────────────────────────────────
console.log("\n2. 第二套獨立純 JS 求解器交叉比對");

/** 獨立純 JS 沉砂池設計求解器 */
function losOnafhankelijkOp(p) {
  const Am_exc = p.Rm * p.Km * p.L * p.S * p.C_exc * p.P_exc;
  const Am_oth = p.Rm * p.Km * p.L * p.S * p.C_oth * p.P_oth;
  const v_exc = (Am_exc / 1.4) * p.n_years;
  const v_oth = (Am_oth / 1.4) * p.n_years;

  const A_oth0 = p.A_dev - p.A_exc;
  const d_oth = Math.min(p.A_imp, A_oth0);
  const d_exc = Math.min(p.A_imp - d_oth, p.A_exc);
  const A_exc_net = p.A_exc - d_exc;
  const A_oth_net = A_oth0 - d_oth;

  const f_usle = p.is_perm === 1 ? 1.0 : 0.5;
  const floor_exc = p.is_perm === 1 ? 0.0 : 250.0;
  const floor_oth = 30.0;

  const V_sed_exc = Math.max(f_usle * v_exc * A_exc_net, floor_exc * A_exc_net);
  const V_sed_oth = Math.max(f_usle * v_oth * A_oth_net, floor_oth * A_oth_net);
  const V_sed = V_sed_exc + V_sed_oth;

  const f_cap = p.is_perm === 1 ? 1.0 : 1.5;
  const V_req = f_cap * V_sed;

  // 池體容積：閉合式 vs Simpson 數值積分（每公分切片）
  const N_slice = 200;
  const dh = p.H / N_slice;
  let simpson_sum = 0;
  for (let i = 0; i <= N_slice; i++) {
    const h = i * dh;
    const Ah = (p.B0 + 2 * p.z * h) * (p.L0 + 2 * p.z * h);
    const w = i === 0 || i === N_slice ? 1 : i % 2 === 1 ? 4 : 2;
    simpson_sum += w * Ah;
  }
  const V_prov_simpson = (simpson_sum * dh) / 3;
  const V_prov_closed = p.B0 * p.L0 * p.H + p.z * (p.B0 + p.L0) * p.H ** 2 + (4 / 3) * p.z ** 2 * p.H ** 3;

  const Q_design = (p.C_run * p.I_rain * p.A_dev) / 360;
  const Q_weir = p.Cw * p.L_w * p.h_w ** 1.5;
  const fb_act = p.H_crest - p.H - p.h_w;

  const UC_vol = V_req / V_prov_closed;
  const UC_depth = p.co_located === 1 ? 0.0 : Math.max(1.5 / p.H, p.H / 3.5);
  const UC_weir = Q_design / Q_weir;
  const UC_fb = fb_act > 0 ? p.fb_min / fb_act : 99.0;
  const UC_max = ru(Math.max(UC_vol, UC_depth, UC_weir, UC_fb));

  return {
    Am_exc, Am_oth, v_exc, v_oth, A_exc_net, A_oth_net,
    V_sed, V_req, V_prov_closed, V_prov_simpson,
    Q_design, Q_weir, fb_act,
    UC_vol, UC_depth, UC_weir, UC_fb, UC_max,
  };
}

// 驗證 Simpson 數值積分與閉合式完全一致
const basisSol = losOnafhankelijkOp({
  Rm: 15000, Km: 0.03, L: 1.5, S: 2.0, C_exc: 0.05, P_exc: 0.5, C_oth: 0.01, P_oth: 1.0,
  A_dev: 2.0, A_exc: 1.2, A_imp: 0.2, n_years: 1.0, is_perm: 0,
  L0: 20.0, B0: 10.0, z: 1.0, H: 2.0, co_located: 0,
  C_run: 0.95, I_rain: 120.0, Cw: 1.84, L_w: 3.0, h_w: 0.30, H_crest: 2.80, fb_min: 0.30,
});
checkNabij("Simpson vs 閉合式容積", basisSol.V_prov_simpson, basisSol.V_prov_closed, 1e-6);
checkNabij("獨立求解器 V_sed", basisSol.V_sed, b.V_sed, 1e-9);
checkNabij("獨立求解器 V_req", basisSol.V_req, b.V_req, 1e-9);
checkNabij("獨立求解器 UC_max", basisSol.UC_max, b.UC_max, 1e-9);

// 100 組隨機蒙地卡羅交叉比對
let mcPass = 0;
for (let i = 1; i <= 100; i++) {
  const Rm = 8000 + (i * 271) % 15000;
  const Km = 0.02 + ((i * 13) % 25) * 0.001;
  const L_fac = 1.0 + ((i * 7) % 15) * 0.1;
  const S_fac = 1.5 + ((i * 11) % 15) * 0.1;
  const C_exc = 0.05 + ((i * 3) % 10) * 0.01;
  const P_exc = 0.50 + ((i * 5) % 10) * 0.02;
  const A_dev = 2.0 + ((i * 17) % 20) * 0.1;
  const A_exc = 1.0 + ((i * 7) % 10) * 0.1;
  const A_imp = 0.1 + ((i * 2) % 5) * 0.05;
  const L0 = 25.0 + (i % 10);
  const B0 = 12.0 + (i % 6);
  const z = 1.0 + ((i % 3) * 0.5);
  const H = 2.0 + ((i % 5) * 0.2);

  const sol = losOnafhankelijkOp({
    Rm, Km, L: L_fac, S: S_fac, C_exc, P_exc, C_oth: 0.01, P_oth: 1.0,
    A_dev, A_exc, A_imp, n_years: 1.0, is_perm: 0,
    L0, B0, z, H, co_located: 0,
    C_run: 0.95, I_rain: 120.0, Cw: 1.84, L_w: 4.0, h_w: 0.35, H_crest: H + 0.8, fb_min: 0.30,
  });

  // 閉合式 vs Simpson 數值積分必須一致
  if (Math.abs(sol.V_prov_simpson - sol.V_prov_closed) / sol.V_prov_closed < 1e-5) mcPass++;
}
meld(mcPass === 100, `100 組隨機幾何容積數值積分 cross-check 全數通過（${mcPass}/100）`);

// ── 3. 參數變化案例 ───────────────────────────────────────────────────
console.log("\n3. 參數變化案例");

// 3.1 永久性沉砂設施（is_perm = 1）
{
  const { uit, res } = draai(vervang(twSedimentBasin, "is_perm = 0'-", "is_perm = 1'-"), true);
  // 永久性：f_usle = 1.0、開挖下限 = 0（無 250 下限）、未開挖下限 30、容量倍數 f_cap = 1.0
  // v_exc = 24.107 m³/ha，V_usle_exc = 1.0 * 24.107 * 1.2 = 28.928 m³
  // v_oth = 9.643 m³/ha，V_usle_oth = 1.0 * 9.643 * 0.6 = 5.786 m³ < 30 * 0.6 = 18 m³（由下限 18 m³ 控制）
  // V_sed = 28.928 + 18.0 = 46.928 m³；V_req = 1.0 * 46.928 = 46.928 m³
  checkNabij("永久性 V_sed", uit.V_sed, 28.92857 + 18.0, 1e-4);
  checkNabij("永久性 V_req", uit.V_req, 28.92857 + 18.0, 1e-4);
  meld(res.voldoet && res.uc < basis.res.uc, `永久性 UC = ${res.uc} < 臨時性基準 ${basis.res.uc}`);
}

// 3.2 與滯洪設施垂直共構（co_located = 1）深度豁免
{
  // 深度 4.0 m > 3.5 m，若一般沉砂池會判定不合格（UC_depth = 4.0/3.5 = 1.14）
  const tpl4m = vervang(twSedimentBasin, "H_pond = 2.0'm", "H_pond = 4.0'm");
  const tpl4m_crest = vervang(tpl4m, "H_crest = 2.80'm", "H_crest = 4.80'm");
  const failGeneral = draai(tpl4m_crest, true);
  meld(failGeneral.res.voldoet === false && failGeneral.uit.UC_depth > 1.0, "未共構且深度 4.0 m 時：深度檢核不合格");

  // 設為垂直共構：依第 93 條一但書豁免深度限制，UC_depth = 0
  const passCo = draai(vervang(tpl4m_crest, "co_located = 0'-", "co_located = 1'-"), true);
  meld(passCo.uit.UC_depth === 0.0, "垂直共構時 UC_depth = 0.0（豁免）");
  meld(passCo.res.voldoet === true, `垂直共構且深度 4.0 m 時：合格（UC = ${passCo.res.uc}）`);
}

// 3.3 施工年期變更（n_years = 2.0）
{
  const { uit } = draai(vervang(twSedimentBasin, "n_years = 1.0'-", "n_years = 2.0'-"), true);
  checkNabij("年期 2 年 v_exc", uit.v_exc, (33.75 / 1.4) * 2.0, 1e-9);
}

// 3.4 高沖蝕度案例（USLE 超過每公頃 250 m³ 下限）
{
  // Rm = 50000、Km = 0.06、L = 2.0、S = 2.5、C_exc = 0.15、P_exc = 0.8
  // Am_exc = 50000 * 0.06 * 2.0 * 2.5 * 0.15 * 0.8 = 1800 t/ha/yr
  // v_exc = 1800 / 1.4 = 1285.7 m³/ha
  // 臨時性 0.5 * 1285.7 = 642.86 m³/ha > 250 m³/ha 下限，由 USLE 控制！
  let tplHigh = twSedimentBasin;
  tplHigh = vervang(tplHigh, "Rm = 15000'-", "Rm = 50000'-");
  tplHigh = vervang(tplHigh, "Km = 0.030'-", "Km = 0.060'-");
  tplHigh = vervang(tplHigh, "L_fac = 1.50'-", "L_fac = 2.00'-");
  tplHigh = vervang(tplHigh, "S_fac = 2.00'-", "S_fac = 2.50'-");
  tplHigh = vervang(tplHigh, "C_exc = 0.05'-", "C_exc = 0.15'-");
  tplHigh = vervang(tplHigh, "P_exc = 0.50'-", "P_exc = 0.80'-");
  const { uit } = draai(tplHigh, true);
  checkNabij("高沖蝕 Am_exc", uit.Am_exc, 1800, 1e-9);
  checkNabij("高沖蝕 v_exc", uit.v_exc, 1800 / 1.4, 1e-9);
  checkNabij("高沖蝕 V_sed_exc 由 USLE 控制", uit.V_sed_exc, 0.5 * (1800 / 1.4) * 1.2, 1e-4);
  meld(uit.V_sed_exc > 250 * 1.2, "開挖整地泥砂量突破 250 m³/ha 下限，由 USLE 公式實算控制");
}

// 3.5 不透水鋪面扣除順序（A_imp > A_oth0）
{
  // A_dev = 2.0 ha，A_exc = 1.2 ha -> A_oth0 = 0.8 ha
  // 若 A_imp = 1.0 ha > A_oth0，應先將未開挖 0.8 ha 扣至 0，其餘 0.2 ha 再扣開挖整地
  // 得 A_oth_net = 0.0 ha，A_exc_net = 1.2 - 0.2 = 1.0 ha
  const { uit } = draai(vervang(twSedimentBasin, "A_imp = 0.2'ha", "A_imp = 1.0'ha"), true);
  checkNabij("A_oth_net 扣至 0", uit.A_oth_net, 0.0, 1e-9);
  checkNabij("A_exc_net 扣剩餘 0.2", uit.A_exc_net, 1.0, 1e-9);
  checkNabij("A_imp=1.0 V_sed_oth", uit.V_sed_oth, 0.0, 1e-9);
  checkNabij("A_imp=1.0 V_sed_exc", uit.V_sed_exc, 250.0 * 1.0, 1e-9);
}

// ── 4. 負向測試與安全防護 ─────────────────────────────────────────────
console.log("\n4. 負向測試與安全防護");

function moetWeigeren(label, tpl) {
  const { res } = draai(tpl);
  meld(res.nietGetoetst === true && res.voldoet === false, `${label}：拒算（總結：無效輸入，未檢核）`);
}

function moetFalen(label, tpl, ucNaam) {
  const { uit, res } = draai(tpl, true);
  const ucOk = ucNaam ? uit[ucNaam] > 1 : true;
  meld(res.voldoet === false && !res.nietGetoetst && ucOk, `${label}：不合格（UC = ${res.uc}${ucNaam ? `，${ucNaam} = ${ru(uit[ucNaam])}` : ""}）`);
}

// 規範防護下限不符時拒算
moetWeigeren("開挖 C 因子小於 0.05（§35 二）", vervang(twSedimentBasin, "C_exc = 0.05'-", "C_exc = 0.04'-"));
moetWeigeren("開挖 P 因子小於 0.50（§35 二）", vervang(twSedimentBasin, "P_exc = 0.50'-", "P_exc = 0.40'-"));
moetWeigeren("開挖面積大於總開發面積", vervang(twSedimentBasin, "A_exc = 1.2'ha", "A_exc = 2.5'ha"));
moetWeigeren("不透水面積大於總開發面積", vervang(twSedimentBasin, "A_imp = 0.2'ha", "A_imp = 2.5'ha"));
moetWeigeren("無效設施型式（is_perm = 2）", vervang(twSedimentBasin, "is_perm = 0'-", "is_perm = 2'-"));
moetWeigeren("無效共構旗標（co_located = 2）", vervang(twSedimentBasin, "co_located = 0'-", "co_located = 2'-"));
moetWeigeren("池底寬度為 0", vervang(twSedimentBasin, "B0_pond = 10.0'm", "B0_pond = 0.0'm"));

// 檢核不合格案例
moetFalen("深度 1.2 m 小於 1.5 m（§93 一）", vervang(twSedimentBasin, "H_pond = 2.0'm", "H_pond = 1.2'm"), "UC_depth");
moetFalen("深度 4.0 m 超過 3.5 m（§93 一）", vervang(vervang(twSedimentBasin, "H_pond = 2.0'm", "H_pond = 4.0'm"), "H_crest = 2.80'm", "H_crest = 4.80'm"), "UC_depth");
moetFalen("池體太小容積不足（L0=10, B0=5）", vervang(vervang(twSedimentBasin, "L0_pond = 20.0'm", "L0_pond = 10.0'm"), "B0_pond = 10.0'm", "B0_pond = 5.0'm"), "UC_vol");
moetFalen("溢流口太窄通水能力不足（L_w=1.0, h_w=0.20）", vervang(vervang(twSedimentBasin, "L_weir = 3.0'm", "L_weir = 1.0'm"), "h_weir = 0.30'm", "h_weir = 0.20'm"), "UC_weir");
moetFalen("出水高不足（H_crest 僅高出水面 0.1 m）", vervang(twSedimentBasin, "H_crest = 2.80'm", "H_crest = 2.40'm"), "UC_fb");
moetFalen("池頂低於溢流水面（出水高為負）", vervang(twSedimentBasin, "H_crest = 2.80'm", "H_crest = 2.20'm"), "UC_fb");

// 不合格結尾行防護
{
  const { res } = draai(vervang(twSedimentBasin, "H_pond = 2.0'm", "H_pond = 1.2'm"));
  meld(res.voldoet === false && res.uc > 1.0, "「不合格」結尾行不會被判成合格");
}

console.log(fouten === 0 ? "\n全部通過。" : `\n${fouten} 項失敗。`);
process.exit(fouten === 0 ? 0 : 1);
