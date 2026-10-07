// Onglet « Pépites » (Nos voyages · Pépites) : le dernier relevé de prix de MaxVoyage, par
// période de vacances, puis les bons plans repérés dans la presse. Lecture seule : chaque offre
// ouvre la recherche Google Flights correspondante. Le relevé dit toujours sa date, et prévient
// quand il est vieux (PC de MaxVoyage éteint) — docs/briefs/veille-vols.md.

import { $, txt } from "../socle/ui-base.js";
import { formatPeriode, jourIso } from "../agenda/calendrier.js";
import { OFFRES_VISIBLES, libelleReleve, releveAncien, ageReleve, prixRond, ligneVol, reperesOffre } from "./pepites.js";

const HEURE = new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" });

function offre(o) {
  const reperes = reperesOffre(o).map((r) => `<span class="pp-repere ${r.ton}">${txt(r.texte)}</span>`).join("");
  return `<a class="pp-offre" href="${txt(o.lien)}" target="_blank" rel="noopener">
    <span class="pp-haut">
      <span class="pp-ville">${txt(o.ville)}${o.pays ? `<span class="pp-pays"> · ${txt(o.pays)}</span>` : ""}</span>
      <span class="pp-prix"><b>${txt(prixRond(o.prix_pp_centimes))}</b> /pers</span>
    </span>
    <span class="pp-dates">${txt(formatPeriode(o.depart, o.retour))} · ${txt(o.nuits)} nuit${o.nuits > 1 ? "s" : ""}
      <span class="pp-total">${txt(prixRond(o.prix_total_centimes))} à ${txt(o.voyageurs)}</span></span>
    <span class="pp-vol">${txt(o.origine ? `Depuis ${o.origine} · ` : "")}${txt(ligneVol(o))}</span>
    ${reperes ? `<span class="pp-reperes">${reperes}</span>` : ""}
    <span class="pp-voir">Voir les vols ↗</span>
  </a>`;
}

function periode(p, depliee) {
  const visibles = depliee ? p.offres : p.offres.slice(0, OFFRES_VISIBLES);
  const reste = p.offres.length - OFFRES_VISIBLES;
  const debut = p.type === "vacances" ? `<span class="pp-periode-sous">à partir du ${txt(formatPeriode(p.cle, p.cle))}</span>` : "";
  return `<section class="carte pp-periode">
    <h2 class="pp-periode-titre">${txt(p.titre)}${debut}</h2>
    ${p.offres.length ? `<div class="pp-offres">${visibles.map(offre).join("")}</div>` : `<p class="vide">Aucun prix relevé.</p>`}
    ${reste > 0 ? `<button type="button" class="pp-plus" data-deplier-periode="${txt(p.cle)}" aria-expanded="${depliee}">
      ${depliee ? "Replier" : `Voir les ${reste} autre${reste > 1 ? "s" : ""} destination${reste > 1 ? "s" : ""}`}</button>` : ""}
  </section>`;
}

// MaxVoyage marque « dates ? » un article dont il n'a pas su lire la période : rien à afficher.
const creneauConnu = (c) => (c && !c.includes("?") ? c : null);

function presse(items) {
  if (!items.length) return "";
  return `<section class="carte pp-presse">
    <h2 class="pp-periode-titre">Repérés dans la presse</h2>
    ${items.map((i) => `<a class="pp-article" href="${txt(i.lien)}" target="_blank" rel="noopener">
      <span class="pp-article-titre">${txt(i.titre)}</span>
      <span class="pp-article-meta">${txt([i.source, creneauConnu(i.creneau), i.prix_pp_centimes ? `dès ${prixRond(i.prix_pp_centimes)} /pers` : null].filter(Boolean).join(" · "))} ↗</span>
    </a>`).join("")}
  </section>`;
}

function etatReleve(veille, auj) {
  const c = veille.contenu;
  const heure = HEURE.format(new Date(veille.genere_le));
  const date = `${libelleReleve(c.releve_le, auj)}${ageReleve(c.releve_le, auj) === 0 ? ` à ${heure}` : ""}`;
  const ancien = releveAncien(c.releve_le, auj)
    ? `<p class="pp-alerte" role="status">⚠ Pas de nouveau relevé depuis ${txt(ageReleve(c.releve_le, auj))} jours : le PC de MaxVoyage était sans doute éteint. Les prix ont pu changer.</p>`
    : "";
  return `<p class="pp-releve">${txt(date)}, pour 2 adultes et 1 enfant. Touchez une offre pour la voir sur Google Flights.</p>${ancien}`;
}

export function creerUiPepites(api, etat) {
  const depliees = new Set();

  function html() {
    const veille = etat.veille;
    if (!veille) {
      return `<p class="vide">Aucun relevé reçu pour l’instant. MaxVoyage les envoie chaque matin après 7 h 15, quand le PC est allumé.</p>`;
    }
    const c = veille.contenu;
    return etatReleve(veille, jourIso(new Date()))
      + c.periodes.map((p) => periode(p, depliees.has(p.cle))).join("")
      + presse(c.presse ?? []);
  }

  function rendre() {
    const racine = $("#pepites-corps");
    racine.innerHTML = html();
    for (const b of racine.querySelectorAll("[data-deplier-periode]")) {
      b.addEventListener("click", () => {
        const cle = b.dataset.deplierPeriode;
        if (depliees.has(cle)) depliees.delete(cle); else depliees.add(cle);
        rendre();
      });
    }
  }

  return { rendre };
}
