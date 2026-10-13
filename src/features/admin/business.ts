import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Files d'attente « business » de la console (décision D32) : offres, vérifications, paiements. */
export interface AdminPromotion {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  created_at: string;
  place: { id: string; name: string; slug: string } | null;
}

export async function listPromotionsAdmin(status: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("promotions")
    .select("id, title, description, starts_at, ends_at, status, created_at, place:places (id, name, slug)")
    .eq("status", status)
    .order("created_at", { ascending: status === "pending_review" })
    .limit(100)
    .overrideTypes<AdminPromotion[], { merge: false }>();
  return data ?? [];
}

export interface AdminVerification {
  id: string;
  status: string;
  contact_phone: string | null;
  preferred_time: string | null;
  notes: string | null;
  scheduled_for: string | null;
  admin_notes: string | null;
  created_at: string;
  place: {
    id: string;
    name: string;
    slug: string;
    address_text: string | null;
    landmark_description: string | null;
  } | null;
}

export async function listVerificationsAdmin(status: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("verification_requests")
    .select(
      "id, status, contact_phone, preferred_time, notes, scheduled_for, admin_notes, created_at, place:places (id, name, slug, address_text, landmark_description)",
    )
    .eq("status", status)
    .order("created_at", { ascending: true })
    .limit(100)
    .overrideTypes<AdminVerification[], { merge: false }>();
  return data ?? [];
}

export interface AdminPayment {
  id: string;
  provider: string;
  status: string;
  provider_reference: string | null;
  amount: number;
  currency: string;
  created_at: string;
  updated_at: string;
  failure_reason: string | null;
  invoice: {
    id: string;
    description: string;
    subscription_id: string | null;
    place: { id: string; name: string; slug: string } | null;
  } | null;
}

export async function listPaymentsAdmin(status: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("payments")
    .select(
      "id, provider, status, provider_reference, amount, currency, created_at, updated_at, failure_reason, invoice:invoices (id, description, subscription_id, place:places (id, name, slug))",
    )
    .eq("status", status)
    .in("provider", ["manual", "bank_transfer"])
    .order("updated_at", { ascending: status === "pending" })
    .limit(100)
    .overrideTypes<AdminPayment[], { merge: false }>();
  return data ?? [];
}

export async function getBusinessQueueCounts() {
  const supabase = await createSupabaseServerClient();
  const head = { count: "exact" as const, head: true };
  const [promos, verifs, pays] = await Promise.all([
    supabase.from("promotions").select("id", head).eq("status", "pending_review"),
    supabase.from("verification_requests").select("id", head).eq("status", "pending"),
    supabase
      .from("payments")
      .select("id", head)
      .eq("status", "pending")
      .not("provider_reference", "is", null),
  ]);
  return { promotions: promos.count ?? 0, verifications: verifs.count ?? 0, payments: pays.count ?? 0 };
}
