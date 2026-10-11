import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface Profile {
  id: string;
  display_name: string | null;
  avatar_url: string | null;
  status: "active" | "suspended";
}

/** Utilisateur authentifié (vérifié auprès de Supabase Auth, pas seulement le cookie). */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
});

export const getCurrentProfile = cache(async (): Promise<Profile | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url, status")
    .eq("id", user.id)
    .maybeSingle<Profile>();
  return data;
});

export const getCurrentPermissions = cache(async (): Promise<Set<string>> => {
  const user = await getCurrentUser();
  if (!user) return new Set();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("current_user_permissions");
  const rows: { permission_key: string }[] = data ?? [];
  return new Set(rows.map((r) => r.permission_key));
});

/** Chemin interne sûr pour une redirection après connexion (pas de redirection ouverte). */
export function safeNext(next: string | null | undefined, fallback = "/profil"): string {
  return next && /^\/(?!\/)[\w\-./?=&%]*$/.test(next) ? next : fallback;
}

/** Exige une session ; sinon renvoie vers la connexion puis revient sur `next`. */
export async function requireUser(next: string): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect(`/connexion?next=${encodeURIComponent(next)}`);
  return user;
}
