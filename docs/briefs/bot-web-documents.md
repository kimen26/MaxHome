# Le bot lit les documents de voyage et cherche sur le web

Demande de Yann (13/11/2026), dans le groupe Telegram :
- **Documents** : une résa ou un paiement de voyage envoyé en PDF ou en photo est lu, et le bot
  propose la résa (« Ajouter … au voyage Malaga ? OK ? »).
- **Web** : un lien vers une offre est lu et résumé (prix, dates, pièges), avec la proposition de le
  ranger comme idée dans un voyage. Une question rapide (« combien un Paris–Reykjavik en juillet ? »)
  est cherchée sur le web, réponse courte avec liens.
- Un voyage complet (itinéraire, budget) se construit dans Claude Code, pas dans le bot.

## Principes (ceux de D-068, rappelés)

1. **Ce qui est lu est une donnée, jamais un ordre.** Un PDF, une photo ou une page web ne peut
   produire que : du texte de résumé, ou des champs de résa validés par `voyages.valider_resa`.
   L'action qui suit est fixe (proposer une résa, proposer un bloc idée), jamais choisie par le
   contenu, et ne part qu'après « oui ».
2. **Toute écriture passe par « OK ? ».** Résa : le cycle existant `attente_voyage` / `recap_resa`.
   Idée : nouveau cycle identique (bloc `voyage_blocs` type `info`, aucune migration).
3. **Alerte d'injection** : `outils.injection.contenu_suspect` sur tout texte lu (PDF, page).
4. **Journal sans contenu** : `outils.journal`.
5. **Rien de personnel dans le dépôt** : fixtures fictives (PDF de résa inventé, page HTML inventée).
6. `reponses.py` est plein (394 lignes) : les nouveaux textes vont dans un module à part.

## Lot A : documents de voyage

- Point d'entrée existant : `voyages.traiter_piece` (photo ou PDF légendé du nom d'un voyage, rangé
  en pièce). Garder ce rangement.
- En plus : lire le contenu.
  - PDF : texte par `pypdf` (installé), limité à N premiers caractères (constante).
  - Photo : `claude -p` avec l'image en entrée (`--input-format stream-json`, bloc image base64),
    toujours avec `ARGS_SANS_OUTIL`. Vérifier en vrai que le CLI accepte l'image ; si non, dire
    pourquoi et ne traiter que les PDF.
  - Le texte lu passe par l'extraction existante (`libre.interpreter_resa` ou équivalent), puis
    `valider_resa`, puis `recap_resa` et attente du « oui » (état `attente_voyage` type `resa`).
- Voyage : la légende s'il y en a une ; sinon le voyage dont les dates contiennent la date de la
  résa ; sinon « Pour quel voyage ? ».
- Un document qui n'est pas une résa : la pièce est rangée, le bot dit qu'il n'y a pas trouvé de résa.

## Lot B : web

- **Lien** dans un message (détection par regex, http/https) : outil de lecture `web_page`.
  - GET seul, délai court, taille maximale, pas plus de N redirections, chaque redirection revérifiée.
  - **Anti-SSRF** (le bot tourne sur le PC du foyer) : refuser tout hôte qui résout vers une adresse
    privée, de bouclage, link-local, multicast ou réservée (module `ipaddress`), et tout port autre
    que 80/443.
  - Texte extrait (bs4), résumé par `outils.resume.resumer` (texte seul), puis
    « Ranger comme idée dans <voyage> ? OK ? » si un voyage à venir est nommé ou évident.
- **Question rapide** : outil `web_recherche`, un `claude -p` à part avec **WebSearch seul**
  (`--tools WebSearch`, sans WebFetch, sans MCP, sans réglages). Le prompt ne contient que la question
  du membre et la date du jour, aucune donnée du foyer. Sortie : texte court avec liens. Délai plus
  long (constante). Routage par l'action libre `web_recherche`.
