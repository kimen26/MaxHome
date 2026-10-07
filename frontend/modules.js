// Registre des modules, dans l'ordre d'affichage de l'accueil et des onglets.
// Ajouter un module = un dossier avec son descripteur mod-*.js, ses écrans, ses sections
// dans index.html, ses tables, son .py côté bot — et une ligne ici.
//
// Ordre Tâches, Budget, Courses, Agenda (D-036 §3, Agenda ajouté en dernier : D-037, puis Voyages : D-055) : c'est l'ordre de la barre basse GLOBALE
// (Tâches · Budget · Courses · Agenda · Voyages · roue des Réglages) ET du segmenté synthétique Réglages
// (Parts | Charges | Comptes | Magasin), assemblé par le socle dans CET ordre des modules.

import taches from "./taches/mod-taches.js";
import budget from "./budget/mod-budget.js";
import courses from "./courses/mod-courses.js";
import agenda from "./agenda/mod-agenda.js";
import voyages from "./voyages/mod-voyages.js";

export const LISTE = [taches, budget, courses, agenda, voyages];
