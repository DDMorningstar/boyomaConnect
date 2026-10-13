import { getMalipoRuntime } from "@/features/payments/malipo/server";
import { handleWebhook } from "@/features/payments/malipo/service";

/**
 * Webhook Malipo (décision D33) : corps brut lu tel quel, signature HMAC-SHA256 et horodatage
 * vérifiés avant toute lecture, journal dédoublonné, état confirmé par l'API, réponse 200 après
 * enregistrement durable (400 si signature invalide, 5xx si l'enregistrement a échoué).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const rawBody = await request.text();
  const malipo = getMalipoRuntime();
  if (!malipo.deps) {
    return Response.json({ error: "payments_not_configured" }, { status: 503 });
  }
  try {
    const result = await handleWebhook(malipo.deps, {
      rawBody,
      signature: request.headers.get("x-webhook-signature"),
      timestamp: request.headers.get("x-webhook-timestamp"),
      secret: malipo.config.webhookSecret,
    });
    if (result.status >= 400) console.warn("[malipo] webhook refusé", result.status, result.body);
    return Response.json(result.body, { status: result.status });
  } catch (e) {
    console.error("[malipo] webhook : enregistrement impossible", e instanceof Error ? e.message : e);
    return Response.json({ error: "storage_failed" }, { status: 500 });
  }
}

export function GET() {
  return Response.json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "POST" } });
}
