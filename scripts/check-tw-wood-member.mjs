/**
 * tw-wood-member 檢查腳本（木構造建築物設計及施工技術規範 第 4、5 章：受拉、受壓、受彎構材）。
 *
 * 獨立 JS 求解器重算表 4.3-1(a)(b)、表 4.4-1 之容許應力與彈性模數、式 5.1／5.5／5.6／5.8／5.9／
 * 5.14／5.16／5.17／5.19～5.21 與表 5.4-1、表 5.4-3、表 5.4-5、表 5.4-6，並與範本比對；
 * 另檢查不合格案例不得被誤判為合格、無效輸入一律拒算。
 *
 * 執行：node scripts/check-tw-wood-member.mjs
 */
import { parse, evaluate } from "../packages/core/dist/index.js";
import { twWoodMember as T } from "../packages/desktop/src/templates/tw-wood-member.ts";
import { leesResultaat, leesGetallen } from "../packages/desktop/src/components/calc/bladLezen.ts";

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}
const draai = (tpl, sel = {}) => ({
  uit: leesGetallen(evaluate(parse(tpl.replaceAll("#hide\n", "#show\n")), sel)),
  res: leesResultaat(evaluate(parse(tpl), sel), "tw-wood-member"),
});
const vervang = (t, o, n) => {
  if (!t.includes(o)) throw new Error(`找不到：${o}`);
  return t.replace(o, n);
};
/** 範本以 ru()（進位至 2 位）、ru4()（進位至 4 位）顯示，故比對時放寬對應誤差 */
const near2 = (a, b) => typeof a === "number" && Math.abs(a - b) <= 0.0101;
const near3 = (a, b) => typeof a === "number" && Math.abs(a - b) <= 0.0011;
const near4 = (a, b) => typeof a === "number" && Math.abs(a - b) <= 0.00011;
const set = (p) =>
  [["b_t = 100'-", `b_t = ${p.b}'-`], ["h_t = 200'-", `h_t = ${p.h}'-`], ["N_t = 0'-", `N_t = ${p.Nt}'-`],
   ["Ae_t = 18000'-", `Ae_t = ${p.Ae}'-`], ["N_c = 0'-", `N_c = ${p.Nc}'-`], ["lk_t = 3000'-", `lk_t = ${p.lk}'-`],
   ["Nr_t = 1.0'-", `Nr_t = ${p.Nr}'-`], ["M_b = 0'-", `M_b = ${p.M}'-`], ["Q_b = 0'-", `Q_b = ${p.Q}'-`],
   ["L_b = 6000'-", `L_b = ${p.L}'-`], ["lo_b = 6000'-", `lo_b = ${p.lo}'-`]]
    .reduce((t, [o, n]) => vervang(t, o, n), T);

/** 表 4.3-1(a) 普通結構材：Lfc / Lft / Lfb / Lfs（kgf/cm²），末位為表 4.4-1 之 E（10³kgf/cm²） */
const TAB = {
  1: [75, 55, 95, 8, 100], 2: [70, 55, 90, 7, 90], 3: [65, 50, 85, 7, 80],
  4: [60, 45, 75, 6, 70], 5: [90, 80, 130, 14, 100], 6: [70, 60, 100, 10, 80], 7: [70, 50, 90, 6, 70],
};
/** 表 4.3-1(b) 上等結構材（針葉樹） */
const TAB_K = { 1: [90, 65, 120, 10, 110], 2: [85, 65, 110, 9, 100], 3: [80, 60, 105, 9, 90], 4: [75, 55, 95, 7, 80] };
/** 表 4.4-1 上等結構材之 E（10³kgf/cm²） */
const E_K = { 1: 110, 2: 100, 3: 90, 4: 80, 5: 110, 6: 90, 7: 80 };
const KK = 0.0980665; // 1 kgf/cm² = 0.0980665 N/mm²

/** 獨立求解器 */
function ref(p) {
  const basis = p.kam === 1
    ? (p.soort <= 4 ? TAB_K[p.soort] : [TAB[p.soort][0] * 1.25, TAB[p.soort][1] * 1.25, TAB[p.soort][2] * 1.25, TAB[p.soort][3] * 1.25, E_K[p.soort]])
    : TAB[p.soort];
  const omgF = p.omg === 2 ? 0.7 : p.omg === 3 ? 0.8 : 1.0;
  const lichtF = p.licht === 1 ? 0.7 : 1.0;
  const tijdF = p.tijd === 1 ? 1.2 : 1.0;
  const fc = basis[0] * omgF * lichtF * tijdF * KK;
  const ft = basis[1] * omgF * lichtF * tijdF * KK;
  const fb = basis[2] * omgF * lichtF * tijdF * KK;
  const fs = basis[3] * omgF * lichtF * tijdF * KK;
  const E = basis[4] * (p.stijf === 1 ? 0.8 : 1.0) * 98.0665;
  const creep = p.omg === 1 ? 2 : 3;

  const Ag = p.b * p.h, Ze = (p.b * p.h ** 2) / 6, Iy = (p.b * p.h ** 3) / 12, iy = p.h / 3.46;

  const sigT = p.Nt > 0 && p.Ae > 0 ? (p.Nt * 1000) / p.Ae : 0;
  const UCt = p.Nt > 0 ? (p.Ae > 0 ? sigT / ft : -1) : 0;

  const lkUse = p.Nr < 1 ? p.lk * (0.75 + 0.25 * p.Nr) : p.lk;
  const lam = lkUse / iy;
  const eta = lam <= 30 ? 1 : lam <= 100 ? 1.3 - 0.01 * lam : 3000 / lam ** 2;
  const fk = eta * fc;
  const sigC = p.Nc > 0 ? (p.Nc * 1000) / Ag : 0;
  const UCc = p.Nc > 0 ? (lam <= 150 ? sigC / fk : 99) : 0;

  const Cl = p.lastvorm === 2 ? 1.08 : p.lastvorm === 3 ? 0.97 : 1.0;
  const r = p.lo / p.h;
  const Ch = r <= 7 ? 1.06 : r <= 14 ? 1.02 : r <= 21 ? 1.0 : 0.98;
  const Cf = p.h <= 300 ? 1.0 : Cl * Ch * (30 / (p.h / 10)) ** (1 / 9);
  const leF = p.lastvorm === 2 ? 1.6 : p.lastvorm === 4 ? 1.85 : 1.9;
  const Cs = (leF * p.lo * p.h) / p.b ** 2;
  const Ck = 0.8 * Math.sqrt(E / fb);
  const Cb = Cs <= 10 ? 1.0 : Cs <= Ck ? 1 - (Cs / Ck) ** 4 / 3 : Cs <= 50 ? (0.4 * E) / (Cs ** 2 * fb) : -1;
  const fbD = Cb > 0 ? Cb * fb : 0;
  const sigB = p.M > 0 ? (p.M * 1e6) / Ze : 0;
  const UCb = p.M > 0 ? (Cb > 0 ? sigB / (fbD * Cf) : 99) : 0;
  const tau = p.Q > 0 ? (1.5 * p.Q * 1000) / Ag : 0;
  const UCv = p.Q > 0 ? tau / fs : 0;

  const kDefl = p.lastvorm === 2 ? 1 / 12 : p.lastvorm === 3 ? 23 / 432 : 5 / 48;
  const dI = p.M > 0 ? (kDefl * p.M * 1e6 * p.L ** 2) / (E * Iy) : 0;
  const dL = dI * creep;
  const dAllow = p.ligger === 3 ? p.L / 300 : p.ligger === 2 ? p.L / 200 : Math.min(p.L / 300, 20);
  const dCheck = p.ligger === 3 ? dL : dI;
  const UCd = p.M > 0 ? dCheck / dAllow : 0;

  const ucmax = Math.ceil(Math.max(UCt, UCc, UCb, UCv, UCd) * 100) / 100;
  return { fc, ft, fb, fs, E, lkUse, lam, eta, fk, Cs, Ck, Cb, Cf, fbD, sigB, dI, dL, dAllow, UCt, UCc, UCb, UCv, UCd, ucmax };
}

const base = {
  soort: 1, kam: 0, omg: 1, licht: 0, stijf: 0, tijd: 0,
  b: 100, h: 200, Nt: 0, Ae: 18000, Nc: 0, lk: 3000, Nr: 1.0, M: 0, Q: 0, L: 4000, lo: 500,
  lastvorm: 1, ligger: 1,
};
const sel = (p) => ({ soort: p.soort, kam: p.kam, omg: p.omg, licht: p.licht, stijf: p.stijf, tijd: p.tijd, lastvorm: p.lastvorm, ligger: p.ligger });

console.log("=== tw-wood-member（木構造規範 4.3／4.4／5.2／5.3.2／5.4 構材檢核） ===\n");

console.log("0. 規範式釘死");
for (const s of [
  "N_t*1000/Ae_t", "eta*fc_L", "1.3 - 0.01*lam", "3000/lam^2", "lk_t*(0.75 + 0.25*Nr_t)",
  "Cl*Ch*(30/(h_t/10))^(1/9)", "0.8*sqrt(E_L/fb_L)", "1 - (Cs/Ck)^4/3", "0.4*E_L/(Cs^2*fb_L)",
  "1.5*Q_b*1000/A_g", "0.0980665", "98.0665", "le_f*lo_b*h_t/b_t^2", "h_t/3.46",
]) meld(T.includes(s), `範本含 ${s}`);

console.log("\n1. 基準案例手算（針葉樹 Ⅰ 類普通結構材、100×200 mm、等均佈、L=4 m、側撐 0.5 m、M=5 kN·m、Q=6 kN）");
{
  const p = { ...base, M: 5, Q: 6 };
  const { uit, res } = draai(set(p), sel(p));
  const e = ref(p);
  meld(near4(uit.fc_out, e.fc) && near4(uit.ft_out, e.ft) && near4(uit.fb_out, e.fb) && near4(uit.fs_out, e.fs),
    `容許應力 f_c=${e.fc.toFixed(4)}、f_t=${e.ft.toFixed(4)}、f_b=${e.fb.toFixed(4)}、f_s=${e.fs.toFixed(4)} N/mm²`,
    `${uit.fc_out}/${uit.ft_out}/${uit.fb_out}/${uit.fs_out}`);
  meld(near2(uit.E_out, e.E), `E = ${e.E.toFixed(1)} N/mm²`, String(uit.E_out));
  meld(near2(uit.sig_b_out, e.sigB), `撓曲應力 M/Z_e = ${e.sigB.toFixed(2)} N/mm²`, String(uit.sig_b_out));
  meld(near3(uit.Cs_out, e.Cs) && near3(uit.Ck_out, e.Ck) && near3(uit.Cb_out, e.Cb), "C_s、C_k、C_b 一致",
    `${uit.Cs_out}/${uit.Ck_out}/${uit.Cb_out}`);
  meld(near3(uit.d_i_out, e.dI) && near3(uit.d_allow_out, e.dAllow), `δ = ${e.dI.toFixed(2)} mm、容許 ${e.dAllow.toFixed(2)} mm`,
    `${uit.d_i_out}/${uit.d_allow_out}`);
  meld(near2(uit.UC_max, e.ucmax), `UC_max = ${e.ucmax}`, String(uit.UC_max));
  meld(res.voldoet === (e.ucmax <= 1), "結尾判定與 UC 一致", JSON.stringify(res));
}

console.log("\n2. 參數掃描（樹種 7 × 材等 2 × 環境 3 × 載重型態 4 × 梁種類 3 × 斷面 2）");
{
  let bad = 0, c = 0, pass = 0, fail = 0, foutLijst = [];
  for (const soort of [1, 2, 3, 4, 5, 6, 7])
    for (const kam of [0, 1])
      for (const omg of [1, 2, 3])
        for (const lastvorm of [1, 2, 3, 4])
          for (const ligger of [1, 2, 3])
            for (const [b, h, lo] of [[100, 200, 500], [150, 300, 1200]])
              for (const [M, Q, Nt, Nc] of [[0, 0, 20, 0], [5, 6, 0, 0], [0, 0, 0, 60], [5, 6, 20, 60], [30, 20, 0, 0]]) {
                const p = { ...base, soort, kam, omg, lastvorm, ligger, b, h, lo, M, Q, Nt, Nc };
                const { uit, res } = draai(set(p), sel(p));
                const e = ref(p);
                c++;
                e.ucmax <= 1 ? pass++ : fail++;
                const goed =
                  near4(uit.fc_out, e.fc) && near4(uit.ft_out, e.ft) && near4(uit.fb_out, e.fb) && near4(uit.fs_out, e.fs) &&
                  near2(uit.E_out, e.E) &&
                  (p.Nc <= 0 || (near2(uit.lam_out, e.lam) && near3(uit.eta_out, e.eta) && near4(uit.fk_out, e.fk) && near2(uit.UC_c, e.UCc))) &&
                  (p.M <= 0 || (near3(uit.Cf_out, e.Cf) && near2(uit.Cs_out, e.Cs) && near3(uit.Ck_out, e.Ck) && near3(uit.Cb_out, e.Cb) && near2(uit.UC_b, e.UCb) && near2(uit.UC_d, e.UCd))) &&
                  (p.Q <= 0 || near2(uit.UC_v, e.UCv)) &&
                  near2(uit.UC_t, e.UCt) && near2(uit.UC_max, e.ucmax) && res.voldoet === (e.ucmax <= 1);
                if (!goed) { bad++; if (foutLijst.length < 5) foutLijst.push(JSON.stringify(p)); }
              }
  meld(bad === 0, `${c} 組與獨立求解器一致`, `${bad} 組不符：${foutLijst.join(" | ")}`);
  meld(pass > 50 && fail > 50, `涵蓋合格 ${pass} 組與不合格 ${fail} 組`);
}

console.log("\n3. 表 4.3-1(a)(b) 與表 4.4-1 逐格核對（7 樹種 × 2 材等）");
{
  let bad = 0, lijst = [];
  for (const soort of [1, 2, 3, 4, 5, 6, 7])
    for (const kam of [0, 1]) {
      const p = { ...base, soort, kam, Nc: 40 };
      const { uit } = draai(set(p), sel(p));
      const e = ref(p);
      if (!(near4(uit.fc_out, e.fc) && near4(uit.ft_out, e.ft) && near4(uit.fb_out, e.fb) && near4(uit.fs_out, e.fs) && near2(uit.E_out, e.E))) {
        bad++;
        lijst.push(`soort=${soort} kam=${kam}`);
      }
    }
  meld(bad === 0, "14 組（樹種 × 材等）之 f_c、f_t、f_b、f_s、E 與規範表一致", lijst.join(", "));
}

console.log("\n4. 表 5.4-5 之 C_b 分段與式 5.6 之 η 分段");
{
  // η：λ ≤ 30 → 1；30 < λ ≤ 100 → 1.3 − 0.01λ；λ > 100 → 3000/λ²（i = h/3.46）
  const i = 200 / 3.46;
  const gevallen = [[30 * i, 1], [100 * i, 0.3], [120 * i, 3000 / 120 ** 2]];
  let bad = 0;
  for (const [lk, verwacht] of gevallen) {
    const p = { ...base, Nc: 40, lk };
    const { uit } = draai(set(p), sel(p));
    const e = ref(p);
    if (!near3(uit.eta_out, e.eta) || Math.abs(e.eta - verwacht) > 0.0011) bad++;
  }
  meld(bad === 0, "η 三分段（λ≤30 → 1；1.3−0.01λ；3000/λ²）正確", `${bad} 組不符`);
  // C_b：C_s ≤ 10 → 1；10 < C_s ≤ C_k；C_k < C_s ≤ 50；C_s > 50 不容許
  const varianten = [
    { b: 150, h: 300, lo: 300, verwacht: 1 },
    { b: 150, h: 300, lo: 1500, verwacht: null },
    { b: 100, h: 200, lo: 10000, verwacht: -1 },
  ];
  let bad2 = 0;
  for (const v of varianten) {
    const p = { ...base, ...v, M: 5 };
    const { uit } = draai(set(p), sel(p));
    const e = ref(p);
    if (!near3(uit.Cb_out, e.Cb)) bad2++;
    if (v.verwacht !== null && Math.abs(e.Cb - v.verwacht) > 1e-9) bad2++;
  }
  meld(bad2 === 0, "C_b 分段（C_s ≤ 10 → 1；中間段；C_s > 50 不容許）正確", `${bad2} 項不符`);
}

console.log("\n5. 負向案例（不合格不得被誤判為合格）");
{
  const p = { ...base, M: 60, Q: 40 };
  const { uit, res } = draai(set(p), sel(p));
  meld(uit.UC_max > 1 && res.voldoet === false, "超大彎矩與剪力 → 不合格", `UC_max=${uit.UC_max} voldoet=${res.voldoet}`);
  const p2 = { ...base, Nc: 400, lk: 3000 };
  const { uit: u2, res: r2 } = draai(set(p2), sel(p2));
  meld(u2.UC_max > 1 && r2.voldoet === false, "超大軸壓力 → 不合格", `UC_max=${u2.UC_max} voldoet=${r2.voldoet}`);
  const p3 = { ...base, Nc: 40, lk: 12000 };
  const { uit: u3, res: r3 } = draai(set(p3), sel(p3));
  meld(u3.UC_c === 99 && u3.UC_max >= 99 && r3.voldoet === false, "λ > 150 → 不容許（UC = 99 且不合格）", `UC_c=${u3.UC_c}`);
  const p4 = { ...base, b: 100, h: 200, lo: 10000, M: 5 };
  const { uit: u4, res: r4 } = draai(set(p4), sel(p4));
  meld(u4.UC_b === 99 && u4.UC_max >= 99 && r4.voldoet === false, "C_s > 50 → 橫向挫屈不容許（UC = 99 且不合格）", `UC_b=${u4.UC_b}`);
  const p5 = { ...base, Nt: 200 };
  const { uit: u5, res: r5 } = draai(set(p5), sel(p5));
  meld(u5.UC_t > 1 && r5.voldoet === false, "超大軸拉力 → 不合格", `UC_t=${u5.UC_t}`);
}

console.log("\n6. 無效輸入一律拒算");
{
  const ongeldig = [
    ["soort = 8", { soort: 8 }, "樹種群超出 1～7"],
    ["kam = 2", { kam: 2 }, "材等非 0／1"],
    ["omg = 4", { omg: 4 }, "使用環境非 1～3"],
    ["licht = 2", { licht: 2 }, "比重開關非 0／1"],
    ["stijf = 2", { stijf: 2 }, "剛性開關非 0／1"],
    ["tijd = 2", { tijd: 2 }, "臨時性開關非 0／1"],
    ["lastvorm = 5", { lastvorm: 5 }, "載重型式非 1～4"],
    ["ligger = 4", { ligger: 4 }, "梁種類非 1～3"],
  ];
  let bad = 0;
  for (const [naam, s, reden] of ongeldig) {
    const p = { ...base, ...s };
    const { res } = draai(set(p), sel(p));
    if (res.nietGetoetst !== true) { bad++; console.log(`      ${naam} 未拒算`); }
    meld(res.nietGetoetst === true, `${naam} → 拒算（${reden}）`);
  }
  const geo = [
    ["b_t = 0", { b: 0 }, "寬度為零"],
    ["h_t < b_t", { b: 300, h: 100 }, "寬度大於深度"],
    ["lo_b = 0", { lo: 0 }, "側撐間距為零"],
    ["L_b = 0", { L: 0 }, "跨度為零"],
  ];
  for (const [naam, o, reden] of geo) {
    const p = { ...base, ...o };
    const { res } = draai(set(p), sel(p));
    meld(res.nietGetoetst === true, `${naam} → 拒算（${reden}）`);
  }
  const belastingen = [
    ["Ae_t > A_g", { Nt: 20, Ae: 999999 }, "淨斷面積大於全斷面積"],
    ["lk_t = 0", { Nc: 40, lk: 0 }, "挫屈長度為零"],
    ["Nr_t > 1", { Nc: 40, Nr: 1.5 }, "N2/N1 大於 1"],
    ["Q_b < 0", { M: 5, Q: -1 }, "剪力為負"],
    ["無任何載重", {}, "軸力與彎矩皆為零"],
  ];
  for (const [naam, o, reden] of belastingen) {
    const p = { ...base, ...o };
    const { res } = draai(set(p), sel(p));
    meld(res.nietGetoetst === true, `${naam} → 拒算（${reden}）`);
  }
  meld(bad === 0, "選項類無效輸入全部拒算", `${bad} 組未拒算`);
}

console.log(fouten === 0 ? "\n全部通過。" : `\n${fouten} 項失敗。`);
process.exit(fouten === 0 ? 0 : 1);
