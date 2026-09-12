// Écran « Réglages · Magasin » : l'ordre de parcours du magasin, qui pilote l'ordre des
// groupes dans la liste de courses. ↑ / ↓ échangent l'`ordre` de deux groupes voisins.

import { $, txt } from "../socle/ui-base.js";

export function creerUiMagasin(api, etat, cb) {
  const enAttente = (nom) => etat.courses.filter((a) => !a.coche_le && a.rayon === nom).length;

  function ligne(rayon, rang, dernier) {
    const n = enAttente(rayon.nom);
    return `<div class="mag-ligne">
      <span class="mag-rang mono">${rang}</span>
      <span class="mag-nom">${txt(rayon.nom)}</span>
      <span class="mag-attente mono">${n} en attente</span>
      <div class="mag-fleches">
        <button type="button" class="btn-fleche" data-monter="${txt(rayon.nom)}"
          ${rang === 1 ? "disabled" : ""} aria-label="Monter ${txt(rayon.nom)}">↑</button>
        <button type="button" class="btn-fleche" data-descendre="${txt(rayon.nom)}"
          ${dernier ? "disabled" : ""} aria-label="Descendre ${txt(rayon.nom)}">↓</button>
      </div>
    </div>`;
  }

  function rendre() {
    const rayons = [...etat.rayons].sort((a, b) => a.ordre - b.ordre);
    $("#liste-magasin").innerHTML = rayons.length
      ? rayons.map((r, i) => ligne(r, i + 1, i === rayons.length - 1)).join("")
      : `<p class="vide">Aucun groupe.</p>`;
    brancher();
  }

  /** Échange l'`ordre` de `rayon` avec son voisin (avant ou après dans le tri courant). */
  async function deplacer(nomRayon, sens) {
    const tries = [...etat.rayons].sort((a, b) => a.ordre - b.ordre);
    const i = tries.findIndex((r) => r.nom === nomRayon);
    const j = i + sens;
    if (i === -1 || j < 0 || j >= tries.length) return;
    const [a, b] = [tries[i], tries[j]];
    const [ordreA, ordreB] = [a.ordre, b.ordre];
    a.ordre = ordreB;
    b.ordre = ordreA;
    rendre();
    try {
      await api.echangerOrdreRayons({ nom: a.nom, ordre: ordreB }, { nom: b.nom, ordre: ordreA });
    } catch (e) {
      a.ordre = ordreA;
      b.ordre = ordreB;
      rendre();
      cb.echec(e);
    }
  }

  function brancher() {
    for (const b of $("#liste-magasin").querySelectorAll("[data-monter]")) {
      b.addEventListener("click", () => deplacer(b.dataset.monter, -1));
    }
    for (const b of $("#liste-magasin").querySelectorAll("[data-descendre]")) {
      b.addEventListener("click", () => deplacer(b.dataset.descendre, 1));
    }
  }

  return { rendre };
}
