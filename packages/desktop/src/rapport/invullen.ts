/**
 * Invulvelden en tekstopmaak van de rapportteksten.
 *
 * Een standaardtekst noemt het bureau of het project niet letterlijk maar via
 * een invulveld: "{adviseur} heeft opdracht voor het constructieadvies voor dit
 * project." Zo blijft een eigen variant bruikbaar in elk volgend project. De
 * waarden komen bij het opmaken uit het rapport, het bureauprofiel en de
 * projectgegevens; opgeslagen wordt alleen de tekst met de accolades.
 *
 * Opmaak is bewust minimaal, net als in de referentie: één regel is één rij in
 * het rapport, een lege regel is een lege rij (een nieuwe alinea), een regel
 * die met "-" begint is een opsommingsregel die één kolom inspringt, en een
 * korte regel die op ":" eindigt ("Fundering:") is een subkop en komt vet —
 * als het rapport subkoppen heeft (rapport.opmaak.subkoppen; een rapport van
 * vóór versie 3 van de rapportopbouw houdt bij het openen gewone tekst).
 */

export interface Invulwaarden {
  adviseur: string; projectnummer: string; projectnaam: string; opdrachtgever: string;
  locatie: string; verantwoordelijk: string; uitvoerend: string;
  /**
   * Waarden uit rekenbladen (`{#2.R_paal}`): de plek zoals hij in de tekst staat,
   * naar wat er moet komen te staan (rekenen/tekstInvulling.ts). Zonder deze kaart
   * blijft zo'n verwijzing staan, net als een onbekend invulveld.
   */
  verwijzingen?: ReadonlyMap<string, string>;
}

/** Een invulveld: de namen tussen accolades. `verwijzingen` is geen veld maar de kaart met bladwaarden. */
export type Invulveld = Exclude<keyof Invulwaarden, "verwijzingen">;

/** De invulvelden in de volgorde waarin het paneel ze onder een tekstblok toont. */
export const INVULVELDEN: readonly Invulveld[] = [
  "adviseur", "projectnummer", "projectnaam", "opdrachtgever",
  "locatie", "verantwoordelijk", "uitvoerend",
];

function isInvulveld(naam: string): naam is Invulveld {
  return (INVULVELDEN as readonly string[]).includes(naam);
}

/**
 * {naam} → waarde; leeg → "—"; onbekende {x} blijven staan.
 *
 * Een leeg veld wordt een gedachtestreepje in plaats van niets, zodat een zin
 * als "Opdrachtgever: —" in de afdruk laat zien dát er iets ontbreekt. Een
 * onbekende naam blijft letterlijk staan: een tikfout ("{adviseru}") valt dan
 * op in het afdrukvoorbeeld in plaats van stil te verdwijnen.
 */
export function vulIn(tekst: string, w: Invulwaarden): string {
  const metVelden = tekst.replace(/\{([A-Za-z]+)\}/g, (heel: string, naam: string) => {
    if (!isInvulveld(naam)) return heel;
    const waarde = w[naam].trim();
    return waarde === "" ? "—" : waarde;
  });
  return w.verwijzingen ? vervangVerwijzingenInTekst(metVelden, w.verwijzingen) : metVelden;
}

/**
 * `{#2.R_paal}` en `{#2.R_paal:1}` → de waarde uit het blad. Een verwijzing die
 * niet in de kaart staat (onbekend blad, een fout in het blad) blijft staan, zodat
 * een tikfout in het afdrukvoorbeeld opvalt. Staat hier en niet in
 * rekenen/tekstInvulling.ts, zodat dit bestand zonder de rekenkern te laden blijft.
 */
const VERWIJZING_IN_TEKST = /\{#[A-Za-z0-9_]+\.[\p{L}_][\p{L}\p{N}_]*(?::\d{1,2})?\}/gu;

export function vervangVerwijzingenInTekst(tekst: string, verwijzingen: ReadonlyMap<string, string>): string {
  if (!tekst.includes("{#")) return tekst;
  return tekst.replace(VERWIJZING_IN_TEKST, (plek: string) => verwijzingen.get(plek) ?? plek);
}

/** Eén regel van een tekst zoals hij in het rapport komt. */
export interface Tekstregel { tekst: string; leeg: boolean; inspringen: boolean; kop: boolean; }

/** Zoveel woorden heeft een subkop hoogstens; een langere regel die op ":" eindigt is een inleidende zin. */
export const SUBKOP_WOORDEN = 5;

/**
 * Is deze (getrimde) regel een subkop? Een regel die op ":" eindigt, niet met
 * "-" begint, hoogstens SUBKOP_WOORDEN woorden heeft en geen ; ! of ? bevat:
 * "Fundering:", "Vloeren en daken:". Een inleidende zin als "Voor de
 * detailengineering dienen nog … te worden uitgevoerd:" blijft gewone tekst.
 */
export function isSubkop(regel: string): boolean {
  if (!regel.endsWith(":") || regel.startsWith("-")) return false;
  const kern = regel.slice(0, -1).trim();
  return kern !== "" && !/[;!?]/.test(kern) && kern.split(/\s+/).length <= SUBKOP_WOORDEN;
}

/**
 * Splitst op regeleinden; een lege regel is een lege rij; een regel die met "-" begint springt
 * één kolom in; met `subkoppen` (rapport.opmaak.subkoppen) is een korte regel die op ":"
 * eindigt een subkop. Laat voor- en naloop van lege regels weg.
 */
export function tekstRegels(tekst: string, subkoppen: boolean): Tekstregel[] {
  const regels: Tekstregel[] = tekst.split(/\r\n|\r|\n/).map((ruw) => {
    const regel = ruw.trim();
    return { tekst: regel, leeg: regel === "", inspringen: regel.startsWith("-"), kop: subkoppen && isSubkop(regel) };
  });
  let begin = 0;
  let eind = regels.length;
  while (begin < eind && regels[begin].leeg) begin++;
  while (eind > begin && regels[eind - 1].leeg) eind--;
  return regels.slice(begin, eind);
}
