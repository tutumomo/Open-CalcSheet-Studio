import type {
  DrieDElement, DrieDInstellingen, DrieDNode, DrieDRegel, DrieDScene, EvaluatedDrieD, Punt3D,
} from './types.js';
import { jsonVoorAttribuut } from './jsAttribuut.js';
import { FemModel, femVlak3D } from './femResultaat.js';

/**
 * Een ruimtelijk beeld in het blad: het blok `@3d … @end`.
 *
 * Schrijfwijze
 * ------------
 *   @3d
 *   eenheid mm
 *   kolom 0 0 0 {{H}} {{b}} {{h}}
 *   kolom {{L}} 0 0 {{H}} {{b}} {{h}}
 *   balk 0 0 {{H}} {{L}} 0 {{H}} {{b}} {{h}} hout
 *   lijnlast 0 0 {{H + h/2}} {{L}} 0 {{H + h/2}} 400
 *   @end
 *
 * Eén element per regel: het sleutelwoord, de maten, en achteraan eventueel
 * een kleur. x en y liggen horizontaal, z wijst omhoog.
 *
 *   balk x1 y1 z1 x2 y2 z2 b h           prisma om de as van punt 1 naar punt 2, doorsnede
 *                                        b × h; h staat verticaal (bij een staande balk langs x)
 *   ibalk x1 y1 z1 x2 y2 z2 b h tw tf    I-profiel: flensbreedte b, hoogte h, lijf tw, flens tf
 *   kolom x y z0 z1 b h                  staande balk van z0 tot z1; h langs x, b langs y
 *   buis x1 y1 z1 x2 y2 z2 d             ronde buis of staaf, diameter d
 *   plaat x y z lx ly t                  liggende plaat vanaf de hoek (x, y, z), dikte t omhoog
 *   doos x y z dx dy dz                  blok vanaf de hoek (x, y, z)
 *   staaf x1 y1 z1 x2 y2 z2              lijn, bijvoorbeeld een systeemlijn
 *   knoop x y z [r]                      bolletje met straal r
 *   tekst x y z "…"                      label; {{…}} in de tekst geeft de waarde
 *   pijl x1 y1 z1 x2 y2 z2               last: pijl van punt 1 naar punt 2 (de punt)
 *   lijnlast x1 y1 z1 x2 y2 z2 a [n]     verdeelde last: n pijlen van lengte a omlaag op de lijn
 *   oplegging x y z [scharnier|rol|inklemming] [g]   steunpunt onder (x, y, z), grootte g
 *   fem model uitkomst grootheid [h]     het vlak van een @fem-model (femBlok.ts), bijvoorbeeld
 *                                        `fem vloer UGT w`: elke knoop op zijn plaats met de
 *                                        waarde als hoogte (omlaag bij een positief getal),
 *                                        gekleurd zoals fem_svg; h is de getekende hoogte van
 *                                        het grootste getal (standaard 12 % van de vloer)
 *
 * Kleuren: hout, staal, beton, metselwerk, glas, grond, last, oplegging,
 * lijn, zwart, grijs, wit, rood, blauw, groen, geel, of `#rrggbb`. Zonder
 * kleur is een balk staal, een plaat of doos beton en een last amber.
 *
 * Instellingen, waar ook in het blok:
 *   eenheid mm|cm|m              de eenheid van de maten (standaard mm)
 *   camera iso|voor|boven|zij    het eerste standpunt (standaard iso: schuin van voren)
 *   raster aan|uit               een raster op het grondvlak (standaard aan)
 *   assen aan|uit                de assen x, y, z bij de oorsprong (standaard aan)
 *   hoogte 320                   hoogte van het beeld in px (standaard 320)
 *
 * Maten
 * -----
 * Een maat is een getal (`300`, `-1.5`), een getal met een lengte-eenheid
 * (`2.5m`, `30cm`, `300mm`) of `{{…}}` met een naam of een formule uit het
 * blad: `{{L}}`, `{{L/2}}`, `{{H + h_p/2}}`, `-{{a}}`. Dezelfde dubbele
 * accolades als in `@svg`, maar hier mag er ook een formule in. Een lengte
 * telt daarin als getal in de eenheid van de scène: met `L = 5 m` en
 * `H = 3 m` geeft `{{L}}` in een scène in mm 5000 en `{{H + 800}}` 3800. Een
 * formule die met eenheden rekent mag ook (`{{H + 0.8 m}}`): de uitkomst wordt
 * omgerekend. Een waarde zonder eenheid telt in de eenheid van de scène. In
 * een tekst geeft `{{…}}` de waarde zonder eenheid, net als in `@svg`.
 *
 * Herhalen en kiezen gaat zoals in de rest van het blad: `#for i = 1 : n` …
 * `#loop` (de teller is in `{{…}}` te gebruiken) en `#if` … `#else if` …
 * `#else` … `#end if`. Een regel die met `//` begint is commentaar.
 *
 * Wat niet te lezen of uit te rekenen is (een onbekend element, een maat te
 * weinig, een onbekende naam), komt als melding boven het beeld; de rest van
 * de scène wordt gewoon getekend.
 *
 * Uitvoer
 * -------
 * De renderer schrijft `<div class="calc-3d" data-scene="…">` met de scène als
 * JSON (DrieDScene in types.ts), en daarin een stilstaande projectie als SVG
 * (`drieDSvg`): die staat er zonder WebGL en op papier. De app zet er een
 * draaibaar beeld overheen.
 */

// ── Kleuren en elementen ──────────────────────────────────────────────

/** De kleuren die bij naam te kiezen zijn; de materialen in de kleuren van de tekeningen. */
export const DRIE_D_KLEUREN: Readonly<Record<string, string>> = {
  hout: '#E3C08A',
  staal: '#c9ced6',
  beton: '#d6d3cd',
  metselwerk: '#c98b6b',
  glas: '#cfe3f3',
  grond: '#b8ad9e',
  last: '#D97706',
  oplegging: '#fbbf24',
  lijn: '#334155',
  zwart: '#1e293b',
  grijs: '#94a3b8',
  wit: '#ffffff',
  rood: '#dc2626',
  blauw: '#2563eb',
  groen: '#16a34a',
  geel: '#facc15',
};

interface Soort {
  /** Namen van de maten, in volgorde (voor de melding). */
  maten: string[];
  /** Zoveel maten mogen achteraan wegblijven. */
  optioneel?: number;
  kleur: string;
  /** Leest ook een tekst tussen dubbele aanhalingstekens. */
  tekst?: boolean;
  /** Woorden die als optie gelden. */
  opties?: readonly string[];
}

const LIJN = ['x1', 'y1', 'z1', 'x2', 'y2', 'z2'];
const SOORTEN: Readonly<Record<string, Soort>> = {
  balk: { maten: [...LIJN, 'b', 'h'], kleur: DRIE_D_KLEUREN.staal },
  ibalk: { maten: [...LIJN, 'b', 'h', 'tw', 'tf'], kleur: DRIE_D_KLEUREN.staal },
  kolom: { maten: ['x', 'y', 'z0', 'z1', 'b', 'h'], kleur: DRIE_D_KLEUREN.staal },
  buis: { maten: [...LIJN, 'd'], kleur: DRIE_D_KLEUREN.staal },
  plaat: { maten: ['x', 'y', 'z', 'lx', 'ly', 't'], kleur: DRIE_D_KLEUREN.beton },
  doos: { maten: ['x', 'y', 'z', 'dx', 'dy', 'dz'], kleur: DRIE_D_KLEUREN.beton },
  staaf: { maten: LIJN, kleur: DRIE_D_KLEUREN.lijn },
  knoop: { maten: ['x', 'y', 'z', 'r'], optioneel: 1, kleur: DRIE_D_KLEUREN.lijn },
  tekst: { maten: ['x', 'y', 'z'], tekst: true, kleur: DRIE_D_KLEUREN.zwart },
  pijl: { maten: LIJN, kleur: DRIE_D_KLEUREN.last },
  lijnlast: { maten: [...LIJN, 'a', 'n'], optioneel: 1, kleur: DRIE_D_KLEUREN.last },
  oplegging: {
    maten: ['x', 'y', 'z', 'g'], optioneel: 1, kleur: DRIE_D_KLEUREN.oplegging,
    opties: ['scharnier', 'rol', 'inklemming'],
  },
};

const INSTELLINGEN = ['eenheid', 'camera', 'raster', 'assen', 'hoogte'];
const CAMERAS = ['iso', 'voor', 'boven', 'zij'] as const;
/** Millimeters per eenheid. */
const FACTOR: Readonly<Record<string, number>> = { mm: 1, cm: 10, m: 1000 };

/** Zoveel elementen tekent één blok hooguit; een lus die doorschiet blijft zo bedienbaar. */
const MAX_ELEMENTEN = 3000;
/** Zoveel rondes maakt één #for in een blok hooguit. */
const MAX_RONDES = 1000;

export const DRIE_D_START_RE = /^@3d\s*$/i;

const FOR_RE = /^#for\s+([\p{L}_][\p{L}\p{N}_]*)\s*=\s*(.+?)\s*:\s*(.+)$/iu;
const LOOP_RE = /^#loop\b/i;
const IF_RE = /^#if\s+(.+)$/i;
const ELSE_IF_RE = /^#else\s*if\s+(.+)$/i;
const ELSE_RE = /^#else\b/i;
const ENDIF_RE = /^#end\s+if\b/i;

/** Een getal, eventueel met een lengte-eenheid erachter: `300`, `-1.5`, `2.5m`, `1e3mm`. */
const GETAL_RE = /^([-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?)(mm|cm|m)?$/i;
/** `{{…}}`, eventueel met een minteken ervoor. */
const FORMULE_RE = /^(-?)\{\{([\s\S]+)\}\}$/;
const KLEUR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

function isFormule(deel: string): boolean {
  const m = deel.match(FORMULE_RE);
  return !!m && !m[2].includes('{{') && !m[2].includes('}}');
}

const isMaat = (deel: string) => GETAL_RE.test(deel) || isFormule(deel);

/** Een kleur bij naam of als `#rgb`/`#rrggbb`, als `#rrggbb`; anders null. */
function leesKleur(woord: string): string | null {
  const naam = DRIE_D_KLEUREN[woord.toLowerCase()];
  if (naam) return naam;
  if (!KLEUR_RE.test(woord)) return null;
  return woord.length === 4
    ? `#${woord[1]}${woord[1]}${woord[2]}${woord[2]}${woord[3]}${woord[3]}`.toLowerCase()
    : woord.toLowerCase();
}

/**
 * Splitst een regel in delen op witruimte. `{{ … }}` en `"…"` blijven heel,
 * ook met spaties erin; `//` begint commentaar tot het eind van de regel.
 */
function splitsDelen(regel: string): string[] {
  const delen: string[] = [];
  let i = 0;
  while (i < regel.length) {
    if (/\s/.test(regel[i])) { i++; continue; }
    if (regel.startsWith('//', i)) break;
    if (regel[i] === '"') {
      const eind = regel.indexOf('"', i + 1);
      if (eind === -1) throw new Error('een tekst zonder sluitend aanhalingsteken');
      delen.push(regel.slice(i, eind + 1));
      i = eind + 1;
      continue;
    }
    let deel = '';
    while (i < regel.length && !/\s/.test(regel[i])) {
      if (regel.startsWith('{{', i)) {
        const eind = regel.indexOf('}}', i + 2);
        if (eind === -1) throw new Error('{{ zonder sluitende }}');
        deel += regel.slice(i, eind + 2);
        i = eind + 2;
      } else {
        deel += regel[i];
        i++;
      }
    }
    delen.push(deel);
  }
  return delen;
}

// ── Inlezen ───────────────────────────────────────────────────────────

/**
 * Leest de regels tussen `@3d` en `@end`. `normaliseer` maakt van een
 * expressie in `{{…}}`, `#for` of `#if` dezelfde vorm als elke andere
 * expressie in het blad (namen met een komma of punt, `;` tussen argumenten).
 * Fouten worden meldingen; de regel valt dan weg.
 */
export function leesDrieD(
  bron: string[],
  normaliseer: (expr: string) => string,
): Pick<DrieDNode, 'regels' | 'instellingen' | 'fouten'> {
  const fouten: string[] = [];
  const instellingen: DrieDInstellingen = {};
  const meld = (nr: number, tekst: string) => fouten.push(`3D-blok, regel ${nr}: ${tekst}`);
  const norm = (deel: string) =>
    deel.replace(/\{\{([\s\S]*?)\}\}/g, (_m, e: string) => `{{${normaliseer(e.trim())}}}`);
  let i = 0;

  /** Leest regels tot een van de `eindes`; die regel blijft staan voor de aanroeper. */
  function blok(eindes: RegExp[]): { regels: DrieDRegel[]; eind: string | null } {
    const uit: DrieDRegel[] = [];
    while (i < bron.length) {
      const nr = i + 1;
      const t = bron[i].trim();
      if (t === '' || t.startsWith('//')) { i++; continue; }
      if (eindes.some((re) => re.test(t))) return { regels: uit, eind: t };
      i++;

      const voor = t.match(FOR_RE);
      if (voor) {
        const binnen = blok([LOOP_RE]);
        if (binnen.eind === null) meld(nr, '#for zonder #loop');
        else i++;
        uit.push({
          soort: 'for', regel: nr, teller: voor[1],
          van: normaliseer(voor[2].trim()), tot: normaliseer(voor[3].trim()), body: binnen.regels,
        });
        continue;
      }

      const als = t.match(IF_RE);
      if (als) {
        const takken: { voorwaarde: string; body: DrieDRegel[] }[] = [{ voorwaarde: normaliseer(als[1].trim()), body: [] }];
        const anders: DrieDRegel[] = [];
        let huidig = takken[0].body;
        let inAnders = false;
        for (;;) {
          const b = blok([ELSE_IF_RE, ELSE_RE, ENDIF_RE]);
          huidig.push(...b.regels);
          if (b.eind === null) { meld(nr, '#if zonder #end if'); break; }
          const eind = b.eind;
          i++;
          if (ENDIF_RE.test(eind)) break;
          const andersAls = eind.match(ELSE_IF_RE);
          if (andersAls && !inAnders) {
            const tak = { voorwaarde: normaliseer(andersAls[1].trim()), body: [] as DrieDRegel[] };
            takken.push(tak);
            huidig = tak.body;
          } else if (!andersAls && !inAnders) {
            inAnders = true;
            huidig = anders;
          } else {
            meld(i, `${eind} na #else`);
          }
        }
        uit.push({ soort: 'if', regel: nr, takken, anders });
        continue;
      }

      if (t.startsWith('#')) {
        const woord = t.split(/\s+/)[0];
        meld(nr, LOOP_RE.test(t) ? '#loop zonder #for'
          : ENDIF_RE.test(t) || ELSE_RE.test(t) ? `${woord} zonder #if`
          : `onbekende opdracht "${woord}" (in een 3D-blok: #for … #loop en #if … #end if)`);
        continue;
      }

      let delen: string[];
      try {
        delen = splitsDelen(t);
      } catch (err) {
        meld(nr, (err as Error).message);
        continue;
      }
      if (delen.length === 0) continue;
      const naam = delen[0].toLowerCase();
      const rest = delen.slice(1);

      if (INSTELLINGEN.includes(naam)) {
        instelling(nr, naam, rest);
        continue;
      }

      // `fem vloer UGT w [hoogte]`: het vlak van een @fem-model (femResultaat.ts).
      if (naam === 'fem') {
        const [model, set, grootheid, ...meer] = rest;
        const woord = /^[\p{L}_][\p{L}\p{N}_]*$/u;
        if (!model || !set || !grootheid || !woord.test(model) || !woord.test(set) || meer.length > 1 || (meer.length === 1 && !isMaat(meer[0]))) {
          meld(nr, 'fem verwacht het model, de uitkomst en de grootheid, en eventueel de hoogte: fem vloer UGT w {{1 m}}');
          continue;
        }
        uit.push({ soort: 'element', regel: nr, naam: 'fem', maten: meer.map(norm), woorden: [model, set, grootheid] });
        continue;
      }

      const soort = SOORTEN[naam];
      if (!soort) {
        meld(nr, `onbekend element "${delen[0]}" (bekend: ${Object.keys(SOORTEN).join(', ')})`);
        continue;
      }
      const el = element(nr, naam, soort, rest);
      if (el) uit.push(el);
    }
    return { regels: uit, eind: null };
  }

  function instelling(nr: number, naam: string, delen: string[]) {
    const woord = (delen[0] ?? '').toLowerCase();
    if (delen.length !== 1) {
      meld(nr, `${naam} verwacht één waarde`);
      return;
    }
    switch (naam) {
      case 'eenheid':
        if (woord === 'mm' || woord === 'cm' || woord === 'm') instellingen.eenheid = woord;
        else meld(nr, 'eenheid kent mm, cm en m');
        break;
      case 'camera':
        if ((CAMERAS as readonly string[]).includes(woord)) instellingen.camera = woord as DrieDInstellingen['camera'];
        else meld(nr, `camera kent ${CAMERAS.join(', ')}`);
        break;
      case 'raster':
      case 'assen': {
        const aan = woord === 'aan' || woord === 'ja' ? true : woord === 'uit' || woord === 'nee' ? false : null;
        if (aan === null) meld(nr, `${naam} kent aan en uit`);
        else instellingen[naam as 'raster' | 'assen'] = aan;
        break;
      }
      case 'hoogte':
        if (isMaat(delen[0])) instellingen.hoogte = norm(delen[0]);
        else meld(nr, `"${delen[0]}" is geen hoogte in px`);
        break;
    }
  }

  function element(nr: number, naam: string, soort: Soort, delen: string[]): DrieDRegel | null {
    const maten: string[] = [];
    let kleur: string | undefined;
    let optie: string | undefined;
    let tekst: string | undefined;
    for (const deel of delen) {
      if (deel.startsWith('"')) {
        if (!soort.tekst) { meld(nr, `${naam} heeft geen tekst`); return null; }
        if (tekst !== undefined) { meld(nr, 'twee teksten op één regel'); return null; }
        tekst = norm(deel.slice(1, -1));
      } else if (isMaat(deel)) {
        maten.push(norm(deel));
      } else if (soort.opties?.includes(deel.toLowerCase())) {
        optie = deel.toLowerCase();
      } else if (leesKleur(deel)) {
        kleur = leesKleur(deel)!;
      } else if (/^[-+.\d]/.test(deel) || deel.includes('{')) {
        meld(nr, `"${deel}" is geen maat: schrijf een getal (300, 2.5m) of {{naam}}`);
        return null;
      } else {
        // Een woord dat geen kleur is, is vaak een naam zonder accolades.
        meld(nr, /^[\p{L}_][\p{L}\p{N}_,.]*$/u.test(deel)
          ? `onbekende kleur of optie "${deel}"; een maat uit het blad schrijf je als {{${deel}}}`
          : `onbekende kleur of optie "${deel}"`);
        return null;
      }
    }
    const meeste = soort.maten.length;
    const minste = meeste - (soort.optioneel ?? 0);
    if (maten.length < minste || maten.length > meeste) {
      const verwacht = minste === meeste ? `${meeste}` : `${minste} of ${meeste}`;
      meld(nr, `${naam} verwacht ${verwacht} maten (${soort.maten.join(' ')}), er staan er ${maten.length}`);
      return null;
    }
    if (soort.tekst && tekst === undefined) {
      meld(nr, `${naam} verwacht een tekst tussen aanhalingstekens: ${naam} x y z "…"`);
      return null;
    }
    return {
      soort: 'element', regel: nr, naam, maten,
      ...(kleur ? { kleur } : {}), ...(optie ? { optie } : {}), ...(tekst !== undefined ? { tekst } : {}),
    };
  }

  const { regels } = blok([]);
  return { regels, instellingen, fouten };
}

// ── Doorrekenen ───────────────────────────────────────────────────────

/** Wat de scène nodig heeft van de rekenkern (evaluator.ts). */
export interface DrieDRekenaar {
  /**
   * Rekent een expressie uit met de waarden van het blad; met
   * `lengtesAlsGetal` staat elke lengte er als getal in de eenheid van de
   * scène in (`L = 5 m` is in een scène in mm dan 5000).
   */
  reken(expr: string, lengtesAlsGetal?: boolean): unknown;
  /** Zet een naam (de teller van een #for) en geeft de functie die hem terugzet. */
  zet(naam: string, waarde: number): () => void;
  /** Een waarde als tekst, zoals {{naam}} in een @svg: zonder eenheid. */
  alsTekst(waarde: unknown): string;
}

interface MetEenheid {
  toNumber(eenheid?: string): number;
  formatUnits(): string;
  dimensions?: number[];
}

function heeftEenheid(v: unknown): v is MetEenheid {
  return typeof v === 'object' && v !== null
    && typeof (v as MetEenheid).toNumber === 'function'
    && typeof (v as MetEenheid).formatUnits === 'function';
}

/**
 * Een uitgerekende waarde als getal. `eenheid`: de lengte-eenheid waarin een
 * waarde met eenheid wordt omgerekend; null als er een kaal getal moet komen.
 */
function alsGetal(v: unknown, eenheid: string | null): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (heeftEenheid(v)) {
    if (v.dimensions && v.dimensions.every((d) => d === 0)) return v.toNumber();
    if (eenheid === null) throw new Error(`heeft een eenheid (${v.formatUnits()}), hier hoort een getal`);
    try {
      return v.toNumber(eenheid);
    } catch {
      throw new Error(`is geen lengte (${v.formatUnits()})`);
    }
  }
  if (typeof v === 'object' && v !== null && typeof (v as { toNumber?: unknown }).toNumber === 'function') {
    return (v as { toNumber(): number }).toNumber();
  }
  if (typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v))) return Number(v);
  throw new Error('is geen getal');
}

const rond = (n: number) => Math.round(n * 1e4) / 1e4;

/** Rekent een `@3d`-blok door met de waarden van het blad. Gooit niet: wat misgaat, wordt een melding. */
export function bouwDrieDScene(node: DrieDNode, r: DrieDRekenaar): EvaluatedDrieD {
  const meldingen = [...node.fouten];
  const ins = node.instellingen;
  const eenheid = ins.eenheid ?? 'mm';
  const scene: DrieDScene = {
    eenheid,
    camera: ins.camera ?? 'iso',
    raster: ins.raster ?? true,
    assen: ins.assen ?? true,
    hoogte: 320,
    elementen: [],
  };
  const meld = (nr: number, tekst: string) => meldingen.push(`3D-blok, regel ${nr}: ${tekst}`);

  /** Een maat als getal in de eenheid van de scène, of null (kaal getal, voor de hoogte). */
  function maat(deel: string, lengte: string | null = eenheid): number {
    const getal = deel.match(GETAL_RE);
    if (getal) {
      const n = parseFloat(getal[1]);
      const eh = getal[2]?.toLowerCase();
      if (!eh) return n;
      if (lengte === null) throw new Error(`"${deel}" heeft een eenheid, hier hoort een getal`);
      return (n * FACTOR[eh]) / FACTOR[lengte];
    }
    const f = deel.match(FORMULE_RE);
    if (!f) throw new Error(`"${deel}" is geen maat`);
    let n: number;
    try {
      n = rekenGetal(f[2], lengte);
    } catch (err) {
      throw new Error(`{{${f[2]}}} ${(err as Error).message}`);
    }
    return f[1] === '-' ? -n : n;
  }

  /**
   * Rekent `expr` uit tot een getal: eerst met elke lengte als getal in de
   * eenheid van de scène (`{{H + 800}}` in een scène in mm), en lukt dat
   * niet, met de eenheden zoals ze zijn (`{{H + 0.8 m}}`). Gaat het allebei
   * mis, dan geldt de melding van de eerste poging.
   */
  function rekenGetal(expr: string, lengte: string | null): number {
    let eerste: Error | null = null;
    for (const lengtesAlsGetal of [true, false]) {
      try {
        let v: unknown;
        try {
          v = r.reken(expr, lengtesAlsGetal);
        } catch (err) {
          throw new Error(`is niet uit te rekenen: ${(err as Error).message}`);
        }
        const n = alsGetal(v, lengte);
        if (!Number.isFinite(n)) throw new Error('geeft geen eindig getal');
        return n;
      } catch (err) {
        eerste ??= err as Error;
      }
    }
    throw eerste ?? new Error('is niet uit te rekenen');
  }

  /** Een voorwaarde of grens (#for, #if) als getal. */
  function getal(expr: string): number {
    try {
      return rekenGetal(expr, null);
    } catch (err) {
      throw new Error(`${expr} ${(err as Error).message}`);
    }
  }

  if (ins.hoogte) {
    try {
      scene.hoogte = Math.round(Math.min(1200, Math.max(120, maat(ins.hoogte, null))));
    } catch (err) {
      meldingen.push(`3D-blok, hoogte: ${(err as Error).message}`);
    }
  }

  let vol = false;
  const voegToe = (el: DrieDElement) => {
    if (scene.elementen.length >= MAX_ELEMENTEN) {
      if (!vol) meldingen.push(`3D-blok: meer dan ${MAX_ELEMENTEN} elementen, de rest is weggelaten`);
      vol = true;
      return;
    }
    scene.elementen.push(el);
  };

  function tekst(t: string, nr: number): string {
    return t.replace(/\{\{([\s\S]*?)\}\}/g, (_m, e: string) => {
      try {
        return r.alsTekst(r.reken(e));
      } catch (err) {
        meld(nr, `{{${e}}} is niet uit te rekenen: ${(err as Error).message}`);
        return `{{${e}}}`;
      }
    });
  }

  /** Het gekleurde vlak van een @fem-model, met het grootste en kleinste getal erbij. */
  function femElement(regel: Extract<DrieDRegel, { soort: 'element' }>) {
    const [naam, set, grootheid] = regel.woorden ?? [];
    let model: unknown;
    try {
      model = r.reken(naam);
    } catch {
      model = undefined;
    }
    if (!(model instanceof FemModel)) {
      meld(regel.regel, `${naam} is geen doorgerekend @fem-model (zet het @fem-blok boven dit blok, en wacht tot het gerekend is)`);
      return;
    }
    try {
      const hoogte = regel.maten.length ? maat(regel.maten[0]) : null;
      const v = femVlak3D(model, set, grootheid, 1000 / FACTOR[eenheid], hoogte);
      voegToe({ soort: 'net', punten: v.punten, vlakken: v.vlakken, kleuren: v.kleuren, kleur: DRIE_D_KLEUREN.grijs });
      const label = (w: number) => `${String(Number(w.toPrecision(3)))} ${v.eenheid}`;
      voegToe({ soort: 'tekst', plek: v.max.plek, tekst: label(v.max.waarde), kleur: '#1e3a8a' });
      if (v.min.waarde !== v.max.waarde) voegToe({ soort: 'tekst', plek: v.min.plek, tekst: label(v.min.waarde), kleur: '#991b1b' });
    } catch (err) {
      meld(regel.regel, (err as Error).message);
    }
  }

  function element(regel: Extract<DrieDRegel, { soort: 'element' }>) {
    if (regel.naam === 'fem') {
      femElement(regel);
      return;
    }
    const soort = SOORTEN[regel.naam];
    if (!soort) return;
    let w: number[];
    try {
      w = regel.maten.map((d) => maat(d));
    } catch (err) {
      meld(regel.regel, (err as Error).message);
      return;
    }
    const kleur = regel.kleur ?? soort.kleur;
    const p = (k: number): Punt3D => [rond(w[k]), rond(w[k + 1]), rond(w[k + 2])];
    const positief = (...namen: [string, number][]): boolean => {
      const fout = namen.filter(([, v]) => !(v > 0)).map(([n]) => n);
      if (fout.length) meld(regel.regel, `${fout.join(' en ')} ${fout.length > 1 ? 'moeten' : 'moet'} groter dan 0 zijn`);
      return fout.length === 0;
    };
    const lengte = (a: Punt3D, b: Punt3D): boolean => {
      if (afstand(a, b) > 0) return true;
      meld(regel.regel, `begin- en eindpunt van ${regel.naam} vallen samen`);
      return false;
    };
    switch (regel.naam) {
      case 'balk':
        if (lengte(p(0), p(3)) && positief(['b', w[6]], ['h', w[7]])) {
          voegToe({ soort: 'balk', van: p(0), naar: p(3), b: rond(w[6]), h: rond(w[7]), kleur });
        }
        break;
      case 'ibalk':
        if (lengte(p(0), p(3)) && positief(['b', w[6]], ['h', w[7]], ['tw', w[8]], ['tf', w[9]])) {
          if (w[8] >= w[6] || 2 * w[9] >= w[7]) {
            meld(regel.regel, 'het lijf moet smaller zijn dan b en de flenzen samen dunner dan h');
            break;
          }
          voegToe({ soort: 'ibalk', van: p(0), naar: p(3), b: rond(w[6]), h: rond(w[7]), tw: rond(w[8]), tf: rond(w[9]), kleur });
        }
        break;
      case 'kolom': {
        const van: Punt3D = [rond(w[0]), rond(w[1]), rond(w[2])];
        const naar: Punt3D = [rond(w[0]), rond(w[1]), rond(w[3])];
        if (lengte(van, naar) && positief(['b', w[4]], ['h', w[5]])) {
          voegToe({ soort: 'balk', van, naar, b: rond(w[4]), h: rond(w[5]), kleur });
        }
        break;
      }
      case 'buis':
        if (lengte(p(0), p(3)) && positief(['d', w[6]])) {
          voegToe({ soort: 'buis', van: p(0), naar: p(3), d: rond(w[6]), kleur });
        }
        break;
      case 'plaat':
        if (positief(['t', w[5]]) && w[3] !== 0 && w[4] !== 0) {
          voegToe({ soort: 'doos', hoek: p(0), maat: [rond(w[3]), rond(w[4]), rond(w[5])], kleur });
        } else if (w[3] === 0 || w[4] === 0) {
          meld(regel.regel, 'lx en ly mogen niet 0 zijn');
        }
        break;
      case 'doos':
        if (w[3] !== 0 && w[4] !== 0 && w[5] !== 0) {
          voegToe({ soort: 'doos', hoek: p(0), maat: [rond(w[3]), rond(w[4]), rond(w[5])], kleur });
        } else {
          meld(regel.regel, 'dx, dy en dz mogen niet 0 zijn');
        }
        break;
      case 'staaf':
        if (lengte(p(0), p(3))) voegToe({ soort: 'staaf', van: p(0), naar: p(3), kleur });
        break;
      case 'pijl':
        if (lengte(p(0), p(3))) voegToe({ soort: 'pijl', van: p(0), naar: p(3), kleur });
        break;
      case 'knoop':
        if (w.length < 4 || positief(['r', w[3]])) {
          voegToe({ soort: 'knoop', plek: p(0), r: w.length < 4 ? -1 : rond(w[3]), kleur });
        }
        break;
      case 'tekst':
        voegToe({ soort: 'tekst', plek: p(0), tekst: tekst(regel.tekst ?? '', regel.regel), kleur });
        break;
      case 'oplegging':
        if (w.length < 4 || positief(['g', w[3]])) {
          voegToe({
            soort: 'oplegging', plek: p(0), type: (regel.optie ?? 'scharnier') as 'scharnier' | 'rol' | 'inklemming',
            grootte: w.length < 4 ? -1 : rond(w[3]), kleur,
          });
        }
        break;
      case 'lijnlast': {
        const a = w[6];
        const van = p(0);
        const naar = p(3);
        if (!lengte(van, naar)) break;
        if (a === 0) { meld(regel.regel, 'a mag niet 0 zijn'); break; }
        const L = afstand(van, naar);
        let n = w.length > 7 ? Math.round(w[7]) : Math.round(L / Math.max(Math.abs(a) * 0.6, L / 24)) + 1;
        n = Math.max(2, Math.min(60, n));
        const boven = (q: Punt3D): Punt3D => [q[0], q[1], rond(q[2] + a)];
        voegToe({ soort: 'staaf', van: boven(van), naar: boven(naar), kleur });
        for (let k = 0; k < n; k++) {
          const t = k / (n - 1);
          const q: Punt3D = [rond(van[0] + t * (naar[0] - van[0])), rond(van[1] + t * (naar[1] - van[1])), rond(van[2] + t * (naar[2] - van[2]))];
          voegToe({ soort: 'pijl', van: boven(q), naar: q, kleur });
        }
        break;
      }
    }
  }

  function voerUit(regels: DrieDRegel[]) {
    for (const regel of regels) {
      if (vol) return;
      if (regel.soort === 'element') {
        element(regel);
      } else if (regel.soort === 'for') {
        let van: number;
        let tot: number;
        try {
          van = getal(regel.van);
          tot = getal(regel.tot);
        } catch (err) {
          meld(regel.regel, `#for: ${(err as Error).message}`);
          continue;
        }
        let rondes = Math.floor(tot - van) + 1;
        if (rondes > MAX_RONDES) {
          meld(regel.regel, `#for: meer dan ${MAX_RONDES} rondes, de rest is weggelaten`);
          rondes = MAX_RONDES;
        }
        for (let k = 0; k < rondes && !vol; k++) {
          const herstel = r.zet(regel.teller, van + k);
          try {
            voerUit(regel.body);
          } finally {
            herstel();
          }
        }
      } else {
        let gekozen: DrieDRegel[] | null = null;
        for (const tak of regel.takken) {
          try {
            if (getal(tak.voorwaarde) !== 0) { gekozen = tak.body; break; }
          } catch (err) {
            meld(regel.regel, `#if: ${(err as Error).message}`);
            gekozen = [];
            break;
          }
        }
        voerUit(gekozen ?? regel.anders);
      }
    }
  }

  try {
    voerUit(node.regels);
  } catch (err) {
    meldingen.push(`3D-blok: ${(err as Error).message}`);
  }

  // Wat geen maat meekreeg (een knoop zonder straal, een oplegging zonder
  // grootte), krijgt er een naar de grootte van de scène.
  const S = drieDGrootte(scene);
  for (const el of scene.elementen) {
    if (el.soort === 'knoop' && el.r < 0) el.r = rond(S * 0.012);
    if (el.soort === 'oplegging' && el.grootte < 0) el.grootte = rond(S * 0.03);
  }
  return { type: '3d', scene, meldingen };
}

// ── Meetkunde ─────────────────────────────────────────────────────────

const plus = (a: Punt3D, b: Punt3D): Punt3D => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const min = (a: Punt3D, b: Punt3D): Punt3D => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const maal = (a: Punt3D, s: number): Punt3D => [a[0] * s, a[1] * s, a[2] * s];
const punt = (a: Punt3D, b: Punt3D) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const kruis = (a: Punt3D, b: Punt3D): Punt3D =>
  [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const lengteVan = (a: Punt3D) => Math.sqrt(punt(a, a));
const eenheidsvector = (a: Punt3D): Punt3D => maal(a, 1 / (lengteVan(a) || 1));
const afstand = (a: Punt3D, b: Punt3D) => lengteVan(min(a, b));

/** De grenzen van alle punten van de scène; null zonder elementen. */
export function drieDGrenzen(scene: DrieDScene): { min: Punt3D; max: Punt3D } | null {
  const punten: Punt3D[] = [];
  for (const el of scene.elementen) {
    switch (el.soort) {
      case 'doos':
        punten.push(el.hoek, plus(el.hoek, el.maat));
        break;
      case 'knoop':
      case 'tekst':
      case 'oplegging':
        punten.push(el.plek);
        break;
      case 'vlakken':
        for (const v of el.vlakken) punten.push(...v.punten);
        break;
      case 'net':
        punten.push(...el.punten);
        break;
      default:
        punten.push(el.van, el.naar);
    }
  }
  if (punten.length === 0) return null;
  const lo: Punt3D = [Infinity, Infinity, Infinity];
  const hi: Punt3D = [-Infinity, -Infinity, -Infinity];
  for (const q of punten) {
    for (let k = 0; k < 3; k++) {
      lo[k] = Math.min(lo[k], q[k]);
      hi[k] = Math.max(hi[k], q[k]);
    }
  }
  return { min: lo, max: hi };
}

/** De grootste afmeting van de scène, of een standaardmaat (1 m) als hij leeg of plat is. */
export function drieDGrootte(scene: DrieDScene): number {
  const g = drieDGrenzen(scene);
  const S = g ? Math.max(g.max[0] - g.min[0], g.max[1] - g.min[1], g.max[2] - g.min[2]) : 0;
  return S > 0 ? S : 1000 / FACTOR[scene.eenheid];
}

/**
 * Het beeldvlak van een standpunt: de richting naar de camera, en welke kant
 * in beeld rechts en boven is. De app zet zijn camera in dezelfde richting,
 * zodat de stilstaande projectie en het draaibare beeld hetzelfde tonen.
 */
export function drieDBeeldvlak(camera: DrieDScene['camera']): { naarCamera: Punt3D; rechts: Punt3D; boven: Punt3D } {
  const richting: Record<DrieDScene['camera'], Punt3D> = {
    iso: [0.9, -1.6, 1.05],
    voor: [0, -1, 0],
    zij: [1, 0, 0],
    boven: [0, 0, 1],
  };
  const naarCamera = eenheidsvector(richting[camera] ?? richting.iso);
  const vooruit = maal(naarCamera, -1);
  const r = kruis(vooruit, [0, 0, 1]);
  const rechts: Punt3D = lengteVan(r) < 1e-6 ? [1, 0, 0] : eenheidsvector(r);
  return { naarCamera, rechts, boven: eenheidsvector(kruis(rechts, vooruit)) };
}

/** Een vlak van een lichaam: de hoekpunten, tegen de klok in van buiten gezien. */
export interface DrieDVlak {
  punten: Punt3D[];
  /** Met omtreklijn; de zijvlakken van een buis hebben die niet. */
  rand: boolean;
}

/** De normaal van een veelhoek (Newell), niet genormeerd. */
function normaal(punten: Punt3D[]): Punt3D {
  const n: Punt3D = [0, 0, 0];
  for (let k = 0; k < punten.length; k++) {
    const a = punten[k];
    const b = punten[(k + 1) % punten.length];
    n[0] += (a[1] - b[1]) * (a[2] + b[2]);
    n[1] += (a[2] - b[2]) * (a[0] + b[0]);
    n[2] += (a[0] - b[0]) * (a[1] + b[1]);
  }
  return n;
}

const midden = (punten: Punt3D[]): Punt3D => maal(punten.reduce(plus, [0, 0, 0] as Punt3D), 1 / punten.length);

/** Zet de vlakken van één bol lichaam met hun normaal naar buiten. */
function naarBuiten(vlakken: DrieDVlak[]): DrieDVlak[] {
  const c = midden(vlakken.flatMap((v) => v.punten));
  for (const v of vlakken) {
    if (punt(normaal(v.punten), min(midden(v.punten), c)) < 0) v.punten.reverse();
  }
  return vlakken;
}

/** Het assenstelsel van een staaf: langs de as, de b-richting en de h-richting. */
function stelsel(van: Punt3D, naar: Punt3D): { b: Punt3D; h: Punt3D } | null {
  const d = min(naar, van);
  if (lengteVan(d) === 0) return null;
  const e = eenheidsvector(d);
  const op: Punt3D = Math.abs(e[2]) > 0.999 ? [1, 0, 0] : [0, 0, 1];
  const h = eenheidsvector(min(op, maal(e, punt(op, e))));
  return { b: eenheidsvector(kruis(e, h)), h };
}

/** Een prisma met een veelhoek (u langs b, v langs h) als doorsnede, van punt tot punt. */
function prisma(van: Punt3D, naar: Punt3D, doorsnede: [number, number][], zijRand = true): DrieDVlak[] {
  const st = stelsel(van, naar);
  if (!st) return [];
  const ring = (o: Punt3D) => doorsnede.map(([u, v]) => plus(o, plus(maal(st.b, u), maal(st.h, v))));
  const a = ring(van);
  const z = ring(naar);
  const vlakken: DrieDVlak[] = [{ punten: a, rand: true }, { punten: z, rand: true }];
  for (let k = 0; k < doorsnede.length; k++) {
    const l = (k + 1) % doorsnede.length;
    vlakken.push({ punten: [a[k], a[l], z[l], z[k]], rand: zijRand });
  }
  return naarBuiten(vlakken);
}

const rechthoek = (u0: number, u1: number, v0: number, v1: number): [number, number][] =>
  [[u0, v0], [u1, v0], [u1, v1], [u0, v1]];

function doos(hoek: Punt3D, maat: Punt3D): DrieDVlak[] {
  const [x0, x1] = [Math.min(hoek[0], hoek[0] + maat[0]), Math.max(hoek[0], hoek[0] + maat[0])];
  const [y0, y1] = [Math.min(hoek[1], hoek[1] + maat[1]), Math.max(hoek[1], hoek[1] + maat[1])];
  const [z0, z1] = [Math.min(hoek[2], hoek[2] + maat[2]), Math.max(hoek[2], hoek[2] + maat[2])];
  const p = (x: number, y: number, z: number): Punt3D => [x, y, z];
  return naarBuiten([
    { punten: [p(x0, y0, z0), p(x1, y0, z0), p(x1, y1, z0), p(x0, y1, z0)], rand: true },
    { punten: [p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)], rand: true },
    { punten: [p(x0, y0, z0), p(x1, y0, z0), p(x1, y0, z1), p(x0, y0, z1)], rand: true },
    { punten: [p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)], rand: true },
    { punten: [p(x0, y0, z0), p(x0, y1, z0), p(x0, y1, z1), p(x0, y0, z1)], rand: true },
    { punten: [p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1)], rand: true },
  ]);
}

/** Piramide met de punt boven en een vierkant grondvlak op hoogte `zVoet`. */
function piramide(top: Punt3D, zVoet: number, half: number): DrieDVlak[] {
  const [x, y] = top;
  const voet: Punt3D[] = [[x - half, y - half, zVoet], [x + half, y - half, zVoet], [x + half, y + half, zVoet], [x - half, y + half, zVoet]];
  const vlakken: DrieDVlak[] = [{ punten: [...voet], rand: true }];
  for (let k = 0; k < 4; k++) vlakken.push({ punten: [voet[k], voet[(k + 1) % 4], top], rand: true });
  return naarBuiten(vlakken);
}

function cirkel(d: number, n = 20): [number, number][] {
  return Array.from({ length: n }, (_, k) => {
    const a = (2 * Math.PI * k) / n;
    return [(d / 2) * Math.cos(a), (d / 2) * Math.sin(a)] as [number, number];
  });
}

/**
 * De vlakken van een element met een lichaam (balk, ibalk, buis, doos,
 * oplegging), elk lichaam bol, de normalen naar buiten. Lijnen, pijlen,
 * knopen en teksten hebben geen vlakken. De app bouwt er zijn 3D-model uit,
 * de stilstaande projectie tekent ze; zo hebben beide dezelfde vorm.
 */
export function drieDVlakken(el: DrieDElement): DrieDVlak[] {
  switch (el.soort) {
    case 'balk':
      return prisma(el.van, el.naar, rechthoek(-el.b / 2, el.b / 2, -el.h / 2, el.h / 2));
    case 'ibalk': {
      const { b, h, tw, tf } = el;
      return [
        ...prisma(el.van, el.naar, rechthoek(-b / 2, b / 2, -h / 2, -h / 2 + tf)),
        ...prisma(el.van, el.naar, rechthoek(-tw / 2, tw / 2, -h / 2 + tf, h / 2 - tf)),
        ...prisma(el.van, el.naar, rechthoek(-b / 2, b / 2, h / 2 - tf, h / 2)),
      ];
    }
    case 'buis':
      return prisma(el.van, el.naar, cirkel(el.d), false);
    case 'doos':
      return doos(el.hoek, el.maat);
    case 'vlakken':
      return el.vlakken;
    case 'net':
      return el.vlakken.map((v) => ({ punten: v.map((k) => el.punten[k]), rand: false }));
    case 'oplegging': {
      const g = el.grootte;
      const [x, y, z] = el.plek;
      if (el.type === 'inklemming') return doos([x - g, y - g, z - 0.7 * g], [2 * g, 2 * g, 0.7 * g]);
      if (el.type === 'rol') {
        const zRol = z - 0.85 * g - 0.22 * g;
        return [
          ...piramide(el.plek, z - 0.85 * g, 0.7 * g),
          ...prisma([x, y - 0.8 * g, zRol], [x, y + 0.8 * g, zRol], cirkel(0.44 * g, 12), false),
          ...doos([x - g, y - g, z - 1.29 * g - 0.18 * g], [2 * g, 2 * g, 0.18 * g]),
        ];
      }
      return [
        ...piramide(el.plek, z - 1.1 * g, 0.7 * g),
        ...doos([x - g, y - g, z - 1.1 * g - 0.18 * g], [2 * g, 2 * g, 0.18 * g]),
      ];
    }
    default:
      return [];
  }
}

// ── Stilstaande projectie (SVG) ───────────────────────────────────────

/** Breedte van de tekening in SVG-eenheden; zo is een eenheid ongeveer een pixel. */
const SVG_BREEDTE = 680;
const RAND = 16;
/** Richting van het licht voor de schaduw van de vlakken. */
const LICHT = eenheidsvector([0.35, -0.55, 1]);

function hexNaarRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

function tint(hex: string, k: number): string {
  const [r, g, b] = hexNaarRgb(KLEUR_RE.test(hex) ? (leesKleur(hex) ?? '#888888') : '#888888');
  const c = (v: number) => Math.max(0, Math.min(255, Math.round(v * k))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

function escapeHtml(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Een mooie stap voor een raster: 1, 2 of 5 maal een macht van tien. */
function mooieStap(ruw: number): number {
  if (!(ruw > 0)) return 1;
  const macht = 10 ** Math.floor(Math.log10(ruw));
  const f = ruw / macht;
  return (f < 1.5 ? 1 : f < 3.5 ? 2 : f < 7.5 ? 5 : 10) * macht;
}

type P2 = [number, number];
type Stuk =
  | { vorm: 'vlak'; laag: number; diepte: number; punten: P2[]; vul: string; lijn: string; dekking: number }
  | { vorm: 'lijn'; laag: number; diepte: number; punten: [P2, P2]; kleur: string; dikte: number }
  | { vorm: 'pijl'; laag: number; diepte: number; punten: [P2, P2]; kleur: string }
  | { vorm: 'bol'; laag: number; diepte: number; punten: [P2]; r: number; kleur: string }
  | { vorm: 'tekst'; laag: number; diepte: number; punten: [P2]; tekst: string; kleur: string };

/**
 * De scène als stilstaande projectie: dezelfde kijkrichting als het eerste
 * beeld van de app, maar loodrecht (zonder perspectief), de vlakken van
 * achter naar voren getekend. Staat er zonder WebGL en op papier.
 */
export function drieDSvg(scene: DrieDScene): string {
  const H = scene.hoogte;
  const { naarCamera, rechts, boven } = drieDBeeldvlak(scene.camera);
  const proj = (q: Punt3D): P2 => [punt(q, rechts), -punt(q, boven)];
  const diepte = (q: Punt3D) => punt(q, naarCamera);
  const S = drieDGrootte(scene);
  const stukken: Stuk[] = [];

  for (const el of scene.elementen) {
    switch (el.soort) {
      case 'staaf':
        stukken.push({ vorm: 'lijn', laag: 1, diepte: diepte(midden([el.van, el.naar])), punten: [proj(el.van), proj(el.naar)], kleur: el.kleur, dikte: 1.6 });
        break;
      case 'pijl':
        stukken.push({ vorm: 'pijl', laag: 1, diepte: diepte(midden([el.van, el.naar])), punten: [proj(el.van), proj(el.naar)], kleur: el.kleur });
        break;
      case 'knoop':
        stukken.push({ vorm: 'bol', laag: 1, diepte: diepte(el.plek), punten: [proj(el.plek)], r: el.r, kleur: el.kleur });
        break;
      case 'tekst':
        stukken.push({ vorm: 'tekst', laag: 3, diepte: diepte(el.plek), punten: [proj(el.plek)], tekst: el.tekst, kleur: el.kleur });
        break;
      case 'net':
        // Een open vlak: beide kanten zichtbaar, elk vlak in zijn eigen kleur, zonder
        // schaduw, zodat de kleur die van de legenda van het blad blijft.
        el.vlakken.forEach((v, i) => {
          const p = v.map((k) => el.punten[k]);
          const kleur = el.kleuren[i] ?? el.kleur;
          stukken.push({ vorm: 'vlak', laag: 1, diepte: diepte(midden(p)), punten: p.map(proj), vul: kleur, lijn: kleur, dekking: 1 });
        });
        break;
      default:
        for (const v of drieDVlakken(el)) {
          const n = eenheidsvector(normaal(v.punten));
          if (punt(n, naarCamera) <= 1e-6) continue;
          const k = 0.62 + 0.38 * Math.max(0, punt(n, LICHT));
          const vul = tint(el.kleur, k);
          // Wat doorzichtig is, komt over de rest: anders hangt het van de volgorde af wat erdoor te zien is.
          const dekking = el.soort === 'vlakken' ? el.opaciteit ?? 1 : 1;
          stukken.push({
            vorm: 'vlak', laag: dekking < 1 ? 2 : 1, diepte: diepte(midden(v.punten)), punten: v.punten.map(proj),
            vul, lijn: v.rand ? tint(el.kleur, 0.45) : vul,
            dekking,
          });
        }
    }
  }

  // Het raster op het grondvlak; van voren of opzij gezien is dat een streep.
  const g = drieDGrenzen(scene) ?? { min: [0, 0, 0] as Punt3D, max: [S, S, 0] as Punt3D };
  if (scene.raster && Math.abs(naarCamera[2]) > 0.2) {
    const marge = 0.15 * Math.max(g.max[0] - g.min[0], g.max[1] - g.min[1], S * 0.2);
    const stap = mooieStap(Math.max(g.max[0] - g.min[0], g.max[1] - g.min[1], S * 0.2) / 8);
    const x0 = Math.floor((g.min[0] - marge) / stap) * stap;
    const x1 = Math.ceil((g.max[0] + marge) / stap) * stap;
    const y0 = Math.floor((g.min[1] - marge) / stap) * stap;
    const y1 = Math.ceil((g.max[1] + marge) / stap) * stap;
    const z = g.min[2];
    for (let x = x0; x <= x1 + stap / 2; x += stap) {
      stukken.push({ vorm: 'lijn', laag: 0, diepte: 0, punten: [proj([x, y0, z]), proj([x, y1, z])], kleur: '#e2dfdc', dikte: 0.8 });
    }
    for (let y = y0; y <= y1 + stap / 2; y += stap) {
      stukken.push({ vorm: 'lijn', laag: 0, diepte: 0, punten: [proj([x0, y, z]), proj([x1, y, z])], kleur: '#e2dfdc', dikte: 0.8 });
    }
  }
  if (scene.assen) {
    const l = 0.12 * S;
    const assen: [Punt3D, string, string][] = [[[l, 0, 0], '#dc2626', 'x'], [[0, l, 0], '#16a34a', 'y'], [[0, 0, l], '#2563eb', 'z']];
    for (const [as, kleur, naam] of assen) {
      stukken.push({ vorm: 'lijn', laag: 2, diepte: 0, punten: [proj([0, 0, 0]), proj(as)], kleur, dikte: 1.6 });
      stukken.push({ vorm: 'tekst', laag: 2, diepte: 0, punten: [proj(maal(as, 1.12))], tekst: naam, kleur });
    }
  }

  // Passend maken: de getekende punten in het vak van SVG_BREEDTE × H.
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const s of stukken) {
    const r = s.vorm === 'bol' ? s.r : 0;
    for (const [x, y] of s.punten) {
      x0 = Math.min(x0, x - r); x1 = Math.max(x1, x + r);
      y0 = Math.min(y0, y - r); y1 = Math.max(y1, y + r);
    }
  }
  if (!Number.isFinite(x0)) { x0 = 0; x1 = 1; y0 = 0; y1 = 1; }
  const bw = Math.max(x1 - x0, 1e-9);
  const bh = Math.max(y1 - y0, 1e-9);
  const schaal = Math.min((SVG_BREEDTE - 2 * RAND) / bw, (H - 2 * RAND) / bh);
  const dx = (SVG_BREEDTE - bw * schaal) / 2 - x0 * schaal;
  const dy = (H - bh * schaal) / 2 - y0 * schaal;
  const t = ([x, y]: P2): P2 => [x * schaal + dx, y * schaal + dy];
  const f = (n: number) => String(Math.round(n * 10) / 10);
  const pt = (q: P2) => `${f(q[0])},${f(q[1])}`;

  stukken.sort((a, b) => a.laag - b.laag || a.diepte - b.diepte);
  const uit: string[] = [];
  for (const s of stukken) {
    if (!s.punten.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))) continue;
    switch (s.vorm) {
      case 'vlak':
        uit.push(`<polygon points="${s.punten.map((q) => pt(t(q))).join(' ')}" fill="${s.vul}"${s.dekking < 1 ? ` fill-opacity="${s.dekking}"` : ''} stroke="${s.lijn}" stroke-width="0.8" stroke-linejoin="round"/>`);
        break;
      case 'lijn': {
        const [a, b] = s.punten.map(t);
        uit.push(`<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(b[0])}" y2="${f(b[1])}" stroke="${s.kleur}" stroke-width="${s.dikte}" stroke-linecap="round"/>`);
        break;
      }
      case 'pijl': {
        const [a, b] = s.punten.map(t);
        const lx = b[0] - a[0];
        const ly = b[1] - a[1];
        const L = Math.hypot(lx, ly);
        if (L < 0.5) {
          uit.push(`<circle cx="${f(b[0])}" cy="${f(b[1])}" r="2.5" fill="${s.kleur}"/>`);
          break;
        }
        const kop = Math.min(9, 0.45 * L);
        const ux = lx / L;
        const uy = ly / L;
        const voet: P2 = [b[0] - ux * kop, b[1] - uy * kop];
        const zij: P2 = [-uy * kop * 0.42, ux * kop * 0.42];
        uit.push(`<line x1="${f(a[0])}" y1="${f(a[1])}" x2="${f(voet[0])}" y2="${f(voet[1])}" stroke="${s.kleur}" stroke-width="1.8"/>`);
        uit.push(`<polygon points="${pt(b)} ${pt([voet[0] + zij[0], voet[1] + zij[1]])} ${pt([voet[0] - zij[0], voet[1] - zij[1]])}" fill="${s.kleur}"/>`);
        break;
      }
      case 'bol': {
        const [c] = s.punten.map(t);
        uit.push(`<circle cx="${f(c[0])}" cy="${f(c[1])}" r="${f(Math.max(1.5, s.r * schaal))}" fill="${s.kleur}" stroke="${tint(s.kleur, 0.6)}" stroke-width="0.8"/>`);
        break;
      }
      case 'tekst': {
        const [c] = s.punten.map(t);
        uit.push(`<text x="${f(c[0] + 3)}" y="${f(c[1] - 3)}" fill="${s.kleur}" stroke="#fafaf9" stroke-width="3" paint-order="stroke" font-size="12" font-family="sans-serif">${escapeHtml(s.tekst)}</text>`);
        break;
      }
    }
  }
  return `<svg class="calc-3d-terugval" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${SVG_BREEDTE} ${H}" width="100%" height="${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="3D-beeld">${uit.join('')}</svg>`;
}

/**
 * Het blok in de uitwerking: de meldingen, dan het beeld. De scène staat als
 * JSON in `data-scene`; daaruit tekent de app het draaibare beeld en de
 * afbeelding voor de afdruk. Tot dan (en zonder WebGL) staat de projectie er.
 */
export function renderDrieD(node: EvaluatedDrieD): string {
  const meldingen = node.meldingen.length
    ? `<div class="calc-3d-meldingen">${node.meldingen.map((m) => `<p class="calc-3d-melding">${escapeHtml(m)}</p>`).join('')}</div>`
    : '';
  return `<div class="calc-3d" data-scene="${escapeHtml(jsonVoorAttribuut(node.scene))}">${meldingen}`
    + `<div class="calc-3d-beeld" style="height:${node.scene.hoogte}px">${drieDSvg(node.scene)}</div></div>`;
}
