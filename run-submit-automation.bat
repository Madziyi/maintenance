@echo off
setlocal enableextensions

rem Ensure we run from the repo root (this .bat's directory)
cd /d "%~dp0"

echo.
echo === Closing Microsoft Edge (graceful, then force) ===
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$p=Get-Process msedge -ErrorAction SilentlyContinue; if($p){$p.CloseMainWindow()|Out-Null; Start-Sleep -Seconds 2}"

powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Get-Process msedge -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue; Start-Sleep -Seconds 1"

echo.
echo === Waiting for Edge to fully exit ===
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$sw=[Diagnostics.Stopwatch]::StartNew(); while($sw.Elapsed.TotalSeconds -lt 15 -and (Get-Process msedge -ErrorAction SilentlyContinue)){ Start-Sleep -Milliseconds 300 }; if(Get-Process msedge -ErrorAction SilentlyContinue){ Write-Host 'WARNING: msedge.exe still running (StartupBoost/background apps may be restarting it). Continuing anyway.' }"

echo.
echo === Checking prerequisites ===
where node >nul 2>&1
if errorlevel 1 (
  echo ERROR: Node.js was not found on PATH.
  echo Install Node.js, then re-run this script.
  exit /b 1
)

if not exist "node_modules\" (
  echo ERROR: node_modules not found.
  echo Run: npm install
  exit /b 1
)

if not exist "submit.js" (
  echo ERROR: submit.js not found in: %cd%
  exit /b 1
)

echo.
echo === Running Playwright automation (this will reopen Edge) ===
node "submit.js"
set exitcode=%errorlevel%

echo.
if not "%exitcode%"=="0" (
  echo Automation finished with exit code %exitcode%.
  exit /b %exitcode%
)

echo Automation finished successfully.
exit /b 0

