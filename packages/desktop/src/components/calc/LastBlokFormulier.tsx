import { useEffect, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import type { Belastingbron } from "../../rapport/belastingBronnen";
import { fmt } from "../../rapport/normwaarden";
import { leesLast, schrijfLast, type LastBlok, type LastRegel } from "../../store/lastBlok";
import "./LastBlokFormulier.css";

/*
 * Een lastblok (`@last`) op het canvas als formulier, in de opmaak van de tabel die het
 * blok op het blad wordt: een gekleurde kop met het symbool en de kolommen b, l, p_rep, G
 * en Q, en per regel een rij met cellen die je invult zoals in een rekenblad. Het formulier
 * schrijft gewone rekentekst; het blok rekent en tekent de rekenkern (lastBlok.ts in de kern).
 *
 * Een regel kiest zijn belasting uit de lijst van hoofdstuk 5 (rapport/belastingBronnen.ts)
 * of is een eigen waarde met een eigen omschrijving. Wijzigt de opbouw in hoofdstuk 5, dan
 * rekent het blok mee.
 */

const EIGEN = "\u0000eigen";

/** Een nieuw, leeg lastblok met een symbool dat nog vrij is. */
export function nieuwLastBlok(bezet: ReadonlySet<string>): string {
  let n = 1;
  while (bezet.has(`q_${n}`)) n++;
  return schrijfLast({ symbool: `q_${n}`, naam: "", soort: "lijn", regels: [{ soort: "G", bron: "", factoren: [] }] });
}

/** De twee maten van een regel zoals ze in de cellen staan: b is de eerste factor, l de rest. */
interface Maten { b: string; l: string }
const matenVan = (r: LastRegel): Maten => ({ b: r.factoren[0] ?? "", l: r.factoren.slice(1).join("; ") });
const factorenVan = (m: Maten): string[] => [m.b, ...m.l.split(";")].map((f) => f.trim());

export default function LastBlokFormulier({ tekst, bronnen, uitkomst, onWijzig, onKlaar, onVerwijder, onAlsTekst }: {
  tekst: string;
  /** De belastingen uit hoofdstuk 5 van het rapport. */
  bronnen: readonly Belastingbron[];
  /** Het doorgerekende blok, zoals het straks op het blad staat. */
  uitkomst?: ReactNode;
  onWijzig: (tekst: string) => void;
  onKlaar: () => void;
  onVerwijder: () => void;
  /** Verder als gewone rekentekst, voor wat het formulier niet kan. */
  onAlsTekst: () => void;
}) {
  const { t, i18n } = useTranslation("werkruimte");
  const blok = leesLast(tekst);
  const eerste = useRef<HTMLInputElement>(null);
  useEffect(() => eerste.current?.focus(), []);
  // De cellen b en l houden hun eigen tekst: het blad krijgt alleen de gevulde factoren, en
  // een l zonder b zou anders bij het teruglezen naar de cel van b verspringen.
  const [maten, zetMaten] = useState<Maten[]>(() => blok.regels.map(matenVan));

  const zet = (deel: Partial<LastBlok>) => onWijzig(schrijfLast({ ...blok, ...deel }));
  const zetRegel = (i: number, deel: Partial<LastRegel>) =>
    zet({ regels: blok.regels.map((r, j) => (j === i ? { ...r, ...deel } : r)) });
  const zetMaat = (i: number, deel: Partial<Maten>) => {
    const nieuw = { ...(maten[i] ?? { b: "", l: "" }), ...deel };
    zetMaten(blok.regels.map((_, j) => (j === i ? nieuw : maten[j] ?? { b: "", l: "" })));
    zetRegel(i, { factoren: factorenVan(nieuw) });
  };
  const bronVan = (symbool: string) => bronnen.find((b) => b.symbool === symbool);
  const waarde = (b: Belastingbron) =>
    `${fmt(b.waarde, 2, false, i18n.language)} ${b.eenheid === "kN/m" ? "kN/m" : "kN/m²"}`;
  const blijvend = bronnen.filter((b) => b.soort === "G");
  const veranderlijk = bronnen.filter((b) => b.soort === "Q");
  const punt = blok.soort === "punt";

  return (
    <div
      className="lb"
      onKeyDown={(e) => {
        if (e.key === "Escape" || (e.key === "Enter" && (e.ctrlKey || (e.target as HTMLElement).tagName === "INPUT"))) {
          e.preventDefault();
          onKlaar();
        }
      }}
    >
      <div className="lb-kop">
        <input
          ref={eerste}
          type="text"
          className="lb-naam"
          value={blok.naam}
          placeholder={t("lastblok.naamVoorbeeld")}
          aria-label={t("lastblok.naam")}
          onChange={(e) => zet({ naam: e.target.value })}
        />
        <select value={blok.soort} aria-label={t("lastblok.soort")} onChange={(e) => zet({ soort: e.target.value === "punt" ? "punt" : "lijn" })}>
          <option value="lijn">{t("lastblok.lijn")}</option>
          <option value="punt">{t("lastblok.punt")}</option>
        </select>
      </div>

      {/* Dezelfde tabel als op het blad: de kop met het symbool, dan b, l, p_rep, G en Q. */}
      <table className="lb-tabel">
        <thead>
          <tr>
            <th className="lb-th-symbool">
              <input
                type="text"
                className="lb-symbool"
                value={blok.symbool}
                spellCheck={false}
                aria-label={t("lastblok.symbool")}
                title={t("lastblok.symboolUitleg")}
                onChange={(e) => zet({ symbool: e.target.value.replace(/\s+/g, "") })}
              />
            </th>
            <th title={t(punt ? "lastblok.kolomBPunt" : "lastblok.kolomB")}>b</th>
            <th title={t(punt ? "lastblok.kolomLPunt" : "lastblok.kolomL")}>l</th>
            <th title={t("lastblok.belasting")}>p<sub>rep</sub></th>
            <th title={t("lastblok.blijvend")}>G</th>
            <th title={t("lastblok.veranderlijk")}>Q</th>
            <th className="lb-th-weg" />
          </tr>
        </thead>
        <tbody>
          {blok.regels.map((r, i) => {
            const gekozen = bronVan(r.bron.trim());
            const eigen = !gekozen && r.bron.trim() !== "";
            const m = maten[i] ?? matenVan(r);
            return (
              <tr key={i}>
                <td className="lb-td-bron">
                  <select
                    className={eigen ? "lb-bronkeuze lb-smal" : "lb-bronkeuze"}
                    value={gekozen ? gekozen.symbool : eigen ? EIGEN : ""}
                    aria-label={t("lastblok.belasting")}
                    title={eigen ? t("lastblok.eigen") : undefined}
                    onChange={(e) => {
                      if (e.target.value === EIGEN) {
                        zetRegel(i, { bron: r.bron.trim() && !gekozen ? r.bron : "0 kN/m^2" });
                        return;
                      }
                      const b = bronVan(e.target.value);
                      // Een belasting uit hoofdstuk 5 heeft daar haar naam: de eigen omschrijving vervalt.
                      zetRegel(i, { bron: e.target.value, soort: b?.soort ?? r.soort, omschrijving: undefined });
                    }}
                  >
                    <option value="">{t("lastblok.kies")}</option>
                    {blijvend.length > 0 && (
                      <optgroup label={t("lastblok.blijvend")}>
                        {blijvend.map((b) => (
                          <option key={b.symbool} value={b.symbool}>{`${b.naam || b.symbool} · ${b.symbool}`}</option>
                        ))}
                      </optgroup>
                    )}
                    {veranderlijk.length > 0 && (
                      <optgroup label={t("lastblok.veranderlijk")}>
                        {veranderlijk.map((b) => (
                          <option key={b.symbool} value={b.symbool}>{`${b.naam || b.symbool} · ${b.symbool}`}</option>
                        ))}
                      </optgroup>
                    )}
                    <option value={EIGEN}>{t("lastblok.eigen")}</option>
                  </select>
                  {eigen && (
                    <input
                      type="text"
                      value={r.omschrijving ?? ""}
                      aria-label={t("lastblok.omschrijving")}
                      placeholder={t("lastblok.omschrijving")}
                      onChange={(e) => zetRegel(i, { omschrijving: e.target.value || undefined })}
                    />
                  )}
                </td>
                <td>
                  <input
                    type="text"
                    className="lb-getal"
                    value={m.b}
                    spellCheck={false}
                    aria-label={t(punt ? "lastblok.kolomBPunt" : "lastblok.kolomB")}
                    placeholder={t(punt ? "lastblok.maatPuntVoorbeeld" : "lastblok.maatLijnVoorbeeld")}
                    onChange={(e) => zetMaat(i, { b: e.target.value })}
                  />
                </td>
                <td>
                  <input
                    type="text"
                    className="lb-getal"
                    value={m.l}
                    spellCheck={false}
                    aria-label={t(punt ? "lastblok.kolomLPunt" : "lastblok.kolomL")}
                    placeholder={punt ? "" : "1"}
                    onChange={(e) => zetMaat(i, { l: e.target.value })}
                  />
                </td>
                <td>
                  {gekozen ? (
                    <span className="lb-vast" title={gekozen.symbool}>{waarde(gekozen)}</span>
                  ) : (
                    <input
                      type="text"
                      className="lb-getal"
                      value={r.bron}
                      spellCheck={false}
                      disabled={!eigen}
                      aria-label={t("lastblok.eigenWaarde")}
                      placeholder={eigen ? t("lastblok.eigenVoorbeeld") : ""}
                      onChange={(e) => zetRegel(i, { bron: e.target.value })}
                    />
                  )}
                </td>
                {(["G", "Q"] as const).map((soort) => (
                  <td key={soort} className="lb-td-soort">
                    <button
                      type="button"
                      className={r.soort === soort ? "lb-soort lb-aan" : "lb-soort"}
                      aria-pressed={r.soort === soort}
                      aria-label={t(soort === "G" ? "lastblok.blijvend" : "lastblok.veranderlijk")}
                      title={t("lastblok.gOfQ")}
                      onClick={() => zetRegel(i, { soort })}
                    >
                      {r.soort === soort ? "●" : ""}
                    </button>
                  </td>
                ))}
                <td className="lb-td-weg">
                  <button
                    type="button"
                    className="lb-icoon"
                    title={t("lastblok.regelWeg")}
                    aria-label={t("lastblok.regelWeg")}
                    disabled={blok.regels.length <= 1}
                    onClick={() => {
                      zetMaten(maten.filter((_, j) => j !== i));
                      zet({ regels: blok.regels.filter((_, j) => j !== i) });
                    }}
                  >
                    ✕
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      <div className="lb-voet">
        <button
          type="button"
          className="lb-knop lb-plus"
          onClick={() => {
            zetMaten([...blok.regels.map((r, j) => maten[j] ?? matenVan(r)), { b: "", l: "" }]);
            zet({ regels: [...blok.regels, { soort: "G", bron: "", factoren: [] }] });
          }}
        >
          + {t("lastblok.regelErbij")}
        </button>
        <span className="lb-hint">{t(punt ? "lastblok.hintPunt" : "lastblok.hintLijn")}</span>
        <button type="button" className="lb-knop" title={t("lastblok.alsTekstUitleg")} onClick={onAlsTekst}>{t("lastblok.alsTekst")}</button>
        <button type="button" className="lb-knop" onClick={onVerwijder}>{t("lastblok.verwijder")}</button>
        <button type="button" className="lb-knop lb-klaar" onClick={onKlaar}>{t("lastblok.klaar")}</button>
      </div>
      {bronnen.length === 0 && <p className="lb-melding">{t("lastblok.geenBronnen")}</p>}
      {uitkomst && blok.regels.some((r) => r.bron.trim() !== "") && <div className="lb-uitkomst">{uitkomst}</div>}
    </div>
  );
}
