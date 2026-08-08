@echo off
rem Kodulinna Maja - kaivitamine. Topeltklopsuga.
chcp 65001 >nul
cd /d "%~dp0"

rem Kui server juba tootab, siis ei kaivita teist - avame lihtsalt brauseri.
netstat -ano | findstr /r /c:"LISTENING.*:3000 " >nul 2>&1
if not errorlevel 1 (
  echo.
  echo   Kodulinna Maja juba tootab.
  echo   Avan brauseri...
  echo.
  start "" "http://localhost:3000"
  timeout /t 3 >nul
  exit /b 0
)

echo.
echo   Kodulinna Maja kaivitub...
echo.

if not exist node_modules (
  echo   Esimene kord: paigaldan vajalikud osad. See voib votta minuti.
  call npm install --no-audit --no-fund
  echo.
)

start "" "http://localhost:3000"
node server.js

echo.
echo   Server peatus. Vajuta klahvi, et aken sulgeda.
pause >nul
