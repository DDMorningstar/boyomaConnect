-- =============================================================================
-- BOYOMA CONNECT — 0018 : suggestions de recherche pour les zones (décision D29)
-- Province, ville et territoires renvoyés avec kind = 'zone' (page /zones/<slug>) ;
-- les communes restent kind = 'unit' (page /communes/<slug>). Le reste est inchangé.
-- =============================================================================

create or replace function public.search_suggestions(p_query text, p_limit integer default 8)
returns table (kind text, label text, sublabel text, slug text, ref_id uuid, score real)
language sql
stable
set search_path = ''
as $$
  with q as (select left(public.normalize_text(p_query), 80) as n)
  select * from (
    (select 'place'::text as kind, p.name as label, coalesce(u.name, c.name) as sublabel, p.slug as slug, p.id as ref_id,
      greatest(extensions.word_similarity(q.n, p.name_normalized), case when p.name_normalized like q.n || '%' then 1 else 0 end)::real as score
     from public.places p cross join q
     left join public.geographic_units u on u.id = p.administrative_unit_id
     left join public.categories c on c.id = p.primary_category_id
     where q.n is not null and char_length(q.n) >= 2 and p.publication_status = 'published' and p.merged_into_id is null
       and (p.name_normalized like q.n || '%' or q.n operator(extensions.<%) p.name_normalized)
     order by 6 desc limit 6)
    union all
    (select 'category', c.name, parent.name, c.slug, c.id,
      greatest(extensions.word_similarity(q.n, c.name_normalized), case when c.name_normalized like q.n || '%' then 1 else 0 end)::real
     from public.categories c cross join q
     left join public.categories parent on parent.id = c.parent_id
     where q.n is not null and char_length(q.n) >= 2 and c.is_active
       and (c.name_normalized like q.n || '%' or q.n operator(extensions.<%) c.name_normalized)
     order by 6 desc limit 3)
    union all
    (select case when u.type_key in ('province', 'ville', 'territoire') then 'zone' else 'unit' end,
      u.name, t.name, u.slug, u.id,
      greatest(extensions.word_similarity(q.n, u.name_normalized), case when u.name_normalized like q.n || '%' then 1 else 0 end)::real
     from public.geographic_units u cross join q
     join public.geographic_unit_types t on t.key = u.type_key
     where q.n is not null and char_length(q.n) >= 2 and u.is_active
       and (u.name_normalized like q.n || '%' or q.n operator(extensions.<%) u.name_normalized)
     order by 6 desc limit 3)
  ) s
  order by score desc, kind
  limit least(greatest(p_limit, 1), 15);
$$;
grant execute on function public.search_suggestions(text, integer) to anon, authenticated;
