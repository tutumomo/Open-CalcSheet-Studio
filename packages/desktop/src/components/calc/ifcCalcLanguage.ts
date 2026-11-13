import {
  StreamLanguage,
  HighlightStyle,
  syntaxHighlighting,
  foldService,
  type StreamParser,
  type StringStream,
} from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import {
  autocompletion,
  type Completion,
  type CompletionContext,
  type CompletionResult,
} from "@codemirror/autocomplete";
import { tags as t } from "@lezer/highlight";
import type { Extension } from "@codemirror/state";
import i18next from "../../i18n/config";

// ── Block folding ──────────────────────────────────────────────────────
//
// Match opener regex on a line; scan forward for the corresponding closer.
// The fold range starts at the END of the opening line (so the opener
// remains visible) and stops at the START of the closing line.
type FoldRule = { open: RegExp; close: RegExp };

const FOLD_RULES: FoldRule[] = [
  { open: /^\s*@svg\b/, close: /^\s*@end\b/ },
  { open: /^\s*@3d\b/, close: /^\s*@end\b/ },
  { open: /^\s*@fem\b/, close: /^\s*@end\b/ },
  { open: /^\s*@kern\b/, close: /^\s*@end\b/ },
  { open: /^\s*@js\b/, close: /^\s*@end\s*$/ },
  { open: /^\s*@select\b/, close: /^\s*@end\b/ },
  { open: /^\s*#if\b/, close: /^\s*#end\s+if\b/ },
  // De rekentaal sluit #repeat en #while met #loop; `#end repeat` blijft werken.
  { open: /^\s*#repeat\b/, close: /^\s*(#end\s+repeat|#loop)\b/ },
  { open: /^\s*#while\b/, close: /^\s*#loop\b/ },
  { open: /^\s*#for\b/, close: /^\s*#loop\b/ },
  // `#def name(...)` (multi-line; the inline `#def name = ...` form is skipped
  // because the opener regex below also rejects lines containing `=`).
  { open: /^\s*#def\s+[\p{L}_][\p{L}\p{N}_]*\$?\s*\([^)]*\)\s*$/u, close: /^\s*#end\s+def\b/ },
  // `#hide`/`#show` block — fold the hidden section.
  { open: /^\s*#hide\b/, close: /^\s*#show\b/ },
];

function ifcCalcFoldService(state: EditorState, lineStart: number, lineEnd: number) {
  const line = state.doc.sliceString(lineStart, lineEnd);
  const rule = FOLD_RULES.find((r) => r.open.test(line));
  if (!rule) return null;
  // Scan downward for the closer, tracking nesting of the same kind.
  let nest = 1;
  let i = lineEnd + 1; // start of next line
  while (i <= state.doc.length) {
    const ln = state.doc.lineAt(i);
    const text = state.doc.sliceString(ln.from, ln.to);
    if (rule.open.test(text)) nest++;
    else if (rule.close.test(text)) {
      nest--;
      if (nest === 0) {
        // Fold from end of opener line to start of closer line.
        return { from: lineEnd, to: ln.from };
      }
    }
    if (ln.to + 1 > state.doc.length) break;
    i = ln.to + 1;
  }
  return null;
}

/**
 * CodeMirror 6 stream parser for the calculation language.
 *
 * Token classes (Lezer tags):
 *   heading       → '# h1 …'  and  '"Title'
 *   comment       → '//' line comment
 *   keyword       → '#if', '#else', '#else if', '#end if', '#hide', '#show',
 *                   '#pre', '#post', '#repeat', '#end repeat',
 *                   '#rad', '#deg', '#gra'
 *   meta          → '@svg', '@end', '@select', '@gef', '@img(…)', '$Plot{ … }'
 *   string        → prose lines starting with `'`
 *   variableName  → identifier on the LHS of '='
 *   operator      → '=' '+' '-' '*' '/' '^' 'to' 'in'
 *   number        → numeric literal (decimal + scientific)
 *   unit          → units like mm, kN, MPa, deg, rad (after a number)
 *   punctuation   → '(' ')' '[' ']' '{' '}' ',' ';'
 */

const KEYWORDS = new Set([
  "if",
  "else",
  "end",
  "hide",
  "show",
  "pre",
  "post",
  "repeat",
  "rad",
  "deg",
  "gra",
]);

const UNIT_KEYWORDS = new Set([
  // length
  "mm", "cm", "dm", "m", "km",
  // mass
  "g", "kg", "ton",
  // force
  "N", "kN", "MN",
  // pressure / stress
  "Pa", "kPa", "MPa", "GPa",
  // moment
  "Nm",
  // angles
  "deg", "rad",
  // time
  "s", "min", "h", "ms",
  // misc
  "mol", "K",
]);

/** De woorden die in een `@js`-blok opvallen. */
const JS_WOORDEN = /^(?:const|let|var|function|return|if|else|for|while|do|switch|case|break|continue|new|class|extends|this|typeof|instanceof|in|of|await|async|try|catch|finally|throw|import|export|default|true|false|null|undefined|void|delete)\b/;

/** Eenvoudige kleuring van JavaScript: commentaar, tekst, getallen en woorden. */
function jsToken(stream: StringStream, state: { inJsCommentaar: boolean }): string | null {
  if (state.inJsCommentaar) {
    if (stream.match(/^.*?\*\//)) state.inJsCommentaar = false;
    else stream.skipToEnd();
    return "lineComment";
  }
  if (stream.eatSpace()) return null;
  if (stream.match("//")) {
    stream.skipToEnd();
    return "lineComment";
  }
  if (stream.match("/*")) {
    state.inJsCommentaar = true;
    return "lineComment";
  }
  const q = stream.peek();
  if (q === '"' || q === "'" || q === "`") {
    stream.next();
    while (!stream.eol()) {
      const c = stream.next();
      if (c === "\\") stream.next();
      else if (c === q) break;
    }
    return "string";
  }
  if (stream.match(/^\d+(?:\.\d+)?(?:e[-+]?\d+)?/i)) return "number";
  if (stream.match(JS_WOORDEN)) return "keyword";
  if (stream.match(/^[\p{L}_$][\p{L}\p{N}_$]*/u)) return "variableName";
  stream.next();
  return null;
}

const parser: StreamParser<{ inPlot: boolean; inJs: boolean; inJsCommentaar: boolean }> = {
  startState: () => ({ inPlot: false, inJs: false, inJsCommentaar: false }),

  token(stream, state) {
    // EOL
    if (stream.eol()) return null;

    // De code van een `@js`-blok is geen rekentaal; alleen een regel die precies
    // `@end` is, sluit hem.
    if (state.inJs) {
      if (stream.sol() && stream.match(/^\s*@end\s*$/)) {
        state.inJs = false;
        state.inJsCommentaar = false;
        return "meta";
      }
      return jsToken(stream, state);
    }
    if (stream.sol() && stream.match(/^\s*@js\b.*$/i)) {
      state.inJs = true;
      return "meta";
    }

    // title line `"Title …` — only at column 0
    if (stream.sol() && stream.peek() === '"') {
      stream.skipToEnd();
      return "heading";
    }

    // Markdown heading `# … ######`
    if (stream.sol() && stream.match(/^#{1,6}\s+/)) {
      stream.skipToEnd();
      return "heading";
    }

    // directive `#if`, `#hide`, `#repeat`, …
    if (stream.sol() && stream.match(/^#[a-zA-Z]+/)) {
      const matched = stream.current().slice(1); // remove leading '#'
      if (KEYWORDS.has(matched)) {
        // Eat optional rest of line for `#if`, `#else if`, `#repeat`
        return "keyword";
      }
      return "keyword";
    }

    // prose line `'…` at column 0 — runs to EOL
    if (stream.sol() && stream.peek() === "'") {
      stream.skipToEnd();
      return "string";
    }

    // Line comment `//…`
    if (stream.match("//")) {
      stream.skipToEnd();
      return "lineComment";
    }

    // Inline prose toggle `'…` mid-line — until next `'` or EOL
    if (stream.peek() === "'") {
      stream.next(); // consume opening quote
      while (!stream.eol() && stream.peek() !== "'") stream.next();
      if (stream.peek() === "'") stream.next(); // consume closing quote
      return "string";
    }

    // Inline double-quoted string `"…"` — used in #def constants
    // (`#def style1$ = style="…"`), HTML/SVG attributes, and string-typed
    // params. Highlight everything between the quotes as a string.
    if (stream.peek() === '"') {
      stream.next();
      while (!stream.eol() && stream.peek() !== '"') {
        if (stream.peek() === "\\") stream.next();
        stream.next();
      }
      if (stream.peek() === '"') stream.next();
      return "string";
    }

    // Block markers
    if (stream.match(/^@(svg|3d|fem|end|select|gef|img|iframe|ifcx)\b/)) {
      // For @img(), @iframe and @ifcx also consume the rest
      if (/^@(img|iframe|ifcx)$/.test(stream.current())) {
        stream.eatWhile(/[^\n]/);
      }
      return "meta";
    }

    // Plot directive `$Plot{ … }` or `$Map{ … }` / `$Sum{ … }`
    if (stream.match(/^\$(Plot|Map|Sum|Prod|Integral|Solve|Find)\b/)) {
      state.inPlot = true;
      return "meta";
    }
    if (state.inPlot && stream.eat("}")) {
      state.inPlot = false;
      return "meta";
    }

    // Numbers
    if (stream.match(/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/)) {
      return "number";
    }

    // Whitespace
    if (stream.eatSpace()) return null;

    // Identifiers — Unicode letters/digits/underscore (θ, α, π, …)
    if (stream.match(/^[\p{L}_][\p{L}\p{N}_]*/u)) {
      const word = stream.current();
      // Operator keywords `to` / `in` for unit conversion
      if (word === "to" || word === "in") return "operatorKeyword";
      // Constants
      if (word === "pi" || word === "e") return "atom";
      // Known unit identifier preceded by space + number? Just tint as unit class.
      if (UNIT_KEYWORDS.has(word)) return "unit";
      // Function call?  `foo(…`
      if (stream.peek() === "(") return "function";
      // Generic identifier
      return "variable";
    }

    // Operators
    if (stream.match(/^(=|<=|>=|<|>|==|!=|\+|-|\*|\/|\^)/)) return "operator";
    // Punctuation
    if (stream.match(/^[(){}\[\],;]/)) return "punctuation";

    // Fallback — advance one char
    stream.next();
    return null;
  },

  languageData: {
    commentTokens: { line: "//" },
  },
};

const ifcCalcStream = StreamLanguage.define(parser);

/**
 * Color palette anchored on the OpenAEC brand tokens.
 * Keep contrast WCAG-AA against the light editor background (#FAFAF9).
 */
const ifcCalcHighlight = HighlightStyle.define([
  { tag: t.heading, color: "#D97706", fontWeight: "700" },
  { tag: t.keyword, color: "#7C3AED", fontWeight: "600" }, // amethyst — directives stand out
  { tag: t.controlKeyword, color: "#7C3AED", fontWeight: "600" },
  { tag: t.operatorKeyword, color: "#7C3AED", fontStyle: "italic" }, // `to` / `in`
  { tag: t.meta, color: "#0891B2" }, // teal — @svg @select @gef $Plot
  { tag: t.string, color: "#16A34A", fontStyle: "italic" }, // green prose
  { tag: t.lineComment, color: "#94A3B8", fontStyle: "italic" }, // muted grey
  { tag: t.number, color: "#DC2626" }, // construction red (matches q-load arrows)
  { tag: t.atom, color: "#DC2626" }, // pi, e
  { tag: t.unit, color: "#92400E", fontStyle: "italic" }, // amber-dark
  { tag: t.variableName, color: "#1E40AF" }, // blueprint blue
  { tag: t.function(t.variableName), color: "#1E40AF", fontWeight: "600" },
  { tag: t.operator, color: "#525252" },
  { tag: t.punctuation, color: "#525252" },
]);

// ── Autocomplete (IntelliSense) ────────────────────────────────────────

/**
 * Statische aanvulling. `sleutel` is de omschrijving als i18n-sleutel
 * (rekentaal:editor.…); die wordt pas bij het tonen vertaald, zodat de taal
 * volgt wat de gebruiker op dat moment gekozen heeft.
 */
type Aanvulling = Completion & { sleutel?: string };

/** Static keyword/snippet completions — directives, functions, units. */
const STATIC_COMPLETIONS: Aanvulling[] = [
  // Directives
  { label: "#if", type: "keyword", sleutel: "voorwaarde", apply: "#if " },
  { label: "#else", type: "keyword", sleutel: "voorwaarde" },
  { label: "#else if", type: "keyword", sleutel: "voorwaarde", apply: "#else if " },
  { label: "#end if", type: "keyword", sleutel: "voorwaarde" },
  { label: "#hide", type: "keyword", sleutel: "zichtbaarheid" },
  { label: "#show", type: "keyword", sleutel: "zichtbaarheid" },
  { label: "#pre", type: "keyword", sleutel: "markering" },
  { label: "#post", type: "keyword", sleutel: "markering" },
  { label: "#repeat", type: "keyword", sleutel: "lus", apply: "#repeat " },
  { label: "#while", type: "keyword", sleutel: "lus", apply: "#while " },
  { label: "#loop", type: "keyword", sleutel: "lus" },
  { label: "#continue", type: "keyword", sleutel: "lus" },
  { label: "#end repeat", type: "keyword", sleutel: "lus" },
  { label: "#rad", type: "keyword", sleutel: "hoekeenheid" },
  { label: "#deg", type: "keyword", sleutel: "hoekeenheid" },

  // Blocks
  { label: "@svg", type: "namespace", sleutel: "tekenblok", apply: "@svg\n\n@end" },
  { label: "@3d", type: "namespace", sleutel: "drieDBlok", apply: "@3d\neenheid mm\ncamera iso\n\n@end" },
  {
    label: "@fem", type: "namespace", sleutel: "femBlok",
    apply: "@fem vloer\n  materiaal 33 GPa; 0.2\n  maas 0.5 m\n  plaat 0; 0; 10 m; 10 m; 250 mm\n  veren 0; 0; 3; 3; 5 m; 5 m; 200 MN/m; 400 mm\n  geval G\n    eigengewicht 25 kN/m^3\n  geval Q\n    vlaklast 5 kN/m^2\n  combinatie UGT = 1.2*G + 1.5*Q\n@end",
  },
  {
    label: "@kern", type: "namespace", sleutel: "kernBlok",
    apply: "@kern drie = solve_native_fem\n  inputs.kind = \"threeLayer\"\n  inputs.input.forces = {nx: 0, ny: 0, nxy: 0, mx: 50, my: 0, mxy: 0, vx: 0, vy: 0}\n  inputs.input.thicknessMm = 250 mm\n  inputs.input.topSkinMm = 80 mm\n  inputs.input.bottomSkinMm = 84 mm\n  inputs.input.topReinforcement = {asX: 524, asY: 524}\n  inputs.input.bottomReinforcement = {asX: 754, asY: 754}\n  inputs.input.fcdMpa = 20 N/mm^2\n  inputs.input.fydMpa = 435 N/mm^2\n  inputs.input.nuPrime = 0.88\n  inputs.input.compressionModel = \"ec2AnnexF\"\n@end",
  },
  { label: "@iframe", type: "namespace", sleutel: "iframeBlok", apply: "@iframe https:// hoogte=120mm" },
  { label: "@js", type: "namespace", sleutel: "jsBlok", apply: "@js hoogte=80mm titel=\"\"\n\n@end" },
  { label: "@select", type: "namespace", sleutel: "keuzelijst", apply: '@select var "label"\n  optie = 1\n@end' },
  { label: "@gef", type: "namespace", sleutel: "sondering", apply: "@gef sondering1" },
  { label: "@img", type: "namespace", sleutel: "afbeelding", apply: "@img(pad/naar.png)" },
  { label: "@end", type: "namespace", sleutel: "eindeBlok" },

  // Plot operators
  { label: "$Plot", type: "namespace", sleutel: "grafiek", apply: "$Plot{f(x) @ x = -10 : 10}" },
  { label: "$Map", type: "namespace", sleutel: "contour" },
  { label: "$Sum", type: "namespace", sleutel: "som", apply: "$Sum{f(n) @ n = 1 : N}" },
  { label: "$Prod", type: "namespace", sleutel: "product" },
  { label: "$Integral", type: "namespace", sleutel: "integraal" },

  // Math functions (mathjs); het tweede veld is de sleutel van de omschrijving.
  ...[
    ["sin", "goniometrie"], ["cos", "goniometrie"], ["tan", "goniometrie"],
    ["asin", "goniometrie"], ["acos", "goniometrie"], ["atan", "goniometrie"], ["atan2", "goniometrie"],
    ["sqrt", "wiskunde"], ["sqr", "wiskundeSqrt"], ["abs", "wiskunde"],
    ["log", "wiskundeNatuurlijk"], ["log10", "wiskunde"], ["lg", "wiskundeLog10"],
    ["exp", "wiskunde"], ["pow", "wiskunde"],
    ["floor", "wiskunde"], ["ceil", "wiskunde"], ["round", "wiskunde"],
    ["min", "wiskunde"], ["max", "wiskunde"], ["sign", "wiskunde"],
    ["if", "keuzefunctie"],
    ["det", "matrix"], ["inv", "matrix"], ["transpose", "matrix"],
  ].map(([label, sleutel]) => ({ label, type: "function" as const, sleutel, apply: `${label}(` })),

  // Constants (omschrijving zonder woorden; in elke taal gelijk)
  { label: "pi", type: "constant", detail: "π = 3.14159…" },
  { label: "e", type: "constant", detail: "Euler ≈ 2.71828" },

  // Unit-conversion operators
  { label: "to", type: "keyword", sleutel: "omrekenen", apply: "to " },
  { label: "in", type: "keyword", sleutel: "omrekenen", apply: "in " },

  // Common units
  ...["mm", "cm", "m", "km", "g", "kg", "ton", "N", "kN", "MN",
      "Pa", "kPa", "MPa", "GPa", "Nm", "kNm", "deg", "rad", "s"].map((u) => ({
    label: u, type: "type" as const, sleutel: "eenheid",
  })),
];

/** De omschrijving in de gekozen taal; aangeroepen bij elke aanvulling, nooit bij het laden. */
const omschrijving = (sleutel: string) => i18next.t(`editor.${sleutel}`, { ns: "rekentaal" });

function vertaald({ sleutel, ...c }: Aanvulling): Completion {
  return sleutel ? { ...c, detail: omschrijving(sleutel) } : c;
}

/**
 * Build completions by scanning the document for user-defined variables and
 * functions. Picks up assignments (`x = ...`), prompts (`F = ?kN`), and
 * function definitions (`f(x) = ...`).
 */
function dynamicCompletions(source: string): Completion[] {
  const out: Completion[] = [];
  const seen = new Set<string>();
  const lines = source.split("\n");

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("'") || line.startsWith("//") || line.startsWith("#") || line.startsWith("@") || line.startsWith("$") || line.startsWith('"')) continue;

    // Function def: f(x) = ... or g(a,b) = ...
    const fnMatch = line.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*\(([^)]+)\)\s*=/u);
    if (fnMatch && !seen.has(fnMatch[1])) {
      seen.add(fnMatch[1]);
      out.push({
        label: fnMatch[1],
        type: "function",
        detail: `(${fnMatch[2].split(",").map((s) => s.trim()).join(", ")})`,
        apply: `${fnMatch[1]}(`,
      });
      continue;
    }

    // Assignment / prompt: name = ... or name = ?
    const assignMatch = line.match(/^([\p{L}_][\p{L}\p{N}_]*)\s*=/u);
    if (assignMatch && !seen.has(assignMatch[1])) {
      seen.add(assignMatch[1]);
      const isPrompt = line.includes("= ?");
      out.push({
        label: assignMatch[1],
        type: "variable",
        detail: omschrijving(isPrompt ? "invoerveld" : "variabele"),
      });
    }
  }
  return out;
}

function rekentaalCompletionSource(ctx: CompletionContext): CompletionResult | null {
  // Allow identifier characters + leading #, @, $ for directive triggers
  const before = ctx.matchBefore(/[#@$]?[\p{L}_][\p{L}\p{N}_]*$/u) ??
                 ctx.matchBefore(/[#@$]$/);
  if (!before && !ctx.explicit) return null;
  const word = before;
  if (!word) return null;

  const source = ctx.state.doc.toString();
  const dynamic = dynamicCompletions(source);

  return {
    from: word.from,
    options: [...STATIC_COMPLETIONS.map(vertaald), ...dynamic],
    validFor: /^[#@$]?[\p{L}\p{N}_]*$/u,
  };
}

/** Composite extension consumed by `<CodeMirror extensions={[ifcCalcLang()]}/>`. */
export function ifcCalcLang(): Extension {
  return [
    ifcCalcStream,
    syntaxHighlighting(ifcCalcHighlight),
    foldService.of(ifcCalcFoldService),
    autocompletion({
      override: [rekentaalCompletionSource],
      activateOnTyping: true,
      defaultKeymap: true,
    }),
  ];
}
