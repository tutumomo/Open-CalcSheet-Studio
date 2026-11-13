/// <reference lib="webworker" />
/**
 * Rekent een blad door buiten de UI-thread: inlezen, doorrekenen en de
 * uitwerking opbouwen, plus wat het parametrische beeld nodig heeft.
 *
 * Een groot blad (de balklaag) kost meer dan een seconde. Op de UI-thread
 * bevroor het venster daarom bij elke toetsaanslag. Zie rekenen/doorrekening.ts
 * voor wie de verzoeken stuurt.
 */
import { setAngleMode, type AngleMode } from "@ifc-calc/core";
import { leesGetallen, leesResultaat, metRefNamen } from "../components/calc/bladLezen";
import { rekenUitwerking } from "../components/calc/canvasRekenen";
import { leesInvoer } from "../components/calc/invoer/velden";
import { bronVoorUitvoer } from "../templates/vertalingen";
import { toetsHashes, verzamelVerzoeken } from "./toetsCache";
import type { RekenVerzoek, RekenAntwoord } from "./doorrekening";
import { scopeMetVerwijzingen } from "./verwijzingen";

self.onmessage = (e: MessageEvent<RekenVerzoek>) => {
  const v = e.data;
  let antwoord: RekenAntwoord;
  try {
    setAngleMode(v.hoekmodus as AngleMode);
    // De uitvoer in de taal van de app; de getallen en het oordeel lezen hetzelfde.
    const uitvoer = bronVoorUitvoer(v.source, v.taal);
    const evalOpties = v.evalOpties ?? {};
    // De eigen eenheden van het project gelden al bij het lezen (ParseOptions.eenheden).
    const opties = {
      includes: new Map(v.includes),
      imageUrls: new Map(v.imageUrls),
      eenheden: (evalOpties.eigenEenheden ?? []).map((e) => e.naam),
    };
    // Waarden uit andere bladen (#1.R_paal): die bladen eerst doorrekenen (verwijzingen.ts).
    const scope = scopeMetVerwijzingen(v.source, v.waarden, v.scope, v.verwijzingen ?? [], opties, evalOpties);
    const { nodes, html, eenheden } = rekenUitwerking(uitvoer.bron, v.waarden, scope, opties, uitvoer.namen, evalOpties);
    antwoord = {
      sleutel: v.sleutel,
      html,
      eenheden,
      // De @toets-blokken zonder antwoord: de app stuurt ze naar FEM Studio (femToetsing.ts).
      verzoeken: verzamelVerzoeken(nodes),
      // Alle blokken, ook met antwoord: hun antwoorden worden bij het blad vastgelegd.
      toetsen: toetsHashes(nodes),
      // De invoervelden zoals de uitwerking ze nu toont, voor het invoerpaneel (invoer/velden.ts).
      invoer: leesInvoer(nodes, uitvoer.namen),
      uitkomst: {
        resultaat: leesResultaat(nodes, v.naam),
        getallen: metRefNamen(leesGetallen(nodes), v.source),
      },
    };
  } catch (err) {
    const msg = (err as Error).message;
    antwoord = {
      sleutel: v.sleutel,
      html: `<div class="ifc-calc"><p class="calc-text" style="color:#dc2626;">Render error: ${msg}</p></div>`,
      uitkomst: null,
    };
  }
  self.postMessage(antwoord);
};
