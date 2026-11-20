import { useEffect, useLayoutEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useTranslation } from "react-i18next";
import { alsOpbouw, opbouwenVoor } from "../../../rapport/gewichten";
import { alsOpbouwUitRegel, taalVoorRapport } from "../../../rapport/gewichtenBibliotheek";
import { belastingBronnen, geldigSymbool } from "../../../rapport/belastingBronnen";
import type { Opbouw } from "../../../rapport/model";
import { gevelOpbouw, vlakOpbouw } from "../../../rapport/opbouw";
import { useProjectStore } from "../../../store/projectStore";
import { useBeeldEenheden } from "../../calc/useBeeldEenheden";
import GewichtenVenster from "../gewichten/GewichtenVenster";
import {
  BOUWDEEL_KOP, BOUWDELEN, BibliotheekMenu, OpbouwKaart, inStelsel, nieuweOpbouw, opbouwTekst,
  type Menugroep, type Opbouwgroep,
} from "./OpbouwEditor";
import { BLOK_B, HOOGTE_GOK, KAART_B, heeftPlek, opRaster, plekken, type Plek } from "./blokPlekken";
import "./BelastingCanvas.css";

/*
 * 5.5 Blijvende belastingen als canvas: elke opbouw is een los blok met een naam, een
 * symbool en zijn lagen. Klik op een blok om het te bewerken, sleep het om het te
 * verplaatsen, het plusje zet er een laag bij. De som van een blok bestaat onder zijn
 * symbool in elk rekenblad (rapport/belastingBronnen.ts); een lastblok in een blad kiest
 * er een uit een lijst.
 *
 * De blokken blijven de opbouwen van het rapport (rapport.belastingen), met hun plek
 * erbij. Een blok zonder plek zet het canvas zelf neer, onder de rest. Bij het eerste
 * slepen krijgen alle blokken hun plek, zodat er daarna niets meer verspringt.
 */

/** Zoveel moet de muis bewegen voordat een klik slepen wordt. */
const SLEEP_DREMPEL = 4;

const GROEPEN: readonly Opbouwgroep[] = ["vloerenDaken", "wanden"];

interface Blok {
  sleutel: string;
  groep: Opbouwgroep;
  index: number;
  opbouw: Opbouw;
}

export default function BelastingCanvas() {
  const { t } = useTranslation("rapport");
  const { t: tg, i18n } = useTranslation("gewichten");
  const e = useBeeldEenheden();
  const belastingen = useProjectStore((s) => s.rapport.belastingen);
  const werkBij = useProjectStore((s) => s.werkRapportBij);
  const rapportTaal = useProjectStore((s) => taalVoorRapport(s.rapport, i18n.language));

  const blokken = useMemo<Blok[]>(
    () => GROEPEN.flatMap((groep) => belastingen[groep].map((opbouw, index) => ({ sleutel: `${groep}:${index}`, groep, index, opbouw }))),
    [belastingen],
  );
  const dubbel = useMemo(
    () => new Set(belastingBronnen(belastingen).dubbel.map((b) => `${b.groep}:${b.index}`)),
    [belastingen],
  );

  const vlak = useRef<HTMLDivElement>(null);
  const [breedte, zetBreedte] = useState(880);
  const [hoogtes, zetHoogtes] = useState<Record<string, number>>({});
  const [open, zetOpen] = useState<string | null>(null);
  const [venster, zetVenster] = useState<Opbouwgroep | null>(null);
  const [gesleept, zetGesleept] = useState<({ sleutel: string } & Plek) | null>(null);
  const sleep = useRef<{ sleutel: string; px: number; py: number; x: number; y: number; bewogen: boolean } | null>(null);
  /** Net gesleept: de klik die daarop volgt, opent het blok niet. */
  const netGesleept = useRef(false);

  useEffect(() => {
    const el = vlak.current;
    if (!el) return;
    const meet = () => zetBreedte(el.clientWidth);
    meet();
    const kijker = new ResizeObserver(meet);
    kijker.observe(el);
    return () => kijker.disconnect();
  }, []);

  // De hoogte van elk blok en van de open kaart, na elke keer tekenen: een laag erbij maakt een blok hoger.
  useLayoutEffect(() => {
    const el = vlak.current;
    if (!el) return;
    const nu: Record<string, number> = {};
    for (const kind of el.querySelectorAll<HTMLElement>("[data-blok]")) nu[kind.dataset.blok!] = kind.offsetHeight;
    // Het blok dat open staat, staat er even niet: het houdt zijn laatste hoogte, zodat de rest blijft staan.
    zetHoogtes((oud) => (Object.keys(nu).every((k) => oud[k] === nu[k]) ? oud : { ...oud, ...nu }));
  });

  const plek = useMemo(() => plekken(blokken, hoogtes, breedte), [blokken, hoogtes, breedte]);

  const wijzig = (groep: Opbouwgroep) => (fn: (lijst: Opbouw[]) => Opbouw[]) =>
    werkBij((r) => {
      const b = r.belastingen;
      const lijst = fn(b[groep]);
      return { ...r, belastingen: groep === "wanden" ? { ...b, wanden: lijst } : { ...b, vloerenDaken: lijst } };
    });

  /** Een nieuw blok achteraan in zijn groep; het gaat meteen open. */
  const voegToe = (groep: Opbouwgroep, opbouw: Opbouw) => {
    const index = useProjectStore.getState().rapport.belastingen[groep].length;
    wijzig(groep)((l) => [...l, opbouw]);
    zetOpen(`${groep}:${index}`);
  };

  /** Zet plekken in het rapport: alle blokken tegelijk, zodat er daarna niets meer verspringt. */
  const bewaarPlekken = (nieuw: Record<string, Plek>) =>
    werkBij((r) => {
      const b = r.belastingen;
      const metPlek = (groep: Opbouwgroep) =>
        b[groep].map((o, i) => {
          const p = nieuw[`${groep}:${i}`];
          return p && (o.x !== p.x || o.y !== p.y) ? { ...o, x: p.x, y: p.y } : o;
        });
      return { ...r, belastingen: { ...b, vloerenDaken: metPlek("vloerenDaken"), wanden: metPlek("wanden") } };
    });

  /** Alle blokken weer netjes onder elkaar: de plekken vervallen. */
  const rangschik = () =>
    werkBij((r) => {
      const b = r.belastingen;
      const zonder = (lijst: Opbouw[]) => lijst.map((o) => {
        if (!heeftPlek(o)) return o;
        const { x: _x, y: _y, ...rest } = o;
        return rest as Opbouw;
      });
      return { ...r, belastingen: { ...b, vloerenDaken: zonder(b.vloerenDaken), wanden: zonder(b.wanden) } };
    });

  const beginSlepen = (ev: ReactPointerEvent<HTMLDivElement>, b: Blok) => {
    if (ev.button !== 0 || (ev.target as HTMLElement).closest("button, input, select, a")) return;
    netGesleept.current = false;
    ev.currentTarget.setPointerCapture(ev.pointerId);
    const p = plek[b.sleutel];
    sleep.current = { sleutel: b.sleutel, px: ev.clientX, py: ev.clientY, x: p.x, y: p.y, bewogen: false };
  };

  const volgSlepen = (ev: ReactPointerEvent<HTMLDivElement>) => {
    const s = sleep.current;
    if (!s) return;
    if (!s.bewogen && Math.hypot(ev.clientX - s.px, ev.clientY - s.py) < SLEEP_DREMPEL) return;
    s.bewogen = true;
    const x = Math.min(opRaster(s.x + ev.clientX - s.px), opRaster(Math.max(0, breedte - BLOK_B)));
    zetGesleept({ sleutel: s.sleutel, x, y: opRaster(s.y + ev.clientY - s.py) });
  };

  const eindSlepen = (b: Blok) => {
    const s = sleep.current;
    sleep.current = null;
    if (!s) return;
    if (s.bewogen && gesleept) {
      netGesleept.current = true;
      bewaarPlekken({ ...plek, [b.sleutel]: { x: gesleept.x, y: gesleept.y } });
    }
    zetGesleept(null);
  };

  /** Wat er mis is met een symbool voor dit blok, of niets. */
  const symboolMelding = (b: Blok) => (symbool: string) => {
    if (!geldigSymbool(symbool)) return t("opbouw.symboolOngeldig");
    const bezet = [...blokken.filter((x) => x.sleutel !== b.sleutel).map((x) => x.opbouw.symbool), ...belastingen.klassen.map((k) => k.symbool)];
    return bezet.includes(symbool) ? t("opbouw.symboolBestaat", { symbool }) : null;
  };

  const bibliotheek: Menugroep[] = [
    ...GROEPEN.flatMap((groep) =>
      BOUWDELEN[groep].map((deel) => ({
        naam: t(BOUWDEEL_KOP[deel]),
        regels: opbouwenVoor([deel]).map((o) => ({
          label: o.naam,
          uittreksel: opbouwTekst(o, t, e),
          kies: () => voegToe(groep, alsOpbouw(o)),
        })),
      })),
    ),
    {
      naam: tg("titel", { defaultValue: "Gewichtenbibliotheek" }),
      regels: [
        { label: t("blokken.zoekVloerDak"), uittreksel: t("blokken.zoekUitleg"), kies: () => zetVenster("vloerenDaken") },
        { label: t("blokken.zoekWand"), uittreksel: t("blokken.zoekUitleg"), kies: () => zetVenster("wanden") },
      ],
    },
  ];

  const openBlok = blokken.find((b) => b.sleutel === open) ?? null;
  const onderkant = Math.max(
    0,
    ...blokken.map((b) => (gesleept?.sleutel === b.sleutel ? gesleept.y : plek[b.sleutel]?.y ?? 0) + (hoogtes[b.sleutel] ?? HOOGTE_GOK)),
    openBlok ? (plek[openBlok.sleutel]?.y ?? 0) + (hoogtes.kaart ?? 0) : 0,
  );

  return (
    <div className="bc">
      <p className="rapport-hint">{t("blokken.uitleg")}</p>
      <div className="rapport-knoppen">
        <button type="button" className="rapport-knop" onClick={() => voegToe("vloerenDaken", nieuweOpbouw("vlak"))}>
          + {t("blokken.vloerDak")}
        </button>
        <button type="button" className="rapport-knop" onClick={() => voegToe("wanden", nieuweOpbouw("vlak"))}>
          + {e.label(t("blokken.wand"), "kN/m²")}
        </button>
        <button type="button" className="rapport-knop" onClick={() => voegToe("wanden", nieuweOpbouw("gevel"))}>
          + {e.label(t("blokken.gevel"), "kN/m¹")}
        </button>
        <BibliotheekMenu knop={t("blokken.uitBibliotheek")} titel={t("opbouw.opbouwUitBibliotheekTitel")} groepen={bibliotheek} />
        {blokken.some((b) => heeftPlek(b.opbouw)) && (
          <button type="button" className="rapport-knop" title={t("blokken.rangschikUitleg")} onClick={rangschik}>
            {t("blokken.rangschik")}
          </button>
        )}
      </div>
      <div
        ref={vlak}
        className="bc-vlak"
        style={{ height: onderkant + 60 }}
        onPointerDown={(ev) => {
          if (ev.target === ev.currentTarget) zetOpen(null);
        }}
      >
        {blokken.length === 0 && <p className="bc-leeg">{t("blokken.leeg")}</p>}
        {blokken.map((b) => {
          const p = gesleept?.sleutel === b.sleutel ? gesleept : plek[b.sleutel] ?? { x: 0, y: 0 };
          if (b.sleutel === open) return null;
          return (
            <div
              key={b.sleutel}
              data-blok={b.sleutel}
              className={`bc-blok${gesleept?.sleutel === b.sleutel ? " sleept" : ""}`}
              style={{ left: p.x, top: p.y, width: BLOK_B }}
              role="button"
              tabIndex={0}
              title={t("blokken.blokUitleg")}
              onPointerDown={(ev) => beginSlepen(ev, b)}
              onPointerMove={volgSlepen}
              onPointerUp={() => eindSlepen(b)}
              onPointerCancel={() => {
                sleep.current = null;
                zetGesleept(null);
              }}
              onClick={(ev) => {
                if (netGesleept.current) {
                  netGesleept.current = false;
                  return;
                }
                if (!(ev.target as HTMLElement).closest("button")) zetOpen(b.sleutel);
              }}
              onKeyDown={(ev) => {
                if (ev.key === "Enter" && ev.target === ev.currentTarget) zetOpen(b.sleutel);
              }}
            >
              <BlokInhoud
                blok={b}
                dubbel={dubbel.has(b.sleutel)}
                laagErbij={() => {
                  wijzig(b.groep)((l) => l.map((o, j) => {
                    if (j !== b.index) return o;
                    return o.soort === "vlak"
                      ? { ...o, lagen: [...o.lagen, { naam: "", d: "", rho: "", p: "" }] }
                      : { ...o, lagen: [...o.lagen, { naam: "", p: "", h: "", vulling: "" }] };
                  }));
                  zetOpen(b.sleutel);
                }}
              />
            </div>
          );
        })}
        {openBlok && (
          <div
            data-blok="kaart"
            className="bc-kaart"
            style={{
              left: Math.max(0, Math.min(plek[openBlok.sleutel]?.x ?? 0, breedte - KAART_B)),
              top: plek[openBlok.sleutel]?.y ?? 0,
              width: Math.min(KAART_B, breedte),
            }}
            onKeyDown={(ev) => {
              if (ev.key === "Escape") zetOpen(null);
            }}
          >
            <span className="bc-groep">{t(openBlok.groep === "wanden" ? "blokken.wand" : "blokken.vloerDak")}</span>
            <OpbouwKaart
              opbouw={openBlok.opbouw}
              pad={`belastingen.${openBlok.groep}.${openBlok.index}`}
              index={openBlok.index}
              bouwdelen={BOUWDELEN[openBlok.groep]}
              wijzig={wijzig(openBlok.groep)}
              symboolMelding={symboolMelding(openBlok)}
              onKlaar={() => zetOpen(null)}
            />
          </div>
        )}
      </div>
      {venster && (
        <GewichtenVenster
          open
          doel={t(venster === "wanden" ? "blokken.wand" : "blokken.vloerDak")}
          onSluit={() => zetVenster(null)}
          onInvoegen={(r) => voegToe(venster, alsOpbouwUitRegel(r, rapportTaal))}
        />
      )}
    </div>
  );
}

/** Een blok zoals het op het canvas staat: naam, symbool, de lagen met hun gewicht en de som. */
function BlokInhoud({ blok, dubbel, laagErbij }: { blok: Blok; dubbel: boolean; laagErbij: () => void }) {
  const { t } = useTranslation("rapport");
  const e = useBeeldEenheden();
  const o = blok.opbouw;
  const eenheid = o.soort === "vlak" ? "kN/m²" : "kN/m¹";
  const som = o.soort === "vlak" ? vlakOpbouw(o.lagen) : gevelOpbouw(o.lagen);
  const waarden = som.regels.map((r) => ("q" in r ? r.q : r.p));
  return (
    <>
      <div className="bc-kop">
        <span className="bc-naam">{o.naam.trim() || t("opbouw.zonderNaam")}</span>
        <code className={`bc-symbool${dubbel ? " fout" : ""}`} title={t(dubbel ? "opbouw.symboolDubbel" : "blokken.inBladen", { symbool: o.symbool })}>
          {o.symbool}
        </code>
      </div>
      <table className="bc-lagen">
        <tbody>
          {o.lagen.map((l, i) => (
            <tr key={i}>
              <td>{l.naam.trim() || "—"}</td>
              <td>{inStelsel(e, waarden[i], eenheid, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="bc-som">
        <span>{t(blok.groep === "wanden" ? (o.soort === "gevel" ? "blokken.gevel" : "blokken.wand") : "blokken.vloerDak")}</span>
        <strong>{inStelsel(e, som.som, eenheid, 2)} {e.eenheid(eenheid)}</strong>
      </div>
      <button type="button" className="bc-plus" title={t("opbouw.laagToevoegen")} aria-label={t("opbouw.laagToevoegen")} onClick={laagErbij}>
        +
      </button>
    </>
  );
}
