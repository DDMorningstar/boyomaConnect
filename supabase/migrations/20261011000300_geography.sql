-- =============================================================================
-- BOYOMA CONNECT — 0003 : référentiel géographique
-- Hiérarchie souple : Pays → Province → Ville/Territoire → Commune/Secteur/Chefferie
-- → Quartier/Groupement → Avenue/Village. Chaque unité référence son parent ;
-- aucune profondeur fixe n'est imposée (toutes les villes n'ont pas les mêmes subdivisions).
-- Décision : les provinces sont des geographic_units de type 'province' (pas de table dédiée).
-- =============================================================================

create type public.verification_level as enum ('unverified', 'verified');

create table public.countries (
  code char(2) primary key check (code ~ '^[A-Z]{2}$'), -- ISO 3166-1 alpha-2
  name text not null,
  default_currency char(3) not null,
  default_timezone text not null,
  created_at timestamptz not null default now()
);

create table public.geographic_unit_types (
  key text primary key check (key ~ '^[a-z_]+$'),
  name text not null,
  description text,
  typical_level smallint not null -- 1 = province … 5 = avenue/village (indicatif)
);

create table public.geographic_units (
  id uuid primary key default gen_random_uuid(),
  country_code char(2) not null references public.countries (code),
  parent_id uuid references public.geographic_units (id) on delete restrict,
  type_key text not null references public.geographic_unit_types (key),
  name text not null check (char_length(name) between 1 and 120),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_normalized text generated always as (public.normalize_text(name)) stored,
  -- Centre indicatif (pour centrer la carte). NULL si inconnu : ne jamais inventer.
  center_latitude double precision check (center_latitude between -90 and 90),
  center_longitude double precision check (center_longitude between -180 and 180),
  center gis.geography(Point, 4326) generated always as (
    case when center_latitude is not null and center_longitude is not null
      then gis.st_setsrid(gis.st_makepoint(center_longitude, center_latitude), 4326)::gis.geography
    end
  ) stored,
  default_zoom numeric(4, 2) check (default_zoom between 1 and 20),
  verification public.verification_level not null default 'unverified',
  source text,                          -- origine de l'information
  is_active boolean not null default true,
  sort_order integer not null default 0,
  ancestors uuid[] not null default '{}', -- ids des ancêtres + soi-même (maintenu par trigger)
  depth smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint geographic_units_center_pair check ((center_latitude is null) = (center_longitude is null)),
  constraint geographic_units_unique_slug unique nulls not distinct (parent_id, type_key, slug)
);
create index geographic_units_parent_idx on public.geographic_units (parent_id);
create index geographic_units_type_idx on public.geographic_units (type_key);
create index geographic_units_ancestors_idx on public.geographic_units using gin (ancestors);
create index geographic_units_name_trgm_idx on public.geographic_units using gin (name_normalized extensions.gin_trgm_ops);
create trigger geographic_units_updated_at before update on public.geographic_units
  for each row execute function public.set_updated_at();

-- Maintien de ancestors/depth et interdiction des cycles.
create or replace function public.geographic_units_set_path()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_parent_ancestors uuid[];
  v_parent_depth smallint;
begin
  if new.parent_id is null then
    new.ancestors := array[new.id];
    new.depth := 0;
  else
    select ancestors, depth into v_parent_ancestors, v_parent_depth
    from public.geographic_units where id = new.parent_id;
    if v_parent_ancestors is null then
      raise exception 'Unité parente introuvable';
    end if;
    if new.id = any (v_parent_ancestors) then
      raise exception 'Cycle détecté dans la hiérarchie géographique';
    end if;
    new.ancestors := v_parent_ancestors || new.id;
    new.depth := v_parent_depth + 1;
  end if;
  return new;
end;
$$;
create trigger geographic_units_path
  before insert or update of parent_id on public.geographic_units
  for each row execute function public.geographic_units_set_path();

-- Si une unité change de parent, recalcule les descendants.
create or replace function public.geographic_units_cascade_path()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is distinct from old.parent_id then
    update public.geographic_units c
      set parent_id = c.parent_id -- déclenche geographic_units_path
      where c.parent_id = new.id;
  end if;
  return null;
end;
$$;
create trigger geographic_units_cascade
  after update of parent_id on public.geographic_units
  for each row execute function public.geographic_units_cascade_path();

-- Points de repère locaux (« derrière le marché », « rond-point… »).
create table public.local_landmarks (
  id uuid primary key default gen_random_uuid(),
  unit_id uuid not null references public.geographic_units (id) on delete restrict,
  name text not null check (char_length(name) between 2 and 160),
  name_normalized text generated always as (public.normalize_text(name)) stored,
  description text,
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  location gis.geography(Point, 4326) generated always as (
    case when latitude is not null and longitude is not null
      then gis.st_setsrid(gis.st_makepoint(longitude, latitude), 4326)::gis.geography
    end
  ) stored,
  verification public.verification_level not null default 'unverified',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint local_landmarks_coord_pair check ((latitude is null) = (longitude is null))
);
create index local_landmarks_unit_idx on public.local_landmarks (unit_id);
create index local_landmarks_location_idx on public.local_landmarks using gist (location);
create index local_landmarks_name_trgm_idx on public.local_landmarks using gin (name_normalized extensions.gin_trgm_ops);
create trigger local_landmarks_updated_at before update on public.local_landmarks
  for each row execute function public.set_updated_at();

-- Limites géographiques : uniquement lorsque des données fiables et sous licence compatible existent.
create table public.geographic_boundaries (
  unit_id uuid primary key references public.geographic_units (id) on delete cascade,
  boundary gis.geography(MultiPolygon, 4326) not null,
  source text not null,
  license text not null,
  verified_at timestamptz,
  created_at timestamptz not null default now()
);
create index geographic_boundaries_gix on public.geographic_boundaries using gist (boundary);

-- Descendants d'une unité (soi-même inclus).
create or replace function public.geographic_unit_descendants(p_unit_id uuid)
returns setof uuid
language sql
stable
set search_path = ''
as $$
  select id from public.geographic_units where p_unit_id = any (ancestors);
$$;

-- ------------------------------------------------------------------- RLS
alter table public.countries enable row level security;
alter table public.geographic_unit_types enable row level security;
alter table public.geographic_units enable row level security;
alter table public.local_landmarks enable row level security;
alter table public.geographic_boundaries enable row level security;

create policy "pays lisibles" on public.countries for select to anon, authenticated using (true);
create policy "types lisibles" on public.geographic_unit_types for select to anon, authenticated using (true);
create policy "unités actives lisibles" on public.geographic_units for select to anon, authenticated
  using (is_active or public.has_permission('geography.manage'));
create policy "repères lisibles" on public.local_landmarks for select to anon, authenticated using (true);
create policy "limites lisibles" on public.geographic_boundaries for select to anon, authenticated using (true);

create policy "pays gérés" on public.countries for all to authenticated
  using (public.has_permission('geography.manage')) with check (public.has_permission('geography.manage'));
create policy "types gérés" on public.geographic_unit_types for all to authenticated
  using (public.has_permission('geography.manage')) with check (public.has_permission('geography.manage'));
create policy "unités gérées" on public.geographic_units for all to authenticated
  using (public.has_permission('geography.manage')) with check (public.has_permission('geography.manage'));
create policy "repères gérés" on public.local_landmarks for all to authenticated
  using (public.has_permission('geography.manage')) with check (public.has_permission('geography.manage'));
create policy "repères proposés par les agents" on public.local_landmarks for insert to authenticated
  with check (public.has_permission('field.collect') and created_by = auth.uid() and verification = 'unverified');
create policy "limites gérées" on public.geographic_boundaries for all to authenticated
  using (public.has_permission('geography.manage')) with check (public.has_permission('geography.manage'));

-- -------------------------------------------------------------- données
insert into public.countries (code, name, default_currency, default_timezone)
values ('CD', 'République démocratique du Congo', 'CDF', 'Africa/Lubumbashi');

insert into public.geographic_unit_types (key, name, description, typical_level) values
  ('province', 'Province', null, 1),
  ('ville', 'Ville', 'Entité urbaine décentralisée', 2),
  ('territoire', 'Territoire', 'Entité administrative rurale', 2),
  ('commune', 'Commune', 'Subdivision d''une ville (ou commune rurale)', 3),
  ('secteur', 'Secteur', 'Subdivision d''un territoire', 3),
  ('chefferie', 'Chefferie', 'Subdivision coutumière d''un territoire', 3),
  ('quartier', 'Quartier', 'Subdivision d''une commune', 4),
  ('groupement', 'Groupement', 'Subdivision d''un secteur ou d''une chefferie', 4),
  ('avenue', 'Avenue / rue', null, 5),
  ('village', 'Village', null, 5),
  ('localite', 'Localité', 'Autre subdivision locale', 5);

-- Province de la Tshopo, ville de Kisangani et ses six communes officielles.
-- Le centre de Kisangani (≈ 0.5153 N, 25.1910 E) sert uniquement à centrer la carte ;
-- aucune coordonnée n'est attribuée aux communes tant qu'elle n'est pas vérifiée.
with province as (
  insert into public.geographic_units (country_code, type_key, name, slug, verification, source, sort_order)
  values ('CD', 'province', 'Tshopo', 'tshopo', 'verified', 'Constitution RDC 2006, art. 2', 0)
  returning id
), ville as (
  insert into public.geographic_units (country_code, parent_id, type_key, name, slug,
    center_latitude, center_longitude, default_zoom, verification, source, sort_order)
  select 'CD', province.id, 'ville', 'Kisangani', 'kisangani', 0.5153, 25.1910, 12.5, 'verified',
    'Chef-lieu de la province de la Tshopo ; centre indicatif pour la carte', 0
  from province
  returning id
)
insert into public.geographic_units (country_code, parent_id, type_key, name, slug, verification, source, sort_order)
select 'CD', ville.id, 'commune', c.name, c.slug, 'verified', 'Six communes officielles de la ville de Kisangani', c.ord
from ville cross join (values
  ('Makiso', 'makiso', 1),
  ('Mangobo', 'mangobo', 2),
  ('Tshopo', 'tshopo', 3),
  ('Kabondo', 'kabondo', 4),
  ('Kisangani', 'kisangani', 5),
  ('Lubunga', 'lubunga', 6)
) as c(name, slug, ord);
