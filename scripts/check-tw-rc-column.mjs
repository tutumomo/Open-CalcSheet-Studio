/**
 * 台灣規範鋼筋混凝土矩形柱模組檢核腳本（templates/tw-rc-column.ts）。
 *
 * 規範依據：內政部《建築物混凝土結構設計規範》（112年8月10日版，rc112）。
 * 依 AGENTS.md §5 計算安全規定：
 * 1. 斷面與材料性質檢核（Ec、Ag、Ig、Ast、ρg、r、d、s_clear）
 * 2. 每條主要規範公式檢核：
 *    - 長細比 kℓu/r 與忽略長細比判準（6.2.5.1）
 *    - 最小偏心彎矩 M2,min（6.6.4.5.4）
 *    - 等效彎矩因數 Cm（6.6.4.5.3）
 *    - 柱有效抗彎剛度 (EI)eff（6.6.4.4.4a）與歐拉臨界挫屈力 Pc（6.6.4.4.2）
 *    - 彎矩放大係數 δns（6.6.4.5.2）與放大後設計端彎矩 Mc（6.6.4.5.1）
 *    - 純軸壓強度 P0、閉合箍筋柱上限 Pn,max、設計軸壓上限 ϕPn,max（22.4.2、表 21.2.2）
 *    - 平衡破壞中性軸深度 cb、平衡點軸力 Pnb、平衡點抗彎強度 Mnb、純彎強度 ϕMn0
 *    - 軸彎互制容許抗彎容量 ϕMn,cap 與互制檢核比 UC_PM
 *    - 軸壓提升之混凝土剪力強度 Vc（22.5.5.1）、剪力鋼筋強度 Vs、剪力上限 Vs,max、設計剪力強度 ϕVn
 *    - 閉合箍筋最小直徑 dtie,min（25.7.2.2）與最大間距 s,max（25.7.2.1）
 *    - 主筋淨間距限制（25.2.3）
 * 3. 端到端基準案例一：RC 矩形短柱（完全合格，短柱狀態）
 * 4. 端到端基準案例二：RC 矩形長柱（完全合格，單曲率二階彎矩放大）
 * 5. 邊界與極限條件檢核（純軸壓極限臨界、主筋直徑提升致箍筋不足）
 * 6. 負面測試（軸壓超限、互制超限、剪力超限、鋼筋比超限、間距超限、淨距不足絕不誤判合格）
 * 7. 無效輸入與幾何防護網檢核（尺寸為 0 或負值、未配足鋼筋標示未檢核）
 * 8. 報告結尾行解析相容性檢核（leesResultaat）
 * 9. 第二套獨立力學核對：截面應變相容精確解對照，驗證三點折線法之保守安全性
 *
 * 執行方式：
 *   node scripts/check-tw-rc-column.mjs
 */

import { parse, evaluate, render } from "../packages/core/dist/index.js";
import { laadTemplate } from "./lib/refcheck.mjs";

const { leesResultaat, leesGetallen } = await import("../packages/desktop/src/components/calc/bladLezen.ts");

const tpl = laadTemplate("tw-rc-column.ts");

let fouten = 0;
let getest = 0;

const waar = (wat, ok, detail = "") => {
  getest++;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${wat}${ok || !detail ? "" : ` — ${detail}`}`);
};

const baseCase = {
  f_c: "28",
  f_y: "420",
  f_yt: "280",
  b: "500",
  h: "500",
  l_u: "3.5",
  k_factor: "1.0",
  c_c: "40",
  beta_dns: "0.6",
  main_bar: "4", // D25
  tie_bar: "1",  // D10
  n_face: "3",
  n_side: "1",
  n_legs: "4",
  s_tie: "150",
  P_u: "1800",
  M_1: "80",
  M_2: "120",
  V_u: "150",
};

function doorreken(waarden = {}, scope = {}) {
  const input = { ...baseCase, ...waarden };
  const nodes = evaluate(parse(tpl), input, scope);
  const html = render(nodes);
  const tekst = html.replace(/<annotation[\s\S]*?<\/annotation>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return { uit: leesGetallen(nodes), tekst, html, r: leesResultaat(nodes, "tw-rc-column"), nodes };
}

function toets(r, verwacht, tol = 1.5e-3) {
  for (const [naam, doel] of Object.entries(verwacht)) {
    getest++;
    const ons = r.uit[naam];
    const ok = ons !== undefined && Math.abs(ons - doel) <= tol * Math.max(Math.abs(doel), 1e-9);
    if (!ok) fouten++;
    console.log(`  ${ok ? "OK    " : "FOUT  "} ${naam.padEnd(12)} 計算 ${String(ons === undefined ? "—" : Number(ons.toPrecision(6))).padStart(10)}   手算 ${doel}`);
  }
}

function geenFouten(r, wat) {
  const signaal = ["Error", "Undefined symbol", "NaN", "niet gedefinieerd", "Unexpected type", "Infinity"].find((s) => r.tekst.includes(s));
  waar(`${wat}: 無錯誤訊息或 NaN`, !signaal, signaal ? r.tekst.slice(Math.max(0, r.tekst.indexOf(signaal) - 60), r.tekst.indexOf(signaal) + 60) : "");
}

const voldoet = (r) => r.r.voldoet === true && r.r.uc !== null && r.r.uc <= 1.0 && !r.r.nietGetoetst;
const voldoetNiet = (r) => r.r.voldoet === false && r.r.uc !== null && r.r.uc > 1.0 && !r.r.nietGetoetst;
const nietGetoetst = (r) => r.r.voldoet === null && (r.r.nietGetoetst === true || r.tekst.includes("未檢核"));

console.log("================================================================================");
console.log("台灣規範 rc112 鋼筋混凝土矩形柱模組檢核（tw-rc-column）");
console.log("================================================================================");

// -----------------------------------------------------------------------------
// 1. 幾何斷面與材料性質檢核
// -----------------------------------------------------------------------------
console.log("\n1. 幾何斷面與材料性質檢核");
{
  const r = doorreken({});
  geenFouten(r, "幾何與材料");

  // 斷面 500×500 mm, fc'=28 MPa, 8-D25 (Ab=506.7 mm²), 4肢D10箍筋
  toets(r, {
    E_c: 19843.13,    // 3750*sqrt(28) = 19843.13 MPa (rc112 19.2.2.1.b)
    A_g: 2500,        // 500*500 mm² = 2500 cm²
    I_g: 520833.33,   // 500*500^3/12 / 10000 = 520833.33 cm⁴
    n_b: 8,           // 2*3 + 2*1 = 8 根
    A_st: 40.536,     // 8 * 506.7 mm² / 100 = 40.536 cm²
    rho_g: 0.016214,  // 4053.6 / 250000 = 0.016214
    r_gyr: 144.338,   // sqrt(Ig/Ag) = 500 / sqrt(12) = 144.3376 mm
    s_clear_b: 162.37,// (500 - 80 - 19.06 - 3*25.4)/2 = 162.37 mm
  }, 2e-3);
}

// -----------------------------------------------------------------------------
// 2. 主要規範公式逐項檢核
// -----------------------------------------------------------------------------
console.log("\n2. 主要規範公式檢核");

console.log("  2.1 長細效應忽略判準與歐拉臨界挫屈軸力 Pc");
{
  const r = doorreken({});
  toets(r, {
    slenderness: 24.2487,
    slender_limit: 40.0,
    is_short: 1,
    M2_min: 54.0,       // 1800 * (15 + 0.03*500) * 1e-3 = 54 kN*m
    M2_eff: 120.0,
    C_m: 0.40,          // max(0.6 - 0.4*(80/120); 0.4) = 0.40
    P_c: 20816.74,      // pi^2 * 2.58375e13 / 3500^2 / 1000 = 20816.7 kN
    delta_ns: 1.0,      // 短柱免放大
    M_c: 120.0,
  }, 2e-3);
}

console.log("  2.2 純軸壓標稱與設計強度（P0、Pn,max、ϕPn,max）");
{
  // 500×500 mm, fc'=28 MPa, Ast=4053.6 mm², SD420
  // P0 = 0.85*28*(250000-4053.6) + 420*4053.6 = 5853524 + 1702512 = 7556.04 kN
  // Pn,max = 0.80 * 7556.04 = 6044.83 kN
  // phiPn_max = 0.65 * 6044.83 = 3929.14 kN
  const r = doorreken({});
  toets(r, {
    P_0: 7556.04,
    Pn_max: 6044.83,
    phiPn_max: 3929.14,
    UC_axial: 0.45812, // 1800 / 3929.14
  }, 2e-3);
}

console.log("  2.3 平衡破壞力學平衡點與 P-M 容量（cb、Pnb、Mnb、ϕPnb、ϕMnb、ϕMn,cap）");
{
  // 500×500 mm, d'=62.23 mm, d=437.77 mm, fy=420 MPa, fc'=28 MPa
  // As_face = 3 * 506.7 = 1520.1 mm²
  // cb = (600/1020)*437.77 = 257.512 mm, ab = 0.85*cb = 218.885 mm
  // Cc = 0.85*28*500*218.885 = 2604.73 kN
  // Cs = 1520.1 * (420 - 0.85*28) = 602.26 kN
  // T = 1520.1 * 420 = 638.44 kN
  // Pnb = 2604.73 + 602.26 - 638.44 = 2568.55 kN, phiPnb = 0.65*2568.55 = 1669.56 kN
  // Mnb = 2604.73*(0.25 - 0.10944) + 602.26*(0.25 - 0.06223) + 638.44*(0.43777 - 0.25) = 599.08 kN*m
  // phiMnb = 0.65*599.08 = 389.40 kN*m
  // Mn0 = 1520.1 * 420 * (437.77 - 62.23) * 1e-6 = 239.76 kN*m, phiMn0 = 0.90*Mn0 = 215.78 kN*m
  // phiP0 = 0.65*7556.04 = 4911.42 kN
  // phiMn,cap = 389.40 * (4911.42 - 1800) / (4911.42 - 1669.56) = 389.40 * (3111.42 / 3241.86) = 373.735 kN*m
  // UC_PM = 120 / 373.735 = 0.32108
  const r = doorreken({});
  toets(r, {
    c_b: 257.512,
    P_bal: 2568.55,
    M_bal: 599.08,
    phiP_bal: 1669.56,
    phiM_bal: 389.40,
    phiMn_0: 215.78,
    phiMn_cap: 373.735,
    UC_PM: 0.321083,
  }, 2e-3);
}

console.log("  2.4 剪力強度 Vc、Vs、Vs,max 與 ϕVn");
{
  // Pu=1800 kN, Nu/(6Ag) = 1800000/(6*250000) = 1.20 MPa ≤ 0.05*28 = 1.40 MPa
  // Vc = (0.17*sqrt(28) + 1.20) * 500 * 437.77 / 1000 = (0.89956 + 1.20) * 218.885 = 459.56 kN
  // 4 肢 D10 (Av=285.32 mm²), fyt=280 MPa, s=150 mm
  // Vs = 285.32 * 280 * 437.77 / 150 / 1000 = 233.16 kN
  // Vs,max = 0.66 * sqrt(28) * 500 * 437.77 / 1000 = 764.43 kN
  // phiVn = 0.75 * (459.56 + 233.16) = 519.54 kN
  const r = doorreken({});
  toets(r, {
    V_c: 459.56,
    V_s: 233.16,
    Vs_max: 764.43,
    phiV_n: 519.54,
    UC_shear: 0.28872,
  }, 2e-3);
}

console.log("  2.5 閉合箍筋構造細則（dtie,min、s,max）");
{
  // 主筋 D25 ≤ D32 -> dtie,min = 9.53 mm (D10)
  // s,max = min(16*25.4; 48*9.53; 500) = min(406.4; 457.44; 500) = 406.4 mm
  const r = doorreken({});
  toets(r, {
    dtie_min: 9.53,
    s_max: 406.4,
    UC_tie: 0.36909, // 150 / 406.4
  }, 2e-3);
}

// -----------------------------------------------------------------------------
// 3. 端到端基準案例一：RC 矩形短柱（完全合格）
// -----------------------------------------------------------------------------
console.log("\n3. 端到端基準案例一：RC 矩形短柱（完全合格）");
console.log("   斷面 500×500 mm, ℓu = 3.5 m, C280, SD420, 8-D25, 4肢D10@150, Pu = 1800 kN, M1 = 80 kN·m, M2 = 120 kN·m, Vu = 150 kN");
{
  const r = doorreken({});
  geenFouten(r, "短柱基準案例");
  toets(r, {
    UC_axial: 0.45812,
    UC_PM: 0.321083,
    UC_shear: 0.28872,
    UC_tie: 0.36909,
    UC_rho_min: 0.61674, // 0.01 / 0.016214
    UC_max: 0.62,
  }, 2e-3);
  waar("基準案例一：全部檢核合格且控制 UC ≤ 1.0", voldoet(r));
  waar("基準案例一：控制 UC 正好為 0.62", Math.abs(r.r.uc - 0.62) < 0.01);
}

// -----------------------------------------------------------------------------
// 4. 端到端基準案例二：RC 矩形長柱（單曲率二階放大，完全合格）
// -----------------------------------------------------------------------------
console.log("\n4. 端到端基準案例二：RC 矩形長柱（單曲率二階放大，完全合格）");
console.log("   斷面 400×400 mm, ℓu = 5.0 m (長柱), C280, SD420, 8-D22, 4肢D10@120, Pu = 800 kN, M1 = -30 kN·m, M2 = 60 kN·m, Vu = 80 kN");
{
  const r = doorreken({
    b: "400",
    h: "400",
    l_u: "5.0",
    main_bar: "3", // D22
    tie_bar: "1",  // D10
    n_face: "3",
    n_side: "1",
    s_tie: "120",
    P_u: "800",
    M_1: "-30",
    M_2: "60",
    V_u: "80",
  });
  geenFouten(r, "長柱基準案例");
  toets(r, {
    slenderness: 43.3013,
    slender_limit: 28.0, // 34 + 12*(-30/60) = 28.0
    C_m: 0.80,           // 0.6 - 0.4*(-30/60) = 0.80
    delta_ns: 1.07427,   // Cm / (1 - Pu/0.75Pc) = 0.80 / (1 - 800/3133.41) = 1.0743
    M_c: 64.456,         // 1.07427 * 60 = 64.456 kN*m
    UC_max: 0.52,
  }, 2e-3);
  waar("基準案例二：長細比大於限值判定為長柱 is_short ≡ 0", r.uit.is_short === 0);
  waar("基準案例二：彎矩放大係數 δns > 1.0", r.uit.delta_ns > 1.0);
  waar("基準案例二：長柱全部檢核合格且控制 UC ≤ 1.0", voldoet(r));
}

// -----------------------------------------------------------------------------
// 5. 邊界與極限條件檢核
// -----------------------------------------------------------------------------
console.log("\n5. 邊界與極限條件檢核");
{
  // 5.1 設計軸力正好達到最大容許軸壓上限（Pu = 3929.13 kN），偏心彎矩滿足 M2,min
  const rLimitAxial = doorreken({ P_u: "3929.13", M_1: "0", M_2: "115" });
  toets(rLimitAxial, { UC_axial: 1.0 }, 1.5e-3);
  waar("軸力達到設計上限且偏心彎矩未超限時仍判定合格", voldoet(rLimitAxial));

  // 5.2 主筋號數達 D36 時，最小箍筋規定直徑提升為 D13 (12.7 mm)
  const rD36 = doorreken({ main_bar: "7", tie_bar: "1" }); // 主筋 D36, 箍筋配 D10
  waar("主筋 D36 配 D10 箍筋判定直徑不足（不合格）", rD36.uit.UC_dtie > 1.0 && voldoetNiet(rD36));
}

// -----------------------------------------------------------------------------
// 6. 負面測試（超限情況絕不誤判合格）
// -----------------------------------------------------------------------------
console.log("\n6. 負面測試（超限情況絕不誤判合格）");
{
  // 6.1 軸力超限 (Pu = 4500 kN > ϕPn,max = 3929 kN)
  const r1 = doorreken({ P_u: "4500" });
  waar("軸力超限判為不合格", voldoetNiet(r1));

  // 6.2 彎矩超限 (M2 = 500 kN·m > ϕMn,cap)
  const r2 = doorreken({ M_2: "500" });
  waar("彎矩超限判為不合格", voldoetNiet(r2));

  // 6.3 剪力超限 (Vu = 600 kN > ϕVn = 519 kN)
  const r3 = doorreken({ V_u: "600" });
  waar("剪力超限判為不合格", voldoetNiet(r3));

  // 6.4 鋼筋比過小 (4-D16 配在 600×600 斷面, ρg = 4*198.6/360000 = 0.22% < 1.0%)
  const r4 = doorreken({ b: "600", h: "600", main_bar: "1", n_face: "2", n_side: "0" });
  waar("鋼筋比低於 1.0% 判為不合格", r4.uit.UC_rho_min > 1.0 && voldoetNiet(r4));

  // 6.5 鋼筋比過大 (16-D36 配在 400×400 斷面, ρg = 16*1006.6/160000 = 10.0% > 8.0%)
  const r5 = doorreken({ b: "400", h: "400", main_bar: "7", n_face: "5", n_side: "3" });
  waar("鋼筋比超過 8.0% 判為不合格", r5.uit.UC_rho_max > 1.0 && voldoetNiet(r5));

  // 6.6 箍筋間距過大 (s = 500 mm > s,max = 406.4 mm)
  const r6 = doorreken({ s_tie: "500" });
  waar("箍筋間距超限判為不合格", r6.uit.UC_tie > 1.0 && voldoetNiet(r6));

  // 6.7 主筋淨間距過小 (400×400 斷面極端面排 6 根 D36, s_clear = 17.2 mm < 40 mm)
  const r7 = doorreken({ b: "400", h: "400", main_bar: "7", n_face: "6", n_side: "1" });
  waar("主筋淨間距低於 40 mm 判為不合格", r7.uit.UC_sclear > 1.0 && voldoetNiet(r7));
}

// -----------------------------------------------------------------------------
// 7. 無效輸入與防護網檢核（絕不可誤判合格）
// -----------------------------------------------------------------------------
console.log("\n7. 無效輸入與防護網檢核（絕不可誤判合格）");
{
  // 7.1 斷面尺寸為 0 或負值
  const rZeroB = doorreken({ b: "0" });
  waar("柱寬為 0 標示未檢核且不判為合格", nietGetoetst(rZeroB));

  const rNegH = doorreken({ h: "-500" });
  waar("柱深為負標示未檢核且不判為合格", nietGetoetst(rNegH));

  // 7.2 柱長度為 0
  const rZeroL = doorreken({ l_u: "0" });
  waar("柱長度為 0 標示未檢核", nietGetoetst(rZeroL));

  // 7.3 主筋根數不足 4 根
  const rFewBars = doorreken({ n_face: "1", n_side: "0" });
  waar("主筋少於 4 根標示未檢核", nietGetoetst(rFewBars));
}

// -----------------------------------------------------------------------------
// 8. 報告結尾行解析相容性檢核（leesResultaat）
// -----------------------------------------------------------------------------
console.log("\n8. 報告結尾行解析相容性檢核（leesResultaat）");
{
  const rOk = doorreken({});
  waar("合格案例結尾行被正確解析為 true", rOk.r.voldoet === true);
  waar("合格案例結尾行讀取到有效 UC", typeof rOk.r.uc === "number" && rOk.r.uc <= 1.0);

  const rNok = doorreken({ P_u: "5000" });
  waar("不合格案例結尾行被正確解析為 false", rNok.r.voldoet === false);
  waar("不合格案例結尾行讀取到 UC > 1.0", typeof rNok.r.uc === "number" && rNok.r.uc > 1.0);

  const rInvalid = doorreken({ b: "-100" });
  waar("無效輸入被解析為未檢核", rInvalid.r.nietGetoetst === true && rInvalid.r.voldoet === null);
}

// -----------------------------------------------------------------------------
// 9. 第二套獨立力學核對：應變相容精確解對照
// -----------------------------------------------------------------------------
console.log("\n9. 第二套獨立力學核對（應變相容精確求解 vs 簡化三點折線法）");
{
  // 建立完整的斷面纖維/分層應變相容求解器（不依賴模板代碼，獨立二分法求解平衡中性軸深度 c）
  function solveStrainCompatibility({ b, h, fc, fy, Es, layers, Pu }) {
    const beta1 = fc <= 28 ? 0.85 : Math.max(0.65, 0.85 - 0.05 * (fc - 28) / 7);
    const eps_cu = 0.003;
    const h2 = h / 2;

    function calcSection(c) {
      const a = Math.min(beta1 * c, h);
      const Cc = 0.85 * fc * b * a;
      const Mc_arm = h2 - a / 2;
      let P_total = Cc;
      let M_total = Cc * Mc_arm;

      let eps_t = 0;
      for (const layer of layers) {
        const eps_s = eps_cu * (c - layer.d) / c;
        if (layer.d > h2 && eps_s < 0) {
          eps_t = Math.max(eps_t, -eps_s);
        }
        let fs = Math.max(-fy, Math.min(fy, Es * eps_s));
        if (layer.d <= a && fs > 0) {
          fs -= 0.85 * fc; // 扣除受壓混凝土佔位
        }
        const Fs = layer.A * fs;
        P_total += Fs;
        M_total += Fs * (h2 - layer.d);
      }

      const eps_ty = fy / Es;
      let phi = 0.65;
      if (eps_t <= eps_ty) {
        phi = 0.65;
      } else if (eps_t >= eps_ty + 0.003) {
        phi = 0.90;
      } else {
        phi = 0.65 + 0.25 * (eps_t - eps_ty) / 0.003;
      }

      return {
        c,
        Pn: P_total / 1000,
        Mn: M_total / 1e6,
        phi,
        phiPn: phi * P_total / 1000,
        phiMn: phi * M_total / 1e6,
        eps_t,
      };
    }

    let cLow = 10;
    let cHigh = h * 2;
    for (let iter = 0; iter < 100; iter++) {
      const cMid = (cLow + cHigh) / 2;
      const res = calcSection(cMid);
      if (res.phiPn < Pu) {
        cLow = cMid;
      } else {
        cHigh = cMid;
      }
    }
    return calcSection((cLow + cHigh) / 2);
  }

  // 針對基準案例斷面（500×500 mm，8-D25，Pu = 1800 kN）進行精確求解：
  const exact = solveStrainCompatibility({
    b: 500,
    h: 500,
    fc: 28,
    fy: 420,
    Es: 200000,
    layers: [
      { d: 62.23, A: 3 * 506.7 },   // 受壓緣 3 根 D25
      { d: 250.0, A: 2 * 506.7 },   // 斷面中線 2 根 D25
      { d: 437.77, A: 3 * 506.7 },  // 受拉緣 3 根 D25
    ],
    Pu: 1800,
  });

  const r = doorreken({});
  const phiMn_approx = r.uit.phiMn_cap; // 簡化三點折線法容量（約 373.7 kN·m）
  const phiMn_exact = exact.phiMn;      // 精確應變相容求解容量（約 384.0 kN·m）

  console.log(`   應變相容精確解：中性軸 c = ${exact.c.toFixed(2)} mm, Mn = ${exact.Mn.toFixed(2)} kN·m, ϕ = ${exact.phi}, ϕMn = ${phiMn_exact.toFixed(2)} kN·m`);
  console.log(`   模板簡化折線法：ϕMn,cap = ${phiMn_approx.toFixed(2)} kN·m`);

  waar("簡化三點折線法容量低於應變相容精確解（證明屬工程安全保守側）", phiMn_approx <= phiMn_exact);
  waar("簡化三點折線法與精確解之相對誤差在 5% 以內（兼具精度與安全度）", Math.abs(phiMn_exact - phiMn_approx) / phiMn_exact < 0.05);
}

console.log("--------------------------------------------------------------------------------");
console.log(`檢核結果：共 ${getest} 項檢查，${fouten} 項失敗。`);
console.log("--------------------------------------------------------------------------------");

if (fouten > 0) {
  process.exit(1);
}
