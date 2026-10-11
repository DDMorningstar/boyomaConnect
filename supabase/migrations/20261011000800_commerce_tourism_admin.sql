-- =============================================================================
-- BOYOMA CONNECT — 0008 : commerce (plans, abonnements, paiements), tourisme,
-- paramètres, notifications, stockage.
-- Décisions :
--  * products + service_offerings fusionnées en catalog_items (colonne kind).
--  * Abonnement rattaché à un établissement (place_id), pas au compte.
--  * Aucun paiement n'est confirmé par un clic : uniquement webhook signé vérifié
--    côté serveur, validation manuelle auditée, ou fournisseur « simulated » en dev.
-- =============================================================================

-- --------------------------------------------------------- paramètres applicatifs
create table public.application_settings (
  key text primary key check (key ~ '^[a-z0-9_.]+$' and key !~ '(secret|password|token|private_key)'),
  value jsonb not null,
  description text,
  is_public boolean not null default false,   -- lisible par les visiteurs
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
create or replace function public.application_settings_audit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  perform public.write_audit_log('setting.changed', 'application_setting', new.key,
    jsonb_build_object('old', case when tg_op = 'UPDATE' then old.value end, 'new', new.value));
  return new;
end;
$$;
create trigger application_settings_audit before insert or update on public.application_settings
  for each row execute function public.application_settings_audit();

create or replace function public.get_setting(p_key text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select value from public.application_settings where key = p_key;
$$;
revoke execute on function public.get_setting(text) from public, anon, authenticated;

-- ------------------------------------------------------------------- plans
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key ~ '^[a-z0-9_]+$'),
  name text not null,
  description text,
  price_monthly numeric(10, 2) not null check (price_monthly >= 0),
  currency char(3) not null default 'USD' check (currency in ('USD', 'CDF')),
  trial_days integer not null default 0 check (trial_days between 0 and 90),
  is_active boolean not null default true,
  is_public boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger plans_updated_at before update on public.plans for each row execute function public.set_updated_at();

create table public.plan_features (
  plan_id uuid not null references public.plans (id) on delete cascade,
  feature_key text not null check (feature_key ~ '^[a-z0-9_.]+$'),
  value jsonb not null default 'true'::jsonb,  -- true/false ou limite numérique
  label text,
  primary key (plan_id, feature_key)
);

-- ------------------------------------------------------------- abonnements
create type public.subscription_status as enum
  ('pending_payment', 'trialing', 'active', 'past_due', 'cancelled', 'expired');

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete restrict,
  plan_id uuid not null references public.plans (id) on delete restrict,
  status public.subscription_status not null default 'pending_payment',
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  cancelled_at timestamptz,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subscriptions_period check (current_period_end is null or current_period_start is null or current_period_end > current_period_start)
);
create unique index subscriptions_one_open_per_place on public.subscriptions (place_id)
  where status in ('pending_payment', 'trialing', 'active', 'past_due');
create index subscriptions_status_idx on public.subscriptions (status, current_period_end);
create trigger subscriptions_updated_at before update on public.subscriptions for each row execute function public.set_updated_at();

create table public.subscription_history (
  id bigint generated always as identity primary key,
  subscription_id uuid not null references public.subscriptions (id) on delete cascade,
  from_status public.subscription_status,
  to_status public.subscription_status not null,
  actor_id uuid references auth.users (id) on delete set null,
  note text,
  created_at timestamptz not null default now()
);
create index subscription_history_sub_idx on public.subscription_history (subscription_id, created_at);

create or replace function public.subscriptions_track_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into public.subscription_history (subscription_id, from_status, to_status, actor_id)
    values (new.id, case when tg_op = 'UPDATE' then old.status end, new.status, auth.uid());
  end if;
  return null;
end;
$$;
create trigger subscriptions_track_status after insert or update on public.subscriptions
  for each row execute function public.subscriptions_track_status();

-- ---------------------------------------------------------------- factures
create sequence public.invoice_number_seq;
create type public.invoice_status as enum ('open', 'paid', 'void');

create table public.invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null unique default ('BC-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 6, '0')),
  subscription_id uuid references public.subscriptions (id) on delete restrict,
  place_id uuid not null references public.places (id) on delete restrict,
  description text not null,
  amount numeric(10, 2) not null check (amount >= 0),
  currency char(3) not null check (currency in ('USD', 'CDF')),
  status public.invoice_status not null default 'open',
  period_start timestamptz,
  period_end timestamptz,
  issued_at timestamptz not null default now(),
  due_at timestamptz,
  paid_at timestamptz,
  created_at timestamptz not null default now()
);
create index invoices_place_idx on public.invoices (place_id, issued_at desc);
create index invoices_status_idx on public.invoices (status);

-- ---------------------------------------------------------------- paiements
create type public.payment_provider as enum
  ('simulated', 'manual', 'mpesa', 'orange_money', 'airtel_money', 'bank_transfer');
create type public.payment_status as enum ('pending', 'confirmed', 'failed', 'cancelled', 'refunded');

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  provider public.payment_provider not null,
  idempotency_key text not null unique check (char_length(idempotency_key) between 16 and 100),
  provider_reference text,                     -- référence transmise par le fournisseur / saisie à la validation
  amount numeric(10, 2) not null check (amount > 0),
  currency char(3) not null check (currency in ('USD', 'CDF')),
  status public.payment_status not null default 'pending',
  failure_reason text,
  confirmed_at timestamptz,
  confirmed_by uuid references auth.users (id) on delete set null, -- NULL = confirmé par webhook
  confirmation_source text check (confirmation_source in ('webhook', 'manual_review', 'simulated')),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint payments_confirmation_consistency check (
    status <> 'confirmed' or (confirmed_at is not null and confirmation_source is not null)
  )
);
create unique index payments_provider_reference_unique on public.payments (provider, provider_reference)
  where provider_reference is not null;
create index payments_invoice_idx on public.payments (invoice_id);
create index payments_status_idx on public.payments (status, created_at);
create trigger payments_updated_at before update on public.payments for each row execute function public.set_updated_at();

-- Événements bruts reçus des fournisseurs (webhooks). Idempotence via (provider, event_id).
create table public.payment_events (
  id bigint generated always as identity primary key,
  provider public.payment_provider not null,
  event_id text not null,
  payment_id uuid references public.payments (id) on delete set null,
  event_type text not null,
  signature_valid boolean not null,
  payload jsonb not null,                       -- sans données bancaires complètes
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  unique (provider, event_id)
);
create index payment_events_payment_idx on public.payment_events (payment_id);

-- Applique la confirmation d'un paiement (interne). Idempotent : un paiement déjà
-- confirmé n'est jamais retraité.
create or replace function public.apply_payment_confirmation(
  p_payment_id uuid, p_source text, p_provider_reference text, p_actor uuid
) returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  pay public.payments%rowtype;
  inv public.invoices%rowtype;
  sub public.subscriptions%rowtype;
  v_start timestamptz;
begin
  select * into pay from public.payments where id = p_payment_id for update;
  if not found then
    raise exception 'Paiement introuvable' using errcode = 'P0002';
  end if;
  if pay.status = 'confirmed' then
    return false; -- double confirmation ignorée
  end if;
  if pay.status <> 'pending' then
    raise exception 'Paiement non confirmable (statut : %)', pay.status using errcode = 'P0001';
  end if;

  update public.payments set status = 'confirmed', confirmed_at = now(), confirmed_by = p_actor,
    confirmation_source = p_source, provider_reference = coalesce(p_provider_reference, provider_reference)
  where id = pay.id;

  select * into inv from public.invoices where id = pay.invoice_id for update;
  if (select coalesce(sum(amount), 0) from public.payments where invoice_id = inv.id and status = 'confirmed') >= inv.amount then
    update public.invoices set status = 'paid', paid_at = now() where id = inv.id and status = 'open';
    if inv.subscription_id is not null then
      select * into sub from public.subscriptions where id = inv.subscription_id for update;
      v_start := greatest(coalesce(sub.current_period_end, now()), now());
      update public.subscriptions set status = 'active',
        current_period_start = coalesce(inv.period_start, v_start),
        current_period_end = coalesce(inv.period_end, v_start + interval '1 month')
      where id = sub.id;
    end if;
  end if;

  perform public.write_audit_log('payment.confirmed', 'payment', pay.id::text,
    jsonb_build_object('source', p_source, 'amount', pay.amount, 'currency', pay.currency, 'invoice', inv.number));
  return true;
end;
$$;
revoke execute on function public.apply_payment_confirmation(uuid, text, text, uuid) from public, anon, authenticated;

-- Validation manuelle (ex. virement, dépôt Mobile Money vérifié par un administrateur).
create or replace function public.confirm_manual_payment(p_payment_id uuid, p_provider_reference text, p_note text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('billing.manage') then
    raise exception 'Permission billing.manage requise' using errcode = '42501';
  end if;
  if coalesce(btrim(p_provider_reference), '') = '' or coalesce(btrim(p_note), '') = '' then
    raise exception 'Référence de transaction et justification obligatoires' using errcode = '22023';
  end if;
  if exists (select 1 from public.payments where id = p_payment_id and created_by = auth.uid()) then
    raise exception 'Vous ne pouvez pas valider un paiement que vous avez initié' using errcode = '42501';
  end if;
  perform public.write_audit_log('payment.manual_review', 'payment', p_payment_id::text,
    jsonb_build_object('reference', p_provider_reference, 'note', p_note));
  return public.apply_payment_confirmation(p_payment_id, 'manual_review', p_provider_reference, auth.uid());
end;
$$;
revoke execute on function public.confirm_manual_payment(uuid, text, text) from public, anon;
grant execute on function public.confirm_manual_payment(uuid, text, text) to authenticated;

-- Paiement simulé : DÉVELOPPEMENT UNIQUEMENT. Refusé si le paramètre
-- billing.simulated_payments_enabled n'est pas explicitement à true.
create or replace function public.simulate_payment_confirmation(p_payment_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce((public.get_setting('billing.simulated_payments_enabled'))::boolean, false) is not true then
    raise exception 'Paiements simulés désactivés' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.payments pay join public.invoices i on i.id = pay.invoice_id
    where pay.id = p_payment_id and pay.provider = 'simulated'
      and (public.is_place_manager(i.place_id) or public.has_permission('billing.manage'))
  ) then
    raise exception 'Paiement simulé introuvable' using errcode = 'P0002';
  end if;
  return public.apply_payment_confirmation(p_payment_id, 'simulated', 'SIM-' || p_payment_id::text, auth.uid());
end;
$$;
revoke execute on function public.simulate_payment_confirmation(uuid) from public, anon;
grant execute on function public.simulate_payment_confirmation(uuid) to authenticated;

-- Démarre un abonnement : crée abonnement + facture + paiement « pending ».
-- Idempotent grâce à p_idempotency_key (rejouer la même requête renvoie le même paiement).
create or replace function public.start_subscription_checkout(
  p_place_id uuid, p_plan_key text, p_provider public.payment_provider, p_idempotency_key text
) returns table (subscription_id uuid, invoice_id uuid, payment_id uuid, amount numeric, currency char(3))
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans%rowtype;
  v_sub uuid;
  v_inv uuid;
  v_pay uuid;
begin
  if not (public.is_place_manager(p_place_id) or public.has_permission('billing.manage')) then
    raise exception 'Vous ne gérez pas cet établissement' using errcode = '42501';
  end if;
  if p_provider = 'simulated' and coalesce((public.get_setting('billing.simulated_payments_enabled'))::boolean, false) is not true then
    raise exception 'Paiements simulés désactivés' using errcode = '42501';
  end if;
  if p_provider not in ('simulated', 'manual', 'bank_transfer') then
    raise exception 'Fournisseur de paiement non configuré' using errcode = '0A000';
  end if;

  select pay.id into v_pay from public.payments pay where pay.idempotency_key = p_idempotency_key;
  if v_pay is not null then
    return query select i.subscription_id, i.id, pay.id, pay.amount, pay.currency
      from public.payments pay join public.invoices i on i.id = pay.invoice_id where pay.id = v_pay;
    return;
  end if;

  select * into v_plan from public.plans where key = p_plan_key and is_active;
  if not found then
    raise exception 'Plan introuvable' using errcode = 'P0002';
  end if;
  if v_plan.price_monthly = 0 then
    raise exception 'Le plan gratuit ne nécessite pas de paiement' using errcode = '22023';
  end if;
  if exists (select 1 from public.subscriptions where place_id = p_place_id and status in ('pending_payment', 'trialing', 'active', 'past_due')) then
    raise exception 'Un abonnement est déjà en cours pour cet établissement' using errcode = 'P0001';
  end if;

  insert into public.subscriptions (place_id, plan_id, status, created_by)
  values (p_place_id, v_plan.id, 'pending_payment', auth.uid()) returning id into v_sub;
  insert into public.invoices (subscription_id, place_id, description, amount, currency, due_at)
  values (v_sub, p_place_id, 'Abonnement ' || v_plan.name || ' — 1 mois', v_plan.price_monthly, v_plan.currency, now() + interval '7 days')
  returning id into v_inv;
  insert into public.payments (invoice_id, provider, idempotency_key, amount, currency, created_by)
  values (v_inv, p_provider, p_idempotency_key, v_plan.price_monthly, v_plan.currency, auth.uid())
  returning id into v_pay;

  return query select v_sub, v_inv, v_pay, v_plan.price_monthly, v_plan.currency;
end;
$$;
revoke execute on function public.start_subscription_checkout(uuid, text, public.payment_provider, text) from public, anon;
grant execute on function public.start_subscription_checkout(uuid, text, public.payment_provider, text) to authenticated;

-- Plan effectif d'un lieu (gratuit par défaut).
create or replace function public.place_active_plan(p_place_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select pl.key from public.subscriptions s join public.plans pl on pl.id = s.plan_id
    where s.place_id = p_place_id and s.status in ('active', 'trialing')
      and (s.current_period_end is null or s.current_period_end > now())
    order by s.created_at desc limit 1
  ), 'free');
$$;
grant execute on function public.place_active_plan(uuid) to anon, authenticated;

create or replace function public.place_has_feature(p_place_id uuid, p_feature text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select (pf.value = 'true'::jsonb) or (jsonb_typeof(pf.value) = 'number' and (pf.value)::numeric > 0)
    from public.plans pl join public.plan_features pf on pf.plan_id = pl.id
    where pl.key = public.place_active_plan(p_place_id) and pf.feature_key = p_feature
  ), false);
$$;
grant execute on function public.place_has_feature(uuid, text) to anon, authenticated;

-- ---------------------------------------------------- promotions et campagnes
create type public.promotion_status as enum ('draft', 'pending_review', 'active', 'ended', 'rejected');

create table public.promotions (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  description text check (description is null or char_length(description) <= 1000),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.promotion_status not null default 'draft',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint promotions_dates check (ends_at > starts_at)
);
create index promotions_place_idx on public.promotions (place_id, status);
create index promotions_active_idx on public.promotions (starts_at, ends_at) where status = 'active';
create trigger promotions_updated_at before update on public.promotions for each row execute function public.set_updated_at();

create type public.campaign_placement as enum ('home_featured', 'search_top', 'category_top');

create table public.advertising_campaigns (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  title text not null check (char_length(title) between 3 and 120),
  placement public.campaign_placement not null,
  category_id uuid references public.categories (id) on delete set null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status public.promotion_status not null default 'pending_review',
  created_by uuid references auth.users (id) on delete set null,
  reviewed_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint advertising_campaigns_dates check (ends_at > starts_at)
);
create index advertising_campaigns_active_idx on public.advertising_campaigns (placement, starts_at, ends_at) where status = 'active';
create trigger advertising_campaigns_updated_at before update on public.advertising_campaigns for each row execute function public.set_updated_at();

create table public.campaign_events (
  id bigint generated always as identity primary key,
  campaign_id uuid not null references public.advertising_campaigns (id) on delete cascade,
  event_type text not null check (event_type in ('impression', 'click')),
  session_hash text not null check (char_length(session_hash) between 16 and 128),
  created_at timestamptz not null default now()
);
create index campaign_events_campaign_idx on public.campaign_events (campaign_id, created_at);

create or replace function public.record_campaign_event(p_campaign_id uuid, p_event_type text, p_session_hash text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_event_type not in ('impression', 'click') or p_session_hash is null or char_length(p_session_hash) not between 16 and 128 then
    raise exception 'Paramètres invalides' using errcode = '22023';
  end if;
  if not exists (select 1 from public.advertising_campaigns where id = p_campaign_id and status = 'active' and now() between starts_at and ends_at) then
    return false;
  end if;
  if exists (select 1 from public.campaign_events where campaign_id = p_campaign_id and event_type = p_event_type
             and session_hash = p_session_hash and created_at > now() - interval '30 minutes') then
    return false;
  end if;
  insert into public.campaign_events (campaign_id, event_type, session_hash) values (p_campaign_id, p_event_type, p_session_hash);
  return true;
end;
$$;
revoke execute on function public.record_campaign_event(uuid, text, text) from public;
grant execute on function public.record_campaign_event(uuid, text, text) to anon, authenticated;

-- Campagnes actives d'un emplacement (affichées avec la mention « Sponsorisé »).
create or replace function public.active_sponsored_places(p_placement public.campaign_placement, p_category_id uuid default null, p_limit integer default 3)
returns table (campaign_id uuid, place_id uuid, slug text, name text, short_description text, cover_path text, primary_category_id uuid)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, p.id, p.slug, p.name, p.short_description, p.cover_path, p.primary_category_id
  from public.advertising_campaigns c join public.places p on p.id = c.place_id
  where c.status = 'active' and c.placement = p_placement and now() between c.starts_at and c.ends_at
    and p.publication_status = 'published'
    and (p_category_id is null or c.category_id is null or c.category_id = p_category_id)
  order by random()
  limit least(greatest(p_limit, 1), 6);
$$;
grant execute on function public.active_sponsored_places(public.campaign_placement, uuid, integer) to anon, authenticated;

-- ----------------------------------------------------- catalogue et demandes
create table public.catalog_items (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  kind text not null check (kind in ('product', 'service')),
  name text not null check (char_length(name) between 2 and 120),
  description text check (description is null or char_length(description) <= 2000),
  category_label text check (category_label is null or char_length(category_label) <= 60),
  price numeric(12, 2) check (price is null or price >= 0),   -- facultatif
  currency char(3) check (currency in ('USD', 'CDF')),
  availability text not null default 'unknown' check (availability in ('available', 'on_request', 'unavailable', 'unknown')),
  photo_paths text[] not null default '{}' check (cardinality(photo_paths) <= 6),
  is_published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint catalog_items_price_currency check (price is null or currency is not null)
);
create index catalog_items_place_idx on public.catalog_items (place_id, sort_order);
create trigger catalog_items_updated_at before update on public.catalog_items for each row execute function public.set_updated_at();

create table public.business_inquiries (
  id uuid primary key default gen_random_uuid(),
  place_id uuid not null references public.places (id) on delete cascade,
  catalog_item_id uuid references public.catalog_items (id) on delete set null,
  kind text not null check (kind in ('contact', 'quote', 'reservation')),
  sender_id uuid references auth.users (id) on delete set null,
  sender_name text not null check (char_length(sender_name) between 2 and 80),
  sender_phone text check (sender_phone is null or sender_phone ~ '^\+?[0-9 ]{6,20}$'),
  sender_email text check (sender_email is null or sender_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  message text not null check (char_length(message) between 5 and 2000),
  status text not null default 'new' check (status in ('new', 'read', 'answered', 'closed')),
  created_at timestamptz not null default now(),
  constraint business_inquiries_contact check (sender_phone is not null or sender_email is not null)
);
create index business_inquiries_place_idx on public.business_inquiries (place_id, created_at desc);

-- ------------------------------------------------------------------ tourisme
create type public.content_status as enum ('draft', 'published', 'archived');

create table public.tourism_routes (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 3 and 140),
  summary text check (summary is null or char_length(summary) <= 300),
  description text,
  duration_minutes integer check (duration_minutes is null or duration_minutes > 0),
  duration_verified boolean not null default false, -- n'afficher la durée que si vérifiée
  difficulty text check (difficulty in ('easy', 'moderate', 'hard')),
  accessibility_notes text,
  cover_path text,
  languages text[] not null default '{fr}',
  status public.content_status not null default 'draft',
  created_by uuid references auth.users (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger tourism_routes_updated_at before update on public.tourism_routes for each row execute function public.set_updated_at();

create table public.tourism_route_stops (
  route_id uuid not null references public.tourism_routes (id) on delete cascade,
  position smallint not null check (position >= 1),
  place_id uuid not null references public.places (id) on delete restrict,
  notes text check (notes is null or char_length(notes) <= 1000),
  primary key (route_id, position)
);
create index tourism_route_stops_place_idx on public.tourism_route_stops (place_id);

create table public.tourism_content (
  id uuid primary key default gen_random_uuid(),
  place_id uuid references public.places (id) on delete cascade,
  kind text not null check (kind in ('history', 'practical_info', 'culture', 'guide')),
  title text not null check (char_length(title) between 3 and 140),
  body text not null,
  language text not null default 'fr' check (language in ('fr', 'sw', 'ln', 'en')),
  sources text,                                  -- références obligatoires pour les contenus historiques
  status public.content_status not null default 'draft',
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tourism_content_history_sources check (kind <> 'history' or status <> 'published' or sources is not null)
);
create index tourism_content_place_idx on public.tourism_content (place_id);
create trigger tourism_content_updated_at before update on public.tourism_content for each row execute function public.set_updated_at();

-- ------------------------------------------------------------- notifications
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  title text not null,
  body text,
  link text check (link is null or link ~ '^/'), -- liens internes uniquement (pas de redirection ouverte)
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;

-- ---------------------------------------------------------------------- RLS
alter table public.application_settings enable row level security;
alter table public.plans enable row level security;
alter table public.plan_features enable row level security;
alter table public.subscriptions enable row level security;
alter table public.subscription_history enable row level security;
alter table public.invoices enable row level security;
alter table public.payments enable row level security;
alter table public.payment_events enable row level security;
alter table public.promotions enable row level security;
alter table public.advertising_campaigns enable row level security;
alter table public.campaign_events enable row level security;
alter table public.catalog_items enable row level security;
alter table public.business_inquiries enable row level security;
alter table public.tourism_routes enable row level security;
alter table public.tourism_route_stops enable row level security;
alter table public.tourism_content enable row level security;
alter table public.notifications enable row level security;

create policy "paramètres publics" on public.application_settings for select to anon, authenticated
  using (is_public or public.has_permission('settings.manage'));
create policy "paramètres gérés" on public.application_settings for all to authenticated
  using (public.has_permission('settings.manage')) with check (public.has_permission('settings.manage'));

create policy "plans publics" on public.plans for select to anon, authenticated
  using ((is_active and is_public) or public.has_permission('plans.manage'));
create policy "plans gérés" on public.plans for all to authenticated
  using (public.has_permission('plans.manage')) with check (public.has_permission('plans.manage'));
create policy "fonctionnalités lisibles" on public.plan_features for select to anon, authenticated using (true);
create policy "fonctionnalités gérées" on public.plan_features for all to authenticated
  using (public.has_permission('plans.manage')) with check (public.has_permission('plans.manage'));

-- Opérations financières : lecture par le gestionnaire du lieu ou billing.read ;
-- aucune écriture directe (fonctions SECURITY DEFINER uniquement). Les modérateurs n'ont pas billing.*.
create policy "abonnements: lecture" on public.subscriptions for select to authenticated
  using (public.is_place_manager(place_id) or public.has_permission('billing.read'));
create policy "abonnements: gestion" on public.subscriptions for update to authenticated
  using (public.has_permission('billing.manage')) with check (public.has_permission('billing.manage'));
create policy "historique abonnements: lecture" on public.subscription_history for select to authenticated
  using (public.has_permission('billing.read')
    or exists (select 1 from public.subscriptions s where s.id = subscription_id and public.is_place_manager(s.place_id)));
create policy "factures: lecture" on public.invoices for select to authenticated
  using (public.is_place_manager(place_id) or public.has_permission('billing.read'));
create policy "paiements: lecture" on public.payments for select to authenticated
  using (public.has_permission('billing.read')
    or exists (select 1 from public.invoices i where i.id = invoice_id and public.is_place_manager(i.place_id)));
create policy "événements de paiement: lecture" on public.payment_events for select to authenticated
  using (public.has_permission('billing.manage'));

create policy "promotions: lecture" on public.promotions for select to anon, authenticated
  using ((status = 'active' and now() between starts_at and ends_at and public.is_place_public(place_id))
    or public.is_place_manager(place_id) or public.has_permission('campaigns.manage'));
create policy "promotions: création" on public.promotions for insert to authenticated
  with check (public.is_place_manager(place_id) and status in ('draft', 'pending_review') and public.place_has_feature(place_id, 'promotions'));
create policy "promotions: modification" on public.promotions for update to authenticated
  using (public.is_place_manager(place_id) or public.has_permission('campaigns.manage'))
  with check (public.has_permission('campaigns.manage') or (public.is_place_manager(place_id) and status in ('draft', 'pending_review', 'ended')));

create policy "campagnes: lecture" on public.advertising_campaigns for select to authenticated
  using (public.is_place_manager(place_id) or public.has_permission('campaigns.manage'));
create policy "campagnes: demande" on public.advertising_campaigns for insert to authenticated
  with check (public.is_place_manager(place_id) and status = 'pending_review' and public.place_has_feature(place_id, 'sponsored_campaigns'));
create policy "campagnes: gestion" on public.advertising_campaigns for update to authenticated
  using (public.has_permission('campaigns.manage')) with check (public.has_permission('campaigns.manage'));
create policy "événements de campagne: lecture" on public.campaign_events for select to authenticated
  using (public.has_permission('campaigns.manage')
    or exists (select 1 from public.advertising_campaigns c where c.id = campaign_id and public.is_place_manager(c.place_id)));

create policy "catalogue: lecture" on public.catalog_items for select to anon, authenticated
  using ((is_published and public.is_place_public(place_id)) or public.is_place_manager(place_id) or public.has_permission('places.edit_any'));
create policy "catalogue: gestion" on public.catalog_items for all to authenticated
  using (public.is_place_manager(place_id) or public.has_permission('places.edit_any'))
  with check ((public.is_place_manager(place_id) and public.place_has_feature(place_id, 'catalog')) or public.has_permission('places.edit_any'));

create policy "demandes: envoi" on public.business_inquiries for insert to anon, authenticated
  with check (public.is_place_public(place_id) and status = 'new' and (sender_id is null or sender_id = auth.uid()));
create policy "demandes: lecture" on public.business_inquiries for select to authenticated
  using (public.is_place_manager(place_id) or sender_id = auth.uid());
create policy "demandes: suivi" on public.business_inquiries for update to authenticated
  using (public.is_place_manager(place_id)) with check (public.is_place_manager(place_id));

create policy "parcours: lecture" on public.tourism_routes for select to anon, authenticated
  using (status = 'published' or public.has_permission('places.edit_any'));
create policy "parcours: gestion" on public.tourism_routes for all to authenticated
  using (public.has_permission('places.edit_any')) with check (public.has_permission('places.edit_any'));
create policy "étapes: lecture" on public.tourism_route_stops for select to anon, authenticated
  using (exists (select 1 from public.tourism_routes r where r.id = route_id and (r.status = 'published' or public.has_permission('places.edit_any'))));
create policy "étapes: gestion" on public.tourism_route_stops for all to authenticated
  using (public.has_permission('places.edit_any')) with check (public.has_permission('places.edit_any'));
create policy "contenus touristiques: lecture" on public.tourism_content for select to anon, authenticated
  using (status = 'published' or public.has_permission('places.edit_any'));
create policy "contenus touristiques: gestion" on public.tourism_content for all to authenticated
  using (public.has_permission('places.edit_any')) with check (public.has_permission('places.edit_any'));

create policy "notifications: propriétaire" on public.notifications for select to authenticated using (user_id = auth.uid());
create policy "notifications: marquer comme lue" on public.notifications for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ------------------------------------------------------------------ stockage
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('place-media', 'place-media', true, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('claim-evidence', 'claim-evidence', false, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do nothing;

-- place-media : chemins « submissions/<uid>/… » (photos de collecte) et « places/<place_id>/… ».
create policy "place-media: dépôt collecte" on storage.objects for insert to authenticated
  with check (bucket_id = 'place-media' and (storage.foldername(name))[1] = 'submissions'
    and (storage.foldername(name))[2] = (select auth.uid())::text and public.has_permission('submissions.create'));
create policy "place-media: dépôt gestionnaire" on storage.objects for insert to authenticated
  with check (bucket_id = 'place-media' and (storage.foldername(name))[1] = 'places'
    and public.can_edit_place(((storage.foldername(name))[2])::uuid));
create policy "place-media: suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'place-media' and (
    ((storage.foldername(name))[1] = 'submissions' and (storage.foldername(name))[2] = (select auth.uid())::text)
    or ((storage.foldername(name))[1] = 'places' and public.can_edit_place(((storage.foldername(name))[2])::uuid))
    or public.has_permission('media.moderate')));

-- claim-evidence : privé, « <uid>/… » ; lisible par le demandeur et les examinateurs.
create policy "claim-evidence: dépôt" on storage.objects for insert to authenticated
  with check (bucket_id = 'claim-evidence' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "claim-evidence: lecture" on storage.objects for select to authenticated
  using (bucket_id = 'claim-evidence' and ((storage.foldername(name))[1] = (select auth.uid())::text or public.has_permission('claims.review')));

-- ------------------------------------------------------------------ données
insert into public.application_settings (key, value, description, is_public) values
  ('app.name', '"Boyoma Connect"', 'Nom de l''application', true),
  ('app.tagline', '"Votre ville. Vos adresses. Votre chemin."', 'Slogan', true),
  ('app.support_email', 'null', 'Adresse de support (à renseigner avant la production)', true),
  ('app.support_phone', 'null', 'Téléphone de support (à renseigner avant la production)', true),
  ('app.default_city_slug', '"kisangani"', 'Ville affichée par défaut', true),
  ('app.currencies', '["USD", "CDF"]', 'Devises acceptées', true),
  ('app.timezone', '"Africa/Lubumbashi"', 'Fuseau horaire de référence', true),
  ('features.reviews_enabled', 'true', 'Avis activés', true),
  ('features.owner_review_responses', 'false', 'Réponses des gestionnaires aux avis', true),
  ('features.tourism_enabled', 'true', 'Module Boyoma Explore', true),
  ('media.max_image_bytes', '5242880', 'Taille maximale d''une image (octets)', true),
  ('media.max_gallery_free', '3', 'Photos de galerie — plan gratuit', true),
  ('moderation.reviews_require_approval', 'true', 'Les avis sont publiés après modération', false),
  ('billing.simulated_payments_enabled', 'false', 'Paiements simulés (DÉVELOPPEMENT UNIQUEMENT)', false),
  ('maps.style_url', '"https://tiles.openfreemap.org/styles/liberty"', 'Style MapLibre par défaut (surchargé par NEXT_PUBLIC_MAP_STYLE_URL)', true),
  ('legal.terms_version', '"brouillon"', 'Version des conditions d''utilisation', true),
  ('legal.privacy_version', '"brouillon"', 'Version de la politique de confidentialité', true);

insert into public.plans (key, name, description, price_monthly, currency, sort_order) values
  ('free', 'Gratuit', 'Référencement de base, contacts, localisation et informations essentielles.', 0, 'USD', 1),
  ('business', 'Business', 'Fiche enrichie, galerie étendue, catalogue, statistiques et outils professionnels.', 3, 'USD', 2),
  ('premium', 'Premium', 'Business + promotions, statistiques enrichies, prestations avancées, demandes de réservation.', 10, 'USD', 3),
  ('sponsor', 'Sponsor', 'Premium + campagnes sponsorisées, emplacements promotionnels et rapports de campagne.', 25, 'USD', 4);

insert into public.plan_features (plan_id, feature_key, value, label)
select p.id, f.feature_key, f.value::jsonb, f.label
from public.plans p
join (values
  ('free', 'listing', 'true', 'Référencement de base'),
  ('free', 'gallery_photos', '3', 'Photos de galerie'),
  ('business', 'listing', 'true', 'Référencement de base'),
  ('business', 'gallery_photos', '15', 'Photos de galerie'),
  ('business', 'catalog', 'true', 'Catalogue produits et services'),
  ('business', 'statistics', 'true', 'Statistiques'),
  ('premium', 'listing', 'true', 'Référencement de base'),
  ('premium', 'gallery_photos', '30', 'Photos de galerie'),
  ('premium', 'catalog', 'true', 'Catalogue produits et services'),
  ('premium', 'statistics', 'true', 'Statistiques'),
  ('premium', 'statistics_advanced', 'true', 'Statistiques enrichies'),
  ('premium', 'promotions', 'true', 'Promotions'),
  ('premium', 'reservations', 'true', 'Demandes de réservation'),
  ('sponsor', 'listing', 'true', 'Référencement de base'),
  ('sponsor', 'gallery_photos', '50', 'Photos de galerie'),
  ('sponsor', 'catalog', 'true', 'Catalogue produits et services'),
  ('sponsor', 'statistics', 'true', 'Statistiques'),
  ('sponsor', 'statistics_advanced', 'true', 'Statistiques enrichies'),
  ('sponsor', 'promotions', 'true', 'Promotions'),
  ('sponsor', 'reservations', 'true', 'Demandes de réservation'),
  ('sponsor', 'sponsored_campaigns', 'true', 'Campagnes sponsorisées'),
  ('sponsor', 'campaign_reports', 'true', 'Rapports de campagne')
) as f(plan_key, feature_key, value, label) on f.plan_key = p.key;
