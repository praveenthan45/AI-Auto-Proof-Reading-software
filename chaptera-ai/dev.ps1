# Chaptera DEV — run in PowerShell:  .\dev.ps1
Set-Location $PSScriptRoot
$env:CHAPTERA_DEV = "1"

if (-not (Test-Path "venv")) {
    Write-Host "Creating virtual environment..."
    python -m venv venv
}

& ".\venv\Scripts\Activate.ps1"
python -m pip install -r requirements.txt -q

Write-Host ""
Write-Host "========================================"
Write-Host "  Chaptera DEV - Auto reload enabled"
Write-Host "  Save any file - browser refreshes"
Write-Host "  URL: http://127.0.0.1:5000"
Write-Host "========================================"
Write-Host ""

$env:CHAPTERA_OPEN_BROWSER = "1"
python app.py
