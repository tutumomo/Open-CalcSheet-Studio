/**
 * Een verzonnen project met alle bladsoorten door elkaar, voor de controle van
 * het overkoepelende rapport (scripts/check-rapport-pdf.mjs).
 *
 * Elke soort staat er twee keer in, een keer in het hoofdstuk en een keer in de
 * bijlage, zodat beide wegen op papier komen:
 *   • een los rekenblad met varianten op papier, en een module (balklaag, ligger);
 *   • een PDF met pagina's van verschillende maten en standen (A4 staand, A4
 *     liggend, A3 liggend, A1 staand), en een van één pagina;
 *   • een werkmap die over meerdere vellen loopt, en een korte;
 *   • Markdown met koppen, lijsten, tabellen, code en afbeeldingen, en een
 *     tekst die over meerdere vellen loopt;
 *   • een canvas-blad, een grafblad, een tekenblad, een Jupyter-blad en een Marimo-blad.
 *
 * Alles is fictief. De PDF en de werkmap worden hier gemaakt, zodat er geen
 * bestanden van buiten in de repo hoeven.
 */
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync } from "node:zlib";
import { bouwProjectBestand, PROJECT_FORMAAT_VERSIE } from "../../packages/desktop/src/store/projectBestand.ts";
import { bladenVoorIfc } from "../../packages/desktop/src/store/projectIfcx.ts";
import { legeGegevens } from "../../packages/desktop/src/store/projectGegevens.ts";
import { LEGE_WERKMAP } from "../../packages/desktop/src/store/spreadsheetBlad.ts";
import { standaardRapport } from "../../packages/desktop/src/rapport/model.ts";
import { standaardTeksten } from "../../packages/desktop/src/rapport/standaardteksten.ts";
import { balklaag } from "../../packages/desktop/src/templates/balklaag.ts";
import { ligger } from "../../packages/desktop/src/templates/ligger.ts";
import { CANVAS_BLAD, schrijfEenheden } from "../../packages/desktop/src/store/canvasBlad.ts";
import { GRAAF_BLAD } from "../../packages/desktop/src/store/graafBlad.ts";
import { TEKEN_BLAD } from "../../packages/desktop/src/store/tekenBlad.ts";
import { JUPYTER_BLAD, pakWerkmapIn } from "../../packages/desktop/src/store/jupyterBlad.ts";
import { MARIMO_BLAD } from "../../packages/desktop/src/store/marimoBlad.ts";
import { legeGraaf, verbind, voegNodeToe, zetInvoer, zetNodeNaam } from "../../packages/desktop/src/graaf/model.ts";

const hier = dirname(fileURLToPath(import.meta.url));
const XLSX_DIST = join(hier, "../../node_modules/@betteroffice/xlsx/dist");

/** De bladen van het project, met de plek die ze in het rapport hebben. */
export const BLADEN = {
  rekenblad: { id: "ex-rekenblad", naam: "Kolom K1" },
  balklaag: { id: "ex-balklaag", naam: "Balklaag verdiepingsvloer" },
  ligger: { id: "ex-ligger", naam: "Ligger dakrand", inHoofdstuk: true },
  pdf: { id: "ex-pdf", naam: "Raamwerk uit FEM-model" },
  pdfKort: { id: "ex-pdf-kort", naam: "Leverancier kanaalplaat", inHoofdstuk: true },
  werkmap: { id: "ex-xlsx", naam: "Staaflijst" },
  werkmapKort: { id: "ex-xlsx-kort", naam: "Hoeveelheden", inHoofdstuk: true },
  notitie: { id: "ex-md", naam: "Uitgangspunten fundering", inHoofdstuk: true },
  logboek: { id: "ex-md-lang", naam: "Logboek", inHoofdstuk: false },
  canvas: { id: "ex-canvas", naam: "Ligger op canvas" },
  graaf: { id: "ex-graaf", naam: "Momenten als graaf" },
  tekenblad: { id: "ex-teken", naam: "Plattegrond begane grond" },
  jupyter: { id: "ex-jupyter", naam: "Notebook hoeveelheden" },
  marimo: { id: "ex-marimo", naam: "Notebook met schuiven" },
};

/** Wat er van elk van deze bladen op zijn eigen pagina in de PDF hoort te staan. */
export const KENMERKEN = {
  canvas: "Canvasregel van het proefblad",
  graaf: "Totaal moment",
  tekenblad: "Proefview begane grond",
  jupyter: "Notebookregel van het proefblad",
  marimo: "Marimoregel van het proefblad",
  // De kop van een variant in de tabel onder het blad (VariantenAfdruk.tsx).
  rekenblad: "Proefvariant zwaar",
};

/** Een klein grafblad: twee getallen opgeteld in een codeblok, en de uitkomst bekeken. */
function maakGraaf() {
  let g = legeGraaf();
  const voeg = (soort, x, y) => {
    const r = voegNodeToe(g, soort, x, y);
    g = r.graaf;
    return r.id;
  };
  const a = voeg("getal", 0, 0);
  const c = voeg("codeblok", 300, 0);
  const v = voeg("bekijken", 600, 0);
  g = zetInvoer(g, a, "waarde", "6");
  g = zetInvoer(g, c, "code", "M = a*2");
  g = verbind(g, { vanNode: a, vanPoort: "waarde", naarNode: c, naarPoort: "a" });
  g = verbind(g, { vanNode: c, vanPoort: "M", naarNode: v, naarPoort: "waarde" });
  return zetNodeNaam(g, v, KENMERKEN.graaf);
}

/** Een werkmap met één notebook: een tekstcel, een codecel en zijn opgeslagen uitvoer. */
function maakJupyterWerkmap() {
  const notebook = {
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {},
    cells: [
      { cell_type: "markdown", id: "tekst", metadata: {}, source: [KENMERKEN.jupyter] },
      {
        cell_type: "code", id: "code", metadata: {}, execution_count: 1, source: ["print(6 * 7)"],
        outputs: [{ output_type: "stream", name: "stdout", text: ["42\n"] }],
      },
    ],
  };
  const zip = pakWerkmapIn([{ pad: "notebook.ipynb", bytes: new TextEncoder().encode(JSON.stringify(notebook)) }]);
  return Buffer.from(zip).toString("base64");
}

/** Een klein Marimo-notebook met zijn opgeslagen uitvoer. */
function maakMarimoNotebook() {
  return {
    bestandsnaam: "",
    metCode: true,
    code: 'import marimo\n\napp = marimo.App()\n\n\n@app.cell\ndef _():\n    import marimo as mo\n    return (mo,)\n\n\n@app.cell\ndef _(mo):\n    mo.md("x")\n    return\n',
    uitvoer: ["", `<p>${KENMERKEN.marimo}</p>`],
  };
}

/** De koppen die uit de Markdown-bladen in de inhoudsopgave horen te komen. */
export const MARKDOWN_KOPPEN = {
  notitie: ["Grondslag", "Aanpak"],
  logboek: ["Lijst", "Tabel", "Code", "Lange alinea"],
};

/** Zoveel regels staan er in het lange blad: per soort blok meer dan op een vel past. */
export const LANG = { lijst: 70, tabel: 70, code: 90, zinnen: 120 };

/** Pagina's van het PDF-blad, in punten: de maten waar de nummering mee om moet kunnen. */
export const PDF_PAGINAS = [
  { breedte: 595.28, hoogte: 841.89, tekst: "A4 staand" },
  { breedte: 841.89, hoogte: 595.28, tekst: "A4 liggend" },
  { breedte: 1190.55, hoogte: 841.89, tekst: "A3 liggend" },
  { breedte: 1683.78, hoogte: 2383.94, tekst: "A1 staand" },
];

/** Een PDF zonder afhankelijkheden: per pagina een rand en een regel tekst. */
export function maakPdf(paginas) {
  const objecten = [];
  const voeg = (inhoud) => objecten.push(inhoud) && objecten.length;
  const catalogus = voeg("<< /Type /Catalog /Pages 2 0 R >>");
  voeg("");
  const lettertype = voeg("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kinderen = paginas.map(({ breedte, hoogte, tekst }) => {
    const b = breedte.toFixed(2);
    const h = hoogte.toFixed(2);
    const grootte = Math.round(breedte / 12);
    const stroom = `2 w 20 20 ${(breedte - 40).toFixed(2)} ${(hoogte - 40).toFixed(2)} re S ` +
      `BT /F1 ${grootte} Tf 60 ${(hoogte / 2).toFixed(2)} Td (${tekst}) Tj ET`;
    const inhoud = voeg(`<< /Length ${stroom.length} >>\nstream\n${stroom}\nendstream`);
    return voeg(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${b} ${h}] /Contents ${inhoud} 0 R /Resources << /Font << /F1 ${lettertype} 0 R >> >> >>`);
  });
  objecten[1] = `<< /Type /Pages /Kids [${kinderen.map((k) => `${k} 0 R`).join(" ")}] /Count ${kinderen.length} >>`;

  let uit = "%PDF-1.4\n";
  const plekken = objecten.map((inhoud, i) => {
    const plek = uit.length;
    uit += `${i + 1} 0 obj\n${inhoud}\nendobj\n`;
    return plek;
  });
  const xref = uit.length;
  uit += `xref\n0 ${objecten.length + 1}\n0000000000 65535 f \n`;
  for (const p of plekken) uit += `${String(p).padStart(10, "0")} 00000 n \n`;
  uit += `trailer\n<< /Size ${objecten.length + 1} /Root ${catalogus} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(uit, "latin1");
}

/** Een effen PNG als data-URL, zonder afhankelijkheden. */
function maakPng(breedte, hoogte) {
  const crcTabel = Array.from({ length: 256 }, (_, n) => {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    return c >>> 0;
  });
  const crc = (b) => {
    let c = 0xffffffff;
    for (const x of b) c = crcTabel[(c ^ x) & 0xff] ^ (c >>> 8);
    return (c ^ 0xffffffff) >>> 0;
  };
  const stuk = (soort, data) => {
    const inhoud = Buffer.concat([Buffer.from(soort, "latin1"), data]);
    const lengte = Buffer.alloc(4);
    lengte.writeUInt32BE(data.length);
    const som = Buffer.alloc(4);
    som.writeUInt32BE(crc(inhoud));
    return Buffer.concat([lengte, inhoud, som]);
  };
  const kop = Buffer.alloc(13);
  kop.writeUInt32BE(breedte, 0);
  kop.writeUInt32BE(hoogte, 4);
  kop[8] = 8; // 8 bits
  kop[9] = 2; // RGB
  const rij = Buffer.concat([Buffer.from([0]), Buffer.alloc(breedte * 3, 0xc8)]);
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    stuk("IHDR", kop),
    stuk("IDAT", deflateSync(Buffer.concat(Array.from({ length: hoogte }, () => rij)))),
    stuk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

/** Een korte notitie met van alles wat er op papier moet kunnen staan. */
export function notitieTekst() {
  return [
    "# Uitgangspunten fundering",
    "",
    "De fundering is uitgewerkt op basis van een **verzonnen** sondering, met *cursieve* tekst en `code`.",
    "",
    "## Grondslag",
    "",
    "- Sondering S1, tot NAP -20 m",
    "- Grondwaterstand NAP -1,5 m",
    "  - gemeten in de peilbuis",
    "",
    "1. Eerst de sondering",
    "2. Dan de draagkracht",
    "",
    "| Laag | Dikte (m) | Soort |",
    "|---|--:|---|",
    "| 1 | 2,0 | Klei |",
    "| 2 | 8,5 | Zand |",
    "",
    "## Aanpak",
    "",
    "> De palen staan op de zandlaag.",
    "",
    "```",
    "Rc;d = 1200 kN",
    "Fs;d = 1000 kN",
    "```",
    "",
    `![Proefbeeld](${maakPng(240, 120)})`,
    "",
    "![Van buiten](https://voorbeeld.invalid/foto.png)",
    "",
    "![Naast het bestand](foto/ontbreekt.png)",
    "",
    "<script>window.__markdownScript = true</script>",
    "",
  ].join("\n");
}

/** Een tekst waarvan elk soort blok langer is dan een vel: niets mag eraf vallen. */
export function logboekTekst() {
  const reeks = (n, f) => Array.from({ length: n }, (_, i) => f(i + 1));
  return [
    "# Lijst",
    "",
    ...reeks(LANG.lijst, (i) => `${i}. Lijstregel ${i}`),
    "",
    "# Tabel",
    "",
    "| Nr | Omschrijving | Waarde |",
    "|---|---|--:|",
    ...reeks(LANG.tabel, (i) => `| ${i} | Tabelregel ${i} | ${i * 3} |`),
    "",
    "# Code",
    "",
    "```",
    ...reeks(LANG.code, (i) => `Coderegel ${i}`),
    "```",
    "",
    "# Lange alinea",
    "",
    reeks(LANG.zinnen, (i) => `Dit is zin nummer ${i} van een alinea die veel langer is dan een heel vel.`).join(" ") +
      " Einde van de alinea.",
    "",
  ].join("\n");
}

/** Een werkmap met `rijen` rijen staven: 6 m lang, oplopend genummerd. */
export async function maakWerkmap(rijen, staaf = "Staaf") {
  const { initWasm, openWorkbook } = await import(new URL(`file:///${XLSX_DIST.replace(/\\/g, "/")}/index.js`).href);
  await initWasm(readFileSync(join(XLSX_DIST, "generated/xlsx_wasm_bg.wasm")));
  const wb = openWorkbook(new Uint8Array(Buffer.from(LEGE_WERKMAP, "base64")));
  try {
    [staaf, "L (m)", "A (mm2)", "G (kg)"].forEach((w, k) => wb.editCell(0, 0, k, w));
    for (let i = 1; i <= rijen; i++) {
      wb.editCell(0, i, 0, `${staaf} ${i}`);
      wb.editCell(0, i, 1, "6");
      wb.editCell(0, i, 2, String(1000 + i));
      wb.editCell(0, i, 3, `=B${i + 1}*C${i + 1}*7850/1000000`);
    }
    return Buffer.from(wb.save()).toString("base64");
  } finally {
    wb.dispose();
  }
}

/**
 * Het project als inhoud van een projectbestand.
 */
export async function bouwGemengdProject() {
  const gegevens = {
    ...legeGegevens(),
    project_nummer: "2026-002",
    project_naam: "Gemengd voorbeeldproject",
    opdrachtgever: "Voorbeeldopdrachtgever B.V.",
    constructeur: "Ir. A. Voorbeeld",
    locatie: "Voorbeeldstad",
    CC: "2",
    RC: "2",
    DesignLife: "50",
    windgebied: "2",
    terreincategorie: "3",
  };
  const b = BLADEN;
  const kale = { source: "", waarden: {}, elementen: [] };
  const exemplaren = [
    {
      ...b.rekenblad, templateId: "", waarden: {}, elementen: [],
      source: "\"Kolom K1\n'Eenvoudige toets van de normaalkracht\nF = ?{120}*(kN)\nA = 6000*mm^2\nfy = 235*N/mm^2\nN_Rd = A*fy\nUC = F/N_Rd\n",
      varianten: {
        velden: ["F"],
        uitkomsten: ["N_Rd"],
        opPapier: true,
        lijst: [
          { id: "var-licht", naam: "V1", waarden: { F: "90" } },
          { id: "var-zwaar", naam: KENMERKEN.rekenblad, waarden: { F: "180" } },
        ],
      },
    },
    { ...b.balklaag, templateId: "balklaag", source: balklaag, waarden: {}, elementen: [] },
    { ...b.ligger, templateId: "ligger", source: ligger, waarden: {}, elementen: [] },
    { ...b.pdf, ...kale, templateId: "pdf", pdf: { bestandsnaam: "raamwerk.pdf", data: maakPdf(PDF_PAGINAS).toString("base64") } },
    { ...b.pdfKort, ...kale, templateId: "pdf", pdf: { bestandsnaam: "kanaalplaat.pdf", data: maakPdf(PDF_PAGINAS.slice(0, 1)).toString("base64") } },
    { ...b.werkmap, ...kale, templateId: "spreadsheet", xlsx: { bestandsnaam: "staaflijst.xlsx", data: await maakWerkmap(150) } },
    { ...b.werkmapKort, ...kale, templateId: "spreadsheet", xlsx: { bestandsnaam: "hoeveelheden.xlsx", data: await maakWerkmap(5) } },
    { ...b.notitie, ...kale, templateId: "markdown", md: { bestandsnaam: "fundering.md", tekst: notitieTekst() } },
    { ...b.logboek, ...kale, templateId: "markdown", md: { bestandsnaam: "", tekst: logboekTekst() } },
    {
      ...b.canvas, templateId: CANVAS_BLAD, waarden: {}, elementen: [],
      source: schrijfEenheden([
        { id: "e1", x: 10, y: 15, tekst: `'${KENMERKEN.canvas}` },
        { id: "e2", x: 10, y: 40, tekst: "L = 6*m" },
        { id: "e3", x: 90, y: 40, tekst: "M = 8*kN/m*L^2/8" },
      ]),
    },
    { ...b.graaf, ...kale, templateId: GRAAF_BLAD, graaf: maakGraaf() },
    {
      ...b.tekenblad, ...kale, templateId: TEKEN_BLAD,
      tekenvel: {
        formaat: "A4",
        ligging: "staand",
        views: [{ id: "v1", titel: KENMERKEN.tekenblad, x: 20, y: 20, breedte: 170, hoogte: 120, schaal: 50, x0: 0, y0: 0, elementen: [] }],
      },
    },
    { ...b.jupyter, ...kale, templateId: JUPYTER_BLAD, jupyter: { bestandsnaam: "", data: maakJupyterWerkmap(), metCode: true } },
    { ...b.marimo, ...kale, templateId: MARIMO_BLAD, marimo: maakMarimoNotebook() },
  ];

  const rapport = standaardRapport("01-09-2026", standaardTeksten("nl"), "nl");
  rapport.kenmerk = "VB-2026-002";
  rapport.fase = "DO";
  rapport.verantwoordelijk = "Ir. A. Voorbeeld";
  rapport.uitvoerend = "Ing. B. Voorbeeld";
  rapport.teksten = {
    ...rapport.teksten,
    projectomschrijving: "Het project {projectnaam} is een verzonnen project met alle bladsoorten door elkaar.",
    wijziging: "Houten balklagen op dragende wanden.",
  };
  rapport.bijlagen = ["Constructieoverzicht"];
  rapport.inHoofdstuk = Object.fromEntries(exemplaren.filter((e) => e.inHoofdstuk !== undefined).map((e) => [e.id, e.inHoofdstuk]));
  rapport.toelichting = { [b.pdf.id]: "Het raamwerk is doorgerekend in een extern FEM-model." };
  rapport.bureau = {
    ...rapport.bureau,
    naam: "Voorbeeldbureau B.V.",
    plaats: "Voorbeeldstad",
  };

  const project = {
    versie: PROJECT_FORMAAT_VERSIE,
    naam: gegevens.project_naam,
    gegevens,
    exemplaren: exemplaren.map(({ inHoofdstuk: _, ...e }) => e),
    rapport,
  };
  return bouwProjectBestand(project, bladenVoorIfc(project));
}
