/**
 * Profielen, sjablonen en OAuth-voorinstellingen voor de AI-zijbalk:
 *   - 3 standaardprofielen (Anthropic, OpenAI, Google Gemini)
 *   - onbeperkt zelfgekozen derde-partij-modellen (DeepSeek, OpenRouter, Groq,
 *     xAI, Ollama, LM Studio, magpie, of elk OpenAI/Anthropic/Gemini-compatibel
 *     endpoint met een eigen naam en model)
 *   - per profiel keuze uit API-sleutel, OAuth 2.0 (PKCE) of geen aanmelding.
 *
 * Puur TypeScript zonder React/Tauri-afhankelijkheid, zodat Node het rechtstreeks
 * kan toetsen in `scripts/check-ai-agent.mjs`.
 */
import type {
  AiAanbieder,
  AiAuthModus,
  AiOAuthSoort,
  AiProfielAuthStatus,
} from "../../tauri/ai.ts";

export interface AiOAuthConfig {
  soort: AiOAuthSoort;
  authUrl: string;
  tokenUrl: string;
  clientId: string;
  scopes: string;
  callbackPort?: number;
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
}

export interface AiOAuthSjabloon {
  id: string;
  naam: string;
  config: AiOAuthConfig;
}

export const OAUTH_SJABLONEN: AiOAuthSjabloon[] = [
  {
    id: "openrouter",
    naam: "OpenRouter (OAuth PKCE)",
    config: {
      soort: "openrouter",
      authUrl: "https://openrouter.ai/auth",
      tokenUrl: "https://openrouter.ai/api/v1/auth/keys",
      clientId: "",
      scopes: "",
    },
  },
  {
    id: "google",
    naam: "Google / Gemini (OAuth 2.0 PKCE)",
    config: {
      soort: "pkce",
      authUrl: "https://accounts.google.com/o/oauth2/v2/auth",
      tokenUrl: "https://oauth2.googleapis.com/token",
      clientId: "",
      scopes: "https://www.googleapis.com/auth/generative-language.retriever https://www.googleapis.com/auth/cloud-platform",
      extraParams: { access_type: "offline", prompt: "consent" },
    },
  },
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

export const STANDAARD_PROFIELEN: AiProfiel[] = [
  {
    id: "anthropic",
    naam: "Anthropic",
    aanbieder: "anthropic",
    endpoint: "https://api.anthropic.com",
    model: "claude-sonnet-5-5",
    authModus: "apikey",
    ingebouwd: true,
  },
  {
    id: "openai",
    naam: "OpenAI",
    aanbieder: "openai",
    endpoint: "https://api.openai.com",
    model: "gpt-5",
    authModus: "apikey",
    ingebouwd: true,
  },
  {
    id: "gemini",
    naam: "Google Gemini",
    aanbieder: "gemini",
    endpoint: "https://generativelanguage.googleapis.com",
    model: "gemini-2.5-pro",
    authModus: "apikey",
    oauth: { ...OAUTH_SJABLONEN[1].config, extraParams: { ...OAUTH_SJABLONEN[1].config.extraParams } },
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
    naam: "OpenRouter (OAuth / Key)",
    aanbieder: "openai",
    endpoint: "https://openrouter.ai/api/v1",
    model: "anthropic/claude-sonnet-4",
    authModus: "oauth",
    oauth: { ...OAUTH_SJABLONEN[0].config },
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
    oauth: { ...OAUTH_SJABLONEN[1].config, extraParams: { ...OAUTH_SJABLONEN[1].config.extraParams } },
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
    ...(p.oauth ? { oauth: { ...p.oauth, ...(p.oauth.extraParams ? { extraParams: { ...p.oauth.extraParams } } : {}) } } : {}),
  };
}

function normaliseerOAuth(rauw: unknown): AiOAuthConfig | undefined {
  if (!rauw || typeof rauw !== "object") return undefined;
  const o = rauw as Record<string, unknown>;
  const soort: AiOAuthSoort = o.soort === "openrouter" ? "openrouter" : "pkce";
  const callbackPort = typeof o.callbackPort === "number" && Number.isInteger(o.callbackPort) && o.callbackPort > 0 && o.callbackPort <= 65535
    ? o.callbackPort
    : undefined;
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
    ...(extraParams && Object.keys(extraParams).length > 0 ? { extraParams } : {}),
  };
}

/**
 * Zet zowel het oude formaat (`{ aanbieder, endpoint, model }`) als het nieuwe
 * formaat (`{ actiefId, profielen }`) om naar een geldige profielenlijst.
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
      lijst.push({
        id,
        naam: typeof r.naam === "string" && r.naam.trim() !== "" ? r.naam : id,
        aanbieder,
        endpoint: typeof r.endpoint === "string" ? r.endpoint : "",
        model: typeof r.model === "string" ? r.model : "",
        authModus,
        ...(oauth ? { oauth } : {}),
        ...(r.ingebouwd === true ? { ingebouwd: true } : {}),
      });
    }
    if (lijst.length > 0) {
      const actiefId = typeof obj.actiefId === "string" && lijst.some((p) => p.id === obj.actiefId)
        ? obj.actiefId
        : lijst[0].id;
      return { actiefId, profielen: lijst };
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
