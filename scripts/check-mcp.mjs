/**
 * Controlescript voor de MCP-server van de app (packages/desktop/src/mcp/).
 *
 * Toetst de TypeScript-kant zonder webview en zonder Tauri: de JSON-RPC-
 * afhandeling (initialize, tools/list, tools/call), de sessies en de tools
 * zelf, op een nagebouwde projectstore in het geheugen. De Rust-brug heeft
 * eigen tests (cargo test, src-tauri/src/mcp_bridge.rs).
 *
 *   koppeling        adres altijd 127.0.0.1, poortgrenzen, token van 64
 *                    hextekens, de client-configuratie (header achteraan)
 *   dispatcher       initialize, ping, notificaties, tools/list, onbekende
 *                    methode, onleesbare body
 *   schema           onbekende en ontbrekende argumenten, verkeerde soort
 *   pauze en         een gepauzeerde koppeling doet niets; alleen-lezen
 *   alleen-lezen     blokkeert mutaties, niet het lezen en doorrekenen
 *   tools            project_get, project_set_data, modules_list, sheet_add,
 *                    sheet_get, sheet_set_input, sheet_set_source,
 *                    sheet_rename, sheet_select, sheet_evaluate, sheet_remove,
 *                    calc_evaluate; elke mutatie via een store-actie
 *   sessies          initialize geeft een sessie; zonder sessie 400, met een
 *                    onbekende 404; een notificatie krijgt een leeg antwoord
 *
 * Node 24 laadt de .ts-bestanden rechtstreeks (typen worden weggestreept).
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 *
 * Draaien:  node scripts/check-mcp.mjs
 */
import { verwerkMcpBericht, controleerSchema } from "../packages/desktop/src/mcp/dispatcher.ts";
import { MCP_TOOLS, vergeetUitkomsten } from "../packages/desktop/src/mcp/tools.ts";
import { maakRequestHandler, maakSessies } from "../packages/desktop/src/mcp/requestHandler.ts";
import {
  MCP_STANDAARD_POORT,
  MCP_SERVERNAAM,
  claudeCodeCommando,
  clientConfiguratie,
  geldigePoort,
  mcpAdres,
  nieuwToken,
} from "../packages/desktop/src/mcp/koppeling.ts";
import { LEGE_WERKMAP } from "../packages/desktop/src/store/spreadsheetBlad.ts";
import { pakWerkmapIn, startNotebook } from "../packages/desktop/src/store/jupyterBlad.ts";
import { maakApp, maakContext, PROJECT_ID, RAPPORT_ID } from "./lib/mcpproef.mjs";

let fouten = 0;
let aantal = 0;
const meld = (ok, wat, detail = "") => {
  aantal++;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};
const gelijk = (a, b, wat) => meld(JSON.stringify(a) === JSON.stringify(b), wat, `${JSON.stringify(a)} tegen ${JSON.stringify(b)}`);

// Een projectstore in het geheugen (scripts/lib/mcpproef.mjs).
const app = maakApp();
const vlaggen = { alleenLezen: false, gepauzeerd: false };
const deps = {
  tools: MCP_TOOLS,
  serverInfo: { name: MCP_SERVERNAAM, version: "0.0.0-check" },
  context: () => maakContext(app.omgeving, vlaggen)(),
};

let volgnummer = 0;
/** Eén JSON-RPC-request door de dispatcher; geeft het geparste antwoord. */
async function rpc(method, params) {
  const body = await verwerkMcpBericht(JSON.stringify({ jsonrpc: "2.0", id: ++volgnummer, method, params }), deps);
  return JSON.parse(body);
}
/** tools/call; geeft {isError, data} met data = structuredContent. */
async function roep(naam, args = {}) {
  const r = await rpc("tools/call", { name: naam, arguments: args });
  if (r.error) return { rpcFout: r.error, isError: true, data: null };
  return { isError: r.result.isError, data: r.result.structuredContent, tekst: r.result.content?.[0]?.text };
}

// ── 1. Koppeling ──────────────────────────────────────────────────────────────
console.log("Koppeling:");
{
  gelijk(mcpAdres(3879), "http://127.0.0.1:3879/mcp", "adres is loopback met /mcp");
  meld(MCP_STANDAARD_POORT === 3879, "standaardpoort 3879");
  meld(geldigePoort(3879) && geldigePoort(65535) && geldigePoort(1024), "geldige poorten");
  meld(!geldigePoort(80) && !geldigePoort(70000) && !geldigePoort(3879.5) && !geldigePoort("3879"), "ongeldige poorten geweigerd");
  const t = nieuwToken();
  meld(/^[0-9a-f]{64}$/.test(t) && t !== nieuwToken(), "token: 64 hextekens, elke keer anders");
  const cmd = claudeCodeCommando(3879, "abc");
  meld(
    cmd.startsWith(`claude mcp add --transport http --scope user ${MCP_SERVERNAAM} http://127.0.0.1:3879/mcp`) &&
      cmd.endsWith(`--header "Authorization: Bearer abc"`),
    "opdrachtregel: naam en adres vóór de header",
    cmd,
  );
  const cfg = JSON.parse(clientConfiguratie(3879, "abc")).mcpServers[MCP_SERVERNAAM];
  gelijk(cfg, { type: "http", url: "http://127.0.0.1:3879/mcp", headers: { Authorization: "Bearer abc" } }, "JSON-configuratie");
}

// ── 2. Dispatcher ─────────────────────────────────────────────────────────────
console.log("Dispatcher:");
{
  const init = await rpc("initialize", { protocolVersion: "2025-03-26", capabilities: {}, clientInfo: { name: "check", version: "1" } });
  meld(init.result?.protocolVersion === "2025-03-26", "initialize echoot een bekende protocolversie");
  meld((await rpc("initialize", { protocolVersion: "1999-01-01" })).result?.protocolVersion === "2025-06-18", "onbekende versie → de eigen");
  gelijk(init.result?.serverInfo, { name: MCP_SERVERNAAM, version: "0.0.0-check" }, "serverInfo");
  meld(init.result?.capabilities?.tools !== undefined, "capabilities.tools");
  meld(typeof init.result?.instructions === "string" && init.result.instructions.includes("project_get"), "instructions noemen project_get");
  meld(init.result.instructions.includes("Taiwan") && init.result.instructions.includes("tw-*"), "instructions noemen de Taiwanese modules");
  gelijk(await verwerkMcpBericht(JSON.stringify({ jsonrpc: "2.0", method: "notifications/initialized" }), deps), "", "notificatie: geen antwoord");
  gelijk((await rpc("ping")).result, {}, "ping");
  const lijst = (await rpc("tools/list")).result.tools;
  const namen = lijst.map((t) => t.name);
  const verwacht = [
    "project_get", "project_set_data", "modules_list", "sheet_add", "sheet_get", "sheet_set_source",
    "sheet_set_input", "sheet_rename", "sheet_remove", "sheet_select", "sheet_evaluate", "calc_evaluate",
  ];
  meld(verwacht.every((n) => namen.includes(n)), "tools/list: de twaalf oorspronkelijke tools", verwacht.filter((n) => !namen.includes(n)).join());
  meld(namen.length === MCP_TOOLS.length && new Set(namen).size === namen.length, `tools/list: alle ${MCP_TOOLS.length} tools, elk één keer`);
  meld(lijst.every((t) => t.inputSchema?.type === "object" && typeof t.description === "string" && t.description.length > 20), "elke tool: objectschema en beschrijving");
  meld(lijst.every((t) => typeof t.annotations?.readOnlyHint === "boolean"), "elke tool: annotaties");
  meld((await rpc("bestaat/niet")).error?.code === -32601, "onbekende methode: -32601");
  meld(JSON.parse(await verwerkMcpBericht("{kapot", deps)).error?.code === -32700, "onleesbare body: -32700");
  meld(JSON.parse(await verwerkMcpBericht("[]", deps)).error?.code === -32600, "batch-array: -32600");
  meld((await rpc("tools/call", { name: "bestaat_niet", arguments: {} })).error?.code === -32602, "onbekende tool: -32602");
}

// ── 3. Schema ─────────────────────────────────────────────────────────────────
console.log("Schema:");
{
  const r1 = await roep("project_get", { onzin: 1 });
  meld(r1.isError && r1.data.code === "VALIDATION", "onbekend argument geweigerd", JSON.stringify(r1.data));
  const r2 = await roep("sheet_rename", { name: "x" });
  meld(r2.isError && r2.data.code === "VALIDATION" && /id is required/.test(r2.data.error), "ontbrekend verplicht argument", JSON.stringify(r2.data));
  const r3 = await roep("project_get", { evaluate: "ja" });
  meld(r3.isError && /boolean/.test(r3.data.error), "verkeerde soort", JSON.stringify(r3.data));
  meld(controleerSchema({ type: ["string", "number"] }, 3) === null && controleerSchema({ type: ["string", "number"] }, true) !== null, "samengestelde soort");
  meld(controleerSchema({ type: "integer", minimum: 1 }, 0) !== null && controleerSchema({ type: "integer" }, 1.5) !== null, "integer en minimum");
}

// ── 4. Tools ─────────────────────────────────────────────────────────────────
console.log("Tools:");
let liggerId = null;
{
  const p = await roep("project_get");
  meld(!p.isError && p.data.projectName === "Proefproject" && p.data.sheets.length === 0, "project_get: leeg project");
  const cc = p.data.projectData.find((v) => v.name === "CC");
  meld(cc && cc.type === "choice" && cc.value === "2" && cc.options.length === 3, "project_get: CC met keuzes", JSON.stringify(cc));
  meld(p.data.activeView === "project-data" && p.data.unsaved === false, "project_get: weergave en opgeslagen-stand");
  meld(typeof p.tekst === "string" && JSON.parse(p.tekst).projectName === "Proefproject", "resultaat ook als tekst");

  const m = await roep("modules_list");
  const ligger = m.data.modules.find((x) => x.templateId === "ligger");
  meld(ligger && ligger.available === true && ligger.kind === "module", "modules_list: ligger beschikbaar");
  meld(m.data.modules.some((x) => x.templateId === "balklaag" && x.status === "gereed"), "modules_list: balklaag met status");

  const s1 = await roep("project_set_data", { name: "CC", value: "CC3" });
  meld(!s1.isError && s1.data.value === "3" && app.s.gegevens.CC === "3", "project_set_data: label 'CC3' wordt waarde 3", JSON.stringify(s1.data));
  const s2 = await roep("project_set_data", { name: "CC", value: "7" });
  meld(s2.isError && s2.data.code === "VALIDATION" && s2.data.data.options.length === 3, "project_set_data: onbekende keuze geweigerd");
  const s3 = await roep("project_set_data", { name: "bestaat_niet", value: "1" });
  meld(s3.isError && s3.data.code === "VALIDATION", "project_set_data: alleen bestaande velden");
  const s4 = await roep("project_set_data", { name: "project_nummer", value: 2026 });
  meld(!s4.isError && app.s.gegevens.project_nummer === "2026", "project_set_data: tekstveld, getal wordt tekst");

  const a = await roep("sheet_add", { templateId: "ligger" });
  liggerId = a.data?.id;
  meld(!a.isError && a.data.name === "Beam 1" && app.s.activeId === liggerId, "sheet_add: module, korte naam in de taal van de app, geselecteerd", JSON.stringify(a.data?.name));
  meld(a.data.inputs.some((v) => v.name === "materiaal" && v.kind === "choice"), "sheet_add: geeft de invoervelden");
  meld((await roep("sheet_add", { templateId: "bestaat_niet" })).data.code === "NOT_FOUND", "sheet_add: onbekende module");
  meld((await roep("sheet_add", { templateId: "ligger", source: "x" })).data.code === "VALIDATION", "sheet_add: templateId en source niet samen");

  const g = await roep("sheet_get", { id: liggerId, evaluate: false });
  const mat = g.data.inputs.find((v) => v.name === "materiaal");
  meld(mat && mat.value === "1" && mat.isSet === false && mat.selectedText === "Hout", "sheet_get: keuzelijst met beginwaarde", JSON.stringify(mat));
  meld(typeof g.data.source === "string" && g.data.source.length > 1000 && g.data.result === undefined, "sheet_get: tekst, zonder uitkomst bij evaluate=false");

  // veldlabels: toelichting achter het vraagteken, anders de naam zelf
  const twAdd = await roep("sheet_add", { source: "H_wall = ?{5.0}', 擋土牆總高度 H（m）'\nB = ?{2} m\nx = H_wall * 1" });
  const twGet = await roep("sheet_get", { id: twAdd.data.id, evaluate: false });
  const hw = twGet.data.inputs.find((v) => v.name === "H_wall");
  meld(hw && typeof hw.label === "string" && hw.label.includes("擋土牆總高度"), "sheet_get: label uit de toelichting", JSON.stringify(hw));
  meld(twGet.data.inputs.find((v) => v.name === "B")?.label === "B", "sheet_get: zonder toelichting is het label de naam");
  await roep("sheet_remove", { id: twAdd.data.id });
  await roep("sheet_select", { id: liggerId });

  const zonderId = await roep("sheet_get", { evaluate: false });
  meld(zonderId.data?.id === liggerId, "sheet_get zonder id: het open blad");

  const i1 = await roep("sheet_set_input", { id: liggerId, name: "materiaal", value: "Staal" });
  meld(!i1.isError && app.s.exemplaren[0].waarden.materiaal === "2", "sheet_set_input: keuze op tekst", JSON.stringify(i1.data));
  const i2 = await roep("sheet_set_input", { id: liggerId, name: "materiaal", value: "Beton" });
  meld(i2.isError && i2.data.code === "VALIDATION" && i2.data.data.options.length === 2, "sheet_set_input: onbekende keuze geweigerd");
  const i3 = await roep("sheet_set_input", { id: liggerId, values: { materiaal: "1", bestaat_niet: "3" } });
  meld(i3.isError && app.s.exemplaren[0].waarden.materiaal === "2", "sheet_set_input: één fout veld ⇒ niets geschreven");
  meld((await roep("sheet_set_input", { id: liggerId })).isError, "sheet_set_input: zonder waarden geweigerd");
  meld((await roep("sheet_set_input", { id: "ex-999", name: "a", value: 1 })).data.code === "NOT_FOUND", "sheet_set_input: onbekend blad");

  const e = await roep("sheet_evaluate", { id: liggerId });
  meld(!e.isError && typeof e.data.title === "string" && e.data.title.length > 0, "sheet_evaluate: titel", JSON.stringify(e.data?.title ?? e.data));
  meld(e.data && "uc" in e.data && "passes" in e.data && typeof e.data.numbers === "object", "sheet_evaluate: uc, oordeel en getallen");
  const [eerste, eersteWaarde] = Object.entries(e.data.numbers)[0] ?? [];
  const e2 = await roep("sheet_evaluate", { id: liggerId, names: [eerste, "bestaat_niet"] });
  gelijk(Object.keys(e2.data.numbers ?? {}), [eerste, "bestaat_niet"], "sheet_evaluate: alleen de gevraagde getallen");
  meld(eerste !== undefined && e2.data.numbers[eerste] === eersteWaarde && e2.data.numbers.bestaat_niet === null, "sheet_evaluate: waarde en null", JSON.stringify(e2.data.numbers));

  const p2 = await roep("project_get");
  const blad = p2.data.sheets.find((x) => x.id === liggerId);
  meld(blad.evaluated === true && blad.uc === e.data.uc && blad.module === "Beam (timber or steel)", "project_get: uitkomst bekend na sheet_evaluate", JSON.stringify(blad));
  await roep("sheet_set_input", { id: liggerId, name: "materiaal", value: "1" });
  const blad2 = (await roep("project_get")).data.sheets.find((x) => x.id === liggerId);
  meld(blad2.evaluated === false && blad2.uc === null, "project_get: andere invoer ⇒ uitkomst niet meer bekend");
  const blad3 = (await roep("project_get", { evaluate: true })).data.sheets.find((x) => x.id === liggerId);
  meld(blad3.evaluated === true, "project_get evaluate=true rekent alles door");

  const leeg = await roep("sheet_add", { name: "Eigen blad", source: '"Eigen\na = ? mm\nb = 2*a' });
  const eigenId = leeg.data.id;
  meld(!leeg.isError && leeg.data.name === "Eigen blad" && leeg.data.templateId === "leeg", "sheet_add: leeg blad met eigen naam en tekst", JSON.stringify(leeg.data));
  meld(leeg.data.inputs.length === 1 && leeg.data.inputs[0].name === "a" && leeg.data.inputs[0].unit === "mm", "sheet_add: invoerveld uit eigen tekst");
  const bron = await roep("sheet_set_source", { id: eigenId, source: '"Eigen\na = ? mm\nc = ? kN\nb = 2*a' });
  meld(!bron.isError && bron.data.inputs.map((v) => v.name).join() === "a,c", "sheet_set_source: nieuwe invoervelden");
  await roep("sheet_set_input", { id: eigenId, name: "a", value: 21 });
  const ev = await roep("sheet_evaluate", { id: eigenId, names: ["b"] });
  meld(ev.data.numbers?.b === 42, "sheet_evaluate: rekent met de gezette invoer", JSON.stringify(ev.data));
  meld((await roep("sheet_rename", { id: eigenId, name: "  Nieuw  " })).data.name === "Nieuw" && app.s.exemplaren[1].naam === "Nieuw", "sheet_rename");
  meld(!(await roep("sheet_select", { id: "project" })).isError && app.s.activeId === PROJECT_ID, "sheet_select: projectgegevens");
  meld(!(await roep("sheet_select", { id: "report" })).isError && app.s.activeId === RAPPORT_ID, "sheet_select: rapport");
  meld(!(await roep("sheet_select", { id: eigenId })).isError && app.s.activeId === eigenId, "sheet_select: blad");
  meld((await roep("sheet_select", { id: "ex-999" })).data.code === "NOT_FOUND", "sheet_select: onbekend blad");
  const kapot = await roep("sheet_set_source", { id: eigenId, source: '"Kapot\n#if\n' });
  meld(!kapot.isError, "sheet_set_source: ook een tekst met fouten komt erin");
  const weg = await roep("sheet_remove", { id: eigenId });
  meld(!weg.isError && app.s.exemplaren.length === 1 && weg.data.remainingSheets === 1, "sheet_remove");

  const toegestaan = new Set([
    "voegToe", "hernoem", "verwijder", "selecteer", "zetBron", "zetWaarde", "zetGegeven", "zetProjectNaam",
    "voegSpreadsheetToe", "zetSpreadsheet", "voegMarkdownToe", "zetMarkdown", "voegCanvasToe",
    "voegGraafToe", "zetGraaf", "voegTekenbladToe", "zetTekenVel", "voegJupyterToe", "zetJupyter",
    "voegMarimoToe", "zetMarimo",
  ]);
  meld(app.acties.length > 0 && app.acties.every((a) => toegestaan.has(a)), "elke mutatie liep via een store-actie", app.acties.join());
}

// ── 4b. 其他表單種類 ─────────────────────────────────────────────────────────
console.log("其他表單種類:");
{
  // Markdown
  const md = await roep("sheet_add", { kind: "markdown", name: "說明", text: "# 標題\n\n內文" });
  meld(!md.isError && md.data.kind === "markdown" && md.data.name === "說明", "sheet_add: markdown", JSON.stringify(md.data));
  const mdGet = await roep("sheet_get", { id: md.data.id, evaluate: false });
  meld(mdGet.data.markdown?.text === "# 標題\n\n內文" && mdGet.data.kind === "markdown", "sheet_get: markdown 全文", JSON.stringify(mdGet.data.markdown));
  const mdSet = await roep("sheet_set_markdown", { id: md.data.id, text: "## 新標題", headingsInToc: true });
  meld(!mdSet.isError && mdSet.data.characters === 6 && mdSet.data.headingsInToc === true, "sheet_set_markdown: 換文並保留目錄設定", JSON.stringify(mdSet.data));
  meld((await roep("sheet_set_markdown", { id: md.data.id })).data.code === "VALIDATION", "sheet_set_markdown: 缺 text 被拒");
  meld((await roep("sheet_set_markdown", { id: liggerId, text: "x" })).data.code === "VALIDATION", "sheet_set_markdown: 非 markdown 表被拒");

  // 圖表
  const gr = await roep("sheet_add", { kind: "graph", name: "節點圖" });
  meld(!gr.isError && gr.data.kind === "graph", "sheet_add: graph", JSON.stringify(gr.data));
  const grSet = await roep("sheet_set_graph", { id: gr.data.id, graph: { versie: 1, nodes: [{ id: "n1", soort: "getal", x: 10, y: 20, invoer: { waarde: "2" } }], verbindingen: [] } });
  meld(!grSet.isError && grSet.data.nodes === 1, "sheet_set_graph: 寫入節點", JSON.stringify(grSet.data));
  meld((await roep("sheet_set_graph", { id: gr.data.id, graph: { nodes: "x" } })).data.code === "VALIDATION", "sheet_set_graph: 形狀錯誤被拒");

  // 繪圖
  const dr = await roep("sheet_add", { kind: "drawing", name: "繪圖", paper: "A4", orientation: "staand" });
  meld(!dr.isError && dr.data.kind === "drawing" && dr.data.paper === "A4" && dr.data.orientation === "staand", "sheet_add: drawing 與紙張", JSON.stringify(dr.data));
  const drGet = await roep("sheet_get", { id: dr.data.id, evaluate: false });
  meld(drGet.data.drawing?.paper === "A4" && Array.isArray(drGet.data.drawing.views), "sheet_get: drawing 摘要", JSON.stringify(drGet.data.drawing));
  const drSet = await roep("sheet_set_drawing", { id: dr.data.id, paper: "A3" });
  meld(!drSet.isError && drSet.data.paper === "A3" && drSet.data.orientation === "staand", "sheet_set_drawing: 只改紙張", JSON.stringify(drSet.data));
  meld((await roep("sheet_set_drawing", { id: dr.data.id, paper: "A9" })).data.code === "VALIDATION", "sheet_set_drawing: 未知紙張被拒");
  meld((await roep("sheet_set_drawing", { id: dr.data.id })).data.code === "VALIDATION", "sheet_set_drawing: 沒給任何變更被拒");

  // 試算表
  const ss = await roep("sheet_add", { kind: "spreadsheet", name: "工作簿", base64: LEGE_WERKMAP, fileName: "leeg.xlsx" });
  meld(!ss.isError && ss.data.kind === "spreadsheet" && ss.data.bytes > 0, "sheet_add: spreadsheet（空活頁簿）", JSON.stringify(ss.data));
  const ssGet = await roep("sheet_get", { id: ss.data.id, evaluate: false });
  meld(ssGet.data.spreadsheet?.fileName === "leeg.xlsx" && ssGet.data.spreadsheet.bytes > 0, "sheet_get: spreadsheet 檔名與大小", JSON.stringify(ssGet.data.spreadsheet));
  meld((await roep("sheet_set_spreadsheet", { id: ss.data.id, base64: Buffer.from("geen zip").toString("base64") })).data.code === "VALIDATION", "sheet_set_spreadsheet: 非 XLSX 被拒");
  meld((await roep("sheet_set_spreadsheet", { id: ss.data.id, base64: LEGE_WERKMAP })).data.fileName === "leeg.xlsx", "sheet_set_spreadsheet: 沒有檔名時保留原名");

  // Jupyter
  const werkmap = pakWerkmapIn([{ pad: "notebook.ipynb", bytes: startNotebook({ kop: "Proef", uitleg: "x", titel: "Proef" }) }]);
  const jp = await roep("sheet_add", { kind: "jupyter", name: "筆記本", base64: Buffer.from(werkmap).toString("base64"), fileName: "proef.zip", withCode: false });
  meld(!jp.isError && jp.data.kind === "jupyter" && jp.data.files === 1, "sheet_add: jupyter（ZIP 工作資料夾）", JSON.stringify(jp.data));
  const jpGet = await roep("sheet_get", { id: jp.data.id, evaluate: false });
  meld(jpGet.data.jupyter?.fileName === "proef.zip" && jpGet.data.jupyter.files.includes("notebook.ipynb") && jpGet.data.jupyter.withCode === false, "sheet_get: jupyter 檔名、檔案清單與設定", JSON.stringify(jpGet.data.jupyter));
  meld((await roep("sheet_set_jupyter", { id: jp.data.id, base64: Buffer.from("geen zip").toString("base64") })).data.code === "VALIDATION", "sheet_set_jupyter: 非 ZIP 被拒");

  // Marimo
  const code = "import marimo\n\napp = marimo.App()\n\n@app.cell\ndef _():\n    import marimo as mo\n    return mo,\n";
  const mr = await roep("sheet_add", { kind: "marimo", name: "反應式筆記本", code, fileName: "proef.py" });
  meld(!mr.isError && mr.data.kind === "marimo" && mr.data.cells >= 1, "sheet_add: marimo 與儲存格數", JSON.stringify(mr.data));
  const mrGet = await roep("sheet_get", { id: mr.data.id, evaluate: false, full: true });
  meld(mrGet.data.marimo?.fileName === "proef.py" && mrGet.data.marimo.code === code && Array.isArray(mrGet.data.marimo.output), "sheet_get full: marimo 程式碼與輸出", JSON.stringify(mrGet.data.marimo?.cells));
  meld((await roep("sheet_set_marimo", { id: mr.data.id, code: "# geen notebook" })).data.code === "VALIDATION", "sheet_set_marimo: 非 Marimo 程式碼被拒");
  meld((await roep("sheet_set_marimo", { id: mr.data.id, code: code, withCode: false })).data.outputCleared === true, "sheet_set_marimo: 舊輸出被清掉");

  // 收尾
  for (const id of [md.data.id, gr.data.id, dr.data.id, ss.data.id, jp.data.id, mr.data.id]) await roep("sheet_remove", { id });
}

// ── 5. calc_evaluate ─────────────────────────────────────────────────────────
console.log("calc_evaluate:");
{
  const voorAantal = app.acties.length;
  const tekst = [
    '"Proefblad — NEN-EN 1990',
    "'Een losse berekening.",
    "L = ? m",
    "@select soort \"Soort\"",
    "  Licht = 1",
    "  Zwaar = 2",
    "@end",
    "q = 2*soort",
    "M = q*L^2/8",
    "f = K_FI*M",
    "UC_max = M/(5 m^2)",
  ].join("\n");
  const r = await roep("calc_evaluate", { source: tekst, values: { L: 4, soort: "2" } });
  meld(!r.isError, "calc_evaluate: rekent", JSON.stringify(r.data));
  const regels = r.data.lines;
  const M = regels.find((x) => x.name === "M");
  // q = 2·soort = 4, M = 4·4²/8 = 8 m², in de eenheid van L.
  meld(M && M.type === "assignment" && M.value === 8 && M.unit === "m^2", "toekenning met waarde en eenheid", JSON.stringify(M));
  meld(regels.some((x) => x.type === "input" && x.name === "L" && x.value === "4"), "invoerregel met de gegeven waarde");
  meld(regels.some((x) => x.type === "select" && x.name === "soort" && x.selected === "2"), "keuzelijst met de gekozen waarde");
  meld(regels[0].type === "heading" && r.data.title === "Proefblad" && r.data.norm === "NEN-EN 1990", "kop, titel en norm", JSON.stringify(regels[0]));
  meld(r.data.uc === 1.6 && r.data.passes === false, "UC_max en oordeel (zonder slotzin beslist de UC)", `${r.data.uc} ${r.data.passes}`);
  const f = regels.find((x) => x.name === "f");
  meld(f && Math.abs(f.value - 8 * 1.1) < 1e-9, "projectgegevens in de scope (CC3 ⇒ K_FI = 1,1)", JSON.stringify(f));
  const zonder = await roep("calc_evaluate", { source: "f = K_FI*2", useProjectData: false });
  meld(!zonder.isError && zonder.data.errorLines === 1, "useProjectData=false: K_FI onbekend", JSON.stringify(zonder.data));
  const kort = await roep("calc_evaluate", { source: tekst, maxLines: 2 });
  meld(kort.data.lines.length === 2 && kort.data.truncated === true, "maxLines kapt af");
  meld(app.acties.length === voorAantal, "calc_evaluate wijzigt het project niet");
}

// ── 6. Pauze en alleen-lezen ─────────────────────────────────────────────────
console.log("Pauze en alleen-lezen:");
{
  vlaggen.alleenLezen = true;
  const voor = app.acties.length;
  const a = await roep("sheet_add", { templateId: "ligger" });
  meld(a.isError && a.data.code === "READ_ONLY", "alleen-lezen: sheet_add geweigerd");
  meld((await roep("sheet_set_input", { id: liggerId, name: "materiaal", value: "2" })).data.code === "READ_ONLY", "alleen-lezen: sheet_set_input geweigerd");
  meld(!(await roep("project_get")).isError && !(await roep("sheet_evaluate", { id: liggerId, numbers: false })).isError, "alleen-lezen: lezen en doorrekenen mag");
  meld(!(await roep("sheet_select", { id: "project" })).isError, "alleen-lezen: selecteren mag (wijzigt het project niet)");
  meld(app.acties.length === voor + 1, "alleen-lezen: geen andere store-actie");
  vlaggen.alleenLezen = false;
  vlaggen.gepauzeerd = true;
  const p = await roep("project_get");
  meld(p.isError && p.data.code === "PAUSED", "gepauzeerd: ook lezen geeft een melding");
  meld(!(await rpc("tools/list")).error, "gepauzeerd: tools/list blijft werken");
  vlaggen.gepauzeerd = false;
}

// ── 7. Sessies ───────────────────────────────────────────────────────────────
console.log("Sessies:");
{
  vergeetUitkomsten();
  const antwoorden = [];
  const handler = maakRequestHandler({
    emit: (event, payload) => {
      antwoorden.push({ event, ...payload });
    },
    verwerk: (body) => verwerkMcpBericht(body, deps),
    sessies: maakSessies(() => `sessie-${antwoorden.length}`),
  });
  const stuur = async (id, bericht, sessionId) => {
    await handler({ id, body: JSON.stringify({ jsonrpc: "2.0", ...bericht }), ...(sessionId !== undefined ? { sessionId } : {}) });
    return antwoorden.find((a) => a.id === id);
  };
  const init = await stuur(1, { id: 1, method: "initialize", params: { protocolVersion: "2025-06-18" } });
  meld(init.event === "mcp://response" && typeof init.sessionId === "string" && init.status === undefined, "initialize: sessie-id terug", JSON.stringify(init));
  const zonder = await stuur(2, { id: 2, method: "tools/list" });
  meld(zonder.status === 400 && JSON.parse(zonder.body).error.code === -32600, "zonder sessie: 400 met JSON-RPC-fout");
  const onbekend = await stuur(3, { id: 3, method: "tools/list" }, "verzonnen");
  meld(onbekend.status === 404 && onbekend.body === "", "onbekende sessie: 404 zonder body");
  const goed = await stuur(4, { id: 4, method: "tools/call", params: { name: "project_get", arguments: {} } }, init.sessionId);
  meld(goed.status === undefined && JSON.parse(goed.body).result.structuredContent.projectName === "Proefproject", "met sessie: project_get");
  const notificatie = await stuur(5, { method: "notifications/initialized" }, init.sessionId);
  meld(notificatie && notificatie.body === "" && notificatie.status === undefined, "notificatie: leeg antwoord, wel verstuurd");
  const sessies = maakSessies(() => `s${Math.random()}`, 2);
  const eerste = sessies.open();
  sessies.open();
  sessies.open();
  meld(sessies.size() === 2 && !sessies.has(eerste), "boven het maximum verdwijnt de oudste sessie");
}

console.log(`\n${aantal - fouten} van ${aantal} controles goed.`);
process.exit(fouten === 0 ? 0 : 1);
