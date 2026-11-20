/**
 * De komma als decimaalteken in de uitwerking van een blad, voor op papier.
 *
 * De rekentaal schrijft een punt, en de uitwerking op het scherm dus ook. Op papier in een
 * taal met een komma (Nederlands) zet deze functie de getallen om in de HTML van de
 * uitwerking. Alleen een stuk tekst dat in zijn geheel een getal is, verandert: een getal
 * in een formule, een cel van een tabel, een maat in een tekening. Lopende tekst blijft
 * zoals hij getypt is: daar is `5.4` net zo goed een paragraafnummer. In een getallencel
 * van een blok (`td.getal`, `td.uc`) verandert ook een getal met zijn eenheid erachter, en
 * in een tekstregel het getal dat de rekentaal er invult (`'naam'`, `calc-waarde`).
 *
 * Zuiver: tekst in, tekst uit. Wat tussen `<` en `>` staat, blijft ongemoeid.
 */

const GETAL_RE = /^(\s*[-−+]?\d+)\.(\d+\s*)$/;
/** Een getal in een cel: niet achter of voor een ander cijfer met een punt (`1.2.3` blijft). */
const IN_CEL_RE = /(?<![\d.])(\d+)\.(\d+)(?![\d.])/g;
const CEL_RE = /^<td\b[^>]*\bclass="[^"]*\b(?:getal|uc)\b/;
/** De onzichtbare cijfers waarmee getallen onder elkaar staan (lastBlok.ts). */
const VUL_RE = /^<span class="vul"/;
/** Een uitgerekend getal in een tekstregel (renderer.ts). */
const WAARDE_RE = /^<span class="calc-waarde"/;
/** Hierbinnen staat geen tekst voor de lezer. */
const OVERSLAAN_RE = /^<(script|style|annotation|textarea)\b/i;

export function metDecimaalKomma(html: string): string {
  const stukken = html.split(/(<[^>]*>)/);
  let cel = false;
  let vul = false;
  let waarde = false;
  let overslaan = '';
  for (let i = 0; i < stukken.length; i++) {
    const s = stukken[i];
    if (s.startsWith('<')) {
      if (overslaan) {
        if (new RegExp(`^</${overslaan}\\b`, 'i').test(s)) overslaan = '';
        continue;
      }
      const over = s.match(OVERSLAAN_RE);
      if (over && !s.endsWith('/>')) overslaan = over[1];
      else if (/^<td\b/.test(s)) cel = CEL_RE.test(s);
      else if (/^<\/td\b/.test(s)) cel = false;
      else if (VUL_RE.test(s)) vul = true;
      else if (vul && /^<\/span\b/.test(s)) vul = false;
      else if (WAARDE_RE.test(s)) waarde = true;
      else if (waarde && /^<\/span\b/.test(s)) waarde = false;
      continue;
    }
    if (overslaan || s === '') continue;
    if (vul) stukken[i] = s.replace('.', ',');
    else if (cel || waarde) stukken[i] = s.replace(IN_CEL_RE, '$1,$2');
    else stukken[i] = s.replace(GETAL_RE, '$1,$2');
  }
  return stukken.join('');
}

/** Schrijft deze taal een komma als decimaalteken? */
export function taalMetKomma(taal: string | undefined): boolean {
  return (taal ?? '').toLowerCase().startsWith('nl');
}
