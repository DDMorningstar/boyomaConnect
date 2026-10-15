"use client";
import { useEffect, useRef } from "react";
import { recordPlaceEvent } from "@/features/places/events";
import { rememberPlace, type SavedPlace } from "@/features/offline/saved-places";

/** Statistique de consultation (une fois par fiche) + mémorisation hors ligne de l'essentiel. */
export function ViewTracker({ placeId, offline }: { placeId: string; offline?: Omit<SavedPlace, "saved_at"> }) {
  const snapshot = useRef(offline);
  snapshot.current = offline;
  useEffect(() => {
    recordPlaceEvent(placeId, "view");
    if (snapshot.current) rememberPlace(snapshot.current);
  }, [placeId]);
  return null;
}
