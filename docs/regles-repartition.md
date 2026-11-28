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

## Extras « à financer » (D-075, `lignes.financement`)
Une ligne du mois porte un état de financement (`calc.js::compteDansLeCommun`) :
- vide ou `chacun` — comptée comme ci-dessus : les virements au commun augmentent ;
- `a_financer` — exclue de tout le calcul, sommée à part (`aFinancer`) en attendant la décision ;
- `joint` — le compte joint l'absorbe : exclue de ce que chacun vire et du total commun, sommée
  dans `parJoint`, mais gardée dans les totaux par catégorie (la dépense a eu lieu).
Un extra créé dans l'app ou par le bot naît `a_financer` ; le cocher demande d'abord d'où vient l'argent.

## Hors périmètre V0 (feuilles anciennes)
- Feuilles « Mars/Avril 2023 » (par compte bancaire) et « Comptes 2023-24 » : format antérieur, non importé.
- Feuille « Garde Max 2024-2025 » (jours de garde × 70 €/j) : outil de simulation, non importé.
