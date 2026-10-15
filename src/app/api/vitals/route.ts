import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";
import { VITALS_METRICS } from "@/features/vitals/routes";

/** Réception des mesures de vitesse anonymes (voir components/layout/web-vitals.tsx). */
const schema = z.object({
  metric: z.enum(VITALS_METRICS),
  // CLS est envoyé multiplié par 1000 (entier) ; les autres métriques en millisecondes.
  value: z.number().finite().min(0).max(599_999),
  rating: z.enum(["good", "needs-improvement", "poor"]),
  route: z.string().min(1).max(60),
  connection: z.enum(["slow-2g", "2g", "3g", "4g"]).nullable(),
  data_saver: z.boolean(),
});

export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) {
    return new NextResponse(null, { status: 403 });
  }
  const raw = await request.text();
  if (raw.length > 1024) return new NextResponse(null, { status: 413 });
  let parsed;
  try {
    parsed = schema.safeParse(JSON.parse(raw));
  } catch {
    return new NextResponse(null, { status: 400 });
  }
  if (!parsed.success) return new NextResponse(null, { status: 400 });
  const v = parsed.data;
  const admin = getSupabaseAdminClient();
  if (!admin) return new NextResponse(null, { status: 204 });
  await admin.from("web_vitals").insert({ ...v, value: v.metric === "CLS" ? v.value / 1000 : v.value });
  if (Math.random() < 0.01) await admin.rpc("web_vitals_purge");
  return new NextResponse(null, { status: 204 });
}
