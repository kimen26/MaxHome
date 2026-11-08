// Règles PURES du formulaire d'un événement de l'agenda Google : valeurs de départ et lecture de la
// saisie. Sans DOM ni réseau — testé dans tests/test_agenda.mjs. Miroir de la validation de l'Edge
// Function (supabase/functions/agenda-google/evenements.ts) : ici pour répondre tout de suite, là-bas
// parce que seul le serveur fait foi. Les messages sont ceux que Yann lit.

import { QUI, FAMILLE } from "./calendrier.js";

export const TITRE_MAX = 200;
export const HEURE_DEBUT_DEFAUT = "09:00";
export const HEURE_FIN_DEFAUT = "10:00";

const FORMAT_JOUR = /^\d{4}-\d{2}-\d{2}$/;
const FORMAT_HEURE = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * Valeurs de départ du formulaire. Nouvel événement : `jour` (jour choisi, sinon aujourd'hui),
 * journée entière, pour `prenom` si c'est un des quatre « qui », sinon Famille. Modification :
 * ce que l'événement porte déjà ; sans heures, les heures proposées si on décoche la journée.
 */
export function valeursInitiales({ jour, evenement = null, prenom = null }) {
  if (evenement) {
    return {
      titre: evenement.titre, personne: evenement.qui, toute: evenement.heureDebut == null,
      debut: evenement.debut, fin: evenement.fin,
      heureDebut: evenement.heureDebut ?? HEURE_DEBUT_DEFAUT, heureFin: evenement.heureFin ?? HEURE_FIN_DEFAUT,
    };
  }
  return {
    titre: "", personne: QUI.includes(prenom) ? prenom : FAMILLE, toute: true, debut: jour, fin: jour,
    heureDebut: HEURE_DEBUT_DEFAUT, heureFin: HEURE_FIN_DEFAUT,
  };
}

/** Fin à proposer quand le début change : elle suit le début tant qu'elle était égale à l'ancien
 *  début ou qu'elle serait avant le nouveau. */
export const finSuivantDebut = (ancienDebut, nouveauDebut, fin) =>
  (!fin || fin === ancienDebut || fin < nouveauDebut ? nouveauDebut : fin);

/**
 * Valeurs lues dans le formulaire → saisie envoyée à l'Edge Function, ou une Error au message lisible.
 * `v` : { titre, personne, toute, debut, fin, heureDebut, heureFin } (chaînes, "" ou null si vide).
 */
export function saisieEvenement(v) {
  const titre = String(v.titre ?? "").trim();
  if (!titre) throw new Error("Donnez un titre à l’événement.");
  if (titre.length > TITRE_MAX) throw new Error(`Le titre est trop long (${TITRE_MAX} caractères au plus).`);
  if (!QUI.includes(v.personne)) throw new Error(`Choisissez pour qui : ${QUI.join(", ")}.`);
  if (!FORMAT_JOUR.test(v.debut ?? "")) throw new Error("Choisissez la date de début.");
  if (!FORMAT_JOUR.test(v.fin ?? "")) throw new Error("Choisissez la date de fin.");
  if (v.fin < v.debut) throw new Error("La date de fin est avant la date de début.");
  const base = { titre, personne: v.personne, debut: v.debut, fin: v.fin };
  if (v.toute) return { ...base, heureDebut: null, heureFin: null };
  if (!FORMAT_HEURE.test(v.heureDebut ?? "") || !FORMAT_HEURE.test(v.heureFin ?? "")) {
    throw new Error("Indiquez l’heure de début et l’heure de fin, ou cochez « Toute la journée ».");
  }
  if (v.debut !== v.fin) {
    throw new Error("Un événement avec des heures tient sur un seul jour : mettez la même date, ou cochez « Toute la journée ».");
  }
  if (v.heureFin <= v.heureDebut) throw new Error("L’heure de fin doit être après l’heure de début.");
  return { ...base, heureDebut: v.heureDebut, heureFin: v.heureFin };
}
