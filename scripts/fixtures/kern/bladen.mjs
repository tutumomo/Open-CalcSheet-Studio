/**
 * De bladen met een `@kern`-blok waarmee scripts/check-kern-blok.mjs rekent. De antwoorden
 * van de echte server van Open FEM Studio staan in antwoorden.json; scripts/proef-kern-blok.mjs
 * maakt ze opnieuw (`--bewaar`).
 *
 * Het drielagenmodel (`threeLayer`, `threeLayerBatch`) en de scheurwijdte (`crackWidth`)
 * van `solve_native_fem`: maten in mm en mm², momenten in kNm/m.
 */

/** Een plaat van 250 mm, de wapening op 42 mm (onder) en 40 mm (boven) uit het vlak. */
const PLAAT = `h = 250 mm
a_o = 42 mm
a_b = 40 mm
f_yd = 500 N/mm^2/1.15`;

/** De velden van het drielagenmodel die voor elk punt gelijk zijn, onder het pad `waar`. */
const doorsnede = (waar) => `  ${waar}.thicknessMm = h
  ${waar}.topSkinMm = 2*a_b
  ${waar}.bottomSkinMm = 2*a_o
  ${waar}.topReinforcement.asX = 524
  ${waar}.topReinforcement.asY = 524
  ${waar}.bottomReinforcement = {asX: 754, asY: 754}
  ${waar}.fcdMpa = 20 N/mm^2
  ${waar}.fydMpa = f_yd
  ${waar}.nuPrime = 0.88
  ${waar}.compressionModel = "ec2AnnexF"`;

/** Eén aanroep: zuiver m_x = 50 kNm/m. */
export const DRIE = `${PLAAT}
m_x = 50 kN
@kern drie = solve_native_fem
  inputs.kind = "threeLayer"
  // een moment per meter is in het blad een kracht: gedeeld door 1 kN het getal in kNm/m
  inputs.input.forces = {nx: 0, ny: 0, nxy: 0, mx: m_x/(1 kN), my: 0, mxy: 0, vx: 0, vy: 0}
${doorsnede("inputs.input")}
@end
z = drie.result.leverArmMm*mm
A_sx = drie.result.bottom.requiredAsXmm2PerM*mm^2
UC = drie.result.bottom.utilizationAsX
`;

/** De momenten van de reeks: per rij m_x, m_y en m_xy in kNm/m; de derde rij is leeg. */
const MOMENTEN = "M = [50; 0; 0 | 30; 20; 10 | 0; 0; 0 | -40; -40; 15]";

/** Een reeks: per rij van M een aanroep; een rij zonder moment wordt overgeslagen. */
export const REEKS = `${PLAAT}
${MOMENTEN}
@kern reeks = solve_native_fem
  per k = 1 : 4
  #if abs(take(k; 1; M)) + abs(take(k; 2; M)) + abs(take(k; 3; M)) > 0
  inputs.kind = "threeLayer"
  inputs.input.forces.nx = 0
  inputs.input.forces.ny = 0
  inputs.input.forces.nxy = 0
  inputs.input.forces.mx = take(k; 1; M)
  inputs.input.forces.my = take(k; 2; M)
  inputs.input.forces.mxy = take(k; 3; M)
  inputs.input.forces.vx = 0
  inputs.input.forces.vy = 0
${doorsnede("inputs.input")}
  #end if
@end
A_2x = take(2; reeks.result.bottom.requiredAsXmm2PerM)
A_4b = take(4; reeks.result.top.requiredAsXmm2PerM)
n = reeks.aantal
`;

/** Dezelfde punten in één aanroep: een lijst van objecten met #for en een index in het pad. */
export const BATCH = `${PLAAT}
${MOMENTEN}
@kern batch = solve_native_fem
  inputs.kind = "threeLayerBatch"
${doorsnede("inputs.input.configuration")}
  #for i = 1 : 4
  inputs.input.samples[i].id = string(i)
  inputs.input.samples[i].positionM = [i*500 mm; 0 m]
  inputs.input.samples[i].forces = {nx: 0, ny: 0, nxy: 0, mx: take(i; 1; M), my: take(i; 2; M), mxy: take(i; 3; M), vx: 0, vy: 0}
  #loop
@end
A_4b = take(4; batch.result.results.result.top.requiredAsXmm2PerM)
x_3 = take(3; 1; batch.result.results.positionM)
`;

/** De scheurwijdte (NEN-EN 1992-1-1 7.3.4) van een laag Ø12-150 bij σ_s = 300 N/mm². */
export const SCHEUR = `σ_s = 300 N/mm^2
h = 250 mm
d = 214 mm
x = 40 mm
A_s = 754 mm^2
c = 30 mm
ø = 12 mm
s = 150 mm
@kern scheur = solve_native_fem
  inputs.kind = "crackWidth"
  inputs.input.sigmaSMpa = σ_s
  inputs.input.widthMm = 1 m
  inputs.input.heightMm = h
  inputs.input.effectiveDepthMm = d
  inputs.input.neutralAxisMm = x
  inputs.input.bondedReinforcementAreaMm2 = A_s
  inputs.input.coverToLongitudinalSteelMm = c
  inputs.input.barOrTendonDiameterMm = ø
  inputs.input.spacingMm = s
  inputs.input.fCkMpa = 30
  inputs.input.fCtEffMpa = 2.9
  inputs.input.eCmMpa = 33 GPa
  inputs.input.kT = 0.4
  inputs.input.k1 = 0.8
  inputs.input.k2 = 0.5
  inputs.input.wMaxMm = 0.3 mm
@end
w_k = scheur.result.crackWidthMm*mm
UC_w = scheur.result.utilization
`;

/** Een invoer die de kern weigert: ν' groter dan 1. */
export const GEWEIGERD = DRIE.replace("nuPrime = 0.88", "nuPrime = 1.5");

export const BLADEN = { DRIE, REEKS, BATCH, SCHEUR };
