// Activités de la fiche voyage V3 : quatre groupes (Payé · Acté · Possible · Écartés replié), une
// carte dépliable par lieu (<details> natif : tap, clavier, lecteur d'écran sans code). Dépliée :
// photo, topo, horaires, note, prix/code si résa, puis les actions. Rendu PUR depuis
// (voyage, lieux, resas) ; `lectureSeule` retire actions, note, prix, codes et payeurs (le lot
// « partage » le rappelle tel quel) — les liens Site / Itinéraire restent, ils informent.
import { txt } from "../socle/ui-base.js";
import { euros } from "../budget/calc.js";
import { CATEGORIES_LIEU, resaDuLieu } from "./carnet.js";
import { joursDuVoyage, lieuxParStatut } from "./planning.js";
import { MOT_STATUT, pastilleStatut, jourCourt, jourLong, heureDe, lienSur, lienItineraire } from "./fiche-statuts.js";

const GROUPES = ["paye", "acte", "possible"];
const emojiLieu = (l) => CATEGORIES_LIEU.find((c) => c.valeur === l.categorie)?.emoji ?? "📍";

/** Choix du statut : Possible / Acté écrivent `lieu.statut`, Payé ouvre le formulaire de résa. */
function choixStatut(lieu, statut) {
  const bouton = (s) => `<button type="button" class="fv-choix fv-${s}" data-choix-statut="${lieu.id}" data-statut="${s}"
      aria-pressed="${statut === s}"${statut === "paye" && s !== "paye" ? " disabled" : ""}>${MOT_STATUT[s]}</button>`;
  return `<div class="fv-choix-statut" role="group" aria-label="Statut de ${txt(lieu.nom)}">${["possible", "acte", "paye"].map(bouton).join("")}</div>
    ${statut === "paye" ? `<p class="fv-aide">Payé : la réservation se modifie dans Infos.</p>` : ""}`;
}

function choixJour(lieu, voyage, jourEffectif) {
  const options = joursDuVoyage(voyage)
    .map((j) => `<option value="${j}"${j === jourEffectif ? " selected" : ""}>${txt(jourLong(j))}</option>`);
  return `<label class="fv-jour-choix">Jour
    <select class="champ" data-choisir-jour="${lieu.id}">
      <option value=""${jourEffectif ? "" : " selected"}>Sans date</option>${options.join("")}
    </select></label>`;
}

function ligneResa(resa) {
  if (!resa) return "";
  const prix = resa.prix_centimes != null ? `<span class="fv-prix mono">${txt(euros(resa.prix_centimes))}</span>` : "";
  const payeur = resa.paye_par ? `<span class="fv-aide">payé par ${txt(resa.paye_par)}</span>` : "";
  const etat = resa.statut === "reserve" ? "Réservé" : "À réserver";
  const code = resa.code ? `<button type="button" class="fv-code" data-copier-code="${txt(resa.code)}">${txt(resa.code)}</button>` : "";
  return `<div class="fv-resa"><span class="fv-resa-etat">${etat}</span>${prix}${payeur}${code}</div>`;
}

function liens(lieu) {
  const site = lienSur(lieu.lien);
  const itineraire = lieu.lat != null && lieu.lng != null ? lienItineraire(lieu) : null;
  return `${site ? `<a class="btn fv-btn" href="${site}" target="_blank" rel="noopener">Site ↗</a>` : ""}
    ${itineraire ? `<a class="btn fv-btn" href="${txt(itineraire)}" target="_blank" rel="noopener">Itinéraire ↗</a>` : ""}`;
}

function carte(lieu, statut, resas, voyage, { lectureSeule, ouvertes, photos }) {
  const resa = resaDuLieu(lieu, resas);
  const photo = photos[lieu.photo_chemin];
  const quand = [lieu.jour ? jourCourt(lieu.jour) : "Sans date", heureDe(resa?.debut)].filter(Boolean).join(" · ");
  return `<details class="fv-act fv-${statut}" data-lieu="${lieu.id}"${ouvertes.has(lieu.id) ? " open" : ""}>
    <summary>
      <span class="fv-ico" aria-hidden="true">${emojiLieu(lieu)}</span>
      <span class="fv-act-c"><span class="fv-act-n">${txt(lieu.nom)}</span><span class="fv-act-d">${txt(quand)}</span></span>
      <span class="fv-act-statut">${pastilleStatut(statut)}${lieu.statut === "fait" ? `<span class="fv-fait">✓ Fait</span>` : ""}</span>
    </summary>
    <div class="fv-act-corps">
      ${photo ? `<img class="fv-photo" src="${txt(photo)}" alt="${txt(lieu.nom)}" loading="lazy" width="640" height="360">` : ""}
      ${lieu.topo ? `<p class="fv-topo">${txt(lieu.topo)}</p>` : ""}
      ${lieu.horaires ? `<p class="fv-detail">Horaires : ${txt(lieu.horaires)}</p>` : ""}
      ${!lectureSeule && lieu.note ? `<p class="fv-detail">Nos notes : ${txt(lieu.note)}</p>` : ""}
      ${lectureSeule ? "" : ligneResa(resa)}
      ${!lectureSeule && lieu.lat == null && statut !== "ecarte" ? `<span class="fv-alocaliser">à localiser</span>` : ""}
      ${lectureSeule ? "" : choixStatut(lieu, statut) + choixJour(lieu, voyage, lieu.jour)}
      <div class="fv-actions">${liens(lieu)}${lectureSeule ? "" : `<button type="button" class="btn fv-btn" data-modifier-lieu="${lieu.id}">Modifier</button>`}</div>
    </div>
  </details>`;
}

/** `ouvertes` : Set d'ids de lieux dépliés ; `photos` : { chemin → URL signée }. */
export function rendreActivites(voyage, lieux, resas, { lectureSeule = false, ouvertes = new Set(), photos = {}, ecartesOuverts = false } = {}) {
  const groupes = lieuxParStatut(lieux, resas);
  const options = { lectureSeule, ouvertes, photos };
  const section = (statut) => groupes[statut].length ? `<section class="fv-groupe">
      <h3 class="fv-groupe-t">${pastilleStatut(statut)} <span>${groupes[statut].length}</span></h3>
      ${groupes[statut].map((l) => carte(l, statut, resas, voyage, options)).join("")}
    </section>` : "";
  const ecartes = groupes.ecarte.length ? `<details class="fv-repli" data-repli-ecartes${ecartesOuverts ? " open" : ""}>
      <summary>Écartés (${groupes.ecarte.length})</summary>
      ${groupes.ecarte.map((l) => carte(l, "ecarte", resas, voyage, options)).join("")}
    </details>` : "";
  const aLocaliser = lieux.filter((l) => l.lat == null && l.statut !== "ecarte").length;
  const pied = lectureSeule ? "" : `${aLocaliser ? `<button type="button" class="btn-lien" data-localiser-tous>Localiser les ${aLocaliser} lieux sans position</button>` : ""}
    <button type="button" class="btn btn-tirets" data-nouveau-lieu>+ Lieu</button>`;
  const vide = GROUPES.every((s) => !groupes[s].length) && !groupes.ecarte.length
    ? `<p class="vide">Aucune activité pour l'instant.</p>` : "";
  return `<div class="fv-activites">${GROUPES.map(section).join("")}${vide}${ecartes}${pied}</div>`;
}
