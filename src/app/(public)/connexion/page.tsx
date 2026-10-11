import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { InfoPage } from "@/components/ui/info-page";
import { getCurrentUser, safeNext } from "@/features/auth/session";
import { GoogleButton } from "./google-button";

export const metadata: Metadata = { title: "Connexion", robots: { index: false } };

const ERRORS: Record<string, string> = {
  provider: "Google a refusé ou annulé la connexion. Réessayez.",
  exchange: "La connexion a expiré ou a déjà été utilisée. Réessayez.",
};

type Props = { searchParams: Promise<{ next?: string; erreur?: string }> };

export default async function LoginPage({ searchParams }: Props) {
  const { next: rawNext, erreur } = await searchParams;
  const next = safeNext(rawNext);
  if (await getCurrentUser()) redirect(next);

  return (
    <InfoPage
      title="Connexion"
      intro="Un seul bouton pour vous connecter ou créer votre compte, avec votre compte Google."
    >
      {erreur && ERRORS[erreur] && (
        <p role="alert" className="bg-danger/10 text-danger rounded-2xl p-3 text-sm">
          {ERRORS[erreur]}
        </p>
      )}
      <GoogleButton next={next} />
      <ul className="text-muted text-sm">
        <li>Propriétaires : créez la fiche de votre établissement, votre catalogue et vos photos.</li>
        <li>Visiteurs : la recherche, la carte et les favoris restent utilisables sans compte.</li>
      </ul>
      <p className="text-muted flex items-start gap-2 text-xs">
        <ShieldCheck className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
        <span>
          Nous recevons de Google uniquement votre nom, votre adresse e-mail et votre photo de profil. En
          continuant, vous acceptez les <Link href="/conditions">conditions d&apos;utilisation</Link> et la{" "}
          <Link href="/confidentialite">politique de confidentialité</Link>.
        </span>
      </p>
    </InfoPage>
  );
}
