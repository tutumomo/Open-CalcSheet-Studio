import { useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Exemplaar } from "../../store/projectStore";
import { ExemplaarContext } from "../../store/actiefBlad";
import { designerVoor } from "./designerKeuze";
import { ucTekst, type Resultaat } from "./bladResultaat";
import { rekenversie } from "./bladVersie";
import { isEurocodeBlad } from "./eurocodeModules";
import { bladSoortVan, LosBladAfdruk } from "./bladSoorten";
import { isCanvasBlad, legOpVellen, maxBreedte } from "../../store/canvasBlad";
import { useEenheidMaten } from "./canvasMaten";
import type { CanvasUitwerking } from "./canvasRekenen";
import "./CanvasBladWeergave.css";
import { isJupyterBlad } from "../../store/jupyterBlad";
import "katex/dist/katex.min.css";
import "./JupyterBlad.css";
import { MATEN, type Maten } from "./paginering";
import { UitwerkingHtml } from "./UitwerkingHtml";
import "./PrintDocument.css";

/*
 * Eén rekenblad op papier. Staat los van PrintDocument omdat ook het
 * constructierapport het gebruikt (bijlage A); zo importeren het rapport en
 * PrintDocument elkaar niet over en weer.
 */

/*
 * Een losse uitdraai volgt de taal van de app, net als de uitwerking op het scherm. In
 * het rapport volgt alles de taal van het rapport (AfdrukTaal in afdrukTaal.tsx): daarom
 * hier `useTranslation` en niet de globale i18next.
 */

/**
 * Een canvas-blad op papier: de eenheden op hun positie, verdeeld over de vellen.
 * Elk vel is een blok met een eigen paginasprong, zo hoog als wat erop staat. De
 * maten worden hier gemeten: op papier is de letter anders dan op een los vel
 * zonder deze opmaak, en wat niet past, schuift (legOpVellen).
 */
export function CanvasVellen({ eenheden, bladId }: { eenheden: CanvasUitwerking[]; bladId?: string }) {
  const wortel = useRef<HTMLDivElement>(null);
  const maten = useEenheidMaten(wortel);
  const maatVan = (id: string) => maten[id] ?? { b: 0, h: 0 };
  const plekken = legOpVellen(eenheden.map((e) => ({ x: e.x, y: e.y, ...maatVan(e.id) })));
  const vellen: { eenheid: CanvasUitwerking; x: number; y: number }[][] = [];
  eenheden.forEach((eenheid, i) => {
    const { vel, x, y } = plekken[i];
    for (let v = vellen.length; v <= vel; v++) vellen.push([]);
    vellen[vel].push({ eenheid, x, y });
  });
  return (
    <div ref={wortel} className="print-canvas">
      {vellen.map((vel, i) => (
        <div
          key={i}
          className={i > 0 ? "print-canvas-vel print-nieuw-vel" : "print-canvas-vel"}
          style={{ height: `${Math.max(0, ...vel.map(({ eenheid, y }) => y + maatVan(eenheid.id).h)).toFixed(2)}mm` }}
        >
          {vel.map(({ eenheid, x, y }) => (
            <div
              key={eenheid.id}
              className="print-canvas-eenheid"
              data-eenheid={eenheid.id}
              style={{ left: `${x}mm`, top: `${y}mm`, maxWidth: `${maxBreedte(eenheid.x)}mm` }}
            >
              <UitwerkingHtml html={eenheid.html} bladId={bladId} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Het oordeel als klein label: groen, rood of neutraal. */
export function Oordeel({ r }: { r: Resultaat }) {
  const { t } = useTranslation("beelden");
  if (r.nietGetoetst) return <span className="print-oordeel neutraal">{t("kit.nietGetoetst")}</span>;
  if (r.voldoet === null) return <span className="print-oordeel neutraal">—</span>;
  return (
    <span className={`print-oordeel ${r.voldoet ? "goed" : "fout"}`}>
      {t(r.voldoet ? "afdruk.voldoet" : "afdruk.voldoetNiet")}
    </span>
  );
}

/**
 * Eén rekenblad in de uitdraai: de kop, het parametrische beeld, dan de
 * uitwerking. `nummer` is het volgnummer bij de losse bladen en het
 * bijlagenummer ("A.2") in het rapport.
 *
 * De rekenversie van het blad (bladVersie.ts) staat één keer op papier: in de
 * projectregel als die er is (een losse berekening), anders achter de
 * grondslag in de kop.
 *
 * `titelInKop`: de titelkop bovenaan de uitwerking vervalt, omdat de kop al
 * naam en grondslag noemt (bijlage A van het rapport). Alleen als er een
 * grondslag is: zonder staat de titel van de module nergens anders.
 *
 * Een blad van een aangemelde soort (bladSoorten.tsx, zoals een PDF of werkmap)
 * tekent zijn eigen onderdeel, binnen de bladspiegel van `maten` (de losse bladen
 * of het rapport). Een projectregel heeft het niet; er is niets mee gerekend.
 *
 * Een canvas-blad heeft dezelfde kop, met onder de kop zijn eenheden op hun
 * positie (`eenheden`, uit rekenBladDoor).
 *
 * `anker`: de plek van de kop voor de inhoudsopgave van het rapport.
 */
export function PrintBlad({ ex, html, nummer, resultaat, projectregel, titelInKop = false, maten = MATEN.bladen, anker, eenheden }: {
  ex: Exemplaar; html: string; nummer: number | string; resultaat: Resultaat; projectregel?: ReactNode;
  titelInKop?: boolean; maten?: Maten; anker?: string; eenheden?: CanvasUitwerking[];
}) {
  const { t, i18n } = useTranslation("beelden");
  const soort = bladSoortVan(ex);
  if (soort?.HeelBlad) return <soort.HeelBlad ex={ex} nummer={nummer} anker={anker} />;
  if (soort) return <LosBladAfdruk soort={soort} ex={ex} nummer={nummer} maten={maten} anker={anker} />;
  // Een Jupyter-blad heeft geen rekenversie, projectregel en oordeel, wel een uitwerking.
  if (isJupyterBlad(ex)) {
    return (
      <section className="print-blad print-jupyter">
        <header className="print-blad-kop" data-inhoud={anker}>
          <span className="print-blad-nr">{nummer}</span>
          <span className="print-blad-titel">
            <span className="print-blad-naam">{ex.naam}</span>
            <span className="print-blad-norm">{resultaat.norm}</span>
          </span>
        </header>
        <UitwerkingHtml html={html} bladId={ex.id} />
      </section>
    );
  }
  // Het beeld tekent zichzelf uit de waarden van dít exemplaar, niet uit het
  // blad dat toevallig openstaat. `alleenLezen` houdt tegen dat het afdrukken
  // standaardwaarden aanvult of iets anders aan het project verandert.
  const beeld = designerVoor(ex.source);
  const onderkop = [resultaat.norm, isEurocodeBlad(ex) ? t("afdruk.eurocodeKlein") : "", projectregel ? "" : `${t("afdruk.rekenversieKlein")} ${rekenversie(ex.source)}`]
    .filter(Boolean)
    .join(" · ");
  return (
    <section className={titelInKop && resultaat.norm ? "print-blad print-titel-in-kop" : "print-blad"}>
      <header className="print-blad-kop" data-inhoud={anker}>
        <span className="print-blad-nr">{nummer}</span>
        <span className="print-blad-titel">
          <span className="print-blad-naam">{ex.naam}</span>
          {onderkop && <span className="print-blad-norm">{onderkop}</span>}
        </span>
        <span className="print-blad-uitkomst">
          {resultaat.uc !== null && <span className="print-blad-uc">UC {ucTekst(resultaat.uc, i18n.language)}</span>}
          <Oordeel r={resultaat} />
        </span>
      </header>
      {projectregel}
      {beeld && (
        <div className="print-beeld">
          <ExemplaarContext.Provider value={{ exemplaar: ex, alleenLezen: true }}>
            {beeld}
          </ExemplaarContext.Provider>
        </div>
      )}
      {isCanvasBlad(ex) && eenheden ? <CanvasVellen eenheden={eenheden} bladId={ex.id} /> : <UitwerkingHtml html={html} bladId={ex.id} />}
    </section>
  );
}
