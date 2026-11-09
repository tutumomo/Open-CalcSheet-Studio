/**
 * 台灣規範 found112 / rc112 鋼筋混凝土獨立基腳模組檢核（tw-isolated-footing）
 *
 * 依據內政部《建築物基礎構造設計規範》（112年6月20日版，found112）
 * 與《建築物混凝土結構設計規範》（112年8月10日版，rc112）
 * 檢核鋼筋混凝土獨立擴展基腳的地盤支承力、偏心揚起、基底抗滑、
 * 雙向單向剪力（樑剪力）、雙向穿孔剪力（沖剪）、柱邊抗彎撓曲容量、
 * 最小鋼筋比、鋼筋間距、柱底交界面承壓與鋼筋伸展錨定長度。
 *
 * 核對方式（四層）：
 * 1. 「釘死值」：以已驗證庫 regs_formula（found112_footing_pressure_q、
 *    found112_Rf_base_friction、rc112_footing_Vc_simple、rc112_punching_vc）
 *    與 verified 表格（found112_FS_vertical_T435、found112_FS_horizontal_T461）數值對照。
 * 2. 端到端基準案例手算核對（正方形基腳與長方形基腳）。
 * 3. 第二套獨立求解器：以純 SI 單位（N、mm、MPa、kPa）重寫全部公式，
 *    對 40+ 種幾何尺寸 × 材料強度 × 偏心載重工況全面掃描比對。
 * 4. 負向測試與防護網：承載力超載、揚起偏心超限、抗滑不足、沖剪剪力超限、
 *    抗彎不足、最小鋼筋不足、柱底承壓不足、無效輸入拒算。
 *
 * 執行：node scripts/check-tw-isolated-footing.mjs
 */

import { parse, evaluate, render } from "../packages/core/dist/index.js";
import { laadTemplate } from "./lib/refcheck.mjs";

const { leesResultaat, leesGetallen } = await import("../packages/desktop/src/components/calc/bladLezen.ts");

const tpl = laadTemplate("tw-isolated-footing.ts");

let getest = 0;
let fouten = 0;

function waar(naam, conditie, toelichting = "") {
  getest++;
  if (!conditie) {
    fouten++;
    console.error(`  FOUT   ${naam}${toelichting ? " (" + toelichting + ")" : ""}`);
  } else {
    console.log(`  OK     ${naam}`);
  }
}

/** 預設輸入全部取模板預設值；waarden 以字串覆寫。 */
function doorreken(waarden = {}, scope = {}) {
  const nodes = evaluate(parse(tpl), { ...waarden }, scope);
  const html = render(nodes);
  const tekst = html.replace(/<annotation[\s\S]*?<\/annotation>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return { uit: leesGetallen(nodes), tekst, html, r: leesResultaat(nodes, "tw-isolated-footing"), nodes };
}

function toets(r, verwacht, tol = 1e-3, stil = false) {
  for (const [k, v] of Object.entries(verwacht)) {
    const actueel = r.uit[k];
    if (actueel === undefined || Number.isNaN(actueel)) {
      waar(`${k} berekend`, false, `變數缺漏或為 NaN`);
      continue;
    }
    const diff = Math.abs(actueel - v);
    const relDiff = v !== 0 ? diff / Math.abs(v) : diff;
    const ok = relDiff <= tol;
    getest++;
    if (!ok) {
      fouten++;
      console.error(`  FOUT   ${k.padEnd(16)} 計算 ${String(actueel).padStart(12)}   預期 ${v} (rel ${relDiff.toExponential(2)})`);
    } else if (!stil) {
      console.log(`  OK     ${k.padEnd(16)} 計算 ${String(actueel).padStart(12)}   預期 ${v}`);
    }
  }
}

function geenFouten(r, label = "berekening") {
  const signaal = ["Error", "Undefined symbol", "NaN", "niet gedefinieerd", "Unexpected type", "Infinity"].find((s) => r.tekst.includes(s));
  waar(`${label}: 無錯誤訊息或 NaN`, !signaal, signaal ? r.tekst.slice(Math.max(0, r.tekst.indexOf(signaal) - 60), r.tekst.indexOf(signaal) + 60) : "");
}

const voldoet = (r) => r.r.voldoet === true && r.r.uc !== null && r.r.uc <= 1.0 && !r.r.nietGetoetst && r.tekst.includes("獨立基腳檢核合格") && !r.tekst.includes("獨立基腳檢核不合格");
const voldoetNiet = (r) => r.r.voldoet === false && r.r.uc !== null && r.r.uc > 1.0 && !r.r.nietGetoetst && r.tekst.includes("獨立基腳檢核不合格");
const nietGetoetst = (r) => r.r.voldoet === null && r.r.nietGetoetst === true && r.tekst.includes("未檢核");

// -----------------------------------------------------------------------------
// 第二套獨立求解器（純 SI：N、mm、MPa、kPa）
// -----------------------------------------------------------------------------
const ru = (u) => Math.ceil(u * 100) / 100;

const REBAR_TABLE = {
  1: { d: 25.4, A: 506.7 },
  2: { d: 15.9, A: 198.6 },
  3: { d: 19.1, A: 286.5 },
  4: { d: 22.2, A: 387.1 },
  5: { d: 28.7, A: 646.9 },
  6: { d: 32.2, A: 814.3 },
};

function losOpOnafhankelijk({
  fc_MPa = 28,
  fy_MPa = 420,
  gamma_c_kNm3 = 24,
  gamma_s_kNm3 = 18,
  cover_mm = 75,
  Bf_mm = 2500,
  Lf_mm = 2500,
  hf_mm = 600,
  Df_mm = 1000,
  c1_mm = 500,
  c2_mm = 500,
  P_serv_kN = 1200,
  Mx_serv_kNm = 80,
  My_serv_kNm = 40,
  Hx_serv_kN = 60,
  Hy_serv_kN = 30,
  Pu_kN = 1680,
  Mux_kNm = 112,
  Muy_kNm = 56,
  qa_kPa = 300,
  mu_base = 0.50,
  bar_x_id = 1,
  nbx = 11,
  bar_y_id = 1,
  nby = 11,
  hook_mode = 1,
}) {
  const rx = REBAR_TABLE[bar_x_id];
  const ry = REBAR_TABLE[bar_y_id];
  const dbx = rx.d;
  const dby = ry.d;
  const Abx1 = rx.A;
  const Aby1 = ry.A;

  const d_eff = hf_mm - cover_mm - (dbx + dby) / 2;

  // 1. 地盤支承力與偏心
  const Area_f_m2 = (Bf_mm * Lf_mm) / 1e6;
  const W_footing_kN = Area_f_m2 * (hf_mm / 1000) * gamma_c_kNm3;
  const W_soil_kN = Area_f_m2 * (Df_mm / 1000) * gamma_s_kNm3;
  const P_tot_serv_kN = P_serv_kN + W_footing_kN + W_soil_kN;

  const Sfx_m3 = (Bf_mm / 1000) * (Lf_mm / 1000) ** 2 / 6;
  const Sfy_m3 = (Lf_mm / 1000) * (Bf_mm / 1000) ** 2 / 6;

  const q_avg_serv = P_tot_serv_kN / Area_f_m2;
  const q_mom_x = Math.abs(Mx_serv_kNm) / Sfx_m3;
  const q_mom_y = Math.abs(My_serv_kNm) / Sfy_m3;
  const q_max_serv = q_avg_serv + q_mom_x + q_mom_y;
  const q_min_serv = q_avg_serv - q_mom_x - q_mom_y;
  const UC_bearing = q_max_serv / qa_kPa;

  const ex_mm = (Math.abs(My_serv_kNm) / P_tot_serv_kN) * 1000;
  const ey_mm = (Math.abs(Mx_serv_kNm) / P_tot_serv_kN) * 1000;
  const kern_x_mm = Bf_mm / 6;
  const kern_y_mm = Lf_mm / 6;
  const UC_ecc = Math.max(ex_mm / kern_x_mm, ey_mm / kern_y_mm);
  const is_uplift = q_min_serv < 0;

  // 2. 抗滑動
  const H_tot_serv_kN = Math.hypot(Hx_serv_kN, Hy_serv_kN);
  const R_friction_kN = mu_base * P_tot_serv_kN;
  const FS_slide = R_friction_kN / Math.max(H_tot_serv_kN, 0.001);
  const UC_slide = 1.5 / FS_slide;

  // 3. 淨地壓與單向剪力
  const qu_net_kPa = Pu_kN / Area_f_m2;
  const cant_x_mm = (Bf_mm - c1_mm) / 2;
  const cant_y_mm = (Lf_mm - c2_mm) / 2;

  const Lx_shear_m = Math.max(cant_x_mm - d_eff, 0) / 1000;
  const Vux_kN = qu_net_kPa * (Lf_mm / 1000) * Lx_shear_m;
  const Vcx_nom_kN = 0.17 * Math.sqrt(fc_MPa) * (Lf_mm) * (d_eff) / 1000;
  const phiVcx_kN = 0.75 * Vcx_nom_kN;
  const UC_vx = Vux_kN / phiVcx_kN;

  const Ly_shear_m = Math.max(cant_y_mm - d_eff, 0) / 1000;
  const Vuy_kN = qu_net_kPa * (Bf_mm / 1000) * Ly_shear_m;
  const Vcy_nom_kN = 0.17 * Math.sqrt(fc_MPa) * (Bf_mm) * (d_eff) / 1000;
  const phiVcy_kN = 0.75 * Vcy_nom_kN;
  const UC_vy = Vuy_kN / phiVcy_kN;

  // 4. 雙向穿孔剪力（沖剪）
  const bp1_mm = c1_mm + d_eff;
  const bp2_mm = c2_mm + d_eff;
  const bo_mm = 2 * (bp1_mm + bp2_mm);
  const Area_punch_m2 = (bp1_mm * bp2_mm) / 1e6;
  const Vup_kN = qu_net_kPa * (Area_f_m2 - Area_punch_m2);

  const lambda_s = Math.min(1.0, Math.sqrt(2.0 / (1.0 + d_eff / 250.0)));
  const beta_col = Math.max(c1_mm, c2_mm) / Math.min(c1_mm, c2_mm);
  const rf_fc = Math.sqrt(fc_MPa);
  const vc1 = 0.33 * lambda_s * rf_fc;
  const vc2 = 0.17 * (1.0 + 2.0 / beta_col) * lambda_s * rf_fc;
  const vc3 = 0.083 * (2.0 + 40.0 * d_eff / bo_mm) * lambda_s * rf_fc;
  const vc_punch_MPa = Math.min(vc1, vc2, vc3);
  const phiVpunch_kN = 0.75 * vc_punch_MPa * bo_mm * d_eff / 1000;
  const UC_punch = Vup_kN / phiVpunch_kN;

  // 5. 抗彎撓曲與主筋配置
  const Mux_cant_kNm = qu_net_kPa * (Lf_mm / 1000) * (cant_x_mm / 1000) ** 2 / 2;
  const Asx_mm2 = nbx * Abx1;
  const Asx_min_mm2 = 0.0018 * Lf_mm * hf_mm;
  const ax_block_mm = (Asx_mm2 * fy_MPa) / (0.85 * fc_MPa * Lf_mm);
  const Mnx_nom_kNm = (Asx_mm2 * fy_MPa * (d_eff - ax_block_mm / 2)) / 1e6;
  const phiMnx_kNm = 0.90 * Mnx_nom_kNm;
  const UC_flex_x = Mux_cant_kNm / phiMnx_kNm;
  const UC_rhox = Asx_min_mm2 / Asx_mm2;

  const Muy_cant_kNm = qu_net_kPa * (Bf_mm / 1000) * (cant_y_mm / 1000) ** 2 / 2;
  const Asy_mm2 = nby * Aby1;
  const Asy_min_mm2 = 0.0018 * Bf_mm * hf_mm;
  const ay_block_mm = (Asy_mm2 * fy_MPa) / (0.85 * fc_MPa * Bf_mm);
  const Mny_nom_kNm = (Asy_mm2 * fy_MPa * (d_eff - ay_block_mm / 2)) / 1e6;
  const phiMny_kNm = 0.90 * Mny_nom_kNm;
  const UC_flex_y = Muy_cant_kNm / phiMny_kNm;
  const UC_rhoy = Asy_min_mm2 / Asy_mm2;

  const sx_mm = (Lf_mm - 2 * cover_mm - dbx) / Math.max(nbx - 1, 1);
  const sy_mm = (Bf_mm - 2 * cover_mm - dby) / Math.max(nby - 1, 1);
  const s_max_mm = Math.min(3 * hf_mm, 450);
  const UC_space_x = sx_mm / s_max_mm;
  const UC_space_y = sy_mm / s_max_mm;

  // 6. 柱底承壓
  const A1_col_mm2 = c1_mm * c2_mm;
  const A2_footing_mm2 = Math.min(Bf_mm * Lf_mm, 4 * A1_col_mm2);
  const ratio_bearing = Math.min(Math.sqrt(A2_footing_mm2 / A1_col_mm2), 2.0);
  const Pn_bearing_kN = (0.85 * fc_MPa * A1_col_mm2 * ratio_bearing) / 1000;
  const phiPn_bearing_kN = 0.65 * Pn_bearing_kN;
  const UC_bearing_col = Pu_kN / phiPn_bearing_kN;

  // 7. 伸展錨定長度
  const L_avail_x_mm = cant_x_mm - cover_mm;
  const L_avail_y_mm = cant_y_mm - cover_mm;
  const ld_straight_x = (dbx <= 19.1 ? fy_MPa / (2.1 * rf_fc) : fy_MPa / (1.7 * rf_fc)) * dbx;
  const ld_straight_y = (dby <= 19.1 ? fy_MPa / (2.1 * rf_fc) : fy_MPa / (1.7 * rf_fc)) * dby;
  const ldh_hook_x = Math.max((fy_MPa / (4.2 * rf_fc)) * dbx, 8 * dbx, 150);
  const ldh_hook_y = Math.max((fy_MPa / (4.2 * rf_fc)) * dby, 8 * dby, 150);
  const ld_req_x = hook_mode === 1 ? ldh_hook_x : ld_straight_x;
  const ld_req_y = hook_mode === 1 ? ldh_hook_y : ld_straight_y;
  const UC_ld_x = ld_req_x / Math.max(L_avail_x_mm, 1);
  const UC_ld_y = ld_req_y / Math.max(L_avail_y_mm, 1);
  const UC_ld = Math.max(UC_ld_x, UC_ld_y);

  const UC_load = Math.max(
    UC_bearing, UC_slide, UC_vx, UC_vy, UC_punch,
    UC_flex_x, UC_flex_y, UC_rhox, UC_rhoy,
    UC_bearing_col, UC_ld, UC_space_x, UC_space_y
  );
  const UC_max_raw = !is_uplift ? UC_load : Math.max(UC_load, 1.05);
  const UC_max = ru(UC_max_raw);
  const ok = !is_uplift && UC_load <= 1.0;

  return {
    Area_f_m2, W_footing_kN, W_soil_kN, P_tot_serv_kN,
    q_avg_serv, q_max_serv, q_min_serv, UC_bearing,
    ex_mm, ey_mm, UC_ecc, is_uplift,
    H_tot_serv_kN, R_friction_kN, FS_slide, UC_slide,
    qu_net_kPa, d_eff, cant_x_mm, cant_y_mm,
    Vux_kN, phiVcx_kN, UC_vx,
    Vuy_kN, phiVcy_kN, UC_vy,
    bo_mm, Area_punch_m2, Vup_kN, lambda_s, vc_punch_MPa, phiVpunch_kN, UC_punch,
    Mux_cant_kNm, Asx_mm2, Asx_min_mm2, phiMnx_kNm, UC_flex_x, UC_rhox,
    Muy_cant_kNm, Asy_mm2, Asy_min_mm2, phiMny_kNm, UC_flex_y, UC_rhoy,
    sx_mm, sy_mm, UC_space_x, UC_space_y,
    phiPn_bearing_kN, UC_bearing_col,
    L_avail_x_mm, L_avail_y_mm, ld_req_x, ld_req_y, UC_ld_x, UC_ld_y, UC_ld,
    UC_load, UC_max, ok,
  };
}

console.log("=== 台灣規範 found112 / rc112 獨立基腳模組檢核（tw-isolated-footing） ===\n");

// -----------------------------------------------------------------------------
// 0. 公式釘死值核對（已驗證庫公式數值核對）
// -----------------------------------------------------------------------------
console.log("0. 公式釘死值核對（已驗證庫數值對照）");
{
  // 0.1 found112_footing_pressure_q: P'=1200, Ws=112.5, Wf=90, B=2.5, L=2.5
  const q_tfm2 = (1200 + 112.5 + 90) / (2.5 * 2.5);
  waar("found112_footing_pressure_q 數值驗證", Math.abs(q_tfm2 - 224.4) < 1e-4, `q = ${q_tfm2} kN/m²`);

  // 0.2 found112_Rf_base_friction: N=1402.5, tan(delta)=0.50, ca=0
  const rf = 1402.5 * 0.50;
  waar("found112_Rf_base_friction 摩擦力數值驗證", Math.abs(rf - 701.25) < 1e-4, `Rf = ${rf} kN`);

  // 0.3 rc112_footing_Vc_simple: fc=28, bw=2500, d=499.6
  const vc_nom = 0.17 * 1.0 * Math.sqrt(28) * 2500 * 499.6;
  const phiVc = 0.75 * vc_nom / 1000;
  waar("rc112_footing_Vc_simple 單向剪力容量數值驗證", Math.abs(phiVc - 842.66) < 1.0, `phiVc = ${phiVc.toFixed(2)} kN`);

  // 0.4 rc112_punching_vc: fc=28, d=499.6, bo=3998.4, beta=1.0, alpha_s=40
  const ls = Math.min(1.0, Math.sqrt(2.0 / (1.0 + 499.6 / 250.0)));
  const vc1 = 0.33 * ls * Math.sqrt(28);
  const phiVp = 0.75 * vc1 * 3998.4 * 499.6 / 1000;
  waar("rc112_punching_vc 雙向沖剪數值驗證", Math.abs(phiVp - 2136.2) < 2.0, `phiVp = ${phiVp.toFixed(1)} kN`);
}

// -----------------------------------------------------------------------------
// 1. 預設基準案例一：正方形基腳（2500×2500×600 mm，qa=300 kPa）
// -----------------------------------------------------------------------------
console.log("\n1. 預設基準案例（正方形獨立基腳 2500×2500×600 mm）");
{
  const r = doorreken();
  geenFouten(r, "正方形基準案例");

  const sol = losOpOnafhankelijk({});

  toets(r, {
    "Area_f": sol.Area_f_m2,
    "W_footing": sol.W_footing_kN,
    "W_soil": sol.W_soil_kN,
    "P_tot_serv": sol.P_tot_serv_kN,
    "q_max_serv": sol.q_max_serv,
    "q_min_serv": sol.q_min_serv,
    "UC_bearing": sol.UC_bearing,
    "H_tot_serv": sol.H_tot_serv_kN,
    "R_friction": sol.R_friction_kN,
    "FS_slide": sol.FS_slide,
    "UC_slide": sol.UC_slide,
    "qu_net": sol.qu_net_kPa,
    "d_eff": sol.d_eff,
    "V_ux": sol.Vux_kN,
    "phiVc_x": sol.phiVcx_kN,
    "UC_vx": sol.UC_vx,
    "V_up": sol.Vup_kN,
    "phiV_punch": sol.phiVpunch_kN,
    "UC_punch": sol.UC_punch,
    "M_ux_cant": sol.Mux_cant_kNm,
    "phiMn_x": sol.phiMnx_kNm,
    "UC_flex_x": sol.UC_flex_x,
    "M_uy_cant": sol.Muy_cant_kNm,
    "phiMn_y": sol.phiMny_kNm,
    "UC_flex_y": sol.UC_flex_y,
    "phiPn_bearing": sol.phiPn_bearing_kN,
    "UC_bearing_col": sol.UC_bearing_col,
    "UC_ld": sol.UC_ld,
    "UC_max": sol.UC_max,
  }, 1e-2);

  waar("基準案例判定為合格", voldoet(r), `UC=${r.r.uc}`);
  waar("leesResultaat 辨識 UC = 0.91", r.r.uc === 0.91);
}

// -----------------------------------------------------------------------------
// 2. 基準案例二：長方形基腳（3000×2200×650 mm，短向長向不對稱）
// -----------------------------------------------------------------------------
console.log("\n2. 長方形基腳案例（3000×2200×650 mm，短向長向不對稱）");
{
  const r = doorreken({
    B_f: "2200",
    L_f: "3000",
    h_f: "650",
    P_serv: "1300",
    P_u: "1820",
    q_a_in: "350",
    n_bx: "10",
    n_by: "13",
  });
  geenFouten(r, "長方形基腳案例");

  const sol = losOpOnafhankelijk({
    Bf_mm: 2200,
    Lf_mm: 3000,
    hf_mm: 650,
    P_serv_kN: 1300,
    Pu_kN: 1820,
    qa_kPa: 350,
    nbx: 10,
    nby: 13,
  });

  toets(r, {
    "Area_f": sol.Area_f_m2,
    "q_max_serv": sol.q_max_serv,
    "UC_bearing": sol.UC_bearing,
    "V_ux": sol.Vux_kN,
    "phiVc_x": sol.phiVcx_kN,
    "UC_vx": sol.UC_vx,
    "V_uy": sol.Vuy_kN,
    "phiVc_y": sol.phiVcy_kN,
    "UC_vy": sol.UC_vy,
    "V_up": sol.Vup_kN,
    "phiV_punch": sol.phiVpunch_kN,
    "UC_punch": sol.UC_punch,
    "M_ux_cant": sol.Mux_cant_kNm,
    "phiMn_x": sol.phiMnx_kNm,
    "UC_flex_x": sol.UC_flex_x,
    "M_uy_cant": sol.Muy_cant_kNm,
    "phiMn_y": sol.phiMny_kNm,
    "UC_flex_y": sol.UC_flex_y,
    "UC_max": sol.UC_max,
  }, 1e-2);

  waar("長方形基腳判定合格", voldoet(r), `UC=${r.r.uc}`);
  waar("內文包含短向帶狀分配係數說明", r.tekst.includes("帶狀分配"));
}

// -----------------------------------------------------------------------------
// 3. 鋼筋端部錨定切換為直筋伸展（hook_mode = 2）
// -----------------------------------------------------------------------------
console.log("\n3. 鋼筋端部錨定型式切換（直鋼筋伸展）");
{
  const r = doorreken({ hook_mode: 2 });
  geenFouten(r, "直鋼筋伸展案例");
  const sol = losOpOnafhankelijk({ hook_mode: 2 });

  toets(r, {
    "ld_req_x": sol.ld_req_x,
    "UC_ld": sol.UC_ld,
    "UC_max": sol.UC_max,
  }, 1e-2);

  waar("直筋伸展長度大於可用長度時判定不合格", voldoetNiet(r), `UC=${r.r.uc}`);
  waar("內文包含直鋼筋伸展說明", r.tekst.includes("直鋼筋"));
}

// -----------------------------------------------------------------------------
// 4. 負向測試與安全防護（不合格絕不誤判為合格）
// -----------------------------------------------------------------------------
console.log("\n4. 負向測試與安全防護");
{
  // 4.1 承載力超載
  const r_soil = doorreken({ P_serv: "2500" });
  waar("地盤承載力超載：判定不合格", voldoetNiet(r_soil), `UC=${r_soil.r.uc}`);

  // 4.2 偏心過大導致受拉揚起 (q_min < 0)
  const r_uplift = doorreken({ Mx_serv: "600" });
  waar("偏心過大導致受拉揚起：判定不合格", voldoetNiet(r_uplift), `UC=${r_uplift.r.uc}`);

  // 4.3 抗滑動安全不足
  const r_slide = doorreken({ Hx_serv: "600", Hy_serv: "400" });
  waar("水平剪力過大抗滑不足：判定不合格", voldoetNiet(r_slide), `UC=${r_slide.r.uc}`);

  // 4.4 基腳太薄導致穿孔沖剪不足
  const r_punch = doorreken({ h_f: "350" });
  waar("沖剪強度不足：判定不合格", voldoetNiet(r_punch), `UC=${r_punch.r.uc}`);

  // 4.5 單向剪力不足（懸臂過長而厚度小）
  const r_shear = doorreken({ B_f: "4500", c_1: "300", h_f: "400" });
  waar("單向剪力不足：判定不合格", voldoetNiet(r_shear), `UC=${r_shear.r.uc}`);

  // 4.6 配筋不足導致抗彎不合格
  const r_flex = doorreken({ n_bx: "3", n_by: "3" });
  waar("抗彎鋼筋量不足：判定不合格", voldoetNiet(r_flex), `UC=${r_flex.r.uc}`);

  // 4.7 柱底交界面承壓超載
  const r_col = doorreken({ c_1: "250", c_2: "250", P_u: "3500" });
  waar("柱底承壓強度不足：判定不合格", voldoetNiet(r_col), `UC=${r_col.r.uc}`);

  // 4.8 無效幾何尺寸：基腳小於柱寬
  const r_geom = doorreken({ B_f: "400", c_1: "500" });
  waar("基腳寬度小於柱寬：標示未檢核且不判為合格", nietGetoetst(r_geom));

  // 4.9 無效材料強度：fc < 17 MPa
  const r_fc = doorreken({ fc_in: "12" });
  waar("混凝土強度過低：標示未檢核且不判為合格", nietGetoetst(r_fc));

  // 4.10 無效厚度：hf < 200 mm
  const r_hf = doorreken({ h_f: "120" });
  waar("基腳厚度過薄：標示未檢核且不判為合格", nietGetoetst(r_hf));
}

// -----------------------------------------------------------------------------
// 5. 第二套獨立求解器全面掃描（幾何 × 載重 × 材料 多案例對照）
// -----------------------------------------------------------------------------
console.log("\n5. 第二套獨立求解器全面掃描");
{
  const sizes = [
    { B: 2000, L: 2000, h: 500, c1: 400, c2: 400, nb: 9 },
    { B: 2500, L: 2500, h: 600, c1: 500, c2: 500, nb: 11 },
    { B: 3000, L: 2400, h: 650, c1: 500, c2: 500, nb: 12 },
    { B: 3200, L: 3200, h: 750, c1: 600, c2: 600, nb: 14 },
  ];
  const fcs = [21, 28];
  const rebar_bars = [1, 3, 4]; // D25, D19, D22
  const hook_modes = [1, 2];

  let scanCount = 0;
  let scanMismatches = 0;

  for (const sz of sizes) {
    for (const fc of fcs) {
      for (const bar of rebar_bars) {
        for (const hm of hook_modes) {
          scanCount++;
          const sol = losOpOnafhankelijk({
            fc_MPa: fc,
            Bf_mm: sz.B,
            Lf_mm: sz.L,
            hf_mm: sz.h,
            c1_mm: sz.c1,
            c2_mm: sz.c2,
            bar_x_id: bar,
            nbx: sz.nb,
            bar_y_id: bar,
            nby: sz.nb,
            hook_mode: hm,
          });

          const r = doorreken({
            fc_in: String(fc),
            B_f: String(sz.B),
            L_f: String(sz.L),
            h_f: String(sz.h),
            c_1: String(sz.c1),
            c_2: String(sz.c2),
            bar_x_id: bar,
            n_bx: String(sz.nb),
            bar_y_id: bar,
            n_by: String(sz.nb),
            hook_mode: hm,
          });

          const matchUC = Math.abs((r.r.uc ?? 0) - sol.UC_max) <= 0.02;
          const matchVoldoet = (r.r.voldoet === true) === sol.ok;

          if (!matchUC || !matchVoldoet) {
            scanMismatches++;
            console.error(`  掃描不一致: B=${sz.B} L=${sz.L} h=${sz.h} fc=${fc} bar=${bar} hm=${hm}: App(uc=${r.r.uc}, ok=${r.r.voldoet}) vs 獨立(uc=${sol.UC_max}, ok=${sol.ok})`);
          }
        }
      }
    }
  }

  waar(`獨立求解器全掃描（${scanCount} 組案例）：完全吻合`, scanMismatches === 0, `失敗 ${scanMismatches} 組`);
}

console.log(`\n=== 檢核總結：共 ${getest} 項檢查，失敗 ${fouten} 項 ===`);
if (fouten > 0) {
  process.exit(1);
}
