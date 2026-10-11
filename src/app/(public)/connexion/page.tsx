import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { InfoPage } from "@/components/ui/info-page";
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
    <InfoPage
      title="Connexion"
      intro="Connectez-vous ou créez votre compte avec Google, ou avec votre adresse e-mail."
    >
      {erreur && ERRORS[erreur] && (
        <p role="alert" className="bg-danger/10 text-danger rounded-2xl p-3 text-sm">
          {ERRORS[erreur]}
        </p>
      )}
      <GoogleButton next={next} disabled={googleEnabled === false} />
      <div className="text-muted flex items-center gap-3 text-sm" aria-hidden="true">
        <span className="bg-line h-px flex-1" /> ou <span className="bg-line h-px flex-1" />
      </div>
      <EmailForm next={next} />
      <ul className="text-muted text-sm">
        <li>Propriétaires : créez la fiche de votre établissement, votre catalogue et vos photos.</li>
        <li>Visiteurs : la recherche, la carte et les favoris restent utilisables sans compte.</li>
      </ul>
      <p className="text-muted flex items-start gap-2 text-xs">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Avec Google, nous recevons uniquement votre nom, votre adresse e-mail et votre photo de profil. En
          continuant, vous acceptez les <Link href="/conditions">conditions d&apos;utilisation</Link> et la{" "}
          <Link href="/confidentialite">politique de confidentialité</Link>.
        </span>
      </p>
    </InfoPage>
  );
}
