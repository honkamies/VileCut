@echo off
echo Starting VileCut Modular Server...

:: Check if Python is installed
python --version >nul 2>&1
if %errorlevel% equ 0 goto RUN_PYTHON

:: Check if py (Python launcher) is installed
py --version >nul 2>&1
if %errorlevel% equ 0 goto RUN_PY

:: Check if Node/npx is installed
npx --version >nul 2>&1
if %errorlevel% equ 0 goto RUN_NPX

:: If none are found, check winget
goto NO_ENVIRONMENT

:RUN_PYTHON
echo Starting Python HTTP server on port 8000...
start "" http://localhost:8000
python -m http.server 8000
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to start Python HTTP server.
    echo (Port 8000 might already be in use by another program).
    pause
)
exit /b

:RUN_PY
echo Starting Python HTTP server on port 8000...
start "" http://localhost:8000
py -m http.server 8000
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to start Python HTTP server via py.
    echo (Port 8000 might already be in use by another program).
    pause
)
exit /b

:RUN_NPX
echo Starting http-server via npx on port 8000...
start "" http://localhost:8000
npx http-server -p 8000
if %errorlevel% neq 0 (
    echo.
    echo ERROR: Failed to start http-server via npx.
    echo (Port 8000 might already be in use by another program).
    pause
)
exit /b

:NO_ENVIRONMENT
echo.
echo =======================================================================
echo ERROR: Neither Python nor Node.js could be detected on your PATH.
echo ES6 modules require an HTTP server to run (CORS filesystem restrictions).
echo =======================================================================
echo.

:: Check if winget is available
winget --version >nul 2>&1
if %errorlevel% neq 0 goto MANUAL_INSTALL

echo Windows Package Manager (winget) is available on your system.
set /p CHOICE="Would you like to automatically install Python 3 using winget? [Y/N]: "
if /i "%CHOICE%" neq "Y" goto MANUAL_INSTALL

echo.
echo Attempting to install Python 3. Please approve any Windows UAC prompts...
winget install --id Python.Python.3.12
if %errorlevel% equ 0 (
    echo.
    echo SUCCESS: Python has been installed successfully!
    echo IMPORTANT: You must close this window and run run_Windows.bat again to start the server.
) else (
    echo.
    echo ERROR: winget installation failed or was cancelled.
    echo Please install Python manually from https://www.python.org/
)
pause
exit /b

:MANUAL_INSTALL
echo Please install Python (from https://www.python.org/) or Node.js manually.
pause
exit /b
