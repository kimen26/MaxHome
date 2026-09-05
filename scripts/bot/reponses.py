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


def bilan(r, membres, annee, mois, alerte_vide=False):
    lignes = [f"Bilan {nom_mois(annee, mois)} :"]
    for p in membres:
        a_verser = -r["aVerser"].get(p, 0)
        lignes.append(f"  {p} verse {euros(a_verser)}")
    lignes.append("Reste à vivre :")
    for p in membres:
        lignes.append(f"  {p} : {euros(r['reste'].get(p, 0))}")
    lignes.append(f"Total commun : {euros(r['totalCommun'])}")
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


AIDE = """Commandes :
  salaire <montant> [en <mois>]
  salaire <prenom> <montant>
  <libelle charge> <montant> [en <mois>]
  extra <libelle> <montant> [egales]
  <prenom> prend <montant> <motif>
  fait / pas fait
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
