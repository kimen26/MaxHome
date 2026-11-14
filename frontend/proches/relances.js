// Garder le lien : qui est à relancer, quels anniversaires tombent. Logique PURE, sans DOM ni réseau.
// Miroir de scripts/bot/proches.py : les deux sont confrontés dans tests/bot/test_proches.py (L-014).
// Dates en chaînes "AAAA-MM-JJ" locales (L-004 : jamais toISOString). Un jour = un compte de jours civils
// calculé en UTC pour échapper aux changements d'heure.

const JOUR_MS = 86400000;

function enJours(iso) {
  const [a, m, j] = String(iso).slice(0, 10).split('-').map(Number);
  return Date.UTC(a, m - 1, j) / JOUR_MS;
}

function estBissextile(annee) {
  return (annee % 4 === 0 && annee % 100 !== 0) || annee % 400 === 0;
}

function jourDuMois(annee, mois) {
  return [31, estBissextile(annee) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][mois - 1];
}

function iso(annee, mois, jour) {
  return `${String(annee).padStart(4, '0')}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
}

// Prénom sans accents ni casse : l'ordre ne dépend ni de la locale ni de la plateforme.
function cleTri(proche) {
  return String(proche.prenom || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function parPrenom(a, b) {
  const x = cleTri(a), y = cleTri(b);
  if (x !== y) return x < y ? -1 : 1;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

// Date du dernier contact : le plus récent des échanges de la personne, sinon sa date de création.
export function dernierContact(proche, echanges) {
  const dates = (echanges || []).filter((e) => e.proche_id === proche.id && e.le).map((e) => String(e.le).slice(0, 10));
  if (!dates.length) return proche.cree_le ? String(proche.cree_le).slice(0, 10) : null;
  return dates.reduce((max, d) => (d > max ? d : max));
}

// Proches actifs avec un rythme, sans contact depuis au moins `rythme_jours`. Les plus en retard d'abord.
export function aRelancer(proches, echanges, aujourdhui) {
  const auj = enJours(aujourdhui);
  return (proches || [])
    .filter((p) => p.actif !== false && Number(p.rythme_jours) > 0)
    .map((p) => {
      const dernier = dernierContact(p, echanges);
      const depuisJours = dernier ? auj - enJours(dernier) : null;
      return { p, depuisJours, retardJours: depuisJours === null ? null : depuisJours - Number(p.rythme_jours) };
    })
    .filter((x) => x.retardJours !== null && x.retardJours >= 0)
    .sort((a, b) => b.retardJours - a.retardJours || parPrenom(a.p, b.p))
    .map((x) => ({ id: x.p.id, depuisJours: x.depuisJours, retardJours: x.retardJours }));
}

// Prochaine occurrence (aujourd'hui compris) de l'anniversaire : { jour, annee } ou null si la date est invalide.
// Un 29 février se fête le 28 février les années non bissextiles.
function prochaineOccurrence(p, aujourdhui) {
  const jourN = Number(p.anniv_jour), moisN = Number(p.anniv_mois);
  if (!Number.isInteger(jourN) || !Number.isInteger(moisN) || moisN < 1 || moisN > 12) return null;
  if (jourN < 1 || jourN > jourDuMois(2024, moisN)) return null;  // 2024 : bissextile, 29/02 admis
  const anneeAuj = Number(String(aujourdhui).slice(0, 4));
  for (const annee of [anneeAuj, anneeAuj + 1]) {
    const jour = Math.min(jourN, jourDuMois(annee, moisN));
    const candidat = iso(annee, moisN, jour);
    if (enJours(candidat) >= enJours(aujourdhui)) return { jour: candidat, annee };
  }
  return null;
}

// Anniversaires des proches actifs dans les `horizonJours` jours (0 = aujourd'hui, 1 = demain).
export function anniversaires(proches, aujourdhui, horizonJours = 1) {
  const auj = enJours(aujourdhui);
  const trouves = [];
  for (const p of proches || []) {
    if (p.actif === false) continue;
    const occ = prochaineOccurrence(p, aujourdhui);
    if (!occ) continue;
    const dansJours = enJours(occ.jour) - auj;
    if (dansJours > horizonJours) continue;
    const nee = Number(p.anniv_annee);
    const age = Number.isInteger(nee) && nee > 0 && occ.annee - nee >= 0 ? occ.annee - nee : null;
    trouves.push({ p, id: p.id, jour: occ.jour, dansJours, age });
  }
  trouves.sort((a, b) => a.dansJours - b.dansJours || parPrenom(a.p, b.p));
  return trouves.map(({ id, jour, dansJours, age }) => ({ id, jour, dansJours, age }));
}
