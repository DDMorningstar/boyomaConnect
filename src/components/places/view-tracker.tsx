"use client";
import { useEffect } from "react";
import { recordPlaceEvent } from "@/features/places/events";

export function ViewTracker({ placeId }: { placeId: string }) {
  useEffect(() => {
    recordPlaceEvent(placeId, "view");
  }, [placeId]);
  return null;
}
