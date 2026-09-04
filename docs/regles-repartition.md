# Règles de répartition (extraites du classeur « Comptes 2025/2026 »)

## Modèle
- Un **mois** = une colonne : des **charges** (montants négatifs) et des **revenus** nets par membre.
- Un montant **positif** est un remboursement (ex. « Crèche CAF ») : il se répartit avec la même règle que sa ligne.
- Chaque charge a un **type** :
  - `egales` — partagée 50/50 (crédit immobilier, LDD, frais bancaires, Livret Max…).
  - `proport` — partagée au **prorata des revenus nets du mois** (assurance, électricité, charges de copro, taxe foncière, impôts, école, livret vacances, alimentation, extras…).

## Calcul (moteur : `frontend/calc.js`)
```
ratio[p]      = revenu[p] / somme(revenus)
part[p]       = total_egales / nb_membres  +  total_proport × ratio[p]
reste[p]      = revenu[p] + part[p]        (part est négative)
```
Arrondi au centime, le reliquat va au premier membre : la somme des parts vaut toujours le total.
Revenus tous à zéro : le proport se partage à parts égales (pas de division par zéro).

## Hors périmètre V0 (feuilles anciennes)
- Feuilles « Mars/Avril 2023 » (par compte bancaire) et « Comptes 2023-24 » : format antérieur, non importé.
- Feuille « Garde Max 2024-2025 » (jours de garde × 70 €/j) : outil de simulation, non importé.
