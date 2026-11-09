/**
 * 台灣規範 swc_tech / rc112 鋼筋混凝土排水溝與明渠水理設計檢核模組檢查腳本
 *
 * 驗證項目：
 *   0. 公式釘死值核對（合理化公式 swc17_rational_qp、曼寧公式 swc84_manning_v 的手算／獨立計算對照）
 *   1. 預設基準案例（0.60 m × 0.80 m 矩形 U 型溝，S = 1%，Q = 0.425 m³/s，合格 UC = 0.68，出水高控制）
 *   2. 參數變化案例（梯形斷面、直接輸入設計流量）
 *   3. 負向測試與安全防護（流速過大／過小、出水高不足、坡度過緩、斷面過小、容量不足、
 *      加成容量不足、側壁彎矩／剪力／最小配筋／間距不足）
 *   4. 第二套獨立純 SI 求解器（二分法求正常水深）全面掃描，與範本內的牛頓疊代交叉比對
 *
 * 手算基準（皆與範本獨立推導）：
 *   Q = C·I·A/360 = 0.85 × 90 × 2.0 / 360 = 0.425 m³/s
 *   滿流：A = 0.6 × 0.8 = 0.48 m²，P = 0.6 + 2 × 0.8 = 2.2 m，R = 0.218182 m
 *         Q_cap = (1/0.014) × 0.48 × R^(2/3) × 0.01^(1/2) = 1.24258 m³/s
 *   正常水深（曼寧反算，二分法）d_n = 0.337983 m，V = Q / (B·d_n) = 2.09577 m/s
 *   出水高 = max(0.25 × d_n, 0.20) = 0.20 m → H_req = 0.537983 m → UC_fb = 0.67248（控制）
 *   側壁：K0 = 1 − sin30° = 0.5；V_u = 1.6 × (0.5×0.5×19×0.8² + 0.5×10×0.8) = 11.264 kN/m
 *         M_u = 1.6 × (0.5×19×0.8³/6 + 0.5×0.5×10×0.8²) = 3.857 kN·m/m
 *         d = 150 − 50 − 12.7/2 = 93.65 mm，A_s = 126.7×1000/200 = 633.5 mm²/m
 *         φM_n = 20.864 kN·m/m，φV_c = 0.75 × 0.17 × √24 × 1000 × 93.65 / 1000 = 58.496 kN/m
 *
 * 注意：C = 0.85、n = 0.014、K0 = 1 − sin φ、sf_cap = 1.2、保護層 50 mm 為設計者輸入／工程慣例，
 *       非規範明文數值，已於範本與 docs/tw/規範來源.md §5.7 標示。
 */

import { parse, evaluate } from "../packages/core/dist/index.js";
import { twDrainageChannel } from "../packages/desktop/src/templates/tw-drainage-channel.ts";
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

/** 以修改後的範本字串求值，回傳 { uit, res } */
function draai(tpl) {
  const nodes = evaluate(parse(tpl), {});
  return { uit: leesGetallen(nodes), res: leesResultaat(nodes, "tw-drainage-channel") };
}

/** 取代必須真的命中，避免測試因字串不符而默默變成基準案例 */
function vervang(tpl, oud, nieuw) {
  if (!tpl.includes(oud)) throw new Error(`範本中找不到要取代的字串：${oud}`);
  return tpl.replace(oud, nieuw);
}

console.log("=== 台灣規範 swc_tech / rc112 排水溝與明渠水理設計檢核（tw-drainage-channel） ===\n");

// -----------------------------------------------------------------------------
// 0. 公式釘死值核對
// -----------------------------------------------------------------------------
console.log("0. 公式釘死值核對（合理化公式、曼寧公式、靜止土壓力係數）");

// swc17_rational_qp：Q = C·I·A/360（I：mm/h，A：ha，Q：m³/s）
checkNabij("swc17_Qp", (0.85 * 90 * 2.0) / 360, 0.425, 1e-9);

// swc84_manning_v：v = (1/n)·R^(2/3)·S^(1/2)
const R_full_ref = 0.48 / 2.2;
const v_full_ref = (1 / 0.014) * R_full_ref ** (2 / 3) * Math.sqrt(0.01);
checkNabij("swc84_R_full", R_full_ref, 0.2181818, 1e-6);
checkNabij("swc84_v_full", v_full_ref, 2.58872, 1e-5);
checkNabij("swc84_Q_cap", v_full_ref * 0.48, 1.24258, 1e-5);

// K0 = 1 − sin φ（Jaky，非規範明文）
checkNabij("K0(30°)", 1 - Math.sin((30 * Math.PI) / 180), 0.5, 1e-12);

// -----------------------------------------------------------------------------
// 1. 預設基準案例
// -----------------------------------------------------------------------------
console.log("\n1. 預設基準案例（0.60 m × 0.80 m 矩形溝，S = 1%）");
const { uit: u0, res: r0 } = draai(twDrainageChannel);

meld(!isNaN(u0.UC_max) && u0.UC_max > 0, "基準案例: 無 NaN");
checkNabij("Q_design", u0.Q_design, 0.425, 1e-9);
checkNabij("A_full", u0.A_full, 0.48, 1e-9);
checkNabij("P_full", u0.P_full, 2.2, 1e-9);
checkNabij("R_full", u0.R_full, 0.2181818, 1e-6);
checkNabij("Q_cap", u0.Q_cap, 1.24258, 1e-5);
checkNabij("V_full", u0.V_full, 2.58872, 1e-5);
checkNabij("d_n", u0.d_n, 0.337983, 1e-5);
checkNabij("A_design", u0.A_design, 0.6 * 0.337983, 1e-5);
checkNabij("V_design", u0.V_design, 2.09577, 1e-5);
checkNabij("D_hyd", u0.D_hyd, 0.337983, 1e-5);
checkNabij("Fr_num", u0.Fr_num, 1.1510, 1e-3);
checkNabij("fb_req", u0.fb_req, 0.20, 1e-9);
checkNabij("fb_actual", u0.fb_actual, 0.80 - 0.337983, 1e-5);
checkNabij("H_req", u0.H_req, 0.537983, 1e-5);
checkNabij("K0_soil", u0.K0_soil, 0.5, 1e-9);
checkNabij("V_u_wall", u0.V_u_wall, 11.264, 1e-6);
checkNabij("M_u_wall", u0.M_u_wall, 3.857067, 1e-5);
checkNabij("dw_wall", u0.dw_wall, 93.65, 1e-9);
checkNabij("As_wall", u0.As_wall, 633.5, 1e-9);
checkNabij("phi_Mn_wall", u0.phi_Mn_wall, 20.864, 1e-4);
checkNabij("phi_Vc_wall", u0.phi_Vc_wall, 58.496, 1e-4);
checkNabij("As_min_wall", u0.As_min_wall, 270, 1e-9);
checkNabij("s_max_wall", u0.s_max_wall, 450, 1e-9);
checkNabij("UC_cap", u0.UC_cap, 0.342029, 1e-4);
checkNabij("UC_cap_sf", u0.UC_cap_sf, 0.410435, 1e-4);
checkNabij("UC_fb", u0.UC_fb, 0.672478, 1e-4);
checkNabij("UC_vmin", u0.UC_vmin, 0.8 / 2.09577, 1e-4);
checkNabij("UC_vmax", u0.UC_vmax, 2.09577 / 4.57, 1e-4);
checkNabij("UC_b_min", u0.UC_b_min, 0.5, 1e-9);
checkNabij("UC_h_min", u0.UC_h_min, 0.375, 1e-9);
checkNabij("UC_s_min", u0.UC_s_min, 0.2, 1e-9);
checkNabij("UC_m_wall", u0.UC_m_wall, 0.184866, 1e-4);
checkNabij("UC_v_wall", u0.UC_v_wall, 0.192560, 1e-3);
checkNabij("UC_rho_wall", u0.UC_rho_wall, 270 / 633.5, 1e-9);
checkNabij("UC_s_wall", u0.UC_s_wall, 200 / 450, 1e-9);
checkNabij("UC_max", u0.UC_max, 0.68, 1e-9);
meld(r0.voldoet === true, "基準案例判定為合格");
meld(r0.uc === 0.68, `leesResultaat 辨識 UC = 0.68（實際 ${r0.uc}）`);

// -----------------------------------------------------------------------------
// 2. 參數變化案例
// -----------------------------------------------------------------------------
console.log("\n2. 參數變化案例");

// 2.1 梯形斷面（B = 0.8、1:1 邊坡、H = 1.0、S = 0.5%），直接輸入 Q = 1.0 m³/s
{
  let t = twDrainageChannel;
  t = vervang(t, "use_rational = 1'-", "use_rational = 0'-");
  t = vervang(t, "Q_direct = 0.45'm^3/s", "Q_direct = 1.0'm^3/s");
  t = vervang(t, "B_chan = 0.60'm", "B_chan = 0.80'm");
  t = vervang(t, "H_chan = 0.80'm", "H_chan = 1.00'm");
  t = vervang(t, "z_side = 0.0'-", "z_side = 1.0'-");
  t = vervang(t, "S_chan = 0.01'-", "S_chan = 0.005'-");
  const { uit: u, res: r } = draai(t);

  // 獨立二分法求解
  const B = 0.8, z = 1.0, S = 0.005, n = 0.014, Q = 1.0;
  const qOf = (d) => {
    const A = (B + z * d) * d;
    const P = B + 2 * d * Math.sqrt(1 + z * z);
    return (1 / n) * A * (A / P) ** (2 / 3) * Math.sqrt(S);
  };
  let lo = 0, hi = 1.0;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (qOf(mid) < Q) lo = mid; else hi = mid;
  }
  const dRef = (lo + hi) / 2;
  meld(!isNaN(u.UC_max), "梯形斷面案例: 無 NaN");
  checkNabij("Q_design", u.Q_design, 1.0, 1e-9);
  checkNabij("d_n(梯形)", u.d_n, dRef, 1e-5);
  checkNabij("T_design", u.T_design, B + 2 * z * dRef, 1e-5);
  checkNabij("V_design", u.V_design, Q / ((B + z * dRef) * dRef), 1e-5);
  // 曼寧公式回代：以範本求得的 d_n 代回應得到設計流量
  checkNabij("Manning回代 Q", qOf(u.d_n), 1.0, 1e-4);
  const ucFbRef = (dRef + Math.max(0.25 * dRef, 0.2)) / 1.0;
  meld(Math.abs(u.UC_fb - ucFbRef) < 1e-4, `梯形斷面出水高 UC_fb = ${u.UC_fb.toFixed(4)}（預期 ${ucFbRef.toFixed(4)}）`);
  meld(typeof r.voldoet === "boolean", `梯形斷面判定 voldoet = ${r.voldoet}，UC = ${r.uc}`);
}

// 2.2 改用合理化公式，加大集水面積使設計流量變大，水深應隨之增加（單調性）
{
  const dn = (a) => draai(vervang(twDrainageChannel, "A_catch = 2.0'ha", `A_catch = ${a}'ha`)).uit.d_n;
  const d1 = dn(1.0), d2 = dn(2.0), d3 = dn(3.0);
  meld(d1 < d2 && d2 < d3, `集水面積加大水深單調增加（${d1.toFixed(4)} < ${d2.toFixed(4)} < ${d3.toFixed(4)}）`);
}

// 2.3 糙率加大水深應增加、流速應減小
{
  const a = draai(vervang(twDrainageChannel, "n_manning = 0.014'-", "n_manning = 0.020'-")).uit;
  meld(a.d_n > u0.d_n && a.V_design < u0.V_design, `n = 0.020：水深 ${a.d_n.toFixed(4)} > ${u0.d_n.toFixed(4)}，流速 ${a.V_design.toFixed(4)} < ${u0.V_design.toFixed(4)}`);
}

// -----------------------------------------------------------------------------
// 3. 負向測試與安全防護
// -----------------------------------------------------------------------------
console.log("\n3. 負向測試與安全防護");

// 3.1 流速過大
{
  const { uit, res } = draai(vervang(twDrainageChannel, "V_max_req = 4.57'm/s", "V_max_req = 2.0'm/s"));
  meld(res.voldoet === false && uit.UC_vmax > 1, `流速超過上限：UC_vmax = ${uit.UC_vmax.toFixed(3)}，判定不合格`);
}

// 3.2 流速過小（流量小、坡度緩）
{
  let t = vervang(twDrainageChannel, "A_catch = 2.0'ha", "A_catch = 0.1'ha");
  t = vervang(t, "S_chan = 0.01'-", "S_chan = 0.003'-");
  const { uit, res } = draai(t);
  meld(res.voldoet === false && uit.UC_vmin > 1, `流速低於 0.8 m/s：V = ${uit.V_design.toFixed(3)}，UC_vmin = ${uit.UC_vmin.toFixed(3)}，判定不合格`);
}

// 3.3 渠深不足以提供出水高
{
  const { uit, res } = draai(vervang(twDrainageChannel, "H_chan = 0.80'm", "H_chan = 0.50'm"));
  meld(res.voldoet === false && uit.UC_fb > 1, `出水高不足：UC_fb = ${uit.UC_fb.toFixed(3)}，判定不合格`);
}

// 3.4 縱坡小於 0.2%
{
  const { uit, res } = draai(vervang(twDrainageChannel, "S_chan = 0.01'-", "S_chan = 0.001'-"));
  meld(res.voldoet === false && uit.UC_s_min > 1, `縱坡 0.1% < 0.2%：UC_s_min = ${uit.UC_s_min.toFixed(3)}，判定不合格`);
}

// 3.5 底寬小於 0.30 m
{
  const { uit, res } = draai(vervang(twDrainageChannel, "B_chan = 0.60'm", "B_chan = 0.25'm"));
  meld(res.voldoet === false && uit.UC_b_min > 1, `底寬 0.25 m < 0.30 m：UC_b_min = ${uit.UC_b_min.toFixed(3)}，判定不合格`);
}

// 3.6 渠深小於 0.30 m
{
  const { uit, res } = draai(vervang(twDrainageChannel, "H_chan = 0.80'm", "H_chan = 0.25'm"));
  meld(res.voldoet === false && uit.UC_h_min > 1, `渠深 0.25 m < 0.30 m：UC_h_min = ${uit.UC_h_min.toFixed(3)}，判定不合格`);
}

// 3.7 設計流量超過滿流容量
{
  const { uit, res } = draai(vervang(twDrainageChannel, "A_catch = 2.0'ha", "A_catch = 6.0'ha"));
  meld(res.voldoet === false && uit.UC_cap > 1, `Q > Q_cap：UC_cap = ${uit.UC_cap.toFixed(3)}，判定不合格`);
  checkNabij("d_n(滿溢)", uit.d_n, 0.8 * 1.05, 1e-9);
}

// 3.8 滿流容量足夠，但不足以提供加成裕度（只有 UC_cap_sf > 1）
{
  const { uit, res } = draai(vervang(twDrainageChannel, "A_catch = 2.0'ha", "A_catch = 5.5'ha"));
  meld(uit.UC_cap <= 1 && uit.UC_cap_sf > 1, `UC_cap = ${uit.UC_cap.toFixed(3)} ≤ 1 但 UC_cap_sf = ${uit.UC_cap_sf.toFixed(3)} > 1`);
  meld(res.voldoet === false, "加成容量不足：判定不合格");
}

// 3.9 側壁彎矩／剪力不足（地表超載過大）
{
  const { uit, res } = draai(vervang(twDrainageChannel, "q_surcharge = 10.0'kN/m^2", "q_surcharge = 200.0'kN/m^2"));
  meld(uit.UC_m_wall > 1, `側壁彎矩不足：UC_m_wall = ${uit.UC_m_wall.toFixed(3)}`);
  meld(uit.UC_v_wall > 1, `側壁剪力不足：UC_v_wall = ${uit.UC_v_wall.toFixed(3)}`);
  meld(res.voldoet === false, "側壁強度不足：判定不合格");
}

// 3.10 側壁最小鋼筋量不足（D10@300，A_s = 237.7 < 270 mm²/m）
{
  let t = vervang(twDrainageChannel, "Ab_wall = 126.7'mm^2", "Ab_wall = 71.3'mm^2");
  t = vervang(t, "s_wall = 200'mm", "s_wall = 300'mm");
  const { uit, res } = draai(t);
  meld(uit.UC_rho_wall > 1 && uit.UC_s_wall <= 1, `最小鋼筋量不足：UC_rho_wall = ${uit.UC_rho_wall.toFixed(3)}`);
  meld(res.voldoet === false, "最小鋼筋量不足：判定不合格");
}

// 3.11 鋼筋間距超過 min(3t, 450 mm)
{
  const { uit, res } = draai(vervang(twDrainageChannel, "s_wall = 200'mm", "s_wall = 500'mm"));
  meld(uit.UC_s_wall > 1, `鋼筋間距 500 mm > 450 mm：UC_s_wall = ${uit.UC_s_wall.toFixed(3)}`);
  meld(res.voldoet === false, "鋼筋間距過大：判定不合格");
}

// 3.12 側壁很薄時 3t 控制 s_max（t = 0.10 m → s_max = 300 mm）
{
  const { uit } = draai(vervang(twDrainageChannel, "t_wall = 0.15'm", "t_wall = 0.10'm"));
  checkNabij("s_max(t=0.10)", uit.s_max_wall, 300, 1e-9);
}

// 3.13 無效輸入：設計流量為零
{
  const { res } = draai(vervang(vervang(twDrainageChannel, "use_rational = 1'-", "use_rational = 0'-"), "Q_direct = 0.45'm^3/s", "Q_direct = 0.0'm^3/s"));
  meld(res.voldoet === false, "設計流量為 0：拒絕通過（判定不合格）");
}

// -----------------------------------------------------------------------------
// 4. 第二套獨立純 SI 求解器（二分法）全面掃描
// -----------------------------------------------------------------------------
console.log("\n4. 第二套獨立求解器全面掃描");

function solveIndep({ C, I, A, B, H, z, S, n, Vmin = 0.8, Vmax = 4.57, sf = 1.2, t = 0.15, fc = 24, fy = 420, gs = 19, phi = 30, q = 10, Ab = 126.7, s = 200, cc = 50, db = 12.7 }) {
  const Q = (C * I * A) / 360;
  const area = (d) => (B + z * d) * d;
  const per = (d) => B + 2 * d * Math.sqrt(1 + z * z);
  const qOf = (d) => (1 / n) * area(d) * (area(d) / per(d)) ** (2 / 3) * Math.sqrt(S);
  const Qcap = qOf(H);
  let d;
  if (Q > Qcap) {
    d = 1.05 * H;
  } else {
    let lo = 1e-6, hi = H;
    for (let i = 0; i < 200; i++) {
      const mid = (lo + hi) / 2;
      if (qOf(mid) < Q) lo = mid; else hi = mid;
    }
    d = (lo + hi) / 2;
  }
  const V = Q / area(d);
  const fb = Math.max(0.25 * d, 0.2);

  const K0 = 1 - Math.sin((phi * Math.PI) / 180);
  const Vu = 1.6 * (0.5 * K0 * gs * H * H + K0 * q * H);
  const Mu = 1.6 * ((1 / 6) * K0 * gs * H ** 3 + 0.5 * K0 * q * H * H);
  const dw = t * 1000 - cc - db / 2;
  const As = (Ab * 1000) / s;
  const a = (As * fy) / (0.85 * fc * 1000);
  const phiMn = (0.9 * As * fy * (dw - a / 2)) / 1e6;
  const phiVc = (0.75 * 0.17 * Math.sqrt(fc) * 1000 * dw) / 1000;
  const AsMin = 0.0018 * 1000 * t * 1000;
  const sMax = Math.min(3 * t * 1000, 450);

  const ucs = [
    Q / Qcap,
    (sf * Q) / Qcap,
    (d + fb) / H,
    Vmin / V,
    V / Vmax,
    0.3 / B,
    0.3 / H,
    0.002 / S,
    Mu / phiMn,
    Vu / phiVc,
    AsMin / As,
    s / sMax,
  ];
  return { uc: Math.max(...ucs), d, V, Qcap };
}

{
  let n_pass = 0, n_tot = 0, n_d = 0, n_dtot = 0;
  const Bs = [0.5, 0.6, 0.8];
  const Hs = [0.6, 0.8, 1.0];
  const Ss = [0.005, 0.01, 0.02];
  const As_ = [0.5, 1.5, 3.0];
  const zs = [0, 0.5];
  for (const B of Bs) for (const H of Hs) for (const S of Ss) for (const A of As_) for (const z of zs) {
    let t = twDrainageChannel;
    t = vervang(t, "B_chan = 0.60'm", `B_chan = ${B.toFixed(2)}'m`);
    t = vervang(t, "H_chan = 0.80'm", `H_chan = ${H.toFixed(2)}'m`);
    t = vervang(t, "S_chan = 0.01'-", `S_chan = ${S}'-`);
    t = vervang(t, "A_catch = 2.0'ha", `A_catch = ${A}'ha`);
    t = vervang(t, "z_side = 0.0'-", `z_side = ${z}'-`);
    const { uit, res } = draai(t);
    const ref = solveIndep({ C: 0.85, I: 90, A, B, H, z, S, n: 0.014 });
    n_tot++;
    // 範本 UC 以 ceil(uc×100)/100 進位，容許相差 0.01；接近 1.0 的臨界案例不比較判定
    const ucOk = Math.abs(uit.UC_max - Math.ceil(ref.uc * 100) / 100) <= 0.0101;
    const borderline = Math.abs(ref.uc - 1) < 0.015;
    const voldoetOk = borderline || res.voldoet === (ref.uc <= 1);
    if (ucOk && voldoetOk) {
      n_pass++;
    } else {
      meld(false, `掃描案例 B=${B} H=${H} S=${S} A=${A} z=${z}`, `範本 UC = ${uit.UC_max}，獨立 UC = ${ref.uc.toFixed(4)}，voldoet = ${res.voldoet}`);
    }
    // 容量不足時範本與獨立求解皆取 1.05H，故每組案例都可比較水深
    n_dtot++;
    if (Math.abs(uit.d_n - ref.d) <= 1e-4 * Math.max(ref.d, 1e-3) + 1e-6) n_d++;
    else meld(false, `水深不一致 B=${B} H=${H} S=${S} A=${A} z=${z}`, `範本 d_n = ${uit.d_n}，獨立 d = ${ref.d}`);
  }
  meld(n_pass === n_tot, `UC_max 與判定：全部吻合（通過 ${n_pass} / ${n_tot}）`);
  meld(n_d === n_dtot, `牛頓疊代正常水深與二分法一致（通過 ${n_d} / ${n_dtot}）`);
}

console.log(`\n=== 檢核總結：失敗 ${fouten} 項 ===`);
process.exit(fouten === 0 ? 0 : 1);
