/**
 * 歐規（Eurocode）模組標示檢查（階段 2b／3）
 *
 * 1. 目錄（projectTree.ts）中凡非 `tw-` 開頭、非示範的模組，都在 EUROCODE_TEMPLATE_IDS 內；集合內每一項都在目錄中。
 * 2. zh-TW 目錄標籤對上游模組加註「Eurocode，非台灣規範」；台灣模組標籤不含 Eurocode。
 * 3. 列印加註鍵 afdruk.eurocodeKlein 三語言都有；isEurocodeBlad 對上游模組為真、對台灣模組為假。
 *
 * 執行：node scripts/check-tw-eurocode.mjs
 */
import { readFileSync } from "node:fs";
import { moduleCatalogus } from "../packages/desktop/src/components/calc/projectTree.ts";
import { EUROCODE_TEMPLATE_IDS, isEurocodeBlad } from "../packages/desktop/src/components/calc/eurocodeModules.ts";

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}
const lees = (taal, bestand) => JSON.parse(readFileSync(new URL(`../packages/desktop/src/i18n/locales/${taal}/${bestand}.json`, import.meta.url), "utf8"));

const ids = [];
(function loop(l) { for (const n of l) { if (n.kind === "item" && n.templateId) ids.push(n.templateId); if (n.children) loop(n.children); } })(moduleCatalogus);
const upstream = ids.filter((id) => !id.startsWith("tw-"));
const taiwan = ids.filter((id) => id.startsWith("tw-"));

console.log("=== 歐規模組標示 ===\n");
console.log("1. 集合與目錄一致");
meld(upstream.length > 0 && upstream.every((id) => EUROCODE_TEMPLATE_IDS.has(id)), `目錄中 ${upstream.length} 個上游模組皆在集合內`, upstream.filter((i) => !EUROCODE_TEMPLATE_IDS.has(i)).join(","));
meld([...EUROCODE_TEMPLATE_IDS].every((id) => ids.includes(id)), "集合內每一項都在目錄中");
meld(taiwan.length > 0 && taiwan.every((id) => !EUROCODE_TEMPLATE_IDS.has(id)), `${taiwan.length} 個台灣模組不在集合內`);

console.log("\n2. zh-TW 目錄標籤標示");
{
  const m = lees("zh-TW", "werkruimte").catalogus.modules;
  meld([...EUROCODE_TEMPLATE_IDS].every((id) => /Eurocode，非台灣規範/.test(m[id] ?? "")), "zh-TW：上游模組標籤皆含「Eurocode，非台灣規範」", [...EUROCODE_TEMPLATE_IDS].filter((id) => !/Eurocode，非台灣規範/.test(m[id] ?? "")).join(","));
  meld(taiwan.every((id) => !/Eurocode/.test(m[id] ?? "")), "zh-TW：台灣模組標籤不含 Eurocode");
}

console.log("\n3. 列印加註與判斷函式");
const 標記 = { "zh-TW": /Eurocode，非台灣規範/, en: /Eurocode, not a Taiwan code/, nl: /Eurocode, geen Taiwanese norm/ };
for (const [taal, re] of Object.entries(標記)) {
  meld(re.test(lees(taal, "beelden").afdruk?.eurocodeKlein ?? ""), `${taal}：afdruk.eurocodeKlein 正確定義`);
}
meld(upstream.every((id) => isEurocodeBlad({ templateId: id })), "isEurocodeBlad：上游模組為真");
meld(taiwan.every((id) => !isEurocodeBlad({ templateId: id })) && !isEurocodeBlad({}) && !isEurocodeBlad({ templateId: "constructor" }), "isEurocodeBlad：台灣模組、空值、原型屬性皆為假");

console.log(fouten === 0 ? "\n全部通過。" : `\n${fouten} 項失敗。`);
process.exit(fouten === 0 ? 0 : 1);
