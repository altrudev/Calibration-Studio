@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "REPO=altrudev/Calibration-Studio"
set "BRANCH=main"
set "PORT=4317"
set "API_VERSION=2026-03-10"
set "URL=http://127.0.0.1:%PORT%"

where gh >nul 2>&1
if errorlevel 1 (
  echo Calibration Studio launcher: GitHub CLI ^(gh^) is required.
  start "" "https://cli.github.com/"
  pause
  exit /b 1
)

gh auth status >nul 2>&1
if errorlevel 1 (
  echo GitHub authentication is required once.
  gh auth login || exit /b 1
)

call :ensure_repository_protection
call :find_codespace
if not defined CODESPACE call :create_codespace
if not defined CODESPACE (
  echo Calibration Studio launcher: could not resolve a Codespace.
  pause
  exit /b 1
)

if /I "%~1"=="restart" (
  call :restart_codespace
) else (
  call :start_codespace
)
if errorlevel 1 goto :failed

call :prepare_remote
if errorlevel 1 goto :failed
call :start_tunnel
call :wait_tunnel
if errorlevel 1 (
  echo Studio tunnel did not become ready; performing one automatic Codespace restart...
  call :restart_codespace
  if errorlevel 1 goto :failed
  call :prepare_remote
  if errorlevel 1 goto :failed
  call :start_tunnel
  call :wait_tunnel
  if errorlevel 1 goto :failed
)

echo Calibration Studio ready at %URL%
start "" "%URL%"
exit /b 0

:ensure_repository_protection
gh api -H "X-GitHub-Api-Version: %API_VERSION%" "repos/%REPO%/branches/%BRANCH%/protection" >nul 2>&1
if not errorlevel 1 exit /b 0
echo Applying Calibration Studio protection to %BRANCH%...
gh api --method PUT -H "X-GitHub-Api-Version: %API_VERSION%" "repos/%REPO%/branches/%BRANCH%/protection" -F required_status_checks=null -F enforce_admins=true -F "required_pull_request_reviews[required_approving_review_count]=0" -F "required_pull_request_reviews[dismiss_stale_reviews]=false" -F "required_pull_request_reviews[require_code_owner_reviews]=false" -F "required_pull_request_reviews[require_last_push_approval]=false" -F restrictions=null -F required_linear_history=true -F allow_force_pushes=false -F allow_deletions=false -F required_conversation_resolution=true -F lock_branch=false -F allow_fork_syncing=true >nul 2>&1
if errorlevel 1 (
  echo Warning: repository protection could not be applied with the current GitHub credentials.
) else (
  echo Repository protection active: PR path required; force-push and deletion blocked.
)
exit /b 0

:find_codespace
set "CODESPACE="
for /f "usebackq delims=" %%I in (`gh codespace list -R "%REPO%" -L 30 --json name,lastUsedAt --jq "sort_by(.lastUsedAt) ^| reverse ^| .[0].name" 2^>nul`) do set "CODESPACE=%%I"
if /I "!CODESPACE!"=="null" set "CODESPACE="
exit /b 0

:create_codespace
set "MACHINE="
for /f "usebackq delims=" %%I in (`gh api -H "X-GitHub-Api-Version: %API_VERSION%" "repos/%REPO%/codespaces/machines" --jq ".machines ^| min_by(.cpus).name"`) do set "MACHINE=%%I"
if not defined MACHINE exit /b 1
echo Creating a low-core Calibration Studio Codespace ^(!MACHINE!^) ...
gh codespace create -R "%REPO%" -b "%BRANCH%" -m "!MACHINE!" -d "Calibration Studio" --idle-timeout 15m --retention-period 168h --devcontainer-path .devcontainer/devcontainer.json >nul
if errorlevel 1 exit /b 1
call :find_codespace
exit /b 0

:start_codespace
set "STATE="
for /f "usebackq delims=" %%I in (`gh codespace view -c "%CODESPACE%" --json state --jq ".state" 2^>nul`) do set "STATE=%%I"
if /I "!STATE!"=="Available" exit /b 0
echo Starting Codespace %CODESPACE%...
gh api -X POST -H "X-GitHub-Api-Version: %API_VERSION%" "user/codespaces/%CODESPACE%/start" >nul
if errorlevel 1 exit /b 1
call :wait_available
exit /b %errorlevel%

:restart_codespace
echo Restarting Codespace %CODESPACE%...
gh codespace stop -c "%CODESPACE%" >nul 2>&1
call :wait_shutdown
gh api -X POST -H "X-GitHub-Api-Version: %API_VERSION%" "user/codespaces/%CODESPACE%/start" >nul
if errorlevel 1 exit /b 1
call :wait_available
exit /b %errorlevel%

:wait_available
for /L %%N in (1,1,90) do (
  set "STATE="
  for /f "usebackq delims=" %%I in (`gh codespace view -c "%CODESPACE%" --json state --jq ".state" 2^>nul`) do set "STATE=%%I"
  if /I "!STATE!"=="Available" exit /b 0
  timeout /t 2 /nobreak >nul
)
exit /b 1

:wait_shutdown
for /L %%N in (1,1,60) do (
  set "STATE="
  for /f "usebackq delims=" %%I in (`gh codespace view -c "%CODESPACE%" --json state --jq ".state" 2^>nul`) do set "STATE=%%I"
  if /I "!STATE!"=="Shutdown" exit /b 0
  timeout /t 1 /nobreak >nul
)
exit /b 0

:prepare_remote
gh codespace ssh -c "%CODESPACE%" "cd /workspaces/Calibration-Studio && (git pull --ff-only origin main || true) && bash scripts/codespace-studio-start.sh" >nul
exit /b %errorlevel%

:start_tunnel
call :tunnel_ready
if not errorlevel 1 exit /b 0
powershell.exe -NoProfile -NonInteractive -Command "Start-Process -WindowStyle Hidden -FilePath 'gh' -ArgumentList @('codespace','ports','forward','%PORT%:%PORT%','-c','%CODESPACE%')" >nul 2>&1
exit /b 0

:wait_tunnel
for /L %%N in (1,1,60) do (
  call :tunnel_ready
  if not errorlevel 1 exit /b 0
  timeout /t 1 /nobreak >nul
)
exit /b 1

:tunnel_ready
powershell.exe -NoProfile -NonInteractive -Command "try { $s=Invoke-RestMethod -Uri '%URL%/api/status' -TimeoutSec 2; if($s.codespace.name -eq '%CODESPACE%'){exit 0}; exit 1 } catch { exit 1 }" >nul 2>&1
exit /b %errorlevel%

:failed
echo.
echo Calibration Studio could not start. Run this launcher again, or run it with the argument "restart".
pause
exit /b 1
