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
    count: 1,
    children: [
      { kind: "item", id: "sheet-tw-rc-beam", label: "Gewapend betonnen ligger (rc112)", templateId: "tw-rc-beam", status: "gereed", gepubliceerd: true },
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
