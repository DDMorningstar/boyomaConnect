import type { Metadata } from "next";
import { InfoPage } from "@/components/ui/info-page";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Ajouter un lieu" };

export default function AddPlacePage() {
  return (
    <InfoPage
      title="Ajouter un lieu"
      intro="Chaque lieu proposé est vérifié avant publication, pour garantir des informations fiables."
    >
      <p>
        Le formulaire de proposition nécessite un compte afin d&apos;éviter les abus ; il ouvrira avec
        l&apos;authentification. Les agents cartographes de Boyoma Connect disposeront d&apos;un espace de
        collecte terrain fonctionnant même sans connexion.
      </p>
      <p>Avant de proposer un lieu, vérifiez qu&apos;il n&apos;existe pas déjà :</p>
      <ButtonLink href="/recherche">Rechercher un lieu existant</ButtonLink>
    </InfoPage>
  );
}
