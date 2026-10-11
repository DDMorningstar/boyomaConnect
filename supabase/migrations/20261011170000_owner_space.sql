-- =============================================================================
-- BOYOMA CONNECT — 0011 : comptes (Google) et espace propriétaire
--  * Profil : nom et photo fournis par le fournisseur d'identité (Google) à l'inscription.
--  * Bucket « avatars » (public, dossier par utilisateur).
--  * Fiche créée par un propriétaire = soumission « owner_request » : téléphone public obligatoire,
--    3 photos max, logo ; à la validation, le demandeur devient propriétaire de la fiche.
--  * Catalogue ouvert au plan gratuit (phase de test, décision D18).
--  * Photos : limite du plan (gallery_photos) appliquée en base ; celles d'un gestionnaire validé
--    sont publiées directement (modérables a posteriori).
--  * Une fiche gérée garde toujours au moins un téléphone public.
-- =============================================================================

-- ------------------------------------------------------------------- profils
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_meta jsonb := coalesce(new.raw_user_meta_data, '{}'::jsonb);
  v_avatar text := coalesce(v_meta ->> 'avatar_url', v_meta ->> 'picture');
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    nullif(left(btrim(coalesce(v_meta ->> 'display_name', v_meta ->> 'full_name', v_meta ->> 'name', '')), 80), ''),
    case when v_avatar ~ '^https://' and char_length(v_avatar) <= 500 then v_avatar end
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role_key)
  values (new.id, 'registered_user')
  on conflict do nothing;

  return new;
end;
$$;

alter table public.profiles
  add constraint profiles_avatar_url_https check (avatar_url is null or (avatar_url ~ '^https://' and char_length(avatar_url) <= 500));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('avatars', 'avatars', true, 1048576, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

create policy "avatars: lecture de son dossier" on storage.objects for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: dépôt dans son dossier" on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "avatars: suppression dans son dossier" on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- La suppression d'un objet exige aussi un droit de lecture (API Storage).
create policy "place-media: lecture gestionnaire" on storage.objects for select to authenticated
  using (bucket_id = 'place-media' and (
    ((storage.foldername(name))[1] = 'submissions' and (storage.foldername(name))[2] = (select auth.uid())::text)
    or ((storage.foldername(name))[1] = 'places' and public.can_edit_place(((storage.foldername(name))[2])::uuid))
    or public.has_permission('media.moderate')));

-- ------------------------------------------------- fiches créées par un propriétaire
alter table public.place_submissions
  add column owner_request boolean not null default false,
  add column logo_path text check (logo_path is null or (logo_path ~ '^submissions/' and char_length(logo_path) <= 300)),
  add constraint place_submissions_owner_photos check (not owner_request or cardinality(photo_paths) <= 3),
  add constraint place_submissions_owner_phone check (
    not owner_request or jsonb_path_exists(contacts, '$[*] ? (@.kind == "phone")'));

-- À la validation d'une demande propriétaire : le demandeur devient propriétaire de la fiche.
create or replace function public.place_submissions_owner_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev text := coalesce(current_setting('boyoma.internal_write', true), 'off');
begin
  if new.owner_request and new.status = 'approved' and old.status is distinct from 'approved'
     and new.resulting_place_id is not null then
    perform set_config('boyoma.internal_write', 'on', true);
    insert into public.place_owners (place_id, user_id, role, granted_by)
    values (new.resulting_place_id, new.submitted_by, 'owner', auth.uid())
    on conflict (place_id, user_id) do update set role = 'owner';
    insert into public.user_roles (user_id, role_key, granted_by)
    values (new.submitted_by, 'place_owner', auth.uid())
    on conflict do nothing;
    update public.places
      set ownership_status = 'claimed', logo_path = coalesce(new.logo_path, logo_path)
      where id = new.resulting_place_id;
    perform public.write_audit_log('place.owner_granted', 'place', new.resulting_place_id::text,
      jsonb_build_object('user_id', new.submitted_by, 'submission_id', new.id));
    perform set_config('boyoma.internal_write', v_prev, true);
  end if;
  return null;
end;
$$;
create trigger place_submissions_owner_approval after update on public.place_submissions
  for each row execute function public.place_submissions_owner_approval();

-- ------------------------------------------------------------ catalogue gratuit
insert into public.plan_features (plan_id, feature_key, value, label)
select id, 'catalog', 'true'::jsonb, 'Catalogue produits et services' from public.plans where key = 'free'
on conflict (plan_id, feature_key) do update set value = excluded.value;

-- ------------------------------------------------------------------- photos
-- Un gestionnaire validé publie ses photos directement ; les autres restent « pending ».
drop policy "place_media: ajout" on public.place_media;
create policy "place_media: ajout" on public.place_media for insert to authenticated
  with check (public.can_edit_place(place_id) and uploaded_by = auth.uid()
    and (moderation_status = 'pending' or public.is_place_manager(place_id) or public.has_permission('media.moderate')));

-- Limite de photos (couverture + galerie) selon le plan actif du lieu.
create or replace function public.place_media_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_max integer;
begin
  if new.kind not in ('cover', 'gallery') or auth.uid() is null or public.has_permission('media.moderate') then
    return new;
  end if;
  select (pf.value #>> '{}')::integer into v_max
  from public.plans pl join public.plan_features pf on pf.plan_id = pl.id
  where pl.key = public.place_active_plan(new.place_id) and pf.feature_key = 'gallery_photos'
    and jsonb_typeof(pf.value) = 'number';
  v_max := coalesce(v_max, 3);
  if (select count(*) from public.place_media where place_id = new.place_id and kind in ('cover', 'gallery')) >= v_max then
    raise exception 'Limite de % photos atteinte pour cette fiche', v_max using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger place_media_limit before insert on public.place_media
  for each row execute function public.place_media_limit();

-- --------------------------------------------- téléphone public obligatoire
create or replace function public.place_contacts_keep_phone()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or current_setting('boyoma.internal_write', true) = 'on'
     or public.has_permission('places.edit_any') then
    return coalesce(new, old);
  end if;
  if old.kind = 'phone' and (tg_op = 'DELETE' or new.kind <> 'phone' or new.place_id <> old.place_id)
     and exists (select 1 from public.place_owners where place_id = old.place_id)
     and not exists (select 1 from public.place_contacts where place_id = old.place_id and kind = 'phone' and id <> old.id) then
    raise exception 'Un numéro de téléphone public est obligatoire' using errcode = 'P0001';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger place_contacts_keep_phone before update or delete on public.place_contacts
  for each row execute function public.place_contacts_keep_phone();
