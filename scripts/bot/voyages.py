"""Carnet de voyage côté bot (D-045) : fuzzy voyage, géocodage Nominatim, résas, topo, pièces.

Aucune logique de conversation ici : actions.py appelle, reponses.py formate. Le géocodage et
les appels à Claude (haiku, CLI) touchent le réseau — jamais testés en pytest (bouchonnés).
"""
import json
import subprocess
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid
from datetime import datetime

import commandes
import libre
import reponses
from reponses import normaliser

NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
USER_AGENT = "maxhome-bot/1.0"
DELAI_MIN_SECONDES = 1.1  # politique d'usage Nominatim : 1 requête/s max.

# addresstype (jsonv2) trop large pour désigner UN lieu précis : ce sont des découpages
# administratifs ou des agrégats de ville, pas un endroit où on pointe sur une carte.
# place_rank Nominatim suit la même hiérarchie (pays=4 … rue=26, POI≈30) : sous 20 on est
# encore au niveau ville/village, jamais un lieu précis (L-042).
ADDRESSTYPES_TROP_VAGUES = {
    "country", "state", "region", "province", "county", "municipality",
    "city", "town", "village", "suburb", "city_district", "postcode",
}
PLACE_RANK_MIN_PRECIS = 20

TYPES_RESA = ("vol", "train", "logement", "voiture", "activite", "repas", "autre")
CATEGORIES_LIEU = ("a_voir", "activite", "logement", "resto", "transport", "autre")
POSTES = ("transport", "logement", "activites", "repas", "sur_place", "autre")

# Même règle que frontend/agenda/carnet.js::posteDe et la migration 021 : déduit le poste
# depuis le type de résa quand il n'est pas donné explicitement.
POSTE_PAR_TYPE = {
    "vol": "transport", "train": "transport", "voiture": "transport",
    "logement": "logement", "activite": "activites", "repas": "repas",
}


def poste_de(type_resa, poste_donne=None):
    if poste_donne:
        return poste_donne
    return POSTE_PAR_TYPE.get(type_resa, "autre")


def budget_engage_prevu(resas, enveloppes):
    """Totaux simples pour le bot (texte) : engagé (résas non annulées `reserve`) et prévu
    (somme des enveloppes cadrées). Miroir simplifié de frontend/agenda/carnet.js::budgetParPoste
    (le détail par poste reste réservé à l'écran)."""
    engage = sum(r.get("prix_centimes") or 0 for r in resas if r.get("statut") == "reserve")
    prevu = sum(e["prevu_centimes"] for e in enveloppes)
    return engage, prevu
EXTENSIONS_AUTORISEES = {
    "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp",
    "image/heic": "heic", "application/pdf": "pdf",
}

_dernier_appel_nominatim = 0.0


def _attendre_nominatim():
    """≥ 1,1 s entre deux requêtes Nominatim, quel que soit l'appelant."""
    global _dernier_appel_nominatim
    attente = DELAI_MIN_SECONDES - (time.time() - _dernier_appel_nominatim)
    if attente > 0:
        time.sleep(attente)
    _dernier_appel_nominatim = time.time()


def geocoder(requete, timeout=15):
    """Nominatim, un seul résultat. Retourne {lat, lng, adresse, addresstype, place_rank, nom} ou None."""
    _attendre_nominatim()
    qs = urllib.parse.urlencode({
        "format": "jsonv2", "limit": "1", "accept-language": "fr", "q": requete,
    })
    req = urllib.request.Request(f"{NOMINATIM_URL}?{qs}", method="GET")
    req.add_header("User-Agent", USER_AGENT)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            resultats = json.loads(r.read().decode())
    except (urllib.error.URLError, urllib.error.HTTPError, TimeoutError, json.JSONDecodeError):
        return None
    if not resultats:
        return None
    r0 = resultats[0]
    try:
        return {
            "lat": float(r0["lat"]), "lng": float(r0["lon"]), "adresse": r0.get("display_name", ""),
            "addresstype": r0.get("addresstype"), "place_rank": r0.get("place_rank"),
            "nom": r0.get("name") or "",
        }
    except (KeyError, ValueError):
        return None


def _lieu_assez_precis(trouve, nom_lieu):
    """Rejette un résultat Nominatim qui ne désigne qu'une ville/région/pays (L-042) : un point
    faux sur la carte est pire que pas de point. Exception : le nom cherché EST cette ville/ce
    lieu (ex. voyage « Annecy » -> lieu « Annecy ») — alors le centroïde est le bon point.
    """
    if normaliser(nom_lieu) == normaliser(trouve.get("nom") or ""):
        return True
    if trouve.get("addresstype") in ADDRESSTYPES_TROP_VAGUES:
        return False
    place_rank = trouve.get("place_rank")
    if place_rank is not None and place_rank < PLACE_RANK_MIN_PRECIS:
        return False
    return True


def trouver_voyage(nom, voyages):
    """Fuzzy sur le titre, comme les charges (commandes.meilleur_flou). (voyage, None) ou (None, proches)."""
    return commandes.meilleur_flou(normaliser(nom), voyages, "titre")


def separer_voyage_et_reste(reste, voyages):
    """« Test bot ZZZ Musée des Confluences » -> (voyage, "Musée des Confluences").

    Le voyage peut être multi-mots : on note chaque préfixe de mots contre le fuzzy voyage
    (commandes._score) et on garde le préfixe au meilleur score, pas le premier qui dépasse
    le seuil en partant du plus long — un titre commençant par un mot courant (« Test... »)
    dépasserait sinon le seuil dès le premier mot, à cause du bonus fragment de _score.
    Retourne (voyage, suite) ou (None, proches_du_meilleur_essai).
    """
    mots = reste.split()
    meilleur = None  # (score, voyage, suite)
    proches_par_defaut = []
    for n in range(len(mots), 0, -1):
        prefixe = " ".join(mots[:n])
        suite = " ".join(mots[n:])
        voyage, proches = trouver_voyage(prefixe, voyages)
        if not proches_par_defaut:
            proches_par_defaut = proches or []
        if not voyage:
            continue
        score = commandes._score(normaliser(prefixe), normaliser(voyage["titre"]))
        if meilleur is None or score > meilleur[0]:
            meilleur = (score, voyage, suite)
    if meilleur:
        return meilleur[1], meilleur[2]
    return None, proches_par_defaut


def voyages_a_venir(voyages, aujourdhui):
    """Voyages pas encore terminés (fin >= aujourd'hui), triés par date de début."""
    iso = aujourdhui.isoformat()
    a_venir = [v for v in voyages if v["fin"] >= iso]
    return sorted(a_venir, key=lambda v: v["debut"])


# ---------- lieu ----------
def ajouter_lieu(donnees, voyage, nom_lieu, prenom):
    """Géocode `<nom_lieu>, <voyages.lieu>` et insère. Retourne le lieu créé (avec ou sans position)."""
    requete = f"{nom_lieu}, {voyage['lieu']}" if voyage.get("lieu") else nom_lieu
    trouve = geocoder(requete)
    if trouve and not _lieu_assez_precis(trouve, nom_lieu):
        trouve = None
    champs = {
        "voyage_id": voyage["id"], "nom": nom_lieu, "categorie": "a_voir", "statut": "idee",
        "cree_par": prenom,
    }
    if trouve:
        champs.update({"lat": trouve["lat"], "lng": trouve["lng"], "adresse": trouve["adresse"]})
    return donnees.creer_lieu(champs)


# ---------- localise ----------
def _meilleure_requete(nom_lieu, voyage, timeout=60):
    """Demande à Claude (haiku, CLI) un nom de recherche plus précis. None si indisponible
    ou si Claude ne reconnaît pas le lieu (réponse vide, L-042 : jamais replier sur la ville
    ou le pays de destination — un point faux est pire que pas de point)."""
    prompt = (
        "Tu aides à géocoder un lieu de voyage sur OpenStreetMap/Nominatim. "
        f"Le lieu « {nom_lieu} » n'a pas été trouvé avec la requête simple. "
        f"Voyage : {voyage.get('titre', '')}, destination {voyage.get('lieu', '')}. "
        "Si tu reconnais ce lieu précis, réponds UNIQUEMENT avec une meilleure requête de "
        "recherche (nom officiel + ville + pays), une seule ligne, sans JSON, sans guillemets, "
        "sans texte autour. Si tu ne reconnais PAS ce lieu précis, réponds une chaîne vide : "
        "ne réponds jamais juste la ville, la région ou le pays de destination."
    )
    try:
        r = subprocess.run(
            ["claude", "-p", prompt, "--model", "haiku", "--output-format", "json"],
            capture_output=True, text=True, timeout=timeout,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    if r.returncode != 0:
        return None
    try:
        enveloppe = json.loads(r.stdout)
        texte = enveloppe.get("result") if isinstance(enveloppe, dict) else str(enveloppe)
        texte = libre._sans_fences((texte or "")).strip('"').strip()
        return texte or None
    except json.JSONDecodeError:
        return None


def localiser_manquants(donnees, voyage):
    """Pour chaque lieu sans position : Nominatim direct, sinon Claude propose une requête, un
    seul réessai. Un résultat trop vague (ville/région/pays, L-042) est rejeté comme un échec.
    Retourne (n_localises, [noms_restants]) — un nom rejeté pour imprécision le précise."""
    lieux = [l for l in donnees.lieux_voyage(voyage["id"]) if l["lat"] is None]
    localises = 0
    restants = []
    for lieu in lieux:
        requete = f"{lieu['nom']}, {voyage['lieu']}" if voyage.get("lieu") else lieu["nom"]
        trouve = geocoder(requete)
        trop_vague = False
        if trouve and not _lieu_assez_precis(trouve, lieu["nom"]):
            trouve = None
            trop_vague = True
        if not trouve:
            meilleure = _meilleure_requete(lieu["nom"], voyage)
            trouve = geocoder(meilleure) if meilleure else None
            if trouve and not _lieu_assez_precis(trouve, lieu["nom"]):
                trouve = None
                trop_vague = True
            elif trouve:
                trop_vague = False
        if trouve:
            donnees.maj_lieu(lieu["id"], {
                "lat": trouve["lat"], "lng": trouve["lng"], "adresse": trouve["adresse"],
            })
            localises += 1
        elif trop_vague:
            restants.append(f"{lieu['nom']} (trouvé seulement la ville, laissé sans position)")
        else:
            restants.append(lieu["nom"])
    return localises, restants


# ---------- topo -> bloc résumé (V2, D-047) ----------
def reecrire_topo(donnees, voyage):
    """Claude réécrit le SEUL bloc `resume` du voyage, en markdown léger, à partir des autres
    blocs (info/astuce/attention) + lieux + résas — jamais le topo brut, qui n'est plus lu par
    l'écran V2 (gardé en base, jamais supprimé). N'écrit rien ici : retourne le texte proposé,
    à confirmer avant `enregistrer_topo`.
    """
    blocs = [b for b in donnees.blocs_voyage(voyage["id"]) if b["type"] != "resume"]
    lieux = donnees.lieux_voyage(voyage["id"])
    resas = donnees.resas_voyage(voyage["id"])
    resume_actuel = next((b["texte"] for b in donnees.blocs_voyage(voyage["id"]) if b["type"] == "resume"), None)
    prompt = (
        "Réécris le résumé (4 à 6 lignes) de ce voyage en markdown léger : listes avec -, gras "
        "avec **, liens http(s) en clair, pas de titre ##. Base-toi UNIQUEMENT sur les blocs, "
        "lieux et réservations donnés ci-dessous — n'invente rien. Sois concis, dis quoi, où, "
        "quand, la base d'hébergement et les points forts. Réponds UNIQUEMENT avec le markdown, "
        "sans texte autour, sans bloc de code.\n\n"
        f"Voyage : {voyage.get('titre', '')} — {voyage.get('lieu', '')}\n"
        f"Résumé actuel : {resume_actuel or '(aucun)'}\n"
        f"Blocs : {[(b['type'], b['titre'], b['texte']) for b in blocs]}\n"
        f"Lieux : {[l['nom'] for l in lieux]}\n"
        f"Réservations : {[(r['type'], r['titre']) for r in resas]}"
    )
    try:
        r = subprocess.run(
            ["claude", "-p", prompt, "--model", "haiku", "--output-format", "json"],
            capture_output=True, text=True, timeout=90,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return None
    if r.returncode != 0:
        return None
    try:
        enveloppe = json.loads(r.stdout)
        texte = enveloppe.get("result") if isinstance(enveloppe, dict) else str(enveloppe)
        return libre._sans_fences((texte or "")) or None
    except json.JSONDecodeError:
        return None


def enregistrer_topo(donnees, voyage_id, texte):
    """Upsert du bloc `resume` (D-047 : au plus un par voyage) : met à jour s'il existe déjà,
    le crée sinon, toujours en tête (ordre -1)."""
    existant = donnees.bloc_resume(voyage_id)
    if existant:
        return donnees.maj_bloc(existant["id"], {"texte": texte})
    return donnees.creer_bloc({"voyage_id": voyage_id, "type": "resume", "texte": texte, "ordre": -1})


# ---------- résa en langage libre ----------
def extraire_resa(message, voyages, membres, timeout=60):
    """Appelle libre.py (repli LLM) pour extraire une résa. Retourne le JSON brut ou {"action": "inconnu"}."""
    titres = [v["titre"] for v in voyages]
    return libre.interpreter_resa(message, titres, membres, timeout=timeout)


def valider_resa(champs, voyages, membres):
    """Validation stricte : types, prix entier >= 0, payeur connu. Retourne (resa_normalisee, erreur)."""
    nom_voyage = champs.get("voyage")
    if not nom_voyage:
        return None, "Voyage manquant : précise pour quel voyage."
    voyage, proches = trouver_voyage(nom_voyage, voyages)
    if not voyage:
        return None, f"Aucun voyage ne correspond à « {nom_voyage} ». Proches : {', '.join(proches)}."

    type_resa = normaliser(str(champs.get("type") or "autre"))
    if type_resa not in TYPES_RESA:
        return None, f"Type de réservation inconnu : « {champs.get('type')} »."

    poste = champs.get("poste")
    if poste:
        poste = normaliser(str(poste))
        if poste not in POSTES:
            return None, f"Poste de budget inconnu : « {champs.get('poste')} »."

    titre = str(champs.get("titre") or "").strip()
    if not titre:
        return None, "Titre de réservation manquant."

    prix_centimes = None
    if champs.get("prix_centimes") is not None:
        try:
            prix_centimes = int(round(float(champs["prix_centimes"])))
        except (TypeError, ValueError):
            return None, f"Prix invalide : « {champs.get('prix_centimes')} »."
        if prix_centimes < 0:
            return None, "Le prix ne peut pas être négatif."

    paye_par = champs.get("paye_par")
    if paye_par:
        trouve_payeur = next((m for m in membres if normaliser(m) == normaliser(paye_par)), None)
        if not trouve_payeur:
            return None, f"Payeur inconnu : « {paye_par} » (membres : {', '.join(membres)})."
        paye_par = trouve_payeur

    resa = {
        "voyage_id": voyage["id"], "voyage_titre": voyage["titre"], "type": type_resa, "titre": titre,
        "debut": champs.get("debut") or None, "fin": champs.get("fin") or None,
        "prestataire": champs.get("prestataire") or None, "code": champs.get("code") or None,
        "prix_centimes": prix_centimes, "paye_par": paye_par, "statut": "reserve",
        "poste": poste_de(type_resa, poste),
    }
    return resa, None


def inserer_resa(donnees, resa, prenom):
    champs = {k: v for k, v in resa.items() if k != "voyage_titre"}
    champs["cree_par"] = prenom
    return donnees.creer_resa(champs)


# ---------- pièce jointe (photo / PDF) ----------
def extension_pour(type_mime):
    return EXTENSIONS_AUTORISEES.get(type_mime)


def ranger_piece(donnees, voyage, contenu, type_mime, nom_original, prenom):
    """Upload Storage puis insert voyage_pieces. Si l'insert échoue, supprime l'objet (cause racine
    jamais masquée : on ne laisse pas un fichier orphelin dans le bucket)."""
    ext = extension_pour(type_mime) or "bin"
    chemin = f"{voyage['id']}/{uuid.uuid4()}.{ext}"
    donnees.upload_stockage(chemin, contenu, type_mime)
    try:
        return donnees.creer_piece({
            "voyage_id": voyage["id"], "nom": nom_original or chemin, "chemin": chemin,
            "type_mime": type_mime, "taille": len(contenu), "cree_par": prenom,
        })
    except Exception:
        donnees.supprimer_stockage(chemin)
        raise


def legende_vise_voyage(legende, voyages):
    """La légende d'une photo/PDF nomme-t-elle un voyage ? (voyage, None) ou (None, proches)."""
    if not legende or not legende.strip():
        return None, []
    return trouver_voyage(legende.strip(), voyages)


def traiter_piece(donnees, telegram, prenom, msg):
    """Photo (plus grande résolution) ou document PDF, légendé du nom d'un voyage.

    Retourne le texte à envoyer, ou None si le message ne porte ni photo ni document.
    """
    legende = msg.get("caption")
    voyage, proches = legende_vise_voyage(legende, donnees.voyages())
    if not voyage:
        if legende:
            return f"Aucun voyage ne correspond à « {legende} ». Proches : {', '.join(proches)}."
        return "Pour quel voyage ? Renvoie la photo/le PDF avec le nom du voyage en légende."

    if "photo" in msg:
        file_id = msg["photo"][-1]["file_id"]  # dernière = plus grande résolution
        type_mime = "image/jpeg"
    elif "document" in msg:
        file_id = msg["document"]["file_id"]
        type_mime = msg["document"].get("mime_type", "application/pdf")
        if type_mime not in EXTENSIONS_AUTORISEES:
            return "Format non pris en charge (image ou PDF uniquement)."
    else:
        return None

    contenu, chemin_telegram = telegram.telecharger_fichier(file_id)
    nom_original = chemin_telegram.rsplit("/", 1)[-1]
    ranger_piece(donnees, voyage, contenu, type_mime, nom_original, prenom)
    return reponses.piece_rangee(voyage["titre"])
