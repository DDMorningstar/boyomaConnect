-- =============================================================================
-- BOYOMA CONNECT — 0020 : module d'importation de données géographiques (décision D30)
--
-- Sources légalement réutilisables uniquement (OpenStreetMap/ODbL, données ouvertes à licence
-- déclarée, futurs partenaires et établissements). Aucune extraction de Google Maps.
--
--   import_sources          sources, licence, attribution, partage à l'identique, limites d'appel
--   osm_category_mappings   correspondances étiquettes OSM → catégories Boyoma (éditables)
--   import_batches          lots (journal : créés, actualisés, ignorés, rejetés, quarantaine)
--   import_items            lieux du lot : valeurs normalisées, anomalies, doublons, décision
--   import_schedules        synchronisations périodiques contrôlées
--   place_external_refs     + date de collecte, lot, extras ; sources autres qu'OSM autorisées
--
-- Écritures sensibles : fonctions SECURITY DEFINER (permission imports.manage, audit_logs,
-- boyoma.internal_write). Réutilisable pour toute unité géographique de la RDC.
-- =============================================================================

-- ------------------------------------------------------------------ permissions
insert into public.permissions (key, description) values
  ('imports.view', 'Consulter les importations de données'),
  ('imports.manage', 'Lancer, contrôler et publier des importations de données')
on conflict (key) do nothing;

insert into public.role_permissions (role_key, permission_key)
select r.role_key, r.permission_key
from (values
  ('super_admin', 'imports.view'), ('super_admin', 'imports.manage'),
  ('admin', 'imports.view'), ('admin', 'imports.manage'),
  ('moderator', 'imports.view')
) as r(role_key, permission_key)
where exists (select 1 from public.roles where key = r.role_key)
on conflict do nothing;

-- ------------------------------------------------------------------------ types
create type public.import_source_kind as enum ('osm', 'open_data', 'partner', 'owner');
create type public.import_batch_status as enum ('staging', 'ready', 'importing', 'completed', 'failed', 'cancelled');
create type public.import_item_status as enum
  ('ready', 'existing', 'duplicate', 'quarantined', 'rejected', 'imported', 'updated', 'skipped');
create type public.import_publication_mode as enum ('review', 'publish');

-- ---------------------------------------------------------------------- sources
create table public.import_sources (
  key text primary key check (key ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (char_length(name) between 2 and 120),
  kind public.import_source_kind not null,
  license text not null check (char_length(license) between 2 and 60),
  license_url text check (license_url is null or license_url ~* '^https://'),
  attribution text not null check (char_length(attribution) between 2 and 200),
  -- Base dérivée à rediffuser sous la même licence (ODbL : partage à l'identique).
  share_alike boolean not null default false,
  homepage text check (homepage is null or homepage ~* '^https://'),
  api_url text check (api_url is null or api_url ~* '^https://'),
  -- Respect des services publics : un appel au plus toutes les N secondes (tous admins confondus).
  min_request_interval_seconds integer not null default 60 check (min_request_interval_seconds >= 10),
  min_sync_interval_hours integer not null default 168 check (min_sync_interval_hours >= 24),
  last_request_at timestamptz,
  -- Une licence propre à chaque lot (fichier de données ouvertes) doit être déclarée à l'import.
  license_per_batch boolean not null default false,
  is_active boolean not null default true,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);
comment on table public.import_sources is 'Sources de données réutilisables (licence, attribution, limites d''appel).';

insert into public.import_sources
  (key, name, kind, license, license_url, attribution, share_alike, homepage, api_url,
   min_request_interval_seconds, min_sync_interval_hours, license_per_batch, is_active, notes)
values
  ('osm', 'OpenStreetMap', 'osm', 'ODbL-1.0', 'https://opendatacommons.org/licenses/odbl/1-0/',
   '© Contributeurs OpenStreetMap', true, 'https://www.openstreetmap.org/copyright',
   'https://overpass-api.de/api/interpreter', 60, 168, false, true,
   'API Overpass : usage raisonnable (requêtes espacées, emprise limitée, User-Agent identifié). Fichiers .osm acceptés.'),
  ('open_data', 'Fichier de données ouvertes', 'open_data', 'Déclarée par lot', null,
   'Voir la source du lot', false, null, null, 60, 168, true, true,
   'GeoJSON, JSON ou CSV publiés sous une licence ouverte compatible (ex. CC BY 4.0, ODbL, Licence ouverte). Licence et attribution saisies à chaque import.'),
  ('partner', 'Partenaires (accord de transmission)', 'partner', 'Accord de partenariat', null,
   'Partenaires de Boyoma Connect', false, null, null, 60, 168, true, false,
   'Prévu : données transmises par des partenaires sous convention écrite. Activer après signature d''un accord.'),
  ('owner', 'Établissements (transmission volontaire)', 'owner', 'Consentement de l''établissement', null,
   'Données fournies par l''établissement', false, null, null, 60, 168, true, false,
   'Prévu : fichiers transmis volontairement par des établissements (consentement enregistré).')
on conflict (key) do nothing;

-- --------------------------------------------------- correspondances de catégories
create table public.osm_category_mappings (
  id uuid primary key default gen_random_uuid(),
  osm_key text not null check (osm_key ~ '^[a-z_:]{1,40}$'),
  osm_value text not null check (osm_value ~ '^[a-z0-9_;:.-]{1,60}$'),
  -- Condition supplémentaire facultative (ex. religion=muslim pour amenity=place_of_worship).
  condition_key text check (condition_key is null or condition_key ~ '^[a-z_:]{1,40}$'),
  condition_value text check (condition_value is null or char_length(condition_value) between 1 and 60),
  category_id uuid not null references public.categories (id) on delete cascade,
  priority integer not null default 100 check (priority between 0 and 1000),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  constraint osm_category_mappings_condition_pair check ((condition_key is null) = (condition_value is null))
);
create unique index osm_category_mappings_unique
  on public.osm_category_mappings (osm_key, osm_value, coalesce(condition_key, ''), coalesce(condition_value, ''));

insert into public.osm_category_mappings (osm_key, osm_value, condition_key, condition_value, category_id, priority)
select m.k, m.v, m.ck, m.cv, c.id, m.p
from (values
  ('amenity', 'place_of_worship', 'religion', 'christian', 'eglises', 5),
  ('amenity', 'place_of_worship', 'religion', 'muslim', 'mosquees', 5),
  ('amenity', 'school', null, null, 'ecoles', 10),
  ('amenity', 'kindergarten', null, null, 'ecoles', 10),
  ('amenity', 'college', null, null, 'universites', 10),
  ('amenity', 'university', null, null, 'universites', 10),
  ('amenity', 'library', null, null, 'bibliotheques', 10),
  ('amenity', 'fuel', null, null, 'stations-service', 10),
  ('amenity', 'restaurant', null, null, 'restaurants', 10),
  ('amenity', 'fast_food', null, null, 'fast-foods', 10),
  ('amenity', 'cafe', null, null, 'cafes', 10),
  ('amenity', 'ice_cream', null, null, 'glaciers', 10),
  ('amenity', 'bar', null, null, 'bars', 10),
  ('amenity', 'pub', null, null, 'bars', 10),
  ('amenity', 'nightclub', null, null, 'divertissement', 10),
  ('amenity', 'events_venue', null, null, 'salles-de-fete', 10),
  ('amenity', 'bank', null, null, 'banques', 10),
  ('amenity', 'atm', null, null, 'distributeurs', 10),
  ('amenity', 'money_transfer', null, null, 'agences-de-transfert', 10),
  ('amenity', 'bureau_de_change', null, null, 'agences-de-transfert', 10),
  ('amenity', 'hospital', null, null, 'hopitaux', 10),
  ('amenity', 'clinic', null, null, 'cliniques', 10),
  ('amenity', 'doctors', null, null, 'cabinets-medicaux', 10),
  ('amenity', 'dentist', null, null, 'cabinets-medicaux', 10),
  ('amenity', 'pharmacy', null, null, 'pharmacies', 10),
  ('amenity', 'police', null, null, 'commissariats', 10),
  ('amenity', 'townhall', null, null, 'mairies', 10),
  ('amenity', 'courthouse', null, null, 'tribunaux', 10),
  ('amenity', 'ferry_terminal', null, null, 'transport-fluvial', 10),
  ('amenity', 'bus_station', null, null, 'agences-de-transport', 10),
  ('amenity', 'taxi', null, null, 'stations-de-taxis', 10),
  ('amenity', 'parking', null, null, 'parkings', 10),
  ('amenity', 'marketplace', null, null, 'marches', 10),
  ('amenity', 'cinema', null, null, 'spectacles-cinemas', 10),
  ('amenity', 'theatre', null, null, 'spectacles-cinemas', 10),
  ('amenity', 'arts_centre', null, null, 'espaces-culturels', 10),
  ('amenity', 'community_centre', null, null, 'centres-communautaires', 10),
  ('amenity', 'social_facility', null, null, 'centres-communautaires', 10),
  ('healthcare', 'hospital', null, null, 'hopitaux', 20),
  ('healthcare', 'clinic', null, null, 'cliniques', 20),
  ('healthcare', 'centre', null, null, 'centres-de-sante', 20),
  ('healthcare', 'doctor', null, null, 'cabinets-medicaux', 20),
  ('healthcare', 'laboratory', null, null, 'laboratoires', 20),
  ('healthcare', 'pharmacy', null, null, 'pharmacies', 20),
  ('healthcare', 'birthing_centre', null, null, 'maternites', 20),
  ('shop', 'supermarket', null, null, 'supermarches', 30),
  ('shop', 'convenience', null, null, 'boutiques', 30),
  ('shop', 'general', null, null, 'boutiques', 30),
  ('shop', 'alcohol', null, null, 'boutiques', 30),
  ('shop', 'beverages', null, null, 'boutiques', 30),
  ('shop', 'mobile_phone', null, null, 'electronique', 30),
  ('shop', 'electronics', null, null, 'electronique', 30),
  ('shop', 'computer', null, null, 'electronique', 30),
  ('shop', 'hairdresser', null, null, 'coiffeurs', 30),
  ('shop', 'beauty', null, null, 'coiffeurs', 30),
  ('shop', 'bakery', null, null, 'boulangeries', 30),
  ('shop', 'pastry', null, null, 'patisseries', 30),
  ('shop', 'clothes', null, null, 'vetements', 30),
  ('shop', 'tailor', null, null, 'couturiers', 30),
  ('shop', 'hardware', null, null, 'quincailleries', 30),
  ('shop', 'doityourself', null, null, 'quincailleries', 30),
  ('shop', 'books', null, null, 'librairies-papeteries', 30),
  ('shop', 'stationery', null, null, 'librairies-papeteries', 30),
  ('shop', 'car_repair', null, null, 'garages', 30),
  ('shop', 'motorcycle', null, null, 'ateliers-motos', 30),
  ('shop', 'photo', null, null, 'photographes', 30),
  ('shop', 'copyshop', null, null, 'imprimeurs', 30),
  ('tourism', 'hotel', null, null, 'hotels', 40),
  ('tourism', 'motel', null, null, 'hotels', 40),
  ('tourism', 'guest_house', null, null, 'maisons-d-hotes', 40),
  ('tourism', 'hostel', null, null, 'auberges', 40),
  ('tourism', 'apartment', null, null, 'residences', 40),
  ('tourism', 'attraction', null, null, 'attractions', 40),
  ('tourism', 'zoo', null, null, 'attractions', 40),
  ('tourism', 'museum', null, null, 'espaces-culturels', 40),
  ('tourism', 'gallery', null, null, 'espaces-culturels', 40),
  ('tourism', 'viewpoint', null, null, 'sites-naturels', 40),
  ('tourism', 'artwork', null, null, 'monuments', 40),
  ('craft', 'tailor', null, null, 'couturiers', 45),
  ('craft', 'electrician', null, null, 'electriciens', 45),
  ('craft', 'carpenter', null, null, 'menuisiers', 45),
  ('craft', 'plumber', null, null, 'plombiers', 45),
  ('craft', 'photographer', null, null, 'photographes', 45),
  ('office', 'government', null, null, 'bureaux-administratifs', 50),
  ('office', 'tax_advisor', null, null, 'services-fiscaux', 50),
  ('leisure', 'park', null, null, 'parcs-de-loisirs', 60),
  ('leisure', 'playground', null, null, 'parcs-de-loisirs', 60),
  ('leisure', 'sports_centre', null, null, 'terrains-de-sport', 60),
  ('leisure', 'stadium', null, null, 'terrains-de-sport', 60),
  ('leisure', 'pitch', null, null, 'terrains-de-sport', 60),
  ('leisure', 'fitness_centre', null, null, 'salles-de-sport', 60),
  ('leisure', 'swimming_pool', null, null, 'piscines', 60),
  ('historic', 'monument', null, null, 'monuments', 70),
  ('historic', 'memorial', null, null, 'monuments', 70),
  ('historic', 'building', null, null, 'lieux-historiques', 70),
  ('historic', 'ruins', null, null, 'lieux-historiques', 70),
  ('aeroway', 'aerodrome', null, null, 'automobile-transport', 80),
  ('railway', 'station', null, null, 'automobile-transport', 90)
) as m(k, v, ck, cv, slug, p)
join public.categories c on c.slug = m.slug
on conflict do nothing;

-- ------------------------------------------------------------------------ lots
create table public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source_key text not null references public.import_sources (key),
  origin text not null check (origin in ('overpass', 'upload', 'sync')),
  status public.import_batch_status not null default 'staging',
  zone_unit_id uuid references public.geographic_units (id) on delete set null,
  category_slugs text[] not null default '{}',
  file_name text check (file_name is null or char_length(file_name) <= 200),
  file_format text check (file_format is null or file_format in ('osm_xml', 'osm_json', 'geojson', 'json', 'csv')),
  file_sha256 text check (file_sha256 is null or file_sha256 ~ '^[0-9a-f]{64}$'),
  license text not null check (char_length(license) between 2 and 60),
  license_url text check (license_url is null or license_url ~* '^https?://'),
  attribution text not null check (char_length(attribution) between 2 and 200),
  collected_at timestamptz not null default now(),
  publication_mode public.import_publication_mode not null default 'review',
  update_existing boolean not null default true,
  total_count integer not null default 0,
  created_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  rejected_count integer not null default 0,
  quarantined_count integer not null default 0,
  attempts integer not null default 0,
  error text check (error is null or char_length(error) <= 2000),
  schedule_id uuid,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  updated_at timestamptz not null default now()
);
create index import_batches_created_at_idx on public.import_batches (created_at desc);
create index import_batches_status_idx on public.import_batches (status);
comment on table public.import_batches is 'Journal des importations : un lot par recherche, fichier ou synchronisation.';

-- ------------------------------------------------------------------- éléments
create table public.import_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references public.import_batches (id) on delete cascade,
  row_index integer not null check (row_index >= 0),
  external_id text check (external_id is null or char_length(external_id) between 1 and 120),
  name text check (name is null or char_length(name) <= 200),
  name_normalized text generated always as (public.normalize_text(name)) stored,
  category_id uuid references public.categories (id) on delete set null,
  mapping_rule text check (mapping_rule is null or char_length(mapping_rule) <= 120),
  latitude double precision check (latitude is null or latitude between -90 and 90),
  longitude double precision check (longitude is null or longitude between -180 and 180),
  geographic_precision public.geographic_precision not null default 'unknown',
  address text check (address is null or char_length(address) <= 300),
  phones text[] not null default '{}',
  website text check (website is null or website ~* '^https?://'),
  email text,
  image_url text check (image_url is null or image_url ~* '^https://'),
  opening_hours text check (opening_hours is null or char_length(opening_hours) <= 300),
  hours jsonb not null default '[]'::jsonb,
  attributes jsonb not null default '{}'::jsonb,
  unit_id uuid references public.geographic_units (id) on delete set null,
  issues text[] not null default '{}',
  status public.import_item_status not null default 'ready',
  match_place_id uuid references public.places (id) on delete set null,
  match_reason text check (match_reason is null or match_reason in ('source_id', 'proximity_name', 'same_name_unit', 'batch')),
  match_score real,
  place_id uuid references public.places (id) on delete set null,
  decided_by uuid references auth.users (id) on delete set null,
  decided_at timestamptz,
  decision_note text check (decision_note is null or char_length(decision_note) <= 1000),
  error text check (error is null or char_length(error) <= 1000),
  created_at timestamptz not null default now(),
  constraint import_items_unique_row unique (batch_id, row_index),
  constraint import_items_coord_pair check ((latitude is null) = (longitude is null))
);
create index import_items_batch_status_idx on public.import_items (batch_id, status);
create index import_items_external_idx on public.import_items (external_id) where external_id is not null;

-- -------------------------------------------------------- synchronisations
create table public.import_schedules (
  id uuid primary key default gen_random_uuid(),
  source_key text not null references public.import_sources (key),
  zone_unit_id uuid not null references public.geographic_units (id) on delete cascade,
  category_slugs text[] not null default '{}',
  interval_hours integer not null check (interval_hours >= 24),
  publication_mode public.import_publication_mode not null default 'review',
  is_active boolean not null default true,
  next_run_at timestamptz not null default now(),
  last_batch_id uuid references public.import_batches (id) on delete set null,
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.import_batches
  add constraint import_batches_schedule_fkey foreign key (schedule_id) references public.import_schedules (id) on delete set null;

-- ------------------------------------------------- provenance des lieux importés
alter table public.place_external_refs
  add column collected_at timestamptz,
  add column last_synced_at timestamptz,
  add column batch_id uuid references public.import_batches (id) on delete set null,
  add column extra jsonb not null default '{}'::jsonb;
update public.place_external_refs set collected_at = imported_at where collected_at is null;

-- Les références ne sont plus limitées à OSM : toute source déclarée ; identifiants OSM contrôlés.
alter table public.place_external_refs drop constraint place_external_refs_source_check;
alter table public.place_external_refs drop constraint place_external_refs_external_id_check;
alter table public.place_external_refs
  add constraint place_external_refs_source_fkey foreign key (source) references public.import_sources (key),
  add constraint place_external_refs_external_id_check check (
    char_length(external_id) between 1 and 120
    and (source <> 'osm' or external_id ~ '^(node|way|relation)/[0-9]+$'));

-- ------------------------------------------------------------------------- RLS
alter table public.import_sources enable row level security;
alter table public.osm_category_mappings enable row level security;
alter table public.import_batches enable row level security;
alter table public.import_items enable row level security;
alter table public.import_schedules enable row level security;

-- Sources : publiques (page « Sources et licences ») ; gestion réservée.
create policy "import_sources: lecture" on public.import_sources for select to anon, authenticated using (true);
create policy "import_sources: gestion" on public.import_sources for all to authenticated
  using (public.has_permission('imports.manage')) with check (public.has_permission('imports.manage'));

create policy "osm_category_mappings: lecture" on public.osm_category_mappings for select to authenticated
  using (public.has_permission('imports.view') or public.has_permission('imports.manage'));
create policy "osm_category_mappings: gestion" on public.osm_category_mappings for all to authenticated
  using (public.has_permission('imports.manage')) with check (public.has_permission('imports.manage'));

create policy "import_batches: lecture" on public.import_batches for select to authenticated
  using (public.has_permission('imports.view') or public.has_permission('imports.manage'));
-- Création d'un lot en préparation uniquement ; la suite passe par les fonctions de confiance.
create policy "import_batches: création" on public.import_batches for insert to authenticated
  with check (public.has_permission('imports.manage') and status = 'staging' and created_by = auth.uid());

create policy "import_items: lecture" on public.import_items for select to authenticated
  using (public.has_permission('imports.view') or public.has_permission('imports.manage'));
create policy "import_items: dépôt" on public.import_items for insert to authenticated
  with check (
    public.has_permission('imports.manage')
    and status = 'ready' and place_id is null and decided_by is null
    and exists (select 1 from public.import_batches b where b.id = batch_id and b.status = 'staging'));

create policy "import_schedules: lecture" on public.import_schedules for select to authenticated
  using (public.has_permission('imports.view') or public.has_permission('imports.manage'));

-- -------------------------------------------------------------------- fonctions
create or replace function public.import_require_manage()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('imports.manage') then
    raise exception 'Permission imports.manage requise' using errcode = '42501';
  end if;
end;
$$;

-- Emprise d'une unité (limite si connue, sinon centre ± 0,2°) pour interroger une API.
create or replace function public.unit_bbox(p_unit_id uuid)
returns table (min_lat double precision, min_lng double precision, max_lat double precision, max_lng double precision)
language sql
stable
set search_path = ''
as $$
  select gis.st_ymin(b.boundary::gis.geometry), gis.st_xmin(b.boundary::gis.geometry),
         gis.st_ymax(b.boundary::gis.geometry), gis.st_xmax(b.boundary::gis.geometry)
  from public.geographic_boundaries b where b.unit_id = p_unit_id
  union all
  select u.center_latitude - 0.2, u.center_longitude - 0.2, u.center_latitude + 0.2, u.center_longitude + 0.2
  from public.geographic_units u
  where u.id = p_unit_id and u.center_latitude is not null
    and not exists (select 1 from public.geographic_boundaries b where b.unit_id = p_unit_id)
  limit 1;
$$;
grant execute on function public.unit_bbox(uuid) to authenticated;

-- Réserve un créneau d'appel à l'API d'une source (limite partagée entre administrateurs).
create or replace function public.import_reserve_request(p_source_key text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_source public.import_sources;
  v_wait integer;
begin
  perform public.import_require_manage();
  select * into v_source from public.import_sources where key = p_source_key for update;
  if not found or not v_source.is_active or v_source.api_url is null then
    raise exception 'Source indisponible pour une recherche en ligne' using errcode = 'P0002';
  end if;
  v_wait := ceil(extract(epoch from (v_source.last_request_at
            + make_interval(secs => v_source.min_request_interval_seconds) - now())));
  if v_wait > 0 then
    raise exception 'Limite du service public : réessayez dans % s', v_wait using errcode = 'P0003';
  end if;
  update public.import_sources set last_request_at = now() where key = p_source_key;
end;
$$;
grant execute on function public.import_reserve_request(text) to authenticated;

-- Codes d'anomalie : rejet automatique / mise en quarantaine (le reste est informatif).
create or replace function public.import_issue_severity(p_code text)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_code in ('missing_name', 'inactive', 'blocked_contact', 'invalid_coordinates',
                    'outside_zone', 'outside_known_boundaries') then 'reject'
    when p_code in ('unmapped_category', 'missing_coordinates', 'generic_name', 'suspicious_name',
                    'name_too_long', 'missing_source_id') then 'quarantine'
    else 'info'
  end;
$$;

-- Analyse d'un lot : rattachement géographique, zone, doublons, statut (sauf décisions manuelles).
create or replace function public.import_analyze_batch(p_batch_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.import_batches;
  v_zone_has_limit boolean;
  v_result jsonb;
begin
  perform public.import_require_manage();
  select * into v_batch from public.import_batches where id = p_batch_id for update;
  if not found then raise exception 'Lot introuvable' using errcode = 'P0002'; end if;
  if v_batch.status not in ('staging', 'ready', 'failed') then
    raise exception 'Lot déjà importé ou annulé' using errcode = 'P0001';
  end if;
  v_zone_has_limit := exists (select 1 from public.geographic_boundaries where unit_id = v_batch.zone_unit_id);

  -- Réinitialise les conclusions automatiques (les décisions manuelles sont conservées).
  update public.import_items i
  set issues = array(select x from unnest(i.issues) x
                     where x not in ('outside_zone', 'outside_known_boundaries', 'unit_from_zone')),
      unit_id = null, match_place_id = null, match_reason = null, match_score = null
  where i.batch_id = p_batch_id and i.decided_by is null;

  -- 1. Rattachement : unité la plus précise contenant le point (limites connues).
  update public.import_items i set unit_id = public.locate_unit(i.latitude, i.longitude)
  where i.batch_id = p_batch_id and i.decided_by is null and i.latitude is not null;

  -- 2. Zone : un point hors de la zone demandée est rejeté. Zone sans limite connue (autre ville de
  --    la RDC pas encore cartographiée) : rattachement à la zone elle-même, signalé.
  if v_batch.zone_unit_id is not null then
    if v_zone_has_limit then
      update public.import_items i
      set issues = i.issues || case when i.unit_id is null then 'outside_known_boundaries' else 'outside_zone' end
      where i.batch_id = p_batch_id and i.decided_by is null and i.latitude is not null
        and (i.unit_id is null or not exists (
          select 1 from public.geographic_units u
          where u.id = i.unit_id and (u.id = v_batch.zone_unit_id or v_batch.zone_unit_id = any (u.ancestors))));
    else
      update public.import_items i
      set unit_id = coalesce(i.unit_id, v_batch.zone_unit_id),
          issues = case when i.unit_id is null then i.issues || 'unit_from_zone'::text else i.issues end
      where i.batch_id = p_batch_id and i.decided_by is null;
    end if;
  end if;

  -- 3a. Même source et même identifiant : lieu existant (actualisation).
  update public.import_items i
  set match_place_id = r.place_id, match_reason = 'source_id', match_score = 1
  from public.place_external_refs r
  where i.batch_id = p_batch_id and i.decided_by is null and i.external_id is not null
    and r.source = v_batch.source_key and r.external_id = i.external_id;

  -- 3b. Proximité (150 m) + similarité de nom, ou nom identique dans la même unité.
  with m as (
    select i.id as item_id, d.id, d.reason, d.score
    from public.import_items i
    cross join lateral (
    select p.id,
      case when p.location is not null and i.latitude is not null then 'proximity_name' else 'same_name_unit' end as reason,
      extensions.similarity(p.name_normalized, i.name_normalized) as score
    from public.places p
    where p.merged_into_id is null and p.publication_status not in ('archived', 'rejected')
      and (
        (i.latitude is not null and p.location is not null
          and gis.st_dwithin(p.location, gis.st_setsrid(gis.st_makepoint(i.longitude, i.latitude), 4326)::gis.geography, 150)
          and extensions.similarity(p.name_normalized, i.name_normalized) >= 0.5)
        or (i.unit_id is not null and p.administrative_unit_id = i.unit_id and p.name_normalized = i.name_normalized)
      )
    order by extensions.similarity(p.name_normalized, i.name_normalized) desc
    limit 1
    ) d
    where i.batch_id = p_batch_id and i.decided_by is null and i.match_place_id is null and i.name_normalized is not null
  )
  update public.import_items i
  set match_place_id = m.id, match_reason = m.reason, match_score = m.score
  from m
  where i.id = m.item_id;

  -- 3c. Doublons internes au lot (nom très proche à moins de 100 m d'une ligne précédente).
  update public.import_items i
  set match_reason = 'batch', match_score = 1
  where i.batch_id = p_batch_id and i.decided_by is null and i.match_place_id is null
    and exists (
      select 1 from public.import_items j
      where j.batch_id = p_batch_id and j.row_index < i.row_index and j.latitude is not null and i.latitude is not null
        and j.name_normalized = i.name_normalized
        and gis.st_dwithin(gis.st_setsrid(gis.st_makepoint(j.longitude, j.latitude), 4326)::gis.geography,
                           gis.st_setsrid(gis.st_makepoint(i.longitude, i.latitude), 4326)::gis.geography, 100));

  -- 4. Statut : rejet > existant > doublon > quarantaine > prêt.
  update public.import_items i
  set status = case
      when exists (select 1 from unnest(i.issues) x where public.import_issue_severity(x) = 'reject') then 'rejected'
      when i.match_reason = 'source_id' then 'existing'
      when i.match_reason is not null then 'duplicate'
      when exists (select 1 from unnest(i.issues) x where public.import_issue_severity(x) = 'quarantine') then 'quarantined'
      else 'ready'
    end::public.import_item_status
  where i.batch_id = p_batch_id and i.decided_by is null;

  update public.import_batches b
  set status = case when b.status = 'failed' then 'failed'::public.import_batch_status else 'ready' end,
      total_count = s.total, quarantined_count = s.quarantined, rejected_count = s.rejected, updated_at = now()
  from (
    select count(*) total,
      count(*) filter (where status = 'quarantined') quarantined,
      count(*) filter (where status = 'rejected') rejected
    from public.import_items where batch_id = p_batch_id
  ) s
  where b.id = p_batch_id;

  select jsonb_object_agg(status, n) into v_result
  from (select status, count(*) n from public.import_items where batch_id = p_batch_id group by status) t;
  perform public.write_audit_log('import.analyzed', 'import_batch', p_batch_id::text, coalesce(v_result, '{}'::jsonb));
  return coalesce(v_result, '{}'::jsonb);
end;
$$;
grant execute on function public.import_analyze_batch(uuid) to authenticated;

-- Décision manuelle sur un élément (avant import) : accepter, rejeter, ignorer, rattacher au lieu
-- existant ; correction de catégorie possible.
create or replace function public.import_decide_item(
  p_item_id uuid, p_decision text, p_category_id uuid default null, p_note text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.import_items;
  v_batch public.import_batches;
  v_status public.import_item_status;
begin
  perform public.import_require_manage();
  select * into v_item from public.import_items where id = p_item_id for update;
  if not found then raise exception 'Élément introuvable' using errcode = 'P0002'; end if;
  select * into v_batch from public.import_batches where id = v_item.batch_id;
  if v_batch.status not in ('ready', 'failed') then
    raise exception 'Lot non modifiable dans son état actuel' using errcode = 'P0001';
  end if;
  if v_item.status in ('imported', 'updated') then
    raise exception 'Élément déjà importé' using errcode = 'P0001';
  end if;
  if p_category_id is not null then
    if not exists (select 1 from public.categories where id = p_category_id and is_active) then
      raise exception 'Catégorie inconnue' using errcode = '22023';
    end if;
    v_item.category_id := p_category_id;
    v_item.mapping_rule := 'manuel';
    v_item.issues := array_remove(v_item.issues, 'unmapped_category');
  end if;

  v_status := case p_decision
    when 'accept' then 'ready'
    when 'reject' then 'rejected'
    when 'skip' then 'skipped'
    when 'merge' then 'existing'
    else null end;
  if v_status is null then raise exception 'Décision invalide' using errcode = '22023'; end if;
  if v_status = 'ready' and (v_item.category_id is null or v_item.latitude is null or v_item.name is null
       or exists (select 1 from unnest(v_item.issues) x where public.import_issue_severity(x) = 'reject')) then
    raise exception 'Impossible d''accepter : catégorie, position et nom valides requis' using errcode = '22023';
  end if;
  if v_status = 'existing' and v_item.match_place_id is null then
    raise exception 'Aucun lieu existant à rattacher' using errcode = '22023';
  end if;

  update public.import_items
  set status = v_status, category_id = v_item.category_id, mapping_rule = v_item.mapping_rule,
      issues = v_item.issues, match_reason = case when v_status = 'ready' then null else match_reason end,
      match_place_id = case when v_status = 'ready' then null else match_place_id end,
      decided_by = auth.uid(), decided_at = now(),
      decision_note = nullif(btrim(coalesce(p_note, '')), '')
  where id = p_item_id;

  update public.import_batches b
  set quarantined_count = (select count(*) from public.import_items where batch_id = b.id and status = 'quarantined'),
      rejected_count = (select count(*) from public.import_items where batch_id = b.id and status = 'rejected'),
      updated_at = now()
  where b.id = v_item.batch_id;
  perform public.write_audit_log('import.item_decided', 'import_item', p_item_id::text,
    jsonb_build_object('batch_id', v_item.batch_id, 'decision', p_decision, 'category_id', p_category_id));
end;
$$;
grant execute on function public.import_decide_item(uuid, text, uuid, text) to authenticated;

-- Import (par tranches, reprise possible) : crée ou actualise les lieux, enregistre la provenance.
-- Chaque appel traite au plus p_limit éléments dans sa transaction ; un échec n'annule que la
-- tranche en cours, et un nouvel appel reprend là où le lot s'est arrêté.
create or replace function public.import_commit_batch(p_batch_id uuid, p_limit integer default 100)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_batch public.import_batches;
  v_source public.import_sources;
  v_item public.import_items;
  v_place public.places;
  v_place_id uuid;
  v_ext text;
  v_changed boolean;
  v_processed integer := 0;
  v_remaining integer;
  v_result jsonb;
begin
  perform public.import_require_manage();
  select * into v_batch from public.import_batches where id = p_batch_id for update;
  if not found then raise exception 'Lot introuvable' using errcode = 'P0002'; end if;
  if v_batch.status not in ('ready', 'importing', 'failed') then
    raise exception 'Lot non importable dans son état actuel (%)', v_batch.status using errcode = 'P0001';
  end if;
  select * into v_source from public.import_sources where key = v_batch.source_key;

  update public.import_batches
  set status = 'importing', started_at = coalesce(started_at, now()), attempts = attempts + 1, error = null, updated_at = now()
  where id = p_batch_id;
  perform set_config('boyoma.internal_write', 'on', true);

  for v_item in
    select * from public.import_items
    where batch_id = p_batch_id and status in ('ready', 'existing')
    order by row_index
    limit least(greatest(coalesce(p_limit, 100), 1), 500)
    for update skip locked
  loop
    v_processed := v_processed + 1;
    v_ext := coalesce(v_item.external_id, 'lot-' || p_batch_id::text || '-' || v_item.row_index);
    begin
      if v_item.status = 'ready' then
        -- Création (non vérifiée) : à valider par l'équipe ou publiée selon le mode du lot.
        insert into public.places (name, primary_category_id, administrative_unit_id, address_text,
          latitude, longitude, geographic_precision, coordinates_source, verification_status,
          publication_status, activity_status)
        values (left(btrim(v_item.name), 140), v_item.category_id, v_item.unit_id, v_item.address,
          v_item.latitude, v_item.longitude, v_item.geographic_precision, 'imported', 'unverified',
          case v_batch.publication_mode when 'publish' then 'published' else 'pending_review' end::public.place_publication_status,
          'unknown')
        returning id into v_place_id;

        insert into public.place_contacts (place_id, kind, value, is_primary, sort_order)
        select v_place_id, c.kind::public.contact_kind, c.value, c.n = 1, c.n - 1
        from (
          select k.kind, k.value, row_number() over () n
          from (
            select 'phone' as kind, p as value from unnest(v_item.phones) p where p ~ '^\+?[0-9 ]{6,20}$'
            union all select 'website', v_item.website where v_item.website is not null
            union all select 'email', v_item.email where v_item.email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'
          ) k
        ) c;

        insert into public.place_hours (place_id, day_of_week, opens_at, closes_at, is_closed)
        select v_place_id, (h ->> 'day')::smallint, (h ->> 'opens')::time, (h ->> 'closes')::time, false
        from jsonb_array_elements(v_item.hours) h
        where (h ->> 'day')::int between 1 and 7 and (h ->> 'opens') <> (h ->> 'closes')
        on conflict do nothing;

        insert into public.place_external_refs (source, external_id, place_id, license, attribution,
          source_url, collected_at, last_synced_at, batch_id, extra)
        values (v_batch.source_key, v_ext, v_place_id, v_batch.license, v_batch.attribution,
          case when v_batch.source_key = 'osm' then 'https://www.openstreetmap.org/' || v_ext end,
          v_batch.collected_at, now(), p_batch_id,
          jsonb_strip_nulls(jsonb_build_object('image_url', v_item.image_url, 'opening_hours', v_item.opening_hours,
            'mapping_rule', v_item.mapping_rule, 'license_url', v_batch.license_url)));

        update public.import_items set status = 'imported', place_id = v_place_id, error = null where id = v_item.id;
      else
        -- Actualisation d'un lieu existant de la même source.
        select * into v_place from public.places where id = v_item.match_place_id;
        if not found or not v_batch.update_existing then
          update public.import_items set status = 'skipped',
            error = case when not found then 'Lieu existant introuvable' else null end where id = v_item.id;
        elsif v_place.ownership_status = 'claimed' or v_place.verification_status <> 'unverified'
              or v_place.coordinates_source <> 'imported' then
          -- Fiche gérée par l'établissement ou vérifiée : jamais écrasée par un import.
          update public.import_items set status = 'skipped', place_id = v_place.id,
            error = 'Fiche gérée ou vérifiée : non modifiée' where id = v_item.id;
          update public.place_external_refs set last_synced_at = now(), batch_id = p_batch_id
          where source = v_batch.source_key and external_id = v_ext;
        else
          v_changed := v_place.name is distinct from left(btrim(v_item.name), 140)
            or v_place.primary_category_id is distinct from coalesce(v_item.category_id, v_place.primary_category_id)
            or v_place.latitude is distinct from v_item.latitude or v_place.longitude is distinct from v_item.longitude
            or v_place.address_text is distinct from coalesce(v_item.address, v_place.address_text);
          if v_changed then
            update public.places
            set name = left(btrim(v_item.name), 140),
                primary_category_id = coalesce(v_item.category_id, primary_category_id),
                latitude = v_item.latitude, longitude = v_item.longitude,
                geographic_precision = v_item.geographic_precision,
                address_text = coalesce(v_item.address, address_text)
            where id = v_place.id;
          end if;
          -- Contacts : ajout de ceux qui manquent (jamais de suppression).
          insert into public.place_contacts (place_id, kind, value, is_primary, sort_order)
          select v_place.id, k.kind::public.contact_kind, k.value, false, 50
          from (
            select 'phone' as kind, p as value from unnest(v_item.phones) p where p ~ '^\+?[0-9 ]{6,20}$'
            union all select 'website', v_item.website where v_item.website is not null
          ) k
          where not exists (select 1 from public.place_contacts c where c.place_id = v_place.id and c.value = k.value);
          get diagnostics v_remaining = row_count;
          insert into public.place_external_refs (source, external_id, place_id, license, attribution,
            source_url, collected_at, last_synced_at, batch_id, extra)
          values (v_batch.source_key, v_ext, v_place.id, v_batch.license, v_batch.attribution,
            case when v_batch.source_key = 'osm' then 'https://www.openstreetmap.org/' || v_ext end,
            v_batch.collected_at, now(), p_batch_id,
            jsonb_strip_nulls(jsonb_build_object('image_url', v_item.image_url, 'opening_hours', v_item.opening_hours)))
          on conflict (source, external_id) do update
            set collected_at = excluded.collected_at, last_synced_at = now(), batch_id = excluded.batch_id,
                extra = public.place_external_refs.extra || excluded.extra;
          update public.import_items
          set status = case when v_changed or v_remaining > 0 then 'updated' else 'skipped' end::public.import_item_status,
              place_id = v_place.id, error = case when v_changed or v_remaining > 0 then null else 'Aucun changement' end
          where id = v_item.id;
        end if;
      end if;
    exception when others then
      -- Erreur sur un élément : il est rejeté avec le motif, le lot continue.
      update public.import_items
      set status = 'rejected', issues = array_append(issues, 'import_error'), error = left(sqlerrm, 1000)
      where id = v_item.id;
    end;
  end loop;

  perform set_config('boyoma.internal_write', 'off', true);
  select count(*) into v_remaining from public.import_items where batch_id = p_batch_id and status in ('ready', 'existing');

  update public.import_batches b
  set created_count = s.created, updated_count = s.updated, skipped_count = s.skipped,
      rejected_count = s.rejected, quarantined_count = s.quarantined,
      status = case when v_remaining = 0 then 'completed' else 'importing' end::public.import_batch_status,
      finished_at = case when v_remaining = 0 then now() end, updated_at = now()
  from (
    select count(*) filter (where status = 'imported') created,
      count(*) filter (where status = 'updated') updated,
      count(*) filter (where status in ('skipped', 'duplicate')) skipped,
      count(*) filter (where status = 'rejected') rejected,
      count(*) filter (where status = 'quarantined') quarantined
    from public.import_items where batch_id = p_batch_id
  ) s
  where b.id = p_batch_id
  returning jsonb_build_object('processed', v_processed, 'remaining', v_remaining, 'created', b.created_count,
    'updated', b.updated_count, 'skipped', b.skipped_count, 'rejected', b.rejected_count,
    'quarantined', b.quarantined_count, 'status', b.status) into v_result;

  if v_remaining = 0 then
    update public.import_schedules set last_batch_id = p_batch_id where id = v_batch.schedule_id;
    perform public.write_audit_log('import.completed', 'import_batch', p_batch_id::text, v_result);
  end if;
  return v_result;
end;
$$;
grant execute on function public.import_commit_batch(uuid, integer) to authenticated;

-- Échec d'une tranche (délai dépassé…) : consigné, reprise possible.
create or replace function public.import_mark_failed(p_batch_id uuid, p_error text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.import_require_manage();
  update public.import_batches
  set status = 'failed', error = left(coalesce(p_error, 'Erreur inconnue'), 2000), updated_at = now()
  where id = p_batch_id and status in ('staging', 'ready', 'importing');
  perform public.write_audit_log('import.failed', 'import_batch', p_batch_id::text, jsonb_build_object('error', left(p_error, 500)));
end;
$$;
grant execute on function public.import_mark_failed(uuid, text) to authenticated;

create or replace function public.import_cancel_batch(p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.import_require_manage();
  update public.import_batches set status = 'cancelled', finished_at = now(), updated_at = now()
  where id = p_batch_id and status in ('staging', 'ready', 'failed');
  if not found then
    raise exception 'Lot introuvable ou déjà importé' using errcode = 'P0001';
  end if;
  update public.import_items set status = 'skipped' where batch_id = p_batch_id and status in ('ready', 'existing');
  perform public.write_audit_log('import.cancelled', 'import_batch', p_batch_id::text, '{}'::jsonb);
end;
$$;
grant execute on function public.import_cancel_batch(uuid) to authenticated;

-- Synchronisations : création, activation, enregistrement d'une exécution (intervalle ≥ minimum de la source).
create or replace function public.import_save_schedule(
  p_source_key text, p_zone_unit_id uuid, p_category_slugs text[], p_interval_hours integer,
  p_publication_mode public.import_publication_mode default 'review')
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_min integer;
  v_id uuid;
begin
  perform public.import_require_manage();
  select min_sync_interval_hours into v_min from public.import_sources
  where key = p_source_key and is_active and api_url is not null;
  if v_min is null then raise exception 'Source non synchronisable' using errcode = '22023'; end if;
  if p_interval_hours < v_min then
    raise exception 'Intervalle minimal pour cette source : % h', v_min using errcode = '22023';
  end if;
  insert into public.import_schedules (source_key, zone_unit_id, category_slugs, interval_hours, publication_mode, next_run_at)
  values (p_source_key, p_zone_unit_id, coalesce(p_category_slugs, '{}'), p_interval_hours, p_publication_mode, now())
  returning id into v_id;
  perform public.write_audit_log('import.schedule_created', 'import_schedule', v_id::text,
    jsonb_build_object('zone', p_zone_unit_id, 'interval_hours', p_interval_hours));
  return v_id;
end;
$$;
grant execute on function public.import_save_schedule(text, uuid, text[], integer, public.import_publication_mode) to authenticated;

create or replace function public.import_toggle_schedule(p_schedule_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.import_require_manage();
  update public.import_schedules set is_active = p_active where id = p_schedule_id;
  if not found then raise exception 'Synchronisation introuvable' using errcode = 'P0002'; end if;
  perform public.write_audit_log('import.schedule_toggled', 'import_schedule', p_schedule_id::text,
    jsonb_build_object('active', p_active));
end;
$$;
grant execute on function public.import_toggle_schedule(uuid, boolean) to authenticated;

-- Une exécution de synchronisation a démarré : prochaine échéance repoussée de l'intervalle.
create or replace function public.import_schedule_started(p_schedule_id uuid, p_batch_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.import_require_manage();
  update public.import_schedules
  set next_run_at = now() + make_interval(hours => interval_hours), last_batch_id = p_batch_id
  where id = p_schedule_id and is_active and next_run_at <= now();
  if not found then
    raise exception 'Synchronisation inactive ou pas encore due' using errcode = 'P0001';
  end if;
  update public.import_batches set schedule_id = p_schedule_id where id = p_batch_id;
end;
$$;
grant execute on function public.import_schedule_started(uuid, uuid) to authenticated;

-- ODbL : extrait public de la base dérivée d'OpenStreetMap (lieux publiés), pour rediffusion.
create or replace function public.osm_derived_places()
returns table (osm_id text, name text, category_slug text, latitude double precision, longitude double precision,
               unit_name text, collected_at timestamptz, updated_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select r.external_id, p.name, c.slug, p.latitude, p.longitude, u.name, r.collected_at, p.updated_at
  from public.place_external_refs r
  join public.places p on p.id = r.place_id and p.publication_status = 'published' and p.merged_into_id is null
  left join public.categories c on c.id = p.primary_category_id
  left join public.geographic_units u on u.id = p.administrative_unit_id
  where r.source = 'osm'
  order by r.external_id;
$$;
grant execute on function public.osm_derived_places() to anon, authenticated;

revoke execute on function public.import_require_manage() from public, anon;
revoke execute on function public.import_issue_severity(text) from public, anon;

-- Moindre privilège : les fonctions d'importation ne sont pas appelables sans compte
-- (elles vérifient de toute façon imports.manage).
revoke execute on function
  public.import_analyze_batch(uuid), public.import_cancel_batch(uuid), public.import_commit_batch(uuid, integer),
  public.import_decide_item(uuid, text, uuid, text), public.import_mark_failed(uuid, text),
  public.import_reserve_request(text), public.import_toggle_schedule(uuid, boolean),
  public.import_schedule_started(uuid, uuid), public.unit_bbox(uuid),
  public.import_save_schedule(text, uuid, text[], integer, public.import_publication_mode)
from public, anon;
