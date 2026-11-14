/**
 * De AI-zijbalk (docs/OCSS_TW_開發需求規格.md, P2-15).
 *
 * Rechts van de werkruimte: het gesprek, de stappen met hun argumenten, de vraag
 * om goedkeuring (met het verschil vóór er iets overschreven wordt) en de
 * instellingen van de aanbieder. De lus zelf zit in `agent.ts`, de stand in
 * `store/aiStore.ts`; dit bestand toont het alleen.
 *
 * De zijbalk werkt alleen in de desktop-app (Rust doet het netwerkverkeer en
 * bewaart de sleutel); in de browser zegt hij dat.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAiStore } from "../../store/aiStore.ts";
import { voorbeeldTekst } from "./beleid.ts";
import type { AiAanbieder } from "../../tauri/ai.ts";
import type { Stap } from "./agent.ts";
import "./AiPaneel.css";

const AANBIEDERS: { waarde: AiAanbieder; tekst: string }[] = [
  { waarde: "anthropic", tekst: "Anthropic" },
  { waarde: "openai", tekst: "OpenAI-compatible (incl. magpie)" },
  { waarde: "gemini", tekst: "Google Gemini" },
];

const STATUS_TEKEN: Record<Stap["status"], string> = {
  wacht: "·",
  loopt: "◌",
  klaar: "✓",
  fout: "✕",
  geweigerd: "⊘",
};

function StapRegel({ stap }: { stap: Stap }) {
  const { t } = useTranslation("ai");
  const [open, setOpen] = useState(false);
  const statusTekst = t(
    stap.status === "wacht"
      ? "stapWacht"
      : stap.status === "loopt"
        ? "stapLoopt"
        : stap.status === "klaar"
          ? "stapKlaar"
          : stap.status === "fout"
            ? "stapFout"
            : "stapGeweigerd",
  );
  return (
    <div className={`ai-stap ai-stap-${stap.status}`}>
      <button className="ai-stap-kop" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="ai-stap-teken" aria-hidden="true">{STATUS_TEKEN[stap.status]}</span>
        <span className="ai-stap-naam">{stap.samenvatting}</span>
        <span className="ai-stap-status">{statusTekst}</span>
      </button>
      {open && (
        <div className="ai-stap-detail">
          <div className="ai-stap-label">{t("argumenten")}</div>
          <pre>{JSON.stringify(stap.argumenten, null, 2)}</pre>
          {stap.resultaat && (
            <>
              <div className="ai-stap-label">{t("resultaat")}</div>
              <pre>{stap.resultaat}</pre>
            </>
          )}
          {stap.fout && <div className="ai-stap-fout">{stap.fout}</div>}
        </div>
      )}
    </div>
  );
}

function Instellingen() {
  const { t } = useTranslation("ai");
  const instellingen = useAiStore((s) => s.instellingen);
  const sleutels = useAiStore((s) => s.sleutels);
  const zetInstellingen = useAiStore((s) => s.zetInstellingen);
  const bewaarSleutel = useAiStore((s) => s.bewaarSleutel);
  const [sleutel, setSleutel] = useState("");
  const bewaard = sleutels[instellingen.aanbieder] === true;

  return (
    <div className="ai-instellingen">
      <label className="ai-veld">
        <span>{t("aanbieder")}</span>
        <select
          value={instellingen.aanbieder}
          onChange={(e) => {
            const aanbieder = e.target.value as AiAanbieder;
            void zetInstellingen({ aanbieder });
          }}
        >
          {AANBIEDERS.map((a) => (
            <option key={a.waarde} value={a.waarde}>{a.tekst}</option>
          ))}
        </select>
      </label>
      <label className="ai-veld">
        <span>{t("endpoint")}</span>
        <input
          type="text"
          value={instellingen.endpoint}
          spellCheck={false}
          onChange={(e) => void zetInstellingen({ endpoint: e.target.value })}
        />
      </label>
      <label className="ai-veld">
        <span>{t("model")}</span>
        <input
          type="text"
          value={instellingen.model}
          spellCheck={false}
          onChange={(e) => void zetInstellingen({ model: e.target.value })}
        />
      </label>
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
        <button
          className="ai-knop"
          disabled={sleutel.trim() === ""}
          onClick={() => {
            void bewaarSleutel(sleutel.trim());
            setSleutel("");
          }}
        >
          {t("sleutelBewaren")}
        </button>
        <button
          className="ai-knop"
          disabled={!bewaard}
          onClick={() => {
            void bewaarSleutel("");
            setSleutel("");
          }}
        >
          {t("sleutelWissen")}
        </button>
      </div>
      {bewaard && <div className="ai-hint">{t("sleutelBewaard")}</div>}
      <div className="ai-hint">{t("sleutelHint")}</div>
    </div>
  );
}

export default function AiPaneel() {
  const { t } = useTranslation("ai");
  const open = useAiStore((s) => s.open);
  const geladen = useAiStore((s) => s.geladen);
  const beschikbaar = useAiStore((s) => s.beschikbaar);
  const regels = useAiStore((s) => s.regels);
  const stappen = useAiStore((s) => s.stappen);
  const bezig = useAiStore((s) => s.bezig);
  const fout = useAiStore((s) => s.fout);
  const goedkeuring = useAiStore((s) => s.goedkeuring);
  const zetOpen = useAiStore((s) => s.zetOpen);
  const verstuur = useAiStore((s) => s.verstuur);
  const stop = useAiStore((s) => s.stop);
  const antwoord = useAiStore((s) => s.antwoord);
  const wisGesprek = useAiStore((s) => s.wisGesprek);
  const [tekst, setTekst] = useState("");
  const [toonInstellingen, setToonInstellingen] = useState(false);
  const gesprek = useRef<HTMLDivElement>(null);

  // Bij elk nieuw stuk tekst of elke stap mee naar beneden, tenzij de gebruiker
  // zelf omhoog heeft gescrold.
  useEffect(() => {
    const el = gesprek.current;
    if (!el) return;
    const onderaan = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (onderaan) el.scrollTop = el.scrollHeight;
  }, [regels, stappen]);

  if (!open) return null;

  const stappenBij = (ids: string[]) => stappen.filter((s) => ids.includes(s.id));

  return (
    <aside className="ai-paneel" aria-label={t("titel")}>
      <header className="ai-kop">
        <span className="ai-titel">{t("titel")}</span>
        <div className="ai-kop-knoppen">
          <button className="ai-knop-kaal" onClick={() => setToonInstellingen(!toonInstellingen)} aria-expanded={toonInstellingen}>
            {t("instellingenTitel")}
          </button>
          <button className="ai-knop-kaal" onClick={wisGesprek} disabled={regels.length === 0}>
            {t("wissen")}
          </button>
          <button className="ai-knop-kaal" onClick={() => zetOpen(false)} aria-label={t("sluiten")}>
            ✕
          </button>
        </div>
      </header>

      {toonInstellingen && <Instellingen />}

      <div className="ai-gesprek" ref={gesprek}>
        {!geladen && <div className="ai-hint">{t("wachten")}</div>}
        {geladen && !beschikbaar && <div className="ai-hint">{t("geenDesktop")}</div>}
        {geladen && beschikbaar && regels.length === 0 && <div className="ai-hint">{t("leeg")}</div>}
        {regels.map((regel) => (
          <div key={regel.id} className={`ai-regel ai-regel-${regel.rol}`}>
            {regel.tekst !== "" && <div className="ai-tekst">{regel.tekst}</div>}
            {regel.rol === "assistant" && regel.stappen.length > 0 && (
              <div className="ai-stappen">
                {stappenBij(regel.stappen).map((s) => (
                  <StapRegel key={s.id} stap={s} />
                ))}
              </div>
            )}
            {regel.loopt && regel.tekst === "" && <div className="ai-hint">{t("bezig")}</div>}
          </div>
        ))}
      </div>

      {goedkeuring && (
        <div className="ai-goedkeuring">
          <div className="ai-goedkeuring-titel">
            {goedkeuring.soort === "voorbeeld" ? t("voorbeeldTitel") : t("goedkeuringTitel")}
          </div>
          <div className="ai-goedkeuring-vraag">
            {goedkeuring.soort === "voorbeeld" ? t("voorbeeldUitleg") : t("goedkeuringVraag", { tool: goedkeuring.tool })}
          </div>
          <div className="ai-goedkeuring-stap">{goedkeuring.samenvatting}</div>
          {goedkeuring.soort === "voorbeeld" && <pre className="ai-voorbeeld">{voorbeeldTekst(goedkeuring.voorbeeld)}</pre>}
          <div className="ai-instellingen-rij">
            <button className="ai-knop ai-knop-primair" onClick={() => antwoord("ja")}>{t("toelaten")}</button>
            <button className="ai-knop" onClick={() => antwoord("nee")}>{t("weigeren")}</button>
            <button className="ai-knop" onClick={() => antwoord("altijd")}>{t("altijd")}</button>
          </div>
        </div>
      )}

      {fout && (
        <div className="ai-fout">
          <strong>{t("foutTitel")}</strong> {fout}
        </div>
      )}

      <footer className="ai-voet">
        <textarea
          className="ai-invoer"
          value={tekst}
          placeholder={t("plaatshouder")}
          rows={3}
          disabled={!beschikbaar || bezig}
          onChange={(e) => setTekst(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              const v = tekst;
              setTekst("");
              void verstuur(v);
            }
          }}
        />
        <div className="ai-voet-rij">
          <span className="ai-hint">{t("bereikHint")}</span>
          {bezig ? (
            <button className="ai-knop" onClick={stop}>{t("stoppen")}</button>
          ) : (
            <button
              className="ai-knop ai-knop-primair"
              disabled={!beschikbaar || tekst.trim() === ""}
              onClick={() => {
                const v = tekst;
                setTekst("");
                void verstuur(v);
              }}
            >
              {t("versturen")}
            </button>
          )}
        </div>
      </footer>
    </aside>
  );
}
