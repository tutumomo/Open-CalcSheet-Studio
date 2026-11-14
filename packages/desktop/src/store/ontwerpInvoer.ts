/**
 * De opgeleverde invoer van een blad (docs/OCSS_TW_開發需求規格.md, P2-14).
 *
 * Een blad dat via de API is gemaakt of ingevuld, onthoudt in `ontwerpWaarden` wat er
 * is opgeleverd. Wie daarna in de app een veld wijzigt, wijzigt alleen `waarden`; het
 * verschil is dan te zien (en terug te zetten). Een veld zonder eigen regel in
 * `ontwerpWaarden` is opgeleverd met de standaardwaarde van de rekentekst.
 *
 * Een blad zonder `ontwerpWaarden` houdt niets bij: daar is niets "gewijzigd".
 *
 * Zonder React of stores, zodat de tools en de controle het in Node laden.
 */

const getal = (t: string): number | null => {
  const s = t.trim().replace(",", ".");
  if (s === "" || !/^[-+]?(\d+\.?\d*|\.\d+)(e[-+]?\d+)?$/i.test(s)) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

/** Dezelfde invoer: gelijke tekst, of twee getallen met dezelfde waarde (`5` en `5.0`). */
export function gelijkeInvoer(a: string, b: string): boolean {
  if (a.trim() === b.trim()) return true;
  const x = getal(a);
  const y = getal(b);
  return x !== null && y !== null && x === y;
}

/**
 * De opgeleverde waarde van een veld, of undefined als het blad niets bijhoudt.
 * `standaard` is de beginwaarde uit de rekentekst.
 */
export function opgeleverd(ontwerp: Record<string, string> | undefined, naam: string, standaard: string): string | undefined {
  if (!ontwerp) return undefined;
  return ontwerp[naam] ?? standaard;
}

/** Of de huidige waarde (`undefined` = de standaard) afwijkt van wat is opgeleverd. */
export function isGewijzigd(
  ontwerp: Record<string, string> | undefined,
  naam: string,
  huidig: string | undefined,
  standaard: string,
): boolean {
  const was = opgeleverd(ontwerp, naam, standaard);
  if (was === undefined) return false;
  return !gelijkeInvoer(huidig === undefined || huidig === "" ? standaard : huidig, was);
}
