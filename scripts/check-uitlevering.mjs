/**
 * Wat er uitgeleverd wordt: de vaste eisen aan de Windows-installer en de opbouw
 * van de releaseworkflows. Bewaakt dat niemand per ongeluk ondertekening, WebView2 of
 * een controlestap weghaalt; of de handtekeningen zelf kloppen, zien de scripts in
 * scripts/release pas bij het bouwen.
 */
import { existsSync, readFileSync } from "node:fs";

const lees = (pad) => readFileSync(new URL(`../${pad}`, import.meta.url), "utf8");
let fouten = 0;
function klopt(naam, gelijk) {
  console.log(`  ${gelijk ? "✓" : "✗"} ${naam}`);
  if (!gelijk) fouten++;
}

console.log("tauri.conf.json");
const conf = JSON.parse(lees("packages/desktop/src-tauri/tauri.conf.json"));
const venster = conf.bundle.windows;
klopt("WebView2: embedBootstrapper, stil", venster.webviewInstallMode?.type === "embedBootstrapper" && venster.webviewInstallMode?.silent === true);
klopt("WebView2Loader.dll in bundle.resources", conf.bundle.resources?.includes("WebView2Loader.dll"));
const dllPad = "../packages/desktop/src-tauri/WebView2Loader.dll";
const dll = existsSync(new URL(dllPad, import.meta.url)) ? readFileSync(new URL(dllPad, import.meta.url)) : Buffer.alloc(0);
klopt("WebView2Loader.dll staat in src-tauri en is een DLL", dll.length > 100_000 && dll[0] === 0x4d && dll[1] === 0x5a);
// Een MSI accepteert als hoofdversie maximaal 255, dus 2026.x past er niet in.
const doelen = conf.bundle.targets;
klopt("alleen NSIS op Windows, geen MSI", Array.isArray(doelen) && doelen.includes("nsis") && !doelen.includes("msi"));
klopt("geen signCommand in de config: lokale builds hebben geen geheimen", venster.signCommand === undefined);

console.log("Workflows");
const WORKFLOWS = ["release", "nightly", "build", "desktop-ondertekend", "release-concept", "release-controleren"];
const stroom = Object.fromEntries(WORKFLOWS.map((w) => [w, lees(`.github/workflows/${w}.yml`)]));
for (const w of WORKFLOWS) {
  klopt(`${w}: geen route om een fout te negeren of niet te tekenen`, !/continue-on-error|--no-sign|tauri-action/.test(stroom[w]));
}
for (const w of ["release", "nightly", "build"]) {
  klopt(`${w}: bouwt via desktop-ondertekend met de geheimen`, /uses: \.\/\.github\/workflows\/desktop-ondertekend\.yml[\s\S]*?secrets: inherit/.test(stroom[w]));
}
for (const w of ["release", "nightly"]) {
  const publiceren = stroom[w].slice(stroom[w].indexOf("\n  publiceren:"));
  klopt(`${w}: publiceren wacht op de controle van het concept`, /needs: \[voorbereiden, concept, controleren\]/.test(publiceren));
  klopt(`${w}: het concept wacht op het bouwen`, /needs: \[voorbereiden, bouwen\]/.test(stroom[w]));
  klopt(`${w}: alleen de stap publiceren maakt een release openbaar`, (stroom[w].match(/-F draft=false/g) ?? []).length === 1 && publiceren.includes("-F draft=false"));
}
klopt("release-concept: maakt alleen een concept", /gh release create .* --draft/.test(stroom["release-concept"]) && !stroom["release-concept"].includes("draft=false"));
klopt("build: publiceert niets", !/gh release|releases\//.test(stroom.build));
const ondertekend = stroom["desktop-ondertekend"];
// De installers zelf; de controle van alleen de FEM-server vóór het bouwen telt hier niet.
const voor = (stap, upload) => ondertekend.includes(stap) && ondertekend.indexOf(stap) < ondertekend.indexOf(upload);
klopt("Windows: controle vóór de upload", voor("windows-controleren.ps1 -Map", "name: open-calcsheet-studio-windows"));
klopt("macOS: controle vóór de upload", voor("macos-controleren.sh packages/", "name: open-calcsheet-studio-macos"));
klopt("Linux: controle vóór de upload", ondertekend.indexOf("linux-controleren.sh") < ondertekend.indexOf("name: open-calcsheet-studio-linux"));
klopt("macOS: de dmg wordt zelf genotariseerd", ondertekend.includes("macos-notariseren.sh"));
for (const script of ["windows-controleren.ps1", "macos-controleren.sh", "linux-controleren.sh"]) {
  klopt(`release-controleren: draait ${script}`, stroom["release-controleren"].includes(script));
}

console.log("Vertrouwde sleutel");
const vingerafdruk = lees("scripts/release/openaec-vingerafdruk.txt").trim();
klopt("vingerafdruk is 40 hexadecimale tekens", /^[0-9A-F]{40}$/.test(vingerafdruk));
for (const pad of [".github/workflows/release.yml", ".github/workflows/nightly.yml", "docs/ondertekening.md"]) {
  klopt(`${pad} noemt dezelfde vingerafdruk`, lees(pad).includes(vingerafdruk));
}

if (fouten > 0) {
  console.error(`\n${fouten} controle(s) gezakt.`);
  process.exit(1);
}
console.log("\nDe uitlevering klopt.");
