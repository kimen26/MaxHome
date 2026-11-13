"""Faux espace parent de l'école : HTML FICTIF qui imite la structure observée (contenus et noms inventés),
et une session qui répond à partir de pages écrites à la main. Aucune adresse ni aucun nom réels.
"""
from types import SimpleNamespace
from urllib.parse import urlsplit

ORIGINE = "https://ecole-fictive.test"
AUTRE_ENFANT = "Zéphyrin"   # prénom inventé d'un autre enfant : ne doit jamais ressortir
AUTRE_ENFANT_2 = "Capucine"

CONNEXION = ('<form action="https://ecole-fictive.test/parent/connexion" method="POST">'
             '<input type="hidden" name="_token" value="jeton-fictif"><input name="email"><input name="password"></form>')

MESSAGERIE = ('<table><tr><th>Enfant(s)</th><th>Action</th></tr><tr><td> Max Dupondt </td>'
              '<td><a href="https://ecole-fictive.test/parent/messagerie/7">Ouvrir le chat</a></td></tr></table>')


def panneau(couleur, titre, texte):
    return (f'<div class="panel panel-{couleur}"><div class="panel-heading"><h3 class="panel-title">\n\t{titre}\n</h3></div>'
            f'<div class="panel-body">{texte}</div></div>')


CHAT = "".join([
    panneau("primary", "MOI - 03/11/2026 21h53", "Merci pour la communication."),
    panneau("rose", "DUPONDT Claudia - 02/11/2026 08h27", "Nous serons en retard ce matin."),
    panneau("rose", "DUPONDT Claudia - 02/11/2026 08h27", "Nous serons en retard ce matin."),  # doublon
    panneau("rose", "Hélène - 08/10/2026 18h54", "Max peut partir à 13h jeudi."),
    panneau("rose", " - 01/07/2026 11h53", "Chers parents, la fête est le 20."),
])

DOCUMENTS = ('<table><tr><th>Document</th><th>Date</th><th>Action</th></tr>'
             '<tr><td colspan="2">Règlement intérieur (Max DUPONDT)</td>'
             '<td><a href="https://ecole-fictive.test/parent/reglement-interieur/9">Télécharger</a></td></tr>'
             '<tr><td>Calendrier annuel 2026/2027 (Max DUPONDT)</td><td>06/11/2026</td>'
             '<td><a href="https://ecole-fictive.test/upload/document/Calendrier 2026:2027.pdf">Télécharger</a></td></tr>'
             '<tr><td>Liste de fournitures (2/2) (Max DUPONDT)</td><td>06/06/2026</td>'
             '<td><a href="https://ecole-fictive.test/upload/document/fournitures.pdf">Télécharger</a></td></tr></table>')


def ligne_photo(col1, col2, fichier):
    return (f'<tr><td>{col1}</td><td>{col2}</td><td><a class="btn" target="_blank" '
            f'href="https://ecole-fictive.test/upload/photo_video/{fichier}">Voir</a></td></tr>')


PHOTOS = ('<table><tr><th colspan="3">Enfant Max Dupondt</th></tr>'
          + ligne_photo("05/11/2026", "Les enfants peignent.", "peinture 1.jpg")
          + ligne_photo("05/11/2026", "Les enfants jouent dehors.", "dehors.JPG")
          + ligne_photo("05/11/2026", "Chant en classe.", "chant.mp4")
          + ligne_photo("16.10.2026", "Visite au parc.", "parc.jpg")
          + ligne_photo("Sacs oubliés", "Merci d'identifier les sacs.", "sacs.jpg")
          + "</table>")

FLEURS = ('<table class="table blue"><tr><th>Date</th><th>Nom</th></tr>'
          f'<tr><td class="first">07 septembre 2026</td><td> {AUTRE_ENFANT} </td></tr>'
          f'<tr><td class="first">16 novembre 2026</td><td> {AUTRE_ENFANT}, {AUTRE_ENFANT_2} </td></tr>'
          '<tr><td class="first">23 novembre 2026</td><td><form method="POST" action="x"><button class="btn btn-xs btn-success" '
          'type="submit">Inscription</button></form></td></tr>'
          '<tr><td class="first">07 décembre 2026</td><td><form method="POST" action="x"><input name="_method" type="hidden" '
          'value="DELETE"><button class="btn btn-xs btn-danger" type="submit">Se désinscrire</button></form></td></tr>'
          '<tr><td class="first">14 décembre 2026</td><td> Max </td></tr></table>')


def evenement(id_, titre, jour, extra=""):
    return ("{ id: '%s', title: '%s', start: '%s', end: '%s', className: 'text-center', %s }," % (id_, titre, jour, jour, extra))


ENCAS = ("<script>$('#calendar').fullCalendar({ locale: 'fr', events: [\n"
         + evenement(1, "Pommes", "2026-11-17", "dessert: 1")
         + evenement(1, AUTRE_ENFANT, "2026-11-17", "child_id: '5', dessert: 0")
         + evenement(2, "Kiwis", "2026-11-24", "dessert: 1")
         + evenement(2, "Inscription", "2026-11-24", "child_id: '5', backgroundColor: '#5cb85c', dessert: 0")
         + evenement(2, "Inscription", "2026-11-24", "child_id: '5', backgroundColor: '#5cb85c', dessert: 0")
         + evenement(3, "Clémentines", "2026-11-26", "dessert: 1")
         + evenement(3, "Se désinscrire", "2026-11-26", "child_id: '5', backgroundColor: '#d9534f', dessert: 0")
         + evenement(4, "Poires", "2026-09-01", "dessert: 1")
         + evenement(4, AUTRE_ENFANT_2, "2026-09-01", "dessert: 0")
         + "\n], eventClick: function(e) { } });</script>")

PAGES = {"/parent/messagerie": MESSAGERIE, "/parent/messagerie/7": CHAT, "/parent/documents": DOCUMENTS,
         "/parent/photos-videos": PHOTOS, "/parent/tableau/fleurs-plantes-lundi": FLEURS,
         "/parent/tableau/agenda-du-gouter": ENCAS, "/parent/connexion": CONNEXION,
         "/parent/facturation": "<h1>Facturation fictive</h1>"}
OCTETS = {"/upload/photo_video/peinture%201.jpg": b"\xff\xd8photo1", "/upload/photo_video/dehors.JPG": b"\xff\xd8photo2",
          "/upload/photo_video/chant.mp4": b"video", "/upload/document/Calendrier%202026%3A2027.pdf": b"%PDF-calendrier"}


class Reponse(SimpleNamespace):
    pass


class SessionEcole:
    """Session factice : note chaque requête ; répond par les PAGES (HTML) ou les OCTETS (fichiers)."""

    def __init__(self, pages=None, octets=None, redirections=()):
        self.pages, self.octets, self.redirections = dict(pages or PAGES), dict(octets or OCTETS), set(redirections)
        self.requetes, self.headers = [], {}

    def request(self, methode, url, **kwargs):
        self.requetes.append((methode, url, kwargs))
        chemin = urlsplit(url).path
        if chemin in self.redirections:
            return Reponse(status_code=302, text="", content=b"", url=url, headers={})
        if chemin in self.octets:
            return Reponse(status_code=200, text="", content=self.octets[chemin], url=url,
                           headers={"Content-Length": str(len(self.octets[chemin]))})
        if chemin in self.pages:
            return Reponse(status_code=200, text=self.pages[chemin], content=b"", url=url, headers={})
        return Reponse(status_code=404, text="", content=b"", url=url, headers={})

    def get(self, url, **kwargs):
        return self.request("GET", url, **kwargs)

    def post(self, url, **kwargs):
        return self.request("POST", url, **kwargs)

    def methodes(self):
        return [m for m, _, _ in self.requetes]
