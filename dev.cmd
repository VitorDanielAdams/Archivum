@echo off
REM Sobe o Archivum em modo dev resolvendo PATH automaticamente.
REM Uso: dev   (no cmd, na raiz do projeto) ou duplo-clique.
setlocal
set "PATH=%USERPROFILE%\.cargo\bin;%PATH%"
if exist "%LOCALAPPDATA%\nvs\nvs.cmd" call "%LOCALAPPDATA%\nvs\nvs.cmd" use 20
cd /d "%~dp0"
echo Subindo Archivum (tauri dev)...
call npm run tauri dev
