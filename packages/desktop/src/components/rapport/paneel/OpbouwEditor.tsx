import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import {
  alsGevellaag,
  alsLaag,
  laaggroepenVoor,
  omschrijving,
  opbouwenVoor,
  somVan,
  voegToe,
  type Bibliotheekopbouw,
  type Bouwdeel,
} from "../../../rapport/gewichten";
import {
  alsGevellaagUitRegel,
  alsLaagUitRegel,
  effectieveP,
  taalVoorRapport,
} from "../../../rapport/gewichtenBibliotheek";
import type { Gevellaag, Laag, Opbouw } from "../../../rapport/model";
import { gevelOpbouw, vlakOpbouw } from "../../../rapport/opbouw";
import { useProjectStore } from "../../../store/projectStore";
import GewichtenVenster from "../gewichten/GewichtenVenster";
import { getalTekst } from "./hulp";
import type { BeeldEenheden } from "../../calc/beeldEenheden";
import { useBeeldEenheden } from "../../calc/useBeeldEenheden";
import RijenTabel, { type Kolom } from "./RijenTabel";

/** De twee groepen van 5.5. */
export type Opbouwgroep = "vloerenDaken" | "wanden";

/** Welke bouwdelen uit de bibliotheek bij een groep horen. */
export const BOUWDELEN: Record<Opbouwgroep, readonly Bouwdeel[]> = {
  vloerenDaken: ["vloer", "dak"],
  wanden: ["wand"],
};

/** Sleutel van de kop boven de bouwdelen in het bibliotheekmenu. */
export const BOUWDEEL_KOP: Record<Bouwdeel, string> = {
  vloer: "belastingen.vloeren",
  dak: "belastingen.daken",
  wand: "belastingen.wanden",
};

/** De lagen in het eenhedenstelsel van het project; opgeslagen in m, kN/m³ en kN/m². */
function vlakKolommen(t: TFunction<"rapport">, e: BeeldEenheden): Kolom<Laag>[] {
  return [
    { sleutel: "naam", kop: t("opbouw.laag") },
    { sleutel: "d", kop: `d [${e.eenheid("m")}]`, breedte: "5.5em", getal: true, eenheid: "m" },
    { sleutel: "rho", kop: `ρ [${e.eenheid("kN/m³")}]`, breedte: "6.5em", getal: true, eenheid: "kN/m³" },
    { sleutel: "p", kop: `p [${e.eenheid("kN/m²")}]`, breedte: "6.5em", getal: true, placeholder: "d × ρ", eenheid: "kN/m²" },
  ];
}

function gevelKolommen(t: TFunction<"rapport">, e: BeeldEenheden): Kolom<Gevellaag>[] {
  return [
    { sleutel: "naam", kop: t("opbouw.laag") },
    { sleutel: "p", kop: <>p<sub>rep</sub> [{e.eenheid("kN/m²")}]</>, breedte: "7em", getal: true, eenheid: "kN/m²" },
    { sleutel: "h", kop: `h [${e.eenheid("m")}]`, breedte: "5.5em", getal: true, eenheid: "m" },
    { sleutel: "vulling", kop: t("opbouw.vulling"), breedte: "5.5em", getal: true, placeholder: "90%" },
  ];
}

export function nieuweOpbouw(soort: Opbouw["soort"]): Opbouw {
  return soort === "vlak"
    ? { soort: "vlak", naam: "", lagen: [{ naam: "", d: "", rho: "", p: "" }] }
    : { soort: "gevel", naam: "", lagen: [{ naam: "", p: "", h: "", vulling: "" }] };
}

/**
 * Eén opbouw uit 5.5 Blijvende belastingen, om te bewerken: de naam, het symbool
 * waaronder de som in de rekenbladen bestaat, en de lagen. Een vlakopbouw telt per laag
 * d × ρ op (of de ingevulde p) tot kN/m²; een gevelopbouw telt p × h × vulling op tot
 * kN/m¹. De sommen komen uit opbouw.ts, dezelfde rekensom als in de afdruk.
 *
 * "Laag uit bibliotheek" voegt een losse laag uit rapport/gewichten.ts in; daarna is het
 * gewone invoer die je kunt aanpassen. "Gewichtenbibliotheek" opent het venster met alle
 * regels en hun bron (rapport/gewichtenBibliotheek.ts). Een klik zet een regel in de
 * opbouw, als kopie in getallen: een rapport verandert niet als de bibliotheek verandert.
 *
 * Het canvas (BelastingCanvas.tsx) toont deze kaart voor het blok dat open staat.
 */
export function OpbouwKaart({ opbouw, pad, index, bouwdelen, wijzig, symboolMelding, onKlaar }: {
  opbouw: Opbouw;
  pad: string;
  index: number;
  bouwdelen: readonly Bouwdeel[];
  wijzig: (fn: (lijst: Opbouw[]) => Opbouw[]) => void;
  /** Wat er mis is met het symbool (bestaat al, geen geldige naam), of niets. */
  symboolMelding?: (symbool: string) => string | null;
  /** Sluit de kaart; het blok staat dan weer klein op het canvas. */
  onKlaar: () => void;
}) {
  const { t } = useTranslation("rapport");
  const { t: tg, i18n } = useTranslation("gewichten");
  const eenheden = useBeeldEenheden();
  const zet = useProjectStore((s) => s.zetRapportVeld);
  const rapportTaal = useProjectStore((s) => taalVoorRapport(s.rapport, i18n.language));
  const [venster, setVenster] = useState(false);
  const vlak = opbouw.soort === "vlak";
  // Het symbool gaat pas naar het rapport als het veld wordt verlaten en de naam kan:
  // halverwege het typen mag een blad zijn belasting niet kwijtraken.
  const [symbool, zetSymbool] = useState(opbouw.symbool ?? "");
  useEffect(() => zetSymbool(opbouw.symbool ?? ""), [opbouw.symbool]);
  const melding = symbool.trim() !== (opbouw.symbool ?? "") ? symboolMelding?.(symbool.trim()) ?? null : null;
  const bewaarSymbool = () => {
    const nieuw = symbool.trim();
    if (nieuw === (opbouw.symbool ?? "")) return;
    if (!nieuw || symboolMelding?.(nieuw)) {
      zetSymbool(opbouw.symbool ?? "");
      return;
    }
    zet(`${pad}.symbool`, nieuw);
  };

  // Een laag uit de bibliotheek achteraan in deze opbouw. De opbouw komt uit
  // de lijst van dát moment; is hij intussen van soort veranderd, dan niets.
  const voegLaagToe = (laag: Laag) =>
    wijzig((l) => l.map((o, j) => (j === index && o.soort === "vlak" ? { ...o, lagen: voegToe(o.lagen, laag) } : o)));
  const voegGevellaagToe = (laag: Gevellaag) =>
    wijzig((l) => l.map((o, j) => (j === index && o.soort === "gevel" ? { ...o, lagen: voegToe(o.lagen, laag) } : o)));

  // Vlak: de losse lagen voor de bouwdelen van deze groep. Gevel: complete
  // wanden als één laag met hun gewicht per m²; h en vulling vul je zelf in.
  const bibliotheek: Menugroep[] = vlak
    ? laaggroepenVoor(bouwdelen).map((g) => ({
        naam: g.naam,
        regels: g.lagen.map((laag) => ({
          label: laag.naam,
          uittreksel: omschrijving(laag),
          kies: () => voegLaagToe(alsLaag(laag)),
        })),
      }))
    : [
        {
          naam: t(BOUWDEEL_KOP.wand),
          regels: opbouwenVoor(["wand"]).map((o) => ({
            label: o.naam,
            uittreksel: opbouwTekst(o, t, eenheden),
            kies: () => voegGevellaagToe(alsGevellaag(o)),
          })),
        },
      ];
  const menu = (
    <>
      <BibliotheekMenu
        knop={t("opbouw.laagUitBibliotheek")}
        titel={t(vlak ? "opbouw.laagUitBibliotheekTitel" : "opbouw.wandUitBibliotheekTitel")}
        groepen={bibliotheek}
      />
      <button type="button" className="rapport-knop" title={tg("knop.laagUitleg")} onClick={() => setVenster(true)}>
        {tg("knop.invoegen")}
      </button>
    </>
  );

  return (
    <div className="rapport-kaart">
      <div className="rapport-kaart-kop">
        <input
          type="text"
          value={opbouw.naam}
          aria-label={t("opbouw.naamLabel")}
          placeholder={t(vlak ? "opbouw.naamVlak" : "opbouw.naamGevel")}
          onChange={(e) => zet(`${pad}.naam`, e.target.value)}
        />
        <input
          type="text"
          className="rapport-symbool"
          value={symbool}
          spellCheck={false}
          aria-label={t("opbouw.symboolLabel")}
          title={t("opbouw.symboolUitleg")}
          onChange={(e) => zetSymbool(e.target.value)}
          onBlur={bewaarSymbool}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
        />
        <span className="rapport-soort">{t(vlak ? "opbouw.soortVlak" : "opbouw.soortGevel", { eenheid: eenheden.eenheid(vlak ? "kN/m²" : "kN/m¹") })}</span>
        <button
          type="button"
          className="rapport-icoon"
          title={t("opbouw.verwijderen")}
          onClick={() => {
            const naam = opbouw.naam.trim() || t("opbouw.zonderNaam");
            if (confirm(t("opbouw.verwijderVraag", { naam }))) {
              onKlaar();
              wijzig((l) => l.filter((_, j) => j !== index));
            }
          }}
        >
          ✕
        </button>
        <button type="button" className="rapport-knop" onClick={onKlaar}>
          {t("opbouw.klaar")}
        </button>
      </div>
      {melding && <p className="rapport-melding">{melding}</p>}
      {opbouw.soort === "vlak" ? (
        <VlakLagen pad={`${pad}.lagen`} lagen={opbouw.lagen} knoppen={menu} />
      ) : (
        <GevelLagen pad={`${pad}.lagen`} lagen={opbouw.lagen} knoppen={menu} />
      )}
      {venster && (
        <GewichtenVenster
          open
          doel={opbouw.naam.trim() || t("opbouw.zonderNaam")}
          onSluit={() => setVenster(false)}
          kanInvoegen={vlak ? undefined : (r) => effectieveP(r) !== undefined}
          onInvoegen={(r) => {
            if (vlak) {
              voegLaagToe(alsLaagUitRegel(r, rapportTaal));
              return;
            }
            const laag = alsGevellaagUitRegel(r, rapportTaal);
            if (laag) voegGevellaagToe(laag);
          }}
        />
      )}
    </div>
  );
}

/** Een berekend getal in het eenhedenstelsel, of "—". */
export function inStelsel(e: BeeldEenheden, v: number | null | undefined, bron: string, dec: number): string {
  return getalTekst(typeof v === "number" ? e.waarde(v, bron) : v, e.decimalen(dec, bron));
}

function VlakLagen({ pad, lagen, knoppen }: { pad: string; lagen: Laag[]; knoppen: ReactNode }) {
  const { t } = useTranslation("rapport");
  const e = useBeeldEenheden();
  const { regels, som } = useMemo(() => vlakOpbouw(lagen), [lagen]);
  return (
    <RijenTabel<Laag>
      pad={pad}
      rijen={lagen}
      kolommen={vlakKolommen(t, e)}
      nieuweRij={() => ({ naam: "", d: "", rho: "", p: "" })}
      toevoegen={t("opbouw.laagToevoegen")}
      knoppen={knoppen}
      extra={[{ kop: t("opbouw.berekend"), breedte: "6em", waarde: (_rij, i) => inStelsel(e, regels[i]?.p, "kN/m²", 2) }]}
      voet={
        <p className="rapport-som">
          <span>{t("opbouw.totaal")}</span>
          <strong>{inStelsel(e, som, "kN/m²", 2)} {e.eenheid("kN/m²")}</strong>
        </p>
      }
    />
  );
}

function GevelLagen({ pad, lagen, knoppen }: { pad: string; lagen: Gevellaag[]; knoppen: ReactNode }) {
  const { t } = useTranslation("rapport");
  const e = useBeeldEenheden();
  const { regels, som } = useMemo(() => gevelOpbouw(lagen), [lagen]);
  return (
    <RijenTabel<Gevellaag>
      pad={pad}
      rijen={lagen}
      kolommen={gevelKolommen(t, e)}
      nieuweRij={() => ({ naam: "", p: "", h: "", vulling: "" })}
      toevoegen={t("opbouw.laagToevoegen")}
      knoppen={knoppen}
      extra={[{ kop: `q [${e.eenheid("kN/m¹")}]`, breedte: "6em", waarde: (_rij, i) => inStelsel(e, regels[i]?.q, "kN/m¹", 2) }]}
      voet={
        <p className="rapport-som">
          <span>{t("opbouw.totaal")}</span>
          <strong>{inStelsel(e, som, "kN/m¹", 2)} {e.eenheid("kN/m¹")}</strong>
        </p>
      }
    />
  );
}

/**
 * "6 lagen · 0,43 kN/m²" onder de naam van een opbouw in het menu; bij één
 * laag met een toelichting komt die erachter (die toelichting komt uit de
 * bibliotheek en blijft Nederlands).
 */
export function opbouwTekst(o: Bibliotheekopbouw, t: TFunction<"rapport">, e: BeeldEenheden): string {
  const n = o.lagen.length;
  const toe = n === 1 && o.lagen[0].opmerking ? ` · ${o.lagen[0].opmerking}` : "";
  return `${t("opbouw.aantalLagen", { count: n })} · ${inStelsel(e, somVan(o), "kN/m²", 2)} ${e.eenheid("kN/m²")}${toe}`;
}

interface Menuregel {
  label: string;
  uittreksel: string;
  kies: () => void;
}

export interface Menugroep {
  naam: string;
  regels: Menuregel[];
}

/**
 * Knop met een keuzemenu, in de vorm van "Standaardtekst ▾" in TekstVeld. Een
 * keuze voert de actie uit en sluit het menu; een klik ernaast of Escape
 * sluit het ook.
 */
export function BibliotheekMenu({ knop, titel, groepen }: { knop: string; titel: string; groepen: Menugroep[] }) {
  const [open, setOpen] = useState(false);
  const ankerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const klik = (e: MouseEvent) => {
      if (!ankerRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const toets = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", klik);
    document.addEventListener("keydown", toets);
    return () => {
      document.removeEventListener("mousedown", klik);
      document.removeEventListener("keydown", toets);
    };
  }, [open]);

  return (
    <div className="rapport-menu-anker" ref={ankerRef}>
      <button
        type="button"
        className="rapport-knop"
        title={titel}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        {knop} ▾
      </button>
      {open && (
        <div className="rapport-menu" role="menu">
          {groepen.map((g) => (
            <Fragment key={g.naam}>
              <div className="rapport-menu-groep">{g.naam}</div>
              {g.regels.map((r) => (
                <button
                  key={r.label}
                  type="button"
                  role="menuitem"
                  className="rapport-menu-item"
                  title={`${r.label}: ${r.uittreksel}`}
                  onClick={() => {
                    r.kies();
                    setOpen(false);
                  }}
                >
                  <span className="rapport-menu-label">{r.label}</span>
                  <span className="rapport-menu-uittreksel">{r.uittreksel}</span>
                </button>
              ))}
            </Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
