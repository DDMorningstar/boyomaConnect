-- =============================================================================
-- BOYOMA CONNECT — 0017 : zones (province, ville, territoires) côté interface (décision D29)
--  * places_in_bbox : emprise maximale portée de 5° à 12° pour afficher toute la province
--    (≈ 6° × 4,5°) ; le nombre de lieux renvoyés reste plafonné (1 000).
--  * popular_places : filtre facultatif par unité géographique (descendants compris).
-- =============================================================================

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
  if (p_max_lat - p_min_lat) > 12 or (p_max_lng - p_min_lng) > 12 then
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

-- Nouvelle signature (paramètre de zone) : l'ancienne est remplacée pour éviter une surcharge ambiguë.
drop function public.popular_places(integer, integer);

create function public.popular_places(p_days integer default 30, p_limit integer default 8, p_unit_id uuid default null)
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
    and (p_unit_id is null or p.administrative_unit_id in (select public.geographic_unit_descendants(p_unit_id)))
  group by p.id, c.name, c.icon, c.color, u.name
  having sum(m.views + 2 * (m.phone_clicks + m.whatsapp_clicks) + 3 * m.directions_requests) > 0
  order by score desc
  limit least(greatest(p_limit, 1), 24);
$$;
revoke execute on function public.popular_places(integer, integer, uuid) from public;
grant execute on function public.popular_places(integer, integer, uuid) to anon, authenticated;
