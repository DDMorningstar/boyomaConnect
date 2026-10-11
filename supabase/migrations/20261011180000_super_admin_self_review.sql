-- =============================================================================
-- BOYOMA CONNECT — 0013 : auto-validation réservée au super-administrateur (décision D24)
-- Tant que la plateforme n'a qu'un administrateur, le super-administrateur peut valider ses
-- propres soumissions et revendications. Chaque cas est marqué « self_review » dans audit_logs.
-- Les autres rôles (modérateur, admin) restent soumis à la séparation des tâches.
-- Corps identiques à la migration 0007, hormis le contrôle d'auto-validation et l'audit.
-- =============================================================================

create or replace function public.review_place_submission(
  p_submission_id uuid,
  p_decision text,                    -- 'approve' | 'reject' | 'needs_changes' | 'duplicate'
  p_notes text default null,
  p_duplicate_of uuid default null,
  p_publish boolean default true
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  s public.place_submissions%rowtype;
  v_place_id uuid;
  v_contact jsonb;
  v_path text;
  v_cat uuid;
  v_i integer := 0;
  v_self boolean;
begin
  if not public.has_permission('submissions.review') then
    raise exception 'Permission submissions.review requise' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject', 'needs_changes', 'duplicate') then
    raise exception 'Décision invalide' using errcode = '22023';
  end if;

  select * into s from public.place_submissions where id = p_submission_id for update;
  if not found then
    raise exception 'Soumission introuvable' using errcode = 'P0002';
  end if;
  if s.status <> 'pending' then
    raise exception 'Soumission déjà traitée (statut : %)', s.status using errcode = 'P0001';
  end if;
  v_self := s.submitted_by = auth.uid();
  if v_self and not public.has_role('super_admin') then
    raise exception 'Vous ne pouvez pas valider votre propre soumission' using errcode = '42501';
  end if;
  if p_decision in ('reject', 'needs_changes') and coalesce(btrim(p_notes), '') = '' then
    raise exception 'Un motif est obligatoire' using errcode = '22023';
  end if;

  perform set_config('boyoma.internal_write', 'on', true);

  if p_decision = 'approve' then
    if s.primary_category_id is null then
      raise exception 'Catégorie principale manquante' using errcode = '22023';
    end if;
    if s.administrative_unit_id is null and s.latitude is null then
      raise exception 'Commune ou position requise' using errcode = '22023';
    end if;

    insert into public.places (
      name, short_description, primary_category_id, administrative_unit_id, address_text,
      landmark_description, directions, latitude, longitude, gps_accuracy_m, coordinates_source,
      geographic_precision, verification_status, publication_status, created_by, last_verified_at
    ) values (
      btrim(s.name), s.short_description, s.primary_category_id, s.administrative_unit_id, s.address_text,
      s.landmark_description, s.directions, s.latitude, s.longitude, s.gps_accuracy_m, s.coordinates_source,
      case
        when s.latitude is null then (case when s.administrative_unit_id is not null then 'commune' else 'unknown' end)::public.geographic_precision
        when s.coordinates_source = 'gps_device' and s.gps_accuracy_m is not null and s.gps_accuracy_m <= 25 then 'exact'::public.geographic_precision
        else 'approximate'::public.geographic_precision
      end,
      case when s.source = 'field_agent' then 'agent_verified' else 'unverified' end::public.place_verification_status,
      case when p_publish then 'published' else 'pending_review' end::public.place_publication_status,
      s.submitted_by,
      case when s.source = 'field_agent' then coalesce(s.captured_at, s.created_at) end
    ) returning id into v_place_id;

    foreach v_cat in array s.extra_category_ids loop
      insert into public.place_categories (place_id, category_id) values (v_place_id, v_cat) on conflict do nothing;
    end loop;

    for v_contact in select * from jsonb_array_elements(s.contacts) loop
      begin
        insert into public.place_contacts (place_id, kind, value, sort_order)
        values (v_place_id, (v_contact ->> 'kind')::public.contact_kind, btrim(v_contact ->> 'value'), v_i);
        v_i := v_i + 1;
      exception when others then
        p_notes := concat_ws(E'\n', p_notes, 'Contact ignoré (format invalide) : ' || coalesce(v_contact ->> 'value', '?'));
      end;
    end loop;

    v_i := 0;
    foreach v_path in array s.photo_paths loop
      insert into public.place_media (place_id, storage_path, kind, moderation_status, uploaded_by, sort_order)
      values (v_place_id, v_path, case when v_i = 0 then 'cover' else 'gallery' end::public.media_kind, 'approved', s.submitted_by, v_i)
      on conflict (storage_path) do nothing;
      v_i := v_i + 1;
    end loop;

    if s.source = 'field_agent' then
      insert into public.place_verifications (place_id, verified_by, method, notes)
      values (v_place_id, s.submitted_by, 'field_visit', 'Collecte terrain validée');
    end if;

    update public.place_submissions set status = 'approved', resulting_place_id = v_place_id,
      reviewed_by = auth.uid(), reviewed_at = now(), review_notes = p_notes
    where id = s.id;
    insert into public.validation_history (submission_id, actor_id, action, notes) values (s.id, auth.uid(), 'approved', p_notes);

  elsif p_decision = 'duplicate' then
    if p_duplicate_of is null then
      raise exception 'Indiquez le lieu existant' using errcode = '22023';
    end if;
    update public.place_submissions set status = 'duplicate', duplicate_of_place_id = p_duplicate_of,
      reviewed_by = auth.uid(), reviewed_at = now(), review_notes = p_notes
    where id = s.id;
    insert into public.validation_history (submission_id, actor_id, action, notes) values (s.id, auth.uid(), 'marked_duplicate', p_notes);

  else
    update public.place_submissions set status = p_decision::public.submission_status,
      reviewed_by = auth.uid(), reviewed_at = now(), review_notes = p_notes
    where id = s.id;
    insert into public.validation_history (submission_id, actor_id, action, notes)
    values (s.id, auth.uid(), case when p_decision = 'reject' then 'rejected' else 'needs_changes' end, p_notes);
  end if;

  insert into public.moderation_actions (moderator_id, entity_type, entity_id, action, reason)
  values (auth.uid(), 'submission', s.id::text, p_decision, p_notes);
  perform public.write_audit_log('submission.reviewed', 'place_submission', s.id::text,
    jsonb_build_object('decision', p_decision, 'place_id', v_place_id, 'self_review', v_self));

  perform set_config('boyoma.internal_write', 'off', true);
  return v_place_id;
end;
$$;

create or replace function public.review_place_claim(p_claim_id uuid, p_decision text, p_notes text default null)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.place_claims%rowtype;
  v_role public.place_owner_role;
  v_self boolean;
begin
  if not public.has_permission('claims.review') then
    raise exception 'Permission claims.review requise' using errcode = '42501';
  end if;
  if p_decision not in ('approve', 'reject') then
    raise exception 'Décision invalide' using errcode = '22023';
  end if;
  select * into c from public.place_claims where id = p_claim_id for update;
  if not found then
    raise exception 'Revendication introuvable' using errcode = 'P0002';
  end if;
  if c.status <> 'pending' then
    raise exception 'Revendication déjà traitée' using errcode = 'P0001';
  end if;
  v_self := c.claimant_id = auth.uid();
  if v_self and not public.has_role('super_admin') then
    raise exception 'Vous ne pouvez pas examiner votre propre demande' using errcode = '42501';
  end if;
  if p_decision = 'reject' and coalesce(btrim(p_notes), '') = '' then
    raise exception 'Un motif est obligatoire' using errcode = '22023';
  end if;

  perform set_config('boyoma.internal_write', 'on', true);
  update public.place_claims set status = (case when p_decision = 'approve' then 'approved' else 'rejected' end)::public.claim_status,
    reviewed_by = auth.uid(), reviewed_at = now(), review_notes = p_notes
  where id = c.id;

  if p_decision = 'approve' then
    v_role := case when c.claimant_role = 'owner' then 'owner' else 'manager' end;
    insert into public.place_owners (place_id, user_id, role, granted_by)
    values (c.place_id, c.claimant_id, v_role, auth.uid())
    on conflict (place_id, user_id) do update set role = excluded.role;
    insert into public.user_roles (user_id, role_key, granted_by)
    values (c.claimant_id, case when v_role = 'owner' then 'place_owner' else 'place_manager' end, auth.uid())
    on conflict do nothing;
    update public.places set ownership_status = 'claimed' where id = c.place_id;
  else
    update public.places set ownership_status = 'unclaimed'
    where id = c.place_id and ownership_status = 'claim_pending'
      and not exists (select 1 from public.place_claims where place_id = c.place_id and status = 'pending' and id <> c.id)
      and not exists (select 1 from public.place_owners where place_id = c.place_id);
  end if;

  insert into public.moderation_actions (moderator_id, entity_type, entity_id, action, reason)
  values (auth.uid(), 'place_claim', c.id::text, p_decision, p_notes);
  perform public.write_audit_log('claim.reviewed', 'place_claim', c.id::text,
    jsonb_build_object('decision', p_decision, 'place_id', c.place_id, 'claimant_id', c.claimant_id, 'self_review', v_self));
  perform set_config('boyoma.internal_write', 'off', true);
end;
$$;
