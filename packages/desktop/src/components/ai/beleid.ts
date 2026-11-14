/**
 * Het beleid van de AI-zijbalk: wanneer mag de assistent iets doen, wanneer moet
 * de gebruiker eerst kijken (docs/OCSS_TW_開發需求規格.md, P2-15).
 *
 * Drie standen:
 * - `doorgaan` — lezen en rekenen, en de gewone wijzigingen (een invoerwaarde,
 *   een nieuwe tabel). De gebruiker ziet ze in de stappenlijst en kan ze met
 *   Ctrl+Z terugdraaien.
 * - `voorbeeld` — de assistent gaat bestaande inhoud overschrijven (de rekentekst
 *   van een blad, een Markdown-blad). Eerst de verschillen tonen; pas na "套用"
 *   wordt er geschreven.
 * - `vraag` — een onomkeerbare of naar buiten tredende stap (een blad verwijderen,
 *   het project opslaan). Altijd eerst vragen, met de mogelijkheid "deze sessie
 *   altijd".
 *
 * Zuivere functies zonder React of Tauri, zodat `scripts/check-ai-agent.mjs`
 * ze direct kan nalopen.
 */

export type Besluit = "doorgaan" | "voorbeeld" | "vraag";

/** Wat het beleid van een tool nodig heeft: de naam en de vlaggen uit de registry. */
export interface ToolKenmerk {
  naam: string;
  kind: "read" | "mutate" | "file" | "ui";
  destructief: boolean;
}

/** Deze tools overschrijven bestaande inhoud: altijd eerst een voorbeeld. */
const OVERSCHRIJFT: Record<string, string[]> = {
  sheet_set_source: ["id"],
  sheet_set_markdown: ["id"],
};

/** Deze tools zijn onomkeerbaar of treden naar buiten: altijd eerst vragen. */
const ALTIJD_VRAGEN = new Set(["sheet_remove", "project_save", "project_new"]);

/** Dezelfde lijst, voor de zijbalk: deze tools zijn onomkeerbaar of treden naar buiten. */
export const DESTRUCTIEF: ReadonlySet<string> = ALTIJD_VRAGEN;

/** Het besluit voor één aanroep. `bestaat` zegt of het blad al inhoud heeft. */
export function besluitVoor(tool: ToolKenmerk, bestaat: boolean): Besluit {
  if (tool.kind === "read" || tool.kind === "ui") return "doorgaan";
  if (ALTIJD_VRAGEN.has(tool.naam) || tool.destructief) return "vraag";
  if (tool.naam in OVERSCHRIJFT && bestaat) return "voorbeeld";
  if (tool.kind === "file") return "voorbeeld";
  return "doorgaan";
}

/** Een korte samenvatting van de argumenten, voor de stappenlijst. */
export function vatSamen(naam: string, argumenten: unknown): string {
  if (argumenten === null || typeof argumenten !== "object") return naam;
  const delen: string[] = [];
  for (const [sleutel, waarde] of Object.entries(argumenten as Record<string, unknown>)) {
    if (waarde === undefined || waarde === null || waarde === "") continue;
    let tekst: string;
    if (typeof waarde === "string") {
      const schoon = waarde.replace(/\s+/g, " ").trim();
      tekst = schoon.length > 40 ? `${schoon.slice(0, 39)}…` : schoon;
    } else if (typeof waarde === "number" || typeof waarde === "boolean") {
      tekst = String(waarde);
    } else if (Array.isArray(waarde)) {
      tekst = `[${waarde.length}]`;
    } else {
      tekst = "{…}";
    }
    delen.push(`${sleutel}=${tekst}`);
    if (delen.length === 3) break;
  }
  return delen.length === 0 ? naam : `${naam}(${delen.join(", ")})`;
}

// ── Het voorbeeld: welke regels veranderen er? ───────────────────────────────

export interface RegelVerschil {
  /** `gelijk` telt niet mee in de telling; `weg` is oud, `bij` is nieuw. */
  soort: "gelijk" | "weg" | "bij";
  /** De regel uit de oude tekst (bij `weg`) of de nieuwe (bij `bij` en `gelijk`). */
  tekst: string;
  /** Regelnummer in de oude tekst (1-based), of null bij een nieuwe regel. */
  oud: number | null;
  /** Regelnummer in de nieuwe tekst (1-based), of null bij een verdwenen regel. */
  nieuw: number | null;
}

export interface Voorbeeld {
  /** De naam van het veld dat verandert, bijvoorbeeld `source`. */
  veld: string;
  weg: number;
  bij: number;
  regels: RegelVerschil[];
}

/** Meer dan dit aantal regels vergelijken we niet meer; dan telt alleen het verschil. */
const MAX_DIFF_REGELS = 800;

/**
 * Een regel-voor-regel vergelijking (langste gemene reeks). Klein genoeg voor een
 * rekentekst; boven [`MAX_DIFF_REGELS`] houden we het bij de eerste regels die
 * verschillen.
 */
export function regelVerschil(oud: string, nieuw: string, veld = "source"): Voorbeeld {
  const a = oud.split("\n");
  const b = nieuw.split("\n");
  const regels: RegelVerschil[] = [];
  if (a.length > MAX_DIFF_REGELS || b.length > MAX_DIFF_REGELS) {
    const eerste = a.findIndex((r, i) => r !== b[i]);
    const i = eerste < 0 ? Math.min(a.length, b.length) : eerste;
    return {
      veld,
      weg: a.length - i,
      bij: b.length - i,
      regels: [{ soort: "weg", tekst: `(${a.length - i} regels vanaf regel ${i + 1})`, oud: i + 1, nieuw: null }],
    };
  }
  // LCS-tabel; bij een rekentekst van honderden regels is dat ruim snel genoeg.
  const n = a.length;
  const m = b.length;
  const t: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      t[i][j] = a[i] === b[j] ? t[i + 1][j + 1] + 1 : Math.max(t[i + 1][j], t[i][j + 1]);
    }
  }
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      regels.push({ soort: "gelijk", tekst: a[i], oud: i + 1, nieuw: j + 1 });
      i++;
      j++;
    } else if (t[i + 1][j] >= t[i][j + 1]) {
      regels.push({ soort: "weg", tekst: a[i], oud: i + 1, nieuw: null });
      i++;
    } else {
      regels.push({ soort: "bij", tekst: b[j], oud: null, nieuw: j + 1 });
      j++;
    }
  }
  while (i < n) {
    regels.push({ soort: "weg", tekst: a[i], oud: i + 1, nieuw: null });
    i++;
  }
  while (j < m) {
    regels.push({ soort: "bij", tekst: b[j], oud: null, nieuw: j + 1 });
    j++;
  }
  const weg = regels.filter((r) => r.soort === "weg").length;
  const bij = regels.filter((r) => r.soort === "bij").length;
  return { veld, weg, bij, regels };
}

/** Het voorbeeld als tekst, met de onveranderde regels als `…` ertussen. */
export function voorbeeldTekst(v: Voorbeeld, marge = 2): string {
  const uit: string[] = [];
  const bewaard = v.regels.filter((r) => r.soort !== "gelijk");
  if (bewaard.length === 0) return "";
  const teken = (r: RegelVerschil) => (r.soort === "weg" ? "-" : r.soort === "bij" ? "+" : " ");
  // De regels rond elk verschil, zodat je ziet waar het staat.
  const gekozen = new Set<number>();
  v.regels.forEach((r, k) => {
    if (r.soort === "gelijk") return;
    for (let x = Math.max(0, k - marge); x <= Math.min(v.regels.length - 1, k + marge); x++) gekozen.add(x);
  });
  let vorige = -2;
  v.regels.forEach((r, k) => {
    if (!gekozen.has(k)) return;
    if (k !== vorige + 1 && uit.length > 0) uit.push("…");
    uit.push(`${teken(r)} ${r.tekst}`);
    vorige = k;
  });
  return uit.join("\n");
}

/** Wat er in het voorbeeld staat, in één regel: `−3 +5`. */
export function voorbeeldSamenvatting(v: Voorbeeld): string {
  if (v.weg === 0 && v.bij === 0) return "geen verschil";
  return `−${v.weg} +${v.bij}`;
}
