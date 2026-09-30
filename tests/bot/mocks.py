"""Doublures en mémoire pour les tests hors ligne du bot (aucun réseau)."""


class DonneesFausse:
    """Reproduit la surface de scripts/bot/donnees.py::Donnees, en mémoire."""

    def __init__(self, membres=None, charges=None, telegram_membres=None, recurrents=None,
                 taches_recurrentes=None, voyages=None):
        self._membres = membres or [{"prenom": "Yann", "ordre": 1}, {"prenom": "Claudia", "ordre": 2}]
        self._charges = charges or []
        self._telegram_membres = telegram_membres or {6433455282: "Yann"}
        self._lignes = {}       # (annee, mois) -> {charge_id: montant}
        self._revenus = {}      # (annee, mois) -> {prenom: montant}
        self._ajustements = {}  # (annee, mois) -> [dict]
        self._recurrents = recurrents if recurrents is not None else recurrents_part(self._membres)
        self._mouvements = []   # liste de dicts, comme la table
        self._taches_rec = taches_recurrentes if taches_recurrentes is not None else taches_rec_defaut()
        self._taches = []
        self._prochain_id_tache = 1
        self._courses = []
        self._prochain_id_course = 0
        self._prochain_id_charge = 1000
        self._prochain_id_ajustement = 1
        self._prochain_id_mouvement = 1
        self._voyages = voyages if voyages is not None else []
        self._lieux = []
        self._resas = []
        self._pieces = []
        self._blocs = []
        self._enveloppes = []
        self._stockage = {}  # chemin -> (contenu, type_mime)
        self._prochain_id_lieu = 1
        self._prochain_id_resa = 1
        self._prochain_id_piece = 1
        self._prochain_id_bloc = 1

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
            m = {"id": self._prochain_id_mouvement, "consigne": None, "fait_le": None, "fait_par": None, **l}
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

    # ---------- module Courses ----------
    def courses(self):
        return [dict(a) for a in self._courses]

    def creer_course(self, champs):
        self._prochain_id_course += 1
        a = {"id": self._prochain_id_course, "quantite": None, "coche_le": None,
             "coche_par": None, "ajoute_le": "2026-09-06T10:00:00+00:00", **champs}
        self._courses.append(a)
        return dict(a)

    def supprimer_course(self, id_):
        self._courses = [a for a in self._courses if a["id"] != id_]

    # ---------- module Tâches ----------
    def taches_recurrentes(self):
        return [dict(r) for r in self._taches_rec if r.get("actif", True)]

    def taches(self, depuis):
        return [dict(t) for t in self._taches if not t["fait_le"] or t["echeance"] >= depuis]

    def creer_taches(self, lignes):
        crees = []
        for l in lignes:
            t = {"id": self._prochain_id_tache, "fait_le": None, "qui": None, "qui2": None,
                 "parts_quart": 0, **l}
            self._prochain_id_tache += 1
            self._taches.append(t)
            crees.append(dict(t))
        return crees

    def maj_tache(self, id_, champs):
        for t in self._taches:
            if t["id"] == id_:
                t.update(champs)
                return dict(t)
        raise RuntimeError(f"tache {id_} introuvable")

    def supprimer_taches(self, ids):
        self._taches = [t for t in self._taches if t["id"] not in set(ids)]

    # ---------- module Voyages (carnet, D-045) ----------
    def voyages(self):
        return [dict(v) for v in self._voyages]

    def voyage(self, id_):
        return next((dict(v) for v in self._voyages if v["id"] == id_), None)

    def lieux_voyage(self, voyage_id):
        return [dict(l) for l in self._lieux if l["voyage_id"] == voyage_id]

    def resas_voyage(self, voyage_id):
        return [dict(r) for r in self._resas
                if r["voyage_id"] == voyage_id and r.get("statut") != "annule"]

    def creer_lieu(self, champs):
        l = {"id": self._prochain_id_lieu, "lat": None, "lng": None, "adresse": None,
             "jour": None, "ordre": 0, "note": None, "lien": None, **champs}
        self._prochain_id_lieu += 1
        self._lieux.append(l)
        return dict(l)

    def maj_lieu(self, id_, champs):
        for l in self._lieux:
            if l["id"] == id_:
                l.update(champs)
                return dict(l)
        raise RuntimeError(f"lieu {id_} introuvable")

    def supprimer_lieu(self, id_):
        self._lieux = [l for l in self._lieux if l["id"] != id_]

    def creer_resa(self, champs):
        r = {"id": self._prochain_id_resa, "statut": "reserve", **champs}
        self._prochain_id_resa += 1
        self._resas.append(r)
        return dict(r)

    def maj_resa(self, id_, champs):
        for r in self._resas:
            if r["id"] == id_:
                r.update(champs)
                return dict(r)
        raise RuntimeError(f"résa {id_} introuvable")

    def maj_voyage(self, id_, champs):
        for v in self._voyages:
            if v["id"] == id_:
                v.update(champs)
                return dict(v)
        raise RuntimeError(f"voyage {id_} introuvable")

    def creer_piece(self, champs):
        p = {"id": self._prochain_id_piece, **champs}
        self._prochain_id_piece += 1
        self._pieces.append(p)
        return dict(p)

    def upload_stockage(self, chemin, contenu_binaire, type_mime):
        self._stockage[chemin] = (contenu_binaire, type_mime)

    def supprimer_stockage(self, chemin):
        self._stockage.pop(chemin, None)

    # ---------- module Voyages : blocs et budget (V2, D-047) ----------
    def blocs_voyage(self, voyage_id):
        return [dict(b) for b in self._blocs if b["voyage_id"] == voyage_id]

    def bloc_resume(self, voyage_id):
        return next((dict(b) for b in self._blocs if b["voyage_id"] == voyage_id and b["type"] == "resume"), None)

    def creer_bloc(self, champs):
        b = {"id": self._prochain_id_bloc, "titre": None, "ordre": 0, **champs}
        self._prochain_id_bloc += 1
        self._blocs.append(b)
        return dict(b)

    def maj_bloc(self, id_, champs):
        for b in self._blocs:
            if b["id"] == id_:
                b.update(champs)
                return dict(b)
        raise RuntimeError(f"bloc {id_} introuvable")

    def enveloppes_voyage(self, voyage_id):
        return [dict(e) for e in self._enveloppes if e["voyage_id"] == voyage_id]


def recurrents_part(membres):
    """Les deux récurrents « part » issus de la migration 005 (virement au commun)."""
    return [{"id": i + 1, "titre": f"Virement au commun — {m['prenom']}", "compte_de": None,
             "compte_vers": 10, "mode": "part", "montant_centimes": None, "charge_id": None,
             "prenom_part": m["prenom"], "qui": m["prenom"], "jour": 5, "consigne": None,
             "ordre": m["ordre"], "actif": True}
            for i, m in enumerate(membres)]


def taches_rec_defaut():
    """Trois tâches récurrentes couvrant les trois fréquences génératrices et « au besoin ».

    `moment` (012_moment.sql) : la quotidienne est réglée au matin par défaut, hebdo/au_besoin
    restent à None — seule une quotidienne porte un moment en base, comme en production.
    """
    return [
        {"id": 1, "titre": "Laver les biberons", "categorie": "Enfant", "frequence": "quotidien",
         "fois": 2, "parts_quart": 4, "obligatoire": True, "partageable": False,
         "ecart_prenom": None, "attribue_a": None, "consigne": None, "ordre": 10, "actif": True,
         "moment": "matin"},
        {"id": 2, "titre": "Étendre et plier le linge", "categorie": "Linge", "frequence": "hebdo",
         "fois": 1, "parts_quart": 20, "obligatoire": False, "partageable": False,
         "ecart_prenom": None, "attribue_a": "Claudia", "consigne": None, "ordre": 20, "actif": True,
         "moment": None},
        {"id": 3, "titre": "Sortir la poubelle", "categorie": "Déchets", "frequence": "au_besoin",
         "fois": 1, "parts_quart": 12, "obligatoire": False, "partageable": False,
         "ecart_prenom": None, "attribue_a": None, "consigne": None, "ordre": 30, "actif": True,
         "moment": None},
    ]


class TelegramFaux:
    """Capture les envois au lieu de parler au réseau."""

    def __init__(self):
        self.envoyes = []

    def envoyer(self, chat_id, texte):
        self.envoyes.append((chat_id, texte))
        return {"message_id": len(self.envoyes)}

    def get_updates(self, offset, timeout=50):
        return []
