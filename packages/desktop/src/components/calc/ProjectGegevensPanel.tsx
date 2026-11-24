import { ucTekst } from "./bladLezen";
import { lazy, Suspense, useCallback, useMemo, useState, type ReactNode } from "react";
import { Trans, useTranslation } from "react-i18next";
import { useProjectStore } from "../../store/projectStore";
import { useProjectScope } from "../../store/actiefBlad";
import {
  PROJECT_VELDEN, getalWaarde, kFiVoor, keuzesVoor, twIVoor, twIwVoor, twTerreinVoor, vervallenKeuze,
  type Keuze, type VeldDef,
} from "../../store/projectGegevens";
import { PROJECTBLAD, PROJECTBLAD_WAARDEN, projectBladVan, projectWaardenVan } from "../../store/projectBlad";
import TwWindKiezer from "./TwWindKiezer";
import WindAreaMap from "./WindAreaMap";
import LocatieKiezer from "./LocatieKiezer";
import EenhedenEditor from "./EenhedenEditor";
import { CanvasVlak } from "./CanvasBladWeergave";
import "./ProjectGegevensPanel.css";

/**
 * De koppen van PROJECT_VELDEN, naar hun sleutel onder gegevens.groepen in
 * werkruimte.json. De velden zelf staan daar onder gegevens.velden.<naam>.
 * Labels, toelichtingen en keuzes staan in de store in het Engels, zoals de API ze
 * teruggeeft; de vertaling gebeurt hier, bij het tonen. Een kop of veld zonder vertaling
 * toont de tekst uit de store.
 */
const ProjectModelVenster = lazy(() => import("./ProjectModelVenster"));

const GROEP_SLEUTELS: Record<string, string> = {
  "Units": "eenheden",
  "Calculation method": "rekenwijze",
  "Project": "project",
  "Basis of design (NEN-EN 1990 + NB)": "grondslagen",
  "Wind (NEN-EN 1991-1-4 + NB)": "wind",
  "Basis of design (Taiwan)": "twGrondslagen",
  "Site (Taiwan)": "twLocatie",
};

/** Een groep van PROJECT_VELDEN op zijn sleutel uit GROEP_SLEUTELS. */
function veldenVan(sleutel: string): VeldDef[] {
  return PROJECT_VELDEN.filter((v) => GROEP_SLEUTELS[v.groep] === sleutel);
}

/** Eén regel van het formulier: het label links, het veld rechts, de naam in de bladen eronder. */
function Rij({ label, naam, hint, children, onder }: {
  label: string;
  /** De naam waaronder de waarde in de bladen staat. */
  naam?: string;
  /** Normverwijzing of gebruiksregel: achter het i-teken, om het formulier kort te houden. */
  hint?: string;
  children: ReactNode;
  /** Onder het veld: een afgeleide waarde of een melding. */
  onder?: ReactNode;
}) {
  return (
    <label className="pg-rij">
      <span className="pg-rij-label">
        <span className="pg-rij-tekst">
          {label}
          {hint && <span className="pg-info" title={hint} aria-label={hint}>i</span>}
        </span>
        {naam && <code className="pg-var">{naam}</code>}
      </span>
      <span className="pg-rij-veld">
        {children}
        {onder}
      </span>
    </label>
  );
}

/**
 * De projectgegevens: een vel op het canvas. Bovenaan het formulier met wat voor het
 * héle project geldt (de gevolgklasse vul je één keer in, niet per blad), daaronder
 * een vlak waarop je zelf iets neerzet, net als op een canvas-blad. Wat daar staat,
 * rekent vóór elk blad (store/projectBlad.ts): een variabele die je hier maakt, geldt
 * in het hele project.
 *
 * Alles wat per constructiedeel verschilt (belastingen, afmetingen, materiaal) hoort
 * níét hier maar in het blad zelf, zodat twee exemplaren van dezelfde module elkaar
 * nooit in de weg zitten.
 */
export default function ProjectGegevensPanel() {
  const { t } = useTranslation("werkruimte");
  const gegevens = useProjectStore((s) => s.gegevens);
  const zetGegeven = useProjectStore((s) => s.zetGegeven);
  const projectNaam = useProjectStore((s) => s.projectNaam);
  const zetProjectNaam = useProjectStore((s) => s.zetProjectNaam);
  const exemplaren = useProjectStore((s) => s.exemplaren);
  const scope = useProjectScope();
  // De windgebied-kaart is een hulpmiddel, geen invoerveld — inklapbaar zodat
  // het formulier compact blijft voor wie het gebied al weet.
  const [modelOpen, zetModelOpen] = useState(false);
  const [kaartOpen, setKaartOpen] = useState(false);

  const cc = parseFloat(gegevens.CC ?? "2");
  const kFi = kFiVoor(Number.isFinite(cc) ? cc : 2);
  const klasseRuw = parseFloat(gegevens.tw_klasse ?? "4");
  const twKlasse = Number.isFinite(klasseRuw) ? klasseRuw : 4;
  const terreinRuw = parseFloat(gegevens.tw_terrein ?? "3");
  const twTerrein = twTerreinVoor(Number.isFinite(terreinRuw) ? terreinRuw : 3);

  const groepNaam = (sleutel: string) => t(`gegevens.groepen.${sleutel}`);
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

  const veld = (v: VeldDef) => {
    const ruw = gegevens[v.naam] ?? v.standaard;
    // 台灣版：數字欄位空白時顯示預設值；不是數字時標紅並提示會改用預設值
    const geenGetal = v.type === "getal" && getalWaarde(ruw) === undefined;
    return (
      <Rij
        key={v.naam}
        label={veldTekst(v, "label")}
        naam={v.naam === "eenheden" || v.naam === "rekenwijze" ? undefined : v.naam}
        hint={v.hint ? veldTekst(v, "hint") : undefined}
        onder={
          <>
            {geenGetal && (
              <span className="pg-afgeleid pg-fout">{t("gegevens.geenGetal", { standaard: v.standaard })}</span>
            )}
            {vervallenKeuze(v, ruw) && <span className="pg-melding">{t("gegevens.vervallen")}</span>}
            {v.naam === "CC" && (
              <span className="pg-afgeleid">
                {t("gegevens.afgeleid")} K<sub>FI</sub> = {ucTekst(kFi)}
              </span>
            )}
            {v.naam === "tw_klasse" && (
              <span className="pg-afgeleid">
                {t("gegevens.afgeleid")} I<sub>{t("gegevens.twNaarBron.aardbeving")}</sub> = {ucTekst(twIVoor(twKlasse))} · I<sub>{t("gegevens.twNaarBron.wind")}</sub> = {ucTekst(twIwVoor(twKlasse))}
              </span>
            )}
            {v.naam === "tw_terrein" && (
              <span className="pg-afgeleid">
                {t("gegevens.afgeleid")} α = {ucTekst(twTerrein.alpha)} · z<sub>g</sub> ={" "}
                {twTerrein.zg > 0 ? `${twTerrein.zg} m` : t("gegevens.twZgOnbekend")}
              </span>
            )}
          </>
        }
      >
        {v.type === "keuze" ? (
          // Een waarde die niet (meer) tussen de keuzes staat, komt er als
          // extra keuze bij; anders toont de lijst stil de eerste keuze.
          <select value={ruw} onChange={(e) => zetGegeven(v.naam, e.target.value)}>
            {keuzesVoor(v, ruw).map((o) => (
              <option key={o.waarde} value={o.waarde}>
                {keuzeLabel(v, o)}
              </option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            inputMode={v.type === "getal" ? "decimal" : undefined}
            aria-invalid={geenGetal ? true : undefined}
            value={gegevens[v.naam] ?? (v.type === "getal" ? v.standaard : "")}
            onChange={(e) => zetGegeven(v.naam, e.target.value)}
          />
        )}
      </Rij>
    );
  };

  // Het vlak met de eigen elementen: de rekentekst en invoer staan in de projectgegevens.
  const leesBron = useCallback(() => projectBladVan(useProjectStore.getState().gegevens), []);
  const zetBron = useCallback((bron: string) => zetGegeven(PROJECTBLAD, bron), [zetGegeven]);
  const zetWaarde = useCallback(
    (naam: string, waarde: string) => {
      const nu = projectWaardenVan(useProjectStore.getState().gegevens);
      zetGegeven(PROJECTBLAD_WAARDEN, JSON.stringify({ ...nu, [naam]: waarde }));
    },
    [zetGegeven],
  );
  const ruweWaarden = gegevens[PROJECTBLAD_WAARDEN];
  // eslint-disable-next-line react-hooks/exhaustive-deps -- alleen de invoer zelf telt
  const waarden = useMemo(() => projectWaardenVan(gegevens), [ruweWaarden]);

  const formulier = (
    <div className="pg-formulier">
      <header className="pg-kop">
        <h1>{t("algemeen.projectgegevens")}</h1>
        <p>{exemplaren.length === 0 ? t("gegevens.introGeen") : t("gegevens.intro", { count: exemplaren.length })}</p>
        <button type="button" onClick={() => zetModelOpen(true)}>{t("projectmodel.titel")}</button>
        {modelOpen && <Suspense fallback={null}><ProjectModelVenster sluit={() => zetModelOpen(false)} /></Suspense>}
      </header>

      <section className="pg-vak">
        <h2>{groepNaam("project")}</h2>
        <div className="pg-rijen pg-twee">
          <Rij label={t("gegevens.projectnaam")} hint={t("gegevens.projectnaamHint")}>
            <input
              type="text"
              value={projectNaam}
              placeholder={t("gegevens.projectnaamPlaceholder")}
              onChange={(e) => zetProjectNaam(e.target.value)}
            />
          </Rij>
          {veldenVan("project").map(veld)}
        </div>
        <div className="pg-onder">
          <LocatieKiezer />
        </div>
      </section>

      {/* 台灣版：台灣的設計基礎與工址放最上面 */}
      <div className="pg-naast">
        <section className="pg-vak">
          <h2>{groepNaam("twGrondslagen")}</h2>
          <div className="pg-rijen">{veldenVan("twGrondslagen").map(veld)}</div>
        </section>
        <section className="pg-vak">
          <h2>{groepNaam("twLocatie")}</h2>
          <div className="pg-rijen">{veldenVan("twLocatie").map(veld)}</div>
          <div className="pg-onder">
            <TwWindKiezer />
          </div>
        </section>
      </div>

      <section className="pg-vak">
        <h2>{groepNaam("eenheden")}</h2>
        <div className="pg-rijen">{veldenVan("eenheden").map(veld)}</div>
        <EenhedenEditor />
      </section>

      {/*
        台灣版：歐規（上游）的欄位仍保留，因為上游的 Eurocode 模組會讀它們，
        但收在底下的摺疊區。
      */}
      <details className="pg-euro">
        <summary>{t("gegevens.euroModules")}</summary>
        <p className="pg-hint">{t("gegevens.euroModulesHint")}</p>
        <div className="pg-naast">
          <section className="pg-vak">
            <h2>{groepNaam("grondslagen")}</h2>
            <div className="pg-rijen">{veldenVan("grondslagen").map(veld)}</div>
          </section>
          <section className="pg-vak">
            <h2>{groepNaam("wind")}</h2>
            <div className="pg-rijen">{veldenVan("wind").map(veld)}</div>
            <button type="button" className="pg-windkaart-toggle" onClick={() => setKaartOpen((o) => !o)}>
              <svg className={`panel-section-chevron${kaartOpen ? " open" : ""}`} width="10" height="10" viewBox="0 0 10 10"
                fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polyline points="2,3 5,6 8,3" />
              </svg>
              {t("gegevens.kaart")}
            </button>
          </section>
        </div>
        {kaartOpen && (
          <section className="pg-vak pg-windkaart">
            <WindAreaMap
              initialAddress={gegevens.locatie ?? ""}
              onWindGebiedChange={(gebied) => {
                if (gebied) zetGegeven("windgebied", String(gebied));
              }}
            />
          </section>
        )}
        <section className="pg-vak">
          <h2>{groepNaam("rekenwijze")}</h2>
          <div className="pg-rijen">{veldenVan("rekenwijze").map(veld)}</div>
        </section>
      </details>

      <p className="pg-voet">
        <Trans
          t={t}
          i18nKey="gegevens.voet"
          values={{ voorbeeld1: "γ_G = 1,2·K_FI", voorbeeld2: "#if CC ≡ 3" }}
          components={{ code: <code /> }}
        />
      </p>

      <header className="pg-eigen">
        <h2>{t("gegevens.eigenKop")}</h2>
        <p>{t("gegevens.eigenUitleg")}</p>
      </header>
    </div>
  );

  return (
    <CanvasVlak
      naam={t("algemeen.projectgegevens")}
      source={gegevens[PROJECTBLAD] ?? ""}
      waarden={waarden}
      scope={scope}
      leesBron={leesBron}
      zetBron={zetBron}
      zetWaarde={zetWaarde}
      kop={formulier}
      uitleg={t("gegevens.eigenLeeg")}
    />
  );
}
