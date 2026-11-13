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


@pytest.fixture(autouse=True)
def claude_image_hors_ligne(monkeypatch):
    """Aucun test ne lance claude pour lire une photo : l'appel échoue d'office (None), un test qui
    veut un texte lu la remplace par un faux."""
    import claude_cli
    monkeypatch.setattr(claude_cli, "lancer_avec_image", lambda *a, **k: None)
