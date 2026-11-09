# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 這個 repo 是什麼

這是 OpenAEC Open CalcSheet Studio 的**台灣版 fork**：一套結構計算書桌面 App
（以文字撰寫計算表、帶單位計算、彙整成報告），目標是繁體中文介面＋依台灣規範的計算模組。
上游原本的模組依歐洲規範（Eurocode＋荷蘭國家附錄）撰寫。

- **規則以 `AGENTS.md` 為準**，包括：可合併上游、語言、台灣規範與已驗證庫、單位、計算安全、
  資料與名稱、提交前檢查。本檔只補充指令、架構與台灣化的實作細節。
- 上游的權威說明在 `docs/overdracht.md`（荷蘭文），其餘在 `docs/`：
  `rekentaal.md` 計算語言、`projectmodel.md` 專案模型、`mcp.md`／`api.md`、`bladsoorten.md`、
  `jupyter-blad.md`；設計與計畫在 `docs/superpowers/`。台灣版文件放 `docs/tw/`。

## 常用指令

```bash
npm ci                                                  # 安裝（npm workspaces：packages/core、packages/desktop）
npm run dev                                             # 建置 core 後開瀏覽器預覽（Vite，埠 3021，不需 Rust）
npm run build                                           # core＋前端建置（含 tsc）
npm run build:debug                                     # 原生 debug 建置，不打包
npm run tauri:dev --workspace=@openaec/calcsheet-studio # 桌面版（Tauri 2）
npm run dev --workspace=@ifc-calc/core                  # core 監看模式重建

npm run check                                           # 建置 core，再跑所有檢查
node scripts/check-alles.mjs                            # 跑所有 scripts/check-*.mjs（需已建置 core）
node scripts/check-ligger.mjs                           # 跑單一檢查（任一 check-<名稱>.mjs）
cd packages/desktop && npx tsc --noEmit -p .            # desktop 型別檢查
```

- **需要 Node 24**：檢查腳本會直接 import `.ts` 檔，依賴 Node 24 內建的 type stripping（CI 也用 24）。
- 檢查腳本使用 `packages/core/dist`；改了 core 之後先跑 `npm --prefix packages/core run build`。
- 沒有測試框架，「測試」就是 `scripts/check-*.mjs`。`check-alles.mjs` 會自動收進所有 `check-*.mjs`，
  新增的 `check-tw-*.mjs` 不必另外註冊。
- 修改 core 時的回歸防護網：
  `node scripts/snapshot-templates.mjs voor.json` → 修改並重建 →
  `… na.json` → `… --compare voor.json na.json`。
  `values` 有變化幾乎都是回歸；`text` 有變化則可能是刻意的。
- 報告的黃金檔：`check-rapport-talen.mjs --bewaar` 會重新產生 `scripts/fixtures/rapport-oud-*.html`，
  只在刻意修改版面時使用。
- Rust：
  - `cargo test --manifest-path packages/desktop/src-tauri/fem-brug/Cargo.toml`（加 `-- --ignored` 會使用真實的 FEM Studio）
  - `cargo test --manifest-path packages/desktop/src-tauri/Cargo.toml --lib erpnext`
- 已建置的 App 仍在執行時，會鎖住 `target/release/WebView2Loader.dll`，
  這時改用另一個 `CARGO_TARGET_DIR`（例如 `src-tauri/target-installer`）建置。
- 合併上游：
  ```bash
  git remote add upstream https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio.git   # 只需一次
  git fetch upstream && git merge upstream/main
  ```
  `AGENTS.md`、`CLAUDE.md` 衝突時以本 fork 為準。

## 架構概觀

### 兩個套件

- **`packages/core`（`@ifc-calc/core`）**：建立在 mathjs 上的計算核心，純 TypeScript，沒有 UI。
  - `parser.ts`：計算語言；`evaluator.ts`：以 mathjs 計算並註冊自訂函式；`renderer.ts`：HTML（KaTeX、SVG）。
  - 自有求解器：`ligger.ts`（1–4 支點梁）、`raamwerk.ts`（平面構架、α_cr）、
    `doorsnede.ts`（組合斷面）、`matrixrekening.ts`。
  - 區塊：`toetsBlok.ts`（`@toets`）、`jsBlok.ts`、`iframeBlok.ts`、`ifcxBlok.ts`、`rekenblok.ts`。
  - `eenheden.ts`／`eenheidstelsel.ts`：單位與單位制；`ifc-generator.ts`：IFCX、IFC4x3。
- **`packages/desktop`（`@openaec/calcsheet-studio`）**：React 19＋Zustand＋Vite，外殼是 Tauri 2（`src-tauri/`，Rust）。

### 計算表（模組）怎麼組成

一張計算表就是**放在 TypeScript 字串裡的計算語言文字**（`src/templates/<模組>.ts`，
在 `templates/index.ts` 註冊）。新增模組需要：

1. 計算表本身，並在 `index.ts` 註冊；
2. 目錄清單的一行（`components/calc/projectTree.ts`，狀態有 gereed／controleren／hoeveelhedenraming）；
3. 視需要加參數化圖 `*Designer.tsx`，在 `components/calc/designerKeuze.tsx` 中透過標題的識別文字連結；
4. 目錄縮圖，以及該模組的檢查腳本。

計算語言重點（詳見 `docs/rekentaal.md` 與 overdracht §2）：

- 以 `'` 開頭的行是文字／HTML。另有 `#if/#else if/#else/#end if`、`#hide/#show`、`@select`；
  `x = ?` 表示輸入。mathjs 不能用 `+` 串接字串。
- 結尾行 `Maatgevende UC = … → … voldoet / voldoet niet`，或 `Eindoordeel: niet getoetst`，
  英文版為 `Governing UC` 與 `Overall result: not verified`，供報告標頭讀取。
- 列印版保持精簡：整行斜體的散文是說明文字（`calc-uitleg`），不會印出；
  `ook-afdruk`、`alleen-scherm`、`alleen-afdruk` 等 class 可控制顯示。
- 輸入名稱不可與專案變數衝突（`check-projectvariabelen.mjs`）。
- 型鋼斷面的來源是 `components/calc/profielen.ts`，表中貼上的矩陣由 `check-profielen.mjs --matrix` 保持同步。
- 每個表單實例都保存**自己的一份**計算表文字；「Bladen bijwerken」（`bladVersie.ts`）會更新文字並保留輸入。

### 語言機制（上游）

- 計算表的原文是荷蘭文，版本、bijwerken、輸入鍵與 API 都以原文為準。
- 英文在顯示時才套上翻譯表：`templates/<模組>.en.ts`，在 `templates/vertalingen.ts` 註冊，
  機制在 `components/calc/uitvoerTaal.ts`。
- 介面文字放在 `src/i18n/locales/<語言>/`，語言清單在 `src/i18n/config.ts` 的 `LANGUAGES`。
- 報告語言依 `rapport.taal`，其餘依 App 語言。

### Desktop 其他部分（`packages/desktop/src`）

- `store/`：專案模型、專案檔、復原（undo）。
- `components/calc/`：表單顯示、列印（`PrintDocument.tsx`、`PrintBlad.tsx`、`paginering.ts`）、
  不做計算的表單種類（`bladSoorten.tsx`）、canvas 表單、試算表
  （`@betteroffice/xlsx*` **固定在 0.5.1**，因為用了 `legacySyncApi`）。
- `rapport/`、`components/rapport/`：結構報告。
- `graaf/`＋`components/graaf/`：節點圖表單；`components/tekenen/`：繪圖編輯器。
- `mcp/`：內建 MCP＋REST API（127.0.0.1:3879）。所有工具都來自同一個 registry（`mcp/tools.ts`）。
- `rekenen/`：計算 worker，以及 Open FEM Studio 的 `@toets` 檢核
  （`femStudio.ts`；Rust 端在 `src-tauri/fem-brug`、`src-tauri/src/fem_studio.rs`）。

## 台灣化的實作要點

### 加上 zh-TW 時會碰到的地方

- **介面**：新增 `src/i18n/locales/zh-TW/*.json`，並在 `config.ts` 的 import、`resources`
  與 `LANGUAGES` 加上 zh-TW。`check-schermtekst.mjs` 會自動讀取 locales 下的每個語言資料夾，
  要求所有語言的鍵相同，所以要一次補齊全部命名空間。
- **報告與語言判斷**：程式裡假設只有 nl／en 的地方散在約 20 個檔案
  （搜尋 `rapport.taal`、`startsWith("en")`、`Taal = "nl" | "en"`，例如 `store/projectStore.ts`、
  `rapport/opzet.ts`、`components/calc/afdrukTaal.tsx`、`components/rapport/paneel/*`）。
  報告要支援繁中，得把這些地方一起擴充，並補 `check-rapport-talen.mjs` 的對照。
- **結尾行**：`components/calc/bladLezen.ts` 的 `leesResultaat` 目前只認荷蘭文與英文的關鍵字
  （約第 80–96 行）。台灣表要用中文結尾行（例如 `控制 UC = … → 合格／不合格`、`總結：未檢核`）時，
  必須擴充這裡的正規式並加檢查，否則報告標頭會讀不到 UC。
  尤其要確認「不合格」不會被判成合格。
- **翻譯機制**：`vertalingen.ts` 的 `inNederlands` 與 `ENGELS` 預設原文是荷蘭文、只譯成英文。
  台灣模組的原文直接用繁中，不必經過翻譯表；`check-uitvoer-taal.mjs` 的模組清單是手列的，
  不會自動檢查新模組。
  如果要讓歐規模組在 zh-TW 介面下顯示中文，得另外擴充翻譯機制，而且仍須標示 Eurocode。
- **檢查覆蓋範圍**：`check-renders.mjs` 只掃 `templates/` 這一層的 `.ts`，
  所以台灣表一律放 `templates/tw-<模組>.ts`。
- **檢查腳本與 README 數量聯動**：`check-readme.mjs` 會統計 `scripts/` 下符合 `/^check-.*\.mjs$/` 的檔案總數，
  必須與 `README.md` 及 `README.nl.md` 的「N check scripts」一致。輔助性質或單獨執行的工具若不希望牽動此計數，
  應命名為其他前綴（例如 `valideer-*.mjs`）。
- **測試腳本按鈕文字匹配**：`scripts/rapport-pdf.mjs` 與 `scripts/proef-*.mjs` 透過 DOM 文字選取按鈕（`/^(Rapport|Report|報告)$/`），
  新增或修改功能區按鈕時需注意多語言相容。

### 單位

- 核心目前沒有 `kgf`、`tf`（`packages/core/src` 中搜得到的 `tf` 都是翼板厚度）。
  台灣 MKS 單位要加在 `eenheden.ts`，單位制加在 `eenheidstelsel.ts` 的 `STELSELS`（現有 SI 與 `us`），並補檢查
  （參考 `check-eenheden.mjs`、`check-eenheidstelsel.mjs`）。
- 計算表內部用 SI；kgf/cm² 形式的經驗式必須改用規範列出的 SI 係數（例如 Vc 的 0.53√fc′ 改用 0.17√fc′）。

### 設計規範來源：`D:\Civil_Design_WorkBench`（唯讀）

- 規範總目錄（版次、現行或已被取代）在 `docs/法規庫總目錄.md`。
  全文在 `data/法規/*_全文_NFKC.txt`，只供閱讀，不得取數。
  索引在 `data/法規/_regs_index.sqlite`，清單在 `data/法規/_regs_manifest.json`。
- 主要規範 ID：
  - `rc112`：混凝土 112.08.10（`混凝土結構設計規範_1000609` 僅供對照）
  - `steel99`：鋼構 ASD／LRFD
  - `seis113`：耐震 113.03.01（`seis111` 僅供對照）
  - `wind103`／`wind103full`：耐風
  - `found112`：基礎
  - `btr_struct`：建築技術規則構造編
  - `swc_tech`：水土保持技術規範

  木構造規範尚未收錄。
- WorkBench 只收錄 34 部規範，**不一定涵蓋本專案所需**。來源分級（A 已驗證庫／B 官方線上來源／C 不得取數）
  定在 AGENTS.md §3；各規範的現行版次、主管機關、母規範（ACI、AISC、AASHTO 等）對應、
  缺口清單與 B 級數值紀錄集中在 `docs/tw/規範來源.md`。
- B 級（上網補齊）的做法：
  1. 只用官方網站（全國法規資料庫 law.moj.gov.tw、國土管理署、交通部、水利署、農村發展及水土保持署、
     工程會、標準檢驗局）；先確認是否有比 WorkBench 更新的版次。
  2. 數值逐列記進 `docs/tw/規範來源.md`（條號／表號、修正日期、網址、擷取日期），不抄條文。
  3. 寫進程式時在 `bron` 欄位註明「B 級：〈規範〉〈條號〉（〈修正日期〉）」，
     並在對應的 `check-tw-*.mjs` 以 repo 內的資料核對。
  4. 若 WorkBench 之後補上同一條的已驗證資料，改用 A 級，並核對兩者一致。
- **A 級取數**用已驗證庫 `tools/regs/verified/*.json`，入庫規則見 `docs/規範公式圖表入庫SOP.md`。
  - MCP `regs` 伺服器提供 `regs_ask`、`regs_search`、`regs_clause`、`regs_formula`、`regs_table`、`regs_list`。
    `regs_clause` 開頭標「【可信度：低】」的內容不得取數；回報時附上來源（條文＋頁碼）與 warnings。
  - 也可在 WorkBench 目錄執行 CLI：
    `C:\Python312\python.exe -E -P -X utf8 tools\regs\regq.py <主題>`、
    `… regq.py --clause <ID> <條號>`、`… regq.py <關鍵字> --search`、`… regq.py --topics`。
- **獨立對照計算**：WorkBench 的 `tools/design/*.py` 計算引擎，例如：
  - `rc_design.py`
  - `steel_column.py`（steel99）
  - `foundation_design.py`（found112）
  - `load_combinations.py`
  - `frame_analysis.py`
  - `building_frame.py`
  - `earth_pressure.py`
  - `retaining_wall.py`

  這些可作為檢查腳本中「第二套獨立計算」的參考，但 CalcSheet 執行時與 CI 都**不得依賴** WorkBench；
  對照結果要連同推導以註解寫進 `check-tw-*.mjs`。
  注意：`rc_design.py` 的條號仍以 100 年版對帳，台灣模組要引用 112 年版的條號。
- WorkBench 的 `docs/設計計算器上架SOP.md` §2（不確定就先問的決策邊界、必問清單）與 §3.2（計算紀律：
  每列檢核要有值／限值／單位／合格與否、超出範圍就拒算）同樣適用於台灣模組。

## CI 與發佈

- `ci.yml`：每個 PR 與 push 到 `main` 時跑 `npm run check`，Linux 與 **Windows（CRLF 工作副本）**都跑，
  所以程式要能處理 CRLF。另外會在三個平台建置 Tauri，並跑 Rust 測試。
- 發佈：手動觸發 `release.yml`；見 `docs/ondertekening.md`。
- 無法自動化的手動驗證（列印路徑、WebView2／Tauri 升級後）：`scripts/proef-rapport-app.mjs`、
  `check-rapport-pdf.mjs --app-pdf`、`scripts/proef-js-webrtc.mjs`；見 overdracht §4。
