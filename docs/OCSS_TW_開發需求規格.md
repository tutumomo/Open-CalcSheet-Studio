# OCSS TW 開發需求規格（Open CalcSheet Studio TW × Civil_Design_WorkBench）

> 用途：交給在 `tutumomo/Open-CalcSheet-Studio` repo 工作的智能體，作為 OCSS 台灣版要補的功能清單。
> 本檔同時為兩個 repo 的需求依據：OCSS 端以本檔為準實作；本專案端（`tools/crosscheck/`）以本檔為準調整接線。
> 下游現況與已知限制見 [`OpenCalcSheetStudio_整合與開放計算環境.md`](OpenCalcSheetStudio_整合與開放計算環境.md) §4、§5、§7、§8；49 個工具清單見 [`OpenCalcSheetStudio_工具清單.md`](OpenCalcSheetStudio_工具清單.md)。

## 使用方式

- 讓 OCSS 那邊的智能體同時能讀到本專案（clone 或給路徑），它才看得到 `tools/crosscheck/` 實際怎麼呼叫 OCSS。
- 先要它交計畫再動手，並且分版本發布（P0 → P1 → P2）。

---

# 任務：讓 Open CalcSheet Studio TW 能被 Civil_Design_WorkBench 完整接入

## 背景

你在 `tutumomo/Open-CalcSheet-Studio`（上游 OpenAEC Open CalcSheet Studio 的台灣在地化 fork）工作。
它的下游使用者是 `tutumomo/Civil_Design_WorkBench`：一個以 AI 智能體做土木設計（擋土牆、排水溝、箱涵、滯洪池、
沉砂池、RC／鋼構件、基礎、載重）的 repo。它把 OCSS 當成「第二套獨立算法」與「逐式可稽核計算書」來用，
透過 MCP（`http://127.0.0.1:3879/mcp`）與 REST（`POST /api/v1/tools/<name>`），目前一共 49 個工具。

動手之前，先讀下游的這幾個地方，搞清楚它現在怎麼用你：
- `docs/OpenCalcSheetStudio_整合與開放計算環境.md`（特別是 §4 能力邊界、§5 單位陷阱、§7 已知限制、§8 後續）
- `docs/OpenCalcSheetStudio_工具清單.md`（49 個工具的參數與路由）
- `tools/crosscheck/ocss_client.py`、`ocss_crosscheck.py`、`ocss_calcbook.py`、`ocss_load_suggest.py`、`ocss_map_gen.py`、`checks/`、`maps/`

## 目標

讓智能體不需要人在場，就能用 OCSS 的開放計算語言和多種工作表格式（calculation／markdown／graph／drawing／
spreadsheet／jupyter／marimo／pdf）產出**可重算、可機讀、可稽核、可直接交付**的土木計算書。

## 需求（依優先序；每項都要有驗收方式）

### P0：沒有這些就無法自動化

1. **無頭模式**：提供 `--headless`（或 `serve`）啟動 API／MCP，不開視窗；再提供一次性的 CLI，例如
   `open-calcsheet-studio eval <file.ifccalculation|-> --json`、`render <file> --pdf <out>`。
   `--version`／`--help` 必須立即印出並退出，不能啟動 GUI（現在會卡住）。
2. **API 產 PDF**：`export_pdf` 在一般安裝版回 501。要把 report engine 打包進來，讓 API 與 CLI 能輸出含圖的完整計算書 PDF，
   內容與 App 內按「Rapport」相同。
3. **版本可辨識**：`app_info` 要回傳完整 tag（例如 `2026.46.1-tw.1`）、commit、建置日期、edition（`tw`／`upstream`）。
   `.deb`／`.msi`／`.dmg` 的版本欄要帶 `-tw.N`（現在 deb Version 只有 `2026.46.1`，分不出 tw.4 與 tw.5）。
4. **與上游並存**：TW 版與上游版預設都用 3879 埠，同時開時會連錯版本，只看到 401。
   要嘛換預設埠，要嘛讓未認證的 `GET /api/v1/health` 回 edition，讓客戶端判斷連到的是哪一版。
5. **不弄髒使用者專案**：提供拋棄式工作階段（例如 `session_new`／`session_close`，或在 `project_new` 加 `scratch=true`），
   讓智能體在隔離專案裡批次做 `sheet_add`／`evaluate`／`export`，不影響使用者開著的專案，也不留下「未儲存」旗標。

### P1：把計算結果變成可信的機讀資料

6. **單位安全**：
   - 分數次方的結果出現非整數量綱（`R^(2/3)` → `m^0.667`）時，要給警告；並提供 strict 模式，直接當錯誤處理。
   - 提供「收斂到慣用單位」的選項（`kN/mm²` → `MPa`）。
   - 警告要放進 `calc_evaluate`／`sheet_evaluate` 回應的結構化欄位（例如 `warnings[]`，附行號與代碼），不能只出現在畫面上。
7. **結構化結果**：evaluate 的每一行回傳 `name`、`expr`、`value`、`unit`、`si_value`、`clause`（規範條號）、
   `check: pass|fail|unchecked`、`uc`。`@toets` 沒有回應的一律是 `unchecked`，絕不能當成 pass。
8. **模組輸入 schema**：新增 `module_schema(templateId)`，回傳每個 tw-* 模組的輸入欄位、單位、範圍、預設值、選單選項，
   以及採用的規範版本與條號。下游會用它自動產生 `case.json` → 模板的對照表，取代目前要人工核對的 `maps/*.json`。
9. **收斂迭代語法**：除了固定次數的 `#repeat`，再加有容差與上限的 `#while`（或 `#iterate tol=… max=…`），
   未收斂時要回結構化錯誤。
10. **長工作與循序**：橋接器一次只處理一個請求，逾時 120 秒。要提供批次端點（一次送多段 source，回多份結果），
    或非同步 job（`job_start`／`job_status`）。

### P2：充分利用豐富格式

11. 每一種工作表都要有對應的讀取工具，而且能讀到輸出：spreadsheet 的格值與公式結果、jupyter／marimo 執行後的輸出，
    以及 graph 的節點值。jupyter／marimo 要能經 API 觸發執行（現在要使用者在 App 內按執行）。
12. drawing 工作表要能綁計算變數（尺寸隨計算結果改變），並能匯出 SVG／DXF（座標單位 mm 或 m，要寫清楚）。
13. markdown 與報告要能內插計算變數，也要能引用其他工作表的值（`#2.R_paal` 這種語法延伸到 markdown）。
14. **可視化、可交互的計算書**：智能體產出的計算表要讓使用者能自行開啟、調整設計變數並立即看到結果。
    - 設計變數一律宣告為輸入欄位（數值框／滑桿／選單，帶單位與合理範圍），不得寫死在算式裡。
      智能體用 `sheet_set_input` 設值，使用者在 App 內改的是同一個欄位，兩邊共用同一份資料。
    - 改值後即時重算；相關圖表（`$Plot`）、繪圖工作表（見第 12 項）、檢核 UC 與 pass／fail 要一起更新。
      檢核由 pass 變成 fail 時要醒目提示。
    - 使用者改過的值要可追溯：標出與原設計值不同的欄位，可一鍵回復；
      `sheet_get`／`sheet_evaluate` 回應要帶 `modified` 與 `original`，讓下游知道交付值被動過。
    - （選做）匯出可離線開啟的互動 HTML，讓沒裝 App 的人也能試算；匯出檔要標明「試算，非正式計算書」。
    - 驗收：同一個 `.ifccalculation`，經 API 改輸入與在 GUI 改輸入的結果一致；
      改值後 `sheet_evaluate` 的回應反映新值與 `modified` 標記。
15. **內建 AI 智能體側邊欄**：讓使用者不必切到別的視窗，就在 App 內叫智能體做設計工作。
    - 側邊欄是可開關的 Tauri 面板（與主編輯區分欄），關閉時不佔版面；`--headless` 模式下不載入。
    - 智能體直接操作 App 自己的工具：**同一個 registry、不走 HTTP**（in-process 呼叫 49 個工具），
      行為與 MCP／REST 完全一致；另可設定為外部 MCP 客戶端（stdio／http），
      接上 `regs`（規範查詢）、設計引擎與 OpenCADStudio，讓側邊欄一路做到出圖。
    - 模型來源可設定：Anthropic／OpenAI／Gemini 相容端點，或指向本機 **magpie**（`http://127.0.0.1:3425`），
      由 magpie 轉發到各供應商與免費模型外掛；金鑰存作業系統金鑰圈，不寫進 `preferences.json`、不進日誌。
    - 上下文自動帶入：目前專案、作用中的工作表（source＋inputs）、最近的 evaluate 結果與 `warnings[]`；
      使用者可用 `@工作表名` 指定範圍。
    - **可稽核**：每一次工具呼叫顯示在側邊欄的步驟清單（工具名、參數摘要、結果成敗），可展開看完整參數；
      每一個改動專案的操作各自成為一步 undo，使用者按 Ctrl+Z 可逐步撤回智能體的動作。
    - **不覆寫使用者**：`sheet_remove`、`project_save`、覆蓋既有工作表內容等破壞性操作需要明確確認（可設「本次允許」）；
      智能體要改既有內容時，先顯示變更預覽（哪些列、舊值→新值），使用者按下套用才寫入。
    - 串流輸出與中止：支援逐字串流、停止鈕、逾時；長工作顯示進度，不鎖住主編輯區。
    - 驗收：在側邊欄下一句「把這張表的牆厚改成 40 cm 並重算，UC 超過 1 就告訴我」，
      能完成讀表→改輸入→重算→回報 UC，且每一步都可 undo、變更預覽可查；同一請求改由 MCP 客戶端發出，結果一致。
16. 報告要支援台灣計算書版面：封面、目錄、技師簽章欄、頁首頁尾、表號圖號，並可用 `report_set` 機讀設定。

### P3：之後再做（先開 issue 評估，不要硬做）

17. 連續梁／平面剛架求解器，或讓 `@toets` 的 Open FEM Studio 結果可以經 API 取回。

## 硬性約束

- **相容性**：現有 49 個工具的名稱、參數、回應欄位都不得做破壞性修改，只能新增；必要的改名要保留舊名作 alias 至少一個版本。
- **MCP 與 REST 一致**：新工具兩邊都要有；annotations（readOnly／destructive／idempotent／openWorld）要正確，因為下游用它們產文件。
- **機密**：token 只能放在 `preferences.json`，不得印進日誌或回應。
- **在地化**：tw-* 模組依台灣規範（RC 112、鋼構 99、耐震 113、風 103、基礎 112、建技規則、水保技術規範），每個模組要寫出規範版本與條號。
  資料等級為 B 級（有官方來源但未驗證）的條文要在結果裡標出來。
- **上游同步**：fork 特有的改動要盡量集中，方便日後 merge 上游。能回饋上游的通用功能（headless、PDF、單位警告）另外整理成 PR 草稿。
- **發布**：每個里程碑發一個 release，附 `SHA256SUMS.txt`，release notes 列出新增的工具與行為變更。

## 工作方式

1. 先讀程式碼和下游整合文件，交一份計畫：每項需求的現況、做法、影響檔案、風險、驗收測試。等確認後再動手。
2. 每項需求先寫測試（TDD）。新增的 MCP 工具要有整合測試，真的啟動橋接器去呼叫。
3. 依 P0 → P1 → P2 分版本交付；每個版本結束時回報「做了什麼、怎麼驗證、哪些沒做」。
4. **下游驗收**：每個版本發布後，以下指令必須通過，最好在無頭模式下跑：
   ```bash
   python tools/crosscheck/ocss_crosscheck.py probe
   python tools/crosscheck/ocss_crosscheck.py checks
   python tools/crosscheck/ocss_tools_doc.py --check   # 新增工具後，下游要重生清單
   ```
   有任何下游行為改變，都要在 release notes 寫明白。

---

## 下游維護備註（本專案端）

- 每發一版 OCSS，本專案要更新 `tools/crosscheck/ocss_client.py` 與 `ocss_crosscheck.py` 以使用新功能（headless 啟動、讀 `warnings[]`、讀結構化結果），並重生 `OpenCalcSheetStudio_工具清單.md`。
- P1-8 `module_schema` 完成後，X0 對照表（`ocss_map_gen.py`）改為自動產生，取代人工核對。
- P0-1 無頭模式與 P0-2 API 產 PDF 是優先項：完成後 OCSS 才能進 `run_all.py`、CI 與三軸交付。
- P2-15 側邊欄完成後，本專案對 OCSS 的使用方式會從「外部 MCP 客戶端」變成「App 內建智能體」，
  `README.md`、`docs/環境需求與自動配置.md` 與 `tools/mcp/register_all.py` 的 OCSS 段落要一併改寫。
