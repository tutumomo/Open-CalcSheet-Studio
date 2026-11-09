import { useTranslation } from "react-i18next";
import { inTaal, type Meertalig } from "../../../rapport/meertalig";
import { ROLLEN } from "../../../rapport/model";
import type { Knoop } from "../../../rapport/opzet";
import { vindKnoop, HOOFDSTUKKEN_TW } from "./hulp";
import TekstVeld, { Invulvelden } from "./TekstVeld";
import { Kop, Sectie, Veld, Vink, useRapport } from "./velden";

/**
 * De hoofdstukken die alleen uit tekst bestaan (plus de rol in 2.2). Voor
 * Uitgangspunten, Belastingen en Berekeningen heeft het paneel een eigen
 * sectie.
 */
const HOOFDSTUKKEN = ["inleiding", "projectgegevens", "constructie"];

/**
 * Sectie Hoofdstukken 1 t/m 3: per tekstonderdeel uit de opzet een tekstvak
 * met standaardteksten, in de volgorde en met de koppen van het rapport.
 */
export default function HoofdstukTeksten() {
  const { t } = useTranslation("rapport");
  const rapport = useRapport();
  const hoofdstukken = rapport.opzetSoort === "tw" ? HOOFDSTUKKEN_TW : HOOFDSTUKKEN;
  return (
    <Sectie id="teksten" titel={t("secties.teksten")} intro={t("teksten.intro")}>
      {hoofdstukken.map((id) => {
        const knoop = vindKnoop(id);
        return knoop ? <KnoopInvoer key={id} knoop={knoop} /> : null;
      })}
      <Invulvelden />
    </Sectie>
  );
}

/** Eén knoop uit de opzet met zijn invoer; zonder eigen inhoud de kop met de kinderen eronder. */
function KnoopInvoer({ knoop }: { knoop: Knoop }) {
  const { t } = useTranslation("rapport");
  const klasse = `rapport-knoop rapport-niveau-${knoop.niveau}`;
  if (knoop.inhoud === "tekst") {
    return (
      <div className={klasse}>
        <TekstVeld
          id={knoop.id}
          kop={<Kop id={knoop.id} />}
          placeholder={knoop.optioneel ? t("teksten.optioneelLeeg") : undefined}
        />
        {knoop.titelNieuwbouw && <KopNieuwbouw knoop={knoop} titelNieuwbouw={knoop.titelNieuwbouw} />}
      </div>
    );
  }
  if (knoop.inhoud === "rol") {
    return (
      <div className={klasse}>
        <TekstVeld
          id={knoop.id}
          kop={<Kop id={knoop.id} />}
          hint={t("teksten.rolHint")}
        />
        <RolVelden />
      </div>
    );
  }
  return (
    <div className={klasse}>
      <Kop id={knoop.id} />
      {knoop.kinderen?.map((k) => <KnoopInvoer key={k.id} knoop={k} />)}
    </div>
  );
}

/**
 * De keuze of het blok Wijziging bij nieuwbouw Constructieprincipe heet
 * (rapport.opmaak.constructieprincipe). Een rapport van een eerdere versie
 * opent met de keuze uit, zodat zijn afdruk niet verandert.
 */
function KopNieuwbouw({ knoop, titelNieuwbouw }: { knoop: Knoop; titelNieuwbouw: Meertalig }) {
  const { t } = useTranslation("rapport");
  const rapport = useRapport();
  const aan = rapport.opmaak.constructieprincipe;
  // De koppen zelf komen uit de opzet, in de taal van het rapport, net als op papier.
  const bestaand = vindKnoop("bestaand");
  return (
    <Vink
      label={t("teksten.nieuwbouwKop", { titel: inTaal(titelNieuwbouw, rapport.taal) })}
      pad="opmaak.constructieprincipe"
      aan={aan}
      hint={t(aan ? "teksten.nieuwbouwAan" : "teksten.nieuwbouwUit", {
        titel: inTaal(knoop.titel, rapport.taal),
        bestaand: bestaand ? inTaal(bestaand.titel, rapport.taal) : "",
      })}
    />
  );
}

/** 2.2: rol, bouwkundig adviseur of architect, datum van de bouwkundige onderlegger. */
function RolVelden() {
  const { t } = useTranslation("rapport");
  const rapport = useRapport();
  const { rol } = rapport;
  return (
    <div className="rapport-rij">
      <Veld label={t("teksten.rol")} pad="rol.rol" waarde={rol.rol} lijst="rapport-rollen" />
      <Veld label={t("teksten.architect")} pad="rol.architect" waarde={rol.architect} />
      <Veld
        label={t("teksten.datumOnderlegger")}
        pad="rol.datumOnderlegger"
        waarde={rol.datumOnderlegger}
        placeholder={t("algemeen.datumVoorbeeld")}
      />
      <datalist id="rapport-rollen">
        {ROLLEN.map((r) => (
          <option key={r.en} value={inTaal(r, rapport.taal)} />
        ))}
      </datalist>
    </div>
  );
}
