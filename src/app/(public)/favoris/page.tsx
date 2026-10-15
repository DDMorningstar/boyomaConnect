import type { Metadata } from "next";
import { FavoritesClient } from "./favorites-client";
import { DataSaverToggle } from "@/components/layout/data-saver-toggle";

export const metadata: Metadata = { title: "Mes favoris", robots: { index: false } };

export default function FavoritesPage() {
  return (
    <div className="pt-5">
      <h1 className="text-2xl font-extrabold tracking-tight">Favoris</h1>
      <p className="text-muted mt-1 text-sm">Enregistrés sur cet appareil et consultables hors connexion.</p>
      <FavoritesClient />
      <section className="border-line bg-surface mt-8 rounded-[var(--radius-card)] border p-4 md:hidden">
        <h2 className="mb-3 font-bold">Sur cet appareil</h2>
        <DataSaverToggle />
      </section>
    </div>
  );
}
