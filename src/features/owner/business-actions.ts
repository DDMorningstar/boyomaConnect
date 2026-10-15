"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getCurrentUser } from "@/features/auth/session";
import { ImageError, optimizeImage } from "@/lib/images";

/**
 * Actions de la console « gérer son business » (décision D32). Chaque action revérifie la session ;
 * les droits sont contrôlés en base (RLS et fonctions SECURITY DEFINER journalisées).
 */
export type BizState = { ok?: string; error?: string } | null;

const uuid = z.string().uuid();
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const text = (form: FormData, key: string) => String(form.get(key) ?? "").trim();

const MESSAGES: Record<string, string> = {
  "42501": "Action non autorisée pour votre rôle.",
  P0002: "Élément introuvable ou expiré.",
};

async function session(form: FormData) {
  const user = await getCurrentUser();
  if (!user) throw new Error("Session expirée : reconnectez-vous.");
  const placeId = uuid.safeParse(text(form, "place_id"));
  if (!placeId.success) throw new Error("Fiche inconnue.");
  return { supabase: await createSupabaseServerClient(), placeId: placeId.data, user };
}

function done(placeId: string, section: string, message: string): BizState {
  revalidatePath(`/espace-pro/lieux/${placeId}`, "layout");
  revalidatePath("/lieux/[slug]", "page");
  if (section) revalidatePath(`/espace-pro/lieux/${placeId}/${section}`);
  return { ok: message };
}

function fail(e: unknown): BizState {
  const err = e as { code?: string; message?: string };
  if (err?.code && MESSAGES[err.code]) return { error: MESSAGES[err.code] };
  return { error: err?.message && err.message.length < 200 ? err.message : "Action impossible. Réessayez." };
}

// ------------------------------------------------------------------ horaires
/** Semaine type : jusqu'à 2 créneaux par jour (ex. 08:00–12:00 et 14:00–18:00). */
export async function saveWeeklyHours(_: BizState, form: FormData): Promise<BizState> {
  try {
    const { supabase, placeId } = await session(form);
    const rows: {
      place_id: string;
      day_of_week: number;
      opens_at: string | null;
      closes_at: string | null;
      is_closed: boolean;
    }[] = [];
    for (let day = 1; day <= 7; day++) {
      if (form.get(`closed-${day}`) === "on") {
        rows.push({ place_id: placeId, day_of_week: day, opens_at: null, closes_at: null, is_closed: true });
        continue;
      }
      for (const slot of [1, 2]) {
        const opens = text(form, `open-${day}-${slot}`);
        const closes = text(form, `close-${day}-${slot}`);
        if (!opens && !closes) continue;
        if (!TIME.test(opens) || !TIME.test(closes) || opens === closes) {
          return {
            error: `Horaire invalide (${["", "lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"][day]}).`,
          };
        }
        rows.push({
          place_id: placeId,
          day_of_week: day,
          opens_at: opens,
          closes_at: closes,
          is_closed: false,
        });
      }
    }
    const { error: delError } = await supabase.from("place_hours").delete().eq("place_id", placeId);
    if (delError) throw delError;
    if (rows.length) {
      const { error } = await supabase.from("place_hours").insert(rows);
      if (error) throw error;
    }
    await supabase
      .from("places")
      .update({ hours_verified_at: rows.length ? new Date().toISOString() : null })
      .eq("id", placeId);
    return done(placeId, "horaires", rows.length ? "Horaires enregistrés." : "Horaires effacés.");
  } catch (e) {
    return fail(e);
  }
}

export async function addSpecialHours(_: BizState, form: FormData): Promise<BizState> {
  try {
    const { supabase, placeId } = await session(form);
    const date = text(form, "date");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: "Date invalide." };
    const closed = form.get("is_closed") === "on";
    const opens = text(form, "opens_at");
    const closes = text(form, "closes_at");
    if (!closed && (!TIME.test(opens) || !TIME.test(closes)))
      return { error: "Indiquez les heures ou cochez « Fermé »." };
    const note = text(form, "note").slice(0, 200) || null;
    await supabase.from("place_special_hours").delete().eq("place_id", placeId).eq("date", date);
    const { error } = await supabase.from("place_special_hours").insert({
      place_id: placeId,
      date,
      is_closed: closed,
      opens_at: closed ? null : opens,
      closes_at: closed ? null : closes,
      note,
    });
    if (error) throw error;
    return done(placeId, "horaires", "Horaire exceptionnel enregistré.");
  } catch (e) {
    return fail(e);
  }
}

export async function deleteSpecialHours(_: BizState, form: FormData): Promise<BizState> {
  try {
    const { supabase, placeId } = await session(form);
    const id = uuid.parse(text(form, "id"));
    const { error } = await supabase
      .from("place_special_hours")
      .delete()
      .eq("id", id)
      .eq("place_id", placeId);
    if (error) throw error;
    return done(placeId, "horaires", "Horaire exceptionnel supprimé.");
  } catch (e) {
    return fail(e);
  }
}

/** « Fermé aujourd'hui » (heure de Kisangani) : bascule. */
export async function toggleClosedToday(_: BizState, form: FormData): Promise<BizState> {
  try {
    const { supabase, placeId } = await session(form);
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lubumbashi" }).format(new Date());
    if (text(form, "decision") === "on") {
      await supabase.from("place_special_hours").delete().eq("place_id", placeId).eq("date", today);
      const { error } = await supabase.from("place_special_hours").insert({
        place_id: placeId,
        date: today,
        is_closed: true,
        note: "Fermé exceptionnellement aujourd'hui",
      });
      if (error) throw error;
      return done(placeId, "horaires", "Affiché « Fermé aujourd'hui » sur votre fiche.");
    }
    const { error } = await supabase
      .from("place_special_hours")
      .delete()
      .eq("place_id", placeId)
      .eq("date", today);
    if (error) throw error;
    return done(placeId, "horaires", "Horaires habituels rétablis pour aujourd'hui.");
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ demandes
export async function setInquiryStatus(_: BizState, form: FormData): Promise<BizState> {
  try {
    const { supabase, placeId } = await session(form);
    const { error } = await supabase.rpc("set_inquiry_status", {
      p_inquiry_id: uuid.parse(text(form, "id")),
      p_status: text(form, "decision"),
    });
    if (error) throw error;
    return done(placeId, "demandes", "Demande mise à jour.");
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ offres
export async function submitPromotion(_: BizState, form: FormData): Promise<BizState> {
  try {
    const { supabase, placeId } = await session(form);
    const title = text(form, "title");
    if (title.length < 3 || title.length > 120) return { error: "Titre : 3 à 120 caractères." };
    const start = text(form, "starts_at");
    const end = text(form, "ends_at");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end))
      return { error: "Dates invalides." };
    // Journées entières à l'heure de Kisangani (UTC+2).
    const { error } = await supabase.rpc("submit_promotion", {
      p_place_id: placeId,
      p_title: title,
      p_description: text(form, "description").slice(0, 1000) || null,
      p_starts_at: `${start}T00:00:00+02:00`,
      p_ends_at: `${end}T23:59:59+02:00`,
    });
    if (error) throw error;
    return done(placeId, "offres", "Offre envoyée : publiée après une vérification rapide par l'équipe.");
  } catch (e) {
    return fail(e);
  }
}

export async function endPromotion(_: BizState, form: FormData): Promise<BizState> {
  try {
    const { supabase, placeId } = await session(form);
    const { error } = await supabase
      .from("promotions")
      .update({ status: "ended" })
      .eq("id", uuid.parse(text(form, "id")))
      .eq("place_id", placeId);
    if (error) throw error;
    return done(placeId, "offres", "Offre arrêtée.");
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ avis
export async function respondToReview(_: BizState, form: FormData): Promise<BizState> {
  try {
    const { supabase, placeId } = await session(form);
    const response = text(form, "response");
    if (response.length > 2000) return { error: "2 000 caractères maximum." };
    const { error } = await supabase
      .from("reviews")
      .update({ owner_response: response || null })
      .eq("id", uuid.parse(text(form, "id")))
      .eq("place_id", placeId);
    if (error) throw error;
    return done(placeId, "avis", response ? "Réponse publiée sous l'avis." : "Réponse retirée.");
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ équipe
export async function inviteMember(_: BizState, form: FormData): Promise<BizState> {
  try {
    const { supabase, placeId } = await session(form);
    const email = z.string().trim().toLowerCase().email().safeParse(text(form, "email"));
    if (!email.success) return { error: "Adresse e-mail invalide." };
    const { error } = await supabase.rpc("invite_place_member", { p_place_id: placeId, p_email: email.data });
    if (error) throw error;
    return done(
      placeId,
      "equipe",
      "Invitation créée : la personne l'accepte depuis son Espace pro, en se connectant avec cette adresse.",
    );
  } catch (e) {
    return fail(e);
  }
}

export async function manageMember(_: BizState, form: FormData): Promise<BizState> {
  try {
    const { supabase, placeId } = await session(form);
    const action = text(form, "decision");
    const { error } = await supabase.rpc("manage_place_member", {
      p_place_id: placeId,
      p_target: uuid.parse(text(form, "id")),
      p_action: action,
    });
    if (error) throw error;
    return done(placeId, "equipe", action === "remove" ? "Accès retiré." : "Invitation annulée.");
  } catch (e) {
    return fail(e);
  }
}

export async function respondInvitation(_: BizState, form: FormData): Promise<BizState> {
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Session expirée : reconnectez-vous." };
    const supabase = await createSupabaseServerClient();
    const accept = text(form, "decision") === "accept";
    const { error } = await supabase.rpc("respond_place_invitation", {
      p_invitation_id: uuid.parse(text(form, "id")),
      p_accept: accept,
    });
    if (error) throw error;
    revalidatePath("/espace-pro");
    return {
      ok: accept ? "Invitation acceptée : la fiche apparaît dans vos établissements." : "Invitation refusée.",
    };
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ vérification
export async function requestVerification(_: BizState, form: FormData): Promise<BizState> {
  try {
    const { supabase, placeId } = await session(form);
    const phone = text(form, "phone");
    if (phone && !/^\+?[0-9 ]{6,20}$/.test(phone)) return { error: "Numéro de téléphone invalide." };
    const { error } = await supabase.rpc("request_place_verification", {
      p_place_id: placeId,
      p_phone: phone || null,
      p_preferred: text(form, "preferred").slice(0, 120) || null,
      p_notes: text(form, "notes").slice(0, 500) || null,
    });
    if (error) throw error;
    return done(
      placeId,
      "verification",
      "Demande envoyée : l'équipe vous contacte pour convenir d'une visite.",
    );
  } catch (e) {
    return fail(e);
  }
}

export async function cancelVerification(_: BizState, form: FormData): Promise<BizState> {
  try {
    const { supabase, placeId } = await session(form);
    const { error } = await supabase.rpc("handle_verification_request", {
      p_request_id: uuid.parse(text(form, "id")),
      p_decision: "cancel",
      p_scheduled_for: null,
      p_notes: null,
    });
    if (error) throw error;
    return done(placeId, "verification", "Demande annulée.");
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ abonnement
/** Demande d'abonnement : facture + paiement « manuel » en attente (jamais confirmé ici). */
export async function startPlanRequest(_: BizState, form: FormData): Promise<BizState> {
  try {
    const { supabase, placeId } = await session(form);
    const { data: instructions } = await supabase.rpc("billing_instructions");
    if (!instructions) return { error: "Le paiement des abonnements n'est pas encore ouvert." };
    const plan = text(form, "decision");
    if (!/^[a-z_]{2,30}$/.test(plan)) return { error: "Plan invalide." };
    const { error } = await supabase.rpc("start_subscription_checkout", {
      p_place_id: placeId,
      p_plan_key: plan,
      p_provider: "manual",
      p_idempotency_key: `${placeId}:${plan}:${randomUUID()}`,
    });
    if (error) throw error;
    return done(
      placeId,
      "abonnement",
      "Demande créée : payez selon les instructions puis indiquez la référence.",
    );
  } catch (e) {
    return fail(e);
  }
}

export async function submitPaymentReference(_: BizState, form: FormData): Promise<BizState> {
  try {
    const { supabase, placeId } = await session(form);
    const { error } = await supabase.rpc("submit_payment_reference", {
      p_payment_id: uuid.parse(text(form, "id")),
      p_reference: text(form, "reference"),
    });
    if (error) throw error;
    return done(
      placeId,
      "abonnement",
      "Référence envoyée : l'équipe vérifie la transaction puis active votre plan.",
    );
  } catch (e) {
    return fail(e);
  }
}

export async function cancelPlanRequest(_: BizState, form: FormData): Promise<BizState> {
  try {
    const { supabase, placeId } = await session(form);
    const { error } = await supabase.rpc("cancel_pending_subscription", {
      p_subscription_id: uuid.parse(text(form, "id")),
    });
    if (error) throw error;
    return done(placeId, "abonnement", "Demande d'abonnement annulée.");
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------------ notifications
export async function markNotificationsRead(_: BizState, form: FormData): Promise<BizState> {
  const user = await getCurrentUser();
  if (!user) return { error: "Session expirée." };
  const supabase = await createSupabaseServerClient();
  const id = text(form, "id");
  const { error } = await supabase.rpc("mark_notifications_read", { p_ids: id ? [id] : null });
  if (error) return { error: "Action impossible." };
  revalidatePath("/notifications");
  return { ok: "Notifications marquées comme lues." };
}

// ------------------------------------------------------------------ nouveauté du jour (24 h)
/** Publie une nouveauté visible 24 h (texte, photo facultative optimisée, sans métadonnées). */
export async function publishStory(_: BizState, form: FormData): Promise<BizState> {
  try {
    const { supabase, placeId, user } = await session(form);
    const body = text(form, "body");
    if (body.length < 3 || body.length > 200) return { error: "Texte : 3 à 200 caractères." };
    let photoPath: string | null = null;
    const file = form.get("photo");
    if (file instanceof File && file.size > 0) {
      const image = await optimizeImage(file, "photo");
      photoPath = `places/${placeId}/stories/${randomUUID()}.webp`;
      const { error: up } = await supabase.storage
        .from("place-media")
        .upload(photoPath, image.data, { contentType: image.contentType, cacheControl: "31536000" });
      if (up) return { error: "Envoi de la photo impossible. Réessayez." };
    }
    const { error } = await supabase
      .from("place_stories")
      .insert({ place_id: placeId, author_id: user.id, body, photo_path: photoPath });
    if (error) {
      if (photoPath) await supabase.storage.from("place-media").remove([photoPath]);
      throw error;
    }
    revalidatePath("/");
    return done(placeId, "", "Nouveauté publiée : visible 24 h sur votre fiche et à l'accueil.");
  } catch (e) {
    if (e instanceof ImageError) return { error: e.message };
    return fail(e);
  }
}

export async function deleteStory(_: BizState, form: FormData): Promise<BizState> {
  try {
    const { supabase, placeId } = await session(form);
    const id = uuid.parse(text(form, "id"));
    const { data } = await supabase
      .from("place_stories")
      .select("photo_path")
      .eq("id", id)
      .eq("place_id", placeId)
      .maybeSingle<{ photo_path: string | null }>();
    const { error } = await supabase.from("place_stories").delete().eq("id", id).eq("place_id", placeId);
    if (error) throw error;
    if (data?.photo_path) await supabase.storage.from("place-media").remove([data.photo_path]);
    revalidatePath("/");
    return done(placeId, "", "Nouveauté retirée.");
  } catch (e) {
    return fail(e);
  }
}
