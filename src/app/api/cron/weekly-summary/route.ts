import { timingSafeEqual } from "node:crypto";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { sendPushToPlace } from "@/lib/push";

/**
 * Bilan hebdomadaire (Vercel Cron, lundi) : notification dans l'application pour chaque établissement
 * géré, et notification push sur les téléphones abonnés. Protégé par CRON_SECRET.
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
  const admin = getSupabaseAdminClient();
  if (!admin) return Response.json({ skipped: "SUPABASE_SECRET_KEY manquante" });
  const { data, error } = await admin.rpc("send_weekly_summaries");
  if (error) return Response.json({ error: "summary_failed" }, { status: 500 });
  const rows = (data as { place_id: string; title: string; body: string }[] | null) ?? [];
  let pushed = 0;
  for (const r of rows) {
    const res = await sendPushToPlace(r.place_id, {
      title: r.title,
      body: r.body,
      url: `/espace-pro/lieux/${r.place_id}`,
      tag: "summary",
    });
    pushed += res.sent;
  }
  return Response.json({ places: rows.length, pushed });
}
