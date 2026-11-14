import type { ReactNode } from "react";
import type { RevisieStatus } from "../../../rapport/model";
import { eersteDatum, rapportStatus } from "../../../rapport/revisies";
import { heeftHandtekening, STANDAARD_TW } from "../../../rapport/tw/blok";
import type { RapportWeergave } from "./useRapportWeergave";
import { Cel, Leeg, Rij, Vlak } from "./raster";

/*
 * Het voorblad, regel voor regel op de plaatsen van de referentie: titel en
 * projectnaam bovenaan, daaronder het project en de opdrachtgever, en in de
 * onderste helft de documentgegevens met lijnen eronder.
 */

/** Een regel documentgegevens: label in de accentkleur, de waarde, een lijn onder beide. */
function Gegeven({ label, waarde, ingesprongen }: { label: ReactNode; waarde?: string; ingesprongen?: boolean }) {
  return (
    <Rij>
      <Cel k={ingesprongen ? 4 : 3} n={ingesprongen ? 2 : 3} o klasse="rpa-label">{label}</Cel>
      <Cel k={6} n={2} o>{waarde}</Cel>
    </Rij>
  );
}

/** De status is een code ("ter goedkeuring"); op papier in de taal van het rapport, met een hoofdletter. */
const STATUS_SLEUTEL: Record<RevisieStatus, string> = {
  concept: "revisies.statussen.concept",
  "ter goedkeuring": "revisies.statussen.terGoedkeuring",
  definitief: "revisies.statussen.definitief",
};

function statusTekst(status: RevisieStatus | "", t: RapportWeergave["t"]): string {
  if (!status) return "";
  const s = t(STATUS_SLEUTEL[status]);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Het blok van de ondertekenende ingenieur onderaan het voorblad (Taiwan).
 * Zonder naam, nummer of ondertekend beeld blijft het weg, zodat een rapport
 * dat het blok niet gebruikt er precies zo uitziet als voorheen.
 */
function Handtekening({ w }: { w: RapportWeergave }) {
  const { rapport, t } = w;
  const h = (rapport.tw ?? STANDAARD_TW).handtekening;
  if (!heeftHandtekening(h)) return null;
  const datum = h.datum.trim() || eersteDatum(rapport.revisies);
  const regels: { label: string; waarde: string }[] = [
    { label: t("afdruk.handtekening.vakgebied"), waarde: h.vakgebied },
    { label: t("afdruk.handtekening.nummer"), waarde: h.nummer },
    { label: t("afdruk.handtekening.instantie"), waarde: h.instantie },
    { label: t("afdruk.handtekening.datum"), waarde: datum },
  ].filter((r) => r.waarde.trim() !== "");
  return (
    <>
      <Leeg n={2} />
      <Rij>
        <Cel k={1} n={8} klasse="rpa-hk-kop">{t("afdruk.handtekening.titel")}</Cel>
      </Rij>
      <Rij>
        <Cel k={1} n={3} o klasse="rpa-label">{t("afdruk.handtekening.naam")}</Cel>
        <Cel k={4} n={5} o klasse="rpa-hk-naam">{h.naam || h.bureau}</Cel>
      </Rij>
      {h.bureau && h.naam && (
        <Rij>
          <Cel k={1} n={3} o klasse="rpa-label">{t("afdruk.handtekening.bureau")}</Cel>
          <Cel k={4} n={5} o>{h.bureau}</Cel>
        </Rij>
      )}
      {regels.map((r) => (
        <Rij key={r.label}>
          <Cel k={1} n={3} o klasse="rpa-label">{r.label}</Cel>
          <Cel k={4} n={5} o>{r.waarde}</Cel>
        </Rij>
      ))}
      {h.beeld && (
        <Rij>
          <Cel k={1} n={8}>
            <img className="rpa-hk-beeld" src={h.beeld} alt="" />
          </Cel>
        </Rij>
      )}
    </>
  );
}

export default function Voorblad({ w }: { w: RapportWeergave }) {
  const { rapport, bureau, invul, t } = w;
  const project = [invul.projectnummer, invul.projectnaam].filter(Boolean).join(" - ");
  const adres = rapport.opdrachtgeverAdres
    .split("\n")
    .map((r) => r.trim())
    .filter(Boolean);
  // Minstens vier regels, zodat de documentgegevens op hun vaste plaats blijven
  // staan, ook bij een opdrachtgever zonder adres.
  const opdracht = [invul.opdrachtgever, ...adres];
  while (opdracht.length < 4) opdracht.push("");
  const later = rapport.revisies.slice(1);

  return (
    <section className="rpa-sectie rpa-voorblad">
      <Vlak>
        <h1 className="rpa-vb-titel">
          {rapport.titel}
          {bureau.logo && <img className="rpa-vb-logo" src={bureau.logo} alt="" />}
        </h1>
        <p className="rpa-vb-ondertitel">{invul.projectnaam}</p>
        <Leeg n={11} />
        <Rij>
          <Cel k={3} n={3} klasse="rpa-vet">{t("afdruk.voorblad.project")}</Cel>
          <Cel k={6} n={5}>{project}</Cel>
        </Rij>
        <Leeg />
        {opdracht.map((regel, i) => (
          <Rij key={i}>
            {i === 0 && <Cel k={3} n={3} klasse="rpa-vet">{t("afdruk.voorblad.inOpdrachtVan")}</Cel>}
            <Cel k={6} n={5}>{regel}</Cel>
          </Rij>
        ))}
        <Leeg n={3} />
        <Gegeven label={t("afdruk.voorblad.adviseur")} waarde={bureau.naam} />
        <Gegeven label={t("afdruk.voorblad.verantwoordelijk")} waarde={rapport.verantwoordelijk} />
        <Gegeven label={t("afdruk.voorblad.uitvoerend")} waarde={rapport.uitvoerend} />
        <Gegeven label={t("afdruk.voorblad.normen")} waarde={rapport.normen} />
        <Gegeven label={t("afdruk.voorblad.documentgegevens")} />
        <Gegeven
          label={<>{t("afdruk.voorblad.eersteDatumVoor")}<sup>{t("afdruk.voorblad.eersteDatumSup")}</sup> {t("afdruk.voorblad.eersteDatumNa")}</>}
          waarde={eersteDatum(rapport.revisies)}
        />
        {later.length === 0 ? (
          <Gegeven label={t("afdruk.voorblad.datumWijz")} ingesprongen />
        ) : (
          later.map((r, i) => (
            <Gegeven key={i} label={`${t("afdruk.voorblad.datumWijz")} ${r.code}`} waarde={r.datum} ingesprongen />
          ))
        )}
        <Leeg n={2} />
        <Gegeven label={t("afdruk.voorblad.fase")} waarde={rapport.fase ? t(`afdruk.fasen.${rapport.fase}`) : ""} />
        <Gegeven label={t("afdruk.voorblad.status")} waarde={statusTekst(rapportStatus(rapport.revisies), t)} />
        <Gegeven label={t("afdruk.voorblad.kenmerk")} waarde={rapport.kenmerk} />
        <Handtekening w={w} />
      </Vlak>
    </section>
  );
}
