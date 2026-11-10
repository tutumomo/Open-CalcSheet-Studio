import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useProjectStore } from "../../store/projectStore";
import { TW_SITE_WIND } from "../../normen/twSiteWind";

/**
 * 以縣市與行政區帶入基本設計風速 V10(C)（專案資料「工址」）。
 *
 * 數值是內政部建築研究所公開資料的建議值（normen/twSiteWind.ts，B 級來源），
 * 帶入後仍可手動修改；不取代耐風設計規範 2.4 節，使用者須自行確認。
 * 只寫入 tw_V10 一個欄位，不碰其他欄位。
 */
export default function TwWindKiezer() {
  const { t } = useTranslation("werkruimte");
  const zetGegeven = useProjectStore((s) => s.zetGegeven);
  const [stad, setStad] = useState("");
  const [gebied, setGebied] = useState("");
  const steden = Object.keys(TW_SITE_WIND);
  const gebieden = stad ? Object.keys(TW_SITE_WIND[stad] ?? {}) : [];

  const kies = (nieuweStad: string, nieuwGebied: string) => {
    setStad(nieuweStad);
    setGebied(nieuwGebied);
    const v = TW_SITE_WIND[nieuweStad]?.[nieuwGebied];
    if (typeof v === "number") zetGegeven("tw_V10", String(v));
  };

  return (
    <div className="pg-windkaart pg-kiezer">
      <span className="pg-hint">{t("gegevens.twWindKiezer")}</span>
      <div className="pg-kiezer-rij">
        <select aria-label={t("gegevens.twStad")} value={stad} onChange={(e) => kies(e.target.value, "")}>
          <option value="">{t("gegevens.twStad")}</option>
          {steden.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <select
          aria-label={t("gegevens.twGebied")}
          value={gebied}
          disabled={!stad}
          onChange={(e) => kies(stad, e.target.value)}
        >
          <option value="">{t("gegevens.twGebied")}</option>
          {gebieden.map((g) => (
            <option key={g} value={g}>{g}</option>
          ))}
        </select>
      </div>
    </div>
  );
}
