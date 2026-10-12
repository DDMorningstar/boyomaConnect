import "server-only";
import { cache } from "react";
import { createSupabasePublicClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { PAGE_SIZE, type ParsedSearch } from "@/lib/search-params";
import type {
  Category,
  CategoryWithCount,
  GeoUnit,
  PlaceDetail,
  PlaceSearchRow,
  PublicReview,
} from "@/types/places";

export class DataError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown,
  ) {
    super(message);
    this.name = "DataError";
  }
}

const CATEGORY_FIELDS = "id, parent_id, name, slug, description, icon, color, sort_order, is_featured";

/**
 * Catégories actives + nombre réel de lieux publiés (les parentes cumulent leurs enfants),
 * dans une zone si `unitId` est fourni (descendants compris).
 */
export const getCategoriesWithCounts = cache(async (unitId?: string): Promise<CategoryWithCount[]> => {
  const supabase = await createSupabaseServerClient();
  const [cats, counts] = await Promise.all([
    supabase
      .from("categories")
      .select(CATEGORY_FIELDS)
      .order("sort_order")
      .overrideTypes<Category[], { merge: false }>(),
    supabase.rpc("category_place_counts", { p_unit_id: unitId ?? null }),
  ]);
  if (cats.error) throw new DataError("Impossible de charger les catégories", cats.error);
  if (counts.error) throw new DataError("Impossible de compter les lieux", counts.error);
  const countRows: { category_id: string; place_count: number }[] = counts.data ?? [];
  const byId = new Map(countRows.map((c) => [c.category_id, Number(c.place_count)]));
  return (cats.data ?? []).map((c) => ({ ...c, place_count: byId.get(c.id) ?? 0 }));
});

export const getCategoryBySlug = cache(async (slug: string, unitId?: string) => {
  const all = await getCategoriesWithCounts(unitId);
  const category = all.find((c) => c.slug === slug) ?? null;
  if (!category) return null;
  const children = all.filter((c) => c.parent_id === category.id);
  const parent = category.parent_id ? (all.find((c) => c.id === category.parent_id) ?? null) : null;
  return { category, children, parent };
});

/** Ville par défaut (Kisangani) et ses communes avec le nombre de lieux publiés. */
export const getCityWithCommunes = cache(async (citySlug = "kisangani") => {
  const supabase = await createSupabaseServerClient();
  const { data: city, error } = await supabase
    .from("geographic_units")
    .select("id, name, slug, type_key, parent_id, center_latitude, center_longitude, default_zoom")
    .eq("slug", citySlug)
    .eq("type_key", "ville")
    .maybeSingle<GeoUnit>();
  if (error) throw new DataError("Impossible de charger la ville", error);
  if (!city) return null;
  const { data, error: e2 } = await supabase.rpc("unit_place_counts", { p_parent_id: city.id });
  if (e2) throw new DataError("Impossible de charger les communes", e2);
  const communes: { unit_id: string; slug: string; name: string; place_count: number }[] = data ?? [];
  return {
    city,
    communes: communes.map((c) => ({ ...c, place_count: Number(c.place_count) })),
  };
});

export const getCommuneBySlug = cache(async (slug: string, citySlug = "kisangani") => {
  const data = await getCityWithCommunes(citySlug);
  if (!data) return null;
  const commune = data.communes.find((c) => c.slug === slug);
  return commune ? { city: data.city, commune } : null;
});

export async function searchPlaces(params: ParsedSearch & { categorySlug?: string; unitId?: string }) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_places", {
    p_query: params.q ?? null,
    p_category_slug: params.categorySlug ?? params.categorie ?? null,
    p_unit_id: params.unitId ?? params.commune ?? null,
    p_latitude: params.lat ?? null,
    p_longitude: params.lng ?? null,
    p_open_now: params.ouvert,
    p_verified_only: params.verifie,
    p_sort: params.tri,
    p_limit: PAGE_SIZE,
    p_offset: (params.page - 1) * PAGE_SIZE,
  });
  if (error) throw new DataError("La recherche a échoué", error);
  const rows: PlaceSearchRow[] = data ?? [];
  return { rows: await withOpenStatus(rows), total: rows[0] ? Number(rows[0].total_count) : 0 };
}

/**
 * Ajoute « ouvert / fermé » aux lieux dont les horaires sont connus (heure de Kisangani).
 * Non bloquant : sans réponse, les cartes s'affichent simplement sans ce badge.
 */
async function withOpenStatus<T extends { id: string }>(
  rows: T[],
): Promise<(T & { is_open?: boolean | null })[]> {
  if (!rows.length) return rows;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("places_open_status", { p_place_ids: rows.map((r) => r.id) });
  const byId = new Map(
    ((data as { place_id: string; is_open: boolean | null }[] | null) ?? []).map((r) => [
      r.place_id,
      r.is_open,
    ]),
  );
  return rows.map((r) => (byId.has(r.id) ? { ...r, is_open: byId.get(r.id) } : r));
}

export const getRecentPlaces = cache(async (limit = 8, unitId?: string): Promise<PlaceSearchRow[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("search_places", {
    p_sort: "recent",
    p_limit: limit,
    p_unit_id: unitId ?? null,
  });
  if (error) throw new DataError("Impossible de charger les lieux récents", error);
  return withOpenStatus((data as PlaceSearchRow[] | null) ?? []);
});

export interface PopularPlace {
  id: string;
  slug: string;
  name: string;
  short_description: string | null;
  cover_path: string | null;
  logo_path: string | null;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  unit_name: string | null;
  score: number;
  is_open?: boolean | null;
}

export const getPopularPlaces = cache(async (limit = 8, unitId?: string): Promise<PopularPlace[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("popular_places", {
    p_days: 30,
    p_limit: limit,
    p_unit_id: unitId ?? null,
  });
  if (error) throw new DataError("Impossible de charger les lieux populaires", error);
  return withOpenStatus((data as PopularPlace[] | null) ?? []);
});

export interface SponsoredPlace {
  campaign_id: string;
  place_id: string;
  slug: string;
  name: string;
  short_description: string | null;
  cover_path: string | null;
}

export const getSponsoredPlaces = cache(async (): Promise<SponsoredPlace[]> => {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("active_sponsored_places", {
    p_placement: "home_featured",
    p_limit: 3,
  });
  if (error) return []; // non bloquant : l'accueil reste utilisable sans publicité
  return data ?? [];
});

const PLACE_DETAIL_SELECT = `
  id, slug, name, official_name, short_description, full_description, address_text, landmark_description,
  directions, latitude, longitude, geographic_precision, verification_status, activity_status, ownership_status,
  price_range, currency, payment_methods, wheelchair_accessible, accessibility_notes, hours_verified_at,
  cover_path, logo_path, rating_avg, rating_count, published_at, last_verified_at, updated_at,
  primary_category:categories!places_primary_category_id_fkey (id, name, slug, icon, color),
  unit:geographic_units!places_administrative_unit_id_fkey (id, name, slug, type_key,
    parent:parent_id (name, slug, type_key)),
  place_categories (category:categories (id, name, slug, icon, color)),
  place_contacts (id, kind, value, label, is_primary, verified_at, sort_order),
  place_hours (day_of_week, opens_at, closes_at, is_closed),
  place_services (id, name, description, sort_order),
  place_media (id, storage_path, kind, caption, width, height, sort_order),
  place_amenity_links (amenity:place_amenities (key, name, icon)),
  place_external_refs (source, license, attribution, source_url),
  catalog_items (id, kind, name, description, price, currency, availability, sort_order)
`;

export type PlaceLookup =
  { kind: "found"; place: PlaceDetail } | { kind: "redirect"; slug: string } | { kind: "not_found" };

export const getPlaceBySlug = cache(async (slug: string): Promise<PlaceLookup> => {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 120) return { kind: "not_found" };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("places")
    .select(PLACE_DETAIL_SELECT)
    .eq("slug", slug)
    .order("sort_order", { referencedTable: "place_contacts" })
    .order("sort_order", { referencedTable: "place_services" })
    .order("sort_order", { referencedTable: "place_media" })
    .order("sort_order", { referencedTable: "catalog_items" })
    .maybeSingle<PlaceDetail>();
  if (error) throw new DataError("Impossible de charger la fiche", error);
  if (data) return { kind: "found", place: data };

  const { data: current } = await supabase.rpc("resolve_place_slug", { p_slug: slug });
  if (typeof current === "string" && current !== slug) return { kind: "redirect", slug: current };
  return { kind: "not_found" };
});

export async function getPublicReviews(placeId: string, limit = 10): Promise<PublicReview[]> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("place_public_reviews", {
    p_place_id: placeId,
    p_limit: limit,
    p_offset: 0,
  });
  if (error) return [];
  return data ?? [];
}

export interface ShareCardData {
  name: string;
  logo_path: string | null;
  cover_path: string | null;
  ownership_status: string;
  primary_category: { name: string; color: string } | null;
  unit: { name: string; type_key: string; parent: { name: string; type_key: string } | null } | null;
  place_contacts: { kind: string; value: string; is_primary: boolean }[];
  place_media: { storage_path: string; kind: string }[];
  catalog_items: { price: number | null; currency: string | null }[];
}

/** Données publiques pour l'image de partage (client sans session : lieux publiés seulement). */
export async function getShareCardData(slug: string): Promise<ShareCardData | null> {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length > 120) return null;
  const supabase = createSupabasePublicClient();
  const { data } = await supabase
    .from("places")
    .select(
      `name, logo_path, cover_path, ownership_status,
       primary_category:categories!places_primary_category_id_fkey (name, color),
       unit:geographic_units!places_administrative_unit_id_fkey (name, type_key,
         parent:parent_id (name, type_key)),
       place_contacts (kind, value, is_primary),
       place_media (storage_path, kind),
       catalog_items (price, currency)`,
    )
    .eq("slug", slug)
    .eq("publication_status", "published")
    .maybeSingle<ShareCardData>();
  return data;
}

/** Slugs publiés pour le sitemap (pagination serveur). */
export async function getPublishedPlaceSlugs(limit = 5000) {
  const supabase = createSupabasePublicClient();
  const { data, error } = await supabase
    .from("places")
    .select("slug, updated_at")
    .eq("publication_status", "published")
    .is("merged_into_id", null)
    .order("updated_at", { ascending: false })
    .limit(limit);
  if (error) throw new DataError("Impossible de générer le sitemap", error);
  return data ?? [];
}
