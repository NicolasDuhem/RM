@echo off
setlocal
title Roadmap Tool
cd /d "%~dp0"

echo.
echo  ============================================
echo   Roadmap Tool
echo  ============================================
echo.

where node >nul 2>nul
if errorlevel 1 (
    echo  Node.js was not found on this machine.
    echo.
    echo  Install Node.js ^(LTS^) from https://nodejs.org
    echo  then double-click start.bat again.
    echo.
    pause
    exit /b 1
)

echo  Starting the local server...
echo  Close this window to stop the application.
echo.

node "app\server.js" --open

echo.
echo  The server has stopped.
pause
