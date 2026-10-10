@echo off
cd /d "%~dp0"
if not exist venv (
  echo Creating virtual environment...
  python -m venv venv
)
call venv\Scripts\activate
python -m pip install -r requirements.txt -q
echo.
echo For auto-reload during development, use dev.bat instead.
echo.
set CHAPTERA_DEV=0
echo Starting Chaptera Studio (original UI + Python AI)...
python app.py
pause
