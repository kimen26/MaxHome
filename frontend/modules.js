// Registre des modules, dans l'ordre d'affichage de l'accueil et des onglets.
// Ajouter un module = un dossier avec son descripteur mod-*.js, ses écrans, ses sections
// dans index.html, ses tables, son .py côté bot — et une ligne ici.

import budget from "./budget/mod-budget.js";
import taches from "./taches/mod-taches.js";
import courses from "./courses/mod-courses.js";

export const LISTE = [budget, taches, courses];
