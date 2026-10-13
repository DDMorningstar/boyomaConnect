import { timingSafeEqual } from "node:crypto";
import { getMalipoRuntime } from "@/features/payments/malipo/server";
import { reconcile } from "@/features/payments/malipo/service";

/**
 * Rapprochement planifié (Vercel Cron) : relit chez Malipo les paiements restés en attente.
 * Protégé par CRON_SECRET (en-tête Authorization: Bearer …, envoyé automatiquement par Vercel).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(header: string | null) {
  const secret = process.env.CRON_SECRET ?? "";
  if (secret.length < 16 || !header) return false;
  const a = Buffer.from(header);
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(request: Request) {
  if (!authorized(request.headers.get("authorization"))) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  const malipo = getMalipoRuntime();
  if (!malipo.available || !malipo.deps) {
    return Response.json({ skipped: malipo.reason }, { status: 200 });
  }
  const results = await reconcile(malipo.deps, 100);
  return Response.json({
    checked: results.length,
    results: results.map((r) => ({ result: r.result, status: r.status })),
  });
}
