import { ucTekst } from "./bladLezen";
import { Fragment, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useProjectStore } from "../../store/projectStore";
import {
  PROJECT_VELDEN, getalWaarde, kFiVoor, keuzesVoor, twIVoor, twIwVoor, twTerreinVoor, vervallenKeuze,
  type Keuze, type VeldDef,
} from "../../store/projectGegevens";
import TwWindKiezer from "./TwWindKiezer";
import WindAreaMap from "./WindAreaMap";
import LocatieKiezer from "./LocatieKiezer";
import EenhedenEditor from "./EenhedenEditor";
import "./ProjectGegevensPanel.css";

/**
 * De koppen van PROJECT_VELDEN, naar hun sleutel onder gegevens.groepen in
 * werkruimte.json. De velden zelf staan daar onder gegevens.velden.<naam>.
 * Labels, toelichtingen en keuzes staan in de store in het Engels, zoals de API ze
 * teruggeeft; de vertaling gebeurt hier, bij het tonen. Een kop of veld zonder vertaling
 * toont de tekst uit de store.
 */
const GROEP_SLEUTELS: Record<string, string> = {
  "Units": "eenheden",
  "Calculation method": "rekenwijze",
  "Project": "project",
  "Basis of design (NEN-EN 1990 + NB)": "grondslagen",
  "Wind (NEN-EN 1991-1-4 + NB)": "wind",
  "Basis of design (Taiwan)": "twGrondslagen",
  "Site (Taiwan)": "twLocatie",
};

/**
 * De Eurocode-groepen (upstream): ze blijven staan omdat de vier Eurocode-modules ze lezen,
 * maar zitten in een uitklapbaar blok onderaan. De Taiwanese groepen staan bovenaan.
 */
const EUROCODE_GROEPEN = new Set(["Calculation method", "Basis of design (NEN-EN 1990 + NB)", "Wind (NEN-EN 1991-1-4 + NB)"]);

/**
 * Formulier met de gegevens die voor het héle project gelden.
 *
 * Wat je hier invult werkt door in elk rekenblad — de gevolgklasse vul je één
 * keer in, niet per blad. Alles wat per constructiedeel verschilt (belastingen,
 * afmetingen, materiaal) hoort níét hier maar in het blad zelf, zodat twee
 * exemplaren van dezelfde module elkaar nooit in de weg zitten.
 */
export default function ProjectGegevensPanel() {
  const { t } = useTranslation("werkruimte");
  const gegevens = useProjectStore((s) => s.gegevens);
  const zetGegeven = useProjectStore((s) => s.zetGegeven);
  const projectNaam = useProjectStore((s) => s.projectNaam);
  const zetProjectNaam = useProjectStore((s) => s.zetProjectNaam);
  const exemplaren = useProjectStore((s) => s.exemplaren);
  // De windgebied-kaart is een hulpmiddel, geen invoerveld — inklapbaar zodat
  // het formulier compact blijft voor wie het gebied al weet.
  const [kaartOpen, setKaartOpen] = useState(true);

  const groepen = useMemo(() => {
    const uit: { naam: string; velden: VeldDef[] }[] = [];
    for (const veld of PROJECT_VELDEN) {
      let groep = uit.find((g) => g.naam === veld.groep);
      if (!groep) {
        groep = { naam: veld.groep, velden: [] };
        uit.push(groep);
      }
      groep.velden.push(veld);
    }
    return uit;
  }, []);

  const cc = parseFloat(gegevens.CC ?? "2");
  const kFi = kFiVoor(Number.isFinite(cc) ? cc : 2);
  const klasseRuw = parseFloat(gegevens.tw_klasse ?? "4");
  const twKlasse = Number.isFinite(klasseRuw) ? klasseRuw : 4;
  const terreinRuw = parseFloat(gegevens.tw_terrein ?? "3");
  const twTerrein = twTerreinVoor(Number.isFinite(terreinRuw) ? terreinRuw : 3);

  const groepNaam = (naam: string) => {
    const sleutel = GROEP_SLEUTELS[naam];
    return sleutel ? t(`gegevens.groepen.${sleutel}`, { defaultValue: naam }) : naam;
  };
  const veldTekst = (veld: VeldDef, deel: "label" | "hint") =>
    t(`gegevens.velden.${veld.naam}.${deel}`, { defaultValue: veld[deel] ?? "" });
  // Dezelfde keuzes als keuzesVoor, met vertaalde labels. Een vervallen of
  // onbekende keuze krijgt hier opnieuw zijn tekst, op dezelfde manier als in
  // de store: "10 jaar — vervallen keuze, gerekend als 15 jaar".
  const keuzeLabel = (veld: VeldDef, keuze: Keuze): string => {
    if (veld.opties?.some((o) => o.waarde === keuze.waarde)) {
      return t(`gegevens.velden.${veld.naam}.opties.${keuze.waarde}`, { defaultValue: keuze.label });
    }
    const oud = vervallenKeuze(veld, keuze.waarde);
    if (!oud) return t("gegevens.onbekendeKeuze", { waarde: keuze.waarde });
    const naar = veld.opties?.find((o) => o.waarde === oud.naar);
    return t("gegevens.vervallenKeuze", {
      label: t(`gegevens.velden.${veld.naam}.vervallen.${oud.waarde}`, { defaultValue: oud.label }),
      // Van de vervanger alleen het deel vóór de toelichting: "50 jaar".
      vervanger: naar ? keuzeLabel(veld, naar).split(" — ")[0] : oud.naar,
    });
  };

  const toonGroep = (groep: { naam: string; velden: VeldDef[] }) => (
        <div className="pg-groep" key={groep.naam}>
          <h2>{groepNaam(groep.naam)}</h2>
          {groep.velden.map((veld) => (
            <Fragment key={veld.naam}>
            <label className="pg-veld">
              <span className="pg-label">
                {veldTekst(veld, "label")}
                <code className="pg-var">{veld.naam}</code>
              </span>
              {veld.type === "keuze" ? (
                // Een waarde die niet (meer) tussen de keuzes staat, komt er als
                // extra keuze bij; anders toont de lijst stil de eerste keuze.
                <select
                  value={gegevens[veld.naam] ?? veld.standaard}
                  onChange={(e) => zetGegeven(veld.naam, e.target.value)}
                >
                  {keuzesVoor(veld, gegevens[veld.naam] ?? veld.standaard).map((o) => (
                    <option key={o.waarde} value={o.waarde}>
                      {keuzeLabel(veld, o)}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  inputMode={veld.type === "getal" ? "decimal" : undefined}
                  aria-invalid={veld.type === "getal" && getalWaarde(gegevens[veld.naam] ?? veld.standaard) === undefined ? true : undefined}
                  value={gegevens[veld.naam] ?? (veld.type === "getal" ? veld.standaard : "")}
                  onChange={(e) => zetGegeven(veld.naam, e.target.value)}
                />
              )}
              {veld.type === "getal" && getalWaarde(gegevens[veld.naam] ?? veld.standaard) === undefined && (
                <span className="pg-afgeleid pg-fout">{t("gegevens.geenGetal", { standaard: veld.standaard })}</span>
              )}
              {veld.hint && <span className="pg-hint">{veldTekst(veld, "hint")}</span>}
              {vervallenKeuze(veld, gegevens[veld.naam] ?? "") && (
                <span className="pg-afgeleid">{t("gegevens.vervallen")}</span>
              )}
              {veld.naam === "CC" && (
                <span className="pg-afgeleid">
                  {t("gegevens.afgeleid")} K<sub>FI</sub> = {ucTekst(kFi)}
                </span>
              )}
              {veld.naam === "tw_klasse" && (
                <span className="pg-afgeleid">
                  {t("gegevens.afgeleid")} I<sub>{t("gegevens.twNaarBron.aardbeving")}</sub> = {ucTekst(twIVoor(twKlasse))} · I<sub>{t("gegevens.twNaarBron.wind")}</sub> = {ucTekst(twIwVoor(twKlasse))}
                </span>
              )}
              {veld.naam === "tw_terrein" && (
                <span className="pg-afgeleid">
                  {t("gegevens.afgeleid")} α = {ucTekst(twTerrein.alpha)} · z<sub>g</sub> ={" "}
                  {twTerrein.zg > 0 ? `${twTerrein.zg} m` : t("gegevens.twZgOnbekend")}
                </span>
              )}
            </label>
            {veld.naam === "eenheden" && <EenhedenEditor />}
            {veld.naam === "locatie" && <LocatieKiezer />}
            {veld.naam === "tw_V10" && <TwWindKiezer />}
            {veld.naam === "windgebied" && (
              <div className="pg-windkaart">
                <button
                  type="button"
                  className="pg-windkaart-toggle"
                  onClick={() => setKaartOpen((o) => !o)}
                >
                  <svg className={`panel-section-chevron${kaartOpen ? " open" : ""}`} width="10" height="10" viewBox="0 0 10 10"
                    fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polyline points="2,3 5,6 8,3" />
                  </svg>
                  {t("gegevens.kaart")}
                </button>
                {kaartOpen && (
                  <WindAreaMap
                    initialAddress={gegevens.locatie ?? ""}
                    onWindGebiedChange={(gebied) => {
                      if (gebied) zetGegeven("windgebied", String(gebied));
                    }}
                  />
                )}
              </div>
            )}
            </Fragment>
          ))}
        </div>
  );

  return (
    <div className="pg-panel">
      <div className="pg-kop">
        <h1>{t("algemeen.projectgegevens")}</h1>
        <p>
          {exemplaren.length === 0
            ? t("gegevens.introGeen")
            : t("gegevens.intro", { count: exemplaren.length })}
        </p>
      </div>

      <div className="pg-groep">
        <h2>{t("gegevens.bestand")}</h2>
        <label className="pg-veld">
          <span className="pg-label">{t("gegevens.projectnaam")}</span>
          <input
            type="text"
            value={projectNaam}
            placeholder={t("gegevens.projectnaamPlaceholder")}
            onChange={(e) => zetProjectNaam(e.target.value)}
          />
          <span className="pg-hint">{t("gegevens.projectnaamHint")}</span>
        </label>
      </div>

      {groepen.filter((g) => !EUROCODE_GROEPEN.has(g.naam)).map(toonGroep)}

      <details className="pg-euro">
        <summary>{t("gegevens.euroModules")}</summary>
        <p className="pg-hint">{t("gegevens.euroModulesHint")}</p>
        {groepen.filter((g) => EUROCODE_GROEPEN.has(g.naam)).map(toonGroep)}
      </details>

      <p className="pg-voet">
        <Trans
          t={t}
          i18nKey="gegevens.voet"
          values={{ voorbeeld1: "γ_G = 1,2·K_FI", voorbeeld2: "#if CC ≡ 3" }}
          components={{ code: <code /> }}
        />
      </p>
    </div>
  );
}
