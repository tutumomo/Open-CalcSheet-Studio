import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { BEELD_BREEDTE, isBeeldData, type Rapportbeeld } from "../../../rapport/model";
import { useProjectStore } from "../../../store/projectStore";

/** Groter dan dit maakt het projectbestand onnodig zwaar: een foto verklein je eerst. */
const MAX_BYTES = 8 * 1024 * 1024;

function leesAlsDataUrl(bestand: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const lezer = new FileReader();
    lezer.onload = () => resolve(String(lezer.result));
    // De melding komt van de aanroeper, in de taal van de app.
    lezer.onerror = () => reject(lezer.error);
    lezer.readAsDataURL(bestand);
  });
}

/**
 * De afbeeldingen onder de tekst van één paragraaf (rapport.beelden[id]): een
 * overzichtstekening, een foto. Per afbeelding een bijschrift en de breedte op papier.
 */
export default function BeeldenInvoer({ id }: { id: string }) {
  const { t } = useTranslation("rapport");
  const beelden = useProjectStore((s) => s.rapport.beelden[id]);
  const werkRapportBij = useProjectStore((s) => s.werkRapportBij);
  const kiezer = useRef<HTMLInputElement>(null);
  const [melding, zetMelding] = useState("");

  /** Zet de lijst van deze paragraaf; een lege lijst haalt de sleutel weg. */
  const zet = (nieuw: Rapportbeeld[]) =>
    werkRapportBij((r) => {
      const { [id]: _weg, ...rest } = r.beelden;
      return { ...r, beelden: nieuw.length ? { ...rest, [id]: nieuw } : rest };
    });
  const lijst = beelden ?? [];
  const wijzig = (i: number, deel: Partial<Rapportbeeld>) => zet(lijst.map((b, k) => (k === i ? { ...b, ...deel } : b)));

  const voegToe = async (bestanden: FileList | null) => {
    zetMelding("");
    const nieuw: Rapportbeeld[] = [];
    for (const bestand of Array.from(bestanden ?? [])) {
      if (bestand.size > MAX_BYTES) {
        zetMelding(t("beelden.teGroot", { naam: bestand.name }));
        continue;
      }
      try {
        const data = await leesAlsDataUrl(bestand);
        if (isBeeldData(data)) nieuw.push({ data, bijschrift: "", breedte: BEELD_BREEDTE.standaard });
        else zetMelding(t("beelden.geenBeeld", { naam: bestand.name }));
      } catch {
        zetMelding(t("beelden.geenBeeld", { naam: bestand.name }));
      }
    }
    if (nieuw.length) zet([...lijst, ...nieuw]);
    if (kiezer.current) kiezer.current.value = "";
  };

  return (
    <div className="rapport-beelden">
      {lijst.map((b, i) => (
        <div className="rapport-beeld-rij" key={i}>
          <img className="rapport-beeld" src={b.data} alt={b.bijschrift || t("beelden.afbeelding")} />
          <label className="rapport-veld rapport-beeld-bijschrift">
            <span className="rapport-label">{t("beelden.bijschrift")}</span>
            <input type="text" value={b.bijschrift} onChange={(e) => wijzig(i, { bijschrift: e.target.value })} />
          </label>
          <label className="rapport-veld rapport-beeld-breedte">
            <span className="rapport-label">{t("beelden.breedte")}</span>
            <input
              type="number"
              min={BEELD_BREEDTE.min}
              max={BEELD_BREEDTE.max}
              step={5}
              value={b.breedte}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isFinite(n)) wijzig(i, { breedte: Math.round(Math.min(BEELD_BREEDTE.max, Math.max(BEELD_BREEDTE.min, n))) });
              }}
            />
          </label>
          <button type="button" className="rapport-knop" onClick={() => zet(lijst.filter((_, k) => k !== i))}>
            {t("beelden.verwijder")}
          </button>
        </div>
      ))}
      <input
        ref={kiezer}
        type="file"
        accept="image/png,image/jpeg"
        multiple
        hidden
        onChange={(e) => void voegToe(e.target.files)}
      />
      <button type="button" className="rapport-knop" onClick={() => kiezer.current?.click()}>
        {t("beelden.toevoegen")}
      </button>
      {melding && <p className="rapport-hint" role="alert">{melding}</p>}
    </div>
  );
}
