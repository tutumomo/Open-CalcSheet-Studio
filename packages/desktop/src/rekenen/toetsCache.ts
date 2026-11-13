/**
 * De antwoorden van Open FEM Studio op `@toets`-blokken, op de hash van hun invoer
 * (packages/core/src/toetsBlok.ts).
 *
 * Twee bronnen:
 *   - **vastgelegd**: de antwoorden in de bladen van het project (`Exemplaar.toetsingen`).
 *     De store zet ze hier bij elke wijziging (store/projectStore.ts, zetVastgelegd).
 *   - **deze sessie**: wat FEM Studio antwoordde sinds het project open is, ook een fout.
 *     Een ander project openen wist ze (wisSessie): een antwoord uit een ander project
 *     mag een vastgelegd antwoord niet vanzelf vervangen.
 *
 * Een hash hoort bij de invoer, niet bij een blad: twee bladen met dezelfde invoer delen
 * hun antwoord. Een antwoord uit deze sessie gaat voor, want dat komt er alleen als er geen
 * vastgelegd antwoord was, of na "opnieuw toetsen". Een fout gaat niet voor een
 * vastgelegd antwoord: dat blijft staan, met de fout als waarschuwing.
 *
 * Zuiver, zonder React of Tauri: de rekenworker en de API (mcp/rekenen.ts) laden dit
 * ook. Het vragen zelf, en het vastleggen bij een blad, staan in femToetsing.ts.
 */
import {
  alsAntwoord,
  type EvalOpties,
  type EvaluatedNode,
  type ToetsAntwoord,
  type ToetsVerzoek,
  type VastgelegdeToets,
} from "@ifc-calc/core";

type Toetsingen = Record<string, VastgelegdeToets>;

const sessie = new Map<string, ToetsAntwoord>();
/** De antwoorden van deze sessie zoals ze bij een blad vastgelegd worden; alleen wat lukte. */
const sessieVast = new Map<string, VastgelegdeToets>();
let vastgelegd = new Map<string, VastgelegdeToets>();
let vastgelegdUit: readonly Toetsingen[] = [];
/** Blokken die opnieuw getoetst worden: tot het nieuwe antwoord er is, wachten ze. */
const opnieuw = new Set<string>();
let fem: EvalOpties["fem"];
let versie = 0;
const luisteraars = new Set<() => void>();

function meld() {
  versie++;
  for (const l of luisteraars) l();
}

/** Alle antwoorden, voor `EvalOpties.toetsingen`. */
export function toetsingenNu(): Record<string, ToetsAntwoord> {
  const uit: Record<string, ToetsAntwoord> = {};
  for (const [hash, v] of vastgelegd) uit[hash] = alsAntwoord(v);
  for (const [hash, a] of sessie) {
    const vorig = uit[hash];
    uit[hash] = a.ok || !vorig?.ok ? a : { ...vorig, waarschuwing: a.melding };
  }
  for (const hash of opnieuw) delete uit[hash];
  return uit;
}

/** Telt op bij elke wijziging: een doorrekening met een oudere versie is verouderd. */
export function toetsVersie(): number {
  return versie;
}

/** Of deze sessie al een antwoord heeft; dan gaat het verzoek niet nog eens. */
export function heeftToetsAntwoord(hash: string): boolean {
  return sessie.has(hash) && !opnieuw.has(hash);
}

/** Een antwoord van FEM Studio. `vast`: wat bij het blad vastgelegd wordt, alleen als het lukte. */
export function zetToetsAntwoord(hash: string, antwoord: ToetsAntwoord, vast?: VastgelegdeToets): void {
  sessie.set(hash, antwoord);
  if (vast) sessieVast.set(hash, vast);
  opnieuw.delete(hash);
  meld();
}

/** "Opnieuw toetsen": het blok vergeet zijn antwoord en vraagt het opnieuw. */
export function zetOpnieuw(hash: string): void {
  opnieuw.add(hash);
  meld();
}

/**
 * De vastgelegde antwoorden van alle bladen. Verandert er niets (dezelfde objecten),
 * dan blijft de versie gelijk: typen in een blad rekent zo niets extra. Ook niet als
 * alleen een antwoord van deze sessie bij een blad is vastgelegd: dat gold al, en een
 * nieuwe versie zou elke tabel met varianten opnieuw laten rekenen.
 */
export function zetVastgelegd(lijsten: readonly (Toetsingen | undefined)[]): void {
  const nieuw = lijsten.filter((t): t is Toetsingen => !!t);
  if (nieuw.length === vastgelegdUit.length && nieuw.every((t, i) => t === vastgelegdUit[i])) return;
  vastgelegdUit = nieuw;
  const kaart = new Map<string, VastgelegdeToets>();
  for (const t of nieuw) {
    for (const [hash, v] of Object.entries(t)) {
      const al = kaart.get(hash);
      if (!al || v.datum > al.datum) kaart.set(hash, v);
    }
  }
  // Telt het verschil? Niet voor een blok waarvoor de sessie een geldig antwoord heeft:
  // dat antwoord gaat voor (toetsingenNu).
  const telt = (hash: string) => kaart.get(hash) !== vastgelegd.get(hash) && !sessie.get(hash)?.ok;
  const veranderd = [...kaart.keys(), ...vastgelegd.keys()].some(telt);
  vastgelegd = kaart;
  if (veranderd) meld();
}

/** Een ander project: de antwoorden van deze sessie gelden daar niet vanzelf. */
export function wisSessie(): void {
  if (!sessie.size && !opnieuw.size) return;
  sessie.clear();
  sessieVast.clear();
  opnieuw.clear();
  meld();
}

/** De FEM Studio van nu, voor de melding "opnieuw toetsen" (EvalOpties.fem). */
export function zetFem(nu: EvalOpties["fem"]): void {
  fem = nu;
  meld();
}

/**
 * Wat er bij een blad vastgelegd moet worden, voor de blokken met deze hashes: een
 * antwoord uit deze sessie dat het blad nog niet heeft, of het antwoord van een ander
 * blad met dezelfde invoer. Niets nieuws: null.
 */
export function nieuwVastTeLeggen(huidig: Toetsingen | undefined, hashes: readonly string[]): Toetsingen | null {
  let bij: Toetsingen | null = null;
  for (const hash of hashes) {
    if (opnieuw.has(hash)) continue;
    const eigen = huidig?.[hash];
    const kandidaat = sessieVast.get(hash) ?? (eigen ? undefined : vastgelegd.get(hash));
    if (kandidaat && kandidaat !== eigen) (bij ??= {})[hash] = kandidaat;
  }
  return bij;
}

export function abonneerToetsingen(l: () => void): () => void {
  luisteraars.add(l);
  return () => {
    luisteraars.delete(l);
  };
}

/**
 * De opties met de antwoorden erbij. `vragen` alleen in de werkruimte en vóór het
 * afdrukken: daar gaat een verzoek naar FEM Studio en staat de knop "opnieuw toetsen".
 * Elders (afdruk, rapport, API) staat een blok zonder antwoord als niet getoetst.
 */
export function metToetsingen(opties: EvalOpties, modus: "vragen" | "lezen", taal?: string): EvalOpties {
  return {
    ...opties,
    toetsingen: toetsingenNu(),
    toetsModus: modus,
    ...(modus === "vragen" && fem ? { fem } : {}),
    ...(taal ? { taal } : {}),
  };
}

/**
 * Staat er in de rekentekst een blok dat FEM Studio iets vraagt (`@toets`, `@fem` of
 * `@kern`)? Zonder zo'n blok hangt een blad niet van de antwoorden af.
 */
export const HEEFT_FEM_BLOK = /^\s*@(toets|fem|kern)\b/m;

/**
 * Elk blok dat FEM Studio iets vraagt: een `@toets`- of `@kern`-blok (één verzoek, één
 * hash; bij een `@kern`-blok met `per` zit de hele reeks in dat ene verzoek) of een
 * `@fem`-blok (een verzoek en een hash per belastinggeval). Zonder hash: een fout in het blok.
 */
function elkeToets(nodes: readonly EvaluatedNode[], doe: (verzoeken: ToetsVerzoek[], hashes: string[]) => void) {
  for (const n of nodes) {
    if (n.type === "toets" || n.type === "kern") doe(n.verzoek ? [n.verzoek] : [], n.hash ? [n.hash] : []);
    else if (n.type === "fem") doe(n.verzoeken ?? [], n.hashes ?? []);
    const kinderen = (n as { children?: EvaluatedNode[] }).children;
    if (Array.isArray(kinderen)) elkeToets(kinderen, doe);
  }
}

/** De verzoeken in een doorgerekend blad, ook in de takken van een `#if`. */
export function verzamelVerzoeken(nodes: readonly EvaluatedNode[]): ToetsVerzoek[] {
  const uit: ToetsVerzoek[] = [];
  elkeToets(nodes, (verzoeken) => {
    uit.push(...verzoeken);
  });
  return uit;
}

/** De hashes van alle blokken in een doorgerekend blad, met of zonder antwoord. */
export function toetsHashes(nodes: readonly EvaluatedNode[]): string[] {
  const uit: string[] = [];
  elkeToets(nodes, (_, hashes) => {
    uit.push(...hashes);
  });
  return uit;
}

/**
 * Alleen de vastgelegde antwoorden die het doorgerekende blad nog gebruikt: bij het
 * opslaan valt de rest weg. Een blok zonder hash (een fout in een veld) kan bij elk
 * antwoord horen; dan blijven ze allemaal staan, net als zonder doorgerekend blad.
 * `ook`: de hashes die de varianten van het blad gebruiken (rekenen/varianten.ts).
 */
export function gebruikteToetsingen(
  toetsingen: Toetsingen | undefined,
  blad: { nodes: readonly EvaluatedNode[]; fout?: string } | undefined,
  ook: readonly string[] = [],
): Toetsingen | undefined {
  if (!toetsingen || !blad || blad.fout) return toetsingen;
  const gebruikt = new Set<string>(ook);
  let zonderHash = false;
  elkeToets(blad.nodes, (_, hashes) => {
    for (const h of hashes) gebruikt.add(h);
    if (!hashes.length) zonderHash = true;
  });
  if (zonderHash) return toetsingen;
  const uit = Object.fromEntries(Object.entries(toetsingen).filter(([hash]) => gebruikt.has(hash)));
  return Object.keys(uit).length ? uit : undefined;
}
