# 上游 PR 規劃與維護策略

依據 `docs/tw/工作計畫.md` §8.6「開源協同與獨立發佈打包」，本 fork 致力於將具通用價值之計算核心基礎設施回饋至上游專案 `OpenAEC-Foundation/Open-CalcSheet-Studio`，同時維持台灣本土規範模組與上游主線之乾淨解耦。

---

## 1. 回饋原則與分支邊界

1. **零污染（Zero-coupling）**：PR 內容僅包含通用計算邏輯與多語言擴充，絕對不混入台灣本土規範範本（`tw-*.ts`）、法規常數或專屬視圖元件。
2. **完全向後相容（Strict Backward Compatibility）**：所有荷蘭文（nl）與英文（en）既有測試、Snapshot 與回歸檢核必須 100% 維持綠燈，不改變任何既有模組之計算結果。
3. **獨立可審查（Self-contained & Auditable）**：每個 PR 聚焦於單一職責，附帶對應之自動化測試腳本。

---

## 2. PR 清單與規格

### PR 1：重力公制（MKS）工程單位制支援

- **上游分支目標**：`OpenAEC-Foundation/Open-CalcSheet-Studio:main`
- **本庫 PR 分支**：`upstream-pr/mks-units`
- **修改檔案**：
  - `packages/core/src/eenheden.ts`：以 mathjs 定義 `tf`（`1000 kgf`，mathjs 原生已知 `kgf`）。
  - `packages/core/src/eenheidstelsel.ts`：
    - `STELSELS` 新增 `'tw-mks'` 單位制預設（`tf`、`tf m`、`tf / m`、`tf / m^2`、`kgf / cm^2` 等）。
    - `OP_NAAM` 補齊 `kgf/cm^2`、`tf/m^2`、`kgf/m^2`（應力／面載重）之量綱辨識。
    - `eenheidUitBeeld` 支援 `tfm`、`kgfm` 解析為力矩格式。
  - `scripts/check-eenheidstelsel.mjs`：加入 MKS 單位換算、量綱分類與 Eurocode 模組（`balklaag.ts`、`ligger.ts`）在 MKS 單位制下計算數值一字不變之回歸檢核。
- **動機與效益**：
  許多亞洲與歐洲歷史工程專案廣泛使用重力公制（tf、kgf/cm²）。本改動使 Open CalcSheet Studio 能無縫支援 MKS 專案，且與既有 SI 及 US Customary 系統完美並存。
- **驗證指令**：
  ```bash
  npm --prefix packages/core run build && node scripts/check-eenheidstelsel.mjs
  ```

---

### PR 2：結尾行結果解析多語言支援（`leesResultaat`）

- **上游分支目標**：`OpenAEC-Foundation/Open-CalcSheet-Studio:main`
- **本庫 PR 分支**：`upstream-pr/multilang-closing-lines`
- **修改檔案**：
  - `packages/desktop/src/components/calc/bladLezen.ts`：
    - `slot` 識別字元增加繁體中文「`控制 UC`」（除既有荷蘭文「`Maatgevende UC`」與英文「`Governing UC`」外）。
    - 判定合格邏輯嚴格先檢核否定詞，再檢核肯定詞：
      ```ts
      voldoet = !/voldoe[nt] niet|\bnot OK\b|不合格/.test(zin) && /voldoe[nt]|\bOK\b|合格/.test(zin);
      ```
      確保「不合格」絕對不會因包含「合格」二字而被誤判為 true（Fail-safe 安全防護）。
    - 識別未檢核狀態增加「`總結：未檢核`」與「`總結：無效輸入，未檢核`」。
  - `scripts/check-uitvoer-taal.mjs`：第 6 節加入荷、英、繁中三語結尾行解析之多語言回歸測試。
- **動機與效益**：
  隨 App 介面朝多語言（i18n）演進，計算書標頭讀取各語言模組之 UC 與檢核結論應具備通用擴充性。嚴格的否定前置防護亦提升了上游核心之安全性。
- **驗證指令**：
  ```bash
  node scripts/check-uitvoer-taal.mjs
  ```

---

## 3. 上游同步（Upstream Sync）標準流程

依據 `CLAUDE.md`：
```bash
git remote add upstream https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio.git
git fetch upstream
git merge upstream/main
```

當發生衝突時之處置原則：
- `AGENTS.md`、`CLAUDE.md`：以本 fork 內容為準。
- `packages/core/src/eenheden.ts`、`packages/core/src/eenheidstelsel.ts`：保留 MKS 擴充並合併上游新功能。
- `packages/desktop/src/components/calc/bladLezen.ts`：保留多語言正則式並合併上游新欄位。
- 衝突解完後必跑：
  ```bash
  npm --prefix packages/core run build
  node scripts/check-alles.mjs
  ```
