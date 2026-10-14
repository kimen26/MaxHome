-- Partage d'un voyage par lien (brief fiche-voyage-v3.md, lot 3). Additif, idempotent, sans
-- aucun drop (L-056) : la table et la fonction se créent si absentes / se remplacent.
--
-- Un jeton (uuid aléatoire) ouvre une page publique en LECTURE SEULE. La page n'a pas de
-- session : elle appelle la fonction `voyage_partage`, seul chemin d'accès (la table, elle,
-- reste réservée aux deux comptes du foyer par la RLS). Supprimer la ligne = le lien meurt.

create table if not exists voyage_partages (
  jeton      uuid primary key default gen_random_uuid(),
  voyage_id  bigint not null unique references voyages(id) on delete cascade,
  cree_par   text,
  cree_le    timestamptz not null default now()
);

alter table voyage_partages enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'voyage_partages' and policyname = 'voyage_partages_rw') then
    create policy voyage_partages_rw on voyage_partages for all using (est_membre()) with check (est_membre());
  end if;
end $$;

-- Ce que voit un porteur de lien : le voyage, ses lieux, ses résas (sans code, prix, payeur,
-- prestataire, note, poste) et ses blocs. Ni À faire, ni enveloppes, ni pièces. Jeton inconnu
-- → null. security definer : la fonction lit à la place de l'anonyme, d'où la liste blanche
-- de champs ci-dessous (ajouter une colonne à une table ne l'expose JAMAIS ici).
create or replace function public.voyage_partage(p_jeton uuid) returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'voyage', jsonb_build_object('titre', v.titre, 'lieu', v.lieu, 'debut', v.debut, 'fin', v.fin),
    'lieux', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id, 'nom', l.nom, 'categorie', l.categorie, 'statut', l.statut, 'jour', l.jour,
        'ordre', l.ordre, 'lat', l.lat, 'lng', l.lng, 'lien', l.lien, 'topo', l.topo, 'horaires', l.horaires
      ) order by l.jour nulls last, l.ordre, l.id)
      from voyage_lieux l where l.voyage_id = v.id), '[]'::jsonb),
    'resas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id, 'type', r.type, 'titre', r.titre, 'debut', r.debut, 'fin', r.fin,
        'statut', r.statut, 'lieu_id', r.lieu_id
      ) order by r.debut nulls last, r.id)
      from voyage_resas r where r.voyage_id = v.id and r.statut <> 'annule'), '[]'::jsonb),
    'blocs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'type', b.type, 'titre', b.titre, 'texte', b.texte, 'ordre', b.ordre
      ) order by b.ordre, b.id)
      from voyage_blocs b where b.voyage_id = v.id), '[]'::jsonb)
  )
  from voyage_partages p
  join voyages v on v.id = p.voyage_id
  where p.jeton = p_jeton;
$$;

revoke all on function public.voyage_partage(uuid) from public;
grant execute on function public.voyage_partage(uuid) to anon, authenticated;
