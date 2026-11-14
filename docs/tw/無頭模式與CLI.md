# 無頭模式與命令列

桌面版除了視窗外，也可以完全不開視窗執行：給 CI、腳本與 AI 代理使用。
這一層與 MCP／REST 走**同一個工具 registry**（`packages/desktop/src/mcp/tools.ts`），
所以命令列能做的事與 API 完全一致。

## 用法

```
open-calcsheet-studio-tw [opdracht] [opties]
```

| 命令 | 作用 |
|---|---|
| （無參數） | 開啟視窗（原有行為） |
| `--version`、`-V`、`version` | 印出版本、edition、tag、commit、建置日期後結束 |
| `--help`、`-h`、`help` | 印出用法後結束 |
| `--headless`、`serve`、`--serve` | 不開視窗，只跑 API／MCP 伺服器（127.0.0.1:3879） |
| `eval <bestand>` | 計算一個 `.calc`／`.txt` 檔案，結果以 JSON 印到 stdout |
| `render <bestand> [--pdf <uit.pdf>]` | 把檔案渲染成 PDF |

選項：`--json`／`-j`（JSON 輸出，`eval` 預設即是）、`--quiet`／`-q`（只印結果）。
以 `-` 開頭但不認得的參數視為用法錯誤，會印出說明並以代碼 2 結束。

`--version`、`--help`、`eval`、`render` 都**不會開啟視窗**，也不會顯示任何 UI。

## 版本與 edition

版本資訊在**建置時**寫入執行檔（`packages/desktop/src-tauri/src/kenmerken.rs`），
所以即使不啟動 App 也讀得到：

```sh
open-calcsheet-studio-tw --version
# Open CalcSheet Studio 2026.46.1 (editie tw, tag 2026.46.1-tw.1, commit 1bec4a3, gebouwd 2026-11-14)
```

`edition` 由 `tauri.conf.json` 的 identifier 決定（`tw.` 開頭即 `tw`）。
同一台機器可以同時安裝上游版與台灣版，兩者的 `--version`、`app_info` 與
`GET /api/v1/health` 都會回報自己的 edition；port 衝突時，
其中一個必須改埠（見 `docs/api.md`）。

## eval

```sh
open-calcsheet-studio-tw eval berekening.calc
```

輸出為 `calc_evaluate` 的結果（每行的 name／expr／value／unit／si_value），
另加一個 `build` 欄位（`edition`／`tag`／`commit`），讓腳本知道是哪一個建置回答的。
輸入檔讀不到或計算失敗時，輸出為工具的錯誤物件，結束代碼為 1。

## render

```sh
open-calcsheet-studio-tw render berekening.calc --pdf uit.pdf
```

以 `sheet_add` 把檔案建成一張計算表，再以 `export_pdf` 產出 PDF，
需要報表引擎（`--features rapportengine` 建置，正式安裝檔即是）。
不加 `--pdf` 時只印出新表單的 JSON，不寫檔案。

## 與 API 的關係

無頭模式啟動後，API 與 MCP 的行為與開視窗時相同（同樣的 token、
同樣的唯讀／暫停設定）。差異只有一個：沒有視窗可看，所有互動都經由
HTTP 或命令列。
