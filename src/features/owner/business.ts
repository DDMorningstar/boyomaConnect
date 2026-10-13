import "server-only";
import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/features/auth/session";
import { getManagedPlace, type ManagedPlace } from "./queries";

/**
 * Console « gérer son business » (décision D32) : lectures côté serveur. Les droits sont vérifiés en
 * base (RLS, fonctions SECURITY DEFINER) ; ici, la fiche n'est chargée que pour un gestionnaire.
 */

/** Fiche gérée par l'utilisateur connecté (mise en cache pour la requête : layout + page). */
export const getConsolePlace = cache(async (placeId: string): Promise<ManagedPlace | null> => {
  const user = await getCurrentUser();
  if (!user) return null;
  return getManagedPlace(placeId, user.id);
});

// ------------------------------------------------------------------ statistiques
export interface DailyStat {
  day: string;
  views: number;
  calls: number;
  whatsapp: number;
  directions: number;
  shares: number;
  favorites: number;
  website: number;
}
export type StatKey = Exclude<keyof DailyStat, "day">;
export interface PlaceStats {
  days: 7 | 30 | 90;
  series: DailyStat[];
  totals: Record<StatKey, number>;
  previous: Record<StatKey, number>;
  top_items: { id: string; name: string; views: number; contacts: number }[];
  inquiries_new: number;
  reviews: { count: number; average: number | null };
  plan: string;
}

export async function getPlaceStats(placeId: string, days: number) {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("owner_place_stats", { p_place_id: placeId, p_days: days });
  if (error)
    return { stats: null, error: error.code === "P0004" ? error.message : "Statistiques indisponibles." };
  return { stats: data as PlaceStats, error: null };
}

export { completeness, type CompletenessStep } from "./completeness";

// ------------------------------------------------------------------ demandes
export interface Inquiry {
  id: string;
  kind: "contact" | "quote" | "reservation";
  sender_name: string;
  sender_phone: string | null;
  sender_email: string | null;
  message: string;
  status: "new" | "read" | "answered" | "closed";
  created_at: string;
  handled_at: string | null;
  item: { id: string; name: string } | null;
}

export async function getInquiries(placeId: string, status?: string) {
  const supabase = await createSupabaseServerClient();
  let q = supabase
    .from("business_inquiries")
    .select(
      "id, kind, sender_name, sender_phone, sender_email, message, status, created_at, handled_at, item:catalog_items (id, name)",
    )
    .eq("place_id", placeId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (status) q = q.eq("status", status);
  const { data } = await q.overrideTypes<Inquiry[], { merge: false }>();
  return data ?? [];
}

export async function countNewInquiries(placeId: string) {
  const supabase = await createSupabaseServerClient();
  const { count } = await supabase
    .from("business_inquiries")
    .select("id", { count: "exact", head: true })
    .eq("place_id", placeId)
    .eq("status", "new");
  return count ?? 0;
}

// ------------------------------------------------------------------ offres
export interface Promotion {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  status: "draft" | "pending_review" | "active" | "ended" | "rejected";
  created_at: string;
}

export async function getPromotions(placeId: string) {
  const supabase = await createSupabaseServerClient();
  const [{ data }, { data: allowed }] = await Promise.all([
    supabase
      .from("promotions")
      .select("id, title, description, starts_at, ends_at, status, created_at")
      .eq("place_id", placeId)
      .order("created_at", { ascending: false })
      .overrideTypes<Promotion[], { merge: false }>(),
    supabase.rpc("place_has_feature", { p_place_id: placeId, p_feature: "promotions" }),
  ]);
  return { promotions: data ?? [], allowed: allowed === true };
}

// ------------------------------------------------------------------ avis
export interface OwnerReview {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: string;
  owner_response: string | null;
  owner_response_at: string | null;
  created_at: string;
  visit_month: string | null;
}

export async function getOwnerReviews(placeId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("reviews")
    .select("id, rating, title, body, status, owner_response, owner_response_at, created_at, visit_month")
    .eq("place_id", placeId)
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .overrideTypes<OwnerReview[], { merge: false }>();
  return data ?? [];
}

// ------------------------------------------------------------------ équipe
export interface Member {
  user_id: string;
  display_name: string;
  avatar_url: string | null;
  role: "owner" | "manager";
  since: string;
  is_me: boolean;
}
export interface Invitation {
  id: string;
  email: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export async function getTeam(placeId: string) {
  const supabase = await createSupabaseServerClient();
  const [members, invitations] = await Promise.all([
    supabase.rpc("place_members", { p_place_id: placeId }),
    supabase
      .from("place_invitations")
      .select("id, email, status, created_at, expires_at")
      .eq("place_id", placeId)
      .eq("status", "pending")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .overrideTypes<Invitation[], { merge: false }>(),
  ]);
  return { members: (members.data as Member[] | null) ?? [], invitations: invitations.data ?? [] };
}

export async function getMyInvitations() {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("my_place_invitations");
  return (
    (data as
      | { id: string; place_id: string; place_name: string; place_slug: string; expires_at: string }[]
      | null) ?? []
  );
}

// ------------------------------------------------------------------ vérification
export interface VerificationRequest {
  id: string;
  status: "pending" | "scheduled" | "completed" | "rejected" | "cancelled";
  contact_phone: string | null;
  preferred_time: string | null;
  notes: string | null;
  scheduled_for: string | null;
  admin_notes: string | null;
  created_at: string;
  handled_at: string | null;
}

export async function getVerificationRequests(placeId: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("verification_requests")
    .select(
      "id, status, contact_phone, preferred_time, notes, scheduled_for, admin_notes, created_at, handled_at",
    )
    .eq("place_id", placeId)
    .order("created_at", { ascending: false })
    .limit(10)
    .overrideTypes<VerificationRequest[], { merge: false }>();
  return data ?? [];
}

// ------------------------------------------------------------------ abonnement
export interface Plan {
  id: string;
  key: string;
  name: string;
  description: string | null;
  price_monthly: number;
  currency: string;
  sort_order: number;
  plan_features: { feature_key: string; value: unknown; label: string | null }[];
}
export interface Subscription {
  id: string;
  status: string;
  current_period_start: string | null;
  current_period_end: string | null;
  created_at: string;
  plan: { key: string; name: string } | null;
}
export interface Invoice {
  id: string;
  number: string | null;
  description: string;
  amount: number;
  currency: string;
  status: string;
  issued_at: string | null;
  due_at: string | null;
  paid_at: string | null;
  subscription_id: string | null;
  payments: {
    id: string;
    provider: string;
    status: string;
    provider_reference: string | null;
    failure_reason: string | null;
    amount: number;
  }[];
}

export async function getBilling(placeId: string) {
  const supabase = await createSupabaseServerClient();
  const [plans, subs, invoices, activePlan, instructions] = await Promise.all([
    supabase
      .from("plans")
      .select(
        "id, key, name, description, price_monthly, currency, sort_order, plan_features (feature_key, value, label)",
      )
      .eq("is_active", true)
      .eq("is_public", true)
      .order("sort_order")
      .overrideTypes<Plan[], { merge: false }>(),
    supabase
      .from("subscriptions")
      .select("id, status, current_period_start, current_period_end, created_at, plan:plans (key, name)")
      .eq("place_id", placeId)
      .order("created_at", { ascending: false })
      .limit(10)
      .overrideTypes<Subscription[], { merge: false }>(),
    supabase
      .from("invoices")
      .select(
        "id, number, description, amount, currency, status, issued_at, due_at, paid_at, subscription_id, payments (id, provider, status, provider_reference, failure_reason, amount)",
      )
      .eq("place_id", placeId)
      .order("created_at", { ascending: false })
      .limit(20)
      .overrideTypes<Invoice[], { merge: false }>(),
    supabase.rpc("place_active_plan", { p_place_id: placeId }),
    supabase.rpc("billing_instructions"),
  ]);
  return {
    plans: plans.data ?? [],
    subscriptions: subs.data ?? [],
    invoices: invoices.data ?? [],
    activePlan: (activePlan.data as string | null) ?? "free",
    instructions: (instructions.data as string | null) ?? null,
  };
}

// ------------------------------------------------------------------ notifications
export interface AppNotification {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
}

export async function getNotifications(limit = 50) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("notifications")
    .select("id, kind, title, body, link, read_at, created_at")
    .order("created_at", { ascending: false })
    .limit(limit)
    .overrideTypes<AppNotification[], { merge: false }>();
  return data ?? [];
}
