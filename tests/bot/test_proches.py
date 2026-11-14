"""Garder le lien côté bot : la règle (confrontée à frontend/proches/relances.js, L-014), noter un échange,
consulter. Hors ligne : Supabase, Telegram et claude sont des doublures. Prénoms fictifs.
"""
import json
import logging
import subprocess
from datetime import date
from pathlib import Path

import pytest

import bot as bot_mod
import libre
import proches
import reponses
import reponses_proches as textes
from mocks import DonneesFausse

RACINE = Path(__file__).resolve().parent.parent.parent
RELANCES_JS = "file:///" + str(RACINE / "frontend" / "proches" / "relances.js").replace("\\", "/")
YANN, CLAUDIA = 6433455282, 2222222222
AUJOURDHUI = date(2026, 11, 14)  # un samedi


def proche(id_, prenom, **champs):
    base = {"id": id_, "prenom": prenom, "qui": "Yann", "rythme_jours": None, "anniv_jour": None, "anniv_mois": None,
            "anniv_annee": None, "note": None, "actif": True, "cree_le": "2026-01-01"}
    return {**base, **champs}


def echange(id_, proche_id, le, texte="on s'est parlé"):
    return {"id": id_, "proche_id": proche_id, "le": le, "texte": texte, "par": "Yann", "cree_le": le + "T10:00:00Z"}


# ---------- la règle ----------
def test_a_relancer_trie_par_retard_puis_prenom_et_ignore_les_autres():
    tous = [
        proche(1, "Zoé", rythme_jours=30, cree_le="2026-09-01"),      # 74 j, retard 44
        proche(2, "Émile", rythme_jours=30, cree_le="2026-09-01"),    # même retard : Émile avant Zoé (sans accent)
        proche(3, "Lou", rythme_jours=7),                              # contact récent, pas à relancer
        proche(4, "Max", rythme_jours=None),                           # pas de rythme
        proche(5, "Eva", rythme_jours=30, actif=False),                # inactif
        proche(6, "Ana", rythme_jours=60, cree_le="2026-10-01"),       # 44 j < 60 : pas encore
        proche(7, "Noé", rythme_jours=14, cree_le="2026-10-31"),       # 14 j pile : à relancer, retard 0
    ]
    echs = [echange(1, 3, "2026-11-10"), echange(2, 1, "2026-09-01")]
    r = proches.a_relancer(tous, echs, AUJOURDHUI)
    assert [x["id"] for x in r] == [2, 1, 7]
    assert r[0] == {"id": 2, "depuis_jours": 74, "retard_jours": 44}
    assert r[2]["retard_jours"] == 0


def test_un_echange_remet_le_compteur_a_zero():
    p = proche(1, "Paul", rythme_jours=30, cree_le="2026-01-01")
    assert proches.dernier_contact(p, []) == "2026-01-01"
    assert [x["id"] for x in proches.a_relancer([p], [], AUJOURDHUI)] == [1]
    echs = [echange(1, 1, "2026-11-13"), echange(2, 1, "2026-10-01"), echange(3, 99, "2026-11-14")]
    assert proches.dernier_contact(p, echs) == "2026-11-13"
    assert proches.a_relancer([p], echs, AUJOURDHUI) == []


def test_anniversaires_veille_jour_age_et_29_fevrier():
    tous = [proche(1, "Ana", anniv_jour=14, anniv_mois=11, anniv_annee=1990),
            proche(2, "Bob", anniv_jour=15, anniv_mois=11),
            proche(3, "Cléo", anniv_jour=16, anniv_mois=11),
            proche(4, "Dan", anniv_jour=1, anniv_mois=1, anniv_annee=2000),
            proche(5, "Eli", anniv_jour=29, anniv_mois=2, anniv_annee=2000),
            proche(6, "Fay", anniv_jour=31, anniv_mois=4)]  # date invalide : ignorée
    assert proches.anniversaires(tous, AUJOURDHUI) == [
        {"id": 1, "jour": "2026-11-14", "dans_jours": 0, "age": 36},
        {"id": 2, "jour": "2026-11-15", "dans_jours": 1, "age": None}]
    assert [a["id"] for a in proches.anniversaires(tous, AUJOURDHUI, 30)] == [1, 2, 3]
    # 29 février : fêté le 28 les années non bissextiles
    assert proches.anniversaires(tous, date(2027, 2, 27))[0] == {"id": 5, "jour": "2027-02-28", "dans_jours": 1, "age": 27}
    assert proches.anniversaires(tous, date(2028, 2, 28))[0]["jour"] == "2028-02-29"


# ---------- confrontation JS / Python (invariant 7, L-014) ----------
TOUS = [
    proche(1, "Ana", rythme_jours=30, cree_le="2026-06-01", anniv_jour=15, anniv_mois=11, anniv_annee=1985),
    proche(2, "Émile", rythme_jours=7, cree_le="2026-11-01", anniv_jour=29, anniv_mois=2, anniv_annee=2000),
    proche(3, "Zoé", rythme_jours=7, cree_le="2026-11-01", anniv_jour=1, anniv_mois=1),
    proche(4, "Max", rythme_jours=None, anniv_jour=31, anniv_mois=12, anniv_annee=1970),
    proche(5, "Eva", rythme_jours=14, actif=False, anniv_jour=14, anniv_mois=11),
    proche(6, "Lou", rythme_jours=90, cree_le="2026-01-01", anniv_jour=31, anniv_mois=4),   # date invalide
    proche(7, "Noé", rythme_jours=14, cree_le="2026-10-31", anniv_jour=28, anniv_mois=2),
    proche(8, "ana", rythme_jours=30, cree_le="2026-06-01", anniv_jour=15, anniv_mois=11),  # même prénom sans casse
    proche(9, "Ivo", rythme_jours=0, anniv_jour=1, anniv_mois=1, anniv_annee=2030),         # rythme nul, né « plus tard »
]
ECHANGES = [echange(1, 1, "2026-09-02"), echange(2, 1, "2026-09-20"), echange(3, 7, "2026-11-14"),
            echange(4, 2, "2026-10-05"), echange(5, 99, "2026-11-14")]
JOURS = ["2026-11-14", "2026-12-31", "2027-02-27", "2027-02-28", "2028-02-28", "2028-02-29", "2026-02-28", "2027-01-01"]
HORIZONS = [0, 1, 30, 400]


def _js(corps):
    script = ("import('" + RELANCES_JS + "').then(m => console.log(JSON.stringify(" + corps + ")))")
    r = subprocess.run(["node", "--input-type=module", "-e", script], capture_output=True, text=True,
                       encoding="utf-8", timeout=30)
    assert r.returncode == 0, r.stderr[:300]
    return json.loads(r.stdout)


def test_a_relancer_identique_au_frontend():
    attendu = [[{"id": x["id"], "depuisJours": x["depuis_jours"], "retardJours": x["retard_jours"]}
                for x in proches.a_relancer(TOUS, ECHANGES, date.fromisoformat(j))] for j in JOURS]
    entrees = f"{json.dumps(TOUS)}, {json.dumps(ECHANGES)}"
    obtenu = _js(f"{json.dumps(JOURS)}.map(j => m.aRelancer({entrees}, j))")
    assert obtenu == attendu
    assert any(attendu), "la confrontation doit porter sur de vraies relances"


def test_anniversaires_identiques_au_frontend():
    cas = [(j, h) for j in JOURS for h in HORIZONS]
    attendu = [[{"id": x["id"], "jour": x["jour"], "dansJours": x["dans_jours"], "age": x["age"]}
                for x in proches.anniversaires(TOUS, date.fromisoformat(j), h)] for j, h in cas]
    obtenu = _js(f"{json.dumps(cas)}.map(([j, h]) => m.anniversaires({json.dumps(TOUS)}, j, h))")
    assert obtenu == attendu
    assert any(attendu), "la confrontation doit porter sur de vrais anniversaires"
    obtenu_defaut = _js(f"{json.dumps(JOURS)}.map(j => m.anniversaires({json.dumps(TOUS)}, j))")
    assert obtenu_defaut == [[{"id": x["id"], "jour": x["jour"], "dansJours": x["dans_jours"], "age": x["age"]}
                              for x in proches.anniversaires(TOUS, date.fromisoformat(j))] for j in JOURS]


def test_dernier_contact_identique_au_frontend():
    attendu = [proches.dernier_contact(p, ECHANGES) for p in TOUS]
    assert _js(f"{json.dumps(TOUS)}.map(p => m.dernierContact(p, {json.dumps(ECHANGES)}))") == attendu


# ---------- le bot : noter un échange, consulter ----------
class DonneesProches(DonneesFausse):
    def __init__(self, *args, **kw):
        super().__init__(*args, **kw)
        self._proches, self._proche_echanges, self._suivant = [], [], 1

    def _id(self):
        self._suivant += 1
        return self._suivant

    def proches(self):
        return [dict(p) for p in self._proches]

    def proche_echanges(self):
        return [dict(e) for e in self._proche_echanges]

    def creer_proche(self, champs):
        p = proche(self._id(), **champs)
        self._proches.append(p)
        return dict(p)

    def creer_proche_echange(self, champs):
        e = {"id": self._id(), "cree_le": "2026-11-14T09:00:00Z", **champs}
        self._proche_echanges.append(e)
        return dict(e)

    def supprimer_proche(self, id_):
        self._proches = [p for p in self._proches if p["id"] != id_]
        self._proche_echanges = [e for e in self._proche_echanges if e["proche_id"] != id_]

    def supprimer_proche_echange(self, id_):
        self._proche_echanges = [e for e in self._proche_echanges if e["id"] != id_]


@pytest.fixture
def bot(monkeypatch):
    monkeypatch.setattr(libre, "aujourdhui", lambda: AUJOURDHUI)
    b = bot_mod.Bot.__new__(bot_mod.Bot)
    b.log = logging.getLogger("test-proches")
    b.donnees = DonneesProches(telegram_membres={YANN: "Yann", CLAUDIA: "Claudia"})
    b.telegram = None
    b.charges, b.membres, b.etats = [], ["Yann", "Claudia"], {}
    return b


@pytest.fixture
def modele(monkeypatch):
    def installer(*reponses_modele):
        file = list(reponses_modele)
        monkeypatch.setattr(libre, "interpreter", lambda *a, **k: file.pop(0))
    return installer


def echange_libre(prenom="Paul", texte="il change de boulot", le=None):
    return {"action": "proche_echange", "prenom": prenom, "texte": texte, "le": le}


def test_prenom_connu_ajoute_tout_de_suite_et_annulable(bot, modele):
    bot.donnees._proches.append(proche(1, "Paul"))
    modele(echange_libre("paul", "il change de boulot", "2026-11-13"))
    rep = bot.traiter_message(YANN, "vu Paul hier, il change de boulot")
    assert rep == textes.echange_note("Paul", "il change de boulot")
    [e] = bot.donnees.proche_echanges()
    assert (e["proche_id"], e["le"], e["texte"], e["par"]) == (1, "2026-11-13", "il change de boulot", "Yann")
    assert bot.traiter_message(YANN, "annuler") == "Dernière écriture annulée."
    assert bot.donnees.proche_echanges() == []


def test_date_absente_c_est_aujourd_hui(bot, modele):
    bot.donnees._proches.append(proche(1, "Paul"))
    modele(echange_libre())
    bot.traiter_message(YANN, "vu Paul, il change de boulot")
    assert bot.donnees.proche_echanges()[0]["le"] == "2026-11-14"


def test_prenom_inconnu_propose_puis_cree_sur_un_oui(bot, modele):
    modele(echange_libre("Paul", "il part à Lisbonne"))
    rep = bot.traiter_message(CLAUDIA, "vu Paul, il part à Lisbonne")
    assert rep == "Je ne connais pas encore Paul. L'ajouter à tes proches ? OK ?"
    assert bot.donnees.proches() == [], "rien n'est écrit avant le oui"
    rep = bot.traiter_message(CLAUDIA, "oui")
    assert rep.startswith("Paul ajouté à tes proches.")
    [p] = bot.donnees.proches()
    assert (p["prenom"], p["qui"], p["rythme_jours"]) == ("Paul", "Claudia", None)
    [e] = bot.donnees.proche_echanges()
    assert (e["proche_id"], e["par"], e["texte"]) == (p["id"], "Claudia", "il part à Lisbonne")
    bot.traiter_message(CLAUDIA, "annuler")
    assert bot.donnees.proches() == [] and bot.donnees.proche_echanges() == []


def test_prenom_inconnu_refuse_ne_cree_rien(bot, modele):
    modele(echange_libre("Paul"))
    bot.traiter_message(YANN, "vu Paul, il change de boulot")
    assert bot.traiter_message(YANN, "non") == "OK, rien fait."
    assert bot.donnees.proches() == []


def test_proche_cree_entre_la_proposition_et_le_oui_n_est_pas_double(bot, modele):
    modele(echange_libre("Paul"))
    bot.traiter_message(YANN, "vu Paul, il change de boulot")
    bot.donnees._proches.append(proche(1, "Paul"))  # ajouté depuis l'app entre-temps
    bot.traiter_message(YANN, "oui")
    assert len(bot.donnees.proches()) == 1 and len(bot.donnees.proche_echanges()) == 1


@pytest.mark.parametrize("interp,attendu", [
    (echange_libre(prenom=""), textes.question_texte()),
    (echange_libre(texte=" "), textes.question_texte("Paul")),
    (echange_libre(texte="x" * 501), textes.TEXTE_TROP_LONG),
    (echange_libre(le="demain-ish"), textes.QUESTION_DATE),
    (echange_libre(le="2026-12-01"), textes.QUESTION_DATE),   # une date à venir n'est pas un échange
])
def test_champs_invalides_posent_une_question_sans_rien_ecrire(bot, modele, interp, attendu):
    bot.donnees._proches.append(proche(1, "Paul"))
    modele(interp)
    assert bot.traiter_message(YANN, "vu Paul") == attendu
    assert bot.donnees.proche_echanges() == []


def test_consulter_ne_montre_que_les_proches_de_l_auteur(bot, modele):
    bot.donnees._proches += [proche(1, "Paul", qui="Yann", rythme_jours=30, cree_le="2026-10-01"),
                             proche(2, "Marie", qui="Claudia", rythme_jours=30, cree_le="2026-10-01"),
                             proche(3, "Lou", qui="nous", anniv_jour=20, anniv_mois=11, anniv_annee=2000)]
    modele({"action": "proches"}, {"action": "proches"})
    rep = bot.traiter_message(YANN, "qui dois-je relancer ?")
    assert "Paul : 6 semaines sans nouvelles" in rep and "Marie" not in rep
    assert "Lou : le 20 novembre (26 ans)" in rep
    assert "Paul" not in bot.traiter_message(CLAUDIA, "qui dois-je relancer ?").replace("Marie", "")  # chacun les siens


def test_consulter_sans_rien(bot, modele):
    modele({"action": "proches"})
    assert bot.traiter_message(YANN, "des proches à relancer ?") == textes.RIEN_A_FAIRE


def test_les_textes_et_le_routage_existent():
    assert "proche_creer" in reponses.RECAPS
    assert textes.duree(3) == "3 jours" and textes.duree(42) == "6 semaines" and textes.duree(200) == "6 mois"
    assert "proche_echange" in libre.REGLES and '"action":"proches"' in libre.REGLES
