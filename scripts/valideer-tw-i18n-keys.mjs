/**
 * 檢查 zh-TW locale 檔案的鍵結構與變數插值是否與 en 完全對齊。
 *
 * 執行：node scripts/check-tw-i18n-keys.mjs [namespace]
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));
const LOCALES = join(hier, "../packages/desktop/src/i18n/locales");
const EN_DIR = join(LOCALES, "en");
const TW_DIR = join(LOCALES, "zh-TW");

const doelNs = process.argv[2];
const files = (doelNs ? [`${doelNs}.json`] : readdirSync(EN_DIR)).filter(f => f.endsWith(".json"));

let totaalFouten = 0;

function flatKeys(obj, prefix = "") {
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === "object" && !Array.isArray(v)) {
      Object.assign(result, flatKeys(v, full));
    } else {
      result[full] = String(v);
    }
  }
  return result;
}

function extractVars(str) {
  const matches = str.match(/\{\{([^}]+)\}\}/g) || [];
  return matches.map(m => m.replace(/[{}]/g, "").trim()).sort();
}

for (const file of files) {
  const enPath = join(EN_DIR, file);
  const twPath = join(TW_DIR, file);

  if (!existsSync(twPath)) {
    console.log(`[未建立] ${file} 尚未存在於 zh-TW`);
    continue;
  }

  let enObj, twObj;
  try {
    enObj = JSON.parse(readFileSync(enPath, "utf8"));
  } catch (e) {
    console.error(`EN JSON 解析錯誤 ${file}:`, e.message);
    totaalFouten++;
    continue;
  }

  try {
    twObj = JSON.parse(readFileSync(twPath, "utf8"));
  } catch (e) {
    console.error(`TW JSON 解析錯誤 ${file}:`, e.message);
    totaalFouten++;
    continue;
  }

  const enFlat = flatKeys(enObj);
  const twFlat = flatKeys(twObj);

  const enKeys = new Set(Object.keys(enFlat));
  const twKeys = new Set(Object.keys(twFlat));

  const missing = [...enKeys].filter(k => !twKeys.has(k));
  const extra = [...twKeys].filter(k => !enKeys.has(k));

  let varErrors = 0;
  for (const k of enKeys) {
    if (twKeys.has(k)) {
      const enVars = extractVars(enFlat[k]);
      const twVars = extractVars(twFlat[k]);
      if (enVars.join(",") !== twVars.join(",")) {
        console.warn(`  [變數不一致] ${file} -> ${k}: EN={{${enVars.join(",")}}} vs TW={{${twVars.join(",")}}}\n    EN: "${enFlat[k]}"\n    TW: "${twFlat[k]}"`);
        varErrors++;
      }
    }
  }

  const ok = missing.length === 0 && extra.length === 0 && varErrors === 0;
  if (ok) {
    console.log(`[OK] ${file}: ${twKeys.size} 鍵完全符合`);
  } else {
    console.error(`[錯誤] ${file}:`);
    if (missing.length > 0) {
      console.error(`  缺少鍵 (${missing.length}):`, missing.slice(0, 10));
    }
    if (extra.length > 0) {
      console.error(`  多餘鍵 (${extra.length}):`, extra.slice(0, 10));
    }
    if (varErrors > 0) {
      console.error(`  變數不符: ${varErrors} 處`);
    }
    totaalFouten++;
  }
}

if (totaalFouten > 0) {
  process.exit(1);
} else {
  console.log("\n全部已檢查檔案對齊無誤。");
}
