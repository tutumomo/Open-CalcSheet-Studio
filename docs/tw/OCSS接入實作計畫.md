# OCSS TW 接入實作計畫（對應 `docs/OCSS_TW_開發需求規格.md`）

> 本檔是需求規格 §工作方式 第 1 項要求的計畫：每項需求的現況、做法、影響檔案、風險、驗收測試。
> 依 P0 → P1 → P2 分版交付；每版結束回報「做了什麼、怎麼驗證、哪些沒做」。

## 0. 架構決策（先講，因為它決定後面每一項的做法）

**無頭模式採「隱藏視窗」，不重寫一套 Node 服務。**

- 現況：MCP 與 REST 共用同一支 Rust 橋接器（`packages/desktop/src-tauri/src/mcp_bridge.rs`），
  它**不含任何領域邏輯**，把每個請求以 Tauri event 送進 webview，
  TypeScript 層（`packages/desktop/src/mcp/`）才是協定與 49 個工具的實作；
  工具直接操作 Zustand 專案 store 與 Tauri 外掛（檔案、列印、報表引擎）。
- 因此另寫 Node 版服務等於重寫 49 個工具與整個 store，且拿不到 Rust 的報表引擎（P0-2 反而更難）。
  改為：`--headless` 啟動時建立**不可見視窗**，其餘完全不變 → API／MCP 行為與 GUI 版 100% 相同
  （同一份 registry、同一個 token、同一組埠與狀態），符合規格「同一個 registry」的硬性約束。
- 限制（寫進文件與 release notes）：隱藏視窗仍需要圖形環境（Linux 上需 X／Wayland；CI 用 `xvfb-run`）。
  真正的無顯示伺服器（無 X）列為後續評估，不在 P0。
- 一次性 CLI（`eval`／`render`）走同一條路：啟動隱藏視窗 → 橋接器起來後由 Rust 對自己的
  `127.0.0.1` 打一次 REST 呼叫 → 印出 JSON → 結束。好處是 CLI 與 API 不可能行為分歧。

## 1. P0（沒有這些就無法自動化）

| # | 需求 | 現況 | 做法 | 影響檔案 | 風險 | 驗收 |
|---|---|---|---|---|---|---|
| 1 | 無頭模式 ＋ 一次性 CLI | `main.rs` 只有 `run()`，**完全沒有命令列參數處理**；任何參數都被忽略並開 GUI | ① 在 `run()` 之前解析 `--version`／`--help`／`--headless`／`eval`／`render`，前兩者立即印出並 `exit(0)`；② `--headless` 以 `visible(false)` 建視窗（並隱藏工作列項目）；③ `eval <file\|-> --json`、`render <file> --pdf <out>`：等橋接器就緒事件後呼叫 REST，印結果後離線 | `packages/desktop/src-tauri/src/lib.rs`、新建 `src/cli.rs`、`src/mcp_bridge.rs`（回報就緒埠）、`docs/mcp.md`、`docs/api.md` | 隱藏視窗仍需圖形環境；`build.rs`／bundle 不變 | 新增 `scripts/check-ocss-cli.mjs`：`--version`／`--help` 於 2 秒內結束且輸出含版本；`--headless` 起得來、`GET /api/v1/health` 有回應、無視窗（以 `--headless` 下 `xdotool` 不可用時改驗 `visible=false` 的單元測試） |
| 2 | API 產 PDF | `export_pdf` 只在桌面版可用，且發佈版**未編 `rapportengine` feature** → 回 501 | ① `release-tw.yml` 建置加 `--features rapportengine`（`openaec-core` 為公開 git 依賴，CI 可取得）；② 隱藏視窗下 `pdfViaEngine` 走同一支 Tauri 命令；③ 文件說明「不含繪圖」 | `.github/workflows/release-tw.yml`、`packages/desktop/src-tauri/src/rapport_pdf.rs`、`docs/api.md` | CI 需抓 git 依賴（無網即失敗）；引擎與 App 內 Rapport 版面仍需一致 | `scripts/check-ocss-cli.mjs`：以 `render --pdf` 產出一份 ≥ 10 kB 的 PDF 並檢查 `%PDF-` 檔頭；無引擎時須回 `NOT_AVAILABLE` 而非 500 |
| 3 | 版本可辨識 | `app_info.version` 只回 `2026.46.1`；無 commit／建置日／edition；deb `Version` 亦同 | ① 建置時以 `build.rs` 寫入 `OCSS_EDITION`（`tw`／`upstream`，由 `identifier` 判定）、`OCSS_GIT_COMMIT`、`OCSS_BUILD_DATE`；② `app_info` 增 `version`（完整 tag，如 `2026.46.1-tw.1`）、`commit`、`buildDate`、`edition`（**只新增欄位**）；③ `release-tw.yml` 於打包前把 `tauri.conf.json` 版本改為 `X.Y.Z-tw.N`，使 deb／msi／dmg 版本欄可辨 | `packages/desktop/build.rs`、`lib.rs`、`mcp_bridge.rs`（伺服器資訊）、`mcp/tools/project.ts`、`release-tw.yml`、`scripts/versie.mjs`（不改上游欄位語意） | 版本字串格式不符 semver 會讓 deb 打包失敗（需 `X.Y.Z-tw.N` 前綴仍為數字） | 新增 `scripts/check-ocss-versie.mjs`：解析 `app_info` 回應結構（以假 ctx 單元測試）＋檢查 `release-tw.yml` 含三段版本改寫步驟 |
| 4 | 與上游並存 | 兩版都用 3879；未認證請求只回 401，無從判斷版本 | ① 新增**免 token**（仍需過 Origin 檢查）的 `GET /api/v1/health`，回 `{status, edition, version, port, name}`；② `edition` 取自 #3；③ 文件建議 TW 版預設埠維持 3879，客戶端先打 health 判斷 | `mcp_bridge.rs`（`is_public` 增加 health、直接以 Rust 回應不進 webview）、`mcp/openapi.ts`（文件化）、`docs/api.md` | 免 token 端點會多曝一點資訊（版本／edition）——刻意為之，不含專案資料 | `scripts/check-ocss-health.mjs`：Rust 單元測試（`is_public`、回應 JSON）＋文件檢查 |
| 5 | 拋棄式工作階段 | `project_new` 會直接換掉目前專案並留「未儲存」旗標 | ① 新增 `session_new`／`session_close`：在記憶體開一個隔離專案（不動使用者專案、不設未儲存旗標、不寫 recent files），關閉後還原原專案；② `project_new` 加 `scratch=true` 同義 | `mcp/tools/project.ts`、`mcp/omgeving.ts`（新增 `werkblad` 概念）、`store/projectStore.ts`（快照／還原）、`mcp/openapi.ts` | 快照期間使用者若在 GUI 改東西會衝突 → 以「session 期間 GUI 編輯視為同一 store」處理，並在回應標 `scratch: true` | `scripts/check-ocss-session.mjs`：session_new → sheet_add → evaluate → session_close 後專案與 rc 檔逐欄相同、`dirty=false`、recentFiles 不變 |

## 2. P1（把計算結果變成可信的機讀資料）

| # | 需求 | 現況 | 做法 | 風險 |
|---|---|---|---|---|
| 6 | 單位安全 | 計算以 mathjs 進行，`R^(2/3)` 之類會留下 `m^0.667` 量綱；無警告欄位 | 在 `evaluator.ts` 收集量綱異常（非整數指數、同式加減不同量綱）→ `Doorrekening.waarschuwingen`；`calc_evaluate`／`sheet_evaluate` 回 `warnings[]`（`code`／`line`／`message`）；`strictUnits` 參數或設定把警告升為錯誤；顯示層收斂 `kN/mm² → MPa`（`eenheden.ts` 的 `mooisteEenheid`） | 既有 106 支檢查腳本大量依賴現行輸出 → 只新增欄位、不改既有欄位；`#hide` 區塊的警告仍要回報 |
| 7 | 結構化結果 | `lines[]` 已含 `name`／`expr`／`value`／`unit`，但無 `si_value`／`clause`／`check`／`uc` | 在 `renderer.ts` 的節點上加 `siWaarde`；`bladLezen.leesResultaat` 的 UC 與判定改為逐列標記 `check: pass/fail/unchecked`；`@toets` 無回應固定 `unchecked`（現行已如此判 `nietGetoetst`，改為逐列） | `unchecked` 誤判成 `pass` 是最高風險 → 負向測試必留 |
| 8 | `module_schema` | 無此工具；下游靠人工維護 `maps/*.json` | 新工具：由 `templates/index.ts` 的模板文字解析輸入（`x = ?`）、`@select` 選項、單位與範圍（範圍寫在 `?{…}` 與 `<i>` 說明），加上模組的規範版本與條號（由 `docs/tw/規範來源.md` 產生對照表，隨版本更新） | 解析規則與 `InvoerPaneel` 用的 `velden.ts` 必須一致 → 直接重用 `velden.ts`，不另寫一套 |
| 9 | 收斂迭代 | parser 已有 `#while cond … #loop`（無容差與上限） | 擴充為 `#while cond tol=… max=…`（或 `#iterate`）：達上限未收斂 → 結構化錯誤 `NOT_CONVERGED`（含迭代數與殘差），預設上限 100、tol 1e-9 | 既有 `#while` 語意不得改變（無 `tol`／`max` 時行為同今） |
| 10 | 長工作與循序 | 橋接器嚴格序列、逾時 120 s | ① 新工具 `calc_evaluate_batch`（多段 source）；② `job_start`／`job_status`／`job_cancel`：在 webview 以 `setTimeout` 切片執行，狀態存記憶體，`job_status` 回進度 | 橋接器序列化與 job 並行會互卡 → job 必須讓出事件迴圈（`await` 每段） |

## 3. P2（充分利用豐富格式）

| # | 需求 | 現況 | 做法 |
|---|---|---|---|
| 11 | 各表種讀取與觸發 | `view_get`／`sheet_get` 已有部分；spreadsheet 格值、jupyter／marimo 執行輸出、graph 節點值未結構化；jupyter／marimo 需在 App 內按執行 | `view_get` 擴充回 `cells[]`（值＋公式結果）、`outputs[]`、`nodes[]`；新增 `sheet_run`（jupyter／marimo／graph 觸發執行並等結果） |
| 12 | drawing 綁變數與 SVG／DXF | 繪圖為自由編輯器，未綁計算變數 | 文字／尺寸標註可寫 `{{變數}}`，渲染時以計算值取代；`view_get` 回 `svg`；新增 `export_dxf`（mm） |
| 13 | markdown／報告內插與跨表引用 | markdown 表支援內插（`{{}}`）；跨表 `#2.R_paal` 只在計算表內 | 把 `bladVerwijzing` 的解析延伸到 markdown 與報告內文 |
| 14 | 可視化可交互計算書 | 輸入欄位與即時重算已具備（`InvoerPaneel`）；無 `modified`／`original` 追溯 | 在 store 記錄每張表的原始輸入快照；`sheet_get`／`sheet_evaluate` 回 `inputs[].modified`／`original`；新增 `sheet_reset_input`；互動 HTML 列選做 |
| 15 | 內建 AI 側邊欄 | 無 | 新增 Tauri 側邊欄面板 → in-process 呼叫同一 registry（`dispatcher.ts` 已可注入 ctx）→ 模型端點設定＋金鑰圈 → 步驟清單／變更預覽／undo 掛勾 → `--headless` 不載入 |
| 16 | 台灣計算書報告版面 | 已有 `opzetSoort: "tw"` 與繁中報告 | 封面、目錄、技師簽章欄、頁首頁尾、表號圖號；`report_set` 增對應欄位 |

## 4. 硬性約束的落實方式

- **相容性**：只新增欄位／工具；`app_info` 等既有欄位不動。每個版本跑 `check-alles`（現 106 支）確認無回歸。
- **MCP 與 REST 一致**：新工具一律同時宣告 `rest` 路由（既有 registry 機制自動兩邊都有），annotations 依讀寫性質給。
- **機密**：token 只在 `preferences.json`；health 端點刻意不含 token 與專案資料。
- **在地化**：新工具的說明文字用英文（與現有 49 工具一致），台灣規範版本與條號由 `module_schema` 回傳。
- **上游同步**：fork 專屬邏輯集中在 `cli.rs`、`health`、`edition` 三處，其餘盡量做成通用（可回饋上游）。

## 5. 交付節奏

| 版本 | 內容 | 驗收 |
|---|---|---|
| v0.1（P0） | #1～#5 | 本 repo `check-alles` 全綠 ＋ 新增 4 支 `check-ocss-*.mjs`；下游 `ocss_crosscheck.py probe`／`checks` 在無頭模式通過 |
| v0.2（P1） | #6～#10 | 同上 ＋ 下游讀 `warnings[]`／結構化結果的檢查 |
| v0.3（P2） | #11～#16 | 逐項各自的整合測試 |

## 6. 風險清單

1. 隱藏視窗在無圖形環境（純 CLI 伺服器）起不來 → 文件明講；後續評估 `xvfb`／未來的 Node 服務。
2. 啟用 `rapportengine` 會讓 CI 依賴 `openaec-core` 這個 git repo（可用性、建置時間 +）。
3. 版本字串改為 `-tw.N` 會影響更新比對（`versie.mjs`）與 app 內「關於」→ 需同步檢查腳本。
4. 單位警告若誤報太多會淹沒真正問題 → 先只報「非整數量綱」與「同式量綱不一致」兩類。
5. 側邊欄（P2-15）是最大單項，涉及金鑰圈、undo 掛勾、串流與變更預覽；先做唯讀工具，再開放寫入。

## 7. 進度

| 日期 | 項目 | 狀態 | 說明 |
|---|---|---|---|
| 2026-11-14 | P0-1 無頭模式與 CLI | 完成 | `src-tauri/src/cli.rs`（參數解析、`--version`／`--help` 直接結束、`eval`／`render`）、`src/mcp/cli.ts`（呼叫同一 registry，輸出附 `build`）；驗證指令碼 `scripts/check-ocss-headless.mjs` |
| 2026-11-14 | P0-2 API 產 PDF | 完成 | `release-tw.yml` 建置加 `--features rapportengine`；`render --pdf` 走 `export_pdf`。無報表引擎的建置仍回 `NOT_AVAILABLE`，不假裝成功 |
| 2026-11-14 | P0-3 版本可辨識 | 完成 | `src-tauri/build.rs` 寫入 `OCSS_EDITION`／`OCSS_BUILD_TAG`／`OCSS_GIT_COMMIT`／`OCSS_BUILD_DATE`，`src/kenmerken.rs` 對外提供；`app_info` 增 `edition`／`tag`／`commit`／`buildDate`（既有 `version` 不動）；`release-tw.yml` 打包前把 `tauri.conf.json` 版本改為 `X.Y.Z-tw.N` |
| 2026-11-14 | P0-4 免 token 的 health | 完成 | `GET /api/v1/health` 由 Rust 於 token 檢查前回應，內容不含專案資料；`openapi.ts`、`docs/api.md` 已文件化 |
| beda0b6 之後 | P0-5 拋棄式工作階段 | 完成 | `McpOmgeving.bestanden` 新增 `beginSessie`／`eindigSessie`／`sessieActief`，快照放 `mcp/omgeving.ts`（不動 store，縮小上游衝突面）；工具 `session_new`／`session_close`（`POST /session/new`、`POST /session/close`），`project_new` 另接受 `scratch: true`；`scripts/lib/mcpproef.mjs` 同步，`check-mcp.mjs` 第 4c 節 15 項 |
| beda0b6 之後 | P1-6 單位安全 | 完成 | `rekenen.ts` 的 `eenheidWaarschuwingen`：量綱為非整數次方（`R^(2/3)`）回 `UNIT_FRACTIONAL_EXPONENT`（含行號與名稱）；`calc_evaluate`／`sheet_evaluate` 回 `warnings[]`，`strict: true` 改回 `UNIT_WARNING`（REST 422）；`conventionalUnits: true` 另給慣用單位（`kN/mm^2 → MPa`）。「同式加減不同量綱」mathjs 本身即報錯，走既有 `CALC_ERROR` |
| beda0b6 之後 | P1-7 結構化結果 | 完成 | 每行加 `expr`、`si_value`／`si_unit`、`line`、`clause`（由該行文字辨識 `rc112 22.2` 類條號）、`check`（`pass`／`fail`／`unchecked`）、`uc`；`@toets`／`@fem`／`@kern` 無答案一律 `unchecked`；摘要另有 `check` |
| beda0b6 之後 | P1-8 `module_schema` | 完成 | `GET /modules/{templateId}/schema`：輸入欄位直接重用 `velden.ts`，加上規範、條號與每個欄位的比較行（`guards`）。計算語言沒有宣告式上下限，工具不自行編造範圍 |
| beda0b6 之後 | P1-9 收斂迭代 | 完成 | core `parser.ts`／`evaluator.ts`：`#while cond max=N`、`#iterate x tol=… max=…`（預設 1e-9、100，殘差以 SI 計）；未收斂產生帶 `iteratie` 的錯誤文字行，MCP 回 `code: NOT_CONVERGED`（`iterations`、`max`、`condition` 或 `name`／`tol`／`residual`）與 `notConverged[]`，並把摘要 `check` 降為 `unchecked`。無 `max=` 的 `#while` 行為不變 |
| beda0b6 之後 | P1-10 長工作 | 完成 | 新檔 `tools/taken.ts`：`calc_evaluate_batch`（`POST /evaluate/batch`，每項等同 `calc_evaluate`，錯誤逐項回報，上限 200）；`job_start`／`job_status`／`job_cancel`（`POST /jobs`、`GET`／`DELETE /jobs/{jobId}`），每項之間 `setTimeout` 讓出事件迴圈，狀態只存記憶體、保留最近 20 個已結束的 job。工具總數 49 → 56 |
| 094bc1e 之後 | P2-11 各表單讀取與觸發 | 完成 | 新檔 `src/mcp/bladInhoud.ts`（試算表格值＋公式結果、圖表節點輸出、Jupyter 每格輸出與 `executionCount`、Marimo 純文字輸出）與 `tools/inhoud.ts`：`sheet_read`（`GET /sheets/{id}/content`）、`sheet_run`（`POST /sheets/{id}/run`）。notebook 只能在 App 的 iframe 執行：`src/mcp/notebookUitvoer.ts` 讓 `JupyterVenster`／`MarimoVenster` 登記執行器，Jupyter 橋接新增 `voerUit` 訊息（全部重跑後回 `stand`），Marimo 重新載入後輪詢到輸出連續兩次相同；逾時回 `completed: false`，不當成結果。工具總數 56 → 58。**驗證範圍**：讀取部分以真實試算表核心、圖表求解器與 nbformat 資料在 `check-mcp.mjs` 第 5f 節驗證（19 項）；`sheet_run` 的 notebook 路徑只在假環境驗證了工具層（逾時、`completed`、重讀專案），App 內 iframe 實際重跑（JupyterLite／Marimo）尚未實機驗證，需在桌面版建置後手動測一次 |
| 0a5ae40 之後 | P2-14 互動式計算書（輸入追溯） | 完成（可離線 HTML 未做） | 每張表新增 `ontwerpWaarden`（交付時的輸入值；`store/ontwerpInvoer.ts` 定義「已追蹤／原值／是否修改」，`5` 與 `5.0` 視為相同）。API 寫入（`sheet_add`、`sheet_set_input`）預設更新交付值，GUI 改值不動交付值，差異即 `modified`；`sheet_set_input` 加 `design: false`、新工具 `sheet_reset_input`（`POST /sheets/{id}/inputs/reset`）。`sheet_get` 每欄帶 `modified`／`original`，`sheet_get`／`sheet_evaluate` 回 `modifiedInputs`。專案檔新增 IFCX 屬性 `ocss::blad::ontwerp`（core `ifcx/namespace.ts`、`document.ts`）。輸入畫面（`InvoerPaneel.tsx`）標示被改欄位、逐欄／全部還原、「設為交付值」，並以 `rekenEenmalig` 算出交付值的判定，合格→不合格時在表單上方提示。工具總數 58 → 59。**驗證範圍**：`check-mcp.mjs` 第 5g 節 32 項（規則、API 與 GUI 寫入一致、還原、復原、未追蹤的表、專案檔來回）；輸入畫面的標示與提示只通過型別檢查與三語鍵值檢查，未在實機畫面上目視驗證。規格 14 的「可離線 HTML（標示試算）」為選配，未實作 |
| 6f3b833 之後 | P2-13 文字內插與跨表參照 | 完成 | 新檔 `src/rekenen/tekstInvulling.ts`（`{#2.R_paal}`、`{#2.M:1}`，用 `verwijzingen.ts` 的同一套跨表計算，值以該表顯示的單位呈現）與 `src/components/calc/useTekstInvulling.ts`（React 版，快取鍵含被引用表與 `@toets` 版本）。Markdown 表在螢幕與列印都先內插（`vulMarkdownIn` 跳過程式碼區塊），報告文字在 `rapport/invullen.ts` 的 `vulIn` 內插，與 `{專案變數}` 並用；Markdown 表在報告目錄中的標題也內插（`bladVoorOpzet(ex, tekst)`）。`sheet_read` 對 Markdown 表多回 `markdown.filled` 與 `markdown.references`（值、單位、錯誤）。工具數不變（59）。**驗證範圍**：`check-mcp.mjs` 第 5h 節 18 項（純函式、Markdown 程式碼不動、跳脫、報告 `vulIn`、工具層）；畫面與紙上的內插只通過型別檢查，未實機目視 |
| 468ba7e 之後 | P2-12 繪圖綁定計算變數與 SVG／DXF 匯出 | 完成 | 新檔 `src/mcp/tekenInhoud.ts`：把繪圖元素的 `p.*.e`（如 `L/2`）與文字中的 `{{R_paal}}` 收集起來，與該表自己的計算文字合成一次計算（`__bind_i = …`），再以 `beeldVan`／`waardeVan`（繪圖編輯器同一套）產生圖形。`sheet_read` 對繪圖表回 `views`（元素種類、mm 界範圍）、`bindings`（運算式、值、單位、錯誤）與 `unbound`。新工具 `sheet_drawing`（`GET /api/v1/sheets/{id}/drawing`）匯出 SVG（`data-eenheid="mm"`、寬高以 mm）或 DXF R12（`$INSUNITS` 4／6，y 軸向上，`unit` 選 mm 或 m）；符號與弧線無法化為正確實體，計入 `skipped` 並在工具說明寫明。工具總數 59 → 60。**驗證範圍**：`check-mcp.mjs` 第 5i 節 15 項（值來自計算文字、SVG 單位標記、DXF 兩種單位與同一幾何、未知名稱入 `unbound`、未知視圖與非繪圖表回 `VALIDATION`）；SVG／DXF 未在 CAD 或瀏覽器實際開啟檢視。注意：繪圖表的計算文字沿用編輯器的作法，名稱若同時是單位（如 `b`＝barn）會被當成單位，測試中已避開。

## 8. 上游可合併性

這一輪改到的上游檔案，都是「新增程式碼、少改既有行」的方式，合併 `upstream/main` 時的衝突面如下：

| 檔案 | 改動性質 | 合併時怎麼處理 |
|---|---|---|
| `src-tauri/src/cli.rs`、`src/kenmerken.rs`、`src/mcp/cli.ts`、`src/mcp/kenmerken.ts` | 全新檔案 | 上游不會有同名檔案，通常不衝突；若上游日後也做 CLI，以本 fork 為準並把上游的新功能接進 `cli.rs` 的 `parse()` |
| `src-tauri/src/lib.rs` | 只新增 `mod cli;`、3 個 command、`run()` 開頭幾行與 `.manage(CliState(..))` | 上游改 `run()` 或 handler 清單時衝突在同幾行，保留兩邊（本 fork 的 command 一律保留） |
| `src-tauri/src/mcp_bridge.rs` | `is_public` 多一個 `\|\|`、`health_body` 新函式、`handle_request` 多一個 `port` 參數 | 上游若改簽章，把 `port` 一併帶進新的簽章即可 |
| `src-tauri/build.rs` | 原本幾乎為空，新增寫入 4 個環境變數 | 上游若加自己的 `cargo:rustc-env`，兩段並存 |
| `src/App.tsx` | 開頭插一段 `startCli()` 判斷 | 上游若改動最外層元件，先保留上游寫法，再把 `startCli()` 放回最前面 |
| `src/mcp/openapi.ts`、`tools/project.ts` | 只新增路徑與欄位 | 純新增，衝突少；`app_info` 若上游改結構，把 4 個新欄位補回 |
| `src/mcp/contracts.ts`、`src/mcp/omgeving.ts` | `bestanden` 介面多 3 個方法與其實作（快照放 `omgeving.ts`，不動 store） | 上游若改 `McpOmgeving`，把 3 個方法補進新的介面與實作即可；store 本體未改，衝突面最小 |
| `packages/core/src/parser.ts`、`evaluator.ts`、`types.ts` | `#iterate` 與 `max=`／`tol=` 為新增分支；`RepeatNode`、`EvaluatedText` 只加選用欄位 | 上游改 `repeat` 求值時衝突在同一個 `case`，保留上游邏輯後把 `grens`／`evalueerIteratie` 接回 |
| `src/mcp/tools/taken.ts` | 全新檔案；`tools.ts` 多一行登記 | 不衝突 |
| `src/mcp/bladInhoud.ts`、`notebookUitvoer.ts`、`tekenInhoud.ts`、`tools/inhoud.ts` | 全新檔案 | 不衝突 |
| `src/store/ontwerpInvoer.ts` | 全新檔案 | 不衝突 |
| `src/rekenen/tekstInvulling.ts`、`src/components/calc/useTekstInvulling.ts` | 全新檔案 | 不衝突 |
| `src/rapport/invullen.ts`、`src/components/calc/bladSoorten.tsx`、`src/components/rapport/afdruk/useRapportWeergave.ts`、`MarkdownBladWeergave.tsx` | `Invulwaarden.verwijzingen?`、`bladVoorOpzet` 多一個選用參數、Markdown 先內插再排版 | 皆為選用參數，未用時行為不變；衝突時保留上游邏輯再補這幾處 |
| `packages/core/src/ifcx/namespace.ts`、`ifcx/document.ts`、`ifc-generator.ts` | 各加一個選用屬性 `ocss::blad::ontwerp`／`ontwerpWaarden`（仿 `varianten` 的寫法，緊接其後） | 上游若在同處加新屬性會有相鄰行衝突，兩邊都留 |
| `src/store/projectStore.ts`、`projectBestand.ts`、`projectIfcx.ts` | `Exemplaar.ontwerpWaarden?`、`zetWaarde` 多一個選用參數、新增 `zetOntwerp`／`herstelInvoer` | 既有呼叫端不需改；衝突時保留上游邏輯再補回這三處 |
| `src/components/calc/invoer/InvoerPaneel.tsx`、`InvoerPaneel.css`、三語 `beelden.json` 的 `invoer.*` | 只在表有交付值時多出標示與一列提示；未追蹤的表畫面不變 | 上游改動輸入畫面時逐段合併，`ip-volgt`／`ip-gewijzigd`／`ip-melding` 為本 fork 專用 class |
| `src/components/calc/JupyterVenster.tsx`、`MarimoVenster.tsx`、`jupyter-omgeving/ocss-brug.js` | 各多一個 `useEffect`／訊息分支（`voerUit`），既有流程不動 | 上游改視窗訊息處理時，把 `rondes`／`peilingen` 分支補回 `stand`／`fout` 兩個 case |
| `src/mcp/tools/bladen.ts`、`rekenen.ts`、`hulp.ts`、`rest.ts` | `calc_evaluate` 本體搬成 `rekenTekstUit`；回傳只加欄位 | 上游改 `calc_evaluate` 時，把改動套進 `rekenTekstUit` |
| `release-tw.yml` | 台灣版專屬，上游沒有 | 不合併上游 |
| `docs/api.md`、README 三份 | 新增段落與腳本計數 | 計數以 `node scripts/check-readme.mjs` 為準重算 |

合併後固定要跑：`npm run check`、`valideer-tw-basis.mjs`、`valideer-tw-i18n-keys.mjs`、`cargo test --lib`、
`node scripts/check-ocss-headless.mjs`、`node scripts/check-mcp.mjs`（拋棄式工作階段在假環境也要同步）。新增的上游命令若也要在無頭模式可用，記得在 `cli.rs` 補一個
`Opdracht` 變體，而不是在 Rust 端另外實作。
