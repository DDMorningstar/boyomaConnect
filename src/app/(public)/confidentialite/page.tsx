import type { Metadata } from "next";
import { InfoPage } from "@/components/ui/info-page";

export const metadata: Metadata = { title: "Politique de confidentialité" };

export default function PrivacyPage() {
  return (
    <InfoPage title="Politique de confidentialité" intro="BROUILLON — à faire valider juridiquement avant la mise en production.">
      <h2>Données de localisation</h2>
      <p>Votre position n&apos;est demandée que lorsque vous utilisez « À proximité » ou « Me localiser ». Elle sert à la recherche et n&apos;est pas enregistrée.</p>
      <h2>Statistiques</h2>
      <p>Nous comptons les consultations et les clics sur les fiches à l&apos;aide d&apos;un identifiant aléatoire stocké sur votre appareil, sans lien avec votre identité. Les recherches sont enregistrées de façon anonyme (texte normalisé et nombre de résultats).</p>
      <h2>Données locales</h2>
      <p>Les favoris et l&apos;historique de recherche (si vous l&apos;activez) restent sur votre appareil.</p>
      <h2>Contact</h2>
      <p>Coordonnées du responsable de traitement : à compléter.</p>
    </InfoPage>
  );
}
