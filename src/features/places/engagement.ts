import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/features/auth/session";

/** Informations « vivantes » d'une fiche publique : horaires exceptionnels à venir et offres en cours. */
export interface SpecialHour {
  date: string;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
  note: string | null;
}
export interface ActivePromotion {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string;
  place_id: string;
  place_slug: string;
  place_name: string;
  logo_path: string | null;
  category_icon: string | null;
  category_color: string | null;
  unit_name: string | null;
}

export interface PlaceStory {
  id: string;
  body: string;
  photo_path: string | null;
  created_at: string;
  expires_at: string;
}
export interface ActiveStory extends PlaceStory {
  place_slug: string;
  place_name: string;
  logo_path: string | null;
  verification_status: string;
}

export const kisanganiToday = (offsetDays = 0) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lubumbashi" }).format(
    new Date(Date.now() + offsetDays * 86_400_000),
  );

export async function getPlaceLiveInfo(placeId: string) {
  const supabase = await createSupabaseServerClient();
  const [special, promos, stories, response] = await Promise.all([
    supabase
      .from("place_special_hours")
      .select("date, opens_at, closes_at, is_closed, note")
      .eq("place_id", placeId)
      .gte("date", kisanganiToday())
      .lte("date", kisanganiToday(14))
      .order("date")
      .overrideTypes<SpecialHour[], { merge: false }>(),
    supabase.rpc("active_promotions", { p_place_id: placeId, p_limit: 3 }),
    supabase
      .from("place_stories")
      .select("id, body, photo_path, created_at, expires_at")
      .eq("place_id", placeId)
      .eq("status", "published")
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(3)
      .overrideTypes<PlaceStory[], { merge: false }>(),
    supabase.rpc("place_response_stats", { p_place_id: placeId }),
  ]);
  const rs = ((response.data as
    { answered: number; median_minutes: number | null; fast: boolean }[] | null) ?? [])[0];
  return {
    specialHours: special.data ?? [],
    promotions: (promos.data as ActivePromotion[] | null) ?? [],
    stories: stories.data ?? [],
    /** Badge « Répond vite » : délai médian de réponse aux demandes ≤ 2 h (3 demandes traitées au moins). */
    respondsFast: rs?.fast === true ? { medianMinutes: rs.median_minutes ?? 0 } : null,
  };
}

/** Offres en cours (accueil : « Offres du moment »). Jamais sponsorisées, ordre = fin la plus proche. */
export async function getActivePromotions(limit = 8, unitId?: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("active_promotions", { p_limit: limit, p_unit_id: unitId ?? null });
  return (data as ActivePromotion[] | null) ?? [];
}

export interface MyReview {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  visit_month: string | null;
  status: string;
}

/** État du visiteur pour le formulaire d'avis : connecté ? gestionnaire ? avis existant ? */
export async function getMyReviewState(placeId: string) {
  const user = await getCurrentUser();
  if (!user) return { signedIn: false as const };
  const supabase = await createSupabaseServerClient();
  const [review, manager] = await Promise.all([
    supabase
      .from("reviews")
      .select("id, rating, title, body, visit_month, status")
      .eq("place_id", placeId)
      .eq("author_id", user.id)
      .maybeSingle<MyReview>(),
    supabase
      .from("place_owners")
      .select("place_id")
      .eq("place_id", placeId)
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);
  return { signedIn: true as const, isManager: Boolean(manager.data), review: review.data ?? null };
}

/** Nouveautés du jour (accueil), les plus récentes d'abord. */
export async function getActiveStories(limit = 10, unitId?: string) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("active_stories", { p_limit: limit, p_unit_id: unitId ?? null });
  return (data as ActiveStory[] | null) ?? [];
}
