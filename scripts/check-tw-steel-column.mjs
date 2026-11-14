/**
 * 台灣規範 steel99 熱軋 H 型鋼柱與柱腳模組檢核（tw-steel-column）
 *
 * 依據內政部《鋼構造建築物鋼結構設計技術規範》（99年9月16日版，steel99）第（二）篇極限設計法（LRFD）
 * 檢核熱軋 H 型鋼柱的局部挫屈、受壓長細比、軸壓設計強度、梁柱構材互制，
 * 以及柱腳之混凝土承壓、基板厚度（AISC DG1 懸臂法）、錨栓鋼材拉力、45° 應力錐抗拔、水平剪力與拉剪互制。
 *
 * 核對方式（三層）：
 * 1. 「釘死值」：以已驗證庫 regs_formula（steel99_Fcr_lrfd、steel99_concrete_bearing_Pp、
 *    steel99_PnM_interaction、steel99_solid_weak_axis_Mn、steel99_bolt_strength_T1032）
 *    與 WorkBench steel_column.py 之手算對照比對。
 * 2. 分項手算：長細比、臨界壓應力、承壓面積放大、基板懸臂彎矩、彈性錨栓群法。
 * 3. 第二套獨立求解器：以純 SI 單位（N、mm、MPa）重寫全部公式，
 *    對 20 種斷面 × 2 種鋼材 × 多種載重工況掃描比對。
 * 4. 負向與安全防護：超載、厚度不足、長細比超限、無效輸入拒算。
 *
 * 執行：node scripts/check-tw-steel-column.mjs
 */

import { parse, evaluate, render } from "../packages/core/dist/index.js";
import { laadTemplate } from "./lib/refcheck.mjs";

const { leesResultaat, leesGetallen } = await import("../packages/desktop/src/components/calc/bladLezen.ts");
const { TW_PROFIELEN } = await import("../packages/desktop/src/components/calc/twProfielen.ts");

const tpl = laadTemplate("tw-steel-column.ts");

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
  return { uit: leesGetallen(nodes), tekst, html, r: leesResultaat(nodes, "tw-steel-column"), nodes };
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
      console.error(`  FOUT   ${k.padEnd(14)} 計算 ${String(actueel).padStart(12)}   預期 ${v} (rel ${relDiff.toExponential(2)})`);
    } else if (!stil) {
      console.log(`  OK     ${k.padEnd(14)} 計算 ${String(actueel).padStart(12)}   預期 ${v}`);
    }
  }
}

function geenFouten(r, label = "berekening") {
  const signaal = ["Error", "Undefined symbol", "NaN", "niet gedefinieerd", "Unexpected type", "Infinity"].find((s) => r.tekst.includes(s));
  waar(`${label}: 無錯誤訊息或 NaN`, !signaal, signaal ? r.tekst.slice(Math.max(0, r.tekst.indexOf(signaal) - 60), r.tekst.indexOf(signaal) + 60) : "");
}

const voldoet = (r) => r.r.voldoet === true && r.r.uc !== null && r.r.uc <= 1.0 && !r.r.nietGetoetst && r.tekst.includes("鋼柱與柱腳檢核合格") && !r.tekst.includes("鋼柱與柱腳檢核不合格");
const voldoetNiet = (r) => r.r.voldoet === false && r.r.uc !== null && r.r.uc > 1.0 && !r.r.nietGetoetst && r.tekst.includes("鋼柱與柱腳檢核不合格");
const nietGetoetst = (r) => r.r.voldoet === null && r.r.nietGetoetst === true && r.tekst.includes("未檢核");

// -----------------------------------------------------------------------------
// 第二套獨立求解器（純 SI：N、mm、MPa）
// -----------------------------------------------------------------------------
const TF = 98.0665; // MPa per (tf/cm²)
const ru = (u) => Math.ceil(u * 100) / 100;

function losOpOnafhankelijk({
  sec_id = 7, // RH 300x300x10x15
  Fy_MPa = 325,
  Fy_bp_MPa = 325,
  fc_kgf_cm2 = 280,
  anchor_grade = 1, // A307
  shear_mode = 1,   // 摩擦
  Pu_kN = 700,
  Mux_kNm = 120,
  Muy_kNm = 20,
  Vu_kN = 80,
  L_m = 4.0,
  Kx = 1.0,
  Ky = 1.0,
  Lb_m = 4.0,
  Cb = 1.0,
  Bp_mm = 500,
  Np_mm = 500,
  tp_mm = 32,
  Bped_mm = 700,
  Nped_mm = 700,
  db_mm = 30,
  bx_mm = 350,
  by_mm = 350,
  hef_mm = 450,
}) {
  const p = TW_PROFIELEN[sec_id - 1];
  const h = p.h;
  const b = p.b;
  const tw = p.tw;
  const tf = p.tf;
  const Ag_mm2 = p.A * 100;
  const Ix_mm4 = p.Ix * 1e4;
  const Iy_mm4 = p.Iy * 1e4;
  const Wx_mm3 = p.Wx * 1e3;
  const Wy_mm3 = p.Wy * 1e3;
  const Zx_mm3 = p.Zx * 1e3;
  const Zy_mm3 = p.Zy * 1e3;
  const rx_mm = p.ix * 10;
  const ry_mm = p.iy * 10;

  const Fy_t = Fy_MPa / TF;
  const E_t = 2040;
  const G_t = 810;
  const Es_MPa = E_t * TF;
  const Gs_MPa = G_t * TF;

  // 1. 長細比與軸壓
  const KLrx = (Kx * L_m * 1000) / rx_mm;
  const KLry = (Ky * L_m * 1000) / ry_mm;
  const KLr_max = Math.max(KLrx, KLry);
  const ok_klr = KLr_max <= 200;
  const lambda_c = (KLr_max / Math.PI) * Math.sqrt(Fy_t / E_t);
  const Fcr_t = lambda_c <= 1.5 ? Math.exp(-0.419 * lambda_c ** 2) * Fy_t : (0.877 / lambda_c ** 2) * Fy_t;
  const Pn_t = 0.85 * (Ag_mm2 / 100) * Fcr_t;
  const phiPn_kN = Pn_t * 9.80665;
  const UC_P = Pu_kN / phiPn_kN;

  // 2. 局部挫屈
  const hw = h - 2 * tf;
  const lambda_f = (b / 2) / tf;
  const lambda_pf = 16 / Math.sqrt(Fy_t);
  const lambda_rf = 25 / Math.sqrt(Fy_t);
  const lambda_w = hw / tw;
  const lambda_pw = 50 / Math.sqrt(Fy_t);
  const lambda_rw = 100 / Math.sqrt(Fy_t);
  const is_compact = lambda_f <= lambda_pf && lambda_w <= lambda_pw;
  const is_nonslender = lambda_f <= lambda_rf && lambda_w <= lambda_rw;

  // 3. 撓曲與梁柱互制（LTB 段以 cm、tf/cm² 為單位，與 steel99 7.2.2 之單位制一致）
  const J_cm4 = (2 * b * tf ** 3 + hw * tw ** 3) / 3 / 1e4;
  const Cw_cm6 = (tf * b ** 3 * (h - tf) ** 2) / 24 / 1e6;
  const Sx_cm3 = p.Wx;
  const Sy_cm3 = p.Wy;
  const Zx_cm3 = p.Zx;
  const Zy_cm3 = p.Zy;
  const Iy_cm4 = p.Iy;
  const ry_cm = p.iy;
  const A_cm2 = p.A;
  const Lb_cm = Lb_m * 100;

  const Mp_tfcm = Fy_t * Zx_cm3;
  const FL_t = Fy_t - 0.7;
  const Mr_tfcm = FL_t * Sx_cm3;
  const Lp_cm = (80 * ry_cm) / Math.sqrt(Fy_t);
  const X1 = (Math.PI / Sx_cm3) * Math.sqrt(E_t * G_t * J_cm4 * A_cm2 / 2);
  const X2 = 4 * (Cw_cm6 / Iy_cm4) * (Sx_cm3 / (G_t * J_cm4)) ** 2;
  const Lr_cm = (ry_cm * X1 / FL_t) * Math.sqrt(1 + Math.sqrt(1 + X2 * FL_t ** 2));
  const Mn2_tfcm = Math.min(Mp_tfcm, Cb * (Mp_tfcm - (Mp_tfcm - Mr_tfcm) * (Lb_cm - Lp_cm) / Math.max(Lr_cm - Lp_cm, 0.001)));
  const Mcr_tfcm = (Cb * Math.PI / Lb_cm) * Math.sqrt(E_t * Iy_cm4 * G_t * J_cm4 + (Math.PI * E_t / Lb_cm) ** 2 * Iy_cm4 * Cw_cm6);
  const Mn3_tfcm = Math.min(Mp_tfcm, Mcr_tfcm);
  const Mnx_tfcm = Lb_cm <= Lp_cm ? Mp_tfcm : (Lb_cm <= Lr_cm ? Mn2_tfcm : Mn3_tfcm);
  const phiMnx_kNm = 0.90 * Mnx_tfcm * 0.0980665;
  const phiMny_kNm = 0.90 * Math.min(Fy_t * Zy_cm3, 1.5 * Fy_t * Sy_cm3) * 0.0980665;

  const ratio_p = Pu_kN / phiPn_kN;
  const term_m = Mux_kNm / phiMnx_kNm + Muy_kNm / phiMny_kNm;
  const UC_col = ratio_p >= 0.2 ? ratio_p + (8 / 9) * term_m : ratio_p / 2 + term_m;

  // 4. 混凝土承壓
  const A1_mm2 = Bp_mm * Np_mm;
  const A2_mm2 = Math.min(Bped_mm * Nped_mm, 4 * A1_mm2);
  const ratio_A = Math.min(Math.sqrt(A2_mm2 / A1_mm2), 2.0);
  const Pp_kgf = 0.60 * 0.85 * fc_kgf_cm2 * (A1_mm2 / 100) * ratio_A;
  const phiPp_kN = Pp_kgf * 0.00980665;
  const UC_bearing = Pu_kN / phiPp_kN;

  // 5. 基板厚度（雙向彎矩線性疊加與雙向懸臂）
  const Spx_mm3 = (Bp_mm * Np_mm ** 2) / 6;
  const Spy_mm3 = (Np_mm * Bp_mm ** 2) / 6;
  const q_mean_MPa = (Pu_kN * 1000) / A1_mm2;
  const q_mom_x_MPa = (Math.abs(Mux_kNm) * 1e6) / Spx_mm3;
  const q_mom_y_MPa = (Math.abs(Muy_kNm) * 1e6) / Spy_mm3;
  const q_max_MPa = q_mean_MPa + q_mom_x_MPa + q_mom_y_MPa;

  const l_flange = Math.max(Np_mm - h, 0) / 2;
  const l_web = Math.max(Bp_mm - b, 0) / 2;
  const l_cant = Math.max(l_flange, l_web);
  const m_cant_y = ((q_mean_MPa + q_mom_x_MPa) * l_flange ** 2) / 2;
  const m_cant_x = ((q_mean_MPa + q_mom_y_MPa) * l_web ** 2) / 2;
  const m_pl = Math.max(m_cant_y, m_cant_x);
  const tp_req_mm = Math.sqrt((6 * m_pl) / (0.90 * Fy_bp_MPa));
  const UC_tp = tp_req_mm / tp_mm;

  // 6. 錨栓拉力
  const T_bolt_raw = (Mux_kNm * 1000) / (2 * by_mm) + (Muy_kNm * 1000) / (2 * bx_mm) - Pu_kN / 4;
  const T_bolt_kN = Math.max(T_bolt_raw, 0);
  const Ab_mm2 = (Math.PI * db_mm ** 2) / 4;
  const Fnt = anchor_grade === 1 ? 3.15 : (anchor_grade === 2 ? 7.50 : 0.75 * 4.0788);
  const phiRnt_kN = 0.75 * Fnt * (Ab_mm2 / 100) * 9.80665;
  const UC_anchor_t = T_bolt_kN / phiRnt_kN;

  // 7. 應力錐
  const T_group_kN = 2 * T_bolt_kN;
  const theta_c = Math.acos(Math.min(bx_mm / (2 * hef_mm), 1.0));
  const Acn_mm2 = bx_mm >= 2 * hef_mm
    ? 2 * Math.PI * hef_mm ** 2
    : (2 * Math.PI - 2 * theta_c + Math.sin(2 * theta_c)) * hef_mm ** 2;
  const Tc_kgf = 1.06 * Math.sqrt(fc_kgf_cm2) * (Acn_mm2 / 100);
  const phiTc_kN = 0.75 * Tc_kgf * 0.00980665;
  const UC_cone = T_group_kN / phiTc_kN;

  // 8. 剪力
  const phiVn_fric_kN = Pu_kN > 0 ? 0.75 * 0.9 * Pu_kN : 0;
  const Fnv = anchor_grade === 1 ? 1.68 : (anchor_grade === 2 ? 4.00 : 0.40 * 4.0788);
  const phiVn_bolt_kN = 4 * 0.75 * Fnv * (Ab_mm2 / 100) * 9.80665;
  const phiVn_kN = shear_mode === 1 ? phiVn_fric_kN : phiVn_bolt_kN;
  const UC_V = Vu_kN / phiVn_kN;

  // 9. 拉剪互制
  const V_bolt_kN = Vu_kN / 4;
  const phiRnv_kN = 0.75 * Fnv * (Ab_mm2 / 100) * 9.80665;
  const UC_inter = shear_mode === 2
    ? Math.sqrt((T_bolt_kN / phiRnt_kN) ** 2 + (V_bolt_kN / phiRnv_kN) ** 2)
    : 0;

  const UC_load = Math.max(UC_P, UC_col, UC_bearing, UC_tp, UC_anchor_t, UC_cone, UC_V, UC_inter);
  const UC_max_raw = (is_nonslender && ok_klr) ? UC_load : Math.max(UC_load, 1.05);
  const UC_max = ru(UC_max_raw);
  const ok = is_nonslender && ok_klr && UC_load <= 1.0;

  return {
    KLr_max, lambda_c, Fcr_t, phiPn_kN, UC_P,
    lambda_f, lambda_pf, lambda_w, lambda_pw, is_compact, is_nonslender,
    phiMnx_kNm, phiMny_kNm, UC_col,
    phiPp_kN, UC_bearing, q_max_MPa, tp_req_mm, UC_tp,
    T_bolt_kN, phiRnt_kN, UC_anchor_t,
    Acn_cm2: Acn_mm2 / 100, phiTc_kN, UC_cone,
    phiVn_kN, UC_V, UC_inter,
    UC_load, UC_max, ok,
  };
}

console.log("=== 台灣規範 steel99 熱軋 H 型鋼柱與柱腳模組檢核（tw-steel-column） ===\n");

// -----------------------------------------------------------------------------
// 0. 公式釘死值核對（已驗證庫公式數值核對）
// -----------------------------------------------------------------------------
console.log("0. 公式釘死值核對（已驗證庫數值對照）");
{
  // 0.1 steel99_Fcr_lrfd: Fy=3.31405 tf/cm², E=2040, KL/r=400/7.55=52.98013, Ag=118.45
  //     regs_formula → ϕcPn = 274.944 tf（λc = 0.679719、Fcr = 2.730798 tf/cm²）= 2696.28 kN
  const lc = (52.98013245 / Math.PI) * Math.sqrt((325 / TF) / 2040);
  const fcr = Math.exp(-0.419 * lc ** 2) * (325 / TF);
  const phiPn_tf = 0.85 * 118.45 * fcr;
  const phiPn_kN = phiPn_tf * 9.80665;
  waar("steel99_Fcr_lrfd 數值驗證", Math.abs(phiPn_kN - 2696.28) < 0.1, `phiPn = ${phiPn_kN.toFixed(1)} kN`);

  // 0.2 steel99_concrete_bearing_Pp: fc=280, A1=2500, A2=4900
  const ratio = Math.min(Math.sqrt(4900 / 2500), 2.0);
  const pp_kgf = 0.6 * 0.85 * 280 * 2500 * ratio;
  const pp_kN = pp_kgf * 0.00980665;
  waar("steel99_concrete_bearing_Pp 數值驗證", Math.abs(pp_kN - 4901.4) < 1.0, `phiPp = ${pp_kN.toFixed(1)} kN`);

  // 0.3 steel99_solid_weak_axis_Mn: Z=683, W=450, Fy=325/TF（1.5·W = 675 < Z → 1.5My 控制）
  const mn_y_tfcm = Math.min(683 * (325 / TF), 1.5 * 450 * (325 / TF));
  const phiMny_kNm = 0.90 * mn_y_tfcm * 0.0980665;
  waar("steel99_solid_weak_axis_Mn 弱軸彎矩數值驗證", Math.abs(phiMny_kNm - 197.4) < 0.5, `phiMny = ${phiMny_kNm.toFixed(1)} kN·m`);
}

// -----------------------------------------------------------------------------
// 1. 預設基準案例（RH 300x300x10x15，Pu=700 kN，tp=32 mm）
// -----------------------------------------------------------------------------
console.log("\n1. 預設基準案例（RH 300x300，Pu=700 kN，tp=32 mm）");
{
  const r = doorreken();
  geenFouten(r, "基準案例");

  const sol = losOpOnafhankelijk({});

  toets(r, {
    "h": 300,
    "b": 300,
    "t_w": 10,
    "t_f": 15,
    "A": 118.45,
    "I_x": 20200,
    "I_y": 6750,
    "W_x": 1350,
    "W_y": 450,
    "Z_x": 1480,
    "Z_y": 683,
    "i_x": 13.1,
    "i_y": 7.55,
    "KLr_max": sol.KLr_max,
    "phiP_n": sol.phiPn_kN,
    "UC_P": sol.UC_P,
    "phiM_nx": sol.phiMnx_kNm,
    "phiM_ny": sol.phiMny_kNm,
    "UC_col": sol.UC_col,
    "phiP_p": sol.phiPp_kN,
    "UC_bearing": sol.UC_bearing,
    "tp_req": sol.tp_req_mm,
    "UC_tp": sol.UC_tp,
    "T_bolt": sol.T_bolt_kN,
    "phiRn_t": sol.phiRnt_kN,
    "UC_anchor_t": sol.UC_anchor_t,
    "phiTc": sol.phiTc_kN,
    "UC_cone": sol.UC_cone,
    "phiV_n": sol.phiVn_kN,
    "UC_V": sol.UC_V,
    "UC_max": sol.UC_max,
  }, 1e-2);

  waar("基準案例判定為合格", voldoet(r), `UC=${r.r.uc}`);
  waar("leesResultaat 辨識 UC = 0.93", r.r.uc === 0.93);
}

// -----------------------------------------------------------------------------
// 2. 剪力傳遞方式切換：4 支錨栓承壓直接抗剪（shear_mode = 2）
// -----------------------------------------------------------------------------
console.log("\n2. 柱腳剪力傳遞途徑切換：錨栓直接抗剪與拉剪互制");
{
  const r = doorreken({ shear_mode: 2 });
  geenFouten(r, "錨栓直接抗剪案例");
  const sol = losOpOnafhankelijk({ shear_mode: 2 });

  toets(r, {
    "phiV_n": sol.phiVn_kN,
    "UC_V": sol.UC_V,
    "UC_inter": sol.UC_inter,
    "UC_max": sol.UC_max,
  }, 1e-2);

  waar("錨栓抗剪案例合格", voldoet(r), `UC=${r.r.uc}`);
  waar("內文包含拉剪互制說明", r.tekst.includes("拉剪"));
}

// -----------------------------------------------------------------------------
// 3. 錨栓材質切換為 F10T 高強度螺栓（anchor_grade = 2）
// -----------------------------------------------------------------------------
console.log("\n3. 錨栓材質切換為 F10T（anchor_grade = 2）");
{
  const r = doorreken({ anchor_grade: 2, shear_mode: 2 });
  geenFouten(r, "F10T 錨栓案例");
  const sol = losOpOnafhankelijk({ anchor_grade: 2, shear_mode: 2 });

  toets(r, {
    "phiRn_t": sol.phiRnt_kN,
    "UC_anchor_t": sol.UC_anchor_t,
    "phiV_n": sol.phiVn_kN,
    "UC_V": sol.UC_V,
    "UC_max": sol.UC_max,
  }, 1e-2);

  waar("F10T 案例合格且容量提高", voldoet(r));
}

// -----------------------------------------------------------------------------
// 4. 負向測試與安全防護（不合格絕不判為合格）
// -----------------------------------------------------------------------------
console.log("\n4. 負向測試與安全防護");
{
  // 4.1 軸壓過載（Pu = 3500 kN > phiPn = 2721 kN）
  const rP = doorreken({ P_u: "3500" });
  waar("軸壓超載：判定不合格", voldoetNiet(rP), `UC=${rP.r.uc}`);

  // 4.2 強軸彎矩過載（Mux = 450 kN·m）
  const rM = doorreken({ M_ux: "450" });
  waar("彎矩超載互制過大：判定不合格", voldoetNiet(rM), `UC=${rM.r.uc}`);

  // 4.3 基板過薄（tp = 20 mm < tp_req = 29.63 mm）
  const rTp = doorreken({ t_p: "20" });
  waar("基板厚度不足：判定不合格", voldoetNiet(rTp), `UC=${rTp.r.uc}`);

  // 4.4 柱長細比超限（L_col = 16 m → KL/r = 213 > 200）
  const rKlr = doorreken({ L_col: "16" });
  waar("長細比超過 200：強制判定不合格", voldoetNiet(rKlr), `UC=${rKlr.r.uc}`);

  // 4.5 水平剪力超載（Vu = 600 kN）
  const rV = doorreken({ V_u: "600" });
  waar("柱腳剪力超載：判定不合格", voldoetNiet(rV), `UC=${rV.r.uc}`);

  // 4.6 無效輸入：Fy 超出規範範圍（100 MPa）
  const rFy = doorreken({ f_y_in: "100" });
  waar("無效鋼材 Fy：判定為未檢核", nietGetoetst(rFy));

  // 4.7 無效幾何：基板小於柱斷面（Bp = 200 mm < b = 300 mm）
  const rPlate = doorreken({ B_p: "200" });
  waar("基板小於柱斷面：判定為未檢核", nietGetoetst(rPlate));

  // 4.8 無效幾何：墩座小於基板（Bped = 400 mm < Bp = 500 mm）
  const rPed = doorreken({ B_ped: "400" });
  waar("墩座小於基板：判定為未檢核", nietGetoetst(rPed));
}

// -----------------------------------------------------------------------------
// 5. 第二套獨立求解器掃描（20 種 CNS 1490 H 型鋼 × 2 種鋼材 × 多工況）
// -----------------------------------------------------------------------------
console.log("\n5. 第二套獨立求解器全面掃描（20 斷面 × 多種工況）");
{
  let scanFouten = 0;
  let scanGetest = 0;

  for (let sec = 1; sec <= 20; sec++) {
    for (const fy of [245, 325]) {
      for (const sm of [1, 2]) {
        scanGetest++;
        const sol = losOpOnafhankelijk({
          sec_id: sec,
          Fy_MPa: fy,
          Fy_bp_MPa: fy,
          shear_mode: sm,
          Pu_kN: 500,
          Mux_kNm: 60,
          Muy_kNm: 15,
          Vu_kN: 50,
          L_m: 3.5,
          tp_mm: 36,
          Bp_mm: 600,
          Np_mm: 600,
          Bped_mm: 800,
          Nped_mm: 800,
          bx_mm: 400,
          by_mm: 400,
          db_mm: 30,
        });

        const r = doorreken({
          section_id: sec,
          f_y_in: String(fy),
          f_y_bp_in: String(fy),
          shear_mode: sm,
          P_u: "500",
          M_ux: "60",
          M_uy: "15",
          V_u: "50",
          L_col: "3.5",
          t_p: "36",
          B_p: "600",
          N_p: "600",
          B_ped: "800",
          N_ped: "800",
          b_x: "400",
          b_y: "400",
          d_b: "30",
        });

        const diff = Math.abs(r.uit.UC_max - sol.UC_max);
        if (diff > 0.02 || Number.isNaN(r.uit.UC_max)) {
          scanFouten++;
          console.error(`  掃描差異: sec=${sec}, Fy=${fy}, sm=${sm} -> 計算 ${r.uit.UC_max} vs 獨立 ${sol.UC_max}`);
        }
      }
    }
  }

  getest += scanGetest;
  fouten += scanFouten;
  waar(`獨立求解器全掃描（${scanGetest} 組案例）：完全吻合`, scanFouten === 0, `失敗組數: ${scanFouten}`);
}


// ─────────────────────────────────────────────────────────────────────────────
// ASD（容許應力設計法，steel99 第（一）篇 6.3；design_method = 2，僅純軸壓）
// 釘死值（regs_formula steel99_Fa_asd，E = 2040、Fy = 3.31406 tf/cm²）：
//   KL/r = 53.2623 → Fa = 1.59627 tf/cm²（式 6.3-1，Cc = 110.230）；KL/r = 150 → Fa = 0.466875 tf/cm²（式 6.3-2）
//   預設 RH 300x300（ry = 7.55 cm、KL = 400 cm）：KL/r = 52.98013 → Fa = 1.59915 tf/cm²
// 獨立求解器：以 MPa 直接計算 Cc = π√(2E/Fy)（與模板 √(2π²E/Fy) 寫法不同）。
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nASD（容許應力設計法，純軸壓）");
function faRef(fyMPa, klr) {
  const E = 2040 * 98.0665;
  const Cc = Math.PI * Math.sqrt((2 * E) / fyMPa);
  const x = klr / Cc;
  return klr < Cc ? ((1 - (x * x) / 2) * fyMPa) / (5 / 3 + (3 / 8) * x - (x ** 3) / 8) : (12 * Math.PI ** 2 * E) / (23 * klr * klr);
}
waar("獨立 Fa(53.2623) 對已驗證值 1.59627 tf/cm²", Math.abs(faRef(325, 53.26231691) / 98.0665 - 1.59627) < 1e-5);
waar("獨立 Fa(150) 對已驗證值 0.466875 tf/cm²", Math.abs(faRef(325, 150) / 98.0665 - 0.466875) < 1e-6);
{
  const r = doorreken({ design_method: "2", M_ux: "0", M_uy: "0" });
  geenFouten(r, "ASD 純軸壓預設");
  toets(r, { F_a: 1.59915 * 98.0665, f_a: (700e3) / (118.45e2) }, 1e-5);
  waar("ASD 結尾行註明柱腳未檢核", r.r.voldoet === true && r.tekst.includes("柱腳未檢核"));
}
{
  let n = 0, bad = 0, pass = 0, fail = 0;
  for (const p of TW_PROFIELEN) {
    if (!p.naam.startsWith("RH")) continue;
    for (const fy of [235, 325])
      for (const L of [2, 4, 8])
        for (const P of [300, 1500]) {
          const klr = Math.max((L * 1000) / (p.ix * 10), (L * 1000) / (p.iy * 10));
          const Fy = fy / 98.0665;
          const ns = p.b / 2 / p.tf <= 25 / Math.sqrt(Fy) && (p.h - 2 * p.tf) / p.tw <= 100 / Math.sqrt(Fy);
          const uc = (P * 1e3) / (p.A * 100) / faRef(fy, klr);
          const want = ns && klr <= 200 && uc <= 1;
          const r = doorreken({ design_method: "2", section_id: String(p.id), f_y_in: String(fy), L_col: String(L), L_b: String(L), P_u: String(P), M_ux: "0", M_uy: "0" });
          n++;
          if (r.r.voldoet !== want || Math.abs(r.uit.UC_P - uc) > 1e-6 * Math.max(1, uc)) bad++;
          want ? pass++ : fail++;
        }
  }
  waar(`ASD 掃描 ${n} 組與獨立求解器一致（合格 ${pass}、不合格 ${fail}）`, bad === 0 && pass > 10 && fail > 10, `${bad} 組不符`);
}
{
  const r = doorreken({ design_method: "2", M_ux: "0", M_uy: "0", P_u: "3000" });
  waar("ASD 軸力過大 → 不合格", r.r.voldoet === false && r.r.uc > 1 && !r.tekst.includes("檢核合格"));
  const r2 = doorreken({ design_method: "2", M_ux: "0", M_uy: "0", L_col: "16", L_b: "16" });
  waar("ASD KL/r > 200 → 不合格", r2.r.voldoet === false && r2.r.uc > 1);
  for (const [名, w] of [["ASD 有彎矩（互制式未入庫）", { design_method: "2" }], ["設計法代碼無效", { design_method: "0" }]]) {
    const q = doorreken(w);
    waar(`${名} → 拒算`, nietGetoetst(q) && q.uit.UC_max === undefined);
  }
}

console.log(`\n=== 檢核總結：共 ${getest} 項檢查，失敗 ${fouten} 項 ===`);
if (fouten > 0) {
  process.exit(1);
}
