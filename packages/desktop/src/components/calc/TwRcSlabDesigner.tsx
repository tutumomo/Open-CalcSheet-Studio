import { useTranslation } from "react-i18next";
import { useDesigner, Dim, Ro, Defs, HDim, VDim, StelselGetal, betonFill, clamp, UitkomstKop } from "./designerKit";
import { useBladUitkomst } from "./bladResultaat";
import "./VoetplaatDesigner.css";

/**
 * Parametrisch beeld bij het blad 鋼筋混凝土單向板設計與檢核 (templates/tw-rc-slab.ts):
 * doorsnede van een strook van 1 m met de hoofdstaven (punten) onderin op afstand s en de
 * krimp- en temperatuurstaven (lijn) erboven, met dekking en plaatdikte. Het beeld rekent niet;
 * de kop toont de UC en het oordeel van het blad zelf. De strook toont het veld (positief moment).
 */
const MARKER = "鋼筋混凝土單向板設計與檢核";

const SYM = { h: "h", c: "c", s: "s" };

const DEFAULTS: Record<string, number> = {
  h: 150, cover: 20, bar: 13, s: 150, bar_t: 10, s_t: 250,
};

/** Staafnummers D van het blad en de bijbehorende diameter (mm). */
const D_NR = [10, 13, 16, 19, 22, 25];
const D_MM = [9.53, 12.7, 15.9, 19.1, 22.2, 25.4];
const dia = (nr: number) => D_MM[Math.max(0, D_NR.indexOf(Math.round(nr)))];
const nrOf = (nr: number) => (D_NR.includes(Math.round(nr)) ? Math.round(nr) : 13);

export default function TwRcSlabDesigner() {
  const ctx = useDesigner(MARKER, DEFAULTS);
  const uitkomst = useBladUitkomst();
  const { t } = useTranslation("beelden");
  if (!ctx.actief) return null;
  const { d, set, box, wrapRef } = ctx;

  const h = Math.max(60, d("h")), c = clamp(d("cover"), 10, h / 3);
  const db = dia(d("bar")), dt = dia(d("bar_t"));
  const s = clamp(d("s"), 50, 500), sT = clamp(d("s_t"), 50, 600);
  const BREED = 1000; // mm: de strook

  const W = box.w;
  const sc = Math.max(0.05, Math.min((W - 150) / BREED, (Math.max(box.h, 300) - 130) / h, 0.6));
  const x0 = 60, y0 = 40, pw = BREED * sc, ph = h * sc;
  const yMaat = y0 + ph + 34;
  const pX = (mm: number) => x0 + mm * sc, pY = (mm: number) => y0 + ph - mm * sc;

  // hoofdstaven: punten op afstand s, de eerste op s/2 vanaf de rand
  const n = Math.max(1, Math.floor(BREED / s));
  const x1 = (BREED - (n - 1) * s) / 2;
  const punten = Array.from({ length: n }, (_, i) => x1 + i * s);
  const yMain = c + db / 2;
  const yTemp = c + db + dt / 2;
  const H = yMaat + 50;

  return (
    <div className="vd-panel">
      <UitkomstKop titel={t("twRcSlab.titel")} uitkomst={uitkomst} />
      <div className="vd-body" style={{ flex: 1, minHeight: 0, alignItems: "stretch" }}>
        <div className="vd-controls vd-compact" style={{ alignSelf: "flex-start" }}>
          <span className="vd-ctrl-h">{t("twRcSlab.kop")}</span>
          <label>{ctx.eenheden.label(t("twRcSlab.velden.cover"), "mm")}
            <StelselGetal eenheden={ctx.eenheden} eenheid="mm" step={5} waarde={d("cover")} onWijzig={(w) => set("cover", w || 0)} />
          </label>
          <label>{t("twRcSlab.velden.bar")}
            <select value={nrOf(d("bar"))} onChange={(e) => set("bar", parseInt(e.target.value))}>
              {D_NR.map((v) => <option key={v} value={v}>{`D${v}`}</option>)}
            </select>
          </label>
          <label>{t("twRcSlab.velden.barT")}
            <select value={nrOf(d("bar_t"))} onChange={(e) => set("bar_t", parseInt(e.target.value))}>
              {D_NR.map((v) => <option key={v} value={v}>{`D${v}`}</option>)}
            </select>
          </label>
          <span className="gd-note">{t("twRcSlab.noot")}</span>
        </div>

        <div ref={wrapRef} className="vd-canvases" style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--theme-border-subtle, #d1d5db)", paddingLeft: 18 }}>
          <div className="vd-canvas">
            <div className="vd-caption">{t("twRcSlab.doorsnede")}</div>
            <div className="vd-stage" style={{ width: W, height: H, background: "transparent", border: "none", borderRadius: 0 }}>
              <svg width={W} height={H} className="vd-svg">
                <Defs k="sl" />
                <rect x={x0} y={y0} width={pw} height={ph} fill={betonFill("sl")} stroke="#374151" strokeWidth={1.4} />
                <line x1={pX(6)} y1={pY(yTemp)} x2={pX(BREED - 6)} y2={pY(yTemp)} stroke="#1d4ed8" strokeWidth={Math.max(1.6, dt * sc)} />
                {punten.map((x, i) => (
                  <circle key={i} cx={pX(x)} cy={pY(yMain)} r={Math.max(2.5, (db / 2) * sc)} fill="#111827" />
                ))}
                <HDim k="sl" x0={x0} x1={x0 + pw} y={yMaat} ext={y0 + ph + 4} />
                <VDim k="sl" y0={y0} y1={y0 + ph} x={x0 + pw + 30} ext={x0 + pw + 4} />
              </svg>
              <Dim ctx={ctx} name="h" value={h} x={x0 + pw + 38} y={y0 + ph / 2} step={10} label={SYM.h} eenheid="mm" />
              <Dim ctx={ctx} name="cover" value={c} x={x0 + 4} y={y0 - 30} step={5} label={SYM.c} eenheid="mm" />
              <Dim ctx={ctx} name="s" value={s} x={x0 + pw / 2 - 30} y={yMaat - 10} step={10} label={SYM.s} eenheid="mm" />
              <Dim ctx={ctx} name="s_t" value={sT} x={x0 + pw / 2 + 50} y={y0 - 30} step={10} label="s_t" eenheid="mm" />
              <Ro text={`Ø${db} @ ${Math.round(s)}  ·  Ø${dt} @ ${Math.round(sT)}`} x={x0 + 4} y={y0 + ph + 6} />
            </div>
          </div>
        </div>
      </div>
      <div className="vd-foot"><span>{t("twRcSlab.klik")}</span></div>
    </div>
  );
}
