@echo off
rem Kodulinna Maja - varukoopia kogu andmebaasist uhte faili.
rem Topeltklopsuga. Fail laheb kausta varukoopiad\.
chcp 65001 >nul
cd /d "%~dp0"

node tools\varukoopia.js %*

echo.
echo   Vajuta klahvi, et aken sulgeda.
pause >nul
