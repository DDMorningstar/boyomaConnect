import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const PAGE_SIZE = 25;

export interface DashboardData {
  places: {
    published: number;
    suspended: number;
    archived: number;
    verified: number;
    claimed: number;
    with_coords: number;
    new_period: number;
  };
  imported: number;
  queue: { submissions: number; claims: number; reports: number; reviews: number; media: number };
  users: { total: number; new_period: number; owners: number };
  catalog_items: number;
  series: { day: string; views: number; contacts: number; directions: number }[];
  totals: { views: number; contacts: number; directions: number; shares: number };
  top_categories: { name: string; color: string; slug: string; count: number }[];
  top_places: { id: string; slug: string; name: string; views: number }[];
  recent_activity: {
    action: string;
    entity_type: string;
    entity_id: string | null;
    created_at: string;
    actor: string | null;
  }[];
}

export async function getDashboard(days = 30): Promise<DashboardData | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_dashboard", { p_days: days });
  if (error) return null;
  return data as DashboardData;
}

/** Compteurs des files d'attente (badges de la barre latérale), selon les droits de chacun. */
export async function getQueueCounts() {
  const supabase = await createSupabaseServerClient();
  const head = { count: "exact" as const, head: true };
  const [subs, claims, reports, reviews, media] = await Promise.all([
    supabase.from("place_submissions").select("id", head).eq("status", "pending"),
    supabase.from("place_claims").select("id", head).eq("status", "pending"),
    supabase.from("place_reports").select("id", head).eq("status", "open"),
    supabase.from("reviews").select("id", head).eq("status", "pending"),
    supabase.from("place_media").select("id", head).eq("moderation_status", "pending"),
  ]);
  return {
    moderation: (subs.count ?? 0) + (claims.count ?? 0),
    reports: reports.count ?? 0,
    reviews: reviews.count ?? 0,
    media: media.count ?? 0,
  };
}

// ------------------------------------------------------------------- lieux
export interface AdminPlaceRow {
  id: string;
  slug: string;
  name: string;
  publication_status: string;
  verification_status: string;
  ownership_status: string;
  activity_status: string;
  updated_at: string;
  logo_path: string | null;
  primary_category: { name: string; color: string; icon: string } | null;
  unit: { name: string; type_key: string } | null;
  place_external_refs: { source: string }[];
}

export interface PlaceFilters {
  q?: string;
  statut?: string;
  verification?: string;
  categorie?: string;
  source?: string;
  page: number;
}

export async function listPlaces(f: PlaceFilters) {
  const supabase = await createSupabaseServerClient();
  const imported = f.source === "osm";
  let query = supabase
    .from("places")
    .select(
      `id, slug, name, publication_status, verification_status, ownership_status, activity_status, updated_at, logo_path,
       primary_category:categories!places_primary_category_id_fkey (name, color, icon),
       unit:geographic_units!places_administrative_unit_id_fkey (name, type_key),
       place_external_refs${imported ? "!inner" : ""} (source)`,
      { count: "exact" },
    )
    .is("merged_into_id", null);
  if (f.q) query = query.ilike("name", `%${f.q.replace(/[%_]/g, "")}%`);
  if (f.statut) query = query.eq("publication_status", f.statut);
  if (f.verification === "verifie") query = query.neq("verification_status", "unverified");
  if (f.verification === "non-verifie") query = query.eq("verification_status", "unverified");
  if (f.source === "proprietaire") query = query.eq("ownership_status", "claimed");
  if (f.categorie) {
    const { data: cat } = await supabase
      .from("categories")
      .select("id")
      .eq("slug", f.categorie)
      .maybeSingle();
    if (cat) query = query.eq("primary_category_id", cat.id);
  }
  const from = (f.page - 1) * PAGE_SIZE;
  const { data, count, error } = await query
    .order("updated_at", { ascending: false })
    .range(from, from + PAGE_SIZE - 1)
    .overrideTypes<AdminPlaceRow[], { merge: false }>();
  return { rows: error ? [] : (data ?? []), total: count ?? 0, error: error?.message ?? null };
}

export interface AdminPlace {
  id: string;
  slug: string;
  name: string;
  official_name: string | null;
  short_description: string | null;
  full_description: string | null;
  primary_category_id: string | null;
  administrative_unit_id: string | null;
  address_text: string | null;
  landmark_description: string | null;
  directions: string | null;
  latitude: number | null;
  longitude: number | null;
  geographic_precision: string;
  coordinates_source: string;
  publication_status: string;
  verification_status: string;
  ownership_status: string;
  activity_status: string;
  rejection_reason: string | null;
  logo_path: string | null;
  created_at: string;
  updated_at: string;
  published_at: string | null;
  last_verified_at: string | null;
  place_contacts: { kind: string; value: string }[];
  place_external_refs: { source: string; external_id: string; source_url: string | null }[];
  place_owners: { user_id: string; role: string }[];
  place_media: { id: string; storage_path: string; moderation_status: string }[];
  catalog_items: { id: string }[];
}

export async function getAdminPlace(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const supabase = await createSupabaseServerClient();
  const [{ data: place }, { data: history }] = await Promise.all([
    supabase
      .from("places")
      .select(
        `id, slug, name, official_name, short_description, full_description, primary_category_id, administrative_unit_id,
         address_text, landmark_description, directions, latitude, longitude, geographic_precision, coordinates_source,
         publication_status, verification_status, ownership_status, activity_status, rejection_reason, logo_path,
         created_at, updated_at, published_at, last_verified_at,
         place_contacts (kind, value), place_external_refs (source, external_id, source_url),
         place_owners (user_id, role), place_media (id, storage_path, moderation_status), catalog_items (id)`,
      )
      .eq("id", id)
      .maybeSingle<AdminPlace>(),
    supabase
      .from("place_history")
      .select("id, operation, changes, created_at, actor_id")
      .eq("place_id", id)
      .order("created_at", { ascending: false })
      .limit(15),
  ]);
  if (!place) return null;
  const rows: {
    id: number;
    operation: string;
    changes: Record<string, unknown>;
    created_at: string;
    actor_id: string | null;
  }[] = history ?? [];
  const names = await profileNames(
    rows.map((h) => h.actor_id).concat(place.place_owners.map((o) => o.user_id)),
  );
  return { place, history: rows, names };
}

export async function getGeoOptions() {
  const supabase = await createSupabaseServerClient();
  const [{ data: cats }, { data: units }] = await Promise.all([
    supabase.from("categories").select("id, name, slug, icon, parent_id, sort_order").order("sort_order"),
    supabase
      .from("geographic_units")
      .select("id, name, type_key")
      .in("type_key", ["ville", "commune"])
      .order("sort_order"),
  ]);
  const all: { id: string; name: string; slug: string; icon: string; parent_id: string | null }[] =
    cats ?? [];
  return {
    groups: all
      .filter((c) => !c.parent_id)
      .map((p) => ({ id: p.id, name: p.name, children: all.filter((c) => c.parent_id === p.id) })),
    units: (units ?? []) as { id: string; name: string; type_key: string }[],
  };
}

export async function profileNames(ids: (string | null)[]) {
  const unique = [...new Set(ids.filter((x): x is string => Boolean(x)))];
  if (!unique.length) return new Map<string, string | null>();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("profiles").select("id, display_name").in("id", unique);
  return new Map(
    ((data ?? []) as { id: string; display_name: string | null }[]).map((p) => [p.id, p.display_name]),
  );
}

// ------------------------------------------------------------- utilisateurs
export interface AdminUserRow {
  id: string;
  email: string;
  display_name: string | null;
  avatar_url: string | null;
  status: "active" | "suspended";
  roles: string[];
  providers: string[];
  created_at: string;
  last_sign_in_at: string | null;
  places_count: number;
  total_count: number;
}

export async function listUsers(q: string | undefined, role: string | undefined, page: number) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("admin_list_users", {
    p_query: q ?? null,
    p_role: role ?? null,
    p_limit: PAGE_SIZE,
    p_offset: (page - 1) * PAGE_SIZE,
  });
  const rows: AdminUserRow[] = data ?? [];
  return { rows, total: rows[0]?.total_count ?? 0, error: error?.message ?? null };
}

export async function listRoles() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("roles").select("key, name, description, rank").order("rank");
  return (data ?? []) as { key: string; name: string; description: string | null; rank: number }[];
}

// ------------------------------------------------------------- signalements
export async function listReports(status: string, page: number) {
  const supabase = await createSupabaseServerClient();
  const from = (page - 1) * PAGE_SIZE;
  const { data, count } = await supabase
    .from("place_reports")
    .select(
      "id, reason, details, status, created_at, handled_at, resolution_notes, place:places (id, slug, name)",
      {
        count: "exact",
      },
    )
    .eq("status", status)
    .order("created_at", { ascending: status === "open" })
    .range(from, from + PAGE_SIZE - 1);
  return {
    rows: (data ?? []) as unknown as {
      id: string;
      reason: string;
      details: string | null;
      status: string;
      created_at: string;
      handled_at: string | null;
      resolution_notes: string | null;
      place: { id: string; slug: string; name: string } | null;
    }[],
    total: count ?? 0,
  };
}

// -------------------------------------------------------------------- avis
export async function listReviews(status: string, page: number) {
  const supabase = await createSupabaseServerClient();
  const from = (page - 1) * PAGE_SIZE;
  const { data, count } = await supabase
    .from("reviews")
    .select(
      "id, rating, title, body, status, created_at, moderation_reason, author_id, place:places (id, slug, name)",
      { count: "exact" },
    )
    .eq("status", status)
    .order("created_at", { ascending: status === "pending" })
    .range(from, from + PAGE_SIZE - 1);
  const rows = (data ?? []) as unknown as {
    id: string;
    rating: number;
    title: string | null;
    body: string | null;
    status: string;
    created_at: string;
    moderation_reason: string | null;
    author_id: string;
    place: { id: string; slug: string; name: string } | null;
  }[];
  return { rows, total: count ?? 0, names: await profileNames(rows.map((r) => r.author_id)) };
}

// ------------------------------------------------------------------ photos
export async function listMedia(status: string, page: number) {
  const supabase = await createSupabaseServerClient();
  const from = (page - 1) * 24;
  const { data, count } = await supabase
    .from("place_media")
    .select(
      "id, storage_path, kind, moderation_status, created_at, uploaded_by, place:places (id, slug, name)",
      {
        count: "exact",
      },
    )
    .eq("moderation_status", status)
    .order("created_at", { ascending: false })
    .range(from, from + 23);
  return {
    rows: (data ?? []) as unknown as {
      id: string;
      storage_path: string;
      kind: string;
      moderation_status: string;
      created_at: string;
      place: { id: string; slug: string; name: string } | null;
    }[],
    total: count ?? 0,
  };
}

// --------------------------------------------------------------- catégories
export async function listCategories() {
  const supabase = await createSupabaseServerClient();
  const [{ data: cats }, { data: counts }] = await Promise.all([
    supabase
      .from("categories")
      .select("id, parent_id, name, slug, icon, color, sort_order, is_active, is_featured")
      .order("sort_order"),
    supabase.rpc("category_place_counts"),
  ]);
  const byId = new Map(
    ((counts ?? []) as { category_id: string; place_count: number }[]).map((c) => [
      c.category_id,
      Number(c.place_count),
    ]),
  );
  const all = (
    (cats ?? []) as {
      id: string;
      parent_id: string | null;
      name: string;
      slug: string;
      icon: string;
      color: string;
      sort_order: number;
      is_active: boolean;
      is_featured: boolean;
    }[]
  ).map((c) => ({ ...c, count: byId.get(c.id) ?? 0 }));
  return all
    .filter((c) => !c.parent_id)
    .map((p) => ({ ...p, children: all.filter((c) => c.parent_id === p.id) }));
}

// ----------------------------------------------------------------- journal
export async function listAudit(action: string | undefined, page: number) {
  const supabase = await createSupabaseServerClient();
  const from = (page - 1) * 40;
  let query = supabase
    .from("audit_logs")
    .select("id, actor_id, action, entity_type, entity_id, details, created_at", { count: "exact" })
    .order("created_at", { ascending: false })
    .range(from, from + 39);
  if (action) query = query.like("action", `${action.replace(/[%_]/g, "")}%`);
  const { data, count } = await query;
  const rows = (data ?? []) as {
    id: number;
    actor_id: string | null;
    action: string;
    entity_type: string;
    entity_id: string | null;
    details: Record<string, unknown>;
    created_at: string;
  }[];
  return { rows, total: count ?? 0, names: await profileNames(rows.map((r) => r.actor_id)) };
}

// -------------------------------------------------------------- paramètres
export async function listSettings() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("application_settings")
    .select("key, value, description, is_public, updated_at")
    .order("key");
  return (data ?? []) as {
    key: string;
    value: unknown;
    description: string | null;
    is_public: boolean;
    updated_at: string;
  }[];
}
