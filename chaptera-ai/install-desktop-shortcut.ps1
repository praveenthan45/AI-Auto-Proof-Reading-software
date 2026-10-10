# Run once: right-click → Run with PowerShell
# Creates "Chaptera" shortcut on your Desktop

$ProjectRoot = $PSScriptRoot
$BatPath = Join-Path $ProjectRoot "Start Chaptera.bat"
$Desktop = [Environment]::GetFolderPath("Desktop")
$ShortcutPath = Join-Path $Desktop "Chaptera.lnk"

if (-not (Test-Path $BatPath)) {
    Write-Host "Error: Start Chaptera.bat not found in $ProjectRoot" -ForegroundColor Red
    exit 1
}

$WshShell = New-Object -ComObject WScript.Shell
$Shortcut = $WshShell.CreateShortcut($ShortcutPath)
$Shortcut.TargetPath = $BatPath
$Shortcut.WorkingDirectory = $ProjectRoot
$Shortcut.WindowStyle = 1
$Shortcut.Description = "Chaptera — AI Proofreading Tool"
$Shortcut.Save()

Write-Host ""
Write-Host "Desktop shortcut created:" -ForegroundColor Green
Write-Host "  $ShortcutPath"
Write-Host ""
Write-Host "Double-click Chaptera on your Desktop to start the tool."
Write-Host ""
