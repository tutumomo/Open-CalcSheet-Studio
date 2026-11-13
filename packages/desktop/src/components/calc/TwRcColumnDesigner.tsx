import { useTranslation } from "react-i18next";
import { useDesigner, Dim, Ro, Defs, HDim, VDim, StelselGetal, betonFill, clamp, UitkomstKop } from "./designerKit";
import { useBladUitkomst } from "./bladResultaat";
import "./VoetplaatDesigner.css";

/**
 * Parametrisch beeld bij het blad 鋼筋混凝土矩形柱設計與檢核 (templates/tw-rc-column.ts):
 * dwarsdoorsnede met dekking, hoekstaven, staven per zijde van het buigvlak, tussenstaven aan de
 * zijkanten en gesloten beugel (met tussenbenen), plus een stuk langsaanzicht met de beugelafstand.
 * Het beeld rekent niet; de kop toont de UC en het oordeel van het blad zelf.
 */
const MARKER = "鋼筋混凝土矩形柱設計與檢核";

const SYM = { b: "b", h: "h", cc: "cc", s: "s" };

const DEFAULTS: Record<string, number> = {
  b: 500, h: 500, c_c: 40, main_bar: 4, tie_bar: 1, n_face: 3, n_side: 1, n_legs: 4, s_tie: 150,
};

/** Staafdiameters (mm) in de volgorde van de @select-lijsten van het blad. */
const D_HOOFD = [15.9, 19.1, 22.2, 25.4, 28.7, 31.8, 35.8];
const D_NAAM = ["16", "19", "22", "25", "29", "32", "36"];
const D_BEUGEL = [9.53, 12.7];
const idx = (v: number, n: number) => clamp(Math.round(v), 1, n) - 1;

export default function TwRcColumnDesigner() {
  const ctx = useDesigner(MARKER, DEFAULTS);
  const uitkomst = useBladUitkomst();
  const { t } = useTranslation("beelden");
  if (!ctx.actief) return null;
  const { d, set, box, wrapRef } = ctx;

  const b = Math.max(200, d("b")), h = Math.max(200, d("h")), cc = clamp(d("c_c"), 10, Math.min(b, h) / 4);
  const db = D_HOOFD[idx(d("main_bar"), 7)], dv = D_BEUGEL[idx(d("tie_bar"), 2)];
  const nFace = clamp(Math.round(d("n_face")), 2, 10), nSide = clamp(Math.round(d("n_side")), 0, 8);
  const legs = clamp(Math.round(d("n_legs")), 2, 8), sV = Math.max(30, d("s_tie"));

  const W = box.w;
  const smal = W < 560;
  const secW = smal ? W : Math.round(W * 0.5);
  const sc = Math.max(0.08, Math.min((secW - 110) / b, (Math.max(box.h, 380) - 110) / h, 0.9));
  const x0 = 60, y0 = 36, pw = b * sc, ph = h * sc;
  const yMaat = y0 + ph + 34;

  // Staven: nFace in de onder- en bovenrand (breedte b), nSide per zijkant tussen die twee rijen.
  const rand = cc + dv + db / 2;
  const langs = (n: number) => Array.from({ length: n }, (_, i) => rand + ((b - 2 * rand) * i) / (n - 1));
  const yO = rand, yB = h - rand;
  const staven: { x: number; y: number }[] = [
    ...langs(nFace).flatMap((x) => [{ x, y: yO }, { x, y: yB }]),
    ...Array.from({ length: nSide }, (_, i) => yO + ((yB - yO) * (i + 1)) / (nSide + 1)).flatMap((y) => [{ x: rand, y }, { x: b - rand, y }]),
  ];
  const nTot = staven.length;
  const pX = (mm: number) => x0 + mm * sc, pY = (mm: number) => y0 + ph - mm * sc;
  const hoogtepx = y0 + ph + 70;

  // Tussenbenen (n_legs > 2) als verticale lijnen tussen de boven- en onderrand.
  const tussen = Array.from({ length: Math.max(0, legs - 2) }, (_, i) => rand + ((b - 2 * rand) * (i + 1)) / (legs - 1));

  // Langsaanzicht: kolomstrook met beugels op afstand s_tie.
  const ax = smal ? x0 : secW + 10, aW = smal ? W - 2 * x0 : W - secW - 40;
  const aY = smal ? hoogtepx + 20 : y0, aH = Math.min(ph, 140);
  const aSc = aW / (sV * 6);
  const H = smal ? aY + aH + 80 : Math.max(hoogtepx, aY + aH + 90);

  return (
    <div className="vd-panel">
      <UitkomstKop titel={t("twRcColumn.titel")} uitkomst={uitkomst} />
      <div className="vd-body" style={{ flex: 1, minHeight: 0, alignItems: "stretch" }}>
        <div className="vd-controls vd-compact" style={{ alignSelf: "flex-start" }}>
          <span className="vd-ctrl-h">{t("twRcColumn.kop")}</span>
          <label>{ctx.eenheden.label(t("twRcColumn.velden.cc"), "mm")}
            <StelselGetal eenheden={ctx.eenheden} eenheid="mm" step={5} waarde={d("c_c")} onWijzig={(w) => set("c_c", w || 0)} />
          </label>
          <label>{t("twRcColumn.velden.bar")}
            <select value={idx(d("main_bar"), 7) + 1} onChange={(e) => set("main_bar", parseInt(e.target.value))}>
              {D_NAAM.map((s, i) => <option key={s} value={i + 1}>{`D${s}`}</option>)}
            </select>
          </label>
          <label>{t("twRcColumn.velden.nFace")}<input type="number" step={1} value={nFace} onChange={(e) => set("n_face", parseInt(e.target.value) || 2)} /></label>
          <label>{t("twRcColumn.velden.nSide")}<input type="number" step={1} value={nSide} onChange={(e) => set("n_side", parseInt(e.target.value) || 0)} /></label>
          <label>{t("twRcColumn.velden.barV")}
            <select value={idx(d("tie_bar"), 2) + 1} onChange={(e) => set("tie_bar", parseInt(e.target.value))}>
              {["10", "13"].map((s, i) => <option key={s} value={i + 1}>{`D${s}`}</option>)}
            </select>
          </label>
          <label>{t("twRcColumn.velden.legs")}<input type="number" step={1} value={legs} onChange={(e) => set("n_legs", parseInt(e.target.value) || 2)} /></label>
          <span className="gd-note">{t("twRcColumn.noot")}</span>
        </div>

        <div ref={wrapRef} className="vd-canvases" style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--theme-border-subtle, #d1d5db)", paddingLeft: 18 }}>
          <div className="vd-canvas">
            <div className="vd-caption">{t("twRcColumn.doorsnede")}</div>
            <div className="vd-stage" style={{ width: W, height: H, background: "transparent", border: "none", borderRadius: 0 }}>
              <svg width={W} height={H} className="vd-svg">
                <Defs k="rc" />
                <rect x={x0} y={y0} width={pw} height={ph} fill={betonFill("rc")} stroke="#374151" strokeWidth={1.4} />
                <rect x={pX(cc + dv / 2)} y={pY(h - cc - dv / 2)} width={(b - 2 * cc - dv) * sc} height={(h - 2 * cc - dv) * sc}
                  fill="none" stroke="#1d4ed8" strokeWidth={Math.max(1.2, dv * sc)} rx={3} />
                {tussen.map((x, i) => (
                  <line key={i} x1={pX(x)} y1={pY(cc)} x2={pX(x)} y2={pY(h - cc)} stroke="#1d4ed8" strokeWidth={Math.max(1, dv * sc)} />
                ))}
                {staven.map((s, i) => (
                  <circle key={i} cx={pX(s.x)} cy={pY(s.y)} r={Math.max(2.5, (db / 2) * sc)} fill="#111827" />
                ))}
                <HDim k="rc" x0={x0} x1={x0 + pw} y={yMaat} ext={y0 + ph + 4} />
                <VDim k="rc" y0={y0} y1={y0 + ph} x={x0 + pw + 30} ext={x0 + pw + 4} />
                {/* langsaanzicht */}
                <rect x={ax} y={aY} width={aW} height={aH} fill={betonFill("rc")} stroke="#374151" strokeWidth={1.2} />
                {Array.from({ length: 7 }, (_, i) => (
                  <line key={i} x1={ax + i * sV * aSc} y1={aY + 8} x2={ax + i * sV * aSc} y2={aY + aH - 8} stroke="#1d4ed8" strokeWidth={1.6} />
                ))}
                <line x1={ax + 4} y1={aY + 10} x2={ax + aW - 4} y2={aY + 10} stroke="#111827" strokeWidth={Math.max(2, db * sc)} />
                <line x1={ax + 4} y1={aY + aH - 10} x2={ax + aW - 4} y2={aY + aH - 10} stroke="#111827" strokeWidth={Math.max(2, db * sc)} />
                <HDim k="rc" x0={ax + sV * aSc} x1={ax + 2 * sV * aSc} y={aY + aH + 22} ext={aY + aH} />
              </svg>
              <Dim ctx={ctx} name="b" value={b} x={x0 + pw / 2 - 30} y={yMaat - 10} step={10} label={SYM.b} eenheid="mm" />
              <Dim ctx={ctx} name="h" value={h} x={x0 + pw + 38} y={y0 + ph / 2} step={10} label={SYM.h} eenheid="mm" />
              <Dim ctx={ctx} name="c_c" value={cc} x={x0 + 4} y={y0 - 28} step={5} label={SYM.cc} eenheid="mm" />
              <Dim ctx={ctx} name="s_tie" value={sV} x={ax + 1.5 * sV * aSc - 24} y={aY + aH + 14} step={10} label={SYM.s} eenheid="mm" />
              <Ro text={`${nTot} × Ø${db}`} x={x0 + pw / 2 - 30} y={y0 + ph + 6} />
            </div>
          </div>
        </div>
      </div>
      <div className="vd-foot"><span>{t("twRcColumn.klik")}</span></div>
    </div>
  );
}
