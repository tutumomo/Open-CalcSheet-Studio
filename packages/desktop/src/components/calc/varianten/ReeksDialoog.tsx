import { useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../../Modal";
import { MAX_REEKS, nieuweVariant, reeksWaarden, type Variant, type Varianten } from "../../../store/varianten";
import { kandidaten } from "../../../rekenen/varianten";
import type { VariantVeld } from "./velden";

const getal = (t: string) => Number(t.trim().replace(",", "."));

/** De waarden van een reeks voor dit veld, in de volgorde die de gebruiker koos; ook of hij is afgekapt. */
export function reeksVoor(veld: VariantVeld, van: string, tot: string, stap: string): { waarden: string[]; afgekapt: boolean } {
  if (veld.soort === "keuze") {
    const lijst = kandidaten(veld, { van, tot });
    const i = veld.keuzes.findIndex((k) => k.value === van);
    const j = veld.keuzes.findIndex((k) => k.value === tot);
    const waarden = i > j ? [...lijst].reverse() : lijst;
    return { waarden: waarden.slice(0, MAX_REEKS), afgekapt: waarden.length > MAX_REEKS };
  }
  const [a, b, s] = [getal(van), getal(tot), getal(stap)];
  const waarden = reeksWaarden(a, b, s).map(String);
  const aantal = Number.isFinite(a) && Number.isFinite(b) && s > 0 ? Math.floor(Math.abs(b - a) / s + 1e-9) + 1 : 0;
  return { waarden, afgekapt: aantal > MAX_REEKS };
}

/**
 * Een reeks: voor één veld van–tot–stap, of bij een keuzelijst van keuze tot keuze. Elke
 * waarde wordt een variant. Zijn alle varianten nog leeg, dan komt de reeks in hun plaats;
 * anders erachter.
 */
export default function ReeksDialoog({ vs, velden, onKlaar, onSluit }: {
  vs: Varianten;
  velden: VariantVeld[];
  onKlaar: (vs: Varianten) => void;
  onSluit: () => void;
}) {
  const { t } = useTranslation("werkruimte");
  const [naam, setNaam] = useState(velden[0]?.naam ?? "");
  const veld = velden.find((v) => v.naam === naam) ?? velden[0];
  const [van, setVan] = useState("");
  const [tot, setTot] = useState("");
  const [stap, setStap] = useState("");
  const kies = (n: string) => {
    setNaam(n);
    const v = velden.find((x) => x.naam === n);
    setVan(v?.soort === "keuze" ? (v.keuzes[0]?.value ?? "") : "");
    setTot(v?.soort === "keuze" ? (v.keuzes[v.keuzes.length - 1]?.value ?? "") : "");
  };
  const reeks = veld ? reeksVoor(veld, veld.soort === "keuze" && !van ? (veld.keuzes[0]?.value ?? "") : van, veld.soort === "keuze" && !tot ? (veld.keuzes[veld.keuzes.length - 1]?.value ?? "") : tot, stap) : { waarden: [], afgekapt: false };
  const maak = () => {
    if (!veld) return;
    const leeg = vs.lijst.every((v) => Object.keys(v.waarden).length === 0);
    let lijst: Variant[] = leeg ? [] : [...vs.lijst];
    for (const w of reeks.waarden) lijst = [...lijst, nieuweVariant(lijst, { [veld.naam]: w })];
    onKlaar({ ...vs, lijst });
  };

  return (
    <Modal
      open
      onClose={onSluit}
      title={t("varianten.reeksTitel")}
      width={440}
      footer={
        <>
          <button className="var-knop hoofd" disabled={reeks.waarden.length === 0} onClick={maak}>{t("varianten.reeksMaak", { count: reeks.waarden.length })}</button>
          <button className="var-knop" onClick={onSluit}>{t("varianten.annuleren")}</button>
        </>
      }
    >
      <div className="var-dialoog">
        <label className="var-regel">
          <span>{t("varianten.veld")}</span>
          <select value={veld?.naam ?? ""} onChange={(e) => kies(e.target.value)}>
            {velden.map((v) => <option key={v.naam} value={v.naam}>{v.naam}{v.label ? ` — ${v.label}` : ""}</option>)}
          </select>
        </label>
        {veld?.soort === "keuze" ? (
          <>
            <label className="var-regel">
              <span>{t("varianten.van")}</span>
              <select value={van || veld.keuzes[0]?.value} onChange={(e) => setVan(e.target.value)}>
                {veld.keuzes.map((k) => <option key={k.value} value={k.value}>{k.text}</option>)}
              </select>
            </label>
            <label className="var-regel">
              <span>{t("varianten.tot")}</span>
              <select value={tot || veld.keuzes[veld.keuzes.length - 1]?.value} onChange={(e) => setTot(e.target.value)}>
                {veld.keuzes.map((k) => <option key={k.value} value={k.value}>{k.text}</option>)}
              </select>
            </label>
          </>
        ) : (
          <>
            <label className="var-regel"><span>{t("varianten.van")}</span><input value={van} onChange={(e) => setVan(e.target.value)} /><em>{veld?.eenheid}</em></label>
            <label className="var-regel"><span>{t("varianten.tot")}</span><input value={tot} onChange={(e) => setTot(e.target.value)} /><em>{veld?.eenheid}</em></label>
            <label className="var-regel"><span>{t("varianten.stap")}</span><input value={stap} onChange={(e) => setStap(e.target.value)} /><em>{veld?.eenheid}</em></label>
          </>
        )}
        {reeks.afgekapt && <p className="var-let">{t("varianten.reeksAfgekapt", { max: MAX_REEKS })}</p>}
        <p className="var-uitleg">{t(vs.lijst.every((v) => Object.keys(v.waarden).length === 0) ? "varianten.reeksVervangt" : "varianten.reeksErbij")}</p>
      </div>
    </Modal>
  );
}
