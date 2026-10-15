-- =============================================================================
-- BOYOMA CONNECT — Recherche tolérante (décision D35)
-- Les mots du quotidien qui ne figurent pas dans le nom des établissements (« farmacie », « nganda »,
-- « zando », « dawa »…) renvoient vers la bonne catégorie. Les fautes de frappe sur le nom d'une
-- catégorie sont tolérées (trigrammes). Les correspondances naturelles restent devant (pertinence),
-- aucune pertinence n'est achetée.
-- Les entrées lingala (ln) et swahili (sw) sont marquées reviewed = false : à relire par des locuteurs.
-- =============================================================================

create table public.search_synonyms (
  term text primary key check (term = public.normalize_text(term) and char_length(term) between 3 and 60),
  category_slug text not null references public.categories (slug) on update cascade on delete cascade,
  lang text not null check (lang in ('fr', 'ln', 'sw', 'en')),
  reviewed boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.search_synonyms is
  'Mots courants (fautes fréquentes, lingala, swahili, anglais) renvoyant vers une catégorie de recherche.';
alter table public.search_synonyms enable row level security;
create policy "search_synonyms: lecture publique" on public.search_synonyms for select to anon, authenticated using (true);
create policy "search_synonyms: gestion" on public.search_synonyms for all to authenticated
  using (public.has_permission('categories.manage')) with check (public.has_permission('categories.manage'));
create index search_synonyms_term_trgm on public.search_synonyms using gin (term extensions.gin_trgm_ops);

insert into public.search_synonyms (term, category_slug, lang, reviewed)
select public.normalize_text(t), s, l, l in ('fr', 'en')
from (values
  -- Santé
  ('farmacie', 'pharmacies', 'fr'), ('farmacy', 'pharmacies', 'fr'), ('pharmacy', 'pharmacies', 'en'),
  ('dawa', 'pharmacies', 'sw'), ('duka la dawa', 'pharmacies', 'sw'), ('nkisi', 'pharmacies', 'ln'),
  ('lopitalo', 'hopitaux', 'ln'), ('hospitali', 'hopitaux', 'sw'), ('hospital', 'hopitaux', 'en'),
  ('dispensaire', 'centres-de-sante', 'fr'), ('clinic', 'cliniques', 'en'), ('kliniki', 'cliniques', 'sw'),
  ('maternite', 'maternites', 'fr'), ('labo', 'laboratoires', 'fr'),
  -- Restauration
  ('resto', 'restaurants', 'fr'), ('malewa', 'restaurants', 'ln'), ('bilei', 'restaurants', 'ln'),
  ('chakula', 'restaurants', 'sw'), ('nganda', 'bars', 'ln'), ('buvette', 'bars', 'fr'),
  ('terrasse', 'bars', 'fr'), ('pub', 'bars', 'en'), ('baa', 'bars', 'sw'),
  ('pain', 'boulangeries', 'fr'), ('lipa', 'boulangeries', 'ln'), ('mkate', 'boulangeries', 'sw'),
  -- Hébergement
  ('logement', 'hotels', 'fr'), ('lodge', 'hotels', 'en'), ('guest house', 'maisons-d-hotes', 'en'),
  -- Commerce
  ('zando', 'marches', 'ln'), ('soko', 'marches', 'sw'), ('market', 'marches', 'en'),
  ('alimentation', 'supermarches', 'fr'), ('supermarket', 'supermarches', 'en'),
  -- Services financiers
  ('bank', 'banques', 'en'), ('benki', 'banques', 'sw'), ('cabine', 'mobile-money', 'fr'),
  ('mpesa', 'mobile-money', 'fr'), ('m-pesa', 'mobile-money', 'fr'), ('orange money', 'mobile-money', 'fr'),
  ('airtel money', 'mobile-money', 'fr'), ('atm', 'distributeurs', 'en'),
  ('guichet automatique', 'distributeurs', 'fr'), ('transfert', 'agences-de-transfert', 'fr'),
  -- Éducation
  ('eteyelo', 'ecoles', 'ln'), ('shule', 'ecoles', 'sw'), ('school', 'ecoles', 'en'),
  ('university', 'universites', 'en'), ('chuo kikuu', 'universites', 'sw'),
  -- Religion
  ('kanisa', 'eglises', 'sw'), ('church', 'eglises', 'en'), ('ndako ya nzambe', 'eglises', 'ln'),
  ('msikiti', 'mosquees', 'sw'), ('mosque', 'mosquees', 'en'),
  -- Transport
  ('taxi', 'stations-de-taxis', 'fr'), ('taxi moto', 'stations-de-taxis', 'fr'),
  ('wewa', 'stations-de-taxis', 'ln'), ('toleka', 'stations-de-taxis', 'fr'),
  ('essence', 'stations-service', 'fr'), ('carburant', 'stations-service', 'fr'),
  ('mafuta', 'stations-service', 'sw'), ('mecanicien', 'garages', 'fr'), ('mecano', 'garages', 'fr'),
  ('bateau', 'transport-fluvial', 'fr'), ('baleiniere', 'transport-fluvial', 'fr'),
  -- Services
  ('salon de coiffure', 'coiffeurs', 'fr'), ('coiffeuse', 'coiffeurs', 'fr'),
  ('kinyozi', 'coiffeurs', 'sw'), ('barber', 'coiffeurs', 'en'), ('tailleur', 'couturiers', 'fr'),
  ('couture', 'couturiers', 'fr')
) v (t, s, l)
where exists (select 1 from public.categories c where c.slug = v.s);

-- Catégories évoquées par une requête : synonyme ou nom de catégorie proche (requête entière, 3 lettres
-- au moins), sous-catégories comprises.
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
      and (c.name_normalized = q.n or extensions.similarity(c.name_normalized, q.n) >= 0.55)
    union
    select public.category_with_children(s.category_slug)
    from public.search_synonyms s, q
    where q.n is not null and char_length(q.n) >= 3
      and (s.term = q.n or extensions.similarity(s.term, q.n) >= 0.6)
  ) t;
$$;
grant execute on function public.search_category_ids(text) to anon, authenticated, service_role;

create or replace function public.search_places(p_query text DEFAULT NULL::text, p_category_slug text DEFAULT NULL::text, p_unit_id uuid DEFAULT NULL::uuid, p_latitude double precision DEFAULT NULL::double precision, p_longitude double precision DEFAULT NULL::double precision, p_radius_m integer DEFAULT NULL::integer, p_price_max smallint DEFAULT NULL::smallint, p_open_now boolean DEFAULT false, p_verified_only boolean DEFAULT false, p_sort text DEFAULT 'relevance'::text, p_limit integer DEFAULT 20, p_offset integer DEFAULT 0)
 RETURNS TABLE(id uuid, slug text, name text, short_description text, primary_category_id uuid, category_name text, category_slug text, category_icon text, category_color text, administrative_unit_id uuid, unit_name text, address_text text, landmark_description text, latitude double precision, longitude double precision, geographic_precision public.geographic_precision, verification_status public.place_verification_status, activity_status public.place_activity_status, price_range smallint, rating_avg numeric, rating_count integer, cover_path text, published_at timestamp with time zone, last_verified_at timestamp with time zone, distance_m double precision, relevance real, total_count bigint, logo_path text)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO ''
AS $function$
#variable_conflict use_column
declare
  v_q text := left(public.normalize_text(p_query), 120);
  v_tsq tsquery := public.build_prefix_tsquery(left(p_query, 120));
  -- Recherche tolérante : catégories évoquées par la requête (synonymes, fautes de frappe).
  v_cats uuid[] := public.search_category_ids(p_query);
  v_pt gis.geography;
  v_radius integer := least(greatest(coalesce(p_radius_m, 0), 0), 50000);
  v_limit integer := least(greatest(coalesce(p_limit, 20), 1), 50);
  v_offset integer := least(greatest(coalesce(p_offset, 0), 0), 10000);
begin
  if p_latitude is not null and p_longitude is not null then
    if p_latitude not between -90 and 90 or p_longitude not between -180 and 180 then
      raise exception 'Coordonnées invalides' using errcode = '22023';
    end if;
    v_pt := gis.st_setsrid(gis.st_makepoint(p_longitude, p_latitude), 4326)::gis.geography;
  end if;
  if p_sort = 'distance' and v_pt is null then
    raise exception 'Le tri par distance nécessite une position' using errcode = '22023';
  end if;

  return query
  with base as (
    select p.*,
      case when v_pt is not null and p.location is not null then gis.st_distance(p.location, v_pt) end as dist,
      case when v_q is null then 0::real
        else (
          coalesce(ts_rank(p.search_vector, v_tsq), 0)::real
          + greatest(extensions.similarity(p.name_normalized, v_q), extensions.word_similarity(v_q, p.name_normalized))
          + case when p.name_normalized = v_q then 1 when p.name_normalized like v_q || '%' then 0.5 else 0 end
          + case when v_cats is not null and exists (
              select 1 from public.place_categories pc
              where pc.place_id = p.id and pc.category_id = any (v_cats)) then 0.3 else 0 end
        )::real
      end as rel
    from public.places p
    where p.publication_status = 'published'
      and p.merged_into_id is null
      and (v_q is null
        or (v_tsq is not null and p.search_vector @@ v_tsq)
        or v_q operator(extensions.<%) p.name_normalized
        or p.name_normalized operator(extensions.%) v_q
        or (v_cats is not null and exists (
          select 1 from public.place_categories pc
          where pc.place_id = p.id and pc.category_id = any (v_cats))))
      and (p_category_slug is null or exists (
        select 1 from public.place_categories pc
        where pc.place_id = p.id and pc.category_id in (select public.category_with_children(p_category_slug))))
      and (p_unit_id is null or p.administrative_unit_id in (select public.geographic_unit_descendants(p_unit_id)))
      and (v_pt is null or v_radius = 0 or (p.location is not null and gis.st_dwithin(p.location, v_pt, v_radius)))
      and (p_price_max is null or p.price_range <= p_price_max)
      and (not coalesce(p_verified_only, false) or p.verification_status <> 'unverified')
      and (not coalesce(p_open_now, false) or public.is_place_open_at(p.id) is true)
  )
  select b.id, b.slug, b.name, b.short_description,
    b.primary_category_id, c.name, c.slug, c.icon, c.color,
    b.administrative_unit_id, u.name,
    b.address_text, b.landmark_description,
    b.latitude, b.longitude, b.geographic_precision, b.verification_status, b.activity_status,
    b.price_range, b.rating_avg, b.rating_count,
    coalesce(b.cover_path, (
      select m.storage_path from public.place_media m
      where m.place_id = b.id and m.moderation_status = 'approved' and m.kind in ('cover', 'gallery')
      order by (m.kind = 'cover') desc, m.sort_order, m.created_at limit 1)),
    b.published_at, b.last_verified_at,
    b.dist, b.rel, count(*) over (), b.logo_path
  from base b
  left join public.categories c on c.id = b.primary_category_id
  left join public.geographic_units u on u.id = b.administrative_unit_id
  order by
    case when p_sort = 'distance' then b.dist end asc nulls last,
    case when p_sort = 'recent' then b.published_at end desc nulls last,
    case when p_sort = 'rating' then b.rating_avg end desc nulls last,
    case when p_sort = 'rating' then b.rating_count end desc,
    case when p_sort = 'name' then b.name_normalized end asc,
    b.rel desc,
    b.dist asc nulls last,
    b.published_at desc nulls last,
    b.id
  limit v_limit offset v_offset;
end;
$function$;

-- Suggestions : une catégorie est aussi proposée quand la saisie correspond à l'un de ses synonymes.
create or replace function public.search_suggestions(p_query text, p_limit integer DEFAULT 8)
 RETURNS TABLE(kind text, label text, sublabel text, slug text, ref_id uuid, score real)
 LANGUAGE sql
 STABLE
 SET search_path TO ''
AS $function$
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
      greatest(
        extensions.word_similarity(q.n, c.name_normalized),
        case when c.name_normalized like q.n || '%' then 1 else 0 end,
        coalesce((select max(case when s.term like q.n || '%' then 0.9 else extensions.similarity(s.term, q.n) end)
          from public.search_synonyms s where s.category_slug = c.slug), 0)
      )::real
     from public.categories c cross join q
     left join public.categories parent on parent.id = c.parent_id
     where q.n is not null and char_length(q.n) >= 2 and c.is_active
       and (c.name_normalized like q.n || '%' or q.n operator(extensions.<%) c.name_normalized
         or exists (select 1 from public.search_synonyms s where s.category_slug = c.slug
           and (s.term like q.n || '%' or (char_length(q.n) >= 3 and extensions.similarity(s.term, q.n) >= 0.6))))
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
$function$;
