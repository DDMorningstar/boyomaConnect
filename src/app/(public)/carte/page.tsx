import type { Metadata } from "next";
import { ZoneSelector } from "@/components/zones/zone-selector";
import { resolveZone } from "@/features/zones/queries";
import { zoneIn } from "@/features/zones/zones";
import { MapView } from "./map-view";

export const metadata: Metadata = {
  title: "Carte des lieux",
  description: "Carte interactive des lieux publiés à Kisangani et dans la province de la Tshopo.",
};

export default async function MapPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const lat = Number(sp.lat);
  const lng = Number(sp.lng);
  const point =
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    sp.lat &&
    sp.lng
      ? { lat, lng, zoom: 16 }
      : undefined;
  const focus = sp.lieu && /^[a-z0-9-]{1,120}$/.test(sp.lieu) ? sp.lieu : undefined;
  // Référentiel indisponible : la carte s'ouvre sur sa vue de repli, sans sélecteur.
  const { zone, zones } = await resolveZone(sp.zone).catch(() => ({ zone: null, zones: [] }));
  const zoneView =
    zone?.center_latitude != null && zone.center_longitude != null
      ? { lat: zone.center_latitude, lng: zone.center_longitude, zoom: zone.default_zoom ?? 9 }
      : undefined;

  return (
    <div className="-mx-4 flex h-[calc(100dvh-4rem-5.5rem-env(safe-area-inset-bottom))] flex-col md:mx-0 md:mt-4 md:h-[calc(100dvh-8rem)]">
      <h1 className="sr-only">Carte des lieux {zone ? zoneIn(zone) : "de la Tshopo"}</h1>
      <ZoneSelector
        zones={zones}
        active={point ? undefined : zone?.slug}
        hrefFor={(slug) => `/carte?zone=${slug}`}
        className="shrink-0 px-4 py-2 md:px-0 md:pt-0"
      />
      <div className="min-h-0 flex-1 md:overflow-hidden md:rounded-[var(--radius-card)]">
        <MapView view={point ?? zoneView} focusSlug={focus} />
      </div>
    </div>
  );
}
