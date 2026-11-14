/**
 * De stand van de AI-zijbalk (docs/OCSS_TW_開發需求規格.md, P2-15): open of
 * dicht, het gesprek, de stappen, de vraag om goedkeuring en de instellingen
 * van de aanbieder.
 *
 * De assistent roept dezelfde tools aan als MCP en REST, in-process:
 * `voerToolUit` uit `mcp/uitvoeren.ts` met de registry `MCP_TOOLS`. Die poort
 * regelt ook pauze en alleen-lezen, dus de schakelaar in Instellingen geldt
 * hier net zo goed.
 *
 * De sleutel van de aanbieder staat in de sleutelhanger van het systeem
 * (Rust, `src-tauri/src/ai.rs`), nooit in preferences.json.
 */
import { create } from "zustand";
import i18next from "../i18n/config.ts";
import { getSetting, setSetting } from "../store.ts";
import {
  aiBeschikbaar,
  heeftSleutel,
  stop as stopAanbieder,
  vraag as vraagAanbieder,
  zetSleutel,
  type AiAanbieder,
  type AiBericht,
  type AiGereedschap,
} from "../tauri/ai.ts";
import { MCP_TOOLS } from "../mcp/tools.ts";
import { voerToolUit } from "../mcp/uitvoeren.ts";
import { liveOmgeving } from "../mcp/omgeving.ts";
import { useMcpStatus } from "../mcp/status.ts";
import { MCP_SERVERNAAM } from "../mcp/koppeling.ts";
import { bouwSysteemtekst, parseBereik, type ActiefBlad, type BladKort, type LaatsteUitkomst } from "../components/ai/prompt.ts";
import { voerVraagUit, type Antwoord, type Goedkeuring, type Stap, type ToolUitkomst } from "../components/ai/agent.ts";
import { DESTRUCTIEF } from "../components/ai/beleid.ts";
import type { McpToolDef } from "../mcp/contracts.ts";

const SLEUTEL = "aiInstellingen";

export interface AiInstellingen {
  aanbieder: AiAanbieder;
  endpoint: string;
  model: string;
}

export const STANDAARD_AI: Record<AiAanbieder, AiInstellingen> = {
  anthropic: { aanbieder: "anthropic", endpoint: "https://api.anthropic.com", model: "claude-sonnet-5-5" },
  openai: { aanbieder: "openai", endpoint: "https://api.openai.com", model: "gpt-5" },
  gemini: { aanbieder: "gemini", endpoint: "https://generativelanguage.googleapis.com", model: "gemini-2.5-pro" },
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

interface AiStand {
  open: boolean;
  geladen: boolean;
  beschikbaar: boolean;
  instellingen: AiInstellingen;
  /** Per aanbieder of er een sleutel in de sleutelhanger staat. */
  sleutels: Partial<Record<AiAanbieder, boolean>>;
  regels: AiRegel[];
  stappen: Stap[];
  bezig: boolean;
  /** Wat er misging bij de laatste vraag (netwerk, sleutel, limiet). */
  fout: string | null;
  goedkeuring: Goedkeuring | null;
  /** De taal van de app, voor het antwoord van de assistent. */
  taal: string;

  zetOpen(open: boolean): void;
  laad(): Promise<void>;
  zetInstellingen(wijziging: Partial<AiInstellingen>): Promise<void>;
  bewaarSleutel(sleutel: string): Promise<void>;
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
  instellingen: STANDAARD_AI.anthropic,
  sleutels: {},
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
    const bewaard = await getSetting<Partial<AiInstellingen> | null>(SLEUTEL, null);
    const aanbieder: AiAanbieder = bewaard?.aanbieder ?? "anthropic";
    const instellingen: AiInstellingen = {
      ...STANDAARD_AI[aanbieder],
      ...(bewaard ?? {}),
      aanbieder,
    };
    const beschikbaar = await aiBeschikbaar();
    const sleutels: Partial<Record<AiAanbieder, boolean>> = {};
    if (beschikbaar) {
      for (const a of ["anthropic", "openai", "gemini"] as AiAanbieder[]) sleutels[a] = await heeftSleutel(a);
    }
    set({ geladen: true, beschikbaar, instellingen, sleutels });
  },

  async zetInstellingen(wijziging) {
    const instellingen = { ...get().instellingen, ...wijziging };
    set({ instellingen });
    await setSetting(SLEUTEL, instellingen);
  },

  async bewaarSleutel(sleutel) {
    const { aanbieder } = get().instellingen;
    await zetSleutel(aanbieder, sleutel);
    set({ sleutels: { ...get().sleutels, [aanbieder]: await heeftSleutel(aanbieder) } });
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
    const instellingen = get().instellingen;
    // De taal van de app op het moment van vragen: de assistent antwoordt daarin.
    const taal = i18next.language || get().taal;
    if (!get().sleutels[instellingen.aanbieder]) {
      set({ fout: "No API key for this provider yet. Enter it above; it is kept in the keychain of your system." });
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
          aanbieder: instellingen.aanbieder,
          endpoint: instellingen.endpoint,
          model: instellingen.model,
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
