"""Validation d'une ligne de charge par le bot (D-046, D-048) : `valider <charge> [pour <prénom>]`,
`pas validé <charge>` / `dévalider <charge>`, et le lien avec le mouvement d'un récurrent en
mode "charge" (montant figé à la première coche, coche-ligne.js).

Miroir côté bot de frontend/budget/coche-ligne.js : même cycle logique (rien -> prénom -> ...),
mais ici on VISE directement un prénom (« valider pour Claudia »), pas un cran de cycle — donc
pas de dépendance au pont Node pour cette partie : les règles de coche-ligne.js sont assez
simples (fait_le posé une fois, montant figé une fois) pour être reproduites fidèlement ici sans
diverger, contrairement au regroupement (groupes-virements.js) qui, lui, passe par virements_cli.mjs.
Aucune logique de conversation ici : bot.py aiguille, actions.py appelle, reponses.py formate.
"""
from datetime import datetime, timezone


def maj_ligne_validation(donnees, annee, mois, charge_id, champs):
    """Écrit fait_le/fait_par sur la ligne du mois — donnees.py (interdit à modifier) n'a pas
    cette méthode : on réutilise sa méthode HTTP interne `_appel`, comme un upsert PATCH ciblé
    (la ligne existe déjà forcément, `valider_ligne` a vérifié son montant avant d'appeler ici)."""
    donnees._appel("PATCH", f"lignes?annee=eq.{annee}&mois=eq.{mois}&charge_id=eq.{charge_id}", champs)


def lignes_mois_avec_validation(donnees, annee, mois):
    """`donnees.lignes_mois` (interdit à modifier) ne sélectionne pas fait_le/fait_par — on
    relit la table nous-mêmes via `_appel`, mêmes colonnes que coche-ligne.js a besoin de lire."""
    return donnees._appel(
        "GET", f"lignes?annee=eq.{annee}&mois=eq.{mois}&select=charge_id,montant_centimes,fait_le,fait_par")


def comptes(donnees):
    """`donnees.py` (interdit à modifier) n'a pas de lecture de la table `comptes` — le bot en a
    besoin pour le trajet et l'IBAN des groupes de virements (D-048 §3-4)."""
    return donnees._appel("GET", "comptes?select=*")


def recurrent_de_charge(recurrents, charge_id):
    """Récurrent actif en mode "charge" pour cette charge, ou None (règle : au plus un, D-042)."""
    return next((r for r in recurrents if r.get("actif") and r.get("mode") == "charge"
                 and r.get("charge_id") == charge_id), None)


def mouvement_de(mouvements, recurrent_id):
    return next((m for m in mouvements if m.get("recurrent_id") == recurrent_id), None)


def charges_actives(charges):
    """Filtre D-043 : une charge terminée (`actif: false`) n'est plus proposée par le fuzzy
    (saisie de montant, validation) — seule l'écran Mois continue de l'afficher si elle garde
    une ligne ce mois, mais le bot ne la propose jamais en repli grammatical."""
    return [c for c in charges if c.get("actif") is not False]


def valider_ligne_seule(donnees, annee, mois, charge, prenom_cible, valider):
    """Écrit fait_le/fait_par sur la LIGNE seulement, sans toucher à un mouvement lié éventuel —
    pour bot.py::_valider_ligne_si_mouvement_charge, appelé juste APRÈS que mouvements.basculer a
    déjà coché ce mouvement : `valider_ligne` complet réécrirait le même mouvement une seconde
    fois pour rien (le montant reste identique, mais deux PATCH réseau au lieu d'un). Refuse
    silencieusement (avant=None) si la ligne n'a pas de montant, sans message utilisateur : cet
    appel est un effet de bord de `fait <titre>`, pas une commande directe (bot.py décide seul
    du texte renvoyé, budget_virements.valider gère le message pour `valider`/`dévalider`).
    Retourne `avant` ({"annee", "mois", "charge_id", "ligne"}) ou None si rien n'a été écrit.
    """
    lignes = lignes_mois_avec_validation(donnees, annee, mois)
    ligne = next((l for l in lignes if l["charge_id"] == charge["id"]), None)
    if not ligne or not ligne.get("montant_centimes"):
        return None
    avant_ligne = {"fait_le": ligne.get("fait_le"), "fait_par": ligne.get("fait_par")}
    champs = ({"fait_le": datetime.now(timezone.utc).isoformat(), "fait_par": prenom_cible} if valider
              else {"fait_le": None, "fait_par": None})
    maj_ligne_validation(donnees, annee, mois, charge["id"], champs)
    return {"annee": annee, "mois": mois, "charge_id": charge["id"], "ligne": avant_ligne,
            "mouvement_id": None, "mouvement": None}


def valider_ligne(donnees, annee, mois, charge, prenom_cible, valider, membres):
    """Valide (ou dévalide) la ligne du mois de `charge` pour `prenom_cible`.

    `valider` = True pour `valider`, False pour `pas validé`/`dévalider`.
    Retourne (texte_confirmation, avant) ou (message_erreur, None) — `avant` sert à l'annulation
    (bot.py::annuler, table "lignes_validation" à ajouter, restaure ligne ET mouvement lié).
    """
    if valider and prenom_cible not in membres:
        return f"Prénom inconnu : {prenom_cible}.", None

    lignes = lignes_mois_avec_validation(donnees, annee, mois)
    ligne = next((l for l in lignes if l["charge_id"] == charge["id"]), None)
    if not ligne or not ligne.get("montant_centimes"):
        return f"Saisis d'abord le montant de {charge['libelle']}.", None

    avant_ligne = {"fait_le": ligne.get("fait_le"), "fait_par": ligne.get("fait_par")}
    if valider:
        champs_ligne = {"fait_le": datetime.now(timezone.utc).isoformat(), "fait_par": prenom_cible}
    else:
        champs_ligne = {"fait_le": None, "fait_par": None}

    maj_ligne_validation(donnees, annee, mois, charge["id"], champs_ligne)

    recurrents = donnees.recurrents_actifs()
    recurrent = recurrent_de_charge(recurrents, charge["id"])
    avant_mouvement = None
    mouvement_id = None
    if recurrent:
        mouvements = donnees.mouvements(annee, mois)
        mouvement = mouvement_de(mouvements, recurrent["id"])
        if mouvement:
            mouvement_id = mouvement["id"]
            avant_mouvement = {"fait_le": mouvement.get("fait_le"), "fait_par": mouvement.get("fait_par"),
                                "montant_centimes": mouvement["montant_centimes"]}
            premiere_coche = not avant_ligne["fait_le"] and valider
            champs_mouvement = {"fait_le": champs_ligne["fait_le"], "fait_par": champs_ligne["fait_par"]}
            if premiere_coche:
                champs_mouvement["montant_centimes"] = mouvement["montant_centimes"]
            donnees.maj_mouvement(mouvement_id, champs_mouvement)

    avant = {"annee": annee, "mois": mois, "charge_id": charge["id"], "ligne": avant_ligne,
             "mouvement_id": mouvement_id, "mouvement": avant_mouvement}
    if valider:
        texte = f"{charge['libelle']} : validé pour {prenom_cible} ✔"
    else:
        texte = f"{charge['libelle']} : validation annulée."
    return texte, avant


def restaurer_validation(donnees, avant):
    """Annule la dernière `valider`/`dévalider` — appelée par bot.py::annuler, cas "lignes_validation"."""
    maj_ligne_validation(donnees, avant["annee"], avant["mois"], avant["charge_id"], avant["ligne"])
    if avant["mouvement_id"] is not None and avant["mouvement"] is not None:
        donnees.maj_mouvement(avant["mouvement_id"], avant["mouvement"])


def restaurer_mouvement_et_ligne(donnees, mouvement_id, ancienne):
    """Restaure un mouvement ET sa ligne de charge liée, écrits ensemble par
    bot.py::basculer_mouvement — bot.py::annuler, cas "mouvement_et_ligne"."""
    donnees.maj_mouvement(mouvement_id, ancienne["mouvement"])
    restaurer_validation(donnees, ancienne["ligne"])


def valider_ligne_si_mouvement_charge(donnees, charges, mouvement, prenom, fait):
    """Valide (ou dévalide) la ligne de charge liée à ce mouvement, si son récurrent est en mode
    "charge" (D-046 §3) — pour bot.py::basculer_mouvement, appelé juste APRÈS que
    mouvements.basculer a déjà coché ce mouvement (sans quoi l'app afficherait la charge comme
    non validée alors que son virement est fait, le mouvement ne réapparaissant plus dans
    « à faire »). Retourne le `avant` de valider_ligne_seule, ou None si rien n'a été écrit
    (pas de récurrent lié, ou pas de montant saisi)."""
    recurrent = next((r for r in donnees.recurrents_actifs() if r["id"] == mouvement.get("recurrent_id")), None)
    if not recurrent or recurrent.get("mode") != "charge":
        return None
    charge = next((c for c in charges if c["id"] == recurrent["charge_id"]), None)
    if not charge:
        return None
    cible = prenom if fait else None
    # valider_ligne_seule (pas valider_ligne) : mouvements.basculer vient déjà d'écrire CE
    # mouvement, une deuxième écriture dessus serait redondante (même montant figé, mais un
    # aller-retour réseau de plus pour rien). `avant` None (pas de montant saisi) : la ligne
    # reste non validée, mais le mouvement, lui, EST coché — un écart visible au bilan/à virer
    # plutôt qu'une écriture forcée douteuse.
    return valider_ligne_seule(donnees, mouvement["annee"], mouvement["mois"], charge, cible, fait)
