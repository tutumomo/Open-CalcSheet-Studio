/**
 * Varianten doorrekenen en optimaliseren (docs/varianten.md).
 *
 * Een variant rekent langs dezelfde route als het blad zelf op papier en in de API
 * (mcp/rekenen.ts `rekenDoor`): dezelfde includes, de projectgegevens als scope, eerst
 * de bladen waarnaar verwezen wordt (`#1.R_paal`), en de uitkomst gelezen met
 * `leesResultaat` en `leesGetallen`. Er komt geen html uit: de tabel heeft alleen de
 * uitkomst nodig. De app rekent dit in een eigen worker (rekenen/variantWorker.ts).
 *
 * Optimaliseren zoekt per variant de kleinste waarde van één veld waarmee het blad
 * voldoet. Elke waarde die het kiest, is echt doorgerekend: er wordt niets
 * geïnterpoleerd, en een blad dat geen oordeel geeft, levert geen waarde op.
 *
 * Zuiver, zonder React of stores: scripts/check-varianten.mjs laadt dit in Node.
 */
import { evaluate, parse, type EvalOpties, type EvaluatedNode, type ParseOptions, type ToetsAntwoord, type ToetsVerzoek } from "@ifc-calc/core";
import { rekentaalIncludes, rekentaalImageUrls } from "../templates/rekentaal-includes.ts";
import { leesGetallen, leesResultaat, metRefNamen, type Resultaat } from "../components/calc/bladLezen.ts";
import type { Invoerveld } from "../components/calc/bladVersie.ts";
import { rekenEenhedenDoor } from "../components/calc/canvasRekenen.ts";
import { heeftEenheden } from "../store/canvasBlad.ts";
import { reeksWaarden, variantInvoer, type Variant, type Varianten, type Zoekopdracht } from "../store/varianten.ts";
import { metToetsingen, toetsHashes, verzamelVerzoeken } from "./toetsCache.ts";
import { scopeMetVerwijzingen, type VerwijsBlad } from "./verwijzingen.ts";

/** Wat de tabel van één kolom laat zien. */
export interface VariantUitkomst {
  resultaat: Resultaat;
  /** Elke zichtbare uitkomst op naam, in de eenheid van het blad. */
  getallen: Record<string, number>;
  /** Elke zichtbare uitkomst zoals de uitwerking hem toont, met eenheid. */
  teksten: Record<string, string>;
  /** De invoervelden die in deze variant meedoen: niet in een tak van `#if` die niet gekozen is. */
  actief: string[];
  /** De `@toets`-blokken zonder antwoord; alleen in de modus vragen. */
  verzoeken: ToetsVerzoek[];
  /** De hashes van alle `@toets`-blokken, met of zonder antwoord. */
  toetsen: string[];
  /** De eerste regel met een fout; het blad rekent daarna wel verder, maar de uitkomst is niet te vertrouwen. */
  fout?: string;
}

export interface VariantOpties {
  evalOpties?: EvalOpties;
  parseOpties?: ParseOptions;
  /** De bladen waarnaar de tekst of de invoer verwijst (`verwezenBladen`). */
  verwijzingen?: readonly VerwijsBlad[];
  toetsModus?: "vragen" | "lezen";
  /** De taal van de uitvoer van een `@toets`-blok. */
  taal?: string;
}

function* knopen(lijst: readonly EvaluatedNode[]): Generator<EvaluatedNode> {
  for (const n of lijst) {
    yield n;
    if (n.type === "conditional-branch") yield* knopen(n.children);
  }
}

/** De invoervelden en de getoonde uitkomsten in een doorgerekend blad. */
function leesKnopen(nodes: readonly EvaluatedNode[]): { actief: string[]; teksten: Record<string, string>; fout?: string } {
  const actief = new Set<string>();
  const teksten: Record<string, string> = {};
  let fout: string | undefined;
  for (const n of knopen(nodes)) {
    if (n.type === "input-prompt" || n.type === "select") actief.add(n.name);
    if (n.type === "assignment" || n.type === "var-display") {
      if (fout === undefined && String(n.result).startsWith("Error")) fout = String(n.result);
      const getoond = n.inStelsel ?? n;
      teksten[n.name] = String(getoond.result);
    }
  }
  return { actief: [...actief], teksten, ...(fout !== undefined ? { fout } : {}) };
}

/**
 * Rekent een tekst door met de invoer van een variant. Een regel met een fout staat in
 * `fout`; werpt alleen als het blad helemaal niet doorrekent, net als `rekenDoor`.
 */
export function rekenVariant(
  source: string,
  waarden: Record<string, string>,
  scope: Record<string, unknown>,
  naam: string,
  opties: VariantOpties = {},
): VariantUitkomst {
  const parseOpties = opties.parseOpties ?? { includes: rekentaalIncludes, imageUrls: rekentaalImageUrls };
  // Opties met een toetsmodus hebben hun antwoorden al bij zich: zo rekent de worker, die
  // geen eigen cache heeft (variantRekenen.ts). Anders de antwoorden van deze cache.
  const evalOpties = opties.evalOpties?.toetsModus
    ? opties.evalOpties
    : metToetsingen(opties.evalOpties ?? {}, opties.toetsModus ?? "lezen", opties.taal);
  const metRefs = opties.verwijzingen?.length
    ? scopeMetVerwijzingen(source, waarden, scope, opties.verwijzingen, parseOpties, evalOpties)
    : scope;
  // Een canvas-blad langs dezelfde route als op het scherm: per eenheid.
  const nodes = heeftEenheden(source)
    ? rekenEenhedenDoor(source, waarden, metRefs, parseOpties, evalOpties).flatMap((u) => u.nodes)
    : evaluate(parse(source, parseOpties), waarden, metRefs, evalOpties);
  return {
    resultaat: leesResultaat(nodes, naam),
    getallen: metRefNamen(leesGetallen(nodes), source),
    ...leesKnopen(nodes),
    verzoeken: verzamelVerzoeken(nodes),
    toetsen: toetsHashes(nodes),
  };
}

/**
 * Het oordeel van een kolom, voor het scherm en papier. Een regel met een fout is nooit
 * "voldoet": de uitkomst is dan niet te vertrouwen, en de veilige kant is niet getoetst.
 */
export function oordeelVan(u: Pick<VariantUitkomst, "resultaat" | "fout"> | null | undefined): "voldoet" | "voldoetNiet" | "nietGetoetst" | "geen" {
  const r = u?.resultaat;
  if (!r) return "geen";
  if (r.nietGetoetst) return "nietGetoetst";
  if (r.voldoet === true) return u.fout ? "nietGetoetst" : "voldoet";
  if (r.voldoet === false) return "voldoetNiet";
  return "geen";
}

/**
 * Voldoet een uitkomst bij deze grens? Alleen als het blad zelf "voldoet" zegt en
 * niet "niet getoetst", en de maatgevende UC hoogstens de grens is. Geeft het blad
 * geen UC, dan alleen bij een grens van 1 of hoger: een strengere grens is dan niet
 * te controleren.
 */
export function voldoetAan(r: Pick<Resultaat, "uc" | "voldoet" | "nietGetoetst">, grens: number): boolean {
  if (r.voldoet !== true || r.nietGetoetst) return false;
  return r.uc === null ? grens >= 1 : r.uc <= grens;
}

const getal = (t: string | undefined) => (t === undefined ? NaN : Number(t.trim().replace(",", ".")));

/**
 * De waarden die optimaliseren probeert, van klein naar groot. Bij een getal de reeks
 * van–tot–stap in de eenheid van het veld; bij een keuzelijst de keuzes van `van`
 * tot en met `tot` in de volgorde van het blad. Geen bruikbaar bereik: niets.
 */
export function kandidaten(veld: Invoerveld, zoek: Pick<Zoekopdracht, "van" | "tot" | "stap">): string[] {
  if (veld.soort === "keuze") {
    const i = veld.keuzes.findIndex((k) => k.value === zoek.van);
    const j = veld.keuzes.findIndex((k) => k.value === zoek.tot);
    if (i < 0 || j < 0) return [];
    return veld.keuzes.slice(Math.min(i, j), Math.max(i, j) + 1).map((k) => k.value);
  }
  const [van, tot] = [getal(zoek.van), getal(zoek.tot)];
  return reeksWaarden(Math.min(van, tot), Math.max(van, tot), getal(zoek.stap)).map(String);
}

export type ZoekUitkomst = { waarde: string } | { geen: true } | { afgebroken: true };

/**
 * De kleinste kandidaat waarmee het blad voldoet: de kandidaten op volgorde, en
 * stoppen bij de eerste die `voldoetAan`. `beoordeel` rekent het blad door met die
 * waarde; `null` (een fout) telt als niet voldoen. `afbreken` wordt vóór elke poging
 * gevraagd.
 */
export async function zoekKleinste(
  lijst: readonly string[],
  beoordeel: (waarde: string) => Promise<Resultaat | null>,
  grens: number,
  afbreken: () => boolean = () => false,
): Promise<ZoekUitkomst> {
  for (const waarde of lijst) {
    if (afbreken()) return { afgebroken: true };
    const r = await beoordeel(waarde);
    if (r && voldoetAan(r, grens)) return { waarde };
  }
  return { geen: true };
}

/** Twee invoerwaarden zijn gelijk als de tekst gelijk is, of als het hetzelfde getal is (3,0 en 3). */
function zelfdeInvoer(a: string, b: string): boolean {
  if (a.trim() === b.trim()) return true;
  const [x, y] = [getal(a), getal(b)];
  return Number.isFinite(x) && Number.isFinite(y) && x === y;
}

/** Een tabel op papier: `null` is de kolom met het blad, `rijen` zijn veldnamen. */
export interface PapierTabel {
  kolommen: (Variant | null)[];
  rijen: string[];
}

/**
 * De tabellen voor op papier: beknopt, met alleen de velden waarin minstens één variant
 * van het blad verschilt, in de volgorde van de tabel op het scherm. Elke tabel begint
 * met de kolom Blad, gevolgd door hoogstens `perTabel` varianten. Een veld dat het blad
 * niet (meer) heeft, valt weg.
 */
export function papierTabellen(
  velden: readonly Invoerveld[],
  vs: Varianten,
  blad: Record<string, string>,
  perTabel: number,
): PapierTabel[] {
  if (vs.lijst.length === 0) return [];
  const rijen = vs.velden.filter((naam) => {
    const veld = velden.find((v) => v.naam === naam);
    if (!veld) return false;
    const vanBlad = blad[naam] !== undefined && blad[naam].trim() !== "" ? blad[naam] : veld.beginwaarde;
    return vs.lijst.some((v) => {
      const eigen = v.waarden[naam];
      return eigen !== undefined && eigen.trim() !== "" && !zelfdeInvoer(eigen, vanBlad);
    });
  });
  const uit: PapierTabel[] = [];
  for (let i = 0; i < vs.lijst.length; i += Math.max(1, perTabel)) {
    uit.push({ kolommen: [null, ...vs.lijst.slice(i, i + Math.max(1, perTabel))], rijen });
  }
  return uit;
}

/**
 * Het deel van de sleutel van een kolom dat van de antwoorden van FEM Studio afhangt:
 * alleen de antwoorden voor de blokken die de vorige uitkomst van die kolom had
 * (`hashes`). Zo rekent bij een nieuw antwoord alleen de kolom opnieuw die het gebruikt,
 * niet de hele tabel. Zonder `@toets` in de tekst leeg; nog niet doorgerekend: "?".
 */
export function toetsDeel(source: string, hashes: readonly string[] | undefined, antwoorden: Record<string, ToetsAntwoord>): string {
  if (!/^\s*@toets\b/m.test(source)) return "";
  if (!hashes) return "?";
  return JSON.stringify(hashes.map((h) => {
    const a = antwoorden[h];
    return [h, !a ? "-" : a.ok ? `${a.datum ?? "ok"}${a.waarschuwing ? "!" : ""}` : `x${a.melding}`];
  }));
}

/**
 * De hashes van de `@toets`-blokken die de varianten van een blad gebruiken, voor
 * het opslaan (`gebruikteToetsingen`): zonder vallen hun vastgelegde antwoorden weg.
 * Alleen bij een blad met een `@toets`-blok en varianten; een variant die niet
 * doorrekent, levert niets.
 */
export function variantToetsHashes(
  ex: { source: string; waarden: Record<string, string>; varianten?: Varianten },
  scope: Record<string, unknown>,
): string[] {
  if (!ex.varianten?.lijst.length || !/^\s*@toets\b/m.test(ex.source)) return [];
  const uit = new Set<string>();
  for (const v of ex.varianten.lijst) {
    try {
      const invoer = variantInvoer(ex.waarden, v, ex.varianten.velden);
      for (const h of rekenVariant(ex.source, invoer, scope, "", { toetsModus: "lezen" }).toetsen) uit.add(h);
    } catch {
      // Een variant die niet doorrekent, heeft geen blokken om te bewaren.
    }
  }
  return [...uit];
}
