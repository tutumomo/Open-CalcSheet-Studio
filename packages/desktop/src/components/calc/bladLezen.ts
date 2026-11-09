import i18next from "i18next";
import type { EvaluatedNode } from "@ifc-calc/core";

/*
 * Wat een doorgerekend blad oplevert, gelezen uit de uitgerekende knopen.
 * Zonder React en zonder stores, zodat ook de rekenworker (rekenen/rekenWorker.ts)
 * dit kan gebruiken; bladResultaat.ts exporteert alles hier opnieuw.
 */

/**
 * De uitkomst van een doorgerekend blad: titel, norm, maatgevende UC en het
 * eindoordeel. De afdruk zet die in de kop van elk blad; een parametrisch beeld
 * kan hem in zijn eigen kop tonen. Zo staat er overal hetzelfde getal, en
 * hoeft een beeld de toetsing niet na te bouwen.
 */
export interface Resultaat {
  /** De kop van het rekenblad, zonder normverwijzing. */
  titel: string;
  /** Het deel van de kop na het gedachtestreepje: de norm of het hoofdstuk. */
  norm: string;
  /** De maatgevende unity check (UC_max), als het blad die noemt. */
  uc: number | null;
  /** Het eindoordeel van het blad; null als het blad er geen geeft. */
  voldoet: boolean | null;
  /**
   * Het blad zegt zelf dat het niet is getoetst: een verplichte toets ontbreekt, de
   * invoer is ongeldig of het geval valt buiten het blad. `voldoet` is dan null. Zo is
   * dat te onderscheiden van een blad dat gewoon geen oordeel kent.
   */
  nietGetoetst?: boolean;
}

/** Twee decimalen in de notatie van de taal, zonder taal die van de app; een oneindige UC als ∞. */
export const ucTekst = (uc: number, taal: string | undefined = i18next.language) => {
  if (!Number.isFinite(uc)) return "∞";
  return taal?.startsWith("nl") ? uc.toFixed(2).replace(".", ",") : uc.toFixed(2);
};

/** Een uitkomst van het blad als getal. ∞ is een geldige UC: weerstand nul. */
function getal(tekst: string): number {
  const t = tekst.trim();
  return t.startsWith("∞") ? Infinity : parseFloat(t.replace(",", "."));
}

/** Loopt de uitgerekende knopen door, ook die binnen een voorwaardelijk blok. */
function* knopen(lijst: EvaluatedNode[]): Generator<EvaluatedNode> {
  for (const n of lijst) {
    yield n;
    if (n.type === "conditional-branch") yield* knopen(n.children);
  }
}

/**
 * Leest de uitkomst uit een doorgerekend blad.
 *
 * De maatgevende UC is de laatste zichtbare `UC_max`. Het oordeel komt uit de
 * slotzin ("Maatgevende UC = … → voldoet"), want een blad kan ondanks een UC
 * onder 1,0 afkeuren, bijvoorbeeld op de detaillering. Zonder slotzin beslist
 * de UC. De slotzin staat in de taal van de uitvoer: Nederlands, of in het Engels
 * "Governing UC = … → … OK" (templates/vertalingen.ts).
 */
export function leesResultaat(nodes: EvaluatedNode[], naam: string): Resultaat {
  let titel = naam;
  let norm = "";
  let uc: number | null = null;
  const tekstdelen: string[] = [];
  for (const n of knopen(nodes)) {
    if (n.type === "heading" && n.level === 1 && titel === naam) {
      const [voor, na] = n.text.split(/\s+—\s+/, 2);
      titel = voor || naam;
      norm = na ?? "";
    }
    if ((n.type === "assignment" || n.type === "var-display") && n.name === "UC_max") {
      const w = getal(String(n.result));
      if (!Number.isNaN(w)) uc = w;
    }
    if (n.type === "text") tekstdelen.push(n.text);
  }
  const tekst = tekstdelen.join(" ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
  const slot = Math.max(
    tekst.lastIndexOf("Maatgevende UC"),
    tekst.lastIndexOf("Governing UC"),
    tekst.lastIndexOf("控制 UC"),
  );
  let voldoet: boolean | null = null;
  if (slot >= 0) {
    const zin = tekst.slice(slot, slot + 240);
    voldoet = !/voldoe[nt] niet|\bnot OK\b|不合格/.test(zin) && /voldoe[nt]|\bOK\b|合格/.test(zin);
    // Staat UC_max niet zichtbaar in het blad, dan het getal uit de slotzin.
    if (uc === null) {
      const m = zin.match(/(?:Maatgevende|Governing|控制)\s*UC\s*=\s*([\d.,]+|∞)/);
      const w = m ? getal(m[1]) : NaN;
      if (!Number.isNaN(w)) uc = w;
    }
  } else if (uc !== null) {
    voldoet = uc <= 1;
  }
  const r: Resultaat = { titel, norm, uc, voldoet };
  // Alleen zonder slotzin: "Maatgevende UC … voldoet niet" gaat altijd voor.
  if (slot < 0 && /Eindoordeel: (?:ongeldige invoer, )?niet getoetst|Overall result: (?:invalid input, )?not verified|總結[：:]\s*(?:無效輸入[，,]?\s*)?未檢核/.test(tekst)) {
    r.nietGetoetst = true;
  }
  return r;
}

/**
 * Elke zichtbare uitkomst van het blad op naam, zonder eenheid: `h_ef` → 2100.
 * De eenheid is die van het blad (`to mm`, `to kN`). Staat een naam er twee
 * keer, dan telt de laatste — net als in de uitwerking zelf. Het getal is
 * onafgerond (`waarde`): een beeld dat ermee verder rekent, komt dan op
 * dezelfde uitkomst als het blad en niet op een cijfer ernaast.
 */
export function leesGetallen(nodes: EvaluatedNode[]): Record<string, number> {
  const uit: Record<string, number> = {};
  for (const n of knopen(nodes)) {
    if (n.type === "assignment" || n.type === "var-display") {
      const w = typeof n.waarde === "number" && Number.isFinite(n.waarde) ? n.waarde : getal(String(n.result));
      if (!Number.isNaN(w)) uit[n.name] = w;
    }
  }
  return uit;
}

/**
 * Een schakelaar tussen de twee lezingen: `X = if(rekenwijze ≡ 1; X_ref; X_nb)`.
 * Groep 2 is het achtervoegsel van de referentietak, zonder scheidingsteken.
 */
const SCHAKELAAR = /^[ \t]*([^\s=]+)[ \t]*=[ \t]*if\(rekenwijze ≡ 1;[ \t]*\1[,_]([^\s;,_]+)[ \t]*;/gmu;

/**
 * Zet de referentietakken van een blad onder hun huidige naam, `X_ref`.
 *
 * Een blad draagt zijn eigen rekentekst mee, dus een blad dat vóór die
 * naamgeving is opgeslagen, noemt zijn referentietakken nog anders. Welk
 * achtervoegsel het blad gebruikt, staat in zijn eigen schakelaars; dat lezen
 * we daar af. Zo hoeft een beeld alleen de huidige naam te kennen en leest het
 * een ouder blad toch goed. Bij een blad dat al `_ref` schrijft, verandert er
 * niets.
 */
export function metRefNamen(getallen: Record<string, number>, bron: string): Record<string, number> {
  const ander = new Set<string>();
  for (const m of bron.matchAll(SCHAKELAAR)) if (m[2] !== "ref") ander.add(m[2]);
  if (ander.size === 0) return getallen;
  const uit: Record<string, number> = {};
  for (const [naam, w] of Object.entries(getallen)) {
    const i = naam.lastIndexOf("_");
    uit[i > 0 && ander.has(naam.slice(i + 1)) ? `${naam.slice(0, i)}_ref` : naam] = w;
  }
  return uit;
}

/** Wat een beeld van zijn blad laat zien: het oordeel en de getallen van de uitwerking. */
export interface BladUitkomst {
  resultaat: Resultaat;
  getallen: Record<string, number>;
}
