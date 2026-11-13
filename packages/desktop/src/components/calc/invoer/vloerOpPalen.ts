/**
 * Het beeld bij de bedrijfsvloer op palen: het model uit de invoer en de tekening van de
 * plattegrond en de doorsnede (VloerOpPalenBeeld.tsx).
 *
 * De module komt uit de modulebibliotheek en staat niet in de app. Het beeld bindt aan de
 * namen van haar invoervelden en bouwt het raster op zoals het blad dat doet: n × n
 * velden met de vloerrand rondom, een ponskop boven elke paal en stroken over de
 * paalrijen, elk binnen de vloer gehouden. De eenheid en de standaardwaarde van een maat
 * komen uit de tekst van het blad (`standaardInvoer`), niet uit dit bestand: wijzigt de
 * module een standaardwaarde, dan volgt het beeld.
 *
 * Het beeld rekent niets na: de momenten en de wapening staan alleen in het blad.
 *
 * Zuiver, zonder React: scripts/check-invoerpaneel.mjs laadt dit in Node.
 */
import { toonInvoer } from "@ifc-calc/core";
import type { Standaard } from "./velden.ts";

/** Het `templateId` van een blad uit deze module: het id van de module in de bibliotheek. */
export const VLOER_OP_PALEN = "vloer-op-palen";

/** Zonder deze maten als invoer is het niet (meer) het blad waar het beeld bij hoort. */
export const VLOER_VEREIST: readonly string[] = ["L_x", "L_y", "a_r", "h"];

const LENGTES = ["L_x", "L_y", "a_r", "h", "d_kop", "b_k", "t_k", "b_s", "t_s"];
const GETALLEN = ["n_v", "ponskop", "stroken"];

/** Een invoer van het blad als getal, in de eenheid van het blad. Geen getal: NaN. */
export interface Invoerwaarde {
  waarde: number;
  eenheid: string;
}
export type VloerInvoer = Record<string, Invoerwaarde | undefined>;

/** Een rechthoek: in het model in mm met de oorsprong linksonder, in een tekening in px. */
export interface Vak {
  x: number;
  y: number;
  b: number;
  h: number;
}

/** De vloer zoals het blad hem modelleert, in mm. */
export interface VloerModel {
  /** Velden per richting, 3 tot 5. */
  n: number;
  Lx: number;
  Ly: number;
  /** De buitenste paalrij tot de vloerrand. */
  ar: number;
  h: number;
  dKop: number;
  kop: boolean;
  bk: number;
  /** De dikte bij de ponskop: nooit dunner dan de vloer of een strook eronder. */
  tk: number;
  /** Stroken langs x (over elke paalrij) en langs y. */
  stX: boolean;
  stY: boolean;
  bs: number;
  /** De dikte van een strook: nooit dunner dan de vloer. */
  ts: number;
  Bx: number;
  By: number;
  /** Rij voor rij, de onderste eerst: zoals het blad de veren telt. */
  palen: { x: number; y: number }[];
  koppen: Vak[];
  /** Eerst de stroken langs x, dan die langs y. */
  stroken: Vak[];
}

const KAAL_GETAL = /^[-+]?(\d+([.,]\d*)?|[.,]\d+)([eE][-+]?\d+)?$/;
const getal = (tekst: string) => (KAAL_GETAL.test(tekst.trim()) ? parseFloat(tekst.trim().replace(",", ".")) : NaN);

/**
 * De invoer waar het beeld aan bindt. `standaard` is wat de tekst van het blad zegt
 * (`standaardInvoer`), `lees` geeft wat er voor een naam is ingevuld, in de eenheid van
 * het blad. Een leeg veld rekent met zijn standaardwaarde, zoals in het blad; een naam
 * die het blad niet heeft, ontbreekt.
 */
export function vloerInvoer(standaard: Readonly<Record<string, Standaard | undefined>>, lees: (naam: string) => string | undefined): VloerInvoer {
  const uit: VloerInvoer = {};
  for (const naam of [...LENGTES, ...GETALLEN]) {
    const st = standaard[naam];
    if (!st) continue;
    const ingevuld = lees(naam);
    const tekst = ingevuld === undefined || ingevuld.trim() === "" ? st.beginwaarde : ingevuld;
    uit[naam] = { waarde: getal(tekst), eenheid: st.eenheid };
  }
  return uit;
}

/** Een maat in mm; een eenheid die geen lengte is, blijft het getal. */
function inMm(v: Invoerwaarde | undefined): number {
  if (!v || !Number.isFinite(v.waarde)) return NaN;
  if (!v.eenheid || v.eenheid === "mm") return v.waarde;
  return Number(toonInvoer(String(v.waarde), v.eenheid, "mm"));
}

const positief = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);

/**
 * Het model van de vloer, of `null` zolang een paalafstand of de vloerdikte geen positief
 * getal is. Volgt de regels van het blad:
 *   n   = round(min(max(n_v; 3); 5))
 *   B   = n·L + 2·a_r
 *   t_s = max(t_s; h),  t_k = max(t_k; h; t_s bij stroken)
 */
export function vloerModel(invoer: VloerInvoer): VloerModel | null {
  const Lx = inMm(invoer.L_x);
  const Ly = inMm(invoer.L_y);
  const h = inMm(invoer.h);
  const ar = invoer.a_r ? inMm(invoer.a_r) : 0;
  if (![Lx, Ly, h].every((v) => Number.isFinite(v) && v > 0) || !Number.isFinite(ar) || ar < 0) return null;
  const nv = invoer.n_v?.waarde;
  const n = nv !== undefined && Number.isFinite(nv) ? Math.round(Math.min(Math.max(nv, 3), 5)) : 4;
  const bk = positief(inMm(invoer.b_k));
  const bs = positief(inMm(invoer.b_s));
  const kop = Math.round(invoer.ponskop?.waarde ?? 0) === 1 && bk > 0;
  const keuze = bs > 0 ? Math.round(invoer.stroken?.waarde ?? 0) : 0;
  const stX = keuze === 1 || keuze === 3;
  const stY = keuze === 2 || keuze === 3;
  const ts = Math.max(positief(inMm(invoer.t_s)), h);
  const tk = Math.max(positief(inMm(invoer.t_k)), h, stX || stY ? ts : h);
  const Bx = n * Lx + 2 * ar;
  const By = n * Ly + 2 * ar;

  const palen: { x: number; y: number }[] = [];
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) palen.push({ x: ar + i * Lx, y: ar + j * Ly });
  // Een band om een as, binnen de vloer gehouden.
  const band = (as: number, breedte: number, tot: number): [number, number] => [Math.max(as - breedte / 2, 0), Math.min(as + breedte / 2, tot)];
  const koppen: Vak[] = kop
    ? palen.map((p) => {
        const [x0, x1] = band(p.x, bk, Bx);
        const [y0, y1] = band(p.y, bk, By);
        return { x: x0, y: y0, b: x1 - x0, h: y1 - y0 };
      })
    : [];
  const stroken: Vak[] = [];
  if (stX) {
    for (let j = 0; j <= n; j++) {
      const [y0, y1] = band(ar + j * Ly, bs, By);
      stroken.push({ x: 0, y: y0, b: Bx, h: y1 - y0 });
    }
  }
  if (stY) {
    for (let i = 0; i <= n; i++) {
      const [x0, x1] = band(ar + i * Lx, bs, Bx);
      stroken.push({ x: x0, y: 0, b: x1 - x0, h: By });
    }
  }
  return { n, Lx, Ly, ar, h, dKop: positief(inMm(invoer.d_kop)), kop, bk, tk, stX, stY, bs, ts, Bx, By, palen, koppen, stroken };
}

// ── De tekening ─────────────────────────────────────────────────────────────

/** Een klikbare maat: het veld van het blad waar hij bij hoort, met zijn plek in de tekening. */
export interface Maat {
  naam: string;
  /** Wat er voor het getal staat ("Lx"). */
  label: string;
  /** De waarde en de eenheid van het veld in het blad. */
  waarde: number;
  eenheid: string;
  x: number;
  y: number;
  dec: number;
  stap: number;
}

/** Een maatlijn: liggend van x = `van` tot `tot` op y = `op`, staand andersom; `ext` is waar de hulplijnen eindigen. */
export interface Maatlijn {
  ligt: boolean;
  van: number;
  tot: number;
  op: number;
  ext: number;
}

const LABELS: Readonly<Record<string, string>> = {
  L_x: "Lx", L_y: "Ly", a_r: "ar", n_v: "n", h: "h", d_kop: "Ø", b_k: "bk", t_k: "tk", b_s: "bs", t_s: "ts",
};

/** Een maat bij zijn veld; `null` als het blad dat veld niet heeft. */
function maatVan(invoer: VloerInvoer, naam: string, x: number, y: number): Maat | null {
  const v = invoer[naam];
  if (!v) return null;
  const inMeter = v.eenheid === "m";
  return {
    naam,
    label: LABELS[naam] ?? naam,
    waarde: v.waarde,
    eenheid: v.eenheid,
    x,
    y,
    dec: inMeter ? 2 : 0,
    stap: inMeter ? 0.1 : v.eenheid === "" ? 1 : 10,
  };
}

const aanwezig = <T>(lijst: (T | null)[]): T[] => lijst.filter((x): x is T => x !== null);

/**
 * Hoe de plattegrond en de doorsnede het vak van het beeld delen: naast elkaar in een
 * liggend vak (het paneel van 518 px), onder elkaar in een hoge kolom.
 */
export function beeldIndeling(b: number, h: number): { naast: boolean; plattegrond: { b: number; h: number }; doorsnede: { b: number; h: number } } {
  const tussen = 12;
  if (b >= 1.5 * h) {
    // De plattegrond is ongeveer vierkant; de doorsnede heeft de breedte nodig voor haar maten.
    const pb = Math.max(220, Math.min(Math.round(h + 20), Math.floor((b - tussen) / 2)));
    return { naast: true, plattegrond: { b: pb, h }, doorsnede: { b: Math.max(0, b - tussen - pb), h } };
  }
  const ph = Math.round((h - tussen) * 0.58);
  return { naast: false, plattegrond: { b, h: ph }, doorsnede: { b, h: Math.max(0, h - tussen - ph) } };
}

export interface Plattegrond {
  breedte: number;
  hoogte: number;
  /** px per mm. */
  schaal: number;
  vloer: Vak;
  stroken: Vak[];
  koppen: Vak[];
  palen: { x: number; y: number; r: number }[];
  lijnen: Maatlijn[];
  maten: Maat[];
}

/**
 * De plattegrond van het rekenmodel in een vak van `breedte` × `hoogte` px: de vloerrand,
 * de stroken, de ponskoppen en de palen op schaal, met de paalafstanden, de rand en het
 * aantal velden als klikbare maat.
 */
export function tekenPlattegrond(m: VloerModel, invoer: VloerInvoer, breedte: number, hoogte: number): Plattegrond {
  // Links de maat L_y met zijn getal, onder L_x, boven de rand en het aantal velden. Een
  // paalveld is op deze schaal smaller dan zijn getal: dat staat daarom naast de maatlijn.
  const links = 72, rechts = 10, boven = 26, onder = 32;
  const ruimteB = Math.max(40, breedte - links - rechts);
  const ruimteH = Math.max(40, hoogte - boven - onder);
  const schaal = Math.min(ruimteB / m.Bx, ruimteH / m.By);
  const vb = m.Bx * schaal;
  const vh = m.By * schaal;
  const x0 = links + (ruimteB - vb) / 2;
  const y0 = boven + (ruimteH - vh) / 2;
  const X = (x: number) => x0 + x * schaal;
  const Y = (y: number) => y0 + (m.By - y) * schaal;
  const vak = (r: Vak): Vak => ({ x: X(r.x), y: Y(r.y + r.h), b: r.b * schaal, h: r.h * schaal });

  const lijnen: Maatlijn[] = [
    { ligt: true, van: X(m.ar), tot: X(m.ar + m.Lx), op: y0 + vh + 9, ext: y0 + vh },
    { ligt: false, van: Y(m.ar + m.Ly), tot: Y(m.ar), op: x0 - 10, ext: x0 },
  ];
  if (m.ar > 0) lijnen.push({ ligt: true, van: X(0), tot: X(m.ar), op: y0 - 10, ext: y0 });
  const maten = aanwezig([
    maatVan(invoer, "L_x", (X(m.ar) + X(m.ar + m.Lx)) / 2, y0 + vh + 22),
    maatVan(invoer, "L_y", x0 - 44, (Y(m.ar) + Y(m.ar + m.Ly)) / 2),
    // De rand is op deze schaal een paar pixels: het getal staat ernaast.
    maatVan(invoer, "a_r", Math.min(X(m.ar) + 30, x0 + vb / 2 - 4), y0 - 10),
    maatVan(invoer, "n_v", x0 + vb - 18, y0 - 10),
  ]);
  return {
    breedte,
    hoogte,
    schaal,
    vloer: { x: x0, y: y0, b: vb, h: vh },
    stroken: m.stroken.map(vak),
    koppen: m.koppen.map(vak),
    palen: m.palen.map((p) => ({ x: X(p.x), y: Y(p.y), r: Math.max(1.8, (m.dKop * schaal) / 2) })),
    lijnen,
    maten,
  };
}

export interface Doorsnede {
  breedte: number;
  hoogte: number;
  /** px per mm. */
  schaal: number;
  /** De omtrek van het beton: de vloer met de verdikkingen eronder. */
  beton: { x: number; y: number }[];
  /** De strook dwars op de snede, als vlak onder de vloer. */
  strook: Vak | null;
  /** Bij stroken in twee richtingen: de strook die in de snede meeloopt. */
  strookLangs: Vak | null;
  kop: Vak | null;
  paal: Vak;
  /** De x van de breuklijnen links en rechts: de vloer loopt daar door. */
  breuk: [number, number];
  lijnen: Maatlijn[];
  maten: Maat[];
}

/**
 * De doorsnede over een paalrij bij een binnenpaal, dwars op de strook: de vloer, de
 * strook en de ponskop eronder en de paalkop, met hun diktes en breedtes als klikbare
 * maat. De bovenkant van de vloer is vlak. Een stuk rond de paal, niet de hele vloer: op
 * de schaal van de plattegrond is een vloer van 250 mm een paar pixels.
 */
export function tekenDoorsnede(m: VloerModel, invoer: VloerInvoer, breedte: number, hoogte: number): Doorsnede {
  const dwars = m.stX || m.stY;
  const langs = m.stX && m.stY;
  const wk = m.kop ? m.bk : 0;
  const ws = dwars ? m.bs : 0;
  // Het venster: iets breder dan de breedste verdikking.
  const half = Math.max(wk, ws, 1.5 * m.dKop, 600) * 0.68;
  const dikte = (x: number) => Math.max(m.h, langs ? m.ts : 0, ws > 0 && Math.abs(x) <= ws / 2 ? m.ts : 0, wk > 0 && Math.abs(x) <= wk / 2 ? m.tk : 0);
  const T = Math.max(m.h, dwars ? m.ts : 0, m.kop ? m.tk : 0);
  const paalLengte = Math.max(0.8 * T, 250);

  // Links de vloerdikte, rechts de diktes van strook en kop, boven hun breedtes, onder de
  // paalkop. De getallen van de diktes staan naast hun maatlijn: de vloer is daar te dun voor.
  const nRechts = (dwars ? 1 : 0) + (m.kop ? 1 : 0);
  const links = 56, rechts = [12, 70, 80][nRechts], boven = 12 + 20 * nRechts, onder = 32;
  const ruimteB = Math.max(40, breedte - links - rechts);
  const ruimteH = Math.max(40, hoogte - boven - onder);
  const schaal = Math.min(ruimteB / (2 * half), ruimteH / (T + paalLengte), 0.3);
  const cx = links + ruimteB / 2;
  const top = boven + (ruimteH - (T + paalLengte) * schaal) / 2;
  const X = (x: number) => cx + x * schaal;
  const Y = (d: number) => top + d * schaal;
  const xL = X(-half);
  const xR = X(half);

  // De onderkant van rechts naar links, met een trede op elke rand van een verdikking.
  const randen = [...new Set([-half, -ws / 2, -wk / 2, wk / 2, ws / 2, half])].filter((x) => x >= -half && x <= half).sort((a, b) => b - a);
  const beton = [{ x: xL, y: top }, { x: xR, y: top }];
  for (let i = 0; i < randen.length - 1; i++) {
    const d = dikte((randen[i] + randen[i + 1]) / 2);
    beton.push({ x: X(randen[i]), y: Y(d) }, { x: X(randen[i + 1]), y: Y(d) });
  }

  const onderVloer = (b: number, t: number): Vak => ({ x: X(-b / 2), y: Y(m.h), b: b * schaal, h: (t - m.h) * schaal });
  const paal: Vak = { x: X(-m.dKop / 2), y: Y(dikte(0)), b: m.dKop * schaal, h: (T - dikte(0) + paalLengte) * schaal };

  const lijnen: Maatlijn[] = [{ ligt: false, van: top, tot: Y(m.h), op: xL - 10, ext: xL }];
  const maten: (Maat | null)[] = [maatVan(invoer, "h", xL - 35, Y(m.h / 2))];
  // Een maatlijn meet wat er is ingevuld. De tekening toont de dikte waarmee het blad rekent:
  // een kop of strook die dunner is ingevuld dan de vloer of de strook eronder, telt als die.
  const tsMaat = Math.min(positief(inMm(invoer.t_s)) || m.ts, m.ts);
  const tkMaat = Math.min(positief(inMm(invoer.t_k)) || m.tk, m.tk);
  // Twee diktes rechts: de maatlijnen naast elkaar, de getallen boven elkaar.
  const xGetal = xR + (nRechts === 2 ? 50 : 40);
  const verschuif = nRechts === 2 ? 9 : 0;
  let k = 0;
  if (dwars) {
    lijnen.push({ ligt: false, van: top, tot: Y(tsMaat), op: xR + 10, ext: X(ws / 2) });
    lijnen.push({ ligt: true, van: X(-ws / 2), tot: X(ws / 2), op: top - 14, ext: top });
    maten.push(maatVan(invoer, "t_s", xGetal, Y(tsMaat / 2) - verschuif), maatVan(invoer, "b_s", cx, top - 14));
    k = 1;
  }
  if (m.kop) {
    lijnen.push({ ligt: false, van: top, tot: Y(tkMaat), op: xR + 10 + 10 * k, ext: X(wk / 2) });
    lijnen.push({ ligt: true, van: X(-wk / 2), tot: X(wk / 2), op: top - 14 - 20 * k, ext: top });
    maten.push(maatVan(invoer, "t_k", xGetal, Y(tkMaat / 2) + verschuif), maatVan(invoer, "b_k", cx, top - 14 - 20 * k));
  }
  const paalOnder = paal.y + paal.h;
  if (m.dKop > 0) lijnen.push({ ligt: true, van: paal.x, tot: paal.x + paal.b, op: paalOnder + 9, ext: paalOnder });
  maten.push(maatVan(invoer, "d_kop", cx, paalOnder + 22));

  return {
    breedte,
    hoogte,
    schaal,
    beton,
    strook: dwars && m.ts > m.h ? onderVloer(ws, m.ts) : null,
    strookLangs: langs && m.ts > m.h ? { x: xL, y: Y(m.h), b: xR - xL, h: (m.ts - m.h) * schaal } : null,
    kop: m.kop && m.tk > m.h ? onderVloer(wk, m.tk) : null,
    paal,
    breuk: [xL, xR],
    lijnen,
    maten: aanwezig(maten),
  };
}
