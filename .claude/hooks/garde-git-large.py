#!/usr/bin/env python3
"""garde-git-large.py — refuse un `git add` fourre-tout dans un arbre partagé.

Pourquoi (L-006, L-038) : plusieurs sessions travaillent dans le MÊME arbre de
travail et le MÊME index git (un cerveau, des exécutants, des sessions Kimi).
`git add -A`, `git add .` et `git commit -a` emportent alors le travail en cours
de quelqu'un d'autre — L-038 s'est déclenchée **trois fois en deux jours**, avec
à chaque fois la même réparation (`git reset --soft HEAD~1`).

La règle « commits ciblés » est écrite dans CLAUDE.md, le protocole, le template
et la définition de l'agent dev-handoff. Aucune commande ne la vérifiait.

Ce hook la vérifie. Il bloque AVANT l'exécution (code 2) et rappelle le geste
correct : nommer ses chemins, puis contrôler `git show --stat HEAD` après coup.

Il laisse passer : `git add <chemins>`, `git add -p`, `git add -u <chemin>`,
et tout ce qui n'est pas un `git add`/`git commit`. Un hook cassé rend 0.
"""
import json
import re
import sys

# `git add -A`, `git add --all`, `git add .`, `git add :/`, `git commit -a`,
# `git commit -am "…"`. Le `git add -u` NU (sans chemin) est tout aussi large.
MOTIFS = (
    (re.compile(r"\bgit\s+add\b[^|;&]*(?:\s-A\b|\s--all\b)"), "git add -A / --all"),
    (re.compile(r"\bgit\s+add\s+\.(?:\s|$)"), "git add ."),
    (re.compile(r"\bgit\s+add\s+:/(?:\s|$)"), "git add :/"),
    (re.compile(r"\bgit\s+add\s+-u\s*(?:$|[|;&])"), "git add -u sans chemin"),
    (re.compile(r"\bgit\s+commit\b[^|;&]*\s-[a-zA-Z]*a"), "git commit -a"),
)

def commande_de(entree):
    """La commande Bash, quel que soit l'outil.

    Claude envoie `tool_input.command`. Le champ Kimi n'est pas documenté et
    aucun hook MaxPlay n'intercepte de Bash : on accepte donc les variantes
    plausibles plutôt que de sortir 0 en silence (un garde-fou inerte est pire
    qu'une absence de garde-fou — on se croit protégé). Dupliqué à l'identique
    dans garde-index-etranger.py et garde-secrets.py (HO-133) : chaque hook
    doit tourner seul, même si le repo est à moitié cassé.
    """
    ti = entree.get("tool_input") or {}
    for cle in ("command", "cmd", "script", "shell_command"):
        v = ti.get(cle)
        if isinstance(v, str) and v.strip():
            return v
    return ""


MESSAGE = """\
BLOQUÉ — `{quoi}` dans un arbre de travail PARTAGÉ.

  {commande}

Plusieurs sessions écrivent dans cet arbre et cet index (cerveau, exécutants,
sessions Kimi). Une commande fourre-tout emporte le travail en cours d'un autre :
c'est L-038, déclenchée trois fois en deux jours.

À faire à la place :
  1. `git status --short` — regarde ce qui traîne et à qui c'est
  2. `git add <chemins exacts>` — uniquement TES fichiers
  3. `git commit -m "..."`
  4. `git show --stat HEAD` — vérifie qu'aucun fichier étranger n'est passé
     (débordement → `git reset --soft HEAD~1`, jamais `--hard`)

Ne sont jamais à toi : `.claude/settings.json`, `fiches/`, et les fichiers d'un
chantier voisin. En cas de doute : signale-les, ne les commite pas (L-011)."""


def main():
    try:
        entree = json.load(sys.stdin)
    except Exception as e:
        print("garde-git-large : entrée illisible (%s) — laissé passer." % e, file=sys.stderr)
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

    # Une commande qui ÉCRIT le texte « git add -A » (doc, brief, leçon, message
    # de commit) n'exécute rien : sans ce retrait, documenter l'interdit serait
    # interdit. On neutralise donc les portions citées — chaînes entre guillemets
    # et corps de heredoc — avant de chercher un vrai appel à git.
    sans_citations = re.sub(r"'[^']*'|\"[^\"]*\"", " ", commande)
    sans_citations = re.sub(r"<<-?\s*'?(\w+)'?.*?^\1", " ", sans_citations, flags=re.S | re.M)

    for motif, quoi in MOTIFS:
        if motif.search(sans_citations):
            print(MESSAGE.format(quoi=quoi, commande=commande.strip()[:300]), file=sys.stderr)
            return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
