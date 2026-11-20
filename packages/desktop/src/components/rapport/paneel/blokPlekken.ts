/**
 * Waar de blokken op het canvas van 5.5 staan (BelastingCanvas.tsx). Een blok met een
 * eigen plek staat daar; de andere zet het canvas zelf neer, onder de rest. Puur, zonder
 * React: scripts/check-belastingen.mjs laadt dit bestand.
 */

/** Breedte van een blok en van de kaart waarin je het bewerkt, de ruimte ertussen en het raster, in px. */
export const BLOK_B = 240;
export const KAART_B = 580;
export const TUSSEN = 12;
export const RASTER = 10;
/** De hoogte van een blok dat nog niet gemeten is. */
export const HOOGTE_GOK = 130;

export interface Plek { x: number; y: number; }

/** Wat de plaatsing van een blok nodig heeft. */
export interface BlokOpCanvas {
  sleutel: string;
  opbouw: { x?: number; y?: number };
}

export const opRaster = (v: number) => Math.max(0, Math.round(v / RASTER) * RASTER);
/** De eerste rasterlijn op of onder een maat: zo blijft er altijd de volle ruimte tussen twee blokken. */
const rasterOnder = (v: number) => Math.max(0, Math.ceil(v / RASTER) * RASTER);
export const heeftPlek = (o: { x?: number; y?: number }) => typeof o.x === "number" && typeof o.y === "number";

/**
 * Waar elk blok staat. Een blok met een plek staat daar; de andere komen eronder, in de
 * volgorde van het rapport en in zoveel kolommen als er passen, telkens in de kortste.
 */
export function plekken(blokken: readonly BlokOpCanvas[], hoogtes: Record<string, number>, breedte: number): Record<string, Plek> {
  const uit: Record<string, Plek> = {};
  let onder = 0;
  for (const b of blokken) {
    if (!heeftPlek(b.opbouw)) continue;
    uit[b.sleutel] = { x: b.opbouw.x!, y: b.opbouw.y! };
    onder = Math.max(onder, b.opbouw.y! + (hoogtes[b.sleutel] ?? HOOGTE_GOK) + TUSSEN);
  }
  const kolommen = Math.max(1, Math.floor((breedte + TUSSEN) / (BLOK_B + TUSSEN)));
  const bodem = Array.from({ length: kolommen }, () => rasterOnder(onder));
  for (const b of blokken) {
    if (heeftPlek(b.opbouw)) continue;
    const k = bodem.indexOf(Math.min(...bodem));
    uit[b.sleutel] = { x: k * (BLOK_B + TUSSEN), y: bodem[k] };
    bodem[k] = rasterOnder(bodem[k] + (hoogtes[b.sleutel] ?? HOOGTE_GOK) + TUSSEN);
  }
  return uit;
}
