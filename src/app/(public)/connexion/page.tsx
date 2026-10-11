import type { Metadata } from "next";
import { InfoPage } from "@/components/ui/info-page";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Connexion", robots: { index: false } };

export default function Page() {
  return (
    <InfoPage
      title="Connexion"
      intro="Les comptes utilisateurs ouvrent à la phase 4 (authentification Supabase)."
    >
      <p>
        En attendant, toutes les fonctions de consultation sont disponibles sans compte : recherche, carte,
        fiches et favoris locaux.
      </p>
      <ButtonLink href="/explorer">Explorer les lieux</ButtonLink>
    </InfoPage>
  );
}
