"use server";
import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/features/auth/session";
import { normalizePoi } from "./normalize";
import { buildOverpassQuery, fetchOverpass, OverpassError, type Bbox } from "./overpass";
import { parseFile, parseOverpassJson } from "./parsers";
import { getCategoryRefs, getImportSources, getMappingRules } from "./queries";
import type { MappingRule, ParseResult } from "./types";

/**
 * Actions du module d'importation. Chaque action revérifie la permission imports.manage ; les écritures
 * sensibles passent par les fonctions SQL de confiance (audit, garde-fous). Aucune extraction de
 * service non réutilisable (Google Maps exclu, décision D17/D30).
 */

export type ImportState = { ok?: string; error?: string; warnings?: string[] } | null;
export type CommitProgress = {
  ok?: boolean;
  error?: string;
  processed?: number;
  remaining?: number;
  created?: number;
  updated?: number;
  skipped?: number;
  rejected?: number;
  status?: string;
};

type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const MAX_FILE_BYTES = 4 * 1024 * 1024;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const MESSAGES: Record<string, string> = {
  "42501": "Action réservée aux administrateurs des importations.",
  P0001: "Opération impossible dans l'état actuel du lot.",
  P0002: "Élément introuvable.",
  P0003: "", // message SQL explicite (limite du service public)
  "22023": "",
};

function sqlError(e: { code?: string; message?: string } | null | undefined) {
  if (!e) return "Erreur inconnue.";
  const known = MESSAGES[e.code ?? ""];
  return known || e.message || "Erreur inconnue.";
}

async function manage(): Promise<{ supabase: Supabase } | { error: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expirée : reconnectez-vous." };
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("has_permission", { p_permission: "imports.manage" });
  if (data !== true) return { error: MESSAGES["42501"]! };
  return { supabase };
}

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const uuidOrNull = (v: string) => (UUID.test(v) ? v : null);
const mode = (v: string) => (v === "publish" ? "publish" : "review");

/** Règles retenues pour des catégories (sous-catégories, ou groupes entiers). */
function rulesFor(rules: MappingRule[], slugs: string[], groups: Map<string, string[]>) {
  const wanted = new Set(slugs.flatMap((s) => [s, ...(groups.get(s) ?? [])]));
  return wanted.size ? rules.filter((r) => wanted.has(r.category_slug)) : rules;
}

interface StageMeta {
  source_key: string;
  origin: "overpass" | "upload" | "sync";
  zone_unit_id: string | null;
  category_slugs: string[];
  file_name?: string | null;
  file_format?: string | null;
  file_sha256?: string | null;
  license: string;
  license_url?: string | null;
  attribution: string;
  collected_at?: string;
  publication_mode: "review" | "publish";
  update_existing: boolean;
}

/** Crée le lot, normalise et dépose les lieux (par paquets), puis lance l'analyse en base. */
async function stageBatch(supabase: Supabase, meta: StageMeta, parsed: ParseResult) {
  const user = await getCurrentUser();
  const [rules, categories] = await Promise.all([getMappingRules(), getCategoryRefs()]);
  const { data: batch, error } = await supabase
    .from("import_batches")
    .insert({ ...meta, created_by: user?.id, status: "staging" })
    .select("id")
    .single<{ id: string }>();
  if (error || !batch) throw new Error(`Création du lot impossible : ${sqlError(error)}`);

  try {
    const drafts = parsed.pois.map((p, i) =>
      normalizePoi(p, i, { rules, categories, requireOsmId: meta.source_key === "osm" }),
    );
    for (let i = 0; i < drafts.length; i += 500) {
      const chunk = drafts.slice(i, i + 500).map((d) => ({ ...d, batch_id: batch.id }));
      const { error: e } = await supabase.from("import_items").insert(chunk);
      if (e)
        throw new Error(`Dépôt des lieux impossible (lignes ${i + 1}–${i + chunk.length}) : ${sqlError(e)}`);
    }
    const { error: e2 } = await supabase.rpc("import_analyze_batch", { p_batch_id: batch.id });
    if (e2) throw new Error(`Analyse impossible : ${sqlError(e2)}`);
  } catch (e) {
    // Le lot reste consultable (journal) avec le motif ; une nouvelle analyse est possible.
    await supabase.rpc("import_mark_failed", { p_batch_id: batch.id, p_error: (e as Error).message });
    throw e;
  }
  return batch.id;
}

async function overpassFor(
  supabase: Supabase,
  zoneId: string,
  slugs: string[],
): Promise<{ parsed: ParseResult; sourceUrl: string }> {
  const [sources, rules, cats] = await Promise.all([
    getImportSources(),
    getMappingRules(),
    supabase.from("categories").select("slug, parent:categories!categories_parent_id_fkey (slug)"),
  ]);
  const osm = sources.find((s) => s.key === "osm");
  if (!osm?.is_active || !osm.api_url) throw new Error("Source OpenStreetMap désactivée.");
  const groups = new Map<string, string[]>();
  for (const c of (cats.data as { slug: string; parent: { slug: string } | null }[] | null) ?? []) {
    if (c.parent) groups.set(c.parent.slug, [...(groups.get(c.parent.slug) ?? []), c.slug]);
  }
  const { data: bboxRows, error } = await supabase.rpc("unit_bbox", { p_unit_id: zoneId });
  const bbox = (bboxRows as Bbox[] | null)?.[0];
  if (error || !bbox)
    throw new Error("Zone sans limite ni centre connu : impossible de délimiter la recherche.");
  const query = buildOverpassQuery(bbox, rulesFor(rules, slugs, groups));
  // Créneau réservé en base : une requête par minute au plus, tous administrateurs confondus.
  const { error: rateError } = await supabase.rpc("import_reserve_request", { p_source_key: "osm" });
  if (rateError) throw new Error(sqlError(rateError));
  const json = await fetchOverpass(osm.api_url, query);
  return { parsed: parseOverpassJson(json), sourceUrl: osm.api_url };
}

// ------------------------------------------------------------ recherche en ligne
export async function startOverpassImport(_: ImportState, form: FormData): Promise<ImportState> {
  const ctx = await manage();
  if ("error" in ctx) return ctx;
  const zone = uuidOrNull(str(form, "zone_unit_id"));
  if (!zone) return { error: "Choisissez une zone." };
  const slugs = form
    .getAll("categories")
    .map(String)
    .filter((s) => /^[a-z0-9-]{1,80}$/.test(s));
  if (!slugs.length) return { error: "Choisissez au moins une catégorie." };
  let batchId: string;
  try {
    const { parsed } = await overpassFor(ctx.supabase, zone, slugs);
    if (!parsed.pois.length) return { ok: "Aucun lieu nommé trouvé pour ces critères dans OpenStreetMap." };
    batchId = await stageBatch(
      ctx.supabase,
      {
        source_key: "osm",
        origin: "overpass",
        zone_unit_id: zone,
        category_slugs: slugs,
        license: "ODbL-1.0",
        license_url: "https://opendatacommons.org/licenses/odbl/1-0/",
        attribution: "© Contributeurs OpenStreetMap",
        publication_mode: mode(str(form, "publication_mode")),
        update_existing: form.get("update_existing") === "on",
      },
      parsed,
    );
  } catch (e) {
    return { error: e instanceof OverpassError || e instanceof Error ? e.message : "Recherche impossible." };
  }
  revalidatePath("/admin/importations");
  redirect(`/admin/importations/${batchId}`);
}

// -------------------------------------------------------------- import de fichier
export async function uploadImportFile(_: ImportState, form: FormData): Promise<ImportState> {
  const ctx = await manage();
  if ("error" in ctx) return ctx;
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choisissez un fichier." };
  if (file.size > MAX_FILE_BYTES) return { error: "Fichier trop volumineux (4 Mo maximum) : découpez-le." };
  const sourceKey = str(form, "source_key");
  const sources = await getImportSources();
  const source = sources.find((s) => s.key === sourceKey && s.is_active);
  if (!source) return { error: "Source indisponible." };

  let license = source.license;
  let attribution = source.attribution;
  let licenseUrl = source.license_url;
  if (source.license_per_batch) {
    license = str(form, "license");
    attribution = str(form, "attribution");
    licenseUrl = str(form, "license_url") || null;
    if (license.length < 2 || license.length > 60)
      return { error: "Indiquez la licence du fichier (ex. CC BY 4.0)." };
    if (attribution.length < 2 || attribution.length > 200)
      return { error: "Indiquez l'attribution exigée par la source." };
    if (licenseUrl && !/^https?:\/\/\S+$/i.test(licenseUrl)) return { error: "Lien de licence invalide." };
    if (form.get("license_confirmed") !== "on") {
      return { error: "Confirmez que la licence autorise la réutilisation de ces données." };
    }
  }
  const collected = str(form, "collected_at");
  const collectedAt = /^\d{4}-\d{2}-\d{2}$/.test(collected) ? new Date(`${collected}T12:00:00Z`) : new Date();
  if (collectedAt.getTime() > Date.now() + 86_400_000) return { error: "Date de collecte dans le futur." };

  const buffer = Buffer.from(await file.arrayBuffer());
  let parsed: ParseResult;
  try {
    parsed = parseFile(file.name, buffer.toString("utf8"));
  } catch (e) {
    return { error: `Lecture impossible : ${(e as Error).message}` };
  }
  if (sourceKey === "osm" && !["osm_xml", "osm_json", "geojson"].includes(parsed.format)) {
    return { error: "Source OpenStreetMap : fichier .osm, JSON Overpass ou GeoJSON exporté d'OSM attendu." };
  }
  if (!parsed.pois.length)
    return { error: "Aucun lieu lisible dans ce fichier.", warnings: parsed.warnings.slice(0, 10) };

  let batchId: string;
  try {
    batchId = await stageBatch(
      ctx.supabase,
      {
        source_key: source.key,
        origin: "upload",
        zone_unit_id: uuidOrNull(str(form, "zone_unit_id")),
        category_slugs: [],
        file_name: file.name.slice(0, 200),
        file_format: parsed.format,
        file_sha256: createHash("sha256").update(buffer).digest("hex"),
        license,
        license_url: licenseUrl,
        attribution,
        collected_at: collectedAt.toISOString(),
        publication_mode: mode(str(form, "publication_mode")),
        update_existing: form.get("update_existing") === "on",
      },
      parsed,
    );
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/admin/importations");
  redirect(`/admin/importations/${batchId}`);
}

// --------------------------------------------------------------- contrôle du lot
export async function decideItem(_: ImportState, form: FormData): Promise<ImportState> {
  const ctx = await manage();
  if ("error" in ctx) return ctx;
  const id = uuidOrNull(str(form, "id"));
  const decision = str(form, "decision");
  if (!id || !["accept", "reject", "skip", "merge"].includes(decision))
    return { error: "Décision invalide." };
  const { error } = await ctx.supabase.rpc("import_decide_item", {
    p_item_id: id,
    p_decision: decision,
    p_category_id: uuidOrNull(str(form, "category_id")),
    p_note: str(form, "notes").slice(0, 1000) || null,
  });
  if (error) return { error: sqlError(error) };
  revalidatePath(`/admin/importations/${str(form, "batch_id")}`);
  return { ok: "Décision enregistrée." };
}

export async function reanalyzeBatch(_: ImportState, form: FormData): Promise<ImportState> {
  const ctx = await manage();
  if ("error" in ctx) return ctx;
  const id = uuidOrNull(str(form, "batch_id"));
  if (!id) return { error: "Lot invalide." };
  const { error } = await ctx.supabase.rpc("import_analyze_batch", { p_batch_id: id });
  if (error) return { error: sqlError(error) };
  revalidatePath(`/admin/importations/${id}`);
  return { ok: "Lot réanalysé (doublons et zones recalculés)." };
}

export async function cancelBatch(_: ImportState, form: FormData): Promise<ImportState> {
  const ctx = await manage();
  if ("error" in ctx) return ctx;
  const id = uuidOrNull(str(form, "batch_id"));
  if (!id) return { error: "Lot invalide." };
  const { error } = await ctx.supabase.rpc("import_cancel_batch", { p_batch_id: id });
  if (error) return { error: sqlError(error) };
  revalidatePath("/admin/importations");
  revalidatePath(`/admin/importations/${id}`);
  return { ok: "Lot annulé : aucun lieu n'a été créé." };
}

/** Importe une tranche (100 éléments) ; l'interface enchaîne les tranches et peut reprendre. */
export async function commitChunk(batchId: string): Promise<CommitProgress> {
  const ctx = await manage();
  if ("error" in ctx) return { error: ctx.error };
  if (!UUID.test(batchId)) return { error: "Lot invalide." };
  const { data, error } = await ctx.supabase.rpc("import_commit_batch", {
    p_batch_id: batchId,
    p_limit: 100,
  });
  if (error) {
    await ctx.supabase.rpc("import_mark_failed", { p_batch_id: batchId, p_error: error.message });
    return { error: `${sqlError(error)} Le lot peut être repris.` };
  }
  const r = data as Required<Omit<CommitProgress, "ok" | "error">>;
  if (r.remaining === 0) {
    revalidatePath("/admin/importations");
    revalidatePath(`/admin/importations/${batchId}`);
  }
  return { ok: true, ...r };
}

// ------------------------------------------------------------ synchronisations
export async function saveSchedule(_: ImportState, form: FormData): Promise<ImportState> {
  const ctx = await manage();
  if ("error" in ctx) return ctx;
  const zone = uuidOrNull(str(form, "zone_unit_id"));
  const interval = Number(str(form, "interval_hours"));
  const slugs = form
    .getAll("categories")
    .map(String)
    .filter((s) => /^[a-z0-9-]{1,80}$/.test(s));
  if (!zone || !Number.isInteger(interval)) return { error: "Zone et fréquence requises." };
  if (!slugs.length) return { error: "Choisissez au moins une catégorie." };
  const { error } = await ctx.supabase.rpc("import_save_schedule", {
    p_source_key: "osm",
    p_zone_unit_id: zone,
    p_category_slugs: slugs,
    p_interval_hours: interval,
    p_publication_mode: mode(str(form, "publication_mode")),
  });
  if (error) return { error: sqlError(error) };
  revalidatePath("/admin/importations");
  return { ok: "Synchronisation programmée : elle sera proposée à chaque échéance." };
}

export async function toggleSchedule(_: ImportState, form: FormData): Promise<ImportState> {
  const ctx = await manage();
  if ("error" in ctx) return ctx;
  const id = uuidOrNull(str(form, "id"));
  if (!id) return { error: "Synchronisation invalide." };
  const { error } = await ctx.supabase.rpc("import_toggle_schedule", {
    p_schedule_id: id,
    p_active: str(form, "decision") === "on",
  });
  if (error) return { error: sqlError(error) };
  revalidatePath("/admin/importations");
  return { ok: "Synchronisation mise à jour." };
}

/** Exécute une synchronisation due : nouveau lot (actualisations comprises), à contrôler avant import. */
export async function runSchedule(_: ImportState, form: FormData): Promise<ImportState> {
  const ctx = await manage();
  if ("error" in ctx) return ctx;
  const id = uuidOrNull(str(form, "id"));
  if (!id) return { error: "Synchronisation invalide." };
  const { data: s } = await ctx.supabase
    .from("import_schedules")
    .select("id, zone_unit_id, category_slugs, publication_mode, is_active, next_run_at")
    .eq("id", id)
    .maybeSingle<{
      id: string;
      zone_unit_id: string;
      category_slugs: string[];
      publication_mode: "review" | "publish";
      is_active: boolean;
      next_run_at: string;
    }>();
  if (!s?.is_active) return { error: "Synchronisation inactive." };
  if (new Date(s.next_run_at).getTime() > Date.now())
    return { error: "Pas encore due : intervalle minimal respecté." };
  let batchId: string;
  try {
    const { parsed } = await overpassFor(ctx.supabase, s.zone_unit_id, s.category_slugs);
    batchId = await stageBatch(
      ctx.supabase,
      {
        source_key: "osm",
        origin: "sync",
        zone_unit_id: s.zone_unit_id,
        category_slugs: s.category_slugs,
        license: "ODbL-1.0",
        license_url: "https://opendatacommons.org/licenses/odbl/1-0/",
        attribution: "© Contributeurs OpenStreetMap",
        publication_mode: s.publication_mode,
        update_existing: true,
      },
      parsed,
    );
    const { error } = await ctx.supabase.rpc("import_schedule_started", {
      p_schedule_id: id,
      p_batch_id: batchId,
    });
    if (error) return { error: sqlError(error) };
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath("/admin/importations");
  redirect(`/admin/importations/${batchId}`);
}

// ------------------------------------------------------- correspondances OSM
export async function saveMapping(_: ImportState, form: FormData): Promise<ImportState> {
  const ctx = await manage();
  if ("error" in ctx) return ctx;
  const tag = /^([a-z_:]{1,40})=([a-z0-9_;:.-]{1,60})$/.exec(str(form, "tag").toLowerCase());
  const cond = str(form, "condition").toLowerCase();
  const condMatch = cond ? /^([a-z_:]{1,40})=(.{1,60})$/.exec(cond) : null;
  const category = uuidOrNull(str(form, "category_id"));
  if (!tag) return { error: "Étiquette au format clé=valeur (ex. amenity=pharmacy)." };
  if (cond && !condMatch) return { error: "Condition au format clé=valeur (ex. religion=muslim)." };
  if (!category) return { error: "Choisissez une catégorie." };
  const priority = Number(str(form, "priority") || 100);
  const { error } = await ctx.supabase.rpc("import_save_mapping", {
    p_osm_key: tag[1],
    p_osm_value: tag[2],
    p_category_id: category,
    p_priority: Number.isInteger(priority) ? Math.min(Math.max(priority, 0), 1000) : 100,
    p_condition_key: condMatch?.[1] ?? null,
    p_condition_value: condMatch?.[2] ?? null,
  });
  if (error) return { error: sqlError(error) };
  revalidatePath("/admin/importations/correspondances");
  return { ok: "Correspondance enregistrée (prise en compte aux prochains imports)." };
}

export async function toggleMapping(_: ImportState, form: FormData): Promise<ImportState> {
  const ctx = await manage();
  if ("error" in ctx) return ctx;
  const id = uuidOrNull(str(form, "id"));
  if (!id) return { error: "Correspondance invalide." };
  const { error } = await ctx.supabase.rpc("import_toggle_mapping", {
    p_mapping_id: id,
    p_active: str(form, "decision") === "on",
  });
  if (error) return { error: sqlError(error) };
  revalidatePath("/admin/importations/correspondances");
  return { ok: "Correspondance mise à jour." };
}
