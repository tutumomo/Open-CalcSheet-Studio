import { math } from './eenheden.js';

const { Unit } = math;
import type { AstNode, ConditionalNode, OpdrachtNode, PlotNode, TextNode } from './types.js';
import { DRIE_D_START_RE, leesDrieD } from './drieD.js';
import { vervangVerwijzingen } from './verwijzing.js';
import { IFRAME_RE, leesIframe } from './iframeBlok.js';
import { IFCX_RE, leesIfcxBlok } from './ifcxBlok.js';
import { TOETS_START_RE, leesToetsBlok } from './toetsBlok.js';
import { FEM_START_RE, leesFemBlok } from './femBlok.js';
import { KERN_START_RE, leesKernBlok } from './kernBlok.js';
import { JS_PLEK_RE, haalJsBlokkenUit, leesJsBlok, type JsCode } from './jsBlok.js';

/**
 * Line-based parser for the calculation language (docs/rekentaal.md).
 *
 * Supported syntax, including our own additions:
 *
 *   Title / heading:    `"Title text`           → H1
 *                       `# h1 … ###### h6`      → markdown headings (own extension)
 *
 *   Prose:              `'free text`            → HTML-passthrough paragraph
 *
 *   Comments:           `// js-style comment`   → skipped
 *
 *   Assignments:        `b = 300 mm`            → variable binds to scope
 *                       `f(x) = x^2 + 1`        → user-defined function (mathjs lambda)
 *
 *   Input prompts:      `F = ? kN`              → interactive numeric input
 *                       `L = ?{5000}mm`         → met standaardwaarde
 *
 *   Bare display:       `UC`                    → show "UC = <current value>"
 *
 *   Directives:         `#hide` … `#show`       → execute but skip render
 *                       `#pre`                  → alleen op het scherm (bij de invoer), niet op papier
 *                       `#post`                 → in de uitwerking en op papier (beëindigt #hide/#pre)
 *                       `#deg` / `#rad` / `#gra` → hoekeenheid voor de rest van het blad
 *                       `#equ` / `#val` / `#noc` → formule en uitkomst / alleen uitkomst / alleen formule
 *                       `#varsub` / `#nosub` / `#novar` → met / zonder / alleen invulling
 *                       `#round n`              → uitkomsten op n decimalen (`#round default`)
 *                       `expr:F2`               → deze uitkomst met 2 decimalen (ook N, E, G, P)
 *
 *   Omrekenen:          `x|kN*m`, `x to kN*m`, `x in kN*m` (`in` is ook de inch;
 *                       zie zetInOmNaarTo)
 *
 *   Conditionals:       `#if cond` / `#else if` / `#else` / `#end if`
 *                       HTML-wrapped conditions `#if '<!--cond-->'` are unwrapped.
 *
 *   Loops:              `#repeat n` … `#loop` (of `#end repeat`)  (iteration index = _i)
 *                       `#for i = a : b` … `#loop`, `#while cond` … `#loop`,
 *                       `#break`, `#continue`
 *
 *   Matrices:           `[a; b | c; d]` — `|` scheidt de rijen, `;` de
 *                       elementen binnen een rij. `A.(i; j)`, `v.(i)`, `v.i`
 *                       lezen een element en kunnen ook links van `=` staan.
 *
 *   Plots:              `$Plot{c1 & c2 @ x = lo : hi}`
 *                       Each curve: `yExpr` or `xExpr|yExpr`. Samples 100 points.
 *
 *   Blocks (ours):      `@svg …@end`, `@select … @end`, `@gef name`, `@img(src)`
 *                       `@3d … @end` — ruimtelijk beeld, één element per regel
 *                       (`balk x1 y1 z1 x2 y2 z2 b h`, maten als getal of
 *                       `{{formule}}`); zie drieD.ts
 *                       `@iframe url hoogte=120mm` — externe pagina; zie iframeBlok.ts
 *                       `@ifcx balklaag` — 3D-beeld uit een IFCX-document; zie ifcxBlok.ts
 *                       `@toets naam = tool … @end` — normtoets door Open FEM Studio; zie toetsBlok.ts
 *                       `@fem naam … @end` — plaatmodel, gerekend door Open FEM Studio; zie femBlok.ts
 *                       `@kern naam = tool … @end` — rekentool van Open FEM Studio met geneste invoer; zie kernBlok.ts
 *                       `@js … @end` — JavaScript, letterlijk en afgeschermd; zie jsBlok.ts
 *
 *   Statement separator: `,'` (single comma + single-quote) splits one line into
 *                        multiple statements. Used heavily in calculation files like
 *                        `a = ?', 'b = ?', 'c = ?`.
 *
 *   Trailing data:      Lines of pure numbers separated by tabs/spaces at the EOF
 *                       are the language's persisted prompt-input values. Skipped here;
 *                       a future enhancement could feed them into SelectValues.
 */

// ── Recognizers ────────────────────────────────────────────────────────
// Identifier = unicode letter/underscore + letters/digits/underscores. Matches
// The language's use of Greek and other non-ASCII letters (θ, α, β, …).
const IDENT = '[\\p{L}_][\\p{L}\\p{N}_]*';
const ASSIGNMENT_RE = new RegExp(`^(${IDENT})\\s*=\\s*(.+)$`, 'u');
/** `.naam = uitdrukking`: een eigen eenheid (EenheidDefNode). */
const EENHEID_DEF_RE = new RegExp(`^\\.(${IDENT})\\s*=\\s*(.+)$`, 'u');
const INPUT_PROMPT_RE = new RegExp(`^(${IDENT})\\s*=\\s*\\?\\s*(.*)$`, 'u');
// Parameters mogen met een komma of een puntkomma gescheiden worden: de rekentaal
// schrijft puntkomma's, mathjs komma's, en beide horen hier te werken.
const USER_FUNC_RE = new RegExp(
  `^(${IDENT})\\s*\\(\\s*(${IDENT}(?:\\s*[,;]\\s*${IDENT})*)\\s*\\)\\s*=\\s*(.+)$`,
  'u',
);
const VAR_DISPLAY_RE = new RegExp(`^(${IDENT})\\s*$`, 'u');
// `M|kN*m`, `M to kN*m`, `M in kN*m` als losse regel (zie isDoeleenheid).
const OMREKEN_WEERGAVE_RE = new RegExp(`^(${IDENT})\\s*(?:\\||\\s+(?:to|in)\\s+)\\s*(\\S.*)$`, 'u');

const TITLE_RE = /^"(.*)$/;           // Title: "Quadratic Equation
const PROSE_RE = /^'(.*)$/;           // Prose: 'free text with <i>HTML</i>
// Merkteken voor tekst die op dezelfde bronregel achter een rekendeel stond
// (`x = a*b', uitleg'`). Een stuurteken, zodat het nooit in echte tekst staat.
const INLINE_MARK = '\u0001';
const COMMENT_SLASH_RE = /^\/\//;

const HEADING_RE = /^(#{1,6})\s+(.+)$/;
const SVG_START_RE = /^@svg\s*$/;
const BLOCK_END_RE = /^@end\s*$/;
const IMG_RE = /^@img\((.+)\)\s*$/;
const SELECT_START_RE = /^@select\s+([a-zA-Z_]\w*)\s+"([^"]+)"\s*$/;
// Het label mag zelf een "=" bevatten ("Categorie A (psi_0 = 0.4) = 0.4"): de
// waarde staat na de laatste "=". Eerder werd bij de eerste gesplitst, zodat
// het label afbrak en de keuze een verkeerde waarde kreeg.
const SELECT_OPTION_RE = /^(.+)\s*=\s*(.+)$/;
const GEF_RE = /^@gef\s+([a-zA-Z_]\w*)\s*$/;
// Directive recognizers. All allow trailing characters after the keyword because
// the language frequently packs persisted-input values onto the same line as the
// closing directive (e.g. `#end if 2\t3\t-5`). Hoofdletterongevoelig, zoals in
// de rekentaal (`#If`, `#Else if`, `#End if`, `#Hide`).
const IF_RE = /^#if\s+(.+)$/i;
const ELSE_IF_RE = /^#else\s*if\s+(.+)$/i;
const ELSE_RE = /^#else\b/i;
const ENDIF_RE = /^#end\s+if\b/i;
const HIDE_RE = /^#hide\b/i;
const SHOW_RE = /^#show\b/i;
const PRE_RE = /^#pre\b/i;
const POST_RE = /^#post\b/i;
// Opdrachten die vanaf hun regel gelden (zie OpdrachtNode in types.ts). Ze
// worden tijdens het rekenen uitgevoerd, niet bij het inlezen: een #deg in een
// #if-tak geldt alleen als die tak loopt, zoals in de rekentaal.
const OPDRACHT_RE = /^#(deg|rad|gra|equ|val|noc|varsub|nosub|novar)\b/i;
const ROUND_RE = /^#round\b\s*(.*)$/i;
// `#def Name$ = "string"` constant definitions and `#include filename`
// (both handled before line parsing), plus `#split` / `#wrap` (hoe een lange
// formule afbreekt; de uitwerking breekt zelf af). Silently ignored.
const NO_OP_DIRECTIVE_RE = /^#(def|include|split|wrap)\b/i;
// `#repeat n … #loop` (ook zonder n: tot een #break), plus onze eigen
// afsluiting `#end repeat`. Lusopdrachten zijn in de rekentaal hoofdletterongevoelig
// (`#Repeat`, `#Loop`).
const REPEAT_RE = /^#repeat\b\s*(.*)$/i;
const ENDREPEAT_RE = /^#end\s+repeat\b/i;
// `#for var = lo : hi … #loop` (#break supported as early exit)
const FOR_RE = /^#for\s+([\p{L}_][\p{L}\p{N}_]*)\s*=\s*(.+?)\s*:\s*(.+)$/iu;
// `#while voorwaarde … #loop`; met `max=N` aan het eind begrensd (NOT_CONVERGED).
const WHILE_RE = /^#while\s+(.+)$/i;
// `#iterate x tol=… max=… … #loop`: tot |x_k − x_(k−1)| ≤ tol, hoogstens max rondes.
const ITERATE_RE = /^#iterate\s+([\p{L}_][\p{L}\p{N}_]*)\b\s*(.*)$/iu;
/** Standaard bovengrens en tolerantie van `#iterate` (docs/tw/OCSS接入實作計畫.md, P1-9). */
const ITERATE_MAX = '100';
const ITERATE_TOL = '1e-9';
const LOOP_RE = /^#loop\b/i;
const BREAK_RE = /^#break\b/i;
const CONTINUE_RE = /^#continue\b/i;
// Match `$Plot{...}` even when a file has appended trailing persisted-input
// data after the closing brace (e.g. `}\v2\t3`).
const PLOT_RE = /^\$Plot\s*\{([^}]+)\}/;
const SOLVER_RE = /\$(Find|Root|Solve|Sup|Inf|Sum|Product|Area|Integral|Slope)\s*\{([^}]+)\}/g;
const TRAILING_DATA_RE = /^[\s\d.eE+\-,;]+$/;  // pure numeric/whitespace line

// HTML wrappers the language uses around conditions / equation fragments.
const HTML_COMMENT_WRAPPER_RE = /^\s*'?<!--\s*'?(.+?)'?\s*-->\s*'?\s*$/;

// ── State ──────────────────────────────────────────────────────────────
interface ParserState {
  hidden: boolean;
  /**
   * Na `#pre`: alleen op het scherm. In de rekentaal toont `#pre` iets alleen in het
   * invoerformulier, vóór het doorrekenen, en `#post` alleen in de uitkomst.
   * Deze app heeft geen apart formulier: de uitwerking op het scherm is
   * invoer en uitkomst tegelijk, het papier is de uitkomst. Dus `#pre` →
   * alleen op het scherm (klasse alleen-scherm), `#post` → overal, zoals
   * gewone tekst. Beide beëindigen een `#hide`; `#show` en `#hide` een `#pre`.
   */
  scherm: boolean;
  /** De code van de `@js`-blokken; in de bron staat alleen hun nummer (jsBlok.ts). */
  jsBlokken: JsCode[];
}

/**
 * Merkteken voor een formaataanduiding aan het eind van een rekendeel
 * (`x = 3.14159:F2`). stripFormatSpecs zet het neer, parseLines haalt het eraf
 * en geeft het formaat aan de knoop. Een stuurteken: het staat nooit in een
 * blad en de herschrijvingen voor namen raken het niet.
 */
const FORMAAT_MARK = '\u0002';

/** Haalt een formaataanduiding (merkteken + `F2`) van het eind af; een losse elders vervalt. */
function knipFormaat(code: string): { tekst: string; formaat?: string } {
  if (code.indexOf(FORMAAT_MARK) === -1) return { tekst: code };
  const m = code.match(/\s*\u0002([A-Za-z]\d*)\s*$/);
  const tekst = (m ? code.slice(0, m.index) : code).replace(/\u0002[A-Za-z]\d*/g, '');
  return m ? { tekst, formaat: m[1].toUpperCase() } : { tekst };
}

/**
 * Pre-process the entire source to fold the language's comma-subscript identifiers
 * (e.g. `V_b,0`, `n_Int,support,points`, `A_WindPressure,Suction`) into
 * underscore-only equivalents that math.js can parse as valid identifiers.
 *
 * Heuristic — a comma is part of a subscript when it follows an identifier
 * that already contains at least one `_`:
 *   `n_Int,support,points`  →  `n_Int_support_points`
 *   `V_b,0`                  →  `V_b_0`
 *   `min(x_1; x_2)`          →  unchanged (`;` not `,`)
 *   `f(x, y)`                →  unchanged (no `_` before the comma)
 *   `min(x_1, x_2)`          →  unchanged (after `;` → `,` normalization runs
 *                              later; `_1` lacks the comma cluster `,word`)
 *
 * Applied once at the top of parse() so all regexes downstream see clean
 * identifiers.
 */
function foldSubscriptCommas(source: string): string {
  return alleenInCode(source, (code) =>
    code.replace(
      /(?<![\p{L}\p{N}_])([\p{L}_][\p{L}\p{N}_]*_[\p{L}\p{N}_]+(?:,[\p{L}\p{N}_]+)+)(?![\p{L}\p{N}_])/gu,
      (match) => match.replace(/,/g, '_'),
    ),
  );
}

/**
 * Past `fn` alleen toe op de rekendelen van de bron, nooit op tekst.
 *
 * De herschrijvingen voor namen (`V_b,0` → `V_b_0`, `Cs.Cd` → `Cs_Cd`,
 * `v.2` → `v[2]`) zijn bedoeld voor expressies. Liepen ze over de hele regel,
 * dan raakten ze ook de toelichting: "Tabel NB.2" werd "NB[2]", "(NB.8.1)"
 * werd "NB_8_1" en "F_ax,Rk" in een commentaar "F_ax_Rk".
 *
 * Een regel wordt op enkele aanhalingstekens gesplitst, behalve binnen een
 * tekenreeks tussen dubbele aanhalingstekens in een rekendeel. De stukken om
 * en om zijn rekendeel en tekst: bij een prozaregel (`'tekst'expr'tekst`) is
 * het eerste, lege stuk rekendeel en volgt daarna tekst; bij een rekenregel met
 * commentaar (`x = expr', uitleg'`) is het eerste stuk rekendeel en het tweede
 * commentaar. Koppen (`# …`) zijn geheel tekst, net als de keuzes binnen een
 * `@select`-blok; van de `@select`-regel zelf telt alleen de naam als code.
 */
/**
 * De rekendelen van een blad, zonder tekst, commentaar en koppen, onder elkaar.
 * Zo telt een `#1.R_paal` in een uitlegregel niet als verwijzing (verwijzing.ts).
 */
export function rekendelen(source: string): string {
  const delen: string[] = [];
  alleenInCode(source, (code) => {
    delen.push(code);
    return code;
  });
  return delen.join('\n');
}

function alleenInCode(source: string, fn: (code: string) => string): string {
  let inSelect = false;
  let in3d = false;
  return source
    .split('\n')
    .map((regel) => {
      const t = regel.trim();
      if (inSelect) {
        if (/^@end\b/.test(t)) inSelect = false;
        return regel;
      }
      // Een `@3d`-blok gaat ongemoeid door: zijn teksten blijven letterlijk, en
      // de expressies in `{{…}}`, `#for` en `#if` krijgen dezelfde
      // herschrijvingen pas bij het inlezen van het blok (normaliseer3d).
      if (in3d) {
        if (/^@end\b/.test(t)) in3d = false;
        return regel;
      }
      // Ook een `@kern`-blok: een pad met punten (`inputs.input.forces`) is daar geen naam.
      if (DRIE_D_START_RE.test(t) || FEM_START_RE.test(t) || KERN_START_RE.test(t)) {
        in3d = true;
        return regel;
      }
      if (/^@select\b/.test(t)) {
        inSelect = true;
        const label = regel.indexOf('"');
        return label === -1 ? fn(regel) : fn(regel.slice(0, label)) + regel.slice(label);
      }
      if (/^#+(\s|$)/.test(t)) return regel;
      // `@img(…)` draagt een bestandsnaam, URL of data-URL, geen rekenwerk:
      // `detail.png` werd anders `detail_png` en `example.com` `example_com`.
      if (/^@img\(/.test(t)) return regel;
      // Idem voor een adres in `@iframe`, en de opties van `@ifcx`; hun `{{…}}`
      // krijgt dezelfde herschrijvingen bij het inlezen (normaliseer3d).
      if (IFRAME_RE.test(t) || IFCX_RE.test(t) || JS_PLEK_RE.test(t)) return regel;
      let uit = '';
      let stuk = '';
      let code = true;
      let inString = false;
      for (const ch of regel) {
        if (code) {
          if (ch === '"') inString = !inString;
          if (ch === "'" && !inString) {
            uit += fn(stuk) + ch;
            stuk = '';
            code = false;
            continue;
          }
        } else if (ch === "'") {
          uit += stuk + ch;
          stuk = '';
          code = true;
          inString = false;
          continue;
        }
        stuk += ch;
      }
      return uit + (code ? fn(stuk) : stuk);
    })
    .join('\n');
}

/**
 * The language identifies string variables with a trailing `$` (e.g. `ii$`,
 * `Client$`, `getFdn$(ii$)`). math.js doesn't allow `$` in identifiers, so
 * these references blow up entire conditional cascades. We simply strip the
 * trailing `$` everywhere a word character precedes it — the values still
 * bind to scope under the bare name, and the `$Plot{ … }` / `$Sum{ … }`
 * directives (which start with `$`) are unaffected because they have no
 * preceding word char.
 */
function stripDollarSuffix(source: string): string {
  if (!/^\s*@(?:3d\s*$|fem\b|kern\b|iframe\b|ifcx\b|js\u0003)/im.test(source)) return source.replace(/([\p{L}\p{N}_])\$/gu, '$1');
  // De teksten in een `@3d`-blok blijven letterlijk (zie alleenInCode).
  let in3d = false;
  return source
    .split('\n')
    .map((regel) => {
      const t = regel.trim();
      if (in3d) {
        if (/^@end\b/.test(t)) in3d = false;
        return regel;
      }
      if (DRIE_D_START_RE.test(t) || FEM_START_RE.test(t) || KERN_START_RE.test(t)) in3d = true;
      // Een dollarteken in een adres is geen achtervoegsel van een naam.
      if (IFRAME_RE.test(t) || IFCX_RE.test(t) || JS_PLEK_RE.test(t)) return regel;
      return regel.replace(/([\p{L}\p{N}_])\$/gu, '$1');
    })
    .join('\n');
}

/**
 * Een expressie uit een `@3d`-blok (`{{…}}`, de grenzen van `#for`, de
 * voorwaarde van `#if`) met dezelfde herschrijvingen als elke andere
 * expressie in het blad, zodat `{{V_b,0}}` en `{{Cs.Cd}}` dezelfde naam
 * vinden als in een formule.
 */
function normaliseer3d(expr: string): string {
  return normalizeExpression(
    rewriteMatrixLiterals(stripDollarSuffix(foldIdentifierDots(foldSubscriptCommas(vervangVerwijzingen(expr))))).trim(),
  );
}

/**
 * Expand multi-line `#def name(p1; p2; ...) ... #end def` macros via
 * textual substitution. Single-line `#def name = "value"` and
 * `#def name(args) = expression` are skipped (handled later).
 *
 * The macro body lines have parameter references like `x1`, `dist*3/10`, or
 * nested macro calls `line(...)`. We substitute params with the actual call
 * arguments and re-emit the body lines in place of the call site. Recursive
 * expansion runs up to MAX_PASSES times to resolve macro→macro→macro chains.
 */
function expandMacros(source: string): string {
  interface Macro { params: string[]; body: string[]; oneLine: string | null }
  const macros = new Map<string, Macro>();
  // Constant `#def Name$ = literal` macros — expanded as bare-identifier
  // textual substitution (no call syntax).
  const constants = new Map<string, string>();

  // Pass 1 — collect definitions and remove their lines from the source.
  const raw = source.split('\n');
  const stripped: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const line = raw[i];
    const trimmed = line.trim();
    // Multi-line: `#def name(p1; p2; ...)` or `#def name$(p1$; p2$; ...)`
    // (no `=` sign on the def line). `$` is a string-type suffix.
    const blockDef = trimmed.match(/^#def\s+([\p{L}_][\p{L}\p{N}_]*)\$?\s*\(\s*([^)]*)\s*\)\s*$/u);
    if (blockDef) {
      const name = blockDef[1];
      const params = blockDef[2]
        .split(/[,;]/)
        .map((p) => p.trim().replace(/\$$/, ''))  // strip trailing $ from param names
        .filter(Boolean);
      const body: string[] = [];
      i++;
      while (i < raw.length && !/^\s*#end\s+def\b/.test(raw[i])) {
        body.push(raw[i]);
        i++;
      }
      macros.set(name, { params, body, oneLine: null });
      continue;
    }
    // Inline: `#def name(p1; p2) = template-text` (string suffix optional)
    const inlineDef = trimmed.match(/^#def\s+([\p{L}_][\p{L}\p{N}_]*)\$?\s*\(\s*([^)]*)\s*\)\s*=\s*(.+)$/u);
    if (inlineDef) {
      const name = inlineDef[1];
      const params = inlineDef[2]
        .split(/[,;]/)
        .map((p) => p.trim().replace(/\$$/, ''))
        .filter(Boolean);
      macros.set(name, { params, body: [], oneLine: inlineDef[3] });
      continue;
    }
    // Inline constant: `#def Name$ = literal` (no parens). Collect for
    // bare-identifier textual replacement in pass 3.
    const constDef = trimmed.match(/^#def\s+([\p{L}_][\p{L}\p{N}_]*)\$?\s*=\s*(.+)$/u);
    if (constDef) {
      constants.set(constDef[1], constDef[2]);
      continue;
    }
    stripped.push(line);
  }

  if (macros.size === 0 && constants.size === 0) return source;

  // Pass 2 — left-to-right linear scan, expanding macro calls one at a time.
  // `\$?` between the name and `(` matches the language's string-typed call syntax
  // `getFdn$(arg)`, `line$(...)`.
  let text = stripped.join('\n');

  // Constant substitution helper — bare-identifier replacement, optional
  // trailing `$`. Loop a few times so constants referencing other constants
  // resolve.
  const constPattern = constants.size > 0
    ? `(?<![\\p{L}\\p{N}_])(${[...constants.keys()].map(escapeRegExp).join('|')})\\$?(?![\\p{L}\\p{N}_(])`
    : null;
  const expandConstants = (s: string): string => {
    if (!constPattern) return s;
    let out = s;
    for (let pass = 0; pass < 4; pass++) {
      let changed = false;
      out = out.replace(new RegExp(constPattern, 'gu'), (_m, name: string) => {
        changed = true;
        return constants.get(name) ?? '';
      });
      if (!changed) break;
    }
    return out;
  };

  // Pass 1.5 — substitute constants (so constants referenced in macro CALLS
  // get expanded before macro arg-substitution sees them).
  text = expandConstants(text);

  if (macros.size === 0) return text;

  const namePattern = `(?<![\\p{L}\\p{N}_])(${[...macros.keys()].map(escapeRegExp).join('|')})\\$?\\s*\\(`;
  const MAX_PASSES = 8;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let changed = false;
    let cursor = 0;
    const out: string[] = [];
    const callRe = new RegExp(namePattern, 'gu');
    let match;
    while ((match = callRe.exec(text)) !== null) {
      const name = match[1];
      const openParen = match.index + match[0].length - 1;
      const closeParen = findMatchingParen(text, openParen);
      if (closeParen === -1) { callRe.lastIndex = openParen + 1; continue; }
      const args = splitArgs(text.slice(openParen + 1, closeParen));
      const macro = macros.get(name)!;
      const expanded = applyMacro(macro, args);
      out.push(text.slice(cursor, match.index));
      out.push(expanded);
      cursor = closeParen + 1;
      callRe.lastIndex = cursor;
      changed = true;
    }
    out.push(text.slice(cursor));
    text = out.join('');
    if (!changed) break;
  }
  // Pass 3 — re-substitute constants that surfaced via macro arg-substitution
  // (e.g. `rect$(...; style1$)` injects `style1$` into the macro body, which
  // must now resolve to `style="stroke:..."`).
  text = expandConstants(text);
  return text;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function findMatchingParen(s: string, openIdx: number): number {
  let depth = 0;
  let inString = false;
  for (let i = openIdx; i < s.length; i++) {
    const ch = s[i];
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '(') depth++;
    else if (ch === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function splitArgs(raw: string): string[] {
  // The language uses `;` to separate function/macro arguments. Comma is reserved
  // for subscripts (`b_fdn,1`) which foldSubscriptCommas rewrites later.
  // Splitting on `,` here would scramble argument order whenever a subscript
  // value is passed in (e.g. `drawFDN$(...; b_fdn,1; b_fdn,2; ...)`).
  const out: string[] = [];
  let depth = 0, inString = false, start = 0;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (ch === '"') { inString = !inString; continue; }
    if (inString) continue;
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    else if (ch === ';' && depth === 0) {
      out.push(raw.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(raw.slice(start).trim());
  return out.filter((s, idx) => idx < out.length - 1 || s !== '');
}

function applyMacro(macro: { params: string[]; body: string[]; oneLine: string | null }, args: string[]): string {
  // Typed-param refs carry `$` (`x$`, `n_Length$`). Bare refs
  // (`n_Length` without `$`) also occur in arithmetic context, but bare refs
  // for single-letter params (`x`, `y`, `b`, `h`, `l`, `w`) collide with SVG
  // attribute names inside prose-template lines (`<rect x="…">`). Strategy:
  //   • Always substitute `paramname$`.
  //   • In *code* lines (no leading `'`), also substitute bare `paramname`.
  //   • In *prose* lines, ONLY substitute `$`-suffixed refs.
  //
  // True single-pass substitution. Two separate regex passes ($-form then
  // bare-form) would let the SECOND pass re-match the values produced by
  // the first: `b$ → l` followed by bare `l → b` corrupts back to the
  // wrong param. One combined regex with optional `$` captures the type
  // per match; JS replace advances through the ORIGINAL input so already-
  // substituted text in the OUTPUT is never re-scanned.
  const paramMap = new Map<string, string>();
  for (let i = 0; i < macro.params.length; i++) paramMap.set(macro.params[i], args[i] ?? '');
  const escNames = macro.params.map(escapeRegExp).join('|');
  const combinedRe = new RegExp(
    `(?<![\\p{L}\\p{N}_.])(${escNames})(\\$)?(?![\\p{L}\\p{N}_])`,
    'gu',
  );

  const substLine = (s: string, isProse: boolean): string => {
    if (paramMap.size === 0) return s;
    return s.replace(combinedRe, (_m, name: string, dollarSuffix?: string) => {
      // Bare references inside prose lines: skip (would clobber SVG attr
      // names like `x="..."` when params are single letters).
      if (!dollarSuffix && isProse) return _m;
      return paramMap.get(name) ?? _m;
    });
  };
  if (macro.oneLine !== null) {
    return substLine(macro.oneLine, macro.oneLine.trimStart().startsWith("'"));
  }
  return macro.body
    .map((line) => substLine(line, line.trimStart().startsWith("'")))
    .join('\n');
}

/**
 * The language allows `.` and `%` inside identifier names (e.g. `Cs.Cd`,
 * `F_0.9G50%TotalWeight`). mathjs treats `.` as member access and `%` as
 * modulo, so these names blow up. Fold them to `_` when the surrounding
 * tokens form an identifier-like cluster: a leading letter/underscore,
 * followed by one or more `.`/`%`-separated word groups.
 *
 *   `Cs.Cd`                  →  `Cs_Cd`
 *   `F_0.9G50%TotalWeight`   →  `F_0_9G50_TotalWeight`
 *   `0.5`                    →  unchanged (leading digit excluded)
 *   `q * 0.9`                →  unchanged
 */
function foldIdentifierDots(source: string): string {
  // Skip content inside double-quoted strings on a PER-LINE basis. Unbalanced
  // quotes on one line (e.g. `"Title` heading) shouldn't poison the rest of
  // the file. URLs like "http://www.w3.org/..." and dotted text inside SVG
  // attribute values must survive unchanged.
  const transformOutsideQuotes = (text: string): string => {
    let out = text;
    // vector index `name.(expr)` → `name[expr]`. Must precede dot-fold
    // so the parenthesised index isn't accidentally read as a member access.
    out = out.replace(
      /(?<![\p{L}\p{N}_.])([\p{L}_][\p{L}\p{N}_]*)\.\(([^()]*)\)/gu,
      (_m, name, expr) => `${name}[${expr}]`,
    );
    // vector index `name.digit` → `name[digit]`. Must precede the
    // identifier-cluster fold so `cc.3` isn't mistakenly read as `cc_3`.
    out = out.replace(
      /(?<![\p{L}\p{N}_.])([\p{L}_][\p{L}\p{N}_]*)\.(\d+)(?![\p{L}\p{N}_.])/gu,
      (_m, name, idx) => `${name}[${idx}]`,
    );
    // vector index by loop-variable: `name.i`, `name.j` (single
    // lowercase letter) → `name[i]`. Distinguishes from dotted identifiers
    // like `Cs.Cd` (uppercase / multi-char RHS) which still get folded.
    //
    // The trailing `.` in the lookahead keeps Dutch abbreviations intact:
    // `t.o.v.` would otherwise fold to `t[o].v.` and `u.c.` to `u[c].`. A
    // real vector index is never immediately followed by another dot.
    out = out.replace(
      /(?<![\p{L}\p{N}_.])([\p{L}_][\p{L}\p{N}_]*)\.([a-z])(?![\p{L}\p{N}_.])/gu,
      (_m, name, idx) => `${name}[${idx}]`,
    );
    // Identifier-cluster fold: `Cs.Cd`, `F_0.9G50%TotalWeight` → underscores.
    //
    // Same trailing-`.` guard, for the same reason: without it this rule
    // catches what the one above now leaves alone (`t.o.v` → `t_o_v`).
    out = out.replace(
      /(?<![\p{L}\p{N}_])([\p{L}_][\p{L}\p{N}_]*(?:[.%][\p{L}\p{N}_]+)+)(?![\p{L}\p{N}_.])/gu,
      (match) => match.replace(/[.%]/g, '_'),
    );
    return out;
  };

  return alleenInCode(source, (code) => {
    if (code.indexOf('"') === -1) return transformOutsideQuotes(code);
    const segs = code.split('"');
    return segs.map((seg, i) => (i % 2 === 1 ? seg : transformOutsideQuotes(seg))).join('"');
  });
}

/**
 * The language lets every expression carry a trailing display-format hint
 * (`:F2` = fixed-point 2 decimals, `:N0`, `:G`, `:E3`, `:P`). It's a
 * display directive, not part of the math. Staat hij aan het eind van een
 * rekendeel, dan blijft hij als merkteken (FORMAAT_MARK + `F2`) staan; de
 * knoop krijgt hem als `formaat` en de rekenkern toont de uitkomst zo (zie
 * formatGetal in evaluator.ts). Midden in een expressie wordt hij geknipt.
 *
 *   `Z_0:F2`         →  `Z_0` + F2      (bare display)
 *   `Cs.Cd = 1:F2`   →  `Cs.Cd = 1` + F2 (assignment value)
 *   `ψ_0,wind = 0.0:F2`  →  `ψ_0,wind = 0.0` + F2
 *   `'b = 'x:F2' mm` →  `'b = 'x' mm` + F2 (ingevoegde expressie in tekst)
 *
 * Alleen in rekendelen. Liep het knippen over de hele regel, dan verdween in
 * tekst elke dubbele punt met een losse F, N, G, E of P erachter:
 * "'Glijden: F/(v·L)" werd "'Glijden/(v·L)" en "per m¹: g = b·h·ρ" werd
 * "per m¹ = b·h·ρ". Daarom blijven ongemoeid: tekst en toelichting (via
 * alleenInCode), tekenreeksen tussen dubbele aanhalingstekens (ook de titel
 * `"…`), de inhoud van een `@svg`-blok (die kent alleen `{{naam}}`) en het
 * bereik van een lus of oplosser (`#for i = 1 : n`, `$Root{… @ x = 0 : N }`),
 * waar de dubbele punt een bereik is en geen formaat.
 */
function stripFormatSpecs(source: string): string {
  // Match `:F2`, `:N0`, `:G`, `:E3`, `:P0` where preceded by digit/letter/`)`
  // and followed by end-of-token (whitespace, EOL, or expression operator).
  // Whitespace around `:` must stay WITHIN the line ([^\S\n], not \s) —
  // otherwise a prose line ending in `:` swallows the next statement when it
  // happens to start with one of F/N/G/E/P (e.g. `n = N_Ed/N_plRd`).
  const FORMAAT = /(?<=[\p{L}\p{N}_)])[^\S\n]*:[^\S\n]*[FNGEPfngep]\d*(?=[^\S\n]|$|[,;)+\-*/'])/gmu;
  // Staat de dubbele punt in het bereik `var = van : tot` van een #for of
  // van een `@` in een $-blok, dan is het geen formaataanduiding.
  const IN_BEREIK = /(?:^\s*#for|@)\s*[\p{L}_][\p{L}\p{N}_]*\s*=[^{}@]*$/u;
  // `einde`: dit stuk sluit het rekendeel af, dus een aanduiding aan zijn
  // eind hoort bij de hele expressie en blijft als merkteken staan.
  const knip = (code: string, einde: boolean): string =>
    code.replace(FORMAAT, (spec: string, plek: number, geheel: string) => {
      if (IN_BEREIK.test(geheel.slice(0, plek))) return spec;
      if (einde && geheel.slice(plek + spec.length).trim() === '') {
        return FORMAAT_MARK + spec.replace(/^[^:]*:\s*/, '');
      }
      return '';
    });
  const buitenTekenreeksen = (code: string): string => {
    if (code.indexOf('"') === -1) return knip(code, true);
    const stukken = code.split('"');
    return stukken
      .map((stuk, i) => (i % 2 === 1 ? stuk : knip(stuk, i === stukken.length - 1)))
      .join('"');
  };

  // Een `@svg`-blok gaat in zijn geheel ongemoeid door; de rest per aaneengesloten
  // stuk door alleenInCode, zodat die zijn eigen `@select`-toestand houdt.
  const uit: string[] = [];
  let stuk: string[] = [];
  let inSvg = false;
  const spoel = () => {
    if (stuk.length > 0) uit.push(alleenInCode(stuk.join('\n'), buitenTekenreeksen));
    stuk = [];
  };
  for (const regel of source.split('\n')) {
    const t = regel.trim();
    if (inSvg) {
      uit.push(regel);
      if (/^@end\b/.test(t)) inSvg = false;
    } else if (/^@svg\s*$/.test(t)) {
      spoel();
      uit.push(regel);
      inSvg = true;
    } else {
      stuk.push(regel);
    }
  }
  spoel();
  return uit.join('\n');
}

/**
 * Matrixliteralen van de rekentaal naar de geneste vorm van mathjs, rij voor rij.
 *
 * In de rekentaal scheidt `|` de RIJEN en `;` de elementen binnen een rij:
 * `[1; 2 | 3; 4]` is de matrix met rijen [1, 2] en [3, 4], en wordt hier
 * `[[1, 2], [3, 4]]`. Eerder werden de `|`-delen als kolommen
 * gelezen; daardoor stond elke matrix gekanteld in het geheugen, gaven A*B en
 * een niet-symmetrisch stelsel een fout antwoord, en waren n_rows, n_cols,
 * A.(i; j) en de opzoekfuncties op die kanteling gebouwd.
 *
 * Een rij mag korter zijn dan de andere; de rekenkern vult hem met nullen aan,
 * en een vector als element wordt in de rij uitgevouwen (`[a | 2*a]`), zoals in
 * de rekentaal. Dat gebeurt bij het rekenen (`_cp_matrix_lit`), want hier is nog
 * niet bekend of een naam een getal of een vector is.
 *
 * Alleen in rekendelen: tekst als "'Profielmatrix: [id | b | h]" blijft staan.
 * Haken binnen een element (`v[2]`, `f(a; b)`) tellen mee bij het zoeken naar
 * het sluitende haakje en bij het splitsen, zodat `[v.1; f(a; b) | 3; 4]` heel
 * blijft.
 */
function rewriteMatrixLiterals(source: string): string {
  return alleenInCode(source, (code) =>
    code.indexOf('"') === -1
      ? herschrijfMatrices(code)
      : code.split('"').map((stuk, i) => (i % 2 === 1 ? stuk : herschrijfMatrices(stuk))).join('"'),
  );
}

/** Index van het haakje dat dat op `open` sluit, met geneste haken; -1 als het ontbreekt. */
function sluitendHaakje(s: string, open: number): number {
  let diepte = 0;
  for (let i = open; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') diepte++;
    else if (ch === ')' || ch === ']' || ch === '}') {
      diepte--;
      if (diepte === 0) return i;
    }
  }
  return -1;
}

/** Splitst op `teken` buiten haken. */
function splitsBuitenHaken(s: string, teken: string): string[] {
  const uit: string[] = [];
  let diepte = 0;
  let begin = 0;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') diepte++;
    else if (ch === ')' || ch === ']' || ch === '}') diepte--;
    else if (ch === teken && diepte === 0) {
      uit.push(s.slice(begin, i));
      begin = i + 1;
    }
  }
  uit.push(s.slice(begin));
  return uit;
}

function herschrijfMatrices(code: string): string {
  if (code.indexOf('|') === -1 || code.indexOf('[') === -1) return code;
  let uit = '';
  let i = 0;
  while (i < code.length) {
    if (code[i] !== '[') {
      uit += code[i];
      i++;
      continue;
    }
    const sluit = sluitendHaakje(code, i);
    if (sluit === -1) {
      uit += code.slice(i);
      break;
    }
    // Eerst wat erin staat: een matrix kan een andere bevatten.
    const binnen = herschrijfMatrices(code.slice(i + 1, sluit));
    const rijen = splitsBuitenHaken(binnen, '|');
    if (rijen.length < 2) {
      uit += `[${binnen}]`;
    } else {
      const cellen = rijen.map((rij) =>
        splitsBuitenHaken(rij, ';').map((c) => c.trim()).filter((c) => c !== ''),
      );
      uit += `[${cellen.map((c) => `[${c.join(', ')}]`).join(', ')}]`;
    }
    i = sluit + 1;
  }
  return uit;
}

/**
 * Toekenning aan één element: `A.(i; j) = …`, `v.(i) = …`, `v.i = …` en
 * `v.2 = …`. foldIdentifierDots heeft de index dan al als `naam[…]`
 * geschreven. Geeft naam, index en waarde, of null als de regel iets anders is.
 */
function leesElementToekenning(regel: string): { naam: string; index: string; waarde: string } | null {
  const m = regel.match(new RegExp(`^(${IDENT})\\s*\\[`, 'u'));
  if (!m) return null;
  const open = m[0].length - 1;
  const sluit = sluitendHaakje(regel, open);
  if (sluit === -1) return null;
  const rest = regel.slice(sluit + 1).match(/^\s*=(?!=)\s*(.+)$/);
  if (!rest) return null;
  const index = regel.slice(open + 1, sluit).trim();
  if (index === '') return null;
  return { naam: m[1], index, waarde: rest[1].trim() };
}

/**
 * Inline `#include filename` directives by looking up each filename in the
 * resolver map. Missing files become a comment line. Runs once before macro
 * expansion so included macros (`#def …`) participate in expansion.
 */
function inlineIncludes(source: string, includes: ReadonlyMap<string, string>): string {
  return source.replace(/^[ \t]*#include\s+(\S+)\s*$/gmu, (match, name: string) => {
    const key = name.trim().replace(/^["']|["']$/g, '');
    const content = includes.get(key);
    if (content === undefined) return `// (include not found: ${key})`;
    return content;
  });
}

/**
 * Inline `@img(file.svg)` directives whose target is an SVG file in the
 * include resolver — replace the line with an `@svg … @end` block so the
 * actual SVG markup is rendered inline (not as `<img src="file.svg">`).
 * Non-SVG targets (`.png`, `.jpg`, URLs) are left as `@img` directives and
 * resolved by the host at render time.
 *
 * The host registers SVG image files alongside library .cpd files in the
 * same `ParseOptions.includes` map.
 */
function inlineSvgImages(source: string, includes: ReadonlyMap<string, string>): string {
  return source.replace(/^[ \t]*@img\(([^)]+)\)\s*$/gmu, (match, name: string) => {
    const key = name.trim().replace(/^["']|["']$/g, '');
    if (!/\.svg$/i.test(key)) return match;
    const content = includes.get(key);
    if (content === undefined) return match;
    // Strip XML prolog + DOCTYPE — they don't belong inline inside HTML
    const cleaned = content
      .replace(/<\?xml\b[^?]*\?>/g, '')
      .replace(/<!DOCTYPE[^>]*>/gi, '')
      .trim();
    return `@svg\n${cleaned}\n@end`;
  });
}

export interface ParseOptions {
  /** Map of filename → contents for `#include filename` resolution. */
  includes?: ReadonlyMap<string, string>;
  /**
   * Map of filename → URL for rewriting `<img src="...">` references inside
   * prose. Lookup is by basename (case-insensitive), so the source can write
   * `src="./Images/Picture0.png"` and we'll match the `"Picture0.png"` key.
   */
  imageUrls?: ReadonlyMap<string, string>;
  /**
   * Namen van eigen eenheden die buiten het blad gemaakt zijn (de eenheden van het
   * project). Ze gelden bij het lezen als eenheid achter een getal, net als de
   * namen die het blad zelf met `.naam = …` maakt.
   */
  eenheden?: readonly string[];
}

/**
 * Rewrite `<img src="path">` and `src='path'` attributes in prose so the
 * basename matches a known asset URL (Vite-bundled, base64 data URL, etc.).
 * Anything not in the map is left untouched.
 */
function rewriteImageSrc(source: string, imageUrls: ReadonlyMap<string, string>): string {
  // Build a case-insensitive basename → URL map.
  const lookup = new Map<string, string>();
  for (const [k, v] of imageUrls) lookup.set(k.toLowerCase(), v);
  const zoek = (path: string): string | undefined => lookup.get(path.split(/[\\/]/).pop()?.toLowerCase() ?? "");
  // Ook `@img(Picture0.png)` buiten de include-tabel: een bekende naam krijgt
  // het adres uit de tabel, elke andere bestandsnaam, URL of data-URL blijft.
  return source
    .replace(/src\s*=\s*(["'])([^"']+)\1/g, (full, quote: string, path: string) => {
      const url = zoek(path);
      return url ? `src=${quote}${url}${quote}` : full;
    })
    .replace(/^([ \t]*@img\()(.+)(\)[ \t]*)$/gm, (full, voor: string, path: string, na: string) => {
      const url = zoek(path.trim().replace(/^(["'])(.*)\1$/, '$2'));
      return url ? `${voor}${url}${na}` : full;
    });
}

/**
 * Een rekendeel dat een eigen regel is en geen ingevoegde waarde: een
 * toekenning (ook aan een functie of een element), een invoerveld, een
 * opdracht of een blok. Zie de regelsplitsing in parse().
 */
function isOpdrachtRegel(code: string): boolean {
  const t = code.trim();
  if (/^[#$@"]/.test(t)) return true;
  return /^[\p{L}_][\p{L}\p{N}_,]*\s*(?:\([^()]*\)|\[[^\]]*\])?\s*=(?!=)/u.test(t);
}

// ── Entry point ────────────────────────────────────────────────────────
export function parse(source: string, options: ParseOptions = {}): AstNode[] {
  // De eigen eenheden van dit blad en van het project gelden tijdens het lezen.
  const vorige = eigenEenheden;
  const inBlad = [...source.matchAll(new RegExp(`^[ \\t]*\\.(${IDENT})[ \\t]*=`, 'gmu'))].map((m) => m[1]);
  eigenEenheden = new Set([...(options.eenheden ?? []), ...inBlad]);
  try {
    return parseBron(source, options);
  } finally {
    eigenEenheden = vorige;
  }
}

function parseBron(source: string, options: ParseOptions): AstNode[] {
  // De code van een `@js`-blok is geen rekentaal: vóór alle bewerkingen eruit,
  // en nog een keer na het invoegen, voor een blok uit een `#include`.
  const jsBlokken: JsCode[] = [];
  source = haalJsBlokkenUit(source, jsBlokken);
  if (options.includes && options.includes.size > 0) {
    source = inlineIncludes(source, options.includes);
    source = inlineSvgImages(source, options.includes);
    source = haalJsBlokkenUit(source, jsBlokken);
  }
  if (options.imageUrls && options.imageUrls.size > 0) {
    source = rewriteImageSrc(source, options.imageUrls);
  }
  // Macro expansion runs BEFORE \$-stripping so we still see param names like
  // `x1\$` and substitute them across the body. After expansion we strip \$
  // from any remaining identifiers.
  source = expandMacros(source);
  // Een verwijzing naar een ander blad (`#1.R_paal`) wordt een gewone naam, vóór de
  // andere herschrijvingen van namen (verwijzing.ts). Alleen in rekendelen: een kop
  // of tekst met een # blijft staan.
  source = alleenInCode(source, vervangVerwijzingen);
  source = rewriteMatrixLiterals(
    stripDollarSuffix(
      foldIdentifierDots(stripFormatSpecs(foldSubscriptCommas(source))),
    ),
  );
  source = rewriteSolverDirectives(source);
  // The language's `'` character toggles between CODE and PROSE on a single line.
  // Lines start in CODE mode. Each `'` flips mode. So:
  //   a = ?', 'b = ?     →  CODE `a = ?` + PROSE `, ` + CODE `b = ?`
  //   f(x) = c'= 0       →  CODE `f(x) = c` + PROSE `= 0`
  //   '<hr />            →  PROSE `<hr />`  (whole line)
  //   "Title             →  CODE (title) — NO toggle on `"` lines
  //
  // We pre-flatten each raw line into N logical lines so the rest of the parser
  // can stay single-statement-per-line.
  const rawLines = source.split('\n');
  const lines: string[] = [];
  let in3d = false;
  for (const raw of rawLines) {
    const trimmed = raw.trim();
    // De regels van een `@3d`-blok heel laten: een apostrof in een tekst
    // (`tekst 0 0 0 "ligger's"`) is daar geen wissel naar tekst.
    if (in3d) {
      lines.push(raw);
      if (BLOCK_END_RE.test(trimmed)) in3d = false;
      continue;
    }
    if (DRIE_D_START_RE.test(trimmed) || FEM_START_RE.test(trimmed)) {
      in3d = true;
      lines.push(raw);
      continue;
    }
    // Directive / title / block / plot lines: do NOT toggle-split — single-line
    // statements that contain inline apostrophes (e.g. `#if '<!--cond-->'`).
    if (
      trimmed.startsWith('"') ||
      trimmed.startsWith('#') ||
      trimmed.startsWith('@') ||
      trimmed.startsWith('$')
    ) {
      lines.push(raw);
      continue;
    }
    if (raw.indexOf("'") === -1) {
      lines.push(raw);
      continue;
    }
    // Prose lines (leading `'`) split toggle-style into alternating prose/code
    // segments. If NO code segment looks like an assignment (`name = value`),
    // treat the whole line as one prose template with inline value interp
    // (SVG macros: `'<line x1="'a'" y1="'b'"/>`). If any segment is a real
    // assignment (e.g. `'→'b_fdn = 0.58m`), fall back to per-segment split.
    if (trimmed.startsWith("'")) {
      const segs = raw.split("'");
      // Code segments are at even indices ≥ 2. Treat as assignment if it
      // matches IDENT '=' VALUE (single `=`, not `==` / `!=` / `<=` / `>=`).
      const assignLikeRe = /^\s*[\p{L}_][\p{L}\p{N}_,]*\s*=(?!=)/u;
      let hasAssignment = false;
      for (let k = 2; k < segs.length; k += 2) {
        if (assignLikeRe.test(segs[k])) { hasAssignment = true; break; }
      }
      if (!hasAssignment) {
        lines.push(raw);
        continue;
      }
    }
    // Toggle split — alternating code / prose fragments (`a = ?', 'b = ?`)
    //
    // Tekst die op dezelfde regel achter een rekendeel staat, is de
    // toelichting daarbij (`x = a*b', uitleg'`). Die krijgt een merkteken,
    // zodat hij naast de formule komt en niet als losse alinea eronder. Een
    // rekendeel binnen die toelichting dat zelf geen opdracht is
    // (`x = a', waarde 'a*3' mm'`), is een ingevoegde waarde, zoals in een
    // tekstregel: het hoort in de toelichting en werd anders een losse regel
    // die op tekst terugviel. Een toekenning (`a = ?', 'b = ?`) blijft een
    // eigen regel.
    const parts = raw.split("'");
    let toelichting: string | null = null;
    const spoel = (): void => {
      if (toelichting !== null && toelichting.trim() !== '') lines.push("'" + INLINE_MARK + toelichting);
      toelichting = null;
    };
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      if (i % 2 === 1) {
        if (toelichting !== null) toelichting += part;
        else if (part.trim() !== '') lines.push("'" + part);
        continue;
      }
      if (part.trim() === '') continue;
      if (toelichting !== null && !isOpdrachtRegel(part)) {
        toelichting += "'" + part + "'";
        continue;
      }
      spoel();
      lines.push(part);
      toelichting = '';
    }
    spoel();
  }

  const state: ParserState = { hidden: false, scherm: false, jsBlokken };
  return parseLines(lines, 0, lines.length, state).nodes;
}

interface ParseResult {
  nodes: AstNode[];
  endIndex: number;
}

function parseLines(
  lines: string[],
  start: number,
  end: number,
  state: ParserState,
  stopOn?: (trimmed: string) => boolean,
): ParseResult {
  const nodes: AstNode[] = [];
  let i = start;

  while (i < end) {
    const line = lines[i];
    let trimmed = line.trim();

    if (stopOn && stopOn(trimmed)) break;

    // Skip empties
    if (trimmed === '') {
      i++;
      continue;
    }

    // JS-style comment line — fully ignored
    if (COMMENT_SLASH_RE.test(trimmed)) {
      i++;
      continue;
    }

    // prose line: 'free text + <i>HTML</i>
    // May contain embedded `'expr'` value interpolation (e.g. SVG macros).
    const proseMatch = trimmed.match(PROSE_RE);
    if (proseMatch) {
      const inline = proseMatch[1].startsWith(INLINE_MARK);
      const text = inline ? proseMatch[1].slice(INLINE_MARK.length) : proseMatch[1];
      const textTrim = text.trim();
      const extra = inline ? { inline: true } : {};
      // Skip empty prose AND the language's persisted input values that latch
      // onto a trailing `'` (e.g. `'2	1` at EOF).
      if (textTrim !== '' && !TRAILING_DATA_RE.test(textTrim)) {
        if (text.indexOf("'") !== -1) {
          // Interpolation: split on `'`, alternating literal/expression.
          const segments = text.split("'");
          const parts: NonNullable<TextNode['parts']> = [];
          for (let k = 0; k < segments.length; k++) {
            const seg = segments[k];
            if (k % 2 === 0) {
              if (seg !== '') parts.push({ kind: 'literal', value: seg });
            } else {
              // Ook een ingevoegde expressie normaliseren, net als elke andere.
              // Zonder deze stap werkte `max(a; b)` wél in een toekenning maar
              // niet tussen twee apostrofs in een tekst- of SVG-regel: daar
              // bleef de puntkomma staan, mislukte de berekening en kwam de
              // expressie letterlijk in de uitdraai terecht. Alleen de
              // expressie-delen gaan hier langs; de letterlijke stukken — met
              // hun CSS en &nbsp; — blijven ongemoeid.
              // Een formaataanduiding (`'x:F2'`) gaat met de expressie mee.
              const { tekst, formaat } = knipFormaat(seg.trim());
              const expr = normalizeExpression(tekst.trim());
              if (expr !== '') parts.push(formaat ? { kind: 'expr', value: expr, formaat } : { kind: 'expr', value: expr });
            }
          }
          nodes.push(markHidden({ type: 'text', text: knipFormaat(textTrim).tekst, html: true, parts, ...extra }, state));
        } else {
          nodes.push(markHidden({ type: 'text', text: textTrim, html: true, ...extra }, state));
        }
      }
      i++;
      continue;
    }

    // Formaataanduiding aan het eind van het rekendeel (zie stripFormatSpecs);
    // alleen een toekenning en een losse weergave gebruiken hem.
    let formaat: string | undefined;
    if (trimmed.indexOf(FORMAAT_MARK) !== -1) {
      const k = knipFormaat(trimmed);
      trimmed = k.tekst.trim();
      formaat = k.formaat;
    }
    const metFormaat = formaat ? { formaat } : {};

    // title line: "Title text → emit as H1
    const titleMatch = trimmed.match(TITLE_RE);
    if (titleMatch) {
      const text = titleMatch[1].trim();
      if (text !== '') {
        nodes.push(markHidden({ type: 'heading', level: 1, text }, state));
      }
      i++;
      continue;
    }

    // Markdown headings
    const headingMatch = trimmed.match(HEADING_RE);
    if (headingMatch) {
      nodes.push(
        markHidden({
          type: 'heading',
          level: headingMatch[1].length,
          text: headingMatch[2],
        }, state),
      );
      i++;
      continue;
    }

    // Visibility directives. `#hide`, `#show`, `#pre` en `#post` sluiten elkaar
    // uit, zoals in de rekentaal: elk zet de stand voor de regels die volgen.
    if (HIDE_RE.test(trimmed)) { state.hidden = true; state.scherm = false; i++; continue; }
    if (SHOW_RE.test(trimmed)) { state.hidden = false; state.scherm = false; i++; continue; }

    // `#pre` / `#post` (zie ParserState.scherm). Real calculation files often use
    // `#hide` followed by `#post` to "begin showing results again" — so
    // `#post` un-hides. `#pre`: alleen op het scherm, bij de invoer.
    if (POST_RE.test(trimmed)) { state.hidden = false; state.scherm = false; i++; continue; }
    if (PRE_RE.test(trimmed)) { state.hidden = false; state.scherm = true; i++; continue; }

    // #deg / #rad / #gra, #equ / #val / #noc, #varsub / #nosub / #novar: zie
    // OpdrachtNode. Ook in een verborgen deel: ze tonen zelf niets.
    const opdrachtMatch = trimmed.match(OPDRACHT_RE);
    if (opdrachtMatch) {
      nodes.push({ type: 'opdracht', opdracht: opdrachtMatch[1].toLowerCase() as OpdrachtNode['opdracht'] });
      i++;
      continue;
    }
    // `#round n`: n decimalen (0 … 15); `#round default` (of zonder getal):
    // weer de opmaak van de app.
    const roundMatch = trimmed.match(ROUND_RE);
    if (roundMatch) {
      const n = roundMatch[1].match(/^\d+/);
      nodes.push({ type: 'opdracht', opdracht: 'round', decimalen: n ? Math.min(15, parseInt(n[0], 10)) : null });
      i++;
      continue;
    }

    // #def / #include — currently skipped (string-constant definitions and
    // file inclusion are out of scope for this engine).
    if (NO_OP_DIRECTIVE_RE.test(trimmed)) { i++; continue; }

    // #repeat N … #loop of … #end repeat. Zonder N herhaalt de lus
    // tot een #break, met een bovengrens in de rekenkern. N wordt afgerond op
    // het dichtstbijzijnde gehele getal, zoals in de rekentaal.
    const repeatMatch = trimmed.match(REPEAT_RE);
    if (repeatMatch) {
      const wasHidden = state.hidden;
      const n = repeatMatch[1].trim();
      const count = n === '' ? '' : `round(${normalizeExpression(n)})`;
      i++;
      const bodyResult = parseLines(lines, i, end, state, (t) => ENDREPEAT_RE.test(t) || LOOP_RE.test(t));
      i = bodyResult.endIndex;
      if (i < end) i++;
      const repeatNode = { type: 'repeat' as const, count, body: bodyResult.nodes };
      nodes.push(wasHidden ? { ...repeatNode, hidden: true } : repeatNode);
      continue;
    }

    // `#while voorwaarde … #loop`: zolang de voorwaarde waar is.
    const whileMatch = trimmed.match(WHILE_RE);
    if (whileMatch) {
      const wasHidden = state.hidden;
      // `max=N` aan het eind maakt de lus begrensd; zonder blijft alles zoals het was.
      const { rest, opties } = lusOpties(whileMatch[1]);
      const conditie = stripCondWrapping(rest);
      i++;
      const bodyResult = parseLines(lines, i, end, state, (t) => LOOP_RE.test(t));
      i = bodyResult.endIndex;
      if (i < end) i++;
      const repeatNode = {
        type: 'repeat' as const,
        count: '',
        conditie,
        ...(opties.max !== undefined ? { max: opties.max } : {}),
        body: bodyResult.nodes,
      };
      nodes.push(wasHidden ? { ...repeatNode, hidden: true } : repeatNode);
      continue;
    }

    // `#iterate x tol=… max=… … #loop`: herhaal tot x niet meer verandert.
    const iterateMatch = trimmed.match(ITERATE_RE);
    if (iterateMatch) {
      const wasHidden = state.hidden;
      const { opties } = lusOpties(iterateMatch[2]);
      i++;
      const bodyResult = parseLines(lines, i, end, state, (t) => LOOP_RE.test(t));
      i = bodyResult.endIndex;
      if (i < end) i++;
      const repeatNode = {
        type: 'repeat' as const,
        count: '',
        volg: iterateMatch[1],
        tol: opties.tol ?? ITERATE_TOL,
        max: opties.max ?? ITERATE_MAX,
        body: bodyResult.nodes,
      };
      nodes.push(wasHidden ? { ...repeatNode, hidden: true } : repeatNode);
      continue;
    }

    // `#for var = lo : hi … #loop` — emit as a repeat node with the
    // loop-var name baked into a synthetic `var = lo + _i - 1` prelude. Evaluator
    // already exposes `_i` (1-based iteration counter) inside repeat bodies, so
    // we only need to bind the user's `var` to the right value.
    const forMatch = trimmed.match(FOR_RE);
    if (forMatch) {
      const wasHidden = state.hidden;
      const varName = forMatch[1];
      // Genormaliseerd zoals elke expressie: `#for i = 1 : max(a; b)`.
      const lo = normalizeExpression(forMatch[2].trim());
      const hi = normalizeExpression(forMatch[3].trim());
      i++;
      const bodyResult = parseLines(lines, i, end, state, (t) => LOOP_RE.test(t));
      i = bodyResult.endIndex;
      if (i < end) i++;
      // Prepend a synthetic assignment so the loop variable is in scope each iter.
      // Hidden so it doesn't show up in the rendered output (it's an implementation
      // detail of the #for → repeat translation, not user-authored math).
      const prelude: AstNode = {
        type: 'assignment',
        name: varName,
        expression: `(${lo}) + _i - 1`,
        raw: `${varName} = ${lo} + _i - 1`,
        hidden: true,
      };
      const count = `(${hi}) - (${lo}) + 1`;
      const repeatNode = {
        type: 'repeat' as const,
        count,
        body: [prelude, ...bodyResult.nodes],
      };
      nodes.push(wasHidden ? { ...repeatNode, hidden: true } : repeatNode);
      continue;
    }

    // `#break` inside loops — emit a BreakNode that the evaluator's repeat
    // case uses as an early-exit signal (e.g. find-first-passing-pile-type).
    if (BREAK_RE.test(trimmed)) {
      nodes.push(markHidden({ type: 'break' }, state));
      i++;
      continue;
    }
    // `#continue`: de rest van deze ronde overslaan, door met de volgende.
    if (CONTINUE_RE.test(trimmed)) {
      nodes.push(markHidden({ type: 'break', doorgaan: true }, state));
      i++;
      continue;
    }

    // SVG block
    if (SVG_START_RE.test(trimmed)) {
      const svgLines: string[] = [];
      i++;
      while (i < end && !BLOCK_END_RE.test(lines[i].trim())) {
        svgLines.push(lines[i]);
        i++;
      }
      nodes.push(markHidden({ type: 'svg', content: svgLines.join('\n') }, state));
      if (i < end) i++;
      continue;
    }

    // Toetsblok (`@toets naam = tool … @end`): een normtoets door FEM Studio (toetsBlok.ts).
    const toetsMatch = trimmed.match(TOETS_START_RE);
    if (toetsMatch) {
      const blokRegels: string[] = [];
      i++;
      while (i < end && !BLOCK_END_RE.test(lines[i].trim())) {
        blokRegels.push(lines[i]);
        i++;
      }
      const blok = leesToetsBlok(toetsMatch[1], toetsMatch[2], blokRegels, normaliseer3d);
      if (i >= end) blok.fouten.push('toetsblok zonder @end');
      nodes.push(markHidden({ type: 'toets', ...blok }, state));
      if (i < end) i++;
      continue;
    }

    // FEM-blok (`@fem naam … @end`): een plaatmodel dat FEM Studio doorrekent (femBlok.ts).
    const femMatch = trimmed.match(FEM_START_RE);
    if (femMatch) {
      const blokRegels: string[] = [];
      i++;
      while (i < end && !BLOCK_END_RE.test(lines[i].trim())) {
        blokRegels.push(lines[i]);
        i++;
      }
      const blok = leesFemBlok(femMatch[1], blokRegels, normaliseer3d);
      if (i >= end) blok.fouten.push('@fem-blok zonder @end');
      nodes.push(markHidden({ type: 'fem', ...blok }, state));
      if (i < end) i++;
      continue;
    }

    // Kernblok (`@kern naam = tool … @end`): een rekentool van FEM Studio met geneste invoer (kernBlok.ts).
    const kernMatch = trimmed.match(KERN_START_RE);
    if (kernMatch) {
      const blokRegels: string[] = [];
      i++;
      while (i < end && !BLOCK_END_RE.test(lines[i].trim())) {
        blokRegels.push(lines[i]);
        i++;
      }
      const blok = leesKernBlok(kernMatch[1], kernMatch[2], blokRegels, normaliseer3d);
      if (i >= end) blok.fouten.push('@kern-blok zonder @end');
      nodes.push(markHidden({ type: 'kern', ...blok }, state));
      if (i < end) i++;
      continue;
    }

    // 3D-blok (`@3d … @end`): de regels tot `@end` vormen de scène (drieD.ts).
    if (DRIE_D_START_RE.test(trimmed)) {
      const blokRegels: string[] = [];
      i++;
      while (i < end && !BLOCK_END_RE.test(lines[i].trim())) {
        blokRegels.push(lines[i]);
        i++;
      }
      const blok = leesDrieD(blokRegels, normaliseer3d);
      if (i >= end) blok.fouten.push('3D-blok zonder @end: alles tot het eind van het blad is als 3D gelezen');
      nodes.push(markHidden({ type: '3d', ...blok }, state));
      if (i < end) i++;
      continue;
    }

    // Select block
    const selectMatch = trimmed.match(SELECT_START_RE);
    if (selectMatch) {
      const name = selectMatch[1];
      const label = selectMatch[2];
      const options: { text: string; value: string }[] = [];
      i++;
      while (i < end && !BLOCK_END_RE.test(lines[i].trim())) {
        const optLine = lines[i].trim();
        if (optLine !== '' && !COMMENT_SLASH_RE.test(optLine)) {
          const optMatch = optLine.match(SELECT_OPTION_RE);
          if (optMatch) {
            options.push({ text: optMatch[1].trim(), value: optMatch[2].trim() });
          }
        }
        i++;
      }
      nodes.push(markHidden({ type: 'select', name, label, options }, state));
      if (i < end) i++;
      continue;
    }

    // @img(...)
    // De bestandsnaam, URL of data-URL gaat ongewijzigd door (alleenInCode
    // slaat deze regel over); aanhalingstekens eromheen vallen weg.
    const imgMatch = trimmed.match(IMG_RE);
    if (imgMatch) {
      nodes.push(markHidden({ type: 'image', src: imgMatch[1].trim().replace(/^(["'])(.*)\1$/, '$2') }, state));
      i++;
      continue;
    }

    // @js … @end (jsBlok.ts): de code staat apart, zie parse().
    const jsMatch = trimmed.match(JS_PLEK_RE);
    if (jsMatch) {
      nodes.push(markHidden({ type: 'js', ...leesJsBlok(jsMatch[2], state.jsBlokken[Number(jsMatch[1])], normaliseer3d) }, state));
      i++;
      continue;
    }

    // @iframe url hoogte=120mm (iframeBlok.ts)
    const iframeMatch = trimmed.match(IFRAME_RE);
    if (iframeMatch) {
      nodes.push(markHidden({ type: 'iframe', ...leesIframe(iframeMatch[1] ?? '', normaliseer3d) }, state));
      i++;
      continue;
    }

    // @ifcx balklaag hoogte=340 (ifcxBlok.ts)
    const ifcxMatch = trimmed.match(IFCX_RE);
    if (ifcxMatch) {
      nodes.push(markHidden({ type: 'ifcx', ...leesIfcxBlok(ifcxMatch[1] ?? '', normaliseer3d) }, state));
      i++;
      continue;
    }

    // @gef name
    const gefMatch = trimmed.match(GEF_RE);
    if (gefMatch) {
      nodes.push(markHidden({ type: 'gef-upload', name: gefMatch[1] }, state));
      i++;
      continue;
    }

    // Conditional cascade
    const ifMatch = trimmed.match(IF_RE);
    if (ifMatch) {
      // IF_RE captures everything after `#if `. The condition may itself
      // contain trailing junk (e.g. extra `'` tokens); strip it.
      const cond = stripCondWrapping(ifMatch[1]);
      const result = parseConditional(lines, i, end, state, cond);
      nodes.push(result.node);
      i = result.endIndex;
      continue;
    }

    // $Plot{...}
    const plotMatch = trimmed.match(PLOT_RE);
    if (plotMatch) {
      const plot = parsePlotSpec(plotMatch[1]);
      if (plot) {
        nodes.push(markHidden(plot, state));
      }
      i++;
      continue;
    }

    // Input prompt — check BEFORE generic assignment
    const promptMatch = trimmed.match(INPUT_PROMPT_RE);
    if (promptMatch) {
      let unit = promptMatch[2].trim();
      // De standaardwaarde staat tussen accolades achter het
      // vraagteken, de eenheid daarna: `L = ?{5000}mm`, `F = ? {3} kN`,
      // `q = ?{2.5}*(kN/m)`. Zonder accolades is hij 0.
      let defaultValue = '0';
      if (unit.startsWith('{')) {
        const sluit = unit.indexOf('}');
        if (sluit !== -1) {
          const w = unit.slice(1, sluit).trim();
          if (w !== '') defaultValue = w;
          unit = unit.slice(sluit + 1).trim();
        }
      }
      // The language allows `?*(unit)` for prompts that imply multiplication by the
      // unit (e.g. `q = ?*(kN/m)`). Strip the leading `*` plus optional parens.
      if (unit.startsWith('*')) unit = unit.slice(1).trim();
      if (unit.startsWith('(') && unit.endsWith(')')) {
        unit = unit.slice(1, -1).trim();
      }
      nodes.push(
        markHidden({
          type: 'input-prompt',
          name: promptMatch[1],
          label: promptMatch[1],
          defaultValue,
          unit,
        }, state),
      );
      i++;
      continue;
    }

    // User function — match BEFORE generic assignment
    const fnMatch = trimmed.match(USER_FUNC_RE);
    if (fnMatch) {
      const params = fnMatch[2].split(/[,;]/).map((p) => p.trim());
      // De hulpfunctie van een $Root-, $Sum-, $Area-blok enz. (zie
      // rewriteSolverDirectives) is een detail van de vertaling: niet tonen.
      const hulp = fnMatch[1].startsWith('__solver_');
      nodes.push(
        markHidden({
          ...(hulp ? { hidden: true } : {}),
          type: 'user-function',
          name: fnMatch[1],
          params,
          // Net als elke andere expressie normaliseren. Zonder deze stap bleef
          // de body van een functie als enige achter met rekentaal-notatie: een
          // `if(a; b; c)` erin werd nooit omgezet naar komma's en `≤`, `≡` en π
          // bleven onvertaald, waarna de aanroep stilzwijgend als tekst in de
          // uitdraai belandde in plaats van als getal.
          expression: normalizeExpression(fnMatch[3].trim()),
          raw: trimmed,
        }, state),
      );
      i++;
      continue;
    }

    // Toekenning aan een element: `A.(i; j) = …`, `v.(i) = …`, `v.i = …`.
    // Zonder deze stap viel zo'n regel stil terug op tekst, zodat een
    // stijfheidsmatrix niet in een lus op te bouwen was.
    const element = leesElementToekenning(trimmed);
    if (element) {
      nodes.push(
        markHidden({
          type: 'assignment',
          name: element.naam,
          index: normalizeExpression(element.index),
          expression: normalizeExpression(element.waarde),
          raw: trimmed,
          ...metFormaat,
        }, state),
      );
      i++;
      continue;
    }

    // Een eigen eenheid: `.kipf = 1000 lbf`.
    const eenheidMatch = trimmed.match(EENHEID_DEF_RE);
    if (eenheidMatch) {
      nodes.push(markHidden({ type: 'eenheid-def', name: eenheidMatch[1], expression: normalizeExpression(eenheidMatch[2].trim()) }, state));
      i++;
      continue;
    }

    // Generic assignment
    const assignMatch = trimmed.match(ASSIGNMENT_RE);
    if (assignMatch) {
      nodes.push(
        markHidden({
          type: 'assignment',
          name: assignMatch[1],
          expression: normalizeExpression(assignMatch[2].trim()),
          raw: trimmed,
          ...metFormaat,
        }, state),
      );
      i++;
      continue;
    }

    // Losse weergave met omrekening: `M|kN*m`, `M to kN*m` of `M in kN*m` op
    // een eigen regel. Alleen als er achter de naam echt een eenheid staat,
    // zodat een tekstregel als "Fundering in beton" tekst blijft.
    const omrekenMatch = trimmed.match(OMREKEN_WEERGAVE_RE);
    if (omrekenMatch && isDoeleenheid(omrekenMatch[2])) {
      nodes.push(markHidden({ type: 'var-display', name: omrekenMatch[1], omrekening: inchInDoel(omrekenMatch[2].trim()), ...metFormaat }, state));
      i++;
      continue;
    }

    // Bare variable display
    const varDisplayMatch = trimmed.match(VAR_DISPLAY_RE);
    if (varDisplayMatch) {
      nodes.push(markHidden({ type: 'var-display', name: varDisplayMatch[1], ...metFormaat }, state));
      i++;
      continue;
    }

    // trailing data (persisted prompt inputs) — skip silently
    if (TRAILING_DATA_RE.test(trimmed)) {
      i++;
      continue;
    }

    // Fallback: plain text (escaped at render)
    nodes.push(markHidden({ type: 'text', text: trimmed }, state));
    i++;
  }

  return { nodes, endIndex: i };
}

function markHidden<T extends AstNode>(node: T, state: ParserState): T {
  if (state.hidden) {
    return { ...node, hidden: true };
  }
  if (state.scherm) {
    return { ...node, scherm: true };
  }
  return node;
}

/**
 * Strip the language's HTML-comment wrapping from a condition string.
 * `'<!--'a ≡ 0'-->`  →  `a ≡ 0`
 * Also normalises language-specific operators to math.js-compatible forms.
 */
/**
 * Haalt `tol=…` en `max=…` van het eind van een lusregel (`#while`, `#iterate`).
 * Alleen met spatie ervoor en `=` erna, zodat `max(a; b)` in een voorwaarde blijft staan.
 */
function lusOpties(tekst: string): { rest: string; opties: { tol?: string; max?: string } } {
  const opties: { tol?: string; max?: string } = {};
  let rest = tekst.trim();
  for (;;) {
    const m = /(?:^|\s)(tol|max)\s*=\s*([^\s=]+)\s*$/i.exec(rest);
    if (!m) break;
    const sleutel = m[1].toLowerCase() as 'tol' | 'max';
    if (opties[sleutel] === undefined) opties[sleutel] = normalizeExpression(m[2]);
    rest = rest.slice(0, m.index).trim();
  }
  return { rest, opties };
}

function stripCondWrapping(cond: string): string {
  const m = cond.match(HTML_COMMENT_WRAPPER_RE);
  let stripped = m ? m[1].trim() : cond.trim();
  // comparison operators → math.js
  stripped = stripped
    .replace(/≡/g, '==')
    .replace(/≠/g, '!=')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=');
  return normalizeExpression(stripped);
}

/**
 * Translate language-specific identifiers / Unicode constants / separators to
 * math.js-compatible forms.
 *
 *   sqr(x)         → sqrt(x)
 *   lg(x)          → log10(x)         (common-log)
 *   π              → pi
 *   f(a; b; c)     → f(a, b, c)       (the language uses `;` as arg separator)
 */
/**
 * Lift iterative-solver directives out of expressions so they can
 * use mathjs user-functions internally.
 *
 *   `$Find{f(x) @ x = lo : hi}`   → bisection on f(x) = 0 in [lo, hi]
 *   `$Root{...}`                   → alias for $Find
 *   `$Solve{f(x) @ x = guess}`    → Newton-Raphson from `guess`
 *   `$Sup{f(x) @ x = lo : hi}`    → golden-section search for the max
 *   `$Inf{f(x) @ x = lo : hi}`    → golden-section search for the min
 *
 * Each directive is replaced by a `_find_root` / `_solve_newton` /
 * `_extremum` call (registered in evaluator.ts as JS-backed math functions)
 * and an auxiliary `__solver_N(var) = body` function is emitted on a line
 * directly before the original.
 */
function rewriteSolverDirectives(source: string): string {
  const lines = source.split('\n');
  const out: string[] = [];
  let counter = 0;
  for (const line of lines) {
    const defs: string[] = [];
    // Alleen in rekendelen: een blok dat in de tekst van een prozaregel staat
    // (`'Gebruik $Sum{…} voor een som`) is uitleg en blijft staan.
    const newLine = alleenInCode(line, (code) => code.replace(SOLVER_RE, (match, op: string, inner: string) => {
      const atIdx = inner.lastIndexOf('@');
      if (atIdx === -1) return match;
      const body = inner.slice(0, atIdx).trim();
      const param = inner.slice(atIdx + 1).trim();
      const eqIdx = param.indexOf('=');
      if (eqIdx === -1) return match;
      const varName = param.slice(0, eqIdx).trim();
      const range = param.slice(eqIdx + 1).trim();
      counter += 1;
      const fnName = `__solver_${counter}`;
      // `$Root{x^3 = 5 @ …}`: een vergelijking wordt links − rechts = 0.
      const delen = (op === 'Find' || op === 'Root' || op === 'Solve') ? body.split(/(?<![=<>!≤≥≠])=(?!=)/) : [body];
      const lichaam = delen.length === 2 ? `(${delen[0].trim()}) - (${delen[1].trim()})` : body;
      defs.push(`${fnName}(${varName}) = ${lichaam}`);
      // De aanroep staat in `_cp_los(blok, variabele, links, rechts, aanroep)`:
      // die rekent als de aanroep zelf, en latex.ts toont het blok zoals het
      // er staat (Root{f(x) = 0; x ∈ [a; b]}, ∑, ∫) in plaats van de
      // hulpfunctie __solver_N en _find_root, die nooit in beeld horen.
      const toon = (aanroep: string): string => {
        const links = normalizeExpression((delen.length === 2 ? delen[0] : body).trim());
        const rechts = delen.length === 2 ? normalizeExpression(delen[1].trim()) : '';
        return `_cp_los(${JSON.stringify(op)}, ${JSON.stringify(varName)}, ${JSON.stringify(links)}, ${JSON.stringify(rechts)}, ${aanroep})`;
      };
      if (op === 'Solve') {
        return toon(`_solve_newton(${fnName}, ${range})`);
      }
      if (op === 'Slope') {
        return toon(`_helling(${fnName}, ${range})`);
      }
      const colonIdx = range.indexOf(':');
      if (colonIdx === -1) return match;
      const lo = range.slice(0, colonIdx).trim();
      const hi = range.slice(colonIdx + 1).trim();
      if (op === 'Find' || op === 'Root') return toon(`_find_root(${fnName}, ${lo}, ${hi})`);
      if (op === 'Sup') return toon(`_extremum(${fnName}, ${lo}, ${hi}, 1)`);
      if (op === 'Inf') return toon(`_extremum(${fnName}, ${lo}, ${hi}, -1)`);
      if (op === 'Sum') return toon(`_reeks_som(${fnName}, ${lo}, ${hi})`);
      if (op === 'Product') return toon(`_reeks_product(${fnName}, ${lo}, ${hi})`);
      if (op === 'Area' || op === 'Integral') return toon(`_integraal(${fnName}, ${lo}, ${hi})`);
      return match;
    }));
    for (const d of defs) out.push(d);
    out.push(newLine);
  }
  return out.join('\n');
}

/**
 * Een tekenreeks tussen dubbele aanhalingstekens blijft letterlijk: alle
 * omzettingen gelden alleen voor de stukken ertussen. Eerder werd elke `;`
 * een `,`, ook in `concat("a;b"; c)` en in een stijl als "fill:red;stroke:blue".
 */
function normalizeExpression(expr: string): string {
  const stukken = expr.split('"');
  return stukken
    .map((stuk, i) => (i % 2 === 1 ? stuk : normaliseerCode(stuk, i === stukken.length - 1)))
    .join('"');
}

function normaliseerCode(code: string, einde: boolean): string {
  let uit = code
    .replace(/\bsqr\b/g, 'sqrt')
    .replace(/\blg\b/g, 'log10')
    .replace(/π/g, 'pi')
    .replace(/≡/g, '==')
    .replace(/≠/g, '!=')
    .replace(/≥/g, '>=')
    .replace(/≤/g, '<=');
  if (einde) {
    // `expr|unit` = target-unit conversion → mathjs `expr to unit`.
    // Runs after matrix-rewrite so `[a;b|c;d]` matrices are already
    // converted to nested arrays before this point.
    uit = uit.replace(/\|(\s*[\p{L}\p{N}_/\s^*()-]+)$/u, (_m, doel: string) => ` to ${inchInDoel(doel)}`);
    uit = zetInOmNaarTo(uit);
  }
  return bindEenheidAanGetal(uit).replace(/;/g, ',');
}

/**
 * Omrekenen met `in`. In de rekentaal is `in` de inch en omrekenen `|`; mathjs kent
 * `in` als omrekening (`x in mm`) én als inch, en leest `2 in` (een getal
 * ervoor) als 2 inch. `F*a/2 in kN*m` werd zo (F·a)/(2 inch)·kN·m.
 *
 * De veilige weg: alleen een `in` waarachter tot het eind uitsluitend een
 * eenheid staat (`x in kN*m`, `F*a/2 in N/mm^2`) is een omrekening; die wordt
 * hier `to`, zodat mathjs hem niet meer kan verwarren met de inch. Elke andere
 * `in` blijft de inch: `w = 3 in`, `3 in + 2 mm`, `F*1 in`. Een inch in de
 * doeleenheid zelf wordt `inch` (`x in in` → `x to inch`).
 */
function zetInOmNaarTo(code: string): string {
  const m = code.match(/^([\s\S]*\S)\s+in\s+([\p{L}°(][\p{L}\p{N}_°\s*/^().-]*)$/u);
  if (!m || !isDoeleenheid(m[2])) return code;
  return `${m[1]} to ${inchInDoel(m[2].trim())}`;
}

/** Alleen eenheden (en getallen als macht of teller): `kN*m`, `N/mm^2`, `1/K`, `in`. */
function isDoeleenheid(doel: string): boolean {
  const t = doel.trim();
  if (t === '' || !/^[\p{L}\p{N}_°\s*/^().-]+$/u.test(t)) return false;
  const namen = t.match(/[\p{L}_°][\p{L}\p{N}_°]*/gu) ?? [];
  if (namen.length === 0) return false;
  return namen.every((n) => {
    if (n === 'in' || n === 'inch' || eigenEenheden.has(n)) return true;
    if (GEEN_EENHEID.has(n)) return false;
    try {
      return Unit.isValuelessUnit(n);
    } catch {
      return false;
    }
  });
}

/** De inch als doeleenheid: na `to` leest mathjs `in` niet als eenheid. */
function inchInDoel(doel: string): string {
  return doel.replace(/(?<![\p{L}\p{N}_])in(?![\p{L}\p{N}_])/gu, 'inch');
}

/** Eenheden van één letter die na een getal als eenheid gelden; andere letters zijn meestal variabelen (h, b, t, L, A, K, d). */
const EENHEID_EEN_LETTER = new Set(['m', 'N', 'J', 'W', 'V']);
/** Woorden die mathjs als eenheid kent maar hier een bewerking zijn (`x to mm`, `x in mm`). */
const GEEN_EENHEID = new Set(['to', 'in', 'and', 'or', 'xor', 'not', 'mod']);

/**
 * Eigen eenheden die bij het lezen van dit blad gelden: wat het blad zelf met
 * `.naam = …` maakt en wat `ParseOptions.eenheden` meegeeft. De rekenkern maakt ze
 * pas bij het rekenen aan; het lezen moet ze eerder kennen, anders hoort `0.92EUR`
 * niet bij elkaar.
 */
let eigenEenheden: ReadonlySet<string> = new Set();

function isEenheid(naam: string): boolean {
  if (eigenEenheden.has(naam)) return true;
  if (GEEN_EENHEID.has(naam)) return false;
  if (naam.length === 1 && !EENHEID_EEN_LETTER.has(naam)) return false;
  try {
    return Unit.isValuelessUnit(naam);
  } catch {
    return false;
  }
}

/**
 * In de rekentaal hoort een eenheid bij het getal ervoor: `5 kN/m` is één
 * grootheid. Na een deelstreep maakt dat verschil. mathjs leest
 * `20 kN/5 kN/m` als (20 kN / 5 kN) / m = 4 m⁻¹, waar de rekentaal
 * 20 kN / (5 kN/m) = 4 m bedoelt, en `3/4 mm` als (3/4) mm in plaats van
 * 3 / (4 mm). Daarom komen een getal en zijn eenheid direct na een `/` tussen
 * haken: `/ 5 kN/m` → `/(5 kN/m)`. De eenheid loopt door over `/eenheid` en
 * `^macht`, niet over `*` (`/2 m*h` met h een hoogte blijft `/(2 m)*h`), en
 * stopt bij een naam die geen eenheid is. Elders verandert er niets: `5 kN/m`
 * aan het begin of na `*`, `+` of `(` rekent mathjs al als één grootheid.
 */
function bindEenheidAanGetal(expr: string): string {
  if (expr.indexOf('/') === -1) return expr;
  const begin = /\/(\s*)(\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\.\d+(?:[eE][+-]?\d+)?)(\s*)/y;
  const naamRe = /([\p{L}_°][\p{L}\p{N}_]*)/uy;
  const machtRe = /\s*\^\s*-?\d+(?![\d.])/y;
  const deelRe = /\s*\/\s*/y;
  let uit = '';
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch !== '/') {
      uit += ch;
      i++;
      continue;
    }
    begin.lastIndex = i;
    const g = begin.exec(expr);
    if (!g) {
      uit += ch;
      i++;
      continue;
    }
    // Het getal moet een eenheid achter zich hebben.
    const naNummer = i + g[0].length;
    const leesEenheid = (vanaf: number): number => {
      naamRe.lastIndex = vanaf;
      const n = naamRe.exec(expr);
      if (!n || !isEenheid(n[1])) return -1;
      let eind = vanaf + n[0].length;
      if (expr[eind] === '(') return -1; // een functie, geen eenheid
      machtRe.lastIndex = eind;
      const p = machtRe.exec(expr);
      if (p) eind += p[0].length;
      return eind;
    };
    let eind = leesEenheid(naNummer);
    if (eind === -1) {
      uit += ch;
      i++;
      continue;
    }
    for (;;) {
      deelRe.lastIndex = eind;
      const d = deelRe.exec(expr);
      if (!d) break;
      const verder = leesEenheid(eind + d[0].length);
      if (verder === -1) break;
      eind = verder;
    }
    uit += `/${g[1]}(${expr.slice(i + 1 + g[1].length, eind).trim()})`;
    i = eind;
  }
  return uit;
}

/**
 * Parse a $Plot{...} body. Examples:
 *   "x|f(x) & x_1|0 @ x = x_min : x_max"   → 2 curves over x ∈ [x_min, x_max]
 *   "sin(t)|cos(t) @ t = 0 : 2*π"           → single parametric curve
 *   "f(x) @ x = -10 : 10"                   → single y=f(x) curve, implicit x
 */
function parsePlotSpec(spec: string): PlotNode | null {
  const atIdx = spec.lastIndexOf('@');
  if (atIdx === -1) return null;

  const curvesStr = spec.slice(0, atIdx).trim();
  const paramStr = spec.slice(atIdx + 1).trim();

  const eqIdx = paramStr.indexOf('=');
  if (eqIdx === -1) return null;
  const paramName = paramStr.slice(0, eqIdx).trim();
  const range = paramStr.slice(eqIdx + 1).trim();
  const colonIdx = range.indexOf(':');
  if (colonIdx === -1) return null;
  const lo = range.slice(0, colonIdx).trim();
  const hi = range.slice(colonIdx + 1).trim();

  const curves = curvesStr.split('&').map((c) => {
    const c2 = c.trim();
    const pipeIdx = c2.indexOf('|');
    if (pipeIdx === -1) {
      return { yExpr: c2 };
    }
    return {
      xExpr: c2.slice(0, pipeIdx).trim(),
      yExpr: c2.slice(pipeIdx + 1).trim(),
    };
  });

  return {
    type: 'plot',
    curves: curves.map((c) => ({
      xExpr: c.xExpr ? normalizeExpression(c.xExpr) : undefined,
      yExpr: normalizeExpression(c.yExpr),
    })),
    param: paramName,
    lo: normalizeExpression(lo),
    hi: normalizeExpression(hi),
    samples: 120,
  };
}

/**
 * Parse a cascading conditional starting at the `#if` line (already consumed).
 * `firstCondition` is the (already unwrapped) condition expression.
 */
function parseConditional(
  lines: string[],
  start: number,
  end: number,
  state: ParserState,
  firstCondition: string,
): { node: ConditionalNode; endIndex: number } {
  // Snapshot hidden state at the moment the `#if` appears. `#hide` inside any
  // branch body should not retroactively hide the conditional node itself.
  const wasHidden = state.hidden;
  const branches: { condition: string; body: AstNode[] }[] = [];
  let elseBody: AstNode[] = [];
  let currentCondition = firstCondition;
  let i = start + 1;

  while (i < end) {
    const bodyResult = collectConditionalBody(lines, i, end, state);
    branches.push({ condition: currentCondition, body: bodyResult.nodes });
    i = bodyResult.endIndex;

    if (i >= end) break;
    const trimmed = lines[i].trim();

    const elseIfMatch = trimmed.match(ELSE_IF_RE);
    if (elseIfMatch) {
      currentCondition = stripCondWrapping(elseIfMatch[1]);
      i++;
      continue;
    }

    if (ELSE_RE.test(trimmed)) {
      i++;
      const elseResult = collectConditionalBody(lines, i, end, state);
      elseBody = elseResult.nodes;
      i = elseResult.endIndex;
    }

    if (i < end && ENDIF_RE.test(lines[i].trim())) {
      i++;
    }
    break;
  }

  const node: ConditionalNode = {
    type: 'conditional' as const,
    branches,
    elseBody,
    condition: branches[0]?.condition,
    ifBody: branches[0]?.body,
  };
  if (wasHidden) node.hidden = true;

  return { node, endIndex: i };
}

function collectConditionalBody(
  lines: string[],
  start: number,
  end: number,
  state: ParserState,
): ParseResult {
  return parseLines(lines, start, end, state, (trimmed) =>
    ELSE_RE.test(trimmed) || ELSE_IF_RE.test(trimmed) || ENDIF_RE.test(trimmed),
  );
}
