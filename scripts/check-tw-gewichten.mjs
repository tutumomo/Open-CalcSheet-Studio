/**
 * 台灣建材重量庫（library/gewichten/ 中 regio = "TW" 的條目）檢核。
 *
 * 來源（A 級已驗證庫，不得改動數值，改動須同步 regs 版次）：
 *   - 構造編第 11 條（btr_struct_unit_weight_T11）：30 種材料單位體積重量（kg/m³）
 *   - 構造編第 14 條（btr_struct_floor_weight_T14）：8 種地板面重量（kgf/m²）
 *   - 構造編第 15 條（btr_struct_wall_weight_T15）：14 種牆壁、6 種粉刷貼面（每 1 cm 厚，kgf/m²）
 * 下方表格逐列抄自上述已驗證表（kg 數值，條文以公斤表示）。重量庫沿用既有慣例 1 kg ≙ 0.00981 kN
 * （KG_NAAR_KN），與 normwaarden.ts 的 g = 9.80665 相差 < 0.02 %，僅供選用；計算表仍用 SI 換算值。
 *
 * 檢查：
 *   1. 每列都在庫內，且 ρ 或 p 等於 kg 值 × 0.00981（容差 0.0006）；
 *   2. 沒有表外的 tw-btr-t11／t14／t15 條目；
 *   3. 台灣條目都有繁中名稱、官方網址 law.moj.gov.tw、修正日期；
 *   4. 與 normwaarden.ts 的 TW_EENHEIDSGEWICHTEN 逐項一致；
 *   5. 土類條目的含水狀態標記（乾＝droog、飽和＝verzadigd、濕＝nat）。
 */
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { KG_NAAR_KN } from "../packages/desktop/src/rapport/gewichtenBibliotheek.ts";
import { TW_EENHEIDSGEWICHTEN } from "../packages/desktop/src/rapport/tw/normwaarden.ts";

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const MAP = join(WORTEL, "library/gewichten");

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}

// id → [zh-TW 材料名稱（原表）, kg 值]
const T11 = {
  "tw-btr-t11-gewone-klei": ["普通黏土", 1600],
  "tw-btr-t11-verzadigde-grond": ["飽和濕土", 1800],
  "tw-btr-t11-droog-zand": ["乾沙", 1700],
  "tw-btr-t11-verzadigd-zand": ["飽和濕沙", 2000],
  "tw-btr-t11-droog-steenslag": ["乾碎石", 1700],
  "tw-btr-t11-verzadigd-steenslag": ["飽和濕碎石", 2100],
  "tw-btr-t11-nat-zand-steenslag": ["濕沙及碎石", 2300],
  "tw-btr-t11-vliegas-puzzolaan": ["飛灰火山灰", 650],
  "tw-btr-t11-ongewapend-beton": ["水泥混凝土", 2300],
  "tw-btr-t11-slakkenbeton": ["煤屑混凝土", 1450],
  "tw-btr-t11-kalk-tras-specie": ["石灰三合土", 1750],
  "tw-btr-t11-naaldhout": ["針葉樹木材", 500],
  "tw-btr-t11-loofhout": ["闊葉樹木材", 650],
  "tw-btr-t11-hardhout": ["硬木", 800],
  "tw-btr-t11-aluminium": ["鋁", 2700],
  "tw-btr-t11-koper": ["銅", 8900],
  "tw-btr-t11-mineraalslak": ["礦物溶滓", 1400],
  "tw-btr-t11-puimsteen": ["浮石", 900],
  "tw-btr-t11-zandsteen": ["砂石", 2000],
  "tw-btr-t11-graniet": ["花崗石", 2500],
  "tw-btr-t11-marmer": ["大理石", 2700],
  "tw-btr-t11-metselbaksteen": ["磚", 1900],
  "tw-btr-t11-schuimbeton": ["泡沫混凝土", 1000],
  "tw-btr-t11-gewapend-beton": ["鋼筋混凝土", 2400],
  "tw-btr-t11-messing": ["黃銅紫銅", 8600],
  "tw-btr-t11-ruwijzer": ["生鐵", 7200],
  "tw-btr-t11-smeedijzer": ["熟鐵", 7650],
  "tw-btr-t11-staal": ["鋼", 7850],
  "tw-btr-t11-lood": ["鉛", 11400],
  "tw-btr-t11-zink": ["鋅", 8900],
};
// 土類的含水狀態：乾→droog、飽和→verzadigd、「濕沙及碎石」→nat、「普通黏土」未標
const TOESTAND = {
  "tw-btr-t11-droog-zand": "droog", "tw-btr-t11-droog-steenslag": "droog",
  "tw-btr-t11-verzadigde-grond": "verzadigd", "tw-btr-t11-verzadigd-zand": "verzadigd", "tw-btr-t11-verzadigd-steenslag": "verzadigd",
  "tw-btr-t11-nat-zand-steenslag": "nat",
};
const T14 = {
  "tw-btr-t14-cement-dekvloer": 20, "tw-btr-t14-terrazzo-vloer": 24, "tw-btr-t14-natuursteen-vloer": 30,
  "tw-btr-t14-mozaiek-vloer": 20, "tw-btr-t14-asfalttegels": 25, "tw-btr-t14-parketvloer": 15,
  "tw-btr-t14-houten-strokenvloer": 15, "tw-btr-t14-tatami-vloer": 35,
};
const T15 = {
  "tw-btr-t15-baksteenwand-240": 440, "tw-btr-t15-holle-betonsteen-200": 250, "tw-btr-t15-holle-betonsteen-150": 190,
  "tw-btr-t15-holle-betonsteen-100": 130, "tw-btr-t15-holle-slakkensteen-200": 165, "tw-btr-t15-holle-slakkensteen-150": 135,
  "tw-btr-t15-holle-slakkensteen-100": 100, "tw-btr-t15-holle-baksteen": 192, "tw-btr-t15-kalkzandsteen-240": 440,
  "tw-btr-t15-rabat-hout": 25, "tw-btr-t15-stuc-op-riet": 50, "tw-btr-t15-rietplaatwand": 8,
  "tw-btr-t15-multiplexwand": 6, "tw-btr-t15-bamboewand": 48,
  // 牆面粉刷及貼面：每 1 cm 厚
  "tw-btr-t15-stuc-cement-10": 20, "tw-btr-t15-mozaiek-wand-10": 20, "tw-btr-t15-terrazzo-wand-10": 20,
  "tw-btr-t15-gewassen-grind-10": 20, "tw-btr-t15-marmer-wand-10": 30, "tw-btr-t15-bloksteen-wand-10": 25,
};

const alle = new Map();
for (const f of readdirSync(MAP).filter((x) => x.endsWith(".json"))) {
  for (const r of JSON.parse(readFileSync(join(MAP, f), "utf8")).regels) alle.set(r.id, r);
}
const tw = [...alle.values()].filter((r) => r.regio === "TW");

console.log("構造編第 11 條（單位體積重量 ρ）");
const fout11 = [];
for (const [id, [naam, kg]] of Object.entries(T11)) {
  const r = alle.get(id);
  if (!r) { fout11.push(`${id} 不在庫內`); continue; }
  if (r.rho === undefined || Math.abs(r.rho - kg * KG_NAAR_KN) > 0.0006) fout11.push(`${id}: ρ ${r.rho} ≠ ${kg}×0.00981`);
  if (!r.naam["zh-TW"]?.startsWith(`${naam}（`)) fout11.push(`${id}: 繁中名稱「${r.naam["zh-TW"]}」不以「${naam}（」開頭`);
  if (r.toestand !== TOESTAND[id]) fout11.push(`${id}: toestand ${r.toestand} ≠ ${TOESTAND[id]}`);
}
meld(Object.keys(T11).length === 30, "第 11 條表共 30 列", String(Object.keys(T11).length));
meld(fout11.length === 0, "30 列都在庫內，ρ = kg × 0.00981，名稱與含水狀態正確", fout11.join("; "));

console.log("\n構造編第 14、15 條（面層與牆壁 p）");
const fout1415 = [];
for (const [id, kg] of [...Object.entries(T14), ...Object.entries(T15)]) {
  const r = alle.get(id);
  if (!r) { fout1415.push(`${id} 不在庫內`); continue; }
  if (r.p === undefined || Math.abs(r.p - kg * KG_NAAR_KN) > 0.0006) fout1415.push(`${id}: p ${r.p} ≠ ${kg}×0.00981`);
}
meld(Object.keys(T14).length === 8 && Object.keys(T15).length === 20, "第 14 條 8 列、第 15 條 20 列", `${Object.keys(T14).length}／${Object.keys(T15).length}`);
meld(fout1415.length === 0, "28 列都在庫內，p = kg × 0.00981", fout1415.join("; "));

console.log("\n完整性與來源");
const erwacht = new Set([...Object.keys(T11), ...Object.keys(T14), ...Object.keys(T15)]);
const extra = tw.filter((r) => /^tw-btr-t(11|14|15)-/.test(r.id) && !erwacht.has(r.id)).map((r) => r.id);
meld(extra.length === 0, "沒有表外的 tw-btr-t11／t14／t15 條目", extra.join(", "));
const zonderBron = tw.filter((r) => !r.naam["zh-TW"] || !/^https:\/\/law\.moj\.gov\.tw\//.test(r.bron.url ?? "") || !/^\d{4}-\d{2}-\d{2}$/.test(r.bron.datum ?? "")).map((r) => r.id);
meld(zonderBron.length === 0, `${tw.length} 筆台灣條目都有繁中名稱、官方網址與修正日期`, zonderBron.slice(0, 8).join(", "));
const verkeerdArtikel = tw.filter((r) => {
  const m = /^tw-btr-t(\d+)-/.exec(r.id);
  return m && !r.bron.titel.includes(`第 ${m[1]} 條`);
}).map((r) => r.id);
meld(verkeerdArtikel.length === 0, "條目 id 的條號與 bron 的條號一致", verkeerdArtikel.slice(0, 8).join(", "));

console.log("\n與報告常數 normwaarden.ts 一致");
const afwijkend = [];
for (const e of TW_EENHEIDSGEWICHTEN) {
  const hit = Object.entries(T11).find(([, [naam]]) => naam === e.materiaal);
  if (!hit) { afwijkend.push(`${e.materiaal} 不在重量庫`); continue; }
  if (hit[1][1] !== e.rho_kg_m3) afwijkend.push(`${e.materiaal}: 庫 ${hit[1][1]} ≠ 常數 ${e.rho_kg_m3}`);
  const r = alle.get(hit[0]);
  // 0.00981 與 9.80665/1000 相差 0.034 %；容差取 0.04 %
  if (r && Math.abs(r.rho / e.gamma_kN_m3 - 1) > 0.0004) afwijkend.push(`${e.materiaal}: ρ ${r.rho} 與 ${e.gamma_kN_m3.toFixed(3)} 差超過 0.04 %`);
}
meld(TW_EENHEIDSGEWICHTEN.length > 0 && afwijkend.length === 0, `TW_EENHEIDSGEWICHTEN ${TW_EENHEIDSGEWICHTEN.length} 項與重量庫一致`, afwijkend.join("; "));

console.log(fouten === 0 ? "\n台灣重量庫全部一致。" : `\n${fouten} 項不一致。`);
process.exit(fouten === 0 ? 0 : 1);
