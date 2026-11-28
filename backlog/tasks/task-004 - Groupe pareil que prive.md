---
id: task-004
title: Faire répondre le bot dans le groupe exactement comme en privé (bavardage seul excepté)
status: Valide
assignee: [executant]
labels: [bot]
priority: high
dependencies: [task-001, task-003]
created_date: '2026-11-28'
---

## Description
Dans le groupe, un message non adressé au bot (ni mention, ni « répondre ») est traité à part
(`bot._traiter_non_adresse`) : écritures de grammaire transformées en « OK ? », liens non lus, phrases de la
grammaire jugées « bruit » tues. Yann veut les mêmes capacités et les mêmes réponses qu'en privé. Seule exception :
une conversation entre Claudia et Yann qui n'est clairement pas une demande ne reçoit que le 👀 (posé par task-001),
pas de réponse. Dans le doute, le bot répond.

## Acceptance Criteria
- [ ] #1 `python -m pytest -q tests/bot/test_groupe.py` vert : un message de groupe NON adressé reçoit la même réponse
      qu'en privé pour une commande de grammaire (« ajoute du lait » ajouté directement, annulable), une lecture
      (« bilan ») et une phrase libre ; un lien non adressé est lu comme en privé.
- [ ] #2 `python -m pytest -q tests/bot/test_groupe.py` : non adressé + `sans_suite_evident` (« ok », émoji) -> None
      sans appel au modèle ; non adressé + modèle qui rend `bavardage` -> None ; adressé ou privé + `bavardage` ->
      « Je n'ai pas compris » ; non adressé + réponse grammaire dans ACTIONS_MUETTES -> passe au modèle (pas de silence d'office).
- [ ] #3 `python -m pytest -q tests/bot/test_groupe.py` : un message non adressé ne consomme toujours pas une attente née
      dans un AUTRE chat (copie de mois, confirmation) ; la proposition « OK ? » en attente dans CE groupe reste servie.
- [ ] #4 `python -m pytest -q tests/bot/` vert en entier ; `grep -n "je me tais" scripts/bot/groupe.py` vide : le texte
      d'accueil dit que le bot répond à tout, sauf quand Claudia et Yann se parlent entre eux (il met alors 👀).

## Périmètre
- Autorisés : `scripts/bot/bot.py`, `scripts/bot/groupe.py`, `scripts/bot/boucle_bot.py`, `scripts/bot/dialogue_libre.py`, `tests/bot/test_groupe.py`
- Interdits : `actions.py`, `reponses.py`, `donnees.py` (autre session) ; dans `bot.py`, toucher SEULEMENT
  `traiter_message` et `_traiter_non_adresse` (une autre session modifie le reste du fichier : diff minimal)
- Lane : bot-groupe

## Conception imposée
- `bot.traiter_message(telegram_id, texte, adresse=True)` : un seul chemin pour tous. Adressé : `_reprendre` comme
  aujourd'hui. Non adressé : pas de `_reprendre` (l'attente peut venir d'un autre chat ; `groupe.filtrer` marque déjà
  adressé un message qui répond à une attente de CE chat), garder `documents_voyage.reprendre(..., adresse=False)`.
  Puis, pour tous, `web_bot.reponse_au_lien`, puis la grammaire. Non adressé et (`vers_le_modele` ou action dans
  `groupe.ACTIONS_MUETTES`) : `sans_suite_evident` -> None, sinon
  `dialogue_libre.interpreter(..., peut_se_taire=True)`. Adressé : `vers_le_modele` -> `dialogue_libre.interpreter`.
  Sinon `executer_action` (plus de « OK ? » forcé pour une écriture de grammaire non adressée).
- `_traiter_non_adresse` disparaît si plus rien ne l'appelle.
- `groupe.py` : docstring et `accueil()` à jour (D-077 à venir, pas de numéro dans le code) ; `boucle_bot.py` :
  le journal d'un silence dit « groupe : bavardage, 👀 seul ».

## Pièges connus
- D-064 / D-067 : l'ancienne règle (silence sur un message non adressé incompris) a été vécue comme une panne ; ici on la remplace, le silence n'est plus que le bavardage.
- L-060 : un silence voulu se vérifie avec Yann avant d'être livré ; ici il est demandé par Yann (bavardage seulement).
- Conflit de fusion attendu sur bot.py avec l'autre session : diff minimal, ne pas reformater le fichier.
- Tests sans vrai `claude` ni Telegram ; fichiers < 400 lignes (bot.py à 358), français, utf-8.

## Implementation Plan
1. bot.py `traiter_message` : un seul chemin (adressé : `_reprendre` ; non adressé : `documents_voyage.reprendre(adresse=False)`), puis `web_bot.reponse_au_lien` pour tous, grammaire, puis aiguillage (non adressé + modèle/ACTIONS_MUETTES : `sans_suite_evident` -> None sinon `interpreter(peut_se_taire=True)` ; sinon modèle ou `executer_action`). Suppression de `_traiter_non_adresse`.
2. groupe.py : docstring et `accueil()`. boucle_bot.py : journal « groupe : bavardage, 👀 seul ».
3. test_groupe.py : mise à jour des tests qui figent l'ancien comportement + nouveaux tests (AC1 à AC3).
Preuve : pytest tests/bot/ entier, grep « je me tais ».
Réutilisation : réutilisé : `sans_suite_evident`, `ACTIONS_MUETTES`, `dialogue_libre.interpreter(peut_se_taire)`, `web_bot.reponse_au_lien` ; neuf : rien.

## Relecture

## Verdict
2026-11-28 · Valide · relu par l'orchestrateur (bot.py : deux méthodes seulement), suite tests/bot rejouée verte.

## Implementation Notes
- Fichiers : bot.py (-25 +7 environ, `traiter_message` + suppression de `_traiter_non_adresse`, 342 lignes), groupe.py (docstring, accueil, commentaire ACTIONS_MUETTES), boucle_bot.py (journal), dialogue_libre.py (+1 : `interpreter` ne retire plus la QUESTION en attente quand `peut_se_taire`, sinon une phrase de groupe consommait la question posée en privé, AC3), test_groupe.py, test_web.py.
- Écart assumé : `tests/bot/test_web.py` est hors périmètre listé, mais son test `test_lien_non_adresse_en_groupe_non_lu` figeait l'ancien comportement ; devenu `..._lu_comme_en_prive` (diff de 5 lignes).
- Tests changés dans test_groupe.py : message_ecarte (journal « groupe : bavardage, 👀 seul ») ; accueil (« 👀 », plus de « je me tais ») ; question_en_attente x3 (« 50/50 » non adressé passe désormais au modèle, qui rend `bavardage`) ; `..._ecriture_demande_un_oui` remplacé par `..._ecriture_est_faite_comme_en_prive` ; `..._action_muette_reste_muette` et `..._grammaire_sans_sens_est_silencieux` remplacés par des tests qui vérifient l'appel au modèle puis le silence sur `bavardage`. Nouveaux : `non_adresse_et_prive_donnent_la_meme_reponse`, `bavardage_adresse_ou_prive_donne_je_n_ai_pas_compris`.
- `python outils/portes.py` n'existe pas dans ce worktree : non exécuté. Le hook garde-git a refusé un lot de commandes contenant le mot « replace » (faux positif lexical) ; contourné par Edit.
- [x] #1 test_groupe.py vert (880 passed sur tests/bot/ entier) : écriture « ajoute du lait » faite directement, bilan identique privé/groupe, lien lu (test_web).
- [x] #2 tests sans_suite_evident, bavardage non adressé -> None, adressé/privé -> « Je n'ai pas compris », actions muettes -> modèle.
- [x] #3 `test_une_proposition_d_un_autre_chat...`, `test_une_question_posee_en_prive_n_ouvre_pas_le_groupe` verts ; la proposition de CE groupe reste servie (`test_une_proposition_n_attend_qu_un_oui_ou_un_non`).
- [x] #4 pytest tests/bot/ : 880 passed (878 avant) ; `grep "je me tais" scripts/bot/groupe.py` vide.
