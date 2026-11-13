"""Client Telegram minimal : long polling getUpdates + sendMessage. Stdlib seule.

Le token n'est jamais journalisé ni affiché ; il est passé au constructeur.
"""
import json
import re
import uuid
import urllib.error
import urllib.request

API = "https://api.telegram.org"

def est_reseau_transitoire(exc):
    """Timeout, coupure, DNS, ou HTTP 5xx/429 de Telegram : la boucle de polling (bot.py)
    doit réessayer au lieu de mourir. Un HTTPError 4xx (hors 429) reste une erreur de
    requête, pas un aléa réseau : pas transitoire, remonte tel quel."""
    if isinstance(exc, urllib.error.HTTPError):
        return exc.code == 429 or exc.code >= 500
    return isinstance(exc, (TimeoutError, ConnectionError, OSError, urllib.error.URLError))


class Telegram:
    def __init__(self, token):
        self._base = f"{API}/bot{token}"

    def _appel(self, methode, corps=None, timeout=60):
        url = f"{self._base}/{methode}"
        data = json.dumps(corps).encode() if corps is not None else None
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("User-Agent", "maxhome-bot/1.0")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"telegram {methode} -> {e.code}: {e.read().decode()[:300]}") from e

    def _appel_multipart(self, methode, champs, fichiers, timeout=120):
        """POST multipart/form-data vers Telegram (envoi de fichiers). `fichiers` : {champ: (nom, contenu)}."""
        limite = uuid.uuid4().hex
        corps = b""
        for nom, valeur in champs.items():
            corps += f'--{limite}\r\nContent-Disposition: form-data; name="{nom}"\r\n\r\n{valeur}\r\n'.encode()
        for champ, (nom_fichier, contenu) in fichiers.items():
            nom_sur = re.sub(r'["\r\n]', "", nom_fichier)
            corps += (f'--{limite}\r\nContent-Disposition: form-data; name="{champ}"; filename="{nom_sur}"\r\n'
                      "Content-Type: application/octet-stream\r\n\r\n").encode() + contenu + b"\r\n"
        corps += f"--{limite}--\r\n".encode()
        req = urllib.request.Request(f"{self._base}/{methode}", data=corps, method="POST")
        req.add_header("Content-Type", f"multipart/form-data; boundary={limite}")
        req.add_header("User-Agent", "maxhome-bot/1.0")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                rep = json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"telegram {methode} -> {e.code}: {e.read().decode()[:300]}") from e
        if not rep.get("ok"):
            raise RuntimeError(f"{methode} échoué : {rep}")
        return rep["result"]

    def envoyer_fichiers(self, chat_id, fichiers):
        """Envoie des fichiers {nom, contenu, genre (photo|video|document), legende} : les photos et vidéos par
        albums de 10 au plus, les documents un par un. C'est un POST vers Telegram, jamais vers l'école."""
        medias = [f for f in fichiers if f["genre"] in ("photo", "video")]
        for i in range(0, len(medias), 10):
            lot = medias[i:i + 10]
            if len(lot) == 1:
                f = lot[0]
                self._appel_multipart("sendPhoto" if f["genre"] == "photo" else "sendVideo",
                                      {"chat_id": chat_id, "caption": f["legende"]},
                                      {f["genre"]: (f["nom"], f["contenu"])})
                continue
            descr = [{"type": f["genre"], "media": f"attach://f{n}", "caption": f["legende"]} for n, f in enumerate(lot)]
            self._appel_multipart("sendMediaGroup", {"chat_id": chat_id, "media": json.dumps(descr)},
                                  {f"f{n}": (f["nom"], f["contenu"]) for n, f in enumerate(lot)})
        for f in (f for f in fichiers if f["genre"] == "document"):
            self._appel_multipart("sendDocument", {"chat_id": chat_id, "caption": f["legende"]},
                                  {"document": (f["nom"], f["contenu"])})

    def get_updates(self, offset, timeout=50):
        rep = self._appel("getUpdates", {"offset": offset, "timeout": timeout}, timeout=timeout + 10)
        if not rep.get("ok"):
            raise RuntimeError(f"getUpdates échoué : {rep}")
        return rep["result"]

    def envoyer(self, chat_id, texte):
        rep = self._appel("sendMessage", {"chat_id": chat_id, "text": texte})
        if not rep.get("ok"):
            raise RuntimeError(f"sendMessage échoué : {rep}")
        return rep["result"]

    def get_me(self):
        """Le bot lui-même : id, username, can_read_all_group_messages (faux tant que le mode
        confidentialité de BotFather est actif)."""
        rep = self._appel("getMe", {}, timeout=30)
        if not rep.get("ok"):
            raise RuntimeError(f"getMe échoué : {rep}")
        return rep["result"]

    def quitter(self, chat_id):
        """Le bot quitte un groupe (leaveChat), sans y rien écrire."""
        rep = self._appel("leaveChat", {"chat_id": chat_id}, timeout=30)
        if not rep.get("ok"):
            raise RuntimeError(f"leaveChat échoué : {rep}")

    def telecharger_fichier(self, file_id, timeout=60):
        """getFile puis téléchargement du binaire. Retourne (contenu, chemin_telegram)."""
        rep = self._appel("getFile", {"file_id": file_id}, timeout=timeout)
        if not rep.get("ok"):
            raise RuntimeError(f"getFile échoué : {rep}")
        chemin = rep["result"]["file_path"]
        url = f"{API}/file/bot{self._base.split('/bot', 1)[1]}/{chemin}"
        req = urllib.request.Request(url, method="GET")
        req.add_header("User-Agent", "maxhome-bot/1.0")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return r.read(), chemin
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"téléchargement fichier -> {e.code}") from e
