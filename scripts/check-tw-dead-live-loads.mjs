/** tw-dead-live-loads 檢查腳本：第 26 條屋頂表、第 25 條折減、第 17 條最小值與載重組合，獨立算式比對。 */
import { parse, evaluate } from "../packages/core/dist/index.js";
import { twDeadLiveLoads as T } from "../packages/desktop/src/templates/tw-dead-live-loads.ts";
import { leesResultaat, leesGetallen } from "../packages/desktop/src/components/calc/bladLezen.ts";

let fouten = 0;
const meld = (ok, t, d = "") => { console.log(`  ${ok ? "OK    " : "FOUT  "} ${t}${ok || !d ? "" : `  -> ${d}`}`); if (!ok) fouten++; };
const draai = (tpl) => ({
  uit: leesGetallen(evaluate(parse(tpl.replaceAll("#hide\n", "#show\n")), {})),
  res: leesResultaat(evaluate(parse(tpl), {}), "tw-dead-live-loads"),
});
const vervang = (t, o, n) => { if (!t.includes(o)) throw new Error(`找不到：${o}`); return t.replace(o, n); };
const near = (a, b) => typeof a === "number" && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
const set = (p) => [
  ["t_s = 0.15'm", `t_s = ${p.ts}'m`], ["w_fin = 100'kgf/m^2", `w_fin = ${p.fin}'kgf/m^2`], ["w_oth = 60'kgf/m^2", `w_oth = ${p.oth}'kgf/m^2`],
  ["cat = 1'-", `cat = ${p.cat}'-`], ["L_in = 200'kgf/m^2", `L_in = ${p.L}'kgf/m^2`], ["roof = 1'-", `roof = ${p.roof}'-`],
  ["A_t = 30'm^2", `A_t = ${p.A}'m^2`], ["crowd = 0'-", `crowd = ${p.crowd}'-`],
].reduce((t, [o, n]) => vervang(t, o, n), T);

// 第 26 條表（已驗證庫 btr_struct_roof_live_T26）
const T26 = { 1: [100, 80, 60], 2: [80, 70, 60], 3: [60, 60, 60] };
function ref(p) {
  const D = p.ts * 2400 + p.fin + p.oth;
  const roofL = T26[p.roof][p.A <= 20 ? 0 : p.A <= 60 ? 1 : 2];
  const L = p.cat === 1 ? p.L : p.cat === 4 ? Math.max(p.L, roofL) : Math.max(p.L, 500);
  const elig = L <= 500 && p.crowd === 0 && p.cat !== 3 && p.A > 14;
  const R = elig ? Math.min(0.85 * (p.A - 14), 23 * (1 + D / L), 60) : 0;
  const Lr = L * (1 - R / 100);
  const Lc = L > 500 && p.cat !== 4 ? L * 0.8 : Lr;
  return { D, L, R, Lr, Lc, u1: 1.4 * D, u2: 1.2 * D + 1.6 * Lr, u2c: 1.2 * D + 1.6 * Lc };
}
const base = { ts: 0.15, fin: 100, oth: 60, cat: 1, L: 200, roof: 1, A: 30, crowd: 0 };

console.log("=== tw-dead-live-loads（btr_struct） ===\n");
console.log("0. 第 26 條表值釘死（對照已驗證庫）");
for (const s of ["if(A_t ≤ 20; 100; if(A_t ≤ 60; 80; 60))", "if(A_t ≤ 20; 80; if(A_t ≤ 60; 70; 60))", "23 * (1 + D_calc / L_calc)", "min(R1_calc; min(R2_calc; 60))", "max(L_in; 500)"])
  meld(T.includes(s), `範本含 ${s}`);

console.log("\n1. 基準案例手算");
{
  const { uit, res } = draai(T); const e = ref(base);
  meld(near(uit.D, 520), "D = 0.15×2400 + 100 + 60 = 520", String(uit.D));
  meld(near(uit.L, 200) && near(uit.R_pct, Math.min(13.6, 23 * (1 + 520 / 200), 60)), `R = 13.6 %`, String(uit.R_pct));
  meld(near(uit.w_u2, e.u2), `1.2D+1.6L = ${e.u2.toFixed(2)}`, String(uit.w_u2));
  meld(res.nietGetoetst === true && res.voldoet !== true, "結尾行為未檢核，不判合格");
}
console.log("\n2. 參數掃描（四類別、三屋頂形式、面積跨 14/20/60、人群旗標）");
{
  let bad = 0, c = 0;
  for (const cat of [1, 2, 3, 4]) for (const roof of [1, 2, 3]) for (const A of [10, 14, 15, 20, 21, 60, 61, 200, 1000])
    for (const L of [50, 200, 300, 500, 600]) for (const crowd of [0, 1]) for (const ts of [0.12, 0.2]) {
      const p = { ...base, cat, roof, A, L, crowd, ts }; const { uit } = draai(set(p)); const e = ref(p); c++;
      if (!(near(uit.D, e.D) && near(uit.L, e.L) && near(uit.R_pct, e.R) && near(uit.L_red, e.Lr) && near(uit.L_col, e.Lc) && near(uit.w_u1, e.u1) && near(uit.w_u2, e.u2) && near(uit.w_u2c, e.u2c))) bad++;
    }
  meld(bad === 0, `${c} 組與獨立算式一致`, `${bad} 組不符`);
}
console.log("\n3. 安全邊界");
{
  let { uit } = draai(set({ ...base, cat: 2, L: 100 })); meld(uit.L === 500, "停車場低於 500 一律提升為 500");
  ({ uit } = draai(set({ ...base, cat: 4, L: 10, A: 70 }))); meld(uit.L === 60, "平屋頂 > 60 m² 取 60 kgf/m²");
  ({ uit } = draai(set({ ...base, cat: 1, L: 200, crowd: 1 }))); meld(uit.R_pct === 0, "人群聚集場所不折減");
  ({ uit } = draai(set({ ...base, cat: 1, L: 600 }))); meld(uit.R_pct === 0 && uit.L_col === 480, "L > 500：梁不折減、柱基礎減 20%");
  ({ uit } = draai(set({ ...base, A: 1000, L: 50 }))); meld(uit.R_pct <= 60, "折減不超過 60%");
}
console.log("\n4. 無效輸入一律拒算");
for (const [名, o, n] of [
  ["樓版厚為零", "t_s = 0.15'm", "t_s = 0'm"], ["類別超出", "cat = 1'-", "cat = 7'-"],
  ["類別 1 未輸入 L", "L_in = 200'kgf/m^2", "L_in = 0'kgf/m^2"], ["面積為零", "A_t = 30'm^2", "A_t = 0'm^2"],
  ["人群旗標非 0/1", "crowd = 0'-", "crowd = 2'-"],
]) {
  const { uit, res } = draai(vervang(T, o, n));
  meld(uit.D === undefined && res.voldoet !== true && res.nietGetoetst === true, `${名} 拒算`);
}
console.log(fouten === 0 ? "\n全部通過。" : `\n${fouten} 項失敗。`);
process.exit(fouten === 0 ? 0 : 1);
