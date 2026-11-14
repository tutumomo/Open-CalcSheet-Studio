import { create, all, type MathJsInstance } from 'mathjs';

/**
 * De ene set eenheden van de rekenkern.
 *
 * Parser, rekenkern en formuleweergave gebruiken alle drie deze instantie. Met
 * ieder een eigen instantie zou een eenheid die een blad zelf maakt
 * (`.kipf = 1000 lbf`) wel rekenen, maar herkende de parser hem niet als eenheid
 * achter een getal.
 *
 * Erbij komen de Amerikaanse eenheden voor constructies die mathjs niet kent.
 * `psi` heeft in mathjs geen voorvoegsels, dus ook `ksi` bestaat er niet. `lb` is
 * in mathjs een massa; kracht is `lbf` of `kip`.
 */
export const math: MathJsInstance = create(all, {});

const AMERIKAANS: [string, string][] = [
  ['ksi', '1000 psi'],
  ['psf', '1 lbf/ft^2'],
  ['ksf', '1 kip/ft^2'],
  ['plf', '1 lbf/ft'],
  ['klf', '1 kip/ft'],
  ['pcf', '1 lbf/ft^3'],
];

const TAIWAN_MKS: [string, string][] = [
  ['tf', '1000 kgf'],
];

for (const [naam, definitie] of [...AMERIKAANS, ...TAIWAN_MKS]) math.createUnit(naam, definitie);

/** De eenheden die de rekenkern zelf kent, vóór eigen eenheden van een blad of project. */
const INGEBOUWD: ReadonlySet<string> = new Set(Object.keys((math.Unit as unknown as { UNITS: object }).UNITS));

/**
 * Mag dit de naam van een eigen eenheid zijn? Minstens twee tekens (een enkele letter is
 * in een blad bijna altijd een variabele: d, h, t) en geen eenheid die de kern al kent.
 */
export function geldigeEenheidNaam(naam: string): boolean {
  return /^[\p{L}_][\p{L}\p{N}_]+$/u.test(naam) && !INGEBOUWD.has(naam);
}

/** Is dit een eenheid zonder waarde, zoals de rekenkern de naam leest? */
export function isEenheidNaam(naam: string): boolean {
  return math.Unit.isValuelessUnit(naam);
}

// ── Eenheden voor de API: SI-waarde, gebroken machten en vaste eenheden ──────
//
// De MCP- en REST-laag geeft per rekenregel de eenheid zoals het blad hem toont.
// Een client wil daarnaast de waarde in SI-grondeenheden (om zelf te kunnen
// rekenen) en wil weten wanneer een uitkomst een gebroken macht in zijn eenheid
// heeft — `R^(2/3)` levert `m^0.667` op, en dat is bijna altijd een vergissing in
// het blad, geen eenheid die iemand bedoelde.

/** Een waarde met zijn eenheid, als tekst en als getal. */
export interface EenheidWaarde {
  waarde: number;
  eenheid: string;
}

/**
 * De waarde in SI-grondeenheden (kg, m, s, A, K, mol, cd), of `null` als de
 * eenheid niet te lezen is. `kN/mm^2` wordt `1000000 kg/(m*s^2)`; een eenheid
 * zonder dimensie (`, `%`) blijft een getal.
 */
export function naarSI(waarde: number, eenheid: string): EenheidWaarde | null {
  if (!Number.isFinite(waarde)) return null;
  try {
    if (!eenheid.trim()) return { waarde, eenheid: '' };
    const si = math.unit(waarde, eenheid).toSI();
    const tekst = math.format(si, { precision: 8 });
    return { waarde: si.value as number, eenheid: tekst.replace(/^-?[\d.]+(?:e[+-]?\d+)?\s*/, '') };
  } catch {
    return null;
  }
}

/**
 * Vaste eenheden waarin een uitkomst getoond hoort te worden, met de factor —
 * `kN/mm^2` is een megapascal, en wie dat opschrijft bedoelt MPa. Alleen
 * eenheden met dezelfde dimensie en een exacte factor staan hier; al het andere
 * blijft zoals het blad het toont.
 */
const VAST: Record<string, [number, string]> = {
  'kN/mm^2': [1000, 'MPa'],
  'N/mm^2': [1, 'MPa'],
  'MN/m^2': [1, 'MPa'],
  'kgf/cm^2': [0.0980665, 'MPa'],
  'tf/m^2': [9.80665, 'kPa'],
  'kN/m^2': [1, 'kPa'],
  'N/m^2': [0.001, 'kPa'],
  'kgf/m^2': [0.00980665, 'kPa'],
};

/** Dezelfde waarde in de vaste eenheid (`MPa`, `kPa`), of `null` als die er niet is. */
export function vasteEenheid(waarde: number, eenheid: string): EenheidWaarde | null {
  const sleutel = eenheid.replace(/\s+/g, '');
  const vast = VAST[sleutel];
  if (!vast) return null;
  return { waarde: waarde * vast[0], eenheid: vast[1] };
}

/** Is dit een eenheid met een gebroken exponent, zoals `m^0.6666666666666666`? */
export function gebrokenExponent(eenheid: string): number | null {
  for (const m of eenheid.matchAll(/\^\s*\(?\s*(-?\d*\.\d+)\s*\)?/g)) {
    const n = Number(m[1]);
    if (Number.isFinite(n) && !Number.isInteger(n)) return n;
  }
  return null;
}
