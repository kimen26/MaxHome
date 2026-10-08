// Onglet « Alertes » (Nos voyages · Pépites · Alertes) : ce que MaxVoyage surveille, saisi depuis
// le téléphone (D-056). Le cycle CRUD vient de blocs-reglages ; ici la liste, le formulaire et ses
// deux aides : la période prise dans nos vacances scolaires, les destinations cherchées par ville.
// Une modification est relevée au prochain passage de MaxVoyage (chaque matin, PC allumé).

import { $, txt } from "../socle/ui-base.js";
import { carteListe, ligneReglage } from "../socle/blocs.js";
import { creerReglages } from "../socle/blocs-reglages.js";
import { champ, select, caseACocher, enEuros, lire } from "../socle/blocs-form.js";
import { formatPeriode, jourIso } from "../agenda/calendrier.js";
import { JOURS, ORIGINES, defautsType, voyageursParDefaut, valeursAlerte, resumeAlerte } from "./alertes.js";

const LIBRE = "libre";

export function creerUiAlertes(api, etat, cb) {
  const aeroports = () => etat.veille?.contenu?.aeroports ?? [];
  const nomDe = (code) => aeroports().find((a) => a.code === code)?.ville ?? null;
  const vacancesAVenir = () => etat.vacances.filter((v) => v.fin >= jourIso(new Date()));
  const triees = () => [...etat.alertes].sort((a, b) => Number(b.active) - Number(a.active) || a.debut.localeCompare(b.debut));

  function htmlForm(a) {
    const v = a ?? { type: "vacances", active: true, origines: ["ORY"], destinations: [], ...defautsType("vacances") };
    const jours = new Set(v.jours_depart ?? []);
    return `
      ${champ("nom", "Nom du projet", { valeur: v.nom, requis: true, placeholder: "Février au soleil" })}
      ${select("type", "Type", [["vacances", "Vacances (une période)"], ["weekend", "Week-ends"]], v.type)}
      ${select("choix_periode", "Période", [...vacancesAVenir().map((p, i) => [i, `${p.titre} · ${formatPeriode(p.debut, p.fin)}`]), [LIBRE, "Autres dates"]], LIBRE)}
      ${champ("periode_libelle", "Nom de la période", { valeur: v.periode_libelle, placeholder: "Vacances d'Hiver" })}
      <div class="al-deux">${champ("debut", "Du", { type: "date", valeur: v.debut, requis: true })}${champ("fin", "Au", { type: "date", valeur: v.fin, requis: true })}</div>
      <div class="al-deux">${champ("marge_avant", "Partir jusqu’à … jours avant", { type: "number", valeur: v.marge_avant, attrs: 'min="0" max="14" inputmode="numeric"' })}${champ("marge_apres", "Rentrer jusqu’à … jours après", { type: "number", valeur: v.marge_apres, attrs: 'min="0" max="14" inputmode="numeric"' })}</div>
      <div class="al-deux">${champ("nuits_min", "Nuits, au moins", { type: "number", valeur: v.nuits_min, requis: true, attrs: 'min="1" max="60" inputmode="numeric"' })}${champ("nuits_max", "Nuits, au plus", { type: "number", valeur: v.nuits_max, requis: true, attrs: 'min="1" max="60" inputmode="numeric"' })}</div>
      <fieldset class="al-jours"><legend>Jour de départ (aucun coché : tous les jours)</legend>
        ${JOURS.map(([n, l]) => `<label class="al-jour"><input type="checkbox" data-jour="${n}"${jours.has(n) ? " checked" : ""}><span>${l}</span></label>`).join("")}
      </fieldset>
      <div class="al-destinations">
        <span class="al-etiquette">Destinations</span>
        <input type="hidden" name="destinations" value="${txt(v.destinations.join(","))}">
        <div class="al-puces" data-puces></div>
        <div class="al-ajout">
          <input class="champ" data-ville list="al-aeroports" placeholder="Tapez une ville : Lisbonne…" autocomplete="off">
          <button type="button" class="btn" data-ajouter-ville>Ajouter</button>
        </div>
        <datalist id="al-aeroports">${aeroports().map((x) => `<option value="${txt(`${x.ville} · ${x.pays} (${x.code})`)}">`).join("")}</datalist>
      </div>
      ${select("origines", "Départ de", ORIGINES, v.origines.join(","))}
      ${champ("prix_max", "Bon plan sous … € par personne", { valeur: enEuros(v.prix_max_pp_centimes), attrs: 'inputmode="decimal"', placeholder: "300" })}
      ${caseACocher("directs_seulement", "Vols directs seulement", v.directs_seulement)}
      ${champ("recherches_max", v.type === "weekend" ? "Dates testées, au total" : "Dates testées par destination", { type: "number", valeur: v.recherches_max, attrs: 'min="1" max="120" inputmode="numeric"' })}
      <p class="al-aide">Plus de dates = un relevé plus long chaque matin. 8 suffit pour une période de vacances.</p>
      ${caseACocher("active", "Surveiller (décocher pour mettre en pause)", v.active)}`;
  }

  /** Puces des destinations choisies, chacune retirable ; la valeur vit dans le champ caché. */
  function brancherDestinations(form) {
    const cache = form.querySelector('[name="destinations"]');
    const codes = () => cache.value.split(",").filter(Boolean);
    const dessiner = () => {
      form.querySelector("[data-puces]").innerHTML = codes().length
        ? codes().map((c) => `<button type="button" class="al-puce" data-retirer-code="${txt(c)}" aria-label="Retirer ${txt(nomDe(c) ?? c)}">${txt(nomDe(c) ?? c)} ✕</button>`).join("")
        : `<span class="vide">Aucune destination.</span>`;
      for (const b of form.querySelectorAll("[data-retirer-code]")) {
        b.addEventListener("click", () => { cache.value = codes().filter((c) => c !== b.dataset.retirerCode).join(","); dessiner(); });
      }
    };
    const saisie = form.querySelector("[data-ville]");
    const ajouter = () => {
      const texte = saisie.value.trim();
      const code = (texte.match(/\(([A-Za-z]{3})\)\s*$/)?.[1] ?? (/^[A-Za-z]{3}$/.test(texte) ? texte : "")).toUpperCase()
        || aeroports().find((x) => x.ville.toLowerCase() === texte.toLowerCase())?.code;
      if (!code) { cb.echec(new Error(`Ville introuvable : « ${texte} ». Choisissez-la dans la liste proposée.`)); return; }
      if (!codes().includes(code)) cache.value = [...codes(), code].join(",");
      saisie.value = "";
      dessiner();
    };
    form.querySelector("[data-ajouter-ville]").addEventListener("click", ajouter);
    saisie.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); ajouter(); } });
    dessiner();
  }

  function apresOuverture(form, a) {
    brancherDestinations(form);
    form.querySelector('[name="choix_periode"]').addEventListener("change", (e) => {
      const p = vacancesAVenir()[Number(e.target.value)];
      if (!p) return;
      form.elements.periode_libelle.value = p.titre;
      form.elements.debut.value = p.debut;
      form.elements.fin.value = p.fin;
    });
    // Changer de type sur une alerte NEUVE remet les réglages de ce type (vendredi, 2 nuits…).
    if (!a) {
      form.querySelector('[name="type"]').addEventListener("change", (e) => {
        const d = defautsType(e.target.value);
        for (const k of ["nuits_min", "nuits_max", "marge_avant", "marge_apres", "recherches_max"]) form.elements[k].value = d[k];
        form.elements.directs_seulement.checked = d.directs_seulement;
        for (const c of form.querySelectorAll("[data-jour]")) c.checked = (d.jours_depart ?? []).includes(Number(c.dataset.jour));
      });
    }
  }

  function champs(form, a) {
    const lu = lire(form, { booleens: ["directs_seulement", "active"] });
    lu.jours_depart = [...form.querySelectorAll("[data-jour]:checked")].map((c) => Number(c.dataset.jour));
    const valeurs = valeursAlerte(lu);
    return a ? { ...valeurs, maj_le: new Date().toISOString() } : { ...valeurs, ...voyageursParDefaut(etat.alertes) };
  }

  const reglages = creerReglages({
    liste: "#liste-alertes", bouton: "#form-alerte",
    libelleNouveau: "+ Nouvelle alerte",
    elements: triees,
    htmlListe: (liste) => carteListe(liste.map((a) => ligneReglage({
      id: a.id, titre: a.nom, sous: txt(resumeAlerte(a, nomDe)),
      inactif: !a.active || a.fin < jourIso(new Date()),
    })), "Aucune alerte : MaxVoyage ne surveille rien."),
    titreForm: (a) => (a ? "Modifier l’alerte" : "Nouvelle alerte"),
    htmlForm, apresOuverture, champs,
    api: {
      creer: async (valeurs) => { etat.alertes.push(await api.creerAlerte(valeurs)); },
      maj: (id, valeurs) => api.majAlerte(id, valeurs),
      retirer: async (a) => {
        await api.supprimerAlerte(a.id);
        etat.alertes = etat.alertes.filter((x) => x.id !== a.id);
      },
    },
    confirmerRetrait: (a) => `Supprimer l’alerte « ${a.nom} » ? Pour l’arrêter un moment, mieux vaut la mettre en pause.`,
    messageRetrait: "Alerte supprimée.",
    echec: cb.echec,
  });

  return { rendre: reglages.rendre };
}
