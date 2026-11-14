/**
 * De lus van de AI-zijbalk: één vraag van de gebruiker, het gesprek met de
 * aanbieder, en de gereedschappen van de app zelf (docs/OCSS_TW_開發需求規格.md,
 * P2-15).
 *
 * De assistent roept **dezelfde** tools aan als MCP en REST: de registry
 * (`mcp/tools.ts`) via `voerToolUit` (`mcp/uitvoeren.ts`), in-process, zonder
 * HTTP. Wat de assistent doet, kan een MCP-client dus ook, en andersom.
 *
 * Alles wat naar buiten gaat (tekst, stappen, goedkeuring) loopt via `bij`; hoe
 * het verzoek bij de aanbieder komt, zit in `deps.vraag`. Zo is de lus zonder
 * Tauri en zonder netwerk te toetsen (`scripts/check-ai-agent.mjs`).
 */
import type { AiBericht, AiGebeurtenis, AiGereedschap, AiVerzoek, AiAanbieder } from "../../tauri/ai.ts";
import type { Besluit, ToolKenmerk, Voorbeeld } from "./beleid.ts";
import { besluitVoor, regelVerschil, vatSamen, voorbeeldSamenvatting } from "./beleid.ts";

/** Een uitkomst van een tool, zoals `voerToolUit` hem geeft. */
export interface ToolUitkomst {
  ok: boolean;
  data?: Record<string, unknown>;
  code?: string;
  error?: string;
}

/** Een stap in de stappenlijst van de zijbalk. */
export interface Stap {
  id: string;
  tool: string;
  /** Kort, voor in de lijst: `sheet_set_input(id=ex-1, name=q, value=12)`. */
  samenvatting: string;
  argumenten: Record<string, unknown>;
  status: "wacht" | "loopt" | "klaar" | "fout" | "geweigerd";
  /** De uitkomst als tekst, ingekort. */
  resultaat?: string;
  fout?: string;
}

/** Wat de gebruiker moet goedkeuren. */
export type Goedkeuring =
  | { soort: "vraag"; tool: string; samenvatting: string; argumenten: Record<string, unknown> }
  | { soort: "voorbeeld"; tool: string; samenvatting: string; argumenten: Record<string, unknown>; voorbeeld: Voorbeeld; tekst: string };

/** `altijd` geldt voor de rest van deze sessie (tot de zijbalk sluit). */
export type Antwoord = "ja" | "nee" | "altijd";

export interface AgentBij {
  /** Een stuk tekst van het antwoord. */
  tekst?(tekst: string): void;
  /** Een stap is begonnen of afgelopen. */
  stap?(stap: Stap): void;
}

export interface AgentDeps {
  aanbieder: AiAanbieder;
  endpoint: string;
  model: string;
  maxTokens?: number;
  temperatuur?: number;
  /** De systeemprompt: wie de assistent is en wat het project nu is. */
  systeem: string;
  /** De gereedschappen zoals de aanbieder ze ziet. */
  gereedschap: AiGereedschap[];
  /** De kenmerken van een tool uit de registry (naam, soort, destructief). */
  kenmerk(naam: string): ToolKenmerk | null;
  /** De huidige inhoud van een blad, als een overschrijving die mag raken. */
  huidigeInhoud(naam: string, argumenten: Record<string, unknown>): Promise<string | null>;
  voerUit(naam: string, argumenten: Record<string, unknown>): Promise<ToolUitkomst>;
  vraagGoedkeuring(verzoek: Goedkeuring): Promise<Antwoord>;
  /** Eén beurt naar de aanbieder; roept `bij` per gebeurtenis aan. */
  vraag(verzoek: AiVerzoek, bij: (gebeurtenis: AiGebeurtenis) => void): Promise<void>;
  bij?: AgentBij;
  maxRondes?: number;
  /** Meer dan dit komt niet in het gesprek (anders loopt de context vol). */
  maxResultaatTekens?: number;
}

export interface AgentUitkomst {
  /** De tekst van het laatste antwoord, aan elkaar geplakt. */
  tekst: string;
  rondes: number;
  invoer: number;
  uitvoer: number;
  stappen: Stap[];
  /** Waarom het ophield: `klaar`, `lengte`, `gestopt`, `fout` of `rondes`. */
  einde: "klaar" | "lengte" | "gestopt" | "fout" | "rondes";
  melding?: string;
}

const STANDAARD_MAX_RONDES = 12;
const STANDAARD_MAX_TEKENS = 20000;

/** De goedkeuringen die de gebruiker deze sessie al gaf ("altijd"). */
export type AltijdToegestaan = Set<string>;

/**
 * Voert één vraag uit. `geschiedenis` is het gesprek tot nu toe (zonder deze
 * vraag); de nieuwe berichten komen er in de aanroep bij en worden niet bewaard:
 * de zijbalk bewaart ze zelf.
 */
export async function voerVraagUit(
  vraagTekst: string,
  geschiedenis: AiBericht[],
  deps: AgentDeps,
  altijd: AltijdToegestaan = new Set(),
): Promise<AgentUitkomst> {
  const bij = deps.bij ?? {};
  const maxRondes = deps.maxRondes ?? STANDAARD_MAX_RONDES;
  const maxTekens = deps.maxResultaatTekens ?? STANDAARD_MAX_TEKENS;
  const berichten: AiBericht[] = [...geschiedenis, { rol: "user", tekst: vraagTekst }];
  const stappen: Stap[] = [];
  const teksten: string[] = [];
  let invoer = 0;
  let uitvoer = 0;
  let nummer = 0;

  const meldStap = (stap: Stap) => {
    bij.stap?.(stap);
  };

  for (let ronde = 1; ronde <= maxRondes; ronde++) {
    // In een object, niet in losse `let`s: de callbacks hieronder vullen ze, en
    // TypeScript zou ze anders na de `await` als "nooit gezet" zien.
    const stand: { tekst: string; stopreden: string | null; fout: string | null } = {
      tekst: "",
      stopreden: null,
      fout: null,
    };
    const oproepen: { id: string; naam: string; argumenten: unknown }[] = [];

    await deps.vraag(
      {
        aanbieder: deps.aanbieder,
        endpoint: deps.endpoint,
        model: deps.model,
        systeem: deps.systeem,
        berichten,
        gereedschap: deps.gereedschap,
        max_tokens: deps.maxTokens ?? 4096,
        ...(deps.temperatuur !== undefined ? { temperatuur: deps.temperatuur } : {}),
      },
      (g) => {
        switch (g.soort) {
          case "tekst":
            stand.tekst += g.tekst;
            bij.tekst?.(g.tekst);
            break;
          case "oproep":
            oproepen.push({ id: g.id, naam: g.naam, argumenten: g.argumenten });
            break;
          case "klaar":
            stand.stopreden = g.stopreden;
            invoer += g.invoer;
            uitvoer += g.uitvoer;
            break;
          case "fout":
            stand.fout = g.melding;
            break;
        }
      },
    );

    if (stand.fout !== null) {
      return { tekst: teksten.join("\n\n"), rondes: ronde, invoer, uitvoer, stappen, einde: "fout", melding: stand.fout };
    }
    if (stand.tekst.trim() !== "") teksten.push(stand.tekst);

    const stopreden = stand.stopreden ?? (oproepen.length > 0 ? "gereedschap" : "einde");
    if (stopreden === "gestopt") {
      return { tekst: teksten.join("\n\n"), rondes: ronde, invoer, uitvoer, stappen, einde: "gestopt" };
    }
    if (oproepen.length === 0) {
      return {
        tekst: teksten.join("\n\n"),
        rondes: ronde,
        invoer,
        uitvoer,
        stappen,
        einde: stopreden === "lengte" ? "lengte" : "klaar",
      };
    }

    berichten.push({
      rol: "assistant",
      tekst: stand.tekst,
      oproepen: oproepen.map((o) => ({ id: o.id, naam: o.naam, argumenten: o.argumenten })),
    });

    const resultaten: { id: string; naam: string; inhoud: string; fout: boolean }[] = [];
    for (const oproep of oproepen) {
      const argumenten =
        oproep.argumenten !== null && typeof oproep.argumenten === "object"
          ? (oproep.argumenten as Record<string, unknown>)
          : {};
      const stap: Stap = {
        id: `stap-${++nummer}`,
        tool: oproep.naam,
        samenvatting: vatSamen(oproep.naam, argumenten),
        argumenten,
        status: "loopt",
      };
      stappen.push(stap);
      meldStap({ ...stap });

      const weigering = await keurGoed(oproep.naam, argumenten, deps, altijd);
      if (weigering !== null) {
        stap.status = "geweigerd";
        stap.fout = weigering;
        meldStap({ ...stap });
        resultaten.push({
          id: oproep.id,
          naam: oproep.naam,
          inhoud: `The user did not approve this step: ${weigering}. Do not retry it; ask what to do instead.`,
          fout: true,
        });
        continue;
      }

      const uitkomst = await deps.voerUit(oproep.naam, argumenten);
      if (uitkomst.ok) {
        stap.status = "klaar";
        stap.resultaat = kort(JSON.stringify(uitkomst.data ?? {}), maxTekens);
        meldStap({ ...stap });
        resultaten.push({ id: oproep.id, naam: oproep.naam, inhoud: stap.resultaat, fout: false });
      } else {
        stap.status = "fout";
        stap.fout = uitkomst.error ?? uitkomst.code ?? "the tool failed";
        meldStap({ ...stap });
        resultaten.push({
          id: oproep.id,
          naam: oproep.naam,
          inhoud: JSON.stringify({ code: uitkomst.code, error: uitkomst.error, data: uitkomst.data }),
          fout: true,
        });
      }
    }
    berichten.push({ rol: "tool", tekst: "", resultaten });
  }

  return {
    tekst: teksten.join("\n\n"),
    rondes: maxRondes,
    invoer,
    uitvoer,
    stappen,
    einde: "rondes",
    melding: `the assistant needed more than ${maxRondes} rounds; ask it to continue`,
  };
}

/**
 * Mag deze aanroep doorgaan? `null` = ja. Anders de reden die de assistent
 * terugkrijgt. Een `voorbeeld` toont eerst de verschillen; pas daarna wordt er
 * geschreven.
 */
async function keurGoed(
  naam: string,
  argumenten: Record<string, unknown>,
  deps: AgentDeps,
  altijd: AltijdToegestaan,
): Promise<string | null> {
  const kenmerk = deps.kenmerk(naam);
  // Een onbekende tool komt niet voor (de lijst komt uit de registry), maar als
  // hij er toch is, vragen we het netjes.
  const tool: ToolKenmerk = kenmerk ?? { naam, kind: "mutate", destructief: true };
  const bestaat = await deps.huidigeInhoud(naam, argumenten);
  const besluit: Besluit = besluitVoor(tool, bestaat !== null);
  if (besluit === "doorgaan") return null;
  if (altijd.has(naam)) return null;

  const samenvatting = vatSamen(naam, argumenten);
  if (besluit === "voorbeeld" && bestaat !== null) {
    const nieuw = typeof argumenten.source === "string" ? argumenten.source : typeof argumenten.text === "string" ? argumenten.text : "";
    const veld = typeof argumenten.source === "string" ? "source" : "text";
    if (nieuw !== "") {
      const voorbeeld = regelVerschil(bestaat, nieuw, veld);
      if (voorbeeld.weg === 0 && voorbeeld.bij === 0) return null;
      const antwoord = await deps.vraagGoedkeuring({
        soort: "voorbeeld",
        tool: naam,
        samenvatting,
        argumenten,
        voorbeeld,
        tekst: voorbeeldSamenvatting(voorbeeld),
      });
      if (antwoord === "nee") return "the user rejected the change";
      if (antwoord === "altijd") altijd.add(naam);
      return null;
    }
  }

  const antwoord = await deps.vraagGoedkeuring({ soort: "vraag", tool: naam, samenvatting, argumenten });
  if (antwoord === "nee") return "the user rejected this step";
  if (antwoord === "altijd") altijd.add(naam);
  return null;
}

/** Kort een tekst in, met een streepje erbij zodat je ziet dat er meer was. */
export function kort(tekst: string, max: number): string {
  if (tekst.length <= max) return tekst;
  return `${tekst.slice(0, max)}… (${tekst.length - max} characters left out)`;
}
