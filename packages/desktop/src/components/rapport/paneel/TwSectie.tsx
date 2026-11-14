import { useTranslation } from "react-i18next";
import { useProjectStore } from "../../../store/projectStore";
import { heeftHandtekening, STANDAARD_TW } from "../../../rapport/tw/blok";
import { Sectie, Veld, Vink, useRapport } from "./velden";

/*
 * Sectie 台灣計算書版面 (P2-16): het blok van de ondertekenende ingenieur op
 * het voorblad, de doorlopende kop- en voettekst en de nummering van tabellen
 * en figuren. Alles staat in het rapport zelf (`rapport.tw`), dus in het
 * projectbestand en in ongedaan maken, en met `report_set` ook machineleesbaar
 * te zetten (paden `tw.handtekening.naam`, `tw.kopvoet.kop`, …).
 */

/** Leest een afbeeldingsbestand als data-URL, zoals het logo in BureauTab. */
function leesBeeld(bestand: File, klaar: (dataUrl: string) => void): void {
  const lezer = new FileReader();
  lezer.onload = () => klaar(typeof lezer.result === "string" ? lezer.result : "");
  lezer.readAsDataURL(bestand);
}

export default function TwSectie() {
  const { t } = useTranslation("rapport");
  const rapport = useRapport();
  const zetVeld = useProjectStore((s) => s.zetRapportVeld);
  const tw = rapport.tw ?? STANDAARD_TW;
  const h = tw.handtekening;

  return (
    <Sectie id="tw" titel={t("secties.tw")} intro={t("tw.intro")}>
      <h3 className="rapport-subkop">{t("tw.handtekeningKop")}</h3>
      <p className="rapport-hint">{t("tw.handtekeningHint")}</p>
      <Veld label={t("tw.naam")} pad="tw.handtekening.naam" waarde={h.naam} />
      <Veld label={t("tw.vakgebied")} pad="tw.handtekening.vakgebied" waarde={h.vakgebied} placeholder={t("tw.vakgebiedVoorbeeld")} />
      <Veld label={t("tw.nummer")} pad="tw.handtekening.nummer" waarde={h.nummer} />
      <Veld label={t("tw.instantie")} pad="tw.handtekening.instantie" waarde={h.instantie} />
      <Veld label={t("tw.bureau")} pad="tw.handtekening.bureau" waarde={h.bureau} />
      <Veld label={t("tw.datum")} pad="tw.handtekening.datum" waarde={h.datum} placeholder={t("tw.datumHint")} />
      <div className="rapport-veld">
        <span className="rapport-label">{t("tw.beeld")}</span>
        <span className="rapport-invoer">
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const bestand = e.target.files?.[0];
              if (bestand) leesBeeld(bestand, (url) => zetVeld("tw.handtekening.beeld", url));
              e.target.value = "";
            }}
          />
          {h.beeld !== "" && (
            <button type="button" className="rapport-knop" onClick={() => zetVeld("tw.handtekening.beeld", "")}>
              {t("tw.beeldWeg")}
            </button>
          )}
        </span>
        <span className="rapport-hint">{t("tw.beeldHint")}</span>
      </div>
      <Vink label={t("tw.tonen")} pad="tw.handtekening.tonen" aan={h.tonen} hint={t("tw.tonenHint")} />
      {!heeftHandtekening(h) && <p className="rapport-hint">{t("tw.leegBlok")}</p>}

      <h3 className="rapport-subkop">{t("tw.kopvoetKop")}</h3>
      <p className="rapport-hint">{t("tw.kopvoetHint")}</p>
      <Veld label={t("tw.kop")} pad="tw.kopvoet.kop" waarde={tw.kopvoet.kop} placeholder={t("tw.kopVoorbeeld")} />
      <Veld label={t("tw.voet")} pad="tw.kopvoet.voet" waarde={tw.kopvoet.voet} placeholder={t("tw.voetVoorbeeld")} />

      <h3 className="rapport-subkop">{t("tw.nummeringKop")}</h3>
      <p className="rapport-hint">{t("tw.nummeringHint")}</p>
      <Vink label={t("tw.tabellen")} pad="tw.nummering.tabellen" aan={tw.nummering.tabellen} hint={t("tw.tabellenHint")} />
      <Vink label={t("tw.figuren")} pad="tw.nummering.figuren" aan={tw.nummering.figuren} hint={t("tw.figurenHint")} />
    </Sectie>
  );
}
