// Écran « Proposer une date » : la liste des sondages en cours (réponses par jour, copier le lien,
// montrer/cacher les réponses aux invités, Terminer) et le bouton qui ouvre le formulaire.
// Le cycle de création vient de blocs-reglages, la bascule de blocs-optimiste (D-024) : rien
// de réécrit ici. Le formulaire vit dans ui-proches-form.js.

import { $, txt, toast, confirmer } from "../socle/ui-base.js";
import { creerFileEcritures } from "../socle/blocs.js";
import { creerReglages } from "../socle/blocs-reglages.js";
import { ecrireOptimiste } from "../socle/blocs-optimiste.js";
import { formatPeriode } from "../agenda/calendrier.js";
import { creerFormulaireSondage } from "./ui-proches-form.js";
import { classerReponses, lienSondage } from "./suivi.js";

const pluriel = (n) => (n === 0 ? "Aucune réponse" : `${n} réponse${n > 1 ? "s" : ""}`);

function htmlReponses(votes) {
  const jours = classerReponses(votes);
  if (!jours.length) return `<p class="pr-vide">Personne n'a encore répondu.</p>`;
  return `<ul class="pr-reponses">${jours.map(({ jour, n, prenoms }) =>
    `<li><span class="pr-rep-jour">${txt(formatPeriode(jour, jour))}</span> — ${txt(prenoms.join(", "))} <b>(${n})</b></li>`).join("")}</ul>`;
}

function htmlCarte(s) {
  const visible = s.reponses_visibles;
  return `<div class="carte pr-sondage" data-sondage="${s.id}">
    <div class="pr-haut"><h3 class="pr-titre">${txt(s.titre)}</h3><span class="pastille">${txt(pluriel(s.votes.length))}</span></div>
    <p class="pr-sous">${visible ? "Les invités voient les réponses des autres." : "Les invités ne voient que leur propre réponse."}</p>
    ${htmlReponses(s.votes)}
    <div class="pr-actions">
      <button type="button" class="btn btn-bleu" data-copier="${s.id}">Copier le lien</button>
      ${navigator.share ? `<button type="button" class="btn" data-partager="${s.id}">Partager</button>` : ""}
      <button type="button" class="btn" data-visibilite="${s.id}">${visible ? "Cacher les réponses aux invités" : "Montrer les réponses aux invités"}</button>
      <button type="button" class="btn btn-rouge" data-terminer="${s.id}">Terminer</button>
    </div></div>`;
}

export function creerUiProches(api, etat, cb) {
  const formulaire = creerFormulaireSondage(etat);
  const enFile = creerFileEcritures();
  const lien = (s) => lienSondage(s.jeton, document.baseURI);
  const parId = (id) => etat.sondages.find((s) => s.id === Number(id));

  const reglages = creerReglages({
    liste: "#liste-sondages", bouton: "#form-sondage",
    libelleNouveau: "+ Proposer une date",
    elements: () => etat.sondages,
    htmlListe: (liste) => (liste.length ? `<div class="pr-liste">${liste.map(htmlCarte).join("")}</div>` : `<p class="vide">Aucun sondage en cours.</p>`),
    titreForm: () => "Proposer une date",
    htmlForm: formulaire.html, apresOuverture: formulaire.apresOuverture, champs: formulaire.champs,
    // Un sondage ne se modifie pas, il se refait : le bloc ne sert qu'à créer (Terminer est plus bas).
    api: { creer: async (valeurs) => { etat.sondages = [{ ...(await api.creerSondage(valeurs)), votes: [] }, ...etat.sondages]; } },
    echec: cb.echec,
  });

  async function copierLien(s) {
    try { await navigator.clipboard.writeText(lien(s)); toast("Lien copié"); } catch (e) { cb.echec(e); }
  }

  async function partager(s) {
    try { await navigator.share({ title: s.titre, url: lien(s) }); }
    catch (e) { if (e.name !== "AbortError") cb.echec(e); } // « annuler » dans la feuille n'est pas une erreur
  }

  function basculerVisibilite(s) {
    const visibles = !s.reponses_visibles;
    return ecrireOptimiste({
      el: s, champs: { reponses_visibles: visibles }, rendre: reglages.rendre, file: enFile, echec: cb.echec,
      ecrire: (id, champs) => api.majSondage(id, champs),
      message: visibles ? "Les invités voient les réponses." : "Les réponses sont cachées aux invités.",
    });
  }

  async function terminer(s) {
    if (!(await confirmer(`Terminer « ${s.titre} » ? Le lien ne marchera plus et les réponses seront supprimées.`, { ok: "Terminer" }))) return;
    try {
      await api.supprimerSondage(s.id);
      etat.sondages = etat.sondages.filter((x) => x.id !== s.id);
      reglages.rendre();
      toast("Sondage terminé.");
    } catch (e) { cb.echec(e); }
  }

  const ACTIONS = { copier: copierLien, partager, visibilite: basculerVisibilite, terminer };
  let branche = false;
  /** Délégation sur le conteneur : il survit aux rendus du bloc, qui remplacent son contenu. */
  function brancher() {
    if (branche) return;
    branche = true;
    $("#liste-sondages").addEventListener("click", (e) => {
      for (const [nom, agir] of Object.entries(ACTIONS)) {
        const b = e.target.closest(`[data-${nom}]`);
        const s = b && parId(b.dataset[nom]);
        if (s) return agir(s);
      }
    });
  }

  return { rendre() { reglages.rendre(); brancher(); } };
}
