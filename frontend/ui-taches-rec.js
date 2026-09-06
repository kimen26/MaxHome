// Écrans « Tâches récurrentes » (réglages) et « Balance » du module Tâches.

import { $, $$, txt, ouvrirFeuille, fermerFeuille, toast } from "./ui-base.js";
import { ligneReglage } from "./blocs.js";
import { FREQUENCES, PENIBILITES, IMPORTANCES, balance, jourIso, decalerJours } from "./taches.js";

export function creerUiTachesRec(api, etat, cb) {
  const categories = () => [...new Set(etat.tachesRec.map((r) => r.categorie))];

  function rendre() {
    const actives = etat.tachesRec.filter((r) => r.actif);
    const parCat = {};
    for (const r of actives) (parCat[r.categorie] ??= []).push(r);
    $("#liste-taches-rec").innerHTML = actives.length
      ? Object.entries(parCat).map(([cat, liste]) => `<section class="groupe">
          <div class="groupe-tete"><span>${txt(cat)}</span><span>${liste.length}</span></div>
          ${liste.map((r) => ligneReglage({
    id: r.id, titre: r.titre,
    sous: `${FREQUENCES[r.frequence]}${r.fois > 1 ? ` · ${r.fois} fois` : ""} · ${IMPORTANCES[r.importance].toLowerCase()}`,
    consigne: r.consigne,
    droite: `<span class="pts">${r.penibilite} pt${r.penibilite > 1 ? "s" : ""}</span>`,
    pastille: r.attribue_a,
  })).join("")}
        </section>`).join("")
      : '<p class="vide">Aucune tâche récurrente.</p>';

    $("#form-tache-rec").innerHTML = '<button class="btn btn-tirets" id="btn-nouvelle-tache">+ Nouvelle tâche récurrente</button>';
    $("#btn-nouvelle-tache").addEventListener("click", () => formulaire(null));
    for (const b of $$("#liste-taches-rec [data-modifier]")) {
      b.addEventListener("click", () => formulaire(etat.tachesRec.find((r) => r.id === Number(b.dataset.modifier))));
    }
    for (const b of $$("#liste-taches-rec [data-retirer]")) {
      b.addEventListener("click", () => retirer(Number(b.dataset.retirer)));
    }
  }

  function formulaire(r) {
    const options = (liste, choisi, decale = 0) => liste.map((l, i) =>
      `<option value="${i + decale}"${i + decale === choisi ? " selected" : ""}>${i + decale} — ${l}</option>`).join("");
    ouvrirFeuille(`<form id="form-trec" class="pile">
      <h2>${r ? "Modifier la tâche" : "Nouvelle tâche récurrente"}</h2>
      <label>Titre <input class="champ" name="titre" required value="${txt(r?.titre ?? "")}"></label>
      <label>Catégorie <input class="champ" name="categorie" list="cats-rec" value="${txt(r?.categorie ?? "Maison")}"></label>
      <datalist id="cats-rec">${categories().map((c) => `<option value="${txt(c)}">`).join("")}</datalist>
      <label>Fréquence <select class="champ" name="frequence">
        ${Object.entries(FREQUENCES).map(([v, l]) => `<option value="${v}"${v === (r?.frequence ?? "quotidien") ? " selected" : ""}>${l}</option>`).join("")}
      </select></label>
      <label data-si-periode>Combien de fois par période <input class="champ" name="fois" type="number" min="1" max="10" value="${r?.fois ?? 1}"></label>
      <label>Pénibilité — les points <select class="champ" name="penibilite">${options(PENIBILITES.slice(1), r?.penibilite ?? 2, 1)}</select></label>
      <label>Importance — l’ordre et le rappel <select class="champ" name="importance">${options(IMPORTANCES.slice(1), r?.importance ?? 2, 1)}</select></label>
      <label>Attribuée d’habitude à <select class="champ" name="attribue_a"><option value="">Personne en particulier</option>
        ${etat.membres.map((m) => `<option${m.prenom === r?.attribue_a ? " selected" : ""}>${txt(m.prenom)}</option>`).join("")}
      </select></label>
      <label>Consigne <textarea class="champ" name="consigne" rows="2">${txt(r?.consigne ?? "")}</textarea></label>
      <button type="submit" class="btn btn-bleu grandir">${r ? "Enregistrer" : "Ajouter"}</button>
    </form>`);

    const form = $("#form-trec");
    const majVisibilite = () => { form.querySelector("[data-si-periode]").hidden = form.frequence.value === "au_besoin"; };
    form.frequence.addEventListener("change", majVisibilite);
    majVisibilite();

    form.addEventListener("submit", async (ev) => {
      ev.preventDefault();
      const f = new FormData(form);
      const champs = {
        titre: f.get("titre").trim(),
        categorie: f.get("categorie").trim() || "Maison",
        frequence: f.get("frequence"),
        fois: f.get("frequence") === "au_besoin" ? 1 : Math.max(1, Number(f.get("fois")) || 1),
        penibilite: Number(f.get("penibilite")),
        importance: Number(f.get("importance")),
        attribue_a: f.get("attribue_a") || null,
        consigne: f.get("consigne").trim() || null,
      };
      try {
        if (r) { await api.majTacheRec(r.id, champs); Object.assign(r, champs); }
        else { etat.tachesRec.push(await api.creerTacheRec({ ...champs, actif: true, ordre: etat.tachesRec.length + 1 })); }
        fermerFeuille();
        rendre();
        toast("Enregistré.");
        await cb.rafraichirTaches();
      } catch (e) { cb.echec(e); }
    });
  }

  async function retirer(id) {
    const r = etat.tachesRec.find((x) => x.id === id);
    if (!r || !confirm(`Retirer « ${r.titre} » ? Les tâches déjà faites restent comptées.`)) return;
    try {
      // Désactivation, pas suppression : l'historique des points reste lisible.
      await api.majTacheRec(id, { actif: false });
      r.actif = false;
      rendre();
      toast("Tâche retirée.");
      await cb.rafraichirTaches();
    } catch (e) { cb.echec(e); }
  }

  // ---------- balance ----------
  let jours = 7;
  function rendreBalance() {
    const membres = etat.membres.map((m) => m.prenom);
    const jour = jourIso(new Date());
    const b = balance(etat.taches, membres, decalerJours(jour, -(jours - 1)), jour);
    const couleur = (i) => (i === 0 ? "var(--bleu)" : "var(--barre-1)");
    const cats = Object.entries(b.parCategorie).sort((x, y) =>
      Object.values(y[1]).reduce((s, n) => s + n, 0) - Object.values(x[1]).reduce((s, n) => s + n, 0));

    $("#balance-corps").innerHTML = `<div class="stats-grille">
      <section class="carte">
        <h3>Équilibre sur ${jours} jours</h3>
        <div class="balance-grand">${membres.map((p, i) => `<div class="balance-personne">
          <span class="mono grand" style="color:${couleur(i)}">${Math.round(b.ratio[p] * 100)} %</span>
          <span class="nom">${txt(p)}</span>
          <span class="sous">${b.points[p]} pt${b.points[p] > 1 ? "s" : ""} · ${b.nombre[p]} tâche${b.nombre[p] > 1 ? "s" : ""}</span>
        </div>`).join("")}</div>
        <div class="barre-h">${membres.map((p, i) => `<span style="width:${b.ratio[p] * 100}%;background:${couleur(i)}"></span>`).join("")}</div>
        <p class="sous">${b.total ? `${b.total} points au total.` : "Aucune tâche cochée sur la période."}</p>
      </section>
      <section class="carte">
        <h3>Par catégorie</h3>
        ${cats.length ? `<div class="pile-cats">${cats.map(([cat, v]) => {
    const tot = Object.values(v).reduce((s, n) => s + n, 0);
    return `<div class="cat-ligne"><div class="cat-tete"><span>${txt(cat)}</span>
        <span class="sous">${membres.map((p) => `${txt(p)} ${v[p]}`).join(" · ")}</span></div>
        <div class="barre-h fine">${membres.map((p, i) => `<span style="width:${(v[p] / tot) * 100}%;background:${couleur(i)}"></span>`).join("")}</div></div>`;
  }).join("")}</div>` : '<p class="vide">Rien à montrer.</p>'}
        <p class="sous">${membres.map((p, i) => `<span class="puce-legende" style="background:${couleur(i)}"></span>${txt(p)}`).join(" ")}</p>
      </section>
    </div>`;
  }

  for (const b of $$("#periode-balance button")) {
    b.addEventListener("click", () => {
      jours = Number(b.dataset.jours);
      $$("#periode-balance button").forEach((x) => x.classList.toggle("actif", x === b));
      rendreBalance();
    });
  }

  return { rendre, rendreBalance };
}
