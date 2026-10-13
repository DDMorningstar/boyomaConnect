import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Vérification des webhooks Malipo (documentation « Webhooks ») :
 * signature = HMAC-SHA256 hexadécimal (minuscules) de `${X-Webhook-Timestamp}.${corps brut}`,
 * clé = secret de l'endpoint (64 caractères hexadécimaux) ; horodatage ISO-8601, fenêtre de 5 minutes.
 */
export const WEBHOOK_TOLERANCE_MS = 5 * 60 * 1000;

export type WebhookCheck =
  | { ok: true }
  | { ok: false; reason: "missing_header" | "bad_timestamp" | "expired" | "bad_signature" | "no_secret" };

export function signWebhook(rawBody: string, timestamp: string, secret: string) {
  return createHmac("sha256", secret).update(`${timestamp}.${rawBody}`, "utf8").digest("hex");
}

export function verifyWebhookSignature(
  rawBody: string,
  signature: string | null,
  timestamp: string | null,
  secret: string | null | undefined,
  now: number = Date.now(),
  toleranceMs: number = WEBHOOK_TOLERANCE_MS,
): WebhookCheck {
  if (!secret) return { ok: false, reason: "no_secret" };
  if (!signature || !timestamp) return { ok: false, reason: "missing_header" };
  const at = Date.parse(timestamp);
  if (Number.isNaN(at)) return { ok: false, reason: "bad_timestamp" };
  if (Math.abs(now - at) > toleranceMs) return { ok: false, reason: "expired" };
  const expected = Buffer.from(signWebhook(rawBody, timestamp, secret), "utf8");
  const received = Buffer.from(signature.trim().toLowerCase(), "utf8");
  if (expected.length !== received.length || !timingSafeEqual(expected, received)) {
    return { ok: false, reason: "bad_signature" };
  }
  return { ok: true };
}
