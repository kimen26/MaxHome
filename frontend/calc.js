// Moteur de répartition — pur, sans DOM, testable en node.
// Tous les montants en centimes entiers.

export const TYPES = { egales: "Égales", proport: "Proport." };

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

/**
 * @param charges  [{id, libelle, type}]
 * @param lignes   {charge_id: montant_centimes}
 * @param revenus  {prenom: montant_centimes}
 */
export function calculer(charges, lignes, revenus) {
  const prenoms = Object.keys(revenus);
  const totaux = { egales: 0, proport: 0 };
  for (const c of charges) totaux[c.type] += lignes[c.id] ?? 0;
  const total = totaux.egales + totaux.proport;
  const totalRevenus = prenoms.reduce((s, p) => s + revenus[p], 0);
  const ratio = Object.fromEntries(
    prenoms.map((p) => [p, totalRevenus ? revenus[p] / totalRevenus : 0])
  );
  const partEgales = repartir(totaux.egales, Object.fromEntries(prenoms.map((p) => [p, 1])));
  const partProport = repartir(totaux.proport, revenus);
  const parts = Object.fromEntries(
    prenoms.map((p) => [p, partEgales[p] + partProport[p]])
  );
  const reste = Object.fromEntries(prenoms.map((p) => [p, revenus[p] + parts[p]]));
  return { totaux, total, totalRevenus, ratio, partEgales, partProport, parts, reste };
}

export const euros = (c) =>
  (c / 100).toLocaleString("fr-FR", { style: "currency", currency: "EUR" });
export const versCentimes = (s) => {
  const n = Number(String(s).replace(",", ".").replace(/\s/g, ""));
  if (!Number.isFinite(n)) throw new Error(`Montant invalide : ${s}`);
  return Math.round(n * 100);
};
