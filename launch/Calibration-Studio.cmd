@echo off
setlocal
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Calibration Studio requires Node.js 24 or newer.
  echo Install Node.js, then run this launcher again.
  pause
  exit /b 1
)
node bin\studio-launch.js
if errorlevel 1 (
  echo.
  echo Calibration Studio stopped with an error.
  pause
)
