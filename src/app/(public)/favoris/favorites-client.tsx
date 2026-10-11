"use client";
import Link from "next/link";
import { Heart, Trash2 } from "lucide-react";
import { CategoryBadge } from "@/components/places/category-icon";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { useFavorites } from "@/features/favorites/store";

export function FavoritesClient() {
  const { favorites, remove } = useFavorites();
  if (favorites.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState icon={<Heart className="size-10" />} title="Aucun favori pour l'instant" action={<ButtonLink href="/explorer">Explorer les lieux</ButtonLink>}>
          Touchez « Favori » sur une fiche pour la retrouver ici, même sans connexion.
        </EmptyState>
      </div>
    );
  }
  return (
    <ul className="mt-4 grid gap-3 md:grid-cols-2">
      {favorites.map((f) => (
        <li key={f.id} className="animate-fade-up flex items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-3.5">
          <CategoryBadge icon={f.category_icon} color={f.category_color} />
          <Link href={`/lieux/${f.slug}`} className="min-w-0 flex-1">
            <span className="block truncate font-semibold">{f.name}</span>
            <span className="block truncate text-sm text-muted">{[f.category_name, f.unit_name].filter(Boolean).join(" · ")}</span>
          </Link>
          <button type="button" onClick={() => remove(f.id)} aria-label={`Retirer ${f.name} des favoris`} className="rounded-full p-2.5 text-muted hover:bg-surface-2 hover:text-danger">
            <Trash2 className="size-4" />
          </button>
        </li>
      ))}
    </ul>
  );
}
