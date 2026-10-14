// Règles PURES du planning de la fiche voyage V3 (brief fiche-voyage-v3.md, D-058) : statuts
// Payé/Acté/Possible/Écarté, jours du voyage, éléments d'un jour, nuits. Sans DOM ni réseau —
// testé dans tests/test_planning.mjs. Réutilise `resaDuLieu` / `lieuxParJour` du carnet.
import { resaDuLieu, lieuxParJour } from "./carnet.js";

/** Rang d'un statut affiché : plus grand = plus avancé. */
const RANG = { possible: 0, acte: 1, paye: 2 };
const TYPES_TRANSPORT = ["vol", "train", "voiture"];
const NB_NOMS_TITRE = 2;

/** Statut affiché d'une résa : `reserve` → paye, `a_reserver` → acte ; annulée → null. */
export function statutResa(resa) {
  if (resa.statut === "reserve") return "paye";
  if (resa.statut === "a_reserver") return "acte";
  return null;
}

/** Statut affiché d'un lieu : écarté ; payé si résa liée `reserve` ; acté si prévu/fait ;
 *  sinon possible (idée). */
export function statutLieu(lieu, resas) {
  if (lieu.statut === "ecarte") return "ecarte";
  if (resaDuLieu(lieu, resas)?.statut === "reserve") return "paye";
  if (lieu.statut === "prevu" || lieu.statut === "fait") return "acte";
  return "possible";
}

/** Date AAAA-MM-JJ décalée de `n` jours (calcul en UTC : aucun saut d'heure d'été). */
export function ajouterJours(iso, n) {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Tous les jours du voyage, de `debut` à `fin` inclus (AAAA-MM-JJ). */
export function joursDuVoyage(voyage) {
  const jours = [];
  for (let j = voyage.debut; j <= voyage.fin; j = ajouterJours(j, 1)) jours.push(j);
  return jours;
}

/** Une résa logement non annulée couvre la nuit du jour J si debut ≤ J < fin (dates seules) ;
 *  sans `fin`, seulement la nuit de son `debut`. */
export function couvreNuit(resa, jour) {
  if (resa.type !== "logement" || resa.statut === "annule" || !resa.debut) return false;
  const debut = resa.debut.slice(0, 10);
  const fin = resa.fin?.slice(0, 10);
  return fin ? debut <= jour && jour < fin : debut === jour;
}

const heureDe = (e, resas) => (e.type === "resa" ? e.objet : resaDuLieu(e.objet, resas))?.debut ?? "";
const nomDe = (e) => (e.type === "lieu" ? e.objet.nom : e.objet.titre);
const estTransport = (e) =>
  e.type === "lieu" ? e.objet.categorie === "transport" : TYPES_TRANSPORT.includes(e.objet.type);
const estLogement = (e) => e.type === "lieu" && e.objet.categorie === "logement";
const plusAvance = (statuts) => statuts.reduce((m, s) => (RANG[s] > RANG[m] ? s : m), "possible");

/** Un lieu logement dont la résa liée est un logement non annulé : déjà montré en nuit / « libérer ». */
const logementDejaEnNuit = (lieu, resas) =>
  lieu.categorie === "logement" && resaDuLieu(lieu, resas)?.type === "logement";

/** Éléments d'un jour : lieux (hors écartés et hors logements déjà en nuit) de ce jour + résas non
 *  annulées sans lieu, datées ce jour, hors logement (qui vivent en nuits). Tri : ordre,
 *  transports en tête, heure, nom. */
function elementsDuJour(jour, lieux, resas) {
  const lieuxDuJour = lieux
    .filter((l) => l.statut !== "ecarte" && !logementDejaEnNuit(l, resas))
    .filter((l) => (l.jour ?? resaDuLieu(l, resas)?.debut?.slice(0, 10) ?? null) === jour)
    .map((l) => ({ type: "lieu", objet: l, statut: statutLieu(l, resas), ordre: l.ordre ?? 0 }));
  const idsLieux = new Set(lieux.map((l) => l.id));
  const resasSansLieu = resas
    .filter((r) => r.statut !== "annule" && r.type !== "logement" && r.debut?.slice(0, 10) === jour)
    .filter((r) => !r.lieu_id || !idsLieux.has(r.lieu_id))
    .map((r) => ({ type: "resa", objet: r, statut: statutResa(r), ordre: 0 }));
  return [...lieuxDuJour, ...resasSansLieu]
    .sort((a, b) => a.ordre - b.ordre
      || Number(estTransport(b)) - Number(estTransport(a))
      || heureDe(a, resas).localeCompare(heureDe(b, resas))
      || nomDe(a).localeCompare(nomDe(b), "fr"))
    .map(({ type, objet, statut }) => ({ type, objet, statut }));
}

/** Titre court : 2 noms d'éléments hors logement/transport puis « +n » ; sinon le premier
 *  transport ; sinon « Journée libre ». */
function titreCourtDe(elements) {
  const noms = elements.filter((e) => !estTransport(e) && !estLogement(e)).map(nomDe);
  if (noms.length) {
    const reste = noms.length - NB_NOMS_TITRE;
    return noms.slice(0, NB_NOMS_TITRE).join(" · ") + (reste > 0 ? ` +${reste}` : "");
  }
  const transport = elements.find(estTransport);
  return transport ? nomDe(transport) : "Journée libre";
}

/** Statut d'un jour : le plus avancé hors logement/transport ; sinon parmi logements,
 *  transports, nuits et résas à libérer ; rien = possible. */
function statutDuJour(elements, nuits, liberer) {
  const principaux = elements.filter((e) => !estTransport(e) && !estLogement(e));
  if (principaux.length) return plusAvance(principaux.map((e) => e.statut));
  return plusAvance([...elements, ...nuits, ...liberer].map((e) => e.statut));
}

/**
 * Le planning jour par jour d'un voyage.
 * → [{ jour, statut, titreCourt, liberer: [{ resa, statut }], elements: [{ type, objet, statut }],
 *      nuits: [{ resa, statut }] }]
 */
export function planningParJour(voyage, lieux, resas) {
  const logements = resas.filter((r) => r.type === "logement" && r.statut !== "annule");
  return joursDuVoyage(voyage).map((jour) => {
    const elements = elementsDuJour(jour, lieux, resas);
    const nuits = logements.filter((r) => couvreNuit(r, jour)).map((r) => ({ resa: r, statut: statutResa(r) }));
    const liberer = logements
      .filter((r) => r.fin?.slice(0, 10) === jour)
      .map((r) => ({ resa: r, statut: statutResa(r) }));
    return { jour, statut: statutDuJour(elements, nuits, liberer), titreCourt: titreCourtDe(elements), liberer, elements, nuits };
  });
}

/** Les lieux rangés par statut affiché, triés par jour (sans date en dernier), ordre, nom.
 *  → { paye, acte, possible, ecarte } */
export function lieuxParStatut(lieux, resas) {
  const groupes = { paye: [], acte: [], possible: [], ecarte: [] };
  const effectifs = lieux.map((l) => ({ ...l, jour: l.jour ?? resaDuLieu(l, resas)?.debut?.slice(0, 10) ?? null }));
  for (const groupe of lieuxParJour(effectifs)) {
    for (const lieu of groupe.lieux) groupes[statutLieu(lieu, resas)].push(lieu);
  }
  return groupes;
}
