# Controleert wat een Windows-gebruiker echt krijgt: elke installer in de map en,
# na een stille installatie, elk programma en elke DLL zoals die op schijf belanden.
# Faalt bij een ontbrekende, ongeldige of niet-getijdstempelde handtekening, bij een
# andere uitgever, en als WebView2Loader.dll niet is meegekomen.
#
# De server van Open FEM Studio (fem-studio\openaec-mcp-server.exe) is een resource:
# Tauri tekent hem niet, FEM Studio heeft hem al getekend, met dezelfde uitgever. Staat
# hij in de installatie, dan moet die handtekening kloppen. Ontbreekt hij, dan is dat
# een fout als FEM_STUDIO_VEREIST=true (de bouw had hem opgehaald), anders een
# waarschuwing: zonder server in fem-studio/versie.json bouwt de app bewust zonder.
# De server valt onder de AGPL-3.0 en gaat nooit alleen mee: naast hem moeten de
# licentie, de vermeldingen van derden en de verwijzing naar de bron staan.
#
# Gebruik: pwsh scripts/release/windows-controleren.ps1 -Map <map> -Aantal <installers>
#          pwsh scripts/release/windows-controleren.ps1 -Bestand <bestand>
# De tweede vorm controleert alleen dat bestand, met de eigen uitgever: de FEM-server
# voor het bouwen.
[CmdletBinding(DefaultParameterSetName = 'Map')]
param(
  [Parameter(Mandatory, ParameterSetName = 'Map')][string]$Map,
  [Parameter(Mandatory, ParameterSetName = 'Map')][int]$Aantal,
  [Parameter(Mandatory, ParameterSetName = 'Bestand')][string]$Bestand
)
$ErrorActionPreference = 'Stop'

# De uitgever op de eigen bestanden; WebView2Loader.dll komt van Microsoft zelf.
$Uitgever = 'CN=Impertio Studio B.V.'
$Microsoft = 'CN=Microsoft Corporation'
$Programma = 'open-calcsheet-studio.exe'
$FemServer = 'openaec-mcp-server.exe'

$script:signtool = Get-ChildItem 'C:\Program Files (x86)\Windows Kits\10\bin\*\x64\signtool.exe' |
  Where-Object { $_.Directory.Parent.Name -match '^\d+\.\d+\.\d+\.\d+$' } |
  Sort-Object { [version]($_.Directory.Parent.Name) } -Descending | Select-Object -First 1
if ($null -eq $script:signtool) { throw 'signtool.exe (x64) niet gevonden' }

$script:regels = [System.Collections.Generic.List[string]]::new()
$script:fouten = 0

function Test-Handtekening([string]$Label, [string]$Pad, [string[]]$Toegestaan) {
  if (-not (Test-Path -LiteralPath $Pad)) {
    $script:fouten++
    $script:regels.Add("| $Label | FOUT | bestand ontbreekt | | |")
    return
  }
  $sig = Get-AuthenticodeSignature -LiteralPath $Pad
  $ondertekenaar = if ($sig.SignerCertificate) { $sig.SignerCertificate.Subject -replace ',.*$', '' } else { 'geen' }
  $tijdstempel = if ($sig.TimeStamperCertificate) { $sig.TimeStamperCertificate.Subject -replace ',.*$', '' } else { 'geen' }
  # signtool meldt een fout op stderr; dat mag het script niet stoppen, de uitslag is de exitcode.
  $ErrorActionPreference = 'Continue'
  $uit = & $script:signtool.FullName verify /pa /v $Pad 2>&1 | Out-String
  $signtoolExit = $LASTEXITCODE
  $ErrorActionPreference = 'Stop'
  $goed = ($sig.Status -eq 'Valid') -and ($null -ne $sig.TimeStamperCertificate) -and
    ($signtoolExit -eq 0) -and ($Toegestaan -contains $ondertekenaar)
  if (-not $goed) {
    $script:fouten++
    Write-Host "::group::signtool verify /pa /v $Label"; Write-Host $uit; Write-Host '::endgroup::'
  }
  $script:regels.Add("| $Label | $(if ($goed) { 'OK' } else { 'FOUT' }) | $($sig.Status) | $ondertekenaar | $tijdstempel |")
}

function Schrijf-Samenvatting {
  $samenvatting = @('## Authenticode', '', '| bestand | uitkomst | status | ondertekenaar | tijdstempel |', '|---|---|---|---|---|') + $script:regels
  $samenvatting | Write-Host
  if ($env:GITHUB_STEP_SUMMARY) { $samenvatting -join "`n" | Add-Content -LiteralPath $env:GITHUB_STEP_SUMMARY -Encoding utf8 }
  if ($script:fouten -gt 0) { throw "$($script:fouten) bestand(en) zonder geldige handtekening met tijdstempel van de juiste uitgever" }
}

if ($PSCmdlet.ParameterSetName -eq 'Bestand') {
  Test-Handtekening (Split-Path -Leaf $Bestand) $Bestand @($Uitgever)
  Schrijf-Samenvatting
  Write-Host "Handtekening in orde: $Bestand"
  exit 0
}

$installers = @(Get-ChildItem -LiteralPath $Map -Filter '*-setup.exe' -File)
if ($installers.Count -ne $Aantal) {
  throw "verwachtte $Aantal installer(s) in $Map, vond er $($installers.Count): $(($installers | ForEach-Object Name) -join ', ')"
}
$msi = @(Get-ChildItem -LiteralPath $Map -Filter '*.msi' -File)
if ($msi.Count -gt 0) { throw "onverwacht MSI-bestand in ${Map}: $(($msi | ForEach-Object Name) -join ', ')" }

$tijdelijk = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }

foreach ($installer in $installers) {
  $foutenVoor = $script:fouten
  Test-Handtekening $installer.Name $installer.FullName @($Uitgever)
  # Een installer die de controle niet haalt, wordt niet gestart.
  if ($script:fouten -gt $foutenVoor) { continue }

  # /D= moet het laatste argument zijn, zonder aanhalingstekens.
  $doel = Join-Path $tijdelijk ("calc-installatie-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
  $installatie = Start-Process -FilePath $installer.FullName -ArgumentList @('/S', "/D=$doel") -PassThru
  $null = $installatie.Handle # zonder deze regel kan ExitCode leeg blijven
  if (-not $installatie.WaitForExit(600000)) {
    $installatie.Kill()
    throw "stil installeren duurde te lang: $($installer.Name)"
  }
  if ($installatie.ExitCode -ne 0) { throw "stil installeren faalde met exit $($installatie.ExitCode): $($installer.Name)" }

  try {
    $kort = $installer.Name -replace '^.*_(x64.*-setup)\.exe$', '$1'
    Test-Handtekening "$kort/$Programma" (Join-Path $doel $Programma) @($Uitgever)
    Test-Handtekening "$kort/uninstall.exe" (Join-Path $doel 'uninstall.exe') @($Uitgever)
    # Vaste eis: de loader moet mee, anders start de app niet op een schone Windows.
    Test-Handtekening "$kort/WebView2Loader.dll" (Join-Path $doel 'WebView2Loader.dll') @($Microsoft, $Uitgever)

    # De server van Open FEM Studio, als resource meegeleverd.
    $server = Join-Path (Join-Path $doel 'fem-studio') $FemServer
    if (Test-Path -LiteralPath $server) {
      Test-Handtekening "$kort/fem-studio/$FemServer" $server @($Uitgever)
      foreach ($naam in 'LICENSE-AGPL-3.0.txt', 'THIRD-PARTY-NOTICES.txt', 'SOURCE.txt') {
        $bijlage = Join-Path (Join-Path $doel 'fem-studio') $naam
        $aanwezig = (Test-Path -LiteralPath $bijlage) -and ((Get-Item -LiteralPath $bijlage).Length -gt 0)
        if ($aanwezig -and $naam -eq 'LICENSE-AGPL-3.0.txt') {
          $aanwezig = [bool](Select-String -LiteralPath $bijlage -SimpleMatch 'GNU AFFERO GENERAL PUBLIC LICENSE' -Quiet)
        }
        if ($aanwezig -and $naam -eq 'SOURCE.txt') {
          $aanwezig = [bool](Select-String -LiteralPath $bijlage -SimpleMatch '_source.tar.gz' -Quiet)
        }
        if ($aanwezig) {
          $script:regels.Add("| $kort/fem-studio/$naam | OK | naast de FEM-server | | |")
        } else {
          $script:fouten++
          $script:regels.Add("| $kort/fem-studio/$naam | FOUT | ontbreekt of klopt niet naast de FEM-server | | |")
        }
      }
    } elseif ($env:FEM_STUDIO_VEREIST -eq 'true') {
      $script:fouten++
      $script:regels.Add("| $kort/fem-studio/$FemServer | FOUT | ontbreekt, maar de bouw had hem opgehaald | | |")
    } else {
      Write-Host "::warning::FEM Studio is niet meegeleverd in $($installer.Name)"
      $script:regels.Add("| $kort/fem-studio/$FemServer | niet meegeleverd | | | |")
    }

    $bekend = @($Programma, 'uninstall.exe', 'WebView2Loader.dll', $FemServer)
    $overig = Get-ChildItem -LiteralPath $doel -Recurse -File -Include '*.exe', '*.dll' |
      Where-Object { $bekend -notcontains $_.Name }
    foreach ($bestand in $overig) {
      Test-Handtekening "$kort/$($bestand.Name)" $bestand.FullName @($Uitgever, $Microsoft)
    }
  } finally {
    # Opruimen; dit houdt de release niet tegen. _?= laat de uninstaller ter plekke
    # draaien in plaats van via een kopie, zodat hij echt klaar is voor de volgende.
    $verwijderaar = Join-Path $doel 'uninstall.exe'
    if (Test-Path -LiteralPath $verwijderaar) {
      $weg = Start-Process -FilePath $verwijderaar -ArgumentList @('/S', "_?=$doel") -PassThru
      $null = $weg.Handle
      if (-not $weg.WaitForExit(300000)) {
        $weg.Kill()
        Write-Host '::warning::stil verwijderen duurde te lang'
      } elseif ($weg.ExitCode -ne 0) {
        Write-Host "::warning::stil verwijderen gaf exit $($weg.ExitCode)"
      }
    }
    Remove-Item -LiteralPath $doel -Recurse -Force -ErrorAction SilentlyContinue
  }
}

Schrijf-Samenvatting
Write-Host 'Windows-handtekeningen in orde.'
