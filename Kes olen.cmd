@echo off
rem Kodulinna Maja - kelle nime all rakendus proovides avaneb.
rem Topeltklopsuga naeb valikuid.
chcp 65001 >nul
cd /d "%~dp0"

node tools\kesolen.js %*

echo.
echo   Vajuta klahvi, et aken sulgeda.
pause >nul
