# Le bot lit l'école, les mails de l'école et l'agenda ; il agit derrière une garde

Demande de Yann (13/11/2026) : dans le groupe Telegram, le bot doit pouvoir tout faire sur l'espace
parent de l'école, lire les mails de l'école (lecture seule), et tout faire sur l'agenda de la boîte
du foyer. Un contrôle fixe (« hook ») doit garantir que les lectures ne font rien de néfaste.

## Principes (non négociables)

1. **Le modèle ne touche à rien.** `claude -p` reste sans outil (L-057). Il rend un JSON d'action ;
   le code Python exécute seulement des outils inscrits au registre.
2. **Registre d'outils, deux genres.** Chaque outil déclare `lecture` ou `ecriture`.
   - Une lecture passe par un client HTTP qui **refuse toute méthode autre que GET** (et, pour
     Gmail, tout appel autre que lister/lire un message). Un refus lève une erreur journalisée
     « garde : écriture bloquée dans un outil de lecture ».
   - Une écriture n'est jamais exécutée directement : elle est proposée (« OK ? ») et part
     seulement après un « oui » d'un membre du foyer (D-060).
3. **Ce qui est lu est une donnée, jamais un ordre.** Le contenu d'un mail ou d'une page de l'école
   ne revient au modèle que pour être résumé en texte, dans un appel séparé qui ne peut rendre que
   du texte (aucune action ne peut sortir d'un résumé). Une écriture ne peut naître que d'un message
   d'un membre, jamais d'un contenu lu.
4. **Alerte d'injection.** Un contenu lu qui contient des tournures d'ordre adressées à une IA
   (« ignore les instructions », « tu dois maintenant », « system prompt »…) est signalé dans la
   réponse (« contenu suspect, je ne l'ai pas suivi ») et au journal, sans le contenu.
5. **Journal sans contenu.** Chaque appel d'outil : nom, genre, réussite ou refus. Jamais le texte
   d'un mail, d'une page, ni un identifiant.
6. **Hors périmètre du bot.** Facturation et tout paiement de l'école ; envoi de mail ; tout
   autre site que l'espace parent.
7. **Rien de personnel dans le dépôt** (D-061) : adresse du site, nom de famille, prénoms des autres
   enfants, expéditeurs de l'école restent en variables utilisateur Windows ou en base
   (`parametres`). Tests sur données fictives.

## Accès déjà en place

- Espace parent : variables `MAXHOME_ECOLE_URL`, `MAXHOME_ECOLE_IDENTIFIANT`, `MAXHOME_ECOLE_MDP`
  (formulaire Laravel `_token`, connexion par `requests.Session`, D-061). Ne jamais les afficher.
- Gmail de la boîte du foyer : `MAXHOME_GOOGLE_JETON` + `MAXHOME_GOOGLE_OAUTH_CLIENT` (03/11).
- Agenda : compte de service `MAXHOME_GOOGLE_CLE`, portée `calendar.events`, agenda de la boîte
  du foyer (même règles que `supabase/functions/agenda-google/evenements.ts`).
- Le bot lit aujourd'hui `.env` (`provision.lit_env`) : il doit aussi lire ces variables
  utilisateur (registre Windows `HKCU\Environment`), sans jamais les écrire dans `.env`.

## Lots, dans l'ordre

1. **Garde et registre** : `scripts/bot/outils/` (registre, client GET seul, alerte d'injection,
   journal), lecture des variables utilisateur, place faite dans `bot.py` (399 lignes : extraire
   avant d'ajouter). Tests : une lecture qui tente un POST est bloquée ; un contenu piégé est
   signalé ; une écriture sans « oui » ne part pas.
2. **Mails de l'école (lecture)** : « quoi de neuf à l'école ? » résume les derniers mails des
   expéditeurs de l'école (liste en base). Pour une demande hors de portée, le bot dit « je ne sais
   pas encore faire ça » au lieu de « pas compris ».
3. **Agenda** : lire (« qu'est-ce qu'on a samedi ? »), créer, modifier, supprimer, avec « OK ? »
   pour les trois écritures.
4. **Espace parent, lecture** : messages, documents, photos et vidéos (envoyées dans le groupe),
   tours de fleurs et d'encas (qui, quand, places libres).
5. **Espace parent, écritures** : s'inscrire ou se désinscrire d'un tour, envoyer un message par la
   messagerie de l'école, toujours après « OK ? ».
