"""Formulaires d'écriture de l'espace parent (brief bot-ecole-agenda, lot 5). Fonctions PURES : du HTML entre, des
valeurs simples sortent ; aucun réseau. Structure observée le 13/11/2026 (aucune valeur réelle ici) :

  fleurs-plantes-lundi : par date, la case « Nom » contient un <form method=POST> vers la même page ; champs cachés
                         `_token`, `child_id`, `flower_date_id` (+ `_method=DELETE` pour « Se désinscrire »).
                         Le formulaire de « Inscription » n'a pu être observé (aucune date libre ce jour-là) : on le suppose
                         identique sans `_method`, et on refuse d'écrire s'il manque un des trois champs ;
  agenda-du-gouter     : deux gabarits cachés (#registrationForm, #unregistrationForm : `_token`, `child_id`, `taste_date_id`,
                         + `_method=DELETE`) que le JS remplit avec l'`id` et le `child_id` de l'événement cliqué ;
  messagerie/<n>       : <form id=form> POST vers la page du chat ; champs `_token` et `message` (textarea).
"""
from urllib.parse import urlsplit

from outils import ecole_pages
from outils.ecole_pages import _soup, _norm, _texte, date_iso

LIBRE, NOUS, PRIS = "libre", "nous", "pris"
CHAMPS_FLEURS = frozenset({"_token", "child_id", "flower_date_id"})
CHAMPS_ENCAS = frozenset({"_token", "child_id", "taste_date_id"})


def _caches(form):
    """{nom: valeur} des champs cachés d'un formulaire."""
    return {i["name"]: i.get("value", "") for i in form.find_all("input", {"type": "hidden"}) if i.get("name")}


def formulaires_fleurs(html):
    """{date iso: {"etat": libre|nous|pris, "champs": {...}}} ; `champs` = champs cachés du formulaire de la case ({} sans formulaire)."""
    jours = {}
    for tr in _soup(html).select("table tr"):
        cellules = tr.find_all("td")
        iso = date_iso(_texte(cellules[0])) if len(cellules) >= 2 else ""
        if not iso:
            continue
        nous, libre, _pris = ecole_pages._cellule_fleurs(cellules[1])
        form = cellules[1].find("form")
        jours[iso] = {"etat": NOUS if nous else LIBRE if libre else PRIS, "champs": _caches(form) if form else {}}
    return jours


def formulaires_encas(html):
    """{date iso: {"libres": [{id, child_id}], "nous": {id, child_id} ou None}} et les champs cachés des deux gabarits :
    (jours, champs_inscription, champs_desinscription)."""
    jours = {}
    for e in ecole_pages._evenements_js(html):
        iso, titre = e.get("start", ""), _norm(e.get("title", ""))
        if not date_iso(iso) or e.get("dessert") == "1" or not e.get("id"):
            continue
        place = {"id": e["id"], "child_id": e.get("child_id", "")}
        jour = jours.setdefault(iso, {"libres": [], "nous": None})
        if titre == "inscription":
            jour["libres"].append(place)
        elif "desinscrire" in titre:
            jour["nous"] = place
    soupe = _soup(html)
    modeles = []
    for identifiant in ("registrationForm", "unregistrationForm"):
        bloc = soupe.find(id=identifiant)
        form = bloc.find("form") if bloc else None
        modeles.append(_caches(form) if form else {})
    return jours, modeles[0], modeles[1]


def chats_de_l_enfant(html, prenom=ecole_pages.PRENOM_ENFANT):
    """Numéros (chaînes) des fils de messagerie dont la ligne du tableau porte le prénom de l'enfant. Un fil d'un autre
    enfant n'est jamais rendu."""
    numeros = []
    for tr in _soup(html).select("table tr"):
        cellules, lien = tr.find_all("td"), tr.find("a", href=True)
        if not cellules or not lien or prenom not in _norm(_texte(cellules[0])).split():
            continue
        segments = urlsplit(lien["href"]).path.rstrip("/").rsplit("/", 1)
        if len(segments) == 2 and segments[1].isdigit() and segments[1] not in numeros:
            numeros.append(segments[1])
    return numeros


def champs_message(html):
    """Champs cachés (`_token`) du formulaire d'envoi d'un chat, ou {} s'il n'y en a pas (page changée ?)."""
    form = _soup(html).find("form", id="form")
    if form is None or form.find("textarea", {"name": "message"}) is None:
        return {}
    return _caches(form)
