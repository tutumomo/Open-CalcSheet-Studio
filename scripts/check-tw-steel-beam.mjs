/**
 * 台灣規範 steel99 熱軋 H 型鋼梁模組檢核（tw-steel-beam）
 *
 * 依據內政部《鋼構造建築物鋼結構設計技術規範》（99年9月16日版，steel99）第（二）篇極限設計法（LRFD）
 * 檢核熱軋 H 型鋼梁的局部挫屈分類、側向扭轉挫屈（LTB）、剪力強度、撓度與結尾行。
 *
 * 核對方式（三層）：
 * 1. 「釘死值」：以已驗證庫 regs_formula（steel99_Lp_I、steel99_Lr_I、steel99_Mn_lateral）對同一組輸入
 *    算出的結果，逐項寫入本檔（來源見各段註解）。
 * 2. 手算：Mp、Mr、Vn、撓度等可直接心算驗證的項目。
 * 3. 第二套獨立求解器：以 SI 單位（N、mm、MPa）重寫全部公式，
 *    並用另一種等價形式（Mcr 以 X1／X2 表示）計算彈性 LTB，對 20 種斷面 × 2 種鋼材 × 多種 Lb 掃描比對。
 *    模板內部用 tf/cm²，兩者單位制不同，不會互相抄寫。
 *
 * 規範式（steel99）：
 *   E = 2040 tf/cm²、G = 810 tf/cm²（1.7）；Fr = 0.7 tf/cm²（表 4.5-1 註）；1 tf/cm² = 98.0665 MPa
 *   表 4.5-1：翼板 λp = 17/√Fy；腹板 λp = 170/√Fy（Fy 單位 tf/cm²）
 *   7.2.2：Lp = 80·ry/√Fyf；Lr = ry·X1/FL·√(1+√(1+X2·FL²))；X1 = π/Sx·√(EGJA/2)；X2 = 4(Cw/Iy)(Sx/GJ)²
 *   7.2.3：Mcr = Cb·π/Lb·√(E·Iy·G·J + (πE/Lb)²·Iy·Cw)（解說：Mcr 亦可寫成 X1／X2 形式，本檔用作第二種算法）
 *   7.3.2：kv = 5；h/tw ≤ 50√(kv/Fy)：Vn = 0.6·Fy·Aw；其上至 62√(kv/Fy)：Vn = 0.6·Fy·Aw·50√(kv/Fy)/(h/tw)
 *
 * J、Cw 為薄壁開口斷面閉合式推算（略去角隅圓角），本檔以不同寫法獨立重算，並非取自 CNS 1490 表。
 *
 * 執行：node scripts/check-tw-steel-beam.mjs
 */

import { parse, evaluate, render } from "../packages/core/dist/index.js";
import { laadTemplate } from "./lib/refcheck.mjs";

const { leesResultaat, leesGetallen } = await import("../packages/desktop/src/components/calc/bladLezen.ts");
const { TW_PROFIELEN } = await import("../packages/desktop/src/components/calc/twProfielen.ts");

const tpl = laadTemplate("tw-steel-beam.ts");

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

/** 預設輸入全部取模板預設值（?{…}、@select 第一項）；waarden 以字串覆寫。 */
function doorreken(waarden = {}, scope = {}) {
  const nodes = evaluate(parse(tpl), { ...waarden }, scope);
  const html = render(nodes);
  const tekst = html.replace(/<annotation[\s\S]*?<\/annotation>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return { uit: leesGetallen(nodes), tekst, html, r: leesResultaat(nodes, "tw-steel-beam"), nodes };
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
      console.error(`  FOUT   ${k.padEnd(12)} 計算 ${String(actueel).padStart(12)}   預期 ${v} (rel ${relDiff.toExponential(2)})`);
    } else if (!stil) {
      console.log(`  OK     ${k.padEnd(12)} 計算 ${String(actueel).padStart(12)}   預期 ${v}`);
    }
  }
}

function geenFouten(r, label = "berekening") {
  const signaal = ["Error", "Undefined symbol", "NaN", "niet gedefinieerd", "Unexpected type", "Infinity"].find((s) => r.tekst.includes(s));
  waar(`${label}: 無錯誤訊息或 NaN`, !signaal, signaal ? r.tekst.slice(Math.max(0, r.tekst.indexOf(signaal) - 60), r.tekst.indexOf(signaal) + 60) : "");
}

const voldoet = (r) => r.r.voldoet === true && r.r.uc !== null && r.r.uc <= 1.0 && !r.r.nietGetoetst && r.tekst.includes("鋼梁檢核合格") && !r.tekst.includes("鋼梁檢核不合格");
const voldoetNiet = (r) => r.r.voldoet === false && r.r.uc !== null && r.r.uc > 1.0 && !r.r.nietGetoetst && r.tekst.includes("鋼梁檢核不合格");
const nietGetoetst = (r) => r.r.voldoet === null && r.r.nietGetoetst === true && r.tekst.includes("未檢核");

// -----------------------------------------------------------------------------
// 第二套獨立求解器（SI：N、mm、MPa；與模板的 tf/cm² 單位制不同）
// -----------------------------------------------------------------------------
const TF = 98.0665; // MPa per (tf/cm²)
const ru = (u) => Math.ceil(u * 100) / 100; // 與模板 ru() 一致：UC 無條件進位到小數 2 位

function onafhankelijk({ sec, fyMPa, Lb_m, span_m = 6, Cb = 1, Mu = 220, Vu = 150, wL = 15, nDelta = 360 }) {
  const E = 2040 * TF; // MPa
  const G = 810 * TF;
  const Fr = 0.7 * TF;
  const Fy = fyMPa;
  const FL = Fy - Fr;
  const FyT = Fy / TF; // tf/cm²，僅供規範式中「Fy 以 tf/cm² 代入」的係數使用

  // 斷面（取自 CNS 1490 表，cm 系 → mm 系）
  const h = sec.h, b = sec.b, tw = sec.tw, tf = sec.tf;
  const A = sec.A * 100; // mm²
  const Sx = sec.Wx * 1e3;
  const Zx = sec.Zx * 1e3;
  const Iy = sec.Iy * 1e4;
  const Ix = sec.Ix * 1e4;
  const ry = sec.iy * 10;

  // 薄壁開口斷面閉合式（略去角隅圓角）：兩片翼板＋一片腹板
  const hw = h - 2 * tf;
  const J = (2 * (b * tf ** 3) / 3) + (hw * tw ** 3) / 3;
  // Cw = Iy(翼板)·(h−tf)²/4，Iy(翼板) = 2·tf·b³/12（雙對稱 I 型薄壁）
  const IyFlanges = 2 * (tf * b ** 3) / 12;
  const Cw = (IyFlanges * (h - tf) ** 2) / 4;

  // 局部挫屈分類（表 4.5-1）
  const lamF = b / (2 * tf);
  const lamPF = 17 / Math.sqrt(FyT);
  const lamW = hw / tw;
  const lamPW = 170 / Math.sqrt(FyT);
  const compact = lamF <= lamPF && lamW <= lamPW;

  // 側向扭轉挫屈
  const Mp = Fy * Zx; // N·mm
  const Mr = FL * Sx;
  const Lp = 80 * ry / Math.sqrt(FyT); // mm
  const X1 = (Math.PI / Sx) * Math.sqrt((E * G * J * A) / 2);
  const X2 = 4 * (Cw / Iy) * (Sx / (G * J)) ** 2;
  const Lr = (ry * X1 / FL) * Math.sqrt(1 + Math.sqrt(1 + X2 * FL ** 2));
  const Lb = Lb_m * 1000;

  // 彈性 LTB 的兩種等價寫法（7.2-11 與 X1／X2 形式），內部互相印證
  const McrDirect = (Math.PI / Lb) * Math.sqrt(E * Iy * G * J + (Math.PI * E / Lb) ** 2 * Iy * Cw); // Cb = 1
  // X1／X2 形式與直接式只在 ry = √(Iy/A) 時嚴格等價；CNS 表列 ry 為四捨五入值，故此處用 √(Iy/A) 做等價性自檢
  const slender = Lb / Math.sqrt(Iy / A);
  const McrX = (Sx * X1 * Math.SQRT2 / slender) * Math.sqrt(1 + (X1 ** 2 * X2) / (2 * slender ** 2));

  let zone, Mn;
  if (Lb <= Lp) { zone = 1; Mn = Mp; }
  else if (Lb <= Lr) { zone = 2; Mn = Math.min(Mp, Cb * (Mp - (Mp - Mr) * (Lb - Lp) / (Lr - Lp))); }
  else { zone = 3; Mn = Math.min(Mp, Cb * McrDirect); }
  const phiMn = 0.9 * Mn / 1e6; // kN·m

  // 剪力（7.3.1、7.3.2，kv = 5）
  const Aw = h * tw; // mm²
  const kv = 5;
  const lim1 = 50 * Math.sqrt(kv / FyT);
  const lim2 = 62 * Math.sqrt(kv / FyT);
  const htw = hw / tw;
  const Vn0 = (0.6 * Fy * Aw) / 1e3; // kN（MPa × mm² = N）
  // 7.3-3 原式為 tf、cm²：Vn = 1860·kv·Aw[cm²]/(h/tw)² tf，換算 kN 乘 9.80665
  const Vn = htw <= lim1 ? Vn0 : htw <= lim2 ? Vn0 * lim1 / htw : (1860 * kv * (Aw / 100) / htw ** 2) * 9.80665; // kN
  const phiVn = 0.9 * Vn;

  // 撓度：簡支均布 5wL⁴/(384EI)，w：N/mm（= kN/m）
  const L = span_m * 1000;
  const Delta = (5 * wL * L ** 4) / (384 * E * Ix);
  const DeltaLim = L / nDelta;

  const UC_M = Mu / phiMn;
  const UC_V = Vu / phiVn;
  const UC_delta = Delta / DeltaLim;
  const UC_load = Math.max(UC_M, UC_V, UC_delta);
  const UC_max = ru(compact ? UC_load : Math.max(UC_load, 1.05));

  return {
    FL, J: J / 1e4, Cw: Cw / 1e6, lamF, lamPF, lamW, lamPW, compact, zone,
    Mp: Mp / 1e6, Mr: Mr / 1e6, Lp: Lp / 1000, Lr: Lr / 1000,
    McrDirect, McrX, Mn: Mn / 1e6, phiMn, Vn, phiVn, Delta, DeltaLim,
    UC_M, UC_V, UC_delta, UC_max, ok: compact && UC_load <= 1.0,
  };
}

console.log("================================================================================");
console.log("台灣規範 steel99 熱軋 H 型鋼梁模組檢核（tw-steel-beam）");
console.log("================================================================================");

const RH400 = TW_PROFIELEN.find((p) => p.naam === "RH 400x200x8x13");

// -----------------------------------------------------------------------------
// 0. 獨立求解器自我檢核（Mcr 兩種等價寫法一致）
// -----------------------------------------------------------------------------
console.log("\n0. 獨立求解器自我檢核（7.2-11 直接式 ≡ X1／X2 形式）");
{
  for (const Lb of [6, 8, 12]) {
    const s = onafhankelijk({ sec: RH400, fyMPa: 325, Lb_m: Lb, span_m: Lb });
    waar(`Lb = ${Lb} m：Mcr 兩種算法相對差 < 1e-9`, Math.abs(s.McrDirect - s.McrX) / s.McrDirect < 1e-9, `${s.McrDirect} vs ${s.McrX}`);
  }
}

// -----------------------------------------------------------------------------
// 1. 材料常數與斷面（預設：Fy = 325 MPa，RH 400x200x8x13）
// -----------------------------------------------------------------------------
console.log("\n1. 材料常數與斷面核對（預設 Fy = 325 MPa，RH 400x200x8x13）");
{
  const r = doorreken({});
  geenFouten(r, "預設案例");
  // E = 2040 tf/cm² × 98.0665 = 200055.66 MPa；G = 810 × 98.0665 = 79433.865 MPa；FL = 325 − 0.7×98.0665 = 256.35345 MPa
  // J = (2·200·13³ + 374·8³)/3 = 356762.667 mm⁴ = 35.676267 cm⁴
  // Cw = 13·200³·387²/24 = 6.48999e11 mm⁶ = 648999 cm⁶
  toets(r, {
    f_y: 325, E_s: 200055.66, G_s: 79433.865, F_L: 256.35345,
    h: 400, b: 200, t_w: 8, t_f: 13, A: 84.1, I_x: 23700, W_x: 1190, Z_x: 1330, i_x: 16.8,
    I_y: 1740, W_y: 174, Z_y: 269, i_y: 4.54, w: 66,
    J: 35.676266667, C_w: 648999,
  }, 1e-6);
}

// -----------------------------------------------------------------------------
// 2. 局部挫屈分類（表 4.5-1）手算
// -----------------------------------------------------------------------------
console.log("\n2. 局部挫屈分類（表 4.5-1）");
{
  // Fy = 325 MPa → 3.314078 tf/cm²，√ = 1.820461
  // λf = 200/26 = 7.692308；λp = 17/1.820461 = 9.338295；λr = 37/√2.614078 = 37/1.616811 = 22.88456
  // λw = 374/8 = 46.75；λpw = 170/1.820461 = 93.38295；λrw = 260/1.820461 = 142.82098
  const r = doorreken({});
  toets(r, {
    lambda_f: 7.692308, lambda_pf: 9.338295, lambda_rf: 22.88456,
    lambda_w: 46.75, lambda_pw: 93.38295, lambda_rw: 142.82098,
    is_compact: 1,
  }, 1e-5);
}

// -----------------------------------------------------------------------------
// 3. LTB 釘死值（已驗證庫 regs_formula 對同輸入之結果）與手算
// -----------------------------------------------------------------------------
console.log("\n3. 側向扭轉挫屈釘死值（Fy = 325 MPa，Cb = 1.0）");
{
  // regs_formula：steel99_Lp_I(ry=4.54, Fyf=3.3140776921782664) = 199.51 cm
  //               steel99_Lr_I(…, FL=2.6140776921782667) = 524.377 cm（X1=131.441711、X2=2.529996、Mr=3110.752454 tf·cm）
  // Mp = 3.3140777×1330 = 4407.7233 tf·cm = 432.25 kN·m；Mr = 3110.752454 tf·cm × 0.0980665 = 305.0606 kN·m
  // Lb = 3.0 m（Lp < Lb ≤ Lr）：
  //   Mn = 432.25 − (432.25 − 305.0606)×(300 − 199.51)/(524.377 − 199.51) = 392.9069 kN·m；ϕbMn = 353.6162 kN·m
  const r = doorreken({});
  toets(r, {
    M_p: 432.25, M_r: 305.0606, L_p: 1.9951, L_r: 5.24377,
    M_n: 392.9069, phiM_n: 353.6162, UC_M: 220 / 353.6162,
  }, 2e-5);
}

console.log("\n3b. 側向扭轉挫屈釘死值（Fy = 245 MPa，Cb = 1.0）");
{
  // regs_formula：Lp = 229.786 cm；Lr = 666.171 cm（Mr = 2139.982619 tf·cm = 209.8606 kN·m）
  // Mp = 2.4983047×1330 = 3322.7 tf·cm = 325.85 kN·m
  // Lb = 300 cm：Mn = 325.85 − (325.85 − 209.8606)×(300 − 229.786)/(666.171 − 229.786) = 307.1874 kN·m
  // ϕbMn = 276.4686 kN·m；UC_M = 220/276.4686 = 0.79574
  const r = doorreken({ f_y_in: "245" });
  geenFouten(r, "Fy = 245 MPa");
  toets(r, {
    f_y: 245, M_p: 325.85, M_r: 209.8606, L_p: 2.29786, L_r: 6.66171,
    M_n: 307.1874, phiM_n: 276.4686, UC_M: 220 / 276.4686,
    V_n: 470.4, phiV_n: 423.36, UC_V: 150 / 423.36,
  }, 2e-5);
  waar("Fy = 245 MPa：全部檢核合格", voldoet(r));
}

// -----------------------------------------------------------------------------
// 4. 剪力、撓度手算
// -----------------------------------------------------------------------------
console.log("\n4. 剪力與撓度手算（預設案例）");
{
  // Aw = 40 cm × 0.8 cm = 32 cm²；h/tw = 46.75 ≤ 50√(5/3.314078) = 61.415 → Vn = 0.6×3.314078×32 tf = 63.6303 tf = 624.0 kN
  // ϕvVn = 561.6 kN；UC_V = 150/561.6 = 0.267094
  // Δ = 5×15 N/mm×6000⁴/(384×200055.66×2.37e8) = 5.33870 mm；Δallow = 6000/360 = 16.6667 mm
  const r = doorreken({});
  toets(r, {
    A_w: 32, htw_ratio: 46.75, lim_v1: 61.41489, V_n: 624, phiV_n: 561.6, UC_V: 150 / 561.6,
    Delta: 5.33870, Delta_lim: 16.666667, UC_delta: 5.33870 / 16.666667,
  }, 1e-4);
}

// -----------------------------------------------------------------------------
// 5. 端到端基準案例（三個 LTB 區段）
// -----------------------------------------------------------------------------
console.log("\n5. 端到端基準案例");
{
  console.log("  5.1 區域 II（Lb = 3.0 m，非彈性 LTB）：UC_max = ceil(0.62214×100)/100 = 0.63");
  const r1 = doorreken({});
  toets(r1, { UC_max: 0.63 }, 1e-9);
  waar("區域 II：檢核合格", voldoet(r1));
  waar("區域 II：leesResultaat 的 UC = 0.63", Math.abs(r1.r.uc - 0.63) < 1e-9);

  console.log("  5.2 區域 I（Lb = 1.5 m ≤ Lp = 1.995 m）：Mn = Mp");
  // ϕbMp = 0.9×432.25 = 389.025 kN·m；UC_M = 220/389.025 = 0.565516
  const r2 = doorreken({ L_b: "1.5" });
  toets(r2, { M_n: 432.25, phiM_n: 389.025, UC_M: 220 / 389.025, UC_max: 0.57 }, 1e-6);
  waar("區域 I：檢核合格", voldoet(r2));

  console.log("  5.3 區域 III（Lb = 7.0 m > Lr = 5.244 m，彈性 LTB），跨度 8 m、Mu = 100 kN·m");
  // Mcr = π/700×√(2040×1740×810×35.676267 + (π×2040/700)²×1740×648999) tf·cm
  //     = 1993.0 tf·cm（約）→ ×0.0980665 = 195.4622 kN·m（與獨立求解器 7.2-11 及 X1／X2 形式一致）
  const r3 = doorreken({ L_span: "8", L_b: "7", M_u: "100" });
  geenFouten(r3, "區域 III");
  toets(r3, { M_n: 195.46225, phiM_n: 175.91602, UC_M: 100 / 175.91602 }, 2e-6);
  waar("區域 III：Lb > Lr", r3.uit.L_b > r3.uit.L_r);
  waar("區域 III：Mn < Mr（彈性挫屈強度低於降伏界限彎矩）", r3.uit.M_n < r3.uit.M_r);
  waar("區域 III：檢核合格", voldoet(r3));

  console.log("  5.4 Cb = 1.3（均勻彎矩以外）於區域 II：Mn = min(Mp, Cb×[…])");
  // 括號內 = 392.9069 kN·m（Cb=1），×1.3 = 510.8 > Mp → Mn = Mp = 432.25 kN·m
  const r4 = doorreken({ C_b: "1.3" });
  toets(r4, { M_n: 432.25 }, 1e-6);
}

// -----------------------------------------------------------------------------
// 6. 斷面分類與負面測試（超限絕不誤判合格）
// -----------------------------------------------------------------------------
console.log("\n6. 負面測試（超限絕不誤判合格）");
{
  // 6.1 彎矩超限：Mu = 400 > ϕbMn = 353.6 → UC_M = 1.1312
  const r1 = doorreken({ M_u: "400" });
  waar("彎矩超限判為不合格", voldoetNiet(r1));
  waar("彎矩超限：UC_M ≈ 400/353.6162", Math.abs(r1.uit.UC_M - 400 / 353.6162) < 1e-4);

  // 6.2 剪力超限：Vu = 700 > ϕvVn = 561.6
  const r2 = doorreken({ V_u: "700" });
  waar("剪力超限判為不合格", voldoetNiet(r2));

  // 6.3 撓度超限：wL = 60 kN/m → Δ = 21.355 mm > 16.667 mm
  const r3 = doorreken({ w_L: "60" });
  waar("撓度超限判為不合格", voldoetNiet(r3));
  waar("撓度超限：Δ ≈ 21.3548 mm", Math.abs(r3.uit.Delta - 21.3548) < 1e-3);

  // 6.4 非結實斷面：RH 300x300x10x15，λf = 300/30 = 10
  //     Fy = 325 MPa：λp = 9.3383 → 非結實（即使載重極小也不得判合格）；Fy = 245 MPa：λp = 10.7554 → 結實
  const rNc = doorreken({ section_id: "7", M_u: "10", V_u: "10", w_L: "1" });
  toets(rNc, { lambda_f: 10, lambda_pf: 9.338295, is_compact: 0 }, 1e-5);
  waar("非結實斷面（Fy = 325）：載重極小仍判為不合格", voldoetNiet(rNc));
  waar("非結實斷面：UC 取不小於 1.05", rNc.r.uc >= 1.05 - 1e-9);
  const rC = doorreken({ section_id: "7", f_y_in: "245", M_u: "10", V_u: "10", w_L: "1" });
  toets(rC, { lambda_pf: 10.75541, is_compact: 1 }, 1e-5);
  waar("同一斷面 Fy = 245（結實）：判為合格", voldoet(rC));
}

// -----------------------------------------------------------------------------
// 7. 剪力第二段（7.3-2）：RH 900x300x16x28 於 Fy = 446 MPa
// -----------------------------------------------------------------------------
console.log("\n7. 剪力 7.3-2 區段（RH 900x300x16x28，Fy = 446 MPa = 4.548 tf/cm²）");
{
  // h/tw = 844/16 = 52.75 > 50√(5/4.54795) = 52.426（降伏上限）且 ≤ 62√(5/4.54795) = 65.0 → 7.3-2
  const sec = TW_PROFIELEN.find((p) => p.naam === "RH 900x300x16x28");
  const s = onafhankelijk({ sec, fyMPa: 446, Lb_m: 3 });
  const r = doorreken({ section_id: "20", f_y_in: "446" });
  geenFouten(r, "7.3-2 區段");
  waar("確實落在 7.3-2 區段（Vn < 0.6·Fy·Aw）", r.uit.V_n < 0.6 * 446 * (900 * 16) / 1e3 - 1, `Vn = ${r.uit.V_n}`);
  toets(r, { V_n: s.Vn, phiV_n: s.phiVn }, 1e-6);
  // 手算：Vn = 0.6×446×14400 N × (52.426/52.75) = 3853.4 kN × 0.99386 = 3829.7 kN（見獨立求解器）
  waar("獨立求解器 Vn 與手算 3829.7 kN 相符（±0.2%）", Math.abs(s.Vn - 3829.7) / 3829.7 < 2e-3, `Vn = ${s.Vn}`);
  // 7.3-3（h/tw > 62√(kv/Fy)）：表內最大 h/tw = 52.75，需 Fy 超出 4.55 tf/cm² 才可能出現，模組無法觸發，故不於模板測試
}

// -----------------------------------------------------------------------------
// 8. 無效輸入與防護網（絕不可誤判合格）
// -----------------------------------------------------------------------------
console.log("\n8. 無效輸入與防護網");
{
  const 案例 = [
    ["跨度為 0", { L_span: "0" }],
    ["跨度為負", { L_span: "-2" }],
    ["側撐長度大於跨度", { L_span: "5", L_b: "6" }],
    ["側撐長度為負", { L_b: "-1" }],
    ["Fy 低於範圍（100 MPa = 1.02 tf/cm²）", { f_y_in: "100" }],
    ["Fy 高於範圍（500 MPa = 5.10 tf/cm²）", { f_y_in: "500" }],
    ["Cb < 1.0", { C_b: "0.9" }],
    ["Cb > 2.3", { C_b: "2.5" }],
  ];
  for (const [名稱, 輸入] of 案例) {
    const r = doorreken(輸入);
    waar(`${名稱}：標示未檢核且不判為合格`, nietGetoetst(r) && r.r.voldoet !== true);
  }
}

// -----------------------------------------------------------------------------
// 9. 結尾行解析（leesResultaat）
// -----------------------------------------------------------------------------
console.log("\n9. 報告結尾行解析");
{
  const rOk = doorreken({});
  waar("合格案例解析為 true", rOk.r.voldoet === true);
  waar("合格案例 UC ≤ 1.0", typeof rOk.r.uc === "number" && rOk.r.uc <= 1.0);
  const rNok = doorreken({ M_u: "400" });
  waar("不合格案例解析為 false（「不合格」不被判成合格）", rNok.r.voldoet === false);
  waar("不合格案例 UC > 1.0", typeof rNok.r.uc === "number" && rNok.r.uc > 1.0);
  const rInvalid = doorreken({ L_span: "-2" });
  waar("無效輸入解析為未檢核", rInvalid.r.nietGetoetst === true && rInvalid.r.voldoet === null);
}

// -----------------------------------------------------------------------------
// 10. 第二套獨立求解器掃描：20 種斷面 × 2 種鋼材 × 多種 Lb（Cb = 1.0；另掃 Cb = 1.3）
// -----------------------------------------------------------------------------
console.log("\n10. 第二套獨立求解器掃描（SI 單位、Mcr 兩種算法）");
{
  let 組數 = 0;
  let 區段 = { 1: 0, 2: 0, 3: 0 };
  let 非結實 = 0;
  const 舊 = fouten;
  for (const sec of TW_PROFIELEN) {
    for (const fyMPa of [245, 325]) {
      for (const [Lb_m, Cb] of [[0.5, 1], [1.5, 1], [3, 1], [3, 1.3], [5, 1], [7, 1], [10, 1], [14, 1]]) {
        const span_m = Math.max(6, Lb_m);
        const s = onafhankelijk({ sec, fyMPa, Lb_m, span_m, Cb });
        const r = doorreken({
          section_id: String(sec.id), f_y_in: String(fyMPa), L_b: String(Lb_m), L_span: String(span_m), C_b: String(Cb),
        });
        組數++;
        區段[s.zone]++;
        if (!s.compact) 非結實++;
        const 標籤 = `${sec.naam} Fy=${fyMPa} Lb=${Lb_m} Cb=${Cb}`;
        // 避開剛好落在區段邊界造成的判定差異
        const 邊界 = Math.abs(Lb_m - s.Lp) < 1e-6 || Math.abs(Lb_m - s.Lr) < 1e-6;
        waar(`${標籤}：未報錯`, !["NaN", "Error", "Infinity"].some((t) => r.tekst.includes(t)));
        toets(r, {
          J: s.J, C_w: s.Cw, M_p: s.Mp, M_r: s.Mr, L_p: s.Lp, L_r: s.Lr,
          ...(邊界 ? {} : { M_n: s.Mn, phiM_n: s.phiMn, UC_M: s.UC_M }),
          V_n: s.Vn, phiV_n: s.phiVn, Delta: s.Delta, Delta_lim: s.DeltaLim,
          lambda_f: s.lamF, lambda_pf: s.lamPF, lambda_w: s.lamW, lambda_pw: s.lamPW,
          is_compact: s.compact ? 1 : 0, UC_max: s.UC_max,
        }, 1e-6, true);
        if (r.r.voldoet !== null) {
          waar(`${標籤}：合格判定一致（獨立 ${s.ok ? "合格" : "不合格"}）`, r.r.voldoet === s.ok);
        }
      }
    }
  }
  console.log(`   掃描 ${組數} 組；LTB 區段分佈 I:${區段[1]} II:${區段[2]} III:${區段[3]}；非結實 ${非結實} 組`);
  waar("掃描涵蓋區域 I、II、III 三個區段", 區段[1] > 0 && 區段[2] > 0 && 區段[3] > 0);
  waar("掃描涵蓋非結實斷面", 非結實 > 0);
  console.log(`   掃描本身新增失敗：${fouten - 舊} 項`);
}


// ─────────────────────────────────────────────────────────────────────────────
// ASD（容許應力設計法，steel99 第（一）篇；design_method = 2）
// 釘死值（regs_formula，A 級）：
//   steel99_Fb_compact：Fb = 0.66Fy；steel99_Lc：Lc = min(20bf/√Fy, 1400/((d/Af)Fy))
//   steel99_web_shear_Fv_75(Fy=3.31406, hw=70, a_h=1000) = 1.03974 tf/cm²（式 7.5-2，Cv = 0.906698）
// 手算（RH400×200×8×13、Fy = 325 MPa = 3.31406 tf/cm²）：Lc = min(219.72, 274.6) cm = 2.1972 m；
//   fb = 220e6/1190e3 = 184.874 MPa，Fb = 214.5 MPa；(h/tw)√Fy = 46.75·1.8205 = 85.1 ≤ 100 → Fv = 130 MPa，
//   fv = 150e3/(400·8) = 46.875 MPa。
// 獨立求解器：SI（N、mm、MPa）重寫，Lc 改以 mm 與 MPa 換算常數表示。
// ─────────────────────────────────────────────────────────────────────────────
console.log("\nASD（容許應力設計法）");
function asdRef(p, fyMPa, Lb_m, M = 220, V = 150) {
  const Fy = fyMPa / 98.0665; // tf/cm²
  const Lc_mm = Math.min((20 * p.b) / Math.sqrt(Fy), (1400 * 10 * (p.b * p.tf)) / (p.h * Fy)); // 20bf/√Fy（cm→mm 互消），1400·Af/(d·Fy)·10
  const hw = (p.h - 2 * p.tf) / p.tw;
  const compact = p.b / (2 * p.tf) <= 17 / Math.sqrt(Fy) && hw <= 170 / Math.sqrt(Fy);
  const Fb = 0.66 * fyMPa;
  const fb = (M * 1e6) / (p.Wx * 1e3);
  const Kv = 5.34;
  let Cv = (3100 * Kv) / (Fy * hw * hw);
  if (Cv > 0.8) Cv = (50 * Math.sqrt(Kv / Fy)) / hw;
  const v1 = hw * Math.sqrt(Fy) <= 100;
  const Fv = v1 ? 0.4 * fyMPa : Math.min((fyMPa * Cv) / 2.89, 0.4 * fyMPa);
  const fv = (V * 1e3) / ((v1 ? p.h : p.h - 2 * p.tf) * p.tw);
  return { Lc: Lc_mm / 1000, valid: Lb_m <= Lc_mm / 1000 && hw <= 260, compact, ucM: fb / Fb, ucV: fv / Fv, Fb, fb, Fv, fv };
}
{
  const r = doorreken({ design_method: "2", L_b: "2.0" });
  geenFouten(r, "ASD 預設");
  toets(r, { L_c: 2.1972458, F_b: 214.5, f_b: 184.8739496, F_v: 130, f_v: 46.875 }, 1e-6);
  waar("ASD 預設 → 合格且 UC 與 fb/Fb 一致", r.r.voldoet === true && Math.abs(r.r.uc - Math.ceil(Math.max(r.uit.UC_M, r.uit.UC_V, r.uit.UC_delta) * 100) / 100) < 1e-9);
  // 釘死 Fv 式 7.5-2（regs_formula：1.03974 tf/cm² at Fy=3.31406, h/tw=70）
  const Fy = 325 / 98.0665, hw = 70;
  let Cv = (3100 * 5.34) / (Fy * hw * hw); if (Cv > 0.8) Cv = (50 * Math.sqrt(5.34 / Fy)) / hw;
  waar("獨立式 7.5-2 對已驗證值 1.03974 tf/cm²", Math.abs((Fy * Cv) / 2.89 - 1.03974) < 1e-4, String((Fy * Cv) / 2.89));
}
{
  let n = 0, bad = 0, pass = 0, fail = 0, rej = 0;
  for (const p of TW_PROFIELEN) {
    if (!p.naam.startsWith("RH")) continue;
    for (const fy of [235, 325, 345])
      for (const Lb of [0.5, 1.5, 2.5])
        for (const [M, V] of [[40, 30], [220, 150], [600, 400]]) {
          const e = asdRef(p, fy, Lb, M, V);
          const r = doorreken({ design_method: "2", section_id: String(p.id), f_y_in: String(fy), L_b: String(Lb), M_u: String(M), V_u: String(V) });
          n++;
          if (!e.valid) { rej++; if (!(r.r.nietGetoetst === true && r.r.voldoet !== true)) bad++; continue; }
          const ok = Math.abs(r.uit.UC_M - e.ucM) < 1e-6 * Math.max(1, e.ucM) && Math.abs(r.uit.UC_V - e.ucV) < 1e-6 * Math.max(1, e.ucV);
          const want = e.compact && Math.max(e.ucM, e.ucV, r.uit.UC_delta) <= 1;
          if (!ok || r.r.voldoet !== want) bad++;
          want ? pass++ : fail++;
        }
  }
  waar(`ASD 掃描 ${n} 組與獨立求解器一致（合格 ${pass}、不合格 ${fail}、拒算 ${rej}）`, bad === 0 && pass > 10 && fail > 10 && rej > 10, `${bad} 組不符`);
}
for (const [名, w] of [
  ["ASD 彎矩過大", { design_method: "2", L_b: "2.0", M_u: "300" }],
  ["ASD 剪力過大", { design_method: "2", L_b: "2.0", V_u: "500" }],
  ["ASD 非結實翼板（RH 400x400、Fy 440）不得誤判", { design_method: "2", section_id: "9", f_y_in: "440", L_b: "1.0", M_u: "50" }],
]) {
  const r = doorreken(w);
  waar(`${名} → 不合格`, r.r.voldoet === false && r.r.uc > 1, JSON.stringify(r.r));
}
for (const [名, w] of [
  ["ASD Lb > Lc（7.2.3 未入庫）", { design_method: "2", L_b: "3.0" }],
  ["設計法代碼無效", { design_method: "3" }],
]) {
  const r = doorreken(w);
  waar(`${名} → 拒算`, r.r.nietGetoetst === true && r.r.voldoet !== true && r.uit.UC_max === undefined);
}

console.log("--------------------------------------------------------------------------------");
console.log(`檢核結果：共 ${getest} 項檢查，${fouten} 項失敗。`);
console.log("--------------------------------------------------------------------------------");

if (fouten > 0) {
  process.exit(1);
}
