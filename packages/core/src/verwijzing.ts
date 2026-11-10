/**
 * Verwijzingen naar een waarde in een ander blad: `#ref.naam`.
 *
 * Elk blad in een project heeft een kort, vast kenmerk (`ref`, zie
 * Exemplaar in de app): een nummer als `1`, of een naam als `vloer`. In een
 * formule of een invoerveld neemt `#1.R_paal` de waarde `R_paal` uit dat blad
 * over, met zijn eenheid. Een naam met een komma-index mag ook: `#vloer.V_Ed,0`.
 *
 * De kern rekent één blad tegelijk. Bij het inlezen wordt `#ref.naam` een
 * gewone naam (`ref__1__R_paal`); de app rekent het blad waarnaar verwezen
 * wordt eerst door en zet de waarde onder die naam in de scope. In beeld staat
 * de verwijzing weer als `#1.R_paal` (latex.ts).
 */

import { rekendelen } from './parser.js';

/** `#ref.naam`: ref is letters, cijfers en `_`; naam als een variabelenaam, met komma-index. */
export const VERWIJZING_RE = /#([A-Za-z0-9_]+)\.([\p{L}_][\p{L}\p{N}_]*(?:,[\p{L}\p{N}_]+)*)/gu;

const HELE_VERWIJZING_RE = /^\s*#([A-Za-z0-9_]+)\.([\p{L}_][\p{L}\p{N}_]*(?:,[\p{L}\p{N}_]+)*)\s*$/u;
const NAAM_RE = /^ref__([A-Za-z0-9]+(?:_[A-Za-z0-9]+)*?)__(.+)$/;

/** De naam waaronder een verwijzing in de scope staat: `#1.V_Ed,0` → `ref__1__V_Ed_0`. */
export function verwijzingNaam(ref: string, naam: string): string {
  return `ref__${ref}__${naam.replace(/,/g, '_')}`;
}

/**
 * Vervangt elke `#ref.naam` in een stuk rekentekst door zijn naam in de scope.
 * Tekst tussen dubbele aanhalingstekens blijft staan: een kleur als "#b91c1c"
 * of een label is geen verwijzing.
 */
export function vervangVerwijzingen(code: string): string {
  if (!code.includes('#')) return code;
  return code
    .split('"')
    .map((stuk, i) => (i % 2 === 1 ? stuk : stuk.replace(VERWIJZING_RE, (_m, ref: string, naam: string) => verwijzingNaam(ref, naam))))
    .join('"');
}

/** Is de hele tekst één verwijzing (een invoerveld met `#1.R_paal`)? */
export function leesVerwijzing(tekst: string): { ref: string; naam: string } | null {
  const m = tekst.match(HELE_VERWIJZING_RE);
  return m ? { ref: m[1], naam: m[2] } : null;
}

/**
 * Alle verwijzingen in een blad: in de rekendelen van de tekst (niet in uitleg of
 * koppen) en in de invoerwaarden. Elke combinatie van blad en naam één keer, in de
 * volgorde waarin ze voorkomen.
 */
export function verwijzingenIn(bron: string, waarden: Readonly<Record<string, string>> = {}): { ref: string; naam: string }[] {
  const uit: { ref: string; naam: string }[] = [];
  const gezien = new Set<string>();
  const neem = (tekst: string) => {
    if (!tekst.includes('#')) return;
    for (const m of tekst.matchAll(VERWIJZING_RE)) {
      const sleutel = verwijzingNaam(m[1], m[2]);
      if (gezien.has(sleutel)) continue;
      gezien.add(sleutel);
      uit.push({ ref: m[1], naam: m[2] });
    }
  };
  neem(bron.includes('#') ? rekendelen(bron) : bron);
  for (const w of Object.values(waarden)) neem(String(w));
  return uit;
}

/** Een naam in de scope terug naar de verwijzing: `ref__1__R_paal` → { ref: "1", naam: "R_paal" }. */
export function verwijzingVanNaam(naam: string): { ref: string; naam: string } | null {
  const m = naam.match(NAAM_RE);
  return m ? { ref: m[1], naam: m[2] } : null;
}

/** Zet de interne namen in een foutmelding terug naar `#ref.naam`. */
export function verwijzingenInMelding(melding: string): string {
  return melding.replace(/ref__([A-Za-z0-9]+)__([\p{L}\p{N}_]+)/gu, '#$1.$2');
}
