"use client";
import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button, ButtonLink } from "@/components/ui/button";

export default function PublicError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("[boyoma] erreur de page", error.digest ?? error.message);
  }, [error]);
  return (
    <div className="flex flex-col items-center py-20 text-center">
      <AlertTriangle className="size-10 text-warning" aria-hidden="true" />
      <h1 className="mt-4 text-xl font-bold">Une erreur est survenue</h1>
      <p className="mt-2 max-w-sm text-sm text-muted">
        Le service est peut-être momentanément indisponible ou votre connexion est instable.
        {error.digest ? ` (réf. ${error.digest})` : ""}
      </p>
      <div className="mt-6 flex gap-3">
        <Button onClick={reset}>Réessayer</Button>
        <ButtonLink href="/" variant="secondary">Accueil</ButtonLink>
      </div>
    </div>
  );
}
