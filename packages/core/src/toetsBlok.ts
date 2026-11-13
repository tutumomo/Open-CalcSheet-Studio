import { math } from './eenheden.js';
import type { EvaluatedToets, FemRekenmodel, ToetsAntwoord, ToetsNode, ToetsRij, ToetsUitkomst, VastgelegdeToets } from './types.js';

/**
 * Een normtoets door Open FEM Studio: het blok `@toets`.
 *
 *   @toets kolom = check_steel_beam
 *     profile_name = "HEA200"
 *     steel_grade = "S235"
 *     length_m = h
 *     forces_envelope = [1, 0, N_Ed, 0, V_Ed, 0, M_Ed, 0; 1, h, N_Ed, 0, V_Ed, 0, 0, 0]
 *     …
 *   @end
 *   UC_max = kolom.uc_max
 *
 * De normtoetsingen komen uit één bron: FEM Studio. CalcSheet rekent de velden
 * uit, rekent ze om naar de eenheden van het schema en zoekt het antwoord op
 * met een hash van de invoer op het blad (`EvalOpties.toetsingen`). Er is geen
 * aanroep vanuit de kern: de app stuurt het verzoek (`verzoek` in de modus
 * `vragen`) en rekent opnieuw zodra het antwoord er is. Zie
 * docs/superpowers/specs/2026-11-07-toetsing-via-fem-studio-design.md.
 *
 * Na het blok staan in de scope (een punt in een naam is in de rekentaal een
 * liggend streepje, dus `kolom.uc_max` is `kolom_uc_max`):
 *   <naam>_uc_max, <naam>_voldoet (1 of 0), <naam>_status,
 *   per toets <naam>_uc_<id> (punten als _), en bij een lijst of model
 *   <naam>_uc_staaf (een vector in de volgorde van het antwoord).
 */

export const TOETS_START_RE = /^@toets\s+([\p{L}_][\p{L}\p{N}_]*)\s*=\s*([a-z][a-z0-9_]*)\s*$/iu;
const VELD_RE = /^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/;

/**
 * Wat een blad niet mag aanroepen; dezelfde lijst als de Rust-kant (fem-brug,
 * UITGESLOTEN_VOORVOEGSELS en UITGESLOTEN_NAMEN). Uitgesloten zijn de tools die de app
 * van FEM Studio sturen (`gui_*`, `app_*`, `extensions_*`), die het project of het model
 * in de app bijhouden (`project_*`, `model3d_*`) en die bestanden lezen of schrijven
 * (`load_*`, `generate_*` en de drie IFC-tools). Al het andere uit `tools/list` is een
 * rekentool en mag, ook een die er later bij komt.
 */
export const TOETS_UITGESLOTEN = {
  voorvoegsels: ['gui_', 'app_', 'project_', 'model3d_', 'extensions_', 'load_', 'generate_'],
  namen: ['open_fem_3d_ifc_importeren', 'fem_resultaten_ifc_schrijven', 'fem_resultaten_ifc_lezen'],
} as const;

/** Mag een blad deze tool van FEM Studio gebruiken? Alle rekentools, zie TOETS_UITGESLOTEN. */
export function toetsToolToegestaan(tool: string): boolean {
  return /^[a-z][a-z0-9_]*$/.test(tool)
    && !TOETS_UITGESLOTEN.voorvoegsels.some((v) => tool.startsWith(v))
    && !(TOETS_UITGESLOTEN.namen as readonly string[]).includes(tool);
}

// ── Lezen ────────────────────────────────────────────────────────────────────

/** De regels tussen `@toets naam = tool` en `@end`. Fouten worden meldingen. */
export function leesToetsBlok(
  naam: string,
  tool: string,
  regels: string[],
  normaliseer: (expr: string) => string,
): Omit<ToetsNode, 'type'> {
  const velden: ToetsNode['velden'] = [];
  const fouten: string[] = [];
  if (!toetsToolToegestaan(tool)) fouten.push(`de tool "${tool}" van FEM Studio is in een rekenblad niet toegestaan`);
  regels.forEach((r, i) => {
    const t = r.trim();
    if (!t || t.startsWith('//')) return;
    const m = t.match(VELD_RE);
    if (!m) {
      fouten.push(`regel ${i + 1}: schrijf veld = uitdrukking`);
      return;
    }
    if (velden.some((v) => v.veld === m[1])) fouten.push(`regel ${i + 1}: het veld ${m[1]} staat er al`);
    else velden.push({ veld: m[1], expr: normaliseer(m[2]), regel: i + 1 });
  });
  return { naam, tool, velden, fouten };
}

// ── Omrekenen naar het schema ────────────────────────────────────────────────

/** De eenheid die de naam van een veld draagt; de langste eerst. */
const ACHTERVOEGSELS: readonly (readonly [string, string])[] = [
  ['_n_per_mm', 'N/mm'],
  ['_kn_per_m', 'kN/m'],
  ['_mm2', 'mm^2'],
  ['_mm4', 'mm^4'],
  ['_mm6', 'mm^6'],
  ['_knm', 'kN m'],
  ['_mpa', 'MPa'],
  ['_mm', 'mm'],
  ['_kn', 'kN'],
  ['_m', 'm'],
];

/**
 * Hetzelfde voor een naam in camelCase, zoals de rekenkernen van `solve_native_fem` ze
 * schrijven (`thicknessMm`, `fcdMpa`, `vRdcKnPerM`); de langste eerst. Het achtervoegsel
 * begint met een hoofdletter en er staat een naam vóór: `M` alleen is geen lengte.
 */
const ACHTERVOEGSELS_CAMEL: readonly (readonly [string, string])[] = [
  ['Mm2PerM2', 'mm^2/m^2'],
  ['Mm2PerM', 'mm^2/m'],
  ['KnPerM2', 'kN/m^2'],
  ['KnPerM', 'kN/m'],
  ['KnM2', 'kN/m^2'],
  ['Mm2', 'mm^2'],
  ['Mm4', 'mm^4'],
  ['Mpa', 'MPa'],
  ['Knm', 'kN m'],
  ['Mm', 'mm'],
  ['Kn', 'kN'],
  ['M', 'm'],
];

export function eenheidVanVeld(veld: string): string | null {
  const v = veld.toLowerCase();
  const metStreepje = ACHTERVOEGSELS.find(([achter]) => v.endsWith(achter))?.[1];
  if (metStreepje) return metStreepje;
  return ACHTERVOEGSELS_CAMEL.find(([achter]) => veld.length > achter.length && veld.endsWith(achter) && /[a-z0-9]/i.test(veld[veld.length - achter.length - 1]))?.[1] ?? null;
}

/** De kolommen van `forces_envelope` als matrix: per rij één station. */
const KRACHT_KOLOMMEN: readonly (readonly [string, string | null])[] = [
  ['combination_id', null],
  ['position_mm', 'mm'],
  ['n_ed', 'kN'],
  ['vy_ed', 'kN'],
  ['vz_ed', 'kN'],
  ['mt_ed', 'kN m'],
  ['my_ed', 'kN m'],
  ['mz_ed', 'kN m'],
];

type MathUnit = { toNumber(eenheid: string): number; toString(): string; toSI(): MathUnit; formatUnits(): string; value: number | null };
const isUnit = (w: unknown): w is MathUnit => math.isUnit(w);

function getal(w: unknown, pad: string, eenheid: string | null): number | string | boolean {
  if (isUnit(w)) {
    if (!eenheid) throw new Error(`${pad}: dit veld heeft geen eenheid in zijn naam; geef een getal`);
    try {
      return w.toNumber(eenheid);
    } catch {
      throw new Error(`${pad}: ${w.toString()} past niet in ${eenheid}`);
    }
  }
  if (math.isFraction(w) || math.isBigNumber(w)) return Number(w);
  if (typeof w === 'number') {
    if (!Number.isFinite(w)) throw new Error(`${pad}: geen eindig getal`);
    return w;
  }
  if (typeof w === 'string' || typeof w === 'boolean') return w;
  throw new Error(`${pad}: geen getal, tekst of ja/nee`);
}

/** Een waarde zoals FEM Studio hem verwacht: getallen in de eenheid van elk veld. */
function zuiver(veld: string, w: unknown, pad: string): unknown {
  if (math.isMatrix(w)) return zuiver(veld, (w as { toArray(): unknown[] }).toArray(), pad);
  if (Array.isArray(w)) return w.map((x, i) => zuiver(veld, x, `${pad}[${i + 1}]`));
  if (w !== null && typeof w === 'object' && !isUnit(w) && !math.isFraction(w) && !math.isBigNumber(w)) {
    const uit: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(w as Record<string, unknown>)) uit[k] = zuiver(k, v, `${pad}.${k}`);
    return uit;
  }
  return getal(w, pad, eenheidVanVeld(veld));
}

/**
 * Een veld omgerekend naar het schema van FEM Studio. `forces_envelope` mag een
 * matrix zijn met per rij [combination_id, position_mm, n_ed, vy_ed, vz_ed, mt_ed,
 * my_ed, mz_ed]. Werpt bij een waarde die niet past.
 */
export function naarSchema(veld: string, waarde: unknown): unknown {
  if (veld === 'forces_envelope') {
    const rijen = math.isMatrix(waarde) ? (waarde as { toArray(): unknown[] }).toArray() : waarde;
    if (Array.isArray(rijen) && rijen.length && rijen.every((r) => Array.isArray(r))) {
      return (rijen as unknown[][]).map((rij, i) => {
        if (rij.length !== KRACHT_KOLOMMEN.length) {
          throw new Error(`forces_envelope, rij ${i + 1}: ${KRACHT_KOLOMMEN.length} kolommen (combinatie, x, N, V_y, V_z, M_t, M_y, M_z), niet ${rij.length}`);
        }
        const waarden = KRACHT_KOLOMMEN.map(([naam, eenheid], k) => getal(rij[k], `forces_envelope, rij ${i + 1}, ${naam}`, eenheid));
        const [combination_id, position_mm, n_ed, vy_ed, vz_ed, mt_ed, my_ed, mz_ed] = waarden;
        return { combination_id, position_mm, forces: { n_ed, vy_ed, vz_ed, mt_ed, my_ed, mz_ed } };
      });
    }
  }
  return zuiver(veld, waarde, veld);
}

// ── De hash van de invoer op het blad ────────────────────────────────────────

const getal12 = (v: number) => Number(v.toPrecision(12));

/**
 * Een waarde zonder de eenheid waarin hij getypt is: een grootheid als getal in
 * SI-basiseenheden met haar dimensie. Zo geven `6 m` en `6000 mm` dezelfde hash.
 */
export function canoniek(w: unknown): unknown {
  if (isUnit(w)) {
    const si = w.toSI();
    return { si: getal12(si.value ?? 0), dim: si.formatUnits() };
  }
  if (math.isMatrix(w)) return canoniek((w as { toArray(): unknown[] }).toArray());
  if (Array.isArray(w)) return w.map(canoniek);
  if (math.isFraction(w) || math.isBigNumber(w)) return getal12(Number(w));
  if (typeof w === 'number') return getal12(w);
  if (w !== null && typeof w === 'object') {
    const uit: Record<string, unknown> = {};
    for (const k of Object.keys(w).sort()) uit[k] = canoniek((w as Record<string, unknown>)[k]);
    return uit;
  }
  return w;
}

/** cyrb53: snel en deterministisch, 53 bits, als 16 hextekens. */
function cyrb53(tekst: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < tekst.length; i++) {
    const ch = tekst.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (h2 >>> 0).toString(16).padStart(8, '0') + (h1 >>> 0).toString(16).padStart(8, '0');
}

/** De hash waarmee een antwoord wordt opgezocht: over de tool en de invoer op het blad. */
export function toetsHash(tool: string, invoer: Record<string, unknown>): string {
  return 't' + cyrb53(JSON.stringify({ tool, invoer: canoniek(invoer) }));
}

/**
 * De hash van het schema van een tool (`inputSchema` uit `tools/list`). Gaat mee in de
 * herkomst van een antwoord: verandert het schema, dan biedt het blad "opnieuw toetsen"
 * aan. Het antwoord blijft gelden, want de hash van de invoer verandert niet.
 */
export function schemaHash(schema: unknown): string {
  return 's' + cyrb53(JSON.stringify(canoniek(schema ?? null)));
}

// ── Vastleggen ───────────────────────────────────────────────────────────────

/**
 * Een vastgelegd antwoord zoals het blok het opzoekt (`EvalOpties.toetsingen`). Bij een
 * `@fem`-blok gaat het bewaarde verzoek mee: daarin staat het raster van het antwoord.
 */
export function alsAntwoord(v: VastgelegdeToets): ToetsAntwoord {
  const fem = (v.verzoek as { vorm?: unknown }).vorm === 'fem-plaat/1';
  return {
    ok: true,
    uitkomst: v.uitkomst,
    datum: v.datum,
    ...(v.herkomst.versie ? { versie: v.herkomst.versie } : {}),
    ...(v.herkomst.schema ? { schema: v.herkomst.schema } : {}),
    ...(fem ? { verzoek: v.verzoek as unknown as FemRekenmodel } : {}),
  };
}

const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const tekstOf = (x: unknown) => (typeof x === 'string' && x ? x : undefined);

/**
 * De vastgelegde antwoorden van een blad, uit een bestand of de opgeslagen staat: per
 * hash van de invoer. Wat niet klopt, valt weg; zonder bruikbaar antwoord: undefined.
 */
export function leesVastgelegdeToetsingen(x: unknown): Record<string, VastgelegdeToets> | undefined {
  if (!isObject(x)) return undefined;
  const uit: Record<string, VastgelegdeToets> = {};
  for (const [hash, w] of Object.entries(x)) {
    if (!/^t[0-9a-f]{16}$/.test(hash) || !isObject(w)) continue;
    if (typeof w.tool !== 'string' || !w.tool || !isObject(w.verzoek) || !('uitkomst' in w) || typeof w.datum !== 'string') continue;
    const h = isObject(w.herkomst) ? w.herkomst : {};
    const herkomst = {
      ...(tekstOf(h.versie) ? { versie: tekstOf(h.versie) } : {}),
      ...(tekstOf(h.sha256) ? { sha256: tekstOf(h.sha256) } : {}),
      ...(tekstOf(h.schema) ? { schema: tekstOf(h.schema) } : {}),
    };
    uit[hash] = { tool: w.tool, verzoek: w.verzoek, uitkomst: w.uitkomst, datum: w.datum, herkomst };
  }
  return Object.keys(uit).length ? uit : undefined;
}

// ── Het antwoord lezen ───────────────────────────────────────────────────────

interface RuwResultaat {
  uc_max?: unknown;
  status?: unknown;
  checks?: unknown[];
  governing_check_id?: unknown;
  beam_id?: unknown;
  plate_id?: unknown;
}

const isResultaat = (x: unknown): x is RuwResultaat =>
  !!x && typeof x === 'object' && Array.isArray((x as RuwResultaat).checks) && 'status' in (x as object);

/** De resultaten in een antwoord: één, een lijst, of de resultaten van een model. */
function resultaten(a: unknown): RuwResultaat[] {
  if (isResultaat(a)) return [a];
  if (Array.isArray(a)) return a.flatMap(resultaten);
  if (a && typeof a === 'object') {
    const o = a as Record<string, unknown>;
    return ['results', 'timber_results', 'clt_results', 'aluminium_results', 'koudgevormd_results', 'plate_results', 'inputs']
      .flatMap((k) => (Array.isArray(o[k]) ? (o[k] as unknown[]).filter(isResultaat) : []));
  }
  return [];
}

const alsGetal = (w: unknown): number | null => (typeof w === 'number' && Number.isFinite(w) ? w : null);

function toetsRij(c: unknown): ToetsRij {
  const toets = (c ?? {}) as { id?: unknown; kind?: { data?: Record<string, unknown> } };
  const d = toets.kind?.data ?? {};
  const uc = d.uc as unknown;
  return {
    id: String(toets.id ?? d.id ?? ''),
    artikel: String(d.article ?? ''),
    titel: String(d.title ?? ''),
    uc: alsGetal(uc) ?? alsGetal((uc as { uc?: unknown } | null)?.uc),
    status: String(d.status ?? ''),
    formule: typeof d.formula_latex === 'string' ? d.formula_latex : undefined,
    variabelen: Array.isArray(d.variables) ? (d.variables as ToetsRij['variabelen']) : undefined,
    notities: Array.isArray(d.notes) ? (d.notes as unknown[]).map(String) : undefined,
  };
}

/**
 * Een antwoord van FEM Studio in één vorm: de UC, het oordeel, de toetsen en bij
 * een lijst of model de staven. `NotApplicable` van het geheel is "niet volledig
 * getoetst", nooit "voldoet"; van één toets is het "niet van toepassing".
 */
export function leesAntwoord(antwoord: unknown): ToetsUitkomst {
  const leeg: ToetsUitkomst = { uc_max: null, status: 'NotApplicable', voldoet: false, toetsen: [] };
  const els = resultaten(antwoord);
  if (!els.length) return { ...leeg, fout: 'FEM Studio gaf geen toetsresultaat terug.' };
  const fout = els.map((e) => e.governing_check_id).find((g): g is string => typeof g === 'string' && /^ERROR\b/.test(g));
  if (fout) return { ...leeg, fout: fout.replace(/^ERROR:?\s*/, '') };
  const staven = els.map((e, i) => ({
    id: String(e.beam_id ?? e.plate_id ?? i + 1),
    uc_max: alsGetal(e.uc_max),
    status: String(e.status ?? ''),
    maatgevend: typeof e.governing_check_id === 'string' ? e.governing_check_id : undefined,
  }));
  const ucs = staven.map((s) => s.uc_max).filter((u): u is number => u !== null);
  const status = staven.some((s) => s.status === 'NotOk')
    ? 'NotOk'
    : staven.some((s) => s.status !== 'Ok')
      ? 'NotApplicable'
      : 'Ok';
  return {
    uc_max: ucs.length ? Math.max(...ucs) : null,
    status,
    voldoet: status === 'Ok',
    maatgevend: els.length === 1 ? staven[0].maatgevend : undefined,
    toetsen: els.length === 1 ? (els[0].checks ?? []).map(toetsRij) : [],
    staven: els.length > 1 ? staven : undefined,
  };
}

/** De variabelen na het blok; zie de kop van dit bestand. */
function zetVariabelen(naam: string, u: ToetsUitkomst, scope: Record<string, unknown>): void {
  if (u.uc_max !== null) scope[`${naam}_uc_max`] = u.uc_max;
  scope[`${naam}_voldoet`] = u.voldoet ? 1 : 0;
  scope[`${naam}_status`] = u.status;
  for (const t of u.toetsen) {
    if (t.uc !== null && t.id) scope[`${naam}_uc_${t.id.replace(/[^A-Za-z0-9]+/g, '_')}`] = t.uc;
  }
  if (u.staven) scope[`${naam}_uc_staaf`] = math.matrix(u.staven.map((s) => s.uc_max ?? NaN));
}

/** Haalt de variabelen van een eerder blok met dezelfde naam weg: geen oude uitkomst laten staan. */
function wisVariabelen(naam: string, scope: Record<string, unknown>): void {
  for (const k of Object.keys(scope)) if (k.startsWith(`${naam}_uc_`) || k === `${naam}_voldoet` || k === `${naam}_status`) delete scope[k];
}

// ── Rekenen ──────────────────────────────────────────────────────────────────

/** Wat het blok nodig heeft van de rekenkern (evaluator.ts). */
export interface ToetsRekenaar {
  reken(expr: string): unknown;
  scope: Record<string, unknown>;
  opties: {
    toetsingen?: Record<string, ToetsAntwoord>;
    /** `vragen`: zonder antwoord een verzoek meegeven (de werkruimte); anders niet getoetst. */
    toetsModus?: 'vragen' | 'lezen';
    taal?: string;
    fem?: { versie?: string; schemas?: Record<string, string> };
  };
}

/** Is het antwoord gemaakt met een andere FEM Studio of een ander schema dan die van nu? */
function verouderdVan(
  a: { versie?: string; schema?: string },
  tool: string,
  fem: ToetsRekenaar['opties']['fem'],
): EvaluatedToets['verouderd'] {
  if (!fem) return undefined;
  if (fem.versie && a.versie && fem.versie !== a.versie) return { versie: fem.versie };
  const nu = fem.schemas?.[tool];
  if (nu && a.schema && nu !== a.schema) return { schema: true };
  return undefined;
}

const melding = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error:\s*/, '');

export function bouwToets(node: ToetsNode, r: ToetsRekenaar): EvaluatedToets {
  const taal = r.opties.taal?.toLowerCase().startsWith('en') ? 'en' : 'nl';
  const basis = {
    type: 'toets' as const,
    naam: node.naam,
    tool: node.tool,
    taal,
    ...(node.hidden ? { verborgen: true } : {}),
    ...(node.scherm ? { scherm: true } : {}),
  };
  wisVariabelen(node.naam, r.scope);
  if (node.fouten.length) return { ...basis, status: 'fout', melding: node.fouten.join('; ') };

  const invoer: Record<string, unknown> = {};
  const argumenten: Record<string, unknown> = {};
  const fouten: string[] = [];
  for (const v of node.velden) {
    try {
      const w = r.reken(v.expr);
      invoer[v.veld] = w;
      argumenten[v.veld] = naarSchema(v.veld, w);
    } catch (e) {
      fouten.push(`${v.veld}: ${melding(e)}`);
    }
  }
  if (fouten.length) return { ...basis, status: 'fout', melding: fouten.join('; ') };

  const hash = toetsHash(node.tool, invoer);
  const vragen = r.opties.toetsModus === 'vragen';
  const antwoord = r.opties.toetsingen?.[hash];
  if (!antwoord) {
    return vragen
      ? { ...basis, hash, status: 'wacht', verzoek: { hash, tool: node.tool, argumenten } }
      : { ...basis, hash, status: 'niet-getoetst', melding: WOORDEN[taal].geenAntwoord };
  }
  // Na een fout mag het opnieuw: FEM Studio kan er intussen wel zijn.
  if (!antwoord.ok) return { ...basis, hash, status: 'fout', melding: antwoord.melding, ...(vragen ? { opnieuw: true } : {}) };
  const herkomst = {
    ...(antwoord.versie ? { versie: antwoord.versie } : {}),
    ...(antwoord.datum ? { datum: antwoord.datum } : {}),
    ...(antwoord.waarschuwing ? { waarschuwing: antwoord.waarschuwing } : {}),
  };
  const uitkomst = leesAntwoord(antwoord.uitkomst);
  if (uitkomst.fout) return { ...basis, hash, status: 'fout', melding: uitkomst.fout, ...herkomst, ...(vragen ? { opnieuw: true } : {}) };
  zetVariabelen(node.naam, uitkomst, r.scope);
  const verouderd = vragen ? verouderdVan(antwoord, node.tool, r.opties.fem) : undefined;
  const opnieuw = vragen && (!!verouderd || !!antwoord.waarschuwing);
  return { ...basis, hash, status: 'klaar', uitkomst, ...herkomst, ...(verouderd ? { verouderd } : {}), ...(opnieuw ? { opnieuw } : {}) };
}

// ── Tonen ────────────────────────────────────────────────────────────────────

const WOORDEN = {
  nl: {
    toetsing: 'Toetsing', door: 'Open FEM Studio', artikel: 'Artikel', toets: 'Toets', oordeel: 'Oordeel',
    voldoet: 'voldoet', voldoetNiet: 'voldoet niet', nvt: 'n.v.t.', nietVolledig: 'niet volledig getoetst',
    wacht: 'Wordt getoetst door Open FEM Studio…', nietGetoetst: 'NIET GETOETST',
    geenAntwoord: 'er is geen antwoord van Open FEM Studio', maatgevend: 'Maatgevend', afleiding: 'Afleiding',
    staaf: 'Staaf', versie: 'versie', opnieuw: 'Opnieuw toetsen',
    verouderdVersie: (oud: string, nu: string) => `Getoetst met versie ${oud}; deze CalcSheet heeft FEM Studio ${nu}.`,
    verouderdSchema: (tool: string) => `Het schema van ${tool} is veranderd sinds deze toets.`,
    mislukt: 'Opnieuw toetsen lukte niet',
  },
  en: {
    toetsing: 'Code check', door: 'Open FEM Studio', artikel: 'Clause', toets: 'Check', oordeel: 'Verdict',
    voldoet: 'satisfies', voldoetNiet: 'does not satisfy', nvt: 'n/a', nietVolledig: 'not fully checked',
    wacht: 'Being checked by Open FEM Studio…', nietGetoetst: 'NOT CHECKED',
    geenAntwoord: 'there is no answer from Open FEM Studio', maatgevend: 'Governing', afleiding: 'Derivation',
    staaf: 'Member', versie: 'version', opnieuw: 'Check again',
    verouderdVersie: (oud: string, nu: string) => `Checked with version ${oud}; this CalcSheet has FEM Studio ${nu}.`,
    verouderdSchema: (tool: string) => `The schema of ${tool} has changed since this check.`,
    mislukt: 'Checking again failed',
  },
} as const;

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/**
 * Een artikel met een breekpunt na elke schuine streep: een verwijzing als
 * "NB.NB.2/NB.4/NB.7/NB.11/NB.13" heeft geen spaties en hield een smal paneel anders breed.
 */
const artikelTekst = (t: string) => esc(t).replace(/\//g, '/<wbr>');

const ucTekst = (uc: number | null, taal: string) => (uc === null ? '–' : taal === 'nl' ? uc.toFixed(2).replace('.', ',') : uc.toFixed(2));

function oordeel(status: string, w: (typeof WOORDEN)['nl' | 'en'], geheel: boolean): string {
  if (status === 'Ok') return w.voldoet;
  if (status === 'NotOk') return w.voldoetNiet;
  return geheel ? w.nietVolledig : w.nvt;
}

function waardeTekst(v: { value?: unknown; unit?: string }): string {
  const w = typeof v.value === 'number' ? String(Number(v.value.toPrecision(6))) : String(v.value ?? '');
  return v.unit ? `${w} ${v.unit}` : w;
}

/** De datum van een toets: 7-11-2026 of 2026-11-07. */
function datumTekst(iso: string, taal: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  return taal === 'nl' ? `${Number(m[3])}-${Number(m[2])}-${m[1]}` : `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Eén blok. `metVersie`: de versie van FEM Studio in de kop. De renderer laat hem weg
 * als alle blokken van het blad dezelfde versie hebben, behalve bij het eerste.
 */
export function renderToets(node: EvaluatedToets, metVersie = true): string {
  if (node.verborgen) return '';
  const w = WOORDEN[node.taal === 'en' ? 'en' : 'nl'];
  const datum = node.datum ? datumTekst(node.datum, node.taal) : '';
  const kop = `<p class="calc-toets-kop"><strong>${esc(w.toetsing)} ${esc(node.naam)}</strong> — <code>${esc(node.tool)}</code>, ${esc(w.door)}${node.versie && metVersie ? ` ${esc(w.versie)} ${esc(node.versie)}` : ''}${datum ? `<span class="alleen-scherm">, ${esc(datum)}</span>` : ''}</p>`;
  const scherm = node.scherm ? ' alleen-scherm' : '';
  const knop = node.opnieuw && node.hash ? ` <button type="button" class="calc-toets-opnieuw" data-toets-opnieuw="${esc(node.hash)}">${esc(w.opnieuw)}</button>` : '';
  if (node.status === 'wacht') {
    return `<div class="calc-toets calc-toets-wacht${scherm}" data-toets="${esc(node.hash ?? '')}">${kop}<p>${esc(w.wacht)}</p></div>`;
  }
  if (node.status !== 'klaar' || !node.uitkomst) {
    const tekst = `${w.nietGetoetst}${node.melding ? `: ${node.melding}` : ''}`;
    const opnieuw = knop ? `<p class="alleen-scherm">${knop.trim()}</p>` : '';
    return `<div class="calc-toets calc-toets-fout${scherm}" data-toets="${esc(node.hash ?? '')}">${kop}<p class="calc-toets-melding">${esc(tekst)}</p>${opnieuw}</div>`;
  }
  // Alleen op het scherm: een ouder antwoord blijft gelden, opnieuw toetsen is een knop.
  const meldingen = [
    node.verouderd?.versie && node.versie ? w.verouderdVersie(node.versie, node.verouderd.versie) : '',
    node.verouderd?.schema ? w.verouderdSchema(node.tool) : '',
    node.waarschuwing ? `${w.mislukt}: ${node.waarschuwing}` : '',
  ].filter(Boolean);
  const verouderd = meldingen.length || knop
    ? `<p class="calc-toets-verouderd alleen-scherm">${meldingen.map(esc).join(' ')}${knop}</p>`
    : '';
  const u = node.uitkomst;
  const rijen = u.staven
    ? u.staven.map((s) => `<tr class="${s.uc_max === u.uc_max ? 'maatgevend' : ''}"><td>${esc(w.staaf)} ${esc(s.id)}</td><td>${esc(s.maatgevend ?? '')}</td><td class="uc">${ucTekst(s.uc_max, node.taal)}</td><td>${esc(oordeel(s.status, w, true))}</td></tr>`)
    : u.toetsen.map((t) => `<tr class="${t.id === u.maatgevend ? 'maatgevend' : t.status === 'NotApplicable' ? 'nvt' : ''}"><td>${artikelTekst(t.artikel)}</td><td>${esc(t.titel)}</td><td class="uc">${ucTekst(t.status === 'NotApplicable' ? null : t.uc, node.taal)}</td><td>${esc(oordeel(t.status, w, false))}</td></tr>`);
  const maat = u.toetsen.find((t) => t.id === u.maatgevend);
  const slot = `<p class="calc-toets-slot">${maat ? `${esc(w.maatgevend)}: ${esc(maat.titel)} (${artikelTekst(maat.artikel)}) — ` : ''}UC = ${ucTekst(u.uc_max, node.taal)} — <strong>${esc(oordeel(u.status, w, true))}</strong></p>`;
  const afleiding = u.toetsen.length
    ? `<details class="calc-toets-afleiding alleen-scherm"><summary>${esc(w.afleiding)}</summary>${u.toetsen
      .map((t) => `<div class="calc-toets-stap"><p><strong>${esc(t.titel)}</strong> (${artikelTekst(t.artikel)})${t.formule ? ` <code>${esc(t.formule)}</code>` : ''}</p>${t.variabelen?.length ? `<p>${t.variabelen.map((v) => `${esc(String(v.symbol ?? ''))} = ${esc(waardeTekst(v))}`).join('; ')}</p>` : ''}${(t.notities ?? []).map((n) => `<p class="calc-toets-notitie">${esc(n)}</p>`).join('')}</div>`)
      .join('')}</details>`
    : '';
  return `<div class="calc-toets${scherm}" data-toets="${esc(node.hash ?? '')}">${kop}${verouderd}<table class="calc-toets-tabel"><thead><tr><th>${esc(u.staven ? w.staaf : w.artikel)}</th><th>${esc(u.staven ? w.maatgevend : w.toets)}</th><th>UC</th><th>${esc(w.oordeel)}</th></tr></thead><tbody>${rijen.join('')}</tbody></table>${slot}${afleiding}</div>`;
}

/** De opmaak, bij de andere blokken in renderer.ts. */
export const TOETS_CSS = `
.calc-toets { margin: 6px 0 10px; }
.calc-toets-kop { margin: 0 0 4px; }
.calc-toets-tabel { border-collapse: collapse; font-size: 0.95em; }
.calc-toets-tabel th, .calc-toets-tabel td { border-bottom: 1px solid #e5e7eb; padding: 1px 10px 1px 0; text-align: left; }
.calc-toets-tabel td.uc { text-align: right; font-variant-numeric: tabular-nums; }
/* In een smal paneel breken UC en oordeel niet af; artikel en titel wel (een lange
   verwijzing als NB.NB.2/NB.4/… na elke schuine streep, zie artikelTekst). */
.calc-toets-tabel th:nth-child(n+3), .calc-toets-tabel td:nth-child(n+3) { white-space: nowrap; }
.calc-toets-tabel tr.maatgevend td { font-weight: 600; }
.calc-toets-tabel tr.nvt td { color: #6b7280; }
.calc-toets-slot { margin: 4px 0 0; }
.calc-toets-fout .calc-toets-melding { color: #dc2626; font-weight: 600; }
.calc-toets-wacht p { color: #6b7280; font-style: italic; }
.calc-toets-afleiding { margin-top: 4px; font-size: 0.92em; }
.calc-toets-stap { margin: 4px 0; }
.calc-toets-notitie { color: #4b5563; }
.calc-toets-verouderd { margin: 0 0 4px; color: #92400e; }
.calc-toets-opnieuw { font: inherit; font-size: 0.9em; padding: 0 8px; margin-left: 4px; cursor: pointer; }
`;
