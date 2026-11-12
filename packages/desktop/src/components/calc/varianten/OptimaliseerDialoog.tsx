import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import Modal from "../../Modal";
import { variantInvoer, zetGevonden, type Varianten, type Zoekopdracht } from "../../../store/varianten";
import { kandidaten, zoekKleinste } from "../../../rekenen/varianten";
import { rekenEenmalig } from "../../../rekenen/variantRekenen";
import type { Exemplaar } from "../../../store/projectStore";
import type { VariantVeld } from "./velden";
import { ucTekst } from "../bladLezen";

const getal = (t: string) => Number(t.trim().replace(",", "."));

/**
 * Optimaliseren: per variant de kleinste waarde van één veld waarmee het blad voldoet.
 * Alle gevonden waarden komen in één stap in de tabel, ook na afbreken. Een variant
 * zonder waarde die voldoet, verandert niet en krijgt een melding.
 */
export default function OptimaliseerDialoog({ ex, vs, velden, onKlaar, onSluit }: {
  ex: Exemplaar;
  vs: Varianten;
  velden: VariantVeld[];
  onKlaar: (vs: Varianten, meldingen: string[]) => void;
  onSluit: () => void;
}) {
  const { t, i18n } = useTranslation("werkruimte");
  const vorig = vs.zoek && velden.some((v) => v.naam === vs.zoek!.veld) ? vs.zoek : undefined;
  const standaard = vorig?.veld ?? (velden.find((v) => v.soort === "invoer" && v.eenheid) ?? velden[0])?.naam ?? "";
  const [naam, setNaam] = useState(standaard);
  const veld = velden.find((v) => v.naam === naam);
  const keuzes = veld?.soort === "keuze" ? veld.keuzes : [];
  const [van, setVan] = useState(vorig?.van ?? keuzes[0]?.value ?? "");
  const [tot, setTot] = useState(vorig?.tot ?? keuzes[keuzes.length - 1]?.value ?? "");
  const [stap, setStap] = useState(vorig?.stap ?? "");
  const [grens, setGrens] = useState(ucTekst(vorig?.grens ?? 1, i18n.language));
  const [voor, setVoor] = useState("alle");
  const [voortgang, setVoortgang] = useState<string | null>(null);
  const afbreken = useRef(false);

  const kies = (n: string) => {
    setNaam(n);
    const v = velden.find((x) => x.naam === n);
    const k = v?.soort === "keuze" ? v.keuzes : [];
    setVan(k[0]?.value ?? "");
    setTot(k[k.length - 1]?.value ?? "");
    setStap("");
  };
  const grensGetal = getal(grens);
  const zoek: Zoekopdracht = { veld: naam, van, tot, ...(veld?.soort === "keuze" ? {} : { stap }), grens: grensGetal };
  const lijst = veld ? kandidaten(veld, zoek) : [];
  const kan = !!veld && lijst.length > 0 && Number.isFinite(grensGetal) && grensGetal > 0 && voortgang === null;

  const start = async () => {
    if (!veld) return;
    afbreken.current = false;
    let nieuw: Varianten = { ...vs, zoek };
    const meldingen: string[] = [];
    const doelen = vs.lijst.filter((v) => voor === "alle" || v.id === voor);
    const tekst = (w: string) => (veld.soort === "keuze" ? (veld.keuzes.find((k) => k.value === w)?.text ?? w) : `${w} ${veld.eenheid}`.trim());
    for (const v of doelen) {
      if (afbreken.current) break;
      setVoortgang(t("varianten.zoekt", { variant: v.naam }));
      const basis = variantInvoer(ex.waarden, v, vs.velden);
      const uit = await zoekKleinste(
        lijst,
        async (w) => {
          const u = await rekenEenmalig(ex.id, { ...basis, [veld.naam]: w });
          // Een regel met een fout: die uitkomst is niet te vertrouwen.
          return u && !u.fout ? u.resultaat : null;
        },
        grensGetal,
        () => afbreken.current,
      );
      if ("waarde" in uit) nieuw = zetGevonden(nieuw, v.id, veld.naam, uit.waarde);
      else if ("geen" in uit) meldingen.push(t("varianten.geenWaarde", { variant: v.naam, van: tekst(lijst[0]), tot: tekst(lijst[lijst.length - 1]) }));
    }
    setVoortgang(null);
    onKlaar(nieuw, meldingen);
  };

  return (
    <Modal
      open
      onClose={() => (voortgang === null ? onSluit() : (afbreken.current = true))}
      title={t("varianten.optimaliseerTitel")}
      width={460}
      footer={
        <>
          <button className="var-knop hoofd" disabled={!kan} onClick={() => void start()}>{t("varianten.zoeken")}</button>
          <button className="var-knop" onClick={() => (voortgang === null ? onSluit() : (afbreken.current = true))}>{t("varianten.annuleren")}</button>
        </>
      }
    >
      <div className="var-dialoog">
        <p className="var-uitleg">{t("varianten.optimaliseerUitleg")}</p>
        <label className="var-regel">
          <span>{t("varianten.zoekVeldKop")}</span>
          <select value={naam} onChange={(e) => kies(e.target.value)} disabled={voortgang !== null}>
            {velden.map((v) => <option key={v.naam} value={v.naam}>{v.naam}{v.label ? ` — ${v.label}` : ""}</option>)}
          </select>
        </label>
        {veld?.soort === "keuze" ? (
          <>
            <label className="var-regel"><span>{t("varianten.van")}</span>
              <select value={van} onChange={(e) => setVan(e.target.value)}>{keuzes.map((k) => <option key={k.value} value={k.value}>{k.text}</option>)}</select>
            </label>
            <label className="var-regel"><span>{t("varianten.tot")}</span>
              <select value={tot} onChange={(e) => setTot(e.target.value)}>{keuzes.map((k) => <option key={k.value} value={k.value}>{k.text}</option>)}</select>
            </label>
          </>
        ) : (
          <>
            <label className="var-regel"><span>{t("varianten.van")}</span><input value={van} onChange={(e) => setVan(e.target.value)} /><em>{veld?.eenheid}</em></label>
            <label className="var-regel"><span>{t("varianten.tot")}</span><input value={tot} onChange={(e) => setTot(e.target.value)} /><em>{veld?.eenheid}</em></label>
            <label className="var-regel"><span>{t("varianten.stap")}</span><input value={stap} onChange={(e) => setStap(e.target.value)} /><em>{veld?.eenheid}</em></label>
          </>
        )}
        <label className="var-regel"><span>{t("varianten.grens")}</span><input value={grens} onChange={(e) => setGrens(e.target.value)} /></label>
        <label className="var-regel">
          <span>{t("varianten.voor")}</span>
          <select value={voor} onChange={(e) => setVoor(e.target.value)} disabled={voortgang !== null}>
            <option value="alle">{t("varianten.alleVarianten")}</option>
            {vs.lijst.map((v) => <option key={v.id} value={v.id}>{v.naam}</option>)}
          </select>
        </label>
        <p className="var-uitleg">{voortgang ?? t("varianten.kandidaten", { count: lijst.length })}</p>
      </div>
    </Modal>
  );
}
