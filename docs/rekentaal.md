# De rekentaal

Een rekenblad is tekst: elke regel is een toewijzing, een tekstregel of een opdracht. De
kern (`packages/core`) rekent de regels van boven naar beneden door en toont bij elke
uitkomst `naam = formule = ingevulde waarden = resultaat`. Bestanden met de extensie `.cpd`
zijn in deze taal geschreven.

## Rekenen

- **Formules met eenheden:** `mm`, `kN`, `N/mm²`, `mm⁴`, … via de eenheden van mathjs.
- **Eenheden vereenvoudigen vanzelf:** `b*h` geeft direct `mm²`, zonder `to`.
- **Wiskundige opmaak:** KaTeX, met echte breuken, superscripts, subscripts en Griekse letters.
- **Live:** de editor is CodeMirror 6, de uitkomst volgt terwijl je typt.
- **Meerdere bladen:** dezelfde module kan er meerdere keren in, elk met eigen invoer; de
  projectgegevens gelden voor alle bladen.

## Eenheden

- **Metrisch en Amerikaans:** naast de eenheden van mathjs (`mm`, `kN`, `in`, `ft`, `lbf`,
  `kip`, `psi`, …) kent de kern `ksi`, `psf`, `ksf`, `plf`, `klf` en `pcf`. `lb` is massa;
  kracht is `lbf` of `kip`. Alle eenheden staan in `packages/core/src/eenheden.ts`.
- **Eigen eenheden:** `.naam = uitdrukking`, zoals in het `.cpd`-formaat. `.EUR = 1` maakt een
  nieuwe basiseenheid, `.kipf = 1000 lbf` een eenheid uit een andere. De eenheid geldt vanaf
  die regel tot het einde van het blad. Een naam die al een eenheid of variabele is, of een
  getal zonder eenheid anders dan 1, geeft een fout.
- **Eigen eenheden van het project:** in de projectgegevens, onder Units. Ze gelden in elk
  blad zonder `.naam =`. Een blad kan zo'n eenheid niet opnieuw maken: `.naam =` met
  dezelfde naam geeft de fout dat hij al bestaat.
- **Invoervelden (`?`):** je kunt een eenheid meetypen. `5 m` in een veld in mm wordt
  5000 mm, `3/4` geldt in de eenheid naast het veld, en een eenheid die niet past of nog
  niet af is, krijgt een rode rand en wordt niet opgeslagen. Opgeslagen wordt altijd in de
  eenheid van de bladtekst.
- **Temperatuur** rekent niet om naar een ander stelsel: in een blad is het bijna altijd
  een verschil. Voet-en-inch met breuken (5'-6 ½") komt later.
- **Eenhedenstelsel:** `evaluate(nodes, waarden, scope, { stelsel })` toont elke waarde in de
  eenheid van zijn grootheid (`STELSELS` in `eenheidstelsel.ts`: SI (mm), SI (m) en US
  customary). Alleen de weergave verandert: `result`, `unit` en `waarde` blijven in de
  eenheid van het blad, de omgerekende vorm staat in `inStelsel`. Zie
  [het ontwerp](superpowers/specs/2026-11-06-eenheden-design.md).

## Waarden uit een ander blad

- **Het kenmerk:** elk blad in een project heeft een kort, vast kenmerk, een nummer dat
  de app geeft bij het toevoegen. Het staat in de projectboom naast de naam (`#2`) en
  verandert niet als je bladen verplaatst of verwijdert.
- **Verwijzen:** `#2.R_paal` in een formule neemt de waarde `R_paal` uit blad 2 over, met
  zijn eenheid: `V_Ed = 1.1*#2.R_paal`. Een naam met een komma-index mag ook
  (`#2.V_b,0`). In beeld en op papier staat de verwijzing als `#2.R_paal`.
- **In een invoerveld:** typ `#2.R_paal` in plaats van een getal. Het veld rekent de
  waarde om naar zijn eigen eenheid; past die niet, of bestaat blad 2 of de naam daarin
  niet, dan rekent het veld met zijn standaardwaarde en staat er een melding onder.
- **Doorrekenen:** de app rekent het blad waarnaar verwezen wordt eerst door, met zijn
  eigen invoer, ook via via (blad 3 vraagt iets van 2, en 2 van 1). Verandert de invoer
  van blad 2, dan rekent het blad dat ernaar verwijst vanzelf opnieuw. Een kring (1 vraagt
  iets van 2, en 2 van 1) rekent niet rond en geeft een foutmelding.
- **In gewone tekst:** in een Markdown-blad en in een rapporttekst schrijf je dezelfde
  verwijzing tussen accolades: `{#2.R_paal}`. Er komt de waarde met eenheid te staan,
  zoals de uitwerking van dat blad hem toont (`450 kN`); `{#2.M:1}` geeft één decimaal.
  In Markdown blijft een verwijzing tussen backticks of in een codeblok staan als
  voorbeeld. Levert de verwijzing niets op (onbekend blad of naam, een fout in het blad),
  dan blijft ze letterlijk staan, zodat een tikfout opvalt; `sheet_read` noemt per
  verwijzing de waarde en de reden (`references[].error`).
- **Waar:** de kern zet `#2.R_paal` bij het inlezen om in de naam `ref__2__R_paal`
  (`packages/core/src/verwijzing.ts`); de app zet de waarde onder die naam in de scope
  (`packages/desktop/src/rekenen/verwijzingen.ts`). Een losse module verwijst nooit naar
  een ander blad: dat doet de constructeur in zijn eigen project.

## Plaat op palen

Dit is de eigen kern van CalcSheet, alleen nog als terugval en ter vergelijking. Een
plaat van verschillende dikten, met veren, lijnsteunen en combinaties, rekent het blok
`@fem` hieronder door Open FEM Studio.

- **Model:** een vlakke plaat op verende palen in een regelmatig raster, `n_x × n_y` velden van
  `L_x × L_y`, met een paal op elk snijpunt; de rand van het model is vrij. De plaat rekent met
  driehoekige DKT-elementen (Batoz, Bathe & Ho, 1980), de veer van een paal is verdeeld over
  de knopen binnen de paalkop. Elk veld heeft een eigen belasting, dus volle belasting en
  schaakbord zijn dezelfde som (`packages/core/src/plaat.ts`).
- **Invoer:** `geo = [L_x; L_y; n_x; n_y; t; E; ν; k; d_kop; n_el]` (een maat met eenheid wordt
  omgerekend; kaal in m, kN/m² en kN/m) en `last`, een matrix met per veld de belasting in
  kN/m², een rij per veld in y (de onderste eerst).
- **Functies:** `plaat_palen(geo; last)` geeft [m<sub>x,veld</sub>; m<sub>y,veld</sub>; m<sub>x,steun</sub>; m<sub>y,steun</sub>;
  m<sub>x,ks</sub>; m<sub>y,ks</sub>; w<sub>max</sub>; R<sub>max</sub>; R<sub>midden</sub>] in kNm/m, mm en kN, met de
  momenten uit de binnenste velden en m<sub>ks</sub> gemiddeld over de kolomstrook;
  `plaat_R` de reactie per paal, `plaat_w(geo; last; x; y)` de doorbuiging op een punt en
  `plaat_svg(geo; last; grootheid; x0; y0; schaal)` een kleurenbeeld (1 = w, 2 = m<sub>x</sub>,
  3 = m<sub>y</sub>) om in een `<svg>` te zetten.
- **Controle:** `scripts/check-plaat.mjs` (Navier, evenwicht, symmetrie en een binnenveld).

## Syntax

- `"Title`, `'tekst`, `// commentaar`
- `#if … #else if … #else … #end if`, `#hide / #show / #pre / #post`
- `#repeat n … #end repeat` en `#for var = lo : hi … #loop`, ook genest
- `#while voorwaarde … #loop`; met `max=N` aan het eind begrensd. `#iterate x tol=… max=… … #loop`
  herhaalt tot |x_k − x_(k−1)| ≤ tol (in SI; standaard `tol=1e-9`, `max=100`). Een begrensde lus die
  zijn grens haalt zonder klaar te zijn, geeft een foutregel `NOT_CONVERGED` (via MCP met rondes en residu)
- `#def name(p1; p2; …) … #end def` voor macro's, `#def Name$ = literal` voor constanten
- `#include filename.cpd` voor externe macro's en SVG-tekeningen
- `$Plot{ … @ x = lo : hi }` voor grafieken in het blad
- Komma's in een index (`V_b,0`, `n_Int,support,points`), `$`-verwijzingen, matrix `[a;b|c;d]`
- Opmaak (`:F2`), namen met punt of procent (`Cs.Cd`, `F_0.9G50%TotalWeight`)
- `take`, `hlookup`, `hlookup_ge`, `hlookup_le`, `vlookup`, `get`, ook op matrices
- `@select var "Label" … @end` voor een keuzelijst, bijvoorbeeld een materiaal

## Tekeningen in het blad

- **SVG met waarden uit het blad:** `'<line x1="'a'" y1="'b'"/>`
- **`@svg … @end`:** handgeschreven SVG
- **`@img(file.svg)`:** een SVG-bestand komt in het blad, via dezelfde weg als `#include`
- **`@img(file.png|jpg|…)`:** een afbeelding
- **`@iframe https://… hoogte=120mm`:** een externe pagina, laadt pas na bevestiging, in een
  sandbox
- **`@js hoogte=90mm titel="…" bibliotheek=three … @end`:** JavaScript met de waarden van het
  blad als `calc`, pas na bevestiging, afgeschermd en zonder netwerk. Een draaibaar model kan
  met `calc.wereld3d()`, een knop met `addEventListener` (geen `onclick=`)

## Een plaatmodel: `@fem`

Een blad bouwt een plaatmodel op en laat het door Open FEM Studio rekenen
(`solve_open_fem_3d`): platen van verschillende dikte die tegen elkaar liggen, veren,
lijnsteunen, belastinggevallen en combinaties. Daarna rekent het blad verder met de
uitersten per combinatie, de veerreacties en de waarde op een punt of over een strook.
Alles staat in [fem-model.md](fem-model.md); in het kort:

```text
@fem vloer
  materiaal 33 GPa; 0.2
  maas 0.5 m
  plaat 0; 0; 10 m; 10 m; 250 mm
  plaat 4.5 m; 4.5 m; 1 m; 1 m; 450 mm
  veren 0; 0; 3; 3; 5 m; 5 m; 200 MN/m; 400 mm
  geval G
    eigengewicht 25 kN/m^3
  geval Q
    vlaklast 5 kN/m^2; 0; 0; 5 m; 10 m
  combinatie UGT = 1.2*G + 1.5*Q
  beeld UGT mx
@end
m_Ed = vloer.UGT.mx_max
m_ks = -fem_strook(vloer; "UGT"; "mx"; 5 m; 3.75 m; 5 m; 6.25 m)
```

Het antwoord wordt opgezocht en vastgelegd zoals bij `@toets` hieronder; zonder antwoord
staat het blok als NIET GEREKEND, nooit met een uitkomst.

## Een rekentool met geneste invoer: `@kern`

Een rekentool van Open FEM Studio waarvan de uitkomst uit getallen bestaat, zoals de
rekenkernen van `solve_native_fem` (het drielagenmodel voor de wapening van een plaat, de
scheurwijdte volgens NEN-EN 1992-1-1 7.3.4). Elke regel is `pad = uitdrukking`; een pad
met punten bouwt de geneste invoer op. Daarna rekent het blad verder met de getallen uit
het antwoord. Alles staat in [fem-kernen.md](fem-kernen.md); in het kort:

```text
@kern drie = solve_native_fem
  inputs.kind = "threeLayer"
  inputs.input.forces = {nx: 0, ny: 0, nxy: 0, mx: m_x/(1 kN), my: 0, mxy: 0, vx: 0, vy: 0}
  inputs.input.thicknessMm = h
  inputs.input.topSkinMm = 2*a_b
  inputs.input.bottomSkinMm = 2*a_o
  inputs.input.topReinforcement = {asX: 524, asY: 524}
  inputs.input.bottomReinforcement = {asX: 754, asY: 754}
  inputs.input.fcdMpa = f_cd
  inputs.input.fydMpa = f_yd
  inputs.input.nuPrime = 0.88
  inputs.input.compressionModel = "ec2AnnexF"
@end
A_sx = drie.result.bottom.requiredAsXmm2PerM*mm^2
```

- Eenheden volgen het einde van de naam van het veld (`thicknessMm`, `fcdMpa`,
  `length_m`); een veld zonder eenheid in zijn naam krijgt een getal.
- Met `per k = 1 : n` doet het blok een reeks aanroepen, en is elke uitkomst een vector
  met een waarde per aanroep. Een k zonder velden wordt overgeslagen.
- `lijst[k].veld = …` met `#for … #loop` bouwt een lijst van objecten op.
- Het blok geeft geen oordeel en rekent niets zelf. Het antwoord wordt opgezocht en
  vastgelegd zoals bij `@toets`; zonder antwoord staat het blok als NIET GEREKEND en
  bestaan de uitkomsten niet.

## Normtoetsen: `@toets`

Een normtoets komt uit één bron: Open FEM Studio, dat headless in CalcSheet zit. Een
blad schrijft de toets niet zelf, maar laat hem doen:

```text
@toets kolom = check_steel_beam
  beam_id = 1
  profile_name = "HEA200"
  steel_grade = "S235"
  length_m = h
  forces_envelope = [1; 0; N_Ed; 0; V_Ed; 0; M_Ed; 0 | 1; h; N_Ed; 0; V_Ed; 0; M_Ed; 0]
  lateral_bracing = {top_flange_positions: [0; 1], bottom_flange_positions: [0; 1]}
  deflection_limit_class = "Roof"
  deflection_limit_numerator = 250
  deflection_actual_max_mm = w_max
  is_cantilever = false
  consequence_class = "CC2"
@end
UC_max = kolom.uc_max
```

- **De velden.** Na `@toets` komen de naam van de uitkomst en een tool van FEM Studio. Elke
  rekentool uit `tools/list` van de server mag, ook een die er later bij komt
  (`check_*`, `concrete_*`, `compute_*`, `list_*`, `solve_*`, `validate_fem_model`, …). Niet:
  de tools die de app van FEM Studio sturen of het project en het model in die app
  bijhouden (`gui_*`, `app_*`, `project_*`, `model3d_*`, `extensions_*`), en de tools die
  bestanden lezen of schrijven (`load_*`, `generate_*`, de IFC-import en -export). De
  lijst staat als `TOETS_UITGESLOTEN` in `toetsBlok.ts`, en gelijk in de Rust-kant. Elke regel is
  `veld = uitdrukking`, met de veldnamen uit het schema van die tool. Een uitdrukking
  rekent met het blad: invoer, projectgegevens en `#id`-verwijzingen. Tekst staat tussen
  dubbele aanhalingstekens, ja en nee zijn `true` en `false`, en een object schrijf je als
  `{naam: waarde, …}`.
- **Eenheden.** Die volgen het einde van de veldnaam: `_m`, `_mm`, `_mm2`, `_mm4`, `_mm6`,
  `_kn`, `_knm`, `_mpa`, `_n_per_mm`, `_kn_per_m`. `length_m = 6000 mm` gaat als 6.
  - Een getal zonder eenheid gaat zoals het is.
  - Een grootheid in een veld zonder eenheid in de naam is een fout op die regel.
  - `forces_envelope` mag een matrix zijn, met per rij één station: combinatie, x (mm),
    N, V_y, V_z (kN), M_t, M_y, M_z (kNm).
- **De uitkomst.** Na het blok gelden de volgende variabelen. Een punt in een naam is in
  de rekentaal een liggend streepje, dus `kolom.uc_max` is `kolom_uc_max`.
  - `kolom.uc_max`: de hoogste UC.
  - `kolom.voldoet`: 1 of 0.
  - `kolom.status`: `Ok`, `NotOk` of `NotApplicable` (niet volledig getoetst).
  - Per toets `kolom.uc_6_3_2_ltb`: de punten in het id worden liggende streepjes.
  - Bij een model `kolom.uc_staaf`: een vector met een UC per staaf.
- **Op het blad.** Het blok staat als tabel: per toets het artikel, de titel, de UC en het
  oordeel, met de maatgevende rij vet. Een toets die niet van toepassing is, staat grijs.
  De afleiding (formule, waarden, toelichting) staat alleen op het scherm.
- **Rekenen in rondes.** De werkruimte stuurt het verzoek naar FEM Studio en rekent het
  blad opnieuw zodra het antwoord er is. Wat van het blok afhangt, is tot dan onbekend.
- **Niet getoetst.** Het rapportpaneel, de API en de export vragen zelf niets aan FEM
  Studio. Een blok zonder antwoord staat daar als NIET GETOETST, nooit als "voldoet". Zo
  staat het ook als FEM Studio een fout gaf, bijvoorbeeld een profiel dat het niet kent.
- **Vóór het afdrukken** toetst de app eerst de blokken die nog geen antwoord hebben, en
  wacht daarop (hoogstens twee minuten). Een blok dat dan nog geen antwoord heeft, staat
  als NIET GETOETST op papier.
- **Hetzelfde antwoord.** Het antwoord hoort bij de invoer op het blad, niet bij de eenheid
  waarin die getypt is: `h = 6 m` en `h = 6000 mm` vinden hetzelfde antwoord.
- **Vastgelegd bij het blad.** Elk antwoord gaat mee in het projectbestand, bij het blad
  (`ocss::blad::toetsing`): het verzoek, het antwoord, de datum en waarmee getoetst is (de
  versie en de sha256 van de server, en een hash van het schema van de tool). Bij het
  openen rekent het blad met die antwoorden, en gaat er niets naar FEM Studio zolang de
  invoer gelijk blijft. Een opgeleverd blad toont zo zijn uitkomst ook op een computer
  zonder FEM Studio.
  - Verandert de invoer, dan gaat er een nieuw verzoek uit. Een antwoord dat het blad
    niet meer gebruikt, valt bij het opslaan weg.
  - Een fout wordt niet vastgelegd: na opnieuw openen mag het weer.
  - Twee bladen met dezelfde invoer delen hun antwoord.
- **Opnieuw toetsen.** Is een antwoord gemaakt met een andere versie van FEM Studio, of
  met een ander schema van de tool, dan blijft het gelden. Op het scherm staat dan wel
  "Getoetst met versie 2026.44.2; deze CalcSheet heeft FEM Studio 2026.46.1." en de knop
  **Opnieuw toetsen**. Die knop staat ook bij een blok met een fout. Opnieuw toetsen
  gebeurt nooit vanzelf. Lukt het niet, dan blijft het oude antwoord staan, met de fout
  erbij.
- **Op papier** staat de versie van FEM Studio één keer bij het eerste blok, als alle
  blokken van het blad dezelfde versie hebben, en anders bij elk blok. De datum staat
  alleen op het scherm.

## Voorbeeld

```text
"Voorbeeldproject

#include svg_drawing.cpd

# 1. Invoer
b = 300 mm
h = 500 mm
N_Ed = ?*(kN)
fck = 30 N/mm^2

# 2. Geometrie
A = b*h          // mm² — automatisch
W_y = b*h^2/6    // mm³

# 3. Toetsing
sigma = N_Ed/A to N/mm^2

#if sigma ≤ fck/1.5
    'Voldoet ✓
#else
    'Voldoet NIET ✗
#end if

# 4. Detail-tekening
@img(detail-D1.svg)

# 5. Belasting-diagram
$Plot{f(x) @ x = 0 : L}
```
