/**
 * Doorrekenen van het blad dat openstaat, in een worker in plaats van op de
 * UI-thread.
 *
 * De uitwerking en het parametrische beeld vragen allebei om de doorrekening
 * van hetzelfde blad met dezelfde invoer. Ze delen één berekening: gelijke
 * verzoeken hebben dezelfde sleutel. De worker rekent er één tegelijk; komen
 * er tijdens het rekenen nieuwe binnen (typen, lintknoppen), dan telt alleen
 * de laatste. Tot de nieuwe uitkomst er is, blijft de vorige van hetzelfde
 * blad staan, zodat het beeld niet leeg flitst.
 *
 * De afdruk rekent niet via dit pad: daar moet elk blad klaar zijn voordat er
 * papier uit komt (bladResultaat.ts, bladDoorrekenen.ts).
 */
import { useEffect, useMemo, useRef, useSyncExternalStore } from "react";
import i18next from "i18next";
import { setAngleMode, type AngleMode, type EvalOpties, type ToetsVerzoek } from "@ifc-calc/core";
import { useProjectStore } from "../store/projectStore";
import { evalOptiesVan } from "../store/projectEenheden";
import type { BladUitkomst, Resultaat } from "../components/calc/bladLezen";
import type { CanvasUitwerking } from "../components/calc/canvasRekenen";
import { rekentaalIncludes, rekentaalImageUrls } from "../templates/rekentaal-includes";
import { verwezenBladen, type VerwijsBlad } from "./verwijzingen";
import { metToetsingen } from "./toetsCache";
import { kenFemStudio, legToetsingenVast, useToetsVersie, vraagToetsingen } from "./femToetsing";

export interface RekenVerzoek {
  sleutel: string;
  /** Het id van het blad: daar worden de antwoorden van FEM Studio vastgelegd. */
  blad?: string;
  source: string;
  waarden: Record<string, string>;
  scope: Record<string, unknown>;
  naam: string;
  hoekmodus: string;
  /** De taal van de uitvoer: de taal van de app (templates/vertalingen.ts). */
  taal?: string;
  /** Het eenhedenstelsel en de eigen eenheden van het project (store/projectEenheden.ts). */
  evalOpties?: EvalOpties;
  includes: [string, string][];
  imageUrls: [string, string][];
  /** De bladen waarnaar dit blad verwijst (#1.R_paal), om eerst door te rekenen (verwijzingen.ts). */
  verwijzingen?: VerwijsBlad[];
}

export interface RekenAntwoord {
  sleutel: string;
  html: string;
  /** Bij een canvas-blad: de uitwerking per eenheid (components/calc/canvasRekenen.ts). */
  eenheden?: CanvasUitwerking[];
  /** De @toets-blokken zonder antwoord (toetsBlok.ts); gaan naar FEM Studio. */
  verzoeken?: ToetsVerzoek[];
  /** De hashes van alle @toets-blokken, met of zonder antwoord. */
  toetsen?: string[];
  uitkomst: BladUitkomst | null;
}

export interface Doorrekening {
  html: string;
  eenheden?: CanvasUitwerking[];
  uitkomst: BladUitkomst | null;
}

/** Zoveel uitkomsten blijven bewaard, voor heen en weer wisselen tussen bladen. */
const BEWAARD = 12;

let hoekmodus: AngleMode = "deg";
let worker: Worker | null = null;
let bezig: RekenVerzoek | null = null;
let wachtend: RekenVerzoek | null = null;
const uitkomsten = new Map<string, Doorrekening>();
/** De laatst bekende uitkomst per blad, voor de UC in de projectboom. */
const perBlad = new Map<string, Resultaat>();
const luisteraars = new Set<() => void>();

function meld() {
  for (const l of luisteraars) l();
}

function deWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL("./rekenWorker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<RekenAntwoord>) => {
      const { sleutel, html, eenheden, uitkomst, verzoeken, toetsen } = e.data;
      const blad = bezig?.blad;
      if (verzoeken?.length) void vraagToetsingen(verzoeken);
      uitkomsten.set(sleutel, { html, eenheden, uitkomst });
      while (uitkomsten.size > BEWAARD) uitkomsten.delete(uitkomsten.keys().next().value!);
      bezig = null;
      const volgende = wachtend;
      wachtend = null;
      if (volgende && !uitkomsten.has(volgende.sleutel)) stuur(volgende);
      meld();
      // Na het tonen: de antwoorden bij het blad vastleggen geeft een nieuwe ronde.
      if (toetsen?.length) {
        kenFemStudio();
        if (blad) legToetsingenVast(blad, toetsen);
      }
    };
  }
  return worker;
}

function stuur(v: RekenVerzoek) {
  bezig = v;
  deWorker().postMessage(v);
}

function vraag(v: RekenVerzoek) {
  if (uitkomsten.has(v.sleutel) || bezig?.sleutel === v.sleutel) return;
  if (bezig) wachtend = v;
  else stuur(v);
}

/** De hoekmodus van nu, voor de worker van de varianten (variantRekenen.ts). */
export function hoekmodusNu(): AngleMode {
  return hoekmodus;
}

/**
 * Hoeken in graden, radialen of gon, voor de UI-thread én de worker. Een andere
 * stand maakt alle bewaarde uitkomsten ongeldig.
 */
export function zetHoekmodus(mode: AngleMode) {
  setAngleMode(mode);
  if (mode === hoekmodus) return;
  hoekmodus = mode;
  uitkomsten.clear();
  meld();
}

function abonneer(l: () => void) {
  luisteraars.add(l);
  return () => {
    luisteraars.delete(l);
  };
}

/**
 * De UC en het oordeel van een blad, zodra het in deze sessie is doorgerekend;
 * tot dan null. Rekent zelf niets: de projectboom laat alleen zien wat de
 * werkruimte al uitrekende.
 */
export function useBladResultaat(blad: string): Resultaat | null {
  return useSyncExternalStore(abonneer, () => perBlad.get(blad) ?? null);
}

/**
 * De doorrekening van een blad, met `bezig` zolang de uitkomst voor deze
 * invoer er nog niet is. `blad` (het id) bepaalt of de vorige uitkomst mag
 * blijven staan: alleen van hetzelfde blad, nooit van een ander.
 */
export function useDoorrekening(
  blad: string | undefined,
  source: string,
  waarden: Record<string, string>,
  scope: Record<string, unknown>,
  naam: string,
): { doorrekening: Doorrekening | null; bezig: boolean } {
  // Elke render opnieuw: de hoekmodus is geen React-toestand, en een wissel
  // ervan moet een nieuwe sleutel geven (zetHoekmodus meldt de wissel). Zo ook de
  // taal: de uitvoer volgt de app, en wie deze hook gebruikt, tekent bij een
  // taalwissel opnieuw (useTranslation in de uitwerking en in het beeld).
  const taal = i18next.language ?? "";
  // Het eenhedenstelsel van het project: een wissel geeft een nieuwe sleutel.
  const gegevens = useProjectStore((s) => s.gegevens);
  const basisOpties = useMemo(() => evalOptiesVan(gegevens), [gegevens]);
  // Een nieuw antwoord van FEM Studio maakt elke doorrekening verouderd; de antwoorden
  // zelf staan niet in de sleutel (ze zijn groot), hun versie wel.
  const toetsV = useToetsVersie();
  const evalOpties = useMemo(() => metToetsingen(basisOpties, "vragen", taal), [basisOpties, toetsV, taal]);
  const optiesSleutel = JSON.stringify(basisOpties) + "|t" + toetsV;
  // De bladen waarnaar dit blad verwijst gaan mee, en horen in de sleutel: verandert
  // de invoer van blad 1, dan rekent een blad met #1.R_paal opnieuw.
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const verwijzingen = useMemo(() => verwezenBladen(source, waarden, exemplaren), [source, waarden, exemplaren]);
  const verwijsSleutel = verwijzingen.length ? JSON.stringify(verwijzingen) : "";
  const sleutel = [hoekmodus, taal, optiesSleutel, naam, JSON.stringify(scope), JSON.stringify(waarden), source, verwijsSleutel].join("\u0000");
  const hier = useSyncExternalStore(abonneer, () => uitkomsten.get(sleutel) ?? null);

  useEffect(() => {
    if (!source.trim()) return;
    vraag({
      sleutel, blad, source, waarden, scope, naam, hoekmodus, taal, evalOpties,
      includes: [...rekentaalIncludes], imageUrls: [...rekentaalImageUrls],
      ...(verwijzingen.length ? { verwijzingen } : {}),
    });
    // verwijzingen zit in de sleutel
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sleutel, blad, source, waarden, scope, naam, taal, evalOpties]);

  const resultaat = hier?.uitkomst?.resultaat;
  useEffect(() => {
    if (!blad || !resultaat || perBlad.get(blad) === resultaat) return;
    perBlad.set(blad, resultaat);
    meld();
  }, [blad, resultaat]);

  const vorige = useRef<{ blad: string | undefined; d: Doorrekening } | null>(null);
  if (hier) vorige.current = { blad, d: hier };
  const terugval = vorige.current && vorige.current.blad === blad ? vorige.current.d : null;
  return { doorrekening: hier ?? terugval, bezig: !hier };
}
