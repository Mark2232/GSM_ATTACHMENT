@echo off
title Jarvis SMS Gateway (Localhost Server)
echo =======================================================
echo ⚡ Jarvis SMS Gateway - GoIP-1 Hardware Engine
echo =======================================================
echo.
echo Starting Gateway Server on http://localhost:3080...
start /B cmd /c "cd /d %~dp0backend && npm start"
timeout /t 2 /nobreak >nul

echo.
echo =======================================================
echo 🟢 Gateway is ACTIVE on Localhost!
echo 🌐 Open in Browser: http://localhost:3080/
echo =======================================================
start http://localhost:3080/
exit
