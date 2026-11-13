/**
 * tw-pile-foundation 檢查腳本（found112 5.3.1 單樁極限／容許垂直支承力與基樁數量）。
 *
 * 獨立 JS 求解器重算：表 5.3-2 之 N 值法支承力、表 5.3-1 之安全係數、式 5.3-1／5.3-2，
 * 與範本比對；並檢查不合格案例不得被誤判為合格、無效輸入一律拒算。
 *
 * 執行：node scripts/check-tw-pile-foundation.mjs
 */
import { parse, evaluate } from "../packages/core/dist/index.js";
import { twPileFoundation as T } from "../packages/desktop/src/templates/tw-pile-foundation.ts";
import { leesResultaat, leesGetallen } from "../packages/desktop/src/components/calc/bladLezen.ts";

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}
const draai = (tpl, sel = {}) => ({
  uit: leesGetallen(evaluate(parse(tpl.replaceAll("#hide\n", "#show\n")), sel)),
  res: leesResultaat(evaluate(parse(tpl), sel), "tw-pile-foundation"),
});
const vervang = (t, o, n) => {
  if (!t.includes(o)) throw new Error(`找不到：${o}`);
  return t.replace(o, n);
};
const near = (a, b, tol = 1e-9) => typeof a === "number" && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const set = (p) =>
  [["d_p = 600'-", `d_p = ${p.dp}'-`], ["L_p = 30000'-", `L_p = ${p.Lp}'-`], ["n_pile = 8'-", `n_pile = ${p.n}'-`],
   ["N_avg = 20'-", `N_avg = ${p.N}'-`], ["P_tot = 12000'-", `P_tot = ${p.P}'-`], ["W_p = 0'-", `W_p = ${p.W}'-`]]
    .reduce((t, [o, n]) => vervang(t, o, n), T);

/** 表 5.3-1：載重情況 → 推估方式 → [FS1, FS2]（已驗證表 found112_FS_pile_T531） */
const FS_TABEL = {
  1: { 1: [2.5, 3.5], 2: [1.8, 2.5] },
  2: { 1: [1.8, 2.5], 2: [1.3, 1.8] },
  3: { 1: [1.2, 1.5], 2: [1.1, 1.3] },
};

/** 獨立求解器：表 5.3-2 之 N 值法 + 式 5.3-1／5.3-2 + 表 5.3-1 */
function ref(p) {
  const As = Math.PI * (p.dp / 1000) * (p.Lp / 1000);
  const Ab = (Math.PI * (p.dp / 1000) ** 2) / 4;
  const fs = p.meth === 4 ? Math.min(p.N / 10, 5) : Math.min(p.N / 3, 15);
  const qbRaw = p.meth === 1 ? 30 * p.N : p.meth === 2 ? 7.5 * p.N : 25 * p.N;
  const qbCap = p.soil === 1 ? Infinity : p.meth === 1 ? 1800 : p.meth === 2 ? 750 : Infinity;
  const qb = Math.min(qbRaw, qbCap);
  const Qs = fs * As, Qb = qb * Ab, Qu = Qs + Qb;
  const [FS1, FS2] = FS_TABEL[p.lc][p.est];
  const Qa_tf = Qs / FS1 + Qb / FS2;
  const Qa_kN = Qa_tf * 9.80665;
  const Pp = p.P / p.n + p.W;
  const UCp = Pp / Qa_kN;
  const nreq = Qa_kN > p.W ? Math.ceil(p.P / (Qa_kN - p.W)) : 0;
  const UCn = nreq > 0 ? nreq / p.n : 99;
  return { As, Ab, fs, qb, Qs, Qb, Qu, FS1, FS2, Qa_kN, Pp, UCp, nreq, UCn, ucmax: Math.ceil(Math.max(UCp, UCn) * 100) / 100 };
}

const base = { dp: 600, Lp: 30000, n: 8, N: 20, P: 12000, W: 0, meth: 1, soil: 1, est: 1, lc: 1 };

console.log("=== tw-pile-foundation（found112 5.3.1 單樁承載力） ===\n");
console.log("0. 規範式釘死");
for (const s of ["Q_u_tf = Q_s_tf + Q_b_tf", "Q_a_tf = Q_s_tf/FS1 + Q_b_tf/FS2", "min(N_avg/3; 15)", "min(N_avg/10; 5)",
                 "30*N_avg", "7.5*N_avg", "25*N_avg", "1800", "750", "Q_a_tf*9.80665", "ceil(P_tot/(Q_a_kN - W_p))"])
  meld(T.includes(s), `範本含 ${s}`);

console.log("\n1. 基準案例手算（打入式、N=20、d=600 mm、L=30 m、8 根樁、P=12000 kN）");
{
  const { uit, res } = draai(T, { meth: 1, soil: 1, est: 1, lc: 1 });
  const e = ref(base);
  meld(near(e.As, 56.548667764616276) && near(e.Ab, 0.2827433388230814), "獨立求解器 A_s、A_b");
  meld(near(uit.fs_out, e.fs) && near(uit.qb_out, e.qb), `f_s = ${e.fs}、q_b = ${e.qb} tf/m²`, `${uit.fs_out} / ${uit.qb_out}`);
  meld(near(uit.Qs_out, e.Qs) && near(uit.Qb_out, e.Qb) && near(uit.Qu_out, e.Qu), "Q_s、Q_b、Q_u");
  meld(near(uit.FS1_out, 2.5) && near(uit.FS2_out, 3.5), "FS1 = 2.5、FS2 = 3.5（常時／推估公式）");
  meld(near(uit.Qa_out, e.Qa_kN), `Q_a = ${e.Qa_kN.toFixed(1)} kN`, String(uit.Qa_out));
  meld(near(uit.nreq_out, e.nreq), `需求樁數 n_req = ${e.nreq}`, String(uit.nreq_out));
  meld(near(uit.UC_max, e.ucmax), `UC_max = ${e.ucmax}`, String(uit.UC_max));
  meld(res.voldoet === (e.ucmax <= 1), "結尾判定與 UC 一致", JSON.stringify(res));
}

console.log("\n2. 參數掃描（四施工法、兩土別、兩推估方式、三載重情況）");
{
  let bad = 0, c = 0, pass = 0, fail = 0;
  for (const meth of [1, 2, 3, 4])
    for (const soil of [1, 2])
      for (const est of [1, 2])
        for (const lc of [1, 2, 3])
          for (const N of [5, 12, 20, 35, 50])
            for (const dp of [500, 600, 800])
              for (const Lp of [20000, 30000, 40000])
                for (const n of [4, 8, 12])
                  for (const P of [8000, 12000, 30000]) {
                    const p = { ...base, meth, soil, est, lc, N, dp, Lp, n, P };
                    const { uit, res } = draai(set(p), { meth, soil, est, lc });
                    const e = ref(p);
                    c++;
                    e.ucmax <= 1 ? pass++ : fail++;
                    if (soil === 2 && meth >= 3) {
                      // 卵礫石層之預鑽孔與中掘工法：規範未列樁端支承壓力上限，維持拒算
                      if (!(uit.UC_max === undefined && res.nietGetoetst === true)) bad++;
                      continue;
                    }
                    if (!(near(uit.fs_out, e.fs) && near(uit.qb_out, e.qb) && near(uit.Qs_out, e.Qs) && near(uit.Qb_out, e.Qb)
                      && near(uit.FS1_out, e.FS1) && near(uit.FS2_out, e.FS2) && near(uit.Qa_out, e.Qa_kN)
                      && near(uit.nreq_out, e.nreq) && near(uit.UC_max, e.ucmax) && res.voldoet === (e.ucmax <= 1))) bad++;
                  }
  meld(bad === 0, `${c} 組與獨立求解器一致`, `${bad} 組不符`);
  meld(pass > 50 && fail > 50, `涵蓋合格 ${pass} 組與不合格 ${fail} 組`);
}

console.log("\n3. 表 5.3-1 安全係數逐格核對");
{
  let bad = 0;
  for (const lc of [1, 2, 3])
    for (const est of [1, 2]) {
      const { uit } = draai(set(base), { meth: 1, soil: 1, est, lc });
      const [FS1, FS2] = FS_TABEL[lc][est];
      if (!near(uit.FS1_out, FS1) || !near(uit.FS2_out, FS2)) bad++;
    }
  meld(bad === 0, "6 組（載重情況 × 推估方式）FS1／FS2 與已驗證表一致", `${bad} 組不符`);
}

console.log("\n4. 表 5.3-2 特殊條款");
{
  const a = draai(set({ ...base, meth: 1, soil: 2, N: 80 }), { meth: 1, soil: 2, est: 1, lc: 1 });
  meld(a.uit.qb_out === 1800, "卵礫石層打入式 q_b 上限 1800 tf/m²（N=80）", String(a.uit.qb_out));
  const b = draai(set({ ...base, meth: 2, soil: 2, N: 150 }), { meth: 2, soil: 2, est: 1, lc: 1 });
  meld(b.uit.qb_out === 750, "卵礫石層鑽掘式 q_b 上限 750 tf/m²（N=150）", String(b.uit.qb_out));
  const c2 = draai(set({ ...base, meth: 4, N: 50 }), { meth: 4, soil: 1, est: 1, lc: 1 });
  meld(c2.uit.fs_out === 5, "中掘工法 f_s 上限 5 tf/m²", String(c2.uit.fs_out));
  const d = draai(set({ ...base, meth: 1, N: 50 }), { meth: 1, soil: 1, est: 1, lc: 1 });
  meld(d.uit.fs_out === 15, "打入式 f_s 上限 15 tf/m²", String(d.uit.fs_out));
  const e2 = draai(set({ ...base, meth: 3, soil: 2, N: 60 }), { meth: 3, soil: 2, est: 1, lc: 1 });
  meld(e2.uit.UC_max === undefined && e2.res.nietGetoetst === true, "卵礫石層預鑽孔工法：規範未列上限，維持拒算");
}

console.log("\n5. 負向：不得誤判合格");
for (const [名, patch, sel] of [
  ["載重過大（P=60000 kN）", { P: 60000 }, { meth: 1, soil: 1, est: 1, lc: 1 }],
  ["N 值過小（N=2）", { N: 2 }, { meth: 1, soil: 1, est: 1, lc: 1 }],
  ["樁數不足", { n: 2 }, { meth: 1, soil: 1, est: 1, lc: 1 }],
  ["短期載重情況且載重過大", { P: 30000 }, { meth: 1, soil: 1, est: 1, lc: 2 }],
]) {
  const p = { ...base, ...patch };
  const { res } = draai(set(p), sel);
  meld(res.voldoet === false && ref(p).ucmax > 1, `${名} → 不合格`, JSON.stringify(res));
}
{
  // 極限限界狀態之安全係數較小，容許支承力應大於常時載重情況
  const a = draai(set(base), { meth: 1, soil: 1, est: 1, lc: 1 });
  const b = draai(set(base), { meth: 1, soil: 1, est: 1, lc: 3 });
  meld(b.uit.Qa_out > a.uit.Qa_out, "極限限界狀態之容許支承力大於常時載重情況（FS 較小）", `${a.uit.Qa_out} → ${b.uit.Qa_out}`);
}

console.log("\n6. 無效輸入一律拒算");
for (const [名, patch, sel] of [
  ["砂質土層 N 值超過 50", { N: 60 }, { meth: 1, soil: 1, est: 1, lc: 1 }],
  ["樁徑為零", { dp: 0 }, { meth: 1, soil: 1, est: 1, lc: 1 }],
  ["樁數為零", { n: 0 }, { meth: 1, soil: 1, est: 1, lc: 1 }],
  ["樁長為零", { Lp: 0 }, { meth: 1, soil: 1, est: 1, lc: 1 }],
  ["載重為零", { P: 0 }, { meth: 1, soil: 1, est: 1, lc: 1 }],
  ["施工法超出範圍", {}, { meth: 5, soil: 1, est: 1, lc: 1 }],
  ["土別超出範圍", {}, { meth: 1, soil: 3, est: 1, lc: 1 }],
  ["載重情況超出範圍", {}, { meth: 1, soil: 1, est: 1, lc: 4 }],
  ["推估方式超出範圍", {}, { meth: 1, soil: 1, est: 3, lc: 1 }],
]) {
  const p = { ...base, ...patch };
  const { uit, res } = draai(set(p), sel);
  meld(uit.UC_max === undefined && res.voldoet !== true && res.nietGetoetst === true, `${名} 拒算`);
}

console.log(fouten === 0 ? "\n全部通過。" : `\n${fouten} 項失敗。`);
process.exit(fouten === 0 ? 0 : 1);
