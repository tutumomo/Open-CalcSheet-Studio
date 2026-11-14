/**
 * 台灣規範 swc_tech 滯洪池設計與檢核模組檢查腳本（tw-detention-basin）
 *
 * 驗證項目：
 *   0. 公式釘死值核對（已驗證庫：swc96_Vs1_temp_detention、swc96_Vs2_perm_detention、
 *      swc96_Vsd_permanent、swc96_Vsd_temporary、swc95_outflow_cap、swc17_rational_qp、
 *      rainwater109_detention_orifice_weir、rainwater109_detention_orifice_submerged、
 *      rainwater109_detention_overflow）
 *   1. 預設基準案例（5 ha、永久性滯洪、30×25 m 池底、1:2 邊坡、設計水位 2.4 m，合格 UC = 0.82）
 *   2. 臨時性滯洪設施案例（Vsd = 1.3·Vs1）與基期不足 1 小時（以 1 小時計）
 *   3. 逐時段調洪演算（Modified Puls）之結果與獨立求解器比對
 *   4. 負向測試與安全防護（含調洪演算蓄洪量不足、出流超限、越堤）
 *   5. 第二套獨立純 SI 計算掃描（數值積分求池體容積、獨立 Modified Puls 求解器）
 *
 * 手算基準（皆與範本獨立推導）：
 *   Q1 = 0.60 × 100 × 5 / 360 = 0.833333 m³/s；Q2 = 0.95 × 120 × 5 / 360 = 1.583333 m³/s；
 *   Q3 = 0.90 × 120 × 5 / 360 = 1.5 m³/s
 *   Vs2 = 1.5 × (1.5 − 0.833333) / 2 × 3600 = 1800 m³；Vsd = 1.1 × 1800 = 1980 m³
 *   Vs1 = 1.5 × (1.583333 − 0.833333) / 2 × 3600 = 2025 m³；臨時 Vsd = 1.3 × 2025 = 2632.5 m³
 *   Q_out,cap = min(0.8 × 1.5, 0.833333, 1.5) = 0.833333 m³/s
 *   V(y) = 750y + 110y² + (16/3)y³：V(2.4) = 2507.328 m³、V(0.10) = 76.1053 m³，V_eff = 2431.2227 m³
 *   排放孔口 B = 0.40 m、L = 0.40 m：h = 2.4 − 0.10 = 2.30 m ≥ 1.8L = 0.72 m → 潛流
 *   Q_orf = 0.6 × 0.4 × 0.4 × √(2 × 9.81 × (2.30 − 0.20)) = 0.616212 m³/s
 *   溢洪口 Q = 1.767 × 8 × 0.3^1.5 = 2.322782 m³/s；出水高 = 3.4 − 2.4 − 0.3 = 0.7 m
 *   調洪演算：ΔQ = Q3 − Q1 = 0.666667 m³/s，歷線基期 tb_eff = 1.5 h（漲水 0.75 h、退水 0.75 h），
 *   演算入流體積 = 0.5 × 0.666667 × 1.5 × 3600 = 1800 m³（與 Vs2 相符），Δt = 0.075 h = 270 s
 *
 * 注意：堤頂最小出水高 0.50 m 為工程慣用值，非規範明文，已於範本標示。
 */

import { parse, evaluate } from "../packages/core/dist/index.js";
import { twDetentionBasin } from "../packages/desktop/src/templates/tw-detention-basin.ts";
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

function draai(tpl) {
  const nodes = evaluate(parse(tpl), {});
  return { uit: leesGetallen(nodes), res: leesResultaat(nodes, "tw-detention-basin") };
}

/** 取代必須真的命中，避免測試因字串不符而默默變成基準案例 */
function vervang(tpl, oud, nieuw) {
  if (!tpl.includes(oud)) throw new Error(`範本中找不到要取代的字串：${oud}`);
  return tpl.replace(oud, nieuw);
}

console.log("=== 台灣規範 swc_tech 滯洪池設計與檢核（tw-detention-basin） ===\n");

// -----------------------------------------------------------------------------
// 0. 公式釘死值核對
// -----------------------------------------------------------------------------
console.log("0. 公式釘死值核對（swc_tech §17、§95、§96 與雨水下水道設計指南 I-8.3.2 已驗證公式）");

const q1_ref = (0.60 * 100 * 5) / 360; // swc17_rational_qp
const q2_ref = (0.95 * 120 * 5) / 360;
const q3_ref = (0.90 * 120 * 5) / 360;
checkNabij("swc17_Q1", q1_ref, 0.8333333, 1e-6);
checkNabij("swc17_Q2", q2_ref, 1.5833333, 1e-6);
checkNabij("swc17_Q3", q3_ref, 1.5, 1e-9);

const vs2_ref = (1.5 * (q3_ref - q1_ref)) / 2 * 3600; // swc96_Vs2_perm_detention
const vs1_ref = (1.5 * (q2_ref - q1_ref)) / 2 * 3600; // swc96_Vs1_temp_detention
checkNabij("swc96_Vs2", vs2_ref, 1800, 1e-9);
checkNabij("swc96_Vs1", vs1_ref, 2025, 1e-9);
checkNabij("swc96_Vsd_perm", 1.1 * vs2_ref, 1980, 1e-9);
checkNabij("swc96_Vsd_temp", 1.3 * vs1_ref, 2632.5, 1e-9);
checkNabij("swc95_Qout_cap", Math.min(0.8 * q3_ref, q1_ref, 1.5), 0.8333333, 1e-6);

// 排放孔口出流（rainwater109_detention_orifice_weir / _orifice_submerged / _overflow）
const weirRef = (B, h) => 1.767 * B * Math.pow(h, 1.5);
const orifRef = (B, L, h) => 0.6 * B * L * Math.sqrt(2 * 9.81 * (h - L / 2));
checkNabij("rw109_堰流", weirRef(0.4, 2.3), 1.767 * 0.4 * Math.pow(2.3, 1.5), 1e-9);
checkNabij("rw109_潛流", orifRef(0.4, 0.4, 2.3), 0.6 * 0.4 * 0.4 * Math.sqrt(2 * 9.81 * 2.1), 1e-9);
checkNabij("rw109_溢流", 1.767 * 8 * Math.pow(0.3, 1.5), 2.3227818, 1e-6);

// -----------------------------------------------------------------------------
// 1. 預設基準案例
// -----------------------------------------------------------------------------
console.log("\n1. 預設基準案例（永久性滯洪，5 ha，30×25 m 池底）");
const { uit: u0, res: r0 } = draai(twDetentionBasin);

meld(!isNaN(u0.UC_max) && u0.UC_max > 0, "基準案例: 無 NaN");
checkNabij("Q1", u0.Q1, 0.8333333, 1e-6);
checkNabij("Q2", u0.Q2, 1.5833333, 1e-6);
checkNabij("Q3", u0.Q3, 1.5, 1e-9);
checkNabij("tb_eff", u0.tb_eff, 1.5, 1e-9);
checkNabij("Vs1", u0.Vs1, 2025, 1e-9);
checkNabij("Vs2", u0.Vs2, 1800, 1e-9);
checkNabij("Vsd", u0.Vsd, 1980, 1e-9);
checkNabij("Q_in_peak", u0.Q_in_peak, 1.5, 1e-9);
checkNabij("Q_out_cap", u0.Q_out_cap, 0.8333333, 1e-6);
checkNabij("V_total", u0.V_total, 2507.328, 1e-6);
checkNabij("V_dead", u0.V_dead, 76.10533, 1e-6);
checkNabij("V_eff", u0.V_eff, 2431.22267, 1e-6);
checkNabij("A_orf", u0.A_orf, 0.16, 1e-9);
checkNabij("h_des", u0.h_des, 2.3, 1e-9);
checkNabij("Q_orf", u0.Q_orf, 0.616212327, 1e-7);
checkNabij("Q_spill", u0.Q_spill, 2.322781822, 1e-7);
checkNabij("fb_act", u0.fb_act, 0.7, 1e-9);
checkNabij("UC_vol", u0.UC_vol, 1980 / 2431.22267, 1e-6);
checkNabij("UC_out", u0.UC_out, 0.616212327 / 0.8333333, 1e-6);
checkNabij("UC_spill", u0.UC_spill, 1.5 / 2.322781822, 1e-6);
checkNabij("UC_fb", u0.UC_fb, 0.5 / 0.7, 1e-9);
checkNabij("UC_max", u0.UC_max, 0.82, 1e-9);
meld(r0.voldoet === true, "基準案例判定為合格");
meld(r0.uc === 0.82, `leesResultaat 辨識 UC = 0.82（實際 ${r0.uc}）`);

// -----------------------------------------------------------------------------
// 2. 臨時性滯洪與基期處理
// -----------------------------------------------------------------------------
console.log("\n2. 臨時性滯洪設施與基期處理");
{
  const { uit: u } = draai(vervang(twDetentionBasin, "is_perm = 1'-", "is_perm = 0'-"));
  checkNabij("Vsd(臨時)", u.Vsd, 2632.5, 1e-9);
  checkNabij("Q_in_peak(臨時)", u.Q_in_peak, 1.5833333, 1e-6);
  // 臨時性：入流洪峰採開發中 Q2，0.8·Q2 = 1.2667 > Q1，所以仍由開發前洪峰控制
  checkNabij("Q_out_cap(臨時)", u.Q_out_cap, 0.8333333, 1e-6);
  checkNabij("UC_vol(臨時)", u.UC_vol, 2632.5 / 2431.22267, 1e-6);
  meld(u.UC_vol > 1, "臨時性設計蓄洪量 2632.5 m³ 大於有效容積 2431 m³：UC_vol > 1");
}
{
  const { uit: u } = draai(vervang(twDetentionBasin, "tb_in = 1.5'h", "tb_in = 0.5'h"));
  checkNabij("tb_eff(0.5→1)", u.tb_eff, 1.0, 1e-12);
  checkNabij("Vs2(tb=1 h)", u.Vs2, (1.0 * (1.5 - 0.8333333)) / 2 * 3600, 1e-6);
}
{
  const { uit: u } = draai(vervang(twDetentionBasin, "Q_allow_down = 1.5'm^3/s", "Q_allow_down = 0.5'm^3/s"));
  checkNabij("Q_out_cap(下游0.5)", u.Q_out_cap, 0.5, 1e-9);
  meld(u.UC_out > 1, `下游容許排洪量較小，孔口出流超限：UC_out = ${u.UC_out.toFixed(3)}`);
}

// -----------------------------------------------------------------------------
// 3. 逐時段調洪演算（Modified Puls）
// -----------------------------------------------------------------------------
console.log("\n3. 逐時段調洪演算（Modified Puls）");

/** 獨立求解器：排放孔口出流關係（雨水下水道設計指南 I-8.3.2） */
function rating(h, B, L) {
  if (h <= 0) return 0;
  if (h <= 1.2 * L) return 1.767 * B * Math.pow(h, 1.5);
  if (h >= 1.8 * L) return 0.6 * B * L * Math.sqrt(2 * 9.81 * (h - L / 2));
  const qw12 = 1.767 * B * Math.pow(1.2 * L, 1.5);
  const qo18 = 0.6 * B * L * Math.sqrt(2 * 9.81 * (1.8 * L - L / 2));
  return qw12 + ((h - 1.2 * L) / (0.6 * L)) * (qo18 - qw12);
}

/** 池體蓄水量 V(y) */
function pondVol(y, p) {
  return p.B0 * p.L0 * y + p.z * (p.B0 + p.L0) * y * y + (4 / 3) * p.z * p.z * y * y * y;
}

/** 某水位之總出流（排放孔口 + 緊急溢洪口；溢流口底高程 = 設計水位 − 溢流水深） */
function totalOut(y, p) {
  let q = rating(y - p.zinv, p.B, p.L);
  const zsp = p.Hw - p.hs;
  if (y > zsp) q += 1.767 * p.Ls * Math.pow(y - zsp, 1.5);
  return q;
}

/** 由有效蓄水量反求水位（單調遞增，二分） */
function levelFromStorage(S, p) {
  let lo = p.zinv, hi = p.Hcrest;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (pondVol(mid, p) - pondVol(p.zinv, p) <= S) lo = mid;
    else hi = mid;
  }
  return (lo + hi) / 2;
}

/**
 * 獨立 Modified Puls 求解器：以「下一時段蓄水量 S」為未知數二分求解，
 * 不使用範本的水位二分，演算結構與範本不同，用於交叉驗證。
 */
function routeModifiedPuls(p) {
  const dQs = p.Qin - p.Q1;
  const rise = p.tbeff / 2, rec = p.tbeff / 2;
  const T = rise + rec;
  const dt_h = T / p.nstep;
  const dt = dt_h * 3600;
  const qin = (t) => (t <= 0 ? 0 : t >= T ? 0 : t <= rise ? (dQs * t) / rise : dQs * (1 - (t - rise) / rec));
  const Sdead = pondVol(p.zinv, p) - pondVol(p.zinv, p);
  const Smax = pondVol(p.Hcrest, p) - pondVol(p.zinv, p);
  let S = 0, O = 0, Vmax = 0, ymax = p.zinv, Qmax = 0, over = 0;
  for (let i = 1; i <= p.nstep; i++) {
    const Imid = qin((i - 0.5) * dt_h);
    const target = S + dt * Imid;
    // 對 S_next 二分：G(S) = S − target + dt·(O + O(y(S)))/2 = 0（單調遞增）
    let lo = 0, hi = Smax;
    for (let k = 0; k < 200; k++) {
      const mid = (lo + hi) / 2;
      const y = levelFromStorage(mid, p);
      const G = mid - target + (dt * (O + totalOut(y, p))) / 2;
      if (G <= 0) lo = mid; else hi = mid;
    }
    let Snext = (lo + hi) / 2;
    let y = levelFromStorage(Snext, p);
    if (target < 0) { Snext = 0; y = p.zinv; }
    // 堤頂仍不足以容納（越堤）：水位停在堤頂
    if (Snext >= Smax - 1e-12 && target > Smax) { over = 1; Snext = Smax; y = p.Hcrest; }
    const Onext = totalOut(y, p);
    S = Snext; O = Onext;
    if (S > Vmax) Vmax = S;
    if (y > ymax) ymax = y;
    if (Onext > Qmax) Qmax = Onext;
  }
  return { Vmax, ymax, Qmax, over, Sdead };
}

{
  const p = {
    B0: 25, L0: 30, z: 2, Hw: 2.4, zinv: 0.1, Hcrest: 3.4,
    B: 0.4, L: 0.4, Ls: 8, hs: 0.3, nstep: 20, tbeff: 1.5, Qin: 1.5, Q1: 0.8333333333,
  };
  const ref = routeModifiedPuls(p);
  checkNabij("dt_rt", u0.dt_rt, 0.075, 1e-9);
  checkNabij("V_in_vol", u0.V_in_vol, 1800, 1e-6);
  checkNabij("V_max_rt", u0.V_max_rt, ref.Vmax, 1e-6);
  checkNabij("y_max_rt", u0.y_max_rt, ref.ymax, 1e-6);
  checkNabij("Q_max_rt", u0.Q_max_rt, ref.Qmax, 1e-6);
  checkNabij("UC_rt_vol", u0.UC_rt_vol, ref.Vmax / u0.V_eff, 1e-6);
  checkNabij("UC_rt_out", u0.UC_rt_out, ref.Qmax / u0.Q_out_cap, 1e-6);
  checkNabij("UC_rt_crest", u0.UC_rt_crest, 0, 1e-9);
  meld(u0.V_in_vol === 1800 && Math.abs(u0.V_in_vol - u0.Vs2) < 1e-6, "預設演算入流體積與第 96 條 Vs2 一致");
}

{
  // 時段數收斂性：時段愈多，演算結果應趨於穩定（Δt = 0.075 h vs 0.01875 h）
  const p = { B0: 25, L0: 30, z: 2, Hw: 2.4, zinv: 0.1, Hcrest: 3.4, B: 0.4, L: 0.4, Ls: 8, hs: 0.3, tbeff: 1.5, Qin: 1.5, Q1: 0.8333333333 };
  const fijn = routeModifiedPuls({ ...p, nstep: 80 });
  const grof = routeModifiedPuls({ ...p, nstep: 20 });
  meld(Math.abs(fijn.Vmax - grof.Vmax) / fijn.Vmax < 0.05, `時段數收斂性：Δt 0.075 h 與 0.01875 h 之最大蓄水量差 ${((Math.abs(fijn.Vmax - grof.Vmax) / fijn.Vmax) * 100).toFixed(2)}%（< 5%）`);
  const { uit: u80 } = draai(vervang(twDetentionBasin, "n_step = 20'", "n_step = 80'"));
  checkNabij("V_max_rt(80段)", u80.V_max_rt, fijn.Vmax, 1e-6);
}

{
  // 自訂歷線：漲水 0.5 h、退水 1.0 h、洪峰 1.0 m³/s
  const { uit: u } = draai(vervang(vervang(vervang(twDetentionBasin,
    "Q_pk_in = 0'm^3/s", "Q_pk_in = 1.0'm^3/s"),
    "t_rise_in = 0'h", "t_rise_in = 0.5'h"),
    "t_rec_in = 0'h", "t_rec_in = 1.0'h"));
  checkNabij("V_in_vol(自訂)", u.V_in_vol, 0.5 * 1.0 * 1.5 * 3600, 1e-6);
  checkNabij("dt_rt(自訂)", u.dt_rt, 1.5 / 20, 1e-9);
  meld(u.V_max_rt > 0 && u.Q_max_rt > 0, "自訂歷線演算有結果");
}

// -----------------------------------------------------------------------------
// 4. 負向測試與安全防護
// -----------------------------------------------------------------------------
console.log("\n4. 負向測試與安全防護");

// 4.1 池體太小，蓄洪容積不足
{
  const { uit, res } = draai(vervang(twDetentionBasin, "H_w = ?{2.4}", "H_w = ?{1.8}"));
  meld(uit.UC_vol > 1 && res.voldoet === false, `蓄洪容積不足：UC_vol = ${uit.UC_vol.toFixed(3)}，判定不合格`);
}

// 4.2 排放孔口過大，出流超過容許洪峰
{
  const { uit, res } = draai(vervang(twDetentionBasin, "B_orf = ?{0.40}", "B_orf = ?{0.80}"));
  meld(uit.UC_out > 1 && res.voldoet === false, `排放孔口過大：Q_orf = ${uit.Q_orf.toFixed(4)} > Q_out,cap：UC_out = ${uit.UC_out.toFixed(3)}，判定不合格`);
}

// 4.3 溢洪口過窄
{
  const { uit, res } = draai(vervang(twDetentionBasin, "L_spill = ?{8.0}", "L_spill = ?{4.0}"));
  meld(uit.UC_spill > 1 && res.voldoet === false, `溢洪口過窄：UC_spill = ${uit.UC_spill.toFixed(3)}，判定不合格`);
}

// 4.4 堤頂出水高不足
{
  const { uit, res } = draai(vervang(twDetentionBasin, "H_crest = ?{3.4}", "H_crest = ?{2.9}"));
  meld(uit.UC_fb > 1 && res.voldoet === false, `堤頂出水高不足：UC_fb = ${uit.UC_fb.toFixed(3)}，判定不合格`);
}

// 4.5 堤頂低於設計水位加溢流水深（出水高為負值）：不可誤判合格
{
  const { uit, res } = draai(vervang(twDetentionBasin, "H_crest = ?{3.4}", "H_crest = ?{2.5}"));
  meld(uit.fb_act < 0 && uit.UC_fb >= 99 && res.voldoet === false, `出水高為負（${uit.fb_act.toFixed(2)} m）：UC_fb = ${uit.UC_fb}，判定不合格（原式 fb_min/fb_act 會得負值而誤判合格）`);
}

// 4.6 開發後洪峰小於開發前：本模組不適用，拒算（UC = 99）
{
  const { uit, res } = draai(vervang(twDetentionBasin, "C_post = 0.90'-", "C_post = 0.40'-"));
  meld(uit.Q3 < uit.Q1 && res.voldoet === false && uit.UC_max >= 99, `Q3 < Q1（無須滯洪）：拒絕通過（UC_max = ${uit.UC_max}）`);
}

// 4.7 孔口底緣抬高使孔口無作用水深
{
  const { uit, res } = draai(vervang(twDetentionBasin, "z_inv = ?{0.10}", "z_inv = ?{2.50}"));
  meld(res.voldoet === false && uit.UC_max >= 99, `孔口位於設計水位以上：拒絕通過（UC_max = ${uit.UC_max}）`);
}

// 4.8 逕流係數大於 1
{
  const { res } = draai(vervang(twDetentionBasin, "C_post = 0.90'-", "C_post = 1.20'-"));
  meld(res.voldoet === false, "逕流係數大於 1：判定不合格");
}

// 4.9 集水面積為 0
{
  const { res } = draai(vervang(twDetentionBasin, "A_catch = 5.0'ha", "A_catch = 0.0'ha"));
  meld(res.voldoet === false, "集水面積為 0：判定不合格");
}

// 4.10 孔口底緣抬高使死水量增加，有效蓄洪容積減少
{
  const { uit: a } = draai(twDetentionBasin);
  const { uit: b } = draai(vervang(twDetentionBasin, "z_inv = ?{0.10}", "z_inv = ?{0.50}"));
  meld(b.V_eff < a.V_eff && b.V_dead > a.V_dead, `孔口抬高：V_eff ${a.V_eff.toFixed(1)} → ${b.V_eff.toFixed(1)}，死水量 ${a.V_dead.toFixed(1)} → ${b.V_dead.toFixed(1)}`);
}

// 4.11 調洪演算：自訂大洪峰（3.5 m³/s，設計洪峰 1.5 m³/s 之 2.3 倍），演算最高蓄水量超過有效容積
{
  const { uit, res } = draai(vervang(vervang(vervang(twDetentionBasin,
    "Q_pk_in = 0'm^3/s", "Q_pk_in = 3.5'm^3/s"),
    "t_rise_in = 0'h", "t_rise_in = 0.5'h"),
    "t_rec_in = 0'h", "t_rec_in = 1.0'h"));
  meld(uit.UC_rt_vol > 1 && res.voldoet === false, `調洪演算蓄洪量不足：V_max = ${uit.V_max_rt.toFixed(1)} m³ > V_eff = ${uit.V_eff.toFixed(1)} m³（最高水位 ${uit.y_max_rt.toFixed(3)} m 高於設計水位 2.4 m）：UC_rt_vol = ${uit.UC_rt_vol.toFixed(3)}，判定不合格`);
}

// 4.12 調洪演算：排放孔口過大，演算最大出流超過容許出流洪峰
{
  const { uit, res } = draai(vervang(vervang(vervang(twDetentionBasin,
    "B_orf = ?{0.40}", "B_orf = ?{1.20}"),
    "L_orf = ?{0.40}", "L_orf = ?{0.60}"),
    "Q_pk_in = 0'm^3/s", "Q_pk_in = 3.0'm^3/s"));
  meld(uit.UC_rt_out > 1 && res.voldoet === false, `調洪演算出流超限：Q_max = ${uit.Q_max_rt.toFixed(4)} m³/s > Q_out,cap = ${uit.Q_out_cap.toFixed(4)}：UC_rt_out = ${uit.UC_rt_out.toFixed(3)}，判定不合格`);
}

// 4.13 調洪演算：小集水區（0.5 ha）配小型池體與窄溢洪口，自訂洪峰 2.5 m³/s，演算水位達堤頂
{
  const { uit, res } = draai(vervang(vervang(vervang(vervang(vervang(vervang(vervang(vervang(vervang(vervang(
    twDetentionBasin,
    "A_catch = 5.0'ha", "A_catch = 0.5'ha"),
    "B_orf = ?{0.40}", "B_orf = ?{0.12}"),
    "L_orf = ?{0.40}", "L_orf = ?{0.12}"),
    "L_spill = ?{8.0}", "L_spill = ?{0.60}"),
    "H_crest = ?{3.4}", "H_crest = ?{3.2}"),
    "L0_pond = ?{30.0}", "L0_pond = ?{15.0}"),
    "B0_pond = ?{25.0}", "B0_pond = ?{12.0}"),
    "Q_pk_in = 0'm^3/s", "Q_pk_in = 2.5'm^3/s"),
    "t_rise_in = 0'h", "t_rise_in = 0.5'h"),
    "t_rec_in = 0'h", "t_rec_in = 1.0'h"));
  meld(uit.UC_rt_crest >= 99 && res.voldoet === false, `調洪演算越堤：y_max = ${uit.y_max_rt.toFixed(3)} m ≥ H_crest = 3.20 m，UC_rt_crest = ${uit.UC_rt_crest}，判定不合格`);
}

// 4.14 演算時段數非法
{
  const { res } = draai(vervang(twDetentionBasin, "n_step = 20'", "n_step = 1'"));
  meld(res.voldoet === false, "演算時段數 1（少於 2）：拒絕通過");
}

// -----------------------------------------------------------------------------
// 5. 第二套獨立純 SI 計算掃描
// -----------------------------------------------------------------------------
console.log("\n5. 第二套獨立計算掃描（數值積分求池體容積 + 獨立 Modified Puls 求解器）");

/** 以梯形法對 (B0+2zy)(L0+2zy) 逐段積分，不用範本的閉合式 */
function volInt(B0, L0, z, H, n = 20000) {
  let v = 0;
  const dy = H / n;
  for (let i = 0; i < n; i++) {
    const y1 = i * dy, y2 = (i + 1) * dy;
    const a1 = (B0 + 2 * z * y1) * (L0 + 2 * z * y1);
    const a2 = (B0 + 2 * z * y2) * (L0 + 2 * z * y2);
    v += 0.5 * (a1 + a2) * dy;
  }
  return v;
}

function solveIndep({ A, Ipre, Ipost, Cpre, Cmid, Cpost, tb, perm, Qdown, B0, L0, z, Hw, zinv, Hcrest, B, L, Ls, hs, fbMin, nstep }) {
  const Q1 = (Cpre * Ipre * A) / 360;
  const Q2 = (Cmid * Ipost * A) / 360;
  const Q3 = (Cpost * Ipost * A) / 360;
  const tbe = Math.max(tb, 1);
  const Vs1 = (tbe * (Q2 - Q1)) / 2 * 3600;
  const Vs2 = (tbe * (Q3 - Q1)) / 2 * 3600;
  const Vsd = perm ? 1.1 * Vs2 : 1.3 * Vs1;
  const Qin = perm ? Q3 : Q2;
  const Qcap = Math.min(0.8 * Qin, Q1, Qdown);
  const Veff = volInt(B0, L0, z, Hw) - volInt(B0, L0, z, zinv);
  const hd = Hw - zinv;
  const Qorf = rating(hd, B, L);
  const Qspill = 1.767 * Ls * Math.pow(hs, 1.5);
  const fb = Hcrest - Hw - hs;
  const rt = routeModifiedPuls({ B0, L0, z, Hw, zinv, Hcrest, B, L, Ls, hs, nstep, tbeff: tbe, Qin, Q1 });
  const ucRtVol = rt.Vmax / Veff;
  const ucRtOut = rt.Qmax / Qcap;
  const ucRtCrest = rt.over || rt.ymax > Hcrest ? 99 : 0;
  const uc = Math.max(Vsd / Veff, Qorf / Qcap, Qin / Qspill, fbMin / fb, ucRtVol, ucRtOut, ucRtCrest);
  return { uc, fb, Veff, Qorf, rt };
}

{
  let n_pass = 0, n_tot = 0;
  const base = { A: 5.0, Ipre: 100, Ipost: 120, Cpre: 0.6, Cmid: 0.95, Cpost: 0.9, tb: 1.5, perm: true, Qdown: 1.5, B0: 30, L0: 25, z: 2, Hw: 2.4, zinv: 0.1, Hcrest: 3.4, B: 0.4, L: 0.4, Ls: 8, hs: 0.3, fbMin: 0.5, nstep: 20 };
  for (const A of [3, 5, 8]) for (const Hw of [1.8, 2.4, 3.0]) for (const B of [0.25, 0.40, 0.60]) for (const Ls of [4, 8]) for (const perm of [true, false]) {
    const p = { ...base, A, Hw, B, Ls, perm, Hcrest: Hw + 1.0 };
    let t = twDetentionBasin;
    t = vervang(t, "A_catch = 5.0'ha", `A_catch = ${A}'ha`);
    t = vervang(t, "H_w = ?{2.4}", `H_w = ?{${Hw}}`);
    t = vervang(t, "B_orf = ?{0.40}", `B_orf = ?{${B}}`);
    t = vervang(t, "L_spill = ?{8.0}", `L_spill = ?{${Ls}}`);
    t = vervang(t, "H_crest = ?{3.4}", `H_crest = ?{${(Hw + 1.0).toFixed(2)}}`);
    t = vervang(t, "is_perm = 1'-", `is_perm = ${perm ? 1 : 0}'-`);
    const { uit, res } = draai(t);
    const ref = solveIndep(p);
    n_tot++;
    const ucOk = Math.abs(uit.UC_max - Math.ceil(ref.uc * 100) / 100) <= 0.0101;
    const borderline = Math.abs(ref.uc - 1) < 0.015;
    const volOk = Math.abs(uit.V_eff - ref.Veff) / ref.Veff < 1e-6;
    const rtVolOk = Math.abs(uit.V_max_rt - ref.rt.Vmax) / Math.max(ref.rt.Vmax, 1) < 1e-6;
    const rtOutOk = Math.abs(uit.Q_max_rt - ref.rt.Qmax) / Math.max(ref.rt.Qmax, 1e-9) < 1e-6;
    const rtYOk = Math.abs(uit.y_max_rt - ref.rt.ymax) < 1e-6;
    const voldoetOk = borderline || res.voldoet === (ref.uc <= 1);
    if (ucOk && volOk && rtVolOk && rtOutOk && rtYOk && voldoetOk) n_pass++;
    else meld(false, `掃描案例 A=${A} Hw=${Hw} B=${B} Ls=${Ls} perm=${perm}`, `範本 UC = ${uit.UC_max}，獨立 UC = ${ref.uc.toFixed(4)}，V_eff ${uit.V_eff} vs ${ref.Veff}，V_max ${uit.V_max_rt} vs ${ref.rt.Vmax}，Q_max ${uit.Q_max_rt} vs ${ref.rt.Qmax}，y_max ${uit.y_max_rt} vs ${ref.rt.ymax}`);
  }
  meld(n_pass === n_tot, `UC_max、有效容積與調洪演算：全部吻合（通過 ${n_pass} / ${n_tot}）`);
}

console.log(`\n=== 檢核總結：失敗 ${fouten} 項 ===`);
process.exit(fouten === 0 ? 0 : 1);
