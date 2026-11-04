@echo off
setlocal
cd /d "%~dp0"

where python >nul 2>nul
if errorlevel 1 (
  echo Python 3 is required to serve local presentation videos.
  pause
  exit /b 1
)

set "PORT=8766"
start "MINIVITA Presentation Server" /min python -m http.server %PORT% --bind 127.0.0.1 --directory "%~dp0"

for /l %%i in (1,1,15) do (
  powershell -NoProfile -Command "try { (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:%PORT%/index.html').StatusCode | Out-Null; exit 0 } catch { exit 1 }" >nul 2>nul
  if not errorlevel 1 goto open
  timeout /t 1 /nobreak >nul
)

echo Could not start the presentation server on port %PORT%.
pause
exit /b 1

:open
start "" "http://127.0.0.1:%PORT%/index.html"
