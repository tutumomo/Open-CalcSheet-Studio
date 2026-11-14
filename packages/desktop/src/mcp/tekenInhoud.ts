/**
 * Een tekenblad lezen en als SVG of DXF wegschrijven
 * (docs/OCSS_TW_開發需求規格.md, P2-12).
 *
 * De maten van een tekening mogen aan het blad hangen: een maat `p.x.e = "L/2"`
 * of een tekst `{{R_paal}}` volgt de uitkomst van het rekenblad. Dat is hetzelfde
 * mechanisme als in de editor (components/tekenen/waarden.ts): de uitdrukkingen
 * worden in het blad uitgerekend en de tekening wordt daarmee opgebouwd.
 *
 * De coördinaten van een view op een tekenblad zijn millimeters in het echt
 * (components/tekenen/TekenVlak.tsx); de uitvoer zegt dat ook: SVG in mm, DXF met
 * `$INSUNITS` 4 (mm) of 6 (m) en dezelfde maat als de tekening. In DXF staat de
 * y-as omhoog, zoals DXF het wil; in SVG omlaag, zoals het model het tekent.
 *
 * Wat geen lijn, cirkel of tekst is (een parametrisch symbool, een boog) gaat niet
 * als losse DXF-entiteit mee: die zou verkeerd getekend worden. Ze worden geteld
 * en gemeld (`skipped`), zodat de uitvoer niet stil onvolledig is.
 */
import { evaluate, parse, type EvalOpties, type ParseOptions } from "@ifc-calc/core";
import { beeldVan } from "../components/tekenen/code.ts";
import {
  koppelingen,
  schoonUitdrukking,
  waardeVan,
  type Maat,
  type Opgelost,
  type Tekening,
  type Vorm,
} from "../components/tekenen/model.ts";
import type { TekenVel, TekenView } from "../store/tekenBlad.ts";

/** Eén koppeling van een tekening, met wat het blad ervoor geeft. */
export interface TekenBinding {
  view: string;
  expression: string;
  /** `maat`: een maat of een mm-maat; `tekst`: `{{…}}` in een tekst; `waarde`: een lastwaarde van een symbool. */
  kind: "maat" | "tekst" | "waarde";
  /** De waarde zonder eenheid, of null als het blad er niets voor geeft. */
  value: number | null;
  /** De uitkomst zoals het blad hem toont (`450 kN`, `#DC2626`). */
  text: string | null;
  unit: string | null;
  error?: string;
}

export interface TekenInhoud {
  sheet: { format: string; orientation: string; widthMm: number; heightMm: number };
  views: {
    id: string;
    title: string;
    scale: number;
    elements: number;
    kinds: Record<string, number>;
    bindings: TekenBinding[];
    bounds: { x: number; y: number; width: number; height: number } | null;
  }[];
  /** Alle koppelingen van het hele blad, zonder dubbelen. */
  bindings: { expression: string; value: number | null; text: string | null; unit: string | null; error?: string }[];
  /** Uitdrukkingen die het blad niet kon uitrekenen. */
  unbound: { expression: string; error: string }[];
}

/** De tekening van een view als `Tekening`, zodat de koppelingen en het beeld dezelfde weg gaan. */
function alsTekening(view: TekenView): Tekening {
  return {
    naam: view.id,
    x0: 0,
    y0: 0,
    breed: { v: 0 },
    hoog: { v: 0 },
    elementen: view.elementen,
    wortel: [],
    eigenStijl: true,
  };
}

/** De uitdrukkingen van een view, met hun soort. */
function koppelingenVan(view: TekenView): { expression: string; kind: TekenBinding["kind"] }[] {
  const uit = new Map<string, TekenBinding["kind"]>();
  const neem = (e: string | undefined, kind: TekenBinding["kind"]) => {
    const s = schoonUitdrukking(e ?? "");
    if (s && !uit.has(s)) uit.set(s, kind);
  };
  const maat = (m: Maat | undefined) => neem(m?.e, "maat");
  maat(view.elementen.length ? undefined : undefined);
  for (const el of view.elementen as Vorm[]) {
    for (const m of Object.values(el.p ?? {})) maat(m);
    const teksten = (...s: (string | null | undefined)[]) => {
      for (const x of s) for (const m of (x ?? "").matchAll(/\{\{([^{}]+)\}\}/g)) neem(m[1], "tekst");
    };
    teksten(el.tekst, el.lijn, el.vulling, el.stijlRest, ...(el.extra ?? []).map(([, w]) => w));
    for (const w of Object.values(el.o ?? {})) {
      const s = (w ?? "").trim();
      if (s && !/^\s*[-+]?\d+(?:[.,]\d+)?\s*$/.test(s) && !s.includes("{{")) neem(s, "waarde");
    }
  }
  return [...uit].map(([expression, kind]) => ({ expression, kind }));
}

/** De uitkomsten van de uitdrukkingen, uit het blad zelf. */
export function rekenKoppelingen(
  uitdrukkingen: readonly string[],
  bron: string,
  waarden: Record<string, string>,
  scope: Record<string, unknown>,
  opties: ParseOptions,
  evalOpties: EvalOpties,
): Map<string, { value: number | null; text: string | null; unit: string | null; error?: string }> {
  const uit = new Map<string, { value: number | null; text: string | null; unit: string | null; error?: string }>();
  if (uitdrukkingen.length === 0) return uit;
  // Het blad eerst: de koppelingen leven van de namen erin. Eén fout regel valt niet
  // op de rest: de kern rekent elke regel apart door.
  const regels = [bron, ...[...uitdrukkingen].map((e, i) => `__bind_${i} = ${e}`)].join("\n");
  let nodes;
  try {
    nodes = evaluate(parse(regels, opties), waarden, scope, evalOpties);
  } catch (err) {
    for (const e of uitdrukkingen) uit.set(e, { value: null, text: null, unit: null, error: (err as Error).message });
    return uit;
  }
  for (const n of nodes) {
    if (n.type !== "assignment" || !n.name.startsWith("__bind_")) continue;
    const i = Number(n.name.slice("__bind_".length));
    const e = uitdrukkingen[i];
    if (e === undefined) continue;
    const result = String(n.result);
    if (result.startsWith("Error")) {
      uit.set(e, { value: null, text: null, unit: null, error: result.replace(/__bind_\d+/g, "").replace(/^Error:\s*/, "") });
      continue;
    }
    uit.set(e, {
      value: typeof n.waarde === "number" && Number.isFinite(n.waarde) ? n.waarde : null,
      text: result,
      unit: n.unit ?? null,
    });
  }
  for (const e of uitdrukkingen) if (!uit.has(e)) uit.set(e, { value: null, text: null, unit: null, error: "not calculated" });
  return uit;
}

/** De opgeloste koppelingen als functie voor het tekenen (`Opgelost`). */
function oplosser(waarden: ReadonlyMap<string, { value: number | null; text?: string | null }>): Opgelost {
  return (e: string) => {
    const w = waarden.get(schoonUitdrukking(e));
    return w && w.value !== null ? w.value : undefined;
  };
}

/** De grenzen van een view in mm: waar de vormen staan, met een kleine marge. */
export function grenzenVan(view: TekenView, opgelost: Opgelost): { x: number; y: number; width: number; height: number } | null {
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  const punt = (x: number, y: number) => {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    x0 = Math.min(x0, x);
    y0 = Math.min(y0, y);
    x1 = Math.max(x1, x);
    y1 = Math.max(y1, y);
  };
  for (const el of view.elementen as Vorm[]) {
    const w = (k: string) => waardeVan(el.p?.[k], opgelost);
    switch (el.soort) {
      case "lijn":
      case "pijl":
      case "maat":
        punt(w("x1"), w("y1"));
        punt(w("x2"), w("y2"));
        break;
      case "rechthoek":
        punt(w("x"), w("y"));
        punt(w("x") + w("w"), w("y") + w("h"));
        break;
      case "cirkel":
        punt(w("cx") - w("r"), w("cy") - w("r"));
        punt(w("cx") + w("r"), w("cy") + w("r"));
        break;
      case "polylijn":
        for (let i = 0; el.p?.[`x${i}`]; i++) punt(w(`x${i}`), w(`y${i}`));
        break;
      case "tekst":
        punt(w("x"), w("y") - (el.grootte ?? 14));
        punt(w("x") + (el.tekst?.length ?? 0) * (el.grootte ?? 14) * 0.6, w("y"));
        break;
      case "boog":
        punt(w("cx") - w("r"), w("cy") - w("r"));
        punt(w("cx") + w("r"), w("cy") + w("r"));
        break;
      case "symbool":
        for (const m of Object.values(el.p ?? {})) if (m && typeof m.v === "number") punt(m.v, m.v);
        break;
    }
  }
  if (!Number.isFinite(x0) || !Number.isFinite(y0)) return null;
  const marge = Math.max(1, 0.02 * Math.max(x1 - x0, y1 - y0));
  return { x: x0 - marge, y: y0 - marge, width: x1 - x0 + 2 * marge, height: y1 - y0 + 2 * marge };
}

/** De inhoud van een tekenblad: de views, hun koppelingen en wat het blad ervoor geeft. */
export function tekenInhoud(
  vel: TekenVel,
  bron: string,
  waarden: Record<string, string>,
  scope: Record<string, unknown>,
  opties: ParseOptions,
  evalOpties: EvalOpties,
  maat: { breedte: number; hoogte: number },
): TekenInhoud {
  const alle = new Map<string, TekenBinding["kind"]>();
  const perView = vel.views.map((view) => {
    const lijst = koppelingenVan(view);
    for (const k of lijst) if (!alle.has(k.expression)) alle.set(k.expression, k.kind);
    return { view, lijst };
  });
  const uitkomsten = rekenKoppelingen([...alle.keys()], bron, waarden, scope, opties, evalOpties);
  const opgelost = oplosser(uitkomsten);

  const views = perView.map(({ view, lijst }) => {
    const kinds: Record<string, number> = {};
    for (const el of view.elementen) kinds[el.soort] = (kinds[el.soort] ?? 0) + 1;
    return {
      id: view.id,
      title: view.titel,
      scale: view.schaal,
      elements: view.elementen.length,
      kinds,
      bindings: lijst.map((k) => bindingJson(view.id, k, uitkomsten.get(k.expression))),
      bounds: grenzenVan(view, opgelost),
    };
  });
  const bindings = [...alle].map(([expression, kind]) => {
    const w = uitkomsten.get(expression);
    return {
      expression,
      kind,
      value: w?.value ?? null,
      text: w?.text ?? null,
      unit: w?.unit ?? null,
      ...(w?.error !== undefined ? { error: w.error } : {}),
    };
  });
  return {
    sheet: { format: vel.formaat, orientation: vel.ligging, widthMm: maat.breedte, heightMm: maat.hoogte },
    views,
    bindings,
    unbound: bindings.filter((b) => b.value === null).map((b) => ({ expression: b.expression, error: b.error ?? "not calculated" })),
  };
}

function bindingJson(
  view: string,
  k: { expression: string; kind: TekenBinding["kind"] },
  w: { value: number | null; text: string | null; unit: string | null; error?: string } | undefined,
): TekenBinding {
  return {
    view,
    expression: k.expression,
    kind: k.kind,
    value: w?.value ?? null,
    text: w?.text ?? null,
    unit: w?.unit ?? null,
    ...(w?.error !== undefined ? { error: w.error } : {}),
  };
}

// ── SVG ─────────────────────────────────────────────────────────────────────

/**
 * Eén view als SVG, met de waarden uit het blad erin. De coördinaten zijn
 * millimeters in het echt; `data-eenheid="mm"` zegt dat in het bestand zelf.
 */
export function tekenSvg(view: TekenView, uitkomsten: ReadonlyMap<string, { value: number | null; text?: string | null }>): { svg: string; bounds: { x: number; y: number; width: number; height: number } | null } {
  const opgelost = oplosser(uitkomsten);
  const grenzen = grenzenVan(view, opgelost);
  const tekstVan = (e: string) => {
    const w = uitkomsten.get(schoonUitdrukking(e));
    return w?.value === null || w?.value === undefined ? undefined : String(w.value);
  };
  const delen = (view.elementen as Vorm[]).map((el) => beeldVan(el, view.id, opgelost, tekstVan));
  const rand = grenzen ?? { x: 0, y: 0, width: 1, height: 1 };
  const kop = [
    `<svg xmlns="http://www.w3.org/2000/svg" data-tekening="${view.id}" data-eenheid="mm"`,
    ` viewBox="${rond(rand.x)} ${rond(rand.y)} ${rond(rand.width)} ${rond(rand.height)}"`,
    ` width="${rond(rand.width)}mm" height="${rond(rand.height)}mm">`,
  ].join("");
  return { svg: [kop, `<title>${escapeXml(view.titel || view.id)}</title>`, ...delen, "</svg>"].join("\n"), bounds: grenzen };
}

const rond = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 1000) / 1000) : "0");
const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// ── DXF ─────────────────────────────────────────────────────────────────────

/** Millimeters per eenheid zoals DXF het kent: 4 = mm, 6 = m. */
const INSUNITS: Record<"mm" | "m", number> = { mm: 4, m: 6 };

/**
 * Eén view als DXF (R12, alleen entiteiten). `unit` zegt in welke eenheid de
 * coördinaten staan; de tekening wordt daarvoor omgerekend. De y-as gaat omhoog,
 * zoals DXF het wil, dus de tekening staat rechtop en niet gespiegeld.
 */
export function tekenDxf(
  view: TekenView,
  uitkomsten: ReadonlyMap<string, { value: number | null; text?: string | null }>,
  unit: "mm" | "m" = "mm",
): { dxf: string; skipped: { soort: string; count: number }; unit: "mm" | "m"; insunits: number } {
  const opgelost = oplosser(uitkomsten);
  const k = unit === "m" ? 0.001 : 1;
  const X = (n: number) => rond(n * k);
  const Y = (n: number) => rond(-n * k);
  const entiteiten: string[][] = [];
  const skipped: Record<string, number> = {};
  const w = (el: Vorm, sleutel: string) => waardeVan(el.p?.[sleutel], opgelost);

  const lijn = (x1: number, y1: number, x2: number, y2: number, laag = "TEKENING") =>
    entiteiten.push(ent("LINE", ["8", laag, "10", X(x1), "20", Y(y1), "30", "0", "11", X(x2), "21", Y(y2), "31", "0"]));
  const tekst = (x: number, y: number, inhoud: string, hoogte: number, laag = "TEKST") =>
    entiteiten.push(ent("TEXT", ["8", laag, "10", X(x), "20", Y(y), "30", "0", "40", rond(hoogte * k), "1", dxfTekst(inhoud)]));

  for (const el of view.elementen as Vorm[]) {
    switch (el.soort) {
      case "lijn":
      case "pijl":
        lijn(w(el, "x1"), w(el, "y1"), w(el, "x2"), w(el, "y2"));
        break;
      case "rechthoek": {
        const x = w(el, "x");
        const y = w(el, "y");
        const b = w(el, "w");
        const h = w(el, "h");
        lijn(x, y, x + b, y);
        lijn(x + b, y, x + b, y + h);
        lijn(x + b, y + h, x, y + h);
        lijn(x, y + h, x, y);
        break;
      }
      case "cirkel":
        entiteiten.push(ent("CIRCLE", ["8", "TEKENING", "10", X(w(el, "cx")), "20", Y(w(el, "cy")), "30", "0", "40", rond(w(el, "r") * k)]));
        break;
      case "polylijn": {
        const punten: [number, number][] = [];
        for (let i = 0; el.p?.[`x${i}`]; i++) punten.push([w(el, `x${i}`), w(el, `y${i}`)]);
        for (let i = 1; i < punten.length; i++) lijn(punten[i - 1][0], punten[i - 1][1], punten[i][0], punten[i][1]);
        if (el.gesloten && punten.length > 2) lijn(punten[punten.length - 1][0], punten[punten.length - 1][1], punten[0][0], punten[0][1]);
        break;
      }
      case "tekst":
        tekst(w(el, "x"), w(el, "y"), tekstInhoud(el, uitkomsten), el.grootte ?? 14);
        break;
      case "maat": {
        const x1 = w(el, "x1");
        const y1 = w(el, "y1");
        const x2 = w(el, "x2");
        const y2 = w(el, "y2");
        lijn(x1, y1, x2, y2, "MAAT");
        tekst((x1 + x2) / 2, (y1 + y2) / 2, tekstInhoud(el, uitkomsten), el.grootte ?? 14, "MAAT");
        break;
      }
      default:
        // Een symbool of boog als losse entiteiten zou verkeerd uitkomen.
        skipped[el.soort] = (skipped[el.soort] ?? 0) + 1;
    }
  }

  const kop = [
    "0", "SECTION", "2", "HEADER",
    "9", "$ACADVER", "1", "AC1009",
    "9", "$INSUNITS", "70", String(INSUNITS[unit]),
    "9", "$MEASUREMENT", "70", "1",
    "0", "ENDSEC",
    "0", "SECTION", "2", "ENTITIES",
  ];
  const staart = ["0", "ENDSEC", "0", "EOF"];
  return { dxf: [...kop, ...entiteiten.flat(), ...staart].join("\n") + "\n", skipped: { soort: Object.keys(skipped).join(",") || "", count: Object.values(skipped).reduce((a, b) => a + b, 0) }, unit, insunits: INSUNITS[unit] };
}

/** Een DXF-entiteit als lijst paren. */
function ent(naam: string, paren: (string | number)[]): string[] {
  return ["0", naam, ...paren.map(String)];
}

/** Een tekst voor DXF: één regel, geen regeleinden die de paren zouden breken. */
const dxfTekst = (s: string) => s.replace(/[\r\n]+/g, " ").trim();

/** De tekst van een element zoals hij op de tekening staat, met de waarden ingevuld. */
function tekstInhoud(el: Vorm, uitkomsten: ReadonlyMap<string, { value: number | null; text?: string | null }>): string {
  const bron = el.tekst ?? "";
  return bron.replace(/\{\{([^{}]+)\}\}/g, (heel, binnen: string) => {
    const w = uitkomsten.get(schoonUitdrukking(binnen));
    return w?.text ?? heel.replace(/<[^>]+>/g, "");
  }).replace(/<[^>]+>/g, "");
}

/** De koppelingen van een tekenblad, voor de aanroeper die ze zelf al heeft. */
export function alleKoppelingen(vel: TekenVel): string[] {
  return [...new Set(vel.views.flatMap((v) => koppelingen(alsTekening(v))))];
}

/**
 * De uitkomsten van alle koppelingen van een tekenblad. Wie zelf SVG of DXF
 * maakt (`tekenSvg`, `tekenDxf`) heeft deze map nodig; `tekenInhoud` rekent hem
 * ook uit, dus één blad twee keer doorrekenen is niet nodig als de aanroeper
 * hem doorgeeft.
 */
export function koppelUitkomsten(
  vel: TekenVel,
  bron: string,
  waarden: Record<string, string>,
  scope: Record<string, unknown>,
  opties: ParseOptions,
  evalOpties: EvalOpties,
): ReturnType<typeof rekenKoppelingen> {
  return rekenKoppelingen(alleKoppelingen(vel), bron, waarden, scope, opties, evalOpties);
}
