import { useMemo } from "react";
import i18next, { type TFunction } from "i18next";
import { useProjectStore, type Exemplaar } from "../../../store/projectStore";
import { useBureauStore } from "../../../store/bureauProfiel";
import { projectScope, type ProjectGegevens } from "../../../store/projectGegevens";
import { evalOptiesVan } from "../../../store/projectEenheden";
import type { BeeldEenheden } from "../../calc/beeldEenheden";
import { useBeeldEenheden } from "../../calc/useBeeldEenheden";
import type { BureauProfiel, Rapport } from "../../../rapport/model";
import { fmt, notatie } from "../../../rapport/normwaarden";
import {
  bijlageRegels,
  bijlagen as bijlagenVan,
  bouwOpzet,
  inhoudsopgave,
  type Bijlage,
  type Inhoudsregel,
  type Rapportknoop,
} from "../../../rapport/opzet";
import type { Invulwaarden } from "../../../rapport/invullen";
import { rekenBladDoor, zorgVoorKernstijlen } from "../../calc/bladDoorrekenen";
import { bladVoorOpzet } from "../../calc/bladSoorten";
import type { CanvasUitwerking } from "../../calc/canvasRekenen";
import type { Resultaat } from "../../calc/bladResultaat";
import { metToetsingen } from "../../../rekenen/toetsCache";
import { useToetsVersie } from "../../../rekenen/femToetsing";

/*
 * Alles wat de afdruk van het rapport nodig heeft, op één plek verzameld.
 *
 * De taal van de afdruk is rapport.taal, niet de taal van de app: de vaste woorden
 * (`t`), de getallen (`f`, `n`) en de rekenbladen volgen het rapport.
 *
 * Het afdrukvoorbeeld rendert <RapportAfdruk />, en die leest alleen via deze hook. Wat naar
 * de printer gaat, is een kopie van de vellen van dat voorbeeld (drukvellen.ts).
 */

/** Eén blad van het project, doorgerekend. */
export interface RapportBlad {
  ex: Exemplaar;
  html: string;
  resultaat: Resultaat;
  /** Bij een canvas-blad: de uitwerking per eenheid, met zijn positie. */
  eenheden?: CanvasUitwerking[];
}

export interface RapportWeergave {
  /** De taal van dit rapport op papier. */
  taal: string;
  /** Vaste woorden in rapport.taal: namespace "rapport". */
  t: TFunction<"rapport">;
  /** Een uitgerekend getal in de notatie van rapport.taal. */
  f: (v: number, dec: number, trim?: boolean) => string;
  /** Een getypt getal in de notatie van rapport.taal (notatie in normwaarden.ts). */
  n: (s: string) => string;
  /** Het eenhedenstelsel van het project (beeldEenheden.ts). */
  eenheden: BeeldEenheden;
  /**
   * Als `f`, voor een waarde in de eenheid `bron` ("kN/m2", "m"): in het eenhedenstelsel van
   * het project, met evenveel nauwkeurigheid. Zonder stelsel precies `f`.
   */
  fe: (v: number, bron: string, dec: number, trim?: boolean) => string;
  /** Als `n`, voor een getypte waarde in de eenheid `bron`: in het stelsel; zonder stelsel precies `n`. */
  ne: (s: string, bron: string) => string;
  rapport: Rapport;
  gegevens: ProjectGegevens;
  projectNaam: string;
  /** Het bureau dat op het rapport staat (zie useRapportBureau). */
  bureau: BureauProfiel;
  /** Alle bladen van het project in de volgorde van de projectboom, los van een afdrukselectie. */
  bladen: RapportBlad[];
  /** De hoofdstukindeling van dit rapport: genummerd, zonder wat wegvalt. */
  knopen: Rapportknoop[];
  inhoud: Inhoudsregel[];
  /** De bladen in bijlage A voor in de inhoudsopgave; leeg zonder opmaak.bladenInInhoud. */
  inhoudBijlage: Inhoudsregel[];
  bijlagen: Bijlage[];
  /** Waarden voor de invulvelden in de teksten. */
  invul: Invulwaarden;
}

/**
 * Het bureau op papier: in het rapport en op losse bladen.
 *
 * Een rapport draagt een vastgelegde kopie van het bureauprofiel, zodat een
 * opgeleverd rapport niet verandert als het profiel later wijzigt. Zolang die
 * kopie nog leeg is (een nieuw rapport), geldt het profiel uit de
 * instellingen — anders zou een vers rapport zonder bureaunaam en huisstijl
 * op papier komen.
 */
export function useRapportBureau(): BureauProfiel {
  const vastgelegd = useProjectStore((s) => s.rapport.bureau);
  const profiel = useBureauStore((s) => s.profiel);
  return vastgelegd.naam ? vastgelegd : profiel;
}

export function useRapportWeergave(): RapportWeergave {
  const rapport = useProjectStore((s) => s.rapport);
  const gegevens = useProjectStore((s) => s.gegevens);
  const projectNaam = useProjectStore((s) => s.projectNaam);
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const bureau = useRapportBureau();
  const eenheden = useBeeldEenheden();
  const { taal } = rapport;
  const toetsV = useToetsVersie();

  zorgVoorKernstijlen();

  // Alle bladen: het rapport kent geen selectie. Een blad dat in het
  // hoofdstuk zelf staat, telt net zo goed mee als een blad in bijlage A.
  const bladen = useMemo(() => {
    const scope = projectScope(gegevens);
    // In het eenhedenstelsel van het project, net als op het scherm.
    // Lezen: een @toets-blok zonder antwoord staat in het rapport als niet getoetst.
    const evalOpties = metToetsingen(evalOptiesVan(gegevens), "lezen", taal);
    return exemplaren.map((ex) => ({ ex, ...rekenBladDoor(ex, scope, taal, evalOpties, exemplaren) }));
    // De versie van de antwoorden van FEM Studio hoort erbij.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exemplaren, gegevens, taal, toetsV]);

  const opzet = useMemo(() => {
    const lijst = exemplaren.map(bladVoorOpzet);
    const knopen = bouwOpzet(rapport, lijst);
    const metBladen = rapport.opmaak.bladenInInhoud;
    return {
      knopen,
      inhoud: inhoudsopgave(knopen, metBladen),
      inhoudBijlage: metBladen ? bijlageRegels(knopen) : [],
      bijlagen: bijlagenVan(rapport, lijst),
    };
  }, [rapport, exemplaren]);

  const invul = useMemo<Invulwaarden>(
    () => ({
      adviseur: bureau.naam,
      projectnummer: gegevens.project_nummer || "",
      projectnaam: gegevens.project_naam || projectNaam,
      opdrachtgever: gegevens.opdrachtgever || "",
      locatie: gegevens.locatie || "",
      verantwoordelijk: rapport.verantwoordelijk,
      uitvoerend: rapport.uitvoerend,
    }),
    [bureau.naam, gegevens, projectNaam, rapport.verantwoordelijk, rapport.uitvoerend],
  );

  const woorden = useMemo(() => ({
    t: i18next.getFixedT(taal, "rapport"),
    f: (v: number, dec: number, trim = false) => fmt(v, dec, trim, taal),
    n: (s: string) => notatie(s, taal),
    eenheden,
    fe: (v: number, bron: string, dec: number, trim = false) =>
      fmt(eenheden.waarde(v, bron), eenheden.decimalen(dec, bron), trim, taal),
    ne: (s: string, bron: string) => eenheden.getypt(s, bron, (v, dec) => fmt(v, dec, false, taal)) ?? notatie(s, taal),
  }), [taal, eenheden]);

  return { taal, ...woorden, rapport, gegevens, projectNaam, bureau, bladen, ...opzet, invul };
}
