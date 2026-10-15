@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
echo Starting Supabase Migration...
if exist "%~dp0backend\scripts\migrate.js" (
  node "%~dp0backend\scripts\migrate.js" %*
) else (
  node "%~dp0scripts\migrate.js" %*
)
pause
