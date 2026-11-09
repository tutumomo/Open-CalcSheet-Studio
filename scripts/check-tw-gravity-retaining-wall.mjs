/**
 * tw-gravity-retaining-wall 檢查腳本（found112 7.4 / swc_tech 120 / rc112 14.5）。
 * 獨立求解器以「逐薄片數值積分」求牆重、力矩與土壓力，不使用範本的三角形／梯形閉合式，
 * 與範本逐項交叉比對；並測不得誤判合格的負向案例與拒算輸入。
 */
import { parse, evaluate } from "../packages/core/dist/index.js";
import { twGravityRetainingWall } from "../packages/desktop/src/templates/tw-gravity-retaining-wall.ts";
import { leesResultaat, leesGetallen } from "../packages/desktop/src/components/calc/bladLezen.ts";

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}
function draai(tpl) {
  const nodes = evaluate(parse(tpl.replaceAll("#hide\n", "#show\n")), {});
  return { uit: leesGetallen(nodes), res: leesResultaat(evaluate(parse(tpl), {}), "tw-gravity-retaining-wall") };
}
const base = { H: 3.0, t: 0.8, B: 2.6, gw: 24, mat: 1, fc: 21, fta: 0, fca: 1000, fva: 150, gs: 18, phi: 30, q: 10, mu: 0.5, qa: 200, base: 1 };
const NAMES = { H: "H", t: "t_top", B: "B", gw: "g_w", mat: "mat", fc: "f_c", fta: "ft_a", fca: "fc_a", fva: "fv_a", gs: "g_s", phi: "phi_s", q: "q_sur", mu: "mu_b", qa: "q_a", base: "base" };
function set(tpl, p) {
  let t = tpl;
  for (const [k, n] of Object.entries(NAMES)) {
    const re = new RegExp(`^${n} = [^'\\n]*'-`, "m");
    if (!re.test(t)) throw new Error(`找不到輸入 ${n}`);
    t = t.replace(re, `${n} = ${p[k]}'-`);
  }
  return t;
}

/** 以 N 片數值積分（中點法）：自背面 x=0 起，深度 y 處寬 b(y) = t + (B−t)y/H */
function slices(p, y, N = 4000) {
  const bw = (yy) => p.t + ((p.B - p.t) * yy) / p.H;
  const b = bw(y);
  let W = 0, Mc = 0; // Mc：對斷面中心之力矩（正 = 前側受拉，即重心偏背面）
  const dy = y / N;
  for (let i = 0; i < N; i++) {
    const yy = (i + 0.5) * dy;
    const wi = bw(yy);
    const dW = p.gw * wi * dy;
    const xc = wi / 2; // 該薄片重心距背面
    W += dW;
    Mc += dW * (b / 2 - xc);
  }
  let Pa = 0, Me = 0;
  const Ka = Math.tan(((45 - p.phi / 2) * Math.PI) / 180) ** 2;
  for (let i = 0; i < N; i++) {
    const yy = (i + 0.5) * dy;
    const sig = Ka * (p.gs * yy + p.q);
    Pa += sig * dy;
    Me += sig * dy * (y - yy);
  }
  return { b, W, Mc, Pa, Me, Ka };
}
function ref(p) {
  const full = slices(p, p.H);
  const { Ka, Pa } = full;
  // 傾覆力矩：對牆趾（x=B），土壓力作用在背面（水平），力臂 = H − y
  const Mo = full.Me;
  // 抵抗力矩：薄片重力對牆趾，臂 = B − xc
  let Wt = 0, Mr = 0;
  const N = 4000, dy = p.H / N;
  for (let i = 0; i < N; i++) {
    const yy = (i + 0.5) * dy;
    const wi = p.t + ((p.B - p.t) * yy) / p.H;
    const dW = p.gw * wi * dy;
    Wt += dW; Mr += dW * (p.B - wi / 2);
  }
  const FSot = Mr / Mo, FSsl = (p.mu * Wt) / Pa;
  const xR = (Mr - Mo) / Wt, e = p.B / 2 - xR, elim = p.base === 1 ? p.B / 6 : p.B / 4;
  const qmax = Math.abs(e) <= p.B / 6 ? (Wt / p.B) * (1 + (6 * Math.abs(e)) / p.B) : p.B / 2 - Math.abs(e) > 0 && xR > 0 ? (2 * Wt) / (3 * (p.B / 2 - Math.abs(e))) : 99999;
  const kE = p.mat === 1 ? 1.6 : 1, kD1 = p.mat === 1 ? 0.9 : 1, kD2 = p.mat === 1 ? 1.4 : 1;
  const limt = p.mat === 1 ? 0.6 * 0.42 * Math.sqrt(p.fc) * 1000 : p.fta;
  const limc = p.mat === 1 ? 0.6 * 0.85 * p.fc * 1000 : p.fca;
  const sec = (y) => {
    const s = slices(p, y);
    const S = s.b ** 2 / 6;
    const M1 = Math.abs(kE * s.Me - kD1 * s.Mc), M2 = kD2 * s.Mc;
    const st = Math.max(M1 / S - (kD1 * s.W) / s.b, M2 / S - (kD2 * s.W) / s.b, 0);
    const sc = Math.max(M1 / S + (kD1 * s.W) / s.b, M2 / S + (kD2 * s.W) / s.b);
    const limv = p.mat === 1 ? 0.6 * 0.11 * Math.sqrt(p.fc) * 1000 * s.b : p.fva * s.b;
    return { st, sc, t: st <= 1e-6 ? 0 : limt > 0 ? st / limt : 99, c: sc / limc, v: (kE * s.Pa) / limv };
  };
  const s1 = sec(p.H), s2 = sec(p.H / 2);
  const UC = { ot: 2 / FSot, sl: 1.5 / FSsl, ecc: Math.abs(e) / elim, bear: qmax / p.qa, H: p.H / 4, t1: s1.t, c1: s1.c, v1: s1.v, t2: s2.t, c2: s2.c, v2: s2.v };
  return { Pa, Mo, Wt, Mr, FSot, FSsl, e, qmax, s1, s2, UC, ucmax: Math.ceil(Math.max(...Object.values(UC)) * 100) / 100 };
}
const near = (a, b, t = 2e-5) => typeof a === "number" && Math.abs(a - b) <= t * Math.max(1, Math.abs(b));

console.log("=== tw-gravity-retaining-wall（found112 / swc_tech / rc112） ===\n");
console.log("0. 規範式釘死");
for (const s of ["0.5*Ka*g_s*H^2", "0.6*0.42*sqrt(f_c)*1000", "0.6*0.85*f_c*1000", "0.6*0.11*sqrt(f_c)*1000*b_s(y)", "UC_ot = 2.0/FS_ot", "UC_sl = 1.5/FS_sl", "B/6; B/4", "UC_H = H/4.0", "kE = if(mat ≡ 1; 1.6; 1.0)", "kD1 = if(mat ≡ 1; 0.9; 1.0)", "kD2 = if(mat ≡ 1; 1.4; 1.0)"])
  meld(twGravityRetainingWall.includes(s), `範本含 ${s}`);

console.log("\n1. 基準案例（手算 + 數值積分）");
{
  const { uit, res } = draai(twGravityRetainingWall);
  const e = ref(base);
  // 手算：Ka=1/3；Pa=0.5·(1/3)·18·9+(1/3)·10·3=27+10=37；Mo=27·1+10·1.5=42；
  // W1=24·0.8·3=57.6，W2=24·1.8·3/2=64.8；Mr=57.6·2.2+64.8·(2·1.8/3)=126.72+77.76=204.48
  meld(near(e.Pa, 37, 1e-6) && near(e.Mo, 42, 1e-6), "手算 Pa=37、Mo=42");
  meld(near(e.Wt, 122.4, 1e-6) && near(e.Mr, 204.48, 1e-6), "手算 ΣW=122.4、Mr=204.48");
  meld(near(uit.Pa_out, e.Pa) && near(uit.Mo_out, e.Mo) && near(uit.Wt_out, e.Wt) && near(uit.Mr_out, e.Mr), "範本與積分一致");
  meld(near(uit.FSot_out, e.FSot) && near(uit.FSsl_out, e.FSsl) && near(uit.qmax_out, e.qmax), "FS 與 q_max 一致");
  meld(near(uit.st1_out, e.s1.st, 1e-4) && near(uit.sc1_out, e.s1.sc, 1e-4) && near(uit.st2_out, e.s2.st, 1e-4) && near(uit.sc2_out, e.s2.sc, 1e-4), "牆身斷面應力一致");
  meld(near(uit.UC_max, e.ucmax, 1e-9), `UC_max = ${e.ucmax}`, String(uit.UC_max));
  meld(res.voldoet === (e.ucmax <= 1), "結尾判定與 UC 一致");
}

console.log("\n2. 參數掃描（混凝土／砌石、土層／岩盤）");
{
  let bad = 0, cnt = 0, pass = 0, fail = 0;
  for (const mat of [1, 2])
    for (const H of [2, 3.5])
      for (const [t, B] of [[0.5, 1.6], [0.8, 2.6], [1.0, 3.4]])
        for (const phi of [26, 34])
          for (const q of [0, 20])
            for (const mu of [0.4, 0.6])
              for (const bs of [1, 2])
                for (const fta of mat === 2 ? [0, 50] : [0]) {
                  const p = { ...base, mat, H, t, B, phi, q, mu, base: bs, fta };
                  const { uit, res } = draai(set(twGravityRetainingWall, p));
                  const e = ref(p);
                  cnt++; e.ucmax <= 1 ? pass++ : fail++;
                  if (!(near(uit.FSot_out, e.FSot) && near(uit.FSsl_out, e.FSsl) && near(uit.UC_max, e.ucmax, 1e-9) && res.voldoet === (e.ucmax <= 1))) { bad++; if (bad < 4) console.log(JSON.stringify(p), uit.UC_max, e.ucmax, JSON.stringify(e.UC)); }
                }
  meld(bad === 0, `${cnt} 組與數值積分求解器一致`, `${bad} 組不符`);
  meld(pass > 20 && fail > 20, `涵蓋合格 ${pass} 組與不合格 ${fail} 組`);
}

console.log("\n3. 負向：不得誤判合格");
for (const [名, patch] of [
  ["抗滑動不足（μ=0.3）", { mu: 0.3 }],
  ["抗傾覆不足（瘦長牆）", { t: 0.4, B: 1.0 }],
  ["偏心過大（岩盤合力仍須在中段 1/2）", { t: 0.4, B: 1.3, mu: 0.9 }],
  ["承載力不足（q_a=30）", { qa: 30 }],
  ["高度超過 4 m", { H: 4.5, t: 1.0, B: 3.8 }],
  ["砌石不容許受拉（ft_a=0）且偏心大", { mat: 2, t: 0.4, B: 1.4, mu: 0.9, qa: 500 }],
]) {
  const p = { ...base, ...patch };
  const { res } = draai(set(twGravityRetainingWall, p));
  meld(res.voldoet === false && ref(p).ucmax > 1, `${名} → 不合格`, JSON.stringify(res));
}

console.log("\n4. 無效輸入一律拒算");
for (const [名, patch] of [
  ["牆頂寬大於底寬", { t: 3.0 }], ["φ = 50°", { phi: 50 }], ["材料選項 3", { mat: 3 }], ["地盤選項 0", { base: 0 }], ["μ = 0", { mu: 0 }], ["f'c = 5", { fc: 5 }],
]) {
  const { uit, res } = draai(set(twGravityRetainingWall, { ...base, ...patch }));
  meld(uit.UC_max === undefined && res.voldoet !== true && res.nietGetoetst === true, `${名} 拒算`);
}
console.log(fouten === 0 ? "\n全部通過。" : `\n${fouten} 項失敗。`);
process.exit(fouten === 0 ? 0 : 1);
