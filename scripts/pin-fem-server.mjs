/**
 * Zet een versie van de server van Open FEM Studio klaar voor CalcSheet.
 *
 * De server valt onder de AGPL-3.0: wie hem krijgt, heeft recht op de broncode van
 * precies die versie. De repository van FEM Studio is privé, dus haalt dit script de
 * bestanden daar één keer op en zet ze in een openbare release van deze repository
 * (tag fem-server-<versie>). De workflows halen ze daar op, zonder geheim, en elke
 * release van CalcSheet zet het bronarchief naast de installers.
 *
 * Wat het doet:
 *   1. haalt uit de release van FEM Studio de ondertekende servers
 *      (openaec-mcp-server_<versie>_<platform>), het bronarchief (…_source.tar.gz),
 *      de vermeldingen van derden (…_THIRD-PARTY-NOTICES.txt), SHA256SUMS en de
 *      losse handtekeningen (.asc);
 *   2. controleert elke sha256 tegen SHA256SUMS; zonder bronarchief of vermeldingen
 *      stopt het: zonder bron geen server;
 *   3. toont wat er openbaar zou worden en hoe versie.json eruit komt te zien;
 *   4. alleen met --publiceer: maakt de openbare release en schrijft versie.json.
 *
 * Draaien, door iemand met toegang tot de release van FEM Studio (`gh auth login`):
 *   node scripts/pin-fem-server.mjs v2026.46.0                tonen, niets wijzigen
 *   node scripts/pin-fem-server.mjs v2026.46.0 --publiceer    openbaar maken en pinnen
 *   node scripts/pin-fem-server.mjs v2026.46.0 --map <map>    de bestanden uit <map>
 *                                                             in plaats van downloaden
 *
 * Daarna:
 *   node scripts/haal-fem-server.mjs     haalt de server voor dit platform uit de
 *                                        openbare release en controleert de sha256
 *   node scripts/check-fem-server.mjs    toetst versie.json
 *
 * SHA256SUMS van FEM Studio heeft een losse OpenPGP-handtekening (SHA256SUMS.asc)
 * van de OpenAEC-releasesleutel (vingerafdruk in scripts/release/openaec-vingerafdruk.txt).
 * Dit script controleert die niet; wie dat wil: gpg --verify SHA256SUMS.asc SHA256SUMS.
 * Beide gaan mee in de openbare release.
 */
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DOORGIFTE, MAP, PLATFORMEN, bronNaam, doorgifteTag, downloadUrl, klopt, leesHashes, leesSha256Sums, vermeldingenNaam,
} from "./haal-fem-server.mjs";

/** De repository van Open FEM Studio: privé; alleen dit script leest eruit. */
export const HERKOMST = "OpenAEC-Foundation/open-fem-studio";
const VINGERAFDRUK = readFileSync(fileURLToPath(new URL("./release/openaec-vingerafdruk.txt", import.meta.url)), "utf8").trim();

/**
 * De inhoud van versie.json: de servers, het bronarchief en de vermeldingen van
 * derden, in de openbare release fem-server-<versie> van deze repository.
 */
export function maakVersie(versie, bestanden, bijlagen = null) {
  const tag = doorgifteTag(versie);
  return {
    versie,
    repo: DOORGIFTE,
    tag,
    herkomst: { repo: HERKOMST, tag: `v${versie}` },
    bestanden,
    bron: bijlagen ? { ...bijlagen.bron, url: downloadUrl(DOORGIFTE, tag, bijlagen.bron.naam) } : null,
    vermeldingen: bijlagen ? bijlagen.vermeldingen : null,
  };
}

/**
 * Wat er uit de release van FEM Studio openbaar wordt, uit de tekst van SHA256SUMS:
 * de servers per platform, het bronarchief en de vermeldingen (verplicht), en de
 * namen van de bestanden die meegaan. `fouten` zegt wat ontbreekt.
 */
export function leesRelease(sums, versie) {
  const hashes = leesHashes(sums);
  const bestanden = leesSha256Sums(sums, versie);
  const fouten = [];
  const bijlage = (naam, wat) => {
    if (hashes.has(naam)) return { naam, sha256: hashes.get(naam) };
    fouten.push(`${wat} (${naam}) staat niet in SHA256SUMS: zonder dat bestand mag de server niet mee`);
    return null;
  };
  if (Object.keys(bestanden).length === 0) fouten.push(`geen losse server van ${versie} in SHA256SUMS`);
  const bron = bijlage(bronNaam(versie), "het bronarchief");
  const vermeldingen = bijlage(vermeldingenNaam(versie), "de vermeldingen van derden");
  const verplicht = [...Object.values(bestanden), bron, vermeldingen].filter(Boolean);
  // Losse handtekeningen: ze gaan mee als de release ze heeft.
  const optioneel = ["SHA256SUMS.asc", ...verplicht.map((b) => `${b.naam}.asc`)];
  return { bestanden, bijlagen: bron && vermeldingen ? { bron, vermeldingen } : null, verplicht, optioneel, fouten };
}

/** De tekst van de openbare release. */
export function releaseTekst(versie, bijlagen) {
  return [
    `Headless server of Open FEM Studio ${versie} (\`openaec-mcp-server\`), as included in Open CalcSheet Studio for the code checks in \`@toets\` blocks.`,
    "",
    "This is not a release of Open CalcSheet Studio. It holds the server per platform, unchanged and signed by the OpenAEC Foundation, with the complete corresponding source of exactly this version.",
    "",
    "The server is licensed under the **GNU Affero General Public License, version 3**. It links an external 3D engine that is licensed under the AGPL-3.0.",
    "",
    `- Source: \`${bijlagen.bron.naam}\` (sha256 \`${bijlagen.bron.sha256}\`). \`SOURCE.md\` in the archive says how to build it.`,
    `- Third-party notices: \`${bijlagen.vermeldingen.naam}\`.`,
    `- Checksums: \`SHA256SUMS\`, as published with Open FEM Studio; it also lists files that are not here (\`sha256sum -c --ignore-missing SHA256SUMS\`). \`SHA256SUMS.asc\` is its OpenPGP signature of the OpenAEC release key, fingerprint \`${VINGERAFDRUK}\`.`,
    "",
  ].join("\n");
}

function gh(args, opties = {}) {
  return spawnSync("gh", args, { encoding: "utf8", ...opties });
}

/** Haalt de bestanden van de server uit de release van FEM Studio naar `map`. */
function haalRelease(tag, map) {
  execFileSync("gh", ["release", "download", tag, "--repo", HERKOMST, "--dir", map,
    "--pattern", "SHA256SUMS", "--pattern", "SHA256SUMS.asc", "--pattern", "openaec-mcp-server_*"], {
    stdio: ["ignore", "inherit", "inherit"],
  });
}

function main() {
  const args = process.argv.slice(2);
  const publiceer = args.includes("--publiceer");
  const m = args.indexOf("--map");
  const eigenMap = m >= 0 ? args[m + 1] : null;
  const tagArg = args.find((a, i) => !a.startsWith("--") && !(m >= 0 && i === m + 1));
  const versie = String(tagArg ?? "").replace(/^v/, "");
  if (!/^\d{4}\.\d{1,2}\.\d+$/.test(versie) || (m >= 0 && !eigenMap)) {
    console.error("gebruik: node scripts/pin-fem-server.mjs vJJJJ.W.N [--map <map>] [--publiceer]");
    process.exit(2);
  }

  const tijdelijk = eigenMap ? null : mkdtempSync(join(tmpdir(), "fem-server-"));
  const map = eigenMap ?? tijdelijk;
  try {
    if (!eigenMap) haalRelease(`v${versie}`, map);
    if (!existsSync(join(map, "SHA256SUMS"))) {
      console.error(`SHA256SUMS ontbreekt in ${map}.`);
      process.exit(1);
    }
    const uit = leesRelease(readFileSync(join(map, "SHA256SUMS"), "utf8"), versie);
    for (const b of uit.verplicht) {
      if (!klopt(join(map, b.naam), b.sha256)) uit.fouten.push(`${b.naam} ontbreekt of heeft niet de sha256 uit SHA256SUMS`);
    }
    if (uit.fouten.length > 0) {
      for (const f of uit.fouten) console.error(`✗ ${f}`);
      console.error(`\nNiets gepubliceerd, versie.json niet gewijzigd. Heeft de release v${versie} van FEM Studio de losse servers en het bronarchief?`);
      process.exit(1);
    }

    const tag = doorgifteTag(versie);
    const nieuw = maakVersie(versie, uit.bestanden, uit.bijlagen);
    const uploads = ["SHA256SUMS", ...uit.verplicht.map((b) => b.naam), ...uit.optioneel.filter((n) => existsSync(join(map, n)))];
    console.log(`FEM Studio ${versie}: alle sha256 kloppen met SHA256SUMS.\n`);
    console.log(`Openbare release ${tag} in ${DOORGIFTE} (geen "latest"), met:`);
    for (const naam of uploads) console.log(`  ${naam}`);
    console.log("\nServers per platform:");
    for (const platform of PLATFORMEN) {
      const b = uit.bestanden[platform];
      console.log(b ? `  ${platform.padEnd(16)} ${b.naam}  ${b.sha256}` : `  ${platform.padEnd(16)} ontbreekt: de app bouwt hier zonder server`);
    }
    console.log(`\nversie.json:\n${JSON.stringify(nieuw, null, 2)}\n`);

    if (!publiceer) {
      console.log("Niets gepubliceerd en versie.json niet gewijzigd. Met --publiceer maakt dit script de openbare release en schrijft het versie.json.");
      return;
    }

    if (gh(["release", "view", tag, "--repo", DOORGIFTE, "--json", "tagName"]).status === 0) {
      console.error(`De release ${tag} bestaat al in ${DOORGIFTE}; die wordt niet vervangen.`);
      process.exit(1);
    }
    const notities = join(map, "release-tekst.md");
    writeFileSync(notities, releaseTekst(versie, uit.bijlagen));
    try {
      execFileSync("gh", ["release", "create", tag, "--repo", DOORGIFTE, "--title", `Open FEM Studio server ${versie}`,
        "--notes-file", notities, "--latest=false", ...uploads.map((n) => join(map, n))], { stdio: ["ignore", "inherit", "inherit"] });
    } finally {
      rmSync(notities, { force: true });
    }
    writeFileSync(join(MAP, "versie.json"), `${JSON.stringify(nieuw, null, 2)}\n`);
    console.log(`Gepubliceerd: https://github.com/${DOORGIFTE}/releases/tag/${tag}\nversie.json is bijgewerkt; commit het bestand.`);
  } finally {
    if (tijdelijk) rmSync(tijdelijk, { recursive: true, force: true });
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
