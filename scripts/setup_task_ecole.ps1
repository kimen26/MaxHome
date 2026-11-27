# Installe (ou reinstalle) la tache planifiee MaxHome-VeilleEcole. Idempotent : re-executable.
#   - MaxHome-VeilleEcole : tous les jours a 12:30 et 18:30, lit les mails de l'ecole, les messages, documents et
#     photos de l'espace parent, et poste ce qui est nouveau dans le groupe Telegram (scripts\bot\veille_ecole.py).
# Usage : powershell -ExecutionPolicy Bypass -File scripts\setup_task_ecole.ps1
# NB : fichier volontairement sans accents (PS 5.1 lit l'UTF-8 sans BOM en ANSI).

$ErrorActionPreference = "Stop"
$projectRoot = Split-Path -Parent $PSScriptRoot
$script = Join-Path $projectRoot "scripts\bot\veille_ecole.py"
$python = if (Test-Path "C:\Python311\python.exe") { "C:\Python311\python.exe" }
          else { (Get-Command python).Source }
$heures = @("12:30", "18:30")
$nom = "MaxHome-VeilleEcole"

New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot "data") | Out-Null

# StartWhenAvailable : une verification ratee (PC eteint) est rattrapee au prochain demarrage.
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Minutes 15)
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
Write-Host "Journal : data\veille_ecole.log"
