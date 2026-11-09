import type { Unit as MathUnit } from 'mathjs';
import { math } from './eenheden.js';

/**
 * Het eenhedenstelsel: per grootheid de eenheid waarin een waarde in beeld komt
 * (docs/superpowers/specs/2026-11-06-eenheden-design.md).
 *
 * Het stelsel raakt alleen de weergave. De rekenkern rekent in de eenheden van de
 * bladtekst; pas bij het tonen gaat een waarde naar de eenheid van zijn grootheid.
 */

export type Grootheid =
  | 'lengte'
  | 'maat'
  | 'oppervlakte'
  | 'doorsnedeOppervlakte'
  | 'weerstandsmoment'
  | 'traagheidsmoment'
  | 'kracht'
  | 'moment'
  | 'lijnlast'
  | 'vlakbelasting'
  | 'spanning'
  | 'volumegewicht'
  | 'massa';

/** De eenheid per grootheid, in de schrijfwijze van de rekenkern (`kip ft`, `N / mm^2`). */
export type Stelsel = Partial<Record<Grootheid, string>>;

/** De kant-en-klare sets. "Zoals in het blad" is geen set: dan is er geen stelsel. */
export const STELSELS = {
  'si-mm': {
    lengte: 'm', maat: 'mm', oppervlakte: 'm^2', doorsnedeOppervlakte: 'mm^2',
    weerstandsmoment: 'mm^3', traagheidsmoment: 'mm^4', kracht: 'kN', moment: 'kN m',
    lijnlast: 'kN / m', vlakbelasting: 'kN / m^2', spanning: 'N / mm^2',
    volumegewicht: 'kN / m^3', massa: 'kg',
  },
  'si-m': {
    lengte: 'm', maat: 'm', oppervlakte: 'm^2', doorsnedeOppervlakte: 'm^2',
    weerstandsmoment: 'm^3', traagheidsmoment: 'm^4', kracht: 'kN', moment: 'kN m',
    lijnlast: 'kN / m', vlakbelasting: 'kPa', spanning: 'MPa',
    volumegewicht: 'kN / m^3', massa: 'kg',
  },
  us: {
    lengte: 'ft', maat: 'in', oppervlakte: 'ft^2', doorsnedeOppervlakte: 'in^2',
    weerstandsmoment: 'in^3', traagheidsmoment: 'in^4', kracht: 'kip', moment: 'kip ft',
    lijnlast: 'klf', vlakbelasting: 'psf', spanning: 'ksi',
    volumegewicht: 'pcf', massa: 'lb',
  },
  'tw-mks': {
    lengte: 'm', maat: 'cm', oppervlakte: 'm^2', doorsnedeOppervlakte: 'cm^2',
    weerstandsmoment: 'cm^3', traagheidsmoment: 'cm^4', kracht: 'tf', moment: 'tf m',
    lijnlast: 'tf / m', vlakbelasting: 'tf / m^2', spanning: 'kgf / cm^2',
    volumegewicht: 'tf / m^3', massa: 't',
  },
} as const satisfies Record<string, Required<Stelsel>>;

/**
 * Herkend aan de naam. De dimensie alleen is hier niet genoeg: een overspanning
 * (m) en een doorsnedemaat (mm) zijn allebei een lengte, en een vlakbelasting en
 * een spanning hebben allebei de dimensie van een druk. De schrijver van het blad
 * koos de eenheid, en daarmee de grootheid.
 *
 * Een temperatuur rekent (nog) niet om. In K is het in een blad bijna altijd een
 * verschil, en ook in °C is een verschil (30 °C − 20 °C) niet van een absolute
 * temperatuur te onderscheiden: omgerekend als absolute temperatuur zou het fout zijn.
 */
const OP_NAAM: Record<string, Grootheid> = {
  m: 'lengte', km: 'lengte', ft: 'lengte', yd: 'lengte', mi: 'lengte',
  mm: 'maat', cm: 'maat', dm: 'maat', in: 'maat', inch: 'maat',
  'm^2': 'oppervlakte', 'ft^2': 'oppervlakte', sqft: 'oppervlakte',
  'mm^2': 'doorsnedeOppervlakte', 'cm^2': 'doorsnedeOppervlakte', 'in^2': 'doorsnedeOppervlakte', 'inch^2': 'doorsnedeOppervlakte', sqin: 'doorsnedeOppervlakte',
  'mm^3': 'weerstandsmoment', 'cm^3': 'weerstandsmoment', 'in^3': 'weerstandsmoment', 'inch^3': 'weerstandsmoment',
  'mm^4': 'traagheidsmoment', 'cm^4': 'traagheidsmoment', 'm^4': 'traagheidsmoment', 'in^4': 'traagheidsmoment', 'inch^4': 'traagheidsmoment',
  'kN/m^2': 'vlakbelasting', 'N/m^2': 'vlakbelasting', kPa: 'vlakbelasting', Pa: 'vlakbelasting', psf: 'vlakbelasting', ksf: 'vlakbelasting',
  'tf/m^2': 'vlakbelasting', 'tf/m²': 'vlakbelasting', 'kgf/m^2': 'vlakbelasting', 'kgf/m²': 'vlakbelasting',
  'N/mm^2': 'spanning', 'kN/mm^2': 'spanning', MPa: 'spanning', GPa: 'spanning', psi: 'spanning', ksi: 'spanning',
  'kgf/cm^2': 'spanning', 'kgf/cm²': 'spanning', 'tf/cm^2': 'spanning', 'tf/cm²': 'spanning',
};

/** Herkend aan de dimensie, voor eenheden die niet in OP_NAAM staan (`N mm`, `lbf / ft`). */
const OP_DIMENSIE: [string, Grootheid][] = [
  ['N', 'kracht'],
  ['N m', 'moment'],
  ['N / m', 'lijnlast'],
  ['N / m^3', 'volumegewicht'],
  ['kg', 'massa'],
];

/** Een onbekende druk onder deze grens (in Pa) is een vlakbelasting, erboven een spanning. */
const DRUKGRENS = 1e5;

function eenheid(naam: string): MathUnit | null {
  try {
    return math.unit(naam);
  } catch {
    return null;
  }
}

/** Bij welke grootheid hoort een waarde in deze eenheid? `null`: bij geen, hij blijft zoals hij is. */
export function grootheidVan(naam: string): Grootheid | null {
  const kort = naam.replace(/\s+/g, '');
  if (OP_NAAM[kort]) return OP_NAAM[kort];
  const u = eenheid(naam);
  if (!u) return null;
  for (const [ref, g] of OP_DIMENSIE) {
    if (u.equalBase(math.unit(ref))) return g;
  }
  if (u.equalBase(math.unit('Pa'))) {
    return math.unit(1, naam).toNumber('Pa') < DRUKGRENS ? 'vlakbelasting' : 'spanning';
  }
  if (u.equalBase(math.unit('m'))) {
    return math.unit(1, naam).toNumber('m') >= 0.3 ? 'lengte' : 'maat';
  }
  return null;
}

/**
 * Het aantal decimalen van een vaste notatie in een andere eenheid, met dezelfde
 * relatieve nauwkeurigheid: het oude aantal plus de afgeronde log10 van
 * (doel / bron), tussen 0 en 6. `:F2` in mm wordt in inch `:F3`.
 */
export function decimalenNa(decimalen: number, bron: string, doel: string): number {
  // De grootte van één stap in de doeleenheid, uitgedrukt in de bron: ook goed voor
  // een eenheid met een verschuiving, zoals een temperatuur.
  const stap = Math.abs(math.unit(2, doel).toNumber(bron) - math.unit(1, doel).toNumber(bron));
  const d = decimalen + Math.round(Math.log10(stap));
  return Number.isFinite(d) ? Math.min(6, Math.max(0, d)) : decimalen;
}

/** Een kaal getal zoals iemand het typt: met een punt of een komma als decimaalteken. */
const KAAL_GETAL = /^[-+]?(\d+([.,]\d*)?|[.,]\d+)([eE][-+]?\d+)?$/;

/**
 * Een opgeslagen invoer (een kaal getal in de eenheid van de bladtekst) in een
 * andere eenheid, voor in het invoerveld: op 6 significante cijfers. Wat geen getal
 * is (leeg, een tussenstand), blijft zoals het is.
 */
export function toonInvoer(waarde: string, bron: string, doel: string): string {
  const t = waarde.trim();
  if (!KAAL_GETAL.test(t)) return waarde;
  try {
    const n = math.unit(parseFloat(t.replace(',', '.')), bron).toNumber(doel);
    return String(parseFloat(n.toPrecision(6)));
  } catch {
    // Een eenheid die deze kant niet kent (een eigen eenheid die alleen tijdens het
    // rekenen bestaat): dan zoals opgeslagen.
    return waarde;
  }
}

/**
 * Wat iemand in een invoerveld typt, terug naar de eenheid van de bladtekst.
 *
 * - Een getal of uitdrukking zonder eenheid (12, 3/4, 2*6) geldt in de eenheid naast het
 *   veld (`toon`). Zonder omrekening (`toon` is `bron`) blijft de tekst letterlijk staan,
 *   zoals altijd: de rekenkern rekent hem uit.
 * - Met een eenheid (5 m, 12 in) geldt hij in die eenheid.
 * - Wat nog geen getal is en geen letters heeft ("-", leeg, "1e"), blijft staan: zo typt het.
 * - Een eenheid die niet bij het veld past of nog niet af is ("3 kip", "3 ki"), geeft een
 *   fout; dan wordt er niets opgeslagen.
 */
export function invoerNaarBron(tekst: string, toon: string, bron: string): { waarde: string } | { fout: string } {
  const zelfde = toon.replace(/\s+/g, '') === bron.replace(/\s+/g, '');
  const getal = (n: number) => ({ waarde: String(parseFloat(n.toPrecision(12))) });
  const geenWaarde = (t: string) => ({ fout: `"${t}" is not a value for a field in ${bron}` });
  const t = tekst.trim();
  if (t === '') return { waarde: tekst };
  // De eenheid van het veld zelf erachter ("3 kipf" in een veld in kipf): alleen het getal.
  if (zelfde && t.endsWith(bron.trim())) {
    const voor = t.slice(0, t.length - bron.trim().length).trim();
    if (KAAL_GETAL.test(voor)) return { waarde: voor };
  }
  try {
    if (KAAL_GETAL.test(t)) {
      if (zelfde) return { waarde: tekst };
      return getal(math.unit(parseFloat(t.replace(',', '.')), toon).toNumber(bron));
    }
    let v: unknown;
    try {
      v = math.evaluate(t.replace(/,/g, '.'));
    } catch {
      // Zonder letters (op een exponent na) is het een tussenstand: laten staan.
      if (!/\p{L}/u.test(t.replace(/[eE][-+]?\d*$/, ''))) return { waarde: tekst };
      return geenWaarde(t);
    }
    if (typeof v === 'number') {
      if (zelfde) return { waarde: tekst };
      return Number.isFinite(v) ? getal(math.unit(v, toon).toNumber(bron)) : geenWaarde(t);
    }
    const u = v as { equalBase?: (o: unknown) => boolean; toNumber?: (e: string) => number };
    if (typeof u?.equalBase === 'function' && typeof u.toNumber === 'function') {
      if (!u.equalBase(math.unit(bron))) return { fout: `${t} does not fit a field in ${bron}` };
      return getal(u.toNumber(bron));
    }
    return geenWaarde(t);
  } catch {
    return geenWaarde(t);
  }
}

/** Een getal van de ene eenheid in de andere: `omrekenen(4500, "mm", "in")` is 177,165. */
export function omrekenen(waarde: number, van: string, naar: string): number {
  return math.unit(waarde, van).toNumber(naar);
}

const MACHT: Record<string, string> = { '¹': '', '²': '^2', '³': '^3', '⁴': '^4' };

/**
 * Een eenheid zoals een beeld of tabel hem schrijft, in de schrijfwijze van de rekenkern:
 * kN/m² → kN/m^2, kN/m¹ en kN/m1 → kN/m, kNm, kN·m en kN.m → kN m. kNm/m (een moment per
 * meter) blijft zoals hij is: als kN zou hij in het stelsel als kracht in beeld komen.
 */
export function eenheidUitBeeld(e: string): string {
  return e
    .trim()
    .replace(/[¹²³⁴]/g, (m) => MACHT[m])
    .replace(/(\p{L})([1-4])(?![\p{L}\p{N}])/gu, (_, l: string, n: string) => (n === '1' ? l : `${l}^${n}`))
    .replace(/·/g, ' ')
    .replace(/(\p{L})\.(\p{L})/gu, '$1 $2')
    .replace(/^([kMG]?N|tf|kgf)m(?=$|[\s^])/, '$1 m');
}

/** Een eenheid zoals de rekenkern hem schrijft, netjes in beeld: kN / m^2 → kN/m², kip ft → kip·ft. */
export function eenheidInBeeld(e: string): string {
  return e
    .replace(/\s*\/\s*/g, '/')
    .replace(/\^2/g, '²')
    .replace(/\^3/g, '³')
    .replace(/\^4/g, '⁴')
    .replace(/ /g, '·');
}

/**
 * De doeleenheid van een waarde in dit stelsel, of `null` als hij blijft zoals hij
 * is: geen grootheid, geen eenheid in het stelsel, of al in die eenheid.
 */
export function doelInStelsel(bron: string, stelsel: Stelsel): string | null {
  const g = grootheidVan(bron);
  const doel = g ? stelsel[g] : undefined;
  if (!doel || doel.replace(/\s+/g, '') === bron.replace(/\s+/g, '')) return null;
  return doel;
}
