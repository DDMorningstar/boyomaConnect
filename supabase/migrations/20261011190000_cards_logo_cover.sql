-- =============================================================================
-- BOYOMA CONNECT — 0014 : visuel des cartes de lieux (décision D25)
-- search_places et popular_places renvoient aussi `logo_path` ; `cover_path` retombe sur la
-- première photo approuvée (fiches gérées par leur propriétaire, dont les photos sont dans
-- place_media). Le type de retour change : les fonctions sont recréées à l'identique sinon.
-- =============================================================================

drop function public.search_places(text, text, uuid, double precision, double precision, integer, smallint, boolean, boolean, text, integer, integer);

create function public.search_places(
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
  distance_m double precision, relevance real, total_count bigint,
  logo_path text
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
$$;
grant execute on function public.search_places(text, text, uuid, double precision, double precision, integer, smallint, boolean, boolean, text, integer, integer) to anon, authenticated;

drop function public.popular_places(integer, integer);

create function public.popular_places(p_days integer default 30, p_limit integer default 8)
returns table (id uuid, slug text, name text, short_description text, cover_path text,
  category_name text, category_icon text, category_color text, unit_name text, score bigint, logo_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.slug, p.name, p.short_description,
    coalesce(p.cover_path, (
      select m.storage_path from public.place_media m
      where m.place_id = p.id and m.moderation_status = 'approved' and m.kind in ('cover', 'gallery')
      order by (m.kind = 'cover') desc, m.sort_order, m.created_at limit 1)),
    c.name, c.icon, c.color, u.name,
    sum(m.views + 2 * (m.phone_clicks + m.whatsapp_clicks) + 3 * m.directions_requests)::bigint as score,
    p.logo_path
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
revoke execute on function public.popular_places(integer, integer) from public;
grant execute on function public.popular_places(integer, integer) to anon, authenticated;
