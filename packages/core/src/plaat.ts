/**
 * Plaat op palen — een vlakke betonplaat (Kirchhoff) op verende palen in een
 * regelmatig raster, eerste orde, met driehoekige DKT-elementen.
 *
 * Het element is de Discrete Kirchhoff Triangle van Batoz, Bathe & Ho (1980):
 * drie knopen met elk een doorbuiging w en twee rotaties, kwadratische rotaties
 * langs de zijden en de Kirchhoff-voorwaarden op discrete punten. De
 * stijfheidsmatrix volgt met drie integratiepunten exact (B is lineair). Deze
 * implementatie is geschreven uit de formulering in het artikel.
 *
 * Model: nbx × nby velden van Lx × Ly, met een paal op elk snijpunt van het
 * raster, ook langs de buitenranden. De rand van het model is vrij. Elke paal
 * is een veer k (kN/m), verdeeld over de knopen binnen de paalkop (diameter d),
 * zodat het steunpuntsmoment niet oneindig wordt zoals bij een puntsteun. Elk
 * veld heeft een eigen gelijkmatige belasting (kN/m²): zo zijn volle belasting
 * en schaakbordbelasting dezelfde som.
 *
 * Eenheden: kale getallen in m, kN, kN/m² en kN/m; doorbuiging in mm en
 * momenten in kNm/m in de uitkomsten.
 *
 * Tekens: w positief in de richting van de belasting (omlaag); een moment is
 * positief bij trek aan de onderzijde (veld) en negatief bij trek aan de
 * bovenzijde (boven een paal). m_x is het moment dat spanningen in x geeft
 * (wapening in x), m_y idem in y.
 */

/** De invoer van een plaat op palen. */
export interface PlaatInvoer {
  /** Paalafstand in x en y (m). */
  lx: number;
  ly: number;
  /** Aantal velden in x en y. */
  nbx: number;
  nby: number;
  /** Plaatdikte (m), elasticiteitsmodulus (kN/m²) en dwarscontractie. */
  t: number;
  E: number;
  nu: number;
  /** Veerstijfheid per paal (kN/m) en diameter van de paalkop (m). */
  k: number;
  dKop: number;
  /** Elementen per veld langs elke zijde. */
  nEl: number;
  /** Belasting per veld (kN/m²): rij j (y) en kolom i (x), j = 0 onder. */
  q: number[][];
}

/** Een knoop met zijn uitkomsten. */
export interface PlaatKnoop {
  x: number;
  y: number;
  /** Doorbuiging (m). */
  w: number;
  mx: number;
  my: number;
  mxy: number;
}

export interface PlaatUitkomst {
  invoer: PlaatInvoer;
  /** Knopen per rij: index = j·(nx + 1) + i. */
  knopen: PlaatKnoop[];
  nx: number;
  ny: number;
  /** Driehoeken als drie knoopnummers. */
  driehoeken: [number, number, number][];
  /** Palen: rasterindex, plaats en reactie (kN). */
  palen: { i: number; j: number; x: number; y: number; R: number }[];
}

// ── Het element ─────────────────────────────────────────────────────────

interface Zijde {
  P: number;
  q: number;
  t: number;
  r: number;
}

/** De zijdeparameters van Batoz voor de zijde van knoop i naar knoop j. */
function zijde(xij: number, yij: number): Zijde {
  const l2 = xij * xij + yij * yij;
  return { P: (-6 * xij) / l2, q: (3 * xij * yij) / l2, t: (-6 * yij) / l2, r: (3 * yij * yij) / l2 };
}

/**
 * De krommingsmatrix B (3 × 9) op de oppervlaktecoördinaten (ξ, η) van een
 * driehoek met hoekpunten (x1, y1), (x2, y2), (x3, y3). Vrijheidsgraden per
 * knoop: w, θx = ∂w/∂y en θy = −∂w/∂x. Kromming κ = B·u met κx = −∂²w/∂x²,
 * κy = −∂²w/∂y² en κxy = −2·∂²w/∂x∂y; het moment is m = D·κ.
 */
function krommingsMatrix(x: number[], y: number[], xi: number, eta: number): number[][] {
  const x23 = x[1] - x[2], y23 = y[1] - y[2];
  const x31 = x[2] - x[0], y31 = y[2] - y[0];
  const x12 = x[0] - x[1], y12 = y[0] - y[1];
  const z4 = zijde(x23, y23);
  const z5 = zijde(x31, y31);
  const z6 = zijde(x12, y12);
  const [P4, P5, P6] = [z4.P, z5.P, z6.P];
  const [q4, q5, q6] = [z4.q, z5.q, z6.q];
  const [t4, t5, t6] = [z4.t, z5.t, z6.t];
  const [r4, r5, r6] = [z4.r, z5.r, z6.r];
  const a = 1 - 2 * xi;
  const b = 1 - 2 * eta;

  const HxXi = [
    P6 * a + (P5 - P6) * eta,
    q6 * a - (q5 + q6) * eta,
    -4 + 6 * (xi + eta) + r6 * a - eta * (r5 + r6),
    -P6 * a + eta * (P4 + P6),
    q6 * a - eta * (q6 - q4),
    -2 + 6 * xi + r6 * a + eta * (r4 - r6),
    -eta * (P5 + P4),
    eta * (q4 - q5),
    -eta * (r5 - r4),
  ];
  const HyXi = [
    t6 * a + eta * (t5 - t6),
    1 + r6 * a - eta * (r5 + r6),
    -q6 * a + eta * (q5 + q6),
    -t6 * a + eta * (t4 + t6),
    -1 + r6 * a + eta * (r4 - r6),
    -q6 * a - eta * (q4 - q6),
    -eta * (t4 + t5),
    eta * (r4 - r5),
    -eta * (q4 - q5),
  ];
  const HxEta = [
    -P5 * b - xi * (P6 - P5),
    q5 * b - xi * (q5 + q6),
    -4 + 6 * (xi + eta) + r5 * b - xi * (r5 + r6),
    xi * (P4 + P6),
    xi * (q4 - q6),
    -xi * (r6 - r4),
    P5 * b - xi * (P4 + P5),
    q5 * b + xi * (q4 - q5),
    -2 + 6 * eta + r5 * b + xi * (r4 - r5),
  ];
  const HyEta = [
    -t5 * b - xi * (t6 - t5),
    1 + r5 * b - xi * (r5 + r6),
    -q5 * b + xi * (q5 + q6),
    xi * (t4 + t6),
    xi * (r4 - r6),
    -xi * (q4 - q6),
    t5 * b - xi * (t4 + t5),
    -1 + r5 * b + xi * (r4 - r5),
    -q5 * b - xi * (q4 - q5),
  ];
  const tweeA = x31 * y12 - x12 * y31;
  const B: number[][] = [new Array(9), new Array(9), new Array(9)];
  for (let c = 0; c < 9; c++) {
    B[0][c] = (y31 * HxXi[c] + y12 * HxEta[c]) / tweeA;
    B[1][c] = (-x31 * HyXi[c] - x12 * HyEta[c]) / tweeA;
    B[2][c] = (-x31 * HxXi[c] - x12 * HxEta[c] + y31 * HyXi[c] + y12 * HyEta[c]) / tweeA;
  }
  return B;
}

/** De buigstijfheidsmatrix D (3 × 3) per meter breedte. */
function buigMatrix(E: number, t: number, nu: number): number[][] {
  const D = (E * t * t * t) / (12 * (1 - nu * nu));
  return [
    [D, D * nu, 0],
    [D * nu, D, 0],
    [0, 0, (D * (1 - nu)) / 2],
  ];
}

/** De elementstijfheid (9 × 9): drie integratiepunten, exact voor een lineaire B. */
export function dktStijfheid(x: number[], y: number[], D: number[][]): number[][] {
  const tweeA = (x[2] - x[0]) * (y[0] - y[1]) - (x[0] - x[1]) * (y[2] - y[0]);
  const K: number[][] = Array.from({ length: 9 }, () => new Array(9).fill(0));
  const punten: [number, number][] = [[1 / 6, 1 / 6], [2 / 3, 1 / 6], [1 / 6, 2 / 3]];
  for (const [xi, eta] of punten) {
    const B = krommingsMatrix(x, y, xi, eta);
    // DB = D·B (3 × 9)
    const DB = [0, 1, 2].map((r) => B[0].map((_, c) => D[r][0] * B[0][c] + D[r][1] * B[1][c] + D[r][2] * B[2][c]));
    const g = (Math.abs(tweeA) * 1) / 6; // gewicht 1/6 · 2A
    for (let i = 0; i < 9; i++) {
      for (let j = 0; j < 9; j++) {
        K[i][j] += g * (B[0][i] * DB[0][j] + B[1][i] * DB[1][j] + B[2][i] * DB[2][j]);
      }
    }
  }
  return K;
}

/** Momenten (kNm/m) in het zwaartepunt van een element uit zijn verplaatsingen. */
export function elementMoment(x: number[], y: number[], D: number[][], u: number[]): [number, number, number] {
  const B = krommingsMatrix(x, y, 1 / 3, 1 / 3);
  const k = [0, 1, 2].map((r) => B[r].reduce((s, b, c) => s + b * u[c], 0));
  return [
    D[0][0] * k[0] + D[0][1] * k[1],
    D[1][0] * k[0] + D[1][1] * k[1],
    D[2][2] * k[2],
  ];
}

// ── Bandsolver ──────────────────────────────────────────────────────────

/** Een symmetrische bandmatrix: alleen het onderste deel binnen de bandbreedte. */
class Band {
  readonly a: Float64Array;
  readonly n: number;
  readonly bw: number;
  constructor(n: number, bw: number) {
    this.n = n;
    this.bw = bw;
    this.a = new Float64Array(n * (bw + 1));
  }
  plus(i: number, j: number, v: number) {
    if (j > i) [i, j] = [j, i];
    this.a[i * (this.bw + 1) + (j - i + this.bw)] += v;
  }
  /** Lost K·u = f op met Cholesky (K positief definiet); f wordt de oplossing. */
  los(f: Float64Array): Float64Array {
    const { n, bw, a } = this;
    const w = bw + 1;
    for (let i = 0; i < n; i++) {
      const j0 = Math.max(0, i - bw);
      for (let j = j0; j <= i; j++) {
        let s = a[i * w + (j - i + bw)];
        const k0 = Math.max(j0, j - bw);
        for (let k = k0; k < j; k++) s -= a[i * w + (k - i + bw)] * a[j * w + (k - j + bw)];
        if (i === j) {
          if (!(s > 0)) throw new Error("plaat: de stijfheidsmatrix is niet positief: te weinig palen of een paal zonder veer");
          a[i * w + bw] = Math.sqrt(s);
        } else {
          a[i * w + (j - i + bw)] = s / a[j * w + bw];
        }
      }
    }
    const u = f;
    for (let i = 0; i < n; i++) {
      let s = u[i];
      for (let k = Math.max(0, i - bw); k < i; k++) s -= a[i * w + (k - i + bw)] * u[k];
      u[i] = s / a[i * w + bw];
    }
    for (let i = n - 1; i >= 0; i--) {
      let s = u[i];
      for (let k = i + 1; k <= Math.min(n - 1, i + bw); k++) s -= a[k * w + (i - k + bw)] * u[k];
      u[i] = s / a[i * w + bw];
    }
    return u;
  }
}

// ── Het model ───────────────────────────────────────────────────────────

const geheugen = new Map<string, PlaatUitkomst>();
const GEHEUGEN = 16;

/** Rekent een plaat op palen door; dezelfde invoer rekent maar één keer. */
export function plaatOplossing(inv: PlaatInvoer): PlaatUitkomst {
  const sleutel = JSON.stringify(inv);
  const eerder = geheugen.get(sleutel);
  if (eerder) return eerder;
  const uit = reken(inv);
  geheugen.set(sleutel, uit);
  while (geheugen.size > GEHEUGEN) geheugen.delete(geheugen.keys().next().value!);
  return uit;
}

function controleer(inv: PlaatInvoer) {
  const positief = (v: number, wat: string) => {
    if (!(Number.isFinite(v) && v > 0)) throw new Error(`plaat: ${wat} moet groter dan 0 zijn`);
  };
  positief(inv.lx, "Lx");
  positief(inv.ly, "Ly");
  positief(inv.t, "de dikte");
  positief(inv.E, "E");
  positief(inv.k, "de paalveer");
  if (!(Number.isInteger(inv.nbx) && inv.nbx >= 1 && inv.nbx <= 12)) throw new Error("plaat: 1 tot 12 velden in x");
  if (!(Number.isInteger(inv.nby) && inv.nby >= 1 && inv.nby <= 12)) throw new Error("plaat: 1 tot 12 velden in y");
  if (!(Number.isInteger(inv.nEl) && inv.nEl >= 2 && inv.nEl <= 24)) throw new Error("plaat: 2 tot 24 elementen per veld");
  if ((inv.nbx * inv.nEl + 1) * (inv.nby * inv.nEl + 1) > 40000) throw new Error("plaat: te veel knopen; minder velden of elementen per veld");
}

function reken(inv: PlaatInvoer): PlaatUitkomst {
  controleer(inv);
  const nx = inv.nbx * inv.nEl;
  const ny = inv.nby * inv.nEl;
  const hx = inv.lx / inv.nEl;
  const hy = inv.ly / inv.nEl;
  // Nummer langs de kortste kant, voor een smalle band.
  const kortX = nx <= ny;
  const knoopNr = (i: number, j: number) => (kortX ? j * (nx + 1) + i : i * (ny + 1) + j);
  const nKnopen = (nx + 1) * (ny + 1);
  const n = 3 * nKnopen;
  const bw = 3 * ((kortX ? nx : ny) + 2) + 2;
  const K = new Band(n, bw);
  const f = new Float64Array(n);
  const D = buigMatrix(inv.E, inv.t, inv.nu);

  // Driehoeken: elk rechthoekje in twee, de diagonaal om en om.
  const driehoeken: [number, number, number][] = [];
  const kwadraten: { tri: [number, number, number]; veld: [number, number] }[] = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const a = knoopNr(i, j), b = knoopNr(i + 1, j), c = knoopNr(i + 1, j + 1), d = knoopNr(i, j + 1);
      const veld: [number, number] = [Math.floor(i / inv.nEl), Math.floor(j / inv.nEl)];
      const paren: [number, number, number][] = (i + j) % 2 === 0 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]];
      for (const tri of paren) {
        driehoeken.push(tri);
        kwadraten.push({ tri, veld });
      }
    }
  }
  const xy = (nr: number): [number, number] => {
    const i = kortX ? nr % (nx + 1) : Math.floor(nr / (ny + 1));
    const j = kortX ? Math.floor(nr / (nx + 1)) : nr % (ny + 1);
    return [i * hx, j * hy];
  };

  for (const { tri, veld } of kwadraten) {
    const x = tri.map((k) => xy(k)[0]);
    const y = tri.map((k) => xy(k)[1]);
    const Ke = dktStijfheid(x, y, D);
    const dof = tri.flatMap((k) => [3 * k, 3 * k + 1, 3 * k + 2]);
    for (let a = 0; a < 9; a++) for (let b = 0; b <= a; b++) K.plus(dof[a], dof[b], Ke[a][b]);
    const q = inv.q[veld[1]]?.[veld[0]] ?? 0;
    const opp = Math.abs((x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0])) / 2;
    for (const k of tri) f[3 * k] += (q * opp) / 3;
  }

  // Palen: de veer verdeeld over de knopen binnen de paalkop (minstens de middelste).
  const r = Math.max(inv.dKop / 2, 0);
  const palen: { i: number; j: number; x: number; y: number; R: number; knopen: number[] }[] = [];
  for (let pj = 0; pj <= inv.nby; pj++) {
    for (let pi = 0; pi <= inv.nbx; pi++) {
      const x0 = pi * inv.lx, y0 = pj * inv.ly;
      const knopen: number[] = [];
      const ri = Math.ceil(r / hx), rj = Math.ceil(r / hy);
      for (let j = pj * inv.nEl - rj; j <= pj * inv.nEl + rj; j++) {
        for (let i = pi * inv.nEl - ri; i <= pi * inv.nEl + ri; i++) {
          if (i < 0 || j < 0 || i > nx || j > ny) continue;
          const dx = i * hx - x0, dy = j * hy - y0;
          if (dx * dx + dy * dy <= r * r + 1e-12) knopen.push(knoopNr(i, j));
        }
      }
      if (knopen.length === 0) knopen.push(knoopNr(pi * inv.nEl, pj * inv.nEl));
      for (const k of knopen) K.plus(3 * k, 3 * k, inv.k / knopen.length);
      palen.push({ i: pi, j: pj, x: x0, y: y0, R: 0, knopen });
    }
  }

  const u = K.los(f);

  // Momenten: per element in het zwaartepunt, per knoop het gemiddelde naar oppervlak.
  const som = new Float64Array(nKnopen * 3);
  const gew = new Float64Array(nKnopen);
  for (const tri of driehoeken) {
    const x = tri.map((k) => xy(k)[0]);
    const y = tri.map((k) => xy(k)[1]);
    const ue = tri.flatMap((k) => [u[3 * k], u[3 * k + 1], u[3 * k + 2]]);
    const m = elementMoment(x, y, D, ue);
    const opp = Math.abs((x[1] - x[0]) * (y[2] - y[0]) - (x[2] - x[0]) * (y[1] - y[0])) / 2;
    for (const k of tri) {
      som[3 * k] += m[0] * opp;
      som[3 * k + 1] += m[1] * opp;
      som[3 * k + 2] += m[2] * opp;
      gew[k] += opp;
    }
  }
  const knopen: PlaatKnoop[] = new Array(nKnopen);
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nx; i++) {
      const nr = knoopNr(i, j);
      const g = gew[nr] || 1;
      knopen[j * (nx + 1) + i] = { x: i * hx, y: j * hy, w: u[3 * nr], mx: som[3 * nr] / g, my: som[3 * nr + 1] / g, mxy: som[3 * nr + 2] / g };
    }
  }
  for (const p of palen) p.R = p.knopen.reduce((s, k) => s + (inv.k / p.knopen.length) * u[3 * k], 0);

  return {
    invoer: inv,
    knopen,
    nx,
    ny,
    // De driehoeken in de nummering van `knopen` (per rij).
    driehoeken: driehoeken.map((tri) => tri.map((k) => {
      const [x, y] = xy(k);
      return Math.round(y / hy) * (nx + 1) + Math.round(x / hx);
    }) as [number, number, number]),
    palen: palen.map(({ i, j, x, y, R }) => ({ i, j, x, y, R })),
  };
}

// ── Samenvatting voor het rekenblad ──────────────────────────────────────

/**
 * De maatgevende waarden van een uitkomst, binnen de binnenste velden (zonder de
 * buitenste rij velden als er minstens drie zijn, zodat de vrije modelrand niet
 * telt): [m_x,veld, m_y,veld, m_x,steun, m_y,steun, m_x,ks, m_y,ks, w_max, R_max,
 * R_midden]. Steunmomenten positief als getal (trek boven). m_ks is het
 * gemiddelde steunmoment over een kolomstrook van een halve veldbreedte rond de
 * paal (NEN-EN 1992-1-1 bijlage I), op de lijn door de paal.
 */
export function plaatSamenvatting(u: PlaatUitkomst): number[] {
  const inv = u.invoer;
  const binnenX = inv.nbx >= 3 ? [1, inv.nbx - 1] : [0, inv.nbx];
  const binnenY = inv.nby >= 3 ? [1, inv.nby - 1] : [0, inv.nby];
  const x0 = binnenX[0] * inv.lx, x1 = binnenX[1] * inv.lx;
  const y0 = binnenY[0] * inv.ly, y1 = binnenY[1] * inv.ly;
  const binnen = (k: PlaatKnoop) => k.x >= x0 - 1e-9 && k.x <= x1 + 1e-9 && k.y >= y0 - 1e-9 && k.y <= y1 + 1e-9;
  let mxV = 0, myV = 0, mxS = 0, myS = 0, wMax = 0;
  for (const k of u.knopen) {
    wMax = Math.max(wMax, k.w);
    if (!binnen(k)) continue;
    mxV = Math.max(mxV, k.mx);
    myV = Math.max(myV, k.my);
    mxS = Math.min(mxS, k.mx);
    myS = Math.min(myS, k.my);
  }
  // Kolomstrook: gemiddelde over |y − y_p| ≤ Ly/4 op de lijn x = x_p (m_x), en andersom (m_y).
  const ks = (p: { i: number; j: number }, richting: "x" | "y") => {
    const nEl = inv.nEl;
    let s = 0, n = 0;
    if (richting === "x") {
      const i = p.i * nEl;
      for (let j = Math.max(0, p.j * nEl - nEl / 4); j <= Math.min(u.ny, p.j * nEl + nEl / 4); j++) {
        s += u.knopen[Math.round(j) * (u.nx + 1) + i].mx;
        n++;
      }
    } else {
      const j = p.j * nEl;
      for (let i = Math.max(0, p.i * nEl - nEl / 4); i <= Math.min(u.nx, p.i * nEl + nEl / 4); i++) {
        s += u.knopen[j * (u.nx + 1) + Math.round(i)].my;
        n++;
      }
    }
    return n ? s / n : 0;
  };
  const binnenPalen = u.palen.filter((p) => p.i >= binnenX[0] && p.i <= binnenX[1] && p.j >= binnenY[0] && p.j <= binnenY[1]);
  const palenVoorKs = binnenPalen.length ? binnenPalen : u.palen;
  let mxKs = 0, myKs = 0;
  for (const p of palenVoorKs) {
    mxKs = Math.min(mxKs, ks(p, "x"));
    myKs = Math.min(myKs, ks(p, "y"));
  }
  const rMax = Math.max(...u.palen.map((p) => p.R));
  const mi = Math.round(inv.nbx / 2), mj = Math.round(inv.nby / 2);
  const midden = u.palen.find((p) => p.i === mi && p.j === mj)?.R ?? rMax;
  return [mxV, myV, -mxS, -myS, -mxKs, -myKs, wMax * 1000, rMax, midden];
}

/** De doorbuiging (mm) op een punt (x, y) in m, lineair binnen het rasterhokje. */
export function plaatDoorbuiging(u: PlaatUitkomst, x: number, y: number): number {
  const inv = u.invoer;
  const hx = inv.lx / inv.nEl, hy = inv.ly / inv.nEl;
  const fi = Math.min(Math.max(x / hx, 0), u.nx), fj = Math.min(Math.max(y / hy, 0), u.ny);
  const i = Math.min(Math.floor(fi), u.nx - 1), j = Math.min(Math.floor(fj), u.ny - 1);
  const s = fi - i, t = fj - j;
  const w = (a: number, b: number) => u.knopen[b * (u.nx + 1) + a].w;
  return 1000 * ((1 - s) * (1 - t) * w(i, j) + s * (1 - t) * w(i + 1, j) + s * t * w(i + 1, j + 1) + (1 - s) * t * w(i, j + 1));
}

/**
 * Een kleurenbeeld van de plaat als SVG-elementen: elke driehoek gevuld naar de
 * waarde van `grootheid` (1 = w, 2 = m_x, 3 = m_y), met de palen als stippen.
 * (x0, y0) is de linkeronderhoek in px, `schaal` px per m; y wijst in beeld
 * omhoog. Rood is trek boven (negatief moment), blauw trek onder.
 */
export function plaatSvg(u: PlaatUitkomst, grootheid: number, x0: number, y0: number, schaal: number): string {
  const waarde = (k: PlaatKnoop) => (grootheid === 1 ? k.w * 1000 : grootheid === 2 ? k.mx : k.my);
  let max = 0;
  for (const k of u.knopen) max = Math.max(max, Math.abs(waarde(k)));
  if (max === 0) max = 1;
  const kleur = (v: number) => {
    const f = Math.max(-1, Math.min(1, v / max));
    // Doorbuiging: van wit naar blauw. Moment: rood (negatief) – wit – blauw (positief).
    if (grootheid === 1) return mix([255, 255, 255], [37, 99, 235], Math.abs(f));
    return f >= 0 ? mix([255, 255, 255], [37, 99, 235], f) : mix([255, 255, 255], [220, 38, 38], -f);
  };
  const px = (k: PlaatKnoop) => `${(x0 + k.x * schaal).toFixed(1)},${(y0 - k.y * schaal).toFixed(1)}`;
  const delen: string[] = [];
  for (const tri of u.driehoeken) {
    const [a, b, c] = tri.map((n) => u.knopen[n]);
    const v = (waarde(a) + waarde(b) + waarde(c)) / 3;
    const kl = kleur(v);
    delen.push(`<polygon points="${px(a)} ${px(b)} ${px(c)}" fill="${kl}" stroke="${kl}" stroke-width="0.4"/>`);
  }
  for (const p of u.palen) {
    delen.push(`<circle cx="${(x0 + p.x * schaal).toFixed(1)}" cy="${(y0 - p.y * schaal).toFixed(1)}" r="2.6" fill="#334155"/>`);
  }
  return delen.join("");
}

function mix(a: number[], b: number[], f: number): string {
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * f));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}
