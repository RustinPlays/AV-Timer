@echo off
cd /d "%~dp0"
where npm >nul 2>&1 || (echo Node.js and npm are required. & pause & exit /b 1)
call npm install
if errorlevel 1 (echo Failed to install build dependencies & pause & exit /b 1)
call npm run check
if errorlevel 1 (echo Manifest/source validation failed & pause & exit /b 1)
call npm run build
if errorlevel 1 (echo Build failed; copy the errors to ChatGPT & pause & exit /b 1)
echo Built module package: .tgz in this folder
pause
