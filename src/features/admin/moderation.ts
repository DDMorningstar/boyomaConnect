import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export interface PendingSubmission {
  id: string;
  submitted_by: string;
  name: string;
  owner_request: boolean;
  short_description: string | null;
  address_text: string | null;
  landmark_description: string | null;
  latitude: number | null;
  longitude: number | null;
  gps_accuracy_m: number | null;
  contacts: { kind: string; value: string }[];
  photo_paths: string[];
  logo_path: string | null;
  created_at: string;
  category: { name: string } | null;
  unit: { name: string } | null;
}

export interface PendingClaim {
  id: string;
  claimant_id: string;
  claimant_role: string;
  contact_phone: string | null;
  contact_email: string | null;
  message: string | null;
  created_at: string;
  place: { slug: string; name: string } | null;
}

/** File de modération (RLS : visible seulement avec submissions.review / claims.review). */
export async function getModerationQueue() {
  const supabase = await createSupabaseServerClient();
  const [subs, claims] = await Promise.all([
    supabase
      .from("place_submissions")
      .select(
        `id, submitted_by, name, owner_request, short_description, address_text, landmark_description,
         latitude, longitude, gps_accuracy_m, contacts, photo_paths, logo_path, created_at,
         category:categories (name), unit:geographic_units (name)`,
      )
      .eq("status", "pending")
      .order("created_at")
      .limit(50)
      .overrideTypes<PendingSubmission[], { merge: false }>(),
    supabase
      .from("place_claims")
      .select(
        "id, claimant_id, claimant_role, contact_phone, contact_email, message, created_at, place:places (slug, name)",
      )
      .eq("status", "pending")
      .order("created_at")
      .limit(50)
      .overrideTypes<PendingClaim[], { merge: false }>(),
  ]);
  const userIds = [
    ...new Set([
      ...(subs.data ?? []).map((s) => s.submitted_by),
      ...(claims.data ?? []).map((c) => c.claimant_id),
    ]),
  ];
  const { data: profiles } = userIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", userIds)
    : { data: [] };
  const names = new Map(
    ((profiles ?? []) as { id: string; display_name: string | null }[]).map((p) => [p.id, p.display_name]),
  );
  return { submissions: subs.data ?? [], claims: claims.data ?? [], names };
}
