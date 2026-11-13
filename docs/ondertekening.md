# Versienummer, ondertekening en uitbrengen

## Versienummer

Het nummer is `JJJJ.W.N`: ISO-weekjaar, ISO-week zonder voorloopnul en een volgnummer
binnen de week dat bij 0 begint. Dus `2026.45.0`, `2026.45.1` en volgende week
`2026.46.0`. De git-tag en de release zijn hetzelfde nummer met een `v` ervoor.

```
node scripts/versie.mjs controleer             # alle velden gelijk?
node scripts/versie.mjs zet 2026.45.0          # overal zetten
node scripts/versie.mjs volgende               # het nummer van de volgende release
```

Het register in [`scripts/versie.mjs`](../scripts/versie.mjs) noemt alle velden:
beide `package.json`-bestanden, `tauri.conf.json`, `Cargo.toml`, de app-regel in
`Cargo.lock`, de twee werkruimteregels in `package-lock.json` en de versieregel in
`common.json` (nl en en). `check-versie.mjs` draait bij elke pull request en zakt als
ze uit elkaar lopen. De versies van afhankelijkheden, rekenbladen, modules en het
projectbestand hebben hun eigen levensloop en staan er bewust niet in.

Op Windows wordt alleen NSIS gebouwd. Een MSI accepteert als hoofdversie maximaal
255, dus `2026.x` past daar niet in; `check-uitlevering.mjs` zakt als `msi` in
`bundle.targets` komt.

## Een release uitbrengen

Twee manieren, allebei vanaf `main`:

- **Actions → Build and Release → Run workflow**, zonder invoer. De workflow kiest het
  volgende nummer, zet het overal, commit dat op `main` en bouwt die commit. Mislukt de
  release daarna, dan is het nummer nog vrij: de volgende poging gebruikt het opnieuw.
- **Een tag pushen.** Eerst `node scripts/versie.mjs zet JJJJ.W.N` en committen, dan
  `git tag vJJJJ.W.N` en pushen. Draagt de commit een ander nummer dan de tag, dan
  stopt de run voordat er iets gebouwd wordt.

De run bouwt en ondertekent op elk platform, zet alles als concept klaar, downloadt
het concept op elk platform en controleert dat, en publiceert pas daarna. Bestaat de
release al, dan stopt de run; een release wordt nooit vervangen. Bij een fout blijft
hooguit een concept staan, dat de volgende poging opruimt.

`nightly.yml` volgt dezelfde weg onder de tag `nightly`. De vorige nightly blijft
staan tot de nieuwe alle controles heeft gehaald. `build.yml` bouwt en ondertekent
hetzelfde maar publiceert niets; daarmee is de ondertekening op een eigen tak te
proberen, met *Run workflow* of `gh workflow run build.yml --ref <tak>`.

## Wat er ondertekend wordt

| Platform | Wat | Hoe | Controle |
|---|---|---|---|
| Windows | Programma, uninstaller, installers (per machine en per gebruiker) | Azure Artifact Signing via `bundle.windows.signCommand`, tijdens het bundelen; RFC 3161-tijdstempel | [`windows-controleren.ps1`](../scripts/release/windows-controleren.ps1): installers en, na een stille installatie, alle `.exe`- en `.dll`-bestanden. Geldig, met tijdstempel, juiste uitgever; `WebView2Loader.dll` moet aanwezig zijn en is van Microsoft zelf ondertekend |
| macOS | App en dmg | Developer ID, hardened runtime; notarisatie en ticket op app en dmg | [`macos-controleren.sh`](../scripts/release/macos-controleren.sh): de app uit de dmg met `codesign --verify --deep --strict`, Gatekeeper, `stapler validate`, team, tijdstempel, beide architecturen. Alleen ad-hoc ondertekend zakt |
| Linux | `.deb`, `.AppImage` | Losse OpenPGP-handtekening (`.asc`) met de OpenAEC-releasesleutel | [`linux-controleren.sh`](../scripts/release/linux-controleren.sh): in een lege sleutelring, tegen de vaste vingerafdruk |
| Alles | `SHA256SUMS.txt` over alle bestanden | Losse OpenPGP-handtekening | `sha256sum --check` op de downloads |

Een `.asc` is geen ingebedde handtekening in het `.deb`-pakket en geen controle van
Snap-winkelassertions; er worden geen Snap-pakketten uitgebracht. De app heeft geen
ingebouwde updater, dus er zijn geen minisign-handtekeningen en geen `latest.json`.

### De server van Open FEM Studio

De installers kunnen de headless server van Open FEM Studio meeleveren
(`fem-studio/openaec-mcp-server`, op Windows met `.exe`). Hij is een resource: Tauri
tekent een resource niet, en de server gaat ongewijzigd mee, met de handtekening uit
de release van FEM Studio. Zo blijft zijn sha256 die uit `fem-studio/versie.json`.

| Platform | Handtekening van FEM Studio | Controle |
|---|---|---|
| Windows | Authenticode met tijdstempel, dezelfde uitgever | `windows-controleren.ps1 -Bestand` vóór het bouwen, en na de stille installatie `fem-studio\openaec-mcp-server.exe` |
| macOS | Developer ID van hetzelfde team, hardened runtime, tijdstempel; de notarisatie van de app eist dat van elk programma erin, ook in `Contents/Resources` | `macos-controleren.sh --fem-server` vóór het bouwen, en de server in de app uit de dmg |
| Linux | Losse `.asc` in de release van FEM Studio; in de pakketten dekt de handtekening van het pakket hem | `linux-controleren.sh`: de server in de `.deb` en de `.AppImage`, uitvoerbaar; in de `.deb` met de sha256 uit `versie.json` |

Zonder bestand voor het platform in `versie.json` bouwt de app zonder server. De log
geeft dan een waarschuwing en de release-tekst zegt het. Is hij wel opgehaald, dan
zakt de controle als hij in de installer ontbreekt. Hoe een nieuwe versie erin komt:
zie [ontwikkelen.md](ontwikkelen.md#fem-studio-in-calcsheet).

#### Licentie en broncode van de server

De server valt onder de GNU AGPL-3.0, omdat hij een externe 3D-kern onder die licentie
meelinkt. CalcSheet start hem als apart programma en praat ermee via stdin en stdout;
CalcSheet zelf is LGPL-3.0. Wie de server krijgt, heeft recht op de broncode van
precies die versie. Daarom gaat hij nooit alleen mee:

| Wat | Waar | Controle |
|---|---|---|
| De licentietekst, `LICENSE-AGPL-3.0.txt` | in de installer, naast de server | de drie controlescripts, na het uitpakken of installeren |
| De vermeldingen van derden, `THIRD-PARTY-NOTICES.txt` | in de installer, naast de server | idem; op Linux ook de sha256 uit `versie.json` |
| Welke versie het is en waar de bron staat, `SOURCE.txt` | in de installer, naast de server, en in Instellingen › Over | idem; hij moet het bronarchief noemen |
| Het bronarchief, `openaec-mcp-server_<versie>_source.tar.gz` | bij de release, naast de installers, en blijvend in de release `fem-server-<versie>` | `assets-klaarzetten.sh` en `linux-controleren.sh`: aanwezig, met de sha256 uit `versie.json`; `SHA256SUMS.txt` dekt het |

De servers, het bronarchief en de vermeldingen staan in een openbare release van deze
repository, `fem-server-<versie>`. Die maakt `scripts/pin-fem-server.mjs --publiceer`,
lokaal, uit de release van FEM Studio. De workflows halen ze daar op zonder geheim.
Een server in `versie.json` zonder bronarchief en vermeldingen laat de bouw falen.

Dit is geen juridisch advies. Een jurist moet nog bevestigen dat CalcSheet en de
server, als aparte programma's, een samenvoeging zijn waarin CalcSheet zijn eigen
licentie houdt, en dat het bronarchief als bijbehorende broncode volstaat.

Er zijn geen eigen entitlements: de app gebruikt de hardened runtime zonder
uitzonderingen. Heeft een nieuwe functie er een nodig, dan hoort die in
`bundle.macOS.entitlements`; de controle toont welke rechten de app krijgt.

## Zelf controleren

De vertrouwde vingerafdruk van de OpenAEC-releasesleutel, ook in
[`openaec-vingerafdruk.txt`](../scripts/release/openaec-vingerafdruk.txt):

```
13F6D414ADEE4ED4CD09AC60601D86C93C504D29
```

```bash
# Linux en de checksums
gpg --show-keys openaec-release-key.asc          # moet de vingerafdruk hierboven tonen
gpg --import openaec-release-key.asc
gpg --verify SHA256SUMS.txt.asc SHA256SUMS.txt
gpg --verify Open.CalcSheet.Studio_*_amd64.deb.asc Open.CalcSheet.Studio_*_amd64.deb
sha256sum --check --ignore-missing SHA256SUMS.txt

# macOS
xcrun stapler validate Open.CalcSheet.Studio_*_universal.dmg
spctl --assess --type open --context context:primary-signature --verbose=4 Open.CalcSheet.Studio_*_universal.dmg
```

```powershell
# Windows; de uitgever is Impertio Studio B.V.
Get-AuthenticodeSignature .\Open.CalcSheet.Studio_*_x64-setup.exe | Format-List Status, SignerCertificate, TimeStamperCertificate
```

## Geheimen

Alles staat als organisatiegeheim op `OpenAEC-Foundation`, met zichtbaarheid
*selected*; deze repo moet in de lijst staan. Controleren, alleen namen:

```bash
gh api repos/OpenAEC-Foundation/Open-CalcSheet-Studio/actions/organization-secrets --jq '.secrets[].name'
```

| Wat | Geheimen |
|---|---|
| Windows | `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, `AZURE_ENDPOINT`, `AZURE_TRUSTED_SIGNING_ACCOUNT_NAME`, `AZURE_CERTIFICATE_PROFILE_NAME` |
| macOS | `APPLE_CERTIFICATE`, `APPLE_CERTIFICATE_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `APPLE_TEAM_ID`, `APPLE_API_ISSUER`, `APPLE_API_KEY`, `APPLE_API_KEY_CONTENT` |
| Linux en checksums | `OPENAEC_GPG_PRIVATE_KEY`, `OPENAEC_GPG_PASSPHRASE`, en de variabele `OPENAEC_GPG_FINGERPRINT` |

De server van FEM Studio vraagt geen geheim: hij staat met zijn bron in een openbare
release van deze repository.

Ontbreekt er een, of is hij verlopen, dan faalt de bouw met de naam van het geheim
in de melding en blijft de vorige release of nightly staan. Waarden komen nooit in een
log. De releasesleutel verloopt op 25-10-2028; daarna zakt de controle. Wordt hij
vervangen, pas dan ook `openaec-vingerafdruk.txt` en de teksten in `release.yml` en
`nightly.yml` aan; `check-uitlevering.mjs` bewaakt dat ze gelijk zijn.
