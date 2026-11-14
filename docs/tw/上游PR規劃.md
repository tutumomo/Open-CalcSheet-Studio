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

### PR 3：無頭模式與命令列（`--headless`、`eval`、`render`）

- **上游分支目標**：`OpenAEC-Foundation/Open-CalcSheet-Studio:main`
- **狀態**：草稿，尚未切分支（本 fork 內自用；決定送出時再自 `upstream/main` 乾淨切出）
- **修改檔案**：
  - `packages/desktop/src-tauri/src/cli.rs`（新增）：參數解析（`--version`／`--help`／`--headless`／`serve`／`eval`／`render`、`--json`／`--quiet`），不認得的 `-` 開頭參數以代碼 2 結束。
  - `packages/desktop/src-tauri/src/kenmerken.rs`（新增）與 `packages/desktop/build.rs`：建置時寫入 `OCSS_EDITION`、`OCSS_GIT_COMMIT`、`OCSS_BUILD_DATE`、完整 tag，讓不開視窗也讀得到版本。
  - `packages/desktop/src-tauri/src/lib.rs`：`--headless` 只啟動 API／MCP 伺服器（127.0.0.1:3879），`RunEvent::Exit` 時清理子程序。
  - `packages/desktop/src/mcp/cli.ts`（新增）：`eval`／`render` 走**同一個**工具 registry（`mcp/tools.ts`），因此命令列與 API 能力一致。
  - `packages/desktop/src/mcp/rest.ts`：新增免權杖的 `GET /api/v1/health`（回 edition／version／tag）。
- **動機與效益**：CI、腳本與 AI 代理不需要視窗。版本資訊在建置時寫入，也讓同一台機器上的多個 edition 可辨識。
- **驗證指令**：
  ```bash
  node scripts/check-ocss-headless.mjs
  cargo test --manifest-path packages/desktop/src-tauri/Cargo.toml --lib cli
  ```

---

### PR 4：PDF 產出（`export_pdf` 與 `render --pdf`）

- **上游分支目標**：`OpenAEC-Foundation/Open-CalcSheet-Studio:main`
- **狀態**：草稿，尚未切分支
- **修改檔案**：
  - `packages/desktop/src/mcp/tools/overig.ts`：新增 `export_pdf` 工具（把一張表或一份報告輸出成 PDF 檔），MCP 與 REST 兩邊同時註冊，annotations 為 `readOnlyHint: false`。
  - `packages/desktop/src/mcp/cli.ts`：`render <bestand> --pdf <uit.pdf>` 以 `sheet_add` 建表後呼叫 `export_pdf`。
  - 建置：需要報表引擎（`--features rapportengine`）；未編譯該 feature 時工具回報明確錯誤，而不是靜默失敗。
- **動機與效益**：PDF 是交付物本身。上游已有列印路徑，缺的是可從 API／命令列觸發的同一個出口。
- **驗證指令**：
  ```bash
  node scripts/check-rapport-pdf.mjs
  node scripts/check-mcp.mjs
  ```

---

### PR 5：單位警告與 `strict` 拒算

- **上游分支目標**：`OpenAEC-Foundation/Open-CalcSheet-Studio:main`
- **狀態**：草稿，尚未切分支
- **修改檔案**：
  - `packages/desktop/src/mcp/rekenen.ts`：每行回傳 `warnings[]`（非整數次方造成的量綱不確定），錯誤碼沿用既有 `UNIT_WARNING`。
  - `packages/desktop/src/mcp/tools/bladen.ts`：`calc_evaluate`／`sheet_evaluate` 新增 `strict`（預設 false）；`strict: true` 時有警告即拒算並回 `UNIT_WARNING`，另加 `conventionalUnits` 給慣用單位。
  - `packages/desktop/src/mcp/contracts.ts`：回應欄位只增不改（`expr`、`si_value`、`clause`、`check`、`warnings`）。
- **動機與效益**：`x^0.5` 之類的式子在量綱上不嚴謹，卻常是工程慣例。把「警告」與「拒算」分成兩個開關，下游可以自己決定嚴格度，既有呼叫端行為不變。
- **驗證指令**：
  ```bash
  node scripts/check-api.mjs
  node scripts/check-mcp.mjs
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
