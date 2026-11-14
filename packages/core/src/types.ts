/**
 * Node types of the calculation language.
 *
 * Visibility model: each renderable node may carry `hidden: true` (set by parser
 * inside #hide…#show ranges). Hidden assignments still execute (variable binds
 * to scope) but the renderer skips them. Follows the language's `#hide`/`#show`
 * directives.
 */

export interface HeadingNode {
  type: 'heading';
  level: number;
  text: string;
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface TextNode {
  type: 'text';
  text: string;
  /** True when text came from a prose line (`'...`) — content is passed
   *  through as HTML without escaping. False (default) for derived/safe text. */
  html?: boolean;
  /** Optional template parts for prose interpolation. When present,
   *  the renderer should concat literal segments with evaluated expressions.
   *  Example: `'<svg viewbox="'-xx' '-yy'" ...>` becomes
   *    [{lit:'<svg viewbox="'}, {expr:'-xx'}, {lit:' '}, {expr:'-yy'}, {lit:'" ...>'}] */
  parts?: Array<{ kind: 'literal'; value: string } | { kind: 'expr'; value: string; formaat?: string }>;
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
  /** Toelichting die op dezelfde bronregel achter een rekendeel stond; de
   *  renderer zet hem naast de formule in plaats van eronder. */
  inline?: boolean;
}

export interface AssignmentNode {
  type: 'assignment';
  name: string;
  expression: string;
  raw: string;
  /**
   * Toekenning aan één element van een vector of matrix (`v.(i) = …`,
   * `A.(i; j) = …`): de index, in mathjs-notatie (`i, j`), 1-gebaseerd.
   */
  index?: string;
  /** Opmaak van de uitkomst achter de expressie, `:F2` (zie evaluator: formatGetal). */
  formaat?: string;
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * Cascading conditional with `#else if`.
 * `branches[0]` is the primary `#if`; subsequent are `#else if`.
 * `elseBody` is the final `#else` (or empty).
 */
export interface ConditionalNode {
  type: 'conditional';
  branches: { condition: string; body: AstNode[] }[];
  elseBody: AstNode[];
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
  /** Backwards-compat shims (renderer/legacy code may still reference these). */
  condition?: string;
  ifBody?: AstNode[];
}

/**
 * `?` input prompt — `F = ? kN` prompts user for a numeric value.
 * Interactive: renderer emits an <input>, value flows back via SelectValues.
 * Een standaardwaarde staat tussen accolades achter het vraagteken, zoals in
 * Met standaardwaarde: `L = ?{5000}mm`, `F = ? {3} kN`.
 */
export interface InputPromptNode {
  type: 'input-prompt';
  name: string;
  label: string;
  /** De standaardwaarde (`?{5000}`), anders "0". */
  defaultValue: string;
  unit: string;
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * User-defined function: `f(x) = x^2 + 1` or `g(a, b) = sqrt(a^2 + b^2)`.
 * Evaluator passes the full assignment string verbatim to mathjs which supports
 * function definitions natively (`f = (x) -> x^2 + 1`).
 */
export interface UserFunctionNode {
  type: 'user-function';
  name: string;
  params: string[];
  expression: string;
  raw: string;
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * Read-only variable display — `x` alone on a line renders the current value.
 * Useful for referencing earlier-computed quantities in narrative flow.
 */
export interface VarDisplayNode {
  type: 'var-display';
  name: string;
  /** Omrekenen naar deze eenheid: `x|kN*m` of `x to kN*m` op een eigen regel. */
  omrekening?: string;
  /** Opmaak van de uitkomst, `x:F2`. */
  formaat?: string;
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * `#repeat n … #end repeat` loop. The body is evaluated `count` times;
 * scope is shared across iterations so values accumulate (e.g. running totals).
 *
 * Iteration index is bound to the variable `_i` (1-based) within the body.
 */
export interface RepeatNode {
  type: 'repeat';
  /** Expressie voor het aantal rondes; leeg = tot een #break (met een bovengrens). */
  count: string;
  /** `#while`: herhaal zolang deze voorwaarde waar is (count wordt dan genegeerd). */
  conditie?: string;
  /**
   * Begrensde lus (`#while cond max=N`, `#iterate x tol=… max=…`): bovengrens van
   * het aantal rondes. Is hij bereikt zonder dat de lus klaar is, dan geeft de lus
   * een tekstregel met `iteratie.code = 'NOT_CONVERGED'`.
   */
  max?: string;
  /** `#iterate x tol=…`: klaar zodra |x_k − x_(k−1)| ≤ tol. */
  tol?: string;
  /** `#iterate x`: de naam waarvan het verschil tussen twee rondes het residu is. */
  volg?: string;
  body: AstNode[];
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * `$Plot{curve1 & curve2 @ var = lo : hi}` inline 2D plot.
 * Each curve is either `yExpr` (implicit x) or `xExpr|yExpr` (parametric).
 * The parameter (variable name + range) is shared across all curves.
 *
 * Evaluator samples each curve at `samples` points and renders as inline SVG.
 */
export interface PlotNode {
  type: 'plot';
  curves: { xExpr?: string; yExpr: string }[];
  param: string;        // variable name, e.g. "x" or "θ"
  lo: string;           // expression for lower bound
  hi: string;           // expression for upper bound
  samples?: number;     // default 100
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface EvaluatedPlot {
  type: 'plot';
  svg: string;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface SvgNode {
  type: 'svg';
  content: string;
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * Eén regel uit een `@3d`-blok, ingelezen maar nog niet doorgerekend (zie
 * drieD.ts). `regel` is het regelnummer binnen het blok (1 = de eerste regel
 * na `@3d`), voor een melding.
 *   element   `balk 0 0 0 {{L}} 0 0 {{b}} {{h}} hout`: het sleutelwoord, de
 *             maten nog als tekst (`300`, `2.5m`, `{{…}}`, al genormaliseerd),
 *             de kleur als `#rrggbb`, een optie (`rol`) en een tekst
 *   for       `#for i = 1 : n` … `#loop`
 *   if        `#if …` / `#else if …` / `#else` / `#end if`
 */
export type DrieDRegel =
  | {
    soort: 'element'; regel: number; naam: string; maten: string[]; kleur?: string; optie?: string; tekst?: string;
    /** Bij `fem`: het model, de uitkomst en de grootheid (`fem vloer UGT w`). */
    woorden?: string[];
  }
  | { soort: 'for'; regel: number; teller: string; van: string; tot: string; body: DrieDRegel[] }
  | { soort: 'if'; regel: number; takken: { voorwaarde: string; body: DrieDRegel[] }[]; anders: DrieDRegel[] };

/** De instellingen van een `@3d`-blok, zoals ze er staan (zie drieD.ts). */
export interface DrieDInstellingen {
  eenheid?: 'mm' | 'cm' | 'm';
  camera?: 'iso' | 'voor' | 'boven' | 'zij';
  raster?: boolean;
  assen?: boolean;
  /** De hoogte van het beeld in px, als deel (een getal of `{{…}}`). */
  hoogte?: string;
}

/** Een `@3d … @end`-blok: een ruimtelijk beeld met waarden uit het blad. */
export interface DrieDNode {
  type: '3d';
  regels: DrieDRegel[];
  instellingen: DrieDInstellingen;
  /** Meldingen van het inlezen: een onbekend element, te weinig maten. */
  fouten: string[];
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * Een `@iframe`-regel: een externe pagina (zie iframeBlok.ts). Het adres, de
 * hoogte en de titel nog als tekst, met `{{…}}` al genormaliseerd.
 */
export interface IframeNode {
  type: 'iframe';
  url: string;
  hoogte?: string;
  titel?: string;
  /** De pagina mag scripts uitvoeren, afgeschermd. */
  scripts: boolean;
  /** Meldingen van het inlezen: geen adres, een onbekende optie. */
  fouten: string[];
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/** Een `@ifcx`-regel: het 3D-beeld van een module, uit een IFCX-document (zie ifcxBlok.ts). */
export interface IfcxBlokNode {
  type: 'ifcx';
  /** De generator: `balklaag`. */
  bron: string;
  hoogte?: string;
  papier?: string;
  /** De taal van de namen in het document (`nl`, `en`); standaard Nederlands. */
  taal?: string;
  fouten: string[];
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * Een `@js … @end`-blok (zie jsBlok.ts). De code letterlijk; hoogte, titel en
 * netwerk nog als tekst, met `{{…}}` al genormaliseerd.
 */
export interface JsBlokNode {
  type: 'js';
  code: string;
  hoogte?: string;
  titel?: string;
  bibliotheken: string[];
  netwerk: string[];
  fouten: string[];
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface ImageNode {
  type: 'image';
  src: string;
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface SelectOption {
  text: string;
  value: string;
}

export interface SelectNode {
  type: 'select';
  name: string;
  label: string;
  options: SelectOption[];
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface GefUploadNode {
  type: 'gef-upload';
  name: string;  // variable prefix, e.g. "sondering1"
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * Een rekentaal-opdracht die vanaf die regel geldt, voor de rest van het blad
 * (of tot een andere opdracht van dezelfde soort):
 *   `#deg`, `#rad`, `#gra`   hoekeenheid van sin, cos, … (daarna weer de app-stand)
 *   `#equ`, `#val`, `#noc`   formule en uitkomst / alleen de uitkomst / alleen de formule
 *   `#varsub`, `#nosub`, `#novar`   met invulling / zonder invulling / alleen de invulling
 *   `#round n`               uitkomsten op n decimalen (`#round default`: de app-opmaak)
 * Ze worden uitgevoerd tijdens het rekenen, in de volgorde van het blad, ook
 * binnen een #if-tak of lus en ook als ze verborgen staan.
 */
export interface OpdrachtNode {
  type: 'opdracht';
  opdracht: 'deg' | 'rad' | 'gra' | 'equ' | 'val' | 'noc' | 'varsub' | 'nosub' | 'novar' | 'round';
  /** Bij `#round`: het aantal decimalen; null = de opmaak van de app. */
  decimalen?: number | null;
  hidden?: boolean;
}

/**
 * `.naam = uitdrukking`: een eigen eenheid, zoals in het `.cpd`-formaat. De
 * uitdrukking is 1 (een nieuwe basiseenheid, `.EUR = 1`) of een waarde met
 * eenheid (`.kipf = 1000 lbf`). De eenheid geldt vanaf deze regel tot het
 * einde van het blad.
 */
export interface EenheidDefNode {
  type: 'eenheid-def';
  name: string;
  expression: string;
  hidden?: boolean;
}

/** `#break` — early exit from the enclosing #repeat / #for loop. */
export interface BreakNode {
  type: 'break';
  /** `#continue`: alleen de rest van deze ronde overslaan. */
  doorgaan?: boolean;
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * Een `@toets naam = tool … @end`-blok: een normtoets door Open FEM Studio (zie
 * toetsBlok.ts). Elke regel is `veld = uitdrukking`.
 */
export interface ToetsNode {
  type: 'toets';
  /** De naam van de uitkomst: `kolom` geeft `kolom_uc_max`, `kolom_voldoet`, … */
  naam: string;
  /** De tool van FEM Studio, zoals `check_steel_beam`. */
  tool: string;
  velden: { veld: string; expr: string; regel: number }[];
  fouten: string[];
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * Een regel van een `@fem`-blok (femBlok.ts): een opdracht met zijn argumenten als
 * uitdrukkingen, of een `#for` of `#if` met regels erin.
 */
export type FemRegel =
  | {
    soort: 'opdracht';
    regel: number;
    /** `materiaal`, `maas`, `analyse`, `plaat`, `veer`, `veren`, `lijnsteun`, `geval`, `vlaklast`, `eigengewicht`, `puntlast` of `combinatie`. */
    woord: string;
    /** De argumenten, gescheiden door `;`, als uitdrukkingen. */
    args: string[];
    /** De naam van een plaat, geval of combinatie, of het woord na `analyse`. */
    naam?: string;
  }
  | { soort: 'for'; regel: number; teller: string; van: string; tot: string; body: FemRegel[] }
  | { soort: 'if'; regel: number; takken: { voorwaarde: string; body: FemRegel[] }[]; anders: FemRegel[] };

/**
 * Een `@fem naam … @end`-blok: een plaatmodel dat Open FEM Studio doorrekent
 * (`solve_open_fem_3d`), zie femBlok.ts.
 */
export interface FemNode {
  type: 'fem';
  /** De naam van het model: `vloer` geeft `vloer_UGT_mx_max`, `vloer_R_max`, … */
  naam: string;
  regels: FemRegel[];
  fouten: string[];
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/** Een deel van een pad in een `@kern`-blok: `samples[k]` is de naam `samples` met de index `k` (vanaf 1). */
export interface KernPadDeel {
  naam: string;
  /** De uitdrukking tussen de rechte haken, als het veld een lijst is. */
  index?: string;
}

/**
 * Een regel van een `@kern`-blok (kernBlok.ts): een veld met zijn pad en uitdrukking, of
 * een `#for` of `#if` met regels erin.
 */
export type KernRegel =
  | { soort: 'veld'; regel: number; pad: KernPadDeel[]; expr: string }
  | { soort: 'for'; regel: number; teller: string; van: string; tot: string; body: KernRegel[] }
  | { soort: 'if'; regel: number; takken: { voorwaarde: string; body: KernRegel[] }[]; anders: KernRegel[] };

/**
 * Een `@kern naam = tool … @end`-blok: een rekentool van Open FEM Studio met geneste
 * invoer, waarvan de uitkomst als getallen terugkomt (zie kernBlok.ts). Elke regel is
 * `pad.naar.veld = uitdrukking`.
 */
export interface KernNode {
  type: 'kern';
  /** De naam van de uitkomst: `drie` geeft `drie_result_…`. */
  naam: string;
  /** De tool van FEM Studio, zoals `solve_native_fem`. */
  tool: string;
  /** `per k = 1 : n`: een reeks aanroepen, één per waarde van de teller. */
  per?: { teller: string; van: string; tot: string; regel: number };
  regels: KernRegel[];
  fouten: string[];
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export type AstNode =
  | HeadingNode
  | TextNode
  | AssignmentNode
  | ConditionalNode
  | InputPromptNode
  | UserFunctionNode
  | VarDisplayNode
  | RepeatNode
  | PlotNode
  | SvgNode
  | DrieDNode
  | IframeNode
  | IfcxBlokNode
  | JsBlokNode
  | BreakNode
  | ImageNode
  | SelectNode
  | GefUploadNode
  | OpdrachtNode
  | EenheidDefNode
  | ToetsNode
  | FemNode
  | KernNode;

export interface EvaluatedHeading {
  type: 'heading';
  level: number;
  text: string;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface EvaluatedText {
  type: 'text';
  text: string;
  html?: boolean;
  /** Zie TextNode.inline. */
  inline?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
  /** Een begrensde lus die niet klaar kwam (RepeatNode.max). */
  iteratie?: LusNietKlaar;
}

/** Wat een begrensde lus meldt als hij zijn bovengrens haalt zonder klaar te zijn. */
export interface LusNietKlaar {
  code: 'NOT_CONVERGED';
  /** Aantal gedraaide rondes (= max). */
  rondes: number;
  max: number;
  /** `#while`: de voorwaarde die nog waar was. */
  voorwaarde?: string;
  /** `#iterate`: de gevolgde naam, de tolerantie en het laatste residu (als getal, SI). */
  naam?: string;
  tol?: number;
  residu?: number | null;
}

/**
 * Een vector of matrix als uitkomst, voor de matrixopmaak in de uitwerking.
 * Elk element is opgemaakt zoals een gewone uitkomst ("0.5 m", "12"); een
 * grote matrix is ingekort, met "…" op de plaats van wat wegviel.
 */
export interface MatrixUitkomst {
  /** De getoonde elementen per rij. Een vector heeft één rij. */
  rijen: string[][];
  /** Een vector (één index) en geen matrix; de rekentaal toont hem liggend. */
  vector: boolean;
  /**
   * De eenheid die alle elementen delen; die staat dan één keer achter de
   * haak en de elementen staan zonder eenheid. Leeg als ze verschillen.
   */
  eenheid: string;
  /** Afmetingen van de hele matrix (vector: 1 × lengte). */
  m: number;
  n: number;
}

/**
 * Een uitkomst in de eenheid van het eenhedenstelsel (eenheidstelsel.ts). Alleen
 * voor de weergave: `result`, `unit`, `waarde` en `getoond` blijven in de eenheid
 * van het blad, want daar rekenen de beelden en de controles mee. Ontbreekt als het
 * stelsel de waarde laat zoals hij is.
 */
export interface InStelsel {
  result: string;
  unit: string;
  getoond?: string;
  matrix?: MatrixUitkomst;
}

export interface EvaluatedAssignment {
  type: 'assignment';
  name: string;
  expression: string;
  substitution: string;
  result: string;
  /**
   * De uitkomst als getal in de getoonde eenheid, onafgerond. `result` is op
   * vier cijfers afgerond; wie met de uitkomst verder rekent (een beeld dat
   * een lijn tekent) neemt deze. Ontbreekt bij een uitkomst die geen getal is.
   */
  waarde?: number;
  unit: string;
  /** De uitkomst is een vector of matrix; `result` is dan een tekstvorm. */
  matrix?: MatrixUitkomst;
  /**
   * De uitkomst zoals hij in beeld komt, als een opmaak (`:F2`, `#round n`)
   * hem anders toont dan `result`. `result` houdt de standaardopmaak: wie de
   * uitkomst leest (de UC in de projectboom) leest het getal, niet de weergave.
   */
  getoond?: string;
  /** Zie InStelsel. */
  inStelsel?: InStelsel;
  /**
   * Wat de regel toont (`#val`, `#noc`, `#nosub`, `#novar`); zonder
   * dit veld: formule, invulling en uitkomst (`#equ` met `#varsub`).
   */
  weergave?: 'val' | 'noc' | 'nosub' | 'novar';
  hidden?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface EvaluatedInputPrompt {
  type: 'input-prompt';
  name: string;
  label: string;
  unit: string;
  /** Wat in het veld staat: de invoer van de gebruiker, of de standaardwaarde. */
  currentValue: string;
  /** De standaardwaarde van het veld (`?{5000}`, anders "0"); placeholder van een leeg veld. */
  standaard?: string;
  /**
   * De eenheid waarin het veld zijn waarde toont, als het eenhedenstelsel hem omrekent;
   * `currentValue` en `standaard` staan dan in die eenheid. Opgeslagen wordt in `unit`.
   */
  toonEenheid?: string;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface EvaluatedUserFunction {
  type: 'user-function';
  name: string;
  params: string[];
  expression: string;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/** Renders as `name = <value>` — same chrome as a regular assignment with no substitution. */
export interface EvaluatedVarDisplay {
  type: 'var-display';
  name: string;
  result: string;
  /** Zie EvaluatedAssignment.waarde. */
  waarde?: number;
  unit: string;
  /** Zie EvaluatedAssignment.matrix. */
  matrix?: MatrixUitkomst;
  /** Zie EvaluatedAssignment.getoond. */
  getoond?: string;
  /** Zie InStelsel. */
  inStelsel?: InStelsel;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface EvaluatedConditionalBranch {
  type: 'conditional-branch';
  children: EvaluatedNode[];
}

export interface EvaluatedSvg {
  type: 'svg';
  content: string;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface EvaluatedImage {
  type: 'image';
  src: string;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/** Een punt in de scène: x, y, z in de eenheid van de scène (z omhoog). */
export type Punt3D = [number, number, number];

/**
 * Eén element van een doorgerekende scène, met ingevulde maten en een kleur
 * als `#rrggbb`. `kolom` en `plaat` uit het blok zijn hier een `balk` en een
 * `doos`, een `lijnlast` is een rij `pijl`en met een `staaf` erover.
 */
export type DrieDElement =
  | { soort: 'balk'; van: Punt3D; naar: Punt3D; b: number; h: number; kleur: string }
  | { soort: 'ibalk'; van: Punt3D; naar: Punt3D; b: number; h: number; tw: number; tf: number; kleur: string }
  | { soort: 'buis'; van: Punt3D; naar: Punt3D; d: number; kleur: string }
  | { soort: 'doos'; hoek: Punt3D; maat: Punt3D; kleur: string }
  | { soort: 'staaf'; van: Punt3D; naar: Punt3D; kleur: string }
  | { soort: 'knoop'; plek: Punt3D; r: number; kleur: string }
  | { soort: 'tekst'; plek: Punt3D; tekst: string; kleur: string }
  | { soort: 'pijl'; van: Punt3D; naar: Punt3D; kleur: string }
  | { soort: 'oplegging'; plek: Punt3D; type: 'scharnier' | 'rol' | 'inklemming'; grootte: number; kleur: string }
  /**
   * Een lichaam met vrije vlakken, gelezen uit een IFCX-document (ifcxLezen.ts);
   * kan niet in een `@3d`-blok staan. `pad` is het pad van het element in het
   * document, `opaciteit` 1 is dekkend.
   */
  | { soort: 'vlakken'; vlakken: { punten: Punt3D[]; rand: boolean }[]; kleur: string; opaciteit?: number; pad?: string }
  /**
   * Een gekleurd net van vierhoeken, zoals het momentvlak of de doorbuiging van een
   * `@fem`-model (`fem vloer UGT w` in een `@3d`-blok): de punten, per vlak vier
   * puntnummers en per vlak een kleur.
   */
  | { soort: 'net'; punten: Punt3D[]; vlakken: [number, number, number, number][]; kleuren: string[]; kleur: string };

/**
 * Een doorgerekende `@3d`-scène. Dit staat als JSON in `data-scene` van het
 * `.calc-3d`-element; de app tekent er een draaibaar beeld van.
 */
export interface DrieDScene {
  eenheid: 'mm' | 'cm' | 'm';
  camera: 'iso' | 'voor' | 'boven' | 'zij';
  raster: boolean;
  assen: boolean;
  /** Hoogte van het beeld in px. */
  hoogte: number;
  elementen: DrieDElement[];
}

export interface EvaluatedDrieD {
  type: '3d';
  scene: DrieDScene;
  /** Wat niet te tekenen was, per regel van het blok; staat boven het beeld. */
  meldingen: string[];
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/** Een doorgerekende `@iframe`-regel. `url` is null als het adres is geweigerd. */
export interface EvaluatedIframe {
  type: 'iframe';
  url: string | null;
  hoogteMm: number;
  scripts: boolean;
  titel?: string;
  meldingen: string[];
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/** Een doorgerekende `@ifcx`-regel. `document` is null als er niets te maken viel. */
export interface EvaluatedIfcxBlok {
  type: 'ifcx';
  document: import('./ifcx/typen.js').IfcxBestand | null;
  /** Hoogte van het beeld op het scherm in px. */
  hoogte: number;
  /** Ook op de uitdraai. */
  papier: boolean;
  meldingen: string[];
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/**
 * Een waarde uit het blad voor een script: `w` is de waarde zoals het blad hem
 * toont, `e` de eenheid, `s` de waarde in SI en `d` de dimensie (die van mathjs:
 * massa, lengte, tijd, stroom, temperatuur, lichtsterkte, stofhoeveelheid, hoek, bit).
 */
export interface JsWaarde {
  w: number | string | boolean | unknown[];
  e?: string;
  s?: number;
  d?: number[];
}

/** Een doorgerekend `@js`-blok: de code en de waarden van het blad op die plek. */
export interface EvaluatedJsBlok {
  type: 'js';
  code: string;
  hoogteMm: number;
  titel?: string;
  bibliotheken: string[];
  netwerk: string[];
  waarden: Record<string, JsWaarde>;
  meldingen: string[];
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface EvaluatedSelect {
  type: 'select';
  name: string;
  label: string;
  options: SelectOption[];
  selectedValue: string;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export interface EvaluatedGefUpload {
  type: 'gef-upload';
  name: string;
  data: null;  // data comes from runtime upload
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/** Een eigen eenheid in beeld; `result` is de definitie ("1000 lbf") of een fout ("Error: …"). */
export interface EvaluatedEenheidDef {
  type: 'eenheid-def';
  name: string;
  expression: string;
  result: string;
}

/**
 * Het antwoord van FEM Studio op een verzoek, of waarom het er niet is.
 *
 * Bij een antwoord: `versie` en `schema` zijn de herkomst (de versie van de server en
 * de hash van het schema van de tool), `datum` is wanneer het antwoord kwam.
 * `waarschuwing`: opnieuw toetsen lukte niet; dit is het vorige antwoord.
 */
export type ToetsAntwoord =
  | {
    ok: true; uitkomst: unknown; versie?: string; schema?: string; datum?: string; waarschuwing?: string;
    /** Bij een `@fem`-blok: het bewaarde verzoek (het raster waar het antwoord bij hoort). */
    verzoek?: FemRekenmodel;
  }
  | { ok: false; melding: string };

/** Waarmee een antwoord is gemaakt. */
export interface ToetsHerkomst {
  /** De versie van de server (`serverInfo.version`). */
  versie?: string;
  /** De sha256 van het programma van de server. */
  sha256?: string;
  /** De hash van het schema van de tool uit `tools/list` (toetsBlok.ts, schemaHash). */
  schema?: string;
}

/**
 * Een antwoord zoals het bij een blad in het projectbestand staat, op de hash van de
 * invoer: wat er naar FEM Studio ging, wat er terugkwam, wanneer en waarmee.
 */
export interface VastgelegdeToets {
  tool: string;
  /** De argumenten zoals ze verzonden zijn, na de omrekening naar het schema. */
  verzoek: Record<string, unknown>;
  /** Het antwoord van de tool, zoals het kwam. */
  uitkomst: unknown;
  /** ISO 8601. */
  datum: string;
  herkomst: ToetsHerkomst;
}

/** Wat de app naar FEM Studio stuurt (`tools/call`), met de hash van de invoer op het blad. */
export interface ToetsVerzoek {
  hash: string;
  tool: string;
  argumenten: Record<string, unknown>;
  /**
   * Bij een `@fem`-blok: het rekenmodel van één belastinggeval. De app maakt er de
   * argumenten van (femArgumenten) en bewaart het met het antwoord compact (femBewaar);
   * `argumenten` is dan leeg.
   */
  bewaar?: FemRekenmodel;
  /**
   * Bij een `@kern`-blok met `per`: de argumenten van elke aanroep, in volgorde; null is
   * een aanroep die het blad overslaat. De app roept de tool voor elk ervan aan
   * (kernAanroepen) en bewaart de antwoorden samen onder deze ene hash; `argumenten` is
   * dan leeg.
   */
  reeks?: (Record<string, unknown> | null)[];
}

/**
 * Het rekenmodel van één belastinggeval van een `@fem`-blok, compact (femNet.ts). Hieruit
 * volgt de JSON voor `solve_open_fem_3d` (femArgumenten), en het wordt zo bij het blad
 * vastgelegd: het raster hoort bij het antwoord, ook als CalcSheet later anders meshte.
 * Knopen en elementen tellen vanaf 0; in de JSON vanaf 1.
 */
export interface FemRekenmodel {
  vorm: 'fem-plaat/1';
  /** Het belastinggeval. */
  geval: string;
  /** Elasticiteitsmodulus (MPa) en dwarscontractie. */
  E: number;
  nu: number;
  /** De knopen (m), alle op z = 0. */
  x: number[];
  y: number[];
  /** Per element vier knopen, tegen de klok in. */
  el: number[];
  /** Per element de plaat uit het blok die daar ligt (de laatste wint); in de JSON plaat pl + 1. */
  pl: number[];
  /** Per plaat uit het blok de dikte (m). */
  t: number[];
  /** Per veer de knopen van de kop met hun deel van de veer (kN/m); de middelste eerst. */
  veren: [number, number][][];
  /** Per lijnsteun de knopen met hun veer (kN/m), of null als de knoop vast is. */
  lijnen: [number, number | null][][];
  /** In het vlak vast: de eerste knoop in x en y, de tweede in y (geen mechanisme). */
  inVlak: [number, number];
  /** Per plaat de vlaklast in dit geval (kN/m², omlaag positief): op de hele vloer en het eigen gewicht. */
  q: number[];
  /** Knooplasten in dit geval (kN, omlaag positief): puntlasten en vlaklasten op een rechthoek. */
  F: [number, number][];
}

/** Het antwoord van FEM Studio op één geval, compact bewaard (femNet.ts, femBewaar). */
export interface FemUitkomstCompact {
  vorm: 'fem-plaat/1';
  /** Per knoop de verplaatsing in Z (m, omhoog positief). */
  uz: number[];
  /**
   * Per paar van knoop en plaat (femParen) vijf getallen: m_xx, m_yy, m_xy (kNm/m) en
   * v_x, v_y (kN/m), zoals FEM Studio ze per plaat op de knoop geeft.
   */
  m: number[];
  /** Per knoop met een verticale steun (femSteunknopen) de reactie in Z (kN). */
  R: number[];
  /** De belasting (uit het model) en de reacties samen (kN, omlaag en omhoog positief). */
  som: { last: number; reactie: number };
  /** Het evenwicht volgens FEM Studio. */
  evenwicht: { ok: boolean; max: number };
}

/** Eén toets uit het antwoord. */
export interface ToetsRij {
  id: string;
  artikel: string;
  titel: string;
  /** null: niet van toepassing of geen getal. */
  uc: number | null;
  /** `Ok`, `NotOk` of `NotApplicable` (niet van toepassing). */
  status: string;
  formule?: string;
  variabelen?: { symbol?: string; value?: unknown; unit?: string }[];
  notities?: string[];
}

/** Een gelezen antwoord (toetsBlok.ts, leesAntwoord). */
export interface ToetsUitkomst {
  uc_max: number | null;
  /** Van het geheel: `NotApplicable` is hier "niet volledig getoetst". */
  status: string;
  voldoet: boolean;
  /** Het id van de maatgevende toets, bij één staaf. */
  maatgevend?: string;
  toetsen: ToetsRij[];
  /** Bij een lijst of een model: per staaf of plaat. */
  staven?: { id: string; uc_max: number | null; status: string; maatgevend?: string }[];
  /** FEM Studio gaf geen toetsresultaat, of een fout in het resultaat zelf. */
  fout?: string;
}

/** Een doorgerekend `@toets`-blok. */
export interface EvaluatedToets {
  type: 'toets';
  naam: string;
  tool: string;
  /** `wacht`: het verzoek is nog onderweg; `niet-getoetst`: er is geen antwoord en hier wordt niet gevraagd. */
  status: 'wacht' | 'klaar' | 'fout' | 'niet-getoetst';
  hash?: string;
  melding?: string;
  uitkomst?: ToetsUitkomst;
  /** De versie van FEM Studio waarmee getoetst is. */
  versie?: string;
  /** Wanneer getoetst is (ISO 8601). */
  datum?: string;
  /**
   * Alleen in de modus `vragen`: het antwoord is gemaakt met een andere versie van
   * FEM Studio (`versie`: die van nu) of met een ander schema van de tool.
   */
  verouderd?: { versie?: string; schema?: boolean };
  /** Opnieuw toetsen lukte niet; het blok toont het vorige antwoord. */
  waarschuwing?: string;
  /** Alleen in de modus `vragen`: de knop "opnieuw toetsen" staat erbij. */
  opnieuw?: boolean;
  /** Alleen in de modus `vragen`, zolang er geen antwoord is. */
  verzoek?: ToetsVerzoek;
  /** `nl` of `en`: de vaste woorden. */
  taal: string;
  /** Achter `#hide`: rekent mee, staat niet op het blad. */
  verborgen?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/** De uitersten van één belastinggeval of combinatie van een `@fem`-blok. */
export interface FemUitersten {
  naam: string;
  soort: 'geval' | 'combinatie';
  /** Momenten (kNm/m), positief bij trek onder. */
  mxMax: number; mxMin: number; myMax: number; myMin: number; mxyMax: number; mxyMin: number;
  /** Doorbuiging (mm), omlaag positief. */
  wMax: number; wMin: number;
  /** De grootste en kleinste veerreactie (kN, omhoog positief); null zonder veren. */
  RMax: number | null; RMin: number | null;
}

/** Een doorgerekend `@fem`-blok. */
export interface EvaluatedFem {
  type: 'fem';
  naam: string;
  /** `nl` of `en`: de vaste woorden. */
  taal: string;
  /**
   * `klaar`: alle gevallen zijn gerekend; `wacht`: de verzoeken zijn onderweg (werkruimte);
   * `niet-gerekend`: er is geen antwoord en hier wordt niet gevraagd; `fout`: in het model
   * of van FEM Studio, met de reden in `melding`.
   */
  status: 'wacht' | 'klaar' | 'fout' | 'niet-gerekend';
  melding?: string;
  /** Het model in het kort, zodra het raster er is. */
  model?: {
    knopen: number; elementen: number; maas: number; veren: number; lijnen: number;
    /** De dikten (m) die in het raster voorkomen. */
    dikten: number[];
  };
  /** Een plattegrond van het model: platen naar dikte, veren en lijnsteunen (SVG). */
  modelSvg?: string;
  /** Per belastinggeval: de hash, de belasting en de reacties samen (kN). */
  gevallen: { naam: string; hash?: string; somLast?: number; somR?: number }[];
  /** Per geval en combinatie de uitersten, als alles gerekend is. */
  uitersten?: FemUitersten[];
  /** De plattegronden in kleur van de regels `beeld UGT mx` (SVG). */
  beelden?: string[];
  /** De hashes van alle gevallen. */
  hashes?: string[];
  /** Alleen in de modus `vragen`: de gevallen die nog geen antwoord hebben. */
  verzoeken?: ToetsVerzoek[];
  /** De versie van FEM Studio waarmee gerekend is, en wanneer. */
  versie?: string;
  datum?: string;
  /** Zie EvaluatedToets.verouderd. */
  verouderd?: { versie?: string; schema?: boolean };
  /** Opnieuw rekenen lukte niet; het blok toont het vorige antwoord. */
  waarschuwing?: string;
  /** Alleen in de modus `vragen`: de knop "opnieuw rekenen" staat erbij. */
  opnieuw?: boolean;
  /** Achter `#hide`: rekent mee, staat niet op het blad. */
  verborgen?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

/** Een doorgerekend `@kern`-blok. */
export interface EvaluatedKern {
  type: 'kern';
  naam: string;
  tool: string;
  /**
   * `klaar`: het antwoord is er en de uitkomsten staan in de scope; `wacht`: het verzoek
   * is onderweg (werkruimte); `niet-gerekend`: er is geen antwoord en hier wordt niet
   * gevraagd; `fout`: in het blok of van FEM Studio, met de reden in `melding`. Alleen
   * bij `klaar` bestaan de uitkomsten.
   */
  status: 'wacht' | 'klaar' | 'fout' | 'niet-gerekend';
  hash?: string;
  melding?: string;
  /** Het aantal aanroepen (bij `per` de lengte van de reeks), en hoeveel daarvan overgeslagen zijn. */
  aanroepen?: number;
  overgeslagen?: number;
  /** De argumenten van de eerste aanroep, als JSON, voor de toelichting op het scherm. */
  invoer?: string;
  /** De uitkomsten na het blok: de naam in de rekentaal en de waarde als tekst (de eerste zestig). */
  uitkomsten?: { naam: string; waarde: string }[];
  /** Hoeveel uitkomsten er in totaal zijn. */
  aantalUitkomsten?: number;
  /** De versie van FEM Studio waarmee gerekend is, en wanneer. */
  versie?: string;
  datum?: string;
  /** Zie EvaluatedToets.verouderd. */
  verouderd?: { versie?: string; schema?: boolean };
  /** Opnieuw rekenen lukte niet; het blok toont het vorige antwoord. */
  waarschuwing?: string;
  /** Alleen in de modus `vragen`: de knop "opnieuw rekenen" staat erbij. */
  opnieuw?: boolean;
  /** Alleen in de modus `vragen`, zolang er geen antwoord is. */
  verzoek?: ToetsVerzoek;
  /** `nl` of `en`: de vaste woorden. */
  taal: string;
  /** Achter `#hide`: rekent mee, staat niet op het blad. */
  verborgen?: boolean;
  /** Alleen op het scherm, niet op papier (`#pre`). */
  scherm?: boolean;
}

export type EvaluatedNode =
  | EvaluatedEenheidDef
  | EvaluatedHeading
  | EvaluatedText
  | EvaluatedAssignment
  | EvaluatedInputPrompt
  | EvaluatedUserFunction
  | EvaluatedVarDisplay
  | EvaluatedConditionalBranch
  | EvaluatedPlot
  | EvaluatedSvg
  | EvaluatedDrieD
  | EvaluatedIframe
  | EvaluatedIfcxBlok
  | EvaluatedJsBlok
  | EvaluatedImage
  | EvaluatedSelect
  | EvaluatedGefUpload
  | EvaluatedToets
  | EvaluatedFem
  | EvaluatedKern;
