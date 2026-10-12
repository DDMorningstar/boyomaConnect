import { createSupabasePublicClient } from "@/lib/supabase/server";

/**
 * ODbL 1.0 (partage à l'identique, art. 4.4) : la base dérivée d'OpenStreetMap utilisée publiquement
 * par Boyoma Connect est mise à disposition sous la même licence, au format GeoJSON. Lieux publiés
 * uniquement ; aucune donnée personnelle.
 */
export const revalidate = 3600;

type Row = {
  osm_id: string;
  name: string;
  category_slug: string | null;
  latitude: number | null;
  longitude: number | null;
  unit_name: string | null;
  collected_at: string | null;
  updated_at: string;
};

export async function GET() {
  const { data, error } = await createSupabasePublicClient().rpc("osm_derived_places");
  if (error) {
    return Response.json({ error: "Export momentanément indisponible." }, { status: 503 });
  }
  const rows = (data as Row[] | null) ?? [];
  const body = {
    type: "FeatureCollection",
    license: "ODbL-1.0",
    license_url: "https://opendatacommons.org/licenses/odbl/1-0/",
    attribution: "© Contributeurs OpenStreetMap ; base dérivée : Boyoma Connect",
    notice:
      "Base de données dérivée d'OpenStreetMap, mise à disposition sous Open Database License 1.0. Toute base dérivée de celle-ci doit être rediffusée sous la même licence.",
    generated_at: new Date().toISOString(),
    features: rows
      .filter((r) => r.latitude != null && r.longitude != null)
      .map((r) => ({
        type: "Feature",
        geometry: { type: "Point", coordinates: [r.longitude, r.latitude] },
        properties: {
          "@id": r.osm_id,
          osm_url: `https://www.openstreetmap.org/${r.osm_id}`,
          name: r.name,
          boyoma_category: r.category_slug,
          area: r.unit_name,
          collected_at: r.collected_at,
          updated_at: r.updated_at,
        },
      })),
  };
  return new Response(JSON.stringify(body), {
    headers: {
      "Content-Type": "application/geo+json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="boyoma-connect-osm-odbl.geojson"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
