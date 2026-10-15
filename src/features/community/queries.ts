import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import type { Contributions } from "./badges";

/** Contributions validées de l'utilisateur connecté (null si non connecté ou indisponible). */
export async function getMyContributions(): Promise<Contributions | null> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("my_contributions");
  const row = (data as Contributions[] | null)?.[0];
  if (error || !row) return null;
  return row;
}
