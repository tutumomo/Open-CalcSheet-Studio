import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useDesigner, UitkomstKop, fmt } from "./designerKit";
import { useBladUitkomst } from "./bladResultaat";
import {
  TW_SITE_SEISMIC,
  TW_SITE_SEISMIC_COUNT,
  calcSiteDesignSpectrum,
} from "../../normen/twSiteSeismic";
import "./VoetplaatDesigner.css";

/**
 * Hulpbeeld bij het blad 建築物靜力分析法地震力計算 (templates/tw-seismic-load.ts):
 * kies een provincie/stad, district, grondsoort (type 1..3) en eventueel de afstand
 * tot een nabije breuk (tabel 2-1, 2-3-1, 2-3-2, 2-4(a)/(b) en 2-6(b) van seis113).
 * Met één klik worden S_DS en S_D1 in het blad geschreven.
 */
const MARKER = "建築物靜力分析法地震力計算";

const DEFAULTS: Record<string, number> = {
  S_DS: 0.80,
  S_D1: 0.45,
};

export default function TwSeismicLoadDesigner() {
  const ctx = useDesigner(MARKER, DEFAULTS);
  const uitkomst = useBladUitkomst();
  const { t, i18n } = useTranslation("beelden");
  const [county, setCounty] = useState("");
  const [town, setTown] = useState("");
  const [soil, setSoil] = useState<1 | 2 | 3>(1);
  const [fault, setFault] = useState("none");
  const [rKm, setRKm] = useState(5);

  if (!ctx.actief) return null;
  const { d, set } = ctx;

  const towns = county ? Object.keys(TW_SITE_SEISMIC[county] ?? {}) : [];
  const entry = county && town ? TW_SITE_SEISMIC[county]?.[town] : undefined;
  const faults = entry?.faults ?? [];
  const calc = entry ? calcSiteDesignSpectrum(entry, soil, fault, rKm) : undefined;

  return (
    <div className="vd-panel">
      <UitkomstKop titel={t("twSeismicLoad.titel")} uitkomst={uitkomst} />
      <div className="vd-body" style={{ flex: 1, minHeight: 0, alignItems: "stretch" }}>
        <div className="vd-controls vd-compact" style={{ alignSelf: "flex-start" }}>
          <span className="vd-ctrl-h">{t("twSeismicLoad.kop")}</span>
          <label>{t("twSeismicLoad.velden.county")}
            <select value={county} onChange={(e) => { setCounty(e.target.value); setTown(""); setFault("none"); }}>
              <option value="">{t("twSeismicLoad.kies")}</option>
              {Object.keys(TW_SITE_SEISMIC).map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </label>
          <label>{t("twSeismicLoad.velden.town")}
            <select value={town} disabled={!county} onChange={(e) => { setTown(e.target.value); setFault("none"); }}>
              <option value="">{t("twSeismicLoad.kies")}</option>
              {towns.map((x) => <option key={x} value={x}>{x}</option>)}
            </select>
          </label>
          <label>{t("twSeismicLoad.velden.soil")}
            <select value={soil} onChange={(e) => setSoil(Number(e.target.value) as 1 | 2 | 3)}>
              <option value={1}>{t("twSeismicLoad.keuzes.soil1")}</option>
              <option value={2}>{t("twSeismicLoad.keuzes.soil2")}</option>
              <option value={3}>{t("twSeismicLoad.keuzes.soil3")}</option>
            </select>
          </label>
          {faults.length > 0 && (
            <>
              <label>{t("twSeismicLoad.velden.fault")}
                <select value={fault} onChange={(e) => setFault(e.target.value)}>
                  <option value="none">{t("twSeismicLoad.keuzes.geenFault")}</option>
                  {faults.map((f) => <option key={f} value={f}>{f}</option>)}
                </select>
              </label>
              {fault !== "none" && (
                <label>{t("twSeismicLoad.velden.rKm")}
                  <input type="number" step={0.5} min={0.5} max={15} value={rKm}
                    onChange={(e) => setRKm(parseFloat(e.target.value) || 14)} />
                </label>
              )}
            </>
          )}
          <label>{t("twSeismicLoad.velden.zone")}
            <output>{calc === undefined ? "—" : `${fmt(calc.SsD, 2, i18n.language)} / ${fmt(calc.S1D, 2, i18n.language)}`}</output>
          </label>
          <label>{t("twSeismicLoad.velden.fafv")}
            <output>{calc === undefined ? "—" : `${fmt(calc.Fa, 2, i18n.language)} / ${fmt(calc.Fv, 2, i18n.language)}`}</output>
          </label>
          <label>{t("twSeismicLoad.velden.aanbevolen")}
            <output>{calc === undefined ? "—" : `${fmt(calc.SDS, 3, i18n.language)} / ${fmt(calc.SD1, 3, i18n.language)}`}</output>
          </label>
          <button type="button" className="settings-btn settings-btn-secondary" disabled={calc === undefined}
            onClick={() => {
              if (!calc) return;
              set("S_DS", calc.SDS);
              set("S_D1", calc.SD1);
            }}>{t("twSeismicLoad.neem")}</button>
          <label>{t("twSeismicLoad.velden.huidig")}
            <output>{`${fmt(d("S_DS"), 3, i18n.language)} / ${fmt(d("S_D1"), 3, i18n.language)}`}</output>
          </label>
          <span className="gd-note">{t("twSeismicLoad.noot", { aantal: TW_SITE_SEISMIC_COUNT })}</span>
        </div>
      </div>
      <div className="vd-foot"><span>{t("twSeismicLoad.klik")}</span></div>
    </div>
  );
}
