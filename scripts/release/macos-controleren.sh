#!/usr/bin/env bash
# Controleert wat een macOS-gebruiker echt krijgt: de dmg en de app die erin zit.
# Handtekening, Developer ID van het juiste team, hardened runtime, tijdstempel,
# beide processorarchitecturen, Gatekeeper en een vastgeniet notarisatieticket.
# Ad-hoc ondertekend is dus niet genoeg.
#
# De server van Open FEM Studio (Contents/Resources/fem-studio/openaec-mcp-server) is
# een resource: Tauri tekent hem niet, maar de notarisatie eist dat elk programma in
# de app een Developer ID-handtekening met hardened runtime en tijdstempel heeft.
# FEM Studio levert hem zo aan; dit script controleert dat, ook vóór het bouwen
# (--fem-server). Ontbreekt hij in de app, dan is dat een fout als
# FEM_STUDIO_VEREIST=true (de bouw had hem opgehaald), anders een waarschuwing.
# De server valt onder de AGPL-3.0 en gaat nooit alleen mee: naast hem moeten de
# licentie, de vermeldingen van derden en de verwijzing naar de bron staan.
#
# Gebruik: scripts/release/macos-controleren.sh <map-met-dmg>
#          scripts/release/macos-controleren.sh --fem-server <bestand>
# Omgeving: APPLE_TEAM_ID; FEM_STUDIO_VEREIST.
set -euo pipefail
: "${APPLE_TEAM_ID:?geheim APPLE_TEAM_ID ontbreekt}"

# Developer ID van het eigen team, hardened runtime, tijdstempel en beide
# architecturen. Zet FEM_ARCHS.
controleer_fem_server() {
  local pad="$1" gegevens
  test -f "$pad" || { echo "::error::de FEM-server ontbreekt: $pad" >&2; exit 1; }
  test -x "$pad" || { echo "::error::de FEM-server is niet uitvoerbaar: $pad" >&2; exit 1; }
  codesign --verify --strict --verbose=2 "$pad"
  gegevens="$(codesign -dv --verbose=4 "$pad" 2>&1)"
  echo "$gegevens" | grep -E '^(Authority|TeamIdentifier|Timestamp)=|flags=' || true
  grep -q '^Authority=Developer ID Application' <<<"$gegevens" || { echo "::error::de FEM-server is niet met een Developer ID ondertekend" >&2; exit 1; }
  grep -q "^TeamIdentifier=${APPLE_TEAM_ID}\$" <<<"$gegevens" || { echo "::error::de FEM-server is door een ander team ondertekend" >&2; exit 1; }
  grep -q '^Timestamp=' <<<"$gegevens" || { echo "::error::de FEM-server heeft geen beveiligde tijdstempel" >&2; exit 1; }
  grep -Eq 'flags=0x[0-9a-f]+\([^)]*runtime[^)]*\)' <<<"$gegevens" || { echo "::error::de FEM-server heeft geen hardened runtime" >&2; exit 1; }
  FEM_ARCHS="$(lipo -archs "$pad")"
  for arch in x86_64 arm64; do
    grep -qw "$arch" <<<"$FEM_ARCHS" || { echo "::error::$arch ontbreekt in de FEM-server" >&2; exit 1; }
  done
}

if [ "${1:-}" = "--fem-server" ]; then
  controleer_fem_server "${2:?bestand ontbreekt}"
  echo "FEM-server in orde: Developer ID, hardened runtime, tijdstempel ($FEM_ARCHS)."
  exit 0
fi

MAP="${1:?map met de dmg ontbreekt}"

shopt -s nullglob
DMGS=("$MAP"/*.dmg)
test "${#DMGS[@]}" -eq 1 || { echo "::error::verwachtte 1 dmg in $MAP, vond er ${#DMGS[@]}" >&2; exit 1; }
DMG="${DMGS[0]}"
echo "dmg: $DMG"

codesign --verify --strict --verbose=2 "$DMG"
UITSLAG_DMG="$(spctl --assess --type open --context context:primary-signature --verbose=4 "$DMG" 2>&1)" \
  || { echo "$UITSLAG_DMG" >&2; echo "::error::Gatekeeper weigert de dmg" >&2; exit 1; }
echo "$UITSLAG_DMG"
grep -q 'source=Notarized Developer ID' <<<"$UITSLAG_DMG" || { echo "::error::dmg is niet genotariseerd" >&2; exit 1; }
xcrun stapler validate "$DMG"

KOPPEL="$(mktemp -d)"
WERK="${RUNNER_TEMP:-$(mktemp -d)}/calc-app-controle"
opruimen() {
  hdiutil detach "$KOPPEL" >/dev/null 2>&1 || true
  rm -rf "$KOPPEL" "$WERK"
}
trap opruimen EXIT
hdiutil attach -nobrowse -readonly -mountpoint "$KOPPEL" "$DMG" >/dev/null
APPS=("$KOPPEL"/*.app)
test "${#APPS[@]}" -eq 1 || { echo "::error::verwachtte 1 app in de dmg, vond er ${#APPS[@]}" >&2; exit 1; }
mkdir -p "$WERK"
APP="$WERK/$(basename "${APPS[0]}")"
ditto "${APPS[0]}" "$APP"
hdiutil detach "$KOPPEL" >/dev/null

codesign --verify --deep --strict --verbose=2 "$APP"

GEGEVENS="$(codesign -dv --verbose=4 "$APP" 2>&1)"
echo "$GEGEVENS" | grep -E '^(Authority|TeamIdentifier|Timestamp|flags)=|flags=' || true
grep -q '^Authority=Developer ID Application' <<<"$GEGEVENS" || { echo "::error::app is niet met een Developer ID ondertekend" >&2; exit 1; }
grep -q "^TeamIdentifier=${APPLE_TEAM_ID}\$" <<<"$GEGEVENS" || { echo "::error::app is door een ander team ondertekend" >&2; exit 1; }
grep -q '^Timestamp=' <<<"$GEGEVENS" || { echo "::error::app heeft geen beveiligde tijdstempel" >&2; exit 1; }
grep -Eq 'flags=0x[0-9a-f]+\([^)]*runtime[^)]*\)' <<<"$GEGEVENS" || { echo "::error::app heeft geen hardened runtime" >&2; exit 1; }

UITSLAG_APP="$(spctl --assess --type execute --verbose=4 "$APP" 2>&1)" \
  || { echo "$UITSLAG_APP" >&2; echo "::error::Gatekeeper weigert de app" >&2; exit 1; }
echo "$UITSLAG_APP"
grep -q 'source=Notarized Developer ID' <<<"$UITSLAG_APP" || { echo "::error::app is niet genotariseerd" >&2; exit 1; }
xcrun stapler validate "$APP"

BINAIR="$APP/Contents/MacOS/$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$APP/Contents/Info.plist")"
ARCHS="$(lipo -archs "$BINAIR")"
echo "architecturen: $ARCHS"
for arch in x86_64 arm64; do
  grep -qw "$arch" <<<"$ARCHS" || { echo "::error::$arch ontbreekt in het programma" >&2; exit 1; }
done

echo "rechten (entitlements) van de app:"
codesign -d --entitlements - "$APP" 2>/dev/null || true

FEM_SERVER="$APP/Contents/Resources/fem-studio/openaec-mcp-server"
if [ -f "$FEM_SERVER" ]; then
  controleer_fem_server "$FEM_SERVER"
  for naam in LICENSE-AGPL-3.0.txt THIRD-PARTY-NOTICES.txt SOURCE.txt; do
    test -s "$(dirname "$FEM_SERVER")/$naam" || { echo "::error::$naam ontbreekt naast de FEM-server in de app" >&2; exit 1; }
  done
  grep -q 'GNU AFFERO GENERAL PUBLIC LICENSE' "$(dirname "$FEM_SERVER")/LICENSE-AGPL-3.0.txt" \
    || { echo "::error::LICENSE-AGPL-3.0.txt in de app is niet de AGPL" >&2; exit 1; }
  grep -q '_source\.tar\.gz' "$(dirname "$FEM_SERVER")/SOURCE.txt" \
    || { echo "::error::SOURCE.txt in de app noemt het bronarchief niet" >&2; exit 1; }
  FEM_REGEL="- \`fem-studio/openaec-mcp-server\`: Developer ID, hardened runtime, tijdstempel ($FEM_ARCHS); licentie, vermeldingen en verwijzing naar de bron ernaast"
elif [ "${FEM_STUDIO_VEREIST:-false}" = true ]; then
  echo "::error::FEM Studio ontbreekt in de app, maar de bouw had hem opgehaald" >&2
  exit 1
else
  echo "::warning::FEM Studio is niet meegeleverd in de app"
  FEM_REGEL="- FEM Studio: niet meegeleverd"
fi

if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  {
    echo "## macOS"
    echo
    echo "- \`$(basename "$DMG")\`: Developer ID, genotariseerd, ticket vastgeniet"
    echo "- \`$(basename "$APP")\`: Developer ID, hardened runtime, genotariseerd, ticket vastgeniet ($ARCHS)"
    echo "$FEM_REGEL"
  } >>"$GITHUB_STEP_SUMMARY"
fi
echo "macOS-handtekening en notarisatie in orde (dmg en app)."
