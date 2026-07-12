# Sobe o Archivum em modo dev resolvendo PATH automaticamente.
# Uso:  .\dev.ps1     (no PowerShell, na raiz do projeto)
$ErrorActionPreference = "Stop"

# 1) cargo no PATH
$cargoBin = "$env:USERPROFILE\.cargo\bin"
if (Test-Path $cargoBin) { $env:Path = "$cargoBin;$env:Path" }

# 2) Node via NVS (se existir)
$nvs = "$env:LOCALAPPDATA\nvs\nvs.ps1"
if (Test-Path $nvs) { & $nvs use 20 | Out-Null }

Set-Location $PSScriptRoot
Write-Host "cargo: $((Get-Command cargo).Source)" -ForegroundColor DarkGray
Write-Host "node:  $(node -v)" -ForegroundColor DarkGray
Write-Host "Subindo Archivum (tauri dev)..." -ForegroundColor Cyan
npm run tauri dev
