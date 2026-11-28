// Recette hors ligne de « Ce mois seulement » et du financement des extras (migration 038).
// Même serveur et même doublure Supabase que recette_ecrans.mjs (extraite de ce fichier, pas
// recopiée : un seul bouchon), données factices complétées ICI (rien dans donnees_factices.mjs).
// Parcours : un extra « à financer » (repère + sous-total), la feuille de choix à la coche, le
// choix « joint » puis « chacun » (les chiffres bougent comme prévu), « Changer le financement »,
// le tout à 360 puis 320 px, avec mesures de géométrie (pas de débordement, boutons ≥ 56 px).
// Usage : node tests/recette_extras.mjs   -> data/captures/extras/*.png (à OUVRIR, L-009/L-028)
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import * as BASE from "./donnees_factices.mjs";

const RACINE = path.resolve("frontend");
const SORTIE = path.resolve("data/captures/extras");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css" };
const LARGEURS = [360, 320];

// ---------- doublure Supabase : extraite de recette_ecrans.mjs ----------
const source = fs.readFileSync(path.resolve("tests/recette_ecrans.mjs"), "utf-8");
const debut = source.indexOf("const TABLES = {");
const fin = source.indexOf("// ---------- 3.");
if (debut === -1 || fin === -1) throw new Error("recette_ecrans.mjs : bouchon Supabase introuvable (marqueurs changés)");
// Le bouchon d'upsert prend pour clé toute colonne qui n'est pas un montant ni une coche ; la
// vraie clé est (annee, mois, charge_id) : `financement` est une valeur, pas une clé.
const CLE_ATTENDUE = 'k !== "fait_par"';
if (!source.includes(CLE_ATTENDUE)) throw new Error("recette_ecrans.mjs : clé d'upsert du bouchon introuvable");
const scriptBouchon = new Function(
  `${source.slice(debut, fin).replace(CLE_ATTENDUE, 'k !== "fait_par" && k !== "financement"')}; return scriptBouchon;`)();

// ---------- données : le mois factice + trois extras, un par financement ----------
const ANNEE = BASE.LIGNES[0].annee;
const MOIS = BASE.LIGNES[0].mois;
const extra = (id, libelle, regle) => ({
  id, libelle, ordre: 900 + id, categorie: "Autre", type: regle, regle,
  cle_pct: null, payeur: null, ponctuel: true, montant_defaut: null, defaut_dernier: false,
});
const ligne = (charge_id, montant_centimes, financement) => ({
  annee: ANNEE, mois: MOIS, charge_id, montant_centimes, regle: null, financement, fait_le: null, fait_par: null,
});
const DONNEES = {
  ...BASE,
  CHARGES: [...BASE.CHARGES, extra(21, "Aspirateur connecté", "proport"), extra(22, "Cadeau de fête", "egales")],
  LIGNES: [
    // Resto anniversaire (déjà là, sans financement) : l'ancien extra, compté comme avant.
    ...BASE.LIGNES,
    ligne(21, -29900, "a_financer"),
    ligne(22, -4500, "joint"),
  ],
};

const serveur = http.createServer((req, res) => {
  const p = path.join(RACINE, req.url === "/" ? "index.html" : req.url.split("?")[0]);
  if (!p.startsWith(RACINE) || !fs.existsSync(p)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "content-type": MIME[path.extname(p)] ?? "application/octet-stream" });
  fs.createReadStream(p).pipe(res);
});
await new Promise((resolve, reject) => { serveur.once("error", reject); serveur.listen(0, "127.0.0.1", resolve); });
const PORT = serveur.address().port;
fs.mkdirSync(SORTIE, { recursive: true });

const echecs = [];
const verifier = (condition, message) => { if (!condition) echecs.push(message); };
const texte = (page, sel) => page.locator(sel).innerText();
const montant = (s) => Number(s.replace(/[^\d,-]/g, "").replace(",", "."));

const navigateur = await chromium.launch();
try {
  for (const largeur of LARGEURS) {
    const page = await navigateur.newPage({ viewport: { width: largeur, height: 900 } });
    const erreurs = [];
    page.on("console", (m) => { if (m.type() === "error" && !m.text().includes("net::ERR_FAILED")) erreurs.push(m.text()); });
    page.on("pageerror", (e) => erreurs.push(e.message));
    await page.route("**/*", (route) => {
      const url = route.request().url();
      return url.includes("supabase") || url.includes("fonts.g") || url.includes("cdnjs") ? route.abort() : route.continue();
    });
    await page.addInitScript(scriptBouchon(DONNEES));
    await page.goto(`http://localhost:${PORT}/`, { waitUntil: "networkidle" });
    await page.waitForSelector("#ecran-accueil:not([hidden]) .module-carte", { timeout: 10000 });
    await page.click("#onglets button[data-ecran=mois]");
    await page.waitForSelector("#ecran-mois:not([hidden]) #ajustements .ligne.extra", { timeout: 8000 });

    const carte = page.locator("#ajustements").locator("xpath=..");
    const prise = async (nom) => {
      await carte.scrollIntoViewIfNeeded();
      await page.waitForTimeout(250);
      await page.screenshot({ path: path.join(SORTIE, `${nom}-${largeur}.png`), fullPage: false });
    };
    const ligneDe = (libelle) => page.locator("#ajustements .ligne.extra", { hasText: libelle });
    const aVerser = async () => montant(await texte(page, "#total-charges-mois"));

    // 1. État de départ : à financer (repère + sous-total), joint (repère), ancien extra (aucun repère).
    const total0 = await aVerser();
    verifier(/À financer/.test(await texte(page, "#ajustements")), `${largeur}px : repère « À financer » absent`);
    verifier(/À financer : 299,00/.test(await texte(page, ".extras-a-financer")), `${largeur}px : sous-total « À financer : 299,00 € » absent`);
    verifier(/Payé par le compte joint/.test(await texte(page, "#ajustements")), `${largeur}px : repère « Payé par le compte joint » absent`);
    verifier(!/À financer|joint|Chacun ajoute/.test(await ligneDe("Resto anniversaire").innerText()),
      `${largeur}px : l'ancien extra (sans financement) ne doit porter aucun repère`);
    await prise("1-extras-depart");

    // 2. Cocher l'extra à financer : la feuille de choix s'ouvre d'abord, rien n'est encore écrit.
    await ligneDe("Aspirateur connecté").locator("[data-cycle]").click();
    await page.waitForSelector("#feuille:not([hidden]) .feuille-financement", { timeout: 4000 });
    await page.waitForTimeout(300);
    const boutons = await page.locator(".feuille-financement .choix-option").evaluateAll((bs) =>
      bs.map((b) => ({ texte: b.innerText.replace(/\s+/g, " ").trim(), h: Math.round(b.getBoundingClientRect().height), l: Math.round(b.getBoundingClientRect().right) })));
    verifier(boutons.length === 2, `${largeur}px : ${boutons.length} choix à la coche, attendu 2`);
    verifier(boutons.every((b) => b.h >= 56), `${largeur}px : bouton de choix < 56 px (${boutons.map((b) => b.h)})`);
    verifier(boutons.every((b) => b.l <= largeur), `${largeur}px : bouton de choix qui déborde (${boutons.map((b) => b.l)})`);
    verifier(/Le compte joint l'absorbe/.test(boutons[0]?.texte ?? ""), `${largeur}px : libellé « Le compte joint l'absorbe » absent`);
    verifier(/Chacun ajoute ce mois-ci \(Prorata\)/.test(boutons[1]?.texte ?? ""), `${largeur}px : libellé « Chacun ajoute ce mois-ci (Prorata) » absent`);
    verifier(await ligneDe("Aspirateur connecté").locator(".case-cycle-vide").count() === 1, `${largeur}px : la ligne est cochée avant le choix`);
    await page.screenshot({ path: path.join(SORTIE, `2-feuille-choix-${largeur}.png`) });

    // 3. Fermer sans choisir : rien ne change.
    await page.evaluate(() => document.getElementById("feuille-fond").click());
    await page.waitForSelector("#feuille", { state: "hidden", timeout: 4000 });
    verifier(await ligneDe("Aspirateur connecté").locator(".case-cycle-vide").count() === 1, `${largeur}px : fermer la feuille a coché la ligne`);
    verifier(await aVerser() === total0, `${largeur}px : fermer la feuille a changé le total`);

    // 4. « Chacun ajoute » : validé, repère « Chacun ajoute », le total du mois augmente de 299 €, le sous-total disparaît.
    await ligneDe("Aspirateur connecté").locator("[data-cycle]").click();
    await page.waitForSelector("#feuille:not([hidden]) .feuille-financement");
    await page.click(".feuille-financement [data-financement=chacun]");
    await page.waitForSelector("#feuille", { state: "hidden", timeout: 4000 });
    await page.waitForTimeout(250);
    verifier(/Chacun ajoute/.test(await ligneDe("Aspirateur connecté").innerText()), `${largeur}px : repère « Chacun ajoute » absent après le choix`);
    verifier(await ligneDe("Aspirateur connecté").locator(".case-cycle-fait, .case-cycle-p1, .case-cycle-p2").count() === 1, `${largeur}px : la ligne n'est pas validée après le choix`);
    verifier(Math.abs(await aVerser()) - Math.abs(total0) === 299, `${largeur}px : total ${total0} -> ${await aVerser()}, attendu +299 €`);
    verifier(await page.locator(".extras-a-financer").count() === 0, `${largeur}px : sous-total « À financer » encore affiché à 0`);
    await prise("3-extras-chacun");

    // 5. « Changer le financement » : trois états, remettre « À financer » retire 299 € du total.
    await ligneDe("Aspirateur connecté").locator("[data-changer-financement]").click();
    await page.waitForSelector("#feuille:not([hidden]) .feuille-financement");
    await page.waitForTimeout(300);
    const nbChoix = await page.locator(".feuille-financement .choix-option").count();
    verifier(nbChoix === 3, `${largeur}px : ${nbChoix} choix dans « Changer le financement », attendu 3`);
    verifier(await page.locator(".feuille-financement .choix-option.actif").innerText().then((t) => /Chacun ajoute/.test(t)),
      `${largeur}px : le financement courant n'est pas pré-coché`);
    await page.screenshot({ path: path.join(SORTIE, `4-feuille-changer-${largeur}.png`) });
    await page.click(".feuille-financement [data-financement=a_financer]");
    await page.waitForSelector("#feuille", { state: "hidden", timeout: 4000 });
    await page.waitForTimeout(250);
    verifier(await aVerser() === total0, `${largeur}px : remettre à financer n'a pas rendu le total initial`);
    verifier(/À financer : 299,00/.test(await texte(page, ".extras-a-financer")), `${largeur}px : sous-total absent après retour à financer`);

    // 6. Géométrie finale : aucun débordement horizontal, aucun texte rogné dans la carte.
    const mesure = await page.evaluate(() => ({
      defile: document.documentElement.scrollWidth > window.innerWidth,
      rogne: [...document.querySelectorAll("#ajustements .repere, #ajustements .titre, .extras-a-financer")]
        .filter((e) => e.scrollWidth > e.clientWidth + 1).map((e) => e.textContent.trim().slice(0, 30)),
      cibles: [...document.querySelectorAll("#ajustements [data-changer-financement]")].map((e) => Math.round(e.getBoundingClientRect().height)),
    }));
    verifier(!mesure.defile, `${largeur}px : défilement horizontal de la page`);
    verifier(mesure.rogne.length === 0, `${largeur}px : texte rogné : ${mesure.rogne}`);
    verifier(mesure.cibles.every((h) => h >= 48), `${largeur}px : lien « Changer le financement » < 48 px (${mesure.cibles})`);
    await prise("5-extras-retour-a-financer");
    verifier(erreurs.length === 0, `${largeur}px : erreurs console : ${erreurs.join(" | ")}`);
    await page.close();
  }
} finally {
  await navigateur.close();
  serveur.close();
}

if (echecs.length) {
  console.error(`recette_extras ÉCHEC (${echecs.length}) :\n- ${echecs.join("\n- ")}`);
  process.exit(1);
}
console.log(`recette_extras OK — captures dans ${SORTIE} (à ouvrir et regarder)`);
