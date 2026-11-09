import { useTranslation } from "react-i18next";
import { LANGUAGES } from "../../../i18n/config";
import { inTaal } from "../../../rapport/meertalig";
import { FASEN, TITELS } from "../../../rapport/model";
import { useBureauStore } from "../../../store/bureauProfiel";
import { useProjectStore } from "../../../store/projectStore";
import { leesPunt } from "../../../kaart/punt";
import { situatieActueel, stelselSleutel } from "../../../rapport/situatie";
import { Afgeleid, Keuze, Sectie, TekstVak, Veld, useRapport, type Optie } from "./velden";

/**
 * Sectie Document: wat op het voorblad staat en niet al in de
 * projectgegevens zit.
 */
export default function DocumentSectie() {
  const { t } = useTranslation("rapport");
  const rapport = useRapport();
  const gegevens = useProjectStore((s) => s.gegevens);
  const profiel = useBureauStore((s) => s.profiel);
  const werkBij = useProjectStore((s) => s.werkRapportBij);
  const situatie = rapport.situatie;
  const projectPunt = leesPunt(gegevens.locatie_punt);
  const verouderd = situatieActueel(situatie, projectPunt, rapport.taal, stelselSleutel(gegevens)) === "verouderd";

  // Zelfde bureau als op papier: het vastgelegde, of zolang dat leeg is het profiel.
  const bureau = rapport.bureau.naam ? rapport.bureau : profiel;
  const namen = bureau.constructeurs.map((c) => c.naam.trim()).filter((n) => n !== "");
  // Opgeslagen wordt de code (SO, VO, …); alleen de naam erachter volgt de taal.
  const faseOpties: Optie[] = [
    { waarde: "", label: t("document.faseNietVermelden") },
    ...FASEN.map((f) => ({ waarde: f, label: `${f} — ${t(`document.fasen.${f}`)}` })),
  ];
  // Elke taal in haar eigen naam, zoals in de instellingen.
  const taalOpties: Optie[] = LANGUAGES.filter((l) => l.code !== "auto").map((l) => ({ waarde: l.code, label: l.name }));
  const constructeurs: Optie[] = [
    { waarde: "", label: "—" },
    ...namen.map((n) => ({ waarde: n, label: n })),
  ];

  return (
    <Sectie
      id="document"
      titel={t("secties.document")}
      intro={t("document.intro")}
    >
      <Keuze label={t("document.taal")} pad="taal" waarde={rapport.taal} opties={taalOpties} hint={t("document.taalHint")} />
      <Keuze
        label={t("document.opzetSoort")}
        pad="opzetSoort"
        waarde={rapport.opzetSoort ?? "eurocode"}
        opties={[
          { waarde: "tw", label: t("document.opzetSoortOpties.tw") },
          { waarde: "eurocode", label: t("document.opzetSoortOpties.eurocode") },
        ]}
        hint={t("document.opzetSoortHint")}
      />
      <Veld
        label={t("document.titel")}
        pad="titel"
        waarde={rapport.titel}
        lijst="rapport-titels"
        hint={t("document.titelHint")}
      />
      <datalist id="rapport-titels">
        {/* Suggesties: de titel komt zo in het rapport, dus in de taal van het rapport. */}
        {TITELS.map((titel) => (
          <option key={titel.en} value={inTaal(titel, rapport.taal)} />
        ))}
      </datalist>
      <div className="rapport-rij">
        <Veld
          label={t("document.kenmerk")}
          pad="kenmerk"
          waarde={rapport.kenmerk}
          placeholder={t("document.kenmerkVoorbeeld")}
        />
        <Keuze label={t("document.fase")} pad="fase" waarde={rapport.fase} opties={faseOpties} />
      </div>
      <Veld label={t("document.normen")} pad="normen" waarde={rapport.normen} />
      <div className="rapport-rij">
        <Keuze
          label={t("document.verantwoordelijk")}
          pad="verantwoordelijk"
          waarde={rapport.verantwoordelijk}
          opties={constructeurs}
        />
        <Keuze
          label={t("document.uitvoerend")}
          pad="uitvoerend"
          waarde={rapport.uitvoerend}
          opties={constructeurs}
        />
      </div>
      {namen.length === 0 && (
        <p className="rapport-hint">{t("document.geenConstructeurs")}</p>
      )}
      <label className="rapport-veld">
        <span className="rapport-label">{t("document.adresregels")}</span>
        <TekstVak
          pad="opdrachtgeverAdres"
          waarde={rapport.opdrachtgeverAdres}
          placeholder={t("document.adresVoorbeeld")}
        />
        <span className="rapport-hint">{t("document.adresHint")}</span>
      </label>
      {situatie && (
        <div className="rapport-veld">
          <label className="rapport-vink rapport-vink-sterk">
            <input
              type="checkbox"
              checked={situatie.tonen}
              onChange={(e) => werkBij((r) => (r.situatie ? { ...r, situatie: { ...r.situatie, tonen: e.target.checked } } : r))}
            />
            {t("velden.situatieTonen")}
          </label>
          <span className="rapport-hint">{t("velden.situatieHint")}</span>
          <div className="rapport-situatie-beelden">
            {situatie.kaarten.map((k) => (
              <img
                key={k.id}
                src={`data:image/jpeg;base64,${k.jpeg}`}
                alt={t("velden.situatieBeeld", { naam: t(`afdruk.situatie.kaarten.${k.id}`) })}
              />
            ))}
          </div>
          {!projectPunt && <span className="rapport-hint">{t("velden.situatieGeenLocatie")}</span>}
          {verouderd && <span className="rapport-hint">{t("velden.situatieVerouderd")}</span>}
        </div>
      )}
      <Afgeleid
        uitProjectgegevens
        regels={[
          { label: t("document.projectnummer"), waarde: gegevens.project_nummer || "—" },
          { label: t("document.projectnaam"), waarde: gegevens.project_naam || "—" },
          { label: t("document.opdrachtgever"), waarde: gegevens.opdrachtgever || "—" },
          { label: t("document.locatie"), waarde: gegevens.locatie || "—" },
        ]}
      />
    </Sectie>
  );
}
