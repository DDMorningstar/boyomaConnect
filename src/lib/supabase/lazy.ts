"use client";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Client Supabase navigateur chargé à la demande : la bibliothèque (~50 Ko compressés) n'est plus
 * téléchargée ni exécutée avant le premier affichage des pages publiques (mesure Lighthouse, D37).
 */
export function loadSupabaseBrowserClient(): Promise<SupabaseClient> {
  return import("@/lib/supabase/client").then((m) => m.getSupabaseBrowserClient());
}
