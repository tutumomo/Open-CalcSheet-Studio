# FEM Studio

Hier komt de server van Open FEM Studio (`openaec-mcp-server`, op Windows met
`.exe`). CalcSheet start hem headless, als apart programma, voor de normtoetsingen
(`src/fem_studio.rs`, `fem-brug/`). Hij staat niet in git.

## Licentie en bron

De server valt onder de GNU AGPL-3.0, omdat hij een externe 3D-kern onder die licentie
meelinkt. CalcSheet zelf blijft LGPL-3.0. Wie de server krijgt, heeft recht op de
broncode van precies die versie. Daarom gaat hij nooit alleen mee:

| Bestand | Wat | Waar het vandaan komt |
| --- | --- | --- |
| `LICENSE-AGPL-3.0.txt` | de licentietekst | staat in git |
| `THIRD-PARTY-NOTICES.txt` | de vermeldingen van derden van deze versie | opgehaald, met sha256 |
| `SOURCE.txt` | welke versie het is en waar de bron staat | gemaakt uit `versie.json` |

Het bronarchief (`openaec-mcp-server_<versie>_source.tar.gz`) staat in de openbare
release `fem-server-<versie>` van deze repository, en bij elke release van CalcSheet
naast de installers. Instellingen › Over toont de licentie en de weg naar de bron.

## Ophalen

`versie.json` pint de versie, per platform de server met zijn sha256, het bronarchief
en de vermeldingen. De bestanden staan in de openbare release `fem-server-<versie>`;
`node scripts/pin-fem-server.mjs vJJJJ.W.N --publiceer` zet ze daar neer uit de release
van FEM Studio en vult `versie.json` (zonder `--publiceer` toont het alleen wat het zou
doen). `node scripts/haal-fem-server.mjs` haalt de server en de vermeldingen op en
controleert de sha256; een geheim is daar niet voor nodig. `tauri build` doet dat zelf
via `beforeBuildCommand` (`--als-nodig`). Zonder bestand voor het platform bouwt de app
gewoon. Instellingen › Over meldt dan "niet meegeleverd". Staat er wel een server in
`versie.json` maar geen bronarchief, dan stopt het script: zonder bron geen server.

De server gaat ongewijzigd mee, met de handtekening van FEM Studio; Tauri tekent
een resource niet. Zie `docs/ondertekening.md`.

In een debug-build gebruikt de app ook `OCSS_FEM_SERVER` of een geïnstalleerde
FEM Studio. Zie `docs/ontwikkelen.md`.

Deze LEESMIJ staat er zodat `fem-studio/*` in `bundle.resources` ook zonder
server iets vindt.
