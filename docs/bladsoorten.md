# Bladsoorten in de afdruk

Een blad dat niet rekent (een PDF, een werkmap, een Markdown-tekst) heeft geen
rekentekst en geen invoer, maar komt wel in de uitdraai en het rapport. Zo'n soort
meldt zich op één plek aan: `SOORTEN` in
[`components/calc/bladSoorten.tsx`](../packages/desktop/src/components/calc/bladSoorten.tsx).
De losse uitdraai (`PrintBlad`), het rapport (`Knopen`, `RapportAfdruk`), het
doorrekenen (`bladDoorrekenen`), het paneel Rapport en het afdrukvoorbeeld vragen
het daar na. Een blad zonder aanmelding is een rekenblad; alleen Jupyter wijkt nog af
(zie onder).

## Een soort aanmelden

```tsx
{
  templateId: TEKEN_BLAD,
  soortTekst: (taal) => papier(taal)("tekenBlad.soort"),
  Afdruk: TekenPapier,
  useOnderkop: (ex) => [ex.tekening?.bestandsnaam],
}
```

| veld | wat | zonder |
|---|---|---|
| `templateId` | de `templateId` van de bladen | verplicht |
| `soortTekst` | de naam op papier, onder de kop en in de kolom grondslag, in de taal `taal` van de uitdraai | verplicht |
| `Afdruk` | het afdrukonderdeel: de inhoud onder de kop, binnen de bladspiegel van `maten` | verplicht |
| `useOnderkop` | wat er achter de soort onder de kop staat, zoals de bestandsnaam | alleen de soort |
| `plek` | waar de uitwerking staat zolang de gebruiker niets koos: `hoofdstuk` of `bijlage` | in de bijlage |
| `inhoudsKoppen` | regels onder de naam van het blad in de inhoudsopgave | alleen de naam |
| `RapportKeuze` | een eigen keuze op de kaart van het blad in het paneel Rapport | geen |
| `HeelBlad` | het hele blad zelf, zonder kop erboven: voor een blad op eigen papierformaat met zijn naam op het vel, zoals een tekenblad | de kop met `Afdruk` eronder |

De kop met het nummer tekent `LosBladAfdruk`: losse bladen 1, 2, …, bijlage A
A.1, A.2, …. In hoofdstuk Berekeningen staat het afdrukonderdeel onder de
paragraafkop.

De keuze *Uitwerking in dit hoofdstuk* van de gebruiker wint van `plek`
(`staatInHoofdstuk` in `rapport/opzet.ts`).

## Wat een afdrukonderdeel moet doen

Het afdrukvoorbeeld meet de blokken en verdeelt ze over vellen
([`paginering.ts`](../packages/desktop/src/components/calc/paginering.ts)); een
kopie van die vellen gaat naar de printer. Daarvoor geldt:

- **Elk blok is een los kind.** Een blok gaat als geheel op een vel. Wat hoger is dan
  een vel, valt eraf: maak er meer blokken van. `markdownVoorPapier` doet dat per
  lijstregel, tabelrij en regel code. De wikkels `.rpa-vlak`, `.ifc-calc` en
  `.md-citaat` worden afgepeld en op het vel opnieuw gebouwd, dus marges en padding op
  een wikkel tellen elke keer mee.
- **`print-nieuw-vel`** begint een vers vel, **`print-vel-af`** sluit het af. Zo krijgt
  elke pagina van een PDF een eigen vel. De kop van het blad neemt 20 mm van het
  eerste vel.
- **`data-afdruk-laadt`** op een element houdt het printen tegen tot het weg is. Wat
  daarna in het afdrukonderdeel verandert, ziet het afdrukvoorbeeld zelf: het zet dat
  blok opnieuw op zijn vel, of verdeelt opnieuw als de hoogte dat vraagt.
- **`data-inhoud="anker"`** op een kop maakt een regel in de inhoudsopgave mogelijk:
  `inhoudsKoppen` geeft hetzelfde anker terug. De kop van het blad zelf regelt
  `LosBladAfdruk`.

## Paginanummers en inhoudsopgave

Daar hoeft een soort niets voor te doen. Elk vel krijgt zijn nummer bij het bouwen,
hoe de inhoud ook is getekend: PDF-pagina's en vellen van een werkmap tellen dus
gewoon mee. De nummers in de inhoudsopgave komen uit dezelfde verdeling
(`paginaVanAnkers`) en worden ingevuld in cellen die er al staan, zodat de
inhoudsopgave zelf er niet door verschuift.

- **Inhoudsopgave voorin:** hoofdstukken en paragrafen, en met
  `rapport.opmaak.bladenInInhoud` ook elk blad, onder hoofdstuk Berekeningen of onder
  bijlage A, met eventueel zijn koppen. Een rapport van vóór versie 4 van de
  rapportopbouw opent met die keuze uit: de inhoudsopgave blijft even lang en de vellen
  erna verschuiven niet.
- **Inhoud in het zijpaneel:** alle hoofdstukken, paragrafen, bladen en bijlagen met hun nummer,
  die elke wijziging meteen volgen (`inhoudVoorPaneel`). De paginanummers komen uit het laatste
  afdrukvoorbeeld van het rapport: verdelen over vellen is te zwaar om bij elke toets te doen.
- **Inhoudsopgave van hoofdstuk Berekeningen:** elke paragraaf met zijn pagina.
- **Een eigen bijlage** (B, C, …) heeft geen nummer: het document zelf zit niet in het
  rapport.

Een pagina die groter is dan A4 of liggend staat (een A1-tekening, een liggend A4)
komt passend verkleind op een A4 staand vel, bovenaan en in het midden, en draagt het
nummer op de gewone plek rechtsonder. Het vel draait niet mee.

Een tekenblad gaat anders: dat kiest zelf A4, A3 of A2 en krijgt een vel op dat formaat
(`data-vel-pagina`, `data-vel-breedte`, `data-vel-hoogte`). In het rapport loopt de
nummering erover door, en de naam in zijn titelhoek krijgt het nummer van het blad.

## Wat er verder bij een nieuwe soort hoort

Buiten de afdruk heeft een soort nog deze plekken, zoals bij Markdown:

- `store/<soort>.ts`: het veld op het blad, `isXBlad`, en lezen uit een bestand. Puur,
  want het projectbestand en de controlescripts laden het in Node.
- `isLosBlad` in `store/spreadsheetBlad.ts`, en `normaliseerExemplaar` in
  `store/projectBestand.ts`.
- `store/projectStore.ts` (toevoegen en wijzigen), `store/projectIfcx.ts` en
  `packages/core/src/ifcx/` (`ATTR`, schema en `soort` in `namespace.ts`, schrijven en
  lezen in `document.ts`, de bijlage in `step.ts`).
- De werkruimte in `App.tsx`, de keuze in `BladToevoegen.tsx` (de ene knop in het paneel), de knop in `CalcTab.tsx`, en
  de teksten in `werkruimte.json` en `rapport.json` (Nederlands en Engels). Een onderdeel op papier
  haalt zijn teksten met `usePapier()` of `useTranslation` (`components/calc/afdrukTaal.tsx`), niet met
  de globale i18next: een losse uitdraai volgt de taal van de app, het rapport zijn eigen taal.
- `bladSoort` in `mcp/tools/hulp.ts`.
- Een eigen `scripts/check-<soort>.mjs`. `scripts/check-rapport-pdf.mjs` rekent de
  nummers na op een gemengd project (`scripts/lib/gemengd-project.mjs`): zet de soort
  daar ook in.

## Markdown

De tekst staat in een eigen veld (`md` op het blad, `ocss::blad::markdown` in het
bestand), niet in `source`: die is van de rekentekst. De html loopt door dezelfde
opschoning als de uitwerking van een rekenblad, en een afbeelding van buiten laadt pas
na bevestiging per domein (`iframeBlok.ts`); op papier staat zonder bevestiging de naam
van de host.

Bij het inlezen in de app gaan afbeeldingen die naast het bestand staan mee het project
in, als data-URL per adres (`beelden`), zodat de tekst zelf niet verandert. Alleen een
pad naast de tekst wordt gelezen, geen stam of serverpad, en tot 10 MB per stuk. Wat er
niet bij zit, staat op het blad als een melding met het adres. Wegschrijven schrijft de
tekst ongewijzigd; de afbeeldingen blijven in het project.

De koppen uit de tekst komen standaard in de inhoudsopgave, de bovenste twee niveaus die
erin voorkomen. Een eerste kop gelijk aan de naam van het blad vervalt, op papier en in
de inhoudsopgave. Uitzetten kan per blad, op zijn kaart in het paneel Rapport.

## PDF

Een PDF-blad toont de pagina's onder elkaar, met een eigen tab PDF op het lint.

- **Zoomen:** met de knoppen, met Ctrl en scrollen (de plek onder de muis blijft staan) of met
  Ctrl+plus, Ctrl+min en Ctrl+0. Ver ingezoomd tekent `tekenScherp` de pagina's die in beeld zijn
  opnieuw, tot 24 miljoen pixels per pagina; daarboven blijft de gewone afbeelding staan.
- **Schuiven:** slepen op de pagina met het gereedschap Kiezen, of de middelste muisknop, of de
  spatiebalk ingedrukt houden.
- **Aantekenen:** pen, markeren, tekst, pijl, kader en wijzigingswolk, in vijf kleuren en drie
  diktes. Met Kiezen verplaats je een aantekening, Delete verwijdert hem, dubbelklikken op een
  tekst bewerkt hem. Elke wijziging is één stap ongedaan maken.

De aantekeningen staan in `pdf.aantekeningen`, in punten van de pagina, dus de zoom raakt ze niet.
De PDF zelf verandert niet: een aantekening is geen PDF-annotatie, en wie het oorspronkelijke
bestand exporteert, krijgt hem niet mee. Op papier en in het rapport staan ze er wel, tenzij de
knop Op papier uitstaat (`pdf.opPapier: false`). Vervangt iemand de PDF, dan vervallen ze na een
vraag: ze horen bij de pagina's van het oude bestand.

Een projectbestand kan van iemand anders komen en de laag gaat als markup de pagina in. Daarom
laat `leesAantekeningen` (store/pdfAantekeningen.ts) alleen getallen, een kleurcode en een schoon
id door, en is tekst altijd ontsnapt. `scripts/check-pdf-viewer.mjs` bewaakt dat.

## Huisstijl

*Instellingen → Bureau en huisstijl* geldt voor alles wat op papier komt: het logo, de
voetafbeelding, de kleuren en het lettertype (`rapport/model.ts`). `huisstijlVariabelen` zet
ze als CSS-variabelen op de wortel van een uitdraai; een blad gebruikt alleen die variabelen
(`--pr-*` op een los blad, `--rpa-*` in het rapport). Zolang de huisstijl de standaard is,
blijven losse bladen in hun eigen opmaak. Een rapport legt een kopie van het profiel vast; die
geldt dan ook voor de losse bladen uit dat project.

Afdrukken gaat voor elke soort uitdraai via de vellen van het afdrukvoorbeeld (`drukvellen.ts`):
wat in het voorbeeld staat, komt op papier.

## Canvas, graaf, tekenblad, Jupyter en Marimo

- **Canvas** is geen losse soort maar een rekenblad: de rekentekst staat gewoon in
  `source`, met per eenheid een regel `//@eenheid id=e1 x=10 y=15`. De kern rekent van
  boven naar beneden, en `CanvasVellen` zet de eenheden op papier. Ctrl en scrollen zoomt
  het vel rond het punt onder de muis; dat verandert alleen de weergave, niet de maten.
- **Graaf** staat in `graaf` op het blad (`ocss::blad::graaf`) en is aangemeld met
  `GraafVellen`. `graaf/grafBestand.ts` leest een grafbestand (`.dyn`, JSON) in: elke node waarvan
  hier een gelijke bestaat wordt een gewone node, de rest blijft staan als `ingelezen` met zijn
  naam en poorten, en rekent niet. Er draait niets uit het bestand; een codeblok wordt rekentaal.
- **Tekenblad** staat in `tekenvel` (`ocss::blad::tekenvel`) en is aangemeld met
  `HeelBlad`, omdat de kop in de titelhoek van het vel staat.
- **Jupyter** staat in `jupyter` (`ocss::blad::jupyter`) en is de uitzondering: dat blad
  heeft nog een eigen tak in `PrintBlad.tsx` en `bladDoorrekenen.ts`, en staat niet in
  `SOORTEN`. Zie [`jupyter-blad.md`](jupyter-blad.md).
- **Marimo** staat in `marimo` op het blad (`ocss::blad::marimo`), met de code als tekst en per cel de
  laatste uitvoer, en is aangemeld met `MarimoPapier`. Een schuif staat op papier als zijn waarde. De
  Python-omgeving is die van de Jupyter-bladen: zie `docs/jupyter-blad.md`.

## Het invoerscherm van een rekenblad

Een rekenblad heeft naast de uitwerking een scherm om in te vullen (de tabs *Code + Visueel* en
*Visueel + Uitwerking*). Welk scherm dat is, kiest de werkruimte in deze volgorde:

1. **Een eigen parametrisch beeld** (`components/calc/designerKeuze.tsx`): de ingebouwde modules,
   herkend aan een tekst in de kop van het blad. Dat beeld staat ook op papier.
2. **Een beeld bij een module uit de modulebibliotheek** (`components/calc/invoer/invoerScherm.tsx`):
   het formulier met een tekening erboven die de invoer volgt. Het hangt aan het `templateId` van
   het blad. Dat is het id van de module (`store/moduleBibliotheek.ts`), en het blijft bij het
   blad, ook in een projectbestand op een computer waar de module niet is geïnstalleerd. Nu alleen
   `vloer-op-palen`: de plattegrond van het paalraster en een doorsnede bij een paal.
3. **Het formulier uit de velden van het blad** (`components/calc/invoer/InvoerPaneel.tsx`): elk
   ander rekenblad met een `?`-veld of een keuzelijst. Een module hoeft er niets voor te doen.

Een canvas houdt zijn eigen scherm, en een blad zonder invoer heeft alleen *Code + Uitwerking*.

Een module opent met haar invoerscherm. Een blad waar je de rekentekst schrijft of leest, opent
met de code en heeft het invoerscherm als tab erbij: een eigen rekenblad (ook een voorbeeld uit
de bibliotheek), een los geopend bestand en de demo van de rekentaal (`opentMetInvoer` in
`invoer/velden.ts`). Krijgt zo'n blad tijdens het typen zijn eerste invoerveld, dan blijft de
editor staan.

Het formulier:

- **De velden** komen uit het doorgerekende blad (`leesInvoer` in `invoer/velden.ts`, in de
  rekenworker), niet uit de tekst. Zo staat er precies wat de uitwerking toont: in de volgorde van
  het blad, onder zijn koppen, met de toelichting achter het veld en de eenheid, in de taal van de
  uitvoer. Een veld in een tak van `#if` die niet gekozen is, of achter `#hide`, staat er niet.
- **Schrijven** gaat alleen met `zetWaarde`, op de naam uit de rekentekst: dezelfde invoer als het
  veld in de uitwerking. De rekentekst en de rekenversie veranderen niet, en ongedaan maken en de
  tab Varianten zien een gewone wijziging van de invoer. Er wordt niets vooraf ingevuld (geen
  `seedWaarden`): het blad rekent met zijn eigen standaardwaarden.
- **Rustig rekenen** (`invoer/wachtrij.ts`): wat je typt gaat naar het blad als je het veld
  verlaat, op Enter, of na een pauze van 0,6 s. Bij een blad met een `@fem`- of `@toets`-blok is
  dat 1,5 s, omdat elke tussenstand daar een berekening van Open FEM Studio kost. Een keuze uit een
  lijst gaat meteen. De kop meldt of er invoer wacht, of het blad rekent en of FEM Studio rekent;
  anders staat er de uitkomst van het blad.
- **Op papier** staat het formulier niet: de afdruk en de uitwerking van een variant vragen alleen
  `designerKeuze`.

Een beeld boven het formulier krijgt de rekentekst, een functie die zegt wat er voor een veld is
ingevuld (wat nog wacht gaat voor wat is opgeslagen) en een functie die een waarde meteen zet
(`BeeldProps`). Het tekent dus zonder op de doorrekening te wachten. De standaardwaarden en de
eenheden leest het uit de tekst van het blad (`standaardInvoer`), niet uit eigen constanten:
wijzigt de module een standaardwaarde, dan volgt het beeld. Voor een nieuw beeld: het model en de
tekening als zuivere functies (zoals `invoer/vloerOpPalen.ts`), het onderdeel met de klikbare
maten van `designerKit.tsx`, een regel in `schermSoort` (`velden.ts`) en in `invoerScherm.tsx`,
en de controle erbij. De opmaak gebruikt alleen de tokens van het ontwerp (`--oa-*`).

## Controleren

```
node scripts/check-invoerpaneel.mjs   # het invoerscherm: de velden, typen, rustig rekenen, het scherm in jsdom
node scripts/check-markdown.mjs       # opslaan en heropenen, html, opschoning, op papier
node scripts/check-paginering.mjs     # de verdeling en de nummers bij de ankers
node scripts/check-rapport-pdf.mjs    # een echte PDF van een gemengd project, alle soorten
```

`check-rapport-pdf` start zijn eigen dev-server op een vrije poort en een headless
browser, leest de PDF met pdf.js en rekent na: evenveel pagina's als vellen, op elke
pagina zijn eigen nummer, en bij elke regel van de inhoudsopgave de kop op die pagina
en op geen eerdere. Met `--bewaar <map>` blijven de PDF en het project staan om te
bekijken.

`check-invoerpaneel` loopt met `--blad <module.cpd>` ook een blad van buiten de repository na,
zoals een module uit de modulebibliotheek: de velden per kop, en of het blad de namen heeft waar
het beeld van de vloer op palen aan bindt.
