import "server-only";
import webpush from "web-push";
import { getSupabaseAdminClient } from "@/lib/supabase/admin";

/**
 * Notifications push (Web Push, VAPID). Clés : NEXT_PUBLIC_VAPID_PUBLIC_KEY (publique),
 * VAPID_PRIVATE_KEY (secrète, serveur), VAPID_SUBJECT (mailto: du responsable). Sans clés, rien n'est envoyé.
 */
export function pushConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT,
  );
}

let ready = false;
function init() {
  if (ready || !pushConfigured()) return ready;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT!,
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
    process.env.VAPID_PRIVATE_KEY!,
  );
  ready = true;
  return ready;
}

export interface PushPayload {
  title: string;
  body: string;
  url: string;
  tag?: string;
}

/** Envoie aux gestionnaires d'une fiche ; supprime les abonnements expirés (404/410). */
export async function sendPushToPlace(placeId: string, payload: PushPayload) {
  if (!init()) return { sent: 0, skipped: "not_configured" as const };
  const admin = getSupabaseAdminClient();
  if (!admin) return { sent: 0, skipped: "no_admin" as const };
  const { data } = await admin.rpc("place_manager_push_targets", { p_place_id: placeId });
  const targets = (data as { id: string; endpoint: string; p256dh: string; auth: string }[] | null) ?? [];
  let sent = 0;
  await Promise.all(
    targets.map(async (t) => {
      try {
        await webpush.sendNotification(
          { endpoint: t.endpoint, keys: { p256dh: t.p256dh, auth: t.auth } },
          JSON.stringify({ ...payload, body: payload.body.slice(0, 240) }),
          { TTL: 60 * 60 * 24, urgency: "high" },
        );
        sent++;
        await admin
          .from("push_subscriptions")
          .update({ last_success_at: new Date().toISOString() })
          .eq("id", t.id);
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) await admin.from("push_subscriptions").delete().eq("id", t.id);
      }
    }),
  );
  return { sent };
}
