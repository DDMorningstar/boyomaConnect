"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/features/auth/session";

/**
 * Actions d'administration « business » (décision D32). Chaque décision passe par une fonction SQL
 * qui vérifie la permission et journalise ; un paiement n'est validé qu'avec référence et justification.
 */
export type AdminState = { ok?: string; error?: string } | null;
type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

const MESSAGES: Record<string, string> = {
  "42501": "Action non autorisée (permission manquante, ou paiement que vous avez vous-même initié).",
  "22023": "Motif, référence ou date obligatoire.",
  P0001: "Déjà traité.",
  P0002: "Élément introuvable ou déjà traité.",
};

const uuid = z.string().uuid();
const str = (f: FormData, k: string) => String(f.get(k) ?? "").trim();

async function run(path: string, fn: (s: Supabase) => Promise<string>): Promise<AdminState> {
  if (!(await getCurrentUser())) return { error: "Session expirée : reconnectez-vous." };
  try {
    const ok = await fn(await createSupabaseServerClient());
    revalidatePath(path);
    revalidatePath("/admin", "layout");
    return { ok };
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { error: MESSAGES[err.code ?? ""] ?? err.message ?? "Action impossible." };
  }
}

export async function adminModeratePromotion(_: AdminState, form: FormData): Promise<AdminState> {
  return run("/admin/offres", async (supabase) => {
    const decision = str(form, "decision");
    const { error } = await supabase.rpc("moderate_promotion", {
      p_promotion_id: uuid.parse(str(form, "id")),
      p_decision: decision,
      p_reason: str(form, "notes").slice(0, 500) || null,
    });
    if (error) throw error;
    revalidatePath("/");
    return decision === "approve"
      ? "Offre publiée."
      : decision === "end"
        ? "Offre arrêtée."
        : "Offre refusée.";
  });
}

export async function adminHandleVerification(_: AdminState, form: FormData): Promise<AdminState> {
  return run("/admin/verifications", async (supabase) => {
    const decision = str(form, "decision");
    const date = str(form, "date");
    if (decision === "schedule" && !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw { code: "22023" };
    const { error } = await supabase.rpc("handle_verification_request", {
      p_request_id: uuid.parse(str(form, "id")),
      p_decision: decision,
      p_scheduled_for: decision === "schedule" ? date : null,
      p_notes: str(form, "notes").slice(0, 1000) || null,
    });
    if (error) throw error;
    const labels: Record<string, string> = {
      schedule: "Visite programmée.",
      complete: "Fiche marquée vérifiée sur place.",
      reject: "Demande refusée.",
    };
    return labels[decision] ?? "Fait.";
  });
}

export async function adminConfirmPayment(_: AdminState, form: FormData): Promise<AdminState> {
  return run("/admin/facturation", async (supabase) => {
    const { error } = await supabase.rpc("confirm_manual_payment", {
      p_payment_id: uuid.parse(str(form, "id")),
      p_provider_reference: str(form, "reference"),
      p_note: str(form, "notes"),
    });
    if (error) throw error;
    return "Paiement validé : abonnement activé.";
  });
}

export async function adminRejectPayment(_: AdminState, form: FormData): Promise<AdminState> {
  return run("/admin/facturation", async (supabase) => {
    const { error } = await supabase.rpc("reject_manual_payment", {
      p_payment_id: uuid.parse(str(form, "id")),
      p_reason: str(form, "notes"),
    });
    if (error) throw error;
    return "Paiement refusé : l'établissement est notifié.";
  });
}
