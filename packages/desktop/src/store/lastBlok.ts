import { LAST_START_RE, leesLastBlok, schrijfLastBlok, type LastBlok as KernBlok, type LastRegel } from "@ifc-calc/core";

/*
 * Een lastblok (`@last … @end`) als formulier: de brug tussen de rekentekst van een
 * eenheid op het canvas en LastBlokFormulier.tsx. De rekenkern leest en schrijft het
 * blok (lastBlok.ts in de kern); hier staat alleen wat het formulier erbij nodig heeft.
 *
 * Zuiver: er wordt niets gerekend en niets bewaard.
 */

export type { LastRegel };

/** Wat het formulier van een blok bewerkt; de fouten zijn van de rekenkern. */
export type LastBlok = Pick<KernBlok, "symbool" | "naam" | "soort" | "regels">;

const EIND_RE = /^@end$/;

/**
 * Is deze eenheid precies één lastblok, zonder iets wat het formulier zou weggooien?
 * Tekst na `@end` of commentaar tussen de regels blijft alleen in de rekentekst heel:
 * zo'n eenheid opent als gewone tekst.
 */
export function isLastBlok(tekst: string): boolean {
  const regels = tekst.split(/\r?\n/).map((r) => r.trim()).filter((r) => r !== "");
  if (regels.length < 2 || !LAST_START_RE.test(regels[0])) return false;
  if (regels.findIndex((r) => EIND_RE.test(r)) !== regels.length - 1) return false;
  return !regels.slice(1, -1).some((r) => r.startsWith("//"));
}

/** De tekst van een eenheid als blok. */
export function leesLast(tekst: string): KernBlok {
  return leesLastBlok(tekst);
}

/**
 * Het blok als rekentekst. Een lege factor valt weg: een veld dat nog leeg is, of een
 * `;` waar nog niets achter staat, is in het blad geen fout.
 */
export function schrijfLast(blok: LastBlok): string {
  return schrijfLastBlok({
    ...blok,
    regels: blok.regels.map((r) => ({ ...r, factoren: r.factoren.map((f) => f.trim()).filter((f) => f !== "") })),
  });
}

/**
 * Het blok zoals het blijft staan als het formulier dichtgaat: zonder de regels waar nog
 * geen belasting gekozen is. `null` als er dan niets over is: geen naam en geen regels.
 */
export function ruimLastOp(tekst: string): string | null {
  const blok = leesLastBlok(tekst);
  const regels = blok.regels.filter((r) => r.bron.trim() !== "");
  if (regels.length === 0 && blok.naam.trim() === "") return null;
  return schrijfLast({ ...blok, regels });
}

/** De symbolen van alle lastblokken in een blad, om een vrij symbool te kiezen. */
export function lastSymbolen(bron: string): Set<string> {
  const uit = new Set<string>();
  for (const regel of bron.split(/\r?\n/)) {
    const t = regel.trim();
    if (!LAST_START_RE.test(t)) continue;
    const symbool = t.replace(LAST_START_RE, "").trim().match(/^[^\s"]+/)?.[0];
    if (symbool) uit.add(symbool);
  }
  return uit;
}
