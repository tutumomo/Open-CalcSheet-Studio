/**
 * De catalogus achter "新增供應商".
 *
 * De lijst is overgenomen uit Cindy (`makecindy/cindy`,
 * `packages/model-providers/catalog/providers.json`, versie 3): dezelfde 36
 * presets, dezelfde id's, namen, Chinese namen, documentatie-URL's, basis-URL's
 * en aangeraden modellen. Daarbovenop staan de vermeldingen die Cindy zelf niet
 * heeft maar die deze app nodig heeft: Anthropic, OpenAI (losse sleutel), Groq,
 * xAI, Mistral, een lokale Ollama, en de drie eigen-endpoint-vermeldingen.
 *
 * Eén verschil is bewust: Cindy kent `openai-chat` en `openai-responses` als
 * aparte protocollen. Deze app heeft er twee plus Anthropic en Gemini, en de
 * Responses-API alleen achter de Codex-abonnementsaanmelding. Presets met
 * `openai-responses` gaan hier dus over de OpenAI-compatibele chatroute; dat
 * werkt bij deze aanbieders omdat ze die route ook aanbieden.
 *
 * Google staat er als **Antigravity** (Cloud Code Assist, OAuth) — niet als het
 * oude Gemini-endpoint. De AI Studio-sleutelroute blijft bestaan als losse
 * vermelding, want Antigravity heeft geen API-sleutel.
 *
 * Puur TypeScript, zodat `check-ai-agent.mjs` het rechtstreeks kan toetsen.
 */
import type { AiAanbieder, AiAuthModus, AiLokaleBron } from "../../tauri/ai.ts";
import { ANTIGRAVITY_OAUTH, OPENAI_OAUTH, OPENROUTER_OAUTH, type AiOAuthConfig } from "./profielen.ts";

export type LeverancierGroep = "abonnement" | "sleutel" | "lokaal" | "eigen";

export interface Leverancier {
  /** Stabiel id, gelijk aan Cindy's preset-id waar die bestaat. */
  id: string;
  naam: string;
  /** Chinese naam zoals Cindy die meelevert; de wizard toont hem bij zh-TW. */
  naamZh?: string;
  groep: LeverancierGroep;
  aanbieder: AiAanbieder;
  endpoint: string;
  /** Aangeraden modellen; ook de terugval als de modellenlijst niet lukt. */
  modellen: string[];
  authModus: AiAuthModus;
  oauth?: AiOAuthConfig;
  /** Officiële documentatie of de pagina waar de sleutel vandaan komt. */
  sleutelUrl?: string;
  /** Het endpoint bevat een invulveld (bijv. Sub2API) en moet worden aangevuld. */
  eindpuntInvullen?: boolean;
  extraKoppen?: Record<string, string>;
}

/** Een lokaal gevonden bron, zoals `ai_detecteer_lokaal` die teruggeeft. */
export type LokaleBron = AiLokaleBron;

const kloon = (config: AiOAuthConfig): AiOAuthConfig => ({
  ...config,
  ...(config.extraParams ? { extraParams: { ...config.extraParams } } : {}),
});

/** Kortheidshulp: een OpenAI-compatibele aanbieder met sleutel. */
function sleutel(
  id: string,
  naam: string,
  endpoint: string,
  modellen: string[],
  sleutelUrl: string,
  naamZh?: string,
): Leverancier {
  return { id, naam, naamZh, groep: "sleutel", aanbieder: "openai", endpoint, modellen, authModus: "apikey", sleutelUrl };
}

export const LEVERANCIERS: Leverancier[] = [
  // ── Abonnement: inloggen, geen sleutel ────────────────────────────────
  {
    id: "antigravity",
    naam: "Google Antigravity",
    groep: "abonnement",
    aanbieder: "gemini",
    endpoint: "https://cloudcode-pa.googleapis.com",
    modellen: ["gemini-3-pro-preview", "gemini-3-flash-preview", "gemini-2.5-pro"],
    authModus: "oauth",
    oauth: kloon(ANTIGRAVITY_OAUTH),
    sleutelUrl: "https://antigravity.google",
  },
  {
    id: "openai",
    naam: "ChatGPT Plus / Pro",
    groep: "abonnement",
    aanbieder: "openai",
    endpoint: "https://api.openai.com",
    modellen: ["gpt-5", "gpt-5-mini", "gpt-4.1", "o4-mini"],
    authModus: "oauth",
    oauth: kloon(OPENAI_OAUTH),
    sleutelUrl: "https://chatgpt.com",
  },
  {
    id: "openrouter",
    naam: "OpenRouter",
    groep: "abonnement",
    aanbieder: "openai",
    endpoint: "https://openrouter.ai/api/v1",
    modellen: [
      "z-ai/glm-5.2",
      "moonshotai/kimi-k2.6",
      "deepseek/deepseek-v4-pro",
      "qwen/qwen3.8-27b",
      "qwen/qwen3.8-flash",
    ],
    authModus: "oauth",
    oauth: kloon(OPENROUTER_OAUTH),
    sleutelUrl: "https://openrouter.ai/docs/cookbook/coding-agents/claude-code-integration",
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
    naam: "OpenAI（API 金鑰）",
    groep: "sleutel",
    aanbieder: "openai",
    endpoint: "https://api.openai.com",
    modellen: ["gpt-5", "gpt-5-mini", "gpt-4.1", "o4-mini"],
    authModus: "apikey",
    sleutelUrl: "https://platform.openai.com/api-keys",
  },
  {
    id: "google-ai-studio",
    naam: "Google Antigravity（API 金鑰）",
    groep: "sleutel",
    aanbieder: "gemini",
    endpoint: "https://generativelanguage.googleapis.com",
    modellen: ["gemini-3-pro-preview", "gemini-3-flash-preview", "gemini-2.5-flash"],
    authModus: "apikey",
    sleutelUrl: "https://aistudio.google.com/apikey",
  },
  {
    ...sleutel("sub2api", "Sub2API", "", [], "https://github.com/Wei-Shaw/sub2api"),
    eindpuntInvullen: true,
  },
  sleutel("deepseek", "DeepSeek", "https://api.deepseek.com", ["deepseek-v4-pro", "deepseek-flash"], "https://api-docs.deepseek.com/guides/anthropic_api"),
  sleutel(
    "zhipu-glm-cn",
    "智谱 GLM（中国大陆）",
    "https://open.bigmodel.cn/api/paas/v4",
    ["glm-5.3", "glm-5.3-flash", "glm-5.2", "glm-5.1"],
    "https://docs.bigmodel.cn/cn/guide/develop/claude",
    "智譜 GLM（中國大陸）",
  ),
  sleutel(
    "zhipu-glm-global",
    "Z.ai GLM (Global)",
    "https://api.z.ai/api/paas/v4",
    ["glm-5.3", "glm-5.3-flash", "glm-5.2", "glm-5.1"],
    "https://docs.z.ai/devpack/tool/claude",
  ),
  sleutel(
    "moonshot-kimi-cn",
    "Kimi (Moonshot 中国大陆)",
    "https://api.moonshot.cn/v1",
    ["kimi-k3.1-pro", "kimi-k3", "kimi-k2.7-code", "kimi-k2.6"],
    "https://platform.moonshot.cn/docs/guide/agent-support",
    "Kimi (Moonshot 中國大陸)",
  ),
  sleutel(
    "moonshot-kimi-global",
    "Kimi (Moonshot Global)",
    "https://api.moonshot.ai/v1",
    ["kimi-k3.1-pro", "kimi-k3", "kimi-k2.7-code", "kimi-k2.6"],
    "https://platform.moonshot.ai/docs/guide/agent-support",
  ),
  sleutel(
    "moonshot-kimi-code",
    "Kimi Code（编程计划包月）",
    "https://api.kimi.com/coding/v1",
    ["k3.1-pro", "k3", "kimi-for-coding"],
    "https://www.kimi.com/zh-cn/help/kimi-code/third-party-agents",
    "Kimi Code（程式設計計劃包月）",
  ),
  sleutel(
    "minimax-cn",
    "MiniMax（中国大陆）",
    "https://api.minimaxi.com/v1",
    ["MiniMax-M3.1-Flash", "MiniMax-M3", "MiniMax-M2.7"],
    "https://platform.minimaxi.com/docs/api-reference/responses-create",
    "MiniMax（中國大陸）",
  ),
  sleutel(
    "minimax-global",
    "MiniMax (Global)",
    "https://api.minimax.io/v1",
    ["MiniMax-M3.1-Flash", "MiniMax-M3", "MiniMax-M2.7"],
    "https://platform.minimax.io/docs/api-reference/responses-create",
  ),
  sleutel(
    "aliyun-bailian-coding",
    "阿里云百炼 Coding Plan（包月）",
    "https://coding.dashscope.aliyuncs.com/v1",
    ["qwen3.7-plus", "qwen3-coder-plus", "kimi-k2.5", "glm-5"],
    "https://help.aliyun.com/zh/model-studio/coding-plan",
    "阿里雲百鍊 Coding Plan（包月）",
  ),
  sleutel(
    "aliyun-bailian-token-plan-cn",
    "阿里云百炼 Token Plan（个人版）",
    "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    ["qwen3.8-max", "qwen3.8-flash", "qwen3.7-max", "deepseek-v4-pro"],
    "https://help.aliyun.com/zh/model-studio/token-plan-personal-overview",
    "阿里雲百鍊 Token Plan（個人版）",
  ),
  sleutel(
    "aliyun-bailian-token-plan-team-cn",
    "阿里云百炼 Token Plan（团队版）",
    "https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1",
    ["qwen3.8-max", "qwen3.8-flash", "qwen3.7-max", "kimi-k2.6"],
    "https://help.aliyun.com/zh/model-studio/token-plan-team-overview",
    "阿里雲百鍊 Token Plan（團隊版）",
  ),
  sleutel("longcat", "LongCat", "https://api.longcat.chat/openai/v1", ["LongCat-2.0"], "https://longcat.chat/platform/docs/zh/"),
  sleutel(
    "zhipu-coding-plan-cn",
    "智谱 GLM Coding Plan（中国大陆）",
    "https://open.bigmodel.cn/api/coding/paas/v4",
    ["glm-5.3", "glm-5.3-flash"],
    "https://docs.bigmodel.cn/cn/coding-plan/quick-start",
    "智譜 GLM Coding Plan（中國大陸）",
  ),
  sleutel(
    "zai-coding-plan-global",
    "Z.ai GLM Coding Plan (Global)",
    "https://api.z.ai/api/coding/paas/v4",
    ["glm-5.3", "glm-5.3-flash"],
    "https://docs.z.ai/devpack/overview",
  ),
  sleutel(
    "xiaomi-mimo-api-cn",
    "小米 MiMo API（按量）",
    "https://api.xiaomimimo.com/v1",
    ["mimo-v2.6-pro", "mimo-v2.6-flash"],
    "https://mimo.mi.com/docs/zh-CN/quick-start/summary/first-api-call",
  ),
  sleutel(
    "xiaomi-mimo-token-plan-cn",
    "小米 MiMo Token Plan（包月）",
    "https://token-plan-cn.xiaomimimo.com/v1",
    ["mimo-v2.6-pro", "mimo-v2.6-flash"],
    "https://mimo.mi.com/docs/zh-CN/quick-start/summary/first-api-call",
  ),
  sleutel(
    "volcengine-api",
    "火山方舟 API",
    "https://ark.cn-beijing.volces.com/api/v3",
    [],
    "https://www.volcengine.com/docs/82379/1330310",
  ),
  sleutel(
    "volcengine-agent-plan",
    "火山方舟 Agent Plan",
    "https://ark.cn-beijing.volces.com/api/plan/v3",
    ["ark-code-latest"],
    "https://docs.volcengine.com/docs/82379/2373738",
  ),
  sleutel(
    "volcengine-coding-plan",
    "火山方舟 Coding Plan",
    "https://ark.cn-beijing.volces.com/api/coding/v3",
    ["ark-code-latest"],
    "https://www.volcengine.com/docs/82379/1925114",
  ),
  sleutel(
    "tencentcloud-coding-plan",
    "腾讯云 Coding Plan",
    "https://api.lkeap.cloud.tencent.com/coding/v3",
    ["tc-code-latest", "glm-5"],
    "https://cloud.tencent.com/document/product/1823/130092",
    "騰訊雲 Coding Plan",
  ),
  sleutel(
    "siliconflow-cn",
    "硅基流动（中国大陆）",
    "https://api.siliconflow.cn/v1",
    [],
    "https://docs.siliconflow.cn/cn/userguide/quickstart",
    "矽基流動（中國大陸）",
  ),
  sleutel(
    "siliconflow-global",
    "硅基流动",
    "https://api.siliconflow.com/v1",
    [],
    "https://docs.siliconflow.com/en/userguide/quickstart",
    "矽基流動",
  ),
  sleutel(
    "opencode-go",
    "OpenCode Go",
    "https://opencode.ai/zen/go/v1",
    ["glm-5.2", "kimi-k3", "minimax-m3", "qwen3.7-plus", "deepseek-v4-pro"],
    "https://opencode.ai/docs/go/",
  ),
  sleutel(
    "vercel-ai-gateway",
    "Vercel AI Gateway",
    "https://ai-gateway.vercel.sh/v1",
    ["anthropic/claude-sonnet-4.6", "openai/gpt-5.4", "xai/grok-4.5"],
    "https://vercel.com/docs/ai-gateway/coding-agents",
  ),
  sleutel("agnes", "Agnes AI", "https://apihub.agnes-ai.com/v1", ["agnes-3.0-flash", "agnes-2.5-pro"], "https://wiki.agnes-ai.com/en/docs/overview"),
  sleutel(
    "openhubs",
    "OpenHubs",
    "https://openhubs.zhidemai.com/v1",
    ["deepseek-v4-flash", "kimi-k3.1-pro", "glm-5.3"],
    "https://openhubs.zhidemai.com/docs",
  ),
  sleutel("hinoki", "Hinoki", "https://inference.hinoki.security/v1", ["hinoki-offensive"], "https://hinoki.security"),
  sleutel("ollama-cloud", "Ollama Cloud", "https://ollama.com/v1", [], "https://docs.ollama.com/cloud"),
  sleutel("groq", "Groq", "https://api.groq.com/openai/v1", ["llama-3.3-70b-versatile"], "https://console.groq.com/keys"),
  sleutel("xai", "xAI (Grok)", "https://api.x.ai/v1", ["grok-3", "grok-3-mini"], "https://console.x.ai"),
  sleutel("mistral", "Mistral", "https://api.mistral.ai/v1", ["mistral-large-latest", "mistral-small-latest"], "https://console.mistral.ai/api-keys"),

  // ── Lokaal: modelserver op deze machine ───────────────────────────────
  {
    id: "ollama",
    naam: "Ollama",
    groep: "lokaal",
    aanbieder: "openai",
    endpoint: "http://127.0.0.1:11434/v1",
    modellen: ["qwen2.5:14b", "llama3.1:8b"],
    authModus: "none",
    sleutelUrl: "https://ollama.com/download",
  },
  {
    id: "lmstudio",
    naam: "LM Studio",
    groep: "lokaal",
    aanbieder: "openai",
    endpoint: "http://127.0.0.1:1234/v1",
    modellen: ["local-model"],
    authModus: "none",
    sleutelUrl: "https://lmstudio.ai/docs/app/api",
  },
  {
    id: "llamacpp",
    naam: "llama.cpp",
    groep: "lokaal",
    aanbieder: "openai",
    endpoint: "http://127.0.0.1:8080/v1",
    modellen: [],
    authModus: "none",
    sleutelUrl: "https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md",
  },
  {
    id: "vllm",
    naam: "vLLM",
    groep: "lokaal",
    aanbieder: "openai",
    endpoint: "http://127.0.0.1:8000/v1",
    modellen: [],
    authModus: "none",
    sleutelUrl: "https://docs.vllm.ai/en/latest/serving/openai_compatible_server.html",
  },
  {
    id: "magpie",
    naam: "Magpie",
    groep: "lokaal",
    aanbieder: "openai",
    endpoint: "http://127.0.0.1:3425/v1",
    modellen: ["default"],
    authModus: "none",
    sleutelUrl: "https://usemagpie.ai/docs/integrate",
  },
  {
    id: "litellm",
    naam: "LiteLLM Proxy",
    groep: "lokaal",
    aanbieder: "openai",
    endpoint: "http://127.0.0.1:4000/v1",
    modellen: [],
    authModus: "none",
    sleutelUrl: "https://docs.litellm.ai/docs/proxy/quick_start",
  },

  // ── Eigen endpoint: het ontsnappingsluik ──────────────────────────────
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
    naam: "Eigen Google-compatibel endpoint",
    groep: "eigen",
    aanbieder: "gemini",
    endpoint: "https://generativelanguage.googleapis.com",
    modellen: ["gemini-3-pro-preview"],
    authModus: "apikey",
  },
];

export const GROEP_VOLGORDE: LeverancierGroep[] = ["abonnement", "sleutel", "lokaal", "eigen"];

/** De i18n-sleutel van de groepskop. */
export function groepSleutel(groep: LeverancierGroep): string {
  return `leverancierGroep${groep.charAt(0).toUpperCase()}${groep.slice(1)}`;
}

/** De naam zoals de gebruiker hem leest: Chinees als de interfacetaal dat is. */
export function leverancierNaam(leverancier: Leverancier, taal: string): string {
  return taal.toLowerCase().startsWith("zh") && leverancier.naamZh ? leverancier.naamZh : leverancier.naam;
}

export function zoekLeveranciers(zoek: string): Leverancier[] {
  const q = zoek.trim().toLowerCase();
  if (q === "") return LEVERANCIERS;
  return LEVERANCIERS.filter(
    (l) =>
      l.naam.toLowerCase().includes(q) ||
      (l.naamZh ?? "").toLowerCase().includes(q) ||
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
