"use server";
import { headers } from "next/headers";
import { z } from "zod";
import { getCurrentUser } from "@/features/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Abonnement de cet appareil aux notifications push du compte connecté. */
const subSchema = z.object({
  endpoint: z.string().url().startsWith("https://").max(1000),
  keys: z.object({ p256dh: z.string().min(10).max(200), auth: z.string().min(4).max(100) }),
});

export async function savePushSubscription(raw: unknown): Promise<{ ok?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Connectez-vous pour activer les notifications." };
  const parsed = subSchema.safeParse(raw);
  if (!parsed.success) return { error: "Abonnement invalide." };
  const supabase = await createSupabaseServerClient();
  const ua = (await headers()).get("user-agent")?.slice(0, 300) ?? null;
  // Un même appareil peut changer de compte : on remplace l'éventuel ancien abonnement de ce compte.
  await supabase.from("push_subscriptions").delete().eq("endpoint", parsed.data.endpoint);
  const { error } = await supabase.from("push_subscriptions").insert({
    user_id: user.id,
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    user_agent: ua,
  });
  if (error) return { error: "Activation impossible pour le moment." };
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<{ ok?: true; error?: string }> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expirée." };
  const supabase = await createSupabaseServerClient();
  await supabase.from("push_subscriptions").delete().eq("endpoint", endpoint.slice(0, 1000));
  return { ok: true };
}
