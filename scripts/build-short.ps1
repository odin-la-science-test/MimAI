# Build Android depuis un dossier COURT (C:\mm) : evite la limite de 260 caracteres de Windows,
# qui fait echouer CMake/Ninja (llama.rn, quick-crypto) quand le projet est sur le Bureau.
# NB : fichier volontairement en ASCII (PowerShell 5.1 lit mal l'UTF-8 sans BOM).
#
# Usage (PowerShell, hors Claude) :
#   .\scripts\build-short.ps1 -Target apk                 # APK de test par cable (cle de debug, AVEC la bulle), RAPIDE
#   .\scripts\build-short.ps1 -Target apk -Install        # idem, puis installe sur le telephone branche en USB
#   .\scripts\build-short.ps1 -Target apk -Install -Reinstall   # idem, en desinstallant d'abord l'ancienne version (EFFACE ses donnees)
#   .\scripts\build-short.ps1 -Target apk -Strict         # APK avec R8 + lint comme en production (plus lent)
#   .\scripts\build-short.ps1 -Target aab                 # AAB Google Play, SANS la bulle
#   .\scripts\build-short.ps1 -Target aab-bubble          # AAB Google Play AVEC la bulle (declarations Play obligatoires)
#
# Pour les AAB, definir avant : MIMAI_UPLOAD_STORE_FILE / _STORE_PASSWORD / _KEY_ALIAS / _KEY_PASSWORD.
# Rapidite : le projet Android n'est regenere (prebuild) QUE si le natif a change ; sinon seul Gradle tourne.
param(
  [ValidateSet('apk', 'aab', 'aab-bubble')][string]$Target = 'apk',
  [string]$Short = 'C:\mm',
  [int]$Workers = 2,
  [switch]$Install, [switch]$Reinstall, [switch]$Strict
)
$ErrorActionPreference = 'Stop'
$src = Split-Path -Parent $PSScriptRoot
# quoi qu'il arrive, on rend sa console au dossier du projet : une console laissee dans C:\mm\android verrouillerait ce dossier
trap { Set-Location $src; break }

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
if (-not (Test-Path $sdk)) { throw "SDK Android introuvable : $sdk" }
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk

# 1/4 copie. IMPORTANT : on exclut par CHEMIN COMPLET. Exclure le simple nom "android" excluait aussi
# modules\mimir-overlay\android (le code natif de la bulle) : il n'etait alors jamais compile.
Write-Host "1/4 Copie du code vers $Short"
robocopy $src $Short /E /XD "$src\node_modules" "$src\android" "$src\.gradle" "$src\.expo" "$src\.git" /XF *.aab *.apk build*.log /NFL /NDL /NJH /NJS | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy a echoue (code $LASTEXITCODE)" }
if (-not (Test-Path "$Short\modules\mimir-overlay\android\src\main\java\fr\mimai\app\overlay\MimirOverlayService.kt")) {
  throw "Le module natif de la bulle n'a pas ete copie vers $Short (modules\mimir-overlay\android manquant)."
}

Set-Location $Short
# npm ci au premier lancement ET a chaque changement de package-lock.json (nouvelle dependance)
$lockHash = (Get-FileHash "$Short\package-lock.json" -Algorithm SHA256).Hash
$lockStamp = "$Short\.lockhash"
$oldLock = if (Test-Path $lockStamp) { (Get-Content $lockStamp -Raw).Trim() } else { '' }
if (-not (Test-Path "$Short\node_modules") -or $lockHash -ne $oldLock) {
  Write-Host "2/4 npm ci (premier lancement ou dependances modifiees)"
  npm ci
  if ($LASTEXITCODE -ne 0) { npm ci --legacy-peer-deps }
  if ($LASTEXITCODE -ne 0) { throw 'npm ci a echoue' }
  Set-Content -Path $lockStamp -Value $lockHash -Encoding ASCII
} else {
  Write-Host "2/4 dependances a jour"
}

if ($Target -ne 'apk') {
  foreach ($k in 'MIMAI_UPLOAD_STORE_FILE', 'MIMAI_UPLOAD_STORE_PASSWORD', 'MIMAI_UPLOAD_KEY_ALIAS', 'MIMAI_UPLOAD_KEY_PASSWORD') {
    if (-not (Get-Item "env:$k" -ErrorAction SilentlyContinue)) { throw "Variable manquante : $k" }
  }
  $env:MIMAI_OVERLAY = $(if ($Target -eq 'aab-bubble') { '1' } else { '0' })
  $task = 'bundleRelease'
} else {
  $env:MIMAI_UPLOAD_STORE_PASSWORD = 'android'
  $env:MIMAI_UPLOAD_KEY_ALIAS = 'androiddebugkey'
  $env:MIMAI_UPLOAD_KEY_PASSWORD = 'android'
  $env:MIMAI_OVERLAY = '1'
  $task = 'assembleRelease'
}
$env:NODE_ENV = 'production'

# 3/4 prebuild seulement si le NATIF a change (dependances, app.json, plugins, modules natifs, cible/bulle)
function Get-NativeHash {
  $files = @("$Short\package-lock.json", "$Short\app.json")
  $sb = New-Object System.Text.StringBuilder
  # plugins : leur contenu change le projet Android genere
  if (Test-Path "$Short\plugins") { $files += (Get-ChildItem "$Short\plugins" -Recurse -File | Sort-Object FullName | ForEach-Object { $_.FullName }) }
  # modules natifs locaux : seule leur STRUCTURE compte pour le prebuild (liste des fichiers, build.gradle, expo-module.config.json).
  # Le code Kotlin / le manifeste d'un module est recompile par Gradle sans regenerer le projet : corriger une erreur ne relance donc pas tout.
  if (Test-Path "$Short\modules") {
    $mod = Get-ChildItem "$Short\modules" -Recurse -File | Where-Object { $_.FullName -notmatch '\\(build|\.cxx)\\' } | Sort-Object FullName
    foreach ($m in $mod) {
      [void]$sb.Append($m.FullName.Substring($Short.Length))
      if ($m.Name -in 'build.gradle', 'expo-module.config.json') { $files += $m.FullName }
    }
  }
  foreach ($f in $files) { if (Test-Path $f) { [void]$sb.Append((Get-FileHash $f -Algorithm SHA256).Hash) } }
  # la cible (apk ou aab) ne change pas le projet genere : seul le drapeau de la barre compte
  [void]$sb.Append("|overlay=$env:MIMAI_OVERLAY")
  $sha = New-Object System.Security.Cryptography.SHA256Managed
  return [BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($sb.ToString())))
}
$nativeStamp = "$Short\.nativehash"
$nativeHash = Get-NativeHash
$oldNative = if (Test-Path $nativeStamp) { (Get-Content $nativeStamp -Raw).Trim() } else { '' }
if (-not (Test-Path "$Short\android\app\build.gradle") -or $nativeHash -ne $oldNative) {
  Write-Host "3/4 Generation du projet Android (prebuild) - le natif a change"
  # libere tout verrou sur C:\mm\android : le demon Gradle du build precedent reste actif en arriere-plan
  # PowerShell 5.1 traite le moindre message d'erreur d'un programme comme fatal sous 'Stop' : on rend ces appels silencieux et non bloquants
  function Invoke-Quiet([scriptblock]$Block) {
    $old = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try { & $Block *> $null } catch { } finally { $ErrorActionPreference = $old }
  }
  if (Test-Path "$Short\android\gradlew.bat") {
    Push-Location "$Short\android"
    Invoke-Quiet { .\gradlew.bat --stop }
    Pop-Location
  }
  # le serveur adb demarre depuis ce dossier garde C:\mm\android comme dossier courant : on l'arrete
  $adbExe = Join-Path $sdk 'platform-tools\adb.exe'
  if (Test-Path $adbExe) { Invoke-Quiet { & $adbExe kill-server } }
  Get-CimInstance Win32_Process -Filter "Name='java.exe'" -ErrorAction SilentlyContinue |
    Where-Object { $_.CommandLine -match 'GradleDaemon|KotlinCompileDaemon|gradle-launcher|kotlin-compiler' } |
    ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
  Set-Location $Short
  if (Test-Path "$Short\android") {
    $gone = $false
    for ($i = 0; $i -lt 6 -and -not $gone; $i++) {
      try { Remove-Item "$Short\android" -Recurse -Force -ErrorAction Stop; $gone = $true }
      catch { Start-Sleep -Seconds 3 }
    }
    if (-not $gone -and (Test-Path "$Short\android")) {
      throw "C:\mm\android est verrouille : fermez les consoles PowerShell, fenetres de l'Explorateur et VS Code ouverts dans ce dossier (ou redemarrez le PC), puis relancez."
    }
  }
  npx expo prebuild -p android --no-install
  if ($LASTEXITCODE -ne 0) { throw 'prebuild a echoue' }
  Set-Content -Path $nativeStamp -Value $nativeHash -Encoding ASCII
} else {
  Write-Host "3/4 Natif inchange : prebuild saute (gain de plusieurs minutes)"
}
if ($Target -eq 'apk') { $env:MIMAI_UPLOAD_STORE_FILE = "$Short\android\app\debug.keystore" }

Write-Host "4/4 Compilation ($task) - arm64 uniquement, $Workers taches en parallele"
Set-Location "$Short\android"
$ErrorActionPreference = 'Continue'
$gArgs = @($task, '--console=plain', "--max-workers=$Workers", '-PreactNativeArchitectures=arm64-v8a')
if ($Target -eq 'apk' -and -not $Strict) {
  # APK de test : on saute lint et R8 (plusieurs minutes). Le vrai AAB, lui, passe par R8 et lint.
  $gArgs += @('-x', 'lintVitalRelease', '-x', 'lintVitalAnalyzeRelease', '-x', 'lintVitalReportRelease',
              '-Pandroid.enableMinifyInReleaseBuilds=false', '-Pandroid.enableShrinkResourcesInReleaseBuilds=false')
  Write-Host "(mode rapide : sans R8 ni lint ; ajoutez -Strict pour le comportement de production)"
}
# NE JAMAIS ajouter -Pandroid.injected.build.abi : AGP marque alors le bundle testOnly et Play le refuse.
.\gradlew.bat @gArgs *> "$Short\build.log"
if ($LASTEXITCODE -ne 0) {
  Get-Content "$Short\build.log" -Tail 40
  throw "Build echoue - voir $Short\build.log"
}

if ($Target -ne 'apk') { $out = "$Short\android\app\build\outputs\bundle\release\app-release.aab" }
else { $out = "$Short\android\app\build\outputs\apk\release\app-release.apk" }
Write-Host "OK : $out"
Copy-Item $out (Join-Path $src (Split-Path $out -Leaf)) -Force
Write-Host ("Copie dans le projet : " + (Join-Path $src (Split-Path $out -Leaf)))

if ($Target -eq 'apk' -and $Install) {
  $adb = Join-Path $sdk 'platform-tools\adb.exe'
  if (-not (Test-Path $adb)) { throw "adb introuvable : $adb" }
  $apk = Join-Path $src 'app-release.apk'
  # adb demarre un serveur qui herite du dossier courant : on le lance depuis le dossier du projet, jamais depuis C:\mm\android
  Set-Location $src
  Write-Host 'Telephones detectes :'
  & $adb devices
  if ($Reinstall) {
    Write-Host 'Desinstallation de l ancienne version (donnees locales effacees)'
    & $adb uninstall fr.mimai.app | Out-Null
  }
  & $adb install -r $apk
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Installation refusee. Si le message parle de signature (UPDATE_INCOMPATIBLE), relance avec -Reinstall.'
  } else {
    # pre-autorise la bulle et les notifications pour le test (equivaut a cocher les reglages Android)
    & $adb shell appops set fr.mimai.app SYSTEM_ALERT_WINDOW allow
    & $adb shell pm grant fr.mimai.app android.permission.POST_NOTIFICATIONS 2>$null
    Write-Host 'Installe. Ouvre MiMai > Compagnon > Afficher Mimir par-dessus les autres applis.'
    Write-Host 'Si la bulle n apparait pas, lis le journal : adb logcat -s MiMaiOverlay:V AndroidRuntime:E'
  }
}

Set-Location $src
