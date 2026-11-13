"""Outil de lecture `web_page` : lit UNE page web (lien donné par un membre) et en rend le texte (brief bot-web-documents, lot B).

Le bot tourne sur le PC du foyer : un lien peut viser le réseau local ou le poste lui-même (SSRF). Donc :
  - GET seul (ClientLecture), schéma http/https, ports 80/443 seulement, pas d'identifiants dans l'URL ;
  - TOUTES les adresses résolues de l'hôte doivent être publiques (ipaddress : privée, bouclage, link-local,
    multicast, réservée, non spécifiée, partagée = refus) ;
  - redirections suivies à la main, chacune revérifiée comme le lien d'origine, REDIRECTIONS_MAX au plus ;
  - délai court, taille lue plafonnée, seulement du texte ou du HTML.
Limite connue : la résolution est vérifiée juste avant la requête, pas épinglée sur la connexion (un DNS qui
changerait de réponse entre les deux passerait ; non vérifié en pratique).
Le texte rendu est une DONNÉE : il ne choisit jamais l'action qui suit (web_bot.py).
"""
import ipaddress
import socket
from urllib.parse import urljoin, urlsplit

from bs4 import BeautifulSoup

from outils import registre
from outils.garde import LectureRefusee

NOM = "web_page"
SCHEMAS = ("http", "https")
PORTS = {"http": 80, "https": 443}
REDIRECTIONS_MAX = 4
CODES_REDIRECTION = (301, 302, 303, 307, 308)
DELAI_S = 10
TAILLE_MAX = 1_000_000          # octets lus au plus
TEXTE_MAX = 12_000              # caractères rendus
TYPES_LUS = ("text/html", "application/xhtml+xml", "text/plain")
BALISES_IGNOREES = ("script", "style", "noscript", "template", "svg", "iframe", "head", "nav", "footer")
ENTETES = {"User-Agent": "maxhome-bot/1.0", "Accept": "text/html,text/plain;q=0.9"}


class ErreurWeb(Exception):
    """Page illisible (réseau, code d'erreur, type ou redirections) ; le message se dit tel quel."""


class RefusWeb(LectureRefusee):
    """Cible interdite par l'anti-SSRF ; le message se dit tel quel."""


def resoudre(hote, port):
    """Toutes les adresses de l'hôte (remplaçable en test)."""
    return socket.getaddrinfo(hote, port, type=socket.SOCK_STREAM)


def _adresse_interdite(adresse):
    if adresse.version == 6 and adresse.ipv4_mapped:  # ::ffff:127.0.0.1
        adresse = adresse.ipv4_mapped
    return (adresse.is_private or adresse.is_loopback or adresse.is_link_local or adresse.is_multicast
            or adresse.is_reserved or adresse.is_unspecified or not adresse.is_global)


def verifier_url(url):
    """Lève RefusWeb si l'URL n'est pas une page publique en http/https sur 80/443."""
    parties = urlsplit(url)
    if parties.scheme not in SCHEMAS:
        raise RefusWeb("Je n'ouvre que des liens http ou https.")
    if parties.username or parties.password:
        raise RefusWeb("Je n'ouvre pas un lien qui contient un identifiant.")
    try:
        port = parties.port or PORTS[parties.scheme]
    except ValueError:
        raise RefusWeb("Ce lien n'est pas valide.") from None
    if port not in PORTS.values():
        raise RefusWeb("Je n'ouvre que les liens sur les ports web habituels (80 et 443).")
    if not parties.hostname:
        raise RefusWeb("Ce lien n'est pas valide.")
    try:
        infos = resoudre(parties.hostname, port)
    except OSError:
        raise ErreurWeb("Je ne trouve pas ce site.") from None
    if not infos:
        raise ErreurWeb("Je ne trouve pas ce site.")
    for info in infos:
        try:
            adresse = ipaddress.ip_address(info[4][0].split("%")[0])
        except ValueError:
            raise RefusWeb("Ce lien n'est pas valide.") from None
        if _adresse_interdite(adresse):
            raise RefusWeb("Je n'ouvre pas ce lien : il mène vers un réseau privé ou interne.")


def _lire_borne(reponse):
    morceaux, total = [], 0
    for morceau in reponse.iter_content(chunk_size=16_384):
        morceaux.append(morceau)
        total += len(morceau)
        if total >= TAILLE_MAX:
            break
    return b"".join(morceaux)[:TAILLE_MAX]


def extraire_texte(corps, type_contenu):
    """(titre, texte) d'une page : sans script ni style, espaces repliés, limité à TEXTE_MAX."""
    if type_contenu == "text/plain":
        titre, brut = "", corps.decode("utf-8", errors="replace")
    else:
        soupe = BeautifulSoup(corps, "html.parser")
        titre = (soupe.title.get_text(" ", strip=True) if soupe.title else "")
        for balise in soupe(BALISES_IGNOREES):
            balise.decompose()
        brut = soupe.get_text("\n")
    lignes = [" ".join(l.split()) for l in brut.splitlines()]
    return titre, "\n".join(l for l in lignes if l)[:TEXTE_MAX]


def lire_page(client, url):
    """{"titre", "texte"} de la page, redirections revérifiées. Lève RefusWeb ou ErreurWeb."""
    courant = url
    for _ in range(REDIRECTIONS_MAX + 1):
        verifier_url(courant)
        try:
            reponse = client.get(courant, timeout=DELAI_S, allow_redirects=False, stream=True, headers=ENTETES)
        except OSError:  # requests.RequestException en descend
            raise ErreurWeb("Je n'arrive pas à ouvrir cette page.") from None
        try:
            if reponse.status_code in CODES_REDIRECTION:
                suite = reponse.headers.get("Location")
                if not suite:
                    raise ErreurWeb("Cette page renvoie vers nulle part.")
                courant = urljoin(courant, suite)
                continue
            if reponse.status_code >= 400:
                raise ErreurWeb(f"La page répond par une erreur ({reponse.status_code}).")
            type_contenu = reponse.headers.get("Content-Type", "").split(";")[0].strip().lower()
            if type_contenu not in TYPES_LUS:
                raise ErreurWeb("Ce lien n'est pas une page que je sais lire (ni HTML ni texte).")
            titre, texte = extraire_texte(_lire_borne(reponse), type_contenu)
        finally:
            reponse.close()
        if not texte:
            raise ErreurWeb("Je n'ai trouvé aucun texte sur cette page.")
        return {"titre": titre, "texte": texte}
    raise ErreurWeb("Trop de redirections pour ce lien.")


def ouvrir_session():
    """Session HTTP des lectures web (remplaçable en test)."""
    import requests
    return requests.Session()


def assurer_inscrit():
    if not registre.inscrit(NOM):
        registre.inscrire(NOM, registre.LECTURE, lire_page)
