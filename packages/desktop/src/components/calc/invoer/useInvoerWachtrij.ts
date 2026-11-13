import { useEffect, useMemo, useReducer } from "react";
import { useProjectStore } from "../../../store/projectStore";
import { InvoerWachtrij } from "./wachtrij";

/**
 * De wachtrij van het invoerpaneel voor één blad (wachtrij.ts): wat er getypt is, gaat na
 * een pauze of bij het verlaten van het veld naar de invoer van dat blad, langs dezelfde
 * weg als een veld in de uitwerking (`zetWaarde`). De rekentekst blijft zoals hij is, dus
 * ook de rekenversie; ongedaan maken en de varianten zien een gewone wijziging van de
 * invoer.
 *
 * Wisselt het blad of gaat het paneel dicht, dan gaat eerst alles wat nog wacht naar het
 * blad waar het bij hoort.
 */
export function useInvoerWachtrij(bladId: string, pauze: number): InvoerWachtrij {
  const [, tekenOpnieuw] = useReducer((n: number) => n + 1, 0);
  const rij = useMemo(
    () =>
      new InvoerWachtrij(
        (naam, waarde) => {
          const { exemplaren, zetWaarde } = useProjectStore.getState();
          const ex = exemplaren.find((e) => e.id === bladId);
          // Dezelfde waarde nog eens: geen wijziging, dus ook geen stap in de geschiedenis.
          if (ex && ex.waarden[naam] !== waarde) zetWaarde(bladId, naam, waarde);
        },
        pauze,
        tekenOpnieuw,
      ),
    [bladId, pauze],
  );
  useEffect(() => () => rij.stuurAlles(), [rij]);
  return rij;
}
