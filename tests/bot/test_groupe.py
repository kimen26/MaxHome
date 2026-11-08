"""Tests hors ligne du bot dans le groupe Telegram « Maison » (D-060) : filtrage, enregistrement du groupe.

Telegram et Supabase sont des doublures en mémoire ; jamais le vrai `claude` (un appel réel échoue le test).
"""
import logging
import time
from pathlib import Path
from types import SimpleNamespace

import pytest

import bot as bot_mod
import claude_cli
import conversation
import groupe
import libre
from donnees import Donnees
from mocks import DonneesFausse, TelegramFaux
from telegram import Telegram

YANN, CLAUDIA, INCONNU = 6433455282, 2222222222, 7777777777
BOT_ID, USERNAME = 4242, "BudgetCYM_bot"
GROUPE = -4900000001          # groupe ordinaire (id négatif)
SUPERGROUPE = -1004900000001  # après migration
PRIVE = YANN                  # en privé, l'id du chat est celui de la personne
SCRIPTS_BOT = Path(__file__).resolve().parent.parent.parent / "scripts" / "bot"
ME = {"id": BOT_ID, "username": USERNAME, "can_read_all_group_messages": True}


class DonneesGroupe(DonneesFausse):
    """DonneesFausse (fichier partagé, intact) + la table parametres."""

    def __init__(self, **kw):
        super().__init__(telegram_membres={YANN: "Yann", CLAUDIA: "Claudia"}, **kw)
        self.parametres = {}

    def parametre(self, cle):
        return self.parametres.get(cle)

    def maj_parametre(self, cle, valeur):
        self.parametres[cle] = valeur


class TelegramGroupe(TelegramFaux):
    def __init__(self, updates=(), me=ME):
        super().__init__()
        self._updates, self._me, self.quittes = list(updates), me, []

    def get_updates(self, offset, timeout=50):
        return self._updates.pop(0) if self._updates else []

    def get_me(self):
        return self._me

    def quitter(self, chat_id):
        self.quittes.append(chat_id)


@pytest.fixture(autouse=True)
def sans_vrai_claude(monkeypatch):
    def interdit(*a, **k):
        raise AssertionError("appel réel à claude pendant un test")
    monkeypatch.setattr(claude_cli, "subprocess", SimpleNamespace(
        run=interdit, TimeoutExpired=TimeoutError, DEVNULL=None))


@pytest.fixture
def bot():
    b = bot_mod.Bot.__new__(bot_mod.Bot)
    b.log = logging.getLogger("test-groupe")
    b.donnees = DonneesGroupe()
    b.telegram = TelegramGroupe()
    b.identite = groupe.Identite(BOT_ID, USERNAME, True)
    b.charges, b.membres, b.etats = [], ["Yann", "Claudia"], {}
    return b


@pytest.fixture
def horloge(monkeypatch):
    t = [1_000_000.0]
    monkeypatch.setattr(conversation, "maintenant", lambda: t[0])
    return t


@pytest.fixture
def modele(monkeypatch):
    """Remplace l'interpréteur libre par des réponses programmées ; rend la liste des messages reçus."""
    def installer(*reponses_modele):
        file, vus = list(reponses_modele), []

        def faux(message, prenom, membres, libelles, mois_courant, echanges=(), timeout=60):
            vus.append(message)
            return file.pop(0)
        monkeypatch.setattr(libre, "interpreter", faux)
        return vus
    return installer


class Vus(list):
    def __init__(self):
        super().__init__()
        self.non_adresses = []


def update(texte, de=YANN, chat=GROUPE, type_chat="supergroup", **extra):
    return {"update_id": 1, "message": {"chat": {"id": chat, "type": type_chat},
                                         "from": {"id": de}, "text": texte, **extra}}


def piece(caption=None, de=YANN, **extra):
    """Une photo dans le groupe (pas de clé `text`), légendée ou non."""
    msg = {"chat": {"id": GROUPE, "type": "supergroup"}, "from": {"id": de}, "photo": [{"file_id": "f"}], **extra}
    if caption is not None:
        msg["caption"] = caption
    return {"update_id": 1, "message": msg}


def service(de, chat=GROUPE, type_chat="group", **champs):
    return {"update_id": 1, "message": {"chat": {"id": chat, "type": type_chat}, "from": {"id": de}, **champs}}


def en_reponse_a(auteur):
    return {"reply_to_message": {"message_id": 1, "from": {"id": auteur}, "text": "quelque chose"}}


def espionner(b):
    """Enregistre les textes qui arrivent à traiter_message, sans rien exécuter (`vus.non_adresses` : ceux
    qui ne s'adressaient pas au bot)."""
    vus = Vus()

    def faux(telegram_id, texte, adresse=True):
        vus.append(texte)
        if not adresse:
            vus.non_adresses.append(texte)
        return f"re:{texte}"
    b.traiter_message = faux
    return vus


# ---------- 1. filtrage ----------
@pytest.mark.parametrize("type_chat", ["private", None])
def test_en_prive_rien_ne_change(bot, type_chat):
    chat = {"id": PRIVE} if type_chat is None else {"id": PRIVE, "type": type_chat}
    bot.traiter_update({"update_id": 1, "message": {"chat": chat, "from": {"id": YANN}, "text": "aide"}})
    assert len(bot.telegram.envoyes) == 1 and bot.telegram.envoyes[0][0] == PRIVE
    assert "Commandes" in bot.telegram.envoyes[0][1]


@pytest.mark.parametrize("type_chat", ["group", "supergroup"])
def test_message_de_groupe_sans_mention_est_traite_comme_non_adresse(bot, type_chat):
    vus = espionner(bot)
    bot.traiter_update(update("ajoute du lait", type_chat=type_chat))
    assert vus == ["ajoute du lait"] and vus.non_adresses == ["ajoute du lait"]
    assert bot.telegram.envoyes == [(GROUPE, "re:ajoute du lait")]


# ---------- journal : ce qui arrive est visible, sans texte ni identifiant ----------
def lignes_journal(caplog):
    return [r.getMessage() for r in caplog.records if r.name == "test-groupe"]


def sans_texte_ni_identifiant(caplog):
    """Vie privée : ni le texte du message ni un identifiant Telegram dans le journal."""
    return all(m not in caplog.text for m in ("secret-du-foyer", str(YANN), str(abs(GROUPE))))


def test_message_sans_suite_est_journalise_sans_texte(bot, caplog, modele):
    caplog.set_level(logging.INFO)
    vus = modele({"action": "inconnu"})
    bot.traiter_update(update("on mange quoi ce soir pour secret-du-foyer ?"))
    assert vus, "assez long pour une demande possible : le modèle a été consulté"
    assert lignes_journal(caplog) == ["message reçu (groupe), traitement",
                                      "groupe : message sans suite, pas de réponse"]
    assert bot.telegram.envoyes == [] and sans_texte_ni_identifiant(caplog)


def test_message_modifie_est_journalise_sans_texte(bot, caplog):
    caplog.set_level(logging.INFO)
    modifie = update(f"@{USERNAME} aide secret-du-foyer")["message"]
    bot.traiter_update({"update_id": 1, "edited_message": modifie})
    assert lignes_journal(caplog) == ["message modifié ignoré : renvoyer un nouveau message"]
    assert bot.telegram.envoyes == [] and sans_texte_ni_identifiant(caplog)


@pytest.mark.parametrize("chat, type_chat, mot", [(GROUPE, "supergroup", "groupe"), (PRIVE, "private", "privé")])
def test_message_recu_est_journalise_sans_texte(bot, caplog, chat, type_chat, mot):
    caplog.set_level(logging.INFO)
    vus = espionner(bot)
    bot.traiter_update(update(f"@{USERNAME} aide secret-du-foyer", chat=chat, type_chat=type_chat))
    assert vus and lignes_journal(caplog) == [f"message reçu ({mot}), traitement"]
    assert sans_texte_ni_identifiant(caplog)


@pytest.mark.parametrize("brut, attendu", [
    (f"@{USERNAME} aide", "aide"),
    (f"aide @{USERNAME}", "aide"),
    (f"@{USERNAME.upper()} aide", "aide"),                         # Telegram ne distingue pas les majuscules
    (f"@{USERNAME}, ajoute du lait", "ajoute du lait"),
    (f"salut @{USERNAME} ajoute du lait", "salut ajoute du lait"),
    (f"ligne un\n@{USERNAME} ligne deux", "ligne un\n ligne deux"),   # les sauts de ligne sont conservés
    (f"/aide@{USERNAME}", "/aide"),
    (f"/bilan@{USERNAME.lower()} 10", "/bilan 10"),
])
def test_la_mention_est_retiree_puis_le_message_est_traite(bot, brut, attendu):
    vus = espionner(bot)
    bot.traiter_update(update(brut))
    assert vus == [attendu]
    assert bot.telegram.envoyes == [(GROUPE, f"re:{attendu}")], "la réponse part dans le groupe"


def test_une_mention_seule_donne_l_aide_sans_appeler_le_modele(bot):
    bot.traiter_update(update(f"@{USERNAME}"))
    assert "Commandes" in bot.telegram.envoyes[0][1]


@pytest.mark.parametrize("texte", [
    f"@{USERNAME}_bis aide",   # un autre compte au nom qui commence pareil
    f"@Autre_bot aide",
    f"/aide@Autre_bot",        # commande destinée à un autre bot du groupe
    f"mail à yann@{USERNAME}.fr",   # une adresse e-mail n'est pas une mention
])
def test_une_mention_d_un_autre_n_adresse_pas_le_bot(bot, texte):
    vus = espionner(bot)
    bot.traiter_update(update(texte))
    assert vus.non_adresses == [texte], "traité, mais comme un message non adressé, texte intact"


def test_le_username_vient_de_getme_jamais_du_code(bot):
    bot.identite = groupe.Identite(BOT_ID, "AutreNom_bot", True)
    vus = espionner(bot)
    bot.traiter_update(update(f"@{USERNAME} aide"))   # l'ancien nom ne compte plus
    bot.traiter_update(update("@AutreNom_bot aide"))
    assert vus == [f"@{USERNAME} aide", "aide"] and vus.non_adresses == [f"@{USERNAME} aide"]


def test_repondre_a_un_message_du_bot_suffit_sans_mention(bot):
    vus = espionner(bot)
    bot.traiter_update(update("courses", **en_reponse_a(BOT_ID)))
    assert vus == ["courses"]


def test_repondre_a_quelqu_un_d_autre_n_adresse_pas_le_bot(bot):
    vus = espionner(bot)
    bot.traiter_update(update("courses", **en_reponse_a(CLAUDIA)))
    assert vus.non_adresses == ["courses"]


def test_reponse_a_la_question_en_attente_sans_mention_est_traitee(bot, modele):
    vus = modele({"action": "demander", "texte": "Quelle règle ?"}, {"action": "inconnu"})
    bot.traiter_update(update(f"@{USERNAME} ajoute une ligne vacances 500 €"))
    assert bot.telegram.envoyes == [(GROUPE, "Quelle règle ?")]
    bot.traiter_update(update("50/50"))   # ni mention, ni « répondre à » : c'est la réponse attendue
    assert vus == ["ajoute une ligne vacances 500 €", "50/50"]
    assert len(bot.telegram.envoyes) == 2 and bot.telegram.envoyes[1][0] == GROUPE


def test_la_question_n_attend_que_la_personne_interrogee(bot, modele):
    modele({"action": "demander", "texte": "Quelle règle ?"}, {"action": "inconnu"})
    bot.traiter_update(update(f"@{USERNAME} ajoute une ligne vacances 500 €", de=YANN))
    bot.traiter_update(update("50/50", de=CLAUDIA))   # Claudia parle à Yann : non adressé, incompris, silence
    assert len(bot.telegram.envoyes) == 1
    assert conversation.en_attente(bot.etats[YANN], conversation.QUESTION), "la question de Yann attend toujours"


def test_une_question_posee_en_prive_n_ouvre_pas_le_groupe(bot, modele):
    vus = modele({"action": "demander", "texte": "Quelle règle ?"})
    bot.traiter_update(update("ajoute une ligne vacances 500 €", chat=PRIVE, type_chat="private"))
    assert bot.telegram.envoyes == [(PRIVE, "Quelle règle ?")]
    bot.traiter_update(update("50/50"))   # même personne, mais dans le groupe : ce n'est pas la réponse
    assert len(vus) == 1 and len(bot.telegram.envoyes) == 1
    assert conversation.en_attente(bot.etats[YANN], conversation.QUESTION), "la question privée attend toujours"


def test_une_question_perimee_n_ouvre_plus_le_groupe(bot, modele, horloge):
    vus = modele({"action": "demander", "texte": "Quelle règle ?"})
    bot.traiter_update(update(f"@{USERNAME} ajoute une ligne vacances 500 €"))
    horloge[0] += 16 * 60
    bot.traiter_update(update("50/50"))   # non adressé, la grammaire n'y comprend rien : silence
    assert len(vus) == 1 and len(bot.telegram.envoyes) == 1


def test_une_proposition_n_attend_qu_un_oui_ou_un_non(bot):
    """Une confirmation en attente : « oui » passe sans mention, la conversation entre eux non."""
    vus = espionner(bot)
    bot.traiter_update(update(f"@{USERNAME} aide"))   # note le groupe pour Yann
    conversation.poser(bot.etats[YANN], conversation.CONFIRMATION, {"action": {"action": "bilan"}})
    bot.traiter_update(update("tu rentres à quelle heure ?"))
    assert vus.non_adresses == ["tu rentres à quelle heure ?"], "du bavardage reste non adressé"
    assert conversation.en_attente(bot.etats[YANN], conversation.CONFIRMATION), "la proposition attend toujours"
    bot.traiter_update(update("Oui."))
    assert vus == ["aide", "tu rentres à quelle heure ?", "Oui."]
    assert vus.non_adresses == ["tu rentres à quelle heure ?"], "« Oui. » répond à la proposition : adressé"


def test_attente_en_cours_copie_du_mois_vide_et_voyage():
    texte_oui = "oui"
    copie = {"attente": {"expire": time.time() + 60}}
    assert groupe.attente_en_cours(copie, texte_oui) is True
    assert groupe.attente_en_cours(copie, "pas maintenant") is False
    assert groupe.attente_en_cours({"attente": {"expire": time.time() - 1}}, texte_oui) is False
    # attente_voyage n'expire jamais : rien ne prouve qu'elle soit valide, la mention est exigée.
    assert groupe.attente_en_cours({"attente_voyage": {"type": "topo"}}, texte_oui) is False
    assert groupe.attente_en_cours({}, texte_oui) is False


def test_une_piece_jointe_suit_la_meme_regle(bot):
    vus = []
    bot.traiter_piece = lambda telegram_id, msg: vus.append(msg.get("caption")) or "rangée"
    bot.traiter_update(piece())                                  # ni légende ni mention : ignorée
    bot.traiter_update(piece(caption="Malaga"))                  # légendée mais non adressée : ignorée aussi
    bot.traiter_update(piece(caption=f"@{USERNAME} Malaga"))     # mention dans la légende, retirée
    bot.traiter_update(piece(**en_reponse_a(BOT_ID)))            # réponse à « pour quel voyage ? »
    assert vus == ["Malaga", None]


def test_identite_inconnue_le_groupe_reste_muet_mais_le_prive_marche(bot):
    bot.identite = None
    vus = espionner(bot)
    bot.traiter_update(update(f"@{USERNAME} aide"))
    bot.traiter_update(update("aide", chat=PRIVE, type_chat="private"))
    assert vus == ["aide"] and bot.telegram.envoyes == [(PRIVE, "re:aide")]


def test_un_inconnu_qui_mentionne_le_bot_recoit_son_identifiant(bot):
    bot.traiter_update(update(f"@{USERNAME} salut", de=INCONNU))
    assert str(INCONNU) in bot.telegram.envoyes[0][1]


# ---------- 1 bis. groupe : tout message d'un membre est traité, le bot se tait s'il n'a rien d'utile ----------
def message(bot, texte, **kw):
    bot.traiter_update(update(texte, **kw))
    return bot.telegram.envoyes


def test_non_adresse_avec_une_action_est_traite_et_repondu(bot):
    bot.donnees.courses = []
    envoyes = message(bot, "bilan")
    assert len(envoyes) == 1 and envoyes[0][0] == GROUPE


def test_non_adresse_avec_une_ecriture_demande_un_oui_et_n_ecrit_pas(bot):
    ecrit = []
    bot.donnees.ajouter_course = lambda *a, **k: ecrit.append(a)
    envoyes = message(bot, "ajoute du lait")
    assert envoyes[0][1].endswith("OK ?") and ecrit == [], "D-060 : rien n'est écrit avant le oui"
    assert conversation.en_attente(bot.etats[YANN], conversation.CONFIRMATION)


def test_non_adresse_incompris_le_bot_se_tait(bot, modele, caplog):
    caplog.set_level(logging.INFO)
    vus = modele({"action": "inconnu"})
    assert message(bot, "alors on se retrouve vers dix-neuf heures chez eux") == []
    assert len(vus) == 1, "assez long : le modèle a eu sa chance"
    assert "groupe : message sans suite, pas de réponse" in lignes_journal(caplog)


def test_adresse_incompris_garde_la_reponse_actuelle(bot, modele):
    modele({"action": "inconnu"})
    assert message(bot, f"@{USERNAME} alors on se retrouve vers dix-neuf heures chez eux") == [
        (GROUPE, "Je n'ai pas compris. Tape `aide`.")]


def test_non_adresse_que_le_modele_comprend_est_traite(bot, modele):
    modele({"action": "taches"})
    envoyes = message(bot, "qu'est-ce qu'il reste à faire à la maison ce soir")
    assert len(envoyes) == 1 and envoyes[0][1] != "Je n'ai pas compris. Tape `aide`."


@pytest.mark.parametrize("texte", ["ok", "OK !", "mdr", "👍", "😂😂", "merci", "d'accord", "oui", "non", "super merci"])
def test_non_adresse_court_sans_verbe_ne_coute_aucun_appel_au_modele(bot, texte):
    """Le fixture `sans_vrai_claude` fait échouer tout appel au modèle : le silence est obtenu avant."""
    assert message(bot, texte) == []


@pytest.mark.parametrize("texte, attendu", [
    ("ok", True), ("mdr", True), ("👍", True), ("???", True), ("merci beaucoup", True), ("à ce soir", True),
    ("j'ai payé la crèche", False),      # radical d'action
    ("lait 2", False),                    # un chiffre
    ("on mange quoi ce soir", False),     # plus de 3 mots : le modèle lit
    ("combien on doit", False),           # mot de demande
])
def test_sans_suite_evident(texte, attendu):
    assert groupe.sans_suite_evident(texte) is attendu


def test_non_adresse_de_la_grammaire_sans_sens_est_silencieux(bot):
    for texte in ("50/50", "Claudia prend les enfants", "moi je veux des pâtes"):
        assert message(bot, texte) == [], texte


def test_non_adresse_d_un_inconnu_est_ignore_sans_rien_reveler(bot, caplog):
    caplog.set_level(logging.INFO)
    assert message(bot, "bilan", de=INCONNU) == []
    assert str(INCONNU) not in caplog.text


def test_adresse_d_un_inconnu_garde_le_refus(bot):
    envoyes = message(bot, f"@{USERNAME} bilan", de=INCONNU)
    assert str(INCONNU) in envoyes[0][1]


def test_une_proposition_d_un_autre_chat_n_est_pas_acceptee_par_un_oui_non_adresse(bot):
    """Une confirmation posée en privé ne doit pas s'exécuter sur un « oui » lancé dans le groupe."""
    ecrit = []
    bot.donnees.ajouter_course = lambda *a, **k: ecrit.append(a)
    action = {"action": "course_ajout", "libelle": "lait"}
    conversation.poser(bot.etats.setdefault(YANN, {}), conversation.CONFIRMATION, {"action": action})
    groupe.noter_chat(bot.etats, YANN, PRIVE)   # la proposition a été faite en privé
    assert message(bot, "oui") == []
    assert conversation.en_attente(bot.etats[YANN], conversation.CONFIRMATION), "toujours en attente"
    assert ecrit == []


# ---------- 2. enregistrement du groupe ----------
@pytest.mark.parametrize("champs", [
    {"group_chat_created": True},
    {"new_chat_members": [{"id": CLAUDIA}, {"id": BOT_ID, "is_bot": True}]},
])
def test_ajout_par_un_inscrit_enregistre_le_groupe_et_explique(bot, champs):
    bot.traiter_update(service(YANN, **champs))
    assert bot.donnees.parametres == {"telegram_groupe": str(GROUPE)}
    assert bot.telegram.quittes == []
    (chat, texte), = bot.telegram.envoyes
    assert chat == GROUPE
    assert f"@{USERNAME}" in texte and "rappels" in texte and "répondez" in texte and "je me tais" in texte


def test_quelqu_un_d_autre_qui_rejoint_ne_declenche_rien(bot):
    bot.traiter_update(service(YANN, new_chat_members=[{"id": CLAUDIA}]))
    assert bot.donnees.parametres == {} and bot.telegram.envoyes == [] and bot.telegram.quittes == []


@pytest.mark.parametrize("champs", [{"new_chat_members": [{"id": BOT_ID}]}, {"group_chat_created": True}])
def test_ajout_par_un_inconnu_le_bot_quitte_sans_rien_ecrire(bot, champs):
    bot.traiter_update(service(INCONNU, **champs))
    assert bot.telegram.quittes == [GROUPE]
    assert bot.telegram.envoyes == [] and bot.donnees.parametres == {}


def test_migration_en_supergroupe_met_a_jour_l_id_enregistre(bot):
    bot.donnees.parametres["telegram_groupe"] = str(GROUPE)
    bot.traiter_update(service(YANN, migrate_to_chat_id=SUPERGROUPE))
    assert bot.donnees.parametres == {"telegram_groupe": str(SUPERGROUPE)}
    assert bot.telegram.envoyes == [] and bot.telegram.quittes == []


def test_migration_d_un_autre_groupe_ne_touche_pas_au_groupe_des_rappels(bot):
    bot.donnees.parametres["telegram_groupe"] = str(GROUPE)
    bot.traiter_update(service(YANN, chat=-777, migrate_to_chat_id=-1000777))
    assert bot.donnees.parametres == {"telegram_groupe": str(GROUPE)}


def test_un_echec_d_enregistrement_est_journalise_et_ne_tue_pas_la_boucle(bot, caplog):
    def casse(cle, valeur):
        raise RuntimeError("supabase en panne")
    bot.donnees.maj_parametre = casse
    bot.traiter_update(service(YANN, group_chat_created=True))   # ne lève rien
    assert "non traité" in caplog.text and bot.telegram.envoyes == [], "pas d'accueil si rien n'est enregistré"


# ---------- 3. démarrage : getMe ----------
def test_identite_lue_dans_getme():
    assert groupe.identite(ME) == groupe.Identite(BOT_ID, USERNAME, True)
    assert groupe.identite({"id": 1, "username": "x"}).lit_tout is False
    for mauvaise in ({}, {"id": 1}, {"username": "x"}, {"id": "1", "username": "x"}):
        with pytest.raises(RuntimeError, match="getMe"):
            groupe.identite(mauvaise)


@pytest.fixture
def demarrage(monkeypatch):
    def preparer(me):
        monkeypatch.setattr(bot_mod, "lit_env", lambda: {
            "SUPABASE_REF": "ref", "SUPABASE_PAT": "pat", "MAXHOME_TELEGRAM_BOT_TOKEN": "tok"})
        monkeypatch.setattr(bot_mod, "cles", lambda ref, pat: (None, "service"))
        monkeypatch.setattr(bot_mod, "Donnees", lambda ref, cle: DonneesGroupe())
        monkeypatch.setattr(bot_mod, "Telegram", lambda token: TelegramGroupe(me=me))
    return preparer


@pytest.mark.parametrize("lit_tout, avertissements", [
    (False, ["mode confidentialité actif : en groupe je ne vois que les mentions et réponses"]),
    (True, []),
])
def test_demarrage_avertit_seulement_si_le_mode_confidentialite_est_actif(demarrage, caplog, lit_tout, avertissements):
    demarrage({**ME, "can_read_all_group_messages": lit_tout})
    b = bot_mod.Bot(logging.getLogger("test-demarrage"))
    assert b.identite == groupe.Identite(BOT_ID, USERNAME, lit_tout)
    assert [r.getMessage() for r in caplog.records if r.levelno == logging.WARNING] == avertissements


# ---------- la boucle entière ----------
def test_boucle_groupe_de_bout_en_bout(bot):
    bot.telegram = TelegramGroupe(updates=[[
        service(YANN, group_chat_created=True) | {"update_id": 1},
        update("ok") | {"update_id": 2},   # non adressé, sans suite : rien ne part
        update(f"@{USERNAME} aide") | {"update_id": 3},
        update("aide", chat=PRIVE, type_chat="private") | {"update_id": 4},
    ]])
    bot.boucle(max_iterations=1)
    assert [chat for chat, _ in bot.telegram.envoyes] == [GROUPE, GROUPE, PRIVE]
    assert "rappels" in bot.telegram.envoyes[0][1] and "Commandes" in bot.telegram.envoyes[1][1]


# ---------- ports : Telegram et Supabase ----------
def test_telegram_getme_et_leavechat_appellent_la_bonne_methode(monkeypatch):
    appels = []

    def faux_appel(self, methode, corps=None, timeout=60):
        appels.append((methode, corps))
        return {"ok": True, "result": ME if methode == "getMe" else True}
    monkeypatch.setattr(Telegram, "_appel", faux_appel)
    t = Telegram("jeton")
    assert t.get_me() == ME
    t.quitter(GROUPE)
    assert appels == [("getMe", {}), ("leaveChat", {"chat_id": GROUPE})]


def test_donnees_parametres_lisent_et_ecrivent_la_bonne_table(monkeypatch):
    appels = []

    def faux_appel(self, methode, chemin, corps=None, entetes_extra=None):
        appels.append((methode, chemin, corps, entetes_extra))
        return [{"valeur": "-4900000001"}] if methode == "GET" else None
    monkeypatch.setattr(Donnees, "_appel", faux_appel)
    d = Donnees("ref", "service")
    assert d.parametre("telegram_groupe") == "-4900000001"
    d.maj_parametre("telegram_groupe", "-1004900000001")
    assert appels == [
        ("GET", "parametres?cle=eq.telegram_groupe&select=valeur", None, None),
        ("POST", "parametres", {"cle": "telegram_groupe", "valeur": "-1004900000001"},
         {"Prefer": "resolution=merge-duplicates"})]


def test_les_fichiers_restent_courts():
    for nom in ("bot", "groupe", "telegram", "donnees"):
        assert len((SCRIPTS_BOT / f"{nom}.py").read_text(encoding="utf-8").splitlines()) < 400, nom
