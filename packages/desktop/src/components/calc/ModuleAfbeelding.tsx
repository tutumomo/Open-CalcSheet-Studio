import type { ReactNode } from "react";

/** Schematische catalogusbeelden; onafhankelijk van projectinvoer en rekenwaarden. */
const vlak = "var(--mk-beeld-vlak)";
const accent = "var(--theme-accent)";
const p = (d: string) => <path d={d} />;
const r = (x: number, y: number, w: number, h: number) =>
  <rect x={x} y={y} width={w} height={h} fill={vlak} />;
const kracht = (x: number, y: number, hoek = 0) => (
  <g transform={`translate(${x} ${y}) rotate(${hoek})`} stroke={accent}>
    <path d="M0 0v20m-4-5 4 5 4-5" />
  </g>
);
const steun = (x: number, y: number) => (
  <g transform={`translate(${x} ${y})`}>
    <path d="M0 0l-7 10H7ZM-10 14h20" />
  </g>
);

/** Gegenereerde modulebeelden; het symbool benoemt de toets visueel. */
const eigenBeelden = import.meta.glob("../../assets/module-beelden/*.webp", {
  eager: true,
  query: "?url",
  import: "default",
}) as Record<string, string>;

/** Elk rekenmodule-id heeft een eigen herkenningsbeeld. */
const beelden: Record<string, ReactNode> = {
  ligger: <>{r(26, 43, 108, 8)}{steun(34, 51)}{steun(126, 51)}{kracht(54, 15)}{kracht(80, 15)}{kracht(106, 15)}</>,
  tweepaalspoer: <>{r(30, 28, 100, 26)}{r(44, 54, 18, 26)}{r(98, 54, 18, 26)}{r(68, 8, 24, 20)}{kracht(80, -8)}</>,
  balklaag: <>{[0, 1, 2, 3].map((i) => <path key={i} d={`M${24 + i * 23} 62l28-35 9 3-28 35v10l-9-3Z`} fill={vlak} />)}{p("m24 62 81 11 31-37M24 72l81 11 31-37")}</>,
  // 台灣版
  "tw-rc-beam": <>{r(24, 28, 112, 48)}{kracht(80, 2)}</>,
  "tw-rc-column": <>{r(50, 15, 60, 70)}{kracht(80, -5)}{kracht(80, 85, 180)}</>,
  "tw-isolated-footing": <>{r(25, 55, 110, 25)}{r(65, 15, 30, 40)}{kracht(80, -5)}{kracht(50, 95, 180)}{kracht(80, 95, 180)}{kracht(110, 95, 180)}</>,
  "tw-steel-beam": <>{r(24, 30, 112, 8)}{r(74, 38, 12, 34)}{r(24, 72, 112, 8)}{kracht(80, 2)}</>,
  "tw-steel-column": <>{r(62, 10, 8, 70)}{r(70, 40, 20, 10)}{r(90, 10, 8, 70)}{r(45, 80, 70, 8)}{kracht(80, -10)}{kracht(80, 88, 180)}</>,
  "tw-retaining-wall": <>{r(25, 70, 110, 15)}{r(55, 15, 20, 55)}{kracht(120, 35, 90)}{kracht(105, 55, 90)}{kracht(50, 95, 180)}{kracht(75, 95, 180)}{kracht(105, 95, 180)}</>,
  "tw-drainage-channel": <>{r(30, 30, 12, 50)}{r(118, 30, 12, 50)}{r(30, 74, 100, 8)}{p("M44 58q9 5 18 0t18 0 18 0 18 0")}{kracht(80, 2)}</>,
  "tw-detention-basin": <>{p("M20 40 40 80H120L140 40")}{r(40, 62, 80, 18)}{kracht(30, 10)}{kracht(130, 10)}{p("M120 70h30")}</>,
  "tw-box-culvert": <>{r(25, 20, 110, 12)}{r(25, 78, 110, 14)}{r(25, 32, 14, 46)}{r(121, 32, 14, 46)}{p("M39 42l10-10M121 42l-10-10M39 68l10 10M121 68l-10 10")}{kracht(80, 0)}</>,
  "tw-seismic-load": <>{r(55, 15, 50, 70)}{kracht(20, 25, 90)}{kracht(20, 45, 90)}{kracht(20, 65, 90)}</>,
  "tw-wind-load": <>{kracht(15, 25, 90)}{kracht(15, 45, 90)}{kracht(15, 65, 90)}{r(55, 15, 50, 70)}</>,
  "tw-dead-live-loads": <>{r(25, 60, 110, 14)}{kracht(45, 5)}{kracht(70, 5)}{kracht(95, 5)}{kracht(120, 5)}</>,
  "tw-rc-slab": <>{r(20, 45, 120, 12)}{kracht(40, 15)}{kracht(65, 15)}{kracht(90, 15)}{kracht(115, 15)}{steun(30, 57)}{steun(130, 57)}</>,
  "tw-pile-cap": <>{r(30, 35, 100, 20)}{r(65, 10, 30, 25)}{r(38, 55, 14, 28)}{r(106, 55, 14, 28)}{r(72, 55, 14, 28)}{kracht(80, -10)}</>,
  "tw-gravity-retaining-wall": <>{p("M60 10h20l25 70H60Z")}{r(40, 80, 90, 8)}{kracht(25, 25, 90)}{kracht(25, 45, 90)}</>,
  "tw-backwater-profile": <>{p("M10 78H150")}{p("M10 40q70 10 140 -20")}{kracht(80, 0)}</>,
  "tw-sediment-basin": <>{p("M20 30 35 80H125L140 30")}{r(35, 66, 90, 14)}{p("M8 30h12M140 30h14M30 48q8 4 16 0t16 0 16 0 16 0 16 0 16 0")}{kracht(14, 8, -90)}</>,
};

export default function ModuleAfbeelding({ templateId, beeldUrl }: { templateId: string; beeldUrl?: string | null }) {
  const beeld = beelden[templateId];
  // Een module uit de online bibliotheek brengt zijn eigen beeld mee.
  const foto = beeldUrl || eigenBeelden[`../../assets/module-beelden/${templateId}.webp`];
  if (!beeld && !foto) return null;
  return (
    <span className="mk-afbeelding" aria-hidden="true">
      {/* Een eigen beeld is al een tekening van de module; het symbooltje
          erover zou dubbelop zijn. Alleen zonder eigen beeld het symbool. */}
      {foto ? (
        <img src={foto} alt="" loading="lazy" />
      ) : (
        <svg viewBox="0 -10 160 110" fill="none" stroke="currentColor" strokeWidth="1.8"
          strokeLinecap="round" strokeLinejoin="round" focusable="false">
          {beeld}
        </svg>
      )}
    </span>
  );
}
