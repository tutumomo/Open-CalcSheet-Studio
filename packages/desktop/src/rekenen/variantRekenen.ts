/**
 * Varianten doorrekenen in de app: een eigen worker (variantWorker.ts) met een
 * wachtrij, en de uitkomsten op sleutel bewaard (docs/varianten.md).
 *
 * De tabel vraagt bij elke wijziging om de uitkomst van elke kolom. Gelijke verzoeken
 * hebben dezelfde sleutel; wat al uitgerekend is, komt uit de bewaarde uitkomsten, zodat
 * alleen de variant die veranderde opnieuw rekent. Wat de tabel van een blad niet meer
 * vraagt en nog wacht, vervalt. Optimaliseren (`rekenEenmalig`) gebruikt dezelfde rij,
 * maar zijn verzoeken vervallen niet.
 *
 * Een `@toets`-blok werkt zoals in de werkruimte: de worker geeft de verzoeken terug,
 * `vraagToetsingen` stuurt ze één keer naar FEM Studio, een nieuw antwoord verhoogt de
 * toetsversie (die in de sleutel zit) en de antwoorden worden bij het blad vastgelegd.
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import i18next from "i18next";
import type { EvalOpties } from "@ifc-calc/core";
import { useProjectStore, type Exemplaar } from "../store/projectStore";
import { evalOptiesVan } from "../store/projectEenheden";
import { projectScope, type ProjectGegevens } from "../store/projectGegevens";
import { variantInvoer } from "../store/varianten";
import { rekentaalIncludes, rekentaalImageUrls } from "../templates/rekentaal-includes";
import { useDebouncedValue } from "../hooks/useDebouncedValue";
import { verwezenBladen, type VerwijsBlad } from "./verwijzingen";
import { metToetsingen, toetsingenNu, toetsVersie } from "./toetsCache";
import { kenFemStudio, legToetsingenVast, useToetsVersie, vraagToetsingen } from "./femToetsing";
import { hoekmodusNu } from "./doorrekening";
import { toetsDeel, type VariantUitkomst } from "./varianten";

export interface VariantVerzoek {
  sleutel: string;
  source: string;
  waarden: Record<string, string>;
  scope: Record<string, unknown>;
  naam: string;
  hoekmodus: string;
  /** Met de antwoorden van FEM Studio erin: de worker heeft geen eigen cache. */
  evalOpties?: EvalOpties;
  includes: [string, string][];
  imageUrls: [string, string][];
  verwijzingen?: VerwijsBlad[];
}

export interface VariantAntwoord {
  sleutel: string;
  uitkomst: VariantUitkomst | null;
  /** Het blad rekende helemaal niet door. */
  fout?: string;
}

/** Wat een kolom van de tabel toont. `uitkomst` ontbreekt: nog nooit doorgerekend. */
export interface Kolom {
  uitkomst?: VariantUitkomst | null;
  fout?: string;
  /** Er komt een nieuwere uitkomst; tot dan staat de vorige er. */
  bezig: boolean;
}

/** De sleutel van de kolom met het blad zelf. */
export const BLAD = "";

const BEWAARD = 300;
const bewaard = new Map<string, VariantAntwoord>();
interface InRij {
  v: VariantVerzoek;
  blad: string;
  /** Vervalt niet als de tabel hem niet meer vraagt (optimaliseren). */
  vast: boolean;
}
let wachtrij: InRij[] = [];
let bezig: InRij | null = null;
const wachters = new Map<string, ((a: VariantAntwoord) => void)[]>();
let worker: Worker | null = null;
let versie = 0;
const luisteraars = new Set<() => void>();

function meld() {
  versie++;
  for (const l of luisteraars) l();
}

function abonneer(l: () => void) {
  luisteraars.add(l);
  return () => {
    luisteraars.delete(l);
  };
}

function deWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./variantWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<VariantAntwoord>) => klaar(e.data);
    // Valt de worker zelf om, dan krijgt het verzoek van nu een fout in plaats van geen
    // antwoord: anders wacht optimaliseren eeuwig. Een nieuwe worker neemt het daarna over.
    worker.onerror = (e: ErrorEvent) => {
      e.preventDefault();
      worker?.terminate();
      worker = null;
      if (bezig) klaar({ sleutel: bezig.v.sleutel, uitkomst: null, fout: e.message || "worker" });
    };
  }
  return worker;
}

function klaar(a: VariantAntwoord) {
  const was = bezig;
  bezig = null;
  bewaard.set(a.sleutel, a);
  while (bewaard.size > BEWAARD) bewaard.delete(bewaard.keys().next().value!);
  for (const w of wachters.get(a.sleutel) ?? []) w(a);
  wachters.delete(a.sleutel);
  if (a.uitkomst?.verzoeken.length) void vraagToetsingen(a.uitkomst.verzoeken);
  pomp();
  meld();
  // Na het tonen: de antwoorden bij het blad vastleggen, net als de werkruimte.
  if (was && a.uitkomst?.toetsen.length) {
    kenFemStudio();
    legToetsingenVast(was.blad, a.uitkomst.toetsen);
  }
}

function pomp() {
  if (bezig || !wachtrij.length) return;
  bezig = wachtrij.shift()!;
  deWorker().postMessage(bezig.v);
}

function zetInRij(lijst: readonly VariantVerzoek[], blad: string, vast: boolean) {
  for (const v of lijst) {
    if (bewaard.has(v.sleutel) || bezig?.v.sleutel === v.sleutel) continue;
    const al = wachtrij.find((r) => r.v.sleutel === v.sleutel);
    if (al) al.vast ||= vast;
    else wachtrij.push({ v, blad, vast });
  }
  pomp();
}

/** De tabel van een blad vraagt deze kolommen: wat er van dat blad nog wacht en niet meer gevraagd wordt, vervalt. */
function vraagVoorTabel(blad: string, lijst: readonly VariantVerzoek[]) {
  const nodig = new Set(lijst.map((v) => v.sleutel));
  wachtrij = wachtrij.filter((r) => r.vast || r.blad !== blad || nodig.has(r.v.sleutel));
  zetInRij(lijst, blad, false);
}

function vraagEen(v: VariantVerzoek, blad: string): Promise<VariantAntwoord> {
  const al = bewaard.get(v.sleutel);
  if (al) return Promise.resolve(al);
  return new Promise((ok) => {
    wachters.set(v.sleutel, [...(wachters.get(v.sleutel) ?? []), ok]);
    zetInRij([v], blad, true);
  });
}

interface Omgeving {
  gegevens: ProjectGegevens;
  exemplaren: readonly Exemplaar[];
  taal: string;
}

/**
 * Het verzoek voor één kolom: het blad met deze invoer. `toets` is het deel van de
 * sleutel dat van de antwoorden van FEM Studio afhangt (`toetsDeel`): zo rekent bij een
 * nieuw antwoord alleen de kolom opnieuw die het gebruikt.
 */
function verzoekVoor(ex: Exemplaar, waarden: Record<string, string>, omg: Omgeving, toets: string): VariantVerzoek {
  const basis = evalOptiesVan(omg.gegevens);
  const scope = projectScope(omg.gegevens);
  const verwijzingen = verwezenBladen(ex.source, waarden, omg.exemplaren);
  const hoek = hoekmodusNu();
  const sleutel = [
    hoek, omg.taal, JSON.stringify(basis), toets, ex.naam, JSON.stringify(scope),
    JSON.stringify(waarden), ex.source, verwijzingen.length ? JSON.stringify(verwijzingen) : "",
  ].join("\u0000");
  return {
    sleutel,
    source: ex.source,
    waarden,
    scope,
    naam: ex.naam,
    hoekmodus: hoek,
    evalOpties: metToetsingen(basis, "vragen", omg.taal),
    includes: [...rekentaalIncludes],
    imageUrls: [...rekentaalImageUrls],
    ...(verwijzingen.length ? { verwijzingen } : {}),
  };
}

export interface VariantenUitkomst {
  blad: Kolom;
  perVariant: Map<string, Kolom>;
  klaar: number;
  totaal: number;
}

/**
 * De uitkomsten van het blad en zijn varianten, voor de tabel. Rekent vanzelf bij
 * elke wijziging, met een korte wachttijd tijdens het typen. Tot een nieuwe uitkomst
 * er is, blijft de vorige van die kolom staan.
 */
export function useVariantUitkomsten(ex: Exemplaar): VariantenUitkomst {
  const gegevens = useProjectStore((s) => s.gegevens);
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const toetsV = useToetsVersie();
  const taal = i18next.language ?? "";
  const stil = useDebouncedValue(ex, 250);
  const vorige = useRef(new Map<string, VariantAntwoord>());
  const verzoeken = useMemo(() => {
    const omg = { gegevens, exemplaren, taal };
    const vs = stil.varianten;
    // Alleen bij een blad met @toets: per kolom de antwoorden die zijn vorige uitkomst gebruikte.
    const antwoorden = /^\s*@toets\b/m.test(stil.source) ? toetsingenNu() : {};
    const toets = (id: string) => toetsDeel(stil.source, vorige.current.get(id)?.uitkomst?.toetsen, antwoorden);
    return [
      { id: BLAD, v: verzoekVoor(stil, stil.waarden, omg, toets(BLAD)) },
      ...(vs?.lijst ?? []).map((v) => ({ id: v.id, v: verzoekVoor(stil, variantInvoer(stil.waarden, v, vs!.velden), omg, toets(v.id)) })),
    ];
    // toetsV: een nieuw antwoord van FEM Studio; welke kolom opnieuw rekent, beslist toetsDeel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stil, gegevens, exemplaren, taal, toetsV]);
  useEffect(() => {
    if (stil.source.trim()) vraagVoorTabel(stil.id, verzoeken.map((x) => x.v));
  }, [verzoeken, stil]);
  useSyncExternalStore(abonneer, () => versie);

  const perVariant = new Map<string, Kolom>();
  let klaar = 0;
  // De kolommen van nu: ook een variant die net is toegevoegd en nog in de wachttijd zit.
  const ids = [BLAD, ...(ex.varianten?.lijst ?? []).map((v) => v.id)];
  for (const id of ids) {
    const sleutel = verzoeken.find((x) => x.id === id)?.v.sleutel;
    const a = sleutel ? bewaard.get(sleutel) : undefined;
    if (a) vorige.current.set(id, a);
    const toon = a ?? vorige.current.get(id);
    const kolom: Kolom = { bezig: !a, ...(toon ? { uitkomst: toon.uitkomst } : {}), ...(toon?.fout ? { fout: toon.fout } : {}) };
    if (a) klaar++;
    perVariant.set(id, kolom);
  }
  const blad = perVariant.get(BLAD)!;
  perVariant.delete(BLAD);
  return { blad, perVariant, klaar, totaal: ids.length };
}

const MAX_RONDES = 10;

/**
 * Het blad met deze invoer, voor optimaliseren: via dezelfde rij, en met de antwoorden
 * van FEM Studio. Een `@toets`-blok zonder antwoord wacht op FEM Studio en rekent dan
 * opnieuw, hoogstens tien rondes. Het blad weg of niet door te rekenen: null.
 */
export async function rekenEenmalig(exId: string, waarden: Record<string, string>): Promise<VariantUitkomst | null> {
  for (let ronde = 0; ronde < MAX_RONDES; ronde++) {
    const { exemplaren, gegevens } = useProjectStore.getState();
    const ex = exemplaren.find((e) => e.id === exId);
    if (!ex) return null;
    const omg = { gegevens, exemplaren, taal: i18next.language ?? "" };
    // Eén verzoek per ronde: na een antwoord van FEM Studio een nieuwe ronde.
    const a = await vraagEen(verzoekVoor(ex, waarden, omg, `t${toetsVersie()}`), ex.id);
    if (!a.uitkomst?.verzoeken.length) return a.uitkomst;
    await vraagToetsingen(a.uitkomst.verzoeken);
  }
  return null;
}
