-- =============================================================================
-- BOYOMA CONNECT — 0010 : provenance des lieux importés depuis une source externe
-- Un lieu importé (ex. OpenStreetMap) garde la trace de sa source, de son identifiant
-- d'origine (dédoublonnage des réimports) et de sa licence, pour l'attribution obligatoire.
-- =============================================================================

create table public.place_external_refs (
  source text not null check (source in ('osm')),
  external_id text not null check (external_id ~ '^(node|way|relation)/[0-9]+$'),
  place_id uuid not null references public.places (id) on delete cascade,
  license text not null check (char_length(license) between 2 and 60),
  attribution text not null check (char_length(attribution) between 2 and 200),
  source_url text check (source_url is null or source_url ~* '^https://'),
  imported_at timestamptz not null default now(),
  primary key (source, external_id)
);
create index place_external_refs_place_idx on public.place_external_refs (place_id);

alter table public.place_external_refs enable row level security;

create policy "place_external_refs: lecture" on public.place_external_refs for select to anon, authenticated
  using (public.can_read_place(place_id));
create policy "place_external_refs: édition" on public.place_external_refs for all to authenticated
  using (public.has_permission('places.edit_any')) with check (public.has_permission('places.edit_any'));
