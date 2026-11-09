/**
 * De hoofdstukindeling van het constructierapport, op één plek vastgelegd.
 *
 * OPZET beschrijft alle onderdelen die een rapport kán hebben. bouwOpzet()
 * maakt daar de indeling van één rapport van: lege optionele onderdelen vallen
 * weg, de nummering loopt daarna door, en hoofdstuk Berekeningen krijgt per
 * rekenblad een paragraaf. Zonder rekenbladen (een uitgangspuntendocument)
 * valt Berekeningen zelf weg. Paneel, inhoudsopgave en afdruk lezen allemaal deze
 * uitkomst, zodat ze het nooit oneens zijn over wat "4.6" is.
 *
 * De titels zijn meertalig; bouwOpzet() geeft ze in rapport.taal. De ids en de ankers
 * (`data-inhoud`) veranderen niet met de taal.
 */
import { inTaal, type Meertalig } from "./meertalig.ts";
import type { Rapport } from "./model.ts";
// ── 台灣版 ────────────────────────────────────────────────────────────────
import { BIJLAGE_TW_A, bouwTwOpzet } from "./tw/opzet.ts";

export type Inhoud =
  | "tekst" | "rol"
  | "bouwwerk" | "brand" | "materialen" | "conservering" | "factoren" | "bestaand" | "vervormingen"
  | "sneeuw" | "wind" | "veranderlijk" | "blijvend"
  | "berekeningen"
  // ── 台灣版 ──
  | "tw-normen";

export interface Knoop {
  /** Ook de sleutel in rapport.teksten als inhoud "tekst" is (of een tekst bij een tabel heeft). */
  id: string;
  titel: Meertalig;
  /**
   * Kop als het rapport geen bestaande situatie beschrijft (nieuwbouw, zie
   * beschrijftBestaand); anders geldt `titel`. Alleen de kop verandert: de
   * tekst blijft onder hetzelfde id staan. Geldt alleen met
   * rapport.opmaak.constructieprincipe (sinds versie 3 van de rapportopbouw).
   */
  titelNieuwbouw?: Meertalig;
  /** 1 hoofdstuk, 2 paragraaf (genummerd), 3 blok (vet, lijn eronder), 4 subblok (vet-cursief). */
  niveau: 1 | 2 | 3 | 4;
  inhoud?: Inhoud;
  /** Weglaten als er niets in staat. */
  optioneel?: boolean;
  /** Standaard: begint op een nieuwe pagina. */
  nieuwePagina?: boolean;
  /** Inspringen van de inhoud in kolommen (hoofdstuk 4 en 5 springen één kolom in). */
  inspringen?: 0 | 1;
  kinderen?: Knoop[];
}

/** Een tekstonderdeel: kop plus tekst uit rapport.teksten, optioneel. */
function tekst(id: string, titel: Meertalig, niveau: 3 | 4): Knoop {
  return { id, titel, niveau, inhoud: "tekst", optioneel: true };
}

export const OPZET: readonly Knoop[] = [
  { id: "inleiding", titel: { en: "Introduction", nl: "Inleiding", "zh-TW": "簡介" }, niveau: 1, inhoud: "tekst", nieuwePagina: true },
  {
    // Sinds versie 2 van de rapportopbouw op een nieuwe pagina; oudere rapporten houden hun opmaak (model.ts).
    id: "projectgegevens", titel: { en: "Project details", nl: "Projectgegevens", "zh-TW": "專案資訊" }, niveau: 1, nieuwePagina: true,
    kinderen: [
      { id: "projectomschrijving", titel: { en: "Project description", nl: "Projectomschrijving", "zh-TW": "工程概述" }, niveau: 2, inhoud: "tekst" },
      { id: "rol", titel: { en: "Role in the project and scope of this report", nl: "Rol binnen het project en bereik rapport", "zh-TW": "於專案中之角色與本報告範圍" }, niveau: 2, inhoud: "rol" },
    ],
  },
  {
    id: "constructie", titel: { en: "Structure", nl: "Constructie", "zh-TW": "結構系統" }, niveau: 1, nieuwePagina: true,
    kinderen: [
      {
        id: "toelichting", titel: { en: "Description of the structure", nl: "Toelichting constructie", "zh-TW": "結構說明" }, niveau: 2,
        kinderen: [
          {
            id: "bestaand", titel: { en: "Existing situation", nl: "Bestaande situatie", "zh-TW": "既有現況" }, niveau: 3, optioneel: true,
            kinderen: [
              tekst("bestaand-verticaal", { en: "Vertical load path", nl: "Verticale belastingafdracht", "zh-TW": "垂直載重傳遞路徑" }, 4),
              tekst("bestaand-stabiliteit", { en: "Stability", nl: "Stabiliteit", "zh-TW": "側向穩定性" }, 4),
              tekst("bestaand-fundatie", { en: "Foundation", nl: "Fundatie", "zh-TW": "基礎現況" }, 4),
              tekst("bestaand-beoordeling", { en: "Assessment of the existing structure", nl: "Beoordeling bestaande constructie", "zh-TW": "既有結構評估" }, 4),
            ],
          },
          // Bij nieuwbouw is er niets om te wijzigen: dan beschrijft dit blok het constructieprincipe.
          // Sinds versie 3 van de rapportopbouw; oudere rapporten houden Wijziging (model.ts).
          {
            ...tekst("wijziging", { en: "Alteration", nl: "Wijziging", "zh-TW": "變更設計" }, 3),
            titelNieuwbouw: { en: "Structural concept", nl: "Constructieprincipe", "zh-TW": "結構概念" },
          },
          tekst("belendingen", { en: "Adjoining buildings", nl: "Belendingen", "zh-TW": "鄰房現況與防護" }, 3),
        ],
      },
      {
        id: "uitvoering", titel: { en: "Notes for construction", nl: "Aandachtspunten bij uitvoering", "zh-TW": "施工注意事項" }, niveau: 2, nieuwePagina: true,
        kinderen: [
          tekst("uitvoering-bestaand", { en: "Existing situation", nl: "Bestaande situatie", "zh-TW": "既有現況施工注意" }, 3),
          tekst("uitvoering-verbouw", { en: "Alteration, renovation", nl: "Verbouw, renovatie", "zh-TW": "增改建及修繕" }, 3),
          tekst("uitvoering-nieuwbouw", { en: "New construction", nl: "Nieuwbouw", "zh-TW": "新建工程" }, 3),
        ],
      },
    ],
  },
  {
    id: "uitgangspunten", titel: { en: "Design basis", nl: "Uitgangspunten", "zh-TW": "設計基準" }, niveau: 1, nieuwePagina: true, inspringen: 1,
    kinderen: [
      { id: "bouwwerk", titel: { en: "Structural design basis", nl: "Constructieve uitgangspunten bouwwerk", "zh-TW": "建築結構設計基準" }, niveau: 2, inhoud: "bouwwerk" },
      { id: "brand", titel: { en: "Structural fire design", nl: "Bouwconstructies bij brand", "zh-TW": "結構防火設計" }, niveau: 2, inhoud: "brand" },
      { id: "materialen", titel: { en: "Materials", nl: "Toegepaste materialen", "zh-TW": "採用材料規格" }, niveau: 2, inhoud: "materialen" },
      { id: "conservering", titel: { en: "Corrosion protection of steelwork", nl: "Conservering staalconstructie", "zh-TW": "鋼結構防蝕塗裝" }, niveau: 2, inhoud: "conservering" },
      { id: "factoren", titel: { en: "Partial factors and combinations of actions", nl: "Belastingfactoren en belastingcombinaties", "zh-TW": "載重係數與載重組合" }, niveau: 2, inhoud: "factoren" },
      // Valt weg als uitgangspunten.bestaand.opnemen false is (nieuwbouw).
      { id: "bestaand-situatie", titel: { en: "Existing situation", nl: "Bestaande situatie", "zh-TW": "既有現況" }, niveau: 2, inhoud: "bestaand", optioneel: true },
      { id: "trillingen", titel: { en: "Vibrations", nl: "Trillingen", "zh-TW": "振動分析" }, niveau: 2, inhoud: "tekst" },
      // De tekst `vervormingen` is de inleidende zin boven de tabel.
      { id: "vervormingen", titel: { en: "Deformations and horizontal displacements", nl: "Vervormingen en horizontale verplaatsingen", "zh-TW": "變形與水平位移限制" }, niveau: 2, inhoud: "vervormingen" },
      { id: "montage", titel: { en: "Erection and construction stages", nl: "Montage en bouwfase", "zh-TW": "安裝與施工階段" }, niveau: 2, inhoud: "tekst" },
      { id: "rekenprogrammatuur", titel: { en: "Calculation software", nl: "Toegepaste rekenprogrammatuur", "zh-TW": "採用計算軟體" }, niveau: 2, inhoud: "tekst" },
      { id: "temperatuur", titel: { en: "Thermal actions", nl: "Temperatuursinvloeden", "zh-TW": "溫度效應" }, niveau: 2, inhoud: "tekst" },
      { id: "aardbeving", titel: { en: "Seismic actions", nl: "Aardbevingen", "zh-TW": "地震力分析" }, niveau: 2, inhoud: "tekst" },
    ],
  },
  {
    id: "belastingen", titel: { en: "Loads", nl: "Belastingen", "zh-TW": "載重條件" }, niveau: 1, nieuwePagina: true, inspringen: 1,
    kinderen: [
      // De tekst `sneeuw` staat onder de berekening van s.
      { id: "sneeuw", titel: { en: "Snow loads(Q)", nl: "Sneeuwbelastingen(Q)", "zh-TW": "積雪載重(Q)" }, niveau: 2, inhoud: "sneeuw" },
      { id: "wind", titel: { en: "Wind loads(Q)", nl: "Windbelastingen(Q)", "zh-TW": "風力載重(Q)" }, niveau: 2, inhoud: "wind" },
      { id: "regenwater", titel: { en: "Rainwater ponding(Q)", nl: "Regenwateraccumulatie(Q)", "zh-TW": "屋頂積水載重(Q)" }, niveau: 2, inhoud: "tekst" },
      { id: "veranderlijk", titel: { en: "Other variable loads(Q)", nl: "Overige veranderlijke belastingen(Q)", "zh-TW": "其他活載重(Q)" }, niveau: 2, inhoud: "veranderlijk" },
      // Valt weg zonder opbouwen.
      { id: "blijvend", titel: { en: "Permanent loads(G)", nl: "Blijvende belastingen(G)", "zh-TW": "靜載重(G)" }, niveau: 2, inhoud: "blijvend", optioneel: true },
    ],
  },
  // Valt weg zonder rekenbladen.
  { id: "berekeningen", titel: { en: "Calculations", nl: "Berekeningen", "zh-TW": "結構計算" }, niveau: 1, inhoud: "berekeningen", optioneel: true, nieuwePagina: true },
];

/** Inhoudssoorten met een tekst in rapport.teksten naast hun tabel. */
const MET_TEKST: readonly Inhoud[] = ["rol", "vervormingen", "sneeuw"];

/** Heeft deze knoop een tekst in rapport.teksten (onder zijn eigen id)? */
export function heeftTekst(k: Knoop): boolean {
  return k.inhoud === "tekst" || (k.inhoud !== undefined && MET_TEKST.includes(k.inhoud));
}

/** Alle tekst-ids in de volgorde van het rapport — de sleutels van rapport.teksten. */
export const TEKST_IDS: readonly string[] = (() => {
  const ids: string[] = [];
  const loop = (knopen: readonly Knoop[]) => {
    for (const k of knopen) {
      if (heeftTekst(k)) ids.push(k.id);
      if (k.kinderen) loop(k.kinderen);
    }
  };
  loop(OPZET);
  return ids;
})();

/** Een knoop zoals hij in dit rapport voorkomt: met nummer, zijn kop in rapport.taal, en zonder wat wegvalt. */
export interface Rapportknoop extends Omit<Knoop, "titel" | "titelNieuwbouw" | "nieuwePagina" | "kinderen"> {
  titel: string;
  nummer: string;
  nieuwePagina: boolean;
  kinderen: Rapportknoop[];
  blad?: { id: string; naam: string; bijlage: string; koppen?: readonly Inhoudskop[] };
}

/** Waar de uitwerking van een blad staat. */
export type BladPlek = "hoofdstuk" | "bijlage";

/** Een regel onder de naam van een blad in de inhoudsopgave, zoals een kop uit een bestand. */
export interface Inhoudskop {
  titel: string;
  /** Staat op papier als `data-inhoud` op die kop. */
  anker: string;
}

export interface Blad {
  id: string;
  naam: string;
  /** Waar de uitwerking staat zolang de gebruiker niets koos; zonder: in de bijlage. */
  plek?: BladPlek;
  koppen?: readonly Inhoudskop[];
}

/** Staat de uitwerking van dit blad in het hoofdstuk zelf? De keuze in het rapport wint van de soort. */
export function staatInHoofdstuk(r: Rapport, b: Pick<Blad, "id" | "plek">): boolean {
  return r.inHoofdstuk[b.id] ?? b.plek === "hoofdstuk";
}

/**
 * Staat er niets in? Een tekstknoop is leeg als zijn getrimde tekst leeg is; een
 * knoop zonder eigen inhoud als al zijn kinderen leeg zijn. 4.6, 5.5 en
 * Berekeningen hebben een eigen regel; de overige tabellen zijn nooit leeg.
 */
function isLeeg(k: Knoop, r: Rapport, bladen: readonly Blad[]): boolean {
  switch (k.inhoud) {
    case "tekst":
      return (r.teksten[k.id] ?? "").trim() === "";
    case "bestaand":
      return !r.uitgangspunten.bestaand.opnemen;
    case "blijvend":
      return r.belastingen.vloerenDaken.length === 0 && r.belastingen.wanden.length === 0;
    case "berekeningen":
      return bladen.length === 0;
    case undefined:
      return (k.kinderen ?? []).every((c) => isLeeg(c, r, bladen));
    default:
      return false;
  }
}

/** Niet-optionele knopen blijven altijd staan, ook als ze leeg zijn. */
function valtWeg(k: Knoop, r: Rapport, bladen: readonly Blad[]): boolean {
  return k.optioneel === true && isLeeg(k, r, bladen);
}

/** Een knoop uit OPZET op id, diepte eerst. */
function zoek(id: string, lijst: readonly Knoop[] = OPZET): Knoop | undefined {
  for (const k of lijst) {
    const gevonden = k.id === id ? k : zoek(id, k.kinderen ?? []);
    if (gevonden) return gevonden;
  }
  return undefined;
}

/**
 * Beschrijft dit rapport een bestaande situatie (verbouw), of is het
 * nieuwbouw? Bestaand als 4.6 Bestaande situatie is opgenomen, of als het
 * blok Bestaande situatie in 3.1 tekst heeft: dan staat er iets boven het
 * blok Wijziging waar het een wijziging van is.
 */
export function beschrijftBestaand(r: Rapport): boolean {
  const blok = zoek("bestaand");
  return r.uitgangspunten.bestaand.opnemen || (blok !== undefined && !isLeeg(blok, r, []));
}

/**
 * De kop van een knoop in dit rapport, in rapport.taal: bij nieuwbouw
 * `titelNieuwbouw` als die er is en het rapport die kop gebruikt
 * (opmaak.constructieprincipe; een rapport van vóór versie 3 houdt bij het openen
 * Wijziging).
 */
export function titelVan(k: Knoop, r: Rapport): string {
  if (k.titelNieuwbouw === undefined || !r.opmaak.constructieprincipe || beschrijftBestaand(r)) return inTaal(k.titel, r.taal);
  return inTaal(k.titelNieuwbouw, r.taal);
}

function nieuwePaginaVoor(id: string, standaard: boolean | undefined, r: Rapport): boolean {
  return r.nieuwePagina[id] ?? standaard ?? false;
}

/**
 * Per rekenblad een paragraaf in Berekeningen. Bladen waarvan de uitwerking in
 * bijlage A staat krijgen daar een volgnummer (A.1, A.2, …); een blad met de
 * uitwerking in het hoofdstuk zelf krijgt bijlage "".
 */
function bladKnopen(nummer: string, r: Rapport, bladen: Blad[]): Rapportknoop[] {
  let inBijlage = 0;
  return bladen.map((b, i): Rapportknoop => ({
    id: b.id,
    titel: b.naam,
    niveau: 2,
    nummer: `${nummer}.${i + 1}`,
    nieuwePagina: nieuwePaginaVoor(b.id, false, r),
    kinderen: [],
    blad: {
      id: b.id,
      naam: b.naam,
      bijlage: staatInHoofdstuk(r, b) ? "" : `A.${++inBijlage}`,
      ...(b.koppen?.length ? { koppen: b.koppen } : {}),
    },
  }));
}

function bouwKnoop(k: Knoop, nummer: string, r: Rapport, bladen: Blad[]): Rapportknoop {
  const kinderen = k.inhoud === "berekeningen"
    ? bladKnopen(nummer, r, bladen)
    : (k.kinderen ?? [])
        .filter((c) => !valtWeg(c, r, bladen))
        .map((c, j) => bouwKnoop(c, c.niveau === 2 ? `${nummer}.${j + 1}` : "", r, bladen));
  const { titelNieuwbouw: _kop, ...rest } = k;
  return { ...rest, titel: titelVan(k, r), nummer, nieuwePagina: nieuwePaginaVoor(k.id, k.nieuwePagina, r), kinderen };
}

/**
 * Nummert, laat lege optionele knopen weg, voegt per blad een paragraaf toe aan
 * "berekeningen" (bijlage "A.1", "A.2", …). Zonder bladen valt "berekeningen"
 * weg; de bijlageletters (bijlagen()) houden dan hun plek: B blijft B.
 */
export function bouwOpzet(r: Rapport, bladen: Blad[]): Rapportknoop[] {
  // ── 台灣版 ────────────────────────────────────────────────────────────────
  if (r.opzetSoort === "tw") {
    return bouwTwOpzet(r, bladen);
  }
  // ── 上游原版 ──────────────────────────────────────────────────────────────
  return OPZET
    .filter((k) => !valtWeg(k, r, bladen))
    .map((k, i) => bouwKnoop(k, String(i + 1), r, bladen));
}

export interface Inhoudsregel {
  nummer: string;
  titel: string;
  /** 1 hoofdstuk, 2 paragraaf of blad, 3 kop uit een blad. */
  niveau: 1 | 2 | 3;
  /** De plek op papier (`data-inhoud`) waar het paginanummer vandaan komt. */
  anker: string;
}

/** De regel van een blad met de koppen eronder. */
function bladRegels(nummer: string, titel: string, anker: string, koppen: readonly Inhoudskop[] = []): Inhoudsregel[] {
  return [
    { nummer, titel, niveau: 2, anker },
    ...koppen.map((k): Inhoudsregel => ({ nummer: "", titel: k.titel, niveau: 3, anker: k.anker })),
  ];
}

/**
 * Hoofdstukken en paragrafen. De paragrafen van "berekeningen" staan in de
 * inhoudsopgave van dat hoofdstuk; met `metBladen` (rapport.opmaak.bladenInInhoud)
 * staan de bladen met hun uitwerking in dat hoofdstuk hier ook. De andere bladen
 * noemt bijlageRegels.
 */
export function inhoudsopgave(knopen: Rapportknoop[], metBladen = false): Inhoudsregel[] {
  const regels: Inhoudsregel[] = [];
  for (const h of knopen) {
    regels.push({ nummer: h.nummer, titel: h.titel, niveau: 1, anker: h.id });
    if (h.inhoud === "berekeningen") {
      if (!metBladen) continue;
      for (const p of h.kinderen) {
        if (p.blad && !p.blad.bijlage) regels.push(...bladRegels(p.nummer, p.titel, p.id, p.blad.koppen));
      }
      continue;
    }
    for (const p of h.kinderen) {
      if (p.niveau === 2) regels.push({ nummer: p.nummer, titel: p.titel, niveau: 2, anker: p.id });
    }
  }
  return regels;
}

/** De plek van de kop van een bijlage op papier. */
export const bijlageAnker = (letter: string) => `bijlage-${letter}`;

/** De plek van een blad in bijlage A op papier: het blad heeft ook een paragraaf in hoofdstuk Berekeningen. */
export const bijlageBladAnker = (id: string) => `bijlage-blad-${id}`;

/** De bladen in bijlage A, voor onder die bijlage in de inhoudsopgave (rapport.opmaak.bladenInInhoud). */
export function bijlageRegels(knopen: Rapportknoop[]): Inhoudsregel[] {
  const berekeningen = knopen.find((k) => k.inhoud === "berekeningen");
  return (berekeningen?.kinderen ?? []).flatMap((p) =>
    p.blad?.bijlage ? bladRegels(p.blad.bijlage, p.titel, bijlageBladAnker(p.id), p.blad.koppen) : []);
}

/** Een regel in het zijpaneel; `bladId` is het blad dat een klik opent. */
export interface PaneelRegel extends Inhoudsregel {
  bladId?: string;
}

/**
 * De inhoud voor het zijpaneel: alle nummers die het rapport gaat krijgen, altijd met de bladen en
 * zonder de koppen uit een blad. De hoofdstukken, bladen en bijlagen staan in dezelfde volgorde
 * als op papier en dragen dezelfde ankers, dus het voorbeeld kan er paginanummers bij zetten.
 */
export function inhoudVoorPaneel(r: Rapport, bladen: Blad[]): PaneelRegel[] {
  const knopen = bouwOpzet(r, bladen);
  const bladVan = new Map<string, string>();
  for (const h of knopen) {
    for (const p of h.kinderen) {
      if (p.blad) {
        bladVan.set(p.id, p.blad.id);
        bladVan.set(bijlageBladAnker(p.id), p.blad.id);
      }
    }
  }
  const regel = (i: Inhoudsregel): PaneelRegel => {
    const bladId = bladVan.get(i.anker);
    return bladId ? { ...i, bladId } : i;
  };
  const uit = inhoudsopgave(knopen, true).filter((i) => i.niveau < 3).map(regel);
  for (const b of bijlagen(r, bladen)) {
    uit.push({ nummer: b.letter, titel: b.titel, niveau: 1, anker: bijlageAnker(b.letter) });
    if (b.letter === "A") uit.push(...bijlageRegels(knopen).filter((i) => i.niveau < 3).map(regel));
  }
  return uit;
}

export interface Bijlage { letter: string; titel: string }

/** Titel van bijlage A. */
export const BIJLAGE_A: Meertalig = { en: "Detailed calculations", nl: "Uitgebreide uitwerking berekeningen", "zh-TW": "詳細計算過程" };

/** 0 → A, 1 → B, … 25 → Z, 26 → AA. */
function bijlageLetter(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}

/**
 * A = BIJLAGE_A in rapport.taal (alleen als er een blad in de bijlage staat),
 * daarna rapport.bijlagen als B, C, …
 *
 * De letters van de eigen bijlagen liggen vast (B is altijd de eerste eigen
 * bijlage), ook als A wegvalt: tekeningen en andere stukken verwijzen ernaar.
 * Een eigen bijlage zonder titel telt niet mee.
 */
export function bijlagen(r: Rapport, bladen: Blad[]): Bijlage[] {
  const uit: Bijlage[] = [];
  const titelA = r.opzetSoort === "tw" ? inTaal(BIJLAGE_TW_A, r.taal) : inTaal(BIJLAGE_A, r.taal);
  if (bladen.some((b) => !staatInHoofdstuk(r, b))) uit.push({ letter: "A", titel: titelA });
  r.bijlagen
    .map((t) => t.trim())
    .filter((t) => t !== "")
    .forEach((titel, i) => uit.push({ letter: bijlageLetter(i + 1), titel }));
  return uit;
}
