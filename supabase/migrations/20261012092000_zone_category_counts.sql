-- =============================================================================
-- BOYOMA CONNECT — 0019 : nombre de lieux par catégorie dans une zone (décision D29)
-- Paramètre facultatif p_unit_id (descendants compris) ; sans lui, résultat identique à avant.
-- L'ancienne signature sans paramètre est remplacée (un appel sans argument serait ambigu).
-- =============================================================================

drop function public.category_place_counts();

create function public.category_place_counts(p_unit_id uuid default null)
returns table (category_id uuid, slug text, place_count bigint)
language sql
stable
set search_path = ''
as $$
  select c.id, c.slug, count(distinct p.id)
  from public.categories c
  left join public.categories child on child.parent_id = c.id
  left join public.place_categories pc on pc.category_id in (c.id, child.id)
  left join public.places p on p.id = pc.place_id and p.publication_status = 'published' and p.merged_into_id is null
    and (p_unit_id is null or p.administrative_unit_id in (select public.geographic_unit_descendants(p_unit_id)))
  where c.is_active
  group by c.id, c.slug;
$$;
grant execute on function public.category_place_counts(uuid) to anon, authenticated;
