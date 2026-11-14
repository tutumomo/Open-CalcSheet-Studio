/**
 * Profielen, sjablonen en OAuth-voorinstellingen voor de AI-zijbalk:
 *   - 3 standaardprofielen (Anthropic, OpenAI/ChatGPT, Google Gemini) die zowel
 *     met een API-sleutel als met de OAuth-aanmelding van het abonnement werken
 *   - onbeperkt zelfgekozen derde-partij-modellen (DeepSeek, OpenRouter, Groq,
 *     xAI, Ollama, LM Studio, magpie, of elk OpenAI/Anthropic/Gemini-compatibel
 *     endpoint met een eigen naam, model, kopregels en aanmelding)
 *   - per profiel keuze uit API-sleutel, OAuth 2.0 (PKCE) of geen aanmelding.
 *
 * De OAuth-gegevens van de drie standaardprofielen zijn de publieke CLI-clients
 * (RFC 8252 §8.5, installed app): een client_id is geen geheim, het
 * client_secret van Google staat in `ai.rs` en wordt daar automatisch gebruikt.
 * De afwijkende onderdelen per aanbieder (callback-pad, token-formaat,
 * `state`-regel, extra parameters) staan in `AiOAuthConfig` en worden door
 * `ai.rs` gevolgd.
 *
 * Puur TypeScript zonder React/Tauri-afhankelijkheid, zodat Node het rechtstreeks
 * kan toetsen in `scripts/check-ai-agent.mjs`.
 */
import type {
  AiAanbieder,
  AiAuthModus,
  AiOAuthSoort,
  AiProfielAuthStatus,
  AiTokenFormaat,
} from "../../tauri/ai.ts";

export interface AiOAuthConfig {
  soort: AiOAuthSoort;
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  scopes: string;
  callbackPort?: number;
  /** Callback-pad (`/callback`, `/auth/callback`, `/oauth2callback`). */
  callbackPath?: string;
  /** Hostnaam in de redirect-URI: `localhost` of `127.0.0.1`. */
  redirectHost?: string;
  /** `json` voor Anthropic, anders `form`. */
  tokenFormat?: AiTokenFormaat;
  /** Anthropic: `state` is de PKCE-verifier zelf. */
  stateIsVerifier?: boolean;
  /** Gehoste copy-code redirect; zonder lokale listener (Anthropic). */
  copyCodeRedirectUri?: string;
  /** Biedt de Device Code-flow aan (ChatGPT/Codex). */
  deviceCode?: boolean;
  extraParams?: Record<string, string>;
}

export interface AiProfiel {
  id: string;
  naam: string;
  /** Wire-protocol naar het endpoint (`anthropic`, `openai` of `gemini`). */
  aanbieder: AiAanbieder;
  endpoint: string;
  model: string;
  authModus: AiAuthModus;
  oauth?: AiOAuthConfig;
  /** Extra HTTP-kopregels (bijv. `HTTP-Referer` bij OpenRouter). */
  extraKoppen?: Record<string, string>;
  /** GCP-project voor Gemini Code Assist (Workspace-accounts). */
  projectId?: string;
  ingebouwd?: boolean;
}

export interface AiProfielSjabloon {
  id: string;
  naam: string;
  aanbieder: AiAanbieder;
  endpoint: string;
  model: string;
  authModus: AiAuthModus;
  oauth?: AiOAuthConfig;
  extraKoppen?: Record<string, string>;
}

export interface AiOAuthSjabloon {
  id: string;
  naam: string;
  config: AiOAuthConfig;
}

/** De OAuth-client van de Codex CLI (ChatGPT Plus/Pro-abonnement). */
export const OPENAI_OAUTH: AiOAuthConfig = {
  soort: "pkce",
  authUrl: "https://auth.openai.com/oauth/authorize",
  tokenUrl: "https://auth.openai.com/oauth/token",
  clientId: "app_EMoamEEZ73f0CkXaXp7hrann",
  scopes: "openid profile email offline_access",
  callbackPort: 1455,
  callbackPath: "/auth/callback",
  redirectHost: "localhost",
  tokenFormat: "form",
  deviceCode: true,
  extraParams: {
    id_token_add_organizations: "true",
    codex_cli_simplified_flow: "true",
    originator: "ocss",
  },
};

const BUILD_GEMINI_CLIENT_ID =
  (import.meta as { env?: Record<string, string | undefined> }).env?.VITE_GEMINI_OAUTH_CLIENT_ID ??
  "";

/** De OAuth-client voor Google / Gemini (Code Assist): eigen Desktop OAuth-client-id invullen of via build-env meegeven. */
export const GEMINI_OAUTH: AiOAuthConfig = {
  soort: "pkce",
  authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
  tokenUrl: "https://oauth2.googleapis.com/token",
  clientId: BUILD_GEMINI_CLIENT_ID,
  scopes:
    "https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
  callbackPath: "/oauth2callback",
  redirectHost: "127.0.0.1",
  tokenFormat: "form",
  extraParams: { access_type: "offline", prompt: "consent" },
};

const OPENROUTER_OAUTH: AiOAuthConfig = {
  soort: "openrouter",
  authUrl: "https://openrouter.ai/auth",
  tokenUrl: "https://openrouter.ai/api/v1/auth/keys",
  clientId: "",
  scopes: "",
};

export const OAUTH_SJABLONEN: AiOAuthSjabloon[] = [
  { id: "openai", naam: "ChatGPT (Codex, Plus/Pro)", config: OPENAI_OAUTH },
  { id: "google", naam: "Google / Gemini (Code Assist)", config: GEMINI_OAUTH },
  { id: "openrouter", naam: "OpenRouter (OAuth PKCE)", config: OPENROUTER_OAUTH },
  {
    id: "github",
    naam: "GitHub (OAuth 2.0 PKCE)",
    config: {
      soort: "pkce",
      authUrl: "https://github.com/login/oauth/authorize",
      tokenUrl: "https://github.com/login/oauth/access_token",
      clientId: "",
      scopes: "read:user",
    },
  },
  {
    id: "custom",
    naam: "Custom OAuth 2.0 (PKCE)",
    config: {
      soort: "pkce",
      authUrl: "",
      tokenUrl: "",
      clientId: "",
      scopes: "openid profile",
    },
  },
];

const oauthVan = (config: AiOAuthConfig): AiOAuthConfig => ({
  ...config,
  ...(config.extraParams ? { extraParams: { ...config.extraParams } } : {}),
});

export const STANDAARD_PROFIELEN: AiProfiel[] = [
  {
    id: "anthropic",
    naam: "Anthropic (Claude)",
    aanbieder: "anthropic",
    endpoint: "https://api.anthropic.com",
    model: "claude-sonnet-5-5",
    authModus: "apikey",
    ingebouwd: true,
  },
  {
    id: "openai",
    naam: "OpenAI (ChatGPT)",
    aanbieder: "openai",
    endpoint: "https://api.openai.com",
    model: "gpt-5",
    authModus: "apikey",
    oauth: oauthVan(OPENAI_OAUTH),
    ingebouwd: true,
  },
  {
    id: "gemini",
    naam: "Google Gemini",
    aanbieder: "gemini",
    endpoint: "https://generativelanguage.googleapis.com",
    model: "gemini-2.5-pro",
    authModus: "apikey",
    oauth: oauthVan(GEMINI_OAUTH),
    ingebouwd: true,
  },
];

/** Kant-en-klare sjablonen voor het toevoegen van een derde-partij-model. */
export const AI_SJABLONEN: AiProfielSjabloon[] = [
  {
    id: "custom-openai",
    naam: "Custom OpenAI-compatible",
    aanbieder: "openai",
    endpoint: "https://api.example.com/v1",
    model: "",
    authModus: "apikey",
  },
  {
    id: "openrouter",
    naam: "OpenRouter",
    aanbieder: "openai",
    endpoint: "https://openrouter.ai/api/v1",
    model: "anthropic/claude-sonnet-4",
    authModus: "oauth",
    oauth: oauthVan(OPENROUTER_OAUTH),
  },
  {
    id: "deepseek",
    naam: "DeepSeek",
    aanbieder: "openai",
    endpoint: "https://api.deepseek.com",
    model: "deepseek-chat",
    authModus: "apikey",
  },
  {
    id: "groq",
    naam: "Groq",
    aanbieder: "openai",
    endpoint: "https://api.groq.com/openai/v1",
    model: "llama-3.3-70b-versatile",
    authModus: "apikey",
  },
  {
    id: "xai",
    naam: "xAI (Grok)",
    aanbieder: "openai",
    endpoint: "https://api.x.ai/v1",
    model: "grok-3",
    authModus: "apikey",
  },
  {
    id: "mistral",
    naam: "Mistral",
    aanbieder: "openai",
    endpoint: "https://api.mistral.ai/v1",
    model: "mistral-large-latest",
    authModus: "apikey",
  },
  {
    id: "zhipu",
    naam: "智譜 GLM (BigModel)",
    aanbieder: "openai",
    endpoint: "https://open.bigmodel.cn/api/paas/v4",
    model: "glm-4-plus",
    authModus: "apikey",
  },
  {
    id: "moonshot",
    naam: "Moonshot Kimi",
    aanbieder: "openai",
    endpoint: "https://api.moonshot.cn/v1",
    model: "moonshot-v1-128k",
    authModus: "apikey",
  },
  {
    id: "ollama",
    naam: "Ollama (local)",
    aanbieder: "openai",
    endpoint: "http://127.0.0.1:11434/v1",
    model: "qwen2.5:14b",
    authModus: "none",
  },
  {
    id: "lmstudio",
    naam: "LM Studio (local)",
    aanbieder: "openai",
    endpoint: "http://127.0.0.1:1234/v1",
    model: "local-model",
    authModus: "none",
  },
  {
    id: "magpie",
    naam: "magpie (local)",
    aanbieder: "openai",
    endpoint: "http://127.0.0.1:3425",
    model: "default",
    authModus: "none",
  },
  {
    id: "custom-anthropic",
    naam: "Custom Anthropic-compatible",
    aanbieder: "anthropic",
    endpoint: "https://api.anthropic.com",
    model: "claude-sonnet-5-5",
    authModus: "apikey",
  },
  {
    id: "custom-gemini",
    naam: "Custom Gemini-compatible",
    aanbieder: "gemini",
    endpoint: "https://generativelanguage.googleapis.com",
    model: "gemini-2.5-pro",
    authModus: "apikey",
    oauth: oauthVan(GEMINI_OAUTH),
  },
];

const GELDIGE_AANBIEDERS = new Set<AiAanbieder>(["anthropic", "openai", "gemini"]);
const GELDIGE_AUTH = new Set<AiAuthModus>(["apikey", "oauth", "none"]);

/** Maakt een veilig profiel-id (`[a-z0-9][a-z0-9_-]{0,63}`) dat niet botst met bestaande id's. */
export function maakProfielId(naam: string, bestaandeIds: string[]): string {
  const bezet = new Set(bestaandeIds.map((s) => s.toLowerCase()));
  let basis = naam
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^[^a-z0-9]+/, "")
    .replace(/-+/g, "-")
    .replace(/-+$/, "");
  if (basis === "") basis = "custom";
  basis = basis.slice(0, 56);
  if (!bezet.has(basis)) return basis;
  let n = 2;
  while (bezet.has(`${basis}-${n}`)) n++;
  return `${basis}-${n}`.slice(0, 64);
}

function kloonProfiel(p: AiProfiel): AiProfiel {
  return {
    ...p,
    ...(p.oauth ? { oauth: oauthVan(p.oauth) } : {}),
    ...(p.extraKoppen ? { extraKoppen: { ...p.extraKoppen } } : {}),
  };
}

function normaliseerOAuth(rauw: unknown): AiOAuthConfig | undefined {
  if (!rauw || typeof rauw !== "object") return undefined;
  const o = rauw as Record<string, unknown>;
  const soort: AiOAuthSoort = o.soort === "openrouter" ? "openrouter" : "pkce";
  const tekst = (k: string): string | undefined =>
    typeof o[k] === "string" && (o[k] as string).trim() !== "" ? (o[k] as string) : undefined;
  const callbackPort = typeof o.callbackPort === "number" && Number.isInteger(o.callbackPort) && o.callbackPort > 0 && o.callbackPort <= 65535
    ? o.callbackPort
    : undefined;
  const callbackPath = tekst("callbackPath");
  const redirectHost = tekst("redirectHost");
  const tokenFormat: AiTokenFormaat | undefined = o.tokenFormat === "json" ? "json" : o.tokenFormat === "form" ? "form" : undefined;
  const copyCodeRedirectUri = tekst("copyCodeRedirectUri");
  const extraParams = o.extraParams && typeof o.extraParams === "object"
    ? Object.fromEntries(
        Object.entries(o.extraParams as Record<string, unknown>)
          .filter(([, v]) => typeof v === "string")
          .map(([k, v]) => [k, v as string]),
      )
    : undefined;
  return {
    soort,
    authUrl: typeof o.authUrl === "string" ? o.authUrl : "",
    tokenUrl: typeof o.tokenUrl === "string" ? o.tokenUrl : "",
    clientId: typeof o.clientId === "string" ? o.clientId : "",
    scopes: typeof o.scopes === "string" ? o.scopes : "",
    ...(callbackPort !== undefined ? { callbackPort } : {}),
    ...(callbackPath !== undefined ? { callbackPath } : {}),
    ...(redirectHost !== undefined ? { redirectHost } : {}),
    ...(tokenFormat !== undefined ? { tokenFormat } : {}),
    ...(o.stateIsVerifier === true ? { stateIsVerifier: true } : {}),
    ...(copyCodeRedirectUri !== undefined ? { copyCodeRedirectUri } : {}),
    ...(o.deviceCode === true ? { deviceCode: true } : {}),
    ...(extraParams && Object.keys(extraParams).length > 0 ? { extraParams } : {}),
  };
}

function normaliseerKoppen(rauw: unknown): Record<string, string> | undefined {
  if (!rauw || typeof rauw !== "object") return undefined;
  const paren = Object.entries(rauw as Record<string, unknown>)
    .filter(([, v]) => typeof v === "string")
    .map(([k, v]) => [k.trim(), (v as string).trim()] as const)
    .filter(([k, v]) => k !== "" && v !== "");
  return paren.length > 0 ? Object.fromEntries(paren) : undefined;
}

/** `Key: Value` per regel, zoals de tekstvakken in de zijbalk het aanbieden. */
export function leesKoppen(tekst: string): Record<string, string> | undefined {
  const uit: Record<string, string> = {};
  for (const regel of tekst.split(/\r?\n/)) {
    const i = regel.indexOf(":");
    if (i <= 0) continue;
    const naam = regel.slice(0, i).trim();
    const waarde = regel.slice(i + 1).trim();
    if (naam !== "" && waarde !== "") uit[naam] = waarde;
  }
  return Object.keys(uit).length > 0 ? uit : undefined;
}

/** En andersom, voor het tekstvak. */
export function schrijfKoppen(koppen?: Record<string, string>): string {
  if (!koppen) return "";
  return Object.entries(koppen)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n");
}

/**
 * Zet zowel het oude formaat (`{ aanbieder, endpoint, model }`) als het nieuwe
 * formaat (`{ actiefId, profielen }`) om naar een geldige profielenlijst.
 *
 * Profielen van vóór deze versie hebben nog geen OAuth-configuratie bij
 * `anthropic`/`openai` en een lege `clientId` bij `gemini`; die worden aangevuld
 * met de ingebouwde CLI-clients, zodat OAuth meteen werkt. Een zelf ingevulde
 * clientId blijft staan.
 */
export function migreerInstellingen(bewaard: unknown): { actiefId: string; profielen: AiProfiel[] } {
  const standaard = STANDAARD_PROFIELEN.map(kloonProfiel);
  if (!bewaard || typeof bewaard !== "object") {
    return { actiefId: "anthropic", profielen: standaard };
  }
  const obj = bewaard as Record<string, unknown>;
  if (Array.isArray(obj.profielen) && obj.profielen.length > 0) {
    const lijst: AiProfiel[] = [];
    const gezien = new Set<string>();
    for (const item of obj.profielen) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      const aanbieder: AiAanbieder = GELDIGE_AANBIEDERS.has(r.aanbieder as AiAanbieder)
        ? (r.aanbieder as AiAanbieder)
        : "openai";
      const id = typeof r.id === "string" && /^[a-z0-9][a-z0-9_-]{0,63}$/.test(r.id) && !gezien.has(r.id)
        ? r.id
        : maakProfielId(typeof r.naam === "string" ? r.naam : aanbieder, [...gezien]);
      gezien.add(id);
      const authModus: AiAuthModus = GELDIGE_AUTH.has(r.authModus as AiAuthModus)
        ? (r.authModus as AiAuthModus)
        : "apikey";
      const oauth = normaliseerOAuth(r.oauth);
      const koppen = normaliseerKoppen(r.extraKoppen);
      const ingebouwd = r.ingebouwd === true;
      lijst.push({
        id,
        naam: typeof r.naam === "string" && r.naam.trim() !== "" ? r.naam : id,
        aanbieder,
        endpoint: typeof r.endpoint === "string" ? r.endpoint : "",
        model: typeof r.model === "string" ? r.model : "",
        authModus,
        ...(oauth ? { oauth } : {}),
        ...(koppen ? { extraKoppen: koppen } : {}),
        ...(typeof r.projectId === "string" && r.projectId.trim() !== ""
          ? { projectId: r.projectId.trim() }
          : {}),
        ...(ingebouwd ? { ingebouwd: true } : {}),
      });
    }
    if (lijst.length > 0) {
      const hersteld = lijst.map(vulOAuthAan);
      const actiefId = typeof obj.actiefId === "string" && hersteld.some((p) => p.id === obj.actiefId)
        ? obj.actiefId
        : hersteld[0].id;
      return { actiefId, profielen: hersteld };
    }
  }

  // Oude vorm `{ aanbieder, endpoint, model }`: waarden overnemen in het bijpassende basisprofiel.
  const oudAanbieder = GELDIGE_AANBIEDERS.has(obj.aanbieder as AiAanbieder)
    ? (obj.aanbieder as AiAanbieder)
    : "anthropic";
  const doel = standaard.find((p) => p.id === oudAanbieder);
  if (doel) {
    if (typeof obj.endpoint === "string" && obj.endpoint.trim() !== "") doel.endpoint = obj.endpoint;
    if (typeof obj.model === "string" && obj.model.trim() !== "") doel.model = obj.model;
  }
  return { actiefId: oudAanbieder, profielen: standaard };
}

/** De ingebouwde OAuth-client per aanbieder, voor profielen van vóór deze versie. */
const INGEBOUWDE_OAUTH: Partial<Record<AiAanbieder, AiOAuthConfig>> = {
  openai: OPENAI_OAUTH,
  gemini: GEMINI_OAUTH,
};

/**
 * Vult ontbrekende OAuth-gegevens aan met de ingebouwde CLI-client. Alleen bij
 * een lege clientId of een ontbrekende configuratie; eigen waarden blijven staan.
 */
export function vulOAuthAan(profiel: AiProfiel): AiProfiel {
  if (!profiel.ingebouwd) return profiel;
  const standaard = INGEBOUWDE_OAUTH[profiel.aanbieder];
  if (!standaard || profiel.id !== profiel.aanbieder) return profiel;
  if (!profiel.oauth) return { ...profiel, oauth: oauthVan(standaard) };
  const cur = profiel.oauth;
  return {
    ...profiel,
    oauth: oauthVan({
      ...standaard,
      ...cur,
      authUrl: cur.authUrl.trim() !== "" ? cur.authUrl : standaard.authUrl,
      tokenUrl: cur.tokenUrl.trim() !== "" ? cur.tokenUrl : standaard.tokenUrl,
      clientId: cur.clientId.trim() !== "" ? cur.clientId : standaard.clientId,
      scopes: cur.scopes.trim() !== "" ? cur.scopes : standaard.scopes,
      callbackPath: cur.callbackPath ?? standaard.callbackPath,
      redirectHost: cur.redirectHost ?? standaard.redirectHost,
      tokenFormat: cur.tokenFormat ?? standaard.tokenFormat,
      callbackPort: cur.callbackPort ?? standaard.callbackPort,
      deviceCode: cur.deviceCode ?? standaard.deviceCode,
      extraParams: cur.extraParams ?? standaard.extraParams,
    }),
  };
}

export function isLokaalEndpoint(endpoint: string): boolean {
  try {
    const u = new URL(endpoint.trim());
    return u.hostname === "localhost" || u.hostname === "127.0.0.1" || u.hostname === "::1" || u.hostname === "[::1]";
  } catch {
    return false;
  }
}

export function isProfielKlaar(
  profiel: AiProfiel,
  status?: AiProfielAuthStatus,
): { klaar: boolean; reden?: "geenSleutel" | "geenOAuth" | "oauthVerlopen" } {
  if (profiel.authModus === "none") return { klaar: true };
  if (profiel.authModus === "oauth") {
    if (!status?.heeft_oauth) return { klaar: false, reden: "geenOAuth" };
    if (status.oauth_verlopen && !status.oauth_heeft_refresh) return { klaar: false, reden: "oauthVerlopen" };
    return { klaar: true };
  }
  if (status?.heeft_sleutel || isLokaalEndpoint(profiel.endpoint)) return { klaar: true };
  return { klaar: false, reden: "geenSleutel" };
}

/** Heeft dit profiel naast de API-sleutel ook een OAuth-aanmelding van het abonnement? */
export function heeftOAuth(profiel: AiProfiel): boolean {
  return profiel.oauth !== undefined && profiel.oauth.authUrl.trim() !== "" && profiel.oauth.tokenUrl.trim() !== "";
}

/** De redirect-URI die `ai.rs` voor dit profiel gaat gebruiken (voor de uitleg in de UI). */
export function verwachteRedirectUri(oauth: AiOAuthConfig, poort?: number): string {
  if (oauth.copyCodeRedirectUri && poort === undefined && oauth.callbackPort === undefined) {
    return oauth.copyCodeRedirectUri;
  }
  const host = oauth.redirectHost === "localhost" ? "localhost" : "127.0.0.1";
  const pad = oauth.callbackPath && oauth.callbackPath.startsWith("/") ? oauth.callbackPath : "/oauth/callback";
  return `http://${host}:${poort ?? oauth.callbackPort ?? 0}${pad}`;
}
