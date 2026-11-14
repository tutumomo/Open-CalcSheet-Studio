/**
 * De Taiwanese kop- en voetgegevens van een calculatieboek: het blok van de
 * ondertekenende ingenieur, de doorlopende kop- en voettekst en de nummering
 * van tabellen en figuren (docs/OCSS_TW_開發需求規格.md, P2-16).
 *
 * Alles is optioneel en leeg van zichzelf: een Taiwanees rapport zonder ingevuld
 * blok ziet er precies zo uit als voorheen. Zodra er iets staat, komt het op het
 * voorblad of in de marge. De waarden staan in het rapport zelf (en dus in het
 * projectbestand), zodat een opgeleverd rapport niet meewisselt met een later
 * gewijzigd bureauprofiel.
 *
 * De paden zijn rechtstreeks met `report_set` te zetten, bijvoorbeeld
 * `tw.handtekening.naam` of `tw.kopvoet.kop`.
 */
/** Het blok van de ondertekenende ingenieur op het voorblad. */
export interface TwHandtekening {
  /** Naam met titel, zoals hij onder het blok staat: "王大明 技師". */
  naam: string;
  /** De vakgebieden waarin wordt ondertekend: "結構" of "結構、大地". */
  vakgebied: string;
  /** Het nummer van de beroepsregistratie (技師證書字號). */
  nummer: string;
  /** De instantie die het nummer uitgaf (主管機關). */
  instantie: string;
  /**
   * De datum onder de handtekening (jjjj-mm-dd). Leeg = de datum van de eerste
   * revisie, zodat het blok niet leeg blijft als niemand hem invult.
   */
  datum: string;
  /** De naam van het bureau of de afdeling boven de handtekening. */
  bureau: string;
  /** Een ondertekende handtekening als data-URL; leeg = alleen de naam. */
  beeld: string;
  /** Op het voorblad tonen. Zonder naam, nummer en beeld blijft het blok weg. */
  tonen: boolean;
}

/** De doorlopende kop- en voettekst boven en onder elke pagina. */
export interface TwKopvoet {
  /**
   * De kopregel. Plaatshouders: `{titel}`, `{projectnaam}`, `{kenmerk}`,
   * `{datum}`, `{revisie}`, `{pagina}`. Leeg = geen kopregel.
   */
  kop: string;
  /** De voetregel, zelfde plaatshouders. Leeg = de voet van het bureau, zoals voorheen. */
  voet: string;
}

/**
 * De nummering van de tabellen en figuren in de tekst.
 *
 * Een tekening gaat als heel vel door de bladafdruk, met haar eigen titelhoek.
 * Het figuurnummer gaat daarom niet als bijschriftregel boven het vel — dat zou
 * op de vorige pagina belanden — maar in die titelhoek, vóór de naam van het
 * blad: "圖 6-1 樑配筋圖". Een tekening in bijlage A houdt haar bijlagenummer
 * ("A.3"), want de tekst en de inhoudsopgave verwijzen daarnaar.
 */
export interface TwNummering {
  /** "表 4-1" boven elke tabel van het rapport zelf. */
  tabellen: boolean;
  /** "圖 6-1" in de titelhoek van elke tekening die in het hoofdstuk zelf staat. */
  figuren: boolean;
}

export interface TwOpzet {
  handtekening: TwHandtekening;
  kopvoet: TwKopvoet;
  nummering: TwNummering;
}

/** De stand: een leeg blok, geen kop- en voetregel, geen nummering. */
export const STANDAARD_TW: TwOpzet = {
  handtekening: { naam: "", vakgebied: "", nummer: "", instantie: "", datum: "", bureau: "", beeld: "", tonen: true },
  kopvoet: { kop: "", voet: "" },
  nummering: { tabellen: false, figuren: false },
};

const tekst = (x: unknown, standaard: string): string => (typeof x === "string" ? x : standaard);
const ja = (x: unknown, standaard: boolean): boolean => (typeof x === "boolean" ? x : standaard);
const object = (x: unknown): Record<string, unknown> | null =>
  x !== null && typeof x === "object" && !Array.isArray(x) ? (x as Record<string, unknown>) : null;

/** Een `tw`-blok uit een bestand, aangevuld met de stand. */
export function normaliseerTw(x: unknown): TwOpzet {
  const o = object(x) ?? {};
  const h = object(o.handtekening) ?? {};
  const k = object(o.kopvoet) ?? {};
  const n = object(o.nummering) ?? {};
  const s = STANDAARD_TW;
  return {
    handtekening: {
      naam: tekst(h.naam, s.handtekening.naam),
      vakgebied: tekst(h.vakgebied, s.handtekening.vakgebied),
      nummer: tekst(h.nummer, s.handtekening.nummer),
      instantie: tekst(h.instantie, s.handtekening.instantie),
      datum: tekst(h.datum, s.handtekening.datum),
      bureau: tekst(h.bureau, s.handtekening.bureau),
      beeld: tekst(h.beeld, s.handtekening.beeld),
      tonen: ja(h.tonen, s.handtekening.tonen),
    },
    kopvoet: { kop: tekst(k.kop, s.kopvoet.kop), voet: tekst(k.voet, s.kopvoet.voet) },
    nummering: {
      tabellen: ja(n.tabellen, s.nummering.tabellen),
      figuren: ja(n.figuren, s.nummering.figuren),
    },
  };
}

/** Staat er iets in het handtekeningblok dat de moeite van het tonen waard is? */
export function heeftHandtekening(h: TwHandtekening): boolean {
  return h.tonen && [h.naam, h.nummer, h.beeld].some((w) => w.trim() !== "");
}

/** De waarden die een kop- of voetregel kan noemen. */
export interface KopvoetVelden {
  titel: string;
  projectnaam: string;
  kenmerk: string;
  datum: string;
  revisie: string;
  /** Het paginanummer, als de aanroeper het weet (de browser kent het zelf niet in tekst). */
  pagina?: string;
}

/**
 * Vult de plaatshouders van een kop- of voetregel in. Een onbekende plaatshouder
 * blijft staan, zodat een typefout zichtbaar is in plaats van stil te verdwijnen.
 */
export function vulKopvoet(regel: string, velden: KopvoetVelden): string {
  return regel.replace(/\{([a-zA-Z]+)\}/g, (heel, naam: string) => {
    const w = (velden as unknown as Record<string, string | undefined>)[naam.toLowerCase()];
    return w === undefined ? heel : w;
  }).trim();
}
