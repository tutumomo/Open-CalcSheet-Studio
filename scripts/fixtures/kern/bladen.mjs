/**
 * De bladen met een `@kern`-blok waarmee scripts/check-kern-blok.mjs rekent. De antwoorden
 * van de echte server van Open FEM Studio staan in antwoorden.json; scripts/proef-kern-blok.mjs
 * maakt ze opnieuw (`--bewaar`).
 *
 * Het drielagenmodel (`threeLayer`, `threeLayerBatch`) en de scheurwijdte (`crackWidth`)
 * van `solve_native_fem`: maten in mm en mm², momenten in kNm/m.
 */

import { twRcColumn } from "../../../packages/desktop/src/templates/tw-rc-column.ts";
import { twRcSlab } from "../../../packages/desktop/src/templates/tw-rc-slab.ts";

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

/**
 * De Taiwanse plaat (tw-rc-slab) met dezelfde doorsnede als bij Open FEM Studio:
 * het blad met de rc112-formule (A_s_rc112) naast de kern van Open FEM Studio
 * (drielagenmodel, bijlage F). De vergelijking staat in scripts/check-kern-blok.mjs.
 *
 * De krachten zijn momenten per meter plaat (kNm/m); in het blad is M_u een moment
 * (kN·m), dus M_u/(1 kN*m) is het getal dat de kern wil.
 */
export const TW_PLAAT = `${twRcSlab}
z_rc112 = d_eff - a_blk/2
A_s_rc112 = M_u*1000000/(0.9*f_y*z_rc112)
@kern tw_plaat = solve_native_fem
  inputs.kind = "threeLayer"
  inputs.input.forces = {nx: 0, ny: 0, nxy: 0, mx: M_u, my: 0, mxy: 0, vx: 0, vy: 0}
  inputs.input.thicknessMm = h
  inputs.input.bottomSkinMm = 2*(cover + db_m/2)
  inputs.input.topSkinMm = 2*(cover + db_t/2)
  inputs.input.bottomReinforcement.asX = A_s
  inputs.input.bottomReinforcement.asY = A_s
  inputs.input.topReinforcement.asX = A_st
  inputs.input.topReinforcement.asY = A_st
  inputs.input.fcdMpa = 0.85*f_c
  inputs.input.fydMpa = 0.9*f_y
  inputs.input.nuPrime = 0.2
  inputs.input.compressionModel = "ec2AnnexF"
@end
A_s_fem = tw_plaat.result.bottom.requiredAsXmm2PerM
`;

/**
 * De Taiwanse kolom (tw-rc-column) met dezelfde doorsnede als bij Open FEM Studio:
 * 500 x 500 mm, 8 D25 (3 onder, 3 boven, 1 per zijkant), beugel D10-150, dekking 40 mm.
 * De materialen zijn gelijkgetrokken: f'c = 30 MPa is C30/37 (f_ck = 30) en f_y = 500 MPa
 * is B500B (f_yk = 500). Het blad rekent de rc112-driehoek (phiMn_cap bij P_u), de kern
 * de kolomtoets van EN 1992-1-1 paragraaf 5.8 (m_rdz_knm bij dezelfde N_Ed).
 *
 * Eén aanroep: bij N_Ed = 0 rekent de kern de kolomtoets niet (geen normaaldruk), dus de
 * vergelijking gaat over de ontwerpwaarde bij P_u = 1800 kN.
 */
const KOLOM = twRcColumn
  .replace("f_c = ?{28}*(MPa)", "f_c = ?{30}*(MPa)")
  .replace("f_y = ?{420}*(MPa)", "f_y = ?{500}*(MPa)")
  .replace("M_1 = ?{80}*(kN*m)", "M_1 = ?{0}*(kN*m)")
  .replace("M_2 = ?{120}*(kN*m)", "M_2 = ?{0}*(kN*m)")
  .replace("V_u = ?{150}*(kN)", "V_u = ?{0}*(kN)");

const KOLOM_KERN = `
@kern tw_kolom = concrete_column_check
  beam_id = 1
  bijlage = "NL"
  concrete_class = "C30/37"
  reinforcement_grade = "B500B"
  design_situation = "PersistentTransient"
  steel_branch = "Horizontal"
  tweede_orde_in_krachten = "Geen"
  length_m = l_u
  section.shape = "Rectangle"
  section.b_mm = b
  section.h_mm = h
  cage.cover_mm = c_c
  cage.stirrup_diameter_mm = d_tie
  cage.stirrup_legs = n_legs
  cage.stirrup_spacing_mm = s_tie
  cage.bottom.count = n_face
  cage.bottom.diameter_mm = d_b
  cage.top.count = n_face
  cage.top.diameter_mm = d_b
  cage.sides.count = n_side
  cage.sides.diameter_mm = d_b
  column.bracing = "Geschoord"
  column.buckling_length.soort = "Opgegeven"
  column.buckling_length.l0_m = l_u
  column.bracing_z = "Geschoord"
  column.buckling_length_z.soort = "Opgegeven"
  column.buckling_length_z.l0_m = l_u
  forces_envelope[1].combination_id = 1
  forces_envelope[1].position_mm = 0
  forces_envelope[1].forces = {mt_ed: 0, my_ed: 0, mz_ed: 0, n_ed: -P_u/(1 kN), vy_ed: 0, vz_ed: 0}
@end
M_rd_ec2 = tw_kolom.m_rdz_knm

`;

export const TW_KOLOM = KOLOM + KOLOM_KERN;

export const BLADEN = { DRIE, REEKS, BATCH, SCHEUR, TW_PLAAT, TW_KOLOM };
