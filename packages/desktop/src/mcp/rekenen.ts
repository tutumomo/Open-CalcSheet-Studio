/**
 * Doorrekenen voor de MCP-tools: synchroon, op de UI-thread, niet via de worker.
 *
 * Dit is dezelfde rekenroute als die van de afdruk
 * (components/calc/bladDoorrekenen.ts `rekenBladDoor`, en voor de getallen
 * components/calc/bladResultaat.ts `rekenBladDoor`): inlezen met dezelfde
 * includes en afbeeldingen, doorrekenen met de invoer van het blad en de
 * projectgegevens als scope, en de uitkomst lezen met `leesResultaat` en
 * `leesGetallen`. Het enige verschil: hier blijven de uitgerekende knopen en
 * de foutmelding bewaard, want een AI-assistent heeft juist aan die twee iets.
 *
 * De worker (rekenen/doorrekening.ts) is er voor het typen in de werkruimte;
 * een tool moet zijn antwoord in één keer kunnen geven.
 *
 * Laadt zonder React of stores (imports met `.ts`), zodat de controle
 * (scripts/check-mcp.mjs) dit bestand in Node gebruikt.
 */
import { parse, evaluate, naarSI, vasteEenheid, gebrokenExponent } from "@ifc-calc/core";
import { metToetsingen } from "../rekenen/toetsCache.ts";
import type { AstNode, EvaluatedNode, FemUitersten, LusNietKlaar, ToetsUitkomst } from "@ifc-calc/core";
import { rekentaalIncludes, rekentaalImageUrls } from "../templates/rekentaal-includes.ts";
import { leesGetallen, leesResultaat, metRefNamen, type Resultaat } from "../components/calc/bladLezen.ts";
import { rekenEenhedenDoor } from "../components/calc/canvasRekenen.ts";
import { heeftEenheden } from "../store/canvasBlad.ts";

/** Leest een rekentekst in, met dezelfde includes en afbeeldingen als de uitwerking. */
export function leesBron(source: string): AstNode[] {
  return parse(source, { includes: rekentaalIncludes, imageUrls: rekentaalImageUrls });
}

export interface Doorrekening {
  nodes: EvaluatedNode[];
  resultaat: Resultaat;
  /** Elke zichtbare uitkomst op naam, in de eenheid van het blad. */
  getallen: Record<string, number>;
}

/**
 * Rekent een tekst door. Werpt bij een fout in het inlezen of rekenen.
 *
 * Een `@toets`-blok leest de antwoorden van FEM Studio (rekenen/toetsCache.ts). `vragen`
 * alleen vóór het afdrukken (femToetsing.ts, werkToetsingenBij): dan geeft een blok
 * zonder antwoord zijn verzoek mee. Hier gaat zelf niets naar FEM Studio.
 */
export function rekenDoor(
  source: string,
  waarden: Record<string, string>,
  scope: Record<string, unknown>,
  naam: string,
  toetsModus: "vragen" | "lezen" = "lezen",
): Doorrekening {
  const evalOpties = metToetsingen({}, toetsModus);
  // Een canvas-blad langs dezelfde route als op het scherm: een fout blijft bij zijn eenheid.
  const nodes = heeftEenheden(source)
    ? rekenEenhedenDoor(source, waarden, scope, { includes: rekentaalIncludes, imageUrls: rekentaalImageUrls }, evalOpties).flatMap((u) => u.nodes)
    : evaluate(leesBron(source), waarden, scope, evalOpties);
  return {
    nodes,
    resultaat: leesResultaat(nodes, naam),
    getallen: metRefNamen(leesGetallen(nodes), source),
  };
}

/** Een getal dat JSON overleeft: ∞ en NaN worden tekst. */
export function jsonGetal(n: number | null | undefined): number | string | null {
  if (n === null || n === undefined) return null;
  if (Number.isNaN(n)) return "NaN";
  if (!Number.isFinite(n)) return n > 0 ? "Infinity" : "-Infinity";
  return n;
}

/** Een uitkomst van de UC's op naam: alle getallen waarvan de naam met UC begint. */
export function ucWaarden(getallen: Record<string, number>): Record<string, number | string | null> {
  const uit: Record<string, number | string | null> = {};
  for (const [naam, w] of Object.entries(getallen)) {
    if (/^uc(?:$|_)/i.test(naam)) uit[naam] = jsonGetal(w);
  }
  return uit;
}

/** Eén regel van een doorgerekende tekst, zoals calc_evaluate hem teruggeeft. */
export type McpRegel = Record<string, unknown> & { type: string };

const zonderHtml = (t: string) => t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

/**
 * Een waarschuwing over een eenheid, met de regel waar hij vandaan komt
 * (docs/OCSS_TW_開發需求規格.md, P1-6).
 */
export interface EenheidWaarschuwing {
  /** `UNIT_FRACTIONAL_EXPONENT`: de dimensie is geen hele macht van een basiseenheid. */
  code: string;
  /** De regel in de bron, of null als de naam niet als `naam = …` in de bron staat. */
  line: number | null;
  name: string | null;
  unit: string;
  message: string;
}

/** De regelnummers per naam, uit de bron: de AST bewaart geen regelnummers. */
export function regelPerNaam(source: string): Map<string, number> {
  const uit = new Map<string, number>();
  const tekst = source.split("\n");
  for (let i = 0; i < tekst.length; i++) {
    const m = /^\s*([\p{L}_][\p{L}\p{N}_]*)\s*=/u.exec(tekst[i]);
    if (m && !uit.has(m[1])) uit.set(m[1], i + 1);
  }
  return uit;
}

const NORM_RE =
  /\b((?:rc|steel|seis|wind|found|hwdrain|rainwater|wood)\d{3}|swc_tech|sewer_std|hwbridgeseis|hwbridge|btr_struct)\s*(?:§\s*)?(\d+(?:[.\-]\d+)*)/;

/** Het normartikel dat de bron op deze regel noemt, als `rc112 22.2.2.4.3`. */
export function normArtikel(source: string, regel: number | null): string | null {
  if (regel === null) return null;
  const m = NORM_RE.exec(source.split("\n")[regel - 1] ?? "");
  return m ? `${m[1]} ${m[2]}` : null;
}

/** Alle normartikelen die de bron noemt, in volgorde van de tekst en zonder dubbelen. */
export function normArtikelen(source: string): { clause: string; line: number }[] {
  const uit: { clause: string; line: number }[] = [];
  const gezien = new Set<string>();
  const tekst = source.split("\n");
  for (let i = 0; i < tekst.length; i++) {
    const m = NORM_RE.exec(tekst[i]);
    if (!m) continue;
    const clause = `${m[1]} ${m[2]}`;
    if (gezien.has(clause)) continue;
    gezien.add(clause);
    uit.push({ clause, line: i + 1 });
  }
  return uit;
}

/**
 * De eenheidswaarschuwingen van een doorgerekende tekst. Nu één code: een
 * gebroken exponent in de dimensie (`R^(2/3)` geeft `m^0.666…`), want zo'n
 * uitkomst is niet zonder meer met een hele eenheid te vergelijken.
 */
export function eenheidWaarschuwingen(
  nodes: EvaluatedNode[],
  regelsPerNaam: Map<string, number>,
): EenheidWaarschuwing[] {
  const uit: EenheidWaarschuwing[] = [];
  const loop = (lijst: EvaluatedNode[]) => {
    for (const n of lijst) {
      if (n.type === "conditional-branch") {
        loop(n.children);
        continue;
      }
      if (n.type !== "assignment" && n.type !== "var-display") continue;
      const eenheid = n.unit;
      if (!eenheid) continue;
      const exponent = gebrokenExponent(eenheid);
      if (exponent === null) continue;
      uit.push({
        code: "UNIT_FRACTIONAL_EXPONENT",
        line: regelsPerNaam.get(n.name) ?? null,
        name: n.name,
        unit: eenheid,
        message: `The unit "${eenheid}" has a fractional exponent (${exponent}); the dimension is not a whole power of a base unit. Work in whole units or check the formula.`,
      });
    }
  };
  loop(nodes);
  return uit;
}

/** Een lus die niet klaar kwam, zoals de tools hem geven (P1-9). */
export function lusJson(l: LusNietKlaar): Record<string, unknown> {
  const uit: Record<string, unknown> = { code: l.code, iterations: l.rondes, max: l.max };
  if (l.voorwaarde !== undefined) uit.condition = l.voorwaarde;
  if (l.naam !== undefined) uit.name = l.naam;
  if (l.tol !== undefined) uit.tol = jsonGetal(l.tol);
  if (l.residu !== undefined) uit.residual = jsonGetal(l.residu);
  return uit;
}

/** Alle lussen die hun bovengrens haalden zonder klaar te zijn (`NOT_CONVERGED`). */
export function nietKlaar(nodes: EvaluatedNode[]): Record<string, unknown>[] {
  const uit: Record<string, unknown>[] = [];
  const loop = (lijst: EvaluatedNode[]) => {
    for (const n of lijst) {
      if (n.type === "conditional-branch") loop(n.children);
      else if (n.type === "text" && n.iteratie) uit.push({ ...lusJson(n.iteratie), message: zonderHtml(n.text) });
    }
  };
  loop(nodes);
  return uit;
}

export interface RegelOpties {
  /** De bron: voor regelnummers en het normartikel per regel. */
  bron?: string;
  /** Ook de waarde in de gebruikelijke eenheid geven (`kN/mm^2` → `MPa`). */
  conventioneel?: boolean;
}

/** De velden die elke uitgerekende regel erbij krijgt: SI-waarde, artikel, oordeel. */
function verrijking(
  naam: string,
  waarde: unknown,
  eenheid: string | undefined,
  opties: RegelOpties,
  regelsPerNaam: Map<string, number>,
): Record<string, unknown> {
  const uit: Record<string, unknown> = {};
  const regel = opties.bron ? regelsPerNaam.get(naam) ?? null : null;
  if (regel !== null) uit.line = regel;
  if (eenheid && typeof waarde === "number" && Number.isFinite(waarde)) {
    const si = naarSI(waarde, eenheid);
    if (si) {
      uit.si_value = jsonGetal(si.waarde);
      uit.si_unit = si.eenheid;
    }
    if (opties.conventioneel) {
      const vast = vasteEenheid(waarde, eenheid);
      if (vast) uit.conventional = { value: jsonGetal(vast.waarde), unit: vast.eenheid };
    }
  }
  if (regel !== null && opties.bron) {
    const artikel = normArtikel(opties.bron, regel);
    if (artikel) uit.clause = artikel;
  }
  if (/^uc(?:$|_)/i.test(naam) && typeof waarde === "number" && Number.isFinite(waarde)) {
    uit.uc = jsonGetal(waarde);
    uit.check = waarde <= 1 + 1e-9 ? "pass" : "fail";
  } else {
    uit.check = "unchecked";
  }
  return uit;
}

/**
 * Het antwoord van een `@toets`-blok als JSON: het oordeel en elke toets op
 * zichzelf. `status` blijft de stand van het blok; het oordeel van FEM Studio
 * staat in `resultStatus` (`Ok`, `NotOk`, `NotApplicable`).
 */
function toetsAntwoord(u: ToetsUitkomst): Record<string, unknown> {
  const uit: Record<string, unknown> = {
    resultStatus: u.status,
    passes: u.voldoet,
    items: u.toetsen.map((t) => ({
      id: t.id,
      clause: t.artikel,
      title: t.titel,
      uc: jsonGetal(t.uc),
      status: t.status,
    })),
  };
  if (u.maatgevend) uit.governing = u.maatgevend;
  if (u.staven && u.staven.length > 0) {
    uit.members = u.staven.map((s) => ({
      id: s.id,
      uc: jsonGetal(s.uc_max),
      status: s.status,
      ...(s.maatgevend ? { governing: s.maatgevend } : {}),
    }));
  }
  if (u.fout) uit.resultError = u.fout;
  if (u.toetsen.length === 0) delete uit.items;
  return uit;
}

/** De uitersten van één geval of combinatie, met de eenheid erbij. */
function femUitersten(u: FemUitersten): Record<string, unknown> {
  return {
    name: u.naam,
    kind: u.soort,
    mx: { max: jsonGetal(u.mxMax), min: jsonGetal(u.mxMin), unit: "kN m/m" },
    my: { max: jsonGetal(u.myMax), min: jsonGetal(u.myMin), unit: "kN m/m" },
    mxy: { max: jsonGetal(u.mxyMax), min: jsonGetal(u.mxyMin), unit: "kN m/m" },
    deflection: { max: jsonGetal(u.wMax), min: jsonGetal(u.wMin), unit: "mm" },
    reaction: { max: jsonGetal(u.RMax), min: jsonGetal(u.RMin), unit: "kN" },
  };
}

/**
 * De uitgerekende knopen als platte lijst regels. Een voorwaardelijk blok
 * levert zijn gekozen tak; figuren worden één regel `figure`. Na `max` regels
 * stopt de lijst (`afgekapt`).
 */
export function regels(
  nodes: EvaluatedNode[],
  max: number,
  opties: RegelOpties = {},
): { regels: McpRegel[]; afgekapt: boolean } {
  const uit: McpRegel[] = [];
  const regelsPerNaam = opties.bron ? regelPerNaam(opties.bron) : new Map<string, number>();
  let afgekapt = false;
  const loop = (lijst: EvaluatedNode[]) => {
    for (const n of lijst) {
      if (uit.length >= max) {
        afgekapt = true;
        return;
      }
      switch (n.type) {
        case "conditional-branch":
          loop(n.children);
          break;
        case "heading":
          uit.push({ type: "heading", level: n.level, text: zonderHtml(n.text) });
          break;
        case "text": {
          const tekst = zonderHtml(n.text);
          if (n.iteratie) uit.push({ type: "text", text: tekst, error: tekst, ...lusJson(n.iteratie), check: "unchecked" });
          else if (tekst) uit.push({ type: "text", text: tekst });
          break;
        }
        case "assignment": {
          const regel: McpRegel = {
            type: "assignment",
            name: n.name,
            expression: n.expression,
            expr: n.expression,
            result: n.result,
          };
          if (n.unit) regel.unit = n.unit;
          if (typeof n.waarde === "number") regel.value = jsonGetal(n.waarde);
          if (n.result.startsWith("Error")) regel.error = n.result;
          Object.assign(regel, verrijking(n.name, n.waarde, n.unit, opties, regelsPerNaam));
          uit.push(regel);
          break;
        }
        case "var-display": {
          const regel: McpRegel = { type: "value", name: n.name, result: n.result };
          if (n.unit) regel.unit = n.unit;
          if (typeof n.waarde === "number") regel.value = jsonGetal(n.waarde);
          Object.assign(regel, verrijking(n.name, n.waarde, n.unit, opties, regelsPerNaam));
          uit.push(regel);
          break;
        }
        case "toets": {
          const regel: McpRegel = {
            type: "toets",
            name: n.naam,
            tool: n.tool,
            status: n.status,
          };
          const uc = n.uitkomst?.uc_max;
          if (typeof uc === "number") regel.uc = jsonGetal(uc);
          if (n.melding) regel.message = n.melding;
          // Het volledige antwoord van FEM Studio, zodat een client niet in de
          // tekst van het blad hoeft te zoeken (OCSS 規格 P3-17).
          if (n.versie) regel.version = n.versie;
          if (n.datum) regel.date = n.datum;
          if (n.uitkomst) Object.assign(regel, toetsAntwoord(n.uitkomst));
          // Geen antwoord of geen oordeel: nooit "pass".
          regel.check =
            n.status === "klaar" && n.uitkomst
              ? n.uitkomst.voldoet === true && typeof uc === "number" && uc <= 1 + 1e-9
                ? "pass"
                : "fail"
              : "unchecked";
          uit.push(regel);
          break;
        }
        case "fem": {
          const regel: McpRegel = { type: "fem", name: n.naam, status: n.status };
          if (n.melding) regel.message = n.melding;
          if (n.versie) regel.version = n.versie;
          if (n.datum) regel.date = n.datum;
          if (n.model) {
            regel.model = {
              nodes: n.model.knopen,
              elements: n.model.elementen,
              mesh: n.model.maas,
              springs: n.model.veren,
              lineSupports: n.model.lijnen,
              thicknesses: n.model.dikten.map((d) => jsonGetal(d)),
            };
          }
          if (n.gevallen.length > 0) {
            regel.cases = n.gevallen.map((g) => ({
              name: g.naam,
              ...(g.hash ? { hash: g.hash } : {}),
              ...(typeof g.somLast === "number" ? { totalLoad: jsonGetal(g.somLast) } : {}),
              ...(typeof g.somR === "number" ? { totalReaction: jsonGetal(g.somR) } : {}),
            }));
          }
          if (n.uitersten && n.uitersten.length > 0) regel.extremes = n.uitersten.map(femUitersten);
          regel.check = "unchecked";
          uit.push(regel);
          break;
        }
        case "kern": {
          const regel: McpRegel = { type: "kern", name: n.naam, status: n.status };
          if (n.melding) regel.message = n.melding;
          regel.check = "unchecked";
          uit.push(regel);
          break;
        }
        case "input-prompt":
          uit.push({ type: "input", name: n.name, label: zonderHtml(n.label), value: n.currentValue, unit: n.unit });
          break;
        case "select":
          uit.push({
            type: "select",
            name: n.name,
            label: zonderHtml(n.label),
            selected: n.selectedValue,
            options: n.options.map((o) => ({ value: o.value, text: o.text })),
          });
          break;
        case "user-function":
          uit.push({ type: "function", name: n.name, params: n.params, expression: n.expression });
          break;
        default:
          uit.push({ type: "figure" });
      }
    }
  };
  loop(nodes);
  return { regels: uit, afgekapt };
}
