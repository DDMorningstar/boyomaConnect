-- =============================================================================
-- BOYOMA CONNECT — 0006 : favoris, avis, événements d'activité, statistiques
-- Les statistiques professionnelles proviennent UNIQUEMENT d'événements collectés
-- via record_place_event() (jamais de valeurs fictives).
-- =============================================================================

-- ------------------------------------------------------------------ favoris
create table public.favorite_lists (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 60),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create index favorite_lists_user_idx on public.favorite_lists (user_id);

create table public.favorites (
  user_id uuid not null references auth.users (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  list_id uuid references public.favorite_lists (id) on delete set null,
  note text check (note is null or char_length(note) <= 300),
  created_at timestamptz not null default now(),
  primary key (user_id, place_id)
);
create index favorites_place_idx on public.favorites (place_id);
create index favorites_list_idx on public.favorites (list_id);

-- La liste doit appartenir au même utilisateur.
create or replace function public.favorites_check_list()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.list_id is not null and not exists (
    select 1 from public.favorite_lists where id = new.list_id and user_id = new.user_id
  ) then
    raise exception 'Liste de favoris invalide' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger favorites_check_list before insert or update of list_id on public.favorites
  for each row execute function public.favorites_check_list();

-- --------------------------------------------------------------------- avis
create type public.review_status as enum ('pending', 'published', 'rejected', 'hidden');

create table public.reviews (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  author_id uuid not null references auth.users (id) on delete cascade,
  rating smallint not null check (rating between 1 and 5),
  title text check (title is null or char_length(title) <= 120),
  body text check (body is null or char_length(body) between 10 and 3000),
  status public.review_status not null default 'pending',
  visit_month date,                              -- mois de la visite (déclaratif)
  owner_response text check (owner_response is null or char_length(owner_response) <= 2000),
  owner_response_at timestamptz,
  moderated_by uuid references auth.users (id) on delete set null,
  moderated_at timestamptz,
  moderation_reason text,
  edit_count integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (place_id, author_id)                   -- un avis par compte et par lieu
);
create index reviews_place_published_idx on public.reviews (place_id, created_at desc) where status = 'published';
create index reviews_pending_idx on public.reviews (created_at) where status = 'pending';
create index reviews_author_idx on public.reviews (author_id);

create table public.review_reports (
  id uuid primary key default gen_random_uuid(),
  review_id uuid not null references public.reviews (id) on delete cascade,
  reporter_id uuid not null references auth.users (id) on delete cascade,
  reason text not null check (reason in ('spam', 'offensive', 'fake', 'conflict_of_interest', 'off_topic', 'other')),
  details text check (details is null or char_length(details) <= 1000),
  status public.report_status not null default 'open',
  handled_by uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now(),
  unique (review_id, reporter_id)
);
create index review_reports_status_idx on public.review_reports (status, created_at);

-- Règles de publication : un auteur ne note pas un lieu qu'il gère ; toute modification
-- du contenu repasse en modération ; 5 avis maximum par 24 h et par compte.
create or replace function public.reviews_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_is_moderator boolean := public.has_permission('reviews.moderate');
begin
  if tg_op = 'INSERT' then
    if auth.uid() is not null then
      if exists (select 1 from public.place_owners where place_id = new.place_id and user_id = new.author_id) then
        raise exception 'Vous ne pouvez pas évaluer un établissement que vous gérez' using errcode = '42501';
      end if;
      if (select count(*) from public.reviews where author_id = new.author_id and created_at > now() - interval '24 hours') >= 5 then
        raise exception 'Limite d''avis atteinte, réessayez plus tard' using errcode = 'P0001';
      end if;
      new.status := 'pending';
      new.owner_response := null;
      new.moderated_by := null;
    end if;
    return new;
  end if;

  new.updated_at := now();
  if auth.uid() is null or current_setting('boyoma.internal_write', true) = 'on' then
    return new;
  end if;

  -- Réponse du gestionnaire : seuls owner_response(_at) changent.
  if public.is_place_manager(old.place_id) and auth.uid() <> old.author_id and not v_is_moderator then
    if (to_jsonb(new) - array['owner_response', 'owner_response_at', 'updated_at'])
       is distinct from (to_jsonb(old) - array['owner_response', 'owner_response_at', 'updated_at']) then
      raise exception 'Seule la réponse du gestionnaire peut être modifiée' using errcode = '42501';
    end if;
    new.owner_response_at := now();
    return new;
  end if;

  if auth.uid() = old.author_id and not v_is_moderator then
    if new.status is distinct from old.status or new.moderated_by is distinct from old.moderated_by
       or new.owner_response is distinct from old.owner_response or new.place_id is distinct from old.place_id
       or new.author_id is distinct from old.author_id then
      raise exception 'Modification non autorisée' using errcode = '42501';
    end if;
    if new.rating is distinct from old.rating or new.body is distinct from old.body or new.title is distinct from old.title then
      new.status := 'pending';
      new.edit_count := old.edit_count + 1;
    end if;
    return new;
  end if;

  if v_is_moderator then
    if new.status is distinct from old.status then
      new.moderated_by := auth.uid();
      new.moderated_at := now();
    end if;
    return new;
  end if;

  raise exception 'Modification non autorisée' using errcode = '42501';
end;
$$;
create trigger reviews_guard before insert or update on public.reviews
  for each row execute function public.reviews_guard();

-- Agrégat de note recalculé à partir des avis publiés uniquement.
create or replace function public.refresh_place_rating(p_place_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := coalesce(current_setting('boyoma.internal_write', true), 'off');
begin
  perform set_config('boyoma.internal_write', 'on', true);
  update public.places p set
    rating_count = s.cnt,
    rating_avg = case when s.cnt > 0 then round(s.avg_rating, 2) end
  from (
    select count(*)::int as cnt, avg(rating)::numeric as avg_rating
    from public.reviews where place_id = p_place_id and status = 'published'
  ) s
  where p.id = p_place_id;
  perform set_config('boyoma.internal_write', v_prev, true);
end;
$$;
revoke execute on function public.refresh_place_rating(uuid) from public, anon, authenticated;

create or replace function public.reviews_after_write()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.refresh_place_rating(coalesce(new.place_id, old.place_id));
  if tg_op = 'UPDATE' and new.status is distinct from old.status and auth.uid() is not null
     and public.has_permission('reviews.moderate') then
    insert into public.moderation_actions (moderator_id, entity_type, entity_id, action, reason)
    values (auth.uid(), 'review', new.id::text, new.status::text, new.moderation_reason);
  end if;
  return null;
end;
$$;

-- ------------------------------------------------------ actions de modération
-- Créée ici car les avis y écrivent (réutilisée par photos, signalements, revendications…).
create table public.moderation_actions (
  id bigint generated always as identity primary key,
  moderator_id uuid references auth.users (id) on delete set null,
  entity_type text not null check (entity_type in ('review', 'review_report', 'place', 'place_media', 'place_report', 'place_claim', 'place_revision', 'submission')),
  entity_id text not null,
  action text not null,
  reason text,
  created_at timestamptz not null default now()
);
create index moderation_actions_entity_idx on public.moderation_actions (entity_type, entity_id);
create index moderation_actions_moderator_idx on public.moderation_actions (moderator_id, created_at desc);

create trigger reviews_after_write after insert or update or delete on public.reviews
  for each row execute function public.reviews_after_write();

-- -------------------------------------------------------- événements / métriques
create type public.place_event_type as enum
  ('view', 'phone_click', 'whatsapp_click', 'website_click', 'directions_request', 'share', 'favorite_add');

create table public.activity_events (
  id bigint generated always as identity primary key,
  place_id uuid not null references public.places (id) on delete cascade,
  event_type public.place_event_type not null,
  session_hash text not null check (char_length(session_hash) between 16 and 128), -- identifiant anonyme côté client
  user_id uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
create index activity_events_place_idx on public.activity_events (place_id, created_at desc);
create index activity_events_dedupe_idx on public.activity_events (place_id, event_type, session_hash, created_at desc);

create table public.place_metrics_daily (
  place_id uuid not null references public.places (id) on delete cascade,
  day date not null,
  views integer not null default 0,
  phone_clicks integer not null default 0,
  whatsapp_clicks integer not null default 0,
  website_clicks integer not null default 0,
  directions_requests integer not null default 0,
  shares integer not null default 0,
  favorites_added integer not null default 0,
  primary key (place_id, day)
);
create index place_metrics_daily_day_idx on public.place_metrics_daily (day);

-- Enregistre un événement (appelable par les visiteurs). Déduplication : même session,
-- même lieu, même type d'événement dans les 30 dernières minutes = ignoré.
create or replace function public.record_place_event(
  p_place_id uuid, p_event_type public.place_event_type, p_session_hash text
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'Africa/Lubumbashi')::date;
begin
  if p_session_hash is null or char_length(p_session_hash) not between 16 and 128 then
    raise exception 'Session invalide' using errcode = '22023';
  end if;
  if not exists (select 1 from public.places where id = p_place_id and publication_status = 'published') then
    return false;
  end if;
  if exists (
    select 1 from public.activity_events
    where place_id = p_place_id and event_type = p_event_type and session_hash = p_session_hash
      and created_at > now() - interval '30 minutes'
  ) then
    return false;
  end if;

  insert into public.activity_events (place_id, event_type, session_hash, user_id)
  values (p_place_id, p_event_type, p_session_hash, auth.uid());

  insert into public.place_metrics_daily as m (place_id, day, views, phone_clicks, whatsapp_clicks,
    website_clicks, directions_requests, shares, favorites_added)
  values (p_place_id, v_day,
    (p_event_type = 'view')::int, (p_event_type = 'phone_click')::int, (p_event_type = 'whatsapp_click')::int,
    (p_event_type = 'website_click')::int, (p_event_type = 'directions_request')::int,
    (p_event_type = 'share')::int, (p_event_type = 'favorite_add')::int)
  on conflict (place_id, day) do update set
    views = m.views + excluded.views,
    phone_clicks = m.phone_clicks + excluded.phone_clicks,
    whatsapp_clicks = m.whatsapp_clicks + excluded.whatsapp_clicks,
    website_clicks = m.website_clicks + excluded.website_clicks,
    directions_requests = m.directions_requests + excluded.directions_requests,
    shares = m.shares + excluded.shares,
    favorites_added = m.favorites_added + excluded.favorites_added;
  return true;
end;
$$;
revoke execute on function public.record_place_event(uuid, public.place_event_type, text) from public;
grant execute on function public.record_place_event(uuid, public.place_event_type, text) to anon, authenticated;

-- ------------------------------------------------------- analytique de recherche
-- Aucune donnée personnelle : requête normalisée, nombre de résultats, filtres.
create table public.search_analytics (
  id bigint generated always as identity primary key,
  query_normalized text not null check (char_length(query_normalized) between 2 and 120),
  results_count integer not null check (results_count >= 0),
  filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index search_analytics_created_idx on public.search_analytics (created_at desc);
create index search_analytics_query_idx on public.search_analytics (query_normalized, created_at desc);

create or replace function public.log_search(p_query text, p_results_count integer, p_filters jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_q text := left(public.normalize_text(p_query), 120);
begin
  if v_q is null or char_length(v_q) < 2 then
    return;
  end if;
  insert into public.search_analytics (query_normalized, results_count, filters)
  values (v_q, greatest(coalesce(p_results_count, 0), 0),
    coalesce(p_filters, '{}'::jsonb) - array['lat', 'lng', 'latitude', 'longitude']); -- jamais de position
end;
$$;
revoke execute on function public.log_search(text, integer, jsonb) from public;
grant execute on function public.log_search(text, integer, jsonb) to anon, authenticated;

-- Recherches populaires (30 jours), seulement celles répétées au moins 3 fois et ayant des résultats.
create or replace function public.popular_searches(p_limit integer default 8)
returns table (query text, searches bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select query_normalized, count(*) as searches
  from public.search_analytics
  where created_at > now() - interval '30 days' and results_count > 0
  group by query_normalized
  having count(*) >= 3
  order by searches desc, query_normalized
  limit least(greatest(p_limit, 1), 20);
$$;
grant execute on function public.popular_searches(integer) to anon, authenticated;

-- --------------------------------------------- signalement d'erreur (anonyme autorisé)
create or replace function public.report_place(
  p_place_id uuid, p_reason public.report_reason, p_details text default null, p_fingerprint text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_place_public(p_place_id) then
    raise exception 'Lieu introuvable' using errcode = 'P0002';
  end if;
  -- Limitation : 5 signalements / heure par compte ou empreinte.
  if (select count(*) from public.place_reports
      where created_at > now() - interval '1 hour'
        and ((auth.uid() is not null and reporter_id = auth.uid())
          or (p_fingerprint is not null and client_fingerprint = p_fingerprint))) >= 5 then
    raise exception 'Trop de signalements, réessayez plus tard' using errcode = 'P0001';
  end if;
  insert into public.place_reports (place_id, reporter_id, reason, details, client_fingerprint)
  values (p_place_id, auth.uid(), p_reason, left(p_details, 2000), left(p_fingerprint, 128))
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.report_place(uuid, public.report_reason, text, text) from public;
grant execute on function public.report_place(uuid, public.report_reason, text, text) to anon, authenticated;

-- Avis publiés avec le nom public de l'auteur (sans exposer la table profiles).
create or replace function public.place_public_reviews(p_place_id uuid, p_limit integer default 20, p_offset integer default 0)
returns table (
  id uuid, rating smallint, title text, body text, visit_month date,
  owner_response text, owner_response_at timestamptz, created_at timestamptz, author_name text
)
language sql
stable
security definer
set search_path = ''
as $$
  select r.id, r.rating, r.title, r.body, r.visit_month, r.owner_response, r.owner_response_at, r.created_at,
         coalesce(p.display_name, 'Utilisateur') as author_name
  from public.reviews r
  left join public.profiles p on p.id = r.author_id
  where r.place_id = p_place_id and r.status = 'published' and public.is_place_public(p_place_id)
  order by r.created_at desc
  limit least(greatest(p_limit, 1), 50) offset greatest(p_offset, 0);
$$;
grant execute on function public.place_public_reviews(uuid, integer, integer) to anon, authenticated;

-- ---------------------------------------------------------------------- RLS
alter table public.favorite_lists enable row level security;
alter table public.favorites enable row level security;
alter table public.reviews enable row level security;
alter table public.review_reports enable row level security;
alter table public.moderation_actions enable row level security;
alter table public.activity_events enable row level security;
alter table public.place_metrics_daily enable row level security;
alter table public.search_analytics enable row level security;

create policy "listes: propriétaire" on public.favorite_lists for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "favoris: propriétaire" on public.favorites for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid() and public.is_place_public(place_id));
create policy "favoris: lecture de ses favoris même dépubliés" on public.favorites for select to authenticated
  using (user_id = auth.uid());

-- Avis : publics via place_public_reviews() ; l'auteur voit les siens ; modérateurs voient tout.
create policy "avis: lecture" on public.reviews for select to authenticated
  using (author_id = auth.uid() or public.has_permission('reviews.moderate') or public.is_place_manager(place_id));
create policy "avis: création" on public.reviews for insert to authenticated
  with check (author_id = auth.uid() and public.is_place_public(place_id));
create policy "avis: modification" on public.reviews for update to authenticated
  using (author_id = auth.uid() or public.has_permission('reviews.moderate') or public.is_place_manager(place_id))
  with check (author_id = auth.uid() or public.has_permission('reviews.moderate') or public.is_place_manager(place_id));
create policy "avis: suppression par l'auteur" on public.reviews for delete to authenticated
  using (author_id = auth.uid());

create policy "signalements d'avis: création" on public.review_reports for insert to authenticated
  with check (reporter_id = auth.uid() and status = 'open');
create policy "signalements d'avis: lecture" on public.review_reports for select to authenticated
  using (reporter_id = auth.uid() or public.has_permission('reviews.moderate'));
create policy "signalements d'avis: traitement" on public.review_reports for update to authenticated
  using (public.has_permission('reviews.moderate')) with check (public.has_permission('reviews.moderate'));

create policy "modération: lecture" on public.moderation_actions for select to authenticated
  using (public.has_permission('reviews.moderate') or public.has_permission('audit.read'));

-- activity_events : aucune lecture/écriture directe (RPC uniquement), sauf analytique globale.
create policy "événements: analytique" on public.activity_events for select to authenticated
  using (public.has_permission('analytics.read'));

create policy "métriques: gestionnaires et analystes" on public.place_metrics_daily for select to authenticated
  using (public.is_place_manager(place_id) or public.has_permission('analytics.read'));

create policy "recherches: analytique" on public.search_analytics for select to authenticated
  using (public.has_permission('analytics.read'));
