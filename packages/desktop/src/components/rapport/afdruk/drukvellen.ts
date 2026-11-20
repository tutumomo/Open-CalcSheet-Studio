/**
 * Afdrukken zoals het afdrukvoorbeeld het toont, voor het rapport en voor losse bladen.
 *
 * Het voorbeeld bouwt zelf exacte vellen, met hun kop, voet en paginanummer. Laat je de
 * browser zelf pagineren, dan zet hij een vastgezette kop of voet op de verkeerde plek,
 * tot midden op de pagina, en vallen koppen weg. Daarom gaat een kopie van díe vellen naar
 * de printer: wat je in het voorbeeld ziet, komt op papier.
 *
 * Die printer is de printdialoog of, bij de knop Rapport (PDF), een bestand. De app
 * blijft daarbij op het scherm staan; alleen de afdruk ziet de kopie (RapportAfdruk.css).
 */

import i18next from "../../../i18n/config";
import { meldRapportPdfFout, schrijfRapportPdf, type PdfKop } from "../../../tauri/rapportPdf";
import { iframesNaarDruk } from "../../calc/iframeBlok";

const VELLEN = ".av-vellen-binnen .av-pagina";

/**
 * Wat nog getekend wordt: de pagina's van een PDF-blad (components/calc/
 * PdfBladWeergave.tsx). Zolang er zo'n element is, is de afdruk nog niet compleet.
 */
const LAADT = "[data-afdruk-laadt]";

/** Zo lang mag het tekenen van PDF-bladen hooguit stilstaan voordat de afdruk opgeeft. */
const MAX_LADEN_MS = 180000;

/** Een langere stilte tussen twee keer kijken: de hoofdthread was bezig, dus er gebeurt iets. */
const BEZIG_MS = 1000;

/**
 * Wacht tot het voorbeeld zijn vellen heeft gebouwd en het aantal stil staat,
 * tot er in de meetopstelling en op de vellen niets meer wordt getekend, en tot er
 * geen nieuwe verdeling op komst is (`data-opnieuw`, AfdrukVoorbeeld.tsx): anders
 * gaat er een kopie van vellen naar de printer die het voorbeeld net vervangt.
 *
 * `maxMs` is hoe lang er niets mag gebeuren, niet hoe lang het mag duren: de bladen
 * doorrekenen zet de hoofdthread vast, en bij een groot project kost de eerste
 * verdeling zo tien seconden. Zolang PDF-pagina's laden, geldt de ruimere grens
 * MAX_LADEN_MS.
 */
export function wachtOpVellen(maxMs = 10000): Promise<HTMLElement[]> {
  return new Promise((klaar, mis) => {
    let beweging = Date.now();
    let vorigeKeer = beweging;
    let vorige = -1;
    const kijk = () => {
      const nu = Date.now();
      const vellen = [...document.querySelectorAll<HTMLElement>(VELLEN)];
      const laadt = document.querySelector(`.av-meet ${LAADT}, .av-vellen-binnen ${LAADT}`) !== null;
      const opnieuw = document.querySelector(".av-meet[data-opnieuw]") !== null;
      if (vellen.length > 0 && vellen.length === vorige && !laadt && !opnieuw) return klaar(vellen);
      if (opnieuw || vellen.length !== vorige || nu - vorigeKeer > BEZIG_MS) beweging = nu;
      vorige = vellen.length;
      vorigeKeer = nu;
      if (nu - beweging > (laadt ? MAX_LADEN_MS : maxMs)) {
        return mis(new Error(laadt
          ? i18next.t("werkruimte:pdf.nietOpTijd")
          : i18next.t("werkruimte:fouten.geenVellen")));
      }
      window.setTimeout(kijk, 300);
    };
    kijk();
  });
}

/**
 * Wacht tot de afbeeldingen op de kopie er zijn: een PDF-pagina is een afbeelding,
 * en die mag niet als leeg vak op papier komen. Een afbeelding die niet lukt, houdt
 * de afdruk niet tegen.
 */
export async function wachtOpDrukbeelden(): Promise<void> {
  await Promise.all([...document.querySelectorAll<HTMLImageElement>(".rpa-drukvellen img")]
    .map((b) => (b.complete ? null : b.decode().catch(() => null))));
}

/**
 * Schrijft de klaargezette vellen naar een bestand. Lukt dat niet, dan zegt een melding
 * waarom en geeft dit `false`: de aanroeper valt terug op de printdialoog, waar je een
 * andere plek kunt kiezen.
 */
export async function vellenNaarPdf(pad: string): Promise<boolean> {
  try {
    await schrijfRapportPdf(pad, drukKoppen);
    return true;
  } catch (err) {
    await meldRapportPdfFout(pad, err);
    return false;
  }
}

/** De bladwijzers van de vellen die nu klaarstaan (zetDrukvellenKlaar); leeg als er niets klaarstaat. */
let drukKoppen: PdfKop[] = [];

/** De bladwijzers bij de vellen die nu klaarstaan, voor wie de PDF zelf wegschrijft. */
export const klaargezetteKoppen = (): readonly PdfKop[] => drukKoppen;

/**
 * Het niveau van een regel uit de inhoudsopgave voor de bladwijzers: een hoofdstuk of een
 * bijlage is 1, een paragraaf of een blad ("5.2", "A.3") is 2, een kop uit een blad is 3.
 */
export function kopNiveau(nummer: string, kopUitBlad: boolean): number {
  if (kopUitBlad) return 3;
  return /^(?:\d+|[A-Z]+)\.\d+/.test(nummer.trim()) ? 2 : 1;
}

/** Zet de inhoud van `el` in een link naar `id`. */
function inLink(el: HTMLElement, id: string) {
  const link = document.createElement("a");
  link.href = `#${id}`;
  link.className = "inhoud-link";
  link.append(...el.childNodes);
  el.append(link);
}

/**
 * Het nummer waar een kop mee begint: "5.2" van "5.2 Sneeuwbelastingen", "6" van
 * "6 Berekeningen", "A.3" van een blad in bijlage A en "A" van de kop van bijlage A.
 */
export function kopNummer(tekst: string, anker: string): string | null {
  const bijlage = /^bijlage-([A-Z]+)$/.exec(anker);
  if (bijlage) return bijlage[1];
  const t = tekst.trim();
  return /^[A-Z]+\.\d+/.exec(t)?.[0] ?? /^(\d+(?:\.\d+)*)(?=\s|$)/.exec(t)?.[1] ?? null;
}

/**
 * Een verwijzing in lopende tekst: "zie 5.2", "paragraaf 6.3", "bijlage A.3", "hoofdstuk 4",
 * ook in het Engels. Het woord ervoor hoort erbij: een los getal als "2.5" is een maat.
 */
const VERWIJZING_RE = /((?:zie(?:\s+ook)?|see(?:\s+also)?|paragraaf|par\.|§|section|hoofdstuk|chapter|bijlage|appendix)\s+)([A-Z]+\.\d+|\d+(?:\.\d+)*|[A-Z](?![\p{L}\p{N}.]))/giu;

/** De stukken van een tekst: gewone tekst, en verwijzingen naar een nummer dat `bekend` kent. */
export function verwijzingenIn(tekst: string, bekend: (nummer: string) => boolean): { tekst: string; nummer?: string }[] {
  const uit: { tekst: string; nummer?: string }[] = [];
  let vanaf = 0;
  for (const m of tekst.matchAll(VERWIJZING_RE)) {
    const nummer = m[2];
    if (!bekend(nummer)) continue;
    const begin = m.index + m[1].length;
    if (begin > vanaf) uit.push({ tekst: tekst.slice(vanaf, begin) });
    uit.push({ tekst: nummer, nummer });
    vanaf = begin + nummer.length;
  }
  if (vanaf < tekst.length) uit.push({ tekst: tekst.slice(vanaf) });
  return uit;
}

/**
 * Maakt het rapport doorklikbaar in de PDF. Elke regel van een inhoudsopgave is een link
 * naar zijn kop: het nummer, de titel en het paginanummer. Een verwijzing in de tekst van
 * het rapport of van een blad ("zie 5.2", "bijlage A.3") is een link naar die paragraaf of
 * dat blad. Alleen op de
 * kopie: daar staat elke kop één keer, en een id op de vellen van het voorbeeld zou er
 * dan dubbel zijn.
 */
export function linkInhoud(wortel: HTMLElement): PdfKop[] {
  const koppen: PdfKop[] = [];
  const gezien = new Set<string>();
  const ids = new Map<string, string>();
  const opNummer = new Map<string, string>();
  for (const kop of wortel.querySelectorAll<HTMLElement>("[data-inhoud]")) {
    const anker = kop.dataset.inhoud ?? "";
    if (!anker || ids.has(anker)) continue;
    const id = `inhoud-${ids.size + 1}`;
    kop.id = id;
    ids.set(anker, id);
    // Het eerste wint: een kop uit een blad die toevallig zo begint, komt later.
    const nummer = kopNummer(kop.textContent ?? "", anker);
    if (nummer && !opNummer.has(nummer)) opNummer.set(nummer, id);
  }
  for (const doel of wortel.querySelectorAll<HTMLElement>("[data-inhoud-doel]")) {
    const id = ids.get(doel.dataset.inhoudDoel ?? "");
    if (!id || !doel.textContent) continue;
    // De hele regel: elk vak van de rij is een link, niet alleen het paginanummer.
    const rij = doel.closest<HTMLElement>(".rpa-rij, .print-inhoud-rij");
    const vakken = rij ? ([...rij.children] as HTMLElement[]).filter((v) => v.textContent && !v.querySelector("a")) : [];
    // De inhoudsopgave voorin is ook de lijst van bladwijzers: elke regel één keer.
    if (rij && rij.closest(".rpa-inhoud") && !gezien.has(id)) {
      const delen = ([...rij.children] as HTMLElement[]).filter((v) => !v.contains(doel)).map((v) => (v.textContent ?? "").trim()).filter(Boolean);
      const titel = delen.join(" ");
      if (titel) {
        gezien.add(id);
        koppen.push({ titel, niveau: kopNiveau(delen[0], rij.querySelector(".rpa-io-kop3") !== null), doel: id });
      }
    }
    if (vakken.length) for (const vak of vakken) inLink(vak, id);
    else inLink(doel, id);
  }
  // Verwijzingen in de lopende tekst van het rapport en in de uitwerking van een blad:
  // een tekstregel, een cel van een tabel. Niet in een formule of een tekening.
  if (opNummer.size === 0) return koppen;
  for (const alinea of wortel.querySelectorAll<HTMLElement>(".rpa-tekst, .ifc-calc")) {
    const loper = document.createTreeWalker(alinea, NodeFilter.SHOW_TEXT);
    const teksten: Text[] = [];
    for (let n = loper.nextNode(); n; n = loper.nextNode()) {
      if (!n.parentElement?.closest("a, .katex, svg, script, style")) teksten.push(n as Text);
    }
    for (const knoop of teksten) {
      const stukken = verwijzingenIn(knoop.data, (nummer) => opNummer.has(nummer));
      if (!stukken.some((s) => s.nummer)) continue;
      knoop.replaceWith(...stukken.map((s) => {
        if (!s.nummer) return document.createTextNode(s.tekst);
        const link = document.createElement("a");
        link.href = `#${opNummer.get(s.nummer)}`;
        link.className = "tekst-link";
        link.textContent = s.tekst;
        return link;
      }));
    }
  }
  return koppen;
}

/**
 * Zet een kopie van de vellen klaar om af te drukken; op papier is er niets anders
 * dan die kopie. Geeft de functie terug die alles weer opruimt.
 */
export function zetDrukvellenKlaar(vellen: HTMLElement[]): () => void {
  const bak = document.createElement("div");
  bak.className = "rpa-drukvellen";
  for (const vel of vellen) bak.appendChild(vel.cloneNode(true));
  drukKoppen = linkInhoud(bak);
  // Een gekopieerd iframe begint opnieuw en komt leeg op papier: de geladen
  // iframes verhuizen zolang naar de kopie.
  const verhuis = iframesNaarDruk(vellen, bak);
  document.body.appendChild(bak);
  const iframesTerug = verhuis();
  document.documentElement.classList.add("rapportdruk");
  return () => {
    iframesTerug();
    bak.remove();
    drukKoppen = [];
    document.documentElement.classList.remove("rapportdruk");
  };
}
