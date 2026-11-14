import { Fragment, type CSSProperties } from "react";
import { huisstijlVariabelen, type BureauProfiel } from "../../../rapport/model";
import { inTaal } from "../../../rapport/meertalig";
import { AfdrukTaal } from "../../calc/afdrukTaal";
import { PrintBlad } from "../../calc/PrintBlad";
import { MATEN } from "../../calc/paginering";
import { BIJLAGE_A, bijlageAnker, bijlageBladAnker } from "../../../rapport/opzet";
import { useRapportWeergave, type RapportBlad } from "./useRapportWeergave";
import { hoofdstukStukken, type Stuk } from "./Knopen";
import Voorblad from "./Voorblad";
import Situatie from "./Situatie";
import Inhoud from "./Inhoud";
import "./RapportAfdruk.css";

/** Stukken in secties: een stuk met `nieuwePagina` begint een nieuwe sectie, en daarmee een nieuw vel. */
function groepeer(stukken: Stuk[]): Stuk[][] {
  const secties: Stuk[][] = [];
  for (const s of stukken) {
    if (s.nieuwePagina || secties.length === 0) secties.push([s]);
    else secties[secties.length - 1].push(s);
  }
  return secties;
}

/**
 * De voet voor de echte afdruk: de voetafbeelding van het bureau over de
 * volle breedte in de ondermarge, of zonder afbeelding een dunne lijn met de
 * bureaunaam. Een vast element herhaalt de browser op elke afgedrukte pagina;
 * op het scherm is hij onzichtbaar (het afdrukvoorbeeld tekent zijn eigen
 * voet per vel).
 */
function Voet({ bureau, tekst }: { bureau: BureauProfiel; tekst: string }) {
  return (
    <div className="rpa-voet" aria-hidden="true">
      {bureau.voetafbeelding ? (
        <img className="rpa-voet-beeld" src={bureau.voetafbeelding} alt="" />
      ) : (
        <div className="rpa-voet-lijn">{tekst || bureau.naam}</div>
      )}
    </div>
  );
}

/**
 * De kopregel boven elke pagina (`tw.kopvoet.kop`). Net als de voet een vast
 * element, dat de browser op elke afgedrukte pagina herhaalt; het
 * afdrukvoorbeeld tekent hem per vel zelf.
 */
function Kop({ tekst }: { tekst: string }) {
  if (tekst === "") return null;
  return (
    <div className="rpa-kop" aria-hidden="true">
      <span className="rpa-kop-tekst">{tekst}</span>
    </div>
  );
}

/** Een blad in bijlage A, met zijn bijlagenummer. */
type BijlageBlad = RapportBlad & { nummer: string };

/**
 * Het volledige constructierapport: voorblad, situatie (als die er is), inhoud, de hoofdstukken en
 * bijlage A. Elke `section` begint op een nieuw vel — in het afdrukvoorbeeld
 * omdat de verdeling dat zo doet, bij het printen via `break-before`. Alles staat in de
 * taal van het rapport, ook de beelden en de kop van een blad (AfdrukTaal).
 */
export default function RapportAfdruk() {
  const w = useRapportWeergave();
  const secties = groepeer(hoofdstukStukken(w));

  // Bijlage A: de bladen waarvan de uitwerking niet in het hoofdstuk zelf
  // staat, in de volgorde en met de nummers van hoofdstuk Berekeningen.
  const berekeningen = w.knopen.find((k) => k.id === "berekeningen");
  const inBijlage = (berekeningen?.kinderen ?? []).flatMap((k): BijlageBlad[] => {
    const blad = k.blad;
    if (!blad || !blad.bijlage) return [];
    const b = w.bladen.find((x) => x.ex.id === blad.id);
    return b ? [{ ...b, nummer: blad.bijlage }] : [];
  });
  const titelA = w.bijlagen.find((b) => b.letter === "A")?.titel ?? inTaal(BIJLAGE_A, w.taal);

  return (
    <AfdrukTaal taal={w.taal}>
    <div className="rpa-wortel" style={huisstijlVariabelen(w.bureau.huisstijl) as CSSProperties}>
      <Kop tekst={w.kopvoet.kop} />
      <Voet bureau={w.bureau} tekst={w.kopvoet.voet} />
      <Voorblad w={w} />
      <Situatie w={w} />
      <Inhoud w={w} />
      {secties.map((stukken) => (
        <section key={stukken[0].sleutel} className="rpa-sectie">
          {stukken.map((s) => (
            <Fragment key={s.sleutel}>{s.inhoud}</Fragment>
          ))}
        </section>
      ))}
      {inBijlage.length > 0 && (
        <section className="rpa-sectie rpa-bijlagekop">
          <h1 className="rpa-h1" data-inhoud={bijlageAnker("A")}>{w.t("afdruk.bijlageKop", { letter: "A", titel: titelA })}</h1>
        </section>
      )}
      {/* De kop (A.x) noemt naam en grondslag al; de titelkop van de uitwerking zou die herhalen.
          Een aangemelde soort tekent hier zijn eigen onderdeel, op de vellen van het rapport. */}
      {inBijlage.map((b) => (
        <PrintBlad key={b.ex.id} ex={b.ex} html={b.html} nummer={b.nummer} resultaat={b.resultaat} titelInKop
          maten={MATEN.rapport} anker={bijlageBladAnker(b.ex.id)} eenheden={b.eenheden} />
      ))}
    </div>
    </AfdrukTaal>
  );
}
