---
id: task-003
title: Brancher l'agent dans le langage libre et proposer plusieurs écritures d'un seul « oui »
status: Livre
assignee: [executant]
labels: [bot, securite]
priority: high
dependencies: [task-002]
created_date: '2026-11-28'
---

## Description
task-002 livre `agent.mener`. Ici : (1) `dialogue_libre.interpreter` passe par l'agent au lieu d'un appel
unique ; (2) l'action finale `ecritures` propose plusieurs écritures (ex. 5 RDV de l'école) dans UN récapitulatif
« OK ? », exécutées toutes sur un seul « oui » d'un membre, rien sur « non ». Chaque écriture reste validée par le
code existant (agenda.valider_saisie, traduction_libre…) : on ne réécrit aucune règle métier.

## Acceptance Criteria
- [x] #1 `python -m pytest -q tests/bot/test_agent_lot.py` vert : 3 agenda_creer valides -> un seul message
      numéroté finissant par « OK pour tout ? », une seule CONFIRMATION posée ; « oui » -> les 3 écritures passent par
      `outils.confirmer` (registre), réponse qui les liste ; « non » -> « OK, rien fait. » et aucune écriture.
- [x] #2 `python -m pytest -q tests/bot/test_agent_lot.py` : un agenda_creer déjà présent ce jour-là
      (`ecole_agenda.deja_la`) est écarté et annoncé « déjà dans l'agenda » ; un élément invalide (date fausse) est
      annoncé avec la phrase d'erreur du module, sans bloquer les autres ; aucun élément valide -> pas de CONFIRMATION.
- [x] #3 `python -m pytest -q tests/bot/test_agent_lot.py` : un élément hors LOT_AUTORISES (ex. ecole_message,
      proche_echange, valider) est refusé par le code ; au plus LOT_MAX = 8 éléments ; un seul élément valide ->
      la proposition simple d'aujourd'hui (même texte que `dialogue_libre.proposer`).
- [x] #4 `python -m pytest -q tests/bot/` vert en entier, test_dialogue_libre compris (l'agent avec 1 tour
      sans lecture doit rendre exactement les réponses d'avant).

## Périmètre
- Autorisés : `scripts/bot/agent_lot.py` (neuf), `scripts/bot/dialogue_libre.py`, `scripts/bot/agent.py`, `tests/bot/test_agent_lot.py` (neuf), `tests/bot/test_dialogue_libre.py` (faux interpréteur seulement), `tests/bot/test_agent.py` (adapter au nouveau crochet), `tests/bot/test_groupe.py` (faux interpréteur seulement)
- Interdits : `scripts/bot/bot.py`, `actions.py`, `reponses.py`, `donnees.py` (autre session), `groupe.py` (task-004)
- Lane : bot-agent

## Conception imposée
- `dialogue_libre.interpreter(bot, telegram_id, prenom, texte, peut_se_taire=False)` : mêmes préparatifs
  qu'aujourd'hui, puis `agent.mener(bot, etat, telegram_id, prenom, texte, _suite, echanges=…, peut_se_taire=…,
  ecrire_lot=agent_lot.proposer)`. Réponse None (bavardage) -> rien n'est retenu dans la conversation, None rendu.
- `agent_lot.py` :
  - `ACTION = "lot"`, `LOT_MAX = 8`, `LOT_AUTORISES = {"agenda_creer", "agenda_modifier", "agenda_supprimer",
    "course_ajout", "extra", "charge", "valider", "tache_faite"}` MOINS ce qui est interdit après une lecture tiers :
    l'agent passe `apres_tiers` ; dans ce cas seuls `agenda_creer` et `course_ajout` sont admis (liste fermée).
  - `proposer(bot, etat, telegram_id, prenom, texte, liste, suite, annee, mois, apres_tiers)` : pour chaque élément
    (dict avec "action"), appeler `suite` sur un état BROUILLON `{}` ; si le brouillon porte une
    `conversation.CONFIRMATION`, récolter son action et le texte rendu (récap) ; sinon garder le texte rendu comme
    note (question, erreur). Avant d'appeler `suite` pour un agenda_creer, écarter les doublons avec
    `ecole_agenda.deja_la` contre l'agenda lu une fois sur la période (`agenda_bot.lire_periode`), lecture ratée = pas de filtre.
  - 1 action récoltée -> `conversation.poser(etat, CONFIRMATION, {"action": action})` et rendre son récap (comportement
    actuel). Plusieurs -> poser `{"action": {"action": ACTION, "actions": [...], "recaps": [...]}}` et rendre
    « Je propose : » + lignes numérotées (récap sans le « OK ? » final) + notes + « OK pour tout ? ».
  - `executer(bot, telegram_id, prenom, lot, texte)` : `bot.executer_action` pour chacune, dans l'ordre, une erreur
    n'arrête pas les suivantes ; réponse = une ligne par résultat.
- `dialogue_libre.reprendre` : sur « oui », si `action["action"] == agent_lot.ACTION` -> `agent_lot.executer`, sinon
  inchangé. Pas d'import circulaire : `agent_lot` ne doit pas importer `dialogue_libre` (il reçoit `suite`).
- `agent.py` : passer `apres_tiers` et `ecrire_lot` ; liste vide ou non-liste -> non_compris.

## Pièges connus
- D-068 : une écriture ne part qu'après « OK ? » puis « oui » d'un membre ; le brouillon garantit que `suite` n'écrit rien
  directement, donc proche_echange (ajout direct pour un prénom connu) est HORS du lot.
- D-060 : une confirmation est consommée quoi qu'on réponde, et périme en 15 minutes (conversation.py).
- L-057 : aucun appel `claude` ajouté hors de claude_cli.py ; tests sans vrai `claude` ni vrai agenda Google.
- Fichiers < 400 lignes (dialogue_libre.py est à 163), français, utf-8, jamais de texte de message au journal.

## Implementation Plan
Réutilisation : réutilisé : `agent.mener` (boucle, garde tiers), `dialogue_libre._suite` (brouillon), `outils.confirmer` via `bot.executer_action`, `ecole_agenda.deja_la`, `agenda_bot.lire_periode`, `agenda.valider_saisie`, `reponses.recap_libre` ; neuf : `agent_lot.py` seul (rien d'équivalent : aucune confirmation groupée n'existait).
1. `agent.py` : `_ecritures` et `_finale` transmettent `suite, annee, mois, apres_tiers=tiers` à `ecrire_lot` (signature `agent_lot.proposer`). Preuve : tests AC3.
2. `agent_lot.py` : `proposer` (filtre LOT_AUTORISES / APRES_TIERS, LOT_MAX, brouillon `{}`, doublons par `deja_la`, 1 action = proposition simple, N = « Je propose : » + « OK pour tout ? »), `executer` (une ligne par résultat, erreur n'arrête pas). Preuve : AC1 à AC3.
3. `dialogue_libre.py` : `interpreter` passe par `agent.mener` (`peut_se_taire`, None = rien retenu) ; `reprendre` : « oui » sur `lot` -> `agent_lot.executer`. Vérifier qu'aucun autre chemin n'appelle `libre.interpreter`. Preuve : AC4.
4. Tests : `tests/bot/test_agent_lot.py` neuf ; faux interpréteur de `test_dialogue_libre.py` accepte les kwargs de l'agent. Preuve : `pytest -q tests/bot/` complet.

## Relecture

## Verdict
2026-11-28 · Valide · relu par l'orchestrateur, suite tests/bot rejouée : 878 verts.

## Implementation Notes
Un blocage de garde (test_agent.py hors périmètre) a été levé par l'orchestrateur, qui a élargi le périmètre à `test_agent.py` et `test_groupe.py`.
Fichiers : `scripts/bot/agent.py` +4 -3 (transmet suite, annee, mois, apres_tiers) ; `scripts/bot/agent_lot.py` neuf, 115 lignes ; `scripts/bot/dialogue_libre.py` interpreter via `agent.mener` (peut_se_taire, None = rien retenu), reprendre exécute `lot`, import budget_lignes retiré (CRLF gardé) ; `tests/bot/test_agent_lot.py` neuf, 12 tests ; `test_agent.py` (crochet à kwargs, vérifie annee/mois/apres_tiers) ; `test_dialogue_libre.py` et `test_groupe.py` (faux interpréteur : `**k`).
Aucun autre chemin n'appelait `libre.interpreter` en direct (grep : seulement agent.py).
Écarts : `outils/portes.py` absent du worktree (pas de porte à rejouer ici). `agent_lot` utilise `agenda_bot._saisie_de` (privé) plutôt que d'en dupliquer la logique. La proposition simple (1 seul valide) ajoute les notes après le récap si des éléments ont été écartés ; sans note, texte identique à `dialogue_libre.proposer`.
Preuves : AC1 à AC3 : `python -m pytest -q tests/bot/test_agent_lot.py` = 12 passed. AC4 : `python -m pytest -q tests/bot/` = 878 passed (866 avant). py_compile ok sur agent.py, agent_lot.py, dialogue_libre.py.
Non prouvé : exécution contre le vrai Google ou un vrai claude (tout est simulé).
DoD (garde) : VERT · 2026-11-28 01:36 · 878 tests
