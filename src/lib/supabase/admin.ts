import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Client Supabase « serveur de confiance » (clé secrète SUPABASE_SECRET_KEY, rôle service_role).
 * Réservé aux traitements sans session utilisateur qui doivent écrire de façon contrôlée
 * (paiements, webhooks). Jamais importé côté navigateur ; null si la clé est absente.
 */
let client: SupabaseClient | null | undefined;

export function getSupabaseAdminClient(): SupabaseClient | null {
  if (client !== undefined) return client;
  const key = (process.env.SUPABASE_SECRET_KEY ?? "").trim();
  client = key
    ? createClient(env.NEXT_PUBLIC_SUPABASE_URL, key, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
    : null;
  return client;
}
