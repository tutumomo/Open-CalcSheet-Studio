/**
 * 上游（歐洲規範）模組標示（階段 2b／3）。
 *
 * 本 fork 保留的上游四張計算表依 Eurocode＋荷蘭國家附錄撰寫，不是台灣規範。
 * 目錄與列印都要標明，避免使用者誤把它當作依台灣規範的檢核。
 * 台灣模組的 templateId 一律以 `tw-` 開頭，不在此集合內。
 */
export const EUROCODE_TEMPLATE_IDS: ReadonlySet<string> = new Set([
  "ligger",
  "balklaag",
  "tweepaalspoer",
  "doorsnede-spanningen",
]);

/** 此計算表是否由上游 Eurocode 模組而來（列印時加註「非台灣規範」）。 */
export function isEurocodeBlad(ex: { templateId?: string }): boolean {
  return !!ex.templateId && EUROCODE_TEMPLATE_IDS.has(ex.templateId);
}
