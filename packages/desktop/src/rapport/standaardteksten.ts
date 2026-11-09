/**
 * Meegeleverde tekstvarianten per tekstonderdeel van het rapport.
 *
 * Engels is de bron, Nederlands een vertaling (meertalig.ts). Een rapport bewaart de tekst
 * in zijn eigen taal; wisselen van taal zoekt de variant in welke taal dan ook
 * (taalwissel.ts). Daarom moet elke variant in elke taal uniek zijn binnen zijn tekst-id.
 *
 * Neutraal geformuleerd: geen bureau-, persoons-, project- of productnamen.
 * Wat per project of bureau verschilt gaat via invulvelden ({adviseur},
 * {projectnaam}, … — zie invullen.ts). Een bureau legt zijn eigen varianten
 * vast in de instellingen; die komen in het keuzemenu naast deze.
 *
 * De tekst-ids zijn de knoop-ids uit opzet.ts. Regelopmaak (invullen.ts): een
 * regel is een rij in het rapport, een lege regel een nieuwe alinea, een regel
 * die met "-" begint een opsommingsregel, een korte regel die op ":" eindigt
 * een vette subkop. Een meegeleverde tekst heeft geen subkoppen: een zin die
 * op ":" eindigt is hier altijd een inleidende zin van meer dan vijf woorden.
 */
import { inTaal, type Meertalig } from "./meertalig.ts";

export interface Tekstvariant { label: Meertalig; tekst: Meertalig; }

/** Eén variant: label en tekst in het Engels, Nederlands, en optioneel Traditioneel Chinees. */
const v = (
  labelEn: string,
  labelNl: string,
  en: string | string[],
  nl: string | string[],
  labelTw?: string,
  tw?: string | string[],
): Tekstvariant => ({
  label: { en: labelEn, nl: labelNl, ...(labelTw ? { "zh-TW": labelTw } : {}) },
  tekst: {
    en: Array.isArray(en) ? en.join("\n") : en,
    nl: Array.isArray(nl) ? nl.join("\n") : nl,
    ...(tw ? { "zh-TW": Array.isArray(tw) ? tw.join("\n") : tw } : {}),
  },
});

/** Per tekst-id de meegeleverde varianten; de eerste is de standaard in een nieuw rapport. */
export const STANDAARD_TEKSTEN: Record<string, readonly Tekstvariant[]> = {
  // ── 1 Inleiding ──
  inleiding: [
    v("Main calculation", "Hoofdberekening",
      [
        "At the request of the client, {adviseur} presents structural advice for the above project in this report.",
        "",
        "The advice is based on the information provided.",
        "",
        "This report contains the main calculation of the structure.",
        "For the detailed engineering, additional calculations are still to be carried out by others and reviewed by {adviseur}:",
        "-Drawings and calculations of proprietary floor systems;",
        "-Drawings and calculations of the steel structure;",
        "-Cone penetration tests and foundation advice;",
      ],
      [
        "Ten behoeve van het genoemde project brengt {adviseur} op verzoek van de opdrachtgever in dit rapport een constructieadvies uit.",
        "",
        "Het advies is gebaseerd op de verstrekte gegevens.",
        "",
        "Dit rapport omvat de hoofdberekening van de constructie.",
        "Voor de detailengineering dienen nog aanvullende berekeningen door derden te worden uitgevoerd, die door {adviseur} worden gecontroleerd:",
        "-Tekeningen en berekeningen systeemvloeren;",
        "-Tekeningen en berekeningen staalconstructie;",
        "-Sondering en funderingsadvies;",
      ],
      "主計算書",
      [
        "本報告係應業主委託，由 {adviseur} 針對上述工程提出之結構設計計算書。",
        "",
        "本計算書依據業主所提供之建築圖說與相關資料撰寫。",
        "",
        "本報告包含結構系統之主要結構分析與構材設計計算。",
        "細部工程施作尚需由承攬廠商進行下列補充計算與圖說，並送交 {adviseur} 審查：",
        "-系統樓板之送審圖說與計算書；",
        "-鋼結構製造施工圖與接頭計算書；",
        "-地質鑽探報告與基礎工程設計建議書；",
      ]),
    v("Design basis only", "Alleen uitgangspunten",
      [
        "At the request of the client, {adviseur} presents structural advice for the above project in this report.",
        "",
        "The advice is based on the information provided.",
        "",
        "This report sets out the design basis of the structure.",
      ],
      [
        "Ten behoeve van het genoemde project brengt {adviseur} op verzoek van de opdrachtgever in dit rapport een constructieadvies uit.",
        "",
        "Het advies is gebaseerd op de verstrekte gegevens.",
        "",
        "Dit rapport omvat de uitgangspunten van de constructie.",
      ],
      "僅設計基準",
      [
        "本報告係應業主委託，由 {adviseur} 針對上述工程提出之結構設計說明書。",
        "",
        "本說明依據業主所提供之相關資料撰寫。",
        "",
        "本報告敘明本案結構系統之設計基準與規範依據。",
      ]),
  ],

  // ── 2 Projectgegevens ──
  projectomschrijving: [
    v("Extension", "Aanbouw", "The project comprises the construction of an extension.", "Het project omvat het realiseren van een aanbouw.", "增建工程", "本工程包含既有構造物之增建施作。"),
    v("Roof extension", "Dakopbouw", "The project comprises the construction of a roof extension.", "Het project omvat het realiseren van een dakopbouw.", "屋頂增建", "本工程包含屋頂層增建構造施作。"),
    v("New house", "Nieuwbouw woning", "The project comprises the construction of a new house.", "Het project omvat het realiseren van een woonhuis.", "新建住宅", "本工程包含新建住宅建築物之施作。"),
    v("Alteration", "Verbouwing", "The project comprises the alteration of an existing building.", "Het project omvat de verbouwing van een bestaand pand.", "改建/修繕", "本工程包含既有建築物之改建及修繕施作。"),
  ],
  rol: [
    v("Commission: structural advice", "Opdracht constructieadvies",
      "{adviseur} has been commissioned to provide the structural advice for this project.",
      "{adviseur} heeft opdracht voor het constructieadvies voor dit project.",
      "委託：結構設計",
      "{adviseur} 受委託辦理本工程之結構分析與設計作業。"),
    v("Commission: independent check", "Opdracht toetsing",
      "{adviseur} has been commissioned to check the structure of this project.",
      "{adviseur} heeft opdracht voor het toetsen van de constructie van dit project.",
      "委託：獨立審查",
      "{adviseur} 受委託辦理本工程之第三方結構安全審查作業。"),
  ],

  // ── 3.1 Toelichting constructie: bestaande situatie ──
  "bestaand-verticaal": [
    v("Timber joists on masonry", "Houten balklagen op metselwerk",
      "The floors consist of timber joists. These transfer the loads through the masonry walls to the foundation.",
      "De vloeren bestaan uit houten balklagen. Deze dragen via de gemetselde bouwmuren af naar de fundering.",
      "磚石牆承重木梁",
      "樓地板採用木梁系統，載重經由磚石承重牆傳遞至基礎。"),
    v("Purlin roof and timber joists", "Gordingenkap en houten balklagen",
      "The roof is a purlin roof. The floors consist of timber joists.\nThese transfer the loads through the masonry walls and a loadbearing internal wall to the foundation.",
      "Het dak bestaat uit een gordingenkap. De vloeren bestaan uit houten balklagen.\nDeze dragen via de gemetselde bouwmuren en een dragende tussenwand af naar de fundering.",
      "木桁架屋頂及木梁",
      "屋頂為木桁架系統，樓地板為木梁系統。\n載重經由外側承重牆及內部承重隔間牆傳遞至基礎。"),
    v("Concrete floors on loadbearing walls", "Betonvloeren op dragende wanden",
      "The floors are concrete floors. These transfer the loads through the loadbearing walls to the foundation.",
      "De vloeren bestaan uit betonvloeren. Deze dragen via de dragende wanden af naar de fundering.",
      "承重牆RC樓板",
      "樓地板採用鋼筋混凝土樓板，載重經由承重牆傳遞至基礎。"),
  ],
  "bestaand-stabiliteit": [
    v("Masonry walls", "Gemetselde bouwmuren", "Stability is provided by the masonry walls.", "De stabiliteit wordt verzorgd door de gemetselde bouwmuren.", "磚石承重牆", "結構系統之側向穩定性主要由磚石承重牆提供。"),
    v("Shear walls and diaphragm action", "Stabiliteitswanden en schijfwerking",
      "Stability is provided by the shear walls, in combination with the diaphragm action of the floors.",
      "De stabiliteit wordt verzorgd door de stabiliteitswanden, in combinatie met de schijfwerking van de vloeren.",
      "剪力牆及樓板隔膈作用",
      "結構系統之側向穩定性由結構剪力牆及樓地板之水平剛性隔膈作用共同提供。"),
  ],
  "bestaand-fundatie": [
    v("Unknown, presumably shallow", "Onbekend, vermoedelijk op staal",
      "No archive information is available. The building presumably has a shallow foundation.",
      "Er zijn geen archiefgegevens bekend. Vermoedelijk is het gebouw op staal gefundeerd.",
      "不明，推測為淺基礎",
      "無原始竣工圖檔可稽，推測既有建築物採淺基礎設計。"),
    v("Shallow foundation", "Op staal",
      "According to the archive information, the building has a shallow foundation.",
      "Het gebouw is volgens de archiefgegevens op staal gefundeerd.",
      "淺基礎",
      "依據調閱之原始工程圖檔，既有建築物採用淺基礎（直接基礎）。"),
    v("Piled foundation", "Op palen",
      "According to the archive information, the building has a piled foundation.",
      "Het gebouw is volgens de archiefgegevens op palen gefundeerd.",
      "基樁基礎",
      "依據調閱之原始工程圖檔，既有建築物採用基樁基礎。"),
  ],
  "bestaand-beoordeling": [
    v("No reason for doubt", "Geen aanleiding tot twijfel",
      "There is no reason to doubt the quality of construction of the existing structure.",
      "Er is geen aanleiding om te twijfelen aan de bouwkwaliteit van de bestaande constructie.",
      "無堪虞理由",
      "經現場目視與資料檢視，既有構造物之施工品質與結構現況無堪虞之處。"),
    v("Assess on site", "Beoordelen in het werk",
      "The condition of the existing structure is not known. It will be assessed on site before the works start.",
      "De staat van de bestaande constructie is niet bekend. Deze wordt voor aanvang van de werkzaamheden in het werk beoordeeld.",
      "施工前現場勘驗",
      "既有構造物之現況狀況尚無完整記錄，應於工程開工前會同於現場辦理結構現況勘驗與評估。"),
  ],

  // ── 3.1 Toelichting constructie: wijziging en belendingen ──
  wijziging: [
    v("Opening in a loadbearing wall", "Doorbraak in dragende wand",
      [
        "An opening is made in a loadbearing wall, with a steel portal frame.",
        "Stability is provided by the remaining part of the wall.",
        "Vertical loads are transferred to the existing foundation through the columns and the lower beam.",
      ],
      [
        "Er wordt een doorbraak gemaakt in een dragende wand met een stalen portaal.",
        "De stabiliteit wordt verzorgd door het resterende deel van de wand.",
        "De verticale belastingafdracht naar de fundering gaat via de kolommen en de onderligger naar de bestaande fundering.",
      ],
      "承重牆開口加設鋼構門架",
      [
        "於既有承重牆處敲除開口，並新設鋼結構門形構架補強。",
        "側向穩定性由保留之牆體提供。",
        "垂直載重經由鋼柱與鋼底梁傳遞至既有基礎。",
      ]),
    v("Extension with timber joists", "Aanbouw met houten balklaag",
      "The extension has a timber joist roof, which transfers the loads through loadbearing walls to a new shallow foundation.",
      "De aanbouw wordt gerealiseerd met een houten balklaag als dak, die via dragende wanden afdraagt naar een nieuwe fundering op staal.",
      "木梁系統增建",
      "增建部位之屋頂採用木梁系統，載重經由承重牆體傳遞至新建之淺基礎。"),
  ],
  belendingen: [
    v("Not considered", "Niet beschouwd",
      "The structural influence of adjoining buildings is not considered in this calculation.",
      "De constructieve invloed van belendingen is in deze berekening niet beschouwd.",
      "不予計入",
      "本結構計算書未考量相鄰建築物之結構互制與施工影響。"),
  ],

  // ── 3.2 Aandachtspunten bij uitvoering ──
  "uitvoering-bestaand": [
    v("Check dimensions", "Maatvoering controleren",
      "-Dimensions are based on archive documents and/or the architect's drawing.\n-Dimensions must be verified on site.",
      "-Maatvoering is gebaseerd op archiefstukken en/of de tekening van de architect.\n-Maatvoering moet in het werk worden gecontroleerd.",
      "現場放樣查核尺寸",
      "-圖面尺寸依據調閱圖檔及建築師圖說標示。\n-施工前必須於現場逐項查核確認實際尺寸。"),
  ],
  "uitvoering-verbouw": [
    v("Propping at new openings", "Stempelen bij nieuwe openingen",
      "-When making new openings in existing masonry, provide adequate propping to the wall and the surrounding structure.",
      "-Bij het maken van nieuwe openingen in bestaand metselwerk de wand en de omliggende constructie voldoende stempelen.",
      "新設開口支撐作業",
      "-於既有磚石牆體開鑿新開口時，牆面及周邊構件必須妥善設置足夠之臨時支撐。"),
    v("Demolition sequence", "Volgorde van slopen",
      "-Remove loadbearing elements only after the new structure is in place or the load has been temporarily supported.",
      "-Dragende onderdelen pas verwijderen als de nieuwe constructie is aangebracht of de belasting tijdelijk is opgevangen.",
      "拆除順序",
      "-承重構件僅得於新設結構就位或載重已被妥善臨時承接後始可拆除。"),
  ],
  "uitvoering-nieuwbouw": [
    v("Shallow foundation", "Fundering op staal",
      "-Shallow foundation: establish the bearing stratum during excavation.\n-Have the reinforcement inspected before casting.",
      "-Fundering op staal: de draagkrachtige laag vaststellen tijdens het ontgraven.\n-Wapening voor het storten laten controleren.",
      "淺基礎開挖施工注意",
      "-淺基礎施工：於開挖階段確認承載地層是否符合設計要求。\n-澆置混凝土前必須會同辦理鋼筋綁紮查驗。"),
    v("Piled foundation", "Paalfundering",
      "-Send the piling records and pile deviations to the structural engineer.\n-Inspect the reinforcement of the foundation and of all floor pours.",
      "-Kalenderstaten en paalafwijkingen naar de constructeur sturen.\n-Wapeningscontroles van de fundering en van alle vloerstorts.",
      "基樁施工注意",
      "-樁施工記錄表（打設/鑽掘日誌）及樁位偏差記錄應送交結構技師覆核。\n-辦理基礎及各樓層澆置前之鋼筋查驗。"),
  ],

  // ── 4 Uitgangspunten ──
  trillingen: [
    v("Floor vibrations", "Trillingen bij vloeren",
      "Vibration calculations are carried out for floor structures.\nVibrations are not considered further for other elements.",
      "Bij vloerconstructies worden trillingsberekeningen uitgevoerd.\nVoor overige onderdelen worden trillingen verder niet beschouwd.",
      "樓板振動檢討",
      "樓板結構已辦理人行行走與使用之振動檢討。\n其餘構件未予另行評估振動。"),
    v("Not considered", "Niet beschouwd",
      "Vibrations are not considered in this calculation.",
      "Trillingen worden in deze berekening niet beschouwd.",
      "不予計入",
      "本計算書未針對構件之振動行為進行專案分析。"),
  ],
  vervormingen: [
    v("Standard", "Standaard",
      "The deformation limits below apply to this project.",
      "De onderstaande vervormingseisen worden gehanteerd voor dit project.",
      "標準規範要求",
      "本工程採用下列變形與位移限制標準。"),
  ],
  montage: [
    v("Final stage", "Eindfase",
      "This calculation considers the structure in its final stage. The various construction stages, such as propping, are not included.",
      "Deze berekening gaat uit van de constructie in de eindfase. Het berekenen van de verschillende bouwfasen, zoals onderstempeling, is niet meegenomen.",
      "完工使用階段",
      "本計算書以結構體完工後之使用狀態為分析基準。各施工階段（如臨時支撐架設與拆除過程）未包含在內。"),
  ],
  rekenprogrammatuur: [
    v("Open CalcSheet Studio", "Open CalcSheet Studio",
      "The calculations in this report were prepared with Open CalcSheet Studio.",
      "De berekeningen in dit rapport zijn opgesteld met Open CalcSheet Studio.",
      "Open CalcSheet Studio",
      "本報告各項計算係以 Open CalcSheet Studio 撰寫製作。"),
    v("Open CalcSheet Studio with appendices", "Open CalcSheet Studio met bijlagen",
      "The calculations in this report were prepared with Open CalcSheet Studio.\nCalculations made with other software are in the appendices, which state the version used.",
      "De berekeningen in dit rapport zijn opgesteld met Open CalcSheet Studio.\nBerekeningen met andere rekenprogrammatuur staan in de bijlagen; daarin is de gebruikte versie benoemd.",
      "Open CalcSheet Studio 附附件",
      "本報告各項計算係以 Open CalcSheet Studio 撰寫製作。\n使用其他分析軟體計算之成果列於附件中，附件並敘明所採用之程式版本。"),
  ],
  temperatuur: [
    v("Not applicable", "Niet aan de orde",
      "No particular thermal actions apply to this project.",
      "Bij dit project zijn geen bijzondere temperatuursinvloeden aan de orde.",
      "不適用",
      "本工程無特殊之溫度載重效應。"),
    v("Per element", "Per onderdeel",
      "Thermal actions are considered for the elements concerned.",
      "Temperatuursinvloeden worden bij de desbetreffende onderdelen beschouwd.",
      "按構材檢討",
      "溫度效應已於相關受影響構件之計算中分別檢討。"),
  ],
  aardbeving: [
    v("Not required", "Niet voorgeschreven",
      "No seismic design situation is required.",
      "Er is geen aardbevingsontwerpsituatie voorgeschreven.",
      "非強制要求",
      "本項目依規定無須另訂特殊耐震設計情境。"),
  ],

  // ── 5 Belastingen ──
  sneeuw: [
    v("Standard", "Standaard",
      "Snow drift and snow loads on pitched roofs are calculated for the elements concerned, where applicable.",
      "Sneeuwophoping en sneeuwbelasting op hellende daken worden bij de desbetreffende onderdelen berekend, indien van toepassing.",
      "標準",
      "如有積雪情形，斜屋頂之雪載重與局部積雪已於相關構件中辦理計算。"),
  ],
  regenwater: [
    v("Not applicable", "Niet van toepassing", "Not applicable", "Niet van toepassing", "不適用", "不適用。"),
    v("Per roof element", "Per dakonderdeel",
      "Water ponding on flat roofs is calculated for the roof elements concerned.",
      "Wateraccumulatie op platte daken wordt bij de desbetreffende dakonderdelen berekend.",
      "按屋頂構材檢討",
      "平屋頂之雨水積水（逕流積聚）載重已於各該屋頂構件中辦理檢核。"),
  ],
};

/**
 * De vorige naam van het programma. Een opgeslagen rapport houdt zijn tekst
 * bij Toegepaste rekenprogrammatuur, ook als daar deze naam in staat: een
 * uitgebracht rapport verandert niet vanzelf. Het paneel wijst er wel op.
 */
export const VORIGE_PRODUCTNAAM = "OpenAEC Calc";

/**
 * Noemt deze tekst de vorige naam van het programma? Alleen als losse woorden
 * (woordgrenzen), ook over een regeleinde heen: "OpenAEC Calculations Studio"
 * begint met dezelfde letters, maar is niet de vorige naam. Het patroon is
 * VORIGE_PRODUCTNAAM; scripts/check-rapport.mjs houdt de twee gelijk.
 */
export function noemtVorigeProductnaam(tekst: string): boolean {
  return /\bOpenAEC\s+Calc\b/.test(tekst);
}

/**
 * De tekst-ids die in een nieuw rapport meteen hun eerste variant krijgen. De
 * overige onderdelen (bestaande situatie, wijziging, belendingen,
 * aandachtspunten) verschillen per project te veel: die beginnen leeg en
 * vallen dan uit het rapport tot de gebruiker er iets invult.
 */
export const STANDAARD_IN_NIEUW_RAPPORT: readonly string[] = [
  "inleiding", "projectomschrijving", "rol", "trillingen", "vervormingen", "montage",
  "rekenprogrammatuur", "temperatuur", "aardbeving", "sneeuw", "regenwater",
];

/** Per tekst-id de eerste variant in deze taal, voor standaardRapport(); ids zonder standaard ontbreken. */
export function standaardTeksten(taal = "en"): Record<string, string> {
  const uit: Record<string, string> = {};
  for (const id of STANDAARD_IN_NIEUW_RAPPORT) {
    const eerste = STANDAARD_TEKSTEN[id]?.[0];
    if (eerste) uit[id] = inTaal(eerste.tekst, taal);
  }
  return uit;
}
