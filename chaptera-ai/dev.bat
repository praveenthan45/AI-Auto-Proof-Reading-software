@echo off
cd /d "%~dp0"
set CHAPTERA_DEV=1
if not exist venv (
  echo Creating virtual environment...
  python -m venv venv
)
call venv\Scripts\activate
python -m pip install -r requirements.txt -q
echo.
echo ========================================
echo   Chaptera DEV - Auto reload enabled
echo   Save any file - browser refreshes
echo   URL: http://127.0.0.1:5000
echo.
echo   PowerShell:  .\dev.ps1   or   .\dev.bat
echo   CMD:         dev.bat
echo ========================================
echo.
set CHAPTERA_OPEN_BROWSER=1
python app.py
