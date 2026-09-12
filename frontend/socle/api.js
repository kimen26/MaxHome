// Accès Supabase — aucune logique UI ici.

export function creerApi(sb) {
  const filtre = (q, annee, mois) => q.eq("annee", annee).eq("mois", mois);
  const rendre = ({ data, error }) => { if (error) throw error; return data; };

  return {
    auth: {
      connecter: (email, password) => sb.auth.signInWithPassword({ email, password }),
      deconnecter: () => sb.auth.signOut(),
      surChangement: (cb) => sb.auth.onAuthStateChange(cb),
      async prenomCourant(membres) {
        const { data } = await sb.auth.getUser();
        const email = data?.user?.email;
        return membres.find((m) => m.email === email)?.prenom ?? null;
      },
    },

    membres: () => sb.from("membres").select("prenom,email,ordre").order("ordre").then(rendre),
    charges: () => sb.from("charges").select("*").order("ordre").order("id").then(rendre),
    comptes: () => sb.from("comptes").select("*").order("id").then(rendre),
    recurrents: () => sb.from("mouvements_recurrents").select("*").order("ordre").order("id").then(rendre),

    async mois(annee, mois) {
      const [lignes, revenus, ajustements, mouvements] = await Promise.all([
        filtre(sb.from("lignes").select("charge_id,montant_centimes,regle"), annee, mois).then(rendre),
        filtre(sb.from("revenus").select("prenom,montant_centimes"), annee, mois).then(rendre),
        filtre(sb.from("ajustements").select("*"), annee, mois).then(rendre),
        filtre(sb.from("mouvements").select("*").order("id"), annee, mois).then(rendre),
      ]);
      return { lignes, revenus, ajustements, mouvements };
    },

    /** Lignes et revenus sur une plage de mois, pour les statistiques. */
    async plage(debut, fin) {
      const cle = (a, m) => a * 12 + (m - 1);
      const dans = (q) => q.gte("annee", debut[0]).lte("annee", fin[0]);
      const [lignes, revenus] = await Promise.all([
        dans(sb.from("lignes").select("annee,mois,charge_id,montant_centimes,regle")).then(rendre),
        dans(sb.from("revenus").select("annee,mois,prenom,montant_centimes")).then(rendre),
      ]);
      const garde = (r) => cle(r.annee, r.mois) >= cle(...debut) && cle(r.annee, r.mois) <= cle(...fin);
      return { lignes: lignes.filter(garde), revenus: revenus.filter(garde) };
    },

    /** Dernier montant non nul saisi pour une charge, tous mois confondus (préaffichage). */
    async derniersMontants() {
      const data = await sb.from("lignes").select("charge_id,montant_centimes,annee,mois")
        .neq("montant_centimes", 0).order("annee", { ascending: false }).order("mois", { ascending: false }).then(rendre);
      const out = {};
      for (const l of data) if (out[l.charge_id] === undefined) out[l.charge_id] = l.montant_centimes;
      return out;
    },

    majRevenu: (annee, mois, prenom, montant_centimes) =>
      sb.from("revenus").upsert({ annee, mois, prenom, montant_centimes }).then(rendre),

    majLigne: (annee, mois, charge_id, champs) =>
      sb.from("lignes").upsert({ annee, mois, charge_id, ...champs }).then(rendre),

    supprimerLigne: (annee, mois, charge_id) =>
      filtre(sb.from("lignes").delete(), annee, mois).eq("charge_id", charge_id).then(rendre),

    majCharge: (id, champs) => sb.from("charges").update(champs).eq("id", id).then(rendre),
    creerCharge: (champs) => sb.from("charges").insert(champs).select().single().then(rendre),

    creerAjustement: (champs) => sb.from("ajustements").insert(champs).select().single().then(rendre),
    supprimerAjustement: (id) => sb.from("ajustements").delete().eq("id", id).then(rendre),

    creerCompte: (champs) => sb.from("comptes").insert(champs).select().single().then(rendre),
    majCompte: (id, champs) => sb.from("comptes").update(champs).eq("id", id).then(rendre),
    supprimerCompte: (id) => sb.from("comptes").delete().eq("id", id).then(rendre),

    creerRecurrent: (champs) => sb.from("mouvements_recurrents").insert(champs).select().single().then(rendre),
    majRecurrent: (id, champs) => sb.from("mouvements_recurrents").update(champs).eq("id", id).then(rendre),
    supprimerRecurrent: (id) => sb.from("mouvements_recurrents").delete().eq("id", id).then(rendre),

    // ---------- module Courses ----------
    rayons: () => sb.from("courses_rayons").select("*").order("ordre").then(rendre),
    courses: () => sb.from("courses").select("*").order("ajoute_le").then(rendre),
    creerCourse: (champs) => sb.from("courses").insert(champs).select().single().then(rendre),
    majCourse: (id, champs) => sb.from("courses").update(champs).eq("id", id).then(rendre),
    supprimerCourses: (ids) => sb.from("courses").delete().in("id", ids).then(rendre),

    /** Échange l'`ordre` de deux groupes (Réglages · Magasin) : une seule paire à la fois. */
    async echangerOrdreRayons(rayonA, rayonB) {
      await Promise.all([
        sb.from("courses_rayons").update({ ordre: rayonB.ordre }).eq("nom", rayonA.nom).then(rendre),
        sb.from("courses_rayons").update({ ordre: rayonA.ordre }).eq("nom", rayonB.nom).then(rendre),
      ]);
    },

    repas: () => sb.from("repas").select("*").eq("actif", true).order("ordre").then(rendre),
    repasIngredients: () => sb.from("repas_ingredients").select("*").then(rendre),
    classiques: () => sb.from("courses_classiques").select("*").order("fois", { ascending: false }).then(rendre),
    /** Alimenté uniquement par « Vider le panier » : upsert qui incrémente `fois`. */
    async classerCommeClassique(article) {
      const existant = await sb.from("courses_classiques").select("fois").eq("libelle", article.libelle)
        .maybeSingle().then(rendre);
      // `.select().single()` est indispensable : sans lui, un upsert PostgREST renvoie `null`,
      // et l'appelant (viderPanier) poussait ce null dans `etat.classiques` — le rendu suivant
      // plantait alors sur `c.libelle`. Une écriture dont on réutilise le résultat doit le rendre.
      return sb.from("courses_classiques").upsert({
        libelle: article.libelle, quantite: article.quantite, rayon: article.rayon,
        fois: (existant?.fois ?? 0) + 1,
      }).select().single().then(rendre);
    },

    // ---------- module Tâches ----------
    tachesRec: () => sb.from("taches_recurrentes").select("*").order("ordre").order("id").then(rendre),
    /** Tâches non faites (quelle que soit leur date) et tâches depuis `depuis` (AAAA-MM-JJ). */
    taches: (depuis) => sb.from("taches").select("*").or(`fait_le.is.null,echeance.gte.${depuis}`).order("id").then(rendre),
    creerTaches: (lignes) => sb.from("taches").insert(lignes).select().then(rendre),
    supprimerTaches: (ids) => sb.from("taches").delete().in("id", ids).then(rendre),
    majTache: (id, champs) => sb.from("taches").update(champs).eq("id", id).select().single().then(rendre),
    creerTacheRec: (champs) => sb.from("taches_recurrentes").insert(champs).select().single().then(rendre),
    majTacheRec: (id, champs) => sb.from("taches_recurrentes").update(champs).eq("id", id).then(rendre),

    creerMouvements: (lignes) => sb.from("mouvements").insert(lignes).select().then(rendre),
    majMouvement: (id, champs) => sb.from("mouvements").update(champs).eq("id", id).select().single().then(rendre),
    supprimerMouvement: (id) => sb.from("mouvements").delete().eq("id", id).then(rendre),
  };
}
