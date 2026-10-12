-- =============================================================================
-- BOYOMA CONNECT — 0016 : élargissement à la province de la Tshopo (décision D29)
--  * Les 7 territoires de la Tshopo (découpage officiel ; limites : Référentiel Géographique Commun
--    RDC, OCHA 2019, CC BY 3.0 IGO — chargées par supabase/seeds/limites-tshopo.sql).
--  * locate_unit() : unité la plus précise contenant un point (selon les limites disponibles).
--  * Rattachement automatique d'un lieu d'après sa position : uniquement pour compléter ou préciser
--    (jamais pour contredire une commune choisie). Sans limite connue, rien ne change.
-- =============================================================================

insert into public.geographic_units (country_code, parent_id, type_key, name, slug, verification, source, sort_order)
select 'CD', p.id, 'territoire', t.name, t.slug, 'verified',
  'Territoires de la province de la Tshopo — Référentiel Géographique Commun RDC (OCHA, 2019)', t.ord
from public.geographic_units p
cross join (values
  ('Bafwasende', 'bafwasende', 1),
  ('Banalia', 'banalia', 2),
  ('Basoko', 'basoko', 3),
  ('Isangi', 'isangi', 4),
  ('Opala', 'opala', 5),
  ('Ubundu', 'ubundu', 6),
  ('Yahuma', 'yahuma', 7)
) as t(name, slug, ord)
where p.slug = 'tshopo' and p.type_key = 'province'
on conflict on constraint geographic_units_unique_slug do nothing;

-- Unité la plus précise (la plus profonde) dont la limite contient le point.
create or replace function public.locate_unit(p_latitude double precision, p_longitude double precision)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select u.id
  from public.geographic_boundaries b
  join public.geographic_units u on u.id = b.unit_id and u.is_active
  where p_latitude between -90 and 90 and p_longitude between -180 and 180
    and gis.st_intersects(b.boundary, gis.st_setsrid(gis.st_makepoint(p_longitude, p_latitude), 4326)::gis.geography)
  order by u.depth desc
  limit 1;
$$;
grant execute on function public.locate_unit(double precision, double precision) to anon, authenticated;

-- Nom en « zz » : s'exécute après places_guard_update (ordre alphabétique des triggers BEFORE).
create or replace function public.places_zz_assign_unit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_unit uuid;
begin
  if new.latitude is null or new.longitude is null then
    return new;
  end if;
  v_unit := public.locate_unit(new.latitude, new.longitude);
  if v_unit is null or v_unit = new.administrative_unit_id then
    return new;
  end if;
  -- Compléter (aucun rattachement) ou préciser (l'unité trouvée est contenue dans l'actuelle).
  if new.administrative_unit_id is null
     or exists (select 1 from public.geographic_units g where g.id = v_unit and new.administrative_unit_id = any (g.ancestors)) then
    new.administrative_unit_id := v_unit;
  end if;
  return new;
end;
$$;
create trigger places_zz_assign_unit before insert or update of latitude, longitude, administrative_unit_id
  on public.places for each row execute function public.places_zz_assign_unit();
revoke execute on function public.places_zz_assign_unit() from public, anon, authenticated;

-- Centre et zoom des unités calculés depuis leur limite (pour cadrer la carte), si non renseignés.
create or replace function public.refresh_unit_centers()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.geographic_units u
  set center_latitude = gis.st_y(gis.st_pointonsurface(b.boundary::gis.geometry)),
      center_longitude = gis.st_x(gis.st_pointonsurface(b.boundary::gis.geometry)),
      default_zoom = least(13, greatest(6, round(log(2::numeric, (360 / greatest(
        gis.st_xmax(b.boundary::gis.geometry) - gis.st_xmin(b.boundary::gis.geometry),
        gis.st_ymax(b.boundary::gis.geometry) - gis.st_ymin(b.boundary::gis.geometry), 0.01))::numeric) + 0.6, 1)))
  from public.geographic_boundaries b
  where b.unit_id = u.id and u.center_latitude is null;
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
revoke execute on function public.refresh_unit_centers() from public, anon, authenticated;
