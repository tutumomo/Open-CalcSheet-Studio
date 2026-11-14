import { useTranslation } from "react-i18next";
import { useDesigner, Dim, Defs, HDim, VDim, StelselGetal, betonFill, clamp, UitkomstKop } from "./designerKit";
import { useBladUitkomst } from "./bladResultaat";
import "./VoetplaatDesigner.css";

/**
 * Parametrisch beeld bij het blad 鋼筋混凝土箱涵設計與檢核 (templates/tw-box-culvert.ts):
 * dwarsdoorsnede van de duiker met dak, wanden, bodem, de vouten in de hoeken en de
 * grondoverdekking erboven. Bij meerdere barrels (n_barrels) worden de buizen naast
 * elkaar getekend, met een eventuele tussenruimte s_gap. Het beeld rekent niet; de kop
 * toont de UC en het oordeel van het blad zelf. Maten in m, zoals in het blad.
 */
const MARKER = "鋼筋混凝土箱涵設計與檢核";

const SYM = { B: "B", H: "H", tt: "tt", tb: "tb", tw: "tw", hc: "Hc", sg: "s" };

const DEFAULTS: Record<string, number> = {
  B_clear: 3.0, H_clear: 2.0, t_top: 0.35, t_bot: 0.4, t_wall: 0.3, c_chamfer: 0.2, H_cover: 1.0,
  n_barrels: 1, s_gap: 0.0,
};

export default function TwBoxCulvertDesigner() {
  const ctx = useDesigner(MARKER, DEFAULTS);
  const uitkomst = useBladUitkomst();
  const { t } = useTranslation("beelden");
  if (!ctx.actief) return null;
  const { d, set, box, wrapRef } = ctx;

  const B = Math.max(0.5, d("B_clear")), Hh = Math.max(0.5, d("H_clear"));
  const tt = Math.max(0.05, d("t_top")), tb = Math.max(0.05, d("t_bot")), tw = Math.max(0.05, d("t_wall"));
  const cc = clamp(d("c_chamfer"), 0, Math.min(B, Hh) / 3), hc = Math.max(0, d("H_cover"));
  const n = clamp(Math.round(d("n_barrels") || 1), 1, 6);
  const sg = Math.max(0, d("s_gap") || 0);

  const barrelW = B + 2 * tw; // buitenbreedte van een barrel
  const totB = n * barrelW + (n - 1) * sg; // totale breedte over alle barrels
  const totH = hc + tt + Hh + tb;
  const W = box.w;
  const sc = Math.max(8, Math.min((W - 190) / totB, (Math.max(box.h, 380) - 140) / totH));
  const x0 = 70, y0 = 40;
  const X = (m: number) => x0 + m * sc, Y = (m: number) => y0 + m * sc; // m vanaf linkerkant / bovenkant
  const yDak = hc, yBin = hc + tt, yBodem = hc + tt + Hh;
  const xi0 = tw, xi1 = tw + B;
  // holle ruimte met vouten, per barrel met eigen linkerrand
  const holle = (off: number) =>
    [
      [xi0 + cc, yBin], [xi1 - cc, yBin], [xi1, yBin + cc], [xi1, yBodem - cc],
      [xi1 - cc, yBodem], [xi0 + cc, yBodem], [xi0, yBodem - cc], [xi0, yBin + cc],
    ].map(([x, y]) => `${X(off + x)},${Y(y)}`).join(" ");
  const barrels = Array.from({ length: n }, (_, k) => k * (barrelW + sg));
  const H = Y(totH) + 70;

  return (
    <div className="vd-panel">
      <UitkomstKop titel={t("twBoxCulvert.titel")} uitkomst={uitkomst} />
      <div className="vd-body" style={{ flex: 1, minHeight: 0, alignItems: "stretch" }}>
        <div className="vd-controls vd-compact" style={{ alignSelf: "flex-start" }}>
          <span className="vd-ctrl-h">{t("twBoxCulvert.kop")}</span>
          <label>{ctx.eenheden.label(t("twBoxCulvert.velden.chamfer"), "m")}
            <StelselGetal eenheden={ctx.eenheden} eenheid="m" step={0.05} waarde={d("c_chamfer")} onWijzig={(w) => set("c_chamfer", w || 0)} />
          </label>
          <label>{ctx.eenheden.label(t("twBoxCulvert.velden.cover"), "m")}
            <StelselGetal eenheden={ctx.eenheden} eenheid="m" step={0.1} waarde={d("H_cover")} onWijzig={(w) => set("H_cover", w || 0)} />
          </label>
          <label>{ctx.eenheden.label(t("twBoxCulvert.velden.barrels"), "")}
            <StelselGetal eenheden={ctx.eenheden} eenheid="" step={1} waarde={n} onWijzig={(w) => set("n_barrels", Math.round(w || 1))} />
          </label>
          {n > 1 && (
            <label>{ctx.eenheden.label(t("twBoxCulvert.velden.gap"), "m")}
              <StelselGetal eenheden={ctx.eenheden} eenheid="m" step={0.1} waarde={sg} onWijzig={(w) => set("s_gap", Math.max(0, w || 0))} />
            </label>
          )}
          <span className="gd-note">{t("twBoxCulvert.noot")}</span>
        </div>

        <div ref={wrapRef} className="vd-canvases" style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--theme-border-subtle, #d1d5db)", paddingLeft: 18 }}>
          <div className="vd-canvas">
            <div className="vd-caption">{t("twBoxCulvert.doorsnede")}</div>
            <div className="vd-stage" style={{ width: W, height: H, background: "transparent", border: "none", borderRadius: 0 }}>
              <svg width={W} height={H} className="vd-svg">
                <Defs k="bc" />
                {hc > 0 && <rect x={x0 - 24} y={y0} width={totB * sc + 48} height={hc * sc} fill="#d6c3a1" opacity={0.7} stroke="#a8916a" strokeWidth={1} />}
                {barrels.map((off, k) => (
                  <g key={k}>
                    <rect x={X(off)} y={Y(yDak)} width={barrelW * sc} height={(tt + Hh + tb) * sc} fill={betonFill("bc")} stroke="#374151" strokeWidth={1.4} />
                    <polygon points={holle(off)} fill="#ffffff" stroke="#374151" strokeWidth={1.2} />
                  </g>
                ))}
                <HDim k="bc" x0={X(xi0)} x1={X(xi1)} y={Y(totH) + 34} ext={Y(totH) + 4} />
                {n > 1 && sg > 0 && <HDim k="bc" x0={X(barrelW)} x1={X(barrelW + sg)} y={Y(totH) + 34} ext={Y(totH) + 4} />}
                <VDim k="bc" y0={Y(yBin)} y1={Y(yBodem)} x={X(totB) + 34} ext={X(totB) + 4} />
              </svg>
              <Dim ctx={ctx} name="B_clear" value={B} x={X(totB / 2) - 40} y={Y(totH) + 24} step={0.1} dec={2} label={SYM.B} eenheid="m" />
              <Dim ctx={ctx} name="H_clear" value={Hh} x={X(totB) + 42} y={Y(yBin + Hh / 2) - 10} step={0.1} dec={2} label={SYM.H} eenheid="m" />
              <Dim ctx={ctx} name="t_top" value={tt} x={X(totB / 2) - 24} y={Y(yDak + tt / 2) - 11} step={0.05} dec={2} label={SYM.tt} eenheid="m" />
              <Dim ctx={ctx} name="t_bot" value={tb} x={X(totB / 2) - 24} y={Y(yBodem + tb / 2) - 11} step={0.05} dec={2} label={SYM.tb} eenheid="m" />
              <Dim ctx={ctx} name="t_wall" value={tw} x={X(-0.05) - 74} y={Y(yBin + Hh / 2) - 10} step={0.05} dec={2} label={SYM.tw} eenheid="m" />
              {n > 1 && sg > 0 && (
                <Dim ctx={ctx} name="s_gap" value={sg} x={X(barrelW + sg / 2) - 24} y={Y(totH) + 24} step={0.1} dec={2} label={SYM.sg} eenheid="m" />
              )}
            </div>
          </div>
        </div>
      </div>
      <div className="vd-foot"><span>{t("twBoxCulvert.klik")}</span></div>
    </div>
  );
}
