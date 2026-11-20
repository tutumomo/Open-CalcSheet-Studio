# De IFC-opslag en -export

## Waarom dit meer is dan een exportknop

Binnen het OpenAEC-ecosysteem is **IFCX de centrale drager**. De stichting
schrijft het zelf zo op: *"Within the OpenAEC ecosystem, IFCX is the central
data format. Each tool reads and writes IFCX"* — zodat data door de hele
AEC-keten stroomt *"without conversion or data loss"*.

Dit programma is daarin de constructieve rekenschakel. Wat hier niet in de
IFCX belandt, bestaat voor de rest van de keten niet: de geotechniekstudio
levert de sondering, dit levert de toetsing, een viewer toont het. Daarom is het
projectbestand zelf IFCX, en staat elk blad erin.

Zie [projectmodel.md](projectmodel.md) voor hoe een project is opgebouwd.

## Het bestand

Een `.ifccalculation` is **zuiver IFCX**, volgens `schema/ifcx.tsp` van
[buildingSMART/IFC5-development](https://github.com/buildingSMART/IFC5-development):
op het hoogste niveau alleen `header`, `imports`, `schemas` en `data`. Dezelfde
inhoud met de extensie `.ifcx` is hetzelfde bestand. De code staat in
`packages/core/src/ifcx/`.

```jsonc
{
  "header": {
    "id": "ocss:project:6b0c…",
    "ifcxVersion": "ifcx_alpha",
    "dataVersion": "2.0.0",          // de formaatversie van het projectbestand
    "author": "Ir. Voorbeeld",
    "timestamp": "2026-11-02T08:00:00.000Z"
  },
  "imports": [
    { "uri": "https://ifcx.dev/@standards.buildingsmart.org/ifc/core/ifc@v5a.ifcx" },
    { "uri": "https://ifcx.dev/@standards.buildingsmart.org/ifc/core/prop@v5a.ifcx" }
  ],
  "schemas": { "ocss::blad": { "value": { "dataType": "Object", "objectRestrictions": { … } } }, … },
  "data": [
    { "path": "6b0c…", "children": { "Site": "…", "Rekenbladen": "…", "Constructierapport": "…" },
      "attributes": {
        "bsi::ifc::class": { "code": "IfcProject", "uri": "https://identifier.buildingsmart.org/uri/buildingsmart/ifc/4.3/class/IfcProject" },
        "bsi::ifc::prop::Name": "Proefproject",
        "ocss::project": { "formaatversie": 2, "gegevens": [{ "naam": "CC", "waarde": "2" }, …], "verborgen": { "rapport": true } } } },
    { "path": "a41f…", "children": { "Figuur_1": "…" },
      "attributes": {
        "bsi::ifc::class": { "code": "IfcGroup", … },
        "bsi::ifc::prop::Name": "BL-01 begane grond",
        "ocss::blad": { "id": "ex-…", "volgorde": 0, "templateId": "balklaag", "soort": "rekenblad", "bronVersie": "abc1234" },
        "ocss::blad::rekentekst": "# Balklaag — EN 1995\n…",
        "ocss::blad::invoer": [{ "naam": "b_balk", "waarde": "75" }, …],
        "ocss::blad::uitkomst": {
          "status": "voldoet", "titel": "Balklaag", "norm": "EN 1995", "uc": 0.82,
          "invoervelden": [{ "naam": "b_balk", "label": "Breedte", "soort": "veld", "waarde": "75", "getal": 75, "eenheid": "mm" }, …],
          "variabelen": [{ "naam": "f_m_d", "tekst": "13.62 N / mm^2", "waarde": 13.62497, "eenheid": "N / mm^2", "formule": "k_mod*f_m_k/γ_M", "invulling": "0.9*(19.68 N / mm^2)/1.3", "kop": "Sterkte" }, …],
          "unityChecks": [{ "naam": "UC_buiging", "tekst": "0.82", "waarde": 0.82, "voldoet": true }, …] } } }
  ]
}
```

### De boom

```
Project (IfcProject)                ocss::project
├─ Site (IfcSite)
│  └─ Hoofdgebouw (IfcBuilding)
│     └─ Begane grond (IfcBuildingStorey)
│        ├─ BL-01 (IfcBeam)         ocss::element, met verwijzingen naar zijn toetsing
│        └─ geometrie van een blad  zie hieronder
├─ Rekenbladen
│  └─ blad (IfcGroup)               ocss::blad, ::rekentekst, ::invoer, ::elementen, ::pdf, ::xlsx, ::markdown, ::uitkomst
│     └─ figuur                     ocss::figuur: svg, plot, 3d, afbeelding, iframe, ifcx
└─ Constructierapport               ocss::rapport
   └─ belasting                     ocss::belasting: symbool, soort (G of Q), waarde en eenheid
```

Paden zijn UUID's, afgeleid van de plek in het project, dus gelijk bij elke
opslag. De namen onder `children` zijn leesbaar en zonder `/`; de echte naam
staat in `bsi::ifc::prop::Name`. De volgorde van de bladen staat in
`ocss::blad.volgorde`, niet in de volgorde van de knopen.

**Elk blad staat erin**, herkend of niet. Een blad is een `IfcGroup` en geen
element, want een kruipfactor of een bout is geen bouwdeel. Een `IfcBeam` hangt
alleen in de ruimtelijke boom als het blad een balk beschrijft of als de
constructeur een element heeft aangewezen.

### Wat telt en wat afgeleid is

Bij het openen telt: de projectnaam, de gegevens, de verborgen onderdelen, het
rapport, en per blad zijn naam, id, `templateId`, `bronVersie`, rekentekst,
invoer, elementen, PDF, werkmap en Markdown-tekst, en de antwoorden van Open FEM
Studio op de `@toets`-blokken (`ocss::blad::toetsing`). Die antwoorden zijn geen
afleiding: de app kan ze niet zelf opnieuw maken. Per hash van de invoer op het
blad staan er de tool, de datum, de herkomst (`versie`, `sha256`, `schema`) en het
verzoek en het antwoord als JSON-tekst.

Afgeleid, en alleen voor andere lezers: `ocss::blad::uitkomst`, `ocss::figuur`,
`ocss::belasting`, de elementen in de ruimtelijke boom en de geometrie. De app rekent die bij het
openen opnieuw uit de tekst en de invoer. Zo kan een andere lezer de resultaten
gebruiken zonder de rekentaal te kennen, en blijft de tekst de waarheid.

Opslaan, openen en opslaan geeft dezelfde inhoud, afgezien van het tijdstempel.
Een andere lezer die een knoop aanvult (dezelfde `path` nog een keer, zoals IFCX
dat bedoelt), wordt gelezen zoals IFCX het samenstelt: de laatste wint per
attribuut. Knopen van een ander programma die de app niet kent, blijven bij
opnieuw opslaan niet staan.

### De namespace `ocss::`

Wat de standaard al kent, gaat daar: `bsi::ifc::class`, `bsi::ifc::prop::Name`,
`Length`, `Width`, `Height`, `RefElevation`, en `usd::…` voor geometrie. Maten
onder `bsi::ifc::prop::` staan in meter, zoals in de voorbeelden van
buildingSMART. De uitkomsten dragen hun eigen eenheid.

Voor rekenresultaten is nergens een afspraak: buildingSMART publiceert alleen
`bsi::` en `usd::`, en op ifcx.dev staat niets van OpenAEC. De zusterprogramma's
schrijven de afkorting van het programma en dan het onderwerp (`oses::calc::…`,
`openbim::project`). Dezelfde vorm dus: één namespace `ocss::`, die **volledig
in elk bestand** staat onder `schemas`. Wie het bestand opent, heeft geen netwerk
nodig om te weten wat er staat. Niet onder `bsi::`, want dat is de namespace van
een ander, en niet onder `ifcx::`, want die naam is van het formaat zelf en in
Ifc-Factory bezet voor tekeningen. Mocht er een OpenAEC-afspraak komen, dan gaat
dit daarin op met één nieuwe formaatversie.

Schrijvers van attributen buiten die lijst (de geometrie van een blad) krijgen
automatisch een beschrijving in het bestand, want de lezer van buildingSMART
keurt een attribuut zonder schema af.

### Twee dingen die de specificatie anders zegt dan de voorbeelden

- `ifcx.tsp` geeft `path` het patroon `</[A-Za-z0-9_/.:]+>`, maar alle voorbeelden
  van buildingSMART gebruiken UUID's en hun eigen lezer controleert dat patroon
  niet. Dit bestand volgt de voorbeelden.
- Het type `Blob` staat in de specificatie, maar de lezer van buildingSMART kent
  het niet en keurt het af. Een PDF staat daarom als `String` (base64), met
  `mediaType` en `grootte` erbij.

## Oude bestanden

Openen gaat nog steeds voor:

- versie 1: een eigen documentvorm (`@context`, `header`, `data`) met `source` en
  `project` ernaast, of alleen `project`;
- een los blad: JSON met `source.content`;
- een `.cpd`: kale rekentekst.

Bij opnieuw opslaan worden ze versie 2. Het eerste opslaan over een oud bestand
heen laat in de app een kopie achter: `<naam>.v1.bak` in dezelfde map, één keer
(`bewaarOudeVersie` in `tauri/fileOps.ts`). In de browser kan dat niet: een pagina
kan niet naast een gekozen bestand schrijven.

Een oudere versie van de app kan versie 2 niet lezen; die zou het bestand als
rekentekst openen. Open het dus met een nieuwe versie.

IFCX van een ander programma opent niet als project: dat geeft een melding.

## STEP

`bouwProjectStep` maakt IFC4X3_ADD2 **uit het IFCX-document**. Er is één bouwer,
dus de twee vertellen hetzelfde.

- `IfcProject` → `IfcSite` → `IfcBuilding` → `IfcBuildingStorey` via
  `IfcRelAggregates`, de elementen via `IfcRelContainedInSpatialStructure`, met
  plaatsingen, eenheden en `IfcOwnerHistory`. Lengtes in millimeter.
- De GlobalId van een object is de korte vorm van de UUID van zijn knoop. Een
  aangewezen element houdt zijn GlobalId uit het bronmodel.
- Elk blad is een `IfcDocumentInformation` met `IfcRelAssociatesDocument`: een
  rekenblad ís een document, met een kenmerk, een naam en een versie. `Location`
  wijst naar de knoop in het IFCX. De rekentekst en een PDF staan alleen in het
  IFCX; een veld in STEP is daar niet voor bedoeld.
- Een property set moet aan een object hangen, en een blad zonder element heeft
  er geen. Daarom is elk blad ook een `IfcGroup`. Een elementproxy zou een bouwdeel
  verzinnen dat er niet is; een groep is de verzameling die dit blad toetst. De
  elementen horen via `IfcRelAssignsToGroup` bij de groep en krijgen dezelfde sets
  en hetzelfde document, want daar kijkt iemand die in een viewer op een balk
  klikt.
- De sets heten `OCSS_Toetsing` (oordeel, norm, unity checks), `OCSS_Invoer`,
  `OCSS_Uitkomsten` (elke variabele, met de formule in `Specification`),
  `OCSS_Projectgegevens` en `OCSS_Element`. Niet `Pset_…`: dat voorvoegsel is van
  de standaard. Staat een element aan twee bladen, dan krijgt de tweede
  `OCSS_Toetsing_2`.
- Een waarde krijgt het maattype dat bij zijn eenheid hoort: `N / mm^2` is een
  `IfcPressureMeasure`, `kN m` een `IfcTorqueMeasure`, `mm^4` een
  `IfcMomentOfInertiaMeasure`, `kN / m` een `IfcLinearForceMeasure`, enzovoort. Het
  getal blijft dat van het blad; de eenheid staat erbij in `Unit`, tenzij het de
  eenheid van het project is. W en S in `mm^3` zijn weerstandsmomenten, E en G
  moduli. Een eenheid die niet te herkennen is, wordt een
  `IfcContextDependentUnit` met de tekst zoals hij er staat.

## Geometrie

`IfcCalcSheet.geometrie` is een lijst IFCX-knopen (`IfcxKnoop`). De wortels ervan
komen onder de bouwlaag, en elke knoop met `bsi::ifc::class` verwijst naar de
toetsing van dat blad. In de STEP wordt zo'n knoop een element, met
`usd::usdgeom::mesh` en `usd::xformop` als `IfcTriangulatedFaceSet` (ook via
`inherits`), `bsi::ifc::material` als `IfcMaterial`, en de delen van een
samenstelling via `IfcRelAggregates`. Een klasse die niet in de lijst in `step.ts`
staat, wordt een proxy met de klasse als `ObjectType`.

Twee modules leveren geometrie: de balklaag (`packages/core/src/balklaagIfcx.ts`) en
de tweepaalspoer (`components/calc/poerIfcx.ts`). De poer is een `IfcFooting` met twee
`IfcPile`, een `IfcColumn` en een samenstelling met de korf: elke staaf een
`IfcReinforcingBar` met zijn diameter (`NominalDiameter`). Palen en kolom zijn alleen
de aanzet; hun lengte staat niet in het blad. Merken en een buiglijst staan er niet in.
Hetzelfde document is het 3D-model in het beeld van de poer.

## Koppelen aan een bestaand model

Een exemplaar kan vastleggen over wélke elementen in een bronmodel het gaat:

```ts
elementen?: ElementRef[]   // { id: GlobalId of IFCX-pad, naam?: string }
```

- **Leeg** — losstaande berekening. Dit is de normale gang van zaken en blijft
  dat: een kruipfactor of een boutberekening heeft geen model nodig.
- **Gevuld** — de toetsing hoort bij díé elementen. Eén balklaagberekening kan zo
  aan alle balken van die laag hangen; dat is precies hoe je toetst.

Een GlobalId wordt in IFCX de UUID van dat element, zo heet het in de IFCX van het
bronmodel. Bij het samenstellen van de twee komt de toetsing dus op het echte
element terecht.

De koppeling wordt **nooit geraden**. De herkenning in `ifcx/herkenning.ts` herkent
hoogstens het *soort* element aan de variabelenamen: paal, fundering of balk. Wélk
element een toetsing beschrijft weet alleen de constructeur, dus dat wordt
aangewezen, niet afgeleid. Het veld is er, maar er is nog geen manier om het in de
app te vullen: het inladen van een model en het aanklikken van elementen is een
eigen feature.

## Waar je het ziet

De tab IFC toont het hele project: de boom, de inhoud van de gekozen knoop, en de
IFCX en de STEP. Exporteren en kopiëren gaan via het lint, en via de API
(`ifc_get`, `export_ifc`; zie [api.md](api.md)). Op het scherm zijn lange teksten
ingekort; de export bevat alles.

## Controleren

`scripts/check-ifcx.mjs` loopt mee in de controles en werkt zonder netwerk: de
vorm volgens de specificatie, elk attribuut tegen zijn schema, heen en terug, oude
bestanden en de STEP tegen het IFCX.

Daarnaast, met de hand en lokaal, want er komt software van buiten bij kijken:

- de lezer van buildingSMART (`src/ifcx-core`, `IfcxLayerStackBuilder`) over het
  bestand, die de schema's onder `imports` ophaalt en elk attribuut controleert;
- IfcOpenShell over de STEP: `python -m ifcopenshell.validate --rules bestand.ifc`
  (`--rules` vraagt ook `pytest` in dezelfde omgeving).

Zet een projectbestand nooit in een online validator.

## Wat nog open staat

**Herkenning.** Er zijn drie soorten (paal, fundering, balk). Kolommen, wanden en
verbindingen worden niet herkend. Dat uitbreiden vraagt domeinkennis over welke
variabelenaam wat betekent. Een blad dat niet wordt herkend staat er wel in, als
blad.

**Plaats.** De meeste bladen weten niet waar hun onderdeel staat: een balklaag kent
zijn overspanning en profiel. Elementen zonder geometrie staan daarom op de
oorsprong van de bouwlaag.

**Bladen uit het ontwerpbeeld.** Tekeningen die een parametrisch beeld op het
scherm tekent, staan niet in het bestand als figuur; alleen wat de rekentekst zelf
tekent.
