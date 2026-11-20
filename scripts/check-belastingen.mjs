/**
 * De belastingen uit hoofdstuk 5 van het rapport als bron voor de rekenbladen
 * (rapport/belastingBronnen.ts): elk blok uit 5.5 en elke klasse uit 5.4 heeft een
 * symbool, en onder dat symbool bestaat zijn waarde in elk blad. Verder de plek van de
 * blokken op het canvas (components/rapport/paneel/blokPlekken.ts) en de belastingen als
 * eigen objecten in het IFCX-document.
 *
 * Draaien:  node scripts/check-belastingen.mjs
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 */
import {
  belastingBronnen, belastingProject, belastingenVoorIfc, gebruikteSymbolen, geldigSymbool, klasseQk, metSymbolen, opbouwSom,
} from "../packages/desktop/src/rapport/belastingBronnen.ts";
import { normaliseerRapport, standaardRapport } from "../packages/desktop/src/rapport/model.ts";
import { projectTekstVan, PROJECTBLAD } from "../packages/desktop/src/store/projectBlad.ts";
import { evalOptiesVan } from "../packages/desktop/src/store/projectEenheden.ts";
import { legeGegevens, projectScope } from "../packages/desktop/src/store/projectGegevens.ts";
import { schrijfEenheden } from "../packages/desktop/src/store/canvasBlad.ts";
import { rekenUitwerking } from "../packages/desktop/src/components/calc/canvasRekenen.ts";
import { BLOK_B, TUSSEN, plekken } from "../packages/desktop/src/components/rapport/paneel/blokPlekken.ts";
import { projectIfcx } from "../packages/desktop/src/store/projectIfcx.ts";

let fouten = 0;
const meld = (ok, wat, detail = "") => {
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};
const bij = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol;
const tekst = (html) => html.replace(/<annotation[\s\S]*?<\/annotation>/g, " ").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");

const vloer = { soort: "vlak", naam: "1e-3e verdieping", lagen: [{ naam: "breedplaat 270", d: "0,27", rho: "25,0", p: "" }, { naam: "afwerkvloer", d: "0,07", rho: "20,0", p: "" }] };
const dak = { soort: "vlak", naam: "Plat dak", lagen: [{ naam: "kanaalplaat 200", d: "", rho: "", p: "3,03" }, { naam: "isolatie", d: "", rho: "", p: "0,15" }] };
const gevel = { soort: "gevel", naam: "Gevel", lagen: [{ naam: "mw", p: "2,00", h: "3,00", vulling: "70%" }, { naam: "kozijn", p: "0,75", h: "3,00", vulling: "30%" }] };
const wand = { soort: "vlak", naam: "Kalkzandsteen 250", lagen: [{ naam: "kzst", d: "0,25", rho: "18", p: "" }] };
const kaal = {
  wind: { gebouwhoogte: "", cscd: "1", coefficienten: [] },
  klassen: [
    { categorie: "A-vloer", lichteScheidingswanden: "0,80", dakhelling: "", qlast: "" },
    { categorie: "H-dak", lichteScheidingswanden: "", dakhelling: "0", qlast: "2,0" },
    { categorie: "H-dak", lichteScheidingswanden: "", dakhelling: "", qlast: "" },
  ],
  vloerenDaken: [vloer, dak],
  wanden: [gevel, wand],
};

console.log("Symbolen");
const b = metSymbolen(kaal);
meld(b.vloerenDaken.map((o) => o.symbool).join() === "g_v1,g_v2" && b.wanden.map((o) => o.symbool).join() === "g_w1,g_w2" && b.klassen.map((k) => k.symbool).join() === "q_k1,q_k2,q_k3",
  "elk blok en elke klasse krijgt een symbool: g_v…, g_w…, q_k…", JSON.stringify([b.vloerenDaken.map((o) => o.symbool), b.wanden.map((o) => o.symbool), b.klassen.map((k) => k.symbool)]));
meld(metSymbolen(b) === b, "wie er al een heeft: hetzelfde object terug");
const zonderEerste = metSymbolen({ ...b, vloerenDaken: [b.vloerenDaken[1], { ...vloer, naam: "Nieuw" }] });
meld(zonderEerste.vloerenDaken[0].symbool === "g_v2" && zonderEerste.vloerenDaken[1].symbool === "g_v1",
  "een blok houdt zijn symbool als er een ander tussenuit gaat; een nieuw blok krijgt het eerste vrije", zonderEerste.vloerenDaken.map((o) => o.symbool).join());
meld(geldigSymbool("g_v1") && geldigSymbool("Gvloer") && geldigSymbool("q_dak") && !geldigSymbool("g") && !geldigSymbool("1g") && !geldigSymbool("g v") && !geldigSymbool("K_FI") && !geldigSymbool("g_v_1") && !geldigSymbool(""),
  "geldige symbolen: een letter vooraan, minstens twee tekens, één deel achter het streepje, geen projectnaam");
const ongeldig = metSymbolen({ ...kaal, vloerenDaken: [{ ...vloer, symbool: "9x" }] });
meld(ongeldig.vloerenDaken[0].symbool === "g_v1", "een ongeldig symbool uit een bestand wordt vervangen", ongeldig.vloerenDaken[0].symbool);

console.log("\nWaarden");
meld(bij(opbouwSom(vloer), 0.27 * 25 + 0.07 * 20), "vlakopbouw: Σ d·ρ = 8,15 kN/m²", String(opbouwSom(vloer)));
meld(bij(opbouwSom(dak), 3.18), "vlakopbouw met ingevulde p: 3,18 kN/m²", String(opbouwSom(dak)));
meld(bij(opbouwSom(gevel), 2 * 3 * 0.7 + 0.75 * 3 * 0.3), "gevelopbouw: Σ p·h·vulling = 4,875 kN/m", String(opbouwSom(gevel)));
meld(bij(klasseQk(kaal.klassen[0]), 1.75 + 0.8), "klasse A-vloer met lichte scheidingswanden: 2,55 kN/m²", String(klasseQk(kaal.klassen[0])));
meld(bij(klasseQk(kaal.klassen[1]), 1.0), "klasse H-dak bij 0°: 1,0 kN/m²", String(klasseQk(kaal.klassen[1])));
meld(Number.isNaN(klasseQk(kaal.klassen[2])), "een dak zonder helling heeft nog geen waarde");

console.log("\nBronnen voor de bladen");
const { bronnen, dubbel } = belastingBronnen(b, "nl");
meld(bronnen.length === 7 && dubbel.length === 0, "zeven bronnen, geen dubbele", String(bronnen.length));
const bron = (s) => bronnen.find((x) => x.symbool === s);
meld(bron("g_v1")?.soort === "G" && bron("g_v1")?.eenheid === "kN/m^2" && bron("g_w1")?.eenheid === "kN/m" && bron("q_k1")?.soort === "Q",
  "blijvend in kN/m² of kN/m (gevel), veranderlijk in kN/m²");
meld(bron("g_v1")?.naam === "1e-3e verdieping" && /woon/i.test(bron("q_k1")?.naam ?? ""), "de naam uit hoofdstuk 5; een klasse heet naar haar categorie", bron("q_k1")?.naam);
meld(/residential/i.test(belastingBronnen(b, "en").bronnen.find((x) => x.symbool === "q_k1")?.naam ?? ""), "de naam van een klasse in de taal van het rapport");
const tweeKeer = belastingBronnen({ ...b, wanden: [b.wanden[0], { ...b.wanden[1], symbool: "g_v1" }] });
meld(tweeKeer.dubbel.length === 1 && tweeKeer.dubbel[0].groep === "wanden" && tweeKeer.bronnen.filter((x) => x.symbool === "g_v1").length === 1,
  "een symbool dat er twee keer staat: de eerste telt, de tweede wordt gemeld");

console.log("\nProjecttekst");
const p = belastingProject(b, "nl");
meld(p.bron.split("\n").length === 6 && p.bron.includes("g_v1 = 8.15 kN/m^2") && p.bron.includes("g_w1 = 4.88 kN/m") && p.bron.includes("q_k1 = 2.55 kN/m^2"),
  "de waarden als rekentekst, met een punt en op twee decimalen zoals in hoofdstuk 5 (4,875 wordt 4,88)", p.bron);
meld(!p.bron.includes("q_k3"), "een bron zonder waarde staat er niet in: geen stille 0");
meld(p.namen.g_v1 === "1e-3e verdieping" && p.namen.g_w2 === "Kalkzandsteen 250", "de namen bij de symbolen");
meld(projectTekstVan(legeGegevens(), undefined) === undefined, "geen belastingen en geen eigen elementen: geen projecttekst");
const eigen = { ...legeGegevens(), [PROJECTBLAD]: schrijfEenheden([{ id: "e1", x: 0, y: 0, tekst: "g_tot = g_v1 + g_v2" }]) };
const pt = projectTekstVan(eigen, b, "nl");
meld(pt.bron.indexOf("g_v1 = ") < pt.bron.indexOf("g_tot"), "eerst de belastingen, dan de eigen elementen van de projectgegevens");
meld(evalOptiesVan(eigen).project === undefined, "evalOptiesVan geeft de projecttekst niet zelf mee: die komt apart");

console.log("\nWelke symbolen een blad gebruikt");
const gebruikt = gebruikteSymbolen(b, ["@last q_L1 lijn\n  g_v1; 3.6 m\n  Q: q_k1; 3.6 m\n@end", "x = g_v10 + sg_w1 + g_w1_extra"]);
meld(gebruikt.has("g_v1") && gebruikt.has("q_k1"), "een symbool in een lastblok telt", [...gebruikt].join(" "));
meld(!gebruikt.has("g_w1") && !gebruikt.has("g_v2"), "een deel van een andere naam (g_v10, sg_w1, g_w1_extra) telt niet", [...gebruikt].join(" "));
meld(gebruikteSymbolen(b, []).size === 0 && gebruikteSymbolen(b, ["", "  "]).size === 0, "zonder rekentekst: geen enkel symbool, het rapport blijft zoals het was");
meld(belastingenVoorIfc(null).length === 0 && belastingenVoorIfc({ belastingen: { klassen: "x" } }).length === 0, "een rapport dat niet te lezen is geeft geen belastingobjecten");

console.log("\nIn een blad");
const opties = { ...evalOptiesVan(eigen), project: pt };
const blad = rekenUitwerking("q = g_v1*3.6 m + g_w1\nQ = q_k1*3.6 m\nt = g_tot*1 m", {}, projectScope(eigen), {}, undefined, opties);
meld(/34\.22/.test(tekst(blad.html)), "g_v1·3,6 m + g_w1 = 34,22 kN/m", tekst(blad.html).slice(0, 220));
meld(/9\.18/.test(tekst(blad.html)), "q_k1·3,6 m = 9,18 kN/m", tekst(blad.html).slice(0, 300));
meld(/11\.33/.test(tekst(blad.html)), "een eigen element van de projectgegevens rekent met de belastingen: 11,33", tekst(blad.html).slice(0, 400));
const onbekend = rekenUitwerking("x = q_k3*2 m", {}, projectScope(eigen), {}, undefined, opties);
meld(/q_k3|onbekend|undefined|not defined/i.test(tekst(onbekend.html)) && !/=\s*0\b/.test(tekst(onbekend.html)), "een belasting zonder waarde is onbekend in het blad, geen 0", tekst(onbekend.html).slice(0, 160));

console.log("\nHet rapport");
const std = standaardRapport("01-01-2026", {}, "nl");
meld(std.belastingen.klassen.every((k) => geldigSymbool(k.symbool ?? "")), "een nieuw rapport: de klassen hebben een symbool", JSON.stringify(std.belastingen.klassen.map((k) => k.symbool)));
const gelezen = normaliseerRapport({ ...std, belastingen: { ...kaal, vloerenDaken: [{ ...vloer, symbool: "g_bg", x: 40, y: 120 }, { ...dak, x: "links" }] } }, "01-01-2026", {});
meld(gelezen.belastingen.vloerenDaken[0].symbool === "g_bg" && gelezen.belastingen.vloerenDaken[0].x === 40 && gelezen.belastingen.vloerenDaken[0].y === 120,
  "symbool en plek van een blok blijven bij openen", JSON.stringify(gelezen.belastingen.vloerenDaken[0]));
meld(gelezen.belastingen.vloerenDaken[1].symbool === "g_v1" && gelezen.belastingen.vloerenDaken[1].x === undefined,
  "een oud rapport krijgt bij het openen symbolen; een kapotte plek vervalt", JSON.stringify({ s: gelezen.belastingen.vloerenDaken[1].symbool, x: gelezen.belastingen.vloerenDaken[1].x }));

console.log("\nDe plek op het canvas");
const blokken = [
  { sleutel: "a", opbouw: {} }, { sleutel: "b", opbouw: {} }, { sleutel: "c", opbouw: {} }, { sleutel: "d", opbouw: {} },
];
const hoogtes = { a: 100, b: 200, c: 100, d: 100 };
const vrij = plekken(blokken, hoogtes, 3 * BLOK_B + 2 * TUSSEN);
meld(vrij.a.x === 0 && vrij.b.x === BLOK_B + TUSSEN && vrij.c.x === 2 * (BLOK_B + TUSSEN) && vrij.a.y === 0 && vrij.c.y === 0,
  "zonder plek: naast elkaar in zoveel kolommen als er passen", JSON.stringify(vrij));
meld(vrij.d.x === 0 && vrij.d.y > 100, "het volgende blok komt in de kortste kolom", JSON.stringify(vrij.d));
meld(plekken(blokken, hoogtes, 100).c.x === 0, "een smal vlak: één kolom");
const vast = plekken([{ sleutel: "a", opbouw: { x: 300, y: 50 } }, { sleutel: "b", opbouw: {} }], { a: 100, b: 80 }, 800);
meld(vast.a.x === 300 && vast.a.y === 50 && vast.b.y >= 150 + TUSSEN, "een blok met een plek blijft staan; de rest komt eronder", JSON.stringify(vast));

console.log("\nIn het IFCX-document");
const doc = projectIfcx({ naam: "Proef", versie: 2, gegevens: legeGegevens(), exemplaren: [], rapport: { ...std, belastingen: b } });
const knopen = doc.data.filter((k) => k.attributes?.["ocss::belasting"]);
const rapportKnoop = doc.data.find((k) => k.attributes?.["ocss::rapport"]);
meld(knopen.length === 6, "elke belasting met een waarde is een eigen object (ocss::belasting)", String(knopen.length));
const kv = knopen.find((k) => k.attributes["ocss::belasting"].symbool === "g_v1");
meld(kv?.attributes["bsi::ifc::prop::Name"] === "1e-3e verdieping" && kv.attributes["ocss::belasting"].waarde === 8.15 && kv.attributes["ocss::belasting"].eenheid === "kN/m2" && kv.attributes["ocss::belasting"].soort === "G",
  "met naam, symbool, soort, waarde en eenheid", JSON.stringify(kv?.attributes));
meld(Object.values(rapportKnoop?.children ?? {}).includes(kv?.path), "de objecten hangen onder het rapport");
meld(!!doc.schemas?.["ocss::belasting"], "het schema van ocss::belasting gaat mee in het bestand");
meld(rapportKnoop.attributes["ocss::rapport"].belastingen.vloerenDaken[0].symbool === "g_v1", "het rapport zelf bewaart het symbool van elk blok");

if (fouten > 0) {
  console.error(`\nBelastingen uit hoofdstuk 5: ${fouten} afwijking(en).`);
  process.exit(1);
}
console.log("\nBelastingen uit hoofdstuk 5: alles klopt.");
