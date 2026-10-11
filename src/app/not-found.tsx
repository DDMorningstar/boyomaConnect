import { MapPinOff } from "lucide-react";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center px-6 text-center">
      <MapPinOff className="size-12 text-muted" aria-hidden="true" />
      <h1 className="mt-4 text-2xl font-bold">Page introuvable</h1>
      <p className="mt-2 text-muted">
        Ce lieu ou cette page n&apos;existe pas, a été retiré ou n&apos;est pas encore publié.
      </p>
      <div className="mt-6 flex gap-3">
        <ButtonLink href="/">Accueil</ButtonLink>
        <ButtonLink href="/recherche" variant="secondary">Rechercher</ButtonLink>
      </div>
    </main>
  );
}
