-- =============================================================================
-- BOYOMA CONNECT — Malipo (2/2) : encaissement Mobile Money (décision D33)
--
-- Principes :
--  * le montant vient toujours de la facture (serveur), jamais du navigateur ;
--  * une tentative = un paiement `payments` (fournisseur malipo) + une ligne `malipo_charges` ;
--  * seul le serveur (clé secrète Supabase, rôle service_role) écrit : création, état, webhooks ;
--  * l'abonnement n'est activé que par un état « succeeded » reçu de Malipo (webhook signé ou
--    lecture de l'API), jamais par le navigateur ; un état terminal n'est jamais rétrogradé ;
--  * montant, devise et référence sont contrôlés : en cas d'écart, rien n'est activé.
-- =============================================================================

-- ------------------------------------------------------------ tentatives Malipo
create table public.malipo_charges (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null unique references public.payments (id) on delete restrict,
  invoice_id uuid not null references public.invoices (id) on delete restrict,
  place_id uuid not null references public.places (id) on delete restrict,
  initiated_by uuid references auth.users (id) on delete set null,
  environment text not null check (environment in ('sandbox', 'live')),
  charge_id text unique check (charge_id is null or char_length(charge_id) between 3 and 128),
  idempotency_key text not null unique check (char_length(idempotency_key) between 16 and 128),
  network text not null check (network in ('VODACOM_MPESA', 'ORANGE_MONEY', 'AIRTEL_MONEY')),
  phone text not null check (phone ~ '^\+243[89][0-9]{8}$'),
  phone_masked text not null,
  amount numeric(10, 2) not null check (amount > 0),          -- montant facturé (unités usuelles)
  currency char(3) not null check (currency in ('USD', 'CDF')),
  api_amount bigint not null check (api_amount > 0),          -- montant envoyé à l'API
  api_amount_unit text not null check (api_amount_unit in ('minor', 'major')),
  status text not null default 'initiating' check (status in (
    'initiating', 'pending', 'processing', 'succeeded', 'failed', 'declined', 'expired',
    'refunded', 'partially_refunded', 'error')),
  failure_reason text check (failure_reason is null or char_length(failure_reason) <= 300),
  error_code text check (error_code is null or char_length(error_code) <= 80),
  fee_amount bigint,                                          -- frais communiqués par Malipo (unités API)
  net_amount bigint,                                          -- net communiqué par Malipo (unités API)
  anomaly text check (anomaly is null or char_length(anomaly) <= 300),
  succeeded_at timestamptz,
  last_synced_at timestamptz,
  sync_error text check (sync_error is null or char_length(sync_error) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index malipo_charges_status_idx on public.malipo_charges (status, created_at desc);
create index malipo_charges_place_idx on public.malipo_charges (place_id, created_at desc);
create index malipo_charges_invoice_idx on public.malipo_charges (invoice_id, created_at desc);
create index malipo_charges_user_idx on public.malipo_charges (initiated_by, created_at desc);
create trigger malipo_charges_updated_at before update on public.malipo_charges
  for each row execute function public.set_updated_at();

alter table public.malipo_charges enable row level security;
-- Lecture : gestionnaires de la fiche et équipe facturation. Aucune écriture hors fonctions serveur.
create policy "malipo: lecture" on public.malipo_charges for select
  using (public.is_place_manager(place_id) or public.has_permission('billing.read'));

-- Source de confirmation : lecture directe de l'API du fournisseur (rapprochement).
alter table public.payments drop constraint if exists payments_confirmation_source_check;
alter table public.payments add constraint payments_confirmation_source_check
  check (confirmation_source in ('webhook', 'manual_review', 'simulated', 'provider_api'));

-- Paramètres : estimation des frais (affichage administrateur uniquement, jamais ajoutée au prix).
insert into public.application_settings (key, value, description, is_public)
values ('billing.malipo_fee_estimate_percent', '3.5'::jsonb,
  'Estimation des frais Malipo (%) pour les rapports internes uniquement. Jamais ajoutée au prix payé. Les frais réels sont ceux communiqués par Malipo.',
  false)
on conflict (key) do nothing;

-- ------------------------------------------------------------ ordre des états
create or replace function public.malipo_status_rank(p_status text)
returns integer
language sql
immutable
set search_path = ''
as $$
  select case p_status
    when 'initiating' then 0 when 'pending' then 1 when 'processing' then 2
    when 'succeeded' then 3 when 'failed' then 3 when 'declined' then 3 when 'expired' then 3 when 'error' then 3
    when 'partially_refunded' then 4 when 'refunded' then 5 else -1 end;
$$;

-- ------------------------------------------------------------ initialisation
-- Vérifie le gestionnaire, le plan et le tarif ; réutilise la facture en attente ; renvoie la
-- tentative en cours (double clic, rechargement) au lieu d'en créer une seconde.
create or replace function public.malipo_begin_checkout(
  p_user uuid, p_place_id uuid, p_plan_key text, p_network text, p_phone text, p_phone_masked text,
  p_environment text, p_amount_unit text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_plan public.plans%rowtype;
  v_sub public.subscriptions%rowtype;
  v_inv public.invoices%rowtype;
  v_ch public.malipo_charges%rowtype;
  v_pay uuid;
  v_key text;
  v_api bigint;
begin
  if p_user is null or not exists (select 1 from public.place_owners where place_id = p_place_id and user_id = p_user) then
    raise exception 'Vous ne gérez pas cet établissement' using errcode = '42501';
  end if;
  if p_network not in ('VODACOM_MPESA', 'ORANGE_MONEY', 'AIRTEL_MONEY') then
    raise exception 'Réseau Mobile Money invalide' using errcode = '22023';
  end if;
  if p_phone is null or p_phone !~ '^\+243[89][0-9]{8}$' then
    raise exception 'Numéro de téléphone invalide' using errcode = '22023';
  end if;
  if p_environment not in ('sandbox', 'live') or p_amount_unit not in ('minor', 'major') then
    raise exception 'Configuration de paiement invalide' using errcode = '22023';
  end if;

  select * into v_plan from public.plans where key = p_plan_key and is_active and is_public;
  if not found then
    raise exception 'Plan introuvable' using errcode = 'P0002';
  end if;
  if v_plan.price_monthly <= 0 then
    raise exception 'Le plan gratuit ne nécessite pas de paiement' using errcode = '22023';
  end if;
  if p_environment = 'live' and v_plan.currency <> 'USD' then
    raise exception 'Encaissement réel en USD uniquement : aucun taux de conversion configuré' using errcode = '22023';
  end if;

  -- Une seule initialisation à la fois par établissement.
  perform 1 from public.places where id = p_place_id for update;

  select * into v_sub from public.subscriptions
  where place_id = p_place_id and status in ('pending_payment', 'trialing', 'active', 'past_due')
  order by created_at desc limit 1;
  if found and v_sub.status <> 'pending_payment' then
    raise exception 'Un abonnement est déjà en cours pour cet établissement' using errcode = 'P0001';
  end if;
  if found and v_sub.plan_id <> v_plan.id then
    raise exception 'Une demande pour un autre plan est en cours : annulez-la d''abord' using errcode = 'P0001';
  end if;
  if not found then
    insert into public.subscriptions (place_id, plan_id, status, created_by)
    values (p_place_id, v_plan.id, 'pending_payment', p_user) returning * into v_sub;
    insert into public.invoices (subscription_id, place_id, description, amount, currency, due_at)
    values (v_sub.id, p_place_id, 'Abonnement ' || v_plan.name || ' — 1 mois', v_plan.price_monthly, v_plan.currency,
      now() + interval '7 days');
  end if;

  select * into v_inv from public.invoices
  where subscription_id = v_sub.id and status = 'open' order by created_at desc limit 1;
  if not found then
    raise exception 'Aucune facture à régler' using errcode = 'P0002';
  end if;
  if p_environment = 'live' and v_inv.currency <> 'USD' then
    raise exception 'Encaissement réel en USD uniquement : aucun taux de conversion configuré' using errcode = '22023';
  end if;

  -- Tentative déjà en cours : on la renvoie (aucun second débit).
  select * into v_ch from public.malipo_charges
  where invoice_id = v_inv.id and status in ('initiating', 'pending', 'processing')
    and created_at > now() - interval '30 minutes'
  order by created_at desc limit 1;
  if found then
    return jsonb_build_object('existing', true, 'row_id', v_ch.id, 'payment_id', v_ch.payment_id,
      'invoice_id', v_ch.invoice_id, 'charge_id', v_ch.charge_id, 'status', v_ch.status,
      'idempotency_key', v_ch.idempotency_key, 'amount', v_ch.amount, 'currency', v_ch.currency,
      'api_amount', v_ch.api_amount, 'network', v_ch.network, 'phone', v_ch.phone, 'phone_masked', v_ch.phone_masked,
      'invoice_number', v_inv.number, 'description', v_inv.description);
  end if;

  -- Montant API : unité configurée (par défaut la plus petite unité de la devise).
  if p_amount_unit = 'minor' then
    v_api := (v_inv.amount * 100)::bigint;
  else
    if v_inv.amount <> trunc(v_inv.amount) then
      raise exception 'Montant non entier incompatible avec l''unité configurée' using errcode = '22023';
    end if;
    v_api := v_inv.amount::bigint;
  end if;

  v_key := gen_random_uuid()::text;
  insert into public.payments (invoice_id, provider, idempotency_key, amount, currency, created_by)
  values (v_inv.id, 'malipo', v_key, v_inv.amount, v_inv.currency, p_user)
  returning id into v_pay;
  insert into public.malipo_charges (payment_id, invoice_id, place_id, initiated_by, environment, idempotency_key,
    network, phone, phone_masked, amount, currency, api_amount, api_amount_unit)
  values (v_pay, v_inv.id, p_place_id, p_user, p_environment, v_key, p_network, p_phone, p_phone_masked,
    v_inv.amount, v_inv.currency, v_api, p_amount_unit)
  returning * into v_ch;

  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details)
  values (p_user, 'payment.malipo_initiated', 'payment', v_pay::text,
    jsonb_build_object('invoice', v_inv.number, 'amount', v_inv.amount, 'currency', v_inv.currency,
      'network', p_network, 'environment', p_environment));

  return jsonb_build_object('existing', false, 'row_id', v_ch.id, 'payment_id', v_pay, 'invoice_id', v_inv.id,
    'charge_id', null, 'status', v_ch.status, 'idempotency_key', v_key, 'amount', v_ch.amount,
    'currency', v_ch.currency, 'api_amount', v_api, 'network', p_network, 'phone', p_phone,
    'phone_masked', p_phone_masked, 'invoice_number', v_inv.number, 'description', v_inv.description);
end;
$$;

-- ------------------------------------------------------------ transitions d'état
-- Cœur du rapprochement : appliqué pour la réponse de création, les webhooks signés et les
-- lectures de l'API. Atomique (verrou de ligne), idempotent, sans rétrogradation.
create or replace function public.malipo_apply_charge_state(
  p_charge_id text, p_status text, p_amount bigint, p_currency text, p_failure text,
  p_fee bigint, p_net bigint, p_meta_payment text, p_source text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ch public.malipo_charges%rowtype;
  v_pay public.payments%rowtype;
  v_inv public.invoices%rowtype;
  v_old text;
  v_allowed boolean;
  v_reason text;
begin
  if p_source not in ('create', 'webhook', 'api') then
    raise exception 'Source invalide' using errcode = '22023';
  end if;
  select * into v_ch from public.malipo_charges where charge_id = p_charge_id for update;
  if not found then
    return jsonb_build_object('result', 'unknown_charge');
  end if;
  if public.malipo_status_rank(p_status) < 0 or p_status in ('initiating', 'error') then
    update public.malipo_charges set last_synced_at = now(), sync_error = left('Statut inconnu : ' || coalesce(p_status, '∅'), 300)
    where id = v_ch.id;
    return jsonb_build_object('result', 'unknown_status', 'status', v_ch.status);
  end if;

  -- Intégrité : montant, devise et référence locale doivent correspondre exactement.
  if (p_amount is not null and p_amount <> v_ch.api_amount)
     or (p_currency is not null and upper(p_currency) <> v_ch.currency)
     or (p_meta_payment is not null and p_meta_payment <> v_ch.payment_id::text) then
    update public.malipo_charges
    set anomaly = left(format('Écart détecté (%s) : montant %s %s / attendu %s %s', p_source,
          coalesce(p_amount::text, '?'), coalesce(upper(p_currency), '?'), v_ch.api_amount, v_ch.currency), 300),
        last_synced_at = now()
    where id = v_ch.id;
    perform public.write_audit_log('payment.malipo_mismatch', 'payment', v_ch.payment_id::text,
      jsonb_build_object('charge', p_charge_id, 'status', p_status, 'amount', p_amount, 'currency', p_currency,
        'expected_amount', v_ch.api_amount, 'expected_currency', v_ch.currency, 'source', p_source));
    return jsonb_build_object('result', 'mismatch', 'status', v_ch.status);
  end if;

  v_old := v_ch.status;
  if p_status = v_old then
    update public.malipo_charges set last_synced_at = now(), sync_error = null,
      fee_amount = coalesce(p_fee, fee_amount), net_amount = coalesce(p_net, net_amount)
    where id = v_ch.id;
    return jsonb_build_object('result', 'unchanged', 'status', v_old);
  end if;

  v_allowed := case
    when v_old in ('initiating', 'pending', 'processing') then public.malipo_status_rank(p_status) > public.malipo_status_rank(v_old)
    when v_old = 'succeeded' then p_status in ('refunded', 'partially_refunded')
    when v_old = 'partially_refunded' then p_status = 'refunded'
    -- Échec puis succès : accepté seulement depuis la lecture canonique de l'API (argent effectivement reçu).
    when v_old in ('failed', 'declined', 'expired', 'error') then p_status = 'succeeded' and p_source = 'api'
    else false end;
  if not v_allowed then
    update public.malipo_charges set last_synced_at = now() where id = v_ch.id;
    return jsonb_build_object('result', 'stale', 'status', v_old);
  end if;

  update public.malipo_charges
  set status = p_status,
      failure_reason = case when p_status in ('failed', 'declined', 'expired') then left(coalesce(p_failure, p_status), 300) else failure_reason end,
      fee_amount = coalesce(p_fee, fee_amount), net_amount = coalesce(p_net, net_amount),
      succeeded_at = case when p_status = 'succeeded' then coalesce(succeeded_at, now()) else succeeded_at end,
      last_synced_at = now(), sync_error = null
  where id = v_ch.id;

  select * into v_pay from public.payments where id = v_ch.payment_id for update;

  if p_status = 'succeeded' then
    if v_pay.status = 'failed' then
      update public.payments set status = 'pending', failure_reason = null where id = v_pay.id;
      v_pay.status := 'pending';
    end if;
    if v_pay.status = 'pending' then
      perform public.apply_payment_confirmation(v_pay.id, case when p_source = 'api' then 'provider_api' else 'webhook' end,
        p_charge_id, null);
    elsif v_pay.status <> 'confirmed' then
      -- Argent reçu alors que la demande avait été annulée : à régulariser par l'équipe.
      update public.malipo_charges set anomaly = 'Paiement reçu alors que la demande était ' || v_pay.status || ' : à régulariser'
      where id = v_ch.id;
      perform public.write_audit_log('payment.malipo_paid_after_close', 'payment', v_pay.id::text,
        jsonb_build_object('charge', p_charge_id, 'payment_status', v_pay.status));
    end if;
  elsif p_status in ('failed', 'declined', 'expired') then
    if v_pay.status = 'pending' then
      v_reason := left(coalesce(p_failure, p_status), 300);
      update public.payments set status = 'failed', failure_reason = v_reason, provider_reference = p_charge_id where id = v_pay.id;
      perform public.notify_place_managers(v_ch.place_id, 'billing', 'Paiement Mobile Money non abouti',
        'Le paiement n''a pas été validé. Vous pouvez réessayer depuis la page Abonnement.',
        '/espace-pro/lieux/' || v_ch.place_id || '/abonnement');
    end if;
  elsif p_status = 'refunded' then
    if v_pay.status = 'confirmed' then
      update public.payments set status = 'refunded' where id = v_pay.id;
      select * into v_inv from public.invoices where id = v_pay.invoice_id;
      if v_inv.subscription_id is not null then
        update public.subscriptions set status = 'cancelled', cancelled_at = now()
        where id = v_inv.subscription_id and status in ('active', 'trialing', 'past_due');
      end if;
      perform public.notify_place_managers(v_ch.place_id, 'billing', 'Paiement remboursé',
        'Le paiement Mobile Money a été remboursé ; l''abonnement correspondant est arrêté.',
        '/espace-pro/lieux/' || v_ch.place_id || '/abonnement');
    end if;
  end if;

  perform public.write_audit_log('payment.malipo_' || p_status, 'payment', v_ch.payment_id::text,
    jsonb_build_object('charge', p_charge_id, 'from', v_old, 'source', p_source));
  return jsonb_build_object('result', 'applied', 'status', p_status, 'from', v_old);
end;
$$;

-- Réponse de l'API à la création : rattache l'identifiant Malipo, ou enregistre le refus.
create or replace function public.malipo_record_creation(
  p_row_id uuid, p_charge_id text, p_status text, p_amount bigint, p_currency text, p_failure text,
  p_error_code text, p_error_message text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ch public.malipo_charges%rowtype;
begin
  select * into v_ch from public.malipo_charges where id = p_row_id for update;
  if not found then
    raise exception 'Tentative introuvable' using errcode = 'P0002';
  end if;
  if p_charge_id is null then
    if p_error_code is not null and v_ch.charge_id is null and v_ch.status = 'initiating' then
      -- Refus définitif de la requête (validation, clé…) : aucune transaction n'existe chez Malipo.
      update public.malipo_charges set status = 'error', error_code = left(p_error_code, 80),
        failure_reason = left(coalesce(p_error_message, p_error_code), 300), last_synced_at = now()
      where id = v_ch.id;
      update public.payments set status = 'failed', failure_reason = left(coalesce(p_error_message, p_error_code), 300)
      where id = v_ch.payment_id and status = 'pending';
      return jsonb_build_object('result', 'error', 'status', 'error');
    end if;
    -- Incident réseau / serveur : état inconnu, conservé « initiating » pour rapprochement.
    update public.malipo_charges set sync_error = left(coalesce(p_error_message, 'Réponse indisponible'), 300),
      last_synced_at = now()
    where id = v_ch.id;
    return jsonb_build_object('result', 'unknown', 'status', v_ch.status);
  end if;
  if v_ch.charge_id is not null and v_ch.charge_id <> p_charge_id then
    raise exception 'Identifiant Malipo différent pour la même tentative' using errcode = 'P0001';
  end if;
  update public.malipo_charges set charge_id = p_charge_id, error_code = null, sync_error = null where id = v_ch.id;
  return public.malipo_apply_charge_state(p_charge_id, p_status, p_amount, p_currency, p_failure, null, null, null, 'create');
end;
$$;

-- ------------------------------------------------------------ webhooks
-- Journal des événements signés : dédoublonnage par identifiant d'événement.
create or replace function public.malipo_store_event(p_event_id text, p_type text, p_payload jsonb, p_charge_id text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id bigint;
  v_processed timestamptz;
  v_payment uuid;
begin
  if coalesce(btrim(p_event_id), '') = '' or char_length(p_event_id) > 128 then
    raise exception 'Identifiant d''événement invalide' using errcode = '22023';
  end if;
  select payment_id into v_payment from public.malipo_charges where charge_id = p_charge_id;
  insert into public.payment_events (provider, event_id, payment_id, event_type, signature_valid, payload)
  values ('malipo', p_event_id, v_payment, left(p_type, 80), true, p_payload)
  on conflict (provider, event_id) do nothing
  returning id into v_id;
  if v_id is not null then
    return jsonb_build_object('id', v_id, 'duplicate', false, 'processed', false);
  end if;
  select id, processed_at into v_id, v_processed from public.payment_events
  where provider = 'malipo' and event_id = p_event_id;
  return jsonb_build_object('id', v_id, 'duplicate', true, 'processed', v_processed is not null);
end;
$$;

create or replace function public.malipo_finish_event(p_id bigint, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.payment_events
  set processed_at = case when p_error is null then now() end, processing_error = left(p_error, 500)
  where id = p_id and provider = 'malipo';
$$;

-- ------------------------------------------------------------ rapprochement
create or replace function public.malipo_reconcile_candidates(p_limit integer default 50)
returns setof public.malipo_charges
language sql
stable
security definer
set search_path = ''
as $$
  select * from public.malipo_charges
  where status in ('initiating', 'pending', 'processing')
    and created_at < now() - interval '1 minute' and created_at > now() - interval '7 days'
    and (last_synced_at is null or last_synced_at < now() - interval '1 minute')
  order by created_at
  limit least(greatest(coalesce(p_limit, 50), 1), 200);
$$;

create or replace function public.malipo_mark_sync_error(p_row_id uuid, p_error text)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.malipo_charges set last_synced_at = now(), sync_error = left(p_error, 300) where id = p_row_id;
$$;

-- ------------------------------------------------------------ annulation protégée
-- Une demande ne peut pas être annulée pendant qu'un paiement Mobile Money est en cours de validation.
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
  if exists (
    select 1 from public.malipo_charges c join public.invoices i on i.id = c.invoice_id
    where i.subscription_id = p_subscription_id and c.status in ('initiating', 'pending', 'processing')
      and c.created_at > now() - interval '30 minutes'
  ) then
    raise exception 'Un paiement Mobile Money est en cours de validation : attendez son résultat' using errcode = 'P0001';
  end if;
  update public.subscriptions set status = 'cancelled', cancelled_at = now() where id = p_subscription_id;
  update public.invoices set status = 'void' where subscription_id = p_subscription_id and status = 'open';
  update public.payments set status = 'cancelled', updated_at = now()
  where status = 'pending' and invoice_id in (select id from public.invoices where subscription_id = p_subscription_id);
  perform public.write_audit_log('subscription.cancelled', 'subscription', p_subscription_id::text, '{}'::jsonb);
end;
$$;

-- ------------------------------------------------------------ droits
revoke execute on function
  public.malipo_begin_checkout(uuid, uuid, text, text, text, text, text, text),
  public.malipo_apply_charge_state(text, text, bigint, text, text, bigint, bigint, text, text),
  public.malipo_record_creation(uuid, text, text, bigint, text, text, text, text),
  public.malipo_store_event(text, text, jsonb, text),
  public.malipo_finish_event(bigint, text),
  public.malipo_reconcile_candidates(integer),
  public.malipo_mark_sync_error(uuid, text)
from public, anon, authenticated;
grant execute on function
  public.malipo_begin_checkout(uuid, uuid, text, text, text, text, text, text),
  public.malipo_apply_charge_state(text, text, bigint, text, text, bigint, bigint, text, text),
  public.malipo_record_creation(uuid, text, text, bigint, text, text, text, text),
  public.malipo_store_event(text, text, jsonb, text),
  public.malipo_finish_event(bigint, text),
  public.malipo_reconcile_candidates(integer),
  public.malipo_mark_sync_error(uuid, text)
to service_role;
grant select, insert, update on public.malipo_charges to service_role;
