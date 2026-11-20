/**
 * Het rapport als PDF wegschrijven zonder printdialoog (src-tauri/src/rapport_pdf.rs).
 *
 * De knop Rapport (PDF) vraagt eerst om een bestandsnaam. Daarna zet het afdrukken de
 * vellen klaar (App.tsx, rapport/afdruk/drukvellen.ts) en schrijft WebView2 ze weg. In
 * de browser en op een platform zonder die opdracht blijft de printdialoog over.
 */
import i18next from "../i18n/config";

function isTauri(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/** Kan deze app het rapport zelf wegschrijven? Dat weet alleen de Rust-schil. */
export async function kanRapportPdfSchrijven(): Promise<boolean> {
  if (!isTauri()) return false;
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<boolean>("rapport_pdf_beschikbaar").catch(() => false);
}

/**
 * Vraagt waar de PDF moet komen; `null` als de gebruiker annuleert. Staat het project
 * al in een bestand, dan opent de dialoog in die map.
 */
export async function kiesRapportPdf(naam: string, projectPad: string | null): Promise<string | null> {
  const { save } = await import("@tauri-apps/plugin-dialog");
  const bestand = `${(naam.trim() || "rapport").replace(/[\\/:*?"<>|]/g, "_")}.pdf`;
  const scheiding = projectPad?.match(/[\\/]/)?.[0];
  const map = projectPad && scheiding ? projectPad.slice(0, projectPad.lastIndexOf(scheiding)) : null;
  const pad = await save({
    title: i18next.t("werkruimte:pdf.opslaanTitel"),
    defaultPath: map ? `${map}${scheiding}${bestand}` : bestand,
    filters: [{ name: i18next.t("werkruimte:pdf.filter"), extensions: ["pdf"] }],
  });
  if (!pad) return null;
  return /\.pdf$/i.test(pad) ? pad : `${pad}.pdf`;
}

/** Een bladwijzer in de PDF: de titel, het niveau (1 = hoofdstuk) en het id van de kop op de vellen. */
export interface PdfKop { titel: string; niveau: number; doel: string }

/**
 * Schrijft wat er op dit moment voor de afdruk klaarstaat naar `pad`. Met `koppen` krijgt
 * de PDF bladwijzers (src-tauri/src/bladwijzers.rs). Geeft het aantal geschreven bytes.
 */
export async function schrijfRapportPdf(pad: string, koppen: readonly PdfKop[] = []): Promise<number> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<number>("rapport_pdf_schrijven", { pad, koppen });
}

/**
 * Zegt waarom de PDF er niet is, en wacht tot dat gelezen is: `alert` wacht in de app
 * niet (de dialoogplugin vervangt hem), en de printdialoog komt hierna.
 */
export async function meldRapportPdfFout(pad: string, fout: unknown): Promise<void> {
  const { message } = await import("@tauri-apps/plugin-dialog");
  await message(i18next.t("werkruimte:pdf.schrijvenMislukt", { pad, fout: String(fout) }), { kind: "warning" })
    .catch((err) => console.warn("Melding niet getoond:", err));
}
