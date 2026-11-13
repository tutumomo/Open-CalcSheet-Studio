/**
 * tw-drop-structure 檢查腳本（公路排水設計規範 §4.8.2、附錄 L、§4.4.3、§5.13）。
 *
 * 以獨立的 JS 求解器重算矩形渠道臨界水深、附錄 L 垂直跌水長度／尾檻、
 * 出水高及出口護床，並驗證超出垂直式適用範圍、附錄 L 尾水條件與無效輸入必須拒算。
 *
 * 執行：node scripts/check-tw-drop-structure.mjs
 */
import { parse, evaluate } from "../packages/core/dist/index.js";
import { twDropStructure as T } from "../packages/desktop/src/templates/tw-drop-structure.ts";
import { leesResultaat, leesGetallen } from "../packages/desktop/src/components/calc/bladLezen.ts";

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}
const near = (a, b, tol = 1e-8) => typeof a === "number" && Number.isFinite(a) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
const setEen = (t, naam, waarde) => {
  const re = new RegExp(`^${naam} = [^'\\n]*'`, "m");
  if (!re.test(t)) throw new Error(`找不到輸入：${naam}`);
  return t.replace(re, `${naam} = ${waarde}'`);
};
const set = (o) => Object.entries(o).reduce((t, [naam, waarde]) => setEen(t, naam, waarde), T);
const draai = (o = {}) => {
  const tpl = set(o);
  return {
    uit: leesGetallen(evaluate(parse(tpl.replaceAll("#hide\n", "#show\n"))), {}),
    res: leesResultaat(evaluate(parse(tpl), {}), "tw-drop-structure"),
  };
};

/** 不依賴範本的獨立水力／尺寸計算。 */
function ref(o) {
  const p = { Q_d: 1.2, B_ch: 1, h_drop: 1.5, D_ch: 0.8, y_tail: 0.25, V_out: 4, L_prov: 2.5, hp_prov: 0.3, fb_prov: 0.3, W_prot: 2.8, L_prot: 4.5, d_prot: 0.7, ...o };
  const q = p.Q_d / p.B_ch;
  const hc = Math.cbrt((q * q) / 9.81);
  const vc = Math.sqrt(9.81 * hc);
  const tailLimit = p.h_drop + 0.6 * hc;
  const tail = p.y_tail < tailLimit ? p.y_tail / tailLimit : 1.01;
  const hp = hc / 2;
  const r = hc / p.h_drop;
  const k = 2.5 + 1.1 * r + 0.7 * r ** 3;
  const L = k * Math.sqrt(p.h_drop * hp);
  const fb = Math.max(0.25 * hc, 0.2);
  const W = 2.5 * p.B_ch;
  const Lp = 5 * p.D_ch;
  const dVelocity = p.V_out ** 2 / 24.7;
  const d = Math.max(dVelocity, 0.3);
  const ucs = [p.h_drop / 3, tail, L / p.L_prov, hp / p.hp_prov, fb / p.fb_prov, W / p.W_prot, Lp / p.L_prot, d / p.d_prot];
  const uc = Math.ceil(Math.max(...ucs) * 100) / 100;
  return { q, hc, vc, tailLimit, hp, k, L, fb, W, Lp, dVelocity, d, uc, ucs };
}

console.log("=== tw-drop-structure（垂直式跌水工與消能設施） ===\n");

console.log("0. 規範式釘死");
for (const s of [
  "h_drop/3", "h_drop + 0.6*hc", "hp_req = hc/2", "2.5 + 1.1*r_hc + 0.7*(r_hc^3)",
  "L_req = k_L*sqrt(h_drop*hp_req)", "max(0.25*hc; 0.20)", "2.5*B_ch", "5*D_ch",
  "V_out^2/24.7", "max(d_vel_req; 0.30)", "y_tail < y_tail_lim", "(q_unit^2/g)^(1/3)",
]) meld(T.includes(s), `範本含 ${s}`);

console.log("\n1. 基準案例手算（Q=1.2 m³/s、B=1.0 m、h=1.5 m）");
{
  const { uit, res } = draai();
  const e = ref({});
  meld(near(uit.q_out, e.q) && near(uit.hc_out, e.hc) && near(uit.Vc_out, e.vc),
    `q=${e.q.toFixed(4)} m²/s、h_c=${e.hc.toFixed(6)} m、V_c=${e.vc.toFixed(6)} m/s`,
    `${uit.q_out}/${uit.hc_out}/${uit.Vc_out}`);
  meld(near(uit.y_tail_lim_out, e.tailLimit) && near(uit.hp_req_out, e.hp) && near(uit.L_req_out, e.L),
    `附錄 L：尾水上限=${e.tailLimit.toFixed(6)} m、h'=${e.hp.toFixed(6)} m、L=${e.L.toFixed(6)} m`,
    `${uit.y_tail_lim_out}/${uit.hp_req_out}/${uit.L_req_out}`);
  meld(near(uit.fb_req_out, e.fb) && near(uit.W_prot_req_out, e.W) && near(uit.L_prot_req_out, e.Lp) && near(uit.d_prot_req_out, e.d),
    `出水高=${e.fb.toFixed(3)}、護床=${e.W.toFixed(3)}×${e.Lp.toFixed(3)} m、粒徑=${e.d.toFixed(6)} m`,
    `${uit.fb_req_out}/${uit.W_prot_req_out}/${uit.L_prot_req_out}/${uit.d_prot_req_out}`);
  meld(near(uit.UC_max, e.uc, 0.011) && res.voldoet === (e.uc <= 1), `UC_max=${e.uc} 與結尾判定一致`, `${uit.UC_max}/${JSON.stringify(res)}`);
}

console.log("\n2. 參數掃描（流量 × 渠寬 × 落差 × 出口流速 × 提供尺寸）");
{
  let bad = 0, total = 0, pass = 0, fail = 0;
  const voorbeelden = [];
  for (const Q_d of [0.3, 1.2, 2.5])
    for (const B_ch of [0.6, 1.0, 2.0])
      for (const h_drop of [0.5, 1.5, 3.0])
        for (const V_out of [2, 4, 7])
          for (const factor of [0.8, 1.0, 1.3]) {
            const basis = ref({ Q_d, B_ch, h_drop, V_out });
            const o = {
              Q_d, B_ch, h_drop, V_out,
              y_tail: 0.3 * basis.tailLimit,
              L_prov: factor * basis.L,
              hp_prov: factor * basis.hp,
              fb_prov: factor * basis.fb,
              W_prot: factor * basis.W,
              L_prot: factor * basis.Lp,
              d_prot: factor * basis.d,
            };
            const { uit, res } = draai(o);
            const e = ref(o);
            total++;
            e.uc <= 1 ? pass++ : fail++;
            const ok = near(uit.hc_out, e.hc) && near(uit.L_req_out, e.L) && near(uit.hp_req_out, e.hp) &&
              near(uit.fb_req_out, e.fb) && near(uit.W_prot_req_out, e.W) && near(uit.L_prot_req_out, e.Lp) &&
              near(uit.d_vel_req_out, e.dVelocity) && near(uit.d_prot_req_out, e.d) &&
              near(uit.UC_max, e.uc, 0.011) && res.voldoet === (e.uc <= 1);
            if (!ok) { bad++; if (voorbeelden.length < 4) voorbeelden.push(JSON.stringify(o)); }
          }
  meld(bad === 0, `${total} 組與獨立求解器一致`, `${bad} 組不符：${voorbeelden.join(" | ")}`);
  meld(pass > 10 && fail > 10, `涵蓋合格 ${pass} 組與不合格 ${fail} 組`);
}

console.log("\n3. 負向案例（不得誤判為合格）");
{
  const cases = [
    ["局部落差 h > 3 m", { h_drop: 3.01 }],
    ["尾水恰達附錄 L 上限（嚴格小於）", { y_tail: 1.8165063385990944 }],
    ["跌水構造長度不足", { L_prov: 1.0 }],
    ["尾檻高度不足", { hp_prov: 0.10 }],
    ["出口護床粒徑不足", { d_prot: 0.20 }],
  ];
  for (const [naam, o] of cases) {
    const { uit, res } = draai(o);
    meld(uit.UC_max > 1 && res.voldoet === false, `${naam} → 不合格`, `UC=${uit.UC_max} ${JSON.stringify(res)}`);
  }
}

console.log("\n4. 無效輸入一律拒算");
{
  const invalid = [
    ["Q_d = 0", { Q_d: 0 }], ["B_ch = 0", { B_ch: 0 }], ["h_drop = 0", { h_drop: 0 }],
    ["D_ch = 0", { D_ch: 0 }], ["y_tail < 0", { y_tail: -0.01 }], ["V_out = 0", { V_out: 0 }],
    ["L_prov = 0", { L_prov: 0 }], ["hp_prov = 0", { hp_prov: 0 }], ["fb_prov = 0", { fb_prov: 0 }],
    ["W_prot = 0", { W_prot: 0 }], ["L_prot = 0", { L_prot: 0 }], ["d_prot = 0", { d_prot: 0 }],
  ];
  let bad = 0;
  for (const [naam, o] of invalid) {
    const { res } = draai(o);
    if (res.nietGetoetst !== true) bad++;
    meld(res.nietGetoetst === true, `${naam} → 拒算`);
  }
  meld(bad === 0, "所有無效輸入均拒算", `${bad} 組未拒算`);
}

console.log(fouten === 0 ? "\n全部通過。" : `\n${fouten} 項失敗。`);
process.exit(fouten === 0 ? 0 : 1);
