import { useTranslation } from "react-i18next";
import { useDesigner, Dim, Defs, HDim, VDim, StelselGetal, betonFill, UitkomstKop } from "./designerKit";
import { useBladUitkomst } from "./bladResultaat";
import "./VoetplaatDesigner.css";

/**
 * Parametrisch beeld bij het blad 鋼筋混凝土排水溝與明渠水理設計檢核 (templates/tw-drainage-channel.ts):
 * doorsnede van de goot met bodembreedte, diepte, talud, wanddikte en bodemplaat. Het beeld rekent
 * niet; de kop toont de UC en het oordeel van het blad zelf. Maten in m, zoals in het blad.
 */
const MARKER = "鋼筋混凝土排水溝與明渠水理設計檢核";

const SYM = { B: "B", H: "H", tw: "tw", tb: "tb" };

const DEFAULTS: Record<string, number> = {
  B_chan: 0.6, H_chan: 0.8, z_side: 0, t_wall: 0.15, t_base: 0.15,
};

export default function TwDrainageChannelDesigner() {
  const ctx = useDesigner(MARKER, DEFAULTS);
  const uitkomst = useBladUitkomst();
  const { t } = useTranslation("beelden");
  if (!ctx.actief) return null;
  const { d, set, box, wrapRef } = ctx;

  const B = Math.max(0.2, d("B_chan")), Hh = Math.max(0.2, d("H_chan")), z = Math.max(0, d("z_side"));
  const tw = Math.max(0.05, d("t_wall")), tb = Math.max(0.05, d("t_base"));

  const W = box.w;
  const totB = B + 2 * z * Hh + 2 * tw, totH = Hh + tb;
  const sc = Math.max(10, Math.min((W - 190) / totB, (Math.max(box.h, 340) - 140) / totH));
  const x0 = 80, y0 = 40;
  // m: x vanaf de binnenvoet (0 = linker onderhoek van het kanaal), y omhoog vanaf de binnenbodem
  const ox = z * Hh + tw;
  const X = (m: number) => x0 + (m + ox) * sc, Y = (m: number) => y0 + (Hh - m) * sc;
  const uitwendig = [[-tw - z * Hh, Hh], [-tw, -tb], [B + tw, -tb], [B + tw + z * Hh, Hh]];
  const inwendig = [[-z * Hh, Hh], [0, 0], [B, 0], [B + z * Hh, Hh]];
  const pad = (pts: number[][]) => `M${pts.map(([x, y]) => `${X(x)},${Y(y)}`).join(" L")} Z`;
  const H = Y(-tb) + 70;

  return (
    <div className="vd-panel">
      <UitkomstKop titel={t("twDrainageChannel.titel")} uitkomst={uitkomst} />
      <div className="vd-body" style={{ flex: 1, minHeight: 0, alignItems: "stretch" }}>
        <div className="vd-controls vd-compact" style={{ alignSelf: "flex-start" }}>
          <span className="vd-ctrl-h">{t("twDrainageChannel.kop")}</span>
          <label>{t("twDrainageChannel.velden.z")}
            <input type="number" step={0.25} min={0} value={z} onChange={(e) => set("z_side", Math.max(0, parseFloat(e.target.value) || 0))} />
          </label>
          <label>{ctx.eenheden.label(SYM.tb, "m")}
            <StelselGetal eenheden={ctx.eenheden} eenheid="m" step={0.05} waarde={d("t_base")} onWijzig={(w) => set("t_base", w || 0)} />
          </label>
          <span className="gd-note">{t("twDrainageChannel.noot")}</span>
        </div>

        <div ref={wrapRef} className="vd-canvases" style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--theme-border-subtle, #d1d5db)", paddingLeft: 18 }}>
          <div className="vd-canvas">
            <div className="vd-caption">{t("twDrainageChannel.doorsnede")}</div>
            <div className="vd-stage" style={{ width: W, height: H, background: "transparent", border: "none", borderRadius: 0 }}>
              <svg width={W} height={H} className="vd-svg">
                <Defs k="dc" />
                <path d={`${pad(uitwendig)} ${pad(inwendig)}`} fillRule="evenodd" fill={betonFill("dc")} stroke="#374151" strokeWidth={1.4} />
                <HDim k="dc" x0={X(0)} x1={X(B)} y={Y(-tb) + 34} ext={Y(-tb) + 4} />
                <VDim k="dc" y0={Y(Hh)} y1={Y(0)} x={X(B + tw + z * Hh) + 34} ext={X(B + tw + z * Hh) + 4} />
              </svg>
              <Dim ctx={ctx} name="B_chan" value={B} x={X(B / 2) - 40} y={Y(-tb) + 24} step={0.05} dec={2} label={SYM.B} eenheid="m" />
              <Dim ctx={ctx} name="H_chan" value={Hh} x={X(B + tw + z * Hh) + 42} y={Y(Hh / 2) - 10} step={0.05} dec={2} label={SYM.H} eenheid="m" />
              <Dim ctx={ctx} name="t_wall" value={tw} x={X(-tw - z * Hh) - 78} y={Y(Hh / 2) - 10} step={0.05} dec={2} label={SYM.tw} eenheid="m" />
            </div>
          </div>
        </div>
      </div>
      <div className="vd-foot"><span>{t("twDrainageChannel.klik")}</span></div>
    </div>
  );
}
