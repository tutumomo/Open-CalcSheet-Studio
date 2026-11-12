import { math } from './eenheden.js';
import { femArgumenten, femRekenmodel, femSomLast, maakFemNet, type FemGeval, type FemInvoer, type FemLast } from './femNet.js';
import { FemModel, femGrootheid, femModelSvg, femSvg } from './femResultaat.js';
import { schemaHash, toetsHash } from './toetsBlok.js';
import type { EvaluatedFem, FemNode, FemRegel, FemRekenmodel, FemUitersten, FemUitkomstCompact, ToetsAntwoord, ToetsVerzoek } from './types.js';

/**
 * Een plaatmodel door Open FEM Studio: het blok `@fem`.
 *
 *   @fem vloer
 *     materiaal 33 GPa; 0.2
 *     maas 0.5 m
 *     plaat 0; 0; 10 m; 10 m; 250 mm
 *     plaat kop: 4.5 m; 4.5 m; 1 m; 1 m; 450 mm
 *     veren 0; 0; 3; 3; 5 m; 5 m; 200 MN/m; 400 mm
 *     geval G
 *       eigengewicht 25 kN/m^3
 *     geval Q
 *       vlaklast 5 kN/m^2; 0; 0; 5 m; 10 m
 *     combinatie UGT = 1.2*G + 1.5*Q
 *   @end
 *   m_Ed = vloer.UGT.mx_max
 *
 * CalcSheet heeft geen eigen plaatkern voor dit blok: het blad bouwt het model op, het
 * raster komt uit femNet.ts, en Open FEM Studio rekent elk belastinggeval met
 * `solve_open_fem_3d`. De combinaties telt CalcSheet lineair op; dat mag, want een plaat
 * rekent daar lineair. Het antwoord wordt opgezocht en vastgelegd zoals bij `@toets`
 * (toetsBlok.ts): per hash van de invoer op het blad, met het bewaarde verzoek erbij. Zie
 * docs/fem-model.md.
 *
 * Na het blok staan in de scope (een punt in een naam is een liggend streepje):
 *   <naam>                       het model, voor fem_waarde, fem_strook, fem_svg en `@3d`
 *   <naam>_<R>_mx_max, _mx_min, _my_max, _my_min, _mxy_max, _mxy_min   (kNm/m)
 *   <naam>_<R>_w_max, _w_min     doorbuiging, omlaag positief (mm)
 *   <naam>_<R>_R                 de reactie per veer (kN), in de volgorde van het blok
 *   <naam>_<R>_R_max, _R_min, _R_som
 *   <naam>_<R>_RL                de reactie per lijnsteun (kN)
 *   <naam>_mx_max, … _R_min      de omhullende over de combinaties (zonder combinaties:
 *                                over de gevallen)
 * met <R> elk geval en elke combinatie.
 */

export const FEM_START_RE = /^@fem\s+([\p{L}_][\p{L}\p{N}_]*)\s*$/iu;
/** De tool van FEM Studio die een plaatmodel rekent. */
export const FEM_TOOL = 'solve_open_fem_3d';

const IDENT = /^[\p{L}_][\p{L}\p{N}_]*$/u;
const FOR_RE = /^#for\s+([\p{L}_][\p{L}\p{N}_]*)\s*=\s*(.+?)\s*:\s*(.+)$/iu;
const LOOP_RE = /^#loop\b/i;
const IF_RE = /^#if\s+(.+)$/i;
const ELSE_IF_RE = /^#else\s*if\s+(.+)$/i;
const ELSE_RE = /^#else\b/i;
const ENDIF_RE = /^#end\s+if\b/i;

/** Per opdracht: hoeveel argumenten, en welke aantallen mogen. */
const OPDRACHTEN: Readonly<Record<string, { aantallen: number[]; vorm: string; last?: boolean }>> = {
  materiaal: { aantallen: [2], vorm: 'materiaal E; ν' },
  maas: { aantallen: [1], vorm: 'maas a' },
  analyse: { aantallen: [0], vorm: 'analyse lineair' },
  plaat: { aantallen: [5], vorm: 'plaat [naam:] x; y; l_x; l_y; t' },
  veer: { aantallen: [3, 4], vorm: 'veer x; y; k [; d_kop]' },
  veren: { aantallen: [7, 8], vorm: 'veren x_0; y_0; n_x; n_y; a_x; a_y; k [; d_kop]' },
  lijnsteun: { aantallen: [4, 5], vorm: 'lijnsteun x_1; y_1; x_2; y_2 [; k per m]' },
  geval: { aantallen: [0], vorm: 'geval naam' },
  vlaklast: { aantallen: [1, 2, 5], vorm: 'vlaklast q [; plaat] of vlaklast q; x; y; l_x; l_y', last: true },
  eigengewicht: { aantallen: [1], vorm: 'eigengewicht γ', last: true },
  puntlast: { aantallen: [3], vorm: 'puntlast F; x; y', last: true },
  combinatie: { aantallen: [1], vorm: 'combinatie naam = 1.2*G + 1.5*Q' },
  beeld: { aantallen: [0], vorm: 'beeld UGT mx (een geval of combinatie, en w, mx, my, mxy, vx of vy)' },
};

/** Splitst op `;` buiten haakjes en aanhalingstekens. */
function splitsArgumenten(tekst: string): string[] {
  const uit: string[] = [];
  let diepte = 0;
  let tekenreeks = false;
  let begin = 0;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (c === '"') tekenreeks = !tekenreeks;
    else if (tekenreeks) continue;
    else if ('([{'.includes(c)) diepte++;
    else if (')]}'.includes(c)) diepte--;
    else if (c === ';' && diepte === 0) {
      uit.push(tekst.slice(begin, i).trim());
      begin = i + 1;
    }
  }
  uit.push(tekst.slice(begin).trim());
  return uit.length === 1 && uit[0] === '' ? [] : uit;
}

// ── Lezen ────────────────────────────────────────────────────────────────────

/** De regels tussen `@fem naam` en `@end`. Fouten worden meldingen met het regelnummer. */
export function leesFemBlok(naam: string, bron: string[], normaliseer: (expr: string) => string): Omit<FemNode, 'type'> {
  const fouten: string[] = [];
  const meld = (nr: number, tekst: string) => fouten.push(`regel ${nr}: ${tekst}`);
  const gevallen = new Set<string>();
  const combinaties = new Set<string>();
  let inGeval = false;
  let i = 0;

  function blok(eindes: RegExp[]): { regels: FemRegel[]; eind: string | null } {
    const uit: FemRegel[] = [];
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
        uit.push({ soort: 'for', regel: nr, teller: voor[1], van: normaliseer(voor[2].trim()), tot: normaliseer(voor[3].trim()), body: binnen.regels });
        continue;
      }
      const als = t.match(IF_RE);
      if (als) {
        const takken: { voorwaarde: string; body: FemRegel[] }[] = [{ voorwaarde: normaliseer(als[1].trim()), body: [] }];
        const anders: FemRegel[] = [];
        let huidig = takken[0].body;
        for (;;) {
          const b = blok([ELSE_IF_RE, ELSE_RE, ENDIF_RE]);
          huidig.push(...b.regels);
          if (b.eind === null) { meld(nr, '#if zonder #end if'); break; }
          i++;
          if (ENDIF_RE.test(b.eind)) break;
          const andersAls = b.eind.match(ELSE_IF_RE);
          if (andersAls) {
            const tak = { voorwaarde: normaliseer(andersAls[1].trim()), body: [] as FemRegel[] };
            takken.push(tak);
            huidig = tak.body;
          } else {
            huidig = anders;
          }
        }
        uit.push({ soort: 'if', regel: nr, takken, anders });
        continue;
      }
      if (t.startsWith('#')) {
        meld(nr, `onbekende opdracht "${t.split(/\s+/)[0]}" (in een @fem-blok: #for … #loop en #if … #end if)`);
        continue;
      }
      const m = t.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*(.*)$/u);
      const woord = m?.[1].toLowerCase() ?? '';
      const soort = OPDRACHTEN[woord];
      if (!m || !soort) {
        meld(nr, `onbekend woord "${m?.[1] ?? t}" (bekend: ${Object.keys(OPDRACHTEN).join(', ')})`);
        continue;
      }
      const rest = m[2].trim();
      if (soort.last && !inGeval) {
        meld(nr, `${woord} hoort bij een belastinggeval: zet eerst geval naam`);
        continue;
      }
      if (woord === 'geval' || woord === 'analyse') {
        const [n, ...omschrijving] = rest.split(/\s+/);
        if (!n || !(woord === 'geval' ? IDENT : /^[\p{L}\p{N}_-]+$/u).test(n)) { meld(nr, `schrijf ${soort.vorm}`); continue; }
        if (woord === 'geval') {
          if (gevallen.has(n) || combinaties.has(n)) { meld(nr, `het geval ${n} staat er al`); continue; }
          gevallen.add(n);
          inGeval = true;
        }
        uit.push({ soort: 'opdracht', regel: nr, woord, naam: n, args: omschrijving.length ? [omschrijving.join(' ').replace(/^"(.*)"$/, '$1')] : [] });
        continue;
      }
      if (woord === 'beeld') {
        const delen = rest.split(/\s+/);
        if (delen.length !== 2 || !IDENT.test(delen[0]) || !/^[a-z]+$/i.test(delen[1])) { meld(nr, `schrijf ${soort.vorm}`); continue; }
        uit.push({ soort: 'opdracht', regel: nr, woord, naam: delen[0], args: [delen[1]] });
        continue;
      }
      if (woord === 'combinatie') {
        const c = rest.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*=\s*(.+)$/u);
        if (!c) { meld(nr, `schrijf ${soort.vorm}`); continue; }
        if (gevallen.has(c[1]) || combinaties.has(c[1])) { meld(nr, `de naam ${c[1]} is al een geval of combinatie`); continue; }
        combinaties.add(c[1]);
        uit.push({ soort: 'opdracht', regel: nr, woord, naam: c[1], args: [normaliseer(c[2].trim())] });
        continue;
      }
      let plaatNaam: string | undefined;
      let tekst = rest;
      if (woord === 'plaat') {
        const n = rest.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*:(?!=)\s*(.*)$/u);
        if (n) [plaatNaam, tekst] = [n[1], n[2]];
      }
      const args = splitsArgumenten(tekst);
      if (!soort.aantallen.includes(args.length)) {
        meld(nr, `${woord} verwacht ${soort.aantallen.join(' of ')} waarden (${soort.vorm}), er staan er ${args.length}`);
        continue;
      }
      if (woord === 'vlaklast' && args.length === 2 && !IDENT.test(args[1])) {
        meld(nr, 'vlaklast q; naam: de tweede waarde is de naam van een plaat');
        continue;
      }
      uit.push({
        soort: 'opdracht', regel: nr, woord,
        args: args.map((a, k) => (woord === 'vlaklast' && args.length === 2 && k === 1 ? a : normaliseer(a))),
        ...(plaatNaam ? { naam: plaatNaam } : {}),
      });
    }
    return { regels: uit, eind: null };
  }

  const { regels } = blok([]);
  return { naam, regels, fouten };
}

// ── Rekenen ──────────────────────────────────────────────────────────────────

/** Wat het blok nodig heeft van de rekenkern (evaluator.ts). */
export interface FemRekenaar {
  reken(expr: string): unknown;
  /** Zet een naam (een teller, een geval in een combinatie) en geeft de functie die hem terugzet. */
  zet(naam: string, waarde: unknown): () => void;
  scope: Record<string, unknown>;
  opties: {
    toetsingen?: Record<string, ToetsAntwoord>;
    toetsModus?: 'vragen' | 'lezen';
    taal?: string;
    fem?: { versie?: string; schemas?: Record<string, string> };
  };
}

type MathUnit = { toNumber(eenheid?: string): number; toString(): string; dimensions?: number[] };
const isUnit = (w: unknown): w is MathUnit => math.isUnit(w);

/** Een waarde als getal in `eenheid`; een kaal getal telt in die eenheid. */
function alsGetal(w: unknown, eenheid: string, wat: string): number {
  let n: number;
  if (isUnit(w)) {
    if (!eenheid) {
      if (w.dimensions && w.dimensions.every((d) => d === 0)) n = w.toNumber();
      else throw new Error(`${wat}: ${w.toString()} heeft een eenheid, hier hoort een getal`);
    } else {
      try {
        n = w.toNumber(eenheid);
      } catch {
        throw new Error(`${wat}: ${w.toString()} past niet in ${eenheid}`);
      }
    }
  } else if (typeof w === 'number') n = w;
  else if (typeof w === 'boolean') n = w ? 1 : 0;
  else if (math.isFraction(w) || math.isBigNumber(w)) n = Number(w);
  else throw new Error(`${wat}: geen getal`);
  if (!Number.isFinite(n)) throw new Error(`${wat}: geen eindig getal`);
  return n;
}

const SUFFIXEN = ['mx_max', 'mx_min', 'my_max', 'my_min', 'mxy_max', 'mxy_min', 'w_max', 'w_min', 'R', 'R_max', 'R_min', 'R_som', 'RL'];

/** De namen van gevallen en combinaties in het blok, ook in #for en #if. */
function setNamen(regels: FemRegel[], uit = new Set<string>()): Set<string> {
  for (const r of regels) {
    if (r.soort === 'opdracht' && (r.woord === 'geval' || r.woord === 'combinatie') && r.naam) uit.add(r.naam);
    else if (r.soort === 'for') setNamen(r.body, uit);
    else if (r.soort === 'if') {
      for (const t of r.takken) setNamen(t.body, uit);
      setNamen(r.anders, uit);
    }
  }
  return uit;
}

/** Haalt de uitkomsten van een eerder blok met dezelfde naam weg: geen oude uitkomst laten staan. */
function wisVariabelen(node: FemNode, scope: Record<string, unknown>): void {
  delete scope[node.naam];
  for (const s of SUFFIXEN) delete scope[`${node.naam}_${s}`];
  for (const set of setNamen(node.regels)) for (const s of SUFFIXEN) delete scope[`${node.naam}_${set}_${s}`];
}

const metEenheid = (v: number, eenheid: string) => math.unit(v, eenheid);
const KNM = 'kN m / m';

function zetVariabelen(naam: string, model: FemModel, sets: FemUitersten[], scope: Record<string, unknown>): void {
  scope[naam] = model;
  const zet = (sleutel: string, u: FemUitersten | Omit<FemUitersten, 'naam' | 'soort'>) => {
    scope[`${sleutel}_mx_max`] = metEenheid(u.mxMax, KNM);
    scope[`${sleutel}_mx_min`] = metEenheid(u.mxMin, KNM);
    scope[`${sleutel}_my_max`] = metEenheid(u.myMax, KNM);
    scope[`${sleutel}_my_min`] = metEenheid(u.myMin, KNM);
    scope[`${sleutel}_mxy_max`] = metEenheid(u.mxyMax, KNM);
    scope[`${sleutel}_mxy_min`] = metEenheid(u.mxyMin, KNM);
    scope[`${sleutel}_w_max`] = metEenheid(u.wMax, 'mm');
    scope[`${sleutel}_w_min`] = metEenheid(u.wMin, 'mm');
    if (u.RMax !== null) scope[`${sleutel}_R_max`] = metEenheid(u.RMax, 'kN');
    if (u.RMin !== null) scope[`${sleutel}_R_min`] = metEenheid(u.RMin, 'kN');
  };
  for (const u of sets) {
    const s = model.set(u.naam);
    zet(`${naam}_${u.naam}`, u);
    const R = model.verenReactie(s);
    if (R.length) {
      scope[`${naam}_${u.naam}_R`] = math.matrix(R.map((r) => metEenheid(r, 'kN')) as unknown as number[]);
      scope[`${naam}_${u.naam}_R_som`] = metEenheid(R.reduce((t, r) => t + r, 0), 'kN');
    }
    const RL = model.lijnenReactie(s);
    if (RL.length) scope[`${naam}_${u.naam}_RL`] = math.matrix(RL.map((r) => metEenheid(r, 'kN')) as unknown as number[]);
  }
  // De omhullende: over de combinaties, of over de gevallen als er geen combinaties zijn.
  const deel = sets.some((u) => u.soort === 'combinatie') ? sets.filter((u) => u.soort === 'combinatie') : sets;
  const max = (f: (u: FemUitersten) => number | null) => Math.max(...deel.map(f).filter((v): v is number => v !== null));
  const min = (f: (u: FemUitersten) => number | null) => Math.min(...deel.map(f).filter((v): v is number => v !== null));
  zet(naam, {
    mxMax: max((u) => u.mxMax), mxMin: min((u) => u.mxMin), myMax: max((u) => u.myMax), myMin: min((u) => u.myMin),
    mxyMax: max((u) => u.mxyMax), mxyMin: min((u) => u.mxyMin), wMax: max((u) => u.wMax), wMin: min((u) => u.wMin),
    RMax: deel[0].RMax === null ? null : max((u) => u.RMax), RMin: deel[0].RMin === null ? null : min((u) => u.RMin),
  });
}

const melding = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error:\s*/, '');

interface Gelezen {
  invoer: FemInvoer;
  /** Per combinatie de factor van elk geval. */
  combinaties: { naam: string; factoren: number[] }[];
  /** De beelden onder het blok: een geval of combinatie en een grootheid. */
  beelden: { set: string; grootheid: string }[];
  fouten: string[];
}

/** Rekent de regels door tot een model in getallen. */
function leesInvoer(node: FemNode, r: FemRekenaar): Gelezen {
  const fouten: string[] = [];
  const meld = (nr: number, tekst: string) => fouten.push(`regel ${nr}: ${tekst}`);
  const inv: FemInvoer = { E: NaN, nu: NaN, maas: 0.5, platen: [], veren: [], lijnen: [], gevallen: [] };
  const plaatNamen = new Map<string, number>();
  const opPlaat: { last: Extract<FemLast, { soort: 'vlak' }>; naam: string; regel: number }[] = [];
  const combinaties: { naam: string; expr: string; regel: number }[] = [];
  const beelden: { set: string; grootheid: string; regel: number }[] = [];
  let materiaal = false;
  let geval: FemGeval | null = null;

  // Op twaalf cijfers: 350 mm is dan 0,35 m, niet 0,35000000000000003.
  const getal = (expr: string, eenheid: string, wat: string) => Number(alsGetal(r.reken(expr), eenheid, wat).toPrecision(12));
  const inGeval = (): FemGeval => {
    if (!geval) throw new Error('een last hoort bij een belastinggeval: zet eerst geval naam');
    return geval;
  };

  function opdracht(o: Extract<FemRegel, { soort: 'opdracht' }>) {
    const a = o.args;
    const lengte = (k: number, wat: string) => getal(a[k], 'm', wat);
    switch (o.woord) {
      case 'materiaal': {
        inv.E = getal(a[0], 'MPa', 'E');
        inv.nu = getal(a[1], '', 'ν');
        if (!(inv.E > 0)) throw new Error('E moet groter dan 0 zijn');
        if (!(inv.nu >= 0 && inv.nu < 0.5)) throw new Error('ν ligt tussen 0 en 0,5');
        materiaal = true;
        break;
      }
      case 'maas':
        inv.maas = lengte(0, 'de maas');
        if (!(inv.maas > 0)) throw new Error('de maas moet groter dan 0 zijn');
        break;
      case 'analyse':
        if (!/^(lineair|linear)$/i.test(o.naam ?? '')) {
          throw new Error(`FEM Studio rekent een model met platen nog alleen lineair (analyse lineair), niet "${o.naam}"`);
        }
        break;
      case 'plaat': {
        const [x, y, lx, ly, t] = [lengte(0, 'x'), lengte(1, 'y'), lengte(2, 'l_x'), lengte(3, 'l_y'), lengte(4, 't')];
        if (!(lx > 0 && ly > 0)) throw new Error('l_x en l_y moeten groter dan 0 zijn');
        if (!(t > 0)) throw new Error('de dikte moet groter dan 0 zijn');
        if (o.naam) {
          if (plaatNamen.has(o.naam)) throw new Error(`de plaat ${o.naam} staat er al`);
          plaatNamen.set(o.naam, inv.platen.length);
        }
        inv.platen.push({ x0: x, y0: y, x1: x + lx, y1: y + ly, t });
        break;
      }
      case 'veer': {
        const k = getal(a[2], 'kN/m', 'k');
        const d = a.length > 3 ? lengte(3, 'd_kop') : 0;
        if (!(k > 0)) throw new Error('de veer k moet groter dan 0 zijn');
        if (!(d >= 0)) throw new Error('de paalkop d mag niet negatief zijn');
        inv.veren.push({ x: lengte(0, 'x'), y: lengte(1, 'y'), k, d });
        break;
      }
      case 'veren': {
        const [x0, y0] = [lengte(0, 'x_0'), lengte(1, 'y_0')];
        const [nx, ny] = [getal(a[2], '', 'n_x'), getal(a[3], '', 'n_y')];
        const [ax, ay] = [lengte(4, 'a_x'), lengte(5, 'a_y')];
        const k = getal(a[6], 'kN/m', 'k');
        const d = a.length > 7 ? lengte(7, 'd_kop') : 0;
        if (!(Number.isInteger(nx) && Number.isInteger(ny) && nx >= 1 && ny >= 1)) throw new Error('n_x en n_y zijn hele getallen vanaf 1');
        if (nx * ny > 2000) throw new Error('meer dan 2000 veren');
        if (!(k > 0)) throw new Error('de veer k moet groter dan 0 zijn');
        if (!(d >= 0)) throw new Error('de paalkop d mag niet negatief zijn');
        for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) inv.veren.push({ x: x0 + i * ax, y: y0 + j * ay, k, d });
        break;
      }
      case 'lijnsteun': {
        const k = a.length > 4 ? getal(a[4], 'kN/m^2', 'k per m') : null;
        if (k !== null && !(k > 0)) throw new Error('de veer k per m moet groter dan 0 zijn; zonder k is de lijn vast');
        inv.lijnen.push({ x1: lengte(0, 'x_1'), y1: lengte(1, 'y_1'), x2: lengte(2, 'x_2'), y2: lengte(3, 'y_2'), k });
        break;
      }
      case 'geval': {
        if (inv.gevallen.some((g) => g.naam === o.naam)) throw new Error(`het geval ${o.naam} staat er al`);
        geval = { naam: o.naam!, lasten: [] };
        inv.gevallen.push(geval);
        break;
      }
      case 'vlaklast': {
        const q = getal(a[0], 'kN/m^2', 'q');
        if (a.length === 1) inGeval().lasten.push({ soort: 'vlak', q });
        else if (a.length === 2) {
          const last: Extract<FemLast, { soort: 'vlak' }> = { soort: 'vlak', q, rechthoek: [0, 0, 0, 0] };
          inGeval().lasten.push(last);
          opPlaat.push({ last, naam: a[1], regel: o.regel });
        } else {
          const [x, y, lx, ly] = [lengte(1, 'x'), lengte(2, 'y'), lengte(3, 'l_x'), lengte(4, 'l_y')];
          if (!(lx > 0 && ly > 0)) throw new Error('l_x en l_y moeten groter dan 0 zijn');
          inGeval().lasten.push({ soort: 'vlak', q, rechthoek: [x, y, x + lx, y + ly] });
        }
        break;
      }
      case 'eigengewicht':
        inGeval().lasten.push({ soort: 'eigengewicht', gamma: getal(a[0], 'kN/m^3', 'γ') });
        break;
      case 'puntlast':
        inGeval().lasten.push({ soort: 'punt', F: getal(a[0], 'kN', 'F'), x: lengte(1, 'x'), y: lengte(2, 'y') });
        break;
      case 'combinatie':
        if (combinaties.some((c) => c.naam === o.naam)) throw new Error(`de combinatie ${o.naam} staat er al`);
        combinaties.push({ naam: o.naam!, expr: a[0], regel: o.regel });
        break;
      case 'beeld':
        femGrootheid(a[0]);
        beelden.push({ set: o.naam!, grootheid: a[0], regel: o.regel });
        break;
    }
  }

  let rondes = 0;
  function voerUit(regels: FemRegel[]) {
    for (const regel of regels) {
      if (regel.soort === 'opdracht') {
        try {
          opdracht(regel);
        } catch (e) {
          meld(regel.regel, melding(e));
        }
      } else if (regel.soort === 'for') {
        let van: number;
        let tot: number;
        try {
          van = getal(regel.van, '', '#for');
          tot = getal(regel.tot, '', '#for');
        } catch (e) {
          meld(regel.regel, melding(e));
          continue;
        }
        for (let k = van; k <= tot + 1e-9; k++) {
          if (++rondes > 10000) {
            meld(regel.regel, '#for: meer dan 10000 rondes');
            return;
          }
          const herstel = r.zet(regel.teller, k);
          try {
            voerUit(regel.body);
          } finally {
            herstel();
          }
        }
      } else {
        let gekozen: FemRegel[] | null = null;
        for (const tak of regel.takken) {
          try {
            if (getal(tak.voorwaarde, '', '#if') !== 0) { gekozen = tak.body; break; }
          } catch (e) {
            meld(regel.regel, melding(e));
            gekozen = [];
            break;
          }
        }
        voerUit(gekozen ?? regel.anders);
      }
    }
  }
  voerUit(node.regels);

  for (const p of opPlaat) {
    const i = plaatNamen.get(p.naam);
    if (i === undefined) meld(p.regel, `er is geen plaat ${p.naam} (een plaat krijgt een naam met plaat ${p.naam}: x; y; …)`);
    else p.last.rechthoek = [inv.platen[i].x0, inv.platen[i].y0, inv.platen[i].x1, inv.platen[i].y1];
  }
  if (!materiaal) fouten.push('het model heeft geen materiaal: materiaal E; ν');
  if (!inv.platen.length) fouten.push('het model heeft geen plaat');
  if (!inv.gevallen.length) fouten.push('het model heeft geen belastinggeval: geval naam');
  for (const g of inv.gevallen) if (!g.lasten.length) fouten.push(`het geval ${g.naam} heeft geen lasten`);

  // Een combinatie is een gewone uitdrukking in de namen van de gevallen; de factor van
  // een geval is de waarde met dat geval 1 en de andere 0, en de som moet lineair zijn.
  const namen = inv.gevallen.map((g) => g.naam);
  const uitCombinaties: { naam: string; factoren: number[] }[] = [];
  for (const c of combinaties) {
    const herstel = namen.map((n) => r.zet(n, 0));
    try {
      const waarde = () => getal(c.expr, '', 'combinatie');
      const nul = waarde();
      const factoren = namen.map((n) => {
        r.zet(n, 1);
        const een = waarde();
        r.zet(n, 2);
        const twee = waarde();
        r.zet(n, 0);
        if (Math.abs(twee - 2 * een + nul) > 1e-9 * Math.max(1, Math.abs(een))) throw new Error(`${c.naam} is geen som van factor maal geval`);
        return een - nul;
      });
      if (Math.abs(nul) > 1e-12) throw new Error(`${c.naam} heeft een deel zonder geval`);
      uitCombinaties.push({ naam: c.naam, factoren });
    } catch (e) {
      meld(c.regel, melding(e));
    } finally {
      for (const h of herstel.reverse()) h();
    }
  }
  for (const b of beelden) {
    if (!namen.includes(b.set) && !combinaties.some((c) => c.naam === b.set)) meld(b.regel, `beeld: er is geen geval of combinatie ${b.set}`);
  }
  return { invoer: inv, combinaties: uitCombinaties, beelden, fouten };
}

/** Is het antwoord gemaakt met een andere FEM Studio of een ander schema dan die van nu? */
function verouderdVan(a: { versie?: string; schema?: string }, fem: FemRekenaar['opties']['fem']): EvaluatedFem['verouderd'] {
  if (!fem) return undefined;
  if (fem.versie && a.versie && fem.versie !== a.versie) return { versie: fem.versie };
  const nu = fem.schemas?.[FEM_TOOL];
  if (nu && a.schema && nu !== a.schema) return { schema: true };
  return undefined;
}

/** Een vingerafdruk van het raster in een bewaard verzoek: alle gevallen moeten hetzelfde hebben. */
const rasterHash = (m: FemRekenmodel) => schemaHash({ x: m.x, y: m.y, el: m.el, pl: m.pl, t: m.t, veren: m.veren, lijnen: m.lijnen });

const isCompact = (u: unknown): u is FemUitkomstCompact =>
  !!u && typeof u === 'object' && (u as FemUitkomstCompact).vorm === 'fem-plaat/1' && Array.isArray((u as FemUitkomstCompact).uz);

export function bouwFem(node: FemNode, r: FemRekenaar): EvaluatedFem {
  const taal = r.opties.taal?.toLowerCase().startsWith('en') ? 'en' : 'nl';
  const basis = {
    type: 'fem' as const,
    naam: node.naam,
    taal,
    gevallen: [] as EvaluatedFem['gevallen'],
    ...(node.hidden ? { verborgen: true } : {}),
    ...(node.scherm ? { scherm: true } : {}),
  };
  wisVariabelen(node, r.scope);
  if (node.fouten.length) return { ...basis, status: 'fout', melding: node.fouten.join('; ') };

  const { invoer, combinaties, beelden, fouten } = leesInvoer(node, r);
  if (fouten.length) return { ...basis, status: 'fout', melding: fouten.join('; ') };
  let modellen: FemRekenmodel[];
  try {
    const net = maakFemNet(invoer);
    modellen = invoer.gevallen.map((_, g) => femRekenmodel(net, invoer, g));
  } catch (e) {
    return { ...basis, status: 'fout', melding: melding(e) };
  }
  const eerste = modellen[0];
  const model: EvaluatedFem['model'] = {
    knopen: eerste.x.length,
    elementen: eerste.pl.length,
    maas: invoer.maas,
    veren: eerste.veren.length,
    lijnen: eerste.lijnen.length,
    dikten: [...new Set(eerste.pl.map((p) => eerste.t[p]))].sort((a, b) => a - b),
  };
  // De hash: het hele model en de naam van het geval. Een last in een ander geval kan het
  // raster verschuiven, dus elk geval hangt van alles af; de combinaties niet.
  const hashes = invoer.gevallen.map((g) => toetsHash(FEM_TOOL, { fem: invoer, geval: g.naam }));
  const gevallen = invoer.gevallen.map((g, i) => ({ naam: g.naam, hash: hashes[i], somLast: femSomLast(modellen[i]) }));
  const vragen = r.opties.toetsModus === 'vragen';
  const antwoorden = hashes.map((h) => r.opties.toetsingen?.[h]);
  const metModel = { ...basis, gevallen, model, modelSvg: femModelSvg(eerste, taal), hashes };

  const ontbreekt = antwoorden.map((a, i) => (a ? -1 : i)).filter((i) => i >= 0);
  if (ontbreekt.length) {
    if (!vragen) return { ...metModel, status: 'niet-gerekend', melding: WOORDEN[taal].geenAntwoord };
    const verzoeken: ToetsVerzoek[] = ontbreekt.map((i) => ({ hash: hashes[i], tool: FEM_TOOL, argumenten: {}, bewaar: modellen[i] }));
    return { ...metModel, status: 'wacht', verzoeken };
  }
  const fout = antwoorden.find((a): a is Extract<ToetsAntwoord, { ok: false }> => !!a && !a.ok);
  if (fout) return { ...metModel, status: 'fout', melding: fout.melding, ...(vragen ? { opnieuw: true } : {}) };
  const goed = antwoorden as Extract<ToetsAntwoord, { ok: true }>[];
  const herkomst = {
    ...(goed[0].versie ? { versie: goed[0].versie } : {}),
    ...(goed.some((a) => a.datum) ? { datum: goed.map((a) => a.datum ?? '').sort().pop() } : {}),
    ...(goed.find((a) => a.waarschuwing) ? { waarschuwing: goed.find((a) => a.waarschuwing)!.waarschuwing } : {}),
  };
  if (!goed.every((a) => isCompact(a.uitkomst))) {
    return { ...metModel, status: 'fout', melding: 'het vastgelegde antwoord is niet te lezen', ...herkomst, ...(vragen ? { opnieuw: true } : {}) };
  }
  // Het raster van het bewaarde verzoek: daar horen de getallen bij.
  const bewaard = goed.map((a, i) => a.verzoek ?? modellen[i]);
  const raster = rasterHash(bewaard[0]);
  if (bewaard.some((m) => rasterHash(m) !== raster)) {
    return { ...metModel, status: 'fout', melding: WOORDEN[taal].ander, ...herkomst, ...(vragen ? { opnieuw: true } : {}) };
  }
  const uitkomsten = goed.map((a) => a.uitkomst as FemUitkomstCompact);
  if (uitkomsten.some((u) => u.uz.length !== bewaard[0].x.length)) {
    return { ...metModel, status: 'fout', melding: 'het vastgelegde antwoord past niet bij zijn raster', ...herkomst, ...(vragen ? { opnieuw: true } : {}) };
  }
  let femModel: FemModel;
  try {
    femModel = new FemModel(node.naam, bewaard[0], {
      gevallen: invoer.gevallen.map((g, i) => ({ naam: g.naam, uitkomst: uitkomsten[i] })),
      combinaties,
    });
  } catch (e) {
    return { ...metModel, status: 'fout', melding: melding(e), ...herkomst };
  }
  const uitersten = [...femModel.sets.values()].map((s) => femModel.uitersten(s));
  zetVariabelen(node.naam, femModel, uitersten, r.scope);
  const verouderd = vragen ? goed.map((a) => verouderdVan(a, r.opties.fem)).find((v) => v) : undefined;
  const opnieuw = vragen && (!!verouderd || !!herkomst.waarschuwing);
  return {
    ...metModel,
    gevallen: gevallen.map((g, i) => ({ ...g, somLast: uitkomsten[i].som.last, somR: uitkomsten[i].som.reactie })),
    modelSvg: femModelSvg(bewaard[0], taal),
    model: { ...model, knopen: bewaard[0].x.length, elementen: bewaard[0].pl.length },
    status: 'klaar',
    uitersten,
    ...(beelden.length ? { beelden: beelden.map((b) => femSvg(femModel, b.set, b.grootheid, 640, taal)) } : {}),
    ...herkomst,
    ...(verouderd ? { verouderd } : {}),
    ...(opnieuw ? { opnieuw } : {}),
  };
}

/** De JSON die FEM Studio krijgt voor een verzoek van een `@fem`-blok. */
export function femVerzoekArgumenten(v: ToetsVerzoek): Record<string, unknown> {
  return v.bewaar ? femArgumenten(v.bewaar) : v.argumenten;
}

// ── Tonen ────────────────────────────────────────────────────────────────────

const WOORDEN = {
  nl: {
    model: 'FEM-model', door: 'Open FEM Studio', versie: 'versie',
    wacht: 'Wordt gerekend door Open FEM Studio…', nietGerekend: 'NIET GEREKEND',
    geenAntwoord: 'er is geen antwoord van Open FEM Studio',
    ander: 'de belastinggevallen zijn met een ander raster gerekend; reken opnieuw',
    opnieuw: 'Opnieuw rekenen', mislukt: 'Opnieuw rekenen lukte niet',
    samenvatting: (k: number, e: number, maas: string, v: number, l: number) =>
      `${k} knopen, ${e} vierhoeken (MITC4), maas ten hoogste ${maas} m; ${v} ${v === 1 ? 'veer' : 'veren'}${l ? `, ${l} ${l === 1 ? 'lijnsteun' : 'lijnsteunen'}` : ''}; lineair.`,
    geval: 'Belastinggeval', last: 'Σ last', reactie: 'Σ R', set: 'Geval of combinatie',
    verouderdVersie: (oud: string, nu: string) => `Gerekend met versie ${oud}; deze CalcSheet heeft FEM Studio ${nu}.`,
    verouderdSchema: 'Het schema van solve_open_fem_3d is veranderd sinds deze berekening.',
  },
  en: {
    model: 'FEM model', door: 'Open FEM Studio', versie: 'version',
    wacht: 'Being calculated by Open FEM Studio…', nietGerekend: 'NOT CALCULATED',
    geenAntwoord: 'there is no answer from Open FEM Studio',
    ander: 'the load cases were calculated with a different mesh; calculate again',
    opnieuw: 'Calculate again', mislukt: 'Calculating again failed',
    samenvatting: (k: number, e: number, maas: string, v: number, l: number) =>
      `${k} nodes, ${e} quadrilaterals (MITC4), mesh at most ${maas} m; ${v} ${v === 1 ? 'spring' : 'springs'}${l ? `, ${l} line ${l === 1 ? 'support' : 'supports'}` : ''}; linear.`,
    geval: 'Load case', last: 'Σ load', reactie: 'Σ R', set: 'Case or combination',
    verouderdVersie: (oud: string, nu: string) => `Calculated with version ${oud}; this CalcSheet has FEM Studio ${nu}.`,
    verouderdSchema: 'The schema of solve_open_fem_3d has changed since this calculation.',
  },
} as const;

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function getalTekst(v: number | null, taal: string, decimalen = 2): string {
  if (v === null || !Number.isFinite(v)) return '–';
  const t = v.toFixed(decimalen);
  const n = /^-0[.]?0*$/.test(t) ? t.slice(1) : t;
  return taal === 'nl' ? n.replace('.', ',') : n;
}

function datumTekst(iso: string, taal: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  return taal === 'nl' ? `${Number(m[3])}-${Number(m[2])}-${m[1]}` : `${m[1]}-${m[2]}-${m[3]}`;
}

/** Het blok op het blad: de kop, het model, de gevallen en per geval en combinatie de uitersten. */
export function renderFem(node: EvaluatedFem): string {
  if (node.verborgen) return '';
  const w = WOORDEN[node.taal === 'en' ? 'en' : 'nl'];
  const t = node.taal;
  const datum = node.datum ? datumTekst(node.datum, t) : '';
  const kop = `<p class="calc-fem-kop"><strong>${esc(w.model)} ${esc(node.naam)}</strong> — <code>${FEM_TOOL}</code>, ${esc(w.door)}${node.versie ? ` ${esc(w.versie)} ${esc(node.versie)}` : ''}${datum ? `<span class="alleen-scherm">, ${esc(datum)}</span>` : ''}</p>`;
  const scherm = node.scherm ? ' alleen-scherm' : '';
  const hashes = (node.hashes ?? []).join(' ');
  const knop = node.opnieuw && hashes ? ` <button type="button" class="calc-toets-opnieuw" data-toets-opnieuw="${esc(hashes)}">${esc(w.opnieuw)}</button>` : '';
  const m = node.model;
  const samenvatting = m ? `<p class="calc-fem-samenvatting">${esc(w.samenvatting(m.knopen, m.elementen, getalTekst(m.maas, t), m.veren, m.lijnen))}</p>` : '';
  const beeld = node.modelSvg ? `<div class="calc-fem-modelbeeld">${node.modelSvg}</div>` : '';
  if (node.status === 'wacht') {
    return `<div class="calc-fem calc-fem-wacht${scherm}" data-fem="${esc(hashes)}">${kop}${samenvatting}${beeld}<p>${esc(w.wacht)}</p></div>`;
  }
  if (node.status !== 'klaar' || !node.uitersten) {
    const tekst = `${w.nietGerekend}${node.melding ? `: ${node.melding}` : ''}`;
    const opnieuw = knop ? `<p class="alleen-scherm">${knop.trim()}</p>` : '';
    return `<div class="calc-fem calc-fem-fout${scherm}" data-fem="${esc(hashes)}">${kop}${samenvatting}${beeld}<p class="calc-fem-melding">${esc(tekst)}</p>${opnieuw}</div>`;
  }
  const meldingen = [
    node.verouderd?.versie && node.versie ? w.verouderdVersie(node.versie, node.verouderd.versie) : '',
    node.verouderd?.schema ? w.verouderdSchema : '',
    node.waarschuwing ? `${w.mislukt}: ${node.waarschuwing}` : '',
  ].filter(Boolean);
  const verouderd = meldingen.length || knop ? `<p class="calc-toets-verouderd alleen-scherm">${meldingen.map(esc).join(' ')}${knop}</p>` : '';
  const gevallen = `<table class="calc-fem-tabel"><thead><tr><th>${esc(w.geval)}</th><th>${esc(w.last)} [kN]</th><th>${esc(w.reactie)} [kN]</th></tr></thead><tbody>${node.gevallen
    .map((g) => `<tr><td>${esc(g.naam)}</td><td class="getal">${getalTekst(g.somLast ?? null, t, 1)}</td><td class="getal">${getalTekst(g.somR ?? null, t, 1)}</td></tr>`)
    .join('')}</tbody></table>`;
  const veren = node.uitersten.some((u) => u.RMax !== null);
  const kol = (h: string) => `<th>${h}</th>`;
  const uitersten = `<table class="calc-fem-tabel"><thead><tr><th>${esc(w.set)}</th>`
    + `${kol('m<sub>x,max</sub>')}${kol('m<sub>x,min</sub>')}${kol('m<sub>y,max</sub>')}${kol('m<sub>y,min</sub>')}${kol('m<sub>xy,max</sub>')}${kol('m<sub>xy,min</sub>')}`
    + `${kol('w<sub>max</sub>')}${veren ? `${kol('R<sub>max</sub>')}${kol('R<sub>min</sub>')}` : ''}</tr>`
    + `<tr class="eenheid"><th></th><th colspan="6">[kNm/m]</th><th>[mm]</th>${veren ? '<th colspan="2">[kN]</th>' : ''}</tr></thead><tbody>${node.uitersten
      .map((u) => `<tr class="${u.soort}"><td>${esc(u.naam)}</td>${[u.mxMax, u.mxMin, u.myMax, u.myMin, u.mxyMax, u.mxyMin].map((v) => `<td class="getal">${getalTekst(v, t)}</td>`).join('')}<td class="getal">${getalTekst(u.wMax, t)}</td>${veren ? `<td class="getal">${getalTekst(u.RMax, t, 1)}</td><td class="getal">${getalTekst(u.RMin, t, 1)}</td>` : ''}</tr>`)
      .join('')}</tbody></table>`;
  const beelden = (node.beelden ?? []).map((b) => `<div class="calc-fem-kaart">${b}</div>`).join("");
  return `<div class="calc-fem${scherm}" data-fem="${esc(hashes)}">${kop}${verouderd}${samenvatting}${beeld}${gevallen}${uitersten}${beelden}</div>`;
}

/** De opmaak, bij de andere blokken in renderer.ts. */
export const FEM_CSS = `
.calc-fem { margin: 6px 0 10px; }
.calc-fem-kop { margin: 0 0 4px; }
.calc-fem-samenvatting { margin: 0 0 4px; }
.calc-fem-modelbeeld, .calc-fem-kaart { margin: 4px 0; }
.calc-fem-kaart { break-inside: avoid; page-break-inside: avoid; }
.calc-fem-modelbeeld svg, .calc-fem-beeld { display: block; height: auto; }
.calc-fem-tabel { border-collapse: collapse; font-size: 0.95em; margin: 4px 0; }
.calc-fem-tabel th, .calc-fem-tabel td { border-bottom: 1px solid #e5e7eb; padding: 1px 10px 1px 0; text-align: left; white-space: nowrap; }
.calc-fem-tabel td.getal { text-align: right; font-variant-numeric: tabular-nums; }
.calc-fem-tabel tr.eenheid th { font-weight: normal; color: #6b7280; font-size: 0.9em; }
.calc-fem-tabel tr.combinatie td { font-weight: 600; }
.calc-fem-fout .calc-fem-melding { color: #dc2626; font-weight: 600; }
.calc-fem-wacht p { color: #6b7280; font-style: italic; }
`;
