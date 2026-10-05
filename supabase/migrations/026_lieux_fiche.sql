-- Fiches lieu visuelles (brief carnet-voyage.md, lot « fiches visuelles ») : une photo, un topo
-- (ce qu'on y voit/fait), des horaires en texte libre. Additif, idempotent.
--
-- Pourquoi : la ligne plate (nom + puce + statut) noie les idées et les lieux déjà réservés. La
-- photo vit dans le bucket Storage privé `voyages` (comme les pièces), seul le chemin est stocké
-- ici — même logique que `voyage_pieces.chemin`, jamais d'URL publique.

alter table voyage_lieux add column if not exists photo_chemin text;
alter table voyage_lieux add column if not exists topo text;
alter table voyage_lieux add column if not exists horaires text;
