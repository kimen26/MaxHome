"""Table de dispatch de `annuler` (restaure la dernière écriture) — extrait de bot.py pour
rester sous la norme du projet (< 400 lignes/fichier). Une fonction par table touchée par
marquer_annulable ; bot.py::annuler ne fait plus qu'appeler restaurer().
"""
import budget_lignes


def restaurer(donnees, table, cle, ancienne):
    """Applique l'annulation pour `table` (voir bot.py::marquer_annulable pour la provenance de
    chaque table). Lève RuntimeError si `table` est inconnue."""
    if table == "revenus":
        donnees.maj_revenu(cle["annee"], cle["mois"], cle["prenom"], ancienne)
    elif table == "lignes":
        donnees.maj_ligne(cle["annee"], cle["mois"], cle["charge_id"], ancienne)
    elif table == "ajustements":
        donnees.supprimer_ajustement(cle["id"])
    elif table == "courses":
        donnees.supprimer_course(cle["id"])
    elif table == "taches":
        donnees.maj_tache(cle["id"], ancienne)
    elif table == "mouvements":
        donnees.maj_mouvement(cle["id"], {"fait_le": ancienne["fait_le"],
                                          "montant_centimes": ancienne["montant_centimes"],
                                          "fait_par": ancienne.get("fait_par")})
    elif table == "voyage_lieux":
        donnees.supprimer_lieu(cle["id"])  # toujours une création fraîche
    elif table == "voyage_resas":
        donnees.maj_resa(cle["id"], {"statut": "annule"})  # traçable, jamais un DELETE
    elif table == "lignes_validation":  # `valider`/`dévalider` (D-048 §1) : ligne + mouvement lié
        budget_lignes.restaurer_validation(donnees, ancienne)
    elif table == "mouvement_et_ligne":  # `fait <titre>` sur un mouvement mode "charge"
        budget_lignes.restaurer_mouvement_et_ligne(donnees, cle["mouvement_id"], ancienne)
    else:
        raise RuntimeError(f"annulation non gérée pour la table {table}")
