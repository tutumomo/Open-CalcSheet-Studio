import { evaluateMetScope, parse, setAngleMode, type AngleMode, type EvalOpties } from "@ifc-calc/core";
import { scopeMetVerwijzingen, verwezenBladen } from "../../rekenen/verwijzingen";
import { heeftEenheden, leesEenheden } from "../../store/canvasBlad";
import { rekentaalIncludes, rekentaalImageUrls } from "../../templates/rekentaal-includes";
import { lengteWaarden } from "./projectModel3D";

export interface ModelInvoer {
  bladen: { id: string; ref?: string; source: string; waarden: Record<string, string> }[];
  scope: Record<string, unknown>;
  opties: EvalOpties;
  hoekmodus: AngleMode;
}

self.onmessage = ({ data }: MessageEvent<ModelInvoer>) => {
  setAngleMode(data.hoekmodus);
  const lezen = { includes: rekentaalIncludes, imageUrls: rekentaalImageUrls, eenheden: data.opties.eigenEenheden?.map(e => e.naam) };
  const uit: Record<string, Record<string, number>> = {};
  for (const blad of data.bladen) {
    try {
      const refs = verwezenBladen(blad.source, blad.waarden, data.bladen);
      const basis = scopeMetVerwijzingen(blad.source, blad.waarden, data.scope, refs, lezen, data.opties);
      const ast = heeftEenheden(blad.source)
        ? leesEenheden(blad.source).flatMap(e => parse(e.tekst, lezen))
        : parse(blad.source, lezen);
      uit[blad.id] = lengteWaarden(evaluateMetScope(ast, blad.waarden, basis, data.opties).scope);
    } catch { uit[blad.id] = {}; }
  }
  self.postMessage(uit);
};
