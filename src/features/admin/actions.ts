"use server";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/features/auth/session";

export type ReviewState = { ok?: string; error?: string } | null;

const schema = z.object({
  id: z.string().uuid(),
  decision: z.enum(["approve", "reject", "needs_changes"]),
  notes: z
    .string()
    .trim()
    .max(1000)
    .transform((v) => (v === "" ? null : v)),
});

const MESSAGES: Record<string, string> = {
  "42501": "Action non autorisée (permission manquante, ou votre propre demande).",
  "22023": "Un motif est obligatoire pour refuser ou demander des corrections.",
  P0001: "Demande déjà traitée.",
  P0002: "Demande introuvable.",
};

function parse(form: FormData) {
  return schema.safeParse({
    id: form.get("id"),
    decision: form.get("decision"),
    notes: String(form.get("notes") ?? ""),
  });
}

/** Validation d'une fiche proposée (fonction SQL : permissions, audit, création du lieu). */
export async function reviewSubmission(_: ReviewState, form: FormData): Promise<ReviewState> {
  if (!(await getCurrentUser())) return { error: "Session expirée." };
  const parsed = parse(form);
  if (!parsed.success) return { error: "Décision invalide." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_place_submission", {
    p_submission_id: parsed.data.id,
    p_decision: parsed.data.decision,
    p_notes: parsed.data.notes,
    p_duplicate_of: null,
    p_publish: true,
  });
  if (error) return { error: MESSAGES[error.code ?? ""] ?? error.message };
  revalidatePath("/admin");
  return { ok: parsed.data.decision === "approve" ? "Fiche publiée." : "Décision enregistrée." };
}

export async function reviewClaim(_: ReviewState, form: FormData): Promise<ReviewState> {
  if (!(await getCurrentUser())) return { error: "Session expirée." };
  const parsed = parse(form);
  if (!parsed.success || parsed.data.decision === "needs_changes") return { error: "Décision invalide." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("review_place_claim", {
    p_claim_id: parsed.data.id,
    p_decision: parsed.data.decision,
    p_notes: parsed.data.notes,
  });
  if (error) return { error: MESSAGES[error.code ?? ""] ?? error.message };
  revalidatePath("/admin");
  return { ok: parsed.data.decision === "approve" ? "Accès à la fiche accordé." : "Demande refusée." };
}

// =============================================================================
// Modules de la console : chaque action revérifie la permission (en plus de la RLS
// et des fonctions SQL) et renvoie un message lisible.
// =============================================================================
type Supabase = Awaited<ReturnType<typeof createSupabaseServerClient>>;

async function withPermission(
  permission: string,
  fn: (supabase: Supabase, userId: string) => Promise<ReviewState>,
): Promise<ReviewState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expirée : reconnectez-vous." };
  const supabase = await createSupabaseServerClient();
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission: permission });
  if (allowed !== true) return { error: "Action non autorisée pour votre rôle." };
  try {
    return await fn(supabase, user.id);
  } catch (e) {
    const err = e as { code?: string; message?: string };
    return { error: MESSAGES[err.code ?? ""] ?? err.message ?? "Action impossible." };
  }
}

const str = (form: FormData, key: string) => String(form.get(key) ?? "").trim();
const optional = (form: FormData, key: string, max: number) => {
  const v = str(form, key);
  if (v.length > max) throw { message: `Texte trop long (${max} caractères maximum).` };
  return v === "" ? null : v;
};
const uuidOf = (form: FormData, key: string) => {
  const v = str(form, key);
  if (!/^[0-9a-f-]{36}$/i.test(v)) throw { message: "Identifiant invalide." };
  return v;
};

// ------------------------------------------------------------------- lieux
export async function adminUpdatePlace(_: ReviewState, form: FormData): Promise<ReviewState> {
  return withPermission("places.edit_any", async (supabase) => {
    const id = uuidOf(form, "id");
    const name = str(form, "name");
    if (name.length < 2 || name.length > 140) return { error: "Nom : 2 à 140 caractères." };
    const lat = str(form, "latitude");
    const lng = str(form, "longitude");
    const hasCoords = lat !== "" && lng !== "";
    if ((lat === "") !== (lng === "")) return { error: "Renseignez la latitude ET la longitude." };
    const latitude = hasCoords ? Number(lat.replace(",", ".")) : null;
    const longitude = hasCoords ? Number(lng.replace(",", ".")) : null;
    if (
      hasCoords &&
      (!Number.isFinite(latitude) ||
        !Number.isFinite(longitude) ||
        Math.abs(latitude!) > 90 ||
        Math.abs(longitude!) > 180)
    ) {
      return { error: "Coordonnées invalides." };
    }
    const precision = str(form, "geographic_precision");
    const activity = str(form, "activity_status");
    const { error } = await supabase
      .from("places")
      .update({
        name,
        official_name: optional(form, "official_name", 200),
        short_description: optional(form, "short_description", 280),
        full_description: optional(form, "full_description", 8000),
        primary_category_id: str(form, "primary_category_id") || null,
        administrative_unit_id: str(form, "administrative_unit_id") || null,
        address_text: optional(form, "address_text", 300),
        landmark_description: optional(form, "landmark_description", 500),
        directions: optional(form, "directions", 1000),
        latitude,
        longitude,
        geographic_precision: hasCoords
          ? precision || "approximate"
          : ["commune", "neighborhood"].includes(precision)
            ? precision
            : "unknown",
        activity_status: ["operating", "temporarily_closed", "permanently_closed", "unknown"].includes(
          activity,
        )
          ? activity
          : "unknown",
      })
      .eq("id", id);
    if (error) throw error;
    revalidatePath(`/admin/lieux/${id}`);
    revalidatePath("/lieux/[slug]", "page");
    return { ok: "Fiche enregistrée." };
  });
}

const PLACE_STATUS: Record<string, string> = {
  published: "Fiche publiée.",
  suspended: "Fiche suspendue (masquée du public).",
  archived: "Fiche archivée.",
  draft: "Fiche repassée en brouillon.",
};

export async function adminSetPlaceStatus(_: ReviewState, form: FormData): Promise<ReviewState> {
  const status = str(form, "status");
  if (!PLACE_STATUS[status]) return { error: "Statut invalide." };
  return withPermission(status === "archived" ? "places.archive" : "places.publish", async (supabase) => {
    const id = uuidOf(form, "id");
    const reason = optional(form, "reason", 500);
    if ((status === "suspended" || status === "archived") && !reason) {
      return { error: "Indiquez un motif pour suspendre ou archiver." };
    }
    const { error } = await supabase
      .from("places")
      .update({ publication_status: status, rejection_reason: status === "published" ? null : reason })
      .eq("id", id);
    if (error) throw error;
    revalidatePath(`/admin/lieux/${id}`);
    revalidatePath("/admin/lieux");
    return { ok: PLACE_STATUS[status] };
  });
}

export async function adminVerifyPlace(_: ReviewState, form: FormData): Promise<ReviewState> {
  return withPermission("places.publish", async (supabase) => {
    const id = uuidOf(form, "id");
    const { error } = await supabase.rpc("admin_verify_place", {
      p_place_id: id,
      p_notes: optional(form, "notes", 1000),
    });
    if (error) throw error;
    revalidatePath(`/admin/lieux/${id}`);
    return { ok: "Fiche marquée comme vérifiée par l'équipe." };
  });
}

// ---------------------------------------------------- signalements, avis, photos
export async function adminHandleReport(_: ReviewState, form: FormData): Promise<ReviewState> {
  return withPermission("reports.handle", async (supabase) => {
    const decision = str(form, "decision");
    const { error } = await supabase.rpc("handle_place_report", {
      p_report_id: uuidOf(form, "id"),
      p_decision: decision,
      p_notes: optional(form, "notes", 1000),
    });
    if (error) throw error;
    revalidatePath("/admin/signalements");
    return { ok: decision === "resolved" ? "Signalement résolu." : "Signalement classé sans suite." };
  });
}

export async function adminModerateReview(_: ReviewState, form: FormData): Promise<ReviewState> {
  return withPermission("reviews.moderate", async (supabase) => {
    const status = str(form, "decision");
    const { error } = await supabase.rpc("moderate_review", {
      p_review_id: uuidOf(form, "id"),
      p_status: status,
      p_reason: optional(form, "notes", 1000),
    });
    if (error) throw error;
    revalidatePath("/admin/avis");
    return { ok: status === "published" ? "Avis publié." : "Décision enregistrée." };
  });
}

export async function adminModerateMedia(_: ReviewState, form: FormData): Promise<ReviewState> {
  return withPermission("media.moderate", async (supabase) => {
    const decision = str(form, "decision");
    const { error } = await supabase.rpc("moderate_media", {
      p_media_id: uuidOf(form, "id"),
      p_decision: decision,
      p_reason: optional(form, "notes", 500),
    });
    if (error) throw error;
    revalidatePath("/admin/medias");
    revalidatePath("/lieux/[slug]", "page");
    return { ok: decision === "approved" ? "Photo approuvée." : "Photo refusée." };
  });
}

// --------------------------------------------------------------- catégories
export async function adminToggleCategory(_: ReviewState, form: FormData): Promise<ReviewState> {
  return withPermission("categories.manage", async (supabase) => {
    const field = str(form, "field");
    if (field !== "is_active" && field !== "is_featured") return { error: "Champ invalide." };
    const value = str(form, "value") === "true";
    const { error } = await supabase
      .from("categories")
      .update({ [field]: value })
      .eq("id", uuidOf(form, "id"));
    if (error) throw error;
    revalidatePath("/admin/categories");
    revalidatePath("/", "layout");
    return { ok: "Catégorie mise à jour." };
  });
}

// ------------------------------------------------------------- utilisateurs
export async function adminSetRole(_: ReviewState, form: FormData): Promise<ReviewState> {
  return withPermission("roles.manage", async (supabase, me) => {
    const userId = uuidOf(form, "user_id");
    const role = str(form, "role");
    const grant = str(form, "grant") === "true";
    if (!/^[a-z_]+$/.test(role)) return { error: "Rôle invalide." };
    if (!grant && userId === me && role === "super_admin") {
      return { error: "Vous ne pouvez pas retirer votre propre rôle de super-administrateur." };
    }
    const { error } = grant
      ? await supabase.from("user_roles").insert({ user_id: userId, role_key: role })
      : await supabase.from("user_roles").delete().eq("user_id", userId).eq("role_key", role);
    if (error && error.code !== "23505") throw error;
    revalidatePath("/admin/utilisateurs");
    return { ok: grant ? "Rôle attribué." : "Rôle retiré." };
  });
}

export async function adminSetUserStatus(_: ReviewState, form: FormData): Promise<ReviewState> {
  return withPermission("users.manage", async (supabase, me) => {
    const userId = uuidOf(form, "user_id");
    const status = str(form, "status");
    if (status !== "active" && status !== "suspended") return { error: "Statut invalide." };
    if (userId === me) return { error: "Vous ne pouvez pas suspendre votre propre compte." };
    const reason = optional(form, "reason", 500);
    if (status === "suspended" && !reason) return { error: "Indiquez le motif de la suspension." };
    const { error } = await supabase
      .from("profiles")
      .update({ status, suspended_reason: status === "suspended" ? reason : null })
      .eq("id", userId);
    if (error) throw error;
    revalidatePath("/admin/utilisateurs");
    return { ok: status === "suspended" ? "Compte suspendu." : "Compte réactivé." };
  });
}

// -------------------------------------------------------------- paramètres
export async function adminUpdateSetting(_: ReviewState, form: FormData): Promise<ReviewState> {
  return withPermission("settings.manage", async (supabase) => {
    const key = str(form, "key");
    const type = str(form, "type");
    const raw = str(form, "value");
    let value: unknown;
    if (type === "boolean") value = raw === "true";
    else if (type === "number") {
      value = Number(raw.replace(",", "."));
      if (!Number.isFinite(value)) return { error: "Nombre invalide." };
    } else if (type === "string") value = raw;
    else if (type === "null") value = raw === "" ? null : raw;
    else {
      try {
        value = JSON.parse(raw);
      } catch {
        return { error: "JSON invalide." };
      }
    }
    const { error } = await supabase.from("application_settings").update({ value }).eq("key", key);
    if (error) throw error;
    revalidatePath("/admin/parametres");
    return { ok: `« ${key} » enregistré.` };
  });
}
