/**
 * Het kenmerk van een blad voor verwijzingen uit andere bladen (#1.R_paal,
 * rekenen/verwijzingen.ts). Los van de store, zodat de controlescripts het
 * rechtstreeks in Node laden.
 */

/**
 * Geeft elk blad zonder kenmerk (`ref`) het volgende vrije nummer: één hoger dan
 * het hoogste nummer in het project. Een bestaand kenmerk blijft staan, en een
 * nummer van een verwijderd blad komt niet terug zolang er een hoger nummer is.
 */
export function metBladRefs<T extends { ref?: string }>(exemplaren: T[]): T[] {
  if (exemplaren.every((e) => e.ref)) return exemplaren;
  let hoogste = 0;
  for (const e of exemplaren) {
    const n = Number(e.ref);
    if (Number.isInteger(n) && n > hoogste) hoogste = n;
  }
  return exemplaren.map((e) => (e.ref ? e : { ...e, ref: String(++hoogste) }));
}
