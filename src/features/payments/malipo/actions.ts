"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { maskPhone, normalizeCdPhone } from "./phone";
import { getChargeRow, getMalipoRuntime } from "./server";
import { submitCharge, syncRow, type ChargeRow } from "./service";
import { failureMessage, isFailure, isInFlight, isNetwork } from "./status";

/**
 * Actions Mobile Money (décision D33). Le navigateur ne fournit que le plan, l'opérateur et le
 * numéro : le montant est lu sur la facture par la base. Le statut affiché vient toujours du serveur.
 */
export interface PaymentView {
  rowId: string;
  paymentId: string;
  status: string;
  network: string;
  phoneMasked: string;
  amount: string;
  currency: string;
  environment: "sandbox" | "live";
  reference: string | null;
  message: string | null;
}

export type PayState = { view?: PaymentView; error?: string } | null;

const ERRORS: Record<string, string> = {
  "42501": "Vous ne gérez pas cet établissement.",
  "22023": "Données de paiement invalides.",
  P0001: "Une autre demande est déjà en cours pour cet établissement.",
  P0002: "Plan ou facture introuvable.",
};

function toView(row: ChargeRow): PaymentView {
  return {
    rowId: row.id,
    paymentId: row.payment_id,
    status: row.status,
    network: row.network,
    phoneMasked: row.phone_masked,
    amount: Number(row.amount).toFixed(2),
    currency: row.currency,
    environment: row.environment,
    reference: row.charge_id,
    message: isFailure(row.status) ? failureMessage(row.status, row.failure_reason) : null,
  };
}

const startSchema = z.object({
  place_id: z.string().uuid(),
  plan: z.string().regex(/^[a-z_]{2,30}$/),
  network: z.string().refine(isNetwork, "Choisissez votre opérateur Mobile Money."),
  phone: z.string().max(30),
});

export async function startMobileMoneyPayment(_: PayState, form: FormData): Promise<PayState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expirée : reconnectez-vous." };
  const runtime = getMalipoRuntime();
  if (!runtime.available || !runtime.admin || !runtime.deps) {
    return { error: "Le paiement Mobile Money n'est pas encore disponible." };
  }
  const parsed = startSchema.safeParse({
    place_id: form.get("place_id"),
    plan: form.get("plan"),
    network: form.get("network"),
    phone: String(form.get("phone") ?? ""),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const phone = normalizeCdPhone(parsed.data.phone);
  if (!phone) return { error: "Numéro invalide : saisissez un numéro mobile congolais (ex. 081 234 5678)." };

  const { data, error } = await runtime.admin.rpc("malipo_begin_checkout", {
    p_user: user.id,
    p_place_id: parsed.data.place_id,
    p_plan_key: parsed.data.plan,
    p_network: parsed.data.network,
    p_phone: phone,
    p_phone_masked: maskPhone(phone),
    p_environment: runtime.config.mode,
    p_amount_unit: runtime.config.amountUnit,
  });
  if (error)
    return {
      error: ERRORS[error.code ?? ""]
        ? `${ERRORS[error.code!]} ${error.message}`
        : "Paiement impossible pour le moment.",
    };
  const begun = data as { row_id: string; existing: boolean; charge_id: string | null };

  let row = await getChargeRow(runtime.admin, begun.row_id);
  if (!row) return { error: "Tentative introuvable." };
  // Nouvelle tentative, ou tentative en cours jamais transmise : envoi (idempotent, même clé).
  if (!row.charge_id && row.status === "initiating") {
    await submitCharge(runtime.deps, row);
    row = (await getChargeRow(runtime.admin, begun.row_id)) ?? row;
  }
  revalidatePath(`/espace-pro/lieux/${parsed.data.place_id}/abonnement`);
  return { view: toView(row) };
}

/** Actualisation du statut : lecture canonique chez Malipo (au plus toutes les 3 secondes). */
export async function refreshMobileMoneyPayment(rowId: string): Promise<PayState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expirée : reconnectez-vous." };
  if (!z.string().uuid().safeParse(rowId).success) return { error: "Paiement inconnu." };
  // Autorisation : la RLS ne montre la tentative qu'aux gestionnaires de la fiche (ou à la facturation).
  const supabase = await createSupabaseServerClient();
  const { data: visible } = await supabase
    .from("malipo_charges")
    .select("id, place_id")
    .eq("id", rowId)
    .maybeSingle();
  if (!visible) return { error: "Paiement introuvable." };

  const runtime = getMalipoRuntime();
  if (!runtime.admin || !runtime.deps) return { error: "Vérification indisponible pour le moment." };
  let row = await getChargeRow(runtime.admin, rowId);
  if (!row) return { error: "Paiement introuvable." };
  const fresh = row.last_synced_at && Date.now() - Date.parse(row.last_synced_at) < 3000;
  if (isInFlight(row.status) && !fresh && runtime.available) {
    await syncRow(runtime.deps, row);
    row = (await getChargeRow(runtime.admin, rowId)) ?? row;
    if (!isInFlight(row.status)) revalidatePath(`/espace-pro/lieux/${row.place_id}/abonnement`);
  }
  return { view: toView(row) };
}
