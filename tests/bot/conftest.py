import sys
from pathlib import Path

RACINE = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(RACINE / "scripts"))
sys.path.insert(0, str(RACINE / "scripts" / "bot"))

import pytest  # noqa: E402


@pytest.fixture(autouse=True)
def espace_parent_hors_reseau(monkeypatch):
    """Aucun test ne se connecte à l'espace parent de l'école (les variables existent sur ce poste) :
    l'ouverture de session échoue d'office, un test qui en a besoin la remplace par un faux."""
    import ecole_espace
    from outils import espace_parent

    def interdit():
        raise espace_parent.EspaceParentNonConfigure("connexion interdite en test")
    monkeypatch.setattr(ecole_espace, "ouvrir", interdit)
