"use server";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { env } from "@/lib/env";
import { getCurrentUser, safeNext } from "./session";

export type AuthState = { ok?: string; error?: string; unconfirmedEmail?: string } | null;

const email = z.string().trim().toLowerCase().email("Adresse e-mail invalide.").max(254);
const password = z
  .string()
  .min(8, "Le mot de passe doit contenir au moins 8 caractères.")
  .max(72, "72 caractères maximum.");

const EMAIL_UNAVAILABLE =
  "L'envoi des e-mails de confirmation est momentanément indisponible. Utilisez la connexion Google ou réessayez plus tard.";

/** Origine du site pour les liens envoyés par e-mail (domaine de production ou préversion courante). */
async function siteOrigin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  return host ? `${proto}://${host}` : env.NEXT_PUBLIC_SITE_URL;
}

const callback = async (next: string) =>
  `${await siteOrigin()}/auth/callback?next=${encodeURIComponent(next)}`;

export async function signInWithEmail(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z.object({ email, password: z.string().min(1, "Mot de passe requis.") }).safeParse({
    email: form.get("email"),
    password: form.get("password"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return {
        error: "Adresse e-mail pas encore confirmée : ouvrez le lien reçu par e-mail.",
        unconfirmedEmail: parsed.data.email,
      };
    }
    if (error.status === 429) return { error: "Trop de tentatives. Patientez quelques minutes." };
    return { error: "E-mail ou mot de passe incorrect." };
  }
  revalidatePath("/", "layout");
  redirect(safeNext(String(form.get("next") ?? "")));
}

export async function signUpWithEmail(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = z
    .object({
      display_name: z.string().trim().min(2, "Indiquez votre nom (2 caractères minimum).").max(80),
      email,
      password,
      terms: z.literal("on", { errorMap: () => ({ message: "Acceptez les conditions d'utilisation." }) }),
    })
    .safeParse({
      display_name: form.get("display_name"),
      email: form.get("email"),
      password: form.get("password"),
      terms: form.get("terms"),
    });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const next = safeNext(String(form.get("next") ?? ""));
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.display_name },
      emailRedirectTo: await callback(next),
    },
  });
  if (error) {
    if (error.code === "weak_password")
      return { error: "Mot de passe trop faible : allongez-le ou variez-le." };
    if (error.code === "email_address_not_authorized" || error.code === "over_email_send_rate_limit") {
      return { error: EMAIL_UNAVAILABLE };
    }
    if (error.status === 429) return { error: "Trop de demandes. Patientez quelques minutes." };
    return { error: "Inscription impossible pour le moment. Réessayez." };
  }
  if (data.session) {
    revalidatePath("/", "layout");
    redirect(next);
  }
  // Réponse identique que l'adresse soit déjà inscrite ou non (pas d'énumération des comptes).
  return {
    ok: `Presque terminé : ouvrez l'e-mail envoyé à ${parsed.data.email} et cliquez sur le lien de confirmation (vérifiez aussi les courriers indésirables).`,
    unconfirmedEmail: parsed.data.email,
  };
}

export async function resendConfirmation(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { error: "Adresse e-mail invalide." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email: parsed.data,
    options: { emailRedirectTo: await callback("/profil") },
  });
  if (error?.status === 429) return { error: "Patientez quelques minutes avant un nouvel envoi." };
  return { ok: "Si un compte existe pour cette adresse, un nouvel e-mail de confirmation a été envoyé." };
}

export async function requestPasswordReset(_: AuthState, form: FormData): Promise<AuthState> {
  const parsed = email.safeParse(form.get("email"));
  if (!parsed.success) return { error: "Adresse e-mail invalide." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: await callback("/profil/mot-de-passe"),
  });
  if (error?.status === 429) return { error: "Patientez quelques minutes avant un nouvel envoi." };
  return {
    ok: "Si un compte existe pour cette adresse, un e-mail avec un lien pour choisir un nouveau mot de passe a été envoyé.",
  };
}

/** Nouveau mot de passe (après le lien « mot de passe oublié », ou depuis le compte). */
export async function updatePassword(_: AuthState, form: FormData): Promise<AuthState> {
  if (!(await getCurrentUser())) return { error: "Lien expiré : demandez un nouvel e-mail." };
  const parsed = z
    .object({ password, confirm: z.string() })
    .refine((v) => v.password === v.confirm, { message: "Les deux mots de passe ne correspondent pas." })
    .safeParse({ password: form.get("password"), confirm: form.get("confirm") });
  if (!parsed.success) return { error: parsed.error.issues[0]?.message };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) {
    if (error.code === "same_password") return { error: "Choisissez un mot de passe différent de l'ancien." };
    if (error.code === "weak_password") return { error: "Mot de passe trop faible." };
    return { error: "Modification impossible. Réessayez." };
  }
  return { ok: "Mot de passe enregistré." };
}
