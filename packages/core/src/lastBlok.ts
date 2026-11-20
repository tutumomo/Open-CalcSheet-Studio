import { math } from './eenheden.js';
import { eenheidInBeeld, type Stelsel } from './eenheidstelsel.js';
import { weergaveNaam } from './latex.js';
import { verwijzingenInMelding } from './verwijzing.js';
import type { EvaluatedLast, LastBlok, LastNode, LastRegel, LastRij } from './types.js';

/**
 * Een lijnlast of puntlast uit belastingen: het blok `@last`.
 *
 *   @last q_L1 "Ligger L1, as 2" lijn
 *     g_v3; 3.6 m
 *     g_w1; 1
 *     Q: q_k1; 3.6 m; "vloer, categorie A"
 *     25 kN/m^3*0.3 m*0.5 m
 *   @end
 *   q_Ed = 1.2*q_L1,G + 1.5*q_L1,Q
 *
 * De kop is `@last symbool "naam" lijn` of `… punt`. De naam en de soort mogen weg;
 * zonder soort is het een lijnlast. Elke regel is een belasting maal haar factoren,
 * gescheiden door `;`: eerst de bron (een belasting uit hoofdstuk 5 van het rapport, zoals
 * `g_v3`, of een uitdrukking), dan een belastingbreedte, oppervlak, lengte of getal.
 * Zonder voorvoegsel is een regel blijvend (G), met `Q:` veranderlijk. Een laatste deel
 * tussen aanhalingstekens is de omschrijving. Lege regels en regels die met `//` beginnen
 * tellen niet, ook niet in het regelnummer van een melding. `#if` en `#for` werken in dit
 * blok niet.
 *
 * Het product van een regel is een kracht per lengte (lijn) of een kracht (punt). Klopt
 * dat niet, of rekent een regel niet, dan is het blok een fout en bestaan de uitkomsten
 * niet.
 *
 * Na het blok staan in de scope, met S het symbool:
 *   S          de som van alles (G + Q), in kN/m of kN
 *   S,G  S,Q   het blijvende en het veranderlijke deel, als S een liggend streepje heeft
 *              (`q_L1,G`); anders S_G en S_Q (`Gk_G`). Beide bestaan altijd, ook als ze 0 zijn.
 * Een komma in een naam is in de rekenkern een liggend streepje: `q_L1,G` is `q_L1_G`.
 *
 * Het blok rekent zelf en vraagt niets aan Open FEM Studio. `leesLastBlok` en
 * `schrijfLastBlok` zijn zuiver: de app maakt er een formulier mee.
 */

/** De kopregel van het blok; `leesLastKop` leest wat erachter staat. */
export const LAST_START_RE = /^@last(?![\p{L}\p{N}_])/iu;

const EIND_RE = /^@end\s*$/;
const NAAM = '[\\p{L}_][\\p{L}\\p{N}_]*';
const NAAM_RE = new RegExp(`^${NAAM}$`, 'u');
/** Een naam in de rekentaal; met een liggend streepje mag er een komma in de index (`F_Ed,1`). */
const SYMBOOL_RE = new RegExp(`^(?:${NAAM}|${NAAM}_[\\p{L}\\p{N}_]+(?:,[\\p{L}\\p{N}_]+)+)$`, 'u');
const VOORVOEGSEL_RE = /^([GQ])\s*:\s*(.*)$/i;
const TEKST_RE = /^"([^"]*)"$/;
/** `#if`, `#for`, `#hide`, …; een verwijzing naar een ander blad (`#2.R_A`) is het niet. */
const OPDRACHT_RE = /^#[A-Za-z]+(?=\s|$)/;

const VORM = '@last symbool "naam" lijn of punt, bijvoorbeeld @last q_L1 "Ligger L1" lijn';
const ZONDER_EIND = '@last-blok zonder @end';

// ── Lezen ────────────────────────────────────────────────────────────────────

/** De kop van een `@last`-blok. */
export interface LastKop {
  symbool: string;
  naam: string;
  soort: 'lijn' | 'punt';
  fouten: string[];
}

/**
 * Leest de kopregel `@last symbool "naam" lijn|punt`. De naam en de soort mogen weg.
 * Wat niet klopt, staat in `fouten`; het symbool blijft dan zoals het er staat.
 */
export function leesLastKop(regel: string): LastKop {
  const fouten: string[] = [];
  let rest = regel.trim().replace(LAST_START_RE, '').trim();
  let symbool = rest.match(/^[^\s"]+/)?.[0] ?? '';
  rest = rest.slice(symbool.length).trim();
  let naam = '';
  const tekst = rest.match(/^"([^"]*)"/);
  if (tekst) {
    naam = tekst[1].trim();
    rest = rest.slice(tekst[0].length).trim();
  }
  let soort: 'lijn' | 'punt' = 'lijn';
  // `@last punt`: alleen de soort, zoals een blok zonder symbool en naam geschreven wordt.
  if (!tekst && !rest && /^(?:lijn|punt)$/i.test(symbool)) {
    rest = symbool;
    symbool = '';
  }
  if (!symbool) fouten.push(`kop: het symbool ontbreekt; schrijf ${VORM}`);
  else if (!SYMBOOL_RE.test(symbool)) fouten.push(`kop: "${symbool}" is geen naam in de rekentaal; schrijf ${VORM}`);
  if (rest.startsWith('"')) fouten.push('kop: de naam tussen aanhalingstekens is niet afgesloten');
  else if (rest) {
    const woord = rest.toLowerCase();
    if (woord === 'lijn' || woord === 'punt') soort = woord;
    else fouten.push(`kop: de soort is lijn of punt, niet "${rest}"`);
  }
  return { symbool, naam, soort, fouten };
}

/** Splitst op `;` buiten haakjes en aanhalingstekens. */
function splits(tekst: string): string[] {
  const uit: string[] = [];
  let diepte = 0;
  let tekenreeks = false;
  let begin = 0;
  for (let i = 0; i < tekst.length; i++) {
    const c = tekst[i];
    if (c === '"') tekenreeks = !tekenreeks;
    else if (tekenreeks) continue;
    else if ('([{'.includes(c)) diepte++;
    else if (')]}'.includes(c)) diepte = Math.max(0, diepte - 1);
    else if (c === ';' && diepte === 0) {
      uit.push(tekst.slice(begin, i).trim());
      begin = i + 1;
    }
  }
  uit.push(tekst.slice(begin).trim());
  return uit;
}

/** Eén regel: `[G:|Q:] bron[; factor]*[; "omschrijving"]`. De regel blijft, ook met een fout. */
function leesRegel(tekst: string, nr: number, fouten: string[]): LastRegel {
  const meld = (wat: string) => fouten.push(`regel ${nr}: ${wat}`);
  const voor = tekst.match(VOORVOEGSEL_RE);
  const soort = voor?.[1].toUpperCase() === 'Q' ? 'Q' : 'G';
  const delen = splits(voor ? voor[2] : tekst);
  let omschrijving: string | undefined;
  const slot = delen[delen.length - 1].match(TEKST_RE);
  if (slot) {
    delen.pop();
    omschrijving = slot[1].trim() || undefined;
  }
  const [bron = '', ...factoren] = delen;
  const opdracht = tekst.match(OPDRACHT_RE);
  if (opdracht) meld(`${opdracht[0]} werkt niet in een @last-blok`);
  else if (bron === '') meld('de bron ontbreekt; schrijf bron; factor; "omschrijving"');
  else if (factoren.includes('')) meld('een lege factor: twee keer ; achter elkaar, of een ; aan het eind');
  else if ([bron, ...factoren].some((d) => d.includes('"'))) meld('de omschrijving tussen aanhalingstekens staat aan het eind van de regel');
  return { soort, bron, factoren, ...(omschrijving ? { omschrijving } : {}) };
}

/** De regels tussen de kop en `@end`; lege regels en commentaar tellen niet. */
function leesRegels(bron: readonly string[], fouten: string[]): LastRegel[] {
  const uit: LastRegel[] = [];
  for (const ruw of bron) {
    const t = ruw.trim();
    if (t === '' || t.startsWith('//')) continue;
    uit.push(leesRegel(t, uit.length + 1, fouten));
  }
  return uit;
}

/**
 * Leest een heel blok, van `@last …` tot en met `@end`, als structuur: de tekst van het
 * blok of zijn regels. Zuiver: er wordt niets gerekend. Wat na `@end` staat, telt niet.
 */
export function leesLastBlok(bron: string | readonly string[]): LastBlok {
  const regels = typeof bron === 'string' ? bron.split(/\r?\n/) : [...bron];
  const begin = regels.findIndex((r) => r.trim() !== '');
  if (begin === -1 || !LAST_START_RE.test(regels[begin].trim())) {
    return { symbool: '', naam: '', soort: 'lijn', regels: [], fouten: [`het blok begint met ${VORM}`] };
  }
  const kop = leesLastKop(regels[begin]);
  const rest = regels.slice(begin + 1);
  const eind = rest.findIndex((r) => EIND_RE.test(r.trim()));
  const fouten = [...kop.fouten];
  const gelezen = leesRegels(eind === -1 ? rest : rest.slice(0, eind), fouten);
  if (eind === -1) fouten.push(ZONDER_EIND);
  return { symbool: kop.symbool, naam: kop.naam, soort: kop.soort, regels: gelezen, fouten };
}

/** Op één regel en zonder dubbele aanhalingstekens: zo past een tekst tussen aanhalingstekens. */
const alsTekst = (t: string) => t.replace(/"/g, "'").replace(/[\r\n]+/g, ' ').trim();
const opEenRegel = (t: string) => t.replace(/[\r\n]+/g, ' ').trim();

/**
 * De tekst van een blok, met `@last …` en `@end`. Lezen, schrijven en weer lezen geeft
 * dezelfde structuur. Een dubbel aanhalingsteken in een naam of omschrijving wordt een
 * enkel: de rekentaal kent er geen andere schrijfwijze voor. Een spatie in het symbool
 * vervalt: daar zou de kop op breken.
 */
export function schrijfLastBlok(blok: Pick<LastBlok, 'symbool' | 'naam' | 'soort' | 'regels'>): string {
  const naam = alsTekst(blok.naam);
  const kop = ['@last', blok.symbool.replace(/[\s"]+/g, ''), naam ? `"${naam}"` : '', blok.soort === 'punt' ? 'punt' : 'lijn'].filter(Boolean).join(' ');
  const regels = blok.regels.map((r) => {
    const omschrijving = alsTekst(r.omschrijving ?? '');
    const tekst = [opEenRegel(r.bron), ...r.factoren.map(opEenRegel), ...(omschrijving ? [`"${omschrijving}"`] : [])].join('; ');
    // `G:` alleen waar de regel anders niet of anders terug te lezen is.
    const voor = r.soort === 'Q' ? 'Q: ' : tekst === '' || VOORVOEGSEL_RE.test(tekst) ? 'G: ' : '';
    return `  ${voor}${tekst}`;
  });
  return [kop, ...regels, '@end'].join('\n');
}

/**
 * De namen van de uitkomsten in de rekentaal: `q_L1`, `q_L1,G` en `q_L1,Q`, of zonder
 * liggend streepje in het symbool `Gk`, `Gk_G` en `Gk_Q`.
 */
export function lastNamen(symbool: string): { som: string; G: string; Q: string } {
  const teken = symbool.includes('_') ? ',' : '_';
  return { som: symbool, G: `${symbool}${teken}G`, Q: `${symbool}${teken}Q` };
}

/** Een naam uit het blad zoals hij in de scope staat: een komma in de index is een liggend streepje. */
const inScope = (naam: string) => naam.replace(/,/g, '_');

/** Het blok voor de parser: de kop en de regels, met per regel de uitdrukkingen voor de rekenkern. */
export function leesLastNode(kop: string, bron: readonly string[], normaliseer: (expr: string) => string): Omit<LastNode, 'type'> {
  const k = leesLastKop(kop);
  const fouten = [...k.fouten];
  const regels = leesRegels(bron, fouten).map((r) => ({ ...r, expr: [r.bron, ...r.factoren].map((deel) => normaliseer(deel)) }));
  return { symbool: k.symbool, naam: k.naam, soort: k.soort, regels, fouten };
}

// ── Rekenen ──────────────────────────────────────────────────────────────────

/** Wat het blok nodig heeft van de rekenkern (evaluator.ts). */
export interface LastRekenaar {
  reken(expr: string): unknown;
  scope: Record<string, unknown>;
  opties: {
    taal?: string;
    /** Het eenhedenstelsel van de weergave: de kolommen staan in zijn lijnlast of kracht. */
    stelsel?: Stelsel;
    /** `namen`: de weergavenaam bij een variabele uit de projecttekst (`g_v3` → "1e–3e verdieping"). */
    project?: { namen?: Record<string, string> };
  };
  /** Een getal in de notatie van het blad: vier cijfers, of de decimalen van `#round`. */
  getal(n: number): string;
  /** Een waarde zoals het blad hem toont, in het eenhedenstelsel: het getal en de eenheid (`kN / m^2`). */
  toon(waarde: unknown): { getal: string; eenheid: string };
}

type MathUnit = { toNumber(eenheid: string): number; to(eenheid: string): MathUnit; equalBase(u: unknown): boolean; value: number | null };
const isUnit = (w: unknown): w is MathUnit => math.isUnit(w);

/** De eenheid waarin het blok rekent en zijn uitkomsten in de scope zet. */
const BASIS = { lijn: 'kN/m', punt: 'kN' } as const;
/** Dezelfde eenheid zoals de rekenkern hem schrijft. */
const IN_KERN = { lijn: 'kN / m', punt: 'kN' } as const;

/** De eenheid van de kolommen: die van het eenhedenstelsel als hij past, anders kN/m of kN. */
function blokEenheid(soort: 'lijn' | 'punt', stelsel: Stelsel | undefined): string {
  const doel = stelsel?.[soort === 'lijn' ? 'lijnlast' : 'kracht'];
  if (doel) {
    try {
      if (math.unit(doel).equalBase(math.unit(BASIS[soort]))) return doel;
    } catch {
      /* een eenheid die de kern niet kent: zoals het blad */
    }
  }
  return IN_KERN[soort];
}

/** De melding van de rekenkern bij een deel van een regel; een onbekende naam in gewone woorden. */
function rekenfout(e: unknown, deel: string): string {
  const tekst = verwijzingenInMelding((e instanceof Error ? e.message : String(e)).replace(/^Error:\s*/, ''));
  const onbekend = tekst.match(/^Undefined symbol (\S+)$/);
  return onbekend ? `de naam ${onbekend[1]} is niet bekend` : `${deel}: ${tekst}`;
}

export function bouwLast(node: LastNode, r: LastRekenaar): EvaluatedLast {
  const taal = r.opties.taal?.toLowerCase().startsWith('en') ? 'en' : 'nl';
  const eenheid = blokEenheid(node.soort, r.opties.stelsel);
  const basis = {
    type: 'last' as const,
    symbool: node.symbool,
    naam: node.naam,
    soort: node.soort,
    eenheid,
    taal,
    ...(node.hidden ? { verborgen: true } : {}),
  };
  const namen = lastNamen(node.symbool);
  const plek = { som: inScope(namen.som), G: inScope(namen.G), Q: inScope(namen.Q) };
  // Bij een fout bestaan de uitkomsten niet, ook niet die van een eerder blok met dit symbool.
  const fout = (melding: string): EvaluatedLast => {
    if (SYMBOOL_RE.test(node.symbool)) for (const n of Object.values(plek)) delete r.scope[n];
    return { ...basis, status: 'fout', melding, rijen: [] };
  };
  if (node.fouten.length) return fout(node.fouten.join('; '));

  const doel = BASIS[node.soort];
  const maat = math.unit(doel) as unknown as MathUnit;
  // In een melding staat wat eruit kwam zoals het blad het toont; wat verwacht werd dus ook.
  const verwacht = eenheidInBeeld(eenheid);
  const projectNamen = r.opties.project?.namen ?? {};
  const fouten: string[] = [];
  const rijen: LastRij[] = [];
  let G: unknown = math.unit(0, doel);
  let Q: unknown = math.unit(0, doel);

  /** Rekent één regel: zijn bijdrage telt mee en hij krijgt een rij, of hij meldt wat er niet klopt. */
  const rekenRegel = (regel: LastNode['regels'][number], meld: (wat: string) => void): void => {
    const delen = [regel.bron, ...regel.factoren];
    const waarden: unknown[] = [];
    for (let k = 0; k < regel.expr.length; k++) {
      try {
        waarden.push(r.reken(regel.expr[k]));
      } catch (e) {
        meld(rekenfout(e, delen[k]));
        return;
      }
    }
    const som = delen.join(' × ');
    let product: unknown;
    try {
      product = waarden.reduce((a, b) => math.multiply(a as never, b as never));
    } catch (e) {
      meld(rekenfout(e, som));
      return;
    }
    // Wat eruit kwam, zoals het blad het toont.
    const kreeg = (): string => {
      if (typeof product === 'number') return `${r.getal(product)} (zonder eenheid)`;
      if (!isUnit(product) || product.value === null) return 'geen getal';
      const t = r.toon(product);
      return `${t.getal} ${eenheidInBeeld(t.eenheid)}`.trim();
    };
    if (!isUnit(product) || product.value === null || !maat.equalBase(product)) {
      meld(`${som} geeft ${kreeg()}, verwacht ${verwacht}`);
      return;
    }
    const waarde = product.toNumber(doel);
    if (!Number.isFinite(waarde)) {
      meld(`${som} geeft geen eindig getal`);
      return;
    }
    if (regel.soort === 'Q') Q = math.add(Q as never, product as never);
    else G = math.add(G as never, product as never);
    // Eén kale naam als bron: zijn naam in het project is de omschrijving, als de regel er geen heeft.
    const code = regel.expr[0];
    const variabele = NAAM_RE.test(code) && !code.startsWith('ref__') ? code : undefined;
    const omschrijving = regel.omschrijving ?? (variabele ? projectNamen[regel.bron] ?? projectNamen[variabele] : undefined);
    rijen.push({
      soort: regel.soort,
      ...(omschrijving ? { omschrijving } : {}),
      bron: regel.bron,
      ...(variabele ? { variabele } : {}),
      delen: waarden.map((w) => r.toon(w)),
      waarde,
      bijdrage: r.getal(product.toNumber(eenheid)),
    });
  };
  node.regels.forEach((regel, i) => {
    const meld = (wat: string) => fouten.push(`regel ${i + 1}: ${wat}`);
    try {
      rekenRegel(regel, meld);
    } catch (e) {
      // Wat de rekenkern verder nog werpt, blijft bij zijn regel: het blad rekent door.
      meld(rekenfout(e, [regel.bron, ...regel.factoren].join(' × ')));
    }
  });
  if (fouten.length) return fout(fouten.slice(0, 5).join('; '));

  const deel = (w: unknown, naam: string, inDeScope: string) => {
    const u = (w as MathUnit).to(doel);
    r.scope[inDeScope] = u;
    return { naam, scope: inDeScope, waarde: u.toNumber(doel), tekst: r.getal(u.toNumber(eenheid)) };
  };
  const uitkomsten = {
    som: deel(math.add(G as never, Q as never), namen.som, plek.som),
    G: deel(G, namen.G, plek.G),
    Q: deel(Q, namen.Q, plek.Q),
  };
  return { ...basis, status: 'klaar', rijen, uitkomsten };
}

// ── Tonen ────────────────────────────────────────────────────────────────────

const WOORDEN = {
  nl: {
    lijn: 'lijnlast', punt: 'puntlast', blok: 'Lastblok', belasting: 'Belasting', berekening: 'Berekening',
    totaal: 'Totaal', blijvend: 'blijvend', veranderlijk: 'veranderlijk', nietGerekend: 'NIET GEREKEND',
  },
  en: {
    lijn: 'line load', punt: 'point load', blok: 'Load block', belasting: 'Load', berekening: 'Calculation',
    totaal: 'Total', blijvend: 'permanent', veranderlijk: 'variable', nietGerekend: 'NOT CALCULATED',
  },
} as const;

function esc(t: string): string {
  return t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Een naam uit de rekenkern in beeld: `q_L1_G` is q met de index L1,G. Volgt de weergavenamen van het blad. */
function naamHtml(codeNaam: string): string {
  const naam = weergaveNaam(codeNaam);
  const i = naam.indexOf('_');
  if (i <= 0) return `<var>${esc(naam)}</var>`;
  return `<var>${esc(naam.slice(0, i))}<sub>${esc(naam.slice(i + 1).replace(/_/g, ','))}</sub></var>`;
}

/**
 * Het blok op het blad, ook op papier: de kop met de naam, het symbool en de soort, per
 * regel de omschrijving, de berekening en de bijdrage in de kolom G of Q, en onderaan de
 * totalen en hun som.
 */
export function renderLast(node: EvaluatedLast): string {
  if (node.verborgen) return '';
  const w = WOORDEN[node.taal === 'en' ? 'en' : 'nl'];
  const symbool = SYMBOOL_RE.test(node.symbool) ? naamHtml(inScope(node.symbool)) : esc(node.symbool);
  const achter = [node.naam ? symbool : '', esc(w[node.soort])].filter(Boolean).join(', ');
  const kop = `<p class="calc-last-kop"><strong>${node.naam ? esc(node.naam) : symbool || esc(w.blok)}</strong> — ${achter}</p>`;
  const merk = ` data-last="${esc(node.symbool)}"`;
  if (node.status !== 'klaar' || !node.uitkomsten) {
    const tekst = `${w.nietGerekend}${node.melding ? `: ${node.melding}` : ''}`;
    return `<div class="calc-last calc-last-fout"${merk}>${kop}<p class="calc-last-melding">${esc(tekst)}</p></div>`;
  }
  const e = esc(eenheidInBeeld(node.eenheid));
  type Deel = { getal: string; eenheid: string } | null;
  // Per regel: p (de bron), b (de eerste maat) en l (de rest). Een lijnlast is per meter:
  // zonder tweede maat staat er bij l een 1.
  const cellen = node.rijen.map((rij) => {
    const [p, b, ...rest] = rij.delen;
    const l: Deel = rest.length === 0
      ? (node.soort === 'lijn' ? { getal: '1', eenheid: '' } : null)
      : rest.length === 1
        ? rest[0]
        : { getal: rest.map((d) => (d.eenheid ? `${d.getal} ${eenheidInBeeld(d.eenheid)}` : d.getal)).join(' × '), eenheid: '' };
    return { p: (p ?? null) as Deel, b: (b ?? null) as Deel, l };
  });
  // Getallen in een kolom staan met hun decimaalteken onder elkaar: een korter getal krijgt
  // onzichtbare cijfers erachter. Er komt geen nul bij die er niet gerekend is.
  const decimalen = (t: string) => (/^-?\d+(?:[.,]\d+)?$/.test(t) ? (t.split(/[.,]/)[1]?.length ?? 0) : -1);
  const uitlijner = (teksten: string[]) => {
    const breedste = Math.max(0, ...teksten.map(decimalen));
    return (t: string) => {
      const n = decimalen(t);
      if (n < 0 || n === breedste) return esc(t);
      return `${esc(t)}<span class="vul">${n === 0 ? '.' : ''}${'0'.repeat(breedste - n)}</span>`;
    };
  };
  // Een kolom zet zijn eenheid in de kop als elke gevulde cel dezelfde heeft; anders staat hij bij de cel.
  const kolom = (naam: string, delen: Deel[], standaard: string | null) => {
    // Een kaal getal (een factor zonder eenheid) telt niet mee: het past bij elke kolom.
    const eenheden = new Set(delen.filter((d): d is NonNullable<Deel> => d !== null && d.eenheid !== '').map((d) => d.eenheid));
    const gedeeld = eenheden.size === 0 ? standaard : eenheden.size === 1 ? [...eenheden][0] : null;
    const inKop = gedeeld ? ` [${esc(eenheidInBeeld(gedeeld))}]` : '';
    const tekst = (d: NonNullable<Deel>) => (gedeeld !== null || !d.eenheid ? d.getal : `${d.getal} ${eenheidInBeeld(d.eenheid)}`);
    const lijn = uitlijner(delen.filter((d): d is NonNullable<Deel> => d !== null).map(tekst));
    return {
      eenheid: gedeeld,
      kop: `<th class="getal">${naam}${inKop}</th>`,
      cel: (d: Deel) => `<td class="getal">${d ? lijn(tekst(d)) : ''}</td>`,
    };
  };
  const kb = kolom('b', cellen.map((c) => c.b), 'm');
  // l zonder eigen eenheid (de 1 van een lijnlast) volgt de eenheid van b.
  const kl = kolom('l', cellen.map((c) => c.l), kb.eenheid);
  const kp = kolom('p<sub>rep</sub>', cellen.map((c) => c.p), 'kN/m^2');
  const leeg = '<td class="getal"></td>';
  const u = node.uitkomsten;
  const lijnG = uitlijner([...node.rijen.filter((r) => r.soort !== 'Q').map((r) => r.bijdrage), u.G.tekst]);
  const lijnQ = uitlijner([...node.rijen.filter((r) => r.soort === 'Q').map((r) => r.bijdrage), u.Q.tekst]);
  const rijen = node.rijen.map((rij, i) => {
    const variabele = rij.variabele ? naamHtml(rij.variabele) : '';
    const omschrijving = rij.omschrijving !== undefined
      ? `${esc(rij.omschrijving)}${variabele ? ` <span class="calc-last-var">${variabele}</span>` : ''}`
      // Zonder omschrijving blijft de cel wit: de bron staat al in de kolom p.
      : variabele;
    const bijdrage = `<td class="getal">${(rij.soort === 'Q' ? lijnQ : lijnG)(rij.bijdrage)}</td>`;
    const c = cellen[i];
    return `<tr class="${rij.soort === 'Q' ? 'veranderlijk' : 'blijvend'}"><td>${omschrijving}</td>${kb.cel(c.b)}${kl.cel(c.l)}${kp.cel(c.p)}${rij.soort === 'Q' ? leeg + bijdrage : bijdrage + leeg}</tr>`;
  });
  // Zonder regels in een kolom blijft ook zijn som wit, net als de cellen erboven.
  const heeftG = node.rijen.some((r) => r.soort !== 'Q');
  const heeftQ = node.rijen.some((r) => r.soort === 'Q');
  // De som staat onder de tabel, buiten het raster: Σ, G, Q en de eenheid.
  const som = `<tr class="som"><td colspan="3"></td><td class="getal">Σ</td><td class="getal" title="${esc(u.G.naam)}">${heeftG ? lijnG(u.G.tekst) : ''}</td><td class="getal" title="${esc(u.Q.naam)}">${heeftQ ? lijnQ(u.Q.tekst) : ''}</td><td class="eenheid">[${e}]</td></tr>`;
  return `<div class="calc-last"${merk}>${node.naam ? kop : ''}<table class="calc-last-tabel">`
    + `<thead><tr><th>${symbool || esc(w.blok)}</th>${kb.kop}${kl.kop}${kp.kop}<th class="getal">G</th><th class="getal">Q</th></tr></thead>`
    + `<tbody>${rijen.join('')}</tbody><tfoot>${som}</tfoot></table></div>`;
}

/** De opmaak, bij de andere blokken in renderer.ts. */
export const LAST_CSS = `
.calc-last { margin: 6px 0 10px; break-inside: avoid; page-break-inside: avoid; }
.calc-last-kop { margin: 0 0 4px; }
/* Een tabel met een raster en een gekleurde kop: de as, b, l, p_rep, G en Q. */
.calc-last-tabel { border-collapse: collapse; font-size: 0.95em; margin: 4px 0; }
.calc-last-tabel th, .calc-last-tabel td { border: 1px solid #1f2937; padding: 2px 8px; text-align: left; vertical-align: baseline; }
.calc-last-tabel th { background: var(--calc-last-kop, #45b5aa); font-weight: 500; }
.calc-last-tabel th.getal, .calc-last-tabel td.getal { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; min-width: 3.2em; }
.calc-last-tabel th.getal { text-align: left; }
.calc-last-tabel .vul { visibility: hidden; }
/* Een naam zoals in een formule: schuin, de index rechtop. */
.calc-last var { font-family: KaTeX_Math, 'Times New Roman', serif; font-size: 1.08em; }
.calc-last var sub { font-family: KaTeX_Main, 'Times New Roman', serif; font-style: normal; font-size: 0.72em; }
.calc-last-var { color: #6b7280; font-size: 0.9em; }
/* De som staat onder het raster, zonder lijnen. */
.calc-last-tabel tr.som td { border: none; }
.calc-last-tabel tr.som td.eenheid { padding-left: 4px; white-space: nowrap; }
.calc-last-fout .calc-last-melding { color: #dc2626; font-weight: 600; }
`;
