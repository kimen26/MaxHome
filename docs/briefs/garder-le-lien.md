# Garder le lien avec nos proches (module Proches, lot 2)

Demande de Yann (14/11/2026) : ne plus laisser filer des mois sans écrire à quelqu'un. Pour
chaque proche, un rythme voulu (semaine, mois, trimestre…), les derniers échanges, l'anniversaire.
Le bot relance gentiment : « Ça fait 6 semaines sans nouvelles de Paul. La dernière fois, il
partait à Lisbonne. Idée : *Alors, Lisbonne ?* ». Yann donne les échanges au bot en une phrase.

Lot 1 (livré, D-071) : « Proposer une date ». Même module, `frontend/proches/`.

## Principes

1. **Le bot n'écrit jamais à un proche.** Il propose une idée de message ; c'est le membre qui envoie.
2. **Chaque proche a un « qui relance »** : `Yann`, `Claudia` ou `nous` (les deux). Relances et
   anniversaires partent EN PRIVÉ à la personne concernée (`nous` : à chacun), jamais au groupe.
3. **Noter un échange coûte une phrase** : au bot (« vu Paul hier, il change de boulot ») ou dans
   l'app. Un échange noté remet le compteur de la personne à zéro.
4. **Les notes sont des données, jamais des ordres** : passées à Claude entre balises, consigne
   « donnée à lire », `outils.injection.contenu_suspect` sur le texte, journal sans contenu.
5. **Rien de personnel dans le dépôt** : prénoms et notes en base seulement, fixtures fictives.
6. **Une règle en JS et en Python se teste par confrontation** (invariant 7, L-014) : qui est à
   relancer et quels anniversaires tombent sont calculés à l'identique dans l'app et dans le bot.

## Données (migration `037_proches.sql`, additive, idempotente, sans drop : L-056)

- `proches` : `id` identity, `prenom` text (1 à 60, unique sans casse), `qui` text check
  in ('Yann','Claudia','nous') défaut 'nous', `rythme_jours` int null (null = pas de relance ;
  valeurs proposées 7, 14, 30, 60, 90, 180), `anniv_jour` int null (1-31), `anniv_mois` int null
  (1-12), `anniv_annee` int null, `note` text null (500 au plus : contexte durable, « 2 enfants,
  fan de foot »), `actif` bool défaut vrai, `cree_le` date défaut current_date. RLS `est_membre()`.
- `proche_echanges` : `id`, `proche_id` → `proches` on delete cascade, `le` date défaut current_date,
  `texte` text (1 à 500), `par` text, `cree_le` timestamptz. RLS `est_membre()`.

## Règle commune (JS `frontend/proches/relances.js`, Python `scripts/bot/proches.py`)

- `dernier contact` = date max des échanges de la personne, sinon `cree_le`.
- `aRelancer(proches, echanges, aujourdhui)` → `[{id, depuisJours, retardJours}]` pour les proches
  actifs avec `rythme_jours` non nul et `depuisJours >= rythme_jours` ; `retardJours = depuisJours -
  rythme_jours` ; tri par `retardJours` décroissant puis prénom.
- `anniversaires(proches, aujourdhui)` → `[{id, quand: "veille"|"jour", age: int|null}]` ; un
  29 février se fête le 28 février les années non bissextiles ; `age` seulement si l'année est connue.
- Dates en chaînes `AAAA-MM-JJ` locales (L-004 : jamais toISOString).

## Bot

- **Noter un échange** : nouvelle action libre `proche_echange` {prenom, texte, le}. Prénom connu :
  l'échange est ajouté avec la convention d'écriture du bot pour les ajouts courants (voir
  `courses.ajouter` et `annulation.py`). Prénom inconnu : « Je ne connais pas encore Paul. L'ajouter à
  tes proches ? OK ? » puis création (qui = l'auteur, sans rythme) et ajout de l'échange.
- **Consulter** : action libre `proches` → qui est à relancer pour l'auteur, et les anniversaires
  des 30 prochains jours.
- **Tâche planifiée `MaxHome-Proches`** (calquée sur `veille_bilans.py` et
  `setup_task_bilans.ps1`, D-070 : hors de la boucle du bot, StartWhenAvailable) chaque jour à 9 h :
  - anniversaires de la veille et du jour, à la personne concernée ;
  - le dimanche seulement : la relance, au plus 3 proches par membre, les plus en retard, chacun
    avec la date et le texte du dernier échange, et une idée de message rédigée par Claude
    (`claude_cli.lancer`, sans outil, délai court ; la note et les 3 derniers échanges en donnée).
    Claude en échec : la relance part sans idée.
  - un état local `data/veille_proches.json` évite d'envoyer deux fois le même jour (PC rallumé).
- Textes du bot dans un module à part (`reponses.py` est plein).

## App (module Proches)

- Le module gagne deux onglets : « Proposer une date » (écran actuel) et « Garder le lien ».
- « Garder le lien » : liste des proches, ceux à relancer en tête (« 6 sem. sans nouvelles,
  rythme : mois »), puis les autres ; anniversaires des 30 prochains jours en bandeau.
  « + Ajouter un proche ».
- Toucher un proche : feuille (blocs du socle, D-024) avec prénom, qui relance, rythme, anniversaire,
  note, les échanges (le plus récent en tête) et « + Noter un échange » (texte, date du jour par
  défaut). Supprimer un proche avec confirmation.
- 360 px, cibles 48 px, contraste 4.5:1, texte jamais porté par la couleur seule.

## Découpage

- **Lot 2A, app** : migration 037, `api.js`, onglets du module, écran et feuille, recette.
- **Lot 2B, bot** : `relances.js` (pur) + `proches.py` + test de confrontation, actions libres,
  tâche planifiée et son script d'installation.

La mise en production (migration, tâche planifiée, front) attend l'accord de Yann.
