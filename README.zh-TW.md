[English](README.md) · [Nederlands](README.nl.md) · **繁體中文**

<div align="center">

# Open CalcSheet Studio（台灣版）

**可回溯查驗的結構計算書：每項結果都顯示公式、數值與單位，所有計算表彙整成一份完整報告。**

[![Release](https://img.shields.io/github/v/release/tutumomo/Open-CalcSheet-Studio?include_prereleases&label=release&color=D97706)](https://github.com/tutumomo/Open-CalcSheet-Studio/releases)
[![CI](https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio/actions/workflows/ci.yml/badge.svg)](https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/license-LGPL--3.0-blue)](#授權條款)
[![語言](https://img.shields.io/badge/語言-繁體中文%20%C2%B7%20English%20%C2%B7%20Dutch-informational)](#畫面截圖)

### [下載應用程式](https://github.com/tutumomo/Open-CalcSheet-Studio/releases/latest)

![木托梁樓版：輸入畫面附圖面與連動檢核比，旁邊為展開的計算表，面板中顯示專案與材料庫](docs/images/readme/hero.png)

</div>

Open CalcSheet Studio 是一套專為結構與土木工程師打造的桌面應用程式。您可以用純文字逐行撰寫計算，軟體會自動帶入單位，展開成排版清晰、可供查驗的數學公式。除了一般的文字計算表外，單一專案還能納入試算表、公式畫布、節點圖、工程圖紙、Jupyter 筆記本、Markdown 以及 PDF 檔案，並統一彙編成一份完整的結構計算書報告。

本專案為 OpenAEC 基金會 Open CalcSheet Studio 的**台灣版 fork**，具備全面繁體中文介面、依台灣現行法規（RC 112、鋼構 99 LRFD、基礎 112、水保規範 114 等）建立的結構與土木大地計算模組、台灣專案參數（震區 $S_{DS}$ / $S_{D1}$、用途係數 $I$、基本設計風速 $V_{10}$）、CNS 560 鋼筋庫、CNS 1490 熱軋 H 型鋼規格表、MKS（tf、kgf）與 SI 單位切換支援，以及符合台灣工程慣例的七章計算書報告架構。

軟體支援 Windows、macOS 與 Linux。目前持續積極開發中，詳見[目前限制](#目前限制)。

## 立即試用

[下載應用程式](#下載)，開啟後點選**模組**，選擇**鋼筋混凝土矩形梁**或上游的 **Timber joist floor**。修改斷面尺寸或跨度，即可即時看到檢核比（UC）連動變化。接著開啟**列印預覽**，檢視計算書在紙張上的輸出效果。

## 下載

取得[最新發佈版本](https://github.com/tutumomo/Open-CalcSheet-Studio/releases/latest)（台灣版，預設繁體中文介面）。

| 作業系統 | 安裝檔案 |
|----------|----------|
| **Windows** | `*_x64-setup.exe` 安裝程式 (x64) |
| **macOS** | `*_aarch64.dmg`（僅 Apple Silicon，無 Intel 版） |
| **Linux x64** | `*_amd64.deb` |
| **Linux arm64** | `*_arm64.deb`（aarch64，如 Ubuntu 26.04 arm64）：`sudo apt install ./檔名.deb` |

應用程式無內建更新程式：直接安裝新版本覆蓋舊版本即可。專案為一般檔案，會完整保留於原本儲存位置。

台灣版安裝檔**未經數位簽章**（無 Windows Authenticode、無 Apple Developer ID 公證），作業系統可能顯示安全性提示。隨附的 `SHA256SUMS.txt` 僅用於核對下載檔案是否完整，不能證明檔案來源。

## 為什麼使用它？

- **自由且開源**：LGPL-3.0 授權。無授權費，免註冊帳號。
- **每一步驟皆可查驗**：結果明確顯示名稱、公式、代入數值與結果，並帶完整單位。
- **公制、台灣 MKS 與美制單位**：專案可選單位制：SI（mm）、SI（m）、台灣 MKS（tf、kgf、tf·m、kgf/cm²）、美制英制，或針對各物理量自訂單位。結果、輸入欄位、圖面與報告同步套用，且檢核邏輯一致。亦可自行定義單位（如 `.kipf = 1000 lbf`）。
- **單一專案，彙整成冊**：封面、目錄與頁碼自動跨所有種類的計算表連續編排，選配的工址定位頁可顯示 OpenStreetMap 工址地圖。側邊工作面板即時顯示專案架構與變數。
- **各取所需的計算表種類**：文字計算、公式畫布、試算表、節點圖、圖紙、筆記本、Markdown 與 PDF，於同一個專案中並存。
- **改動數值，檢核即時連動**：打字時即時重算，圖面與 3D 模型亦能由計算表數值驅動尺寸。
- **開放資料格式**：專案檔採用 IFCX，並可匯出 IFC4x3。
- **與 AI 助手協同工作**：內建 MCP 伺服器與 REST API，僅於本機電腦（`127.0.0.1`）透過安全權杖運作。

## 靈感來源：Calcpad

Open CalcSheet Studio 深受 Ned Ganchovski 所開發的 [Calcpad](https://calcpad.eu/) 啟發；純文字撰寫計算並展開每步推導的核心概念即源自於此。本軟體擁有專屬的計算核心，同時亦能直接開啟 `.cpd` 檔案。Calcpad 的開源演進則在社群版本 [CalcpadCE](https://github.com/imartincei/CalcpadCE) 中持續推進。

## 畫面截圖

截圖以英文與操作介面為代表。

| | |
|---|---|
| ![彙整所有計算表的單一報告](docs/images/readme/report.png) **彙整所有計算表的單一報告** | ![輸入純文字，輸出推導公式](docs/images/readme/code-output.png) **輸入純文字，輸出推導公式** |
| ![試算表與鋼筋明細表](docs/images/readme/spreadsheet.png) **試算表** | ![畫布上的自由公式與計算結果](docs/images/readme/canvas.png) **畫布上的自由公式** |
| ![建構門形剛架的節點圖與背景 3D 預覽](docs/images/readme/graph.png) **節點圖與 3D 預覽** | ![具備平面圖與剖面圖等多重視圖的 A3 工程圖紙](docs/images/readme/drawing-sheet.png) **具備多重視圖的工程圖紙** |
| ![整合 Python 繪圖與表格的 Jupyter 筆記本](docs/images/readme/jupyter.png) **整合 Python 的 Jupyter 筆記本** | ![具備空間階層樹狀結構與生成檔案的 IFC 標籤頁](docs/images/readme/ifc.png) **IFC 與 IFCX 建築資訊模型** |
| ![具備滑桿控制與彎矩圖的互動式反應型 Marimo 筆記本](docs/images/readme/marimo.png) **互動式反應型 Marimo 筆記本** | ![設定事務所 Logo、代表色與專屬字型的外觀樣式](docs/images/readme/house-style.png) **自訂事務所視覺識別與樣式** |

## 計算表種類

專案由多張計算表組成，各類型詳見[計算表種類說明文件](docs/bladsoorten.md)。

| 計算表種類 | 說明 |
|------------|------|
| **計算表** | 以[計算語言](docs/rekentaal.md)撰寫的純文字，支援公式、條件式、繪圖與函數圖表 |
| **試算表** | `.xlsx` 工作簿，支援公式、儲存格參照、填滿與分頁界限 |
| **畫布** | 自由配置公式單元，使用相同核心由上至下計算 |
| **節點圖** | 提供數值、邏輯、清單、文字與幾何節點及程式區塊，附 3D 預覽，可讀取 `.dyn` 節點圖檔 |
| **圖面** | A4、A3 或 A2 依比例視圖：網格軸線、標高、牆體、型鋼、預力空心版與示意圖 |
| **Jupyter** | 免安裝環境的 [Python 筆記本](docs/jupyter-blad.md)，內建 numpy、scipy、pandas 與 matplotlib，可設定每次變更時自動執行 |
| **Marimo** | 反應式 Python 筆記本：拖曳滑桿即可即時連動所有相依計算 |
| **PDF** | 將現有 PDF 納入報告章節，支援縮放、標註、螢光畫線、箭頭、框線與雲狀線 |
| **Markdown** | 將既有 Markdown 文字納入計算書報告中 |

## 模組與資料庫

模組為附帶參數化輸入介面的現成計算表：

- **台灣本土設計模組**：
  - **鋼筋混凝土結構**（`rc112`）：
    - **RC 矩形梁**（`tw-rc-beam`）：單雙筋矩形梁撓曲強度、剪力與箍筋檢核、開裂撓度與長期依時撓度、裂縫控制最大鋼筋間距。
    - **RC 矩形柱**（`tw-rc-column`）：細長比放大法、P-M 軸力彎矩互制折線法、剪力強度、閉合箍筋構造與主筋淨距檢核。
    - **獨立基腳**（`tw-isolated-footing`，依 `found112` / `rc112`）：地盤接觸壓力與偏心檢核、基底摩擦抗滑、單向梁剪力、雙向沖剪（含最新尺寸效應係數 $\lambda_s$）、柱面抗彎、短向帶狀分配配筋、柱底承壓與受拉鋼筋錨定伸展長度。
  - **鋼結構**（`steel99` LRFD）：
    - **熱軋 H 型鋼梁**（`tw-steel-beam`）：斷面結實性分類、側向扭轉挫屈（LTB）三區段彎矩容量、剪力強度與活載撓度。
    - **熱軋 H 型鋼柱與柱腳**（`tw-steel-column`）：長細比限制、軸壓容量、二階梁柱互制、柱腳混凝土承壓、錨栓拉剪互制與 AISC DG1 懸臂基板厚度。
  - **土木大地與水利**（`found112` / `swc_tech` 114 / `rc112`）：
    - **懸臂式擋土牆**（`tw-retaining-wall`）：Rankine 土壓力、抗傾覆穩定（$FS \ge 2.0$）、基底抗滑動（$FS \ge 1.5$）、合力作用點偏心距（$e \le B/6$）、地盤承載力、立壁剪力彎矩與底版前趾後踵懸臂配筋。
    - **排水溝與明渠水理**（`tw-drainage-channel`）：合理化公式設計流量、曼寧公式滿流容量、牛頓迭代正常水深、流速與出水高限制、側壁靜止土壓抗彎剪力配筋。
    - **滯洪池**（`tw-detention-basin`）：合理化三階段洪峰流量、三角形歷線蓄洪容積、出流洪峰上限、孔口出流、緊急溢洪堰容量與堤頂出水高檢核。
    - **鋼筋混凝土箱涵**（`tw-box-culvert`，`hwbridge` / `rc112`）：HS20-44 輪重透過填土分佈與涵洞衝擊係數、表 3.3 第 VIII 組載重組合、平面閉合剛架（`raamwerk`）內力、頂底版與側牆抗彎剪力配筋、內角加腋、滿流排水容量、地盤承載力與抗浮。
    - **基樁承載力**（`tw-pile-foundation`，依 `found112`）：N 值法單樁極限與容許垂直支承力（表 5.3-1 安全係數、表 5.3-2 支承力）、基樁數量與單樁承載力檢核。
    - **沉砂池**（`tw-sediment-basin`，`swc_tech` 114）：通用土壤流失公式（USLE）土壤流失量、開挖整地與未開挖分區泥砂生產量、臨時性 1.5 倍設計容量、池體容積、深度範圍（1.5～3.5 m，垂直共構豁免）、矩形溢流堰通水能力與池頂出水高檢核。

### 台灣本土設計模組清單與狀態

| 模組名稱 | 模組識別碼 | 主管設計規範 | 成熟度狀態 | 專屬檢核腳本 |
|----------|------------|--------------|------------|--------------|
| **RC 矩形梁** | `tw-rc-beam` | 建築物混凝土結構設計規範（`rc112`）第 6、9、22、24 章 | 已校準（gereed） | `scripts/check-tw-rc-beam.mjs` |
| **RC 矩形柱** | `tw-rc-column` | 建築物混凝土結構設計規範（`rc112`）第 6、21、22、25 章 | 已校準（gereed） | `scripts/check-tw-rc-column.mjs` |
| **RC 獨立基腳** | `tw-isolated-footing` | 建築物基礎構造設計規範（`found112`）／混凝土（`rc112`） | 已校準（gereed） | `scripts/check-tw-isolated-footing.mjs` |
| **熱軋 H 型鋼梁** | `tw-steel-beam` | 鋼結構設計技術規範（`steel99` LRFD）第 4、7 章 | 已校準（gereed） | `scripts/check-tw-steel-beam.mjs` |
| **熱軋 H 型鋼柱與柱腳** | `tw-steel-column` | 鋼結構設計技術規範（`steel99` LRFD）第 4、6、7、8、10 章 | 已校準（gereed） | `scripts/check-tw-steel-column.mjs` |
| **RC 懸臂式擋土牆** | `tw-retaining-wall` | 基礎（`found112`）第 7 章／水保（`swc_tech`）／`rc112` | 已校準（gereed） | `scripts/check-tw-retaining-wall.mjs` |
| **RC 排水溝與明渠** | `tw-drainage-channel` | 水保規範（`swc_tech`）第 16～19、78、82～87 條／`rc112` | 已校準（gereed） | `scripts/check-tw-drainage-channel.mjs` |
| **滯洪池設計** | `tw-detention-basin` | 水保規範（`swc_tech`）第 16～19、94～97 條 | 已校準（gereed） | `scripts/check-tw-detention-basin.mjs` |
| **RC 箱涵設計** | `tw-box-culvert` | 公路橋梁設計規範（`hwbridge`）第 3、4 章／`rc112` | 已校準（gereed） | `scripts/check-tw-box-culvert.mjs` |
| **沉砂池設計** | `tw-sediment-basin` | 水保規範（`swc_tech`）第 35、92、93 條／`sewer_std` | 已校準（gereed） | `scripts/check-tw-sediment-basin.mjs` |
| **建築物耐震載重** | `tw-seismic-load` | 耐震設計規範（`seis113`）第 2.2、2.6、2.9、2.11 節 | 已校準（gereed） | `scripts/check-tw-seismic-load.mjs` |
| **建築物耐風載重** | `tw-wind-load` | 耐風設計規範（`wind103full`）式 2.6、2.7 | 已校準（gereed） | `scripts/check-tw-wind-load.mjs` |
| **靜活載重彙整** | `tw-dead-live-loads` | 建築技術規則構造編（`btr_struct`）第 11、17、25、26 條 | 已校準（gereed） | `scripts/check-tw-dead-live-loads.mjs` |
| **RC 單向板** | `tw-rc-slab` | 混凝土結構設計規範（`rc112`）第 6.5、7、22、24 章 | 已校準（gereed） | `scripts/check-tw-rc-slab.mjs` |
| **三／四樁樁帽** | `tw-pile-cap` | `rc112` 第 23 章／基礎構造設計規範（`found112`） | 已校準（gereed） | `scripts/check-tw-pile-cap.mjs` |
| **基樁承載力** | `tw-pile-foundation` | 基礎構造設計規範（`found112`）第 5.3 節 | 已校準（gereed） | `scripts/check-tw-pile-foundation.mjs` |
| **重力式擋土牆** | `tw-gravity-retaining-wall` | `found112`／水保規範（`swc_tech`）／`rc112` 第 14 章 | 已校準（gereed） | `scripts/check-tw-gravity-retaining-wall.mjs` |
| **明渠水面線** | `tw-backwater-profile` | 水保規範（`swc_tech`）第 84～86 條 | 已校準（gereed） | `scripts/check-tw-backwater-profile.mjs` |
- **歐洲規範模組**（Eurocode，非台灣規範）：
  - **木托梁樓板**（EN 1995-1-1）、**木/鋼梁**（EN 1993-1-1）與**雙樁樁帽**（EN 1992-1-1），搭配荷蘭國家附錄。透過[線上模組庫](https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio-modules)可直接新增模組。參閱[木托梁檢核原理](docs/balklaag-toetsing.md)與[雙樁樁帽檢核原理](docs/tweepaalspoer-toetsing.md)。
  - 雙樁樁帽在圖紙旁提供 3D 結構模型，即時展示樁帽、基樁、柱子與各鋼筋籠。**新增模組**畫面為每個選項提供圖示預覽。
- **斷面應力分析**（力學計算，非規範檢核）：支援 I/H 型、矩形、圓形、圓管、箱型、T 型與槽型，輸入兩向軸力、彎矩與剪力，即時顯示斷面應力場、中性軸與 $\sigma$、$\tau$ 分布圖，詳見[斷面應力計算說明](docs/doorsnede-spanningen.md)。
- **公式庫**包含 137 個可一鍵插入的實用公式，附示意圖。專案面板中的資料庫另含 15 個歐洲規範與古典力學的範例，啟動時自儲存庫同步更新（詳見[資料庫說明](docs/library.md)）。
- **重量資料庫**收錄超過 2,300 筆材料自重，每項均附規範或供應商出處。支援搜尋、篩選與一鍵插入配比，並可匯出與共用 `.weightlibrary` 檔案。

| | |
|---|---|
| ![資料庫計算範例](docs/images/readme/library.png) **資料庫計算範例** | ![雙樁樁帽圖面與 3D 構件模型](docs/images/readme/two-pile-cap.png) **雙樁樁帽圖面與 3D 構件模型** |
| ![附示意圖的公式庫](docs/images/readme/formula-library.png) **附示意圖的公式庫** | ![新增模組視窗，每個選項皆有圖示](docs/images/readme/add-module.png) **新增模組視窗，每個選項皆有圖示** |

## 互操作性與資料交換

| 格式 | 開啟 | 儲存 / 匯出 |
|------|------|-------------|
| **IFCX** (`.ifccalculation`, `.ifcx`) | 是 | 是，此為專案原生存檔格式 |
| **IFC4x3** (`.ifc`) | 否 | 是 |
| **計算文字** (`.cpd`) | 是 | 否，另存為專案檔 |
| **試算表** (`.xlsx`) | 是 | 是 |
| **Markdown** (`.md`) | 是 | 是 |
| **筆記本** (`.ipynb`, `.py`, 資料檔) | 是 | 工作資料夾封裝為 `.zip` |
| **PDF** | 作為單一計算表納入 | 是，整份計算書報告 |
| **DXF** | 轉為圖面中的視圖 | 否 |

每張計算表的文字、輸入與結果皆完整儲存於 IFCX 檔案中。模組輸入畫面自動繪製的圖形不會儲存為靜態點陣圖，僅保存計算語言繪圖腳本本身。雙樁樁帽模組可匯出其 3D 構件模型：在 IFC4x3 中，鋼筋籠之每根鋼筋皆對應為 `IfcReinforcingBar`。詳見 [IFC 匯出說明](docs/ifc-export.md)。

## MCP 與 AI 助手

應用程式內建 MCP 伺服器與 REST API，提供相同的 49 項工具：開啟與儲存專案、新增計算表、填入輸入參數、執行計算、匯出與列印。僅於本機電腦（`127.0.0.1`）監聽並受安全權杖保護。可在**設定 › API 與 AI 助手**中關閉、設為唯讀或暫停。詳見 [MCP 說明文件](docs/mcp.md)與 [REST API 文件](docs/api.md)。

## 測試與可靠性

- **101 個檢查腳本**位於 `scripts/`，在 Linux 與 Windows 上透過 `npm run check` 於每次 Pull Request 自動執行。
- **382 項手算對照驗證**：313 項位於 `scripts/check-formules.mjs`，69 項位於 `scripts/check-library.mjs`，盡可能以獨立平衡路徑複核。
- **複合專案真實 PDF 檢驗**（`scripts/check-rapport-pdf.mjs`）：實體頁數與計算表完全對齊，每頁具備正確頁碼與目錄連結。
- **桌面應用程式安全性實體驗證**（手動執行）：`scripts/proef-js-webrtc.mjs` 檢驗計算表內指令碼隔離，`scripts/proef-jupyter-venster.mjs` 與 `scripts/proef-marimo-venster.mjs` 檢驗筆記本網路外通封鎖。
- **全平台建置驗證**：每次推送至 `main` 時於 Windows、macOS 與 Linux 進行 CI 自動建置與簽章查核。

資料統計來源：上述各檢查檔案與 `ls scripts/check-*.mjs`。模組狀態標示檢核成熟度：*已校準*代表已與對照算式或外部引擎完整比對，*待檢核*代表尚未完成全項校核。

## 目前限制

- **重量資料庫尚未完全涵蓋台灣本土建材**：目前收錄有公開依據的品項，後續將依據建築技術規則構造編靜載重表擴充台灣常用建材重量庫。
- **請自行查核計算結果**：上游部分歐規模組標示為「待檢核」。本軟體無法取代專業結構工程師之專業判斷。
- **Jupyter 與 Marimo 主要於 Windows 測試**：macOS 與 Linux 桌面端可能因 Webview 的 Service Worker 限制而無法順利啟動核心（檔案儲存與列印不受影響）。
- **筆記本無對外網路連線**：不支援 `%pip install`，依賴 JavaScript 前端繪圖的套件（如 plotly、bokeh、ipywidgets）無法顯示輸出。
- **執行中的儲存格無法中途停止**：Marimo 尚不支援 SQL 儲存格，深淺色主題僅於載入時套用。
- **字型未內嵌於專案檔中**：除 Inter 與 Space Grotesk 外，自訂事務所字型必須安裝於執行列印的電腦上。
- **資料庫首次使用需連網**：若無網路連線，資料庫需待首次擷取後方能離線使用快取版本。
- **節點圖檔案轉換未完全涵蓋所有節點**：本軟體尚未實作的節點、指令碼或複雜幾何會在圖面上標註提示，不參與運算。
- **試算表數值尚未直接連動至計算表**：試算表目前為獨立工作頁。
- **尚未支援分數表示的呎吋**：目前無法輸入如 5'-6 ½"，溫度維持計算表設定之單位。規範引文字串、重量庫及自繪圖面亦保持原本設定之單位。
- **直接列印 PDF 目前僅 Windows 原生支援**：其他平台需透過系統列印對話方塊輸出。
- **部分上游歐規變數保留荷蘭文**：介面、計算表、程式碼標籤與報告皆已支援繁體中文，但歐規模組之變數名稱及 IFC 樹狀結構之部分名稱維持原文。
- **螢幕縮放可能導致分頁位置微幅變動**：在 100% 與 150% 縮放倍率下，少數幾行內容可能換頁。
- **應用程式內全面封鎖 WebRTC**：無法在 `@iframe` 內使用依賴 WebRTC 的外部網頁。
- **Open FEM Studio 專案整合尚未開放**：功能表項目已顯示但暫時停用。

若發現問題，歡迎[回報 Issue](https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio/issues)。

## 後續開發路線圖（Roadmap）

台灣版基礎架構、載重產生器、RC／鋼構／大地／水保模組（共 18 張台灣計算表）、鋼構 ASD 雙軌、部分 Designer 圖面、工址參數聯動與台灣版發佈管線已完成（階段 0～8，歷程見 [工作計畫.md](docs/tw/工作計畫.md)）。
下一階段以「補齊目前會拒算或標示待補的範圍」優先，其次才是新模組。各項缺口的規範依據與補齊路徑見 [規範來源.md](docs/tw/規範來源.md)。

**第一優先：規範資料補齊（不補齊，下列模組只能拒算或要求使用者自行輸入）**

1. **建築構造編第 17 條用途活載重附表（A～I 類）**：依官方附檔逐列核對後入庫（B 級→A 級），讓 `tw-dead-live-loads` 可直接依用途選取活載重。
2. **水保規範未驗證條文**：`swc_tech` 第 12、78、86、87、93、118～120 條在 WorkBench 補驗證後，排水溝、擋土牆、沉砂池由 B 級改為 A 級並核對一致。
3. **鋼構細項**：`steel99` 第 7.2.3 與 8.2 互制式入庫；CNS 1490／7141／4435 型鋼斷面表逐列對照官方版本。

**第二優先：既有模組的拒算範圍**

4. **RC 雙向版**：直接設計法與係數法（待彎矩分配表入庫），`tw-rc-slab` 目前僅支援單向版。
5. **鋼構 ASD 擴充**：梁 Lb > Lc 區段、梁柱互制與柱腳；目前 ASD 超出範圍一律拒算。
6. **水文水理與箱涵**：滯洪池 Modified Puls 逐時段調洪演算、多孔箱涵與地震土壓、排水溝水面線串接（變量流）。

**第三優先：新模組（皆須先確認規範已入庫或可由官方來源補齊）**

7. **聯合基腳與樁基承載力**（`found112`）、**跌水工與消能工**（`swc_tech` 第 86、87 條）、**雨水下水道水理**（下水道工程設施標準）。樁基承載力已完成——`tw-pile-foundation` 以 N 值法（表 5.3-2）與表 5.3-1 安全係數計算單樁極限／容許垂直支承力與基樁數量；聯合基腳、跌水工與消能工、雨水下水道水理待做。
8. **木構造與橋梁耐震**：兩部規範尚未收錄，須先在 WorkBench 建檔才能開模組；**本輪（階段 9）不納入**。

**使用體驗與報告**

9. **Designer 圖面補齊**：已完成——梁、擋土牆、滯洪池、耐震、耐風之外，新增 RC 柱、單向板、樁帽、箱涵、排水溝、H 型鋼梁與 H 型鋼柱柱腳，共 11 張台灣計算表有參數化圖。
10. **台灣建材重量庫**（`library/gewichten/`）與**繁中報告驗證**：已完成——重量庫依構造編第 11、14、15 條建立台灣條目並以 `check-tw-gewichten.mjs` 逐列核對；`check-rapport-talen.mjs` 已有繁中黃金檔並檢查無殘留荷蘭文／英文；報告目錄頁碼由 `check-paginering.mjs` 與 `check-rapport-pdf.mjs` 驗證。

**上游與發佈**

11. **上游協作**：MKS 單位制與多語結尾行解析兩個 PR 分支已推送，後續向 OpenAEC 上游送出並追蹤審查；持續以 `docs/tw/上游同步流程.md` 合併上游新版（目前同步至 v2026.46.1）。
12. **Open FEM Studio 與 `@kern` 對接**：以 `@kern` 計算工具作為台灣模組的第二套獨立對照，待上游開放 FEM 專案整合後評估板、牆模型的台灣規範檢核。
13. **文件與統計一致性**：已新增 `scripts/check-tw-readme.mjs` 檢查 `README.zh-TW.md`（檢查腳本數、共用數字、模組清單），避免數字再次過時；待辦：評估台灣版安裝檔的程式碼簽署。

## 核心架構

計算核心（`packages/core`）以 TypeScript 開發，基於 mathjs 建置，亦可[作為獨立套件使用](docs/rekenkern-als-pakket.md)。桌面應用程式為 Tauri 2 框架（Rust 外殼），前端採用 React 19、CodeMirror 6 與 KaTeX；筆記本環境由 JupyterLite 與 Pyodide 驅動。共用設計系統與圖示來自 [OpenAEC Blueprint](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint)。

## 參與貢獻

- **在實際工程專案中試用**，若發現錯誤或有新功能需求，請[提出 Issue](https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio/issues/new)。請詳細說明操作步驟、預期結果與實際狀況。
- **修正或補充計算範例**：[資料庫範例](library)均為純文字，詳見[如何修正範例文件](docs/library.md)。
- **撰寫程式碼**：請詳閱 [AGENTS.md](AGENTS.md) 與[開發者指南](docs/ontwikkelen.md)，並發起 Pull Request。台灣化相關指引與規範依據請參閱 [docs/tw/工作計畫.md](docs/tw/工作計畫.md) 與 [docs/tw/規範來源.md](docs/tw/規範來源.md)。

## 開發者快速上手

```bash
git clone https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio.git
cd Open-CalcSheet-Studio
npm ci
npm run tauri:dev --workspace=@openaec/calcsheet-studio
```

環境需求：Node 24 與 Rust 工具鏈；初次建置 Jupyter 筆記本環境需 Python 3.10 以上版本。`npm run dev` 可在瀏覽器啟動預覽，無需安裝 Rust。詳閱[開發者指南](docs/ontwikkelen.md)。本 README 內之截圖由 `scripts/maak-readme-beelden.mjs` 腳本產生。

版本號採 OpenAEC 標準格式 `YYYY.W.N`：西元年、不補零之 ISO 週別、週內序號（由 0 起算），例如 `2026.45.0`。

Open CalcSheet Studio 為 [OpenAEC 基金會](https://github.com/OpenAEC-Foundation)開源專案家族之一員。

## 授權條款

LGPL-3.0 授權，詳見 [LICENSE](LICENSE)。Jupyter 與 Marimo 的 Python 執行環境隨附之軟體遵循各自開源授權（BSD、MIT、MPL-2.0、PSF），詳見[授權清單](packages/desktop/jupyter-omgeving/LICENTIES.md)。

## 商標宣告

Jupyter、Marimo、Windows、macOS 以及其他產品名稱均為各自所有者之註冊商標。Open CalcSheet Studio 為獨立開源專案，並未受其附屬、認可或贊助。
