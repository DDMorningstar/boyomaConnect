"use client";
import { TriangleAlert } from "lucide-react";

export default function AdminError({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="border-line bg-surface mx-auto max-w-lg rounded-[var(--radius-card)] border p-8 text-center">
      <TriangleAlert className="text-warning mx-auto size-10" aria-hidden="true" />
      <h1 className="mt-4 text-lg font-bold">Ce module n&apos;a pas pu être chargé</h1>
      <p className="text-muted mt-1 text-sm">Vérifiez votre connexion, puis réessayez.</p>
      <button
        type="button"
        onClick={reset}
        className="bg-brand hover:bg-brand-strong mt-5 h-10 rounded-xl px-5 text-sm font-semibold text-white"
      >
        Réessayer
      </button>
    </div>
  );
}
