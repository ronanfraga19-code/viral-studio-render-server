@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Viral Studio Motor PC V3.1
start "Viral Studio Motor - Render" /min cmd /k "cd /d %~dp0 && node server.js"
timeout /t 2 >nul
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0TUNEL-AUTOMATICO.ps1"
