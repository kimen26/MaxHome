// Test Deno hors ligne (pas de réseau, pas de secrets) de la logique de regroupement de
// index.ts::construireGroupesNonFaits — extraite et collée ici (Deno ne permet pas d'importer
// facilement une fonction privée d'un fichier qui appelle Deno.serve au chargement). Complète
// tests/bot/test_budget_virements.py côté bot : ce fichier couvre l'Edge Function elle-même.
// Lancer : npx deno test supabase/functions/rappel-virements/test_groupes.ts

import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

type Compte = { id: number; nom: string; commun: boolean };
type Charge = { id: number; libelle: string; ponctuel: boolean; actif: boolean };
type Recurrent = { id: number; mode: string; charge_id: number | null; compte_de: number | null; compte_vers: number | null; actif: boolean };
type Ligne = { charge_id: number; montant_centimes: number; fait_le: string | null };
type Mouvement = { id: number; recurrent_id: number | null; titre: string; compte_de: number | null; compte_vers: number | null; montant_centimes: number; qui: string | null; fait_le: string | null };
type Groupe = { de: number | string | null; vers: number; libelleVers: string; total: number; nLignes: number };

function nomDuCompte(comptes: Compte[], id: number | null): string {
  if (id == null) return "Commun";
  return comptes.find((c) => c.id === id)?.nom ?? "compte inconnu";
}

function compteDeCharge(chargeId: number, recurrents: Recurrent[]): number | null {
  return recurrents.find((r) => r.actif && r.mode === "charge" && r.charge_id === chargeId)?.compte_vers ?? null;
}

function construireGroupesNonFaits(
  charges: Charge[], lignes: Ligne[], recurrents: Recurrent[], mouvements: Mouvement[], comptes: Compte[],
): Groupe[] {
  const groupes = new Map<string, Groupe>();
  const ajouter = (de: number | string | null, vers: number, montant: number) => {
    const cle = `${de ?? "?"}→${vers}`;
    const g = groupes.get(cle) ?? { de, vers, libelleVers: nomDuCompte(comptes, vers), total: 0, nLignes: 0 };
    g.total += montant;
    g.nLignes += 1;
    groupes.set(cle, g);
  };

  for (const c of charges) {
    if (c.ponctuel || c.actif === false) continue;
    const vers = compteDeCharge(c.id, recurrents);
    if (vers == null) continue;
    const l = lignes.find((x) => x.charge_id === c.id);
    if (!l || !l.montant_centimes || l.fait_le) continue;
    ajouter(null, vers, l.montant_centimes);
  }

  for (const m of mouvements) {
    const r = recurrents.find((x) => x.id === m.recurrent_id);
    if (r?.mode === "charge") continue;
    if (m.compte_vers == null || m.fait_le) continue;
    ajouter(m.compte_de, m.compte_vers, m.montant_centimes);
  }

  return [...groupes.values()];
}

const COMPTES: Compte[] = [{ id: 1, nom: "Commun", commun: true }, { id: 2, nom: "Caisse d'Épargne", commun: false }];
const CHARGES: Charge[] = [
  { id: 1, libelle: "Crédit immo", ponctuel: false, actif: true },
  { id: 2, libelle: "Loyer", ponctuel: false, actif: true }, // reste sur le commun
];
const RECURRENTS: Recurrent[] = [{ id: 9, mode: "charge", charge_id: 1, compte_de: 1, compte_vers: 2, actif: true }];

Deno.test("une charge sans destination autre que le commun ne forme aucun groupe", () => {
  const lignes: Ligne[] = [{ charge_id: 2, montant_centimes: -80000, fait_le: null }];
  const groupes = construireGroupesNonFaits(CHARGES, lignes, RECURRENTS, [], COMPTES);
  assertEquals(groupes.length, 0);
});

Deno.test("le mouvement du récurrent charge ne double pas la ligne de charge", () => {
  const lignes: Ligne[] = [{ charge_id: 1, montant_centimes: -125000, fait_le: null }];
  const mouvements: Mouvement[] = [
    { id: 102, recurrent_id: 9, titre: "Crédit immo", compte_de: 1, compte_vers: 2, montant_centimes: -125000, qui: null, fait_le: null },
  ];
  const groupes = construireGroupesNonFaits(CHARGES, lignes, RECURRENTS, mouvements, COMPTES);
  assertEquals(groupes.length, 1);
  assertEquals(groupes[0].nLignes, 1, "le mouvement lié au récurrent charge ne compte pas en plus");
  assertEquals(groupes[0].total, -125000);
});

Deno.test("une ligne déjà validée (fait_le posé) sort du rappel", () => {
  const lignes: Ligne[] = [{ charge_id: 1, montant_centimes: -125000, fait_le: "2026-09-29T10:00:00Z" }];
  const groupes = construireGroupesNonFaits(CHARGES, lignes, RECURRENTS, [], COMPTES);
  assertEquals(groupes.length, 0, "une ligne validée n'a plus rien à virer côté rappel");
});

Deno.test("un mouvement fait_le posé sort du rappel", () => {
  const mouvements: Mouvement[] = [
    { id: 200, recurrent_id: null, titre: "Virement Yann", compte_de: null, compte_vers: 1, montant_centimes: -30000, qui: "Yann", fait_le: "2026-09-29T10:00:00Z" },
  ];
  const groupes = construireGroupesNonFaits([], [], [], mouvements, COMPTES);
  assertEquals(groupes.length, 0);
});

Deno.test("deux mouvements du même trajet se cumulent", () => {
  const mouvements: Mouvement[] = [
    { id: 200, recurrent_id: null, titre: "Virement Yann", compte_de: null, compte_vers: 1, montant_centimes: -30000, qui: "Yann", fait_le: null },
    { id: 201, recurrent_id: null, titre: "Virement Claudia", compte_de: null, compte_vers: 1, montant_centimes: -20000, qui: "Claudia", fait_le: null },
  ];
  const groupes = construireGroupesNonFaits([], [], [], mouvements, COMPTES);
  assertEquals(groupes.length, 1);
  assertEquals(groupes[0].total, -50000);
  assertEquals(groupes[0].nLignes, 2);
});
