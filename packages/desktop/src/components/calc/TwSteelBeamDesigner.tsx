import { useTranslation } from "react-i18next";
import { useDesigner, Dim, Ro, Defs, HDim, VDim, StelselGetal, clamp, UitkomstKop } from "./designerKit";
import { useBladUitkomst } from "./bladResultaat";
import { hProfiel, hProfielen, hProfielPad } from "./TwHProfiel";
import "./VoetplaatDesigner.css";

/**
 * Parametrisch beeld bij het blad 鋼結構熱軋 H 型鋼梁設計與檢核 (templates/tw-steel-beam.ts):
 * doorsnede van het gekozen H-profiel (CNS 1490) met h, b, tf, tw, en een overspanningstekening met
 * de steunpunten en het onsteunde deel Lb. Het beeld rekent niet; de kop toont de UC en het oordeel
 * van het blad zelf. Maten: doorsnede in mm, overspanning in m.
 */
const MARKER = "鋼結構熱軋 H 型鋼梁設計與檢核";

const SYM = { L: "L", Lb: "Lb" };

const DEFAULTS: Record<string, number> = {
  design_method: 1, f_y_in: 325, section_id: 14, L_span: 6.0, L_b: 3.0, C_b: 1.0,
};

/** Ids die het blad aanbiedt (de @select-lijst van tw-steel-beam.ts). */
const IDS = [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

export default function TwSteelBeamDesigner() {
  const ctx = useDesigner(MARKER, DEFAULTS);
  const uitkomst = useBladUitkomst();
  const { t } = useTranslation("beelden");
  if (!ctx.actief) return null;
  const { d, set, box, wrapRef } = ctx;

  const regel = hProfiel(Math.round(d("section_id")) || 14);
  const [, naam, h, b] = regel;
  const L = Math.max(0.5, d("L_span")), Lb = clamp(d("L_b"), 0.1, L);

  const W = box.w;
  const smal = W < 560;
  const secW = smal ? W : Math.round(W * 0.45);
  const sc = Math.max(0.05, Math.min((secW - 120) / b, (Math.max(box.h, 340) - 140) / h, 1.6));
  const cx = smal ? W / 2 : 40 + secW / 2, cy = 50 + (h * sc) / 2;

  // overspanningstekening
  const ax = smal ? 70 : secW + 60, aW = smal ? W - 140 : W - secW - 120;
  const aY = smal ? cy + h * sc / 2 + 90 : cy;
  const aH = Math.min(110, Math.max(box.h, 340) - 120);
  const aSc = aW / L;
  const H = smal ? aY + aH + 90 : Math.max(cy + h * sc / 2 + 80, aY + aH + 80);

  return (
    <div className="vd-panel">
      <UitkomstKop titel={t("twSteelBeam.titel")} uitkomst={uitkomst} />
      <div className="vd-body" style={{ flex: 1, minHeight: 0, alignItems: "stretch" }}>
        <div className="vd-controls vd-compact" style={{ alignSelf: "flex-start" }}>
          <span className="vd-ctrl-h">{t("twSteelBeam.kop")}</span>
          <label>{t("twSteelBeam.velden.section")}
            <select value={regel[0]} onChange={(e) => set("section_id", parseInt(e.target.value))}>
              {hProfielen(IDS).map((r) => <option key={r[0]} value={r[0]}>{r[1]}</option>)}
            </select>
          </label>
          <label>{ctx.eenheden.label(t("twSteelBeam.velden.Lspan"), "m")}
            <StelselGetal eenheden={ctx.eenheden} eenheid="m" step={0.5} waarde={d("L_span")} onWijzig={(w) => set("L_span", w || 0)} />
          </label>
          <label>{ctx.eenheden.label(t("twSteelBeam.velden.Lb"), "m")}
            <StelselGetal eenheden={ctx.eenheden} eenheid="m" step={0.25} waarde={d("L_b")} onWijzig={(w) => set("L_b", w || 0)} />
          </label>
          <span className="gd-note">{t("twSteelBeam.noot")}</span>
        </div>

        <div ref={wrapRef} className="vd-canvases" style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--theme-border-subtle, #d1d5db)", paddingLeft: 18 }}>
          <div className="vd-canvas">
            <div className="vd-caption">{t("twSteelBeam.doorsnede")}</div>
            <div className="vd-stage" style={{ width: W, height: H, background: "transparent", border: "none", borderRadius: 0 }}>
              <svg width={W} height={H} className="vd-svg">
                <Defs k="sb" />
                <path d={hProfielPad(regel, cx, cy, sc)} fill="#cbd5e1" stroke="#374151" strokeWidth={1.3} />
                <HDim k="sb" x0={cx - (b / 2) * sc} x1={cx + (b / 2) * sc} y={cy + (h / 2) * sc + 34} ext={cy + (h / 2) * sc + 4} />
                <VDim k="sb" y0={cy - (h / 2) * sc} y1={cy + (h / 2) * sc} x={cx + (b / 2) * sc + 32} ext={cx + (b / 2) * sc + 4} />
                {/* overspanning */}
                <line x1={ax} y1={aY} x2={ax + aW} y2={aY} stroke="#374151" strokeWidth={2.4} />
                <polygon points={`${ax - 11},${aY + 20} ${ax + 11},${aY + 20} ${ax},${aY}`} fill="#9ca3af" stroke="#374151" strokeWidth={1.2} />
                <polygon points={`${ax + aW - 11},${aY + 20} ${ax + aW + 11},${aY + 20} ${ax + aW},${aY}`} fill="#9ca3af" stroke="#374151" strokeWidth={1.2} />
                <line x1={ax + Lb * aSc} y1={aY - 26} x2={ax + Lb * aSc} y2={aY - 6} stroke="#1d4ed8" strokeWidth={1.6} />
                <line x1={ax + Lb * aSc + 6} y1={aY - 20} x2={ax + Lb * aSc} y2={aY - 6} stroke="#1d4ed8" strokeWidth={1.6} />
                <line x1={ax + Lb * aSc - 6} y1={aY - 20} x2={ax + Lb * aSc} y2={aY - 6} stroke="#1d4ed8" strokeWidth={1.6} />
                <HDim k="sb" x0={ax} x1={ax + aW} y={aY + 46} ext={aY + 22} />
              </svg>
              <Dim ctx={ctx} name="L_span" value={L} x={ax + aW / 2 - 40} y={aY + 36} step={0.5} dec={2} label={SYM.L} eenheid="m" />
              <Dim ctx={ctx} name="L_b" value={Lb} x={ax + (Lb * aSc) / 2 - 24} y={aY - 44} step={0.25} dec={2} label={SYM.Lb} eenheid="m" />
              <Ro text={`${naam}  ·  h=${h} b=${b} tf=${regel[5]} tw=${regel[4]} mm  ·  A=${regel[7]} cm²  ·  W=${regel[18]} kg/m`} x={smal ? 70 : 40} y={H - 14} />
            </div>
          </div>
        </div>
      </div>
      <div className="vd-foot"><span>{t("twSteelBeam.klik")}</span></div>
    </div>
  );
}
