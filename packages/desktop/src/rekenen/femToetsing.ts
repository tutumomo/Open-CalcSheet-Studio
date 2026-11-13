/**
 * De verzoeken van `@toets`-, `@fem`- en `@kern`-blokken naar Open FEM Studio sturen, en
 * de antwoorden bij het blad vastleggen. Een `@fem`-blok stuurt een verzoek per
 * belastinggeval, met zijn rekenmodel (`bewaar`): daaruit volgen de argumenten, en het
 * antwoord wordt compact bewaard met het raster erbij (femNet.ts in de kern). Een
 * `@kern`-blok met `per` stuurt één verzoek met een reeks aanroepen (kernBlok.ts).
 *
 * De werkruimte rekent een blad in de rekenworker door met `toetsModus: "vragen"`.
 * Een blok zonder antwoord geeft dan een verzoek mee (doorrekening.ts). Hier gaat
 * elk verzoek één keer naar FEM Studio (femStudio.ts). Het antwoord komt in de
 * sessiecache (toetsCache.ts), met zijn herkomst: de versie van de server, de sha256
 * van het programma en de hash van het schema van de tool. Daarna rekent het blad een
 * ronde opnieuw, omdat de versie van de cache in de sleutel van de doorrekening zit,
 * en die ronde legt het antwoord bij het blad vast (legToetsingenVast). Zo gaat het
 * mee in het projectbestand.
 *
 * Een fout wordt ook een antwoord (`ok: false`): het blok toont hem als niet
 * getoetst en vraagt niet steeds opnieuw. Een fout wordt niet vastgelegd: op een
 * andere computer, of na opnieuw openen, mag het gewoon weer.
 */
import { useSyncExternalStore } from "react";
import i18next from "i18next";
import {
  alsAntwoord,
  femBewaar,
  femVerzoekArgumenten,
  kernAanroepen,
  kernVerzoekBewaard,
  schemaHash,
  type ToetsHerkomst,
  type ToetsVerzoek,
  type VastgelegdeToets,
} from "@ifc-calc/core";
import { femStudioAanroep, femStudioStatus, femStudioTools, FemFout } from "./femStudio";
import {
  abonneerToetsingen,
  HEEFT_FEM_BLOK,
  heeftToetsAntwoord,
  nieuwVastTeLeggen,
  toetsHashes,
  toetsVersie,
  metToetsingen,
  verzamelVerzoeken,
  zetFem,
  zetOpnieuw,
  zetToetsAntwoord,
} from "./toetsCache";
import { scopeMetVerwijzingen, verwezenBladen } from "./verwijzingen";
import { useProjectStore } from "../store/projectStore";
import { projectScope } from "../store/projectGegevens";
import { rekenDoor } from "../mcp/rekenen";
import { rekentaalIncludes, rekentaalImageUrls } from "../templates/rekentaal-includes";
import { variantInvoer } from "../store/varianten";

interface FemNu {
  versie?: string;
  sha256?: string;
  /** Per tool de hash van zijn schema. */
  schemas: Record<string, string>;
}

const onderweg = new Map<string, Promise<void>>();
let nu: Promise<FemNu> | null = null;
/** Wat `nu` gaf, zodra het er is. */
let nuBekend: FemNu | null = null;

/**
 * De FEM Studio van nu, één keer gevraagd. Is hij er niet, dan opnieuw bij "opnieuw
 * toetsen": niet bij elke ronde, want een start die mislukt kost tijd.
 */
function femNu(): Promise<FemNu> {
  nu ??= (async (): Promise<FemNu> => {
    const status = await femStudioStatus();
    if (!status.beschikbaar) return (nuBekend = { schemas: {} });
    let schemas: Record<string, string> = {};
    try {
      const lijst = (await femStudioTools()) as { tools?: { name?: unknown; inputSchema?: unknown }[] } | null;
      schemas = Object.fromEntries(
        (lijst?.tools ?? [])
          .filter((t): t is { name: string; inputSchema?: unknown } => typeof t?.name === "string")
          .map((t) => [t.name, schemaHash(t.inputSchema)]),
      );
    } catch {
      // Zonder schema's: dan alleen de versie vergelijken.
    }
    const uit = { versie: status.versie ?? undefined, sha256: status.sha256 ?? undefined, schemas };
    nuBekend = uit;
    zetFem({ versie: uit.versie, schemas });
    return uit;
  })().catch(() => (nuBekend = { schemas: {} }));
  return nu;
}

/** Vraagt alvast naar de FEM Studio van nu: een blad met een vastgelegd antwoord kan zo melden dat het ouder is. */
export function kenFemStudio(): void {
  void femNu();
}

function herkomstVoor(n: FemNu, tool: string): ToetsHerkomst {
  return {
    ...(n.versie ? { versie: n.versie } : {}),
    ...(n.sha256 ? { sha256: n.sha256 } : {}),
    ...(n.schemas[tool] ? { schema: n.schemas[tool] } : {}),
  };
}

/**
 * Stuurt elk nieuw verzoek één keer; wat al beantwoord is, slaat hij over. Klaar als
 * alle antwoorden er zijn, ook die al onderweg waren.
 */
export function vraagToetsingen(verzoeken: readonly ToetsVerzoek[]): Promise<void> {
  const wacht: Promise<void>[] = [];
  for (const v of verzoeken) {
    const al = onderweg.get(v.hash);
    if (al) {
      wacht.push(al);
      continue;
    }
    if (heeftToetsAntwoord(v.hash)) continue;
    const p = (async () => {
      try {
        // Een @fem-blok geeft zijn rekenmodel mee (femBlok.ts): daaruit volgen de
        // argumenten, en het wordt met het antwoord compact bewaard, raster en al.
        // Een @kern-blok met een reeks doet zijn aanroepen na elkaar (kernBlok.ts); de
        // antwoorden gaan samen onder de ene hash van het blok.
        const ruw = v.bewaar ? await femStudioAanroep(v.tool, femVerzoekArgumenten(v)) : await kernAanroepen(v, femStudioAanroep);
        const vast: VastgelegdeToets = {
          tool: v.tool,
          verzoek: (v.bewaar as unknown as Record<string, unknown> | undefined) ?? kernVerzoekBewaard(v),
          uitkomst: v.bewaar ? femBewaar(v.bewaar, ruw) : ruw,
          datum: new Date().toISOString(),
          herkomst: herkomstVoor(await femNu(), v.tool),
        };
        zetToetsAntwoord(v.hash, alsAntwoord(vast), vast);
      } catch (e) {
        const melding =
          e instanceof FemFout && e.code === "geenDesktop"
            ? i18next.t("werkruimte:toets.geenDesktop")
            : e instanceof Error
              ? e.message
              : String(e);
        zetToetsAntwoord(v.hash, { ok: false, melding });
      } finally {
        onderweg.delete(v.hash);
      }
    })();
    onderweg.set(v.hash, p);
    wacht.push(p);
  }
  return Promise.all(wacht).then(() => undefined);
}

/**
 * Legt bij een blad de antwoorden vast van de blokken die het nu heeft (hun hashes):
 * wat deze sessie antwoordde, of wat een ander blad met dezelfde invoer al had.
 */
export function legToetsingenVast(blad: string, hashes: readonly string[]): void {
  if (!hashes.length) return;
  const store = useProjectStore.getState();
  const ex = store.exemplaren.find((e) => e.id === blad);
  if (!ex) return;
  const bij = nieuwVastTeLeggen(ex.toetsingen, hashes);
  if (bij) store.zetToetsingen(blad, bij);
}

/** De knop "opnieuw toetsen": het blok vraagt zijn antwoord opnieuw aan FEM Studio. */
export function toetsOpnieuw(hash: string): void {
  // Was FEM Studio er eerder niet, dan nu opnieuw kijken.
  if (nuBekend && !nuBekend.versie) {
    nu = null;
    nuBekend = null;
  }
  zetOpnieuw(hash);
}

/**
 * Een klik in de uitwerking: op de knop "opnieuw toetsen" van een blok? Dan gebeurt dat.
 * Een `@fem`-blok heeft een hash per belastinggeval, met spaties ertussen: die gaan samen.
 */
export function klikOpToetsKnop(doel: EventTarget | null): boolean {
  const knop = doel instanceof Element ? doel.closest<HTMLElement>("[data-toets-opnieuw]") : null;
  const hashes = (knop?.dataset.toetsOpnieuw ?? "").split(/\s+/).filter(Boolean);
  if (!hashes.length) return false;
  for (const hash of hashes) toetsOpnieuw(hash);
  return true;
}

const MAX_RONDES = 10;

/**
 * Vóór het afdrukken (App.tsx): rekent de bladen met een `@toets`-blok door alsof ze
 * in de werkruimte staan, stuurt wat nog geen antwoord heeft naar FEM Studio en wacht
 * erop. Een blok dat de uitkomst van een ander gebruikt, komt een ronde later. Na
 * `maxMs` gaat de afdruk toch door: een blok zonder antwoord staat dan als niet
 * getoetst op papier. `ids`: alleen deze bladen; null is het hele project.
 */
export async function werkToetsingenBij(ids: readonly string[] | null, maxMs = 120_000): Promise<void> {
  const tot = Date.now() + maxMs;
  for (let ronde = 0; ronde < MAX_RONDES; ronde++) {
    const { exemplaren, gegevens } = useProjectStore.getState();
    const scope = projectScope(gegevens);
    const verzoeken: ToetsVerzoek[] = [];
    for (const ex of exemplaren) {
      if ((ids && !ids.includes(ex.id)) || !HEEFT_FEM_BLOK.test(ex.source)) continue;
      // Het blad zelf, en zijn varianten als die op papier komen (docs/varianten.md).
      const vs = ex.varianten;
      const invoeren = [ex.waarden, ...(vs?.opPapier ? vs.lijst.map((v) => variantInvoer(ex.waarden, v, vs.velden)) : [])];
      for (const waarden of invoeren) {
        try {
          // Met de waarden uit andere bladen (#1.R_paal), net als in de werkruimte en op papier:
          // anders geeft een veld dat er een gebruikt een fout, en gaat er geen verzoek uit.
          const metRefs = scopeMetVerwijzingen(
            ex.source, waarden, scope, verwezenBladen(ex.source, waarden, exemplaren),
            { includes: rekentaalIncludes, imageUrls: rekentaalImageUrls }, metToetsingen({}, "lezen"),
          );
          const { nodes } = rekenDoor(ex.source, waarden, metRefs, ex.naam, "vragen");
          legToetsingenVast(ex.id, toetsHashes(nodes));
          verzoeken.push(...verzamelVerzoeken(nodes));
        } catch {
          // Een blad dat niet doorrekent, heeft geen verzoeken; de afdruk toont de fout.
        }
      }
    }
    const rest = tot - Date.now();
    if (!verzoeken.length || rest <= 0) return;
    let klok: ReturnType<typeof setTimeout> | undefined;
    const opTijd = await Promise.race([
      vraagToetsingen(verzoeken).then(() => true),
      new Promise<boolean>((klaar) => {
        klok = setTimeout(() => klaar(false), rest);
      }),
    ]);
    clearTimeout(klok);
    if (!opTijd) return;
  }
}

/** De versie van de antwoorden: verandert bij elk nieuw antwoord en elke wijziging in de vastgelegde. */
export function useToetsVersie(): number {
  return useSyncExternalStore(abonneerToetsingen, toetsVersie);
}
