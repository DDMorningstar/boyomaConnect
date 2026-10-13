"use server";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/**
 * Demande d'un visiteur à un établissement (décision D32) : un message, pas une commande. L'envoi
 * passe par send_business_inquiry (limites anti-abus par empreinte d'appareil, jamais stockée en clair).
 */
export type InquiryState = { ok?: string; error?: string } | null;

const schema = z
  .object({
    place_id: z.string().uuid(),
    item_id: z.union([z.string().uuid(), z.literal("")]),
    kind: z.enum(["contact", "quote", "reservation"]),
    name: z.string().trim().min(2, "Indiquez votre nom.").max(80),
    phone: z
      .string()
      .trim()
      .max(20)
      .refine((v) => !v || /^\+?[0-9 ]{6,20}$/.test(v), "Numéro de téléphone invalide."),
    email: z.union([
      z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(160),
      z.literal(""),
    ]),
    message: z.string().trim().min(5, "Votre message est trop court.").max(1500, "1 500 caractères maximum."),
  })
  .refine((v) => v.phone || v.email, { message: "Indiquez un téléphone ou un e-mail pour être recontacté." });

const MESSAGES: Record<string, string> = {
  P0001: "Trop de demandes envoyées : réessayez plus tard.",
  P0002: "Établissement introuvable.",
  "42501": "Vous gérez cet établissement : impossible de vous envoyer une demande.",
};

export async function sendInquiry(_: InquiryState, form: FormData): Promise<InquiryState> {
  // Champ piège invisible : rempli uniquement par les robots.
  if (String(form.get("website") ?? "") !== "") return { ok: "Message envoyé." };
  const parsed = schema.safeParse(
    Object.fromEntries(
      ["place_id", "item_id", "kind", "name", "phone", "email", "message"].map((k) => [
        k,
        String(form.get(k) ?? ""),
      ]),
    ),
  );
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Formulaire invalide." };
  const v = parsed.data;
  const h = await headers();
  const ip = (h.get("x-forwarded-for") ?? "").split(",")[0]?.trim() || h.get("x-real-ip") || "inconnue";
  const fingerprint = createHash("sha256")
    .update(`boyoma-inquiry|${ip}|${h.get("user-agent") ?? ""}`)
    .digest("hex");
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("send_business_inquiry", {
    p_place_id: v.place_id,
    p_kind: v.kind,
    p_catalog_item_id: v.item_id || null,
    p_name: v.name,
    p_phone: v.phone || null,
    p_email: v.email || null,
    p_message: v.message,
    p_fingerprint: fingerprint,
  });
  if (error)
    return {
      error:
        MESSAGES[error.code ?? ""] ?? "Envoi impossible. Réessayez ou contactez directement l'établissement.",
    };
  return { ok: "Message envoyé : l'établissement vous recontactera directement." };
}
