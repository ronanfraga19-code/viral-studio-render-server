@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Instalador Viral Studio Motor PC V3.1
 echo === VIRAL STUDIO MOTOR PC V3.1 - AUTOMATICO ===
where winget >nul 2>&1 || (echo Winget nao encontrado. Instale App Installer pela Microsoft Store.& pause & exit /b 1)
where node >nul 2>&1 || winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
where ffmpeg >nul 2>&1 || winget install Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
if not exist cloudflared.exe powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'cloudflared.exe'"
call npm install --omit=dev
powershell -NoProfile -Command "$s=(New-Object -COM WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Viral Studio Motor PC.lnk');$s.TargetPath='%~dp0INICIAR-MOTOR-PC.bat';$s.WorkingDirectory='%~dp0';$s.Save()"
echo.
echo Instalado. O Motor PC tambem iniciara automaticamente com o Windows.
echo O celular encontrara o PC automaticamente; nao precisa copiar URL.
echo.
call "%~dp0INICIAR-MOTOR-PC.bat"
