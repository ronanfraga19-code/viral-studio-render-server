@echo off
chcp 65001 >nul
title Viral Studio Render PC - Instalacao
cd /d "%~dp0"
echo === VIRAL STUDIO RENDER PC ===
where winget >nul 2>&1 || (echo Winget nao encontrado. Instale App Installer pela Microsoft Store.& pause & exit /b 1)
where node >nul 2>&1 || winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
where ffmpeg >nul 2>&1 || winget install Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
if not exist cloudflared.exe powershell -NoProfile -Command "Invoke-WebRequest -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile 'cloudflared.exe'"
call npm install
start "Viral Studio Motor" cmd /k "cd /d %~dp0 && node server.js"
timeout /t 3 >nul
echo.
echo Abrindo tunel seguro gratuito. COPIE a URL https://....trycloudflare.com que aparecer.
echo Cole essa URL no botao MOTOR PC do Viral Studio pelo celular.
echo.
cloudflared.exe tunnel --url http://localhost:10000
