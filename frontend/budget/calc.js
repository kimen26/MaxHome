// Moteur de répartition — pur, sans DOM, testable en node.
// Tous les montants en centimes entiers.


/** Répartit `total` (centimes) selon des poids ; le reste d'arrondi va au premier. */
export function repartir(total, poids) {
  const prenoms = Object.keys(poids);
  const somme = prenoms.reduce((s, p) => s + poids[p], 0);
  if (prenoms.length === 0) return {};
  if (somme === 0) {
    const part = Math.trunc(total / prenoms.length);
    const out = Object.fromEntries(prenoms.map((p) => [p, part]));
    out[prenoms[0]] += total - part * prenoms.length;
    return out;
  }
  const out = {};
  let distribue = 0;
  for (const p of prenoms) {
    out[p] = Math.round((total * poids[p]) / somme);
    distribue += out[p];
  }
  out[prenoms[0]] += total - distribue;
  return out;
}

/** Montant d'une ligne, que le dictionnaire porte un nombre ou un objet {montant_centimes, regle}. */
export const montantLigne = (l) => (typeof l === "object" && l !== null ? l.montant_centimes ?? 0 : l ?? 0);

/** Règle effective d'une charge pour un mois : la règle du mois si elle existe, sinon celle de la charge. */
export const regleEffective = (charge, ligne) =>
  (typeof ligne === "object" && ligne !== null && ligne.regle) || charge.regle;

/** États de financement d'une ligne du mois (colonne `lignes.financement`, migration 038) :
 *  `null` = compté normalement ; « a_financer » = extra en attente, hors calcul ; « joint » =
 *  le compte joint l'absorbe (personne ne vire plus) ; « chacun » = chacun ajoute ce mois-ci
 *  (compté comme une charge normale). */
export const FINANCEMENTS = ["a_financer", "joint", "chacun"];

/** Financement d'une ligne, `null` pour un nombre brut ou une ligne sans financement. Un état
 *  inconnu est une donnée corrompue et lève, comme `montantTheorique` : jamais compté en silence. */
export function financementLigne(ligne) {
  const f = typeof ligne === "object" && ligne !== null ? ligne.financement ?? null : null;
  if (f !== null && !FINANCEMENTS.includes(f)) throw new Error(`financement de ligne inconnu : ${f}`);
  return f;
}

/** Vrai si la ligne entre dans le calcul du commun (virements, total, reste à vivre) : un nombre
 *  brut, un financement null ou « chacun ». « a_financer » et « joint » en sortent. */
export const compteDansLeCommun = (ligne) => {
  const f = financementLigne(ligne);
  return f === null || f === "chacun";
};

/**
 * @param charges    [{id, libelle, categorie, regle, cle_pct, payeur, ponctuel}]
 * @param lignes     {charge_id: montant_centimes} ou {charge_id: {montant_centimes, regle, financement}}
 * @param revenus    {prenom: montant_centimes}
 * @param ajustements [{de, vers, montant_centimes}]
 * @returns en plus des totaux : `aFinancer` (somme des extras « a_financer », hors calcul) et
 *   `parJoint` (somme des lignes « joint »), signées comme les lignes (négatives pour une dépense).
 */
export function calculer(charges, lignes, revenus, ajustements = []) {
  const prenoms = Object.keys(revenus);
  const [p1, p2] = prenoms;
  const totaux = { egales: 0, proport: 0, cle: 0, perso: 0 };
  const parCategorie = {};
  const persoParPayeur = Object.fromEntries(prenoms.map((p) => [p, 0]));
  let aFinancer = 0;
  let parJoint = 0;

  for (const c of charges) {
    const montant = montantLigne(lignes[c.id]);
    if (!montant) continue;
    const financement = financementLigne(lignes[c.id]);
    if (financement === "a_financer") { aFinancer += montant; continue; } // en attente : nulle part ailleurs
    if (financement === "joint") {
      // Le compte joint l'absorbe : personne ne vire plus, mais la dépense existe (Stats).
      parJoint += montant;
      parCategorie[c.categorie] = (parCategorie[c.categorie] ?? 0) + montant;
      continue;
    }
    const regle = regleEffective(c, lignes[c.id]);
    totaux[regle] += montant;
    parCategorie[c.categorie] = (parCategorie[c.categorie] ?? 0) + montant;
    if (regle === "perso" && c.payeur) persoParPayeur[c.payeur] += montant;
  }

  // Total commun = tout sauf perso (perso ne rentre pas dans le compte commun).
  const totalCommun = totaux.egales + totaux.proport + totaux.cle;
  const total = totalCommun + totaux.perso;

  const totalRevenus = prenoms.reduce((s, p) => s + revenus[p], 0);
  const ratio = Object.fromEntries(
    prenoms.map((p) => [p, totalRevenus ? revenus[p] / totalRevenus : 0])
  );

  const partEgales = repartir(totaux.egales, Object.fromEntries(prenoms.map((p) => [p, 1])));
  const partProport = repartir(totaux.proport, revenus);

  // cle : part du 1er membre = cle_pct %, agrégée sur toutes les charges 'cle'
  // (poids moyen pondéré par montant, cas simple : une seule charge cle en pratique).
  let totalCleMontant = 0;
  let cleWeighted = 0;
  for (const c of charges) {
    if (!compteDansLeCommun(lignes[c.id]) || regleEffective(c, lignes[c.id]) !== "cle") continue;
    const montant = montantLigne(lignes[c.id]);
    if (!montant) continue;
    totalCleMontant += montant;
    cleWeighted += montant * (c.cle_pct ?? 50);
  }
  const clePctMoyen = totalCleMontant ? cleWeighted / totalCleMontant : 50;
  const poidsCle = p2
    ? { [p1]: clePctMoyen, [p2]: 100 - clePctMoyen }
    : { [p1]: 100 };
  const partCle = repartir(totaux.cle, poidsCle);

  const parts = Object.fromEntries(
    prenoms.map((p) => [p, partEgales[p] + partProport[p] + partCle[p]])
  );

  // Ajustements : transfèrent montant de 'de' vers 'vers' (vers verse moins, de verse plus).
  const aVerser = { ...parts };
  for (const a of ajustements) {
    if (aVerser[a.de] === undefined || aVerser[a.vers] === undefined) continue;
    aVerser[a.de] += a.montant_centimes;
    aVerser[a.vers] -= a.montant_centimes;
  }

  const reste = Object.fromEntries(
    prenoms.map((p) => [p, revenus[p] + aVerser[p] + persoParPayeur[p]])
  );

  return {
    totaux, total, totalCommun, totalRevenus, ratio,
    partEgales, partProport, partCle, parts, aVerser, reste,
    parCategorie, persoParPayeur, aFinancer, parJoint,
  };
}

/**
 * Montant théorique d'un mouvement selon le mode de son récurrent.
 * `null` seulement sans récurrent (mouvement ponctuel) ; un mode inconnu est une donnée
 * corrompue et lève, comme côté bot (scripts/bot/mouvements.py).
 * @param contexte { lignes: {charge_id: {montant_centimes}}, resultat: { aVerser } }
 */
export function montantTheorique(recurrent, { lignes, resultat }) {
  if (!recurrent) return null;
  if (recurrent.mode === "fixe") return recurrent.montant_centimes ?? 0;
  if (recurrent.mode === "charge") return montantLigne(lignes[recurrent.charge_id]);
  if (recurrent.mode === "part") return -(resultat.aVerser[recurrent.prenom_part] ?? 0);
  throw new Error(`mode de mouvement récurrent inconnu : ${recurrent.mode}`);
}

export const euros = (c) =>
  (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
export const versCentimes = (s) => {
  const n = Number(String(s).replace(",", ".").replace(/\s/g, ""));
  if (!Number.isFinite(n)) throw new Error(`Montant invalide : ${s}`);
  return Math.round(n * 100);
};
