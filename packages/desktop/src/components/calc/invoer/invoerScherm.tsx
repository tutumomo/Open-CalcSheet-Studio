import type { ReactElement } from "react";
import InvoerPaneel from "./InvoerPaneel";
import VloerOpPalenBeeld from "./VloerOpPalenBeeld";
import { opentMetInvoer, schermSoort } from "./velden";

/**
 * Het invoerscherm van een rekenblad zonder eigen parametrisch beeld.
 *
 * Een blad met een beeld uit designerKeuze.tsx houdt dat beeld; de werkruimte vraagt dit
 * alleen voor de rest. Elk ander rekenblad met invoer krijgt het formulier uit zijn eigen
 * velden (InvoerPaneel.tsx). Een module kan daarboven een beeld krijgen dat de invoer
 * volgt. Zo'n beeld hangt aan het `templateId` van het blad en niet aan een
 * herkenningstekst: het is het id van de module in de modulebibliotheek
 * (store/moduleBibliotheek.ts), en dat blijft bij het blad, ook in een projectbestand op
 * een computer waar de module niet is geïnstalleerd. Welk blad wat krijgt, staat in
 * `schermSoort` (velden.ts), zodat scripts/check-invoerpaneel.mjs het kan nalopen.
 *
 * `opent` zegt of het blad met dit scherm opent: een module wel, een eigen rekenblad en de
 * demo van de rekentaal openen met de code en hebben het scherm als tab erbij
 * (`opentMetInvoer`). Een blad met een beeld opent er altijd mee.
 *
 * Alleen in de werkruimte: op papier en in de uitwerking van een variant staat het
 * formulier niet (PrintBlad.tsx vraagt designerKeuze, niet dit).
 */
export function invoerSchermVoor(ex: { templateId?: string; source: string }): { scherm: ReactElement; metBeeld: boolean; opent: boolean } | null {
  const soort = schermSoort(ex, false);
  if (soort === "vloer-op-palen") return { scherm: <InvoerPaneel Beeld={VloerOpPalenBeeld} />, metBeeld: true, opent: true };
  if (soort === "paneel") return { scherm: <InvoerPaneel />, metBeeld: false, opent: opentMetInvoer(ex) };
  return null;
}
