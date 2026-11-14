// Feuille d'un proche (« Garder le lien »), ouverte par le bloc blocs-reglages : prénom, qui
// relance, rythme, anniversaire, note, puis — pour un proche déjà connu — ses échanges (récent
// en tête, supprimables) et « + Noter un échange ». Les échanges s'écrivent tout de suite, sans
// fermer la feuille : seul le reste (prénom, rythme…) attend « Enregistrer ».

import { txt, toast } from "../socle/ui-base.js";
import { champ, zone, select, lire } from "../socle/blocs-form.js";
import { choixDetaille, marquerChoix } from "../socle/blocs.js";
import { formatPeriode, jourIso } from "../agenda/calendrier.js";
import { champsEchange, champsProche, echangesDe, MOIS_OPTIONS, NOTE_MAX, PRENOM_MAX, QUI, RYTHMES_OPTIONS, TEXTE_MAX } from "./lien.js";

const ligneEchange = (e) => `<li class="pr-echange">
  <div class="pr-echange-corps"><span class="pr-echange-date">${txt(formatPeriode(e.le, e.le))}</span><span class="pr-echange-texte">${txt(e.texte)}</span></div>
  <button type="button" class="btn-lien" data-echange-suppr="${e.id}" aria-label="Supprimer l'échange du ${txt(formatPeriode(e.le, e.le))}">Supprimer</button></li>`;

export function creerFeuilleProche(api, etat, cb, { rendreListe }) {
  const aujourdhui = () => jourIso(new Date());

  const htmlEchanges = (p) => `
    <h3 class="titre-section">Nos échanges</h3>
    <ul class="pr-echanges" data-echanges></ul>
    <button type="button" class="btn btn-tirets pr-noter" data-echange-ouvrir>+ Noter un échange</button>
    <div class="pr-echange-form" data-echange-form hidden>
      ${zone("ech_texte", "Ce qu'on s'est dit (une phrase)", "", { lignes: 2, attrs: `maxlength="${TEXTE_MAX}"` })}
      ${champ("ech_le", "Quand", { type: "date", valeur: aujourdhui() })}
      <div class="pr-echange-actions">
        <button type="button" class="btn" data-echange-annuler>Annuler</button>
        <button type="button" class="btn btn-bleu" data-echange-noter="${p.id}">Noter</button>
      </div></div>`;

  const html = (p) => `
    ${champ("prenom", "Prénom", { valeur: p?.prenom ?? "", requis: true, attrs: `maxlength="${PRENOM_MAX}" autocomplete="off"` })}
    <input type="hidden" name="qui" value="${txt(p?.qui ?? "nous")}">
    ${choixDetaille(QUI.map(([valeur, titre]) => ({ valeur, titre })), p?.qui ?? "nous", { attr: "qui", etiquette: "Qui relance ?" })}
    ${select("rythme_jours", "Je veux des nouvelles…", RYTHMES_OPTIONS, p?.rythme_jours ?? "")}
    <fieldset class="pr-anniv-champs"><legend>Anniversaire (facultatif)</legend>
      <div class="pr-trois">
        ${champ("anniv_jour", "Jour", { type: "number", valeur: p?.anniv_jour ?? "", attrs: 'min="1" max="31" inputmode="numeric"' })}
        ${select("anniv_mois", "Mois", MOIS_OPTIONS, p?.anniv_mois ?? "", { vide: "—" })}
        ${champ("anniv_annee", "Année", { type: "number", valeur: p?.anniv_annee ?? "", attrs: 'min="1900" inputmode="numeric" placeholder="facultatif"' })}
      </div></fieldset>
    ${zone("note", "Note (contexte durable)", p?.note ?? "", { lignes: 2, attrs: `maxlength="${NOTE_MAX}"`, placeholder: "2 enfants, fan de foot" })}
    ${p ? htmlEchanges(p) : ""}`;

  function dessinerEchanges(form, p) {
    const liste = echangesDe(etat.echanges, p.id);
    form.querySelector("[data-echanges]").innerHTML = liste.length ? liste.map(ligneEchange).join("")
      : `<li class="pr-vide">Aucun échange noté pour l'instant.</li>`;
  }

  function brancherEchanges(form, p) {
    const bloc = form.querySelector("[data-echange-form]");
    const ouvrir = form.querySelector("[data-echange-ouvrir]");
    const basculer = (ouvert) => { bloc.hidden = !ouvert; ouvrir.hidden = ouvert; if (ouvert) form.elements.ech_texte.focus(); };
    dessinerEchanges(form, p);
    ouvrir.addEventListener("click", () => basculer(true));
    form.querySelector("[data-echange-annuler]").addEventListener("click", () => basculer(false));
    form.querySelector("[data-echange-noter]").addEventListener("click", async () => {
      let champs;
      try { champs = champsEchange({ texte: form.elements.ech_texte.value, le: form.elements.ech_le.value }, p.id, etat.prenom, aujourdhui()); }
      catch (e) { return cb.echec(e); }
      try {
        const cree = await api.creerEchange(champs);
        etat.echanges = [...etat.echanges, cree];
        form.elements.ech_texte.value = "";
        form.elements.ech_le.value = aujourdhui();
        basculer(false);
        dessinerEchanges(form, p);
        rendreListe(); // le compteur de ce proche repart à zéro derrière la feuille
        toast("Échange noté.");
      } catch (e) { cb.echec(e); }
    });
    form.querySelector("[data-echanges]").addEventListener("click", async (ev) => {
      const b = ev.target.closest("[data-echange-suppr]");
      if (!b) return;
      try {
        await api.supprimerEchange(Number(b.dataset.echangeSuppr));
        etat.echanges = etat.echanges.filter((e) => e.id !== Number(b.dataset.echangeSuppr));
        dessinerEchanges(form, p);
        rendreListe();
        toast("Échange supprimé.");
      } catch (e) { cb.echec(e); }
    });
  }

  function apresOuverture(form, p) {
    form.classList.add("pr-form");
    form.querySelector('[type="submit"]').textContent = p ? "Enregistrer" : "Ajouter";
    form.querySelector(".choix-detaille").addEventListener("click", (ev) => {
      const b = ev.target.closest("[data-qui]");
      if (!b) return;
      form.elements.qui.value = b.dataset.qui;
      marquerChoix(b);
    });
    if (p) brancherEchanges(form, p);
  }

  /** Colonnes à écrire ; lève une erreur lisible (affichée par le bloc) si le formulaire est invalide. */
  function champs(form, p) {
    const lu = lire(form);
    return champsProche(lu, etat.proches.filter((x) => x.id !== p?.id), new Date().getFullYear());
  }

  return { html, apresOuverture, champs };
}
