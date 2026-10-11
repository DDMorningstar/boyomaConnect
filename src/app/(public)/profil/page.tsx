import type { Metadata } from "next";
import { UserRound } from "lucide-react";
import { InfoPage } from "@/components/ui/info-page";
import { PrivacySettings } from "./privacy-settings";

export const metadata: Metadata = { title: "Mon compte", robots: { index: false } };

export default function ProfilePage() {
  return (
    <InfoPage title="Compte">
      <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <UserRound className="mt-0.5 size-5 shrink-0 text-brand" aria-hidden="true" />
        <p className="text-sm">
          La création de compte (phase 4) n&apos;est pas encore ouverte. Vous pouvez déjà rechercher, consulter les fiches et
          enregistrer vos favoris sur cet appareil sans inscription.
        </p>
      </div>
      <h2>Confidentialité sur cet appareil</h2>
      <PrivacySettings />
    </InfoPage>
  );
}
