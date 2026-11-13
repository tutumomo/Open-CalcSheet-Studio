import { useTranslation } from "react-i18next";
import { useDesigner, Dim, Ro, Defs, HDim, VDim, StelselGetal, clamp, UitkomstKop } from "./designerKit";
import { useBladUitkomst } from "./bladResultaat";
import { hProfiel, hProfielen, hProfielPad } from "./TwHProfiel";
import "./VoetplaatDesigner.css";

/**
 * Parametrisch beeld bij het blad 鋼結構熱軋 H 型鋼柱與柱腳設計 (templates/tw-steel-column.ts):
 * doorsnede van het gekozen H-profiel, de kolom in elevation met lengte L, de voetplaat met zijn
 * afmetingen en de vier ankerbouten met diameter db en verankeringsdiepte hef. Het beeld rekent
 * niet; de kop toont de UC en het oordeel van het blad zelf. Maten: doorsnede en voetplaat in mm,
 * kolomlengte in m.
 */
const MARKER = "鋼結構熱軋 H 型鋼柱與柱腳設計";

const SYM = { L: "L", Bp: "Bp", db: "db" };

const DEFAULTS: Record<string, number> = {
  design_method: 1, f_y_in: 325, section_id: 7, L_col: 4.0,
  B_p: 500, N_p: 500, t_p: 32, d_b: 30, b_x: 350, b_y: 350, h_ef: 450,
};

const IDS = Array.from({ length: 20 }, (_, i) => i + 1);

export default function TwSteelColumnDesigner() {
  const ctx = useDesigner(MARKER, DEFAULTS);
  const uitkomst = useBladUitkomst();
  const { t } = useTranslation("beelden");
  if (!ctx.actief) return null;
  const { d, set, box, wrapRef } = ctx;

  const regel = hProfiel(Math.round(d("section_id")) || 7);
  const [, naam, h, b] = regel;
  const L = Math.max(0.3, d("L_col"));
  const Bp = Math.max(100, d("B_p")), Np = Math.max(100, d("N_p")), tp = Math.max(5, d("t_p"));
  const db = clamp(d("d_b"), 10, 100), bx = Math.max(db, d("b_x")), by = Math.max(db, d("b_y"));
  const hef = clamp(d("h_ef"), 0, 2000);

  const W = box.w;
  const smal = W < 560;
  const secW = smal ? W : Math.round(W * 0.45);
  const sc = Math.max(0.04, Math.min((secW - 120) / b, (Math.max(box.h, 340) - 160) / h, 1.2));
  const cx = smal ? W / 2 : 40 + secW / 2, cy = 50 + (h * sc) / 2;

  // kolom in elevation: schaal mm -> px, hoogte L in m
  const ax = smal ? 70 : secW + 60, aW = smal ? W - 140 : W - secW - 120;
  const colW = Math.max(24, Math.min(aW * 0.22, b * 0.7));
  const colH = Math.min(Math.max(box.h, 340) - 190, 240);
  const scP = colW / Math.max(1, b);            // px per mm voor de voetplaat
  const plateW = Bp * scP, plateD = Np * scP * 0.35, plateT = Math.max(4, tp * scP);
  const aX = ax + (aW - plateW) / 2;
  const aY = smal ? cy + h * sc / 2 + 70 : 60;
  const plaatY = aY + colH;
  const diepte = Math.max(10, hef * scP * 0.35); // verankeringsdiepte (schuin getekend)
  const H = (smal ? plaatY : aY + colH) + 150;
  const boutX = (bx / 2) * scP, boutY = (by / 2) * scP * 0.35; // diepterichting schuin getekend

  return (
    <div className="vd-panel">
      <UitkomstKop titel={t("twSteelColumn.titel")} uitkomst={uitkomst} />
      <div className="vd-body" style={{ flex: 1, minHeight: 0, alignItems: "stretch" }}>
        <div className="vd-controls vd-compact" style={{ alignSelf: "flex-start" }}>
          <span className="vd-ctrl-h">{t("twSteelColumn.kop")}</span>
          <label>{t("twSteelColumn.velden.section")}
            <select value={regel[0]} onChange={(e) => set("section_id", parseInt(e.target.value))}>
              {hProfielen(IDS).map((r) => <option key={r[0]} value={r[0]}>{r[1]}</option>)}
            </select>
          </label>
          <label>{ctx.eenheden.label(t("twSteelColumn.velden.Lcol"), "m")}
            <StelselGetal eenheden={ctx.eenheden} eenheid="m" step={0.5} waarde={d("L_col")} onWijzig={(w) => set("L_col", w || 0)} />
          </label>
          <label>{ctx.eenheden.label(t("twSteelColumn.velden.Bp"), "mm")}
            <StelselGetal eenheden={ctx.eenheden} eenheid="mm" step={50} waarde={d("B_p")} onWijzig={(w) => set("B_p", w || 0)} />
          </label>
          <label>{ctx.eenheden.label(t("twSteelColumn.velden.db"), "mm")}
            <StelselGetal eenheden={ctx.eenheden} eenheid="mm" step={2} waarde={d("d_b")} onWijzig={(w) => set("d_b", w || 0)} />
          </label>
          <label>{ctx.eenheden.label(t("twSteelColumn.velden.hef"), "mm")}
            <StelselGetal eenheden={ctx.eenheden} eenheid="mm" step={50} waarde={d("h_ef")} onWijzig={(w) => set("h_ef", w || 0)} />
          </label>
          <span className="gd-note">{t("twSteelColumn.noot")}</span>
        </div>

        <div ref={wrapRef} className="vd-canvases" style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--theme-border-subtle, #d1d5db)", paddingLeft: 18 }}>
          <div className="vd-canvas">
            <div className="vd-caption">{t("twSteelColumn.doorsnede")}</div>
            <div className="vd-stage" style={{ width: W, height: H, background: "transparent", border: "none", borderRadius: 0 }}>
              <svg width={W} height={H} className="vd-svg">
                <Defs k="sc" />
                <path d={hProfielPad(regel, cx, cy, sc)} fill="#cbd5e1" stroke="#374151" strokeWidth={1.3} />
                <HDim k="sc" x0={cx - (b / 2) * sc} x1={cx + (b / 2) * sc} y={cy + (h / 2) * sc + 34} ext={cy + (h / 2) * sc + 4} />
                <VDim k="sc" y0={cy - (h / 2) * sc} y1={cy + (h / 2) * sc} x={cx + (b / 2) * sc + 32} ext={cx + (b / 2) * sc + 4} />
                {/* kolom in elevation */}
                <rect x={aX} y={aY} width={colW} height={colH} fill="#cbd5e1" stroke="#374151" strokeWidth={1.3} />
                {/* voetplaat (schuin) met de vier ankerbouten */}
                <polygon points={`${aX},${plaatY} ${aX + plateW},${plaatY} ${aX + plateW + plateD},${plaatY - plateD} ${aX + plateD},${plaatY - plateD}`}
                  fill="#9ca3af" stroke="#374151" strokeWidth={1.2} />
                <polygon points={`${aX},${plaatY} ${aX + plateW},${plaatY} ${aX + plateW},${plaatY + plateT} ${aX},${plaatY + plateT}`}
                  fill="#6b7280" stroke="#374151" strokeWidth={1.1} />
                <polygon points={`${aX + plateW},${plaatY} ${aX + plateW + plateD},${plaatY - plateD} ${aX + plateW + plateD},${plaatY - plateD + plateT} ${aX + plateW},${plaatY + plateT}`}
                  fill="#4b5563" stroke="#374151" strokeWidth={1.1} />
                {[[-1, 0], [1, 0], [-1, 1], [1, 1]].map(([sx, ry], i) => {
                  const bxp = aX + plateW / 2 + (sx * boutX) + (ry ? boutY : 0);
                  const byp = plaatY - (ry ? boutY : 0) + plateT;
                  return (
                    <g key={i}>
                      <line x1={bxp} y1={byp - plateT} x2={bxp} y2={byp + diepte} stroke="#1d4ed8" strokeWidth={2.2} />
                      <circle cx={bxp} cy={byp + diepte} r={Math.max(3, (db / 2) * scP)} fill="none" stroke="#1d4ed8" strokeWidth={1.6} />
                    </g>
                  );
                })}
                <VDim k="sc" y0={aY} y1={plaatY} x={aX - 34} ext={aX - 18} />
              </svg>
              <Dim ctx={ctx} name="L_col" value={L} x={aX - 74} y={aY + colH / 2 - 10} step={0.5} dec={2} label={SYM.L} eenheid="m" />
              <Dim ctx={ctx} name="B_p" value={Bp} x={aX - 10} y={plaatY + 34} step={50} label={SYM.Bp} eenheid="mm" />
              <Dim ctx={ctx} name="d_b" value={db} x={aX + colW / 2 + bx / 2 - 20} y={plaatY + 12} step={2} label={SYM.db} eenheid="mm" />
              <Ro text={`${naam}  ·  h=${h} b=${b} mm  ·  A=${regel[7]} cm²  ·  W=${regel[18]} kg/m`} x={smal ? 70 : 40} y={H - 14} />
            </div>
          </div>
        </div>
      </div>
      <div className="vd-foot"><span>{t("twSteelColumn.klik")}</span></div>
    </div>
  );
}
