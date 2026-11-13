/**
 * tw-storm-sewer 檢查腳本（下水道工程設施標準 114.11.04 第 3、4、5、8 條）。
 *
 * 以獨立 JS 求解器重算圓形管渠弓形斷面之通水面積、濕周、水力半徑、曼寧流速與容量，
 * 並核對最小管徑、覆土、人孔間距與入口內徑；另檢查不合格不得誤判、無效輸入一律拒算。
 *
 * 執行：node scripts/check-tw-storm-sewer.mjs
 */
import { parse, evaluate } from "../packages/core/dist/index.js";
import { twStormSewer as T } from "../packages/desktop/src/templates/tw-storm-sewer.ts";
import { leesResultaat, leesGetallen } from "../packages/desktop/src/components/calc/bladLezen.ts";

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}
const near = (a, b, tol = 1e-9) => typeof a === "number" && Number.isFinite(a) && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));
/** 範本以 ru()（進位 2 位）輸出 UC，比對放寬至 0.011 */
const nearUc = (a, b) => typeof a === "number" && Math.abs(a - b) <= 0.011;

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
    res: leesResultaat(evaluate(parse(tpl), {}), "tw-storm-sewer"),
  };
};

const DEF = {
  Q_d: 0.85, D_p: 800, S_p: 0.005, n_p: 0.013, yr_p: 0.75,
  cov_p: 1.2, rcp_p: 1, Lmh_p: 90, Dmh_p: 90, Hmh_p: 180, Lcl_p: 400,
};

/** 獨立求解器：圓形管渠弓形斷面 + 規範限制值，不使用範本閉合式。 */
function ref(o) {
  const p = { ...DEF, ...o };
  const D = p.D_p / 1000;
  const th = 2 * Math.acos(1 - 2 * p.yr_p);
  const A = (D * D) / 8 * (th - Math.sin(th));
  const P = (D * th) / 2;
  const R = A / P;
  const V = (1 / p.n_p) * R ** (2 / 3) * Math.sqrt(p.S_p);
  const Qc = A * V;
  const covReq = p.rcp_p === 1 ? 0.5 : 0.75;
  const mhMax = p.D_p <= 800 ? 100 : p.D_p <= 1200 ? 150 : 200;
  const dmhReq = p.Hmh_p > 50 ? 90 : 60;
  const ucs = [
    800 / p.D_p,
    covReq / p.cov_p,
    p.Q_d / Qc,
    0.8 / V,
    V / 3.0,
    p.Lmh_p / mhMax,
    dmhReq / p.Dmh_p,
    p.D_p >= 2500 ? p.Lcl_p / 500 : 0,
  ];
  return {
    th, A, P, R, V, Qc, covReq, mhMax, dmhReq,
    uc: Math.ceil(Math.max(...ucs) * 100) / 100,
  };
}

console.log("=== tw-storm-sewer（雨水下水道圓形管渠水理與配置） ===\n");

console.log("0. 規範式釘死");
for (const s of [
  "2*acos(1 - 2*yr_p)", "(D_m^2/8)*(theta - sin(theta))", "D_m*theta/2",
  "(1/n_p)*(R_hyd^(2/3))*(S_p^0.5)", "g_min = 0.8", "g_max = 3.0", "D_min = 800",
  "cov_std = 0.75", "cov_rcp = 0.50", "if(D_p ≤ 800; 100; if(D_p ≤ 1200; 150; 200))",
  "if(Hmh_p > 50; 90; 60)", "if(D_p ≥ 2500; 500; 0)", "pi*D_m^2/4",
]) meld(T.includes(s), `範本含 ${s}`);

console.log("\n1. 基準案例手算（Q=0.85 m³/s、D=800 mm、S=0.005、n=0.013、y/D=0.75）");
{
  const { uit, res } = draai();
  const e = ref({});
  meld(near(uit.theta_out, e.th) && near(uit.A_out, e.A) && near(uit.P_out, e.P) && near(uit.R_out, e.R),
    `θ=${e.th.toFixed(6)} rad、A=${e.A.toFixed(6)} m²、P=${e.P.toFixed(6)} m、R=${e.R.toFixed(6)} m`,
    `${uit.theta_out}/${uit.A_out}/${uit.P_out}/${uit.R_out}`);
  meld(near(uit.V_out, e.V) && near(uit.Q_out, e.Qc),
    `V=${e.V.toFixed(6)} m/s、Q_cap=${e.Qc.toFixed(6)} m³/s`,
    `${uit.V_out}/${uit.Q_out}`);
  meld(near(uit.cov_req_out, e.covReq) && near(uit.mh_max_out, e.mhMax) && near(uit.dmh_req_out, e.dmhReq),
    `覆土需求=${e.covReq} m、人孔最大間距=${e.mhMax} m、入口內徑需求=${e.dmhReq} cm`,
    `${uit.cov_req_out}/${uit.mh_max_out}/${uit.dmh_req_out}`);
  meld(nearUc(uit.UC_max, e.uc) && res.voldoet === (e.uc <= 1), `UC_max=${e.uc} 與結尾判定一致`, `${uit.UC_max}/${JSON.stringify(res)}`);
}

console.log("\n2. 流速上下限（第 3 條 0.8～3.0 m/s）");
{
  // 小坡度、滿管 → 流速過低
  const laag = draai({ S_p: 0.0002, yr_p: 1 });
  const el = ref({ S_p: 0.0002, yr_p: 1 });
  meld(laag.uit.UC_vmin > 1 && laag.res.voldoet === false,
    `S=0.0002、滿管 → 流速 ${el.V.toFixed(3)} m/s < 0.8，不合格`, `UC_vmin=${laag.uit.UC_vmin}`);
  // 大坡度 → 流速過高
  const hoog = draai({ S_p: 0.05, yr_p: 1 });
  const eh = ref({ S_p: 0.05, yr_p: 1 });
  meld(hoog.uit.UC_vmax > 1 && hoog.res.voldoet === false,
    `S=0.05、滿管 → 流速 ${eh.V.toFixed(3)} m/s > 3.0，不合格`, `UC_vmax=${hoog.uit.UC_vmax}`);
  // 中間帶 → 兩項皆合格
  const mid = draai({ S_p: 0.005, yr_p: 1 });
  meld(mid.uit.UC_vmin <= 1 && mid.uit.UC_vmax <= 1, "S=0.005、滿管 → 流速在 0.8～3.0 之間", `${mid.uit.V_out}`);
}

console.log("\n3. 參數掃描（管徑 × 坡度 × 粗糙係數 × 水深比 × 覆土 × 管材 × 人孔）");
{
  let bad = 0, total = 0, pass = 0, fail = 0;
  const fout = [];
  for (const D_p of [600, 800, 1000, 1500, 2500])
    for (const S_p of [0.0005, 0.002, 0.01])
      for (const n_p of [0.011, 0.013, 0.015])
        for (const yr_p of [0.5, 0.75, 1.0])
          for (const cov_p of [0.4, 0.8, 1.5])
            for (const rcp_p of [0, 1]) {
              const o = { D_p, S_p, n_p, yr_p, cov_p, rcp_p, Lmh_p: 80, Dmh_p: 90, Hmh_p: 180, Lcl_p: 400 };
              const { uit, res } = draai(o);
              const e = ref(o);
              total++;
              e.uc <= 1 ? pass++ : fail++;
              const ok = near(uit.A_out, e.A) && near(uit.R_out, e.R) && near(uit.V_out, e.V) && near(uit.Q_out, e.Qc) &&
                near(uit.cov_req_out, e.covReq) && near(uit.mh_max_out, e.mhMax) && near(uit.dmh_req_out, e.dmhReq) &&
                nearUc(uit.UC_max, e.uc) && res.voldoet === (e.uc <= 1);
              if (!ok) { bad++; if (fout.length < 4) fout.push(JSON.stringify(o)); }
            }
  meld(bad === 0, `${total} 組與獨立求解器一致`, `${bad} 組不符：${fout.join(" | ")}`);
  meld(pass > 20 && fail > 20, `涵蓋合格 ${pass} 組與不合格 ${fail} 組`);
}

console.log("\n4. 配置規定（第 4、5、8 條）");
{
  const klein = draai({ D_p: 600 });
  meld(klein.uit.UC_D > 1 && klein.res.voldoet === false, "D=600 mm < 800 mm → 不合格", `UC_D=${klein.uit.UC_D}`);
  const cov = draai({ cov_p: 0.4, rcp_p: 1 });
  meld(cov.uit.UC_cov > 1 && cov.res.voldoet === false, "鋼筋混凝土管覆土 0.4 m < 0.5 m → 不合格", `UC_cov=${cov.uit.UC_cov}`);
  const covOk = draai({ cov_p: 0.6, rcp_p: 1 });
  meld(covOk.uit.UC_cov <= 1, "鋼筋混凝土管覆土 0.6 m ≥ 0.5 m → 合格", `${covOk.uit.UC_cov}`);
  const covStd = draai({ cov_p: 0.6, rcp_p: 0 });
  meld(covStd.uit.UC_cov > 1, "非鋼筋混凝土圓管覆土 0.6 m < 0.75 m → 不合格", `UC_cov=${covStd.uit.UC_cov}`);
  const mh = draai({ Lmh_p: 120 });
  meld(mh.uit.UC_mh > 1 && mh.res.voldoet === false, "D=800 mm 人孔間距 120 m > 100 m → 不合格", `UC_mh=${mh.uit.UC_mh}`);
  const mh2 = draai({ D_p: 1000, Lmh_p: 120 });
  meld(mh2.uit.mh_max_out === 150 && mh2.uit.UC_mh <= 1, "D=1000 mm 人孔上限 150 m、間距 120 m → 合格", `${mh2.uit.mh_max_out}/${mh2.uit.UC_mh}`);
  const mh3 = draai({ D_p: 1500, Lmh_p: 250 });
  meld(mh3.uit.mh_max_out === 200 && mh3.uit.UC_mh > 1, "D=1500 mm 人孔上限 200 m、間距 250 m → 不合格", `${mh3.uit.mh_max_out}/${mh3.uit.UC_mh}`);
  const dmh = draai({ Dmh_p: 60, Hmh_p: 180 });
  meld(dmh.uit.UC_mhd > 1, "入口深度 180 cm > 50 cm 但入口內徑僅 60 cm（需 90 cm）→ 不合格", `UC_mhd=${dmh.uit.UC_mhd}`);
  const dmh2 = draai({ Dmh_p: 60, Hmh_p: 40 });
  meld(dmh2.uit.UC_mhd <= 1, "入口深度 40 cm ≤ 50 cm 時內徑 60 cm 即足 → 合格", `${dmh2.uit.UC_mhd}`);
  const cl = draai({ D_p: 2500, Lcl_p: 600 });
  meld(cl.uit.UC_cl > 1 && cl.res.voldoet === false, "D=2500 mm 機械清掃孔 600 m > 500 m → 不合格", `UC_cl=${cl.uit.UC_cl}`);
  const cl2 = draai({ D_p: 1000, Lcl_p: 900 });
  meld(cl2.uit.UC_cl === 0, "D=1000 mm 不檢核機械清掃孔（UC 取 0）", `${cl2.uit.UC_cl}`);
}

console.log("\n5. 無效輸入一律拒算");
{
  const ongeldig = [
    ["Q_d = 0", { Q_d: 0 }], ["D_p = 0", { D_p: 0 }], ["D_p = 200（< 300）", { D_p: 200 }],
    ["S_p = 0", { S_p: 0 }], ["n_p = 0", { n_p: 0 }], ["yr_p = 0", { yr_p: 0 }], ["yr_p = 1.2", { yr_p: 1.2 }],
    ["cov_p < 0", { cov_p: -0.1 }], ["Lmh_p = 0", { Lmh_p: 0 }], ["Dmh_p = 0", { Dmh_p: 0 }],
    ["Hmh_p = 0", { Hmh_p: 0 }], ["Lcl_p = 0", { Lcl_p: 0 }], ["rcp_p = 2", { rcp_p: 2 }],
  ];
  let bad = 0;
  for (const [naam, o] of ongeldig) {
    const { res } = draai(o);
    if (res.nietGetoetst !== true) bad++;
    meld(res.nietGetoetst === true, `${naam} → 拒算`);
  }
  meld(bad === 0, "所有無效輸入均拒算", `${bad} 組未拒算`);
}

console.log(fouten === 0 ? "\n全部通過。" : `\n${fouten} 項失敗。`);
process.exit(fouten === 0 ? 0 : 1);
