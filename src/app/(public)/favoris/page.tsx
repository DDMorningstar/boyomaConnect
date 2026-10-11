import type { Metadata } from "next";
import { FavoritesClient } from "./favorites-client";

export const metadata: Metadata = { title: "Mes favoris", robots: { index: false } };

export default function FavoritesPage() {
  return (
    <div className="pt-5">
      <h1 className="text-2xl font-extrabold tracking-tight">Favoris</h1>
      <p className="text-muted mt-1 text-sm">Enregistrés sur cet appareil et consultables hors connexion.</p>
      <FavoritesClient />
    </div>
  );
}
