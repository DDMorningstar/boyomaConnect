-- =============================================================================
-- BOYOMA CONNECT — Engagement (décision D34) : nouveauté du jour, badge « Répond vite »,
-- notifications push, bilan hebdomadaire des établissements.
-- =============================================================================

-- ------------------------------------------------------------ nouveauté du jour (24 h)
create table public.place_stories (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  author_id uuid references auth.users (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 3 and 200),
  photo_path text check (photo_path is null or photo_path ~ '^places/[0-9a-f-]{36}/stories/[0-9a-f-]{36}\.webp$'),
  status text not null default 'published' check (status in ('published', 'hidden')),
  hidden_reason text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '24 hours'
);
create index place_stories_place_idx on public.place_stories (place_id, created_at desc);
create index place_stories_active_idx on public.place_stories (expires_at) where status = 'published';

alter table public.place_stories enable row level security;
create policy "nouveautés: lecture publique" on public.place_stories for select
  using ((status = 'published' and expires_at > now() and public.is_place_public(place_id))
    or public.is_place_manager(place_id) or public.has_permission('media.moderate'));
create policy "nouveautés: publication gestionnaire" on public.place_stories for insert
  with check (public.is_place_manager(place_id) and author_id = auth.uid() and status = 'published');
create policy "nouveautés: retrait gestionnaire" on public.place_stories for delete
  using (public.is_place_manager(place_id));
create policy "nouveautés: modération" on public.place_stories for update
  using (public.has_permission('media.moderate')) with check (public.has_permission('media.moderate'));

-- Garde-fous : photo dans le dossier de la fiche, 3 nouveautés au plus par jour et par fiche.
create or replace function public.place_stories_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.photo_path is not null and split_part(new.photo_path, '/', 2) <> new.place_id::text then
    raise exception 'Photo hors du dossier de la fiche' using errcode = '42501';
  end if;
  if (select count(*) from public.place_stories
      where place_id = new.place_id and created_at > now() - interval '24 hours') >= 3 then
    raise exception '3 nouveautés par jour au maximum' using errcode = 'P0001';
  end if;
  new.expires_at := now() + interval '24 hours';
  new.body := btrim(new.body);
  return new;
end;
$$;
create trigger place_stories_guard before insert on public.place_stories
  for each row execute function public.place_stories_guard();

-- Nouveautés actives (accueil) : fiches publiées, les plus récentes d'abord.
create or replace function public.active_stories(p_unit_id uuid default null, p_limit integer default 12)
returns table (id uuid, body text, photo_path text, created_at timestamptz, expires_at timestamptz,
  place_slug text, place_name text, logo_path text, verification_status text)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.body, s.photo_path, s.created_at, s.expires_at, p.slug, p.name, p.logo_path, p.verification_status::text
  from public.place_stories s
  join public.places p on p.id = s.place_id and p.publication_status = 'published' and p.merged_into_id is null
  where s.status = 'published' and s.expires_at > now()
    and (p_unit_id is null or p.administrative_unit_id in (select public.geographic_unit_descendants(p_unit_id)))
  order by s.created_at desc
  limit least(greatest(coalesce(p_limit, 12), 1), 30);
$$;
grant execute on function public.active_stories(uuid, integer) to anon, authenticated;

-- ------------------------------------------------------------ badge « Répond vite »
-- Délai médian de réponse aux demandes des visiteurs (90 derniers jours, 3 demandes traitées au moins).
-- Seul l'agrégat est exposé, jamais les demandes elles-mêmes.
create or replace function public.place_response_stats(p_place_id uuid)
returns table (answered integer, median_minutes integer, fast boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with d as (
    select extract(epoch from (handled_at - created_at)) / 60 as minutes
    from public.business_inquiries
    where place_id = p_place_id and handled_at is not null and status in ('answered', 'closed')
      and created_at > now() - interval '90 days'
  )
  select count(*)::int,
    case when count(*) >= 3 then round(percentile_cont(0.5) within group (order by minutes))::int end,
    count(*) >= 3 and percentile_cont(0.5) within group (order by minutes) <= 120
  from d
  where public.is_place_public(p_place_id);
$$;
grant execute on function public.place_response_stats(uuid) to anon, authenticated;

-- ------------------------------------------------------------ notifications push
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null unique check (endpoint ~ '^https://' and char_length(endpoint) <= 1000),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  user_agent text check (user_agent is null or char_length(user_agent) <= 300),
  created_at timestamptz not null default now(),
  last_success_at timestamptz
);
create index push_subscriptions_user_idx on public.push_subscriptions (user_id);
alter table public.push_subscriptions enable row level security;
create policy "push: les siens" on public.push_subscriptions for select using (user_id = auth.uid());
create policy "push: ajout" on public.push_subscriptions for insert with check (user_id = auth.uid());
create policy "push: retrait" on public.push_subscriptions for delete using (user_id = auth.uid());

-- Abonnements des gestionnaires d'une fiche (serveur uniquement, pour l'envoi).
create or replace function public.place_manager_push_targets(p_place_id uuid)
returns table (id uuid, endpoint text, p256dh text, auth text)
language sql
stable
security definer
set search_path = ''
as $$
  select ps.id, ps.endpoint, ps.p256dh, ps.auth
  from public.push_subscriptions ps
  join public.place_owners po on po.user_id = ps.user_id
  where po.place_id = p_place_id;
$$;
revoke execute on function public.place_manager_push_targets(uuid) from public, anon, authenticated;
grant execute on function public.place_manager_push_targets(uuid) to service_role;

-- ------------------------------------------------------------ bilan hebdomadaire
-- Notifie chaque gestionnaire : vues, appels, WhatsApp, itinéraires et demandes des 7 derniers jours,
-- avec un conseil tiré de la complétude réelle de la fiche. Renvoie les fiches notifiées (pour le push).
create or replace function public.send_weekly_summaries()
returns table (place_id uuid, title text, body text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
  v_title text;
  v_body text;
  v_tip text;
begin
  for r in
    select p.id, p.name,
      coalesce(sum(m.views), 0) as views, coalesce(sum(m.phone_clicks), 0) as calls,
      coalesce(sum(m.whatsapp_clicks), 0) as wa, coalesce(sum(m.directions_requests), 0) as dirs,
      (select count(*) from public.business_inquiries bi where bi.place_id = p.id and bi.created_at > now() - interval '7 days') as inquiries,
      exists (select 1 from public.place_hours h where h.place_id = p.id) as has_hours,
      (select count(*) from public.catalog_items c where c.place_id = p.id and c.is_published) as items,
      p.logo_path is not null as has_logo
    from public.places p
    left join public.place_metrics_daily m on m.place_id = p.id and m.day > (now() at time zone 'Africa/Lubumbashi')::date - 7
    where p.publication_status = 'published'
      and exists (select 1 from public.place_owners po where po.place_id = p.id)
    group by p.id, p.name
  loop
    v_tip := case
      when not r.has_logo then 'Conseil : ajoutez votre logo pour être reconnu au premier coup d''œil.'
      when not r.has_hours then 'Conseil : indiquez vos horaires pour afficher « Ouvert » aux visiteurs.'
      when r.items < 3 then 'Conseil : ajoutez au moins 3 articles à votre catalogue.'
      else 'Conseil : publiez une nouveauté du jour pour attirer l''attention.' end;
    v_title := 'Votre semaine sur Boyoma Connect';
    v_body := format('%s : %s vue%s, %s appel%s, %s WhatsApp, %s itinéraire%s, %s demande%s. %s',
      r.name, r.views, case when r.views > 1 then 's' else '' end, r.calls, case when r.calls > 1 then 's' else '' end,
      r.wa, r.dirs, case when r.dirs > 1 then 's' else '' end, r.inquiries, case when r.inquiries > 1 then 's' else '' end, v_tip);
    perform public.notify_place_managers(r.id, 'summary', v_title, v_body, '/espace-pro/lieux/' || r.id);
    place_id := r.id;
    title := v_title;
    body := v_body;
    return next;
  end loop;
end;
$$;
revoke execute on function public.send_weekly_summaries() from public, anon, authenticated;
grant execute on function public.send_weekly_summaries() to service_role;
