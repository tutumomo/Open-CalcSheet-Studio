/**
 * tw-rc-slab 檢查腳本（rc112 單向板）。
 * 以獨立純 JS 求解器逐式重算（表 6.5.2/6.5.4、7.3.1.1、7.6.1.1、24.4.3、22.5.5.1(c)、20.5.1.3.1），
 * 與範本掃描比對；另測拒算輸入與「不得誤判合格」的負向案例。
 * 手算基準（h=150、ln=3 m、兩端連續、內跨正彎矩 1/16、D13@150）：
 *   D=3.6+2=5.6、wu=1.2·5.6+1.6·3=11.52 kN/m²、Mu=11.52·9/16=6.48 kN·m/m、d=150−20−6.35=123.65 mm、
 *   As=126.7·1000/150=844.67 mm²/m、a=844.67·420/(0.85·28·1000)=14.904 mm。
 */
import { parse, evaluate } from "../packages/core/dist/index.js";
import { twRcSlab } from "../packages/desktop/src/templates/tw-rc-slab.ts";
import { leesResultaat, leesGetallen } from "../packages/desktop/src/components/calc/bladLezen.ts";

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}
function draai(tpl) {
  const nodes = evaluate(parse(tpl.replaceAll("#hide\n", "#show\n")), {});
  return { uit: leesGetallen(nodes), res: leesResultaat(evaluate(parse(tpl), {}), "tw-rc-slab") };
}
const base = { fc: 28, fy: 420, h: 150, ln: 3.0, Ll: 7.0, sup: 3, mc: 4, wD: 2.0, wL: 3.0, env: 1, cover: 20, bar: 13, s: 150, bt: 10, st: 250 };
const NAMES = { fc: "f_c", fy: "f_y", h: "h", ln: "ln", Ll: "L_long", sup: "sup", mc: "mc", wD: "w_D", wL: "w_L", env: "env", cover: "cover", bar: "bar", s: "s", bt: "bar_t", st: "s_t" };
function set(tpl, p) {
  let t = tpl;
  for (const [k, n] of Object.entries(NAMES)) {
    const re = new RegExp(`^${n} = [^'\\n]*'-`, "m");
    if (!re.test(t)) throw new Error(`找不到輸入 ${n}`);
    t = t.replace(re, `${n} = ${p[k]}'-`);
  }
  return t;
}
const BAR = { 10: [9.53, 71.33], 13: [12.7, 126.7], 16: [15.9, 198.6], 19: [19.1, 286.5], 22: [22.2, 387.1], 25: [25.4, 506.7] };
const COEF = { 1: 1 / 8, 2: 1 / 14, 3: 1 / 11, 4: 1 / 16, 5: 1 / 9, 6: 1 / 10, 7: 1 / 11, 8: 1 / 2, 9: 1 / 12 };

/** 獨立求解器 */
function ref(p) {
  const [db, Ab] = BAR[p.bar];
  const [, Abt] = BAR[p.bt];
  const D = (24 * p.h) / 1000 + p.wD;
  const wu = 1.2 * D + 1.6 * p.wL;
  const Mu = COEF[p.mc] * wu * p.ln ** 2;
  const Vu = p.mc === 8 ? wu * p.ln : p.mc === 5 || p.mc === 6 ? (1.15 * wu * p.ln) / 2 : (wu * p.ln) / 2;
  const hmin = (p.ln * 1000) / { 1: 20, 2: 24, 3: 28, 4: 10 }[p.sup];
  const covMin = p.env === 1 ? 20 : p.env === 2 ? (db <= 15.9 ? 40 : 50) : p.env === 3 ? 75 : 100;
  const d = p.h - p.cover - db / 2;
  const As = (Ab * 1000) / p.s;
  const a = (As * p.fy) / (0.85 * p.fc * 1000);
  const b1 = p.fc <= 28 ? 0.85 : Math.max(0.65, 0.85 - (0.05 * (p.fc - 28)) / 7);
  const c = a / b1;
  const et = (0.003 * (d - c)) / c;
  const phiMn = (0.9 * As * p.fy * (d - a / 2)) / 1e6;
  const Asmin = 0.0018 * 1000 * p.h;
  const rho = As / (1000 * d);
  const ls = Math.min(1, Math.sqrt(2 / (1 + d / 250)));
  const Vc = Math.min(0.68 * ls * rho ** (1 / 3) * Math.sqrt(p.fc), 0.42 * Math.sqrt(p.fc)) * d; // N/mm → kN/m
  const UC = {
    h: hmin / p.h, cov: covMin / p.cover, eps: et > 0 ? 0.005 / et : 99, m: Mu / phiMn, As: Asmin / As,
    s: p.s / Math.min(3 * p.h, 450), ts: Asmin / ((Abt * 1000) / p.st), tsp: p.st / Math.min(5 * p.h, 450), v: Vu / (0.75 * Vc),
  };
  const ucmax = Math.ceil(Math.max(...Object.values(UC)) * 100) / 100;
  return { D, wu, Mu, Vu, hmin, d, As, a, et, phiMn, Vc: 0.75 * Vc, UC, ucmax };
}
const near = (a, b) => typeof a === "number" && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));

console.log("=== tw-rc-slab（rc112 單向板） ===\n");
console.log("0. 規範式釘死");
for (const s of ["0.0018*1000*h", "min(3*h; 450)", "min(5*h; 450)", "0.68*lam_s", "0.42*sqrt(f_c)", "1.15*w_u*ln/2", "1.2*D_tot + 1.6*w_L", "0.005/eps_t", "if(sup ≡ 3; 28"])
  meld(twRcSlab.includes(s), `範本含 ${s}`);

console.log("\n1. 手算基準");
{
  const { uit, res } = draai(twRcSlab);
  const e = ref(base);
  meld(near(e.wu, 11.52) && near(e.Mu, 6.48), "手算 wu=11.52、Mu=6.48");
  meld(near(e.d, 123.65) && near(e.As, 844.6666666666666), "手算 d=123.65、As=844.67");
  meld(near(uit.w_u_out, e.wu) && near(uit.M_u_out, e.Mu), "範本 wu、Mu");
  meld(near(uit.d_out, e.d) && near(uit.As_out, e.As), "範本 d、As");
  meld(near(uit.phiMn_out, e.phiMn) && near(uit.phiVc_out, e.Vc), "範本 φMn、φVc");
  meld(near(uit.UC_max, e.ucmax), `UC_max = ${e.ucmax}`, String(uit.UC_max));
  meld(res.voldoet === (e.ucmax <= 1), `結尾判定與 UC 一致（UC=${e.ucmax}）`);
}

console.log("\n2. 參數掃描");
{
  let bad = 0, cnt = 0, pass = 0, fail = 0;
  const cases = [];
  for (const [sup, mc] of [[1, 1], [2, 2], [2, 3], [3, 4], [3, 5], [3, 6], [3, 7], [4, 8], [3, 9]])
    for (const h of [100, 150, 220])
      for (const ln of [2.0, 2.8, 4.5])
        for (const bar of [10, 16, 22])
          for (const s of [100, 200])
            for (const wL of [2, 5])
              for (const env of [1, 2, 3])
                for (const fc of [21, 28, 40]) cases.push({ ...base, sup, mc, h, ln, bar, s, wL, env, fc, cover: [20, 40, 75][env - 1], Ll: ln * 3 });
  for (const p of cases) {
    if (p.mc === 9 && p.ln >= 3) continue;
    const D = (24 * p.h) / 1000 + p.wD;
    if ((p.sup === 2 || p.sup === 3) && p.wL > 3 * D) continue;
    const { uit, res } = draai(set(twRcSlab, p));
    const e = ref(p);
    cnt++;
    e.ucmax <= 1 ? pass++ : fail++;
    if (!(near(uit.UC_max, e.ucmax) && near(uit.M_u_out, e.Mu) && near(uit.phiMn_out, e.phiMn) && near(uit.phiVc_out, e.Vc) && res.voldoet === (e.ucmax <= 1))) bad++;
  }
  meld(bad === 0, `${cnt} 組與獨立求解器一致`, `${bad} 組不符`);
  meld(pass > 50 && fail > 50, `涵蓋合格 ${pass} 組與不合格 ${fail} 組`);
}

console.log("\n3. 負向：不得誤判合格");
for (const [名, patch] of [
  ["板厚不足（h=80）", { h: 80 }],
  ["配筋過少（D10@300）", { bar: 10, s: 300 }],
  ["溫度筋間距過大", { st: 450 }],
  ["保護層不足（暴露環境 20 mm）", { env: 2, cover: 20 }],
  ["超筋（D25@60 薄板）", { bar: 25, s: 60, h: 120 }],
  ["彎矩過大（活載重 30）", { wL: 30, sup: 1, mc: 1 }],
]) {
  const p = { ...base, ...patch };
  const { res } = draai(set(twRcSlab, p));
  meld(res.voldoet === false && ref(p).ucmax > 1, `${名} → 不合格`, JSON.stringify(res));
}

console.log("\n4. 無效輸入一律拒算");
for (const [名, patch] of [
  ["雙向板（長向 < 2 倍短向）", { Ll: 4 }],
  ["fy = 280", { fy: 280 }],
  ["簡支搭配連續彎矩係數", { sup: 1, mc: 4 }],
  ["號數 D14 不存在", { bar: 14 }],
  ["連續板 L > 3D", { wL: 30 }],
  ["彎矩斷面 9 但 ln ≥ 3 m", { mc: 9, ln: 3.5, Ll: 8 }],
]) {
  const { uit, res } = draai(set(twRcSlab, { ...base, ...patch }));
  meld(uit.UC_max === undefined && res.voldoet !== true && res.nietGetoetst === true, `${名} 拒算`);
}
console.log(fouten === 0 ? "\n全部通過。" : `\n${fouten} 項失敗。`);
process.exit(fouten === 0 ? 0 : 1);
