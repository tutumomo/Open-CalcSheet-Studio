/** tw-wind-load 檢查腳本（wind103full 式 2.6、2.7）：獨立算式逐值比對、參數掃描與無效輸入拒算。 */
import { parse, evaluate } from "../packages/core/dist/index.js";
import { twWindLoad } from "../packages/desktop/src/templates/tw-wind-load.ts";
import { leesResultaat, leesGetallen } from "../packages/desktop/src/components/calc/bladLezen.ts";

let fouten = 0;
function meld(ok, t, d = "") { console.log(`  ${ok ? "OK    " : "FOUT  "} ${t}${ok || !d ? "" : `  -> ${d}`}`); if (!ok) fouten++; }
function draai(tpl) {
  const nodes = evaluate(parse(tpl.replaceAll("#hide\n", "#show\n")), {});
  return { uit: leesGetallen(nodes), res: leesResultaat(evaluate(parse(tpl), {}), "tw-wind-load") };
}
function vervang(tpl, o, n) { if (!tpl.includes(o)) throw new Error(`找不到：${o}`); return tpl.replace(o, n); }
const near = (a, b) => typeof a === "number" && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));

function ref({ V, I, Kzt, a, zg, G, n, h, B }) {
  const q = (z) => 0.06 * 2.774 * (Math.max(z, 5) / zg) ** (2 * a) * Kzt * (I * V) ** 2;
  let F = 0, M = 0;
  for (let i = 1; i <= n; i++) { const f = (q(i * h) * G * B * h) / 1000; F += f; M += f * i * h; }
  return { qh: q(n * h), F, M };
}
const base = { V: 40, I: 1, Kzt: 1, a: 0.15, zg: 300, G: 1.3, n: 8, h: 3.5, B: 20 };
const set = (p) => [
  ["V_10 = 40.0'm/s", `V_10 = ${p.V}'m/s`], ["I_w = 1.0'-", `I_w = ${p.I}'-`], ["K_zt = 1.0'-", `K_zt = ${p.Kzt}'-`],
  ["alpha_w = 0.15'-", `alpha_w = ${p.a}'-`], ["z_g = 300'm", `z_g = ${p.zg}'m`], ["GCp = 1.3'-", `GCp = ${p.G}'-`],
  ["n_st = 8'-", `n_st = ${p.n}'-`], ["h_st = 3.5'm", `h_st = ${p.h}'m`], ["B_w = 20'm", `B_w = ${p.B}'m`],
].reduce((t, [o, n]) => vervang(t, o, n), twWindLoad);

console.log("=== tw-wind-load（wind103full） ===\n");
console.log("0. 規範式釘死");
for (const s of ["0.06 * K", "2.774", "2 * alpha_w", "max(H_calc; 5)"]) meld(twWindLoad.includes(s), `範本含 ${s}`);

console.log("\n1. 基準案例");
{
  const { uit, res } = draai(twWindLoad); const e = ref(base);
  meld(near(uit.q_h, e.qh), `q(h) = ${e.qh.toFixed(2)} kgf/m2`, String(uit.q_h));
  meld(near(uit.V_w, e.F), `V_w = ${e.F.toFixed(3)} tf`, String(uit.V_w));
  meld(near(uit.M_w, e.M), `M_w = ${e.M.toFixed(2)} tf*m`, String(uit.M_w));
  meld(res.nietGetoetst === true && res.voldoet !== true, "結尾行為未檢核，不判合格");
}
console.log("\n2. 參數掃描");
{
  let bad = 0, c = 0;
  for (const V of [30, 40, 50]) for (const I of [1, 1.1]) for (const a of [0.15, 0.25, 0.32]) for (const zg of [300, 400, 500])
    for (const n of [1, 2, 5, 12, 30]) for (const h of [3, 4.2]) {
      const p = { ...base, V, I, a, zg, n, h }; const { uit } = draai(set(p)); const e = ref(p); c++;
      if (!(near(uit.V_w, e.F) && near(uit.M_w, e.M) && near(uit.q_h, e.qh))) bad++;
    }
  meld(bad === 0, `${c} 組與獨立求解器一致`, `${bad} 組不符`);
}
console.log("\n3. 無效輸入一律拒算");
for (const [名, o, n] of [
  ["V10 為零", "V_10 = 40.0'm/s", "V_10 = 0'm/s"],
  ["α 超出範圍", "alpha_w = 0.15'-", "alpha_w = 0.8'-"],
  ["高度超過 z_g", "n_st = 8'-", "n_st = 100'-"],
  ["G·Cp 非正", "GCp = 1.3'-", "GCp = 0'-"],
  ["寬度為零", "B_w = 20'm", "B_w = 0'm"],
]) {
  const { uit, res } = draai(vervang(twWindLoad, o, n));
  meld(uit.V_w === undefined && res.voldoet !== true && res.nietGetoetst === true, `${名} 拒算`);
}
console.log(fouten === 0 ? "\n全部通過。" : `\n${fouten} 項失敗。`);
process.exit(fouten === 0 ? 0 : 1);
