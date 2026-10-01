// Pont Python -> moteur JS pour les virements groupés par trajet (D-048 §3).
// Même principe que calc_cli.mjs : un seul moteur (frontend/budget/groupes-virements.js),
// le bot ne réimplémente jamais le regroupement ni le cycle de la case groupe.
// Entrée attendue : { etat, membres } — `etat` est l'état complet lu par construireGroupes
// (membres, comptes, charges, recurrents, lignes, mouvements), `membres` sert à preparerBasculeGroupe.
// Sortie : { groupes: [...avec preparerBasculeGroupe déjà calculé pour chacun...] }
import { construireGroupes, preparerBasculeGroupe } from "../../frontend/budget/groupes-virements.js";
import { libelleEffectif, libelleACompleter, modeleLibelle } from "../../frontend/budget/libelle-virement.js";

async function lireStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

async function main() {
  const brut = await lireStdin();
  let entree;
  try {
    entree = JSON.parse(brut);
  } catch (e) {
    process.stderr.write(`JSON invalide : ${e.message}\n`);
    process.exit(1);
  }
  const { etat } = entree;
  try {
    const groupes = construireGroupes(etat);
    // `fait_le` d'un groupe : la date de la ligne/mouvement source (construireGroupes ne la
    // recopie pas dans `lignes[].fait_le`, seulement `valeur` = le prénom) — le bot l'affiche
    // dans le statut (« ✓ Claudia · 30/09 »), le frontend n'en a pas besoin (juste la case).
    // Cherchée ici plutôt que dans groupes-virements.js pour ne pas changer le moteur partagé
    // pour un seul besoin d'affichage texte.
    const faitLeDe = (l) => {
      if (l.type === "ligne") return etat.lignes[l.id]?.fait_le ?? null;
      return etat.mouvements.find((m) => m.id === l.id)?.fait_le ?? null;
    };
    // Libellé de virement (D-050) : porté par le compte de destination du GROUPE (pas par
    // ligne) — le bot l'affiche une fois par groupe, comme ui-groupes-virements.js::blocLibelle.
    // La surcharge du mois vit TOUJOURS sur un mouvement réel de `etat.mouvements`, même pour
    // une charge en mode "charge" (D-046 : sa LIGNE porte la validation visible, mais le
    // mouvement existe en base et se coche en parallèle — budget_lignes.py::valider_ligne) —
    // donc on le cherche par trajet directement dans `etat.mouvements`, pas dans `g.lignes`
    // (qui, pour ce mode, ne contient qu'un élément `type: "ligne"`, jamais `"mouvement"`).
    const mvtDuGroupe = (g) => etat.mouvements.find((m) => m.compte_vers === g.vers
      && (m.compte_de ?? (m.qui ? `perso:${m.qui}` : null)) === g.de);
    const libelleDuGroupe = (g) => {
      const compteVers = etat.comptes.find((c) => c.id === g.vers) ?? null;
      const mouvement = mvtDuGroupe(g);
      return {
        libelle: libelleEffectif(mouvement, compteVers),
        libelleACompleter: libelleACompleter(mouvement, compteVers),
        libelleModele: modeleLibelle(compteVers),
      };
    };
    // La bascule groupe n'a de sens que pour un groupe non entièrement fait, ou pour connaître
    // le prochain prénom cible d'un groupe fait (D-048 §3) : calculée pour tous, le bot choisit.
    const resultat = groupes.map((g) => ({
      ...g, bascule: preparerBasculeGroupe(g, etat.membres), ...libelleDuGroupe(g),
      lignes: g.lignes.map((l) => ({ ...l, fait_le: faitLeDe(l) })),
    }));
    process.stdout.write(JSON.stringify({ groupes: resultat }));
  } catch (e) {
    process.stderr.write(`regroupement échoué : ${e.message}\n`);
    process.exit(1);
  }
}

main();
