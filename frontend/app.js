import { creerApi } from "./api.js";
import { creerUiMois } from "./ui-mois.js";
import { creerUiCharges } from "./ui-charges.js";
import { creerUiComptes } from "./ui-comptes.js";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const api = creerApi(sb);
const $ = (s) => document.querySelector(s);
const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

const etat = { annee: 0, mois: 0, membres: [], charges: [], comptes: [], lignes: {}, revenus: {}, ajustements: [], virements: {} };

function statut(msg, erreur = false) {
  $("#statut").textContent = msg;
  $("#statut").style.color = erreur ? "var(--rouge)" : "";
  if (erreur) console.error(msg);
}
const echec = (e) => statut(`Erreur : ${e.message ?? e}`, true);

let uiMois, uiCharges, uiComptes;

// ---------- auth ----------
$("#form-login").addEventListener("submit", async (ev) => {
  ev.preventDefault();
  const f = new FormData(ev.target);
  const { error } = await api.auth.connecter(f.get("email"), f.get("password"));
  $("#login-erreur").textContent = error ? error.message : "";
});
$("#logout").addEventListener("click", () => api.auth.deconnecter());
api.auth.surChangement((_ev, session) => {
  $("#login").hidden = !!session;
  $("#app").hidden = !session;
  $("#nav").hidden = !session;
  if (session) demarrer();
});

// ---------- navigation ----------
function moisDepuisHash() {
  const m = location.hash.match(/^#(\d{4})-(\d{1,2})$/);
  const d = new Date();
  return m ? [Number(m[1]), Number(m[2])] : [d.getFullYear(), d.getMonth() + 1];
}
function allerA(annee, mois) {
  if (mois < 1) { mois = 12; annee--; } else if (mois > 12) { mois = 1; annee++; }
  location.hash = `${annee}-${mois}`;
}
$("#prev").addEventListener("click", () => allerA(etat.annee, etat.mois - 1));
$("#next").addEventListener("click", () => allerA(etat.annee, etat.mois + 1));
window.addEventListener("hashchange", chargerMois);

// ---------- panneaux ----------
document.querySelectorAll(".fermer").forEach((btn) =>
  btn.addEventListener("click", () => { $(`#${btn.dataset.cible}`).hidden = true; }));

async function demarrer() {
  try {
    const [membres, charges, comptes] = await Promise.all([api.membres(), api.charges(), api.comptes()]);
    etat.membres = membres;
    etat.charges = charges;
    etat.comptes = comptes;

    const callbacks = { statut, echec, rafraichirMois: chargerMois, surChangement: () => uiMois?.recalculer() };
    uiMois = creerUiMois(api, etat, callbacks);
    uiCharges = creerUiCharges(api, etat, callbacks);
    uiComptes = creerUiComptes(api, etat, callbacks);

    await chargerMois();
  } catch (e) { echec(e); }
}

async function chargerMois() {
  [etat.annee, etat.mois] = moisDepuisHash();
  $("#titre-mois").textContent = `${MOIS[etat.mois - 1]} ${etat.annee}`;
  try {
    const { lignes, revenus, ajustements, virements } = await api.mois(etat.annee, etat.mois);
    etat.lignes = Object.fromEntries(lignes.map((l) => [l.charge_id, l.montant_centimes]));
    etat.revenus = Object.fromEntries(etat.membres.map((m) => [m.prenom, 0]));
    for (const r of revenus) etat.revenus[r.prenom] = r.montant_centimes;
    etat.ajustements = ajustements;
    etat.virements = Object.fromEntries(virements.map((v) => [v.prenom, v]));
    await uiMois.rendreTout();
    statut("");
  } catch (e) { echec(e); }
}
