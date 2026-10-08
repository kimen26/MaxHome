# Veille vols : les relevés de MaxVoyage dans MaxHome

MaxVoyage (projet séparé, base SQLite sur le PC) relève chaque matin à 07h15 les prix des vols
autour de nos vacances. MaxHome affiche le résultat dans l'onglet **Voyages › Pépites**, pour le
consulter depuis le téléphone sans ouvrir l'IHM locale de MaxVoyage.

## Le flux

```
MaxVoyage scripts/collect.py (07h15, PC)
  └─ fin de collecte réussie : écrit data/pepites.json (instantané, contrat ci-dessous)
     └─ lance MaxHome scripts/publier_pepites.py data/pepites.json
        └─ upsert de la ligne unique de la table veille_vols (contenu jsonb)
           └─ le front lit cette ligne (RLS est_membre(), lecture seule)
```

Pourquoi MaxHome publie, et pas MaxVoyage : la clé d'écriture Supabase de MaxHome reste dans le
seul `.env` de MaxHome. MaxVoyage ne connaît que le chemin du script (`MAXHOME_DIR`).

Pourquoi un instantané et pas les relevés bruts : MaxVoyage garde sa logique (prix achetable du
jour, seuils des alertes, thèmes de vacances). MaxHome n'en recalcule rien, il affiche.

PC éteint : pas de relevé, pas d'instantané. L'écran affiche toujours la date du relevé et
prévient au-delà de 2 jours.

## Contrat `pepites.json` (version 1)

Montants en **centimes entiers** (invariant MaxHome n° 4). Dates `AAAA-MM-JJ`.

```json
{
  "version": 1,
  "genere_le": "2026-10-07T07:21:04+02:00",
  "releve_le": "2026-10-07",
  "periodes": [
    {
      "cle": "2027-02-06",
      "titre": "Vacances de février 2027",
      "type": "vacances",
      "offres": [
        {
          "destination": "FUE", "ville": "Fuerteventura", "pays": "Espagne", "origine": "ORY",
          "depart": "2027-02-12", "retour": "2027-02-22", "nuits": 10,
          "voyageurs": 3, "prix_pp_centimes": 17800, "prix_total_centimes": 53400,
          "escales": 0, "compagnies": ["Vueling"], "duree_aller_min": 230,
          "seuil_pp_centimes": 20000, "sous_seuil": true,
          "tendance": "baisse", "baisse_pp_centimes": 1200,
          "lien": "https://www.google.com/travel/flights?..."
        }
      ]
    }
  ],
  "presse": [
    {
      "titre": "…", "lien": "https://…", "source": "…", "creneau": "Vacances de février",
      "prix_pp_centimes": 19900, "depart": "2027-02-13", "retour": "2027-02-20",
      "vu_le": "2026-10-06"
    }
  ]
}
```

- `periodes` : une par thème du digest Telegram (vacances d'un mois, ou « Week-ends hors
  vacances » avec `type: "weekend"`), triées dans l'ordre chronologique. Titre sans emoji.
- `offres` : **une par destination**, la moins chère au prix du dernier relevé (même règle que
  le tableau du digest : `latest_best`, prix encore achetable), triées par `prix_pp_centimes`.
- `seuil_pp_centimes` : seuil de l'alerte, `null` s'il n'y en a pas ; `sous_seuil` vrai si le
  prix par personne est au plus égal au seuil.
- `tendance` : `"nouveau"` (combinaison jamais relevée la veille), `"baisse"` (moins cher que
  la veille, `baisse_pp_centimes` renseigné), sinon `null`.
- `presse` : bons plans de la veille presse des 14 derniers jours qui touchent un de nos
  créneaux (`matched_window` non nul), 15 au plus, du plus récent au plus ancien. Champs
  inconnus à `null`.

## Les alertes : saisies dans MaxHome, relevées par MaxVoyage (D-056)

Les alertes (quoi surveiller) se créent et se modifient dans l'app, onglet **Voyages › Alertes**.
MaxHome fait foi : la table `veille_alertes` (migration 030) est la liste de référence.

```
MaxVoyage scripts/collect.py (07h15), AVANT la collecte
  └─ lance MaxHome scripts/lire_alertes.py → JSON sur la sortie standard (toutes les lignes)
     └─ recopie dans la table locale alerts, par id :
          ligne présente  → créée ou mise à jour
          ligne absente   → alerte locale désactivée (active = 0), historique gardé
     └─ MaxHome injoignable → la collecte part avec les alertes locales de la veille
```

Correspondance des champs `veille_alertes` → `alerts` (MaxVoyage) :

| MaxHome | MaxVoyage | Note |
|---|---|---|
| `id` | `id` | même numéro (les 11 alertes d'origine ont gardé le leur) |
| `nom` | `name` | |
| `type` `vacances` / `weekend` | `kind` `vacation` / `weekend` | |
| `periode_libelle`, `debut`, `fin`, `zone` | `vacation_label`, `vacation_start`, `vacation_end`, `zone` | dates `AAAA-MM-JJ` |
| `marge_avant`, `marge_apres` | `margin_before`, `margin_after` | |
| `nuits_min`, `nuits_max` | `stay_days_min`, `stay_days_max` | |
| `jours_depart` (0 = lundi) ou null | `weekdays_dep` (JSON) ou NULL | |
| `origines`, `destinations` | `origins`, `destinations` (JSON) | codes IATA |
| `prix_max_pp_centimes` ou null | `max_price` (€/pers, réel) ou NULL | ÷ 100 |
| `directs_seulement` | `direct_only` | |
| `recherches_max` | `max_queries` | |
| `adultes`, `enfants_naissances` | `adults`, `child_birthdates` (JSON) | |
| `active` | `active` | |

Pour que l'app propose les destinations par nom de ville, l'instantané `pepites.json` porte aussi
`aeroports` : la liste des aéroports connus de MaxVoyage, `[{"code", "ville", "pays"}]`, triée
par ville (champ additif, version 1 inchangée).
