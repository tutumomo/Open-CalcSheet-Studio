/**
 * Het kenmerk van een blad voor verwijzingen uit andere bladen (#1.R_paal,
 * rekenen/verwijzingen.ts). Los van de store, zodat de controlescripts het
 * rechtstreeks in Node laden.
 */

/**
 * Geeft elk blad zonder kenmerk (`ref`) het volgende vrije nummer: één hoger dan
 * het hoogste nummer in het project. Een bestaand kenmerk blijft staan, en een
 * nummer van een verwijderd blad komt niet terug zolang er een hoger nummer is.
 *
 * Hebben twee bladen hetzelfde kenmerk, dan houdt het eerste het en krijgt het
 * tweede een vrij nummer. Zo'n tweede kwam er door dupliceren (de kopie staat direct
 * na het origineel), of zit al in een bestand van vóór deze regel. Anders wees
 * `#1.R_paal` stil naar een van de twee.
 *
 * Verandert er niets, dan komt dezelfde lijst terug: de store roept dit bij elke
 * wijziging van de bladen aan.
 */
export function metBladRefs<T extends { ref?: string }>(exemplaren: T[]): T[] {
  const gezien = new Set<string>();
  const vrij = exemplaren.map((e) => {
    if (!e.ref || gezien.has(e.ref)) return true;
    gezien.add(e.ref);
    return false;
  });
  if (!vrij.includes(true)) return exemplaren;
  let hoogste = 0;
  for (const e of exemplaren) {
    const n = Number(e.ref);
    if (Number.isInteger(n) && n > hoogste) hoogste = n;
  }
  return exemplaren.map((e, i) => (vrij[i] ? { ...e, ref: String(++hoogste) } : e));
}
