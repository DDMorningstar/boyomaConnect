"use client";
import { useSyncExternalStore } from "react";

/**
 * Favoris locaux (visiteur sans compte). Un instantané de la fiche est conservé pour
 * la consultation hors ligne. La synchronisation avec le compte arrivera avec l'authentification.
 */
export interface FavoriteSnapshot {
  id: string;
  slug: string;
  name: string;
  category_name: string | null;
  category_icon: string | null;
  category_color: string | null;
  unit_name: string | null;
  landmark_description: string | null;
  saved_at: string;
}

const KEY = "boyoma.favorites.v1";
const listeners = new Set<() => void>();
let cache: FavoriteSnapshot[] | null = null;
const EMPTY: FavoriteSnapshot[] = [];

function read(): FavoriteSnapshot[] {
  if (cache) return cache;
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    cache = Array.isArray(parsed) ? (parsed as FavoriteSnapshot[]).filter((f) => f && typeof f.slug === "string") : [];
  } catch {
    cache = [];
  }
  return cache;
}

function write(next: FavoriteSnapshot[]) {
  cache = next;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* quota ou navigation privée : l'état reste en mémoire pour la session */
  }
  listeners.forEach((l) => l());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY) {
      cache = null;
      listener();
    }
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useFavorites() {
  const favorites = useSyncExternalStore(subscribe, read, () => EMPTY);
  return {
    favorites,
    isFavorite: (id: string) => favorites.some((f) => f.id === id),
    toggle: (snapshot: Omit<FavoriteSnapshot, "saved_at">): boolean => {
      const exists = read().some((f) => f.id === snapshot.id);
      write(exists ? read().filter((f) => f.id !== snapshot.id) : [{ ...snapshot, saved_at: new Date().toISOString() }, ...read()]);
      return !exists;
    },
    remove: (id: string) => write(read().filter((f) => f.id !== id)),
  };
}
