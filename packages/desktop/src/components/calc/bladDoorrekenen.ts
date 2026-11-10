import i18next from "i18next";
import { defaultStyles, type EvalOpties } from "@ifc-calc/core";
import type { Exemplaar } from "../../store/projectStore";
import { rekentaalIncludes, rekentaalImageUrls } from "../../templates/rekentaal-includes";
import { bronVoorUitvoer } from "../../templates/vertalingen";
import { leesResultaat, type Resultaat } from "./bladResultaat";
import { bladSoortVan } from "./bladSoorten";
import { rekenUitwerking, type CanvasUitwerking } from "./canvasRekenen";
import { isJupyterBlad } from "../../store/jupyterBlad";
import { werkmapHtml } from "./jupyterPapier";
import { papier } from "./pdfBlad";
import { scopeMetVerwijzingen, verwezenBladen } from "../../rekenen/verwijzingen";

/*
 * Een rekenblad doorrekenen voor op papier.
 *
 * Staat los van PrintDocument omdat twee uitdraaien het nodig hebben: de losse
 * bladen (PrintDocument) en het constructierapport (components/rapport/afdruk).
 * Eén plek, zodat een blad in het rapport precies zo uitrekent als op zijn
 * eigen afdruk.
 */

let stijlenGeplaatst = false;

/** De opmaak van de rekenbladen staat in de core; die moet ook bij het printen mee. */
export function zorgVoorKernstijlen() {
  if (stijlenGeplaatst || typeof document === "undefined") return;
  const el = document.createElement("style");
  el.textContent = defaultStyles;
  el.dataset.ifcCalc = "core-styles";
  document.head.appendChild(el);
  stijlenGeplaatst = true;
}

/** Een doorgerekend blad: de uitwerking als HTML en de uitkomst voor kop en samenvatting. */
export interface DoorgerekendBlad {
  html: string;
  resultaat: Resultaat;
  /** Bij een canvas-blad: de uitwerking per eenheid, met zijn positie. */
  eenheden?: CanvasUitwerking[];
}

/**
 * Rekent één blad door met de projectgegevens als scope, voor de uitvoer in `taal`:
 * zonder taal die van de app (losse uitdraai), in het rapport die van het rapport.
 *
 * Een blad dat niet doorrekent houdt de rest van de uitdraai niet tegen: het
 * krijgt een rode regel met de fout, en de andere bladen komen gewoon op papier.
 */
export function rekenBladDoor(
  ex: Exemplaar,
  scope: Record<string, unknown>,
  taal: string = i18next.language,
  evalOpties: EvalOpties = {},
  /** Alle bladen van het project, voor waarden uit een ander blad (#1.R_paal). */
  alle: readonly Exemplaar[] = [],
): DoorgerekendBlad {
  // Een aangemelde soort rekent niets: geen uitwerking, geen UC. De naam van de soort
  // staat in de kolom grondslag van het overzicht; de inhoud tekent de soort zelf.
  const soort = bladSoortVan(ex);
  if (soort) {
    return { html: "", resultaat: { titel: ex.naam, norm: soort.soortTekst(taal), uc: null, voldoet: null } };
  }
  // Een Jupyter-blad rekent hier ook niets: de uitwerking komt uit de opgeslagen uitvoer.
  if (isJupyterBlad(ex)) {
    const t = papier(taal);
    const html = ex.jupyter
      ? werkmapHtml(ex.jupyter, {
        leeg: t("jupyterBlad.leeg"),
        fout: (bestand) => t("jupyterBlad.notebookFout", { bestand }),
        kapot: (fout) => t("jupyterBlad.fout", { fout }),
      })
      : `<p class="nb-tekst-los">${t("jupyterBlad.ontbreekt")}</p>`;
    return { html, resultaat: { titel: ex.naam, norm: t("jupyterBlad.soort"), uc: null, voldoet: null } };
  }
  let html: string;
  let eenheden: CanvasUitwerking[] | undefined;
  let resultaat: Resultaat = { titel: ex.naam, norm: "", uc: null, voldoet: null };
  try {
    // De eigen eenheden van het project gelden al bij het lezen (ParseOptions.eenheden).
    const opties = { includes: rekentaalIncludes, imageUrls: rekentaalImageUrls, eenheden: (evalOpties.eigenEenheden ?? []).map((e) => e.naam) };
    const uitvoer = bronVoorUitvoer(ex.source, taal);
    const metRefs = scopeMetVerwijzingen(ex.source, ex.waarden, scope, verwezenBladen(ex.source, ex.waarden, alle), opties, evalOpties);
    const uitwerking = rekenUitwerking(uitvoer.bron, ex.waarden, metRefs, opties, uitvoer.namen, evalOpties);
    html = uitwerking.html;
    eenheden = uitwerking.eenheden;
    resultaat = leesResultaat(uitwerking.nodes, ex.naam);
  } catch (err) {
    html = `<p class="calc-text" style="color:#b91c1c">${i18next.t("beelden:afdruk.nietDoorgerekend", { lng: taal })} ${
      (err as Error).message
    }</p>`;
  }
  return { html, resultaat, eenheden };
}
