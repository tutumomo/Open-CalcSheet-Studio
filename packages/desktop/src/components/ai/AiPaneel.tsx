/**
 * De AI-zijbalk (docs/OCSS_TW_開發需求規格.md, P2-15).
 *
 * Rechts van de werkruimte: het gesprek, de stappen met hun argumenten, de vraag
 * om goedkeuring (met het verschil vóór er iets overschreven wordt) en de
 * instellingen van de aanbieders (standaard aanbieders + zelf toegevoegde
 * derde-partij-modellen, keuze uit API-sleutel, OAuth 2.0 of geen sleutel, plus
 * ophalen van beschikbare modellen uit het endpoint).
 *
 * De zijbalk werkt alleen in de desktop-app (Rust doet het netwerkverkeer en
 * bewaart de sleutels/tokens); in de browser zegt hij dat.
 */
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useAiStore } from "../../store/aiStore.ts";
import { AI_SJABLONEN, OAUTH_SJABLONEN, leesKoppen, schrijfKoppen, verwachteRedirectUri, type AiProfiel } from "./profielen.ts";
import { voorbeeldTekst } from "./beleid.ts";
import type { AiAanbieder, AiAuthModus, AiOAuthSoort, AiTokenFormaat } from "../../tauri/ai.ts";
import type { Stap } from "./agent.ts";
import "./AiPaneel.css";

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

function OAuthSectie({ profiel }: { profiel: AiProfiel }) {
  const { t } = useTranslation("ai");
  const status = useAiStore((s) => s.statussen[profiel.id]);
  const oauthLopend = useAiStore((s) => s.oauthLopend);
  const oauthFout = useAiStore((s) => s.oauthFout);
  const werkProfielBij = useAiStore((s) => s.werkProfielBij);
  const werkOAuthBij = useAiStore((s) => s.werkOAuthBij);
  const startOAuthLogin = useAiStore((s) => s.startOAuthLogin);
  const startDeviceLogin = useAiStore((s) => s.startDeviceLogin);
  const rondOAuthHandmatigAf = useAiStore((s) => s.rondOAuthHandmatigAf);
  const annuleerOAuth = useAiStore((s) => s.annuleerOAuth);
  const logOAuthUit = useAiStore((s) => s.logOAuthUit);
  const bewaarClientSecret = useAiStore((s) => s.bewaarClientSecret);
  const zetHandmatigToken = useAiStore((s) => s.zetHandmatigToken);

  const [handmatigUrl, setHandmatigUrl] = useState("");
  const [clientSecret, setClientSecret] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [refreshToken, setRefreshToken] = useState("");

  const oauth = profiel.oauth ?? {
    soort: "pkce" as AiOAuthSoort,
    authUrl: "",
    tokenUrl: "",
    clientId: "",
    scopes: "openid profile",
  };
  const bezig = oauthLopend?.profiel === profiel.id;
  const aangemeld = status?.heeft_oauth === true;

  return (
    <div className="ai-oauth-blok">
      <div className="ai-oauth-status">
        {aangemeld ? (
          <>
            <span className="ai-status-ok">{t("oauthAangemeld")}</span>
            {(status?.oauth_account || status?.oauth_account_id) && (
              <span className="ai-hint">
                {" "}
                · {t("oauthAccount", { account: status.oauth_account || status.oauth_account_id })}
              </span>
            )}
            {(profiel.projectId || status?.oauth_project_id) && (
              <div className="ai-hint">
                {t("oauthProject", { project: profiel.projectId || status?.oauth_project_id })}
              </div>
            )}
            {status?.oauth_verlopen && <div className="ai-hint">{t("oauthVerlopenHint")}</div>}
          </>
        ) : (
          <span className="ai-hint">{t("oauthNietAangemeld")}</span>
        )}
      </div>

      <div className="ai-instellingen-rij">
        <button
          className="ai-knop ai-knop-primair"
          disabled={oauthLopend !== null}
          onClick={() => void startOAuthLogin(false)}
        >
          {t("oauthInloggen")}
        </button>
        {oauth.copyCodeRedirectUri && (
          <button
            className="ai-knop"
            disabled={oauthLopend !== null}
            onClick={() => void startOAuthLogin(true)}
          >
            {t("oauthInloggenKopieer")}
          </button>
        )}
        {oauth.deviceCode && (
          <button
            className="ai-knop"
            disabled={oauthLopend !== null}
            onClick={() => void startDeviceLogin()}
          >
            {t("oauthInloggenDevice")}
          </button>
        )}
        {aangemeld && (
          <button className="ai-knop" onClick={() => void logOAuthUit()}>
            {t("oauthUitloggen")}
          </button>
        )}
      </div>

      {bezig && oauthLopend.device && (
        <div className="ai-oauth-lopend">
          <div className="ai-hint">{t("oauthDeviceHint")}</div>
          <div className="ai-device-code">{oauthLopend.device.userCode}</div>
          {oauthLopend.waarschuwing && <div className="ai-hint">{oauthLopend.waarschuwing}</div>}
          <div className="ai-instellingen-rij">
            <a className="ai-knop" href={oauthLopend.device.verificationUrl} target="_blank" rel="noreferrer">
              {t("oauthOpenOpnieuw")}
            </a>
            <button className="ai-knop" onClick={() => void annuleerOAuth()}>
              {t("oauthAnnuleer")}
            </button>
          </div>
        </div>
      )}

      {bezig && !oauthLopend.device && (
        <div className="ai-oauth-lopend">
          <div className="ai-hint">{t("oauthWachtBrowser")}</div>
          {oauthLopend.waarschuwing && <div className="ai-hint">{oauthLopend.waarschuwing}</div>}
          <div className="ai-instellingen-rij">
            {oauthLopend.url && (
              <a className="ai-knop" href={oauthLopend.url} target="_blank" rel="noreferrer">
                {t("oauthOpenOpnieuw")}
              </a>
            )}
            <button className="ai-knop" onClick={() => void annuleerOAuth()}>
              {t("oauthAnnuleer")}
            </button>
          </div>
          <label className="ai-veld">
            <span>{t("oauthHandmatigHint")}</span>
            <input
              type="text"
              value={handmatigUrl}
              spellCheck={false}
              onChange={(e) => setHandmatigUrl(e.target.value)}
            />
          </label>
          <div className="ai-instellingen-rij">
            <button
              className="ai-knop"
              disabled={handmatigUrl.trim() === ""}
              onClick={() => {
                const invoer = handmatigUrl;
                setHandmatigUrl("");
                void rondOAuthHandmatigAf(invoer);
              }}
            >
              {t("oauthHandmatigKlaar")}
            </button>
          </div>
        </div>
      )}

      {oauthFout && <div className="ai-oauth-fout">{oauthFout}</div>}

      <details className="ai-details" open={!aangemeld && oauth.authUrl === ""}>
        <summary>{t("oauthConfig")}</summary>
        <div className="ai-details-inhoud">
          <div className="ai-hint">{t("oauthRedirectHint", { uri: verwachteRedirectUri(oauth) })}</div>
          <label className="ai-veld">
            <span>{t("oauthSjabloon")}</span>
            <select
              value=""
              onChange={(e) => {
                const tpl = OAUTH_SJABLONEN.find((o) => o.id === e.target.value);
                if (!tpl) return;
                void werkOAuthBij(profiel.id, {
                  ...tpl.config,
                  ...(tpl.config.extraParams ? { extraParams: { ...tpl.config.extraParams } } : {}),
                });
              }}
            >
              <option value="">{t("oauthSjabloon")}</option>
              {OAUTH_SJABLONEN.map((o) => (
                <option key={o.id} value={o.id}>{o.naam}</option>
              ))}
            </select>
          </label>
          <label className="ai-veld">
            <span>{t("oauthSoort")}</span>
            <select
              value={oauth.soort}
              onChange={(e) => void werkOAuthBij(profiel.id, { soort: e.target.value as AiOAuthSoort })}
            >
              <option value="pkce">{t("oauthSoortPkce")}</option>
              <option value="openrouter">{t("oauthSoortOpenrouter")}</option>
            </select>
          </label>
          {oauth.soort === "pkce" && (
            <>
              <label className="ai-veld">
                <span>{t("oauthClientId")}</span>
                <input
                  type="text"
                  value={oauth.clientId}
                  spellCheck={false}
                  onChange={(e) => void werkOAuthBij(profiel.id, { clientId: e.target.value })}
                />
              </label>
              <label className="ai-veld">
                <span>{t("oauthClientSecret")}</span>
                <input
                  type="password"
                  value={clientSecret}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => setClientSecret(e.target.value)}
                />
              </label>
              <div className="ai-instellingen-rij">
                <button
                  className="ai-knop"
                  disabled={clientSecret.trim() === ""}
                  onClick={() => {
                    void bewaarClientSecret(clientSecret.trim());
                    setClientSecret("");
                  }}
                >
                  {t("bewaren")}
                </button>
                {status?.heeft_client_secret && (
                  <button className="ai-knop" onClick={() => void bewaarClientSecret("")}>
                    {t("sleutelWissen")}
                  </button>
                )}
              </div>
              {status?.heeft_client_secret && <div className="ai-hint">{t("oauthClientSecretBewaard")}</div>}
            </>
          )}
          <label className="ai-veld">
            <span>{t("oauthAuthUrl")}</span>
            <input
              type="text"
              value={oauth.authUrl}
              spellCheck={false}
              onChange={(e) => void werkOAuthBij(profiel.id, { authUrl: e.target.value })}
            />
          </label>
          <label className="ai-veld">
            <span>{t("oauthTokenUrl")}</span>
            <input
              type="text"
              value={oauth.tokenUrl}
              spellCheck={false}
              onChange={(e) => void werkOAuthBij(profiel.id, { tokenUrl: e.target.value })}
            />
          </label>
          {oauth.soort === "pkce" && (
            <>
              <label className="ai-veld">
                <span>{t("oauthScopes")}</span>
                <input
                  type="text"
                  value={oauth.scopes}
                  spellCheck={false}
                  onChange={(e) => void werkOAuthBij(profiel.id, { scopes: e.target.value })}
                />
              </label>
              <label className="ai-veld">
                <span>{t("oauthCallbackPath")}</span>
                <input
                  type="text"
                  value={oauth.callbackPath ?? "/oauth/callback"}
                  spellCheck={false}
                  onChange={(e) => void werkOAuthBij(profiel.id, { callbackPath: e.target.value })}
                />
              </label>
              <label className="ai-veld">
                <span>{t("oauthRedirectHost")}</span>
                <select
                  value={oauth.redirectHost ?? "127.0.0.1"}
                  onChange={(e) => void werkOAuthBij(profiel.id, { redirectHost: e.target.value })}
                >
                  {["127.0.0.1", "localhost"].map((host) => (
                    <option key={host} value={host}>{host}</option>
                  ))}
                </select>
              </label>
              <label className="ai-veld">
                <span>{t("oauthTokenFormat")}</span>
                <select
                  value={oauth.tokenFormat ?? "form"}
                  onChange={(e) => void werkOAuthBij(profiel.id, { tokenFormat: e.target.value as AiTokenFormaat })}
                >
                  <option value="form">{t("oauthTokenForm")}</option>
                  <option value="json">{t("oauthTokenJson")}</option>
                </select>
              </label>
            </>
          )}
          <label className="ai-veld">
            <span>{t("oauthPort")}</span>
            <input
              type="number"
              min={1}
              max={65535}
              value={oauth.callbackPort ?? ""}
              onChange={(e) => {
                const n = Number(e.target.value);
                void werkOAuthBij(profiel.id, {
                  callbackPort: Number.isInteger(n) && n >= 1 && n <= 65535 ? n : undefined,
                });
              }}
            />
          </label>
          {profiel.aanbieder === "gemini" && (
            <label className="ai-veld">
              <span>{t("oauthProjectId")}</span>
              <input
                type="text"
                value={profiel.projectId ?? ""}
                spellCheck={false}
                onChange={(e) => void werkProfielBij(profiel.id, { projectId: e.target.value.trim() || undefined })}
              />
            </label>
          )}

          <details className="ai-details">
            <summary>{t("oauthHandmatigToken")}</summary>
            <div className="ai-details-inhoud">
              <label className="ai-veld">
                <span>{t("oauthAccessToken")}</span>
                <input
                  type="password"
                  value={accessToken}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => setAccessToken(e.target.value)}
                />
              </label>
              <label className="ai-veld">
                <span>{t("oauthRefreshToken")}</span>
                <input
                  type="password"
                  value={refreshToken}
                  spellCheck={false}
                  autoComplete="off"
                  onChange={(e) => setRefreshToken(e.target.value)}
                />
              </label>
              <div className="ai-instellingen-rij">
                <button
                  className="ai-knop"
                  disabled={accessToken.trim() === ""}
                  onClick={() => {
                    const at = accessToken.trim();
                    const rt = refreshToken.trim();
                    setAccessToken("");
                    setRefreshToken("");
                    void zetHandmatigToken(at, rt || undefined);
                  }}
                >
                  {t("oauthTokenBewaren")}
                </button>
              </div>
            </div>
          </details>
        </div>
      </details>
    </div>
  );
}

function Instellingen() {
  const { t } = useTranslation("ai");
  const actiefId = useAiStore((s) => s.actiefId);
  const profielen = useAiStore((s) => s.profielen);
  const statussen = useAiStore((s) => s.statussen);
  const modellen = useAiStore((s) => s.modellen);
  const modellenBezig = useAiStore((s) => s.modellenBezig);
  const modellenFout = useAiStore((s) => s.modellenFout);
  const kiesProfiel = useAiStore((s) => s.kiesProfiel);
  const werkProfielBij = useAiStore((s) => s.werkProfielBij);
  const voegProfielToe = useAiStore((s) => s.voegProfielToe);
  const verwijderProfiel = useAiStore((s) => s.verwijderProfiel);
  const bewaarSleutel = useAiStore((s) => s.bewaarSleutel);
  const haalModellenOp = useAiStore((s) => s.haalModellenOp);

  const [sleutel, setSleutel] = useState("");
  const [nieuwOpen, setNieuwOpen] = useState(false);
  const [sjabloonId, setSjabloonId] = useState(AI_SJABLONEN[0].id);
  const [nieuwNaam, setNieuwNaam] = useState("");
  const [koppenTekst, setKoppenTekst] = useState("");

  const profiel = profielen.find((p) => p.id === actiefId) ?? profielen[0];
  const profielId = profiel?.id ?? "";
  const opgeslagenKoppen = profiel?.extraKoppen;
  useEffect(() => {
    setKoppenTekst(schrijfKoppen(opgeslagenKoppen));
  }, [profielId]);

  if (!profiel) return null;

  const status = statussen[profiel.id];
  const bewaard = status?.heeft_sleutel === true;
  const modellenLijst = modellen[profiel.id] ?? [];

  return (
    <div className="ai-instellingen">
      <div className="ai-veld">
        <div className="ai-veld-kop">
          <span>{t("profiel")}</span>
          <div className="ai-veld-acties">
            <button className="ai-knop-klein" onClick={() => setNieuwOpen(!nieuwOpen)}>
              {t("profielToevoegen")}
            </button>
            {!profiel.ingebouwd && profielen.length > 1 && (
              <button className="ai-knop-klein" onClick={() => void verwijderProfiel(profiel.id)}>
                {t("profielVerwijderen")}
              </button>
            )}
          </div>
        </div>
        <select value={profiel.id} onChange={(e) => void kiesProfiel(e.target.value)}>
          {profielen.map((p) => (
            <option key={p.id} value={p.id}>{p.naam}</option>
          ))}
        </select>
      </div>

      {nieuwOpen && (
        <div className="ai-nieuw-profiel">
          <label className="ai-veld">
            <span>{t("sjabloon")}</span>
            <select value={sjabloonId} onChange={(e) => setSjabloonId(e.target.value)}>
              {AI_SJABLONEN.map((s) => (
                <option key={s.id} value={s.id}>{s.naam}</option>
              ))}
            </select>
          </label>
          <label className="ai-veld">
            <span>{t("profielNaam")}</span>
            <input
              type="text"
              value={nieuwNaam}
              onChange={(e) => setNieuwNaam(e.target.value)}
            />
          </label>
          <div className="ai-instellingen-rij">
            <button
              className="ai-knop ai-knop-primair"
              onClick={() => {
                const naam = nieuwNaam;
                setNieuwNaam("");
                setNieuwOpen(false);
                void voegProfielToe(sjabloonId, naam);
              }}
            >
              {t("toevoegen")}
            </button>
            <button className="ai-knop" onClick={() => setNieuwOpen(false)}>
              {t("annuleren")}
            </button>
          </div>
        </div>
      )}

      {!profiel.ingebouwd && (
        <>
          <label className="ai-veld">
            <span>{t("profielNaam")}</span>
            <input
              type="text"
              value={profiel.naam}
              onChange={(e) => void werkProfielBij(profiel.id, { naam: e.target.value })}
            />
          </label>
          <label className="ai-veld">
            <span>{t("protocol")}</span>
            <select
              value={profiel.aanbieder}
              onChange={(e) => void werkProfielBij(profiel.id, { aanbieder: e.target.value as AiAanbieder })}
            >
              <option value="openai">{t("protocolOpenai")}</option>
              <option value="anthropic">{t("protocolAnthropic")}</option>
              <option value="gemini">{t("protocolGemini")}</option>
            </select>
          </label>
        </>
      )}

      <label className="ai-veld">
        <span>{t("endpoint")}</span>
        <input
          type="text"
          value={profiel.endpoint}
          spellCheck={false}
          onChange={(e) => void werkProfielBij(profiel.id, { endpoint: e.target.value })}
        />
      </label>

      <div className="ai-veld">
        <div className="ai-veld-kop">
          <span>{t("model")}</span>
          <button
            className="ai-knop-klein"
            disabled={modellenBezig || profiel.endpoint.trim() === ""}
            onClick={() => void haalModellenOp()}
          >
            {modellenBezig ? t("modellenBezig") : t("haalModellen")}
          </button>
        </div>
        {modellenLijst.length > 0 && (
          <select
            aria-label={t("kiesModel")}
            value={modellenLijst.includes(profiel.model) ? profiel.model : ""}
            onChange={(e) => {
              if (e.target.value !== "") void werkProfielBij(profiel.id, { model: e.target.value });
            }}
          >
            <option value="">{t("kiesModel")}</option>
            {modellenLijst.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
        <input
          type="text"
          aria-label={t("model")}
          value={profiel.model}
          spellCheck={false}
          onChange={(e) => void werkProfielBij(profiel.id, { model: e.target.value })}
        />
        {modellenLijst.length > 0 && (
          <div className="ai-hint">{t("modellenAantal", { count: modellenLijst.length })}</div>
        )}
        {modellenFout && <div className="ai-oauth-fout">{modellenFout}</div>}
      </div>

      <label className="ai-veld">
        <span>{t("authModus")}</span>
        <select
          value={profiel.authModus}
          onChange={(e) => void werkProfielBij(profiel.id, { authModus: e.target.value as AiAuthModus })}
        >
          <option value="apikey">{t("authApiKey")}</option>
          <option value="oauth">{t("authOAuth")}</option>
          <option value="none">{t("authGeen")}</option>
        </select>
      </label>

      {profiel.authModus === "apikey" && (
        <>
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
        </>
      )}

      {profiel.authModus === "oauth" && <OAuthSectie profiel={profiel} />}

      {profiel.authModus === "none" && <div className="ai-hint">{t("authGeenHint")}</div>}

      {!profiel.ingebouwd && (
        <details className="ai-details">
          <summary>{t("extraKoppen")}</summary>
          <div className="ai-details-inhoud">
            <textarea
              className="ai-koppen-invoer"
              rows={2}
              value={koppenTekst}
              spellCheck={false}
              aria-label={t("extraKoppen")}
              onChange={(e) => {
                const v = e.target.value;
                setKoppenTekst(v);
                void werkProfielBij(profiel.id, { extraKoppen: leesKoppen(v) });
              }}
            />
          </div>
        </details>
      )}
    </div>
  );
}

export default function AiPaneel() {
  const { t } = useTranslation("ai");
  const open = useAiStore((s) => s.open);
  const geladen = useAiStore((s) => s.geladen);
  const beschikbaar = useAiStore((s) => s.beschikbaar);
  const actiefId = useAiStore((s) => s.actiefId);
  const profielen = useAiStore((s) => s.profielen);
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

  const actiefProfiel = profielen.find((p) => p.id === actiefId) ?? profielen[0];

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
        <div className="ai-kop-links">
          <span className="ai-titel">{t("titel")}</span>
          {actiefProfiel && (
            <span className="ai-kop-profiel" title={actiefProfiel.model}>
              {actiefProfiel.naam}
            </span>
          )}
        </div>
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
