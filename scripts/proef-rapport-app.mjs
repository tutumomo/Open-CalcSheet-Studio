/**
 * Proef in de gebouwde app: één klik op "Rapport (PDF)" plus een bestandsnaam levert
 * een PDF, zonder printdialoog. Alleen op Windows en met de hand te draaien, dus niet
 * in check-alles: de nagebootste weg daarvan staat in scripts/check-rapport-pdf.mjs.
 *
 * Het script start de app met het gemengde project (scripts/lib/gemengd-project.mjs),
 * opent elk blad een keer, klikt de knop, vult de bestandsdialoog van het systeem in
 * en wacht op het bestand. Daarna:
 *
 *   node scripts/check-rapport-pdf.mjs --app-pdf <uit.pdf> --schaal <schermschaal>
 *
 * De app bouwen, los van de eigen instellingen en van een app die al draait: een eigen
 * identifier (dus eigen map voor instellingen en WebView2) en een eigen target-map.
 * Zonder dat deelt de proef zijn WebView2-map met de draaiende app.
 *
 *   cd packages/desktop
 *   CARGO_TARGET_DIR=<map> npx tauri build --no-bundle \
 *     --config '{"identifier":"studio.openstructuralcalculation.proefpdf"}'
 *
 * Draaien:  node scripts/proef-rapport-app.mjs <app.exe> <uit.pdf> [--vergrendeld]
 *           --vergrendeld zet het doelbestand op slot zodra de dialoog dicht is: dan
 *           moet er een melding komen en de printdialoog openen in plaats van een PDF.
 *           (Staat het bestand al op slot als je het kiest, dan weigert de dialoog
 *           van Windows het zelf en kom je niet bij het schrijven.)
 */
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { bouwGemengdProject } from "./lib/gemengd-project.mjs";

const args = process.argv.slice(2).filter((a) => !a.startsWith("--"));
if (args.length !== 2) {
  console.error("gebruik: node scripts/proef-rapport-app.mjs <app.exe> <uit.pdf> [--vergrendeld]");
  process.exit(2);
}
const [exe, uit] = args.map((a) => resolve(a));
const vergrendeld = process.argv.includes("--vergrendeld");
if (!existsSync(exe)) throw new Error(`${exe} bestaat niet`);
if (existsSync(uit)) throw new Error(`${uit} bestaat al; de dialoog zou om bevestiging vragen`);
mkdirSync(dirname(uit), { recursive: true });

const wacht = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (tekst) => console.log(`[${(performance.now() / 1000).toFixed(1)} s] ${tekst}`);

const vrijePoort = () => new Promise((ja, nee) => {
  const s = createServer();
  s.on("error", nee);
  s.listen(0, "127.0.0.1", () => {
    const { port } = s.address();
    s.close(() => ja(port));
  });
});

/** Win32 voor de dialogen: die geven hun naamveld en knop niet door aan UI Automation. */
const DIALOOG = `
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class Dialoog {
  delegate bool Cb(IntPtr h, IntPtr l);
  [DllImport("user32")] static extern bool EnumWindows(Cb f, IntPtr l);
  [DllImport("user32")] static extern bool EnumChildWindows(IntPtr p, Cb f, IntPtr l);
  [DllImport("user32")] static extern uint GetWindowThreadProcessId(IntPtr h, out uint pid);
  [DllImport("user32", CharSet = CharSet.Unicode)] static extern int GetClassName(IntPtr h, StringBuilder s, int n);
  [DllImport("user32", CharSet = CharSet.Unicode)] static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32")] static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32")] static extern int GetDlgCtrlID(IntPtr h);
  [DllImport("user32")] static extern IntPtr GetDlgItem(IntPtr h, int id);
  [DllImport("user32", CharSet = CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, string l);
  [DllImport("user32", CharSet = CharSet.Unicode)] static extern IntPtr SendMessage(IntPtr h, uint m, IntPtr w, StringBuilder l);
  [DllImport("user32")] static extern bool PostMessage(IntPtr h, uint m, IntPtr w, IntPtr l);
  static string Klasse(IntPtr h) { var s = new StringBuilder(64); GetClassName(h, s, 64); return s.ToString(); }
  public static IntPtr Zoek(uint pid) {
    IntPtr gevonden = IntPtr.Zero;
    EnumWindows((h, l) => {
      uint p; GetWindowThreadProcessId(h, out p);
      if (p == pid && IsWindowVisible(h) && Klasse(h) == "#32770") { gevonden = h; return false; }
      return true;
    }, IntPtr.Zero);
    return gevonden;
  }
  public static IntPtr Naamveld(IntPtr dialoog) {
    IntPtr gevonden = IntPtr.Zero;
    EnumChildWindows(dialoog, (h, l) => {
      if (GetDlgCtrlID(h) == 1001 && Klasse(h) == "Edit") { gevonden = h; return false; }
      return true;
    }, IntPtr.Zero);
    return gevonden;
  }
  public static string Titel(IntPtr h) { var s = new StringBuilder(256); GetWindowText(h, s, 256); return s.ToString(); }
  public static string Tekst(IntPtr h) { var s = new StringBuilder(1024); SendMessage(h, 0x000D, (IntPtr)1024, s); return s.ToString(); }
  public static void ZetTekst(IntPtr h, string t) { SendMessage(h, 0x000C, IntPtr.Zero, t); }
  public static void Sluit(IntPtr dialoog) { PostMessage(dialoog, 0x0010, IntPtr.Zero, IntPtr.Zero); }
  public static void Opslaan(IntPtr dialoog) { PostMessage(GetDlgItem(dialoog, 1), 0x00F5, IntPtr.Zero, IntPtr.Zero); }
}
'@

function WachtOpDialoog([int]$proces) {
  $d = [IntPtr]::Zero
  for ($i = 0; $i -lt 240 -and $d -eq [IntPtr]::Zero; $i++) {
    $d = [Dialoog]::Zoek($proces)
    if ($d -eq [IntPtr]::Zero) { Start-Sleep -Milliseconds 250 }
  }
  if ($d -eq [IntPtr]::Zero) { Write-Error 'geen dialoog'; exit 1 }
  return $d
}
function WachtTotDicht([int]$proces) {
  for ($i = 0; $i -lt 240 -and [Dialoog]::Zoek($proces) -ne [IntPtr]::Zero; $i++) { Start-Sleep -Milliseconds 50 }
}
`;

function powershell(script) {
  const r = spawnSync("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command", DIALOOG + script], { encoding: "utf8", timeout: 90000 });
  if (r.status !== 0) throw new Error(`dialoog: ${r.stderr || r.stdout}`);
  log(r.stdout.trim().replace(/\r?\n/g, ", "));
}

/** Vult de bestandsdialoog van dit proces in en wacht tot hij dicht is. Geen toetsenbordfocus nodig. */
function vulDialoogIn(pid, pad) {
  powershell(`
$dialoog = WachtOpDialoog ${pid}
$naam = [Dialoog]::Naamveld($dialoog)
if ($naam -eq [IntPtr]::Zero) { Write-Error 'geen naamveld in de dialoog'; exit 1 }
Write-Output ('titel: ' + [Dialoog]::Titel($dialoog))
Write-Output ('voorstel: ' + [Dialoog]::Tekst($naam))
[Dialoog]::ZetTekst($naam, '${pad.replace(/'/g, "''")}')
[Dialoog]::Opslaan($dialoog)
WachtTotDicht ${pid}
`);
}

/** Wacht op de melding van de app, geeft de tekst door en sluit hem. */
function sluitMelding(pid) {
  powershell(`
$melding = WachtOpDialoog ${pid}
Add-Type -AssemblyName UIAutomationClient,UIAutomationTypes
$AE = [System.Windows.Automation.AutomationElement]
$tekst = New-Object System.Windows.Automation.PropertyCondition($AE::ControlTypeProperty, [System.Windows.Automation.ControlType]::Text)
$delen = $AE::FromHandle($melding).FindAll([System.Windows.Automation.TreeScope]::Descendants, $tekst) | ForEach-Object { $_.Current.Name }
Write-Output ('melding: ' + ($delen -join ' '))
[Dialoog]::Sluit($melding)
WachtTotDicht ${pid}
`);
}

/** Een klein stukje DevTools: evalueren in de pagina. */
async function verbind(poort) {
  let doel;
  for (let i = 0; i < 300 && !doel; i++) {
    try {
      const lijst = await (await fetch(`http://127.0.0.1:${poort}/json/list`, { signal: AbortSignal.timeout(1000) })).json();
      doel = lijst.find((t) => t.type === "page" && /tauri\.localhost|localhost/.test(t.url));
    } catch {
      // nog niet klaar
    }
    if (!doel) await wacht(200);
  }
  // Een tweede app met dezelfde identifier haakt aan bij de WebView2 van de eerste, zonder debugpoort.
  if (!doel) throw new Error("geen pagina op de debugpoort; draait er nog een proef of een app met deze identifier?");
  const ws = new WebSocket(doel.webSocketDebuggerUrl);
  await new Promise((ja, nee) => {
    ws.addEventListener("open", ja, { once: true });
    ws.addEventListener("error", nee, { once: true });
  });
  let volgende = 0;
  const open = new Map();
  const stuur = (methode, params = {}) => new Promise((ja, nee) => {
    const id = ++volgende;
    open.set(id, { ja, nee });
    ws.send(JSON.stringify({ id, method: methode, params }));
  });
  ws.addEventListener("message", (ev) => {
    const b = JSON.parse(ev.data);
    if (b.id !== undefined) {
      const w = open.get(b.id);
      open.delete(b.id);
      if (b.error) w?.nee(new Error(b.error.message));
      else w?.ja(b.result);
    }
  });
  const evalueer = async (expressie) => {
    const r = await stuur("Runtime.evaluate", { expression: expressie, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
    return r.result.value;
  };
  return { evalueer, sluit: () => ws.close() };
}

const map = mkdtempSync(join(tmpdir(), "proef-rapport-app-"));
const project = join(map, "gemengd.ifccalculation");
writeFileSync(project, await bouwGemengdProject());

const poort = await vrijePoort();
const app = spawn(exe, [project], {
  stdio: "ignore",
  env: { ...process.env, WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${poort}` },
});
app.on("exit", (code, signaal) => log(`de app is gestopt (code ${code}${signaal ? `, ${signaal}` : ""})`));
let slot = null;
let fouten = 0;
try {
  const { evalueer, sluit } = await verbind(poort);
  log(`app gestart, proces ${app.pid}`);

  // Wachten tot het startbestand open is: Project en Rapport staan er meteen, de bladen pas
  // daarna. Het welkomstvenster mag er staan, de klik gaat erlangs.
  for (let i = 0; i < 300; i++) {
    if (await evalueer(`document.querySelectorAll(".pb-blad:not(.pb-knoop) .pb-open").length`) > 0) break;
    await wacht(200);
  }
  const bladen = await evalueer(`(async () => {
    const rijen = [...document.querySelectorAll(".pb-blad:not(.pb-knoop) .pb-open")];
    for (const rij of rijen) {
      rij.click();
      await new Promise((r) => setTimeout(r, 900));
    }
    return rijen.length;
  })()`);
  if (bladen === 0) throw new Error("het project is niet geopend: geen bladen in de projectboom");
  log(`${bladen} bladen geopend voor de beginwaarden van hun beeld`);
  log(`schermschaal ${await evalueer("devicePixelRatio")}: geef die mee aan check-rapport-pdf.mjs met --schaal`);

  // Vooraf gestart, want PowerShell start traag; het slot volgt op het teken na de dialoog.
  const teken = `${uit}.slot`;
  if (vergrendeld) {
    slot = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-Command",
      `while (-not (Test-Path '${teken.replace(/'/g, "''")}')) { Start-Sleep -Milliseconds 50 }; $s = [IO.File]::Open('${uit.replace(/'/g, "''")}', 'OpenOrCreate', 'ReadWrite', 'None'); Start-Sleep -Seconds 600; $s.Close()`], { stdio: "ignore" });
    await wacht(1500);
  }

  const begin = Date.now();
  await evalueer(`(() => {
    const knop = [...document.querySelectorAll(".ribbon-btn")].find((b) => /^(Rapport|Report|報告)$/.test(b.textContent.trim()));
    if (!knop) throw new Error("de knop Rapport staat niet in het lint");
    knop.click();
    return true;
  })()`);
  log("op de knop geklikt");
  vulDialoogIn(app.pid, uit);

  if (vergrendeld) {
    writeFileSync(teken, "");
    sluitMelding(app.pid);
    // Nu opent de printdialoog, en die houdt de pagina vast: geen antwoord is hier het goede antwoord.
    await wacht(4000);
    const stand = await Promise.race([
      evalueer(`document.documentElement.className`).then((klasse) => `de pagina antwoordt: "${klasse}"`),
      wacht(3000).then(() => "de pagina wordt vastgehouden"),
    ]);
    const doelen = await (await fetch(`http://127.0.0.1:${poort}/json/list`)).json();
    log(`printdialoog: ${stand}; doelen: ${doelen.map((d) => d.url.slice(0, 40)).join(", ")}`);
    if (!stand.includes("vastgehouden")) fouten++;
    log("tien seconden om op het scherm te kijken");
    await wacht(10000);
    rmSync(teken, { force: true });
  } else {
    let status = "";
    for (let i = 0; i < 600 && !status.includes(basename(uit)); i++) {
      status = await evalueer(`document.querySelector(".status-bar-left .status-item-label")?.textContent ?? ""`);
      if (app.exitCode !== null) throw new Error(`de app stopte tijdens het afdrukken (code ${app.exitCode})`);
      await wacht(200);
    }
    log(`statusbalk: ${status}`);
    if (!existsSync(uit) || statSync(uit).size === 0) throw new Error(`${uit} is niet geschreven`);
    const kop = readFileSync(uit).subarray(0, 5).toString("latin1");
    log(`${uit}: ${Math.round(statSync(uit).size / 1024)} kB, begint met ${kop}, ${((Date.now() - begin) / 1000).toFixed(1)} s na de klik`);
    if (kop !== "%PDF-") fouten++;
    const na = await evalueer(`({
      rapportdruk: document.documentElement.classList.contains("rapportdruk"),
      kopie: document.querySelectorAll(".rpa-drukvellen").length,
      voorbeeld: document.querySelectorAll(".av-vellen-binnen .av-pagina").length,
    })`);
    log(`na afloop: ${JSON.stringify(na)}`);
    if (na.rapportdruk || na.kopie !== 0 || na.voorbeeld === 0) fouten++;
  }
  sluit();
} catch (e) {
  console.error(e?.stack ?? e);
  fouten++;
} finally {
  slot?.kill();
  app.kill();
  await wacht(500);
  rmSync(map, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
process.exit(fouten === 0 ? 0 : 1);
