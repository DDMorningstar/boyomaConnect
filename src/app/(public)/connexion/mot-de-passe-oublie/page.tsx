import type { Metadata } from "next";
import Link from "next/link";
import { InfoPage } from "@/components/ui/info-page";
import { ResetRequestForm } from "./reset-request-form";

export const metadata: Metadata = { title: "Mot de passe oublié", robots: { index: false } };

export default function ForgotPasswordPage() {
  return (
    <InfoPage
      title="Mot de passe oublié"
      intro="Indiquez l'adresse e-mail de votre compte : vous recevrez un lien pour choisir un nouveau mot de passe."
    >
      <ResetRequestForm />
      <p className="text-sm">
        <Link href="/connexion" className="text-brand">
          ← Retour à la connexion
        </Link>
      </p>
    </InfoPage>
  );
}
