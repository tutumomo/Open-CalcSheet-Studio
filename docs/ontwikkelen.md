# Ontwikkelen

Lees voor de afspraken ook [overdracht.md](overdracht.md).

## Starten

```bash
npm ci
```

```bash
# Browser-preview starten (bouwt eerst de rekenkern)
npm run dev

# Rekenkern en frontend bouwen, inclusief TypeScript-controle
npm run build

# Native debugbuild zonder installatiepakket
npm run build:debug

# Desktop (Tauri) starten
npm run tauri:dev --workspace=@openaec/calcsheet-studio

# Rekenkern automatisch herbouwen tijdens wijzigingen
npm run dev --workspace=@ifc-calc/core

# Alle controles
npm run check
```

De browser-preview draait zonder Rust en is voor het rekenwerk zelf gelijkwaardig; alleen
bestandsdialogen, de opslag van instellingen en het Jupyter-blad werken daar niet.

## Benodigdheden

- **Node 24.** De controlescripts laden de `.ts`-bestanden rechtstreeks.
- **Rust**, via `rustup`, voor de desktop-app.
- **Op Windows** ook de Visual Studio Build Tools met de C++-werkbelasting en de Windows SDK:

```bash
winget install --id Rustlang.Rustup --exact
```

```bash
winget install --id Microsoft.VisualStudio.2022.BuildTools --exact --override "--quiet --wait --norestart --add Microsoft.VisualStudio.Workload.VCTools --includeRecommended"
```

Die tweede vraagt beheerdersrechten; draai hem vanuit een PowerShell die als administrator is
gestart, anders breekt hij af met code 1602.

- **Python 3.10 of nieuwer en internet**, eenmalig, om de Jupyter-omgeving te bouwen; zie
  [jupyter-blad.md](jupyter-blad.md).

## Optioneel: de OpenAEC-rapportengine

Afdrukken gaat standaard via de webview (voorblad, inhoudsopgave, elk blad op een pagina, met
tekeningen). De Rust-rapportengine van OpenAEC is optioneel en wordt niet meegebouwd, zodat dit
project op zichzelf bouwt:

```bash
npm run tauri build --workspace=@openaec/calcsheet-studio -- --features rapportengine
```

Zonder die vlag bestaan de engine-commando's wel, maar geven ze een melding dat de build ze
niet bevat. Zie [backlog.md](backlog.md) voor waarom die weg nu niet de standaard is.

## FEM Studio in CalcSheet

De normtoetsingen komen uit één bron: Open FEM Studio. CalcSheet levert de server
(`openaec-mcp-server`) mee en start hem headless bij de eerste aanroep. Ze praten MCP
over stdin/stdout. Het ontwerp staat in
[2026-11-07-toetsing-via-fem-studio-design.md](superpowers/specs/2026-11-07-toetsing-via-fem-studio-design.md).

- **Het proces en het protocol** staan in de crate `packages/desktop/src-tauri/fem-brug`.
  Die heeft geen Tauri, zodat de tests ook op Windows draaien. De commando's voor de
  webview staan in `src-tauri/src/fem_studio.rs`, en de webview roept ze aan via
  `src/rekenen/femStudio.ts`.
- **Waar de server staat**, in deze volgorde:
  1. `OCSS_FEM_SERVER`, om een eigen gebouwde server te proberen;
  2. de resource `src-tauri/fem-studio/`, die een release meelevert;
  3. alleen in een debug-build een geïnstalleerde FEM Studio, op Windows
     `%LOCALAPPDATA%\Open FEM Studio\openaec-mcp-server.exe`.

  Is er geen server, dan toont Instellingen › Over "niet meegeleverd".
- **Meeleveren.** `src-tauri/fem-studio/versie.json` pint de versie, per platform de
  server met zijn sha256, het bronarchief van precies die versie en de vermeldingen
  van derden. De server heet `openaec-mcp-server_<versie>_<platform>` (`windows-x64`
  met `.exe`, `macos-universal`, `linux-x64`), het bronarchief
  `openaec-mcp-server_<versie>_source.tar.gz`.
  - **De server valt onder de AGPL-3.0** en gaat nooit zonder zijn bron mee. De
    bestanden staan daarom in een openbare release van deze repository,
    `fem-server-<versie>`; de repository van FEM Studio zelf blijft privé.
  - `node scripts/pin-fem-server.mjs vJJJJ.W.N` haalt de bestanden uit de release van
    FEM Studio (`gh` met toegang tot die repository), controleert de sha256 tegen
    `SHA256SUMS` en toont wat er openbaar zou worden. Pas met `--publiceer` maakt het
    de release `fem-server-<versie>` en schrijft het `versie.json`.
  - `node scripts/haal-fem-server.mjs` haalt de server voor dit platform en de
    vermeldingen uit die openbare release, controleert de sha256 en schrijft
    `SOURCE.txt`. Daar is geen geheim voor nodig, ook niet in de workflows.
  - Zonder bestand voor het platform bouwt de app zonder server; de log waarschuwt en
    de release-tekst zegt het. Een server zonder bronarchief in `versie.json` laat
    de bouw falen.
  - De server gaat ongewijzigd mee als resource, met de handtekening van FEM Studio.
    De workflow controleert die vóór het bouwen, en de controles zoeken hem daarna in
    de installers, met de licentie, de vermeldingen en `SOURCE.txt` ernaast. Een
    release zet het bronarchief naast de installers. Zie
    [ondertekening.md](ondertekening.md#de-server-van-open-fem-studio).
- **Een nieuwe versie van FEM Studio meeleveren:** een release van FEM Studio met de
  losse servers en het bronarchief, dan `node scripts/pin-fem-server.mjs vJJJJ.W.N`
  (nalezen wat er openbaar wordt), daarna met `--publiceer`,
  `node scripts/haal-fem-server.mjs` en `node scripts/check-fem-server.mjs`, en
  `versie.json` committen. Een proefbouw met `build.yml` op de tak laat zien of hij
  meegaat en ondertekend is; de samenvatting van de run zegt het per platform.
- **Toetsen:**

  ```bash
  cargo test --manifest-path packages/desktop/src-tauri/fem-brug/Cargo.toml
  cargo test --manifest-path packages/desktop/src-tauri/fem-brug/Cargo.toml -- --ignored
  node scripts/check-fem-server.mjs
  ```

  De tweede regel gebruikt de echte server, uit `OCSS_FEM_SERVER` of de geïnstalleerde
  FEM Studio. Hij toetst `tools/list`, een opzoeking, een staaltoets, een geweigerde tool en
  een herstart na een gestopt proces.

## Opbouw

```
Open-CalcSheet-Studio/
├── library/                           # Voorbeelden, bij het opstarten opgehaald (library.md)
├── packages/
│   ├── core/                          # @ifc-calc/core: de rekenkern
│   │   └── src/
│   │       ├── parser.ts              # Regels, macro's, #include
│   │       ├── evaluator.ts           # Rekenen met mathjs
│   │       ├── ligger.ts              # Ligger op steunpunten (omhullende M/V)
│   │       ├── raamwerk.ts            # Vlakke raamwerken, knikfactor
│   │       ├── doorsnede.ts           # Samengestelde doorsneden
│   │       ├── ifc-generator.ts       # IFCX en IFC4x3 STEP
│   │       ├── latex.ts               # Formule naar LaTeX
│   │       ├── renderer.ts            # HTML (KaTeX, SVG)
│   │       ├── gef-parser.ts          # Sondering (GEF)
│   │       └── index.ts               # Openbare API
│   └── desktop/                       # @openaec/calcsheet-studio: de Tauri-app
│       ├── src/                       # React: lint, panelen, bladen
│       │   ├── templates/             # Rekenbladen (balklaag, ligger, tweepaalspoer, spanningen in een doorsnede)
│       │   └── store/                 # Project, bladsoorten, Library
│       └── src-tauri/                 # Rust-schil (Tauri 2)
├── scripts/                           # Controles (npm run check) en hulpscripts
└── docs/                              # Opbouw, toetsing, ontwerpen
```

## Beelden van de README

De beelden in `docs/images/readme/` komen uit de echte app, met een verzonnen project; zie de
kop van [`scripts/maak-readme-beelden.mjs`](../scripts/maak-readme-beelden.mjs). De README's
volgen de
[README-standaard](https://github.com/OpenAEC-Foundation/OpenAEC-Blueprint/blob/main/templates/README-standaard.md);
`scripts/check-readme.mjs` controleert de beelden en de opbouw.
