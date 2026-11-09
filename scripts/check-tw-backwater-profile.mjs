/**
 * tw-backwater-profile 檢查腳本（標準步進法）。
 * 獨立求解器：(a) 每步以 Newton／割線法解同一能量方程式（與範本的二分法不同根解器），須逐值一致；
 * (b) 以 RK4 積分 dy/dx = (S0 − Sf)/(1 − Fr²)（另一套數學），在細步長下須與範本在 1% 內一致；
 * (c) 矩形渠道臨界水深閉合式 yc = (Q²/(g b²))^(1/3)；(d) 六種水面線型式 M1/M2/M3/S1/S2/S3 分類與趨勢。
 */
import { parse, evaluate } from "../packages/core/dist/index.js";
import { twBackwaterProfile } from "../packages/desktop/src/templates/tw-backwater-profile.ts";
import { leesResultaat, leesGetallen } from "../packages/desktop/src/components/calc/bladLezen.ts";

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}
function draai(tpl) {
  const nodes = evaluate(parse(tpl.replaceAll("#hide\n", "#show\n")), {});
  return { uit: leesGetallen(nodes), res: leesResultaat(evaluate(parse(tpl), {}), "tw-backwater-profile") };
}
const base = { Q: 10, b: 3, m: 1, n: 0.015, S0: 0.001, y0: 1.8, L: 400, N: 20, H: 3.0, Va: 4.57 };
const NAMES = { Q: "Q_d", b: "b_w", m: "m_s", n: "n_m", S0: "S_0", y0: "y_0", L: "L_r", N: "N_s", H: "H_ch", Va: "V_allow" };
function set(tpl, p) {
  let t = tpl;
  for (const [k, nm] of Object.entries(NAMES)) {
    const re = new RegExp(`^${nm} = [^'\\n]*'-`, "m");
    if (!re.test(t)) throw new Error(`找不到輸入 ${nm}`);
    t = t.replace(re, `${nm} = ${p[k]}'-`);
  }
  return t;
}
const g = 9.81;
function geo(p) {
  const A = (y) => (p.b + p.m * y) * y, P = (y) => p.b + 2 * y * Math.sqrt(1 + p.m * p.m), T = (y) => p.b + 2 * p.m * y;
  const V = (y) => p.Q / A(y), R = (y) => A(y) / P(y);
  const Sf = (y) => (p.n * V(y)) ** 2 / R(y) ** (4 / 3);
  const E = (y) => y + V(y) ** 2 / (2 * g);
  const Fr2 = (y) => (V(y) ** 2 * T(y)) / (g * A(y));
  return { A, P, T, V, R, Sf, E, Fr2 };
}
/** 割線法（不同於範本二分法）解 f(y)=0，從兩個起點 */
function secant(f, a, b) {
  let x0 = a, x1 = b, f0 = f(x0), f1 = f(x1);
  for (let i = 0; i < 200 && Math.abs(f1) > 1e-13; i++) {
    const x2 = x1 - (f1 * (x1 - x0)) / (f1 - f0);
    x0 = x1; f0 = f1; x1 = Math.max(x2, 1e-6); f1 = f(x1);
  }
  return x1;
}
function ref(p) {
  const o = geo(p);
  const yn = secant((y) => (o.A(y) * o.R(y) ** (2 / 3) * Math.sqrt(p.S0)) / p.n - p.Q, 0.5, 1.5);
  const yc = secant((y) => (p.Q * p.Q * o.T(y)) / (g * o.A(y) ** 3) - 1, 0.3, 1.0);
  const sub = p.y0 > yc;
  const dx = p.L / p.N;
  let y = p.y0, ymax = y, Vmax = o.V(y), Vmin = o.V(y), ymid = y;
  const sgn = sub ? 1 : -1;
  for (let i = 1; i <= p.N; i++) {
    const Ep = o.E(y), Sp = o.Sf(y);
    const F = (yy) => p.S0 * dx + sgn * (o.E(yy) - Ep) - (dx * (o.Sf(yy) + Sp)) / 2;
    y = secant(F, sub ? y * 1.02 : y * 0.98, sub ? y * 0.99 : y * 1.01);
    ymax = Math.max(ymax, y); Vmax = Math.max(Vmax, o.V(y)); Vmin = Math.min(Vmin, o.V(y));
    if (i === Math.round(p.N / 2)) ymid = y;
  }
  const mild = yn > yc;
  const prof = mild ? (p.y0 > yn ? "M1" : p.y0 > yc ? "M2" : "M3") : p.y0 > yc ? "S1" : p.y0 > yn ? "S2" : "S3";
  const fb = Math.max(0.25 * ymax, 0.2);
  const UC = { fb: (ymax + fb) / p.H, vmax: Vmax / p.Va, vmin: 0.8 / Vmin };
  return { yn, yc, y, ymax, ymid, Vmax, Vmin, prof, UC, ucmax: Math.ceil(Math.max(...Object.values(UC), 0.5) * 100) / 100 };
}
/** RK4：dy/dx（x 向下游為正）；下游控制時由下游向上游積分 */
function rk4(p, n = 4000) {
  const o = geo(p);
  const yc = secant((y) => (p.Q * p.Q * o.T(y)) / (g * o.A(y) ** 3) - 1, 0.3, 1.0);
  const sub = p.y0 > yc;
  const f = (y) => (p.S0 - o.Sf(y)) / (1 - o.Fr2(y));
  const h = (sub ? -1 : 1) * (p.L / n);
  let y = p.y0;
  for (let i = 0; i < n; i++) {
    const k1 = f(y), k2 = f(y + (h * k1) / 2), k3 = f(y + (h * k2) / 2), k4 = f(y + h * k3);
    y += (h / 6) * (k1 + 2 * k2 + 2 * k3 + k4);
  }
  return y;
}
const near = (a, b, t = 1e-5) => typeof a === "number" && Math.abs(a - b) <= t * Math.max(1, Math.abs(b));

console.log("=== tw-backwater-profile（標準步進法） ===\n");
console.log("0. 規範式釘死");
for (const s of ["max(0.25*y_max; 0.2)", "UC_vmin = 0.8/V_min", "UC_vmax = V_max/V_allow", "Sf_f(y) = n_m^2*V_f(y)^2/(A_f(y)/P_f(y))^(4/3)", "S_0*dx", "N_s ≤ 100"])
  meld(twBackwaterProfile.includes(s), `範本含 ${s}`);

console.log("\n1. 矩形渠道臨界水深閉合式與基準案例");
{
  const p = { ...base, m: 0 };
  const { uit } = draai(set(twBackwaterProfile, p));
  const ycClosed = (p.Q ** 2 / (g * p.b ** 2)) ** (1 / 3);
  meld(near(uit.y_c_out, ycClosed, 1e-6), `y_c = (Q²/(g b²))^(1/3) = ${ycClosed.toFixed(6)}`, String(uit.y_c_out));
  const { uit: u2, res } = draai(twBackwaterProfile);
  const e = ref(base);
  meld(near(u2.y_n_out, e.yn) && near(u2.y_c_out, e.yc), `y_n = ${e.yn.toFixed(5)}、y_c = ${e.yc.toFixed(5)}`);
  meld(near(u2.y_end_out, e.y), `終點水深 = ${e.y.toFixed(6)}`, String(u2.y_end_out));
  meld(near(u2.UC_max, e.ucmax, 1e-9) && res.voldoet === (e.ucmax <= 1), `UC_max = ${e.ucmax}（${e.prof}）`, String(u2.UC_max));
}

console.log("\n2. 六種水面線型式與趨勢");
{
  const cases = [
    ["M1", { y0: 3.0 }],
    ["M2", { S0: 0.001, y0: 1.2 }],
    ["M3", { y0: 0.5, L: 15 }],
    ["S1", { S0: 0.02, y0: 2.0, L: 10 }],
    ["S2", { S0: 0.02, y0: 0.9, L: 100 }],
    ["S3", { S0: 0.02, y0: 0.4, L: 100 }],
  ];
  for (const [名, patch] of cases) {
    const p = { ...base, ...patch };
    const e = ref(p);
    const { uit } = draai(set(twBackwaterProfile, p));
    meld(e.prof === 名, `${名} 分類`, e.prof);
    meld(near(uit.y_end_out, e.y) && near(uit.y_mid_out, e.ymid), `${名} 終點／中點水深與割線法一致（${e.y.toFixed(4)}）`, `${uit.y_end_out} vs ${e.y}`);
    const r = rk4(p);
    meld(Math.abs(uit.y_end_out - r) / r < 0.01, `${名} 與 RK4 微分方程式積分差 < 1%（${r.toFixed(4)}）`, `${uit.y_end_out} vs ${r}`);
  }
  // 趨勢：M1 由下游向上游水深遞減趨近 y_n；M3 由上游向下游遞增趨近 y_c 以下
  const m1 = ref({ ...base, y0: 3.0 });
  meld(m1.y < 3.0 && m1.y > m1.yn, "M1：上游端水深介於 y_n 與控制水深之間");
  const m2 = ref({ ...base, y0: 1.2 });
  meld(m2.y > 1.2 === false || m2.y < m2.yn + 1e-9, "M2：向上游趨近 y_n 且不超過");
}

console.log("\n3. 參數掃描（割線法逐值一致）");
{
  let bad = 0, cnt = 0, pass = 0, fail = 0;
  for (const m of [0, 1.5])
    for (const b of [2, 4])
      for (const S0 of [0.0005, 0.003, 0.02])
        for (const n of [0.013, 0.025])
          for (const f of [0.4, 0.8, 1.3, 2.5])
            for (const N of [5, 25]) {
              const p0 = { ...base, m, b, S0, n, N, H: 6 };
              const yc = ref({ ...p0, y0: 1 }).yc;
              const p = { ...p0, y0: Number((yc * f).toFixed(4)) };
              const e = ref(p);
              if (Math.abs(p.y0 - e.yc) < 0.01 * e.yc) continue;
              const { uit, res } = draai(set(twBackwaterProfile, p));
              if (uit.bad > 0.5) continue; // 無解案例另測
              cnt++; e.ucmax <= 1 ? pass++ : fail++;
              if (!(near(uit.y_end_out, e.y) && near(uit.V_max, e.Vmax) && near(uit.UC_max, e.ucmax, 1e-9) && res.voldoet === (e.ucmax <= 1))) { bad++; if (bad < 4) console.log(JSON.stringify(p), uit.y_end_out, e.y, uit.UC_max, e.ucmax); }
            }
  meld(bad === 0, `${cnt} 組與割線法求解器一致`, `${bad} 組不符`);
  meld(pass > 10 && fail > 10, `涵蓋合格 ${pass} 組與不合格 ${fail} 組`);
}

console.log("\n4. 負向：不得誤判合格");
for (const [名, patch] of [
  ["渠深不足（H=2.0）", { H: 2.0 }],
  ["流速過低（M1 深水）", { y0: 3.0, H: 6 }],
  ["流速過高（陡坡 S3）", { S0: 0.02, y0: 0.4, L: 100, H: 6 }],
  ["控制水深等於臨界水深", { y0: 0.9341 }],
]) {
  const p = { ...base, ...patch };
  const { uit, res } = draai(set(twBackwaterProfile, p));
  meld(res.voldoet === false, `${名} → 不合格`, JSON.stringify([uit.UC_max, res]));
}

console.log("\n5. 無效輸入一律拒算");
for (const [名, patch] of [
  ["平坡 S0=0", { S0: 0 }], ["逆坡", { S0: -0.001 }], ["流量為 0", { Q: 0 }], ["步數 101", { N: 101 }], ["步數非整數", { N: 10.5 }], ["邊坡為負", { m: -1 }], ["n = 0", { n: 0 }],
]) {
  const { uit, res } = draai(set(twBackwaterProfile, { ...base, ...patch }));
  meld(uit.UC_max === undefined && res.voldoet !== true && res.nietGetoetst === true, `${名} 拒算`);
}
console.log(fouten === 0 ? "\n全部通過。" : `\n${fouten} 項失敗。`);
process.exit(fouten === 0 ? 0 : 1);
