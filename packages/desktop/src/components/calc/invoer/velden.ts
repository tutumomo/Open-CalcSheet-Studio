/**
 * De invoer van een rekenblad als formulier: het invoerscherm van elk blad zonder eigen
 * parametrisch beeld (InvoerPaneel.tsx).
 *
 * De velden komen uit het doorgerekende blad, niet uit de tekst: zo staat er precies wat
 * de uitwerking ook toont. Een veld in een tak van `#if` die niet gekozen is of achter
 * `#hide` staat er niet, en de koppen en toelichtingen staan in de taal van de uitvoer
 * (templates/vertalingen.ts). De naam waarop de invoer wordt opgeslagen blijft die uit de
 * rekentekst.
 *
 * Zuiver, zonder React of stores: de rekenworker en scripts/check-invoerpaneel.mjs laden
 * dit.
 */
import { invoerNaarBron, leesVerwijzing, toonInvoer, type EvaluatedNode } from "@ifc-calc/core";
import { isCanvasBlad } from "../../../store/canvasBlad.ts";
import { VLOER_OP_PALEN, VLOER_VEREIST } from "./vloerOpPalen.ts";

/** Een stukje toelichting; `stand` voor een index of een macht. */
export interface TekstDeel {
  tekst: string;
  stand?: "sub" | "sup";
}

/** Een invoerveld zoals het paneel het toont. */
export interface PaneelVeld {
  /** De naam in de rekentekst: de sleutel waarop de invoer wordt opgeslagen. */
  naam: string;
  /** De naam in beeld: die van de vertaling als het blad er een heeft. */
  toonNaam: string;
  soort: "invoer" | "keuze";
  /** De toelichting naast het veld in het blad, of het label van een keuzelijst. */
  label: TekstDeel[];
  /** De eenheid van de bladtekst; daarin wordt opgeslagen. Leeg bij een kaal getal. */
  eenheid: string;
  /** De eenheid in beeld: die van het eenhedenstelsel, anders die van het blad. */
  toonEenheid: string;
  /** Wat het blad nu in het veld toont; bij een keuzelijst de gekozen waarde. */
  waarde: string;
  /** De standaardwaarde in de eenheid in beeld; bij een keuzelijst de eerste keuze. */
  standaard: string;
  /** Alleen bij een keuzelijst. */
  keuzes: { tekst: string; waarde: string }[];
}

/** De velden onder één kop van het blad. */
export interface PaneelGroep {
  /** Leeg voor velden vóór de eerste kop. */
  kop: string;
  velden: PaneelVeld[];
}

export interface BladInvoer {
  groepen: PaneelGroep[];
  /** Een `@fem`- of `@toets`-blok wacht op het antwoord van Open FEM Studio. */
  wachtOpFem: boolean;
}

const ENTITEITEN: Readonly<Record<string, string>> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", middot: "·", times: "×",
  le: "≤", ge: "≥", deg: "°", plusmn: "±", ndash: "–", mdash: "—", hellip: "…",
};

function ontcijfer(tekst: string): string {
  return tekst.replace(/&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);/g, (heel, naam: string) => {
    if (naam[0] !== "#") return ENTITEITEN[naam.toLowerCase()] ?? heel;
    const code = /^#[xX]/.test(naam) ? parseInt(naam.slice(2), 16) : parseInt(naam.slice(1), 10);
    try {
      return String.fromCodePoint(code);
    } catch {
      return heel;
    }
  });
}

/**
 * Een toelichting uit het blad als tekst voor het paneel: het leesteken waarmee hij achter
 * het veld begint (", hoogte") en de opmaak vallen weg, een index of macht blijft. Wat
 * alleen op papier staat (`alleen-afdruk`) hoort niet op het scherm.
 */
export function tekstDelen(html: string): TekstDeel[] {
  const opScherm = html.replace(/<span class="alleen-afdruk">[\s\S]*?<\/span>/g, "");
  const delen: TekstDeel[] = [];
  let stand: "sub" | "sup" | undefined;
  for (const stuk of opScherm.split(/(<[^>]*>)/)) {
    if (stuk.startsWith("<") && stuk.endsWith(">")) {
      const m = stuk.match(/^<(\/?)(sub|sup)\b/i);
      if (m) stand = m[1] ? undefined : (m[2].toLowerCase() as "sub" | "sup");
      continue;
    }
    const tekst = ontcijfer(stuk).replace(/\s+/g, " ");
    if (tekst === "") continue;
    const vorige = delen[delen.length - 1];
    if (vorige && vorige.stand === stand) vorige.tekst += tekst;
    else delen.push(stand ? { tekst, stand } : { tekst });
  }
  if (delen.length > 0 && !delen[0].stand) delen[0].tekst = delen[0].tekst.replace(/^[\s,;:–—-]+/, "");
  if (delen.length > 0) delen[delen.length - 1].tekst = delen[delen.length - 1].tekst.replace(/\s+$/, "");
  return delen.filter((d) => d.tekst !== "");
}

/** De toelichting als één tekst, voor een tooltip. */
export function platTekst(delen: readonly TekstDeel[]): string {
  return delen.map((d) => d.tekst).join("");
}

/** Een naam met zijn index: `L_x` is L met index x, `ε_cs_EC` is ε met index cs,EC. */
export function naamDelen(naam: string): { basis: string; index: string } {
  const i = naam.indexOf("_");
  return i > 0 ? { basis: naam.slice(0, i), index: naam.slice(i + 1).replace(/_/g, ",") } : { basis: naam, index: "" };
}

/**
 * De invoervelden van een doorgerekend blad, in de volgorde van het blad en onder zijn
 * koppen. Een kop zonder velden vervalt; een naam die twee keer voorkomt (een lus) telt
 * één keer. `namen`: de weergavenamen van de vertaling (uitvoerTaal.ts).
 */
export function leesInvoer(nodes: readonly EvaluatedNode[], namen: Readonly<Record<string, string>> = {}): BladInvoer {
  const groepen: PaneelGroep[] = [];
  const gezien = new Set<string>();
  const stand: { kop: string; groep: PaneelGroep | null; wachtOpFem: boolean } = { kop: "", groep: null, wachtOpFem: false };
  const voegToe = (veld: PaneelVeld) => {
    if (!stand.groep) {
      stand.groep = { kop: stand.kop, velden: [] };
      groepen.push(stand.groep);
    }
    stand.groep.velden.push(veld);
  };
  const loop = (lijst: readonly EvaluatedNode[]) => {
    lijst.forEach((n, i) => {
      if (n.type === "heading") {
        stand.kop = n.text.trim();
        stand.groep = null;
      } else if (n.type === "conditional-branch") {
        loop(n.children);
      } else if (n.type === "fem" || n.type === "toets") {
        if (n.status === "wacht") stand.wachtOpFem = true;
      } else if (n.type === "input-prompt") {
        if (gezien.has(n.name)) return;
        gezien.add(n.name);
        const naast = lijst[i + 1];
        const toelichting = naast?.type === "text" && naast.inline
          ? (naast.html ? naast.text : naast.text.replace(/&/g, "&amp;").replace(/</g, "&lt;"))
          : "";
        voegToe({
          naam: n.name,
          toonNaam: namen[n.name] ?? n.name,
          soort: "invoer",
          label: tekstDelen(toelichting),
          eenheid: n.unit,
          toonEenheid: n.toonEenheid ?? n.unit,
          waarde: n.currentValue,
          standaard: n.standaard ?? "0",
          keuzes: [],
        });
      } else if (n.type === "select") {
        if (gezien.has(n.name)) return;
        gezien.add(n.name);
        voegToe({
          naam: n.name,
          toonNaam: namen[n.name] ?? n.name,
          soort: "keuze",
          label: tekstDelen(n.label.replace(/&/g, "&amp;").replace(/</g, "&lt;")),
          eenheid: "",
          toonEenheid: "",
          waarde: n.selectedValue,
          standaard: n.options[0]?.value ?? "0",
          keuzes: n.options.map((o) => ({ tekst: o.text, waarde: o.value })),
        });
      }
    });
  };
  loop(nodes);
  return { groepen, wachtOpFem: stand.wachtOpFem };
}

/**
 * Wat iemand in een veld van het paneel typt, in de eenheid van het blad: zoals een
 * invoerveld in de uitwerking (Preview.tsx). Met een eenheid erachter geldt de waarde in
 * die eenheid, een verwijzing naar een ander blad (`#2.R_paal`) gaat mee zoals getypt, en
 * een eenheid die niet past of niet af is geeft een fout: dan wordt er niets opgeslagen.
 */
export function leesGetypt(veld: Pick<PaneelVeld, "eenheid" | "toonEenheid">, tekst: string): { waarde: string } | { fout: string } {
  if (leesVerwijzing(tekst)) return { waarde: tekst.trim() };
  if (!veld.eenheid) return { waarde: tekst };
  return invoerNaarBron(tekst, veld.toonEenheid || veld.eenheid, veld.eenheid);
}

/**
 * Wat een veld toont zolang niemand erin typt: de opgeslagen waarde in de eenheid in
 * beeld, of de standaardwaarde van het blad als er niets is opgeslagen. Uit de opgeslagen
 * invoer en niet uit de laatste doorrekening: die loopt achter zolang er gerekend wordt.
 */
export function inBeeld(veld: Pick<PaneelVeld, "eenheid" | "toonEenheid" | "standaard">, opgeslagen: string | undefined): string {
  if (opgeslagen === undefined) return veld.standaard;
  if (!veld.eenheid || veld.toonEenheid === veld.eenheid || leesVerwijzing(opgeslagen)) return opgeslagen;
  return toonInvoer(opgeslagen, veld.eenheid, veld.toonEenheid);
}

const IDENT = "[\\p{L}_][\\p{L}\\p{N}_,]*";
const VELD_RE = new RegExp(`^[ \\t]*(${IDENT})[ \\t]*=[ \\t]*\\?(.*)$`, "u");
const HEEFT_VELD_RE = new RegExp(`^[ \\t]*${IDENT}[ \\t]*=[ \\t]*\\?`, "mu");
const KEUZE_RE = /^[ \t]*@select[ \t]+([A-Za-z_]\w*)[ \t]+"/;

/**
 * Heeft deze bladtekst invoer: een `?`-veld of een keuzelijst? Uit de tekst zelf, zonder
 * inlezen: de werkruimte vraagt dit bij elke toetsaanslag in de editor.
 */
export function heeftInvoer(source: string): boolean {
  return HEEFT_VELD_RE.test(source) || /^[ \t]*@select\b/m.test(source);
}

/** Waarmee een veld rekent zolang er niets is ingevuld, en in welke eenheid. */
export interface Standaard {
  beginwaarde: string;
  eenheid: string;
}

/**
 * De standaardwaarde en de eenheid van elk invoerveld in de tekst, ook van een veld
 * achter een voorwaarde. Voor een beeld dat de invoer volgt zonder op de doorrekening te
 * wachten. Leest een regel zoals de rekenkern: `L = ?{5000}mm`, `q = ? {2.5}*(kN/m)`, en
 * bij een keuzelijst de eerste keuze.
 */
export function standaardInvoer(source: string): Record<string, Standaard> {
  const uit: Record<string, Standaard> = {};
  const regels = source.split(/\r?\n/);
  for (let i = 0; i < regels.length; i++) {
    const keuze = regels[i].match(KEUZE_RE);
    if (keuze) {
      let eerste: string | undefined;
      let j = i + 1;
      for (; j < regels.length && !/^\s*@end\b/.test(regels[j]); j++) {
        const optie = regels[j].trim();
        if (eerste !== undefined || optie === "" || optie.startsWith("//")) continue;
        // De waarde staat na de laatste "=": het label mag er zelf een bevatten.
        const m = optie.match(/^(.+)\s*=\s*(.+)$/);
        if (m) eerste = m[2].trim();
      }
      if (!(keuze[1] in uit)) uit[keuze[1]] = { beginwaarde: eerste ?? "0", eenheid: "" };
      i = j;
      continue;
    }
    const veld = regels[i].match(VELD_RE);
    if (!veld) continue;
    const naam = veld[1].replace(/,/g, "_");
    if (naam in uit) continue;
    // Tot de toelichting: die begint bij de eerste apostrof.
    let rest = veld[2].split("'")[0].trim();
    let beginwaarde = "0";
    if (rest.startsWith("{")) {
      const sluit = rest.indexOf("}");
      if (sluit !== -1) {
        const w = rest.slice(1, sluit).trim();
        if (w !== "") beginwaarde = w;
        rest = rest.slice(sluit + 1).trim();
      }
    }
    if (rest.startsWith("*")) rest = rest.slice(1).trim();
    if (rest.startsWith("(") && rest.endsWith(")")) rest = rest.slice(1, -1).trim();
    uit[naam] = { beginwaarde, eenheid: rest };
  }
  return uit;
}

/** De pauze na de laatste toetsaanslag waarna een veld zijn waarde naar het blad stuurt. */
const PAUZE_MS = 600;
/**
 * Een blad met een `@fem`- of `@toets`-blok laat Open FEM Studio rekenen: een halve
 * invoer kost daar seconden. Zo'n blad wacht langer; het veld verlaten of Enter stuurt
 * altijd meteen.
 */
const PAUZE_FEM_MS = 1500;

export function pauzeVoor(source: string): number {
  return /^[ \t]*@(?:fem|toets)\b/m.test(source) ? PAUZE_FEM_MS : PAUZE_MS;
}

/**
 * Welk invoerscherm een blad krijgt:
 *   - `null`: geen. Het blad heeft een eigen parametrisch beeld (designerKeuze.tsx), een
 *     eigen scherm (een canvas) of geen invoer;
 *   - `vloer-op-palen`: het formulier met de plattegrond en de doorsnede erboven. Hangt aan
 *     het `templateId` van de module uit de modulebibliotheek, en alleen zolang de tekst de
 *     maten van de vloer nog als invoer heeft;
 *   - `paneel`: het formulier uit de velden van het blad.
 */
export function schermSoort(ex: { templateId?: string; source: string }, eigenBeeld: boolean): "vloer-op-palen" | "paneel" | null {
  if (eigenBeeld || isCanvasBlad(ex) || !heeftInvoer(ex.source)) return null;
  if (ex.templateId === VLOER_OP_PALEN) {
    const velden = standaardInvoer(ex.source);
    if (VLOER_VEREIST.every((naam) => velden[naam])) return "vloer-op-palen";
  }
  return "paneel";
}

/**
 * De bladen waar je de rekentekst schrijft of leest: een rekenblad dat leeg begon (ook een
 * voorbeeld uit de bibliotheek; store/moduleKiezer.ts, LEEG_BLAD), een los geopend bestand
 * zonder module, en de demo van de rekentaal.
 */
const OPENT_MET_CODE: ReadonlySet<string> = new Set(["", "leeg", "rekentaal-demo"]);

/**
 * Opent dit blad met zijn invoerscherm? Een module wel: daar vul je in. Een blad uit
 * OPENT_MET_CODE opent met de code, zoals altijd, en heeft het invoerscherm als tab erbij.
 */
export function opentMetInvoer(ex: { templateId?: string }): boolean {
  return !OPENT_MET_CODE.has(ex.templateId ?? "");
}
