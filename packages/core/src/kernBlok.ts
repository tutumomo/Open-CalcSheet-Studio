import { math } from './eenheden.js';
import { eenheidVanVeld, toetsHash, toetsToolToegestaan } from './toetsBlok.js';
import type { EvaluatedKern, KernNode, KernPadDeel, KernRegel, ToetsAntwoord, ToetsVerzoek } from './types.js';

/**
 * Een rekentool van Open FEM Studio met geneste invoer: het blok `@kern`.
 *
 *   @kern drie = solve_native_fem
 *     inputs.kind = "threeLayer"
 *     inputs.input.forces = {nx: 0, ny: 0, nxy: 0, mx: m_x/(1 kN), my: 0, mxy: 0, vx: 0, vy: 0}
 *     inputs.input.thicknessMm = h
 *     inputs.input.topReinforcement.asX = 524
 *     …
 *   @end
 *   A_sx = drie.result.bottom.requiredAsXmm2PerM
 *
 * Waar `@toets` een normtoets leest (UC en oordeel), geeft `@kern` de uitkomst van een
 * rekentool terug als getallen: het blok rekent niets zelf en geeft nooit een oordeel.
 * Elke regel is `pad = uitdrukking`; een pad met punten bouwt geneste invoer op
 * (`inputs.input.thicknessMm`), `lijst[k]` een lijst (vanaf 1), en `#for … #loop` en
 * `#if … #end if` werken zoals in `@fem`. Met `per k = 1 : n` doet het blok een reeks
 * aanroepen, één per waarde van k; een k zonder velden (alles in een `#if` die niet
 * geldt) wordt overgeslagen.
 *
 * Dezelfde regels als `@toets` (toetsBlok.ts): het antwoord wordt opgezocht met een hash
 * van de invoer op het blad en bij het blad vastgelegd; de kern roept zelf niets aan.
 * Zonder antwoord staat het blok als wacht (werkruimte) of NIET GEREKEND, en bestaan de
 * uitkomsten niet.
 *
 * Na het blok staan in de scope (een punt in een naam is een liggend streepje):
 *   <naam>_<pad>      elk getal, elke tekst en elk ja/nee (1 of 0) uit het antwoord, met
 *                     het pad erheen: `drie_result_leverArmMm`
 *   een lijst getallen als vector, een lijst van lijsten als matrix, en van een lijst
 *   objecten per veld een vector (`<naam>_results_result_top_utilizationAsX`)
 *   bij `per`: per veld een vector met een waarde per aanroep (NaN of lege tekst bij een
 *   overgeslagen aanroep), en <naam>_aantal, <naam>_gerekend (1 of 0 per aanroep)
 * De getallen hebben geen eenheid: het blad zet die erbij (`… * mm^2`).
 */

export const KERN_START_RE = /^@kern\s+([\p{L}_][\p{L}\p{N}_]*)\s*=\s*([a-z][a-z0-9_]*)\s*$/iu;

const NAAM = '[A-Za-z_][A-Za-z0-9_]*';
const DEEL = `${NAAM}(?:\\[[^\\]]*\\])?`;
const VELD_RE = new RegExp(`^(${DEEL}(?:\\.${DEEL})*)\\s*=(?!=)\\s*(.+)$`);
const DEEL_RE = new RegExp(`^(${NAAM})(?:\\[([^\\]]*)\\])?$`);
const PER_RE = /^per\s+([\p{L}_][\p{L}\p{N}_]*)\s*=\s*(.+?)\s*:\s*(.+)$/iu;
const FOR_RE = /^#for\s+([\p{L}_][\p{L}\p{N}_]*)\s*=\s*(.+?)\s*:\s*(.+)$/iu;
const LOOP_RE = /^#loop\b/i;
const IF_RE = /^#if\s+(.+)$/i;
const ELSE_IF_RE = /^#else\s*if\s+(.+)$/i;
const ELSE_RE = /^#else\b/i;
const ENDIF_RE = /^#end\s+if\b/i;

/** Hoeveel aanroepen een reeks hoogstens heeft, en hoeveel uitkomsten een blok. */
const MAX_REEKS = 2000;
const MAX_UITKOMSTEN = 5000;
const MAX_RONDES = 10000;

// ── Lezen ────────────────────────────────────────────────────────────────────

/** De regels tussen `@kern naam = tool` en `@end`. Fouten worden meldingen met het regelnummer. */
export function leesKernBlok(naam: string, tool: string, bron: string[], normaliseer: (expr: string) => string): Omit<KernNode, 'type'> {
  const fouten: string[] = [];
  const meld = (nr: number, tekst: string) => fouten.push(`regel ${nr}: ${tekst}`);
  if (!toetsToolToegestaan(tool)) fouten.push(`de tool "${tool}" van FEM Studio is in een rekenblad niet toegestaan`);
  let per: KernNode['per'];
  let i = 0;

  function blok(eindes: RegExp[], diepte: number): { regels: KernRegel[]; eind: string | null } {
    const uit: KernRegel[] = [];
    while (i < bron.length) {
      const nr = i + 1;
      const t = bron[i].trim();
      if (t === '' || t.startsWith('//')) { i++; continue; }
      if (eindes.some((re) => re.test(t))) return { regels: uit, eind: t };
      i++;
      const reeks = t.match(PER_RE);
      if (reeks) {
        if (diepte > 0) meld(nr, 'per staat niet in een #for of #if');
        else if (per) meld(nr, 'per staat er al');
        else per = { teller: reeks[1], van: normaliseer(reeks[2].trim()), tot: normaliseer(reeks[3].trim()), regel: nr };
        continue;
      }
      const voor = t.match(FOR_RE);
      if (voor) {
        const binnen = blok([LOOP_RE], diepte + 1);
        if (binnen.eind === null) meld(nr, '#for zonder #loop');
        else i++;
        uit.push({ soort: 'for', regel: nr, teller: voor[1], van: normaliseer(voor[2].trim()), tot: normaliseer(voor[3].trim()), body: binnen.regels });
        continue;
      }
      const als = t.match(IF_RE);
      if (als) {
        const takken: { voorwaarde: string; body: KernRegel[] }[] = [{ voorwaarde: normaliseer(als[1].trim()), body: [] }];
        const anders: KernRegel[] = [];
        let huidig = takken[0].body;
        for (;;) {
          const b = blok([ELSE_IF_RE, ELSE_RE, ENDIF_RE], diepte + 1);
          huidig.push(...b.regels);
          if (b.eind === null) { meld(nr, '#if zonder #end if'); break; }
          i++;
          if (ENDIF_RE.test(b.eind)) break;
          const andersAls = b.eind.match(ELSE_IF_RE);
          if (andersAls) {
            const tak = { voorwaarde: normaliseer(andersAls[1].trim()), body: [] as KernRegel[] };
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
        meld(nr, `onbekende opdracht "${t.split(/\s+/)[0]}" (in een @kern-blok: #for … #loop en #if … #end if)`);
        continue;
      }
      const m = t.match(VELD_RE);
      if (!m) {
        meld(nr, 'schrijf pad = uitdrukking, bijvoorbeeld inputs.input.thicknessMm = h');
        continue;
      }
      const pad: KernPadDeel[] = m[1].split('.').map((deel) => {
        const d = deel.match(DEEL_RE)!;
        return d[2] === undefined ? { naam: d[1] } : { naam: d[1], index: normaliseer(d[2].trim()) };
      });
      if (pad.some((d) => d.index === '')) { meld(nr, 'een lijst krijgt een index: lijst[1]'); continue; }
      uit.push({ soort: 'veld', regel: nr, pad, expr: normaliseer(m[2].trim()) });
    }
    return { regels: uit, eind: null };
  }

  const { regels } = blok([], 0);
  return { naam, tool, ...(per ? { per } : {}), regels, fouten };
}

// ── Omrekenen naar het schema ────────────────────────────────────────────────

type MathUnit = { toNumber(eenheid?: string): number; toString(): string; dimensions?: number[] };
const isUnit = (w: unknown): w is MathUnit => math.isUnit(w);
const isObject = (x: unknown): x is Record<string, unknown> => !!x && typeof x === 'object' && !Array.isArray(x);
const isKaal = (w: unknown) => isObject(w) && !isUnit(w) && !math.isMatrix(w) && !math.isFraction(w) && !math.isBigNumber(w);

/** Op twaalf cijfers, zoals de hash: 84 mm is dan 84, niet 83,99999999999999. */
const rond12 = (v: number) => Number(v.toPrecision(12));

function getal(w: unknown, pad: string, eenheid: string | null): number | string | boolean {
  if (isUnit(w)) {
    // Een verhouding (5 kN gedeeld door 1 kN) is een getal.
    if (w.dimensions && w.dimensions.every((d) => d === 0)) return rond12(w.toNumber());
    if (!eenheid) throw new Error(`${pad}: dit veld heeft geen eenheid in zijn naam; geef een getal (deel door de eenheid, bijvoorbeeld m_x/(1 kN))`);
    let n: number;
    try {
      n = w.toNumber(eenheid);
    } catch {
      throw new Error(`${pad}: ${w.toString()} past niet in ${eenheid}`);
    }
    if (!Number.isFinite(n)) throw new Error(`${pad}: geen eindig getal`);
    return rond12(n);
  }
  if (math.isFraction(w) || math.isBigNumber(w)) return rond12(Number(w));
  if (typeof w === 'number') {
    if (!Number.isFinite(w)) throw new Error(`${pad}: geen eindig getal`);
    return rond12(w);
  }
  if (typeof w === 'string' || typeof w === 'boolean') return w;
  throw new Error(`${pad}: geen getal, tekst of ja/nee`);
}

/**
 * Een waarde zoals de tool hem verwacht: getallen in de eenheid uit de naam van het veld
 * (`thicknessMm`, `fcdMpa`, `length_m`), tekst en ja/nee zoals ze zijn. Werpt bij een
 * waarde die niet past.
 */
export function naarKernSchema(veld: string, w: unknown, pad = veld): unknown {
  if (math.isMatrix(w)) return naarKernSchema(veld, (w as { toArray(): unknown[] }).toArray(), pad);
  if (Array.isArray(w)) return w.map((x, i) => naarKernSchema(veld, x, `${pad}[${i + 1}]`));
  if (isKaal(w)) {
    const uit: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(w as Record<string, unknown>)) uit[k] = naarKernSchema(k, v, `${pad}.${k}`);
    return uit;
  }
  return getal(w, pad, eenheidVanVeld(veld));
}

// ── Rekenen ──────────────────────────────────────────────────────────────────

/** Wat het blok nodig heeft van de rekenkern (evaluator.ts). */
export interface KernRekenaar {
  reken(expr: string): unknown;
  /** Zet een naam (een teller) en geeft de functie die hem terugzet. */
  zet(naam: string, waarde: unknown): () => void;
  scope: Record<string, unknown>;
  opties: {
    toetsingen?: Record<string, ToetsAntwoord>;
    toetsModus?: 'vragen' | 'lezen';
    taal?: string;
    fem?: { versie?: string; schemas?: Record<string, string> };
  };
}

const melding = (e: unknown) => (e instanceof Error ? e.message : String(e)).replace(/^Error:\s*/, '');

function alsTeller(w: unknown, wat: string): number {
  const n = isUnit(w) ? (w.dimensions?.every((d) => d === 0) ? w.toNumber() : NaN) : typeof w === 'boolean' ? (w ? 1 : 0) : Number(w);
  if (!Number.isFinite(n)) throw new Error(`${wat}: geen getal`);
  return n;
}

type Boom = Record<string, unknown> | unknown[];

/** Zet een waarde op een pad in een boom van objecten en lijsten; werpt als er al iets staat. */
function zetOpPad(wortel: Record<string, unknown>, pad: { naam: string; index?: number }[], waarde: unknown, tekst: string): void {
  let hier: Boom = wortel;
  pad.forEach((deel, k) => {
    const laatste = k === pad.length - 1;
    const houder = hier as Record<string, unknown>;
    if (deel.index === undefined) {
      if (laatste) {
        if (deel.naam in houder) throw new Error(`het veld ${tekst} staat er al`);
        houder[deel.naam] = waarde;
        return;
      }
      const volgend = houder[deel.naam] ?? (houder[deel.naam] = {});
      if (!isObject(volgend)) throw new Error(`${tekst}: ${deel.naam} is al een waarde of een lijst`);
      hier = volgend;
      return;
    }
    const lijst = houder[deel.naam] ?? (houder[deel.naam] = []);
    if (!Array.isArray(lijst)) throw new Error(`${tekst}: ${deel.naam} is geen lijst`);
    const plek = deel.index - 1;
    if (laatste) {
      if (lijst[plek] !== undefined) throw new Error(`het veld ${tekst} staat er al`);
      lijst[plek] = waarde;
      return;
    }
    const volgend = lijst[plek] ?? (lijst[plek] = {});
    if (!isObject(volgend)) throw new Error(`${tekst}: ${deel.naam}[${deel.index}] is al een waarde`);
    hier = volgend;
  });
}

/** Een lijst met een gat (lijst[1] en lijst[3], zonder lijst[2]) kan niet verstuurd worden. */
function zoekGat(w: unknown, pad: string): string | null {
  if (Array.isArray(w)) {
    for (let k = 0; k < w.length; k++) {
      if (w[k] === undefined) return `${pad}[${k + 1}] ontbreekt`;
      const dieper = zoekGat(w[k], `${pad}[${k + 1}]`);
      if (dieper) return dieper;
    }
  } else if (isKaal(w)) {
    for (const [k, v] of Object.entries(w as Record<string, unknown>)) {
      const dieper = zoekGat(v, pad ? `${pad}.${k}` : k);
      if (dieper) return dieper;
    }
  }
  return null;
}

interface Aanroep {
  /** De waarden zoals het blad ze rekent, met hun eenheid: hierover gaat de hash. */
  invoer: Record<string, unknown>;
  /** De waarden zoals de tool ze krijgt. */
  argumenten: Record<string, unknown>;
}

/** Rekent de velden van één aanroep door. Zonder velden: null (overgeslagen). */
function leesAanroep(node: KernNode, r: KernRekenaar, fouten: string[]): Aanroep | null {
  const invoer: Record<string, unknown> = {};
  const argumenten: Record<string, unknown> = {};
  let velden = 0;
  let rondes = 0;
  const meld = (nr: number, tekst: string) => fouten.push(`regel ${nr}: ${tekst}`);

  function voerUit(regels: KernRegel[]) {
    for (const regel of regels) {
      if (regel.soort === 'veld') {
        try {
          const pad = regel.pad.map((d) => {
            if (d.index === undefined) return { naam: d.naam };
            const n = alsTeller(r.reken(d.index), `${d.naam}[…]`);
            if (!Number.isInteger(n) || n < 1 || n > 100000) throw new Error(`${d.naam}[${n}]: de index is een heel getal vanaf 1`);
            return { naam: d.naam, index: n };
          });
          const tekst = pad.map((d) => (d.index === undefined ? d.naam : `${d.naam}[${d.index}]`)).join('.');
          const w = r.reken(regel.expr);
          const laatste = pad[pad.length - 1].naam;
          const omgerekend = naarKernSchema(laatste, w, tekst);
          zetOpPad(invoer, pad, w, tekst);
          zetOpPad(argumenten, pad, omgerekend, tekst);
          velden++;
        } catch (e) {
          meld(regel.regel, melding(e));
        }
      } else if (regel.soort === 'for') {
        let van: number;
        let tot: number;
        try {
          van = alsTeller(r.reken(regel.van), '#for');
          tot = alsTeller(r.reken(regel.tot), '#for');
        } catch (e) {
          meld(regel.regel, melding(e));
          continue;
        }
        for (let k = van; k <= tot + 1e-9; k++) {
          if (++rondes > MAX_RONDES) {
            meld(regel.regel, `#for: meer dan ${MAX_RONDES} rondes`);
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
        let gekozen: KernRegel[] | null = null;
        for (const tak of regel.takken) {
          try {
            if (alsTeller(r.reken(tak.voorwaarde), '#if') !== 0) { gekozen = tak.body; break; }
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
  if (!velden) return null;
  const gat = zoekGat(argumenten, '');
  if (gat) fouten.push(gat);
  return { invoer, argumenten };
}

/** De uitkomsten van eerdere blokken per scope: een blok met dezelfde naam ruimt de zijne eerst op. */
const gezet = new WeakMap<object, Map<string, string[]>>();

function wisVariabelen(naam: string, scope: Record<string, unknown>): void {
  const namen = gezet.get(scope)?.get(naam);
  if (!namen) return;
  for (const n of namen) delete scope[n];
  gezet.get(scope)!.delete(naam);
}

const schoon = (sleutel: string) => sleutel.replace(/[^\p{L}\p{N}_]+/gu, '_');
/** Tussen de delen van een pad, tot de naam in de rekentaal (met _) en op het scherm (met een punt) gemaakt wordt. */
const SEP = '\u0000';
const isGetal = (w: unknown): w is number => typeof w === 'number' && Number.isFinite(w);
const isEnkel = (w: unknown): w is number | string | boolean => isGetal(w) || typeof w === 'string' || typeof w === 'boolean';
const alsWaarde = (w: number | string | boolean) => (typeof w === 'boolean' ? (w ? 1 : 0) : w);

/** De enkele waarden in een object, met het pad erheen; lijsten van getallen als lijst. */
function bladeren(w: unknown, pad: string, uit: Map<string, unknown>): void {
  if (isEnkel(w)) uit.set(pad, alsWaarde(w));
  else if (Array.isArray(w)) {
    if (w.length && w.every(isGetal)) uit.set(pad, w);
  } else if (isObject(w)) {
    for (const [k, v] of Object.entries(w)) bladeren(v, `${pad}${SEP}${schoon(k)}`, uit);
  }
}

/** Per pad de waarden van een lijst objecten als kolom: getallen (NaN waar het ontbreekt) of tekst. */
function kolommen(items: (unknown | null)[], pad: string, uit: Map<string, unknown>): void {
  const per = items.map((item) => {
    const m = new Map<string, unknown>();
    if (item !== null && item !== undefined) bladeren(item, pad, m);
    return m;
  });
  const paden = new Set(per.flatMap((m) => [...m.keys()]));
  for (const p of paden) {
    const waarden = per.map((m) => m.get(p));
    const eerste = waarden.find((v) => v !== undefined);
    if (typeof eerste === 'number') {
      if (waarden.every((v) => v === undefined || typeof v === 'number')) uit.set(p, math.matrix(waarden.map((v) => (v === undefined ? NaN : (v as number)))));
    } else if (typeof eerste === 'string') {
      if (waarden.every((v) => v === undefined || typeof v === 'string')) uit.set(p, math.matrix(waarden.map((v) => (v === undefined ? '' : (v as string))) as unknown as number[]));
    } else if (Array.isArray(eerste)) {
      // Een lijst getallen per item (een positie): een matrix met een rij per item.
      const n = eerste.length;
      if (waarden.every((v) => Array.isArray(v) && v.length === n)) uit.set(p, math.matrix(waarden as number[][]));
    }
  }
}

/** Het antwoord van één aanroep als namen in de rekentaal. */
function uitkomstNamen(w: unknown, pad: string, uit: Map<string, unknown>): void {
  if (isEnkel(w)) uit.set(pad, alsWaarde(w));
  else if (Array.isArray(w)) {
    if (!w.length) return;
    if (w.every(isGetal)) uit.set(pad, math.matrix(w));
    else if (w.every((rij) => Array.isArray(rij) && rij.length === (w[0] as unknown[]).length && rij.every(isGetal))) uit.set(pad, math.matrix(w as number[][]));
    else if (w.every(isObject)) kolommen(w, pad, uit);
  } else if (isObject(w)) {
    for (const [k, v] of Object.entries(w)) uitkomstNamen(v, `${pad}${SEP}${schoon(k)}`, uit);
  }
}

function waardeTekst(w: unknown): string {
  if (typeof w === 'number') return String(Number(w.toPrecision(6)));
  if (typeof w === 'string') return `"${w}"`;
  if (math.isMatrix(w)) {
    const maten = (w as { size(): number[] }).size();
    return maten.length === 1 ? `vector (${maten[0]})` : `matrix (${maten.join(' × ')})`;
  }
  return String(w);
}

/** Is het antwoord gemaakt met een andere FEM Studio of een ander schema dan die van nu? */
function verouderdVan(a: { versie?: string; schema?: string }, tool: string, fem: KernRekenaar['opties']['fem']): EvaluatedKern['verouderd'] {
  if (!fem) return undefined;
  if (fem.versie && a.versie && fem.versie !== a.versie) return { versie: fem.versie };
  const nu = fem.schemas?.[tool];
  if (nu && a.schema && nu !== a.schema) return { schema: true };
  return undefined;
}

export function bouwKern(node: KernNode, r: KernRekenaar): EvaluatedKern {
  const taal = r.opties.taal?.toLowerCase().startsWith('en') ? 'en' : 'nl';
  const basis = {
    type: 'kern' as const,
    naam: node.naam,
    tool: node.tool,
    taal,
    ...(node.hidden ? { verborgen: true } : {}),
    ...(node.scherm ? { scherm: true } : {}),
  };
  wisVariabelen(node.naam, r.scope);
  if (node.fouten.length) return { ...basis, status: 'fout', melding: node.fouten.join('; ') };

  // De aanroepen: één, of met `per` één per waarde van de teller.
  const fouten: string[] = [];
  let aanroepen: (Aanroep | null)[];
  if (node.per) {
    let van: number;
    let tot: number;
    try {
      van = alsTeller(r.reken(node.per.van), 'per');
      tot = alsTeller(r.reken(node.per.tot), 'per');
    } catch (e) {
      return { ...basis, status: 'fout', melding: `regel ${node.per.regel}: ${melding(e)}` };
    }
    if (tot - van + 1 > MAX_REEKS) return { ...basis, status: 'fout', melding: `regel ${node.per.regel}: meer dan ${MAX_REEKS} aanroepen` };
    aanroepen = [];
    for (let k = van; k <= tot + 1e-9; k++) {
      const herstel = r.zet(node.per.teller, k);
      try {
        const eigen: string[] = [];
        aanroepen.push(leesAanroep(node, r, eigen));
        fouten.push(...eigen.map((f) => `${node.per!.teller} = ${k}, ${f}`));
      } finally {
        herstel();
      }
      if (fouten.length > 5) break;
    }
  } else {
    aanroepen = [leesAanroep(node, r, fouten)];
    if (!aanroepen[0] && !fouten.length) fouten.push('het blok heeft geen velden');
  }
  if (fouten.length) return { ...basis, status: 'fout', melding: fouten.slice(0, 5).join('; ') };

  const overgeslagen = aanroepen.filter((a) => !a).length;
  const eerste = aanroepen.find((a) => a);
  const telling = { aanroepen: aanroepen.length, overgeslagen, ...(eerste ? { invoer: JSON.stringify(eerste.argumenten) } : {}) };
  const hash = node.per
    ? toetsHash(node.tool, { reeks: aanroepen.map((a) => (a ? a.invoer : null)) })
    : toetsHash(node.tool, eerste!.invoer);
  const vragen = r.opties.toetsModus === 'vragen';

  /** Zet de uitkomsten in de scope en onthoudt welke namen van dit blok zijn. */
  const zet = (namen: Map<string, unknown>): Pick<EvaluatedKern, 'uitkomsten' | 'aantalUitkomsten'> => {
    const inScope = [...namen.keys()].map((n) => n.split(SEP).join('_'));
    [...namen.values()].forEach((w, k) => {
      r.scope[inScope[k]] = w;
    });
    let perScope = gezet.get(r.scope);
    if (!perScope) gezet.set(r.scope, (perScope = new Map()));
    perScope.set(node.naam, inScope);
    const lijst = [...namen].map(([n, w]) => ({ naam: n.split(SEP).join('.'), waarde: waardeTekst(w) }));
    return { uitkomsten: lijst.slice(0, 60), aantalUitkomsten: lijst.length };
  };

  // Een reeks waarin elke aanroep is overgeslagen, vraagt niets.
  if (node.per && !eerste) {
    const namen = new Map<string, unknown>([[`${node.naam}${SEP}aantal`, aanroepen.length]]);
    if (aanroepen.length) namen.set(`${node.naam}${SEP}gerekend`, math.matrix(aanroepen.map(() => 0)));
    return { ...basis, hash, status: 'klaar', ...telling, ...zet(namen) };
  }

  const antwoord = r.opties.toetsingen?.[hash];
  if (!antwoord) {
    if (!vragen) return { ...basis, hash, status: 'niet-gerekend', melding: WOORDEN[taal].geenAntwoord, ...telling };
    const verzoek: ToetsVerzoek = node.per
      ? { hash, tool: node.tool, argumenten: {}, reeks: aanroepen.map((a) => (a ? a.argumenten : null)) }
      : { hash, tool: node.tool, argumenten: eerste!.argumenten };
    return { ...basis, hash, status: 'wacht', verzoek, ...telling };
  }
  // Na een fout mag het opnieuw: FEM Studio kan er intussen wel zijn.
  if (!antwoord.ok) return { ...basis, hash, status: 'fout', melding: antwoord.melding, ...telling, ...(vragen ? { opnieuw: true } : {}) };
  const herkomst = {
    ...(antwoord.versie ? { versie: antwoord.versie } : {}),
    ...(antwoord.datum ? { datum: antwoord.datum } : {}),
    ...(antwoord.waarschuwing ? { waarschuwing: antwoord.waarschuwing } : {}),
  };
  const mis = (tekst: string): EvaluatedKern => ({ ...basis, hash, status: 'fout', melding: tekst, ...telling, ...herkomst, ...(vragen ? { opnieuw: true } : {}) });

  const namen = new Map<string, unknown>();
  if (node.per) {
    const reeks = (antwoord.uitkomst as { reeks?: unknown } | null)?.reeks;
    if (!Array.isArray(reeks) || reeks.length !== aanroepen.length || reeks.some((u, k) => (u === null || u === undefined) !== !aanroepen[k])) {
      return mis('het vastgelegde antwoord past niet bij de aanroepen');
    }
    namen.set(`${node.naam}${SEP}aantal`, aanroepen.length);
    namen.set(`${node.naam}${SEP}gerekend`, math.matrix(aanroepen.map((a) => (a ? 1 : 0))));
    kolommen(reeks, node.naam, namen);
  } else {
    if (antwoord.uitkomst === null || antwoord.uitkomst === undefined) return mis('FEM Studio gaf geen uitkomst terug');
    uitkomstNamen(antwoord.uitkomst, node.naam, namen);
  }
  if (namen.size > MAX_UITKOMSTEN) return mis(`het antwoord heeft meer dan ${MAX_UITKOMSTEN} uitkomsten`);
  const verouderd = vragen ? verouderdVan(antwoord, node.tool, r.opties.fem) : undefined;
  const opnieuw = vragen && (!!verouderd || !!antwoord.waarschuwing);
  return { ...basis, hash, status: 'klaar', ...telling, ...zet(namen), ...herkomst, ...(verouderd ? { verouderd } : {}), ...(opnieuw ? { opnieuw } : {}) };
}

// ── Aanroepen ────────────────────────────────────────────────────────────────

/**
 * Doet het verzoek van een `@kern`-blok met de gegeven aanroep (`tools/call`): één
 * aanroep, of bij een reeks elke aanroep na elkaar, met de antwoorden samen als
 * `{ reeks: […] }` (null bij een overgeslagen aanroep). Een fout in één aanroep is een
 * fout van het geheel: een reeks met een gat is geen antwoord.
 */
export async function kernAanroepen(
  verzoek: ToetsVerzoek,
  roep: (tool: string, argumenten: Record<string, unknown>) => Promise<unknown>,
): Promise<unknown> {
  if (!verzoek.reeks) return roep(verzoek.tool, verzoek.argumenten);
  const reeks: unknown[] = [];
  for (let k = 0; k < verzoek.reeks.length; k++) {
    const argumenten = verzoek.reeks[k];
    if (!argumenten) {
      reeks.push(null);
      continue;
    }
    try {
      reeks.push(await roep(verzoek.tool, argumenten));
    } catch (e) {
      // Een fout met een code komt van de omgeving (er is geen server), niet van deze
      // ene aanroep: die gaat door zoals hij is, zodat de app zijn eigen melding toont.
      if (e && typeof e === 'object' && (e as { code?: unknown }).code) throw e;
      throw new Error(`aanroep ${k + 1} van ${verzoek.reeks.length}: ${melding(e)}`);
    }
  }
  return { reeks };
}

/** Wat er van een verzoek bij het blad bewaard wordt: de argumenten, of bij een reeks de reeks. */
export function kernVerzoekBewaard(verzoek: ToetsVerzoek): Record<string, unknown> {
  return verzoek.reeks ? { reeks: verzoek.reeks } : verzoek.argumenten;
}

// ── Tonen ────────────────────────────────────────────────────────────────────

const WOORDEN = {
  nl: {
    kern: 'Rekenkern', door: 'Open FEM Studio', versie: 'versie',
    wacht: 'Wordt gerekend door Open FEM Studio…', nietGerekend: 'NIET GEREKEND',
    geenAntwoord: 'er is geen antwoord van Open FEM Studio',
    opnieuw: 'Opnieuw rekenen', mislukt: 'Opnieuw rekenen lukte niet',
    telling: (n: number, over: number) => `${n} ${n === 1 ? 'aanroep' : 'aanroepen'}${over ? `, waarvan ${over} overgeslagen` : ''}`,
    details: 'Invoer en uitkomst', invoer: 'Invoer van de eerste aanroep', uitkomst: 'Uitkomst', meer: (n: number) => `… en nog ${n}`,
    verouderdVersie: (oud: string, nu: string) => `Gerekend met versie ${oud}; deze CalcSheet heeft FEM Studio ${nu}.`,
    verouderdSchema: (tool: string) => `Het schema van ${tool} is veranderd sinds deze berekening.`,
  },
  en: {
    kern: 'Calculation kernel', door: 'Open FEM Studio', versie: 'version',
    wacht: 'Being calculated by Open FEM Studio…', nietGerekend: 'NOT CALCULATED',
    geenAntwoord: 'there is no answer from Open FEM Studio',
    opnieuw: 'Calculate again', mislukt: 'Calculating again failed',
    telling: (n: number, over: number) => `${n} ${n === 1 ? 'call' : 'calls'}${over ? `, of which ${over} skipped` : ''}`,
    details: 'Input and result', invoer: 'Input of the first call', uitkomst: 'Result', meer: (n: number) => `… and ${n} more`,
    verouderdVersie: (oud: string, nu: string) => `Calculated with version ${oud}; this CalcSheet has FEM Studio ${nu}.`,
    verouderdSchema: (tool: string) => `The schema of ${tool} has changed since this calculation.`,
  },
} as const;

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function datumTekst(iso: string, taal: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return '';
  return taal === 'nl' ? `${Number(m[3])}-${Number(m[2])}-${m[1]}` : `${m[1]}-${m[2]}-${m[3]}`;
}

/**
 * Het blok op het blad: de kop met de tool en de versie van FEM Studio, het aantal
 * aanroepen, en alleen op het scherm de invoer en de uitkomsten. Geen oordeel: wat de
 * getallen betekenen, staat in het blad zelf.
 */
export function renderKern(node: EvaluatedKern): string {
  if (node.verborgen) return '';
  const w = WOORDEN[node.taal === 'en' ? 'en' : 'nl'];
  const datum = node.datum ? datumTekst(node.datum, node.taal) : '';
  // Het aantal aanroepen staat achter de kop: op papier is het blok dan één regel.
  const telling = node.status === 'klaar' ? `<span class="calc-kern-telling"> · ${esc(w.telling(node.aanroepen ?? 1, node.overgeslagen ?? 0))}</span>` : '';
  const kop = `<p class="calc-kern-kop"><strong>${esc(w.kern)} ${esc(node.naam)}</strong> — <code>${esc(node.tool)}</code>, ${esc(w.door)}${node.versie ? ` ${esc(w.versie)} ${esc(node.versie)}` : ''}${datum ? `<span class="alleen-scherm">, ${esc(datum)}</span>` : ''}${telling}</p>`;
  const scherm = node.scherm ? ' alleen-scherm' : '';
  const knop = node.opnieuw && node.hash ? ` <button type="button" class="calc-toets-opnieuw" data-toets-opnieuw="${esc(node.hash)}">${esc(w.opnieuw)}</button>` : '';
  if (node.status === 'wacht') {
    return `<div class="calc-kern calc-kern-wacht${scherm}" data-kern="${esc(node.hash ?? '')}">${kop}<p>${esc(w.wacht)}</p></div>`;
  }
  if (node.status !== 'klaar') {
    const tekst = `${w.nietGerekend}${node.melding ? `: ${node.melding}` : ''}`;
    const opnieuw = knop ? `<p class="alleen-scherm">${knop.trim()}</p>` : '';
    return `<div class="calc-kern calc-kern-fout${scherm}" data-kern="${esc(node.hash ?? '')}">${kop}<p class="calc-kern-melding">${esc(tekst)}</p>${opnieuw}</div>`;
  }
  const meldingen = [
    node.verouderd?.versie && node.versie ? w.verouderdVersie(node.versie, node.verouderd.versie) : '',
    node.verouderd?.schema ? w.verouderdSchema(node.tool) : '',
    node.waarschuwing ? `${w.mislukt}: ${node.waarschuwing}` : '',
  ].filter(Boolean);
  const verouderd = meldingen.length || knop ? `<p class="calc-toets-verouderd alleen-scherm">${meldingen.map(esc).join(' ')}${knop}</p>` : '';
  const rest =(node.aantalUitkomsten ?? 0) - (node.uitkomsten?.length ?? 0);
  const details = node.uitkomsten?.length
    ? `<details class="calc-kern-details alleen-scherm"><summary>${esc(w.details)}</summary>`
      + (node.invoer ? `<p><strong>${esc(w.invoer)}</strong></p><pre class="calc-kern-invoer">${esc(node.invoer.length > 2000 ? `${node.invoer.slice(0, 2000)} …` : node.invoer)}</pre>` : '')
      + `<p><strong>${esc(w.uitkomst)}</strong></p><table class="calc-kern-tabel"><tbody>${node.uitkomsten
        .map((u) => `<tr><td><code>${esc(u.naam)}</code></td><td>${esc(u.waarde)}</td></tr>`)
        .join('')}</tbody></table>${rest > 0 ? `<p>${esc(w.meer(rest))}</p>` : ''}</details>`
    : '';
  return `<div class="calc-kern${scherm}" data-kern="${esc(node.hash ?? '')}">${kop}${verouderd}${details}</div>`;
}

/** De opmaak, bij de andere blokken in renderer.ts. */
export const KERN_CSS = `
.calc-kern { margin: 6px 0 10px; }
.calc-kern-kop { margin: 0 0 4px; }
.calc-kern-telling { color: #6b7280; }
.calc-kern-fout .calc-kern-melding { color: #dc2626; font-weight: 600; }
.calc-kern-wacht p { color: #6b7280; font-style: italic; }
.calc-kern-details { margin-top: 4px; font-size: 0.92em; }
.calc-kern-invoer { white-space: pre-wrap; word-break: break-all; margin: 2px 0 6px; }
.calc-kern-tabel { border-collapse: collapse; }
.calc-kern-tabel td { border-bottom: 1px solid #e5e7eb; padding: 1px 10px 1px 0; }
`;
