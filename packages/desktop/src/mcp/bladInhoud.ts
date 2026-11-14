/**
 * De inhoud van de bladen zonder rekentekst, als gegevens voor een AI-assistent
 * (docs/OCSS_TW_開發需求規格.md, P2-11): de cellen van een spreadsheet met hun
 * uitkomst, de waarden van de nodes van een graaf, en de bewaarde uitvoer van een
 * Jupyter- of Marimo-notebook.
 *
 * Alles leest alleen. De spreadsheetkern laadt pas bij het eerste gebruik; de
 * controle (scripts/check-mcp.mjs) geeft hem zelf mee met `zetWerkmapKern`, want in
 * Node moet de WASM uit een bestand komen. Laadt zonder React of stores.
 */
import type { Graaf } from "../graaf/model.ts";
import { rekenGraaf, bekijkUitkomsten } from "../graaf/rekenen.ts";
import { isGrootheid, isLijst, waardeTekst, type Waarde } from "../graaf/waarde.ts";
import { pakWerkmapUit, uitBase64 } from "../store/jupyterBlad.ts";
import { marimoCellen } from "../store/marimoBlad.ts";
import { jsonGetal } from "./rekenen.ts";

const zonderHtml = (t: string) =>
  t.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

/** Zoveel tekens tekst per uitvoer; de rest valt weg (`truncated`). */
export const MAX_UITVOER_TEKENS = 4000;

function kort(t: string, max = MAX_UITVOER_TEKENS): { text: string; truncated?: true } {
  return t.length > max ? { text: t.slice(0, max), truncated: true } : { text: t };
}

// ── Spreadsheet ─────────────────────────────────────────────────────────────

/** Het deel van de spreadsheetkern (@betteroffice/xlsx) dat hier nodig is. */
export interface WerkmapKern {
  openWorkbook(bytes: Uint8Array): {
    sheetInfo(): { sheetNames: string[]; sheetIds: string[] };
    selectionData(sheet: number, row: number, col: number, direction: "usedRange"): { usedRange?: { top: number; left: number; bottom: number; right: number } | null };
    readCells(request: unknown): unknown;
    dispose(): void;
  };
}

let kernLader: (() => Promise<WerkmapKern>) | null = null;
let kernBelofte: Promise<WerkmapKern> | null = null;

/** Een eigen lader voor de kern (de controle in Node); `null` zet de standaard terug. */
export function zetWerkmapKern(lader: (() => Promise<WerkmapKern>) | null): void {
  kernLader = lader;
  kernBelofte = null;
}

function kern(): Promise<WerkmapKern> {
  if (!kernBelofte) {
    kernBelofte = (kernLader ?? (async () => {
      const m = await import("@betteroffice/xlsx");
      await m.initWasm();
      return m as unknown as WerkmapKern;
    }))();
    kernBelofte.catch(() => {
      kernBelofte = null;
    });
  }
  return kernBelofte;
}

interface CelGelezen {
  a1: string;
  value: { kind: string; value?: unknown };
  formula: string | null;
  displayText: string;
}

/** Zoveel cellen per werkblad worden hoogstens gelezen (lege tellen mee). */
const MAX_BEREIK = 100_000;

/**
 * De gevulde cellen van een werkmap, per werkblad: adres, waarde (met soort), formule
 * en de tekst zoals de kern hem toont. Een formule geeft haar uitkomst zoals de kern
 * die heeft uitgerekend. Na `max` gevulde cellen stopt het (`truncated`).
 */
export async function werkmapInhoud(data: string, max: number): Promise<Record<string, unknown>> {
  const k = await kern();
  const wb = k.openWorkbook(uitBase64(data));
  try {
    const info = wb.sheetInfo();
    const bladen: Record<string, unknown>[] = [];
    let totaal = 0;
    let afgekapt = false;
    for (let i = 0; i < info.sheetIds.length; i++) {
      const gebruikt = wb.selectionData(i, 0, 0, "usedRange").usedRange ?? null;
      const cellen: Record<string, unknown>[] = [];
      let bereik: string | null = null;
      if (gebruikt && !afgekapt) {
        let onder = gebruikt.bottom;
        const breedte = gebruikt.right - gebruikt.left + 1;
        if ((onder - gebruikt.top + 1) * breedte > MAX_BEREIK) {
          onder = gebruikt.top + Math.max(0, Math.floor(MAX_BEREIK / breedte) - 1);
          afgekapt = true;
        }
        const lezing = wb.readCells({
          ranges: [{ sheetId: info.sheetIds[i], range: { kind: "rowCol", start: { row: gebruikt.top, col: gebruikt.left }, end: { row: onder, col: gebruikt.right } } }],
        }) as { ok: boolean; ranges?: { cells: CelGelezen[][] }[]; failure?: { message?: string } };
        if (!lezing.ok) throw new Error(lezing.failure?.message ?? "The spreadsheet kernel could not read the cells.");
        const rijen = lezing.ranges?.[0]?.cells ?? [];
        bereik = rijen.length > 0 && rijen[0].length > 0 ? `${rijen[0][0].a1}:${rijen[rijen.length - 1][rijen[0].length - 1].a1}` : null;
        buiten: for (const rij of rijen) {
          for (const c of rij) {
            if (c.value.kind === "empty" && !c.formula) continue;
            if (totaal >= max) {
              afgekapt = true;
              break buiten;
            }
            const cel: Record<string, unknown> = { a1: c.a1, kind: c.value.kind };
            if (c.value.kind === "number") cel.value = jsonGetal(c.value.value as number);
            else if (c.value.kind !== "empty") cel.value = c.value.value;
            if (c.formula) cel.formula = c.formula;
            if (c.displayText !== "" && c.displayText !== String(cel.value ?? "")) cel.text = c.displayText;
            if (c.value.kind === "error") cel.error = c.value.value;
            cellen.push(cel);
            totaal++;
          }
        }
      }
      bladen.push({ name: info.sheetNames[i], usedRange: bereik, cells: cellen });
    }
    return { sheets: bladen, cellCount: totaal, truncated: afgekapt };
  } finally {
    wb.dispose();
  }
}

// ── Graaf ───────────────────────────────────────────────────────────────────

/** Een waarde van een graaf als JSON: getal, tekst of ja/nee zelf; een grootheid met SI-waarde. */
function graafWaarde(w: Waarde): Record<string, unknown> {
  const uit: Record<string, unknown> = { text: waardeTekst(w) };
  if (typeof w === "number") uit.value = jsonGetal(w);
  else if (typeof w === "string" || typeof w === "boolean") uit.value = w;
  else if (isGrootheid(w)) {
    const si = (w as unknown as { value?: unknown }).value;
    if (typeof si === "number") uit.si_value = jsonGetal(si);
  } else if (isLijst(w)) uit.length = w.length;
  return uit;
}

/** Rekent de graaf door: per node de uitgangen, fouten en meldingen, en de bekijk-tabel. */
export function graafInhoud(graaf: Graaf): Record<string, unknown> {
  const uitkomst = rekenGraaf(graaf);
  const nodes = graaf.nodes.map((n) => {
    const r = uitkomst.nodes[n.id];
    const uitgangen: Record<string, unknown> = {};
    for (const [poort, w] of Object.entries(r?.waarden ?? {})) uitgangen[poort] = graafWaarde(w);
    const node: Record<string, unknown> = { id: n.id, type: n.soort, outputs: uitgangen };
    if (n.naam) node.name = n.naam;
    if (n.invoer && Object.keys(n.invoer).length > 0) node.inputs = n.invoer;
    if (r?.fouten.length) node.errors = r.fouten;
    if (r?.meldingen.length) node.warnings = r.meldingen;
    return node;
  });
  const views = bekijkUitkomsten(graaf, uitkomst).map((b) => ({
    id: b.id,
    name: b.naam,
    ...graafWaarde(b.waarde),
    ...(b.fouten.length ? { errors: b.fouten } : {}),
  }));
  return {
    nodes,
    views,
    order: uitkomst.volgorde,
    errorNodes: nodes.filter((n) => n.errors).length,
  };
}

// ── Jupyter ─────────────────────────────────────────────────────────────────

const regelsTekst = (x: unknown): string => (Array.isArray(x) ? x.join("") : typeof x === "string" ? x : "");

/** Eén uitvoer van een cel (nbformat 4): tekst, uitkomst, afbeelding (alleen het soort) of fout. */
function jupyterUitvoer(o: Record<string, unknown>): Record<string, unknown> {
  const soort = String(o.output_type ?? "");
  if (soort === "stream") return { type: "stream", name: o.name, ...kort(regelsTekst(o.text)) };
  if (soort === "error") {
    return {
      type: "error",
      ename: o.ename,
      evalue: o.evalue,
      // De traceback heeft kleurcodes van de terminal.
      ...kort(regelsTekst(Array.isArray(o.traceback) ? (o.traceback as string[]).join("\n") : "").replace(/\u001b\[[0-9;]*m/g, "")),
    };
  }
  const data = (o.data ?? {}) as Record<string, unknown>;
  const uit: Record<string, unknown> = { type: soort, mime: Object.keys(data) };
  if (data["text/plain"] !== undefined) Object.assign(uit, kort(regelsTekst(data["text/plain"])));
  else if (data["text/html"] !== undefined) Object.assign(uit, kort(zonderHtml(regelsTekst(data["text/html"]))));
  if (typeof o.execution_count === "number") uit.executionCount = o.execution_count;
  return uit;
}

/** De notebooks in de werkmap van een Jupyter-blad, met per cel de bron en de bewaarde uitvoer. */
export function jupyterInhoud(data: string): Record<string, unknown> {
  const bestanden = pakWerkmapUit(uitBase64(data));
  const notebooks: Record<string, unknown>[] = [];
  for (const b of bestanden) {
    if (!b.pad.toLowerCase().endsWith(".ipynb")) continue;
    let nb: { cells?: Record<string, unknown>[] };
    try {
      nb = JSON.parse(new TextDecoder().decode(b.bytes));
    } catch (e) {
      notebooks.push({ path: b.pad, error: `Not a valid notebook: ${(e as Error).message}` });
      continue;
    }
    const cellen = (nb.cells ?? []).map((c, index) => {
      const cel: Record<string, unknown> = { index, type: c.cell_type, source: regelsTekst(c.source) };
      if (c.cell_type === "code") {
        cel.executionCount = typeof c.execution_count === "number" ? c.execution_count : null;
        cel.outputs = Array.isArray(c.outputs) ? (c.outputs as Record<string, unknown>[]).map(jupyterUitvoer) : [];
      }
      return cel;
    });
    const code = cellen.filter((c) => c.type === "code");
    notebooks.push({
      path: b.pad,
      cells: cellen,
      codeCells: code.length,
      // Nooit gedraaid of na het wissen: geen uitkomst om op te vertrouwen.
      executedCells: code.filter((c) => c.executionCount !== null).length,
      errorCells: code.filter((c) => (c.outputs as Record<string, unknown>[]).some((o) => o.type === "error")).length,
    });
  }
  return { notebooks, files: bestanden.map((b) => b.pad) };
}

// ── Marimo ──────────────────────────────────────────────────────────────────

/** De cellen van een Marimo-notebook met de bewaarde uitvoer als tekst (zonder html). */
export function marimoInhoud(nb: { code: string; uitvoer: string[] }): Record<string, unknown> {
  const cellen = marimoCellen(nb.code).map((c, index) => {
    const html = nb.uitvoer[index] ?? "";
    const tekst = zonderHtml(html);
    return {
      index,
      code: c.code,
      hidden: c.verborgen,
      output: kort(tekst).text,
      ...(tekst.length > MAX_UITVOER_TEKENS ? { outputTruncated: true } : {}),
      hasImage: /<(img|svg|canvas)\b/i.test(html),
    };
  });
  return { cells: cellen, outputCells: nb.uitvoer.filter((u) => u.trim()).length };
}
