"use server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ImageError, optimizeImage } from "@/lib/images";
import { getCurrentUser } from "@/features/auth/session";

/**
 * Photo proposée par un visiteur connecté (décision D34) : déposée dans suggestions/<utilisateur>/,
 * enregistrée « en attente » par suggest_place_photo() (5 par jour), publiée après modération.
 */
export type SuggestState = { ok?: string; error?: string } | null;

const BUCKET = "place-media";
const schema = z.object({
  place_id: z.string().uuid(),
  caption: z.string().trim().max(200, "200 caractères maximum."),
});

export async function suggestPhoto(_: SuggestState, form: FormData): Promise<SuggestState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Connectez-vous pour proposer une photo." };
  const parsed = schema.safeParse({
    place_id: form.get("place_id"),
    caption: String(form.get("caption") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Envoi invalide." };
  const file = form.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choisissez une photo." };
  if (form.get("consent") !== "on") {
    return { error: "Confirmez que vous avez pris cette photo et acceptez sa publication." };
  }

  const supabase = await createSupabaseServerClient();
  let path: string;
  let image: Awaited<ReturnType<typeof optimizeImage>>;
  try {
    image = await optimizeImage(file, "photo");
    path = `suggestions/${user.id}/${randomUUID()}.webp`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, image.data, { contentType: image.contentType, cacheControl: "31536000" });
    if (error) return { error: "Envoi de la photo impossible. Réessayez." };
  } catch (e) {
    return { error: e instanceof ImageError ? e.message : "Photo illisible. Essayez une autre image." };
  }

  const { error } = await supabase.rpc("suggest_place_photo", {
    p_place_id: parsed.data.place_id,
    p_path: path,
    p_caption: parsed.data.caption || null,
    p_width: image.width,
    p_height: image.height,
    p_bytes: image.bytes,
  });
  if (error) {
    await supabase.storage.from(BUCKET).remove([path]);
    if (error.code === "P0001") return { error: "Vous avez déjà proposé 5 photos aujourd'hui. Merci !" };
    return { error: "Enregistrement impossible. Réessayez." };
  }
  return { ok: "Merci ! Votre photo sera publiée après une vérification rapide. Vous serez notifié." };
}
