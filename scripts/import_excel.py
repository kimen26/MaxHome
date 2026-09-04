"""Importe les feuilles 'Comptes AAAA' (format DEPENSE/TYPE/mois) en SQL.

Usage : python scripts/import_excel.py "inbox/Comptes 2026.xlsx" > data/import.sql
Le SQL produit contient des salaires : data/ est ignoré par git. À coller dans SQL Editor.
"""
import re
import sys

import openpyxl

MOIS = ["JANVIER", "FEVRIER", "MARS", "AVRIL", "MAI", "JUIN",
        "JUILLET", "AOUT", "SEPTEMBRE", "OCTOBRE", "NOVEMBRE", "DECEMBRE"]
TYPES = {"égales": "egales", "egales": "egales", "proport": "proport"}
MEMBRES = ("Yann", "Claudia")


def centimes(v):
    if v is None or v == "/" or (isinstance(v, str) and v.startswith("#")):
        return None
    return round(float(v) * 100)


def q(s):
    return "'" + str(s).replace("'", "''") + "'"


def lire_feuille(ws, annee):
    rows = [list(r) for r in ws.iter_rows(values_only=True)]
    colonnes = {i: MOIS.index(str(h).strip().upper()) + 1
                for i, h in enumerate(rows[0]) if h and str(h).strip().upper() in MOIS}
    charges, lignes, revenus = {}, [], []
    section = "charges"
    for r in rows[1:]:
        lib, typ = r[0], r[1]
        if typ == "REVENUE":
            section = "revenus"
            continue
        if typ in ("RATIO", "COMPTES"):
            break
        if section == "charges" and lib and typ in TYPES:
            lib = lib.strip()
            charges[lib] = TYPES[typ]
            lignes += [(annee, m, lib, centimes(r[i])) for i, m in colonnes.items() if centimes(r[i])]
        elif section == "revenus" and typ in MEMBRES:
            revenus += [(annee, m, typ, centimes(r[i])) for i, m in colonnes.items() if centimes(r[i])]
    return charges, lignes, revenus


def main(chemin):
    sys.stdout.reconfigure(encoding="utf-8")
    wb = openpyxl.load_workbook(chemin, data_only=True)
    charges, lignes, revenus = {}, [], []
    for ws in wb.worksheets:
        m = re.fullmatch(r"Comptes (\d{4})", ws.title)
        if not m:
            print(f"-- feuille ignorée : {ws.title}", file=sys.stderr)
            continue
        c, l, r = lire_feuille(ws, int(m.group(1)))
        charges.update(c)
        lignes += l
        revenus += r
    out = ["begin;"]
    for i, (lib, typ) in enumerate(charges.items()):
        out.append(f"insert into charges (libelle, type, ordre) select {q(lib)}, {q(typ)}, {i} "
                   f"where not exists (select 1 from charges where libelle = {q(lib)});")
    for a, m, p, c in revenus:
        out.append(f"insert into revenus (annee, mois, prenom, montant_centimes) values ({a},{m},{q(p)},{c}) "
                   f"on conflict (annee,mois,prenom) do update set montant_centimes = excluded.montant_centimes;")
    for a, m, lib, c in lignes:
        out.append(f"insert into lignes (annee, mois, charge_id, montant_centimes) select {a},{m},id,{c} from charges "
                   f"where libelle = {q(lib)} on conflict (annee,mois,charge_id) do update set montant_centimes = excluded.montant_centimes;")
    out.append("commit;")
    print("\n".join(out))
    print(f"-- {len(charges)} charges, {len(lignes)} lignes, {len(revenus)} revenus", file=sys.stderr)


if __name__ == "__main__":
    if len(sys.argv) != 2:
        sys.exit(__doc__)
    main(sys.argv[1])
