import "server-only";
import type { CatalogEntry } from "@/features/catalog/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCategoriesWithCounts, getCityWithCommunes } from "@/features/places/queries";
import { getZones } from "@/features/zones/queries";
import { zoneTitle } from "@/features/zones/zones";

/** Article du catalogue (voir src/features/catalog/format.ts). */
export type CatalogItem = CatalogEntry;

export interface OwnedPlaceSummary {
  role: "owner" | "manager";
  place: {
    id: string;
    slug: string;
    name: string;
    publication_status: string;
    logo_path: string | null;
    primary_category: { name: string } | null;
  } | null;
}

export interface MySubmission {
  id: string;
  name: string;
  status: "pending" | "approved" | "rejected" | "needs_changes" | "duplicate";
  review_notes: string | null;
  created_at: string;
  resulting_place_id: string | null;
}

export interface MyClaim {
  id: string;
  status: "pending" | "approved" | "rejected" | "cancelled";
  review_notes: string | null;
  created_at: string;
  place: { slug: string; name: string } | null;
}

/** Tableau de bord du propriétaire : fiches gérées, demandes de création, réclamations. */
export async function getOwnerDashboard(userId: string) {
  const supabase = await createSupabaseServerClient();
  const [owned, submissions, claims] = await Promise.all([
    supabase
      .from("place_owners")
      .select(
        "role, place:places (id, slug, name, publication_status, logo_path, primary_category:categories!places_primary_category_id_fkey (name))",
      )
      .eq("user_id", userId)
      .overrideTypes<OwnedPlaceSummary[], { merge: false }>(),
    supabase
      .from("place_submissions")
      .select("id, name, status, review_notes, created_at, resulting_place_id")
      .eq("submitted_by", userId)
      .eq("owner_request", true)
      .neq("status", "approved")
      .order("created_at", { ascending: false })
      .overrideTypes<MySubmission[], { merge: false }>(),
    supabase
      .from("place_claims")
      .select("id, status, review_notes, created_at, place:places (slug, name)")
      .eq("claimant_id", userId)
      .neq("status", "approved")
      .order("created_at", { ascending: false })
      .overrideTypes<MyClaim[], { merge: false }>(),
  ]);
  return {
    places: (owned.data ?? []).filter((o) => o.place),
    submissions: submissions.data ?? [],
    claims: claims.data ?? [],
  };
}

export interface ManagedPlace {
  id: string;
  slug: string;
  name: string;
  publication_status: string;
  short_description: string | null;
  full_description: string | null;
  address_text: string | null;
  landmark_description: string | null;
  directions: string | null;
  price_range: number | null;
  currency: "USD" | "CDF" | null;
  payment_methods: string[];
  logo_path: string | null;
  primary_category: { name: string } | null;
  place_contacts: { id: string; kind: string; value: string }[];
  place_media: {
    id: string;
    storage_path: string;
    kind: string;
    moderation_status: string;
    sort_order: number;
  }[];
  catalog_items: CatalogItem[];
}

/** Fiche gérée par l'utilisateur courant (null s'il n'en est pas gestionnaire). */
export async function getManagedPlace(placeId: string, userId: string): Promise<ManagedPlace | null> {
  if (!/^[0-9a-f-]{36}$/i.test(placeId)) return null;
  const supabase = await createSupabaseServerClient();
  const { data: link } = await supabase
    .from("place_owners")
    .select("place_id")
    .eq("place_id", placeId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!link) return null;
  const { data } = await supabase
    .from("places")
    .select(
      `id, slug, name, publication_status, short_description, full_description, address_text,
       landmark_description, directions, price_range, currency, payment_methods, logo_path,
       primary_category:categories!places_primary_category_id_fkey (name),
       place_contacts (id, kind, value),
       place_media (id, storage_path, kind, moderation_status, sort_order),
       catalog_items (id, kind, name, description, category_label, price, currency, price_type, price_unit, availability, photo_paths, is_featured, sort_order, is_published)`,
    )
    .eq("id", placeId)
    .order("sort_order", { referencedTable: "place_media" })
    .order("sort_order", { referencedTable: "catalog_items" })
    .maybeSingle<ManagedPlace>();
  return data;
}

/**
 * Catégories (sous-catégories groupées) et rattachements possibles pour les formulaires :
 * communes de chaque ville de la province, puis territoires (décision D29).
 */
export async function getListingFormOptions() {
  const [categories, zones] = await Promise.all([getCategoriesWithCounts(), getZones()]);
  const cities = await Promise.all(
    zones.filter((z) => z.type_key === "ville").map((z) => getCityWithCommunes(z.slug)),
  );
  const territories = zones.filter((z) => z.type_key === "territoire");
  const parents = categories.filter((c) => !c.parent_id);
  return {
    groups: parents.map((p) => ({
      id: p.id,
      name: p.name,
      children: categories.filter((c) => c.parent_id === p.id).map((c) => ({ id: c.id, name: c.name })),
    })),
    areas: [
      ...cities
        .filter((c): c is NonNullable<typeof c> => Boolean(c && c.communes.length))
        .map((c) => ({
          label: `${c.city.name} — communes`,
          /** Ville de ces communes (sert à la détection des doublons importés, rattachés à la ville). */
          cityId: c.city.id,
          options: c.communes.map((m) => ({ id: m.unit_id, name: m.name })),
        })),
      ...(territories.length
        ? [
            {
              label: "Territoires de la Tshopo",
              cityId: null,
              options: territories.map((t) => ({ id: t.id, name: zoneTitle(t) })),
            },
          ]
        : []),
    ],
  };
}
