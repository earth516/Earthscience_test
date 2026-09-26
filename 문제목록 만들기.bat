@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0make_manifest.ps1"
echo.
pause
