import "server-only";
import { cache } from "react";
import { cookies } from "next/headers";
import { createSupabasePublicClient, createSupabaseServerClient } from "@/lib/supabase/server";
import { DataError, getCityWithCommunes } from "@/features/places/queries";
import type { ParsedSearch } from "@/lib/search-params";
import { DEFAULT_ZONE, PROVINCE_SLUG, ZONE_COOKIE, isZoneSlug, type Zone, type ZoneType } from "./zones";

const FIELDS = "id, name, slug, type_key, center_latitude, center_longitude, default_zoom";

type UnitRow = Omit<Zone, "place_count" | "default_zoom" | "type_key"> & {
  type_key: ZoneType;
  default_zoom: number | string | null; // numeric → chaîne via PostgREST
};

const toZone = (u: UnitRow, place_count: number): Zone => ({
  ...u,
  default_zoom: u.default_zoom == null ? null : Number(u.default_zoom),
  place_count,
});

/** Province + sa ville et ses territoires, avec le nombre réel de lieux publiés (descendants compris). */
export const getZones = cache(async (): Promise<Zone[]> => {
  const supabase = await createSupabaseServerClient();
  const { data: province, error } = await supabase
    .from("geographic_units")
    .select(FIELDS)
    .eq("slug", PROVINCE_SLUG)
    .eq("type_key", "province")
    .maybeSingle<UnitRow>();
  if (error) throw new DataError("Impossible de charger la province", error);
  if (!province) return [];
  const [children, counts] = await Promise.all([
    supabase
      .from("geographic_units")
      .select(FIELDS)
      .eq("parent_id", province.id)
      .in("type_key", ["ville", "territoire"])
      .eq("is_active", true)
      .overrideTypes<UnitRow[], { merge: false }>(),
    supabase.rpc("unit_place_counts", { p_parent_id: province.id }),
  ]);
  if (children.error) throw new DataError("Impossible de charger les territoires", children.error);
  if (counts.error) throw new DataError("Impossible de compter les lieux", counts.error);
  const rows: { unit_id: string; place_count: number }[] = counts.data ?? [];
  const byId = new Map(rows.map((r) => [r.unit_id, Number(r.place_count)]));
  const kids = (children.data ?? [])
    .map((c) => toZone(c, byId.get(c.id) ?? 0))
    // La ville d'abord, puis les territoires par ordre alphabétique.
    .sort(
      (a, b) =>
        Number(b.type_key === "ville") - Number(a.type_key === "ville") || a.name.localeCompare(b.name, "fr"),
    );
  const total = kids.reduce((s, k) => s + k.place_count, 0);
  return [toZone(province, total), ...kids];
});

/** Slugs des zones pour le sitemap (client sans session, pas de cookies). */
export async function getZoneSlugs(): Promise<string[]> {
  const { data, error } = await createSupabasePublicClient()
    .from("geographic_units")
    .select("slug, type_key")
    .in("type_key", ["province", "ville", "territoire"])
    .eq("is_active", true);
  if (error) throw new DataError("Impossible de lister les zones", error);
  return (data ?? []).map((u: { slug: string }) => u.slug);
}

export async function getZoneBySlug(slug: string): Promise<Zone | null> {
  if (!isZoneSlug(slug)) return null;
  return (await getZones()).find((z) => z.slug === slug) ?? null;
}

/**
 * Zone active : paramètre d'URL, sinon zone mémorisée (cookie), sinon Kisangani.
 * Une zone inconnue retombe sur la zone par défaut.
 */
export async function resolveZone(requested?: string | null) {
  const zones = await getZones();
  let slug = isZoneSlug(requested) ? requested : undefined;
  if (!slug) {
    const remembered = (await cookies()).get(ZONE_COOKIE)?.value;
    if (isZoneSlug(remembered)) slug = remembered;
  }
  const zone =
    zones.find((z) => z.slug === slug) ?? zones.find((z) => z.slug === DEFAULT_ZONE) ?? zones[0] ?? null;
  return { zone, zones };
}

/**
 * Périmètre d'une liste filtrable (recherche, catégorie) : zone active, communes de la ville active,
 * unité à passer à search_places. Un lien ?commune=… sans zone ouvre la ville de cette commune.
 */
export async function resolveSearchScope(params: ParsedSearch) {
  let requested = params.zone;
  if (params.commune && !requested) {
    for (const z of (await getZones()).filter((z) => z.type_key === "ville")) {
      const city = await getCityWithCommunes(z.slug);
      if (city?.communes.some((c) => c.unit_id === params.commune)) requested = z.slug;
    }
  }
  const { zone, zones } = await resolveZone(requested);
  const communes = zone?.type_key === "ville" ? ((await getCityWithCommunes(zone.slug))?.communes ?? []) : [];
  // Une commune n'a de sens que dans sa ville : ignorée sinon.
  const commune = communes.some((c) => c.unit_id === params.commune) ? params.commune : undefined;
  return {
    zone,
    zones,
    communes,
    unitId: commune ?? zone?.id,
    params: { ...params, commune } satisfies ParsedSearch,
  };
}
