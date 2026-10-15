-- =============================================================================
-- BOYOMA CONNECT — Mesure de vitesse réelle (Core Web Vitals, décision D37)
-- Échantillon anonyme des visites : métrique, valeur, type de page, qualité de connexion.
-- Aucune donnée personnelle (ni IP, ni identifiant, ni adresse complète de la page).
-- Écriture : uniquement par le serveur (clé de service) ; lecture agrégée : analytics.read.
-- =============================================================================

create table public.web_vitals (
  id bigint generated always as identity primary key,
  metric text not null check (metric in ('LCP', 'INP', 'CLS', 'FCP', 'TTFB')),
  value real not null check (value >= 0 and value < 600000),
  rating text not null check (rating in ('good', 'needs-improvement', 'poor')),
  route text not null check (char_length(route) between 1 and 60),
  connection text check (connection in ('slow-2g', '2g', '3g', '4g')),
  data_saver boolean not null default false,
  created_at timestamptz not null default now()
);
create index web_vitals_created_idx on public.web_vitals (created_at desc);
alter table public.web_vitals enable row level security;
comment on table public.web_vitals is 'Mesures de vitesse anonymes (échantillon), conservées 90 jours.';

-- 75e centile par métrique (référence Google) sur la période, global et par type de page.
create or replace function public.web_vitals_summary(p_days integer default 7)
returns table (metric text, route text, samples bigint, p75 real, good_share real)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.has_permission('analytics.read') then
    raise exception 'Accès refusé' using errcode = '42501';
  end if;
  return query
  select v.metric, coalesce(v.route, 'Toutes les pages'), count(*),
    (percentile_cont(0.75) within group (order by v.value))::real,
    (avg((v.rating = 'good')::int))::real
  from public.web_vitals v
  where v.created_at > now() - make_interval(days => least(greatest(p_days, 1), 90))
  group by grouping sets ((v.metric), (v.metric, v.route))
  order by grouping(v.route) desc, 2, 1;
end;
$$;
revoke execute on function public.web_vitals_summary(integer) from public, anon;
grant execute on function public.web_vitals_summary(integer) to authenticated;

-- Purge des mesures de plus de 90 jours (appelée par la route d'enregistrement, au fil de l'eau).
create or replace function public.web_vitals_purge()
returns void
language sql
security definer
set search_path = ''
as $$
  delete from public.web_vitals where created_at < now() - interval '90 days';
$$;
revoke execute on function public.web_vitals_purge() from public, anon, authenticated;
grant execute on function public.web_vitals_purge() to service_role;
