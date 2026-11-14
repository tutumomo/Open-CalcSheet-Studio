/**
 * De wizard "新增供應商": drie stappen, zoals de gebruiker het bedoelt.
 *
 *   1. kiezen   — een lijst met aanbieders, gegroepeerd; wat op deze machine
 *                 al draait of klaarstaat staat bovenaan.
 *   2. verbinden— één gerichte stap: een sleutel plakken, met het abonnement
 *                 inloggen, of het lokale adres bevestigen.
 *   3. model    — de opgehaalde modellen, met de aangeraden modellen als
 *                 terugval en een handmatig veld als laatste redmiddel.
 *
 * De wizard maakt het profiel pas aan op het moment dat de gebruiker echt
 * verbindt, zodat annuleren geen leeg profiel achterlaat.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAiStore } from "../../store/aiStore.ts";
import {
  GROEP_VOLGORDE,
  LEVERANCIERS,
  groepSleutel,
  leverancierUitBron,
  zoekLeveranciers,
  type Leverancier,
  type LeverancierGroep,
} from "./leveranciers.ts";
import { OAuthSectie } from "./OAuthSectie.tsx";

type Stap = 1 | 2 | 3;

function groepNaam(groep: LeverancierGroep, t: (s: string) => string): string {
  return t(groepSleutel(groep));
}

export function AanbiederWizard({ onKlaar }: { onKlaar: () => void }) {
  const { t } = useTranslation("ai");
  const profielen = useAiStore((s) => s.profielen);
  const statussen = useAiStore((s) => s.statussen);
  const modellen = useAiStore((s) => s.modellen);
  const modellenBezig = useAiStore((s) => s.modellenBezig);
  const modellenFout = useAiStore((s) => s.modellenFout);
  const lokaleBronnen = useAiStore((s) => s.lokaleBronnen);
  const lokaleBezig = useAiStore((s) => s.lokaleBezig);
  const detecteerLokaal = useAiStore((s) => s.detecteerLokaal);
  const importeerLokaal = useAiStore((s) => s.importeerLokaal);
  const voegLeverancierToe = useAiStore((s) => s.voegLeverancierToe);
  const bewaarSleutel = useAiStore((s) => s.bewaarSleutel);
  const haalModellenOp = useAiStore((s) => s.haalModellenOp);
  const werkProfielBij = useAiStore((s) => s.werkProfielBij);

  const [stap, setStap] = useState<Stap>(1);
  const [zoek, setZoek] = useState("");
  const [gekozen, setGekozen] = useState<Leverancier | null>(null);
  const [profielId, setProfielId] = useState<string | null>(null);
  const [sleutel, setSleutel] = useState("");
  const [model, setModel] = useState("");
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState<string | null>(null);

  useEffect(() => {
    void detecteerLokaal();
  }, [detecteerLokaal]);

  const status = profielId ? statussen[profielId] : undefined;
  const gevonden = zoekLeveranciers(zoek);
  const eigenProfielen = new Set(profielen.map((p) => p.id));

  const kies = (leverancier: Leverancier) => {
    setGekozen(leverancier);
    setModel(leverancier.modellen[0] ?? "");
    setFout(null);
    setStap(2);
  };

  const maakProfiel = async (leverancier: Leverancier): Promise<string> => {
    if (profielId) return profielId;
    const id = await voegLeverancierToe(leverancier);
    setProfielId(id);
    return id;
  };

  const verbind = async () => {
    if (!gekozen) return;
    setBezig(true);
    setFout(null);
    try {
      const id = await maakProfiel(gekozen);
      if (gekozen.authModus === "apikey" && sleutel.trim() !== "") {
        await bewaarSleutel(sleutel.trim());
        setSleutel("");
      }
      setProfielId(id);
      setStap(3);
      void haalModellenOp();
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(false);
    }
  };

  const neemOver = async (bronId: string) => {
    const bron = lokaleBronnen.find((b) => b.id === bronId);
    if (!bron) return;
    setBezig(true);
    setFout(null);
    try {
      const id = await importeerLokaal(bron);
      setProfielId(id);
      setGekozen(leverancierUitBron(bron));
      setStap(3);
      void haalModellenOp();
    } catch (e) {
      setFout(e instanceof Error ? e.message : String(e));
    } finally {
      setBezig(false);
    }
  };

  const rondAf = async () => {
    if (profielId && model.trim() !== "") {
      await werkProfielBij(profielId, { model: model.trim() });
    }
    onKlaar();
  };

  const modellenLijst = profielId ? (modellen[profielId] ?? []) : [];
  const aanbevolen = gekozen?.modellen ?? [];
  const teKiezen = modellenLijst.length > 0 ? modellenLijst : aanbevolen;

  return (
    <div className="ai-wizard">
      <div className="ai-wizard-kop">
        <span className="ai-wizard-titel">{t("leverancierToevoegenTitel")}</span>
        <div className="ai-wizard-stappen" aria-hidden="true">
          {[1, 2, 3].map((n) => (
            <span key={n} className={`ai-wizard-stap ${stap >= n ? "ai-wizard-stap-actief" : ""}`}>
              {n}
            </span>
          ))}
        </div>
      </div>

      {stap === 1 && (
        <div className="ai-wizard-inhoud">
          <input
            type="search"
            className="ai-wizard-zoek"
            placeholder={t("leverancierZoeken")}
            aria-label={t("leverancierZoeken")}
            value={zoek}
            onChange={(e) => setZoek(e.target.value)}
          />

          {lokaleBezig && <div className="ai-hint">{t("leverancierDetectieBezig")}</div>}

          {lokaleBronnen.length > 0 && (
            <div className="ai-leverancier-groep">
              <div className="ai-groep-kop">{t("leverancierGedetecteerd")}</div>
              {lokaleBronnen.map((bron) => (
                <button
                  key={bron.id}
                  className="ai-leverancier"
                  disabled={bezig}
                  onClick={() => void neemOver(bron.id)}
                >
                  <span className="ai-leverancier-naam">{bron.naam}</span>
                  <span className="ai-leverancier-hint">
                    {bron.endpoint}
                    {bron.heeft_geheim ? ` · ${t("leverancierSleutelAanwezig")}` : ""}
                  </span>
                </button>
              ))}
            </div>
          )}

          {GROEP_VOLGORDE.map((groep) => {
            const inGroep = gevonden.filter((l) => l.groep === groep);
            if (inGroep.length === 0) return null;
            return (
              <div key={groep} className="ai-leverancier-groep">
                <div className="ai-groep-kop">{groepNaam(groep, t)}</div>
                {inGroep.map((leverancier) => (
                  <button
                    key={leverancier.id}
                    className="ai-leverancier"
                    onClick={() => kies(leverancier)}
                  >
                    <span className="ai-leverancier-naam">{leverancier.naam}</span>
                    <span className="ai-leverancier-hint">
                      {leverancier.authModus === "oauth"
                        ? t("leverancierMetAbonnement")
                        : leverancier.authModus === "none"
                          ? t("leverancierZonderSleutel")
                          : t("leverancierMetSleutel")}
                      {eigenProfielen.has(leverancier.id) ? ` · ${t("leverancierAlToegevoegd")}` : ""}
                    </span>
                  </button>
                ))}
              </div>
            );
          })}

          {gevonden.length === 0 && <div className="ai-hint">{t("leverancierGeenResultaat")}</div>}
        </div>
      )}

      {stap === 2 && gekozen && (
        <div className="ai-wizard-inhoud">
          <div className="ai-wizard-onderwerp">{gekozen.naam}</div>

          {gekozen.authModus === "none" && (
            <>
              <div className="ai-hint">{t("leverancierLokaalHint", { endpoint: gekozen.endpoint })}</div>
              <div className="ai-instellingen-rij">
                <button className="ai-knop ai-knop-primair" disabled={bezig} onClick={() => void verbind()}>
                  {t("leverancierVerbinden")}
                </button>
                <button className="ai-knop" onClick={() => setStap(1)}>
                  {t("leverancierTerug")}
                </button>
              </div>
            </>
          )}

          {gekozen.authModus === "oauth" && (
            <>
              <div className="ai-hint">{t("leverancierAbonnementHint")}</div>
              {profielId ? (
                <OAuthSectie profiel={profielen.find((p) => p.id === profielId) ?? profielen[0]} />
              ) : (
                <div className="ai-instellingen-rij">
                  <button
                    className="ai-knop ai-knop-primair"
                    disabled={bezig}
                    onClick={() => void verbind()}
                  >
                    {t("leverancierMetAbonnement")}
                  </button>
                </div>
              )}
              <div className="ai-instellingen-rij">
                <button className="ai-knop" disabled={!status?.heeft_oauth} onClick={() => { setStap(3); void haalModellenOp(); }}>
                  {t("leverancierVolgende")}
                </button>
                <button className="ai-knop" onClick={() => setStap(1)}>
                  {t("leverancierTerug")}
                </button>
              </div>
            </>
          )}

          {gekozen.authModus === "apikey" && (
            <>
              {gekozen.sleutelUrl && (
                <a
                  className="ai-leverancier-link"
                  href={gekozen.sleutelUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  {t("leverancierSleutelHalen")}
                </a>
              )}
              <label className="ai-veld">
                <span>{t("sleutel")}</span>
                <input
                  type="password"
                  value={sleutel}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => setSleutel(e.target.value)}
                />
              </label>
              <div className="ai-instellingen-rij">
                <button className="ai-knop ai-knop-primair" disabled={bezig} onClick={() => void verbind()}>
                  {t("leverancierVerbinden")}
                </button>
                <button className="ai-knop" onClick={() => setStap(1)}>
                  {t("leverancierTerug")}
                </button>
              </div>
            </>
          )}

          {fout && <div className="ai-oauth-fout">{fout}</div>}
        </div>
      )}

      {stap === 3 && (
        <div className="ai-wizard-inhoud">
          <div className="ai-wizard-onderwerp">{t("leverancierKiesModel")}</div>
          {modellenBezig && <div className="ai-hint">{t("modellenBezig")}</div>}
          {!modellenBezig && modellenFout && (
            <div className="ai-hint">{t("leverancierModellenTerugval")}</div>
          )}
          <div className="ai-model-lijst">
            {teKiezen.map((naam) => (
              <button
                key={naam}
                className={`ai-model-knop ${model === naam ? "ai-model-knop-actief" : ""}`}
                onClick={() => setModel(naam)}
              >
                {naam}
              </button>
            ))}
          </div>
          {teKiezen.length === 0 && <div className="ai-hint">{t("leverancierGeenModellen")}</div>}
          <label className="ai-veld">
            <span>{t("leverancierHandmatigModel")}</span>
            <input
              type="text"
              value={model}
              spellCheck={false}
              onChange={(e) => setModel(e.target.value)}
            />
          </label>
          <div className="ai-instellingen-rij">
            <button className="ai-knop ai-knop-primair" disabled={model.trim() === ""} onClick={() => void rondAf()}>
              {t("leverancierKlaar")}
            </button>
            <button className="ai-knop" onClick={() => setStap(2)}>
              {t("leverancierTerug")}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export { LEVERANCIERS };
