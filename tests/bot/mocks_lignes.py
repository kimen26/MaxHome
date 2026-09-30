"""Doublure étendue pour les tests hors ligne de budget_lignes.py et virements_cli.mjs.

Sous-classe DonneesFausse (tests/bot/mocks.py, fichier partagé — jamais modifié ici) : ajoute
fait_le/fait_par sur les lignes (colonnes de la migration 021_lignes_fait.sql, absentes du mock
partagé), une table `comptes` en mémoire, et `_appel` — la méthode HTTP interne de donnees.py
que budget_lignes.py réutilise sans toucher à donnees.py (contrainte de l'arbre partagé).
"""
import re

from mocks import DonneesFausse


class DonneesFausseLignes(DonneesFausse):
    def __init__(self, comptes=None, **kwargs):
        super().__init__(**kwargs)
        self._comptes = comptes or []
        # lignes -> dict enrichi {montant_centimes, fait_le, fait_par}, indépendant de
        # DonneesFausse._lignes (qui ne stocke que le montant, pour les tests existants).
        self._validation_lignes = {}  # (annee, mois, charge_id) -> {fait_le, fait_par}

    def maj_ligne(self, annee, mois, charge_id, montant_centimes):
        super().maj_ligne(annee, mois, charge_id, montant_centimes)

    def comptes(self):
        return list(self._comptes)

    def lignes_mois_validation(self, annee, mois):
        """Équivalent de budget_lignes.lignes_mois_avec_validation, pour composer l'état JS."""
        lignes = self._lignes.get((annee, mois), {})
        out = []
        for cid, montant in lignes.items():
            v = self._validation_lignes.get((annee, mois, cid), {})
            out.append({"charge_id": cid, "montant_centimes": montant,
                        "fait_le": v.get("fait_le"), "fait_par": v.get("fait_par")})
        return out

    # ---------- simule la méthode HTTP interne de donnees.py::Donnees ----------
    def _appel(self, methode, chemin, corps=None, entetes_extra=None):
        if methode == "PATCH" and chemin.startswith("lignes?"):
            annee = int(re.search(r"annee=eq\.(\d+)", chemin).group(1))
            mois = int(re.search(r"mois=eq\.(\d+)", chemin).group(1))
            charge_id = int(re.search(r"charge_id=eq\.(\d+)", chemin).group(1))
            self._validation_lignes[(annee, mois, charge_id)] = {
                "fait_le": corps.get("fait_le"), "fait_par": corps.get("fait_par"),
            }
            return None
        if methode == "GET" and chemin.startswith("lignes?"):
            annee = int(re.search(r"annee=eq\.(\d+)", chemin).group(1))
            mois = int(re.search(r"mois=eq\.(\d+)", chemin).group(1))
            return self.lignes_mois_validation(annee, mois)
        if methode == "GET" and chemin.startswith("comptes?"):
            return self.comptes()
        raise RuntimeError(f"_appel non simulé pour les tests : {methode} {chemin}")
