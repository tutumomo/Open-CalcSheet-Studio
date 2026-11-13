/**
 * Modulecatalogus en naslagbibliotheek voor het zijpaneel.
 *
 * Dit bestand beschrijft WAT je kunt invoegen, niet wat er in je project zit.
 * De projectinhoud staat in `store/projectStore.ts`: een lijst exemplaren, elk
 * met een eigen kopie van de rekentekst en eigen invoerwaarden. Een module uit
 * deze catalogus kan dus meerdere keren in een project voorkomen.
 *
 *   - `moduleCatalogus` — rekenmodules, gegroepeerd per materiaal. Invoegen
 *     maakt er een exemplaar van.
 *   - `bibliotheek` — naslag, zoals de rekentaal-voorbeelden. Ook invoegbaar.
 *
 * `templateId` matcht een sleutel in `src/templates/index.ts`.
 *
 * De labels hier zijn Nederlands en geven een nieuw blad zijn naam. Wat de
 * gebruiker in de modulekiezer en de projectboom ziet, komt uit de
 * vertalingen: `catalogus.modules.<templateId>` en `catalogus.groepen.<id>`
 * in i18n/locales/{nl,en}/werkruimte.json. Voeg je hier een module of groep
 * toe, zet hem daar dan ook bij; anders staat het Nederlandse label in beeld.
 */

/**
 * Hoe ver de toetsing van een module is. De teksten die de gebruiker ziet
 * (kort en met uitleg) staan in de vertalingen: `bladVersie.status` en
 * `bladVersie.statusUitleg` in i18n/locales/{nl,en}/common.json.
 */
export type ModuleStatus =
  /** Toetsing uitgewerkt én nagerekend op referentiebladen. */
  | "gereed"
  /** Toetsing staat er, maar is nog niet tegen referentiebladen gecontroleerd. */
  | "controleren"
  /** Hoeveelheden geraamd en nagerekend; geen constructieve toetsing. */
  | "raming"
  /** Alleen invoer en parametrisch beeld — de toetsing moet nog worden gemaakt. */
  | "concept";

export type TreeNode =
  | { kind: "section"; id: string; label: string; children: TreeNode[] }
  | { kind: "category"; id: string; label: string; defaultExpanded?: boolean; children: TreeNode[]; count?: number; bronUrl?: string }
  | {
      kind: "item";
      id: string;
      label: string;
      templateId?: string;
      emphasis?: boolean;
      status?: ModuleStatus;
      /**
       * Nagekeken en vrijgegeven. Ontbreekt of `false` = nog niet.
       *
       * Publicatie staat los van `status`: de status zegt hoe ver de tóétsing
       * is, publicatie zegt of de module is nagekeken en vrijgegeven om mee te
       * werken. Een module kan gecalibreerd zijn en toch nog niet zijn
       * nagekeken — dan is hij wel bruikbaar maar niet vrijgegeven, en dat
       * hoort de gebruiker te zien. De teksten daarvoor staan in
       * werkruimte.json onder `kiezer.publicatie`.
       */
      gepubliceerd?: boolean;
      /** Uit de online modulebibliotheek (store/moduleBibliotheek.ts): naam per taal, beeld en versie. */
      namen?: { nl: string; en: string };
      beeldUrl?: string | null;
      versie?: string;
    };

/**
 * Calc-sheets binnen het huidige project, gegroepeerd per materiaal. Binnen een
 * categorie eerst de constructiedelen (kolom, ligger, wand), daarna de
 * verbindingen en tot slot de losse toetsen. Hoe ver een module is, staat in
 * `status` (zie `ModuleStatus`), niet in de indeling.
 */
export const moduleCatalogus: TreeNode[] = [
  {
    kind: "category",
    id: "cat-algemeen",
    label: "Algemeen",
    defaultExpanded: true,
    count: 2,
    children: [
      { kind: "item", id: "sheet-ligger", label: "Ligger (hout of staal)", templateId: "ligger", status: "controleren" },
      { kind: "item", id: "sheet-doorsnede", label: "Spanningen in een doorsnede", templateId: "doorsnede-spanningen", status: "controleren" },
    ],
  },
  {
    kind: "category",
    id: "cat-hout",
    label: "Hout",
    defaultExpanded: true,
    count: 1,
    children: [
      { kind: "item", id: "sheet-balklaag", label: "Balklaag (houten vloerbalken)", templateId: "balklaag", status: "gereed", gepubliceerd: true },
    ],
  },
  {
    kind: "category",
    id: "cat-beton",
    label: "Beton",
    defaultExpanded: true,
    count: 1,
    children: [
      { kind: "item", id: "sheet-tweepaalspoer", label: "Tweepaalspoer (gewapend beton)", templateId: "tweepaalspoer", status: "controleren" },
    ],
  },
  // 台灣版（台灣設計規範模組）
  {
    kind: "category",
    id: "cat-tw-rc",
    label: "Taiwanese normen — Beton",
    defaultExpanded: true,
    count: 7,
    children: [
      { kind: "item", id: "sheet-tw-rc-beam", label: "Gewapend betonnen ligger (rc112)", templateId: "tw-rc-beam", status: "gereed", gepubliceerd: true },
      { kind: "item", id: "sheet-tw-rc-column", label: "Gewapend betonnen kolom (rc112)", templateId: "tw-rc-column", status: "gereed", gepubliceerd: true },
      { kind: "item", id: "sheet-tw-isolated-footing", label: "Gewapend betonnen fundering op staal (found112 / rc112)", templateId: "tw-isolated-footing", status: "gereed", gepubliceerd: true },
      { kind: "item", id: "sheet-tw-combined-footing", label: "Gewapend betonnen gezamenlijke fundering, twee kolommen (found112 / rc112)", templateId: "tw-combined-footing", status: "gereed", gepubliceerd: true },
      { kind: "item", id: "sheet-tw-rc-slab", label: "Gewapend betonnen eenrichtingsplaat (rc112)", templateId: "tw-rc-slab", status: "gereed", gepubliceerd: true },
      { kind: "item", id: "sheet-tw-pile-cap", label: "Paalfundering met drie of vier palen, staafwerkmodel (rc112)", templateId: "tw-pile-cap", status: "gereed", gepubliceerd: true },
      { kind: "item", id: "sheet-tw-pile-foundation", label: "Paaldraagvermogen en aantal palen (found112)", templateId: "tw-pile-foundation", status: "gereed", gepubliceerd: true },
    ],
  },
  {
    kind: "category",
    id: "cat-tw-steel",
    label: "Taiwanese normen — Staal",
    defaultExpanded: true,
    count: 2,
    children: [
      { kind: "item", id: "sheet-tw-steel-beam", label: "Stalen I-ligger (steel99 LRFD)", templateId: "tw-steel-beam", status: "gereed", gepubliceerd: true },
      { kind: "item", id: "sheet-tw-steel-column", label: "Stalen kolom met voetplaat (steel99 LRFD)", templateId: "tw-steel-column", status: "gereed", gepubliceerd: true },
    ],
  },
  {
    kind: "category",
    id: "cat-tw-civil",
    label: "Taiwanese normen — Civiel",
    defaultExpanded: true,
    count: 7,
    children: [
      { kind: "item", id: "sheet-tw-retaining-wall", label: "Keermuur van gewapend beton (found112 / swc_tech)", templateId: "tw-retaining-wall", status: "gereed", gepubliceerd: true },
      { kind: "item", id: "sheet-tw-drainage-channel", label: "Afwateringsgoot van gewapend beton (swc_tech / rc112)", templateId: "tw-drainage-channel", status: "gereed", gepubliceerd: true },
      { kind: "item", id: "sheet-tw-detention-basin", label: "Bergingsbassin (swc_tech)", templateId: "tw-detention-basin", status: "gereed", gepubliceerd: true },
      { kind: "item", id: "sheet-tw-box-culvert", label: "Gewapend betonnen duiker (hwbridge / rc112)", templateId: "tw-box-culvert", status: "gereed", gepubliceerd: true },
      { kind: "item", id: "sheet-tw-sediment-basin", label: "Bezinkbak (swc_tech 35 / 92 / 93)", templateId: "tw-sediment-basin", status: "gereed", gepubliceerd: true },
      { kind: "item", id: "sheet-tw-gravity-retaining-wall", label: "Zwaartekrachtkeermuur van ongewapend beton of metselwerk (found112 / swc_tech)", templateId: "tw-gravity-retaining-wall", status: "gereed", gepubliceerd: true },
      { kind: "item", id: "sheet-tw-backwater-profile", label: "Wateroppervlakteprofiel in open kanaal, standaardstapmethode (swc_tech)", templateId: "tw-backwater-profile", status: "gereed", gepubliceerd: true },
    ],
  },
  {
    kind: "category",
    id: "cat-tw-bridge",
    label: "Taiwanese normen — Bruggen",
    defaultExpanded: true,
    count: 1,
    children: [
      { kind: "item", id: "sheet-tw-bridge-seismic", label: "Aardbevingsontwerp van bruggen — liquefactie, gronddruk, waterdruk en liggeruiteinden (hwbridgeseis)", templateId: "tw-bridge-seismic", status: "gereed", gepubliceerd: true },
    ],
  },
  {
    kind: "category",
    id: "cat-tw-hout",
    label: "Taiwanese normen — Houtconstructies",
    defaultExpanded: true,
    count: 1,
    children: [
      { kind: "item", id: "sheet-tw-wood-member", label: "Houtconstructie — toetsing van trek-, druk- en buigelementen (wood100 / wood110)", templateId: "tw-wood-member", status: "gereed", gepubliceerd: true },
    ],
  },
  {
    kind: "category",
    id: "cat-tw-load",
    label: "Taiwanese normen — Belastingen",
    defaultExpanded: true,
    count: 3,
    children: [
      { kind: "item", id: "sheet-tw-seismic-load", label: "Aardbevingsbelasting, statische methode (seis113)", templateId: "tw-seismic-load", status: "gereed", gepubliceerd: true },
      { kind: "item", id: "sheet-tw-wind-load", label: "Windbelasting op gebouwen (wind103full)", templateId: "tw-wind-load", status: "gereed", gepubliceerd: true },
      { kind: "item", id: "sheet-tw-dead-live-loads", label: "Permanente en veranderlijke vloerbelasting (btr_struct)", templateId: "tw-dead-live-loads", status: "gereed", gepubliceerd: true },
    ],
  },
];

export const bibliotheek: TreeNode[] = [
  {
    kind: "category",
    id: "rekentaal-samples",
    label: "Voorbeelden",
    defaultExpanded: false,
    count: 1,
    children: [
      { kind: "item", id: "cpd-rekentaal-demo", label: "Open CalcSheet Studio demo", templateId: "rekentaal-demo" },
    ],
  },
];

/** Wat de app van een sjabloon moet weten zodra het een exemplaar wordt. */
export interface ModuleInfo {
  templateId: string;
  label: string;
  status?: ModuleStatus;
  /** Categorie waaronder hij in de catalogus staat (Staal, Beton, ...). */
  categorie: string;
  /** De naam in beide talen, bij een module uit de online bibliotheek. */
  namen?: { nl: string; en: string };
}

function verzamel(nodes: TreeNode[], categorie: string, uit: Record<string, ModuleInfo>) {
  for (const node of nodes) {
    if (node.kind === "item") {
      if (node.templateId && !uit[node.templateId]) {
        uit[node.templateId] = {
          templateId: node.templateId,
          label: node.label,
          status: node.status,
          categorie,
        };
      }
    } else {
      verzamel(node.children, node.kind === "category" ? node.label : categorie, uit);
    }
  }
}

/** Sjabloon-id naar label en status. De naam van een nieuw blad staat in moduleNaam.ts. */
export const modulesPerTemplate: Record<string, ModuleInfo> = (() => {
  const uit: Record<string, ModuleInfo> = {};
  verzamel(moduleCatalogus, "Algemeen", uit);
  verzamel(bibliotheek, "Bibliotheek", uit);
  return uit;
})();
