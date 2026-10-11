import type { Metadata } from "next";
import { InfoPage } from "@/components/ui/info-page";

export const metadata: Metadata = { title: "Conditions d'utilisation" };

export default function TermsPage() {
  return (
    <InfoPage title="Conditions d'utilisation" intro="BROUILLON — à finaliser et faire valider avant la commercialisation.">
      <h2>Exactitude des informations</h2>
      <p>Les informations sont fournies par les établissements, les agents et la communauté. Leur statut de vérification est indiqué sur chaque fiche.</p>
      <h2>Contenus sponsorisés</h2>
      <p>Les contenus payants sont toujours signalés « Sponsorisé » et n&apos;influencent pas le classement des résultats naturels.</p>
      <h2>Cartographie</h2>
      <p>Données cartographiques © contributeurs OpenStreetMap, sous licence ODbL.</p>
    </InfoPage>
  );
}
