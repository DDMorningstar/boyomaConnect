-- Test de la machine d'états Malipo (D33). Bloc DO terminé par une exception : tout est annulé.
-- À exécuter en tant que postgres. Utilise la première fiche ayant un propriétaire.
do $$
declare
  v_place uuid;
  v_owner uuid;
  v_other uuid := gen_random_uuid();
  r jsonb;
  r2 jsonb;
  v_row uuid;
  v_pay uuid;
  v_sub uuid;
  v_status text;
  v_out text := '';
  v_n integer;
begin
  select po.place_id, po.user_id into v_place, v_owner from public.place_owners po where po.role = 'owner' limit 1;
  if v_place is null then raise exception 'Aucune fiche avec propriétaire' using errcode = 'P0099'; end if;
  -- État de départ propre pour le test (annulé à la fin).
  update public.subscriptions set status = 'cancelled' where place_id = v_place and status in ('pending_payment', 'active', 'trialing', 'past_due');

  set local role service_role;

  -- 1. Non-gestionnaire refusé.
  begin
    perform public.malipo_begin_checkout(v_other, v_place, 'business', 'ORANGE_MONEY', '+243812345678', '+243 81•••••78', 'sandbox', 'minor');
    raise exception 'non-gestionnaire accepté' using errcode = 'P0099';
  exception when sqlstate '42501' then v_out := v_out || ' non_gestionnaire=refusé';
  end;

  -- 2. Numéro invalide refusé.
  begin
    perform public.malipo_begin_checkout(v_owner, v_place, 'business', 'ORANGE_MONEY', '+24371234567', 'x', 'sandbox', 'minor');
    raise exception 'numéro invalide accepté' using errcode = 'P0099';
  exception when sqlstate '22023' then v_out := v_out || ' numéro_invalide=refusé';
  end;

  -- 3. Initialisation : montant serveur (3.00 USD -> 300 unités mineures).
  r := public.malipo_begin_checkout(v_owner, v_place, 'business', 'ORANGE_MONEY', '+243812345678', '+243 81•••••78', 'sandbox', 'minor');
  v_row := (r ->> 'row_id')::uuid; v_pay := (r ->> 'payment_id')::uuid;
  if (r ->> 'api_amount')::bigint <> 300 or r ->> 'currency' <> 'USD' then
    raise exception 'montant inattendu %', r using errcode = 'P0099';
  end if;
  v_out := v_out || ' montant_api=' || (r ->> 'api_amount');

  -- 4. Double clic : même tentative renvoyée.
  r2 := public.malipo_begin_checkout(v_owner, v_place, 'business', 'ORANGE_MONEY', '+243812345678', '+243 81•••••78', 'sandbox', 'minor');
  if (r2 ->> 'existing')::boolean is not true or r2 ->> 'row_id' <> r ->> 'row_id' then
    raise exception 'double clic : seconde tentative créée' using errcode = 'P0099';
  end if;
  v_out := v_out || ' double_clic=même_tentative';

  -- 5. Autre plan pendant une demande : refusé.
  begin
    perform public.malipo_begin_checkout(v_owner, v_place, 'premium', 'ORANGE_MONEY', '+243812345678', 'x', 'sandbox', 'minor');
    raise exception 'autre plan accepté' using errcode = 'P0099';
  exception when sqlstate 'P0001' then v_out := v_out || ' autre_plan=refusé';
  end;

  -- 6. Réponse de création : pending.
  r := public.malipo_record_creation(v_row, 'ch_test_smoke_1', 'pending', 300, 'USD', null, null, null);
  if r ->> 'result' <> 'applied' then raise exception 'création %', r using errcode = 'P0099'; end if;

  -- 7. Annulation pendant la validation : refusée.
  reset role;
  select subscription_id into v_sub from public.invoices where id = (r2 ->> 'invoice_id')::uuid;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin
    perform public.cancel_pending_subscription(v_sub);
    raise exception 'annulation acceptée pendant validation' using errcode = 'P0099';
  exception when sqlstate 'P0001' then v_out := v_out || ' annulation_en_cours=refusée';
  end;
  -- Le gestionnaire ne peut pas appeler les fonctions serveur.
  begin
    perform public.malipo_apply_charge_state('ch_test_smoke_1', 'succeeded', 300, 'USD', null, null, null, null, 'api');
    raise exception 'fonction serveur accessible au client' using errcode = 'P0099';
  exception when insufficient_privilege then v_out := v_out || ' fonction_serveur=interdite_client';
  end;
  -- Lecture RLS : le gestionnaire voit sa tentative, pas d'écriture directe.
  if not exists (select 1 from public.malipo_charges where id = v_row) then
    raise exception 'gestionnaire ne voit pas sa tentative' using errcode = 'P0099';
  end if;
  begin
    update public.malipo_charges set status = 'succeeded' where id = v_row;
    get diagnostics v_n = row_count;
    if v_n > 0 then raise exception 'écriture directe acceptée' using errcode = 'P0099'; end if;
  exception when insufficient_privilege then null;
  end;
  v_out := v_out || ' écriture_directe=refusée';
  reset role;
  set local role service_role;

  -- 8. Écart de montant : rien n'est activé.
  r := public.malipo_apply_charge_state('ch_test_smoke_1', 'succeeded', 999, 'USD', null, null, null, null, 'webhook');
  if r ->> 'result' <> 'mismatch' then raise exception 'écart non détecté %', r using errcode = 'P0099'; end if;
  select status into v_status from public.subscriptions where id = v_sub;
  if v_status <> 'pending_payment' then raise exception 'activé malgré écart' using errcode = 'P0099'; end if;
  -- Écart de devise.
  r := public.malipo_apply_charge_state('ch_test_smoke_1', 'succeeded', 300, 'CDF', null, null, null, null, 'webhook');
  if r ->> 'result' <> 'mismatch' then raise exception 'écart devise non détecté' using errcode = 'P0099'; end if;
  v_out := v_out || ' écart_montant_devise=bloqué';

  -- 9. Succès signé : abonnement activé.
  r := public.malipo_apply_charge_state('ch_test_smoke_1', 'succeeded', 300, 'USD', null, 10, 290, v_pay::text, 'webhook');
  select status into v_status from public.subscriptions where id = v_sub;
  if r ->> 'result' <> 'applied' or v_status <> 'active' then raise exception 'succès non appliqué % %', r, v_status using errcode = 'P0099'; end if;
  select status::text into v_status from public.payments where id = v_pay;
  if v_status <> 'confirmed' then raise exception 'paiement non confirmé' using errcode = 'P0099'; end if;
  v_out := v_out || ' succès=abonnement_actif';

  -- 10. Doublon et événement ancien : sans effet.
  r := public.malipo_apply_charge_state('ch_test_smoke_1', 'succeeded', 300, 'USD', null, null, null, null, 'webhook');
  if r ->> 'result' <> 'unchanged' then raise exception 'doublon %', r using errcode = 'P0099'; end if;
  r := public.malipo_apply_charge_state('ch_test_smoke_1', 'pending', 300, 'USD', null, null, null, null, 'webhook');
  if r ->> 'result' <> 'stale' then raise exception 'rétrogradation %', r using errcode = 'P0099'; end if;
  r := public.malipo_apply_charge_state('ch_test_smoke_1', 'failed', 300, 'USD', 'timeout', null, null, null, 'webhook');
  if r ->> 'result' <> 'stale' then raise exception 'échec après succès accepté' using errcode = 'P0099'; end if;
  v_out := v_out || ' doublon=ignoré ancien=ignoré';

  -- 11. Journal d'événements dédoublonné.
  r := public.malipo_store_event('evt_test_smoke_1', 'charge.succeeded', '{"t":1}'::jsonb, 'ch_test_smoke_1');
  r2 := public.malipo_store_event('evt_test_smoke_1', 'charge.succeeded', '{"t":1}'::jsonb, 'ch_test_smoke_1');
  if (r ->> 'duplicate')::boolean or not (r2 ->> 'duplicate')::boolean then raise exception 'dédoublonnage' using errcode = 'P0099'; end if;
  perform public.malipo_finish_event((r ->> 'id')::bigint, null);
  r2 := public.malipo_store_event('evt_test_smoke_1', 'charge.succeeded', '{"t":1}'::jsonb, 'ch_test_smoke_1');
  if not (r2 ->> 'processed')::boolean then raise exception 'événement non marqué traité' using errcode = 'P0099'; end if;
  v_out := v_out || ' événement_dupliqué=détecté';

  -- 12. Remboursement : abonnement arrêté.
  r := public.malipo_apply_charge_state('ch_test_smoke_1', 'refunded', 300, 'USD', null, null, null, null, 'webhook');
  select status into v_status from public.subscriptions where id = v_sub;
  if v_status <> 'cancelled' then raise exception 'remboursement sans arrêt' using errcode = 'P0099'; end if;
  v_out := v_out || ' remboursement=abonnement_arrêté';

  -- 13. Échec puis nouvelle tentative possible.
  r := public.malipo_begin_checkout(v_owner, v_place, 'business', 'AIRTEL_MONEY', '+243991234567', '+243 99•••••67', 'sandbox', 'minor');
  v_row := (r ->> 'row_id')::uuid;
  perform public.malipo_record_creation(v_row, 'ch_test_smoke_2', 'pending', 300, 'USD', null, null, null);
  r := public.malipo_apply_charge_state('ch_test_smoke_2', 'declined', 300, 'USD', 'declined', null, null, null, 'webhook');
  r2 := public.malipo_begin_checkout(v_owner, v_place, 'business', 'AIRTEL_MONEY', '+243991234567', '+243 99•••••67', 'sandbox', 'minor');
  if (r2 ->> 'existing')::boolean or r2 ->> 'row_id' = v_row::text then raise exception 'pas de nouvelle tentative' using errcode = 'P0099'; end if;
  v_out := v_out || ' refus_client=nouvelle_tentative_possible';
  -- Expiré (événement signé) puis succès signé : refusé (seule l'API canonique peut le faire).
  perform public.malipo_record_creation((r2 ->> 'row_id')::uuid, 'ch_test_smoke_3', 'pending', 300, 'USD', null, null, null);
  perform public.malipo_apply_charge_state('ch_test_smoke_3', 'expired', 300, 'USD', null, null, null, null, 'webhook');
  r := public.malipo_apply_charge_state('ch_test_smoke_3', 'succeeded', 300, 'USD', null, null, null, null, 'webhook');
  if r ->> 'result' <> 'stale' then raise exception 'succès après expiration via webhook' using errcode = 'P0099'; end if;
  r := public.malipo_apply_charge_state('ch_test_smoke_3', 'succeeded', 300, 'USD', null, null, null, null, 'api');
  if r ->> 'result' <> 'applied' then raise exception 'succès canonique refusé %', r using errcode = 'P0099'; end if;
  v_out := v_out || ' expiré_puis_succès=api_seulement';

  -- 14. Erreur de validation API : tentative close.
  update public.subscriptions set status = 'cancelled' where place_id = v_place and status <> 'cancelled';
  r := public.malipo_begin_checkout(v_owner, v_place, 'business', 'VODACOM_MPESA', '+243821234567', 'x', 'sandbox', 'minor');
  r2 := public.malipo_record_creation((r ->> 'row_id')::uuid, null, null, null, null, null, 'invalid_phone', 'Numéro invalide');
  if r2 ->> 'status' <> 'error' then raise exception 'erreur API %', r2 using errcode = 'P0099'; end if;
  v_out := v_out || ' erreur_api=close';

  -- 15. Live en CDF refusé ; plan inconnu refusé.
  begin
    perform public.malipo_begin_checkout(v_owner, v_place, 'inexistant', 'VODACOM_MPESA', '+243821234567', 'x', 'live', 'minor');
    raise exception 'plan inconnu accepté' using errcode = 'P0099';
  exception when sqlstate 'P0002' then v_out := v_out || ' plan_inconnu=refusé';
  end;

  -- 16. Charge inconnue.
  r := public.malipo_apply_charge_state('ch_inconnue', 'succeeded', 300, 'USD', null, null, null, null, 'webhook');
  if r ->> 'result' <> 'unknown_charge' then raise exception 'charge inconnue %', r using errcode = 'P0099'; end if;
  v_out := v_out || ' charge_inconnue=ignorée';

  raise exception 'MALIPO_TEST_OK%', v_out;
end;
$$;
