---
id: task-001
title: Accuser réception (👀) et montrer que le bot réfléchit (typing, « Je regarde… »)
status: Valide
assignee: [executant]
labels: [bot]
priority: high
dependencies: []
created_date: '2026-11-28'
---

## Description
Yann ne sait jamais si le bot a lu son message ni s'il travaille : un bot lent et un bot mort se
ressemblent (L-059, L-060). À chaque message traité (texte ou pièce jointe, groupe ou privé) :
1. réaction 👀 posée sur le message dès réception (`setMessageReaction`) ;
2. `sendChatAction` « typing » tout de suite, puis relancé toutes les 4 s tant que le traitement dure ;
3. si le traitement dépasse 15 s, UN message court envoyé au chat : la phrase de l'étape en cours
   (« Je lis les mails de l'école… », « Je regarde l'agenda… »), sinon « Je regarde… ».
Un échec d'accusé (réaction refusée, réseau) est journalisé (sans contenu) et ne bloque jamais la réponse.
Hors sujet : la boucle d'agent (task-002), le groupe (task-004).

## Acceptance Criteria
- [x] #1 `python -m pytest -q tests/bot/test_accuse.py` vert : réaction posée avec 👀 sur le bon
      message_id, typing envoyé au départ puis relancé (horloge et délais injectés, aucun vrai sleep long),
      message « Je regarde… » envoyé une seule fois passé le seuil, jamais avant, phrase de l'étape signalée.
- [x] #2 `python -m pytest -q tests/bot/test_accuse.py` : une exception de Telegram dans la réaction ou le
      typing est avalée par le suivi, journalisée en warning, et le traitement continue.
- [x] #3 `python -m pytest -q tests/bot/` vert en entier (823 tests au 28/11 plus les nouveaux) : les tests
      existants de boucle_bot / groupe passent avec un Telegram factice qui n'a pas forcément `reagir`
      (le suivi tolère un client sans ces méthodes : AttributeError attrapée).
- [x] #4 `grep -n "def reagir\|def signaler_frappe" scripts/bot/telegram.py` : deux méthodes, timeout court
      (15 s et 10 s), lèvent RuntimeError si `ok` est faux, comme les autres.

## Périmètre
- Autorisés : `scripts/bot/accuse.py` (neuf), `scripts/bot/telegram.py`, `scripts/bot/boucle_bot.py`, `tests/bot/test_accuse.py` (neuf)
- Interdits : `scripts/bot/bot.py`, `scripts/bot/actions.py`, `scripts/bot/reponses.py`, `scripts/bot/donnees.py` (une autre session les modifie), tout fichier de task-002
- Lane : bot-accuse

## Conception imposée
- `telegram.py` : `reagir(chat_id, message_id, emoji)` -> `setMessageReaction` avec
  `{"chat_id", "message_id", "reaction": [{"type": "emoji", "emoji": emoji}]}` ;
  `signaler_frappe(chat_id)` -> `sendChatAction` `{"chat_id", "action": "typing"}`.
- `accuse.py` : constantes `EMOJI = "👀"`, `DELAI_FRAPPE_S = 4`, `DELAI_MESSAGE_S = 15`,
  `PHRASE_DEFAUT = "Je regarde…"`, `PHRASES = {clé d'étape: phrase}` avec au moins :
  `lire_ecole` et `ecole_nouvelles` -> « Je lis les mails de l'école… » ; `lire_agenda`, `agenda_lire` ->
  « Je regarde l'agenda… » ; `lire_budget`, `question` -> « Je fais les comptes… » ; `web_recherche` ->
  « Je cherche sur internet… » ; `lire_courses` -> « Je regarde la liste de courses… » ; `lire_taches` ->
  « Je regarde les tâches… » ; `reflexion` -> « Je réfléchis… ».
- `class Suivi` (gestionnaire de contexte) : `__init__(telegram, chat_id, message_id, delai_frappe=…,
  delai_message=…, horloge=time.monotonic)`. `__enter__` : réaction puis typing immédiat, puis un
  `threading.Thread(daemon=True)` qui boucle sur `self._stop.wait(delai_frappe)` : typing, et une seule fois
  passé `delai_message` envoie `telegram.envoyer(chat_id, phrase courante)`. `etape(cle)` change la phrase
  courante. `__exit__` : stop, `join(timeout=2)`, ne masque jamais l'exception du bloc.
- `suivre(bot, msg)` : `contextlib.contextmanager` qui crée le Suivi, pose `bot.suivi`, le remet à None en
  sortie (finally). `signaler(bot, cle)` : `getattr(bot, "suivi", None)` puis `.etape(cle)` s'il existe ;
  ne lève jamais. task-002 l'appelle avant chaque lecture.
- `boucle_bot.traiter_update` : le traitement du texte ET celui de la pièce jointe s'exécutent dans
  `with accuse.suivre(bot, msg):` (msg après `groupe.filtrer`, `msg["message_id"]` ; absent -> pas de réaction).
  L'envoi de la réponse reste APRÈS le `with` (le typing s'arrête quand la réponse part).
- Journal : jamais le texte du message ; une ligne `accusé : réaction impossible (NomException)`.

## Pièges connus
- L-059 : un silence du bot est pris pour une panne ; d'où l'accusé, qui ne doit lui-même jamais faire planter la boucle.
- L-060 : vu du téléphone, un message incompris et un bot mort se ressemblent : rien ne doit rester sans signe.
- Tests : jamais de vrai Telegram ni de vrai `claude` ; délais injectés (0,01 s), pas de `time.sleep` de plusieurs secondes.
- Fichiers < 400 lignes, commentaires et docstrings en français, encodage utf-8.

## Implementation Plan
1. telegram.py : ajouter `reagir` et `signaler_frappe` (timeouts 15 s et 10 s, RuntimeError si not ok).
2. accuse.py (neuf) : constantes, `Suivi`, `suivre`, `signaler` selon la conception imposée.
3. boucle_bot.py : `with accuse.suivre(bot, msg):` autour du traitement texte et pièce jointe ; envoi après le `with`.
4. tests/bot/test_accuse.py : Telegram factice, horloge et délais injectés (0,01 s).
Preuve : AC1-2 par test_accuse.py, AC3 par la suite complète, AC4 par grep.
Réutilisation : réutilisé : style `_appel` de Telegram, logging du bot · extrait : rien · neuf : accuse.py (rien d'équivalent n'existait).

## Recette
Sans objet (pas d'écran) ; l'essai réel Telegram est fait par l'orchestrateur.

## Relecture

## Verdict
2026-11-28 · Valide · relu par l'orchestrateur, suite tests/bot rejouée : 866 verts.

## Implementation Notes
Fichiers : scripts/bot/accuse.py (+88, neuf), scripts/bot/telegram.py (+13), scripts/bot/boucle_bot.py (+11 -9), tests/bot/test_accuse.py (+112, neuf, 9 tests).
Tests : 823 avant (selon fiche), 841 après, 0 rouge. py_compile ok. `python outils/portes.py` : non lancé (outil absent du projet, non vérifié).
Écarts : conception respectée. `Suivi` journalise via le logger module `accuse` (pas `bot.log`, non passé au constructeur). `message_id` absent : pas de réaction, typing quand même. Le `return` « bruit de groupe » reste après le `with`.
- [x] #1 test_accuse.py vert (9 passed) : réaction 👀 sur le bon message_id, typing relancé, message une fois après seuil, phrase d'étape.
- [x] #2 test_echec_telegram_avale_et_journalise : warning « réaction impossible (RuntimeError) », sans contenu, traitement continu.
- [x] #3 `pytest -q tests/bot/` : 841 passed ; test_client_sans_methodes_tolere couvre l'AttributeError.

- [x] #4 grep : telegram.py:92 `reagir` (timeout 15), :99 `signaler_frappe` (timeout 10), RuntimeError si not ok.
DoD (garde) : VERT · 2026-11-28 01:30 · 841 tests
