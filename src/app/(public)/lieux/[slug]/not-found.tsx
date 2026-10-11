import { MapPinOff } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export default function PlaceNotFound() {
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <MapPinOff className="size-12 text-muted" aria-hidden="true" />
      <h1 className="mt-4 text-xl font-bold">Lieu introuvable</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">Cette fiche n&apos;existe pas, a été archivée ou n&apos;est pas encore publiée.</p>
      <ButtonLink href="/recherche" className="mt-6">Rechercher un lieu</ButtonLink>
    </div>
  );
}
