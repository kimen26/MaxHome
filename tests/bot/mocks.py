"""Doublures en mémoire pour les tests hors ligne du bot (aucun réseau)."""


class DonneesFausse:
    """Reproduit la surface de scripts/bot/donnees.py::Donnees, en mémoire."""

    def __init__(self, membres=None, charges=None, telegram_membres=None, recurrents=None):
        self._membres = membres or [{"prenom": "Yann", "ordre": 1}, {"prenom": "Claudia", "ordre": 2}]
        self._charges = charges or []
        self._telegram_membres = telegram_membres or {6433455282: "Yann"}
        self._lignes = {}       # (annee, mois) -> {charge_id: montant}
        self._revenus = {}      # (annee, mois) -> {prenom: montant}
        self._ajustements = {}  # (annee, mois) -> [dict]
        self._recurrents = recurrents if recurrents is not None else recurrents_part(self._membres)
        self._mouvements = []   # liste de dicts, comme la table
        self._prochain_id_charge = 1000
        self._prochain_id_ajustement = 1
        self._prochain_id_mouvement = 1

    # ---------- lecture ----------
    def membre_telegram(self, telegram_id):
        return self._telegram_membres.get(telegram_id)

    def membres(self):
        return self._membres

    def charges(self):
        return list(self._charges)

    def mois(self, annee, mois):
        lignes = [{"charge_id": cid, "montant_centimes": m} for cid, m in self._lignes.get((annee, mois), {}).items()]
        revenus = [{"prenom": p, "montant_centimes": m} for p, m in self._revenus.get((annee, mois), {}).items()]
        return lignes, revenus

    def ajustements(self, annee, mois):
        return list(self._ajustements.get((annee, mois), []))

    def recurrents_actifs(self):
        return [r for r in self._recurrents if r.get("actif", True)]

    def mouvements(self, annee, mois):
        return [dict(m) for m in self._mouvements if (m["annee"], m["mois"]) == (annee, mois)]

    def lignes_mois(self, annee, mois):
        return [{"charge_id": cid, "montant_centimes": m} for cid, m in self._lignes.get((annee, mois), {}).items()]

    def revenus_mois(self, annee, mois):
        return [{"prenom": p, "montant_centimes": m} for p, m in self._revenus.get((annee, mois), {}).items()]

    # ---------- écriture ----------
    def maj_revenu(self, annee, mois, prenom, montant_centimes):
        self._revenus.setdefault((annee, mois), {})[prenom] = montant_centimes

    def maj_ligne(self, annee, mois, charge_id, montant_centimes):
        self._lignes.setdefault((annee, mois), {})[charge_id] = montant_centimes

    def creer_charge(self, champs):
        self._prochain_id_charge += 1
        c = {**champs, "id": self._prochain_id_charge}
        self._charges.append(c)
        return c

    def creer_ajustement(self, champs):
        self._prochain_id_ajustement += 1
        reg = {**champs, "id": self._prochain_id_ajustement}
        self._ajustements.setdefault((champs["annee"], champs["mois"]), []).append(reg)
        return reg

    def supprimer_ajustement(self, id_):
        for cle, liste in self._ajustements.items():
            self._ajustements[cle] = [a for a in liste if a["id"] != id_]

    def creer_mouvements(self, lignes):
        crees = []
        for l in lignes:
            m = {"id": self._prochain_id_mouvement, "consigne": None, "fait_le": None, **l}
            self._prochain_id_mouvement += 1
            self._mouvements.append(m)
            crees.append(dict(m))
        return crees

    def maj_mouvement(self, id_, champs):
        for m in self._mouvements:
            if m["id"] == id_:
                m.update(champs)
                return dict(m)
        raise RuntimeError(f"mouvement {id_} introuvable")

    def inscrire_telegram(self, telegram_id, prenom):
        self._telegram_membres[telegram_id] = prenom


def recurrents_part(membres):
    """Les deux récurrents « part » issus de la migration 005 (virement au commun)."""
    return [{"id": i + 1, "titre": f"Virement au commun — {m['prenom']}", "compte_de": None,
             "compte_vers": 10, "mode": "part", "montant_centimes": None, "charge_id": None,
             "prenom_part": m["prenom"], "qui": m["prenom"], "jour": 5, "consigne": None,
             "ordre": m["ordre"], "actif": True}
            for i, m in enumerate(membres)]


class TelegramFaux:
    """Capture les envois au lieu de parler au réseau."""

    def __init__(self):
        self.envoyes = []

    def envoyer(self, chat_id, texte):
        self.envoyes.append((chat_id, texte))
        return {"message_id": len(self.envoyes)}

    def get_updates(self, offset, timeout=50):
        return []
