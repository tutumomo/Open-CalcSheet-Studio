/**
 * Wat de AI-zijbalk over het project weet voordat de gebruiker iets vraagt
 * (docs/OCSS_TW_開發需求規格.md, P2-15: "context automatisch meenemen").
 *
 * De assistent krijgt: het project, de lijst bladen, het blad waaraan gewerkt
 * wordt (rekentekst én invoer), de laatste doorrekening met de eenheidswaarschuwingen,
 * en wat de gebruiker met `@naam` zelf aanwees.
 *
 * Zuiver, zodat `scripts/check-ai-agent.mjs` het zonder app kan nalopen.
 */
import { MCP_INSTRUCTIES } from "../../mcp/dispatcher.ts";

export interface BladKort {
  id: string;
  naam: string;
  templateId: string;
  /** De verwijzing in de rekentaal (`#2`), als het blad die heeft. */
  ref?: string;
}

export interface ActiefBlad extends BladKort {
  source: string;
  waarden: Record<string, string>;
}

export interface LaatsteUitkomst {
  titel?: string;
  uc?: number | string | null;
  voldoet?: boolean | null;
  check?: string;
  warnings?: string[];
  /** De regels met een fout, als er een doorrekening misging. */
  fouten?: string[];
}

export interface ExternServerKort {
  id: string;
  naam: string;
  tools: string[];
}

export interface SysteemOpties {
  /** De taal van de app; de assistent antwoordt daarin. */
  taal: string;
  projectNaam: string;
  bladen: BladKort[];
  actief: ActiefBlad | null;
  uitkomst?: LaatsteUitkomst | null;
  /** De bladen die de gebruiker met `@naam` aanwees; leeg = alles. */
  bereik?: BladKort[];
  /** Verbonden externe MCP-servers (bijv. regs, ontwerp-engine, OpenCADStudio). */
  externeServers?: ExternServerKort[];
  /** Hoeveel tekens rekentekst er mee mag (standaard 8000). */
  maxBron?: number;
}

const TAALNAAM: Record<string, string> = {
  nl: "Dutch",
  en: "English",
  "zh-TW": "Traditional Chinese (zh-TW)",
};

/**
 * De systeemprompt: wie de assistent is, wat het project is en waaraan gewerkt
 * wordt. De vaste uitleg over de app komt uit `MCP_INSTRUCTIES`, zodat de
 * zijbalk en een MCP-client hetzelfde horen.
 */
export function bouwSysteemtekst(opties: SysteemOpties): string {
  const maxBron = opties.maxBron ?? 8000;
  const taal = TAALNAAM[opties.taal] ?? opties.taal;
  const delen: string[] = [];

  delen.push(
    [
      "You are the assistant inside Open CalcSheet Studio, working in the sidebar next to the user's calculation book.",
      "You change the project only through the tools; every change the user can undo with Ctrl+Z.",
      "The user sees each tool call in a step list. Destructive steps and overwriting existing content are confirmed by the user first, so do not ask for permission yourself: just call the tool.",
      "Never invent design values. If a value is missing, ask for it or use a clearly stated assumption.",
      `Answer in ${taal}, short and concrete. Quote numbers with their unit and the clause they come from.`,
    ].join("\n"),
  );

  delen.push(`\n# The app\n${MCP_INSTRUCTIES}`);

  const kop = [`\n# The project`, `Name: ${opties.projectNaam || "(untitled)"}`];
  if (opties.bladen.length === 0) {
    kop.push("The project has no sheets yet.");
  } else {
    const bereik = opties.bereik && opties.bereik.length > 0 ? new Set(opties.bereik.map((b) => b.id)) : null;
    kop.push("Sheets:");
    for (const b of opties.bladen) {
      const inBereik = bereik === null || bereik.has(b.id);
      const verwijzing = b.ref ? ` #${b.ref}` : "";
      kop.push(`- ${b.naam}${verwijzing} (id ${b.id}, module ${b.templateId})${inBereik ? "" : "  [outside the scope the user named]"}`);
    }
  }
  delen.push(kop.join("\n"));

  if (opties.actief) {
    const a = opties.actief;
    const waarden = Object.entries(a.waarden);
    const bron = a.source.length > maxBron ? `${a.source.slice(0, maxBron)}\n… (${a.source.length - maxBron} characters left out)` : a.source;
    const blok = [
      `\n# The sheet on screen: ${a.naam} (id ${a.id}, module ${a.templateId})`,
      "Inputs:",
      waarden.length === 0 ? "(none set)" : waarden.map(([k, v]) => `- ${k} = ${v}`).join("\n"),
      "Calculation text:",
      "```",
      bron,
      "```",
    ];
    delen.push(blok.join("\n"));
  }

  if (opties.uitkomst) {
    const u = opties.uitkomst;
    const regels = [
      `\n# The last calculation of that sheet`,
      `title: ${u.titel ?? "(none)"}`,
      `check: ${u.check ?? "unchecked"}`,
      `UC: ${u.uc ?? "(none)"}`,
      `passes: ${u.voldoet === null || u.voldoet === undefined ? "(not verified)" : u.voldoet}`,
    ];
    if (u.warnings && u.warnings.length > 0) regels.push(`warnings: ${u.warnings.join("; ")}`);
    if (u.fouten && u.fouten.length > 0) regels.push(`errors: ${u.fouten.slice(0, 10).join("; ")}`);
    delen.push(regels.join("\n"));
  }

  if (opties.externeServers && opties.externeServers.length > 0) {
    const regels = [`\n# Connected external MCP servers`];
    for (const s of opties.externeServers) {
      const lijst = s.tools.length > 0 ? s.tools.join(", ") : "(no tools)";
      regels.push(`- ${s.naam} (${s.id}): ${lijst}`);
    }
    delen.push(regels.join("\n"));
  }

  return delen.join("\n");
}

export interface Bereik {
  /** De bladen die de gebruiker met `@naam` aanwees. */
  bladen: BladKort[];
  /** De vraag zonder de verwijzingen. */
  vraag: string;
  /** De namen die nergens bij passen (de assistent krijgt ze als tekst). */
  onbekend: string[];
}

/**
 * Haalt `@naam` uit de vraag. Een naam met een spatie erin mag ook: eerst wordt
 * gekeken of er een bladnaam op die plek staat (`@Balk B1`), en anders geldt één
 * woord (`@kolom`) of een naam tussen aanhalingstekens (`@"Blad 1"`). `@` midden
 * in een woord (een e-mailadres) telt niet mee.
 */
export function parseBereik(tekst: string, bladen: BladKort[]): Bereik {
  const gevonden: BladKort[] = [];
  const onbekend: string[] = [];
  // De langste naam eerst, zodat "Balk B1" vóór "Balk" gaat.
  const opNaam = [...bladen].sort((a, b) => b.naam.length - a.naam.length);
  const bewaard = (blad: BladKort | undefined, naam: string) => {
    if (blad) {
      if (!gevonden.some((b) => b.id === blad.id)) gevonden.push(blad);
    } else if (naam !== "" && !onbekend.includes(naam)) {
      onbekend.push(naam);
    }
  };

  const delen: string[] = [];
  let vorige = 0;
  const RE = /(^|[\s])@/gu;
  for (let m = RE.exec(tekst); m !== null; m = RE.exec(tekst)) {
    const at = m.index + m[1].length;
    const rest = tekst.slice(at + 1);
    const kop = tekst.slice(vorige, at);
    // 1. Een bladnaam die hier begint (ook met spaties erin).
    const naamHier = opNaam.find((b) => b.naam !== "" && rest.slice(0, b.naam.length).toLowerCase() === b.naam.toLowerCase());
    if (naamHier) {
      bewaard(naamHier, naamHier.naam);
      delen.push(kop);
      vorige = at + 1 + naamHier.naam.length;
      RE.lastIndex = vorige;
      continue;
    }
    // 2. Een naam tussen aanhalingstekens.
    const tussen = /^"([^"]+)"/u.exec(rest);
    if (tussen) {
      const naam = tussen[1].trim();
      const blad = opNaam.find((b) => b.naam.toLowerCase() === naam.toLowerCase()) ?? bladen.find((b) => b.id === tussen[1]);
      bewaard(blad, naam);
      delen.push(kop);
      vorige = at + 1 + tussen[0].length;
      RE.lastIndex = vorige;
      continue;
    }
    // 3. Eén woord; een `@` zonder woord erachter blijft staan.
    const woord = /^[\p{L}\p{N}_][\p{L}\p{N}_-]*/u.exec(rest);
    if (!woord) continue;
    const blad = opNaam.find((b) => b.naam.toLowerCase() === woord[0].toLowerCase()) ?? bladen.find((b) => b.id === woord[0]);
    bewaard(blad, woord[0]);
    delen.push(kop);
    vorige = at + 1 + woord[0].length;
    RE.lastIndex = vorige;
  }
  delen.push(tekst.slice(vorige));
  const vraag = delen.join("").replace(/[ \t]{2,}/gu, " ").trim();
  return { bladen: gevonden, vraag, onbekend };
}
