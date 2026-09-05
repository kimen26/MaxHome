# Installe (ou reinstalle) la tache planifiee MaxBudget-Bot. Idempotent : re-executable.
#   - MaxBudget-Bot : bot Telegram au logon, boucle infinie, redemarre seul.
# Usage : powershell -ExecutionPolicy Bypass -File scripts\setup_task.ps1

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$startBot = Join-Path $projectRoot "scripts\start_bot.ps1"

New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot "data") | Out-Null

# Boucle infinie par nature (long polling Telegram). Une limite de duree la TUE
# en pleine activite : -ExecutionTimeLimit 0 = illimite. RestartInterval relance
# si le process meurt (crash, PC redemarre en session deja ouverte, etc.).
$botSettings = New-ScheduledTaskSettingsSet -StartWhenAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -ExecutionTimeLimit (New-TimeSpan -Seconds 0) `
    -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 999
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

$action = New-ScheduledTaskAction -Execute "powershell.exe" `
    -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$startBot`""
$trigger = New-ScheduledTaskTrigger -AtLogOn

Register-ScheduledTask -TaskName "MaxBudget-Bot" -Action $action -Trigger $trigger `
    -Settings $botSettings -Principal $principal -Force | Out-Null

Write-Host "OK  MaxBudget-Bot"
Write-Host ""
Write-Host "Tache installee. Verifier : Get-ScheduledTask MaxBudget-Bot"
Write-Host "Lancer maintenant : Start-ScheduledTask -TaskName MaxBudget-Bot"
