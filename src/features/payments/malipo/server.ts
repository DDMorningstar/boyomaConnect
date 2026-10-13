import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { MalipoClient, type MalipoCharge } from "./client";
import { getMalipoConfig, type MalipoConfig } from "./config";
import type { ChargeRow, Deps, MalipoDb } from "./service";

/** Assemblage serveur : configuration, client API et accès base (fonctions service_role). */
const ROW_COLUMNS =
  "id, payment_id, invoice_id, place_id, environment, charge_id, idempotency_key, network, phone, phone_masked, amount, currency, api_amount, status, failure_reason, created_at, last_synced_at";

function rpcError(error: { message: string; code?: string } | null) {
  if (!error) return;
  const e = new Error(error.message) as Error & { code?: string };
  e.code = error.code;
  throw e;
}

export function createMalipoDb(supabase: SupabaseClient): MalipoDb {
  return {
    async recordCreation(rowId, charge, error) {
      const { data, error: e } = await supabase.rpc("malipo_record_creation", {
        p_row_id: rowId,
        p_charge_id: charge?.id ?? null,
        p_status: charge?.status ?? null,
        p_amount: charge?.amount ?? null,
        p_currency: charge?.currency ?? null,
        p_failure: charge?.failureReason ?? null,
        p_error_code: error?.code ?? null,
        p_error_message: error?.message ?? null,
      });
      rpcError(e);
      return data as { result: string; status?: string };
    },
    async applyState(charge: MalipoCharge, source) {
      const { data, error } = await supabase.rpc("malipo_apply_charge_state", {
        p_charge_id: charge.id,
        p_status: charge.status,
        p_amount: charge.amount,
        p_currency: charge.currency,
        p_failure: charge.failureReason,
        p_fee: charge.feeAmount,
        p_net: charge.netAmount,
        p_meta_payment: charge.metadataPaymentId,
        p_source: source,
      });
      rpcError(error);
      return data as { result: string; status?: string };
    },
    async storeEvent(eventId, type, payload, chargeId) {
      const { data, error } = await supabase.rpc("malipo_store_event", {
        p_event_id: eventId,
        p_type: type,
        p_payload: payload,
        p_charge_id: chargeId,
      });
      rpcError(error);
      return data as { id: number; duplicate: boolean; processed: boolean };
    },
    async finishEvent(id, err) {
      const { error } = await supabase.rpc("malipo_finish_event", { p_id: id, p_error: err });
      rpcError(error);
    },
    async bindCharge(paymentId, chargeId) {
      const { data, error } = await supabase.rpc("malipo_bind_charge", {
        p_payment_id: paymentId,
        p_charge_id: chargeId,
      });
      rpcError(error);
      return data === true;
    },
    async markSyncError(rowId, message) {
      const { error } = await supabase.rpc("malipo_mark_sync_error", { p_row_id: rowId, p_error: message });
      rpcError(error);
    },
    async reconcileCandidates(limit) {
      const { data, error } = await supabase.rpc("malipo_reconcile_candidates", { p_limit: limit });
      rpcError(error);
      return (data as ChargeRow[] | null) ?? [];
    },
    async invoiceNumber(invoiceId) {
      const { data } = await supabase
        .from("invoices")
        .select("number")
        .eq("id", invoiceId)
        .maybeSingle<{ number: string }>();
      return data?.number ?? null;
    },
  };
}

export interface MalipoRuntime {
  config: MalipoConfig;
  admin: SupabaseClient | null;
  deps: Deps | null;
  /** Encaissement utilisable : configuration valide et accès serveur à la base. */
  available: boolean;
  reason: string | null;
}

export function getMalipoRuntime(): MalipoRuntime {
  const config = getMalipoConfig();
  const admin = getSupabaseAdminClient();
  const api = config.ready && config.apiKey ? new MalipoClient(config.apiKey, config.baseUrl) : null;
  const deps = admin ? { db: createMalipoDb(admin), api } : null;
  const reason = !config.ready
    ? config.reason
    : !admin
      ? "Accès serveur à la base non configuré (SUPABASE_SECRET_KEY)."
      : null;
  return { config, admin, deps, available: reason === null, reason };
}

export async function getChargeRow(admin: SupabaseClient, rowId: string) {
  const { data } = await admin
    .from("malipo_charges")
    .select(ROW_COLUMNS)
    .eq("id", rowId)
    .maybeSingle<ChargeRow>();
  return data;
}
