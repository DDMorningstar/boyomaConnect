import type { Metadata } from "next";
import { InfoPage } from "@/components/ui/info-page";
import { requireUser } from "@/features/auth/session";
import { PasswordForm } from "./password-form";

export const metadata: Metadata = { title: "Mot de passe", robots: { index: false } };

export default async function PasswordPage() {
  const user = await requireUser("/profil/mot-de-passe");
  return (
    <InfoPage title="Choisir un mot de passe" intro={user.email ?? undefined}>
      <PasswordForm />
    </InfoPage>
  );
}
