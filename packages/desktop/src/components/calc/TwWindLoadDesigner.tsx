import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDesigner, UitkomstKop, fmt } from "./designerKit";
import { useBladUitkomst } from "./bladResultaat";
import { TW_SITE_WIND, TW_SITE_WIND_COUNT } from "../../normen/twSiteWind";
import "./VoetplaatDesigner.css";

/**
 * Hulpbeeld bij het blad 建築物風速壓與各層風力 (templates/tw-wind-load.ts): kies een
 * county en district, het beeld toont de aanbevolen basiswindsnelheid V10 uit de
 * open data van het ABRI (normen/twSiteWind.ts) en schrijft haar met één klik in het blad.
 * Het beeld rekent niet; de kop toont de UC en het oordeel van het blad zelf.
 */
const MARKER = "建築物風速壓與各層風力";

const DEFAULTS: Record<string, number> = {
  V_10: 40.0,
};

export default function TwWindLoadDesigner() {
  const ctx = useDesigner(MARKER, DEFAULTS);
  const uitkomst = useBladUitkomst();
  const { t, i18n } = useTranslation("beelden");
  const [county, setCounty] = useState("");
  const [district, setDistrict] = useState("");
  if (!ctx.actief) return null;
  const { d, set } = ctx;

  const districts = county ? Object.keys(TW_SITE_WIND[county] ?? {}) : [];
  const aanbevolen = county && district ? TW_SITE_WIND[county]?.[district] : undefined;
  const huidig = d("V_10");

  return (
    <div className="vd-panel">
      <UitkomstKop titel={t("twWindLoad.titel")} uitkomst={uitkomst} />
      <div className="vd-body" style={{ flex: 1, minHeight: 0, alignItems: "stretch" }}>
        <div className="vd-controls vd-compact" style={{ alignSelf: "flex-start" }}>
          <span className="vd-ctrl-h">{t("twWindLoad.kop")}</span>
          <label>{t("twWindLoad.velden.county")}
            <select value={county} onChange={(e) => { setCounty(e.target.value); setDistrict(""); }}>
              <option value="">{t("twWindLoad.kies")}</option>
              {Object.keys(TW_SITE_WIND).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>{t("twWindLoad.velden.district")}
            <select value={district} disabled={!county} onChange={(e) => setDistrict(e.target.value)}>
              <option value="">{t("twWindLoad.kies")}</option>
              {districts.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label>{t("twWindLoad.velden.aanbevolen")}
            <output>{aanbevolen === undefined ? "—" : `${fmt(aanbevolen, 1, i18n.language)} m/s`}</output>
          </label>
          <button type="button" className="settings-btn settings-btn-secondary" disabled={aanbevolen === undefined}
            onClick={() => aanbevolen !== undefined && set("V_10", aanbevolen)}>{t("twWindLoad.neem")}</button>
          <label>{t("twWindLoad.velden.huidig")}
            <output>{`${fmt(huidig, 1, i18n.language)} m/s`}</output>
          </label>
          <span className="gd-note">{t("twWindLoad.noot", { aantal: TW_SITE_WIND_COUNT })}</span>
        </div>
      </div>
      <div className="vd-foot"><span>{t("twWindLoad.klik")}</span></div>
    </div>
  );
}
