/**
 * tw-pile-cap 檢查腳本（rc112 壓拉桿法三／四樁樁帽）。
 * 獨立 JS 求解器以桁架平衡（向量分解）重算拉桿力：不用範本的閉合式 √2／√3，
 * 而是直接解樁頂節點水平力平衡，與範本交叉比對。
 */
import { parse, evaluate } from "../packages/core/dist/index.js";
import { twPileCap } from "../packages/desktop/src/templates/tw-pile-cap.ts";
import { leesResultaat, leesGetallen } from "../packages/desktop/src/components/calc/bladLezen.ts";

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}
function draai(tpl) {
  const nodes = evaluate(parse(tpl.replaceAll("#hide\n", "#show\n")), {});
  return { uit: leesGetallen(nodes), res: leesResultaat(evaluate(parse(tpl), {}), "tw-pile-cap") };
}
const base = { fc: 28, fy: 420, np: 4, s: 2400, dp: 800, bc: 700, h: 1600, cover: 75, bar: 32, nb: 10, zr: 0.85, bs: 0.4, Pu: 6000 };
const NAMES = { fc: "f_c", fy: "f_y", np: "n_p", s: "s", dp: "d_p", bc: "b_c", h: "h", cover: "cover", bar: "bar", nb: "n_bar", zr: "z_r", bs: "beta_s", Pu: "P_u" };
function set(tpl, p) {
  let t = tpl;
  for (const [k, n] of Object.entries(NAMES)) {
    const re = new RegExp(`^${n} = [^'\\n]*'-`, "m");
    if (!re.test(t)) throw new Error(`找不到輸入 ${n}`);
    t = t.replace(re, `${n} = ${p[k]}'-`);
  }
  return t;
}
const BAR = { 19: [19.1, 286.5], 22: [22.2, 387.1], 25: [25.4, 506.7], 29: [28.7, 646.9], 32: [32.2, 814.3], 36: [35.8, 1007] };

/** 獨立求解器：樁頂節點三向力平衡（直接解向量，不套 √2/√3 閉合式） */
function ref(p) {
  const [db, Ab] = BAR[p.bar];
  const d = p.h - p.cover - db / 2;
  const z = p.zr * d;
  const n = p.np;
  // 樁位：以柱心為原點，圓周等分
  const R = n === 3 ? p.s / Math.sqrt(3) : p.s / Math.sqrt(2);
  const ang0 = n === 3 ? Math.PI / 2 : Math.PI / 4;
  const pile = (i) => [R * Math.cos(ang0 + (2 * Math.PI * i) / n), R * Math.sin(ang0 + (2 * Math.PI * i) / n)];
  // 邊長驗證：相鄰樁距應等於 s
  const gap = Math.hypot(pile(0)[0] - pile(1)[0], pile(0)[1] - pile(1)[1]);
  // 樁頂節點：壓桿水平分力 H（朝外）由兩條相鄰側邊拉桿（朝向鄰樁）平衡
  const H = (p.Pu / n) * (R / z);
  const u0 = pile(0), uN = pile(1), uP = pile(n - 1);
  const dir = (a, b) => { const l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [(b[0] - a[0]) / l, (b[1] - a[1]) / l]; };
  const a = dir(u0, uN), b = dir(u0, uP);
  // 解 T·(a+b) = -H·(u0/|u0|)（兩條拉桿力相等）
  const sum = [a[0] + b[0], a[1] + b[1]];
  const out = [u0[0] / R, u0[1] / R];
  const T = H / Math.abs(sum[0] * out[0] + sum[1] * out[1]); // |T·(a+b)·out| = H
  const theta = (Math.atan(z / R) * 180) / Math.PI;
  const sinT = Math.sin((theta * Math.PI) / 180);
  const C = p.Pu / n / sinT;
  const Tcap = (0.75 * p.fy * p.nb * Ab) / 1000;
  const ap = (p.dp * Math.sqrt(Math.PI)) / 2, wt = 2 * (p.cover + db / 2);
  const Anp = (ap * sinT + wt * Math.cos((theta * Math.PI) / 180)) * ap;
  const UC = {
    ang: 25 / theta, tie: T / Tcap,
    np: C / ((0.75 * 0.85 * 0.6 * p.fc * Anp) / 1000), nc: p.Pu / ((0.75 * 0.85 * p.fc * p.bc ** 2) / 1000),
    st: C / ((0.75 * 0.85 * p.bs * p.fc * Anp) / 1000),
    sp: Math.max(2.5 * p.dp, p.dp + 1000) / p.s,
  };
  const ucmax = Math.ceil(Math.max(...Object.values(UC)) * 100) / 100;
  return { d, z, R, gap, theta, C, T, Tcap, UC, ucmax };
}
const near = (a, b, t = 1e-6) => typeof a === "number" && Math.abs(a - b) <= t * Math.max(1, Math.abs(b));

console.log("=== tw-pile-cap（rc112 壓拉桿法） ===\n");
console.log("0. 規範式釘死");
for (const s of ["0.75*f_y*n_bar*Ab_m/1000", "25/theta", "0.75*0.85*1.0*0.60*f_c", "0.75*0.85*1.0*1.0*f_c*b_c^2/1000", "0.75*0.85*1.0*beta_s*f_c", "max(2.5*d_p; d_p + 1000)", "H_pile/sqrt(3)", "H_pile/sqrt(2)"])
  meld(twPileCap.includes(s), `範本含 ${s}`);

console.log("\n1. 基準案例（四樁）手算");
{
  const { uit, res } = draai(twPileCap);
  const e = ref(base);
  // d = 1600-75-16.1 = 1508.9；z = 1282.565；R = 2400/√2 = 1697.056
  meld(near(e.d, 1508.9) && near(e.z, 1282.565, 1e-5) && near(e.R, 1697.056, 1e-5), "手算 d、z、R");
  meld(near(e.gap, 2400, 1e-9), "獨立求解器樁距 = s");
  meld(near(uit.d_out, e.d) && near(uit.z_out, e.z) && near(uit.R_out, e.R), "範本 d、z、R");
  meld(near(uit.theta_out, e.theta) && near(uit.C_out, e.C), "範本 θ、C");
  meld(near(uit.T_out, e.T, 1e-6), `範本 T = 向量平衡 T = ${e.T.toFixed(2)} kN`, String(uit.T_out));
  meld(near(uit.UC_max, e.ucmax), `UC_max = ${e.ucmax}`, String(uit.UC_max));
  meld(res.voldoet === (e.ucmax <= 1), "結尾判定與 UC 一致");
}

console.log("\n2. 參數掃描（三樁／四樁）");
{
  let bad = 0, cnt = 0, pass = 0, fail = 0;
  for (const np of [3, 4])
    for (const s of [1800, 2400, 3200])
      for (const dp of [600, 800, 1000])
        for (const h of [900, 1300, 1800])
          for (const nb of [6, 12, 24])
            for (const bs of [0.4, 0.75])
              for (const Pu of [2000, 6000, 12000]) {
                if (dp > s / 2) continue;
                const p = { ...base, np, s, dp, h, nb, bs, Pu, bc: 600 };
                const { uit, res } = draai(set(twPileCap, p));
                const e = ref(p);
                cnt++; e.ucmax <= 1 ? pass++ : fail++;
                if (!(near(uit.T_out, e.T) && near(uit.C_out, e.C) && near(uit.UC_max, e.ucmax) && res.voldoet === (e.ucmax <= 1))) bad++;
              }
  meld(bad === 0, `${cnt} 組與獨立求解器一致（向量平衡 vs 閉合式）`, `${bad} 組不符`);
  meld(pass > 10 && fail > 10, `涵蓋合格 ${pass} 組與不合格 ${fail} 組`);
}

console.log("\n3. 負向：不得誤判合格");
for (const [名, patch] of [
  ["拉桿不足（2 根）", { nb: 2 }],
  ["夾角過小（h=500）", { h: 500 }],
  ["載重過大", { Pu: 60000 }],
  ["樁距過小（s=1700）", { s: 1700 }],
  ["三樁拉桿不足", { np: 3, nb: 2 }],
]) {
  const p = { ...base, ...patch };
  const { res } = draai(set(twPileCap, p));
  meld(res.voldoet === false && ref(p).ucmax > 1, `${名} → 不合格`, JSON.stringify(res));
}

console.log("\n4. 無效輸入一律拒算");
for (const [名, patch] of [
  ["樁數 5", { np: 5 }], ["fy = 280", { fy: 280 }], ["號數 D20 不存在", { bar: 20 }],
  ["β_s = 0.6", { bs: 0.6 }], ["z/d = 1.2", { zr: 1.2 }], ["柱寬大於樁距", { bc: 3000 }], ["拉桿 1 根", { nb: 1 }],
]) {
  const { uit, res } = draai(set(twPileCap, { ...base, ...patch }));
  meld(uit.UC_max === undefined && res.voldoet !== true && res.nietGetoetst === true, `${名} 拒算`);
}
console.log(fouten === 0 ? "\n全部通過。" : `\n${fouten} 項失敗。`);
process.exit(fouten === 0 ? 0 : 1);
