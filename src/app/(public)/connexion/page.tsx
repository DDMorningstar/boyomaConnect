import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { LogoMark } from "@/components/layout/logo";
import { getCurrentUser, isGoogleAuthEnabled, safeNext } from "@/features/auth/session";
import { EmailForm } from "./email-form";
import { GoogleButton } from "./google-button";

export const metadata: Metadata = { title: "Connexion", robots: { index: false } };

const ERRORS: Record<string, string> = {
  provider: "La connexion a été refusée ou annulée. Réessayez.",
  exchange:
    "Ce lien a expiré, a déjà été utilisé ou a été ouvert dans un autre navigateur. Si vous venez de confirmer votre adresse e-mail, connectez-vous ci-dessous avec votre mot de passe.",
};

type Props = { searchParams: Promise<{ next?: string; erreur?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next: rawNext, erreur } = await searchParams;
  const next = safeNext(rawNext);
  if (await getCurrentUser()) redirect(next);
  const googleEnabled = await isGoogleAuthEnabled();

  return (
    <div className="mx-auto flex min-h-[calc(100dvh-9rem)] w-full max-w-md flex-col justify-center py-8">
      <div className="border-line bg-surface rounded-[1.75rem] border p-6 shadow-[var(--shadow-card)] sm:p-8">
        <div className="flex flex-col items-center text-center">
          <LogoMark className="size-12" />
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight">Bienvenue sur Boyoma Connect</h1>
          <p className="text-muted mt-1.5 text-sm">
            Connectez-vous ou créez votre compte pour gérer votre établissement, vos photos et votre
            catalogue.
          </p>
        </div>

        {erreur && ERRORS[erreur] && (
          <p role="alert" className="bg-danger/10 text-danger mt-5 rounded-2xl p-3 text-sm">
            {ERRORS[erreur]}
          </p>
        )}

        <div className="mt-6">
          <GoogleButton next={next} disabled={googleEnabled === false} />
        </div>

        <div className="text-muted my-6 flex items-center gap-3 text-xs font-medium tracking-wide uppercase">
          <span className="bg-line h-px flex-1" aria-hidden="true" />
          ou avec votre e-mail
          <span className="bg-line h-px flex-1" aria-hidden="true" />
        </div>

        <EmailForm next={next} />
      </div>

      <p className="text-muted mt-5 flex items-start justify-center gap-2 px-2 text-center text-xs">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          En continuant, vous acceptez les <Link href="/conditions">conditions d&apos;utilisation</Link> et la{" "}
          <Link href="/confidentialite">politique de confidentialité</Link>. Avec Google, nous recevons
          uniquement votre nom, votre e-mail et votre photo de profil.
        </span>
      </p>
      <p className="text-muted mt-2 text-center text-xs">
        Pas besoin de compte pour rechercher, consulter la carte ou enregistrer des favoris.{" "}
        <Link href="/explorer" className="text-brand font-semibold">
          Explorer
        </Link>
      </p>
    </div>
  );
}
