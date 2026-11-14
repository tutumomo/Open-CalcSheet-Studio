export { parse, type ParseOptions } from './parser.js';
export { evaluate, evaluateMetScope, extractScope, setAngleMode, zetProjectEenheden, projectEenheidFouten, type EvalOpties } from './evaluator.js';
export { geldigeEenheidNaam, naarSI, vasteEenheid, gebrokenExponent } from './eenheden.js';
export type { EenheidWaarde } from './eenheden.js';
export { verwijzingNaam, vervangVerwijzingen, leesVerwijzing, verwijzingenIn, verwijzingVanNaam, verwijzingenInMelding } from './verwijzing.js';
export { STELSELS, grootheidVan, decimalenNa, doelInStelsel, toonInvoer, invoerNaarBron, omrekenen, eenheidUitBeeld, eenheidInBeeld, type Grootheid, type Stelsel } from './eenheidstelsel.js';
export { rekenUitdrukking, uitkomstTekst } from './evaluator.js';
export { analyseerRekenblok, rekenRekenblok, rekenWaarde, type RekenblokAnalyse, type RekenblokUitkomst } from './rekenblok.js';
export type { SelectValues, AngleMode, Scope } from './evaluator.js';
export { render, defaultStyles, type RenderOpties } from './renderer.js';
export {
  TOETS_START_RE, leesToetsBlok, naarSchema, canoniek, toetsHash, leesAntwoord, bouwToets, renderToets,
  eenheidVanVeld, toetsToolToegestaan, TOETS_UITGESLOTEN, schemaHash, alsAntwoord, leesVastgelegdeToetsingen, type ToetsRekenaar,
} from './toetsBlok.js';
export { FEM_START_RE, FEM_TOOL, leesFemBlok, bouwFem, renderFem, femVerzoekArgumenten, type FemRekenaar } from './femBlok.js';
export { KERN_START_RE, leesKernBlok, bouwKern, renderKern, naarKernSchema, kernAanroepen, kernVerzoekBewaard, type KernRekenaar } from './kernBlok.js';
export {
  maakFemNet, femRekenmodel, femArgumenten, femBewaar, femParen, femSteunknopen, femSomLast, FEM_MAX_KNOPEN,
  type FemInvoer, type FemNet, type FemPlaat, type FemVeer, type FemLijn, type FemLast, type FemGeval,
} from './femNet.js';
export {
  FemModel, femWaarde, femStrook, femSvg, femModelSvg, femVlak3D, femKleurschaal, femGrootheid, FEM_GROOTHEDEN, FEM_EENHEID,
  type FemGrootheid, type FemSet,
} from './femResultaat.js';
export { exprToLatex, nameToLatex } from './latex.js';
export {
  drieDVlakken, drieDBeeldvlak, drieDGrenzen, drieDGrootte, drieDSvg, DRIE_D_KLEUREN, type DrieDVlak,
} from './drieD.js';
export { iframeAdres, IFRAME_MIN_MM, IFRAME_MAX_MM, IFRAME_STANDAARD_MM } from './iframeBlok.js';
export { jsHost, JS_BIBLIOTHEKEN } from './jsBlok.js';
export { leesIfcx, ifcxNaarScene, type IfcxElement, type IfcxGelezen } from './ifcxLezen.js';
export {
  balklaagIfcxDocument, balklaagIfcxKnopen, balklaagIfcxKnopenUitScope, balklaagInvoerUitScope, balklaagAantalBalken,
  ifcxBlokMesh, ifcxVoorBlad, BALKLAAG_IFCX_IMPORTS, BALKLAAG_IFCX_SCHEMAS, BALKLAAG_MAX_BALKEN,
  type BalklaagInvoer, type BalklaagDocumentOpties,
} from './balklaagIfcx.js';
export { parseGef, type GefData } from './gef-parser.js';
export {
  liggerOplossing, liggerReacties, liggerOmhullende, liggerOmhullendeReacties, liggerExtremen,
  liggerInterpoleer, liggerNulpunt, liggerStatus, liggerDelen, liggerVelden, liggerSvgPunten, liggerSamen,
  LIGGER_PUNT, LIGGER_LAST, LIGGER_STATUS,
} from './ligger.js';
export {
  raamwerkOplossing, raamwerkReacties, raamwerkVerplaatsingen, raamwerkStatus, raamwerkExtremen,
  raamwerkInterpoleer, raamwerkSvgPunten, raamwerkVormPunten, raamwerkKnik, raamwerkSamenvatting, raamwerkZakking,
  RAAMWERK_LAST, RAAMWERK_RICHTING, RAAMWERK_STATUS, RAAMWERK_GEEN_KNIK,
} from './raamwerk.js';
export {
  doorsnedeGrootheden, doorsnedeDeel, doorsnedePlastisch, doorsnedeStatisch, doorsnedeSvgPunten,
  DOORSNEDE_DEEL,
} from './doorsnede.js';
export {
  generateIfcx,
  generateIfc4x3Step,
  generateProjectIfcx,
  generateProjectIfc4x3Step,
  type ElementRef,
  type IfcCalcSheet,
  type IfcGenerationOptions,
  type IfcGenerationResult,
  type IfcxDocument,
  type GraafGegevens,
  type VariantenGegevens,
} from './ifc-generator.js';
export type {
  IfcxBestand,
  IfcxDataType,
  IfcxGrootheid,
  IfcxImport,
  IfcxKnoop,
  IfcxKop,
  IfcxSchema,
  IfcxWaarde,
} from './ifcx/typen.js';
export {
  bouwProjectIfcx,
  isIfcxBestand,
  isProjectIfcx,
  leesProjectIfcx,
  platteKnopen,
  type IfcxGelezenBlad,
  type IfcxGelezenProject,
  type IfcxProjectInvoer,
} from './ifcx/document.js';
export { bouwProjectStep, type StepOpties } from './ifcx/step.js';
export { ATTR as IFCX_ATTR, OCSS_SCHEMAS, ifcKlasse } from './ifcx/namespace.js';
export { ifcGuid, uuidUitIfcGuid, uuidVan } from './ifcx/identiteit.js';
export type {
  BladFiguur,
  BladOordeel,
  BladUitkomstGegevens,
  UitkomstInvoerveld,
  UitkomstStatus,
  UitkomstUnityCheck,
  UitkomstVariabele,
} from './ifcx/uitkomst.js';
export type * from './types.js';

import { parse, type ParseOptions } from './parser.js';
import { evaluate, type SelectValues, type Scope } from './evaluator.js';
import { render } from './renderer.js';

export interface ProcessOptions extends ParseOptions {
  /** Pre-bound scope variables (e.g. globals from a parent metadata sheet). */
  initialScope?: Scope;
}

/**
 * Process a calc document from source text to HTML output.
 * Convenience function that chains parse → evaluate → render.
 *
 * `options.includes` resolves `#include filename` directives at parse time —
 * the host (desktop, web) supplies a map of filename → contents.
 * `options.initialScope` seeds the evaluator with already-bound variables
 * (e.g. K_FI / windgebied uit projectgegevens) — used voor multi-sheet
 * projecten waar globals worden overgeërfd.
 */
export function process(
  source: string,
  selectValues?: SelectValues,
  options?: ProcessOptions,
  initialScope?: Scope,
): string {
  const ast = parse(source, options);
  const evaluated = evaluate(ast, selectValues, initialScope ?? options?.initialScope);
  return render(evaluated);
}
