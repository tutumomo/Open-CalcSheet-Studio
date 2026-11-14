import type { ReactNode } from "react";
import {
  belastingfactorTabel,
  beta,
  getal,
  inspectieniveau,
  klasse,
  levensduurklasse,
  normVoorBouwjaar,
  ontwerpSupervisie,
} from "../../../rapport/normwaarden";
import { KOLOMMEN, materialenRijen } from "../../../rapport/materialen";
import { kFiVoor, projectWaarde } from "../../../store/projectGegevens";
import type { RapportWeergave } from "./useRapportWeergave";
import { Bijschrift, Cel, Eenheid, Index, Leeg, Rij, Tekst } from "./raster";
import { bijschriftSleutel } from "../../../rapport/tw/nummering";

/*
 * Hoofdstuk 4, Uitgangspunten.
 *
 * De inhoud springt één kolom in (het vlak `rpa-in` eromheen), dus kolom 1
 * hier is kolom 2 van het vel. Kolommen en lijnen volgen de referentie-PDF.
 * Wat de gebruiker zelf invult staat in de invoerkleur; wat uit een tabel of
 * formule volgt in zwart.
 */

/** Label over drie kolommen, de waarde in de vierde, een lijn onder beide; rechts eventueel de norm. */
function Veld({ label, waarde, norm, invoer }: {
  label: ReactNode; waarde: ReactNode; norm?: string; invoer?: boolean;
}) {
  return (
    <Rij>
      <Cel k={1} n={3} o>{label}</Cel>
      <Cel k={4} o klasse={invoer ? "rpa-invoer" : undefined}>{waarde}</Cel>
      {norm && <Cel k={8} n={2} klasse="rpa-norm">{norm}</Cel>}
    </Rij>
  );
}

/**
 * 4.1 Constructieve uitgangspunten bouwwerk. CC, RC en de ontwerplevensduur
 * komen uit de projectgegevens; β, K_FI, supervisie en inspectie volgen daaruit.
 */
export function Bouwwerk({ w }: { w: RapportWeergave }) {
  const cc = klasse(w.gegevens.CC, 2);
  const rc = klasse(w.gegevens.RC, 2);
  const jaren = getal(projectWaarde(w.gegevens, "DesignLife"));
  const levensduur = Number.isFinite(jaren) ? jaren : 50;
  const { t, f } = w;
  const tabel = (nummer: string) => t("algemeen.tabel", { nummer });
  return (
    <>
      <Veld label={t("afdruk.bouwwerk.soort")} waarde={w.rapport.uitgangspunten.soortBouwwerk} invoer />
      <Veld label={t("afdruk.bouwwerk.gevolgklasse")} waarde={`CC${cc}`} invoer />
      <Veld label={t("afdruk.bouwwerk.betrouwbaarheidsklasse")} waarde={`RC${rc}`} />
      <Veld label={t("afdruk.bouwwerk.levensduurklasse")} waarde={String(levensduurklasse(levensduur))} />
      <Veld label={t("afdruk.bouwwerk.levensduur")} waarde={f(levensduur, 0)} norm={tabel("NB.1–2.1")} />
      <Veld label="β" waarde={f(beta(rc), 1)} norm={tabel("B2")} />
      <Veld label={<>K<sub>FI</sub></>} waarde={f(kFiVoor(cc), 2)} norm={tabel("B3")} />
      <Veld label={t("afdruk.bouwwerk.supervisie")} waarde={ontwerpSupervisie(rc)} norm={tabel("B4")} />
      <Veld label={t("afdruk.bouwwerk.inspectie")} waarde={inspectieniveau(rc)} norm={tabel("B5")} />
    </>
  );
}

/** 4.2 Bouwconstructies bij brand: drie eisen in minuten; "-" is geen eis. De verwijzing rechts naast de eerste. */
export function Brand({ w }: { w: RapportWeergave }) {
  const b = w.rapport.uitgangspunten.brand;
  const eisen: [string, string][] = [
    [w.t("afdruk.brand.hoofddraagconstructie"), b.hoofddraagconstructie],
    [w.t("afdruk.brand.brandscheiding"), b.brandscheiding],
    [w.t("afdruk.brand.vluchtroute"), b.vluchtroute],
  ];
  return (
    <>
      {eisen.map(([label, waarde], i) => (
        <Rij key={label}>
          <Cel k={1} n={4} o>{label}</Cel>
          <Cel k={5} o>{waarde.trim() || "-"}</Cel>
          <Cel k={6} o><Eenheid e="min" /></Cel>
          {i === 0 && b.verwijzing.trim() && <Cel k={8} n={2} klasse="rpa-norm">{b.verwijzing}</Cel>}
        </Rij>
      ))}
    </>
  );
}

/**
 * 4.3 Toegepaste materialen, met rechts ernaast de bevestigingsmiddelen (zonder
 * eigen kopregel) en onder de tabel de noot. Waar welke regel staat, en waarom
 * de bevestigingsmiddelen soms een paar regels lager staan dan in de
 * referentie, staat in rapport/materialen.ts; de kolommen komen ook daarvandaan.
 */
export function Materialen({ w }: { w: RapportWeergave }) {
  const u = w.rapport.uitgangspunten;
  const bijschrift = w.bijschriften.get(bijschriftSleutel.materialen);
  const { type, soort, opmerking, bevestigingType, bevestigingKwaliteit } = KOLOMMEN;
  return (
    <>
      <Bijschrift tekst={bijschrift} />
      <Rij houd>
        <Cel k={type[0]} n={type[1]} b o l klasse="rpa-kop-donker">{w.t("afdruk.materialen.type")}</Cel>
        <Cel k={soort[0]} n={soort[1]} b o l r klasse="rpa-kop-donker rpa-midden">{w.t("afdruk.materialen.soort")}</Cel>
      </Rij>
      {materialenRijen(u.materialen, u.bevestiging).map(({ materiaal: m, bevestiging: f, eersteBevestiging: eerste }, i) => (
        <Rij key={i}>
          {m && (
            <>
              <Cel k={type[0]} n={type[1]} o l>{m.type}</Cel>
              <Cel k={soort[0]} n={soort[1]} o l r klasse="rpa-midden">{m.soort}</Cel>
              {/* Naast de bevestigingsmiddelen blijft de opmerking binnen haar eigen kolommen. */}
              <Cel k={opmerking[0]} n={opmerking[1]} klasse={f ? "rpa-afbreken" : undefined}>{m.opmerking}</Cel>
            </>
          )}
          {f && (
            <>
              <Cel k={bevestigingType[0]} n={bevestigingType[1]} b={eerste} o l klasse="rpa-midden">{f.type}</Cel>
              <Cel k={bevestigingKwaliteit[0]} n={bevestigingKwaliteit[1]} b={eerste} o l r klasse="rpa-midden">
                {f.kwaliteit}
              </Cel>
            </>
          )}
        </Rij>
      ))}
      {u.materialenNoot.trim() && (
        <Rij>
          <Cel k={1} n={6}>{u.materialenNoot}</Cel>
        </Rij>
      )}
    </>
  );
}

/** 4.4 Conservering staalconstructie: onderdeel en systeem, en de slotzin met een lijn eronder. */
export function Conservering({ w }: { w: RapportWeergave }) {
  const u = w.rapport.uitgangspunten;
  return (
    <>
      {u.conservering.map((c, i) => (
        <Rij key={i}>
          <Cel k={1} n={2} o>{c.onderdeel}</Cel>
          <Cel k={3} n={3} o>{c.systeem}</Cel>
        </Rij>
      ))}
      {u.conserveringSlot.trim() && (
        <>
          <Leeg />
          <Rij>
            <Cel k={1} n={7} o>{u.conserveringSlot}</Cel>
          </Rij>
        </>
      )}
    </>
  );
}

/**
 * 4.5 Belastingfactoren en belastingcombinaties bij de gevolgklasse van het
 * project. Opeenvolgende regels "niet van toepassing" delen één vak, zonder
 * lijn ertussen, zoals in de referentie.
 */
export function Factoren({ w }: { w: RapportWeergave }) {
  const rijen = belastingfactorTabel(klasse(w.gegevens.CC, 2), w.taal);
  const { t } = w;
  return (
    <>
      <Bijschrift tekst={w.bijschriften.get(bijschriftSleutel.factoren)} />
      <Rij houd>
        <Cel k={1} b o l klasse="rpa-kop-donker">{t("afdruk.factoren.groep")}</Cel>
        <Cel k={2} n={2} b o klasse="rpa-kop-donker">{t("afdruk.factoren.naam")}</Cel>
        <Cel k={4} b o klasse="rpa-kop-donker rpa-midden">γ<sub>Gkj;inf</sub></Cel>
        <Cel k={5} b o klasse="rpa-kop-donker rpa-midden">γ<sub>Gkj;sup</sub></Cel>
        <Cel k={6} b o klasse="rpa-kop-donker rpa-midden">γ<sub>Q;1</sub></Cel>
        <Cel k={7} b o r klasse="rpa-kop-donker rpa-midden">γ<sub>Q;2</sub></Cel>
      </Rij>
      <Rij klasse="rpa-cursief" houd>
        <Cel k={1} n={3} o />
        <Cel k={4} o klasse="rpa-midden">{t("afdruk.factoren.gunstig")}</Cel>
        <Cel k={5} o klasse="rpa-midden">{t("afdruk.factoren.ongunstig")}</Cel>
        <Cel k={6} o klasse="rpa-midden">{t("afdruk.factoren.overheersend")}</Cel>
        <Cel k={7} o klasse="rpa-midden">{t("afdruk.factoren.overige")}</Cel>
      </Rij>
      {rijen.map((r, i) => {
        const volgendeNvt = rijen[i + 1]?.cellen === null;
        return (
          <Rij key={i}>
            <Cel k={1} o l>{r.groep}</Cel>
            <Cel k={2} n={2} o l klasse="rpa-tt">{r.naam}</Cel>
            {r.cellen ? (
              r.cellen.map((c, j) => (
                <Cel key={j} k={4 + j} o l r={j === 3} klasse="rpa-midden"><Index t={c} /></Cel>
              ))
            ) : (
              <Cel k={4} n={4} o={!volgendeNvt} l r>{t("afdruk.factoren.nietVanToepassing")}</Cel>
            )}
            {r.opmerking && <Cel k={8} n={2}>{r.opmerking}</Cel>}
          </Rij>
        );
      })}
    </>
  );
}

/** 4.6 Bestaande situatie: bouwjaar en bron, de norm die bij dat bouwjaar hoort, en wat er beschikbaar is. */
export function Bestaand({ w }: { w: RapportWeergave }) {
  const b = w.rapport.uitgangspunten.bestaand;
  const jaar = getal(b.bouwjaar);
  const norm = Number.isFinite(jaar) ? normVoorBouwjaar(jaar) : "";
  const { t } = w;
  // Ja en Nee zijn codes (het paneel zet ze); iets anders staat er zoals het is getypt.
  const jaNee = (v: string) => (v === "Ja" ? t("algemeen.ja") : v === "Nee" ? t("algemeen.nee") : v);
  return (
    <>
      <Rij>
        <Cel k={1} n={3} o>{t("afdruk.bestaand.bouwjaar")}</Cel>
        <Cel k={4} o klasse="rpa-invoer">{b.bouwjaar}</Cel>
        <Cel k={6} o>{t("afdruk.bestaand.bron")}</Cel>
        <Cel k={7} n={2} o klasse="rpa-invoer">{b.bron}</Cel>
      </Rij>
      <Rij>
        <Cel k={1} n={3} o>{t("afdruk.bestaand.norm")}</Cel>
        <Cel k={4} o>{norm}</Cel>
        <Cel k={7} n={2} o>{t("afdruk.bestaand.afgeleid")}</Cel>
      </Rij>
      <Rij>
        <Cel k={1} n={3} o>{t("afdruk.bestaand.berekening")}</Cel>
        <Cel k={4} o klasse="rpa-invoer">{jaNee(b.berekeningBeschikbaar)}</Cel>
      </Rij>
      <Rij>
        <Cel k={1} n={3} o>{t("afdruk.bestaand.materiaalgegevens")}</Cel>
        <Cel k={4} o klasse="rpa-invoer">{jaNee(b.materiaalgegevensBeschikbaar)}</Cel>
      </Rij>
    </>
  );
}

/** 4.8 Vervormingen en horizontale verplaatsingen: de inleidende zin, dan de eisen per onderdeel. */
export function Vervormingen({ w }: { w: RapportWeergave }) {
  const inleiding = w.rapport.teksten.vervormingen ?? "";
  return (
    <>
      {inleiding.trim() && (
        <>
          <Tekst tekst={inleiding} invul={w.invul} subkoppen={w.rapport.opmaak.subkoppen} />
          <Leeg />
        </>
      )}
      <Rij houd>
        <Cel k={1} n={3} b o l klasse="rpa-kop-licht">{w.t("afdruk.vervormingen.onderdeel")}</Cel>
        {/* Leeg, zoals in de referentie. */}
        <Cel k={4} b o klasse="rpa-kop-licht" />
        <Cel k={5} b o klasse="rpa-kop-licht"><Index t="u_bij" /></Cel>
        <Cel k={6} b o r klasse="rpa-kop-licht"><Index t="u_hor" /></Cel>
      </Rij>
      {w.rapport.uitgangspunten.vervormingen.map((r, i) => (
        <Rij key={i}>
          <Cel k={1} n={3} o>{r.onderdeel}</Cel>
          <Cel k={4} o><Index t={w.n(r.ueind)} /></Cel>
          <Cel k={5} o><Index t={w.n(r.ubij)} /></Cel>
          <Cel k={6} o><Index t={w.n(r.uhor)} /></Cel>
        </Rij>
      ))}
    </>
  );
}
