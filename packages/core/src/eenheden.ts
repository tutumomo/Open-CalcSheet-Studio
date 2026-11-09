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
