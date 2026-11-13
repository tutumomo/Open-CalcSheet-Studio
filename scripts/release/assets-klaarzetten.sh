#!/usr/bin/env bash
# Zet de artifacts van de bouw klaar als releasebestanden. Spaties worden punten, zoals
# GitHub dat bij het uploaden toch doet; zo kloppen de namen in SHA256SUMS.txt met de
# downloads. Faalt als er iets ontbreekt, te veel is of een ander versienummer draagt.
#
# Zit de server van Open FEM Studio in een installer (FEM_BRON_VEREIST=true), dan
# hoort het bronarchief van precies die server bij de release, met de sha256 uit
# fem-studio/versie.json: zonder bron geen binary (AGPL-3.0). Zonder server mag het
# er niet zijn.
# Gebruik: scripts/release/assets-klaarzetten.sh <artifact-map> <uitvoermap> <versie>
# Omgeving: FEM_BRON_VEREIST.
set -euo pipefail
BRON="${1:?map met artifacts ontbreekt}"
DOEL="${2:?uitvoermap ontbreekt}"
VERSIE="${3:?versie ontbreekt}"

mkdir -p "$DOEL"
shopt -s nullglob
for bestand in "$BRON"/*; do
  test -f "$bestand" || { echo "::error::onverwachte map in de artifacts: $bestand" >&2; exit 1; }
  cp "$bestand" "$DOEL/$(basename "$bestand" | tr ' ' '.')"
done

# Precies wat een release hoort te bevatten, niets meer en niets minder.
VERWACHT=(
  "_${VERSIE}_x64-setup.exe"
  "_${VERSIE}_x64_user-setup.exe"
  "_${VERSIE}_universal.dmg"
  "_${VERSIE}_amd64.deb"
  "_${VERSIE}_amd64.deb.asc"
  "_${VERSIE}_amd64.AppImage"
  "_${VERSIE}_amd64.AppImage.asc"
)
for einde in "${VERWACHT[@]}"; do
  GEVONDEN=("$DOEL"/*"$einde")
  test "${#GEVONDEN[@]}" -eq 1 || { echo "::error::verwachtte 1 bestand op *$einde, vond er ${#GEVONDEN[@]}" >&2; exit 1; }
done
test -f "$DOEL/openaec-release-key.asc" || { echo "::error::openaec-release-key.asc ontbreekt" >&2; exit 1; }

# Het bronarchief van de FEM-server: precies één als de server meegaat, anders geen.
VERSIE_JSON="$(cd "$(dirname "$0")/../.." && pwd)/packages/desktop/src-tauri/fem-studio/versie.json"
FEM_BRON=("$DOEL"/openaec-mcp-server_*_source.tar.gz)
EXTRA=0
if [ "${FEM_BRON_VEREIST:-false}" = true ]; then
  BRON_NAAM="$(node -p 'require(process.argv[1]).bron?.naam ?? ""' "$VERSIE_JSON")"
  BRON_SHA="$(node -p 'require(process.argv[1]).bron?.sha256?.toLowerCase() ?? ""' "$VERSIE_JSON")"
  test -n "$BRON_NAAM" && test -n "$BRON_SHA" || { echo "::error::de FEM-server gaat mee, maar versie.json heeft geen bronarchief" >&2; exit 1; }
  test -f "$DOEL/$BRON_NAAM" || { echo "::error::de FEM-server gaat mee, maar het bronarchief $BRON_NAAM ontbreekt" >&2; exit 1; }
  test "$(sha256sum "$DOEL/$BRON_NAAM" | cut -d' ' -f1)" = "$BRON_SHA" || { echo "::error::$BRON_NAAM heeft niet de sha256 uit versie.json" >&2; exit 1; }
  test "${#FEM_BRON[@]}" -eq 1 || { echo "::error::verwachtte één bronarchief van de FEM-server, vond er ${#FEM_BRON[@]}" >&2; exit 1; }
  EXTRA=1
elif [ "${#FEM_BRON[@]}" -ne 0 ]; then
  echo "::error::een bronarchief van de FEM-server, maar de server gaat in geen installer mee" >&2
  exit 1
fi

AANTAL="$(find "$DOEL" -maxdepth 1 -type f | wc -l)"
if [ "$AANTAL" -ne $((${#VERWACHT[@]} + 1 + EXTRA)) ]; then
  echo "::error::onverwachte bestanden tussen de artifacts:" >&2
  ls -1 "$DOEL" >&2
  exit 1
fi

# Eerst naar een tijdelijk bestand: anders telt de lijst zichzelf mee.
LIJST="$(mktemp)"
(
  cd "$DOEL"
  find . -maxdepth 1 -type f -printf '%f\0' | LC_ALL=C sort -z | xargs -0 sha256sum >"$LIJST"
)
mv "$LIJST" "$DOEL/SHA256SUMS.txt"
chmod 644 "$DOEL/SHA256SUMS.txt"
cat "$DOEL/SHA256SUMS.txt"
