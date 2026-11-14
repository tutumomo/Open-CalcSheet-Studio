/**
 * De namespace `ocss::` en de schema's erbij.
 *
 * IFCX staat op het hoogste niveau alleen `header`, `imports`, `schemas` en
 * `data` toe; wat een programma verder kwijt wil, zet het als attribuut op een
 * knoop, onder een eigen namespace, en beschrijft het onder `schemas`.
 *
 * Waarom `ocss::`: buildingSMART publiceert alleen `bsi::` en `usd::`, en voor
 * rekenresultaten is er nergens een afspraak; op ifcx.dev staat niets van
 * OpenAEC. Het zusterprogramma voor constructief werk schrijft al
 * `oses::calc::…` en `oses::structural::…`: de afkorting van het programma,
 * dan het onderwerp. Dezelfde vorm dus. Geen `bsi::ifc::prop::…`, want dat is de
 * namespace van een ander; geen `ifcx::`, want die naam is van het formaat zelf
 * en in Ifc-Factory bezet voor tekeningen. De schema's staan compleet in elk
 * bestand: wie het opent, heeft geen netwerk nodig om te weten wat er staat.
 *
 * Wat in de standaard al een plek heeft, gaat daar: `bsi::ifc::class` en
 * `bsi::ifc::prop::Name` en dergelijke, met een verwijzing onder `imports`.
 */
import type { IfcxImport, IfcxSchema, IfcxWaarde } from './typen.js';

export const IFCX_VERSIE = 'ifcx_alpha';

export const ATTR = {
  klasse: 'bsi::ifc::class',
  naam: 'bsi::ifc::prop::Name',
  omschrijving: 'bsi::ifc::prop::Description',
  lengte: 'bsi::ifc::prop::Length',
  breedte: 'bsi::ifc::prop::Width',
  hoogte: 'bsi::ifc::prop::Height',
  peil: 'bsi::ifc::prop::RefElevation',
  mesh: 'usd::usdgeom::mesh',
  plaatsing: 'usd::xformop',

  project: 'ocss::project',
  rapport: 'ocss::rapport',
  blad: 'ocss::blad',
  rekentekst: 'ocss::blad::rekentekst',
  invoer: 'ocss::blad::invoer',
  elementen: 'ocss::blad::elementen',
  pdf: 'ocss::blad::pdf',
  xlsx: 'ocss::blad::xlsx',
  markdown: 'ocss::blad::markdown',
  graaf: 'ocss::blad::graaf',
  tekenvel: 'ocss::blad::tekenvel',
  jupyter: 'ocss::blad::jupyter',
  marimo: 'ocss::blad::marimo',
  toetsing: 'ocss::blad::toetsing',
  varianten: 'ocss::blad::varianten',
  ontwerp: 'ocss::blad::ontwerp',
  uitkomst: 'ocss::blad::uitkomst',
  figuur: 'ocss::figuur',
  element: 'ocss::element',
} as const;

const IFC_URI = 'https://ifcx.dev/@standards.buildingsmart.org/ifc/core/ifc@v5a.ifcx';
const PROP_URI = 'https://ifcx.dev/@standards.buildingsmart.org/ifc/core/prop@v5a.ifcx';
const USD_URI = 'https://ifcx.dev/@openusd.org/usd@v1.ifcx';
const MAT_URI = 'https://ifcx.dev/@standards.buildingsmart.org/ifc/ifc-mat/ifc-mat@v1.0.0.ifcx';

/**
 * Wat de bestanden onder `imports` beschrijven (ifc@v5a, prop@v5a en usd@v1).
 * Een attribuut dat hier niet bij staat en ook niet in OCSS_SCHEMAS, krijgt een
 * eigen beschrijving in het bestand, want anders keurt de lezer het af.
 */
const UIT_IFC = new Set([
  'bsi::ifc::presentation::diffuseColor', 'bsi::ifc::presentation::opacity', 'bsi::ifc::class',
  'bsi::ifc::spaceBoundary', 'bsi::ifc::material', 'bsi::ifc::alignment',
  'bsi::ifc::alignmenthorizontalsegment', 'bsi::ifc::alignmentverticalsegment',
  'bsi::ifc::alignmentcantsegment', 'bsi::ifc::system::connectsto', 'bsi::ifc::system::flowdirection',
  'bsi::ifc::system::partofsystem', 'bsi::ifc::system::servicesfacility',
]);
const UIT_PROP = new Set([
  'Name', 'Description', 'UsageType', 'RefElevation', 'ElevationOfRefHeight', 'ElevationOfTerrain',
  'NumberOfStoreys', 'IsExternal', 'Volume', 'NetVolume', 'Height', 'Width', 'Length', 'Depth',
  'NetArea', 'NetSideArea', 'CrossSectionArea', 'Station', 'TypeName',
].map((n) => `bsi::ifc::prop::${n}`));
const UIT_USD = new Set([
  'usd::usdgeom::mesh', 'usd::usdgeom::visibility', 'usd::xformop', 'usd::usdgeom::basiscurves',
]);
const UIT_MAT = new Set(
  ['StrengthClass', 'MoistureContent', 'MassDensity', 'GWP'].map((n) => `bsi::ifc-mat::prop::${n}`),
);

/** Staat de beschrijving van dit attribuut in een van de geïmporteerde bestanden? */
export function isGeimporteerd(attribuut: string): boolean {
  return UIT_IFC.has(attribuut) || UIT_PROP.has(attribuut) || UIT_USD.has(attribuut) || UIT_MAT.has(attribuut);
}

/** De imports bij deze attributen: ifc en prop altijd, usd en ifc-mat alleen als ze gebruikt worden. */
export function importsVoor(attributen: Iterable<string>): IfcxImport[] {
  const lijst = [...attributen];
  const uit: IfcxImport[] = [{ uri: IFC_URI }, { uri: PROP_URI }];
  if (lijst.some((a) => UIT_MAT.has(a))) uit.push({ uri: MAT_URI });
  if (lijst.some((a) => UIT_USD.has(a))) uit.push({ uri: USD_URI });
  return uit;
}

/** De verwijzing naar een IFC-klasse, in de vorm van de voorbeelden van buildingSMART. */
export function ifcKlasse(code: string): { code: string; uri: string } {
  return { code, uri: `https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/${code}` };
}

// ── Bouwstenen ──────────────────────────────────────────────────────────────

const TEKST: IfcxWaarde = { dataType: 'String' };
const GEHEEL: IfcxWaarde = { dataType: 'Integer' };
const GETAL: IfcxWaarde = { dataType: 'Real' };
const JANEE: IfcxWaarde = { dataType: 'Boolean' };
const opt = (w: IfcxWaarde): IfcxWaarde => ({ ...w, optional: true });
const object = (values: Record<string, IfcxWaarde>): IfcxWaarde => ({ dataType: 'Object', objectRestrictions: { values } });
const lijst = (value: IfcxWaarde): IfcxWaarde => ({ dataType: 'Array', arrayRestrictions: { value } });
const keuze = (...options: string[]): IfcxWaarde => ({ dataType: 'Enum', enumRestrictions: { options } });
/** Een map met vrije sleutels: de ids van teksten of bladen zijn niet op te sommen. */
const VRIJ: IfcxWaarde = { dataType: 'Object' };

const PAAR = object({ naam: TEKST, waarde: TEKST });

/** Alles optioneel: `waarden` in het bestand blijft zo geldig als het rapportmodel groeit. */
function velden(namen: string[], type: IfcxWaarde = TEKST): Record<string, IfcxWaarde> {
  return Object.fromEntries(namen.map((n) => [n, opt(type)]));
}

export const UITKOMST_STATUS = ['voldoet', 'voldoet_niet', 'geen_oordeel', 'niet_doorgerekend'] as const;

/** Het constructierapport (rapport/model.ts in de app), veld voor veld. */
const RAPPORT = object({
  versie: opt(GEHEEL),
  taal: opt(TEKST),
  opzetSoort: opt(keuze('eurocode', 'tw')),
  tekstTaal: opt(VRIJ),
  ...velden(['titel', 'kenmerk', 'normen', 'opdrachtgeverAdres', 'verantwoordelijk', 'uitvoerend']),
  fase: opt(keuze('', 'SO', 'VO', 'DO', 'TO', 'UO')),
  revisies: opt(lijst(object({
    ...velden(['code', 'datum', 'omschrijving']),
    status: opt(keuze('concept', 'ter goedkeuring', 'definitief')),
  }))),
  teksten: opt(VRIJ),
  rol: opt(object(velden(['rol', 'architect', 'datumOnderlegger']))),
  uitgangspunten: opt(object({
    soortBouwwerk: opt(TEKST),
    brand: opt(object(velden(['hoofddraagconstructie', 'brandscheiding', 'vluchtroute', 'verwijzing']))),
    materialen: opt(lijst(object(velden(['type', 'soort', 'opmerking'])))),
    materialenNoot: opt(TEKST),
    bevestiging: opt(lijst(object(velden(['type', 'kwaliteit'])))),
    conservering: opt(lijst(object(velden(['onderdeel', 'systeem'])))),
    conserveringSlot: opt(TEKST),
    bestaand: opt(object({
      opnemen: opt(JANEE),
      ...velden(['bouwjaar', 'bron', 'berekeningBeschikbaar', 'materiaalgegevensBeschikbaar']),
    })),
    vervormingen: opt(lijst(object(velden(['onderdeel', 'ueind', 'ubij', 'uhor'])))),
  })),
  belastingen: opt(object({
    wind: opt(object({
      ...velden(['gebouwhoogte', 'cscd']),
      coefficienten: opt(lijst(object(velden(['omschrijving', 'c'])))),
    })),
    klassen: opt(lijst(object(velden(['categorie', 'lichteScheidingswanden', 'dakhelling', 'qlast'])))),
    vloerenDaken: opt(lijst(object({
      soort: opt(keuze('vlak', 'gevel')),
      naam: opt(TEKST),
      lagen: opt(lijst(object(velden(['naam', 'd', 'rho', 'p', 'h', 'vulling'])))),
    }))),
    wanden: opt(lijst(object({
      soort: opt(keuze('vlak', 'gevel')),
      naam: opt(TEKST),
      lagen: opt(lijst(object(velden(['naam', 'd', 'rho', 'p', 'h', 'vulling'])))),
    }))),
  })),
  toelichting: opt(VRIJ),
  inHoofdstuk: opt(VRIJ),
  bijlagen: opt(lijst(TEKST)),
  nieuwePagina: opt(VRIJ),
  opmaak: opt(object(velden(['constructieprincipe', 'subkoppen', 'bladenInInhoud'], JANEE))),
  bureau: opt(object({
    ...velden(['naam', 'adres', 'postcode', 'plaats', 'telefoon', 'email', 'logo', 'voetafbeelding']),
    logoInKop: opt(JANEE),
    huisstijl: opt(object(velden(['hoofdkleur', 'accentkleur', 'tabeltekst', 'invoerkleur', 'lettertype']))),
    constructeurs: opt(lijst(object(velden(['naam', 'telefoon', 'email'])))),
  })),
});

/** De schema's van alles onder `ocss::`. Elk bestand draagt ze zelf mee. */
export const OCSS_SCHEMAS: Record<string, IfcxSchema> = {
  [ATTR.project]: {
    value: object({
      formaatversie: GEHEEL,
      gegevens: lijst(PAAR),
      verborgen: opt(object({ gegevens: opt(JANEE), rapport: opt(JANEE) })),
    }),
  },
  [ATTR.rapport]: { value: RAPPORT },
  [ATTR.blad]: {
    value: object({
      id: TEKST,
      volgorde: GEHEEL,
      templateId: TEKST,
      soort: keuze('rekenblad', 'pdf', 'spreadsheet', 'markdown', 'graaf', 'tekenblad', 'jupyter', 'marimo'),
      module: opt(TEKST),
      bronVersie: opt(TEKST),
      ref: opt(TEKST),
    }),
  },
  [ATTR.rekentekst]: { value: TEKST },
  [ATTR.invoer]: { value: lijst(PAAR) },
  // De invoer zoals het blad is opgeleverd (sheet_set_input): wat daarvan afwijkt, is later gewijzigd.
  [ATTR.ontwerp]: { value: lijst(PAAR) },
  [ATTR.elementen]: {
    value: lijst(object({ id: TEKST, naam: opt(TEKST) })),
  },
  [ATTR.pdf]: {
    value: object({
      bestandsnaam: TEKST,
      mediaType: TEKST,
      grootte: GEHEEL,
      // Base64. IFCX kent het type Blob wel, maar de lezer van buildingSMART kan er nog niets mee.
      data: TEKST,
      // Aantekeningen op de pagina's, in punten van de pagina. De PDF in `data` verandert niet.
      aantekeningen: opt(lijst(object({
        id: TEKST,
        pagina: GEHEEL,
        soort: TEKST,
        kleur: TEKST,
        dikte: GETAL,
        punten: opt(lijst(lijst(GETAL))),
        van: opt(lijst(GETAL)),
        naar: opt(lijst(GETAL)),
        x: opt(GETAL),
        y: opt(GETAL),
        b: opt(GETAL),
        h: opt(GETAL),
        tekst: opt(TEKST),
        grootte: opt(GETAL),
      }))),
      // Alleen `false` staat in het bestand: de aantekeningen blijven dan op het scherm.
      opPapier: opt({ dataType: 'Boolean' }),
    }),
  },
  [ATTR.xlsx]: {
    value: object({
      bestandsnaam: TEKST,
      mediaType: TEKST,
      grootte: GEHEEL,
      data: TEKST,
    }),
  },
  [ATTR.jupyter]: {
    value: object({
      bestandsnaam: TEKST,
      mediaType: TEKST,
      grootte: GEHEEL,
      // Base64 van de ingepakte werkmap, zoals een PDF of werkmap.
      data: TEKST,
      metCode: JANEE,
      // Alle cellen opnieuw uitvoeren na een wijziging; zonder: alleen op verzoek.
      automatisch: opt(JANEE),
    }),
  },
  [ATTR.marimo]: {
    value: object({
      bestandsnaam: TEKST,
      // Het notebook als tekst, zoals in het .py-bestand.
      code: TEKST,
      metCode: JANEE,
      // De laatste uitvoer per cel als html, in JSON: een notebook bewaart die zelf niet.
      uitvoer: TEKST,
    }),
  },
  // De antwoorden van Open FEM Studio op de @toets-blokken, per hash van de invoer op het
  // blad. Het verzoek en het antwoord staan als JSON-tekst: hun vorm is die van de tool.
  [ATTR.toetsing]: {
    value: lijst(object({
      hash: TEKST,
      tool: TEKST,
      datum: TEKST,
      versie: opt(TEKST),
      sha256: opt(TEKST),
      schema: opt(TEKST),
      verzoek: TEKST,
      uitkomst: TEKST,
    })),
  },
  // Varianten van het blad: andere invoer naast die van het blad. Per variant alleen de
  // eigen waarden, in paren zoals de invoer; de uitkomsten rekent de app opnieuw uit.
  [ATTR.varianten]: {
    value: object({
      velden: lijst(TEKST),
      uitkomsten: lijst(TEKST),
      opPapier: opt(JANEE),
      zoek: opt(VRIJ),
      lijst: lijst(object({
        id: TEKST,
        naam: TEKST,
        invoer: lijst(PAAR),
        gezocht: opt(lijst(TEKST)),
      })),
    }),
  },
  [ATTR.markdown]: {
    value: object({
      bestandsnaam: TEKST,
      mediaType: TEKST,
      grootte: GEHEEL,
      // Gewone tekst, geen base64: het projectbestand blijft zo leesbaar en vergelijkbaar.
      tekst: TEKST,
      // Afbeeldingen die naast het bestand stonden: per adres in de tekst een data-URL.
      beelden: opt(VRIJ),
      // De koppen uit de tekst blijven uit de inhoudsopgave van het rapport.
      koppenUit: opt(JANEE),
    }),
  },
  [ATTR.graaf]: {
    value: object({
      versie: GEHEEL,
      nodes: lijst(object({
        id: TEKST,
        soort: TEKST,
        x: GETAL,
        y: GETAL,
        naam: opt(TEKST),
        invoer: opt(lijst(PAAR)),
        geheel: opt(lijst(TEKST)),
      })),
      verbindingen: lijst(object({
        vanNode: TEKST,
        vanPoort: TEKST,
        naarNode: TEKST,
        naarPoort: TEKST,
      })),
    }),
  },
  [ATTR.tekenvel]: {
    value: object({
      formaat: keuze('A4', 'A3', 'A2'),
      ligging: keuze('staand', 'liggend'),
      views: lijst(object({
        id: TEKST,
        titel: TEKST,
        x: GETAL,
        y: GETAL,
        breedte: GETAL,
        hoogte: GETAL,
        schaal: GETAL,
        x0: GETAL,
        y0: GETAL,
        elementen: lijst(VRIJ),
      })),
    }),
  },
  [ATTR.uitkomst]: {
    value: object({
      status: keuze(...UITKOMST_STATUS),
      titel: TEKST,
      norm: opt(TEKST),
      uc: opt(GETAL),
      ucTekst: opt(TEKST),
      fout: opt(TEKST),
      invoervelden: lijst(object({
        naam: TEKST,
        label: opt(TEKST),
        soort: keuze('veld', 'keuze'),
        waarde: TEKST,
        getal: opt(GETAL),
        eenheid: opt(TEKST),
        keuzeTekst: opt(TEKST),
      })),
      variabelen: lijst(object({
        naam: TEKST,
        tekst: TEKST,
        waarde: opt(GETAL),
        eenheid: opt(TEKST),
        formule: opt(TEKST),
        invulling: opt(TEKST),
        kop: opt(TEKST),
        verborgen: opt(JANEE),
      })),
      unityChecks: lijst(object({
        naam: TEKST,
        tekst: TEKST,
        waarde: opt(GETAL),
        voldoet: opt(JANEE),
      })),
    }),
  },
  [ATTR.figuur]: {
    value: object({
      soort: keuze('svg', 'plot', '3d', 'afbeelding', 'iframe', 'ifcx'),
      volgnummer: GEHEEL,
      kop: opt(TEKST),
      svg: opt(TEKST),
      scene: opt(VRIJ),
      bron: opt(TEKST),
      meldingen: opt(lijst(TEKST)),
    }),
  },
  [ATTR.element]: {
    value: object({
      bron: keuze('herkend', 'gekoppeld', 'geometrie'),
      soort: opt(keuze('paal', 'fundering', 'balk')),
      bronId: opt(TEKST),
      bronNaam: opt(TEKST),
      toetsingen: lijst(object({
        ref: TEKST,
        blad: TEKST,
        status: keuze(...UITKOMST_STATUS),
        uc: opt(GETAL),
      })),
    }),
  },
};

/** Een beschrijving bij een waarde die van buiten komt: het type dat erbij past. */
export function beschrijfWaarde(w: unknown): IfcxWaarde {
  if (typeof w === 'string') return TEKST;
  if (typeof w === 'boolean') return JANEE;
  if (typeof w === 'number') return Number.isInteger(w) ? GEHEEL : GETAL;
  if (Array.isArray(w)) {
    const eerste = w.find((x) => x !== null && x !== undefined);
    return lijst(eerste === undefined ? TEKST : beschrijfWaarde(eerste));
  }
  return VRIJ;
}
