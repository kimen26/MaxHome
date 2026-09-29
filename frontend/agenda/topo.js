// Rendu du topo (résumé markdown léger d'un voyage) : échapper TOUT le HTML d'abord, puis
// transformer un sous-ensemble minimal (titres, listes, gras, liens http/https). Sans DOM —
// testé dans tests/test_agenda.mjs (XSS neutralisé, D-045).

const echapper = (s) => s
  .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
  .replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** `**gras**` → <strong>, `[texte](http(s)://...)` → lien sûr (tout autre schéma reste du
 *  texte brut, jamais transformé en lien). Le HTML est déjà échappé à ce stade. */
function ligneInline(ligne) {
  return ligne
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
}

/** Rend un texte markdown léger en HTML sûr : `## x` / `### x` en titres, lignes `- x`
 *  consécutives en liste, `**x**` en gras, liens http(s) explicites, paragraphes séparés par
 *  une ligne vide. */
export function rendreTopo(texte) {
  if (!texte) return "";
  const lignes = echapper(texte).split(/\r?\n/);
  const blocs = [];
  let paragraphe = [];
  let liste = null;

  const clorLignes = () => {
    if (paragraphe.length) { blocs.push(`<p>${paragraphe.join("<br>")}</p>`); paragraphe = []; }
  };
  const clorListe = () => {
    if (liste) { blocs.push(`<ul>${liste.map((i) => `<li>${i}</li>`).join("")}</ul>`); liste = null; }
  };

  for (const brute of lignes) {
    const ligne = brute.trim();
    if (ligne === "") { clorLignes(); clorListe(); continue; }
    const titre3 = ligne.match(/^### (.+)/);
    const titre2 = ligne.match(/^## (.+)/);
    const item = ligne.match(/^- (.+)/);
    if (titre3) { clorLignes(); clorListe(); blocs.push(`<h4>${ligneInline(titre3[1])}</h4>`); }
    else if (titre2) { clorLignes(); clorListe(); blocs.push(`<h3>${ligneInline(titre2[1])}</h3>`); }
    else if (item) { clorLignes(); (liste ??= []).push(ligneInline(item[1])); }
    else { clorListe(); paragraphe.push(ligneInline(ligne)); }
  }
  clorLignes();
  clorListe();
  return blocs.join("");
}
