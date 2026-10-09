# Build d'un APK de TEST installable (signé avec la clé de debug publique d'Android — jamais pour le Play Store).
# Il compile llama.rn (C++), passe par R8 et embarque le JS : c'est le vrai moteur, hors Expo Go.
# Usage (PowerShell, depuis mimai-app) :  .\scripts\build-test-apk.ps1
# Résultat : android\app\build\outputs\apk\release\app-release.apk
# Installation : brancher le téléphone (débogage USB) puis  adb install -r <apk>   ou copier l'APK sur le téléphone.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $root 'android')

$sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { "$env:LOCALAPPDATA\Android\Sdk" }
if (-not (Test-Path $sdk)) { throw "SDK Android introuvable : $sdk" }
$env:ANDROID_HOME = $sdk; $env:ANDROID_SDK_ROOT = $sdk

$env:MIMAI_UPLOAD_STORE_FILE = (Resolve-Path 'app\debug.keystore').Path
$env:MIMAI_UPLOAD_STORE_PASSWORD = 'android'
$env:MIMAI_UPLOAD_KEY_ALIAS = 'androiddebugkey'
$env:MIMAI_UPLOAD_KEY_PASSWORD = 'android'
$env:MIMAI_OVERLAY = '1'        # 1 = avec la bulle Mìmir (test) ; 0 = sans
$env:NODE_ENV = 'production'

# Gradle écrit des avertissements sur stderr : ne pas les traiter comme des erreurs fatales
$ErrorActionPreference = 'Continue'
.\gradlew.bat assembleRelease --no-daemon --console=plain
if ($LASTEXITCODE -ne 0) { throw "Build échoué (code $LASTEXITCODE)" }
Write-Host "APK : $((Resolve-Path 'app\build\outputs\apk\release\app-release.apk').Path)"
