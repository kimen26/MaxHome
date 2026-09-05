"""Doublures en mémoire pour les tests hors ligne du bot (aucun réseau)."""


class DonneesFausse:
    """Reproduit la surface de scripts/bot/donnees.py::Donnees, en mémoire."""

    def __init__(self, membres=None, charges=None, telegram_membres=None):
        self._membres = membres or [{"prenom": "Yann", "ordre": 1}, {"prenom": "Claudia", "ordre": 2}]
        self._charges = charges or []
        self._telegram_membres = telegram_membres or {6433455282: "Yann"}
        self._lignes = {}       # (annee, mois) -> {charge_id: montant}
        self._revenus = {}      # (annee, mois) -> {prenom: montant}
        self._ajustements = {}  # (annee, mois) -> [dict]
        self._virements = {}    # (annee, mois) -> {prenom: {"montant_centimes":..., "fait_le":...}}
        self._prochain_id_charge = 1000
        self._prochain_id_ajustement = 1

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

    def virements(self, annee, mois):
        return [{"prenom": p, **v} for p, v in self._virements.get((annee, mois), {}).items()]

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

    def maj_virement(self, annee, mois, prenom, montant_centimes, fait_le):
        self._virements.setdefault((annee, mois), {})[prenom] = {"montant_centimes": montant_centimes, "fait_le": fait_le}

    def inscrire_telegram(self, telegram_id, prenom):
        self._telegram_membres[telegram_id] = prenom


class TelegramFaux:
    """Capture les envois au lieu de parler au réseau."""

    def __init__(self):
        self.envoyes = []

    def envoyer(self, chat_id, texte):
        self.envoyes.append((chat_id, texte))
        return {"message_id": len(self.envoyes)}

    def get_updates(self, offset, timeout=50):
        return []
