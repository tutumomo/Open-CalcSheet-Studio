import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { VariantVeld } from "./velden";
import { bladTekst } from "./VariantenTabel";

interface Props {
  velden: VariantVeld[];
  waarden: Record<string, string>;
  gekozen: string[];
  /** De eerste keer: een vraag in het paneel, met *Verder*; anders in een dialoog met *Opslaan*. */
  eerste?: boolean;
  onKlaar: (velden: string[]) => void;
  onAnnuleer?: () => void;
}

/**
 * Welke invoer laat je variëren? Alle invoervelden van het blad, onder de koppen van het
 * blad en met hun huidige waarde. De rest blijft voor alle varianten gelijk aan het blad.
 */
export default function VeldKeuze({ velden, waarden, gekozen, eerste, onKlaar, onAnnuleer }: Props) {
  const { t } = useTranslation("werkruimte");
  const [keuze, setKeuze] = useState(() => new Set(gekozen));
  const [zoek, setZoek] = useState("");
  const groepen = useMemo(() => {
    const z = zoek.trim().toLowerCase();
    const uit: { kop: string; velden: VariantVeld[] }[] = [];
    for (const v of velden) {
      if (z && !v.naam.toLowerCase().includes(z) && !v.label.toLowerCase().includes(z)) continue;
      const laatste = uit[uit.length - 1];
      if (laatste && laatste.kop === v.kop) laatste.velden.push(v);
      else uit.push({ kop: v.kop, velden: [v] });
    }
    return uit;
  }, [velden, zoek]);
  const wissel = (naam: string) =>
    setKeuze((k) => {
      const n = new Set(k);
      if (n.has(naam)) n.delete(naam);
      else n.add(naam);
      return n;
    });
  // De volgorde van de tabel blijft; nieuwe velden komen erachter, in de volgorde van het blad.
  const klaar = () => onKlaar([...gekozen.filter((n) => keuze.has(n)), ...velden.map((v) => v.naam).filter((n) => keuze.has(n) && !gekozen.includes(n))]);

  if (velden.length === 0) return <div className="var-veldkeuze"><p>{t("varianten.geenVelden")}</p></div>;
  return (
    <div className="var-veldkeuze">
      {eerste && <h3>{t("varianten.kiesTitel")}</h3>}
      <p className="var-uitleg">{t("varianten.kiesUitleg")}</p>
      <div className="var-zoekregel">
        <input className="var-zoek" placeholder={t("varianten.zoekVeld")} value={zoek} onChange={(e) => setZoek(e.target.value)} />
        <span className="var-teller">{t("varianten.gekozen", { aantal: keuze.size, totaal: velden.length })}</span>
      </div>
      <div className="var-velden">
        {groepen.map((g, i) => (
          <div key={`${g.kop}-${i}`} className="var-groep">
            {g.kop && <div className="var-groep-kop">{g.kop}</div>}
            {g.velden.map((v) => (
              <label key={v.naam} className={keuze.has(v.naam) ? "var-veld aan" : "var-veld"}>
                <input type="checkbox" checked={keuze.has(v.naam)} onChange={() => wissel(v.naam)} />
                <span className="var-naam">{v.naam}</span>
                {v.label && <span className="var-label">{v.label}</span>}
                <span className="var-huidig">{bladTekst(v, waarden)}{v.eenheid ? ` ${v.eenheid}` : ""}</span>
              </label>
            ))}
          </div>
        ))}
      </div>
      <div className="var-knoppen">
        <button className="var-knop hoofd" disabled={keuze.size === 0} onClick={klaar}>
          {t(eerste ? "varianten.verder" : "varianten.opslaan")}
        </button>
        {onAnnuleer && <button className="var-knop" onClick={onAnnuleer}>{t("varianten.annuleren")}</button>}
      </div>
    </div>
  );
}
