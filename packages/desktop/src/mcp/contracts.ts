/**
 * Contracten van de API-laag (MCP en REST): wat een tool is, wat hij
 * teruggeeft en met welke omgeving hij werkt.
 *
 * Eén registry (tools.ts): elke tool is tegelijk een MCP-tool en, via `rest`,
 * een of meer REST-routes. Beide kanalen lopen door dezelfde uitvoering
 * (uitvoeren.ts), zodat ze niet uit elkaar kunnen lopen.
 *
 * De tools werken niet rechtstreeks op de stores maar op een `McpOmgeving`.
 * In de app is dat een dunne laag over de stores en de Tauri-plugins
 * (omgeving.ts); in de controle (scripts/check-mcp.mjs, check-api.mjs) een
 * nagebouwde omgeving in het geheugen. Zo is de hele protocol- en toollaag
 * zonder webview en zonder Tauri te toetsen.
 *
 * Dit bestand en de andere kernbestanden importeren met `.ts`-extensie en
 * zonder React of stores, zodat Node ze rechtstreeks kan laden.
 */
import type { TekenVel } from "../store/tekenBlad.ts";

import type { Graaf } from "../graaf/model.ts";

/** Het PDF-bestand van een PDF-blad (zie store/pdfBijlage.ts). */
export interface McpPdf {
  bestandsnaam: string;
  /** Base64, zonder `data:`-voorvoegsel. */
  data: string;
}

/** Een Markdown-blad zoals de tools het doorgeven (zie store/markdownBlad.ts). */
export interface McpMarkdown {
  bestandsnaam: string;
  tekst: string;
  koppenUit?: boolean;
}

/** Een Marimo-notebook zonder de bewaarde uitvoer; die vult de app zelf. */
export interface McpMarimo {
  bestandsnaam: string;
  code: string;
  metCode: boolean;
  uitvoer?: string[];
}

/** Eén blad zoals de tools het zien; een uittreksel van `Exemplaar`. */
export interface McpBlad {
  id: string;
  naam: string;
  templateId: string;
  source: string;
  waarden: Record<string, string>;
  pdf?: McpPdf;
  xlsx?: McpPdf;
  md?: McpMarkdown;
  graaf?: Graaf;
  tekenvel?: TekenVel;
  jupyter?: McpPdf & { metCode: boolean; automatisch?: boolean };
  marimo?: { bestandsnaam: string; code: string; metCode: boolean; uitvoer: string[] };
}

/** De stand van het project op één moment. */
export interface McpProjectStand {
  projectNaam: string;
  bestandspad: string | null;
  gegevens: Record<string, string>;
  exemplaren: McpBlad[];
  /** Een blad-id, of de id van het projectgegevensformulier of het rapport. */
  activeId: string;
  /** Niet opgeslagen wijzigingen. */
  dirty: boolean;
  /** Uit de projectboom gehaald. */
  verborgen: { gegevens?: boolean; rapport?: boolean };
  /** Het constructierapport (rapport/model.ts). */
  rapport: unknown;
  /** Aantal stappen voor ongedaan maken en opnieuw. */
  stappenTerug: number;
  stappenVooruit: number;
}

/** De weergave van een geopend blad. */
export type McpWeergave = "code-visual" | "code-output" | "visual-output" | "print-preview" | "ifc";

export interface McpEenheden {
  angleMode: "deg" | "rad" | "gra";
  defaultLength: "mm" | "cm" | "m";
  defaultForce: "N" | "kN" | "MN";
  defaultStress: "Pa" | "kPa" | "MPa" | "GPa" | "N/mm^2";
  returnAngleUnits: boolean;
  /**
   * Het eenhedenstelsel voor een nieuw project (Instellingen, tab Units). Het stelsel van een
   * open project is het projectgegeven `eenheden` (project_data_set).
   */
  stelsel?: "blad" | "si-mm" | "si-m" | "us" | "tw-mks" | "eigen";
}

export interface McpInstellingen {
  theme: string;
  language: string;
  textSize: string;
  units: McpEenheden;
}

/** Een module in de online modulebibliotheek (store/moduleBibliotheek.ts). */
export interface McpBibliotheekModule {
  id: string;
  versie: string;
  naam: { nl: string; en: string };
  omschrijving?: { nl: string; en: string };
  categorie?: string;
  status?: string;
  gepubliceerd?: boolean;
  normen?: string[];
  minimaleAppVersie?: string;
}

/**
 * Wat de tools van de app nodig hebben. Elke mutatie van het project loopt
 * via een bestaande store-actie, zodat ongedaan maken en "niet opgeslagen"
 * vanzelf kloppen.
 */
export interface McpOmgeving {
  stand(): McpProjectStand;
  /** De moduletekst bij een templateId, of niets. */
  sjabloon(templateId: string): string | undefined;
  /** De naam van een module in de taal van de app, of null. */
  moduleNaam(templateId: string): string | null;
  /** De naam van een groep in de catalogus, in de taal van de app. */
  groepNaam(id: string, label: string): string;
  /** De vaste ids van de niet-bladen in de projectboom. */
  speciaal: { project: string; rapport: string };
  acties: {
    /** Voegt een blad toe en selecteert het; geeft de nieuwe id. */
    voegToe(templateId: string, basisNaam: string, source: string): string;
    voegPdfToe(naam: string, pdf: McpPdf): string;
    zetPdf(id: string, pdf: McpPdf): void;
    /** Een spreadsheet-blad (XLSX als base64) achteraan; geeft de nieuwe id. */
    voegSpreadsheetToe(naam: string, xlsx: McpPdf): string;
    zetSpreadsheet(id: string, xlsx: McpPdf): void;
    voegMarkdownToe(naam: string, md: McpMarkdown): string;
    zetMarkdown(id: string, md: McpMarkdown): void;
    /** Een leeg canvas-blad achteraan; geeft de nieuwe id. */
    voegCanvasToe(naam: string): string;
    /** Een leeg grafblad achteraan; geeft de nieuwe id. */
    voegGraafToe(naam: string): string;
    zetGraaf(id: string, graaf: Graaf): void;
    voegTekenbladToe(naam: string, tekenvel: TekenVel): string;
    zetTekenVel(id: string, tekenvel: TekenVel): void;
    voegJupyterToe(naam: string, jupyter: McpPdf & { metCode: boolean; automatisch?: boolean }): string;
    zetJupyter(id: string, jupyter: McpPdf & { metCode: boolean; automatisch?: boolean }): void;
    voegMarimoToe(naam: string, marimo: McpMarimo): string;
    zetMarimo(id: string, marimo: McpMarimo): void;
    dupliceer(id: string): string | null;
    verplaats(id: string, richting: -1 | 1): void;
    hernoem(id: string, naam: string): void;
    verwijder(id: string): void;
    selecteer(id: string): void;
    zetBron(id: string, source: string): void;
    zetWaarde(id: string, naam: string, waarde: string): void;
    zetGegeven(naam: string, waarde: string): void;
    zetProjectNaam(naam: string): void;
    zetVerborgen(onderdeel: "gegevens" | "rapport", verborgen: boolean): void;
    /** Eén tekst- of vinkveld van het rapport (zetRapportVeld). */
    zetRapportVeld(pad: string, waarde: string | boolean): void;
    /** Een heel stuk rapport (lijst, object); de app maakt het daarna weer geldig. */
    zetRapportDeel(pad: string, waarde: unknown): void;
    ongedaan(): void;
    opnieuw(): void;
  };
  /** Bestanden op schijf; alleen in de desktop-app. */
  bestanden: {
    beschikbaar(): boolean;
    nieuwProject(): void;
    /**
     * Een wegwerpwerkblad: het open project gaat opzij (naam, pad, bladen,
     * rapport, geschiedenis en de vlag "niet opgeslagen") en er komt een leeg
     * project. Wat de tools daarna doen, raakt het echte project niet en komt
     * niet in de recente bestanden. Geeft `false` als er al zo'n werkblad is.
     */
    beginSessie(): boolean;
    /** Het wegwerpwerkblad weg en het oude project terug. `false` als er niets opzij stond. */
    eindigSessie(): boolean;
    /** Of er nu een wegwerpwerkblad open is. */
    sessieActief(): boolean;
    /** Leest een projectbestand, laadt het en zet het bij de recente bestanden. */
    openProject(pad: string): Promise<void>;
    /** Schrijft het project naar `pad` (zelfde inhoud als Opslaan in de app) en markeert het als opgeslagen. */
    bewaarProject(pad: string): Promise<void>;
    recent(): Promise<{ path: string; name: string; timestamp: number }[]>;
    /** De inhoud van een bestand als base64. */
    leesBase64(pad: string): Promise<string>;
    schrijfTekst(pad: string, tekst: string): Promise<void>;
  };
  bibliotheek: {
    catalogus(vernieuw: boolean): Promise<{ modules: McpBibliotheekModule[]; fout: string | null }>;
    geinstalleerd(): Record<string, McpBibliotheekModule>;
    /** Installeert een module uit de catalogus; geeft een foutmelding of null. */
    installeer(id: string): Promise<string | null>;
    verwijder(id: string): void;
  };
  instellingen: {
    lees(): Promise<McpInstellingen>;
    zet(wijziging: Partial<McpInstellingen>): Promise<McpInstellingen>;
  };
  weergave: {
    /** De weergave van de werkruimte, of null als de app (nog) niet getekend is. */
    huidige(): { weergave: McpWeergave; voorbeeld: "sheets" | "report" | null } | null;
    /** Kiest een weergave; geeft een foutmelding of null. */
    kies(weergave: McpWeergave): string | null;
  };
  afdruk: {
    /** Start het afdrukken in de app: de printdialoog van het systeem gaat open. */
    start(soort: "bladen" | "rapport", selectie: string[] | null): void;
    /**
     * Een PDF via de rapportengine (alleen in een build met die engine; zonder
     * tekeningen). Werpt `McpFout("NOT_AVAILABLE")` als de build hem niet heeft.
     */
    pdfViaEngine(ids: string[], pad: string): Promise<number>;
  };
  /**
   * Een Jupyter- of Marimo-blad laten draaien (sheet_run): het blad gaat open, alle
   * cellen draaien en de uitvoer komt in het project. Alleen in de desktop-app.
   */
  notebooks?: {
    voerUit(id: string, tijdMs: number): Promise<{ klaar: boolean; melding?: string }>;
  };
}

/** De vlaggen die de gebruiker in Instellingen zet, per request vers gelezen, en wat de server van zichzelf weet. */
export interface McpContext {
  omgeving: McpOmgeving;
  alleenLezen: boolean;
  gepauzeerd: boolean;
  server: { naam: string; versie: string; poort: number };
}

export type McpFoutCode =
  | "VALIDATION"
  | "NOT_FOUND"
  | "CONFLICT"
  | "READ_ONLY"
  | "PAUSED"
  | "CALC_ERROR"
  | "UNIT_WARNING"
  | "NOT_AVAILABLE"
  | "INTERNAL";

/** Een fout die een tool of de omgeving gooit, met de code die de client krijgt. */
export class McpFout extends Error {
  code: McpFoutCode;
  constructor(code: McpFoutCode, message: string) {
    super(message);
    this.code = code;
  }
}

export type McpToolResultaat =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; code: McpFoutCode; error: string; data?: Record<string, unknown> };

export interface McpToolAnnotaties {
  readOnlyHint: boolean;
  destructiveHint: boolean;
  idempotentHint: boolean;
  openWorldHint: boolean;
}

/** Een eenvoudig JSON-schema: precies wat de schemacontrole zelf afdwingt. */
export interface JsonSchema {
  type?: string | string[];
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean | JsonSchema;
  items?: JsonSchema;
  enum?: unknown[];
  minLength?: number;
  minimum?: number;
  maximum?: number;
  default?: unknown;
}

export type HttpMethode = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

/** Een REST-route van een tool. `{naam}` in het pad is een argument van de tool. */
export interface McpRestRoute {
  method: HttpMethode;
  path: string;
  /** Status bij succes; standaard 200 (201 bij iets nieuws). */
  status?: number;
}

export interface McpToolDef {
  name: string;
  /** Engels: de AI-client kiest zijn tool op deze tekst en vertaalt zelf. */
  description: string;
  /**
   * `read` leest alleen; `mutate` wijzigt het project of de app; `file`
   * schrijft een bestand (beide geblokkeerd in de alleen-lezenstand); `ui`
   * verandert alleen wat er in beeld staat.
   */
  kind: "read" | "mutate" | "file" | "ui";
  inputSchema: JsonSchema;
  annotations: McpToolAnnotaties;
  /** De REST-routes van deze tool, onder /api/v1. */
  rest?: McpRestRoute[];
  handler: (args: Record<string, unknown>, ctx: McpContext) => McpToolResultaat | Promise<McpToolResultaat>;
}
