// Écrans « Tâches récurrentes » (réglages) et « Balance » du module Tâches.
// Le cycle CRUD vient de blocs-reglages ; ici, le HTML de la liste, du formulaire et de la balance.

import { $, $$, txt } from "../socle/ui-base.js";
import { ligneReglage } from "../socle/blocs.js";
import { creerReglages } from "../socle/blocs-reglages.js";
import { champ, zone, select, listeChoix, membresOptions, lire } from "../socle/blocs-form.js";
import { FREQUENCES, PENIBILITES, IMPORTANCES, balance, jourIso, decalerJours, pts } from "./taches.js";

const echelle = (libelles) => libelles.slice(1).map((l, i) => [i + 1, `${i + 1} — ${l}`]);

export function creerUiTachesRec(api, etat, cb) {
  const actives = () => etat.tachesRec.filter((r) => r.actif);
  const categories = () => [...new Set(etat.tachesRec.map((r) => r.categorie))];

  const reglages = creerReglages({
    liste: "#liste-taches-rec", bouton: "#form-tache-rec", libelleNouveau: "+ Nouvelle tâche récurrente",
    elements: actives,
    htmlListe: (liste) => {
      if (!liste.length) return '<p class="vide">Aucune tâche récurrente.</p>';
      const parCat = {};
      for (const r of liste) (parCat[r.categorie] ??= []).push(r);
      return Object.entries(parCat).map(([cat, items]) => `<section class="groupe">
        <div class="groupe-tete"><span>${txt(cat)}</span><span>${items.length}</span></div>
        ${items.map((r) => ligneReglage({
    id: r.id, titre: r.titre,
    sous: `${FREQUENCES[r.frequence]}${r.fois > 1 ? ` · ${r.fois} fois` : ""} · ${IMPORTANCES[r.importance].toLowerCase()}`,
    consigne: r.consigne, droite: `<span class="pts">${pts(r.penibilite)}</span>`, pastille: r.attribue_a,
  })).join("")}
      </section>`).join("");
    },
    titreForm: (r) => (r ? "Modifier la tâche" : "Nouvelle tâche récurrente"),
    htmlForm: (r) => `
      ${champ("titre", "Titre", { valeur: r?.titre, requis: true })}
      ${champ("categorie", "Catégorie", { valeur: r?.categorie ?? "Maison", attrs: 'list="cats-rec"' })}
      ${listeChoix("cats-rec", categories())}
      ${select("frequence", "Fréquence", Object.entries(FREQUENCES), r?.frequence ?? "quotidien")}
      ${champ("fois", "Combien de fois par période", { type: "number", valeur: r?.fois ?? 1, attrs: 'min="1" max="10"' })
    .replace("<label>", "<label data-si-periode>")}
      ${select("penibilite", "Pénibilité — les points", echelle(PENIBILITES), r?.penibilite ?? 2)}
      ${select("importance", "Importance — l’ordre et le rappel", echelle(IMPORTANCES), r?.importance ?? 2)}
      ${select("attribue_a", "Attribuée d’habitude à", membresOptions(etat), r?.attribue_a, { vide: "Personne en particulier" })}
      ${zone("consigne", "Consigne", r?.consigne)}`,
    apresOuverture: (form) => {
      const majVisibilite = () => { form.querySelector("[data-si-periode]").hidden = form.frequence.value === "au_besoin"; };
      form.frequence.addEventListener("change", majVisibilite);
      majVisibilite();
    },
    champs: (form) => {
      const v = lire(form, { nombres: ["fois", "penibilite", "importance"] });
      return {
        titre: v.titre, categorie: v.categorie ?? "Maison", frequence: v.frequence,
        fois: v.frequence === "au_besoin" ? 1 : Math.max(1, v.fois || 1),
        penibilite: v.penibilite, importance: v.importance, attribue_a: v.attribue_a, consigne: v.consigne,
      };
    },
    api: {
      creer: async (valeurs) => {
        etat.tachesRec.push(await api.creerTacheRec({ ...valeurs, actif: true, ordre: etat.tachesRec.length + 1 }));
      },
      maj: (id, valeurs) => api.majTacheRec(id, valeurs),
      // Désactivation, pas suppression : l'historique des points reste lisible.
      retirer: async (r) => { await api.majTacheRec(r.id, { actif: false }); r.actif = false; },
    },
    apresEcriture: () => cb.rafraichir("taches"),
    confirmerRetrait: (r) => `Retirer « ${r.titre} » ? Les tâches déjà faites restent comptées.`,
    messageRetrait: "Tâche retirée.",
    echec: cb.echec,
  });

  // ---------- balance ----------
  let jours = 7;
  function rendreBalance() {
    const membres = etat.membres.map((m) => m.prenom);
    const jour = jourIso(new Date());
    const b = balance(etat.taches, membres, decalerJours(jour, -(jours - 1)), jour);
    const couleur = (i) => (i === 0 ? "var(--bleu)" : "var(--barre-1)");
    const somme = (v) => Object.values(v).reduce((s, n) => s + n, 0);
    const cats = Object.entries(b.parCategorie).sort((x, y) => somme(y[1]) - somme(x[1]));

    $("#balance-corps").innerHTML = `<div class="stats-grille">
      <section class="carte">
        <h3>Équilibre sur ${jours} jours</h3>
        <div class="balance-grand">${membres.map((p, i) => `<div class="balance-personne">
          <span class="mono grand" style="color:${couleur(i)}">${Math.round(b.ratio[p] * 100)} %</span>
          <span class="nom">${txt(p)}</span>
          <span class="sous">${pts(b.points[p])} · ${b.nombre[p]} tâche${b.nombre[p] > 1 ? "s" : ""}</span>
        </div>`).join("")}</div>
        <div class="barre-h">${membres.map((p, i) => `<span style="width:${b.ratio[p] * 100}%;background:${couleur(i)}"></span>`).join("")}</div>
        <p class="sous">${b.total ? `${b.total} points au total.` : "Aucune tâche cochée sur la période."}</p>
      </section>
      <section class="carte">
        <h3>Par catégorie</h3>
        ${cats.length ? `<div class="pile-cats">${cats.map(([cat, v]) => `<div class="cat-ligne">
          <div class="cat-tete"><span>${txt(cat)}</span>
            <span class="sous">${membres.map((p) => `${txt(p)} ${v[p]}`).join(" · ")}</span></div>
          <div class="barre-h fine">${membres.map((p, i) => `<span style="width:${(v[p] / somme(v)) * 100}%;background:${couleur(i)}"></span>`).join("")}</div>
        </div>`).join("")}</div>` : '<p class="vide">Rien à montrer.</p>'}
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

  return { rendre: reglages.rendre, rendreBalance };
}
