/**
 * Proef met de echte server van Open FEM Studio: rekent de bladen met een `@kern`-blok
 * uit scripts/fixtures/kern/bladen.mjs door, precies zoals de app dat doet (het verzoek
 * uit de werkruimte, kernAanroepen, `tools/call`), en legt met `--bewaar` de antwoorden
 * vast in scripts/fixtures/kern/antwoorden.json. scripts/check-kern-blok.mjs rekent
 * daarmee verder, ook zonder server (in CI), en legt de uitkomsten naast een
 * handberekening.
 *
 * Waar de server staat: OCSS_FEM_SERVER, of de geïnstalleerde FEM Studio
 * (%LOCALAPPDATA%\Open FEM Studio\openaec-mcp-server.exe op Windows).
 *
 * Draaien:  node scripts/proef-kern-blok.mjs [--bewaar]
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluate, kernAanroepen, kernVerzoekBewaard, parse, schemaHash } from "../packages/core/dist/index.js";
import { BLADEN, GEWEIGERD } from "./fixtures/kern/bladen.mjs";

const bewaar = process.argv.includes("--bewaar");
const kandidaten = [
  process.env.OCSS_FEM_SERVER,
  process.env.LOCALAPPDATA && join(process.env.LOCALAPPDATA, "Open FEM Studio", "openaec-mcp-server.exe"),
  process.env.ProgramFiles && join(process.env.ProgramFiles, "Open FEM Studio", "openaec-mcp-server.exe"),
  "/Applications/Open FEM Studio.app/Contents/MacOS/openaec-mcp-server",
  "/usr/bin/openaec-mcp-server",
].filter(Boolean);
const server = kandidaten.find((p) => existsSync(p));
if (!server) {
  console.log("Geen FEM Studio gevonden: zet OCSS_FEM_SERVER of installeer Open FEM Studio.");
  process.exit(1);
}

/** Eén server over stdin/stdout: één JSON-RPC-bericht per regel, antwoorden op id. */
function start(pad) {
  const kind = spawn(pad, [], { stdio: ["pipe", "pipe", "ignore"] });
  const wacht = new Map();
  let buffer = "";
  kind.stdout.on("data", (d) => {
    buffer += d.toString("utf8");
    let i;
    while ((i = buffer.indexOf("\n")) >= 0) {
      const regel = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!regel) continue;
      let v;
      try {
        v = JSON.parse(regel);
      } catch {
        continue;
      }
      if (v.id != null && wacht.has(v.id)) {
        wacht.get(v.id)(v);
        wacht.delete(v.id);
      }
    }
  });
  let id = 0;
  const roep = (method, params) =>
    new Promise((klaar) => {
      const n = ++id;
      wacht.set(n, klaar);
      kind.stdin.write(JSON.stringify({ jsonrpc: "2.0", id: n, method, params }) + "\n");
    });
  return { roep, stop: () => kind.kill() };
}

const fem = start(server);
const init = await fem.roep("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "proef-kern-blok", version: "1" } });
const versie = init.result?.serverInfo?.version ?? "";
const sha256 = createHash("sha256").update(readFileSync(server)).digest("hex");
const tools = (await fem.roep("tools/list", {})).result?.tools ?? [];
console.log(`Open FEM Studio ${versie}`);

/** Eén aanroep zoals de app hem doet: het antwoord, of een fout met de melding van de server. */
async function roepTool(tool, argumenten) {
  const r = await fem.roep("tools/call", { name: tool, arguments: argumenten });
  if (r.error || r.result?.isError) throw new Error(r.error?.message ?? r.result.content?.[0]?.text ?? "onbekende fout");
  return r.result.structuredContent ?? JSON.parse(r.result.content[0].text);
}

const alle = (nodes, uit = []) => {
  for (const n of nodes) {
    uit.push(n);
    if (n.children) alle(n.children, uit);
  }
  return uit;
};
const verzoekVan = (bron) => alle(evaluate(parse(bron), {}, {}, { toetsModus: "vragen" })).find((n) => n.type === "kern");

let fouten = 0;
const toetsingen = {};
for (const [naam, bron] of Object.entries(BLADEN)) {
  const blok = verzoekVan(bron);
  if (blok?.status !== "wacht" || !blok.verzoek) {
    console.log(`  ✗  ${naam}: ${blok?.status ?? "geen @kern-blok"} ${blok?.melding ?? ""}`);
    fouten++;
    continue;
  }
  const v = blok.verzoek;
  try {
    const t0 = Date.now();
    const uitkomst = await kernAanroepen(v, roepTool);
    const schema = tools.find((t) => t.name === v.tool)?.inputSchema;
    toetsingen[v.hash] = { tool: v.tool, verzoek: kernVerzoekBewaard(v), uitkomst, datum: new Date().toISOString(), herkomst: { versie, sha256, schema: schemaHash(schema) } };
    console.log(`  ✓  ${naam}: ${blok.aanroepen} ${blok.aanroepen === 1 ? "aanroep" : "aanroepen"}, ${Date.now() - t0} ms, ${v.hash}`);
  } catch (e) {
    console.log(`  ✗  ${naam}: ${e.message}`);
    fouten++;
  }
}

// Een invoer die de kern weigert: de melding hoort bij het blad te komen, zonder uitkomst.
let geweigerd = "";
try {
  await kernAanroepen(verzoekVan(GEWEIGERD).verzoek, roepTool);
  console.log("  ✗  GEWEIGERD: de server gaf een antwoord");
  fouten++;
} catch (e) {
  geweigerd = e.message;
  console.log(`  ✓  GEWEIGERD: ${geweigerd}`);
}
fem.stop();

if (bewaar && !fouten) {
  const pad = new URL("./fixtures/kern/antwoorden.json", import.meta.url);
  writeFileSync(pad, JSON.stringify({ versie, geweigerd, toetsingen }, null, 1) + "\n");
  console.log(`Vastgelegd in scripts/fixtures/kern/antwoorden.json (${Object.keys(toetsingen).length} antwoorden).`);
}
process.exit(fouten ? 1 : 0);
