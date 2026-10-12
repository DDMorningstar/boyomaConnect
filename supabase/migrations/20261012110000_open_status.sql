-- =============================================================================
-- BOYOMA CONNECT — 0022 : statut « ouvert / fermé » d'une liste de lieux (cartes de résultats)
-- Uniquement les lieux publiés dont les horaires sont connus ; sinon rien (jamais d'horaire supposé).
-- =============================================================================

create or replace function public.places_open_status(p_place_ids uuid[])
returns table (place_id uuid, is_open boolean)
language sql
stable
set search_path = ''
as $$
  select p.id, public.is_place_open_at(p.id, now(), 'Africa/Lubumbashi')
  from public.places p
  where p.id = any (p_place_ids[1:100])
    and p.publication_status = 'published'
    and (exists (select 1 from public.place_hours h where h.place_id = p.id)
      or exists (select 1 from public.place_special_hours s where s.place_id = p.id and s.date = (now() at time zone 'Africa/Lubumbashi')::date));
$$;
grant execute on function public.places_open_status(uuid[]) to anon, authenticated;
