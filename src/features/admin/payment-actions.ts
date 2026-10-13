"use server";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/features/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getMalipoRuntime } from "@/features/payments/malipo/server";
import { reconcile } from "@/features/payments/malipo/service";

export type ReconcileState = { ok?: string; error?: string } | null;

/** Rapprochement manuel : relit chez Malipo les paiements restés en attente (billing.manage). */
export async function adminReconcileMalipo(): Promise<ReconcileState> {
  if (!(await getCurrentUser())) return { error: "Session expirée : reconnectez-vous." };
  const supabase = await createSupabaseServerClient();
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission: "billing.manage" });
  if (allowed !== true) return { error: "Permission billing.manage requise." };
  const runtime = getMalipoRuntime();
  if (!runtime.available || !runtime.deps) return { error: runtime.reason ?? "Malipo n'est pas configuré." };
  const results = await reconcile(runtime.deps, 100);
  revalidatePath("/admin/paiements");
  const applied = results.filter((r) => r.result === "applied").length;
  return {
    ok: results.length
      ? `${results.length} paiement(s) vérifié(s), ${applied} mis à jour.`
      : "Aucun paiement en attente à vérifier.",
  };
}
