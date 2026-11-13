/**
 * tw-bridge-seismic 檢查腳本（公路橋梁耐震設計規範 第八章：液化與土壤參數折減、地震土壓、
 * 地震動水壓、梁端防落長度、梁端間隙與伸縮裝置）。
 *
 * 獨立 JS 求解器重算表 8-1（土壤參數折減係數 DE）、式 8-1、式 8-2～8-9、式 8-10～8-13、
 * 表 7-2（調整係數 cφ），與範本逐項比對；並檢查不合格案例不得被誤判為合格、無效輸入一律拒算。
 *
 * 規範數值來源（B 級官方來源，逐列記於 docs/tw/規範來源.md §5.21）：
 * 交通部《公路橋梁耐震設計規範》（108.01.14 修正），https://www.motc.gov.tw/ch/app/data/doc?id=740&module=divpubreg&type=s&preview=&aplistdn=&serno=424&detailNo=4
 *
 * 執行：node scripts/check-tw-bridge-seismic.mjs
 */
import { parse, evaluate } from "../packages/core/dist/index.js";
import { twBridgeSeismic as T } from "../packages/desktop/src/templates/tw-bridge-seismic.ts";
import { leesResultaat, leesGetallen } from "../packages/desktop/src/components/calc/bladLezen.ts";

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}
const draai = (tpl, sel = {}) => ({
  uit: leesGetallen(evaluate(parse(tpl.replaceAll("#hide\n", "#show\n")), sel)),
  res: leesResultaat(evaluate(parse(tpl), sel), "tw-bridge-seismic"),
});
const vervang = (t, o, n) => {
  if (!t.includes(o)) throw new Error(`找不到：${o}`);
  return t.replace(o, n);
};
const near = (a, b, tol = 1e-9) => typeof a === "number" && Math.abs(a - b) <= tol * Math.max(1, Math.abs(b));

/** 依輸入名稱置換範本中的預設輸入值 */
const VELDEN = {
  S_II_S: "S_II_S = 1.0'-", S_III_S: "S_III_S = 1.0'-", qu_c: "qu_c = 20'-", RS_liq: "RS_liq = 1.2'-",
  LS_liq: "LS_liq = 1.0'-", x_liq: "x_liq = 5'-", kh_ea_in: "kh_ea_in = 0'-", phi_s: "phi_s = 30'-",
  alpha_g: "alpha_g = 0'-", theta_w: "theta_w = 0'-", delta_w: "delta_w = 0'-", c_soil: "c_soil = 0'-",
  gamma_s: "gamma_s = 18'-", q_sur: "q_sur = 0'-", H_ret: "H_ret = 5'-", h_w: "h_w = 3'-", b_w: "b_w = 10'-",
  t_w: "t_w = 3'-", A0_w: "A0_w = 30'-", gamma_w: "gamma_w = 9.81'-", L_span: "L_span = 30'-",
  H_sub: "H_sub = 8'-", S_skew: "S_skew = 0'-", uR1: "uR1 = 5'-", uR2: "uR2 = 3'-", Le_eff: "Le_eff = 3000'-",
  LN_use: "LN_use = 75'-", uS_gap: "uS_gap = 4'-", uJ_exp: "uJ_exp = 2.5'-", T1_p: "T1_p = 0.8'-",
  T2_p: "T2_p = 0.6'-", SB_use: "SB_use = 10'-", LE_use: "LE_use = 8'-",
};
const set = (p) =>
  Object.entries(VELDEN).reduce((t, [k, o]) => (p[k] === undefined ? t : vervang(t, o, `${k} = ${p[k]}'-`)), T);

const rad = (d) => (d * Math.PI) / 180;
const ru = (u) => Math.ceil(u * 100) / 100;

/** 表 8-1：土壤參數之折減係數 DE（8.1.3） */
function deTabel(FL, RS, x) {
  if (FL > 1) return 1;
  if (FL <= 1 / 3) return x <= 10 ? (RS <= 0.3 ? 0 : 1 / 6) : 1 / 3;
  if (FL <= 2 / 3) return x <= 10 ? (RS <= 0.3 ? 1 / 3 : 2 / 3) : 2 / 3;
  return x <= 10 ? (RS <= 0.3 ? 2 / 3 : 1) : 1;
}
/** 表 7-2：調整係數 cφ（8.6／8.7） */
const cphiTabel = (T1, T2) => {
  const r = (T1 - T2) / T1;
  return r <= 0.1 ? 1.0 : r <= 0.8 ? 1.4 : 1.0;
};

/** 獨立求解器：第 8 章全部公式 */
function ref(p) {
  const FL = p.RS_liq / p.LS_liq;
  const DE = deTabel(FL, p.RS_liq, p.x_liq);
  const A814 = 0.4 * p.S_II_S;
  const kh = p.kh_ea_in > 0 ? p.kh_ea_in : 0.2 * p.S_II_S;
  const th0 = (Math.atan(kh) * 180) / Math.PI;

  const s1 = Math.sin(rad(p.phi_s + p.delta_w));
  const c1A = Math.cos(rad(p.theta_w + th0 + p.delta_w));
  const c2A = Math.cos(rad(p.theta_w - p.alpha_g));
  const s2A = p.phi_s - p.alpha_g - th0 < 0 ? 0 : Math.sin(rad(p.phi_s - p.alpha_g - th0));
  const wA = c1A > 0 && c2A > 0 ? Math.max(0, (s1 * s2A) / (c1A * c2A)) : 0;
  const numA = Math.cos(rad(p.phi_s - th0 - p.theta_w)) ** 2;
  const denA =
    p.mo_form === 1
      ? Math.cos(rad(th0)) * Math.cos(rad(p.theta_w)) ** 2 * c1A * (1 + Math.sqrt(wA)) ** 2
      : Math.cos(rad(th0)) ** 2 * Math.cos(rad(p.theta_w)) ** 2 * c1A * (1 + Math.sqrt(wA));
  const KEA = denA > 0 ? numA / denA : -1;

  const s2P = Math.sin(rad(p.phi_s + p.alpha_g - th0));
  const c1P = Math.cos(rad(p.delta_w + th0 - p.theta_w));
  const c2P = Math.cos(rad(p.theta_w - p.alpha_g));
  const wP = c1P > 0 && c2P > 0 ? Math.max(0, (s1 * s2P) / (c1P * c2P)) : 0;
  const baseP = 1 - Math.sqrt(wP);
  const numP = Math.cos(rad(p.phi_s - th0 + p.theta_w)) ** 2;
  const denP =
    p.mo_form === 1
      ? Math.cos(rad(th0)) * Math.cos(rad(p.theta_w)) ** 2 * c1P * baseP ** 2
      : Math.cos(rad(th0)) ** 2 * Math.cos(rad(p.theta_w)) ** 2 * c1P * baseP;
  const KEP = baseP > 0 && denP > 0 ? numP / denP : -1;

  const qaK = KEA > 0 ? (p.mo_form === 1 ? KEA : Math.sqrt(KEA)) : -1;
  const qpK = KEP > 0 ? (p.mo_form === 1 ? KEP : Math.sqrt(KEP)) : -1;

  const p0A = KEA > 0 ? -2 * p.c_soil * Math.sqrt(KEA) + p.q_sur * qaK : 0;
  const xcA = KEA > 0 && p0A < 0 ? (2 * p.c_soil * Math.sqrt(KEA) - p.q_sur * qaK) / (p.gamma_s * KEA) : 0;
  const dA = Math.max(0, p.H_ret - xcA);
  const PtriA = 0.5 * p.gamma_s * KEA * dA ** 2;
  const PrecA = p.q_sur * qaK * dA;
  const PEa = KEA > 0 ? PtriA + PrecA : 0;
  const yEa = PEa > 0 ? (PtriA * dA * (1 / 3) + PrecA * dA * 0.5) / PEa : 0;
  const pbA = KEA > 0 ? p.gamma_s * p.H_ret * KEA - 2 * p.c_soil * Math.sqrt(KEA) + p.q_sur * qaK : 0;

  const cP = KEP > 0 ? 2 * p.c_soil * Math.sqrt(KEP) + p.q_sur * qpK : 0;
  const PEp = KEP > 0 ? 0.5 * p.gamma_s * KEP * p.H_ret ** 2 + cP * p.H_ret : 0;
  const yEp = PEp > 0 ? (0.5 * p.gamma_s * KEP * p.H_ret ** 2 * (p.H_ret / 3) + cP * p.H_ret * (p.H_ret / 2)) / PEp : 0;

  const khw = 0.4 * p.S_II_S;
  const ratio = p.b_w / p.h_w;
  const Pw =
    p.water_form === 1
      ? (7 / 12) * khw * p.gamma_w * p.b_w * p.h_w ** 2
      : ratio <= 2
        ? (3 / 4) * khw * p.gamma_w * p.A0_w * p.h_w * (p.b_w / p.t_w) * (1 - p.b_w / (4 * p.h_w))
        : ratio <= 4
          ? (3 / 4) * khw * p.gamma_w * p.A0_w * p.h_w * (p.b_w / p.t_w) * (0.7 - p.b_w / (10 * p.h_w))
          : (9 / 40) * khw * p.gamma_w * p.A0_w * p.h_w * (p.b_w / p.t_w);
  const hgw = p.water_form === 1 ? (2 / 5) * p.h_w : (3 / 7) * p.h_w;

  const epsG = p.gr_typ === 1 ? 0.0025 : p.gr_typ === 2 ? 0.00375 : p.gr_typ === 3 ? 0.005 : 0.00625;
  const LNmin = (50 + 0.25 * p.L_span + 1.0 * p.H_sub) * (1 + p.S_skew ** 2 / 8000);
  const uR = Math.sqrt(p.uR1 ** 2 + p.uR2 ** 2);
  const uG = epsG * p.Le_eff * (p.S_III_S / p.S_II_S);
  const LNreq = p.bear_form === 1 ? Math.max(LNmin, uR + uG) : LNmin;
  const UC_LN = p.LN_use > 0 ? LNreq / p.LN_use : -1;

  const LA = 1.5;
  const cphi = cphiTabel(p.T1_p, p.T2_p);
  const SBreq = p.gap_form === 1 ? p.uS_gap + LA : cphi * p.uS_gap + LA;
  const LEreq = p.gap_form === 1 ? p.uJ_exp + LA : cphi * p.uJ_exp + LA;
  const UC_SB = p.SB_use > 0 ? SBreq / p.SB_use : -1;
  const UC_LE = p.LE_use > 0 ? LEreq / p.LE_use : -1;

  return {
    FL, DE, A814, kh, th0, KEA, KEP, qaK, qpK, p0A, xcA, dA, PEa, yEa, pbA, PEp, yEp, Pw, hgw,
    epsG, LNmin, uR, uG, LNreq, UC_LN, cphi, SBreq, LEreq, UC_SB, UC_LE,
    ucmax: ru(Math.max(UC_LN, UC_SB, UC_LE)),
  };
}

const base = {
  S_II_S: 1.0, S_III_S: 1.0, gr_typ: 1, mo_form: 1, water_form: 1, bear_form: 1, gap_form: 1,
  qu_c: 20, RS_liq: 1.2, LS_liq: 1.0, x_liq: 5, kh_ea_in: 0, phi_s: 30, alpha_g: 0, theta_w: 0,
  delta_w: 0, c_soil: 0, gamma_s: 18, q_sur: 0, H_ret: 5, h_w: 3, b_w: 10, t_w: 3, A0_w: 30,
  gamma_w: 9.81, L_span: 30, H_sub: 8, S_skew: 0, uR1: 5, uR2: 3, Le_eff: 3000, LN_use: 75,
  uS_gap: 4, uJ_exp: 2.5, T1_p: 0.8, T2_p: 0.6, SB_use: 10, LE_use: 8,
};
const sel = (p) => ({ gr_typ: p.gr_typ, mo_form: p.mo_form, water_form: p.water_form, bear_form: p.bear_form, gap_form: p.gap_form });

console.log("=== tw-bridge-seismic（公路橋梁耐震設計規範 第八章） ===\n");
console.log("0. 規範式釘死");
for (const s of ["FL_c = if(RS_liq > 0 and LS_liq > 0; RS_liq/LS_liq; -1)",
                 "A_814 = 0.4*S_II_S",
                 "kh_ea = if(kh_ea_in > 0; kh_ea_in; 0.2*S_II_S)",
                 "th0_ea = atan(kh_ea)*180/pi",
                 "PEa_c = if(KEA_c > 0; PtriA + PrecA; 0)",
                 "PEp_c = if(KEP_c > 0; 0.5*gamma_s*KEP_c*H_ret^2 + cP_term*H_ret; 0)",
                 "P_w = if(water_form ≡ 1; (7/12)*kh_w*gamma_w*b_w*h_w^2;",
                 "hg_w = if(water_form ≡ 1; (2/5)*h_w; (3/7)*h_w)",
                 "LNmin_c = (50 + 0.25*L_span + 1.0*H_sub)*(1 + S_skew^2/8000)",
                 "uR_c = sqrt(uR1^2 + uR2^2)",
                 "uG_c = epsG*Le_eff*(S_III_S/S_II_S)",
                 "LNreq_c = if(bear_form ≡ 1; max(LNmin_c; uR_c + uG_c); LNmin_c)",
                 "LA_c = 1.5",
                 "cphi_c = if(rT_c ≤ 0.1; 1.0; if(rT_c ≤ 0.8; 1.4; 1.0))",
                 "SBreq_c = if(gap_form ≡ 1; uS_gap + LA_c; cphi_c*uS_gap + LA_c)",
                 "LEreq_c = if(gap_form ≡ 1; uJ_exp + LA_c; cphi_c*uJ_exp + LA_c)",
                 "epsG = if(gr_typ ≡ 1; 0.0025; if(gr_typ ≡ 2; 0.00375; if(gr_typ ≡ 3; 0.005; 0.00625)))"])
  meld(T.includes(s), `範本含 ${s}`);

console.log("\n1. 基準案例手算（條文式土壓、單側臨水、活動支承、橋台間隙）");
{
  const p = base;
  const { uit, res } = draai(set(p), sel(p));
  const e = ref(p);
  meld(near(uit.FL_out, 1.2), "FL = 1.2（不液化）", String(uit.FL_out));
  meld(near(uit.DE_out, 1), "DE = 1（不折減）", String(uit.DE_out));
  meld(near(uit.A814_out, 0.4), "A = 0.4·S_II,S = 0.4 g", String(uit.A814_out));
  meld(near(uit.kh_out, 0.2), "k_h = 0.2·S_II,S = 0.2", String(uit.kh_out));
  meld(near(uit.KEA_out, e.KEA), `K_EA = ${e.KEA.toFixed(6)}`, String(uit.KEA_out));
  meld(near(uit.KEP_out, e.KEP), `K_EP = ${e.KEP.toFixed(6)}`, String(uit.KEP_out));
  meld(near(uit.PEa_out, e.PEa) && near(uit.yEa_out, e.yEa), `P_Ea = ${e.PEa.toFixed(3)} kN/m、y_Ea = ${e.yEa.toFixed(3)} m`);
  meld(near(uit.PEp_out, e.PEp) && near(uit.yEp_out, e.yEp), `P_Ep = ${e.PEp.toFixed(3)} kN/m、y_Ep = ${e.yEp.toFixed(3)} m`);
  meld(near(uit.Pw_out, e.Pw) && near(uit.hgw_out, e.hgw), `P = ${e.Pw.toFixed(3)} kN、h_g = ${e.hgw.toFixed(3)} m`);
  meld(near(uit.LNmin_out, 65.5), "L_Nmin = (50+0.25×30+1.0×8)(1+0) = 65.5 cm", String(uit.LNmin_out));
  meld(near(uit.uR_out, Math.sqrt(34)), "u_R = √(5²+3²) = 5.83095 cm", String(uit.uR_out));
  meld(near(uit.uG_out, 7.5), "u_G = 0.0025×3000×1 = 7.5 cm", String(uit.uG_out));
  meld(near(uit.LNreq_out, 65.5), "L_N = max(65.5; 5.83095+7.5) = 65.5 cm", String(uit.LNreq_out));
  meld(near(uit.cphi_out, 1.4), "cφ = 1.4（ΔT/T1 = 0.25）", String(uit.cphi_out));
  meld(near(uit.SBreq_out, 5.5) && near(uit.LEreq_out, 4), "S_B = 4+1.5 = 5.5 cm、L_E = 2.5+1.5 = 4 cm");
  meld(near(uit.UC_max, e.ucmax), `UC_max = ${e.ucmax}`, String(uit.UC_max));
  meld(res.voldoet === e.ucmax <= 1, "結尾判定與 UC 一致", JSON.stringify(res));
}

console.log("\n2. 表 8-1 土壤參數折減係數 DE 逐格核對（8.1.3）");
for (const [FL, RS, x, verwacht] of [
  [0.2, 0.2, 5, 0], [0.2, 0.5, 5, 1 / 6], [0.2, 0.5, 15, 1 / 3],
  [0.5, 0.2, 5, 1 / 3], [0.5, 0.5, 5, 2 / 3], [0.5, 0.5, 15, 2 / 3],
  [0.9, 0.2, 5, 2 / 3], [0.9, 0.5, 5, 1], [0.9, 0.5, 15, 1],
  [1.5, 0.2, 5, 1],
]) {
  const p = { ...base, RS_liq: RS, LS_liq: RS / FL, x_liq: x };
  const { uit } = draai(set(p), sel(p));
  meld(near(uit.FL_out, FL) && near(uit.DE_out, verwacht), `FL = ${FL}、R_S = ${RS}、x = ${x} m → DE = ${verwacht}`,
    `FL 實際 ${uit.FL_out}、DE ${uit.DE_out}`);
}

console.log("\n3. 表 7-2 調整係數 cφ 逐格核對（8.6／8.7）");
for (const [T1, T2, verwacht] of [[1.0, 0.95, 1.0], [1.0, 0.9, 1.0], [1.0, 0.85, 1.4], [1.0, 0.5, 1.4], [1.0, 0.1, 1.0]]) {
  const p = { ...base, T1_p: T1, T2_p: T2 };
  const { uit } = draai(set(p), sel(p));
  meld(near(uit.cphi_out, verwacht), `T1 = ${T1}、T2 = ${T2} → cφ = ${verwacht}`, String(uit.cphi_out));
}

console.log("\n4. 參數掃描（土壓兩式 × 四種地盤 × 兩種支承 × 兩種間隙 × 動水壓情形）");
{
  let n = 0;
  let fout = 0;
  const phiLijst = [20, 30, 40];
  const alphaLijst = [0, 10];
  const thetaLijst = [0, 20];
  const deltaLijst = [0, 20];
  for (const mo_form of [1, 2])
    for (const gr_typ of [1, 4])
      for (const bear_form of [1, 2])
        for (const gap_form of [1, 2])
          for (const water_form of [1, 2])
            for (const phi_s of phiLijst)
              for (const alpha_g of alphaLijst)
                for (const theta_w of thetaLijst)
                  for (const delta_w of deltaLijst) {
                    const p = { ...base, mo_form, gr_typ, bear_form, gap_form, water_form, phi_s, alpha_g, theta_w, delta_w,
                      c_soil: delta_w === 0 ? 0 : 5, q_sur: delta_w === 0 ? 0 : 10, H_ret: 4 + theta_w / 4,
                      RS_liq: 0.5, LS_liq: 1.0, x_liq: 5, S_II_S: 1.2, S_III_S: 0.8, T1_p: 0.8, T2_p: 0.6,
                      uR1: 4, uR2: 3, Le_eff: 2500, LN_use: 60, SB_use: 8, LE_use: 6, b_w: 12, h_w: 3, t_w: 3, A0_w: 25 };
                    const { uit } = draai(set(p), sel(p));
                    const e = ref(p);
                    if (e.KEA <= 0 || e.KEP <= 0) continue; // 公式不適用之幾何組合，範本判為無效輸入
                    n++;
                    const checks = [
                      near(uit.FL_out, e.FL), near(uit.DE_out, e.DE), near(uit.kh_out, e.kh),
                      near(uit.KEA_out, e.KEA), near(uit.KEP_out, e.KEP), near(uit.PEa_out, e.PEa),
                      near(uit.yEa_out, e.yEa), near(uit.PEp_out, e.PEp), near(uit.yEp_out, e.yEp),
                      near(uit.Pw_out, e.Pw), near(uit.hgw_out, e.hgw), near(uit.epsG_out, e.epsG),
                      near(uit.LNmin_out, e.LNmin), near(uit.uR_out, e.uR), near(uit.uG_out, e.uG),
                      near(uit.LNreq_out, e.LNreq), near(uit.cphi_out, e.cphi),
                      near(uit.SBreq_out, e.SBreq), near(uit.LEreq_out, e.LEreq), near(uit.UC_max, e.ucmax),
                    ];
                    if (checks.some((c) => !c)) {
                      fout++;
                      if (fout < 5) console.log(`   差異：${JSON.stringify(p)}`, JSON.stringify(uit), JSON.stringify(e));
                    }
                  }
  meld(fout === 0, `${n} 組參數與獨立求解器完全一致`, `${fout} 組不一致`);
}

console.log("\n5. 負向：不得誤判合格");
for (const [名, patch] of [
  ["梁端防落長度不足", { LN_use: 40 }],
  ["梁端間隙不足", { SB_use: 4 }],
  ["伸縮裝置伸縮量不足", { LE_use: 3 }],
]) {
  const p = { ...base, ...patch };
  const { res } = draai(set(p), sel(p));
  meld(res.voldoet === false && ref(p).ucmax > 1, `${名} → 不合格`, JSON.stringify(res));
}

console.log("\n6. 無效輸入一律拒算");
for (const [名, patch, s] of [
  ["S_II,S 為零", { S_II_S: 0 }, { ...base }],
  ["S_III,S 為零", { S_III_S: 0 }, { ...base }],
  ["R_S 為零", { RS_liq: 0 }, { ...base }],
  ["L_S 為零", { LS_liq: 0 }, { ...base }],
  ["液化且土層深度超過 20 m", { RS_liq: 0.5, x_liq: 25 }, { ...base }],
  ["摩擦角為零", { phi_s: 0 }, { ...base }],
  ["擋土牆高度為零", { H_ret: 0 }, { ...base }],
  ["土壓公式不適用（K_EA 無解）", { theta_w: 45, delta_w: 45, kh_ea_in: 5 }, { ...base }],
  ["水深為零", { h_w: 0 }, { ...base }],
  ["環水情形厚度為零", { t_w: 0 }, { ...base, water_form: 2 }],
  ["跨徑為零", { L_span: 0 }, { ...base }],
  ["L_e 為零", { Le_eff: 0 }, { ...base }],
  ["L_N 為零", { LN_use: 0 }, { ...base }],
  ["T2 大於 T1", { T1_p: 0.5, T2_p: 0.8 }, { ...base }],
  ["S_B 為零", { SB_use: 0 }, { ...base }],
  ["L_E 為零", { LE_use: 0 }, { ...base }],
  ["地盤種類超出範圍", {}, { ...base, gr_typ: 5 }],
  ["土壓式版本超出範圍", {}, { ...base, mo_form: 3 }],
  ["動水壓情形超出範圍", {}, { ...base, water_form: 3 }],
  ["支承型式超出範圍", {}, { ...base, bear_form: 3 }],
  ["間隙位置超出範圍", {}, { ...base, gap_form: 3 }],
]) {
  const p = { ...s, ...patch };
  const { res } = draai(set(p), sel(p));
  // UC_max 於隱藏區塊計算，無效輸入時以結尾行「總結：無效輸入，未檢核」判定
  meld(res.voldoet !== true && res.uc === null && res.nietGetoetst === true, `${名} 拒算`, JSON.stringify(res));
}

console.log(fouten === 0 ? "\n全部通過。" : `\n${fouten} 項失敗。`);
process.exit(fouten === 0 ? 0 : 1);
