"use client";
import dynamic from "next/dynamic";
import { useMemo } from "react";

// MapLibre (~800 Ko) est chargé uniquement sur cette page, côté client.
const PlacesMap = dynamic(() => import("@/components/map/places-map").then((m) => m.PlacesMap), {
  ssr: false,
  loading: () => <div className="skeleton h-full w-full" aria-label="Chargement de la carte" />,
});

export function MapView({
  initial,
  focusSlug,
}: {
  initial?: { lat: number; lng: number };
  focusSlug?: string;
}) {
  const stable = useMemo(() => initial, [initial?.lat, initial?.lng]); // eslint-disable-line react-hooks/exhaustive-deps
  return <PlacesMap initial={stable} focusSlug={focusSlug} />;
}
