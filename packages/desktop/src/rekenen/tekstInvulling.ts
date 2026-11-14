/**
 * Waarden uit rekenbladen in gewone tekst: `{#2.R_paal}` in een Markdown-blad of
 * een rapporttekst wordt de waarde R_paal uit het blad met kenmerk 2, met eenheid,
 * zoals de uitwerking van dat blad hem toont (docs/OCSS_TW_開發需求規格.md, P2-13).
 * `{#2.R_paal:1}` geeft één decimaal.
 *
 * Dezelfde verwijzing als in een formule (`#2.R_paal`, rekenen/verwijzingen.ts),
 * tussen de accolades van de invulvelden van het rapport (`{projectnaam}`,
 * rapport/invullen.ts). De bladen rekenen door zoals in de werkruimte, met hun
 * eigen invoer en zo nodig hun eigen verwijzingen.
 *
 * Een verwijzing die niets oplevert (onbekend blad of naam, een fout in het blad)
 * blijft letterlijk staan, zodat ze in het voorbeeld opvalt in plaats van stil te
 * verdwijnen; `fout` zegt waarom.
 *
 * Zonder React of stores (imports met `.ts`), zodat de tools en de controle het in
 * Node laden.
 */
import { eenheidInBeeld, evaluate, parse, type EvalOpties, type ParseOptions } from "@ifc-calc/core";
import { scopeMetVerwijzingen, verwezenBladen } from "./verwijzingen.ts";

/** `{#ref.naam}` of `{#ref.naam:decimalen}`. */
export const TEKST_VERWIJZING_RE = /\{#([A-Za-z0-9_]+)\.([\p{L}_][\p{L}\p{N}_]*)(?::(\d{1,2}))?\}/gu;

export interface TekstVerwijzing {
  /** Zoals hij in de tekst staat: `{#2.R_paal:1}`. */
  plek: string;
  ref: string;
  naam: string;
  decimalen?: number;
}

export interface IngevuldeWaarde {
  /** De tekst die in plaats van de verwijzing komt; null als er niets te vullen viel. */
  tekst: string | null;
  waarde?: number;
  eenheid?: string;
  fout?: string;
}

/** Wat nodig is om de bladen door te rekenen: dezelfde gegevens als de werkruimte gebruikt. */
export interface InvulOmgeving {
  bladen: readonly { ref?: string; source: string; waarden: Record<string, string> }[];
  scope: Record<string, unknown>;
  opties?: ParseOptions;
  evalOpties?: EvalOpties;
}

/** De sleutel van een verwijzing, los van de decimalen. */
const sleutelVan = (ref: string, naam: string) => `${ref}.${naam}`;

/** Alle verwijzingen in een tekst, elke plek één keer, in volgorde. */
export function tekstVerwijzingen(tekst: string): TekstVerwijzing[] {
  if (!tekst.includes("{#")) return [];
  const uit: TekstVerwijzing[] = [];
  const gezien = new Set<string>();
  for (const m of tekst.matchAll(TEKST_VERWIJZING_RE)) {
    if (gezien.has(m[0])) continue;
    gezien.add(m[0]);
    uit.push({ plek: m[0], ref: m[1], naam: m[2], ...(m[3] !== undefined ? { decimalen: Number(m[3]) } : {}) });
  }
  return uit;
}

/**
 * Rekent de verwijzingen uit; per plek (`{#2.R_paal:1}`) de ingevulde waarde.
 * Rekent elk blad hoogstens één keer, ook als het vaak genoemd wordt.
 */
export function rekenTekstVerwijzingen(lijst: readonly TekstVerwijzing[], omg: InvulOmgeving): Map<string, IngevuldeWaarde> {
  const uit = new Map<string, IngevuldeWaarde>();
  if (lijst.length === 0) return uit;
  const namen = [...new Set(lijst.map((v) => sleutelVan(v.ref, v.naam)))];
  // Eén kleine rekentekst: een regel per verwijzing, zodat de kern ze doorrekent en
  // opmaakt zoals in een blad.
  const bron = namen.map((s, i) => `__invul_${i} = #${s}`).join("\n");
  const perSleutel = new Map<string, IngevuldeWaarde>();
  try {
    const opties = omg.opties ?? {};
    const evalOpties = omg.evalOpties ?? {};
    const scope = scopeMetVerwijzingen(bron, {}, omg.scope, verwezenBladen(bron, {}, omg.bladen), opties, evalOpties);
    const nodes = evaluate(parse(bron, opties), {}, scope, evalOpties);
    for (const n of nodes) {
      if (n.type !== "assignment") continue;
      const i = Number(n.name.replace("__invul_", ""));
      const sleutel = namen[i];
      if (sleutel === undefined) continue;
      const getoond = (n.inStelsel ?? n) as typeof n;
      const tekst = String(getoond.result);
      if (tekst.startsWith("Error")) {
        perSleutel.set(sleutel, { tekst: null, fout: tekst.replace(/__invul_\d+/g, "").replace(/^Error:\s*/, "") });
        continue;
      }
      const w: IngevuldeWaarde = { tekst };
      if (typeof getoond.waarde === "number") w.waarde = getoond.waarde;
      if (getoond.unit) w.eenheid = getoond.unit;
      perSleutel.set(sleutel, w);
    }
  } catch (err) {
    for (const s of namen) perSleutel.set(s, { tekst: null, fout: (err as Error).message });
  }
  for (const v of lijst) {
    const w = perSleutel.get(sleutelVan(v.ref, v.naam)) ?? { tekst: null, fout: "not calculated" };
    if (w.tekst !== null && v.decimalen !== undefined && typeof w.waarde === "number" && Number.isFinite(w.waarde)) {
      const eenheid = w.eenheid ? ` ${eenheidInBeeld(w.eenheid)}` : "";
      uit.set(v.plek, { ...w, tekst: `${w.waarde.toFixed(v.decimalen)}${eenheid}` });
    } else {
      uit.set(v.plek, w);
    }
  }
  return uit;
}

/**
 * Vult de verwijzingen in een tekst in. `opmaak` maakt van een waarde wat er in de
 * tekst komt (in Markdown bijvoorbeeld met de tekens van de opmaak ontsnapt). Wat
 * niets opleverde, blijft staan.
 */
export function vulTekstIn(
  tekst: string,
  waarden: ReadonlyMap<string, IngevuldeWaarde | string>,
  opmaak: (waarde: string) => string = (w) => w,
): string {
  if (!tekst.includes("{#")) return tekst;
  return tekst.replace(TEKST_VERWIJZING_RE, (plek: string) => {
    const w = waarden.get(plek);
    // Ook een gewone tekst als waarde: een aanroeper die alleen de tekst heeft.
    const waarde = typeof w === "string" ? w : w?.tekst;
    return waarde === null || waarde === undefined ? plek : opmaak(waarde);
  });
}

/** Een waarde als Markdown-tekst: geen opmaakteken in een eenheid of getal doet iets. */
export const alsMarkdownTekst = (w: string) => w.replace(/[\\`*_[\]<>{}|#]/g, (t) => `\\${t}`);

/**
 * Vult de verwijzingen in Markdown in, behalve in code (tussen ``` of `): daar staat
 * een verwijzing als voorbeeld.
 */
export function vulMarkdownIn(tekst: string, waarden: ReadonlyMap<string, IngevuldeWaarde | string>): string {
  if (!tekst.includes("{#")) return tekst;
  return tekst
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/)
    .map((stuk, i) => (i % 2 === 1 ? stuk : vulTekstIn(stuk, waarden, alsMarkdownTekst)))
    .join("");
}

/** De verwijzingen in Markdown buiten code. */
export function markdownVerwijzingen(tekst: string): TekstVerwijzing[] {
  if (!tekst.includes("{#")) return [];
  const buitenCode = tekst
    .split(/(```[\s\S]*?(?:```|$)|`[^`\n]*`)/)
    .filter((_, i) => i % 2 === 0)
    .join("\n");
  return tekstVerwijzingen(buitenCode);
}

/** Een sleutel voor het onthouden: verandert als een genoemd blad (of wat het noemt) verandert. */
export function invulSleutel(lijst: readonly TekstVerwijzing[], omg: InvulOmgeving): string {
  if (lijst.length === 0) return "";
  const bron = [...new Set(lijst.map((v) => `x = #${sleutelVan(v.ref, v.naam)}`))].join("\n");
  return JSON.stringify([lijst.map((v) => v.plek), verwezenBladen(bron, {}, omg.bladen), omg.scope, omg.evalOpties ?? {}]);
}
