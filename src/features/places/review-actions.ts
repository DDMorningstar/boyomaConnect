"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/features/auth/session";

/** Avis d'un visiteur connecté : un par établissement, relu par l'équipe avant publication. */
export type ReviewState = { ok?: string; error?: string } | null;

const schema = z.object({
  place_id: z.string().uuid(),
  rating: z.coerce.number().int().min(1, "Choisissez une note.").max(5),
  title: z.string().trim().max(120),
  body: z
    .string()
    .trim()
    .max(3000, "3 000 caractères maximum.")
    .refine((v) => !v || v.length >= 10, "Votre avis : 10 caractères au moins."),
  visit_month: z.union([z.string().regex(/^\d{4}-\d{2}$/), z.literal("")]),
});

export async function saveReview(_: ReviewState, form: FormData): Promise<ReviewState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Connectez-vous pour donner votre avis." };
  const parsed = schema.safeParse({
    place_id: form.get("place_id"),
    rating: form.get("rating") ?? 0,
    title: String(form.get("title") ?? ""),
    body: String(form.get("body") ?? ""),
    visit_month: String(form.get("visit_month") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Avis invalide." };
  const v = parsed.data;
  const values = {
    rating: v.rating,
    title: v.title || null,
    body: v.body || null,
    visit_month: v.visit_month ? `${v.visit_month}-01` : null,
  };
  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("reviews")
    .select("id")
    .eq("place_id", v.place_id)
    .eq("author_id", user.id)
    .maybeSingle<{ id: string }>();
  const { error } = existing
    ? await supabase.from("reviews").update(values).eq("id", existing.id)
    : await supabase.from("reviews").insert({ ...values, place_id: v.place_id, author_id: user.id });
  if (error) {
    if (error.code === "42501")
      return { error: "Vous ne pouvez pas évaluer un établissement que vous gérez." };
    if (error.code === "P0001") return { error: "Limite d'avis atteinte, réessayez plus tard." };
    return { error: "Enregistrement impossible. Réessayez." };
  }
  revalidatePath("/lieux/[slug]", "page");
  return { ok: "Merci ! Votre avis sera publié après une vérification rapide." };
}
