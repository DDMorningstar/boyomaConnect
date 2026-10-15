-- =============================================================================
-- BOYOMA CONNECT — Communauté (2/2) : photos proposées par les visiteurs (modérées avant
-- publication), remerciement de l'auteur, compteur de contributions pour les badges (décision D34).
-- =============================================================================

-- Dépôt des photos proposées : dossier personnel suggestions/<utilisateur>/ uniquement.
create policy "place-media: dépôt suggestion" on storage.objects for insert to authenticated
  with check (bucket_id = 'place-media' and (storage.foldername(name))[1] = 'suggestions'
    and (storage.foldername(name))[2] = (select auth.uid())::text);

-- Proposition d'une photo : fiche publiée, chemin dans le dossier de l'auteur, 5 par jour au plus.
-- Toujours « en attente » : publiée seulement après validation (module Photos de l'administration).
create or replace function public.suggest_place_photo(
  p_place_id uuid, p_path text, p_caption text, p_width integer, p_height integer, p_bytes integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_id uuid;
begin
  if v_uid is null then
    raise exception 'Connexion requise' using errcode = '42501';
  end if;
  if not public.is_place_public(p_place_id) then
    raise exception 'Établissement introuvable' using errcode = 'P0002';
  end if;
  if p_path is null or p_path !~ ('^suggestions/' || v_uid::text || '/[0-9a-f-]{36}\.webp$') then
    raise exception 'Fichier invalide' using errcode = '22023';
  end if;
  if (select count(*) from public.place_media where uploaded_by = v_uid and kind = 'community'
      and created_at > now() - interval '24 hours') >= 5 then
    raise exception '5 photos proposées par jour au maximum' using errcode = 'P0001';
  end if;
  insert into public.place_media (place_id, storage_path, kind, caption, width, height, bytes, mime_type,
    moderation_status, sort_order, uploaded_by)
  values (p_place_id, p_path, 'community', nullif(left(btrim(coalesce(p_caption, '')), 200), ''),
    greatest(p_width, 1), greatest(p_height, 1), greatest(p_bytes, 1), 'image/webp', 'pending', 1000, v_uid)
  returning id into v_id;
  return v_id;
end;
$$;
revoke execute on function public.suggest_place_photo(uuid, text, text, integer, integer, integer) from public, anon;
grant execute on function public.suggest_place_photo(uuid, text, text, integer, integer, integer) to authenticated;

-- Seule la modération décide du sort d'une photo proposée (pas le gestionnaire de la fiche).
create or replace function public.community_media_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.kind = 'community' and (new.moderation_status is distinct from old.moderation_status
      or new.kind is distinct from old.kind or new.storage_path is distinct from old.storage_path)
     and not public.has_permission('media.moderate')
     and coalesce(current_setting('boyoma.internal_write', true), '') <> 'on'
     and coalesce((select auth.role()), '') <> 'service_role' then
    raise exception 'Seule la modération peut valider une photo proposée' using errcode = '42501';
  end if;
  return new;
end;
$$;
create trigger community_media_guard before update on public.place_media
  for each row execute function public.community_media_guard();
revoke execute on function public.community_media_guard() from public, anon, authenticated;

-- Remerciement : l'auteur est notifié quand sa photo est publiée (ou refusée).
create or replace function public.community_media_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_place record;
begin
  if new.kind <> 'community' or new.uploaded_by is null or new.moderation_status is not distinct from old.moderation_status then
    return null;
  end if;
  select slug, name into v_place from public.places where id = new.place_id;
  if new.moderation_status = 'approved' then
    perform public.notify_user(new.uploaded_by, 'contribution', 'Merci ! Votre photo est publiée',
      'Votre photo de « ' || v_place.name || ' » aide toute la communauté.', '/lieux/' || v_place.slug);
  elsif new.moderation_status = 'rejected' then
    perform public.notify_user(new.uploaded_by, 'contribution', 'Photo non retenue',
      'Votre photo de « ' || v_place.name || ' » n''a pas été publiée. Merci pour votre aide.', '/lieux/' || v_place.slug);
  end if;
  return null;
end;
$$;
create trigger community_media_notify after update of moderation_status on public.place_media
  for each row execute function public.community_media_notify();
revoke execute on function public.community_media_notify() from public, anon, authenticated;

-- Contributions validées de l'utilisateur connecté (badges de contributeur).
create or replace function public.my_contributions()
returns table (reviews integer, photos integer, reports integer, places integer)
language sql
stable
security definer
set search_path = ''
as $$
  select
    (select count(*)::int from public.reviews where author_id = auth.uid() and status = 'published'),
    (select count(*)::int from public.place_media where uploaded_by = auth.uid() and kind = 'community' and moderation_status = 'approved'),
    (select count(*)::int from public.place_reports where reporter_id = auth.uid() and status = 'resolved'),
    (select count(*)::int from public.place_submissions where submitted_by = auth.uid() and status = 'approved');
$$;
revoke execute on function public.my_contributions() from public, anon;
grant execute on function public.my_contributions() to authenticated;
