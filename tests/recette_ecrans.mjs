// Recette hors ligne : sert frontend/ (même petit serveur que recette_visuelle.mjs), bouchonne
// Supabase via addInitScript (aucun réseau réel, aucune écriture en base), visite CHAQUE écran
// de CHAQUE module et capture à 320/360/1200 px. Détecte les débordements horizontaux par
// mesure de géométrie (L-016), échoue sur toute erreur console/pageerror.
// Usage : node tests/recette_ecrans.mjs
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import * as DONNEES from "./donnees_factices.mjs";
import { filtrerPourPartage } from "../frontend/agenda/partage-filtre.js";

const RACINE = path.resolve("frontend");
const SORTIE = path.resolve("data/captures/ecrans");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const LARGEURS = (process.env.RECETTE_LARGEURS ?? "320,360,768,1200").split(",").map(Number); // non-régression, conception, tablette, desktop (règle mobile-parents.md ; 768 : mise en page deux colonnes de la fiche voyage V2, D-047)

/** Jeton INVENTÉ de la page partagée de la recette (la RPC est bouchonnée, aucun réseau). */
const JETON_FACTICE = "11111111-2222-4333-8444-555555555555";

// Stub Leaflet minimal (frontend/agenda/carte.js n'a besoin que de L.map/tileLayer/marker/
// divIcon/featureGroup) : pose un conteneur `.leaflet-container` visible, sans vraie tuile ni
// vraie carte — la recette hors ligne ne doit JAMAIS toucher le vrai cdnjs (voir page.route
// plus bas). `getBounds().pad()` suffisant pour fitBounds sur ≥ 2 marqueurs.
const STUB_LEAFLET_JS = `
window.L = {
  map: (el) => {
    el.classList.add("leaflet-container");
    return {
      setView() { return this; },
      fitBounds() { return this; },
    };
  },
  tileLayer: () => ({ addTo: () => ({}) }),
  divIcon: (opts) => ({ __html: opts.html }),
  marker: (latlng) => ({
    addTo() { return this; },
    bindPopup() { return this; },
    getLatLng: () => ({ lat: latlng[0], lng: latlng[1] }),
  }),
  featureGroup: (marqueurs) => ({
    getBounds: () => ({ pad: () => ({ __marqueurs: marqueurs.length }) }),
  }),
};
`;

/** Ferme le plein écran custom de ui-piece-plein-ecran.js s'il traîne (laissé ouvert par le
 *  geste voyage-qr-plein-ecran) : ce n'est pas `#feuille` du socle, donc invisible à la
 *  fermeture générique entre deux gestes plus bas — même prudence que L-018. Idempotent, sans
 *  effet si rien n'est ouvert. */
async function fermerPieceOrpheline(page) {
  if (await page.locator(".piece-plein-ecran").count()) {
    await page.click(".piece-plein-fermer");
    await page.waitForSelector(".piece-plein-ecran", { state: "hidden", timeout: 3000 });
  }
}

/** Ouvre la fiche du voyage 1 (« Week-end à la mer », en cours) sur l'onglet voulu (D-058). */
async function ouvrirFiche(page, onglet = "planning") {
  await page.click('#voyages-liste-corps [data-voyage="1"]');
  await page.waitForSelector("#feuille-corps [data-fiche-voyage]", { timeout: 5000 });
  if (onglet !== "planning") await choisirOnglet(page, onglet);
}

/** Ouvre la fiche avec une copie du lien interceptée (navigator.share absent : repli « copie »). */
async function preparerPartage(page) {
  await page.evaluate(() => {
    Object.defineProperty(navigator, "share", { value: undefined, configurable: true });
    window.__copie = null;
    navigator.clipboard.writeText = async (texte) => { window.__copie = texte; };
  });
  await ouvrirFiche(page, "planning");
}

/** Aucune valeur privée du voyage factice (codes, notes, adresses, prix) dans `texte`. */
function verifierSansPrive(texte, quoi) {
  const montants = DONNEES.VOYAGE_RESAS.filter((r) => r.prix_centimes != null).map((r) => (r.prix_centimes / 100).toFixed(2).replace(".", ","));
  const prives = [...DONNEES.VOYAGE_RESAS.flatMap((r) => [r.code, r.note]), ...DONNEES.VOYAGE_LIEUX.flatMap((l) => [l.note, l.adresse]), ...montants].filter(Boolean);
  for (const v of prives) if (texte.includes(v)) throw new Error(`${quoi} : valeur privée « ${v.slice(0, 30)} »`);
}

/** Tape un onglet de la fiche et attend son panneau (la carte : son cadre Leaflet ou le message). */
async function choisirOnglet(page, onglet) {
  await page.click(`#fiche-onglets-corps [data-onglet="${onglet}"]`);
  await page.waitForSelector(`#fiche-${onglet}-panneau:not([hidden])`, { timeout: 3000 });
  if (onglet === "carte") await page.waitForSelector(".leaflet-container, .carte-indisponible", { timeout: 8000 });
  await page.waitForTimeout(150);
}

/** Mesures de la fiche affichée : cibles tactiles >= 48 px, contraste des textes de statut >= 4.5:1.
 *  Une mesure, pas un coup d'œil (L-016) ; lève une erreur qui range le geste parmi les écrans cassés. */
async function verifierFiche(page) {
  const defauts = await page.evaluate(() => {
    const defauts = [];
    const nom = (el) => `${el.tagName.toLowerCase()}.${[...el.classList].join(".")}`;
    const CIBLES = ".fv-onglet, .fv-jc, .fv-act > summary, .fv-repli > summary, .fv-choix, .fv-btn, .fv-code, .fv-todo-suppr, .fv-todo-lien, "
      + ".fv-todo, .fv-jour-choix .champ, .fv-todo-form .champ, .fv-todo-form .btn, .bandeau-retour, .bandeau-partager, .fv-partage .btn";
    for (const el of document.querySelectorAll(CIBLES)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      if (r.width < 47.5 || r.height < 47.5) defauts.push(`cible ${nom(el)} ${Math.round(r.width)}x${Math.round(r.height)} px`);
    }
    // La case à cocher mesure 26 px mais sa zone de tap (::before, 48 x 48) doit répondre au toucher.
    for (const c of document.querySelectorAll(".fv-todo .case")) {
      const r = c.getBoundingClientRect();
      const [cx, cy] = [r.left + r.width / 2, r.top + r.height / 2];
      if (cy < 24 || cy > window.innerHeight - 24) continue;
      for (const [dx, dy] of [[-22, -22], [22, -22], [-22, 22], [22, 22]]) {
        if (document.elementFromPoint(cx + dx, cy + dy)?.closest(".case") !== c) { defauts.push("zone de tap de la case < 48 px"); break; }
      }
    }
    const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    const luminance = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
    const couleur = (c) => c.match(/[\d.]+/g).map(Number);
    const fond = (el) => {
      for (let e = el; e; e = e.parentElement) { const c = couleur(getComputedStyle(e).backgroundColor); if ((c[3] ?? 1) > 0.5) return c; }
      return [255, 255, 255];
    };
    const TEXTES = ".fv-statut, .fv-leg, .fv-jc-s, .fv-choix[aria-pressed='true'], .fv-meteo, .fv-conseil, .fv-item-d, .fv-act-d, .fv-detail, "
      + ".fv-mention, .fv-jour-titre, .fv-onglet, .fv-fait, .fv-todo-lien";
    for (const el of document.querySelectorAll(TEXTES)) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const [a, b] = [luminance(couleur(getComputedStyle(el).color)), luminance(fond(el))].sort((x, y) => y - x);
      const ratio = (a + 0.05) / (b + 0.05);
      if (ratio < 4.5) defauts.push(`contraste ${nom(el)} ${ratio.toFixed(2)}:1`);
    }
    return defauts;
  });
  if (defauts.length) throw new Error(`fiche : ${[...new Set(defauts)].slice(0, 6).join(" ; ")}`);
}

/** Open-Meteo bouchonné (aucun réseau réel) : par jour demandé, pluie nette sur 4 modèles, puis sec,
 *  puis pluie sur 2 modèles sur 4 (incertain), un modèle muet le 3e jour. Valeurs inventées. */
async function bouchonnerMeteo(page) {
  await page.route("**/api.open-meteo.com/**", (route) => {
    const q = new URL(route.request().url()).searchParams;
    const modeles = q.get("models").split(",");
    const jours = [];
    for (let j = new Date(`${q.get("start_date")}T12:00:00Z`); j <= new Date(`${q.get("end_date")}T12:00:00Z`); j.setUTCDate(j.getUTCDate() + 1)) jours.push(j.toISOString().slice(0, 10));
    const daily = { time: jours };
    modeles.forEach((m, k) => {
      daily[`weather_code_${m}`] = jours.map((_, i) => [63, 1, 61][i % 3]);
      daily[`temperature_2m_max_${m}`] = jours.map((_, i) => [12, 17, 14][i % 3] + k);
      daily[`temperature_2m_min_${m}`] = jours.map((_, i) => [8, 7, 9][i % 3]);
      daily[`precipitation_sum_${m}`] = jours.map((_, i) => [[9, 8, 12, 10], [0, 0, 0, 0], [3, 2, 0, 0]][i % 3][k]);
    });
    route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ daily }) });
  });
}

/** Ferme ce qu un geste laisse ouvert : la feuille du socle, ou la fiche voyage qu un formulaire a rouverte
 *  (revenirALaFiche). Appelée après un geste réussi ET après un geste en échec — sans quoi un seul geste
 *  cassé laissait la feuille ouverte et faisait échouer tous les suivants (cascade de faux « écrans cassés »). */
async function fermerFeuillesOuvertes(page) {
  for (let tentative = 0; tentative < 4; tentative++) {
    const ficheVisible = await page.locator("#feuille [data-fiche-voyage]").count();
    if (ficheVisible) await page.click("#feuille [data-retour-voyages]");
    else if (await page.locator("#feuille:not([hidden])").count()) {
      await page.evaluate(() => document.getElementById("feuille-fond").click());
    } else break; // déjà fermée
    await page.waitForTimeout(200); // laisse fermerFeuille + un éventuel onFermer async se dérouler
    if (!(await page.locator("#feuille:not([hidden])").count())) break; // fermée pour de bon
  }
}

// Mise au point : RECETTE_LARGEURS="360" et RECETTE_GESTES="^voyage-fiche" ne rejouent que ce qu'on regarde.
const VERBEUX = Boolean(process.env.RECETTE_VERBEUX); // une ligne par étape : voir où une recette s'enlise
const FILTRE_GESTES = process.env.RECETTE_GESTES ? new RegExp(process.env.RECETTE_GESTES) : null;

// Les feuilles modales ne s'ouvrent que par un geste : on les visite explicitement, sinon
// elles échappent à toute capture et la recette valide des écrans qu'elle n'a jamais vus.
// Plusieurs feuilles par largeur : chacune est refermée par un clic DOM direct sur le voile
// (`#feuille-fond.click()` en page.evaluate), pas par un geste Playwright — le geste était
// avalé par la transition de sortie (L-026). On attend ensuite la preuve que la feuille est
// cachée avant d'ouvrir la suivante (L-018).
const FEUILLES = [
  { ecran: "jour", moduleDefaut: "jour", bouton: "#btn-ajouter-tache", nom: "feuille-ajout-tache" },
  { ecran: "jour", moduleDefaut: "jour", bouton: "#btn-todo", nom: "feuille-todo" },
  { ecran: "courses", moduleDefaut: "courses", bouton: "#btn-tour", nom: "feuille-tour" },
  { ecran: "mois", moduleDefaut: "mois", bouton: "#fab-ajouter-mois", nom: "feuille-ajout-mois" },
  { ecran: "voyages", moduleDefaut: "taches-rec", bouton: "#form-voyage [data-nouveau]", nom: "feuille-ajout-voyage" },
  { ecran: "taches-rec", moduleDefaut: "taches-rec", bouton: "#btn-aide-parts", nom: "feuille-aide-parts" },
  { ecran: "alertes", moduleDefaut: "voyages-liste", bouton: "#form-alerte [data-nouveau]", nom: "feuille-ajout-alerte" },
  { ecran: "alertes", moduleDefaut: "voyages-liste", bouton: '#liste-alertes [data-modifier="1"]', nom: "feuille-modif-alerte" },
];

// États qu'un geste révèle SANS feuille : le mois suivant de l'Agenda (les données factices y
// posent vacances, voyage et férié, le mois courant peut n'en avoir aucun) et l'aide à la saisie
// des Courses, qui n'apparaît que lorsque le champ Article a le focus. Même raison que FEUILLES.
const GESTES = [
  { ecran: "agenda-mois", moduleDefaut: "agenda-mois", nom: "agenda-mois-suivant",
    // Deux mois plus loin : les données factices y posent à la fois des vacances, un voyage et,
    // selon la date du jour, un férié — la grille montre alors ses trois marques.
    geste: async (page) => { await page.click("#agenda-suiv"); await page.click("#agenda-suiv"); await page.waitForTimeout(150); } },
  // Détail d'une tâche faite à deux : la part de chacun (plein · ⅔ · ⅓, D-038).
  { ecran: "jour", moduleDefaut: "jour", nom: "detail-tache-a-deux",
    geste: async (page) => {
      await page.evaluate(() => { const b = document.querySelector("#bouton-plier-faites"); if (b?.getAttribute("aria-expanded") === "false") b.click(); });
      await page.waitForTimeout(100);
      await page.evaluate(() => {
        const l = [...document.querySelectorAll("#liste-faites-jour .ligne-tache[data-id]")].find((x) => x.querySelector(".case-cycle-deux"));
        l?.click();
      });
      await page.waitForSelector(".detail-partage", { timeout: 3000 });
    } },
  // Réglage d'une charge (tap n'importe où sur sa ligne, écran Mois) : le choix de répartition
  // à quatre options n'apparaît que là (D-039). Feuille sur mobile, colonne de droite sur PC.
  // Tap à une COORDONNÉE réelle dans le libellé (pas page.click sur le sélecteur, qui viserait
  // son propre centre même si la zone de tap avait rétréci) : reproduit le bug remonté par
  // Yann après D-046, où la zone de tap élargie de `.case` (::before, inset -11px) volait la
  // bande juste à droite de la case et un bouton étroit autour du seul texte laissait un blanc
  // mort avant le champ montant — un tap sur la ligne, hors case et hors champ, n'ouvrait plus
  // rien nulle part sur la ligne.
  // Liste unifiée (D-052), vue Catégories : un groupe de charges se déplie au tap, puis le tap
  // sur une ligne dépliée ouvre sa feuille de réglage.
  { ecran: "mois", moduleDefaut: "mois", nom: "reglage-charge",
    geste: async (page) => {
      await page.click('#mois-vue-charges [data-vue-charges="categories"]');
      // Le premier groupe est toujours « Virements » (groupes-categories.js, CLE_VIREMENTS en
      // tête) : ses lignes sont des MOUVEMENTS (ouvrent le détail du mouvement, pas la feuille
      // de réglage) — on cible donc un groupe de CATÉGORIE DE CHARGE, jamais le premier venu.
      const groupeCharge = page.locator('#mvts-a-faire [data-ml-groupe]:not([data-ml-groupe*="__virements__"])').first();
      await groupeCharge.click();
      // `.click()` sur le LIBELLÉ via un locator (pas des coordonnées manuelles, L-016) : Playwright
      // scrolle et vérifie lui-même qu'aucun élément `position:fixed` (le FAB « + Ajouter », en
      // bas de l'écran) ne recouvre la cible avant de taper — une ligne dépliée en bas de liste
      // peut tomber sous le FAB selon le défilement, un clic à coordonnées fixes le découvrirait
      // trop tard (silencieux : le FAB absorbe le tap, la feuille attendue n'ouvre jamais).
      const libelle = page.locator("#mvts-a-faire .ml-element.mois-charge .mc-libelle").first();
      if (!(await libelle.count())) throw new Error("reglage-charge : ligne de charge introuvable.");
      await libelle.click();
      await page.waitForSelector("form.reglages", { state: "visible", timeout: 3000 });
      await page.waitForTimeout(250); // la feuille glisse en 200 ms
    } },
  // Même feuille ouverte depuis Réglages · Charges (toujours en feuille, même sur PC : cet
  // écran n'a pas de colonne de droite).
  { ecran: "charges-ref", moduleDefaut: "taches-rec", nom: "reglage-charge-ref",
    geste: async (page) => {
      await page.click("#charges-ref-corps .ligne-charge-ref");
      await page.waitForSelector("#feuille form.reglages", { state: "visible", timeout: 3000 });
      await page.waitForTimeout(250);
    } },
  // « Remplir avec les montants habituels » (D-040) : le bandeau disparaît, les montants
  // manquants sont écrits, les virements se recalculent.
  { ecran: "mois", moduleDefaut: "mois", nom: "mois-apres-remplir",
    geste: async (page) => {
      await page.click("#mois-a-completer [data-remplir]");
      await page.waitForFunction(() => !document.querySelector("#mois-a-completer .a-completer"), null, { timeout: 3000 });
    } },
  // Mode Destinataires du sélecteur Catégories | Destinataires (Yann : « regroupe par compte
  // vers où on déplace, de CB on a besoin de X »). Les charges factices posent un trajet
  // (Crédit immobilier → Compte Yann) et des charges qui restent sur le commun : au moins une
  // carte de trajet et la carte « reste sur le commun ».
  { ecran: "mois", moduleDefaut: "mois", nom: "mois-destinataires",
    geste: async (page) => {
      // Destinataires est la vue par défaut (D-052) : la reprendre explicitement après le geste
      // précédent (qui a basculé sur Catégories), rien à attendre d'autre que le re-rendu.
      await page.click('#mois-vue-charges [data-vue-charges="destinataires"]');
      await page.waitForSelector("#mvts-a-faire .gv-groupe, #mvts-faits .gv-groupe", { timeout: 3000 });
      await page.waitForTimeout(100);
    } },
  // Groupe de virements dont le compte de destination est VARIABLE et sans valeur ce mois
  // (D-050, Compte École dans donnees_factices.mjs) : déplié (tap sur la ligne, hors case,
  // D-052), il montre en ligne le bandeau ambre « Libellé à compléter ce mois », champ
  // pré-rempli du modèle, bouton Enregistrer — plus une feuille de détail séparée depuis D-052.
  { ecran: "mois", moduleDefaut: "mois", nom: "detail-groupe-libelle-a-completer",
    geste: async (page) => {
      await page.click('#mois-vue-charges [data-vue-charges="destinataires"]');
      const groupe = page.locator("#mvts-a-faire .gv-groupe, #mvts-faits .gv-groupe").filter({ hasText: "École" }).first();
      await groupe.scrollIntoViewIfNeeded();
      // Tap dans le corps du texte (.mvt-corps), jamais au centre de l'élément entier : la case
      // cycle (::before élargi, D-048) occupe la zone de gauche et volerait le clic (même piège
      // que reglage-charge plus haut).
      const corps = await groupe.locator(".mvt-corps").boundingBox();
      if (!corps) throw new Error("detail-groupe-libelle-a-completer : groupe École introuvable.");
      await page.mouse.click(corps.x + corps.width / 2, corps.y + corps.height / 2);
      await page.waitForSelector(".ml-groupe.ouvert .gv-libelle-manquant", { timeout: 3000 });
      await page.waitForTimeout(150);
    } },
  // Réserve relais (D-054, Assurance auto -> Livret réserve -> Assureur auto dans
  // donnees_factices.mjs) : groupe de trajet déplié, la ligne de charge montre la deuxième case
  // de paiement (le récurrent factice a son relais_depart posé sur le mois courant) — la
  // capture doit montrer À LA FOIS le repère « Mis de côté… » (ligne de charge) ET la case
  // « Payer… » (mois de paiement), les deux états demandés par le brief.
  { ecran: "mois", moduleDefaut: "mois", nom: "mois-reserve-paiement",
    geste: async (page) => {
      await page.click('#mois-vue-charges [data-vue-charges="destinataires"]');
      // Un groupe laissé ouvert par un geste précédent (École, detail-groupe-libelle-a-completer)
      // décale la position du groupe visé et peut glisser sous le FAB fixe (L-016 piège connu de
      // ce fichier) : le refermer d'abord, comme reglage-charge referme son propre état avant de
      // rouvrir ailleurs.
      for (const ouvert of await page.locator(".ml-groupe.ouvert [data-ml-groupe]").all()) await ouvert.click();
      const groupe = page.locator("#mvts-a-faire .gv-groupe, #mvts-faits .gv-groupe").filter({ hasText: "Livret réserve" }).first();
      await groupe.locator(".mvt-corps").click();
      await page.waitForSelector(".ml-groupe.ouvert .mc-paiement", { timeout: 3000 });
      await page.waitForTimeout(150);
    } },
  // Virement automatique (D-057, Épargne mensuelle -> Livret épargne dans donnees_factices.mjs) :
  // la section « Fait » dépliée montre le groupe sans case, avec « Automatique », puis le groupe
  // déplié montre son élément de même (« Automatique » à la place de « ✓ prénom · date »).
  { ecran: "mois", moduleDefaut: "mois", nom: "mois-virement-automatique",
    geste: async (page) => {
      await page.click('#mois-vue-charges [data-vue-charges="destinataires"]');
      if (await page.locator("#mvts-faits").isHidden()) await page.click("#fait-tete");
      const groupe = page.locator("#mvts-faits .gv-groupe").filter({ hasText: "Livret épargne" }).first();
      await groupe.scrollIntoViewIfNeeded();
      await groupe.locator(".mvt-corps").click();
      await page.waitForSelector("#mvts-faits .ml-groupe.ouvert .mc-auto", { timeout: 3000 });
      const cases = await page.locator("#mvts-faits .ml-groupe.ouvert [data-cycle], #mvts-faits .ml-groupe.ouvert [data-cycle-ligne], #mvts-faits .ml-groupe.ouvert [data-cycle-mouvement]").count();
      if (cases) throw new Error(`mois-virement-automatique : ${cases} case(s) cochable(s) sur un virement automatique.`);
      await page.waitForTimeout(150);
    } },
  // Fiche d'une tâche (D-041) : Réglages · Tâches, tap sur une ligne.
  { ecran: "taches-rec", moduleDefaut: "taches-rec", nom: "fiche-tache",
    geste: async (page) => {
      await page.click('#tableau-taches-parts [data-ouvrir="30"]');
      await page.waitForSelector("#feuille:not([hidden]) [data-reglages-form]", { timeout: 3000 });
      await page.waitForTimeout(250);
    } },
  // Détail d'une tâche à étapes : une case par étape, l'étape facultative en « + ».
  { ecran: "jour", moduleDefaut: "jour", nom: "detail-tache-etapes",
    geste: async (page) => {
      await page.evaluate(() => [...document.querySelectorAll("#cartes-moment .ligne-tache")]
        .find((l) => l.textContent.includes("Débarrasser"))?.click());
      await page.waitForSelector(".detail-etapes", { timeout: 3000 });
      await page.waitForTimeout(250);
    } },
  { ecran: "courses", moduleDefaut: "courses", nom: "courses-aide-saisie",
    geste: async (page) => { await page.focus("#course-libelle"); await page.waitForSelector("#aide-articles:not([hidden])", { timeout: 3000 }); } },
  // Feuille d'ajout d'une charge (D-043), ouverte depuis Réglages · Charges.
  { ecran: "charges-ref", moduleDefaut: "taches-rec", nom: "charges-ajout",
    geste: async (page) => {
      await page.click("#charges-ref-corps [data-ajouter-charge]");
      await page.waitForSelector("#feuille form#form-ajout-charge", { state: "visible", timeout: 3000 });
      await page.waitForTimeout(250); // la feuille glisse en 200 ms
    } },
  // Carte « Terminées » dépliée (D-043) : les données factices y posent une charge (Ancienne
  // box internet, catégorie Logement, sans ligne ce mois).
  { ecran: "charges-ref", moduleDefaut: "taches-rec", nom: "charges-terminees",
    geste: async (page) => {
      await page.click("#charges-ref-corps [data-plier-terminees]");
      await page.waitForSelector("#charges-ref-corps .ct-liste:not([hidden])", { timeout: 3000 });
    } },
  // ---------- Voyages · Alertes (D-056) : ajout d'une destination par sa ville, bas du formulaire ----------
  { ecran: "alertes", moduleDefaut: "voyages-liste", nom: "alerte-ajout-destination",
    geste: async (page) => {
      await page.click('#liste-alertes [data-modifier="1"]');
      await page.waitForSelector("#feuille-corps [data-ville]", { timeout: 5000 });
      await page.fill("#feuille-corps [data-ville]", "Petite-Ville · Pays H (HHH)");
      await page.click("#feuille-corps [data-ajouter-ville]");
      await page.waitForSelector('#feuille-corps [data-retirer-code="HHH"]', { timeout: 3000 });
      await page.evaluate(() => { const f = document.querySelector("#feuille"); f.scrollTop = f.scrollHeight; });
      await page.waitForTimeout(150);
    } },
  // ---------- fiche voyage V3 (D-058) : bandeau, légende, feuille de route, cinq onglets ----------
  // Fiche du voyage 1 (« Week-end à la mer », 4 jours, en cours) : un geste par onglet, chacun
  // mesuré (cibles >= 48 px, contraste >= 4.5:1, ordre vertical) AVANT la capture — une capture se
  // regarde, une mesure se rejoue (L-016). La feuille plein écran défile elle-même : le geste
  // amène l'onglet en haut pour que la capture montre ce qu'on y voit.
  { ecran: "voyages-liste", moduleDefaut: "agenda-mois", nom: "voyage-fiche",
    geste: async (page) => {
      await ouvrirFiche(page, "planning");
      await verifierFiche(page);
      if (page.viewportSize()?.width === 360) {
        const tops = await page.evaluate(() => ["#fiche-bandeau-corps", "#fiche-legende-corps", "#fiche-route-corps", "#fiche-onglets-corps", "#fiche-planning-corps"]
          .map((s) => ({ s, top: document.querySelector(s)?.getBoundingClientRect().top ?? null })));
        for (let i = 0; i < tops.length; i++) {
          if (tops[i].top == null) throw new Error(`ordre mobile : ${tops[i].s} introuvable`);
          if (i && tops[i].top <= tops[i - 1].top) throw new Error(`ordre mobile : ${tops[i].s} (top=${tops[i].top}) n'est pas sous ${tops[i - 1].s} (top=${tops[i - 1].top})`);
        }
      }
      // Lot 3 : « Partager » est dans le bandeau, visible, cible >= 48 px (mesurée par verifierFiche).
      if (!(await page.locator("#fiche-bandeau-corps [data-partager]").isVisible())) throw new Error("bandeau : bouton Partager invisible");
      // 4 jours du voyage = 4 cartes de feuille de route, SANS météo (écart voulu au brief).
      const nbJours = await page.locator("#fiche-route-corps .fv-jc").count();
      if (nbJours !== 4) throw new Error(`feuille de route : ${nbJours} cartes, attendu 4`);
      if (await page.locator("#fiche-route-corps .fv-meteo").count()) throw new Error("feuille de route : une météo est affichée, elle n'a rien à y faire");
    } },
  { ecran: "voyages-liste", moduleDefaut: "agenda-mois", nom: "voyage-fiche-planning",
    geste: async (page) => {
      await ouvrirFiche(page, "planning");
      await page.waitForSelector("#fiche-planning-corps .fv-meteo", { timeout: 5000 }); // météo (bouchonnée) arrivée
      await page.locator("#fiche-onglets-corps").evaluate((el) => el.scrollIntoView({ block: "start" }));
      await verifierFiche(page);
      // Le gîte (lieu logement lié à sa résa) ne doit pas doubler la nuit le jour d'arrivée.
      const doublons = await page.locator("#fiche-planning-corps .fv-jour").first().locator(".fv-item-n", { hasText: /^Gîte les Embruns$/ }).count();
      if (doublons > 0) throw new Error(`planning : le gîte apparaît ${doublons} fois en élément du 1er jour (doublon avec la nuit)`);
      if (!(await page.locator("#fiche-planning-corps .fv-conseil").count())) throw new Error("planning : aucun conseil « Prévoir la pluie » alors qu'un jour est pluvieux");
    } },
  { ecran: "voyages-liste", moduleDefaut: "agenda-mois", nom: "voyage-fiche-activites",
    geste: async (page) => {
      await ouvrirFiche(page, "activites");
      // Deux cartes dépliées : le lieu payé (résa, prix, code) et celui qui a photo, topo, horaires.
      await page.click('#fiche-lieux-corps details[data-lieu="3"] > summary');
      await page.click('#fiche-lieux-corps details[data-lieu="1"] > summary');
      await page.waitForTimeout(200);
      await verifierFiche(page);
      for (const statut of ["paye", "acte", "possible"]) {
        if (!(await page.locator(`#fiche-lieux-corps .fv-groupe .fv-statut.fv-${statut}`).count())) throw new Error(`activités : groupe ${statut} absent`);
      }
    } },
  { ecran: "voyages-liste", moduleDefaut: "agenda-mois", nom: "voyage-fiche-activites-ecartes",
    geste: async (page) => {
      await ouvrirFiche(page, "activites");
      await page.click("#fiche-lieux-corps [data-repli-ecartes] > summary");
      await page.evaluate(() => document.querySelector("#fiche-lieux-corps [data-repli-ecartes]")?.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(150);
    } },
  { ecran: "voyages-liste", moduleDefaut: "agenda-mois", nom: "voyage-onglet-carte",
    geste: async (page) => {
      await ouvrirFiche(page, "carte");
      // Écartés masqués : 4 lieux localisés non écartés (la cabane écartée n'est pas sur la carte).
      const legende = await page.locator("#fiche-carte-corps .carte-legende").innerText();
      for (const mot of ["Payé", "Acté", "Possible"]) if (!legende.includes(mot)) throw new Error(`carte : légende sans « ${mot} » : ${legende}`);
      await verifierFiche(page);
    } },
  { ecran: "voyages-liste", moduleDefaut: "agenda-mois", nom: "voyage-fiche-todos",
    geste: async (page) => {
      await ouvrirFiche(page, "afaire");
      await verifierFiche(page);
      const nb = await page.locator("#fiche-todos-corps .fv-todo").count();
      if (nb !== 3) throw new Error(`à faire : ${nb} lignes, attendu 3`);
      if ((await page.locator("#fiche-onglets-corps .fv-badge").innerText()) !== "2") throw new Error("à faire : la pastille de l'onglet ne dit pas 2");
    } },
  { ecran: "voyages-liste", moduleDefaut: "agenda-mois", nom: "voyage-fiche-infos",
    geste: async (page) => {
      await ouvrirFiche(page, "infos");
      await page.waitForTimeout(200);
      // « Modifier » d'une résa : lien texte, mais zone tactile réelle >= 48x48 (relecture §D).
      const boite = await page.locator("#fiche-resas-corps .lr-modifier").first().boundingBox();
      if (!boite || boite.width < 48 || boite.height < 48) {
        throw new Error(`« Modifier » d'une résa : zone tactile ${boite ? `${Math.round(boite.width)}x${Math.round(boite.height)}` : "introuvable"}, attendu >= 48x48`);
      }
      await verifierFiche(page);
    } },
  { ecran: "voyages-liste", moduleDefaut: "agenda-mois", nom: "voyage-infos-blocs",
    geste: async (page) => {
      await ouvrirFiche(page, "infos");
      await page.evaluate(() => document.querySelector("#fiche-blocs-corps")?.scrollIntoView({ block: "start" }));
      await page.waitForTimeout(150);
    } },
  // Tap sur un jour de la feuille de route : l'onglet Planning s'ouvre sur CE jour.
  { ecran: "voyages-liste", moduleDefaut: "agenda-mois", nom: "voyage-route-tap",
    geste: async (page) => {
      await ouvrirFiche(page, "infos");
      const jour = await page.locator("#fiche-route-corps .fv-jc").nth(2).getAttribute("data-jour");
      await page.locator("#fiche-route-corps .fv-jc").nth(2).click();
      await page.waitForSelector("#fiche-planning-panneau:not([hidden])", { timeout: 3000 });
      await page.waitForTimeout(400);
      const haut = await page.evaluate((j) => document.getElementById(`fv-jour-${j}`)?.getBoundingClientRect().top ?? null, jour);
      // Le planning est court : le défilement s'arrête en bas de page, le jour ne peut pas toujours monter
      // tout en haut — on exige qu'il soit à l'écran (et non resté hors champ, comme avant le tap).
      if (haut == null || haut < 0 || haut > 600) throw new Error(`feuille de route : le jour ${jour} n'est pas à l'écran après le tap (top=${haut})`);
    } },
  // Changer le statut d'un lieu : Marché (Possible) -> Acté, écriture immédiate, la carte change de groupe.
  { ecran: "voyages-liste", moduleDefaut: "agenda-mois", nom: "voyage-statut-lieu",
    geste: async (page) => {
      await ouvrirFiche(page, "activites");
      await page.click('#fiche-lieux-corps details[data-lieu="2"] > summary');
      await page.click('#fiche-lieux-corps details[data-lieu="2"] [data-choix-statut="2"][data-statut="acte"]');
      await page.waitForSelector('#fiche-lieux-corps details.fv-acte[data-lieu="2"]', { timeout: 3000 });
      const ecrit = await page.evaluate(() => window.__bouchonTables.voyage_lieux.find((l) => l.id === 2)?.statut);
      if (ecrit !== "prevu") throw new Error(`statut du lieu 2 écrit « ${ecrit} », attendu « prevu »`);
      // Choisir le jour : la même carte, jour changé, écrit en base.
      await page.selectOption('#fiche-lieux-corps details[data-lieu="2"] [data-choisir-jour="2"]', { index: 1 });
      await page.waitForTimeout(150);
      const jour = await page.evaluate(() => window.__bouchonTables.voyage_lieux.find((l) => l.id === 2)?.jour);
      if (!jour) throw new Error("choix du jour : rien écrit pour le lieu 2");
      await page.locator('#fiche-lieux-corps details[data-lieu="2"]').evaluate((el) => el.scrollIntoView({ block: "center" }));
    } },
  // « Payé » : le formulaire de résa existant, pré-rempli et lié au lieu.
  { ecran: "voyages-liste", moduleDefaut: "agenda-mois", nom: "voyage-payer-lieu",
    geste: async (page) => {
      await ouvrirFiche(page, "activites");
      await page.click('#fiche-lieux-corps details[data-lieu="7"] > summary');
      await page.click('#fiche-lieux-corps details[data-lieu="7"] [data-choix-statut="7"][data-statut="paye"]');
      await page.waitForSelector("#feuille [data-form-resa]", { timeout: 3000 });
      const v = await page.evaluate(() => ({ titre: document.querySelector('[data-form-resa] [name="titre"]').value, lieu: document.querySelector('[data-form-resa] [name="lieu_id"]').value }));
      if (v.titre !== "Vieille ville" || v.lieu !== "7") throw new Error(`résa pré-remplie : titre « ${v.titre} », lieu « ${v.lieu} », attendu « Vieille ville » / 7`);
      await page.waitForTimeout(150);
    } },
  // À faire : cocher une ligne (écrit fait_le + fait_par), ajouter une ligne.
  { ecran: "voyages-liste", moduleDefaut: "agenda-mois", nom: "voyage-todo-actions",
    geste: async (page) => {
      await ouvrirFiche(page, "afaire");
      await page.click('#fiche-todos-corps [data-cocher="2"]');
      await page.waitForSelector('#fiche-todos-corps .fv-todo.fait[data-todo="2"]', { timeout: 3000 });
      const t = await page.evaluate(() => window.__bouchonTables.voyage_todos.find((x) => x.id === 2));
      if (!t.fait_le || t.fait_par !== "Yann") throw new Error(`todo cochée : fait_le=${t.fait_le} fait_par=${t.fait_par}, attendu une date et « Yann »`);
      await page.fill('#fiche-todos-corps [data-form-todo] [name="texte"]', "Vérifier la marée");
      await page.click('#fiche-todos-corps [data-form-todo] button[type="submit"]');
      await page.waitForSelector("#fiche-todos-corps .fv-todo-t >> text=Vérifier la marée", { timeout: 3000 });
      if ((await page.locator("#fiche-onglets-corps .fv-badge").innerText()) !== "2") throw new Error("à faire : pastille attendue 2 (1 cochée, 1 ajoutée)");
      await verifierFiche(page);
    } },
  // Édition d'un bloc (D-047 §V2, brief lot F point 8) : crayon du bloc Astuce -> feuille.
  { ecran: "voyages-liste", moduleDefaut: "agenda-mois", nom: "voyage-bloc-edition",
    geste: async (page) => {
      await ouvrirFiche(page, "infos");
      await page.click("#fiche-blocs-corps [data-modifier-bloc]");
      await page.waitForSelector("#feuille [data-form-bloc]", { timeout: 5000 });
      await page.waitForTimeout(150);
    } },
  // Cadrer le budget (brief lot F point 3) : les 6 postes, un montant chacun.
  { ecran: "voyages-liste", moduleDefaut: "agenda-mois", nom: "voyage-cadrer-budget",
    geste: async (page) => {
      await ouvrirFiche(page, "infos");
      await page.click("#fiche-budget-corps [data-cadrer-budget]");
      await page.waitForSelector("#feuille [data-form-enveloppes]", { timeout: 5000 });
      await page.waitForTimeout(150);
    } },
  // Cocher une dépense (brief lot F point 4) : la case de la résa 4 (vol retour) bascule d'un tap.
  { ecran: "voyages-liste", moduleDefaut: "agenda-mois", nom: "voyage-cocher-depense",
    geste: async (page) => {
      await ouvrirFiche(page, "infos");
      await page.click('#fiche-resas-corps [data-cocher-resa="4"]');
      await page.waitForFunction(() => document.querySelector('#fiche-resas-corps [data-resa="4"] .case')?.classList.contains("cochee"), null, { timeout: 3000 });
      await page.waitForTimeout(150);
    } },
  // Pièce (billet du vol) ouverte en plein écran fond blanc, bouton Fermer 48 px.
  { ecran: "voyages-liste", moduleDefaut: "agenda-mois", nom: "voyage-qr-plein-ecran",
    geste: async (page) => {
      await ouvrirFiche(page, "infos");
      await page.click("#fiche-resas-corps [data-ouvrir-piece]");
      await page.waitForSelector(".piece-plein-ecran img", { timeout: 5000 });
    } },
  // + Lieu, résultats de géocodage bouchonnés : trois propositions à choisir, sans toucher au réseau.
  { ecran: "voyages-liste", moduleDefaut: "agenda-mois", nom: "voyage-ajout-lieu",
    geste: async (page) => {
      // Le geste précédent (voyage-qr-plein-ecran) laisse un plein écran custom ouvert : sans ce
      // nettoyage l'overlay opaque masque tout ce geste-ci (L-018).
      await fermerPieceOrpheline(page);
      await page.route("**/nominatim.openstreetmap.org/**", (route) => route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify([
          { display_name: "Aquarium de La Rochelle, 17000 La Rochelle", lat: "46.1556", lon: "-1.1511", type: "attraction" },
          { display_name: "Aquarium de Trouville, 14360 Trouville-sur-Mer", lat: "49.3707", lon: "0.0814", type: "attraction" },
        ]),
      }));
      await ouvrirFiche(page, "activites");
      await page.click("#fiche-lieux-corps [data-nouveau-lieu]");
      await page.waitForSelector("#feuille [data-form-lieu]", { timeout: 5000 });
      await page.fill('#feuille [data-form-lieu] [name="nom"]', "Aquarium de Trouville");
      await page.click("#feuille [data-form-lieu] [data-chercher-position]");
      await page.waitForSelector("#feuille #lieu-resultats-recherche .choix-detaille", { timeout: 5000 });
      await page.waitForTimeout(150);
    } },
  // Retour sur la fiche après un sous-écran : + Lieu -> Ajouter rouvre la fiche SUR Activités avec
  // le nouveau lieu ; + Dépense -> fermeture par le voile rouvre la fiche (jamais la liste des voyages).
  { ecran: "voyages-liste", moduleDefaut: "agenda-mois", nom: "voyage-retour-fiche",
    geste: async (page) => {
      await page.route("**/nominatim.openstreetmap.org/**", (route) => route.fulfill({
        status: 200, contentType: "application/json",
        body: JSON.stringify([{ display_name: "Phare de Biarritz, 64200 Biarritz", lat: "43.4832", lon: "-1.5586", type: "attraction" }]),
      }));
      await ouvrirFiche(page, "activites");
      await page.click("#fiche-lieux-corps [data-nouveau-lieu]");
      await page.waitForSelector("#feuille [data-form-lieu]", { timeout: 5000 });
      await page.fill('#feuille [data-form-lieu] [name="nom"]', "Phare de Biarritz");
      await page.click("#feuille [data-form-lieu] [data-chercher-position]");
      await page.waitForSelector("#feuille #lieu-resultats-recherche .choix-detaille", { timeout: 5000 });
      await page.click('#feuille #lieu-resultats-recherche [data-resultat="__sans_position__"]');
      await page.click('#feuille [data-form-lieu] button[type="submit"]');
      await page.waitForSelector("#feuille-corps [data-fiche-voyage]", { timeout: 5000 });
      await page.waitForSelector("#fiche-activites-panneau:not([hidden])", { timeout: 3000 });
      if (!(await page.locator("#fiche-lieux-corps .fv-act-n", { hasText: "Phare de Biarritz" }).count())) {
        throw new Error("voyage-retour-fiche : le nouveau lieu n'apparaît pas dans Activités après Ajouter.");
      }
      await choisirOnglet(page, "infos");
      await page.click("#fiche-resas-corps [data-nouvelle-resa]");
      await page.waitForSelector("#feuille [data-form-resa]", { timeout: 5000 });
      await page.evaluate(() => document.querySelector("#feuille-fond").click());
      await page.waitForSelector("#feuille-corps [data-fiche-voyage]", { timeout: 5000 });
      await page.waitForTimeout(150);
    } },
  // Partage (lot 3) : « Partager » crée le jeton et copie le lien (pas de feuille de partage dans le
  // navigateur de recette), Infos propose « Télécharger la page » (fichier autonome, sans aucun code
  // ni prix) et « Arrêter le partage » (confirmation du socle, supprime le jeton).
  { ecran: "voyages-liste", moduleDefaut: "agenda-mois", nom: "voyage-partager",
    geste: async (page) => {
      await preparerPartage(page);
      await page.click("#fiche-bandeau-corps [data-partager]");
      await page.waitForFunction(() => window.__copie, null, { timeout: 5000 });
      const lien = await page.evaluate(() => window.__copie);
      if (!/\/partage\.html\?j=[0-9a-f-]{36}$/.test(lien)) throw new Error(`partager : lien inattendu ${lien}`);
      if (!(await page.locator("#toast").innerText()).includes("Lien copié")) throw new Error("partager : toast « Lien copié » absent");
      if ((await page.evaluate(() => window.__bouchonTables.voyage_partages.length)) !== 1) throw new Error("partager : un jeton attendu en base");
      await choisirOnglet(page, "infos");
      await page.locator("#fiche-partage-corps").evaluate((el) => el.scrollIntoView({ block: "center" }));
      await verifierFiche(page);
      const [telechargement] = await Promise.all([page.waitForEvent("download", { timeout: 8000 }), page.click("#fiche-partage-corps [data-telecharger-page]")]);
      if (!/-carnet\.html$/.test(telechargement.suggestedFilename())) throw new Error(`télécharger : nom ${telechargement.suggestedFilename()}`);
      const contenu = fs.readFileSync(await telechargement.path(), "utf8");
      verifierSansPrive(contenu, "fichier téléchargé");
      if (!contenu.includes("Planning") || !contenu.includes("<style>")) throw new Error("télécharger : page incomplète");
    } },
  { ecran: "voyages-liste", moduleDefaut: "agenda-mois", nom: "voyage-partage-arret",
    geste: async (page) => {
      await preparerPartage(page);
      await page.click("#fiche-bandeau-corps [data-partager]");
      await page.waitForFunction(() => window.__copie, null, { timeout: 5000 });
      await choisirOnglet(page, "infos");
      await page.click("#fiche-partage-corps [data-arreter-partage]");
      await page.click("#feuille-corps [data-ok]");
      await page.waitForSelector("#feuille-corps [data-fiche-voyage]", { timeout: 5000 });
      if ((await page.evaluate(() => window.__bouchonTables.voyage_partages.length)) !== 0) throw new Error("arrêt : le jeton existe encore");
      if (await page.locator("#fiche-partage-corps [data-arreter-partage]").count()) throw new Error("arrêt : le bouton Arrêter reste affiché");
      await page.waitForTimeout(250);
    } },
  // « Carte hors ligne » (capture voyage-carte-hors-ligne) est traitée par sa PROPRE page —
  // voir captureCarteHorsLigne plus bas — pour la même raison que voyage-fiche-carte : une fois
  // qu'un geste PRÉCÉDENT dans la même page a chargé Leaflet avec succès (même le stub),
  // carte.js::chargerLeaflet() mémorise `window.L` et ne retente plus JAMAIS le réseau — bloquer
  // cdnjs après coup ne fait plus rien, le geste attendrait indéfiniment son message d'erreur
  // (jamais dans le tableau GESTES générique, qui partage une seule page par largeur).
];

// ---------- 1. écrans à visiter, lus depuis les descripteurs (pas de liste en dur) ----------
/** Extrait cle/onglets/reglages d'un descripteur mod-*.js sans l'exécuter (il touche le DOM au
 *  chargement dans certains fichiers UI qu'il importe) : lecture texte + JSON.parse ciblé. */
function lireDescripteur(fichier) {
  const src = fs.readFileSync(fichier, "utf8");
  const cle = src.match(/cle:\s*"([^"]+)"/)?.[1];
  const nom = src.match(/nom:\s*"([^"]+)"/)?.[1];
  const defaut = src.match(/defaut:\s*"([^"]+)"/)?.[1];
  const tableau = (motCle) => {
    // Cible "onglets: [ ... ]," ou "reglages: [ ... ]," — un tableau de paires ["cle","libellé"],
    // toujours écrit sur une seule ligne dans les mod-*.js actuels. On repère juste le début
    // ("motCle: [") puis on compte les crochets pour trouver la fermeture correspondante :
    // plus robuste qu'une regex gourmande/non gourmande sur du JSON imbriqué.
    const debut = src.indexOf(`${motCle}: [`);
    if (debut === -1) throw new Error(`${fichier} : champ "${motCle}" introuvable`);
    const ouverture = src.indexOf("[", debut);
    let profondeur = 0, fin = -1;
    for (let i = ouverture; i < src.length; i++) {
      if (src[i] === "[") profondeur++;
      else if (src[i] === "]") { profondeur--; if (profondeur === 0) { fin = i; break; } }
    }
    if (fin === -1) throw new Error(`${fichier} : champ "${motCle}" — crochet fermant introuvable`);
    // Les entrées utilisent déjà des guillemets doubles : c'est du JSON valide tel quel.
    return JSON.parse(src.slice(ouverture, fin + 1));
  };
  return { cle, nom, defaut, onglets: tableau("onglets"), reglages: tableau("reglages") };
}

function listerEcrans() {
  const registre = fs.readFileSync(path.join(RACINE, "modules.js"), "utf8");
  const chemins = [...registre.matchAll(/import\s+\w+\s+from\s+"(\.\/[^"]+)"/g)].map((m) => m[1]);
  const descripteurs = chemins.map((rel) => lireDescripteur(path.join(RACINE, rel.replace(/^\.\//, ""))));
  // Les écrans « charges » et « recurrents » du Budget ne sont plus déclarés (fusion en cours,
  // D-036 §4) : non listés par les descripteurs, ils ne sont donc plus visités ici — acceptable
  // en transition (brief refonte-fidélité).
  // Premier écran de Réglages, tous modules confondus (D-036 §3) : c'est LUI que la barre basse
  // ouvre pour tout écran `reglages`, jamais le `defaut` du module qui le possède — Réglages est
  // un pseudo-module synthétique assemblé par le socle, pas un onglet de son module d'origine.
  const reglagesDefaut = descripteurs.flatMap((d) => d.reglages)[0]?.[0] ?? null;
  const ecrans = [];
  for (const d of descripteurs) {
    // Un module sans segmenté d'en-tête (`onglets: []`, ex. Courses D-036 §3) n'a que son écran
    // `defaut`, ouvert directement par la barre basse : sans lui l'écran ne serait JAMAIS visité
    // (ni onglet ni réglage ne le nomme), et la recette validerait un écran qu'elle n'a pas vu.
    if (!d.onglets.some(([e]) => e === d.defaut)) ecrans.push({ module: d.cle, ecran: d.defaut, moduleDefaut: d.defaut });
    for (const [e] of d.onglets) ecrans.push({ module: d.cle, ecran: e, moduleDefaut: d.defaut });
    for (const [e] of d.reglages) ecrans.push({ module: d.cle, ecran: e, moduleDefaut: reglagesDefaut });
  }
  return ecrans;
}

// ---------- 2. doublure Supabase, injectée AVANT tout script de la page ----------
// Correspondance export du fichier de données -> nom réel de table Supabase (celui que
// frontend/socle/api.js passe à sb.from(...)) : les deux vocabulaires diffèrent en casse ici,
// mais suivent le schéma des migrations pour le nom.
const TABLES = {
  membres: "MEMBRES", charges: "CHARGES", comptes: "COMPTES", mouvements_recurrents: "MOUVEMENTS_RECURRENTS",
  lignes: "LIGNES", revenus: "REVENUS", ajustements: "AJUSTEMENTS", mouvements: "MOUVEMENTS",
  taches_recurrentes: "TACHES_RECURRENTES", taches: "TACHES",
  courses_rayons: "RAYONS", courses: "COURSES", repas: "REPAS", repas_ingredients: "REPAS_INGREDIENTS",
  courses_classiques: "COURSES_CLASSIQUES",
  voyages: "VOYAGES", parametres: "PARAMETRES",
  voyage_lieux: "VOYAGE_LIEUX", voyage_resas: "VOYAGE_RESAS", voyage_pieces: "VOYAGE_PIECES",
  voyage_blocs: "VOYAGE_BLOCS", voyage_enveloppes: "VOYAGE_ENVELOPPES", voyage_todos: "VOYAGE_TODOS", voyage_partages: "VOYAGE_PARTAGES",
  veille_vols: "VEILLE_VOLS", veille_alertes: "VEILLE_ALERTES",
};

/** Construit le script de bouchon : un thenable qui imite from().select().eq()... et
 *  auth.*, avec des données factices cohérentes. Sérialisé en JSON pour passer dans la page. */
function scriptBouchon(donnees) {
  const parTable = Object.fromEntries(Object.entries(TABLES).map(([table, cle]) => [table, donnees[cle] ?? []]));
  return `(() => {
    const DONNEES = ${JSON.stringify(parTable)};
    // Vacances scolaires : cache local frais pour les trois zones, donc aucun appel réseau
    // (frontend/agenda/vacances.js lit le cache avant l'API).
    for (const zone of ["Zone A", "Zone B", "Zone C"]) {
      localStorage.setItem("maxhome.vacances." + zone, JSON.stringify({ quand: Date.now(),
        periodes: ${JSON.stringify(donnees.VACANCES_CACHE ?? [])}.map((p) => ({ ...p, zone })) }));
    }
    const table = (nom) => JSON.parse(JSON.stringify(DONNEES[nom] ?? []));

    // Requête chaînable et thenable : chaque méthode renvoie l'objet lui-même, la résolution
    // n'a lieu qu'à la lecture (then/await), comme le vrai client Supabase. Les filtres
    // s'appliquent sur l'état COURANT de la table (via window.__bouchonTables), jamais sur une
    // copie figée à la construction : sinon une écriture faite par une requête précédente
    // resterait invisible à la suivante dans le même chargement d'écran.
    function requete(nomTable) {
      window.__bouchonTables[nomTable] ??= table(nomTable);
      let lignes = window.__bouchonTables[nomTable];
      let operation = "select";
      let unique = false;
      let payload = null;

      const q = {
        select: () => q,
        order: () => q,
        eq(champ, val) { lignes = lignes.filter((l) => l[champ] === val); return q; },
        neq(champ, val) { lignes = lignes.filter((l) => l[champ] !== val); return q; },
        gte(champ, val) { lignes = lignes.filter((l) => l[champ] >= val); return q; },
        lte(champ, val) { lignes = lignes.filter((l) => l[champ] <= val); return q; },
        in(champ, vals) { lignes = lignes.filter((l) => vals.includes(l[champ])); return q; },
        or(expr) {
          // Bouchon minimal : « fait_le.is.null,echeance.gte.X » (seul usage réel, api.js taches()).
          const clauses = expr.split(",");
          lignes = lignes.filter((l) => clauses.some((c) => {
            const [champ, op, val] = c.split(".");
            if (op === "is" && val === "null") return l[champ] == null;
            if (op === "gte") return l[champ] >= val;
            return false;
          }));
          return q;
        },
        insert(v) { operation = "insert"; payload = Array.isArray(v) ? v : [v]; return q; },
        update(v) { operation = "update"; payload = v; return q; },
        upsert(v) { operation = "upsert"; payload = v; return q; },
        delete() { operation = "delete"; return q; },
        single() { unique = true; return q; },
        maybeSingle() { unique = true; return q; },
        then(resolve, reject) {
          // then() DOIT renvoyer un vrai Promise : api.js fait sb.from(...).then(rendre) sans
          // l'awaiter lui-même (l'await arrive plus haut, sur le résultat de .then()) — un
          // objet thenable qui ne fait qu'appeler resolve() sans rien renvoyer casse toute la
          // chaîne (Promise.all reçoit undefined à la place du tableau attendu).
          let resultat;
          try { resultat = { data: executer(), error: null }; }
          catch (e) { resultat = { data: null, error: e }; }
          return Promise.resolve(resultat).then(resolve, reject);
        },
      };

      function prochainId() {
        return 1 + window.__bouchonTables[nomTable].reduce((max, l) => Math.max(max, l.id ?? 0), 0);
      }

      function executer() {
        const base = window.__bouchonTables[nomTable];
        if (operation === "select") {
          const filtrees = lignes;
          return unique ? (filtrees[0] ?? null) : filtrees;
        }
        if (operation === "insert") {
          // Colonne à défaut serveur : le jeton de partage (uuid généré par la base, migration 033).
          const parDefaut = nomTable === "voyage_partages" ? () => ({ jeton: crypto.randomUUID() }) : () => ({});
          const crees = payload.map((champs) => ({ id: prochainId() + payload.indexOf(champs), ...parDefaut(), ...champs }));
          window.__bouchonTables[nomTable] = [...base, ...crees];
          return unique ? crees[0] : crees;
        }
        if (operation === "update") {
          const idsAMaj = new Set(lignes.map((l) => l.id));
          window.__bouchonTables[nomTable] = base.map((l) => idsAMaj.has(l.id) ? { ...l, ...payload } : l);
          const maj = window.__bouchonTables[nomTable].filter((l) => idsAMaj.has(l.id));
          return unique ? (maj[0] ?? null) : maj;
        }
        if (operation === "upsert") {
          // Bouchon minimal : clé = colonnes non-montant présentes ; une ligne ou un tableau
          // (« Remplir avec les montants habituels » écrit tout le mois d'un coup).
          const unePasse = (champs) => {
            const table = window.__bouchonTables[nomTable];
            const cles = Object.keys(champs).filter((k) => !k.includes("montant") && k !== "fait_le" && k !== "fait_par");
            const i = table.findIndex((l) => cles.every((k) => l[k] === champs[k]));
            if (i === -1) { const cree = { id: prochainId(), ...champs }; window.__bouchonTables[nomTable] = [...table, cree]; return cree; }
            window.__bouchonTables[nomTable] = table.map((l, k) => k === i ? { ...l, ...champs } : l);
            return window.__bouchonTables[nomTable][i];
          };
          return Array.isArray(payload) ? payload.map(unePasse) : unePasse(payload);
        }
        if (operation === "delete") {
          const idsASupprimer = new Set(lignes.map((l) => l.id));
          window.__bouchonTables[nomTable] = base.filter((l) => !idsASupprimer.has(l.id));
          return null;
        }
        return null;
      }
      return q;
    }

    // Storage bouchonné : un seul bucket utilisé (« voyages »), objets tenus en mémoire par
    // chemin. La pièce factice (VOYAGE_PIECES) et la photo du lieu 1 (VOYAGE_LIEUX) sont
    // préchargées avec un petit PNG en data:, pour que urlPiece()/urlsPhotos()/le cache hors
    // ligne aient un vrai contenu à servir sans réseau.
    window.__bouchonStorage = {
      "1/billet-avion.png": ${JSON.stringify(donnees.PIECE_QR_PNG_DATA_URL ?? "")},
      "1/lieux/plage-deauville.png": ${JSON.stringify(donnees.PHOTO_LIEU_PNG_DATA_URL ?? "")},
    };

    function storageBucket(bucket) {
      return {
        async upload(chemin, fichier) {
          const lecteur = new FileReader();
          const dataUrl = await new Promise((resolve, reject) => {
            lecteur.onload = () => resolve(lecteur.result);
            lecteur.onerror = () => reject(lecteur.error);
            lecteur.readAsDataURL(fichier);
          });
          window.__bouchonStorage[chemin] = dataUrl;
          return { data: { path: chemin }, error: null };
        },
        async remove(chemins) {
          for (const c of chemins) delete window.__bouchonStorage[c];
          return { data: null, error: null };
        },
        async createSignedUrl(chemin) {
          const dataUrl = window.__bouchonStorage[chemin];
          if (!dataUrl) return { data: null, error: new Error("objet introuvable : " + chemin) };
          return { data: { signedUrl: dataUrl }, error: null };
        },
        async createSignedUrls(chemins) {
          // Un objet introuvable est juste omis (comme le ferait Supabase pour une liste
          // partiellement valide) : api.js::urlsPhotos retombe sur le bandeau de catégorie,
          // jamais une erreur qui casserait toute la section Lieux.
          return { data: chemins.map((chemin) => ({ path: chemin, signedUrl: window.__bouchonStorage[chemin] ?? null, error: null })), error: null };
        },
      };
    }

    window.__bouchonTables = {};
    window.supabase = {
      createClient: () => ({
        auth: {
          signInWithPassword: async () => ({ error: null }),
          signOut: async () => ({ error: null }),
          getUser: async () => ({ data: { user: { email: DONNEES.membres[1].email } } }),
          onAuthStateChange(cb) {
            // Session déjà active : le bouchon simule un utilisateur déjà connecté (Yann),
            // comme recette_connectee.mjs le fait avec un vrai login.
            setTimeout(() => cb("INITIAL_SESSION", { user: { email: DONNEES.membres[1].email } }), 0);
            return { data: { subscription: { unsubscribe() {} } } };
          },
        },
        from: (nom) => requete(nom),
        // RPC bouchonnée par la recette : window.__bouchonRpc[nom](args) ; sinon erreur franche.
        rpc: async (nom, args) => {
          const f = window.__bouchonRpc?.[nom];
          return f ? { data: f(args), error: null } : { data: null, error: new Error("rpc non bouchonnée : " + nom) };
        },
        storage: { from: (bucket) => storageBucket(bucket) },
      }),
    };
  })();`;
}

// ---------- 3. mesure de géométrie : débordement horizontal réel, pas d'œil sur une capture ----------
async function chercherDebordement(page, largeur) {
  return page.evaluate((largeurAttendue) => {
    const fautifs = [];
    if (document.documentElement.scrollWidth > window.innerWidth) {
      for (const el of document.querySelectorAll("body *")) {
        const r = el.getBoundingClientRect();
        if (r.right > largeurAttendue + 1 && r.width > 0) {
          fautifs.push(`${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.className && typeof el.className === "string" ? "." + el.className.split(" ").filter(Boolean).join(".") : ""} (right=${Math.round(r.right)}px)`);
        }
      }
    }
    return { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, fautifs: fautifs.slice(0, 8) };
  }, largeur);
}

/** Élément flottant (FAB) qui recouvre du contenu : un `position:fixed` est hors flux, donc
 *  aucun débordement horizontal ne le signale — seul l'œil le voyait, et l'œil ne regardait pas
 *  (L-028). On mesure l'intersection réelle entre le rectangle du bouton flottant et celui des
 *  blocs de contenu, en ignorant ses propres descendants et les conteneurs qui l'englobent. */
async function chercherRecouvrements(page) {
  // Fond de page : position de repos du FAB. Ailleurs, le survol est transitoire (on défile).
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  await page.waitForTimeout(120);
  const touches = await page.evaluate(() => {
    const nom = (e) => `${e.tagName.toLowerCase()}${e.id ? "#" + e.id : ""}` +
      (typeof e.className === "string" && e.className.trim() ? "." + e.className.trim().split(/\s+/).join(".") : "");
    const flottants = [...document.querySelectorAll("body *")].filter((el) => {
      const st = getComputedStyle(el);
      return st.position === "fixed" && st.display !== "none" && st.visibility !== "hidden"
        && !el.closest("nav") && el.getBoundingClientRect().width > 0
        // Le voile d'une feuille modale RECOUVRE l'écran : c'est sa fonction, pas un défaut.
        // La barre d'onglets non plus (exclue par `nav` ci-dessus) : contenu et barre coexistent.
        && el.id !== "feuille-fond" && !el.classList.contains("feuille");
    });
    // Un FAB `position:fixed` survole forcément le contenu d'une page qui défile : ce qu'on
    // traque n'est pas ce survol, c'est qu'il masque quelque chose d'ACTIONNABLE ou une valeur
    // qu'on ne peut plus lire EN FIN DE PAGE, là où il se pose au repos. On mesure donc à fond
    // de page (défilement en bas), seul état où le recouvrement est permanent.
    const CIBLES = ".ligne-tache, .carte-taches, .grille-semaine-carte, .legende-taches, .barre-fait-bouton, #detail-categories-semaine > *";
    const touches = [];
    for (const f of flottants) {
      const rf = f.getBoundingClientRect();
      for (const el of document.querySelectorAll(CIBLES)) {
        if (f.contains(el) || el.contains(f)) continue;
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const l = Math.min(r.right, rf.right) - Math.max(r.left, rf.left);
        const h = Math.min(r.bottom, rf.bottom) - Math.max(r.top, rf.top);
        // 4 px de marge : un simple contact de bordure n'est pas un recouvrement.
        if (l > 4 && h > 4) touches.push(`${nom(f)} recouvre ${nom(el)} sur ${Math.round(l)}x${Math.round(h)}px`);
      }
    }
    return touches.slice(0, 6);
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  return touches;
}

// ---------- 4. lancement ----------
const serveur = http.createServer((req, res) => {
  const p = path.join(RACINE, req.url === "/" ? "index.html" : req.url.split("?")[0]);
  if (!p.startsWith(RACINE) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[path.extname(p)] ?? "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
// Port éphémère (0 = l'OS en choisit un libre) plutôt qu'un numéro en dur : une recette
// interrompue laisse son serveur en vie quelques secondes, et un port fixe fait alors échouer
// la relance sur EADDRINUSE — un échec qui n'a rien à voir avec ce qu'on teste.
await new Promise((resolve, reject) => {
  serveur.once("error", reject);
  serveur.listen(0, "127.0.0.1", resolve);
});
const PORT = serveur.address().port;
fs.mkdirSync(SORTIE, { recursive: true });

const ecrans = listerEcrans();
const navigateur = await chromium.launch();
const erreurs = [];
const debordements = [];
const recouvrements = [];
const BR = String.fromCharCode(10);
const ecransCasses = [];
let nbCaptures = 0;

/** Navigue vers un écran. La barre basse GLOBALE (#onglets, D-036 §3) porte un bouton par
 *  module (son écran `defaut`) et un bouton « Réglages » : plus de menu « Plus » à ouvrir, tout
 *  écran est atteignable soit directement depuis cette barre, soit via le segmenté d'en-tête
 *  du module (`onglets`) ou de Réglages (`reglages`), rendus par `main [data-segment]` — tous
 *  deux de simples `[data-ecran]` sur lesquels la délégation générique de ui-base.js navigue.
 *  Repris de recette_connectee.mjs pour le patron général, adapté pour rester générique. */
async function aller(page, ecran, moduleDefaut) {
  // Déjà sur l'écran demandé : ne rien faire.
  if (await page.isVisible(`#ecran-${ecran}:not([hidden])`)) return;
  const surPC = await page.isVisible("#barre-pc");
  const nav = surPC ? "#barre-pc" : "#onglets";
  if (await page.isVisible(`${nav} button[data-ecran=${ecran}]`)) {
    await page.click(`${nav} button[data-ecran=${ecran}]`, { timeout: 5000 });
  } else {
    // L'écran cible n'est ni un module par défaut ni « Réglages » lui-même : on entre d'abord
    // dans son module (ou dans Réglages) via la barre, puis on tape son segmenté d'en-tête —
    // rendu par [data-segment] une fois l'écran par défaut affiché (ui-base.js::montrerEcran).
    await page.click(`${nav} button[data-ecran=${moduleDefaut}]`, { timeout: 5000 });
    await page.waitForSelector(`#ecran-${moduleDefaut}:not([hidden])`, { timeout: 8000 });
    // Scopé à l'écran affiché : chaque `.ecran` reste dans le DOM une fois caché (`hidden`),
    // donc un sélecteur non scopé peut matcher le segmenté d'un AUTRE écran (même data-ecran
    // au même endroit, ex. Réglages) et cliquer dans le vide.
    const cible = `#ecran-${moduleDefaut}:not([hidden]) [data-ecran=${ecran}]`;
    await page.waitForSelector(cible, { timeout: 5000 });
    await page.click(cible, { timeout: 5000 });
  }
  await page.waitForSelector(`#ecran-${ecran}:not([hidden])`, { timeout: 8000 });
  await page.waitForTimeout(200); // laisse le rendu (fetch factice résolu en microtâche) se poser
}

try {
  for (const largeur of LARGEURS) {
    const page = await navigateur.newPage({ viewport: { width: largeur, height: 900 } });
    const erreursPage = [];
    if (VERBEUX) page.setDefaultTimeout(6000); // mise au point : un geste en échec casse vite
    // "Failed to load resource: net::ERR_FAILED" est le bruit ATTENDU du blocage volontaire
    // du CDN Supabase et de Google Fonts ci-dessous (route.abort) : ce n'est pas une vraie
    // erreur de page, on ne la compte pas comme un échec de la recette.
    const attendue = (texte) => texte.includes("net::ERR_FAILED");
    page.on("console", (m) => { if (m.type() === "error" && !attendue(m.text())) erreursPage.push(m.text()); });
    page.on("pageerror", (e) => erreursPage.push(e.message));
    // Aucun accès réseau réel : le SDK Supabase (CDN) et toute requête vers *.supabase.co
    // sont coupés — sinon le vrai script chargé après notre bouchon écraserait window.supabase
    // (c'est un script classique, pas un module : il s'exécute dans l'ordre du document,
    // après notre addInitScript). Google Fonts est coupé aussi : la police n'a rien à faire
    // dans une recette hors ligne et reste sans effet sur la géométrie mesurée.
    await page.route("**/*", (route) => {
      const url = route.request().url();
      if (url.includes("supabase") || url.includes("fonts.g")) return route.abort();
      return route.continue();
    });
    // Leaflet (cdnjs, frontend/agenda/carte.js) : stub minimal servi localement, jamais le
    // vrai réseau — la recette reste 100 % hors ligne, y compris pour la fiche voyage. Assez
    // de la surface Leaflet pour que carte.js s'exécute et pose un conteneur `.leaflet-container`
    // repérable (aucune vraie tuile, aucune vraie carte : ce n'est pas ce que la recette teste).
    // Le geste « voyage-carte-hors-ligne » réenregistre une route qui abort spécifiquement
    // cdnjs (Playwright prend la dernière route enregistrée), simulant l'indisponibilité.
    await page.route("**/cdnjs.cloudflare.com/ajax/libs/leaflet/**/leaflet.min.css", (route) =>
      route.fulfill({ status: 200, contentType: "text/css", body: ".leaflet-container{min-height:220px}" }));
    await page.route("**/cdnjs.cloudflare.com/ajax/libs/leaflet/**/leaflet.min.js", (route) =>
      route.fulfill({ status: 200, contentType: "text/javascript", body: STUB_LEAFLET_JS }));
    await bouchonnerMeteo(page);
    await page.addInitScript(scriptBouchon(DONNEES));

    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
    await page.waitForSelector("#app:not([hidden])", { timeout: 10000 });
    await page.waitForSelector("#ecran-accueil:not([hidden]) .module-carte", { timeout: 10000 });

    // ---------- accueil ----------
    await capturer(page, "accueil", largeur, erreursPage);

    // ---------- chaque écran de chaque module ----------
    for (const { ecran, moduleDefaut } of ecrans) {
      try {
        await aller(page, ecran, moduleDefaut);
        await capturer(page, ecran, largeur, erreursPage);
      } catch (e) {
        ecransCasses.push(`${ecran} @ ${largeur}px : ${e.message.split("\n")[0]}`);
        // On revient à l'accueil pour ne pas propager la casse d'un écran aux suivants.
        try { await page.click("#logo"); await page.waitForSelector("#ecran-accueil:not([hidden])", { timeout: 3000 }); }
        catch { /* si même l'accueil ne répond plus, la page suivante repartira de zéro */ }
      }
    }
    // ---------- les feuilles ----------
    // Une feuille ne s'ouvre que par un geste : sans ça, « Ajouter une tâche » et « Travaux
    // en attente » n'apparaissent sur AUCUNE capture, et la recette dirait vert sur des
    // écrans qu'elle n'a jamais vus (L-009, L-024).
    for (const { ecran, moduleDefaut, bouton, nom } of FEUILLES) {
      try {
        await aller(page, ecran, moduleDefaut);
        await page.click(bouton, { timeout: 5000 });
        await page.waitForSelector("#feuille:not([hidden])", { timeout: 5000 });
        await page.waitForTimeout(250); // la feuille glisse en 200 ms
        await capturer(page, nom, largeur, erreursPage);
        // Refermer ET attendre que la feuille soit vraiment partie : le voile reste cliquable
        // pendant la transition de sortie et intercepterait le geste suivant (L-018 : on attend
        // une preuve, pas un délai).
        await page.evaluate(() => document.getElementById("feuille-fond").click());
        await page.waitForSelector("#feuille", { state: "hidden", timeout: 5000 });
      } catch (e) {
        ecransCasses.push(`${nom} @ ${largeur}px : ${e.message.split("\n")[0]}`);
        try { await page.click("#logo"); await page.waitForSelector("#ecran-accueil:not([hidden])", { timeout: 3000 }); }
        catch { /* la page suivante repartira de zéro */ }
      }
    }
    // ---------- les gestes ----------
    for (const { ecran, moduleDefaut, geste, nom } of GESTES.filter((g) => !FILTRE_GESTES || FILTRE_GESTES.test(g.nom))) {
      try {
        if (VERBEUX) console.log(`geste ${nom} @ ${largeur}px`);
        await aller(page, ecran, moduleDefaut);
        await geste(page);
        await capturer(page, nom, largeur, erreursPage);
        // Un geste peut laisser le plein écran custom d'une pièce ouvert (voyage-qr-plein-ecran) :
        // il n'est pas `#feuille`, mais son overlay `position:fixed` intercepte quand même tout
        // clic sur la feuille en dessous (« ← Voyages » y compris) — le fermer AVANT tout le reste.
        await fermerPieceOrpheline(page);
        // Un geste peut ouvrir une feuille (détail d'une tâche sur mobile) : la refermer, sinon
        // son voile intercepte le geste suivant — même règle que la boucle des feuilles (L-018).
        // Un formulaire de la fiche voyage (Lieu/Résa/Billet) fermé par le voile ROUVRE la fiche
        // (revenirALaFiche, brief carnet-voyage) : #feuille repasse donc par `hidden` un instant
        // TROP BREF pour qu'un waitForSelector(state:"hidden") l'observe de façon fiable — on
        // attend un état STABLE à la place (fermée pour de bon, OU rouverte sur la fiche elle-
        // même) en repollant après chaque clic, jusqu'à ce que cet état stable soit atteint.
        await fermerFeuillesOuvertes(page);
      } catch (e) {
        if (VERBEUX) console.log(`  CASSÉ : ${e.message.split("\n")[0]}`);
        ecransCasses.push(`${nom} @ ${largeur}px : ${e.message.split("\n")[0]}`);
        // Sans ce nettoyage la fiche restait ouverte et TOUS les gestes suivants échouaient en cascade.
        try { await fermerPieceOrpheline(page); await fermerFeuillesOuvertes(page); }
        catch (f) { console.error(`nettoyage après ${nom} impossible : ${f.message.split("\n")[0]}`); }
        try { await page.click("#logo"); await page.waitForSelector("#ecran-accueil:not([hidden])", { timeout: 3000 }); }
        catch { /* la page suivante repartira de zéro */ }
      }
    }
    erreurs.push(...erreursPage.map((m) => `${largeur}px: ${m}`));
    await page.close();

    // ---------- carte réelle (relecture §B) : page à part, réseau réel vers cdnjs + tuiles ----
    const erreursCarte = await captureCarteReelle(navigateur, PORT, largeur);
    erreurs.push(...erreursCarte.map((m) => `${largeur}px: ${m}`));

    // ---------- carte hors ligne : page à part, cdnjs bloqué DÈS LE DÉPART ----------
    const erreursHorsLigne = await captureCarteHorsLigne(navigateur, PORT, largeur);
    erreurs.push(...erreursHorsLigne.map((m) => `${largeur}px: ${m}`));

    // ---------- page publique partage.html (lot 3) : sans session, RPC bouchonnée ----------
    const erreursPartage = await capturePartage(navigateur, PORT, largeur);
    erreurs.push(...erreursPartage.map((m) => `${largeur}px: ${m}`));
  }
} finally {
  await navigateur.close();
  serveur.close();
}

/** Capture voyage-fiche-carte : seul endroit de toute la recette où le réseau réel part vers
 *  cdnjs (le vrai Leaflet) et tile.openstreetmap.org (les vraies tuiles) — page dédiée, jamais
 *  réutilisée pour autre chose, pour ne polluer ni le stub Leaflet des autres pages ni leur
 *  promesse de chargement mémorisée (carte.js). Bloque toujours supabase/fonts, comme partout
 *  ailleurs dans la recette (relecture §B). */
async function captureCarteReelle(navigateur, port, largeur) {
  const page = await navigateur.newPage({ viewport: { width: largeur, height: 900 } });
  const erreursPage = [];
  const attendue = (texte) => texte.includes("net::ERR_FAILED");
  page.on("console", (m) => { if (m.type() === "error" && !attendue(m.text())) erreursPage.push(m.text()); });
  page.on("pageerror", (e) => erreursPage.push(e.message));
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.includes("supabase") || url.includes("fonts.g")) return route.abort();
    return route.continue();
  });
  await bouchonnerMeteo(page);
  await page.addInitScript(scriptBouchon(DONNEES));
  try {
    await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
    await page.waitForSelector("#app:not([hidden])", { timeout: 10000 });
    await aller(page, "voyages-liste", "agenda-mois");
    await page.click('#voyages-liste-corps [data-voyage="1"]');
    await page.waitForSelector("#feuille-corps [data-fiche-voyage]", { timeout: 5000 });
    await page.click('#fiche-onglets-corps [data-onglet="carte"]');
    await page.waitForSelector(".leaflet-container", { timeout: 15000 });
    // Vraies tuiles chargées : au moins une image de tuile posée par Leaflet.
    await page.waitForSelector(".leaflet-tile-loaded, .leaflet-tile", { timeout: 15000 }).catch(() => {});
    await page.waitForTimeout(800);
    await page.evaluate(() => document.querySelector("#fiche-carte-corps")?.scrollIntoView({ block: "start" }));
    await page.waitForTimeout(150);
    await capturer(page, "voyage-fiche-carte", largeur, erreursPage);
  } catch (e) {
    ecransCasses.push(`voyage-fiche-carte @ ${largeur}px : ${e.message.split("\n")[0]}`);
  } finally {
    await page.close();
  }
  return erreursPage;
}

/** Capture voyage-carte-hors-ligne : cdnjs bloqué DÈS LE PREMIER chargement de la page (pas
 *  après coup) — carte.js::chargerLeaflet() mémorise sa promesse dans `promesseChargement` : une
 *  fois `window.L` posé avec succès (même par le stub), plus AUCUN blocage ultérieur de cdnjs
 *  ne fait revenir l'erreur, car le script n'est jamais rechargé. Cette page-ci n'exécute donc
 *  jamais le stub Leaflet : cdnjs est bloqué avant même le premier clic sur la fiche, pour que
 *  `chercherLeaflet()` échoue réellement et affiche « Carte indisponible hors ligne ».
 *  Le SERVICE WORKER de l'app (frontend/sw.js) fait lui-même du `stale-while-revalidate` pour
 *  cdnjs.cloudflare.com (cache `maxhome-cdnjs`) : son `fetch()` s'exécute dans le contexte du
 *  worker, jamais intercepté par `page.route()` (qui ne voit que les requêtes de la PAGE) — le
 *  SW allait donc chercher et servir le vrai Leaflet malgré le blocage, contournant tout. On
 *  empêche son enregistrement pour cette page précise (index.html ne fait alors plus AUCUNE
 *  requête réseau invisible à `page.route`), seul moyen de faire échouer réellement le
 *  chargement de Leaflet ici. */
async function captureCarteHorsLigne(navigateur, port, largeur) {
  const page = await navigateur.newPage({ viewport: { width: largeur, height: 900 } });
  const erreursPage = [];
  // "SW désactivé…" et "Chargement de Leaflet impossible" sont les CONSÉQUENCES directes et
  // volontaires de ce geste (SW coupé et cdnjs bloqué exprès, ci-dessous) : l'app les logge
  // correctement en erreur (cause jamais avalée en silence), mais ce n'est pas une vraie casse
  // à faire échouer la recette — même logique que net::ERR_FAILED pour les CDN coupés partout.
  const attendue = (texte) => texte.includes("net::ERR_FAILED")
    || texte.includes("SW désactivé pour ce geste")
    || texte.includes("Chargement de Leaflet impossible");
  page.on("console", (m) => { if (m.type() === "error" && !attendue(m.text())) erreursPage.push(m.text()); });
  page.on("pageerror", (e) => erreursPage.push(e.message));
  await page.addInitScript(() => { navigator.serviceWorker.register = () => Promise.reject(new Error("SW désactivé pour ce geste")); });
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.includes("supabase") || url.includes("fonts.g") || url.includes("cdnjs.cloudflare.com")) return route.abort();
    return route.continue();
  });
  await bouchonnerMeteo(page);
  await page.addInitScript(scriptBouchon(DONNEES));
  try {
    await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
    await page.waitForSelector("#app:not([hidden])", { timeout: 10000 });
    await aller(page, "voyages-liste", "agenda-mois");
    await page.click('#voyages-liste-corps [data-voyage="1"]');
    await page.waitForSelector("#feuille-corps [data-fiche-voyage]", { timeout: 5000 });
    await page.click('#fiche-onglets-corps [data-onglet="carte"]');
    await page.waitForSelector("#fiche-carte-corps .carte-indisponible", { timeout: 8000 });
    await capturer(page, "voyage-carte-hors-ligne", largeur, erreursPage);
  } catch (e) {
    ecransCasses.push(`voyage-carte-hors-ligne @ ${largeur}px : ${e.message.split("\n")[0]}`);
  } finally {
    await page.close();
  }
  return erreursPage;
}

/** Captures de la page publique partage.html (lot 3) : une page à part, sans session, avec la RPC
 *  `voyage_partage` bouchonnée par le filtre JS (miroir de la fonction SQL). Un onglet par capture
 *  (planning, activités, carte, infos), puis un jeton inconnu. Mesures : cibles >= 48 px, contrastes
 *  (verifierFiche), aucune valeur privée dans le texte affiché. */
async function capturePartage(navigateur, port, largeur) {
  const page = await navigateur.newPage({ viewport: { width: largeur, height: 900 } });
  const erreursPage = [];
  const attendue = (texte) => texte.includes("net::ERR_FAILED");
  page.on("console", (m) => { if (m.type() === "error" && !attendue(m.text())) erreursPage.push(m.text()); });
  page.on("pageerror", (e) => erreursPage.push(e.message));
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.includes("supabase") || url.includes("fonts.g")) return route.abort();
    return route.continue();
  });
  await page.route("**/cdnjs.cloudflare.com/ajax/libs/leaflet/**/leaflet.min.css", (route) =>
    route.fulfill({ status: 200, contentType: "text/css", body: ".leaflet-container{min-height:220px}" }));
  await page.route("**/cdnjs.cloudflare.com/ajax/libs/leaflet/**/leaflet.min.js", (route) =>
    route.fulfill({ status: 200, contentType: "text/javascript", body: STUB_LEAFLET_JS }));
  await bouchonnerMeteo(page);
  await page.addInitScript(scriptBouchon(DONNEES));
  const id = 1;
  const donnees = filtrerPourPartage(DONNEES.VOYAGES.find((v) => v.id === id), DONNEES.VOYAGE_LIEUX.filter((l) => l.voyage_id === id),
    DONNEES.VOYAGE_RESAS.filter((r) => r.voyage_id === id), DONNEES.VOYAGE_BLOCS.filter((b) => b.voyage_id === id));
  await page.addInitScript(({ jeton, data }) => { window.__bouchonRpc = { voyage_partage: ({ p_jeton }) => (p_jeton === jeton ? data : null) }; }, { jeton: JETON_FACTICE, data: donnees });
  const onglet = async (cle, attente) => {
    await page.click(`[data-onglet="${cle}"]`);
    await page.waitForSelector(`#partage-${cle}-panneau:not([hidden])`, { timeout: 3000 });
    if (attente) await page.waitForSelector(attente, { timeout: 8000 });
    await page.waitForTimeout(150);
  };
  try {
    await page.goto(`http://localhost:${port}/partage.html?j=${JETON_FACTICE}`, { waitUntil: "networkidle" });
    await page.waitForSelector(".partage-fiche", { timeout: 10000 });
    await page.waitForSelector("#partage-planning-corps .fv-meteo", { timeout: 5000 }); // météo (bouchonnée) arrivée
    if ((await page.locator("[data-onglet]").count()) !== 4) throw new Error("partage : 4 onglets attendus");
    verifierSansPrive(await page.locator("body").innerText(), "page partagée");
    await verifierFiche(page);
    await capturer(page, "partage-planning", largeur, erreursPage);
    await onglet("activites");
    await page.click("#partage-activites-panneau details.fv-act >> nth=0 >> summary");
    await verifierFiche(page);
    await capturer(page, "partage-activites", largeur, erreursPage);
    await onglet("carte", ".leaflet-container, .carte-indisponible");
    await capturer(page, "partage-carte", largeur, erreursPage);
    await onglet("infos");
    await verifierFiche(page);
    await capturer(page, "partage-infos", largeur, erreursPage);
    await page.goto(`http://localhost:${port}/partage.html?j=99999999-2222-4333-8444-555555555555`, { waitUntil: "networkidle" });
    await page.waitForSelector(".partage-invalide", { timeout: 5000 });
    if (!(await page.locator(".partage-invalide").innerText()).includes("Ce lien de partage n'est plus valable.")) throw new Error("partage : message de jeton inconnu");
    await capturer(page, "partage-invalide", largeur, erreursPage);
  } catch (e) {
    ecransCasses.push(`partage @ ${largeur}px : ${e.message.split("\n")[0]}`);
  } finally {
    await page.close();
  }
  return erreursPage;
}

async function capturer(page, ecran, largeur, erreursPage) {
  const { scrollWidth, innerWidth, fautifs } = await chercherDebordement(page, largeur);
  if (scrollWidth > innerWidth) {
    debordements.push(`${ecran} @ ${largeur}px : scrollWidth=${scrollWidth} > innerWidth=${innerWidth} — `
      + `éléments fautifs : ${fautifs.join(", ") || "non identifiés"}`);
  }
  // Mesuré AVANT la capture : `fullPage` déplace les éléments `position:fixed`.
  for (const t of await chercherRecouvrements(page)) recouvrements.push(`${ecran} @ ${largeur}px : ${t}`);
  await page.screenshot({ path: path.join(SORTIE, `${ecran}-${largeur}.png`), fullPage: true });
  nbCaptures++;
}

// ---------- résumé ----------
console.log(`Écrans énumérés : ${ecrans.length + 1} (dont accueil)`);
console.log(`Largeurs : ${LARGEURS.join(", ")} px`);
console.log(`Captures produites : ${nbCaptures} → ${SORTIE}`);

if (ecransCasses.length) {
  console.error(`\nÉcrans cassés (${ecransCasses.length}) :\n` + ecransCasses.join("\n"));
}
if (debordements.length) {
  console.error(`\nDébordements horizontaux (${debordements.length}) :\n` + debordements.join("\n"));
}
if (recouvrements.length) {
  console.error(BR + `Contenu masqué par un élément flottant (${recouvrements.length}) :` + BR + recouvrements.join(BR));
}
if (erreurs.length) {
  console.error(`\nErreurs console/page (${erreurs.length}) :\n` + erreurs.join("\n"));
}
if (ecransCasses.length || debordements.length || recouvrements.length || erreurs.length) process.exit(1);
console.log("recette écrans OK");
