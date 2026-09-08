@echo off
title JARVIS Standalone GSM Gateway ^& SMS Reminder Hub
color 0b
echo ====================================================================
echo        JARVIS STANDALONE GSM GATEWAY ^& SMS REMINDER HUB             
echo ====================================================================
echo Checking Node.js environment...
where node >nul 2>nul
if %errorlevel% neq 0 (
    echo [ERROR] Node.js is not installed or not in PATH!
    echo Please install Node.js from https://nodejs.org
    pause
    exit /b
)

if not exist "node_modules\" (
    echo [INFO] Installing required dependencies...
    call npm install
)

echo.
echo [STARTING] Launching Standalone GSM Subsystem on Port 5176...
echo [INFO] Access the Web UI at: http://localhost:5176
echo.
call npm start
pause
