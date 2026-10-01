"""Commande `libellé <charge|compte> <texte>` (alias `libelle`) : pose la valeur du mois sur le
mouvement non fait qui part vers ce compte (D-050) — même besoin que la feuille de détail d'un
groupe côté app (ui-groupes-virements.js), pas de réimplémentation de la règle effective ici :
elle vit dans frontend/budget/libelle-virement.js, appelée via le pont Node virements_cli.mjs
(L-014) comme pour `à virer`. Aucune logique de conversation ici : bot.py aiguille.
"""
import budget_lignes
import commandes
from reponses import normaliser


def _charge_vers_compte(bot, charge, comptes):
    """Compte où part le virement de `charge`, ou None si elle reste sur le commun."""
    recurrents = bot.donnees.recurrents_actifs()
    recurrent = budget_lignes.recurrent_de_charge(recurrents, charge["id"])
    if not recurrent or recurrent.get("compte_vers") is None:
        return None
    return next((c for c in comptes if c["id"] == recurrent["compte_vers"]), None)


def _separer_cible_et_valeur(bot, reste):
    """La cible (compte ou charge, peut être multi-mots : « École Max ») n'a pas de séparateur
    fixe avec le texte à poser — comme `lieu <voyage> <nom du lieu>` (voyages.py), on essaie les
    coupures de la plus longue à la plus courte et on garde la première qui désigne un compte ou
    une charge envoyée ailleurs que le commun. Retourne (compte, valeur, erreur)."""
    comptes = budget_lignes.comptes(bot.donnees)
    charges = budget_lignes.charges_actives(bot.charges)
    mots = reste.split()
    for n in range(len(mots) - 1, 0, -1):
        cible_norm = normaliser(" ".join(mots[:n]))
        valeur = " ".join(mots[n:])
        compte, _ = commandes.meilleur_flou(cible_norm, comptes, "nom")
        if compte:
            return compte, valeur, None
        charge, _ = commandes.meilleur_libelle(cible_norm, charges)
        if charge:
            compte = _charge_vers_compte(bot, charge, comptes)
            if not compte:
                return None, None, f"« {charge['libelle']} » ne part pas vers un autre compte : rien à libeller."
            return compte, valeur, None
    return None, None, f"Aucun compte ni charge ne correspond dans « {reste} »."


def _mouvement_vers(bot, compte_id, annee, mois):
    """Mouvement non fait du mois dont le trajet va vers `compte_id` — via le pont Node pour
    rester sur la même notion de trajet que groupes-virements.js (compte_de peut être null,
    `compte perso de X`, etc. : pas une seconde définition en Python)."""
    recurrents = bot.donnees.recurrents_actifs()
    mouvements = bot.donnees.mouvements(annee, mois)
    candidats = [m for m in mouvements if m.get("compte_vers") == compte_id and not m.get("fait_le")]
    if not candidats:
        return None
    # Au plus un virement actif par trajet en pratique (D-048) : le premier suffit.
    return candidats[0]


def libelle(bot, telegram_id, reste, annee, mois):
    compte, valeur, erreur = _separer_cible_et_valeur(bot, reste)
    if erreur:
        return erreur
    if not valeur:
        return "Format : `libellé <charge ou compte> <texte du virement>`."
    mouvement = _mouvement_vers(bot, compte["id"], annee, mois)
    if not mouvement:
        return f"Aucun virement en attente vers « {compte['nom']} » ce mois."
    avant = {"libelle_virement": mouvement.get("libelle_virement")}
    bot.donnees.maj_mouvement(mouvement["id"], {"libelle_virement": valeur})
    bot.marquer_annulable(telegram_id, "mouvement_libelle", {"id": mouvement["id"]}, avant)
    return f"Libellé de « {mouvement['titre']} » : {valeur}"
