// Accès Supabase — aucune logique UI ici.

export function creerApi(sb) {
  const filtre = (q, annee, mois) => q.eq("annee", annee).eq("mois", mois);

  return {
    auth: {
      connecter: (email, password) => sb.auth.signInWithPassword({ email, password }),
      deconnecter: () => sb.auth.signOut(),
      surChangement: (cb) => sb.auth.onAuthStateChange(cb),
    },

    async membres() {
      const { data, error } = await sb.from("membres").select("prenom,ordre").order("ordre");
      if (error) throw error;
      return data;
    },

    async charges() {
      const { data, error } = await sb.from("charges").select("*").order("ordre").order("id");
      if (error) throw error;
      return data;
    },

    async comptes() {
      const { data, error } = await sb.from("comptes").select("*").order("id");
      if (error) throw error;
      return data;
    },

    async mois(annee, mois) {
      const [{ data: lignes, error: e1 }, { data: revenus, error: e2 },
        { data: ajustements, error: e3 }, { data: virements, error: e4 }] = await Promise.all([
        filtre(sb.from("lignes").select("charge_id,montant_centimes"), annee, mois),
        filtre(sb.from("revenus").select("prenom,montant_centimes"), annee, mois),
        filtre(sb.from("ajustements").select("*"), annee, mois),
        filtre(sb.from("virements").select("*"), annee, mois),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      if (e3) throw e3;
      if (e4) throw e4;
      return { lignes, revenus, ajustements, virements };
    },

    async majRevenu(annee, mois, prenom, montant_centimes) {
      const { error } = await sb.from("revenus").upsert({ annee, mois, prenom, montant_centimes });
      if (error) throw error;
    },

    async majLigne(annee, mois, charge_id, montant_centimes) {
      const { error } = await sb.from("lignes").upsert({ annee, mois, charge_id, montant_centimes });
      if (error) throw error;
    },

    async majCharge(id, champs) {
      const { error } = await sb.from("charges").update(champs).eq("id", id);
      if (error) throw error;
    },

    async creerCharge(champs) {
      const { data, error } = await sb.from("charges").insert(champs).select().single();
      if (error) throw error;
      return data;
    },

    async creerAjustement(champs) {
      const { data, error } = await sb.from("ajustements").insert(champs).select().single();
      if (error) throw error;
      return data;
    },

    async supprimerAjustement(id) {
      const { error } = await sb.from("ajustements").delete().eq("id", id);
      if (error) throw error;
    },

    async majVirement(annee, mois, prenom, montant_centimes, fait_le) {
      const { error } = await sb.from("virements").upsert({ annee, mois, prenom, montant_centimes, fait_le });
      if (error) throw error;
    },

    async creerCompte(champs) {
      const { data, error } = await sb.from("comptes").insert(champs).select().single();
      if (error) throw error;
      return data;
    },

    async majCompte(id, champs) {
      const { error } = await sb.from("comptes").update(champs).eq("id", id);
      if (error) throw error;
    },

    async supprimerCompte(id) {
      const { error } = await sb.from("comptes").delete().eq("id", id);
      if (error) throw error;
    },

    async lignesMois(annee, mois) {
      const { data, error } = await sb.from("lignes").select("charge_id,montant_centimes").eq("annee", annee).eq("mois", mois);
      if (error) throw error;
      return data;
    },

    async revenusMois(annee, mois) {
      const { data, error } = await sb.from("revenus").select("prenom,montant_centimes").eq("annee", annee).eq("mois", mois);
      if (error) throw error;
      return data;
    },
  };
}
