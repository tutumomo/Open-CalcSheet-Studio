/**
 * tw-seismic-load 檢查腳本（seis113 靜力分析法）。
 * 以獨立純 JS 實作式 2-7～2-15 重算，掃描多組參數與範本逐值比對；
 * 另測無效輸入（臺北盆地、S_DS 過小、R 超出範圍）一律拒算且不得出現合格字樣。
 */
import { parse, evaluate } from "../packages/core/dist/index.js";
import { twSeismicLoad } from "../packages/desktop/src/templates/tw-seismic-load.ts";
import { leesResultaat, leesGetallen } from "../packages/desktop/src/components/calc/bladLezen.ts";

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}
function draai(tpl) {
  const nodes = evaluate(parse(tpl.replaceAll("#hide\n", "#show\n")), {});
  return { uit: leesGetallen(nodes), res: leesResultaat(evaluate(parse(tpl), {}), "tw-seismic-load") };
}
function vervang(tpl, oud, nieuw) {
  if (!tpl.includes(oud)) throw new Error(`找不到要取代的字串：${oud}`);
  return tpl.replace(oud, nieuw);
}

/** 獨立實作（seis113 式 2-1～2-3、2-7～2-12、2-14、2-15） */
function ref({ SDS, SD1, I, sys, R, ay, n, h, w }) {
  const hn = n * h;
  const Ct = sys === 1 ? 0.085 : sys === 2 ? 0.07 : 0.05;
  const T = Ct * hn ** 0.75;
  const T0 = SD1 / SDS;
  let SaD;
  if (T <= 0.2 * T0) SaD = SDS * (0.4 + (3 * T) / T0);
  else if (T <= T0) SaD = SDS;
  else if (T <= 2.5 * T0) SaD = SD1 / T;
  else SaD = 0.4 * SDS;
  const Ra = 1 + (R - 1) / 1.5;
  const s = Math.sqrt(2 * Ra - 1);
  let Fu;
  if (T >= T0) Fu = Ra;
  else if (T >= 0.6 * T0) Fu = s + ((Ra - s) * (T - 0.6 * T0)) / (0.4 * T0);
  else if (T >= 0.2 * T0) Fu = s;
  else Fu = s + ((s - 1) * (T - 0.2 * T0)) / (0.2 * T0);
  const r = SaD / Fu;
  const rm = r <= 0.3 ? r : r < 0.8 ? 0.52 * r + 0.144 : 0.7 * r;
  const W = n * w;
  const V = (I / (1.4 * ay)) * rm * W;
  const Ft = T < 0.7 ? 0 : Math.min(0.07 * T * V, 0.25 * V);
  const sum = (w * h * n * (n + 1)) / 2;
  const Fn = Ft + ((V - Ft) * w * hn) / sum;
  const F1 = ((V - Ft) * w * h) / sum;
  return { T, SaD, Ra, Fu, V, Ft, Fn, F1 };
}

const base = { SDS: 0.8, SD1: 0.45, I: 1.0, sys: 2, R: 4.8, ay: 1.5, n: 8, h: 3.5, w: 450 };
const set = (tpl, p) =>
  [
    ["S_DS = 0.80'-", `S_DS = ${p.SDS}'-`],
    ["S_D1 = 0.45'-", `S_D1 = ${p.SD1}'-`],
    ["I_eq = 1.0'-", `I_eq = ${p.I}'-`],
    ["sys = 2'-", `sys = ${p.sys}'-`],
    ["R_duct = 4.8'-", `R_duct = ${p.R}'-`],
    ["alpha_y = 1.5'-", `alpha_y = ${p.ay}'-`],
    ["n_st = 8'-", `n_st = ${p.n}'-`],
    ["h_st = 3.5'm", `h_st = ${p.h}'m`],
    ["W_st = 450'tf", `W_st = ${p.w}'tf`],
  ].reduce((t, [o, n]) => vervang(t, o, n), tpl);

const near = (a, b) => typeof a === "number" && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));

console.log("=== tw-seismic-load（seis113 靜力分析法） ===\n");

console.log("0. 規範式釘死");
for (const s of ["0.085", "0.070", "0.050", "(R_duct - 1)/1.5", "1.4*alpha_y", "0.52*r_calc + 0.144", "0.70*r_calc", "0.07*T_a_calc*V_calc", "0.25*V_calc"])
  meld(twSeismicLoad.includes(s), `範本含 ${s}`);

console.log("\n1. 基準案例手算（T = 0.07·28^0.75、T ≥ T0 → Fu = Ra）");
{
  const { uit, res } = draai(twSeismicLoad);
  const e = ref(base);
  meld(near(uit.T_a, e.T), `T = ${e.T.toFixed(4)} s`, String(uit.T_a));
  meld(near(uit.V, e.V), `V = ${e.V.toFixed(3)} tf`, String(uit.V));
  meld(near(uit.F_t, e.Ft), `Ft = ${e.Ft.toFixed(3)} tf`, String(uit.F_t));
  meld(near(uit.F_top, e.Fn), `F_top = ${e.Fn.toFixed(3)} tf`, String(uit.F_top));
  meld(near(uit.F_bot, e.F1), `F_bot = ${e.F1.toFixed(3)} tf`, String(uit.F_bot));
  meld(res.nietGetoetst === true && res.voldoet !== true, "結尾行為未檢核，不判合格");
}

console.log("\n2. 參數掃描（涵蓋 Fu 四段、SaD 四段、rm 三段）");
{
  let bad = 0, cnt = 0;
  for (const sys of [1, 2, 3])
    for (const n of [1, 3, 8, 20, 40])
      for (const [SDS, SD1] of [[0.6, 0.3], [0.8, 0.45], [0.5, 0.5], [1.0, 0.2], [0.9, 0.9]])
        for (const R of [1, 2.4, 4.8, 5.2])
          for (const I of [1.0, 1.5]) {
            const p = { ...base, sys, n, SDS, SD1, R, I };
            const { uit } = draai(set(twSeismicLoad, p));
            const e = ref(p);
            cnt++;
            if (!(near(uit.V, e.V) && near(uit.F_top, e.Fn) && near(uit.F_bot, e.F1) && near(uit.F_u, e.Fu) && near(uit.S_aD, e.SaD))) bad++;
          }
  meld(bad === 0, `${cnt} 組與獨立求解器一致`, `${bad} 組不符`);
}

console.log("\n3. 各層橫力合計等於 V（n = 8 與 20）");
for (const n of [8, 20]) {
  const p = { ...base, n };
  const e = ref(p);
  const sum = (p.w * p.h * n * (n + 1)) / 2;
  let tot = e.Ft;
  for (let i = 1; i <= n; i++) tot += ((e.V - e.Ft) * p.w * i * p.h) / sum;
  meld(Math.abs(tot - e.V) < 1e-9 * e.V, `n=${n} 合計 = V`);
}

console.log("\n4. 無效輸入一律拒算");
for (const [名, 舊, 新] of [
  ["臺北盆地", "taipei = 0'-", "taipei = 1'-"],
  ["S_DS 小於 S_D1/2.5", "S_DS = 0.80'-", "S_DS = 0.10'-"],
  ["R 超出 6", "R_duct = 4.8'-", "R_duct = 7'-"],
  ["I 非 1.0/1.25/1.5", "I_eq = 1.0'-", "I_eq = 1.1'-"],
  ["重量為零", "W_st = 450'tf", "W_st = 0'tf"],
]) {
  const { uit, res } = draai(vervang(twSeismicLoad, 舊, 新));
  meld(uit.V === undefined && res.voldoet !== true && res.nietGetoetst === true, `${名} 拒算`);
}

console.log(fouten === 0 ? "\n全部通過。" : `\n${fouten} 項失敗。`);
process.exit(fouten === 0 ? 0 : 1);
