"use client";
import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="bg-brand hover:bg-brand-strong inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white"
    >
      <Printer className="size-4" aria-hidden="true" /> Imprimer ou enregistrer en PDF
    </button>
  );
}
