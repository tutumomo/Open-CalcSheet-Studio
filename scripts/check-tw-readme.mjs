/**
 * README.zh-TW.md 的數字與清單一致性（台灣版；上游的 check-readme.mjs 只管 README.md 與 README.nl.md）。
 *
 *   • 第一行為語言切換列；repo 內連結都存在；
 *   • 檢查腳本數與 scripts/ 實際數量相同（與 check-readme.mjs 同一算法，排除 check-alles.mjs）；
 *   • 與英文 README 共用的數字（公式庫、MCP 工具、手算對照）相同；
 *   • 「台灣本土設計模組清單」表格與 projectTree.ts 的台灣表雙向一致，表列的檢查腳本都存在；
 *   • 路線圖段落的「共 N 張台灣計算表」與 projectTree.ts 一致。
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const WORTEL = join(dirname(fileURLToPath(import.meta.url)), "..");
const lees = (naam) => readFileSync(join(WORTEL, naam), "utf8").replace(/\r\n/g, "\n");
const zh = lees("README.zh-TW.md");
const en = lees("README.md");

let fouten = 0;
function meld(ok, tekst, detail = "") {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}${ok || !detail ? "" : `  -> ${detail}`}`);
  if (!ok) fouten++;
}
const getal = (t, re) => { const m = t.match(re); return m ? Number(m[1]) : NaN; };

console.log("README.zh-TW.md");
meld(zh.startsWith("[English](README.md) · [Nederlands](README.nl.md) · **繁體中文**"), "第一行為語言切換列");

const stuk = [...zh.matchAll(/\]\((?!https?:|#|mailto:)([^)#\s]+)/g)].map((m) => m[1]).filter((p) => !existsSync(join(WORTEL, p)));
meld(stuk.length === 0, "repo 內連結都存在", stuk.join(", "));

console.log("\n數字");
const scripts = readdirSync(join(WORTEL, "scripts")).filter((f) => /^check-.*\.mjs$/.test(f) && f !== "check-alles.mjs").length;
meld(zh.includes(`**${scripts} 個檢查腳本**`), `檢查腳本數 = ${scripts}`);
const paren = [
  ["公式庫公式數", /(\d+) formulas you can insert/, /包含 (\d+) 個可一鍵插入/],
  ["MCP 工具數", /(\d+) tools:/, /相同的 (\d+) 項工具/],
  ["手算對照總數", /\*\*(\d+) results against hand calculations\*\*/, /\*\*(\d+) 項手算對照驗證\*\*/],
  ["check-formules 項數", /(\d+) in `scripts\/check-formules/, /(\d+) 項位於 `scripts\/check-formules/],
  ["check-library 項數", /(\d+) in `scripts\/check-library/, /(\d+) 項位於 `scripts\/check-library/],
];
for (const [naam, reEn, reZh] of paren) {
  const a = getal(en, reEn), b = getal(zh, reZh);
  meld(Number.isFinite(a) && a === b, `${naam}與 README.md 相同（${a}）`, `README.md ${a}，README.zh-TW.md ${b}`);
}

console.log("\n台灣模組清單");
const boom = lees("packages/desktop/src/components/calc/projectTree.ts");
const twBladen = [...new Set([...boom.matchAll(/"(tw-[a-z0-9-]+)"/g)].map((m) => m[1]))].sort();
const sectie = zh.slice(zh.indexOf("### 台灣本土設計模組清單與狀態"));
const rijen = [...sectie.matchAll(/^\| .+? \| `(tw-[a-z0-9-]+)` \|.*$/gm)];
const inTabel = rijen.map((m) => m[1]).sort();
meld(twBladen.length > 0, `projectTree.ts 有 ${twBladen.length} 張台灣表`);
const nietInTabel = twBladen.filter((b) => !inTabel.includes(b));
const nietInBoom = inTabel.filter((b) => !twBladen.includes(b));
meld(nietInTabel.length === 0, "projectTree 的台灣表都列在模組表", nietInTabel.join(", "));
meld(nietInBoom.length === 0, "模組表沒有 projectTree 以外的識別碼", nietInBoom.join(", "));
meld(new Set(inTabel).size === inTabel.length, "模組表無重複列");
const scriptsInTabel = rijen.flatMap((m) => [...m[0].matchAll(/`(scripts\/check-[\w-]+\.mjs)`/g)].map((s) => s[1]));
const ontbreekt = scriptsInTabel.filter((p) => !existsSync(join(WORTEL, p)));
meld(scriptsInTabel.length === rijen.length && ontbreekt.length === 0, "每列的檢查腳本都存在", ontbreekt.join(", ") || `${scriptsInTabel.length}/${rijen.length}`);
const n = getal(zh, /共 (\d+) 張台灣計算表/);
meld(n === twBladen.length, `路線圖「共 N 張台灣計算表」= ${twBladen.length}`, String(n));

console.log(fouten === 0 ? "\n全部一致。" : `\n${fouten} 項不一致。`);
process.exit(fouten === 0 ? 0 : 1);
