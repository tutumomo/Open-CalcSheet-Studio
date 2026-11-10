/**
 * De ingang voor IFC uit de rekenkern: een of meer doorgerekende bladen als IFCX
 * of als IFC4X3 STEP.
 *
 * Het werk gebeurt in `ifcx/`: `document.ts` bouwt het hele project als geldig
 * IFCX-document (en leest het terug), `step.ts` vertaalt dat document naar STEP.
 * Er is dus één bouwer, en de twee vertellen hetzelfde. Dit bestand geeft
 * daarvoor de korte namen, voor wie alleen bladen heeft en geen heel project.
 *
 * Elk blad staat in het document, ook als er geen element in wordt herkend. De
 * herkenning (`ifcx/herkenning.ts`) levert alleen een element in de ruimtelijke
 * boom op.
 */
import type { EvaluatedNode, VastgelegdeToets } from './types.js';
import { bouwProjectIfcx } from './ifcx/document.js';
import { bouwProjectStep } from './ifcx/step.js';
import type { IfcxBestand, IfcxKnoop } from './ifcx/typen.js';
import type { BladOordeel } from './ifcx/uitkomst.js';

export interface IfcGenerationOptions {
  /** Projecttitel. Zonder: de kop van het blad, of "Project". */
  projectName?: string;
  /** Voor `header.author` en FILE_NAME. */
  author?: string;
  /** Voor FILE_NAME en IfcOrganization. */
  organization?: string;
  /** Tijdstip (ISO 8601). Zonder: nu. */
  timestamp?: string;
}

/** Een compleet IFCX-document. */
export type IfcxDocument = IfcxBestand;

/**
 * Verwijzing naar een element in een bestaand model waar een rekenblad over
 * gaat. Leeg laten betekent: deze berekening staat op zichzelf.
 *
 * De koppeling wordt bewust nooit geraden. Welk element een toetsing beschrijft
 * weet alleen de constructeur — de herkenning ziet hoogstens het sóórt element,
 * en zit er soms naast.
 */
export interface ElementRef {
  /** IFC GlobalId of IFCX-pad van het element in het bronmodel. */
  id: string;
  /** Naam zoals het element in het bronmodel heet, puur ter herkenning. */
  naam?: string;
}

/** Eén rekenblad zoals het meedoet in een projectexport. */
export interface IfcCalcSheet {
  /** Naam van het exemplaar in de projectboom. */
  naam: string;
  nodes: EvaluatedNode[];
  /** Elementen in het bronmodel waar dit blad over gaat; leeg = losstaand. */
  elementen?: ElementRef[];
  /**
   * Geometrie van dit blad als IFCX-knopen. Ze komen onder de bouwlaag in het
   * projectdocument, en in de STEP voor zover dat kan: een knoop met
   * `bsi::ifc::class` wordt een element, `usd::usdgeom::mesh` zijn vorm. De
   * paden moeten uniek zijn binnen het document.
   */
  geometrie?: IfcxKnoop[];

  // De rest hoort bij het projectbestand; een losse export kan zonder.
  /** De id van het blad in het project; bepaalt het pad in het IFCX. */
  id?: string;
  templateId?: string;
  /** De naam van de module, ter informatie voor een andere lezer. */
  module?: string;
  bronVersie?: string;
  /** Het kenmerk voor verwijzingen uit andere bladen (#1.R_paal). */
  ref?: string;
  /** De rekentekst. */
  source?: string;
  /** De invoer, per variabelenaam. */
  waarden?: Record<string, string>;
  /** Bij een PDF-blad: het bestand, als base64. */
  pdf?: { bestandsnaam: string; data: string; aantekeningen?: unknown[]; opPapier?: boolean };
  /** Bij een spreadsheet-blad: de werkmap, als base64. */
  xlsx?: { bestandsnaam: string; data: string };
  /** Bij een Markdown-blad: de tekst, met de afbeeldingen die erbij horen. */
  md?: { bestandsnaam: string; tekst: string; beelden?: Record<string, string>; koppenUit?: boolean };
  /** Bij een grafblad: de graaf. */
  graaf?: GraafGegevens;
  /** Alleen bij een tekenblad: het vel met zijn views (ocss::blad::tekenvel). */
  tekenvel?: Record<string, unknown>;
  /** Bij een Jupyter-blad: de werkmap als ZIP, in base64. */
  jupyter?: { bestandsnaam: string; data: string; metCode: boolean; automatisch?: boolean };
  /** Bij een Marimo-blad: het notebook als tekst, en de laatste uitvoer per cel. */
  marimo?: { bestandsnaam: string; code: string; metCode: boolean; uitvoer: string[] };
  /** De antwoorden van Open FEM Studio op de @toets-blokken, per hash van de invoer. */
  toetsingen?: Record<string, VastgelegdeToets>;
  /** Het oordeel zoals de app het leest; zonder beslist de maatgevende UC. */
  resultaat?: BladOordeel;
  /** Waarom het blad niet doorgerekend kon worden. */
  fout?: string;
}

/** De graaf van een grafblad, zoals hij in een project staat: nodes en verbindingen, geen uitkomsten. */
export interface GraafGegevens {
  versie: number;
  nodes: {
    id: string;
    soort: string;
    x: number;
    y: number;
    naam?: string;
    invoer?: Record<string, string>;
    geheel?: string[];
  }[];
  verbindingen: { vanNode: string; vanPoort: string; naarNode: string; naarPoort: string }[];
}

export interface IfcGenerationResult {
  ifcx: IfcxDocument;
  step: string;
}

/** De kop van een blad, voor de naam als er geen projectnaam is. */
function kopVan(nodes: EvaluatedNode[]): string | undefined {
  for (const n of nodes) {
    if (n.type === 'heading' && n.level === 1 && n.text) return n.text;
  }
  return undefined;
}

/** Bladen als één IFCX-document, zonder de rest van een project. */
export function generateProjectIfcx(sheets: IfcCalcSheet[], options: IfcGenerationOptions = {}): IfcxDocument {
  return bouwProjectIfcx({ naam: options.projectName || 'Project', bladen: sheets }, options);
}

/** Bladen als IFC4X3 STEP, uit hetzelfde document. */
export function generateProjectIfc4x3Step(sheets: IfcCalcSheet[], options: IfcGenerationOptions = {}): string {
  return bouwProjectStep(generateProjectIfcx(sheets, options), options);
}

/** Eén doorgerekend blad als IFCX-document. */
export function generateIfcx(nodes: EvaluatedNode[], options: IfcGenerationOptions = {}): IfcxDocument {
  const naam = options.projectName || kopVan(nodes) || 'Berekening';
  return generateProjectIfcx([{ naam: kopVan(nodes) || naam, nodes }], { ...options, projectName: naam });
}

/** Eén doorgerekend blad als IFC4X3 STEP. */
export function generateIfc4x3Step(nodes: EvaluatedNode[], options: IfcGenerationOptions = {}): string {
  return bouwProjectStep(generateIfcx(nodes, options), options);
}
