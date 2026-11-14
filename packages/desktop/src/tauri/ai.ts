/**
 * De brug naar de AI-aanbieder in Rust (`src-tauri/src/ai.rs`).
 *
 * De webview kan zelf geen verzoek naar een andere host doen (CORS) en de sleutel
 * of het OAuth-token hoort niet in de webview. Daarom gaat het gesprek via Rust:
 * dit bestand stuurt één beurt (`ai_vraag`) en krijgt de gebeurtenissen van het
 * antwoord terug via een kanaal, zodat de zijbalk kan meetypen.
 *
 * Zowel API-sleutels als OAuth-tokens (en een eventueel client_secret) staan
 * alleen in de sleutelbos van het besturingssysteem (`ai_profiel_status` meldt
 * alleen booleans en verloopmoment, nooit een geheim).
 */
import { Channel, invoke } from "@tauri-apps/api/core";

/** Het wire-protocol dat `ai.rs` spreekt. Eigen derde-partij-modellen kiezen er één van. */
export type AiAanbieder = "anthropic" | "openai" | "gemini";

/** Hoe het profiel zich aanmeldt bij het endpoint. */
export type AiAuthModus = "apikey" | "oauth" | "none";

export type AiOAuthSoort = "pkce" | "openrouter";

export interface AiOproep {
  id: string;
  naam: string;
  argumenten: unknown;
}

export interface AiResultaat {
  id: string;
  naam?: string;
  inhoud: string;
  fout?: boolean;
}

/** Eén beurt in de geschiedenis; dezelfde vorm voor elke aanbieder. */
export interface AiBericht {
  rol: "user" | "assistant" | "tool";
  tekst: string;
  oproepen?: AiOproep[];
  resultaten?: AiResultaat[];
}

export interface AiGereedschap {
  naam: string;
  beschrijving: string;
  schema: unknown;
}

export interface AiVerzoek {
  aanbieder: AiAanbieder;
  /** Het profiel-id voor de sleutelbos; zonder dit veld valt het terug op `aanbieder`. */
  profiel?: string;
  auth_modus?: AiAuthModus;
  endpoint: string;
  model: string;
  systeem: string;
  berichten: AiBericht[];
  gereedschap: AiGereedschap[];
  /** Let op: de Rust-kant leest `max_tokens` (snake_case, zoals serde het veld noemt). */
  max_tokens: number;
  temperatuur?: number;
  /** Extra HTTP-kopregels voor eigen endpoints (Rust laat hop-by-hop en auth vallen). */
  extra_koppen?: Record<string, string>;
  /** GCP-project voor Gemini Code Assist (Workspace-accounts). */
  project_id?: string;
}

export type AiGebeurtenis =
  | { soort: "tekst"; tekst: string }
  | { soort: "oproep"; id: string; naam: string; argumenten: unknown }
  | { soort: "klaar"; stopreden: string; invoer: number; uitvoer: number }
  | { soort: "fout"; melding: string };

export interface AiProfielAuthStatus {
  heeft_sleutel: boolean;
  heeft_oauth: boolean;
  heeft_client_secret: boolean;
  oauth_verlopen: boolean;
  oauth_heeft_refresh: boolean;
  oauth_expires_at?: number | null;
  oauth_account?: string | null;
  /** ChatGPT-account-id uit het JWT (voor de Codex Responses API). */
  oauth_account_id?: string | null;
  /** GCP-project voor Gemini Code Assist. */
  oauth_project_id?: string | null;
}

/** Hoe de code bij het token-endpoint wordt ingewisseld: `form` (standaard) of `json` (Anthropic). */
export type AiTokenFormaat = "form" | "json";

export interface AiOAuthStartVerzoek {
  profiel: string;
  soort: AiOAuthSoort;
  auth_url: string;
  token_url: string;
  client_id: string;
  scopes: string;
  callback_port?: number;
  /** Callback-pad: `/callback` (Anthropic), `/auth/callback` (OpenAI), `/oauth2callback` (Google). */
  callback_path?: string;
  /** Hostnaam in de redirect-URI: `localhost` of `127.0.0.1`. */
  redirect_host?: string;
  token_format?: AiTokenFormaat;
  /** Vaste gehoste redirect-URI (Anthropic copy-code); slaat de lokale listener over. */
  custom_redirect_uri?: string;
  /** Anthropic: `state` moet gelijk zijn aan de PKCE-verifier. */
  state_is_verifier?: boolean;
  extra_params?: Record<string, string>;
}

export type AiOAuthGebeurtenis =
  | { soort: "adres"; url: string; redirect_uri: string }
  | { soort: "device"; user_code: string; verification_url: string; interval: number }
  | { soort: "waarschuwing"; melding: string };

export interface AiModelLijstVerzoek {
  aanbieder: AiAanbieder;
  profiel?: string;
  endpoint: string;
  auth_modus: AiAuthModus;
  extra_koppen?: Record<string, string>;
}

/** Is er een Rust-kant? In de browser (Vite-preview) niet. */
export const aiBeschikbaar = (): boolean =>
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Bewaar de API-sleutel van een profiel in de sleutelbos; leeg wist hem. */
export async function zetSleutel(profiel: string, sleutel: string): Promise<void> {
  await invoke("ai_zet_sleutel", { aanbieder: profiel, sleutel });
}

/** Staat er een API-sleutel voor dit profiel? */
export async function heeftSleutel(profiel: string): Promise<boolean> {
  if (!aiBeschikbaar()) return false;
  return invoke<boolean>("ai_heeft_sleutel", { aanbieder: profiel });
}

/** De volledige auth-status van één profiel (sleutel + OAuth + client_secret). */
export async function profielStatus(profiel: string): Promise<AiProfielAuthStatus> {
  if (!aiBeschikbaar()) {
    return {
      heeft_sleutel: false,
      heeft_oauth: false,
      heeft_client_secret: false,
      oauth_verlopen: false,
      oauth_heeft_refresh: false,
    };
  }
  return invoke<AiProfielAuthStatus>("ai_profiel_status", { profiel });
}

/** Bewaar of wis het OAuth client_secret in de sleutelbos. */
export async function oauthZetClientSecret(profiel: string, secret: string): Promise<void> {
  await invoke("ai_oauth_zet_client_secret", { profiel, secret });
}

/** Start OAuth 2.0 PKCE-login via de systeembrowser en lokale callback. */
export async function oauthLogin(
  verzoek: AiOAuthStartVerzoek,
  bij?: (gebeurtenis: AiOAuthGebeurtenis) => void,
): Promise<AiProfielAuthStatus> {
  if (!aiBeschikbaar()) throw new Error("OAuth sign-in needs the desktop app");
  const kanaal = new Channel<AiOAuthGebeurtenis>();
  if (bij) kanaal.onmessage = bij;
  return invoke<AiProfielAuthStatus>("ai_oauth_login", { verzoek, kanaal });
}

/**
 * Device Code-aanmelding (ChatGPT / OpenAI Codex): de gebruiker opent een adres,
 * voert de code in, en deze aanroep wacht op de bevestiging. Werkt ook als
 * poort 1455 bezet is of de browser op een andere machine draait.
 */
export async function oauthDeviceStart(
  profiel: string,
  clientId?: string,
  bij?: (gebeurtenis: AiOAuthGebeurtenis) => void,
): Promise<AiProfielAuthStatus> {
  if (!aiBeschikbaar()) throw new Error("OAuth sign-in needs the desktop app");
  const kanaal = new Channel<AiOAuthGebeurtenis>();
  if (bij) kanaal.onmessage = bij;
  return invoke<AiProfielAuthStatus>("ai_oauth_device_start", {
    profiel,
    ...(clientId && clientId.trim() !== "" ? { clientId: clientId.trim() } : {}),
    kanaal,
  });
}

/** Rond een lopende OAuth-aanmelding af door de callback-URL of code te plakken. */export async function oauthCompleteManual(invoer: string): Promise<AiProfielAuthStatus> {
  return invoke<AiProfielAuthStatus>("ai_oauth_complete_manual", { invoer });
}

/** Annuleer een lopende OAuth-aanmelding. */
export async function oauthCancel(): Promise<void> {
  if (!aiBeschikbaar()) return;
  await invoke("ai_oauth_cancel");
}

/** Wis het OAuth-token voor dit profiel uit de sleutelbos. */
export async function oauthLogout(profiel: string): Promise<void> {
  await invoke("ai_oauth_logout", { profiel });
}

/** Sla handmatig een OAuth access_token (en optioneel refresh_token) op. */
export async function oauthZetToken(
  profiel: string,
  accessToken: string,
  refreshToken?: string,
): Promise<AiProfielAuthStatus> {
  return invoke<AiProfielAuthStatus>("ai_oauth_zet_token", {
    profiel,
    accessToken,
    refreshToken: refreshToken && refreshToken.trim() !== "" ? refreshToken : null,
  });
}

/** Haal beschikbare modelnamen op bij de aanbieder (`/v1/models` of `/v1beta/models`). */
export async function listModels(verzoek: AiModelLijstVerzoek): Promise<string[]> {
  if (!aiBeschikbaar()) throw new Error("the AI assistant needs the desktop app");
  return invoke<string[]>("ai_list_models", { verzoek });
}

/** Eén beurt naar de aanbieder; `bij` krijgt elke gebeurtenis zodra hij binnen is. */
export async function vraag(
  verzoek: AiVerzoek,
  bij: (gebeurtenis: AiGebeurtenis) => void,
): Promise<void> {
  if (!aiBeschikbaar()) throw new Error("the AI assistant needs the desktop app");
  const kanaal = new Channel<AiGebeurtenis>();
  kanaal.onmessage = bij;
  await invoke("ai_vraag", { verzoek, kanaal });
}

/** De stopknop: het lopende verzoek stopt na de huidige regel. */
export async function stop(): Promise<void> {
  if (!aiBeschikbaar()) return;
  await invoke("ai_stop");
}
