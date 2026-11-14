[English](README.md) · **Nederlands** · [繁體中文](README.zh-TW.md)

<div align="center">

# Open CalcSheet Studio

**Constructieve berekeningen die je kunt nalezen: elke uitkomst toont zijn formule, getallen en eenheden, en al je bladen komen in één rapport.**

[![Release](https://img.shields.io/github/v/release/OpenAEC-Foundation/Open-CalcSheet-Studio?include_prereleases&label=release&color=D97706)](https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio/releases)
[![CI](https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio/actions/workflows/ci.yml/badge.svg)](https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio/actions/workflows/ci.yml)
[![Licentie](https://img.shields.io/badge/licentie-LGPL--3.0-blue)](#licentie)
[![Talen](https://img.shields.io/badge/talen-Engels%20%C2%B7%20Nederlands-informational)](#schermafbeeldingen)

### [Downloaden](https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio/releases)

![Een houten balklaag: invoerscherm met tekeningen en meebewegende unity check naast het uitgewerkte blad, met het project en de bibliotheek in het paneel](docs/images/readme/hero.png)

</div>

Open CalcSheet Studio is een desktop-app voor constructeurs. Je schrijft een berekening als tekst, regel voor regel, en de app werkt die uit met eenheden, in leesbare formules. Naast die rekenbladen kan een project spreadsheets, formules op een canvas, nodegrafen, tekeningen, Jupyter-notebooks, Markdown en PDF-bestanden bevatten. Samen worden ze één rapport.

De app draait op Windows, macOS en Linux en is volop in ontwikkeling: zie [Huidige beperkingen](#huidige-beperkingen).

## Proberen

[Download de app](#downloaden-1), open hem en kies **Module** en dan **Timber joist floor**. Verander de doorsnede of de overspanning en zie de unity check meebewegen. Open daarna **Print preview** om het blad op papier te zien.

## Downloaden

Download de [nieuwste release](https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio/releases/latest). De [nightly build](https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio/releases/tag/nightly) wordt elke dag gemaakt vanaf `main`.

| Platform | Installatiebestand |
|----------|-----------|
| **Windows** | `.exe`-installer (x64), voor alle gebruikers of voor één gebruiker |
| **macOS** | `.dmg` (universeel: Apple silicon en Intel) |
| **Linux** | `.deb`, `.AppImage` |

De app heeft geen ingebouwde updater: installeer een nieuwe versie over de oude heen. Je projecten zijn gewone bestanden en blijven staan waar ze staan.

De releaseworkflow weigert bestanden te publiceren die niet ondertekend zijn: Windows met Authenticode, macOS met een Developer ID en genotariseerd door Apple, Linux met een losse OpenPGP-handtekening (`.asc`). `SHA256SUMS.txt` noemt elk bestand. Zie [hoe je een download controleert](docs/ondertekening.md).

## Waarom gebruiken?

- **Gratis en open.** LGPL-3.0. Geen licentiekosten, geen account.
- **Je kunt elke stap nalopen.** Een uitkomst toont naam, formule, ingevulde waarden en resultaat, met eenheden.
- **Metrisch of Amerikaans.** Kies per project een eenhedenstelsel: SI (mm), SI (m), US customary, of per grootheid je eigen eenheid. Uitkomsten, invoervelden, tekeningen en het rapport volgen het, en de toetsing blijft precies hetzelfde. Je kunt ook eigen eenheden maken, zoals `.kipf = 1000 lbf`.
- **Eén project, één rapport.** Voorblad, inhoudsopgave en paginanummers lopen door over alle bladen, van welke soort ook, en een optionele situatiepagina toont kaarten van OpenStreetMap van de projectlocatie. Het zijpaneel toont de inhoud en alle nummers terwijl je werkt.
- **Het juiste blad voor elk onderdeel.** Tekst, canvas, spreadsheet, nodegraaf, tekening, notebook, Markdown of PDF, naast elkaar in één project.
- **Verander een getal en de toets volgt.** Bladen rekenen door terwijl je typt, en een tekening of 3D-model kan zijn maten uit het blad halen.
- **Je gegevens blijven open.** Het projectbestand is IFCX, en je kunt IFC4x3 exporteren.
- **Werkt met een AI-assistent.** Een ingebouwde MCP-server en REST-API draaien op je eigen computer, achter een token.

## Geïnspireerd door Calcpad

Open CalcSheet Studio is enorm geïnspireerd door [Calcpad](https://calcpad.eu/) van Ned Ganchovski; dat idee heeft eigenlijk tot deze app geleid. Een berekening schrijf je als gewone tekst en je leest elke stap uitgewerkt terug, en daar zijn we dankbaar voor. De app heeft een eigen rekenkern en opent ook je `.cpd`-bestanden. De open-source lijn van Calcpad loopt door in de community-versie [CalcpadCE](https://github.com/imartincei/CalcpadCE).

## Schermafbeeldingen

De beelden tonen de Engelse versie van de app.

| | |
|---|---|
| ![Het afdrukvoorbeeld van het rapport met voorblad, inhoudsopgave en rekenbladen](docs/images/readme/report.png) **Eén rapport uit alle bladen** | ![De rekentekst naast de uitgewerkte formules, met elke stap en zijn getallen](docs/images/readme/code-output.png) **Tekst erin, formules eruit** |
| ![Een spreadsheetblad met een staaflijst en het gereedschap in het lint](docs/images/readme/spreadsheet.png) **Spreadsheet** | ![Formule-eenheden vrij op een canvas, met hun uitkomsten](docs/images/readme/canvas.png) **Formules op een canvas** |
| ![Een nodegraaf die een portaal opbouwt, met een 3D-voorbeeld op de achtergrond](docs/images/readme/graph.png) **Nodegraaf met 3D-voorbeeld** | ![Een A3-tekenblad met een plattegrond en een doorsnede, elk met een eigen schaal](docs/images/readme/drawing-sheet.png) **Tekenblad met meerdere aanzichten** |
| ![Een Jupyter-notebook met een grafiek en een tabel, met een Python-script uit de werkmap](docs/images/readme/jupyter.png) **Jupyter-notebook met Python** | ![Het tabblad IFC met de ruimtelijke boom en het gemaakte bestand](docs/images/readme/ifc.png) **IFC en IFCX** |
| ![Een reactief Marimo-notebook met schuiven en een momentenlijn](docs/images/readme/marimo.png) **Reactief Marimo-notebook** | ![De instellingen met het logo, de kleuren en het lettertype van het bureau](docs/images/readme/house-style.png) **Je eigen huisstijl** |

## Bladen

Een project is een lijst bladen. Elke soort staat beschreven in [de documentatie van de bladsoorten](docs/bladsoorten.md).

| Blad | Wat het is |
|-------|------------|
| **Rekenblad** | Tekst in de [rekentaal](docs/rekentaal.md), met formules, voorwaarden, grafieken en tekeningen |
| **Spreadsheet** | Een `.xlsx`-werkmap met formules, cellen aanwijzen, doorvullen en paginagrenzen |
| **Canvas** | Formule-eenheden vrij geplaatst, van boven naar beneden gerekend met dezelfde kern |
| **Graaf** | Nodes voor getallen, logica, lijsten, tekst en geometrie, en codeblokken, met een 3D-voorbeeld. Leest grafbestanden (`.dyn`) |
| **Tekening** | A4, A3 of A2 met aanzichten op schaal: stramienen, peilen, wanden, staalprofielen, kanaalplaatvloeren en schematiseringen |
| **Jupyter** | Een [notebook met Python](docs/jupyter-blad.md), numpy, scipy, pandas en matplotlib, zonder iets te installeren. Op verzoek rekent het opnieuw na elke wijziging |
| **Marimo** | Een reactief Python-notebook: verschuif een schuif en alles wat daarvan afhangt, volgt |
| **PDF** | Een bestaande PDF als onderdeel van het rapport. Inzoomen, en opmerkingen, markeringen, pijlen, kaders en wijzigingswolken toevoegen, op het scherm en op papier |
| **Markdown** | Bestaande tekst, als onderdeel van het rapport |

## Modules en bibliotheek

Modules zijn kant-en-klare bladen met een invoerscherm: een **houten balklaag** en een **ligger van hout of staal** volgens EN 1995-1-1 en EN 1993-1-1, en een **tweepaalspoer** volgens EN 1992-1-1, met de Nederlandse nationale bijlage. De [online modulebibliotheek](https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio-modules) kan modules toevoegen zonder nieuwe release; voorlopig staat daar de balklaag. Elk ander blad met invoer, ook een module uit die bibliotheek, krijgt naast het uitgewerkte blad een invoerformulier uit zijn eigen velden. Zie [hoe de toetsing van de balklaag werkt](docs/balklaag-toetsing.md) en [die van de poer](docs/tweepaalspoer-toetsing.md).

De tweepaalspoer heeft naast de tekening een 3D-studiemodel. Dat toont de poer, de palen, de kolom en elke staaf, en volgt elk veld en elke blauwe maat meteen. **Add module** toont bij elke keuze een plaatje, van een leeg tekenblad tot een Marimo-notebook.

**Spanningen in een doorsnede** is mechanica, geen normtoets: kies een I of H, rechthoek, rond, buis, koker, T of U, stel de normaalkracht, de momenten en de dwarskrachten in twee richtingen in, en zie het spanningsveld in de doorsnede, de neutrale lijn en de diagrammen van σ en τ meteen meebewegen. Zie [wat het blad rekent](docs/doorsnede-spanningen.md).

De formulebibliotheek heeft 137 formules die je met een klik invoegt, elk met een schets die laat zien waar het over gaat. De liggers en de doorsnedegrootheden zetten ook een tekening in het blad die je invoer volgt: de momentenlijn op schaal, of de doorsnede op schaal met haar maten. De bibliotheek in het projectpaneel voegt daar 15 uitgewerkte voorbeelden uit de Eurocodes en de klassieke mechanica aan toe. Die voorbeelden zitten niet in de installer: de app haalt ze bij het opstarten op uit deze repository, zodat [een correctie iedereen bereikt](docs/library.md) zonder nieuwe release. De voorbeelden bewaken hun eigen grenzen: de buigwapening waarschuwt bij een overwapende doorsnede of staven die niet passen, en het voorbeeld van de beugels houdt cot θ binnen de grenzen en toetst afstand en minimumwapening.

De **gewichtenbibliotheek** heeft ruim 2300 eigen gewichten, elk met een bron die je kunt openen: materialen, grond en opslag uit vrij leesbare codes, en per leverancier kanaalplaten, staalplaatvloeren, metselwerk, metalstudwanden, dakpannen, groendaken en gevelplaten. Zoek en filter, voeg een waarde met één klik in een opbouw in, en houd je eigen bibliotheek als `.weightlibrary`-bestand om aan te vullen, samen te voegen en te delen. Een rapport bewaart de getallen en verandert dus niet als de bibliotheek verandert.

| | |
|---|---|
| ![Een voorbeeld over knik uit de bibliotheek, uitgewerkt naast het paneel, met Invoegen en Nieuw blad](docs/images/readme/library.png) **Een uitgewerkt voorbeeld uit de bibliotheek** | ![Het invoerscherm van een tweepaalspoer met de wapeningstekening en een 3D-studiemodel](docs/images/readme/two-pile-cap.png) **Tweepaalspoer met tekening en 3D-studiemodel** |
| ![De formulebibliotheek met een schets naast elke formule](docs/images/readme/formula-library.png) **Formulebibliotheek met een schets per formule** | ![Het venster Add module met een plaatje bij elke soort blad en module](docs/images/readme/add-module.png) **Add module, met een plaatje bij elke keuze** |

## Uitwisseling

| Formaat | Openen | Opslaan / exporteren |
|--------|------|---------------|
| **IFCX** (`.ifccalculation`, `.ifcx`) | Ja | Ja, dit is het projectbestand |
| **IFC4x3** (`.ifc`) | Nee | Ja |
| **Rekentekst** (`.cpd`) | Ja | Nee, wordt opgeslagen als projectbestand |
| **Spreadsheet** (`.xlsx`) | Ja | Ja |
| **Markdown** (`.md`) | Ja | Ja |
| **Notebook** (`.ipynb`, `.py`, databestanden) | Ja | De werkmap als `.zip` |
| **PDF** | Als blad | Ja, het rapport |
| **DXF** | Omgezet naar een tekening in een blad | Nee |

Elk blad staat met tekst, invoer en uitkomsten in het IFCX-bestand. Tekeningen die het invoerscherm van een module tekent, staan er niet als figuur in, alleen wat de rekentekst zelf tekent. De tweepaalspoer voegt wel zijn 3D-model toe: in IFC4x3 is elke staaf van de korf een `IfcReinforcingBar`. De meeste bladen weten niet waar hun onderdeel in het gebouw zit, dus elementen zonder geometrie staan op de oorsprong van de bouwlaag. Zie [de IFC-documentatie](docs/ifc-export.md).

## MCP

De app heeft een ingebouwde MCP-server en een REST-API met dezelfde 49 tools: projecten openen en opslaan, bladen toevoegen, invoer zetten, doorrekenen, exporteren en afdrukken. Hij luistert alleen op je eigen computer (`127.0.0.1`), achter een token. Je kunt hem uitzetten, op alleen lezen zetten of pauzeren onder **Settings › API and AI assistant**. Zie [de MCP-documentatie](docs/mcp.md) en [de REST-API](docs/api.md).

## Testen en betrouwbaarheid

- **107 controlescripts** in `scripts/`, gedraaid met `npm run check` bij elke pull request, op Linux en op Windows.
- **382 uitkomsten tegen een handberekening**: 313 in `scripts/check-formules.mjs` en 69 in `scripts/check-library.mjs`, die laatste waar mogelijk langs een andere weg, zoals het evenwicht narekenen.
- **Een echte PDF van een gemengd project** in `scripts/check-rapport-pdf.mjs`: evenveel pagina's als vellen, op elke pagina zijn nummer, en elke regel van de inhoudsopgave op de juiste pagina.
- **Beveiligingsproeven in de echte app**, met de hand gedraaid: `scripts/proef-js-webrtc.mjs` voor scripts in een blad, en `scripts/proef-jupyter-venster.mjs` en `scripts/proef-marimo-venster.mjs` voor notebooks. Ze tellen met een luisterpost wat er naar buiten gaat.
- **Bouwen op alle drie de platforms** bij elke push naar `main`, met controle van de handtekeningen.

Bron van de getallen: de genoemde bestanden en `ls scripts/check-*.mjs`. De status van een module zegt hoe ver de toetsing is: *gecalibreerd* is vergeleken met referentiebladen, *nog controleren* niet.

## Huidige beperkingen

- **De gewichtenbibliotheek is niet compleet.** Er staat in wat met een bron te vinden was. Een aantal grote leveranciers publiceert geen leesbare gewichten en ontbreekt, en bladen worden vervangen: kijk het blad na van het product dat je echt gebruikt.
- **Controleer de uitkomsten zelf.** De ligger, de tweepaalspoer en de spanningen in een doorsnede hebben de status *nog controleren*. De app vervangt het oordeel van een constructeur niet.
- **Jupyter en Marimo zijn alleen op Windows getest.** Op macOS en Linux start de kernel waarschijnlijk niet, omdat de webview daar service workers beperkt. Opgeslagen bestanden en afdrukken werken wel.
- **Notebooks hebben geen netwerk.** `%pip install` werkt niet, en bibliotheken die op JavaScript in hun uitvoer leunen (plotly, bokeh, ipywidgets) tonen niets. Dat is voorlopig een bewuste keuze.
- **Een lopende cel is niet te stoppen.** Marimo heeft ook geen SQL-cellen en volgt het donkere of lichte thema alleen bij het laden.
- **Lettertypen zitten niet in het project.** Behalve Inter en Space Grotesk moet een lettertype uit je huisstijl op de computer staan die afdrukt.
- **De bibliotheek heeft de eerste keer internet nodig.** Zonder verbinding blijft hij leeg tot hij een keer is opgehaald. Daarna gebruikt hij de laatste stand.
- **Een grafbestand komt niet altijd volledig over.** Nodes die deze app niet heeft, scripts en de meeste geometrie blijven met een melding op de graaf staan en rekenen niet.
- **Waarden uit een spreadsheet komen nog niet in rekenbladen.** Een spreadsheet staat voorlopig op zichzelf.
- **Nog geen voet-en-inch met breuken.** 5'-6 ½" kun je nog niet typen of tonen, en een temperatuur blijft in de eenheid van het blad. Toelichtingen die waarden uit een norm citeren, de gewichtenbibliotheek en de tekeningen die een blad zelf maakt, houden ook hun eigen eenheden.
- **Het rapport rechtstreeks naar PDF kan alleen op Windows.** Andere platforms gebruiken de printdialoog.
- **Sommige tekst blijft voorlopig Nederlands.** De app, de bladen, de tab Code en het rapport volgen je taal, maar de namen van de variabelen in de modules en sommige namen in de IFC-boom zijn Nederlands.
- **Pagina-einden kunnen iets verschillen per schermschaal.** Op 100% en 150% kunnen een paar regels op een ander vel komen.
- **Geen WebRTC in de app.** Het is overal geblokkeerd, dus een externe pagina in `@iframe` die het nodig heeft, werkt niet.
- **Open FEM Studio-projecten zijn er nog niet.** Het menu-item is zichtbaar maar staat uit.

Iets gevonden? [Maak een issue](https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio/issues).

## Onder de motorkap

De rekenkern (`packages/core`) is TypeScript op mathjs en werkt ook [als pakket zonder de app](docs/rekenkern-als-pakket.md). De app is een Tauri 2-schil in Rust met React 19, CodeMirror 6 en KaTeX; notebooks draaien op JupyterLite en Pyodide. De gedeelde vormgeving en iconen komen uit [OpenAEC Blueprint](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint).

## Meedoen

- **Probeer het op een echt project** en meld fouten of wat je mist als [issue](https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio/issues/new). Beschrijf wat je deed, wat je verwachtte en wat er gebeurde.
- **Verbeter een voorbeeld.** De [bibliotheek](library) is gewone tekst; zie [hoe je er een herstelt](docs/library.md).
- **Schrijf code.** Lees [AGENTS.md](AGENTS.md) en [de notities voor ontwikkelaars](docs/ontwikkelen.md), en open een pull request.

## Snel starten (ontwikkelaars)

```bash
git clone https://github.com/OpenAEC-Foundation/Open-CalcSheet-Studio.git
cd Open-CalcSheet-Studio
npm ci
npm run tauri:dev --workspace=@openaec/calcsheet-studio
```

Vereist Node 24 en Rust, plus eenmalig Python 3.10 of nieuwer om de Jupyter-omgeving te bouwen. `npm run dev` start een browser-preview waarvoor geen Rust nodig is. Zie [de notities voor ontwikkelaars](docs/ontwikkelen.md). De beelden in deze README komen uit `scripts/maak-readme-beelden.mjs`.

Versies volgen het OpenAEC-schema `JJJJ.W.N`: jaar, ISO-week zonder voorloopnul en een volgnummer binnen de week dat bij 0 begint, zoals `2026.45.0`.

Open CalcSheet Studio hoort bij de apps van de [OpenAEC Foundation](https://github.com/OpenAEC-Foundation).

## Licentie

LGPL-3.0. Zie [LICENSE](LICENSE). De Python-omgeving voor Jupyter en Marimo levert software mee onder eigen licenties (BSD, MIT, MPL-2.0, PSF): zie [de licentielijst](packages/desktop/jupyter-omgeving/LICENTIES.md).

## Merken

Jupyter, Marimo, Windows, macOS en andere productnamen zijn merken van hun eigenaren. Open CalcSheet Studio is een onafhankelijk project en is niet aan hen verbonden, door hen goedgekeurd of gesponsord.
