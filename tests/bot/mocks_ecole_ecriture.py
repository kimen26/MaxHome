"""Faux espace parent AVEC formulaires d'écriture : HTML FICTIF (noms et identifiants inventés) qui imite la structure
observée (voir outils/ecole_formulaires.py). L'état (qui est inscrit, quels messages) vit dans la session : un POST accepté le
change, un POST « refusé » n'y touche pas, et la page relue le montre. Aucune écriture réelle nulle part.
"""
from urllib.parse import urlsplit

from mocks_ecole import ORIGINE, AUTRE_ENFANT, Reponse, SessionEcole, evenement, panneau

LIBRE, NOUS, PRIS = "libre", "nous", "pris"
FLEURS0 = {"2026-11-16": PRIS, "2026-11-23": LIBRE, "2026-12-07": NOUS, "2026-12-14": LIBRE}
# date -> (identifiant du jour, état)
ENCAS0 = {"2026-11-17": (1, PRIS), "2026-11-24": (2, LIBRE), "2026-11-26": (3, NOUS), "2026-12-03": (4, LIBRE)}
CHAT_AUTRE_ENFANT = "8"
MESSAGERIE = ('<table><tr><th>Enfant(s)</th><th>Action</th></tr>'
              f'<tr><td> Max Dupondt </td><td><a href="{ORIGINE}/parent/messagerie/7">Ouvrir le chat</a></td></tr>'
              f'<tr><td> {AUTRE_ENFANT} Dupondt </td><td><a href="{ORIGINE}/parent/messagerie/{CHAT_AUTRE_ENFANT}">Ouvrir le chat</a></td></tr>'
              '</table>')


def _cache(nom, valeur):
    return f'<input name="{nom}" type="hidden" value="{valeur}">'


def _fleurs(etats, champs_complets=True):
    lignes = []
    for i, (iso, etat) in enumerate(sorted(etats.items())):
        jour = f"{iso[8:]}/{iso[5:7]}/{iso[:4]}"
        ids = _cache("child_id", "5") + _cache("flower_date_id", str(400 + i)) if champs_complets else ""
        if etat == PRIS:
            cellule = f" {AUTRE_ENFANT} "
        elif etat == LIBRE:
            cellule = (f'<form method="POST" action="{ORIGINE}/parent/tableau/fleurs-plantes-lundi">'
                       f'{_cache("_token", "jeton-fictif")}{ids}<button class="registration">Inscription</button></form>')
        else:
            cellule = (f'<form method="POST" action="{ORIGINE}/parent/tableau/fleurs-plantes-lundi">{_cache("_method", "DELETE")}'
                       f'{_cache("_token", "jeton-fictif")}{ids}<button class="unregistration">Se désinscrire</button></form>')
        lignes.append(f'<tr><td class="first">{jour}</td><td>{cellule}</td></tr>')
    return '<table class="table blue"><tr><th>Date</th><th>Nom</th></tr>' + "".join(lignes) + "</table>"


def _encas(etats):
    evts = []
    for iso, (id_, etat) in sorted(etats.items()):
        evts.append(evenement(id_, "Pommes", iso, "dessert: 1"))
        if etat == PRIS:
            evts.append(evenement(id_, AUTRE_ENFANT, iso, "child_id: '5', dessert: 0"))
        elif etat == LIBRE:
            evts.append(evenement(id_, "Inscription", iso, "child_id: '5', dessert: 0"))
        else:
            evts.append(evenement(id_, "Se désinscrire", iso, "child_id: '5', dessert: 0"))
    action = f"{ORIGINE}/parent/tableau/agenda-du-gouter"
    gabarit = f'<form method="POST" action="{action}">%s{_cache("_token", "jeton-fictif")}{_cache("child_id", "")}{_cache("taste_date_id", "")}</form>'
    return ("<div id=\"registrationForm\" class=\"hide\">" + gabarit % "" + "</div>"
            "<div id=\"unregistrationForm\" class=\"hide\">" + gabarit % _cache("_method", "DELETE") + "</div>"
            "<script>$('#c').fullCalendar({ events: [\n" + "".join(evts) + "\n], eventClick: function(e) { } });</script>")


def _chat(messages):
    corps = "".join(panneau("primary", f"MOI - 12/11/2026 {10 + i}h00", m) for i, m in enumerate(messages))
    formulaire = (f'<form method="POST" action="{ORIGINE}/parent/messagerie/7" id="form">{_cache("_token", "jeton-fictif")}'
                  '<textarea required="required" name="message"></textarea><input type="submit" value="ENVOYER"></form>')
    return formulaire + corps + panneau("rose", "Hélène - 08/10/2026 18h54", "Bonjour.")


class SessionEcriture(SessionEcole):
    """Espace parent fictif qui accepte (ou, si `accepte` est faux, ignore) les POST de formulaire. Garde tous les POST."""

    def __init__(self, accepte=True, fleurs=None, encas=None, champs_fleurs_complets=True):
        super().__init__()
        self.accepte, self.fleurs, self.encas = accepte, dict(fleurs or FLEURS0), dict(encas or ENCAS0)
        self.messages, self.posts, self.champs_complets = [], [], champs_fleurs_complets

    def request(self, methode, url, **kwargs):
        chemin = urlsplit(url).path
        if methode == "POST":
            donnees = dict(kwargs.get("data") or {})
            self.requetes.append((methode, url, kwargs))
            self.posts.append((chemin, donnees))
            if self.accepte:
                self._appliquer(chemin, donnees)
            return Reponse(status_code=302, text="", content=b"", url=url, headers={})
        self.pages = {"/parent/messagerie": MESSAGERIE, "/parent/messagerie/7": _chat(self.messages),
                      "/parent/tableau/fleurs-plantes-lundi": _fleurs(self.fleurs, self.champs_complets),
                      "/parent/tableau/agenda-du-gouter": _encas(self.encas)}
        return super().request(methode, url, **kwargs)

    def _appliquer(self, chemin, donnees):
        supprimer = donnees.get("_method") == "DELETE"
        if chemin.endswith("fleurs-plantes-lundi"):
            iso = sorted(self.fleurs)[int(donnees["flower_date_id"]) - 400]
            self.fleurs[iso] = LIBRE if supprimer else NOUS
        elif chemin.endswith("agenda-du-gouter"):
            iso = next(i for i, (id_, _) in self.encas.items() if str(id_) == donnees["taste_date_id"])
            self.encas[iso] = (self.encas[iso][0], LIBRE if supprimer else NOUS)
        elif chemin == "/parent/messagerie/7":
            self.messages.append(donnees["message"])

    def methodes_post(self):
        return [m for m, _, _ in self.requetes if m != "GET"]
