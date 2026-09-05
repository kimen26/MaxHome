"""Client Telegram minimal : long polling getUpdates + sendMessage. Stdlib seule.

Le token n'est jamais journalisé ni affiché ; il est passé au constructeur.
"""
import json
import urllib.error
import urllib.request

API = "https://api.telegram.org"


class Telegram:
    def __init__(self, token):
        self._base = f"{API}/bot{token}"

    def _appel(self, methode, corps=None, timeout=60):
        url = f"{self._base}/{methode}"
        data = json.dumps(corps).encode() if corps is not None else None
        req = urllib.request.Request(url, data=data, method="POST")
        req.add_header("Content-Type", "application/json")
        req.add_header("User-Agent", "maxbudget-bot/1.0")
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                return json.loads(r.read().decode())
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"telegram {methode} -> {e.code}: {e.read().decode()[:300]}") from e

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
