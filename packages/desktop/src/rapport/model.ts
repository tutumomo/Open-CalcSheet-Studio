/**
 * Het constructierapport van een project: documentgegevens, teksten,
 * uitgangspunten en belastingen.
 *
 * Alleen gegevens en standaardwaarden: geen React, en imports met waarden alleen uit
 * deze map en uit kaart/ (met extensie .ts, zonder React), zodat scripts/check-rapport.mjs dit bestand rechtstreeks
 * kan laden. Invoer staat als tekst opgeslagen, net als de projectgegevens: wat de
 * gebruiker typte ("0,56") blijft staan, rekenen gebeurt pas bij het opmaken.
 *
 * Wat de app meelevert is meertalig, met Engels als bron (meertalig.ts). Een rapport
 * bewaart de tekst in zijn eigen taal (`Rapport.taal`), zoals de gebruiker hem ziet.
 */
import { inTaal, type Meertalig } from "./meertalig.ts";
import { normaliseerSituatie, type Situatie } from "./situatie.ts";
import { normaliseerTw, type TwOpzet } from "./tw/blok.ts";


export type Fase = "" | "SO" | "VO" | "DO" | "TO" | "UO";
export const FASEN: readonly Fase[] = ["SO", "VO", "DO", "TO", "UO"];

export type RevisieStatus = "concept" | "ter goedkeuring" | "definitief";
export const REVISIE_STATUSSEN: readonly RevisieStatus[] = ["concept", "ter goedkeuring", "definitief"];

export interface Revisie {
  code: string;
  /** dd-mm-jjjj */
  datum: string;
  omschrijving: string;
  status: RevisieStatus;
}

export interface Constructeur {
  /** Met titel, zoals hij op het voorblad staat: "Ing. A. de Vries". */
  naam: string;
  telefoon: string;
  email: string;
}

export interface Huisstijl {
  /** Hoofdstuktitels en de rapporttitel. */
  hoofdkleur: string;
  /** Paragraafkoppen, labels op het voorblad, ondertitel, kopregels van tabellen. */
  accentkleur: string;
  /** Tekst in tabellen. */
  tabeltekst: string;
  /** Ingevulde waarden in tabellen. */
  invoerkleur: string;
  /** CSS font-family. */
  lettertype: string;
}

export interface BureauProfiel {
  naam: string;
  adres: string;
  postcode: string;
  plaats: string;
  telefoon: string;
  email: string;
  /** data-URL of "". */
  logo: string;
  /** Het logo in de kop van elke pagina en in de titelhoek van een tekening. Op het voorblad staat het altijd. */
  logoInKop: boolean;
  /** data-URL of "": over de volle paginabreedte onderaan elke pagina. */
  voetafbeelding: string;
  huisstijl: Huisstijl;
  constructeurs: Constructeur[];
}

export const STANDAARD_HUISSTIJL: Huisstijl = {
  hoofdkleur: "#1f3a5f",
  accentkleur: "#2f7d6d",
  tabeltekst: "#1f2937",
  invoerkleur: "#1d4ed8",
  lettertype: '"Segoe UI", "Helvetica Neue", Arial, sans-serif',
};

/**
 * De lettertypen in de keuzelijst. Inter en Space Grotesk levert de app zelf mee; de rest
 * staat op vrijwel elke Windows-computer en valt anders terug op wat erachter staat.
 */
export const LETTERTYPEN: readonly { naam: string; css: string }[] = [
  { naam: "Segoe UI", css: STANDAARD_HUISSTIJL.lettertype },
  { naam: "Arial", css: "Arial, Helvetica, sans-serif" },
  { naam: "Calibri", css: "Calibri, Carlito, Arial, sans-serif" },
  { naam: "Tahoma", css: "Tahoma, Verdana, sans-serif" },
  { naam: "Verdana", css: "Verdana, Geneva, sans-serif" },
  { naam: "Inter", css: "Inter, system-ui, sans-serif" },
  { naam: "Space Grotesk", css: '"Space Grotesk", system-ui, sans-serif' },
  { naam: "Cambria", css: "Cambria, Georgia, serif" },
  { naam: "Georgia", css: 'Georgia, "Times New Roman", serif' },
  { naam: "Times New Roman", css: '"Times New Roman", Times, serif' },
];

/** Wijkt deze huisstijl af van de standaard? Zo niet, dan houden losse bladen hun eigen opmaak. */
export function heeftEigenHuisstijl(h: Huisstijl): boolean {
  return (Object.keys(STANDAARD_HUISSTIJL) as (keyof Huisstijl)[]).some((k) => h[k] !== STANDAARD_HUISSTIJL[k]);
}

/**
 * De huisstijl als CSS-variabelen, voor op de wortel van een uitdraai. Een leeg veld valt
 * terug op de standaard. `--rpa-*` is het rapport (RapportAfdruk.css); `--pr-*` is de opmaak
 * van een blad (PrintDocument.css), en die verandert alleen bij een eigen huisstijl.
 */
export function huisstijlVariabelen(h: Huisstijl): Record<string, string> {
  const s = STANDAARD_HUISSTIJL;
  const hoofd = h.hoofdkleur || s.hoofdkleur;
  const accent = h.accentkleur || s.accentkleur;
  const tabel = h.tabeltekst || s.tabeltekst;
  const letter = h.lettertype || s.lettertype;
  const rapport = {
    "--rpa-hoofd": hoofd,
    "--rpa-accent": accent,
    "--rpa-tabel": tabel,
    "--rpa-invoer": h.invoerkleur || s.invoerkleur,
    "--rpa-font": letter,
  };
  if (!heeftEigenHuisstijl(h)) return rapport;
  return {
    ...rapport,
    "--pr-accent": accent,
    "--pr-tekst": tabel,
    "--pr-kopkleur": hoofd,
    "--pr-kop": letter,
    "--pr-letter": letter,
    "--pr-kern-letter": letter,
    "--pr-kern-kop": hoofd,
  };
}

/**
 * Een lettertypelijst die veilig in een stijlregel of SVG-attribuut kan, met enkele
 * aanhalingstekens. Een profiel kan via een project van iemand anders komen; wat iets anders
 * is dan namen, geeft een lege tekst.
 */
export function veiligLettertype(s: string): string {
  return /^[\p{L}\p{N} ,"'_-]+$/u.test(s) ? s.replace(/"/g, "'") : "";
}

export function leegBureau(): BureauProfiel {
  return {
    naam: "", adres: "", postcode: "", plaats: "", telefoon: "", email: "",
    logo: "", logoInKop: true, voetafbeelding: "",
    huisstijl: { ...STANDAARD_HUISSTIJL },
    constructeurs: [],
  };
}

/** 2.2 Rol binnen het project en bereik rapport. */
export interface Rol {
  rol: string;
  architect: string;
  datumOnderlegger: string;
}

export interface Brandeisen {
  /** Minuten, of "-" voor geen eis. */
  hoofddraagconstructie: string;
  brandscheiding: string;
  vluchtroute: string;
  /** Verwijzing naar de regelgeving, rechts van de tabel. */
  verwijzing: string;
}

export interface Materiaalregel { type: string; soort: string; opmerking: string; }
export interface Bevestigingsregel { type: string; kwaliteit: string; }
export interface Conserveringsregel { onderdeel: string; systeem: string; }
/** 4.8: één eis per kolom; leeg = geen eis in die kolom. */
export interface Vervormingsregel { onderdeel: string; ueind: string; ubij: string; uhor: string; }

export interface BestaandeSituatie {
  /** false = paragraaf 4.6 valt weg (nieuwbouw). */
  opnemen: boolean;
  bouwjaar: string;
  bron: string;
  /** "Ja" of "Nee". */
  berekeningBeschikbaar: string;
  materiaalgegevensBeschikbaar: string;
}

export interface Uitgangspunten {
  soortBouwwerk: string;
  brand: Brandeisen;
  materialen: Materiaalregel[];
  materialenNoot: string;
  bevestiging: Bevestigingsregel[];
  conservering: Conserveringsregel[];
  conserveringSlot: string;
  bestaand: BestaandeSituatie;
  vervormingen: Vervormingsregel[];
}

export interface Windcoefficient { omschrijving: string; c: string; }
export interface Wind {
  /** m */
  gebouwhoogte: string;
  cscd: string;
  coefficienten: Windcoefficient[];
}

/** 5.4: één belastingklasse; `categorie` is een id uit CATEGORIEEN (normwaarden.ts). */
export interface Belastingklasse {
  categorie: string;
  /** kN/m², alleen bij vloeren; "" = geen. */
  lichteScheidingswanden: string;
  /** graden, alleen bij daken. */
  dakhelling: string;
  /** kN/m¹, alleen bij daken. */
  qlast: string;
}

/** Een laag in een vlakopbouw: p = d × ρ, of de ingevulde p als die er staat. */
export interface Laag { naam: string; d: string; rho: string; p: string; }
/** Een laag in een gevelopbouw: q = p × h × vulling. */
export interface Gevellaag { naam: string; p: string; h: string; vulling: string; }

export type Opbouw =
  | { soort: "vlak"; naam: string; lagen: Laag[] }
  | { soort: "gevel"; naam: string; lagen: Gevellaag[] };

export interface Belastingen {
  wind: Wind;
  klassen: Belastingklasse[];
  vloerenDaken: Opbouw[];
  wanden: Opbouw[];
}

/**
 * Opmaakkeuzes die met een versie van de rapportopbouw zijn bijgekomen
 * (RAPPORT_VERSIE). Een nieuw rapport heeft ze aan; een ouder rapport krijgt
 * bij het openen het oude gedrag als eigen keuze, en de gebruiker kan ze in
 * het paneel zelf omzetten.
 */
export interface Opmaak {
  /** 3.1: het blok Wijziging heet bij nieuwbouw Constructieprincipe (titelVan in opzet.ts). */
  constructieprincipe: boolean;
  /** Een korte regel die op ":" eindigt komt als vette subkop in de afdruk (tekstRegels in invullen.ts). */
  subkoppen: boolean;
  /**
   * De inhoudsopgave noemt ook de bladen: in hoofdstuk Berekeningen de bladen met hun
   * uitwerking daar, onder bijlage A de rest (inhoudsopgave in opzet.ts).
   */
  bladenInInhoud: boolean;
}

export interface Rapport {
  /**
   * Versie van de rapportopbouw waarmee dit rapport is gemaakt (RAPPORT_VERSIE).
   * Ontbreekt in rapporten van vóór versie 2; normaliseerRapport werkt die bij.
   */
  versie: number;
  /** De taal van het rapport op papier: koppen, vaste woorden, teksten en rekenbladen. */
  taal: string;
  /**
   * 台灣版：報告架構種類（"eurocode" 歐規 或 "tw" 台灣結構計算書）。
   * 缺此欄位或版本小於 6 時視為 "eurocode"（舊報告維持原架構一字不變）；新開繁中報告預設 "tw"。
   */
  opzetSoort: "eurocode" | "tw";
  /**
   * Per tekst-id de taal waarin de gebruiker die tekst typte. Staat die taal anders dan
   * `taal`, dan meldt het paneel dat de tekst nog vertaald moet worden (taalwissel.ts).
   * Een meegeleverde variant heeft hier geen regel: die wisselt mee.
   */
  tekstTaal: Record<string, string>;
  titel: string;
  kenmerk: string;
  fase: Fase;
  normen: string;
  /** Adresregels onder de opdrachtgever, gescheiden door "\n". */
  opdrachtgeverAdres: string;
  verantwoordelijk: string;
  uitvoerend: string;
  revisies: Revisie[];
  /** Per tekst-id (zie opzet.ts) de tekst. */
  teksten: Record<string, string>;
  rol: Rol;
  uitgangspunten: Uitgangspunten;
  belastingen: Belastingen;
  /** Per exemplaar-id een eigen toelichting voor hoofdstuk Berekeningen. */
  toelichting: Record<string, string>;
  /** Per exemplaar-id: uitwerking in het hoofdstuk zelf in plaats van in bijlage A. */
  inHoofdstuk: Record<string, boolean>;
  /** Titels van eigen bijlagen (B, C, …); bijlage A is altijd de uitwerking. */
  bijlagen: string[];
  /** Per knoop-id uit opzet.ts: begint op een nieuwe pagina (overschrijft de standaard). */
  nieuwePagina: Record<string, boolean>;
  opmaak: Opmaak;
  /**
   * De pagina Situatie met kaarten van de plek van het project. Ontbreekt zolang er geen
   * kaarten zijn gemaakt; een nieuw optioneel veld, dus RAPPORT_VERSIE blijft gelijk.
   */
  situatie?: Situatie;
  /** Vastgelegde kopie van het bureauprofiel. */
  bureau: BureauProfiel;
  /**
   * De Taiwanese kop- en voetgegevens: het blok van de ondertekenende ingenieur,
   * de doorlopende kop- en voettekst en de nummering van tabellen en figuren
   * (tw/blok.ts). Leeg van zichzelf, dus een rapport zonder ingevuld blok ziet
   * er precies zo uit als voorheen; een nieuw optioneel veld, dus
   * RAPPORT_VERSIE blijft gelijk.
   */
  tw?: TwOpzet;
}

/**
 * De huidige versie van de rapportopbouw. Verandert een standaard zo dat een
 * opgeslagen rapport er anders door uit zou komen, dan gaat de versie omhoog
 * en legt normaliseerRapport voor oudere rapporten het oude gedrag vast:
 *
 *   1  alles van vóór het versienummer;
 *   2  hoofdstuk Projectgegevens begint standaard op een nieuwe pagina
 *      (nieuwePagina in OPZET, opzet.ts). Een ouder rapport zonder eigen
 *      keuze krijgt nieuwePagina.projectgegevens = false: daar liep het
 *      hoofdstuk door na de inleiding, en dat blijft zo.
 *   3  het blok Wijziging in 3.1 heet bij nieuwbouw Constructieprincipe, en
 *      een korte regel die op ":" eindigt wordt een vette subkop (Opmaak).
 *      Een ouder rapport zonder eigen keuze krijgt opmaak.constructieprincipe
 *      en opmaak.subkoppen = false: de kop blijft Wijziging en de teksten
 *      blijven zonder subkoppen.
 *   4  de inhoudsopgave noemt ook de bladen (Opmaak). Een ouder rapport zonder
 *      eigen keuze krijgt opmaak.bladenInInhoud = false: de inhoudsopgave blijft
 *      even lang, en de vellen erna verschuiven niet.
 *   5  het rapport heeft een taal en de meegeleverde teksten zijn meertalig. Een
 *      ouder rapport krijgt taal = "nl", want zijn inhoud is Nederlands, en wat
 *      erin ontbreekt wordt Nederlands aangevuld.
 *   6  台灣版報告架構（opzetSoort: "eurocode" | "tw"）。缺此欄位或版本小於 6 時視為
 *      "eurocode"，確保舊報告維持歐洲規範章節架構逐字元完全相同；新開繁中報告預設 "tw"。
 */
export const RAPPORT_VERSIE = 6;

// ── Wat de app meelevert ────────────────────────────────────────────────────
// Elke waarde die in een nieuw rapport staat of als suggestie wordt aangeboden, in elke
// taal. Wisselen van taal zoekt hierin (taalwissel.ts): een waarde die gelijk is aan een
// regel hier, wisselt mee; eigen invoer blijft staan.

/** Suggesties voor de rapporttitel; de eerste is de standaard. */
export const TITELS: readonly Meertalig[] = [
  { en: "Structural advice & calculations", nl: "Constructieadvies & berekeningen", "zh-TW": "結構計算書及說明" },
  { en: "Structural calculation", nl: "Constructieve berekening", "zh-TW": "結構計算書" },
  { en: "Structural advice", nl: "Constructief advies", "zh-TW": "結構設計說明" },
  { en: "Structural calculations and drawings", nl: "Constructieve berekeningen en tekeningen", "zh-TW": "結構計算書及設計圖" },
  { en: "Assessment of the existing structure", nl: "Beoordeling bestaande constructie", "zh-TW": "既有結構評估" },
];

/** Suggesties voor de rol in 2.2; de eerste is de standaard. */
export const ROLLEN: readonly Meertalig[] = [
  { en: "Lead structural engineer", nl: "Hoofdconstructeur", "zh-TW": "計畫主持結構技師" },
  { en: "Structural engineer", nl: "Constructeur", "zh-TW": "結構設計工程師" },
  { en: "Structural consultant", nl: "Constructief adviseur", "zh-TW": "結構顧問" },
  { en: "Checking engineer", nl: "Controlerend constructeur", "zh-TW": "審核技師" },
];

/** Suggesties voor de soort bouwwerk in 4.1; de eerste is de standaard. */
export const SOORTEN_BOUWWERK: readonly Meertalig[] = [
  { en: "Dwelling", nl: "Woning", "zh-TW": "住宅" },
  { en: "Single-family house", nl: "Eengezinswoning", "zh-TW": "透天住宅" },
  { en: "Apartment building", nl: "Appartementencomplex", "zh-TW": "集合住宅大樓" },
  { en: "Villa", nl: "Villa", "zh-TW": "別墅" },
  { en: "Office", nl: "Kantoor", "zh-TW": "辦公大樓" },
  { en: "Industrial hall", nl: "Bedrijfshal", "zh-TW": "廠房 / 工業廠房" },
  { en: "Outbuilding", nl: "Bijgebouw", "zh-TW": "附屬建物" },
  { en: "Shed", nl: "Schuur", "zh-TW": "倉儲設施" },
];

const NORMEN: Meertalig = { en: "NEN-EN 1990 to 1997", nl: "NEN-EN 1990 t/m 1997", "zh-TW": "台灣建築結構設計規範 (rc112/steel99/seis113/wind103)" };
const EERSTE_UITGAVE: Meertalig = { en: "First issue", nl: "Eerste uitgave", "zh-TW": "初版發行" };
const NIET_VAN_TOEPASSING: Meertalig = { en: "n/a", nl: "n.v.t.", "zh-TW": "不適用" };

/** 4.3: de standaardregels; de sterkteklassen zijn codes en blijven in elke taal gelijk. */
const MATERIALEN: readonly { type: Meertalig; soort: string; opmerking: Meertalig | string }[] = [
  {
    type: { en: "In-situ concrete", nl: "TPG Beton", "zh-TW": "場鑄混凝土" },
    soort: "C20/25",
    opmerking: {
      en: "(for exposure classes see concrete calculations and drawing)",
      nl: "(voor milieuklassen zie berekening betononderdelen en tekening)",
      "zh-TW": "（暴露環境條件見混凝土計算及設計圖）",
    },
  },
  { type: { en: "Timber", nl: "Hout", "zh-TW": "木材" }, soort: "C24", opmerking: "" },
  { type: { en: "Wood-based panels", nl: "Plaatmateriaal", "zh-TW": "板材" }, soort: "CE2+", opmerking: "" },
  { type: { en: "Reinforcing steel", nl: "Wapeningsstaal", "zh-TW": "鋼筋" }, soort: "B500", opmerking: "" },
  { type: { en: "Steel", nl: "Staal", "zh-TW": "結構用鋼材" }, soort: "S235", opmerking: "JR" },
  { type: { en: "Grout under steel", nl: "Ondervoeging staal", "zh-TW": "鋼骨座漿無收縮水泥砂漿" }, soort: "K50", opmerking: "" },
];
const MATERIALEN_NOOT: Meertalig = { en: "(unless stated otherwise)", nl: "(tenzij anders aangegeven)", "zh-TW": "（除另有註明外）" };
const BEVESTIGING: readonly { type: Meertalig; kwaliteit: string }[] = [
  { type: { en: "Bolts", nl: "Bouten", "zh-TW": "螺栓" }, kwaliteit: "8.8" },
  { type: { en: "Coach screws", nl: "Houtdraaibout", "zh-TW": "木螺釘" }, kwaliteit: "4.6" },
  { type: { en: "Chemical anchors", nl: "Chemische Ankers", "zh-TW": "化學錨栓" }, kwaliteit: "5.8" },
];
const CONSERVERING: readonly { onderdeel: Meertalig; systeem: Meertalig }[] = [
  { onderdeel: { en: "External structures", nl: "Buitenconstructies", "zh-TW": "室外部位構件" }, systeem: { en: "Duplex or hot-dip galvanised", nl: "Duplex of thermisch verzinkt", "zh-TW": "雙重防蝕或熱浸鍍鋅" } },
  { onderdeel: { en: "In cavity walls", nl: "Constructies in spouw", "zh-TW": "雙層壁內構件" }, systeem: { en: "Hot-dip galvanised", nl: "Thermisch verzinkt", "zh-TW": "熱浸鍍鋅" } },
  { onderdeel: { en: "Internal steelwork", nl: "Staal binnen", "zh-TW": "室內部構件" }, systeem: { en: "Paint system", nl: "Verf systeem", "zh-TW": "防銹底漆及面漆系統" } },
];
const CONSERVERING_SLOT: Meertalig = {
  en: "Corrosion protection applies to newly installed structural elements.",
  nl: "Conservering wordt toegepast op nieuw te plaatsen constructieonderdelen.",
  "zh-TW": "防蝕處理適用於新建或新安裝之結構構件。",
};
/** 4.8: de eisen zijn getallen en symbolen; die krijgen de notatie van de taal (standaardVervormingen). */
const VERVORMINGEN: readonly { onderdeel: Meertalig; ueind: string; ubij: string; uhor: string }[] = [
  { onderdeel: { en: "Vertical deflection of roofs", nl: "Verticale doorbuiging van daken", "zh-TW": "屋頂垂直撓度限制" }, ueind: "0,004l_rep", ubij: "0,004l_rep", uhor: "" },
  { onderdeel: { en: "Vertical deflection of floors", nl: "Verticale doorbuiging van vloeren", "zh-TW": "樓地板垂直撓度限制" }, ueind: "0,004l_rep", ubij: "0,003l_rep", uhor: "" },
  { onderdeel: { en: "Floors with masonry walls", nl: "Vloer met steenachtige wanden", "zh-TW": "支承磚石隔間牆之樓地板" }, ueind: "", ubij: "0,002l_rep", uhor: "" },
  { onderdeel: { en: "Horizontal displacement, building", nl: "Horizontale verplaatsing bouwwerk", "zh-TW": "建築物側向位移限制" }, ueind: "", ubij: "", uhor: "H/300" },
  { onderdeel: { en: "Horizontal displacement, partition", nl: "Horizontale verplaatsing afscheiding", "zh-TW": "隔間牆側向位移限制" }, ueind: "", ubij: "", uhor: "< 20 mm" },
];

const meertalig = (x: Meertalig | string): x is Meertalig => typeof x !== "string";

/** Per veld wat de app er kan neerzetten; wisselTaal zoekt hierin (taalwissel.ts). */
export const MEEGELEVERD = {
  titel: TITELS,
  normen: [NORMEN],
  rol: ROLLEN,
  architect: [NIET_VAN_TOEPASSING],
  datumOnderlegger: [NIET_VAN_TOEPASSING],
  soortBouwwerk: SOORTEN_BOUWWERK,
  revisie: [EERSTE_UITGAVE],
  materiaalType: MATERIALEN.map((m) => m.type),
  materiaalOpmerking: MATERIALEN.map((m) => m.opmerking).filter(meertalig),
  materialenNoot: [MATERIALEN_NOOT],
  bevestiging: BEVESTIGING.map((b) => b.type),
  conserveringOnderdeel: CONSERVERING.map((c) => c.onderdeel),
  conserveringSysteem: CONSERVERING.map((c) => c.systeem),
  conserveringSlot: [CONSERVERING_SLOT],
  vervormingOnderdeel: VERVORMINGEN.map((v) => v.onderdeel),
} as const satisfies Record<string, readonly Meertalig[]>;

/** Een taalcode uit een bestand: "en", "nl", "pt-BR". Iets anders geeft undefined. */
export function leesTaal(x: unknown): string | undefined {
  return typeof x === "string" && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(x) ? x : undefined;
}

/**
 * Talen die een getal met een decimale komma schrijven. Ook de bron van het
 * vaste getal in een meegeleverde waarde: die staat hier met een komma.
 */
export function decimaleKomma(taal: string): boolean {
  return /^(nl|de|fr)\b/.test(taal);
}

/**
 * Een getal als tekst in de notatie van de taal, ook binnen een eis als "0,004l_rep":
 * alleen een scheidingsteken tussen twee cijfers verandert. Voor wat de app meelevert en
 * bij het wisselen van taal; invoer op zich blijft staan zoals hij getypt is.
 */
export function inNotatie(s: string, taal: string): string {
  return decimaleKomma(taal) ? s.replace(/(\d)\.(\d)/g, "$1,$2") : s.replace(/(\d),(\d)/g, "$1.$2");
}

// ── Standaardwaarden ────────────────────────────────────────────────────────
// Elke aanroep bouwt verse objecten en lijsten: een rapport dat de store
// bijwerkt mag nooit een lijst delen met het volgende nieuwe rapport.

function standaardRol(taal: string): Rol {
  return { rol: inTaal(ROLLEN[0], taal), architect: inTaal(NIET_VAN_TOEPASSING, taal), datumOnderlegger: inTaal(NIET_VAN_TOEPASSING, taal) };
}

function standaardUitgangspunten(taal: string): Uitgangspunten {
  return {
    soortBouwwerk: inTaal(SOORTEN_BOUWWERK[0], taal),
    brand: { hoofddraagconstructie: "-", brandscheiding: "-", vluchtroute: "-", verwijzing: "" },
    materialen: MATERIALEN.map((m) => ({
      type: inTaal(m.type, taal),
      soort: m.soort,
      opmerking: typeof m.opmerking === "string" ? m.opmerking : inTaal(m.opmerking, taal),
    })),
    materialenNoot: inTaal(MATERIALEN_NOOT, taal),
    bevestiging: BEVESTIGING.map((b) => ({ type: inTaal(b.type, taal), kwaliteit: b.kwaliteit })),
    conservering: CONSERVERING.map((c) => ({ onderdeel: inTaal(c.onderdeel, taal), systeem: inTaal(c.systeem, taal) })),
    conserveringSlot: inTaal(CONSERVERING_SLOT, taal),
    bestaand: {
      opnemen: false, bouwjaar: "", bron: "",
      // Een code: de afdruk zet hem in de taal van het rapport.
      berekeningBeschikbaar: "Ja", materiaalgegevensBeschikbaar: "Ja",
    },
    // `_rep` blijft tekst: de afdruk zet het als subscript.
    vervormingen: VERVORMINGEN.map((v) => ({
      onderdeel: inTaal(v.onderdeel, taal),
      ueind: inNotatie(v.ueind, taal),
      ubij: inNotatie(v.ubij, taal),
      uhor: inNotatie(v.uhor, taal),
    })),
  };
}

function standaardBelastingen(taal: string): Belastingen {
  const n = (s: string) => inNotatie(s, taal);
  return {
    wind: {
      gebouwhoogte: "",
      cscd: "1",
      coefficienten: [
        { omschrijving: "", c: n("0,04") },
        { omschrijving: "", c: n("0,40") },
        { omschrijving: "", c: n("0,80") },
        { omschrijving: "", c: n("1,10") },
      ],
    },
    klassen: [
      { categorie: "A-vloer", lichteScheidingswanden: n("0,80"), dakhelling: "", qlast: "" },
      { categorie: "H-dak", lichteScheidingswanden: "", dakhelling: "0", qlast: n("2,0") },
    ],
    vloerenDaken: [],
    wanden: [],
  };
}

/** Een nieuw rapport in deze taal. `vandaag` in dd-mm-jjjj; `teksten` komen uit de standaardteksten. */
export function standaardRapport(vandaag: string, teksten: Record<string, string>, taal = "en"): Rapport {
  return {
    versie: RAPPORT_VERSIE,
    taal,
    opzetSoort: taal === "zh-TW" ? "tw" : "eurocode",
    tekstTaal: {},
    titel: inTaal(TITELS[0], taal),
    kenmerk: "",
    fase: "",
    normen: inTaal(NORMEN, taal),
    opdrachtgeverAdres: "",
    verantwoordelijk: "",
    uitvoerend: "",
    revisies: [{ code: "A", datum: vandaag, omschrijving: inTaal(EERSTE_UITGAVE, taal), status: "concept" }],
    teksten: { ...teksten },
    rol: standaardRol(taal),
    uitgangspunten: standaardUitgangspunten(taal),
    belastingen: standaardBelastingen(taal),
    toelichting: {},
    inHoofdstuk: {},
    bijlagen: [],
    nieuwePagina: {},
    opmaak: { constructieprincipe: true, subkoppen: true, bladenInInhoud: true },
    bureau: leegBureau(),
    tw: normaliseerTw(undefined),
  };
}

// ── Normaliseren ────────────────────────────────────────────────────────────
// Een rapport komt uit een projectbestand of uit de opslag, en dus mogelijk
// van een oudere of nieuwere versie, of met de hand bewerkt. Alles wordt per
// veld gecontroleerd: wat ontbreekt of een verkeerd type heeft wordt de
// standaard, onbekende velden vallen weg, en lijsten houden alleen de
// elementen die een object zijn. Een lege tekst ("") is wél geldig: die heeft
// de gebruiker zelf leeggemaakt. Een rapport van een oudere versie van de
// rapportopbouw (RAPPORT_VERSIE) houdt zijn opmaak: wat bij die versie de
// standaard was, wordt een eigen keuze in het rapport.

type Los = Record<string, unknown>;

/** Een gewoon object (geen lijst, geen null), anders undefined. */
function object(x: unknown): Los | undefined {
  return x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Los) : undefined;
}

function tekst(x: unknown, standaard: string): string {
  return typeof x === "string" ? x : standaard;
}

/**
 * Een lijst uit het bestand. Geen lijst → de standaard; wel een lijst → alleen
 * de elementen die een object zijn, elk genormaliseerd. `normaliseer` mag een
 * element afwijzen met null (bijvoorbeeld een opbouw van een onbekende soort).
 */
function lijst<T>(x: unknown, standaard: T[], normaliseer: (o: Los) => T | null): T[] {
  if (!Array.isArray(x)) return standaard;
  const uit: T[] = [];
  for (const el of x) {
    const o = object(el);
    if (!o) continue;
    const n = normaliseer(o);
    if (n !== null) uit.push(n);
  }
  return uit;
}

/** Tekstwaarden per sleutel, over `basis` heen; andere typen vallen weg. */
function tekstRecord(x: unknown, basis: Record<string, string> = {}): Record<string, string> {
  const uit: Record<string, string> = { ...basis };
  const o = object(x);
  if (o) for (const [k, v] of Object.entries(o)) if (typeof v === "string") uit[k] = v;
  return uit;
}

/** Ja/nee-waarden per sleutel; andere typen vallen weg. */
function waarheidRecord(x: unknown): Record<string, boolean> {
  const uit: Record<string, boolean> = {};
  const o = object(x);
  if (o) for (const [k, v] of Object.entries(o)) if (typeof v === "boolean") uit[k] = v;
  return uit;
}

function normaliseerOpbouw(o: Los): Opbouw | null {
  const naam = tekst(o.naam, "");
  if (o.soort === "vlak") {
    return {
      soort: "vlak", naam,
      lagen: lijst(o.lagen, [], (l): Laag => ({
        naam: tekst(l.naam, ""), d: tekst(l.d, ""), rho: tekst(l.rho, ""), p: tekst(l.p, ""),
      })),
    };
  }
  if (o.soort === "gevel") {
    return {
      soort: "gevel", naam,
      lagen: lijst(o.lagen, [], (l): Gevellaag => ({
        naam: tekst(l.naam, ""), p: tekst(l.p, ""), h: tekst(l.h, ""), vulling: tekst(l.vulling, ""),
      })),
    };
  }
  return null;
}

/**
 * Een bureauprofiel uit een bestand of de instellingen. Huisstijlvelden die
 * leeg zijn krijgen de standaard: een lege kleur of een leeg lettertype is
 * nooit bedoeld en zou de afdruk kleurloos maken.
 */
export function normaliseerBureau(x: unknown): BureauProfiel {
  const s = leegBureau();
  const o = object(x);
  if (!o) return s;
  const h = object(o.huisstijl) ?? {};
  const stijl = (v: unknown, standaard: string) => tekst(v, standaard) || standaard;
  return {
    naam: tekst(o.naam, ""),
    adres: tekst(o.adres, ""),
    postcode: tekst(o.postcode, ""),
    plaats: tekst(o.plaats, ""),
    telefoon: tekst(o.telefoon, ""),
    email: tekst(o.email, ""),
    logo: tekst(o.logo, ""),
    logoInKop: o.logoInKop !== false,
    voetafbeelding: tekst(o.voetafbeelding, ""),
    huisstijl: {
      hoofdkleur: stijl(h.hoofdkleur, s.huisstijl.hoofdkleur),
      accentkleur: stijl(h.accentkleur, s.huisstijl.accentkleur),
      tabeltekst: stijl(h.tabeltekst, s.huisstijl.tabeltekst),
      invoerkleur: stijl(h.invoerkleur, s.huisstijl.invoerkleur),
      lettertype: stijl(h.lettertype, s.huisstijl.lettertype),
    },
    constructeurs: lijst(o.constructeurs, [], (c): Constructeur => ({
      naam: tekst(c.naam, ""), telefoon: tekst(c.telefoon, ""), email: tekst(c.email, ""),
    })),
  };
}

/**
 * Een rapport uit een bestand of de opslag, aangevuld met standaardwaarden. Onbekende
 * velden vallen weg; verkeerde typen worden standaard. Geneste objecten en lijsten
 * worden per veld gecontroleerd.
 *
 * `teksten` mag een functie van de taal zijn, zodat ontbrekende teksten in de taal van
 * dit rapport komen. `nieuweTaal` geldt als er geen rapport is en voor een rapport van
 * deze versie zonder bruikbare taal; een rapport van vóór versie 5 is Nederlands.
 */
export function normaliseerRapport(
  x: unknown,
  vandaag: string,
  teksten: Record<string, string> | ((taal: string) => Record<string, string>),
  nieuweTaal = "en",
): Rapport {
  const o = object(x);
  // Zonder geldig versienummer: een rapport van vóór versie 2.
  const versie = o && typeof o.versie === "number" && Number.isInteger(o.versie) && o.versie >= 1 ? o.versie : 1;
  const taal = !o ? nieuweTaal : leesTaal(o.taal) ?? (versie < 5 ? "nl" : nieuweTaal);
  const s = standaardRapport(vandaag, typeof teksten === "function" ? teksten(taal) : teksten, taal);
  if (!o) return s;

  const rol = object(o.rol) ?? {};
  const u = object(o.uitgangspunten) ?? {};
  const su = s.uitgangspunten;
  const brand = object(u.brand) ?? {};
  const bestaand = object(u.bestaand) ?? {};
  const b = object(o.belastingen) ?? {};
  const sb = s.belastingen;
  const wind = object(b.wind) ?? {};

  const nieuwePagina = waarheidRecord(o.nieuwePagina);
  // Versie 2 zette Projectgegevens standaard op een nieuwe pagina; een ouder
  // rapport zonder eigen keuze loopt door na de inleiding, zoals het was.
  if (versie < 2 && nieuwePagina.projectgegevens === undefined) nieuwePagina.projectgegevens = false;
  // Versie 3 bracht de kop Constructieprincipe en de subkoppen; een ouder
  // rapport zonder eigen keuze houdt de kop Wijziging en tekst zonder subkoppen.
  const opmaak = object(o.opmaak) ?? {};
  const keuze = (x: unknown, standaard: boolean) => (typeof x === "boolean" ? x : versie < 3 ? false : standaard);
  const situatie = normaliseerSituatie(o.situatie);
  // 台灣版：報告架構種類。版本小於 6 或未指定時預設為 "eurocode"，確保舊報告輸出維持原樣。
  const opzetSoort: "eurocode" | "tw" =
    o && (o.opzetSoort === "tw" || o.opzetSoort === "eurocode")
      ? o.opzetSoort
      : (versie < 6 ? "eurocode" : s.opzetSoort);

  return {
    // Een nieuwer rapport houdt zijn hogere versie: zijn eigen bijwerkingen zijn al gedaan.
    versie: Math.max(versie, RAPPORT_VERSIE),
    taal,
    opzetSoort,
    tekstTaal: Object.fromEntries(Object.entries(tekstRecord(o.tekstTaal)).filter(([, t]) => leesTaal(t) !== undefined)),
    titel: tekst(o.titel, s.titel),
    kenmerk: tekst(o.kenmerk, s.kenmerk),
    fase: FASEN.includes(o.fase as Fase) ? (o.fase as Fase) : "",
    normen: tekst(o.normen, s.normen),
    opdrachtgeverAdres: tekst(o.opdrachtgeverAdres, s.opdrachtgeverAdres),
    verantwoordelijk: tekst(o.verantwoordelijk, s.verantwoordelijk),
    uitvoerend: tekst(o.uitvoerend, s.uitvoerend),
    revisies: lijst(o.revisies, s.revisies, (r): Revisie => ({
      code: tekst(r.code, ""),
      datum: tekst(r.datum, ""),
      omschrijving: tekst(r.omschrijving, ""),
      status: REVISIE_STATUSSEN.includes(r.status as RevisieStatus) ? (r.status as RevisieStatus) : "concept",
    })),
    // Over de standaardteksten heen: een tekst-id die in het bestand ontbreekt
    // (ouder bestand, of een onderdeel dat later is bijgekomen) krijgt zo zijn
    // standaardtekst, terwijl een bewust leeggemaakte tekst ("") leeg blijft.
    teksten: tekstRecord(o.teksten, s.teksten),
    rol: {
      rol: tekst(rol.rol, s.rol.rol),
      architect: tekst(rol.architect, s.rol.architect),
      datumOnderlegger: tekst(rol.datumOnderlegger, s.rol.datumOnderlegger),
    },
    uitgangspunten: {
      soortBouwwerk: tekst(u.soortBouwwerk, su.soortBouwwerk),
      brand: {
        hoofddraagconstructie: tekst(brand.hoofddraagconstructie, su.brand.hoofddraagconstructie),
        brandscheiding: tekst(brand.brandscheiding, su.brand.brandscheiding),
        vluchtroute: tekst(brand.vluchtroute, su.brand.vluchtroute),
        verwijzing: tekst(brand.verwijzing, su.brand.verwijzing),
      },
      materialen: lijst(u.materialen, su.materialen, (m): Materiaalregel => ({
        type: tekst(m.type, ""), soort: tekst(m.soort, ""), opmerking: tekst(m.opmerking, ""),
      })),
      materialenNoot: tekst(u.materialenNoot, su.materialenNoot),
      bevestiging: lijst(u.bevestiging, su.bevestiging, (m): Bevestigingsregel => ({
        type: tekst(m.type, ""), kwaliteit: tekst(m.kwaliteit, ""),
      })),
      conservering: lijst(u.conservering, su.conservering, (m): Conserveringsregel => ({
        onderdeel: tekst(m.onderdeel, ""), systeem: tekst(m.systeem, ""),
      })),
      conserveringSlot: tekst(u.conserveringSlot, su.conserveringSlot),
      bestaand: {
        opnemen: typeof bestaand.opnemen === "boolean" ? bestaand.opnemen : su.bestaand.opnemen,
        bouwjaar: tekst(bestaand.bouwjaar, su.bestaand.bouwjaar),
        bron: tekst(bestaand.bron, su.bestaand.bron),
        berekeningBeschikbaar: tekst(bestaand.berekeningBeschikbaar, su.bestaand.berekeningBeschikbaar),
        materiaalgegevensBeschikbaar: tekst(bestaand.materiaalgegevensBeschikbaar, su.bestaand.materiaalgegevensBeschikbaar),
      },
      vervormingen: lijst(u.vervormingen, su.vervormingen, (v): Vervormingsregel => ({
        onderdeel: tekst(v.onderdeel, ""), ueind: tekst(v.ueind, ""), ubij: tekst(v.ubij, ""), uhor: tekst(v.uhor, ""),
      })),
    },
    belastingen: {
      wind: {
        gebouwhoogte: tekst(wind.gebouwhoogte, sb.wind.gebouwhoogte),
        cscd: tekst(wind.cscd, sb.wind.cscd),
        coefficienten: lijst(wind.coefficienten, sb.wind.coefficienten, (c): Windcoefficient => ({
          omschrijving: tekst(c.omschrijving, ""), c: tekst(c.c, ""),
        })),
      },
      klassen: lijst(b.klassen, sb.klassen, (k): Belastingklasse => ({
        categorie: tekst(k.categorie, ""),
        lichteScheidingswanden: tekst(k.lichteScheidingswanden, ""),
        dakhelling: tekst(k.dakhelling, ""),
        qlast: tekst(k.qlast, ""),
      })),
      vloerenDaken: lijst(b.vloerenDaken, sb.vloerenDaken, normaliseerOpbouw),
      wanden: lijst(b.wanden, sb.wanden, normaliseerOpbouw),
    },
    toelichting: tekstRecord(o.toelichting),
    inHoofdstuk: waarheidRecord(o.inHoofdstuk),
    bijlagen: Array.isArray(o.bijlagen) ? o.bijlagen.filter((t): t is string => typeof t === "string") : s.bijlagen,
    nieuwePagina,
    opmaak: {
      constructieprincipe: keuze(opmaak.constructieprincipe, s.opmaak.constructieprincipe),
      subkoppen: keuze(opmaak.subkoppen, s.opmaak.subkoppen),
      bladenInInhoud: typeof opmaak.bladenInInhoud === "boolean" ? opmaak.bladenInInhoud : versie >= 4 && s.opmaak.bladenInInhoud,
    },
    ...(situatie ? { situatie } : {}),
    bureau: normaliseerBureau(o.bureau),
    tw: normaliseerTw(o.tw),
  };
}
