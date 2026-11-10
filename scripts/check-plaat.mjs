/**
 * Plaat op palen: het DKT-element en het palenmodel (packages/core/src/plaat.ts).
 *
 * Handberekening en literatuur:
 *   • Vrij opgelegde vierkante plaat a = 1, D = 1, q = 1, ν = 0,3 (Navier):
 *     w_midden = 0,004062·q·a⁴/D en m_x,midden = 0,04789·q·a².
 *     Met 24 × 24 vakken (DKT, diagonalen om en om) ligt de uitkomst binnen 0,5 %
 *     (doorbuiging) en 1 % (moment).
 *   • Evenwicht: de paalreacties samen zijn de belasting, q·oppervlak.
 *   • Symmetrie: een vierkant raster met volle belasting geeft m_x = m_y.
 *   • Een binnenveld van een vlakke plaat op starre puntsteunen (7 × 7 velden, ν = 0,2):
 *     doorbuiging in het veldmidden ongeveer 0,0057·q·a⁴/D en m_x daar ongeveer 0,032·q·a².
 *   • Statica van een binnenveld: veld- plus steunmoment over de volle breedte is
 *     ongeveer q·L·l_n²/8, met l_n de vrije overspanning tussen de paalkoppen.
 *
 * Draaien:  node scripts/check-plaat.mjs   (vereist een gebouwde core)
 */
import { parse, evaluate, evaluateMetScope } from "../packages/core/dist/index.js";
import { dktStijfheid, elementMoment, plaatOplossing, plaatSamenvatting } from "../packages/core/dist/plaat.js";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};
const rel = (a, b) => Math.abs(a - b) / Math.abs(b);

console.log("Het element: vrij opgelegde vierkante plaat (Navier)");
{
  const nu = 0.3, n = 24, h = 1 / n, N = (n + 1) * (n + 1), nd = 3 * N;
  const D = [[1, nu, 0], [nu, 1, 0], [0, 0, (1 - nu) / 2]];
  const K = Array.from({ length: nd }, () => new Float64Array(nd));
  const f = new Float64Array(nd);
  const nr = (i, j) => j * (n + 1) + i;
  const tris = [];
  for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const a = nr(i, j), b = nr(i + 1, j), c = nr(i + 1, j + 1), d = nr(i, j + 1);
    for (const tri of (i + j) % 2 === 0 ? [[a, b, c], [a, c, d]] : [[a, b, d], [b, c, d]]) {
      tris.push(tri);
      const x = tri.map((k) => (k % (n + 1)) * h), y = tri.map((k) => Math.floor(k / (n + 1)) * h);
      const Ke = dktStijfheid(x, y, D);
      const dof = tri.flatMap((k) => [3 * k, 3 * k + 1, 3 * k + 2]);
      for (let p = 0; p < 9; p++) for (let q = 0; q < 9; q++) K[dof[p]][dof[q]] += Ke[p][q];
      for (const k of tri) f[3 * k] += (h * h) / 6;
    }
  }
  for (let j = 0; j <= n; j++) for (let i = 0; i <= n; i++) if (i === 0 || j === 0 || i === n || j === n) K[3 * nr(i, j)][3 * nr(i, j)] += 1e12;
  const u = Float64Array.from(f);
  for (let p = 0; p < nd; p++) {
    const piv = K[p][p];
    for (let r = p + 1; r < nd; r++) {
      const fac = K[r][p] / piv;
      if (fac === 0) continue;
      for (let c = p; c < nd; c++) K[r][c] -= fac * K[p][c];
      u[r] -= fac * u[p];
    }
  }
  for (let p = nd - 1; p >= 0; p--) {
    let s = u[p];
    for (let c = p + 1; c < nd; c++) s -= K[p][c] * u[c];
    u[p] = s / K[p][p];
  }
  const m = nr(n / 2, n / 2);
  let mx = 0, aantal = 0;
  for (const tri of tris) {
    if (!tri.includes(m)) continue;
    const x = tri.map((k) => (k % (n + 1)) * h), y = tri.map((k) => Math.floor(k / (n + 1)) * h);
    mx += elementMoment(x, y, D, tri.flatMap((k) => [u[3 * k], u[3 * k + 1], u[3 * k + 2]]))[0];
    aantal++;
  }
  meld(rel(u[3 * m], 0.004062) < 0.005, `w_midden = ${u[3 * m].toFixed(6)} (Navier 0,004062)`);
  meld(rel(mx / aantal, 0.04789) < 0.01, `m_x,midden = ${(mx / aantal).toFixed(5)} (Navier 0,04789), trek onder positief`);
}

console.log("\nHet palenmodel");
{
  const nu = 0.2, E = 12 * (1 - nu * nu);
  const nb = 7, q = Array.from({ length: nb }, () => new Array(nb).fill(1));
  const u = plaatOplossing({ lx: 1, ly: 1, nbx: nb, nby: nb, t: 1, E, nu, k: 1e9, dKop: 0, nEl: 8, q });
  const somR = u.palen.reduce((s, p) => s + p.R, 0);
  meld(Math.abs(somR - 49) < 1e-6, `evenwicht: ΣR = ${somR.toFixed(6)} = q·oppervlak = 49`);
  const ic = 3 * 8 + 4;
  const k = u.knopen[ic * (u.nx + 1) + ic];
  meld(Math.abs(k.w - 0.0057) < 0.0003, `binnenveld: w_midden = ${k.w.toFixed(5)} (ongeveer 0,0057·q·a⁴/D)`);
  meld(Math.abs(k.mx - 0.032) < 0.003, `binnenveld: m_x,midden = ${k.mx.toFixed(4)} (ongeveer 0,032·q·a²)`);
  const s = plaatSamenvatting(u);
  meld(Math.abs(s[0] - s[1]) < 1e-9 && Math.abs(s[2] - s[3]) < 1e-9, "symmetrie: m_x = m_y bij een vierkant raster");
}

console.log("\nIn een blad: statica van een binnenveld");
{
  const blad = [
    "geo = [3.6 m; 3.6 m; 4; 4; 0.25 m; 32840 N/mm^2; 0.2; 150 MN/m; 400 mm; 8]",
    "q = 39.1",
    "last = [q; q; q; q | q; q; q; q | q; q; q; q | q; q; q; q]",
    "s = plaat_palen(geo; last)",
    "R = plaat_R(geo; last)",
    "w = plaat_w(geo; last; 7.2 m; 7.2 m)",
  ].join("\n");
  const uit = evaluate(parse(blad), {}, {});
  const fout = uit.find((n) => String(n.result ?? "").startsWith("Error"));
  meld(!fout, "plaat_palen, plaat_R en plaat_w rekenen door", fout && String(fout.result));
  const s = uit.find((n) => n.name === "s");
  const getallen = String(s?.result ?? "").replace(/[[\]]/g, "").split(";").map(Number);
  // veld (midden kolomstrook en middenstrook samen) plus steun over de volle breedte ≈ q·L·l_n²/8
  const M0 = (39.1 * 3.6 * (3.6 - 0.4) ** 2) / 8;
  meld(getallen.length === 9 && getallen.every(Number.isFinite), `samenvatting heeft 9 getallen: ${getallen.join(", ")}`);
  meld(getallen[4] > getallen[0] && getallen[2] > getallen[4], "steunmoment piek > kolomstrook > veld");
  const R = evaluateMetScope(parse(blad), {}, {}).scope.R.toArray();
  const totaalR = R.reduce((t, rij) => t + rij[4], 0);
  meld(Math.abs(totaalR - 39.1 * 14.4 * 14.4) < 0.5, `ΣR = ${totaalR.toFixed(1)} = q·oppervlak = ${(39.1 * 14.4 * 14.4).toFixed(1)}`);
  meld(M0 > 150 && M0 < 200, `M0 = q·L·l_n²/8 = ${M0.toFixed(0)} kNm (ter vergelijking met veld + steun)`);
}

console.log(fouten === 0 ? "\nDe plaat klopt." : `\n${fouten} fout(en).`);
process.exit(fouten === 0 ? 0 : 1);
