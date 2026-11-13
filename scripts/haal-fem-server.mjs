/**
 * Haalt de server van Open FEM Studio op voor de bundel van de app.
 *
 * CalcSheet levert de server mee in `packages/desktop/src-tauri/fem-studio/` en
 * start hem headless voor de normtoetsingen (src-tauri/src/fem_studio.rs).
 * `fem-studio/versie.json` pint de versie, per platform de server met zijn sha256,
 * het bronarchief van precies die versie en de vermeldingen van derden:
 *
 *   { "versie": "2026.46.0",
 *     "repo": "OpenAEC-Foundation/Open-CalcSheet-Studio", "tag": "fem-server-2026.46.0",
 *     "herkomst": { "repo": "OpenAEC-Foundation/open-fem-studio", "tag": "v2026.46.0" },
 *     "bestanden": { "windows-x64": { "naam": "…", "sha256": "…" }, … },
 *     "bron": { "naam": "…_source.tar.gz", "sha256": "…", "url": "https://…" },
 *     "vermeldingen": { "naam": "…_THIRD-PARTY-NOTICES.txt", "sha256": "…" } }
 *
 * De server valt onder de AGPL-3.0. Wie hem krijgt, heeft recht op de broncode van
 * precies die versie. Daarom staan de bestanden in een openbare release van deze
 * repository (`repo` en `tag`), en is er geen geheim nodig om ze op te halen:
 * `node scripts/pin-fem-server.mjs <tag> --publiceer` zet ze daar neer, uit de release
 * van FEM Studio, en vult versie.json. Zonder bronarchief en vermeldingen in
 * versie.json gaat er geen server mee.
 *
 * De platformen heten windows-x64, macos-universal en linux-x64. De server heet
 * openaec-mcp-server_<versie>_<platform>, op Windows met .exe (zie serverNaam).
 *
 * Naast de server komen in fem-studio/, en zo in de installer:
 *   LICENSE-AGPL-3.0.txt     de licentie (staat in git)
 *   THIRD-PARTY-NOTICES.txt  de vermeldingen van derden van deze versie (opgehaald)
 *   SOURCE.txt               welke versie het is en waar de bron staat (gemaakt)
 *
 * De server is ondertekend door FEM Studio en gaat ongewijzigd mee: Tauri tekent
 * een resource niet. De workflow controleert die handtekening vóór het bouwen
 * (scripts/release/*-controleren.*).
 *
 * Draaien:
 *   node scripts/haal-fem-server.mjs              ophalen (CI)
 *   node scripts/haal-fem-server.mjs --als-nodig  niets doen als alles er al is en
 *                                                 klopt (beforeBuildCommand)
 *   node scripts/haal-fem-server.mjs --bron <map> alleen het bronarchief, naar <map>
 *                                                 (voor de release)
 *
 * Zonder bestand voor dit platform bouwt de app zonder server; dat meldt het script
 * (in de workflow als waarschuwing) en het sluit af met 0. Een bestand met een
 * verkeerde sha256 wordt verwijderd en geeft afsluitcode 1: dat mag nooit in een
 * bundel komen. Een mislukte download geeft ook 1; alleen met --als-nodig (een
 * lokale bouw zonder netwerk) bouwt de app dan zonder server.
 *
 * In de workflow schrijft het script naar GITHUB_OUTPUT: status (meegeleverd of
 * niet-meegeleverd), versie en platform.
 */
import { createHash } from "node:crypto";
import { appendFileSync, chmodSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const hier = dirname(fileURLToPath(import.meta.url));
export const MAP = join(hier, "..", "packages", "desktop", "src-tauri", "fem-studio");
export const SERVER = join(MAP, process.platform === "win32" ? "openaec-mcp-server.exe" : "openaec-mcp-server");
export const PLATFORMEN = ["windows-x64", "macos-universal", "linux-x64"];
/** De openbare release met de servers en hun bron: in deze repository. */
export const DOORGIFTE = "OpenAEC-Foundation/Open-CalcSheet-Studio";
/** Wat naast de server in de installer staat. */
export const LICENTIE = "LICENSE-AGPL-3.0.txt";
export const VERMELDINGEN = "THIRD-PARTY-NOTICES.txt";
export const BRONWIJZER = "SOURCE.txt";

/** De naam van dit platform in `bestanden`. */
export function ditPlatform(platform = process.platform) {
  if (platform === "win32") return "windows-x64";
  if (platform === "darwin") return "macos-universal";
  return "linux-x64";
}

/** De naam van de losse server in een release van FEM Studio. */
export function serverNaam(versie, platform) {
  return `openaec-mcp-server_${versie}_${platform}${platform.startsWith("windows") ? ".exe" : ""}`;
}
/** Het bronarchief van precies die versie van de server. */
export const bronNaam = (versie) => `openaec-mcp-server_${versie}_source.tar.gz`;
/** De vermeldingen van derden bij die versie. */
export const vermeldingenNaam = (versie) => `openaec-mcp-server_${versie}_THIRD-PARTY-NOTICES.txt`;
/** De tag van de openbare release met de servers en hun bron. */
export const doorgifteTag = (versie) => `fem-server-${versie}`;
/** Waar een bestand van die release te downloaden is, zonder aanmelden. */
export const downloadUrl = (repo, tag, naam) => `https://github.com/${repo}/releases/download/${tag}/${encodeURIComponent(naam)}`;

/** Alle regels van SHA256SUMS ("<hash>  <naam>" of "<hash> *<naam>") als naam → sha256. */
export function leesHashes(tekst) {
  const hashes = new Map();
  for (const regel of tekst.split(/\r?\n/)) {
    const m = /^([0-9a-f]{64}) [ *](.+)$/i.exec(regel.trim());
    if (m) hashes.set(m[2], m[1].toLowerCase());
  }
  return hashes;
}

/**
 * De bestanden voor versie.json uit de tekst van SHA256SUMS: per platform de server
 * van deze versie, als die erin staat.
 */
export function leesSha256Sums(tekst, versie) {
  const hashes = leesHashes(tekst);
  const bestanden = {};
  for (const platform of PLATFORMEN) {
    const naam = serverNaam(versie, platform);
    if (hashes.has(naam)) bestanden[platform] = { naam, sha256: hashes.get(naam) };
  }
  return bestanden;
}

const geldig = (b) => Boolean(b) && typeof b.naam === "string" && /^[0-9a-f]{64}$/i.test(b.sha256 ?? "");

/** Het bestand voor een platform, of null als er (nog) geen is. */
export function kiesBestand(versie, platform) {
  const b = versie?.bestanden?.[platform];
  return geldig(b) ? b : null;
}

/**
 * Het bronarchief en de vermeldingen van derden uit versie.json, of null als een van
 * beide ontbreekt. Zonder deze twee mag de server niet mee.
 */
export function kiesBijlagen(versie) {
  const { bron, vermeldingen } = versie ?? {};
  if (!geldig(bron) || !geldig(vermeldingen)) return null;
  if (typeof bron.url !== "string" || !/^https:\/\//.test(bron.url)) return null;
  return { bron, vermeldingen };
}

/** Of het bestand op `pad` deze sha256 heeft. */
export function klopt(pad, sha256) {
  if (!existsSync(pad)) return false;
  const hash = createHash("sha256").update(readFileSync(pad)).digest("hex");
  return hash.toLowerCase() === String(sha256).toLowerCase();
}

export function leesVersie() {
  return JSON.parse(readFileSync(join(MAP, "versie.json"), "utf8"));
}

/**
 * De tekst van SOURCE.txt: welke versie de server is, onder welke licentie, en waar
 * de broncode van precies die versie staat.
 */
export function bronwijzer(versie, bijlagen) {
  return [
    `Open FEM Studio server (openaec-mcp-server) ${versie.versie}`,
    "",
    "This folder holds the headless server of Open FEM Studio. Open CalcSheet Studio",
    "starts it as a separate program for the code checks in @toets blocks. It is not",
    "part of Open CalcSheet Studio itself and has its own license.",
    "",
    "License",
    "  GNU Affero General Public License, version 3 (AGPL-3.0): see",
    `  ${LICENTIE} in this folder. There is no warranty. The notices of the`,
    `  third-party components in the server are in ${VERMELDINGEN}.`,
    "",
    "Source code",
    "  The complete corresponding source of exactly this version is",
    `  ${bijlagen.bron.naam}`,
    `  sha256 ${bijlagen.bron.sha256}`,
    "  It is published, free of charge and without registration, at",
    `  ${bijlagen.bron.url}`,
    "  and on the release page of every Open CalcSheet Studio version that",
    "  includes this server, next to the installers:",
    `  https://github.com/${DOORGIFTE}/releases`,
    "",
    "The server is included unchanged, as built and signed by the OpenAEC Foundation.",
    "",
  ].join("\n");
}

async function download(url) {
  const antwoord = await fetch(url, { redirect: "follow" });
  if (!antwoord.ok) throw new Error(`${url}: HTTP ${antwoord.status}`);
  return Buffer.from(await antwoord.arrayBuffer());
}

/**
 * Haalt een bestand van de openbare release en controleert de sha256. Een bestand
 * met een andere sha256 wordt niet geschreven; de fout draagt dan `verkeerd`.
 */
async function haal(versie, bestand, doel) {
  const data = await download(downloadUrl(versie.repo, versie.tag, bestand.naam));
  const hash = createHash("sha256").update(data).digest("hex");
  if (hash !== bestand.sha256.toLowerCase()) {
    throw Object.assign(new Error(`${bestand.naam} heeft niet de sha256 uit versie.json`), { verkeerd: true });
  }
  mkdirSync(dirname(doel), { recursive: true });
  writeFileSync(doel, data);
}

/** De uitkomst voor de workflow: de uitvoer van de stap en een regel in de samenvatting. */
function meldWorkflow(status, versie, platform, tekst) {
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `status=${status}\nversie=${versie}\nplatform=${platform}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `## FEM Studio (${platform})\n\n${tekst}\n\n`);
  }
}

/** Na een half gelukte download: geen server zonder zijn vermeldingen in de bundel. */
function ruimOp() {
  for (const naam of [VERMELDINGEN, BRONWIJZER]) rmSync(join(MAP, naam), { force: true });
  rmSync(SERVER, { force: true });
}

async function main() {
  const args = process.argv.slice(2);
  const alsNodig = args.includes("--als-nodig");
  const b = args.indexOf("--bron");
  const bronMap = b >= 0 ? args[b + 1] : null;
  if (b >= 0 && !bronMap) {
    console.error("gebruik: node scripts/haal-fem-server.mjs [--als-nodig] [--bron <map>]");
    process.exitCode = 2;
    return;
  }
  const versie = leesVersie();
  const bijlagen = kiesBijlagen(versie);

  // Alleen het bronarchief, voor de release: op dezelfde plek als de installers.
  if (bronMap) {
    if (!bijlagen) {
      console.error("FEM Studio: versie.json heeft geen bronarchief; er is niets om bij de release te zetten.");
      process.exitCode = 1;
      return;
    }
    try {
      await haal(versie, bijlagen.bron, join(bronMap, bijlagen.bron.naam));
    } catch (fout) {
      console.error(`FEM Studio: het bronarchief ophalen mislukt: ${fout.message}`);
      process.exitCode = 1;
      return;
    }
    console.log(`FEM Studio ${versie.versie}: ${bijlagen.bron.naam} opgehaald en gecontroleerd.`);
    return;
  }

  const platform = ditPlatform();
  const bestand = kiesBestand(versie, platform);
  // In de bouwstap (--als-nodig) is de server al opgehaald of bewust niet: geen
  // tweede waarschuwing en geen uitvoer voor de workflow.
  const nietMeegeleverd = (reden) => {
    const melding = `FEM Studio ${versie.versie}: ${reden}; de app bouwt zonder (niet meegeleverd).`;
    console.log(alsNodig ? melding : `::warning::${melding}`);
    if (!alsNodig) meldWorkflow("niet-meegeleverd", versie.versie, platform, `**Niet meegeleverd**: ${reden}.`);
  };
  const meegeleverd = (melding) => {
    console.log(`FEM Studio ${versie.versie}: ${melding}`);
    if (!alsNodig) {
      meldWorkflow("meegeleverd", versie.versie, platform,
        `Meegeleverd: \`${bestand.naam}\`, sha256 \`${bestand.sha256}\`, met de licentie, de vermeldingen van derden en de verwijzing naar \`${bijlagen.bron.naam}\`.`);
    }
  };
  if (!bestand) {
    nietMeegeleverd(`geen server voor ${platform} in versie.json`);
    return;
  }
  // Zonder bron geen binary: de server valt onder de AGPL-3.0.
  if (!bijlagen) {
    console.error("FEM Studio: versie.json heeft een server maar geen bronarchief en vermeldingen van derden; zo mag hij niet mee. Vul versie.json met scripts/pin-fem-server.mjs.");
    process.exitCode = 1;
    return;
  }
  if (!existsSync(join(MAP, LICENTIE))) {
    console.error(`FEM Studio: ${LICENTIE} ontbreekt in fem-studio/; zonder licentietekst mag de server niet mee.`);
    process.exitCode = 1;
    return;
  }

  const vermeldingen = join(MAP, VERMELDINGEN);
  const wijzer = bronwijzer(versie, bijlagen);
  const compleet = () => klopt(SERVER, bestand.sha256) && klopt(vermeldingen, bijlagen.vermeldingen.sha256);
  if (!compleet()) {
    try {
      if (!klopt(SERVER, bestand.sha256)) {
        // Een oude of beschadigde server: weg, en opnieuw ophalen.
        rmSync(SERVER, { force: true });
        await haal(versie, bestand, SERVER);
        if (process.platform !== "win32") chmodSync(SERVER, 0o755);
      }
      if (!klopt(vermeldingen, bijlagen.vermeldingen.sha256)) await haal(versie, bijlagen.vermeldingen, vermeldingen);
    } catch (fout) {
      ruimOp();
      // Een verkeerde sha256 is altijd een fout; alleen een bouw zonder netwerk
      // (--als-nodig) gaat zonder server verder.
      if (alsNodig && !fout.verkeerd) {
        nietMeegeleverd(`ophalen mislukt (${fout.message})`);
        return;
      }
      console.error(`FEM Studio: ophalen mislukt: ${fout.message}; niet meegeleverd.`);
      process.exitCode = 1;
      return;
    }
    writeFileSync(join(MAP, BRONWIJZER), wijzer);
    meegeleverd(`${bestand.naam} en ${bijlagen.vermeldingen.naam} opgehaald en gecontroleerd.`);
    return;
  }
  writeFileSync(join(MAP, BRONWIJZER), wijzer);
  meegeleverd("de server en de vermeldingen van derden zijn er en kloppen.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) await main();
