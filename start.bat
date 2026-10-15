@echo off
set "PATH=C:\Program Files\nodejs;%PATH%"
echo ===============================================
echo Starting Bunny AI Backend Server...
echo ===============================================
cd /d "%~dp0backend"
node server.js
pause
