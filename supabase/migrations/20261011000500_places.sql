-- =============================================================================
-- BOYOMA CONNECT — 0005 : établissements (places) et données associées
-- Décisions (voir docs/DECISIONS.md) :
--  * place_addresses fusionnée dans places (une adresse textuelle + repère + chemin par lieu).
--  * place_history (journal automatique) ajouté en plus de place_revisions (propositions).
--  * place_slug_history ajouté pour les redirections 301 lors d'un changement de slug.
-- =============================================================================

create type public.place_publication_status as enum
  ('draft', 'pending_review', 'published', 'rejected', 'suspended', 'archived');
create type public.place_verification_status as enum
  ('unverified', 'community_reported', 'agent_verified', 'owner_verified', 'admin_verified');
create type public.place_ownership_status as enum ('unclaimed', 'claim_pending', 'claimed');
create type public.geographic_precision as enum
  ('exact', 'approximate', 'street', 'neighborhood', 'commune', 'unknown');
create type public.place_activity_status as enum
  ('operating', 'temporarily_closed', 'permanently_closed', 'unknown');
create type public.coordinates_source as enum ('gps_device', 'map_pick', 'imported', 'unknown');

-- ===================================================================== places
create table public.places (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(slug) <= 120),
  name text not null check (char_length(btrim(name)) between 2 and 140),       -- nom affiché (commercial)
  official_name text check (official_name is null or char_length(official_name) <= 200),
  name_normalized text generated always as (public.normalize_text(name)) stored,
  short_description text check (short_description is null or char_length(short_description) <= 280),
  full_description text check (full_description is null or char_length(full_description) <= 8000),
  primary_category_id uuid references public.categories (id) on delete restrict,
  administrative_unit_id uuid references public.geographic_units (id) on delete restrict,
  address_text text check (address_text is null or char_length(address_text) <= 300),
  landmark_description text check (landmark_description is null or char_length(landmark_description) <= 500),
  directions text check (directions is null or char_length(directions) <= 1000), -- description du chemin
  -- Coordonnées : NULL si inconnues. location est dérivée (longitude, latitude) — jamais l'inverse.
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  location gis.geography(Point, 4326) generated always as (
    case when latitude is not null and longitude is not null
      then gis.st_setsrid(gis.st_makepoint(longitude, latitude), 4326)::gis.geography
    end
  ) stored,
  geographic_precision public.geographic_precision not null default 'unknown',
  coordinates_source public.coordinates_source not null default 'unknown',
  gps_accuracy_m numeric(8, 1) check (gps_accuracy_m is null or gps_accuracy_m >= 0),
  verification_status public.place_verification_status not null default 'unverified',
  publication_status public.place_publication_status not null default 'draft',
  ownership_status public.place_ownership_status not null default 'unclaimed',
  activity_status public.place_activity_status not null default 'unknown',
  price_range smallint check (price_range between 1 and 4),         -- NULL = inconnu
  currency char(3) check (currency in ('USD', 'CDF')),
  payment_methods text[] not null default '{}',                     -- déclarés, non vérifiés
  wheelchair_accessible boolean,                                    -- NULL = inconnu
  accessibility_notes text check (accessibility_notes is null or char_length(accessibility_notes) <= 500),
  hours_verified_at timestamptz,                                    -- NULL = horaires non vérifiés
  logo_path text,
  cover_path text,
  rating_avg numeric(3, 2) check (rating_avg is null or rating_avg between 1 and 5),
  rating_count integer not null default 0 check (rating_count >= 0),
  search_extra text not null default '',                            -- catégories + services (trigger)
  search_vector tsvector,
  merged_into_id uuid references public.places (id) on delete set null,
  rejection_reason text,
  created_by uuid references auth.users (id) on delete set null,
  updated_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  last_verified_at timestamptz,
  archived_at timestamptz,
  constraint places_coord_pair check ((latitude is null) = (longitude is null)),
  constraint places_precision_needs_coords check (latitude is not null or geographic_precision in ('commune', 'neighborhood', 'unknown')),
  constraint places_published_minimum check (
    publication_status <> 'published' or (primary_category_id is not null and (administrative_unit_id is not null or latitude is not null))
  ),
  constraint places_not_merged_into_self check (merged_into_id is distinct from id)
);

create index places_location_gix on public.places using gist (location);
create index places_name_trgm_idx on public.places using gin (name_normalized extensions.gin_trgm_ops);
create index places_search_idx on public.places using gin (search_vector);
create index places_primary_category_idx on public.places (primary_category_id);
create index places_unit_idx on public.places (administrative_unit_id);
create index places_publication_idx on public.places (publication_status, published_at desc);
create index places_created_by_idx on public.places (created_by);
create index places_updated_idx on public.places (updated_at desc);
create index places_last_verified_idx on public.places (last_verified_at nulls first) where publication_status = 'published';
create index places_published_location_gix on public.places using gist (location) where publication_status = 'published';

-- ============================================================ tables liées
create table public.place_slug_history (
  slug text primary key,
  place_id uuid not null references public.places (id) on delete cascade,
  created_at timestamptz not null default now()
);
create index place_slug_history_place_idx on public.place_slug_history (place_id);

create table public.place_categories (
  place_id uuid not null references public.places (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  primary key (place_id, category_id)
);
create index place_categories_category_idx on public.place_categories (category_id);

create type public.media_kind as enum ('logo', 'cover', 'gallery', 'service');
create type public.moderation_status as enum ('pending', 'approved', 'rejected');

create table public.place_media (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  storage_path text not null unique,          -- chemin dans le bucket « place-media »
  kind public.media_kind not null default 'gallery',
  caption text check (caption is null or char_length(caption) <= 200),
  width integer check (width > 0),
  height integer check (height > 0),
  bytes integer check (bytes > 0),
  mime_type text check (mime_type in ('image/jpeg', 'image/png', 'image/webp', 'image/avif')),
  moderation_status public.moderation_status not null default 'pending',
  sort_order integer not null default 0,
  uploaded_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index place_media_place_idx on public.place_media (place_id, kind, sort_order);
create index place_media_moderation_idx on public.place_media (moderation_status) where moderation_status = 'pending';

create type public.contact_kind as enum
  ('phone', 'whatsapp', 'email', 'website', 'facebook', 'instagram', 'tiktok', 'x', 'linkedin', 'youtube', 'other');

create table public.place_contacts (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  kind public.contact_kind not null,
  value text not null check (char_length(value) between 3 and 300),
  label text check (label is null or char_length(label) <= 60),
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  verified_at timestamptz,
  created_at timestamptz not null default now(),
  constraint place_contacts_phone_format check (kind not in ('phone', 'whatsapp') or value ~ '^\+?[0-9 ]{6,20}$'),
  constraint place_contacts_email_format check (kind <> 'email' or value ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  constraint place_contacts_url_format check (kind not in ('website', 'facebook', 'instagram', 'tiktok', 'x', 'linkedin', 'youtube') or value ~* '^https?://')
);
create index place_contacts_place_idx on public.place_contacts (place_id, sort_order);

-- Horaires hebdomadaires. Aucun enregistrement = horaires inconnus (jamais affichés comme vérifiés).
-- day_of_week : ISO 1 = lundi … 7 = dimanche. closes_at < opens_at = fermeture après minuit.
create table public.place_hours (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  day_of_week smallint not null check (day_of_week between 1 and 7),
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  constraint place_hours_times check (is_closed or (opens_at is not null and closes_at is not null and opens_at <> closes_at)),
  constraint place_hours_unique unique (place_id, day_of_week, opens_at)
);
create index place_hours_place_idx on public.place_hours (place_id);

create table public.place_special_hours (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  date date not null,
  opens_at time,
  closes_at time,
  is_closed boolean not null default false,
  note text check (note is null or char_length(note) <= 200),
  constraint place_special_hours_times check (is_closed or (opens_at is not null and closes_at is not null))
);
create index place_special_hours_place_idx on public.place_special_hours (place_id, date);

create table public.place_services (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  name text not null check (char_length(name) between 2 and 120),
  description text check (description is null or char_length(description) <= 500),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);
create index place_services_place_idx on public.place_services (place_id, sort_order);

create table public.place_amenities (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_]+$'),
  name text not null,
  icon text not null default 'check' check (icon ~ '^[a-z0-9-]+$'),
  amenity_group text not null default 'general' check (amenity_group in ('general', 'accessibility', 'comfort', 'payment', 'family', 'parking')),
  sort_order integer not null default 0,
  is_active boolean not null default true
);

create table public.place_amenity_links (
  place_id uuid not null references public.places (id) on delete cascade,
  amenity_id uuid not null references public.place_amenities (id) on delete cascade,
  primary key (place_id, amenity_id)
);
create index place_amenity_links_amenity_idx on public.place_amenity_links (amenity_id);

create type public.place_owner_role as enum ('owner', 'manager');
create table public.place_owners (
  place_id uuid not null references public.places (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.place_owner_role not null default 'owner',
  granted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (place_id, user_id)
);
create index place_owners_user_idx on public.place_owners (user_id);

create type public.claim_status as enum ('pending', 'approved', 'rejected', 'cancelled');
create table public.place_claims (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  claimant_id uuid not null references auth.users (id) on delete cascade,
  status public.claim_status not null default 'pending',
  claimant_role text not null check (claimant_role in ('owner', 'manager', 'employee', 'other')),
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+?[0-9 ]{6,20}$'),
  contact_email text check (contact_email is null or contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  message text check (message is null or char_length(message) <= 2000),
  evidence_paths text[] not null default '{}', -- bucket privé « claim-evidence »
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint place_claims_contact check (contact_phone is not null or contact_email is not null)
);
create unique index place_claims_one_pending on public.place_claims (place_id, claimant_id) where status = 'pending';
create index place_claims_status_idx on public.place_claims (status, created_at);
create index place_claims_claimant_idx on public.place_claims (claimant_id);
create trigger place_claims_updated_at before update on public.place_claims
  for each row execute function public.set_updated_at();

-- Propositions de modifications sensibles (nom, position, catégorie…) soumises par les gestionnaires.
create type public.revision_status as enum ('pending', 'applied', 'rejected', 'cancelled');
create table public.place_revisions (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  proposed_changes jsonb not null check (jsonb_typeof(proposed_changes) = 'object'),
  reason text check (reason is null or char_length(reason) <= 1000),
  status public.revision_status not null default 'pending',
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now()
);
create index place_revisions_place_idx on public.place_revisions (place_id, created_at desc);
create index place_revisions_pending_idx on public.place_revisions (created_at) where status = 'pending';

-- Journal automatique des changements (anciennes / nouvelles valeurs des colonnes modifiées).
create table public.place_history (
  id bigint generated always as identity primary key,
  place_id uuid not null references public.places (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  operation text not null check (operation in ('insert', 'update')),
  changes jsonb not null,
  created_at timestamptz not null default now()
);
create index place_history_place_idx on public.place_history (place_id, created_at desc);

create type public.verification_method as enum ('field_visit', 'phone_call', 'owner_document', 'admin_review');
create table public.place_verifications (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  verified_by uuid not null references auth.users (id) on delete restrict,
  method public.verification_method not null,
  notes text check (notes is null or char_length(notes) <= 1000),
  created_at timestamptz not null default now()
);
create index place_verifications_place_idx on public.place_verifications (place_id, created_at desc);

create type public.report_reason as enum
  ('wrong_info', 'wrong_location', 'closed', 'duplicate', 'inappropriate', 'fraud', 'other');
create type public.report_status as enum ('open', 'resolved', 'dismissed');
create table public.place_reports (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  reporter_id uuid references auth.users (id) on delete set null, -- NULL = visiteur anonyme
  reason public.report_reason not null,
  details text check (details is null or char_length(details) <= 2000),
  status public.report_status not null default 'open',
  handled_by uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  resolution_notes text,
  client_fingerprint text, -- hachage côté serveur (limitation de fréquence), jamais l'IP brute
  created_at timestamptz not null default now()
);
create index place_reports_status_idx on public.place_reports (status, created_at);
create index place_reports_place_idx on public.place_reports (place_id);

-- ====================================================== fonctions d'accès
create or replace function public.is_place_manager(p_place_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.place_owners po
    join public.profiles p on p.id = po.user_id and p.status = 'active'
    where po.place_id = p_place_id and po.user_id = auth.uid()
  );
$$;

create or replace function public.is_place_public(p_place_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.places where id = p_place_id and publication_status = 'published');
$$;

-- Lecture d'une fiche : publique, ou staff, ou gestionnaire, ou créateur.
create or replace function public.can_read_place(p_place_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.is_place_public(p_place_id)
    or public.has_permission('places.read_all')
    or public.is_place_manager(p_place_id)
    or exists (select 1 from public.places where id = p_place_id and created_by = auth.uid() and auth.uid() is not null);
$$;

create or replace function public.can_edit_place(p_place_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_permission('places.edit_any') or public.is_place_manager(p_place_id);
$$;

revoke execute on function public.is_place_manager(uuid), public.is_place_public(uuid),
  public.can_read_place(uuid), public.can_edit_place(uuid) from public;
grant execute on function public.is_place_manager(uuid), public.is_place_public(uuid),
  public.can_read_place(uuid), public.can_edit_place(uuid) to anon, authenticated, service_role;

-- ================================================================ triggers
-- Slug unique et stable : généré à la création, historisé lors d'un changement.
create or replace function public.unique_place_slug(p_base text, p_exclude uuid default null)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_base text := left(coalesce(nullif(public.slugify(p_base), ''), 'lieu'), 100);
  v_slug text := v_base;
  v_i integer := 1;
begin
  while exists (select 1 from public.places where slug = v_slug and id is distinct from p_exclude)
     or exists (select 1 from public.place_slug_history h where h.slug = v_slug and h.place_id is distinct from p_exclude) loop
    v_i := v_i + 1;
    v_slug := v_base || '-' || v_i;
  end loop;
  return v_slug;
end;
$$;

create or replace function public.places_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if new.slug is null or new.slug = '' then
      new.slug := public.unique_place_slug(new.name, new.id);
    end if;
    new.created_by := coalesce(new.created_by, auth.uid());
  else
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;

  if new.publication_status = 'published' and (tg_op = 'INSERT' or old.publication_status is distinct from 'published') then
    new.published_at := coalesce(new.published_at, now());
  end if;
  if new.publication_status = 'archived' and (tg_op = 'INSERT' or old.publication_status is distinct from 'archived') then
    new.archived_at := now();
  elsif new.publication_status <> 'archived' then
    new.archived_at := null;
  end if;

  new.search_vector :=
       setweight(to_tsvector('simple', coalesce(public.normalize_text(new.name), '')), 'A')
    || setweight(to_tsvector('simple', coalesce(public.normalize_text(new.official_name), '')), 'A')
    || setweight(to_tsvector('simple', coalesce(public.normalize_text(new.search_extra), '')), 'B')
    || setweight(to_tsvector('simple', coalesce(public.normalize_text(new.short_description), '')), 'B')
    || setweight(to_tsvector('simple', coalesce(public.normalize_text(new.landmark_description), '')), 'C')
    || setweight(to_tsvector('simple', coalesce(public.normalize_text(new.address_text), '')), 'C')
    || setweight(to_tsvector('simple', coalesce(public.normalize_text(new.full_description), '')), 'D');
  return new;
end;
$$;
create trigger places_before_write before insert or update on public.places
  for each row execute function public.places_before_write();

-- Garde-fou : un gestionnaire ne modifie pas les champs protégés ; les statuts exigent les bonnes permissions.
create or replace function public.places_guard_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Opérations de service (migrations, service_role) ou fonctions internes validées
  -- (ex. refresh_place_search_extra, review_place_submission) qui lèvent ce drapeau local.
  if auth.uid() is null or current_setting('boyoma.internal_write', true) = 'on' then
    return new;
  end if;

  if new.publication_status is distinct from old.publication_status then
    if new.publication_status = 'archived' or old.publication_status = 'archived' then
      if not public.has_permission('places.archive') then
        raise exception 'Permission places.archive requise' using errcode = '42501';
      end if;
    elsif not public.has_permission('places.publish') then
      raise exception 'Permission places.publish requise' using errcode = '42501';
    end if;
  end if;

  if not public.has_permission('places.edit_any') then
    if new.slug is distinct from old.slug
       or new.name is distinct from old.name
       or new.official_name is distinct from old.official_name
       or new.primary_category_id is distinct from old.primary_category_id
       or new.administrative_unit_id is distinct from old.administrative_unit_id
       or new.latitude is distinct from old.latitude
       or new.longitude is distinct from old.longitude
       or new.geographic_precision is distinct from old.geographic_precision
       or new.coordinates_source is distinct from old.coordinates_source
       or new.verification_status is distinct from old.verification_status
       or new.ownership_status is distinct from old.ownership_status
       or new.merged_into_id is distinct from old.merged_into_id
       or new.rating_avg is distinct from old.rating_avg
       or new.rating_count is distinct from old.rating_count
       or new.last_verified_at is distinct from old.last_verified_at
       or new.created_by is distinct from old.created_by
       or new.search_extra is distinct from old.search_extra then
      raise exception 'Champ protégé : proposez une modification (place_revisions) soumise à validation'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
create trigger places_guard_update before update on public.places
  for each row execute function public.places_guard_update();

-- Historique + slug + audit des statuts.
create or replace function public.places_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_changes jsonb;
begin
  if tg_op = 'INSERT' then
    insert into public.place_history (place_id, actor_id, operation, changes)
    values (new.id, auth.uid(), 'insert', jsonb_build_object('name', new.name, 'publication_status', new.publication_status));
    return null;
  end if;

  select coalesce(jsonb_object_agg(n.key, jsonb_build_object('old', o.value, 'new', n.value)), '{}'::jsonb)
  into v_changes
  from jsonb_each(to_jsonb(new) - array['search_vector', 'search_extra', 'updated_at', 'updated_by', 'location', 'name_normalized']) n
  join jsonb_each(to_jsonb(old)) o on o.key = n.key
  where n.value is distinct from o.value;

  if v_changes <> '{}'::jsonb then
    insert into public.place_history (place_id, actor_id, operation, changes)
    values (new.id, auth.uid(), 'update', v_changes);
  end if;

  if new.slug is distinct from old.slug then
    insert into public.place_slug_history (slug, place_id) values (old.slug, new.id)
    on conflict (slug) do update set place_id = excluded.place_id;
    -- Si le lieu reprend un ancien slug, l'entrée d'historique reste et pointe vers lui-même (inoffensif).
  end if;

  if new.publication_status is distinct from old.publication_status then
    perform public.write_audit_log('place.status_changed', 'place', new.id::text,
      jsonb_build_object('from', old.publication_status, 'to', new.publication_status));
  end if;
  return null;
end;
$$;
create trigger places_after_write after insert or update on public.places
  for each row execute function public.places_after_write();

-- La catégorie principale fait toujours partie des catégories du lieu.
create or replace function public.places_sync_primary_category()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.primary_category_id is not null then
    insert into public.place_categories (place_id, category_id)
    values (new.id, new.primary_category_id) on conflict do nothing;
  end if;
  return null;
end;
$$;
create trigger places_sync_primary_category after insert or update of primary_category_id on public.places
  for each row execute function public.places_sync_primary_category();

-- Document de recherche secondaire : noms des catégories (et parents) + services.
create or replace function public.refresh_place_search_extra(p_place_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := coalesce(current_setting('boyoma.internal_write', true), 'off');
begin
  perform set_config('boyoma.internal_write', 'on', true);
  update public.places p
  set search_extra = coalesce((
      select string_agg(distinct x.n, ' ')
      from (
        select c.name as n from public.place_categories pc join public.categories c on c.id = pc.category_id where pc.place_id = p_place_id
        union
        select parent.name from public.place_categories pc join public.categories c on c.id = pc.category_id
          join public.categories parent on parent.id = c.parent_id where pc.place_id = p_place_id
        union
        select s.name from public.place_services s where s.place_id = p_place_id
      ) x
    ), '')
  where p.id = p_place_id;
  perform set_config('boyoma.internal_write', v_prev, true);
end;
$$;
revoke execute on function public.refresh_place_search_extra(uuid) from public, anon, authenticated;

create or replace function public.trg_refresh_place_search_extra()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_place_search_extra(coalesce(new.place_id, old.place_id));
  return null;
end;
$$;
create trigger place_categories_search after insert or delete on public.place_categories
  for each row execute function public.trg_refresh_place_search_extra();
create trigger place_services_search after insert or update or delete on public.place_services
  for each row execute function public.trg_refresh_place_search_extra();

-- Un lieu ne peut pas perdre sa catégorie principale via place_categories.
create or replace function public.place_categories_protect_primary()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (select 1 from public.places where id = old.place_id and primary_category_id = old.category_id) then
    raise exception 'Impossible de retirer la catégorie principale ; changez-la d''abord';
  end if;
  return old;
end;
$$;
create trigger place_categories_protect_primary before delete on public.place_categories
  for each row execute function public.place_categories_protect_primary();

-- ====================================================================== RLS
alter table public.places enable row level security;
alter table public.place_slug_history enable row level security;
alter table public.place_categories enable row level security;
alter table public.place_media enable row level security;
alter table public.place_contacts enable row level security;
alter table public.place_hours enable row level security;
alter table public.place_special_hours enable row level security;
alter table public.place_services enable row level security;
alter table public.place_amenities enable row level security;
alter table public.place_amenity_links enable row level security;
alter table public.place_owners enable row level security;
alter table public.place_claims enable row level security;
alter table public.place_revisions enable row level security;
alter table public.place_history enable row level security;
alter table public.place_verifications enable row level security;
alter table public.place_reports enable row level security;

-- places
create policy "places: lecture publique" on public.places for select to anon, authenticated
  using (publication_status = 'published');
create policy "places: lecture interne" on public.places for select to authenticated
  using (public.has_permission('places.read_all') or public.is_place_manager(id) or created_by = auth.uid());
create policy "places: création staff" on public.places for insert to authenticated
  with check (public.has_permission('places.create'));
create policy "places: modification" on public.places for update to authenticated
  using (public.can_edit_place(id) or public.has_permission('places.publish') or public.has_permission('places.archive'))
  with check (public.can_edit_place(id) or public.has_permission('places.publish') or public.has_permission('places.archive'));
-- Pas de DELETE : on archive (règle « ne jamais supprimer sans nécessité »).

create policy "slugs: lecture" on public.place_slug_history for select to anon, authenticated
  using (public.can_read_place(place_id));

-- Tables enfants « publiques » : lisibles si la fiche l'est ; modifiables par les gestionnaires.
create policy "place_categories: lecture" on public.place_categories for select to anon, authenticated
  using (public.can_read_place(place_id));
create policy "place_categories: édition" on public.place_categories for all to authenticated
  using (public.has_permission('places.edit_any')) with check (public.has_permission('places.edit_any'));

create policy "place_media: lecture publique" on public.place_media for select to anon, authenticated
  using ((moderation_status = 'approved' and public.is_place_public(place_id))
    or public.has_permission('media.moderate') or public.is_place_manager(place_id) or uploaded_by = auth.uid());
create policy "place_media: ajout" on public.place_media for insert to authenticated
  with check (public.can_edit_place(place_id) and uploaded_by = auth.uid() and moderation_status = 'pending');
create policy "place_media: modération" on public.place_media for update to authenticated
  using (public.has_permission('media.moderate') or public.can_edit_place(place_id))
  with check (public.has_permission('media.moderate') or (public.can_edit_place(place_id) and moderation_status = 'pending'));
create policy "place_media: suppression" on public.place_media for delete to authenticated
  using (public.has_permission('media.moderate') or public.can_edit_place(place_id));

create policy "place_contacts: lecture" on public.place_contacts for select to anon, authenticated
  using (public.can_read_place(place_id));
create policy "place_contacts: édition" on public.place_contacts for all to authenticated
  using (public.can_edit_place(place_id)) with check (public.can_edit_place(place_id));

create policy "place_hours: lecture" on public.place_hours for select to anon, authenticated
  using (public.can_read_place(place_id));
create policy "place_hours: édition" on public.place_hours for all to authenticated
  using (public.can_edit_place(place_id)) with check (public.can_edit_place(place_id));

create policy "place_special_hours: lecture" on public.place_special_hours for select to anon, authenticated
  using (public.can_read_place(place_id));
create policy "place_special_hours: édition" on public.place_special_hours for all to authenticated
  using (public.can_edit_place(place_id)) with check (public.can_edit_place(place_id));

create policy "place_services: lecture" on public.place_services for select to anon, authenticated
  using (public.can_read_place(place_id));
create policy "place_services: édition" on public.place_services for all to authenticated
  using (public.can_edit_place(place_id)) with check (public.can_edit_place(place_id));

create policy "amenities: lecture" on public.place_amenities for select to anon, authenticated using (is_active or public.has_permission('categories.manage'));
create policy "amenities: gestion" on public.place_amenities for all to authenticated
  using (public.has_permission('categories.manage')) with check (public.has_permission('categories.manage'));

create policy "amenity_links: lecture" on public.place_amenity_links for select to anon, authenticated
  using (public.can_read_place(place_id));
create policy "amenity_links: édition" on public.place_amenity_links for all to authenticated
  using (public.can_edit_place(place_id)) with check (public.can_edit_place(place_id));

-- place_owners : modifiée uniquement par fonctions validées (revendications) ou admins.
create policy "place_owners: lecture" on public.place_owners for select to authenticated
  using (user_id = auth.uid() or public.is_place_manager(place_id) or public.has_permission('claims.review'));
create policy "place_owners: gestion admin" on public.place_owners for all to authenticated
  using (public.has_permission('places.edit_any')) with check (public.has_permission('places.edit_any'));

create policy "claims: lecture" on public.place_claims for select to authenticated
  using (claimant_id = auth.uid() or public.has_permission('claims.review'));
create policy "claims: création" on public.place_claims for insert to authenticated
  with check (claimant_id = auth.uid() and status = 'pending' and reviewed_by is null and public.is_place_public(place_id));
create policy "claims: annulation par le demandeur" on public.place_claims for update to authenticated
  using (claimant_id = auth.uid() and status = 'pending')
  with check (claimant_id = auth.uid() and status = 'cancelled' and reviewed_by is null);

create policy "revisions: lecture" on public.place_revisions for select to authenticated
  using (author_id = auth.uid() or public.has_permission('places.edit_any') or public.has_permission('submissions.review'));
create policy "revisions: proposition" on public.place_revisions for insert to authenticated
  with check (author_id = auth.uid() and status = 'pending' and public.can_edit_place(place_id));

create policy "history: lecture" on public.place_history for select to authenticated
  using (public.has_permission('places.read_all') or public.is_place_manager(place_id));

create policy "verifications: lecture" on public.place_verifications for select to anon, authenticated
  using (public.can_read_place(place_id));
create policy "verifications: création" on public.place_verifications for insert to authenticated
  with check (verified_by = auth.uid() and (public.has_permission('places.publish') or public.has_permission('field.collect')));

create policy "reports: lecture" on public.place_reports for select to authenticated
  using (reporter_id = auth.uid() or public.has_permission('reports.handle'));
create policy "reports: traitement" on public.place_reports for update to authenticated
  using (public.has_permission('reports.handle')) with check (public.has_permission('reports.handle'));
-- Création des signalements : via la fonction report_place() (anonyme autorisé, limité).

-- ============================================================== données
insert into public.place_amenities (key, name, icon, amenity_group, sort_order) values
  ('wheelchair_access', 'Accès fauteuil roulant', 'accessibility', 'accessibility', 1),
  ('parking', 'Parking', 'square-parking', 'parking', 2),
  ('wifi', 'Wi-Fi', 'wifi', 'comfort', 3),
  ('air_conditioning', 'Climatisation', 'air-vent', 'comfort', 4),
  ('generator', 'Groupe électrogène / électricité de secours', 'battery-charging', 'comfort', 5),
  ('toilets', 'Toilettes', 'bath', 'comfort', 6),
  ('delivery', 'Livraison', 'truck', 'general', 7),
  ('takeaway', 'Vente à emporter', 'shopping-bag', 'general', 8),
  ('family_friendly', 'Adapté aux familles', 'baby', 'family', 9),
  ('mobile_money', 'Paiement Mobile Money', 'smartphone', 'payment', 10),
  ('card_payment', 'Paiement par carte', 'credit-card', 'payment', 11),
  ('open_24h', 'Ouvert 24 h/24', 'clock', 'general', 12);
