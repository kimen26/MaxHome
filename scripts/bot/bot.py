"""Boucle principale du bot Telegram MaxHome. Long polling, redémarre seul (tâche Windows).

Usage : python scripts/bot/bot.py
Journal rotatif : data/bot.log (jamais de secret dedans).
"""
import json
import logging
import logging.handlers
import subprocess
import sys
import time
from datetime import date, timedelta
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(RACINE / "scripts"))
sys.path.insert(0, str(RACINE / "scripts" / "bot"))

from provision import cles, lit_env  # noqa: E402
import actions  # noqa: E402
from aide_virements import aide_complete  # noqa: E402
import annulation  # noqa: E402
import budget_lignes  # noqa: E402
import budget_libelle  # noqa: E402
import budget_virements  # noqa: E402
import commandes  # noqa: E402
import libre  # noqa: E402
import taches as taches_mod  # noqa: E402
import reponses  # noqa: E402
import voyages as voyages_mod  # noqa: E402
from donnees import Donnees  # noqa: E402
from telegram import Telegram, est_reseau_transitoire  # noqa: E402

DATA = RACINE / "data"
DATA.mkdir(exist_ok=True)
CALC_CLI = RACINE / "scripts" / "bot" / "calc_cli.mjs"

ATTENTE_MINUTES = 10
PAUSE_RESEAU_MIN_S = 5
PAUSE_RESEAU_MAX_S = 60


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
    # encoding="utf-8" explicite : sur Windows, text=True seul retombe sur l'encodage console
    # (cp1252) et corromprait tout libellé accentué renvoyé un jour par calc_cli.mjs.
    r = subprocess.run(["node", str(CALC_CLI)], input=entree, capture_output=True, text=True,
                       encoding="utf-8", timeout=30)
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
        self.telegram = Telegram(env["MAXHOME_TELEGRAM_BOT_TOKEN"])
        self.charges = self.donnees.charges()
        self.membres = [m["prenom"] for m in self.donnees.membres()]
        # État en mémoire par telegram_id : {"attente": {...}} ou {"dernier": {...}} pour annuler.
        self.etats = {}

    def mois_courant(self):
        auj = date.today()
        return auj.year, auj.month

    def rafraichir_referentiel(self):
        """Recharge charges/membres (avant extra/bilan/charges/a_virer/valider) — voir une charge
        créée/terminée dans l'app sans redémarrage, plus simple ici qu'un TTL."""
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

    def basculer_fait(self, telegram_id, prenom, action, annee, mois):
        """`fait <titre>` vise une tâche si le titre lui correspond, sinon un mouvement.

        Sans titre, c'est toujours le virement au commun : cocher une tâche demande
        laquelle, on ne devine pas à la place de l'utilisateur. « à deux » ne s'applique
        qu'à une tâche : sur un mouvement (pas de titre reconnu comme tâche), ignoré.
        """
        titre = action.get("titre")
        if titre:
            liste, _ = taches_mod.du_jour(self.donnees)
            candidates = [t for t in liste if bool(t["fait_le"]) != action["fait"]]
            if candidates:
                trouve, _ = commandes.meilleur_flou(reponses.normaliser(titre), candidates, "titre")
                if trouve:
                    return self.basculer_tache(telegram_id, prenom, titre, action["fait"],
                                               action.get("a_deux", False))
        return budget_virements.basculer_mouvement(self, telegram_id, prenom, action, annee, mois)

    def basculer_tache(self, telegram_id, prenom, titre, fait, a_deux=False):
        """Coche (ou décoche) une tâche et rend l'écriture annulable.

        `a_deux` crédite aussi l'autre membre du foyer en `qui2`, avec ses propres parts
        pleines (D-038).
        """
        qui2 = None
        if a_deux and fait:
            qui2 = next((p for p in self.membres if p != prenom), None)
        cible, champs, erreur = taches_mod.basculer(self.donnees, prenom, titre, fait, qui2=qui2)
        if erreur:
            return erreur
        avant = {"fait_le": cible["fait_le"], "qui": cible["qui"], "qui2": cible.get("qui2"),
                 "parts_quart": cible["parts_quart"], "parts_quart2": cible.get("parts_quart2"),
                 "tiers": cible.get("tiers", 3), "tiers2": cible.get("tiers2")}
        self.marquer_annulable(telegram_id, "taches", {"id": cible["id"]}, avant)
        return reponses.confirmation_tache(cible["titre"], champs["parts_quart"], prenom, fait)

    def marquer_annulable(self, telegram_id, table, cle_filtre, ancienne_valeur):
        self.etats.setdefault(telegram_id, {})["dernier"] = {
            "table": table, "cle": cle_filtre, "ancienne_valeur": ancienne_valeur,
        }

    def annuler(self, telegram_id):
        etat = self.etats.get(telegram_id, {})
        dernier = etat.pop("dernier", None)
        if not dernier:
            return "Rien à annuler."
        annulation.restaurer(self.donnees, dernier["table"], dernier["cle"], dernier["ancienne_valeur"])
        return "Dernière écriture annulée."

    # Actions qui ne portent sur aucun mois : la proposition de copie ne s'y applique pas.
    SANS_MOIS = ("taches", "balance", "courses_liste", "course_ajout",
                 "voyages", "voyage", "lieu", "localise", "topo", "resa_libre")

    def traiter_action(self, telegram_id, prenom, action, texte_brut):
        """Aiguille vers le module concerné. Retourne le texte à envoyer, ou None."""
        a = action["action"]
        if a == "erreur":
            return action["message"]
        if a == "aide":
            return aide_complete(reponses.AIDE)
        if a == "annuler":
            return self.annuler(telegram_id)
        if a == "ambigu":
            return (f"Aucune charge ne correspond assez à « {action['libelle']} ». "
                    f"Proches : {', '.join(action['proches'])}.")
        if a == "inscrire":
            self.donnees.inscrire_telegram(action["telegram_id"], action["prenom"])
            return f"{action['prenom']} inscrit (id {action['telegram_id']})."
        if a == "moi":
            return "Utilise `/inscrire <ton id> <prenom>` envoyé par Yann pour t'inscrire."

        if a in self.SANS_MOIS:
            return (actions.taches(self, telegram_id, prenom, action)
                    or actions.courses(self, telegram_id, prenom, action)
                    or actions.voyages(self, telegram_id, prenom, action, texte_brut))

        if a in ("extra", "bilan", "charges", "a_virer", "valider", "libelle"):  # voir rafraichir_referentiel
            self.rafraichir_referentiel()
        annee, mois = action.get("annee"), action.get("mois")
        if a == "valider":  # hors actions.py (interdit) ; rien à copier sur mois vide
            return budget_virements.valider(self, telegram_id, prenom, action, annee, mois)
        if a == "a_virer":
            return budget_virements.a_virer(self, annee, mois)
        if a == "libelle":  # D-050, rien à copier sur mois vide non plus
            return budget_libelle.libelle(self, telegram_id, action["reste"], annee, mois)

        copie = self.proposer_copie_si_mois_vide(telegram_id, action, annee, mois)
        if copie:
            return copie
        return actions.budget(self, telegram_id, prenom, action, annee, mois)

    def proposer_copie_si_mois_vide(self, telegram_id, action, annee, mois):
        """Un mois vierge dont le précédent ne l'est pas : proposer de recopier. Sinon None."""
        if not (annee and mois) or not self.mois_est_vide(annee, mois):
            return None
        a_prec, m_prec = self.mois_precedent(annee, mois)
        if self.mois_est_vide(a_prec, m_prec):
            return None
        self.etats.setdefault(telegram_id, {})["attente"] = {
            "expire": time.time() + ATTENTE_MINUTES * 60,
            "action": action, "cible": (a_prec, m_prec),
        }
        return reponses.proposer_copie(reponses.nom_mois(annee, mois), reponses.nom_mois(a_prec, m_prec))

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

        norm = reponses.normaliser(texte_brut.strip())
        if norm in ("oui", "non") and self.etats.get(telegram_id, {}).get("attente_voyage"):
            return actions.confirmer_voyage(self, telegram_id, prenom, norm == "oui")

        annee_c, mois_c = self.mois_courant()
        charges_proposables = budget_lignes.charges_actives(self.charges)  # D-043 : jamais une terminée
        action = commandes.interpreter(texte_brut, self.membres, charges_proposables, annee_c, mois_c)
        if action["action"] is None:
            libelles = [c["libelle"] for c in charges_proposables]
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
            charge, proches = commandes.meilleur_libelle(
                reponses.normaliser(interp["libelle"]), budget_lignes.charges_actives(self.charges))
            if not charge:
                return {"action": "ambigu", "libelle": interp["libelle"], "proches": proches}
            centimes = commandes.valider_montant_euros(abs(interp["montant"]))
            valeur = centimes if interp["montant"] > 0 else -centimes
            return {"action": "charge", "charge_id": charge["id"], "libelle_reel": charge["libelle"],
                    "montant_centimes": valeur, "annee": annee, "mois": mois}
        if a in ("mouvement_fait", "tache_faite"):
            return {"action": "mouvement", "fait": interp.get("fait", True),
                    "titre": interp.get("titre") or None, "annee": annee, "mois": mois}
        if a == "taches":
            return {"action": "taches"}
        if a == "course_ajout":
            return {"action": "course_ajout", "libelle": str(interp.get("libelle", "")).strip()}
        if a == "courses_liste":
            return {"action": "courses_liste"}
        if a == "balance":
            return {"action": "balance", "jours": int(interp.get("jours") or 7)}
        if a == "bilan":
            return {"action": "bilan", "annee": annee, "mois": mois}
        if a == "charges":
            return {"action": "charges", "annee": annee, "mois": mois}
        if a == "ajustement":
            centimes = commandes.valider_montant_euros(abs(interp["montant"]))
            if centimes is None:
                return {"action": "erreur", "message": "Montant hors bornes (0 < montant <= 50 000 €)."}
            return {"action": "ajustement", "beneficiaire": interp["vers"],
                    "montant_centimes": centimes, "motif": interp.get("motif", ""),
                    "annee": annee, "mois": mois}
        return {"action": "erreur", "message": "Action libre non prise en charge."}

    def traiter_piece(self, telegram_id, msg):
        """Photo ou document PDF, légendé du nom d'un voyage. Aiguille vers voyages.py."""
        prenom = self.donnees.membre_telegram(telegram_id)
        if not prenom:
            return reponses.inconnu()
        return voyages_mod.traiter_piece(self.donnees, self.telegram, prenom, msg)

    def boucle(self, max_iterations=None):
        """`max_iterations` borne le nombre de passages (tests hors ligne) ; None = infini (prod)."""
        offset = 0
        pause_reseau = PAUSE_RESEAU_MIN_S
        self.log.info("bot démarré")
        iterations = 0
        while max_iterations is None or iterations < max_iterations:
            iterations += 1
            try:
                updates = self.telegram.get_updates(offset)
            except Exception as exc:
                if est_reseau_transitoire(exc):
                    self.log.warning("getUpdates : réseau indisponible (%s), pause %ds",
                                      type(exc).__name__, pause_reseau)
                    time.sleep(pause_reseau)
                    pause_reseau = min(pause_reseau * 2, PAUSE_RESEAU_MAX_S)
                else:
                    self.log.exception("getUpdates : erreur inattendue, pause %ds", PAUSE_RESEAU_MIN_S)
                    time.sleep(PAUSE_RESEAU_MIN_S)
                continue
            pause_reseau = PAUSE_RESEAU_MIN_S  # un getUpdates réussi remet le backoff à zéro
            for u in updates:
                offset = u["update_id"] + 1
                msg = u.get("message")
                if not msg:
                    continue
                chat_id = msg["chat"]["id"]
                telegram_id = msg["from"]["id"]
                if "text" in msg:
                    try:
                        reponse = self.traiter_message(telegram_id, msg["text"])
                    except Exception:
                        self.log.exception("erreur non gérée")
                        reponse = "Erreur interne, réessaie."
                elif "photo" in msg or "document" in msg:
                    try:
                        reponse = self.traiter_piece(telegram_id, msg)
                    except Exception:
                        self.log.exception("erreur traitement pièce jointe")
                        reponse = "Erreur interne, réessaie."
                else:
                    continue
                if reponse is None:
                    continue
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
