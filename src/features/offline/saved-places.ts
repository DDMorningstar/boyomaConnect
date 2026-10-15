"use client";

/**
 * Fiches consultées gardées sur l'appareil (20 dernières) : l'essentiel pour contacter ou rejoindre
 * l'établissement sans réseau (nom, téléphone, WhatsApp, repère, adresse). Données publiques uniquement.
 */
export interface SavedPlace {
  slug: string;
  name: string;
  category: string | null;
  locality: string | null;
  phone: string | null;
  whatsapp: string | null;
  landmark: string | null;
  address: string | null;
  latitude: number | null;
  longitude: number | null;
  saved_at: string;
}

const KEY = "boyoma.offline-places.v1";
const MAX = 20;

export function readSavedPlaces(): SavedPlace[] {
  try {
    const v: unknown = JSON.parse(window.localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? (v as SavedPlace[]).filter((p) => p && typeof p.slug === "string") : [];
  } catch {
    return [];
  }
}

export function rememberPlace(p: Omit<SavedPlace, "saved_at">) {
  try {
    const next = [
      { ...p, saved_at: new Date().toISOString() },
      ...readSavedPlaces().filter((x) => x.slug !== p.slug),
    ].slice(0, MAX);
    window.localStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    /* stockage plein ou indisponible : sans conséquence */
  }
}
