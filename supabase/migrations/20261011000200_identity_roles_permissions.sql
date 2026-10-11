-- =============================================================================
-- BOYOMA CONNECT — 0002 : identité, rôles, permissions, journal d'audit
-- Les comptes restent gérés par Supabase Auth (auth.users). Ce module ajoute
-- profils, rôles cumulables et permissions explicites (RBAC testable).
-- =============================================================================

-- ---------------------------------------------------------------- audit_logs
-- Créée dès maintenant : les triggers de rôles y écrivent.
create table public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references auth.users (id) on delete set null,
  action text not null,                    -- ex. 'role.granted', 'place.published'
  entity_type text not null,               -- ex. 'user_role', 'place'
  entity_id text,
  details jsonb not null default '{}'::jsonb, -- jamais de secret, jeton ni mot de passe
  request_id text,                         -- identifiant de corrélation transmis par le serveur
  created_at timestamptz not null default now()
);
create index audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index audit_logs_actor_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_created_idx on public.audit_logs (created_at desc);
comment on table public.audit_logs is 'Journal append-only des opérations sensibles. Aucune mise à jour ni suppression via l''API.';

-- Écriture d'audit centralisée (SECURITY DEFINER : les clients ne peuvent pas insérer directement).
create or replace function public.write_audit_log(
  p_action text, p_entity_type text, p_entity_id text, p_details jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (actor_id, action, entity_type, entity_id, details, request_id)
  values (
    auth.uid(), p_action, p_entity_type, p_entity_id, coalesce(p_details, '{}'::jsonb),
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-request-id', '')
  );
end;
$$;
revoke all on function public.write_audit_log(text, text, text, jsonb) from public, anon, authenticated;

-- ------------------------------------------------------------- rôles / droits
create table public.roles (
  key text primary key check (key ~ '^[a-z_]+$'),
  name text not null,
  description text,
  rank smallint not null default 0,         -- ordre d'affichage / niveau indicatif
  created_at timestamptz not null default now()
);

create table public.permissions (
  key text primary key check (key ~ '^[a-z_]+\.[a-z_]+$'),
  description text not null
);

create table public.role_permissions (
  role_key text not null references public.roles (key) on delete cascade,
  permission_key text not null references public.permissions (key) on delete cascade,
  primary key (role_key, permission_key)
);
create index role_permissions_permission_idx on public.role_permissions (permission_key);

-- ------------------------------------------------------------------- profils
create type public.account_status as enum ('active', 'suspended');

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text check (char_length(display_name) between 1 and 80),
  avatar_url text,
  phone text check (phone is null or phone ~ '^\+?[0-9 ]{6,20}$'), -- privé, jamais exposé publiquement
  preferred_locale text not null default 'fr' check (preferred_locale in ('fr', 'sw', 'ln', 'en')),
  status public.account_status not null default 'active',
  suspended_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.user_roles (
  user_id uuid not null references auth.users (id) on delete cascade,
  role_key text not null references public.roles (key) on delete restrict,
  granted_by uuid references auth.users (id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, role_key)
);
create index user_roles_role_idx on public.user_roles (role_key);

-- ------------------------------------------------------- fonctions d'accès
-- SECURITY DEFINER + search_path vide : évite la récursion RLS et l'injection de schéma.
create or replace function public.has_role(p_role text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id and p.status = 'active'
    where ur.user_id = auth.uid() and ur.role_key = p_role
  );
$$;

create or replace function public.has_permission(p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id and p.status = 'active'
    join public.role_permissions rp on rp.role_key = ur.role_key
    where ur.user_id = auth.uid() and rp.permission_key = p_permission
  );
$$;

-- Liste des permissions de l'utilisateur courant (pour l'interface ; le serveur revérifie toujours).
create or replace function public.current_user_permissions()
returns table (permission_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select distinct rp.permission_key
  from public.user_roles ur
  join public.profiles p on p.id = ur.user_id and p.status = 'active'
  join public.role_permissions rp on rp.role_key = ur.role_key
  where ur.user_id = auth.uid();
$$;

create or replace function public.current_user_roles()
returns table (role_key text)
language sql
stable
security definer
set search_path = ''
as $$
  select ur.role_key from public.user_roles ur where ur.user_id = auth.uid();
$$;

revoke execute on function public.has_role(text), public.has_permission(text),
  public.current_user_permissions(), public.current_user_roles() from public;
grant execute on function public.has_role(text), public.has_permission(text),
  public.current_user_permissions(), public.current_user_roles() to anon, authenticated, service_role;

-- --------------------------------------------- création automatique du profil
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'display_name', '')), 80), '')
  )
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role_key)
  values (new.id, 'registered_user')
  on conflict do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ------------------------------------------- garde-fous sur les rôles
-- * Seul un super-administrateur peut accorder/retirer admin ou super_admin.
-- * Personne ne peut retirer son propre rôle super_admin (évite de verrouiller la plateforme).
-- * Chaque changement est journalisé.
create or replace function public.guard_user_roles()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role text := coalesce(new.role_key, old.role_key);
  v_user uuid := coalesce(new.user_id, old.user_id);
begin
  -- Les opérations de service (migrations, seeds, service_role) ne passent pas par auth.uid().
  if auth.uid() is not null then
    if v_role in ('admin', 'super_admin') and not public.has_role('super_admin') then
      raise exception 'Seul un super-administrateur peut gérer le rôle %', v_role using errcode = '42501';
    end if;
    if tg_op = 'DELETE' and v_role = 'super_admin' and v_user = auth.uid() then
      raise exception 'Impossible de retirer votre propre rôle super-administrateur' using errcode = '42501';
    end if;
  end if;

  if tg_op = 'INSERT' then
    new.granted_by := coalesce(new.granted_by, auth.uid());
    perform public.write_audit_log('role.granted', 'user_role', v_user::text, jsonb_build_object('role', v_role));
    return new;
  else
    perform public.write_audit_log('role.revoked', 'user_role', v_user::text, jsonb_build_object('role', v_role));
    return old;
  end if;
end;
$$;

create trigger user_roles_guard
  before insert or delete on public.user_roles
  for each row execute function public.guard_user_roles();

-- Un utilisateur ne peut pas modifier lui-même son statut (suspension).
create or replace function public.guard_profile_update()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (new.status is distinct from old.status or new.suspended_reason is distinct from old.suspended_reason) then
    if auth.uid() is not null and not public.has_permission('users.manage') then
      raise exception 'Modification du statut non autorisée' using errcode = '42501';
    end if;
    perform public.write_audit_log('user.status_changed', 'profile', new.id::text,
      jsonb_build_object('from', old.status, 'to', new.status));
  end if;
  return new;
end;
$$;
create trigger profiles_guard before update on public.profiles
  for each row execute function public.guard_profile_update();

-- ------------------------------------------------------------------- RLS
alter table public.audit_logs enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;

create policy "audit lisible par les auditeurs" on public.audit_logs
  for select to authenticated using (public.has_permission('audit.read'));
-- Aucune policy insert/update/delete : écriture uniquement via write_audit_log().

create policy "roles lisibles" on public.roles for select to authenticated using (true);
create policy "permissions lisibles" on public.permissions for select to authenticated using (true);
create policy "role_permissions lisibles" on public.role_permissions for select to authenticated using (true);
create policy "role_permissions gérées" on public.role_permissions for all to authenticated
  using (public.has_role('super_admin')) with check (public.has_role('super_admin'));

create policy "profil: lecture de soi" on public.profiles
  for select to authenticated using (id = auth.uid() or public.has_permission('users.read'));
create policy "profil: mise à jour de soi" on public.profiles
  for update to authenticated
  using (id = auth.uid() or public.has_permission('users.manage'))
  with check (id = auth.uid() or public.has_permission('users.manage'));

create policy "user_roles: lecture" on public.user_roles
  for select to authenticated using (user_id = auth.uid() or public.has_permission('users.read'));
create policy "user_roles: attribution" on public.user_roles
  for insert to authenticated with check (public.has_permission('roles.manage'));
create policy "user_roles: retrait" on public.user_roles
  for delete to authenticated using (public.has_permission('roles.manage'));

-- -------------------------------------------------------------- données
insert into public.roles (key, name, description, rank) values
  ('registered_user', 'Utilisateur enregistré', 'Compte standard : favoris synchronisés, avis, suggestions de lieux.', 10),
  ('place_owner', 'Propriétaire d''établissement', 'Gère les établissements dont la revendication a été validée.', 20),
  ('place_manager', 'Gestionnaire d''établissement', 'Gère un établissement par délégation du propriétaire.', 20),
  ('field_agent', 'Agent cartographe', 'Collecte des lieux sur le terrain, y compris hors ligne.', 30),
  ('moderator', 'Modérateur', 'Valide les soumissions, modère avis, photos et signalements. Aucun accès financier.', 40),
  ('admin', 'Administrateur', 'Administre la plateforme. Actions tracées.', 50),
  ('super_admin', 'Super-administrateur', 'Gère les administrateurs et les paramètres critiques.', 60);

insert into public.permissions (key, description) values
  ('places.read_all', 'Lire tous les lieux, y compris non publiés'),
  ('places.create', 'Créer directement un lieu'),
  ('places.edit_any', 'Modifier n''importe quel lieu'),
  ('places.publish', 'Publier, refuser ou suspendre un lieu'),
  ('places.archive', 'Archiver ou restaurer un lieu'),
  ('places.merge', 'Fusionner des doublons'),
  ('submissions.create', 'Soumettre un lieu'),
  ('submissions.review', 'Examiner les soumissions'),
  ('field.collect', 'Utiliser l''espace de collecte terrain'),
  ('claims.review', 'Examiner les revendications de fiches'),
  ('reviews.moderate', 'Modérer les avis'),
  ('reports.handle', 'Traiter les signalements'),
  ('media.moderate', 'Modérer les photos'),
  ('categories.manage', 'Gérer les catégories'),
  ('geography.manage', 'Gérer le référentiel géographique'),
  ('assignments.manage', 'Gérer les affectations des agents'),
  ('users.read', 'Consulter les comptes'),
  ('users.manage', 'Suspendre / réactiver des comptes'),
  ('roles.manage', 'Attribuer des rôles'),
  ('billing.read', 'Consulter abonnements, factures et paiements'),
  ('billing.manage', 'Valider des paiements manuels, gérer les abonnements'),
  ('plans.manage', 'Configurer les plans et leurs prix'),
  ('campaigns.manage', 'Gérer les campagnes sponsorisées'),
  ('settings.manage', 'Modifier la configuration de l''application'),
  ('analytics.read', 'Consulter les statistiques globales'),
  ('audit.read', 'Consulter le journal d''audit');

insert into public.role_permissions (role_key, permission_key) values
  ('registered_user', 'submissions.create'),
  ('field_agent', 'submissions.create'),
  ('field_agent', 'field.collect'),
  ('moderator', 'places.read_all'),
  ('moderator', 'places.publish'),
  ('moderator', 'submissions.review'),
  ('moderator', 'claims.review'),
  ('moderator', 'reviews.moderate'),
  ('moderator', 'reports.handle'),
  ('moderator', 'media.moderate'),
  ('moderator', 'analytics.read');

-- admin et super_admin : toutes les permissions.
insert into public.role_permissions (role_key, permission_key)
select r.key, p.key from public.roles r cross join public.permissions p
where r.key in ('admin', 'super_admin');
