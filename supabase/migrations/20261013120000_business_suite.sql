-- =============================================================================
-- BOYOMA CONNECT — 0024 : espace pro « gérer son business » (décision D32)
--  1. statistiques (tableau de bord) + suivi des articles du catalogue
--  5. demandes des visiteurs (limitées, sans commande)       8. notifications
--  6. offres datées (modérées)   7. réponses aux avis   9. équipe (invitations)
-- 10. demandes de vérification  11. abonnements : référence de paiement, validation manuelle
--     auditée, offre de plan tracée ; aucun paiement confirmé par un simple clic.
-- =============================================================================

-- ------------------------------------------------------------ réglages et plans
-- Statistiques de base pour tous (30 jours) ; 90 jours et export réservés aux plans avancés.
insert into public.plan_features (plan_id, feature_key, value, label)
select id, 'statistics', 'true'::jsonb, 'Statistiques (30 jours)' from public.plans where key = 'free'
on conflict do nothing;

update public.application_settings set value = 'true'::jsonb, updated_at = now()
where key = 'features.owner_review_responses';

insert into public.application_settings (key, value, description, is_public)
values ('billing.manual_instructions', 'null'::jsonb,
  'Instructions de paiement manuel montrées aux établissements (Mobile Money, compte bancaire). null = paiement fermé.',
  false)
on conflict (key) do nothing;

-- ------------------------------------------------------------ 8. notifications
create index if not exists notifications_user_unread_idx on public.notifications (user_id, created_at desc) where read_at is null;

create or replace function public.notify_user(p_user_id uuid, p_kind text, p_title text, p_body text, p_link text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, title, body, link)
  select p_user_id, p_kind, left(p_title, 140), left(p_body, 500), p_link
  where p_user_id is not null;
$$;

create or replace function public.notify_place_managers(p_place_id uuid, p_kind text, p_title text, p_body text, p_link text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.notifications (user_id, kind, title, body, link)
  select po.user_id, p_kind, left(p_title, 140), left(p_body, 500), p_link
  from public.place_owners po where po.place_id = p_place_id;
$$;
revoke execute on function public.notify_user(uuid, text, text, text, text), public.notify_place_managers(uuid, text, text, text, text)
  from public, anon, authenticated;

create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.notifications set read_at = now()
  where user_id = auth.uid() and read_at is null and (p_ids is null or id = any (p_ids));
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- Accès à une fiche accordé (validation, réclamation, invitation).
create or replace function public.place_owners_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.notify_user(new.user_id, 'place_access', 'Accès à votre fiche',
    'Vous pouvez gérer « ' || (select name from public.places where id = new.place_id) || ' ».',
    '/espace-pro/lieux/' || new.place_id);
  return null;
end;
$$;
create trigger place_owners_notify after insert on public.place_owners
  for each row execute function public.place_owners_notify();

-- ------------------------------------------------------------ 1. statistiques
create table public.catalog_item_events (
  id bigint generated always as identity primary key,
  item_id uuid not null references public.catalog_items (id) on delete cascade,
  kind text not null check (kind in ('view', 'contact')),
  session_hash text not null check (char_length(session_hash) between 16 and 128),
  created_at timestamptz not null default now()
);
create index catalog_item_events_dedupe_idx on public.catalog_item_events (item_id, session_hash, created_at desc);
alter table public.catalog_item_events enable row level security; -- écriture par fonction uniquement

create table public.catalog_item_metrics_daily (
  item_id uuid not null references public.catalog_items (id) on delete cascade,
  place_id uuid not null references public.places (id) on delete cascade,
  day date not null,
  views integer not null default 0,
  contacts integer not null default 0,
  primary key (item_id, day)
);
create index catalog_item_metrics_place_idx on public.catalog_item_metrics_daily (place_id, day);
alter table public.catalog_item_metrics_daily enable row level security;
create policy "métriques articles: gestionnaires" on public.catalog_item_metrics_daily for select to authenticated
  using (public.is_place_manager(place_id) or public.has_permission('analytics.read'));

create or replace function public.record_catalog_event(p_item_id uuid, p_kind text, p_session_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_place uuid;
  v_day date := (now() at time zone 'Africa/Lubumbashi')::date;
begin
  if p_kind not in ('view', 'contact') or p_session_hash is null or char_length(p_session_hash) not between 16 and 128 then
    raise exception 'Événement invalide' using errcode = '22023';
  end if;
  select c.place_id into v_place from public.catalog_items c
  where c.id = p_item_id and c.is_published and public.is_place_public(c.place_id);
  if v_place is null then return false; end if;
  -- Gestionnaires de la fiche : leurs propres consultations ne comptent pas.
  if public.is_place_manager(v_place) then return false; end if;
  if exists (select 1 from public.catalog_item_events e where e.item_id = p_item_id and e.kind = p_kind
             and e.session_hash = p_session_hash and e.created_at > now() - interval '30 minutes') then
    return false;
  end if;
  insert into public.catalog_item_events (item_id, kind, session_hash) values (p_item_id, p_kind, p_session_hash);
  insert into public.catalog_item_metrics_daily as m (item_id, place_id, day, views, contacts)
  values (p_item_id, v_place, v_day, (p_kind = 'view')::int, (p_kind = 'contact')::int)
  on conflict (item_id, day) do update set views = m.views + excluded.views, contacts = m.contacts + excluded.contacts;
  return true;
end;
$$;
grant execute on function public.record_catalog_event(uuid, text, text) to anon, authenticated;

-- Tableau de bord d'une fiche : série quotidienne, totaux, période précédente, articles les plus vus.
create or replace function public.owner_place_stats(p_place_id uuid, p_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer := case when p_days in (7, 30, 90) then p_days else 30 end;
  v_today date := (now() at time zone 'Africa/Lubumbashi')::date;
  v_from date;
  v_result jsonb;
begin
  if not (public.is_place_manager(p_place_id) or public.has_permission('analytics.read')) then
    raise exception 'Vous ne gérez pas cette fiche' using errcode = '42501';
  end if;
  if v_days = 90 and not public.place_has_feature(p_place_id, 'statistics_advanced')
     and not public.has_permission('analytics.read') then
    raise exception 'Statistiques sur 90 jours : plan Premium ou Sponsor' using errcode = 'P0004';
  end if;
  v_from := v_today - (v_days - 1);

  with series as (
    select d::date as day from generate_series(v_from, v_today, interval '1 day') d
  ), daily as (
    select s.day, coalesce(m.views, 0) views, coalesce(m.phone_clicks, 0) calls, coalesce(m.whatsapp_clicks, 0) whatsapp,
      coalesce(m.directions_requests, 0) directions, coalesce(m.shares, 0) shares, coalesce(m.favorites_added, 0) favorites,
      coalesce(m.website_clicks, 0) website
    from series s left join public.place_metrics_daily m on m.place_id = p_place_id and m.day = s.day
  ), prev as (
    select coalesce(sum(views), 0) views, coalesce(sum(phone_clicks), 0) calls, coalesce(sum(whatsapp_clicks), 0) whatsapp,
      coalesce(sum(directions_requests), 0) directions, coalesce(sum(shares), 0) shares, coalesce(sum(favorites_added), 0) favorites,
      coalesce(sum(website_clicks), 0) website
    from public.place_metrics_daily
    where place_id = p_place_id and day between v_from - v_days and v_from - 1
  )
  select jsonb_build_object(
    'days', v_days,
    'series', (select jsonb_agg(to_jsonb(d) order by d.day) from daily d),
    'totals', (select jsonb_build_object('views', sum(views), 'calls', sum(calls), 'whatsapp', sum(whatsapp),
                 'directions', sum(directions), 'shares', sum(shares), 'favorites', sum(favorites), 'website', sum(website)) from daily),
    'previous', (select to_jsonb(p) from prev p),
    'top_items', coalesce((
      select jsonb_agg(t order by t.views desc, t.contacts desc) from (
        select c.id, c.name, sum(m.views)::int views, sum(m.contacts)::int contacts
        from public.catalog_item_metrics_daily m join public.catalog_items c on c.id = m.item_id
        where m.place_id = p_place_id and m.day >= v_from
        group by c.id, c.name order by sum(m.views) desc limit 5
      ) t), '[]'::jsonb),
    'inquiries_new', (select count(*) from public.business_inquiries where place_id = p_place_id and status = 'new'),
    'reviews', (select jsonb_build_object('count', rating_count, 'average', rating_avg) from public.places where id = p_place_id),
    'plan', public.place_active_plan(p_place_id)
  ) into v_result;
  return v_result;
end;
$$;
grant execute on function public.owner_place_stats(uuid, integer) to authenticated;

-- ------------------------------------------------------------ 5. demandes
alter table public.business_inquiries
  add column sender_fingerprint text check (sender_fingerprint is null or sender_fingerprint ~ '^[0-9a-f]{64}$'),
  add column handled_at timestamptz;
create index if not exists business_inquiries_place_idx on public.business_inquiries (place_id, created_at desc);
create index if not exists business_inquiries_fingerprint_idx on public.business_inquiries (sender_fingerprint, created_at desc);

-- Envoi uniquement par la fonction (limites anti-abus) : l'insertion directe n'est plus ouverte.
drop policy "demandes: envoi" on public.business_inquiries;

create or replace function public.send_business_inquiry(
  p_place_id uuid, p_kind text, p_catalog_item_id uuid, p_name text, p_phone text, p_email text,
  p_message text, p_fingerprint text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_kind text := coalesce(p_kind, 'contact');
  v_item text;
begin
  if not public.is_place_public(p_place_id) then
    raise exception 'Établissement introuvable' using errcode = 'P0002';
  end if;
  if public.is_place_manager(p_place_id) then
    raise exception 'Vous gérez cet établissement' using errcode = '42501';
  end if;
  if v_kind not in ('contact', 'quote', 'reservation') then v_kind := 'contact'; end if;
  if v_kind = 'reservation' and not public.place_has_feature(p_place_id, 'reservations') then v_kind := 'contact'; end if;
  if p_fingerprint is null or p_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'Requête invalide' using errcode = '22023';
  end if;
  -- Limites : 3 demandes / heure et 10 / jour par appareil ; 2 / jour par établissement et appareil.
  if (select count(*) from public.business_inquiries where sender_fingerprint = p_fingerprint and created_at > now() - interval '1 hour') >= 3
     or (select count(*) from public.business_inquiries where sender_fingerprint = p_fingerprint and created_at > now() - interval '1 day') >= 10
     or (select count(*) from public.business_inquiries where sender_fingerprint = p_fingerprint and place_id = p_place_id and created_at > now() - interval '1 day') >= 2 then
    raise exception 'Trop de demandes envoyées : réessayez plus tard' using errcode = 'P0001';
  end if;
  if p_catalog_item_id is not null then
    select name into v_item from public.catalog_items where id = p_catalog_item_id and place_id = p_place_id and is_published;
  end if;
  insert into public.business_inquiries (place_id, catalog_item_id, kind, sender_id, sender_name, sender_phone,
    sender_email, message, sender_fingerprint)
  values (p_place_id, case when v_item is not null then p_catalog_item_id end, v_kind, auth.uid(), btrim(p_name),
    nullif(btrim(coalesce(p_phone, '')), ''), nullif(lower(btrim(coalesce(p_email, ''))), ''), btrim(p_message), p_fingerprint)
  returning id into v_id;
  perform public.notify_place_managers(p_place_id, 'inquiry',
    case v_kind when 'reservation' then 'Nouvelle demande de réservation' when 'quote' then 'Nouvelle demande de devis' else 'Nouvelle demande' end,
    btrim(p_name) || coalesce(' · ' || v_item, '') || ' : ' || left(btrim(p_message), 120),
    '/espace-pro/lieux/' || p_place_id || '/demandes');
  return v_id;
end;
$$;
grant execute on function public.send_business_inquiry(uuid, text, uuid, text, text, text, text, text) to anon, authenticated;

create or replace function public.set_inquiry_status(p_inquiry_id uuid, p_status text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_status not in ('new', 'read', 'answered', 'closed') then
    raise exception 'Statut invalide' using errcode = '22023';
  end if;
  update public.business_inquiries
  set status = p_status, handled_at = case when p_status in ('answered', 'closed') then now() else handled_at end
  where id = p_inquiry_id and public.is_place_manager(place_id);
  if not found then raise exception 'Demande introuvable' using errcode = 'P0002'; end if;
end;
$$;
grant execute on function public.set_inquiry_status(uuid, text) to authenticated;

-- ------------------------------------------------------------ 6. offres datées
create or replace function public.submit_promotion(
  p_place_id uuid, p_title text, p_description text, p_starts_at timestamptz, p_ends_at timestamptz)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_place_manager(p_place_id) then
    raise exception 'Vous ne gérez pas cette fiche' using errcode = '42501';
  end if;
  if not public.place_has_feature(p_place_id, 'promotions') then
    raise exception 'Offres : plan Premium ou Sponsor' using errcode = 'P0004';
  end if;
  if p_ends_at <= greatest(p_starts_at, now()) or p_ends_at > p_starts_at + interval '60 days' then
    raise exception 'Période invalide (fin dans le futur, 60 jours au plus)' using errcode = '22023';
  end if;
  if (select count(*) from public.promotions where place_id = p_place_id and status in ('pending_review', 'active')
      and ends_at > now()) >= 3 then
    raise exception '3 offres en cours ou en attente au maximum' using errcode = 'P0001';
  end if;
  insert into public.promotions (place_id, title, description, starts_at, ends_at, status, created_by)
  values (p_place_id, btrim(p_title), nullif(btrim(coalesce(p_description, '')), ''), p_starts_at, p_ends_at,
    'pending_review', auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;
grant execute on function public.submit_promotion(uuid, text, text, timestamptz, timestamptz) to authenticated;

create or replace function public.moderate_promotion(p_promotion_id uuid, p_decision text, p_reason text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_promo public.promotions;
begin
  if not public.has_permission('campaigns.manage') then
    raise exception 'Permission campaigns.manage requise' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject', 'end') then
    raise exception 'Décision invalide' using errcode = '22023';
  end if;
  if p_decision = 'reject' and coalesce(btrim(p_reason), '') = '' then
    raise exception 'Motif obligatoire' using errcode = '22023';
  end if;
  update public.promotions
  set status = case p_decision when 'approve' then 'active' when 'reject' then 'rejected' else 'ended' end::public.promotion_status,
      updated_at = now()
  where id = p_promotion_id returning * into v_promo;
  if not found then raise exception 'Offre introuvable' using errcode = 'P0002'; end if;
  perform public.write_audit_log('promotion.' || p_decision, 'promotion', p_promotion_id::text,
    jsonb_build_object('reason', p_reason));
  perform public.notify_place_managers(v_promo.place_id, 'promotion',
    case p_decision when 'approve' then 'Offre publiée' when 'reject' then 'Offre refusée' else 'Offre arrêtée' end,
    '« ' || v_promo.title || ' »' || coalesce(' — ' || p_reason, ''),
    '/espace-pro/lieux/' || v_promo.place_id || '/offres');
end;
$$;
grant execute on function public.moderate_promotion(uuid, text, text) to authenticated;

-- Offres en cours (fiche, accueil) : établissements publiés, période en cours, jamais mêlées au sponsorisé.
create or replace function public.active_promotions(p_unit_id uuid default null, p_place_id uuid default null, p_limit integer default 12)
returns table (id uuid, title text, description text, starts_at timestamptz, ends_at timestamptz,
  place_id uuid, place_slug text, place_name text, logo_path text, category_icon text, category_color text, unit_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select pr.id, pr.title, pr.description, pr.starts_at, pr.ends_at, p.id, p.slug, p.name, p.logo_path,
    c.icon, c.color, u.name
  from public.promotions pr
  join public.places p on p.id = pr.place_id and p.publication_status = 'published' and p.merged_into_id is null
  left join public.categories c on c.id = p.primary_category_id
  left join public.geographic_units u on u.id = p.administrative_unit_id
  where pr.status = 'active' and now() between pr.starts_at and pr.ends_at
    and (p_place_id is null or pr.place_id = p_place_id)
    and (p_unit_id is null or p.administrative_unit_id in (select public.geographic_unit_descendants(p_unit_id)))
  order by pr.ends_at
  limit least(greatest(coalesce(p_limit, 12), 1), 50);
$$;
grant execute on function public.active_promotions(uuid, uuid, integer) to anon, authenticated;

-- ------------------------------------------------------------ 7. avis : notifications
create or replace function public.reviews_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_place public.places;
begin
  select * into v_place from public.places where id = new.place_id;
  if new.status = 'published' and old.status is distinct from 'published' then
    perform public.notify_place_managers(new.place_id, 'review', 'Nouvel avis (' || new.rating || '/5)',
      coalesce(new.title, left(coalesce(new.body, ''), 120)), '/espace-pro/lieux/' || new.place_id || '/avis');
  end if;
  if new.owner_response is not null and new.owner_response is distinct from old.owner_response then
    perform public.notify_user(new.author_id, 'review_response', 'Réponse à votre avis',
      v_place.name || ' a répondu à votre avis.', '/lieux/' || v_place.slug);
  end if;
  return null;
end;
$$;
create trigger reviews_notify after update on public.reviews for each row execute function public.reviews_notify();

-- ------------------------------------------------------------ 9. équipe
create table public.place_invitations (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  email text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$' and email = lower(email)),
  role public.place_owner_role not null default 'manager',
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  invited_by uuid references auth.users (id) on delete set null,
  accepted_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz
);
create unique index place_invitations_pending_unique on public.place_invitations (place_id, email) where status = 'pending';
alter table public.place_invitations enable row level security;
create policy "invitations: lecture" on public.place_invitations for select to authenticated
  using (public.is_place_manager(place_id));

create or replace function public.is_place_owner(p_place_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.place_owners where place_id = p_place_id and user_id = auth.uid() and role = 'owner');
$$;
grant execute on function public.is_place_owner(uuid) to authenticated;

create or replace function public.invite_place_member(p_place_id uuid, p_email text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_email text := lower(btrim(p_email));
  v_id uuid;
  v_user uuid;
begin
  if not public.is_place_owner(p_place_id) then
    raise exception 'Seul le propriétaire peut inviter' using errcode = '42501';
  end if;
  if (select count(*) from public.place_owners where place_id = p_place_id)
     + (select count(*) from public.place_invitations where place_id = p_place_id and status = 'pending' and expires_at > now()) >= 6 then
    raise exception '5 gestionnaires au maximum' using errcode = 'P0001';
  end if;
  select id into v_user from auth.users where lower(email) = v_email;
  if v_user is not null and exists (select 1 from public.place_owners where place_id = p_place_id and user_id = v_user) then
    raise exception 'Cette personne gère déjà la fiche' using errcode = 'P0001';
  end if;
  update public.place_invitations set status = 'expired' where place_id = p_place_id and email = v_email
    and status = 'pending' and expires_at <= now();
  insert into public.place_invitations (place_id, email, invited_by) values (p_place_id, v_email, auth.uid())
  returning id into v_id;
  perform public.write_audit_log('place.member_invited', 'place', p_place_id::text, jsonb_build_object('invitation', v_id));
  perform public.notify_user(v_user, 'invitation', 'Invitation à gérer une fiche',
    'Vous êtes invité(e) à gérer « ' || (select name from public.places where id = p_place_id) || ' ».', '/espace-pro');
  return v_id;
exception when unique_violation then
  raise exception 'Une invitation est déjà en attente pour cette adresse' using errcode = 'P0001';
end;
$$;
grant execute on function public.invite_place_member(uuid, text) to authenticated;

-- Invitations de l'utilisateur connecté (par son e-mail de compte).
create or replace function public.my_place_invitations()
returns table (id uuid, place_id uuid, place_name text, place_slug text, created_at timestamptz, expires_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select i.id, p.id, p.name, p.slug, i.created_at, i.expires_at
  from public.place_invitations i join public.places p on p.id = i.place_id
  where i.status = 'pending' and i.expires_at > now()
    and i.email = (select lower(email) from auth.users where id = auth.uid());
$$;
grant execute on function public.my_place_invitations() to authenticated;

create or replace function public.respond_place_invitation(p_invitation_id uuid, p_accept boolean)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.place_invitations;
begin
  select * into v_inv from public.place_invitations where id = p_invitation_id for update;
  if not found or v_inv.status <> 'pending' or v_inv.expires_at <= now()
     or v_inv.email <> (select lower(email) from auth.users where id = auth.uid()) then
    raise exception 'Invitation introuvable ou expirée' using errcode = 'P0002';
  end if;
  update public.place_invitations
  set status = case when p_accept then 'accepted' else 'revoked' end, accepted_by = auth.uid(), accepted_at = now()
  where id = p_invitation_id;
  if p_accept then
    insert into public.place_owners (place_id, user_id, role, granted_by)
    values (v_inv.place_id, auth.uid(), v_inv.role, v_inv.invited_by) on conflict do nothing;
    perform public.notify_place_managers(v_inv.place_id, 'team', 'Nouveau gestionnaire',
      'Une invitation à gérer la fiche a été acceptée.', '/espace-pro/lieux/' || v_inv.place_id || '/equipe');
  end if;
  perform public.write_audit_log(case when p_accept then 'place.member_joined' else 'place.invitation_declined' end,
    'place', v_inv.place_id::text, jsonb_build_object('invitation', p_invitation_id));
  return v_inv.place_id;
end;
$$;
grant execute on function public.respond_place_invitation(uuid, boolean) to authenticated;

create or replace function public.place_members(p_place_id uuid)
returns table (user_id uuid, display_name text, avatar_url text, role public.place_owner_role, since timestamptz, is_me boolean)
language sql
stable
security definer
set search_path = ''
as $$
  select po.user_id, coalesce(pr.display_name, 'Utilisateur'), pr.avatar_url, po.role, po.created_at, po.user_id = auth.uid()
  from public.place_owners po left join public.profiles pr on pr.id = po.user_id
  where po.place_id = p_place_id and public.is_place_manager(p_place_id)
  order by po.role, po.created_at;
$$;
grant execute on function public.place_members(uuid) to authenticated;

create or replace function public.manage_place_member(p_place_id uuid, p_target uuid, p_action text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_action = 'revoke_invitation' then
    if not public.is_place_owner(p_place_id) then raise exception 'Réservé au propriétaire' using errcode = '42501'; end if;
    update public.place_invitations set status = 'revoked' where id = p_target and place_id = p_place_id and status = 'pending';
  elsif p_action = 'remove' then
    if p_target = auth.uid() then
      -- Un gestionnaire peut quitter la fiche ; un propriétaire seul ne peut pas l'abandonner.
      if public.is_place_owner(p_place_id) and (select count(*) from public.place_owners where place_id = p_place_id and role = 'owner') = 1 then
        raise exception 'Le propriétaire ne peut pas quitter sa fiche' using errcode = 'P0001';
      end if;
    elsif not public.is_place_owner(p_place_id) then
      raise exception 'Réservé au propriétaire' using errcode = '42501';
    elsif exists (select 1 from public.place_owners where place_id = p_place_id and user_id = p_target and role = 'owner') then
      raise exception 'Impossible de retirer un propriétaire' using errcode = 'P0001';
    end if;
    delete from public.place_owners where place_id = p_place_id and user_id = p_target;
  else
    raise exception 'Action invalide' using errcode = '22023';
  end if;
  perform public.write_audit_log('place.member_' || p_action, 'place', p_place_id::text, jsonb_build_object('target', p_target));
end;
$$;
grant execute on function public.manage_place_member(uuid, uuid, text) to authenticated;

-- ------------------------------------------------------------ 10. vérification
create table public.verification_requests (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  requested_by uuid references auth.users (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'scheduled', 'completed', 'rejected', 'cancelled')),
  contact_phone text check (contact_phone is null or contact_phone ~ '^\+?[0-9 ]{6,20}$'),
  preferred_time text check (preferred_time is null or char_length(preferred_time) <= 120),
  notes text check (notes is null or char_length(notes) <= 500),
  scheduled_for date,
  admin_notes text check (admin_notes is null or char_length(admin_notes) <= 500),
  handled_by uuid references auth.users (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index verification_requests_open_unique on public.verification_requests (place_id)
  where status in ('pending', 'scheduled');
alter table public.verification_requests enable row level security;
create policy "vérifications demandées: lecture" on public.verification_requests for select to authenticated
  using (public.is_place_manager(place_id) or public.has_permission('places.publish'));

create or replace function public.request_place_verification(p_place_id uuid, p_phone text, p_preferred text, p_notes text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not public.is_place_manager(p_place_id) then
    raise exception 'Vous ne gérez pas cette fiche' using errcode = '42501';
  end if;
  if (select verification_status from public.places where id = p_place_id) <> 'unverified'
     and (select last_verified_at from public.places where id = p_place_id) > now() - interval '180 days' then
    raise exception 'Fiche vérifiée il y a moins de 6 mois' using errcode = 'P0001';
  end if;
  insert into public.verification_requests (place_id, requested_by, contact_phone, preferred_time, notes)
  values (p_place_id, auth.uid(), nullif(btrim(coalesce(p_phone, '')), ''), nullif(btrim(coalesce(p_preferred, '')), ''),
    nullif(btrim(coalesce(p_notes, '')), ''))
  returning id into v_id;
  perform public.write_audit_log('place.verification_requested', 'place', p_place_id::text, '{}'::jsonb);
  return v_id;
exception when unique_violation then
  raise exception 'Une demande est déjà en cours' using errcode = 'P0001';
end;
$$;
grant execute on function public.request_place_verification(uuid, text, text, text) to authenticated;

create or replace function public.handle_verification_request(p_request_id uuid, p_decision text, p_scheduled_for date, p_notes text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_req public.verification_requests;
begin
  select * into v_req from public.verification_requests where id = p_request_id for update;
  if not found then raise exception 'Demande introuvable' using errcode = 'P0002'; end if;
  if p_decision = 'cancel' then
    if not public.is_place_manager(v_req.place_id) then raise exception 'Non autorisé' using errcode = '42501'; end if;
  elsif not public.has_permission('places.publish') then
    raise exception 'Permission places.publish requise' using errcode = '42501';
  end if;
  if v_req.status not in ('pending', 'scheduled') then
    raise exception 'Demande déjà traitée' using errcode = 'P0001';
  end if;
  if p_decision = 'reject' and coalesce(btrim(p_notes), '') = '' then
    raise exception 'Motif obligatoire' using errcode = '22023';
  end if;
  update public.verification_requests
  set status = case p_decision when 'schedule' then 'scheduled' when 'complete' then 'completed'
                 when 'reject' then 'rejected' when 'cancel' then 'cancelled' else null end,
      scheduled_for = coalesce(p_scheduled_for, scheduled_for), admin_notes = coalesce(nullif(btrim(coalesce(p_notes, '')), ''), admin_notes),
      handled_by = auth.uid(), handled_at = now()
  where id = p_request_id;
  if p_decision = 'complete' then
    perform set_config('boyoma.internal_write', 'on', true);
    update public.places set verification_status = 'agent_verified', last_verified_at = now() where id = v_req.place_id;
    perform set_config('boyoma.internal_write', 'off', true);
    insert into public.place_verifications (place_id, verified_by, method, notes)
    values (v_req.place_id, auth.uid(), 'field_visit', nullif(btrim(coalesce(p_notes, '')), ''));
  end if;
  perform public.write_audit_log('place.verification_' || p_decision, 'place', v_req.place_id::text,
    jsonb_build_object('request', p_request_id, 'scheduled_for', p_scheduled_for));
  if p_decision <> 'cancel' then
    perform public.notify_place_managers(v_req.place_id, 'verification',
      case p_decision when 'schedule' then 'Visite de vérification planifiée' when 'complete' then 'Fiche vérifiée sur le terrain'
        else 'Demande de vérification refusée' end,
      coalesce(to_char(p_scheduled_for, 'DD/MM/YYYY'), '') || coalesce(' ' || nullif(btrim(coalesce(p_notes, '')), ''), ''),
      '/espace-pro/lieux/' || v_req.place_id || '/verification');
  end if;
end;
$$;
grant execute on function public.handle_verification_request(uuid, text, date, text) to authenticated;

-- ------------------------------------------------------------ 11. abonnements
create or replace function public.billing_instructions()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case when jsonb_typeof(value) = 'string' then value #>> '{}' end
  from public.application_settings where key = 'billing.manual_instructions';
$$;
grant execute on function public.billing_instructions() to authenticated;

-- L'établissement indique la référence de sa transaction ; seule l'équipe peut confirmer (confirm_manual_payment).
create or replace function public.submit_payment_reference(p_payment_id uuid, p_reference text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_place uuid;
begin
  select i.place_id into v_place from public.payments pay join public.invoices i on i.id = pay.invoice_id
  where pay.id = p_payment_id and pay.status = 'pending' and pay.provider in ('manual', 'bank_transfer');
  if v_place is null or not public.is_place_manager(v_place) then
    raise exception 'Paiement introuvable' using errcode = 'P0002';
  end if;
  if char_length(btrim(coalesce(p_reference, ''))) not between 4 and 80 then
    raise exception 'Référence de transaction invalide' using errcode = '22023';
  end if;
  update public.payments set provider_reference = btrim(p_reference), updated_at = now() where id = p_payment_id;
  perform public.write_audit_log('payment.reference_submitted', 'payment', p_payment_id::text,
    jsonb_build_object('reference', btrim(p_reference)));
end;
$$;
grant execute on function public.submit_payment_reference(uuid, text) to authenticated;

create or replace function public.cancel_pending_subscription(p_subscription_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sub public.subscriptions;
begin
  select * into v_sub from public.subscriptions where id = p_subscription_id for update;
  if not found or v_sub.status <> 'pending_payment'
     or not (public.is_place_manager(v_sub.place_id) or public.has_permission('billing.manage')) then
    raise exception 'Abonnement introuvable ou déjà actif' using errcode = 'P0002';
  end if;
  update public.subscriptions set status = 'cancelled', cancelled_at = now() where id = p_subscription_id;
  update public.invoices set status = 'void' where subscription_id = p_subscription_id and status = 'open';
  update public.payments set status = 'cancelled', updated_at = now()
  where status = 'pending' and invoice_id in (select id from public.invoices where subscription_id = p_subscription_id);
  perform public.write_audit_log('subscription.cancelled', 'subscription', p_subscription_id::text, '{}'::jsonb);
end;
$$;
grant execute on function public.cancel_pending_subscription(uuid) to authenticated;

create or replace function public.reject_manual_payment(p_payment_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_inv public.invoices;
begin
  if not public.has_permission('billing.manage') then
    raise exception 'Permission billing.manage requise' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' then raise exception 'Motif obligatoire' using errcode = '22023'; end if;
  update public.payments set status = 'failed', failure_reason = left(btrim(p_reason), 500), updated_at = now()
  where id = p_payment_id and status = 'pending';
  if not found then raise exception 'Paiement introuvable ou déjà traité' using errcode = 'P0002'; end if;
  select i.* into v_inv from public.invoices i join public.payments p on p.invoice_id = i.id where p.id = p_payment_id;
  perform public.write_audit_log('payment.rejected', 'payment', p_payment_id::text, jsonb_build_object('reason', p_reason));
  perform public.notify_place_managers(v_inv.place_id, 'billing', 'Paiement non validé',
    btrim(p_reason) || ' — vous pouvez corriger la référence ou annuler la demande.',
    '/espace-pro/lieux/' || v_inv.place_id || '/abonnement');
end;
$$;
grant execute on function public.reject_manual_payment(uuid, text) to authenticated;

-- Plan offert (lancement, partenariat) : tracé, sans paiement, par l'équipe facturation.
create or replace function public.admin_grant_plan(p_place_id uuid, p_plan_key text, p_months integer, p_reason text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans;
  v_sub uuid;
begin
  if not public.has_permission('billing.manage') then
    raise exception 'Permission billing.manage requise' using errcode = '42501';
  end if;
  if coalesce(btrim(p_reason), '') = '' or p_months not between 1 and 12 then
    raise exception 'Motif et durée (1 à 12 mois) obligatoires' using errcode = '22023';
  end if;
  select * into v_plan from public.plans where key = p_plan_key and is_active and price_monthly > 0;
  if not found then raise exception 'Plan introuvable' using errcode = 'P0002'; end if;
  if exists (select 1 from public.subscriptions where place_id = p_place_id and status in ('pending_payment', 'trialing', 'active', 'past_due')
             and (current_period_end is null or current_period_end > now())) then
    raise exception 'Un abonnement est déjà en cours pour cet établissement' using errcode = 'P0001';
  end if;
  insert into public.subscriptions (place_id, plan_id, status, current_period_start, current_period_end, created_by)
  values (p_place_id, v_plan.id, 'active', now(), now() + make_interval(months => p_months), auth.uid())
  returning id into v_sub;
  insert into public.invoices (subscription_id, place_id, description, amount, currency, status, period_start, period_end, paid_at)
  values (v_sub, p_place_id, 'Plan ' || v_plan.name || ' offert — ' || left(btrim(p_reason), 120), 0, v_plan.currency, 'paid',
    now(), now() + make_interval(months => p_months), now());
  perform public.write_audit_log('subscription.granted', 'subscription', v_sub::text,
    jsonb_build_object('place', p_place_id, 'plan', p_plan_key, 'months', p_months, 'reason', p_reason));
  perform public.notify_place_managers(p_place_id, 'billing', 'Plan ' || v_plan.name || ' activé',
    'Offert pour ' || p_months || ' mois.', '/espace-pro/lieux/' || p_place_id || '/abonnement');
  return v_sub;
end;
$$;
grant execute on function public.admin_grant_plan(uuid, text, integer, text) to authenticated;

create or replace function public.payments_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_place uuid;
begin
  if new.status = 'confirmed' and old.status is distinct from 'confirmed' then
    select place_id into v_place from public.invoices where id = new.invoice_id;
    perform public.notify_place_managers(v_place, 'billing', 'Paiement confirmé',
      'Votre abonnement est actif.', '/espace-pro/lieux/' || v_place || '/abonnement');
  end if;
  return null;
end;
$$;
create trigger payments_notify after update of status on public.payments for each row execute function public.payments_notify();

revoke execute on function public.place_owners_notify(), public.reviews_notify(), public.payments_notify() from public, anon, authenticated;
revoke execute on function
  public.owner_place_stats(uuid, integer), public.set_inquiry_status(uuid, text), public.submit_promotion(uuid, text, text, timestamptz, timestamptz),
  public.moderate_promotion(uuid, text, text), public.is_place_owner(uuid), public.invite_place_member(uuid, text),
  public.my_place_invitations(), public.respond_place_invitation(uuid, boolean), public.place_members(uuid),
  public.manage_place_member(uuid, uuid, text), public.request_place_verification(uuid, text, text, text),
  public.handle_verification_request(uuid, text, date, text), public.billing_instructions(),
  public.submit_payment_reference(uuid, text), public.cancel_pending_subscription(uuid), public.reject_manual_payment(uuid, text),
  public.admin_grant_plan(uuid, text, integer, text), public.mark_notifications_read(uuid[])
from public, anon;
