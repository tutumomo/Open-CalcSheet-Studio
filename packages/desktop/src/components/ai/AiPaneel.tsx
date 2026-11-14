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
import { leesKoppen, schrijfKoppen } from "./profielen.ts";
import { OAuthSectie } from "./OAuthSectie.tsx";
import { AanbiederWizard } from "./AanbiederWizard.tsx";
import {
  MCP_EXTERN_SJABLONEN,
  formatArgsTekst,
  leesEnv,
  parseArgsTekst,
  schrijfEnv,
  type McpExternServerConfig,
} from "./mcpExtern.ts";
import { voorbeeldTekst } from "./beleid.ts";
import type { AiAanbieder, AiAuthModus } from "../../tauri/ai.ts";
import type { McpTransport } from "../../tauri/mcpExtern.ts";
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

/** De velden van het actieve profiel; alleen zichtbaar als de gebruiker ze opent. */
function ProfielVelden() {
  const { t } = useTranslation("ai");
  const actiefId = useAiStore((s) => s.actiefId);
  const profielen = useAiStore((s) => s.profielen);
  const statussen = useAiStore((s) => s.statussen);
  const modellen = useAiStore((s) => s.modellen);
  const modellenBezig = useAiStore((s) => s.modellenBezig);
  const modellenFout = useAiStore((s) => s.modellenFout);
  const werkProfielBij = useAiStore((s) => s.werkProfielBij);
  const bewaarSleutel = useAiStore((s) => s.bewaarSleutel);
  const haalModellenOp = useAiStore((s) => s.haalModellenOp);

  const [sleutel, setSleutel] = useState("");
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
    <div className="ai-provider-velden">
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

/**
 * De instellingen: alleen de aanbieders die er écht zijn, met hun status en
 * hun model. Een nieuwe aanbieder komt er via de wizard; de ruwe velden van
 * een aanbieder pas als de gebruiker op "設定" klikt.
 */
function Instellingen() {
  const { t } = useTranslation("ai");
  const profielen = useAiStore((s) => s.profielen);
  const actiefId = useAiStore((s) => s.actiefId);
  const statussen = useAiStore((s) => s.statussen);
  const modellen = useAiStore((s) => s.modellen);
  const kiesProfiel = useAiStore((s) => s.kiesProfiel);
  const verwijderProfiel = useAiStore((s) => s.verwijderProfiel);
  const werkProfielBij = useAiStore((s) => s.werkProfielBij);
  const haalModellenOp = useAiStore((s) => s.haalModellenOp);
  const maxRondes = useAiStore((s) => s.maxRondes);
  const zetMaxRondes = useAiStore((s) => s.zetMaxRondes);
  const maxTokens = useAiStore((s) => s.maxTokens);
  const zetMaxTokens = useAiStore((s) => s.zetMaxTokens);

  const [wizardOpen, setWizardOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="ai-instellingen">
      <div className="ai-veld-kop">
        <span>{t("leveranciersTitel")}</span>
        <div className="ai-veld-acties">
          <button
            className="ai-knop-klein"
            aria-expanded={wizardOpen}
            onClick={() => setWizardOpen(!wizardOpen)}
          >
            {wizardOpen ? t("annuleren") : t("leverancierToevoegen")}
          </button>
        </div>
      </div>

      {wizardOpen && <AanbiederWizard onKlaar={() => setWizardOpen(false)} />}

      <div className="ai-provider-lijst">
        {profielen.map((p) => {
          const st = statussen[p.id];
          const klaar =
            p.authModus === "none" || st?.heeft_oauth === true || st?.heeft_sleutel === true;
          const lijst = modellen[p.id] ?? [];
          const keuzes = p.model !== "" && !lijst.includes(p.model) ? [p.model, ...lijst] : lijst;
          return (
            <div key={p.id} className={`ai-provider ${p.id === actiefId ? "ai-provider-actief" : ""}`}>
              <div className="ai-provider-kop">
                <button
                  className="ai-provider-naam"
                  title={p.endpoint}
                  onClick={() => void kiesProfiel(p.id)}
                >
                  {p.naam}
                </button>
                <span className={`ai-provider-status ${klaar ? "ai-provider-status-ok" : ""}`}>
                  {klaar ? t("leverancierVerbonden") : t("leverancierNietVerbonden")}
                </span>
              </div>
              <div className="ai-provider-rij">
                <select
                  aria-label={t("model")}
                  value={p.model}
                  onChange={(e) => void werkProfielBij(p.id, { model: e.target.value })}
                >
                  {keuzes.length === 0 && <option value="">{t("kiesModel")}</option>}
                  {keuzes.map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
                <button
                  className="ai-knop-klein"
                  disabled={p.endpoint.trim() === ""}
                  onClick={() => {
                    void kiesProfiel(p.id);
                    void haalModellenOp();
                  }}
                >
                  {t("haalModellen")}
                </button>
              </div>
              <div className="ai-instellingen-rij">
                <button
                  className="ai-knop-klein"
                  onClick={() => {
                    void kiesProfiel(p.id);
                    setOpenId(openId === p.id ? null : p.id);
                  }}
                >
                  {t("leverancierInstellen")}
                </button>
                {!p.ingebouwd && profielen.length > 1 && (
                  <button className="ai-knop-klein" onClick={() => void verwijderProfiel(p.id)}>
                    {t("profielVerwijderen")}
                  </button>
                )}
              </div>
              {openId === p.id && p.id === actiefId && <ProfielVelden />}
            </div>
          );
        })}
      </div>

      <div className="ai-veld">
        <div className="ai-veld-kop">
          <span>{t("maxRondes")}</span>
        </div>
        <input
          type="number"
          min={4}
          max={200}
          step={1}
          value={maxRondes}
          onChange={(e) => void zetMaxRondes(Number(e.target.value))}
        />
        <div className="ai-hint">{t("maxRondesHint")}</div>
      </div>

      <div className="ai-veld">
        <div className="ai-veld-kop">
          <span>{t("maxTokens")}</span>
        </div>
        <input
          type="number"
          min={256}
          max={64000}
          step={1024}
          value={maxTokens}
          onChange={(e) => void zetMaxTokens(Number(e.target.value))}
        />
        <div className="ai-hint">{t("maxTokensHint")}</div>
      </div>

      <div className="ai-veld">
        <div className="ai-veld-kop">
          <span>{t("maxRondes")}</span>
        </div>
        <input
          type="number"
          min={4}
          max={200}
          step={1}
          value={maxRondes}
          onChange={(e) => void zetMaxRondes(Number(e.target.value))}
        />
        <div className="ai-hint">{t("maxRondesHint")}</div>
      </div>

      <div className="ai-veld">
        <div className="ai-veld-kop">
          <span>{t("maxTokens")}</span>
        </div>
        <input
          type="number"
          min={256}
          max={64000}
          step={1024}
          value={maxTokens}
          onChange={(e) => void zetMaxTokens(Number(e.target.value))}
        />
        <div className="ai-hint">{t("maxTokensHint")}</div>
      </div>

      <ExterneMcpSectie />
    </div>
  );
}

function McpServerKaart({ srv }: { srv: McpExternServerConfig }) {
  const { t } = useTranslation("ai");
  const status = useAiStore((s) => s.mcpStatussen[srv.id]);
  const bezig = useAiStore((s) => s.mcpBezig[srv.id] === true);
  const werkMcpServerBij = useAiStore((s) => s.werkMcpServerBij);
  const verwijderMcpServer = useAiStore((s) => s.verwijderMcpServer);
  const verbindMcpServer = useAiStore((s) => s.verbindMcpServer);
  const verbreekMcpServer = useAiStore((s) => s.verbreekMcpServer);
  const bewaarMcpGeheim = useAiStore((s) => s.bewaarMcpGeheim);
  const [argsTekst, setArgsTekst] = useState(formatArgsTekst(srv.args));
  const [envTekst, setEnvTekst] = useState(schrijfEnv(srv.env));
  const [koppenTekst, setKoppenTekst] = useState(schrijfKoppen(srv.headers));
  const [geheim, setGeheim] = useState("");

  useEffect(() => {
    setArgsTekst(formatArgsTekst(srv.args));
    setEnvTekst(schrijfEnv(srv.env));
    setKoppenTekst(schrijfKoppen(srv.headers));
  }, [srv.id]);

  const verbonden = status?.verbonden === true;
  const aantalTools = status?.tools.length ?? 0;

  return (
    <div className="ai-mcp-kaart">
      <div className="ai-mcp-kop">
        <span className="ai-mcp-titel">{srv.naam}</span>
        <span className={`ai-mcp-status${verbonden ? " ai-mcp-status-ok" : ""}`}>
          {bezig
            ? t("mcpVerbindenBezig")
            : verbonden
              ? t("mcpVerbonden", { count: aantalTools })
              : t("mcpNietVerbonden")}
        </span>
      </div>

      {status?.fout && <div className="ai-oauth-fout">{status.fout}</div>}

      <div className="ai-instellingen-rij">
        {verbonden ? (
          <button className="ai-knop" disabled={bezig} onClick={() => void verbreekMcpServer(srv.id)}>
            {t("mcpVerbreken")}
          </button>
        ) : (
          <button className="ai-knop ai-knop-primair" disabled={bezig} onClick={() => void verbindMcpServer(srv.id)}>
            {t("mcpVerbinden")}
          </button>
        )}
        <button className="ai-knop" disabled={bezig} onClick={() => void verwijderMcpServer(srv.id)}>
          {t("mcpVerwijderen")}
        </button>
      </div>

      <label className="ai-mcp-check">
        <input
          type="checkbox"
          checked={srv.actief}
          onChange={(e) => void werkMcpServerBij(srv.id, { actief: e.target.checked })}
        />
        <span>{t("mcpAutoVerbind")}</span>
      </label>

      <label className="ai-veld">
        <span>{t("mcpNaam")}</span>
        <input
          type="text"
          value={srv.naam}
          onChange={(e) => void werkMcpServerBij(srv.id, { naam: e.target.value })}
        />
      </label>

      <label className="ai-veld">
        <span>{t("mcpTransport")}</span>
        <select
          value={srv.transport}
          onChange={(e) => void werkMcpServerBij(srv.id, { transport: e.target.value as McpTransport })}
        >
          <option value="stdio">{t("mcpTransportStdio")}</option>
          <option value="http">{t("mcpTransportHttp")}</option>
        </select>
      </label>

      {srv.transport === "stdio" ? (
        <>
          <label className="ai-veld">
            <span>{t("mcpCommand")}</span>
            <input
              type="text"
              value={srv.command ?? ""}
              spellCheck={false}
              onChange={(e) => void werkMcpServerBij(srv.id, { command: e.target.value })}
            />
          </label>
          <label className="ai-veld">
            <span>{t("mcpArgs")}</span>
            <input
              type="text"
              value={argsTekst}
              spellCheck={false}
              onChange={(e) => {
                const v = e.target.value;
                setArgsTekst(v);
                void werkMcpServerBij(srv.id, { args: parseArgsTekst(v) });
              }}
            />
          </label>
          <label className="ai-veld">
            <span>{t("mcpCwd")}</span>
            <input
              type="text"
              value={srv.cwd ?? ""}
              spellCheck={false}
              onChange={(e) => void werkMcpServerBij(srv.id, { cwd: e.target.value })}
            />
          </label>
          <label className="ai-veld">
            <span>{t("mcpEnv")}</span>
            <textarea
              className="ai-koppen-invoer"
              rows={2}
              value={envTekst}
              spellCheck={false}
              onChange={(e) => {
                const v = e.target.value;
                setEnvTekst(v);
                void werkMcpServerBij(srv.id, { env: leesEnv(v) });
              }}
            />
          </label>
        </>
      ) : (
        <>
          <label className="ai-veld">
            <span>{t("mcpUrl")}</span>
            <input
              type="text"
              value={srv.url ?? ""}
              spellCheck={false}
              onChange={(e) => void werkMcpServerBij(srv.id, { url: e.target.value })}
            />
          </label>
          <label className="ai-veld">
            <span>{t("mcpGeheim")}</span>
            <input
              type="password"
              value={geheim}
              spellCheck={false}
              autoComplete="off"
              onChange={(e) => setGeheim(e.target.value)}
            />
          </label>
          <div className="ai-instellingen-rij">
            <button
              className="ai-knop"
              disabled={geheim.trim() === ""}
              onClick={() => {
                void bewaarMcpGeheim(srv.id, geheim.trim());
                setGeheim("");
              }}
            >
              {t("mcpGeheimBewaren")}
            </button>
            <button
              className="ai-knop"
              disabled={!status?.heeft_geheim}
              onClick={() => {
                void bewaarMcpGeheim(srv.id, "");
                setGeheim("");
              }}
            >
              {t("mcpGeheimWissen")}
            </button>
          </div>
          {status?.heeft_geheim && <div className="ai-hint">{t("mcpGeheimBewaard")}</div>}
          <label className="ai-veld">
            <span>{t("extraKoppen")}</span>
            <textarea
              className="ai-koppen-invoer"
              rows={2}
              value={koppenTekst}
              spellCheck={false}
              onChange={(e) => {
                const v = e.target.value;
                setKoppenTekst(v);
                void werkMcpServerBij(srv.id, { headers: leesKoppen(v) });
              }}
            />
          </label>
        </>
      )}

      {verbonden && aantalTools > 0 && (
        <details className="ai-details">
          <summary>{t("mcpToolsLijst", { count: aantalTools })}</summary>
          <ul className="ai-mcp-tools">
            {status.tools.map((tool) => (
              <li key={tool.naam} title={tool.beschrijving}>
                {tool.naam}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function ExterneMcpSectie() {
  const { t } = useTranslation("ai");
  const mcpServers = useAiStore((s) => s.mcpServers);
  const voegMcpServerToe = useAiStore((s) => s.voegMcpServerToe);
  const [sjabloonId, setSjabloonId] = useState(MCP_EXTERN_SJABLONEN[0].id);

  return (
    <details className="ai-details">
      <summary>{t("mcpTitel")}</summary>
      <div className="ai-details-inhoud">
        <div className="ai-hint">{t("mcpHint")}</div>
        <div className="ai-instellingen-rij">
          <select
            aria-label={t("mcpSjabloon")}
            value={sjabloonId}
            onChange={(e) => setSjabloonId(e.target.value)}
          >
            {MCP_EXTERN_SJABLONEN.map((s) => (
              <option key={s.id} value={s.id}>{s.naam}</option>
            ))}
          </select>
          <button className="ai-knop" onClick={() => void voegMcpServerToe(sjabloonId)}>
            {t("mcpToevoegen")}
          </button>
        </div>
        {mcpServers.map((srv) => (
          <McpServerKaart key={srv.id} srv={srv} />
        ))}
      </div>
    </details>
  );
}

const BREEDTE_SLEUTEL = "aiPaneelBreedte";
const MIN_BREEDTE = 320;
const MAX_BREEDTE = 760;
const STANDAARD_BREEDTE = 384;

/** De bewaarde breedte van de zijbalk, begrensd op wat nu op het scherm past. */
function klemBreedte(px: number): number {
  const scherm = typeof window === "undefined" ? MAX_BREEDTE : window.innerWidth;
  return Math.max(MIN_BREEDTE, Math.min(Math.min(MAX_BREEDTE, Math.round(scherm * 0.6)), Math.round(px)));
}

function leesBreedte(): number {
  try {
    const waarde = Number(window.localStorage.getItem(BREEDTE_SLEUTEL));
    if (Number.isFinite(waarde) && waarde > 0) return klemBreedte(waarde);
  } catch {
    // Geen opslag (privémodus of geblokkeerd): de standaardbreedte is goed genoeg.
  }
  return STANDAARD_BREEDTE;
}

export default function AiPaneel() {
  const { t } = useTranslation("ai");
  const open = useAiStore((s) => s.open);
  const geladen = useAiStore((s) => s.geladen);
  const beschikbaar = useAiStore((s) => s.beschikbaar);
  const actiefId = useAiStore((s) => s.actiefId);
  const profielen = useAiStore((s) => s.profielen);
  const mcpStatussen = useAiStore((s) => s.mcpStatussen);
  const regels = useAiStore((s) => s.regels);
  const stappen = useAiStore((s) => s.stappen);
  const bezig = useAiStore((s) => s.bezig);
  const fout = useAiStore((s) => s.fout);
  const goedkeuring = useAiStore((s) => s.goedkeuring);
  const zetOpen = useAiStore((s) => s.zetOpen);
  const verstuur = useAiStore((s) => s.verstuur);
  const stop = useAiStore((s) => s.stop);
  const antwoord = useAiStore((s) => s.antwoord);
  const modellen = useAiStore((s) => s.modellen);
  const kiesProfiel = useAiStore((s) => s.kiesProfiel);
  const werkProfielBij = useAiStore((s) => s.werkProfielBij);
  const wisGesprek = useAiStore((s) => s.wisGesprek);
  const [tekst, setTekst] = useState("");
  const [toonInstellingen, setToonInstellingen] = useState(false);
  const [breedte, setBreedte] = useState(leesBreedte);
  const sleep = useRef<{ x: number; breedte: number } | null>(null);
  // Een Chinese/Japanse invoermethode zet de tekst pas bij de tweede Enter om:
  // zolang de samenstelling loopt, mag Enter niet verzenden.
  const samenstellen = useRef(false);
  const gesprek = useRef<HTMLDivElement>(null);

  const actiefProfiel = profielen.find((p) => p.id === actiefId) ?? profielen[0];
  // De keuzelijst in de kop: de opgehaalde modellen, met het huidige model erbij.
  const opgehaald = actiefProfiel ? (modellen[actiefProfiel.id] ?? []) : [];
  const keuzeModellen =
    actiefProfiel && actiefProfiel.model !== "" && !opgehaald.includes(actiefProfiel.model)
      ? [actiefProfiel.model, ...opgehaald]
      : opgehaald;
  const aantalExterneTools = Object.values(mcpStatussen).reduce(
    (som, st) => som + (st.verbonden ? st.tools.length : 0),
    0,
  );

  // Bij elk nieuw stuk tekst of elke stap mee naar beneden, tenzij de gebruiker
  // zelf omhoog heeft gescrold.
  useEffect(() => {
    const el = gesprek.current;
    if (!el) return;
    const onderaan = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (onderaan) el.scrollTop = el.scrollHeight;
  }, [regels, stappen]);

  // De gekozen breedte onthouden, en bij een kleiner venster weer binnen de
  // grenzen trekken zodat de werkruimte nooit helemaal dichtgedrukt wordt.
  useEffect(() => {
    try {
      window.localStorage.setItem(BREEDTE_SLEUTEL, String(breedte));
    } catch {
      // Geen opslag: de breedte geldt dan alleen voor deze sessie.
    }
  }, [breedte]);

  useEffect(() => {
    const bijMaat = () => setBreedte((huidig) => klemBreedte(huidig));
    window.addEventListener("resize", bijMaat);
    return () => window.removeEventListener("resize", bijMaat);
  }, []);

  if (!open) return null;

  const stappenBij = (ids: string[]) => stappen.filter((s) => ids.includes(s.id));
  const sleepBij = (e: React.PointerEvent<HTMLButtonElement>) => {
    const greep = sleep.current;
    if (!greep) return;
    setBreedte(klemBreedte(greep.breedte + (greep.x - e.clientX)));
  };
  const toetsBij = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const stap = e.shiftKey ? 64 : 24;
    if (e.key === "ArrowLeft") setBreedte((huidig) => klemBreedte(huidig + stap));
    else if (e.key === "ArrowRight") setBreedte((huidig) => klemBreedte(huidig - stap));
    else return;
    e.preventDefault();
  };

  return (
    <aside
      className="ai-paneel"
      aria-label={t("titel")}
      style={{ "--ai-breedte": `${breedte}px` } as React.CSSProperties}
    >
      <button
        type="button"
        className="ai-greep"
        aria-label={t("breedteAanpassen")}
        title={t("breedteAanpassen")}
        data-sleep={sleep.current ? "ja" : undefined}
        onPointerDown={(e) => {
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          sleep.current = { x: e.clientX, breedte };
        }}
        onPointerMove={sleepBij}
        onPointerUp={() => {
          sleep.current = null;
        }}
        onPointerCancel={() => {
          sleep.current = null;
        }}
        onDoubleClick={() => setBreedte(STANDAARD_BREEDTE)}
        onKeyDown={toetsBij}
      />
      <header className="ai-kop">
        <div className="ai-kop-links">
          <span className="ai-titel">{t("titel")}</span>
          {actiefProfiel && (
            <select
              className="ai-kop-profiel ai-kop-kies"
              aria-label={t("leveranciersTitel")}
              value={actiefProfiel.id}
              onChange={(e) => void kiesProfiel(e.target.value)}
            >
              {profielen.map((p) => (
                <option key={p.id} value={p.id}>{p.naam}</option>
              ))}
            </select>
          )}
          {actiefProfiel && keuzeModellen.length > 0 && (
            <select
              className="ai-kop-profiel ai-kop-kies"
              aria-label={t("model")}
              value={actiefProfiel.model}
              onChange={(e) => void werkProfielBij(actiefProfiel.id, { model: e.target.value })}
            >
              {keuzeModellen.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          )}
          {aantalExterneTools > 0 && (
            <span className="ai-kop-profiel">
              {t("mcpBadge", { count: aantalExterneTools })}
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
          onCompositionStart={() => {
            samenstellen.current = true;
          }}
          onCompositionEnd={() => {
            samenstellen.current = false;
          }}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey) return;
            // Tijdens het kiezen van een IME-kandidaat hoort Enter bij de
            // invoermethode, niet bij de assistent.
            if (samenstellen.current || e.nativeEvent.isComposing || e.nativeEvent.keyCode === 229) return;
            e.preventDefault();
            const v = tekst;
            setTekst("");
            void verstuur(v);
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
