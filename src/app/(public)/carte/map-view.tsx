"use client";
import dynamic from "next/dynamic";
import { useMemo } from "react";
import type { MapViewport } from "@/components/map/places-map";

// MapLibre (~800 Ko) est chargé uniquement sur cette page, côté client.
const PlacesMap = dynamic(() => import("@/components/map/places-map").then((m) => m.PlacesMap), {
  ssr: false,
  loading: () => <div className="skeleton h-full w-full" aria-label="Chargement de la carte" />,
});

export function MapView({ view, focusSlug }: { view?: MapViewport; focusSlug?: string }) {
  const stable = useMemo(() => view, [view?.lat, view?.lng, view?.zoom]); // eslint-disable-line react-hooks/exhaustive-deps
  return <PlacesMap view={stable} focusSlug={focusSlug} />;
}
