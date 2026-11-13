# Een rekentool van Open FEM Studio met geneste invoer: `@kern`

Met `@kern naam = tool … @end` roept een rekenblad een rekentool van Open FEM Studio aan
waarvan de invoer genest is en de uitkomst uit getallen bestaat, en rekent het verder met
die getallen. Het is de tegenhanger van `@toets`: dat blok leest een normtoets (een UC en
een oordeel), `@kern` geeft de uitkomst terug zoals hij is en geeft nooit een oordeel.
CalcSheet rekent hier niets zelf: het blad maakt de invoer, FEM Studio rekent.

Aanleiding zijn de rekenkernen van `solve_native_fem`: het drielagenmodel voor de wapening
van een plaat (`threeLayer`, `threeLayerBatch`) en de scheurwijdte volgens NEN-EN 1992-1-1
7.3.4 (`crackWidth`). Het blok is niet aan die tool gebonden: elke rekentool uit
`tools/list` van de server mag, met dezelfde uitzonderingen als bij `@toets`.

De code: `packages/core/src/kernBlok.ts`. De controle: `scripts/check-kern-blok.mjs`, met
de antwoorden van de echte server in `scripts/fixtures/kern/antwoorden.json` (opnieuw te
maken met `node scripts/proef-kern-blok.mjs --bewaar`).

## Voorbeeld: het drielagenmodel in één punt

```text
h = 250 mm
a_o = 42 mm
a_b = 40 mm
m_x = 50 kN
f_yd = 500 N/mm^2/1.15

@kern drie = solve_native_fem
  inputs.kind = "threeLayer"
  // een moment per meter is in het blad een kracht: gedeeld door 1 kN het getal in kNm/m
  inputs.input.forces = {nx: 0, ny: 0, nxy: 0, mx: m_x/(1 kN), my: 0, mxy: 0, vx: 0, vy: 0}
  inputs.input.thicknessMm = h
  inputs.input.topSkinMm = 2*a_b
  inputs.input.bottomSkinMm = 2*a_o
  inputs.input.topReinforcement.asX = 524
  inputs.input.topReinforcement.asY = 524
  inputs.input.bottomReinforcement = {asX: 754, asY: 754}
  inputs.input.fcdMpa = 20 N/mm^2
  inputs.input.fydMpa = f_yd
  inputs.input.nuPrime = 0.88
  inputs.input.compressionModel = "ec2AnnexF"
@end

z = drie.result.leverArmMm*mm
A_sx = drie.result.bottom.requiredAsXmm2PerM*mm^2
UC = drie.result.bottom.utilizationAsX
```

Dit is het blad `DRIE` van de controle (`scripts/fixtures/kern/bladen.mjs`). Met het
vastgelegde antwoord geeft het z = 168 mm, A_sx = 684,5 mm²/m en UC = 0,908.

## De regels in het blok

Elke regel is `pad = uitdrukking`. Een regel met `//` is commentaar.

- **Het pad** bouwt de geneste invoer op: `inputs.input.thicknessMm = h` zet het veld
  `thicknessMm` in `input` in `inputs`. Velden met hetzelfde begin komen in hetzelfde
  object. Een waarde mag ook een object zijn: `forces = {nx: 0, …}`.
- **Een lijst** krijgt een index tussen rechte haken, vanaf 1: `samples[2].id = "b"`. De
  index is een uitdrukking, dus in een `#for` de teller. Een lijst met een gat is een fout.
- **`#for … #loop` en `#if … #else if … #else … #end if`** werken zoals in `@fem`.
- **De uitdrukking** rekent met het blad: invoer, projectgegevens en `#id`-verwijzingen.
  Tekst staat tussen dubbele aanhalingstekens, ja en nee zijn `true` en `false`.
- **Eenheden** volgen het einde van de naam van het veld, in de schrijfwijze van de tool:
  met liggende streepjes zoals bij `@toets` (`length_m`, `a_net_mm2`) of met hoofdletters
  (`thicknessMm`, `widthMm`, `…Mm2`, `…Mm4`, `fcdMpa`, `…Kn`, `…Knm`, `…KnPerM`, `…KnM2`,
  `…Mm2PerM`, `…Mm2PerM2`, `positionM`). `thicknessMm = 0.25 m` gaat als 250.
  - Een getal zonder eenheid gaat zoals het is.
  - Een verhouding is een getal: `m_x/(1 kN)` voor een moment per meter in kNm/m.
  - Een grootheid in een veld zonder eenheid in de naam (`mx`, `asX`) is een fout op die
    regel, met het pad erbij.
- **Hetzelfde veld twee keer** is een fout.

## Een reeks aanroepen: `per`

Met `per k = 1 : n` als regel in het blok doet het blok een reeks aanroepen, één per
waarde van k. De velden worden per k uitgerekend, met k als teller.

```text
M = [50; 0; 0 | 30; 20; 10 | 0; 0; 0 | -40; -40; 15]
@kern reeks = solve_native_fem
  per k = 1 : 4
  #if abs(take(k; 1; M)) + abs(take(k; 2; M)) + abs(take(k; 3; M)) > 0
  inputs.kind = "threeLayer"
  inputs.input.forces.mx = take(k; 1; M)
  …
  #end if
@end
A_4b = take(4; reeks.result.top.requiredAsXmm2PerM)
```

- **Overslaan.** Een k zonder velden (alles staat in een `#if` die niet geldt) wordt niet
  aangeroepen. Zo vraagt het blad geen scheurwijdte voor een laag die niet op trek staat.
- **Eén verzoek, één antwoord.** De hele reeks is één verzoek met één hash; de app doet
  de aanroepen na elkaar en legt de antwoorden samen vast. Het blad rekent daarna één keer
  opnieuw, ook bij tientallen aanroepen. Een fout in één aanroep is een fout van het
  geheel, met het nummer van de aanroep erbij: een reeks met een gat is geen antwoord.
- **Hoogstens 2000 aanroepen** per blok.

## Na het blok in de scope

Een punt in een naam is in de rekentaal een liggend streepje: `drie.result.leverArmMm` is
`drie_result_leverArmMm`. Eindigt een naam op één kleine letter (`naam.result.w`), schrijf
hem dan met liggende streepjes (`naam_result_w`): de rekentaal leest `.w` als een index.

| In het antwoord | Na het blok |
|---|---|
| een getal, een tekst | `naam.pad.naar.veld` met die waarde |
| ja of nee | 1 of 0 |
| leeg (`null`) | bestaat niet |
| een lijst getallen | een vector |
| een lijst van lijsten getallen | een matrix |
| een lijst objecten | per veld een vector, met een waarde per object; een lijst getallen per object wordt een matrix met een rij per object |
| bij `per` | per veld een vector met een waarde per aanroep: NaN, of lege tekst, bij een overgeslagen aanroep |

Bij `per` gelden daarnaast `naam.aantal` (het aantal aanroepen, de overgeslagen
meegeteld) en `naam.gerekend` (per aanroep 1 of 0).

De getallen hebben geen eenheid: het antwoord van een tool draagt die niet. Het blad zet
hem erbij: `A_sx = drie.result.bottom.requiredAsXmm2PerM*mm^2`.

## Op het blad

Het blok is één regel: de naam, de tool, de versie van FEM Studio en het aantal
aanroepen. Op het scherm staat de datum erbij en is uit te klappen wat er verstuurd is
(de eerste aanroep) en welke uitkomsten er zijn. Wat de getallen betekenen, zegt het blad
zelf: het blok geeft geen oordeel.

- **Wacht:** in de werkruimte gaat het verzoek naar FEM Studio; tot het antwoord er is,
  staat er "Wordt gerekend door Open FEM Studio…" en bestaan de uitkomsten niet.
- **NIET GEREKEND:** zonder antwoord (op papier, in het rapport, via de API) of bij een
  fout van FEM Studio, met de reden. Er staat dan nooit een uitkomst: wat van het blok
  afhangt, geeft een fout of valt in een `#if` weg. Een blad vangt dat op met een vlag,
  zoals `gerekend = bool(drie.aantal > 0)` achter `#hide`: zonder antwoord mislukt die
  regel, is de vlag geen 1 en toont het blad "nog niet gerekend".
- **Opnieuw rekenen:** bij een fout, of als het antwoord van een andere versie van FEM
  Studio of een ander schema van de tool komt; nooit vanzelf.
- **Achter `#hide`** rekent het blok mee en staat het niet op het blad.

## Hoe het werkt

Dezelfde regels als `@toets` ([rekentaal.md](rekentaal.md)):

- **De hash.** Het antwoord hoort bij de hash van de tool en de invoer op het blad, met de
  grootheden in SI: `h = 250 mm` en `h = 0.25 m` vinden hetzelfde antwoord. Bij een reeks
  gaat de hash over alle aanroepen samen.
- **Geen aanroep vanuit de kern.** De rekenkern geeft in de werkruimte een verzoek mee
  (`verzoek`, bij een reeks met `reeks`); de app stuurt het (`kernAanroepen` in
  `kernBlok.ts`, aangeroepen uit `packages/desktop/src/rekenen/femToetsing.ts`) en rekent
  het blad opnieuw zodra het antwoord er is. Een blok dat de uitkomst van een ander
  gebruikt, komt een ronde later.
- **Vastgelegd bij het blad.** Het antwoord gaat mee in het projectbestand, met het
  verzoek, de datum en waarmee gerekend is (de versie en de sha256 van de server, en de
  hash van het schema van de tool). Een geopend blad toont zijn uitkomst zonder FEM Studio.
- **Vóór het afdrukken** rekent de app eerst de blokken die nog geen antwoord hebben.

## De rekenkernen voor beton

Het contract staat in de documentatie van FEM Studio bij de rekenkernen; in het kort wat
een blad nodig heeft. Maten in mm en mm², momenten in kNm/m, krachten in kN/m.

**`threeLayer`: het drielagenmodel.** De plaat is verdeeld in twee buitenlagen en een
kern. De momenten en de krachten in het vlak worden krachten in de buitenlagen, met de arm
tussen hun middens (z = t − ½·t<sub>boven</sub> − ½·t<sub>onder</sub>); per buitenlaag
volgt de wapening uit NEN-EN 1992-1-1 bijlage F. Een positief moment geeft trek onder.

- Invoer: `forces` (nx, ny, nxy, mx, my, mxy, vx, vy), `thicknessMm`, `topSkinMm`,
  `bottomSkinMm`, `topReinforcement` en `bottomReinforcement` (asX, asY in mm²/m),
  `fcdMpa`, `fydMpa`, `nuPrime`, `compressionModel` (`ec2AnnexF` of `blaauwendraad2021`),
  en eventueel `core` voor de dwarskracht in de kern.
- Uitkomst: `result.leverArmMm`, per buitenlaag (`top`, `bottom`) de krachten, de
  benodigde wapening `requiredAsXmm2PerM` en `requiredAsYmm2PerM`, de benutting daarvan,
  de betonspanning met haar grens en de benutting, en de tak van bijlage F.
- Het is een deeltoets: `result.notAssessed` somt op wat er niet in zit (de
  scheurtoestand, de keuze van de laagdikten, verankering en detaillering, en zonder
  `core` de dwarskracht).
- `threeLayerBatch` doet hetzelfde voor een lijst punten met één doorsnede.

**`crackWidth`: de scheurwijdte volgens 7.3.4.** De aanroeper geeft de staalspanning in de
gescheurde doorsnede en de hoogte van de drukzone; de kern rekent h<sub>c,ef</sub>,
ρ<sub>p,eff</sub>, het rekverschil (7.9), s<sub>r,max</sub> ((7.11) met de bovengrens van
de Nederlandse nationale bijlage, of (7.14)) en w<sub>k</sub> (7.8).

- Invoer: `sigmaSMpa`, `widthMm`, `heightMm`, `effectiveDepthMm`, `neutralAxisMm`,
  `bondedReinforcementAreaMm2`, `coverToLongitudinalSteelMm`, `barOrTendonDiameterMm`,
  `spacingMm`, `fCkMpa`, `fCtEffMpa`, `eCmMpa`, `kT` (0,4 of 0,6), `k1`, `k2`, `wMaxMm`.
- Uitkomst: `result.crackWidthMm`, `maximumCrackSpacingMm`, `strainDifference`,
  `effectiveTensionHeightMm`, `effectiveReinforcementRatio`, `utilization`, `passes`.
- De belastingcombinatie kiest het blad. De Nederlandse nationale bijlage toetst de
  scheurwijdte van gewapend beton onder de frequente combinatie (bij 7.3.1(5), tabel 7.1N).

## Nagerekend

`scripts/check-kern-blok.mjs` legt de antwoorden van FEM Studio 2026.44.2 naast een
handberekening (uitgeschreven in de kop van het script):

- drielagenmodel, zuiver m<sub>x</sub> = 50 kNm/m in een plaat van 250 mm: z = 168 mm,
  A<sub>s</sub> = m/(z·f<sub>yd</sub>) = 684,5 mm²/m; met z = 0,9·d zou het 632,6 mm²/m
  zijn, het drielagenmodel vraagt 8,2 % meer;
- met een wringend moment (30, 20 en 10 kNm/m): onder 547,6 en 410,7 mm²/m, tegen 410,7 en
  273,8 zonder m<sub>xy</sub>; op een steunpunt (−40, −40 en 15 kNm/m) boven 753,0 mm²/m
  per richting, tegen 547,6 zonder;
- scheurwijdte, Ø12-150 bij σ<sub>s</sub> = 300 N/mm²: s<sub>r,max</sub> = 291,4 mm,
  ε<sub>sm</sub> − ε<sub>cm</sub> = 0,926 ‰, w<sub>k</sub> = 0,270 mm.

## Fysisch niet-lineair rekenen van een plaat

Nagegaan op de geïnstalleerde server 2026.44.2 en in de bron van FEM Studio 2026.46.0:
een plaat van gewapend beton met gescheurd beton en wapeningslagen rekent FEM Studio nog
niet.

- `solve_open_fem_3d` kent voor `analysis` alleen `linear` en `p-delta`, en rekent een
  model met platen alleen lineair; tweede orde met platen weigert het.
- `solve_native_fem` met `hybridPlate` kent een stijfheid die per element afneemt met de
  rek (`modulusCurves` met een `loadPath`). Dat is een opgegeven E(ε)-curve, isotroop en
  zonder wapening: geen scheurwet en geen gescheurde plaatstijfheid.
- `hybridPlateLayered` rekent alleen elastische lagen. De kern met vezellagen
  (`hybridPlateFiber`, nog niet in het schema van de tool genoemd) rekent staal met
  vloeien, en weigert beton met een scheurwet.
- `geometricShell` is geometrisch niet-lineair; de buiging blijft elastisch of volgt de
  E(ε)-curve.

Een blad dat de krachtsverdeling uit `@fem` haalt, rekent dus lineair-elastisch en hoort
dat te zeggen. Zie ook [fem-model.md](fem-model.md), "Wat FEM Studio nog niet kan".
