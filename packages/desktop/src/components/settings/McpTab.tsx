import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { MCP_STATUSKLEUR, useMcpStatus } from "../../mcp/status";
import {
  herstartMcpBrug,
  initMcpBrug,
  isTauri,
  vernieuwMcpToken,
  zetMcpAan,
  zetMcpAlleenLezen,
  zetMcpGepauzeerd,
  zetMcpPoort,
} from "../../mcp/brug";
import {
  claudeCodeCommando,
  clientConfiguratie,
  curlVoorbeeld,
  geldigePoort,
  mcpAdres,
  openApiAdres,
  restBasis,
} from "../../mcp/koppeling";
import "./McpTab.css";

/**
 * Tab "API en AI-assistent" in Instellingen: de MCP-server en de REST-API
 * (dezelfde brug, poort en token).
 *
 * Anders dan de andere tabs werkt deze direct, buiten Opslaan en Annuleren om:
 * aan/uit, poort en token sturen een draaiende server, en die hoort niet te
 * wachten op een knop onderaan het venster. Zie docs/mcp.md.
 */
export default function McpTab() {
  const { t } = useTranslation("settings");
  const s = useMcpStatus();
  const desktop = isTauri();
  const [poortTekst, setPoortTekst] = useState(String(s.poort));
  const [tokenZichtbaar, setTokenZichtbaar] = useState(false);
  const [bevestigToken, setBevestigToken] = useState(false);
  const [gekopieerd, setGekopieerd] = useState<string | null>(null);
  const kopieerTimer = useRef<number | undefined>(undefined);

  // De instellingen zijn bij het opstarten al gelezen (useMcpBrug); voor de
  // zekerheid hier nog eens — tweede keer doet niets.
  useEffect(() => {
    void initMcpBrug();
  }, []);
  useEffect(() => setPoortTekst(String(s.poort)), [s.poort]);
  useEffect(() => () => window.clearTimeout(kopieerTimer.current), []);

  const kopieer = (sleutel: string, tekst: string) => {
    void navigator.clipboard
      ?.writeText(tekst)
      .then(() => {
        setGekopieerd(sleutel);
        window.clearTimeout(kopieerTimer.current);
        kopieerTimer.current = window.setTimeout(() => setGekopieerd(null), 1500);
      })
      .catch((e) => console.error("Kopiëren mislukt:", e));
  };
  const kopieerKnop = (sleutel: string, tekst: string) => (
    <button className="settings-btn settings-btn-secondary mcp-knop" onClick={() => kopieer(sleutel, tekst)} disabled={!tekst}>
      {gekopieerd === sleutel ? t("mcp.gekopieerd") : t("mcp.kopieer")}
    </button>
  );

  const poortGetal = Number(poortTekst);
  const poortGeldig = geldigePoort(poortGetal);
  const poortGewijzigd = poortGeldig && poortGetal !== s.poort;

  const statusTekst = (() => {
    switch (s.toestand) {
      case "live": return t("mcp.statusLive", { poort: s.poort });
      case "start": return t("mcp.statusStart");
      case "poort-bezet": return t("mcp.statusPoortBezet", { poort: s.poort });
      case "fout": return t("mcp.statusFout");
      case "niet-beschikbaar": return t("mcp.statusNietBeschikbaar");
      default: return t("mcp.statusUit");
    }
  })();

  const adres = mcpAdres(s.poort);

  return (
    <div className="mcp-tab">
      <p className="settings-description mcp-intro">{t("mcp.intro")}</p>
      {!desktop && <p className="settings-description mcp-waarschuwing">{t("mcp.alleenDesktop")}</p>}

      <div className="settings-section">
        <h3>{t("mcp.server")}</h3>
        <div className="settings-checkbox-row">
          <input
            id="mcp-aan"
            type="checkbox"
            checked={s.aan}
            disabled={!desktop || !s.geladen}
            onChange={(e) => void zetMcpAan(e.target.checked)}
          />
          <label htmlFor="mcp-aan">{t("mcp.aan")}</label>
        </div>
        <p className="settings-description mcp-uitleg">{t("mcp.aanUitleg")}</p>

        <div className="settings-row">
          <span className="settings-label">{t("mcp.status")}</span>
          <span className="mcp-status">
            <span className="mcp-bolletje" style={{ background: MCP_STATUSKLEUR[s.toestand] }} />
            <span>{statusTekst}</span>
            {desktop && s.aan && (s.toestand === "poort-bezet" || s.toestand === "fout") && (
              <button className="settings-btn settings-btn-secondary mcp-knop" onClick={() => void herstartMcpBrug()}>
                {t("mcp.opnieuw")}
              </button>
            )}
          </span>
        </div>
        {s.melding && <p className="settings-description mcp-melding">{s.melding}</p>}

        <div className="settings-row">
          <span className="settings-label">{t("mcp.poort")}</span>
          <span className="mcp-rechts">
            <input
              className="settings-input mcp-poort"
              type="number"
              min={1024}
              max={65535}
              value={poortTekst}
              disabled={!desktop}
              onChange={(e) => setPoortTekst(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && poortGewijzigd) void zetMcpPoort(poortGetal);
              }}
            />
            <button
              className="settings-btn settings-btn-secondary mcp-knop"
              disabled={!desktop || !poortGewijzigd}
              onClick={() => void zetMcpPoort(poortGetal)}
            >
              {t("mcp.toepassen")}
            </button>
          </span>
        </div>
        <p className="settings-description mcp-uitleg">
          {poortGeldig ? t("mcp.poortUitleg", { poort: s.standaard }) : t("mcp.poortOngeldig")}
        </p>

        <div className="settings-row">
          <span className="settings-label">{t("mcp.adres")}</span>
          <span className="mcp-rechts">
            <input className="settings-input mcp-veld" readOnly value={adres} />
            {kopieerKnop("adres", adres)}
          </span>
        </div>
      </div>

      <div className="settings-section">
        <h3>{t("mcp.toegang")}</h3>
        <div className="settings-row">
          <span className="settings-label">{t("mcp.token")}</span>
          <span className="mcp-rechts">
            <input className="settings-input mcp-veld" readOnly type={tokenZichtbaar ? "text" : "password"} value={s.token} />
            <button className="settings-btn settings-btn-secondary mcp-knop" onClick={() => setTokenZichtbaar((v) => !v)}>
              {tokenZichtbaar ? t("mcp.verbergen") : t("mcp.tonen")}
            </button>
            {kopieerKnop("token", s.token)}
          </span>
        </div>
        <div className="settings-row">
          <span className="settings-description">{t("mcp.nieuwTokenUitleg")}</span>
          <button
            className="settings-btn settings-btn-secondary mcp-knop"
            disabled={!desktop || !s.geladen}
            onClick={() => {
              if (!bevestigToken) {
                setBevestigToken(true);
                return;
              }
              setBevestigToken(false);
              setTokenZichtbaar(true);
              void vernieuwMcpToken();
            }}
            onBlur={() => setBevestigToken(false)}
          >
            {bevestigToken ? t("mcp.nieuwTokenBevestig") : t("mcp.nieuwToken")}
          </button>
        </div>

        <div className="settings-checkbox-row">
          <input
            id="mcp-alleen-lezen"
            type="checkbox"
            checked={s.alleenLezen}
            disabled={!desktop}
            onChange={(e) => void zetMcpAlleenLezen(e.target.checked)}
          />
          <label htmlFor="mcp-alleen-lezen">{t("mcp.alleenLezen")}</label>
        </div>
        <p className="settings-description mcp-uitleg">{t("mcp.alleenLezenUitleg")}</p>

        <div className="settings-checkbox-row">
          <input
            id="mcp-pauze"
            type="checkbox"
            checked={s.gepauzeerd}
            disabled={!desktop}
            onChange={(e) => zetMcpGepauzeerd(e.target.checked)}
          />
          <label htmlFor="mcp-pauze">{t("mcp.pauzeren")}</label>
        </div>
        <p className="settings-description mcp-uitleg">{t("mcp.pauzerenUitleg")}</p>
      </div>

      <div className="settings-section">
        <h3>{t("mcp.verbinden")}</h3>
        <p className="settings-description mcp-uitleg">{t("mcp.verbindenUitleg")}</p>
        <div className="mcp-blokkop">
          <span className="settings-label">{t("mcp.claudeCode")}</span>
          {kopieerKnop("commando", claudeCodeCommando(s.poort, s.token))}
        </div>
        <textarea className="mcp-code mcp-code-regel" readOnly rows={3} value={claudeCodeCommando(s.poort, s.token)} />
        <div className="mcp-blokkop">
          <span className="settings-label">{t("mcp.json")}</span>
          {kopieerKnop("json", clientConfiguratie(s.poort, s.token))}
        </div>
        <textarea className="mcp-code" readOnly rows={10} value={clientConfiguratie(s.poort, s.token)} />
        <p className="settings-description mcp-uitleg">{t("mcp.geheim")}</p>
      </div>

      <div className="settings-section">
        <h3>{t("mcp.rest")}</h3>
        <p className="settings-description mcp-uitleg">{t("mcp.restUitleg")}</p>
        <div className="settings-row">
          <span className="settings-label">{t("mcp.restBasis")}</span>
          <span className="mcp-rechts">
            <input className="settings-input mcp-veld" readOnly value={restBasis(s.poort)} />
            {kopieerKnop("rest", restBasis(s.poort))}
          </span>
        </div>
        <div className="settings-row">
          <span className="settings-label">{t("mcp.openapi")}</span>
          <span className="mcp-rechts">
            <input className="settings-input mcp-veld" readOnly value={openApiAdres(s.poort)} />
            {kopieerKnop("openapi", openApiAdres(s.poort))}
          </span>
        </div>
        <div className="mcp-blokkop">
          <span className="settings-label">{t("mcp.curl")}</span>
          {kopieerKnop("curl", curlVoorbeeld(s.poort, s.token))}
        </div>
        <textarea className="mcp-code mcp-code-regel" readOnly rows={3} value={curlVoorbeeld(s.poort, s.token)} />
        <p className="settings-description mcp-uitleg">{t("mcp.curlUitleg")}</p>
      </div>
    </div>
  );
}
