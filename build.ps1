param([switch]$NoBump)  # use -NoBump para NÃO subir a versão

# Gera os instaladores do Archivum (release) e copia o .exe pra raiz.
# Por padrão sobe a versão (patch) nos 3 arquivos antes de buildar.
# Uso:  .\build.ps1          (sobe versão e builda)
#       .\build.ps1 -NoBump  (builda sem mexer na versão)
$ErrorActionPreference = "Stop"

# 1) PATH: cargo + Node (NVS)
$cargoBin = "$env:USERPROFILE\.cargo\bin"
if (Test-Path $cargoBin) { $env:Path = "$cargoBin;$env:Path" }
$nvs = "$env:LOCALAPPDATA\nvs\nvs.ps1"
if (Test-Path $nvs) { & $nvs use 20 | Out-Null }

Set-Location $PSScriptRoot

# 2) Auto-bump da versão (patch) em package.json, tauri.conf.json e Cargo.toml
if (-not $NoBump) {
  $pkgPath   = Join-Path $PSScriptRoot "package.json"
  $confPath  = Join-Path $PSScriptRoot "src-tauri\tauri.conf.json"
  $cargoPath = Join-Path $PSScriptRoot "src-tauri\Cargo.toml"

  $pkg = Get-Content $pkgPath -Raw
  if ($pkg -match '"version"\s*:\s*"(\d+)\.(\d+)\.(\d+)"') {
    $old = "$($Matches[1]).$($Matches[2]).$($Matches[3])"
    $new = "$($Matches[1]).$($Matches[2]).$([int]$Matches[3] + 1)"
    Write-Host "Versao: $old -> $new" -ForegroundColor Yellow
    $esc = [regex]::Escape($old)

    $c = Get-Content $pkgPath -Raw
    $c = $c -replace ('"version"\s*:\s*"' + $esc + '"'), ('"version": "' + $new + '"')
    [IO.File]::WriteAllText($pkgPath, $c)

    $c = Get-Content $confPath -Raw
    $c = $c -replace ('"version"\s*:\s*"' + $esc + '"'), ('"version": "' + $new + '"')
    [IO.File]::WriteAllText($confPath, $c)

    $c = Get-Content $cargoPath -Raw
    $c = $c -replace ('version\s*=\s*"' + $esc + '"'), ('version = "' + $new + '"')
    [IO.File]::WriteAllText($cargoPath, $c)
  } else {
    Write-Host "Nao consegui ler a versao do package.json; pulando bump." -ForegroundColor Yellow
  }
}

# 3) Fecha o app se estiver aberto (evita lock no target/)
Get-Process archivum -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue

Write-Host "Compilando instaladores (release)... pode levar alguns minutos." -ForegroundColor Cyan
npm run tauri build
if ($LASTEXITCODE -ne 0) { Write-Host "Build falhou." -ForegroundColor Red; exit 1 }

# 4) Copia o instalador NSIS (1 arquivo .exe) pra raiz, com nome fácil
$nsisDir = Join-Path $PSScriptRoot "src-tauri\target\release\bundle\nsis"
$exe = Get-ChildItem $nsisDir -Filter *-setup.exe -ErrorAction SilentlyContinue |
  Sort-Object LastWriteTime -Descending | Select-Object -First 1
if ($exe) {
  $dest = Join-Path $PSScriptRoot "Archivum-Instalador.exe"
  Copy-Item $exe.FullName $dest -Force
  Write-Host "`nInstalador pronto:" -ForegroundColor Green
  Write-Host "  $dest"
  Write-Host "  (original NSIS: $($exe.FullName))"
  $msi = Get-ChildItem (Join-Path $PSScriptRoot 'src-tauri\target\release\bundle\msi') -Filter *.msi -ErrorAction SilentlyContinue |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
  if ($msi) { Write-Host "  (MSI alternativo: $($msi.FullName))" }
} else {
  Write-Host "Nao achei o .exe do NSIS." -ForegroundColor Yellow
}
