-- =============================================================================
-- BOYOMA CONNECT — 0023 : catalogue enrichi (décision D31)
-- Vitrine de produits et services gérée par l'établissement ; les visiteurs le contactent
-- directement (téléphone, WhatsApp, e-mail). Aucune commande ni paiement dans l'application.
--  * price_type : fixe, « à partir de », sur devis, gratuit ; price_unit (« nuit », « kg »…)
--  * is_featured : article mis en avant (affiché en premier)
--  * photo_paths : uniquement des fichiers du dossier de la fiche (places/<id>/catalog/…)
-- =============================================================================

alter table public.catalog_items
  add column price_type text not null default 'fixed'
    check (price_type in ('fixed', 'from', 'on_quote', 'free')),
  add column price_unit text check (price_unit is null or char_length(price_unit) between 1 and 30),
  add column is_featured boolean not null default false;

-- Sur devis / gratuit : pas de montant.
alter table public.catalog_items
  add constraint catalog_items_price_type_amount check (price_type in ('fixed', 'from') or price is null);

create index if not exists catalog_items_place_sort_idx on public.catalog_items (place_id, sort_order);

-- Les photos d'un article ne peuvent référencer que des fichiers de sa propre fiche.
create or replace function public.catalog_items_guard_photos()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if exists (
    select 1 from unnest(new.photo_paths) p
    where p !~ ('^places/' || new.place_id::text || '/catalog/[0-9a-f-]{36}\.webp$')
  ) then
    raise exception 'Photo d''article invalide' using errcode = '22023';
  end if;
  return new;
end;
$$;
create trigger catalog_items_guard_photos before insert or update of photo_paths, place_id
  on public.catalog_items for each row execute function public.catalog_items_guard_photos();
revoke execute on function public.catalog_items_guard_photos() from public, anon, authenticated;
