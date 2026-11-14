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

## 提供者與金鑰

面板的「服務提供者」區塊設定：

| 提供者 | 端點（預設） | 模型（預設） |
|---|---|---|
| Anthropic | `https://api.anthropic.com` | `claude-sonnet-5-5` |
| OpenAI 相容 | `https://api.openai.com` | `gpt-5` |
| Google Gemini | `https://generativelanguage.googleapis.com` | `gemini-2.5-pro` |

「OpenAI 相容」也適用本機的 **magpie**（`http://127.0.0.1:3425`）等自架端點：
把端點改成它即可，不需要金鑰時留空也能用（伺服器端通常會忽略）。

**金鑰只存在作業系統金鑰環**（Windows 認證管理員、macOS Keychain、
Secret Service），由 `src-tauri/src/ai.rs` 經 `keyring` 存取，服務名稱
`open-calcsheet-studio-ai` 加上提供者代號。金鑰不會寫進 `preferences.json`、
專案檔或日誌；App 只能查「有沒有金鑰」，讀不回內容。端點、模型與提供者則存在
`preferences.json` 的 `aiInstellingen`（不含機密）。

網路請求由 Rust 發出（webview 受 CORS 限制，且金鑰不該進 webview），
SSE 逐段解析後以 Tauri channel 回傳，所以畫面是逐字出現的。

## 限制

- 只在桌面版（Tauri）可用；瀏覽器預覽（`npm run dev`）會顯示提示。
- `--headless` 或 CLI 模式下側邊欄不載入，也不發任何網路請求。
- 一次提問最多 **12 回合**（工具呼叫來回）；超過時停在目前結果並提示可請助理
  繼續。單次工具結果進對話前截短到 20000 字元（面板仍顯示完整內容）。
- 可隨時按**停止**中斷；已完成的步驟保留，且都可復原。
- 助理不會自己去查規範資料庫或外部網路：它只有這些工具。

## 程式位置

| 檔案 | 內容 |
|---|---|
| `src/components/ai/agent.ts` | 對話迴圈：呼叫提供者、執行工具、核准、回合上限 |
| `src/components/ai/beleid.ts` | 哪一步要問、哪一步先看差異；參數摘要與逐行比較 |
| `src/components/ai/prompt.ts` | 系統提示與 `@` 範圍解析 |
| `src/store/aiStore.ts` | 面板狀態、對話、步驟、金鑰狀態 |
| `src/components/ai/AiPaneel.tsx`、`.css` | 面板本體 |
| `src/tauri/ai.ts` | 前端到 Rust 的介面（`ai_vraag` 的 channel） |
| `src-tauri/src/ai.rs` | 金鑰環、三家請求格式、SSE 解析、停止 |

## 驗證

```bash
node scripts/check-ai-agent.mjs                     # 70 項：政策、差異、@ 範圍、迴圈各分支
cargo test --manifest-path packages/desktop/src-tauri/Cargo.toml --lib ai::
```

未涵蓋：真實提供者的串流與金鑰環存取（需要金鑰與實機），面板版面的目視檢查。
