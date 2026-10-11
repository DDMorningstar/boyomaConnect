"use server";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ImageError, optimizeImage } from "@/lib/images";
import { getCurrentUser } from "@/features/auth/session";

export type ActionState = {
  ok?: string;
  error?: string;
  duplicates?: { slug: string; name: string }[];
} | null;

const BUCKET = "place-media";
const uuid = z.string().uuid();

// ---------------------------------------------------------------- validation
const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Texte trop long (${max} caractères maximum).`)
    .transform((v) => (v === "" ? null : v));

/** Numéro de téléphone public : chiffres, espaces et « + » initial (format accepté par la base). */
const phoneSchema = z
  .string()
  .trim()
  .transform((v) =>
    v
      .replace(/[^+0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  )
  .refine((v) => /^\+?[0-9 ]{6,20}$/.test(v), "Numéro de téléphone invalide (ex. +243 81 234 5678).");

const optionalPhone = z
  .string()
  .trim()
  .transform((v) =>
    v
      .replace(/[^+0-9 ]/g, "")
      .replace(/\s+/g, " ")
      .trim(),
  )
  .refine((v) => v === "" || /^\+?[0-9 ]{6,20}$/.test(v), "Numéro WhatsApp invalide.")
  .transform((v) => (v === "" ? null : v));

const optionalEmail = z
  .string()
  .trim()
  .refine((v) => v === "" || /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v), "Adresse e-mail invalide.")
  .transform((v) => (v === "" ? null : v));

const optionalUrl = z
  .string()
  .trim()
  .transform((v) => (v && !/^https?:\/\//i.test(v) ? `https://${v}` : v))
  // Un vrai nom de domaine est exigé (ex. « monsite.cd », « facebook.com/mapage »).
  .refine(
    (v) => v === "" || (/^https?:\/\/[^\s/.]+(\.[^\s/.]+)+(\/\S*)?$/i.test(v) && v.length <= 300),
    "Adresse du site invalide (ex. monsite.cd ou facebook.com/mapage).",
  )
  .transform((v) => (v === "" ? null : v));

const text = (form: FormData, key: string) => String(form.get(key) ?? "");
const firstError = (e: z.ZodError) => e.issues[0]?.message ?? "Formulaire invalide.";

async function requireSession() {
  const user = await getCurrentUser();
  if (!user) throw new Error("SESSION");
  return { user, supabase: await createSupabaseServerClient() };
}

async function uploadOptimized(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  folder: string,
  file: File,
  preset: "photo" | "logo",
) {
  const image = await optimizeImage(file, preset);
  const path = `${folder}/${randomUUID()}.webp`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, image.data, { contentType: image.contentType, cacheControl: "31536000" });
  if (error) throw new ImageError("Envoi de l'image impossible. Réessayez.");
  return { path, ...image };
}

const files = (form: FormData, key: string) =>
  form.getAll(key).filter((f): f is File => f instanceof File && f.size > 0);

// ------------------------------------------------- création d'une fiche
const listingSchema = z
  .object({
    name: z.string().trim().min(2, "Nom trop court.").max(140, "140 caractères maximum."),
    category_id: uuid.catch(""),
    commune_id: uuid.catch(""),
    address_text: optionalText(300),
    landmark_description: optionalText(500),
    short_description: optionalText(280),
    phone: phoneSchema,
    whatsapp: optionalPhone,
    email: optionalEmail,
    website: optionalUrl,
    latitude: z.coerce.number().min(-90).max(90).nullable().catch(null),
    longitude: z.coerce.number().min(-180).max(180).nullable().catch(null),
    gps_accuracy_m: z.coerce.number().min(0).max(100000).nullable().catch(null),
  })
  .refine((v) => v.category_id !== "", { message: "Choisissez une catégorie." })
  .refine((v) => v.commune_id !== "", { message: "Choisissez la commune." });

/** Demande de création de fiche par un propriétaire (publiée après validation). */
export async function createListing(_: ActionState, form: FormData): Promise<ActionState> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { error: "Session expirée : reconnectez-vous." };
  }
  const { user, supabase } = session;

  const num = (k: string) => (text(form, k) === "" ? null : text(form, k));
  const parsed = listingSchema.safeParse({
    name: text(form, "name"),
    category_id: text(form, "category_id"),
    commune_id: text(form, "commune_id"),
    address_text: text(form, "address_text"),
    landmark_description: text(form, "landmark_description"),
    short_description: text(form, "short_description"),
    phone: text(form, "phone"),
    whatsapp: text(form, "whatsapp"),
    email: text(form, "email"),
    website: text(form, "website"),
    latitude: num("latitude"),
    longitude: num("longitude"),
    gps_accuracy_m: num("gps_accuracy_m"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const v = parsed.data;
  const hasCoords = v.latitude != null && v.longitude != null;

  const photos = files(form, "photos");
  if (photos.length > 3) return { error: "3 photos maximum." };
  const logo = files(form, "logo")[0];

  // Doublons probables (ex. lieu déjà importé) : proposer la réclamation plutôt qu'une 2e fiche.
  if (text(form, "confirm_new") !== "1") {
    // Nom proche dans un rayon de 300 m (si position), ou nom identique dans la commune ou la ville
    // (les lieux importés sont rattachés à la ville).
    const { data: city } = await supabase
      .from("geographic_units")
      .select("id")
      .eq("slug", "kisangani")
      .eq("type_key", "ville")
      .maybeSingle();
    const unitIds = [v.commune_id, city?.id].filter((x): x is string => Boolean(x));
    const found = await Promise.all(
      unitIds.map((unitId, i) =>
        supabase.rpc("find_duplicate_places", {
          p_name: v.name,
          p_latitude: i === 0 && hasCoords ? v.latitude : null,
          p_longitude: i === 0 && hasCoords ? v.longitude : null,
          p_radius_m: 300,
          p_unit_id: unitId,
          p_limit: 5,
        }),
      ),
    );
    const seen = new Set<string>();
    const candidates = found
      .flatMap((r) => (r.data ?? []) as { slug: string; name: string; publication_status: string }[])
      .filter((d) => d.publication_status === "published" && !seen.has(d.slug) && seen.add(d.slug));
    if (candidates.length > 0) {
      return {
        error:
          "Un établissement au nom proche existe déjà. Si c'est le vôtre, réclamez-le au lieu d'en créer un nouveau.",
        duplicates: candidates.map((d) => ({ slug: d.slug, name: d.name })),
      };
    }
  }

  const uploaded: string[] = [];
  try {
    const folder = `submissions/${user.id}`;
    const logoPath = logo ? (await uploadOptimized(supabase, folder, logo, "logo")).path : null;
    if (logoPath) uploaded.push(logoPath);
    for (const photo of photos) {
      uploaded.push((await uploadOptimized(supabase, folder, photo, "photo")).path);
    }
    const contacts = [
      { kind: "phone", value: v.phone },
      ...(v.whatsapp ? [{ kind: "whatsapp", value: v.whatsapp }] : []),
      ...(v.email ? [{ kind: "email", value: v.email }] : []),
      ...(v.website ? [{ kind: "website", value: v.website }] : []),
    ];
    const { error } = await supabase.from("place_submissions").insert({
      client_operation_id: randomUUID(),
      submitted_by: user.id,
      source: "public",
      owner_request: true,
      name: v.name,
      primary_category_id: v.category_id,
      administrative_unit_id: v.commune_id,
      address_text: v.address_text,
      landmark_description: v.landmark_description,
      short_description: v.short_description,
      latitude: hasCoords ? v.latitude : null,
      longitude: hasCoords ? v.longitude : null,
      gps_accuracy_m: hasCoords ? v.gps_accuracy_m : null,
      coordinates_source: hasCoords ? "gps_device" : "unknown",
      contacts,
      photo_paths: uploaded.filter((p) => p !== logoPath),
      logo_path: logoPath,
    });
    if (error) throw new Error(error.message);
  } catch (e) {
    if (uploaded.length) await supabase.storage.from(BUCKET).remove(uploaded);
    return {
      error:
        e instanceof ImageError ? e.message : "Envoi impossible. Vérifiez les informations et réessayez.",
    };
  }
  revalidatePath("/espace-pro");
  redirect("/espace-pro?envoye=fiche");
}

// ------------------------------------------------- réclamation d'une fiche existante
const claimSchema = z.object({
  place_id: uuid,
  claimant_role: z.enum(["owner", "manager", "employee", "other"]),
  contact_phone: phoneSchema,
  message: optionalText(2000),
});

export async function claimPlace(_: ActionState, form: FormData): Promise<ActionState> {
  let session;
  try {
    session = await requireSession();
  } catch {
    return { error: "Session expirée : reconnectez-vous." };
  }
  const parsed = claimSchema.safeParse({
    place_id: text(form, "place_id"),
    claimant_role: text(form, "claimant_role"),
    contact_phone: text(form, "contact_phone"),
    message: text(form, "message"),
  });
  if (!parsed.success) return { error: firstError(parsed.error) };
  const { error } = await session.supabase
    .from("place_claims")
    .insert({ ...parsed.data, claimant_id: session.user.id, contact_email: session.user.email ?? null });
  if (error) {
    return {
      error:
        error.code === "23505"
          ? "Vous avez déjà une demande en cours pour cette fiche."
          : "Envoi impossible.",
    };
  }
  revalidatePath("/espace-pro");
  redirect("/espace-pro?envoye=reclamation");
}

// ------------------------------------------------- gestion d'une fiche validée
async function managerSession(form: FormData) {
  const placeId = uuid.safeParse(text(form, "place_id"));
  if (!placeId.success) throw new Error("Fiche inconnue.");
  const session = await requireSession();
  const { data } = await session.supabase
    .from("place_owners")
    .select("place_id")
    .eq("place_id", placeId.data)
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (!data) throw new Error("Vous ne gérez pas cette fiche.");
  return { ...session, placeId: placeId.data };
}

function fail(e: unknown): ActionState {
  if (e instanceof ImageError) return { error: e.message };
  if (e instanceof Error && e.message === "SESSION") return { error: "Session expirée : reconnectez-vous." };
  if (e instanceof Error && /^(Fiche inconnue|Vous ne gérez)/.test(e.message)) return { error: e.message };
  return { error: "Enregistrement impossible. Réessayez." };
}

function done(placeId: string, message: string): ActionState {
  revalidatePath(`/espace-pro/lieux/${placeId}`);
  revalidatePath("/lieux/[slug]", "page");
  return { ok: message };
}

const infoSchema = z.object({
  short_description: optionalText(280),
  full_description: optionalText(8000),
  address_text: optionalText(300),
  landmark_description: optionalText(500),
  directions: optionalText(1000),
  price_range: z.coerce.number().int().min(1).max(4).nullable().catch(null),
  currency: z.enum(["USD", "CDF"]).nullable().catch(null),
  payment_methods: z
    .string()
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 10)
        .map((s) => s.slice(0, 40)),
    )
    .catch([]),
});

export async function updatePlaceInfo(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase, placeId } = await managerSession(form);
    const parsed = infoSchema.safeParse({
      short_description: text(form, "short_description"),
      full_description: text(form, "full_description"),
      address_text: text(form, "address_text"),
      landmark_description: text(form, "landmark_description"),
      directions: text(form, "directions"),
      price_range: text(form, "price_range") || null,
      currency: text(form, "currency") || null,
      payment_methods: text(form, "payment_methods"),
    });
    if (!parsed.success) return { error: firstError(parsed.error) };
    const { error } = await supabase.from("places").update(parsed.data).eq("id", placeId);
    if (error) throw error;
    return done(placeId, "Informations enregistrées.");
  } catch (e) {
    return fail(e);
  }
}

const contactsSchema = z.object({
  phone: phoneSchema,
  whatsapp: optionalPhone,
  email: optionalEmail,
  website: optionalUrl,
});

/** Contacts publics : le téléphone est obligatoire (garanti aussi par un trigger en base). */
export async function saveContacts(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase, placeId } = await managerSession(form);
    const parsed = contactsSchema.safeParse({
      phone: text(form, "phone"),
      whatsapp: text(form, "whatsapp"),
      email: text(form, "email"),
      website: text(form, "website"),
    });
    if (!parsed.success) return { error: firstError(parsed.error) };
    const v = parsed.data;
    const { data: current } = await supabase
      .from("place_contacts")
      .select("id, kind, is_primary")
      .eq("place_id", placeId);
    const rows: { id: string; kind: string; is_primary: boolean }[] = current ?? [];

    // Téléphone : mise à jour du principal (jamais de suppression du dernier numéro).
    const phone =
      rows.find((r) => r.kind === "phone" && r.is_primary) ?? rows.find((r) => r.kind === "phone");
    const phoneRes = phone
      ? await supabase.from("place_contacts").update({ value: v.phone, verified_at: null }).eq("id", phone.id)
      : await supabase
          .from("place_contacts")
          .insert({ place_id: placeId, kind: "phone", value: v.phone, is_primary: true, sort_order: 0 });
    if (phoneRes.error) throw phoneRes.error;

    for (const [kind, value, order] of [
      ["whatsapp", v.whatsapp, 1],
      ["email", v.email, 2],
      ["website", v.website, 3],
    ] as const) {
      const ids = rows.filter((r) => r.kind === kind).map((r) => r.id);
      if (ids.length) {
        const { error } = await supabase.from("place_contacts").delete().in("id", ids);
        if (error) throw error;
      }
      if (value) {
        const { error } = await supabase
          .from("place_contacts")
          .insert({ place_id: placeId, kind, value, sort_order: order });
        if (error) throw error;
      }
    }
    return done(placeId, "Contacts enregistrés.");
  } catch (e) {
    return fail(e);
  }
}

export async function uploadLogo(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase, placeId } = await managerSession(form);
    const { data: place } = await supabase.from("places").select("logo_path").eq("id", placeId).single();
    const { path } = await uploadOptimized(supabase, `places/${placeId}`, form.get("logo") as File, "logo");
    const { error } = await supabase.from("places").update({ logo_path: path }).eq("id", placeId);
    if (error) {
      await supabase.storage.from(BUCKET).remove([path]);
      throw error;
    }
    const old: string | null = place?.logo_path ?? null;
    if (old?.startsWith(`places/${placeId}/`)) await supabase.storage.from(BUCKET).remove([old]);
    return done(placeId, "Logo mis à jour.");
  } catch (e) {
    return fail(e);
  }
}

/** Ajout d'une photo (3 maximum sur le plan gratuit, limite vérifiée en base). */
export async function addPhoto(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase, placeId, user } = await managerSession(form);
    const image = await uploadOptimized(supabase, `places/${placeId}`, form.get("photo") as File, "photo");
    const { count } = await supabase
      .from("place_media")
      .select("id", { count: "exact", head: true })
      .eq("place_id", placeId);
    const { error } = await supabase.from("place_media").insert({
      place_id: placeId,
      storage_path: image.path,
      kind: "gallery",
      moderation_status: "approved",
      uploaded_by: user.id,
      width: image.width,
      height: image.height,
      bytes: image.bytes,
      mime_type: image.contentType,
      sort_order: count ?? 0,
    });
    if (error) {
      await supabase.storage.from(BUCKET).remove([image.path]);
      return { error: /Limite de/.test(error.message) ? error.message : "Enregistrement impossible." };
    }
    return done(placeId, "Photo ajoutée.");
  } catch (e) {
    return fail(e);
  }
}

export async function deletePhoto(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase, placeId } = await managerSession(form);
    const mediaId = uuid.parse(text(form, "media_id"));
    const { data: media } = await supabase
      .from("place_media")
      .select("storage_path")
      .eq("id", mediaId)
      .eq("place_id", placeId)
      .maybeSingle();
    if (!media) return { error: "Photo introuvable." };
    const { error } = await supabase.from("place_media").delete().eq("id", mediaId);
    if (error) throw error;
    await supabase.storage.from(BUCKET).remove([media.storage_path]);
    return done(placeId, "Photo supprimée.");
  } catch (e) {
    return fail(e);
  }
}

// ------------------------------------------------------------- catalogue
const catalogSchema = z
  .object({
    id: uuid.nullable().catch(null),
    kind: z.enum(["product", "service"]),
    name: z.string().trim().min(2, "Nom de l'article trop court.").max(120, "120 caractères maximum."),
    description: optionalText(2000),
    price: z
      .string()
      .trim()
      .transform((v) => v.replace(/\s/g, "").replace(",", "."))
      .refine((v) => v === "" || (/^\d{1,10}(\.\d{1,2})?$/.test(v) && Number(v) >= 0), "Prix invalide.")
      .transform((v) => (v === "" ? null : Number(v))),
    currency: z.enum(["USD", "CDF"]),
    availability: z.enum(["available", "on_request", "unavailable", "unknown"]),
  })
  .transform((v) => ({ ...v, currency: v.price == null ? null : v.currency }));

export async function saveCatalogItem(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase, placeId } = await managerSession(form);
    const parsed = catalogSchema.safeParse({
      id: text(form, "id") || null,
      kind: text(form, "kind"),
      name: text(form, "name"),
      description: text(form, "description"),
      price: text(form, "price"),
      currency: text(form, "currency") || "USD",
      availability: text(form, "availability") || "available",
    });
    if (!parsed.success) return { error: firstError(parsed.error) };
    const { id, ...item } = parsed.data;
    if (id) {
      const { error } = await supabase
        .from("catalog_items")
        .update(item)
        .eq("id", id)
        .eq("place_id", placeId);
      if (error) throw error;
      return done(placeId, "Article mis à jour.");
    }
    const { count } = await supabase
      .from("catalog_items")
      .select("id", { count: "exact", head: true })
      .eq("place_id", placeId);
    if ((count ?? 0) >= 100) return { error: "100 articles maximum par catalogue." };
    const { error } = await supabase
      .from("catalog_items")
      .insert({ ...item, place_id: placeId, sort_order: count ?? 0 });
    if (error) throw error;
    return done(placeId, "Article ajouté au catalogue.");
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCatalogItem(_: ActionState, form: FormData): Promise<ActionState> {
  try {
    const { supabase, placeId } = await managerSession(form);
    const id = uuid.parse(text(form, "id"));
    const { error } = await supabase.from("catalog_items").delete().eq("id", id).eq("place_id", placeId);
    if (error) throw error;
    return done(placeId, "Article supprimé.");
  } catch (e) {
    return fail(e);
  }
}
