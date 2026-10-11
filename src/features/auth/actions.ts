"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ImageError, optimizeImage } from "@/lib/images";
import { env } from "@/lib/env";
import { getCurrentUser } from "./session";

export type FormState = { ok?: string; error?: string } | null;

export async function signOut() {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/");
}

const displayNameSchema = z
  .string()
  .trim()
  .min(2, "Le nom doit contenir au moins 2 caractères.")
  .max(80, "80 caractères maximum.");

export async function updateDisplayName(_: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expirée : reconnectez-vous." };
  const parsed = displayNameSchema.safeParse(form.get("display_name"));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.from("profiles").update({ display_name: parsed.data }).eq("id", user.id);
  if (error) return { error: "Enregistrement impossible. Réessayez." };
  revalidatePath("/profil");
  return { ok: "Nom enregistré." };
}

/** Photo de profil : optimisée (256 px, WebP, sans métadonnées) puis stockée dans avatars/<uid>/. */
export async function uploadAvatar(_: FormState, form: FormData): Promise<FormState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expirée : reconnectez-vous." };
  let image;
  try {
    image = await optimizeImage(form.get("avatar") as File, "avatar");
  } catch (e) {
    return { error: e instanceof ImageError ? e.message : "Image invalide." };
  }
  const supabase = await createSupabaseServerClient();
  const path = `${user.id}/${randomUUID()}.webp`;
  const { error: upErr } = await supabase.storage
    .from("avatars")
    .upload(path, image.data, { contentType: image.contentType, cacheControl: "31536000" });
  if (upErr) return { error: "Envoi de la photo impossible. Réessayez." };

  const { data: old } = await supabase.storage.from("avatars").list(user.id);
  const url = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${path}`;
  const { error } = await supabase.from("profiles").update({ avatar_url: url }).eq("id", user.id);
  if (error) {
    await supabase.storage.from("avatars").remove([path]);
    return { error: "Enregistrement impossible. Réessayez." };
  }
  // Anciennes photos supprimées (une seule photo conservée par compte).
  const stale = (old ?? []).map((o) => `${user.id}/${o.name}`).filter((p) => p !== path);
  if (stale.length) await supabase.storage.from("avatars").remove(stale);
  revalidatePath("/profil");
  return { ok: "Photo de profil mise à jour." };
}
