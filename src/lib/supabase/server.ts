import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

/**
 * Client Supabase côté serveur, lié à la session de l'utilisateur (cookies).
 * Utilise la clé publique : la RLS s'applique toujours.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();
  return createServerClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (toSet) => {
        try {
          toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // Appelé depuis un Server Component : l'écriture est faite par le middleware.
        }
      },
    },
  });
}

/**
 * Client sans session (aucun cookie) pour les données publiques mises en cache
 * (sitemap, métadonnées). Clé publique : seules les données publiques sont lisibles.
 */
export function createSupabasePublicClient() {
  return createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
