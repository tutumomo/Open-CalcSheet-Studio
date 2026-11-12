import { femParen, femSteunknopen } from './femNet.js';
import type { FemRekenmodel, FemUitersten, FemUitkomstCompact, Punt3D } from './types.js';

/**
 * De uitkomsten van een `@fem`-blok (femBlok.ts): de gevallen zoals FEM Studio ze
 * rekende, de combinaties als lineaire som, en wat het blad ermee doet: de waarde op een
 * punt, het gemiddelde over een strook, de uitersten, een plattegrond in kleur (SVG) en
 * een gekleurd vlak voor het `@3d`-blok.
 *
 * Tekens zoals in plaat.ts: een moment is positief bij trek aan de onderzijde, de
 * doorbuiging w is positief omlaag (w = −u_z), een reactie positief omhoog. m_x geeft
 * spanningen in x (wapening in x), m_y in y. Eenheden: w in mm, momenten in kNm/m,
 * dwarskrachten in kN/m, reacties in kN.
 */

export type FemGrootheid = 'w' | 'mx' | 'my' | 'mxy' | 'vx' | 'vy';
export const FEM_GROOTHEDEN: readonly FemGrootheid[] = ['w', 'mx', 'my', 'mxy', 'vx', 'vy'];
/** De eenheid van elke grootheid, zoals in de uitkomsten. */
export const FEM_EENHEID: Readonly<Record<FemGrootheid, string>> = { w: 'mm', mx: 'kNm/m', my: 'kNm/m', mxy: 'kNm/m', vx: 'kN/m', vy: 'kN/m' };
/** De plek van een grootheid in de vijf getallen per paar (FemUitkomstCompact.m). */
const KOLOM: Readonly<Record<Exclude<FemGrootheid, 'w'>, number>> = { mx: 0, my: 1, mxy: 2, vx: 3, vy: 4 };

/** Eén geval of combinatie, uitgerekend. */
export interface FemSet {
  naam: string;
  soort: 'geval' | 'combinatie';
  /** Per knoop u_z (m). */
  uz: Float64Array;
  /** Per paar vijf getallen (zie FemUitkomstCompact.m). */
  m: Float64Array;
  /** Per steunknoop de reactie (kN). */
  R: Float64Array;
}

/** Een geval met zijn antwoord, of een combinatie met de factoren per geval. */
export interface FemBron {
  gevallen: { naam: string; uitkomst: FemUitkomstCompact }[];
  combinaties: { naam: string; factoren: number[] }[];
}

/**
 * Het doorgerekende model, zoals het onder de naam van het blok in de scope staat: de
 * functies `fem_waarde`, `fem_strook` en `fem_svg` en het `@3d`-element `fem` krijgen het
 * mee. Het raster is dat van het bewaarde verzoek.
 */
export class FemModel {
  readonly naam: string;
  readonly m: FemRekenmodel;
  readonly sets = new Map<string, FemSet>();
  /** Per knoop: per plaat uit het blok de plek van het paar. */
  private readonly paar = new Map<number, Map<number, number>>();
  readonly steunknopen: number[];
  /** Per veer en per lijnsteun: [plek in de steunknopen, deel van de reactie]. */
  readonly verenDeel: [number, number][][];
  readonly lijnenDeel: [number, number][][];
  private readonly gx: number[];
  private readonly gy: number[];
  private readonly cel = new Map<number, number>();

  constructor(naam: string, m: FemRekenmodel, bron: FemBron) {
    this.naam = naam;
    this.m = m;
    femParen(m).forEach((p, i) => {
      const platen = this.paar.get(p.knoop) ?? this.paar.set(p.knoop, new Map()).get(p.knoop)!;
      platen.set(p.plaat, i);
    });
    this.steunknopen = femSteunknopen(m);
    const plek = new Map(this.steunknopen.map((k, i) => [k, i]));
    // Het deel van de reactie van een knoop dat bij een steun hoort: bij een vaste
    // knoop gelijk over de vaste steunen, anders naar de veren.
    const vast = new Map<number, number>();
    const veer = new Map<number, number>();
    for (const l of [...m.veren, ...m.lijnen]) {
      for (const [k, s] of l) {
        if (s === null) vast.set(k, (vast.get(k) ?? 0) + 1);
        else veer.set(k, (veer.get(k) ?? 0) + s);
      }
    }
    const deel = (k: number, s: number | null) => {
      const v = vast.get(k) ?? 0;
      if (v > 0) return s === null ? 1 / v : 0;
      const totaal = veer.get(k) ?? 0;
      return totaal > 0 && s !== null ? s / totaal : 0;
    };
    this.verenDeel = m.veren.map((l) => l.map(([k, s]) => [plek.get(k)!, deel(k, s)]));
    this.lijnenDeel = m.lijnen.map((l) => l.map(([k, s]) => [plek.get(k)!, deel(k, s)]));
    this.gx = [...new Set(m.x)].sort((a, b) => a - b);
    this.gy = [...new Set(m.y)].sort((a, b) => a - b);
    const ix = new Map(this.gx.map((v, i) => [v, i]));
    const iy = new Map(this.gy.map((v, i) => [v, i]));
    for (let e = 0; e < m.pl.length; e++) {
      const a = m.el[4 * e];
      this.cel.set(iy.get(m.y[a])! * this.gx.length + ix.get(m.x[a])!, e);
    }

    for (const g of bron.gevallen) {
      this.sets.set(g.naam, {
        naam: g.naam, soort: 'geval',
        uz: Float64Array.from(g.uitkomst.uz), m: Float64Array.from(g.uitkomst.m), R: Float64Array.from(g.uitkomst.R),
      });
    }
    for (const c of bron.combinaties) {
      const eerste = bron.gevallen[0].uitkomst;
      const s: FemSet = {
        naam: c.naam, soort: 'combinatie',
        uz: new Float64Array(eerste.uz.length), m: new Float64Array(eerste.m.length), R: new Float64Array(eerste.R.length),
      };
      c.factoren.forEach((f, i) => {
        if (f === 0) return;
        const u = bron.gevallen[i].uitkomst;
        for (let k = 0; k < s.uz.length; k++) s.uz[k] += f * u.uz[k];
        for (let k = 0; k < s.m.length; k++) s.m[k] += f * u.m[k];
        for (let k = 0; k < s.R.length; k++) s.R[k] += f * u.R[k];
      });
      this.sets.set(c.naam, s);
    }
  }

  toString(): string {
    return `FEM-model ${this.naam}`;
  }

  /** De set met deze naam; werpt met de namen die er wel zijn. */
  set(naam: string): FemSet {
    const s = this.sets.get(naam);
    if (!s) throw new Error(`het model ${this.naam} heeft geen geval of combinatie "${naam}" (wel: ${[...this.sets.keys()].join(', ')})`);
    return s;
  }

  /** De waarde van een grootheid op een knoop, voor de plaat uit het blok. */
  knoopWaarde(s: FemSet, g: FemGrootheid, knoop: number, plaat: number): number {
    if (g === 'w') return -s.uz[knoop] * 1000;
    const i = this.paar.get(knoop)?.get(plaat);
    return i === undefined ? NaN : s.m[5 * i + KOLOM[g]];
  }

  /** Het gemiddelde over de platen op een knoop (voor het 3D-beeld). */
  knoopGemiddeld(s: FemSet, g: FemGrootheid, knoop: number): number {
    if (g === 'w') return -s.uz[knoop] * 1000;
    const platen = this.paar.get(knoop);
    if (!platen) return NaN;
    let som = 0;
    for (const i of platen.values()) som += s.m[5 * i + KOLOM[g]];
    return som / platen.size;
  }

  /** Het element op (x, y): bij een rasterlijn dat rechts of boven, anders dat ernaast; of −1. */
  elementOp(x: number, y: number): number {
    const zoek = (lijnen: number[], v: number): number[] => {
      if (v < lijnen[0] - 1e-9 || v > lijnen[lijnen.length - 1] + 1e-9) return [];
      let lo = 0;
      let hi = lijnen.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (lijnen[mid] <= v) lo = mid;
        else hi = mid;
      }
      const uit = [lo];
      if (Math.abs(lijnen[lo] - v) <= 1e-9 && lo > 0) uit.push(lo - 1);
      if (Math.abs(lijnen[hi] - v) <= 1e-9 && hi < lijnen.length - 1) uit.unshift(hi);
      return uit;
    };
    for (const j of zoek(this.gy, y)) {
      for (const i of zoek(this.gx, x)) {
        const e = this.cel.get(j * this.gx.length + i);
        if (e !== undefined) return e;
      }
    }
    return -1;
  }

  /** De waarde op een punt in een element: bilineair tussen de knopen van zijn plaat. */
  waardeIn(s: FemSet, g: FemGrootheid, e: number, x: number, y: number): number {
    const k = this.m.el.slice(4 * e, 4 * e + 4);
    const [x0, x1] = [this.m.x[k[0]], this.m.x[k[1]]];
    const [y0, y1] = [this.m.y[k[0]], this.m.y[k[3]]];
    const a = Math.min(1, Math.max(0, (x - x0) / (x1 - x0)));
    const b = Math.min(1, Math.max(0, (y - y0) / (y1 - y0)));
    const p = this.m.pl[e];
    const v = k.map((n) => this.knoopWaarde(s, g, n, p));
    return (1 - a) * (1 - b) * v[0] + a * (1 - b) * v[1] + a * b * v[2] + (1 - a) * b * v[3];
  }

  /** De reactie per veer (kN, omhoog positief). */
  verenReactie(s: FemSet): number[] {
    return this.verenDeel.map((l) => l.reduce((t, [i, d]) => t + d * s.R[i], 0));
  }

  /** De reactie per lijnsteun (kN). */
  lijnenReactie(s: FemSet): number[] {
    return this.lijnenDeel.map((l) => l.reduce((t, [i, d]) => t + d * s.R[i], 0));
  }

  /** De uitersten van een set. */
  uitersten(s: FemSet): FemUitersten {
    let mxMax = -Infinity, mxMin = Infinity, myMax = -Infinity, myMin = Infinity, mxyMax = -Infinity, mxyMin = Infinity;
    for (let i = 0; i < s.m.length; i += 5) {
      mxMax = Math.max(mxMax, s.m[i]); mxMin = Math.min(mxMin, s.m[i]);
      myMax = Math.max(myMax, s.m[i + 1]); myMin = Math.min(myMin, s.m[i + 1]);
      mxyMax = Math.max(mxyMax, s.m[i + 2]); mxyMin = Math.min(mxyMin, s.m[i + 2]);
    }
    let wMax = -Infinity, wMin = Infinity;
    for (const u of s.uz) {
      wMax = Math.max(wMax, -u * 1000);
      wMin = Math.min(wMin, -u * 1000);
    }
    const R = this.verenReactie(s);
    return {
      naam: s.naam, soort: s.soort, mxMax, mxMin, myMax, myMin, mxyMax, mxyMin, wMax, wMin,
      RMax: R.length ? Math.max(...R) : null, RMin: R.length ? Math.min(...R) : null,
    };
  }
}

const isGrootheid = (g: string): g is FemGrootheid => (FEM_GROOTHEDEN as readonly string[]).includes(g);

export function femGrootheid(g: string): FemGrootheid {
  const s = g.trim().toLowerCase().replace(/[_,\s]/g, '');
  const naam = s === 'mxx' ? 'mx' : s === 'myy' ? 'my' : s;
  if (!isGrootheid(naam)) throw new Error(`onbekende grootheid "${g}" (bekend: ${FEM_GROOTHEDEN.join(', ')})`);
  return naam;
}

/** De waarde op (x, y) in m: w in mm, momenten in kNm/m, dwarskrachten in kN/m. */
export function femWaarde(model: FemModel, set: string, grootheid: string, x: number, y: number): number {
  const s = model.set(set);
  const g = femGrootheid(grootheid);
  const e = model.elementOp(x, y);
  if (e < 0) throw new Error(`op (${x}; ${y}) ligt geen plaat van ${model.naam}`);
  return model.waardeIn(s, g, e, x, y);
}

const GAUSS = [0.5 - 0.5 / Math.sqrt(3), 0.5 + 0.5 / Math.sqrt(3)];

/**
 * Het gemiddelde over een strook van (x1, y1) tot (x2, y2): over de rechthoek, of over
 * de lijn als hij in één richting geen breedte heeft (een kolomstrook op de lijn door de
 * palen), of de waarde op het punt. Per stuk binnen een element exact (Gauss, het veld is
 * bilineair). Alleen wat op een plaat ligt telt; ligt er niets op, dan een fout.
 */
export function femStrook(model: FemModel, set: string, grootheid: string, x1: number, y1: number, x2: number, y2: number): number {
  const s = model.set(set);
  const g = femGrootheid(grootheid);
  const [xa, xb] = [Math.min(x1, x2), Math.max(x1, x2)];
  const [ya, yb] = [Math.min(y1, y2), Math.max(y1, y2)];
  const plat = (a: number, b: number) => b - a <= 1e-9;
  if (plat(xa, xb) && plat(ya, yb)) return femWaarde(model, set, grootheid, xa, ya);
  const m = model.m;
  const knip = (lijnen: number[], a: number, b: number) => [a, ...lijnen.filter((v) => v > a + 1e-9 && v < b - 1e-9), b];
  const gx = [...new Set(m.x)].sort((p, q) => p - q);
  const gy = [...new Set(m.y)].sort((p, q) => p - q);
  let som = 0;
  let maat = 0;
  if (plat(xa, xb) || plat(ya, yb)) {
    const langsY = plat(xa, xb);
    const stukken = langsY ? knip(gy, ya, yb) : knip(gx, xa, xb);
    for (let k = 1; k < stukken.length; k++) {
      const [a, b] = [stukken[k - 1], stukken[k]];
      const midden = langsY ? model.elementOp(xa, (a + b) / 2) : model.elementOp((a + b) / 2, ya);
      if (midden < 0) continue;
      for (const t of GAUSS) {
        const v = a + t * (b - a);
        som += ((b - a) / 2) * (langsY ? model.waardeIn(s, g, midden, xa, v) : model.waardeIn(s, g, midden, v, ya));
      }
      maat += b - a;
    }
  } else {
    const sx = knip(gx, xa, xb);
    const sy = knip(gy, ya, yb);
    for (let i = 1; i < sx.length; i++) {
      for (let j = 1; j < sy.length; j++) {
        const [a, b, c, d] = [sx[i - 1], sx[i], sy[j - 1], sy[j]];
        const e = model.elementOp((a + b) / 2, (c + d) / 2);
        if (e < 0) continue;
        const opp = (b - a) * (d - c);
        for (const tx of GAUSS) for (const ty of GAUSS) som += (opp / 4) * model.waardeIn(s, g, e, a + tx * (b - a), c + ty * (d - c));
        maat += opp;
      }
    }
  }
  if (!(maat > 0)) throw new Error(`de strook van (${x1}; ${y1}) tot (${x2}; ${y2}) ligt niet op een plaat van ${model.naam}`);
  return som / maat;
}

// ── Kleuren ─────────────────────────────────────────────────────────────────

/** Tien klassen: op papier is een klasse af te lezen, een vloeiend verloop niet. */
const KLASSEN = 10;
const WIT = [255, 255, 255];
const BLAUW = [37, 99, 235];
const ROOD = [220, 38, 38];

function mix(a: number[], b: number[], f: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * f));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

/**
 * De kleurschaal van een grootheid: de doorbuiging van wit naar blauw, een moment of
 * dwarskracht rood (negatief, bij een moment trek boven) – wit – blauw (positief), in
 * klassen. Geeft de grenzen van de klassen en de kleur per waarde.
 */
export function femKleurschaal(g: FemGrootheid, min: number, max: number): { grenzen: number[]; kleur(v: number): string; kleuren: string[] } {
  if (g === 'w') {
    const lo = Math.min(0, min);
    const hi = Math.max(max, lo + 1e-9);
    const grenzen = Array.from({ length: KLASSEN + 1 }, (_, k) => lo + ((hi - lo) * k) / KLASSEN);
    const kleuren = Array.from({ length: KLASSEN }, (_, k) => mix(WIT, BLAUW, (k + 0.5) / KLASSEN));
    const kleur = (v: number) => kleuren[Math.max(0, Math.min(KLASSEN - 1, Math.floor(((v - lo) / (hi - lo)) * KLASSEN)))];
    return { grenzen, kleur, kleuren };
  }
  const a = Math.max(Math.abs(min), Math.abs(max), 1e-9);
  const grenzen = Array.from({ length: KLASSEN + 1 }, (_, k) => -a + (2 * a * k) / KLASSEN);
  const kleuren = Array.from({ length: KLASSEN }, (_, k) => {
    const f = (k + 0.5 - KLASSEN / 2) / (KLASSEN / 2);
    return f < 0 ? mix(WIT, ROOD, -f) : mix(WIT, BLAUW, f);
  });
  const kleur = (v: number) => kleuren[Math.max(0, Math.min(KLASSEN - 1, Math.floor(((v + a) / (2 * a)) * KLASSEN)))];
  return { grenzen, kleur, kleuren };
}

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const f1 = (n: number) => String(Math.round(n * 10) / 10);
/** Een getal voor op papier: drie cijfers, met de komma als dat de taal is. */
function getalTekst(v: number, taal: string): string {
  const t = Math.abs(v) >= 100 ? v.toFixed(0) : Math.abs(v) >= 10 ? v.toFixed(1) : v.toFixed(2);
  const n = t === '-0' || /^-0[.,]0+$/.test(t) ? t.slice(1) : t;
  return taal === 'nl' ? n.replace('.', ',') : n;
}

const TITEL: Readonly<Record<FemGrootheid, string>> = { w: 'w', mx: 'm<tspan baseline-shift="sub" font-size="8">x</tspan>', my: 'm<tspan baseline-shift="sub" font-size="8">y</tspan>', mxy: 'm<tspan baseline-shift="sub" font-size="8">xy</tspan>', vx: 'v<tspan baseline-shift="sub" font-size="8">x</tspan>', vy: 'v<tspan baseline-shift="sub" font-size="8">y</tspan>' };

interface Kader { breedte: number; hoogte: number; px(x: number): number; py(y: number): number }

function kader(m: FemRekenmodel, breedte: number, boven: number, onder: number): Kader {
  const x0 = Math.min(...m.x), x1 = Math.max(...m.x), y0 = Math.min(...m.y), y1 = Math.max(...m.y);
  const rand = 14;
  const schaal = Math.min((breedte - 2 * rand) / Math.max(x1 - x0, 1e-9), 420 / Math.max(y1 - y0, 1e-9));
  const hoogte = boven + (y1 - y0) * schaal + onder;
  const dx = (breedte - (x1 - x0) * schaal) / 2;
  return { breedte, hoogte, px: (x) => dx + (x - x0) * schaal, py: (y) => boven + (y1 - y) * schaal };
}

/**
 * De elementen als rechthoeken, met naast elkaar liggende elementen van dezelfde kleur op
 * één rij samengevoegd: een raster van duizenden elementen blijft zo een klein beeld.
 */
function stroken(m: FemRekenmodel, k: Kader, kleurVan: (e: number) => string, opmaak: (kleur: string) => string): string {
  const uit: string[] = [];
  let open = null as { x0: number; x1: number; y0: number; y1: number; kleur: string } | null;
  const sluit = () => {
    if (!open) return;
    const x = k.px(open.x0), y = k.py(open.y1);
    uit.push(`<rect x="${f1(x)}" y="${f1(y)}" width="${f1(k.px(open.x1) - x)}" height="${f1(k.py(open.y0) - y)}" ${opmaak(open.kleur)}/>`);
    open = null;
  };
  for (let e = 0; e < m.pl.length; e++) {
    const a = m.el[4 * e];
    const c = m.el[4 * e + 2];
    const kleur = kleurVan(e);
    const [x0, x1, y0, y1] = [m.x[a], m.x[c], m.y[a], m.y[c]];
    if (open && open.kleur === kleur && open.y0 === y0 && open.y1 === y1 && open.x1 === x0) {
      open.x1 = x1;
      continue;
    }
    sluit();
    open = { x0, x1, y0, y1, kleur };
  }
  sluit();
  return uit.join('');
}

/** De randen tussen platen van verschillende dikte en de buitenranden, als lijnen. */
function plaatRanden(m: FemRekenmodel, k: Kader): string {
  const zijden = new Map<string, number[]>();
  for (let e = 0; e < m.pl.length; e++) {
    for (let c = 0; c < 4; c++) {
      const p = m.el[4 * e + c];
      const q = m.el[4 * e + ((c + 1) % 4)];
      const sleutel = p < q ? `${p}-${q}` : `${q}-${p}`;
      (zijden.get(sleutel) ?? zijden.set(sleutel, []).get(sleutel)!).push(e);
    }
  }
  const delen: string[] = [];
  for (const [s, els] of zijden) {
    if (els.length === 2 && m.t[m.pl[els[0]]] === m.t[m.pl[els[1]]]) continue;
    const [p, q] = s.split('-').map(Number);
    delen.push(`M${f1(k.px(m.x[p]))} ${f1(k.py(m.y[p]))}L${f1(k.px(m.x[q]))} ${f1(k.py(m.y[q]))}`);
  }
  return `<path d="${delen.join('')}" fill="none" stroke="#1e293b" stroke-width="1.1"/>`;
}

/** De veren als stippen en de lijnsteunen als dikke lijnen. */
function steunen(m: FemRekenmodel, k: Kader): string {
  const uit: string[] = [];
  for (const l of m.lijnen) {
    const a = l[0][0];
    const b = l[l.length - 1][0];
    uit.push(`<line x1="${f1(k.px(m.x[a]))}" y1="${f1(k.py(m.y[a]))}" x2="${f1(k.px(m.x[b]))}" y2="${f1(k.py(m.y[b]))}" stroke="#334155" stroke-width="3.5" stroke-linecap="round"/>`);
  }
  for (const v of m.veren) {
    const c = v[0][0];
    uit.push(`<circle cx="${f1(k.px(m.x[c]))}" cy="${f1(k.py(m.y[c]))}" r="3.2" fill="#334155" stroke="#fff" stroke-width="0.8"/>`);
  }
  return uit.join('');
}

/**
 * Een plattegrond van een grootheid als SVG: elk element in de kleur van zijn klasse, de
 * randen tussen platen van verschillende dikte, de veren en lijnsteunen, de plek van het
 * grootste en kleinste getal, en een legenda met de klassen en de eenheid. y wijst in
 * beeld omhoog. `breedte` in px; op papier schaalt het beeld mee met de kolom.
 */
export function femSvg(model: FemModel, set: string, grootheid: string, breedte = 640, taal = 'nl'): string {
  const s = model.set(set);
  const g = femGrootheid(grootheid);
  const m = model.m;
  const k = kader(m, breedte, 26, 58);
  const waarden = m.pl.map((p, e) => {
    const kn = m.el.slice(4 * e, 4 * e + 4);
    return kn.reduce((t, n) => t + model.knoopWaarde(s, g, n, p), 0) / 4;
  });
  // De uitersten op de knopen, niet op de elementen: dat zijn de getallen van het blad.
  let min = Infinity, max = -Infinity, kMin = 0, kMax = 0;
  for (let e = 0; e < m.pl.length; e++) {
    for (let c = 0; c < 4; c++) {
      const n = m.el[4 * e + c];
      const v = model.knoopWaarde(s, g, n, m.pl[e]);
      if (v < min) [min, kMin] = [v, n];
      if (v > max) [max, kMax] = [v, n];
    }
  }
  const schaal = femKleurschaal(g, min, max);
  const vlakken = stroken(m, k, (e) => schaal.kleur(waarden[e]), (kl) => `class="fem-el" fill="${kl}" stroke="${kl}" stroke-width="0.3"`);
  const eenheid = FEM_EENHEID[g];
  const label = (n: number, v: number, kleur: string) => {
    const x = k.px(m.x[n]), y = k.py(m.y[n]);
    const links = x > k.breedte * 0.7;
    return `<circle cx="${f1(x)}" cy="${f1(y)}" r="3" fill="none" stroke="${kleur}" stroke-width="1.6"/>`
      + `<text x="${f1(links ? x - 5 : x + 5)}" y="${f1(y - 5)}" text-anchor="${links ? 'end' : 'start'}" font-size="11" font-weight="600" fill="${kleur}" stroke="#fff" stroke-width="3" paint-order="stroke">${getalTekst(v, taal)}</text>`;
  };
  // De legenda: de klassen naast elkaar, met de grenzen eronder.
  const lb = Math.min(360, k.breedte - 40);
  const lx = (k.breedte - lb) / 2;
  const ly = k.hoogte - 40;
  const vak = lb / schaal.kleuren.length;
  const legenda = schaal.kleuren.map((kl, i) => `<rect x="${f1(lx + i * vak)}" y="${f1(ly)}" width="${f1(vak)}" height="10" fill="${kl}" stroke="#94a3b8" stroke-width="0.4"/>`).join('')
    + schaal.grenzen.map((v, i) => (i % 2 === 0 ? `<text x="${f1(lx + i * vak)}" y="${f1(ly + 22)}" text-anchor="middle" font-size="9.5" fill="#334155">${getalTekst(v, taal)}</text>` : '')).join('')
    + `<text x="${f1(lx + lb + 6)}" y="${f1(ly + 9)}" font-size="10" fill="#334155">${esc(eenheid)}</text>`;
  const titel = `<text x="${f1(k.breedte / 2)}" y="16" text-anchor="middle" font-size="12.5" font-weight="600" fill="#1e293b">${esc(model.naam)} · ${esc(s.naam)} · ${TITEL[g]} [${esc(eenheid)}]</text>`;
  return `<svg class="calc-fem-beeld" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${k.breedte} ${f1(k.hoogte)}" width="100%" style="max-width:${k.breedte}px" font-family="sans-serif" role="img" aria-label="${esc(model.naam)} ${esc(s.naam)} ${g}">`
    + titel + vlakken + plaatRanden(m, k) + steunen(m, k)
    + label(kMax, max, '#1e3a8a') + (kMin !== kMax ? label(kMin, min, g === 'w' ? '#475569' : '#991b1b') : '')
    + legenda + '</svg>';
}

/**
 * De plattegrond van het model zelf, zonder uitkomsten: de platen in grijs naar dikte
 * (hoe dikker, hoe donkerder), het raster dun, de veren en lijnsteunen. Op het blad bij
 * het blok, om de invoer na te kijken.
 */
export function femModelSvg(m: FemRekenmodel, taal = 'nl', breedte = 520): string {
  const k = kader(m, breedte, 8, 30);
  const dikten = [...new Set(m.pl.map((p) => m.t[p]))].sort((a, b) => a - b);
  const grijs = (t: number) => {
    const f = dikten.length > 1 ? dikten.indexOf(t) / (dikten.length - 1) : 0;
    return mix([241, 245, 249], [148, 163, 184], f);
  };
  const vlakken = stroken(m, k, (e) => grijs(m.t[m.pl[e]]), (kl) => `fill="${kl}"`);
  // Het raster dun erover, als één pad; bij een heel fijn raster niet, dan wordt het grijs.
  const raster = m.pl.length <= 3000
    ? `<path d="${m.pl.map((_, e) => {
      const a = m.el[4 * e];
      const c = m.el[4 * e + 2];
      return `M${f1(k.px(m.x[a]))} ${f1(k.py(m.y[a]))}H${f1(k.px(m.x[c]))}V${f1(k.py(m.y[c]))}H${f1(k.px(m.x[a]))}Z`;
    }).join('')}" fill="none" stroke="#cbd5e1" stroke-width="0.4"/>`
    : '';
  const vak = 14;
  const legenda = dikten.map((t, i) => {
    const x = 14 + i * 96;
    return `<rect x="${x}" y="${f1(k.hoogte - 20)}" width="${vak}" height="10" fill="${grijs(t)}" stroke="#64748b" stroke-width="0.5"/>`
      + `<text x="${x + vak + 5}" y="${f1(k.hoogte - 11)}" font-size="10" fill="#334155">t = ${getalTekst(t * 1000, taal).replace(/[.,]0+$/, '')} mm</text>`;
  }).join('');
  return `<svg class="calc-fem-model" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${k.breedte} ${f1(k.hoogte)}" width="100%" style="max-width:${k.breedte}px" font-family="sans-serif" role="img" aria-label="model">`
    + vlakken + raster + plaatRanden(m, k) + steunen(m, k) + legenda + '</svg>';
}

/**
 * Het gekleurde vlak voor een `@3d`-blok: de knopen op hun plaats, met de waarde als
 * hoogte (omlaag bij een positief getal: de doorbuiging omlaag, een moment aan de
 * trekzijde zoals in een momentenlijn). `hoogte` is de getekende hoogte van het grootste
 * getal in de eenheid van de scène; `factor` zet m om naar die eenheid.
 */
export function femVlak3D(model: FemModel, set: string, grootheid: string, factor: number, hoogte: number | null): {
  punten: Punt3D[]; vlakken: [number, number, number, number][]; kleuren: string[];
  max: { plek: Punt3D; waarde: number }; min: { plek: Punt3D; waarde: number }; eenheid: string;
} {
  const s = model.set(set);
  const g = femGrootheid(grootheid);
  const m = model.m;
  const waarden = m.x.map((_, n) => model.knoopGemiddeld(s, g, n));
  let max = -Infinity, min = Infinity, nMax = 0, nMin = 0;
  waarden.forEach((v, n) => {
    if (v > max) [max, nMax] = [v, n];
    if (v < min) [min, nMin] = [v, n];
  });
  const grootste = Math.max(Math.abs(max), Math.abs(min), 1e-12);
  const spanne = Math.max(Math.max(...m.x) - Math.min(...m.x), Math.max(...m.y) - Math.min(...m.y)) * factor;
  const h = hoogte ?? 0.12 * spanne;
  const r = (v: number) => Math.round(v * 1e4) / 1e4;
  const punten: Punt3D[] = m.x.map((x, n) => [r(x * factor), r(m.y[n] * factor), r((-waarden[n] / grootste) * h)]);
  const schaal = femKleurschaal(g, min, max);
  const vlakken: [number, number, number, number][] = [];
  const kleuren: string[] = [];
  for (let e = 0; e < m.pl.length; e++) {
    const kn = m.el.slice(4 * e, 4 * e + 4) as [number, number, number, number];
    vlakken.push(kn);
    kleuren.push(schaal.kleur(kn.reduce((t, n) => t + waarden[n], 0) / 4));
  }
  return {
    punten, vlakken, kleuren, eenheid: FEM_EENHEID[g],
    max: { plek: punten[nMax], waarde: max }, min: { plek: punten[nMin], waarde: min },
  };
}
