import type { Metadata } from "next";
import { MapView } from "./map-view";

export const metadata: Metadata = { title: "Carte des lieux", description: "Carte interactive des lieux publiés à Kisangani." };

export default async function MapPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const lat = Number(sp.lat);
  const lng = Number(sp.lng);
  const initial = Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && sp.lat && sp.lng ? { lat, lng } : undefined;
  const focus = sp.lieu && /^[a-z0-9-]{1,120}$/.test(sp.lieu) ? sp.lieu : undefined;
  return (
    <div className="-mx-4 h-[calc(100dvh-4rem-5.5rem-env(safe-area-inset-bottom))] md:mx-0 md:mt-4 md:h-[calc(100dvh-8rem)] md:overflow-hidden md:rounded-[var(--radius-card)]">
      <h1 className="sr-only">Carte des lieux de Kisangani</h1>
      <MapView initial={initial} focusSlug={focus} />
    </div>
  );
}
