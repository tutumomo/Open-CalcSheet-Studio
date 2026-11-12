/**
 * De bladen met een `@fem`-blok die de controle (scripts/check-fem-model.mjs) en de
 * proef met de echte server (scripts/proef-fem-model.mjs) allebei rekenen. De
 * antwoorden van FEM Studio op deze bladen staan vastgelegd in deze map; verandert
 * een blad, dan maakt de proef ze opnieuw (`node scripts/proef-fem-model.mjs --bewaar`).
 */

/**
 * Vrij opgelegde vierkante plaat onder een gelijkmatige last: de oplossing van
 * Navier. De vier randen zijn lijnsteunen (alleen de verplaatsing loodrecht op de
 * plaat vast), de plaat rekent met MITC4-elementen van a/24.
 */
export const NAVIER = [
  "a = 6 m",
  "t = 150 mm",
  "E_c = 30 GPa",
  "ν = 0.2",
  "q = 10 kN/m^2",
  "@fem plaat",
  "  materiaal E_c; ν",
  "  maas a/24",
  "  plaat 0; 0; a; a; t",
  "  lijnsteun 0; 0; a; 0",
  "  lijnsteun a; 0; a; a",
  "  lijnsteun a; a; 0; a",
  "  lijnsteun 0; a; 0; 0",
  "  geval Q",
  "    vlaklast q",
  "@end",
  "w_m = fem_waarde(plaat; \"Q\"; \"w\"; a/2; a/2)",
  "m_m = fem_waarde(plaat; \"Q\"; \"mx\"; a/2; a/2)",
].join("\n");

/**
 * Dezelfde vlakke plaat op palen als `plaat_palen` (packages/core/src/plaat.ts):
 * 3 × 3 velden van 4 m, een paal op elk snijpunt, de rand vrij. De paalkop van 1 m
 * en de maas van 0,25 m geven in beide modellen dezelfde dertien knopen per paal.
 */
export const PALEN = [
  "L = 4 m",
  "t = 250 mm",
  "k = 150 MN/m",
  "d = 1 m",
  "q = 10 kN/m^2",
  "@fem palen",
  "  materiaal 30000 N/mm^2; 0.2",
  "  maas 0.25 m",
  "  plaat 0; 0; 3*L; 3*L; t",
  "  veren 0; 0; 4; 4; L; L; k; d",
  "  geval Q",
  "    vlaklast q",
  "@end",
].join("\n");
export const PALEN_GEO = "[4 m; 4 m; 3; 3; 0.25 m; 30000 N/mm^2; 0.2; 150 MN/m; 1 m; 8]";

/**
 * De eerste toepassing: een betonvloer op palen, 2 × 2 velden van 5 m, met een
 * ponskop boven elke paal en een versterkte strook tussen de palen over de
 * middelste paallijnen. De koppen liggen over de stroken en de stroken over de
 * vloer: de laatste plaat wint. Twee belastinggevallen en twee combinaties.
 */
export const VLOER = [
  "L = 5 m",
  "t = 250 mm",
  "b_k = 1 m",
  "t_k = 450 mm",
  "b_s = 1 m",
  "t_s = 350 mm",
  "k = 200 MN/m",
  "d = 400 mm",
  "@fem vloer",
  "  materiaal 33 GPa; 0.2",
  "  maas 0.5 m",
  "  plaat 0; 0; 2*L; 2*L; t",
  "  plaat 0; L - b_s/2; 2*L; b_s; t_s",
  "  plaat L - b_s/2; 0; b_s; 2*L; t_s",
  "  #for i = 0 : 2",
  "  #for j = 0 : 2",
  "  plaat max(i*L - b_k/2; 0 m); max(j*L - b_k/2; 0 m); min(i*L + b_k/2; 2*L) - max(i*L - b_k/2; 0 m); min(j*L + b_k/2; 2*L) - max(j*L - b_k/2; 0 m); t_k",
  "  #loop",
  "  #loop",
  "  veren 0; 0; 3; 3; L; L; k; d",
  "  geval G",
  "    eigengewicht 25 kN/m^3",
  "    vlaklast 1 kN/m^2",
  "  geval Q",
  "    vlaklast 5 kN/m^2; 0; 0; L; 2*L",
  "    puntlast 20 kN; 1.5*L; 1.5*L",
  "  combinatie UGT = 1.2*G + 1.5*Q",
  "  combinatie BGT = G + Q",
  "@end",
  "m_x = vloer.UGT.mx_max",
  "R_max = vloer.R_max",
  "w_BGT = vloer.BGT.w_max",
].join("\n");
