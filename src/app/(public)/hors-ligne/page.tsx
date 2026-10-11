import type { Metadata } from "next";
import { WifiOff } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export const metadata: Metadata = { title: "Hors connexion", robots: { index: false } };
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <WifiOff className="text-muted size-12" aria-hidden="true" />
      <h1 className="mt-4 text-xl font-bold">Vous êtes hors connexion</h1>
      <p className="text-muted mt-2 max-w-sm text-sm">
        Cette page n&apos;a pas encore été enregistrée sur votre appareil. Vos favoris et les fiches déjà
        consultées restent accessibles. La recherche et la carte nécessitent une connexion.
      </p>
      <ButtonLink href="/favoris" className="mt-6">
        Voir mes favoris
      </ButtonLink>
    </div>
  );
}
