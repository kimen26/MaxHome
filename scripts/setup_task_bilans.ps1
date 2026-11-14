# Installe (ou reinstalle) la tache planifiee MaxHome-VeilleBilans. Idempotent : re-executable.
#   - MaxHome-VeilleBilans : regarde si les RDV bilans de l'ecole sont ouverts, tous les jours a 09:00, 14:00, 19:00,
#     et previent Yann sur Telegram au passage a "ouvert" (scripts\bot\veille_bilans.py).
# Usage : powershell -ExecutionPolicy Bypass -File scripts\setup_task_bilans.ps1
# NB : fichier volontairement sans accents (PS 5.1 lit l'UTF-8 sans BOM en ANSI).

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$script = Join-Path $projectRoot "scripts\bot\veille_bilans.py"
$python = if (Test-Path "C:\Python311\python.exe") { "C:\Python311\python.exe" }
          else { (Get-Command python).Source }
$heures = @("09:00", "14:00", "19:00")
$nom = "MaxHome-VeilleBilans"

New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot "data") | Out-Null

# StartWhenAvailable : une verification ratee (PC eteint) est rattrapee au prochain demarrage.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal -UserId $env:USERNAME -LogonType Interactive

# Fenetre cachee : powershell -WindowStyle Hidden lance le meme python que start_bot.ps1.
$action = New-ScheduledTaskAction -Execute "powershell.exe" -WorkingDirectory $projectRoot `
    -Argument "-WindowStyle Hidden -ExecutionPolicy Bypass -Command `"& '$python' '$script'`""
$triggers = $heures | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }

Register-ScheduledTask -TaskName $nom -Action $action -Trigger $triggers `
    -Settings $settings -Principal $principal -Force | Out-Null

Write-Host "OK  $nom ($($heures -join ', '))"
Write-Host ""
Write-Host "Tache installee. Verifier : Get-ScheduledTask $nom"
Write-Host "Lancer maintenant : Start-ScheduledTask -TaskName $nom"
Write-Host "Journal : data\veille_bilans.log"
