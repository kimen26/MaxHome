#!/usr/bin/env python3
"""garde-secrets.py — refuse toute commande Bash qui LIRAIT un fichier de secrets.

Pourquoi ce hook existe (L-061, 2026-08-30) : les trois runbooks cron montraient
en exemple `SB_KEY=$(grep '^IARTCANE_SUPABASE_SERVICE_KEY=' infra/bot/.env | …)`.
Juste en dessous, une consigne disait « pour les secrets, lis le fichier avec
l'outil de lecture ». Un run a suivi l'exemple, pas la consigne, et a **affiché
la clé service_role en clair** dans sa sortie — la clé qui contourne RLS.

La consigne existait dans cinq documents. Aucune commande ne la vérifiait.
D-041 : « une règle que ne vérifie aucune commande n'est pas une règle ».

Ce hook est cette commande. Il s'interpose AVANT l'exécution (PreToolUse sur
Bash) et sort en code 2 — ce qui bloque l'appel et renvoie le message à Claude.

Ce qu'il NE fait pas : empêcher de lire un `.env` avec l'outil de lecture (c'est
le geste correct — le contenu va dans le contexte, pas dans une sortie de
terminal journalisée), ni bloquer les commandes qui ÉCRIVENT ou testent
l'existence, ni bloquer `.env.example` (un modèle sans valeurs, versionné).

Contrat de hook : lit un JSON sur stdin, sort 0 (laisse passer) ou 2 (bloque,
stderr → Claude). Toute erreur interne laisse passer : un hook cassé ne doit
jamais paralyser une session (il crie sur stderr et rend 0).
"""
import json
import re
import sys

# Commandes dont la sortie ATTERRIT dans le terminal (donc dans les journaux,
# les transcripts, la sortie d'un run cron). C'est la sortie qui fuit, pas la
# lecture : `python script.py` qui lit .env pour s'en servir est légitime.
LECTEURS = (
    "cat", "bat", "type", "more", "less", "head", "tail", "grep", "egrep",
    "fgrep", "rg", "ripgrep", "awk", "sed", "strings", "xxd", "od", "nl",
    "cut", "sort", "uniq", "tee", "printenv", "env",
)

# `.env`, `.env.local`, `bot/.env`… mais PAS `.env.example` ni `.env.template`,
# ni un `lit_env(...)`/`read_env` (d'où le refus d'un `_` ou d'un mot collé avant).
CIBLE = re.compile(r"(?<![\w.-])\.env\b(?!\.example|\.template|\.sample)"
                   r"|sb\.curlrc\b", re.I)   # L-070 : le fichier de clés éphémère du cron

# Une clé peut aussi vivre en VARIABLE D'ENVIRONNEMENT (session humaine, script).
# L'afficher est la même fuite que lire `.env` : `echo $CLE`, `env`, `printenv`,
# `set`, ou un `curl -v`/`--trace` qui imprime ses en-têtes. `curl -H "apikey:
# $CLE"` sans option bavarde reste le geste correct. (Le cron, lui, ne reçoit
# plus de variable depuis L-070 : `dontAsk` refuse toute commande avec `$VAR`.)
VAR_SECRETE = re.compile(r"IARTCANE_SUPABASE_(SERVICE_KEY|ACCESS_TOKEN)|IARTCANE_TELEGRAM_BOT_TOKEN")
AFFICHEURS = ("echo", "printf", "printenv", "env", "set", "export", "declare",
              "Write-Output", "Write-Host", "Get-ChildItem", "gci", "dir")
CURL_BAVARD = re.compile(r"(?<!\S)(-v|--verbose|--trace(-ascii)?|--trace-config|-D\s*-|--dump-header\s*-)(?!\S)")

# Un `cat > f`, `cat >> f`, un heredoc : la commande ÉCRIT un fichier, elle ne
# lit aucun secret. Sans ce retrait, écrire un script ou une doc qui MENTIONNE
# `.env` était bloqué — c'est arrivé à la première minute de vie du hook.
REDIRECTION_ECRITURE = re.compile(r">>?\s*\S")
HEREDOC = re.compile(r"<<-?\s*'?(\w+)'?.*?^\1", re.S | re.M)

MESSAGE = """\
BLOQUÉ — cette commande lirait un fichier de secrets et sa sortie finirait dans
le terminal (donc dans le transcript et les journaux de run).

  {commande}

C'est exactement ce qui a fait fuiter la clé `service_role` le 2026-08-30 (L-061) :
un run a suivi un exemple de runbook au lieu de la consigne, et la clé s'est
affichée en clair.

À faire à la place :
  • besoin de LIRE une valeur → l'outil de lecture (Read) sur `.env`.
    Le contenu arrive dans le contexte, pas dans une sortie journalisée.
    (`.tmp-cron/sb.curlrc` ne se lit JAMAIS : il n'existe que le temps d'un run
    cron, qui l'utilise par `curl -K` sans l'ouvrir — L-070.)
  • besoin de l'UTILISER dans un script → `lit_env('IARTCANE_...')` de
    `infra/db-query.py` (déjà importé par `seed_demo/reseau.py`), qui lit sans
    jamais afficher.
  • besoin de vérifier qu'une clé EXISTE → teste la longueur ou le préfixe,
    n'imprime jamais la valeur.

Ne contourne pas ce garde-fou : une clé affichée une fois est une clé à faire
tourner (L-048 — une porte qu'on apprend à contourner ne protège plus rien)."""


MESSAGE_ENV = """\
BLOQUÉ — cette commande afficherait une clé reçue par l'environnement.

  {commande}

Une clé Supabase présente dans l'environnement sert à un script ou à un `curl`
— elle ne s'imprime jamais. `echo`, `env`, `printenv`, `set`
ou un `curl -v` (qui imprime ses en-têtes) les feraient atterrir dans le log.

À faire à la place : `curl -s -H "apikey: $IARTCANE_SUPABASE_SERVICE_KEY" …`
sans option bavarde. Pour vérifier qu'une variable existe, teste sa longueur,
n'imprime jamais sa valeur."""


SEGMENTS = re.compile(r"\|\||&&|\||;|\$\(|`|\n")


def commande_de(entree):
    """La commande Bash, quel que soit l'outil.

    Claude envoie `tool_input.command`. Le champ Kimi n'est pas documenté et
    aucun hook MaxPlay n'intercepte de Bash : on accepte donc les variantes
    plausibles plutôt que de sortir 0 en silence (un garde-fou inerte est pire
    qu'une absence de garde-fou — on se croit protégé). Dupliqué à l'identique
    dans garde-index-etranger.py et garde-git-large.py (HO-133) : chaque hook
    doit tourner seul, même si le repo est à moitié cassé.
    """
    ti = entree.get("tool_input") or {}
    for cle in ("command", "cmd", "script", "shell_command"):
        v = ti.get(cle)
        if isinstance(v, str) and v.strip():
            return v
    return ""


def _segment_lit_la_cible(segment):
    """Vrai si le segment commence par un lecteur (après d'éventuels `VAR=x`)
    ET nomme un fichier de secrets — `cat .env`, `grep KEY infra/bot/.env`."""
    if not CIBLE.search(segment):
        return False
    mots = segment.strip().split()
    while mots and re.match(r"^[A-Za-z_]\w*=", mots[0]):   # `LC_ALL=C cat .env`
        mots.pop(0)
    if not mots:
        return False
    return mots[0].rsplit("/", 1)[-1].rsplit("\\", 1)[-1].lower() in LECTEURS


def main():
    try:
        entree = json.load(sys.stdin)
    except Exception as e:  # entrée illisible : on ne paralyse pas la session
        print("garde-secrets : entrée illisible (%s) — laissé passer." % e, file=sys.stderr)
        return 0

    # Tolérance sur le nom d'outil (HO-133) : Kimi peut nommer l'outil Bash
    # autrement (`bash`, `Shell`…). On ne relâche PAS le filtre pour autant —
    # un hook qui inspecte tous les outils ralentit chaque appel — donc on
    # n'accepte qu'un nom reconnaissable, OU son absence si une commande a
    # quand même été trouvée (le contenu fait foi dans ce cas précis).
    nom_outil = (entree.get("tool_name") or "").strip().lower()
    if nom_outil and nom_outil not in ("bash", "shell"):
        return 0
    commande = commande_de(entree)
    if not commande:
        return 0

    # Le corps d'un heredoc est du CONTENU écrit, pas des commandes exécutées :
    # documenter la règle (« ne fais pas `cat .env` ») ne doit pas la déclencher.
    utile = HEREDOC.sub(" ", commande)

    # Une clé présente dans l'environnement qu'on afficherait.
    if VAR_SECRETE.search(utile) and not REDIRECTION_ECRITURE.search(utile):
        mots_env = re.findall(r"[\w.-]+", utile)
        bavard = any(m.rsplit("/", 1)[-1] in AFFICHEURS for m in mots_env)
        if bavard or CURL_BAVARD.search(utile):
            print(MESSAGE_ENV.format(commande=commande.strip()[:300]), file=sys.stderr)
            return 2

    if not CIBLE.search(utile):
        return 0

    # `curl -v -K .tmp-cron/sb.curlrc …` : curl ne « lit » pas le fichier au sens
    # des LECTEURS, mais en mode bavard il imprime les en-têtes qu'il en tire.
    if CURL_BAVARD.search(utile):
        print(MESSAGE_ENV.format(commande=commande.strip()[:300]), file=sys.stderr)
        return 2

    # `cat > script.py`, `printf … >> doc.md` : ça écrit, ça ne lit pas.
    if REDIRECTION_ECRITURE.search(utile):
        return 0

    # Un lecteur compte s'il est EN TÊTE d'un segment de commande (début, après
    # un pipe, un `;`, un `&&`, une substitution `$(...)`) ET que ce segment
    # nomme le fichier : `x=$(grep … .env)` fuit autant que `grep … .env`.
    # Chercher le mot n'importe où bloquait à tort le cron (L-070) : l'URL REST
    # `…&type=in.(r1,r2)&select=id,type` contient `type`, qui est un lecteur
    # Windows — 2 runs KO sur une commande parfaitement légitime.
    if not any(_segment_lit_la_cible(seg) for seg in SEGMENTS.split(utile)):
        return 0

    print(MESSAGE.format(commande=commande.strip()[:300]), file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main())
