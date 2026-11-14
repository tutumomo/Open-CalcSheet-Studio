/**
 * De catalogus achter "新增供應商": wat een gebruiker te zien krijgt als hij
 * een model wil toevoegen, in plaats van de ruwe OAuth- en HTTP-velden.
 *
 * Vier groepen, in deze volgorde:
 *   - abonnement: inloggen met een bestaand abonnement (OAuth), geen sleutel
 *   - sleutel:    een API-sleutel van de aanbieder plakken
 *   - lokaal:     een modelserver op deze machine, zonder aanmelding
 *   - eigen:      een eigen endpoint (ontsnappingsluik, met geavanceerde
 *                 velden achter een dichtgeklapt blok)
 *
 * Elke vermelding zegt welke modellen we aanraden (terugval als `/models`
 * niets oplevert), waar de gebruiker een sleutel haalt, en of er een
 * abonnementsaanmelding is. Puur TypeScript, zodat `check-ai-agent.mjs` het
 * rechtstreeks kan toetsen.
 */
import type { AiAanbieder, AiAuthModus, AiLokaleBron } from "../../tauri/ai.ts";
import { GEMINI_OAUTH, OPENAI_OAUTH, OPENROUTER_OAUTH, type AiOAuthConfig } from "./profielen.ts";

export type LeverancierGroep = "abonnement" | "sleutel" | "lokaal" | "eigen";

export interface Leverancier {
  /** Stabiel id; voor de drie standaardaanbieders gelijk aan het profiel-id. */
  id: string;
  naam: string;
  groep: LeverancierGroep;
  aanbieder: AiAanbieder;
  endpoint: string;
  /** Aangeraden modellen; ook de terugval als de modellenlijst niet lukt. */
  modellen: string[];
  authModus: AiAuthModus;
  oauth?: AiOAuthConfig;
  /** Officiële pagina waar de gebruiker een API-sleutel haalt. */
  sleutelUrl?: string;
  extraKoppen?: Record<string, string>;
}

/** Een lokaal gevonden bron, zoals `ai_detecteer_lokaal` die teruggeeft. */
export type LokaleBron = AiLokaleBron;

const kloon = (config: AiOAuthConfig): AiOAuthConfig => ({
  ...config,
  ...(config.extraParams ? { extraParams: { ...config.extraParams } } : {}),
});

export const LEVERANCIERS: Leverancier[] = [
  // ── Abonnement ────────────────────────────────────────────────────────
  {
    id: "openai",
    naam: "ChatGPT Plus / Pro",
    groep: "abonnement",
    aanbieder: "openai",
    endpoint: "https://api.openai.com",
    modellen: ["gpt-5", "gpt-5-mini", "gpt-4.1", "o4-mini"],
    authModus: "oauth",
    oauth: kloon(OPENAI_OAUTH),
  },
  {
    id: "openrouter",
    naam: "OpenRouter",
    groep: "abonnement",
    aanbieder: "openai",
    endpoint: "https://openrouter.ai/api/v1",
    modellen: ["anthropic/claude-sonnet-4", "openai/gpt-5", "google/gemini-2.5-pro"],
    authModus: "oauth",
    oauth: kloon(OPENROUTER_OAUTH),
    sleutelUrl: "https://openrouter.ai/keys",
  },

  // ── API-sleutel ───────────────────────────────────────────────────────
  {
    id: "anthropic",
    naam: "Anthropic (Claude)",
    groep: "sleutel",
    aanbieder: "anthropic",
    endpoint: "https://api.anthropic.com",
    modellen: ["claude-sonnet-5-5", "claude-opus-5-5", "claude-haiku-5-5"],
    authModus: "apikey",
    sleutelUrl: "https://console.anthropic.com/settings/keys",
  },
  {
    id: "openai-sleutel",
    naam: "OpenAI (API-sleutel)",
    groep: "sleutel",
    aanbieder: "openai",
    endpoint: "https://api.openai.com",
    modellen: ["gpt-5", "gpt-5-mini", "gpt-4.1", "o4-mini"],
    authModus: "apikey",
    sleutelUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "gemini",
    naam: "Google Gemini",
    groep: "sleutel",
    aanbieder: "gemini",
    endpoint: "https://generativelanguage.googleapis.com",
    modellen: ["gemini-2.5-pro", "gemini-2.5-flash", "gemini-2.0-flash"],
    authModus: "apikey",
    oauth: kloon(GEMINI_OAUTH),
    sleutelUrl: "https://aistudio.google.com/apikey",
  },
  {
    id: "deepseek",
    naam: "DeepSeek",
    groep: "sleutel",
    aanbieder: "openai",
    endpoint: "https://api.deepseek.com",
    modellen: ["deepseek-chat", "deepseek-reasoner"],
    authModus: "apikey",
    sleutelUrl: "https://platform.deepseek.com/api_keys",
  },
  {
    id: "groq",
    naam: "Groq",
    groep: "sleutel",
    aanbieder: "openai",
    endpoint: "https://api.groq.com/openai/v1",
    modellen: ["llama-3.3-70b-versatile", "qwen-2.5-32b"],
    authModus: "apikey",
    sleutelUrl: "https://console.groq.com/keys",
  },
  {
    id: "xai",
    naam: "xAI (Grok)",
    groep: "sleutel",
    aanbieder: "openai",
    endpoint: "https://api.x.ai/v1",
    modellen: ["grok-3", "grok-3-mini"],
    authModus: "apikey",
    sleutelUrl: "https://console.x.ai",
  },
  {
    id: "mistral",
    naam: "Mistral",
    groep: "sleutel",
    aanbieder: "openai",
    endpoint: "https://api.mistral.ai/v1",
    modellen: ["mistral-large-latest", "mistral-small-latest"],
    authModus: "apikey",
    sleutelUrl: "https://console.mistral.ai/api-keys",
  },
  {
    id: "zhipu",
    naam: "智譜 GLM (BigModel)",
    groep: "sleutel",
    aanbieder: "openai",
    endpoint: "https://open.bigmodel.cn/api/paas/v4",
    modellen: ["glm-4-plus", "glm-4-air"],
    authModus: "apikey",
    sleutelUrl: "https://open.bigmodel.cn/usercenter/apikeys",
  },
  {
    id: "moonshot",
    naam: "Moonshot Kimi",
    groep: "sleutel",
    aanbieder: "openai",
    endpoint: "https://api.moonshot.cn/v1",
    modellen: ["moonshot-v1-128k", "moonshot-v1-32k"],
    authModus: "apikey",
    sleutelUrl: "https://platform.moonshot.cn/console/api-keys",
  },
  {
    id: "siliconflow",
    naam: "SiliconFlow",
    groep: "sleutel",
    aanbieder: "openai",
    endpoint: "https://api.siliconflow.cn/v1",
    modellen: ["deepseek-ai/DeepSeek-V3", "Qwen/Qwen2.5-72B-Instruct"],
    authModus: "apikey",
    sleutelUrl: "https://cloud.siliconflow.cn/account/ak",
  },

  // ── Lokaal ────────────────────────────────────────────────────────────
  {
    id: "ollama",
    naam: "Ollama",
    groep: "lokaal",
    aanbieder: "openai",
    endpoint: "http://127.0.0.1:11434/v1",
    modellen: ["qwen2.5:14b", "llama3.1:8b"],
    authModus: "none",
  },
  {
    id: "lmstudio",
    naam: "LM Studio",
    groep: "lokaal",
    aanbieder: "openai",
    endpoint: "http://127.0.0.1:1234/v1",
    modellen: ["local-model"],
    authModus: "none",
  },
  {
    id: "llamacpp",
    naam: "llama.cpp",
    groep: "lokaal",
    aanbieder: "openai",
    endpoint: "http://127.0.0.1:8080/v1",
    modellen: [],
    authModus: "none",
  },
  {
    id: "vllm",
    naam: "vLLM",
    groep: "lokaal",
    aanbieder: "openai",
    endpoint: "http://127.0.0.1:8000/v1",
    modellen: [],
    authModus: "none",
  },
  {
    id: "magpie",
    naam: "Magpie",
    groep: "lokaal",
    aanbieder: "openai",
    endpoint: "http://127.0.0.1:3425",
    modellen: ["default"],
    authModus: "none",
  },

  // ── Eigen endpoint ────────────────────────────────────────────────────
  {
    id: "custom-openai",
    naam: "Eigen OpenAI-compatibel endpoint",
    groep: "eigen",
    aanbieder: "openai",
    endpoint: "https://api.example.com/v1",
    modellen: [],
    authModus: "apikey",
  },
  {
    id: "custom-anthropic",
    naam: "Eigen Anthropic-compatibel endpoint",
    groep: "eigen",
    aanbieder: "anthropic",
    endpoint: "https://api.anthropic.com",
    modellen: ["claude-sonnet-5-5"],
    authModus: "apikey",
  },
  {
    id: "custom-gemini",
    naam: "Eigen Gemini-compatibel endpoint",
    groep: "eigen",
    aanbieder: "gemini",
    endpoint: "https://generativelanguage.googleapis.com",
    modellen: ["gemini-2.5-pro"],
    authModus: "apikey",
  },
];

export const GROEP_VOLGORDE: LeverancierGroep[] = ["abonnement", "sleutel", "lokaal", "eigen"];

/** De i18n-sleutel van de groepskop. */
export function groepSleutel(groep: LeverancierGroep): string {
  return `leverancierGroep${groep.charAt(0).toUpperCase()}${groep.slice(1)}`;
}

export function zoekLeveranciers(zoek: string): Leverancier[] {
  const q = zoek.trim().toLowerCase();
  if (q === "") return LEVERANCIERS;
  return LEVERANCIERS.filter(
    (l) =>
      l.naam.toLowerCase().includes(q) ||
      l.endpoint.toLowerCase().includes(q) ||
      l.modellen.some((m) => m.toLowerCase().includes(q)),
  );
}

/** Een lokaal gevonden bron omzetten naar een catalogusvermelding. */
export function leverancierUitBron(bron: LokaleBron): Leverancier {
  return {
    id: bron.id,
    naam: bron.naam,
    groep: "lokaal",
    aanbieder: (["anthropic", "openai", "gemini"].includes(bron.aanbieder)
      ? bron.aanbieder
      : "openai") as AiAanbieder,
    endpoint: bron.endpoint,
    modellen: bron.model ? [bron.model] : [],
    authModus: (["apikey", "oauth", "none"].includes(bron.auth_modus) ? bron.auth_modus : "none") as AiAuthModus,
  };
}

/**
 * De catalogusvermelding voor een bestaand profiel: gebruikt de catalogus als
 * die het profiel kent, anders een eigen-endpoint-vermelding.
 */
export function leverancierVoorProfiel(id: string, naam: string, aanbieder: AiAanbieder): Leverancier {
  return (
    LEVERANCIERS.find((l) => l.id === id) ?? {
      id,
      naam,
      groep: "eigen",
      aanbieder,
      endpoint: "",
      modellen: [],
      authModus: "apikey",
    }
  );
}
