"""Boucle principale du bot Telegram MaxBudget. Long polling, redémarre seul (tâche Windows).

Usage : python scripts/bot/bot.py
Journal rotatif : data/bot.log (jamais de secret dedans).
"""
import json
import logging
import logging.handlers
import subprocess
import sys
import time
from datetime import date
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(RACINE / "scripts"))
sys.path.insert(0, str(RACINE / "scripts" / "bot"))

from provision import cles, lit_env  # noqa: E402
import commandes  # noqa: E402
import libre  # noqa: E402
import mouvements  # noqa: E402
import reponses  # noqa: E402
from donnees import Donnees  # noqa: E402
from telegram import Telegram  # noqa: E402

DATA = RACINE / "data"
DATA.mkdir(exist_ok=True)
CALC_CLI = RACINE / "scripts" / "bot" / "calc_cli.mjs"

ATTENTE_MINUTES = 10


def configurer_journal():
    DATA.mkdir(exist_ok=True)
    logger = logging.getLogger("bot")
    logger.setLevel(logging.INFO)
    handler = logging.handlers.RotatingFileHandler(
        DATA / "bot.log", maxBytes=2_000_000, backupCount=3, encoding="utf-8")
    handler.setFormatter(logging.Formatter("%(asctime)s %(levelname)s %(message)s"))
    logger.addHandler(handler)
    logger.addHandler(logging.StreamHandler(sys.stdout))
    return logger


def calculer(charges, lignes, revenus, ajustements):
    entree = json.dumps({"charges": charges, "lignes": lignes, "revenus": revenus, "ajustements": ajustements})
    r = subprocess.run(["node", str(CALC_CLI)], input=entree, capture_output=True, text=True, timeout=30)
    if r.returncode != 0:
        raise RuntimeError(f"calc_cli.mjs échoué : {r.stderr[:300]}")
    return json.loads(r.stdout)


class Bot:
    def __init__(self, log):
        self.log = log
        env = lit_env()
        ref, pat = env["SUPABASE_REF"], env["SUPABASE_PAT"]
        _, service_role = cles(ref, pat)
        self.donnees = Donnees(ref, service_role)
        self.telegram = Telegram(env["MAXBUDGET_TELEGRAM_BOT_TOKEN"])
        self.charges = self.donnees.charges()
        self.membres = [m["prenom"] for m in self.donnees.membres()]
        # État en mémoire par telegram_id : {"attente": {...}} ou {"dernier": {...}} pour annuler.
        self.etats = {}

    def mois_courant(self):
        auj = date.today()
        return auj.year, auj.month

    def rafraichir_referentiel(self):
        self.charges = self.donnees.charges()
        self.membres = [m["prenom"] for m in self.donnees.membres()]

    def charger_r(self, annee, mois):
        lignes_l, revenus_l = self.donnees.mois(annee, mois)
        lignes = {l["charge_id"]: l["montant_centimes"] for l in lignes_l}
        revenus = {r["prenom"]: r["montant_centimes"] for r in revenus_l}
        for p in self.membres:
            revenus.setdefault(p, 0)
        ajustements_b = self.donnees.ajustements(annee, mois)
        ajustements = [{"de": a["de"], "vers": a["vers"], "montant_centimes": a["montant_centimes"]} for a in ajustements_b]
        r = calculer(self.charges, lignes, revenus, ajustements)
        return r, lignes, revenus

    def mois_est_vide(self, annee, mois):
        lignes = self.donnees.lignes_mois(annee, mois)
        revenus = self.donnees.revenus_mois(annee, mois)
        return not any(l["montant_centimes"] for l in lignes) and not any(r["montant_centimes"] for r in revenus)

    def mois_precedent(self, annee, mois):
        return (annee - 1, 12) if mois == 1 else (annee, mois - 1)

    def copier_depuis_precedent(self, annee, mois):
        a_prec, m_prec = self.mois_precedent(annee, mois)
        lignes = self.donnees.lignes_mois(a_prec, m_prec)
        revenus = self.donnees.revenus_mois(a_prec, m_prec)
        non_ponctuelles = {c["id"] for c in self.charges if not c.get("ponctuel")}
        for l in lignes:
            if l["charge_id"] in non_ponctuelles:
                self.donnees.maj_ligne(annee, mois, l["charge_id"], l["montant_centimes"])
        for r in revenus:
            self.donnees.maj_revenu(annee, mois, r["prenom"], r["montant_centimes"])

    def basculer_mouvement(self, telegram_id, prenom, action, annee, mois):
        """Coche (ou décoche) un mouvement du mois et rend l'écriture annulable."""
        resultat, lignes, _ = self.charger_r(annee, mois)
        cible, champs, erreur = mouvements.basculer(
            self.donnees, prenom, action.get("titre"), action["fait"], resultat, lignes, annee, mois)
        if erreur:
            return erreur
        avant = {"fait_le": cible["fait_le"], "montant_centimes": cible["montant_centimes"]}
        self.marquer_annulable(telegram_id, "mouvements", {"id": cible["id"]}, avant)
        return reponses.confirmation_mouvement(cible["titre"], champs["montant_centimes"], action["fait"])

    def marquer_annulable(self, telegram_id, table, cle_filtre, ancienne_valeur):
        self.etats.setdefault(telegram_id, {})["dernier"] = {
            "table": table, "cle": cle_filtre, "ancienne_valeur": ancienne_valeur,
        }

    def annuler(self, telegram_id):
        etat = self.etats.get(telegram_id, {})
        dernier = etat.pop("dernier", None)
        if not dernier:
            return "Rien à annuler."
        table, cle, ancienne = dernier["table"], dernier["cle"], dernier["ancienne_valeur"]
        if table == "revenus":
            self.donnees.maj_revenu(cle["annee"], cle["mois"], cle["prenom"], ancienne)
        elif table == "lignes":
            self.donnees.maj_ligne(cle["annee"], cle["mois"], cle["charge_id"], ancienne)
        elif table == "ajustements":
            self.donnees.supprimer_ajustement(cle["id"])
        elif table == "mouvements":
            self.donnees.maj_mouvement(cle["id"], {"fait_le": ancienne["fait_le"],
                                                   "montant_centimes": ancienne["montant_centimes"]})
        else:
            raise RuntimeError(f"annulation non gérée pour la table {table}")
        return "Dernière écriture annulée."

    def traiter_action(self, telegram_id, prenom, action, texte_brut):
        a = action["action"]
        if a == "erreur":
            return action["message"]
        if a == "aide":
            return reponses.AIDE
        if a == "annuler":
            return self.annuler(telegram_id)
        if a == "ambigu":
            proches = ", ".join(action["proches"])
            return f"Aucune charge ne correspond assez à « {action['libelle']} ». Proches : {proches}."

        annee, mois = action.get("annee"), action.get("mois")
        if annee and mois and self.mois_est_vide(annee, mois):
            a_prec, m_prec = self.mois_precedent(annee, mois)
            if not self.mois_est_vide(a_prec, m_prec):
                self.etats.setdefault(telegram_id, {})["attente"] = {
                    "expire": time.time() + ATTENTE_MINUTES * 60,
                    "action": action, "cible": (a_prec, m_prec),
                }
                return reponses.proposer_copie(reponses.nom_mois(annee, mois), reponses.nom_mois(a_prec, m_prec))

        if a == "mois":
            return f"Mois courant : {reponses.nom_mois(annee, mois)}."
        if a == "bilan":
            r, lignes, revenus = self.charger_r(annee, mois)
            precedent_a, precedent_m = self.mois_precedent(annee, mois)
            prec_lignes = {l["charge_id"] for l in self.donnees.lignes_mois(precedent_a, precedent_m) if l["montant_centimes"]}
            actuelles = {cid for cid, m in lignes.items() if m}
            alerte = bool(prec_lignes - actuelles)
            restants = mouvements.restants(self.donnees, annee, mois, r, lignes)
            return reponses.bilan(r, self.membres, annee, mois, alerte, restants)
        if a == "charges":
            _, lignes, _ = self.charger_r(annee, mois)
            return reponses.liste_charges(self.charges, lignes)

        if a == "salaire":
            cible = action["prenom"] or prenom
            if cible not in self.membres:
                return f"Prénom inconnu : {cible}."
            ancienne = self.donnees.revenus_mois(annee, mois)
            ancienne_v = next((r["montant_centimes"] for r in ancienne if r["prenom"] == cible), 0)
            self.donnees.maj_revenu(annee, mois, cible, action["montant_centimes"])
            self.marquer_annulable(telegram_id, "revenus", {"annee": annee, "mois": mois, "prenom": cible}, ancienne_v)
            return reponses.confirmation_ecriture(f"Salaire {cible}", action["montant_centimes"], annee, mois)

        if a == "charge":
            ancienne = self.donnees.lignes_mois(annee, mois)
            ancienne_v = next((l["montant_centimes"] for l in ancienne if l["charge_id"] == action["charge_id"]), 0)
            self.donnees.maj_ligne(annee, mois, action["charge_id"], action["montant_centimes"])
            self.marquer_annulable(telegram_id, "lignes", {"annee": annee, "mois": mois, "charge_id": action["charge_id"]}, ancienne_v)
            return reponses.confirmation_ecriture(action["libelle_reel"], action["montant_centimes"], annee, mois)

        if a == "extra":
            c = self.donnees.creer_charge({
                "libelle": action["libelle"], "categorie": "Autre", "regle": action["regle"], "type": "proport",
                "ponctuel": True, "actif": False, "ordre": 999,
            })
            self.charges.append(c)
            self.donnees.maj_ligne(annee, mois, c["id"], action["montant_centimes"])
            self.marquer_annulable(telegram_id, "lignes", {"annee": annee, "mois": mois, "charge_id": c["id"]}, 0)
            return reponses.confirmation_ecriture(f"Extra {action['libelle']}", action["montant_centimes"], annee, mois)

        if a == "ajustement":
            de = prenom if action["beneficiaire"] != prenom else next((p for p in self.membres if p != prenom), prenom)
            vers = action["beneficiaire"] if action["beneficiaire"] != prenom else next((p for p in self.membres if p != prenom), prenom)
            # "X prend N motif" => X reçoit moins de charge à verser : de = autre membre, vers = X.
            autre = next((p for p in self.membres if p != action["beneficiaire"]), action["beneficiaire"])
            reg = self.donnees.creer_ajustement({
                "annee": annee, "mois": mois, "de": autre, "vers": action["beneficiaire"],
                "montant_centimes": action["montant_centimes"], "motif": action["motif"],
            })
            self.marquer_annulable(telegram_id, "ajustements", {"id": reg["id"]}, None)
            return reponses.confirmation_ajustement(autre, action["beneficiaire"], action["montant_centimes"], action["motif"])

        if a == "mouvement":
            return self.basculer_mouvement(telegram_id, prenom, action, annee, mois)

        if a == "inscrire":
            self.donnees.inscrire_telegram(action["telegram_id"], action["prenom"])
            return f"{action['prenom']} inscrit (id {action['telegram_id']})."

        if a == "moi":
            return "Utilise `/inscrire <ton id> <prenom>` envoyé par Yann pour t'inscrire."

        return None

    def gerer_attente(self, telegram_id, prenom, texte_brut):
        etat = self.etats.get(telegram_id, {}).get("attente")
        if not etat:
            return None
        if time.time() > etat["expire"]:
            self.etats[telegram_id].pop("attente", None)
            return None
        norm = reponses.normaliser(texte_brut.strip())
        if norm not in ("oui", "non"):
            return "Réponds oui ou non (ou attends, la proposition expire)."
        self.etats[telegram_id].pop("attente", None)
        if norm == "non":
            return "OK, rien fait."
        action = etat["action"]
        a_cible, m_cible = etat["cible"]
        annee, mois = action.get("annee"), action.get("mois")
        self.copier_depuis_precedent(annee, mois)
        suite = self.traiter_action(telegram_id, prenom, action, texte_brut)
        return f"Copié depuis {reponses.nom_mois(a_cible, m_cible)}.\n{suite}"

    def traiter_message(self, telegram_id, texte_brut):
        prenom = self.donnees.membre_telegram(telegram_id)
        if not prenom:
            self.log.info("message d'un inconnu (id masqué)")
            return reponses.inconnu()

        rep_attente = self.gerer_attente(telegram_id, prenom, texte_brut)
        if rep_attente is not None:
            return rep_attente

        annee_c, mois_c = self.mois_courant()
        action = commandes.interpreter(texte_brut, self.membres, self.charges, annee_c, mois_c)
        if action["action"] is None:
            libelles = [c["libelle"] for c in self.charges]
            interp = libre.interpreter(texte_brut, libelles, f"{annee_c}-{mois_c:02d}")
            if interp.get("action") == "question":
                r, _, _ = self.charger_r(annee_c, mois_c)
                reponse = libre.formuler(r, interp["texte"])
                return reponse or reponses.non_compris()
            if interp.get("action") in (None, "inconnu"):
                return reponses.non_compris()
            # Confirmation obligatoire avant toute écriture issue du langage libre.
            self.etats.setdefault(telegram_id, {})["confirmation_libre"] = interp
            return f"J'ai compris : {json.dumps(interp, ensure_ascii=False)}. OK ? (oui/non)"

        confirmation_libre = self.etats.get(telegram_id, {}).pop("confirmation_libre", None)
        if confirmation_libre and reponses.normaliser(texte_brut.strip()) in ("oui", "non"):
            if reponses.normaliser(texte_brut.strip()) == "non":
                return "OK, rien fait."
            action = self._traduire_action_libre(confirmation_libre, annee_c, mois_c)

        try:
            resultat = self.traiter_action(telegram_id, prenom, action, texte_brut)
        except Exception:
            self.log.exception("erreur traitement action")
            return "Erreur interne, réessaie."
        return resultat or reponses.non_compris()

    def _traduire_action_libre(self, interp, annee_c, mois_c):
        """Convertit le JSON libre (schéma libre.py) vers le schéma interne de commandes.py."""
        mois_str = interp.get("mois")
        if mois_str:
            annee, mois = int(mois_str[:4]), int(mois_str[5:7])
        else:
            annee, mois = annee_c, mois_c
        a = interp["action"]
        if a == "salaire":
            centimes = commandes.valider_montant_euros(interp["montant"])
            return {"action": "salaire", "prenom": interp.get("prenom"), "montant_centimes": centimes, "annee": annee, "mois": mois}
        if a == "charge":
            charge, proches = commandes.meilleur_libelle(reponses.normaliser(interp["libelle"]), self.charges)
            if not charge:
                return {"action": "ambigu", "libelle": interp["libelle"], "proches": proches}
            centimes = commandes.valider_montant_euros(abs(interp["montant"]))
            valeur = centimes if interp["montant"] > 0 else -centimes
            return {"action": "charge", "charge_id": charge["id"], "libelle_reel": charge["libelle"],
                    "montant_centimes": valeur, "annee": annee, "mois": mois}
        return {"action": "erreur", "message": "Action libre non prise en charge."}

    def boucle(self):
        offset = 0
        self.log.info("bot démarré")
        while True:
            try:
                updates = self.telegram.get_updates(offset)
            except Exception:
                self.log.exception("getUpdates échoué, pause 5 s")
                time.sleep(5)
                continue
            for u in updates:
                offset = u["update_id"] + 1
                msg = u.get("message")
                if not msg or "text" not in msg:
                    continue
                chat_id = msg["chat"]["id"]
                telegram_id = msg["from"]["id"]
                texte = msg["text"]
                try:
                    reponse = self.traiter_message(telegram_id, texte)
                except Exception:
                    self.log.exception("erreur non gérée")
                    reponse = "Erreur interne, réessaie."
                try:
                    self.telegram.envoyer(chat_id, reponse)
                except Exception:
                    self.log.exception("envoi Telegram échoué")


def main():
    log = configurer_journal()
    try:
        bot = Bot(log)
    except Exception:
        log.exception("démarrage échoué")
        raise
    bot.boucle()


if __name__ == "__main__":
    main()
