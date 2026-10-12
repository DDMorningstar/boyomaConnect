import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { CategoryRef, MappingRule } from "./types";

/** Lectures du module d'importation (RLS : imports.view ou imports.manage). */

export const ITEMS_PAGE_SIZE = 50;

export interface ImportSource {
  key: string;
  name: string;
  kind: "osm" | "open_data" | "partner" | "owner";
  license: string;
  license_url: string | null;
  attribution: string;
  share_alike: boolean;
  homepage: string | null;
  api_url: string | null;
  min_request_interval_seconds: number;
  min_sync_interval_hours: number;
  license_per_batch: boolean;
  is_active: boolean;
  notes: string | null;
}

export interface ImportBatch {
  id: string;
  source_key: string;
  origin: "overpass" | "upload" | "sync";
  status: "staging" | "ready" | "importing" | "completed" | "failed" | "cancelled";
  zone_unit_id: string | null;
  category_slugs: string[];
  file_name: string | null;
  file_format: string | null;
  license: string;
  license_url: string | null;
  attribution: string;
  collected_at: string;
  publication_mode: "review" | "publish";
  update_existing: boolean;
  total_count: number;
  created_count: number;
  updated_count: number;
  skipped_count: number;
  rejected_count: number;
  quarantined_count: number;
  attempts: number;
  error: string | null;
  schedule_id: string | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
  zone: { name: string; type_key: string } | null;
  source: { name: string } | null;
}

export type ItemStatus =
  "ready" | "existing" | "duplicate" | "quarantined" | "rejected" | "imported" | "updated" | "skipped";

export interface ImportItem {
  id: string;
  row_index: number;
  external_id: string | null;
  name: string | null;
  mapping_rule: string | null;
  latitude: number | null;
  longitude: number | null;
  geographic_precision: string;
  address: string | null;
  phones: string[];
  website: string | null;
  email: string | null;
  image_url: string | null;
  opening_hours: string | null;
  issues: string[];
  status: ItemStatus;
  match_reason: string | null;
  match_score: number | null;
  error: string | null;
  decision_note: string | null;
  category: { id: string; name: string } | null;
  unit: { name: string; type_key: string } | null;
  match: { id: string; slug: string; name: string } | null;
  place: { id: string; slug: string; publication_status: string } | null;
}

export interface ImportSchedule {
  id: string;
  source_key: string;
  category_slugs: string[];
  interval_hours: number;
  publication_mode: "review" | "publish";
  is_active: boolean;
  next_run_at: string;
  last_batch_id: string | null;
  zone: { id: string; name: string; type_key: string } | null;
}

const BATCH_SELECT = `*, zone:geographic_units!import_batches_zone_unit_id_fkey (name, type_key),
  source:import_sources!import_batches_source_key_fkey (name)`;

export async function getImportOverview() {
  const supabase = await createSupabaseServerClient();
  const [batches, schedules, sources] = await Promise.all([
    supabase
      .from("import_batches")
      .select(BATCH_SELECT)
      .order("created_at", { ascending: false })
      .limit(50)
      .overrideTypes<ImportBatch[], { merge: false }>(),
    supabase
      .from("import_schedules")
      .select(
        "id, source_key, category_slugs, interval_hours, publication_mode, is_active, next_run_at, last_batch_id, zone:geographic_units!import_schedules_zone_unit_id_fkey (id, name, type_key)",
      )
      .order("next_run_at")
      .overrideTypes<ImportSchedule[], { merge: false }>(),
    getImportSources(),
  ]);
  const error = batches.error?.message ?? schedules.error?.message ?? null;
  return { batches: batches.data ?? [], schedules: schedules.data ?? [], sources, error };
}

export async function getImportSources(): Promise<ImportSource[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("import_sources").select("*").order("created_at");
  return (data as ImportSource[] | null) ?? [];
}

export async function getBatch(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createSupabaseServerClient();
  const [{ data: batch }, { data: statuses }] = await Promise.all([
    supabase.from("import_batches").select(BATCH_SELECT).eq("id", id).maybeSingle<ImportBatch>(),
    supabase.from("import_items").select("status").eq("batch_id", id).limit(10000),
  ]);
  if (!batch) return null;
  const counts: Partial<Record<ItemStatus, number>> = {};
  for (const r of (statuses as { status: ItemStatus }[] | null) ?? [])
    counts[r.status] = (counts[r.status] ?? 0) + 1;
  return { batch, counts };
}

export async function listItems(batchId: string, status: string | undefined, page: number) {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("import_items")
    .select(
      `id, row_index, external_id, name, mapping_rule, latitude, longitude, geographic_precision, address, phones,
       website, email, image_url, opening_hours, issues, status, match_reason, match_score, error, decision_note,
       category:categories!import_items_category_id_fkey (id, name),
       unit:geographic_units!import_items_unit_id_fkey (name, type_key),
       match:places!import_items_match_place_id_fkey (id, slug, name),
       place:places!import_items_place_id_fkey (id, slug, publication_status)`,
      { count: "exact" },
    )
    .eq("batch_id", batchId)
    .order("row_index")
    .range((page - 1) * ITEMS_PAGE_SIZE, page * ITEMS_PAGE_SIZE - 1);
  if (status) q = q.eq("status", status);
  const { data, count, error } = await q.overrideTypes<ImportItem[], { merge: false }>();
  return { rows: data ?? [], total: count ?? 0, error: error?.message ?? null };
}

/** Règles actives (avec le slug de catégorie) pour la normalisation et les requêtes Overpass. */
export async function getMappingRules(): Promise<MappingRule[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("osm_category_mappings")
    .select(
      "osm_key, osm_value, condition_key, condition_value, category_id, priority, category:categories (slug)",
    )
    .eq("is_active", true)
    .overrideTypes<
      (Omit<MappingRule, "category_slug"> & { category: { slug: string } | null })[],
      { merge: false }
    >();
  return (data ?? []).map(({ category, ...r }) => ({ ...r, category_slug: category?.slug ?? "" }));
}

export interface MappingRow {
  id: string;
  osm_key: string;
  osm_value: string;
  condition_key: string | null;
  condition_value: string | null;
  priority: number;
  is_active: boolean;
  category: { id: string; name: string; slug: string } | null;
}

export async function listMappings(): Promise<MappingRow[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("osm_category_mappings")
    .select(
      "id, osm_key, osm_value, condition_key, condition_value, priority, is_active, category:categories (id, name, slug)",
    )
    .order("osm_key")
    .order("osm_value")
    .overrideTypes<MappingRow[], { merge: false }>();
  return data ?? [];
}

export async function getCategoryRefs(): Promise<CategoryRef[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("categories").select("id, slug, name").eq("is_active", true);
  return (data as CategoryRef[] | null) ?? [];
}

export interface CategoryGroup {
  id: string;
  name: string;
  slug: string;
  children: { id: string; name: string; slug: string }[];
}

export interface ZoneOption {
  id: string;
  name: string;
  type_key: string;
  parent_name: string | null;
}

/**
 * Options des formulaires : catégories groupées et zones interrogeables (provinces, villes, territoires
 * de toute la RDC présents dans le référentiel : le module n'est pas limité à la Tshopo).
 */
export async function getImportFormOptions() {
  const supabase = await createSupabaseServerClient();
  const [cats, units] = await Promise.all([
    supabase
      .from("categories")
      .select("id, slug, name, parent_id, sort_order")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("geographic_units")
      .select("id, name, type_key, depth, parent:geographic_units!geographic_units_parent_id_fkey (name)")
      .in("type_key", ["province", "ville", "territoire"])
      .eq("is_active", true)
      .order("depth")
      .order("name"),
  ]);
  type Cat = { id: string; slug: string; name: string; parent_id: string | null };
  const all = (cats.data as Cat[] | null) ?? [];
  const groups: CategoryGroup[] = all
    .filter((c) => !c.parent_id)
    .map((p) => ({
      id: p.id,
      name: p.name,
      slug: p.slug,
      children: all.filter((c) => c.parent_id === p.id).map(({ id, name, slug }) => ({ id, name, slug })),
    }));
  const zones: ZoneOption[] = (
    (units.data as
      { id: string; name: string; type_key: string; parent: { name: string } | null }[] | null) ?? []
  ).map((u) => ({ id: u.id, name: u.name, type_key: u.type_key, parent_name: u.parent?.name ?? null }));
  return { groups, zones };
}
