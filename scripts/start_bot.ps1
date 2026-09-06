# Lance le bot Telegram MaxHome (scripts/bot/bot.py) avec redemarrage automatique.
# Si bot.py s'arrete (crash), il est relance apres 5 s. Le journal applicatif est
# data\bot.log (ecrit par bot.py lui-meme, rotatif). Ce script journalise seulement
# les demarrages/arrets du processus dans data\bot_process.log.
# Garde anti-double-instance : fichier de verrou data\bot.lock contenant le PID en
# cours ; si ce PID est deja vivant, on sort immediatement.
# NB : fichier volontairement sans accents (PS 5.1 lit l'UTF-8 sans BOM en ANSI).
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location $projectRoot

$processLog = Join-Path $projectRoot "data\bot_process.log"
$lockFile = Join-Path $projectRoot "data\bot.lock"
$botScript = Join-Path $projectRoot "scripts\bot\bot.py"
$python = if (Test-Path "C:\Python311\python.exe") { "C:\Python311\python.exe" }
          else { (Get-Command python).Source }

New-Item -ItemType Directory -Force -Path (Join-Path $projectRoot "data") | Out-Null

if (Test-Path $lockFile) {
    $ancienPid = Get-Content $lockFile -ErrorAction SilentlyContinue
    if ($ancienPid -and (Get-Process -Id $ancienPid -ErrorAction SilentlyContinue)) {
        "$(Get-Date -Format s) instance deja active (pid $ancienPid) - sortie" |
            Add-Content $processLog -ErrorAction SilentlyContinue
        exit 0
    }
}
"$PID" | Set-Content $lockFile

try {
    while ($true) {
        if ((Test-Path $processLog) -and (Get-Item $processLog).Length -gt 5MB) {
            Move-Item $processLog "$processLog.1" -Force -ErrorAction SilentlyContinue
        }
        "$(Get-Date -Format s) demarrage bot.py" | Add-Content $processLog -ErrorAction SilentlyContinue
        & cmd.exe /c "`"$python`" `"$botScript`" >> `"$processLog`" 2>&1"
        "$(Get-Date -Format s) bot.py arrete (code $LASTEXITCODE), relance dans 5 s" |
            Add-Content $processLog -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 5
    }
} finally {
    Remove-Item $lockFile -Force -ErrorAction SilentlyContinue
}
