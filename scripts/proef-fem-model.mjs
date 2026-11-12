/**
 * Proef met de echte server van Open FEM Studio: rekent de bladen met een `@fem`-blok
 * uit scripts/fixtures/fem/bladen.mjs door, precies zoals de app dat doet (de
 * verzoeken uit de werkruimte, femArgumenten, `tools/call` op `solve_open_fem_3d`,
 * femBewaar), en legt met `--bewaar` de antwoorden vast in scripts/fixtures/fem/.
 * scripts/check-fem-model.mjs rekent daarmee verder, ook zonder server (in CI).
 *
 * Met `--bewaar` schrijft de proef ook:
 *   • solve_open_fem_3d.schema.json  het inputSchema uit tools/list, zonder de teksten;
 *   • tools-<versie>.json            de namen van alle tools van deze server;
 *   • klein-ruw.json                 een klein model met het antwoord zoals het kwam
 *                                    (de velden die femBewaar leest), om het bewaren na
 *                                    te rekenen.
 *
 * Waar de server staat: OCSS_FEM_SERVER, of de geïnstalleerde FEM Studio
 * (%LOCALAPPDATA%\Open FEM Studio\openaec-mcp-server.exe op Windows).
 *
 * Draaien:  node scripts/proef-fem-model.mjs [--bewaar]
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { evaluate, femArgumenten, femBewaar, parse, schemaHash } from "../packages/core/dist/index.js";
import { NAVIER, PALEN, VLOER } from "./fixtures/fem/bladen.mjs";

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
const init = await fem.roep("initialize", { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "proef-fem-model", version: "1" } });
const versie = init.result?.serverInfo?.version ?? "";
const sha256 = createHash("sha256").update(readFileSync(server)).digest("hex");
const lijst = await fem.roep("tools/list", {});
const tools = lijst.result?.tools ?? [];
const tool = tools.find((t) => t.name === "solve_open_fem_3d");
console.log(`FEM Studio ${versie} (${tools.length} tools)`);
if (!tool) {
  console.log("Deze server kent solve_open_fem_3d niet.");
  fem.stop();
  process.exit(1);
}
const herkomst = { versie, sha256, schema: schemaHash(tool.inputSchema) };

async function reken(args) {
  const t0 = Date.now();
  const r = await fem.roep("tools/call", { name: "solve_open_fem_3d", arguments: args });
  const ms = Date.now() - t0;
  if (r.error) throw new Error(r.error.message);
  if (r.result?.isError) throw new Error(r.result.content?.[0]?.text ?? "fout");
  return { ruw: r.result.structuredContent ?? JSON.parse(r.result.content[0].text), ms };
}

const femVan = (nodes) => nodes.find((n) => n.type === "fem") ?? nodes.flatMap((n) => n.children ?? []).find((n) => n.type === "fem");

const map = new URL("./fixtures/fem/", import.meta.url);
const schrijf = (naam, data) => {
  writeFileSync(new URL(naam, map), JSON.stringify(data) + "\n");
  console.log(`  geschreven: scripts/fixtures/fem/${naam}`);
};

let fouten = 0;
for (const [naam, bron] of [["navier", NAVIER], ["palen", PALEN], ["vloer", VLOER]]) {
  const blok = femVan(evaluate(parse(bron), {}, {}, { toetsModus: "vragen" }));
  if (blok?.status !== "wacht") {
    console.log(`${naam}: ${blok?.status} ${blok?.melding ?? ""}`);
    fouten++;
    continue;
  }
  const toetsingen = {};
  for (const v of blok.verzoeken) {
    try {
      const { ruw, ms } = await reken(femArgumenten(v.bewaar));
      const uitkomst = femBewaar(v.bewaar, ruw);
      toetsingen[v.hash] = { tool: v.tool, verzoek: v.bewaar, uitkomst, datum: new Date().toISOString(), herkomst };
      console.log(`${naam}, geval ${v.bewaar.geval}: ${v.bewaar.x.length} knopen, ${ms} ms, Σ last ${uitkomst.som.last.toFixed(3)} kN, ΣR ${uitkomst.som.reactie.toFixed(3)} kN, evenwicht ${uitkomst.evenwicht.ok ? "goed" : "FOUT"}`);
    } catch (e) {
      console.log(`${naam}, geval ${v.bewaar.geval}: ${e.message}`);
      fouten++;
    }
  }
  if (bewaar) schrijf(`${naam}.json`, { versie, toetsingen });
}

// Een klein model met het antwoord zoals het kwam.
{
  const bron = [
    "@fem klein",
    "  materiaal 30 GPa; 0.2",
    "  maas 0.5 m",
    "  plaat 0; 0; 2 m; 2 m; 200 mm",
    "  veren 0; 0; 2; 2; 2 m; 2 m; 100 MN/m",
    "  geval G",
    "    vlaklast 10 kN/m^2",
    "@end",
  ].join("\n");
  const v = femVan(evaluate(parse(bron), {}, {}, { toetsModus: "vragen" })).verzoeken[0];
  const argumenten = femArgumenten(v.bewaar);
  const { ruw } = await reken(argumenten);
  const kern = { displacements: ruw.displacements, reactions: ruw.reactions, shellNodes: ruw.shellNodes, equilibrium: ruw.equilibrium };
  if (bewaar) schrijf("klein-ruw.json", { versie, model: v.bewaar, argumenten, ruw: kern });
}

if (bewaar) {
  // Het schema zonder de teksten (description, default): de structuur is wat telt.
  const kaal = (s) => (Array.isArray(s) ? s.map(kaal) : s && typeof s === "object"
    ? Object.fromEntries(Object.entries(s).filter(([k]) => k !== "description" && k !== "default").map(([k, v]) => [k, k === "properties" ? Object.fromEntries(Object.entries(v).map(([p, w]) => [p, kaal(w)])) : kaal(v)]))
    : s);
  schrijf("solve_open_fem_3d.schema.json", kaal(tool.inputSchema));
  schrijf(`tools-${versie}.json`, tools.map((t) => t.name));
}
fem.stop();
console.log(fouten ? `\n${fouten} fout(en).` : "\nKlaar.");
process.exit(fouten ? 1 : 0);
