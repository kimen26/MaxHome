# Installe (ou reinstalle) la tache planifiee MaxHome-GardeBot. Idempotent : re-executable.
#   - MaxHome-GardeBot : tous les jours a 08:00 et 18:00, lance scripts\start_bot.ps1 (D-074).
#     Bot vivant : start_bot.ps1 lit data\bot.lock et sort aussitot. Bot mort : il le relance et reste
#     son superviseur (d'ou aucune limite de duree d'execution).
# Usage : powershell -ExecutionPolicy Bypass -File scripts\setup_task_garde_bot.ps1
# NB : fichier volontairement sans accents (PS 5.1 lit l'UTF-8 sans BOM en ANSI).

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$script = Join-Path $projectRoot "scripts\start_bot.ps1"
$heures = @("08:00", "18:00")
$nom = "MaxHome-GardeBot"

# StartWhenAvailable : une verification ratee (PC eteint) est rattrapee au prochain demarrage.
# ExecutionTimeLimit zero : quand la tache relance le bot, elle EST le superviseur, elle ne doit pas etre coupee.
# IgnoreNew : si l'instance precedente supervise encore le bot, le declenchement suivant ne fait rien.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

$action = New-ScheduledTaskAction -Execute "powershell.exe" -WorkingDirectory $projectRoot `
    -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`""
$triggers = $heures | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }

Register-ScheduledTask -TaskName $nom -Action $action -Trigger $triggers `
    -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "OK  $nom ($($heures -join ', '))"
Write-Host ""
Write-Host "Tache installee. Verifier : Get-ScheduledTask $nom"
Write-Host "Lancer maintenant : Start-ScheduledTask -TaskName $nom"
Write-Host "Journal : data\bot_process.log"
