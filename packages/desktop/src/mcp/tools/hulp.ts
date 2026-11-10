/**
 * Gedeelde hulpjes voor de tools: resultaten, schema's, bladen zoeken,
 * invoervelden lezen en de uitkomsten die de server al kent.
 */
import type { JsonSchema, McpBlad, McpContext, McpFoutCode, McpProjectStand, McpToolAnnotaties, McpToolResultaat } from "../contracts.ts";
import { projectScope } from "../../store/projectGegevens.ts";
import { invoervelden, type Invoerveld } from "../../components/calc/bladVersie.ts";
import type { Resultaat } from "../../components/calc/bladLezen.ts";
import { isPdfBlad, lijktOpPdf, PDF_GROOT_BYTES, base64Bytes } from "../../store/pdfBijlage.ts";
import { isLosBlad, isSpreadsheetBlad } from "../../store/spreadsheetBlad.ts";
import { isMarkdownBlad } from "../../store/markdownBlad.ts";
import { isGraafBlad } from "../../store/graafBlad.ts";
import { isTekenBlad } from "../../store/tekenBlad.ts";
import { isJupyterBlad } from "../../store/jupyterBlad.ts";
import { isMarimoBlad } from "../../store/marimoBlad.ts";
import { jsonGetal, leesBron, rekenDoor, type Doorrekening } from "../rekenen.ts";

// ── Resultaten ──────────────────────────────────────────────────────────────

export const ok = (data: Record<string, unknown>): McpToolResultaat => ({ ok: true, data });
export const fout = (code: McpFoutCode, error: string, data?: Record<string, unknown>): McpToolResultaat => ({
  ok: false,
  code,
  error,
  ...(data ? { data } : {}),
});
export const melding = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ── Schema-bouwstenen ───────────────────────────────────────────────────────

export const objectSchema = (properties: Record<string, JsonSchema>, required: string[] = []): JsonSchema => ({
  type: "object",
  properties,
  ...(required.length ? { required } : {}),
  additionalProperties: false,
});
export const idVerplicht: JsonSchema = { type: "string", minLength: 1, description: "Sheet id (from project_get or sheets_list)." };
export const idOptioneel: JsonSchema = { type: "string", description: "Sheet id. Default: the sheet that is open in the app." };
export const tekstOfGetal: JsonSchema = { type: ["string", "number"] };

export const LEZEN: McpToolAnnotaties = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export const WIJZIGEN: McpToolAnnotaties = { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false };
export const NIEUW: McpToolAnnotaties = { ...WIJZIGEN, idempotentHint: false };
export const WEG: McpToolAnnotaties = { ...WIJZIGEN, destructiveHint: true };

// ── Bladen ──────────────────────────────────────────────────────────────────

/** Templateid van een blad dat de gebruiker (of de assistent) zelf schrijft; zie CalcTab. */
export const LEEG_BLAD = "leeg";
export const LEEG_BLAD_NAAM = "Sheet";
export const LEEG_BLAD_TEKST = "\"New sheet\n\n";

export function zoekBlad(stand: McpProjectStand, id: string): McpBlad | undefined {
  return stand.exemplaren.find((e) => e.id === id);
}

export function geenBlad(stand: McpProjectStand, id: string): McpToolResultaat {
  return fout("NOT_FOUND", `No sheet with id "${id}". Call project_get or sheets_list for the sheet ids.`, {
    sheetIds: stand.exemplaren.map((e) => e.id),
  });
}

/**
 * Het blad uit `args.id`. Zonder id het blad dat openstaat, maar alleen voor
 * tools die alleen lezen: een mutatie op "wat er toevallig openstaat" kan op
 * het verkeerde blad landen als de gebruiker intussen een ander koos.
 */
export function bladUit(
  args: Record<string, unknown>,
  ctx: McpContext,
  standaardActief: boolean,
): { blad: McpBlad; stand: McpProjectStand } | { fout: McpToolResultaat } {
  const stand = ctx.omgeving.stand();
  const id = typeof args.id === "string" && args.id !== "" ? args.id : null;
  if (id === null) {
    const actief = standaardActief ? zoekBlad(stand, stand.activeId) : undefined;
    if (actief) return { blad: actief, stand };
    return { fout: fout("VALIDATION", standaardActief ? "No sheet is open; pass an id (see project_get)." : "Pass the sheet id (see project_get).") };
  }
  const blad = zoekBlad(stand, id);
  return blad ? { blad, stand } : { fout: geenBlad(stand, id) };
}

/** Een rekenblad, geen PDF-, spreadsheet-, Markdown-, graaf-, teken- of Jupyter-blad: die hebben geen rekentekst en geen invoer. */
export function geenPdfBlad(blad: McpBlad): McpToolResultaat | null {
  return isLosBlad(blad)
    ? fout("VALIDATION", `Sheet "${blad.naam}" is a ${isPdfBlad(blad) ? "PDF" : isMarkdownBlad(blad) ? "Markdown" : isGraafBlad(blad) ? "graph" : isTekenBlad(blad) ? "drawing" : isJupyterBlad(blad) ? "Jupyter" : isMarimoBlad(blad) ? "Marimo" : "spreadsheet"} sheet: it has no calculation text or inputs.`)
    : null;
}

/** De soort van een blad, zoals de API die noemt. */
export function bladSoort(blad: McpBlad): "pdf" | "spreadsheet" | "markdown" | "graph" | "drawing" | "jupyter" | "marimo" | "calculation" {
  return isPdfBlad(blad) ? "pdf" : isSpreadsheetBlad(blad) ? "spreadsheet" : isMarkdownBlad(blad) ? "markdown" : isGraafBlad(blad) ? "graph" : isTekenBlad(blad) ? "drawing" : isJupyterBlad(blad) ? "jupyter" : isMarimoBlad(blad) ? "marimo" : "calculation";
}

/** Een invoerwaarde als tekst: getallen zoals de app ze bewaart. */
export function alsTekst(w: unknown): string | null {
  if (typeof w === "string") return w;
  if (typeof w === "number" && Number.isFinite(w)) return String(w);
  if (typeof w === "boolean") return w ? "1" : "0";
  return null;
}

/** De korte naam van een module voor een nieuw blad: "Balklaag (houten vloerbalken)" → "Balklaag". */
export function korteNaam(label: string): string {
  return label.replace(/\s*\([^)]*\)\s*$/, "").trim() || label;
}

export function veldenVan(source: string): { velden: Invoerveld[]; fout?: string } {
  try {
    return { velden: invoervelden(leesBron(source)) };
  } catch (e) {
    return { velden: [], fout: melding(e) };
  }
}

/**
 * Leesbare veldnamen uit de tekst: bij `H = ?{5}', Wanddikte (m)'` is dat
 * "Wanddikte (m)", de toelichting achter het vraagteken. Velden zonder
 * toelichting ontbreken in het resultaat.
 */
export function veldLabels(bron: string): Record<string, string> {
  const uit: Record<string, string> = {};
  for (const regel of bron.split(/\r?\n/)) {
    const m = regel.match(/^\s*([\p{L}_][\p{L}\p{N}_]*)\s*=\s*\?[^']*'\s*[,，]?\s*(.*?)\s*'?\s*$/u);
    if (m && m[2] && !(m[1] in uit)) uit[m[1]] = m[2];
  }
  return uit;
}

export function invoerJson(v: Invoerveld, waarden: Record<string, string>, bron = ""): Record<string, unknown> {
  const gezet = waarden[v.naam] !== undefined;
  const waarde = gezet ? waarden[v.naam] : v.beginwaarde;
  const uit: Record<string, unknown> = {
    name: v.naam,
    label: veldLabels(bron)[v.naam] ?? v.naam,
    kind: v.soort === "keuze" ? "choice" : "input",
    value: waarde,
    isSet: gezet,
    default: v.beginwaarde,
  };
  if (v.eenheid) uit.unit = v.eenheid;
  if (v.soort === "keuze") {
    uit.options = v.keuzes.map((k) => ({ value: k.value, text: k.text }));
    const gekozen = v.keuzes.find((k) => k.value === waarde);
    if (gekozen) uit.selectedText = gekozen.text;
  }
  return uit;
}

/** Een keuzelijstwaarde herkennen aan waarde of tekst. */
export function kiesKeuze(v: Invoerveld, invoer: string): string | null {
  if (v.keuzes.some((k) => k.value === invoer)) return invoer;
  const klein = invoer.trim().toLowerCase();
  return v.keuzes.find((k) => k.text.trim().toLowerCase() === klein)?.value ?? null;
}

// ── Uitkomsten die deze server al kent ─────────────────────────────────────

/**
 * Per blad de laatste uitkomst die via deze server is uitgerekend, met de
 * invoer waarmee dat gebeurde. project_get meldt een UC alleen als de invoer
 * sindsdien niet veranderde; anders zou hij een oud getal als actueel tonen.
 */
const bekend = new Map<string, { sleutel: string; resultaat: Resultaat }>();

function sleutelVan(b: McpBlad, scope: Record<string, unknown>): string {
  return JSON.stringify([b.naam, b.waarden, scope, b.source]);
}

export function rekenBlad(
  b: McpBlad,
  gegevens: Record<string, string>,
): { ok: true; d: Doorrekening } | { ok: false; fout: string } {
  const scope = projectScope(gegevens);
  try {
    const d = rekenDoor(b.source, b.waarden, scope, b.naam);
    bekend.set(b.id, { sleutel: sleutelVan(b, scope), resultaat: d.resultaat });
    return { ok: true, d };
  } catch (e) {
    bekend.delete(b.id);
    return { ok: false, fout: melding(e) };
  }
}

/** De bekende uitkomst van een blad, als de invoer sindsdien niet veranderde. */
export function bekendeUitkomst(b: McpBlad, gegevens: Record<string, string>): Resultaat | null {
  const k = bekend.get(b.id);
  return k && k.sleutel === sleutelVan(b, projectScope(gegevens)) ? k.resultaat : null;
}

export function vergeetBlad(id: string): void {
  bekend.delete(id);
}

/** Ruimt uitkomsten op van bladen die niet meer bestaan. */
export function ruimUitkomstenOp(stand: McpProjectStand): void {
  for (const id of [...bekend.keys()]) if (!zoekBlad(stand, id)) bekend.delete(id);
}

/** Alleen voor de controle: vergeet alle bekende uitkomsten. */
export function vergeetUitkomsten(): void {
  bekend.clear();
}

export function resultaatJson(r: Resultaat): Record<string, unknown> {
  return { title: r.titel, norm: r.norm, uc: jsonGetal(r.uc), passes: r.voldoet };
}

// ── PDF ─────────────────────────────────────────────────────────────────────

/** Begint de base64-tekst als een PDF? Kijkt alleen naar de eerste kilobyte. */
export function base64IsPdf(data: string): boolean {
  try {
    const kop = atob(data.slice(0, 1368).replace(/=+$/, ""));
    const bytes = new Uint8Array(kop.length);
    for (let i = 0; i < kop.length; i++) bytes[i] = kop.charCodeAt(i);
    return lijktOpPdf(bytes);
  } catch {
    return false;
  }
}

/**
 * Het PDF-bestand uit `path` (gelezen in de app) of `base64`. Controleert dat
 * het een PDF is en, boven 20 MB, dat de client `force` meegaf — net als de app
 * daar eerst vraagt.
 */
export async function pdfUit(
  args: Record<string, unknown>,
  ctx: McpContext,
): Promise<{ pdf: { bestandsnaam: string; data: string } } | { fout: McpToolResultaat }> {
  const pad = typeof args.path === "string" ? args.path : null;
  const b64 = typeof args.base64 === "string" ? args.base64.replace(/^data:[^,]*,/, "").replace(/\s+/g, "") : null;
  if ((pad === null) === (b64 === null)) return { fout: fout("VALIDATION", "Pass either path or base64.") };
  let data: string;
  let bestandsnaam: string;
  if (pad !== null) {
    if (!ctx.omgeving.bestanden.beschikbaar()) return { fout: fout("NOT_AVAILABLE", "Reading a file by path only works in the desktop app; pass base64 instead.") };
    data = await ctx.omgeving.bestanden.leesBase64(pad);
    bestandsnaam = typeof args.fileName === "string" && args.fileName ? args.fileName : (pad.split(/[\\/]/).pop() ?? pad);
  } else {
    data = b64!;
    bestandsnaam = typeof args.fileName === "string" && args.fileName ? args.fileName : "document.pdf";
  }
  if (!data || !base64IsPdf(data)) return { fout: fout("VALIDATION", `${bestandsnaam} is not a PDF file.`) };
  const bytes = base64Bytes(data);
  if (bytes > PDF_GROOT_BYTES && args.force !== true) {
    return {
      fout: fout("VALIDATION", `${bestandsnaam} is ${Math.round(bytes / 1048576)} MB; above 20 MB pass force=true (the project file grows by that much).`),
    };
  }
  return { pdf: { bestandsnaam, data } };
}
