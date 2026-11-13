"""Agenda du foyer dans le bot (brief bot-ecole-agenda, lot 3). Mêmes règles que l'Edge Function
`supabase/functions/agenda-google/evenements.ts` (validation, journée entière, « pour qui », Europe/Paris).

  - LECTURE `agenda_lire` : ne reçoit qu'un ClientLecture limité à `.../calendars/<id>/events` (liste) ;
  - ÉCRITURES `agenda_creer`, `agenda_modifier`, `agenda_supprimer` : inscrites en genre écriture, elles ne
    partent qu'après un « oui » (registre.proposer_ecriture, puis registre.confirmer).
Un événement lu a la forme de l'app : {id, titre, debut, fin (inclusive), heure_debut, heure_fin, personne}.
Authentification : compte de service (variable utilisateur MAXHOME_GOOGLE_CLE, google-auth), jamais journalisée.
"""
import json
import re
from datetime import date, timedelta
from urllib.parse import quote

import variables_utilisateur
from outils import registre

VAR_CLE = "MAXHOME_GOOGLE_CLE"
PORTEE = "https://www.googleapis.com/auth/calendar.events"
AGENDA_ID = "claudyann.home@gmail.com"  # la boîte du foyer ; déjà dans l'Edge Function agenda-google
URL_EVENEMENTS = f"https://www.googleapis.com/calendar/v3/calendars/{quote(AGENDA_ID, safe='')}/events"
CHEMINS_AUTORISES = (re.compile(re.escape(URL_EVENEMENTS)),)  # lister seulement, jamais /events/<id>
NOM_LIRE, NOM_CREER, NOM_MODIFIER, NOM_SUPPRIMER = "agenda_lire", "agenda_creer", "agenda_modifier", "agenda_supprimer"
CHAMPS = "id,status,summary,start,end,extendedProperties"  # jamais description, lieu, participants
PERSONNES = ("Max", "Yann", "Claudia", "Famille")
CLE_PERSONNE = "maxhome_personne"
FUSEAU = "Europe/Paris"
TITRE_VIDE = "Sans titre"
TITRE_MAX = 200
MAX_JOURS = 800
PAR_PAGE = 250
PAGES_MAX = 4
DELAI_S = 30

_FORMAT_JOUR = re.compile(r"\d{4}-\d{2}-\d{2}")
_FORMAT_HEURE = re.compile(r"([01]\d|2[0-3]):[0-5]\d")
_FORMAT_ID = re.compile(r"[A-Za-z0-9_-]{1,1024}")
_DATETIME = re.compile(r"(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})")


class ErreurAgenda(Exception):
    """Authentification ou réponse Google en échec (jamais de valeur secrète dans le message)."""


class ErreurSaisie(ValueError):
    """Saisie refusée ; le message est une phrase à dire telle quelle au membre."""


# ---------- dates ----------
def jour(valeur):
    """La date d'un AAAA-MM-JJ, ou None s'il n'existe pas (31 février, texte)."""
    if not isinstance(valeur, str) or not _FORMAT_JOUR.fullmatch(valeur):
        return None
    try:
        return date.fromisoformat(valeur)
    except ValueError:
        return None


def decaler(iso, n):
    return (date.fromisoformat(iso) + timedelta(days=n)).isoformat()


# ---------- validation (miroir de validerSaisie) ----------
def _absent(v):
    return v is None or v == ""


def _heure(v, nom):
    if _absent(v):
        return None
    if isinstance(v, str) and _FORMAT_HEURE.fullmatch(v):
        return v
    raise ErreurSaisie(f"L'heure de {nom} doit être au format HH:MM (de 00:00 à 23:59).")


def _titre_personne(c):
    titre = c["titre"].strip() if isinstance(c.get("titre"), str) else ""
    if not titre:
        raise ErreurSaisie("Donne un titre à l'événement.")
    if len(titre) > TITRE_MAX:
        raise ErreurSaisie(f"Le titre est trop long ({TITRE_MAX} caractères au plus).")
    personne = c.get("personne")
    if not _absent(personne) and personne not in PERSONNES:
        raise ErreurSaisie(f"Pour qui ? {', '.join(PERSONNES)}.")
    return titre, (None if _absent(personne) else personne)


def valider_saisie(corps):
    """La saisie nettoyée {titre, personne, debut, fin, heure_debut, heure_fin}, ou ErreurSaisie.
    `personne` peut être absente (None) ; `fin` absente vaut `debut`."""
    if not isinstance(corps, dict):
        raise ErreurSaisie("Demande illisible.")
    titre, personne = _titre_personne(corps)
    d = jour(corps.get("debut"))
    f = d if _absent(corps.get("fin")) else jour(corps.get("fin"))
    if d is None:
        raise ErreurSaisie("La date de début n'existe pas (format AAAA-MM-JJ).")
    if f is None:
        raise ErreurSaisie("La date de fin n'existe pas (format AAAA-MM-JJ).")
    if f < d:
        raise ErreurSaisie("La date de fin est avant la date de début.")
    hd, hf = _heure(corps.get("heure_debut"), "début"), _heure(corps.get("heure_fin"), "fin")
    if (hd is None) != (hf is None):
        raise ErreurSaisie("Indique les deux heures (début et fin), ou aucune pour une journée entière.")
    if hd is not None:
        if d != f:
            raise ErreurSaisie("Un événement avec des heures tient sur un seul jour.")
        if hf <= hd:
            raise ErreurSaisie("L'heure de fin doit être après l'heure de début.")
    return {"titre": titre, "personne": personne, "debut": d.isoformat(), "fin": f.isoformat(),
            "heure_debut": hd, "heure_fin": hf}


def valider_id(valeur):
    if not isinstance(valeur, str) or not _FORMAT_ID.fullmatch(valeur):
        raise ErreurSaisie("Identifiant d'événement invalide.")
    return valeur


def corps_google(saisie, modification):
    """Corps envoyé à Google. Journée entière : `end.date` EXCLUSIVE (fin + 1 jour). Horaire : dateTime + Paris.
    En modification, l'autre forme est mise à null ; sans « pour qui », la propriété n'est pas touchée."""
    horaire = saisie["heure_debut"] is not None

    def bord(jour_, heure):
        if horaire:
            return {"dateTime": f"{jour_}T{heure}:00", "timeZone": FUSEAU, **({"date": None} if modification else {})}
        return {"date": jour_, **({"dateTime": None, "timeZone": None} if modification else {})}

    corps = {"summary": saisie["titre"], "start": bord(saisie["debut"], saisie["heure_debut"]),
             "end": bord(saisie["fin"] if horaire else decaler(saisie["fin"], 1), saisie["heure_fin"])}
    if saisie["personne"]:
        corps["extendedProperties"] = {"private": {CLE_PERSONNE: saisie["personne"]}}
    return corps


# ---------- conversion Google -> événement simple (miroir de convertirEvenement) ----------
def convertir(e):
    """Un événement Google -> {id, titre, debut, fin inclusive, heure_debut, heure_fin, personne}, ou None."""
    if not isinstance(e, dict) or e.get("status") == "cancelled":
        return None
    titre = (e.get("summary") or "").strip() or TITRE_VIDE
    brute = ((e.get("extendedProperties") or {}).get("private") or {}).get(CLE_PERSONNE)
    base = {"id": str(e.get("id") or ""), "titre": titre, "personne": brute if brute in PERSONNES else None}
    debut, fin = e.get("start") or {}, e.get("end") or {}
    if debut.get("date"):
        if jour(debut["date"]) is None:
            return None
        exclusive = fin["date"] if jour(fin.get("date")) else decaler(debut["date"], 1)
        derniere = decaler(exclusive, -1)  # fin exclusive chez Google -> inclusive ici
        return {**base, "debut": debut["date"], "fin": max(derniere, debut["date"]),
                "heure_debut": None, "heure_fin": None}
    dep = _DATETIME.match(debut.get("dateTime") or "")
    if not dep:
        return None
    arr = _DATETIME.match(fin.get("dateTime") or "")
    if not arr:
        return {**base, "debut": dep[1], "fin": dep[1], "heure_debut": dep[2], "heure_fin": None}
    veille = arr[2] == "00:00" and arr[1] > dep[1]  # finit pile à minuit : finit la veille
    return {**base, "debut": dep[1], "fin": decaler(arr[1], -1) if veille else arr[1],
            "heure_debut": dep[2], "heure_fin": arr[2]}


# ---------- authentification (hors outil de lecture) ----------
def ouvrir_session():
    """Session authentifiée par le compte de service (google-auth, déjà installé). Le jeton se renouvelle seul."""
    brut = variables_utilisateur.lire_variable(VAR_CLE)
    if not brut:
        raise ErreurAgenda(f"variable {VAR_CLE} absente")
    try:
        from google.auth.transport.requests import AuthorizedSession
        from google.oauth2 import service_account
        creds = service_account.Credentials.from_service_account_info(json.loads(brut), scopes=[PORTEE])
    except (ValueError, KeyError, TypeError):
        raise ErreurAgenda(f"variable {VAR_CLE} illisible") from None  # pas de cause chaînée : elle pourrait citer la clé
    return AuthorizedSession(creds)


# ---------- l'outil de lecture ----------
def _json(reponse):
    if reponse.status_code != 200:
        raise ErreurAgenda(f"Google Agenda a répondu HTTP {reponse.status_code}")
    return reponse.json()


def agenda_lire(client, debut, fin):
    """Événements qui touchent [debut, fin] (AAAA-MM-JJ, inclus), triés. Lecture seule (client gardé)."""
    d, f = jour(debut), jour(fin)
    if d is None or f is None or f < d or (f - d).days > MAX_JOURS:
        raise ErreurSaisie("Période invalide.")
    # bornes UTC élargies d'un jour de chaque côté, puis filtrées sur les dates de Paris
    params = {"singleEvents": "true", "orderBy": "startTime", "timeZone": FUSEAU, "maxResults": PAR_PAGE,
              "timeMin": f"{decaler(debut, -1)}T00:00:00Z", "timeMax": f"{decaler(fin, 2)}T00:00:00Z",
              "fields": f"nextPageToken,items({CHAMPS})"}
    trouves, page = [], None
    for _ in range(PAGES_MAX):
        corps = _json(client.get(URL_EVENEMENTS, params={**params, **({"pageToken": page} if page else {})},
                                 timeout=DELAI_S))
        trouves += [e for e in map(convertir, corps.get("items") or []) if e]
        page = corps.get("nextPageToken")
        if not page:
            break
    gardes = [e for e in trouves if e["fin"] >= debut and e["debut"] <= fin]
    return sorted(gardes, key=lambda e: (e["debut"], e["heure_debut"] or "", e["titre"]))


# ---------- les outils d'écriture (jamais appelés sans « oui ») ----------
def _ecrire(methode, id_, corps=None):
    url = URL_EVENEMENTS + (f"/{quote(id_, safe='')}" if id_ else "")
    params = None if methode == "DELETE" else {"fields": CHAMPS}
    rep = ouvrir_session().request(methode, url, params=params, json=corps, timeout=DELAI_S)
    if id_ and rep.status_code in (404, 410):
        raise ErreurAgenda("Cet événement n'existe plus dans l'agenda.")
    if rep.status_code == 403:
        raise ErreurAgenda("Google refuse l'écriture : le compte du bot n'a pas le droit de modifier cet agenda.")
    if rep.status_code not in (200, 204):
        raise ErreurAgenda(f"Google Agenda a refusé l'écriture (HTTP {rep.status_code})")


def _garde_erreurs(fonction):
    """Un refus lisible (saisie, Google) devient la phrase à dire ; le reste remonte (journalisé par le registre)."""
    def enveloppe(**args):
        try:
            return fonction(**args)
        except (ErreurSaisie, ErreurAgenda) as exc:
            return f"Rien n'a été fait : {exc}"
    return enveloppe


@_garde_erreurs
def agenda_creer(**saisie):
    _ecrire("POST", None, corps_google(valider_saisie(saisie), False))
    return "C'est ajouté à l'agenda."


@_garde_erreurs
def agenda_modifier(id, **saisie):
    _ecrire("PATCH", valider_id(id), corps_google(valider_saisie(saisie), True))
    return "C'est modifié dans l'agenda."


@_garde_erreurs
def agenda_supprimer(id, **_):
    _ecrire("DELETE", valider_id(id))
    return "C'est supprimé de l'agenda."


def assurer_inscrit():
    """Inscrit les quatre outils au registre s'ils n'y sont pas (idempotent : appelé à chaque usage)."""
    if not registre.inscrit(NOM_LIRE):
        registre.inscrire(NOM_LIRE, registre.LECTURE, agenda_lire, CHEMINS_AUTORISES)
    for nom, fonction in ((NOM_CREER, agenda_creer), (NOM_MODIFIER, agenda_modifier), (NOM_SUPPRIMER, agenda_supprimer)):
        if not registre.inscrit(nom):
            registre.inscrire(nom, registre.ECRITURE, fonction)
