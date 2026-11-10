import { useTranslation } from "react-i18next";
import { useDesigner, Dim, Ro, Defs, HDim, VDim, Force, StelselGetal, betonFill, clamp, UitkomstKop } from "./designerKit";
import { useBladUitkomst } from "./bladResultaat";
import "./VoetplaatDesigner.css";

/**
 * Parametrisch beeld bij het blad 懸臂式擋土牆 (templates/tw-retaining-wall.ts): dwarsdoorsnede
 * met stam, teen en hiel, de grond erachter met het Rankine-glijvlak (45° + φ/2) en de
 * bovenbelasting. Het blad heeft geen grondwaterstand als invoer, dus er staat ook geen
 * waterlijn in het beeld. Het beeld rekent niet; de kop toont de UC en het oordeel van het blad.
 */
const MARKER = "懸臂式擋土牆";

/** Formelsymbolen op de maatchips (geen vertaalbare tekst). */
const SYM = { B: "B", H: "H", Lt: "Lt", hb: "hb", q: "q", ts: "ts", tt: "tt" };

const DEFAULTS: Record<string, number> = {
  H_wall: 5.0, B_base: 3.2, h_base: 0.5, L_toe: 0.9, t_top: 0.3, t_stem: 0.5, D_soil_toe: 0.8,
  gamma_s: 19.0, phi_deg: 32, q_surcharge: 10.0, qa_allow: 220.0, mu_base: 0.55,
};

export default function TwRetainingWallDesigner() {
  const ctx = useDesigner(MARKER, DEFAULTS);
  const uitkomst = useBladUitkomst();
  const { t } = useTranslation("beelden");
  if (!ctx.actief) return null;
  const { d, set, box, wrapRef } = ctx;

  const H = Math.max(1, d("H_wall")), B = Math.max(0.5, d("B_base")), hb = clamp(d("h_base"), 0.1, H / 2);
  const Lt = clamp(d("L_toe"), 0, B), ts = clamp(d("t_stem"), 0.1, B), tt = clamp(d("t_top"), 0.1, ts);
  const Df = clamp(d("D_soil_toe"), 0, H);
  const Lh = Math.max(0, B - Lt - ts), phi = clamp(d("phi_deg"), 10, 50);

  const W = box.w;
  const ruimteB = B + 2.2 + Lh; // teen-grond links en achterland rechts
  const sc = Math.max(8, Math.min((W - 150) / ruimteB, (Math.max(box.h, 360) - 120) / H));
  const x0 = 60, yTop = 50;
  const X = (m: number) => x0 + m * sc, Y = (m: number) => yTop + (H - m) * sc; // m vanaf onderkant plaat
  const xe = X(B + 2.0); // rechter rand van het getekende terrein
  const hoek = ((45 + phi / 2) * Math.PI) / 180;
  // glijvlak vanaf de hiel (achterkant plaat) schuin omhoog naar het teenoppervlak
  const xHiel = X(B), yHiel = Y(hb);
  const dx = (H - hb) / Math.tan(hoek);
  const xWig = Math.max(X(Lt + ts) + 6, xHiel - dx * sc);
  const Hpx = yTop + H * sc + 70;

  return (
    <div className="vd-panel">
      <UitkomstKop titel={t("twRetainingWall.titel")} uitkomst={uitkomst} />
      <div className="vd-body" style={{ flex: 1, minHeight: 0, alignItems: "stretch" }}>
        <div className="vd-controls vd-compact" style={{ alignSelf: "flex-start" }}>
          <span className="vd-ctrl-h">{t("twRetainingWall.kop")}</span>
          {([["gamma_s", "gamma", "kN/m³", 0.5], ["phi_deg", "phi", "°", 1], ["q_surcharge", "q", "kN/m²", 1], ["qa_allow", "qa", "kN/m²", 10], ["mu_base", "mu", "", 0.05]] as const).map(([naam, sleutel, eenh, stap]) => (
            <label key={naam}>{t(`twRetainingWall.velden.${sleutel}`)}{eenh ? ` (${eenh})` : ""}
              <input type="number" step={stap} value={d(naam)} onChange={(e) => set(naam, parseFloat(e.target.value) || 0)} />
            </label>
          ))}
          <label>{ctx.eenheden.label(t("twRetainingWall.velden.dsoil"), "m")}
            <StelselGetal eenheden={ctx.eenheden} eenheid="m" step={0.1} waarde={d("D_soil_toe")} onWijzig={(w) => set("D_soil_toe", w || 0)} />
          </label>
          <span className="gd-note">{t("twRetainingWall.noot")}</span>
        </div>

        <div ref={wrapRef} className="vd-canvases" style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--theme-border-subtle, #d1d5db)", paddingLeft: 18 }}>
          <div className="vd-canvas">
            <div className="vd-caption">{t("twRetainingWall.doorsnede")}</div>
            <div className="vd-stage" style={{ width: W, height: Hpx, background: "transparent", border: "none", borderRadius: 0 }}>
              <svg width={W} height={Hpx} className="vd-svg">
                <Defs k="rw" />
                {/* grond achter de wand en voor de teen */}
                <polygon points={`${X(Lt + ts)},${Y(H)} ${xe},${Y(H)} ${xe},${Y(hb)} ${xHiel},${Y(hb)} ${X(Lt + ts - (ts - tt))},${Y(hb)}`}
                  fill="#e9d8b4" stroke="#a16207" strokeWidth={1} opacity={0.8} />
                <polygon points={`${X(-1.2)},${Y(Df)} ${X(Lt)},${Y(Df)} ${X(Lt)},${Y(hb)} ${X(-1.2)},${Y(hb)}`} fill="#e9d8b4" stroke="#a16207" strokeWidth={1} opacity={0.8} />
                {/* glijvlak */}
                <line x1={xHiel} y1={yHiel} x2={xWig} y2={Y(H)} stroke="#b45309" strokeWidth={1.6} strokeDasharray="6 4" />
                {/* plaat en wand */}
                <polygon points={`${X(0)},${Y(0)} ${X(B)},${Y(0)} ${X(B)},${Y(hb)} ${X(Lt + ts)},${Y(hb)} ${X(Lt + ts)},${Y(H)} ${X(Lt + ts - tt)},${Y(H)} ${X(Lt)},${Y(hb)} ${X(0)},${Y(hb)}`}
                  fill={betonFill("rw")} stroke="#374151" strokeWidth={1.4} />
                {/* bovenbelasting */}
                {Array.from({ length: 6 }, (_, i) => {
                  const x = X(Lt + ts + 0.2) + ((xe - X(Lt + ts + 0.2) - 10) * i) / 5;
                  return <line key={i} x1={x} y1={Y(H) - 26} x2={x} y2={Y(H) - 3} stroke="#dc2626" strokeWidth={1.4} markerEnd={`url(#dkrwLoad)`} />;
                })}
                <HDim k="rw" x0={X(0)} x1={X(B)} y={Y(0) + 26} ext={Y(0) + 2} />
                <VDim k="rw" y0={Y(H)} y1={Y(0)} x={X(-1.4)} ext={X(-0.1)} />
              </svg>
              <Dim ctx={ctx} name="B_base" value={B} x={X(B / 2) - 30} y={Y(0) + 18} step={0.1} dec={2} label={SYM.B} eenheid="m" />
              <Dim ctx={ctx} name="H_wall" value={H} x={X(-1.4) - 52} y={Y(H / 2)} step={0.1} dec={2} label={SYM.H} eenheid="m" />
              <Dim ctx={ctx} name="h_base" value={hb} x={X(B) + 8} y={Y(hb / 2) - 4} step={0.05} dec={2} label={SYM.hb} eenheid="m" />
              <Dim ctx={ctx} name="L_toe" value={Lt} x={X(Lt / 2) - 26} y={Y(0) - 26} step={0.1} dec={2} label={SYM.Lt} eenheid="m" />
              <Dim ctx={ctx} name="t_stem" value={ts} x={X(Lt + ts / 2) - 28} y={Y(hb) + 4} step={0.05} dec={2} label={SYM.ts} eenheid="m" />
              <Dim ctx={ctx} name="t_top" value={tt} x={X(Lt + ts - tt / 2) - 28} y={Y(H) - 48} step={0.05} dec={2} label={SYM.tt} eenheid="m" />
              <Force ctx={ctx} name="q_surcharge" value={d("q_surcharge")} x={xe - 110} y={Y(H) - 54} unit="kN/m²" label={SYM.q} step={1} />
              <Ro text={`Lh = ${Lh.toFixed(2)} m`} x={X(Lt + ts + Lh / 2) - 24} y={Y(hb / 2) + 8} />
              <Ro text={`${(45 + phi / 2).toFixed(0)}°`} x={xWig + 10} y={Y(H) + 4} title={t("twRetainingWall.glijvlak")} />
            </div>
          </div>
        </div>
      </div>
      <div className="vd-foot"><span>{t("twRetainingWall.klik")}</span></div>
    </div>
  );
}
