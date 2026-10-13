import { MalipoApiError, parseCharge, type ChargeRequest, type MalipoCharge } from "./client";
import { verifyWebhookSignature } from "./signature";

/**
 * Logique d'encaissement Malipo (décision D33), indépendante du framework : la base et l'API sont
 * injectées (tests unitaires). Règle : seul un état reçu de Malipo (webhook signé ou lecture de
 * l'API) peut confirmer un paiement ; la base applique les transitions de façon atomique.
 */
export interface ChargeRow {
  id: string;
  payment_id: string;
  invoice_id: string;
  place_id: string;
  environment: "sandbox" | "live";
  charge_id: string | null;
  idempotency_key: string;
  network: string;
  phone: string;
  phone_masked: string;
  amount: number | string;
  currency: "USD" | "CDF";
  api_amount: number | string;
  status: string;
  failure_reason: string | null;
  created_at: string;
  last_synced_at: string | null;
}

export type ApplyResult = { result: string; status?: string };

export interface MalipoDb {
  recordCreation(
    rowId: string,
    charge: MalipoCharge | null,
    error: { code: string; message: string } | null,
  ): Promise<ApplyResult>;
  applyState(charge: MalipoCharge, source: "webhook" | "api"): Promise<ApplyResult>;
  storeEvent(
    eventId: string,
    type: string,
    payload: unknown,
    chargeId: string | null,
  ): Promise<{ id: number; duplicate: boolean; processed: boolean }>;
  finishEvent(id: number, error: string | null): Promise<void>;
  bindCharge(paymentId: string, chargeId: string): Promise<boolean>;
  markSyncError(rowId: string, message: string): Promise<void>;
  reconcileCandidates(limit: number): Promise<ChargeRow[]>;
  invoiceNumber(invoiceId: string): Promise<string | null>;
}

export interface MalipoApi {
  createCharge(params: ChargeRequest, idempotencyKey: string): Promise<MalipoCharge>;
  retrieveCharge(chargeId: string): Promise<MalipoCharge>;
}

export interface Deps {
  db: MalipoDb;
  api: MalipoApi | null;
  now?: () => number;
}

const RESUBMIT_WINDOW_MS = 15 * 60 * 1000;
const NO_RESPONSE_AFTER_MS = 60 * 60 * 1000;

/** Corps de création, reconstruit à l'identique depuis la base (rejouable avec la même clé). */
export function buildChargeRequest(row: ChargeRow, invoiceNumber: string | null): ChargeRequest {
  return {
    amount: Number(row.api_amount),
    currency: row.currency,
    phone: row.phone,
    network: row.network,
    description: `Boyoma Connect · ${invoiceNumber ?? "abonnement"}`,
    metadata: { payment_id: row.payment_id, invoice_id: row.invoice_id, place_id: row.place_id },
  };
}

/** Envoi (ou renvoi idempotent) de la demande de paiement. */
export async function submitCharge(deps: Deps, row: ChargeRow): Promise<ApplyResult> {
  if (!deps.api) return { result: "unavailable", status: row.status };
  const invoiceNumber = await deps.db.invoiceNumber(row.invoice_id);
  try {
    const charge = await deps.api.createCharge(buildChargeRequest(row, invoiceNumber), row.idempotency_key);
    return await deps.db.recordCreation(row.id, charge, null);
  } catch (e) {
    if (e instanceof MalipoApiError && e.isRejection) {
      return deps.db.recordCreation(row.id, null, { code: e.code ?? `http_${e.status}`, message: e.message });
    }
    // Délai dépassé, coupure, 5xx, 409, 429 : issue inconnue → rapprochement ultérieur.
    const message = e instanceof Error ? e.message : "Erreur réseau";
    await deps.db.recordCreation(row.id, null, null).catch(() => undefined);
    await deps.db.markSyncError(row.id, `Création : ${message}`.slice(0, 300)).catch(() => undefined);
    return { result: "unknown", status: row.status };
  }
}

/** Applique un état Malipo ; un succès sans montant ni devise n'est jamais appliqué. */
export async function applyCharge(deps: Deps, charge: MalipoCharge, source: "webhook" | "api") {
  if (charge.status === "succeeded" && (charge.amount == null || charge.currency == null)) {
    return { result: "incomplete", status: undefined } as ApplyResult;
  }
  return deps.db.applyState(charge, source);
}

/** Actualise une tentative depuis Malipo (lecture canonique), ou relance l'envoi si nécessaire. */
export async function syncRow(deps: Deps, row: ChargeRow): Promise<ApplyResult> {
  const now = deps.now?.() ?? Date.now();
  const age = now - Date.parse(row.created_at);
  if (!deps.api) return { result: "unavailable", status: row.status };
  if (row.charge_id) {
    try {
      const charge = await deps.api.retrieveCharge(row.charge_id);
      const r = await applyCharge(deps, charge, "api");
      if (r.result === "incomplete")
        await deps.db.markSyncError(row.id, "Réponse Malipo sans montant ni devise");
      return r;
    } catch (e) {
      await deps.db.markSyncError(
        row.id,
        `Lecture : ${e instanceof Error ? e.message : "erreur"}`.slice(0, 300),
      );
      return { result: "sync_error", status: row.status };
    }
  }
  if (row.status !== "initiating") return { result: "unchanged", status: row.status };
  if (age < RESUBMIT_WINDOW_MS) return submitCharge(deps, row);
  if (age > NO_RESPONSE_AFTER_MS) {
    return deps.db.recordCreation(row.id, null, {
      code: "no_response",
      message: "Aucune réponse de Malipo à la création",
    });
  }
  return { result: "waiting", status: row.status };
}

export async function reconcile(deps: Deps, limit = 50) {
  const rows = await deps.db.reconcileCandidates(limit);
  const results: { id: string; result: string; status?: string }[] = [];
  for (const row of rows) {
    const r = await syncRow(deps, row).catch((e: unknown) => ({
      result: "error",
      status: e instanceof Error ? e.message : "erreur",
    }));
    results.push({ id: row.id, ...r });
  }
  return results;
}

// ------------------------------------------------------------------ webhooks
const CHARGE_EVENTS: Record<string, string> = {
  "charge.succeeded": "succeeded",
  "charge.failed": "failed",
  "charge.declined": "declined",
  "charge.expired": "expired",
  "charge.refunded": "refunded",
};

/** Masque les numéros de téléphone avant stockage du journal. */
export function sanitizePayload(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizePayload);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [
        k,
        /phone|msisdn/i.test(k) && typeof v === "string"
          ? v.replace(/\d(?=\d{2})/g, "•")
          : sanitizePayload(v),
      ]),
    );
  }
  return value;
}

export interface WebhookInput {
  rawBody: string;
  signature: string | null;
  timestamp: string | null;
  secret: string | null;
}

/** Traitement complet d'une notification : vérification, journal, rapprochement. */
export async function handleWebhook(
  deps: Deps,
  input: WebhookInput,
): Promise<{ status: number; body: unknown }> {
  const check = verifyWebhookSignature(
    input.rawBody,
    input.signature,
    input.timestamp,
    input.secret,
    deps.now?.() ?? Date.now(),
  );
  if (!check.ok) {
    return check.reason === "no_secret"
      ? { status: 503, body: { error: "webhook_not_configured" } }
      : { status: 400, body: { error: check.reason } };
  }
  let event: { id?: unknown; type?: unknown; data?: { object?: unknown } };
  try {
    event = JSON.parse(input.rawBody);
  } catch {
    return { status: 400, body: { error: "invalid_json" } };
  }
  if (typeof event.id !== "string" || typeof event.type !== "string") {
    return { status: 400, body: { error: "invalid_event" } };
  }
  const object = parseCharge(event.data?.object);
  const isCharge = event.type in CHARGE_EVENTS && object !== null;

  const stored = await deps.db.storeEvent(
    event.id,
    event.type,
    sanitizePayload(event),
    isCharge ? object!.id : null,
  );
  if (stored.duplicate && stored.processed) return { status: 200, body: { received: true, duplicate: true } };
  if (!isCharge) {
    await deps.db.finishEvent(stored.id, null);
    return { status: 200, body: { received: true, ignored: event.type } };
  }

  try {
    const expected = CHARGE_EVENTS[event.type]!;
    // État canonique : lecture de l'API ; à défaut, contenu signé de l'événement s'il est cohérent.
    let charge: MalipoCharge | null = null;
    let source: "api" | "webhook" = "api";
    if (deps.api) {
      try {
        charge = await deps.api.retrieveCharge(object!.id);
      } catch {
        charge = null;
      }
    }
    if (!charge) {
      source = "webhook";
      if (object!.status !== expected) {
        await deps.db.finishEvent(stored.id, "État incertain (type et statut divergents), API indisponible");
        return { status: 200, body: { received: true, pending_reconciliation: true } };
      }
      charge = object!;
    }
    let result = await applyCharge(deps, charge, source);
    if (result.result === "unknown_charge" && (charge.metadataPaymentId ?? object!.metadataPaymentId)) {
      const bound = await deps.db.bindCharge(
        (charge.metadataPaymentId ?? object!.metadataPaymentId)!,
        charge.id,
      );
      if (bound) result = await applyCharge(deps, charge, source);
    }
    await deps.db.finishEvent(
      stored.id,
      result.result === "applied" || result.result === "unchanged" || result.result === "stale"
        ? null
        : `Résultat : ${result.result}`,
    );
    return { status: 200, body: { received: true, result: result.result } };
  } catch (e) {
    await deps.db.finishEvent(stored.id, e instanceof Error ? e.message : "Erreur").catch(() => undefined);
    return { status: 500, body: { error: "processing_failed" } };
  }
}
