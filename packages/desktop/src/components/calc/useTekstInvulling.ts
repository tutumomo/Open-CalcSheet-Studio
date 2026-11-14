/**
 * De waarden uit rekenbladen voor gewone tekst (`{#2.R_paal}`), als React-hook.
 *
 * De rekenkern erachter staat in rekenen/tekstInvulling.ts; hier alleen de
 * verbinding met het project: de bladen die mogen worden aangeroepen, de
 * projectgegevens en het eenhedenstelsel, net als in de werkruimte.
 *
 * Het rekenen gaat één keer per tekst; de sleutel verandert als een aangeroepen
 * blad (of wat dat zelf aanroept) of de projectgegevens veranderen.
 */
import { useMemo } from "react";
import { useProjectStore } from "../../store/projectStore";
import { projectScope } from "../../store/projectGegevens";
import { evalOptiesVan } from "../../store/projectEenheden";
import { rekentaalIncludes, rekentaalImageUrls } from "../../templates/rekentaal-includes";
import { metToetsingen } from "../../rekenen/toetsCache";
import { useToetsVersie } from "../../rekenen/femToetsing";
import { invulSleutel, markdownVerwijzingen, rekenTekstVerwijzingen, tekstVerwijzingen, type IngevuldeWaarde } from "../../rekenen/tekstInvulling";

/** De ingevulde waarden per plek (`{#2.R_paal:1}` → `450,0 kN`), of een lege kaart. */
export function useInvulwaarden(tekst: string, markdown = false): ReadonlyMap<string, IngevuldeWaarde> {
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const gegevens = useProjectStore((s) => s.gegevens);
  const toetsV = useToetsVersie();

  const lijst = useMemo(() => (markdown ? markdownVerwijzingen(tekst) : tekstVerwijzingen(tekst)), [tekst, markdown]);
  const omg = useMemo(
    () => ({
      bladen: exemplaren.filter((e) => e.ref && e.source.trim()).map((e) => ({ ref: e.ref, source: e.source, waarden: e.waarden })),
      scope: projectScope(gegevens),
      opties: { includes: rekentaalIncludes, imageUrls: rekentaalImageUrls },
      evalOpties: metToetsingen(evalOptiesVan(gegevens), "lezen"),
    }),
    [exemplaren, gegevens],
  );
  // De antwoorden van FEM Studio horen bij de uitkomst van een blad.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const sleutel = useMemo(() => invulSleutel(lijst, omg), [lijst, omg, toetsV]);

  return useMemo(() => rekenTekstVerwijzingen(lijst, omg), [sleutel]);
}

/** Dezelfde kaart, maar als tekst per plek: wat het rapport invult. */
export function useInvulteksten(tekst: string, markdown = false): ReadonlyMap<string, string> {
  const waarden = useInvulwaarden(tekst, markdown);
  return useMemo(() => {
    const uit = new Map<string, string>();
    for (const [plek, w] of waarden) if (w.tekst !== null) uit.set(plek, w.tekst);
    return uit;
  }, [waarden]);
}
