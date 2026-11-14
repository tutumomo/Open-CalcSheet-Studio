/**
 * Een notebook laten draaien vanuit de API (sheet_run; docs/OCSS_TW_開發需求規格.md, P2-11).
 *
 * Een Jupyter- of Marimo-blad draait alleen in zijn venster (JupyterVenster.tsx,
 * MarimoVenster.tsx), en dat venster bestaat pas als het blad open is geweest. Zo'n
 * venster meldt zich hier aan met een uitvoerder; `voerNotebookUit` wacht tot er een is
 * en laat hem draaien. Het venster zet de nieuwe uitvoer zelf in het project.
 *
 * Zonder React of stores, zodat de controle het in Node kan laden.
 */

export interface NotebookRonde {
  /** Alles gedraaid en de uitvoer in het project; false bij een tijdslimiet. */
  klaar: boolean;
  melding?: string;
}

export type Uitvoerder = (tijdMs: number) => Promise<NotebookRonde>;

const uitvoerders = new Map<string, Uitvoerder>();
const wachters = new Map<string, Set<() => void>>();

/** Het venster van blad `id` meldt zich aan; geeft de afmelding. */
export function registreerUitvoerder(id: string, uitvoerder: Uitvoerder): () => void {
  uitvoerders.set(id, uitvoerder);
  for (const klaar of wachters.get(id) ?? []) klaar();
  wachters.delete(id);
  return () => {
    if (uitvoerders.get(id) === uitvoerder) uitvoerders.delete(id);
  };
}

/** Laat blad `id` draaien; wacht eerst hoogstens de hele tijd op zijn venster. */
export async function voerNotebookUit(id: string, tijdMs: number): Promise<NotebookRonde> {
  const begin = Date.now();
  if (!uitvoerders.has(id)) {
    await new Promise<void>((klaar) => {
      const tijd = setTimeout(af, tijdMs);
      function af() {
        clearTimeout(tijd);
        wachters.get(id)?.delete(af);
        klaar();
      }
      if (!wachters.has(id)) wachters.set(id, new Set());
      wachters.get(id)!.add(af);
    });
  }
  const uitvoerder = uitvoerders.get(id);
  if (!uitvoerder) return { klaar: false, melding: "The notebook environment of this sheet did not start in time." };
  return uitvoerder(Math.max(1000, tijdMs - (Date.now() - begin)));
}
