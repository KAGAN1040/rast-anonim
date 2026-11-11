@echo off
chcp 65001 >nul
title Rast Anonim Sohbet
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js bulunamadi. https://nodejs.org adresinden yukle.
  pause
  exit /b 1
)
if not exist "node_modules" (
  echo Gerekli Node.js kutuphaneleri kuruluyor...
  call npm install --no-audit --no-fund
  if errorlevel 1 (echo Kurulum basarisiz. & pause & exit /b 1)
)
echo.
echo RAST BASLATILIYOR: http://localhost:3000
start "" /min cmd /c "timeout /t 3 >nul ^& start http://localhost:3000"
call npm start
pause
