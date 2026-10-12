-- Test de fumée du module d'importation (décision D30).
-- NON DESTRUCTIF : tout le bloc se termine par une exception volontaire « IMPORT_TEST_OK … » ;
-- PostgreSQL annule alors la transaction entière (aucune donnée de test ne subsiste). Toute
-- autre exception signale un échec. Données de test préfixées [FICTIF].
do $$
declare
  v_admin uuid;
  v_zone uuid;
  v_batch uuid;
  v_cat uuid;
  v_hosp record;
  v_res jsonb;
  v_status text;
  v_count integer;
  v_denied boolean := false;
begin
  select ur.user_id into v_admin from public.user_roles ur where ur.role_key = 'super_admin' limit 1;
  select id into v_zone from public.geographic_units where slug = 'isangi' and type_key = 'territoire';
  select id into v_cat from public.categories where slug = 'pharmacies';
  -- Lieu existant importé d'OSM dans le territoire (doublon / actualisation).
  select p.id, p.name, p.latitude, p.longitude, r.external_id into v_hosp
  from public.places p join public.place_external_refs r on r.place_id = p.id and r.source = 'osm'
  where p.administrative_unit_id = v_zone and p.latitude is not null limit 1;
  if v_admin is null or v_zone is null or v_hosp.id is null then
    raise exception 'Préconditions absentes (super_admin, Isangi, lieu OSM)';
  end if;

  -- 1. Refus sans permission (utilisateur fictif).
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
  begin
    perform public.import_reserve_request('osm');
  exception when insufficient_privilege then v_denied := true;
  end;
  if not v_denied then raise exception 'ÉCHEC : appel accepté sans permission'; end if;

  -- 2. Administrateur : lot + éléments.
  perform set_config('request.jwt.claims', json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
  insert into public.import_batches (source_key, origin, zone_unit_id, license, attribution, publication_mode)
  values ('osm', 'upload', v_zone, 'ODbL-1.0', '© Contributeurs OpenStreetMap', 'review')
  returning id into v_batch;
  insert into public.import_items (batch_id, row_index, external_id, name, category_id, latitude, longitude,
    geographic_precision, phones, hours, issues) values
    (v_batch, 0, 'node/9900000001', '[FICTIF] Pharmacie test', v_cat, 0.35375, 24.0619, 'exact',
       array['+243 810 000 000'], '[{"day":1,"opens":"08:00","closes":"17:00"}]', '{}'),
    (v_batch, 1, 'node/9900000002', '[FICTIF] Hors zone', v_cat, 0.5153, 25.191, 'exact', '{}', '[]', '{}'),
    (v_batch, 2, 'node/9900000003', '[FICTIF] Sans catégorie', null, 0.36, 24.07, 'exact', '{}', '[]',
       array['unmapped_category']),
    (v_batch, 3, 'node/9900000004', v_hosp.name, v_cat, v_hosp.latitude, v_hosp.longitude, 'exact', '{}', '[]', '{}'),
    (v_batch, 4, v_hosp.external_id, v_hosp.name, null, v_hosp.latitude, v_hosp.longitude, 'approximate', '{}', '[]', '{}'),
    (v_batch, 5, 'node/9900000006', '[FICTIF] Pharmacie test', v_cat, 0.35376, 24.06191, 'exact', '{}', '[]', '{}');

  v_res := public.import_analyze_batch(v_batch);
  select string_agg(row_index || '=' || status, ' ' order by row_index) into v_status
  from public.import_items where batch_id = v_batch;
  if v_status <> '0=ready 1=rejected 2=quarantined 3=duplicate 4=existing 5=duplicate' then
    raise exception 'ÉCHEC analyse : %', v_status;
  end if;

  -- 3. Décision : catégorie corrigée puis acceptation de la fiche en quarantaine.
  perform public.import_decide_item(
    (select id from public.import_items where batch_id = v_batch and row_index = 2), 'accept', v_cat, 'test');

  -- 4. Import par tranches (1 élément par appel : reprise).
  v_res := public.import_commit_batch(v_batch, 1);
  if (v_res ->> 'remaining')::int <> 2 then raise exception 'ÉCHEC tranche 1 : %', v_res; end if;
  loop
    v_res := public.import_commit_batch(v_batch, 1);
    exit when (v_res ->> 'remaining')::int = 0;
  end loop;
  if v_res ->> 'status' <> 'completed' or (v_res ->> 'created')::int <> 2 then
    raise exception 'ÉCHEC import : %', v_res;
  end if;

  -- 5. Lieux créés : à valider, non vérifiés, provenance complète, contacts et horaires.
  select count(*) into v_count
  from public.import_items i
  join public.places p on p.id = i.place_id
  join public.place_external_refs r on r.place_id = p.id and r.batch_id = v_batch and r.collected_at is not null
  where i.batch_id = v_batch and i.status = 'imported'
    and p.publication_status = 'pending_review' and p.verification_status = 'unverified'
    and p.coordinates_source = 'imported' and p.administrative_unit_id is not null;
  if v_count <> 2 then raise exception 'ÉCHEC lieux créés : %', v_count; end if;
  if not exists (select 1 from public.place_contacts c join public.import_items i on i.place_id = c.place_id
                 where i.batch_id = v_batch and i.row_index = 0 and c.kind = 'phone')
     or not exists (select 1 from public.place_hours h join public.import_items i on i.place_id = h.place_id
                    where i.batch_id = v_batch and i.row_index = 0 and h.day_of_week = 1) then
    raise exception 'ÉCHEC contacts / horaires';
  end if;

  -- 6. Lot terminé : plus de décision possible, journal d'audit écrit.
  v_denied := false;
  begin
    perform public.import_decide_item((select id from public.import_items where batch_id = v_batch and row_index = 1), 'accept');
  exception when sqlstate 'P0001' then v_denied := true;
  end;
  if not v_denied then raise exception 'ÉCHEC : décision acceptée sur un lot terminé'; end if;
  if not exists (select 1 from public.audit_logs where entity_id = v_batch::text and action = 'import.completed') then
    raise exception 'ÉCHEC audit';
  end if;

  raise exception 'IMPORT_TEST_OK statuts=[%] import=%', v_status, v_res;
end;
$$;
