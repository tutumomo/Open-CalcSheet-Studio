import type { FemRekenmodel, FemUitkomstCompact } from './types.js';

/**
 * Het raster en het rekenmodel van een `@fem`-blok (femBlok.ts), zonder de rekentaal.
 *
 * CalcSheet rekent de plaat niet zelf: dat doet Open FEM Studio (`solve_open_fem_3d`,
 * MITC4-schaalelementen). Hier wordt alleen het model opgebouwd en het antwoord compact
 * bewaard.
 *
 * Het raster
 * ----------
 * Eén raster van rechthoeken over alle platen. De lijnen lopen door elke plaatrand,
 * elke veer en de rand van zijn paalkop, elke lijnsteun, de rand van elke vlaklast op
 * een rechthoek en elke puntlast; daartussen zo verdeeld dat geen zijde langer is dan
 * de maas. Een element hoort bij de laatste plaat die zijn midden bedekt, zo wint een
 * ponskop of strook die over de vloer ligt. Omdat alle lijnen doorlopen, delen platen
 * van verschillende dikte die tegen elkaar liggen hun knopen, zonder hangende knopen.
 *
 * Een veer met een paalkop (diameter d) is verdeeld over de knopen binnen de kop, net als
 * in plaat.ts: op een puntsteun wordt het moment in een plaat oneindig (logaritmisch), en
 * de waarde boven de paal zou dan alleen van de maas afhangen. De rand van de kop is een
 * rasterlijn, dus de kop heeft altijd de middelste knoop en de vier knopen op zijn rand
 * (minder aan de rand van de vloer).
 *
 * Een plaat die alleen loodrecht op haar vlak is opgelegd, kan in haar vlak schuiven en
 * draaien. Het model houdt daarom de eerste knoop vast in x en y en een tweede knoop op
 * dezelfde rij in y: precies drie vrijheidsgraden, statisch bepaald, dus zonder dwang.
 * Bij lasten loodrecht op de plaat zijn die reacties nul.
 *
 * De lasten
 * ---------
 * Elke plaat uit het blok is één plaat in de JSON. Een vlaklast in de JSON geldt voor een
 * hele plaat (`surfaceLoads`): dat zijn de vlaklast op de hele vloer en het eigen gewicht.
 * Een vlaklast op een rechthoek (of op de plek van een benoemde plaat) gaat als
 * knooplasten: q·A/4 op elke hoek van elk element eronder. Voor een rechthoekig element
 * met bilineaire vormfuncties is dat precies de consistente last. Een plaat opdelen per
 * vlaklast kan niet: FEM Studio middelt de momenten op een knoop per plaat, en langs de
 * rand van zo'n deel zou dat gemiddelde dan van één kant komen (gemeten: in een
 * symmetrische vloer werd m_x,max dan ongelijk aan m_y,max).
 *
 * Eenheden: m, kN, kN/m, kN/m², kN/m³; E in MPa. In het blok is omlaag positief; in de
 * JSON wijst Z omhoog, dus daar is een last omlaag negatief.
 */

export interface FemPlaat { x0: number; y0: number; x1: number; y1: number; t: number }
export interface FemVeer { x: number; y: number; k: number; d: number }
/** Een lijnsteun evenwijdig aan x of y; k in kN/m per m, null is vast. */
export interface FemLijn { x1: number; y1: number; x2: number; y2: number; k: number | null }
export type FemLast =
  | { soort: 'vlak'; q: number; rechthoek?: [number, number, number, number] }
  | { soort: 'eigengewicht'; gamma: number }
  | { soort: 'punt'; F: number; x: number; y: number };
export interface FemGeval { naam: string; lasten: FemLast[] }

/** Het model uit het blok, in getallen (m, kN, MPa). */
export interface FemInvoer {
  E: number;
  nu: number;
  maas: number;
  platen: FemPlaat[];
  veren: FemVeer[];
  lijnen: FemLijn[];
  gevallen: FemGeval[];
}

/** Het raster, voor alle gevallen hetzelfde. */
export interface FemNet {
  x: number[];
  y: number[];
  el: number[];
  pl: number[];
  veren: [number, number][][];
  lijnen: [number, number | null][][];
  inVlak: [number, number];
  /** De knoop op (x, y), of −1. */
  knoopOp(x: number, y: number): number;
}

/** Zoveel knopen hoogstens; een fijnere maas is een fout met een duidelijke melding. */
export const FEM_MAX_KNOPEN = 8000;
/** Coördinaten op een nanometer, zodat 5 − 0,2 en 4,8 dezelfde lijn zijn. */
const rond = (v: number) => Math.round(v * 1e9) / 1e9;
/** Twee lijnen dichter bij elkaar dan dit zijn één lijn. */
const SAMEN = 1e-6;
const twaalf = (v: number) => Number(v.toPrecision(12));

const getalTekst = (v: number) => String(Number(v.toPrecision(6)));
const plek = (x: number, y: number) => `(${getalTekst(x)}; ${getalTekst(y)})`;

/** Gesorteerde lijnen binnen [lo, hi], dichtbij elkaar samengevoegd. */
function lijnenTussen(waarden: number[], lo: number, hi: number): number[] {
  const binnen = waarden.filter((v) => v >= lo - SAMEN && v <= hi + SAMEN).map((v) => rond(Math.min(hi, Math.max(lo, v))));
  binnen.sort((a, b) => a - b);
  const uit: number[] = [];
  for (const v of binnen) if (!uit.length || v - uit[uit.length - 1] > SAMEN) uit.push(v);
  return uit;
}

/** Elk interval zo verdeeld dat geen stuk langer is dan de maas. */
function verdeel(lijnen: number[], maas: number): number[] {
  const uit = [lijnen[0]];
  for (let k = 1; k < lijnen.length; k++) {
    const a = lijnen[k - 1];
    const b = lijnen[k];
    const n = Math.max(1, Math.ceil((b - a) / maas - 1e-9));
    for (let s = 1; s <= n; s++) uit.push(s === n ? b : rond(a + ((b - a) * s) / n));
  }
  return uit;
}

/** De plek van v in de gesorteerde lijnen (binnen SAMEN), of −1. */
function plekIn(lijnen: number[], v: number): number {
  let lo = 0;
  let hi = lijnen.length - 1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (Math.abs(lijnen[m] - v) <= SAMEN) return m;
    if (lijnen[m] < v) lo = m + 1;
    else hi = m - 1;
  }
  return -1;
}

/** Maakt het raster; werpt bij een model dat niet kan, met een melding in het Nederlands. */
export function maakFemNet(inv: FemInvoer): FemNet {
  if (!inv.platen.length) throw new Error('het model heeft geen plaat');
  if (!(inv.maas > 0)) throw new Error('de maas moet groter dan 0 zijn');
  if (!inv.veren.length && !inv.lijnen.length) throw new Error('het model heeft geen steunpunten: zet een veer, veren of een lijnsteun');
  const bx0 = Math.min(...inv.platen.map((p) => p.x0));
  const bx1 = Math.max(...inv.platen.map((p) => p.x1));
  const by0 = Math.min(...inv.platen.map((p) => p.y0));
  const by1 = Math.max(...inv.platen.map((p) => p.y1));

  const lx: number[] = [];
  const ly: number[] = [];
  for (const p of inv.platen) lx.push(p.x0, p.x1), ly.push(p.y0, p.y1);
  for (const v of inv.veren) {
    lx.push(v.x), ly.push(v.y);
    if (v.d > 0) lx.push(v.x - v.d / 2, v.x + v.d / 2), ly.push(v.y - v.d / 2, v.y + v.d / 2);
  }
  for (const l of inv.lijnen) lx.push(l.x1, l.x2), ly.push(l.y1, l.y2);
  for (const g of inv.gevallen) {
    for (const l of g.lasten) {
      if (l.soort === 'vlak' && l.rechthoek) lx.push(l.rechthoek[0], l.rechthoek[2]), ly.push(l.rechthoek[1], l.rechthoek[3]);
      if (l.soort === 'punt') lx.push(l.x), ly.push(l.y);
    }
  }
  const gx = verdeel(lijnenTussen(lx, bx0, bx1), inv.maas);
  const gy = verdeel(lijnenTussen(ly, by0, by1), inv.maas);
  const nx = gx.length - 1;
  const ny = gy.length - 1;

  // De plaat per cel: de laatste die het midden bedekt.
  const plaatVan = new Int32Array(nx * ny).fill(-1);
  for (let j = 0; j < ny; j++) {
    const yc = (gy[j] + gy[j + 1]) / 2;
    for (let i = 0; i < nx; i++) {
      const xc = (gx[i] + gx[i + 1]) / 2;
      for (let p = inv.platen.length - 1; p >= 0; p--) {
        const q = inv.platen[p];
        if (xc > q.x0 && xc < q.x1 && yc > q.y0 && yc < q.y1) {
          plaatVan[j * nx + i] = p;
          break;
        }
      }
    }
  }

  // De knopen: alleen die van een element, rij voor rij genummerd.
  const knoopNr = new Int32Array((nx + 1) * (ny + 1)).fill(-1);
  const gebruikt = (i: number, j: number) => (i >= 0 && j >= 0 && i < nx && j < ny ? plaatVan[j * nx + i] >= 0 : false);
  const x: number[] = [];
  const y: number[] = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      if (gebruikt(i, j) || gebruikt(i - 1, j) || gebruikt(i, j - 1) || gebruikt(i - 1, j - 1)) {
        knoopNr[j * (nx + 1) + i] = x.length;
        x.push(gx[i]);
        y.push(gy[j]);
      }
    }
  }
  if (x.length > FEM_MAX_KNOPEN) {
    throw new Error(`het raster heeft ${x.length} knopen, meer dan ${FEM_MAX_KNOPEN}: kies een grotere maas`);
  }
  const nr = (i: number, j: number) => (i < 0 || j < 0 || i > nx || j > ny ? -1 : knoopNr[j * (nx + 1) + i]);

  // De elementen tegen de klok in, met hun plaat.
  const el: number[] = [];
  const pl: number[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const p = plaatVan[j * nx + i];
      if (p < 0) continue;
      el.push(nr(i, j), nr(i + 1, j), nr(i + 1, j + 1), nr(i, j + 1));
      pl.push(p);
    }
  }

  const knoopOp = (px: number, py: number) => {
    const i = plekIn(gx, px);
    const j = plekIn(gy, py);
    return i < 0 || j < 0 ? -1 : nr(i, j);
  };

  // Veren: de middelste knoop eerst, dan de knopen binnen de kop.
  const veren = inv.veren.map((v): [number, number][] => {
    const midden = knoopOp(v.x, v.y);
    if (midden < 0) throw new Error(`de veer op ${plek(v.x, v.y)} ligt niet op een plaat`);
    const r = v.d / 2;
    const knopen = [midden];
    if (r > 0) {
      for (let j = 0; j <= ny; j++) {
        if (Math.abs(gy[j] - v.y) > r + SAMEN) continue;
        for (let i = 0; i <= nx; i++) {
          if (Math.abs(gx[i] - v.x) > r + SAMEN) continue;
          const k = nr(i, j);
          if (k >= 0 && k !== midden && Math.hypot(gx[i] - v.x, gy[j] - v.y) <= r + SAMEN) knopen.push(k);
        }
      }
    }
    return knopen.map((k) => [k, twaalf(v.k / knopen.length)]);
  });

  // Lijnsteunen: de knopen op de lijn, met het deel van de lijn dat bij elk hoort.
  const lijnen = inv.lijnen.map((l): [number, number | null][] => {
    const verticaal = Math.abs(l.x1 - l.x2) <= SAMEN;
    const horizontaal = Math.abs(l.y1 - l.y2) <= SAMEN;
    if (!verticaal && !horizontaal) throw new Error('een lijnsteun loopt evenwijdig aan x of y');
    if (verticaal && horizontaal) throw new Error(`de lijnsteun op ${plek(l.x1, l.y1)} heeft geen lengte`);
    const langs = verticaal ? gy : gx;
    const lo = Math.min(verticaal ? l.y1 : l.x1, verticaal ? l.y2 : l.x2);
    const hi = Math.max(verticaal ? l.y1 : l.x1, verticaal ? l.y2 : l.x2);
    const vast = verticaal ? plekIn(gx, l.x1) : plekIn(gy, l.y1);
    const uit: [number, number | null][] = [];
    for (let s = 0; s < langs.length; s++) {
      const v = langs[s];
      if (v < lo - SAMEN || v > hi + SAMEN) continue;
      const k = verticaal ? nr(vast, s) : nr(s, vast);
      if (k < 0) continue;
      const deel = (Math.min(hi, langs[s + 1] ?? v) - Math.max(lo, langs[s - 1] ?? v)) / 2;
      uit.push([k, l.k === null ? null : twaalf(l.k * Math.max(0, deel))]);
    }
    if (!uit.length) throw new Error(`de lijnsteun van ${plek(l.x1, l.y1)} naar ${plek(l.x2, l.y2)} ligt niet op een plaat`);
    return uit;
  });

  // In het vlak: de eerste knoop en de laatste op dezelfde rij.
  let b = 0;
  for (let k = 1; k < x.length && y[k] === y[0]; k++) b = k;
  if (b === 0) throw new Error('het raster heeft geen tweede knoop op de onderste rij');

  return { x, y, el, pl, veren, lijnen, inVlak: [0, b], knoopOp };
}

/**
 * Het rekenmodel van één geval: het raster met de lasten van dat geval. De vlaklast op de
 * hele vloer en het eigen gewicht per plaat; een vlaklast op een rechthoek en een puntlast
 * als knooplasten.
 */
export function femRekenmodel(net: FemNet, inv: FemInvoer, geval: number): FemRekenmodel {
  const g = inv.gevallen[geval];
  const q = new Array<number>(inv.platen.length).fill(0);
  const F = new Map<number, number>();
  const bij = (k: number, f: number) => F.set(k, (F.get(k) ?? 0) + f);
  for (const l of g.lasten) {
    if (l.soort === 'vlak' && !l.rechthoek) {
      for (let p = 0; p < q.length; p++) q[p] += l.q;
    } else if (l.soort === 'vlak') {
      const [rx0, ry0, rx1, ry1] = l.rechthoek!;
      for (let e = 0; e < net.pl.length; e++) {
        const a = net.el[4 * e];
        const c = net.el[4 * e + 2];
        const xc = (net.x[a] + net.x[c]) / 2;
        const yc = (net.y[a] + net.y[c]) / 2;
        if (!(xc > rx0 && xc < rx1 && yc > ry0 && yc < ry1)) continue;
        const deel = (l.q * (net.x[c] - net.x[a]) * (net.y[c] - net.y[a])) / 4;
        for (let h = 0; h < 4; h++) bij(net.el[4 * e + h], deel);
      }
    } else if (l.soort === 'eigengewicht') {
      for (let p = 0; p < q.length; p++) q[p] += l.gamma * inv.platen[p].t;
    } else {
      const k = net.knoopOp(l.x, l.y);
      if (k < 0) throw new Error(`de puntlast op ${plek(l.x, l.y)} ligt niet op een plaat`);
      bij(k, l.F);
    }
  }
  return {
    vorm: 'fem-plaat/1',
    geval: g.naam,
    E: inv.E,
    nu: inv.nu,
    x: net.x,
    y: net.y,
    el: net.el,
    pl: net.pl,
    t: inv.platen.map((p) => p.t),
    veren: net.veren,
    lijnen: net.lijnen,
    inVlak: net.inVlak,
    q: q.map(twaalf),
    F: [...F].filter(([, f]) => f !== 0).sort((a, b) => a[0] - b[0]).map(([k, f]) => [k, twaalf(f)]),
  };
}

/** Per knoop met een verticale steun: of hij vast is en de som van zijn veren (kN/m). */
function steunPerKnoop(m: FemRekenmodel): Map<number, { vast: boolean; k: number }> {
  const uit = new Map<number, { vast: boolean; k: number }>();
  const bij = (k: number, veer: number | null) => {
    const s = uit.get(k) ?? { vast: false, k: 0 };
    if (veer === null) s.vast = true;
    else s.k += veer;
    uit.set(k, s);
  };
  for (const v of m.veren) for (const [k, veer] of v) bij(k, veer);
  for (const l of m.lijnen) for (const [k, veer] of l) bij(k, veer);
  return uit;
}

/** De knopen met een verticale steun, oplopend: de volgorde van `R` in het bewaarde antwoord. */
export function femSteunknopen(m: FemRekenmodel): number[] {
  return [...steunPerKnoop(m).keys()].sort((a, b) => a - b);
}

/** De platen uit het blok die in het raster voorkomen, oplopend. */
const gebruiktePlaten = (m: FemRekenmodel) => [...new Set(m.pl)].sort((a, b) => a - b);

/**
 * De JSON voor `solve_open_fem_3d` (contractversie 2): knopen, één materiaal, de platen
 * met hun dikte (id = het volgnummer in het blok + 1), de MITC4-elementen, de steunen,
 * de vlaklasten en de knooplasten van dit geval. Z wijst omhoog: een last omlaag is
 * negatief.
 */
export function femArgumenten(m: FemRekenmodel): Record<string, unknown> {
  const steun = steunPerKnoop(m);
  const [a, b] = m.inVlak;
  const knopen = [...new Set([...steun.keys(), a, b])].sort((p, q) => p - q);
  const supports = knopen.map((k) => {
    const s = steun.get(k);
    return {
      nodeId: k + 1,
      ux: k === a,
      uy: k === a || k === b,
      uz: !!s?.vast,
      rx: false,
      ry: false,
      rz: false,
      ...(s && !s.vast && s.k > 0 ? { kzKnPerM: twaalf(s.k) } : {}),
    };
  });
  const platen = gebruiktePlaten(m);
  const surfaceLoads = platen
    .filter((p) => m.q[p] !== 0)
    .map((p, i) => ({ id: i + 1, plateId: p + 1, qxKnPerM2: 0, qyKnPerM2: 0, qzKnPerM2: -m.q[p] }));
  const nodalLoads = m.F.map(([k, F], i) => ({ id: i + 1, nodeId: k + 1, fx: 0, fy: 0, fz: -F, mx: 0, my: 0, mz: 0 }));
  const shellElements = m.pl.map((p, e) => ({
    id: e + 1,
    plateId: p + 1,
    nodeIds: [m.el[4 * e] + 1, m.el[4 * e + 1] + 1, m.el[4 * e + 2] + 1, m.el[4 * e + 3] + 1],
  }));
  return {
    schemaVersion: 2,
    analysis: 'linear',
    nodes: m.x.map((x, i) => ({ id: i + 1, x, y: m.y[i], z: 0 })),
    materials: [{ id: 1, name: 'plaat', eMpa: m.E, nu: m.nu }],
    plates: platen.map((p) => ({ id: p + 1, materialId: 1, thicknessM: m.t[p] })),
    shellElements,
    supports,
    surfaceLoads,
    ...(nodalLoads.length ? { nodalLoads } : {}),
  };
}

/**
 * De paren van knoop en plaat waarvoor een moment bewaard wordt, in een vaste volgorde
 * (knoop, dan plaat). Een knoop op de rand tussen twee platen heeft twee paren: FEM
 * Studio middelt de momenten op een knoop per plaat.
 */
export function femParen(m: FemRekenmodel): { knoop: number; plaat: number }[] {
  const perKnoop = new Map<number, Set<number>>();
  for (let e = 0; e < m.pl.length; e++) {
    for (let c = 0; c < 4; c++) {
      const k = m.el[4 * e + c];
      (perKnoop.get(k) ?? perKnoop.set(k, new Set()).get(k)!).add(m.pl[e]);
    }
  }
  const uit: { knoop: number; plaat: number }[] = [];
  for (const k of [...perKnoop.keys()].sort((a, b) => a - b)) {
    for (const p of [...perKnoop.get(k)!].sort((a, b) => a - b)) uit.push({ knoop: k, plaat: p });
  }
  return uit;
}

/** De belasting van een geval samen (kN, omlaag positief), uit het model. */
export function femSomLast(m: FemRekenmodel): number {
  let som = 0;
  for (let e = 0; e < m.pl.length; e++) {
    const a = m.el[4 * e];
    const c = m.el[4 * e + 2];
    som += m.q[m.pl[e]] * (m.x[c] - m.x[a]) * (m.y[c] - m.y[a]);
  }
  return som + m.F.reduce((s, [, F]) => s + F, 0);
}

const zes = (v: number) => Number(v.toPrecision(6));
const negen = (v: number) => Number(v.toPrecision(9));
const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const lijst = (x: unknown): Record<string, unknown>[] => (Array.isArray(x) ? x.filter(isObject) : []);
const getal = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : NaN);

/**
 * Het antwoord van `solve_open_fem_3d` compact, zoals het bij het blad wordt vastgelegd:
 * per knoop de verplaatsing in Z, per paar van knoop en plaat de momenten en
 * dwarskrachten (het gemiddelde van FEM Studio per plaat), per steunknoop de reactie.
 * Werpt als er iets ontbreekt: dan wordt er niets bewaard.
 */
export function femBewaar(m: FemRekenmodel, ruw: unknown): FemUitkomstCompact {
  if (!isObject(ruw)) throw new Error('FEM Studio gaf geen resultaat terug');
  const N = m.x.length;
  const uz = new Array<number>(N).fill(NaN);
  for (const d of lijst(ruw.displacements)) {
    const k = getal(d.nodeId) - 1;
    if (k >= 0 && k < N) uz[k] = zes(getal(d.uz));
  }
  const zonder = uz.findIndex((v) => !Number.isFinite(v));
  if (zonder >= 0) throw new Error(`het antwoord van FEM Studio mist de verplaatsing van knoop ${zonder + 1}`);

  const knoopWaarden = new Map<string, Record<string, unknown>>();
  for (const s of lijst(ruw.shellNodes)) knoopWaarden.set(`${getal(s.nodeId) - 1}|${getal(s.plateId) - 1}`, s);
  const GROOTHEDEN = ['mxxKnmPerM', 'myyKnmPerM', 'mxyKnmPerM', 'vxKnPerM', 'vyKnPerM'];
  const mom: number[] = [];
  for (const paar of femParen(m)) {
    const s = knoopWaarden.get(`${paar.knoop}|${paar.plaat}`);
    if (!s) throw new Error(`het antwoord van FEM Studio mist de momenten van knoop ${paar.knoop + 1} in plaat ${paar.plaat + 1}`);
    const w = GROOTHEDEN.map((q) => getal(s[q]));
    if (w.some((v) => !Number.isFinite(v))) throw new Error(`het antwoord van FEM Studio heeft geen getal voor knoop ${paar.knoop + 1}`);
    mom.push(...w.map(zes));
  }

  const reactie = new Map<number, number>();
  for (const r of lijst(ruw.reactions)) reactie.set(getal(r.nodeId) - 1, getal(r.fz));
  const steun = steunPerKnoop(m);
  const R = femSteunknopen(m).map((k) => {
    const r = reactie.get(k);
    if (r !== undefined && Number.isFinite(r)) return negen(r);
    const s = steun.get(k)!;
    if (s.vast) throw new Error(`het antwoord van FEM Studio mist de reactie van knoop ${k + 1}`);
    return negen(-s.k * uz[k]);
  });
  const ev = isObject(ruw.equilibrium) ? ruw.equilibrium : {};
  return {
    vorm: 'fem-plaat/1',
    uz,
    m: mom,
    R,
    som: { last: negen(femSomLast(m)), reactie: negen(R.reduce((s, r) => s + r, 0)) },
    evenwicht: { ok: ev.equilibriumOk === true && ev.residualOk !== false, max: zes(getal(ev.maxImbalanceKn) || 0) },
  };
}
