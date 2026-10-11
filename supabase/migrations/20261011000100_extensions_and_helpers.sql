-- =============================================================================
-- BOYOMA CONNECT — 0001 : extensions et fonctions utilitaires
-- PostGIS est installé dans un schéma dédié « gis » (exigence du cahier des charges).
-- pg_trgm et unaccent vont dans « extensions » (convention Supabase).
-- =============================================================================

create schema if not exists gis;
create schema if not exists extensions;

create extension if not exists postgis with schema gis;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;
create extension if not exists pgcrypto with schema extensions;

-- Les rôles d'API doivent pouvoir utiliser les types géographiques.
grant usage on schema gis to anon, authenticated, service_role;

-- -----------------------------------------------------------------------------
-- Normalisation de texte : minuscules, sans accents, espaces compactés.
-- unaccent() n'est pas IMMUTABLE ; ce wrapper fixe le dictionnaire pour pouvoir
-- l'utiliser dans des colonnes générées et des index.
-- -----------------------------------------------------------------------------
create or replace function public.normalize_text(input text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select nullif(
    btrim(regexp_replace(
      lower(extensions.unaccent('extensions.unaccent'::regdictionary, coalesce(input, ''))),
      '\s+', ' ', 'g'
    )),
    ''
  );
$$;

comment on function public.normalize_text(text) is
  'Minuscules + suppression des accents + espaces compactés. Utilisée pour la recherche et les slugs.';

-- Génère un slug ASCII à partir d'un texte (sans garantie d'unicité).
create or replace function public.slugify(input text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select trim(both '-' from regexp_replace(coalesce(public.normalize_text(input), ''), '[^a-z0-9]+', '-', 'g'));
$$;

-- Trigger générique de mise à jour de updated_at.
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
