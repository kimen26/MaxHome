"""Formatage des réponses du bot — aucune logique métier ici."""
import unicodedata
from datetime import datetime

MOIS_NOMS = ["", "janvier", "février", "mars", "avril", "mai", "juin", "juillet",
             "août", "septembre", "octobre", "novembre", "décembre"]


def normaliser(texte):
    """Minuscules, sans accents — pour matcher la grammaire et le fuzzy."""
    d = unicodedata.normalize("NFD", texte.lower())
    return "".join(c for c in d if unicodedata.category(c) != "Mn")


def euros(centimes):
    signe = "-" if centimes < 0 else ""
    v = abs(centimes) / 100
    entier = f"{int(v):,}".replace(",", " ")
    dec = f"{v:.2f}".split(".")[1]
    return f"{signe}{entier},{dec} €"


def nom_mois(annee, mois):
    return f"{MOIS_NOMS[mois]} {annee}"


def confirmation_ecriture(libelle, montant_centimes, annee, mois):
    return f"{libelle} {nom_mois(annee, mois)} : {euros(montant_centimes)} ✔"


def confirmation_ajustement(de, vers, montant_centimes, motif):
    m = euros(montant_centimes)
    txt = f"{de} prend {m} en plus : {vers} verse {m} de moins"
    if motif:
        txt += f" ({motif})"
    return txt


def confirmation_mouvement(titre, montant_centimes, fait):
    if fait:
        return f"{titre} : {euros(montant_centimes)} — fait ✔"
    return f"{titre} : coche annulée."


def bilan(r, membres, annee, mois, alerte_vide=False, restants=None):
    lignes = [f"Bilan {nom_mois(annee, mois)} :"]
    for p in membres:
        a_verser = -r["aVerser"].get(p, 0)
        lignes.append(f"  {p} verse {euros(a_verser)}")
    lignes.append("Reste à vivre :")
    for p in membres:
        lignes.append(f"  {p} : {euros(r['reste'].get(p, 0))}")
    lignes.append(f"Total commun : {euros(r['totalCommun'])}")
    if restants is not None:
        if restants:
            lignes.append("Reste à faire :")
            for m in restants:
                qui = f" ({m['qui']})" if m.get("qui") else ""
                lignes.append(f"  {m['titre']} : {euros(m['montant_centimes'])}{qui}")
        else:
            lignes.append("Tous les mouvements sont faits ✔")
    if alerte_vide:
        lignes.append("⚠️ des lignes du mois précédent sont vides ce mois-ci.")
    return "\n".join(lignes)


def liste_charges(charges, lignes):
    par_cat = {}
    for c in charges:
        if c.get("ponctuel"):
            continue
        montant = lignes.get(c["id"], 0)
        if not montant and not c.get("actif"):
            continue
        par_cat.setdefault(c["categorie"], []).append((c["libelle"], montant))
    blocs = []
    for cat, items in par_cat.items():
        blocs.append(f"{cat} :")
        for libelle, montant in items:
            blocs.append(f"  {libelle} : {euros(montant)}")
    return "\n".join(blocs) if blocs else "Aucune charge ce mois."


def pluriel(n, mot):
    return f"{n} {mot}{'s' if n > 1 else ''}"


def parts_texte(quart):
    """« 0,5 » « 1,5 » « 8 » — virgule française, pas de zéro inutile.

    Miroir de frontend/taches/taches.js::partsTexte.
    """
    # Arrondi au centième, comme le JS : une part au tiers (D-038) s'écrit 0,67.
    valeur = round(quart / 4, 2)
    if valeur == int(valeur):
        valeur = int(valeur)
    return str(valeur).replace(".", ",")


def parts_mot(quart):
    """« 1 part » / « 2 parts » — un seul endroit, l'accord se fait ici.

    Miroir de frontend/taches/taches.js::parts. Pluriel à partir de 2 (8 quarts), pas de 1 :
    en français « 1,5 part » reste au singulier.
    """
    return f"{parts_texte(quart)} part{'s' if quart >= 8 else ''}"


def confirmation_tache(titre, parts_quart, prenom, fait):
    if fait:
        return f"{titre} : fait par {prenom} ✔ (+{parts_mot(parts_quart)})"
    return f"{titre} : coche annulée."


def _ligne_tache(groupe, recurrents, aujourdhui):
    """Une ligne « titre — N part(s) (prénom) (fait/total) ⚠️ en retard », comme l'écran Jour.

    `groupe` vient de taches.regrouper_pour_affichage : une tâche prévue une seule fois
    (total == 1) garde exactement le format d'avant, sans compteur parasite (D-023 étendu
    au bot — cf. frontend/taches/ui-taches.js::regrouper et sa méta « 0/2 fait »). Le nombre
    fait se déduit par soustraction (total - restantes) : `restantes` ne contient que les
    occurrences non cochées de ce groupe, donc la différence est exacte sans requête de plus.
    """
    t = groupe["tache"]
    quart = recurrents.get(t["recurrent_id"], {}).get("parts_quart") or t.get("parts_quart") or 0
    retard = " ⚠️ en retard" if t["echeance"] < aujourdhui else ""
    qui = f" ({t['qui']})" if t.get("qui") else ""
    total = groupe["total"]
    fait = total - groupe["restantes"]
    compte = f" ({fait}/{total})" if total > 1 else ""
    return f"  {t['titre']} — {parts_mot(quart)}{qui}{compte}{retard}"


def liste_taches(restantes, recurrents, aujourdhui):
    """`restantes` déjà triées (taches.restantes : obligatoire, moment, échéance, rang, id).

    Groupée par moment (Matin / Midi / Soir / Nuit), comme les cartes de l'écran Jour — texte brut,
    le bot n'envoie pas de HTML. Les tâches sans moment (hebdo, mensuelle, au besoin, ou
    quotidienne pas encore réglée) suivent sous un bloc « Autres tâches » plutôt que d'être
    mélangées ou perdues, miroir de la carte « Sans moment » du front. Une tâche à `fois` > 1
    (biberons, dents...) tient sur une seule ligne avec un compte, esprit D-023 étendu au bot :
    16 lignes pour 12 tâches devenaient illisibles sur un écran de téléphone.
    """
    if not restantes:
        return "Rien à faire aujourd'hui ✔"
    # Import local : `taches` importe `commandes`, qui importe `normaliser` DE ce module
    # (reponses) — un import en tête de fichier créerait un cycle au chargement.
    import taches as taches_mod
    intitules = [("matin", "Matin"), ("midi", "Midi"), ("soir", "Soir"), ("nuit", "Nuit"),
                 (None, "Autres tâches")]
    groupes = {cle: [] for cle, _ in intitules}
    for g in taches_mod.regrouper_pour_affichage(restantes, recurrents):
        m = taches_mod.moment_de(g["tache"], recurrents)
        groupes[m if m in groupes else None].append(g)

    lignes = ["À faire aujourd'hui :"]
    for cle, intitule in intitules:
        bloc = groupes[cle]
        if not bloc:
            continue
        lignes.append(f"{intitule} :")
        for g in bloc:
            lignes.append(_ligne_tache(g, recurrents, aujourdhui))
    return "\n".join(lignes)


def balance_taches(b, membres, jours, obligatoire=None):
    """`obligatoire` : ratio KPI hebdomadaire optionnel ({prenom: ratio}), affiché en plus."""
    lignes = [f"Balance sur {jours} jours :"]
    for p in membres:
        lignes.append(f"  {p} : {round(b['ratio'][p] * 100)} % — {parts_mot(b['parts'][p])}"
                      f" · {pluriel(b['nombre'][p], 'tâche')}")
    if not b["total"]:
        lignes.append("Aucune tâche cochée sur la période.")
    if obligatoire:
        meneur = max(obligatoire, key=obligatoire.get)
        lignes.append(f"Obligatoire · {meneur} en assure {round(obligatoire[meneur] * 100)} %")
    return "\n".join(lignes)


def liste_courses(articles):
    restants = [a for a in articles if not a["coche_le"]]
    if not restants:
        return "Liste de courses vide."
    lignes = [f"Courses ({pluriel(len(restants), 'article')}) :"]
    par_rayon = {}
    for a in restants:
        par_rayon.setdefault(a["rayon"], []).append(a)
    for rayon, items in par_rayon.items():
        lignes.append(f"{rayon} :")
        for a in items:
            qte = f" · {a['quantite']}" if a.get("quantite") else ""
            lignes.append(f"  {a['libelle']}{qte}")
    return "\n".join(lignes)


AIDE = """Commandes :
  salaire <montant> [en <mois>]
  salaire <prenom> <montant>
  <libelle charge> <montant> [en <mois>]
  extra <libelle> <montant> [egales]
  <prenom> prend <montant> <motif>
  fait / pas fait [<titre>]   (virement ou tâche)
  à virer · valider <charge> [pour <prenom>] · dévalider <charge>
  libellé <charge ou compte> <texte du virement>
  taches · balance [<jours>]
  ajoute <article> · courses
  bilan [<mois>]
  charges [<mois>]
  mois
  annuler
  aide
  voyage <nom> · voyages
  lieu <voyage> <nom du lieu>
  localise <voyage>
  topo <voyage>
  résa <en langage libre>
  photo/PDF avec légende = nom du voyage
Mois : "en août", "août 2026", "08/2026". Défaut : mois courant."""


def inconnu():
    return "Je ne te connais pas. Demande à Yann de t'inscrire."


def non_compris():
    return "Je n'ai pas compris. Tape `aide`."


def proposer_copie(mois_vide_nom, mois_source_nom):
    return f"{mois_vide_nom.capitalize()} est vide. Démarrer depuis {mois_source_nom} ? oui/non"


# ---------- module Voyages (carnet, D-045) ----------
MOTS_TYPE_RESA = {
    "vol": "✈️ Vol", "train": "🚆 Train", "logement": "🏠 Logement",
    "voiture": "🚗 Voiture", "activite": "🎟️ Activité", "repas": "🍽️ Repas", "autre": "📌",
}
MOTS_CATEGORIE_LIEU = {
    "a_voir": "à voir", "activite": "activité", "logement": "logement",
    "resto": "resto", "transport": "transport", "autre": "autre",
}


def _date_heure(iso):
    """« 10/04 12:10 » à partir d'un timestamp ISO sans fuseau, ou « ? » si absent."""
    if not iso:
        return "?"
    try:
        dt = datetime.fromisoformat(iso)
        return dt.strftime("%d/%m %H:%M")
    except ValueError:
        return iso[:16]


def _ligne_resa(r):
    mot = MOTS_TYPE_RESA.get(r["type"], "📌")
    prix = f" · {euros(r['prix_centimes'])}" if r.get("prix_centimes") is not None else ""
    paye = f" · payé par {r['paye_par']}" if r.get("paye_par") else ""
    code = f" · {r['code']}" if r.get("code") else ""
    return f"  {mot} {r['titre']} — {_date_heure(r.get('debut'))}{code}{prix}{paye}"


def _ligne_lieu(l):
    cat = MOTS_CATEGORIE_LIEU.get(l["categorie"], l["categorie"])
    return f"  {l['nom']} ({cat})"


def fiche_voyage(voyage, resas, lieux_du_jour_ou_prochains, jour_aujourdhui,
                  resume=None, budget_engage=None, budget_prevu=None):
    """`resume` (le bloc résumé, V2 D-047) ouvre la fiche s'il existe ; suit « Budget : engagé
    / prévu » si au moins un montant est non nul (rien n'est affiché tant qu'aucune enveloppe
    n'est cadrée ET qu'aucune résa n'est engagée — pas de « 0 € / 0 € » qui ne dit rien)."""
    lignes = [f"{voyage['titre']} — {voyage.get('lieu') or '?'}"]
    if resume:
        lignes.append(resume)
    if budget_engage or budget_prevu:
        lignes.append(f"Budget : {euros(budget_engage or 0)} engagé / {euros(budget_prevu or 0)} prévu")
    if resas:
        lignes.append("Réservations :")
        for r in resas:
            lignes.append(_ligne_resa(r))
    else:
        lignes.append("Aucune réservation.")
    if lieux_du_jour_ou_prochains:
        titre_bloc = "Lieux du jour :" if any(l.get("jour") == jour_aujourdhui for l in lieux_du_jour_ou_prochains) \
            else "Prochains lieux prévus :"
        lignes.append(titre_bloc)
        for l in lieux_du_jour_ou_prochains:
            lignes.append(_ligne_lieu(l))
    return "\n".join(lignes)


def liste_voyages(voyages_avec_delai):
    """`voyages_avec_delai` : [(voyage, n_jours)], déjà triés."""
    if not voyages_avec_delai:
        return "Aucun voyage à venir."
    lignes = ["Voyages à venir :"]
    for v, n in voyages_avec_delai:
        delai = "aujourd'hui" if n == 0 else f"dans {n} jour{'s' if n > 1 else ''}"
        lignes.append(f"  {v['titre']} — {v.get('lieu') or '?'} ({delai})")
    return "\n".join(lignes)


def lieu_ajoute(nom_lieu, lieu):
    if lieu.get("lat") is not None:
        return f"« {nom_lieu} » ajouté : {lieu['adresse']}"
    return f"« {nom_lieu} » ajouté sans position (introuvable sur la carte)."


def localisation_resultat(n_localises, restants):
    base = f"{pluriel(n_localises, 'lieu')} localisé{'s' if n_localises > 1 else ''}"
    if not restants:
        return f"{base}, aucun restant."
    return f"{base}, {pluriel(len(restants), 'lieu')} restent sans position : {', '.join(restants)}."


def recap_resa(resa):
    prix = euros(resa["prix_centimes"]) if resa.get("prix_centimes") is not None else "?"
    lignes = [
        f"Réservation pour {resa['voyage_titre']} :",
        f"  {MOTS_TYPE_RESA.get(resa['type'], '📌')} {resa['titre']}",
        f"  {_date_heure(resa.get('debut'))}" + (f" → {_date_heure(resa['fin'])}" if resa.get("fin") else ""),
    ]
    if resa.get("prestataire"):
        lignes.append(f"  Prestataire : {resa['prestataire']}")
    if resa.get("code"):
        lignes.append(f"  Code : {resa['code']}")
    lignes.append(f"  Prix : {prix}" + (f" · payé par {resa['paye_par']}" if resa.get("paye_par") else ""))
    lignes.append("Enregistrer ? oui/non")
    return "\n".join(lignes)


def resa_enregistree(resa):
    return f"Réservation « {resa['titre']} » enregistrée pour {resa.get('voyage_titre', '')}."


def topo_propose(texte):
    apercu = texte if len(texte) <= 1500 else texte[:1497] + "..."
    return f"{apercu}\n\nEnregistrer ce topo ? oui/non"


def piece_rangee(nom_voyage):
    return f"Billet rangé dans {nom_voyage}."
