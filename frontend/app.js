import { creerApi } from "./api.js";
import { calculer } from "./calc.js";
import { creerUiMouvements } from "./ui-mouvements.js";
import { creerUiCharges } from "./ui-charges.js";
import { creerUiRecurrents } from "./ui-recurrents.js";
import { creerUiComptes } from "./ui-comptes.js";
import { creerUiStats } from "./ui-stats.js";
import { $, txt, MOIS_COURT, decaler, montrerEcran, ecranCourant,
  brancherNavigation, toast, bandeauErreur, cacherBandeau } from "./ui-base.js";

const sb = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const api = creerApi(sb);

const etat = {
  annee: 0, mois: 0, prenom: null,
  membres: [], charges: [], comptes: [], recurrents: [],
  lignes: {}, revenus: {}, ajustements: [], mouvements: [],
  moisPrecedent: {}, derniers: {}, resultat: null,
};

const echec = (e) => {
  console.error(e);
  bandeauErreur(`Erreur : ${e.message ?? e}`, chargerMois);
  toast(`Erreur : ${e.message ?? e}`, true);
};
const cb = { echec, recalculer, rafraichirMois: chargerMois };

let ui = {};

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
  if (session) demarrer();
});

// ---------- navigation ----------
function moisDepuisHash() {
  const m = location.hash.match(/^#(\d{4})-(\d{1,2})$/);
  const d = new Date();
  return m ? [Number(m[1]), Number(m[2])] : [d.getFullYear(), d.getMonth() + 1];
}
window.addEventListener("hashchange", chargerMois);

function rendrePuces() {
  const html = [-2, -1, 0, 1, 2].map((n) => {
    const [a, m] = decaler(etat.annee, etat.mois, n);
    return `<button data-mois="${a}-${m}" class="${n === 0 ? "actif" : ""}">${MOIS_COURT[m - 1]}</button>`;
  }).join("");
  for (const cible of ["#puces-mobile", "#puces-pc"]) {
    $(cible).innerHTML = html;
    for (const b of $(cible).querySelectorAll("button")) {
      b.addEventListener("click", () => { location.hash = b.dataset.mois; });
    }
  }
}

// ---------- calcul ----------
function recalculer() {
  const revenus = Object.fromEntries(etat.membres.map((m) => [m.prenom, etat.revenus[m.prenom] ?? 0]));
  etat.resultat = calculer(etat.charges, etat.lignes, revenus, etat.ajustements);
}

// ---------- démarrage ----------
async function demarrer() {
  try {
    const [membres, charges, comptes, recurrents] = await Promise.all([
      api.membres(), api.charges(), api.comptes(), api.recurrents(),
    ]);
    Object.assign(etat, { membres, charges, comptes, recurrents });
    etat.prenom = await api.auth.prenomCourant(membres);

    ui = {
      mouvements: creerUiMouvements(api, etat, cb),
      charges: creerUiCharges(api, etat, cb),
      recurrents: creerUiRecurrents(api, etat, cb),
      comptes: creerUiComptes(api, etat, cb),
      stats: creerUiStats(api, etat, cb),
    };
    brancherNavigation(rendreEcran);
    // L'écran est affiché sans être rendu : chargerMois() peuple l'état puis déclenche le rendu.
    montrerEcran("mois", { rendre: false });
    await chargerMois();
  } catch (e) { echec(e); }
}

function rendreEcran(nom) {
  if (nom === "mois") ui.mouvements.rendre();
  else if (nom === "charges") { ui.charges.rendre(); rendreAjustements(); }
  else if (nom === "stats") ui.stats.rendre();
  else if (nom === "recurrents") ui.recurrents.rendre();
  else if (nom === "comptes") ui.comptes.rendre();
  else if (nom === "annuel") ui.stats.rendreAnnuel();
}

async function chargerMois() {
  [etat.annee, etat.mois] = moisDepuisHash();
  rendrePuces();
  ui.mouvements?.fermerDetail();
  ui.charges?.fermerReglages();
  try {
    const [aPrec, mPrec] = decaler(etat.annee, etat.mois, -1);
    const [courant, precedent, derniers] = await Promise.all([
      api.mois(etat.annee, etat.mois),
      api.mois(aPrec, mPrec),
      api.derniersMontants(),
    ]);
    etat.lignes = Object.fromEntries(courant.lignes.map((l) =>
      [l.charge_id, { montant_centimes: l.montant_centimes, regle: l.regle }]));
    etat.revenus = Object.fromEntries(etat.membres.map((m) => [m.prenom, 0]));
    for (const r of courant.revenus) etat.revenus[r.prenom] = r.montant_centimes;
    etat.ajustements = courant.ajustements;
    etat.mouvements = courant.mouvements;
    etat.moisPrecedent = Object.fromEntries(precedent.lignes.map((l) => [l.charge_id, l.montant_centimes]));
    etat.derniers = derniers;

    recalculer();
    await ui.mouvements.genererOccurrences();
    cacherBandeau();
    rendreEcran(ecranCourant());
  } catch (e) { echec(e); }
}

// ---------- ajustements (écran Charges) ----------
$("#btn-ajouter-ajustement").addEventListener("click", async () => {
  const [a, b] = etat.membres.map((m) => m.prenom);
  const montant = prompt(`Ajustement : montant en euros que ${a} verse en plus (négatif pour l'inverse)`);
  if (montant === null) return;
  try {
    const { versCentimes } = await import("./calc.js");
    const cents = versCentimes(montant);
    const cree = await api.creerAjustement({
      annee: etat.annee, mois: etat.mois,
      de: cents >= 0 ? a : b, vers: cents >= 0 ? b : a,
      montant_centimes: Math.abs(cents), motif: prompt("Motif ?") || null,
    });
    etat.ajustements.push(cree);
    recalculer();
    rendreEcran("charges");
    rendreAjustements();
    toast("Ajustement ajouté.");
  } catch (e) { echec(e); }
});

function rendreAjustements() {
  $("#ajustements").innerHTML = etat.ajustements.length
    ? `<div class="carte-liste">${etat.ajustements.map((a) => `<div class="rec">
        <div class="rec-corps"><span class="rec-titre">${txt(a.de)} → ${txt(a.vers)}</span>
          ${a.motif ? `<span class="rec-trajet">${txt(a.motif)}</span>` : ""}</div>
        <div class="rec-droite"><span class="mono">${(a.montant_centimes / 100).toFixed(2).replace(".", ",")} €</span></div>
        <div class="rec-actions"><button class="btn-lien" data-suppr-ajust="${a.id}">Retirer</button></div>
      </div>`).join("")}</div>`
    : '<p class="vide">Aucun ajustement ce mois.</p>';
  for (const b of document.querySelectorAll("[data-suppr-ajust]")) {
    b.addEventListener("click", async () => {
      try {
        await api.supprimerAjustement(Number(b.dataset.supprAjust));
        etat.ajustements = etat.ajustements.filter((x) => x.id !== Number(b.dataset.supprAjust));
        recalculer();
        rendreEcran("charges");
        rendreAjustements();
        toast("Ajustement retiré.");
      } catch (e) { echec(e); }
    });
  }
}
