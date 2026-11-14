/**
 * De eenmalige opdrachten van de command line (OCSS TW 開發需求規格 P0-1, P0-3,
 * P0-4): start de app zonder venster, `--version` en `--help` zonder GUI, `eval`
 * en `render` via dezelfde toolregistry, de kenmerken van de build en de
 * tokenloze health-route.
 *
 * Wat hier gecontroleerd wordt is de bedrading: de Rust-kant leest de
 * argumenten, de frontendkant voert de opdracht uit met de bestaande tools, en
 * de documentatie noemt dezelfde opdrachten. Het echte gedrag van de parser
 * staat in de Rust-tests (`cargo test --lib cli`), die in CI draaien; dit script
 * is de driftcontrole tussen code, workflow en documentatie.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const repoMap = fileURLToPath(new URL("..", import.meta.url));
const lees = (pad) => readFileSync(`${repoMap}${pad}`, "utf8");

let fouten = 0;
function meld(ok, tekst, detail = []) {
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${tekst}`);
  if (!ok) {
    fouten++;
    for (const r of detail.slice(0, 40)) console.log(`         ${r}`);
  }
}
const heeft = (tekst, ...naalden) => naalden.filter((n) => !tekst.includes(n));

const cliRs = lees("packages/desktop/src-tauri/src/cli.rs");
const libRs = lees("packages/desktop/src-tauri/src/lib.rs");
const kenmerkenRs = lees("packages/desktop/src-tauri/src/kenmerken.rs");
const brugRs = lees("packages/desktop/src-tauri/src/mcp_bridge.rs");
const cliTs = lees("packages/desktop/src/mcp/cli.ts");
const kenmerkenTs = lees("packages/desktop/src/mcp/kenmerken.ts");
const projectTs = lees("packages/desktop/src/mcp/tools/project.ts");
const openapiTs = lees("packages/desktop/src/mcp/openapi.ts");
const workflow = lees(".github/workflows/release-tw.yml");
const docCli = lees("docs/tw/無頭模式與CLI.md");
const docApi = lees("docs/api.md");

console.log("\nDe argumenten (Rust)");
const opdrachten = ["Venster", "Hoofd", "Versie", "Help", "Eval", "Render"];
meld(
  opdrachten.every((o) => new RegExp(`\\b${o}\\b`).test(cliRs)),
  `de zes opdrachten staan in cli.rs (${opdrachten.join(", ")})`,
  opdrachten.filter((o) => !new RegExp(`\\b${o}\\b`).test(cliRs)),
);
const vlaggen = ["--version", "-V", "--help", "-h", "--headless", "serve", "eval", "render", "--pdf"];
meld(
  vlaggen.every((v) => cliRs.includes(`"${v}"`)),
  `elke vlag is herkend (${vlaggen.length})`,
  vlaggen.filter((v) => !cliRs.includes(`"${v}"`)),
);
meld(
  /fn zonder_venster[\s\S]{0,600}matches!\(self,[\s\S]{0,200}Opdracht::Hoofd/.test(cliRs) &&
    !/fn zonder_venster[\s\S]{0,600}Opdracht::Venster\s*\)/.test(cliRs),
  "zonder_venster(): alleen de gewone start opent een venster",
);
meld(
  /fn parse[\s\S]*Opdracht::Help/.test(cliRs) && /is_vlag/.test(cliRs),
  "onbekende vlaggen vallen terug op de uitleg (geen stille GUI-start)",
);
meld(
  cliRs.includes("editie") && cliRs.includes("commit") && cliRs.includes("gebouwd"),
  "versie_tekst() meldt editie, commit en bouwdatum",
);
const helpTekst = cliRs.slice(cliRs.indexOf("fn help_tekst"), cliRs.indexOf("fn ", cliRs.indexOf("fn help_tekst") + 10));
meld(
  ["--version", "--help", "--headless", "eval", "render", "--pdf"].every((v) => helpTekst.includes(v)),
  "help_tekst() noemt elke opdracht",
  ["--version", "--help", "--headless", "eval", "render", "--pdf"].filter((v) => !helpTekst.includes(v)),
);

console.log("\nDe bedrading (Rust → frontend)");
meld(/\bmod cli;/.test(libRs), "lib.rs kent de module cli");
for (const cmd of ["cli_opdracht", "cli_klaar", "app_kenmerken"]) {
  meld(
    new RegExp(`fn ${cmd}\\b`).test(libRs) && new RegExp(`\\b${cmd}\\b[^\\n]*generate_handler|generate_handler[\\s\\S]{0,900}\\b${cmd}\\b`).test(libRs),
    `${cmd} is een Tauri-commando en staat in de handler`,
  );
}
meld(
  /Opdracht::Versie\s*\|\s*Opdracht::Help/.test(libRs) || /Opdracht::Versie[\s\S]{0,200}Opdracht::Help/.test(libRs),
  "run() drukt --version en --help af vóór er een venster komt",
);

console.log("\nDe kenmerken van de build");
const omgevings = ["OCSS_EDITION", "OCSS_BUILD_TAG", "OCSS_GIT_COMMIT", "OCSS_BUILD_DATE"];
meld(
  omgevings.every((v) => kenmerkenRs.includes(`env!("${v}")`)),
  "kenmerken.rs leest de vier buildvariabelen",
  omgevings.filter((v) => !kenmerkenRs.includes(`env!("${v}")`)),
);
const buildRs = lees("packages/desktop/src-tauri/build.rs");
meld(
  omgevings.every((v) => buildRs.includes(`cargo:rustc-env=${v}=`)),
  "build.rs schrijft de vier buildvariabelen",
  omgevings.filter((v) => !buildRs.includes(`cargo:rustc-env=${v}=`)),
);
meld(/invoke[^(]*\(\s*"app_kenmerken"/.test(kenmerkenTs), "de frontend vraagt de kenmerken aan Rust");
const appInfo = projectTs.slice(projectTs.indexOf('"app_info"'));
meld(
  ["edition", "tag", "commit", "buildDate"].every((v) => appInfo.includes(`${v}:`)),
  "app_info geeft edition, tag, commit en buildDate",
  ["edition", "tag", "commit", "buildDate"].filter((v) => !appInfo.includes(`${v}:`)),
);

console.log("\nDe tokenloze health-route");
meld(
  brugRs.includes('HEALTH_PATH: &str = "/api/v1/health"') || brugRs.includes('"/api/v1/health"'),
  "de brug kent het pad /api/v1/health",
);
meld(
  /fn is_public[\s\S]{0,400}HEALTH_PATH/.test(brugRs) && /OPENAPI_PATH\s*\|\|\s*path\s*==\s*HEALTH_PATH/.test(brugRs),
  "is_public laat alleen GET openapi.json en GET health door",
);
meld(
  /fn health_body[\s\S]{0,900}"edition"/.test(brugRs) && /fn health_body[\s\S]{0,900}"port"/.test(brugRs),
  "health_body meldt editie en poort",
);
meld(!/fn health_body[\s\S]{0,900}token/i.test(brugRs), "health_body bevat geen token");
meld(
  /"\/api\/v1\/health"/.test(openapiTs) && /security:\s*\[\]/.test(openapiTs),
  "de OpenAPI-specificatie documenteert health zonder beveiliging",
);

console.log("\nDe opdrachten in de frontend");
for (const tool of ["calc_evaluate", "sheet_add", "export_pdf"]) {
  meld(cliTs.includes(`"${tool}"`), `cli.ts gebruikt de bestaande tool ${tool}`);
}
meld(
  cliTs.includes("voerToolUit") && cliTs.includes("MCP_TOOLS"),
  "cli.ts gaat via dezelfde registry als MCP en REST",
);
meld(/command === "headless"/.test(cliTs) && /return true/.test(cliTs), "de hoofdmodus slaat het venster over");
meld(cliTs.includes("build:") && cliTs.includes("edition"), "de uitvoer van eval meldt de editie van de build");

console.log("\nDe uitgave-workflow");
meld(workflow.includes("--features rapportengine"), "de TW-build compileert de rapportengine (P0-2)");
meld(
  workflow.includes("-tw.") && /tauri\.conf\.json/.test(workflow),
  "de workflow zet de versie van tauri.conf.json op X.Y.Z-tw.N",
);
meld(
  ["OCSS_BUILD_TAG", "OCSS_EDITION", "OCSS_GIT_COMMIT", "OCSS_BUILD_DATE"].every((v) => workflow.includes(v)),
  "de workflow geeft de vier buildvariabelen mee",
);

console.log("\nDe documentatie");
meld(
  ["--version", "--help", "--headless", "eval", "render", "--pdf"].every((v) => docCli.includes(v)),
  "docs/tw/無頭模式與CLI.md noemt elke opdracht",
  ["--version", "--help", "--headless", "eval", "render", "--pdf"].filter((v) => !docCli.includes(v)),
);
meld(docApi.includes("/api/v1/health"), "docs/api.md documenteert de health-route");
meld(
  docCli.includes("health") && docCli.includes("edition"),
  "de CLI-documentatie legt uit hoe je de editie herkent",
);

console.log("");
if (fouten === 0) console.log("Alle controles op de command line zijn groen.");
else console.log(`${fouten} controle(s) gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
