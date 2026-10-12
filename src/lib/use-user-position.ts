"use client";
import { useSyncExternalStore } from "react";

/**
 * Position de l'utilisateur partagée par les composants (distances sur les cartes de lieux).
 * Jamais de demande d'autorisation ici : la position n'est lue que si l'utilisateur l'a déjà accordée
 * (page « À proximité », bouton « Me localiser »). Conservée 10 min dans la session, jamais envoyée.
 */
type Position = { lat: number; lng: number } | null;

const KEY = "boyoma:position";
const MAX_AGE_MS = 10 * 60 * 1000;
let position: Position = null;
let started = false;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((l) => l());

export function rememberPosition(lat: number, lng: number) {
  position = { lat, lng };
  try {
    sessionStorage.setItem(KEY, JSON.stringify({ lat, lng, at: Date.now() }));
  } catch {
    /* stockage indisponible (navigation privée) : position gardée en mémoire seulement */
  }
  emit();
}

function start() {
  if (started || typeof window === "undefined") return;
  started = true;
  try {
    const saved = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as {
      lat: number;
      lng: number;
      at: number;
    } | null;
    if (saved && Date.now() - saved.at < MAX_AGE_MS) position = { lat: saved.lat, lng: saved.lng };
  } catch {
    /* ignoré */
  }
  if (!navigator.geolocation || !navigator.permissions?.query) return;
  navigator.permissions
    .query({ name: "geolocation" })
    .then((status) => {
      if (status.state !== "granted") return;
      navigator.geolocation.getCurrentPosition(
        (p) => rememberPosition(p.coords.latitude, p.coords.longitude),
        () => undefined,
        { enableHighAccuracy: false, maximumAge: 5 * 60 * 1000, timeout: 10_000 },
      );
    })
    .catch(() => undefined);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  start();
  return () => listeners.delete(listener);
}

export function useUserPosition(): Position {
  return useSyncExternalStore(
    subscribe,
    () => position,
    () => null,
  );
}
