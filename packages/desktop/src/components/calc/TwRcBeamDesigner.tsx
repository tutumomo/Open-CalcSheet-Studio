import { useTranslation } from "react-i18next";
import { useDesigner, Dim, Ro, Defs, HDim, VDim, StelselGetal, betonFill, clamp, UitkomstKop } from "./designerKit";
import { useBladUitkomst } from "./bladResultaat";
import "./VoetplaatDesigner.css";

/**
 * Parametrisch beeld bij het blad 鋼筋混凝土矩形梁設計與檢核 (templates/tw-rc-beam.ts):
 * dwarsdoorsnede met dekking, hoofdwapening in een of twee lagen, drukwapening en beugel,
 * plus een stuk langsaanzicht met de beugelafstand. Het beeld rekent niet; de kop toont
 * de UC en het oordeel van het blad zelf.
 */
const MARKER = "鋼筋混凝土矩形梁設計與檢核";

/** Formelsymbolen op de maatchips (geen vertaalbare tekst). */
const SYM = { b: "b", cc: "cc", h: "h", s: "s" };

const DEFAULTS: Record<string, number> = {
  f_c: 28, f_y: 420, b: 300, h: 600, c_c: 40,
  bar_t: 1, n_t: 4, rebar_layers: 1, has_top: 1, bar_c: 1, n_c: 0,
  bar_v: 1, n_legs: 2, s_v: 150,
};

/** Staafdiameters (mm) in de volgorde van de @select-lijsten van het blad. */
const D_HOOFD = [15.9, 19.1, 22.2, 25.4, 28.7, 32.2, 35.8];
const D_BEUGEL = [9.53, 12.7, 15.9];
const idx = (v: number, n: number) => clamp(Math.round(v), 1, n) - 1;

export default function TwRcBeamDesigner() {
  const ctx = useDesigner(MARKER, DEFAULTS);
  const uitkomst = useBladUitkomst();
  const { t } = useTranslation("beelden");
  if (!ctx.actief) return null;
  const { d, set, box, wrapRef } = ctx;

  const b = Math.max(100, d("b")), h = Math.max(150, d("h")), cc = clamp(d("c_c"), 10, Math.min(b, h) / 4);
  const dt = D_HOOFD[idx(d("bar_t"), 7)], dc = D_HOOFD[idx(d("bar_c"), 5)], dv = D_BEUGEL[idx(d("bar_v"), 3)];
  const nT = clamp(Math.round(d("n_t")), 1, 12), nC = d("has_top") === 2 ? clamp(Math.round(d("n_c")), 0, 12) : 0;
  const lagen = Math.round(d("rebar_layers")) === 2 && nT >= 2 ? 2 : 1;
  const sV = Math.max(30, d("s_v")), legs = clamp(Math.round(d("n_legs")), 2, 6);

  // Layout: doorsnede links, langsaanzicht rechts of eronder.
  const W = box.w;
  const smal = W < 560;
  const secW = smal ? W : Math.round(W * 0.5);
  const sc = Math.max(0.08, Math.min((secW - 110) / b, (Math.max(box.h, 380) - 110) / h, 0.9));
  const x0 = 60, y0 = 36, pw = b * sc, ph = h * sc;
  const yMaat = y0 + ph + 34;

  // rij van n staven tussen de beugelhoeken, op hoogte y (mm vanaf onderkant)
  const rij = (n: number, dia: number) => {
    const vrij = b - 2 * (cc + dv) - dia;
    return Array.from({ length: n }, (_, i) => cc + dv + dia / 2 + (n === 1 ? vrij / 2 : (vrij * i) / (n - 1)));
  };
  const n1 = lagen === 2 ? Math.ceil(nT / 2) : nT, n2 = nT - n1;
  const yRij1 = cc + dv + dt / 2, yRij2 = yRij1 + dt + Math.max(25, dt);
  const staven: { x: number; y: number; r: number }[] = [
    ...rij(n1, dt).map((x) => ({ x, y: yRij1, r: dt / 2 })),
    ...(n2 > 0 ? rij(n2, dt).map((x) => ({ x, y: yRij2, r: dt / 2 })) : []),
    ...(nC > 0 ? rij(nC, dc).map((x) => ({ x, y: h - cc - dv - dc / 2, r: dc / 2 })) : []),
  ];
  const pX = (mm: number) => x0 + mm * sc, pY = (mm: number) => y0 + ph - mm * sc;
  const hoogtepx = y0 + ph + 70;

  // langsaanzicht: balkstrook met beugels op afstand s_v
  const ax = smal ? x0 : secW + 10, aW = smal ? W - 2 * x0 : W - secW - 40;
  const aY = smal ? hoogtepx + 20 : y0, aH = Math.min(ph, 140);
  const aSc = aW / (sV * 6);
  const H = smal ? aY + aH + 80 : Math.max(hoogtepx, aY + aH + 90);

  return (
    <div className="vd-panel">
      <UitkomstKop titel={t("twRcBeam.titel")} uitkomst={uitkomst} />
      <div className="vd-body" style={{ flex: 1, minHeight: 0, alignItems: "stretch" }}>
        <div className="vd-controls vd-compact" style={{ alignSelf: "flex-start" }}>
          <span className="vd-ctrl-h">{t("twRcBeam.kop")}</span>
          <label>{ctx.eenheden.label(t("twRcBeam.velden.cc"), "mm")}
            <StelselGetal eenheden={ctx.eenheden} eenheid="mm" step={5} waarde={d("c_c")} onWijzig={(w) => set("c_c", w || 0)} />
          </label>
          <label>{t("twRcBeam.velden.barT")}
            <select value={idx(d("bar_t"), 7) + 1} onChange={(e) => set("bar_t", parseInt(e.target.value))}>
              {D_HOOFD.map((_, i) => <option key={i} value={i + 1}>{`D${["16", "19", "22", "25", "29", "32", "36"][i]}`}</option>)}
            </select>
          </label>
          <label>{t("twRcBeam.velden.nT")}<input type="number" step={1} value={nT} onChange={(e) => set("n_t", parseInt(e.target.value) || 1)} /></label>
          <label>{t("twRcBeam.velden.lagen")}
            <select value={Math.round(d("rebar_layers"))} onChange={(e) => set("rebar_layers", parseInt(e.target.value))}>
              <option value={1}>{t("twRcBeam.keuzes.enkel")}</option>
              <option value={2}>{t("twRcBeam.keuzes.dubbel")}</option>
            </select>
          </label>
          <label>{t("twRcBeam.velden.hasTop")}
            <select value={Math.round(d("has_top"))} onChange={(e) => set("has_top", parseInt(e.target.value))}>
              <option value={1}>{t("twRcBeam.keuzes.geenDruk")}</option>
              <option value={2}>{t("twRcBeam.keuzes.metDruk")}</option>
            </select>
          </label>
          {d("has_top") === 2 && (
            <>
              <label>{t("twRcBeam.velden.barC")}
                <select value={idx(d("bar_c"), 5) + 1} onChange={(e) => set("bar_c", parseInt(e.target.value))}>
                  {["16", "19", "22", "25", "29"].map((s, i) => <option key={s} value={i + 1}>{`D${s}`}</option>)}
                </select>
              </label>
              <label>{t("twRcBeam.velden.nC")}<input type="number" step={1} value={nC} onChange={(e) => set("n_c", parseInt(e.target.value) || 0)} /></label>
            </>
          )}
          <label>{t("twRcBeam.velden.barV")}
            <select value={idx(d("bar_v"), 3) + 1} onChange={(e) => set("bar_v", parseInt(e.target.value))}>
              {["10", "13", "16"].map((s, i) => <option key={s} value={i + 1}>{`D${s}`}</option>)}
            </select>
          </label>
          <label>{t("twRcBeam.velden.legs")}<input type="number" step={1} value={legs} onChange={(e) => set("n_legs", parseInt(e.target.value) || 2)} /></label>
          <span className="gd-note">{t("twRcBeam.noot")}</span>
        </div>

        <div ref={wrapRef} className="vd-canvases" style={{ flex: 1, minWidth: 0, borderLeft: "1px solid var(--theme-border-subtle, #d1d5db)", paddingLeft: 18 }}>
          <div className="vd-canvas">
            <div className="vd-caption">{t("twRcBeam.doorsnede")}</div>
            <div className="vd-stage" style={{ width: W, height: H, background: "transparent", border: "none", borderRadius: 0 }}>
              <svg width={W} height={H} className="vd-svg">
                <Defs k="rb" />
                <rect x={x0} y={y0} width={pw} height={ph} fill={betonFill("rb")} stroke="#374151" strokeWidth={1.4} />
                <rect x={pX(cc + dv / 2)} y={pY(h - cc - dv / 2)} width={(b - 2 * cc - dv) * sc} height={(h - 2 * cc - dv) * sc}
                  fill="none" stroke="#1d4ed8" strokeWidth={Math.max(1.2, dv * sc)} rx={3} />
                {legs > 2 && Array.from({ length: legs - 2 }, (_, i) => {
                  const x = cc + dv + dt / 2 + ((b - 2 * (cc + dv) - dt) * (i + 1)) / (legs - 1);
                  return <line key={i} x1={pX(x)} y1={pY(cc)} x2={pX(x)} y2={pY(h - cc)} stroke="#1d4ed8" strokeWidth={Math.max(1, dv * sc)} />;
                })}
                {staven.map((s, i) => (
                  <circle key={i} cx={pX(s.x)} cy={pY(s.y)} r={Math.max(2.5, s.r * sc)} fill="#111827" />
                ))}
                <HDim k="rb" x0={x0} x1={x0 + pw} y={yMaat} ext={y0 + ph + 4} />
                <VDim k="rb" y0={y0} y1={y0 + ph} x={x0 + pw + 30} ext={x0 + pw + 4} />
                {/* langsaanzicht */}
                <rect x={ax} y={aY} width={aW} height={aH} fill={betonFill("rb")} stroke="#374151" strokeWidth={1.2} />
                {Array.from({ length: 7 }, (_, i) => (
                  <line key={i} x1={ax + i * sV * aSc} y1={aY + 8} x2={ax + i * sV * aSc} y2={aY + aH - 8} stroke="#1d4ed8" strokeWidth={1.6} />
                ))}
                <line x1={ax + 4} y1={aY + aH - 10} x2={ax + aW - 4} y2={aY + aH - 10} stroke="#111827" strokeWidth={Math.max(2, dt * sc)} />
                <HDim k="rb" x0={ax + sV * aSc} x1={ax + 2 * sV * aSc} y={aY + aH + 22} ext={aY + aH} />
              </svg>
              <Dim ctx={ctx} name="b" value={b} x={x0 + pw / 2 - 30} y={yMaat - 10} step={10} label={SYM.b} eenheid="mm" />
              <Dim ctx={ctx} name="h" value={h} x={x0 + pw + 38} y={y0 + ph / 2} step={10} label={SYM.h} eenheid="mm" />
              <Dim ctx={ctx} name="c_c" value={cc} x={x0 + 4} y={y0 - 28} step={5} label={SYM.cc} eenheid="mm" />
              <Dim ctx={ctx} name="s_v" value={sV} x={ax + 1.5 * sV * aSc - 24} y={aY + aH + 14} step={10} label={SYM.s} eenheid="mm" />
              <Ro text={`${n1}${n2 ? `+${n2}` : ""} × Ø${dt}`} x={x0 + pw / 2 - 30} y={y0 + ph + 6} />
            </div>
          </div>
        </div>
      </div>
      <div className="vd-foot"><span>{t("twRcBeam.klik")}</span></div>
    </div>
  );
}
