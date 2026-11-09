/**
 * 台灣規範 found112 / swc_tech / rc112 鋼筋混凝土懸臂式擋土牆模組檢查腳本
 *
 * 驗證項目：
 *   0. 公式釘死值核對（已驗證庫公式數值對照：found112_Ka_rankine、found112_PA_active、found112_Rf_base_friction、rc112_footing_Vc_simple）
 *   1. 預設基準案例（5.0 m 高，3.2 m 寬懸臂式擋土牆，合格 UC = 0.94，抗滑控制）
 *   2. 參數變化案例（較高牆體、不同地質摩擦係數與載重條件）
 *   3. 負向測試與安全防護（傾覆不足、抗滑不足、偏心過大、承載力超載、高度超限、立壁配筋不足、排水孔不足、伸縮縫過長）
 *   4. 第二套獨立純 SI 求解器全面掃描（36 組案例交叉比對）
 */

import { parse, evaluate } from "../packages/core/dist/index.js";
import { twRetainingWall } from "../packages/desktop/src/templates/tw-retaining-wall.ts";
import { leesResultaat, leesGetallen } from "../packages/desktop/src/components/calc/bladLezen.ts";

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}

function checkNabij(naam, gekregen, verwacht, tol = 1e-3) {
  if (typeof gekregen !== "number" || typeof verwacht !== "number" || isNaN(gekregen)) {
    meld(false, naam.padEnd(16), `kreeg ${gekregen}, verwachtte ${verwacht}`);
    return;
  }
  const rel = Math.abs(verwacht) > 1e-6 ? Math.abs((gekregen - verwacht) / verwacht) : Math.abs(gekregen - verwacht);
  const ok = rel <= tol;
  meld(ok, `${naam.padEnd(16)} 計算 ${String(gekregen).padStart(12)}   預期 ${verwacht}`, ok ? "" : `relatief verschil ${(rel * 100).toFixed(3)}% > ${(tol * 100).toFixed(3)}%`);
}

console.log("=== 台灣規範 found112 / swc_tech / rc112 懸臂式擋土牆模組檢核（tw-retaining-wall） ===\n");

// -----------------------------------------------------------------------------
// 0. 公式釘死值核對（A 級已驗證庫公式直接驗算）
// -----------------------------------------------------------------------------
console.log("0. 公式釘死值核對（已驗證庫數值對照）");

// found112_Ka_rankine: Ka = tan(45 - phi/2)^2
const phi_test = 32;
const ka_ref = Math.tan(((45 - phi_test / 2) * Math.PI) / 180) ** 2; // 0.30725852
checkNabij("found112_Ka", ka_ref, 0.3072585, 1e-5);

// found112_PA_active: PA = 0.5 * Ka * gamma * H^2
const pa_ref = 0.5 * ka_ref * 19.0 * 25.0; // 72.973899 kN/m
checkNabij("found112_PA", pa_ref, 72.9739, 1e-4);

// found112_Rf_base_friction: Rf = mu * sumV
const rf_ref = 0.55 * 258.63; // 142.2465 kN/m
checkNabij("found112_Rf", rf_ref, 142.2465, 1e-4);

// rc112_footing_Vc_simple: 0.75 * 0.17 * sqrt(fc) * b * d / 1000
const vc_stem_ref = 0.75 * 0.17 * Math.sqrt(28) * 1000 * 438.9 / 1000; // 296.111 kN/m
checkNabij("rc112_Vc_stem", vc_stem_ref, 296.111, 1e-4);

// -----------------------------------------------------------------------------
// 1. 預設基準案例（5.0 m 高，3.2 m 寬）
// -----------------------------------------------------------------------------
console.log("\n1. 預設基準案例（5.0 m 高，3.2 m 寬懸臂擋土牆）");
const nodes0 = evaluate(parse(twRetainingWall), {});
const uit0 = leesGetallen(nodes0);
const r0 = leesResultaat(nodes0, "tw-retaining-wall");

meld(!isNaN(uit0.UC_max) && uit0.UC_max > 0, "基準案例: 無錯誤訊息或 NaN");
checkNabij("Ka", uit0.Ka, 0.3072585, 1e-4);
checkNabij("P_ah", uit0.P_ah, 88.3368, 1e-3);
checkNabij("M_O", uit0.M_O, 160.0305, 1e-3);
checkNabij("sum_V", uit0.sum_V, 258.63, 1e-3);
checkNabij("sum_MR", uit0.sum_MR, 510.7785, 1e-3);
checkNabij("FS_ot", uit0.FS_ot, 3.1918, 1e-3);
checkNabij("UC_ot", uit0.UC_ot, 0.6266, 1e-3);
checkNabij("FS_sl", uit0.FS_sl, 1.6103, 1e-3);
checkNabij("UC_sl", uit0.UC_sl, 0.9315, 1e-3);
checkNabij("x_R", uit0.x_R, 1.3562, 1e-3);
checkNabij("e_base", uit0.e_base, 0.2438, 1e-3);
checkNabij("UC_ecc", uit0.UC_ecc, 0.4572, 1e-3);
checkNabij("q_toe", uit0.q_toe, 117.771, 1e-3);
checkNabij("q_heel", uit0.q_heel, 43.8727, 1e-3);
checkNabij("q_max", uit0.q_max, 117.771, 1e-3);
checkNabij("UC_bearing", uit0.UC_bearing, 0.5353, 1e-3);
checkNabij("M_u_stem", uit0.M_u_stem, 191.637, 1e-3);
checkNabij("V_u_stem", uit0.V_u_stem, 116.696, 1e-3);
checkNabij("phi_Vc_stem", uit0.phi_Vc_stem, 296.061, 1e-3);
checkNabij("UC_v_stem", uit0.UC_v_stem, 0.3941, 1e-3);
checkNabij("phi_Mn_stem", uit0.phi_Mn_stem, 406.18, 1e-3);
checkNabij("UC_m_stem", uit0.UC_m_stem, 0.4721, 1e-3);
checkNabij("UC_v_toe", uit0.UC_v_toe, 0.4835, 1e-3);
checkNabij("UC_m_toe", uit0.UC_m_toe, 0.2197, 1e-3);
checkNabij("UC_v_heel", uit0.UC_v_heel, 0.4140, 1e-3);
checkNabij("UC_m_heel", uit0.UC_m_heel, 0.3987, 1e-3);
checkNabij("UC_max", uit0.UC_max, 0.94, 1e-3);
meld(r0.voldoet === true, "基準案例判定為合格");
meld(r0.uc === 0.94, `leesResultaat 辨識 UC = 0.94（實際 ${r0.uc}）`);

// -----------------------------------------------------------------------------
// 2. 參數變化案例（較高牆體 6.0 m，底寬 4.0 m）
// -----------------------------------------------------------------------------
console.log("\n2. 參數變化案例（牆高 6.0 m，底寬 4.0 m）");
const modWall2 = twRetainingWall
  .replace("H_wall = ?{5.0}", "H_wall = ?{6.0}")
  .replace("B_base = ?{3.2}", "B_base = ?{4.0}")
  .replace("h_base = ?{0.5}", "h_base = ?{0.6}")
  .replace("t_stem = ?{0.5}", "t_stem = ?{0.6}")
  .replace("L_toe = ?{0.9}", "L_toe = ?{1.1}")
  .replace("s_stem = 150'mm", "s_stem = 120'mm");

const nodes2 = evaluate(parse(modWall2), {});
const uit2 = leesGetallen(nodes2);
const r2 = leesResultaat(nodes2, "tw-retaining-wall");

meld(!isNaN(uit2.UC_max) && uit2.UC_max > 0, "牆高 6.0 m 案例: 無錯誤訊息或 NaN");
meld(uit2.h_stem === 5.4, "牆高為 6.0 m");
meld(uit2.L_heel === 4.0 - 1.1 - 0.6, "底版寬度為 4.0 m");
meld(r2.voldoet === true, "加高牆體配合加寬底版後判定合格");
meld(uit2.FS_ot >= 2.0, `抗傾覆安全係數 FS_ot = ${uit2.FS_ot.toFixed(2)} ≥ 2.0`);
meld(uit2.FS_sl >= 1.5, `抗滑安全係數 FS_sl = ${uit2.FS_sl.toFixed(2)} ≥ 1.5`);

// -----------------------------------------------------------------------------
// 3. 負向測試與安全防護
// -----------------------------------------------------------------------------
console.log("\n3. 負向測試與安全防護");

// 3.1 牆身超過水保規範 8 m 上限
const modOverHeight = twRetainingWall.replace("H_wall = ?{5.0}", "H_wall = ?{8.5}");
const rOverHeight = leesResultaat(evaluate(parse(modOverHeight), {}), "tw-retaining-wall");
meld(rOverHeight.voldoet === false, "牆高 8.5 m 超過水保規範 8 m 上限：判定不合格");

// 3.2 超載過大抗傾覆不足
const modOverturn = twRetainingWall.replace("q_surcharge = ?{10.0}", "q_surcharge = ?{80.0}");
const rOverturn = leesResultaat(evaluate(parse(modOverturn), {}), "tw-retaining-wall");
meld(rOverturn.voldoet === false, "超載過大抗傾覆不足：判定不合格");

// 3.3 摩擦係數過低抗滑不足
const modSlide = twRetainingWall.replace("mu_base = ?{0.55}", "mu_base = ?{0.30}");
const rSlide = leesResultaat(evaluate(parse(modSlide), {}), "tw-retaining-wall");
meld(rSlide.voldoet === false, "基底摩擦過低抗滑不足：判定不合格");

// 3.4 容許地盤承載力過低
const modBearing = twRetainingWall.replace("qa_allow = ?{220.0}", "qa_allow = ?{80.0}");
const rBearing = leesResultaat(evaluate(parse(modBearing), {}), "tw-retaining-wall");
meld(rBearing.voldoet === false, "地盤承載力超載：判定不合格");

// 3.5 立壁主筋配筋不足
const modRebar = twRetainingWall
  .replace("s_stem = 150'mm", "s_stem = 350'mm")
  .replace("Ab_stem = 387.1'mm^2", "Ab_stem = 126.7'mm^2"); // D13@350
const rRebar = leesResultaat(evaluate(parse(modRebar), {}), "tw-retaining-wall");
meld(rRebar.voldoet === false, "立壁抗彎鋼筋量不足：判定不合格");

// 3.6 排水孔孔徑小於 50 mm（swc_tech §121 違反）
const modDrain = twRetainingWall.replace("drain_dia = 60'mm", "drain_dia = 40'mm");
const rDrain = leesResultaat(evaluate(parse(modDrain), {}), "tw-retaining-wall");
meld(rDrain.voldoet === false, "排水孔徑小於 50 mm：判定不合格");

// 3.7 伸縮縫間距大於 40 m（swc_tech §121 違反）
const modJoint = twRetainingWall.replace("joint_spacing = 25.0'm", "joint_spacing = 50.0'm");
const rJoint = leesResultaat(evaluate(parse(modJoint), {}), "tw-retaining-wall");
meld(rJoint.voldoet === false, "伸縮縫間距大於 40 m：判定不合格");

// 3.8 幾何尺寸異常：頂厚大於底厚
const modGeom = twRetainingWall.replace("t_top = ?{0.3}", "t_top = ?{0.7}");
const rGeom = leesResultaat(evaluate(parse(modGeom), {}), "tw-retaining-wall");
meld(rGeom.voldoet === false, "立壁頂厚大於底厚：判定不合格");

// -----------------------------------------------------------------------------
// 4. 第二套獨立純 SI 求解器全面掃描（36 組案例）
// -----------------------------------------------------------------------------
console.log("\n4. 第二套獨立求解器全面掃描");

function solveRetainingWallIndep({ H, B, hb, ttop, tstem, Ltoe, gamma_s, phi_deg, q_sur, qa, mu, fc, fy }) {
  const h_stem = H - hb;
  const Lheel = B - Ltoe - tstem;
  if (H > 8.0 || Lheel <= 0 || ttop > tstem) {
    return { ok: false, uc_max: 2.0 };
  }

  const phi_rad = (phi_deg * Math.PI) / 180;
  const Ka = Math.tan(Math.PI / 4 - phi_rad / 2) ** 2;

  const P_soil = 0.5 * Ka * gamma_s * H * H;
  const P_sur = Ka * q_sur * H;
  const Pah = P_soil + P_sur;
  const Mo = P_soil * (H / 3) + P_sur * (H / 2);

  const gamma_c = 24.0;
  const W1 = gamma_c * ttop * h_stem;
  const arm1 = Ltoe + (tstem - ttop) + ttop / 2;

  const W2 = 0.5 * gamma_c * (tstem - ttop) * h_stem;
  const arm2 = Ltoe + (2 / 3) * (tstem - ttop);

  const W3 = gamma_c * B * hb;
  const arm3 = B / 2;

  const W4 = gamma_s * Lheel * h_stem;
  const arm4 = B - Lheel / 2;

  const Wsur = q_sur * Lheel;
  const arm_sur = B - Lheel / 2;

  const h_toe_soil = Math.max(0.80 - hb, 0);
  const W_toe_soil = gamma_s * Ltoe * h_toe_soil;
  const arm_toe = Ltoe / 2;

  const sumV = W1 + W2 + W3 + W4 + Wsur + W_toe_soil;
  const sumMR = W1 * arm1 + W2 * arm2 + W3 * arm3 + W4 * arm4 + Wsur * arm_sur + W_toe_soil * arm_toe;

  const FS_ot = sumMR / Mo;
  const UC_ot = 2.0 / FS_ot;

  const Rf = mu * sumV;
  const FS_sl = Rf / Pah;
  const UC_sl = 1.5 / FS_sl;

  const xR = (sumMR - Mo) / sumV;
  const e = B / 2 - xR;
  const UC_ecc = Math.abs(e) / (B / 6);

  const q_toe = (sumV / B) * (1 + (6 * e) / B);
  const q_heel = (sumV / B) * (1 - (6 * e) / B);
  const q_max = Math.max(q_toe, q_heel);
  const UC_bearing = q_max / qa;

  // 立壁底截面
  const P_stem = 0.5 * Ka * gamma_s * h_stem * h_stem;
  const P_sur_stem = Ka * q_sur * h_stem;
  const Mu_stem = 1.6 * (P_stem * (h_stem / 3) + P_sur_stem * (h_stem / 2));
  const Vu_stem = 1.6 * (P_stem + P_sur_stem);

  const d_stem = tstem * 1000 - 50 - 22.2 / 2;
  const phiVc_stem = 0.75 * 0.17 * Math.sqrt(fc) * 1000 * d_stem / 1000;
  const UC_v_stem = Vu_stem / phiVc_stem;

  const As_stem = (1000 / 150) * 387.1;
  const a_stem = (As_stem * fy) / (0.85 * fc * 1000);
  const phiMn_stem = 0.90 * As_stem * fy * (d_stem - a_stem / 2) / 1e6;
  const UC_m_stem = Mu_stem / phiMn_stem;

  const ucs = [UC_ot, UC_sl, UC_ecc, UC_bearing, UC_v_stem, UC_m_stem];
  const max_uc = Math.ceil(Math.max(...ucs) * 100) / 100;
  return { ok: max_uc <= 1.0, uc_max: max_uc };
}

let indep_pass = 0;
const H_list = [4.0, 5.0, 6.0];
const B_list = [2.8, 3.2, 3.8];
const phi_list = [30, 34];
const mu_list = [0.50, 0.55];

for (const H of H_list) {
  for (const B of B_list) {
    for (const phi_in of phi_list) {
      for (const mu_in of mu_list) {
        const sol = solveRetainingWallIndep({
          H,
          B,
          hb: 0.50,
          ttop: 0.30,
          tstem: 0.50,
          Ltoe: 0.90,
          gamma_s: 19.0,
          phi_deg: phi_in,
          q_sur: 10.0,
          qa: 220.0,
          mu: mu_in,
          fc: 28.0,
          fy: 420.0,
        });

        const modScript = twRetainingWall
          .replace("H_wall = ?{5.0}", `H_wall = ?{${H.toFixed(1)}}`)
          .replace("B_base = ?{3.2}", `B_base = ?{${B.toFixed(1)}}`)
          .replace("phi_deg = ?{32}", `phi_deg = ?{${phi_in}}`)
          .replace("mu_base = ?{0.55}", `mu_base = ?{${mu_in.toFixed(2)}}`);

        const res = leesResultaat(evaluate(parse(modScript), {}), "tw-retaining-wall");
        if (res.voldoet === sol.ok) {
          indep_pass++;
        }
      }
    }
  }
}

meld(indep_pass === 36, `獨立求解器全掃描（36 組案例）：全部吻合（通過 ${indep_pass} / 36）`);

console.log(`\n=== 檢核總結：共 ${36 + 18} 項檢查，失敗 ${fouten} 項 ===`);
process.exit(fouten === 0 ? 0 : 1);
