/**
 * De nummers van de tabellen en figuren in het rapport (docs/OCSS_TW_開發需求規格.md, P2-16).
 *
 * De nummers worden vooraf uit het rapport zelf berekend, niet tijdens het
 * tekenen geteld: een teller die met de tekenvolgorde meeloopt geeft een ander
 * nummer zodra React een stuk twee keer tekent. Hier telt de volgorde van de
 * hoofdstukindeling (`Rapportknoop[]`) en van de gegevens in het rapport, en
 * die ligt vast.
 *
 * De vorm is `表 4-1`: het hoofdstuknummer van de knoop waar de tabel staat, en
 * daarbinnen een doorlopend nummer. Zo blijft de nummering kloppen als er een
 * hoofdstuk wegvalt.
 */
import type { Rapport } from "../model.ts";
import type { Rapportknoop } from "../opzet.ts";

/** De sleutels waaronder een component zijn bijschrift opzoekt. */
export const bijschriftSleutel = {
  materialen: "tabel:materialen",
  opbouw: (naam: string) => `tabel:opbouw:${naam}`,
  veranderlijk: "tabel:veranderlijk",
  wind: "tabel:wind",
  factoren: "tabel:factoren",
  /** Het figuurnummer van een tekening, op de id van het blad. */
  figuur: (bladId: string) => `figuur:${bladId}`,
};

/** Het hoofdstuknummer van een knoop: "4.5.2" geeft "4". */
function hoofdstuk(nummer: string): string {
  const eerste = nummer.split(".")[0];
  return eerste === "" ? nummer : eerste;
}

/**
 * De bijschriften van dit rapport, op sleutel. Leeg zonder nummering: de
 * aanroeper beslist met `rapport.tw.nummering` of hij ze gebruikt.
 */
export function bijschriften(rapport: Rapport, knopen: Rapportknoop[]): Map<string, string> {
  const uit = new Map<string, string>();
  /** Per hoofdstuk het laatst uitgegeven nummer, apart voor tabellen en figuren. */
  const teller = new Map<string, number>();
  const volgend = (soort: "tabel" | "figuur", ch: string): string => {
    const sleutel = `${soort}:${ch}`;
    const n = (teller.get(sleutel) ?? 0) + 1;
    teller.set(sleutel, n);
    return `${ch}-${n}`;
  };
  const tabel = (ch: string, sleutel: string): void => {
    if (uit.has(sleutel)) return;
    uit.set(sleutel, `表 ${volgend("tabel", ch)}`);
  };
  /**
   * Een tekening in het hoofdstuk zelf krijgt een figuurnummer. Staat zij in
   * bijlage A, dan houdt zij haar bijlagenummer ("A.3"): de tekst en de
   * inhoudsopgave verwijzen daarnaar, en een tweede nummer zou daarvan afwijken.
   */
  const figuur = (ch: string, blad: NonNullable<Rapportknoop["blad"]>): void => {
    if (blad.bijlage !== "" || !blad.figuur) return;
    const sleutel = bijschriftSleutel.figuur(blad.id);
    if (uit.has(sleutel)) return;
    uit.set(sleutel, `圖 ${volgend("figuur", ch)}`);
  };
  const loop = (lijst: Rapportknoop[]): void => {
    for (const knoop of lijst) {
      const ch = hoofdstuk(knoop.nummer);
      if (knoop.blad) figuur(ch, knoop.blad);
      switch (knoop.inhoud) {
        case "materialen":
          tabel(ch, bijschriftSleutel.materialen);
          break;
        case "blijvend": {
          const { vloerenDaken, wanden } = rapport.belastingen;
          for (const opbouw of [...vloerenDaken, ...wanden]) tabel(ch, bijschriftSleutel.opbouw(opbouw.naam));
          break;
        }
        case "veranderlijk":
          tabel(ch, bijschriftSleutel.veranderlijk);
          break;
        case "wind":
          tabel(ch, bijschriftSleutel.wind);
          break;
        case "factoren":
          tabel(ch, bijschriftSleutel.factoren);
          break;
        default:
          break;
      }
      loop(knoop.kinderen);
    }
  };
  loop(knopen);
  return uit;
}
