/**
 * 台灣版「專案資料」檢查：tw_ 欄位、導出變數（用途係數、地況參數）、
 * 載重表接線（tw-wind-load、tw-seismic-load）與新增計算表時的起始值。
 *
 * 規範依據（均為已驗證庫，不另取新數值）：
 *  - btr_struct_seismic_I／seis113_I_class：耐震 I = 1.5／1.5／1.25／1.0
 *  - wind103full_use_factor_I：耐風 I = 1.1（第一～三類）／1.0
 *  - 耐風規範 2.3 解說：α = 0.32／0.25／0.15；z_g 僅地況 C = 300 m 有依據，A/B 須拒算
 *
 * 獨立對照：風速壓 q_h = 0.06·2.774·(H/z_g)^(2α)·(I·V10)²（式 2.6、2.7）以本檔算式另算，
 * 與範本輸出比對；不依賴 WorkBench。
 *
 * 執行：node scripts/check-tw-projectgegevens.mjs（需已建置 core）
 */
import { parse, evaluate } from "../packages/core/dist/index.js";
import {
  PROJECT_VELDEN, legeGegevens, projectScope, startWaarden, getalWaarde,
  twIVoor, twIwVoor, twTerreinVoor,
} from "../packages/desktop/src/store/projectGegevens.ts";
import { twWindLoad } from "../packages/desktop/src/templates/tw-wind-load.ts";
import { twSeismicLoad } from "../packages/desktop/src/templates/tw-seismic-load.ts";
import { leesResultaat, leesGetallen } from "../packages/desktop/src/components/calc/bladLezen.ts";

let fouten = 0;
function meld(ok, t, d = "") { console.log(`  ${ok ? "OK    " : "FOUT  "} ${t}${ok || !d ? "" : `  -> ${d}`}`); if (!ok) fouten++; }
const near = (a, b) => typeof a === "number" && Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
const scopeMet = (wijzig) => projectScope({ ...legeGegevens(), ...wijzig });

console.log("=== 台灣版專案資料 ===\n");

console.log("1. 欄位定義");
const TW = PROJECT_VELDEN.filter((v) => v.naam.startsWith("tw_"));
meld(TW.length === 6, "六個 tw_ 欄位", TW.map((v) => v.naam).join());
meld(PROJECT_VELDEN.every((v, i, a) => a.findIndex((w) => w.naam === v.naam) === i), "欄位名稱不重複");
for (const v of TW.filter((x) => x.type === "keuze")) {
  const waarden = v.opties.map((o) => o.waarde);
  meld(new Set(waarden).size === waarden.length, `${v.naam}：選項值不重複`);
  meld(waarden.includes(v.standaard), `${v.naam}：預設值在選項內`);
}
for (const v of TW.filter((x) => x.type === "getal")) meld(getalWaarde(v.standaard) > 0, `${v.naam}：預設為正數`);

console.log("\n2. 用途係數（耐震 / 耐風）");
const iEq = [[1, 1.5], [2, 1.5], [3, 1.25], [4, 1.0]];
const iWi = [[1, 1.1], [2, 1.1], [3, 1.1], [4, 1.0]];
for (const [k, i] of iEq) meld(twIVoor(k) === i && scopeMet({ tw_klasse: String(k) }).tw_I === i, `第 ${k} 類：耐震 I = ${i}`);
for (const [k, i] of iWi) meld(twIwVoor(k) === i && scopeMet({ tw_klasse: String(k) }).tw_Iw === i, `第 ${k} 類：耐風 I = ${i}`);
meld(scopeMet({}).tw_I === 1.0 && scopeMet({}).tw_Iw === 1.0, "預設（第四類）：I = 1.0 / 1.0");

console.log("\n3. 地況參數");
meld(near(scopeMet({ tw_terrein: "1" }).tw_alpha_w, 0.32) && scopeMet({ tw_terrein: "1" }).tw_zg === 0, "地況 A：α = 0.32，z_g 無已驗證值（0）");
meld(near(scopeMet({ tw_terrein: "2" }).tw_alpha_w, 0.25) && scopeMet({ tw_terrein: "2" }).tw_zg === 0, "地況 B：α = 0.25，z_g 無已驗證值（0）");
meld(near(scopeMet({}).tw_alpha_w, 0.15) && scopeMet({}).tw_zg === 300, "地況 C（預設）：α = 0.15，z_g = 300");
const bad = twTerreinVoor(3);
meld(bad.alpha === 0.15 && bad.zg === 300, "twTerreinVoor(3)");

console.log("\n4. 數值欄位解析");
meld(scopeMet({ tw_V10: "36,5" }).tw_V10 === 36.5, "逗號視為小數點");
meld(scopeMet({ tw_V10: "abc" }).tw_V10 === 40, "非數字退回預設");
meld(scopeMet({ tw_V10: "" }).tw_V10 === 40, "空白退回預設");
meld(scopeMet({ tw_SDS: "0.6" }).tw_SDS === 0.6, "S_DS 照填");

console.log("\n5. 載重表接線（獨立對照）");
const rechen = (tpl, scope, waarden = {}) => {
  const nodes = evaluate(parse(tpl.replaceAll("#hide\n", "#show\n")), waarden, scope);
  return { uit: leesGetallen(nodes), res: leesResultaat(evaluate(parse(tpl), waarden, scope), "x") };
};
const qh = (V, I, a, zg, H) => 0.06 * 2.774 * (Math.max(H, 5) / zg) ** (2 * a) * (I * V) ** 2;
const H = 8 * 3.5;
{
  const r = rechen(twWindLoad, scopeMet({}));
  meld(near(r.uit.q_h, qh(40, 1.0, 0.15, 300, H)), "預設：q_h 與獨立算式一致", `${r.uit.q_h}`);
  const r1 = rechen(twWindLoad, scopeMet({ tw_klasse: "1" }));
  meld(near(r1.uit.q_h, qh(40, 1.1, 0.15, 300, H)), "第一類：I_w = 1.1", `${r1.uit.q_h}`);
  meld(near(r1.uit.q_h / r.uit.q_h, 1.21), "第一類／第四類 q_h = 1.1² = 1.21");
  const rA = rechen(twWindLoad, scopeMet({ tw_terrein: "1" }));
  meld(rA.res.nietGetoetst === true && rA.uit.q_h === undefined, "地況 A：z_g 無已驗證值，風力表拒算");
  const rB = rechen(twWindLoad, scopeMet({ tw_terrein: "2" }));
  meld(rB.res.nietGetoetst === true && rB.uit.q_h === undefined, "地況 B：拒算");
  const rv = rechen(twWindLoad, scopeMet({}), { V_10: "36" });
  meld(near(rv.uit.q_h, qh(36, 1.0, 0.15, 300, H)), "V_10 起始值 36 m/s");
}
{
  const r4 = rechen(twSeismicLoad, scopeMet({}));
  const r1 = rechen(twSeismicLoad, scopeMet({ tw_klasse: "1" }));
  const r3 = rechen(twSeismicLoad, scopeMet({ tw_klasse: "3" }));
  meld(r4.uit.I_eq === 1.0 && r1.uit.I_eq === 1.5 && r3.uit.I_eq === 1.25, "I_eq 隨用途分類 1.0 / 1.5 / 1.25", `${r4.uit.I_eq}/${r1.uit.I_eq}/${r3.uit.I_eq}`);
  const k = Object.keys(r4.uit).find((n) => /^V_?(b|base|calc)?$/i.test(n)) ?? "V";
  const v4 = r4.uit[k], v1 = r1.uit[k];
  meld(typeof v4 === "number" && near(v1 / v4, 1.5), `基底剪力與 I 成正比（${k}）`, `${v1}/${v4}`);
}

console.log("\n6. 新增計算表時的起始值");
meld(JSON.stringify(startWaarden("tw-wind-load", legeGegevens())) === "{}", "專案未改：不寫入，範本保留自己的起始值");
meld(JSON.stringify(startWaarden("tw-wind-load", { ...legeGegevens(), tw_V10: "36" })) === '{"V_10":"36"}', "風力表帶入 V_10");
meld(JSON.stringify(startWaarden("tw-wind-load", { ...legeGegevens(), tw_V10: "36,5" })) === '{"V_10":"36.5"}', "逗號正規化為點");
meld(JSON.stringify(startWaarden("tw-wind-load", { ...legeGegevens(), tw_V10: "abc" })) === "{}", "非數字不帶入");
meld(JSON.stringify(startWaarden("tw-seismic-load", { ...legeGegevens(), tw_SDS: "0.6", tw_SD1: "0.45" })) === '{"S_DS":"0.6"}', "地震表只帶入有改的 S_DS");
meld(JSON.stringify(startWaarden("ligger", { ...legeGegevens(), tw_V10: "36" })) === "{}", "其他模組不受影響");

console.log(fouten === 0 ? "\n全部通過。" : `\n${fouten} 項失敗。`);
process.exit(fouten === 0 ? 0 : 1);
