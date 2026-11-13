import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Defs, Dim, HDim, VDim, useBeeldEenheden, type DesignerCtx } from "../designerKit";
import type { BeeldProps } from "./InvoerPaneel";
import { standaardInvoer } from "./velden";
import {
  beeldIndeling,
  tekenDoorsnede,
  tekenPlattegrond,
  vloerInvoer,
  vloerModel,
  type Doorsnede,
  type Maat,
  type Maatlijn,
  type Plattegrond,
  type VloerInvoer,
  type VloerModel,
} from "./vloerOpPalen";

/**
 * Het beeld bij de bedrijfsvloer op palen, boven het invoerformulier: een plattegrond
 * van het paalraster met de vloerrand, de stroken, de ponskoppen en de paalkoppen, en een
 * doorsnede bij een paal met de diktes van vloer, strook en ponskop.
 *
 * Het beeld tekent uit de invoer zelf (vloerOpPalen.ts) en wacht dus niet op het blad of
 * op Open FEM Studio: ook wat in het formulier is getypt en nog niet is verstuurd, staat
 * er meteen. Een blauwe maat is aan te klikken en ter plekke te wijzigen, zoals bij de
 * ligger; die wijziging gaat direct naar het blad.
 */

/** De hoogte van een bijschrift boven een tekening (InvoerPaneel.css, .ip-bijschrift). */
const BIJSCHRIFT = 18;

function Maatlijnen({ k, lijnen }: { k: string; lijnen: Maatlijn[] }) {
  return (
    <>
      {lijnen.map((l, i) =>
        l.ligt ? <HDim key={i} k={k} x0={l.van} x1={l.tot} y={l.op} ext={l.ext} /> : <VDim key={i} k={k} y0={l.van} y1={l.tot} x={l.op} ext={l.ext} />,
      )}
    </>
  );
}

function Maten({ ctx, maten }: { ctx: DesignerCtx; maten: Maat[] }) {
  return (
    <>
      {maten.map((m) => (
        <Dim key={m.naam} ctx={ctx} name={m.naam} value={m.waarde} x={m.x} y={m.y} label={m.label} dec={m.dec} step={m.stap} eenheid={m.eenheid || undefined} />
      ))}
    </>
  );
}

function PlattegrondTekening({ p, m, ctx }: { p: Plattegrond; m: VloerModel; ctx: DesignerCtx }) {
  const rechts = p.vloer.x + p.vloer.b;
  const onder = p.vloer.y + p.vloer.h;
  // De paalrijen als as, één keer per rij en per kolom.
  const kolommen = p.palen.slice(0, m.n + 1).map((c) => c.x);
  const rijen = p.palen.filter((_, i) => i % (m.n + 1) === 0).map((c) => c.y);
  return (
    <div className="ip-tekening" style={{ width: p.breedte, height: p.hoogte }}>
      <svg className="ip-svg" width={p.breedte} height={p.hoogte}>
        <Defs k="vp" />
        <rect className="ip-vloer" x={p.vloer.x} y={p.vloer.y} width={p.vloer.b} height={p.vloer.h} />
        {p.stroken.map((r, i) => <rect key={`s${i}`} className="ip-strook" x={r.x} y={r.y} width={r.b} height={r.h} />)}
        {p.koppen.map((r, i) => <rect key={`k${i}`} className="ip-kop" x={r.x} y={r.y} width={r.b} height={r.h} />)}
        {kolommen.map((x, i) => <line key={`x${i}`} className="ip-as" x1={x} y1={p.vloer.y} x2={x} y2={onder} />)}
        {rijen.map((y, i) => <line key={`y${i}`} className="ip-as" x1={p.vloer.x} y1={y} x2={rechts} y2={y} />)}
        <rect className="ip-vloerrand" x={p.vloer.x} y={p.vloer.y} width={p.vloer.b} height={p.vloer.h} />
        {p.palen.map((c, i) => <circle key={`p${i}`} className="ip-paal" cx={c.x} cy={c.y} r={c.r} />)}
        <Maatlijnen k="vp" lijnen={p.lijnen} />
      </svg>
      <Maten ctx={ctx} maten={p.maten} />
    </div>
  );
}

function DoorsnedeTekening({ d, ctx }: { d: Doorsnede; ctx: DesignerCtx }) {
  const punten = (lijst: { x: number; y: number }[]) => lijst.map((pt) => `${pt.x.toFixed(1)},${pt.y.toFixed(1)}`).join(" ");
  const [links, rechts] = d.breuk;
  const top = d.beton[0].y;
  const paalOnder = d.paal.y + d.paal.h;
  // Een breuklijn: de vloer en de paal lopen door buiten het getekende stuk.
  const zigzag = (x: number, y0: number, y1: number) => {
    const m = (y0 + y1) / 2;
    return `M ${x} ${y0 - 5} L ${x} ${m - 4} L ${x - 4} ${m - 1.5} L ${x + 4} ${m + 1.5} L ${x} ${m + 4} L ${x} ${y1 + 5}`;
  };
  return (
    <div className="ip-tekening" style={{ width: d.breedte, height: d.hoogte }}>
      <svg className="ip-svg" width={d.breedte} height={d.hoogte}>
        <Defs k="vd" />
        {d.paal.b > 0 && (
          <>
            <rect className="ip-snedepaal" x={d.paal.x} y={d.paal.y} width={d.paal.b} height={d.paal.h} />
            <path className="ip-snedepaal-lijn" d={`M ${d.paal.x} ${d.paal.y} V ${paalOnder} M ${d.paal.x + d.paal.b} ${d.paal.y} V ${paalOnder}`} />
            <path className="ip-breuk" d={`M ${d.paal.x - 4} ${paalOnder} l ${d.paal.b / 2 + 1} 0 l 2 -3 l 2 6 l 2 -3 l ${d.paal.b / 2 + 1} 0`} />
          </>
        )}
        <polygon className="ip-beton" points={punten(d.beton)} />
        {d.strookLangs && <rect className="ip-strook" x={d.strookLangs.x} y={d.strookLangs.y} width={d.strookLangs.b} height={d.strookLangs.h} />}
        {d.strook && <rect className="ip-strook" x={d.strook.x} y={d.strook.y} width={d.strook.b} height={d.strook.h} />}
        {d.kop && <rect className="ip-kop" x={d.kop.x} y={d.kop.y} width={d.kop.b} height={d.kop.h} />}
        {/* De omtrek zonder de kopse kanten: daar loopt de vloer door. */}
        <polyline className="ip-betonlijn" points={punten(d.beton.slice(0, 2))} />
        <polyline className="ip-betonlijn" points={punten(d.beton.slice(2))} />
        <path className="ip-breuk" d={zigzag(links, top, d.beton[d.beton.length - 1].y)} />
        <path className="ip-breuk" d={zigzag(rechts, top, d.beton[2].y)} />
        <Maatlijnen k="vd" lijnen={d.lijnen} />
      </svg>
      <Maten ctx={ctx} maten={d.maten} />
    </div>
  );
}

/** De eenheid achter een bijschrift, als alle maten van de tekening dezelfde hebben en het stelsel hem niet omrekent. */
function eenheidVan(maten: Maat[], ctx: DesignerCtx): string {
  const eenheden = [...new Set(maten.map((m) => m.eenheid).filter(Boolean))];
  return eenheden.length === 1 && ctx.eenheden.doel(eenheden[0]) === null ? ` (${eenheden[0]})` : "";
}

export default function VloerOpPalenBeeld({ source, lees, zet }: BeeldProps) {
  const { t } = useTranslation("beelden");
  const eenheden = useBeeldEenheden();
  const [editing, setEditing] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ w: 480, h: 230 });
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setBox({ w: Math.floor(r.width), h: Math.floor(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const standaard = useMemo(() => standaardInvoer(source), [source]);
  const invoer = vloerInvoer(standaard, lees);
  const model = vloerModel(invoer);
  // Halverwege het typen van een maat (een nul, een minteken) is er even geen model: dan
  // blijft de laatste tekening staan, gedimd en met de reden erbij.
  const laatste = useRef<{ model: VloerModel; invoer: VloerInvoer } | null>(null);
  if (model) laatste.current = { model, invoer };
  const toon = laatste.current;

  const ctx: DesignerCtx = {
    actief: true,
    d: (naam) => invoer[naam]?.waarde ?? 0,
    set: (naam, waarde) => zet(naam, String(waarde)),
    box,
    wrapRef,
    editing,
    setEditing,
    ref: true,
    eenheden,
  };

  let tekeningen: ReactNode = null;
  let naast = true;
  if (toon) {
    // Het vak van de tekeningen, zonder de bijschriften erboven.
    const eerst = beeldIndeling(box.w, box.h - BIJSCHRIFT);
    const indeling = eerst.naast ? eerst : beeldIndeling(box.w, box.h - 2 * BIJSCHRIFT);
    naast = indeling.naast;
    const p = tekenPlattegrond(toon.model, toon.invoer, indeling.plattegrond.b, indeling.plattegrond.h);
    const d = tekenDoorsnede(toon.model, toon.invoer, indeling.doorsnede.b, indeling.doorsnede.h);
    tekeningen = (
      <>
        <figure className="ip-figuur">
          <figcaption className="ip-bijschrift">{t("vloerOpPalen.plattegrond")}<span>{eenheidVan(p.maten, ctx)}</span></figcaption>
          <PlattegrondTekening p={p} m={toon.model} ctx={ctx} />
        </figure>
        <figure className="ip-figuur">
          <figcaption className="ip-bijschrift">{t("vloerOpPalen.doorsnede")}<span>{eenheidVan(d.maten, ctx)}</span></figcaption>
          <DoorsnedeTekening d={d} ctx={ctx} />
        </figure>
      </>
    );
  }

  return (
    <>
      <div ref={wrapRef} className={`ip-tekeningen${naast ? "" : " ip-onder"}${toon && !model ? " ip-oud" : ""}`}>
        {tekeningen ?? <p className="ip-melding">{t("vloerOpPalen.geenModel")}</p>}
      </div>
      <div className="ip-legenda">
        {toon && toon.model.stroken.length > 0 && (
          <span className="ip-legenda-item"><span className="ip-legenda-vlak ip-is-strook" />{t("vloerOpPalen.strook")}</span>
        )}
        {toon && toon.model.kop && (
          <span className="ip-legenda-item"><span className="ip-legenda-vlak ip-is-kop" />{t("vloerOpPalen.kop")}</span>
        )}
        <span className="ip-legenda-item"><span className="ip-legenda-vlak ip-is-paal" />{t("vloerOpPalen.paal")}</span>
        <span className="ip-legenda-tekst">{toon && !model ? t("vloerOpPalen.oudeMaten") : t("vloerOpPalen.klik")}</span>
      </div>
    </>
  );
}
