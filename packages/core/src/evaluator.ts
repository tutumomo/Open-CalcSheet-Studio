import type { MathNode } from 'mathjs';
import { math, isEenheidNaam, geldigeEenheidNaam } from './eenheden.js';
import { decimalenNa, doelInStelsel, toonInvoer, type Stelsel } from './eenheidstelsel.js';
import type { AstNode, ConditionalNode, EvaluatedNode, InStelsel, MatrixUitkomst, OpdrachtNode, ToetsAntwoord } from './types.js';
import { losStelselOp, rangVan, eigenSymmetrisch } from './matrixrekening.js';
import { bouwDrieDScene } from './drieD.js';
import { bouwIframe } from './iframeBlok.js';
import { bouwIfcxBlok } from './ifcxBlok.js';
import { bouwToets } from './toetsBlok.js';
import { bouwFem } from './femBlok.js';
import { bouwKern } from './kernBlok.js';
import { FemModel, femWaarde, femStrook, femSvg, femGrootheid, FEM_EENHEID } from './femResultaat.js';
import { bouwJsBlok } from './jsBlok.js';
import { leesVerwijzing, verwijzingNaam, verwijzingenInMelding } from './verwijzing.js';
import { plaatOplossing, plaatSamenvatting, plaatDoorbuiging, plaatSvg, type PlaatInvoer } from './plaat.js';
import {
  liggerOplossing, liggerReacties, liggerOmhullende, liggerOmhullendeReacties, liggerExtremen,
  liggerInterpoleer, liggerNulpunt, liggerStatus, liggerDelen, liggerVelden, liggerSvgPunten, liggerSamen,
} from './ligger.js';
import {
  raamwerkOplossing, raamwerkReacties, raamwerkVerplaatsingen, raamwerkStatus, raamwerkExtremen,
  raamwerkInterpoleer, raamwerkSvgPunten, raamwerkVormPunten, raamwerkKnik, raamwerkSamenvatting, raamwerkZakking,
} from './raamwerk.js';
import {
  doorsnedeGrootheden, doorsnedeDeel, doorsnedePlastisch, doorsnedeStatisch, doorsnedeSvgPunten,
} from './doorsnede.js';


/**
 * Trigonometric input mode. Default is `rad` (mathjs native). When set to
 * `deg` or `gra`, the wrappers below scale every unit-less input. Inputs
 * already carrying a unit (e.g. `45 deg`) pass through unchanged because
 * mathjs handles the conversion itself.
 *
 * setAngleMode zet de stand van de app. Een blad kan hem met `#deg`, `#rad`
 * of `#gra` vanaf die regel veranderen, zoals in de rekentaal; aan het eind van
 * evaluate() staat de stand van de app weer terug, zodat het volgende blad
 * er niet door geraakt wordt.
 */
export type AngleMode = 'rad' | 'deg' | 'gra';
let currentAngleMode: AngleMode = 'rad';

/** Set the global angle mode used by sin/cos/tan family for unit-less input. */
export function setAngleMode(mode: AngleMode): void {
  currentAngleMode = mode;
}

function toRadians(v: unknown): unknown {
  if (typeof v !== 'number') return v;
  if (currentAngleMode === 'deg') return v * Math.PI / 180;
  if (currentAngleMode === 'gra') return v * Math.PI / 200;
  return v;
}
function fromRadians(v: unknown): unknown {
  if (typeof v !== 'number') return v;
  if (currentAngleMode === 'deg') return v * 180 / Math.PI;
  if (currentAngleMode === 'gra') return v * 200 / Math.PI;
  return v;
}

// Wrap trig functions so plain numbers honour the active angle mode. mathjs
// units (45 deg, π rad) bypass the wrapper.
const nativeSin = math.sin, nativeCos = math.cos, nativeTan = math.tan;
const nativeAsin = math.asin, nativeAcos = math.acos, nativeAtan = math.atan;
// Ook de overige hoekfuncties van het lint: mathjs rekent cot, sec, csc en
// hun inversen en atan2 zelf uit, buiten de wrappers hierboven om.
const nativeCot = math.cot, nativeSec = math.sec, nativeCsc = math.csc;
const nativeAcot = math.acot, nativeAsec = math.asec, nativeAcsc = math.acsc, nativeAtan2 = math.atan2;
/** mathjs' eigen round, vóór de vervanging hieronder (zie `round` in de functies van de rekentaal). */
const nativeRound = math.round;
math.import({
  sin: (v: unknown) => nativeSin(toRadians(v) as number),
  cos: (v: unknown) => nativeCos(toRadians(v) as number),
  tan: (v: unknown) => nativeTan(toRadians(v) as number),
  cot: (v: unknown) => nativeCot(toRadians(v) as number),
  sec: (v: unknown) => nativeSec(toRadians(v) as number),
  csc: (v: unknown) => nativeCsc(toRadians(v) as number),
  asin: (v: unknown) => fromRadians(nativeAsin(v as number)),
  acos: (v: unknown) => fromRadians(nativeAcos(v as number)),
  atan: (v: unknown) => fromRadians(nativeAtan(v as number)),
  acot: (v: unknown) => fromRadians(nativeAcot(v as number)),
  asec: (v: unknown) => fromRadians(nativeAsec(v as number)),
  acsc: (v: unknown) => fromRadians(nativeAcsc(v as number)),
  atan2: (y: unknown, x: unknown) => fromRadians(nativeAtan2(y as number, x as number)),
  // De rekentaal schrijft `ln` voor de natuurlijke logaritme; mathjs kent alleen
  // `log` (dat zonder base-argument al natural log is).
  ln: (v: unknown) => math.log(v as number),
}, { override: true });

// Helper functions that mathjs doesn't ship with.

// mathjs returns Matrix objects from `[…]` literals — Array.isArray(M) is
// false, so our helpers must also handle the Matrix case. Normalize both
// to a plain array of numbers (or array-of-arrays for 2D).
function toArrayLike(v: unknown): unknown[] | null {
  if (Array.isArray(v)) return v;
  if (v && typeof (v as { toArray?: () => unknown[] }).toArray === 'function') {
    return (v as { toArray: () => unknown[] }).toArray();
  }
  return null;
}

/** Numeric value, unit-aware (extracts SI value from mathjs Unit). */
function asNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v && typeof (v as { toNumber?: (u?: string) => number }).toNumber === 'function') {
    try { return (v as { toNumber: () => number }).toNumber(); } catch { /* fall through */ }
  }
  if (v && typeof v === 'object' && 'value' in v && typeof (v as { value: unknown }).value === 'number') {
    return (v as { value: number }).value;
  }
  return Number(v);
}

/** Vergelijking van een opzoekfunctie: `hlookup` is eq, `hlookup_ge` is ge, enz. */
type Vergelijking = 'eq' | 'ne' | 'lt' | 'le' | 'gt' | 'ge';

/**
 * De opzoekfuncties van de rekentaal op een matrix, rij voor rij (rij i is
 * rij i, zie rewriteMatrixLiterals in parser.ts).
 *
 *   hlookup(M; x; i₁; i₂)  zoekt x in RIJ i₁ en geeft het element uit rij i₂
 *                          in dezelfde kolom — horizontaal zoeken
 *   vlookup(M; x; j₁; j₂)  zoekt x in KOLOM j₁ en geeft het element uit
 *                          kolom j₂ in dezelfde rij — verticaal zoeken
 *   …_ge, _le, _gt, _lt, _ne  met een andere vergelijking dan "gelijk"
 *
 * Afwijking van andere rekentalen, bewust en ongewijzigd: die geven een vector met
 * alle treffers; deze functies geven één waarde — bij `eq` de eerste treffer,
 * anders de treffer die het dichtst bij x ligt (`hlookup_ge`: de kleinste
 * waarde ≥ x). De bladen rekenen daarmee als met een getal
 * (`hlookup(profielen; profiel; 1; 2)*mm`). Niets gevonden: 0.
 *
 * `i₂` is standaard `i₁` (de gevonden waarde zelf). Een vector (1D) wordt
 * rechtstreeks doorzocht.
 */
function zoekOp(args: unknown[], richting: 'h' | 'v', mode: Vergelijking): unknown {
  if (args.length === 0) return 0;
  const tabel = toArrayLike(args[0]);
  if (!tabel) return 0;
  const target = asNumber(args[1] ?? 0);
  const zoekNr = Math.max(1, Math.trunc(asNumber(args[2] ?? 1)));
  const terugNr = Math.max(1, Math.trunc(asNumber(args[3] ?? zoekNr)));

  const paren: [unknown, unknown][] = [];
  if (toArrayLike(tabel[0]) === null) {
    for (const el of tabel) paren.push([el, el]);
  } else if (richting === 'h') {
    const zoekRij = toArrayLike(tabel[zoekNr - 1]);
    const terugRij = toArrayLike(tabel[terugNr - 1]);
    if (!zoekRij) return 0;
    zoekRij.forEach((k, j) => paren.push([k, terugRij?.[j]]));
  } else {
    for (const rij of tabel) {
      const r = toArrayLike(rij);
      paren.push([r?.[zoekNr - 1], r?.[terugNr - 1]]);
    }
  }

  let best: unknown = null;
  let bestDelta = Infinity;
  for (const [k, terug] of paren) {
    const key = asNumber(k);
    if (!Number.isFinite(key)) continue;
    if (mode === 'eq' && key !== target) continue;
    if (mode === 'ne' && key === target) continue;
    if (mode === 'ge' && key < target) continue;
    if (mode === 'gt' && key <= target) continue;
    if (mode === 'le' && key > target) continue;
    if (mode === 'lt' && key >= target) continue;
    const delta = Math.abs(key - target);
    if (delta < bestDelta) {
      bestDelta = delta;
      best = terug;
    }
  }
  return best ?? 0;
}

/** Afmetingen van een vector of matrix: [n] of [m, n]; null voor een scalar. */
function afmetingen(v: unknown): number[] | null {
  if (math.isMatrix(v)) return (v as unknown as { size: () => number[] }).size();
  if (Array.isArray(v)) return math.size(v) as unknown as number[];
  return null;
}

/** De elementen van scalars, vectoren en matrices achter elkaar; een matrix rij voor rij. */
function plat(args: unknown[]): unknown[] {
  const uit: unknown[] = [];
  const voeg = (v: unknown): void => {
    const a = toArrayLike(v);
    if (a) for (const e of a) voeg(e);
    else uit.push(v);
  };
  for (const a of args) voeg(a);
  return uit;
}

/** Een matrix (2D) als rijen; een vector wordt één kolom, een scalar 1 × 1. */
function alsRijen(v: unknown): unknown[][] {
  const a = toArrayLike(v);
  if (!a) return [[v]];
  if (a.length === 0) return [];
  if (toArrayLike(a[0]) === null) return a.map((e) => [e]);
  return a.map((r) => toArrayLike(r) ?? [r]);
}

/** Index (1-gebaseerd, afgerond) als getal; een fout bij iets anders. */
function indexGetal(v: unknown, functie: string): number {
  const n = asNumber(v);
  if (!Number.isFinite(n)) throw new Error(`${functie}: de index is geen getal`);
  return Math.round(n);
}

math.import(
  {
    // Inline ternary: `if(cond, t, f)`
    if: function (cond: unknown, t: unknown, f: unknown) {
      return Boolean(cond) ? t : f;
    },
    // `take(n; a; b; c…)`: het n-de element van de lijst, waarin
    // vectoren en matrices (rij voor rij) zijn uitgevouwen: `take(2; [10; 20;
    // 30])` → 20. `take(x; y; M)` met een matrix M: het element in rij x,
    // kolom y. Een index wordt afgerond op een geheel getal.
    //
    // Ruimer dan gebruikelijk, voor oudere bladen: `take(vec)` geeft het eerste
    // element, `take(vec; n)` mag ook, en een index buiten de lijst valt op
    // het eerste of laatste element. `take(1; hlookup_ge(M; h; 1; 1))` werkt
    // ook als de opzoekfunctie één getal teruggeeft.
    take: function (...args: unknown[]) {
      if (args.length === 0) return 0;
      if (args.length === 1) {
        const v = toArrayLike(args[0]);
        return v ? plat([v])[0] : args[0];
      }
      if (args.length === 2 && toArrayLike(args[0]) && !toArrayLike(args[1])) {
        args = [args[1], args[0]];
      }
      if (args.length === 3 && !toArrayLike(args[0]) && !toArrayLike(args[1])) {
        const dims = afmetingen(args[2]);
        if (dims && dims.length === 2) {
          const rijen = alsRijen(args[2]);
          const i = Math.min(Math.max(indexGetal(args[0], 'take'), 1), rijen.length) - 1;
          const j = Math.min(Math.max(indexGetal(args[1], 'take'), 1), rijen[i].length) - 1;
          return rijen[i][j];
        }
      }
      const lijst = plat(args.slice(1));
      if (lijst.length === 0) return 0;
      const i = Math.min(Math.max(indexGetal(args[0], 'take'), 1), lijst.length) - 1;
      return lijst[i];
    },
    // Boolean → 0/1 (the language uses `(cond) * value` patterns)
    bool: function (cond: unknown) {
      return Boolean(cond) ? 1 : 0;
    },
    // rekentaal-opzoekfuncties; zie zoekOp.
    hlookup: function (...args: unknown[]) { return zoekOp(args, 'h', 'eq'); },
    hlookup_eq: function (...args: unknown[]) { return zoekOp(args, 'h', 'eq'); },
    hlookup_ne: function (...args: unknown[]) { return zoekOp(args, 'h', 'ne'); },
    hlookup_lt: function (...args: unknown[]) { return zoekOp(args, 'h', 'lt'); },
    hlookup_le: function (...args: unknown[]) { return zoekOp(args, 'h', 'le'); },
    hlookup_gt: function (...args: unknown[]) { return zoekOp(args, 'h', 'gt'); },
    hlookup_ge: function (...args: unknown[]) { return zoekOp(args, 'h', 'ge'); },
    vlookup: function (...args: unknown[]) { return zoekOp(args, 'v', 'eq'); },
    vlookup_eq: function (...args: unknown[]) { return zoekOp(args, 'v', 'eq'); },
    vlookup_ne: function (...args: unknown[]) { return zoekOp(args, 'v', 'ne'); },
    vlookup_lt: function (...args: unknown[]) { return zoekOp(args, 'v', 'lt'); },
    vlookup_le: function (...args: unknown[]) { return zoekOp(args, 'v', 'le'); },
    vlookup_gt: function (...args: unknown[]) { return zoekOp(args, 'v', 'gt'); },
    vlookup_ge: function (...args: unknown[]) { return zoekOp(args, 'v', 'ge'); },
    // Aantal rijen en kolommen. Een vector telt als één kolom (n_rows is zijn
    // lengte), een scalar als 1 × 1.
    n_rows: function (v: unknown) {
      const a = toArrayLike(v);
      return a ? a.length : 1;
    },
    n_cols: function (v: unknown) {
      const a = toArrayLike(v);
      if (!a) return 1;
      const row0 = toArrayLike(a[0]);
      return row0 ? row0.length : 1;
    },
    // `get(M; i; j)` (of `get(i; j; M)`): het element in rij i, kolom j (1-based).
    get: function (...args: unknown[]) {
      const mat = args.map(toArrayLike).find((a) => a !== null);
      if (!mat) return 0;
      const nums = args.filter((a) => !toArrayLike(a)).map(asNumber);
      const row = nums[0] ? Math.max(1, Math.trunc(nums[0])) - 1 : 0;
      const col = nums[1] ? Math.max(1, Math.trunc(nums[1])) - 1 : 0;
      const rowVal = mat[Math.min(row, mat.length - 1)];
      const rowArr = toArrayLike(rowVal);
      if (rowArr) {
        return rowArr[Math.min(col, rowArr.length - 1)];
      }
      return rowVal;
    },
    // `row(M; i)` / `col(M; j)`: rij i of kolom j als PLATTE vector
    // (1-based). mathjs' eigen row() geeft een 1×N-matrix, waarna
    // vector-indexering (`r.3` → r[3]) stukloopt op "Dimension mismatch".
    // Bij een vector geven ze het element op die plaats.
    row: function (m: unknown, i: unknown) {
      const a = toArrayLike(m);
      if (!a) return m;
      const idx = Math.max(1, Math.trunc(asNumber(i))) - 1;
      const picked = a[Math.min(idx, a.length - 1)];
      const rij = toArrayLike(picked);
      return rij ? math.matrix(rij.slice() as number[]) : picked;
    },
    col: function (m: unknown, j: unknown) {
      const a = toArrayLike(m);
      if (!a) return m;
      const idx = Math.max(1, Math.trunc(asNumber(j))) - 1;
      if (!toArrayLike(a[0])) return a[Math.min(idx, a.length - 1)];
      return math.matrix(a.map((r) => {
        const rr = toArrayLike(r);
        return rr ? rr[Math.min(idx, rr.length - 1)] : r;
      }) as number[]);
    },
    // logische functies — hoofdletter-varianten met variadische
    // argumenten (`#if Or(uc_1 > 1; uc_2 > 1; …)`).
    Or: function (...args: unknown[]) {
      return args.some((a) => Boolean(a)) ? 1 : 0;
    },
    And: function (...args: unknown[]) {
      return args.every((a) => Boolean(a)) ? 1 : 0;
    },
    Not: function (a: unknown) {
      return Boolean(a) ? 0 : 1;
    },
    Xor: function (...args: unknown[]) {
      return args.filter((a) => Boolean(a)).length % 2 === 1 ? 1 : 0;
    },
    // `round(x; n)` met een grootheid: afronden in de eenheid waarin de
    // uitkomst getoond wordt (round(1234.5678 mm; 1) = 1234.6 mm). mathjs
    // wil daar een derde argument met de eenheid bij en gaf zonder een fout.
    // Een getal, een matrix en de vorm met drie argumenten gaan ongewijzigd
    // naar mathjs.
    round: function (x: unknown, n?: unknown, eenheid?: unknown) {
      if (eenheid !== undefined) return (nativeRound as (...a: unknown[]) => unknown)(x, n, eenheid);
      if (isUnit(x)) return rondAfInEenheid(x, n === undefined ? 0 : asNumber(n));
      return n === undefined ? nativeRound(x as number) : nativeRound(x as number, n as number);
    },
    // Weergave van een $Root-, $Sum-, $Area-blok enz. (zie
    // rewriteSolverDirectives in parser.ts): rekent als de laatste parameter,
    // de aanroep zelf; de andere zijn er voor latex.ts.
    _cp_los: function (...args: unknown[]) {
      return args[args.length - 1];
    },
  },
  { override: true },
);

/** Grootheid afgerond op n decimalen in de eenheid waarin hij getoond wordt. */
function rondAfInEenheid(x: MathUnit, n: number): unknown {
  const e = unitExpression(x);
  const w = x.toNumber(e);
  const r = nativeRound(w, n) as number;
  try {
    return math.unit(r, e);
  } catch {
    return w === 0 ? x : math.multiply(x as unknown as number, r / w);
  }
}

// ── Iterative numerical solvers (used by parser's $Find/$Solve/$Sup/$Inf
//    rewrite, en $Sum/$Product/$Area/$Integral/$Slope). The `fn` argument is
//    a mathjs user-defined function in scope; we run a robust scalar
//    algorithm on plain numbers (zie opGetallen voor de eenheden).

/**
 * Een functie van één variabele als functie op kale getallen. Heeft een grens
 * een eenheid (`x = 0 mm : 20 mm`), dan krijgt de variabele die eenheid en
 * rekent het algoritme in getallen van die eenheid; een uitkomst met eenheid
 * telt in de eenheid van de eerste uitkomst. `metX` en `metF` zetten een
 * getal weer om naar een grootheid met die eenheid.
 */
function opGetallen(fn: unknown, grenzen: unknown[]): {
  f: (t: number) => number;
  x: number[];
  arg: (t: number) => unknown;
  metX: (t: number) => unknown;
  metF: (w: number) => unknown;
} {
  const g = grenzen.find(isUnit) as MathUnit | undefined;
  const xEenheid = g ? unitExpression(g) : '';
  const x = grenzen.map((v) => (isUnit(v) && xEenheid ? v.toNumber(xEenheid) : asNumber(v)));
  const arg = (t: number): unknown => (xEenheid ? math.unit(t, xEenheid) : t);
  let fEenheid: string | null = null;
  const f = (t: number): number => {
    const y = (fn as (a: unknown) => unknown)(arg(t));
    if (isUnit(y)) {
      if (fEenheid === null) fEenheid = unitExpression(y);
      try { return y.toNumber(fEenheid); } catch { return Number.NaN; }
    }
    if (fEenheid === null) fEenheid = '';
    return Number(asNumber(y));
  };
  return {
    f,
    x,
    arg,
    metX: (t) => arg(t),
    metF: (w) => (fEenheid ? math.unit(w, fEenheid) : w),
  };
}

/** Adaptieve Simpson-integratie van f over [a, b]. */
function simpson(f: (t: number) => number, a: number, b: number): number {
  const stap = (lo: number, hi: number, flo: number, fm: number, fhi: number, heel: number, diepte: number): number => {
    const m = (lo + hi) / 2;
    const lm = (lo + m) / 2;
    const rm = (m + hi) / 2;
    const flm = f(lm);
    const frm = f(rm);
    const links = ((m - lo) / 6) * (flo + 4 * flm + fm);
    const rechts = ((hi - m) / 6) * (fm + 4 * frm + fhi);
    const som = links + rechts;
    if (diepte <= 0 || Math.abs(som - heel) <= 1e-12 * Math.max(1, Math.abs(som))) return som + (som - heel) / 15;
    return stap(lo, m, flo, flm, fm, links, diepte - 1) + stap(m, hi, fm, frm, fhi, rechts, diepte - 1);
  };
  if (a === b) return 0;
  const fa = f(a);
  const fb = f(b);
  const fm = f((a + b) / 2);
  return stap(a, b, fa, fm, fb, ((b - a) / 6) * (fa + 4 * fm + fb), 40);
}

math.import(
  {
    /** Bisection root-finder for f(x) = 0 in [lo, hi]. */
    _find_root: function (fn: unknown, lo: unknown, hi: unknown) {
      if (typeof fn !== 'function') return Number.NaN;
      const { f: evalAt, x: [a0, b0], metX } = opGetallen(fn, [lo, hi]);
      let a = a0; let b = b0;
      if (a > b) [a, b] = [b, a];
      let fa = evalAt(a); const fb = evalAt(b);
      if (!isFinite(fa) || !isFinite(fb)) return Number.NaN;
      if (fa === 0) return metX(a);
      if (fb === 0) return metX(b);
      if (fa * fb > 0) return Number.NaN;
      for (let i = 0; i < 80; i++) {
        const c = (a + b) / 2;
        const fc = evalAt(c);
        if (Math.abs(fc) < 1e-12 || (b - a) < 1e-14) return metX(c);
        if (fa * fc < 0) { b = c; } else { a = c; fa = fc; }
      }
      return metX((a + b) / 2);
    },
    /** Newton-Raphson root-finder for f(x) = 0 starting from `guess`. */
    _solve_newton: function (fn: unknown, guess: unknown) {
      if (typeof fn !== 'function') return Number.NaN;
      const { f: evalAt, x: [x0], metX } = opGetallen(fn, [guess]);
      const klaar = (t: number): unknown => metX(t);
      let x = x0;
      const h = 1e-7;
      for (let i = 0; i < 60; i++) {
        const f = evalAt(x);
        if (!isFinite(f)) return Number.NaN;
        if (Math.abs(f) < 1e-12) return klaar(x);
        const fp = (evalAt(x + h) - f) / h;
        if (!isFinite(fp) || Math.abs(fp) < 1e-15) break;
        const dx = f / fp;
        x = x - dx;
        if (Math.abs(dx) < 1e-12) return klaar(x);
      }
      return klaar(x);
    },
    /** Golden-section extremum over [lo, hi]; sign=+1 → sup, -1 → inf. */
    _extremum: function (fn: unknown, lo: unknown, hi: unknown, sign: unknown) {
      if (typeof fn !== 'function') return Number.NaN;
      const s = Number(sign) >= 0 ? 1 : -1;
      const { f: getal, x: [a0, b0], arg } = opGetallen(fn, [lo, hi]);
      const evalAt = (x: number): number => s * getal(x);
      const phi = (Math.sqrt(5) - 1) / 2;
      let a = a0; let b = b0;
      if (a > b) [a, b] = [b, a];
      let c = b - (b - a) * phi;
      let d = a + (b - a) * phi;
      for (let i = 0; i < 80; i++) {
        if (evalAt(c) > evalAt(d)) b = d; else a = c;
        c = b - (b - a) * phi;
        d = a + (b - a) * phi;
        if ((b - a) < 1e-14) break;
      }
      const xOpt = (a + b) / 2;
      const y = (fn as (n: unknown) => unknown)(arg(xOpt));
      return isUnit(y) ? y : Number(y);
    },
    /** `$Sum{f(k) @ k = a : b}`: f(a) + f(a + 1) + … + f(b), met eenheden. */
    _reeks_som: function (fn: unknown, lo: unknown, hi: unknown) {
      if (typeof fn !== 'function') return Number.NaN;
      const a = Math.round(asNumber(lo));
      const b = Math.round(asNumber(hi));
      if (b - a > 1e6) throw new Error('$Sum: te veel termen');
      let s: unknown = 0;
      for (let k = a; k <= b; k++) {
        const t = (fn as (n: number) => unknown)(k);
        s = k === a ? t : math.add(s as number, t as number);
      }
      return s;
    },
    /** `$Product{f(k) @ k = a : b}`: f(a)·f(a + 1)·…·f(b). */
    _reeks_product: function (fn: unknown, lo: unknown, hi: unknown) {
      if (typeof fn !== 'function') return Number.NaN;
      const a = Math.round(asNumber(lo));
      const b = Math.round(asNumber(hi));
      if (b - a > 1e6) throw new Error('$Product: te veel factoren');
      let p: unknown = 1;
      for (let k = a; k <= b; k++) {
        const t = (fn as (n: number) => unknown)(k);
        p = k === a ? t : math.multiply(p as number, t as number);
      }
      return p;
    },
    /** `$Area{f(x) @ x = a : b}` en `$Integral{…}`: ∫ f dx over [a, b] (adaptieve Simpson), met eenheden. */
    _integraal: function (fn: unknown, lo: unknown, hi: unknown) {
      if (typeof fn !== 'function') return Number.NaN;
      const { f, x: [a, b], metF, metX } = opGetallen(fn, [lo, hi]);
      const w = simpson(f, a, b);
      // De eenheid: die van f maal die van x.
      const fE = metF(1);
      const xE = metX(1);
      let r: unknown = w;
      if (isUnit(fE)) r = math.multiply(r as number, fE as unknown as number);
      if (isUnit(xE)) r = math.multiply(r as number, xE as unknown as number);
      return r;
    },
    /** `$Slope{f(x) @ x = a}`: df/dx in a (centrale differentie met Richardson-extrapolatie). */
    _helling: function (fn: unknown, plaats: unknown) {
      if (typeof fn !== 'function') return Number.NaN;
      const { f, x: [a], metF, metX } = opGetallen(fn, [plaats]);
      const D = (h: number): number => (f(a + h) - f(a - h)) / (2 * h);
      const h = 1e-3 * Math.max(1, Math.abs(a));
      const d1 = D(h);
      const d2 = D(h / 2);
      const d3 = D(h / 4);
      const r1 = (4 * d2 - d1) / 3;
      const r2 = (4 * d3 - d2) / 3;
      const w = (16 * r2 - r1) / 15;
      const fE = metF(1);
      const xE = metX(1);
      let r: unknown = w;
      if (isUnit(fE)) r = math.multiply(r as number, fE as unknown as number);
      if (isUnit(xE)) r = math.divide(r as number, xE as unknown as number);
      return r;
    },
  },
  { override: true },
);

// ── Ligger (packages/core/src/ligger.ts) ───────────────────────────────────
// Een ligger op steunpunten, met overstekken, inklemmingen en scharnieren,
// opgelost met de verplaatsingsmethode. In het blad met kale getallen in m, kN,
// kN/m, kNm en kNm²; een grootheid met eenheid wordt daarnaar omgerekend (EI
// bijvoorbeeld als E*I_y). De invoertabellen geo en last staan in het blad met
// per `|` een grootheid en per kolom een steunpunt of last (zie invoerTabel).
// De uitkomsten zijn matrices: rijen [x, V, M, w] langs de ligger, of [x, R, M]
// per steunpunt (`R.(i; 2)`). Zie ligger.ts voor de afspraken.

/** Getal in m, kN, kN/m, kNm of kNm², afhankelijk van de eenheid; een kaal getal blijft. */
function liggerGetal(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isUnit(v)) {
    for (const e of ['m', 'kN', 'kN/m', 'kN*m', 'kN*m^2']) {
      try { return v.toNumber(e); } catch { /* volgende */ }
    }
    return v.value;
  }
  return asNumber(v);
}
/** Matrix of vector als rijen met getallen. */
function liggerRijen(v: unknown): number[][] {
  const a = toArrayLike(v);
  if (!a) return [[liggerGetal(v)]];
  return a.map((r) => {
    const rr = toArrayLike(r);
    return rr ? rr.map(liggerGetal) : [liggerGetal(r)];
  });
}

/**
 * Invoertabel van de ligger-, raamwerk- en doorsnedefuncties (geo, last, kn,
 * st, op, D): in het blad staat per `|` één grootheid, dus één RIJ, en per
 * kolom één steunpunt, last, knoop of deel — `geo = [x₁; x₂ | soort₁; soort₂]`.
 * De rekenkern wil per object een rij; daarom gekanteld. Een vector blijft
 * zoals liggerRijen hem leest. De uitkomsten van deze functies staan al per
 * punt of per object in een rij (`R.(i; 2)`) en gaan via liggerRijen.
 */
function invoerTabel(v: unknown, getal: (x: unknown) => number): number[][] {
  const a = toArrayLike(v);
  if (!a) return [[getal(v)]];
  if (a.length === 0 || toArrayLike(a[0]) === null) return a.map((e) => [getal(e)]);
  const rijen = a.map((r) => toArrayLike(r) ?? [r]);
  const n = Math.max(...rijen.map((r) => r.length));
  return Array.from({ length: n }, (_, j) => rijen.map((r) => getal(r[j] ?? 0)));
}
const liggerTabel = (v: unknown): number[][] => invoerTabel(v, liggerGetal);
/** Vector als platte lijst getallen (ook een kolom- of rijmatrix). */
function liggerVector(v: unknown): number[] | undefined {
  if (v === undefined) return undefined;
  const a = toArrayLike(v);
  if (!a) return [liggerGetal(v)];
  return a.flatMap((r) => {
    const rr = toArrayLike(r);
    return rr ? rr.map(liggerGetal) : [liggerGetal(r)];
  });
}
const liggerMatrix = (m: number[][]) => math.matrix(m);
/** Stijfheid van de ligger: EI (kNm²) of de vector [EI; GA] met GA = κ·G·A (kN) voor de afschuifvervorming. */
function liggerStijf(v: unknown): number | number[] {
  return toArrayLike(v) ? (liggerVector(v) ?? [0]) : liggerGetal(v);
}

math.import(
  {
    /** ligger(geo; last; EI[; f[; deel[; xs]]]) → [x, V, M, w] langs de ligger, met de punten xs erbij. */
    ligger: function (geo: unknown, last: unknown, EI: unknown, f?: unknown, deel?: unknown, xs?: unknown) {
      return liggerMatrix(liggerOplossing(
        liggerTabel(geo), liggerTabel(last), liggerStijf(EI), liggerVector(f), deel === undefined ? 0 : liggerGetal(deel),
        liggerVector(xs) ?? [],
      ));
    },
    /** ligger_R(geo; last; EI[; f[; deel]]) → [x, R, M] per steunpunt. */
    ligger_R: function (geo: unknown, last: unknown, EI: unknown, f?: unknown, deel?: unknown) {
      return liggerMatrix(liggerReacties(liggerTabel(geo), liggerTabel(last), liggerStijf(EI), liggerVector(f), deel === undefined ? 0 : liggerGetal(deel)));
    },
    /** ligger_omh(geo; last; EI; groep; f1; f2; teken[; lead]) → omhullende [x, V, M, w]. */
    ligger_omh: function (geo: unknown, last: unknown, EI: unknown, groep: unknown, f1: unknown, f2: unknown, teken?: unknown, lead?: unknown) {
      return liggerMatrix(liggerOmhullende(
        liggerTabel(geo), liggerTabel(last), liggerStijf(EI), liggerVector(groep) ?? [], liggerVector(f1) ?? [], liggerVector(f2) ?? [],
        teken === undefined ? 1 : liggerGetal(teken), lead === undefined ? 0 : liggerGetal(lead),
      ));
    },
    /** ligger_omhR(…) → omhullende [x, R, M] per steunpunt, argumenten als ligger_omh. */
    ligger_omhR: function (geo: unknown, last: unknown, EI: unknown, groep: unknown, f1: unknown, f2: unknown, teken?: unknown, lead?: unknown) {
      return liggerMatrix(liggerOmhullendeReacties(
        liggerTabel(geo), liggerTabel(last), liggerStijf(EI), liggerVector(groep) ?? [], liggerVector(f1) ?? [], liggerVector(f2) ?? [],
        teken === undefined ? 1 : liggerGetal(teken), lead === undefined ? 0 : liggerGetal(lead),
      ));
    },
    /** ligger_max(R1; R2; …) → per punt en per kolom de grootste waarde (x uit R1). */
    ligger_max: function (...ms: unknown[]) {
      return liggerMatrix(liggerSamen(1, ...ms.map(liggerRijen)));
    },
    /** ligger_min(R1; R2; …) → per punt en per kolom de kleinste waarde (x uit R1). */
    ligger_min: function (...ms: unknown[]) {
      return liggerMatrix(liggerSamen(-1, ...ms.map(liggerRijen)));
    },
    /** ligger_ext(R; k[; x1; x2]) → [max; x bij max; min; x bij min] van kolom k. */
    ligger_ext: function (R: unknown, k: unknown, x1?: unknown, x2?: unknown) {
      return math.matrix(liggerExtremen(liggerRijen(R), liggerGetal(k),
        x1 === undefined ? -Infinity : liggerGetal(x1), x2 === undefined ? Infinity : liggerGetal(x2)));
    },
    /** ligger_int(R; k; x) → kolom k in x, lineair tussen de rasterpunten. */
    ligger_int: function (R: unknown, k: unknown, x: unknown) {
      return liggerInterpoleer(liggerRijen(R), liggerGetal(k), liggerGetal(x));
    },
    /** ligger_nul(R; k; x_van; x_tot) → eerste x vanaf x_van waar kolom k niet negatief is. */
    ligger_nul: function (R: unknown, k: unknown, xVan: unknown, xTot: unknown) {
      return liggerNulpunt(liggerRijen(R), liggerGetal(k), liggerGetal(xVan), liggerGetal(xTot));
    },
    /** ligger_status(geo[; EI]) → 1 stabiel, -1 beweeglijk, 0 ongeldig. */
    ligger_status: function (geo: unknown, EI?: unknown) {
      return liggerStatus(liggerTabel(geo), EI === undefined ? 1 : liggerStijf(EI));
    },
    /** ligger_delen(geo) → [x_begin, x_eind] per deel voor de schaakbordbelasting. */
    ligger_delen: function (geo: unknown) {
      return liggerMatrix(liggerDelen(liggerTabel(geo)));
    },
    /** ligger_velden(geo) → [x_begin, x_eind, overstek] per veld tussen de steunpunten. */
    ligger_velden: function (geo: unknown) {
      return liggerMatrix(liggerVelden(liggerTabel(geo)));
    },
    /** ligger_svg(R; k; x0; sx; y0; sy[; kant]) → "X,Y X,Y …" voor een polyline of polygon; kant 1 of −1 houdt alleen het positieve of het negatieve deel. */
    ligger_svg: function (R: unknown, k: unknown, x0: unknown, sx: unknown, y0: unknown, sy: unknown, kant?: unknown) {
      return liggerSvgPunten(liggerRijen(R), liggerGetal(k), liggerGetal(x0), liggerGetal(sx), liggerGetal(y0), liggerGetal(sy),
        kant === undefined ? 0 : liggerGetal(kant));
    },
  },
  { override: true },
);

// ── Raamwerk (packages/core/src/raamwerk.ts) ────────────────────────────────
// Een vlak raamwerk van knopen en staven met scharnieren en opleggingen,
// eerste orde opgelost met de verplaatsingsmethode. Kale getallen in m, kN,
// kN/m, kNm, kNm² (EI) en kN (EA); een grootheid met eenheid wordt omgerekend
// zoals bij de ligger. Uitkomst per staaf: rijen [staaf, s, x, y, N, V, M, u_x,
// u_y, w]. Zie raamwerk.ts voor de afspraken.

/**
 * Rijen van een matrix voor de raamwerkfuncties. Een blad vraagt een uitkomst
 * vaak vele keren op (per staaf, per toets); een matrix met alleen kale getallen
 * gaat daarom zonder kopie door, de rest via liggerRijen (eenheden, vectoren).
 */
function raamwerkRijen(v: unknown): number[][] {
  const d = (v as { _data?: unknown })?._data;
  if (Array.isArray(d) && d.length && d.every((r) => Array.isArray(r) && (r as unknown[]).every((x) => typeof x === 'number'))) {
    return d as number[][];
  }
  return liggerRijen(v);
}
/** Invoertabel kn, st, op of last: per `|` een grootheid, per kolom een knoop, staaf, oplegging of last (zie invoerTabel). */
const raamwerkTabel = (v: unknown): number[][] => invoerTabel(v, liggerGetal);

math.import(
  {
    /** raamwerk(kn; st; op; last[; f[; toppen]]) → [staaf, s, x, y, N, V, M, u_x, u_y, w] langs de staven. */
    raamwerk: function (kn: unknown, st: unknown, op: unknown, last: unknown, f?: unknown, toppen?: unknown) {
      return liggerMatrix(raamwerkOplossing(
        raamwerkTabel(kn), raamwerkTabel(st), raamwerkTabel(op), raamwerkTabel(last), liggerVector(f),
        toppen === undefined ? 0 : liggerGetal(toppen),
      ));
    },
    /** raamwerk_R(kn; st; op; last[; f]) → [knoop, R_x, R_y, M] per oplegging. */
    raamwerk_R: function (kn: unknown, st: unknown, op: unknown, last: unknown, f?: unknown) {
      return liggerMatrix(raamwerkReacties(raamwerkTabel(kn), raamwerkTabel(st), raamwerkTabel(op), raamwerkTabel(last), liggerVector(f)));
    },
    /** raamwerk_u(kn; st; op; last[; f]) → [knoop, u_x, u_y, φ] per knoop. */
    raamwerk_u: function (kn: unknown, st: unknown, op: unknown, last: unknown, f?: unknown) {
      return liggerMatrix(raamwerkVerplaatsingen(raamwerkTabel(kn), raamwerkTabel(st), raamwerkTabel(op), raamwerkTabel(last), liggerVector(f)));
    },
    /** raamwerk_acr(kn; st; op; last[; f]) → kritieke belastingsfactor α_cr van de combinatie. */
    raamwerk_acr: function (kn: unknown, st: unknown, op: unknown, last: unknown, f?: unknown) {
      return raamwerkKnik(raamwerkTabel(kn), raamwerkTabel(st), raamwerkTabel(op), raamwerkTabel(last), liggerVector(f));
    },
    /** raamwerk_status(kn; st; op) → 1 stabiel, -1 beweeglijk, 0 ongeldig. */
    raamwerk_status: function (kn: unknown, st: unknown, op: unknown) {
      return raamwerkStatus(raamwerkTabel(kn), raamwerkTabel(st), raamwerkTabel(op));
    },
    /** raamwerk_ext(R; staaf; k) → [max; s bij max; min; s bij min] van kolom k (staaf 0: alle staven). */
    raamwerk_ext: function (R: unknown, staaf: unknown, k: unknown) {
      return math.matrix(raamwerkExtremen(raamwerkRijen(R), liggerGetal(staaf), liggerGetal(k)));
    },
    /** raamwerk_int(R; staaf; k; s) → kolom k van de staaf in s, lineair tussen de rasterpunten. */
    raamwerk_int: function (R: unknown, staaf: unknown, k: unknown, s: unknown) {
      return raamwerkInterpoleer(raamwerkRijen(R), liggerGetal(staaf), liggerGetal(k), liggerGetal(s));
    },
    /** raamwerk_sam(R; staaf) → [N_min; N_max; V_min; V_max; M_min; M_max; M(0); M(L/4); M(L/2); M(3L/4); M(L); L; w_min; w_max]. */
    raamwerk_sam: function (R: unknown, staaf: unknown) {
      return math.matrix(raamwerkSamenvatting(raamwerkRijen(R), liggerGetal(staaf)));
    },
    /** raamwerk_zak(R; staaf; x_a; u_a; x_b; u_b) → grootste verticale verplaatsing ten opzichte van de lijn door (x_a, u_a) en (x_b, u_b). */
    raamwerk_zak: function (R: unknown, staaf: unknown, xa: unknown, ua: unknown, xb: unknown, ub: unknown) {
      return raamwerkZakking(raamwerkRijen(R), liggerGetal(staaf), liggerGetal(xa), liggerGetal(ua), liggerGetal(xb), liggerGetal(ub));
    },
    /** raamwerk_svg(R; staaf; k; x0; y0; schaal; sk) → "X,Y …" voor een polygoon met het verloop van kolom k. */
    raamwerk_svg: function (R: unknown, staaf: unknown, k: unknown, x0: unknown, y0: unknown, schaal: unknown, sk: unknown) {
      return raamwerkSvgPunten(raamwerkRijen(R), liggerGetal(staaf), liggerGetal(k), liggerGetal(x0), liggerGetal(y0), liggerGetal(schaal), liggerGetal(sk));
    },
    /** raamwerk_vorm(R; staaf; x0; y0; schaal; su) → "X,Y …" voor de verplaatste vorm van de staaf. */
    raamwerk_vorm: function (R: unknown, staaf: unknown, x0: unknown, y0: unknown, schaal: unknown, su: unknown) {
      return raamwerkVormPunten(raamwerkRijen(R), liggerGetal(staaf), liggerGetal(x0), liggerGetal(y0), liggerGetal(schaal), liggerGetal(su));
    },
    /** raamwerk_max(R1; R2; …) → per punt en per kolom de grootste waarde (zelfde raster). */
    raamwerk_max: function (...ms: unknown[]) {
      return liggerMatrix(liggerSamen(1, ...ms.map(liggerRijen)));
    },
    /** raamwerk_min(R1; R2; …) → per punt en per kolom de kleinste waarde (zelfde raster). */
    raamwerk_min: function (...ms: unknown[]) {
      return liggerMatrix(liggerSamen(-1, ...ms.map(liggerRijen)));
    },
  },
  { override: true },
);

// ── Plaat op palen (packages/core/src/plaat.ts) ─────────────────────────────
// Een vlakke plaat op verende palen in een regelmatig raster, met DKT-elementen.
// geo = [L_x; L_y; n_x; n_y; t; E; ν; k; d_kop; n_el]: paalafstanden, aantal velden,
// dikte, E-modulus, dwarscontractie, veer per paal, diameter paalkop en elementen
// per veld. last = per veld de belasting (kN/m²), een rij per veld in y (de
// onderste eerst), een kolom per veld in x. Een maat met eenheid wordt omgerekend
// naar m, kN/m², kN/m en kN/m²; een kaal getal telt in die eenheden.

const PLAAT_EENHEDEN = ['m', 'm', '', '', 'm', 'kN/m^2', '', 'kN/m', 'm', ''];

function plaatGetal(v: unknown, eenheid: string): number {
  if (isUnit(v)) {
    if (!eenheid) return v.value;
    try { return v.toNumber(eenheid); } catch { throw new Error(`plaat: ${String(v)} past niet bij ${eenheid}`); }
  }
  return liggerGetal(v);
}

function plaatInvoer(geo: unknown, last: unknown): PlaatInvoer {
  const a = toArrayLike(geo);
  const g = (a ?? [geo]).flatMap((r) => toArrayLike(r) ?? [r]);
  if (g.length < 10) throw new Error('plaat: geo heeft 10 waarden: [L_x; L_y; n_x; n_y; t; E; ν; k; d_kop; n_el]');
  const v = PLAAT_EENHEDEN.map((e, i) => plaatGetal(g[i], e));
  const q = invoerTabel(last, (x) => plaatGetal(x, 'kN/m^2'));
  return { lx: v[0], ly: v[1], nbx: Math.round(v[2]), nby: Math.round(v[3]), t: v[4], E: v[5], nu: v[6], k: v[7], dKop: v[8], nEl: Math.round(v[9]), q };
}

math.import(
  {
    /** plaat_palen(geo; last) → [m_x,veld; m_y,veld; m_x,steun; m_y,steun; m_x,ks; m_y,ks; w_max; R_max; R_midden] (kNm/m, mm, kN). */
    plaat_palen: function (geo: unknown, last: unknown) {
      return math.matrix(plaatSamenvatting(plaatOplossing(plaatInvoer(geo, last))));
    },
    /** plaat_R(geo; last) → [i, j, x, y, R] per paal (m, kN). */
    plaat_R: function (geo: unknown, last: unknown) {
      return math.matrix(plaatOplossing(plaatInvoer(geo, last)).palen.map((p) => [p.i, p.j, p.x, p.y, p.R]));
    },
    /** plaat_w(geo; last; x; y) → de doorbuiging (mm) op (x, y) in m. */
    plaat_w: function (geo: unknown, last: unknown, x: unknown, y: unknown) {
      return plaatDoorbuiging(plaatOplossing(plaatInvoer(geo, last)), plaatGetal(x, 'm'), plaatGetal(y, 'm'));
    },
    /** plaat_svg(geo; last; grootheid; x0; y0; schaal) → SVG-elementen: 1 = w, 2 = m_x, 3 = m_y. */
    plaat_svg: function (geo: unknown, last: unknown, grootheid: unknown, x0: unknown, y0: unknown, schaal: unknown) {
      return plaatSvg(plaatOplossing(plaatInvoer(geo, last)), liggerGetal(grootheid), liggerGetal(x0), liggerGetal(y0), liggerGetal(schaal));
    },
  },
  { override: true },
);

// ── Een @fem-model (packages/core/src/femBlok.ts, femResultaat.ts) ───────────
// Het blok zet het doorgerekende model onder zijn naam in de scope. De functies
// krijgen het model, de naam van een geval of combinatie als tekst, de grootheid
// ("w", "mx", "my", "mxy", "vx", "vy") en plaatsen in m (een kaal getal telt in m).

function femModelUit(model: unknown, functie: string): FemModel {
  if (model instanceof FemModel) return model;
  throw new Error(`${functie}: het eerste argument is een @fem-model, zoals vloer (de naam van het blok)`);
}
function femTekst(v: unknown, functie: string, wat: string): string {
  if (typeof v === 'string') return v;
  throw new Error(`${functie}: ${wat} staat tussen aanhalingstekens, zoals "UGT"`);
}
const femMeter = (v: unknown) => plaatGetal(v, 'm');
/** Een uitkomst met zijn eenheid: mm, kNm/m of kN/m. */
function femMetEenheid(v: number, grootheid: string) {
  const e = FEM_EENHEID[femGrootheid(grootheid)];
  return math.unit(v, e === 'kNm/m' ? 'kN m / m' : e === 'kN/m' ? 'kN / m' : e);
}

math.import(
  {
    /** fem_waarde(model; "UGT"; "mx"; x; y) → de waarde op (x, y): w in mm, momenten in kNm/m, dwarskrachten in kN/m. */
    fem_waarde: function (model: unknown, set: unknown, grootheid: unknown, x: unknown, y: unknown) {
      const g = femTekst(grootheid, 'fem_waarde', 'de grootheid');
      return femMetEenheid(femWaarde(femModelUit(model, 'fem_waarde'), femTekst(set, 'fem_waarde', 'het geval'), g, femMeter(x), femMeter(y)), g);
    },
    /** fem_strook(model; "UGT"; "mx"; x1; y1; x2; y2) → het gemiddelde over de rechthoek, of over de lijn als hij geen breedte heeft. */
    fem_strook: function (model: unknown, set: unknown, grootheid: unknown, x1: unknown, y1: unknown, x2: unknown, y2: unknown) {
      const g = femTekst(grootheid, 'fem_strook', 'de grootheid');
      return femMetEenheid(
        femStrook(femModelUit(model, 'fem_strook'), femTekst(set, 'fem_strook', 'het geval'), g, femMeter(x1), femMeter(y1), femMeter(x2), femMeter(y2)),
        g,
      );
    },
    /** fem_svg(model; "UGT"; "mx" [; breedte]) → een plattegrond in kleur met legenda, als <svg> voor een @svg-blok. */
    fem_svg: function (model: unknown, set: unknown, grootheid: unknown, breedte?: unknown) {
      const b = breedte === undefined ? 640 : Math.round(liggerGetal(breedte));
      return femSvg(femModelUit(model, 'fem_svg'), femTekst(set, 'fem_svg', 'het geval'), femTekst(grootheid, 'fem_svg', 'de grootheid'), Math.min(1600, Math.max(240, b)), huidigeTaal);
    },
    /** fem_reacties(model; "UGT") → per veer [x; y; R] (m, m, kN), in de volgorde van het blok. */
    fem_reacties: function (model: unknown, set: unknown) {
      const m = femModelUit(model, 'fem_reacties');
      const R = m.verenReactie(m.set(femTekst(set, 'fem_reacties', 'het geval')));
      const rijen = m.m.veren.map((v, i) => [math.unit(m.m.x[v[0][0]], 'm'), math.unit(m.m.y[v[0][0]], 'm'), math.unit(R[i], 'kN')]);
      return math.matrix(rijen as unknown as number[][]);
    },
  },
  { override: true },
);

// ── Doorsnede (packages/core/src/doorsnede.ts) ──────────────────────────────
// Grootheden van een samengestelde doorsnede: in het blad per `|` een rij
// [soort; p1 … p5; y; z; n; draai] met per kolom een deel, kale getallen in mm (een lengte met eenheid wordt naar mm
// omgerekend). Zie doorsnede.ts voor de afspraken.

/** Getal in mm; een kaal getal blijft. */
function doorsnedeGetal(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (isUnit(v)) {
    try { return v.toNumber('mm'); } catch { return v.value; }
  }
  return asNumber(v);
}
/** Invoertabel D: per `|` een grootheid (soort, p1 … p5, y, z, n, draai), per kolom een deel (zie invoerTabel). */
const doorsnedeTabel = (v: unknown): number[][] => invoerTabel(v, doorsnedeGetal);

math.import(
  {
    /** doorsnede(D) → [A; y_c; z_c; I_y; I_z; I_yz; y_min; y_max; z_min; z_max] van de ideële doorsnede. */
    doorsnede: function (D: unknown) {
      return math.matrix(doorsnedeGrootheden(doorsnedeTabel(D)));
    },
    /** doorsnede_deel(D; i) → [A; I_y; I_z; y_min; y_max; z_min; z_max] van deel i, om zijn eigen hart, zonder n. */
    doorsnede_deel: function (D: unknown, i: unknown) {
      return math.matrix(doorsnedeDeel(doorsnedeTabel(D), doorsnedeGetal(i)));
    },
    /** doorsnede_pl(D; as) → [W_pl; plaats van de plastische neutrale lijn], as 1 = om de y-as, 2 = om de z-as. */
    doorsnede_pl: function (D: unknown, as: unknown) {
      return math.matrix(doorsnedePlastisch(doorsnedeTabel(D), doorsnedeGetal(as)));
    },
    /** doorsnede_S(D; as; s) → [S; b]: statisch moment voorbij de lijn s om de zwaartelijn, en de breedte daar. */
    doorsnede_S: function (D: unknown, as: unknown, s: unknown) {
      return math.matrix(doorsnedeStatisch(doorsnedeTabel(D), doorsnedeGetal(as), doorsnedeGetal(s)));
    },
    /** doorsnede_svg(D; i; x0; y0; schaal) → "X,Y …" voor een polygoon met de omtrek van deel i. */
    doorsnede_svg: function (D: unknown, i: unknown, x0: unknown, y0: unknown, schaal: unknown) {
      return doorsnedeSvgPunten(doorsnedeTabel(D), doorsnedeGetal(i), doorsnedeGetal(x0), doorsnedeGetal(y0), doorsnedeGetal(schaal));
    },
  },
  { override: true },
);

// ── Rekentaal: vectoren en matrices ───────────────────────────────────────────
// Een matrix staat in mathjs zoals in de rekentaal: rij i is rij i. Een vector is
// eendimensionaal; in een product met een matrix telt hij als kolom.
//
// Functienamen die mathjs zelf ook kent maar anders bedoelt (lsolve, matrix,
// sum, count), krijgen hun betekenis in de rekentaal via vertaalRekentaal: die zet ze in
// de expressie om naar de functies hieronder met `_cp_` ervoor. Zo blijft de
// mathjs-functie zelf ongemoeid; lusolve bijvoorbeeld rekent intern met
// mathjs' lsolve voor een onderdriehoeksmatrix.

/** De eenheid van een grootheid als grootheid met waarde 1 (`1 kN/m`); null bij een kaal getal. */
function eenheidEen(v: unknown): unknown | null {
  if (!isUnit(v)) return null;
  const naam = v.formatUnits();
  if (naam.trim() === '') return null;
  try {
    return math.unit(1, naam);
  } catch {
    return null;
  }
}

/** Niet nul: een element dat telt bij het afleiden van de eenheden. */
function nietNul(v: unknown): boolean {
  if (isUnit(v)) return v.value !== null && v.value !== 0;
  const n = asNumber(v);
  return Number.isFinite(n) ? n !== 0 : true;
}

/** Een uitkomst die dimensieloos moet zijn, als getal; anders een foutmelding. */
function dimensieloos(v: unknown, functie: string): number {
  if (typeof v === 'number') return v;
  if (isUnit(v)) {
    throw new Error(`${functie}: de eenheden passen niet bij elkaar`);
  }
  const n = asNumber(v);
  if (!Number.isFinite(n)) throw new Error(`${functie}: een element is geen getal`);
  return n;
}

/** Bevat de lijst een grootheid met eenheid? */
const metEenheid = (lijst: unknown[]): boolean => lijst.some(isUnit);

/** Een vierkante matrix als rijen; een foutmelding bij iets anders. */
function vierkant(A: unknown, functie: string): unknown[][] {
  const d = afmetingen(A);
  if (!d || d.length !== 2) throw new Error(`${functie}: verwacht een matrix`);
  if (d[0] !== d[1]) throw new Error(`${functie}: de matrix moet vierkant zijn (${d[0]} × ${d[1]})`);
  return alsRijen(A);
}

/**
 * Lost A·x = b op voor één rechterlid, met eenheden. Gerekend wordt op
 * getalwaarden; de eenheden volgen per element uit b en A: als rij i van b de
 * eenheid r_i heeft en element A_ij de eenheid a_ij, dan krijgt x_j de eenheid
 * r_i / a_ij. Bij een stijfheidsmatrix met kN/m, kN en kNm en een lastvector
 * met kN en kNm komt de verplaatsing zo in m en de rotatie dimensieloos (rad).
 * Een rij van b zonder eenheid en met waarde 0 krijgt haar eenheid uit A.
 */
function losEenOp(a: unknown[][], b: unknown[], functie: string): unknown[] {
  const n = a.length;
  if (b.length !== n) throw new Error(`${functie}: het rechterlid heeft ${b.length} elementen, de matrix ${n} rijen`);
  const alles = [...b, ...a.flat()];
  if (!metEenheid(alles)) {
    const x = losStelselOp(a.map((r) => r.map((v) => dimensieloos(v, functie))), b.map((v) => [dimensieloos(v, functie)]), functie);
    return x.map((r) => r[0]);
  }

  const eenheidA = a.map((r) => r.map(eenheidEen));
  const rij: unknown[] = b.map((v) => (isUnit(v) ? eenheidEen(v) ?? 1 : nietNul(v) ? 1 : undefined));
  const kol: unknown[] = new Array(n).fill(undefined);
  const verspreid = (): void => {
    let veranderd = true;
    while (veranderd) {
      veranderd = false;
      for (let j = 0; j < n; j++) {
        if (kol[j] !== undefined) continue;
        for (let i = 0; i < n; i++) {
          if (rij[i] !== undefined && nietNul(a[i][j])) {
            kol[j] = math.divide(rij[i] as number, (eenheidA[i][j] ?? 1) as number);
            veranderd = true;
            break;
          }
        }
      }
      for (let i = 0; i < n; i++) {
        if (rij[i] !== undefined) continue;
        for (let j = 0; j < n; j++) {
          if (kol[j] !== undefined && nietNul(a[i][j])) {
            rij[i] = math.multiply((eenheidA[i][j] ?? 1) as number, kol[j] as number);
            veranderd = true;
            break;
          }
        }
      }
    }
  };
  verspreid();
  if (rij.includes(undefined)) {
    for (let i = 0; i < n; i++) if (rij[i] === undefined) rij[i] = 1;
    verspreid();
  }
  for (let j = 0; j < n; j++) if (kol[j] === undefined) kol[j] = 1;

  const An = a.map((r, i) => r.map((v, j) =>
    nietNul(v) ? dimensieloos(math.divide(math.multiply(v as number, kol[j] as number), rij[i] as number), functie) : 0,
  ));
  const bn = b.map((v, i) => (nietNul(v) ? dimensieloos(math.divide(v as number, rij[i] as number), functie) : 0));
  const x = losStelselOp(An, bn.map((v) => [v]), functie);
  return x.map((r, j) => (typeof kol[j] === 'number' ? (r[0] * (kol[j] as number)) : math.multiply(r[0], kol[j] as number)));
}

/**
 * lsolve, clsolve en slsolve (één rechterlid, uitkomst een platte
 * vector) en msolve, cmsolve en smsolve (de kolommen van B zijn de
 * rechterleden, uitkomst een matrix met per kolom de oplossing). Alle zes met
 * dezelfde algemene oplosser (LU met rijpivotering): die werkt voor elke
 * niet-singuliere matrix, ook als hij niet symmetrisch of niet
 * positief-definiet is.
 */
function losOp(A: unknown, B: unknown, functie: string, meerdere: boolean): unknown {
  const a = vierkant(A, functie);
  const d = afmetingen(B);
  let kolommen: unknown[][];
  let vectorUit = !meerdere;
  if (!d) {
    kolommen = [[B]];
  } else if (d.length === 1) {
    kolommen = [toArrayLike(B) ?? []];
    vectorUit = true;
  } else {
    const rb = alsRijen(B);
    kolommen = Array.from({ length: d[1] }, (_, j) => rb.map((r) => r[j]));
    if (!meerdere && d[1] !== 1) {
      throw new Error(`${functie}: het rechterlid moet een vector zijn; gebruik msolve voor meerdere rechterleden`);
    }
  }
  const oplossingen = kolommen.map((b) => losEenOp(a, b, functie));
  if (vectorUit) return math.matrix(oplossingen[0] as number[]);
  return math.matrix(Array.from({ length: a.length }, (_, i) => oplossingen.map((x) => x[i])) as number[][]);
}

/** Een matrix als getallen in één eenheid (die van het eerste element met eenheid). */
function getallenMatrix(M: unknown, functie: string): { getallen: number[][]; eenheid: unknown | null } {
  const rijen = alsRijen(M);
  const eerste = rijen.flat().find((v) => isUnit(v) && nietNul(v));
  const eenheid = eerste === undefined ? null : eenheidEen(eerste);
  const getallen = rijen.map((r) => r.map((v) => {
    if (!nietNul(v)) return 0;
    return eenheid ? dimensieloos(math.divide(v as number, eenheid as number), functie) : dimensieloos(v, functie);
  }));
  return { getallen, eenheid };
}

/** Eigenwaarden van een symmetrische matrix, met het aantal n_e zoals in de rekentaal. */
function eigenKeuze(M: unknown, ne: unknown, functie: string): { waarden: unknown[]; vectoren: number[][] } {
  vierkant(M, functie);
  const { getallen, eenheid } = getallenMatrix(M, functie);
  const { waarden, vectoren } = eigenSymmetrisch(getallen, functie);
  let k = ne === undefined ? 0 : Math.round(asNumber(ne));
  let w = waarden;
  let v = vectoren;
  if (k < 0) {
    w = [...waarden].reverse();
    v = [...vectoren].reverse();
    k = -k;
  }
  if (k > 0) {
    w = w.slice(0, k);
    v = v.slice(0, k);
  }
  return { waarden: w.map((x) => (eenheid ? math.multiply(x, eenheid as number) : x)), vectoren: v };
}

/** Vector of matrix van dezelfde vorm, gevuld met x. */
function gevuld(v: unknown, x: unknown): unknown {
  const d = afmetingen(v);
  if (!d) return x;
  if (d.length === 1) return math.matrix(new Array(d[0]).fill(x));
  return math.matrix(Array.from({ length: d[0] }, () => new Array(d[1]).fill(x)));
}

/** Som van een lijst met eenheden (mathjs add), 0 bij een lege lijst. */
function somVan(lijst: unknown[]): unknown {
  if (lijst.length === 0) return 0;
  return lijst.reduce((s, v) => math.add(s as number, v as number));
}

/** Een vector (1D) uit een vector of een matrix met één rij of kolom. */
function alsVector(v: unknown, functie: string): unknown[] {
  const d = afmetingen(v);
  if (!d) return [v];
  if (d.length === 1) return (toArrayLike(v) ?? []).slice();
  if (d[0] === 1 || d[1] === 1) return plat([v]);
  throw new Error(`${functie}: verwacht een vector`);
}

math.import(
  {
    // Bouwstenen van een literaal (zie vertaalRekentaal): `[a; b; c]` vouwt een
    // vector of matrix als element uit, zoals in de rekentaal (`[0; a; 6]`); een
    // matrix `[r1 | r2]` vult kortere rijen met nullen aan.
    _cp_vector_lit: function (...items: unknown[]) {
      return math.matrix(plat(items) as number[]);
    },
    _cp_rij: function (...items: unknown[]) {
      return plat(items);
    },
    _cp_matrix_lit: function (...rijen: unknown[]) {
      const r = rijen.map((x) => (Array.isArray(x) ? x : plat([x])));
      const n = Math.max(0, ...r.map((x) => x.length));
      return math.matrix(r.map((x) => (x.length < n ? [...x, ...new Array(n - x.length).fill(0)] : x)) as number[][]);
    },

    // Stelsels oplossen; zie losOp.
    _cp_lsolve: function (A: unknown, b: unknown) { return losOp(A, b, 'lsolve', false); },
    clsolve: function (A: unknown, b: unknown) { return losOp(A, b, 'clsolve', false); },
    slsolve: function (A: unknown, b: unknown) { return losOp(A, b, 'slsolve', false); },
    msolve: function (A: unknown, B: unknown) { return losOp(A, B, 'msolve', true); },
    cmsolve: function (A: unknown, B: unknown) { return losOp(A, B, 'cmsolve', true); },
    smsolve: function (A: unknown, B: unknown) { return losOp(A, B, 'smsolve', true); },

    // Aanmaken. `matrix(m; n)` en `vector(n)` zijn nulmatrices; matrix() met
    // een lijst blijft de mathjs-functie.
    _cp_matrix: function (m: unknown, n: unknown) {
      if (toArrayLike(m) || typeof m === 'string') return math.matrix(m as number[], n as 'dense');
      return math.zeros(indexGetal(m, 'matrix'), indexGetal(n, 'matrix'));
    },
    vector: function (n: unknown) {
      return math.zeros(indexGetal(n, 'vector'));
    },
    diagonal: function (n: unknown, d: unknown) {
      return math.multiply(math.identity(indexGetal(n, 'diagonal')), d as number);
    },
    vec2diag: function (v: unknown) { return math.diag(math.matrix(alsVector(v, 'vec2diag') as number[])); },
    diag2vec: function (M: unknown) { return math.matrix(math.diag(vierkant(M, 'diag2vec') as unknown as number[][])); },
    vec2row: function (v: unknown) { return math.matrix([alsVector(v, 'vec2row')] as number[][]); },
    vec2col: function (v: unknown) { return math.matrix(alsVector(v, 'vec2col').map((x) => [x]) as number[][]); },
    join_cols: function (...vs: unknown[]) {
      const kolommen = vs.map((v) => alsVector(v, 'join_cols'));
      const m = Math.max(0, ...kolommen.map((k) => k.length));
      return math.matrix(Array.from({ length: m }, (_, i) => kolommen.map((k) => k[i] ?? 0)) as number[][]);
    },
    join_rows: function (...vs: unknown[]) {
      const rijen = vs.map((v) => alsVector(v, 'join_rows'));
      const n = Math.max(0, ...rijen.map((r) => r.length));
      return math.matrix(rijen.map((r) => [...r, ...new Array(n - r.length).fill(0)]) as number[][]);
    },
    augment: function (...ms: unknown[]) {
      const delen = ms.map(alsRijen);
      const m = Math.max(0, ...delen.map((d) => d.length));
      return math.matrix(Array.from({ length: m }, (_, i) => delen.flatMap((d) => {
        const breed = Math.max(0, ...d.map((r) => r.length));
        const r = d[i] ?? [];
        return [...r, ...new Array(breed - r.length).fill(0)];
      })) as number[][]);
    },
    stack: function (...ms: unknown[]) {
      const rijen = ms.flatMap(alsRijen);
      const n = Math.max(0, ...rijen.map((r) => r.length));
      return math.matrix(rijen.map((r) => [...r, ...new Array(n - r.length).fill(0)]) as number[][]);
    },
    submatrix: function (M: unknown, i1: unknown, i2: unknown, j1: unknown, j2: unknown) {
      const r = alsRijen(M);
      const [a, b] = [indexGetal(i1, 'submatrix'), indexGetal(i2, 'submatrix')];
      const [c, d] = [indexGetal(j1, 'submatrix'), indexGetal(j2, 'submatrix')];
      if (a < 1 || b > r.length || a > b || c < 1 || d > (r[0]?.length ?? 0) || c > d) {
        throw new Error('submatrix: index buiten de matrix');
      }
      return math.matrix(r.slice(a - 1, b).map((rij) => rij.slice(c - 1, d)) as number[][]);
    },

    // Structuur
    len: function (v: unknown) {
      const d = afmetingen(v);
      if (!d) return 1;
      if (d.length === 1) return d[0];
      if (d[0] === 1 || d[1] === 1) return d[0] * d[1];
      throw new Error('len: verwacht een vector; gebruik n_rows en n_cols voor een matrix');
    },
    fill: function (v: unknown, x: unknown) { return gevuld(v, x); },
    mfill: function (M: unknown, x: unknown) { return gevuld(M, x); },
    first: function (v: unknown, n: unknown) {
      const a = alsVector(v, 'first');
      return math.matrix(a.slice(0, Math.max(0, indexGetal(n ?? 1, 'first'))) as number[]);
    },
    last: function (v: unknown, n: unknown) {
      const a = alsVector(v, 'last');
      const k = Math.max(0, indexGetal(n ?? 1, 'last'));
      return math.matrix(a.slice(Math.max(0, a.length - k)) as number[]);
    },
    slice: function (v: unknown, i1: unknown, i2: unknown) {
      const a = alsVector(v, 'slice');
      const van = Math.max(1, indexGetal(i1, 'slice'));
      const tot = Math.min(a.length, indexGetal(i2 ?? a.length, 'slice'));
      return math.matrix(a.slice(van - 1, Math.max(van - 1, tot)) as number[]);
    },
    join: function (...items: unknown[]) {
      return math.matrix(plat(items) as number[]);
    },
    extract: function (v: unknown, idx: unknown) {
      const a = alsVector(v, 'extract');
      return math.matrix(plat([idx]).map((i) => {
        const k = indexGetal(i, 'extract');
        if (k < 1 || k > a.length) throw new Error('extract: index buiten de vector');
        return a[k - 1];
      }) as number[]);
    },
    reverse: function (v: unknown) { return math.matrix(alsVector(v, 'reverse').reverse() as number[]); },
    rsort: function (v: unknown) {
      return math.matrix([...alsVector(v, 'rsort')].sort((p, q) => asNumber(q) - asNumber(p)) as number[]);
    },
    order: function (v: unknown) {
      const a = alsVector(v, 'order');
      return math.matrix(a.map((_, i) => i).sort((p, q) => asNumber(a[p]) - asNumber(a[q])).map((i) => i + 1));
    },
    revorder: function (v: unknown) {
      const a = alsVector(v, 'revorder');
      return math.matrix(a.map((_, i) => i).sort((p, q) => asNumber(a[q]) - asNumber(a[p])).map((i) => i + 1));
    },
    // `search(v; x; i)`: de index van het eerste element vanaf plaats i dat
    // gelijk is aan x, 0 als het er niet is. `_cp_count(v; x; i)`: het aantal
    // (count met één parameter blijft de mathjs-functie).
    search: function (v: unknown, x: unknown, i: unknown) {
      const a = alsVector(v, 'search');
      const doel = asNumber(x);
      for (let k = Math.max(1, indexGetal(i ?? 1, 'search')); k <= a.length; k++) {
        if (asNumber(a[k - 1]) === doel) return k;
      }
      return 0;
    },
    _cp_count: function (v: unknown, x: unknown, i: unknown) {
      const a = alsVector(v, 'count');
      const doel = asNumber(x);
      let n = 0;
      for (let k = Math.max(1, indexGetal(i ?? 1, 'count')); k <= a.length; k++) {
        if (asNumber(a[k - 1]) === doel) n++;
      }
      return n;
    },
    lookup: function (a: unknown, b: unknown, x: unknown) {
      const ref = alsVector(a, 'lookup');
      const terug = alsVector(b, 'lookup');
      const doel = asNumber(x);
      return math.matrix(ref.flatMap((r, i) => (asNumber(r) === doel && i < terug.length ? [terug[i]] : [])) as number[]);
    },

    // Rekenen
    transp: function (M: unknown) { return math.transpose(M as number[][]); },
    inverse: function (M: unknown) { return math.inv(M as number[][]); },
    rank: function (M: unknown) {
      if (!afmetingen(M)) return nietNul(M) ? 1 : 0;
      return rangVan(alsRijen(M).map((r) => r.map((v) => (isUnit(v) ? (v.value ?? 0) : asNumber(v)))));
    },
    eigenvals: function (M: unknown, ne?: unknown) {
      return math.matrix(eigenKeuze(M, ne, 'eigenvals').waarden as number[]);
    },
    eigenvecs: function (M: unknown, ne?: unknown) {
      return math.matrix(eigenKeuze(M, ne, 'eigenvecs').vectoren);
    },
    eigen: function (M: unknown, ne?: unknown) {
      const { waarden, vectoren } = eigenKeuze(M, ne, 'eigen');
      return math.matrix(vectoren.map((v, i) => [waarden[i], ...v]) as number[][]);
    },
    hprod: function (A: unknown, B: unknown) { return math.dotMultiply(A as number[][], B as number[][]); },
    kprod: function (A: unknown, B: unknown) { return math.kron(A as number[][], B as number[][]); },
    fprod: function (A: unknown, B: unknown) { return somVan(plat([math.dotMultiply(A as number[][], B as number[][])])); },

    // Samenvattend: een lijst van getallen, vectoren en matrices door elkaar.
    _cp_sum: function (...args: unknown[]) { return somVan(plat(args)); },
    sumsq: function (...args: unknown[]) { return somVan(plat(args).map((v) => math.multiply(v as number, v as number))); },
    srss: function (...args: unknown[]) {
      return math.sqrt(somVan(plat(args).map((v) => math.multiply(v as number, v as number))) as number);
    },
    average: function (...args: unknown[]) {
      const lijst = plat(args);
      if (lijst.length === 0) throw new Error('average: geen waarden');
      return math.divide(somVan(lijst) as number, lijst.length);
    },
    product: function (...args: unknown[]) {
      const lijst = plat(args);
      return lijst.length === 0 ? 1 : lijst.reduce((p, v) => math.multiply(p as number, v as number));
    },
    // `line(x; a; b; c…)`: lineaire interpolatie in de lijst, x is de
    // (1-gebaseerde) plaats; `line(x; y; M)` dubbel lineair in een matrix.
    line: function (...args: unknown[]) {
      if (args.length === 3 && afmetingen(args[2])?.length === 2) {
        const r = alsRijen(args[2]);
        const x = asNumber(args[0]);
        const y = asNumber(args[1]);
        const tussen = (rij: unknown[], t: number): unknown => lineairIn(rij, t);
        const kol = r.map((rij) => tussen(rij, y));
        return lineairIn(kol, x);
      }
      return lineairIn(plat(args.slice(1)), asNumber(args[0]));
    },

    // Getallen
    ceiling: function (x: unknown) { return math.ceil(x as number); },
    trunc: function (x: unknown) { return math.fix(x as number); },
    root: function (x: unknown, n: unknown) {
      const k = asNumber(n);
      if (typeof x === 'number') return math.nthRoot(x, k);
      return math.pow(x as number, 1 / k);
    },
    // `switch(c1; w1; c2; w2; …; anders)`: de waarde bij de eerste voorwaarde
    // die waar is, anders de laatste.
    switch: function (...args: unknown[]) {
      for (let i = 0; i + 1 < args.length; i += 2) {
        if (Boolean(asNumber(args[i]))) return args[i + 1];
      }
      return args.length % 2 === 1 ? args[args.length - 1] : Number.NaN;
    },
  },
  { override: true },
);

/** Lineaire interpolatie in een lijst op plaats t (1 = het eerste element). */
function lineairIn(lijst: unknown[], t: number): unknown {
  if (lijst.length === 0) return Number.NaN;
  if (!Number.isFinite(t)) return Number.NaN;
  if (t <= 1) return lijst[0];
  if (t >= lijst.length) return lijst[lijst.length - 1];
  const i = Math.floor(t);
  const f = t - i;
  if (f === 0) return lijst[i - 1];
  return math.add(math.multiply(1 - f, lijst[i - 1] as number), math.multiply(f, lijst[i] as number));
}

/**
 * Namen uit de rekentaal die mathjs zelf ook kent maar anders bedoelt. Een aanroep
 * met dit aantal parameters gaat naar de `_cp_`-functie; de rest blijft mathjs.
 */
const REKENTAAL_NAMEN: Record<string, (aantal: number) => string | null> = {
  lsolve: () => '_cp_lsolve',
  matrix: (n) => (n === 2 ? '_cp_matrix' : null),
  sum: (n) => (n >= 2 ? '_cp_sum' : null),
  count: (n) => (n >= 2 ? '_cp_count' : null),
};

/**
 * Zet een mathjs-boom om naar de betekenis in de rekentaal voordat hij wordt berekend:
 *   • een literaal `[[a, b], [c, d]]` wordt `_cp_matrix_lit(_cp_rij(a, b), …)`
 *     en `[a, b]` wordt `_cp_vector_lit(a, b)`, zodat een vector als element
 *     wordt uitgevouwen en kortere rijen met nullen worden aangevuld;
 *   • de namen uit REKENTAAL_NAMEN gaan naar hun `_cp_`-functie.
 * De weergave van de formule (latex.ts) gebruikt de boom zonder deze stap.
 */
function vertaalRekentaal(boom: MathNode): MathNode {
  return boom.transform((nd: MathNode) => {
    if (math.isArrayNode(nd)) {
      const items = (nd as unknown as { items: MathNode[] }).items;
      if (items.length > 0 && items.every((it) => math.isArrayNode(it))) {
        return new math.FunctionNode('_cp_matrix_lit', items.map((rij) =>
          new math.FunctionNode('_cp_rij', (rij as unknown as { items: MathNode[] }).items.map(vertaalRekentaal)),
        ));
      }
      return new math.FunctionNode('_cp_vector_lit', items.map(vertaalRekentaal));
    }
    if (math.isFunctionNode(nd)) {
      const f = nd as unknown as { fn: MathNode; args: MathNode[] };
      if (math.isSymbolNode(f.fn)) {
        const naam = (f.fn as unknown as { name: string }).name;
        const nieuw = Object.prototype.hasOwnProperty.call(REKENTAAL_NAMEN, naam) ? REKENTAAL_NAMEN[naam](f.args.length) : null;
        if (nieuw) return new math.FunctionNode(nieuw, f.args.map(vertaalRekentaal));
      }
    }
    return nd;
  });
}

/** Vertaalde en gecompileerde expressies, per brontekst. */
const gecompileerd = new Map<string, { evaluate: (scope?: unknown) => unknown }>();
/** Ontlede expressies voor de weergave, per brontekst. */
const ontleed = new Map<string, MathNode>();
const CACHE_MAX = 20000;

/** De mathjs-boom van een expressie (zonder vertaalRekentaal), uit de cache. */
function ontleedExpr(expr: string): MathNode {
  let boom = ontleed.get(expr);
  if (!boom) {
    boom = math.parse(expr);
    if (ontleed.size >= CACHE_MAX) ontleed.clear();
    ontleed.set(expr, boom);
  }
  return boom;
}

/** Berekent een expressie met de betekenis in de rekentaal (zie vertaalRekentaal). */
function reken(expr: string, scope: Scope): unknown {
  // Bij het compileren legt mathjs vast of een naam een eenheid is. Met eigen
  // eenheden hangt dat van het blad af; die horen dus in de sleutel.
  const sleutel = eigenSleutel ? `${eigenSleutel} ${expr}` : expr;
  let c = gecompileerd.get(sleutel);
  if (!c) {
    c = vertaalRekentaal(ontleedExpr(expr)).compile();
    if (gecompileerd.size >= CACHE_MAX) gecompileerd.clear();
    gecompileerd.set(sleutel, c);
  }
  return c.evaluate(scope);
}

/** De eigen eenheden die nu bestaan, als deel van de cachesleutel van `reken`. */
let eigenSleutel = '';
const actieveEigen = new Set<string>();
function werkEigenSleutelBij(): void {
  eigenSleutel = [...actieveEigen].sort().join(',');
}

/**
 * Nieuwe basiseenheden (`.EUR = 1`), per proces één keer gemaakt. mathjs kan een
 * basisdimensie niet weghalen; een tweede `createUnit('EUR')` zou falen. Na het blad
 * gaat alleen de eenheid uit de tabel, en een volgend blad zet hem terug.
 */
const basisEenheden = new Map<string, unknown>();
const eenhedenTabel = math.Unit as unknown as { UNITS: Record<string, unknown>; deleteUnit(naam: string): void };

export interface Scope {
  [key: string]: unknown;
}

/**
 * Values supplied at runtime for interactive nodes:
 *   - @select blocks  → keyed by `name`, value is one of the option `value`s
 *   - `?` input prompts → keyed by `name`, value is a number+unit string
 */
export interface SelectValues {
  [key: string]: string;
}

/**
 * Evaluate a parsed document.
 *
 * `initialScope` seeds the scope before the first line runs. De desktop-app
 * gebruikt dat voor de projectgegevens: gevolgklasse, ontwerplevensduur en de
 * projectkop staan één keer op projectniveau en zijn in elk rekenblad
 * beschikbaar zonder dat ze in de bladtekst herhaald worden. Een blad mag de
 * naam gewoon overschrijven — de seed is een startwaarde, geen slot.
 */
export function evaluate(
  nodes: AstNode[],
  selectValues?: SelectValues,
  initialScope?: Scope,
  opties: EvalOpties = {},
): EvaluatedNode[] {
  const scope: Scope = { ...(initialScope ?? {}) };
  return metOpties(scope, opties, (stand) => evaluateNodes(nodes, scope, selectValues || {}, stand));
}

/**
 * Voert een doorrekening uit met de opties van de app en zet daarna alles terug:
 * `#deg`, `#rad`, `#gra` gelden alleen in dit blad, net als het stelsel en de eigen
 * eenheden (die van het blad en die van het project).
 */
function metOpties<T>(scope: Scope, opties: EvalOpties, doe: (stand: Stand) => T): T {
  const appModus = currentAngleMode;
  const vorigStelsel = huidigStelsel;
  const vorigeTaal = huidigeTaal;
  huidigStelsel = opties.stelsel;
  huidigeTaal = opties.taal?.toLowerCase().startsWith('en') ? 'en' : 'nl';
  const stand = nieuweStand();
  stand.opties = opties;
  try {
    // Een ongeldige of al bestaande naam slaat over; zo'n melding toont het projectpaneel
    // (zetProjectEenheden).
    for (const e of opties.eigenEenheden ?? []) {
      if (geldigeEenheidNaam(e.naam)) maakEenheid(e.naam, e.uitdrukking, scope, stand);
    }
    return doe(stand);
  } finally {
    currentAngleMode = appModus;
    huidigStelsel = vorigStelsel;
    huidigeTaal = vorigeTaal;
    ruimEenhedenOp(stand);
  }
}

/** Wat de app bij het doorrekenen meegeeft (docs/superpowers/specs/2026-11-06-eenheden-design.md). */
export interface EvalOpties {
  /** Het eenhedenstelsel voor de weergave; zonder: alles in de eenheden van het blad. */
  stelsel?: Stelsel;
  /** Eigen eenheden die in het hele blad gelden, zoals die van het project. */
  eigenEenheden?: { naam: string; uitdrukking: string }[];
  /**
   * De antwoorden van Open FEM Studio op `@toets`-blokken, op de hash van hun invoer
   * (toetsBlok.ts). Gegevens, geen functie: de opties gaan ook naar de rekenworker.
   */
  toetsingen?: Record<string, ToetsAntwoord>;
  /** `vragen`: een blok zonder antwoord geeft een verzoek mee (de werkruimte); anders "niet getoetst". */
  toetsModus?: 'vragen' | 'lezen';
  /**
   * De FEM Studio van nu: zijn versie en per tool de hash van het schema. Alleen in de
   * modus `vragen`: een antwoord van een andere versie of een ander schema krijgt dan
   * de melding en de knop "opnieuw toetsen".
   */
  fem?: { versie?: string; schemas?: Record<string, string> };
  /** De taal van de vaste woorden in de uitvoer, zoals `nl` of `en`. */
  taal?: string;
}

/** Het stelsel van het blad dat nu doorgerekend wordt (zie evaluate). */
let huidigStelsel: Stelsel | undefined;
/** De taal van de vaste woorden in een beeld (fem_svg), van het blad dat nu doorgerekend wordt. */
let huidigeTaal = 'nl';

/**
 * Rekent een document door en geeft ook de scope aan het eind terug: de waarden
 * met hun eenheid, voor wie er verder mee rekent (een codeblok, rekenblok.ts).
 */
export function evaluateMetScope(
  nodes: AstNode[],
  selectValues?: SelectValues,
  initialScope?: Scope,
  opties: EvalOpties = {},
): { nodes: EvaluatedNode[]; scope: Scope } {
  const scope: Scope = { ...(initialScope ?? {}) };
  return metOpties(scope, opties, (stand) => ({ nodes: evaluateNodes(nodes, scope, selectValues || {}, stand), scope }));
}

/** Rekent één uitdrukking uit met de betekenis van de rekentaal. Werpt bij een fout. */
export function rekenUitdrukking(expr: string, scope: Scope = {}): unknown {
  return reken(expr, scope);
}

/** Een waarde zoals een uitkomst op het blad: `4.5 m`, `12`. */
export function uitkomstTekst(value: unknown): string {
  return formatResult(value);
}

/** De mathjs-boom van een uitdrukking, zoals de rekenkern hem leest. */
export function uitdrukkingBoom(expr: string): MathNode {
  return ontleedExpr(expr);
}

/** Is dit een eenheid zonder waarde, zoals de rekenkern de naam leest? (eenheden.ts) */
export { isEenheidNaam };

/**
 * De stand van de afdrukopdrachten tijdens het doorrekenen. Een opdracht geldt
 * vanaf zijn regel tot het eind van het blad of tot een andere opdracht van
 * dezelfde soort, zoals in de rekentaal:
 *   weergave  `#equ` formule, invulling en uitkomst (standaard)
 *             `#val` alleen de uitkomst: `x = 5`
 *             `#noc` alleen de formule, zonder uitkomst: `x = a + b` (er wordt
 *                    wel gerekend; "no calculation" in de weergave)
 *   invullen  `#varsub` formule en invulling (standaard)
 *             `#nosub` zonder invulling: `x = a + b = 5`
 *             `#novar` alleen de invulling: `x = 2 + 3 = 5`
 *   decimalen `#round n`: uitkomsten (en de ingevulde en ingevoegde waarden)
 *             afgerond op n decimalen, zonder nullen achteraan; null = de
 *             opmaak van de app (vier significante cijfers). `#round default`
 *             zet hem terug.
 * Alleen de weergave verandert; er wordt altijd met de volle waarde gerekend.
 */
interface Stand {
  weergave: 'equ' | 'val' | 'noc';
  invullen: 'varsub' | 'nosub' | 'novar';
  decimalen: number | null;
  /** De eigen eenheden die dit blad maakte (`.naam = …`); na het blad gaan ze weg. */
  eenheden: string[];
  /** De opties van deze doorrekening, voor de blokken die ze nodig hebben (`@toets`). */
  opties: EvalOpties;
}

function nieuweStand(): Stand {
  return { weergave: 'equ', invullen: 'varsub', decimalen: null, eenheden: [], opties: {} };
}

/**
 * Maakt een eigen eenheid, zoals in het `.cpd`-formaat: `.EUR = 1` is een nieuwe
 * basiseenheid, `.kipf = 1000 lbf` volgt uit een andere. Geeft de foutmelding als
 * het niet kan; dan verandert er niets.
 */
function maakEenheid(naam: string, uitdrukking: string, scope: Scope, stand: Stand): string | null {
  if (naam in scope || isEenheidNaam(naam)) return `Error: ${naam} already exists as a unit or variable`;
  let waarde: unknown;
  try {
    waarde = reken(uitdrukking, scope);
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
  try {
    if (isUnit(waarde)) {
      math.createUnit(naam, waarde.toString());
    } else if (waarde === 1) {
      const basis = basisEenheden.get(naam);
      if (basis) {
        eenhedenTabel.UNITS[naam] = basis;
        // Leegt het geheugen van mathjs voor het opzoeken van eenheden.
        eenhedenTabel.deleteUnit(' ');
      } else {
        math.createUnit(naam);
        basisEenheden.set(naam, eenhedenTabel.UNITS[naam]);
      }
    } else {
      return 'Error: a custom unit is 1 (a new base unit) or follows from another unit, as in .kipf = 1000 lbf';
    }
  } catch (err) {
    return `Error: ${(err as Error).message}`;
  }
  stand.eenheden.push(naam);
  actieveEigen.add(naam);
  werkEigenSleutelBij();
  return null;
}

/**
 * De eigen eenheden van het project, blijvend op deze kant (de app). Zo kennen alle
 * routes ze: de uitwerking, de beelden, de IFCX-export, MCP en het terugrekenen van een
 * invoerveld. Elke aanroep vervangt de vorige set. Een regel zonder naam of uitdrukking
 * slaat over; een ongeldige geeft een melding per plek in de lijst.
 */
const projectStand: Stand = nieuweStand();
let projectFouten: ReadonlyMap<number, string> = new Map();

export function zetProjectEenheden(lijst: readonly { naam: string; uitdrukking: string }[]): ReadonlyMap<number, string> {
  ruimEenhedenOp(projectStand);
  const fouten = new Map<number, string>();
  lijst.forEach((e, i) => {
    const naam = e.naam.trim();
    const uitdrukking = e.uitdrukking.trim();
    if (!naam || !uitdrukking) return;
    if (!geldigeEenheidNaam(naam)) {
      fouten.set(i, `Error: ${naam} cannot be a unit name: use two or more letters and no existing unit`);
      return;
    }
    const fout = maakEenheid(naam, uitdrukking, {}, projectStand);
    if (fout) fouten.set(i, fout);
  });
  projectFouten = fouten;
  return fouten;
}

/** De meldingen van de laatste zetProjectEenheden, per plek in de lijst. */
export function projectEenheidFouten(): ReadonlyMap<number, string> {
  return projectFouten;
}

/** Haalt de eigen eenheden van een blad weer weg, de laatste eerst. */
function ruimEenhedenOp(stand: Stand): void {
  // `deleteUnit` bestaat in mathjs 13, maar staat niet in de typen.
  for (const naam of stand.eenheden.reverse()) {
    eenhedenTabel.deleteUnit(naam);
    actieveEigen.delete(naam);
  }
  stand.eenheden = [];
  werkEigenSleutelBij();
}

/** Voert een opdracht uit (zie OpdrachtNode en Stand). */
function voerOpdrachtUit(node: OpdrachtNode, stand: Stand): void {
  switch (node.opdracht) {
    case 'deg':
    case 'rad':
    case 'gra':
      currentAngleMode = node.opdracht;
      break;
    case 'equ':
    case 'val':
    case 'noc':
      stand.weergave = node.opdracht;
      break;
    case 'varsub':
    case 'nosub':
    case 'novar':
      stand.invullen = node.opdracht;
      break;
    case 'round':
      stand.decimalen = node.decimalen ?? null;
      break;
  }
}

/**
 * Evaluate a sheet ONLY to extract its final scope (variables that ended
 * up bound after running). Used by hosts that need to inherit globals
 * from a parent sheet without rendering its output. Errors are silently
 * ignored — partial scope is still returned.
 */
export function extractScope(nodes: AstNode[], selectValues?: SelectValues, initialScope?: Scope, opties: EvalOpties = {}): Scope {
  const scope: Scope = { ...(initialScope ?? {}) };
  try {
    metOpties(scope, opties, (stand) => evaluateNodes(nodes, scope, selectValues || {}, stand));
  } catch {
    /* swallow — best-effort scope extraction */
  }
  // Strip internal flags.
  delete scope[BREAK_FLAG];
  delete scope[CONTINUE_FLAG];
  delete scope['_i'];
  return scope;
}

/** Sentinel key on `scope` used by `#break` to short-circuit out of a loop. */
const BREAK_FLAG = '__break__';
/** Vlag voor `#continue`: de rest van de lopende ronde overslaan. */
const CONTINUE_FLAG = '__continue__';
/** Bovengrens van een lus met een aantal (`#repeat n`, `#for`). */
const MAX_RONDES = 10000;
/** Bovengrens van een lus zonder aantal (`#while`, `#repeat` zonder n), tegen een oneindige lus. */
const MAX_RONDES_OPEN = 100000;

function evaluateNodes(nodes: AstNode[], scope: Scope, selectValues: SelectValues, stand: Stand): EvaluatedNode[] {
  const result: EvaluatedNode[] = [];

  for (const node of nodes) {
    // `#break` raised by a deeper node — stop evaluating siblings. The
    // enclosing `repeat` case picks up the flag and exits the loop. Zo ook
    // `#continue`, waarna de lus aan de volgende ronde begint.
    if (scope[BREAK_FLAG] || scope[CONTINUE_FLAG]) break;
    // Wat deze knoop oplevert, krijgt na de switch zijn `scherm` mee (#pre).
    const begin = result.length;
    switch (node.type) {
      case 'opdracht':
        voerOpdrachtUit(node, stand);
        break;

      case 'heading':
        if (node.hidden) break;
        result.push({ type: 'heading', level: node.level, text: node.text });
        break;

      case 'text':
        if (node.hidden) break;
        if (node.parts && node.parts.length > 0) {
          // Resolve prose interpolation — eval each `expr` part and
          // concat with literal parts. Failed exprs fall back to the source.
          const out: string[] = [];
          for (const p of node.parts) {
            if (p.kind === 'literal') {
              out.push(p.value);
            } else {
              try {
                const v = reken(p.value, scope);
                out.push(stringifyInterpolated(v, p.formaat, stand.decimalen));
              } catch {
                out.push(p.value);
              }
            }
          }
          result.push({ type: 'text', text: out.join(''), html: true, ...(node.inline ? { inline: true } : {}) });
        } else {
          // De normbladen schrijven een uitkomst als {{naam}} in een tekstregel,
          // zoals in een tekening. Zonder invulling stond er letterlijk
          // "UC = {{UC_druk}}" op het blad.
          const text = node.text.includes('{{') ? interpolateBraces(node.text, scope) : node.text;
          result.push({ type: 'text', text, html: node.html, ...(node.inline ? { inline: true } : {}) });
        }
        break;

      case 'assignment': {
        // Always evaluate so subsequent formulas see the binding — but only emit
        // the rendered node when not hidden.
        const evaluated = evaluateAssignment(node.name, node.expression, scope, !node.hidden, node.index, stand, node.formaat);
        if (!node.hidden) result.push(evaluated);
        break;
      }

      case 'input-prompt': {
        // `?` prompt — pick the user-supplied value or fall back to the default.
        // Het veld toont wat er is ingetypt; gerekend wordt met een punt. Een
        // komma is hier altijd een decimaalteken: "0,42" is 0,42.
        //
        // Zonder invoer van de gebruiker staat de standaardwaarde in het veld
        // (`L = ?{5000}mm`, anders 0) en wordt daarmee gerekend.
        const standaard = node.defaultValue;
        const invoer = String(selectValues[node.name] ?? standaard);
        // Een leeg veld telt als de standaardwaarde in de eenheid van het veld:
        // 0 bij een veld zonder `{…}`, net als een nieuw '?'-veld. Zonder deze
        // stap werd "" met eenheid " kN": een eenheid zonder getal, die als
        // 1 kN rekende of verderop NaN en "unit with undefined value" gaf;
        // zonder eenheid bleef de naam ongedefinieerd. Het veld zelf blijft
        // leeg (currentValue) en toont de standaardwaarde als placeholder.
        // Een waarde uit een ander blad (`#1.R_paal`, verwijzing.ts): de app zet die
        // vooraf in de scope. In een veld met eenheid wordt hij daarnaar omgerekend;
        // past de eenheid niet of is het blad of de naam onbekend, dan rekent het
        // veld met zijn standaardwaarde en staat er een fout onder.
        const ref = leesVerwijzing(invoer);
        let refFout: string | null = null;
        if (ref) {
          const gevonden = scope[verwijzingNaam(ref.ref, ref.naam)];
          if (gevonden === undefined) {
            refFout = `#${ref.ref}.${ref.naam} niet gevonden: geen blad #${ref.ref} of geen waarde ${ref.naam} daarin`;
          } else if (node.unit && math.isUnit(gevonden)) {
            try {
              scope[node.name] = (gevonden as { to: (eenheid: string) => unknown }).to(node.unit);
            } catch {
              refFout = `#${ref.ref}.${ref.naam} (${math.format(gevonden, { precision: 4 })}) past niet bij de eenheid ${node.unit} van dit veld`;
            }
          } else {
            scope[node.name] = gevonden;
          }
        }
        const raw = ref ? standaard.trim().replace(',', '.') || '0' : invoer.trim().replace(',', '.') || standaard.trim().replace(',', '.') || '0';
        if (!ref || refFout) try {
          // Wat geen getal oplevert (alleen een eenheid of een teken, zoals
          // "kN" of "-"), gaat naar de afhandeling van een halve invoer. Dat
          // geldt voor de invoer zelf, zonder de eenheid erachter: een eenheid
          // kan zelf een getal bevatten. In een veld met eenheid 1/K werd "-"
          // de grootheid `- 1/K`, dus -1 K⁻¹, en "K" werd `K 1/K`, het getal 1.
          const los = math.evaluate(raw, {});
          const waarde = node.unit && !zonderGetal(los) ? getalMetEenheid(raw, node.unit) : los;
          if (zonderGetal(waarde)) throw new Error('invoer zonder getal');
          scope[node.name] = waarde;
        } catch {
          // Een halve invoer (tijdens het typen "0." of "") telt als getal, en
          // houdt zijn eenheid: zonder eenheid liep elke regel die er verderop
          // mee rekende vast op "Units do not match".
          const getal = parseFloat(raw);
          const n = Number.isFinite(getal) ? getal : 0;
          try {
            scope[node.name] = node.unit ? getalMetEenheid(String(n), node.unit) : n;
          } catch {
            scope[node.name] = n;
          }
        }
        if (!node.hidden) {
          // In het eenhedenstelsel toont het veld zijn waarde in de eenheid van het
          // stelsel; opgeslagen blijft hij in de eenheid van de bladtekst.
          // Een veld in een eigen eenheid rekent niet om: het scherm kent die eenheid
          // niet altijd, en zou wat je typt dan niet terug kunnen rekenen.
          const eigen = (node.unit.match(/[\p{L}_][\p{L}\p{N}_]*/gu) ?? []).some((n) => actieveEigen.has(n));
          let toon: string | null = null;
          let currentValue = invoer;
          let standaardInBeeld = standaard;
          try {
            toon = huidigStelsel && node.unit && !eigen ? doelInStelsel(node.unit, huidigStelsel) : null;
            if (toon) {
              // Een eenheid in het stelsel die niet bij het veld past (met de hand
              // bewerkt project): dan zoals in het blad.
              math.unit(1, node.unit).toNumber(toon);
              currentValue = toonInvoer(invoer, node.unit, toon);
              if (standaard !== undefined) standaardInBeeld = toonInvoer(standaard, node.unit, toon);
            }
          } catch {
            toon = null;
            currentValue = invoer;
            standaardInBeeld = standaard;
          }
          result.push({
            type: 'input-prompt',
            name: node.name,
            label: node.label,
            unit: node.unit,
            currentValue,
            standaard: standaardInBeeld,
            ...(toon ? { toonEenheid: toon } : {}),
          });
        }
        if (refFout) result.push({ type: 'text', text: `Error evaluating ${refFout}` });
        break;
      }

      case 'user-function': {
        // mathjs supports the `f(x) = expr` form natively via its parser, maar
        // wel in zíjn eigen notatie. Daarom de genormaliseerde body gebruiken
        // en niet de rauwe regel: die staat er nog in rekentaal-notatie, met
        // puntkomma's in `if(a; b; c)` en tekens als ≤ en ≡. mathjs slikte dat
        // niet, de definitie mislukte, en omdat de fout bij een verborgen regel
        // wordt ingeslikt bleef de aanroep verderop stilzwijgend als tekst in
        // de uitdraai staan.
        try {
          reken(`${node.name}(${node.params.join(', ')}) = ${node.expression}`, scope);
        } catch (err) {
          // Surface error as a hidden text — function won't be callable later.
          if (!node.hidden) {
            result.push({
              type: 'text',
              text: `Error defining function ${node.name}: ${(err as Error).message}`,
            });
          }
        }
        if (!node.hidden) {
          result.push({
            type: 'user-function',
            name: node.name,
            params: node.params,
            expression: node.expression,
          });
        }
        break;
      }

      case 'var-display': {
        let value = scope[node.name];
        if (value === undefined) {
          if (!node.hidden) {
            result.push({ type: 'text', text: `(${node.name} is niet gedefinieerd)` });
          }
          break;
        }
        if (node.hidden) break;
        // `M|kN*m` op een eigen regel: de waarde omgerekend (zie doeleenheid).
        if (node.omrekening) {
          try {
            const doel = doeleenheid(node.omrekening);
            value = reken(doel ? `${node.name} to (${doel})` : `${node.name} to ${node.omrekening}`, scope);
          } catch (err) {
            result.push({ type: 'text', text: `${node.name} | ${node.omrekening}: ${(err as Error).message}` });
            break;
          }
        }
        result.push({ type: 'var-display', name: node.name, ...uitkomstVelden(value, opmaakVan(stand, node.formaat)) });
        break;
      }

      case 'break': {
        // Set the break flag — the enclosing repeat case consumes it.
        // `#continue` zet een eigen vlag: alleen de rest van deze ronde valt weg.
        scope[node.doorgaan ? CONTINUE_FLAG : BREAK_FLAG] = true;
        break;
      }

      case 'repeat': {
        // `#repeat n`, `#for` (count) en `#while` (conditie). Zonder aantal en
        // zonder voorwaarde herhaalt de lus tot een #break, tot de bovengrens.
        let count = 0;
        if (node.conditie !== undefined || node.count.trim() === '') {
          count = MAX_RONDES_OPEN;
        } else {
          try {
            const v = reken(node.count, scope);
            count = Math.trunc(asNumber(v));
          } catch {
            count = parseInt(node.count, 10) || 0;
          }
          if (!Number.isFinite(count)) count = 0;
          if (count < 0 || count > MAX_RONDES) {
            count = Math.min(Math.max(count, 0), MAX_RONDES);
          }
        }
        for (let iter = 1; iter <= count; iter++) {
          if (node.conditie !== undefined) {
            let door = false;
            try {
              door = Boolean(asNumber(reken(node.conditie, scope)));
            } catch {
              if (!node.hidden) result.push({ type: 'text', text: `Error evaluating condition: ${node.conditie}` });
            }
            if (!door) break;
          }
          scope['_i'] = iter;
          const children = evaluateNodes(node.body, scope, selectValues, stand);
          if (!node.hidden) result.push(...children);
          delete scope[CONTINUE_FLAG];
          if (scope[BREAK_FLAG]) {
            // Iteration stopped — consume the flag so outer loops aren't
            // also broken out of.
            delete scope[BREAK_FLAG];
            break;
          }
        }
        break;
      }

      case 'plot': {
        if (node.hidden) break;
        try {
          const svg = renderPlotSvg(node, scope);
          result.push({ type: 'plot', svg });
        } catch (err) {
          result.push({
            type: 'text',
            text: `Plot fout: ${(err as Error).message}`,
          });
        }
        break;
      }

      case 'conditional': {
        const condResult = evaluateConditional(node, scope, selectValues, stand);
        if (condResult && !node.hidden) result.push(condResult);
        break;
      }

      case 'svg': {
        if (node.hidden) break;
        const interpolated = interpolateBraces(node.content, scope);
        result.push({ type: 'svg', content: interpolated });
        break;
      }

      case '3d': {
        if (node.hidden) break;
        // In `{{…}}` mag een lengte ook als getal in de eenheid van de scène
        // meedoen (`{{H + 800}}` in een scène in mm): de scène vraagt eerst met
        // de lengtes als getal en anders met de eenheden zoals ze zijn
        // (drieD.ts, rekenGetal). De teller van een #for in het blok staat even
        // in de scope en daarna weer zoals hij was; het blok verandert verder
        // niets aan het blad.
        const eenheid = node.instellingen.eenheid ?? 'mm';
        const lengtesAlsGetal = new Proxy(scope, {
          get(doel, naam) {
            const v = Reflect.get(doel, naam);
            return typeof naam === 'string' && isUnit(v) && isLengte(v) ? v.toNumber(eenheid) : v;
          },
        });
        result.push(bouwDrieDScene(node, {
          reken: (expr, alsGetal) => reken(expr, alsGetal ? lengtesAlsGetal : scope),
          zet: (naam, waarde) => {
            const had = Object.prototype.hasOwnProperty.call(scope, naam);
            const oud = scope[naam];
            scope[naam] = waarde;
            return () => {
              if (had) scope[naam] = oud;
              else delete scope[naam];
            };
          },
          alsTekst: (waarde) => stringifyInterpolated(waarde, undefined, stand.decimalen),
        }));
        break;
      }

      case 'iframe':
        if (node.hidden) break;
        result.push(bouwIframe(node, {
          reken: (expr) => reken(expr, scope),
          alsTekst: (waarde) => stringifyInterpolated(waarde, undefined, stand.decimalen),
        }));
        break;

      case 'js':
        if (node.hidden) break;
        result.push(bouwJsBlok(node, {
          reken: (expr) => reken(expr, scope),
          alsTekst: (waarde) => stringifyInterpolated(waarde, undefined, stand.decimalen),
          scope,
        }));
        break;

      case 'toets': {
        // Ook verborgen rekent het blok: zijn variabelen gelden voor wat eronder staat,
        // en een verzoek moet naar FEM Studio, ook als het blok niet op het blad staat.
        result.push(bouwToets(node, { reken: (expr) => reken(expr, scope), scope, opties: stand.opties }));
        break;
      }

      case 'fem': {
        // Net als @toets: ook verborgen rekent het blok. De teller van een #for en de
        // gevallen in een combinatie staan even in de scope en daarna weer zoals ze waren.
        result.push(bouwFem(node, {
          reken: (expr) => reken(expr, scope),
          zet: (naam, waarde) => {
            const had = Object.prototype.hasOwnProperty.call(scope, naam);
            const oud = scope[naam];
            scope[naam] = waarde;
            return () => {
              if (had) scope[naam] = oud;
              else delete scope[naam];
            };
          },
          scope,
          opties: stand.opties,
        }));
        break;
      }

      case 'kern': {
        // Net als @toets en @fem: ook verborgen rekent het blok, en de teller van `per`
        // of een #for staat even in de scope en daarna weer zoals hij was.
        result.push(bouwKern(node, {
          reken: (expr) => reken(expr, scope),
          zet: (naam, waarde) => {
            const had = Object.prototype.hasOwnProperty.call(scope, naam);
            const oud = scope[naam];
            scope[naam] = waarde;
            return () => {
              if (had) scope[naam] = oud;
              else delete scope[naam];
            };
          },
          scope,
          opties: stand.opties,
        }));
        break;
      }

      case 'ifcx':
        if (node.hidden) break;
        result.push(bouwIfcxBlok(node, { reken: (expr) => reken(expr, scope), scope }));
        break;

      case 'image':
        if (node.hidden) break;
        result.push({ type: 'image', src: node.src });
        break;

      case 'eenheid-def': {
        const fout = maakEenheid(node.name, node.expression, scope, stand);
        if (!node.hidden) result.push({ type: 'eenheid-def', name: node.name, expression: node.expression, result: fout ?? node.expression });
        break;
      }

      case 'gef-upload':
        if (node.hidden) break;
        result.push({ type: 'gef-upload', name: node.name, data: null });
        break;

      case 'select': {
        const selectedValue = selectValues[node.name] ?? node.options[0]?.value ?? '0';
        // Always bind to scope; only emit when not hidden.
        try {
          scope[node.name] = math.evaluate(selectedValue, {});
        } catch {
          scope[node.name] = parseFloat(selectedValue) || 0;
        }
        if (!node.hidden) {
          result.push({
            type: 'select',
            name: node.name,
            label: node.label,
            options: node.options,
            selectedValue,
          });
        }
        break;
      }
    }
    // `#pre`: wat deze knoop opleverde, staat alleen op het scherm.
    if ('scherm' in node && node.scherm) {
      for (let k = begin; k < result.length; k++) (result[k] as { scherm?: boolean }).scherm = true;
    }
  }

  return result;
}

/** Geen getal: niets, of een eenheid zonder waarde (`kN`). */
function zonderGetal(waarde: unknown): boolean {
  return waarde === undefined || waarde === null || (isUnit(waarde) && waarde.value === null);
}

/**
 * Getal uit een invoerveld met de eenheid van dat veld. `20 K` en `5 kN/m`
 * leest mathjs zo, maar een eenheid met alleen een noemer niet: `1.2e-5 1/K`
 * zijn twee getallen achter elkaar. Het veld verloor dan stil zijn eenheid,
 * waarna α·ΔT de eenheid K kreeg in plaats van dimensieloos te zijn. Daarom
 * dan een vermenigvuldiging met de eenheid tussen haakjes. Eerst de gewone
 * vorm, zodat een eenheid die alleen zo leesbaar is (`%`) blijft werken.
 */
function getalMetEenheid(getal: string, eenheid: string): unknown {
  try {
    return math.evaluate(`${getal} ${eenheid}`, {});
  } catch (err) {
    try {
      return math.evaluate(`${getal} * (${eenheid})`, {});
    } catch {
      throw err;
    }
  }
}

// Separate "expr to unit" into expression and target unit. Een omrekening met
// `in` of `|` heeft de parser al naar `to` gezet (zetInOmNaarTo in
// parser.ts); een andere `in` is de inch (`L = 5 in + 2 mm`) en wordt hier niet
// meer als omrekening gesplitst.
const TO_UNIT_RE = /^(.+?)\s+to\s+(.+)$/;

/**
 * Doeleenheid van een omrekening, in een vorm die mathjs als doeleenheid
 * aanneemt; null als er niets te herschrijven is. `1/degC` leest mathjs als de
 * grootheid 1 degC⁻¹, mét waarde, en die weigert hij als doeleenheid. Elke
 * deling met 1 als teller wordt daarom een macht -1 van de noemer, in de boom
 * zoals mathjs hem zelf leest: `1/degC` → `degC ^ -1`, `1/(m s)` →
 * `(m s) ^ -1`, en `1/m/s` → `m ^ -1 / s`, dus 1/(m·s). Een herschrijving van
 * de tekst (`(m/s)^-1`) maakte van dat laatste s/m. De eenheid blijft precies
 * wat er staat, alleen zonder waarde; `1/m*s` blijft dus s/m, als in een formule.
 */
function doeleenheid(eenheid: string): string | null {
  let boom: MathNode;
  try {
    boom = math.parse(eenheid);
  } catch {
    return null;
  }
  let herschreven = false;
  const nieuw = boom.transform((nd: MathNode) => {
    if (!math.isOperatorNode(nd) || nd.fn !== 'divide' || nd.args.length !== 2) return nd;
    const [teller, noemer] = nd.args;
    if (!math.isConstantNode(teller) || teller.value !== 1) return nd;
    herschreven = true;
    return new math.OperatorNode('^', 'pow', [noemer, new math.ConstantNode(-1)]);
  });
  return herschreven ? nieuw.toString() : null;
}

function evaluateAssignment(
  name: string,
  expression: string,
  scope: Scope,
  toon = true,
  index?: string,
  stand: Stand = nieuweStand(),
  formaat?: string,
): EvaluatedNode {
  try {
    // Parse "to unit" for display purposes
    let displayExpr = expression;
    let rekenExpr = expression;
    const toMatch = expression.match(TO_UNIT_RE);
    if (toMatch) {
      displayExpr = toMatch[1].trim();
      // `α to 1/degC`: zie doeleenheid.
      const doel = doeleenheid(toMatch[2].trim());
      if (doel) rekenExpr = `${displayExpr} to (${doel})`;
    }

    // Evaluate the full expression (including "to unit" if present)
    const value = reken(rekenExpr, scope);
    const weergaveNaam = index === undefined ? name : kenElementToe(name, index, value, scope);
    if (index === undefined) scope[name] = value;

    // Een verborgen regel wordt niet getoond: de ingevulde formule en de
    // opgemaakte uitkomst zijn dan overbodig werk.
    if (!toon) {
      return { type: 'assignment', name: weergaveNaam, expression: displayExpr, substitution: '', result: '', unit: '' };
    }

    // Wat de regel toont (zie Stand). Een $Root-, $Sum-blok enz. toont geen
    // invulling: het blok staat er als formule, met de uitkomst.
    const weergave: 'val' | 'noc' | 'nosub' | 'novar' | undefined =
      stand.weergave !== 'equ' ? stand.weergave
        : stand.invullen === 'nosub' || displayExpr.includes('_cp_los(') ? 'nosub'
          : stand.invullen === 'novar' ? 'novar' : undefined;

    // Build substitution: replace variable names with their values
    const substitution = weergave === 'val' || weergave === 'noc'
      ? ''
      : buildSubstitution(displayExpr, scope, name, displayExpr === expression ? ontleedExpr(rekenExpr) : undefined, stand.decimalen);

    return {
      type: 'assignment',
      name: weergaveNaam,
      expression: displayExpr,
      substitution,
      ...uitkomstVelden(value, opmaakVan(stand, formaat)),
      ...(weergave ? { weergave } : {}),
    };
  } catch (err) {
    // Bind to NaN so downstream references don't cascade into "Undefined
    // symbol" — they'll get NaN and either short-circuit or propagate.
    // Een mislukte toekenning aan een element laat de matrix zelf staan.
    if (index === undefined) scope[name] = Number.NaN;
    return {
      type: 'assignment',
      name: index === undefined ? name : `${name}.(${index.replace(/,/g, ';')})`,
      expression,
      substitution: '',
      // "Undefined symbol ref__1__R_paal" leest als "Undefined symbol #1.R_paal".
      result: `Error: ${verwijzingenInMelding((err as Error).message)}`,
      unit: '',
    };
  }
}

/**
 * Kent `waarde` toe aan één element van de vector of matrix `naam`
 * (`v.(i) = …`, `A.(i; j) = …`), 1-gebaseerd zoals in de rekentaal. De matrix
 * wordt eerst gekopieerd: een eerdere `B = A` deelt anders hetzelfde object
 * en zou mee veranderen. Een index buiten de afmetingen is een fout, zoals in
 * de rekentaal ("Index out of range"); de matrix groeit niet stil mee.
 * Geeft de naam voor de weergave, met de berekende index: `v.(3)`.
 */
function kenElementToe(naam: string, index: string, waarde: unknown, scope: Scope): string {
  const doel = scope[naam];
  if (doel === undefined) {
    throw new Error(`${naam} is niet gedefinieerd; maak eerst de vector of matrix, bijvoorbeeld ${naam} = vector(n) of ${naam} = matrix(m; n)`);
  }
  const d = afmetingen(doel);
  if (!d) throw new Error(`${naam} is geen vector of matrix`);
  if (afmetingen(waarde)) throw new Error(`${naam}: een element krijgt één waarde, geen vector of matrix`);
  const idx = plat([reken(`[${index}]`, scope)]).map((i) => indexGetal(i, naam));
  if (idx.length !== d.length) {
    throw new Error(d.length === 1
      ? `${naam} is een vector: één index, ${naam}.(i)`
      : `${naam} is een matrix: twee indices, ${naam}.(i; j)`);
  }
  idx.forEach((k, as) => {
    if (k < 1 || k > d[as]) {
      throw new Error(`Index buiten bereik: ${naam}.(${idx.join('; ')}) bij afmetingen ${d.join(' × ')}`);
    }
  });
  const kopie = (math.isMatrix(doel) ? (doel as unknown as { clone: () => unknown }).clone() : math.matrix(doel as number[])) as {
    set: (i: number[], v: unknown) => void;
  };
  kopie.set(idx.map((k) => k - 1), waarde);
  scope[naam] = kopie;
  return `${naam}.(${idx.join('; ')})`;
}

function buildSubstitution(
  expression: string,
  scope: Scope,
  currentVar: string,
  parsedExpression?: MathNode,
  decimalen: number | null = null,
): string {
  // Bij een gewone toewijzing is dit dezelfde boom die zojuist is berekend.
  // Alleen een eenheidsconversie toont een ander deel van de expressie.
  const parsed = parsedExpression ?? math.parse(expression);
  const variables = new Set<string>();
  parsed.traverse((node: MathNode) => {
    if (node.type === 'SymbolNode' && 'name' in node) {
      const nodeName = (node as unknown as { name: string }).name;
      if (nodeName !== currentVar && nodeName in scope) {
        variables.add(nodeName);
      }
    }
  });

  if (variables.size === 0) {
    return '';
  }

  let sub = expression;
  for (const varName of variables) {
    const val = scope[varName];
    // Alleen getallen, grootheden met eenheid en teksten invullen. Een
    // gebruikersfunctie staat ook in de scope, maar dan kwam de broncode van de
    // mathjs-functie in de uitdraai; een matrix werd een lege plek, zodat er
    // `hlookup(, 2, 1, 2)` stond. Die houden hun naam.
    const invulbaar =
      typeof val === 'number' || typeof val === 'string' || typeof val === 'boolean' || isUnit(val);
    if (!invulbaar) continue;
    // In het eenhedenstelsel, net als de uitkomst: geen regel met gemengde eenheden.
    const toon = inHetStelsel(val) ?? val;
    const formatted = formatInline(toon, decimalen);
    // Wrap in parentheses if value has a unit (contains space) to preserve
    // operator precedence: h^2 → (500 mm)^2, not 500 mm^2
    const wrapped = isUnit(toon) ? `(${formatted})` : formatted;
    // Grenzen op letters en cijfers in Unicode-zin. `\b` kent alleen ASCII,
    // waardoor een naam die met een Griekse letter begint (γ_M, σ_m,d, ψ_0)
    // nooit werd ingevuld: de ingevulde formule toonde dan nog het symbool.
    const naam = varName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const patroon = new RegExp(`(?<![\\p{L}\\p{N}_])${naam}(?![\\p{L}\\p{N}_])`, 'gu');
    // Niet binnen een tekenreeks: in `concat("n = "; string(n))` is de eerste
    // n tekst. En met een functie als vervanging, zodat een `$` in een
    // ingevulde tekst geen vervangpatroon wordt.
    sub = sub
      .split('"')
      .map((stuk, i) => (i % 2 === 1 ? stuk : stuk.replace(patroon, () => wrapped)))
      .join('"');
  }
  return sub;
}

// ─── Unit simplification ────────────────────────────────────────────

interface UnitComponent {
  unit: { name: string };
  prefix: { name: string };
  power: number;
}

interface MathUnit {
  toNumber: (unit: string) => number;
  to: (unit: string) => MathUnit;
  formatUnits: () => string;
  units: UnitComponent[];
  value: number;
}

let meter: { equalBase(u: unknown): boolean } | null = null;
/** Een waarde met een lengte als eenheid (mm, m, …), voor `{{…}}` in een `@3d`-blok. */
function isLengte(v: MathUnit): boolean {
  meter ??= math.unit('m') as unknown as { equalBase(u: unknown): boolean };
  return v.value !== null && v.value !== undefined && meter.equalBase(v);
}

/** Check if a value is a mathjs Unit */
function isUnit(value: unknown): value is MathUnit {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as Record<string, unknown>).toNumber === 'function' &&
    typeof (value as Record<string, unknown>).formatUnits === 'function'
  );
}

/**
 * Eenheidsdelen samengevoegd per eenheid, ongeacht het voorvoegsel, zonder
 * machten nul. kN boven en N of MN onder de streep vallen zo tegen elkaar weg,
 * net als mm boven en m onder; de omrekenfactor komt in het getal, want
 * `getNumericValue` rekent om naar de eenheid die hier overblijft. Wat
 * overblijft krijgt het voorvoegsel met het grootste aandeel, boven en onder
 * de streep samen: mm^2 / m wordt mm, niet m. Een last b·h·25 kN/m³ met b en
 * h in mm, maal L² in m, is mm²·m²/m³: daar wint m (5 tegen 2) en komt het
 * moment in kN·m, niet als 16730 mm·kN.
 */
function unitGroups(value: MathUnit): { name: string; power: number }[] {
  const perEenheid = new Map<string, { power: number; perPrefix: Map<string, number> }>();

  for (const u of value.units) {
    let g = perEenheid.get(u.unit.name);
    if (g === undefined) {
      g = { power: 0, perPrefix: new Map() };
      perEenheid.set(u.unit.name, g);
    }
    g.power += u.power;
    g.perPrefix.set(u.prefix.name, (g.perPrefix.get(u.prefix.name) ?? 0) + Math.abs(u.power));
  }

  const uit: { name: string; power: number }[] = [];
  for (const [naam, g] of perEenheid) {
    if (g.power === 0) continue;
    let prefix = '';
    let grootste = 0;
    for (const [p, aandeel] of g.perPrefix) {
      if (aandeel > grootste) {
        prefix = p;
        grootste = aandeel;
      }
    }
    uit.push({ name: prefix + naam, power: g.power });
  }
  return uit;
}

/**
 * Simplify unit string by combining like units.
 * mm mm → mm^2, kN / (mm mm) → kN / mm^2
 */
function simplifyUnitString(value: MathUnit): string {
  const entries = unitGroups(value);
  // Lengte achteraan in een product: kN m, niet m kN, en kip ft, niet ft kip.
  // De volgorde volgt anders die van de delen in de berekening.
  const isLengte = (naam: string) => /^[a-zµ]?m$/.test(naam) || /^(in|inch|ft|yd|mi)$/.test(naam);
  const pos = entries
    .filter(g => g.power > 0)
    .sort((a, b) => Number(isLengte(a.name)) - Number(isLengte(b.name)));
  const neg = entries.filter(g => g.power < 0);

  let result = pos
    .map(g => (g.power === 1 ? g.name : `${g.name}^${g.power}`))
    .join(' ');

  if (neg.length > 0) {
    const negStr = neg
      .map(g => {
        const absPow = Math.abs(g.power);
        return absPow === 1 ? g.name : `${g.name}^${absPow}`;
      })
      .join(' ');

    if (pos.length === 0) {
      // Pure inverse: 1 / mm^2
      result = `1 / ${neg.length > 1 ? `(${negStr})` : negStr}`;
    } else {
      result += ` / ${neg.length > 1 ? `(${negStr})` : negStr}`;
    }
  }

  return result;
}

/**
 * Dezelfde eenheid als `simplifyUnitString`, maar in een vorm die mathjs weer
 * leest: als doeleenheid van een omrekening en achter een getal in de
 * ingevulde formule. Alleen een eenheid met uitsluitend een noemer verschilt.
 * `1 / K` leest mathjs als de grootheid 1 K⁻¹, mét waarde: die weigert hij als
 * doeleenheid, en `1.2e-5 1 / K` zijn twee getallen achter elkaar, waarna de
 * ingevulde formule als ruwe tekst in beeld kwam. `K^-1` is dezelfde eenheid
 * zonder die bezwaren.
 */
function unitExpression(value: MathUnit): string {
  const entries = unitGroups(value);
  if (entries.length > 0 && entries.every(g => g.power < 0)) {
    return entries.map(g => `${g.name}^${g.power}`).join(' ');
  }
  return simplifyUnitString(value);
}

/** Get the numeric value in the simplified unit */
function getNumericValue(value: MathUnit): number {
  try {
    return value.toNumber(unitExpression(value));
  } catch {
    // Vangnet: de interne notatie van mathjs zelf.
    try { return value.toNumber(value.formatUnits()); } catch { /* laatste terugval */ }
    // Fallback: extract from toString
    const str = String(value);
    const match = str.match(/^([+-]?\d+\.?\d*(?:e[+-]?\d+)?)\s/i);
    if (match) return parseFloat(match[1]);
    return value.value;
  }
}

// ─── Number formatting ──────────────────────────────────────────────

function formatNumber(n: number): string {
  // Een deling door een weerstand nul geeft een oneindige unity check; die
  // hoort als ∞ op het blad, niet als het woord "Infinity".
  if (Number.isNaN(n)) return 'NaN';
  if (!isFinite(n)) return n > 0 ? '∞' : '-∞';
  if (n === 0) return '0';

  // If integer and not too large, show exact
  if (Number.isInteger(n) && Math.abs(n) < 1e12) {
    return n.toString();
  }

  // Use 4 significant digits for non-integers
  const formatted = parseFloat(n.toPrecision(4));

  // Avoid scientific notation for reasonable ranges
  if (Math.abs(formatted) >= 0.001 && Math.abs(formatted) < 1e9) {
    return formatted.toString();
  }

  return n.toExponential(3);
}

/**
 * De opmaak van een getal in beeld:
 *   `formaat` achter een uitdrukking (`x = a/b:F2`), als in .NET:
 *     F n  vast n decimalen, met nullen achteraan (F = F2): 3.14159:F2 → 3.14
 *     N n  als F; zonder scheiding van duizendtallen, want een komma of punt
 *          daarvoor botst met het decimaalteken
 *     E n  wetenschappelijk met n decimalen (E = E6)
 *     G n  n significante cijfers (G zonder getal: de opmaak van de app)
 *     P n  procent: ×100, n decimalen en een %-teken (P = P2)
 *   `decimalen` uit `#round n`: afgerond op n decimalen, zonder nullen
 *     achteraan (2.5 blijft 2.5); wat daarbij op 0 zou uitkomen, staat in
 *     wetenschappelijke notatie.
 * Een formaat achter de uitdrukking gaat voor `#round`. Zonder beide: de
 * opmaak van de app (formatNumber).
 */
interface Opmaak {
  formaat?: string;
  decimalen: number | null;
}

function opmaakVan(stand: Stand, formaat?: string): Opmaak | undefined {
  if (!formaat && stand.decimalen === null) return undefined;
  return { formaat, decimalen: stand.decimalen };
}

/** `n` vast op d decimalen, afgerond zoals round(); "-0.00" wordt "0.00". */
function vasteDecimalen(n: number, d: number): string {
  const s = (nativeRound(n, d) as number).toFixed(d);
  return /^-0(?:\.0*)?$/.test(s) ? s.slice(1) : s;
}

function formatGetal(n: number, opmaak?: Opmaak): string {
  if (!opmaak || !Number.isFinite(n)) return formatNumber(n);
  const m = opmaak.formaat?.match(/^([FNEGP])(\d*)$/i);
  if (m) {
    const d = m[2] === '' ? null : Math.min(15, parseInt(m[2], 10));
    switch (m[1].toUpperCase()) {
      case 'F':
      case 'N':
        return vasteDecimalen(n, d ?? 2);
      case 'E':
        return n.toExponential(d ?? 6);
      case 'G':
        return d ? String(parseFloat(n.toPrecision(d))) : formatNumber(n);
      case 'P':
        return `${vasteDecimalen(n * 100, d ?? 2)} %`;
    }
  }
  if (opmaak.decimalen !== null) {
    if (n === 0) return '0';
    const r = nativeRound(n, opmaak.decimalen) as number;
    if (r === 0 || Math.abs(n) >= 1e15) {
      return n.toExponential(opmaak.decimalen).replace(/\.?0+e/, 'e');
    }
    return String(r);
  }
  return formatNumber(n);
}

/** Een procentformaat geldt niet voor een grootheid met eenheid; die krijgt dan vaste decimalen. */
function opmaakMetEenheid(opmaak: Opmaak): Opmaak {
  const f = opmaak.formaat;
  return f && /^P/i.test(f) ? { ...opmaak, formaat: 'F' + f.slice(1) } : opmaak;
}

/** De uitkomst in beeld met een opmaak; undefined als er niets op te maken is. */
function toonUitkomst(value: unknown, opmaak: Opmaak): string | undefined {
  if (isUnit(value)) {
    return `${formatGetal(getNumericValue(value), opmaakMetEenheid(opmaak))} ${simplifyUnitString(value)}`;
  }
  if (typeof value === 'number') return formatGetal(value, opmaak);
  return undefined;
}

/** De uitkomst als onafgerond getal in de getoonde eenheid; geen getal → undefined. */
function numeriek(value: unknown): number | undefined {
  if (isUnit(value)) return getNumericValue(value);
  return typeof value === 'number' ? value : undefined;
}

/** Hoeveel rijen en kolommen van een matrix de uitwerking ten hoogste toont. */
const TOON_RIJEN = 12;
const TOON_KOLOMMEN = 10;

/**
 * De plaatsen die getoond worden van `n`: alles, of bij meer dan `max` de
 * eerste max − 2, een gat (-1) en de laatste.
 */
function getoondePlaatsen(n: number, max: number): number[] {
  if (n <= max) return Array.from({ length: n }, (_, i) => i);
  return [...Array.from({ length: max - 2 }, (_, i) => i), -1, n - 1];
}

/**
 * Een vector of matrix voor de uitwerking: elk element afgerond en met zijn
 * eenheid vereenvoudigd zoals een gewone uitkomst. Delen alle elementen
 * dezelfde eenheid (een kale 0 telt mee), dan staat die één keer achter de
 * haak. Rekenruis (een element dat meer dan 10¹³ keer kleiner is dan het
 * grootste) wordt als 0 getoond. Een grote matrix wordt ingekort. null als
 * de waarde geen vector of matrix is (of meer dan twee dimensies heeft).
 */
function matrixUitkomst(value: unknown, opmaak?: Opmaak): { tekst: string; matrix: MatrixUitkomst } | null {
  const d = afmetingen(value);
  if (!d || d.length < 1 || d.length > 2) return null;
  const vector = d.length === 1;
  const rijen: unknown[][] = vector ? [toArrayLike(value) ?? []] : alsRijen(value);
  const m = rijen.length;
  const n = vector ? d[0] : d[1];

  const alle = rijen.flat();
  const eenheden = new Set<string>();
  let grootste = 0;
  for (const el of alle) {
    if (isUnit(el)) {
      eenheden.add(simplifyUnitString(el));
      grootste = Math.max(grootste, Math.abs(getNumericValue(el)));
    } else if (typeof el === 'number') {
      if (el !== 0) eenheden.add('');
      if (Number.isFinite(el)) grootste = Math.max(grootste, Math.abs(el));
    } else {
      eenheden.add('\u0000');
    }
  }
  const eenheid = eenheden.size === 1 ? [...eenheden][0] : '';
  const gedeeld = eenheid !== '' && eenheid !== '\u0000';
  const ruis = grootste * 1e-13;
  const getal = (x: number, o = opmaak): string => formatGetal(Math.abs(x) < ruis ? 0 : x, o);
  const element = (el: unknown): string => {
    if (isUnit(el)) {
      const w = getal(getNumericValue(el), opmaak && opmaakMetEenheid(opmaak));
      return gedeeld ? w : `${w} ${simplifyUnitString(el)}`.trim();
    }
    if (typeof el === 'number') return getal(el);
    if (typeof el === 'boolean') return el ? '1' : '0';
    return String(el);
  };

  const ri = vector ? [0] : getoondePlaatsen(m, TOON_RIJEN);
  const ki = getoondePlaatsen(n, TOON_KOLOMMEN);
  const getoond = ri.map((i) => ki.map((j) => {
    if (i === -1) return j === -1 ? '⋱' : '⋮';
    if (j === -1) return '⋯';
    return element(rijen[i][j]);
  }));
  const tekst = `[${getoond.map((r) => r.map((e) => (e === '⋮' || e === '⋱' || e === '⋯' ? '…' : e)).join('; ')).join(' | ')}]`
    + (gedeeld ? ` ${eenheid}` : '');
  return {
    tekst,
    matrix: { rijen: getoond, vector, eenheid: gedeeld ? eenheid : '', m: vector ? 1 : m, n },
  };
}

/**
 * De velden van een uitkomst voor de uitwerking: tekst, eenheid, getal en zo
 * nodig de matrixopmaak. Met een opmaak (`:F2`, `#round n`) komt de getoonde
 * vorm in `getoond` (bij een matrix in de elementen van `matrix`); `result`
 * houdt de standaardopmaak, zodat wie de uitkomst leest hetzelfde getal krijgt.
 */
function uitkomstVelden(value: unknown, opmaak?: Opmaak): {
  result: string; unit: string; waarde?: number; matrix?: MatrixUitkomst; getoond?: string; inStelsel?: InStelsel;
} {
  const mat = matrixUitkomst(value);
  if (mat) {
    const getoond = opmaak ? matrixUitkomst(value, opmaak) : null;
    const inStelsel = stelselVelden(value, opmaak);
    return { result: mat.tekst, unit: mat.matrix.eenheid, matrix: (getoond ?? mat).matrix, ...(inStelsel ? { inStelsel } : {}) };
  }
  const result = formatResult(value);
  const getoond = opmaak ? toonUitkomst(value, opmaak) : undefined;
  const inStelsel = stelselVelden(value, opmaak);
  return {
    result,
    waarde: numeriek(value),
    unit: isUnit(value) ? simplifyUnitString(value) : '',
    ...(getoond !== undefined && getoond !== result ? { getoond } : {}),
    ...(inStelsel ? { inStelsel } : {}),
  };
}

/**
 * Een waarde in de eenheid van het stelsel, of `null` als hij blijft zoals hij is.
 * Een vector of matrix gaat per element om, als er iets om te rekenen valt.
 */
function inHetStelsel(value: unknown): unknown | null {
  const stelsel = huidigStelsel;
  if (!stelsel) return null;
  const omrekenen = (el: MathUnit): MathUnit | null => {
    const doel = doelInStelsel(simplifyUnitString(el), stelsel);
    if (!doel) return null;
    try {
      return el.to(doel);
    } catch {
      return null;
    }
  };
  if (isUnit(value)) return omrekenen(value);
  const d = afmetingen(value);
  if (!d || d.length < 1 || d.length > 2) return null;
  let omgezet = false;
  const perElement = (el: unknown): unknown => {
    const u = isUnit(el) ? omrekenen(el) : null;
    if (u) omgezet = true;
    return u ?? el;
  };
  const nieuw: unknown = math.map(value as never, perElement as never);
  return omgezet ? nieuw : null;
}

/** De eerste eenheid in een waarde: van de waarde zelf, of van het eerste element met eenheid. */
function eersteEenheid(value: unknown): string | null {
  if (isUnit(value)) return simplifyUnitString(value);
  const d = afmetingen(value);
  if (!d) return null;
  const rijen: unknown[][] = d.length === 1 ? [toArrayLike(value) ?? []] : alsRijen(value);
  const el = rijen.flat().find(isUnit);
  return el ? simplifyUnitString(el) : null;
}

/** Een vaste notatie houdt in het stelsel dezelfde relatieve nauwkeurigheid (decimalenNa). */
function opmaakInStelsel(opmaak: Opmaak, bron: unknown, doel: unknown): Opmaak {
  const b = eersteEenheid(bron);
  const d = eersteEenheid(doel);
  if (!b || !d) return opmaak;
  const f = opmaak.formaat?.match(/^([FN])(\d*)$/i);
  if (f) return { ...opmaak, formaat: f[1] + decimalenNa(f[2] === '' ? 2 : parseInt(f[2], 10), b, d) };
  if (opmaak.decimalen !== null) return { ...opmaak, decimalen: decimalenNa(opmaak.decimalen, b, d) };
  return opmaak;
}

/** De velden van een uitkomst in het stelsel (InStelsel), of `null` als hij blijft zoals hij is. */
function stelselVelden(value: unknown, opmaak?: Opmaak): InStelsel | null {
  // Een fout in de weergave mag nooit de rekenwaarde raken: dan blijft de waarde
  // zoals het blad hem toont.
  try {
    return stelselVeldenOnveilig(value, opmaak);
  } catch {
    return null;
  }
}

function stelselVeldenOnveilig(value: unknown, opmaak?: Opmaak): InStelsel | null {
  const omgezet = inHetStelsel(value);
  if (omgezet === null) return null;
  const opmaakNa = opmaak ? opmaakInStelsel(opmaak, value, omgezet) : undefined;
  const mat = matrixUitkomst(omgezet);
  if (mat) {
    const getoond = opmaakNa ? matrixUitkomst(omgezet, opmaakNa) : null;
    return { result: mat.tekst, unit: mat.matrix.eenheid, matrix: (getoond ?? mat).matrix };
  }
  const result = formatResult(omgezet);
  const getoond = opmaakNa ? toonUitkomst(omgezet, opmaakNa) : undefined;
  return {
    result,
    unit: isUnit(omgezet) ? simplifyUnitString(omgezet) : '',
    ...(getoond !== undefined && getoond !== result ? { getoond } : {}),
  };
}

/** Format value for the final result: "150000 mm^2" */
function formatResult(value: unknown): string {
  if (value === null || value === undefined) return '';

  if (isUnit(value)) {
    const num = getNumericValue(value);
    const unit = simplifyUnitString(value);
    return `${formatNumber(num)} ${unit}`;
  }

  if (typeof value === 'number') {
    return formatNumber(value);
  }

  return String(value);
}

/**
 * Format value for inline substitution: "300 mm". De ingevulde formule gaat
 * daarna door de formuleopmaak (mathjs-parse), dus de eenheid moet daar
 * leesbaar zijn: een zuiver inverse eenheid wordt `1.2e-5 K^-1`.
 */
function formatInline(value: unknown, decimalen: number | null = null): string {
  if (value === null || value === undefined) return '';
  const opmaak: Opmaak | undefined = decimalen === null ? undefined : { decimalen };

  if (isUnit(value)) {
    const num = getNumericValue(value);
    const unit = unitExpression(value);
    return `${formatGetal(num, opmaak)} ${unit}`;
  }

  if (typeof value === 'number') {
    return formatGetal(value, opmaak);
  }

  // Een tekst tussen aanhalingstekens, zodat de formuleopmaak hem als tekst
  // leest en niet als een naam (of, met spaties, als iets onleesbaars).
  if (typeof value === 'string') return JSON.stringify(value);

  return String(value);
}

// ─── Conditionals ───────────────────────────────────────────────────

/**
 * Cascading evaluation — first branch whose condition is truthy wins.
 * Falls through to `elseBody` if none match.
 */
function evaluateConditional(
  node: ConditionalNode,
  scope: Scope,
  selectValues: SelectValues,
  stand: Stand,
): EvaluatedNode | null {
  const branches = node.branches ?? (
    // Legacy fallback if a caller hands us pre-cascading nodes
    node.condition !== undefined && node.ifBody !== undefined
      ? [{ condition: node.condition, body: node.ifBody }]
      : []
  );

  for (const branch of branches) {
    try {
      const condValue = reken(branch.condition, scope);
      if (Boolean(condValue)) {
        if (branch.body.length === 0) return null;
        const children = evaluateNodes(branch.body, scope, selectValues, stand);
        return { type: 'conditional-branch', children };
      }
    } catch {
      return {
        type: 'conditional-branch',
        children: [{ type: 'text', text: `Error evaluating condition: ${branch.condition}` }],
      };
    }
  }

  // No branch matched — try else
  if (node.elseBody && node.elseBody.length > 0) {
    const children = evaluateNodes(node.elseBody, scope, selectValues, stand);
    return { type: 'conditional-branch', children };
  }
  return null;
}

// ─── Plot rendering ─────────────────────────────────────────────────

/**
 * Sample each curve at `samples` evenly-spaced parameter values and produce
 * a self-contained SVG with axes + colored polylines. Numbers are coerced to
 * plain JS numbers (units are stripped via `valueOf`).
 */
function renderPlotSvg(
  node: { curves: { xExpr?: string; yExpr: string }[]; param: string; lo: string; hi: string; samples?: number },
  scope: Scope,
): string {
  const samples = node.samples ?? 120;
  // Grenzen met een eenheid (`x = 0 m : L`): de variabele loopt dan met die
  // eenheid, zodat een functie als q·x·(L − x)/2 met eenheden rekent. Zonder
  // deze stap viel elk punt af op "Units do not match" en bleef de grafiek leeg.
  const loW = reken(node.lo, scope);
  const hiW = reken(node.hi, scope);
  const grens = [hiW, loW].find(isUnit) as MathUnit | undefined;
  const xEenheid = grens ? unitExpression(grens) : '';
  const alsGetal = (v: unknown): number => {
    if (!isUnit(v)) return toPlain(v);
    try { return v.toNumber(xEenheid); } catch { return Number.NaN; }
  };
  const lo = alsGetal(loW);
  const hi = alsGetal(hiW);
  if (!isFinite(lo) || !isFinite(hi) || lo === hi) {
    throw new Error(`invalid range ${lo} … ${hi}`);
  }
  let xLabel = grens ? simplifyUnitString(grens) : '';
  let yLabel = '';

  // Pre-compile each curve's expressions
  const compiled = node.curves.map((c) => ({
    x: c.xExpr ? vertaalRekentaal(ontleedExpr(c.xExpr)).compile() : null,
    y: vertaalRekentaal(ontleedExpr(c.yExpr)).compile(),
  }));

  // Sample
  type Pt = { x: number; y: number };
  const seriesData: Pt[][] = compiled.map(() => []);
  const innerScope: Scope = { ...scope };
  for (let i = 0; i <= samples; i++) {
    const t = lo + ((hi - lo) * i) / samples;
    innerScope[node.param] = xEenheid ? math.unit(t, xEenheid) : t;
    for (let s = 0; s < compiled.length; s++) {
      try {
        let x = t;
        if (compiled[s].x) {
          const xw = compiled[s].x!.evaluate(innerScope);
          if (s === 0 && i === 0) xLabel = isUnit(xw) ? simplifyUnitString(xw) : '';
          x = toPlain(xw);
        }
        const yw = compiled[s].y.evaluate(innerScope);
        if (!yLabel && isUnit(yw)) yLabel = simplifyUnitString(yw);
        const y = toPlain(yw);
        if (isFinite(x) && isFinite(y)) {
          seriesData[s].push({ x, y });
        }
      } catch { /* skip bad sample */ }
    }
  }

  // Compute bounds across all series
  let xMin = Infinity, xMax = -Infinity, yMin = Infinity, yMax = -Infinity;
  for (const series of seriesData) {
    for (const p of series) {
      if (p.x < xMin) xMin = p.x;
      if (p.x > xMax) xMax = p.x;
      if (p.y < yMin) yMin = p.y;
      if (p.y > yMax) yMax = p.y;
    }
  }
  if (!isFinite(xMin) || xMin === xMax) { xMin -= 1; xMax += 1; }
  if (!isFinite(yMin) || yMin === yMax) { yMin -= 1; yMax += 1; }
  const xPad = (xMax - xMin) * 0.05;
  const yPad = (yMax - yMin) * 0.08;
  xMin -= xPad; xMax += xPad; yMin -= yPad; yMax += yPad;

  // De variabelen PlotWidth en PlotHeight (pixels) bepalen de maat.
  const maat = (naam: string, standaard: number): number => {
    const v = scope[naam];
    const n = typeof v === 'number' ? v : Number.NaN;
    return Number.isFinite(n) && n >= 50 && n <= 4000 ? n : standaard;
  };
  const W = maat('PlotWidth', 520);
  const H = maat('PlotHeight', 320);
  const padL = 44, padR = 16, padT = 16, padB = 32;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const sx = (v: number): number => padL + ((v - xMin) / (xMax - xMin)) * plotW;
  const sy = (v: number): number => padT + plotH - ((v - yMin) / (yMax - yMin)) * plotH;

  const colors = ['#D97706', '#2563EB', '#16A34A', '#DC2626', '#7C3AED', '#0891B2'];
  const series = seriesData.map((pts, s) => {
    if (pts.length === 0) return '';
    const d = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.x).toFixed(1)},${sy(p.y).toFixed(1)}`).join(' ');
    const color = colors[s % colors.length];
    // Single-point series (e.g. roots `x_1|0`) → dot instead of line.
    if (pts.length <= 2 && pts.every((p, i, arr) => i === 0 || (p.x === arr[i - 1].x && p.y === arr[i - 1].y))) {
      const p = pts[0];
      return `<circle cx="${sx(p.x).toFixed(1)}" cy="${sy(p.y).toFixed(1)}" r="4" fill="${color}" />`;
    }
    return `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" />`;
  });

  // Axes — origin lines if 0 is inside the range
  const axes: string[] = [];
  if (xMin < 0 && xMax > 0) {
    const x0 = sx(0);
    axes.push(`<line x1="${x0.toFixed(1)}" y1="${padT}" x2="${x0.toFixed(1)}" y2="${padT + plotH}" stroke="#94a3b8" stroke-width="0.8" />`);
  }
  if (yMin < 0 && yMax > 0) {
    const y0 = sy(0);
    axes.push(`<line x1="${padL}" y1="${y0.toFixed(1)}" x2="${padL + plotW}" y2="${y0.toFixed(1)}" stroke="#94a3b8" stroke-width="0.8" />`);
  }

  // Frame + tick labels (4 on each axis)
  const ticks: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const tx = xMin + ((xMax - xMin) * i) / 4;
    const ty = yMin + ((yMax - yMin) * i) / 4;
    const x = sx(tx);
    const y = sy(ty);
    ticks.push(`<text x="${x.toFixed(1)}" y="${H - padB + 14}" font-size="9" fill="#64748b" text-anchor="middle">${formatTick(tx)}</text>`);
    ticks.push(`<text x="${padL - 6}" y="${y.toFixed(1) }" font-size="9" fill="#64748b" text-anchor="end" dominant-baseline="middle">${formatTick(ty)}</text>`);
  }
  // De eenheden van de assen, als de grafiek met eenheden rekent.
  const svgTekst = (s: string): string => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  if (xLabel) {
    ticks.push(`<text x="${padL + plotW}" y="${padT + plotH - 4}" font-size="9" fill="#64748b" text-anchor="end">${svgTekst(xLabel)}</text>`);
  }
  if (yLabel) {
    ticks.push(`<text x="${padL + 4}" y="${padT + 10}" font-size="9" fill="#64748b" text-anchor="start">${svgTekst(yLabel)}</text>`);
  }

  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" class="calc-plot">
    <rect x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="#fafaf9" stroke="#e7e5e4" stroke-width="1" />
    ${axes.join('\n    ')}
    ${series.join('\n    ')}
    ${ticks.join('\n    ')}
  </svg>`;
}

function toPlain(v: unknown): number {
  if (typeof v === 'number') return v;
  if (isUnit(v)) {
    try { return getNumericValue(v); } catch { return Number.NaN; }
  }
  const n = Number(v);
  return isFinite(n) ? n : Number.NaN;
}

function formatTick(n: number): string {
  if (n === 0) return '0';
  const abs = Math.abs(n);
  if (abs >= 1000 || abs < 0.01) return n.toExponential(1);
  if (Number.isInteger(n)) return n.toString();
  return n.toFixed(2).replace(/\.?0+$/, '');
}

// ─── SVG interpolation ──────────────────────────────────────────────

/**
 * Convert an evaluated mathjs value to a string suitable for inlining into
 * SVG / HTML markup. Numbers lose their units (SVG coordinates are unitless).
 */
function stringifyInterpolated(v: unknown, formaat?: string, decimalen: number | null = null): string {
  if (v === null || v === undefined) return '';
  // Een formaat (`'x:F2'`) of `#round n` geldt ook voor een ingevoegde waarde.
  const opmaak: Opmaak | undefined = formaat || decimalen !== null ? { formaat, decimalen } : undefined;
  if (typeof v === 'number') return formatGetal(v, opmaak);
  if (typeof v === 'string') return v;
  if (typeof v === 'boolean') return v ? '1' : '0';
  if (isUnit(v)) return formatGetal(getNumericValue(v), opmaak && opmaakMetEenheid(opmaak));
  return String(v);
}

/** Vult {{naam}} in met de waarde uit de scope, zonder eenheid; onbekende namen blijven staan. */
function interpolateBraces(content: string, scope: Scope): string {
  return content.replace(/\{\{(\w+)\}\}/g, (_, varName: string) => {
    if (varName in scope) {
      const val = scope[varName];
      if (isUnit(val)) {
        return formatNumber(getNumericValue(val));
      }
      if (typeof val === 'number') {
        return formatNumber(val);
      }
      return String(val);
    }
    return `{{${varName}}}`;
  });
}
