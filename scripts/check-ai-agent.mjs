/**
 * Controle van de AI-zijbalk zonder netwerk en zonder Tauri
 * (docs/OCSS_TW_開發需求規格.md, P2-15):
 *
 *   1  het beleid: wanneer een stap gewoon doorgaat, wanneer de gebruiker hem
 *      moet goedkeuren en wanneer eerst het verschil in beeld komt;
 *   2  het voorbeeld: welke regels veranderen er, en hoe ziet dat eruit;
 *   3  de context: wat de assistent van het project te zien krijgt, en het
 *      bereik dat de gebruiker met `@naam` zelf aanwijst;
 *   4  de lus: een oproep, het antwoord, de weigering, "altijd toestaan", het
 *      voorbeeld bij het overschrijven van inhoud, de fout, de stopknop, de
 *      maximum aantal rondes en het inkorten van een lange uitkomst.
 *
 * De aanbieder is hier een script: `vraag` speelt per ronde de gebeurtenissen
 * af die Rust normaal uit het SSE-antwoord haalt. Zo is de hele lus te toetsen
 * zonder sleutel en zonder internet.
 *
 * Draaien:  node scripts/check-ai-agent.mjs
 */
import { besluitVoor, DESTRUCTIEF, regelVerschil, vatSamen, voorbeeldSamenvatting, voorbeeldTekst } from "../packages/desktop/src/components/ai/beleid.ts";
import { bouwSysteemtekst, parseBereik } from "../packages/desktop/src/components/ai/prompt.ts";
import { kort, voerVraagUit } from "../packages/desktop/src/components/ai/agent.ts";
import {
  AI_SJABLONEN,
  GEMINI_OAUTH,
  OAUTH_SJABLONEN,
  OPENAI_OAUTH,
  STANDAARD_PROFIELEN,
  heeftOAuth,
  isLokaalEndpoint,
  isProfielKlaar,
  leesKoppen,
  maakProfielId,
  migreerInstellingen,
  schrijfKoppen,
  verwachteRedirectUri,
  vulOAuthAan,
} from "../packages/desktop/src/components/ai/profielen.ts";

let fouten = 0;
let aantal = 0;
function toets(naam, ok, detail) {
  aantal++;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK    " : "FOUT  "} ${naam}${ok || detail === undefined ? "" : `\n         ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
}

const lees = { naam: "sheet_get", kind: "read", destructief: false };
const scherm = { naam: "view_set", kind: "ui", destructief: false };
const wijzig = { naam: "sheet_set_input", kind: "mutate", destructief: false };

// ── 1. Het beleid ───────────────────────────────────────────────────────────
console.log("\n1. Beleid per tool");
toets("lezen gaat gewoon door", besluitVoor(lees, false) === "doorgaan");
toets("iets in beeld zetten gaat gewoon door", besluitVoor(scherm, false) === "doorgaan");
toets("een blad verwijderen vraagt eerst", besluitVoor({ naam: "sheet_remove", kind: "mutate", destructief: true }, false) === "vraag");
toets("een bestand schrijven vraagt eerst", besluitVoor({ naam: "project_save", kind: "file", destructief: true }, false) === "vraag");
toets("een invoerwaarde zetten gaat door", besluitVoor(wijzig, false) === "doorgaan");
toets("bestaande rekentekst overschrijven geeft eerst een voorbeeld", besluitVoor({ naam: "sheet_set_source", kind: "mutate", destructief: false }, true) === "voorbeeld");
toets("een lege rekentekst vullen gaat door", besluitVoor({ naam: "sheet_set_source", kind: "mutate", destructief: false }, false) === "doorgaan");
toets("de destructieve lijst is dezelfde als die van het beleid", DESTRUCTIEF.has("sheet_remove") && DESTRUCTIEF.has("project_save") && DESTRUCTIEF.has("project_new") && !DESTRUCTIEF.has("sheet_set_input"));

toets("de samenvatting noemt de argumenten", vatSamen("sheet_set_input", { id: "ex-1", name: "q", value: 12 }) === "sheet_set_input(id=ex-1, name=q, value=12)", vatSamen("sheet_set_input", { id: "ex-1", name: "q", value: 12 }));
toets("until three arguments", vatSamen("sheet_add", { templateId: "a", name: "b", x: 1, y: 2 }) === "sheet_add(templateId=a, name=b, x=1)");
toets("lange tekst wordt afgekort", vatSamen("sheet_set_input", { value: "x".repeat(60) }).includes("…"));
toets("een lijst wordt zijn lengte", vatSamen("x", { ids: ["a", "b"] }) === "x(ids=[2])");
toets("zonder argumenten blijft de naam over", vatSamen("modules_list", {}) === "modules_list");

// ── 2. Het voorbeeld ────────────────────────────────────────────────────────
console.log("\n2. Het voorbeeld bij overschrijven");
const oud = "r1 = 1\nr2 = 2\nr3 = 3\nr4 = 4\nr5 = 5\nr6 = 6\nr7 = 7\nr8 = 8\nr9 = 9\nr10 = 10\nr11 = 11\nr12 = 12\nr13 = 13\nr14 = 14\nr15 = 15\nr16 = 16\nr17 = 17\nr18 = 18\nr19 = 19\nr20 = 20";
const nieuw = "r1 = 1\nr2 = 20\nr3 = 3\nr4 = 4\nr5 = 5\nr6 = 6\nr7 = 7\nr8 = 8\nr9 = 9\nr10 = 10\nr11 = 11\nr12 = 12\nr13 = 13\nr14 = 14\nr15 = 15\nr16 = 16\nr17 = 17\nr18 = 180\nr19 = 19\nr20 = 20";
const verschil = regelVerschil(oud, nieuw);
toets("twee gewijzigde regels tellen als twee weg en twee bij", verschil.weg === 2 && verschil.bij === 2, verschil);
toets("het veld staat erbij", verschil.veld === "source");
const zelfdeTekst = regelVerschil(oud, oud);
toets("dezelfde tekst geeft geen verschil", zelfdeTekst.weg === 0 && zelfdeTekst.bij === 0);
toets("de samenvatting telt de regels", voorbeeldSamenvatting(verschil) === "−2 +2", voorbeeldSamenvatting(verschil));
toets("zonder verschil zegt de samenvatting dat", voorbeeldSamenvatting(zelfdeTekst) === "geen verschil");
const beeld = voorbeeldTekst(verschil);
toets("het voorbeeld toont de oude regel met een min", beeld.includes("- r2 = 2"), beeld);
toets("het voorbeeld toont de nieuwe regel met een plus", beeld.includes("+ r2 = 20"), beeld);
toets("ver weg gelegen regels worden samengevat met een ellips", beeld.includes("…"), beeld);
toets("een leeg voorbeeld is lege tekst", voorbeeldTekst(zelfdeTekst) === "");

// ── 3. De context ───────────────────────────────────────────────────────────
console.log("\n3. Wat de assistent van het project ziet");
const bladen = [
  { id: "ex-1", naam: "Balk B1", templateId: "tw-rc-beam", ref: "1" },
  { id: "ex-2", naam: "Kolom K1", templateId: "tw-rc-column", ref: "2" },
  { id: "ex-3", naam: "Blad 3", templateId: "ligger", ref: "3" },
];
const bereik = parseBereik("@Balk B1 hoe groot is de UC? en @\"Blad 3\" ook", bladen);
toets("een @naam wijst het blad aan, ook met een spatie erin", bereik.bladen.length === 2 && bereik.bladen[0].id === "ex-1" && bereik.bladen[1].id === "ex-3", bereik);
toets("een naam met een spatie mag tussen aanhalingstekens", parseBereik('@"Blad 3" reken na', bladen).bladen[0]?.id === "ex-3");
toets("de verwijzing gaat uit de vraag", !bereik.vraag.includes("@"), bereik.vraag);
toets("een onbekende naam wordt gemeld", parseBereik("@Bestaatniet reken", bladen).onbekend[0] === "Bestaatniet");
toets("een e-mailadres is geen verwijzing", parseBereik("mail jan@bureau.nl", bladen).bladen.length === 0);
toets("dezelfde naam twee keer telt één keer", parseBereik("@Balk B1 en @Balk B1", bladen).bladen.length === 1);

const systeem = bouwSysteemtekst({
  taal: "zh-TW",
  projectNaam: "Project X",
  bladen,
  actief: { ...bladen[0], source: "q = ? kN/m'\nM = q*L^2/8'\nUC = M/Mrd'", waarden: { q: "12", L: "6" } },
  uitkomst: { titel: "Balk B1", check: "pass", uc: 0.82, voldoet: true, warnings: ["m^0.666…"] },
});
toets("de systeemprompt zegt in welke taal het antwoord komt", systeem.includes("Traditional Chinese (zh-TW)"), systeem.slice(0, 200));
toets("de projectnaam staat erin", systeem.includes("Project X"));
toets("elk blad staat erin met zijn id", systeem.includes("Balk B1 #1") && systeem.includes("id ex-2"), systeem);
toets("de invoer van het blad staat erin", systeem.includes("- q = 12") && systeem.includes("- L = 6"), systeem);
toets("de rekentekst staat erin", systeem.includes("UC = M/Mrd"));
toets("de laatste doorrekening staat erin", systeem.includes("check: pass") && systeem.includes("UC: 0.82"));
toets("de waarschuwing staat erin", systeem.includes("m^0.666…"));
toets("de vaste uitleg van de tools zit erbij", systeem.includes("Open CalcSheet Studio"));

const lang = bouwSysteemtekst({
  taal: "en",
  projectNaam: "",
  bladen: [],
  actief: { ...bladen[0], source: "x".repeat(50), waarden: {} },
  maxBron: 20,
});
toets("een lange rekentekst wordt afgekapt", lang.includes("characters left out") && lang.includes("(untitled)"), lang.slice(-200));
toets("een project zonder bladen zegt dat", bouwSysteemtekst({ taal: "nl", projectNaam: "P", bladen: [], actief: null }).includes("no sheets yet"));

// ── 4. De lus ───────────────────────────────────────────────────────────────
console.log("\n4. De lus van de zijbalk");

/** Een aanbieder die per ronde een script afspeelt. */
function maakVraag(script) {
  let ronde = 0;
  const gezien = [];
  const vraag = async (verzoek, bij) => {
    gezien.push(verzoek);
    const beurt = script[Math.min(ronde, script.length - 1)];
    ronde++;
    for (const g of typeof beurt === "function" ? beurt(verzoek) : beurt) bij(g);
  };
  return { vraag, gezien, rondes: () => ronde };
}

const oproep = (id, naam, argumenten) => ({ soort: "oproep", id, naam, argumenten });
const klaar = (stopreden = "einde", invoer = 10, uitvoer = 5) => ({ soort: "klaar", stopreden, invoer, uitvoer });

const gedaan = [];
const deps = (script, extra = {}) => ({
  aanbieder: "anthropic",
  endpoint: "https://api.anthropic.com",
  model: "test",
  systeem: "s",
  gereedschap: [],
  kenmerk: (naam) => {
    const tool = { sheet_get: lees, sheet_set_input: wijzig, sheet_set_source: { naam: "sheet_set_source", kind: "mutate", destructief: false }, sheet_remove: { naam: "sheet_remove", kind: "mutate", destructief: true }, sheet_evaluate: lees }[naam];
    return tool ?? null;
  },
  huidigeInhoud: async () => null,
  voerUit: async (naam, argumenten) => {
    gedaan.push({ naam, argumenten });
    return { ok: true, data: { uc: 0.8 } };
  },
  vraagGoedkeuring: async () => "ja",
  vraag: maakVraag(script).vraag,
  ...extra,
});

const teksten = [];
const uitkomst = await voerVraagUit(
  "Reken de balk na",
  [],
  deps([
    [
      { soort: "tekst", tekst: "Ik reken het blad door." },
      oproep("c1", "sheet_evaluate", { id: "ex-1" }),
      klaar("gereedschap"),
    ],
    [{ soort: "tekst", tekst: "De UC is 0,8: het voldoet." }, klaar()],
  ], { bij: { tekst: (t) => teksten.push(t) } }),
);
toets("twee rondes: één met een oproep, één met het antwoord", uitkomst.rondes === 2, uitkomst);
toets("het einde is klaar", uitkomst.einde === "klaar");
toets("de tekst van beide rondes blijft bewaard", uitkomst.tekst.includes("Ik reken het blad door.") && uitkomst.tekst.includes("De UC is 0,8"), uitkomst.tekst);
toets("de tool is uitgevoerd", gedaan.length === 1 && gedaan[0].naam === "sheet_evaluate");
toets("de stap staat op klaar", uitkomst.stappen.length === 1 && uitkomst.stappen[0].status === "klaar", uitkomst.stappen);
toets("de stap bewaart zijn uitkomst", uitkomst.stappen[0].resultaat.includes("0.8"));
toets("de tokens van elke ronde worden opgeteld", uitkomst.invoer === 20 && uitkomst.uitvoer === 10, { invoer: uitkomst.invoer, uitvoer: uitkomst.uitvoer });
toets("de tekst komt ook stukje voor stukje binnen", teksten.length === 2 && teksten[1].startsWith("De UC"), teksten);

// Een mislukte tool: de assistent krijgt de fout terug en mag het opnieuw proberen.
gedaan.length = 0;
const mislukt = await voerVraagUit("Doe iets", [], deps(
  [
    [oproep("c1", "sheet_get", { id: "weg" }), klaar("gereedschap")],
    [{ soort: "tekst", tekst: "Dat blad bestaat niet." }, klaar()],
  ],
  { voerUit: async () => ({ ok: false, code: "NOT_FOUND", error: "No sheet weg." }) },
));
toets("een mislukte tool wordt een fout-stap", mislukt.stappen[0].status === "fout" && mislukt.stappen[0].fout === "No sheet weg.", mislukt.stappen);
toets("de assistent ziet de fout in het gesprek", mislukt.tekst.includes("bestaat niet"));

// Weigeren: de tool gaat niet, en de assistent hoort waarom.
gedaan.length = 0;
const gevraagd = [];
const geweigerd = await voerVraagUit("Verwijder het blad", [], deps(
  [
    [oproep("c1", "sheet_remove", { id: "ex-1" }), klaar("gereedschap")],
    [{ soort: "tekst", tekst: "Dan laat ik het staan." }, klaar()],
  ],
  { vraagGoedkeuring: async (verzoek) => { gevraagd.push(verzoek); return "nee"; } },
));
toets("een destructieve tool wordt eerst gevraagd", gevraagd.length === 1 && gevraagd[0].soort === "vraag" && gevraagd[0].tool === "sheet_remove", gevraagd);
toets("na een weigering gaat de tool niet", gedaan.length === 0);
toets("de stap staat op geweigerd", geweigerd.stappen[0].status === "geweigerd", geweigerd.stappen);
toets("de assistent krijgt te horen dat het niet mocht", geweigerd.tekst.includes("laat ik het staan"));

// "Altijd toestaan" geldt voor de rest van de sessie.
gedaan.length = 0;
let gevraagd2 = 0;
const altijd = new Set();
const tweeKeer = await voerVraagUit("Verwijder twee bladen", [], deps([
  [oproep("c1", "sheet_remove", { id: "ex-1" }), oproep("c2", "sheet_remove", { id: "ex-2" }), klaar("gereedschap")],
  [{ soort: "tekst", tekst: "Klaar." }, klaar()],
], { vraagGoedkeuring: async () => { gevraagd2++; return "altijd"; } }), altijd);
toets("de eerste keer wordt het gevraagd", gevraagd2 === 1, gevraagd2);
toets("allebei de aanroepen zijn uitgevoerd", gedaan.length === 2 && gedaan.every((d) => d.naam === "sheet_remove"), gedaan);
toets("de keuze geldt voor de rest van de sessie", altijd.has("sheet_remove"));

// Overschrijven: eerst het verschil, dan pas schrijven.
gedaan.length = 0;
const voorbeelden = [];
const overschrijf = await voerVraagUit("Herschrijf het blad", [], deps(
  [
    [oproep("c1", "sheet_set_source", { id: "ex-1", source: "a = 1\nb = 99" }), klaar("gereedschap")],
    [{ soort: "tekst", tekst: "Aangepast." }, klaar()],
  ],
  {
    huidigeInhoud: async () => "a = 1\nb = 2",
    vraagGoedkeuring: async (verzoek) => { voorbeelden.push(verzoek); return "ja"; },
  },
));
toets("overschrijven geeft eerst een voorbeeld", voorbeelden.length === 1 && voorbeelden[0].soort === "voorbeeld", voorbeelden);
toets("het voorbeeld telt de gewijzigde regels", voorbeelden[0]?.voorbeeld.weg === 1 && voorbeelden[0]?.voorbeeld.bij === 1, voorbeelden[0]?.voorbeeld);
const beeldTekst = voorbeelden[0] ? voorbeeldTekst(voorbeelden[0].voorbeeld) : "";
toets("het voorbeeld laat de oude en de nieuwe regel zien", beeldTekst.includes("- b = 2") && beeldTekst.includes("+ b = 99"), beeldTekst);
toets("na goedkeuring wordt er geschreven", gedaan.length === 1 && gedaan[0].naam === "sheet_set_source", gedaan);
toets("de stap staat op klaar", overschrijf.stappen[0].status === "klaar");

// Dezelfde inhoud: geen vraag, geen stap die iets doet.
gedaan.length = 0;
const gevraagd3 = [];
await voerVraagUit("Zet dezelfde tekst", [], deps(
  [
    [oproep("c1", "sheet_set_source", { id: "ex-1", source: "a = 1" }), klaar("gereedschap")],
    [{ soort: "tekst", tekst: "Niets veranderd." }, klaar()],
  ],
  { huidigeInhoud: async () => "a = 1", vraagGoedkeuring: async (v) => { gevraagd3.push(v); return "ja"; } },
));
toets("dezelfde inhoud vraagt niets", gevraagd3.length === 0, gevraagd3);
toets("dezelfde inhoud wordt wel gewoon uitgevoerd", gedaan.length === 1);

// Een fout van de aanbieder.
const metFout = await voerVraagUit("Doe iets", [], deps([[{ soort: "fout", melding: "401 unauthorized" }]]));
toets("een fout van de aanbieder stopt de lus", metFout.einde === "fout" && metFout.melding === "401 unauthorized", metFout);

// De stopknop.
const gestopt = await voerVraagUit("Doe iets", [], deps([[{ soort: "tekst", tekst: "Half…" }, klaar("gestopt")]]));
toets("stoppen geeft een eigen einde", gestopt.einde === "gestopt" && gestopt.tekst === "Half…", gestopt);

// Te veel rondes: de lus stopt zelf.
let rondesGevraagd = 0;
const teVeel = await voerVraagUit("Blijf bezig", [], deps(
  [[oproep("c1", "sheet_get", { id: "ex-1" }), klaar("gereedschap")]],
  { maxRondes: 3, vraag: async (_v, bij) => { rondesGevraagd++; bij(oproep(`c${rondesGevraagd}`, "sheet_get", { id: "ex-1" })); bij(klaar("gereedschap")); } },
));
toets("na het maximum aantal rondes stopt de lus", teVeel.einde === "rondes" && rondesGevraagd === 3, { einde: teVeel.einde, rondesGevraagd });
toets("de melding zegt dat je verder kunt vragen", typeof teVeel.melding === "string" && teVeel.melding.includes("3"));

// Een lange uitkomst wordt ingekort voordat hij het gesprek in gaat.
const groot = await voerVraagUit("Geef alles", [], deps(
  [
    [oproep("c1", "sheet_get", { id: "ex-1" }), klaar("gereedschap")],
    [{ soort: "tekst", tekst: "Klaar." }, klaar()],
  ],
  { maxResultaatTekens: 50, voerUit: async () => ({ ok: true, data: { tekst: "y".repeat(200) } }) },
));
toets("een lange uitkomst wordt afgekort", groot.stappen[0].resultaat.includes("characters left out"), groot.stappen[0].resultaat);
toets("het aantal weggelaten tekens staat erbij", groot.stappen[0].resultaat.includes("… ("), groot.stappen[0].resultaat);
toets("kort() laat korte tekst staan", kort("abc", 10) === "abc");

// De argumenten gaan ongewijzigd naar de tool, ook als ze rommel bevatten.
gedaan.length = 0;
await voerVraagUit("X", [], deps([
  [oproep("c1", "sheet_set_input", "geen object"), klaar("gereedschap")],
  [{ soort: "tekst", tekst: "Ok." }, klaar()],
]));
toets("een oproep zonder object gaat als lege argumenten door", gedaan.length === 1 && Object.keys(gedaan[0].argumenten).length === 0, gedaan);

// ── 5. Profielen, derde-partij-modellen en OAuth ────────────────────────────
console.log("\n5. Profielen, derde-partij-modellen en OAuth");
toets("er zijn drie standaardprofielen", STANDAARD_PROFIELEN.length === 3 && STANDAARD_PROFIELEN.every((p) => p.ingebouwd === true));
toets("sjablonen bevatten OAuth- en lokale derdepartijen",
  AI_SJABLONEN.some((s) => s.id === "openrouter" && s.authModus === "oauth") &&
  AI_SJABLONEN.some((s) => s.id === "deepseek" && s.aanbieder === "openai") &&
  AI_SJABLONEN.some((s) => s.id === "ollama" && s.authModus === "none") &&
  OAUTH_SJABLONEN.some((o) => o.id === "google" && o.config.soort === "pkce"));

toets("maakProfielId maakt veilige unieke id's",
  maakProfielId("DeepSeek R1", []) === "deepseek-r1" &&
  maakProfielId("DeepSeek R1", ["deepseek-r1"]) === "deepseek-r1-2" &&
  maakProfielId("公司內網模型", []) === "custom" &&
  maakProfielId("a".repeat(90), []).length <= 64);

const vanLeeg = migreerInstellingen(null);
toets("lege instellingen geven 3 standaardprofielen", vanLeeg.actiefId === "anthropic" && vanLeeg.profielen.length === 3);

const vanOud = migreerInstellingen({ aanbieder: "openai", endpoint: "http://127.0.0.1:3425", model: "magpie" });
toets("oud formaat migreert met behoud van endpoint en model",
  vanOud.actiefId === "openai" &&
  vanOud.profielen.length === 3 &&
  vanOud.profielen.find((p) => p.id === "openai")?.endpoint === "http://127.0.0.1:3425" &&
  vanOud.profielen.find((p) => p.id === "openai")?.model === "magpie",
  vanOud);

const vanNieuw = migreerInstellingen({
  actiefId: "deepseek-r1",
  profielen: [
    ...STANDAARD_PROFIELEN,
    { id: "deepseek-r1", naam: "DeepSeek R1", aanbieder: "openai", endpoint: "https://api.deepseek.com", model: "deepseek-reasoner", authModus: "apikey" },
  ],
});
toets("nieuw formaat bewaart eigen profielen en actiefId",
  vanNieuw.actiefId === "deepseek-r1" && vanNieuw.profielen.length === 4 && vanNieuw.profielen[3].model === "deepseek-reasoner",
  vanNieuw);

toets("isLokaalEndpoint herkent localhost en 127.0.0.1",
  isLokaalEndpoint("http://127.0.0.1:3425") &&
  isLokaalEndpoint("http://localhost:11434/v1") &&
  !isLokaalEndpoint("https://api.openai.com"));

const authDummy = (extra = {}) => ({
  heeft_sleutel: false,
  heeft_oauth: false,
  heeft_client_secret: false,
  oauth_verlopen: false,
  oauth_heeft_refresh: false,
  ...extra,
});
const pNone = { id: "ollama", naam: "Ollama", aanbieder: "openai", endpoint: "http://127.0.0.1:11434/v1", model: "qwen2.5", authModus: "none" };
const pKey = { id: "deepseek", naam: "DeepSeek", aanbieder: "openai", endpoint: "https://api.deepseek.com", model: "deepseek-chat", authModus: "apikey" };
const pKeyLokaal = { ...pKey, id: "magpie", endpoint: "http://127.0.0.1:3425" };
const pOAuth = { id: "openrouter", naam: "OpenRouter", aanbieder: "openai", endpoint: "https://openrouter.ai/api/v1", model: "claude", authModus: "oauth" };

toets("authModus none is altijd klaar", isProfielKlaar(pNone, authDummy()).klaar === true);
toets("apikey zonder sleutel weigert extern maar staat lokaal toe",
  isProfielKlaar(pKey, authDummy()).reden === "geenSleutel" &&
  isProfielKlaar(pKey, authDummy({ heeft_sleutel: true })).klaar === true &&
  isProfielKlaar(pKeyLokaal, authDummy()).klaar === true);
toets("oauth controleert token en verloop met/zonder refresh",
  isProfielKlaar(pOAuth, authDummy()).reden === "geenOAuth" &&
  isProfielKlaar(pOAuth, authDummy({ heeft_oauth: true })).klaar === true &&
  isProfielKlaar(pOAuth, authDummy({ heeft_oauth: true, oauth_verlopen: true, oauth_heeft_refresh: false })).reden === "oauthVerlopen" &&
  isProfielKlaar(pOAuth, authDummy({ heeft_oauth: true, oauth_verlopen: true, oauth_heeft_refresh: true })).klaar === true);

const gezienVerzoek = [];
await voerVraagUit("Ping", [], {
  ...deps([[{ soort: "tekst", tekst: "Pong" }, klaar()]], {
    aanbieder: "openai",
    profiel: "openrouter",
    authModus: "oauth",
    extraKoppen: { "HTTP-Referer": "https://open-calcsheet.tw" },
    projectId: "proj-123",
    vraag: async (verzoek, bij) => {
      gezienVerzoek.push(verzoek);
      bij({ soort: "tekst", tekst: "Pong" });
      bij(klaar());
    },
  }),
});
toets("agent geeft profiel, auth_modus, extra_koppen en project_id door aan Rust",
  gezienVerzoek[0]?.profiel === "openrouter" &&
  gezienVerzoek[0]?.auth_modus === "oauth" &&
  gezienVerzoek[0]?.extra_koppen?.["HTTP-Referer"] === "https://open-calcsheet.tw" &&
  gezienVerzoek[0]?.project_id === "proj-123",
  gezienVerzoek[0]);

toets("openai en gemini hebben ingevulde OAuth-urls en callbackPath (openai incl. clientId en deviceCode)",
  Boolean(OPENAI_OAUTH.clientId && OPENAI_OAUTH.authUrl && OPENAI_OAUTH.tokenUrl && OPENAI_OAUTH.callbackPath) &&
  OPENAI_OAUTH.deviceCode === true &&
  Boolean(GEMINI_OAUTH.authUrl && GEMINI_OAUTH.tokenUrl && GEMINI_OAUTH.scopes) &&
  GEMINI_OAUTH.callbackPath === "/oauth2callback",
  STANDAARD_PROFIELEN);

toets("heeftOAuth en verwachteRedirectUri kloppen voor openai en gemini",
  heeftOAuth(STANDAARD_PROFIELEN.find((p) => p.id === "openai")) &&
  heeftOAuth(STANDAARD_PROFIELEN.find((p) => p.id === "gemini")) &&
  verwachteRedirectUri(OPENAI_OAUTH) === "http://localhost:1455/auth/callback" &&
  verwachteRedirectUri(GEMINI_OAUTH).startsWith("http://127.0.0.1:") &&
  verwachteRedirectUri(GEMINI_OAUTH).endsWith("/oauth2callback"));

const oudZonderOAuth = migreerInstellingen({
  actiefId: "anthropic",
  profielen: [
    { id: "anthropic", naam: "Anthropic (Claude)", aanbieder: "anthropic", endpoint: "https://api.anthropic.com", model: "claude-sonnet-5-5", authModus: "apikey", ingebouwd: true },
    { id: "openai", naam: "OpenAI", aanbieder: "openai", endpoint: "https://api.openai.com", model: "gpt-5", authModus: "apikey", ingebouwd: true },
    { id: "gemini", naam: "Google Gemini", aanbieder: "gemini", endpoint: "https://generativelanguage.googleapis.com", model: "gemini-2.5-pro", authModus: "apikey", oauth: { soort: "pkce", authUrl: "https://accounts.google.com/o/oauth2/v2/auth", tokenUrl: "https://oauth2.googleapis.com/token", clientId: "mijn-google-client", scopes: "" }, ingebouwd: true },
  ],
});
toets("migratie vult ontbrekende OAuth-velden van openai/gemini aan zonder clientId te wissen",
  Boolean(oudZonderOAuth.profielen.find((x) => x.id === "openai")?.oauth?.clientId) &&
  oudZonderOAuth.profielen.find((x) => x.id === "openai")?.oauth?.callbackPath === "/auth/callback" &&
  oudZonderOAuth.profielen.find((x) => x.id === "gemini")?.oauth?.clientId === "mijn-google-client" &&
  oudZonderOAuth.profielen.find((x) => x.id === "gemini")?.oauth?.callbackPath === "/oauth2callback",
  oudZonderOAuth.profielen);

const metAangepasteOAuth = vulOAuthAan({
  id: "openai",
  naam: "OpenAI",
  aanbieder: "openai",
  endpoint: "https://api.openai.com",
  model: "gpt-5",
  authModus: "oauth",
  oauth: { soort: "pkce", authUrl: "https://eigen.example/auth", tokenUrl: "https://eigen.example/token", clientId: "eigen-id", scopes: "openid" },
  ingebouwd: true,
});
toets("vulOAuthAan overschrijft door gebruiker ingevulde OAuth niet",
  metAangepasteOAuth.oauth?.clientId === "eigen-id" && metAangepasteOAuth.oauth?.authUrl === "https://eigen.example/auth");

const koppen = leesKoppen("X-Tenant: ocss\nAuthorization: negeer\nX-Api-Version: 2026-01");
toets("leesKoppen en schrijfKoppen verwerken extra headers zonder lege regels",
  koppen["X-Tenant"] === "ocss" &&
  koppen["X-Api-Version"] === "2026-01" &&
  koppen["Authorization"] === "negeer" &&
  schrijfKoppen({ "X-A": "1", "X-B": "2" }).includes("X-A: 1"));

console.log(fouten === 0 ? `\nAI-zijbalk: ${aantal} controles, alle groen.` : `\n${fouten} van ${aantal} controles gezakt.`);
process.exit(fouten === 0 ? 0 : 1);
