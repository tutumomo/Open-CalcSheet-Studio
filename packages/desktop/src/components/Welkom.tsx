import { useTranslation } from "react-i18next";
import Icoon from "./Icoon";
import { getSetting, setSetting } from "../store";
import { useModuleKiezer } from "../store/moduleKiezer";
import { modulesPerTemplate } from "./calc/projectTree";
import "./Welkom.css";

/** Instelling: het welkomstpaneel is nog niet getoond. Na de eerste keer staat hij uit. */
const INSTELLING = "welkomBijStart";

/** Dezelfde aantekening in de opslag van de browser, voor de app zonder bureaubladschil. */
const GEZIEN = "ocss.welkomGezien";

/** Het voorbeeldblad uit de bibliotheek dat de rekentaal laat zien. */
const VOORBEELD = "rekentaal-demo";

/**
 * De rekentaal in vier regels: regel en uitleg. De regels zijn rekentaal en
 * worden niet vertaald, op de tekst van de kop na (welkom.syntax.kopVoorbeeld); de
 * uitleg staat onder welkom.syntax in werkruimte.json.
 */
const SYNTAX: [string, string][] = [
  ["# 1. Invoer", "kop"],
  ["L = 4.5 m", "waarde"],
  ["#if UC ≤ 1 … #end if", "voorwaarde"],
  ["$Plot{f(x) @ x = 0 : 10}", "grafiek"],
];

/**
 * Welkomstpaneel onderin de werkruimte: hoe de app werkt, een voorbeeld van
 * code naar uitkomst, en een snelle start (voorbeeldblad, module, leeg blad).
 * Verschijnt alleen de eerste keer dat iemand de app opent; via Help › Aan de slag
 * altijd terug.
 */
export default function Welkom({ onSluit }: { onSluit: () => void }) {
  const { t } = useTranslation("werkruimte");
  const { t: tc } = useTranslation();

  const voorbeeld = () => {
    if (modulesPerTemplate[VOORBEELD]) useModuleKiezer.getState().voegToe(VOORBEELD);
    onSluit();
  };
  const module = () => {
    onSluit();
    useModuleKiezer.getState().openen();
  };
  const leegBlad = () => {
    useModuleKiezer.getState().voegLeegBladToe();
    onSluit();
  };

  return (
    <section className="welkom-paneel" aria-label={t("welkom.titel")}>
      <div className="welkom-uitleg">
        <h2>{t("welkom.titel")}</h2>
        <p>{t("welkom.intro")}</p>
        <ol className="welkom-stroom">
          {(["project", "bladen", "rapport"] as const).map((stap) => (
            <li key={stap} title={t(`welkom.stap.${stap}.uitleg`)}>{t(`welkom.stap.${stap}.titel`)}</li>
          ))}
        </ol>
        {/* Wat je schrijft en wat de uitwerking ervan maakt. */}
        <div className="welkom-demo" aria-hidden="true">
          <code>M_Ed = q_d*L^2/8</code>
          <span className="welkom-pijl">→</span>
          <span className="welkom-uitkomst">
            <i>M</i><sub>Ed</sub> = <span className="welkom-breuk"><span>6.2 · 4.5²</span><span>8</span></span> = <b>15.69 kNm</b>
          </span>
        </div>
      </div>

      <div className="welkom-acties">
        <button className="welkom-tegel welkom-hoofd" onClick={voorbeeld}>
          <Icoon id="view.report-preview" maat={24} />
          <strong>{t("welkom.voorbeeld")}</strong>
          <span>{t("welkom.voorbeeldUitleg")}</span>
        </button>
        <button className="welkom-tegel" onClick={module}>
          <Icoon id="calculation.module-picker" uit="calculations" maat={24} />
          <strong>{t("welkom.module")}</strong>
          <span>{t("welkom.moduleUitleg")}</span>
        </button>
        <button className="welkom-tegel" onClick={leegBlad}>
          <Icoon id="file.new" maat={24} />
          <strong>{t("welkom.leegBlad")}</strong>
          <span>{t("welkom.leegBladUitleg")}</span>
        </button>
      </div>

      <div className="welkom-taal">
        <h3>{t("welkom.syntaxKop")}</h3>
        <dl>
          {SYNTAX.map(([code, sleutel]) => (
            <div key={sleutel}>
              <dt><code>{sleutel === "kop" ? t("welkom.syntax.kopVoorbeeld") : code}</code></dt>
              <dd>{t(`welkom.syntax.${sleutel}`)}</dd>
            </div>
          ))}
        </dl>
      </div>

      <button className="welkom-sluit" onClick={onSluit} title={tc("close")} aria-label={tc("close")}>
        <Icoon id="ui.close" />
      </button>
    </section>
  );
}

/**
 * Moet het welkomstpaneel bij dit opstarten verschijnen? Alleen de eerste keer: daarna
 * staat de instelling uit en blijft hij uit.
 */
export async function welkomBijStart(): Promise<boolean> {
  // In de browser zijn er geen voorkeuren op schijf: daar onthoudt de browser zelf dat het paneel er was.
  try {
    if (localStorage.getItem(GEZIEN) === "1") return false;
  } catch {
    /* geen opslag (privévenster): dan alleen de instelling */
  }
  const eersteKeer = await getSetting<boolean>(INSTELLING, true);
  if (eersteKeer) {
    await setSetting(INSTELLING, false);
    try {
      localStorage.setItem(GEZIEN, "1");
    } catch {
      /* zie hierboven */
    }
  }
  return eersteKeer;
}
