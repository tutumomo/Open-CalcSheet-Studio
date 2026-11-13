import { TW_H_TABEL, type TwHRegel } from "./twProfielen";

/**
 * Teken een warmgewalst H-profiel (CNS 1490) in een svg.
 * `x`,`y` is het midden van de doorsnede; `sc` de schaal (px per mm).
 */
export function hProfielPad(regel: TwHRegel, cx: number, cy: number, sc: number): string {
  const [, , h, b, tw, tf] = regel;
  const wl = (b - tw) / 2, wr = (b + tw) / 2;
  const pts: [number, number][] = [
    [0, 0], [b, 0], [b, tf], [wr, tf], [wr, h - tf], [b, h - tf], [b, h], [0, h],
    [0, h - tf], [wl, h - tf], [wl, tf], [0, tf],
  ];
  const x0 = cx - (b / 2) * sc, y0 = cy - (h / 2) * sc;
  return `M${pts.map(([px, py]) => `${x0 + px * sc},${y0 + py * sc}`).join(" L")} Z`;
}

/** Alle profielen die het blad aanbiedt, op id gesorteerd. */
export function hProfielen(ids?: number[]): TwHRegel[] {
  return TW_H_TABEL.filter((r) => !ids || ids.includes(r[0])).sort((a, b) => a[0] - b[0]);
}

export function hProfiel(id: number): TwHRegel {
  return TW_H_TABEL.find((r) => r[0] === id) ?? TW_H_TABEL[TW_H_TABEL.length - 1];
}
