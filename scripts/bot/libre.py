"""Repli en phrase libre : appelle `claude -p` en local (abonnement, pas de clé API).

Timeout 60 s. Si claude échoue ou n'est pas installé : ne jamais planter la boucle,
retourner {"action": "inconnu"}.
"""
import json
import re
import subprocess

_RE_FENCE = re.compile(r"^```(?:json)?\s*|\s*```$", re.MULTILINE)


def _sans_fences(texte):
    """Malgré la consigne « sans texte autour », le modèle encadre parfois sa réponse de
    ```json ... ``` : on l'enlève avant de parser, plutôt que d'échouer silencieusement."""
    return _RE_FENCE.sub("", texte).strip()

PROMPT_SYSTEME = """Tu es l'interpréteur d'un bot budget familial. Réponds UNIQUEMENT en JSON, une seule ligne, sans texte autour.
Actions possibles :
  {{"action":"salaire","prenom":"...","montant":123.45,"mois":null}}
  {{"action":"charge","libelle":"...","montant":-12.3,"mois":null}}
  {{"action":"extra","libelle":"...","montant":-12.3,"regle":"proport","mois":null}}
  {{"action":"ajustement","de":"...","vers":"...","montant":12.3,"motif":"...","mois":null}}
  {{"action":"mouvement_fait","titre":null,"fait":true}}
  {{"action":"tache_faite","titre":"...","fait":true}}
  {{"action":"taches"}}
  {{"action":"balance","jours":7}}
  {{"action":"course_ajout","libelle":"..."}}
  {{"action":"courses_liste"}}
  {{"action":"bilan","mois":null}}
  {{"action":"charges","mois":null}}
  {{"action":"question","texte":"..."}}
  {{"action":"inconnu"}}
"montant" toujours positif en euros (le signe est déduit par le bot). "mois" au format "AAAA-MM" ou null pour le mois courant.
Libellés de charges existants : {libelles}
Mois courant : {mois_courant}
Message de l'utilisateur : {message}"""


def interpreter(message, libelles, mois_courant, timeout=60):
    prompt = PROMPT_SYSTEME.format(
        libelles=", ".join(libelles), mois_courant=mois_courant, message=message,
    )
    try:
        r = subprocess.run(
            ["claude", "-p", prompt, "--model", "haiku", "--output-format", "json"],
            capture_output=True, text=True, timeout=timeout,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return {"action": "inconnu"}
    if r.returncode != 0:
        return {"action": "inconnu"}
    try:
        enveloppe = json.loads(r.stdout)
        # `claude --output-format json` enveloppe la réponse dans un champ "result".
        brut = enveloppe.get("result", enveloppe) if isinstance(enveloppe, dict) else enveloppe
        if isinstance(brut, str):
            brut = json.loads(_sans_fences(brut))
        return brut
    except (json.JSONDecodeError, AttributeError, TypeError):
        return {"action": "inconnu"}


PROMPT_RESA = """Tu extrais une réservation de voyage depuis un message en langage libre. Réponds UNIQUEMENT en JSON, une seule ligne, sans texte autour.
Schéma : {{"voyage":"...","type":"vol|train|logement|voiture|activite|autre","titre":"...","debut":"AAAA-MM-JJ HH:MM"|null,"fin":"AAAA-MM-JJ HH:MM"|null,"prestataire":"..."|null,"code":"..."|null,"prix_centimes":12345|null,"paye_par":"..."|null}}
"prix_centimes" est le prix en centimes d'euro entiers (578,35 € -> 57835), null si absent.
"debut"/"fin" : heure LOCALE du lieu, sans fuseau, null si absente. Année par défaut : l'année courante si absente du message.
Voyages existants : {voyages}
Membres du foyer : {membres}
Message : {message}"""


def interpreter_resa(message, voyages, membres, timeout=60):
    prompt = PROMPT_RESA.format(
        voyages=", ".join(voyages), membres=", ".join(membres), message=message,
    )
    try:
        r = subprocess.run(
            ["claude", "-p", prompt, "--model", "haiku", "--output-format", "json"],
            capture_output=True, text=True, timeout=timeout,
        )
    except (FileNotFoundError, subprocess.TimeoutExpired):
        return {"action": "inconnu"}
    if r.returncode != 0:
        return {"action": "inconnu"}
    try:
        enveloppe = json.loads(r.stdout)
        brut = enveloppe.get("result", enveloppe) if isinstance(enveloppe, dict) else enveloppe
        if isinstance(brut, str):
            brut = json.loads(_sans_fences(brut))
        return brut
    except (json.JSONDecodeError, AttributeError, TypeError):
        return {"action": "inconnu"}


def formuler(chiffres, question, timeout=60):
    """Claude ne calcule pas : il reçoit des chiffres déjà agrégés et formule une phrase."""
    prompt = (
        "Réponds en une phrase claire à la question de l'utilisateur, en te basant "
        f"UNIQUEMENT sur ces chiffres (centimes d'euro) : {json.dumps(chiffres, ensure_ascii=False)}. "
        f"Question : {question}"
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
        return enveloppe.get("result") if isinstance(enveloppe, dict) else str(enveloppe)
    except json.JSONDecodeError:
        return None
