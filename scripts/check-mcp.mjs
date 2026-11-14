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
import { pakWerkmapIn, pakWerkmapUit, startNotebook } from "../packages/desktop/src/store/jupyterBlad.ts";
import { zetWerkmapKern } from "../packages/desktop/src/mcp/bladInhoud.ts";
import { readFileSync as leesBestand } from "node:fs";
import { fileURLToPath as naarPad } from "node:url";
import { maakApp, maakContext, PROJECT_ID, RAPPORT_ID } from "./lib/mcpproef.mjs";
import { laadTemplate } from "./lib/refcheck.mjs";
import { markdownVerwijzingen, rekenTekstVerwijzingen, tekstVerwijzingen, vulMarkdownIn, vulTekstIn } from "../packages/desktop/src/rekenen/tekstInvulling.ts";
import { vulIn, vervangVerwijzingenInTekst } from "../packages/desktop/src/rapport/invullen.ts";
import { bouwProjectBestand, leesProjectBestand, PROJECT_FORMAAT_VERSIE } from "../packages/desktop/src/store/projectBestand.ts";
import { bladenVoorIfc } from "../packages/desktop/src/store/projectIfcx.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import { gelijkeInvoer, isGewijzigd, opgeleverd } from "../packages/desktop/src/store/ontwerpInvoer.ts";
import { regels } from "../packages/desktop/src/mcp/rekenen.ts";

let fouten = 0;
let aantal = 0;
const meld = (ok, wat, detail = "") => {
  aantal++;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};
const gelijk = (a, b, wat) => meld(JSON.stringify(a) === JSON.stringify(b), wat, `${JSON.stringify(a)} tegen ${JSON.stringify(b)}`);

// Een projectstore in het geheugen (scripts/lib/mcpproef.mjs).
const app = maakApp({ sjablonen: { ligger: laadTemplate("ligger.ts"), "tw-rc-beam": laadTemplate("tw-rc-beam.ts") } });
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
    "module_schema", "sheet_read", "sheet_run", "sheet_drawing", "sheet_reset_input", "calc_evaluate_batch", "job_start", "job_status", "job_cancel",
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
// ── 4c. 拋棄式工作階段（session_new／session_close）────────────────────────
console.log("拋棄式工作階段:");
{
  // Een tekstveld wijzigen maakt het project "niet opgeslagen" zonder de rekengegevens te raken.
  await roep("project_set_data", { name: "locatie", value: "Proeflocatie" });
  const voor = { naam: app.s.projectNaam, aantal: app.s.exemplaren.length, dirty: app.s.dirty, locatie: app.s.gegevens.locatie };
  meld(voor.dirty === true, "vooraf: het project heeft niet-opgeslagen wijzigingen");

  const zonderForce = await roep("session_new");
  meld(zonderForce.isError && zonderForce.data.code === "CONFLICT", "session_new: niet-opgeslagen wijzigingen geweigerd", JSON.stringify(zonderForce.data));

  const open = await roep("session_new", { force: true });
  meld(!open.isError && open.data.session === true && open.data.sheets === 0, "session_new: leeg werkblad", JSON.stringify(open.data));
  meld(app.s.exemplaren.length === 0 && app.s.dirty === false && app.s.bestandspad === null, "session_new: leeg project, niets openstaand");

  const tweeKeer = await roep("session_new", { force: true });
  meld(tweeKeer.isError && tweeKeer.data.code === "CONFLICT", "session_new: tweede werkblad geweigerd");

  const toegevoegd = await roep("sheet_add", { templateId: "ligger" });
  meld(!toegevoegd.isError && app.s.exemplaren.length === 1, "in het werkblad: sheet_add werkt");
  const gerekend = await roep("sheet_evaluate", { id: toegevoegd.data.id });
  meld(!gerekend.isError, "in het werkblad: sheet_evaluate werkt");

  const dicht = await roep("session_close");
  meld(!dicht.isError && dicht.data.session === false, "session_close: werkblad dicht", JSON.stringify(dicht.data));
  meld(
    app.s.projectNaam === voor.naam && app.s.exemplaren.length === voor.aantal && app.s.gegevens.locatie === voor.locatie,
    "session_close: het oude project staat er weer",
    `${app.s.projectNaam}／${app.s.exemplaren.length}／${app.s.gegevens.locatie}`,
  );
  meld(app.s.dirty === voor.dirty, "session_close: de vlag niet-opgeslagen blijft zoals hij was");
  meld(!app.s.exemplaren.some((e) => e.id === toegevoegd.data.id), "session_close: het blad uit het werkblad is weg");

  const nogEens = await roep("session_close");
  meld(nogEens.isError && nogEens.data.code === "CONFLICT", "session_close: zonder werkblad geweigerd");

  const viaNew = await roep("project_new", { scratch: true, force: true });
  meld(!viaNew.isError && viaNew.data.session === true, "project_new met scratch=true opent hetzelfde werkblad", JSON.stringify(viaNew.data));
  meld(app.s.exemplaren.length === 0, "project_new scratch: leeg werkblad");
  await roep("session_close");
  meld(app.s.exemplaren.length === voor.aantal, "project_new scratch: session_close zet het project terug");
}

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

// ── 5b. Eenheidswaarschuwingen en gestructureerde regels (P1-6, P1-7) ───────
console.log("Eenheidswaarschuwingen en gestructureerde regels:");
{
  // m^(2/3): de dimensie van V is geen hele macht van een basiseenheid.
  const bron = [
    `"Proef — eenheid",`,
    "R = 0.25 m",
    "V = (1/0.013)*R^(2/3)*(0.001)^(1/2)",
    "sigma = 0.5 kN/mm^2",
    "M = 12 kN*m', 彎矩（rc112 22.2）" + "'",
    "UC_max = 1.6",
  ].join("\n");
  const r = await roep("calc_evaluate", { source: bron, conventionalUnits: true });
  meld(!r.isError, "rekent met een gebroken exponent", JSON.stringify(r.data).slice(0, 200));
  const w = r.data.warnings;
  meld(Array.isArray(w) && w.length === 1, "warnings[]: één waarschuwing", JSON.stringify(w));
  meld(
    w[0]?.code === "UNIT_FRACTIONAL_EXPONENT" && w[0]?.line === 3 && w[0]?.name === "V",
    "warnings[]: code, regel en naam",
    JSON.stringify(w[0]),
  );
  const V = r.data.lines.find((x) => x.name === "V");
  meld(V && V.expr === "(1/0.013)*R^(2/3)*(0.001)^(1/2)" && V.expression === V.expr, "regel: expr naast expression", JSON.stringify(V));
  meld(V && typeof V.si_value === "number" && typeof V.si_unit === "string", "regel: si_value en si_unit", `${V?.si_value} ${V?.si_unit}`);
  const sigma = r.data.lines.find((x) => x.name === "sigma");
  meld(
    sigma?.unit === "kN / mm^2" && sigma?.conventional?.value === 500 && sigma?.conventional?.unit === "MPa",
    "conventionalUnits: kN/mm^2 → MPa",
    JSON.stringify(sigma),
  );
  const M = r.data.lines.find((x) => x.name === "M");
  meld(M?.clause === "rc112 22.2", "regel: clause uit de norm op die regel", JSON.stringify(M));
  meld(M?.check === "unchecked", "regel zonder UC: check = unchecked");
  const ucm = r.data.lines.find((x) => x.name === "UC_max");
  meld(ucm?.uc === 1.6 && ucm?.check === "fail", "UC-regel: uc en check = fail", JSON.stringify(ucm));
  meld(r.data.check === "fail" && r.data.uc === 1.6, "samenvatting: check volgt het oordeel", JSON.stringify({ check: r.data.check, uc: r.data.uc }));

  const streng = await roep("calc_evaluate", { source: bron, strict: true });
  meld(streng.isError && streng.data.code === "UNIT_WARNING", "strict: gebroken exponent is een fout", JSON.stringify(streng.data));
  meld(Array.isArray(streng.data.data?.warnings) && streng.data.data.warnings.length === 1, "strict: de waarschuwing gaat mee");
  const schoon = await roep("calc_evaluate", { source: "a = 2 m\nb = 3*a", strict: true });
  meld(!schoon.isError, "strict: zonder waarschuwing gewoon rekenen", JSON.stringify(schoon.data));
}

// ── 5c. sheet_evaluate met regels en waarschuwingen ─────────────────────────
console.log("sheet_evaluate: regels en waarschuwingen:");
{
  const zonder = await roep("sheet_evaluate", { id: liggerId, numbers: false });
  meld(Array.isArray(zonder.data.warnings), "sheet_evaluate: warnings[] ook zonder regels", JSON.stringify(zonder.data.warnings));
  const met = await roep("sheet_evaluate", { id: liggerId, numbers: false, lines: true });
  meld(Array.isArray(met.data.lines) && met.data.lines.length > 0, "sheet_evaluate: lines=true geeft de regels", `${met.data.lines?.length}`);
  meld(typeof met.data.uncheckedLines === "number", "sheet_evaluate: aantal unchecked-regels", `${met.data.uncheckedLines}`);
  meld(
    met.data.lines.some((x) => x.type === "assignment" && typeof x.expr === "string"),
    "sheet_evaluate: elke toekenning heeft expr",
  );
}

// ── 5d. module_schema (P1-8) ────────────────────────────────────────────────
console.log("module_schema:");
{
  const r = await roep("module_schema", { templateId: "tw-rc-beam" });
  meld(!r.isError, "module_schema: leest een module", JSON.stringify(r.data).slice(0, 180));
  const d = r.data;
  meld(d.templateId === "tw-rc-beam" && typeof d.name === "string" && d.name.length > 0, "module_schema: id en naam");
  meld(Array.isArray(d.inputs) && d.inputs.length >= 5, "module_schema: invoervelden", `${d.inputs?.length}`);
  const veld = d.inputs.find((v) => v.name === "b_t") ?? d.inputs[0];
  meld(veld && typeof veld.name === "string" && typeof veld.kind === "string" && "default" in veld, "module_schema: naam, soort en standaardwaarde", JSON.stringify(veld));
  meld(!("value" in veld) && !("isSet" in veld), "module_schema: geen waarde of ingesteld-vlag (dat is een blad, geen module)");
  meld(d.inputs.some((v) => v.kind === "choice" && Array.isArray(v.options) && v.options.length > 0), "module_schema: keuzelijst met opties");
  meld(d.inputs.some((v) => typeof v.unit === "string" && v.unit.length > 0), "module_schema: eenheid per veld");
  meld(Array.isArray(d.norms) && d.norms.includes("rc112"), "module_schema: de normen van de tekst", JSON.stringify(d.norms));
  meld(Array.isArray(d.clauses) && d.clauses.length >= 5 && d.clauses.every((c) => /^[a-z_]+\d*\s/.test(c)), "module_schema: de artikelen", `${d.clauses?.length}`);
  meld(d.clauses.includes("rc112 22.2"), "module_schema: een bekend artikel uit de tekst", JSON.stringify(d.clauses?.slice(0, 4)));
  meld(d.guards && typeof d.guards === "object" && Object.keys(d.guards).length > 0, "module_schema: de vergelijkende regels per veld", JSON.stringify(Object.keys(d.guards ?? {})).slice(0, 120));

  const onbekend = await roep("module_schema", { templateId: "bestaat-niet" });
  meld(onbekend.isError && onbekend.data.code === "NOT_FOUND", "module_schema: onbekende module geweigerd", JSON.stringify(onbekend.data));
}

// ── 5e. Begrensde lussen (P1-9) en batch/jobs (P1-10) ───────────────────────
console.log("Lussen, batch en jobs:");
{
  const nietKlaar = ["x = 0", "#while x < 50 max=10", "x = x + 1", "#loop"].join("\n");
  const r = await roep("calc_evaluate", { source: nietKlaar, useProjectData: false });
  const n = r.data?.notConverged ?? [];
  meld(!r.isError && n.length === 1 && n[0].code === "NOT_CONVERGED" && n[0].iterations === 10 && n[0].condition === "x < 50",
    "#while max=: NOT_CONVERGED met aantal rondes en voorwaarde", JSON.stringify(n));
  meld(r.data?.check === "unchecked", "niet geconvergeerd: oordeel unchecked");
  const regel = (r.data?.lines ?? []).find((l) => l.code === "NOT_CONVERGED");
  meld(regel?.type === "text" && typeof regel.error === "string" && r.data.errorLines >= 1, "de regel zelf draagt de fout");
  const klaar = ["x = 0", "#while x < 5 max=5", "x = x + 1", "#loop"].join("\n");
  const k = await roep("calc_evaluate", { source: klaar, useProjectData: false });
  meld((k.data?.notConverged ?? []).length === 0 && k.data.lines.filter((l) => l.name === "x").at(-1)?.value === 5,
    "#while max=: precies op de grens klaar is geen fout");
  const oud = ["x = 0", "#while x < 50", "x = x + 1", "#loop"].join("\n");
  const o = await roep("calc_evaluate", { source: oud, useProjectData: false });
  meld((o.data?.notConverged ?? []).length === 0 && o.data.lines.filter((l) => l.name === "x").at(-1)?.value === 50,
    "#while zonder max: gedrag ongewijzigd");
  const wortel = ["x = 1", "#iterate x tol=1e-12 max=50", "x = (x + 2/x)/2", "#loop"].join("\n");
  const w = await roep("calc_evaluate", { source: wortel, useProjectData: false });
  const xw = w.data?.lines.filter((l) => l.name === "x").at(-1)?.value;
  meld((w.data?.notConverged ?? []).length === 0 && Math.abs(xw - Math.SQRT2) < 1e-12, "#iterate: Newton voor √2 convergeert", String(xw));
  const kort = ["x = 1", "#iterate x tol=1e-12 max=3", "x = (x + 2/x)/2", "#loop"].join("\n");
  const kn = (await roep("calc_evaluate", { source: kort, useProjectData: false })).data?.notConverged ?? [];
  meld(kn.length === 1 && kn[0].name === "x" && kn[0].iterations === 3 && kn[0].tol === 1e-12 && kn[0].residual > 1e-3,
    "#iterate max=3: NOT_CONVERGED met residu en tolerantie", JSON.stringify(kn));
  const eenheid = ["L = 1 m", "#iterate L tol=0.001", "L = (L + 2 m^2/L)/2", "#loop"].join("\n");
  const e = await roep("calc_evaluate", { source: eenheid, useProjectData: false });
  const L = e.data?.lines.filter((l) => l.name === "L").at(-1);
  meld((e.data?.notConverged ?? []).length === 0 && L?.unit === "m" && Math.abs(L.value - Math.SQRT2) < 1e-3, "#iterate met eenheid");

  // Batch: zelfde antwoord als calc_evaluate, fouten per item.
  const items = [
    { source: "a = 2\nb = a*3", useProjectData: false },
    { source: "c = onbekend + 1", useProjectData: false },
    { source: nietKlaar, useProjectData: false },
  ];
  const b = await roep("calc_evaluate_batch", { items });
  meld(!b.isError && b.data?.total === 3 && b.data.results.length === 3 && b.data.results.every((x, i) => x.index === i), "batch: drie antwoorden op volgorde");
  const los = await roep("calc_evaluate", items[0]);
  gelijk(b.data?.results[0].lines, los.data?.lines, "batch item 0 = calc_evaluate");
  meld(b.data?.results[2].notConverged?.[0]?.code === "NOT_CONVERGED", "batch: NOT_CONVERGED komt mee");
  const bs = await roep("calc_evaluate_batch", { items: [{ source: "s = 0.5 kN/mm^2\nR = 0.25 m\nV = R^(2/3)", strict: true }] });
  meld(bs.data?.results[0].ok === false && bs.data.results[0].error.code === "UNIT_WARNING" && bs.data.failed === 1, "batch: fout per item (strict → UNIT_WARNING)");
  meld((await roep("calc_evaluate_batch", { items: [{ waarden: 1 }] })).isError, "batch: item zonder source geweigerd");

  // Jobs: start geeft meteen terug, status volgt, annuleren stopt.
  const st = await roep("job_start", { items });
  meld(!st.isError && typeof st.data?.jobId === "string" && st.data.state === "running" && st.data.total === 3, "job_start: jobId, running");
  let status = null;
  for (let i = 0; i < 50; i++) {
    status = (await roep("job_status", { jobId: st.data.jobId })).data;
    if (status?.state !== "running") break;
    await new Promise((k) => setTimeout(k, 5));
  }
  meld(status?.state === "done" && status.done === 3 && status.succeeded === 3 && status.results.length === 3, "job_status: done met alle antwoorden", JSON.stringify({ s: status?.state, d: status?.done }));
  gelijk(status?.results[0].lines, los.data?.lines, "job item 0 = calc_evaluate");
  const lang = await roep("job_start", { items: Array.from({ length: 50 }, () => items[0]) });
  const stop = await roep("job_cancel", { jobId: lang.data.jobId });
  meld(!stop.isError, "job_cancel");
  await new Promise((k) => setTimeout(k, 30));
  const na = (await roep("job_status", { jobId: lang.data.jobId, results: false })).data;
  meld(na?.state === "cancelled" && na.done < 50 && na.results === undefined, "geannuleerd: stopt en zonder results", JSON.stringify({ s: na?.state, d: na?.done }));
  meld((await roep("job_status", { jobId: "job-bestaat-niet" })).isError, "onbekende job: fout");
}

// ── 5f. Inhoud per bladsoort en uitvoeren (P2-11) ───────────────────────────
console.log("Inhoud per bladsoort (sheet_read, sheet_run):");
{
  // De spreadsheetkern in Node: de WASM uit het pakket, zoals check-spreadsheet.mjs.
  const pakket = naarPad(new URL("../node_modules/@betteroffice/xlsx/dist/", import.meta.url));
  const xlsx = await import(new URL("../node_modules/@betteroffice/xlsx/dist/index.js", import.meta.url).href);
  await xlsx.initWasm(leesBestand(pakket + "generated/xlsx_wasm_bg.wasm"));
  zetWerkmapKern(async () => xlsx);

  // Spreadsheet: G = L × A × 7850 / 1e6 → 6 × 5383 × 7850 / 1e6 = 253,5393 kg; som met 4,5 × 14910 × … = 526,69575 → 780,23505.
  const wb = xlsx.openWorkbook(new Uint8Array(Buffer.from(LEGE_WERKMAP, "base64")));
  const rijen = [
    ["Staaf", "L", "A", "G"],
    ["HEA 200", "6", "5383", "=B2*C2*7850/1000000"],
    ["HEB 300", "4.5", "14910", "=B3*C3*7850/1000000"],
    ["Totaal", "", "", "=SUM(D2:D3)"],
  ];
  rijen.forEach((r, i) => r.forEach((w, k) => { if (w !== "") wb.editCell(0, i, k, w); }));
  const data = Buffer.from(wb.save()).toString("base64");
  wb.dispose();
  const ss = await roep("sheet_add", { kind: "spreadsheet", name: "鋼材表", base64: data, fileName: "staal.xlsx" });
  const r1 = await roep("sheet_read", { id: ss.data.id });
  const cellen = r1.data?.spreadsheet?.sheets?.[0]?.cells ?? [];
  const cel = (a1) => cellen.find((c) => c.a1 === a1);
  meld(!r1.isError && r1.data.kind === "spreadsheet" && r1.data.spreadsheet.sheets.length === 1, "sheet_read: spreadsheet 讀出工作表", JSON.stringify(r1.data).slice(0, 300));
  meld(Math.abs((cel("D2")?.value ?? 0) - 253.5393) < 1e-9 && cel("D2")?.formula === "B2*C2*7850/1000000", "sheet_read: 公式格有值與公式（D2 = 253.5393）", JSON.stringify(cel("D2")));
  meld(Math.abs((cel("D4")?.value ?? 0) - 780.23505) < 1e-9 && cel("A1")?.kind === "text" && cel("A1")?.value === "Staaf", "sheet_read: SUM 結果與文字格", JSON.stringify([cel("D4"), cel("A1")]));
  meld(r1.data.spreadsheet.cellCount === 14 && r1.data.spreadsheet.truncated === false, "sheet_read: 只回填過的格（14 格）", String(r1.data.spreadsheet.cellCount));
  const r1k = await roep("sheet_read", { id: ss.data.id, maxCells: 3 });
  meld(r1k.data?.spreadsheet?.cellCount === 3 && r1k.data.spreadsheet.truncated === true, "sheet_read: maxCells 截斷並標 truncated");
  const sRun = await roep("sheet_run", { id: ss.data.id });
  meld(sRun.data?.ran === true && sRun.data.completed === true && app.notebookRondes.length === 0, "sheet_run: spreadsheet 等同讀取，不呼叫 notebook");

  // Graaf: 2 + 3 = 5, en een bekijk-node toont het.
  const gr = await roep("sheet_add", { kind: "graph", name: "節點" });
  await roep("sheet_set_graph", {
    id: gr.data.id,
    graph: {
      versie: 1,
      nodes: [
        { id: "a", soort: "getal", x: 0, y: 0, invoer: { waarde: "2" } },
        { id: "b", soort: "getal", x: 0, y: 50, invoer: { waarde: "3" } },
        { id: "s", soort: "optellen", x: 100, y: 0, naam: "som" },
        { id: "v", soort: "bekijken", x: 200, y: 0 },
      ],
      verbindingen: [
        { vanNode: "a", vanPoort: "waarde", naarNode: "s", naarPoort: "a" },
        { vanNode: "b", vanPoort: "waarde", naarNode: "s", naarPoort: "b" },
        { vanNode: "s", vanPoort: "uit", naarNode: "v", naarPoort: "waarde" },
      ],
    },
  });
  const r2 = await roep("sheet_read", { id: gr.data.id });
  const som = r2.data?.graph?.nodes?.find((n) => n.id === "s");
  meld(!r2.isError && som?.outputs?.uit?.value === 5 && som.name === "som", "sheet_read: graph 節點輸出（2 + 3 = 5）", JSON.stringify(som));
  meld(r2.data?.graph?.views?.[0]?.value === 5 && r2.data.graph.errorNodes === 0, "sheet_read: graph 檢視節點表", JSON.stringify(r2.data?.graph?.views));

  // Jupyter: een gedraaide cel met uitvoer, een fout, en een cel die nooit draaide.
  const nb = {
    nbformat: 4, nbformat_minor: 5, metadata: {},
    cells: [
      { cell_type: "markdown", id: "m", metadata: {}, source: ["# 計算"] },
      { cell_type: "code", id: "c1", metadata: {}, execution_count: 1, source: ["x = 6 * 7\n", "x"], outputs: [{ output_type: "execute_result", execution_count: 1, metadata: {}, data: { "text/plain": "42", "image/png": "iVBOR" } }] },
      { cell_type: "code", id: "c2", metadata: {}, execution_count: 2, source: "print('hi')\n1/0", outputs: [{ output_type: "stream", name: "stdout", text: ["hi\n"] }, { output_type: "error", ename: "ZeroDivisionError", evalue: "division by zero", traceback: ["\u001b[31mZeroDivisionError\u001b[0m: division by zero"] }] },
      { cell_type: "code", id: "c3", metadata: {}, execution_count: null, source: "y = 1", outputs: [] },
    ],
  };
  const jpData = (n) => Buffer.from(pakWerkmapIn([{ pad: "calc.ipynb", bytes: new TextEncoder().encode(JSON.stringify(n)) }])).toString("base64");
  const jp = await roep("sheet_add", { kind: "jupyter", name: "筆記本", base64: jpData(nb), fileName: "calc.zip" });
  const r3 = await roep("sheet_read", { id: jp.data.id });
  const boek = r3.data?.jupyter?.notebooks?.[0];
  meld(!r3.isError && boek?.path === "calc.ipynb" && boek.codeCells === 3 && boek.executedCells === 2 && boek.errorCells === 1, "sheet_read: jupyter 計數（3 code、2 已執行、1 錯誤）", JSON.stringify(boek && { c: boek.codeCells, e: boek.executedCells, f: boek.errorCells }));
  const c1 = boek?.cells?.[1];
  meld(c1?.outputs?.[0]?.text === "42" && c1.outputs[0].mime.includes("image/png") && c1.source === "x = 6 * 7\nx", "sheet_read: jupyter 結果文字與 MIME", JSON.stringify(c1));
  const fout2 = boek?.cells?.[2]?.outputs?.[1];
  meld(fout2?.type === "error" && fout2.ename === "ZeroDivisionError" && !fout2.text.includes("\u001b") && boek.cells[3].executionCount === null, "sheet_read: jupyter 錯誤（去色碼）與未執行格 null", JSON.stringify(fout2));

  // sheet_run: het venster draait en zet nieuwe uitvoer in het project.
  app.zetNotebookUitvoer(async (id) => {
    const blad = app.omgeving.stand().exemplaren.find((e) => e.id === id);
    const nieuw = structuredClone(nb);
    nieuw.cells[3].execution_count = 3;
    nieuw.cells[3].outputs = [{ output_type: "stream", name: "stdout", text: "klaar" }];
    app.omgeving.acties.zetJupyter(id, { ...blad.jupyter, data: jpData(nieuw) });
    return { klaar: true };
  });
  const run = await roep("sheet_run", { id: jp.data.id, timeoutSeconds: 30 });
  meld(!run.isError && run.data.ran === true && run.data.completed === true && run.data.jupyter.notebooks[0].executedCells === 3, "sheet_run: jupyter 執行後讀到新輸出", JSON.stringify(run.data?.jupyter?.notebooks?.[0]?.executedCells));
  meld(app.notebookRondes.at(-1)?.id === jp.data.id && app.notebookRondes.at(-1).tijdMs === 30000, "sheet_run: 逾時秒數轉 ms 傳給 App");
  app.zetNotebookUitvoer(async () => ({ klaar: false, melding: "The notebook did not finish in time." }));
  const traag = await roep("sheet_run", { id: jp.data.id });
  meld(traag.data?.completed === false && /in time/.test(traag.data.message) && app.notebookRondes.at(-1).tijdMs === 90000, "sheet_run: 未完成標 completed=false（不可當結果）");
  meld((await roep("sheet_run", {})).data.code === "VALIDATION", "sheet_run: 必須給 id（變更類工具不用目前表）");

  // Marimo: bewaarde uitvoer als tekst, zonder html.
  const code = "import marimo\n\napp = marimo.App()\n\n@app.cell\ndef _():\n    x = 6 * 7\n    x\n    return (x,)\n\n@app.cell(hide_code=True)\ndef _(x):\n    print(x)\n    return\n";
  const mr = await roep("sheet_add", { kind: "marimo", name: "反應式", code, fileName: "m.py" });
  const blad = app.omgeving.stand().exemplaren.find((e) => e.id === mr.data.id);
  app.omgeving.acties.zetMarimo(mr.data.id, { ...blad.marimo, uitvoer: ["<pre><span>42</span></pre>", "<div>a &amp; b</div><img src=x>"] });
  const r4 = await roep("sheet_read", { id: mr.data.id });
  const mc = r4.data?.marimo?.cells ?? [];
  meld(mc.length === 2 && mc[0].code === "x = 6 * 7\nx" && mc[0].output === "42" && mc[1].hidden === true && mc[1].output === "a & b" && mc[1].hasImage === true, "sheet_read: marimo 每格程式碼與純文字輸出", JSON.stringify(mc));

  // Rekenblad: dezelfde regels als sheet_evaluate lines=true.
  const rk = await roep("sheet_read", { id: liggerId });
  const ev = await roep("sheet_evaluate", { id: liggerId, lines: true });
  meld(!rk.isError && rk.data.kind === "calculation" && Array.isArray(rk.data.lines) && rk.data.lines.length === ev.data.lines.length, "sheet_read: 計算表 = sheet_evaluate 的 lines");

  // Zonder desktop: een notebook kan niet draaien.
  const zonder = await MCP_TOOLS.find((t) => t.name === "sheet_run").handler({ id: jp.data.id }, { ...maakContext({ ...app.omgeving, notebooks: undefined }, vlaggen)() });
  meld(zonder.ok === false && zonder.code === "NOT_AVAILABLE", "sheet_run: 沒有 App 視窗時 NOT_AVAILABLE");
  const dr = await roep("sheet_add", { kind: "drawing", name: "圖" });
  const leeg = await roep("sheet_read", { id: dr.data.id });
  meld(!leeg.isError && leeg.data.kind === "drawing" && leeg.data.drawing.views.length === 1 && leeg.data.drawing.views[0].elements === 0 && leeg.data.drawing.bindings.length === 0, "sheet_read: een leeg tekenblad geeft zijn lege view en geen koppelingen", JSON.stringify(leeg.data.drawing));

  for (const id of [ss.data.id, gr.data.id, jp.data.id, mr.data.id, dr.data.id]) await roep("sheet_remove", { id });
  zetWerkmapKern(null);
  void pakWerkmapUit;
}

// ── 5g. Opgeleverde invoer: modified, original, sheet_reset_input (P2-14) ───
console.log("Opgeleverde invoer (modified, original, sheet_reset_input):");
{
  // `gelijk` hierboven telt zelf mee; hier is een vergelijking nodig die alleen antwoordt.
  const zelfde = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  // De regels zelf.
  meld(gelijkeInvoer("5", "5.0") && gelijkeInvoer(" 4,5 ", "4.5") && !gelijkeInvoer("5", "6") && !gelijkeInvoer("a", "b"), "gelijke invoer: tekst of getalwaarde");
  meld(opgeleverd(undefined, "x", "3") === undefined && opgeleverd({}, "x", "3") === "3" && opgeleverd({ x: "7" }, "x", "3") === "7", "opgeleverd: niets bijgehouden, standaard, of de vastgelegde waarde");
  meld(!isGewijzigd(undefined, "x", "9", "3") && !isGewijzigd({}, "x", undefined, "3") && isGewijzigd({}, "x", "9", "3") && !isGewijzigd({ x: "9" }, "x", "9.0", "3"), "gewijzigd: alleen tegenover wat is opgeleverd");

  const veld = (r, naam) => r.data.inputs.find((v) => v.name === naam);
  const toe = await roep("sheet_add", { templateId: "tw-rc-beam", name: "交付梁" });
  const id = toe.data.id;
  const ex = () => app.s.exemplaren.find((e) => e.id === id);
  meld(!toe.isError && zelfde(ex().ontwerpWaarden, {}), "sheet_add: het blad houdt de opgeleverde invoer bij", JSON.stringify(ex()?.ontwerpWaarden));
  const g0 = await roep("sheet_get", { id });
  meld(g0.data.inputs.length > 5 && g0.data.inputs.every((v) => v.modified === false && v.original === v.default), "sheet_get: elk veld modified=false, original = de standaardwaarde");
  meld(zelfde(g0.data.modifiedInputs, []), "sheet_get: modifiedInputs leeg");

  // De agent levert op: geen wijziging.
  const s1 = await roep("sheet_set_input", { id, values: { M_u: "180", support_type: "2" } });
  meld(!s1.isError && s1.data.design === true && zelfde(s1.data.modifiedInputs, []), "sheet_set_input: standaard de opgeleverde waarde, dus niet gewijzigd", JSON.stringify(s1.data));
  meld(zelfde(ex().ontwerpWaarden, { M_u: "180", support_type: "2" }), "de opgeleverde waarden staan bij het blad", JSON.stringify(ex().ontwerpWaarden));
  const e1 = await roep("sheet_evaluate", { id });
  meld(!e1.isError && zelfde(e1.data.modifiedInputs, []), "sheet_evaluate: modifiedInputs leeg na opleveren");

  // De gebruiker wijzigt in de app: zetWaarde zonder `ontwerp`, zoals het invoerpaneel.
  app.omgeving.acties.zetWaarde(id, "M_u", "420");
  const g1 = await roep("sheet_get", { id });
  const mu = veld(g1, "M_u");
  meld(mu.value === "420" && mu.modified === true && mu.original === "180", "na een wijziging in de app: modified=true met original", JSON.stringify(mu));
  meld(veld(g1, "V_u").modified === false && veld(g1, "support_type").modified === false, "de andere velden blijven ongewijzigd");
  meld(zelfde(g1.data.modifiedInputs, [{ name: "M_u", value: "420", original: "180" }]), "sheet_get: modifiedInputs noemt het veld", JSON.stringify(g1.data.modifiedInputs));
  const e2 = await roep("sheet_evaluate", { id });
  meld(zelfde(e2.data.modifiedInputs, [{ name: "M_u", value: "420", original: "180" }]) && e2.data.uc !== e1.data.uc, "sheet_evaluate: nieuwe uitkomst én de wijziging gemeld", `${e1.data.uc} → ${e2.data.uc}`);

  // Dezelfde getalwaarde anders geschreven is geen wijziging.
  app.omgeving.acties.zetWaarde(id, "M_u", "180.0");
  meld(zelfde((await roep("sheet_get", { id })).data.modifiedInputs, []), "180.0 tegenover 180: niet gewijzigd");
  app.omgeving.acties.zetWaarde(id, "M_u", "420");

  // design=false: de API wijzigt zoals een gebruiker; een veld zonder eigen opgeleverde waarde meet tegen de standaard.
  const s2 = await roep("sheet_set_input", { id, name: "V_u", value: 150, design: false });
  meld(!s2.isError && s2.data.design === false && s2.data.modifiedInputs.length === 2, "sheet_set_input design=false: telt als wijziging", JSON.stringify(s2.data.modifiedInputs));
  meld(veld(await roep("sheet_get", { id }), "V_u").original === "120" && ex().ontwerpWaarden.V_u === undefined, "original is dan de standaardwaarde van de rekentekst");

  // Herstellen: één veld, onbekend veld, alles.
  const onbekend = await roep("sheet_reset_input", { id, names: ["bestaat_niet"] });
  meld(onbekend.isError && onbekend.data.code === "VALIDATION" && ex().waarden.M_u === "420", "sheet_reset_input: onbekend veld geweigerd, niets hersteld");
  const voor = app.acties.length;
  const r1 = await roep("sheet_reset_input", { id, names: ["M_u"] });
  meld(!r1.isError && r1.data.tracked === true && zelfde(r1.data.reset, { M_u: "180" }) && ex().waarden.M_u === "180", "sheet_reset_input: één veld terug naar de opgeleverde waarde", JSON.stringify(r1.data));
  meld(zelfde(r1.data.modifiedInputs.map((m) => m.name), ["V_u"]), "het andere gewijzigde veld blijft staan");
  const r2 = await roep("sheet_reset_input", { id });
  meld(zelfde(r2.data.reset, { V_u: "120" }) && ex().waarden.V_u === undefined && zelfde(r2.data.modifiedInputs, []), "sheet_reset_input zonder namen: alles terug; zonder opgeleverde waarde naar de standaard", JSON.stringify(r2.data));
  meld(app.acties.slice(voor).filter((a) => a === "herstelInvoer").length === 2, "elke herstelling is één stap in de geschiedenis");
  const r3 = await roep("sheet_reset_input", { id });
  meld(!r3.isError && zelfde(r3.data.reset, {}) && app.acties.slice(voor).filter((a) => a === "herstelInvoer").length === 2, "niets gewijzigd: niets hersteld en geen stap");
  const e3 = await roep("sheet_evaluate", { id });
  meld(e3.data.uc === e1.data.uc && e3.data.passes === e1.data.passes, "na herstellen dezelfde uitkomst als bij opleveren", `${e1.data.uc} / ${e3.data.uc}`);
  await roep("undo");
  meld(ex().waarden.V_u === "150", "ongedaan maken zet de wijziging terug");
  await roep("sheet_reset_input", { id });

  // Acceptatie: dezelfde waarde via de API of in de app geeft dezelfde uitkomst.
  const s3 = await roep("sheet_set_input", { id, name: "M_u", value: "420" });
  const e4 = await roep("sheet_evaluate", { id });
  meld(!s3.isError && e4.data.uc === e2.data.uc && zelfde(e4.data.modifiedInputs, []), "M_u = 420 via de API rekent als in de app, en is dan de opgeleverde waarde", `${e2.data.uc} / ${e4.data.uc}`);

  // Een blad dat in de app is ingevoegd houdt niets bij, tot de API er iets oplevert.
  const los = app.omgeving.acties.voegToe("tw-rc-beam", "手動梁", app.sjablonen["tw-rc-beam"]);
  app.omgeving.acties.zetWaarde(los, "b", "350");
  const g2 = await roep("sheet_get", { id: los });
  meld(g2.data.inputs.every((v) => v.modified === false && !("original" in v)) && zelfde(g2.data.modifiedInputs, []), "een blad uit de app: modified=false en geen original");
  const r4 = await roep("sheet_reset_input", { id: los });
  meld(!r4.isError && r4.data.tracked === false && zelfde(r4.data.reset, {}), "sheet_reset_input op zo'n blad: tracked=false, niets hersteld");
  await roep("sheet_set_input", { id: los, name: "h", value: "700" });
  const g3 = await roep("sheet_get", { id: los });
  meld(veld(g3, "b").modified === false && veld(g3, "b").original === "350" && veld(g3, "h").original === "700", "de eerste oplevering neemt de bestaande invoer mee: wat er al stond is niet 'gewijzigd'", JSON.stringify(veld(g3, "b")));

  // module_schema is geen blad: geen modified/original.
  const schema = await roep("module_schema", { templateId: "tw-rc-beam" });
  meld(schema.data.inputs.every((v) => !("modified" in v) && !("original" in v)), "module_schema: geen modified of original");

  // Het projectbestand: opslaan en openen houdt de opgeleverde invoer, ook een lege.
  app.omgeving.acties.zetWaarde(id, "M_u", "300");
  const project = { versie: PROJECT_FORMAAT_VERSIE, naam: "交付", gegevens: legeGegevens(), exemplaren: [ex(), { ...ex(), id: "leeg", ontwerpWaarden: {} }, (() => { const { ontwerpWaarden: _weg, ...rest } = ex(); return { ...rest, id: "zonder" }; })()] };
  const tekst = bouwProjectBestand(project, bladenVoorIfc(project));
  const terug = leesProjectBestand(tekst, "x").exemplaren;
  meld(zelfde(terug[0].ontwerpWaarden, ex().ontwerpWaarden) && terug[0].waarden.M_u === "300", "opslaan en openen: dezelfde opgeleverde invoer naast de gewijzigde", JSON.stringify(terug[0].ontwerpWaarden));
  meld(zelfde(terug[1].ontwerpWaarden, {}) && terug[2].ontwerpWaarden === undefined, "een lege opgeleverde invoer blijft 'bijhouden'; zonder blijft zonder");
  meld(Object.keys(JSON.parse(tekst).schemas ?? {}).includes("ocss::blad::ontwerp"), "het attribuut heeft een schema in het bestand");

  for (const weg of [id, los]) await roep("sheet_remove", { id: weg });
}

// ── 5h. Markdown en rapport met waarden uit andere bladen (P2-13) ───────────
console.log("Waarden uit andere bladen in Markdown en rapport:");
{
  const zelfde = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const bladen = [{ ref: "2", source: "L = 6 m\nq = 12 kN/m\nM = q*L^2/8\nR_paal = 450 kN", waarden: {} }];

  // De verwijzingen zelf.
  meld(zelfde(tekstVerwijzingen("a {#2.R_paal} b {#2.R_paal} c {#3.M:1}"), [
    { plek: "{#2.R_paal}", ref: "2", naam: "R_paal" },
    { plek: "{#3.M:1}", ref: "3", naam: "M", decimalen: 1 },
  ]), "tekstVerwijzingen: elke plek één keer, met decimalen");
  meld(zelfde(tekstVerwijzingen("geen verwijzing {projectnaam}"), []), "tekstVerwijzingen: een invulveld van het rapport is geen verwijzing");

  const w = rekenTekstVerwijzingen(tekstVerwijzingen("{#2.R_paal} {#2.M:1} {#2.L:0} {#2.nope} {#9.M}"), { bladen, scope: {} });
  meld(w.get("{#2.R_paal}").tekst === "450 kN", "de waarde komt met de eenheid van het blad", w.get("{#2.R_paal}").tekst);
  meld(w.get("{#2.M:1}").tekst === "54.0 kN·m" && w.get("{#2.L:0}").tekst === "6 m", "decimalen: 54.0 en 6, eenheid in beeld", `${w.get("{#2.M:1}").tekst} / ${w.get("{#2.L:0}").tekst}`);
  meld(w.get("{#2.nope}").tekst === null && /nope/.test(w.get("{#2.nope}").fout), "een onbekende naam levert niets, met de reden", JSON.stringify(w.get("{#2.nope}")));
  meld(w.get("{#9.M}").tekst === null && w.get("{#9.M}").fout !== undefined, "een onbekend blad levert niets");

  const tekst = "De paal draagt {#2.R_paal}, het moment is {#2.M:1} en {#2.nope}.";
  meld(vulTekstIn(tekst, w) === "De paal draagt 450 kN, het moment is 54.0 kN·m en {#2.nope}.", "vulTekstIn: wat niet te vullen valt blijft staan", vulTekstIn(tekst, w));

  // Markdown: niet in code, wel ontsnapt.
  const md = "Waarde: {#2.R_paal}\n\n`{#2.R_paal}` en\n\n```\n{#2.R_paal}\n```\n";
  const gevuld = vulMarkdownIn(md, w);
  meld(gevuld.startsWith("Waarde: 450 kN") && gevuld.includes("`{#2.R_paal}`") && gevuld.includes("```\n{#2.R_paal}\n```"), "Markdown: code blijft staan, de rest wordt ingevuld", JSON.stringify(gevuld));
  meld(zelfde(markdownVerwijzingen(md).map((v) => v.plek), ["{#2.R_paal}"]), "markdownVerwijzingen: alleen buiten code");
  meld(vulMarkdownIn("x {#2.L}", new Map([["{#2.L}", "6 m_2"]])) === "x 6 m\\_2", "Markdown: een underscore in de waarde wordt ontsnapt");
  meld(vulMarkdownIn("zonder accolades", w) === "zonder accolades", "Markdown zonder verwijzingen blijft gelijk");

  // Het rapport: dezelfde syntaxis naast {projectnaam}.
  const invul = { adviseur: "", projectnummer: "P-1", projectnaam: "Toren", opdrachtgever: "", locatie: "", verantwoordelijk: "", uitvoerend: "", verwijzingen: new Map([["{#2.R_paal}", "450 kN"]]) };
  meld(vulIn("Project {projectnaam}, paal {#2.R_paal}, onbekend {#3.M}.", invul) === "Project Toren, paal 450 kN, onbekend {#3.M}.", "vulIn: invulvelden én bladwaarden", vulIn("Project {projectnaam}, paal {#2.R_paal}, onbekend {#3.M}.", invul));
  meld(vulIn("{#2.R_paal}", { ...invul, verwijzingen: undefined }) === "{#2.R_paal}", "zonder de kaart blijft de verwijzing staan");
  meld(vervangVerwijzingenInTekst("a {#2.M:1} b", new Map([["{#2.M:1}", "54.0 kN m"]])) === "a 54.0 kN m b", "vervangVerwijzingenInTekst: ook met decimalen");

  // Door de tool: een Markdown-blad dat een rekenblad aanroept.
  const reken = await roep("sheet_add", { templateId: "tw-rc-beam", name: "梁" });
  app.s.exemplaren.find((e) => e.id === reken.data.id).ref = "2";
  app.omgeving.acties.zetWaarde(reken.data.id, "M_u", "180");
  const mdToe = await roep("sheet_add", { kind: "markdown", name: "說明", text: "梁寬 b = {#2.b}。\n\n`{#2.b}` 是範例。\n" });
  const gelezen = await roep("sheet_read", { id: mdToe.data.id });
  meld(!gelezen.isError && gelezen.data.markdown.text.includes("{#2.b}") && gelezen.data.markdown.filled === "梁寬 b = 300 mm。\n\n`{#2.b}` 是範例。\n", "sheet_read: markdown 附上填好的文字，code 不動", JSON.stringify(gelezen.data.markdown));
  meld(zelfde(gelezen.data.markdown.references, [{ placeholder: "{#2.b}", ref: "2", name: "b", value: "300 mm", unit: "mm", check: "unchecked" }]), "sheet_read: elke 參照都列出值與單位", JSON.stringify(gelezen.data.markdown.references));
  await roep("sheet_set_markdown", { id: mdToe.data.id, text: "Geen verwijzingen." });
  const kaal = await roep("sheet_read", { id: mdToe.data.id });
  meld(!("filled" in kaal.data.markdown) && zelfde(kaal.data.markdown.references, []), "zonder verwijzingen geen filled en een lege lijst", JSON.stringify(kaal.data.markdown));
  await roep("sheet_set_markdown", { id: mdToe.data.id, text: "Onbekend: {#9.M} en {#2.nope}." });
  const stuk = await roep("sheet_read", { id: mdToe.data.id });
  meld(!("filled" in stuk.data.markdown) && stuk.data.markdown.references.every((r) => r.value === null && typeof r.error === "string"), "onbekende verwijzing: blijft staan (geen filled), met de reden", JSON.stringify(stuk.data.markdown.references));

  for (const id of [mdToe.data.id, reken.data.id]) await roep("sheet_remove", { id });
}

// ── 5i. Tekening: maten aan het rekenblad, SVG en DXF (P2-12) ───────────────
console.log("Tekening met maten uit het rekenblad (sheet_drawing):");
{
  const zelfde = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const vel = {
    formaat: "A3",
    ligging: "liggend",
    views: [
      {
        id: "voor",
        titel: "Vooraanzicht",
        x: 20,
        y: 20,
        breedte: 380,
        hoogte: 250,
        schaal: 20,
        x0: 0,
        y0: 0,
        elementen: [
          { id: "e1", soort: "rechthoek", p: { x: { v: 0 }, y: { v: 0 }, w: { v: 0, e: "L" }, h: { v: 0, e: "h_balk" } } },
          { id: "e2", soort: "maat", p: { x1: { v: 0 }, y1: { v: -40 }, x2: { v: 0, e: "L" }, y2: { v: -40 } } },
          { id: "e3", soort: "tekst", p: { x: { v: 0 }, y: { v: -80 } }, tekst: "L = {{L}}", grootte: 20 },
          { id: "e4", soort: "cirkel", p: { cx: { v: 0, e: "L/2" }, cy: { v: 100 }, r: { v: 50 } } },
        ],
      },
    ],
  };
  const tekenId = app.omgeving.acties.voegTekenbladToe("圖", vel);
  // Geen `b`: dat is in de rekentaal een eenheid (barn) en geen naam van het blad.
  app.omgeving.acties.zetBron(tekenId, "L = 6000 mm\nh_balk = 300 mm");

  const gelezen = await roep("sheet_read", { id: tekenId });
  meld(!gelezen.isError && gelezen.data.kind === "drawing" && gelezen.data.drawing.views.length === 1, "sheet_read: een tekenblad geeft zijn views", JSON.stringify(gelezen.data).slice(0, 200));
  meld(zelfde(gelezen.data.drawing.views[0].kinds, { rechthoek: 1, maat: 1, tekst: 1, cirkel: 1 }), "sheet_read: de soorten elementen per view", JSON.stringify(gelezen.data.drawing.views[0].kinds));
  const koppel = gelezen.data.drawing.bindings;
  meld(koppel.find((k) => k.expression === "L")?.value === 6000 && koppel.find((k) => k.expression === "L/2")?.value === 3000, "sheet_read: elke koppeling met de waarde uit het blad", JSON.stringify(koppel));
  meld(zelfde(gelezen.data.drawing.unbound, []) && gelezen.data.drawing.views[0].bounds.height > 300, "sheet_read: niets ongebonden, grenzen in mm", JSON.stringify(gelezen.data.drawing.views[0].bounds));

  // SVG: mm, met de maten van het blad erin.
  const svg = await roep("sheet_drawing", { id: tekenId });
  const svgTekst = svg.data.drawings[0].content;
  meld(!svg.isError && svg.data.format === "svg" && svgTekst.startsWith("<svg") && svgTekst.includes('data-eenheid="mm"') && svgTekst.includes("mm\" height="), "sheet_drawing: SVG zegt zelf dat de maat mm is", svgTekst.slice(0, 120));
  meld(svgTekst.includes("L = 6000") && svgTekst.includes("3000"), "sheet_drawing: de maat en de {{…}}-tekst komen uit het blad", svgTekst.slice(-200));
  meld(svg.data.views[0].bindings.some((k) => k.expression === "h_balk" && k.kind === "maat"), "sheet_drawing: de koppelingen staan er ook bij");

  // DXF: mm en m, met de eenheid in het bestand zelf.
  const dxfMm = await roep("sheet_drawing", { id: tekenId, format: "dxf" });
  const dxfM = await roep("sheet_drawing", { id: tekenId, format: "dxf", unit: "m" });
  const lijnen = (t) => t.split("\n").map((r) => r.trim());
  meld(dxfMm.data.insunits === 4 && dxfM.data.insunits === 6 && dxfM.data.unit === "m", "$INSUNITS 4 voor mm en 6 voor m", `${dxfMm.data.insunits} / ${dxfM.data.insunits}`);
  meld(lijnen(dxfMm.data.drawings[0].content).includes("6000") && lijnen(dxfM.data.drawings[0].content).includes("6"), "DXF: dezelfde tekening in mm (6000) en in m (6)", "");
  const dxfTekst = dxfMm.data.drawings[0].content;
  meld(dxfTekst.startsWith("0\nSECTION") && dxfTekst.includes("AC1009") && dxfTekst.includes("CIRCLE") && dxfTekst.includes("LINE") && dxfTekst.includes("TEXT"), "DXF: R12 met lijn, cirkel en tekst", dxfTekst.slice(0, 80));
  meld(lijnen(dxfMm.data.drawings[0].content).filter((r) => r === "CIRCLE").length === 1, "DXF: één cirkel");

  // Wat het blad niet kan uitrekenen, staat in unbound en niet stil in de tekening.
  app.omgeving.acties.zetBron(tekenId, "L = 6000 mm");
  const half = await roep("sheet_read", { id: tekenId });
  meld(zelfde(half.data.drawing.unbound.map((u) => u.expression), ["h_balk"]) && typeof half.data.drawing.unbound[0].error === "string", "een onbekende naam staat in unbound, met de reden", JSON.stringify(half.data.drawing.unbound));
  meld(half.data.drawing.bindings.find((k) => k.expression === "h_balk").value === null, "en de koppeling heeft geen waarde");

  // Wat geen lijn, cirkel of tekst is gaat niet als losse DXF-entiteit mee.
  const metSymbool = await roep("sheet_drawing", { id: tekenId, format: "dxf" });
  meld(!metSymbool.isError && metSymbool.data.drawings[0].skipped.count === 0, "zonder symbool of boog wordt er niets overgeslagen", JSON.stringify(metSymbool.data.drawings[0].skipped));

  const gevraagd = await roep("sheet_drawing", { id: tekenId, view: "bestaat-niet" });
  meld(gevraagd.isError && gevraagd.data.code === "VALIDATION" && /voor/.test(gevraagd.data.error), "een onbekende view: VALIDATION met de beschikbare", gevraagd.data.error);
  const reken = await roep("sheet_add", { templateId: "ligger", name: "Balk" });
  const verkeerd = await roep("sheet_drawing", { id: reken.data.id });
  meld(verkeerd.isError && verkeerd.data.code === "VALIDATION" && /not a drawing/.test(verkeerd.data.error), "geen tekenblad: VALIDATION", verkeerd.data.error);
  await roep("sheet_remove", { id: reken.data.id });
  await roep("sheet_remove", { id: tekenId });
}

// ── 5j. Het antwoord van @toets en @fem in de regels (P3-17) ────────────────
console.log("Het antwoord van @toets en @fem in de regels:");
{
  const zelfde = (x, y) => JSON.stringify(x) === JSON.stringify(y);
  const bron = "kolom = @toets rc_column\nplaat = @fem dak\n";
  const toetsKnoop = {
    type: "toets",
    naam: "kolom",
    tool: "rc_column",
    status: "klaar",
    versie: "1.8.2",
    datum: "2026-03-01T10:00:00Z",
    uitkomst: {
      uc_max: 0.87,
      status: "Ok",
      voldoet: true,
      maatgevend: "T2",
      toetsen: [
        { id: "T1", artikel: "22.2.2.4.3", titel: "Krachtenspel", uc: 0.61, status: "Ok" },
        { id: "T2", artikel: "22.2.2.4.4", titel: "Knik", uc: 0.87, status: "Ok" },
      ],
      staven: [
        { id: "S1", uc_max: 0.61, status: "Ok", maatgevend: "T1" },
        { id: "S2", uc_max: 0.87, status: "Ok", maatgevend: "T2" },
      ],
    },
  };
  const femKnoop = {
    type: "fem",
    naam: "plaat",
    taal: "nl",
    status: "klaar",
    versie: "1.8.2",
    datum: "2026-03-01T10:05:00Z",
    model: { knopen: 120, elementen: 98, maas: 40, veren: 12, lijnen: 3, dikten: [0.2, 0.25] },
    gevallen: [
      { naam: "eigen gewicht", hash: "h1", somLast: 210.5, somR: 210.5 },
      { naam: "veranderlijk", hash: "h2", somLast: 90, somR: 90 },
    ],
    uitersten: [
      { naam: "UGT-1", soort: "combinatie", mxMax: 32.1, mxMin: -4.2, myMax: 18.3, myMin: -1.1, mxyMax: 2.4, mxyMin: -2.4, wMax: 6.1, wMin: 0, RMax: 55.2, RMin: -3.1 },
    ],
  };
  const leegToets = { type: "toets", naam: "kolom", tool: "rc_column", status: "niet-getoetst" };
  const leegFem = { type: "fem", naam: "plaat", taal: "nl", status: "niet-gerekend", gevallen: [] };
  const uit = regels([toetsKnoop, femKnoop, leegToets, leegFem], 100, { bron }).regels;
  const [t, f, lt, lf] = uit;

  meld(t.version === "1.8.2" && t.date === "2026-03-01T10:00:00Z", "toets: de versie en datum van FEM Studio staan erbij", JSON.stringify(t));
  meld(t.resultStatus === "Ok" && t.passes === true && t.governing === "T2", "toets: het oordeel, ook als passes/governing", JSON.stringify(t));
  meld(t.items.length === 2 && t.items[1].clause === "22.2.2.4.4" && t.items[1].uc === 0.87 && t.items[1].title === "Knik", "toets: elke toets met artikel, titel en UC", JSON.stringify(t.items));
  meld(t.members.length === 2 && t.members[1].governing === "T2", "toets: per staaf de UC en de maatgevende toets", JSON.stringify(t.members));
  meld(t.uc === 0.87 && t.check === "pass" && t.status === "klaar", "toets: de oude velden blijven zoals ze waren", JSON.stringify({ uc: t.uc, check: t.check, status: t.status }));

  meld(zelfde(f.model, { nodes: 120, elements: 98, mesh: 40, springs: 12, lineSupports: 3, thicknesses: [0.2, 0.25] }), "fem: het model in het kort", JSON.stringify(f.model));
  meld(f.cases.length === 2 && f.cases[0].totalLoad === 210.5 && f.cases[1].name === "veranderlijk", "fem: per geval de belasting en de reactie", JSON.stringify(f.cases));
  meld(f.extremes[0].mx.max === 32.1 && f.extremes[0].mx.unit === "kN m/m" && f.extremes[0].deflection.max === 6.1 && f.extremes[0].reaction.min === -3.1, "fem: de uitersten met hun eenheid", JSON.stringify(f.extremes));
  meld(f.check === "unchecked" && f.version === "1.8.2", "fem: nooit 'pass' zonder容許waarde, versie erbij", JSON.stringify({ check: f.check, version: f.version }));

  meld(lt.items === undefined && lt.passes === undefined && lt.version === undefined && lt.check === "unchecked", "zonder antwoord: geen antwoordvelden, check blijft unchecked", JSON.stringify(lt));
  meld(lf.cases === undefined && lf.model === undefined && lf.check === "unchecked", "fem zonder antwoord: alleen de stand", JSON.stringify(lf));
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
