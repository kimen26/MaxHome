// Écrans « Stats » (barres revenus, barres charges communes, camembert du mois) et « Vue annuelle ».

import { calculer, euros } from "./calc.js";
import { $, $$, txt, MOIS_COURT, MOIS, decaler } from "./ui-base.js";

const capitale = (s) => s[0].toUpperCase() + s.slice(1);

const COULEURS_CAT = {
  Alimentation: "#1f4e79", Logement: "#4a7fb0", Max: "#8fb3d9",
  "Épargne": "#c5d5e6", Banque: "#e6eaef", "Impôts": "#6b93bd", Autre: "#a8bbcf",
};

/** Regroupe des lignes/revenus plats en un résultat de calcul par mois. */
function parMois(donnees, charges, cles) {
  const out = new Map();
  for (const [annee, mois] of cles) {
    const k = `${annee}-${mois}`;
    const lignes = {};
    for (const l of donnees.lignes) {
      if (l.annee === annee && l.mois === mois) lignes[l.charge_id] = { montant_centimes: l.montant_centimes, regle: l.regle };
    }
    const revenus = {};
    for (const r of donnees.revenus) if (r.annee === annee && r.mois === mois) revenus[r.prenom] = r.montant_centimes;
    out.set(k, { annee, mois, lignes, revenus });
  }
  return out;
}

export function creerUiStats(api, etat, cb) {
  let nbMois = 6;

  const clesPeriode = (n) => Array.from({ length: n }, (_, i) => decaler(etat.annee, etat.mois, i - (n - 1)));

  async function rendre() {
    const cles = clesPeriode(nbMois);
    const membres = etat.membres.map((m) => m.prenom);
    let donnees;
    try { donnees = await api.plage(cles[0], cles.at(-1)); }
    catch (e) { return cb.echec(e); }

    const mois = parMois(donnees, etat.charges, cles);
    const calculs = cles.map(([a, m]) => {
      const d = mois.get(`${a}-${m}`);
      const revenus = Object.fromEntries(membres.map((p) => [p, d.revenus[p] ?? 0]));
      return { annee: a, mois: m, ...calculer(etat.charges, d.lignes, revenus, []), revenus };
    });

    const courant = calculs.at(-1);
    const maxRevenu = Math.max(1, ...calculs.flatMap((c) => membres.map((p) => c.revenus[p])));
    const maxCharges = Math.max(1, ...calculs.map((c) => Math.abs(c.totalCommun)));
    const moyenne = calculs.reduce((s, c) => s + Math.abs(c.totalCommun), 0) / calculs.length;

    const cats = Object.entries(courant.parCategorie).map(([k, v]) => [k, Math.abs(v)])
      .filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const totalCats = cats.reduce((s, [, v]) => s + v, 0);
    let angle = 0;
    const parts = cats.map(([k, v]) => {
      const debut = angle;
      angle += (v / (totalCats || 1)) * 360;
      return `${COULEURS_CAT[k] ?? "#a8bbcf"} ${debut.toFixed(2)}deg ${angle.toFixed(2)}deg`;
    }).join(", ");

    const ratioTxt = membres.map((p) => Math.round((courant.ratio[p] ?? 0) * 100)).join(" / ");

    $("#stats-corps").innerHTML = `<div class="stats-grille">
      <section class="carte">
        <h3>Revenus nets</h3>
        <div class="barres">${calculs.map((c) => `
          <div class="colonne"><div class="paire">
            ${membres.map((p, i) => `<span class="barre" style="height:${Math.round((c.revenus[p] / maxRevenu) * 100)}%;background:${i === 0 ? "var(--bleu)" : "var(--barre-1)"}"></span>`).join("")}
          </div><span class="legende-mois">${MOIS_COURT[c.mois - 1]}</span></div>`).join("")}</div>
        <p class="sous">${membres.map((p, i) => `<span class="puce-legende" style="background:${i === 0 ? "var(--bleu)" : "var(--barre-1)"}"></span>${txt(p)}`).join(" ")}</p>
        <p class="sous">${capitale(MOIS[courant.mois - 1])} : ${euros(courant.totalRevenus)} · clé ${ratioTxt}</p>
      </section>

      <section class="carte">
        <h3>Total charges communes</h3>
        <p class="sous">Moyenne ${euros(-moyenne)}</p>
        <div class="barres">${calculs.map((c, i) => `
          <div class="colonne rail cliquable" data-aller="${c.annee}-${c.mois}">
            <span class="valeur-barre mono">${(Math.abs(c.totalCommun) / 100000).toFixed(1)}k</span>
            <span class="barre pleine" style="height:${Math.round((Math.abs(c.totalCommun) / maxCharges) * 100)}%;background:${i === calculs.length - 1 ? "var(--bleu)" : "var(--barre-3)"}"></span>
            <span class="legende-mois">${MOIS_COURT[c.mois - 1]}</span></div>`).join("")}</div>
      </section>

      <section class="carte">
        <h3>Répartition de ${MOIS[courant.mois - 1]}</h3>
        ${totalCats ? `<div class="camembert" style="background:conic-gradient(${parts})">
          <span class="trou"><span class="mono">${euros(-totalCats)}</span></span></div>
        <ul class="legende-cat">${cats.map(([k, v]) => `<li>
          <span class="puce-legende" style="background:${COULEURS_CAT[k] ?? "#a8bbcf"}"></span>
          ${txt(k)}<span class="mono">${Math.round((v / totalCats) * 100)} %</span></li>`).join("")}</ul>`
        : '<p class="vide">Aucune charge saisie ce mois.</p>'}
      </section>
    </div>`;

    for (const el of $$("#stats-corps [data-aller]")) {
      el.addEventListener("click", () => { location.hash = el.dataset.aller; });
    }
  }

  for (const b of $$("#periode button")) {
    b.addEventListener("click", () => {
      nbMois = Number(b.dataset.mois);
      $$("#periode button").forEach((x) => x.classList.toggle("actif", x === b));
      rendre();
    });
  }

  // ---------- vue annuelle ----------
  async function rendreAnnuel() {
    const cles = Array.from({ length: 12 }, (_, i) => [etat.annee, i + 1]);
    let donnees;
    try { donnees = await api.plage([etat.annee, 1], [etat.annee, 12]); }
    catch (e) { return cb.echec(e); }
    const membres = etat.membres.map((m) => m.prenom);
    const mois = parMois(donnees, etat.charges, cles);
    const calculs = cles.map(([a, m]) => {
      const d = mois.get(`${a}-${m}`);
      const revenus = Object.fromEntries(membres.map((p) => [p, d.revenus[p] ?? 0]));
      return { mois: m, ...calculer(etat.charges, d.lignes, revenus, []), revenus };
    });
    const categories = [...new Set(etat.charges.map((c) => c.categorie))];

    $("#titre-annuel").textContent = `Vue annuelle ${etat.annee}`;
    // Un mois sans aucune saisie affiche « — » plutôt qu'une colonne de zéros.
    const vide = (c) => !c.totalRevenus && !c.total;
    const cellules = (f) => calculs.map((c) => `<td class="num${c.mois === etat.mois ? " courant" : ""}">${vide(c) ? "—" : f(c)}</td>`).join("");
    $("#tableau-annuel").innerHTML = `<div class="defilant"><table>
      <thead><tr><th></th>${calculs.map((c) => `<th class="num${c.mois === etat.mois ? " courant" : ""}">${MOIS_COURT[c.mois - 1]}</th>`).join("")}</tr></thead>
      <tbody>
        <tr><th>Revenus</th>${cellules((c) => euros(c.totalRevenus))}</tr>
        ${categories.map((k) => `<tr><th>${txt(k)}</th>${cellules((c) => (c.parCategorie[k] ? euros(c.parCategorie[k]) : "—"))}</tr>`).join("")}
        <tr class="fort"><th>Total commun</th>${cellules((c) => euros(c.totalCommun))}</tr>
        ${membres.map((p) => `<tr><th>${txt(p)} verse</th>${cellules((c) => euros(-(c.aVerser[p] ?? 0)))}</tr>`).join("")}
        ${membres.map((p) => `<tr><th>Reste ${txt(p)}</th>${cellules((c) => euros(c.reste[p] ?? 0))}</tr>`).join("")}
      </tbody></table></div>`;
  }

  return { rendre, rendreAnnuel };
}
