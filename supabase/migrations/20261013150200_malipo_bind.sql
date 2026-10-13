-- =============================================================================
-- BOYOMA CONNECT — Malipo : rattachement tardif d'une transaction (décision D33)
-- Si la réponse de création n'a jamais atteint le serveur (coupure réseau), un webhook SIGNÉ
-- dont les métadonnées portent notre identifiant de paiement permet de rattacher la transaction.
-- Uniquement pour une tentative sans identifiant Malipo, et seulement par le serveur.
-- =============================================================================
create or replace function public.malipo_bind_charge(p_payment_id uuid, p_charge_id text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row uuid;
begin
  if coalesce(btrim(p_charge_id), '') = '' then
    return false;
  end if;
  if exists (select 1 from public.malipo_charges where charge_id = p_charge_id) then
    return false;
  end if;
  update public.malipo_charges set charge_id = p_charge_id, sync_error = null
  where payment_id = p_payment_id and charge_id is null
  returning id into v_row;
  if v_row is null then
    return false;
  end if;
  perform public.write_audit_log('payment.malipo_bound', 'payment', p_payment_id::text,
    jsonb_build_object('charge', p_charge_id));
  return true;
end;
$$;
revoke execute on function public.malipo_bind_charge(uuid, text) from public, anon, authenticated;
grant execute on function public.malipo_bind_charge(uuid, text) to service_role;
