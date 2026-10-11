import type { Metadata } from "next";
import { PlusCircle, Search } from "lucide-react";
import { InfoPage } from "@/components/ui/info-page";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Ajouter un lieu" };

export default function AddPlacePage() {
  return (
    <InfoPage
      title="Ajouter mon établissement"
      intro="Chaque fiche est vérifiée par notre équipe avant publication, pour garantir des informations fiables."
    >
      <ol className="list-decimal space-y-1 pl-5">
        <li>Vérifiez que votre établissement n&apos;est pas déjà sur Boyoma Connect.</li>
        <li>S&apos;il existe, ouvrez sa fiche et cliquez sur « Réclamez cette fiche ».</li>
        <li>
          Sinon, créez votre fiche : téléphone public, logo, 3 photos, puis votre catalogue avec vos prix.
        </li>
      </ol>
      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/recherche" variant="secondary">
          <Search className="size-4" aria-hidden="true" /> Chercher mon établissement
        </ButtonLink>
        <ButtonLink href="/espace-pro/nouvelle-fiche">
          <PlusCircle className="size-4" aria-hidden="true" /> Créer ma fiche
        </ButtonLink>
      </div>
      <p className="text-muted text-sm">Une connexion avec votre compte Google est demandée.</p>
    </InfoPage>
  );
}
