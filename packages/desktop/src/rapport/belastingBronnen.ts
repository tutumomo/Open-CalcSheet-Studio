/**
 * De belastingen uit hoofdstuk 5 als bron voor de rekenbladen.
 *
 * Elke opbouw uit 5.5 (blijvend) en elke belastingklasse uit 5.4 (veranderlijk) heeft een
 * symbool, zoals `g_v1` of `q_k1`. Onder dat symbool bestaat zijn waarde in elk rekenblad
 * van het project: een vlakopbouw en een klasse in kN/m², een gevelopbouw in kN/m. Een
 * blad typt een belasting dus niet over maar gebruikt het symbool, en een lastblok
 * (`@last`) kiest er een uit een lijst. Wijzigt de opbouw in hoofdstuk 5, dan rekenen de
 * bladen opnieuw.
 *
 * De waarden gaan als rekentekst naar de rekenkern (`g_v1 = 7.75 kN/m^2`), samen met de
 * eigen elementen van de projectgegevens (store/projectBlad.ts): die tekst rekent vóór
 * elk blad (`EvalOpties.project`).
 *
 * Een symbool wordt één keer toegekend en blijft bij zijn object, ook als de volgorde
 * verandert of er een object tussenuit gaat: anders zou `g_v2` in een blad ongemerkt een
 * andere vloer worden.
 *
 * Puur en zonder React: de controlescripts laden dit bestand rechtstreeks.
 */
import type { Belastingen, Belastingklasse, Opbouw } from "./model.ts";
import { categorie, dakQk, getal, klasseWaarden, rond } from "./normwaarden.ts";
import { gevelOpbouw, vlakOpbouw } from "./opbouw.ts";
import { inTaal } from "./meertalig.ts";

/** De drie lijsten in hoofdstuk 5 met een symbool. */
export type Brongroep = "vloerenDaken" | "wanden" | "klassen";

/** Eén belasting uit hoofdstuk 5 zoals een blad hem kan gebruiken. */
export interface Belastingbron {
  symbool: string;
  /** De naam uit hoofdstuk 5; leeg als hij daar geen naam heeft. */
  naam: string;
  /** Blijvend (5.5) of veranderlijk (5.4). */
  soort: "G" | "Q";
  /** In kN/m² of kN/m; NaN als de waarde nog niet te bepalen is. */
  waarde: number;
  eenheid: "kN/m^2" | "kN/m";
  groep: Brongroep;
  index: number;
}

/** Het voorvoegsel van een nieuw symbool per lijst: g_v1, g_w1, q_k1. */
const VOORVOEGSEL: Record<Brongroep, string> = { vloerenDaken: "g_v", wanden: "g_w", klassen: "q_k" };

/** Namen die het project zelf al aan elk blad geeft: die mag een belasting niet overschrijven. */
const BEZET = new Set(["CC", "RC", "K_FI", "DesignLife", "windgebied", "terreincategorie", "rekenwijze", "eenheden"]);

/**
 * Is dit een bruikbaar symbool? Een letter, daarna letters en cijfers, en hooguit één deel
 * achter een liggend streepje (`g_v1`, `q_dak`, `Gvloer`). Eén losse letter mag niet: dat
 * is al gauw een eenheid (m, N, g).
 */
export function geldigSymbool(s: string): boolean {
  return /^[\p{L}][\p{L}\p{N}]*(_[\p{L}\p{N}]+)?$/u.test(s) && s.length >= 2 && !BEZET.has(s);
}

function symboolVan(x: { symbool?: string }): string {
  return typeof x.symbool === "string" ? x.symbool.trim() : "";
}

/**
 * Geeft elk object zonder (geldig) symbool er een, het eerste vrije in zijn reeks. Wat al
 * een symbool heeft, houdt het. Verandert er niets, dan komt hetzelfde object terug.
 */
export function metSymbolen(b: Belastingen): Belastingen {
  const bezet = new Set<string>();
  const groepen: Brongroep[] = ["vloerenDaken", "wanden", "klassen"];
  for (const g of groepen) for (const x of b[g]) if (geldigSymbool(symboolVan(x))) bezet.add(symboolVan(x));
  let gewijzigd = false;
  const vul = <T extends { symbool?: string }>(lijst: T[], groep: Brongroep): T[] =>
    lijst.map((x) => {
      if (geldigSymbool(symboolVan(x))) return x;
      let n = 1;
      while (bezet.has(`${VOORVOEGSEL[groep]}${n}`)) n++;
      const symbool = `${VOORVOEGSEL[groep]}${n}`;
      bezet.add(symbool);
      gewijzigd = true;
      return { ...x, symbool };
    });
  const vloerenDaken = vul<Opbouw>(b.vloerenDaken, "vloerenDaken");
  const wanden = vul<Opbouw>(b.wanden, "wanden");
  const klassen = vul<Belastingklasse>(b.klassen, "klassen");
  return gewijzigd ? { ...b, vloerenDaken, wanden, klassen } : b;
}

/** De som van een opbouw: kN/m² (vlak) of kN/m (gevel). */
export function opbouwSom(o: Opbouw): number {
  return o.soort === "vlak" ? vlakOpbouw(o.lagen).som : gevelOpbouw(o.lagen).som;
}

/**
 * q_k van een belastingklasse in kN/m²: bij een vloer de waarde van de categorie plus de
 * toeslag voor lichte scheidingswanden, bij een dak de waarde bij de dakhelling. NaN als
 * de categorie onbekend is of de dakhelling ontbreekt.
 */
export function klasseQk(k: Belastingklasse): number {
  const c = categorie(k.categorie);
  if (!c) return NaN;
  if (c.soort === "dak") return dakQk(getal(k.dakhelling));
  const toeslag = k.lichteScheidingswanden.trim() ? getal(k.lichteScheidingswanden) : 0;
  // Een zelf ingevulde q_k gaat voor de tabel; categorie E heeft alleen die (klasseWaarden).
  const qk = klasseWaarden(k)?.qk ?? null;
  if (qk === null) return NaN;
  return qk + (Number.isFinite(toeslag) ? toeslag : 0);
}

/** Zoveel decimalen heeft een belasting in hoofdstuk 5 van het rapport. */
const DECIMALEN = 2;

/**
 * Alle belastingen uit hoofdstuk 5 met een geldig symbool, in de volgorde van het
 * hoofdstuk. Staat een symbool er twee keer, dan telt alleen het eerste; de rest staat in
 * `dubbel`, zodat het scherm dat kan melden.
 *
 * De waarde is het getal zoals het in hoofdstuk 5 staat, op twee decimalen: een blad
 * rekent met wat de lezer daar ziet, zodat hoofdstuk 6 met de hand na te rekenen is.
 */
export function belastingBronnen(b: Belastingen, taal?: string): { bronnen: Belastingbron[]; dubbel: Belastingbron[] } {
  const alle: Belastingbron[] = [];
  const opbouw = (groep: "vloerenDaken" | "wanden") =>
    b[groep].forEach((o, index) => {
      alle.push({
        symbool: symboolVan(o), naam: o.naam.trim(), soort: "G", waarde: rond(opbouwSom(o), DECIMALEN),
        eenheid: o.soort === "vlak" ? "kN/m^2" : "kN/m", groep, index,
      });
    });
  opbouw("vloerenDaken");
  opbouw("wanden");
  b.klassen.forEach((k, index) => {
    const c = categorie(k.categorie);
    alle.push({
      symbool: symboolVan(k), naam: c ? inTaal(c.label, taal ?? "nl") : k.categorie, soort: "Q",
      waarde: rond(klasseQk(k), DECIMALEN), eenheid: "kN/m^2", groep: "klassen", index,
    });
  });
  const gezien = new Set<string>();
  const bronnen: Belastingbron[] = [];
  const dubbel: Belastingbron[] = [];
  for (const bron of alle) {
    if (!geldigSymbool(bron.symbool)) continue;
    if (gezien.has(bron.symbool)) dubbel.push(bron);
    else {
      gezien.add(bron.symbool);
      bronnen.push(bron);
    }
  }
  return { bronnen, dubbel };
}

/**
 * De symbolen van hoofdstuk 5 die in een rekentekst voorkomen, als heel woord: `g_v1` zit
 * niet in `g_v10`. Het rapport drukt een symbool alleen achter de naam als een blad het
 * gebruikt; een rapport zonder zulke bladen blijft op papier zoals het was.
 */
export function gebruikteSymbolen(b: Belastingen, teksten: readonly string[]): Set<string> {
  const uit = new Set<string>();
  const alles = teksten.join("\n");
  if (!alles.trim()) return uit;
  // Een geldig symbool bestaat uit letters, cijfers en een liggend streepje: het past zo in een patroon.
  for (const { symbool } of belastingBronnen(b).bronnen) {
    if (new RegExp(`(?<![\\p{L}\\p{N}_])${symbool}(?![\\p{L}\\p{N}_])`, "u").test(alles)) uit.add(symbool);
  }
  return uit;
}

/** Een belasting als los object in het IFCX-document (`ocss::belasting`). */
export interface BelastingVoorIfc {
  symbool: string;
  naam: string;
  soort: "G" | "Q";
  waarde: number;
  eenheid: "kN/m2" | "kN/m";
}

/**
 * De belastingen uit hoofdstuk 5 van een rapport als losse objecten in het document, voor
 * andere lezers: het symbool, de naam, blijvend of veranderlijk, en de waarde. Een rapport
 * zonder belastingen, of een dat niet te lezen is: geen. Het projectbestand en de export
 * gebruiken dezelfde lijst (store/projectBestand.ts, store/projectIfcx.ts).
 */
export function belastingenVoorIfc(rapport: unknown): BelastingVoorIfc[] {
  const r = rapport as { belastingen?: Belastingen; taal?: string } | null | undefined;
  const b = r?.belastingen;
  if (!b || !Array.isArray(b.vloerenDaken) || !Array.isArray(b.wanden) || !Array.isArray(b.klassen)) return [];
  try {
    return belastingBronnen(b, r?.taal).bronnen
      .filter((bron) => Number.isFinite(bron.waarde))
      .map((bron) => ({
        symbool: bron.symbool, naam: bron.naam, soort: bron.soort, waarde: Number(bron.waarde.toPrecision(12)),
        eenheid: bron.eenheid === "kN/m" ? "kN/m" : "kN/m2",
      }));
  } catch {
    return [];
  }
}

/** Een getal in de rekentaal: een punt als decimaalteken, zonder staart van afronding. */
function inRekentaal(v: number): string {
  return String(Number(v.toPrecision(12)));
}

/**
 * De belastingen als rekentekst en hun namen, voor `EvalOpties.project`. Een bron zonder
 * waarde (een dak zonder helling) staat er niet in: een blad dat hem gebruikt, meldt dan
 * dat de naam onbekend is, in plaats van stil met 0 te rekenen.
 */
export function belastingProject(b: Belastingen, taal?: string): { bron: string; namen: Record<string, string> } {
  const regels: string[] = [];
  const namen: Record<string, string> = {};
  for (const bron of belastingBronnen(b, taal).bronnen) {
    if (!Number.isFinite(bron.waarde)) continue;
    regels.push(`${bron.symbool} = ${inRekentaal(bron.waarde)} ${bron.eenheid}`);
    if (bron.naam) namen[bron.symbool] = bron.naam;
  }
  return { bron: regels.join("\n"), namen };
}
