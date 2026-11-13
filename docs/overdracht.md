# Overdracht — opbouw en werkafspraken

Stand: 21-10-2026, versie 2026.43.0.
Dit document is het startpunt voor wie verder bouwt: hoe het in elkaar zit,
welke afspraken gelden, hoe je controleert en hoe je bouwt.

---

## 1. Opbouw

| Deel | Wat |
|---|---|
| `packages/core` | Rekenkern op mathjs: `parser.ts` (de rekentaal, zie `rekentaal.md`), `evaluator.ts` (rekent, registreert de eigen functies), `renderer.ts` (HTML). Eigen oplossers: `ligger.ts` (ligger op 1–4 steunpunten, overstek, inklemming, gerber; Timoshenko optioneel), `raamwerk.ts` (vlakke raamwerken, α_cr), `doorsnede.ts` (samengestelde doorsneden). Bouwen: `npm --prefix packages/core run build`; desktop en scripts gebruiken `dist`. |
| `packages/desktop/src/templates` | De rekenbladen, elk als rekentekst in een TypeScript-string. Registratie in `index.ts`. |
| `packages/desktop/src/components/calc` | Parametrische beelden (`*Designer.tsx`), koppeling blad↔beeld (`designerKeuze.tsx`, via een herkenningstekst uit de titel), modulecatalogus met status (`projectTree.ts`), uitkomst van een blad (`bladResultaat.ts`), afdruk (`PrintDocument.tsx/.css`, `PrintBlad.tsx`, `paginering.ts`), rekenversie en bijwerken van bladen (`bladVersie.ts`, `BladBijwerken.tsx`). |
| `packages/desktop/src/rapport`, `components/rapport` | Constructierapport (hoofdstukken, uitgangspunten, belastingen met opbouwen, het keuzemenu `gewichten.ts` en de gewichtenbibliotheek `gewichtenBibliotheek.ts` met de gegevens in `library/gewichten/`, bijlage A met de rekenbladen). |
| `components/calc/invoer` | Het invoerscherm van een rekenblad zonder eigen beeld: een formulier uit de velden van het blad (`InvoerPaneel.tsx`, `velden.ts`), dat pas doorstuurt als een veld wordt verlaten of na een pauze (`wachtrij.ts`), en bij een module uit de modulebibliotheek een beeld erboven op het `templateId` van het blad (`invoerScherm.tsx`, `vloerOpPalen.ts`). Zie [bladsoorten.md](bladsoorten.md#het-invoerscherm-van-een-rekenblad). |
| `components/calc/bladSoorten.tsx` | Bladen die niet rekenen (PDF, werkmap, Markdown): hier meldt een soort zich aan voor de afdruk en het rapport. Zie [bladsoorten.md](bladsoorten.md). |
| `packages/desktop/src/graaf`, `components/graaf` | Het grafblad: grafisch programmeren met nodes en verbindingen. `graaf/` rekent zonder React (`model.ts`, `nodes.ts`, `rekenen.ts`, `scene.ts`, `papier.ts`), `components/graaf/` tekent het vlak, het 3D-voorbeeld en de afdruk. Het codeblok gebruikt `packages/core/src/rekenblok.ts`. Controle: `scripts/check-graaf.mjs`. |
| `packages/desktop/src/store` | Project (exemplaren/bladen, projectgegevens, rapport), projectbestand, undo. |
| `packages/desktop/src/components/tekenen` | De tekeneditor: tekeningen in een rekenblad (`@svg`-blok) en de views van een tekenblad. `vel.ts` rekent een view van echte maat naar papier; het vel staat in `store/tekenBlad.ts`. |
| Bladsoorten | Naast rekenbladen ook PDF, spreadsheet en Jupyter. Een Jupyter-blad is een eigen werkmap met notebooks en scripts in een afgeschermde JupyterLab-omgeving: zie [jupyter-blad.md](jupyter-blad.md). |
| `scripts/check-*.mjs` | Controles; `node scripts/check-alles.mjs` draait ze allemaal (nu 26 controles). |

## 2. Afspraken in de bladen

- **Tekst en rekenen**: regels met `'` zijn tekst/HTML, `#if/#else if/#else/#end if`, `#hide/#show`, `@select` voor keuzelijsten, `x = ?` voor invoer. mathjs kan geen tekst met `+` samenvoegen: gebruik `#if`-takken of losse tekstregels.
- **Slotregel**: `Maatgevende UC = … → … voldoet / voldoet niet`. `bladResultaat.leesResultaat` leest daaruit UC en oordeel voor de rapportkop. Kan het blad niet toetsen (onvolledige invoer), dan geen UC en een duidelijke melding; nooit een onterecht 'voldoet'. De slotregel `Eindoordeel: niet getoetst` (Engels `Overall result: not verified`) maakt dat zichtbaar: `Resultaat.nietGetoetst`, in de kop, op de afdruk en in de samenvatting op het voorblad.
- **Uitdraai kaal houden** (afdruk en rapportbijlage): koppen, invoer, formules met ingevulde waarden, tabellen, lijnen, UC's. Geen uitleg op papier.
  - Een prozaregel die helemaal cursief staat (`'<i>…</i>`) is uitleg: de kern geeft hem de klasse `calc-uitleg` en de afdruk laat hem weg. Een toelichting achter een formule langer dan 60 tekens ook.
  - `<i class="ook-afdruk">…</i>` houdt een cursieve regel op papier: gebruik dat voor *niet getoetst*, aannames en *buiten dit blad*.
  - `<span class="alleen-scherm"></span>` in een regel haalt de hele regel van papier; `<span class="alleen-scherm">…</span>` alleen dat stuk; `alleen-afdruk` omgekeerd.
  - `<span class="kolom-2|3|4"></span>` in de toelichting zet korte regels naast elkaar.
- **Rekenwijze**: de projectinstelling `rekenwijze` kiest op gemarkeerde punten tussen de referentie-uitwerking (1) en de norm (0). Een splitspunt heet `X_ref` / `X_nb` met `X = if(rekenwijze ≡ 1; X_ref; X_nb)`; `check-rekenwijze.mjs` bewaakt dat. Gebruik het achtervoegsel `_ref` voor niets anders. Bewuste afwijkingen staan in `docs/afwijkingen-referentie.md`.
- **Invoernamen** mogen niet gelijk zijn aan projectvariabelen (`CC`, `RC`, `DesignLife`, `K_FI`, `onderdeel`, `windgebied`, `terreincategorie`, `rekenwijze`, `locatie`, …); `check-projectvariabelen.mjs` bewaakt dat.
- **Bestaande bladen**: een blad bewaart zijn eigen kopie van de bladtekst. Met *Bladen bijwerken* gaat het naar de nieuwe tekst; bestaande invoer blijft, nieuwe velden krijgen hun beginwaarde. Kies nieuwe velden en beginwaarden zo dat een bijgewerkt oud blad **nooit stil gunstiger** uitkomt (nieuwe keuze standaard op het oude gedrag, of een veilige standaard). Beelden vullen hun `DEFAULTS` ook in bestaande bladen in (seed): een nieuwe standaardwaarde mag een oud blad niet stil veranderen.
- **Omhullende M- en V-lijn** (balklaag, ligger): per lijn twee doorgetrokken vlakken aan weerszijden van de as — het grootste veldmoment en het grootste steunmoment, +V en −V. Geen maatgevende waarde op een stippellijn. Een vrije puntlast staat per doorsnede op de ongunstigste plaats (`vrijePuntlast` in `balklaagLijnen.ts`, in het blad `eMx`/`eMn`/`eVx`/`eVn`), niet vast in het midden van een veld. De toets is nooit kleiner dan de lijn: `M_y,Ed` en `V_z,Ed` nemen ten minste de grootste waarde van de omhullende. `check-balklaag-omhullende.mjs` bewaakt dit tegen een onafhankelijke stijfheidsmatrix.
- **Profielen**: `components/calc/profielen.ts` is de bron; een blad krijgt een geplakte matrix (`node scripts/check-profielen.mjs --matrix …`), die `check-profielen` gelijk houdt met de bron.
- **Getallen voor een beeld**: een beeld leest de uitkomsten van zijn blad onafgerond (`waarde` op de knoop, via `leesGetallen`), niet de op vier cijfers afgeronde tekst; anders komt een nagerekende lijn een cijfer naast de waarde in de kop uit.
- **Taal van de uitvoer**: de uitwerking, het afdrukvoorbeeld en de PDF van losse bladen volgen de taal van de app; in het rapport volgt alles `rapport.taal` ([projectmodel.md](projectmodel.md)). De tab Code toont de rekentekst in de taal van de app, ook verborgen regels en commentaar (`code` in de vertaaltabel), maar in het project blijft de Nederlandse tekst de bron. Zo blijven de rekenversie, *Bladen bijwerken*, de invoer en de beelden werken, ook voor bestaande bladen. Een bewerking gaat regel voor regel terug in de bron (`bronNaBewerking` in `uitvoerTaal.ts`): wat niet is aangeraakt blijft de bron, wat er getypt is, is eigen tekst. Wat in `source` staat, verander je dus niet bij het invoegen: dat zou de rekenversie laten verspringen, en bij een oudere moduleversie is een vertaalde tekst niet meer van een eigen aanpassing te onderscheiden. `check-code-taal.mjs` bewaakt dit. De rekentekst blijft Nederlands en de bron: de rekenversie, *Bladen bijwerken* en de invoersleutels kennen alleen die tekst, en de API geeft die tekst. Bij het doorrekenen voor de weergave vervangt een tabel per module (`templates/<module>.en.ts`, geregistreerd in `templates/vertalingen.ts`, mechanisme in `components/calc/uitvoerTaal.ts`) de teksten die er exact mee overeenkomen; `namen` geeft de weergavenamen (`b_sparing` → `b_opening`). Nieuwe tekst in een blad hoort ook in de tabel; `check-uitvoer-taal.mjs` somt op wat ontbreekt. Geen rechte apostrof in een vertaling.
- **Tekening vooraan**: een tekening met de klasse `vooraan` of een regel met `<span class="vooraan"></span>` rekent op zijn eigen plek mee en komt bij het opmaken direct onder de titel. Zo kan een schema uitkomsten gebruiken die pas verderop in het blad staan, zonder dat er iets aan het rekenen verandert.
- **Canvas-blad**: formules als losse eenheden vrij op een vel (`store/canvasBlad.ts`, `components/calc/CanvasBladWeergave.tsx`). De eenheden staan in `source` als gewone rekentekst met per eenheid een merkteken dat voor de rekentaal commentaar is (`//@eenheid id=e1 x=10 y=15`), in de volgorde van doorrekenen: op positie, van boven naar beneden en bij gelijke hoogte van links naar rechts. Zo werken projectbestand, IFCX, API en UC zoals bij elk rekenblad; het is dus geen los blad (`isLosBlad`). Elke eenheid wordt apart ingelezen en alles gaat samen in één `evaluate` (`canvasRekenen.ts`): de scope loopt door en een fout, ook een blok dat niet wordt gesloten, blijft bij zijn eenheid. `#def` en `#include` gelden daardoor alleen binnen hun eigen eenheid. Op papier (`CanvasVellen` in `PrintBlad.tsx`) blijven de posities behouden; wat over de vouw zou vallen begint het volgende vel en wat eronder staat schuift evenveel mee (`legOpVellen`). `check-canvas.mjs` bewaakt dit.
- **Tekens en eenheden in de lijnen**: elke M- en V-lijn heeft + en − in de vlakken, met het teken van de waarde op die plek en alleen waar het vlak hoog genoeg is, en elke waarde staat met zijn eenheid. `check-balklaag-wisselbalk.mjs` en `check-balklaag-omhullende.mjs` bewaken dat.

## 3. Normen

- Eurocodes met de Nederlandse nationale bijlagen (NEN-EN 1990 t/m 1997 + NB, NEN 9997-1). Waar de norm-stand rekent, volgt hij de NB; bijvoorbeeld k_cr = 1,0 voor prismatische houten liggers (NB bij 6.1.7(2)).
- **Normtekst nooit in de repo**: alleen artikel-, formule- en tabelnummers. Controleren gebeurt tegen lokale normteksten van de gebruiker, die niet in de repo staan.
- Editie en nationale bijlage moeten per project worden vastgesteld.
- Het tabblad *Normbestanden* bewaart eigen PDF's met normnummer en editie in de lokale applicatieopslag (IndexedDB). Deze bestanden gaan niet mee in een projectbestand of de repository. De tool toont de bron voor handmatige controle en leidt er geen rekenwaarden of conformiteit uit af.
- Waar een waarde niet uit de beschikbare tekst te onderbouwen was, is die **invoer** met een korte uitleg op het scherm, of staat de toets als *niet getoetst* op het blad.

## 4. Controleren

```
node scripts/check-alles.mjs
cd packages/desktop && npx tsc --noEmit -p .
```

- CI (`ci.yml`) draait `npm run check` bij elke pull request en elke push naar `main`, op Linux en op Windows met CRLF in de werkkopie; `scripts/werkkopie-crlf.mjs` bewijst dat laatste met een byte-telling.
- Een module heeft een eigen check met handberekeningen (als commentaar bij de verwachting) en vaak een onafhankelijke uitwerking in het script zelf. Verwachtingen alleen aanpassen met een handberekening die aantoont dat de nieuwe waarde juist is.
- `check-renders.mjs` rekent elk blad met elke keuze uit de keuzelijsten; `check-designerkeuze.mjs` controleert blad↔beeld; `check-blad-bijwerken.mjs` het bijwerken.
- `check-rapport-talen.mjs` tekent de echte afdruk van het rapport in jsdom (`scripts/lib/rapport-html.mjs`): een oud rapport moet tot op de letter gelijk blijven aan `scripts/fixtures/rapport-oud-*.html`, een Engels rapport mag geen Nederlands bevatten. Wijzig je de opmaak bewust, dan maakt `--bewaar` de gouden bestanden opnieuw. `check-schermtekst.mjs` bewaakt dat wat op het scherm komt uit de vertaalbestanden komt, en dat elke taal dezelfde sleutels heeft.
- `check-rapport-pdf.mjs` maakt een echte PDF van een gemengd project en rekent de paginanummers en de inhoudsopgave daarin na; hij start zijn eigen dev-server op een vrije poort en slaat zich over zonder Chrome of Edge. De knop Rapport loopt daar met een nagebootste Rust-schil.
- De knop Rapport in de gebouwde app (WebView2 `PrintToPdf`) kan geen controle in check-alles zijn. Na een wijziging aan de afdrukweg of een nieuwe Tauri-versie met de hand: `node scripts/proef-rapport-app.mjs <app.exe> <uit.pdf>` en daarna `node scripts/check-rapport-pdf.mjs --app-pdf <uit.pdf> --schaal <schermschaal>`. De schermschaal meldt het eerste script: de verdeling over de vellen meet op het scherm, dus op een andere schaal kan een regel naar een ander vel schuiven. Hoe je de app bouwt, staat boven in het script.
- WebRTC in een `@js`-blok gaat buiten de CSP om. Een opstartscript haalt het uit elk document (`src-tauri/src/geen_webrtc.js`), en zonder dat script start een blok niet. Meten in de echte build, met een luisterpost: `node scripts/proef-js-webrtc.mjs <exe> <map>`; zie de kop van het script. Na een sprong in de versie van WebView2 of Tauri is dit de proef die je opnieuw draait.
- De README bestaat in twee talen met dezelfde opbouw en beelden: wijzig `README.md` en `README.nl.md` samen. Ze volgen de README-standaard van OpenAEC Blueprint; `check-readme.mjs` controleert dat, en `scripts/maak-readme-beelden.mjs` maakt de beelden opnieuw uit de echte app (zie [ontwikkelen.md](ontwikkelen.md)).
- Afdruk als PDF (dev-server `npm run dev --workspace=@openaec/calcsheet-studio`, poort 3021): `node scripts/rapport-pdf.mjs <project.json> <uit.pdf>`. Voor een proefproject met alleen `templateId`'s: `--beginwaarden`, anders rekenen bladen met een beeld met lege invoer.
- Prestaties van de rekenkern en de volgende matrixproef: [rekenkern-prestaties.md](rekenkern-prestaties.md). Herhaal de warme meting met `node scripts/bench-rekenkern.mjs` na het bouwen van de core.
- Werkwijze die fouten vond die de eigen checks misten: na het bouwen van een module rekent een tweede, onafhankelijke controle minstens twee gevallen met de hand na en zoekt gericht naar een onterecht 'voldoet'.

## 5. Bouwen en uitbrengen

- Versie (jaar.week.volgnummer): zetten met `node scripts/versie.mjs zet JJJJ.W.N`, niet met de hand. `check-versie.mjs` zakt als de velden uit elkaar lopen.
- Wijzigingen: zet elke wijziging die de gebruiker merkt in [CHANGELOG.md](CHANGELOG.md) onder "Nog niet uitgebracht". Het zetten van een versie maakt daar de sectie van dat nummer van; de release-tekst neemt die over, en zonder wijzigingen stopt de release. De website telt en toont de opsommingen uit de release-tekst. `check-wijzigingen.mjs` bewaakt dit.
- Uitbrengen en ondertekenen: zie [ondertekening.md](ondertekening.md). Een release start met *Run workflow* op `release.yml`; die kiest het nummer, ondertekent en publiceert pas als alle controles groen zijn.
- Installer: `npm run tauri build` in `packages/desktop`; lokaal zonder ondertekening. WebView2 wordt meegebundeld (`webviewInstallMode` embedBootstrapper, `WebView2Loader.dll` in `bundle.resources`). Daarvoor bouwt `beforeBuildCommand` de Jupyter-omgeving als die er nog niet is (`scripts/bouw-jupyter-omgeving.mjs --als-nodig`); dat vraagt eenmalig internet en Python. Een `tauri dev` zonder pakbestand start gewoon, en een Jupyter-blad meldt dan dat de omgeving ontbreekt.
- Draait de gebouwde app nog, dan houdt die `target/release/WebView2Loader.dll` vast en faalt de build: bouw dan met een eigen `CARGO_TARGET_DIR` (bijvoorbeeld `src-tauri/target-installer`, niet in git).

## 6. Modules

Status in de catalogus: *gereed* (gecalibreerd op referentiebladen), *controleren* (toetsing compleet en nagerekend, nog niet tegen referentiebladen gelegd), *hoeveelhedenraming* (nagerekende hoeveelheden zonder constructieve sterktetoets).

| Groep | Modules |
|---|---|
| Algemeen | Ligger (hout of staal: twee tot vier steunpunten of een uitkraging, overstekken, inklemming, gerberscharnieren; tot zes lasten; omhullende, kip, doorbuiging); Spanningen in een doorsnede (mechanica, geen normtoets: I of H, rechthoek, rond, buis, koker, T, U; spanningsveld, neutrale lijn, σ en τ langs de assen, vergelijkingsspanning) |
| Hout | Balklaag (houten vloerbalken: enkelvoudige ligger, overstek, twee velden, raveelbalk; vijf belastinggevallen, omhullende M- en V-lijn, trillingen, oplegdruk, kip) |
| Beton | Tweepaalspoer (staafwerkmodel; knopen, trekband, splijtkrachten, verankering, scheurwijdte, detaillering; tekening met de gekozen staven) |
| Bibliotheek | Rekentaal-demo |

Een **spreadsheet-blad** is een werkmap (XLSX) als blad in het project, op de
editor `@betteroffice/xlsx-react`. Die draait hier met `legacySyncApi`: de
asynchrone API kent rijen invoegen, kolombreedte, vastzetten en verplaatsen niet,
en alleen `api.handle.applyOps` maakt van cellen met opmaak één stap ongedaan
maken. Het pakket laat deze weg in 0.6.0 vervallen, dus de versie staat vast op
0.5.1; wie overstapt, moet eerst nagaan of de nieuwe API deze bewerkingen heeft.
`components/calc/spreadsheetLogica.ts` is puur en wordt nagerekend door
`check-spreadsheet.mjs`; `spreadsheetOpdrachten.ts` en `spreadsheetKlembord.ts`
voeren uit op de rekenkern, `spreadsheetAanwijzen.ts` en `spreadsheetLaag.tsx`
horen bij het raster, en `components/ribbon/SpreadsheetTab.tsx` is de lint-tab die
verschijnt zolang een spreadsheet-blad in beeld is. `api.version()` en andere
gewone API-aanroepen sluiten een open cel: de bewaartimer gebruikt daarom
`api.handle` rechtstreeks. Hoe een werkmap over de vellen papier valt, staat in
`spreadsheetVellen.ts`; de afdruk en de papierrand in het raster rekenen daarmee, en
`check-spreadsheet.mjs` legt de uitkomst naast de getekende afbeeldingen. Het raster
volgt de losse uitdraai (`MATEN.bladen`); in het rapport is de bladspiegel anders.

De toetsing van de balklaag staat in [balklaag-toetsing.md](balklaag-toetsing.md),
de bewuste splitspunten tussen referentie-uitwerking en norm in
[afwijkingen-referentie.md](afwijkingen-referentie.md). Toepassingsgebied en toetsset
van de tweepaalspoer staan in [tweepaalspoer-toetsing.md](tweepaalspoer-toetsing.md), wat het blad over
spanningen in een doorsnede rekent in [doorsnede-spanningen.md](doorsnede-spanningen.md).

Naast de modules zijn er bladen zonder rekentekst: een PDF, een spreadsheet en een
tekenblad (*Module toevoegen → Lege tekening*). Een tekenblad is een vel A4, A3 of A2 met
views, elk met een eigen plek, schaal en titel. In een view is één eenheid één mm in het
echt; lijndikte, tekst en de maat van een symbool staan in px op papier en veranderen
niet met de schaal. Op papier staat het vel op zijn eigen formaat, ook in het rapport.
Controle: `scripts/check-tekenblad.mjs`.

Een nieuwe module bestaat uit een rekenblad in `packages/desktop/src/templates`
(geregistreerd in `index.ts`), een regel in de catalogus (`projectTree.ts`), zo
nodig een parametrisch beeld (`*Designer.tsx`, gekoppeld in
`designerKeuze.tsx`), een catalogusbeeld en een eigen `scripts/check-<module>.mjs`.
Zonder eigen beeld krijgt een module vanzelf het invoerscherm uit haar eigen velden
(`components/calc/invoer`); dat geldt ook voor een module uit de modulebibliotheek.

Een parametrisch beeld toont maten en lasten in het eenhedenstelsel van het project en
rekent zelf in de eenheden van het blad. Geef daarvoor in `designerKit.tsx` `Dim` een
`eenheid`; `Force` rekent `unit` vanzelf om. Een getalveld is `StelselGetal`. Een vaste
tekst met een eenheid gaat via `ctx.eenheden.tekst()`, en een label met "(mm)" via
`ctx.eenheden.label()` (`beeldEenheden.ts`). Zonder stelsel ziet het beeld er dan uit
zoals altijd.

## 7. Open punten

Zie [backlog.md](backlog.md): IFC-export en rapportengine.
