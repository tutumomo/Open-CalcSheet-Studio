import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { getSetting, setSetting } from "../store";
import Modal from "./Modal";
import { kenmerken } from "../mcp/kenmerken";
import { version as pakketVersie } from "../../package.json";
import "./FeedbackDialog.css";

/*
 * Feedback sturen zonder GitHub-account, via Open Feedback Studio: de dienst van
 * OpenAEC die de meldingen van alle apps verzamelt. Is de app daar aan een
 * repository gekoppeld, dan wordt een melding ook een issue.
 *
 * Er gaat alleen mee wat hier staat, plus het versienummer. Geen eigen
 * User-Agent-header: de dienst staat in CORS alleen Content-Type toe.
 */
const API = "https://open-feedback-studio.pages.dev/api/feedback";
const APP_ID = "open-calcsheet-studio";
const MIN_BERICHT = 10;
const MAX_BERICHT = 5000;
const MAX_AFBEELDINGEN = 3;
const MAX_AFBEELDINGEN_BYTES = 1024 * 1024;
const IDENTITEIT = "feedbackIdentiteit";

/** De dienst kent deze soorten en stemmingen; de waarden gaan onvertaald mee. */
const SOORTEN = [
  { waarde: "general", label: "categoryGeneral" },
  { waarde: "bug", label: "categoryBug" },
  { waarde: "feature", label: "categoryFeature" },
] as const;
const STEMMINGEN = [
  { waarde: "Frustrated", teken: "\u{1F61E}", label: "sentimentFrustrated" },
  { waarde: "Neutral", teken: "\u{1F610}", label: "sentimentNeutral" },
  { waarde: "Happy", teken: "\u{1F60A}", label: "sentimentHappy" },
] as const;

const lijktOpEmail = (t: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t);

export default function FeedbackDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation("feedback");
  const [email, setEmail] = useState("");
  const [naam, setNaam] = useState("");
  const [soort, setSoort] = useState<string>("general");
  const [bericht, setBericht] = useState("");
  const [stemming, setStemming] = useState<string | null>(null);
  const [afbeeldingen, setAfbeeldingen] = useState<File[]>([]);
  const [stand, setStand] = useState<"invullen" | "bezig" | "klaar">("invullen");
  const [fout, setFout] = useState<string | null>(null);
  const [toonFouten, setToonFouten] = useState(false);
  const bestandVeld = useRef<HTMLInputElement>(null);

  // Wie eerder iets stuurde hoeft zijn gegevens niet opnieuw in te vullen; ze blijven op deze computer.
  useEffect(() => {
    if (!open) return;
    void getSetting<{ email?: string; naam?: string }>(IDENTITEIT, {}).then((opgeslagen) => {
      setEmail((nu) => nu || opgeslagen.email || "");
      setNaam((nu) => nu || opgeslagen.naam || "");
    });
  }, [open]);

  const emailTekst = email.trim();
  const emailGoed = emailTekst === "" || lijktOpEmail(emailTekst);
  const berichtTekst = bericht.trim();
  const berichtGoed = berichtTekst.length >= MIN_BERICHT && berichtTekst.length <= MAX_BERICHT;

  const voegAfbeeldingenToe = (bestanden: FileList | null) => {
    const lijst = [...afbeeldingen];
    let totaal = lijst.reduce((som, f) => som + f.size, 0);
    let geweigerd = false;
    for (const f of Array.from(bestanden ?? [])) {
      if (!f.type.startsWith("image/") || lijst.length >= MAX_AFBEELDINGEN || totaal + f.size > MAX_AFBEELDINGEN_BYTES) {
        geweigerd = true;
        continue;
      }
      lijst.push(f);
      totaal += f.size;
    }
    setAfbeeldingen(lijst);
    setFout(geweigerd ? t("imageLimit") : null);
    if (bestandVeld.current) bestandVeld.current.value = "";
  };

  const verstuur = async () => {
    if (stand === "bezig") return;
    if (!emailGoed || !berichtGoed) {
      setToonFouten(true);
      return;
    }
    setStand("bezig");
    setFout(null);
    try {
      // Dezelfde tag als de app toont, zodat een melding bij de juiste release hoort.
      const versie = await kenmerken(pakketVersie).then((k) => k.tag).catch(() => "");
      const velden: Record<string, string> = { app: APP_ID, category: soort, message: berichtTekst };
      if (emailTekst) velden.email = emailTekst;
      if (naam.trim()) velden.fullname = naam.trim();
      if (stemming) velden.sentiment = stemming;
      if (versie) velden.appVersion = versie;

      let antwoord: Response;
      if (afbeeldingen.length > 0) {
        const formulier = new FormData();
        for (const [k, v] of Object.entries(velden)) formulier.append(k, v);
        for (const f of afbeeldingen) formulier.append("images", f);
        antwoord = await fetch(API, { method: "POST", body: formulier });
      } else {
        antwoord = await fetch(API, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(velden),
        });
      }
      if (!antwoord.ok) {
        const inhoud = (await antwoord.json().catch(() => null)) as { error?: unknown } | null;
        throw new Error(typeof inhoud?.error === "string" ? inhoud.error : `HTTP ${antwoord.status}`);
      }
      void setSetting(IDENTITEIT, { email: emailTekst, naam: naam.trim() });
      setBericht("");
      setStemming(null);
      setAfbeeldingen([]);
      setToonFouten(false);
      setStand("klaar");
    } catch (err) {
      // Het bericht blijft staan, zodat het opnieuw kan.
      console.error("Feedback verzenden mislukt:", err);
      setFout(`${t("errorGeneric")} (${(err as Error)?.message ?? String(err)})`);
      setStand("invullen");
    }
  };

  const klaar = stand === "klaar";
  const footer = klaar ? (
    <>
      <button className="settings-btn settings-btn-secondary" onClick={() => setStand("invullen")}>{t("sendAnother")}</button>
      <button className="settings-btn settings-btn-primary" onClick={onClose}>{t("close")}</button>
    </>
  ) : (
    <>
      <button className="settings-btn settings-btn-secondary" onClick={onClose}>{t("cancel")}</button>
      <button className="settings-btn settings-btn-primary" disabled={stand === "bezig"} onClick={() => void verstuur()}>
        {t(stand === "bezig" ? "submitting" : "submit")}
      </button>
    </>
  );

  return (
    <Modal open={open} onClose={onClose} title={t("title")} width={520} className="feedback-dialog" footer={footer}>
      {klaar ? (
        <div className="feedback-klaar">
          <h3>{t("successTitle")}</h3>
          <p>{t("successMessage")}</p>
        </div>
      ) : (
        <div className="feedback-formulier">
          <div className="feedback-soorten" role="radiogroup" aria-label={t("category")}>
            {SOORTEN.map((s) => (
              <button
                key={s.waarde}
                type="button"
                role="radio"
                aria-checked={soort === s.waarde}
                className={soort === s.waarde ? "feedback-soort actief" : "feedback-soort"}
                onClick={() => setSoort(s.waarde)}
              >
                {t(s.label)}
              </button>
            ))}
          </div>

          <label className="feedback-veld">
            <span>{t("message")}</span>
            <textarea
              rows={6}
              maxLength={MAX_BERICHT}
              placeholder={t("messagePlaceholder")}
              value={bericht}
              autoFocus
              onChange={(e) => setBericht(e.target.value)}
            />
            {toonFouten && !berichtGoed && <em className="feedback-fout">{t("messageShort")}</em>}
          </label>

          <div className="feedback-rij">
            <label className="feedback-veld">
              <span>{t("email")}</span>
              <input type="email" placeholder={t("emailPlaceholder")} value={email} onChange={(e) => setEmail(e.target.value)} />
              {toonFouten && !emailGoed && <em className="feedback-fout">{t("emailInvalid")}</em>}
            </label>
            <label className="feedback-veld">
              <span>{t("fullName")}</span>
              <input type="text" maxLength={200} placeholder={t("fullNamePlaceholder")} value={naam} onChange={(e) => setNaam(e.target.value)} />
            </label>
          </div>

          <div className="feedback-rij feedback-rij-midden">
            <div className="feedback-stemmingen" role="radiogroup" aria-label={t("sentiment")}>
              <span>{t("sentiment")}</span>
              {STEMMINGEN.map((s) => (
                <button
                  key={s.waarde}
                  type="button"
                  role="radio"
                  aria-checked={stemming === s.waarde}
                  aria-label={t(s.label)}
                  title={t(s.label)}
                  className={stemming === s.waarde ? "feedback-stemming actief" : "feedback-stemming"}
                  onClick={() => setStemming(stemming === s.waarde ? null : s.waarde)}
                >
                  {s.teken}
                </button>
              ))}
            </div>
            <div className="feedback-bijlagen">
              <button type="button" className="settings-btn settings-btn-secondary" disabled={afbeeldingen.length >= MAX_AFBEELDINGEN} title={t("imageLimit")} onClick={() => bestandVeld.current?.click()}>
                {t("attachImages")}
              </button>
              <input ref={bestandVeld} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple hidden onChange={(e) => voegAfbeeldingenToe(e.target.files)} />
            </div>
          </div>

          {afbeeldingen.length > 0 && (
            <ul className="feedback-bestanden">
              {afbeeldingen.map((f, i) => (
                <li key={`${f.name}-${i}`}>
                  <span>{f.name}</span>
                  <button type="button" aria-label={t("removeImage")} title={t("removeImage")} onClick={() => setAfbeeldingen(afbeeldingen.filter((_, k) => k !== i))}>×</button>
                </li>
              ))}
            </ul>
          )}

          <p className="feedback-privacy">{t("privacy")}</p>
          {fout && <p className="feedback-fout" role="alert">{fout}</p>}
        </div>
      )}
    </Modal>
  );
}
