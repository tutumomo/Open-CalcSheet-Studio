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
