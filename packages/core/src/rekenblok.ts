import type { MathNode } from 'mathjs';
import { evaluateMetScope, isEenheidNaam, rekenUitdrukking, uitdrukkingBoom, type Scope } from './evaluator.js';
import { parse } from './parser.js';
import type { AstNode, EvaluatedNode } from './types.js';

/**
 * Een los stuk rekentekst met ingangen en uitgangen: het codeblok van een
 * grafblad. Dezelfde parser en evaluator als een rekenblad; alleen de vraag
 * "welke namen komen van buiten" is nieuw.
 *
 * Wat erin mag: toekenningen, functies, `#if`, lussen en opdrachten als `#deg`.
 * Tekstregels en koppen worden overgeslagen. Een blok dat iets tekent of
 * uitvoert (`@js`, `@iframe`, `@3d`, `@svg`, een grafiek, een afbeelding) rekent
 * niet mee: het komt niet bij de evaluator en wordt als melding teruggegeven.
 *
 * Ingangen
 * --------
 * Een naam die wordt gebruikt voordat het blok hem definieert, is een ingang.
 * mathjs zou zo'n naam anders stil als eenheid of constante lezen: `L` als liter,
 * `b` als bit, `h` als uur, `e` als het getal van Euler. `q*L^2/8` zonder `L`
 * geeft dan een uitkomst in `kN L^2 / m`, zonder fout. Hier wordt zo'n naam een
 * ingang, en een ingang die niet is verbonden geeft een melding bij de node.
 *
 * Wat geen ingang is:
 *   • `pi`, `true`, `false`, `null`, `Infinity`, `NaN`
 *   • een functie die wordt aangeroepen (`max(a; b)`)
 *   • namen die met `_` beginnen: hulpnamen van de rekenkern
 *   • een eenheid in een grootheid, dus achter een getal: `5 m`, `2.5 kN`,
 *     `5 kN/m`, `2 kN*m`, `9.81 m/s^2`, `3 kW/(m^2*K)`; rechts van `to`: alles
 *   • een eenheid die als naam niet te verwarren is, ook zonder getal ervoor:
 *     `x kN`, `F/mm^2` (ONMISKENBAAR)
 *
 * Eén letter is alleen een eenheid als die naam in de bouw vrijwel altijd een
 * eenheid is. Direct achter een getal: `m`, `s`, `g`, `N`, `K`; achter `/`: `m`,
 * `s` en `K`; achter `*` alleen `m`. `2 L` is dus twee keer de ingang `L`, `2 m*L`
 * twee meter keer de ingang `L` en `5 kN/m*s` een lijnlast keer de ingang `s`. Wie
 * de eenheid bedoelt, schrijft hem voluit: `2 liter`, `220 volt`, `3 hour`.
 */

/** Namen die de rekentaal zelf kent en die nooit een ingang worden. */
const VASTE_NAMEN = new Set(['pi', 'true', 'false', 'null', 'Infinity', 'NaN']);

/** Eenheden die ook zonder getal ervoor een eenheid zijn. Geen naam die ook een grootheid kan zijn. */
const ONMISKENBAAR = new Set([
  'mm', 'cm', 'dm', 'km', 'kN', 'MN', 'kPa', 'MPa', 'GPa', 'kg', 'deg', 'rad', 'degC',
]);

/** Eén letter die direct achter een getal een eenheid is. */
const LETTER_ACHTER_GETAL = new Set(['m', 's', 'g', 'N', 'K']);
/** Eén letter die achter een deelstreep een eenheid is (`kN/m`, `m/s`, `kW/K`). */
const LETTER_ACHTER_DEEL = new Set(['m', 's', 'K']);
/** Eén letter die achter een maalteken een eenheid is (`kN*m`). */
const LETTER_ACHTER_KEER = new Set(['m']);
/** Geldige eenheden die in de constructieleer een stijfheid zijn. */
const GEEN_EENHEID = new Set(['EA', 'GA', 'EJ', 'GJ']);

const LETTERS = { kop: LETTER_ACHTER_GETAL, deel: LETTER_ACHTER_DEEL, keer: LETTER_ACHTER_KEER };
type Stand = keyof typeof LETTERS;

function isEenheid(naam: string, stand: Stand): boolean {
  if (GEEN_EENHEID.has(naam) || !isEenheidNaam(naam)) return false;
  return naam.length > 1 || LETTERS[stand].has(naam);
}

/* De delen van een mathjs-boom, zo ver als dit bestand ze nodig heeft. */
interface Knoop {
  type: string;
  name?: string;
  fn?: unknown;
  op?: string;
  args?: MathNode[];
  content?: MathNode;
  value?: unknown;
  implicit?: boolean;
  params?: string[];
  expr?: MathNode;
  object?: MathNode;
  index?: MathNode;
  dimensions?: MathNode[];
  items?: MathNode[];
  properties?: Record<string, MathNode>;
  condition?: MathNode;
  trueExpr?: MathNode;
  falseExpr?: MathNode;
  blocks?: { node: MathNode }[];
  start?: MathNode;
  end?: MathNode;
  step?: MathNode | null;
}
const knoop = (n: MathNode) => n as unknown as Knoop;

/** Een getal, ook met een teken of als breuk: `5`, `-5`, `1/2`, `(3)`. */
function isGetal(n: MathNode): boolean {
  const k = knoop(n);
  if (k.type === 'ConstantNode') return typeof k.value === 'number';
  if (k.type === 'ParenthesisNode') return isGetal(k.content!);
  if (k.type === 'OperatorNode') {
    if (k.args?.length === 1 && (k.op === '-' || k.op === '+')) return isGetal(k.args[0]);
    if (k.args?.length === 2 && k.op === '/') return k.args.every(isGetal);
  }
  return false;
}

/**
 * Bestaat deze term alleen uit eenheden, zoals `m`, `m^2`, `(m^2*K)` of `kN/m`?
 * `stand`: wat er vóór deze term staat. Binnen de term blijft die gelden; achter
 * een deelstreep gaat hij over op `deel`.
 */
function isEenheidTerm(n: MathNode, stand: Stand): boolean {
  const k = knoop(n);
  if (k.type === 'SymbolNode') return isEenheid(k.name!, stand);
  if (k.type === 'ParenthesisNode') return isEenheidTerm(k.content!, stand);
  if (k.type !== 'OperatorNode' || k.args?.length !== 2) return false;
  if (k.op === '^') return isEenheidTerm(k.args[0], stand) && isGetal(k.args[1]);
  if (k.op === '*') return isEenheidTerm(k.args[0], stand) && isEenheidTerm(k.args[1], stand);
  if (k.op === '/') return isEenheidTerm(k.args[0], stand) && isEenheidTerm(k.args[1], 'deel');
  return false;
}

/** Is dit een getal met een eenheid erachter: `5 m`, `5 kN/m`, `2 kN*m`? */
function isGrootheid(n: MathNode): boolean {
  const k = knoop(n);
  if (k.type === 'ParenthesisNode') return isGrootheid(k.content!);
  if (k.type !== 'OperatorNode' || k.args?.length !== 2) return false;
  if (k.op === '*' && k.implicit) return isGetal(k.args[0]) && isEenheidTerm(k.args[1], 'kop');
  if (k.op === '*') return isGrootheid(k.args[0]) && isEenheidTerm(k.args[1], 'keer');
  if (k.op === '/') return isGrootheid(k.args[0]) && isEenheidTerm(k.args[1], 'deel');
  return false;
}

/**
 * Loopt door een uitdrukking en meldt elke naam die geen eenheid, functie of
 * vaste naam is. `lokaal`: namen van een functie-parameter hier.
 */
function loopNamen(n: MathNode, lokaal: Set<string>, meld: (naam: string) => void): void {
  const k = knoop(n);
  const verder = (m: MathNode | null | undefined, l = lokaal) => {
    if (m) loopNamen(m, l, meld);
  };
  switch (k.type) {
    case 'ConstantNode':
      return;
    case 'SymbolNode': {
      const naam = k.name!;
      if (lokaal.has(naam) || VASTE_NAMEN.has(naam) || naam.startsWith('_') || ONMISKENBAAR.has(naam)) return;
      meld(naam);
      return;
    }
    case 'ParenthesisNode':
      verder(k.content);
      return;
    case 'OperatorNode': {
      if (isGrootheid(n)) return;
      if (k.op === 'to' || k.op === 'in') {
        // Rechts van `to` staat de doeleenheid.
        verder(k.args?.[0]);
        if (k.args?.[1] && !alleEenheden(k.args[1])) verder(k.args[1]);
        return;
      }
      // `(a + b) m`, `x m`: de naam blijft een ingang, tenzij hij onmiskenbaar is.
      for (const a of k.args ?? []) verder(a);
      return;
    }
    case 'FunctionNode': {
      const fn = k.fn as MathNode | undefined;
      if (fn && knoop(fn).type !== 'SymbolNode') verder(fn);
      for (const a of k.args ?? []) verder(a);
      return;
    }
    case 'FunctionAssignmentNode': {
      const binnen = new Set(lokaal);
      for (const p of k.params ?? []) binnen.add(p);
      verder(k.expr, binnen);
      return;
    }
    case 'AssignmentNode':
      verder(k.object);
      verder(k.index);
      verder(k.value as MathNode);
      return;
    case 'AccessorNode':
      verder(k.object);
      verder(k.index);
      return;
    case 'IndexNode':
      for (const d of k.dimensions ?? []) verder(d);
      return;
    case 'ArrayNode':
      for (const i of k.items ?? []) verder(i);
      return;
    case 'ObjectNode':
      for (const p of Object.values(k.properties ?? {})) verder(p);
      return;
    case 'ConditionalNode':
      verder(k.condition);
      verder(k.trueExpr);
      verder(k.falseExpr);
      return;
    case 'BlockNode':
      for (const b of k.blocks ?? []) verder(b.node);
      return;
    case 'RangeNode':
      verder(k.start);
      verder(k.end);
      verder(k.step);
      return;
    default:
      return;
  }
}

/** Rechts van `to`: alles wat een geldige eenheid is, ook één letter. */
function alleEenheden(n: MathNode): boolean {
  const k = knoop(n);
  if (k.type === 'SymbolNode') return isEenheidNaam(k.name!);
  if (k.type === 'ParenthesisNode') return alleEenheden(k.content!);
  if (k.type === 'ConstantNode') return true;
  if (k.type === 'OperatorNode') return (k.args ?? []).every(alleEenheden);
  return false;
}

export interface RekenblokAnalyse {
  /** De namen die van buiten moeten komen, op volgorde van eerste gebruik. */
  ingangen: string[];
  /** Wat het blok definieert, op volgorde; zonder functies, lustellers, hulpnamen en wat onder `#hide` staat. */
  uitgangen: string[];
  /** Wat niet meerekent: een blok dat tekent of uitvoert. */
  meldingen: string[];
  /** De tekst is niet te lezen. */
  fout?: string;
}

const NIET_IN_BLOK: Partial<Record<AstNode['type'], string>> = {
  js: '@js', iframe: '@iframe', ifcx: '@ifcx', '3d': '@3d', svg: '@svg', plot: '$Plot', image: '@image',
  select: '@select', 'gef-upload': '@gef', last: '@last',
};

interface Gelezen {
  analyse: RekenblokAnalyse;
  /** De knopen die de evaluator mag zien. */
  nodes: AstNode[];
}

interface Loop {
  uit: RekenblokAnalyse;
  bekend: Set<string>;
  /**
   * Functies, die pas rekenen als ze worden aangeroepen: `f(x) = x + c` mag vóór
   * `c = 2` staan. Hun namen tellen daarom aan het eind van het blok.
   */
  functies: { expressie: string; params: string[] }[];
}

function namenVan(expr: string, lokaal: Set<string>, l: Loop): void {
  let boom: MathNode;
  try {
    boom = uitdrukkingBoom(expr);
  } catch {
    // Een regel die nog niet af is: die meldt de evaluator bij zijn naam. De rest
    // van het blok houdt zijn poorten, anders vallen bij elke toets de verbindingen weg.
    return;
  }
  loopNamen(boom, lokaal, (naam) => {
    if (!l.bekend.has(naam) && !l.uit.ingangen.includes(naam)) l.uit.ingangen.push(naam);
  });
}

function loopBlok(nodes: AstNode[], l: Loop): AstNode[] {
  const { uit, bekend } = l;
  const gebruik = (expr: string) => namenVan(expr, new Set(), l);
  const definieer = (naam: string, uitgang: boolean) => {
    bekend.add(naam);
    if (uitgang && !naam.startsWith('_') && !uit.uitgangen.includes(naam)) uit.uitgangen.push(naam);
  };
  const houd: AstNode[] = [];
  for (const n of nodes) {
    switch (n.type) {
      case 'heading':
      case 'text':
        break;
      case 'assignment':
        gebruik(n.expression);
        if (n.index !== undefined) gebruik(n.index);
        if (n.index === undefined) definieer(n.name, !n.hidden);
        else if (!bekend.has(n.name) && !uit.ingangen.includes(n.name)) uit.ingangen.push(n.name);
        // Niet verborgen voor de evaluator: alleen dan meldt hij een fout in de regel.
        houd.push({ ...n, hidden: false });
        break;
      case 'input-prompt':
        definieer(n.name, !n.hidden);
        houd.push(n);
        break;
      case 'user-function':
        l.functies.push({ expressie: n.expression, params: n.params });
        definieer(n.name, false);
        houd.push(n);
        break;
      case 'var-display':
        // Toont alleen iets; rekent niet mee, maar de naam moet wel bestaan.
        if (!bekend.has(n.name) && !uit.ingangen.includes(n.name)) uit.ingangen.push(n.name);
        break;
      case 'conditional': {
        const takken = n.branches.map((t) => {
          gebruik(t.condition);
          return { condition: t.condition, body: loopBlok(t.body, l) };
        });
        const elseBody = loopBlok(n.elseBody, l);
        houd.push({ ...n, branches: takken, elseBody });
        break;
      }
      case 'repeat': {
        if (n.count) gebruik(n.count);
        if (n.conditie) gebruik(n.conditie);
        // De teller van een `#for` is een verborgen toekenning vooraan in de
        // lus (parser.ts) en wordt dus geen uitgang.
        houd.push({ ...n, body: loopBlok(n.body, l) });
        break;
      }
      case 'opdracht':
      case 'break':
        houd.push(n);
        break;
      default: {
        const soort = NIET_IN_BLOK[n.type] ?? n.type;
        if (!uit.meldingen.includes(soort)) uit.meldingen.push(soort);
      }
    }
  }
  return houd;
}

/* Hetzelfde blok rekent bij een lijst vele keren en bij elke schuifstand opnieuw. */
const gelezen = new Map<string, Gelezen>();
const BEWAARD = 500;

function leesBlok(tekst: string): Gelezen {
  let g = gelezen.get(tekst);
  if (g) return g;
  const analyse: RekenblokAnalyse = { ingangen: [], uitgangen: [], meldingen: [] };
  let nodes: AstNode[] = [];
  try {
    const loop: Loop = { uit: analyse, bekend: new Set(), functies: [] };
    nodes = loopBlok(parse(tekst), loop);
    for (const f of loop.functies) namenVan(f.expressie, new Set(f.params), loop);
  } catch (err) {
    analyse.ingangen = [];
    analyse.uitgangen = [];
    analyse.fout = (err as Error).message;
    nodes = [];
  }
  g = { analyse, nodes };
  if (gelezen.size >= BEWAARD) gelezen.clear();
  gelezen.set(tekst, g);
  return g;
}

/** Welke namen een blok van buiten nodig heeft en wat het oplevert. Werpt niet. */
export function analyseerRekenblok(tekst: string): RekenblokAnalyse {
  return leesBlok(tekst).analyse;
}

export interface RekenblokUitkomst {
  /** De uitgangen met hun waarde, met eenheid; een mislukte uitgang ontbreekt. */
  uitgangen: Record<string, unknown>;
  /** De regels die niet uit te rekenen waren. */
  fouten: { naam: string; tekst: string }[];
}

const FOUT_RE = /^Error(?: evaluating condition)?:\s*/;

function verzamelFouten(nodes: EvaluatedNode[], uit: RekenblokUitkomst['fouten']): void {
  for (const n of nodes) {
    if (n.type === 'conditional-branch') verzamelFouten(n.children, uit);
    else if (n.type === 'assignment' && FOUT_RE.test(n.result)) uit.push({ naam: n.name, tekst: n.result.replace(FOUT_RE, '') });
    else if (n.type === 'text' && FOUT_RE.test(n.text)) uit.push({ naam: '', tekst: n.text.replace(FOUT_RE, '') });
  }
}

/**
 * Rekent een blok door met de gegeven ingangen. Een mislukte regel laat NaN achter
 * in de scope (evaluator.ts); zo'n uitgang ontbreekt hier. Werpt niet.
 */
export function rekenRekenblok(tekst: string, ingangen: Scope): RekenblokUitkomst {
  const { analyse, nodes } = leesBlok(tekst);
  if (analyse.fout) return { uitgangen: {}, fouten: [{ naam: '', tekst: analyse.fout }] };
  const fouten: RekenblokUitkomst['fouten'] = [];
  const uitgangen: Record<string, unknown> = {};
  try {
    const { nodes: uit, scope } = evaluateMetScope(nodes, {}, ingangen);
    verzamelFouten(uit, fouten);
    const mislukt = new Set(fouten.map((f) => f.naam));
    for (const naam of analyse.uitgangen) {
      if (mislukt.has(naam) || !(naam in scope)) continue;
      const w = scope[naam];
      if (typeof w === 'number' && Number.isNaN(w)) continue;
      uitgangen[naam] = w;
    }
  } catch (err) {
    fouten.push({ naam: '', tekst: (err as Error).message });
  }
  return { uitgangen, fouten };
}

/**
 * Eén waarde zoals je hem in een blad typt: `5 kN/m`, `0,5`, `2 * 3 m`. Zelfde
 * lezing als de rechterkant van een toekenning. Werpt als het geen waarde wordt.
 */
export function rekenWaarde(tekst: string, scope: Scope = {}): unknown {
  const schoon = tekst.trim();
  if (!schoon) throw new Error('Geen waarde');
  // Een komma tussen cijfers is een decimaalteken, zoals in een invoerveld.
  const nodes = parse(`__w = ${schoon.replace(/(\d),(\d)/g, '$1.$2')}`);
  const [eerste] = nodes;
  if (nodes.length !== 1 || eerste.type !== 'assignment') throw new Error(`Geen waarde: ${schoon}`);
  const w = rekenUitdrukking(eerste.expression, { ...scope }) as { isUnit?: boolean; value?: unknown } | null;
  // Een losse eenheid (`m`) is geen waarde, en rekent verderop als NaN.
  if (w && w.isUnit && w.value === null) throw new Error(`Eenheid zonder getal: ${schoon}`);
  return w;
}
