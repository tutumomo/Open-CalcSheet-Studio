/**
 * Varianten van een blad: dezelfde rekentekst met andere invoer, naast elkaar
 * doorgerekend (docs/varianten.md).
 *
 * Een variant bewaart alleen zijn **eigen** waarden, voor de velden die de gebruiker
 * laat variëren (`velden`). Al het andere volgt het blad: verandert het blad, dan
 * verandert de variant mee. Zo blijven de uitgangspunten van alle varianten gelijk.
 *
 * Varianten horen bij het blad (`Exemplaar.varianten`), net als de invoer. Ze gaan dus
 * vanzelf mee bij dupliceren, opslaan, ongedaan maken en in een versie van het project.
 * Een ander blad dat met `#1.R_paal` naar dit blad verwijst, rekent altijd met het blad
 * zelf, nooit met een variant.
 *
 * Elke bewerking geeft een nieuw object terug en laat het oude ongemoeid (ongedaan
 * maken deelt de rest). Zuiver, zonder React of stores: scripts/check-varianten.mjs
 * laadt dit bestand in Node.
 */

export interface Variant {
  id: string;
  /** "V1", te wijzigen. */
  naam: string;
  /** Alleen de eigen waarden, per veldnaam, in de eenheid van de bladtekst. */
  waarden: Record<string, string>;
  /** De velden die optimaliseren heeft ingevuld (blauw ⚙), tot iemand ze zelf wijzigt. */
  gezocht?: string[];
}

/** De laatste optimalisatie: de dialoog stelt de volgende keer dezelfde waarden voor. */
export interface Zoekopdracht {
  veld: string;
  /** Bij een getal in de eenheid van het veld, bij een keuzelijst de waarde van een keuze. */
  van: string;
  tot: string;
  stap?: string;
  /** De hoogste maatgevende UC die nog telt als voldoet; standaard 1. */
  grens: number;
}

export interface Varianten {
  /** De invoervelden die variëren, in de volgorde van de tabel. */
  velden: string[];
  /** Extra uitkomsten in de tabel: namen van waarden uit de uitwerking. */
  uitkomsten: string[];
  lijst: Variant[];
  /** De tabel in de afdruk en het rapport. */
  opPapier?: boolean;
  zoek?: Zoekopdracht;
}

/** Zoveel varianten maakt een reeks hoogstens in één keer. */
export const MAX_REEKS = 50;

let teller = 0;
function nieuwId(): string {
  teller += 1;
  return `var-${Date.now().toString(36)}-${teller.toString(36)}`;
}

/** "V1", "V2", …: het eerste vrije nummer, zodat er na verwijderen geen twee gelijke zijn. */
function vrijeNaam(bezet: readonly string[]): string {
  const namen = new Set(bezet);
  for (let n = 1; ; n++) if (!namen.has(`V${n}`)) return `V${n}`;
}

/** Een nieuwe variant achter `bestaand`, met de meegegeven eigen waarden of zonder. */
export function nieuweVariant(bestaand: readonly Variant[], waarden: Record<string, string> = {}): Variant {
  return { id: nieuwId(), naam: vrijeNaam(bestaand.map((v) => v.naam)), waarden: { ...waarden } };
}

/**
 * De invoer waarmee een variant rekent: die van het blad, met daaroverheen de eigen
 * waarden van de gekozen velden. Een lege eigen waarde volgt het blad.
 */
export function variantInvoer(
  waarden: Record<string, string>,
  v: Pick<Variant, "waarden">,
  velden: readonly string[],
): Record<string, string> {
  const uit = { ...waarden };
  for (const veld of velden) {
    const eigen = v.waarden[veld];
    if (eigen !== undefined && eigen.trim() !== "") uit[veld] = eigen;
  }
  return uit;
}

/** Een variant met één veld anders; `gezocht` alleen als het veld door optimaliseren komt. */
function metWaarde(v: Variant, veld: string, waarde: string, gezocht: boolean): Variant {
  const waarden = { ...v.waarden };
  if (waarde.trim() === "") delete waarden[veld];
  else waarden[veld] = waarde;
  const tekens = (v.gezocht ?? []).filter((n) => n !== veld);
  if (gezocht && waarde.trim() !== "") tekens.push(veld);
  const uit: Variant = { id: v.id, naam: v.naam, waarden };
  if (tekens.length) uit.gezocht = tekens;
  return uit;
}

/** Een cel van de tabel: typen zet de eigen waarde, leeg wist hem. */
export function zetCel(vs: Varianten, variantId: string, veld: string, waarde: string): Varianten {
  return { ...vs, lijst: vs.lijst.map((v) => (v.id === variantId ? metWaarde(v, veld, waarde, false) : v)) };
}

/** Een waarde die optimaliseren vond: als eigen waarde, met het teken ⚙. */
export function zetGevonden(vs: Varianten, variantId: string, veld: string, waarde: string): Varianten {
  return { ...vs, lijst: vs.lijst.map((v) => (v.id === variantId ? metWaarde(v, veld, waarde, true) : v)) };
}

/** Andere velden laten variëren. Van een veld dat wegvalt, vervallen de eigen waarden. */
export function zetVelden(vs: Varianten, velden: string[]): Varianten {
  const blijft = new Set(velden);
  const lijst = vs.lijst.map((v) => {
    const weg = Object.keys(v.waarden).some((n) => !blijft.has(n)) || (v.gezocht ?? []).some((n) => !blijft.has(n));
    if (!weg) return v;
    const waarden = Object.fromEntries(Object.entries(v.waarden).filter(([n]) => blijft.has(n)));
    const gezocht = (v.gezocht ?? []).filter((n) => blijft.has(n));
    const uit: Variant = { id: v.id, naam: v.naam, waarden };
    if (gezocht.length) uit.gezocht = gezocht;
    return uit;
  });
  return { ...vs, velden: [...velden], lijst };
}

/**
 * Een blok uit een werkmap (tekst met tabs en regeleinden) in de tabel, vanaf de
 * cel in rij `rij` (een index in `rijen`) en kolom `kolom` (0 is de eerste variant).
 * `rijen` zijn de velden zoals de tabel ze toont: zonder een veld dat het blad niet
 * meer heeft, anders schuift alles een rij op.
 * Rijen zijn velden, kolommen varianten. Loopt het blok verder dan de laatste
 * variant, dan komen er varianten bij; rijen voorbij het laatste veld vallen weg.
 * Een lege cel volgt weer het blad. `zetOm` zet een getypte waarde om naar de eenheid
 * van het veld; `null` is een ongeldige waarde, en dan blijft die cel zoals hij was.
 */
export function plakBlok(
  vs: Varianten,
  tekst: string,
  rij: number,
  kolom: number,
  zetOm: (veld: string, waarde: string) => string | null = (_veld, w) => w,
  rijen: readonly string[] = vs.velden,
): Varianten {
  const regels = tekst.replace(/\r\n?/g, "\n").split("\n");
  if (regels.length > 1 && regels[regels.length - 1] === "") regels.pop();
  const cellen = regels.map((r) => r.split("\t"));
  let lijst = [...vs.lijst];
  const breedte = Math.max(0, ...cellen.map((r) => r.length));
  while (lijst.length < kolom + breedte) lijst = [...lijst, nieuweVariant(lijst)];
  cellen.forEach((r, i) => {
    const veld = rijen[rij + i];
    if (veld === undefined) return;
    r.forEach((ruw, j) => {
      const w = ruw.trim();
      const waarde = w === "" ? "" : zetOm(veld, w);
      if (waarde === null) return;
      const k = kolom + j;
      lijst[k] = metWaarde(lijst[k], veld, waarde, false);
    });
  });
  return { ...vs, lijst };
}

/**
 * De waarden van een reeks: van `van` tot en met `tot` in stappen van `stap`, ook
 * aflopend. Afgerond op twaalf cijfers, zodat 0,1 + 0,2 gewoon 0,3 is. Hoogstens
 * `max` waarden; een stap van nul of geen getal geeft niets.
 */
export function reeksWaarden(van: number, tot: number, stap: number, max = MAX_REEKS): number[] {
  if (![van, tot, stap].every(Number.isFinite) || stap <= 0) return [];
  const richting = tot >= van ? 1 : -1;
  const aantal = Math.floor(Math.abs(tot - van) / stap + 1e-9) + 1;
  const uit: number[] = [];
  for (let i = 0; i < Math.min(aantal, max); i++) uit.push(parseFloat((van + richting * i * stap).toPrecision(12)));
  return uit;
}

const isTekst = (x: unknown): x is string => typeof x === "string";
const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

function leesZoek(x: unknown): Zoekopdracht | undefined {
  if (!isObject(x) || !isTekst(x.veld) || !isTekst(x.van) || !isTekst(x.tot)) return undefined;
  const grens = typeof x.grens === "number" && Number.isFinite(x.grens) && x.grens > 0 ? x.grens : 1;
  return { veld: x.veld, van: x.van, tot: x.tot, ...(isTekst(x.stap) ? { stap: x.stap } : {}), grens };
}

/**
 * Varianten van buiten de app (bestand, opgeslagen staat), per veld gecontroleerd:
 * alleen tekst als naam en waarde, unieke id's, en een vrije naam waar die ontbreekt.
 * Blijft er niets over, dan geen varianten.
 */
export function leesVarianten(x: unknown): Varianten | undefined {
  if (!isObject(x)) return undefined;
  const velden = Array.isArray(x.velden) ? x.velden.filter(isTekst) : [];
  const uitkomsten = Array.isArray(x.uitkomsten) ? x.uitkomsten.filter(isTekst) : [];
  const lijst: Variant[] = [];
  const ids = new Set<string>();
  for (const r of Array.isArray(x.lijst) ? x.lijst : []) {
    if (!isObject(r)) continue;
    const waarden = isObject(r.waarden)
      ? Object.fromEntries(Object.entries(r.waarden).filter((e): e is [string, string] => isTekst(e[1])))
      : {};
    const id = isTekst(r.id) && r.id && !ids.has(r.id) ? r.id : nieuwId();
    ids.add(id);
    const naam = isTekst(r.naam) && r.naam.trim() ? r.naam : vrijeNaam(lijst.map((v) => v.naam));
    const v: Variant = { id, naam, waarden };
    const gezocht = Array.isArray(r.gezocht) ? r.gezocht.filter(isTekst) : [];
    if (gezocht.length) v.gezocht = gezocht;
    lijst.push(v);
  }
  if (velden.length === 0 && lijst.length === 0) return undefined;
  const uit: Varianten = { velden, uitkomsten, lijst };
  if (x.opPapier === true) uit.opPapier = true;
  const zoek = leesZoek(x.zoek);
  if (zoek) uit.zoek = zoek;
  return uit;
}
