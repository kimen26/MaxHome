"""Repli en phrase libre : appelle `claude -p` en local (abonnement, pas de clé API).

Timeout 60 s. Si claude échoue ou n'est pas installé : ne jamais planter la boucle,
retourner {"action": "inconnu"}.
"""
import json
import subprocess

PROMPT_SYSTEME = """Tu es l'interpréteur d'un bot budget familial. Réponds UNIQUEMENT en JSON, une seule ligne, sans texte autour.
Actions possibles :
  {{"action":"salaire","prenom":"...","montant":123.45,"mois":null}}
  {{"action":"charge","libelle":"...","montant":-12.3,"mois":null}}
  {{"action":"extra","libelle":"...","montant":-12.3,"regle":"proport","mois":null}}
  {{"action":"ajustement","de":"...","vers":"...","montant":12.3,"motif":"...","mois":null}}
  {{"action":"virement_fait","fait":true}}
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
            brut = json.loads(brut)
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
