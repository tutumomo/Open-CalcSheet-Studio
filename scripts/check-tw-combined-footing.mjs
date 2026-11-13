/**
 * tw-combined-footing 檢查腳本（雙柱矩形聯合基腳，found112 §4.1.2、rc112 §13.3）。
 *
 * 獨立求解器不使用範本的閉合式：
 *  - 基底線載重 w(x) = w0 + k·x 以 2×2 平衡方程（∑F、∑M）解出；
 *  - 剪力 V(x)、彎矩 M(x) 以分段數值積分（中點法，於柱中心分段）求得；
 *  - 兩柱間最小彎矩以三分搜尋（M 在柱間為凸函數）取得，不用「剪力為零」之二次式根。
 * 其餘（沖剪、單向剪力、抗彎、橫向帶、承壓、錨定）以純 SI 重寫，與範本逐項及參數掃描比對；
 * 另含平衡閉合（V(L)=0、M(L)=0）、負向不合格案例與無效輸入拒算。
 *
 * 執行：node scripts/check-tw-combined-footing.mjs
 */
import { parse, evaluate } from "../packages/core/dist/index.js";
import { laadTemplate } from "./lib/refcheck.mjs";
import { leesResultaat, leesGetallen } from "../packages/desktop/src/components/calc/bladLezen.ts";

const T = laadTemplate("tw-combined-footing.ts");

let fouten = 0;
let getest = 0;
function meld(ok, tekst, detail = "") {
  getest++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}
const draai = (waarden = {}) => ({
  uit: leesGetallen(evaluate(parse(T.replaceAll("#hide\n", "#show\n")), { ...waarden })),
  res: leesResultaat(evaluate(parse(T), { ...waarden }), "tw-combined-footing"),
});
const rel = (a, b, tol = 1e-4) => typeof a === "number" && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const REBAR = { 1: [25.4, 506.7], 2: [15.9, 198.6], 3: [19.1, 286.5], 4: [22.2, 387.1], 5: [28.7, 646.9], 6: [32.2, 814.3] };

/** 預設輸入（與範本預設一致；mm、kN、MPa、kPa） */
const DEF = {
  fc: 28, fy: 420, gc: 24, gs: 18, cover: 75,
  L: 6000, B: 2200, h: 800, Df: 1000,
  x1: 900, c1l: 500, c1b: 500, x2: 4900, c2l: 500, c2b: 500,
  Ps1: 1400, Ps2: 1800, H: 80, Pu1: 1960, Pu2: 2520,
  qa: 350, mu: 0.5,
  barB: 1, nbb: 9, barT: 1, nbt: 9, barQ: 1, sq: 150, hook: 1,
};
/** 範本輸入名稱對照 */
const MAP = {
  fc: "fc_in", fy: "fy_in", gc: "gamma_c", gs: "gamma_s", cover: "cover", L: "L_f", B: "B_f", h: "h_f", Df: "D_f",
  x1: "x_1", c1l: "c_1l", c1b: "c_1b", x2: "x_2", c2l: "c_2l", c2b: "c_2b",
  Ps1: "P1_s", Ps2: "P2_s", H: "H_serv", Pu1: "P1_u", Pu2: "P2_u", qa: "q_a_in", mu: "mu_base",
  barB: "bar_b_id", nbb: "n_bb", barT: "bar_t_id", nbt: "n_bt", barQ: "bar_q_id", sq: "s_q", hook: "hook_mode",
};
const naarTpl = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [MAP[k], String(v)]));

/** 獨立求解器 */
function los(o) {
  const p = { ...DEF, ...o };
  const [dbb, Abb] = REBAR[p.barB], [dbt, Abt] = REBAR[p.barT], [dbq, Abq] = REBAR[p.barQ];
  const Lm = p.L / 1000, Bm = p.B / 1000, hm = p.h / 1000, Dm = p.Df / 1000;
  const x1 = p.x1 / 1000, x2 = p.x2 / 1000, c1l = p.c1l / 1000, c2l = p.c2l / 1000, c1b = p.c1b / 1000, c2b = p.c2b / 1000;
  const dbot = p.h - p.cover - dbb / 2;
  const dtra = p.h - p.cover - dbb - dbq / 2;
  const dtop = p.h - p.cover - dbt / 2;
  const dv = Math.max(Math.min(dbot, dtra, dtop), 10);
  const rf = Math.sqrt(p.fc);

  // 平衡方程解 w(x) = w0 + k·x
  const Pu = p.Pu1 + p.Pu2;
  const xu = (p.Pu1 * x1 + p.Pu2 * x2) / Pu;
  const eu = xu - Lm / 2;
  const det = Lm ** 4 / 12;
  const w0 = ((Pu * Lm ** 3) / 3 - (Lm ** 2 / 2) * Pu * xu) / det;
  const kw = (Lm * Pu * xu - (Lm ** 2 / 2) * Pu) / det;

  const x1l = x1 - c1l / 2, x1r = x1 + c1l / 2, x2l = x2 - c2l / 2, x2r = x2 + c2l / 2;
  const dvm = dv / 1000;

  // 輸入防護
  const ok_mat = p.fc >= 17 && p.fc <= 70 && p.fy >= 280 && p.fy <= 550;
  const ok_size = Lm > 0 && Bm > 0 && p.h >= 200 && p.cover >= 50 && Dm >= 0;
  const ok_col = c1l > 0 && c1b > 0 && c2l > 0 && c2b > 0 && x1 < x2;
  const ok_loads = p.Ps1 > 0 && p.Ps2 > 0 && p.Pu1 > 0 && p.Pu2 > 0 && p.qa > 0 && p.H >= 0 && p.mu > 0;
  const ok_rebar = p.nbb >= 2 && p.nbt >= 2 && p.sq > 0 && dv > 100;
  const ok_inner = x1l * 1000 >= dv / 2 && (Lm - x2r) * 1000 >= dv / 2 && x2l - x1r >= 2 * dvm && p.B >= Math.max(p.c1b, p.c2b) + dv;
  const ok_band = x1 * 1000 - (p.c1l + dtra) / 2 >= 0 && (Lm - x2) * 1000 - (p.c2l + dtra) / 2 >= 0 &&
    (x2 - x1) * 1000 >= (p.c1l + p.c2l + 2 * dtra) / 2;
  const ok_ecc = Math.abs(eu) <= Lm / 6;
  const gueltig = ok_mat && ok_size && ok_col && ok_loads && ok_rebar && ok_inner && ok_band && ok_ecc;
  if (!gueltig) return { gueltig };

  // 分段中點積分（於柱中心分段，使階躍精確）
  const w = (s) => w0 + kw * s;
  const Vnum = (x) => {
    // V(x) = ∫0^x w ds − ΣP（柱中心位於 x 之左）
    const N = 2000, dx = x / N;
    let a = 0;
    for (let i = 0; i < N; i++) a += w((i + 0.5) * dx) * dx;
    return a - (x1 < x ? p.Pu1 : 0) - (x2 < x ? p.Pu2 : 0);
  };
  const Mnum = (x) => {
    const pts = [0, ...[x1, x2].filter((c) => c < x), x];
    let m = 0;
    for (let j = 0; j < pts.length - 1; j++) {
      const a = pts[j], b = pts[j + 1], N = 600, dx = (b - a) / N;
      for (let i = 0; i < N; i++) {
        const s = a + (i + 0.5) * dx;
        m += (w0 * s + (kw * s * s) / 2 - (x1 < s ? p.Pu1 : 0) - (x2 < s ? p.Pu2 : 0)) * dx;
      }
    }
    return m;
  };
  // 柱間最小彎矩：三分搜尋
  let lo = x1r, hi = x2l;
  for (let i = 0; i < 70; i++) {
    const m1 = lo + (hi - lo) / 3, m2 = hi - (hi - lo) / 3;
    if (Mnum(m1) < Mnum(m2)) hi = m2; else lo = m1;
  }
  const Mmin = Mnum((lo + hi) / 2);
  const Mneg = Math.max(-Math.min(Mmin, Mnum(x1r), Mnum(x2l)), 0);
  const Mpos = Math.max(Mnum(x1l), Mnum(x2r), Mnum(x1r), Mnum(x2l), 0);
  const Vu = Math.max(
    Math.abs(Vnum(Math.max(x1l - dvm, 0))), Math.abs(Vnum(x1r + dvm)),
    Math.abs(Vnum(x2l - dvm)), Math.abs(Vnum(Math.min(x2r + dvm, Lm))),
  );

  // 服務載重
  const Wf = Bm * Lm * hm * p.gc, Ws = Bm * Lm * Dm * p.gs;
  const Ptot = p.Ps1 + p.Ps2 + Wf + Ws;
  const xs = (p.Ps1 * x1 + p.Ps2 * x2 + (Wf + Ws) * Lm / 2) / Ptot;
  const es = xs - Lm / 2;
  const qavg = Ptot / (Bm * Lm);
  const qmom = (6 * Ptot * Math.abs(es)) / (Bm * Lm ** 2);
  const UC_bearing = (qavg + qmom) / p.qa;
  const UC_ecc = Math.abs(es) / (Lm / 6);
  const uplift = qavg - qmom < 0;
  const FS = (p.mu * Ptot) / Math.max(p.H, 0.001);
  const UC_slide = 1.5 / Math.max(FS, 0.001);

  // 單向剪力
  const phiVc = (0.75 * 0.17 * rf * p.B * dv) / 1000;
  const UC_vone = Vu / Math.max(phiVc, 0.001);

  // 沖剪
  const lamS = Math.min(1, Math.sqrt(2 / (1 + dv / 250)));
  const punch = (Pc, xc, cl, cb) => {
    const b1 = cl * 1000 + dv, b2 = cb * 1000 + dv, bo = 2 * (b1 + b2);
    const qc = w(xc) / Bm;
    const Vup = Pc - (qc * b1 * b2) / 1e6;
    const beta = Math.max(cl, cb) / Math.min(cl, cb);
    const vc = Math.min(0.33, 0.17 * (1 + 2 / beta), 0.083 * (2 + (40 * dv) / bo)) * lamS * rf;
    return Math.max(Vup, 0) / Math.max((0.75 * vc * bo * dv) / 1000, 0.001);
  };
  const UC_punch = Math.max(punch(p.Pu1, x1, c1l, c1b), punch(p.Pu2, x2, c2l, c2b));

  // 縱向抗彎
  const Asb = p.nbb * Abb, Ast = p.nbt * Abt;
  const phiM = (As, d) => (0.9 * As * p.fy * (d - (As * p.fy) / (0.85 * p.fc * p.B) / 2)) / 1e6;
  const UC_flex_b = Mpos / Math.max(phiM(Asb, dbot), 0.001);
  const UC_flex_t = Mneg / Math.max(phiM(Ast, dtop), 0.001);
  const Asmin = 0.0018 * p.B * p.h;
  const smax = Math.min(3 * p.h, 450);
  const sb = (p.B - 2 * p.cover - dbb) / Math.max(p.nbb - 1, 1);
  const st = (p.B - 2 * p.cover - dbt) / Math.max(p.nbt - 1, 1);
  const UC_g2 = Math.max(Asmin / Asb, Asmin / Ast, sb / smax, st / smax,
    Math.max(dbb, 25) / Math.max(sb - dbb, 1), Math.max(dbt, 25) / Math.max(st - dbt, 1));

  // 橫向帶
  const band = (Pc, cl, cb) => {
    const bw = cl * 1000 + dtra, ct = (p.B - cb * 1000) / 2;
    const Mt = (Pc / Bm) * (ct / 1000) ** 2 / 2;
    const Asq = (Abq * bw) / p.sq;
    const aq = (Asq * p.fy) / (0.85 * p.fc * bw);
    const phiMq = (0.9 * Asq * p.fy * (dtra - aq / 2)) / 1e6;
    const Vt = (Pc / Bm) * Math.max(ct - dtra, 0) / 1000;
    const phiVt = (0.75 * 0.17 * rf * bw * dtra) / 1000;
    return { tq: Mt / Math.max(phiMq, 0.001), rho: (0.0018 * bw * p.h) / Asq, tv: Vt / Math.max(phiVt, 0.001), ct };
  };
  const q1 = band(p.Pu1, c1l, c1b), q2 = band(p.Pu2, c2l, c2b);
  const UC_tq = Math.max(q1.tq, q2.tq), UC_tv = Math.max(q1.tv, q2.tv);
  const UC_rho_q = Math.max(q1.rho, q2.rho);
  const UC_space_q = p.sq / smax;
  const UC_clear_q = Math.max(dbq, 25) / Math.max(p.sq - dbq, 1);

  // 柱底承壓與錨定
  const UC_bear_col = Math.max(p.Pu1 / ((0.65 * 0.85 * p.fc * c1l * c1b * 1e6) / 1000), p.Pu2 / ((0.65 * 0.85 * p.fc * c2l * c2b * 1e6) / 1000));
  const ldS = (db) => (db <= 19.1 ? p.fy / (2.1 * rf) : p.fy / (1.7 * rf)) * db;
  const ldH = (db) => Math.max((p.fy / (4.2 * rf)) * db, 8 * db, 150);
  const ld = (db) => (p.hook === 1 ? ldH(db) : ldS(db));
  const Lavb = Math.min(x1l, Lm - x2r) * 1000 - p.cover;
  const Lavq = Math.min(q1.ct, q2.ct) - p.cover;
  const UC_ld = Math.max(ld(dbb) / Math.max(Lavb, 1), ld(dbq) / Math.max(Lavq, 1));

  const UC_load = Math.max(UC_bearing, UC_slide, UC_vone, UC_punch, UC_flex_b, UC_flex_t, UC_g2,
    UC_tq, UC_rho_q, UC_tv, UC_space_q, UC_clear_q, UC_bear_col, UC_ld, UC_ecc);
  const ucRaw = uplift ? Math.max(UC_load, 1.05) : UC_load;
  return {
    gueltig, w0, kw, eu, Mneg, Mpos, Vu, phiVc, UC_bearing, UC_ecc, UC_slide, UC_vone, UC_punch,
    UC_flex_b, UC_flex_t, UC_tq, UC_tv, UC_ld, UC_bear_col, UC_rho_q, dv,
    UC_max: Math.ceil(ucRaw * 100) / 100, ok: !uplift && UC_load <= 1,
    // 平衡閉合
    Vend: Vnum(Lm), Mend: Mnum(Lm),
  };
}

console.log("=== tw-combined-footing（雙柱聯合基腳，found112 4.1.2 / rc112 13.3） ===\n");

console.log("0. 規範式釘死（範本含關鍵算式）");
for (const s of [
  "0.75 * 0.17 * rf * B_mm * dv / 1000", "0.9 * As_b * fyn", "0.0018 * B_mm * h_mm", "min(3 * h_mm; 450)",
  "0.083 * (2 + 40 * dv / bo1)", "0.33", "sqrt(2.0 / (1.0 + dv / 250.0))", "0.65 * 0.85 * fcn",
  "12 * Pu * e_u / Lm^3", "6 * Pu * e_u / Lm^2", "bool(abs(e_u) ≤ Lm / 6)", "UC_slide = 1.5 /",
]) meld(T.includes(s), `範本含 ${s}`);
meld(T.includes("直接設計法不得使用於聯合基腳"), "範本註明 rc112 13.3.4.2 直接設計法不得用於聯合基腳");

console.log("\n1. 基準案例：平衡閉合與手算");
{
  const e = los({});
  meld(Math.abs(e.Vend) < 1e-6 * 4480 && Math.abs(e.Mend) < 1e-3, `數值積分 V(L)=${e.Vend.toExponential(2)}、M(L)=${e.Mend.toExponential(2)} 平衡閉合`);
  // 手算：Pu = 4480，xu = (1960×0.9 + 2520×4.9)/4480 = 3.15 → e = 0.15
  meld(rel(e.eu, 0.15, 1e-9), "因數化合力偏心 e_u = 0.15 m（手算）", String(e.eu));
  // w0 = Pu/L − 6·Pu·e/L² = 746.667 − 112 = 634.667；k = 12·Pu·e/L³ = 37.333
  meld(rel(e.w0, 634.6667, 1e-6) && rel(e.kw, 37.3333, 1e-6), "w(0)=634.667 kN/m、k=37.333 kN/m²（手算）", `${e.w0}/${e.kw}`);
  const { uit, res } = draai({});
  meld(rel(uit.w0, e.w0, 1e-9) && rel(uit.k_w, e.kw, 1e-9) && rel(uit.e_u, e.eu, 1e-9), "範本 w0、k、e_u 與獨立求解器一致");
  for (const k of ["Mneg", "Mpos", "Vu", "UC_vone", "UC_punch", "UC_flex_b", "UC_flex_t", "UC_tq", "UC_tv", "UC_ld", "UC_bear_col", "UC_bearing", "UC_ecc", "UC_slide"]) {
    const t = { Mneg: "Mneg_n", Mpos: "Mpos_n", Vu: "Vu_n" }[k] ?? k;
    meld(rel(uit[t], e[k], 1e-4), `${t} = ${e[k].toFixed(4)}`, `${uit[t]} vs ${e[k]}`);
  }
  meld(uit.UC_max === e.UC_max, `UC_max = ${e.UC_max}`, `${uit.UC_max} vs ${e.UC_max}`);
  meld(res.voldoet === e.ok && res.voldoet === true, "基準案例合格且結尾判定一致", JSON.stringify(res));
}

console.log("\n2. 參數掃描（幾何 3 × 厚度 3 × 載重倍率 4 × 鋼筋 5 × 錨定 2 × f'c 2）");
{
  const geos = [
    { L: 6000, x1: 900, x2: 4900, B: 2200 },
    { L: 7000, x1: 1000, x2: 5800, B: 2400 },
    { L: 5500, x1: 800, x2: 4600, B: 2000 },
  ];
  const bars = [[1, 9], [3, 12], [4, 10], [5, 12], [6, 10]];
  let c = 0, bad = 0, ok = 0, nok = 0, lijst = [];
  for (const g of geos) for (const h of [600, 800, 1000]) for (const f of [0.4, 0.6, 1.0, 1.3])
    for (const [bar, nb] of bars) for (const hook of [1, 2]) for (const fc of [21, 28]) {
      const o = { ...g, h, Pu1: Math.round(1960 * f), Pu2: Math.round(2520 * f), Ps1: Math.round(1400 * f), Ps2: Math.round(1800 * f),
        barB: bar, barT: bar, nbb: nb, nbt: nb, hook, fc };
      const e = los(o);
      const { uit, res } = draai(naarTpl(o));
      c++;
      e.ok ? ok++ : nok++;
      const goed = e.gueltig && rel(uit.Mneg_n, e.Mneg, 2e-4) && rel(uit.Mpos_n, e.Mpos, 2e-4) && rel(uit.Vu_n, e.Vu, 2e-4) &&
        rel(uit.UC_punch, e.UC_punch, 2e-4) && rel(uit.UC_flex_t, e.UC_flex_t, 2e-4) && rel(uit.UC_tq, e.UC_tq, 2e-4) &&
        rel(uit.UC_ld, e.UC_ld, 2e-4) && Math.abs(uit.UC_max - e.UC_max) <= 0.0101 && res.voldoet === e.ok;
      if (!goed) { bad++; if (lijst.length < 4) lijst.push(JSON.stringify(o) + ` -> ${uit.UC_max}/${res.voldoet} vs ${e.UC_max}/${e.ok}`); }
    }
  meld(bad === 0, `${c} 組與獨立求解器一致`, `${bad} 組不符：${lijst.join(" | ")}`);
  meld(ok > 30 && nok > 30, `涵蓋合格 ${ok} 組與不合格 ${nok} 組`);
}

console.log("\n3. 負向案例（不合格不得被誤判為合格）");
{
  const neg = [
    ["地盤支承力超載（P1_s=3000）", { P1_s: 3000 }],
    ["服務載重偏載造成基底揚起", { P1_s: 200, P2_s: 3000 }],
    ["水平力過大抗滑不足（H=3000）", { H_serv: 3000 }],
    ["基腳過薄剪力與沖剪不足（h=450）", { h_f: 450 }],
    ["頂層鋼筋不足（n_bt=3）", { n_bt: 3 }],
    ["底層鋼筋低於最小鋼筋比（n_bb=2）", { n_bb: 2 }],
    ["柱斷面過小柱底承壓不足", { c_1l: 150, c_1b: 150 }],
    ["橫向鋼筋間距過大（500 mm）", { s_q: 500 }],
    ["直鋼筋伸展長度不足", { hook_mode: 2 }],
    ["超大因數化載重", { P1_u: 5000, P2_u: 6500 }],
  ];
  for (const [n, o] of neg) {
    const { uit, res } = draai(o);
    meld(res.voldoet === false && !res.nietGetoetst && uit.UC_max > 1, `${n} → 不合格`, JSON.stringify(res));
  }
}

console.log("\n4. 無效輸入一律拒算");
{
  const ongeldig = [
    ["f'c = 12", { fc_in: 12 }], ["fy = 600", { fy_in: 600 }], ["L = 0", { L_f: 0 }], ["h = 150", { h_f: 150 }],
    ["cover = 40", { cover: 40 }], ["x1 ≥ x2", { x_1: 5000 }], ["柱 1 距端點過近（非內柱）", { x_1: 550 }],
    ["兩柱面淨距 < 2d", { x_2: 2200 }], ["柱 2 距端點過近", { x_2: 5600 }], ["因數化偏心 > L/6", { P1_u: 100, P2_u: 5000 }],
    ["n_bb = 1", { n_bb: 1 }], ["n_bt = 1", { n_bt: 1 }], ["s_q = 0", { s_q: 0 }], ["P1_u = 0", { P1_u: 0 }],
    ["P2_s = 0", { P2_s: 0 }], ["q_a = 0", { q_a_in: 0 }], ["μ = 0", { mu_base: 0 }], ["寬度小於柱寬 + d", { B_f: 600 }],
    ["有效深度 ≤ 100 mm（h=200）", { h_f: 200 }], ["Df < 0", { D_f: -100 }], ["H < 0", { H_serv: -5 }],
  ];
  for (const [n, o] of ongeldig) {
    const { res } = draai(o);
    meld(res.nietGetoetst === true && res.voldoet === null, `${n} → 拒算`, JSON.stringify(res));
  }
}

console.log(fouten === 0 ? `\n全部通過（${getest} 項）。` : `\n${fouten} 項失敗。`);
process.exit(fouten === 0 ? 0 : 1);
