-- =============================================================================
-- BOYOMA CONNECT — 0015 : console d'administration (décision D28)
-- Fonctions SECURITY DEFINER pour le back-office : chacune vérifie la permission requise ;
-- les décisions de modération sont tracées (moderation_actions + audit_logs).
-- =============================================================================

-- --------------------------------------------------------- tableau de bord
create or replace function public.admin_dashboard(p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := least(greatest(coalesce(p_days, 30), 7), 90);
  v_since date := (now() at time zone 'Africa/Lubumbashi')::date - (v_days - 1);
begin
  if not (public.has_permission('analytics.read') or public.has_permission('submissions.review')
          or public.has_permission('places.read_all')) then
    raise exception 'Accès réservé à l''administration' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'places', (select jsonb_build_object(
        'published', count(*) filter (where publication_status = 'published'),
        'suspended', count(*) filter (where publication_status = 'suspended'),
        'archived', count(*) filter (where publication_status = 'archived'),
        'verified', count(*) filter (where publication_status = 'published' and verification_status <> 'unverified'),
        'claimed', count(*) filter (where publication_status = 'published' and ownership_status = 'claimed'),
        'with_coords', count(*) filter (where publication_status = 'published' and latitude is not null),
        'new_period', count(*) filter (where published_at >= v_since))
      from public.places where merged_into_id is null),
    'imported', (select count(*) from public.place_external_refs),
    'queue', jsonb_build_object(
      'submissions', (select count(*) from public.place_submissions where status = 'pending'),
      'claims', (select count(*) from public.place_claims where status = 'pending'),
      'reports', (select count(*) from public.place_reports where status = 'open'),
      'reviews', (select count(*) from public.reviews where status = 'pending'),
      'media', (select count(*) from public.place_media where moderation_status = 'pending')),
    'users', (select jsonb_build_object(
        'total', count(*),
        'new_period', count(*) filter (where created_at >= v_since),
        'owners', (select count(distinct user_id) from public.place_owners))
      from auth.users),
    'catalog_items', (select count(*) from public.catalog_items),
    'series', (select coalesce(jsonb_agg(jsonb_build_object(
          'day', d.day::date, 'views', coalesce(m.views, 0), 'contacts', coalesce(m.contacts, 0),
          'directions', coalesce(m.directions, 0)) order by d.day), '[]'::jsonb)
      from generate_series(v_since, (now() at time zone 'Africa/Lubumbashi')::date, interval '1 day') as d(day)
      left join (
        select day, sum(views) as views, sum(phone_clicks + whatsapp_clicks) as contacts,
          sum(directions_requests) as directions
        from public.place_metrics_daily where day >= v_since group by day
      ) m on m.day = d.day::date),
    'totals', (select jsonb_build_object(
        'views', coalesce(sum(views), 0),
        'contacts', coalesce(sum(phone_clicks + whatsapp_clicks), 0),
        'directions', coalesce(sum(directions_requests), 0),
        'shares', coalesce(sum(shares), 0))
      from public.place_metrics_daily where day >= v_since),
    'top_categories', (select coalesce(jsonb_agg(t order by t.count desc), '[]'::jsonb) from (
        select c.name, c.color, c.slug, count(*) as count
        from public.places p join public.categories c on c.id = p.primary_category_id
        where p.publication_status = 'published'
        group by c.id order by count(*) desc limit 6) t),
    'top_places', (select coalesce(jsonb_agg(t order by t.views desc), '[]'::jsonb) from (
        select p.id, p.slug, p.name, sum(m.views) as views
        from public.place_metrics_daily m join public.places p on p.id = m.place_id
        where m.day >= v_since group by p.id having sum(m.views) > 0
        order by sum(m.views) desc limit 5) t),
    'recent_activity', (select coalesce(jsonb_agg(t order by t.created_at desc), '[]'::jsonb) from (
        select a.action, a.entity_type, a.entity_id, a.created_at, pr.display_name as actor
        from public.audit_logs a left join public.profiles pr on pr.id = a.actor_id
        order by a.created_at desc limit 8) t)
  );
end;
$$;
revoke all on function public.admin_dashboard(integer) from public, anon;
grant execute on function public.admin_dashboard(integer) to authenticated;

-- ------------------------------------------------------------ utilisateurs
-- Liste des comptes avec e-mail et rôles (auth.users n'est pas exposé par l'API).
create or replace function public.admin_list_users(
  p_query text default null, p_role text default null, p_limit integer default 25, p_offset integer default 0
) returns table (
  id uuid, email text, display_name text, avatar_url text, status public.account_status,
  roles text[], providers text[], created_at timestamptz, last_sign_in_at timestamptz,
  places_count bigint, total_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_q text := nullif(btrim(lower(coalesce(p_query, ''))), '');
begin
  if not public.has_permission('users.read') then
    raise exception 'Permission users.read requise' using errcode = '42501';
  end if;
  return query
  select u.id, u.email::text, p.display_name, p.avatar_url, p.status,
    coalesce((select array_agg(r.role_key order by r.role_key) from public.user_roles r where r.user_id = u.id), '{}'),
    coalesce((select array_agg(x) from jsonb_array_elements_text(u.raw_app_meta_data -> 'providers') as x), '{}'),
    u.created_at, u.last_sign_in_at,
    (select count(*) from public.place_owners o where o.user_id = u.id),
    count(*) over ()
  from auth.users u
  left join public.profiles p on p.id = u.id
  where (v_q is null or lower(u.email) like '%' || v_q || '%' or lower(coalesce(p.display_name, '')) like '%' || v_q || '%')
    and (p_role is null or exists (select 1 from public.user_roles r where r.user_id = u.id and r.role_key = p_role))
  order by u.created_at desc
  limit least(greatest(coalesce(p_limit, 25), 1), 100) offset greatest(coalesce(p_offset, 0), 0);
end;
$$;
revoke all on function public.admin_list_users(text, text, integer, integer) from public, anon;
grant execute on function public.admin_list_users(text, text, integer, integer) to authenticated;

-- -------------------------------------------------------- signalements de lieux
create or replace function public.handle_place_report(p_report_id uuid, p_decision text, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('reports.handle') then
    raise exception 'Permission reports.handle requise' using errcode = '42501';
  end if;
  if p_decision not in ('resolved', 'dismissed') then
    raise exception 'Décision invalide' using errcode = '22023';
  end if;
  update public.place_reports
    set status = p_decision::public.report_status, handled_by = auth.uid(), handled_at = now(),
        resolution_notes = nullif(btrim(coalesce(p_notes, '')), '')
    where id = p_report_id and status = 'open';
  if not found then
    raise exception 'Signalement introuvable ou déjà traité' using errcode = 'P0002';
  end if;
  insert into public.moderation_actions (moderator_id, entity_type, entity_id, action, reason)
  values (auth.uid(), 'place_report', p_report_id::text, p_decision, p_notes);
  perform public.write_audit_log('report.handled', 'place_report', p_report_id::text,
    jsonb_build_object('decision', p_decision));
end;
$$;
revoke all on function public.handle_place_report(uuid, text, text) from public, anon;
grant execute on function public.handle_place_report(uuid, text, text) to authenticated;

-- ------------------------------------------------------------------ avis
create or replace function public.moderate_review(p_review_id uuid, p_status text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('reviews.moderate') then
    raise exception 'Permission reviews.moderate requise' using errcode = '42501';
  end if;
  if p_status not in ('published', 'rejected', 'hidden') then
    raise exception 'Décision invalide' using errcode = '22023';
  end if;
  if p_status <> 'published' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Un motif est obligatoire' using errcode = '22023';
  end if;
  update public.reviews
    set status = p_status::public.review_status, moderated_by = auth.uid(), moderated_at = now(),
        moderation_reason = nullif(btrim(coalesce(p_reason, '')), '')
    where id = p_review_id;
  if not found then
    raise exception 'Avis introuvable' using errcode = 'P0002';
  end if;
  insert into public.moderation_actions (moderator_id, entity_type, entity_id, action, reason)
  values (auth.uid(), 'review', p_review_id::text, p_status, p_reason);
  perform public.write_audit_log('review.moderated', 'review', p_review_id::text, jsonb_build_object('status', p_status));
end;
$$;
revoke all on function public.moderate_review(uuid, text, text) from public, anon;
grant execute on function public.moderate_review(uuid, text, text) to authenticated;

-- ----------------------------------------------------------------- photos
create or replace function public.moderate_media(p_media_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('media.moderate') then
    raise exception 'Permission media.moderate requise' using errcode = '42501';
  end if;
  if p_decision not in ('approved', 'rejected') then
    raise exception 'Décision invalide' using errcode = '22023';
  end if;
  update public.place_media set moderation_status = p_decision::public.moderation_status where id = p_media_id;
  if not found then
    raise exception 'Photo introuvable' using errcode = 'P0002';
  end if;
  insert into public.moderation_actions (moderator_id, entity_type, entity_id, action, reason)
  values (auth.uid(), 'place_media', p_media_id::text, p_decision, p_reason);
  perform public.write_audit_log('media.moderated', 'place_media', p_media_id::text, jsonb_build_object('decision', p_decision));
end;
$$;
revoke all on function public.moderate_media(uuid, text, text) from public, anon;
grant execute on function public.moderate_media(uuid, text, text) to authenticated;

-- --------------------------------------------- vérification d'un lieu par l'équipe
create or replace function public.admin_verify_place(p_place_id uuid, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('places.publish') then
    raise exception 'Permission places.publish requise' using errcode = '42501';
  end if;
  perform set_config('boyoma.internal_write', 'on', true);
  update public.places set verification_status = 'admin_verified', last_verified_at = now() where id = p_place_id;
  if not found then
    raise exception 'Lieu introuvable' using errcode = 'P0002';
  end if;
  insert into public.place_verifications (place_id, verified_by, method, notes)
  values (p_place_id, auth.uid(), 'admin_review', nullif(btrim(coalesce(p_notes, '')), ''));
  perform public.write_audit_log('place.verified', 'place', p_place_id::text, '{}'::jsonb);
  perform set_config('boyoma.internal_write', 'off', true);
end;
$$;
revoke all on function public.admin_verify_place(uuid, text) from public, anon;
grant execute on function public.admin_verify_place(uuid, text) to authenticated;

-- Lecture de l'historique des paramètres et du journal par les administrateurs.
create index if not exists audit_logs_action_idx on public.audit_logs (action, created_at desc);
