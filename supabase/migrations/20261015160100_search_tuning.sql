-- =============================================================================
-- BOYOMA CONNECT — Recherche tolérante : réglage (décision D35)
-- Seuil mesuré sur des fautes réelles : « restaurent » 0,44, « coifeur » / « hopitale » / « ecol » 0,50
-- contre « restaurants », « coiffeurs », « hopitaux », « ecoles ». Les orthographes phonétiques trop
-- éloignées (« restorant » 0,38) passent par des synonymes.
-- =============================================================================

create or replace function public.search_category_ids(p_query text)
returns uuid[]
language sql
stable
set search_path = ''
as $$
  with q as (select left(public.normalize_text(p_query), 80) as n)
  select array_agg(distinct x) from (
    select public.category_with_children(c.slug) as x
    from public.categories c, q
    where q.n is not null and char_length(q.n) >= 3 and c.is_active
      and (c.name_normalized = q.n or extensions.similarity(c.name_normalized, q.n) >= 0.42)
    union
    select public.category_with_children(s.category_slug)
    from public.search_synonyms s, q
    where q.n is not null and char_length(q.n) >= 3
      and (s.term = q.n or extensions.similarity(s.term, q.n) >= 0.6)
  ) t;
$$;

insert into public.search_synonyms (term, category_slug, lang, reviewed)
select public.normalize_text(t), s, 'fr', true
from (values
  ('restorant', 'restaurants'), ('restaurent', 'restaurants'), ('boulangeri', 'boulangeries'),
  ('quincaillerie', 'quincailleries'), ('lopital', 'hopitaux'),
  ('pharma', 'pharmacies'), ('photocopie', 'imprimeurs')
) v (t, s)
where exists (select 1 from public.categories c where c.slug = v.s)
on conflict (term) do nothing;
