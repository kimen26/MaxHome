# Installe (ou reinstalle) la tache planifiee MaxHome-Proches. Idempotent : re-executable.
#   - MaxHome-Proches : chaque jour a 09:00, previent en prive (Telegram) des anniversaires de la veille et du jour ;
#     le dimanche, relance les proches sans nouvelles depuis trop longtemps (scripts\bot\veille_proches.py).
# Usage : powershell -ExecutionPolicy Bypass -File scripts\setup_task_proches.ps1
# NB : fichier volontairement sans accents (PS 5.1 lit l'UTF-8 sans BOM en ANSI).

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$script = Join-Path $projectRoot "scripts\bot\veille_proches.py"
$python = if (Test-Path "C:\Python311\python.exe") { "C:\Python311\python.exe" }
          else { (Get-Command python).Source }
$heure = "09:00"
$nom = "MaxHome-Proches"

New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot "data") | Out-Null

# StartWhenAvailable : un passage rate (PC eteint a 09:00) est rattrape au prochain demarrage.
# Le garde-fou data\veille_proches.json evite tout doublon dans la journee.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 10)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

# Fenetre cachee : powershell -WindowStyle Hidden lance le meme python que start_bot.ps1.
$action = New-ScheduledTaskAction -Execute "powershell.exe" -WorkingDirectory $projectRoot `
    -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"& '$python' '$script'`""
$trigger = New-ScheduledTaskTrigger -Daily -At $heure

Register-ScheduledTask -TaskName $nom -Action $action -Trigger $trigger `
    -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "OK  $nom ($heure)"
Write-Host ""
Write-Host "Tache installee. Verifier : Get-ScheduledTask $nom"
Write-Host "Lancer maintenant : Start-ScheduledTask -TaskName $nom"
Write-Host "Journal : data\veille_proches.log"
