-- =============================================================================
-- BOYOMA CONNECT — 0007 : collecte terrain, soumissions, validations, revendications
-- Décision : place_submissions et field_submissions sont fusionnées en une seule table
-- place_submissions (colonne source = 'public' | 'field_agent'), car le circuit de
-- validation est identique. Voir docs/DECISIONS.md.
-- =============================================================================

create type public.submission_source as enum ('public', 'field_agent');
create type public.submission_status as enum ('pending', 'approved', 'rejected', 'needs_changes', 'duplicate');

create table public.collection_assignments (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references auth.users (id) on delete cascade,
  unit_id uuid not null references public.geographic_units (id) on delete restrict,
  title text not null check (char_length(title) between 3 and 120),
  instructions text check (instructions is null or char_length(instructions) <= 2000),
  target_category_ids uuid[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'completed', 'cancelled')),
  starts_on date,
  ends_on date,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint collection_assignments_dates check (ends_on is null or starts_on is null or ends_on >= starts_on)
);
create index collection_assignments_agent_idx on public.collection_assignments (agent_id, status);
create index collection_assignments_unit_idx on public.collection_assignments (unit_id);
create trigger collection_assignments_updated_at before update on public.collection_assignments
  for each row execute function public.set_updated_at();

create table public.place_submissions (
  id uuid primary key default gen_random_uuid(),
  client_operation_id uuid not null,              -- généré hors ligne : garantit l'idempotence de la synchro
  submitted_by uuid not null references auth.users (id) on delete cascade,
  source public.submission_source not null,
  status public.submission_status not null default 'pending',
  assignment_id uuid references public.collection_assignments (id) on delete set null,
  target_place_id uuid references public.places (id) on delete set null, -- correction d'un lieu existant (optionnel)
  name text not null check (char_length(btrim(name)) between 2 and 140),
  primary_category_id uuid references public.categories (id) on delete restrict,
  extra_category_ids uuid[] not null default '{}',
  administrative_unit_id uuid references public.geographic_units (id) on delete restrict,
  address_text text check (address_text is null or char_length(address_text) <= 300),
  landmark_description text check (landmark_description is null or char_length(landmark_description) <= 500),
  directions text check (directions is null or char_length(directions) <= 1000),
  short_description text check (short_description is null or char_length(short_description) <= 280),
  latitude double precision check (latitude between -90 and 90),
  longitude double precision check (longitude between -180 and 180),
  location gis.geography(Point, 4326) generated always as (
    case when latitude is not null and longitude is not null
      then gis.st_setsrid(gis.st_makepoint(longitude, latitude), 4326)::gis.geography
    end
  ) stored,
  gps_accuracy_m numeric(8, 1) check (gps_accuracy_m is null or gps_accuracy_m >= 0),
  coordinates_source public.coordinates_source not null default 'unknown',
  position_adjusted boolean not null default false, -- correction manuelle après capture GPS
  contacts jsonb not null default '[]'::jsonb check (jsonb_typeof(contacts) = 'array' and jsonb_array_length(contacts) <= 10),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 10),
  notes_for_reviewer text check (notes_for_reviewer is null or char_length(notes_for_reviewer) <= 1000),
  captured_at timestamptz,                        -- horodatage de l'appareil
  revision integer not null default 1,            -- incrémenté à chaque correction
  resulting_place_id uuid references public.places (id) on delete set null,
  duplicate_of_place_id uuid references public.places (id) on delete set null,
  reviewed_by uuid references auth.users (id) on delete set null,
  reviewed_at timestamptz,
  review_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint place_submissions_coord_pair check ((latitude is null) = (longitude is null)),
  constraint place_submissions_idempotency unique (submitted_by, client_operation_id)
);
create index place_submissions_status_idx on public.place_submissions (status, created_at);
create index place_submissions_submitter_idx on public.place_submissions (submitted_by, created_at desc);
create index place_submissions_location_gix on public.place_submissions using gist (location);
create trigger place_submissions_updated_at before update on public.place_submissions
  for each row execute function public.set_updated_at();

create table public.validation_history (
  id bigint generated always as identity primary key,
  submission_id uuid not null references public.place_submissions (id) on delete cascade,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null check (action in ('submitted', 'resubmitted', 'approved', 'rejected', 'needs_changes', 'marked_duplicate')),
  notes text,
  created_at timestamptz not null default now()
);
create index validation_history_submission_idx on public.validation_history (submission_id, created_at);

create table public.sync_operations (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users (id) on delete cascade,
  client_operation_id uuid not null,
  operation text not null check (operation in ('submission.create', 'submission.update', 'photo.upload')),
  outcome text not null check (outcome in ('success', 'already_synced', 'conflict', 'validation_error', 'error')),
  error_code text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index sync_operations_user_idx on public.sync_operations (user_id, created_at desc);
create index sync_operations_outcome_idx on public.sync_operations (outcome, created_at desc) where outcome <> 'success';

-- Garde-fous : le soumetteur ne peut modifier que ses soumissions « à corriger », et ne
-- peut jamais changer lui-même le statut de validation.
create or replace function public.place_submissions_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      new.status := 'pending';
      new.reviewed_by := null;
      new.reviewed_at := null;
      new.resulting_place_id := null;
      new.revision := 1;
      if new.source = 'field_agent' and not public.has_permission('field.collect') then
        raise exception 'Espace terrain réservé aux agents cartographes' using errcode = '42501';
      end if;
    end if;
    return new;
  end if;

  if auth.uid() is null or current_setting('boyoma.internal_write', true) = 'on' then
    return new;
  end if;

  if old.submitted_by = auth.uid() then
    if old.status <> 'needs_changes' then
      raise exception 'Cette soumission ne peut plus être modifiée' using errcode = '42501';
    end if;
    if new.submitted_by <> old.submitted_by or new.source <> old.source
       or new.client_operation_id <> old.client_operation_id
       or new.reviewed_by is distinct from old.reviewed_by
       or new.resulting_place_id is distinct from old.resulting_place_id then
      raise exception 'Champ non modifiable' using errcode = '42501';
    end if;
    new.status := 'pending';
    new.revision := old.revision + 1;
    return new;
  end if;

  raise exception 'Utilisez review_place_submission() pour valider' using errcode = '42501';
end;
$$;
create trigger place_submissions_guard before insert or update on public.place_submissions
  for each row execute function public.place_submissions_guard();

create or replace function public.place_submissions_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.validation_history (submission_id, actor_id, action) values (new.id, auth.uid(), 'submitted');
  elsif new.status = 'pending' and old.status = 'needs_changes' then
    insert into public.validation_history (submission_id, actor_id, action) values (new.id, auth.uid(), 'resubmitted');
  end if;
  return null;
end;
$$;
create trigger place_submissions_history after insert or update on public.place_submissions
  for each row execute function public.place_submissions_history();

-- ------------------------------------------------------------ doublons
-- Lieux au nom proche (trigrammes) dans un rayon donné, ou même nom normalisé n'importe où
-- dans la même unité. Sécurité « invoker » : la RLS limite ce que chacun voit.
create or replace function public.find_duplicate_places(
  p_name text,
  p_latitude double precision default null,
  p_longitude double precision default null,
  p_radius_m integer default 150,
  p_unit_id uuid default null,
  p_limit integer default 5
) returns table (
  id uuid, slug text, name text, publication_status public.place_publication_status,
  distance_m double precision, name_similarity real
)
language sql
stable
set search_path = ''
as $$
  with q as (
    select public.normalize_text(p_name) as n,
      case when p_latitude is not null and p_longitude is not null
        then gis.st_setsrid(gis.st_makepoint(p_longitude, p_latitude), 4326)::gis.geography end as pt
  )
  select p.id, p.slug, p.name, p.publication_status,
    case when q.pt is not null and p.location is not null then gis.st_distance(p.location, q.pt) end as distance_m,
    extensions.similarity(p.name_normalized, q.n) as name_similarity
  from public.places p, q
  where p.publication_status not in ('archived', 'rejected')
    and p.merged_into_id is null
    and (
      (q.pt is not null and p.location is not null
        and gis.st_dwithin(p.location, q.pt, least(greatest(p_radius_m, 10), 2000))
        and extensions.similarity(p.name_normalized, q.n) >= 0.3)
      or (p_unit_id is not null and p.administrative_unit_id = p_unit_id and p.name_normalized = q.n)
    )
  order by name_similarity desc, distance_m nulls last
  limit least(greatest(p_limit, 1), 20);
$$;
grant execute on function public.find_duplicate_places(text, double precision, double precision, integer, uuid, integer) to authenticated;

-- ------------------------------------------------------- validation des soumissions
create or replace function public.review_place_submission(
  p_submission_id uuid,
  p_decision text,                    -- 'approve' | 'reject' | 'needs_changes' | 'duplicate'
  p_notes text default null,
  p_duplicate_of uuid default null,
  p_publish boolean default true
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.place_submissions%rowtype;
  v_place_id uuid;
  v_contact jsonb;
  v_path text;
  v_cat uuid;
  v_i integer := 0;
begin
  if not public.has_permission('submissions.review') then
    raise exception 'Permission submissions.review requise' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject', 'needs_changes', 'duplicate') then
    raise exception 'Décision invalide' using errcode = '22023';
  end if;

  select * into s from public.place_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Soumission introuvable' using errcode = 'P0002';
  end if;
  if s.status <> 'pending' then
    raise exception 'Soumission déjà traitée (statut : %)', s.status using errcode = 'P0001';
  end if;
  if s.submitted_by = auth.uid() then
    raise exception 'Vous ne pouvez pas valider votre propre soumission' using errcode = '42501';
  end if;
  if p_decision in ('reject', 'needs_changes') and coalesce(btrim(p_notes), '') = '' then
    raise exception 'Un motif est obligatoire' using errcode = '22023';
  end if;

  perform set_config('boyoma.internal_write', 'on', true);

  if p_decision = 'approve' then
    if s.primary_category_id is null then
      raise exception 'Catégorie principale manquante' using errcode = '22023';
    end if;
    if s.administrative_unit_id is null and s.latitude is null then
      raise exception 'Commune ou position requise' using errcode = '22023';
    end if;

    insert into public.places (
      name, short_description, primary_category_id, administrative_unit_id, address_text,
      landmark_description, directions, latitude, longitude, gps_accuracy_m, coordinates_source,
      geographic_precision, verification_status, publication_status, created_by, last_verified_at
    ) values (
      btrim(s.name), s.short_description, s.primary_category_id, s.administrative_unit_id, s.address_text,
      s.landmark_description, s.directions, s.latitude, s.longitude, s.gps_accuracy_m, s.coordinates_source,
      case
        when s.latitude is null then (case when s.administrative_unit_id is not null then 'commune' else 'unknown' end)::public.geographic_precision
        when s.coordinates_source = 'gps_device' and s.gps_accuracy_m is not null and s.gps_accuracy_m <= 25 then 'exact'::public.geographic_precision
        else 'approximate'::public.geographic_precision
      end,
      case when s.source = 'field_agent' then 'agent_verified' else 'unverified' end::public.place_verification_status,
      case when p_publish then 'published' else 'pending_review' end::public.place_publication_status,
      s.submitted_by,
      case when s.source = 'field_agent' then coalesce(s.captured_at, s.created_at) end
    ) returning id into v_place_id;

    foreach v_cat in array s.extra_category_ids loop
      insert into public.place_categories (place_id, category_id) values (v_place_id, v_cat) on conflict do nothing;
    end loop;

    for v_contact in select * from jsonb_array_elements(s.contacts) loop
      begin
        insert into public.place_contacts (place_id, kind, value, sort_order)
        values (v_place_id, (v_contact ->> 'kind')::public.contact_kind, btrim(v_contact ->> 'value'), v_i);
        v_i := v_i + 1;
      exception when others then
        -- Contact invalide : ignoré mais tracé dans les notes de validation.
        p_notes := concat_ws(E'\n', p_notes, 'Contact ignoré (format invalide) : ' || coalesce(v_contact ->> 'value', '?'));
      end;
    end loop;

    v_i := 0;
    foreach v_path in array s.photo_paths loop
      insert into public.place_media (place_id, storage_path, kind, moderation_status, uploaded_by, sort_order)
      values (v_place_id, v_path, case when v_i = 0 then 'cover' else 'gallery' end::public.media_kind, 'approved', s.submitted_by, v_i)
      on conflict (storage_path) do nothing;
      v_i := v_i + 1;
    end loop;

    if s.source = 'field_agent' then
      insert into public.place_verifications (place_id, verified_by, method, notes)
      values (v_place_id, s.submitted_by, 'field_visit', 'Collecte terrain validée');
    end if;

    update public.place_submissions set status = 'approved', resulting_place_id = v_place_id,
      reviewed_by = auth.uid(), reviewed_at = now(), review_notes = p_notes
    where id = s.id;
    insert into public.validation_history (submission_id, actor_id, action, notes) values (s.id, auth.uid(), 'approved', p_notes);

  elsif p_decision = 'duplicate' then
    if p_duplicate_of is null then
      raise exception 'Indiquez le lieu existant' using errcode = '22023';
    end if;
    update public.place_submissions set status = 'duplicate', duplicate_of_place_id = p_duplicate_of,
      reviewed_by = auth.uid(), reviewed_at = now(), review_notes = p_notes
    where id = s.id;
    insert into public.validation_history (submission_id, actor_id, action, notes) values (s.id, auth.uid(), 'marked_duplicate', p_notes);

  else
    update public.place_submissions set status = p_decision::public.submission_status,
      reviewed_by = auth.uid(), reviewed_at = now(), review_notes = p_notes
    where id = s.id;
    insert into public.validation_history (submission_id, actor_id, action, notes)
    values (s.id, auth.uid(), case when p_decision = 'reject' then 'rejected' else 'needs_changes' end, p_notes);
  end if;

  insert into public.moderation_actions (moderator_id, entity_type, entity_id, action, reason)
  values (auth.uid(), 'submission', s.id::text, p_decision, p_notes);
  perform public.write_audit_log('submission.reviewed', 'place_submission', s.id::text,
    jsonb_build_object('decision', p_decision, 'place_id', v_place_id));

  perform set_config('boyoma.internal_write', 'off', true);
  return v_place_id;
end;
$$;
revoke execute on function public.review_place_submission(uuid, text, text, uuid, boolean) from public, anon;
grant execute on function public.review_place_submission(uuid, text, text, uuid, boolean) to authenticated;

-- ------------------------------------------------------- revendications
create or replace function public.place_claims_after_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('boyoma.internal_write', 'on', true);
  update public.places set ownership_status = 'claim_pending'
  where id = new.place_id and ownership_status = 'unclaimed';
  perform set_config('boyoma.internal_write', 'off', true);
  return null;
end;
$$;
create trigger place_claims_after_insert after insert on public.place_claims
  for each row execute function public.place_claims_after_insert();

create or replace function public.review_place_claim(p_claim_id uuid, p_decision text, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.place_claims%rowtype;
  v_role public.place_owner_role;
begin
  if not public.has_permission('claims.review') then
    raise exception 'Permission claims.review requise' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'Décision invalide' using errcode = '22023';
  end if;
  select * into c from public.place_claims where id = p_claim_id for update;
  if not found then
    raise exception 'Revendication introuvable' using errcode = 'P0002';
  end if;
  if c.status <> 'pending' then
    raise exception 'Revendication déjà traitée' using errcode = 'P0001';
  end if;
  if c.claimant_id = auth.uid() then
    raise exception 'Vous ne pouvez pas examiner votre propre demande' using errcode = '42501';
  end if;
  if p_decision = 'reject' and coalesce(btrim(p_notes), '') = '' then
    raise exception 'Un motif est obligatoire' using errcode = '22023';
  end if;

  perform set_config('boyoma.internal_write', 'on', true);
  update public.place_claims set status = (case when p_decision = 'approve' then 'approved' else 'rejected' end)::public.claim_status,
    reviewed_by = auth.uid(), reviewed_at = now(), review_notes = p_notes
  where id = c.id;

  if p_decision = 'approve' then
    v_role := case when c.claimant_role = 'owner' then 'owner' else 'manager' end;
    insert into public.place_owners (place_id, user_id, role, granted_by)
    values (c.place_id, c.claimant_id, v_role, auth.uid())
    on conflict (place_id, user_id) do update set role = excluded.role;
    insert into public.user_roles (user_id, role_key, granted_by)
    values (c.claimant_id, case when v_role = 'owner' then 'place_owner' else 'place_manager' end, auth.uid())
    on conflict do nothing;
    update public.places set ownership_status = 'claimed' where id = c.place_id;
  else
    update public.places set ownership_status = 'unclaimed'
    where id = c.place_id and ownership_status = 'claim_pending'
      and not exists (select 1 from public.place_claims where place_id = c.place_id and status = 'pending' and id <> c.id)
      and not exists (select 1 from public.place_owners where place_id = c.place_id);
  end if;

  insert into public.moderation_actions (moderator_id, entity_type, entity_id, action, reason)
  values (auth.uid(), 'place_claim', c.id::text, p_decision, p_notes);
  perform public.write_audit_log('claim.reviewed', 'place_claim', c.id::text,
    jsonb_build_object('decision', p_decision, 'place_id', c.place_id, 'claimant_id', c.claimant_id));
  perform set_config('boyoma.internal_write', 'off', true);
end;
$$;
revoke execute on function public.review_place_claim(uuid, text, text) from public, anon;
grant execute on function public.review_place_claim(uuid, text, text) to authenticated;

-- ------------------------------------------------- propositions de modification
-- Seuls les champs listés peuvent être appliqués depuis une proposition.
create or replace function public.review_place_revision(p_revision_id uuid, p_decision text, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r public.place_revisions%rowtype;
  v_allowed text[] := array['name', 'official_name', 'primary_category_id', 'administrative_unit_id',
    'latitude', 'longitude', 'geographic_precision', 'address_text', 'landmark_description', 'directions'];
  v_key text;
begin
  if not (public.has_permission('places.edit_any') or public.has_permission('submissions.review')) then
    raise exception 'Permission insuffisante' using errcode = '42501';
  end if;
  if p_decision not in ('apply', 'reject') then
    raise exception 'Décision invalide' using errcode = '22023';
  end if;
  select * into r from public.place_revisions where id = p_revision_id for update;
  if not found or r.status <> 'pending' then
    raise exception 'Proposition introuvable ou déjà traitée' using errcode = 'P0002';
  end if;
  if r.author_id = auth.uid() then
    raise exception 'Vous ne pouvez pas valider votre propre proposition' using errcode = '42501';
  end if;
  for v_key in select jsonb_object_keys(r.proposed_changes) loop
    if not v_key = any (v_allowed) then
      raise exception 'Champ non modifiable par proposition : %', v_key using errcode = '22023';
    end if;
  end loop;

  perform set_config('boyoma.internal_write', 'on', true);
  if p_decision = 'apply' then
    update public.places p set
      name = coalesce(r.proposed_changes ->> 'name', p.name),
      official_name = case when r.proposed_changes ? 'official_name' then r.proposed_changes ->> 'official_name' else p.official_name end,
      primary_category_id = coalesce((r.proposed_changes ->> 'primary_category_id')::uuid, p.primary_category_id),
      administrative_unit_id = coalesce((r.proposed_changes ->> 'administrative_unit_id')::uuid, p.administrative_unit_id),
      latitude = case when r.proposed_changes ? 'latitude' then (r.proposed_changes ->> 'latitude')::double precision else p.latitude end,
      longitude = case when r.proposed_changes ? 'longitude' then (r.proposed_changes ->> 'longitude')::double precision else p.longitude end,
      geographic_precision = coalesce((r.proposed_changes ->> 'geographic_precision')::public.geographic_precision, p.geographic_precision),
      address_text = case when r.proposed_changes ? 'address_text' then r.proposed_changes ->> 'address_text' else p.address_text end,
      landmark_description = case when r.proposed_changes ? 'landmark_description' then r.proposed_changes ->> 'landmark_description' else p.landmark_description end,
      directions = case when r.proposed_changes ? 'directions' then r.proposed_changes ->> 'directions' else p.directions end
    where p.id = r.place_id;
  end if;
  update public.place_revisions set status = (case when p_decision = 'apply' then 'applied' else 'rejected' end)::public.revision_status,
    reviewed_by = auth.uid(), reviewed_at = now(), review_notes = p_notes
  where id = r.id;
  insert into public.moderation_actions (moderator_id, entity_type, entity_id, action, reason)
  values (auth.uid(), 'place_revision', r.id::text, p_decision, p_notes);
  perform public.write_audit_log('revision.reviewed', 'place_revision', r.id::text,
    jsonb_build_object('decision', p_decision, 'place_id', r.place_id));
  perform set_config('boyoma.internal_write', 'off', true);
end;
$$;
revoke execute on function public.review_place_revision(uuid, text, text) from public, anon;
grant execute on function public.review_place_revision(uuid, text, text) to authenticated;

-- ---------------------------------------------------------------------- RLS
alter table public.collection_assignments enable row level security;
alter table public.place_submissions enable row level security;
alter table public.validation_history enable row level security;
alter table public.sync_operations enable row level security;

create policy "affectations: lecture" on public.collection_assignments for select to authenticated
  using (agent_id = auth.uid() or public.has_permission('assignments.manage'));
create policy "affectations: gestion" on public.collection_assignments for all to authenticated
  using (public.has_permission('assignments.manage')) with check (public.has_permission('assignments.manage'));

create policy "soumissions: lecture" on public.place_submissions for select to authenticated
  using (submitted_by = auth.uid() or public.has_permission('submissions.review'));
create policy "soumissions: création" on public.place_submissions for insert to authenticated
  with check (submitted_by = auth.uid() and public.has_permission('submissions.create'));
create policy "soumissions: correction par l'auteur" on public.place_submissions for update to authenticated
  using (submitted_by = auth.uid() and status = 'needs_changes')
  with check (submitted_by = auth.uid());

create policy "historique de validation: lecture" on public.validation_history for select to authenticated
  using (public.has_permission('submissions.review')
    or exists (select 1 from public.place_submissions s where s.id = submission_id and s.submitted_by = auth.uid()));

create policy "synchro: écriture de ses opérations" on public.sync_operations for insert to authenticated
  with check (user_id = auth.uid());
create policy "synchro: lecture" on public.sync_operations for select to authenticated
  using (user_id = auth.uid() or public.has_permission('assignments.manage'));
