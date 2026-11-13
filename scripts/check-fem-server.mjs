/**
 * Controle van het meeleveren van Open FEM Studio (scripts/haal-fem-server.mjs).
 *
 * Toetst:
 *   • versie.json is geldig: een versie, de openbare release (deze repository, tag
 *     fem-server-<versie>), de herkomst, en per platform een bestand met een sha256
 *     van 64 hextekens;
 *   • zonder bron geen server: staat er een server in versie.json, dan ook het
 *     bronarchief en de vermeldingen van derden, en de licentietekst staat in git;
 *   • de keuze van het bestand per platform, ook als er (nog) geen is;
 *   • de controle van de sha256: goed, fout, en een bestand dat er niet is;
 *   • fem-studio/* staat in bundle.resources en het ophalen in beforeBuildCommand,
 *     de server zelf staat niet in git;
 *   • de namen in de release van FEM Studio (openaec-mcp-server_<versie>_<platform>,
 *     het bronarchief en de vermeldingen) en het vullen van versie.json uit
 *     SHA256SUMS (pin-fem-server.mjs), dat alleen met --publiceer iets openbaar maakt;
 *   • de workflows: geen geheim om de server op te halen, de handtekening wordt vóór
 *     het bouwen gecontroleerd, de controles zoeken de server met zijn licentie en
 *     bronverwijzing in de installers, het bronarchief komt bij de release, en de
 *     release-tekst zegt of hij is meegeleverd.
 *
 * Het ophalen zelf (een download van de openbare release) en het publiceren toetst
 * dit script niet. De Rust-kant heeft eigen tests
 * (packages/desktop/src-tauri/fem-brug: cargo test, en met de echte server
 * cargo test -- --ignored).
 *
 * Draaien:  node scripts/check-fem-server.mjs
 */
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  BRONWIJZER, DOORGIFTE, LICENTIE, MAP, VERMELDINGEN, bronNaam, bronwijzer, ditPlatform, doorgifteTag, downloadUrl, kiesBestand,
  kiesBijlagen, klopt, leesSha256Sums, leesVersie, PLATFORMEN, serverNaam, vermeldingenNaam,
} from "./haal-fem-server.mjs";
import { HERKOMST, leesRelease, maakVersie, releaseTekst } from "./pin-fem-server.mjs";

let fouten = 0;
function meld(ok, tekst) {
  console.log(`  ${ok ? "✓" : "✗"}  ${tekst}`);
  if (!ok) fouten++;
}

const hier = dirname(fileURLToPath(import.meta.url));
const tauriMap = join(hier, "..", "packages", "desktop", "src-tauri");

console.log("\nversie.json");
{
  const v = leesVersie();
  meld(/^\d{4}\.\d{1,2}\.\d+$/.test(v.versie), `een versie als jaar.week.nummer: ${v.versie}`);
  meld(v.repo === DOORGIFTE && v.tag === doorgifteTag(v.versie), "de openbare release: deze repository, tag fem-server-<versie>");
  meld(v.herkomst?.repo === HERKOMST && v.herkomst?.tag === `v${v.versie}`, "de herkomst: de release van FEM Studio bij die versie");
  const bestanden = Object.entries(v.bestanden ?? {});
  meld(bestanden.every(([p]) => PLATFORMEN.includes(p)), "alleen bekende platformen");
  meld(bestanden.every(([p]) => kiesBestand(v, p) !== null), "elk bestand met een naam en een sha256 van 64 hextekens");
  meld(bestanden.every(([p, b]) => b.naam === serverNaam(v.versie, p)), "elk bestand heet openaec-mcp-server_<versie>_<platform>");
  // Zonder bron geen binary: de server valt onder de AGPL-3.0.
  const bijlagen = kiesBijlagen(v);
  meld(bestanden.length === 0 || bijlagen !== null, "een server alleen met het bronarchief en de vermeldingen van derden");
  if (bijlagen) {
    meld(bijlagen.bron.naam === bronNaam(v.versie) && bijlagen.vermeldingen.naam === vermeldingenNaam(v.versie), "het bronarchief en de vermeldingen zijn van dezelfde versie");
    meld(bijlagen.bron.url === downloadUrl(v.repo, v.tag, bijlagen.bron.naam), "het adres van het bronarchief is dat van de openbare release");
  } else {
    meld(v.bron === null && v.vermeldingen === null, "zonder server: geen bronarchief en geen vermeldingen");
  }
  const licentie = readFileSync(join(MAP, LICENTIE), "utf8");
  meld(licentie.includes("GNU AFFERO GENERAL PUBLIC LICENSE") && licentie.includes("Version 3, 19 November 2007"), `${LICENTIE} is de tekst van de AGPL-3.0`);
}

console.log("\nDe namen in de release van FEM Studio en SHA256SUMS");
{
  meld(serverNaam("2026.46.0", "windows-x64") === "openaec-mcp-server_2026.46.0_windows-x64.exe", "Windows met .exe");
  meld(serverNaam("2026.46.0", "macos-universal") === "openaec-mcp-server_2026.46.0_macos-universal", "macOS zonder extensie");
  meld(serverNaam("2026.46.0", "linux-x64") === "openaec-mcp-server_2026.46.0_linux-x64", "Linux zonder extensie");
  const a = "a".repeat(64);
  const b = "B".repeat(64);
  const sums = [
    `${a}  Open.FEM.Studio_2026.46.0_x64-setup.exe`,
    `${a}  openaec-mcp-server_2026.46.0_windows-x64.exe`,
    `${b} *openaec-mcp-server_2026.46.0_linux-x64`,
    `${a}  openaec-mcp-server_2026.45.0_macos-universal`,
    "",
  ].join("\r\n");
  const gelezen = leesSha256Sums(sums, "2026.46.0");
  meld(gelezen["windows-x64"]?.sha256 === a, "een regel met twee spaties");
  meld(gelezen["linux-x64"]?.sha256 === "b".repeat(64), "een regel met * (binair), de hash in kleine letters");
  meld(gelezen["macos-universal"] === undefined, "een server van een andere versie telt niet");
  meld(Object.keys(gelezen).length === 2, "de installers tellen niet");
  const zonder = leesRelease(sums, "2026.46.0");
  meld(zonder.bijlagen === null && zonder.fouten.length === 2, "pin-fem-server: zonder bronarchief en vermeldingen in SHA256SUMS geen server");
  const c = "c".repeat(64);
  const d = "d".repeat(64);
  const compleet = leesRelease([sums, `${c}  openaec-mcp-server_2026.46.0_source.tar.gz`, `${d}  openaec-mcp-server_2026.46.0_THIRD-PARTY-NOTICES.txt`].join("\n"), "2026.46.0");
  meld(compleet.fouten.length === 0 && compleet.bijlagen?.bron.sha256 === c && compleet.bijlagen?.vermeldingen.sha256 === d, "pin-fem-server: het bronarchief en de vermeldingen uit SHA256SUMS");
  meld(compleet.verplicht.length === 4 && compleet.optioneel.includes("SHA256SUMS.asc") && compleet.optioneel.includes("openaec-mcp-server_2026.46.0_linux-x64.asc"),
    "pin-fem-server: de servers, de bron en de vermeldingen gaan mee, de handtekeningen als ze er zijn");
  const nieuw = maakVersie("2026.46.0", compleet.bestanden, compleet.bijlagen);
  meld(nieuw.repo === DOORGIFTE && nieuw.tag === "fem-server-2026.46.0", "pin-fem-server: de openbare release in deze repository");
  meld(nieuw.herkomst.repo === HERKOMST && nieuw.herkomst.tag === "v2026.46.0", "pin-fem-server: de herkomst");
  meld(nieuw.bron.url === `https://github.com/${DOORGIFTE}/releases/download/fem-server-2026.46.0/openaec-mcp-server_2026.46.0_source.tar.gz`, "pin-fem-server: het adres van het bronarchief");
  meld(kiesBestand(nieuw, "windows-x64")?.naam === "openaec-mcp-server_2026.46.0_windows-x64.exe", "pin-fem-server: haal-fem-server vindt het bestand");
  meld(kiesBijlagen(nieuw) !== null && kiesBijlagen(maakVersie("2026.46.0", compleet.bestanden)) === null, "haal-fem-server: de bijlagen, en zonder bijlagen geen server");
  const wijzer = bronwijzer(nieuw, kiesBijlagen(nieuw));
  meld(wijzer.includes("2026.46.0") && wijzer.includes(nieuw.bron.naam) && wijzer.includes(c) && wijzer.includes(nieuw.bron.url) && wijzer.includes(LICENTIE) && wijzer.includes(VERMELDINGEN),
    `${BRONWIJZER}: de versie, de licentie, de vermeldingen en waar de bron staat`);
  const tekst = releaseTekst("2026.46.0", compleet.bijlagen);
  meld(tekst.includes("GNU Affero General Public License") && tekst.includes(nieuw.bron.naam) && tekst.includes(c), "pin-fem-server: de tekst van de openbare release noemt de licentie en de bron");
  const pin = readFileSync(join(hier, "pin-fem-server.mjs"), "utf8").replace(/\r\n/g, "\n");
  const publiceren = pin.indexOf('"release", "create"');
  meld(publiceren > pin.indexOf("if (!publiceer) {") && pin.indexOf("if (!publiceer) {") > 0 && (pin.match(/"release", "create"/g) ?? []).length === 1,
    "pin-fem-server: maakt alleen met --publiceer een release");
  meld(pin.indexOf('writeFileSync(join(MAP, "versie.json")') > publiceren, "pin-fem-server: schrijft versie.json pas na het publiceren");
}

console.log("\nHet bestand per platform");
{
  const leeg = { versie: "2026.45.0", bestanden: {} };
  meld(kiesBestand(leeg, "windows-x64") === null, "zonder bestanden: geen server, de app bouwt zonder");
  const sha = "a".repeat(64);
  const met = { bestanden: { "linux-x64": { naam: "openaec-mcp-server-linux-x64", sha256: sha } } };
  meld(kiesBestand(met, "linux-x64")?.naam === "openaec-mcp-server-linux-x64", "een platform dat erin staat");
  meld(kiesBestand(met, "macos-universal") === null, "een platform dat er niet in staat");
  meld(kiesBestand({ bestanden: { "linux-x64": { naam: "x", sha256: "kort" } } }, "linux-x64") === null, "een sha256 die geen 64 hextekens is, telt niet");
  meld(ditPlatform("win32") === "windows-x64" && ditPlatform("darwin") === "macos-universal" && ditPlatform("linux") === "linux-x64", "de platformnamen");
}

console.log("\nDe sha256");
{
  const map = mkdtempSync(join(tmpdir(), "check-fem-server-"));
  try {
    const pad = join(map, "server");
    writeFileSync(pad, "proef");
    const goed = createHash("sha256").update("proef").digest("hex");
    meld(klopt(pad, goed), "de goede hash klopt");
    meld(klopt(pad, goed.toUpperCase()), "ook in hoofdletters");
    meld(!klopt(pad, "0".repeat(64)), "een andere hash klopt niet");
    meld(!klopt(join(map, "weg"), goed), "een bestand dat er niet is, klopt niet");
  } finally {
    rmSync(map, { recursive: true, force: true });
  }
}

console.log("\nDe bundel");
{
  const conf = JSON.parse(readFileSync(join(tauriMap, "tauri.conf.json"), "utf8"));
  meld(conf.bundle.resources.includes("fem-studio/*"), "fem-studio/* staat in bundle.resources");
  meld(/haal-fem-server\.mjs --als-nodig/.test(conf.build.beforeBuildCommand), "beforeBuildCommand haalt de server als dat nodig is");
  const negeer = readFileSync(join(hier, "..", ".gitignore"), "utf8");
  meld(negeer.includes("packages/desktop/src-tauri/fem-studio/openaec-mcp-server"), "de server zelf staat niet in git");
  meld([VERMELDINGEN, BRONWIJZER].every((n) => negeer.includes(`packages/desktop/src-tauri/fem-studio/${n}`)), "de opgehaalde vermeldingen en de gemaakte bronverwijzing staan niet in git");
}

console.log("\nDe workflows");
{
  const lees = (pad) => readFileSync(join(hier, "..", pad), "utf8").replace(/\r\n/g, "\n");
  const ondertekend = lees(".github/workflows/desktop-ondertekend.yml");
  // De stappen van de jobs, elk vanaf "      - " tot de volgende, zonder commentaar.
  const stappen = ondertekend
    .split("\n")
    .filter((r) => !r.trim().startsWith("#"))
    .join("\n")
    .split(/\n(?=      - )/);
  // De server en zijn bron staan in een openbare release: ophalen vraagt geen geheim.
  const ophalen = stappen.filter((s) => s.includes("name: FEM Studio ophalen"));
  meld(ophalen.length === 3 && ophalen.every((s) => s.includes("run: node scripts/haal-fem-server.mjs") && !s.includes("secrets.")),
    "de drie stappen 'FEM Studio ophalen' halen de server zonder geheim");
  const alle = [".github/workflows/desktop-ondertekend.yml", ".github/workflows/release.yml", ".github/workflows/nightly.yml", ".github/workflows/build.yml",
    ".github/workflows/release-concept.yml", ".github/workflows/release-controleren.yml", ".github/workflows/ci.yml"];
  meld(alle.every((pad) => !lees(pad).includes("FEM_STUDIO_TOKEN")), "geen workflow noemt FEM_STUDIO_TOKEN nog");
  const bronStap = stappen.find((s) => s.includes("name: Bronarchief van de FEM-server ophalen")) ?? "";
  meld(bronStap.includes("haal-fem-server.mjs --bron") && ["windows", "macos", "linux"].every((p) => bronStap.includes(`needs.${p}.outputs.fem-studio == 'meegeleverd'`)),
    "gaat de server op een platform mee, dan haalt de job het bronarchief op");
  meld(ondertekend.includes("name: open-calcsheet-studio-fem-bron"), "het bronarchief gaat als artifact naar de release");
  meld(ondertekend.includes("attached to this release: \\`${BRON}\\`") && ondertekend.includes("GNU AGPL-3.0"), "de release-tekst noemt de licentie van de server en het bronarchief");
  const voor = (a, b) => ondertekend.includes(a) && ondertekend.indexOf(a) < ondertekend.indexOf(b);
  meld(voor("windows-controleren.ps1 -Bestand packages/desktop/src-tauri/fem-studio/openaec-mcp-server.exe", "name: Build and sign Tauri app"),
    "Windows: de handtekening van de server vóór het bouwen");
  meld(voor("macos-controleren.sh --fem-server packages/desktop/src-tauri/fem-studio/openaec-mcp-server", "name: Build, sign and notarize Tauri app"),
    "macOS: de handtekening van de server vóór het bouwen en notariseren");
  meld((ondertekend.match(/FEM_STUDIO_VEREIST: \$\{\{ steps\.fem\.outputs\.status == 'meegeleverd' \}\}/g) ?? []).length === 3,
    "de controle van de installers eist de server op elk platform waar hij is opgehaald");
  for (const w of ["release", "nightly"]) {
    const tekst = lees(`.github/workflows/${w}.yml`);
    meld(tekst.includes("${{ needs.bouwen.outputs.fem-studio-tekst }}"), `${w}: de release-tekst zegt of FEM Studio is meegeleverd`);
    meld((tekst.match(/fem-studio: \$\{\{ needs\.bouwen\.outputs\.fem-studio-platformen \}\}/g) ?? []).length >= 2,
      `${w}: het concept en de controle weten waar de server in zit`);
  }
  const concept = lees(".github/workflows/release-concept.yml");
  meld((concept.match(/FEM_BRON_VEREIST: \$\{\{ inputs\.fem-studio != '' \}\}/g) ?? []).length === 2, "release-concept: met de server in een installer is het bronarchief vereist");
  const controleren = lees(".github/workflows/release-controleren.yml");
  meld(["windows-x64", "macos-universal", "linux-x64"].every((p) => controleren.includes(`contains(inputs.fem-studio, '${p}')`)),
    "release-controleren: per platform of de server vereist is");
  meld(controleren.includes("FEM_BRON_VEREIST: ${{ inputs.fem-studio != '' }}"), "release-controleren: het bronarchief moet bij de release staan");
}

console.log("\nDe controlescripts");
{
  const lees = (pad) => readFileSync(join(hier, "release", pad), "utf8");
  meld(lees("windows-controleren.ps1").includes("'fem-studio'") && lees("windows-controleren.ps1").includes("FEM_STUDIO_VEREIST"),
    "Windows: zoekt fem-studio\\openaec-mcp-server.exe in de installatie");
  meld(lees("macos-controleren.sh").includes("Contents/Resources/fem-studio/openaec-mcp-server"), "macOS: zoekt de server in de app");
  meld(/runtime/.test(lees("macos-controleren.sh")) && lees("macos-controleren.sh").includes("controleer_fem_server"),
    "macOS: Developer ID, hardened runtime en tijdstempel van de server");
  meld(lees("linux-controleren.sh").includes("fem-studio/openaec-mcp-server") && lees("linux-controleren.sh").includes("--appimage-extract"),
    "Linux: zoekt de server in de .deb en de .AppImage");
  for (const [naam, script] of [["Windows", "windows-controleren.ps1"], ["macOS", "macos-controleren.sh"], ["Linux", "linux-controleren.sh"]]) {
    meld([LICENTIE, VERMELDINGEN, BRONWIJZER].every((n) => lees(script).includes(n)), `${naam}: naast de server de licentie, de vermeldingen en de verwijzing naar de bron`);
  }
  meld(lees("linux-controleren.sh").includes("FEM_BRON_VEREIST") && lees("assets-klaarzetten.sh").includes("FEM_BRON_VEREIST"),
    "de release eist het bronarchief als de server meegaat, met de sha256 uit versie.json");
}

console.log(fouten === 0 ? "\nAlles klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
