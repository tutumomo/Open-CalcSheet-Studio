/**
 * tw-seismic-load 檢查腳本（seis113 靜力分析法）。
 * 以獨立純 JS 實作式 2-7～2-15 重算，掃描多組參數與範本逐值比對；
 * 另測無效輸入（臺北盆地、S_DS 過小、R 超出範圍）一律拒算且不得出現合格字樣。
 */
import { parse, evaluate } from "../packages/core/dist/index.js";
import { twSeismicLoad } from "../packages/desktop/src/templates/tw-seismic-load.ts";
import { leesResultaat, leesGetallen } from "../packages/desktop/src/components/calc/bladLezen.ts";

import { projectScope, legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
const SCOPE = projectScope(legeGegevens());
let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}
function draai(tpl) {
  const nodes = evaluate(parse(tpl.replaceAll("#hide\n", "#show\n")), {}, SCOPE);
  return { uit: leesGetallen(nodes), res: leesResultaat(evaluate(parse(tpl), {}, SCOPE), "tw-seismic-load") };
}
function vervang(tpl, oud, nieuw) {
  if (!tpl.includes(oud)) throw new Error(`找不到要取代的字串：${oud}`);
  return tpl.replace(oud, nieuw);
}

/** 獨立實作（seis113 式 2-1～2-3、2-7～2-12、2-14、2-15） */
function ref({ SDS, SD1, I, sys, R, ay, n, h, w }) {
  const hn = n * h;
  const Ct = sys === 1 ? 0.085 : sys === 2 ? 0.07 : 0.05;
  const T = Ct * hn ** 0.75;
  const T0 = SD1 / SDS;
  let SaD;
  if (T <= 0.2 * T0) SaD = SDS * (0.4 + (3 * T) / T0);
  else if (T <= T0) SaD = SDS;
  else if (T <= 2.5 * T0) SaD = SD1 / T;
  else SaD = 0.4 * SDS;
  const Ra = 1 + (R - 1) / 1.5;
  const s = Math.sqrt(2 * Ra - 1);
  let Fu;
  if (T >= T0) Fu = Ra;
  else if (T >= 0.6 * T0) Fu = s + ((Ra - s) * (T - 0.6 * T0)) / (0.4 * T0);
  else if (T >= 0.2 * T0) Fu = s;
  else Fu = s + ((s - 1) * (T - 0.2 * T0)) / (0.2 * T0);
  const r = SaD / Fu;
  const rm = r <= 0.3 ? r : r < 0.8 ? 0.52 * r + 0.144 : 0.7 * r;
  const W = n * w;
  const V = (I / (1.4 * ay)) * rm * W;
  const Ft = T < 0.7 ? 0 : Math.min(0.07 * T * V, 0.25 * V);
  const sum = (w * h * n * (n + 1)) / 2;
  const Fn = Ft + ((V - Ft) * w * hn) / sum;
  const F1 = ((V - Ft) * w * h) / sum;
  return { T, SaD, Ra, Fu, V, Ft, Fn, F1 };
}

const base = { SDS: 0.8, SD1: 0.45, I: 1.0, sys: 2, R: 4.8, ay: 1.5, n: 8, h: 3.5, w: 450 };
const set = (tpl, p) =>
  [
    ["S_DS = ?{0.80}", `S_DS = ?{${p.SDS}}`],
    ["S_D1 = ?{0.45}", `S_D1 = ?{${p.SD1}}`],
    ["I_eq = tw_I'-", `I_eq = ${p.I}'-`],
    ["sys = 2'-", `sys = ${p.sys}'-`],
    ["R_duct = 4.8'-", `R_duct = ${p.R}'-`],
    ["alpha_y = 1.5'-", `alpha_y = ${p.ay}'-`],
    ["n_st = 8'-", `n_st = ${p.n}'-`],
    ["h_st = 3.5'm", `h_st = ${p.h}'m`],
    ["W_st = 450'tf", `W_st = ${p.w}'tf`],
  ].reduce((t, [o, n]) => vervang(t, o, n), tpl);

const near = (a, b) => typeof a === "number" && Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(b));

console.log("=== tw-seismic-load（seis113 靜力分析法） ===\n");

console.log("0. 規範式釘死");
for (const s of ["0.085", "0.070", "0.050", "(R_duct - 1)/1.5", "1.4*alpha_y", "0.52*r_calc + 0.144", "0.70*r_calc", "0.07*T_a_calc*V_calc", "0.25*V_calc"])
  meld(twSeismicLoad.includes(s), `範本含 ${s}`);

console.log("\n1. 基準案例手算（T = 0.07·28^0.75、T ≥ T0 → Fu = Ra）");
{
  const { uit, res } = draai(twSeismicLoad);
  const e = ref(base);
  meld(near(uit.T_a, e.T), `T = ${e.T.toFixed(4)} s`, String(uit.T_a));
  meld(near(uit.V, e.V), `V = ${e.V.toFixed(3)} tf`, String(uit.V));
  meld(near(uit.F_t, e.Ft), `Ft = ${e.Ft.toFixed(3)} tf`, String(uit.F_t));
  meld(near(uit.F_top, e.Fn), `F_top = ${e.Fn.toFixed(3)} tf`, String(uit.F_top));
  meld(near(uit.F_bot, e.F1), `F_bot = ${e.F1.toFixed(3)} tf`, String(uit.F_bot));
  meld(res.nietGetoetst === true && res.voldoet !== true, "結尾行為未檢核，不判合格");
}

console.log("\n2. 參數掃描（涵蓋 Fu 四段、SaD 四段、rm 三段）");
{
  let bad = 0, cnt = 0;
  for (const sys of [1, 2, 3])
    for (const n of [1, 3, 8, 20, 40])
      for (const [SDS, SD1] of [[0.6, 0.3], [0.8, 0.45], [0.5, 0.5], [1.0, 0.2], [0.9, 0.9]])
        for (const R of [1, 2.4, 4.8, 5.2])
          for (const I of [1.0, 1.5]) {
            const p = { ...base, sys, n, SDS, SD1, R, I };
            const { uit } = draai(set(twSeismicLoad, p));
            const e = ref(p);
            cnt++;
            if (!(near(uit.V, e.V) && near(uit.F_top, e.Fn) && near(uit.F_bot, e.F1) && near(uit.F_u, e.Fu) && near(uit.S_aD, e.SaD))) bad++;
          }
  meld(bad === 0, `${cnt} 組與獨立求解器一致`, `${bad} 組不符`);
}

console.log("\n3. 各層橫力合計等於 V（n = 8 與 20）");
for (const n of [8, 20]) {
  const p = { ...base, n };
  const e = ref(p);
  const sum = (p.w * p.h * n * (n + 1)) / 2;
  let tot = e.Ft;
  for (let i = 1; i <= n; i++) tot += ((e.V - e.Ft) * p.w * i * p.h) / sum;
  meld(Math.abs(tot - e.V) < 1e-9 * e.V, `n=${n} 合計 = V`);
}

console.log("\n4. 無效輸入一律拒算");
for (const [名, 舊, 新] of [
  ["臺北盆地", "taipei = 0'-", "taipei = 1'-"],
  ["S_DS 小於 S_D1/2.5", "S_DS = ?{0.80}", "S_DS = ?{0.10}"],
  ["R 超出 6", "R_duct = 4.8'-", "R_duct = 7'-"],
  ["I 非 1.0/1.25/1.5", "I_eq = tw_I'-", "I_eq = 1.1'-"],
  ["重量為零", "W_st = 450'tf", "W_st = 0'tf"],
]) {
  const { uit, res } = draai(vervang(twSeismicLoad, 舊, 新));
  meld(uit.V === undefined && res.voldoet !== true && res.nietGetoetst === true, `${名} 拒算`);
}


console.log("\n5. 工址行政區震區參數與近斷層修正資料庫（seis113 表 2-1、2-3-1、2-3-2、2-4、2-6(b)）");
{
  const {
    TW_SITE_SEISMIC,
    TW_SITE_SEISMIC_COUNT,
    TW_SITE_SEISMIC_TABLE21_COUNT,
    calcSeismicFa,
    calcSeismicFv,
    calcSiteDesignSpectrum,
  } = await import("../packages/desktop/src/normen/twSiteSeismic.ts");
  const allEntries = Object.values(TW_SITE_SEISMIC).flatMap((x) => Object.values(x));
  meld(allEntries.length === TW_SITE_SEISMIC_COUNT && allEntries.length === 356, `共 ${allEntries.length} 個行政區條目（表 2-1 327 區＋表 2-6(b) 雙北一般震區 29 區）`);
  meld(TW_SITE_SEISMIC_TABLE21_COUNT === 327, "表 2-1 全國 20 縣市 327 鄉鎮市區完整收錄");
  meld(Object.keys(TW_SITE_SEISMIC).length === 22, "涵蓋全部 22 個直轄市與縣市");
  meld(allEntries.every((e) => e.SsD >= 0.35 && e.SsD <= 0.80 && e.S1D >= 0.20 && e.S1D <= 0.50), "所有 SsD、S1D 皆落於規範範圍");

  // 抽樣對照規範原表
  const yilan = TW_SITE_SEISMIC["宜蘭縣"]["宜蘭市"];
  meld(yilan.SsD === 0.80 && yilan.S1D === 0.45 && yilan.faults.length === 0, "宜蘭縣宜蘭市：SsD=0.80, S1D=0.45, 無近斷層");
  const heping = TW_SITE_SEISMIC["臺中市"]["和平區"];
  meld(heping.SsD === 0.70 && heping.S1D === 0.40 && heping.faults.includes("車籠埔斷層全段"), "臺中市和平區（表 2-1）：SsD=0.70, S1D=0.40, 含車籠埔斷層全段");
  const wenshan = TW_SITE_SEISMIC["臺北市"]["文山區（一般震區5里）"];
  meld(wenshan.SsD === 0.60 && wenshan.S1D === 0.35, "臺北市文山區一般震區里（表 2-6(b)）：SsD=0.60, S1D=0.35");

  // 表 2-4(a)/(b) 工址放大係數與線性內插核對
  meld(calcSeismicFa(1, 0.70) === 1.0 && calcSeismicFa(2, 0.55) === 1.1 && Math.abs(calcSeismicFa(3, 0.65) - 1.15) < 1e-9, "表 2-4(a) Fa 內插正確");
  meld(calcSeismicFv(1, 0.40) === 1.0 && calcSeismicFv(2, 0.35) === 1.4 && Math.abs(calcSeismicFv(3, 0.375) - 1.65) < 1e-9, "表 2-4(b) Fv 內插正確");

  // 規範 2.4 節解說範例：南投縣水里鄉鄰近車籠埔斷層，r = 13.5 km 時 SsD 為 0.80 與 0.70 之內插 = 0.75
  const nf = calcSiteDesignSpectrum(heping, 1, "車籠埔斷層全段", 13.5);
  meld(Math.abs(nf.SsD - 0.75) < 1e-9 && nf.nearFaultApplied === true, `表 2-3-1 車籠埔斷層 0.70 區（和平區）r=13.5 km → SsD=${nf.SsD}（預期 0.75）`);

  // 近斷層 r=2 km（新城斷層，竹北市，第二類地盤）：SsD(2)=0.86, S1D(2)=0.51 → Fa=1.0, Fv=1.1 → SDS=0.86, SD1=0.561
  const zhubei = TW_SITE_SEISMIC["新竹縣"]["竹北市"];
  const zbSpec = calcSiteDesignSpectrum(zhubei, 2, "新城斷層", 2.0);
  meld(Math.abs(zbSpec.SsD - 0.86) < 1e-9 && Math.abs(zbSpec.S1D - 0.51) < 1e-9 && Math.abs(zbSpec.SDS - 0.86) < 1e-9 && Math.abs(zbSpec.SD1 - 0.561) < 1e-9, "竹北市新城斷層 r=2 km 第二類地盤 SDS=0.86, SD1=0.561");

  // 確認一鍵帶入覆寫生效：將計算出的 SDS、SD1 寫入範本並驗證基底剪力 V 隨之更新
  const nOverride = evaluate(parse(twSeismicLoad), { S_DS: String(zbSpec.SDS), S_D1: String(zbSpec.SD1) }, SCOPE);
  const uOverride = leesGetallen(nOverride);
  const eOverride = ref({ ...base, SDS: zbSpec.SDS, SD1: zbSpec.SD1 });
  meld(near(uOverride.V, eOverride.V), `S_DS、S_D1 覆寫生效：V = ${uOverride.V.toFixed(3)} tf（預期 ${eOverride.V.toFixed(3)} tf）`);
}

console.log(fouten === 0 ? "\n全部通過。" : `\n${fouten} 項失敗。`);
process.exit(fouten === 0 ? 0 : 1);
