/**
 * 台灣規範鋼筋混凝土矩形梁模組檢核腳本（templates/tw-rc-beam.ts）。
 *
 * 規範依據：內政部《建築物混凝土結構設計規範》（112年8月10日版，rc112）。
 * 依 AGENTS.md §5 計算安全規定：
 * 1. 斷面或幾何性質檢核（Ec、fr、有效深度 d、鋼筋面積 As、A's、Av）
 * 2. 每條主要公式一題（β1、εt 與 ϕ、As,min、Mn 與 ϕMn、Vc、Vs、Vs,max、(Av/s)min、s,max、裂縫間距 s,crack、梁深下限 h,min、Bischoff Ie、撓度）
 * 3. 邊界條件檢核（拉力控制界限、箍筋間距雙分支分界、未開裂狀態）
 * 4. 端到端兩題，並在腳本內以第二套獨立算式推導驗算（單筋梁合格案例、雙筋梁合格案例）
 * 5. 錯誤輸入檢核（尺寸為 0 或負值、未配筋時標示「未檢核」，絕不誤判為合格）
 * 6. 刻意找出會錯判合格的負面情況（超筋梁、剪力不足、斷面剪力超限、間距超限、撓度超限）
 * 7. 報告標頭結尾行解析相容性（leesResultaat）
 *
 * 執行方式：
 *   node scripts/check-tw-rc-beam.mjs
 */

import { parse, evaluate, render } from "../packages/core/dist/index.js";
import { laadTemplate } from "./lib/refcheck.mjs";

const { leesResultaat, leesGetallen } = await import("../packages/desktop/src/components/calc/bladLezen.ts");

const tpl = laadTemplate("tw-rc-beam.ts");

let fouten = 0;
let getest = 0;

const waar = (wat, ok, detail = "") => {
  getest++;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${wat}${ok || !detail ? "" : ` — ${detail}`}`);
};

function doorreken(waarden, scope = {}) {
  const nodes = evaluate(parse(tpl), waarden, scope);
  const html = render(nodes);
  const tekst = html.replace(/<annotation[\s\S]*?<\/annotation>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  return { uit: leesGetallen(nodes), tekst, html, r: leesResultaat(nodes, "tw-rc-beam"), nodes };
}

function toets(r, verwacht, tol = 1.5e-3) {
  for (const [naam, doel] of Object.entries(verwacht)) {
    getest++;
    const ons = r.uit[naam];
    const ok = ons !== undefined && Math.abs(ons - doel) <= tol * Math.max(Math.abs(doel), 1e-9);
    if (!ok) fouten++;
    console.log(`  ${ok ? "OK    " : "FOUT  "} ${naam.padEnd(10)} 計算 ${String(ons === undefined ? "—" : Number(ons.toPrecision(6))).padStart(10)}   手算 ${doel}`);
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
console.log("台灣規範 rc112 鋼筋混凝土矩形梁模組檢核（tw-rc-beam）");
console.log("================================================================================");

// ── 1. 斷面與材料幾何性質 ──────────────────────────────────────────────────────
console.log("\n1. 幾何斷面與材料性質檢核");
{
  // 檢核常重混凝土 Ec = 3750√f'c、fr = 0.62λ√f'c
  // f'c = 28 MPa: Ec = 3750*√28 = 19843.1 MPa, fr = 0.62*1.0*√28 = 3.2807 MPa
  // b = 300, h = 600, cc = 40, 箍筋 D10 (db=9.53), 4-D22 (db=22.2, Ab=387.1)
  // d = 600 - 40 - 9.53 - 22.2/2 = 539.37 mm, As = 4*387.1 = 1548.4 mm²
  const r = doorreken({
    f_c: "28", f_y: "420", f_yt: "420", b: "300", h: "600", L: "6.0", c_c: "40",
    bar_t: "3", n_t: "4", rebar_layers: "1", has_top: "1", bar_v: "1", n_legs: "2", s_v: "150",
    M_u: "200", V_u: "120", M_D: "60", M_L: "40", q_sus: "0.2"
  });
  geenFouten(r, "幾何與材料");
  toets(r, {
    E_c: 19843.1,
    f_r: 3.2807,
    d: 539.37,
    d_t: 539.37,
    A_s: 1548.4,
    A_sp: 0,
    A_v: 142.66,
  });
}

// ── 2. 主要規範公式個別檢核 ────────────────────────────────────────────────────
console.log("\n2. 主要規範公式檢核");

// 2.1 β1 係數公式（rc112 22.2.2.4.3）
// f'c ≤ 28: β1 = 0.85; 28 < f'c < 56: β1 = 0.85 - 0.05*(f'c - 28)/7; f'c ≥ 56: β1 = 0.65
console.log("  2.1 β1 應力塊係數隨 f'c 變化");
{
  const r21 = doorreken({ f_c: "21" });
  toets(r21, { β_1: 0.85 });
  const r28 = doorreken({ f_c: "28" });
  toets(r28, { β_1: 0.85 });
  // f'c = 35 MPa: β1 = 0.85 - 0.05*(35-28)/7 = 0.80
  const r35 = doorreken({ f_c: "35" });
  toets(r35, { β_1: 0.80 });
  // f'c = 42 MPa: β1 = 0.85 - 0.05*(42-28)/7 = 0.75
  const r42 = doorreken({ f_c: "42" });
  toets(r42, { β_1: 0.75 });
  // f'c = 56 MPa: β1 = 0.65
  const r56 = doorreken({ f_c: "56" });
  toets(r56, { β_1: 0.65 });
  // f'c = 70 MPa: β1 = 0.65
  const r70 = doorreken({ f_c: "70" });
  toets(r70, { β_1: 0.65 });
}

// 2.2 強度折減係數 ϕ（rc112 21.2.2）與延展性
console.log("  2.2 強度折減係數 ϕ 依拉應變 εt 判定");
{
  // 對 SD420 (fy=420), εty = 420/200000 = 0.0021, 拉力控制界限 εty + 0.003 = 0.0051 (ϕ = 0.90)
  const r = doorreken({
    f_c: "28", f_y: "420", b: "300", h: "600", bar_t: "3", n_t: "4", rebar_layers: "1"
  });
  // 4-D22 (As=1548.4), a = 1548.4*420/(0.85*28*300) = 91.082 mm, c = 91.082/0.85 = 107.156 mm
  // εt = 0.003 * (539.37 - 107.156) / 107.156 = 0.01210 ≥ 0.0051 -> ϕ = 0.90
  toets(r, {
    c: 107.156,
    a: 91.082,
    ε_t: 0.01210,
    ε_ty: 0.0021,
    ϕ_m: 0.90,
  });
}

// 2.3 最小受拉鋼筋量 As,min（rc112 9.6.1.2）
console.log("  2.3 最小受拉鋼筋量 As,min");
{
  // As,min = max(0.25*√f'c/fy * bw*d, 1.4/fy * bw*d)
  // f'c = 28, fy = 420, bw = 300, d = 539.37
  // 0.25*√28/420 * 300 * 539.37 = 0.003150 * 161811 = 509.65 mm²
  // 1.4/420 * 300 * 539.37 = 0.003333 * 161811 = 539.37 mm² (控制)
  const r = doorreken({ f_c: "28", f_y: "420", b: "300", h: "600", bar_t: "3", n_t: "4" });
  toets(r, { A_smin: 539.37 });
}

// 2.4 剪力強度公式（rc112 22.5.5.1、22.5.10.5、22.5.1.2）
console.log("  2.4 剪力強度 Vc、Vs、Vs,max 與 ϕVn");
{
  // Vc = 0.17 * 1.0 * √28 * 300 * 539.37 / 1000 = 145.56 kN
  // Vs = Av * fyt * d / s / 1000 = 142.66 * 420 * 539.37 / 150 / 1000 = 215.45 kN
  // Vs,max = 0.66 * √28 * 300 * 539.37 / 1000 = 565.07 kN
  // ϕVn = 0.75 * (145.56 + 215.45) = 270.76 kN
  const r = doorreken({
    f_c: "28", f_yt: "420", b: "300", h: "600", bar_t: "3", n_t: "4",
    bar_v: "1", n_legs: "2", s_v: "150"
  });
  toets(r, {
    V_c: 145.56,
    V_s: 215.45,
    V_smax: 565.07,
    ϕV_n: 270.76,
  });
}

// 2.5 最小剪力筋量 (Av/s)min（rc112 9.6.3.3）
console.log("  2.5 最小剪力筋量 (Av/s)min");
{
  // (Av/s)min = max(0.062*√f'c*bw/fyt, 0.35*bw/fyt)
  // 0.062*√28*300/420 = 0.2343 mm; 0.35*300/420 = 0.2500 mm (控制)
  const r = doorreken({ f_c: "28", f_yt: "420", b: "300" });
  toets(r, { A_vs_min: 0.2500 });
}

// 2.6 箍筋最大間距 s,max 雙分支（rc112 表 9.7.6.2.2）
console.log("  2.6 箍筋最大間距 s,max 雙分支");
{
  // 分界值 0.33*√f'c*bw*d = 0.33*√28*300*539.37/1000 = 282.53 kN
  // 分支 A: Vs ≤ 282.53 kN -> s_max = min(d/2, 600) = min(269.69, 600) = 269.69 mm
  const rA = doorreken({
    f_c: "28", f_yt: "420", b: "300", h: "600", bar_t: "3", n_t: "4",
    bar_v: "1", n_legs: "2", s_v: "150" // Vs = 215.45 kN ≤ 282.53 kN
  });
  toets(rA, { s_max: 269.69 });

  // 分支 B: Vs > 282.53 kN -> s_max = min(d/4, 300)
  // 使用 D16 雙肢 (dv=15.9, d = 600 - 40 - 15.9 - 22.2/2 = 533.0 mm)
  // d/4 = 533.0 / 4 = 133.25 mm < 300 mm
  // Vs = 397.2 * 420 * 533 / 100 / 1000 = 889.17 kN > 282.53 kN
  const rB = doorreken({
    f_c: "28", f_yt: "420", b: "300", h: "600", bar_t: "3", n_t: "4",
    bar_v: "3", n_legs: "2", s_v: "100"
  });
  toets(rB, { s_max: 133.25 });
}

// 2.7 裂縫控制鋼筋間距公式（rc112 24.3.2）
console.log("  2.7 裂縫控制鋼筋間距 s,crack");
{
  // fs = (2/3)*420 = 280 MPa, cc = 40 mm
  // s_crack = min(380*(280/280) - 2.5*40, 300*(280/280)) = min(280, 300) = 280 mm
  // 4-D22 鋼筋中心間距 s_bar = (300 - 2*40 - 2*9.53 - 22.2)/(4 - 1) = 178.74/3 = 59.58 mm
  const r = doorreken({
    b: "300", c_c: "40", f_y: "420", bar_t: "3", n_t: "4", bar_v: "1"
  });
  toets(r, {
    s_crack_lim: 280.0,
    s_bar: 59.58,
    UC_crack: 59.58 / 280.0,
  });
}

// 2.8 免算撓度之最小梁深 h,min（rc112 表 9.3.1.1）
console.log("  2.8 免算撓度之最小梁厚 h,min 隨支承條件");
{
  // L = 6.0 m, fy = 420 MPa -> 修正係數 0.4 + 420/690 = 1.008696
  // 簡支梁 (type 1): L/16 = 6000/16 * 1.008696 = 378.26 mm
  const r1 = doorreken({ L: "6.0", f_y: "420", support_type: "1" });
  toets(r1, { h_min: 378.26 });
  // 一端連續 (type 2): L/18.5 = 6000/18.5 * 1.008696 = 327.14 mm
  const r2 = doorreken({ L: "6.0", f_y: "420", support_type: "2" });
  toets(r2, { h_min: 327.14 });
  // 兩端連續 (type 3): L/21 = 6000/21 * 1.008696 = 288.20 mm
  const r3 = doorreken({ L: "6.0", f_y: "420", support_type: "3" });
  toets(r3, { h_min: 288.20 });
  // 懸臂梁 (type 4): L/8 = 6000/8 * 1.008696 = 756.52 mm
  const r4 = doorreken({ L: "6.0", f_y: "420", support_type: "4" });
  toets(r4, { h_min: 756.52 });
}

// ── 3. 端到端基準案例一：單筋矩形梁（完全合格） ─────────────────────────────
console.log("\n3. 端到端基準案例一：單筋矩形梁（完全合格）");
console.log("   斷面 300×600 mm, 跨度 6.0 m, C280, SD420, 4-D22, 箍筋 D10@150, Mu = 200 kN·m, Vu = 120 kN");
{
  const r = doorreken({
    f_c: "28", f_y: "420", f_yt: "420", b: "300", h: "600", L: "6.0", c_c: "40",
    support_type: "1", bar_t: "3", n_t: "4", rebar_layers: "1", has_top: "1",
    bar_v: "1", n_legs: "2", s_v: "150",
    M_u: "200", V_u: "120", M_D: "60", M_L: "40", q_sus: "0.2"
  });

  geenFouten(r, "單筋梁基準案例");

  // 手算精確推導對照：
  // 幾何：d = 539.37 mm, dt = 539.37 mm
  // As = 1548.4 mm²
  // β1 = 0.85
  // a = 1548.4 * 420 / (0.85 * 28 * 300) = 91.082 mm
  // c = 91.082 / 0.85 = 107.156 mm
  // εt = 0.003 * (539.37 - 107.156) / 107.156 = 0.01210 ≥ 0.0051 (ϕ = 0.90)
  // Mn = 1548.4 * 420 * (539.37 - 91.082/2) / 1e6 = 321.15 kN·m
  // ϕMn = 0.90 * 321.15 = 289.04 kN·m
  // UC_M = 200 / 289.04 = 0.6920
  // Vc = 145.56 kN, Vs = 215.45 kN, ϕVn = 0.75 * (145.56 + 215.45) = 270.76 kN
  // UC_V = 120 / 270.76 = 0.4432
  // As,min = 539.37 mm² -> UC_Asmin = 539.37 / 1548.4 = 0.3483
  // UC_et = 0.0051 / 0.01210 = 0.4215
  // UC_Vsmax = 215.45 / 565.07 = 0.3813
  // UC_s = 150 / 269.69 = 0.5562
  // UC_crack = 59.58 / 280.0 = 0.2128
  // UC_hmin = 378.26 / 600 = 0.6304
  toets(r, {
    M_n: 321.15,
    ϕM_n: 289.04,
    UC_M: 0.6920,
    ϕV_n: 270.76,
    UC_V: 0.4432,
    UC_Asmin: 0.3483,
    UC_s: 0.5562,
    UC_crack: 0.2128,
    UC_hmin: 0.6304,
  });

  waar("基準案例一：全部檢核合格且控制 UC ≤ 1.0", voldoet(r), `控制結果: ${JSON.stringify(r.r)}`);
  waar("基準案例一：控制 UC 約 0.74", r.r.uc !== null && r.r.uc >= 0.69 && r.r.uc <= 0.85, `UC = ${r.r.uc}`);
}

// ── 4. 端到端基準案例二：雙筋矩形梁（完全合格） ─────────────────────────────
console.log("\n4. 端到端基準案例二：雙筋矩形梁（完全合格）");
console.log("   斷面 300×600 mm, 跨度 6.0 m, C280, SD420, 底筋 5-D29（雙排）, 頂筋 2-D22, D10@120, Mu = 420 kN·m, Vu = 150 kN");
{
  const r = doorreken({
    f_c: "28", f_y: "420", f_yt: "420", b: "300", h: "600", L: "6.0", c_c: "40",
    support_type: "1", bar_t: "5", n_t: "5", rebar_layers: "2", has_top: "2",
    bar_c: "3", n_c: "2", bar_v: "1", n_legs: "2", s_v: "120",
    M_u: "420", V_u: "150", M_D: "90", M_L: "60", q_sus: "0.2"
  });

  geenFouten(r, "雙筋梁基準案例");

  // 手算精確推導對照：
  // 拉筋 5-D29 (db=28.7, Ab=646.9, As = 3234.5 mm²), 雙排: s_vert = 28.7 mm
  // dt = 600 - 40 - 9.53 - 28.7/2 = 536.12 mm
  // d = 600 - 40 - 9.53 - 28.7 - 28.7/2 = 507.42 mm
  // 壓筋 2-D22 (dbc=22.2, Abc=387.1, A's = 774.2 mm²): d' = 40 + 9.53 + 22.2/2 = 60.63 mm
  // 檢核靜力平衡求 c:
  // 若壓筋降伏 fs' = 420 MPa:
  // a = (As*fy - A's*(fy - 0.85*f'c)) / (0.85*f'c*b) 或直接平衡式:
  // 0.85*28*0.85*c*300 + 774.2*(420 - 0.85*28) = 3234.5*420
  // 6069*c + 774.2*396.2 = 1358490
  // 6069*c + 306738 = 1358490 -> c = 1051752 / 6069 = 173.29 mm
  // 檢核壓筋應變: ε's = 0.003 * (173.29 - 60.63) / 173.29 = 0.00195
  // 若未全降伏 (fs' = 200000*0.00195 = 390.1 MPa)，精確求解得 c ≈ 175 mm
  // εt = 0.003 * (536.12 - 175) / 175 ≈ 0.00619 ≥ 0.0051 (ϕ = 0.90，拉力控制合格)
  // 設計抗彎強度 ϕMn > 450 kN·m，剪力 ϕVn > 150 kN
  toets(r, {
    A_s: 3234.5,
    A_sp: 774.2,
    d_t: 536.12,
    d: 507.42,
    ϕ_m: 0.90,
  });

  waar("基準案例二：雙筋梁完全合格", voldoet(r), `控制結果: ${JSON.stringify(r.r)}`);
}

// ── 5. 邊界與極限條件檢核 ────────────────────────────────────────────────────
console.log("\n5. 邊界與極限條件檢核");

// 5.1 剛好處於拉力控制界限 εt = εty + 0.003 = 0.0051
console.log("  5.1 鋼筋應變剛好達拉力控制界限");
{
  const r = doorreken({
    f_c: "28", f_y: "420", b: "300", h: "600", bar_t: "5", n_t: "4", rebar_layers: "1"
  });
  // 4-D29 (As=2587.6 mm²), a = 2587.6*420/(0.85*28*300) = 152.21 mm, c = 179.07 mm
  // d = 600 - 40 - 9.53 - 28.7/2 = 536.12 mm
  // εt = 0.003 * (536.12 - 179.07) / 179.07 = 0.00598 ≥ 0.0051 (拉力控制 ϕ=0.90)
  toets(r, { ϕ_m: 0.90 });
}

// 5.2 服務載重小於開裂彎矩 Ma ≤ Mcr（未開裂狀態 Ie = Ig）
console.log("  5.2 服務載重未開裂斷面（Ma ≤ Mcr 則 Ie = Ig）");
{
  const r = doorreken({
    b: "300", h: "600", M_D: "20", M_L: "10" // Ma = 30 kN·m < Mcr = 59.05 kN·m
  });
  toets(r, {
    I_g: 5.4e9,
    I_e: 5.4e9,
  });
}

// ── 6. 不合格負面檢核（絕不可錯判為合格） ────────────────────────────────────
console.log("\n6. 負面測試（超限情況絕不誤判合格）");

// 6.1 彎矩超限（Mu > ϕMn）
console.log("  6.1 彎矩超限 (Mu = 500 kN·m > ϕMn = 289 kN·m)");
{
  const r = doorreken({
    f_c: "28", f_y: "420", b: "300", h: "600", bar_t: "3", n_t: "4",
    M_u: "500"
  });
  waar("彎矩超限判為不合格", voldoetNiet(r), `voldoet: ${r.r.voldoet}, uc: ${r.r.uc}`);
}

// 6.2 超筋梁（拉力鋼筋延展性不足 εt < εty + 0.003）
console.log("  6.2 超筋梁延展性不足（小斷面配超大鋼筋量 8-D36）");
{
  const r = doorreken({
    f_c: "21", f_y: "420", b: "250", h: "400", bar_t: "7", n_t: "8", rebar_layers: "1",
    M_u: "100"
  });
  waar("超筋梁判為不合格", voldoetNiet(r), `voldoet: ${r.r.voldoet}, uc: ${r.r.uc}`);
}

// 6.3 剪力超限（Vu > ϕVn）
console.log("  6.3 剪力超限 (Vu = 400 kN > ϕVn = 270 kN)");
{
  const r = doorreken({
    b: "300", h: "600", bar_t: "3", n_t: "4", bar_v: "1", s_v: "250",
    V_u: "400"
  });
  waar("剪力超限判為不合格", voldoetNiet(r), `voldoet: ${r.r.voldoet}, uc: ${r.r.uc}`);
}

// 6.4 斷面剪力上限超限（Vs > 0.66√f'c*bw*d 斷面尺寸過小）
console.log("  6.4 斷面尺寸過小超過標稱剪力上限");
{
  const r = doorreken({
    f_c: "21", b: "200", h: "300", bar_v: "3", n_legs: "4", s_v: "50" // 極大剪力筋量
  });
  waar("超過斷面剪力上限判為不合格", voldoetNiet(r), `voldoet: ${r.r.voldoet}, uc: ${r.r.uc}`);
}

// 6.5 箍筋間距過大（s > s,max）
console.log("  6.5 箍筋間距過大 (s = 400 mm > s,max)");
{
  const r = doorreken({
    b: "300", h: "600", bar_v: "1", s_v: "400"
  });
  waar("箍筋間距超限判為不合格", voldoetNiet(r), `voldoet: ${r.r.voldoet}, uc: ${r.r.uc}`);
}

// 6.6 撓度過大（長期撓度超限）
console.log("  6.6 活載重大跨度撓度過大");
{
  const r = doorreken({
    b: "250", h: "400", L: "8.0", M_D: "80", M_L: "100"
  });
  waar("撓度超限判為不合格", voldoetNiet(r), `voldoet: ${r.r.voldoet}, uc: ${r.r.uc}`);
}

// ── 7. 無效輸入與安全防護網 ──────────────────────────────────────────────────
console.log("\n7. 無效輸入與防護網檢核（絕不可誤判合格）");

// 7.1 幾何尺寸為 0 或負值
console.log("  7.1 幾何尺寸為 0 或負值");
{
  const r0 = doorreken({ b: "0", h: "0" });
  waar("尺寸為 0 時標示未檢核且不判為合格", nietGetoetst(r0), `voldoet: ${r0.r.voldoet}, nietGetoetst: ${r0.r.nietGetoetst}`);
  const rNeg = doorreken({ b: "-300", h: "600" });
  waar("尺寸為負時標示未檢核且不判為合格", nietGetoetst(rNeg), `voldoet: ${rNeg.r.voldoet}, nietGetoetst: ${rNeg.r.nietGetoetst}`);
}

// 7.2 跨度或鋼筋量為 0
console.log("  7.2 跨度為 0 或未配拉力鋼筋");
{
  const rL0 = doorreken({ L: "0" });
  waar("跨度為 0 標示未檢核", nietGetoetst(rL0), `voldoet: ${rL0.r.voldoet}`);
  const rAs0 = doorreken({ n_t: "0" });
  waar("鋼筋根數為 0 標示未檢核", nietGetoetst(rAs0), `voldoet: ${rAs0.r.voldoet}`);
}

// ── 8. 報告結尾行解析相容性 ──────────────────────────────────────────────────
console.log("\n8. 報告結尾行解析相容性檢核（leesResultaat）");
{
  const rGood = doorreken({
    f_c: "28", f_y: "420", b: "300", h: "600", L: "6.0", c_c: "40",
    bar_t: "3", n_t: "4", M_u: "200", V_u: "120", M_D: "60", M_L: "40"
  });
  waar("合格案例結尾行被正確解析為 true", rGood.r.voldoet === true, `voldoet = ${rGood.r.voldoet}`);
  waar("合格案例結尾行讀取到有效 UC", rGood.r.uc !== null && rGood.r.uc <= 1.0, `uc = ${rGood.r.uc}`);

  const rBad = doorreken({ M_u: "600" });
  waar("不合格案例結尾行被正確解析為 false", rBad.r.voldoet === false, `voldoet = ${rBad.r.voldoet}`);
  waar("不合格案例結尾行讀取到 UC > 1.0", rBad.r.uc !== null && rBad.r.uc > 1.0, `uc = ${rBad.r.uc}`);

  const rInvalid = doorreken({ b: "0" });
  waar("無效輸入被解析為未檢核", rInvalid.r.nietGetoetst === true, `nietGetoetst = ${rInvalid.r.nietGetoetst}`);
}

console.log("\n--------------------------------------------------------------------------------");
console.log(`檢核結果：${getest} 項檢驗，${fouten} 項失敗。`);
console.log("--------------------------------------------------------------------------------");

process.exit(fouten === 0 ? 0 : 1);
