"""Accès Supabase REST (PostgREST) pour le bot — clé service_role, jamais écrite/journalisée.

La RLS est contournée par service_role (voulu, l'allowlist Telegram fait le garde-fou
côté bot dans commandes.py/bot.py).
"""
import json
import urllib.error
import urllib.request


class Donnees:
    def __init__(self, ref, service_role):
        self._base = f"https://{ref}.supabase.co/rest/v1"
        self._entetes = {
            "apikey": service_role,
            "Authorization": f"Bearer {service_role}",
            "Content-Type": "application/json",
            "User-Agent": "maxhome-bot/1.0",
        }

    def _appel(self, methode, chemin, corps=None, entetes_extra=None):
        url = f"{self._base}/{chemin}"
        data = json.dumps(corps).encode() if corps is not None else None
        req = urllib.request.Request(url, data=data, method=methode)
        for k, v in {**self._entetes, **(entetes_extra or {})}.items():
            req.add_header(k, v)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                texte = r.read().decode()
                return json.loads(texte) if texte else None
        except urllib.error.HTTPError as e:
            raise RuntimeError(f"supabase {methode} {chemin} -> {e.code}: {e.read().decode()[:300]}") from e

    # ---------- lecture ----------
    def membre_telegram(self, telegram_id):
        r = self._appel("GET", f"telegram_membres?telegram_id=eq.{telegram_id}&select=telegram_id,prenom")
        return r[0]["prenom"] if r else None

    def membres(self):
        return self._appel("GET", "membres?select=prenom,ordre&order=ordre")

    def charges(self):
        return self._appel("GET", "charges?select=*&order=ordre")

    def mois(self, annee, mois):
        lignes = self._appel("GET", f"lignes?annee=eq.{annee}&mois=eq.{mois}&select=charge_id,montant_centimes")
        revenus = self._appel("GET", f"revenus?annee=eq.{annee}&mois=eq.{mois}&select=prenom,montant_centimes")
        return lignes, revenus

    def ajustements(self, annee, mois):
        return self._appel("GET", f"ajustements?annee=eq.{annee}&mois=eq.{mois}&select=*")

    def recurrents_actifs(self):
        return self._appel("GET", "mouvements_recurrents?actif=is.true&select=*&order=ordre&order=id")

    def mouvements(self, annee, mois):
        return self._appel("GET", f"mouvements?annee=eq.{annee}&mois=eq.{mois}&select=*&order=id")

    # ---------- écriture (upsert = idempotent, merge-duplicates) ----------
    def maj_revenu(self, annee, mois, prenom, montant_centimes):
        self._appel("POST", "revenus", {"annee": annee, "mois": mois, "prenom": prenom, "montant_centimes": montant_centimes},
                    {"Prefer": "resolution=merge-duplicates"})

    def maj_ligne(self, annee, mois, charge_id, montant_centimes):
        self._appel("POST", "lignes", {"annee": annee, "mois": mois, "charge_id": charge_id, "montant_centimes": montant_centimes},
                    {"Prefer": "resolution=merge-duplicates"})

    def creer_charge(self, champs):
        r = self._appel("POST", "charges", champs, {"Prefer": "return=representation"})
        return r[0]

    def creer_ajustement(self, champs):
        r = self._appel("POST", "ajustements", champs, {"Prefer": "return=representation"})
        return r[0]

    def supprimer_ajustement(self, id_):
        self._appel("DELETE", f"ajustements?id=eq.{id_}")

    def creer_mouvements(self, lignes):
        """Crée les occurrences manquantes du mois. Retourne les lignes créées (avec leur id)."""
        if not lignes:
            return []
        return self._appel("POST", "mouvements", lignes, {"Prefer": "return=representation"})

    def maj_mouvement(self, id_, champs):
        r = self._appel("PATCH", f"mouvements?id=eq.{id_}", champs, {"Prefer": "return=representation"})
        if not r:
            raise RuntimeError(f"mouvement {id_} introuvable")
        return r[0]

    def lignes_mois(self, annee, mois):
        return self._appel("GET", f"lignes?annee=eq.{annee}&mois=eq.{mois}&select=charge_id,montant_centimes")

    def revenus_mois(self, annee, mois):
        return self._appel("GET", f"revenus?annee=eq.{annee}&mois=eq.{mois}&select=prenom,montant_centimes")

    def inscrire_telegram(self, telegram_id, prenom):
        self._appel("POST", "telegram_membres", {"telegram_id": telegram_id, "prenom": prenom},
                    {"Prefer": "resolution=merge-duplicates"})
