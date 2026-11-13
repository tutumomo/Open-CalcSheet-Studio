# Een plaatmodel door Open FEM Studio: `@fem`

Een rekenblad bouwt met `@fem naam … @end` een plaatmodel op. Open FEM Studio rekent
het door (`solve_open_fem_3d`, vierhoekige MITC4-schaalelementen) en het blad rekent
verder met de uitkomsten. CalcSheet heeft hier geen eigen plaatkern: het blad maakt het
model en het raster, FEM Studio rekent. De oude eigen kern (`plaat_palen`, DKT) blijft
alleen als terugval en ter vergelijking.

De code: `packages/core/src/femBlok.ts` (het blok), `femNet.ts` (het raster en de JSON),
`femResultaat.ts` (combinaties, waarden, beelden). De controle:
`scripts/check-fem-model.mjs`, met de antwoorden van de echte server in
`scripts/fixtures/fem/` (opnieuw te maken met `node scripts/proef-fem-model.mjs --bewaar`).

## Voorbeeld: een betonvloer op palen

```text
L = 5 m
t = 250 mm
b_k = 1 m
t_k = 450 mm
b_s = 1 m
t_s = 350 mm
k = 200 MN/m
d = 400 mm

@fem vloer
  materiaal 33 GPa; 0.2
  maas 0.5 m
  // de vloer, en de versterkte stroken over de middelste paallijnen
  plaat 0; 0; 2*L; 2*L; t
  plaat 0; L - b_s/2; 2*L; b_s; t_s
  plaat L - b_s/2; 0; b_s; 2*L; t_s
  // een ponskop boven elke paal, binnen de vloer gehouden
  #for i = 0 : 2
  #for j = 0 : 2
  plaat max(i*L - b_k/2; 0 m); max(j*L - b_k/2; 0 m); min(i*L + b_k/2; 2*L) - max(i*L - b_k/2; 0 m); min(j*L + b_k/2; 2*L) - max(j*L - b_k/2; 0 m); t_k
  #loop
  #loop
  veren 0; 0; 3; 3; L; L; k; d
  geval G
    eigengewicht 25 kN/m^3
    vlaklast 1 kN/m^2
  geval Q
    vlaklast 5 kN/m^2; 0; 0; L; 2*L
    puntlast 20 kN; 1.5*L; 1.5*L
  combinatie UGT = 1.2*G + 1.5*Q
  combinatie BGT = G + Q
  beeld UGT mx
@end

m_Ed = vloer.UGT.mx_max
m_Ed,steun = -vloer.UGT.mx_min
m_ks = -fem_strook(vloer; "UGT"; "mx"; L; 0.75*L; L; 1.25*L)
R_max = vloer.R_max
w_BGT = vloer.BGT.w_max
@3d
eenheid m
fem vloer BGT w
@end
```

Het blok is dat van de controle (`scripts/fixtures/fem/bladen.mjs`, `VLOER`), met een
`beeld` erbij. Met de vastgelegde antwoorden geeft het blad m_Ed = 80,2 kNm/m,
m_Ed,steun = 114,9 kNm/m, m_ks = 58,2 kNm/m boven de middelste paal, R_max = 485,2 kN en
w_BGT = 2,68 mm.

## De regels in het blok

Een regel is een woord en zijn waarden, gescheiden door `;`. Elke waarde is een
uitdrukking uit het blad, met eenheid. Een kaal getal telt in de eenheid die erbij staat.
Een regel met `//` is commentaar; `#for … #loop` en `#if … #else if … #else … #end if`
werken zoals in de rest van het blad.

| Regel | Betekenis | Kaal getal in |
|---|---|---|
| `materiaal E; ν` | elasticiteitsmodulus en dwarscontractie, voor alle platen | MPa |
| `maas a` | de grootste zijde van een element (standaard 0,5 m) | m |
| `analyse lineair` | de enige analyse die FEM Studio voor platen nu kent (standaard) | |
| `plaat [naam:] x; y; l_x; l_y; t` | een rechthoekige plaat vanaf de hoek (x, y), dikte t; een latere plaat over een eerdere wint | m |
| `veer x; y; k [; d_kop]` | een veer loodrecht op de plaat, over de knopen binnen de paalkop d verdeeld | m, kN/m |
| `veren x₀; y₀; n_x; n_y; a_x; a_y; k [; d_kop]` | een raster van n_x × n_y veren op afstand a_x, a_y | m, kN/m |
| `lijnsteun x₁; y₁; x₂; y₂ [; k]` | een steun langs een lijn evenwijdig aan x of y; zonder k vast, met k een veer per m | m, kN/m² |
| `geval naam` | een belastinggeval; de lasten eronder horen erbij | |
| `vlaklast q` | op de hele vloer | kN/m² |
| `vlaklast q; plaat` | op de rechthoek van een benoemde plaat, ook waar een latere plaat erover ligt | kN/m² |
| `vlaklast q; x; y; l_x; l_y` | op een rechthoek | kN/m², m |
| `eigengewicht γ` | γ maal de dikte van de plaat die er ligt | kN/m³ |
| `puntlast F; x; y` | een puntlast | kN, m |
| `combinatie naam = 1.2*G + 1.5*Q` | een som van factor maal geval; een factor mag een uitdrukking uit het blad zijn | |
| `beeld UGT mx` | een plattegrond in kleur onder het blok (zie `fem_svg`); w, mx, my, mxy, vx of vy | |

Een last omlaag is positief. Een fout staat per regel boven het blok (`regel 7: veer
verwacht 3 of 4 waarden …`); dan gaat er niets naar FEM Studio.

## Na het blok in de scope

Een punt in een naam is in de rekentaal een liggend streepje: `vloer.UGT.mx_max` is
`vloer_UGT_mx_max`. Uit een ander blad schrijf je de liggende streepjes: `#2.vloer_UGT_mx_max`,
en `fem_waarde(#2.vloer; "UGT"; "mx"; x; y)` leest het model van blad 2.

| Naam | Wat | Eenheid |
|---|---|---|
| `vloer` | het model zelf, voor de functies en `@3d` | |
| `vloer.R.mx_max`, `.mx_min`, `.my_max`, `.my_min`, `.mxy_max`, `.mxy_min` | de uitersten per geval of combinatie R | kNm/m |
| `vloer.R.w_max`, `.w_min` | doorbuiging, omlaag positief | mm |
| `vloer.R.R` | de reactie per veer, in de volgorde van het blok (een raster rij voor rij, de onderste eerst) | kN |
| `vloer.R.R_max`, `.R_min`, `.R_som` | de grootste, kleinste en totale veerreactie | kN |
| `vloer.R.RL` | de reactie per lijnsteun | kN |
| `vloer.mx_max`, … `vloer.R_min` | de omhullende over de combinaties (zonder combinaties: over de gevallen) | |

Tekens zoals in `plaat.ts`: een moment is positief bij trek aan de onderzijde, m_x geeft
spanning in x (wapening in x), een reactie is positief omhoog. Een moment per meter heeft
de dimensie van een kracht; de kern toont het daarom als kN.

## Functies

- `fem_waarde(vloer; "UGT"; "mx"; x; y)`: de waarde op een punt. Grootheden: `"w"` (mm),
  `"mx"`, `"my"`, `"mxy"` (kNm/m), `"vx"`, `"vy"` (kN/m). Binnen een element bilineair
  tussen de knopen van zijn plaat; een punt naast de vloer is een fout.
- `fem_strook(vloer; "UGT"; "mx"; x₁; y₁; x₂; y₂)`: het gemiddelde over de rechthoek, of over
  de lijn als hij in één richting geen breedte heeft. Voor een kolomstrook op de lijn door
  de palen: `fem_strook(vloer; "UGT"; "mx"; L; 0.75*L; L; 1.25*L)`. Exact per element (het
  veld is bilineair); alleen wat op een plaat ligt telt.
- `fem_svg(vloer; "UGT"; "mx" [; breedte])`: een plattegrond in kleur, als `<svg>`, voor een
  plek elders in het blad: `#hide`, `kaart = fem_svg(…)`, `#show`, en dan `{{kaart}}` in een
  `@svg`-blok. Hetzelfde beeld als `beeld` in het blok. Tien klassen (op papier af te lezen), een legenda met de grenzen en de
  eenheid, de randen tussen platen van verschillende dikte, de veren en lijnsteunen, en het
  grootste en kleinste getal op hun plek. Een moment rood (trek boven) – wit – blauw (trek
  onder), de doorbuiging van wit naar blauw.
- `fem_reacties(vloer; "UGT")`: per veer [x; y; R].
- In een `@3d`-blok: `fem vloer UGT w [h]` tekent het vlak, elke knoop op zijn plaats met de
  waarde als hoogte (omlaag bij een positief getal, zoals een momentenlijn aan de
  trekzijde), in de kleuren van `fem_svg`. h is de getekende hoogte van het grootste getal
  (standaard 12 % van de vloer).

## Op het blad

Het blok toont de kop met de versie van FEM Studio, het model in het kort (knopen,
vierhoeken, maas, veren), een plattegrond van het model met de platen in grijs naar dikte,
per belastinggeval Σ last en Σ R (het evenwicht), en per geval en combinatie de uitersten.

- **Wacht:** in de werkruimte gaat elk geval naar FEM Studio; tot de antwoorden er zijn,
  staat er "Wordt gerekend door Open FEM Studio…" en zijn de uitkomsten onbekend.
- **NIET GEREKEND:** zonder antwoord (op papier, in het rapport, via de API) of bij een
  fout van FEM Studio, met de reden. Er staat dan nooit een uitkomst.
- **Opnieuw rekenen:** bij een fout, of als het antwoord van een andere versie van FEM
  Studio komt; nooit vanzelf.

## Hoe het werkt

- **Het raster.** Eén raster van rechthoeken over alle platen, met lijnen door elke
  plaatrand, elke veer en de rand van zijn paalkop, elke lijnsteun, de rand van elke
  vlaklast op een rechthoek en elke puntlast. Daartussen zo verdeeld dat geen zijde langer
  is dan de maas. Zo delen platen van verschillende dikte die tegen elkaar liggen hun
  knopen, zonder hangende knopen. Een element hoort bij de laatste plaat die zijn midden
  bedekt. Hoogstens 8000 knopen.
- **Een paalkop.** Op een puntsteun wordt het moment in een plaat oneindig
  (logaritmisch), en de waarde boven de paal zou dan alleen van de maas afhangen. Een veer
  met een kop d is daarom gelijk verdeeld over de knopen binnen de kop (zoals in
  `plaat.ts`); de rand van de kop is een rasterlijn, dus er zijn er minstens vijf (minder aan
  de rand van de vloer).
- **In het vlak.** Een plaat die alleen loodrecht op haar vlak is opgelegd, kan in haar
  vlak schuiven en draaien. Het model houdt de eerste knoop vast in x en y en een tweede op
  dezelfde rij in y: statisch bepaald, dus zonder dwang.
- **De lasten.** Elke plaat uit het blok is één plaat in de JSON. De vlaklast op de hele
  vloer en het eigen gewicht gaan als vlaklast van FEM Studio (`surfaceLoads`). Een
  vlaklast op een rechthoek gaat als knooplasten, q·A/4 op elke hoek van elk element
  eronder: voor een rechthoekig element is dat de consistente last. Een plaat opdelen per
  vlaklast kan niet, want FEM Studio middelt de momenten op een knoop per plaat.
- **Per geval één aanroep.** De combinaties telt CalcSheet lineair op; dat mag, want een
  model met platen rekent FEM Studio alleen lineair.
- **Vastleggen.** Zoals bij `@toets`: het antwoord hoort bij de hash van de invoer op het
  blad (het hele model in SI, en de naam van het geval). Een andere factor in een
  combinatie vraagt dus niets nieuws; een andere last of plaat laat alle gevallen opnieuw
  rekenen, omdat het raster kan verschuiven. Bij het blad worden bewaard: het rekenmodel van
  het geval (het raster, de steunen en de lasten, waaruit `femArgumenten` precies de
  verzonden JSON maakt) en het antwoord compact (per knoop u_z, per knoop en plaat de
  momenten en dwarskrachten, per steunknoop de reactie, op zes of negen cijfers). Een
  opgeleverd blad toont zo later hetzelfde, ook zonder FEM Studio en ook als CalcSheet
  intussen anders zou meshen. Zijn de gevallen met een ander raster gerekend, dan meldt
  het blok dat en rekent het niet.

## Vergelijking met een bekende oplossing

`scripts/check-fem-model.mjs` rekent met de vastgelegde antwoorden van FEM Studio 2026.44.2:

- **Navier**, vrij opgelegde vierkante plaat a = 6 m, t = 150 mm, q = 10 kN/m², maas a/24,
  vier lijnsteunen: w in het midden +1,6 %, m_x in het midden +1,0 %. De plaat van FEM
  Studio is een Mindlin-plaat met zachte opleggingen (alleen w vast); dwarskracht-
  vervorming en de randzone maken hem iets slapper dan de Kirchhoff-plaat van Navier.
- **plaat_palen** (DKT, `plaat.ts`), 3 × 3 velden van 4 m, t = 250 mm, palen van
  150 MN/m met een kop van 1 m, maas 0,25 m: paalreacties binnen 0,4 %, doorbuiging binnen
  0,7 %, m_x in het veldmidden −2,7 %, in de kolomstrook +2,0 % en boven de binnenpaal
  +2,4 %. Met een maas van 0,5 m kwam m_x in het veldmidden 11 % lager uit: MITC4 benadert
  dat veldmoment op een grof raster van onderen. Kies de maas dus niet grover dan een
  achtste van de overspanning.

## Wat FEM Studio nog niet kan

- **Fysisch niet-lineair** (gescheurd beton met wapeningslagen): `solve_open_fem_3d`
  weigert een model met platen dat niet lineair is. Het blok kent daarom alleen
  `analyse lineair`; een andere analyse, zoals `analyse fysisch-niet-lineair`, laat het
  blok als niet gerekend staan met de reden erbij, zodat een blad die keuze al kan
  aanbieden zonder ooit een lineaire uitkomst onder een andere naam te tonen. De
  rekenkernen van `solve_native_fem` rekenen een gewapende plaat ook nog niet
  niet-lineair: zie [fem-kernen.md](fem-kernen.md), "Fysisch niet-lineair rekenen van een
  plaat". Het blok is er wel op gebouwd: een rekengeval is nu een belastinggeval, en
  combinaties zijn een lineaire som. Voor een niet-lineaire berekening wordt elke
  combinatie zelf een rekengeval met zijn gefactoriseerde lasten, zonder optellen. Wat
  daarvoor in FEM Studio nodig is: een tool (of `analysis` in `solve_open_fem_3d`) die een
  plaat met wapening rekent, met per plaat de wapening per richting boven en onder (A_s,
  dekking), de betonklasse en het staal, de belasting in stappen, en een antwoord in
  dezelfde vorm (knopen, momenten per plaat) plus de staalspanning en de scheurwijdte. In
  het blok komt dan `wapening [plaat:] A_sx,o; A_sy,o; A_sx,b; A_sy,b; c` en
  `analyse fysisch-niet-lineair`.
- **Andere vormen dan rechthoeken**, gaten en schuine randen: het raster is rechthoekig.
- **Wanden, kolommen en balken** onder de plaat: alleen veren en lijnsteunen.
- **Bedding** (`plates[].bedding`, alleen druk) en orthotrope platen kent
  `solve_open_fem_3d` wel; het blok gebruikt ze nog niet.
- **Driehoeken** weigert FEM Studio; het raster maakt alleen vierhoeken.
