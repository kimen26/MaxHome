"""Lecture des pages de l'espace parent de l'école (brief bot-ecole-agenda, lot 4). Fonctions PURES : du HTML
entre, des valeurs simples sortent ; aucun réseau, aucun identifiant (voir espace_parent.py).

Structure observée le 13/11/2026 (aucune valeur réelle ici) :
  messagerie        : un tableau « enfant | Ouvrir le chat » (lien /parent/messagerie/<n>) ; la page du chat est une
                      suite de `div.panel` dont le titre est « Nom - jj/mm/aaaa HHhMM » (« MOI » = nous), le texte dans
                      `.panel-body`, du plus récent au plus ancien, avec des doublons ;
  documents         : tableau Document | Date | Action ; les lignes datées pointent /upload/document/<fichier> ;
  photos-videos     : tableau, UNE ligne = UN média : date (formats variés) ou titre | texte | lien « Voir » ;
  fleurs-plantes-lundi : tableau Date | Nom ; un bouton « Inscription » = libre, « Se désinscrire » = notre tour ;
  agenda-du-gouter  : FullCalendar, `events: [ {...}, ... ]` en JS ; par jour un événement « aliment » (dessert: 1)
                      puis un par place (titre = prénom, « Inscription » vert = libre, « Se désinscrire » rouge = nous).
Le prénom d'un autre enfant n'est jamais rendu : seuls « nous », « libre » et « pris » (en nombre) sortent.
"""
import re
import unicodedata
from datetime import date
from urllib.parse import quote, unquote, urljoin, urlsplit

PRENOM_ENFANT = "max"
EXTENSIONS_VIDEO = frozenset({"mp4", "mov", "m4v", "webm", "avi", "3gp"})
CHAT_NOUS = "nous"
EXPEDITEUR_ECOLE = "l'école"

_MOIS = {m: i for i, m in enumerate(
    "janvier fevrier mars avril mai juin juillet aout septembre octobre novembre decembre".split(), 1)}
_RE_ISO = re.compile(r"(\d{4})-(\d{2})-(\d{2})")
_RE_JJMMAAAA = re.compile(r"(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})")
_RE_JOUR_MOIS = re.compile(r"(\d{1,2}) ([a-z]+) (\d{4})")
_RE_ENFANT_ENTRE_PARENTHESES = re.compile(r"\s*\(\s*" + PRENOM_ENFANT + r"\b[^()]*\)\s*$", re.IGNORECASE)
_RE_PRENOM_ENFANT = re.compile(rf"\b{PRENOM_ENFANT}\b", re.IGNORECASE)
_RE_MOT_MAJUSCULE = re.compile(r"\b[A-ZÀ-Ý][A-ZÀ-Ý'-]+\b")
_RE_TITRE_CHAT = re.compile(r"^(.*?)\s*-\s*(\d{2})/(\d{2})/(\d{4})\s+(\d{1,2})h(\d{2})\s*$")
_RE_CHAT = re.compile(r"/parent/messagerie/\d+")
_RE_BLOC_EVENEMENT = re.compile(r"\s*\{([^{}]*)\}\s*,?")
_RE_CHAMP = re.compile(r"(\w+)\s*:\s*(?:'((?:[^'\\]|\\.)*)'|([^\s,]+))")


def _soup(html):
    from bs4 import BeautifulSoup  # installé dans C:\Python311 ; importé ici comme requests (registre.py)
    return BeautifulSoup(html, "html.parser")


def _norm(texte):
    sans = unicodedata.normalize("NFD", str(texte)).encode("ascii", "ignore").decode()
    return " ".join(sans.lower().split())


def _texte(noeud):
    return " ".join(noeud.get_text(" ", strip=True).split())


def date_iso(texte):
    """« 05/11/2026 », « 16.10.2026 », « 08-10-2026 », « 07 décembre 2026 », « 2026-11-05 » -> « 2026-11-05 » ; « » sinon."""
    brut = str(texte)
    m = _RE_ISO.fullmatch(brut.strip())
    if m:
        try:
            return date(*map(int, m.groups())).isoformat()
        except ValueError:
            return ""
    for motif, ordre in ((_RE_JJMMAAAA, "jma"), (_RE_JOUR_MOIS, "jta")):
        m = motif.search(brut if ordre == "jma" else _norm(brut))
        if not m:
            continue
        j, mois, a = m.groups()
        try:
            return date(int(a), int(mois) if ordre == "jma" else _MOIS[mois], int(j)).isoformat()
        except (ValueError, KeyError):
            continue
    return ""


def url_encodee(origine, href):
    """URL absolue d'un lien de la page, chemin ré-encodé (espaces, accents, deux-points des noms de fichier)."""
    parties = urlsplit(urljoin(origine + "/", href.strip()))
    return f"{parties.scheme}://{parties.netloc}{quote(unquote(parties.path), safe='/%')}"


# ---------- messagerie ----------
def parser_chats(html, origine):
    liens = []
    for a in _soup(html).find_all("a", href=True):
        url = url_encodee(origine, a["href"])
        if _RE_CHAT.fullmatch(urlsplit(url).path) and url not in liens:
            liens.append(url)
    return liens


def _expediteur(nom):
    """« MOI » et tout titre qui porte un nom de famille en capitales (un parent) : « nous ». Le personnel de
    l'école s'affiche par son prénom seul. Un nom de famille n'est jamais rendu."""
    if _norm(nom) == "moi" or _RE_MOT_MAJUSCULE.search(nom):
        return CHAT_NOUS
    return " ".join(nom.split()) or EXPEDITEUR_ECOLE


def parser_messages(html):
    """Messages d'un chat, du plus récent au plus ancien, sans doublon : {date (aaaa-mm-jj), heure, expediteur, texte}."""
    vus, messages = set(), []
    for panneau in _soup(html).select("div.panel"):
        titre, corps = panneau.select_one(".panel-title"), panneau.select_one(".panel-body")
        m = _RE_TITRE_CHAT.match(_texte(titre)) if titre else None
        if not m or not corps:
            continue
        nom, j, mois, a, h, mn = m.groups()
        message = {"date": f"{a}-{mois}-{j}", "heure": f"{int(h):02d}:{mn}", "expediteur": _expediteur(nom),
                   "texte": _texte(corps)}
        cle = (message["date"], message["heure"], message["texte"])
        if cle not in vus:
            vus.add(cle)
            messages.append(message)
    return messages


# ---------- documents ----------
def parser_documents(html, origine):
    """Documents datés avec un fichier téléversé : {date, titre, url}, du plus récent au plus ancien.
    Les formulaires générés (/parent/...) n'ont pas de date : ce ne sont pas des nouveautés."""
    documents = []
    for tr in _soup(html).select("table tr"):
        cellules, lien = tr.find_all("td"), tr.find("a", href=True)
        if len(cellules) < 3 or not lien:
            continue
        iso = date_iso(_texte(cellules[1]))
        url = url_encodee(origine, lien["href"])
        if iso and urlsplit(url).path.startswith("/upload/document/"):
            titre = _RE_ENFANT_ENTRE_PARENTHESES.sub("", _texte(cellules[0]))
            documents.append({"date": iso, "titre": titre, "url": url})
    return sorted(documents, key=lambda d: d["date"], reverse=True)


# ---------- photos et vidéos ----------
def _genre_media(url):
    extension = urlsplit(url).path.rsplit(".", 1)[-1].lower()
    return "video" if extension in EXTENSIONS_VIDEO else "photo"


def parser_photos(html, origine):
    """Médias dans l'ordre de la page (récents en tête) : {date (« » si absente), titre, url, genre}."""
    medias = []
    for tr in _soup(html).select("table tr"):
        cellules, lien = tr.find_all("td"), tr.find("a", href=True)
        if len(cellules) < 3 or not lien:
            continue
        premier, second = _texte(cellules[0]), _texte(cellules[1])
        iso = date_iso(premier)
        url = url_encodee(origine, lien["href"])
        if urlsplit(url).path.startswith("/upload/photo_video/"):
            medias.append({"date": iso, "titre": second if iso else premier or second, "url": url,
                           "genre": _genre_media(url)})
    return medias


# ---------- fleurs du lundi et encas du matin ----------
def _tour(iso, nous=False, libres=0, pris=0, aliment=""):
    return {"date": iso, "nous": nous, "libres": libres, "pris": pris, "aliment": aliment}


def _cellule_fleurs(cellule):
    """(nous, libre, pris) d'une case : un bouton « Se désinscrire » = nous, « Inscription » = libre, un nom = pris."""
    bouton = _norm(_texte(cellule.find("button"))) if cellule.find("button") else ""
    if "desinscri" in bouton:
        return True, 0, 0
    if "inscription" in bouton:
        return False, 1, 0
    noms = [n for n in re.split(r"[,;]", _texte(cellule)) if n.strip()]
    if any(_RE_PRENOM_ENFANT.search(n) for n in noms):
        return True, 0, 0
    return False, 0, len(noms)


def parser_fleurs(html):
    tours = []
    for tr in _soup(html).select("table tr"):
        cellules = tr.find_all("td")
        iso = date_iso(_texte(cellules[0])) if len(cellules) >= 2 else ""
        if iso:
            nous, libre, pris = _cellule_fleurs(cellules[1])
            tours.append(_tour(iso, nous, libre, pris))
    return sorted(tours, key=lambda t: t["date"])


def _champs(bloc):
    return {m.group(1): (m.group(2) if m.group(2) is not None else m.group(3)).replace("\\'", "'")
            for m in _RE_CHAMP.finditer(bloc)}


def _evenements_js(html):
    """Les objets de `events: [ {...}, {...} ]` (blocs contigus, sans accolades imbriquées)."""
    debut = re.search(r"events\s*:\s*\[", html)
    if not debut:
        return []
    evenements, pos = [], debut.end()
    while True:
        m = _RE_BLOC_EVENEMENT.match(html, pos)
        if not m:
            return evenements
        evenements.append(_champs(m.group(1)))
        pos = m.end()


def parser_encas(html):
    """Un tour par jour d'encas : {date, aliment, nous, libres, pris}. Les prénoms inscrits ne sortent pas."""
    par_jour = {}
    for e in _evenements_js(html):
        iso = e.get("start", "")
        if not date_iso(iso) or not e.get("title"):
            continue
        tour = par_jour.setdefault(iso, _tour(iso))
        titre = _norm(e["title"])
        if e.get("dessert") == "1":
            tour["aliment"] = e["title"].strip()
        elif "desinscrire" in titre or _RE_PRENOM_ENFANT.search(titre):
            tour["nous"] = True
        elif titre == "inscription":
            tour["libres"] += 1
        else:
            tour["pris"] += 1
    return [par_jour[k] for k in sorted(par_jour)]
