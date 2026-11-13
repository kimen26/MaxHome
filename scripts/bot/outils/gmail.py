"""Lecture des mails de l'école dans la boîte Gmail du foyer (brief bot-ecole-agenda, lot 2).

Deux étages, volontairement séparés :
  - l'AUTHENTIFICATION (`session_gmail`) rafraîchit le jeton OAuth et vérifie la boîte. Ce sont des POST/GET
    d'identification, faits hors du client de lecture : ce n'est pas l'outil ;
  - l'OUTIL `ecole_mails` ne reçoit qu'un ClientLecture limité à `users/me/messages` (liste) et
    `users/me/messages/{id}` (lecture). Tout autre chemin Gmail (send, modify, trash, drafts, settings,
    pièces jointes...) lève EcritureBloquee.
Les variables Google viennent de variables_utilisateur.lire_variable ; aucune valeur n'est journalisée.
"""
import base64
import json
import re
from email.header import decode_header, make_header
from email.utils import parseaddr, parsedate_to_datetime
from html import unescape

import variables_utilisateur
from outils import registre

VAR_JETON = "MAXHOME_GOOGLE_JETON"
VAR_CLIENT = "MAXHOME_GOOGLE_OAUTH_CLIENT"
NOM_OUTIL = "ecole_mails"
URL_MESSAGES = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
URL_PROFIL = "https://gmail.googleapis.com/gmail/v1/users/me/profile"
CHEMINS_AUTORISES = (
    re.compile(re.escape(URL_MESSAGES)),                       # lister
    re.compile(re.escape(URL_MESSAGES) + r"/[0-9a-f]{8,}"),    # lire un message (jamais /send, /trash...)
)
DELAI_S = 30
JOURS_DEFAUT = 30
MAILS_MAX = 5
TEXTE_MAX = 1500
_RE_BALISES = re.compile(r"<(script|style)\b.*?</\1>|<[^>]+>", re.IGNORECASE | re.DOTALL)


class ErreurGmail(Exception):
    """Authentification, mauvaise boîte ou réponse Gmail en échec (jamais de valeur secrète dans le message)."""


# ---------- authentification (hors outil) ----------
def _client_oauth():
    brut = variables_utilisateur.lire_variable(VAR_CLIENT)
    if not brut:
        raise ErreurGmail(f"variable {VAR_CLIENT} absente")
    try:
        client = json.loads(brut)
        client = client.get("installed") or client.get("web") or client
        return client["client_id"], client["client_secret"], client["token_uri"]
    except (ValueError, KeyError, AttributeError) as exc:
        raise ErreurGmail(f"variable {VAR_CLIENT} illisible") from exc


def jeton_acces(http):
    """Access token frais, obtenu avec le jeton de rafraîchissement (`http` : le module requests ou équivalent)."""
    refresh = variables_utilisateur.lire_variable(VAR_JETON)
    if not refresh:
        raise ErreurGmail(f"variable {VAR_JETON} absente")
    client_id, secret, url = _client_oauth()
    r = http.post(url, data={"client_id": client_id, "client_secret": secret,
                             "refresh_token": refresh.strip(), "grant_type": "refresh_token"}, timeout=DELAI_S)
    if r.status_code != 200 or "access_token" not in r.json():
        raise ErreurGmail(f"jeton Google refusé (HTTP {r.status_code})")
    return r.json()["access_token"]


def session_gmail(boite_attendue, http=None):
    """Session authentifiée, après avoir vérifié que le compte est bien `boite_attendue`. Sinon ErreurGmail."""
    if not boite_attendue:
        raise ErreurGmail("boîte attendue inconnue (paramètre ecole_boite)")
    if http is None:
        import requests
        http = requests
    session = http.Session()
    session.headers["Authorization"] = f"Bearer {jeton_acces(http)}"
    r = session.get(URL_PROFIL, timeout=DELAI_S)
    if r.status_code != 200:
        raise ErreurGmail(f"profil Gmail illisible (HTTP {r.status_code})")
    if str(r.json().get("emailAddress", "")).lower() != boite_attendue.strip().lower():
        raise ErreurGmail("le jeton Google ne donne pas la boîte du foyer : lecture refusée")
    return session


# ---------- extraction d'un message ----------
def _decoder(valeur):
    try:
        return str(make_header(decode_header(valeur or ""))).strip()
    except (ValueError, LookupError):
        return (valeur or "").strip()


def _entete(message, nom):
    for h in message.get("payload", {}).get("headers", []):
        if h.get("name", "").lower() == nom:
            return _decoder(h.get("value"))
    return ""


def _date(message):
    try:
        return parsedate_to_datetime(_entete(message, "date")).strftime("%d/%m/%Y")
    except (TypeError, ValueError):
        return "date inconnue"


def _parties(payload):
    yield payload
    for sous in payload.get("parts", []) or []:
        yield from _parties(sous)


def _decoder_corps(partie):
    donnee = (partie.get("body") or {}).get("data")
    if not donnee:
        return ""
    return base64.urlsafe_b64decode(donnee + "=" * (-len(donnee) % 4)).decode("utf-8", errors="replace")


def _texte_brut(message):
    """Corps en texte : la partie text/plain, sinon la partie HTML sans balises, sinon l'extrait Gmail."""
    parties = list(_parties(message.get("payload", {})))
    for type_mime, nettoyer in (("text/plain", str), ("text/html", lambda h: unescape(_RE_BALISES.sub(" ", h)))):
        corps = " ".join(nettoyer(_decoder_corps(p)) for p in parties if p.get("mimeType") == type_mime)
        corps = " ".join(corps.split())
        if corps:
            return corps[:TEXTE_MAX]
    return " ".join(unescape(message.get("snippet", "")).split())[:TEXTE_MAX]


def _resume_message(message):
    nom, _adresse = parseaddr(_entete(message, "from"))  # le nom affiché seulement, jamais l'adresse
    return {"date": _date(message), "de": nom or "École", "objet": _entete(message, "subject") or "(sans objet)",
            "texte": _texte_brut(message)}


# ---------- l'outil ----------
def _requete(expediteurs, jours):
    return f"from:({' OR '.join(expediteurs)}) newer_than:{int(jours)}d"


def _json(reponse):
    if reponse.status_code != 200:
        raise ErreurGmail(f"Gmail a répondu HTTP {reponse.status_code}")
    return reponse.json()


def ecole_mails(client, expediteurs, jours=JOURS_DEFAUT, maximum=MAILS_MAX):
    """Derniers mails des `expediteurs` : liste de {date, de, objet, texte}. Lecture seule (client gardé)."""
    if not expediteurs:
        return []
    liste = _json(client.get(URL_MESSAGES, params={"q": _requete(expediteurs, jours), "maxResults": maximum},
                             timeout=DELAI_S))
    mails = []
    for ref in liste.get("messages", []) or []:
        message = _json(client.get(f"{URL_MESSAGES}/{ref['id']}", params={"format": "full"}, timeout=DELAI_S))
        mails.append(_resume_message(message))
    return mails


def assurer_inscrit():
    """Inscrit l'outil au registre s'il n'y est pas (idempotent : appelé à chaque usage)."""
    if not registre.inscrit(NOM_OUTIL):
        registre.inscrire(NOM_OUTIL, registre.LECTURE, ecole_mails, CHEMINS_AUTORISES)
