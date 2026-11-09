import { useTranslation } from "react-i18next";
import { useDesigner, Dim, Ro, Defs, VDim, StelselGetal, clamp, UitkomstKop } from "./designerKit";
import { useBladUitkomst } from "./bladResultaat";
import "./VoetplaatDesigner.css";

/**
 * Parametrisch beeld bij het blad 滯洪池 (templates/tw-detention-basin.ts): dwarsdoorsnede van
 * de vijver met de taludhelling, het ontwerppeil, de dode berging onder de opening, de kruin,
 * de afvoeropening (ronde diameter) en de noodoverlaat. Het beeld rekent niet; de kop
 * toont de UC en het oordeel van het blad zelf.
 */
const MARKER = "滯洪池";

/** Formelsymbolen op de maatchips (geen vertaalbare tekst). */
const SYM = { Do: "Do", Hc: "Hc", Hw: "Hw", Ls: "Ls", hs: "hs", zi: "zi" };

const DEFAULTS: Record<string, number> = {
  L0_pond: 30.0, B0_pond: 25.0, z_pond: 2.0, H_w: 2.4, z_inv: 0.1, H_crest: 3.4,
  D_orf: 0.45, n_orf: 1, L_spill: 8.0, h_spill: 0.3,
};

export default function TwDetentionBasinDesigner() {
  const ctx = useDesigner(MARKER, DEFAULTS);
  const uitkomst = useBladUitkomst();
  const { t } = useTranslation("beelden");
  if (!ctx.actief) return null;
  const { d, set, box, wrapRef } = ctx;

  const Hk = Math.max(0.5, d("H_crest")), Hw = clamp(d("H_w"), 0.1, Hk), z = Math.max(0, d("z_pond"));
  const L0 = Math.max(1, d("L0_pond")), zi = clamp(d("z_inv"), 0, Hw), Do = Math.max(0.05, d("D_orf"));
  const Ls = Math.max(0.5, d("L_spill")), hs = Math.max(0, d("h_spill"));

  const W = box.w;
  const breedte = L0 + 2 * z * Hk; // kruinbreedte in doorsnede
  const sx = Math.max(2, (W - 220) / breedte), sy = Math.max(10, Math.min(110, (Math.max(box.h, 340) - 150) / Hk));
  const x0 = 70, yBodem = 60 + Hk * sy;
  const X = (m: number) => x0 + m * sx, Y = (m: number) => yBodem - m * sy; // m: hoogte vanaf bodem
  const xl = X(z * Hk), xr = X(z * Hk + L0);
  const talud = (hh: number) => z * (Hk - hh); // afstand van kruin tot talud op hoogte hh
  const Hpx = yBodem + 80;
  const yOpen = Y(zi + Do / 2);

  return (
    <div className="vd-panel">
      <UitkomstKop titel={t("twDetentionBasin.titel")} uitkomst={uitkomst} />
      <div className="vd-body" style={{ flex: 1, minHeight: 0, alignItems: "stretch" }}>
        <div className="vd-controls vd-compact" style={{ alignSelf: "flex-start" }}>
          <span className="vd-ctrl-h">{t("twDetentionBasin.kop")}</span>
          <label>{ctx.eenheden.label(t("twDetentionBasin.velden.b0"), "m")}
            <StelselGetal eenheden={ctx.eenheden} eenheid="m" step={0.5} waarde={d("B0_pond")} onWijzig={(w) => set("B0_pond", w || 0)} />
          </label>
          <label>{t("twDetentionBasin.velden.z")}
            <input type="number" step={0.25} value={z} onChange={(e) => set("z_pond", parseFloat(e.target.value) || 0)} />
          </label>
          <label>{t("twDetentionBasin.velden.n")}
            <input type="number" step={1} value={Math.round(d("n_orf"))} onChange={(e) => set("n_orf", Math.max(1, parseInt(e.target.value) || 1))} />
          </label>
          <span className="gd-note">{t("twDetentionBasin.noot")}</span>
        </div>

        <div ref={wrapRef} className="vd-canvases" style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--theme-border-subtle, #d1d5db)", paddingLeft: 18 }}>
          <div className="vd-canvas">
            <div className="vd-caption">{t("twDetentionBasin.doorsnede")}</div>
            <div className="vd-stage" style={{ width: W, height: Hpx, background: "transparent", border: "none", borderRadius: 0 }}>
              <svg width={W} height={Hpx} className="vd-svg">
                <Defs k="db" />
                {/* grondlichaam */}
                <polygon points={`${X(0)},${Y(Hk)} ${xl},${Y(0)} ${xr},${Y(0)} ${X(L0 + 2 * z * Hk)},${Y(Hk)} ${X(L0 + 2 * z * Hk)},${Y(-0.6)} ${X(0)},${Y(-0.6)}`}
                  fill="#e9d8b4" stroke="#a16207" strokeWidth={1.2} />
                {/* water tot het ontwerppeil */}
                <polygon points={`${X(talud(Hw))},${Y(Hw)} ${xl},${Y(0)} ${xr},${Y(0)} ${X(L0 + z * Hk + z * (Hk - Hw))},${Y(Hw)}`}
                  fill="#93c5fd" fillOpacity={0.6} stroke="#2563eb" strokeWidth={1.4} />
                {/* dode berging onder de opening */}
                <rect x={xl} y={Y(zi)} width={xr - xl} height={Math.max(0, Y(0) - Y(zi))} fill="#64748b" fillOpacity={0.25} />
                {/* kruin en noodoverlaat (kerf in de kruin van hoogte H_w + h_s) */}
                <line x1={X(0) - 12} y1={Y(Hk)} x2={X(L0 + 2 * z * Hk) + 12} y2={Y(Hk)} stroke="#374151" strokeWidth={1.6} />
                <line x1={X(talud(Hw + hs))} y1={Y(Hw + hs)} x2={X(L0 + z * Hk + z * (Hk - Hw - hs))} y2={Y(Hw + hs)} stroke="#b45309" strokeWidth={1.4} strokeDasharray="6 4" />
                {/* afvoeropening in de rechter wand: cirkel op de taludwand */}
                <ellipse cx={X(L0 + z * Hk + z * (Hk - zi - Do / 2))} cy={yOpen} rx={Math.max(4, Do * sx * 0.4)} ry={Math.max(4, Do * sy * 0.5)} fill="#111827" fillOpacity={0.8} />
                <VDim k="db" y0={Y(Hk)} y1={Y(0)} x={X(0) - 20} ext={X(0) - 4} />
              </svg>
              <Dim ctx={ctx} name="H_crest" value={Hk} x={X(0) - 66} y={Y(Hk / 2) - 8} step={0.1} dec={2} label={SYM.Hc} eenheid="m" />
              <Dim ctx={ctx} name="L0_pond" value={L0} x={(xl + xr) / 2 - 36} y={Y(0) + 8} step={1} dec={1} label="L0" eenheid="m" />
              <Dim ctx={ctx} name="H_w" value={Hw} x={(xl + xr) / 2 - 36} y={Y(Hw) - 28} step={0.1} dec={2} label={SYM.Hw} eenheid="m" />
              <Dim ctx={ctx} name="z_inv" value={zi} x={xl + 8} y={Y(zi) + 4} step={0.05} dec={2} label={SYM.zi} eenheid="m" />
              <Dim ctx={ctx} name="D_orf" value={Do} x={xr - 20} y={yOpen - 24} step={0.05} dec={2} label={SYM.Do} eenheid="m" />
              <Dim ctx={ctx} name="L_spill" value={Ls} x={X(L0 + 2 * z * Hk) - 70} y={Y(Hk) - 34} step={0.5} dec={1} label={SYM.Ls} eenheid="m" />
              <Dim ctx={ctx} name="h_spill" value={hs} x={X(L0 + 2 * z * Hk) - 70} y={Y(Hk) - 62} step={0.05} dec={2} label={SYM.hs} eenheid="m" />
              <Ro text={`1 : ${z}`} x={X(z * Hk / 2) - 10} y={Y(Hk / 2)} title={t("twDetentionBasin.talud")} />
            </div>
          </div>
        </div>
      </div>
      <div className="vd-foot"><span>{t("twDetentionBasin.klik")}</span></div>
    </div>
  );
}
