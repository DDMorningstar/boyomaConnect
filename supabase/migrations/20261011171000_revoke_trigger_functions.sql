-- =============================================================================
-- BOYOMA CONNECT — 0012 : fonctions de trigger retirées de l'API
-- Elles n'ont pas à être appelables via /rest/v1/rpc (le déclenchement d'un trigger
-- ne vérifie pas le droit EXECUTE de l'utilisateur : aucun effet sur leur fonctionnement).
-- =============================================================================
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
  end loop;
end;
$$;
