"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/features/auth/session";

export type ReviewState = { ok?: string; error?: string } | null;

const schema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approve", "reject", "needs_changes"]),
  notes: z
    .string()
    .trim()
    .max(1000)
    .transform((v) => (v === "" ? null : v)),
});

const MESSAGES: Record<string, string> = {
  "42501": "Action non autorisée (permission manquante, ou votre propre demande).",
  "22023": "Un motif est obligatoire pour refuser ou demander des corrections.",
  P0001: "Demande déjà traitée.",
  P0002: "Demande introuvable.",
};

function parse(form: FormData) {
  return schema.safeParse({
    id: form.get("id"),
    decision: form.get("decision"),
    notes: String(form.get("notes") ?? ""),
  });
}

/** Validation d'une fiche proposée (fonction SQL : permissions, audit, création du lieu). */
export async function reviewSubmission(_: ReviewState, form: FormData): Promise<ReviewState> {
  if (!(await getCurrentUser())) return { error: "Session expirée." };
  const parsed = parse(form);
  if (!parsed.success) return { error: "Décision invalide." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_place_submission", {
    p_submission_id: parsed.data.id,
    p_decision: parsed.data.decision,
    p_notes: parsed.data.notes,
    p_duplicate_of: null,
    p_publish: true,
  });
  if (error) return { error: MESSAGES[error.code ?? ""] ?? error.message };
  revalidatePath("/admin");
  return { ok: parsed.data.decision === "approve" ? "Fiche publiée." : "Décision enregistrée." };
}

export async function reviewClaim(_: ReviewState, form: FormData): Promise<ReviewState> {
  if (!(await getCurrentUser())) return { error: "Session expirée." };
  const parsed = parse(form);
  if (!parsed.success || parsed.data.decision === "needs_changes") return { error: "Décision invalide." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_place_claim", {
    p_claim_id: parsed.data.id,
    p_decision: parsed.data.decision,
    p_notes: parsed.data.notes,
  });
  if (error) return { error: MESSAGES[error.code ?? ""] ?? error.message };
  revalidatePath("/admin");
  return { ok: parsed.data.decision === "approve" ? "Accès à la fiche accordé." : "Demande refusée." };
}
