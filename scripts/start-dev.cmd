@echo off
REM Double-click to start the backend (:8010), dashboard (:5174) and the extension build (watch) together.
REM The first run installs everything automatically.
cd /d "%~dp0"

if not exist "node_modules" goto setup
if not exist "..\dashboard\node_modules" goto setup
if not exist "..\extension\node_modules" goto setup
goto run

:setup
call node setup.mjs
if errorlevel 1 goto end

:run
call npm run dev

:end
pause
