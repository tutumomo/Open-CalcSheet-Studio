import assert from "node:assert/strict";
import { evaluateMetScope, parse } from "../packages/core/dist/index.js";
import { lengteWaarden, modelDeel, standaardKoppeling } from "../packages/desktop/src/components/calc/projectModel3D.ts";
import { bouwProjectBestand, leesProjectBestand } from "../packages/desktop/src/store/projectBestand.ts";

const scope = evaluateMetScope(parse("L_th = 5050 mm\nL_veld2 = 3 m\nb_belast = 60 cm\nb_vloer = 5 m\nF = 2 kN")).scope;
const maten = lengteWaarden(scope);
assert.equal(maten.F, undefined);
const keuze = { ...standaardKoppeling("balklaag"), x: 2, y: 3, hoek: 90, zijde: "links" };
const blad = { id: "a", templateId: "balklaag", naam: "Balk A", maten, keuze };
const deel = modelDeel(blad);
assert.deepEqual(deel.velden, [5.05, 3]);
assert.ok(Math.abs(deel.oppervlak - 4.83) < 1e-9);
assert.equal(deel.vloer, 5);
const vlak = deel.elementen.find(e => e.soort === "vlakken").vlakken[0].punten;
assert.deepEqual(vlak[0], [2, 3, 0]);
assert.ok(Math.abs(vlak[2][0] - 1.4) < 1e-9);
assert.ok(Math.abs(vlak[2][1] - 8.05) < 1e-9);
const tweeZijden = modelDeel({ ...blad, maten: { ...maten, rechts: 1.2 }, keuze: {
  ...keuze, zijde: "beide", strookRechts: "rechts",
} });
assert.ok(Math.abs(tweeZijden.oppervlak - 8.05 * 1.8) < 1e-9);
assert.equal(tweeZijden.elementen.filter(e => e.soort === "vlakken").length, 4);
assert.equal(modelDeel({ ...blad, maten: {} }), null);
const gegevens = { _projectmodel3d: JSON.stringify({ a: { ...keuze, zichtbaar: false } }) };
const raw = bouwProjectBestand({ gegevens, naam: "Proef", exemplaren: [{ ...blad, source: "L = 1 m", waarden: {} }] }, null);
assert.deepEqual(leesProjectBestand(raw, "proef").gegevens._projectmodel3d, gegevens._projectmodel3d);
console.log("Modelmaten, vloerstroken, plaatsing en bestandsuitwisseling gecontroleerd.");
