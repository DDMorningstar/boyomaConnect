"use client";
import { getSupabaseBrowserClient } from "@/lib/supabase/client";

export type PlaceEventType =
  | "view"
  | "phone_click"
  | "whatsapp_click"
  | "website_click"
  | "directions_request"
  | "share"
  | "favorite_add";

const SESSION_KEY = "boyoma.session";

/** Identifiant anonyme aléatoire (aucune donnée personnelle) servant à dédupliquer les statistiques. */
function sessionHash(): string {
  try {
    let v = window.localStorage.getItem(SESSION_KEY);
    if (!v || v.length < 16) {
      v = crypto.randomUUID().replace(/-/g, "");
      window.localStorage.setItem(SESSION_KEY, v);
    }
    return v;
  } catch {
    return crypto.randomUUID().replace(/-/g, "");
  }
}

/** Enregistre un événement réel (statistiques professionnelles). Silencieux en cas d'échec. */
export function recordPlaceEvent(placeId: string, type: PlaceEventType) {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  void getSupabaseBrowserClient()
    .rpc("record_place_event", { p_place_id: placeId, p_event_type: type, p_session_hash: sessionHash() })
    .then(({ error }) => {
      if (error && process.env.NODE_ENV !== "production") console.warn("[events]", error.message);
    });
}

/** Consultation ou prise de contact sur un article du catalogue (statistiques par article). */
export function recordCatalogEvent(itemId: string, kind: "view" | "contact") {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  void getSupabaseBrowserClient()
    .rpc("record_catalog_event", { p_item_id: itemId, p_kind: kind, p_session_hash: sessionHash() })
    .then(({ error }) => {
      if (error && process.env.NODE_ENV !== "production") console.warn("[events]", error.message);
    });
}
