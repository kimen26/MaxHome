"""Formatage des réponses du bot — aucune logique métier ici."""
import unicodedata

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
    valeur = quart / 4
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

    Groupée par moment (Matin / Soir), comme les deux cartes de l'écran Jour — texte brut,
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
    groupes = {"matin": [], "soir": [], None: []}
    for g in taches_mod.regrouper_pour_affichage(restantes, recurrents):
        m = recurrents.get(g["tache"]["recurrent_id"], {}).get("moment")
        groupes[m if m in ("matin", "soir") else None].append(g)

    lignes = ["À faire aujourd'hui :"]
    intitules = [("matin", "Matin"), ("soir", "Soir"), (None, "Autres tâches")]
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
  taches · balance [<jours>]
  ajoute <article> · courses
  bilan [<mois>]
  charges [<mois>]
  mois
  annuler
  aide
Mois : "en août", "août 2026", "08/2026". Défaut : mois courant."""


def inconnu():
    return "Je ne te connais pas. Demande à Yann de t'inscrire."


def non_compris():
    return "Je n'ai pas compris. Tape `aide`."


def proposer_copie(mois_vide_nom, mois_source_nom):
    return f"{mois_vide_nom.capitalize()} est vide. Démarrer depuis {mois_source_nom} ? oui/non"
