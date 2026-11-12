/// <reference lib="webworker" />
/**
 * Rekent varianten door buiten de UI-thread (docs/varianten.md). Los van de worker van
 * de werkruimte (rekenWorker.ts): die houdt alleen het laatste verzoek vast, en een tabel
 * met tien varianten stuurt er tien tegelijk. Eén variant per bericht, zodat de stand
 * meeloopt; de wachtrij staat in variantRekenen.ts.
 */
import { setAngleMode, type AngleMode } from "@ifc-calc/core";
import { rekenVariant } from "./varianten";
import type { VariantAntwoord, VariantVerzoek } from "./variantRekenen";

self.onmessage = (e: MessageEvent<VariantVerzoek>) => {
  const v = e.data;
  let antwoord: VariantAntwoord;
  try {
    setAngleMode(v.hoekmodus as AngleMode);
    const evalOpties = v.evalOpties ?? {};
    const parseOpties = {
      includes: new Map(v.includes),
      imageUrls: new Map(v.imageUrls),
      eenheden: (evalOpties.eigenEenheden ?? []).map((x) => x.naam),
    };
    // De antwoorden van FEM Studio zitten al in evalOpties (variantRekenen.ts): de worker
    // heeft geen eigen cache.
    const uitkomst = rekenVariant(v.source, v.waarden, v.scope, v.naam, {
      evalOpties,
      parseOpties,
      verwijzingen: v.verwijzingen,
    });
    antwoord = { sleutel: v.sleutel, uitkomst };
  } catch (err) {
    antwoord = { sleutel: v.sleutel, uitkomst: null, fout: (err as Error).message };
  }
  self.postMessage(antwoord);
};
