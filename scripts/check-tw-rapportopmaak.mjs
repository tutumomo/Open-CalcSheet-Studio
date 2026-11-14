/**
 * Controle van de Taiwanese rapportopmaak (docs/OCSS_TW_開發需求規格.md, P2-16):
 *
 *   1  het blok zelf: standaardwaarden, samenvoegen van een half ingevuld blok,
 *      onbekende velden en de regel wanneer het handtekeningblok verschijnt;
 *   2  de plaatshouders van de kop- en voettekst;
 *   3  het rapport: een nieuw rapport heeft het blok, een oud rapport krijgt het
 *      erbij zonder dat er iets verandert, en normaliseren laat het staan;
 *   4  de tabelnummers: per hoofdstuk omhoog tellen, en dezelfde nummers bij een
 *      tweede ronde (de nummers komen uit de indeling, niet uit de tekenvolgorde);
 *   5  de machineleesbare kant: `report_set` zet de velden en `report_get` leest
 *      ze terug, dus de API kan alles wat het paneel kan;
 *   6  de figuurnummers: een tekening in het hoofdstuk zelf telt per hoofdstuk mee
 *      in een eigen reeks, een tekening in bijlage A houdt haar A-nummer.
 *
 * Draaien:  node scripts/check-tw-rapportopmaak.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import { normaliseerRapport, standaardRapport } from "../packages/desktop/src/rapport/model.ts";
import { standaardTeksten } from "../packages/desktop/src/rapport/standaardteksten.ts";
import { bijschriften, bijschriftSleutel } from "../packages/desktop/src/rapport/tw/nummering.ts";
import {
  heeftHandtekening, normaliseerTw, STANDAARD_TW, vulKopvoet,
} from "../packages/desktop/src/rapport/tw/blok.ts";
import { MCP_TOOLS } from "../packages/desktop/src/mcp/tools.ts";
import { voerToolUit } from "../packages/desktop/src/mcp/uitvoeren.ts";
import { maakApp, maakContext } from "./lib/mcpproef.mjs";

let fouten = 0;
let aantal = 0;
function toets(naam, ok, detail) {
  aantal++;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${naam}${ok || detail === undefined ? "" : `\n         ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
}
/** Diepe vergelijking; de volgorde van sleutels telt niet. */
function zelfde(a, b) {
  if (Object.is(a, b)) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const ka = Object.keys(a);
  const kb = Object.keys(b);
  return ka.length === kb.length && ka.every((k) => Object.prototype.hasOwnProperty.call(b, k) && zelfde(a[k], b[k]));
}
const gelijk = (naam, kreeg, verwacht) => toets(naam, zelfde(kreeg, verwacht), `kreeg ${JSON.stringify(kreeg)}, verwacht ${JSON.stringify(verwacht)}`);
const kop = (t) => console.log(`\n${t}`);

const VANDAAG = "14-11-2026";
const nieuw = (taal = "zh-TW") => standaardRapport(VANDAAG, standaardTeksten(taal), taal);

// ── 1. Het blok ──────────────────────────────────────────────────────────────
kop("1. Het blok: standaardwaarden en samenvoegen");
{
  gelijk("zonder invoer: de standaardwaarden", normaliseerTw(undefined), STANDAARD_TW);
  toets("standaard is het blok leeg", STANDAARD_TW.handtekening.naam === "" && STANDAARD_TW.kopvoet.kop === "" && STANDAARD_TW.kopvoet.voet === "");
  toets("standaard staat de schakelaar aan en de nummering uit",
    STANDAARD_TW.handtekening.tonen === true && STANDAARD_TW.nummering.tabellen === false);

  const half = normaliseerTw({ handtekening: { naam: "王小明", nummer: "技證字第 12345 號" }, kopvoet: { kop: "{titel}" } });
  gelijk("een half ingevuld blok: de rest blijft standaard",
    [half.handtekening.naam, half.handtekening.nummer, half.handtekening.vakgebied, half.handtekening.tonen, half.kopvoet.kop, half.kopvoet.voet],
    ["王小明", "技證字第 12345 號", "", true, "{titel}", ""]);

  const rommel = normaliseerTw({ handtekening: { naam: 42, onbekend: "x" }, onbekend: true, nummering: { tabellen: "ja" } });
  gelijk("onbekende velden en verkeerde typen vallen weg", rommel, STANDAARD_TW);
  gelijk("geen object: de standaardwaarden", normaliseerTw("iets"), STANDAARD_TW);
  gelijk("uitzetten blijft uitgezet", normaliseerTw({ handtekening: { tonen: false } }).handtekening.tonen, false);

  toets("leeg blok: geen handtekening", heeftHandtekening(STANDAARD_TW.handtekening) === false);
  toets("alleen een naam: wel een handtekening", heeftHandtekening(normaliseerTw({ handtekening: { naam: "王小明" } }).handtekening) === true);
  toets("alleen een beeld: wel een handtekening", heeftHandtekening(normaliseerTw({ handtekening: { beeld: "data:image/png;base64,AA" } }).handtekening) === true);
  toets("alleen een证號: wel een handtekening", heeftHandtekening(normaliseerTw({ handtekening: { nummer: "12345" } }).handtekening) === true);
  toets("uitgezet: geen handtekening, ook met een naam",
    heeftHandtekening(normaliseerTw({ handtekening: { naam: "王小明", tonen: false } }).handtekening) === false);
  toets("alleen spaties telt niet", heeftHandtekening(normaliseerTw({ handtekening: { naam: "   " } }).handtekening) === false);
}

// ── 2. De kop- en voettekst ──────────────────────────────────────────────────
kop("2. De kop- en voettekst: plaatshouders");
{
  const velden = { titel: "結構計算書", projectnaam: "某某大樓新建工程", kenmerk: "2026-118", datum: "2026-11-14", revisie: "2" };
  gelijk("alle plaatshouders", vulKopvoet("{titel} — {projectnaam}", velden), "結構計算書 — 某某大樓新建工程");
  gelijk("kenmerk, datum en revisie", vulKopvoet("{kenmerk} · {datum} · 第 {revisie} 版", velden), "2026-118 · 2026-11-14 · 第 2 版");
  gelijk("zonder plaatshouder blijft de regel staan", vulKopvoet("固定文字", velden), "固定文字");
  gelijk("een onbekende plaatshouder blijft staan", vulKopvoet("{titel} {onbekend}", velden), "結構計算書 {onbekend}");
  gelijk("leeg blijft leeg", vulKopvoet("", velden), "");
  gelijk("het paginanummer, als de aanroeper het meegeeft", vulKopvoet("p. {pagina}", { ...velden, pagina: "7" }), "p. 7");
  gelijk("zonder paginanummer blijft de plaatshouder staan", vulKopvoet("p. {pagina}", velden), "p. {pagina}");
}

// ── 3. Het rapport ──────────────────────────────────────────────────────────
kop("3. Het rapport: nieuw, oud en normaliseren");
{
  const vers = nieuw();
  gelijk("een nieuw Taiwanees rapport heeft het blok", vers.tw, STANDAARD_TW);
  toets("een nieuw Taiwanees rapport staat op de Taiwanese opzet", vers.opzetSoort === "tw");

  const oud = JSON.parse(JSON.stringify(vers));
  delete oud.tw;
  const genormaliseerd = normaliseerRapport(oud);
  gelijk("een oud rapport krijgt het lege blok erbij", genormaliseerd.tw, STANDAARD_TW);
  toets("en verder verandert er niets aan", genormaliseerd.titel === vers.titel && genormaliseerd.opzetSoort === vers.opzetSoort);

  const gevuld = normaliseerRapport({ ...vers, tw: { handtekening: { naam: "王小明" }, nummering: { tabellen: true } } });
  gelijk("normaliseren laat een ingevuld blok staan",
    [gevuld.tw.handtekening.naam, gevuld.tw.nummering.tabellen, gevuld.tw.kopvoet.kop],
    ["王小明", true, ""]);
}

// ── 4. De tabelnummers ──────────────────────────────────────────────────────
kop("4. De tabelnummers: per hoofdstuk en altijd dezelfde");
{
  const knoop = (nummer, inhoud, kinderen = []) => ({ id: inhoud + nummer, nummer, titel: inhoud, inhoud, nieuwePagina: false, kinderen });
  const knopen = [
    knoop("4", "hoofdstuk", [
      knoop("4.1", "materialen"),
      knoop("4.2", "blijvend", [knoop("4.2.1", "veranderlijk")]),
      knoop("4.3", "wind"),
    ]),
    knoop("5", "hoofdstuk", [knoop("5.1", "factoren")]),
  ];
  const basis = nieuw();
  const rapport = normaliseerRapport({
    ...basis,
    belastingen: {
      ...basis.belastingen,
      vloerenDaken: [{ soort: "vlak", naam: "自重", lagen: [] }],
      wanden: [],
    },
  });
  const nummers = bijschriften(rapport, knopen);
  gelijk("de materialen: het eerste nummer van hoofdstuk 4", nummers.get(bijschriftSleutel.materialen), "表 4-1");
  gelijk("de vloerbelasting: het tweede", nummers.get(bijschriftSleutel.opbouw("自重")), "表 4-2");
  gelijk("de veranderlijke belasting telt in haar eigen hoofdstuk verder", nummers.get(bijschriftSleutel.veranderlijk), "表 4-3");
  gelijk("de wind: het vierde", nummers.get(bijschriftSleutel.wind), "表 4-4");
  gelijk("de factoren beginnen opnieuw in hoofdstuk 5", nummers.get(bijschriftSleutel.factoren), "表 5-1");
  gelijk("een tweede ronde geeft dezelfde nummers", [...bijschriften(rapport, knopen)], [...nummers]);

  const leeg = bijschriften(
    normaliseerRapport({ ...basis, belastingen: { ...basis.belastingen, vloerenDaken: [], wanden: [] } }),
    knopen,
  );
  toets("zonder vloeren geen nummer voor een opbouw die er niet is",
    ![...leeg.keys()].some((k) => k.startsWith("tabel:opbouw:")));
}

// ── 5. De machineleesbare kant ──────────────────────────────────────────────
kop("5. report_set en report_get: dezelfde velden langs de API");
{
  const app = maakApp();
  const ctx = maakContext(app.omgeving, { alleenLezen: false, gepauzeerd: false })();
  const tool = (naam) => MCP_TOOLS.find((t) => t.name === naam);
  const zet = (pad, waarde) => voerToolUit(tool("report_set"), { path: pad, value: waarde }, ctx);
  const lees = () => voerToolUit(tool("report_get"), {}, ctx);

  const gezet = await zet("tw.handtekening.naam", "王小明");
  toets("report_set zet de naam van de ingenieur", gezet.ok === true, JSON.stringify(gezet));
  await zet("tw.handtekening.nummer", "技證字第 12345 號");
  await zet("tw.kopvoet.kop", "{titel} — {projectnaam}");
  await zet("tw.nummering.tabellen", true);
  await zet("tw.nummering.figuren", true);
  const gelezen = await lees();
  const tw = gelezen.ok ? gelezen.data.report.tw : null;
  gelijk("report_get leest ze terug",
    tw && [tw.handtekening.naam, tw.handtekening.nummer, tw.kopvoet.kop, tw.nummering.tabellen, tw.nummering.figuren],
    ["王小明", "技證字第 12345 號", "{titel} — {projectnaam}", true, true]);
  toets("het blok verschijnt nu op het voorblad", tw ? heeftHandtekening(tw.handtekening) : false);

  const fout = await zet("tw.bestaatniet.naam", "x");
  toets("een pad dat niet bestaat blijft een fout", fout.ok === false && fout.code === "NOT_FOUND", JSON.stringify(fout));

  // Een ongedaan-stap per zetting: het paneel en de API lopen langs dezelfde actie.
  const terug = app.omgeving.acties;
  terug.ongedaan();
  const naTerug = await lees();
  gelijk("ongedaan maken draait de laatste zetting terug",
    naTerug.ok ? [naTerug.data.report.tw.nummering.tabellen, naTerug.data.report.tw.nummering.figuren] : null,
    [true, false]);
}

// ── 6. De figuurnummers ─────────────────────────────────────────────────────
kop("6. De figuurnummers: per hoofdstuk, met een eigen reeks");
{
  const knoop = (nummer, inhoud, kinderen = [], blad) => ({
    id: `${inhoud}-${nummer}`,
    nummer,
    titel: inhoud,
    inhoud,
    nieuwePagina: false,
    kinderen,
    ...(blad ? { blad } : {}),
  });
  const tekening = (id, bijlage) => ({ id, naam: id, bijlage, figuur: true });
  const blad = (id) => ({ id, naam: id, bijlage: "" });
  const knopen = [
    knoop("3", "materialen", [], blad("m1")),
    knoop("6", "berekeningen", [
      knoop("6.1", "balk", [], tekening("t1", "")),
      knoop("6.2", "kolom", [], tekening("t2", "")),
      knoop("6.3", "paal", [], tekening("t3", "A.1")),
      knoop("6.4", "wapening", [], blad("b4")),
    ]),
  ];
  const basis = nieuw();
  const rapport = normaliseerRapport({
    ...basis,
    belastingen: { ...basis.belastingen, vloerenDaken: [], wanden: [] },
  });
  const nummers = bijschriften(rapport, knopen);

  gelijk("een tekening in het hoofdstuk: het eerste figuurnummer van hoofdstuk 6",
    nummers.get(bijschriftSleutel.figuur("t1")), "圖 6-1");
  gelijk("de tweede tekening telt door", nummers.get(bijschriftSleutel.figuur("t2")), "圖 6-2");
  toets("een tekening in bijlage A houdt haar A-nummer en krijgt geen figuurnummer",
    !nummers.has(bijschriftSleutel.figuur("t3")));
  toets("een blad zonder figuur krijgt geen figuurnummer", !nummers.has(bijschriftSleutel.figuur("b4")));
  gelijk("de tabellen tellen in hun eigen reeks verder", nummers.get(bijschriftSleutel.materialen), "表 3-1");
  gelijk("een tweede ronde geeft dezelfde nummers", [...bijschriften(rapport, knopen)], [...nummers]);

  // De schakelaar staat los van de tabelnummers: alleen wat aan staat, gaat mee.
  toets("standaard staan de figuurnummers uit", STANDAARD_TW.nummering.figuren === false);
  gelijk("de schakelaar is met report_set te zetten en terug te lezen",
    normaliseerTw({ nummering: { figuren: true } }).nummering.figuren, true);
  gelijk("een verkeerd type valt terug op uit", normaliseerTw({ nummering: { figuren: "ja" } }).nummering.figuren, false);
}

console.log(fouten === 0 ? `\nTaiwanese rapportopmaak: ${aantal} controles, alle groen.` : `\n${fouten} van ${aantal} controles gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
