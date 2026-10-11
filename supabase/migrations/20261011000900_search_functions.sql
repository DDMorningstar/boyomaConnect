-- =============================================================================
-- BOYOMA CONNECT — 0009 : recherche textuelle et géographique (RPC)
-- * Toutes les fonctions sont SECURITY INVOKER : la RLS s'applique (visiteurs = lieux publiés).
-- * Paramètres typés : aucune concaténation SQL dynamique (protection contre l'injection).
-- * Distances en mètres sur le type geography (sphéroïde WGS84).
-- =============================================================================

-- Requête plein texte « préfixe » construite à partir de mots normalisés [a-z0-9] uniquement.
create or replace function public.build_prefix_tsquery(p_query text)
returns tsquery
language sql
immutable
parallel safe
set search_path = ''
as $$
  select case when count(*) = 0 then null
    else to_tsquery('simple', string_agg(w || ':*', ' & '))
  end
  from unnest(regexp_split_to_array(regexp_replace(coalesce(public.normalize_text(p_query), ''), '[^a-z0-9 ]', ' ', 'g'), '\s+')) as w
  where char_length(w) >= 1;
$$;

-- Ouvert maintenant ? NULL si les horaires sont inconnus (aucune ligne place_hours).
create or replace function public.is_place_open_at(p_place_id uuid, p_at timestamptz default now(), p_tz text default 'Africa/Lubumbashi')
returns boolean
language sql
stable
set search_path = ''
as $$
  with local as (
    select (p_at at time zone p_tz) as ts
  ), d as (
    select extract(isodow from ts)::smallint as dow,
           case when extract(isodow from ts)::smallint = 1 then 7 else extract(isodow from ts)::smallint - 1 end as prev_dow,
           ts::time as t,
           ts::date as day
    from local
  ), special as (
    select s.* from public.place_special_hours s, d where s.place_id = p_place_id and s.date = d.day
  )
  select case
    when exists (select 1 from special) then
      exists (select 1 from special s, d where not s.is_closed and (
        (s.opens_at < s.closes_at and d.t >= s.opens_at and d.t < s.closes_at)
        or (s.opens_at > s.closes_at and (d.t >= s.opens_at or d.t < s.closes_at))))
    when not exists (select 1 from public.place_hours h where h.place_id = p_place_id) then null
    else exists (
      select 1 from public.place_hours h, d
      where h.place_id = p_place_id and not h.is_closed and (
        (h.day_of_week = d.dow and h.opens_at < h.closes_at and d.t >= h.opens_at and d.t < h.closes_at)
        or (h.day_of_week = d.dow and h.opens_at > h.closes_at and d.t >= h.opens_at)
        or (h.day_of_week = d.prev_dow and h.opens_at > h.closes_at and d.t < h.closes_at)
      ))
  end;
$$;
grant execute on function public.is_place_open_at(uuid, timestamptz, text) to anon, authenticated;

-- Catégorie + ses sous-catégories.
create or replace function public.category_with_children(p_slug text)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select c.id from public.categories c
  where c.slug = p_slug
     or c.parent_id = (select id from public.categories where slug = p_slug);
$$;

-- ------------------------------------------------------------- recherche principale
create or replace function public.search_places(
  p_query text default null,
  p_category_slug text default null,
  p_unit_id uuid default null,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_radius_m integer default null,
  p_price_max smallint default null,
  p_open_now boolean default false,
  p_verified_only boolean default false,
  p_sort text default 'relevance',     -- relevance | distance | recent | rating | name
  p_limit integer default 20,
  p_offset integer default 0
) returns table (
  id uuid, slug text, name text, short_description text,
  primary_category_id uuid, category_name text, category_slug text, category_icon text, category_color text,
  administrative_unit_id uuid, unit_name text,
  address_text text, landmark_description text,
  latitude double precision, longitude double precision,
  geographic_precision public.geographic_precision,
  verification_status public.place_verification_status,
  activity_status public.place_activity_status,
  price_range smallint, rating_avg numeric, rating_count integer,
  cover_path text, published_at timestamptz, last_verified_at timestamptz,
  distance_m double precision, relevance real, total_count bigint
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q text := left(public.normalize_text(p_query), 120);
  v_tsq tsquery := public.build_prefix_tsquery(left(p_query, 120));
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
        )::real
      end as rel
    from public.places p
    where p.publication_status = 'published'
      and p.merged_into_id is null
      and (v_q is null
        or (v_tsq is not null and p.search_vector @@ v_tsq)
        or v_q operator(extensions.<%) p.name_normalized
        or p.name_normalized operator(extensions.%) v_q)
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
    b.price_range, b.rating_avg, b.rating_count, b.cover_path, b.published_at, b.last_verified_at,
    b.dist, b.rel, count(*) over ()
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
$$;
grant execute on function public.search_places(text, text, uuid, double precision, double precision, integer, smallint, boolean, boolean, text, integer, integer) to anon, authenticated;

-- ------------------------------------------------------- carte : zone visible
-- Retour minimal (pour le clustering côté client). Plafond de 1000 points par requête.
create or replace function public.places_in_bbox(
  p_min_lng double precision, p_min_lat double precision,
  p_max_lng double precision, p_max_lat double precision,
  p_category_slug text default null,
  p_query text default null,
  p_limit integer default 500
) returns table (
  id uuid, slug text, name text, latitude double precision, longitude double precision,
  category_slug text, category_icon text, category_color text,
  verification_status public.place_verification_status, geographic_precision public.geographic_precision
)
language plpgsql
stable
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_q text := left(public.normalize_text(p_query), 120);
  v_tsq tsquery := public.build_prefix_tsquery(left(p_query, 120));
  v_env gis.geography;
begin
  if p_min_lng is null or p_min_lat is null or p_max_lng is null or p_max_lat is null
     or p_min_lat not between -90 and 90 or p_max_lat not between -90 and 90
     or p_min_lng not between -180 and 180 or p_max_lng not between -180 and 180
     or p_min_lat >= p_max_lat or p_min_lng >= p_max_lng then
    raise exception 'Emprise invalide' using errcode = '22023';
  end if;
  if (p_max_lat - p_min_lat) > 5 or (p_max_lng - p_min_lng) > 5 then
    raise exception 'Zone trop étendue : zoomez davantage' using errcode = '22023';
  end if;
  v_env := gis.st_makeenvelope(p_min_lng, p_min_lat, p_max_lng, p_max_lat, 4326)::gis.geography;

  return query
  select p.id, p.slug, p.name, p.latitude, p.longitude, c.slug, c.icon, c.color, p.verification_status, p.geographic_precision
  from public.places p
  left join public.categories c on c.id = p.primary_category_id
  where p.publication_status = 'published'
    and p.merged_into_id is null
    and p.location is not null
    and p.location operator(gis.&&) v_env
    and (p_category_slug is null or exists (
      select 1 from public.place_categories pc
      where pc.place_id = p.id and pc.category_id in (select public.category_with_children(p_category_slug))))
    and (v_q is null or (v_tsq is not null and p.search_vector @@ v_tsq) or v_q operator(extensions.<%) p.name_normalized)
  order by p.verification_status desc, p.published_at desc
  limit least(greatest(coalesce(p_limit, 500), 1), 1000);
end;
$$;
grant execute on function public.places_in_bbox(double precision, double precision, double precision, double precision, text, text, integer) to anon, authenticated;

-- ------------------------------------------------------------- suggestions
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
    (select 'unit', u.name, t.name, u.slug, u.id,
      greatest(extensions.word_similarity(q.n, u.name_normalized), case when u.name_normalized like q.n || '%' then 1 else 0 end)::real
     from public.geographic_units u cross join q
     join public.geographic_unit_types t on t.key = u.type_key
     where q.n is not null and char_length(q.n) >= 2 and u.is_active and u.type_key not in ('province')
       and (u.name_normalized like q.n || '%' or q.n operator(extensions.<%) u.name_normalized)
     order by 6 desc limit 3)
  ) s
  order by score desc, kind
  limit least(greatest(p_limit, 1), 15);
$$;
grant execute on function public.search_suggestions(text, integer) to anon, authenticated;

-- ------------------------------------------------------- comptages pour l'accueil
-- Nombre de lieux publiés par catégorie (les catégories parentes cumulent leurs enfants).
create or replace function public.category_place_counts()
returns table (category_id uuid, slug text, place_count bigint)
language sql
stable
set search_path = ''
as $$
  select c.id, c.slug, count(distinct pc.place_id)
  from public.categories c
  left join public.categories child on child.parent_id = c.id
  left join public.place_categories pc on pc.category_id in (c.id, child.id)
  left join public.places p on p.id = pc.place_id and p.publication_status = 'published' and p.merged_into_id is null
  where c.is_active and (pc.place_id is null or p.id is not null)
  group by c.id, c.slug;
$$;
grant execute on function public.category_place_counts() to anon, authenticated;

create or replace function public.unit_place_counts(p_parent_id uuid)
returns table (unit_id uuid, slug text, name text, place_count bigint)
language sql
stable
set search_path = ''
as $$
  select u.id, u.slug, u.name,
    (select count(*) from public.places p
      where p.publication_status = 'published' and p.merged_into_id is null
        and p.administrative_unit_id in (select public.geographic_unit_descendants(u.id)))
  from public.geographic_units u
  where u.parent_id = p_parent_id and u.is_active
  order by u.sort_order, u.name;
$$;
grant execute on function public.unit_place_counts(uuid) to anon, authenticated;

-- Lieux populaires — critère transparent et public : somme sur N jours des consultations
-- + 2 × appels/WhatsApp + 3 × demandes d'itinéraire (événements réels, dédupliqués).
create or replace function public.popular_places(p_days integer default 30, p_limit integer default 8)
returns table (id uuid, slug text, name text, short_description text, cover_path text,
  category_name text, category_icon text, category_color text, unit_name text, score bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.slug, p.name, p.short_description, p.cover_path, c.name, c.icon, c.color, u.name,
    sum(m.views + 2 * (m.phone_clicks + m.whatsapp_clicks) + 3 * m.directions_requests)::bigint as score
  from public.place_metrics_daily m
  join public.places p on p.id = m.place_id and p.publication_status = 'published' and p.merged_into_id is null
  left join public.categories c on c.id = p.primary_category_id
  left join public.geographic_units u on u.id = p.administrative_unit_id
  where m.day >= (now() at time zone 'Africa/Lubumbashi')::date - least(greatest(p_days, 1), 365)
  group by p.id, c.name, c.icon, c.color, u.name
  having sum(m.views + 2 * (m.phone_clicks + m.whatsapp_clicks) + 3 * m.directions_requests) > 0
  order by score desc
  limit least(greatest(p_limit, 1), 24);
$$;
grant execute on function public.popular_places(integer, integer) to anon, authenticated;

-- Redirection d'anciens slugs (301).
create or replace function public.resolve_place_slug(p_slug text)
returns text
language sql
stable
set search_path = ''
as $$
  select coalesce(
    (select p.slug from public.places p where p.slug = p_slug),
    (select coalesce(m.slug, p.slug) from public.place_slug_history h
       join public.places p on p.id = h.place_id
       left join public.places m on m.id = p.merged_into_id
       where h.slug = p_slug)
  );
$$;
grant execute on function public.resolve_place_slug(text) to anon, authenticated;
