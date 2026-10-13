-- =============================================================================
-- BOYOMA CONNECT — Malipo : montants en unité principale, frais décimaux (décision D33)
-- Constaté en Sandbox (13/10/2026) : « amount » est exprimé en unité principale (3 USD → 3,
-- 300 CDF → 300), les décimales sont acceptées (3.5) et les frais sont décimaux (0.11, 10.5).
-- Élargissement des types (aucune perte) et fonctions recréées avec des paramètres numeric.
-- =============================================================================
alter table public.malipo_charges
  alter column api_amount type numeric(12, 2),
  alter column fee_amount type numeric(14, 4),
  alter column net_amount type numeric(14, 4);

drop function public.malipo_apply_charge_state(text, text, bigint, text, text, bigint, bigint, text, text);
drop function public.malipo_record_creation(uuid, text, text, bigint, text, text, text, text);

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
  v_api numeric(12, 2);
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

  -- Montant API : unité principale (constaté en Sandbox : 3 USD → amount 3, décimales acceptées) ou plus petite unité.
  if p_amount_unit = 'minor' then
    v_api := v_inv.amount * 100;
  else
    v_api := v_inv.amount;
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

create or replace function public.malipo_apply_charge_state(
  p_charge_id text, p_status text, p_amount numeric, p_currency text, p_failure text,
  p_fee numeric, p_net numeric, p_meta_payment text, p_source text)
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

create or replace function public.malipo_record_creation(
  p_row_id uuid, p_charge_id text, p_status text, p_amount numeric, p_currency text, p_failure text,
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

revoke execute on function
  public.malipo_begin_checkout(uuid, uuid, text, text, text, text, text, text),
  public.malipo_apply_charge_state(text, text, numeric, text, text, numeric, numeric, text, text),
  public.malipo_record_creation(uuid, text, text, numeric, text, text, text, text)
from public, anon, authenticated;
grant execute on function
  public.malipo_begin_checkout(uuid, uuid, text, text, text, text, text, text),
  public.malipo_apply_charge_state(text, text, numeric, text, text, numeric, numeric, text, text),
  public.malipo_record_creation(uuid, text, text, numeric, text, text, text, text)
to service_role;
