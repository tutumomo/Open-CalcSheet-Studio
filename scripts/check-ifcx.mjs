/**
 * Controlescript voor het projectbestand als IFCX en de STEP die eruit volgt
 * (packages/core/src/ifcx/, store/projectBestand.ts, store/projectIfcx.ts).
 *
 *   formaat        alleen `header`, `imports`, `schemas` en `data`; de kop volgens
 *                  de specificatie; knopen met alleen `path`, `children`,
 *                  `inherits`, `attributes`; namen zonder `/`; één wortel, geen
 *                  kringen, elk doel bestaat
 *   schema's       elk attribuut heeft een beschrijving, en de waarde voldoet
 *                  eraan; dezelfde regels als de lezer van buildingSMART
 *                  (src/ifcx-core/schema/schema-validation.ts)
 *   heen en terug  opslaan, openen en opslaan geeft dezelfde inhoud, afgezien
 *                  van het tijdstempel; ook met een PDF-blad, verborgen
 *                  onderdelen, het rapport en gekoppelde elementen
 *   oude bestanden versie 1, alleen `project`, een los blad en een `.cpd`
 *                  openen, en worden bij opslaan versie 2
 *   elk blad       ook een blad zonder herkend element staat erin, op zijn
 *                  plek, met zijn uitkomst; een herkend of gekoppeld element
 *                  krijgt een klasse en verwijst naar zijn toetsing
 *   geometrie      `geometrie` op een blad komt onder de bouwlaag en in de STEP
 *   toetsingen     de antwoorden van FEM Studio bij een blad (`ocss::blad::toetsing`)
 *                  voldoen aan hun schema en komen terug zoals ze waren
 *   STEP           de ruimtelijke boom, de relaties, GlobalId's, maattypen en
 *                  eenheden, tekens; en dezelfde bladen en waarden als het IFCX
 *
 * Deze controle gaat tegen de vorm van de specificatie, zonder netwerk. De
 * validatie met de lezer van buildingSMART zelf en met IfcOpenShell staat in
 * docs/ifc-export.md: die draai je apart.
 *
 * Vereist een gebouwde core:  npm --prefix packages/core run build
 * Draaien:  node scripts/check-ifcx.mjs
 */
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { laadTemplate } from "./lib/refcheck.mjs";
import { parse, evaluate, bouwProjectStep, ifcGuid, isProjectIfcx, leesProjectIfcx, OCSS_SCHEMAS, uuidUitIfcGuid } from "../packages/core/dist/index.js";
import {
  bouwProjectBestand,
  leesProjectBestand,
  PROJECT_FORMAAT_VERSIE,
} from "../packages/desktop/src/store/projectBestand.ts";
import { bladenVoorIfc, projectIfcx, projectStep } from "../packages/desktop/src/store/projectIfcx.ts";
import { bewaarOudeVersie, isOudFormaat, kopieVanOudBestand } from "../packages/desktop/src/tauri/fileOps.ts";
import { legeGegevens } from "../packages/desktop/src/store/projectGegevens.ts";
import { standaardRapport } from "../packages/desktop/src/rapport/model.ts";
import { standaardTeksten } from "../packages/desktop/src/rapport/standaardteksten.ts";

let fouten = 0;
let aantal = 0;
const meld = (ok, wat, detail = "") => {
  aantal++;
  if (!ok) fouten++;
  console.log(`  ${ok ? "OK  " : "FOUT"} ${wat}${ok || !detail ? "" : "  -> " + detail}`);
};

// ── De specificatie ──────────────────────────────────────────────────────────
// Uit schema/ifcx.tsp en de gepubliceerde bestanden op ifcx.dev.

const DATATYPES = new Set(["Real", "Boolean", "Integer", "String", "DateTime", "Enum", "Array", "Object", "Reference", "Blob"]);
const GROOTHEDEN = new Set(["Plane angle", "Thermodynamic temperature", "Electric current", "Time", "Frequency", "Mass", "Length", "Linear velocity", "Force", "Pressure", "Area", "Energy", "Power", "Volume"]);

const T = { dataType: "String" };
const R = { dataType: "Real" };
const REEKS = { dataType: "Array", arrayRestrictions: { value: R } };
const obj = (values) => ({ dataType: "Object", objectRestrictions: { values } });
/** De beschrijvingen uit de imports voor zover dit programma ze gebruikt. */
const GEIMPORTEERD = {
  // De inhoud van de geïmporteerde standaardbestanden, voor wat hieronder niet strenger staat.
  ...JSON.parse(readFileSync(new URL("./fixtures/ifcx-schemas.json", import.meta.url), "utf8")),
  "bsi::ifc::class": { value: obj({ code: T, uri: T }) },
  "bsi::ifc::material": { value: obj({ code: T, uri: T }) },
  "bsi::ifc::presentation::diffuseColor": { value: REEKS },
  "bsi::ifc::presentation::opacity": { value: R },
  "bsi::ifc::prop::Name": { value: T },
  "bsi::ifc::prop::Description": { value: T },
  "bsi::ifc::prop::Length": { value: R },
  "bsi::ifc::prop::Width": { value: R },
  "bsi::ifc::prop::Height": { value: R },
  "bsi::ifc::prop::Depth": { value: R },
  "bsi::ifc::prop::RefElevation": { value: R },
  "usd::usdgeom::mesh": { value: obj({ faceVertexIndices: { dataType: "Array", arrayRestrictions: { value: { dataType: "Integer" } } }, points: { dataType: "Array", arrayRestrictions: { value: REEKS } } }) },
  "usd::xformop": { value: obj({ transform: { dataType: "Array", arrayRestrictions: { value: REEKS } } }) },
};

function beschrijvingFouten(d, pad) {
  const uit = [];
  if (!d || !DATATYPES.has(d.dataType)) return [`${pad}: dataType ${JSON.stringify(d?.dataType)}`];
  if (d.quantityKind !== undefined && !GROOTHEDEN.has(d.quantityKind)) uit.push(`${pad}: quantityKind ${d.quantityKind}`);
  if (d.dataType === "Enum" && !Array.isArray(d.enumRestrictions?.options)) uit.push(`${pad}: Enum zonder options`);
  if (d.dataType === "Array") {
    if (!d.arrayRestrictions) uit.push(`${pad}: Array zonder arrayRestrictions`);
    else uit.push(...beschrijvingFouten(d.arrayRestrictions.value, `${pad}[]`));
  }
  if (d.objectRestrictions) {
    for (const [k, w] of Object.entries(d.objectRestrictions.values)) uit.push(...beschrijvingFouten(w, `${pad}.${k}`));
  }
  return uit;
}

/** Dezelfde regels als ValidateAttributeValue in schema-validation.ts van buildingSMART. */
function waardeFouten(d, w, pad) {
  if (d.optional && w === undefined) return [];
  const fout = (t) => [`${pad}: ${t}, kreeg ${JSON.stringify(w)?.slice(0, 60)}`];
  switch (d.dataType) {
    case "Boolean": return typeof w === "boolean" ? [] : fout("verwacht Boolean");
    case "String": case "DateTime": case "Reference": return typeof w === "string" ? [] : fout(`verwacht ${d.dataType}`);
    case "Enum":
      if (typeof w !== "string") return fout("verwacht Enum");
      return d.enumRestrictions.options.includes(w) ? [] : fout(`niet in [${d.enumRestrictions.options.join(",")}]`);
    case "Integer": return Number.isInteger(w) ? [] : fout("verwacht Integer");
    case "Real": return typeof w === "number" && Number.isFinite(w) ? [] : fout("verwacht Real");
    case "Object": {
      if (typeof w !== "object" || w === null) return fout("verwacht Object");
      const uit = [];
      for (const [k, sub] of Object.entries(d.objectRestrictions?.values ?? {})) {
        if (!Object.hasOwn(w, k)) {
          if (!sub.optional) uit.push(`${pad}.${k} ontbreekt`);
          continue;
        }
        uit.push(...waardeFouten(sub, w[k], `${pad}.${k}`));
      }
      return uit;
    }
    case "Array":
      if (!Array.isArray(w)) return fout("verwacht Array");
      return w.flatMap((x, i) => waardeFouten(d.arrayRestrictions.value, x, `${pad}[${i}]`));
    default:
      return fout(`type ${d.dataType} kan de lezer van buildingSMART niet aan`);
  }
}

/** Alle afwijkingen van de specificatie in een document. */
function specFouten(doc) {
  const uit = [];
  const velden = Object.keys(doc);
  for (const v of velden) if (!["header", "imports", "schemas", "data"].includes(v)) uit.push(`veld op het hoogste niveau: ${v}`);
  for (const v of ["header", "imports", "schemas", "data"]) if (!(v in doc)) uit.push(`ontbreekt: ${v}`);
  for (const v of ["id", "ifcxVersion", "dataVersion", "author", "timestamp"]) if (typeof doc.header?.[v] !== "string") uit.push(`header.${v} ontbreekt`);
  for (const v of Object.keys(doc.header ?? {})) if (!["id", "ifcxVersion", "dataVersion", "author", "timestamp"].includes(v)) uit.push(`header.${v} staat niet in de specificatie`);
  if (doc.header?.ifcxVersion !== "ifcx_alpha") uit.push(`ifcxVersion ${doc.header?.ifcxVersion}`);
  for (const i of doc.imports ?? []) if (typeof i.uri !== "string") uit.push("import zonder uri");
  for (const [n, s] of Object.entries(doc.schemas ?? {})) {
    for (const v of Object.keys(s)) if (!["uri", "value"].includes(v)) uit.push(`schema ${n}: veld ${v}`);
    uit.push(...beschrijvingFouten(s.value, n));
  }

  const paden = new Set();
  const doelen = new Set();
  for (const k of doc.data ?? []) {
    for (const v of Object.keys(k)) if (!["path", "children", "inherits", "attributes"].includes(v)) uit.push(`knoop ${k.path}: veld ${v}`);
    if (typeof k.path !== "string" || !k.path) uit.push("knoop zonder path");
    if (paden.has(k.path)) uit.push(`pad dubbel: ${k.path}`);
    paden.add(k.path);
    for (const [naam, d] of Object.entries(k.children ?? {})) {
      if (naam.includes("/")) uit.push(`kindnaam met /: ${naam}`);
      if (/^\d+$/.test(naam)) uit.push(`kindnaam alleen een getal: ${naam}`);
      if (typeof d === "string") doelen.add(d);
    }
    for (const d of Object.values(k.inherits ?? {})) if (typeof d === "string") doelen.add(d);
    for (const [a, w] of Object.entries(k.attributes ?? {})) {
      const s = doc.schemas[a] ?? GEIMPORTEERD[a];
      if (!s) {
        uit.push(`attribuut zonder schema: ${a}`);
        continue;
      }
      uit.push(...waardeFouten(s.value, w, `${k.path}.${a}`));
    }
  }
  for (const d of doelen) if (!paden.has(d)) uit.push(`doel bestaat niet: ${d}`);

  const wortels = [...paden].filter((p) => !doelen.has(p));
  if (wortels.length !== 1) uit.push(`wortels: ${wortels.join(", ")}`);

  const bezig = new Set();
  const klaar = new Set();
  const perPad = new Map((doc.data ?? []).map((k) => [k.path, k]));
  const bezoek = (p) => {
    if (klaar.has(p)) return;
    if (bezig.has(p)) {
      uit.push(`kring bij ${p}`);
      return;
    }
    bezig.add(p);
    const k = perPad.get(p);
    for (const d of [...Object.values(k?.children ?? {}), ...Object.values(k?.inherits ?? {})]) if (typeof d === "string") bezoek(d);
    bezig.delete(p);
    klaar.add(p);
  };
  for (const p of paden) bezoek(p);
  return uit;
}

const specOk = (doc, wat) => {
  const f = specFouten(doc);
  meld(f.length === 0, wat, f.slice(0, 5).join(" | "));
};

// ── Eigen proefproject, zonder klantgegevens ─────────────────────────────────

const PDF_BYTES = Buffer.concat([
  Buffer.from("%PDF-1.4\n%\xe2\xe3\xcf\xd3\n", "latin1"),
  Buffer.from(Array.from({ length: 256 }, (_, i) => i)),
  Buffer.from("\n%%EOF\n", "latin1"),
]);
const PDF_DATA = PDF_BYTES.toString("base64");

const BLAD_BALK = [
  "# Balk van hout — EN 1995",
  "b = ?{100}mm",
  "h = ?{300}mm",
  "L = ?{4200}mm",
  "f_m_d = 13.6*N/mm^2",
  "M_Ed = 12.5*kN*m",
  "E_0 = 11000*N/mm^2",
  "I_y = b*h^3/12",
  "W_y = b*h^2/6",
  "q = 2.5*kN/m",
  "UC_buiging = M_Ed/(W_y*f_m_d)",
  "UC_max = UC_buiging",
].join("\n");

const BLAD_KRUIP = [
  "# Kruipfactor — EN 1992",
  "φ_0 = ?{2.4}",
  "RH = 60",
  "A_c = 200000*mm^2",
  "ρ = 2400*kg/m^3",
  "k_def = φ_0*0.6",
].join("\n");

const BLAD_FOUT = "# Kapot blad\nx = 1/onbekend_ding(\n";

const GUID_BEKEND = ifcGuid("0d8bd9f3-3b2a-4a35-9c5e-7f1a2b3c4d5e");

const VOLLEDIG = {
  versie: PROJECT_FORMAAT_VERSIE,
  naam: "Proefproject Ü & 'co'",
  gegevens: { ...legeGegevens(), project_nummer: "P-1", project_naam: "Proef", constructeur: "Ir. Voorbeeld", extraVeld: "bewaar mij" },
  verborgen: { gegevens: true },
  rapport: standaardRapport("01-01-2026", standaardTeksten("nl"), "nl"),
  exemplaren: [
    {
      id: "ex-balk", naam: "BL-01 begane grond", templateId: "balk", source: BLAD_BALK, bronVersie: "abc1234",
      waarden: { b: "120", h: "280", leeg: "" }, elementen: [],
    },
    {
      id: "ex-pdf", naam: "FEM-rapport hal", templateId: "pdf", source: "", waarden: {}, elementen: [],
      pdf: { bestandsnaam: "FEM rapport (hal).pdf", data: PDF_DATA },
    },
    {
      id: "ex-kruip", naam: "Kruipfactor γ", templateId: "kruip", source: BLAD_KRUIP, waarden: { "φ_0": "2,1" }, elementen: [],
    },
    {
      id: "ex-gekoppeld", naam: "Bout M16", templateId: "bout", source: "# Bout — EN 1993\nF_v = 12*kN\nUC_afsch = 1.2\nUC_max = UC_afsch\n", waarden: {},
      elementen: [{ id: GUID_BEKEND, naam: "Kolom K1" }, { id: "eigen-pad_7" }],
    },
    { id: "ex-kapot", naam: "Kapot blad", templateId: "", source: BLAD_FOUT, waarden: {}, elementen: [] },
  ],
};

/** Wat de store zou opslaan na het lezen van een bestand. */
function payloadUit(g) {
  return {
    versie: PROJECT_FORMAAT_VERSIE,
    naam: g.projectNaam,
    gegevens: g.gegevens,
    exemplaren: g.exemplaren,
    rapport: g.rapport,
    verborgen: g.verborgen,
  };
}

const zonderTijd = (tekst) => {
  const d = JSON.parse(tekst);
  delete d.header.timestamp;
  return d;
};

const opslaan = (p) => bouwProjectBestand(p, bladenVoorIfc(p));

/** De paden waarop twee waarden verschillen. */
function verschillen(a, b, pad = "") {
  if (isDeepStrictEqual(a, b)) return [];
  if (a && b && typeof a === "object" && typeof b === "object" && Array.isArray(a) === Array.isArray(b)) {
    return [...new Set([...Object.keys(a), ...Object.keys(b)])].flatMap((k) => verschillen(a[k], b[k], `${pad}.${k}`));
  }
  return [`${pad}: ${JSON.stringify(a)?.slice(0, 80)} tegen ${JSON.stringify(b)?.slice(0, 80)}`];
}

const stil = (fn) => {
  const was = console.error;
  console.error = () => {};
  try {
    return fn();
  } finally {
    console.error = was;
  }
};

// ── 1. Formaat ───────────────────────────────────────────────────────────────
console.log("Het bestand is zuiver IFCX:");
const tekst1 = stil(() => opslaan(VOLLEDIG));
const doc1 = JSON.parse(tekst1);
specOk(doc1, "volgens de specificatie, en elk attribuut voldoet aan zijn schema");
meld(isDeepStrictEqual(Object.keys(doc1), ["header", "imports", "schemas", "data"]), "op het hoogste niveau alleen de vier velden, in die volgorde");
meld(doc1.header.dataVersion === `${PROJECT_FORMAAT_VERSIE}.0.0` && PROJECT_FORMAAT_VERSIE === 2, "formaatversie 2 in de kop", doc1.header.dataVersion);
meld(isProjectIfcx(doc1) && !isOudFormaat(tekst1), "wordt als projectbestand herkend");
meld(doc1.imports.every((i) => /^https:\/\/ifcx\.dev\//.test(i.uri)), "imports wijzen naar ifcx.dev");
const eigen = doc1.data.flatMap((k) => Object.keys(k.attributes ?? {})).filter((a) => !a.startsWith("bsi::") && !a.startsWith("usd::"));
meld(eigen.every((a) => a.startsWith("ocss::")), "alles buiten de standaard staat onder één namespace", eigen.find((a) => !a.startsWith("ocss::")));
meld(eigen.every((a) => doc1.schemas[a]), "die namespace staat compleet in het bestand");
{
  const knoop = (naam) => doc1.data.find((k) => k.attributes?.["bsi::ifc::prop::Name"] === naam);
  const pad = doc1.data.map((k) => k.path);
  meld(pad.every((p) => /^[0-9a-f-]{36}$/.test(p) || p === "eigen-pad_7"), "paden zijn UUID's, of het pad dat de constructeur aanwees");
  meld(knoop("Proefproject Ü & 'co'")?.attributes["bsi::ifc::class"].code === "IfcProject", "het project is een IfcProject met zijn naam");
  const site = doc1.data.find((k) => k.attributes?.["bsi::ifc::class"]?.code === "IfcSite");
  const gebouw = doc1.data.find((k) => k.attributes?.["bsi::ifc::class"]?.code === "IfcBuilding");
  const laag = doc1.data.find((k) => k.attributes?.["bsi::ifc::class"]?.code === "IfcBuildingStorey");
  meld(site && gebouw && laag && Object.values(site.children).includes(gebouw.path) && Object.values(gebouw.children).includes(laag.path), "project, site, gebouw en bouwlaag staan onder elkaar");
  meld(doc1.data.find((k) => k.path === doc1.data[0].path).attributes["ocss::project"].formaatversie === 2, "de formaatversie staat ook op het project");
}

// ── 2. Heen en terug ─────────────────────────────────────────────────────────
console.log("Heen en terug zonder verlies:");
const eerste = leesProjectBestand(tekst1, "x");
{
  const terug = payloadUit(eerste);
  meld(terug.naam === VOLLEDIG.naam, "de projectnaam blijft", terug.naam);
  const vGegevens = verschillen(terug.gegevens, VOLLEDIG.gegevens);
  meld(vGegevens.length === 0, "alle projectgegevens blijven, ook een onbekend veld", vGegevens.join(" | "));
  meld(isDeepStrictEqual(terug.verborgen, VOLLEDIG.verborgen), "verborgen onderdelen blijven");
  const vRapport = verschillen(terug.rapport, VOLLEDIG.rapport);
  meld(vRapport.length === 0, "het hele rapport blijft", vRapport.slice(0, 3).join(" | "));
  meld(isDeepStrictEqual(terug.exemplaren.map((e) => e.id), VOLLEDIG.exemplaren.map((e) => e.id)), "de bladen staan in hun volgorde");
  const vBladen = verschillen(terug.exemplaren, VOLLEDIG.exemplaren);
  meld(vBladen.length === 0, "elk blad blijft veld voor veld: naam, id, templateId, bronVersie, tekst, invoer, elementen, PDF", vBladen.slice(0, 4).join(" | "));
  const pdf = terug.exemplaren.find((e) => e.templateId === "pdf").pdf;
  meld(pdf?.bestandsnaam === "FEM rapport (hal).pdf" && Buffer.from(pdf.data, "base64").equals(PDF_BYTES), "de PDF komt byte voor byte terug");
  meld(!("pdf" in terug.exemplaren[0]) && !("bronVersie" in terug.exemplaren[2]), "een blad krijgt geen velden die het niet had");
  meld(!("rapport" in JSON.parse(JSON.stringify(payloadUit(leesProjectBestand(stil(() => opslaan({ ...VOLLEDIG, rapport: undefined })), "x"))))), "zonder rapport komt er geen rapport bij");

  const tekst2 = stil(() => opslaan(terug));
  const v = verschillen(zonderTijd(tekst1), zonderTijd(tekst2));
  meld(v.length === 0, "opslaan, openen, opslaan geeft dezelfde inhoud, afgezien van het tijdstempel", v.slice(0, 4).join(" | "));
  const derde = stil(() => opslaan(payloadUit(leesProjectBestand(tekst2, "x"))));
  meld(isDeepStrictEqual(zonderTijd(tekst2), zonderTijd(derde)), "en nog een keer");

  // Het bestand en de export naar .ifcx zijn hetzelfde document.
  const opgeslagen = JSON.parse(tekst1);
  const export_ = JSON.parse(JSON.stringify(stil(() => projectIfcx(VOLLEDIG))));
  delete opgeslagen.header.timestamp;
  delete export_.header.timestamp;
  meld(verschillen(opgeslagen, export_).length === 0, "het bestand en de export naar .ifcx zijn hetzelfde", verschillen(opgeslagen, export_).slice(0, 4).join(" | "));

  // Een leeg project en een project zonder naam.
  const leeg = { versie: 2, naam: "", gegevens: {}, exemplaren: [] };
  const leegTekst = bouwProjectBestand(leeg, null);
  specOk(JSON.parse(leegTekst), "een leeg project is geldig IFCX");
  meld(leesProjectBestand(leegTekst, "bestand").projectNaam === "bestand", "een project zonder naam krijgt de bestandsnaam");
  meld(/IFCPROJECT\(/.test(bouwProjectStep(JSON.parse(leegTekst))), "en de STEP gaat ook goed");

  // Zonder doorrekenen (de API-laag en oudere aanroepen): de inhoud is dezelfde.
  const kaal = leesProjectBestand(bouwProjectBestand(VOLLEDIG, null), "x");
  meld(verschillen(payloadUit(kaal), payloadUit(eerste)).length === 0, "zonder uitkomsten is de inhoud van het project dezelfde");

  // Knopen die met een ander gereedschap zijn aangevuld, in IFCX de gewone manier.
  const aangevuld = JSON.parse(tekst1);
  const bladPad = aangevuld.data.find((k) => k.attributes?.["ocss::blad"]?.id === "ex-kruip").path;
  aangevuld.data.push({ path: bladPad, attributes: { "bsi::ifc::prop::Name": "Hernoemd" } });
  meld(leesProjectBestand(JSON.stringify(aangevuld), "x").exemplaren[2].naam === "Hernoemd", "knopen met hetzelfde pad worden samengevoegd, de laatste wint");
  const omgedraaid = JSON.parse(tekst1);
  omgedraaid.data.reverse();
  meld(isDeepStrictEqual(leesProjectBestand(JSON.stringify(omgedraaid), "x").exemplaren.map((e) => e.id), VOLLEDIG.exemplaren.map((e) => e.id)), "de volgorde van de knopen in het bestand telt niet, die van de bladen wel");
}

// ── 3. Elk blad ──────────────────────────────────────────────────────────────
console.log("Elk blad staat erin:");
{
  const bladen = doc1.data.filter((k) => k.attributes?.["ocss::blad"]);
  meld(bladen.length === VOLLEDIG.exemplaren.length, `alle ${VOLLEDIG.exemplaren.length} bladen, herkend of niet`, String(bladen.length));
  const opId = (id) => bladen.find((k) => k.attributes["ocss::blad"].id === id);
  const kruip = opId("ex-kruip");
  meld(!!kruip && kruip.attributes["bsi::ifc::prop::Name"] === "Kruipfactor γ", "een blad zonder element staat er met zijn naam");
  const u = kruip.attributes["ocss::blad::uitkomst"];
  const kdef = u.variabelen.find((v) => v.naam === "k_def");
  meld(kdef?.waarde === 2.1 * 0.6 && kdef.formule === "φ_0*0.6", "elke variabele met waarde en formule, gerekend met de eigen invoer", JSON.stringify(kdef));
  const ac = u.variabelen.find((v) => v.naam === "A_c");
  meld(ac?.eenheid === "mm^2" && ac.waarde === 200000, "en eenheid", JSON.stringify(ac));
  meld(u.status === "geen_oordeel" && u.norm === "EN 1992" && u.titel === "Kruipfactor", "de norm en de titel; zonder UC geen oordeel", `${u.status} ${u.norm} ${u.titel}`);
  meld(u.invoervelden.find((v) => v.naam === "φ_0")?.getal === 2.1, "de invoervelden als gegevens");

  const balk = opId("ex-balk").attributes["ocss::blad::uitkomst"];
  meld(balk.status === "voldoet" && balk.uc < 1 && balk.unityChecks.some((c) => c.naam === "UC_buiging" && c.voldoet === true), "unity checks en oordeel", JSON.stringify(balk.unityChecks));
  const bout = opId("ex-gekoppeld").attributes["ocss::blad::uitkomst"];
  meld(bout.status === "voldoet_niet" && bout.uc === 1.2, "voldoet niet is ook een oordeel", `${bout.status} ${bout.uc}`);
  const kapot = opId("ex-kapot").attributes["ocss::blad::uitkomst"];
  meld(kapot.status === "niet_doorgerekend" && !!kapot.fout && opId("ex-kapot").attributes["ocss::blad::rekentekst"] === BLAD_FOUT, "een blad dat omvalt blijft erin, met de fout en zijn tekst", kapot.status);
  // Tekeningen en 3D-beelden zijn ook als zodanig te vinden.
  const metTekening = projectIfcx({
    versie: 2, naam: "Figuren", gegevens: {}, exemplaren: [{
      id: "f", naam: "Figuren", templateId: "", waarden: {},
      source: "# Figuren\n## Tekening\n'<svg width=\"10\" height=\"10\">\n'<rect width=\"10\" height=\"10\"/>\n'</svg>\n@svg\n<svg width=\"4\"><path d=\"M0 0\"/></svg>\n@end\n@3d\nbalk 0 0 0 1000 0 0 100 200 hout\n@end\n",
    }],
  });
  specOk(metTekening, "een blad met tekeningen is geldig IFCX");
  const figuren = metTekening.data.filter((k) => k.attributes?.["ocss::figuur"]).map((k) => k.attributes["ocss::figuur"]);
  meld(figuren.map((f) => f.soort).join(",") === "svg,svg,3d", "tekeningen en 3D-blokken staan als figuur onder het blad", figuren.map((f) => f.soort).join(","));
  meld(/^<svg[^>]*>.*<rect.*<\/svg>$/s.test(figuren[0]?.svg ?? "") && figuren[0]?.kop === "Tekening", "een tekening uit tekstregels is één figuur, met zijn kop", figuren[0]?.svg);
  meld(Array.isArray(figuren[2]?.scene?.elementen) && figuren[2].scene.elementen.length > 0, "een 3D-blok met zijn scène");
  const pdf = opId("ex-pdf");
  meld(pdf.attributes["ocss::blad"].soort === "pdf" && pdf.attributes["ocss::blad::pdf"].grootte === PDF_BYTES.length && pdf.attributes["ocss::blad::pdf"].mediaType === "application/pdf", "een PDF-blad met zijn inhoud, soort en grootte");
  meld(!("ocss::blad::rekentekst" in pdf.attributes), "een PDF-blad heeft geen rekentekst");

  const wortel = doc1.data[0];
  const bladenKnoop = doc1.data.find((k) => k.path === wortel.children.Rekenbladen);
  meld(isDeepStrictEqual(Object.values(bladenKnoop.children), bladen.sort((a, b) => a.attributes["ocss::blad"].volgorde - b.attributes["ocss::blad"].volgorde).map((k) => k.path)), "de bladen hangen in hun volgorde onder Rekenbladen");
  meld(!!wortel.children.Constructierapport && !!doc1.data.find((k) => k.path === wortel.children.Constructierapport)?.attributes["ocss::rapport"], "het rapport hangt onder het project");
}

console.log("Herkende en gekoppelde elementen:");
{
  const elementen = doc1.data.filter((k) => k.attributes?.["ocss::element"]);
  const balk = elementen.find((k) => k.attributes["ocss::element"].bron === "herkend");
  const bladBalk = doc1.data.find((k) => k.attributes?.["ocss::blad"]?.id === "ex-balk");
  meld(balk?.attributes["bsi::ifc::class"].code === "IfcBeam" && balk.attributes["bsi::ifc::prop::Name"] === "BL-01 begane grond", "een herkende balk is een IfcBeam met de naam van het blad");
  meld(balk?.attributes["ocss::element"].toetsingen[0].ref === bladBalk.path && balk.attributes["ocss::element"].toetsingen[0].status === "voldoet", "en verwijst naar zijn toetsing");
  meld(balk?.attributes["bsi::ifc::prop::Height"] === 0.28, "met zijn maten in meter", String(balk?.attributes["bsi::ifc::prop::Height"]));
  const bekend = elementen.find((k) => k.path === uuidUitIfcGuid(GUID_BEKEND));
  meld(bekend?.attributes["ocss::element"].bronId === GUID_BEKEND && bekend.attributes["bsi::ifc::prop::Name"] === "Kolom K1", "een GlobalId wordt het pad van het element in het bronmodel");
  meld(bekend?.attributes["bsi::ifc::class"].code === "IfcBuildingElementProxy", "zonder herkend soort is het een proxy");
  meld(!!elementen.find((k) => k.path === "eigen-pad_7"), "een pad blijft een pad");
  const laag = doc1.data.find((k) => k.attributes?.["bsi::ifc::class"]?.code === "IfcBuildingStorey");
  meld(elementen.every((k) => Object.values(laag.children).includes(k.path)), "alle elementen hangen onder de bouwlaag");
  const kruip = doc1.data.find((k) => k.attributes?.["ocss::blad"]?.id === "ex-kruip");
  meld(!elementen.some((k) => k.attributes["ocss::element"].toetsingen.some((t) => t.ref === kruip.path)), "een kruipfactor krijgt geen verzonnen element");
  // Twee bladen aan hetzelfde element: één knoop, twee toetsingen.
  const twee = projectIfcx({
    versie: 2, naam: "Twee", gegevens: {}, exemplaren: [
      { id: "a", naam: "A", templateId: "", source: "x = 1", waarden: {}, elementen: [{ id: "el" }] },
      { id: "b", naam: "B", templateId: "", source: "y = 1", waarden: {}, elementen: [{ id: "el" }] },
    ],
  });
  const el = twee.data.filter((k) => k.path === "el");
  meld(el.length === 1 && el[0].attributes["ocss::element"].toetsingen.length === 2, "een element aan twee bladen: één knoop, twee toetsingen");
}

// ── 4. Oude bestanden ────────────────────────────────────────────────────────
console.log("Oude bestanden blijven openen:");
{
  const blad = { id: "ex-1", naam: "Oud blad", templateId: "balk", source: "x = 1\n", waarden: { x: "1" }, elementen: [] };
  const vormen = {
    "versie 1 (header, data, source, project)": JSON.stringify({
      "@context": "https://standards.buildingsmart.org/IFC/IFCX/0.1/context.jsonld", "@type": "IfcxFile",
      header: { name: "oud.ifcx", schema: "ifcx:0.1" }, data: [{ path: "/project", type: "Project", name: "Oud" }],
      source: { content: "x = 1\n" },
      project: { versie: 1, naam: "Oud", gegevens: { project_nummer: "7" }, exemplaren: [blad] },
    }),
    "alleen project": JSON.stringify({ project: { versie: 1, naam: "Oud", gegevens: {}, exemplaren: [blad] } }),
    "los blad (source.content)": JSON.stringify({ header: { name: "oud" }, data: [], source: { content: "x = 1\n" } }),
    ".cpd (kale tekst)": "x = 1\n",
  };
  for (const [naam, raw] of Object.entries(vormen)) {
    const g = leesProjectBestand(raw, "bestand");
    meld(isOudFormaat(raw), `${naam}: wordt als oud formaat herkend`);
    meld(g.exemplaren.length === 1 && g.exemplaren[0].source === "x = 1\n", `${naam}: opent met zijn tekst`);
    const nieuw = JSON.parse(stil(() => opslaan(payloadUit(g))));
    const f = specFouten(nieuw);
    meld(f.length === 0 && isProjectIfcx(nieuw) && nieuw.header.dataVersion === "2.0.0", `${naam}: bij opslaan versie 2`, f[0]);
    const weer = leesProjectBestand(JSON.stringify(nieuw), "bestand");
    meld(weer.exemplaren[0].source === "x = 1\n", `${naam}: en dat opent weer`);
  }
  const v1 = leesProjectBestand(vormen["versie 1 (header, data, source, project)"], "b");
  meld(v1.projectNaam === "Oud" && v1.gegevens.project_nummer === "7" && v1.exemplaren[0].waarden.x === "1", "versie 1: projectnaam, gegevens en invoer komen mee");

  const fixture = readFileSync(new URL("./fixtures/rapport-voorbeeld.ifccalculation", import.meta.url), "utf8");
  const g = leesProjectBestand(fixture, "voorbeeld");
  meld(g.exemplaren.length === 2 && !!g.rapport?.bureau?.naam, "het voorbeeldproject opent");
  const t1 = stil(() => opslaan(payloadUit(g)));
  specOk(JSON.parse(t1), "het voorbeeldproject is na opslaan geldig IFCX");
  const g2 = leesProjectBestand(t1, "voorbeeld");
  const v = verschillen(payloadUit(g2), payloadUit(g));
  meld(v.length === 0, "het voorbeeldproject komt ongeschonden terug", v.slice(0, 3).join(" | "));
  const t2 = stil(() => opslaan(payloadUit(g2)));
  meld(verschillen(zonderTijd(t1), zonderTijd(t2)).length === 0, "en blijft daarna gelijk");
  meld(verschillen(leesProjectIfcx(JSON.parse(t1)).rapport, g.rapport).length === 0, "het rapport uit de kern is hetzelfde");

  let melding = "";
  try {
    leesProjectBestand(JSON.stringify({ header: { id: "a", ifcxVersion: "ifcx_alpha", dataVersion: "1", author: "a", timestamp: "t" }, imports: [], schemas: {}, data: [{ path: "x" }] }), "vreemd");
  } catch (e) {
    melding = e.message;
  }
  meld(/does not contain a project/.test(melding), "IFCX van een ander programma geeft een melding en wordt geen rekentekst", melding);
}

console.log("De kopie van een oud bestand:");
{
  const schijf = new Map();
  const fs = {
    readTextFile: async (p) => {
      if (!schijf.has(p)) throw new Error("bestaat niet");
      return schijf.get(p);
    },
    writeTextFile: async (p, t) => {
      schijf.set(p, t);
    },
  };
  meld(kopieVanOudBestand("C:\\map\\Hal (concept).ifccalculation") === "C:\\map\\Hal (concept).v1.bak", "de kopie heet <naam>.v1.bak en staat ernaast");
  schijf.set("a.ifccalculation", '{"project":{}}');
  await bewaarOudeVersie("a.ifccalculation", fs);
  meld(schijf.get("a.v1.bak") === '{"project":{}}', "het eerste opslaan over een oud bestand maakt de kopie");
  schijf.set("a.v1.bak", "eerder");
  await bewaarOudeVersie("a.ifccalculation", fs);
  meld(schijf.get("a.v1.bak") === "eerder", "een bestaande kopie blijft staan");
  schijf.set("b.ifccalculation", tekst1);
  await bewaarOudeVersie("b.ifccalculation", fs);
  meld(!schijf.has("b.v1.bak"), "een bestand in het nieuwe formaat krijgt geen kopie");
  await bewaarOudeVersie("nieuw.ifccalculation", fs);
  meld(!schijf.has("nieuw.v1.bak"), "een bestand dat er nog niet is ook niet");
}

// ── 5. Het schema dekt het rapport ───────────────────────────────────────────
console.log("Het schema van het rapport:");
{
  const ontbreekt = [];
  const loop = (w, d, pad) => {
    if (d.dataType === "Object" && !d.objectRestrictions) return;
    if (Array.isArray(w)) {
      for (const x of w) loop(x, d.arrayRestrictions.value, `${pad}[]`);
      return;
    }
    if (w && typeof w === "object") {
      for (const [k, x] of Object.entries(w)) {
        const sub = d.objectRestrictions?.values[k];
        if (!sub) ontbreekt.push(`${pad}.${k}`);
        else loop(x, sub, `${pad}.${k}`);
      }
    }
  };
  loop(VOLLEDIG.rapport, OCSS_SCHEMAS["ocss::rapport"].value, "rapport");
  meld(ontbreekt.length === 0, "elk veld van het rapport staat in het schema", ontbreekt.slice(0, 5).join(", "));
}

// ── 6. Geometrie ─────────────────────────────────────────────────────────────
console.log("Geometrie op een blad:");
const MET_GEOMETRIE = (() => {
  const blok = { points: [[0, 0, 0], [1, 0, 0], [0, 1, 0], [0, 0, 1]], faceVertexIndices: [0, 1, 2, 0, 1, 3, 0, 2, 3, 1, 2, 3] };
  const nodes = evaluate(parse("# Balklaag\nL = 1*m\n"), {}, {});
  const bladen = [{
    id: "ex-geo", naam: "Balklaag", templateId: "balklaag", source: "# Balklaag\nL = 1*m\n", waarden: {}, nodes,
    geometrie: [
      { path: "geo-wortel", children: { Balk_1: "geo-balk-1", Balk_2: "geo-balk-2" }, attributes: { "bsi::ifc::class": { code: "IfcElementAssembly" }, "bsi::ifc::prop::Name": "Balklaag" } },
      { path: "geo-profiel", children: { Lichaam: "geo-lichaam" }, attributes: { "bsi::ifc::material": { code: "C24", uri: "https://voorbeeld.example/C24" } } },
      { path: "geo-lichaam", attributes: { "usd::usdgeom::mesh": blok } },
      { path: "geo-balk-1", inherits: { profiel: "geo-profiel" }, attributes: { "bsi::ifc::class": { code: "IfcBeam", uri: "u" }, "bsi::ifc::prop::Name": "Balk 1", "bsi::ifc::prop::Length": 1, "ocss::calc::uc": 0.5 } },
      { path: "geo-balk-2", inherits: { profiel: "geo-profiel" }, attributes: { "bsi::ifc::class": { code: "IfcBeam", uri: "u" }, "bsi::ifc::prop::Name": "Balk 2", "usd::xformop": { transform: [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 2, 0, 1]] } } },
    ],
  }];
  const p = { versie: 2, naam: "Geo", gegevens: {}, exemplaren: [{ id: "ex-geo", naam: "Balklaag", templateId: "balklaag", source: "# Balklaag\nL = 1*m\n", waarden: {} }] };
  return { doc: projectIfcx(p, bladen), bladen, p };
})();
{
  const { doc } = MET_GEOMETRIE;
  specOk(doc, "geldig IFCX, ook met attributen van buiten");
  const laag = doc.data.find((k) => k.attributes?.["bsi::ifc::class"]?.code === "IfcBuildingStorey");
  const kinderen = Object.values(laag.children ?? {});
  meld(kinderen.includes("geo-wortel") && !kinderen.includes("geo-balk-1") && !kinderen.includes("geo-profiel"), "de wortels van de geometrie komen onder de bouwlaag", kinderen.join(","));
  meld(doc.imports.some((i) => i.uri.includes("usd@")), "de import van usd komt erbij");
  meld(!!doc.schemas["ocss::calc::uc"], "een eigen attribuut krijgt een beschrijving");
  const balk = doc.data.find((k) => k.path === "geo-balk-1");
  meld(balk.attributes["ocss::element"].toetsingen[0].blad === "Balklaag", "elk element in de geometrie verwijst naar zijn toetsing");
  meld(typeof doc.data.find((k) => k.path === "geo-wortel").attributes["bsi::ifc::class"].uri === "string", "de uri bij een klasse wordt aangevuld");
  const zonder = JSON.parse(bouwProjectBestand(MET_GEOMETRIE.p, null));
  meld(!zonder.imports.some((i) => i.uri.includes("usd@")), "zonder geometrie geen import van usd");
}
{
  // De echte module: een balklaagblad levert in het projectbestand zijn balken.
  const p = { versie: 2, naam: "Echt", gegevens: legeGegevens(), exemplaren: [
    { id: "ex-echt", naam: "BL-01", templateId: "balklaag", source: laadTemplate("balklaag.ts"), waarden: {}, elementen: [] },
  ] };
  const [blad] = stil(() => bladenVoorIfc(p));
  meld(!blad.fout && (blad.geometrie?.length ?? 0) > 0, "een balklaagblad krijgt zijn geometrie uit zijn eigen uitkomst", blad.fout ?? "");
  const doc = JSON.parse(JSON.stringify(projectIfcx(p, [blad])));
  specOk(doc, "geldig IFCX met de echte balklaag");
  const balken = doc.data.filter((k) => k.attributes?.["bsi::ifc::class"]?.code === "IfcBeam");
  meld(balken.length > 0 && balken.every((k) => k.attributes["ocss::element"]?.toetsingen?.[0]?.blad === "BL-01"), "de balken staan in het project en verwijzen naar hun blad", String(balken.length));
  const terug = leesProjectIfcx(doc);
  meld(terug.exemplaren.length === 1 && terug.exemplaren[0].source === p.exemplaren[0].source, "de geometrie is afgeleid: teruglezen geeft alleen het blad");
  // Een bestand met de naamruimte van de vorige app-naam blijft leesbaar.
  const oud = JSON.parse(JSON.stringify(doc).replaceAll("ocss::", "oscs" + "::"));
  meld(isProjectIfcx(oud) && isDeepStrictEqual(leesProjectIfcx(oud), terug), "een bestand met de vorige naamruimte leest hetzelfde");
}

// ── 7. STEP ──────────────────────────────────────────────────────────────────
console.log("STEP:");

/** Leest een STEP-bestand in entiteiten; goed genoeg voor deze controle. */
function leesStep(tekst) {
  const m = tekst.match(/DATA;\n([\s\S]*)\nENDSEC;\nEND-ISO-10303-21;\n$/);
  if (!m) return null;
  return m[1].split("\n").map((r) => {
    const x = r.match(/^#(\d+)=([A-Z0-9]+)\((.*)\);$/s);
    return x ? { id: `#${x[1]}`, type: x[2], rest: x[3], rij: r } : { rij: r, type: null };
  });
}

/** Zet de tekens uit een STEP-string terug. */
function ontsleutel(s) {
  return s
    .replace(/\\X2\\((?:[0-9A-F]{4})+)\\X0\\/g, (_, h) => h.match(/.{4}/g).map((c) => String.fromCharCode(parseInt(c, 16))).join(""))
    .replace(/\\X4\\([0-9A-F]{8})\\X0\\/g, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/''/g, "'")
    .replace(/\\\\/g, "\\");
}

const stepTekst = stil(() => projectStep(payloadUit(eerste)));
const ents = leesStep(stepTekst);
{
  meld(!!ents && ents.every((e) => e.type), "het bestand is regel voor regel te lezen", ents?.find((e) => !e.type)?.rij?.slice(0, 80));
  meld(/^ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION\(/.test(stepTekst) && stepTekst.includes("FILE_SCHEMA(('IFC4X3_ADD2'));"), "kop met IFC4X3_ADD2");
  const van = (t) => ents.filter((e) => e.type === t);
  for (const t of ["IFCPROJECT", "IFCSITE", "IFCBUILDING", "IFCBUILDINGSTOREY", "IFCOWNERHISTORY", "IFCUNITASSIGNMENT", "IFCGEOMETRICREPRESENTATIONCONTEXT"]) {
    meld(van(t).length === 1, `één ${t}`, String(van(t).length));
  }
  const ids = new Set(ents.map((e) => e.id));
  const los = [...stepTekst.matchAll(/#(\d+)/g)].map((m) => `#${m[1]}`).filter((r) => !ids.has(r));
  meld(los.length === 0, "elke verwijzing bestaat", los.slice(0, 3).join(","));

  const agg = van("IFCRELAGGREGATES");
  const project = van("IFCPROJECT")[0].id;
  const site = van("IFCSITE")[0].id;
  const gebouw = van("IFCBUILDING")[0].id;
  const laag = van("IFCBUILDINGSTOREY")[0].id;
  const heeft = (ouder, kind) => agg.some((r) => r.rest.includes(`,${ouder},(`) && new RegExp(`[(,]${kind}[,)]`).test(r.rest.slice(r.rest.lastIndexOf("("))));
  meld(heeft(project, site) && heeft(site, gebouw) && heeft(gebouw, laag), "project, site, gebouw en bouwlaag via IfcRelAggregates");
  const bevat = van("IFCRELCONTAINEDINSPATIALSTRUCTURE");
  meld(bevat.length === 1 && bevat[0].rest.endsWith(`,${laag}`), "elementen via IfcRelContainedInSpatialStructure in de bouwlaag");
  const balkEnt = van("IFCBEAM")[0];
  meld(!!balkEnt && bevat[0].rest.includes(balkEnt.id), "de balk zit erin");

  const guids = [...stepTekst.matchAll(/=IFC[A-Z0-9]+\('([0-9A-Za-z_$]{22})'/g)].map((m) => m[1]);
  meld(guids.length > 10 && new Set(guids).size === guids.length, `alle GlobalId's uniek (${guids.length})`);
  meld(guids.every((g) => /^[0-3][0-9A-Za-z_$]{21}$/.test(g)), "en geldig");
  meld(stepTekst.includes(`'${GUID_BEKEND}'`), "een gekoppeld element houdt zijn GlobalId");
  meld(!/'Pset_/.test(stepTekst) && !/'Qto_/.test(stepTekst), "geen eigen set met Pset_ of Qto_");
  meld(/^[\x20-\x7e\n]*$/.test(stepTekst), "alleen gewone tekens in het bestand");
  const proj = ontsleutel(van("IFCPROJECT")[0].rest);
  meld(proj.includes("Proefproject Ü & 'co'"), "bijzondere tekens komen goed terug", proj.slice(0, 80));

  // Elk blad, ook zonder element.
  const groepen = van("IFCGROUP").map((e) => ontsleutel(e.rest));
  const docs = van("IFCDOCUMENTINFORMATION").map((e) => ontsleutel(e.rest));
  for (const ex of VOLLEDIG.exemplaren) {
    meld(groepen.some((g) => g.includes(`'${ex.naam}'`)) && docs.some((d) => d.includes(`'${ex.id}','${ex.naam}'`)), `blad "${ex.naam}": een groep en een document`);
  }
  meld(docs.some((d) => d.includes("application/pdf")), "het PDF-blad als PDF");
  meld(van("IFCRELASSOCIATESDOCUMENT").length === VOLLEDIG.exemplaren.length + 1, "elk document hangt ergens aan, ook het rapport");

  const eigenschap = (naam) => van("IFCPROPERTYSINGLEVALUE").filter((e) => e.rest.startsWith(`'${naam}',`));
  const maat = (naam, maattype) => eigenschap(naam).some((e) => e.rest.includes(`,${maattype}(`));
  meld(maat("f_m_d", "IFCPRESSUREMEASURE"), "N/mm^2 is een spanning");
  meld(maat("E_0", "IFCMODULUSOFELASTICITYMEASURE"), "E is een elasticiteitsmodulus");
  meld(maat("M_Ed", "IFCTORQUEMEASURE"), "kN m is een moment");
  meld(maat("q", "IFCLINEARFORCEMEASURE"), "kN/m is een lijnlast");
  meld(maat("I_y", "IFCMOMENTOFINERTIAMEASURE"), "mm^4 is een traagheidsmoment");
  meld(maat("W_y", "IFCSECTIONMODULUSMEASURE"), "W is een weerstandsmoment");
  meld(maat("A_c", "IFCAREAMEASURE"), "mm^2 is een oppervlak");
  meld(maat("ρ", "IFCMASSDENSITYMEASURE") || eigenschap("\\X2\\03C1\\X0\\").some((e) => e.rest.includes("IFCMASSDENSITYMEASURE(")), "kg/m^3 is een dichtheid");
  meld(maat("UC_buiging", "IFCRATIOMEASURE"), "een unity check is een verhouding");
  const fd = eigenschap("f_m_d")[0];
  meld(/IFCPRESSUREMEASURE\(13\.6\),\$$/.test(fd?.rest ?? ""), "de eenheid van het project staat er niet nog eens bij", fd?.rest);
  const q = eigenschap("q")[0];
  meld(/IFCLINEARFORCEMEASURE\(2\.5\),#\d+$/.test(q?.rest ?? ""), "een andere eenheid wel", q?.rest);

  const sets = van("IFCPROPERTYSET").map((e) => ontsleutel(e.rest));
  meld(sets.length > 0 && sets.every((s) => /'OCSS_[A-Za-z]+(_\d+)?',/.test(s)), "de sets heten OCSS_…");
  meld(sets.some((s) => s.includes("'OCSS_Projectgegevens'")), "de projectgegevens staan in een set");
  meld(van("IFCRELDEFINESBYPROPERTIES").length === sets.length, "elke set via IfcRelDefinesByProperties");
  // Namen in een set zijn uniek; het blad met dubbele namen is het kritieke geval.
  const dubbel = sets.some((s) => {
    const refs = [...s.slice(s.lastIndexOf("(")).matchAll(/#\d+/g)].map((m) => m[0]);
    return new Set(refs).size !== refs.length;
  });
  meld(!dubbel, "geen eigenschap twee keer in een set");

  // STEP en IFCX vertellen hetzelfde.
  const doc = projectIfcx(payloadUit(eerste));
  let missend = [];
  for (const k of doc.data.filter((x) => x.attributes?.["ocss::blad"])) {
    for (const v of k.attributes["ocss::blad::uitkomst"].variabelen) {
      if (v.waarde === undefined) continue;
      const rijen = van("IFCPROPERTYSINGLEVALUE").filter((e) => ontsleutel(e.rest).startsWith(`'${v.naam}',`));
      const getal = String(v.waarde).replace(/e/, "E");
      if (!rijen.some((r) => r.rest.includes(`(${getal}`) || r.rest.includes(`(${getal}.`))) missend.push(v.naam);
    }
  }
  meld(missend.length === 0, "elke uitkomst uit het IFCX staat in de STEP, met hetzelfde getal", missend.slice(0, 5).join(","));
  for (const k of doc.data.filter((x) => x.attributes?.["ocss::element"])) {
    if (!stepTekst.includes(`'${ifcGuid(k.path)}'`)) missend.push(k.path);
  }
  meld(missend.length === 0, "elk element uit het IFCX staat in de STEP, met de GlobalId van zijn pad", missend.slice(0, 3).join(","));
  meld(stepTekst.includes("IFCRELASSIGNSTOGROUP"), "een gekoppeld element hoort bij de groep van zijn blad");

  // Twee bladen aan één element: twee toetssets, geen dubbele naam op het element.
  const tweeStep = projectStep({
    versie: 2, naam: "Twee", gegevens: {}, exemplaren: [
      { id: "a", naam: "A", templateId: "", source: "x = 1", waarden: {}, elementen: [{ id: "el" }] },
      { id: "b", naam: "B", templateId: "", source: "y = 1", waarden: {}, elementen: [{ id: "el" }] },
    ],
  });
  meld(tweeStep.includes("'OCSS_Toetsing'") && tweeStep.includes("'OCSS_Toetsing_2'"), "een element aan twee bladen krijgt twee sets met een eigen naam");

  // Geometrie.
  const geo = bouwProjectStep(MET_GEOMETRIE.doc);
  const ge = leesStep(geo);
  meld(!!ge && ge.every((e) => e.type), "met geometrie: het bestand is te lezen");
  const vs = (t) => ge.filter((e) => e.type === t);
  meld(vs("IFCTRIANGULATEDFACESET").length === 2 && vs("IFCCARTESIANPOINTLIST3D").length === 2, "een mesh wordt een vlakkenset, ook via inherits");
  meld(vs("IFCBEAM").length === 2 && vs("IFCELEMENTASSEMBLY").length === 1, "elementen en samenstelling uit de klassen");
  const balk2 = vs("IFCCARTESIANPOINTLIST3D")[1].rest;
  meld(balk2.includes("(0.,2000.,0.)"), "plaatsing en eenheid: meter in IFCX, millimeter in STEP", balk2.slice(0, 80));
  meld(vs("IFCRELAGGREGATES").some((e) => e.rest.includes(`,${vs("IFCELEMENTASSEMBLY")[0].id},(`)), "de balken zijn delen van de samenstelling");
  const bevatGeo = vs("IFCRELCONTAINEDINSPATIALSTRUCTURE")[0];
  meld(bevatGeo.rest.includes(vs("IFCELEMENTASSEMBLY")[0].id) && !bevatGeo.rest.includes(`${vs("IFCBEAM")[0].id},`), "alleen de samenstelling zit rechtstreeks in de bouwlaag");
  meld(vs("IFCMATERIAL").length === 1 && vs("IFCRELASSOCIATESMATERIAL").length === 1, "het materiaal gaat mee, ook via inherits");
  meld(vs("IFCSHAPEREPRESENTATION").length === 2 && vs("IFCGEOMETRICREPRESENTATIONSUBCONTEXT").length === 1, "vorm in de deelcontext Body");
}

// ── 8. Antwoorden van FEM Studio ─────────────────────────────────────────────
console.log("Antwoorden van FEM Studio:");
{
  const bron = ["# Kolom", "h = ?{4}m", "@toets kolom = check_steel_beam", '  profile_name = "HEA200"', "  length_m = h", "@end", "UC_max = kolom.uc_max"].join("\n");
  const hash = evaluate(parse(bron), {}, {}, { toetsModus: "vragen" }).find((n) => n.type === "toets")?.hash;
  const vast = {
    tool: "check_steel_beam",
    verzoek: { profile_name: "HEA200", length_m: 4, lijst: [1, 2.5, { a: "é" }] },
    uitkomst: { beam_id: 1, uc_max: 0.42, status: "Ok", checks: [], tekst: 'met "aanhalingstekens" en\nregels' },
    datum: "2026-11-07T10:15:00.000Z",
    herkomst: { versie: "2026.44.2", sha256: "0".repeat(64), schema: "s0123456789abcdef" },
  };
  const project = {
    versie: PROJECT_FORMAAT_VERSIE,
    naam: "Toets",
    gegevens: legeGegevens(),
    exemplaren: [{ id: "ex-toets", naam: "Kolom", templateId: "", source: bron, waarden: {}, elementen: [], toetsingen: { [hash]: vast } }],
  };
  const doc = JSON.parse(stil(() => opslaan(project)));
  specOk(doc, "een blad met antwoorden is geldig IFCX");
  const attr = doc.data.find((k) => k.attributes?.["ocss::blad"]?.id === "ex-toets")?.attributes["ocss::blad::toetsing"];
  meld(Array.isArray(attr) && attr.length === 1 && attr[0].hash === hash && attr[0].versie === "2026.44.2" && typeof attr[0].uitkomst === "string", "per hash: tool, datum, herkomst, en verzoek en antwoord als JSON-tekst");
  const terug = leesProjectBestand(JSON.stringify(doc), "x").exemplaren[0];
  meld(isDeepStrictEqual(terug.toetsingen, { [hash]: vast }), "ze komen terug zoals ze waren", verschillen(terug.toetsingen, { [hash]: vast }).slice(0, 3).join(" | "));
  const zonder = JSON.parse(stil(() => opslaan({ ...project, exemplaren: [{ ...project.exemplaren[0], toetsingen: undefined }] })));
  meld(!zonder.data.some((k) => k.attributes?.["ocss::blad::toetsing"]), "een blad zonder antwoorden krijgt geen leeg attribuut");
}

console.log(`\n${aantal - fouten} van de ${aantal} controles in orde.`);
if (fouten > 0) process.exit(1);
