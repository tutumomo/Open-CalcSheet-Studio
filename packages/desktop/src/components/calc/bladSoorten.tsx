import type { ComponentType } from "react";
import { useAfdrukTaal, usePapier } from "./afdrukTaal";
import type { Exemplaar } from "../../store/projectStore";
import { PDF_BLAD } from "../../store/pdfBijlage";
import { SPREADSHEET_BLAD } from "../../store/spreadsheetBlad";
import { MARKDOWN_BLAD } from "../../store/markdownBlad";
import { GRAAF_BLAD } from "../../store/graafBlad";
import { TEKEN_BLAD } from "../../store/tekenBlad";
import { MARIMO_BLAD } from "../../store/marimoBlad";
import type { Blad, BladPlek, Inhoudskop } from "../../rapport/opzet";
import type { Maten } from "./paginering";
import { papier, usePdfPaginas } from "./pdfBlad";
import { PdfPaginas } from "./PdfBladWeergave";
import { SpreadsheetVellen } from "./SpreadsheetBladWeergave";
import { MarkdownPapier, MarkdownRapportKeuze } from "./MarkdownBladWeergave";
import { koppenVoorInhoud } from "./markdownRegels";
import { GraafVellen } from "../graaf/GraafAfdruk";
import { TekenbladAfdruk, TekenvelOpPapier } from "./TekenbladWeergave";
import { MarimoPapier } from "./MarimoPapier";

/*
 * De bladsoorten in de afdruk, op één plek.
 *
 * Een blad dat niet rekent (een PDF, een werkmap, een Markdown-tekst) meldt zich
 * hier aan, en de afdruk vraagt het alleen hier na: de losse uitdraai (PrintBlad),
 * het rapport (Knopen, RapportAfdruk), het doorrekenen (bladDoorrekenen) en het
 * paneel Rapport (BerekeningenSectie). Een blad zonder aanmelding is een rekenblad.
 *
 * Een nieuwe soort komt er met een paar regels bij; docs/bladsoorten.md zegt hoe.
 * Paginanummers en inhoudsopgave volgen daarna vanzelf: elk blok op een vel telt
 * mee, hoe het ook is getekend.
 */

export interface BladSoort {
  /** `templateId` van de bladen van deze soort. */
  templateId: string;
  /** De naam van de soort op papier, onder de kop en in de kolom grondslag, in de taal van de uitdraai. */
  soortTekst: (taal?: string) => string;
  /**
   * Het afdrukonderdeel: de inhoud van het blad onder zijn kop, binnen de
   * bladspiegel van `maten`. Elk blok is een los kind; `print-nieuw-vel` begint een
   * vers vel en `print-vel-af` sluit het af (paginering.ts). Wat nog tekent draagt
   * `data-afdruk-laadt`; het afdrukvoorbeeld ziet zelf wanneer er iets verandert.
   */
  Afdruk: ComponentType<{ ex: Exemplaar; maten: Maten; nummer?: number | string }>;
  /**
   * Het hele blad zelf, zonder kop erboven: voor een blad op eigen papierformaat met
   * zijn naam op het vel. Zonder: de kop met `Afdruk` eronder (LosBladAfdruk).
   */
  HeelBlad?: ComponentType<{ ex: Exemplaar; nummer?: number | string; anker?: string }>;
  /** Wat er achter de soort onder de kop staat, zoals de bestandsnaam. Een haak: mag een stand lezen. */
  useOnderkop?: (ex: Exemplaar) => Array<string | undefined>;
  /** Waar de uitwerking staat zolang de gebruiker niets koos. Zonder: in de bijlage. */
  plek?: BladPlek;
  /**
   * Regels onder de naam van het blad in de inhoudsopgave, zoals koppen uit een
   * bestand. Het anker van een regel staat op papier als `data-inhoud` op die kop.
   * Zonder: alleen de naam van het blad.
   */
  inhoudsKoppen?: (ex: Exemplaar, tekst?: (tekst: string) => string) => Inhoudskop[];
  /** Een eigen keuze op de kaart van dit blad in het paneel Rapport. */
  RapportKeuze?: ComponentType<{ ex: Exemplaar }>;
}

const SOORTEN: readonly BladSoort[] = [
  {
    templateId: PDF_BLAD,
    soortTekst: (taal) => papier(taal)("pdfBlad.soort"),
    Afdruk: PdfPaginas,
    useOnderkop: (ex) => {
      const stand = usePdfPaginas(ex.pdf?.data);
      const t = usePapier();
      return [ex.pdf?.bestandsnaam, stand && stand.paginas.length > 0 ? t("pdfBlad.paginas", { count: stand.paginas.length }) : ""];
    },
  },
  {
    templateId: SPREADSHEET_BLAD,
    soortTekst: (taal) => papier(taal)("spreadsheetBlad.soort"),
    Afdruk: SpreadsheetVellen,
    useOnderkop: (ex) => [ex.xlsx?.bestandsnaam],
  },
  {
    templateId: MARKDOWN_BLAD,
    soortTekst: (taal) => papier(taal)("markdownBlad.soort"),
    Afdruk: MarkdownPapier,
    useOnderkop: (ex) => [ex.md?.bestandsnaam],
    plek: "hoofdstuk",
    inhoudsKoppen: (ex, tekst) => (ex.md && !ex.md.koppenUit ? koppenVoorInhoud(tekst?.(ex.md.tekst) ?? ex.md.tekst, ex) : []),
    RapportKeuze: MarkdownRapportKeuze,
  },
  {
    templateId: MARIMO_BLAD,
    soortTekst: (taal) => papier(taal)("marimoBlad.soort"),
    Afdruk: MarimoPapier,
    useOnderkop: (ex) => [ex.marimo?.bestandsnaam],
  },
  {
    templateId: GRAAF_BLAD,
    soortTekst: (taal) => papier(taal)("graafBlad.soort"),
    Afdruk: GraafVellen,
  },
  {
    templateId: TEKEN_BLAD,
    soortTekst: (taal) => papier(taal)("tekenBlad.soort"),
    Afdruk: TekenvelOpPapier,
    HeelBlad: TekenbladAfdruk,
  },
];

/** De aanmelding van dit blad; een rekenblad heeft er geen. */
export function bladSoortVan(ex: { templateId?: string }): BladSoort | undefined {
  return SOORTEN.find((s) => s.templateId === ex.templateId);
}

/**
 * Een blad zoals de opzet van het rapport het leest (rapport/opzet.ts).
 * `tekst` vult de waarden uit andere bladen in (`{#2.R_paal}`), ook in de koppen
 * die in de inhoudsopgave komen.
 */
export function bladVoorOpzet(ex: Exemplaar, tekst?: (tekst: string) => string): Blad {
  const soort = bladSoortVan(ex);
  return {
    id: ex.id,
    naam: ex.naam,
    plek: soort?.plek,
    koppen: soort?.inhoudsKoppen?.(ex, tekst),
    // Een blad met een eigen heel vel (een tekening) is een figuur in het rapport.
    ...(soort?.HeelBlad ? { figuur: true } : {}),
  };
}

/**
 * Een blad van een aangemelde soort als eigen onderdeel van de uitdraai: de kop
 * met nummer en naam (losse bladen: 1, 2, …; bijlage A: A.1, A.2, …), daaronder zijn
 * afdrukonderdeel. `anker`: de plek van de kop voor de inhoudsopgave.
 */
export function LosBladAfdruk({ soort, ex, nummer, maten, anker }: {
  soort: BladSoort; ex: Exemplaar; nummer: number | string; maten: Maten; anker?: string;
}) {
  // Een blad verandert niet van soort, dus deze haak blijft dezelfde.
  const extra = soort.useOnderkop?.(ex) ?? [];
  const taal = useAfdrukTaal();
  const onderkop = [soort.soortTekst(taal), ...extra].filter(Boolean).join(" · ");
  return (
    <section className="print-blad print-pdf">
      <header className="print-blad-kop" data-inhoud={anker}>
        <span className="print-blad-nr">{nummer}</span>
        <span className="print-blad-titel">
          <span className="print-blad-naam">{ex.naam}</span>
          <span className="print-blad-norm">{onderkop}</span>
        </span>
      </header>
      <soort.Afdruk ex={ex} maten={maten} />
    </section>
  );
}
