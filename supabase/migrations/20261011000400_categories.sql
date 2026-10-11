-- =============================================================================
-- BOYOMA CONNECT — 0004 : catégories dynamiques (illimitées, hiérarchiques)
-- icon = nom d'icône Lucide (ex. 'pill'), color = hex #RRGGBB.
-- =============================================================================

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.categories (id) on delete restrict,
  name text not null check (char_length(name) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name_normalized text generated always as (public.normalize_text(name)) stored,
  description text,
  icon text not null default 'map-pin' check (icon ~ '^[a-z0-9-]+$'),
  color text not null default '#2563EB' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer not null default 0,
  is_active boolean not null default true,
  is_featured boolean not null default false, -- mise en avant sur l'accueil (si elle contient des lieux)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint categories_not_self_parent check (parent_id is distinct from id)
);
create index categories_parent_idx on public.categories (parent_id, sort_order);
create index categories_name_trgm_idx on public.categories using gin (name_normalized extensions.gin_trgm_ops);
create trigger categories_updated_at before update on public.categories
  for each row execute function public.set_updated_at();

-- Limite à 2 niveaux pour rester lisible (catégorie → sous-catégorie) et empêche les cycles.
create or replace function public.categories_check_depth()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.parent_id is not null and exists (
    select 1 from public.categories p where p.id = new.parent_id and p.parent_id is not null
  ) then
    raise exception 'Une sous-catégorie ne peut pas avoir de sous-catégorie (2 niveaux maximum)';
  end if;
  if new.parent_id is not null and exists (
    select 1 from public.categories c where c.parent_id = new.id
  ) then
    raise exception 'Une catégorie qui possède des sous-catégories ne peut pas devenir sous-catégorie';
  end if;
  return new;
end;
$$;
create trigger categories_depth before insert or update of parent_id on public.categories
  for each row execute function public.categories_check_depth();

alter table public.categories enable row level security;
create policy "catégories actives lisibles" on public.categories for select to anon, authenticated
  using (is_active or public.has_permission('categories.manage'));
create policy "catégories gérées" on public.categories for all to authenticated
  using (public.has_permission('categories.manage')) with check (public.has_permission('categories.manage'));

-- -------------------------------------------------------------- données
insert into public.categories (name, slug, icon, color, sort_order, is_featured, description) values
  ('Santé', 'sante', 'heart-pulse', '#DC2626', 1, true, 'Pharmacies, hôpitaux, centres de santé, cliniques, laboratoires.'),
  ('Hébergement', 'hebergement', 'bed-double', '#7C3AED', 2, true, 'Hôtels, auberges, maisons d''hôtes et résidences.'),
  ('Restauration', 'restauration', 'utensils', '#EA580C', 3, true, 'Restaurants, bars, cafés, boulangeries et pâtisseries.'),
  ('Commerce', 'commerce', 'shopping-bag', '#2563EB', 4, true, 'Boutiques, supermarchés, marchés et magasins.'),
  ('Automobile et transport', 'automobile-transport', 'car', '#0891B2', 5, true, 'Garages, stations-service, transport routier et fluvial.'),
  ('Divertissement', 'divertissement', 'party-popper', '#DB2777', 6, false, 'Loisirs, salles de fête, sport et spectacles.'),
  ('Éducation', 'education', 'graduation-cap', '#4F46E5', 7, true, 'Écoles, universités, instituts et bibliothèques.'),
  ('Administrations et services publics', 'administrations', 'landmark', '#475569', 8, false, 'Bureaux administratifs, mairies, tribunaux, commissariats.'),
  ('Services professionnels', 'services-professionnels', 'wrench', '#CA8A04', 9, false, 'Artisans, techniciens et prestataires.'),
  ('Services financiers', 'services-financiers', 'banknote', '#16A34A', 10, true, 'Banques, distributeurs, transfert d''argent, Mobile Money.'),
  ('Religion et communauté', 'religion-communaute', 'church', '#9333EA', 11, false, 'Lieux de culte et centres communautaires.'),
  ('Tourisme', 'tourisme', 'compass', '#06B6D4', 12, true, 'Sites naturels, monuments, lieux historiques et culturels.');

insert into public.categories (parent_id, name, slug, icon, color, sort_order)
select p.id, s.name, s.slug, s.icon, p.color, s.ord
from (values
  ('sante', 'Pharmacies', 'pharmacies', 'pill', 1),
  ('sante', 'Hôpitaux', 'hopitaux', 'hospital', 2),
  ('sante', 'Centres de santé', 'centres-de-sante', 'stethoscope', 3),
  ('sante', 'Cliniques', 'cliniques', 'building-2', 4),
  ('sante', 'Laboratoires', 'laboratoires', 'flask-conical', 5),
  ('sante', 'Cabinets médicaux', 'cabinets-medicaux', 'user-round', 6),
  ('sante', 'Maternités', 'maternites', 'baby', 7),
  ('sante', 'Services d''urgence', 'urgences', 'siren', 8),
  ('hebergement', 'Hôtels', 'hotels', 'hotel', 1),
  ('hebergement', 'Auberges', 'auberges', 'bed', 2),
  ('hebergement', 'Maisons d''hôtes', 'maisons-d-hotes', 'house', 3),
  ('hebergement', 'Résidences et logements touristiques', 'residences', 'key-round', 4),
  ('restauration', 'Restaurants', 'restaurants', 'utensils', 1),
  ('restauration', 'Bars', 'bars', 'beer', 2),
  ('restauration', 'Cafés', 'cafes', 'coffee', 3),
  ('restauration', 'Boulangeries', 'boulangeries', 'croissant', 4),
  ('restauration', 'Pâtisseries', 'patisseries', 'cake-slice', 5),
  ('restauration', 'Fast-foods', 'fast-foods', 'sandwich', 6),
  ('restauration', 'Glaciers', 'glaciers', 'ice-cream-cone', 7),
  ('restauration', 'Traiteurs', 'traiteurs', 'chef-hat', 8),
  ('commerce', 'Boutiques', 'boutiques', 'store', 1),
  ('commerce', 'Supermarchés', 'supermarches', 'shopping-cart', 2),
  ('commerce', 'Marchés', 'marches', 'tent', 3),
  ('commerce', 'Vêtements', 'vetements', 'shirt', 4),
  ('commerce', 'Quincailleries', 'quincailleries', 'hammer', 5),
  ('commerce', 'Électronique', 'electronique', 'smartphone', 6),
  ('commerce', 'Librairies et papeteries', 'librairies-papeteries', 'book-open', 7),
  ('automobile-transport', 'Garages et mécaniciens', 'garages', 'wrench', 1),
  ('automobile-transport', 'Ateliers motos', 'ateliers-motos', 'bike', 2),
  ('automobile-transport', 'Stations-service', 'stations-service', 'fuel', 3),
  ('automobile-transport', 'Parkings', 'parkings', 'square-parking', 4),
  ('automobile-transport', 'Agences de transport', 'agences-de-transport', 'bus', 5),
  ('automobile-transport', 'Stations de taxis', 'stations-de-taxis', 'car-taxi-front', 6),
  ('automobile-transport', 'Transport fluvial', 'transport-fluvial', 'ship', 7),
  ('divertissement', 'Parcs de loisirs', 'parcs-de-loisirs', 'trees', 1),
  ('divertissement', 'Salles de fête et événements', 'salles-de-fete', 'party-popper', 2),
  ('divertissement', 'Terrains de sport', 'terrains-de-sport', 'volleyball', 3),
  ('divertissement', 'Salles de sport', 'salles-de-sport', 'dumbbell', 4),
  ('divertissement', 'Piscines', 'piscines', 'waves', 5),
  ('divertissement', 'Spectacles et cinémas', 'spectacles-cinemas', 'clapperboard', 6),
  ('education', 'Écoles', 'ecoles', 'school', 1),
  ('education', 'Universités et instituts', 'universites', 'university', 2),
  ('education', 'Centres de formation', 'centres-de-formation', 'presentation', 3),
  ('education', 'Bibliothèques', 'bibliotheques', 'library', 4),
  ('administrations', 'Commissariats', 'commissariats', 'shield', 1),
  ('administrations', 'Bureaux administratifs', 'bureaux-administratifs', 'building', 2),
  ('administrations', 'Mairies et bureaux communaux', 'mairies', 'landmark', 3),
  ('administrations', 'Tribunaux', 'tribunaux', 'scale', 4),
  ('administrations', 'Services fiscaux', 'services-fiscaux', 'receipt', 5),
  ('services-professionnels', 'Informaticiens', 'informaticiens', 'laptop', 1),
  ('services-professionnels', 'Électriciens', 'electriciens', 'zap', 2),
  ('services-professionnels', 'Plombiers', 'plombiers', 'droplets', 3),
  ('services-professionnels', 'Photographes', 'photographes', 'camera', 4),
  ('services-professionnels', 'Couturiers', 'couturiers', 'scissors', 5),
  ('services-professionnels', 'Coiffeurs', 'coiffeurs', 'sparkles', 6),
  ('services-professionnels', 'Menuisiers', 'menuisiers', 'axe', 7),
  ('services-professionnels', 'Imprimeurs', 'imprimeurs', 'printer', 8),
  ('services-financiers', 'Banques', 'banques', 'landmark', 1),
  ('services-financiers', 'Distributeurs', 'distributeurs', 'credit-card', 2),
  ('services-financiers', 'Agences de transfert', 'agences-de-transfert', 'send', 3),
  ('services-financiers', 'Points Mobile Money', 'mobile-money', 'smartphone', 4),
  ('services-financiers', 'Institutions financières', 'institutions-financieres', 'piggy-bank', 5),
  ('religion-communaute', 'Églises', 'eglises', 'church', 1),
  ('religion-communaute', 'Mosquées', 'mosquees', 'moon-star', 2),
  ('religion-communaute', 'Centres communautaires', 'centres-communautaires', 'users', 3),
  ('tourisme', 'Sites naturels', 'sites-naturels', 'mountain', 1),
  ('tourisme', 'Monuments', 'monuments', 'castle', 2),
  ('tourisme', 'Lieux historiques', 'lieux-historiques', 'scroll', 3),
  ('tourisme', 'Espaces culturels', 'espaces-culturels', 'palette', 4),
  ('tourisme', 'Attractions', 'attractions', 'ferris-wheel', 5),
  ('tourisme', 'Guides touristiques', 'guides-touristiques', 'map', 6)
) as s(parent_slug, name, slug, icon, ord)
join public.categories p on p.slug = s.parent_slug;
