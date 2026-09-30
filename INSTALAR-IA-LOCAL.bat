@echo off
chcp 65001 >nul
cd /d "%~dp0"
title Viral Studio - Instalar IA Local Gratuita
echo ==================================================
echo  VIRAL STUDIO - IA LOCAL GRATUITA
echo  Whisper + Ollama + Qwen 2.5 3B + FFmpeg
echo ==================================================
echo.
where winget >nul 2>&1 || (echo Winget nao encontrado. Instale App Installer pela Microsoft Store.& pause & exit /b 1)
where python >nul 2>&1 || winget install Python.Python.3.12 --accept-source-agreements --accept-package-agreements
where ollama >nul 2>&1 || winget install Ollama.Ollama --accept-source-agreements --accept-package-agreements
where ffmpeg >nul 2>&1 || winget install Gyan.FFmpeg --accept-source-agreements --accept-package-agreements
where node >nul 2>&1 || winget install OpenJS.NodeJS.LTS --accept-source-agreements --accept-package-agreements
echo.
echo Instalando transcricao local...
python -m pip install --upgrade pip
python -m pip install faster-whisper
echo.
echo Baixando o modelo de roteiro local. Isso acontece uma vez e pode demorar.
ollama pull qwen2.5:3b
call npm install --omit=dev
echo.
echo IA LOCAL INSTALADA. Nenhuma API paga e necessaria.
echo Na primeira transcricao, o Whisper baixara o modelo small automaticamente.
echo.
pause
