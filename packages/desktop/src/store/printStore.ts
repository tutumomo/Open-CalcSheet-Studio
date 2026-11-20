import { create } from "zustand";

/**
 * Wat er wordt afgedrukt. "bladen" is de uitdraai van rekenbladen: één blad
 * als losse berekening met een titelblok, of meer bladen achter een voorblad.
 * "rapport" is het constructierapport, met de rekenbladen in bijlage A.
 */
export type AfdrukSoort = "bladen" | "rapport";

/**
 * Schakelaar voor de afdrukweergave.
 *
 * Het hele project als HTML opbouwen kost tijd bij twintig bladen, dus dat
 * gebeurt niet bij elke render maar alleen op het moment dat je print. `bezig`
 * staat aan tussen "print gevraagd" en "printdialoog gesloten"; alleen dan
 * bestaat `<PrintDocument />` in de DOM.
 */
interface PrintState {
  bezig: boolean;
  /**
   * Afdrukvoorbeeld: dezelfde weergave, maar op het scherm en zonder de
   * printdialoog. Zonder dit is een printlayout niet te controleren zonder hem
   * uit te draaien — en dan zie je pas op papier dat er iets niet klopt.
   */
  voorbeeld: boolean;
  /**
   * Welke bladen er in de uitdraai komen, als id's; `null` is het hele
   * project. Eén blad is een losse berekening: die krijgt geen voorblad maar
   * een titelblok boven het blad.
   */
  selectie: string[] | null;
  /**
   * Bladen of rapport. Blijft staan tot een volgende afdruk of een volgend
   * voorbeeld een andere soort vraagt, net als `selectie`: de knop
   * "PDF / afdrukken…" in het voorbeeld drukt zo af wat er te zien is.
   */
  soort: AfdrukSoort;
  /**
   * Het bestand waar het rapport heen gaat, zonder printdialoog (tauri/rapportPdf.ts).
   * `null` tijdens elke andere afdruk: die gaat naar de printdialoog.
   */
  pdfPad: string | null;
  /** De laatst weggeschreven PDF, voor de statusbalk. */
  pdfGeschreven: string | null;
  /**
   * Stil schrijven (de API): mislukt het, dan komt er geen melding en geen printdialoog,
   * maar staat de reden in `pdfFout`.
   */
  stil: boolean;
  pdfFout: string | null;
  /** De grootte van de laatst weggeschreven PDF, in bytes. */
  pdfBytes: number;
  /** Start het afdrukken; een opgegeven selectie of soort wordt eerst ingesteld. */
  afdrukken: (selectie?: string[] | null, soort?: AfdrukSoort) => void;
  /** Start het afdrukken van het rapport naar een bestand. */
  rapportNaarPdf: (pad: string, stil?: boolean) => void;
  /** De PDF staat op schijf. */
  meldPdfGeschreven: (pad: string, bytes?: number) => void;
  /** Stil schrijven mislukte. */
  meldPdfFout: (fout: string) => void;
  klaar: () => void;
  /** Opent het voorbeeld; een opgegeven selectie of soort wordt eerst ingesteld. */
  toonVoorbeeld: (selectie?: string[] | null, soort?: AfdrukSoort) => void;
  sluitVoorbeeld: () => void;
  kiesSelectie: (selectie: string[] | null) => void;
}

/** Alleen wat is opgegeven: een weggelaten argument laat de huidige keuze staan. */
function opgegeven(selectie?: string[] | null, soort?: AfdrukSoort): Partial<PrintState> {
  return {
    ...(selectie === undefined ? {} : { selectie }),
    ...(soort === undefined ? {} : { soort }),
  };
}

export const usePrintStore = create<PrintState>((set) => ({
  bezig: false,
  voorbeeld: false,
  selectie: null,
  soort: "bladen",
  pdfPad: null,
  pdfGeschreven: null,
  stil: false,
  pdfFout: null,
  pdfBytes: 0,
  afdrukken: (selectie, soort) => set({ bezig: true, pdfPad: null, stil: false, ...opgegeven(selectie, soort) }),
  rapportNaarPdf: (pad, stil = false) => set({ bezig: true, pdfPad: pad, pdfGeschreven: null, pdfFout: null, stil, ...opgegeven(null, "rapport") }),
  meldPdfGeschreven: (pad, bytes = 0) => set({ pdfGeschreven: pad, pdfBytes: bytes }),
  meldPdfFout: (fout) => set({ pdfFout: fout }),
  klaar: () => set({ bezig: false, pdfPad: null }),
  toonVoorbeeld: (selectie, soort) => set({ voorbeeld: true, ...opgegeven(selectie, soort) }),
  sluitVoorbeeld: () => set({ voorbeeld: false }),
  kiesSelectie: (selectie) => set({ selectie }),
}));

/**
 * De actie waarmee een knop of sneltoets het afdrukken start: het
 * constructierapport, tenzij het afdrukvoorbeeld openstaat — dan geldt wat
 * daar te zien is (het rapport, alle bladen of één blad).
 *
 * Twee selectors, in deze volgorde: App roept deze hook via useSneltoetsen
 * aan, en het aantal hooks daarin verandert niet zonder App mee te nemen.
 */
export function useAfdrukken(): () => void {
  const afdrukken = usePrintStore((s) => s.afdrukken);
  const voorbeeld = usePrintStore((s) => s.voorbeeld);
  return () => (voorbeeld ? afdrukken() : afdrukken(null, "rapport"));
}
