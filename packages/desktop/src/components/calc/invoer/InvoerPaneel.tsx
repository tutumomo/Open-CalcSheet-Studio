import { memo, useEffect, useId, useRef, useState, type ComponentType } from "react";
import { useTranslation } from "react-i18next";
import { eenheidInBeeld } from "@ifc-calc/core";
import ThemedSelect from "../../ThemedSelect";
import { Kop, UitkomstKop } from "../designerKit";
import { useActiefExemplaar, useProjectScope } from "../../../store/actiefBlad";
import type { Exemplaar } from "../../../store/projectStore";
import { useDoorrekening } from "../../../rekenen/doorrekening";
import { inBeeld, leesGetypt, naamDelen, pauzeVoor, platTekst, type BladInvoer, type PaneelVeld, type TekstDeel } from "./velden";
import { useInvoerWachtrij } from "./useInvoerWachtrij";
import type { InvoerWachtrij } from "./wachtrij";
import "../../ThemedSelect.css";
import "../VoetplaatDesigner.css";
import "./InvoerPaneel.css";

/**
 * Het invoerscherm van een rekenblad zonder eigen parametrisch beeld: alle invoervelden
 * die het blad nu toont als formulier, onder de koppen van het blad. Zo heeft elk blad en
 * elke module, ook uit de modulebibliotheek, een plek voor "gewoon getallen" naast de
 * uitwerking.
 *
 * De velden komen uit dezelfde doorrekening als de uitwerking (rekenen/doorrekening.ts,
 * invoer/velden.ts). Wat je typt gaat pas naar het blad als je het veld verlaat, op Enter
 * drukt of even wacht (wachtrij.ts): een blad dat Open FEM Studio laat rekenen, rekent
 * dan niet bij elke toetsaanslag. De kop toont of er gerekend wordt, en anders de
 * uitkomst van het blad.
 *
 * Een module kan er een beeld boven krijgen dat de invoer volgt (`Beeld`, zie
 * invoerScherm.tsx). Dat beeld leest ook wat er nog wacht, en beweegt dus meteen mee.
 */

/** Wat een beeld boven het formulier krijgt. */
export interface BeeldProps {
  /** De rekentekst van het blad: daaruit de eenheden en standaardwaarden van de velden. */
  source: string;
  /** Wat er voor een veld is ingevuld, in de eenheid van het blad; wat nog wacht, gaat voor wat is opgeslagen. */
  lees: (naam: string) => string | undefined;
  /** Zet een waarde meteen in het blad: een maat die in de tekening is gewijzigd. */
  zet: (naam: string, waarde: string) => void;
}

/**
 * Vanaf deze paneelbreedte staat het beeld naast het formulier in plaats van erboven: op
 * een scherm van 1920 breed is het paneel ongeveer 840. Het venster waarmee de app opent
 * (1280 × 800, paneel 518) houdt het beeld boven het formulier.
 */
const BREED_PANEEL = 780;

/**
 * De hoogte van het beeld boven het formulier: de helft van wat er onder de kop en boven de
 * voetregel is, met een onder- en bovengrens. Niet hoger dan de breedte benut: twee
 * tekeningen naast elkaar worden in een smal paneel niet groter van meer hoogte. In px en
 * niet in procenten: het vak van de tekeningen wordt opgemeten, en een hoogte die van de
 * inhoud afhangt zou dan meebewegen.
 */
function beeldHoogte(paneel: { b: number; h: number }): number {
  const hoogstens = Math.min(340, paneel.b / 2 + 8);
  return Math.round(Math.min(hoogstens, Math.max(200, (paneel.h - 80) * 0.5)));
}

function Naam({ naam }: { naam: string }) {
  const { basis, index } = naamDelen(naam);
  return (
    <span className="ip-symbool">
      {basis}
      {index && <sub>{index}</sub>}
    </span>
  );
}

function Tekst({ delen }: { delen: readonly TekstDeel[] }) {
  return (
    <>
      {delen.map((d, i) =>
        d.stand === "sub" ? <sub key={i}>{d.tekst}</sub> : d.stand === "sup" ? <sup key={i}>{d.tekst}</sup> : <span key={i}>{d.tekst}</span>,
      )}
    </>
  );
}

/** Een `?`-veld: naam, toelichting, het getal en de eenheid. */
const GetalVeld = memo(function GetalVeld({ veld, opgeslagen, rij }: { veld: PaneelVeld; opgeslagen: string | undefined; rij: InvoerWachtrij }) {
  const id = useId();
  // Wat er staat zolang niemand typt. Tijdens het typen blijft staan wat er getypt is:
  // teruggerekend en weer omgezet zou "12," halverwege "12" worden.
  const rust = inBeeld(veld, opgeslagen);
  const [tekst, setTekst] = useState<string | null>(null);
  const [fout, setFout] = useState<string | null>(null);
  const wijzig = (nieuw: string) => {
    setTekst(nieuw);
    // Terug naar wat er stond: de opgeslagen waarde houden. Anders wordt 4500 mm in een
    // veld in inch na één keer typen 4499,99.
    if (nieuw.trim() === rust.trim()) {
      setFout(null);
      rij.vergeet(veld.naam);
      return;
    }
    const terug = leesGetypt(veld, nieuw);
    if ("fout" in terug) {
      setFout(terug.fout);
      rij.houdTegen(veld.naam);
    } else {
      setFout(null);
      rij.typ(veld.naam, terug.waarde);
    }
  };
  const toelichting = platTekst(veld.label);
  return (
    <div className="ip-rij">
      <label className="ip-naam" htmlFor={id} title={veld.toonNaam}>
        <Naam naam={veld.toonNaam} />
      </label>
      <span className="ip-label" title={toelichting || undefined}>
        <Tekst delen={veld.label} />
      </span>
      <input
        id={id}
        className={fout ? "ip-veld ip-fout" : "ip-veld"}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        value={tekst ?? rust}
        placeholder={veld.standaard}
        title={fout ?? undefined}
        aria-invalid={fout ? true : undefined}
        onFocus={() => setTekst(rust)}
        onChange={(e) => wijzig(e.target.value)}
        onBlur={() => {
          rij.verlaat(veld.naam);
          setTekst(null);
          setFout(null);
        }}
        onKeyDown={(e) => {
          // Enter stuurt meteen. Ctrl+S ook: opslaan hoort te bewaren wat er staat, niet wat
          // er stond vóór de pauze om was (de sneltoets zelf handelt useSneltoetsen af).
          if (e.key === "Enter" || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s")) rij.verlaat(veld.naam);
          if (e.key === "Escape") {
            rij.vergeet(veld.naam);
            setTekst(rust);
            setFout(null);
          }
        }}
      />
      <span className="ip-eenheid">{eenheidInBeeld(veld.toonEenheid)}</span>
    </div>
  );
});

/** Een keuzelijst: het label van het blad en de keuzes. Een keuze gaat meteen naar het blad. */
const KeuzeVeld = memo(function KeuzeVeld({ veld, opgeslagen, rij }: { veld: PaneelVeld; opgeslagen: string | undefined; rij: InvoerWachtrij }) {
  return (
    <div className="ip-rij ip-keuze">
      <span className="ip-label" title={veld.toonNaam}>
        <Tekst delen={veld.label} />
      </span>
      <ThemedSelect
        value={opgeslagen ?? veld.standaard}
        options={veld.keuzes.map((k) => ({ value: k.waarde, label: k.tekst }))}
        onChange={(waarde) => rij.zetNu(veld.naam, waarde)}
      />
    </div>
  );
});

function Paneel({ exemplaar, Beeld }: { exemplaar: Exemplaar; Beeld?: ComponentType<BeeldProps> }) {
  const { t } = useTranslation("beelden");
  const scope = useProjectScope();
  const { doorrekening, bezig } = useDoorrekening(exemplaar.id, exemplaar.source, exemplaar.waarden, scope, exemplaar.naam);
  const rij = useInvoerWachtrij(exemplaar.id, pauzeVoor(exemplaar.source));
  const [toonBeeld, setToonBeeld] = useState(true);

  // De velden van de laatste doorrekening die ze had: een fout in de rekentekst, halverwege
  // het typen in de editor ernaast, laat het formulier staan.
  const laatste = useRef<BladInvoer | null>(null);
  if (doorrekening?.invoer) laatste.current = doorrekening.invoer;
  const invoer = laatste.current;

  // De maat van het hele paneel bepaalt de indeling: het beeld boven of naast het formulier.
  const paneelRef = useRef<HTMLDivElement>(null);
  const [maat, setMaat] = useState({ b: 518, h: 540 });
  const breed = maat.b >= BREED_PANEEL;
  useEffect(() => {
    const el = paneelRef.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const r = entries[0].contentRect;
      setMaat({ b: Math.round(r.width), h: Math.round(r.height) });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Wat er te melden is, in volgorde: er wacht invoer, Open FEM Studio rekent, het blad rekent.
  // Zolang er gerekend wordt, zegt de vorige uitkomst nog of FEM Studio bezig was.
  const titel = doorrekening?.uitkomst?.resultaat.titel || exemplaar.naam;
  const status = rij.aantal > 0 ? t("invoer.wacht") : invoer?.wachtOpFem ? t("invoer.fem") : bezig ? t("invoer.rekent") : null;
  const rekent = rij.aantal === 0 && (bezig || !!invoer?.wachtOpFem);

  const lees = (naam: string) => rij.wacht(naam) ?? exemplaar.waarden[naam];
  const metBeeld = !!Beeld && toonBeeld;

  return (
    <div ref={paneelRef} className={`vd-panel ip-paneel${breed ? " ip-breed" : ""}`}>
      {status ? <Kop titel={titel} badge={status} staat="info" /> : <UitkomstKop titel={titel} uitkomst={doorrekening?.uitkomst ?? null} />}
      <div className={rekent ? "ip-voortgang ip-loopt" : "ip-voortgang"} />

      <div className="ip-inhoud">
        {Beeld && metBeeld && (
          <div className="ip-beeld" style={breed ? undefined : { flexBasis: beeldHoogte(maat) }}>
            <Beeld source={exemplaar.source} lees={lees} zet={(naam, waarde) => rij.zetNu(naam, waarde)} />
          </div>
        )}
        <div className="ip-formulier">
          {!invoer ? (
            <p className="ip-leeg">{t("invoer.eerst")}</p>
          ) : invoer.groepen.length === 0 ? (
            <p className="ip-leeg">{t("invoer.geenVelden")}</p>
          ) : (
            <div className="ip-groepen">
              {invoer.groepen.map((groep, i) => (
                <section key={`${i}-${groep.kop}`} className="ip-groep">
                  {groep.kop && <div className="vd-ctrl-h">{groep.kop}</div>}
                  {groep.velden.map((veld) =>
                    veld.soort === "keuze" ? (
                      <KeuzeVeld key={veld.naam} veld={veld} opgeslagen={exemplaar.waarden[veld.naam]} rij={rij} />
                    ) : (
                      <GetalVeld key={veld.naam} veld={veld} opgeslagen={exemplaar.waarden[veld.naam]} rij={rij} />
                    ),
                  )}
                </section>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="vd-foot ip-voet">
        <span title={t("invoer.uitleg")}>{t("invoer.uitleg")}</span>
        {Beeld && (
          <button type="button" className="settings-btn settings-btn-secondary" onClick={() => setToonBeeld((aan) => !aan)}>
            {toonBeeld ? t("invoer.verbergBeeld") : t("invoer.toonBeeld")}
          </button>
        )}
      </div>
    </div>
  );
}

export default function InvoerPaneel({ Beeld }: { Beeld?: ComponentType<BeeldProps> }) {
  const exemplaar = useActiefExemplaar();
  if (!exemplaar) return null;
  // Per blad een eigen paneel: wat er nog wacht, gaat bij het wisselen naar het blad waar
  // het bij hoort, en een half getypt getal verhuist niet mee naar het volgende blad.
  return <Paneel key={exemplaar.id} exemplaar={exemplaar} Beeld={Beeld} />;
}
