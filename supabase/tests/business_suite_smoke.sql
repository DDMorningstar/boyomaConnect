-- Test de fumée de l'espace pro (D32). NON DESTRUCTIF : se termine toujours par l'exception
-- « BUSINESS_TEST_OK … » qui annule toute la transaction. Données de test préfixées [FICTIF].
do $$
declare
  v_owner uuid; v_place uuid; v_stats jsonb; v_inq uuid; v_n int; v_promo uuid; v_sub uuid; v_pay uuid;
  v_req uuid; v_inv uuid; v_err text; v_log text := '';
begin
  select po.user_id, po.place_id into v_owner, v_place from public.place_owners po
  join public.user_roles ur on ur.user_id = po.user_id and ur.role_key = 'super_admin' limit 1;
  if v_place is null then raise exception 'Précondition : un super_admin gestionnaire d''une fiche'; end if;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);

  -- 1. Statistiques
  v_stats := public.owner_place_stats(v_place, 30);
  if jsonb_array_length(v_stats -> 'series') <> 30 then raise exception 'ÉCHEC stats : %', v_stats -> 'days'; end if;
  begin perform public.owner_place_stats(v_place, 90); v_log := v_log || 'stats90=OUVERT ';
  exception when sqlstate 'P0004' then v_log := v_log || 'stats90=réservé '; end;

  -- 5. Demande d'un visiteur anonyme, limites, notification au gestionnaire
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  v_inq := public.send_business_inquiry(v_place, 'quote', null, '[FICTIF] Client', '+243 810 000 000', null, 'Bonjour, quel est votre tarif ?', repeat('a', 64));
  perform public.send_business_inquiry(v_place, 'contact', null, '[FICTIF] Client', '+243 810 000 000', null, 'Deuxième message test', repeat('a', 64));
  begin
    perform public.send_business_inquiry(v_place, 'contact', null, '[FICTIF] Client', '+243 810 000 000', null, 'Troisième message test', repeat('a', 64));
    raise exception 'ÉCHEC : limite par fiche non appliquée' using errcode = 'P0099';
  exception when sqlstate 'P0001' then v_log := v_log || 'limite_demandes=ok ';
  end;
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner, 'role', 'authenticated')::text, true);
  select count(*) into v_n from public.notifications where user_id = v_owner and kind = 'inquiry' and created_at > now() - interval '1 minute';
  if v_n < 2 then raise exception 'ÉCHEC notification demande'; end if;
  perform public.set_inquiry_status(v_inq, 'answered');

  -- 6 + 11. Offres réservées → plan offert (tracé) → offre soumise → modérée → visible
  begin perform public.submit_promotion(v_place, '[FICTIF] -10 %', null, now(), now() + interval '7 days');
    raise exception 'ÉCHEC : offre acceptée sans plan' using errcode = 'P0099';
  exception when sqlstate 'P0004' then v_log := v_log || 'offre_sans_plan=refusée ';
  end;
  v_sub := public.admin_grant_plan(v_place, 'premium', 1, '[FICTIF] test');
  if public.place_active_plan(v_place) <> 'premium' then raise exception 'ÉCHEC plan offert'; end if;
  v_promo := public.submit_promotion(v_place, '[FICTIF] -10 % ce week-end', 'Test', now() - interval '1 minute', now() + interval '7 days');
  select count(*) into v_n from public.active_promotions(null, v_place, 10);
  if v_n <> 0 then raise exception 'ÉCHEC : offre visible avant modération'; end if;
  perform public.moderate_promotion(v_promo, 'approve', null);
  select count(*) into v_n from public.active_promotions(null, v_place, 10);
  if v_n <> 1 then raise exception 'ÉCHEC : offre approuvée invisible'; end if;
  v_stats := public.owner_place_stats(v_place, 90);
  v_log := v_log || 'stats90_premium=ok ';

  -- 11. Paiement manuel : demande, référence, refus par l'équipe (pas d'auto-validation)
  update public.subscriptions set status = 'cancelled' where id = v_sub;
  select payment_id into v_pay from public.start_subscription_checkout(v_place, 'business', 'manual', '[FICTIF]-' || gen_random_uuid());
  perform public.submit_payment_reference(v_pay, 'MPESA-123456');
  begin perform public.confirm_manual_payment(v_pay, 'MPESA-123456', 'auto');
    raise exception 'ÉCHEC : auto-validation acceptée' using errcode = 'P0099';
  exception when insufficient_privilege then v_log := v_log || 'auto_validation=refusée ';
  end;
  perform public.reject_manual_payment(v_pay, '[FICTIF] référence introuvable');
  select subscription_id into v_sub from public.invoices i join public.payments p on p.invoice_id = i.id where p.id = v_pay;
  perform public.cancel_pending_subscription(v_sub);

  -- 9. Invitation (adresse sans compte) puis révocation
  v_inv := public.invite_place_member(v_place, 'fictif-invite@example.com');
  perform public.manage_place_member(v_place, v_inv, 'revoke_invitation');
  begin perform public.manage_place_member(v_place, v_owner, 'remove');
    raise exception 'ÉCHEC : propriétaire seul retiré' using errcode = 'P0099';
  exception when sqlstate 'P0001' then v_log := v_log || 'proprio_protégé=ok ';
  end;

  -- 10. Vérification : demande → visite réalisée → fiche vérifiée
  update public.places set verification_status = 'unverified' where id = v_place;
  v_req := public.request_place_verification(v_place, '+243 810 000 000', 'Matin', null);
  perform public.handle_verification_request(v_req, 'complete', current_date, '[FICTIF] visite');
  if (select verification_status from public.places where id = v_place) <> 'agent_verified' then
    raise exception 'ÉCHEC vérification';
  end if;

  -- 8. Notifications : lecture
  v_n := public.mark_notifications_read(null);
  raise exception 'BUSINESS_TEST_OK % notifications_lues=%', v_log, v_n;
end;
$$;
