"""Confrontation JS/Python (L-014) de iban_bot.py::formater_iban contre frontend/budget/iban.js.

Formatage volontairement dupliqué (voir docstring de iban_bot.py) : ce test est le garde-fou —
une divergence de règle doit casser ici, jamais se découvrir dans un message Telegram.
"""
import json
import subprocess
from pathlib import Path

import iban_bot

RACINE = Path(__file__).resolve().parent.parent.parent

CAS = [
    "FR7630006000011234567890189",
    "fr76 3000 6000 0112 3456 7890 189",
    "",
    None,
    "invalide",
]


def test_formater_iban_identique_au_frontend():
    module_url = "file:///" + str(RACINE / "frontend" / "budget" / "iban.js").replace("\\", "/")
    script = (
        f"import('{module_url}').then(m => console.log(JSON.stringify("
        f"{json.dumps(CAS)}.map(s => m.formaterIban(s)))))"
    )
    r = subprocess.run(["node", "--input-type=module", "-e", script],
                       capture_output=True, text=True, timeout=30)
    assert r.returncode == 0, r.stderr[:300]
    du_js = json.loads(r.stdout)
    du_py = [iban_bot.formater_iban(s) for s in CAS]
    assert du_py == du_js


def test_formater_iban_groupe_par_4():
    assert iban_bot.formater_iban("FR7630006000011234567890189") == "FR76 3000 6000 0112 3456 7890 189"
