@echo off
rem Kodulinna Maja - ava majutatud rakendus ja logi kohe sisse.
rem Topeltklopsuga. Uut linki ei pea kaest kaide andma.
chcp 65001 >nul
cd /d "%~dp0"

node tools\ava.js %*

if errorlevel 1 (
  echo.
  echo   Midagi laks viltu. Vajuta klahvi, et aken sulgeda.
  pause >nul
)
