/**
 * De stand van de AI-zijbalk (docs/OCSS_TW_開發需求規格.md, P2-15): open of
 * dicht, het gesprek, de stappen, de vraag om goedkeuring en de lijst met
 * AI-profielen (standaard aanbieders + zelf toegevoegde derde-partij-modellen,
 * met API-sleutel, OAuth 2.0 PKCE-aanmelding of zonder sleutel).
 *
 * De assistent roept dezelfde tools aan als MCP en REST, in-process:
 * `voerToolUit` uit `mcp/uitvoeren.ts` met de registry `MCP_TOOLS`. Die poort
 * regelt ook pauze en alleen-lezen, dus de schakelaar in Instellingen geldt
 * hier net zo goed.
 *
 * Sleutels, OAuth-tokens en eventuele client_secrets staan alleen in de
 * sleutelhanger van het besturingssysteem (`src-tauri/src/ai.rs`), nooit in
 * preferences.json.
 */
import { create } from "zustand";
import i18next from "../i18n/config.ts";
import { getSetting, setSetting } from "../store.ts";
import {
  aiBeschikbaar,
  listModels,
  oauthCancel,
  oauthCompleteManual,
  oauthDeviceStart,
  oauthLogin,
  oauthLogout,
  oauthZetClientSecret,
  oauthZetToken,
  profielStatus,
  stop as stopAanbieder,
  vraag as vraagAanbieder,
  zetSleutel,
  type AiAanbieder,
  type AiAuthModus,
  type AiBericht,
  type AiGereedschap,
  type AiProfielAuthStatus,
} from "../tauri/ai.ts";
import { MCP_TOOLS } from "../mcp/tools.ts";
import { voerToolUit } from "../mcp/uitvoeren.ts";
import { liveOmgeving } from "../mcp/omgeving.ts";
import { useMcpStatus } from "../mcp/status.ts";
import { MCP_SERVERNAAM } from "../mcp/koppeling.ts";
import { bouwSysteemtekst, parseBereik, type ActiefBlad, type BladKort, type LaatsteUitkomst } from "../components/ai/prompt.ts";
import { voerVraagUit, type Antwoord, type Goedkeuring, type Stap, type ToolUitkomst } from "../components/ai/agent.ts";
import { DESTRUCTIEF } from "../components/ai/beleid.ts";
import {
  AI_SJABLONEN,
  STANDAARD_PROFIELEN,
  isProfielKlaar,
  maakProfielId,
  migreerInstellingen,
  type AiOAuthConfig,
  type AiProfiel,
} from "../components/ai/profielen.ts";
import type { McpToolDef } from "../mcp/contracts.ts";

const SLEUTEL = "aiInstellingen";

export interface AiInstellingen {
  actiefId: string;
  profielen: AiProfiel[];
}

export const STANDAARD_AI: AiInstellingen = {
  actiefId: "anthropic",
  profielen: STANDAARD_PROFIELEN,
};

/** Een regel in het gesprek zoals de zijbalk hem toont. */
export interface AiRegel {
  id: string;
  rol: "user" | "assistant";
  tekst: string;
  /** De stappen die bij dit antwoord horen, in volgorde. */
  stappen: string[];
  /** Nog aan het binnenkomen. */
  loopt?: boolean;
}

export interface AiOAuthLopend {
  profiel: string;
  url?: string;
  redirectUri?: string;
  waarschuwing?: string;
  /** Device Code-aanmelding: de code die de gebruiker bij de aanbieder invoert. */
  device?: { userCode: string; verificationUrl: string; interval: number };
}

interface AiStand {
  open: boolean;
  geladen: boolean;
  beschikbaar: boolean;
  actiefId: string;
  profielen: AiProfiel[];
  /** Auth-status per profiel-id (uit de sleutelbos, nooit geheimen). */
  statussen: Record<string, AiProfielAuthStatus>;
  /** Opgehaalde modellenlijsten per profiel-id. */
  modellen: Record<string, string[]>;
  modellenBezig: boolean;
  modellenFout: string | null;
  oauthLopend: AiOAuthLopend | null;
  oauthFout: string | null;
  regels: AiRegel[];
  stappen: Stap[];
  bezig: boolean;
  /** Wat er misging bij de laatste vraag (netwerk, sleutel, OAuth, limiet). */
  fout: string | null;
  goedkeuring: Goedkeuring | null;
  /** De taal van de app, voor het antwoord van de assistent. */
  taal: string;

  zetOpen(open: boolean): void;
  laad(): Promise<void>;
  kiesProfiel(id: string): Promise<void>;
  werkProfielBij(id: string, wijziging: Partial<AiProfiel>): Promise<void>;
  werkOAuthBij(id: string, wijziging: Partial<AiOAuthConfig>): Promise<void>;
  voegProfielToe(sjabloonId: string, naam?: string): Promise<string>;
  verwijderProfiel(id: string): Promise<void>;
  bewaarSleutel(sleutel: string): Promise<void>;
  bewaarClientSecret(secret: string): Promise<void>;
  startOAuthLogin(copyCode?: boolean): Promise<void>;
  startDeviceLogin(): Promise<void>;
  rondOAuthHandmatigAf(invoer: string): Promise<void>;
  annuleerOAuth(): Promise<void>;
  logOAuthUit(): Promise<void>;
  zetHandmatigToken(accessToken: string, refreshToken?: string): Promise<void>;
  haalModellenOp(): Promise<void>;
  wisGesprek(): void;
  verstuur(tekst: string): Promise<void>;
  stop(): void;
  antwoord(antwoord: Antwoord): void;
}

let nummer = 0;
const nieuwId = (voor: string) => `${voor}-${Date.now().toString(36)}-${++nummer}`;

/** De goedkeuringen die de gebruiker deze sessie al gaf. */
const altijdToegestaan = new Set<string>();

let wachtend: ((antwoord: Antwoord) => void) | null = null;
let gestopt = false;

/** De tools zoals de aanbieder ze ziet: dezelfde registry als MCP en REST. */
export function aiGereedschap(): AiGereedschap[] {
  return MCP_TOOLS.map((t) => ({
    naam: t.name,
    beschrijving: t.description,
    schema: t.inputSchema as Record<string, unknown>,
  }));
}

const toolVan = (naam: string): McpToolDef | undefined => MCP_TOOLS.find((t) => t.name === naam);

function profielVan(actiefId: string, profielen: AiProfiel[]): AiProfiel {
  return profielen.find((p) => p.id === actiefId) ?? profielen[0] ?? STANDAARD_PROFIELEN[0];
}

async function bewaarInstellingen(actiefId: string, profielen: AiProfiel[]): Promise<void> {
  await setSetting(SLEUTEL, { actiefId, profielen });
}

function context() {
  const s = useMcpStatus.getState();
  return {
    omgeving: liveOmgeving,
    alleenLezen: s.alleenLezen,
    gepauzeerd: s.gepauzeerd,
    server: { naam: MCP_SERVERNAAM, versie: "sidebar", poort: s.poort },
  };
}

/** Het project zoals de assistent het ziet, met de laatste doorrekening van het actieve blad. */
async function bouwContext(taal: string): Promise<{ systeem: string; bereik: BladKort[] | null }> {
  const stand = liveOmgeving.stand();
  const bladen: BladKort[] = stand.exemplaren.map((b) => ({ id: b.id, naam: b.naam, templateId: b.templateId, ref: b.ref }));
  const gevonden = stand.exemplaren.find((b) => b.id === stand.activeId) ?? null;
  const actief: ActiefBlad | null = gevonden
    ? { id: gevonden.id, naam: gevonden.naam, templateId: gevonden.templateId, ref: gevonden.ref, source: gevonden.source, waarden: gevonden.waarden }
    : null;

  let uitkomst: LaatsteUitkomst | null = null;
  if (actief) {
    const tool = toolVan("sheet_evaluate");
    if (tool) {
      const r = await voerToolUit(tool, { id: actief.id }, context());
      if (r.ok) {
        const d = r.data as Record<string, unknown>;
        uitkomst = {
          titel: typeof d.title === "string" ? d.title : undefined,
          uc: (d.uc as number | string | null) ?? null,
          voldoet: typeof d.passes === "boolean" ? d.passes : null,
          check: typeof d.check === "string" ? d.check : undefined,
          warnings: Array.isArray(d.warnings) ? d.warnings.map((w) => (typeof w === "string" ? w : JSON.stringify(w))) : [],
        };
      } else if (r.error) {
        uitkomst = { titel: actief.naam, check: "unchecked", voldoet: null, uc: null, fouten: [r.error] };
      }
    }
  }

  return {
    systeem: bouwSysteemtekst({ taal, projectNaam: stand.projectNaam, bladen, actief, uitkomst }),
    bereik: null,
  };
}

export const useAiStore = create<AiStand>((set, get) => ({
  open: false,
  geladen: false,
  beschikbaar: false,
  actiefId: STANDAARD_AI.actiefId,
  profielen: STANDAARD_AI.profielen,
  statussen: {},
  modellen: {},
  modellenBezig: false,
  modellenFout: null,
  oauthLopend: null,
  oauthFout: null,
  regels: [],
  stappen: [],
  bezig: false,
  fout: null,
  goedkeuring: null,
  taal: "zh-TW",

  zetOpen(open) {
    set({ open });
    if (open) void get().laad();
  },

  async laad() {
    if (get().geladen) return;
    const bewaard = await getSetting<unknown>(SLEUTEL, null);
    const { actiefId, profielen } = migreerInstellingen(bewaard);
    const beschikbaar = await aiBeschikbaar();
    const statussen: Record<string, AiProfielAuthStatus> = {};
    if (beschikbaar) {
      for (const p of profielen) {
        statussen[p.id] = await profielStatus(p.id);
      }
    }
    set({ geladen: true, beschikbaar, actiefId, profielen, statussen });
  },

  async kiesProfiel(id) {
    const profielen = get().profielen;
    if (!profielen.some((p) => p.id === id)) return;
    set({ actiefId: id, fout: null, oauthFout: null, modellenFout: null });
    await bewaarInstellingen(id, profielen);
    if (get().beschikbaar) {
      const st = await profielStatus(id);
      set({ statussen: { ...get().statussen, [id]: st } });
    }
  },

  async werkProfielBij(id, wijziging) {
    const profielen = get().profielen.map((p) => (p.id === id ? { ...p, ...wijziging, id: p.id } : p));
    set({ profielen });
    await bewaarInstellingen(get().actiefId, profielen);
  },

  async werkOAuthBij(id, wijziging) {
    const profielen = get().profielen.map((p) => {
      if (p.id !== id) return p;
      const basis: AiOAuthConfig = p.oauth ?? {
        soort: "pkce",
        authUrl: "",
        tokenUrl: "",
        clientId: "",
        scopes: "openid profile",
      };
      return { ...p, oauth: { ...basis, ...wijziging } };
    });
    set({ profielen });
    await bewaarInstellingen(get().actiefId, profielen);
  },

  async voegProfielToe(sjabloonId, naam) {
    const sjabloon = AI_SJABLONEN.find((s) => s.id === sjabloonId) ?? AI_SJABLONEN[0];
    const bestaande = get().profielen;
    const label = naam && naam.trim() !== "" ? naam.trim() : sjabloon.naam;
    const id = maakProfielId(
      sjabloon.id.startsWith("custom-") && !naam ? "custom" : label,
      bestaande.map((p) => p.id),
    );
    const nieuw: AiProfiel = {
      id,
      naam: label,
      aanbieder: sjabloon.aanbieder as AiAanbieder,
      endpoint: sjabloon.endpoint,
      model: sjabloon.model,
      authModus: sjabloon.authModus as AiAuthModus,
      ...(sjabloon.oauth
        ? {
            oauth: {
              ...sjabloon.oauth,
              ...(sjabloon.oauth.extraParams ? { extraParams: { ...sjabloon.oauth.extraParams } } : {}),
            },
          }
        : {}),
      ...(sjabloon.extraKoppen ? { extraKoppen: { ...sjabloon.extraKoppen } } : {}),
    };
    const profielen = [...bestaande, nieuw];
    set({ profielen, actiefId: id, fout: null, oauthFout: null });
    await bewaarInstellingen(id, profielen);
    if (get().beschikbaar) {
      const st = await profielStatus(id);
      set({ statussen: { ...get().statussen, [id]: st } });
    }
    return id;
  },

  async verwijderProfiel(id) {
    const huidige = get().profielen;
    const doel = huidige.find((p) => p.id === id);
    if (!doel || doel.ingebouwd || huidige.length <= 1) return;
    if (get().beschikbaar) {
      await zetSleutel(id, "").catch(() => {});
      await oauthLogout(id).catch(() => {});
      await oauthZetClientSecret(id, "").catch(() => {});
    }
    const profielen = huidige.filter((p) => p.id !== id);
    const actiefId = get().actiefId === id ? profielen[0].id : get().actiefId;
    const statussen = { ...get().statussen };
    delete statussen[id];
    set({ profielen, actiefId, statussen });
    await bewaarInstellingen(actiefId, profielen);
  },

  async bewaarSleutel(sleutel) {
    const p = profielVan(get().actiefId, get().profielen);
    await zetSleutel(p.id, sleutel);
    const st = await profielStatus(p.id);
    set({ statussen: { ...get().statussen, [p.id]: st }, fout: null });
  },

  async bewaarClientSecret(secret) {
    const p = profielVan(get().actiefId, get().profielen);
    await oauthZetClientSecret(p.id, secret);
    const st = await profielStatus(p.id);
    set({ statussen: { ...get().statussen, [p.id]: st } });
  },

  async startOAuthLogin(copyCode) {
    const p = profielVan(get().actiefId, get().profielen);
    const oauth = p.oauth;
    if (!oauth || oauth.authUrl.trim() === "" || oauth.tokenUrl.trim() === "") {
      set({ oauthFout: i18next.t("ai:oauthConfigMist") });
      return;
    }
    if (oauth.soort === "pkce" && oauth.clientId.trim() === "") {
      set({ oauthFout: i18next.t("ai:oauthClientIdMist") });
      return;
    }
    const kopieer = copyCode === true && oauth.copyCodeRedirectUri !== undefined;
    set({ oauthLopend: { profiel: p.id }, oauthFout: null, fout: null });
    try {
      const st = await oauthLogin(
        {
          profiel: p.id,
          soort: oauth.soort,
          auth_url: oauth.authUrl.trim(),
          token_url: oauth.tokenUrl.trim(),
          client_id: oauth.clientId.trim(),
          scopes: oauth.scopes.trim(),
          ...(oauth.callbackPort ? { callback_port: oauth.callbackPort } : {}),
          ...(oauth.callbackPath ? { callback_path: oauth.callbackPath } : {}),
          ...(oauth.redirectHost ? { redirect_host: oauth.redirectHost } : {}),
          ...(oauth.tokenFormat ? { token_format: oauth.tokenFormat } : {}),
          ...(oauth.stateIsVerifier ? { state_is_verifier: true } : {}),
          ...(kopieer && oauth.copyCodeRedirectUri ? { custom_redirect_uri: oauth.copyCodeRedirectUri } : {}),
          ...(oauth.extraParams ? { extra_params: oauth.extraParams } : {}),
        },
        (g) => {
          const lopend = get().oauthLopend;
          if (!lopend || lopend.profiel !== p.id) return;
          if (g.soort === "adres") {
            set({ oauthLopend: { ...lopend, url: g.url, redirectUri: g.redirect_uri } });
          } else if (g.soort === "device") {
            set({
              oauthLopend: {
                ...lopend,
                device: { userCode: g.user_code, verificationUrl: g.verification_url, interval: g.interval },
              },
            });
          } else if (g.soort === "waarschuwing") {
            set({ oauthLopend: { ...lopend, waarschuwing: g.melding } });
          }
        },
      );
      set({ statussen: { ...get().statussen, [p.id]: st }, oauthLopend: null, oauthFout: null });
    } catch (e) {
      const melding = e instanceof Error ? e.message : String(e);
      set({ oauthLopend: null, oauthFout: melding });
    }
  },

  /** Device Code-aanmelding (ChatGPT/Codex): code intypen bij de aanbieder. */
  async startDeviceLogin() {
    const p = profielVan(get().actiefId, get().profielen);
    const clientId = p.oauth?.clientId ?? "";
    set({ oauthLopend: { profiel: p.id }, oauthFout: null, fout: null });
    try {
      const st = await oauthDeviceStart(p.id, clientId, (g) => {
        const lopend = get().oauthLopend;
        if (!lopend || lopend.profiel !== p.id) return;
        if (g.soort === "device") {
          set({
            oauthLopend: {
              ...lopend,
              device: { userCode: g.user_code, verificationUrl: g.verification_url, interval: g.interval },
            },
          });
        } else if (g.soort === "waarschuwing") {
          set({ oauthLopend: { ...lopend, waarschuwing: g.melding } });
        }
      });
      set({ statussen: { ...get().statussen, [p.id]: st }, oauthLopend: null, oauthFout: null });
    } catch (e) {
      const melding = e instanceof Error ? e.message : String(e);
      set({ oauthLopend: null, oauthFout: melding });
    }
  },

  async rondOAuthHandmatigAf(invoer) {
    const lopend = get().oauthLopend;
    if (!lopend || invoer.trim() === "") return;
    try {
      const st = await oauthCompleteManual(invoer);
      set({ statussen: { ...get().statussen, [lopend.profiel]: st }, oauthLopend: null, oauthFout: null });
    } catch (e) {
      set({ oauthFout: e instanceof Error ? e.message : String(e) });
    }
  },

  async annuleerOAuth() {
    await oauthCancel().catch(() => {});
    set({ oauthLopend: null });
  },

  async logOAuthUit() {
    const p = profielVan(get().actiefId, get().profielen);
    await oauthLogout(p.id);
    const st = await profielStatus(p.id);
    set({ statussen: { ...get().statussen, [p.id]: st } });
  },

  async zetHandmatigToken(accessToken, refreshToken) {
    const p = profielVan(get().actiefId, get().profielen);
    const st = await oauthZetToken(p.id, accessToken, refreshToken);
    set({ statussen: { ...get().statussen, [p.id]: st }, oauthFout: null, fout: null });
  },

  async haalModellenOp() {
    const p = profielVan(get().actiefId, get().profielen);
    set({ modellenBezig: true, modellenFout: null, fout: null });
    try {
      const lijst = await listModels({
        aanbieder: p.aanbieder,
        profiel: p.id,
        endpoint: p.endpoint,
        auth_modus: p.authModus,
        ...(p.extraKoppen && Object.keys(p.extraKoppen).length > 0
          ? { extra_koppen: p.extraKoppen }
          : {}),
      });
      set({ modellen: { ...get().modellen, [p.id]: lijst }, modellenBezig: false });
    } catch (e) {
      set({ modellenFout: e instanceof Error ? e.message : String(e), modellenBezig: false });
    }
  },

  wisGesprek() {
    set({ regels: [], stappen: [], fout: null });
  },

  stop() {
    gestopt = true;
    void stopAanbieder();
    wachtend?.("nee");
    wachtend = null;
    set({ goedkeuring: null });
  },

  antwoord(antwoord) {
    const w = wachtend;
    wachtend = null;
    set({ goedkeuring: null });
    w?.(antwoord);
  },

  async verstuur(tekst) {
    const vraag = tekst.trim();
    if (vraag === "" || get().bezig) return;
    const p = profielVan(get().actiefId, get().profielen);
    const taal = i18next.language || get().taal;
    const st = get().statussen[p.id];
    const check = isProfielKlaar(p, st);
    if (!check.klaar) {
      const melding =
        check.reden === "geenOAuth"
          ? i18next.t("ai:foutGeenOAuth")
          : check.reden === "oauthVerlopen"
            ? i18next.t("ai:foutOAuthVerlopen")
            : i18next.t("ai:foutGeenSleutel");
      set({ fout: melding });
      return;
    }
    if (p.endpoint.trim() === "" || p.model.trim() === "") {
      set({ fout: i18next.t("ai:foutProfielOnvolledig") });
      return;
    }
    gestopt = false;

    const gebruiker = parseBereik(vraag, liveOmgeving.stand().exemplaren.map((b) => ({ id: b.id, naam: b.naam, templateId: b.templateId, ref: b.ref })));
    const geschiedenis: AiBericht[] = get().regels
      .filter((r) => r.tekst.trim() !== "")
      .map((r) => ({ rol: r.rol, tekst: r.tekst }));

    const vraagRegel: AiRegel = { id: nieuwId("vraag"), rol: "user", tekst: vraag, stappen: [] };
    const antwoordRegel: AiRegel = { id: nieuwId("antwoord"), rol: "assistant", tekst: "", stappen: [], loopt: true };
    set({ regels: [...get().regels, vraagRegel, antwoordRegel], stappen: [], bezig: true, fout: null });

    const { systeem } = await bouwContext(taal);
    const bereik = gebruiker.bladen.length > 0 ? gebruiker.bladen : null;
    const systeemMetBereik =
      bereik === null
        ? systeem
        : `${systeem}\n\n# Scope the user named\nThe user named these sheets with @: ${bereik.map((b) => `${b.naam} (id ${b.id})`).join(", ")}. Work on those unless the question clearly needs another sheet.`;

    const werkBij = (fn: (r: AiRegel) => AiRegel) => {
      set({ regels: get().regels.map((r) => (r.id === antwoordRegel.id ? fn(r) : r)) });
    };

    try {
      const uitkomst = await voerVraagUit(
        gebruiker.vraag === "" ? vraag : gebruiker.vraag,
        geschiedenis,
        {
          aanbieder: p.aanbieder,
          profiel: p.id,
          authModus: p.authModus,
          endpoint: p.endpoint,
          model: p.model,
          ...(p.extraKoppen && Object.keys(p.extraKoppen).length > 0 ? { extraKoppen: p.extraKoppen } : {}),
          ...(p.projectId ? { projectId: p.projectId } : {}),
          systeem: systeemMetBereik,
          gereedschap: aiGereedschap(),
          kenmerk: (naam) => {
            const t = toolVan(naam);
            if (!t) return null;
            return { naam, kind: t.kind, destructief: DESTRUCTIEF.has(naam) };
          },
          huidigeInhoud: async (naam, argumenten) => {
            const id = typeof argumenten.id === "string" ? argumenten.id : null;
            if (id === null) return null;
            const blad = liveOmgeving.stand().exemplaren.find((b) => b.id === id);
            if (!blad) return null;
            if (naam === "sheet_set_source") return blad.source;
            if (naam === "sheet_set_markdown") return blad.md?.tekst ?? "";
            return null;
          },
          voerUit: async (naam, argumenten): Promise<ToolUitkomst> => {
            const tool = toolVan(naam);
            if (!tool) return { ok: false, code: "NOT_FOUND", error: `Unknown tool ${naam}` };
            const r = await voerToolUit(tool, argumenten, context());
            return r.ok ? { ok: true, data: r.data } : { ok: false, code: r.code, error: r.error, data: r.data };
          },
          vraagGoedkeuring: (verzoek) =>
            new Promise<Antwoord>((resolve) => {
              wachtend = resolve;
              set({ goedkeuring: verzoek });
            }),
          vraag: (verzoek, bij) => vraagAanbieder(verzoek, bij),
          bij: {
            tekst: (stuk) => werkBij((r) => ({ ...r, tekst: r.tekst + stuk })),
            stap: (stap) => {
              werkBij((r) => (r.stappen.includes(stap.id) ? r : { ...r, stappen: [...r.stappen, stap.id] }));
              set({ stappen: [...get().stappen.filter((s) => s.id !== stap.id), stap] });
            },
          },
        },
        altijdToegestaan,
      );

      const melding =
        uitkomst.einde === "fout"
          ? uitkomst.melding ?? "The assistant stopped with an error."
          : uitkomst.einde === "rondes"
            ? uitkomst.melding ?? null
            : null;
      werkBij((r) => ({ ...r, loopt: false, tekst: r.tekst === "" && gestopt ? "(stopped)" : r.tekst }));
      set({ fout: melding, bezig: false });
    } catch (e) {
      const melding = e instanceof Error ? e.message : String(e);
      werkBij((r) => ({ ...r, loopt: false }));
      set({ fout: melding, bezig: false });
    }
  },
}));
