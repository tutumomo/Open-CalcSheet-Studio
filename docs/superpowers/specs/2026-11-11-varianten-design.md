# Varianten — ontwerp

Datum: 11-11-2026
Status: goedgekeurd op 11-11-2026.

## Waarom

Een constructeur wil een blad snel met andere invoer doorrekenen. Hij wil niet tien
kopieën van een blad maken en die één voor één bijhouden. Het gaat om twee soorten werk:

- **vergelijken:** dezelfde ligger in C24 en C30, met een hogere doorsnede, of in staal;
- **een reeks:** dezelfde ligger bij vijf overspanningen, met per overspanning de
  kleinste hoogte die voldoet.

Varianten is één functie voor de hele app. Hij werkt voor elk rekenblad en elke module,
want hij gebruikt alleen wat elk blad al heeft: invoervelden (`?` en `@select`), de
uitkomst (`leesResultaat`) en de getallen (`leesGetallen`). Een module hoeft er niets
voor te doen.

## Wat de gebruiker ziet

### De tab Varianten

Een rekenblad of module heeft boven de werkruimte de tabs *Code + beeld*, *Code +
uitwerking*, *Beeld + uitwerking* en *Afdrukvoorbeeld*. Daar komt **Varianten** bij,
vóór het afdrukvoorbeeld. Heeft het blad varianten, dan staat het aantal erachter:
*Varianten (6)*. Een canvas-blad heeft de tab ook. Een blad zonder rekentekst
(PDF, werkmap, Markdown, graaf, tekenblad, Jupyter, Marimo) heeft hem niet.

### Eerst kiezen wat varieert

Opent iemand de tab bij een blad zonder varianten, dan ziet hij eerst de vraag welke
invoer hij wil laten variëren. Daaronder staan alle invoervelden van het blad, in de
volgorde van het blad en onder de koppen van het blad, met hun huidige waarde. Er is
een zoekveld. De velden binnen een `#if`-tak staan er ook. Hij vinkt er een paar aan,
bijvoorbeeld 3 van de 41, en kiest *Verder*.

Alle andere invoer is in elke variant gelijk aan het blad en staat niet in de tabel.
Zo blijven de uitgangspunten gelijk. Met *＋ Invoerveld* boven de tabel komt er later
een veld bij. Wordt een veld weggehaald, dan vervallen de eigen waarden van de
varianten voor dat veld.

### De tabel

- **Kolommen:** eerst *Blad*, met de invoer zoals die in het blad staat. Daarna V1, V2,
  enzovoort. Een kolomkop toont de naam van de variant. De naam is te wijzigen en is
  standaard V1, V2, ….
- **Rijen bovenaan (Invoer):** de gekozen velden. De rij heet naar het veld: de naam,
  het label uit het blad en de eenheid, zoals *h — hoogte [mm]*.
- **Rijen onderaan (Uitkomst):**
  - de maatgevende UC (`Resultaat.uc`);
  - het oordeel (*voldoet*, *voldoet niet*, *niet getoetst* of *—*);
  - elke UC van het blad (`isUcNaam`, behalve `UC_max`), in de volgorde van het blad;
  - de uitkomsten die de gebruiker met *＋ Uitkomst* kiest uit de benoemde waarden van
    de uitwerking, zoals `w_fin`, met hun eenheid.
- **Een cel van een variant:**
  - **Leeg** betekent dat de cel het blad volgt. De cel toont dan de waarde van het blad
    in grijs. Verandert het blad, dan verandert de variant mee.
  - **Een getypte waarde** is van de variant en staat zwart.
  - **Delete** maakt de cel weer leeg.
  - Een veld dat in deze variant niet meedoet, omdat het in een `#if`-tak staat die niet
    gekozen is, staat als **—**.
- **Bewerken** gaat als in een werkmap. Tab en Enter gaan naar de volgende cel, de
  pijltjes werken ook. Een keuzelijst wordt in de cel een keuzelijst.
- **Wat er in een cel getypt mag worden** is hetzelfde als in een invoerveld van het
  blad, met dezelfde omrekening (`invoerNaarBron`):
  - een eenheid erachter (5 m in een veld in mm), komma of punt;
  - `#2.R_paal` om een waarde uit een ander blad over te nemen;
  - een eenheid die niet past, krijgt een rode rand en wordt niet opgeslagen.
- **Plakken:** een blok uit een werkmap (tekst met tabs en regeleinden) komt vanaf de
  gekozen cel in de tabel. De rijen zijn velden, de kolommen varianten. Loopt het blok
  verder dan de laatste variant, dan komen er varianten bij.
- **Opmaak van de uitkomsten:**
  - een UC boven 1 of een oordeel *voldoet niet* krijgt een rode achtergrond;
  - *voldoet* staat groen;
  - een cel die nog rekent, toont een stille aanduiding;
  - een variant die niet doorrekent, toont de fout in plaats van uitkomsten.

### Knoppen boven de tabel

- **＋ Variant:** een nieuwe, lege variant. Die is gelijk aan het blad.
- **Kopie:** kopieert de gekozen variant.
- **Plakken uit werkmap:** doet hetzelfde als Ctrl+V in de tabel.
- **Reeks…:** voor één veld *van – tot – stap*, of bij een keuzelijst *van keuze – tot
  keuze*. Dat maakt één variant per waarde. Er komen er hoogstens 50 tegelijk bij, en de
  dialoog meldt het als de reeks meer waarden zou geven.
- **Optimaliseren…** (zie hieronder).
- **＋ Invoerveld** en **＋ Uitkomst**.
- **Vinkje *In de afdruk en het rapport*** (zie Op papier).
- **Rechts de stand:** *Alles doorgerekend*, *4 van 10 doorgerekend*, *2 toetsen bij FEM
  Studio*.

### Het menu van een variant (kolomkop)

- **Uitwerking bekijken:** de volledige uitwerking van die variant, alleen lezen, in de
  plek van de tabel, met een knop terug. Er is ook het parametrische beeld van de module
  als die er een heeft. Dat werkt via `ExemplaarContext`, met een exemplaar met de
  waarden van de variant en `alleenLezen`.
- **Overnemen in het blad:** de invoer van de variant wordt de invoer van het blad. Dat
  is één stap ongedaan maken. De variant zelf blijft staan, en is daarna gelijk aan het
  blad.
- **Als nieuw blad toevoegen:** een kopie van het blad, direct na het blad, met de invoer
  van de variant. De kopie heet *<naam blad> – <naam variant>* en heeft geen varianten.
  In het rapport heeft dat blad een volledige uitwerking.
- **Kopiëren**, **Hernoemen** en **Verwijderen**.

### Optimaliseren

Met deze knop zoekt de app per variant de kleinste waarde van één veld waarmee het blad
nog voldoet. Neem varianten met overspanningen van 4,0 / 4,5 / 5,0 / 5,5 / 6,0 m. Na één
klik heeft elke variant de hoogte die bij zijn overspanning hoort.

De dialoog vraagt:

| | standaard |
|---|---|
| **Zoek:** het veld | het eerste gekozen invoerveld met een eenheid |
| **Van – tot – stap**, in de eenheid van het veld, of bij een keuzelijst *van keuze – tot keuze* in de volgorde van het blad | — |
| **Zodat:** maatgevende UC ≤ grens | 1,00 |
| **Voor:** alle varianten, of één variant | alle varianten |

Hoe hij zoekt:

- Per variant loopt hij de waarden op van klein naar groot. Hij stopt bij de eerste
  waarde die voldoet.
- Een waarde voldoet als:
  - het blad met die waarde `voldoet === true` geeft;
  - het blad niet *niet getoetst* is;
  - en de UC hoogstens de grens is. Geeft het blad geen UC, dan alleen bij een grens van
    1,00 of hoger.
- Elke waarde die hij kiest, is dus echt doorgerekend. Er wordt niets geïnterpoleerd of
  geschat.
- De gevonden waarde komt in de cel. Hij staat blauw met ⚙ tot iemand de cel zelf
  wijzigt. Daarna is het een gewone eigen waarde.
- Voldoet geen enkele waarde in het bereik, dan verandert de cel niet en staat onder de
  tabel: *V3: geen waarde tussen 150 en 400 mm voldoet*. Een *voldoet* dat niet uit het
  blad komt, kan dus nooit verschijnen.
- Het blad zelf (de kolom *Blad*) wordt niet geoptimaliseerd. Wie de gevonden waarde in
  het blad wil, gebruikt *Overnemen in het blad*.
- De laatste zoekopdracht wordt bewaard, zodat de dialoog de volgende keer dezelfde
  waarden voorstelt.
- Met een `@toets`-blok werkt het ook (zie Rekenen), alleen langzamer: per waarde wacht
  hij op FEM Studio.
- Zoeken is af te breken. De waarden die al gevonden zijn, blijven dan staan.

### Op papier

Staat het vinkje *In de afdruk en het rapport* aan, dan komt onder de uitwerking van het
blad een tabel **Varianten**. Dat geldt voor de losse afdruk en voor het blad in het
rapport (hoofdstuk Berekeningen of bijlage A). Het vinkje staat standaard uit.

De tabel is beknopt:

- de kop *Varianten* en de zin *<naam blad> met andere invoer; niet genoemde invoer is
  gelijk aan het blad hierboven*;
- de kolommen *Blad* en de varianten;
- de rijen:
  - de invoervelden waarin minstens één variant van het blad verschilt;
  - de uitkomsten die de gebruiker koos;
  - de maatgevende UC;
  - het oordeel.
- De losse UC's staan alleen op het scherm.

Passen niet alle varianten naast elkaar op A4 staand, dan komt er een tweede tabel
onder. Elke tabel begint met de kolom *Blad*. Elke tabel is één blok voor de
paginering (`docs/bladsoorten.md`).

Op papier wordt niets aan FEM Studio gevraagd. Een variant met een `@toets`-blok zonder
vastgelegd antwoord staat er als *niet getoetst*. Vóór het afdrukken toetst de app eerst
wat nog geen antwoord heeft, ook bij de varianten (zie Rekenen).

## Gegevens

### In het blad

```ts
interface Variant {
  id: string;                          // "var-…", vast
  naam: string;                        // "V1", te wijzigen
  waarden: Record<string, string>;     // alleen de eigen waarden, per veldnaam
  gezocht?: string[];                  // velden gevuld door optimaliseren (blauw ⚙)
}

interface Varianten {
  velden: string[];                    // de gekozen invoervelden, in volgorde
  uitkomsten: string[];                // de gekozen extra uitkomsten (namen uit getallen)
  lijst: Variant[];
  opPapier?: boolean;                  // de tabel in de afdruk en het rapport
  zoek?: Zoekopdracht;                 // de laatste optimalisatie, voor de dialoog
}

interface Zoekopdracht {
  veld: string;
  van: string; tot: string; stap?: string;   // bij een keuzelijst: waarden van keuzes
  grens: number;                              // standaard 1
}

interface Exemplaar { /* … */ varianten?: Varianten }
```

- De invoer van een variant is `{ ...ex.waarden, ...variant.waarden }`. Alleen de velden
  in `velden` tellen mee. Een eigen waarde van een veld dat niet meer in `velden` staat,
  wordt bij het weghalen van dat veld gewist.
- Varianten horen bij het blad, net als de invoer (`docs/projectmodel.md`: *al het andere
  hoort bij het blad waar het staat*). Daarom gaan ze vanzelf mee bij dupliceren, bij
  opslaan, in het herstelbestand, bij ongedaan maken en in een versie van het project.
- Elke wijziging is een stap ongedaan maken. Doortypen in dezelfde cel telt als één stap,
  met een sleutel per cel. Toevoegen, verwijderen, plakken, een reeks en optimaliseren
  zijn elk één stap.
- Wijzigt de rekentekst (zelf of via *Bijwerken*), dan blijft `varianten` staan. Een veld
  in `velden` dat het blad niet meer heeft, valt uit de tabel tot het terugkomt.

### In het bestand

Een nieuw attribuut `ocss::blad::varianten` (bron, geen afleiding), met een schema in
`OCSS_SCHEMAS`:

```
{ velden: [tekst], uitkomsten: [tekst], opPapier?: ja/nee, zoek?: vrij,
  lijst: [{ id, naam, invoer: [{naam, waarde}], gezocht?: [tekst] }] }
```

`invoer` in paren, net als `ocss::blad::invoer`. De uitkomsten van de varianten staan
niet in het bestand: de app rekent ze bij het openen opnieuw uit tekst en invoer, net als
de rest. Een bestand zonder het attribuut is een blad zonder varianten. De formaatversie
verandert niet: een oudere app laat een onbekend attribuut liggen.

## Rekenen

- **Eigen worker.** Een variant rekent in een eigen worker (`rekenen/variantWorker.ts`),
  los van de worker van de werkruimte. Die laatste houdt alleen het laatste verzoek
  vast, en dat past niet bij tien verzoeken tegelijk.
  - De worker rekent zoals `mcp/rekenen.ts` (`rekenDoor`): inlezen met dezelfde includes,
    `scopeMetVerwijzingen`, `evaluate` met de projectgegevens als scope, en dan
    `leesResultaat` en `leesGetallen`.
  - Hij maakt geen html. Hij geeft per variant terug:
    - het resultaat;
    - de getallen;
    - de getoonde tekst van de gekozen uitkomsten, met eenheid;
    - welke invoervelden meedoen;
    - de verzoeken en hashes van `@toets`-blokken;
    - of een fout.
- **Eén variant per bericht.** Zo loopt de stand mee en kan een wachtrij worden
  afgebroken. Gelijke verzoeken hebben dezelfde sleutel en een bewaarde uitkomst:
  wijzigt één cel, dan rekent alleen die variant opnieuw. In de sleutel zitten de tekst,
  de samengevoegde invoer, de scope, de verwezen bladen, het eenhedenstelsel, de
  hoekmodus en de versie van de toetsantwoorden. De wachtrij volgt de volgorde van de
  tabel.
- **Vanzelf.** Doorrekenen gebeurt vanzelf bij elke wijziging, net als bij het blad, met
  een korte wachttijd tijdens het typen. Er is geen knop *Doorrekenen*.
- **Verwijzingen.** `#2.R_paal` in een variant werkt (`verwezenBladen` op de samengevoegde
  invoer). Andersom niet: een ander blad dat naar dit blad verwijst, rekent altijd met
  het blad zelf, nooit met een variant. Varianten veranderen dus niets buiten hun eigen
  tabel. Wie dat wil, gebruikt *Overnemen in het blad*.
- **`@toets`.** Elke variant met een `@toets`-blok kan een eigen verzoek hebben, met een
  eigen hash. Het verloop is dat van de werkruimte:
  - de worker geeft de verzoeken terug;
  - `vraagToetsingen` stuurt elk verzoek één keer;
  - een nieuw antwoord verhoogt de toetsversie, en dan rekent de variant opnieuw;
  - `legToetsingenVast(blad, hashes)` legt de antwoorden bij het blad vast.

  Varianten met dezelfde invoer als het blad delen zo hun antwoord. Bij het opslaan moet
  `gebruikteToetsingen` ook de hashes van de varianten bewaren. Anders vallen hun
  antwoorden weg en staat het rapport zonder FEM Studio op *niet getoetst*. Alleen bij
  een blad met `@toets` en varianten rekent het opslaan daarvoor de varianten zonder
  html door. `werkToetsingenBij` (vóór het afdrukken) neemt de varianten mee als het
  vinkje op papier aan staat.
- **Afdruk.** De afdruk rekent de varianten direct uit, zoals de afdruk elk blad direct
  rekent (`alleenLezen`). Dat gebeurt alleen als het vinkje aan staat.

## Verhouding tot andere onderdelen

- **Versies van een project** (de tak `versies-in-bestand`, nog niet af): een versie is
  een kopie van de hele projectstand, met een regel in de revisietabel. Een variant is
  andere invoer voor één blad binnen die stand. Varianten zitten in het exemplaar en
  gaan dus vanzelf mee in elke versie. Er is geen botsing in model of naam: versies
  heten nergens varianten, en andersom ook niet.
- **Verwijzingen tussen bladen:** zie Rekenen. Ze gaan in één richting en lekken niet.
- **De ontwerpknop van de balklaag:** die probeert profielen voor het blad zelf.
  Optimaliseren doet hetzelfde voor elk blad, maar dan voor varianten. Beide blijven.
- **Projectgegevens** (gevolgklasse en dergelijke) variëren niet per variant. Ze gelden
  voor het hele project.

## Doelen

1. Bij elk rekenblad en elke module varianten openen, de te variëren velden kiezen, tien
   invoersets typen of plakken, en de uitkomsten naast elkaar zien: de belangrijkste
   waarden, de UC's en het oordeel.
2. Per variant de kleinste waarde van één veld vinden waarmee het blad voldoet.
3. De tabel desgewenst in de afdruk en het rapport.
4. Nooit een onterecht *voldoet*: een uitkomst komt altijd uit een echte doorrekening
   van het blad.

## Niet-doelen

- Varianten van projectgegevens, of van meerdere bladen tegelijk.
- Optimaliseren van meer dan één veld tegelijk, of op het lichtste resultaat (een
  kostenmaat). Dat kan later, als er vraag naar is.
- Varianten bij een grafblad (zijn invoer zijn nodes, geen `?`-velden), bij een werkmap
  of bij een notebook.
- Instellingen van een parametrisch beeld die geen invoerveld van het blad zijn: die
  kunnen niet variëren.
- Varianten via de API en MCP. Dat is een logisch vervolg, maar het hoort niet bij deze
  levering.

## Wat de bouwer zelf beslist (vastgelegd als keuze van de bouwer)

- De opmaak van de tabel en de dialogen, binnen de stijl van de app (`themes.css`, de
  `split-tabs`, het lint).
- Het aantal varianten per tabel op papier: zoveel als leesbaar past op A4 staand,
  ongeveer 8 naast de kolom *Blad*.
- De wachttijd tijdens het typen en de grootte van de bewaarde uitkomsten.
- Of de projectboom achter een blad met varianten een klein teken toont.

## Bouwvolgorde

In kleine PR's vanaf `main`, elk met eerst een falende controle in `scripts/check-*.mjs`:

1. **Model, bestand en rekenen:**
   - `Exemplaar.varianten` en de store-acties;
   - `ocss::blad::varianten` in de kern;
   - de zuivere functies in `rekenen/varianten.ts`: samenvoegen, doorrekenen, de
     uitkomst lezen, een reeks maken, plakken en optimaliseren;
   - `gebruikteToetsingen` met de varianten;
   - `scripts/check-varianten.mjs`.
2. **De tab Varianten:** de veldkeuze, de tabel, de knoppen, het menu per variant, de
   worker en optimaliseren.
3. **Op papier:** de tabel onder het blad in de losse afdruk en het rapport, en
   `werkToetsingenBij` met de varianten.

Elke PR zet schermtekst in `en` en `nl` (Engels als bron), een regel in
`docs/CHANGELOG.md` onder *Nog niet uitgebracht*, en werkt `docs/projectmodel.md` en een
nieuwe `docs/varianten.md` bij.
