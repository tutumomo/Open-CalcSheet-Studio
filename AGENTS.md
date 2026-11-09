# 工作規範（Open CalcSheet Studio 台灣版）

本 repo 是 [OpenAEC-Foundation/Open-CalcSheet-Studio](https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio)
的 fork，目標是**繁體中文介面＋依台灣規範的計算模組**。上游的架構、計算表慣例、
檢查與建置說明在 [docs/overdracht.md](docs/overdracht.md)（荷蘭文），開工前先讀；
台灣版的補充說明見 [CLAUDE.md](CLAUDE.md)。

## 1. 與上游的關係：保持可合併

- 之後仍會合併上游更新（`git remote add upstream https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio.git`）。
- **既有檔案不改名、不搬移、不刪除**；既有的荷蘭文識別碼、註解、文件與計算表文字不改寫。
  上游程式的錯誤以最小改動修正，並考慮回饋給上游。
- 台灣版內容一律放**新檔**：
  - 計算表 `packages/desktop/src/templates/tw-<模組>.ts`（放在 `templates/` 這一層，
    不開子資料夾：`check-renders.mjs` 只掃這一層）
  - 檢查腳本 `scripts/check-tw-<模組>.mjs`（`check-alles.mjs` 會自動收進來）
  - 文件 `docs/tw/`
  - 介面文字 `packages/desktop/src/i18n/locales/zh-TW/`
- 必須改到共用檔時（`templates/index.ts`、`projectTree.ts`、`designerKeuze.tsx`、
  `i18n/config.ts`、`templates/vertalingen.ts`、`eenheden.ts` 等），只做追加、集中成一段，
  並加註「台灣版」，以減少合併衝突。
- 新檔的識別碼用英文；擴充既有檔時沿用該檔的命名慣例。
- 合併上游時，`AGENTS.md`、`CLAUDE.md` 以本 fork 的版本為準，再手動吸收上游新增的規則。

## 2. 語言

- 新寫的程式碼註解、文件、commit 訊息、計算表、fixture 與測試一律用**繁體中文**，
  使用台灣用語與全形標點（「預設」而非「默認」、「檔案」而非「文件」、「軟體」而非「軟件」），
  專有名詞依台灣規範用詞。程式碼識別碼、指令與路徑保留原文。
- 介面新增 `zh-TW`：鍵必須與 `nl`、`en` 完全相同（`check-schermtekst.mjs`）。
- 上游的荷蘭文內容維持原樣（見 §1）。

## 3. 設計規範

- 台灣模組依台灣**現行**規範，主要為：
  - 建築技術規則建築構造編
  - 建築物耐震設計規範及解說（113.03.01）
  - 建築物耐風設計規範及解說（103.12.03）
  - 建築物混凝土結構設計規範（112.08.10）
  - 鋼構造建築物鋼結構設計技術規範（ASD 與 LRFD 兩冊）
  - 建築物基礎構造設計規範（112.06.20）
  - 土木類另依水土保持技術規範、公路與市區道路相關規範

  規範全文與已驗證庫放在 `D:\Civil_Design_WorkBench`（用法見 CLAUDE.md），
  **該處唯讀，規範檔案不得複製進本 repo**。
- **規範體系背景**：台灣土木、建築、結構規範的骨架大多是美國系統
  （例如混凝土規範對應 ACI 318、鋼構對應 AISC 360、公路橋梁對應 AASHTO、耐震與耐風參考 ASCE 7），
  部分條文參考日本與歐洲，並有台灣自訂的修改。因此：
  - 依據一律是**台灣規範本身**。不得因為「台灣規範源自 ACI／AISC」就直接引用美國原版的數值或條文；
    台灣版沒有明寫、只能參考母規範時，在表上標「非台灣規範明文，參考 ○○」，並依下方規定先問使用者。
  - 母規範的對應關係是理解用的線索，記在 `docs/tw/規範來源.md`，不寫成計算表的依據。
- **來源分級**（細節與目前缺口見 `docs/tw/規範來源.md`）：
  - **A 級**：WorkBench 已驗證庫（`tools/regs/verified/*.json`，MCP `regs_formula`、`regs_table`）。優先使用。
  - **B 級**：WorkBench 沒有收錄、版次已過時，或所需條文尚未驗證時，**可上網取得最新版**，但只限官方來源：
    全國法規資料庫、內政部國土管理署、交通部與所屬機關、經濟部水利署、
    農業部農村發展及水土保持署、公共工程委員會、經濟部標準檢驗局（CNS）。
    B 級數值必須記在 `docs/tw/規範來源.md`：規範名稱、版次（發布或修正日期）、條號／表號、
    官方網址、擷取日期，並由檢查腳本以 repo 內的資料核對。
  - **C 級**：部落格、教科書、論壇、廠商資料、機器翻譯。只能當線索，**不得取數**。
  - 全文文字層、MinerU 草稿，以及標示「可信度：低」的條文，都不得拿來取數。
- 引用前先確認版次：查 WorkBench 的 `docs/法規庫總目錄.md`，並在 `docs/tw/規範來源.md` 確認
  沒有更新的官方公告。「已被取代」只供對照，不得作為依據；網路上查到較新版次時，以新版為準，
  並註記 WorkBench 版次待更新。計算表與檢查腳本一律寫明規範名稱、版次與條號；
  B 級數值另在程式的 `bron` 欄位或註解寫明官方來源。
- **不得複製規範條文**：只寫條號、公式號、表號、數值與一句話摘要（B 級來源同樣適用）。
- 法規庫**尚未收錄木構造建築物設計及施工技術規範**。在它入庫並驗證前，
  台灣木構造的檢核一律標「未檢核」，不得判為合格。
- 鋼構 ASD 與 LRFD **全案擇一**，不可混用。
- 以 kgf/cm² 表示的經驗式（例如 0.53√fc′）不可直接代入 MPa 值，必須用規範列出的 SI 係數版本
  （同一條式子在三種單位制的係數不同，例如混凝土剪力強度：kgf/cm² 版 0.53、MPa 版 0.17、
  美國 psi 版 2）。規範只列一種單位制時，換算過程寫進檢查腳本的註解，表上註明「係數由 ○○ 換算」。
- 以下情況**必須先問使用者**，或在表上明確標示「非規範明文」或「待確認假設」：
  - 規範沒有明寫、只有業界慣用的做法
  - 有兩種以上合理的模型
  - 版次可能不同
  - 會改變合格與否的假設（土層參數、K 值、μ 等）
- 台灣專案參數（工址的 S_DS／S_D1、用途係數 I、基本設計風速、地況等）另取新名稱，
  不得借用 `windgebied`、`terreincategorie`、`CC`、`RC` 等歐規專案變數來表達台灣的意義。

## 4. 單位

- 計算表內部以 **SI** 為主（kN、kN·m、MPa、mm）。
- 台灣規範與實務在 kgf-cm（MKS）、SI、英制之間混用（例如鋼筋號數沿用英制 #3～#11 對應 D10～D36，
  建築技術規則的載重以 kgf/m² 表示）。輸入與輸出要清楚標示單位，換算交給核心的單位系統，
  不得在計算表內手寫換算常數。
- 另提供「台灣 MKS」單位制（kgf、tf、tf·m、kgf/cm²、cm）供顯示與輸入切換；
  1 kgf = 9.80665 N，換算只在一處定義。核心目前沒有 kgf 和 tf，
  須加在 `packages/core/src/eenheden.ts` 並補檢查。

## 5. 計算安全（不得違反）

- **計算表絕不可錯判為合格**（上游為 'voldoet'）。有疑慮時取安全側，或在表上標「未檢核」。
  超出適用範圍時拒算或標「未檢核」，不可算出一個看起來會過的數字。
- **計算值只能憑手算修改**，手算過程以註解記在該模組的檢查腳本中。
- 每個台灣模組都要有自己的 `scripts/check-tw-<模組>.mjs`，至少涵蓋：
  - 斷面或幾何性質
  - 每條主要公式一題
  - 邊界條件一題
  - 端到端兩題，並在腳本內用獨立算式重算
  - 錯誤輸入一題

  另外要刻意找出會錯判合格的情況。檢查腳本必須自給自足：CI 上沒有 WorkBench，
  只能讀 repo 內的資料。
- 已存在的表單經「Bladen bijwerken」更新後，**不得悄悄變得更有利**
  （新欄位的預設值沿用舊行為，或採安全側）。
- 上游依歐洲規範（Eurocode＋荷蘭國家附錄）的模組（balklaag、ligger、tweepaalspoer）**保留**，
  但在目錄、表頭與列印上都要明確標示「Eurocode，非台灣規範」。
  **不得把歐規模組翻成中文就當作台灣模組**；台灣模組依台灣規範另寫新表。

## 6. 資料與名稱

- repo 中任何地方都不得出現外部或商業計算軟體的名稱（含縮寫），也不得提及與 AI 助理的對話。
  唯一例外是 Calcpad，只能以 README 中致謝的方式提及。
- 不得放入專案、客戶或個人資料。WorkBench 的 `cases/`、`完整案例(參考用)/`、
  `data/臺中市建物/` 等實案資料，不得進本 repo，包括 fixture 與範例專案。
  範例一律用虛構的案名與地址。

## 7. 提交前

- 以下兩項必須全綠（需要 Node 24）：

  ```bash
  node scripts/check-alles.mjs
  cd packages/desktop && npx tsc --noEmit -p .
  ```

- 使用者感受得到的變更，寫進 `docs/CHANGELOG.md` 的「Nog niet uitgebracht」區段，內容用繁中。
- 版本號只用 `node scripts/versie.mjs zet JJJJ.W.N` 設定。
- `README.md` 與 `README.nl.md` 修改時要同步（`check-readme.mjs`）；台灣版說明放 `README.zh-TW.md`。
- Windows 安裝程式要一併打包 WebView2（`embedBootstrapper`、silent），
  並把 `WebView2Loader.dll` 放進 `bundle.resources`。
