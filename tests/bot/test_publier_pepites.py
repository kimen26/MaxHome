"""Contrat de l'instantané MaxVoyage (docs/briefs/veille-vols.md) : refusé s'il est hors contrat."""
import pytest

from publier_pepites import verifier_instantane


def instantane(**surcharges):
    offre = {"destination": "FUE", "ville": "Fuerteventura", "depart": "2027-02-12", "retour": "2027-02-22",
             "prix_pp_centimes": 17800, "prix_total_centimes": 53400, "lien": "https://example.org"}
    d = {"version": 1, "genere_le": "2026-10-07T07:21:04+02:00", "releve_le": "2026-10-07",
         "periodes": [{"cle": "2027-02-06", "titre": "Vacances de février 2027", "type": "vacances", "offres": [offre]}],
         "presse": []}
    d.update(surcharges)
    return d


def test_instantane_conforme_accepte():
    assert verifier_instantane(instantane())["releve_le"] == "2026-10-07"


def test_version_inconnue_refusee():
    with pytest.raises(ValueError, match="version"):
        verifier_instantane(instantane(version=2))


def test_releve_manquant_refuse():
    with pytest.raises(ValueError, match="releve_le"):
        verifier_instantane(instantane(releve_le=""))


def test_prix_flottant_refuse():
    d = instantane()
    d["periodes"][0]["offres"][0]["prix_pp_centimes"] = 178.0
    with pytest.raises(ValueError, match="entier"):
        verifier_instantane(d)


def test_offre_sans_lien_refusee():
    d = instantane()
    d["periodes"][0]["offres"][0]["lien"] = None
    with pytest.raises(ValueError, match="lien"):
        verifier_instantane(d)
