/**
 * 台灣規範 hwbridge / rc112 鋼筋混凝土箱涵設計與檢核模組檢查腳本（tw-box-culvert）
 *
 * 驗證項目：
 *   0. 規範取數釘死值（hwbridge §3.6 HS20-44 輪重、§3.13 涵洞衝擊係數、§4.4 輪重分佈、
 *      §3.20 最小流體壓力與 60 cm 活載重超載、§3.23 表 3.3 第 VIII 組係數）
 *   1. 預設基準案例（3.0 m × 2.0 m 單孔箱涵，覆土 1.0 m，合格 UC = 0.84，頂版剪力控制）
 *   2. 第二套獨立求解器：撓角變位法（slope-deflection，不計軸向變形）閉合解，
 *      與範本內 raamwerk 剛架結果交叉比對（加大 EA 時須吻合至 1e-5；實際 EA 時差異 < 1%）
 *   3. 參數變化案例（淺覆土衝擊、輪重分佈區重疊、深覆土不計活載重、載重等級 1.25 倍、無車載）
 *   4. 負向測試與安全防護（無效幾何、覆土 ≤ 0.60 m 有車載、排水容量不足、承載力不足、
 *      鋼筋間距過大、加腋過小、剪力不足、抗浮不足、最小流體壓力控制）
 *
 * 手算基準（與範本獨立推導）：
 *   B_c = 3.0 + 0.3 = 3.3 m；H_c = 2.0 + (0.35 + 0.40)/2 = 2.375 m
 *   §3.13：覆土 1.0 m ≥ 0.9 m，I = 0；§4.4：輪重分佈方形邊長 1.75 × 1.0 = 1.75 m < 輪距 1.80 m（不重疊）
 *         q_truck = 72 / 1.75² = 23.5102 kN/m²（顯示值無條件進位 23.52）
 *   第 VIII 組：w_u,top = 1.3 × (8.4 + 19 + 10 + 1.67 × 23.52) = 99.68192 kN/m²
 *               w_u,bot = 99.68192 + 1.3 × 2 × 24 × 0.3 × 2.375 / 3.3 = 113.15465 kN/m²
 *   側壓：K0 = 1 − sin30° = 0.5；z_top = 1.175 m，z_bot = 3.55 m，地下水位 1.5 m
 *         p_u,top = 1.3 × (0.5 × (10 + 19 × 1.175) + 1.67 × 0.5 × 19 × 0.6) = 33.38595 kN/m²
 *         p_u,bot = 1.3 × (0.5 × (10 + 19 × 1.5 + 9.19 × 2.05) + 9.81 × 2.05 + 1.67 × 5.7) = 75.78903 kN/m²
 *   頂版剪力：V_u = 99.68192 × 3.3 / 2 = 164.4752 kN；φV_c = 0.75 × 0.17 × √28 × 290.45 = 195.957 kN
 *         UC_V,top = 164.48 / 195.96 = 0.8394（控制）
 *   曼寧：A = 6 − 2 × 0.2² = 5.92 m²，P = 10 − 1.6 + 4√2 × 0.2 = 9.53137 m，Q_cap = 21.7665 m³/s
 *   抗浮：W = 24 × (3.6 × 2.75 − 5.92) + 19 × 1.0 × 3.6 = 163.92 kN/m；U = 9.81 × 2.25 × 3.6 = 79.461 kN/m
 *         FS = 2.0629
 *
 * 注意：s_wheel = 1.80 m（hwbridge 圖 3.3 輪距）、K0 = 1 − sin φ、抗浮 FS ≥ 1.20、加腋 ≥ 0.15 m、
 *       保護層 50／40 mm 為設計者輸入／工程慣例，已於範本與 docs/tw/規範來源.md §5.9 標示。
 */

import { parse, evaluate } from "../packages/core/dist/index.js";
import { twBoxCulvert } from "../packages/desktop/src/templates/tw-box-culvert.ts";
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

/** 以修改後的範本字串求值；alles = true 時把 #hide 區塊也讀出（僅供核對中間值） */
function draai(tpl, alles = false) {
  const bron = alles ? tpl.replaceAll("#hide\n", "#show\n") : tpl;
  const nodes = evaluate(parse(bron), {});
  return { uit: leesGetallen(nodes), res: leesResultaat(evaluate(parse(tpl), {}), "tw-box-culvert") };
}

/** 取代必須真的命中，避免測試因字串不符而默默變成基準案例 */
function vervang(tpl, oud, nieuw) {
  if (!tpl.includes(oud)) throw new Error(`範本中找不到要取代的字串：${oud}`);
  return tpl.replace(oud, nieuw);
}

const ru = (u) => Math.ceil(u * 100) / 100;

/**
 * 第二套獨立求解器：對稱單孔閉合箱涵之撓角變位法（不計軸向變形）。
 * 以左側兩角隅轉角 θ1（左下）、θ2（左上）為未知數；右側由對稱性得 θ4 = −θ1、θ3 = −θ2。
 * 回傳各構件端部負彎矩（取絕對值）、跨中正彎矩與端部剪力。
 */
function hellingshoek(EI_t, EI_b, EI_w, B, H, w_t, w_b, p_t, p_b) {
  const k_t = EI_t / B, k_b = EI_b / B, k_w = EI_w / H;
  // 側牆梯形載重（底 p_b、頂 p_t）之固端彎矩
  const FEM_12 = (p_t * H * H) / 12 + ((p_b - p_t) * H * H) / 20;
  const FEM_21 = -((p_t * H * H) / 12 + ((p_b - p_t) * H * H) / 30);
  const A11 = 4 * k_w + 2 * k_t, A12 = 2 * k_w, A21 = 2 * k_w, A22 = 4 * k_w + 2 * k_b;
  const b1 = (w_t * B * B) / 12 - FEM_21;
  const b2 = -(w_b * B * B) / 12 - FEM_12;
  const det = A11 * A22 - A12 * A21;
  const th2 = (b1 * A22 - b2 * A12) / det;
  const th1 = (A11 * b2 - A21 * b1) / det;
  const M_top_end = Math.abs(2 * k_t * th2 - (w_t * B * B) / 12);
  const M_bot_end = Math.abs(2 * k_b * th1 + (w_b * B * B) / 12);
  // 側牆：簡支梯形載重彎矩扣除兩端負彎矩，取跨間最大正彎矩
  const R0 = (H * (2 * p_b + p_t)) / 6, RH = (H * (p_b + 2 * p_t)) / 6;
  let M_wall_mid = -Infinity;
  for (let i = 0; i <= 20000; i++) {
    const y = (H * i) / 20000;
    const Ms = R0 * y - (p_b * y * y) / 2 - ((p_t - p_b) * y ** 3) / (6 * H);
    M_wall_mid = Math.max(M_wall_mid, Ms - (M_bot_end * (1 - y / H) + M_top_end * (y / H)));
  }
  return {
    M_top_end, M_bot_end,
    M_top_mid: (w_t * B * B) / 8 - M_top_end,
    M_bot_mid: (w_b * B * B) / 8 - M_bot_end,
    V_top: (w_t * B) / 2, V_bot: (w_b * B) / 2,
    M_wall_mid,
    V_wall: Math.max(Math.abs(R0 + (M_bot_end - M_top_end) / H), Math.abs(RH + (M_top_end - M_bot_end) / H)),
  };
}

console.log("=== 台灣規範 hwbridge / rc112 鋼筋混凝土箱涵設計與檢核（tw-box-culvert） ===\n");

// ── 0. 規範取數釘死值 ────────────────────────────────────────────────
console.log("0. 規範取數釘死值（hwbridge）");
const tekst = twBoxCulvert;
meld(tekst.includes("P_wheel = if(truck_type == 1; 72 * k_truck; 0.0)"), "§3.6 HS20-44 後軸 144 kN → 單輪 72 kN");
meld(tekst.includes("I_truck_calc = if(H_cover ≤ 0.30; 0.30; if(H_cover ≤ 0.60; 0.20; if(H_cover < 0.90; 0.10; 0.0)))"), "§3.13 涵洞衝擊係數 30%／20%／10%／0（≥ 0.9 m）");
meld(tekst.includes("D_spread = 1.75 * H_cover"), "§4.4 輪重分佈方形邊長 1.75·H");
meld(tekst.includes("H_cover > 2.4 and H_cover > B_clear + t_wall"), "§4.4 單孔覆土 > 2.4 m 且 > 跨徑時不計活載重");
meld(tekst.includes("cover_ok = if(truck_type == 0 or H_cover > 0.60; 1; 0)"), "§4.4 覆土 ≤ 0.60 m 屬集中輪重，拒算");
meld(tekst.includes("4.7 * z_top") && tekst.includes("4.7 * z_bot"), "§3.20 土壓力不小於 4.7 kN/m³ 流體壓力");
meld(tekst.includes("K0_soil * gamma_s * 0.60"), "§3.20 活載重超載不小於 60 cm 填土");
meld(tekst.includes("gamma_LF = 1.3") && tekst.includes("beta_L = 1.67") && tekst.includes("beta_E = 1.0"), "§3.23 表 3.3 第 VIII 組 γ = 1.3、(L+I) 1.67、β_E = 1.0");
meld(tekst.includes("M_v_top_mid + 0.5 * M_h_top_mid") && tekst.includes("M_v_bot_mid + 0.5 * M_h_bot_mid"), "§3.20 正彎矩至多取側壓彎矩之半");

// ── 1. 預設基準案例 ───────────────────────────────────────────────────
console.log("\n1. 預設基準案例（覆土 1.0 m，HS20-44）");
const basis = draai(twBoxCulvert, true);
const b = basis.uit;
meld(basis.res.voldoet === true && basis.res.uc === 0.84 && !basis.res.nietGetoetst, `報告標頭讀取：UC = ${basis.res.uc}，合格`);
meld(basis.res.titel === "鋼筋混凝土箱涵設計與檢核（hwbridge / rc112）", "標題");
checkNabij("B_c", b.B_c, 3.3, 1e-9);
checkNabij("H_c", b.H_c, 2.375, 1e-9);
checkNabij("I_truck", b.I_truck, 0, 1e-12);
checkNabij("q_truck_noI", b.q_truck_noI, 72 / 1.75 ** 2, 1e-9);
checkNabij("q_truck", b.q_truck, 23.52, 1e-9);
const wut = 1.3 * (8.4 + 19 + 10 + 1.67 * 23.52);
const wub = wut + (1.3 * 2 * 24 * 0.3 * 2.375) / 3.3;
const put = 1.3 * (0.5 * (10 + 19 * 1.175) + 1.67 * 0.5 * 19 * 0.6);
const pub = 1.3 * (0.5 * (10 + 19 * 1.5 + (19 - 9.81) * 2.05) + 9.81 * 2.05 + 1.67 * 0.5 * 19 * 0.6);
checkNabij("w_u_top", b.w_u_top, wut, 1e-9);
checkNabij("w_u_bot", b.w_u_bot, wub, 1e-9);
checkNabij("p_u_top", b.p_u_top, put, 1e-9);
checkNabij("p_u_bot", b.p_u_bot, pub, 1e-9);
checkNabij("Vu_top", b.Vu_top, ru((wut * 3.3) / 2), 1e-9);
checkNabij("Vu_bot", b.Vu_bot, ru((wub * 3.3) / 2), 1e-9);
checkNabij("Pu_wall", b.Pu_wall, ru((wut * 3.3) / 2 + 1.3 * 24 * 0.3 * 2.375), 1e-9);
const phiVcTop = 0.75 * 0.17 * Math.sqrt(28) * (350 - 50 - 19.1 / 2);
const phiVcBot = 0.75 * 0.17 * Math.sqrt(28) * (400 - 50 - 19.1 / 2);
const phiVcWall = 0.75 * 0.17 * Math.sqrt(28) * (300 - 50 - 15.9 / 2);
checkNabij("phi_Vc_top", b.phi_Vc_top, ru(phiVcTop), 1e-9);
checkNabij("phi_Vc_bot", b.phi_Vc_bot, ru(phiVcBot), 1e-9);
checkNabij("phi_Vc_wall", b.phi_Vc_wall, ru(phiVcWall), 1e-9);
// φMn：As = 286.5 × 1000/150 = 1910 mm²/m，a = 1910 × 420 / (0.85 × 28 × 1000) = 33.706 mm
const As = (286.5 * 1000) / 150, a = (As * 420) / (0.85 * 28 * 1000);
checkNabij("phi_Mn_top_mid", b.phi_Mn_top_mid, ru(0.9 * As * 420 * (350 - 40 - 9.55 - a / 2) * 1e-6), 1e-9);
checkNabij("phi_Mn_bot_end", b.phi_Mn_bot_end, ru(0.9 * As * 420 * (400 - 50 - 9.55 - a / 2) * 1e-6), 1e-9);
checkNabij("s_max (24.3.2)", b.s_max_top_calc, Math.min(380 * (280 / 280) - 2.5 * 50, 300, 450, 1050), 1e-9);
checkNabij("UC_V_top", b.UC_V_top, b.Vu_top / b.phi_Vc_top, 1e-9);
const Aflow = 6 - 2 * 0.04, Pflow = 10 - 1.6 + 4 * Math.SQRT2 * 0.2;
const Qcap = (1 / 0.014) * Aflow * (Aflow / Pflow) ** (2 / 3) * Math.sqrt(0.005);
checkNabij("Q_cap", b.Q_cap, ru(Qcap), 1e-9);
const FS = (24 * (3.6 * 2.75 - Aflow) + 19 * 1.0 * 3.6) / (9.81 * 2.25 * 3.6);
checkNabij("FS_float", b.FS_float, ru(FS), 1e-9);
checkNabij("UC_bearing", b.UC_bearing, (37.4 + 9.6 + (2 * 24 * 0.3 * 2.375) / 3.3 + 72 / 1.75 ** 2) / 220, 1e-9);
checkNabij("UC_max", b.UC_max, 0.84, 1e-9);
meld(b.UC_max === ru(b.UC_V_top), "控制項目為頂版剪力");

// ── 2. 第二套獨立求解器（撓角變位法）─────────────────────────────────
console.log("\n2. 撓角變位法閉合解與 raamwerk 交叉比對");
function vergelijk(label, uit, tol) {
  const v = hellingshoek(uit.EI_top, uit.EI_bot, uit.EI_wall, uit.B_c, uit.H_c, uit.w_u_top, uit.w_u_bot, 0, 0);
  const h = hellingshoek(uit.EI_top, uit.EI_bot, uit.EI_wall, uit.B_c, uit.H_c, 0, 0, uit.p_u_top, uit.p_u_bot);
  checkNabij(`${label} Mv,top,end`, Math.abs(uit.M_v_top_end), v.M_top_end, tol);
  checkNabij(`${label} Mv,top,mid`, uit.M_v_top_mid, v.M_top_mid, tol);
  checkNabij(`${label} Mv,bot,end`, Math.abs(uit.M_v_bot_end), v.M_bot_end, tol);
  checkNabij(`${label} Mv,bot,mid`, uit.M_v_bot_mid, v.M_bot_mid, tol);
  checkNabij(`${label} Vv,top`, uit.V_v_top, v.V_top, tol);
  checkNabij(`${label} Vv,bot`, uit.V_v_bot, v.V_bot, tol);
  checkNabij(`${label} Mh,top`, Math.abs(uit.M_h_top_end), h.M_top_end, tol);
  checkNabij(`${label} Mh,bot`, Math.abs(uit.M_h_bot_end), h.M_bot_end, tol);
  checkNabij(`${label} Mh,wall,mid`, uit.M_h_wall_mid, h.M_wall_mid, tol);
  checkNabij(`${label} Vh,wall`, uit.V_h_wall, h.V_wall, tol);
}
// 加大軸向剛度，排除軸向變形後兩者須吻合
let stijf = twBoxCulvert;
for (const lid of ["top", "bot", "wall"]) stijf = vervang(stijf, `EA_${lid} = Ec_kpa * (1.0 * t_${lid})`, `EA_${lid} = 1e5 * Ec_kpa * (1.0 * t_${lid})`);
vergelijk("EA×1e5", draai(stijf, true).uit, 1e-5);
// 實際 EA：軸向變形影響 < 1%
vergelijk("實際 EA", b, 1e-2);
// 另一組幾何（寬扁、厚薄不同）確認非僅單點吻合
let stijf2 = vervang(vervang(vervang(stijf, "B_clear = 3.00'm", "B_clear = 4.50'm"), "H_clear = 2.00'm", "H_clear = 1.50'm"), "t_wall = 0.30'm", "t_wall = 0.40'm");
vergelijk("寬扁 EA×1e5", draai(stijf2, true).uit, 1e-5);

// ── 3. 參數變化案例 ───────────────────────────────────────────────────
console.log("\n3. 參數變化案例");
{
  // 覆土 0.8 m：I = 10%，D = 1.4 m < 1.8 m
  const { uit } = draai(vervang(twBoxCulvert, "H_cover = 1.00'm", "H_cover = 0.80'm"), true);
  checkNabij("H=0.8 I", uit.I_truck, 0.1, 1e-12);
  checkNabij("H=0.8 q_truck", uit.q_truck, ru((72 * 1.1) / 1.4 ** 2), 1e-9);
}
{
  // 覆土 1.2 m：D = 2.1 m > 輪距 1.8 m，同軸兩輪重疊
  const { uit } = draai(vervang(twBoxCulvert, "H_cover = 1.00'm", "H_cover = 1.20'm"), true);
  checkNabij("H=1.2 n_wheels", uit.n_wheels, 2, 1e-12);
  checkNabij("H=1.2 q_truck", uit.q_truck, ru(144 / ((2.1 + 1.8) * 2.1)), 1e-9);
}
{
  // 覆土 3.0 m：D = 5.25 m > 軸距 4.25 m，四輪重疊；3.0 m < 跨徑 3.3 m，仍計活載重
  const { uit, res } = draai(vervang(twBoxCulvert, "H_cover = 1.00'm", "H_cover = 3.00'm"), true);
  checkNabij("H=3.0 n_wheels", uit.n_wheels, 4, 1e-12);
  checkNabij("H=3.0 q_truck", uit.q_truck, ru((4 * 72) / ((5.25 + 1.8) * (5.25 + 4.25))), 1e-9);
  meld(res.uc > 0 && !res.nietGetoetst, `H=3.0 有檢核結果 UC = ${res.uc}`);
}
{
  // 覆土 3.5 m：> 2.4 m 且 > 跨徑 3.3 m，不計活載重（側向超載仍計）
  const { uit } = draai(vervang(twBoxCulvert, "H_cover = 1.00'm", "H_cover = 3.50'm"), true);
  checkNabij("H=3.5 q_truck", uit.q_truck, 0, 1e-12);
  checkNabij("H=3.5 p_L_lat", uit.p_L_lat, 5.7, 1e-9);
}
{
  const { uit } = draai(vervang(twBoxCulvert, "k_truck = 1.00'-", "k_truck = 1.25'-"), true);
  checkNabij("k=1.25 P_wheel", uit.P_wheel, 90, 1e-12);
  checkNabij("k=1.25 q_truck", uit.q_truck, ru(90 / 1.75 ** 2), 1e-9);
}
{
  const { uit, res } = draai(vervang(twBoxCulvert, "truck_type = 1'-", "truck_type = 0'-"), true);
  checkNabij("無車載 q_truck", uit.q_truck, 0, 1e-12);
  checkNabij("無車載 p_L_lat", uit.p_L_lat, 0, 1e-12);
  meld(res.voldoet && res.uc < basis.res.uc, `無車載 UC = ${res.uc} < 基準 ${basis.res.uc}`);
}
{
  // 無車載時覆土 0.5 m 仍可檢核
  const t = vervang(vervang(twBoxCulvert, "truck_type = 1'-", "truck_type = 0'-"), "H_cover = 1.00'm", "H_cover = 0.50'm");
  meld(!draai(t).res.nietGetoetst, "無車載、覆土 0.5 m 仍可檢核");
}

// ── 4. 負向測試與安全防護 ─────────────────────────────────────────────
console.log("\n4. 負向測試與安全防護");
function moetFalen(label, tpl, ucNaam) {
  const { uit, res } = draai(tpl, true);
  const ucOk = ucNaam ? uit[ucNaam] > 1 : true;
  meld(res.voldoet === false && !res.nietGetoetst && ucOk, `${label}：不合格（UC = ${res.uc}${ucNaam ? `，${ucNaam} = ${ru(uit[ucNaam])}` : ""}）`);
}
function moetWeigeren(label, tpl) {
  const { res } = draai(tpl);
  meld(res.nietGetoetst === true && res.voldoet === false, `${label}：拒算（總結：無效輸入，未檢核）`);
}
moetWeigeren("頂版厚 0.10 m", vervang(twBoxCulvert, "t_top = 0.35'm", "t_top = 0.10'm"));
moetWeigeren("加腋大於牆厚", vervang(twBoxCulvert, "c_chamfer = 0.20'm", "c_chamfer = 0.35'm"));
moetWeigeren("加腋為 0", vervang(twBoxCulvert, "c_chamfer = 0.20'm", "c_chamfer = 0.00'm"));
moetWeigeren("有車載、覆土 0.60 m（§4.3 集中輪重）", vervang(twBoxCulvert, "H_cover = 1.00'm", "H_cover = 0.60'm"));
moetWeigeren("未定義車載種類 2", vervang(twBoxCulvert, "truck_type = 1'-", "truck_type = 2'-"));
moetWeigeren("載重等級倍數 < 1", vervang(twBoxCulvert, "k_truck = 1.00'-", "k_truck = 0.80'-"));
moetFalen("設計流量 50 m³/s", vervang(twBoxCulvert, "Q_design = 12.00'm^3/s", "Q_design = 50.00'm^3/s"), "UC_Q");
moetFalen("容許承載力 40 kN/m²", vervang(twBoxCulvert, "qa_allow = 220.0'kN/m^2", "qa_allow = 40.0'kN/m^2"), "UC_bearing");
moetFalen("頂版鋼筋間距 300 mm", vervang(twBoxCulvert, "s_top = 150'mm", "s_top = 300'mm"), "UC_s_top");
moetFalen("加腋 0.10 m", vervang(twBoxCulvert, "c_chamfer = 0.20'm", "c_chamfer = 0.10'm"), "UC_chamfer");
moetFalen("頂版厚 0.25 m（剪力不足）", vervang(twBoxCulvert, "t_top = 0.35'm", "t_top = 0.25'm"), "UC_V_top");
moetFalen(
  "淺覆土高水位（抗浮不足）",
  vervang(vervang(twBoxCulvert, "H_cover = 1.00'm", "H_cover = 0.70'm"), "H_gw = 1.50'm", "H_gw = 0.00'm"),
  "UC_float",
);
{
  // φ = 60°：K0·γ = 2.55 kN/m³ < 4.7 kN/m³，側壓由最小流體壓力控制
  const { uit } = draai(vervang(twBoxCulvert, "phi_deg = 30'deg", "phi_deg = 60'deg"), true);
  checkNabij("φ=60° p_soil,top", uit.p_soil_top_calc, 4.7 * 1.175, 1e-9);
}
{
  // 不合格結尾行不得被讀成合格
  const { res } = draai(vervang(twBoxCulvert, "Q_design = 12.00'm^3/s", "Q_design = 50.00'm^3/s"));
  meld(res.voldoet === false && res.uc > 1, "「不合格」結尾行不會被判成合格");
}

console.log(fouten === 0 ? "\n全部通過。" : `\n${fouten} 項失敗。`);
process.exit(fouten === 0 ? 0 : 1);
