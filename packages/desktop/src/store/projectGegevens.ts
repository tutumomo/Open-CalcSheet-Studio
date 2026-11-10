/**
 * Projectgegevens — de waarden die voor het héle project gelden.
 *
 * Alles wat hier staat wordt in élk rekenblad van het project als variabele
 * beschikbaar gesteld (via `initialScope` van de evaluator). Een blad hoeft ze
 * dus niet zelf te vragen: de gevolgklasse vul je één keer in en hij werkt
 * overal door.
 *
 * Wat hier NIET thuishoort is alles wat per constructiedeel verschilt —
 * belastingen, afmetingen, materiaalkeuzes. Die horen bij het exemplaar, en
 * twee exemplaren van dezelfde module horen elkaar daarin nooit te raken.
 * Zie `projectStore.ts` voor die scheiding.
 */

/** `getal`: een tekstveld waarvan de waarde als getal in de bladen komt (komma of punt). */
export type VeldType = "tekst" | "keuze" | "getal";

export interface Keuze {
  label: string;
  waarde: string;
}

export interface VeldDef {
  /** Variabelenaam zoals de rekenbladen hem gebruiken. */
  naam: string;
  label: string;
  type: VeldType;
  standaard: string;
  opties?: Keuze[];
  /** Toelichting onder het veld — normverwijzing of gebruiksregel. */
  hint?: string;
  /** Kop waaronder het veld in het formulier valt. */
  groep: string;
  /**
   * Keuzes die een eerdere versie aanbood en nu niet meer. Een project dat er
   * nog een heeft, laadt en rekent gewoon door, met de keuze `naar` (altijd de
   * veilige kant). Het formulier toont de oude keuze tot je zelf een andere
   * kiest; de opgeslagen waarde blijft staan.
   */
  vervallen?: { waarde: string; label: string; naar: string }[];
}

export const PROJECT_VELDEN: VeldDef[] = [
  // ── Eenheden ─────────────────────────────────────────────────────────────
  // Het eenhedenstelsel: alleen de weergave, de berekening blijft dezelfde
  // (store/projectEenheden.ts). Geen getal, dus geen variabele in de bladen.
  {
    groep: "Units",
    naam: "eenheden",
    label: "Unit system",
    type: "keuze",
    standaard: "blad",
    opties: [
      { label: "As written in the sheet", waarde: "blad" },
      { label: "SI (mm)", waarde: "si-mm" },
      { label: "SI (m)", waarde: "si-m" },
      { label: "US customary", waarde: "us" },
      { label: "Taiwan MKS", waarde: "tw-mks" },
      { label: "Custom", waarde: "eigen" },
    ],
    hint: "Every value is shown in the unit of its quantity, also in the bundled modules and on paper. Only the display changes: results and unity checks stay the same.",
  },
  // ── Rekenwijze ───────────────────────────────────────────────────────────
  // Op de plaatsen waar de referentie-uitwerking aantoonbaar iets anders doet dan de norm
  // rekent elk blad béide uitkomsten uit. Dit veld bepaalt welke van de twee de
  // conclusie stuurt; de andere verschijnt als kanttekening zodra hij afwijkt.
  // Het register met alle splitspunten staat in docs/afwijkingen-referentie.md.
  {
    groep: "Calculation method",
    naam: "rekenwijze",
    label: "Calculation method where the reference program differs",
    type: "keuze",
    standaard: "1",
    opties: [
      { label: "Follow the reference calculation (current practice)", waarde: "1" },
      { label: "Follow the standard", waarde: "0" },
    ],
    hint: "The reference calculation is the calculation program we use today and is therefore the default; every result can be checked against reference sheets. The standard mode follows the Eurocode itself at the marked points — that branch cannot be checked against a reference and is there for the moment this program stands on its own. The chosen answer is always shown on the printout.",
  },

  // ── Projectkop ───────────────────────────────────────────────────────────
  { groep: "Project", naam: "project_nummer", label: "Project number", type: "tekst", standaard: "" },
  { groep: "Project", naam: "project_naam", label: "Project name", type: "tekst", standaard: "" },
  { groep: "Project", naam: "opdrachtgever", label: "Client", type: "tekst", standaard: "" },
  { groep: "Project", naam: "constructeur", label: "Structural engineer", type: "tekst", standaard: "" },
  { groep: "Project", naam: "locatie", label: "Location", type: "tekst", standaard: "" },
  { groep: "Project", naam: "onderdeel", label: "Part", type: "tekst", standaard: "" },

  // ── 台灣設計基礎與工址（台灣版）──────────────────────────────────────────
  // 變數一律以 tw_ 開頭，避免與 Eurocode 欄位衝突。tw_klasse 與 tw_terrein 是選擇，
  // 用途係數與地況參數由它們導出（見 projectScope），像 K_FI 由 CC 導出一樣。
  {
    groep: "Basis of design (Taiwan)",
    naam: "tw_klasse",
    label: "Building use category",
    type: "keuze",
    standaard: "4",
    opties: [
      { label: "Category 1 — must stay operational after the event (government emergency offices, fire/police/telecom, evacuation schools, hospitals, power and water plants)", waarde: "1" },
      { label: "Category 2 — storage of large quantities of toxic or explosive materials", waarde: "2" },
      { label: "Category 3 — places where crowds gather (above the area thresholds of the code)", waarde: "3" },
      { label: "Category 4 — other ordinary buildings (default)", waarde: "4" },
    ],
    hint: "Seismic importance factor I (building technical regulations, structures, art. 43-1 and seismic code 2.8): category 1 → 1,5 · 2 → 1,5 · 3 → 1,25 · 4 → 1,0. Wind importance factor I (wind code 2.5): categories 1–3 → 1,1 · 4 → 1,0. Every sheet receives tw_I and tw_Iw. The classification lists in the codes decide; the area thresholds for category 3 are in the code text. The wind code's temporary-structure class (I = 0,9) is not offered here.",
  },
  {
    groep: "Basis of design (Taiwan)",
    naam: "tw_DesignLife",
    label: "Design working life (information)",
    type: "keuze",
    standaard: "50",
    opties: [
      { label: "25 years — temporary or low-importance structures", waarde: "25" },
      { label: "50 years — ordinary buildings and structures (default)", waarde: "50" },
      { label: "100 years — important or monumental structures", waarde: "100" },
    ],
    hint: "Information for the print header only: the Taiwan modules do not calculate with it. The wind code relates importance to the return period (25 / 50 / 100 years); see tw_klasse for the factor that is actually used.",
  },
  {
    groep: "Site (Taiwan)",
    naam: "tw_terrein",
    label: "Terrain category (wind code)",
    type: "keuze",
    standaard: "3",
    opties: [
      { label: "A — centre of a large city, at least 50% of the buildings higher than 20 m", waarde: "1" },
      { label: "B — suburbs, small towns, scattered obstacles of 10–20 m", waarde: "2" },
      { label: "C — flat open terrain, grassland, coast or lake shore (default)", waarde: "3" },
    ],
    hint: "Terrain categories of the building wind code 2.3. The wind exponent α is derived (A 0,32 · B 0,25 · C 0,15). The gradient height z_g is only recorded for category C (300 m); for A and B it is 0, and the wind-load sheet then refuses to calculate until it is entered in the sheet from table 2.2. Intermediate terrain: use the category that gives the larger wind force.",
  },
  {
    groep: "Site (Taiwan)",
    naam: "tw_V10",
    label: "Basic design wind speed V10(C) (m/s)",
    type: "getal",
    standaard: "40.0",
    hint: "10-minute mean wind speed, terrain C, 10 m height, 50-year return period (wind code 2.4). Pick a district below for the ABRI suggestion, or type the value. A new wind-load sheet starts from this value when you changed it; an existing sheet keeps its own V_10.",
  },
  {
    groep: "Site (Taiwan)",
    naam: "tw_SDS",
    label: "Site short-period design spectral acceleration S_DS",
    type: "getal",
    standaard: "0.80",
    hint: "Seismic code 2.5 (S_DS = F_a·S_S^D; Taipei basin from 2.7). Depends on district, soil and near-fault distance: use the seismic-load sheet's helper for the exact value. A new seismic-load sheet starts from this value when you changed it.",
  },
  {
    groep: "Site (Taiwan)",
    naam: "tw_SD1",
    label: "Site 1-second design spectral acceleration S_D1",
    type: "getal",
    standaard: "0.45",
    hint: "Seismic code 2.5 (S_D1 = F_v·S_1^D; Taipei basin from 2.7). Same remarks as S_DS. A new seismic-load sheet starts from this value when you changed it.",
  },

  // ── Grondslagen (NEN-EN 1990 + NB) ───────────────────────────────────────
  {
    groep: "Basis of design (NEN-EN 1990 + NB)",
    naam: "CC",
    label: "Consequence class",
    type: "keuze",
    standaard: "2",
    opties: [
      { label: "CC1 — low consequences", waarde: "1" },
      { label: "CC2 — medium consequences", waarde: "2" },
      { label: "CC3 — high consequences", waarde: "3" },
    ],
    hint: "Determines K_FI (table B3, with the note to table NB.4 – A1.2(B)): CC1 → 0,90 · CC2 → 1,00 · CC3 → 1,10. Every sheet receives both CC and K_FI.",
  },
  {
    groep: "Basis of design (NEN-EN 1990 + NB)",
    naam: "RC",
    label: "Reliability class",
    type: "keuze",
    standaard: "2",
    opties: [
      { label: "RC1", waarde: "1" },
      { label: "RC2", waarde: "2" },
      { label: "RC3", waarde: "3" },
    ],
  },
  {
    groep: "Basis of design (NEN-EN 1990 + NB)",
    naam: "DesignLife",
    label: "Design working life",
    type: "keuze",
    standaard: "50",
    opties: [
      { label: "5 years — class 1: temporary, in use for at most 5 years", waarde: "5" },
      { label: "15 years — class 2: agricultural, industrial with 1 or 2 storeys", waarde: "15" },
      { label: "50 years — class 3: buildings and common structures (default)", waarde: "50" },
      { label: "100 years — class 4: monumental buildings", waarde: "100" },
    ],
    // 10 en 25 jaar zijn geen klasse van tabel NB.1 – 2.1; een project dat ze
    // nog heeft, rekent met de klasse erboven.
    vervallen: [
      { waarde: "10", label: "10 years", naar: "15" },
      { waarde: "25", label: "25 years", naar: "50" },
    ],
    hint: "Minimum values according to table NB.1 – 2.1. A temporary structure falls in class 3, unless it is in use for at most 5 years (class 1) or has a use from class 2. The loads are calculated with a reference period of at least 15 years.",
  },

  // ── Locatiegebonden (NEN-EN 1991-1-4 + NB) ───────────────────────────────
  {
    groep: "Wind (NEN-EN 1991-1-4 + NB)",
    naam: "windgebied",
    label: "Wind zone",
    type: "keuze",
    standaard: "2",
    opties: [
      { label: "I — Wadden Islands, Wadden Sea, IJsselmeer, Markermeer and northern Noord-Holland (v_b0 = 29,5 m/s)", waarde: "1" },
      { label: "II — rest of Noord-Holland, mainland Groningen and Friesland, Flevoland, Zuid-Holland, Zeeland (27,0)", waarde: "2" },
      { label: "III — rest of the Netherlands (24,5)", waarde: "3" },
    ],
    hint: "Zoning according to 4.2(1) note 2 of the NB, v_b0 from table NB.1: provincial boundaries, and in Noord-Holland a horizontal line at 52½° north; zone I is Noord-Holland above it (including Den Helder, Alkmaar, Hoorn, Heemskerk, Purmerend). Within 5 km of a boundary, v_b0 changes gradually (figure NB.1); the zone in which the location lies is then on the safe side. A sheet with wind load calculates q_p from this, using the reference height from the sheet.",
  },
  {
    groep: "Wind (NEN-EN 1991-1-4 + NB)",
    naam: "terreincategorie",
    label: "Terrain category",
    type: "keuze",
    standaard: "2",
    opties: [
      { label: "0 — Sea or coastal area (z₀ = 0,005 · z_min = 1)", waarde: "1" },
      { label: "II — Undeveloped area (z₀ = 0,2 · z_min = 4)", waarde: "2" },
      { label: "III — Built-up area (z₀ = 0,5 · z_min = 7)", waarde: "3" },
    ],
    hint: "Follows from the surroundings of the building (Table NB.3-4.1).",
  },
];

export type ProjectGegevens = Record<string, string>;

/** Verse projectgegevens: elk veld op zijn standaard. */
export function legeGegevens(): ProjectGegevens {
  const g: ProjectGegevens = {};
  for (const v of PROJECT_VELDEN) g[v.naam] = v.standaard;
  return g;
}

/** De vervallen keuze die `ruw` is, of niets. */
export function vervallenKeuze(veld: VeldDef, ruw: string): { waarde: string; label: string; naar: string } | undefined {
  return veld.vervallen?.find((v) => v.waarde === ruw);
}

/** De waarde waarmee gerekend wordt: een vervallen keuze wordt haar vervanger. */
export function geldendeWaarde(veld: VeldDef, ruw: string): string {
  return vervallenKeuze(veld, ruw)?.naar ?? ruw;
}

/**
 * De geldende waarde van een projectveld, voor wie hem buiten de rekenbladen
 * toont (afdruk, rapport). Zo staat daar hetzelfde als waarmee gerekend is.
 */
export function projectWaarde(g: ProjectGegevens, veldNaam: string): string | undefined {
  const veld = PROJECT_VELDEN.find((v) => v.naam === veldNaam);
  const ruw = g[veldNaam];
  return veld && ruw !== undefined ? geldendeWaarde(veld, ruw) : ruw;
}

/**
 * De keuzes voor het formulier. Staat er in het project een waarde die er niet
 * (meer) bij hoort, dan komt die als extra keuze onderaan, zodat het formulier
 * toont wat er werkelijk staat in plaats van stil de eerste keuze.
 */
export function keuzesVoor(veld: VeldDef, ruw: string): Keuze[] {
  const opties = veld.opties ?? [];
  if (opties.some((o) => o.waarde === ruw)) return opties;
  const oud = vervallenKeuze(veld, ruw);
  // Van de vervanger alleen het deel vóór de toelichting: "50 years".
  const vervanger = oud && opties.find((o) => o.waarde === oud.naar)?.label.split(" — ")[0];
  const label = oud
    ? `${oud.label} — no longer offered, calculated as ${vervanger ?? oud.naar}`
    : `${ruw} — unknown choice`;
  return [...opties, { label, waarde: ruw }];
}

/**
 * Invoervelden van een Taiwanese module die bij het toevoegen met de waarde van
 * het project beginnen: bladinvoer → projectveld. Alleen een waarde die de
 * gebruiker zelf wijzigde (afwijkend van de standaard van het veld) wordt
 * overgenomen; een ongewijzigd project laat de eigen beginwaarde van de module
 * staan. Daarna beheert het blad zijn waarde zelf.
 */
const SJABLOON_STARTWAARDEN: Record<string, Record<string, string>> = {
  "tw-wind-load": { V_10: "tw_V10" },
  "tw-seismic-load": { S_DS: "tw_SDS", S_D1: "tw_SD1" },
};

export function startWaarden(templateId: string, g: ProjectGegevens): Record<string, string> {
  const uit: Record<string, string> = {};
  for (const [invoer, veldNaam] of Object.entries(SJABLOON_STARTWAARDEN[templateId] ?? {})) {
    const veld = PROJECT_VELDEN.find((v) => v.naam === veldNaam);
    const n = getalWaarde(g[veldNaam] ?? "");
    if (veld && n !== undefined && n !== getalWaarde(veld.standaard)) uit[invoer] = String(n);
  }
  return uit;
}

/** K_FI bij een gevolgklasse — tabel B3, met de opmerking bij tabel NB.4 – A1.2(B). */
export function kFiVoor(cc: number): number {
  if (cc <= 1) return 0.9;
  if (cc >= 3) return 1.1;
  return 1.0;
}

/**
 * Aardbevingsgebruiksfactor I（耐震用途係數）bij gebouwcategorie 1..4 —
 * 建築技術規則建築構造編 第 43-1 條（已驗證表 btr_struct_seismic_I）與
 * 建築物耐震設計規範 2.8（seis113_I_class）：1,5 / 1,5 / 1,25 / 1,0.
 */
export function twIVoor(klasse: number): number {
  if (klasse <= 1) return 1.5;
  if (klasse === 2) return 1.5;
  if (klasse === 3) return 1.25;
  return 1.0;
}

/**
 * 耐風用途係數 I（建築物耐風設計規範 2.5，已驗證表 wind103full_use_factor_I）：
 * 第一、二、三類 1.1，其他 1.0。與耐震用途係數不同，不可互用。
 */
export function twIwVoor(klasse: number): number {
  return klasse >= 1 && klasse <= 3 ? 1.1 : 1.0;
}

/**
 * 地況 A/B/C（代碼 1/2/3）的風剖面指數 α 與梯度高度 z_g（耐風規範 2.3，表 2.2）。
 * α 取自 2.3 節解說（A 0.32、B 0.25、C 0.15）；z_g 僅地況 C（300 m）有已驗證依據，
 * A、B 回傳 0：風力範本以 z_g ≥ 1 拒算，不以猜測值代替。
 */
export function twTerreinVoor(code: number): { alpha: number; zg: number } {
  if (code <= 1) return { alpha: 0.32, zg: 0 };
  if (code === 2) return { alpha: 0.25, zg: 0 };
  return { alpha: 0.15, zg: 300 };
}

/** Een getalveld: komma of punt, `undefined` bij iets wat geen getal is. */
export function getalWaarde(ruw: string): number | undefined {
  const n = Number(ruw.trim().replace(",", "."));
  return ruw.trim() !== "" && Number.isFinite(n) ? n : undefined;
}

/**
 * Partiële belastingsfactoren bij een gevolgklasse — NEN-EN 1990 NB, tabel
 * NB.4 (CC2) en NB.5 (CC1 en CC3), STR/GEO groep B.
 *
 * Bewust de tabelwaarden en niet K_FI × de factoren van CC2: de tabel rondt
 * af (1,1 in plaats van 0,9 × 1,2 = 1,08) en geeft bij CC3 voor 6.10a 1,5 in
 * plaats van 1,1 × 1,35 = 1,485.
 */
export function belastingFactoren(cc: number): { gG: number; gQ: number; gGa: number } {
  if (cc <= 1) return { gG: 1.1, gQ: 1.35, gGa: 1.2 };
  if (cc >= 3) return { gG: 1.3, gQ: 1.65, gGa: 1.5 };
  return { gG: 1.2, gQ: 1.5, gGa: 1.35 };
}

/**
 * Zet de projectgegevens om in variabelen voor de evaluator.
 *
 * Keuzevelden worden getallen (zodat `#if CC ≡ 2` werkt), tekstvelden blijven
 * tekst; een vervallen keuze (zie `VeldDef.vervallen`) telt als haar
 * vervanger. K_FI wordt afgeleid uit CC — je vult de gevolgklasse in, de
 * factor volgt vanzelf, zodat de twee nooit uit de pas kunnen lopen.
 */
export function projectScope(g: ProjectGegevens): Record<string, unknown> {
  const scope: Record<string, unknown> = {};
  for (const veld of PROJECT_VELDEN) {
    const ruw = g[veld.naam] ?? veld.standaard;
    if (veld.type === "keuze") {
      const n = parseFloat(geldendeWaarde(veld, ruw));
      if (Number.isFinite(n)) scope[veld.naam] = n;
    } else if (veld.type === "getal") {
      // Een ongeldige invoer valt terug op de standaardwaarde, zodat een blad
      // nooit op een tekst of NaN rekent.
      scope[veld.naam] = getalWaarde(ruw) ?? getalWaarde(veld.standaard) ?? 0;
    } else {
      // Ook lege tekstvelden krijgen een waarde: een blad dat de projectnaam
      // afdrukt mag niet omvallen op "onbekende variabele" omdat het veld nog
      // niet is ingevuld.
      scope[veld.naam] = ruw;
    }
  }
  const cc = typeof scope.CC === "number" ? scope.CC : 2;
  scope.K_FI = kFiVoor(cc);
  // 台灣：用途係數與地況參數由所選類別導出（與 K_FI 同理）。
  const klasse = typeof scope.tw_klasse === "number" ? scope.tw_klasse : 4;
  scope.tw_I = twIVoor(klasse);
  scope.tw_Iw = twIwVoor(klasse);
  const terrein = twTerreinVoor(typeof scope.tw_terrein === "number" ? scope.tw_terrein : 3);
  scope.tw_alpha_w = terrein.alpha;
  scope.tw_zg = terrein.zg;
  return scope;
}
