/**
 * 台灣規範 swc_tech 滯洪池設計與檢核模組檢查腳本（tw-detention-basin）
 *
 * 驗證項目：
 *   0. 公式釘死值核對（已驗證庫：swc96_Vs1_temp_detention、swc96_Vs2_perm_detention、
 *      swc96_Vsd_permanent、swc96_Vsd_temporary、swc95_outflow_cap、swc17_rational_qp）
 *   1. 預設基準案例（5 ha、永久性滯洪、30×25 m 池底、1:2 邊坡、設計水位 2.4 m，合格 UC = 0.82）
 *   2. 臨時性滯洪設施案例（Vsd = 1.3·Vs1）與基期不足 1 小時（以 1 小時計）
 *   3. 負向測試與安全防護
 *   4. 第二套獨立純 SI 計算掃描（數值積分求池體容積，與範本閉合式交叉比對）
 *
 * 手算基準（皆與範本獨立推導）：
 *   Q1 = 0.60 × 100 × 5 / 360 = 0.833333 m³/s；Q2 = 0.95 × 120 × 5 / 360 = 1.583333 m³/s；
 *   Q3 = 0.90 × 120 × 5 / 360 = 1.5 m³/s
 *   Vs2 = 1.5 × (1.5 − 0.833333) / 2 × 3600 = 1800 m³；Vsd = 1.1 × 1800 = 1980 m³
 *   Vs1 = 1.5 × (1.583333 − 0.833333) / 2 × 3600 = 2025 m³；臨時 Vsd = 1.3 × 2025 = 2632.5 m³
 *   Q_out,cap = min(0.8 × 1.5, 0.833333, 1.5) = 0.833333 m³/s
 *   V(y) = 750y + 110y² + (16/3)y³：V(2.4) = 2507.328 m³、V(0.10) = 76.1053 m³，V_eff = 2431.2227 m³
 *   孔口 D = 0.45 m：A = 0.159043 m²，h_c = 2.4 − (0.10 + 0.225) = 2.075 m，
 *   Q_orf = 0.62 × 0.159043 × √(2 × 9.81 × 2.075) = 0.629166 m³/s
 *   溢洪口 Q = 1.84 × 8 × 0.3^1.5 = 2.418743 m³/s；出水高 = 3.4 − 2.4 − 0.3 = 0.7 m
 *
 * 注意：Cd = 0.62、Cw = 1.84、堤頂最小出水高 0.50 m 為工程慣用值，非規範明文，已於範本標示。
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
console.log("0. 公式釘死值核對（swc_tech §17、§95、§96 已驗證公式）");

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
checkNabij("A_orf", u0.A_orf, 0.159043, 1e-5);
checkNabij("h_c", u0.h_c, 2.075, 1e-9);
checkNabij("Q_orf", u0.Q_orf, 0.629166, 1e-5);
checkNabij("Q_spill", u0.Q_spill, 2.418743, 1e-5);
checkNabij("fb_act", u0.fb_act, 0.7, 1e-9);
checkNabij("UC_vol", u0.UC_vol, 1980 / 2431.22267, 1e-6);
checkNabij("UC_out", u0.UC_out, 0.629166 / 0.8333333, 1e-5);
checkNabij("UC_spill", u0.UC_spill, 1.5 / 2.418743, 1e-5);
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
// 3. 負向測試與安全防護
// -----------------------------------------------------------------------------
console.log("\n3. 負向測試與安全防護");

// 3.1 池體太小，蓄洪容積不足
{
  const { uit, res } = draai(vervang(twDetentionBasin, "H_w = ?{2.4}", "H_w = ?{1.8}"));
  meld(uit.UC_vol > 1 && res.voldoet === false, `蓄洪容積不足：UC_vol = ${uit.UC_vol.toFixed(3)}，判定不合格`);
}

// 3.2 孔口過大，出流超過容許洪峰
{
  const { uit, res } = draai(vervang(twDetentionBasin, "D_orf = ?{0.45}", "D_orf = ?{0.60}"));
  meld(uit.UC_out > 1 && res.voldoet === false, `孔口過大：Q_orf = ${uit.Q_orf.toFixed(4)} > Q_out,cap：UC_out = ${uit.UC_out.toFixed(3)}，判定不合格`);
}

// 3.3 溢洪口過窄
{
  const { uit, res } = draai(vervang(twDetentionBasin, "L_spill = ?{8.0}", "L_spill = ?{4.0}"));
  meld(uit.UC_spill > 1 && res.voldoet === false, `溢洪口過窄：UC_spill = ${uit.UC_spill.toFixed(3)}，判定不合格`);
}

// 3.4 堤頂出水高不足
{
  const { uit, res } = draai(vervang(twDetentionBasin, "H_crest = ?{3.4}", "H_crest = ?{2.9}"));
  meld(uit.UC_fb > 1 && res.voldoet === false, `堤頂出水高不足：UC_fb = ${uit.UC_fb.toFixed(3)}，判定不合格`);
}

// 3.5 堤頂低於設計水位加溢流水深（出水高為負值）：不可誤判合格
{
  const { uit, res } = draai(vervang(twDetentionBasin, "H_crest = ?{3.4}", "H_crest = ?{2.5}"));
  meld(uit.fb_act < 0 && uit.UC_fb >= 99 && res.voldoet === false, `出水高為負（${uit.fb_act.toFixed(2)} m）：UC_fb = ${uit.UC_fb}，判定不合格（原式 fb_min/fb_act 會得負值而誤判合格）`);
}

// 3.6 開發後洪峰小於開發前：本模組不適用，拒算（UC = 99）
{
  const { uit, res } = draai(vervang(twDetentionBasin, "C_post = 0.90'-", "C_post = 0.40'-"));
  meld(uit.Q3 < uit.Q1 && res.voldoet === false && uit.UC_max >= 99, `Q3 < Q1（無須滯洪）：拒絕通過（UC_max = ${uit.UC_max}）`);
}

// 3.7 孔口中心高於設計水位：孔口無作用水頭
{
  const { uit, res } = draai(vervang(twDetentionBasin, "z_inv = ?{0.10}", "z_inv = ?{2.50}"));
  meld(res.voldoet === false && uit.UC_max >= 99, `孔口位於設計水位以上：拒絕通過（UC_max = ${uit.UC_max}）`);
}

// 3.8 逕流係數大於 1
{
  const { res } = draai(vervang(twDetentionBasin, "C_post = 0.90'-", "C_post = 1.20'-"));
  meld(res.voldoet === false, "逕流係數大於 1：判定不合格");
}

// 3.9 集水面積為 0
{
  const { res } = draai(vervang(twDetentionBasin, "A_catch = 5.0'ha", "A_catch = 0.0'ha"));
  meld(res.voldoet === false, "集水面積為 0：判定不合格");
}

// 3.10 孔口底緣抬高使死水量增加，有效蓄洪容積減少
{
  const { uit: a } = draai(twDetentionBasin);
  const { uit: b } = draai(vervang(twDetentionBasin, "z_inv = ?{0.10}", "z_inv = ?{0.50}"));
  meld(b.V_eff < a.V_eff && b.V_dead > a.V_dead, `孔口抬高：V_eff ${a.V_eff.toFixed(1)} → ${b.V_eff.toFixed(1)}，死水量 ${a.V_dead.toFixed(1)} → ${b.V_dead.toFixed(1)}`);
}

// -----------------------------------------------------------------------------
// 4. 第二套獨立純 SI 計算掃描
// -----------------------------------------------------------------------------
console.log("\n4. 第二套獨立計算掃描（數值積分求池體容積）");

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

function solveIndep({ A, Ipre, Ipost, Cpre, Cmid, Cpost, tb, perm, Qdown, B0, L0, z, Hw, zinv, Hcrest, D, nO, Cd, Ls, hs, Cw, fbMin }) {
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
  const hc = Hw - (zinv + D / 2);
  const Qorf = nO * Cd * (Math.PI * D * D / 4) * Math.sqrt(2 * 9.81 * hc);
  const Qspill = Cw * Ls * hs ** 1.5;
  const fb = Hcrest - Hw - hs;
  const uc = Math.max(Vsd / Veff, Qorf / Qcap, Qin / Qspill, fbMin / fb);
  return { uc, fb, Veff, Qorf };
}

{
  let n_pass = 0, n_tot = 0;
  const base = { A: 5.0, Ipre: 100, Ipost: 120, Cpre: 0.6, Cmid: 0.95, Cpost: 0.9, tb: 1.5, perm: true, Qdown: 1.5, B0: 30, L0: 25, z: 2, Hw: 2.4, zinv: 0.1, Hcrest: 3.4, D: 0.45, nO: 1, Cd: 0.62, Ls: 8, hs: 0.3, Cw: 1.84, fbMin: 0.5 };
  for (const A of [3, 5, 8]) for (const Hw of [1.8, 2.4, 3.0]) for (const D of [0.30, 0.45, 0.60]) for (const Ls of [4, 8]) for (const perm of [true, false]) {
    const p = { ...base, A, Hw, D, Ls, perm, Hcrest: Hw + 1.0 };
    let t = twDetentionBasin;
    t = vervang(t, "A_catch = 5.0'ha", `A_catch = ${A}'ha`);
    t = vervang(t, "H_w = ?{2.4}", `H_w = ?{${Hw}}`);
    t = vervang(t, "D_orf = ?{0.45}", `D_orf = ?{${D}}`);
    t = vervang(t, "L_spill = ?{8.0}", `L_spill = ?{${Ls}}`);
    t = vervang(t, "H_crest = ?{3.4}", `H_crest = ?{${(Hw + 1.0).toFixed(2)}}`);
    t = vervang(t, "is_perm = 1'-", `is_perm = ${perm ? 1 : 0}'-`);
    const { uit, res } = draai(t);
    const ref = solveIndep(p);
    n_tot++;
    const ucOk = Math.abs(uit.UC_max - Math.ceil(ref.uc * 100) / 100) <= 0.0101;
    const borderline = Math.abs(ref.uc - 1) < 0.015;
    const volOk = Math.abs(uit.V_eff - ref.Veff) / ref.Veff < 1e-6;
    const voldoetOk = borderline || res.voldoet === (ref.uc <= 1);
    if (ucOk && volOk && voldoetOk) n_pass++;
    else meld(false, `掃描案例 A=${A} Hw=${Hw} D=${D} Ls=${Ls} perm=${perm}`, `範本 UC = ${uit.UC_max}，獨立 UC = ${ref.uc.toFixed(4)}，V_eff ${uit.V_eff} vs ${ref.Veff}`);
  }
  meld(n_pass === n_tot, `UC_max、有效容積與判定：全部吻合（通過 ${n_pass} / ${n_tot}）`);
}

console.log(`\n=== 檢核總結：失敗 ${fouten} 項 ===`);
process.exit(fouten === 0 ? 0 : 1);
