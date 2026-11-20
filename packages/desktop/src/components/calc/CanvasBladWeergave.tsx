import { memo, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { useProjectStore, type Exemplaar } from "../../store/projectStore";
import { useProjectScope } from "../../store/actiefBlad";
import {
  INVOER_BREEDTE, klemOpVel, leesEenheden, maxBreedte, naastDeVouw, nieuwId, opRaster, schrijfEenheden, velBegin, velVan,
  verwijderEenheid, VEL_BREEDTE, zetEenheid, zoomNaWiel, type Eenheid,
} from "../../store/canvasBlad";
import { registreerBewaarder } from "../../store/spreadsheetBlad";
import { huisstijlVariabelen } from "../../rapport/model";
import { useRapportBureau } from "../rapport/afdruk/useRapportWeergave";
import { useDoorrekening } from "../../rekenen/doorrekening";
import { klikOpToetsKnop } from "../../rekenen/femToetsing";
import Icoon from "../Icoon";
import { zorgVoorKernstijlen } from "./bladDoorrekenen";
import { useEenheidMaten } from "./canvasMaten";
import { pxPerMm } from "./paginering";
import { schoonUitwerking } from "./uitwerkingOpschonen";
import "katex/dist/katex.min.css";
import "./PrintDocument.css";
import { belastingBronnen, type Belastingbron } from "../../rapport/belastingBronnen";
import { isLastBlok, lastSymbolen, ruimLastOp } from "../../store/lastBlok";
import LastBlokFormulier, { nieuwLastBlok } from "./LastBlokFormulier";
import "./CanvasBladWeergave.css";

/*
 * Een canvas-blad in de werkruimte (zie store/canvasBlad.ts): een vel met de
 * breedte van een A4 waarop formules als losse eenheden staan. Klik op een lege
 * plek voor een nieuwe, klik op een eenheid om hem te bewerken, sleep hem om hem
 * te verplaatsen. De doorrekening loopt via de worker, net als elk blad; hij
 * begint als een eenheid wordt verlaten of neergezet.
 *
 * De eenheden staan op het vel in de opmaak van de uitdraai (`print-opmaak`), in
 * millimeter: wat hier op een plek past, past daar op papier ook.
 */

/** Zoveel moet de muis bewegen voordat een klik een sleepbeweging wordt, in px. */
const SLEEP_DREMPEL = 4;

/** De uitkomst van één eenheid. Hetzelfde object zolang de html gelijk blijft, zie Preview.tsx. */
const Uitkomst = memo(function Uitkomst({ html }: { html: string }) {
  const inhoud = useMemo(() => ({ __html: schoonUitwerking(html) }), [html]);
  // De knop "opnieuw toetsen" van een @toets-blok; de klik selecteert de eenheid dan niet.
  return (
    <div
      className="ifc-calc"
      dangerouslySetInnerHTML={inhoud}
      onClick={(e) => {
        if (klikOpToetsKnop(e.target)) e.stopPropagation();
      }}
    />
  );
});

/** Levert de html iets op dat op het vel te zien is? Een eenheid met alleen `#hide` niet. */
const heeftInhoud = (html: string) => /<(?:svg|img|input|select|iframe|canvas)\b/i.test(html) || html.replace(/<[^>]*>/g, "").trim() !== "";

/** De eenheid waarvan het invoerveld open staat; bij een nieuwe staat hij nog niet in de bron. */
type OpenEenheid = Eenheid;

/** Wat er tijdens het slepen gebeurt: de eenheid, de startpunten, en of er al bewogen is. */
interface Sleep {
  id: string;
  px: number;
  py: number;
  x: number;
  y: number;
  bewogen: boolean;
}

/** Werkruimte: het vel met de eenheden van een canvas-blad. */
export function CanvasBladWeergave({ ex }: { ex: Exemplaar }) {
  const { t } = useTranslation("werkruimte");
  const zetBladBron = useProjectStore((s) => s.zetBron);
  const zetBladWaarde = useProjectStore((s) => s.zetWaarde);
  const scope = useProjectScope();
  const leesBron = useCallback(
    () => useProjectStore.getState().exemplaren.find((e) => e.id === ex.id)?.source ?? "",
    [ex.id],
  );
  const zetBron = useCallback((bron: string) => zetBladBron(ex.id, bron), [ex.id, zetBladBron]);
  const zetWaarde = useCallback((naam: string, waarde: string) => zetBladWaarde(ex.id, naam, waarde), [ex.id, zetBladWaarde]);
  // De belastingen uit hoofdstuk 5 van het rapport: daaruit kiest een lastblok.
  const belastingen = useProjectStore((s) => s.rapport.belastingen);
  const rapportTaal = useProjectStore((s) => s.rapport.taal);
  const bronnen = useMemo(() => belastingBronnen(belastingen, rapportTaal).bronnen, [belastingen, rapportTaal]);
  return (
    <CanvasVlak
      bladId={ex.id}
      naam={ex.naam}
      source={ex.source}
      waarden={ex.waarden}
      scope={scope}
      leesBron={leesBron}
      zetBron={zetBron}
      zetWaarde={zetWaarde}
      kop={<div className="canvas-kop">{ex.naam}</div>}
      uitleg={t("canvas.uitleg")}
      vellen
      bronnen={bronnen}
    />
  );
}

/** Wat een canvas nodig heeft: de tekst met merktekens, de invoer, en waar wijzigingen heen gaan. */
export interface CanvasVlakProps {
  /** Het blad, voor het overzicht van de uitkomsten; zonder telt de uitkomst daar niet mee. */
  bladId?: string;
  naam: string;
  source: string;
  waarden: Record<string, string>;
  scope: Record<string, unknown>;
  /** De tekst zoals hij nu bewaard is: tussen twee renders kan er al iets zijn veranderd. */
  leesBron: () => string;
  zetBron: (bron: string) => void;
  zetWaarde: (naam: string, waarde: string) => void;
  /** Boven het vlak op het vel: de kop van het blad, of het formulier van de projectgegevens. */
  kop: ReactNode;
  /** De tekst op een leeg vlak. */
  uitleg: string;
  /** Een blad op papier: met de vouwen tussen de vellen. Zonder groeit het vlak gewoon mee. */
  vellen?: boolean;
  /**
   * De belastingen uit hoofdstuk 5 van het rapport. Met deze lijst kan het canvas
   * lastblokken maken en bewerken (`@last`, LastBlokFormulier.tsx).
   */
  bronnen?: readonly Belastingbron[];
}

/** Zoveel lege ruimte staat er onder de onderste eenheid als er geen vellen zijn, in mm. */
const RUIMTE_ONDER = 40;

/** Het vel met de eenheden: klik op een lege plek voor een nieuwe, sleep om te verplaatsen. */
export function CanvasVlak({ bladId, naam, source, waarden, scope, leesBron, zetBron, zetWaarde, kop, uitleg, vellen = false, bronnen }: CanvasVlakProps) {
  const { t } = useTranslation("werkruimte");
  const bureau = useRapportBureau();

  useEffect(() => zorgVoorKernstijlen(), []);

  // Een tekst zonder merktekens (uit de API of de code) wordt hier één eenheid; de
  // doorrekening krijgt daarom steeds de tekst met merktekens.
  const bron = useMemo(() => schrijfEenheden(leesEenheden(source)), [source]);
  const eenheden = useMemo(() => leesEenheden(bron), [bron]);
  const { doorrekening, bezig } = useDoorrekening(bladId, bron, waarden, scope, naam);
  const htmlVan = useMemo(
    () => new Map((doorrekening?.eenheden ?? []).map((u) => [u.id, u.html])),
    [doorrekening],
  );

  const vlak = useRef<HTMLDivElement>(null);
  const maten = useEenheidMaten(vlak);
  const [open, zetOpen] = useState<OpenEenheid | null>(null);
  const openRef = useRef<OpenEenheid | null>(null);
  openRef.current = open;
  const [gesleept, zetGesleept] = useState<{ id: string; x: number; y: number } | null>(null);
  const sleep = useRef<Sleep | null>(null);

  const schuif = useRef<HTMLDivElement>(null);
  const papier = useRef<HTMLDivElement>(null);
  const [zoom, zetZoom] = useState(1);
  const zoomDoel = useRef(1);
  const [papierHoogte, zetPapierHoogte] = useState(0);
  /** Het punt onder de muis: op het scherm, en op het vel in px bij 100 %. */
  const anker = useRef<{ cx: number; cy: number; x: number; y: number } | null>(null);

  // Ctrl en scrollen zoomt rond het punt onder de muis. Niet via onWheel: React luistert
  // passief, en dan zoomt de hele webview mee. Er kunnen meer tikken komen voordat React
  // heeft getekend, dus de getoonde schaal komt uit het vel zelf en het doel loopt door.
  useEffect(() => {
    const el = schuif.current;
    if (!el) return;
    const wiel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const p = papier.current!;
      const r = p.getBoundingClientRect();
      const getoond = r.width / p.offsetWidth;
      anker.current = { cx: e.clientX, cy: e.clientY, x: (e.clientX - r.left) / getoond, y: (e.clientY - r.top) / getoond };
      zoomDoel.current = zoomNaWiel(zoomDoel.current, e.deltaY);
      zetZoom(zoomDoel.current);
    };
    el.addEventListener("wheel", wiel, { passive: false });
    return () => el.removeEventListener("wheel", wiel);
  }, []);

  // Na een zoomstap het punt onder de muis op zijn plek houden.
  useLayoutEffect(() => {
    const el = schuif.current;
    const p = papier.current;
    const a = anker.current;
    if (!el || !p || !a) return;
    anker.current = null;
    const r = p.getBoundingClientRect();
    el.scrollLeft += r.left + a.x * zoom - a.cx;
    el.scrollTop += r.top + a.y * zoom - a.cy;
  }, [zoom]);

  const huidigeBron = leesBron;

  /** Zet wat in het open invoerveld staat in het blad; een leeg veld haalt de eenheid weg. */
  const bewaarOpen = useCallback(() => {
    const o = openRef.current;
    if (!o) return;
    const nu = huidigeBron();
    const oud = leesEenheden(nu).find((e) => e.id === o.id);
    const tekst = o.tekst.trim();
    if (oud ? oud.tekst === tekst : !tekst) return;
    zetBron(tekst ? zetEenheid(nu, o.id, { x: o.x, y: o.y, tekst }) : verwijderEenheid(nu, o.id));
  }, [huidigeBron, zetBron]);

  // Opslaan vraagt om de laatste stand, ook van een veld dat nog openstaat; net
  // als de open werkmap (store/spreadsheetBlad.ts). Weggaan van het blad bewaart ook.
  useEffect(() => registreerBewaarder(async () => bewaarOpen()), [bewaarOpen]);
  useEffect(() => bewaarOpen, [bewaarOpen]);

  // Invoervelden en keuzelijsten in de uitkomsten: bij het verlaten naar de invoer
  // van het blad. Hun html is niet van React, dus luisteren op het vlak.
  useEffect(() => {
    const el = vlak.current;
    if (!el) return;
    const opWijziging = (e: Event) => {
      const veld = e.target as HTMLInputElement | HTMLSelectElement;
      const naam = veld.dataset?.var ?? veld.dataset?.prompt;
      if (naam && veld.closest("[data-eenheid]")) zetWaarde(naam, veld.value);
    };
    el.addEventListener("change", opWijziging);
    return () => el.removeEventListener("change", opWijziging);
  }, [zetWaarde]);

  /** Van een plek op het scherm naar millimeters op het vel. */
  const naarMm = (clientX: number, clientY: number) => {
    const el = vlak.current!;
    const r = el.getBoundingClientRect();
    const schaal = (r.width / el.offsetWidth) * pxPerMm();
    return { x: (clientX - r.left) / schaal, y: (clientY - r.top) / schaal };
  };

  // Een lastblok staat open als formulier, tenzij je verder wilt als gewone tekst.
  const [alsTekst, zetAlsTekst] = useState(false);
  const formulier = !!open && !!bronnen && !alsTekst && isLastBlok(open.tekst);
  const sluitOpen = () => {
    // Een formulier dat dichtgaat laat geen halve regels achter; een leeg blok verdwijnt.
    const o = openRef.current;
    if (o && formulier) openRef.current = { ...o, tekst: ruimLastOp(o.tekst) ?? "" };
    bewaarOpen();
    zetAlsTekst(false);
    zetOpen(null);
  };

  /** Het formulier schrijft elke wijziging meteen in het blad: er gaat niets verloren als je ergens anders klikt. */
  const wijzigLast = (tekst: string) => {
    if (!open) return;
    zetOpen({ ...open, tekst });
    zetBron(zetEenheid(huidigeBron(), open.id, { x: open.x, y: open.y, tekst }));
  };

  /** Een nieuw lastblok, onder alles wat er al staat. */
  const nieuweLast = () => {
    bewaarOpen();
    const nu = huidigeBron();
    const bestaand = leesEenheden(nu);
    const onder = Math.max(0, ...bestaand.map((u) => u.y + (maten[u.id]?.h ?? 10)));
    const y = opRaster(bestaand.length ? onder + 2 * 5 : 5);
    const id = nieuwId(new Set(bestaand.map((u) => u.id)));
    const tekst = nieuwLastBlok(lastSymbolen(nu));
    zetBron(zetEenheid(nu, id, { x: 0, y, tekst }));
    zetAlsTekst(false);
    zetOpen({ id, x: 0, y, tekst });
  };

  const opVlakKlik = (e: ReactMouseEvent) => {
    if ((e.target as HTMLElement).closest(".canvas-eenheid, .canvas-invoer, .lb")) return;
    if (formulier) {
      sluitOpen();
      return;
    }
    const mm = naarMm(e.clientX, e.clientY);
    const { x, y } = klemOpVel(opRaster(mm.x), opRaster(mm.y));
    zetOpen({ id: nieuwId(new Set(eenheden.map((u) => u.id))), x, y, tekst: "" });
  };

  const beginSlepen = (e: ReactPointerEvent<HTMLDivElement>, eenheid: Eenheid) => {
    if (e.button !== 0 || (e.target as HTMLElement).closest("input, select, button, a")) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    sleep.current = { id: eenheid.id, px: e.clientX, py: e.clientY, x: eenheid.x, y: eenheid.y, bewogen: false };
  };

  const volgSlepen = (e: ReactPointerEvent<HTMLDivElement>) => {
    const s = sleep.current;
    if (!s) return;
    if (!s.bewogen && Math.hypot(e.clientX - s.px, e.clientY - s.py) < SLEEP_DREMPEL) return;
    s.bewogen = true;
    const nu = naarMm(e.clientX, e.clientY);
    const start = naarMm(s.px, s.py);
    zetGesleept({ id: s.id, ...klemOpVel(opRaster(s.x + nu.x - start.x), opRaster(s.y + nu.y - start.y)) });
  };

  const eindSlepen = (eenheid: Eenheid) => {
    const s = sleep.current;
    sleep.current = null;
    if (!s) return;
    if (s.bewogen && gesleept) {
      // Neerzetten over de vouw kan niet: dan begint hij het volgende vel.
      const y = vellen ? naastDeVouw(gesleept.y, maten[eenheid.id]?.h ?? 0) : gesleept.y;
      if (gesleept.x !== eenheid.x || y !== eenheid.y) zetBron(zetEenheid(huidigeBron(), eenheid.id, { x: gesleept.x, y }));
    } else if (!s.bewogen) {
      zetOpen(eenheid);
    }
    zetGesleept(null);
  };

  // Altijd een vel meer dan er gevuld is: er blijft ruimte om iets neer te zetten.
  const onderkant = Math.max(0, ...eenheden.map((u) => u.y + (maten[u.id]?.h ?? 0)), open?.y ?? 0, gesleept?.y ?? 0);
  const aantalVellen = velVan(onderkant) + 2;
  const vlakHoogte = vellen ? velBegin(aantalVellen) : Math.max(onderkant + RUIMTE_ONDER, 2 * RUIMTE_ONDER);

  // Een schaal verandert de ruimte in de opmaak niet: die krijgt het vel van .canvas-schaal.
  // Elke render: ook de kop kan groeien (het formulier van de projectgegevens).
  useLayoutEffect(() => zetPapierHoogte(papier.current?.offsetHeight ?? 0));

  const zichtbaar = eenheden.filter((u) => u.id !== open?.id);
  return (
    <div className="canvas-weergave" ref={schuif}>
      {bronnen && (
        <div className="canvas-balk">
          <button type="button" title={t("lastblok.nieuwUitleg")} onClick={nieuweLast}>+ {t("lastblok.nieuw")}</button>
          <span>{t("lastblok.balkUitleg")}</span>
        </div>
      )}
      <div className="canvas-schaal" style={{ "--canvas-zoom": zoom, height: papierHoogte * zoom } as CSSProperties}>
      <div ref={papier} className={`canvas-papier print-opmaak${bezig ? " rekent" : ""}`} data-oa-theme="light" style={huisstijlVariabelen(bureau.huisstijl) as CSSProperties}>
        {kop}
        <div
          ref={vlak}
          className="canvas-vlak print-blad"
          style={{ width: `${VEL_BREEDTE}mm`, height: `${vlakHoogte}mm` }}
          onClick={opVlakKlik}
        >
          {eenheden.length === 0 && !open && <p className="canvas-uitleg">{uitleg}</p>}
          {vellen && Array.from({ length: aantalVellen - 1 }, (_, i) => (
            <div key={i} className="canvas-vouw" style={{ top: `${velBegin(i + 1)}mm` }}>
              <span>{t("canvas.pagina", { nummer: i + 2 })}</span>
            </div>
          ))}
          {zichtbaar.map((u) => {
            const plek = gesleept?.id === u.id ? gesleept : u;
            const maat = maten[u.id];
            const html = htmlVan.get(u.id);
            const x = Math.max(0, Math.min(plek.x, VEL_BREEDTE - (maat?.b ?? 0)));
            const overDeVouw = vellen && !!maat && naastDeVouw(plek.y, maat.h) !== plek.y;
            return (
              <div
                key={u.id}
                className={`canvas-eenheid${gesleept?.id === u.id ? " sleept" : ""}${overDeVouw ? " over-de-vouw" : ""}`}
                data-eenheid={u.id}
                title={overDeVouw ? t("canvas.overDeVouw") : t("canvas.eenheidUitleg")}
                style={{ left: `${x}mm`, top: `${plek.y}mm`, maxWidth: `${maxBreedte(plek.x)}mm` }}
                onPointerDown={(e) => beginSlepen(e, u)}
                onPointerMove={volgSlepen}
                onPointerUp={() => eindSlepen(u)}
                onPointerCancel={() => {
                  sleep.current = null;
                  zetGesleept(null);
                }}
              >
                {html !== undefined && heeftInhoud(html) ? <Uitkomst html={html} /> : <pre className="canvas-alleen-tekst">{u.tekst}</pre>}
                <button
                  className="canvas-weg"
                  title={t("canvas.verwijderen")}
                  onClick={() => zetBron(verwijderEenheid(huidigeBron(), u.id))}
                >
                  <Icoon id="edit.delete" uit="calculations" />
                </button>
              </div>
            );
          })}
          {open && formulier && (
            <div style={{ position: "absolute", left: `${Math.max(0, Math.min(open.x, VEL_BREEDTE - 150))}mm`, top: `${open.y}mm`, width: "150mm" }}>
              <LastBlokFormulier
                tekst={open.tekst}
                bronnen={bronnen ?? []}
                uitkomst={htmlVan.get(open.id) ? <Uitkomst html={htmlVan.get(open.id)!} /> : undefined}
                onWijzig={wijzigLast}
                onKlaar={sluitOpen}
                onVerwijder={() => {
                  zetBron(verwijderEenheid(huidigeBron(), open.id));
                  openRef.current = null;
                  zetOpen(null);
                }}
                onAlsTekst={() => zetAlsTekst(true)}
              />
            </div>
          )}
          {open && !formulier && (
            <textarea
              className="canvas-invoer"
              autoFocus
              spellCheck={false}
              value={open.tekst}
              placeholder={t("canvas.invoerVoorbeeld")}
              aria-label={t("canvas.invoerLabel")}
              style={{ left: `${Math.min(open.x, VEL_BREEDTE - INVOER_BREEDTE)}mm`, top: `${open.y}mm`, width: `${INVOER_BREEDTE}mm` }}
              onChange={(e) => zetOpen({ ...open, tekst: e.target.value })}
              onBlur={() => {
                bewaarOpen();
                zetAlsTekst(false);
                zetOpen(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  // Weg zonder te bewaren.
                  openRef.current = null;
                  zetOpen(null);
                } else if (e.key === "Enter" && e.ctrlKey) {
                  e.currentTarget.blur();
                }
              }}
            />
          )}
        </div>
      </div>
      </div>
    </div>
  );
}
