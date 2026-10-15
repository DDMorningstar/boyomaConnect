import type { Metadata } from "next";
import { InfoPage } from "@/components/ui/info-page";
import { DataSaverToggle } from "@/components/layout/data-saver-toggle";
import { VerifiedMark } from "@/components/places/verification-badge";

export const metadata: Metadata = { title: "Aide" };

export default function HelpPage() {
  return (
    <InfoPage title="Aide" intro="Questions fréquentes sur Boyoma Connect.">
      <h2>Les distances sont-elles des distances routières ?</h2>
      <p>
        Non. Les distances affichées sont calculées à vol d&apos;oiseau. Pour un trajet réel, utilisez le
        bouton « Itinéraire ».
      </p>
      <h2 id="verification">
        Que signifie le badge <VerifiedMark size={20} /> ?
      </h2>
      <p>
        Comme sur les réseaux sociaux, ce badge bleu certifie un établissement vérifié par Boyoma Connect : un
        agent s&apos;est rendu sur place, ou notre équipe a contrôlé son existence, sa position et ses
        contacts. Il ne s&apos;achète pas. Les propriétaires peuvent demander la vérification depuis leur
        Espace pro.
      </p>
      <h2>Que signifie « Vérifié sur le terrain » ?</h2>
      <p>
        Un agent cartographe s&apos;est rendu sur place. « Non vérifié » signifie que l&apos;information
        n&apos;a pas encore été contrôlée.
      </p>
      <h2>Comment installer l&apos;application ?</h2>
      <ul>
        <li>
          Android (Chrome) : menu ⋮ puis « Installer l&apos;application » ou « Ajouter à l&apos;écran
          d&apos;accueil ».
        </li>
        <li>iPhone (Safari) : bouton Partager puis « Sur l&apos;écran d&apos;accueil ».</li>
      </ul>
      <h2 id="donnees">Économiser mes données mobiles</h2>
      <p>
        En mode économie, les photos et la carte ne se chargent qu&apos;à la demande et les animations sont
        désactivées. Les fiches déjà consultées restent disponibles sans connexion.
      </p>
      <DataSaverToggle />
      <h2>Une information est fausse</h2>
      <p>Utilisez « Signaler une erreur » en bas de la fiche. Un modérateur l&apos;examinera.</p>
    </InfoPage>
  );
}
