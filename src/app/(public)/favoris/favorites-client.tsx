"use client";
import Link from "next/link";
import { useState } from "react";
import { Check, Heart, Share2, Trash2 } from "lucide-react";
import { haptic } from "@/lib/haptics";
import { CategoryBadge } from "@/components/places/category-icon";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { useFavorites } from "@/features/favorites/store";

/** Partage de la liste (« Mes bons coins ») : lien public, ouvert sans compte. */
function ShareList({ slugs }: { slugs: string[] }) {
  const [copied, setCopied] = useState(false);
  async function share() {
    haptic();
    const url = `${window.location.origin}/collection?t=${encodeURIComponent("Mes bons coins à Kisangani")}&l=${slugs.slice(0, 30).join(",")}`;
    const text = "Mes bonnes adresses sur Boyoma Connect :";
    try {
      if (navigator.share) await navigator.share({ title: "Mes bons coins", text, url });
      else {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      /* partage annulé */
    }
  }
  return (
    <button
      type="button"
      onClick={share}
      className="bg-brand hover:bg-brand-strong inline-flex min-h-11 items-center gap-2 rounded-full px-5 text-sm font-semibold text-white"
    >
      {copied ? (
        <Check className="size-4" aria-hidden="true" />
      ) : (
        <Share2 className="size-4" aria-hidden="true" />
      )}
      {copied ? "Lien copié" : "Partager ma liste"}
    </button>
  );
}

export function FavoritesClient() {
  const { favorites, remove } = useFavorites();
  if (favorites.length === 0) {
    return (
      <div className="mt-6">
        <EmptyState
          icon={<Heart className="size-10" />}
          title="Aucun favori pour l'instant"
          action={<ButtonLink href="/explorer">Explorer les lieux</ButtonLink>}
        >
          Touchez « Favori » sur une fiche pour la retrouver ici, même sans connexion.
        </EmptyState>
      </div>
    );
  }
  return (
    <>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-muted text-sm">Envoyez vos bonnes adresses à vos proches, en un lien.</p>
        <ShareList slugs={favorites.map((f) => f.slug)} />
      </div>
      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {favorites.map((f) => (
          <li
            key={f.id}
            className="animate-fade-up border-line bg-surface flex items-center gap-3 rounded-[var(--radius-card)] border p-3.5"
          >
            <CategoryBadge icon={f.category_icon} color={f.category_color} />
            <Link href={`/lieux/${f.slug}`} className="min-w-0 flex-1">
              <span className="block truncate font-semibold">{f.name}</span>
              <span className="text-muted block truncate text-sm">
                {[f.category_name, f.unit_name].filter(Boolean).join(" · ")}
              </span>
            </Link>
            <button
              type="button"
              onClick={() => remove(f.id)}
              aria-label={`Retirer ${f.name} des favoris`}
              className="text-muted hover:bg-surface-2 hover:text-danger rounded-full p-2.5"
            >
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
      </ul>
    </>
  );
}
