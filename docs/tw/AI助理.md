# AI 助理側邊欄

App 內建的 AI 助理（OCSS 規格 P2-15）。標題列的 **AI** 按鈕開關右側面板；
對話、步驟與設定都在面板裡。

## 助理用的是同一份工具

助理呼叫的是與 MCP／REST **完全相同的工具登錄表**（`src/mcp/tools.ts`），
走 `voerToolUit`（`src/mcp/uitvoeren.ts`），in-process，不經 HTTP、不需 token：

- 參數依同一份 `inputSchema` 檢查，錯誤碼相同（`VALIDATION`、`NOT_FOUND`、
  `UNIT_WARNING` 等）；
- 設定裡的**暫停**與**唯讀**開關一樣生效（唯讀時 `mutate`／`file` 工具會被擋）；
- 因此 MCP 客戶端能做的事，助理都能做，反之亦然。工具數不變。

**每一步都是一步復原。** 助理的每次工具呼叫都經過既有的 store 動作，
`Ctrl+Z` 可逐步退回去。

## 核准

| 情況 | 行為 |
|---|---|
| 讀取、畫面切換 | 直接執行 |
| 一般修改（設定輸入值、加表…） | 直接執行，列在步驟清單 |
| 覆寫既有內容（`sheet_set_source`、`sheet_set_markdown`） | 先顯示**逐行差異**，核准後才寫 |
| 刪表、存檔、開新專案 | 一律先詢問 |

核准對話有三個選項：**允許**、**拒絕**、**這個工具一律允許**。最後一個只在
本次 App 執行期間有效（面板關掉再開仍在；重啟 App 後重新詢問）。拒絕時助理
會收到「使用者不同意」並改問要怎麼做，不會重試同一步。

## 助理看到什麼

每次送出前在 App 內組出（`src/components/ai/prompt.ts`）：

- 專案名稱與所有工作表（名稱、`#` 參照號、`id`、模組）；
- 目前開啟的工作表：輸入值與完整計算文字（上限 8000 字元，超出截斷並註明）；
- 該表**上次檢核結果**：`check`（`pass`／`fail`／`unchecked`）、UC、是否合格、
  單位警告與錯誤；
- App 與工具的使用說明（與 MCP 客戶端看到的 `MCP_INSTRUCTIES` 同一份）。

**`@` 限定範圍**：在問題裡寫 `@工作表名稱` 即可把助理限定在那些表（名稱含空白
可直接寫，例如 `@Balk B1`；也可以用 `@"..."`）。被指名的表會標為範圍內，其餘
標為範圍外。找不到的名稱會原樣留給助理參考。

## 提供者、第三方模型與 OAuth 登入

面板的「模型供應商」區塊只列出**已經加入的供應商**：名稱、連線狀態、目前模型，以及「設定」按鈕。
新增供應商一律走三步驟精靈「**新增供應商 → 連線 → 選擇模型**」，
使用者不會再看到 OAuth 授權網址、Client ID、Scopes、Callback 路徑、連接埠、Token 格式等協定細節；
那些欄位只藏在該供應商「設定」裡的「進階設定」摺疊區，供自訂端點的情況使用。

精靈第一步是供應商目錄，分四組：

| 分組 | 內容 |
|---|---|
| 訂閱帳號登入 | **Google Antigravity**（Code Assist PKCE）、ChatGPT Plus／Pro（Codex 裝置代碼與 PKCE）、OpenRouter（PKCE） |
| API 金鑰 | Anthropic、OpenAI、Google Antigravity（AI Studio 金鑰）、DeepSeek、Groq、xAI、Mistral、智譜 GLM（中國大陸／Z.ai）、Moonshot Kimi（中國大陸／全球／Kimi Code）、MiniMax（中國大陸／全球）、阿里雲百鍊（Coding Plan／Token Plan 個人版與團隊版）、智譜 Coding Plan、Z.ai Coding Plan、小米 MiMo（按量／包月）、火山方舟（API／Agent Plan／Coding Plan）、騰訊雲 Coding Plan、硅基流動（中國大陸／全球）、LongCat、OpenCode Go、Vercel AI Gateway、Agnes、OpenHubs、Hinoki、Ollama Cloud、Sub2API；每列都有官方文件／金鑰頁連結與建議模型 |
| 本機模型 | Ollama、LM Studio、llama.cpp、vLLM、Magpie、LiteLLM（預填 localhost 位址，免金鑰） |
| 自訂端點 | OpenAI／Anthropic／Gemini 三種協定的自訂端點 |

目錄內容整份沿用 Cindy（`makecindy/cindy` 的 `packages/model-providers/catalog/providers.json`，version 3）：
同樣的 36 筆 preset（id、名稱、簡中／繁中名稱、官方 `docsUrl`、`baseUrl`、建議模型），
再加上本 App 需要的 Anthropic、OpenAI（金鑰）、Groq、xAI、Mistral、本機 Ollama 與三筆自訂端點。
差異只有一處：Cindy 把 `openai-chat` 與 `openai-responses` 當成兩種協定，本 App 只有三種協定、
Responses API 僅用於 Codex 訂閱登入，因此 `openai-responses` 的 preset 走 OpenAI 相容的 chat 路由
（這些供應商同時提供該路由）。

### 本機已偵測

精靈開啟時會呼叫 `ai_detecteer_lokaal` 掃描這台機器，結果列在目錄最上方：

- **正在執行的模型伺服器**：Ollama（`127.0.0.1:11434`）、LM Studio（`:1234`）、llama.cpp（`:8080`）、vLLM（`:8000`）、Magpie（`:3425`），以 `GET /v1/models` 探測。
- **已存的 CLI 設定**：`~/.claude/settings.json`（`ANTHROPIC_API_KEY`／`ANTHROPIC_AUTH_TOKEN`、`ANTHROPIC_BASE_URL`）、
  `~/.codex/auth.json` 與 `~/.codex/config.toml`（`OPENAI_API_KEY` 或既有登入）、
  `~/.config/opencode/opencode.json` 與 `~/.local/share/opencode/auth.json`。

偵測是唯讀的，回傳前端的只有「有沒有金鑰」這個旗標；使用者按下該列才會呼叫 `ai_importeer_lokaal`，
由 Rust 直接讀取設定檔並把金鑰寫進作業系統金鑰環，金鑰本身不會經過前端。

### 預設提供者（API 金鑰與 OAuth 2.0 登入）

三個預設提供者皆支援 **API 金鑰**，其中 OpenAI 與 Google 另備 **OAuth 2.0**（`Authorization: Bearer`）設定：

| 提供者 | 協定 | 端點（預設） | 模型（預設） | OAuth 流程與實際端點 |
|---|---|---|---|---|
| Anthropic (Claude) | Anthropic | `https://api.anthropic.com` | `claude-sonnet-5-5` | 預設 API 金鑰（`x-api-key`）；支援切換至 OAuth 2.0 PKCE 並設定自訂／企業 OAuth 閘道（`Authorization: Bearer`；Anthropic 未對第三方開放訂閱 OAuth 用戶端） |
| OpenAI (ChatGPT) | OpenAI | `https://api.openai.com` | `gpt-5` | 開箱即用 PKCE S256（`http://localhost:1455/auth/callback`）與**裝置代碼登入**（`https://auth.openai.com/codex/device`）；OAuth 模式自動改走 ChatGPT Codex Responses API（`https://chatgpt.com/backend-api/codex/responses`、`chatgpt-account-id` JWT 識別） |
| Google Antigravity | Gemini | `https://cloudcode-pa.googleapis.com` | `gemini-3-pro-preview` | 預設走 **Antigravity／Code Assist**：PKCE S256（`http://127.0.0.1:<port>/oauth2callback`）＋ cloud-platform 範圍，請求送到 `cloudcode-pa.googleapis.com/v1internal`（`loadCodeAssist`／`onboardUser` 自動解析 GCP 專案 ID，亦可在面板手填 Project ID）。Google 依規定要求桌面端 OAuth 帶 `client_secret`，公開發行版不內建憑證，因此需自備 Client ID／Secret（`VITE_ANTIGRAVITY_OAUTH_CLIENT_ID`／`OCSS_GEMINI_OAUTH_CLIENT_SECRET`，或於進階設定填入，存於作業系統金鑰環）。沒有自備憑證時改用目錄中的「Google Antigravity（API 金鑰）」，以 AI Studio 金鑰呼叫 `generativelanguage.googleapis.com` |

> 注意：Anthropic 僅對第一方官方用戶端提供訂閱 OAuth 並禁止第三方工具冒用；Google（Antigravity）桌面端 OAuth 依規定需帶 `client_secret`，為避免在公開程式碼庫存放憑證，請於面板填入自建 Google Cloud Desktop OAuth Client ID／Secret（存於作業系統金鑰環），或直接使用 AI Studio 金鑰。Google 一律以 **Antigravity** 呈現，不再使用舊的 Gemini 命名。

### 自訂端點與進階設定

供應商目錄最下方是「**自訂端點**」，可自選 OpenAI／Anthropic／Gemini 三種協定，
填入名稱、Base URL 與選填的 API 金鑰（本機位址且金鑰留空時自動視為免驗證）。
建好之後，每一張供應商卡片的「**進階設定**」摺疊區仍可自由修改名稱、API 協定、端點、模型與
`Key: Value` 格式的**自訂 HTTP 標頭**（例如 OpenRouter 的 `HTTP-Referer`、`X-Title` 或企業代理標頭；
`Authorization`、`x-api-key`、`Host` 等受保護標頭由 Rust 端過濾阻擋），以及完整的 OAuth 參數。

端點處理會依第三方的路徑前綴（例如 `/api/v1`、`/openai/v1`、`/v1`）自動接上 `/chat/completions` 或 `/models`，
不會重複串出 `/v1/v1`。

### 抓取可用模型列表

精靈第三步與每張供應商卡片都會呼叫對應端點的模型清單
（Anthropic `/v1/models`、OpenAI 相容 `/v1/models`、ChatGPT Codex OAuth `chatgpt.com/backend-api/codex/models`、
Gemini `/v1beta/models`，並沿用該供應商目前的 API 金鑰、OAuth 權杖與自訂標頭）。
抓取失敗或回空時，清單自動退回該供應商的**建議模型**，使用者不會被卡住；下方仍保留手動輸入欄以便指定任何模型 ID。

### 驗證方式與金鑰環安全

每個供應商可獨立選擇：

1. **API 金鑰**（`apikey`）：以 `x-api-key`（Anthropic）、`?key=`（Gemini）或 `Authorization: Bearer`（OpenAI 相容）送出；連往 `localhost`/`127.0.0.1` 時不強制填金鑰。
2. **OAuth 登入**（`oauth`）：支援標準 **OAuth 2.0 Authorization Code + PKCE**（S256，可自訂回呼主機 `127.0.0.1`/`localhost`、回呼路徑與連接埠、form/JSON token 交換格式、CSRF `state` 或 `state=verifier` 驗證、`code#state` 貼上完成）、**裝置代碼登入**（OpenAI Device Code Flow）與 **OpenRouter PKCE**；`OAuthSectie` 內建 OpenAI、Google、OpenRouter、GitHub 與自訂範本。支援 `refresh_token` 在過期前自動續期並回存金鑰環。
3. **無須驗證**（`none`）：不送授權標頭，適合無需驗證的本機 Ollama／LM Studio／llama.cpp／vLLM／Magpie。

> Anthropic 未對第三方開放訂閱 OAuth，本 App 不會冒用官方 CLI 身分，因此 Anthropic 一律走 API 金鑰。
> Google 桌面端 OAuth 需帶 `client_secret`，公開發行版未內建，請在「進階設定」填入自建 Client ID／Secret
> （存於作業系統金鑰環）或改用 Google Antigravity（API 金鑰）的 AI Studio 金鑰。

**所有金鑰、OAuth 權杖與選填的 Client Secret 只存在作業系統金鑰環**（Windows 認證管理員、macOS Keychain、Secret Service），由 `src-tauri/src/ai.rs` 經 `keyring` 存取（服務名稱 `open-calcsheet-studio-ai`，依設定檔代號隔離成 `<id>`、`oauth:<id>`、`oauth_secret:<id>`）。機密不會寫進 `preferences.json`、專案檔或日誌；App 只能查詢「是否已儲存／帳號／是否過期」，讀不回秘鑰內容。端點、模型、協定與 OAuth 非機密參數則存在 `preferences.json` 的 `aiInstellingen`（相容舊版單筆設定並自動遷移）。

網路請求由 Rust 發出（webview 受 CORS 限制，且金鑰與權杖不該進 webview），
SSE 逐段解析後以 Tauri channel 回傳，所以畫面是逐字出現的。

## 外部 MCP 工具伺服器（stdio／HTTP）

除了 App 內建的 60 項工具，面板的「設定 › **外部 MCP 工具伺服器（stdio / HTTP）**」可設定並連線任意外部 MCP 伺服器（實作於 `src-tauri/src/mcp_client.rs`）：

- **內建範本**：台灣工程規範查詢（`regs_server.py --mcp`）、**OpenCADStudio**（`OpenCADStudio --mcp`）、設計引擎（stdio），以及自訂 Stdio／HTTP 伺服器。
- **Stdio 傳輸**：設定執行指令、參數、工作目錄與環境變數，連線期間保留子程序以加速連續查詢，中斷連線或關閉 App 時自動清理程序。
- **HTTP 傳輸**：支援 JSON-RPC 2.0 POST、Streamable HTTP（`Mcp-Session-Id` 與 `text/event-stream` SSE 回應）與自訂 HTTP 標頭；選填的 Bearer 驗證權杖僅存於作業系統金鑰環（`mcp_secret:<id>`），不寫進 `preferences.json`。
- **安全命名與核准**：外部工具以 `mcp__<伺服器>__<工具>`（64 字元以內）匯入模型工具清單。伺服器標註 `readOnlyHint: true` 的唯讀查詢（如查規範）直接執行；具寫入／出圖性質的工具一律先經使用者核准才呼叫。

## 限制

- 只在桌面版（Tauri）可用；瀏覽器預覽（`npm run dev`）會顯示提示。
- `--headless` 或 CLI 模式下側邊欄不載入，也不發任何網路請求。
- 一次提問預設最多 **40 回合**（工具呼叫來回），可在 AI 設定調整 **4～200**；達到上限時
  停在目前結果並提示，輸入「繼續」即可接著做。單次工具結果進對話前截短到 20000 字元
  （面板仍顯示完整內容）。
- 單次回覆預設最多 **16384 tokens**，可在 AI 設定調整 **256～64000**（Rust 端同樣夾限）；
  長計算書與表格不會再被 4096 截斷。
- 對話歷史全部送出，但超過 **200000 字元**（約 5 萬 tokens）時只保留最近的往來，避免
  超過模型的上下文長度。
- 可隨時按**停止**中斷；已完成的步驟保留，且都可復原。
- 未連接外部 MCP 伺服器時，助理僅使用內建 60 項工具；連上 `regs`、設計引擎或 OpenCADStudio 後即可跨工具查詢規範並直接繪圖出圖。

## 程式位置

| 檔案 | 內容 |
|---|---|
| `src/components/ai/agent.ts` | 對話迴圈：呼叫提供者、執行工具、核准、回合上限 |
| `src/components/ai/beleid.ts` | 哪一步要問、哪一步先看差異；參數摘要與逐行比較 |
| `src/components/ai/prompt.ts` | 系統提示與 `@` 範圍解析 |
| `src/components/ai/leveranciers.ts` | 供應商目錄：分組、建議模型、官方 API 金鑰取得連結、本機偵測結果轉供應商 |
| `src/components/ai/profielen.ts` | 預設與第三方大模型範本、OAuth 範本、設定檔遷移與就緒檢查 |
| `src/components/ai/AanbiederWizard.tsx` | 三步驟新增供應商精靈（選擇供應商 → 連線 → 選擇模型） |
| `src/components/ai/OAuthSectie.tsx` | OAuth 登入流程與（收在「進階設定」裡的）原始 OAuth 參數 |
| `src/components/ai/mcpExtern.ts` | 外部 MCP 伺服器範本、工具命名空間（`mcp__*`）與設定遷移 |
| `src/store/aiStore.ts` | 面板狀態、多供應商、本機偵測與匯入、OAuth 登入、模型列表、外部 MCP 連線與步驟 |
| `src/components/ai/AiPaneel.tsx`、`.css` | 面板本體（供應商清單、模型下拉選單、OAuth 流程、外部 MCP 設定） |
| `src/tauri/ai.ts`、`src/tauri/mcpExtern.ts` | 前端到 Rust 的介面（對話 channel、OAuth PKCE、本機偵測、模型抓取、外部 MCP 呼叫） |
| `src-tauri/src/ai.rs`、`src-tauri/src/mcp_client.rs` | 金鑰環、OAuth 2.0 PKCE 與續期、本機供應商偵測與金鑰匯入、模型抓取、SSE 解析、外部 MCP stdio/HTTP 客戶端 |

## 驗證

```bash
node scripts/check-ai-agent.mjs                     # 109 項：政策、差異、@ 範圍、迴圈、Cindy 供應商目錄、設定檔／OAuth、外部 MCP
node scripts/valideer-tw-i18n-keys.mjs ai           # zh-TW 與 en 的 ai 鍵是否對齊
cargo test --manifest-path packages/desktop/src-tauri/Cargo.toml --lib ai::
cargo test --manifest-path packages/desktop/src-tauri/Cargo.toml --lib mcp_client::
```

未涵蓋：真實提供者的串流、OAuth 瀏覽器實際授權與金鑰環存取（需要真實帳號／金鑰與實機桌面環境）、本機模型伺服器偵測（需要實際執行 Ollama／LM Studio），面板版面的目視檢查。
