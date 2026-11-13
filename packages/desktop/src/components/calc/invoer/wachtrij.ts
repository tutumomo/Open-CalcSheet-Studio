/**
 * Wat er in het invoerpaneel getypt is en nog niet naar het blad is gestuurd.
 *
 * Een veld in de uitwerking stuurt elke toetsaanslag door, en elke toetsaanslag rekent
 * het blad opnieuw. Bij een blad dat Open FEM Studio laat rekenen kost elke tussenstand
 * ("3", "3.", "3.6") dan een berekening van seconden. Het paneel wacht daarom: een waarde
 * gaat naar het blad als het veld wordt verlaten, op Enter, of na een korte pauze. Tot
 * dan kent alleen het paneel hem, zodat een beeld meteen kan volgen.
 *
 * Zuiver, zonder React: scripts/check-invoerpaneel.mjs laadt dit met een eigen klok.
 */

export interface Klok {
  zet: (fn: () => void, ms: number) => unknown;
  wis: (wekker: unknown) => void;
}

const ECHTE_KLOK: Klok = {
  zet: (fn, ms) => setTimeout(fn, ms),
  wis: (wekker) => clearTimeout(wekker as ReturnType<typeof setTimeout>),
};

export class InvoerWachtrij {
  private readonly wachtend = new Map<string, { waarde: string; wekker: unknown }>();
  private readonly stuur: (naam: string, waarde: string) => void;
  private readonly pauze: number;
  private readonly meld: () => void;
  private readonly klok: Klok;

  /**
   * `stuur` schrijft een waarde naar het blad; `meld` laat weten dat er iets wacht of
   * verstuurd is, zodat het paneel opnieuw tekent.
   */
  constructor(stuur: (naam: string, waarde: string) => void, pauze: number, meld: () => void = () => {}, klok: Klok = ECHTE_KLOK) {
    this.stuur = stuur;
    this.pauze = pauze;
    this.meld = meld;
    this.klok = klok;
  }

  /** Er is een geldige waarde getypt: na de pauze gaat hij naar het blad. */
  typ(naam: string, waarde: string): void {
    const al = this.wachtend.get(naam);
    if (al) this.klok.wis(al.wekker);
    // Opnieuw achteraan: alles sturen gaat in de volgorde van typen.
    this.wachtend.delete(naam);
    this.wachtend.set(naam, { waarde, wekker: this.klok.zet(() => this.verlaat(naam), this.pauze) });
    this.meld();
  }

  /** Het veld is verlaten, of Enter: wat er wacht, gaat nu naar het blad. */
  verlaat(naam: string): void {
    const w = this.wachtend.get(naam);
    if (!w) return;
    this.klok.wis(w.wekker);
    this.wachtend.delete(naam);
    this.stuur(naam, w.waarde);
    this.meld();
  }

  /** Een keuze uit een lijst of een maat in een tekening: meteen naar het blad, zonder pauze. */
  zetNu(naam: string, waarde: string): void {
    const w = this.wachtend.get(naam);
    if (w) {
      this.klok.wis(w.wekker);
      this.wachtend.delete(naam);
    }
    this.stuur(naam, waarde);
    this.meld();
  }

  /** Wat er nu staat is geen waarde (een eenheid die niet past): er gaat niets naar het blad. */
  houdTegen(naam: string): void {
    this.vergeet(naam);
  }

  /** Escape, of terug naar wat er stond: wat er wachtte, vervalt. */
  vergeet(naam: string): void {
    const w = this.wachtend.get(naam);
    if (!w) return;
    this.klok.wis(w.wekker);
    this.wachtend.delete(naam);
    this.meld();
  }

  /** Het blad gaat dicht of een ander blad komt in beeld: eerst alles sturen. */
  stuurAlles(): void {
    for (const naam of [...this.wachtend.keys()]) this.verlaat(naam);
  }

  /** De waarde die voor dit veld wacht, in de eenheid van het blad. */
  wacht(naam: string): string | undefined {
    return this.wachtend.get(naam)?.waarde;
  }

  /** Hoeveel velden er wachten. */
  get aantal(): number {
    return this.wachtend.size;
  }
}
