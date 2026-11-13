import { useTranslation } from "react-i18next";
import { useDesigner, Dim, Ro, StelselGetal, clamp, UitkomstKop } from "./designerKit";
import { useBladUitkomst } from "./bladResultaat";
import "./VoetplaatDesigner.css";

/**
 * Parametrisch beeld bij het blad 三樁／四樁樁帽壓拉桿模型設計與檢核 (templates/tw-pile-cap.ts):
 * plattegrond met drie palen (gelijkzijdige driehoek) of vier palen (vierkant), de kolom in het
 * midden, de trekstaven langs de paalcentra en de drukdiagonalen van kolom naar paal. De omtrek
 * van de paalkop is schematisch (het blad kent geen randafstand). Het beeld rekent niet; de kop
 * toont de UC en het oordeel van het blad zelf. Maten in mm.
 */
const MARKER = "三樁／四樁樁帽壓拉桿模型設計與檢核";

const SYM = { s: "s", dp: "dp", bc: "bc" };

const DEFAULTS: Record<string, number> = {
  n_p: 4, s: 2400, d_p: 800, b_c: 700, h: 1600, cover: 75,
};

export default function TwPileCapDesigner() {
  const ctx = useDesigner(MARKER, DEFAULTS);
  const uitkomst = useBladUitkomst();
  const { t } = useTranslation("beelden");
  if (!ctx.actief) return null;
  const { d, set, box, wrapRef } = ctx;

  const n = Math.round(d("n_p")) === 3 ? 3 : 4;
  const s = Math.max(300, d("s")), dp = clamp(d("d_p"), 100, s * 0.9), bc = clamp(d("b_c"), 100, s);

  // paalcentra met het zwaartepunt in de oorsprong
  const R = n === 3 ? s / Math.sqrt(3) : s / Math.SQRT2;
  const pijlen: [number, number][] = n === 3
    ? [[0, R], [-s / 2, -R / 2], [s / 2, -R / 2]]
    : [[-s / 2, -s / 2], [s / 2, -s / 2], [s / 2, s / 2], [-s / 2, s / 2]];
  const rand = dp / 2 + 150; // schematische omtrek: paal + randstrook
  const extent = R + rand;

  const W = box.w;
  const maat = Math.min(W - 200, Math.max(box.h, 380) - 150);
  const sc = Math.max(0.03, maat / (2 * extent));
  const cx = 90 + (maat / 2), cy = 50 + maat / 2;
  const X = (mm: number) => cx + mm * sc, Y = (mm: number) => cy - mm * sc;
  const H = cy + maat / 2 + 70;
  const omtrek = n === 4
    ? <rect x={X(-s / 2 - rand)} y={Y(s / 2 + rand)} width={(s + 2 * rand) * sc} height={(s + 2 * rand) * sc} rx={6} fill="none" stroke="#6b7280" strokeDasharray="6 4" strokeWidth={1.2} />
    : <circle cx={X(0)} cy={Y(0)} r={(R + rand) * sc} fill="none" stroke="#6b7280" strokeDasharray="6 4" strokeWidth={1.2} />;
  const trek = pijlen.map((p, i) => [p, pijlen[(i + 1) % pijlen.length]] as const);

  return (
    <div className="vd-panel">
      <UitkomstKop titel={t("twPileCap.titel")} uitkomst={uitkomst} />
      <div className="vd-body" style={{ flex: 1, minHeight: 0, alignItems: "stretch" }}>
        <div className="vd-controls vd-compact" style={{ alignSelf: "flex-start" }}>
          <span className="vd-ctrl-h">{t("twPileCap.kop")}</span>
          <label>{t("twPileCap.velden.n")}
            <select value={n} onChange={(e) => set("n_p", parseInt(e.target.value))}>
              <option value={3}>3</option>
              <option value={4}>4</option>
            </select>
          </label>
          <label>{ctx.eenheden.label(t("twPileCap.velden.h"), "mm")}
            <StelselGetal eenheden={ctx.eenheden} eenheid="mm" step={50} waarde={d("h")} onWijzig={(w) => set("h", w || 0)} />
          </label>
          <span className="gd-note">{t("twPileCap.noot")}</span>
        </div>

        <div ref={wrapRef} className="vd-canvases" style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--theme-border-subtle, #d1d5db)", paddingLeft: 18 }}>
          <div className="vd-canvas">
            <div className="vd-caption">{t("twPileCap.doorsnede")}</div>
            <div className="vd-stage" style={{ width: W, height: H, background: "transparent", border: "none", borderRadius: 0 }}>
              <svg width={W} height={H} className="vd-svg">
                {omtrek}
                {pijlen.map(([x, y], i) => (
                  <line key={`d${i}`} x1={X(0)} y1={Y(0)} x2={X(x)} y2={Y(y)} stroke="#b91c1c" strokeWidth={1.4} strokeDasharray="5 3" />
                ))}
                {trek.map(([a, b], i) => (
                  <line key={`t${i}`} x1={X(a[0])} y1={Y(a[1])} x2={X(b[0])} y2={Y(b[1])} stroke="#1d4ed8" strokeWidth={2.4} />
                ))}
                {pijlen.map(([x, y], i) => (
                  <circle key={`p${i}`} cx={X(x)} cy={Y(y)} r={(dp / 2) * sc} fill="#e5e7eb" stroke="#374151" strokeWidth={1.4} />
                ))}
                <rect x={X(-bc / 2)} y={Y(bc / 2)} width={bc * sc} height={bc * sc} fill="#9ca3af" stroke="#111827" strokeWidth={1.6} />
              </svg>
              <Dim ctx={ctx} name="s" value={s} x={X(0) - 36} y={Y(pijlen[0][1]) + (n === 4 ? (s * sc) / 2 + 18 : 14)} step={50} label={SYM.s} eenheid="mm" />
              <Dim ctx={ctx} name="d_p" value={dp} x={X(pijlen[n === 3 ? 1 : 0][0]) - 36} y={Y(pijlen[n === 3 ? 1 : 0][1]) - (dp * sc) / 2 - 36} step={50} label={SYM.dp} eenheid="mm" />
              <Dim ctx={ctx} name="b_c" value={bc} x={X(bc / 2) + 8} y={Y(0) - 10} step={50} label={SYM.bc} eenheid="mm" />
              <Ro text={`${n} × Ø${Math.round(dp)}`} x={90} y={cy + maat / 2 + 20} />
            </div>
          </div>
        </div>
      </div>
      <div className="vd-foot"><span>{t("twPileCap.klik")}</span></div>
    </div>
  );
}
