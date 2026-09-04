# Architecture proposée (voir D-001)

```
GitHub (repo public, code seul)  --Pages-->  navigateur Claudia / Yann
                                                  |  supabase-js (clé anon)
                                                  v
                                   Supabase : Auth (2 comptes) + Postgres + RLS
```

## Sécurité
- Inscription publique désactivée ; comptes créés à la main dans le dashboard.
- Chaque table a une politique RLS `auth.uid() IN (select id from membres)`.
- Aucun secret côté client : la clé anon est prévue pour être publiée.
- Le service_role key ne quitte jamais le `.env` local (scripts d'import).

## Modèle de données (à affiner après lecture de l'Excel)
- `mois` (annee, mois, salaire_claudia, salaire_yann)
- `charges` (libelle, categorie, regle: 50_50 | prorata | fixe, actif)
- `lignes` (mois_id, charge_id, montant_centimes, paye_par)
