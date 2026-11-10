import type { ReactElement } from "react";

import BalklaagDesigner from "./BalklaagDesigner";
import DoorsnedeDesigner from "./DoorsnedeDesigner";
import LiggerDesigner from "./LiggerDesigner";
import TweepaalspoerDesigner from "./TweepaalspoerDesigner";
import TwDetentionBasinDesigner from "./TwDetentionBasinDesigner";
import TwRcBeamDesigner from "./TwRcBeamDesigner";
import TwRetainingWallDesigner from "./TwRetainingWallDesigner";
import TwSeismicLoadDesigner from "./TwSeismicLoadDesigner";
import TwWindLoadDesigner from "./TwWindLoadDesigner";
import { hoortBij } from "../../templates/vertalingen";

/**
 * Welk parametrisch beeld hoort bij een rekenblad.
 *
 * De koppeling loopt via een herkenningspunt in de tekst van het blad, niet via
 * het sjabloon-id: pas je de tekst van een exemplaar aan, dan blijft het beeld
 * meegaan zolang de kop erin staat, ook als die in de tab Code in het Engels is aangepast
 * (hoortBij in templates/vertalingen.ts).
 *
 * Stond eerder als keten in App.tsx. Nu op één plek, omdat de afdrukweergave
 * dezelfde keuze moet maken — voor elk blad in het project, niet alleen voor
 * het blad dat openstaat.
 */
const DESIGNERS: { marker: string; beeld: () => ReactElement }[] = [
  { marker: "Balklaag", beeld: () => <BalklaagDesigner /> },
  { marker: "Ligger van hout of staal", beeld: () => <LiggerDesigner /> },
  { marker: "Tweepaalspoer", beeld: () => <TweepaalspoerDesigner /> },
  { marker: "Spanningen in een doorsnede", beeld: () => <DoorsnedeDesigner /> },
  { marker: "鋼筋混凝土矩形梁設計與檢核", beeld: () => <TwRcBeamDesigner /> },
  { marker: "懸臂式擋土牆", beeld: () => <TwRetainingWallDesigner /> },
  { marker: "滯洪池", beeld: () => <TwDetentionBasinDesigner /> },
  { marker: "建築物靜力分析法地震力計算", beeld: () => <TwSeismicLoadDesigner /> },
  { marker: "建築物風速壓與各層風力", beeld: () => <TwWindLoadDesigner /> },
];

/** Het beeld dat bij deze bladtekst hoort, of null als er geen is. */
export function designerVoor(source: string): ReactElement | null {
  const treffer = DESIGNERS.find((d) => hoortBij(source, d.marker));
  return treffer ? treffer.beeld() : null;
}

/** Heeft dit blad een parametrisch beeld? */
export function heeftDesigner(source: string): boolean {
  return DESIGNERS.some((d) => hoortBij(source, d.marker));
}
