/**
 * De aanmeldingssectie van één profiel: abonnement (OAuth), device code of
 * handmatig een token. De ruwe OAuth-velden staan bewust achter een
 * dichtgeklapt blok — de wizard regelt de normale gevallen.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useAiStore } from "../../store/aiStore.ts";
import { OAUTH_SJABLONEN, verwachteRedirectUri, type AiProfiel } from "./profielen.ts";
import type { AiOAuthSoort, AiTokenFormaat } from "../../tauri/ai.ts";

export function OAuthSectie({ profiel }: { profiel: AiProfiel }) {
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

      <details className="ai-details">
        <summary>{t("leverancierGeavanceerd")}</summary>
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
