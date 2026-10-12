-- =============================================================================
-- BOYOMA CONNECT — 0021 : édition des correspondances OSM → catégories (décision D30)
-- Ajout / activation via fonctions de confiance (permission imports.manage + journal d'audit).
-- =============================================================================

create or replace function public.import_save_mapping(
  p_osm_key text, p_osm_value text, p_category_id uuid, p_priority integer default 100,
  p_condition_key text default null, p_condition_value text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  perform public.import_require_manage();
  if not exists (select 1 from public.categories where id = p_category_id and is_active) then
    raise exception 'Catégorie inconnue' using errcode = '22023';
  end if;
  insert into public.osm_category_mappings (osm_key, osm_value, condition_key, condition_value, category_id, priority)
  values (lower(btrim(p_osm_key)), lower(btrim(p_osm_value)), nullif(lower(btrim(coalesce(p_condition_key, ''))), ''),
          nullif(btrim(coalesce(p_condition_value, '')), ''), p_category_id, coalesce(p_priority, 100))
  on conflict (osm_key, osm_value, coalesce(condition_key, ''), coalesce(condition_value, ''))
  do update set category_id = excluded.category_id, priority = excluded.priority, is_active = true
  returning id into v_id;
  perform public.write_audit_log('import.mapping_saved', 'osm_category_mapping', v_id::text,
    jsonb_build_object('tag', p_osm_key || '=' || p_osm_value, 'category_id', p_category_id));
  return v_id;
exception
  when check_violation then
    raise exception 'Étiquette OSM invalide (minuscules, chiffres, « _ », « : »)' using errcode = '22023';
end;
$$;

create or replace function public.import_toggle_mapping(p_mapping_id uuid, p_active boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.import_require_manage();
  update public.osm_category_mappings set is_active = p_active where id = p_mapping_id;
  if not found then raise exception 'Correspondance introuvable' using errcode = 'P0002'; end if;
  perform public.write_audit_log('import.mapping_toggled', 'osm_category_mapping', p_mapping_id::text,
    jsonb_build_object('active', p_active));
end;
$$;

revoke execute on function public.import_save_mapping(text, text, uuid, integer, text, text),
  public.import_toggle_mapping(uuid, boolean) from public, anon;
grant execute on function public.import_save_mapping(text, text, uuid, integer, text, text),
  public.import_toggle_mapping(uuid, boolean) to authenticated;
