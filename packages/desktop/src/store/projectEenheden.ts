import { STELSELS, geldigeEenheidNaam, type EvalOpties, type Grootheid, type Stelsel } from "@ifc-calc/core";
import type { ProjectGegevens } from "./projectGegevens";

/**
 * Het eenhedenstelsel van een project (docs/superpowers/specs/2026-11-06-eenheden-design.md).
 *
 * Het staat in de projectgegevens, zodat opslaan, het herstelbestand, IFCX, ongedaan
 * maken en oude bestanden vanzelf meewerken:
 *   eenheden         de keuze (een keuzeveld in PROJECT_VELDEN); ontbreekt = "blad"
 *   eenheden_eigen   bij "eigen": de eenheid per grootheid, als JSON
 *   eenheden_lijst   de eigen eenheden van het project, als JSON [{ naam, uitdrukking }]
 */

export type StelselKeuze = "blad" | "si-mm" | "si-m" | "us" | "tw-mks" | "eigen";

export const STELSEL_KEUZES: readonly StelselKeuze[] = ["blad", "si-mm", "si-m", "us", "tw-mks", "eigen"];

/** Een eigen eenheid van het project: `kipf` = `1000 lbf`. */
export interface EigenEenheid {
  naam: string;
  uitdrukking: string;
}

/** De keuzes per grootheid bij "eigen", in de schrijfwijze van de rekenkern. */
export const GROOTHEID_KEUZES: Record<Grootheid, string[]> = {
  lengte: ["m", "mm", "ft", "in"],
  maat: ["mm", "cm", "m", "in"],
  oppervlakte: ["m^2", "ft^2"],
  doorsnedeOppervlakte: ["mm^2", "cm^2", "in^2"],
  weerstandsmoment: ["mm^3", "cm^3", "in^3"],
  traagheidsmoment: ["mm^4", "cm^4", "in^4"],
  kracht: ["N", "kN", "MN", "lbf", "kip", "kgf", "tf"],
  moment: ["N mm", "kN m", "lbf in", "kip in", "kip ft", "kgf m", "tf m"],
  lijnlast: ["kN / m", "N / mm", "plf", "klf", "kgf / m", "tf / m"],
  vlakbelasting: ["kN / m^2", "kPa", "psf", "ksf", "kgf / m^2", "tf / m^2"],
  spanning: ["N / mm^2", "MPa", "GPa", "psi", "ksi", "kgf / cm^2", "tf / m^2"],
  volumegewicht: ["kN / m^3", "pcf", "tf / m^3"],
  massa: ["kg", "t", "lb"],
};

/** Een JSON-tekst uit de projectgegevens; kapot of afwezig geeft `leeg`. */
function leesJson<T>(tekst: string | undefined, leeg: T, past: (x: unknown) => x is T): T {
  if (!tekst) return leeg;
  try {
    const x: unknown = JSON.parse(tekst);
    return past(x) ? x : leeg;
  } catch {
    return leeg;
  }
}

const isObject = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);

/** De eenheid per grootheid bij "eigen"; alleen bekende grootheden met een tekst. */
export function eigenStelselVan(g: ProjectGegevens): Stelsel {
  const ruw = leesJson<Record<string, unknown>>(g.eenheden_eigen, {}, isObject);
  const uit: Stelsel = {};
  for (const grootheid of Object.keys(GROOTHEID_KEUZES) as Grootheid[]) {
    const e = ruw[grootheid];
    // Alleen een keuze uit de lijst: een met de hand bewerkte eenheid met de verkeerde
    // dimensie zou elk blad met zo'n waarde breken.
    if (typeof e === "string" && GROOTHEID_KEUZES[grootheid].includes(e)) uit[grootheid] = e;
  }
  return uit;
}

/** De lijst eigen eenheden zoals hij in de gegevens staat, ook met regels die nog niet af zijn. */
export function ruweEigenEenheden(g: ProjectGegevens): EigenEenheid[] {
  const ruw = leesJson<unknown[]>(g.eenheden_lijst, [], Array.isArray);
  return ruw.map((r) => ({
    naam: isObject(r) && typeof r.naam === "string" ? r.naam : "",
    uitdrukking: isObject(r) && typeof r.uitdrukking === "string" ? r.uitdrukking : "",
  }));
}

/**
 * De eigen eenheden van het project die meedoen: een regel die niet af is of een naam die
 * niet mag (één letter, een bestaande eenheid) valt weg. Het projectpaneel toont waarom
 * (zetProjectEenheden in de rekenkern).
 */
export function eigenEenhedenVan(g: ProjectGegevens): EigenEenheid[] {
  return ruweEigenEenheden(g).flatMap((r) => {
    const naam = r.naam.trim();
    const uitdrukking = r.uitdrukking.trim();
    return naam && uitdrukking && geldigeEenheidNaam(naam) ? [{ naam, uitdrukking }] : [];
  });
}

/** De keuze van het project; een onbekende waarde telt als "blad". */
export function stelselKeuzeVan(g: ProjectGegevens): StelselKeuze {
  const k = g.eenheden as StelselKeuze | undefined;
  return k && STELSEL_KEUZES.includes(k) ? k : "blad";
}

/** Wat de rekenkern van het project meekrijgt (EvalOpties). */
export function evalOptiesVan(g: ProjectGegevens): EvalOpties {
  const keuze = stelselKeuzeVan(g);
  const eigenEenheden = eigenEenhedenVan(g);
  const stelsel: Stelsel | undefined = keuze === "blad"
    ? undefined
    : keuze === "eigen"
      ? { ...STELSELS["si-mm"], ...eigenStelselVan(g) }
      : STELSELS[keuze];
  return { ...(stelsel ? { stelsel } : {}), eigenEenheden };
}

/** De namen van de eigen eenheden van het project, voor het lezen van de bladen (ParseOptions.eenheden). */
export function eigenNamenVan(g: ProjectGegevens): string[] {
  return eigenEenhedenVan(g).map((e) => e.naam);
}
