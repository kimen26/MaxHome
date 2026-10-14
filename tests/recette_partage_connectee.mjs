// Recette connectée du partage par lien (brief fiche-voyage-v3.md, lot 3). À lancer APRÈS application
// de la migration 033. Login réel (mots de passe lus dans .env, jamais affichés) ; tout se passe sur
// un voyage FACTICE PASSÉ créé puis supprimé par ce script, jamais un voyage réel à venir (L-041).
//   - un anonyme avec le bon jeton lit le voyage, avec EXACTEMENT les champs autorisés ;
//   - ni code, prix, payé par, prestataire, note, poste, ni todos / enveloppes / pièces ;
//   - un mauvais jeton -> null ; un anonyme ne lit pas voyage_partages ;
//   - après suppression du jeton -> null.
// Usage : node tests/recette_partage_connectee.mjs
import fs from "node:fs";
import assert from "node:assert/strict";
import { CHAMPS_VOYAGE, CHAMPS_LIEU, CHAMPS_RESA, CHAMPS_BLOC } from "../frontend/agenda/partage-filtre.js";

const env = Object.fromEntries(fs.readFileSync(".env", "utf8").split(/\r?\n/).filter((l) => l.includes("=")).map((l) => l.split(/=(.*)/s).slice(0, 2)));
const cfg = fs.readFileSync("frontend/config.js", "utf8");
const URL_SB = cfg.match(/SUPABASE_URL = "([^"]+)"/)[1];
const CLE = cfg.match(/SUPABASE_ANON_KEY = "([^"]+)"/)[1];
const PRIVE = ["CODE-RECETTE-PARTAGE", "PAYEUR-RECETTE", "PRESTA-RECETTE", "NOTE-RECETTE-PRIVEE", "ADRESSE-RECETTE-PRIVEE", "TODO-RECETTE-PRIVE"];

async function appel(chemin, { jeton = CLE, methode = "GET", corps, retour = false } = {}) {
  const rep = await fetch(`${URL_SB}${chemin}`, {
    method: methode,
    headers: { apikey: CLE, Authorization: `Bearer ${jeton}`, "content-type": "application/json", ...(retour ? { Prefer: "return=representation" } : {}) },
    body: corps ? JSON.stringify(corps) : undefined,
  });
  const texte = await rep.text();
  if (!rep.ok) throw new Error(`${methode} ${chemin} -> HTTP ${rep.status} ${texte.slice(0, 200)}`);
  return texte ? JSON.parse(texte) : null;
}
const rpc = (jetonPartage, jeton) => appel("/rest/v1/rpc/voyage_partage", { methode: "POST", corps: { p_jeton: jetonPartage }, jeton });

const session = await appel("/auth/v1/token?grant_type=password", { methode: "POST", corps: { email: env.EMAIL_YANN, password: env.PASS_YANN } });
const membre = session.access_token;
const base = (table, requete = "") => `/rest/v1/${table}${requete}`;
const creer = async (table, ligne) => (await appel(base(table), { jeton: membre, methode: "POST", corps: ligne, retour: true }))[0];

let voyageId = null;
try {
  // 1. Voyage factice, PASSÉ (2020), avec une donnée privée dans chaque table que la page ne doit jamais montrer.
  const voyage = await creer("voyages", { titre: "Recette partage (factice)", lieu: "Nulle part", debut: "2020-01-10", fin: "2020-01-12", note: "NOTE-RECETTE-PRIVEE", cree_par: "recette" });
  voyageId = voyage.id;
  const lieu = await creer("voyage_lieux", { voyage_id: voyageId, nom: "Lieu de recette", categorie: "a_voir", statut: "prevu", jour: "2020-01-10", ordre: 0, lat: 10.5, lng: 20.5,
    lien: "https://exemple.test/recette", topo: "Topo de recette", horaires: "9h-17h", note: "NOTE-RECETTE-PRIVEE", adresse: "ADRESSE-RECETTE-PRIVEE", cree_par: "recette" });
  await creer("voyage_resas", { voyage_id: voyageId, type: "activite", titre: "Résa de recette", statut: "reserve", debut: "2020-01-10T10:00:00", lieu_id: lieu.id,
    code: "CODE-RECETTE-PARTAGE", prix_centimes: 4242, paye_par: "PAYEUR-RECETTE", prestataire: "PRESTA-RECETTE", note: "NOTE-RECETTE-PRIVEE", poste: "activites", cree_par: "recette" });
  await creer("voyage_resas", { voyage_id: voyageId, type: "vol", titre: "Résa annulée de recette", statut: "annule", code: "CODE-RECETTE-PARTAGE", cree_par: "recette" });
  await creer("voyage_blocs", { voyage_id: voyageId, type: "info", titre: "Bloc de recette", texte: "Texte de recette", ordre: 0, cree_par: "recette" });
  await creer("voyage_todos", { voyage_id: voyageId, texte: "TODO-RECETTE-PRIVE", cree_par: "recette" });
  const { jeton } = await creer("voyage_partages", { voyage_id: voyageId, cree_par: "recette" });
  assert.match(jeton, /^[0-9a-f-]{36}$/, "jeton uuid");

  // 2. Bon jeton, ANONYME (clé publique seule) : champs exacts, rien de privé.
  const page = await rpc(jeton);
  assert.deepEqual(Object.keys(page).sort(), ["blocs", "lieux", "resas", "voyage"], "pas de todos, enveloppes ni pièces");
  assert.deepEqual(Object.keys(page.voyage).sort(), [...CHAMPS_VOYAGE].sort());
  assert.equal(page.lieux.length, 1);
  assert.deepEqual(Object.keys(page.lieux[0]).sort(), [...CHAMPS_LIEU].sort());
  assert.equal(page.resas.length, 1, "la résa annulée ne part pas");
  assert.deepEqual(Object.keys(page.resas[0]).sort(), [...CHAMPS_RESA].sort());
  assert.deepEqual(Object.keys(page.blocs[0]).sort(), [...CHAMPS_BLOC].sort());
  assert.equal(page.voyage.titre, "Recette partage (factice)");
  assert.equal(page.resas[0].lieu_id, page.lieux[0].id);
  for (const v of PRIVE) assert.ok(!JSON.stringify(page).includes(v), `la réponse fuit « ${v} »`);
  console.log("bon jeton, anonyme : champs exacts, rien de privé");

  // 3. Mauvais jeton -> null. Un texte qui n'est pas un uuid est refusé par la base (la page le filtre avant).
  assert.equal(await rpc("00000000-0000-4000-8000-000000000000"), null);
  console.log("mauvais jeton : null");

  // 4. L'anonyme ne lit pas la table, ni avec le jeton en filtre.
  assert.deepEqual(await appel(base("voyage_partages", "?select=*")), [], "anonyme : table vide");
  assert.deepEqual(await appel(base("voyage_partages", `?select=*&jeton=eq.${jeton}`)), [], "anonyme : jeton non lisible");
  console.log("anonyme : voyage_partages illisible");

  // 5. Arrêter le partage : l'ancien lien ne marche plus.
  await appel(base("voyage_partages", `?voyage_id=eq.${voyageId}`), { jeton: membre, methode: "DELETE" });
  assert.equal(await rpc(jeton), null);
  console.log("après suppression du jeton : null");
} finally {
  // Toujours défait (cascade : lieux, résas, blocs, todos, jeton), même si une vérification a échoué.
  if (voyageId != null) {
    await appel(base("voyages", `?id=eq.${voyageId}`), { jeton: membre, methode: "DELETE" });
    const reste = await appel(base("voyages", `?id=eq.${voyageId}&select=id`), { jeton: membre });
    assert.deepEqual(reste, [], "le voyage factice doit être supprimé");
    console.log("voyage factice supprimé");
  }
}
console.log("recette partage connectée OK");
