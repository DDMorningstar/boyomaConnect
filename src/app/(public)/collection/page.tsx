import type { Metadata } from "next";
import { Heart } from "lucide-react";
import { PlaceCard } from "@/components/places/place-card";
import { EmptyState } from "@/components/ui/empty-state";
import { ButtonLink } from "@/components/ui/button";
import { getPlacesBySlugs } from "@/features/places/queries";

type Props = { searchParams: Promise<{ l?: string; t?: string }> };

const title = (raw?: string) => (raw ?? "").replace(/[<>]/g, "").trim().slice(0, 60) || "Mes bons coins";

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const { t } = await searchParams;
  return {
    title: title(t),
    description: "Une sélection d'adresses partagée depuis Boyoma Connect.",
    robots: { index: false },
  };
}

/**
 * Collection partagée (« Mes bons coins ») : liste de fiches transmise par lien, sans compte.
 * Seules les fiches publiées s'affichent ; l'ordre choisi est conservé.
 */
export default async function CollectionPage({ searchParams }: Props) {
  const { l, t } = await searchParams;
  const places = await getPlacesBySlugs((l ?? "").split(","));
  return (
    <div className="mx-auto max-w-2xl pt-6 pb-4">
      <p className="text-brand text-sm font-semibold">Sélection partagée</p>
      <h1 className="text-2xl font-extrabold tracking-tight">{title(t)}</h1>
      <p className="text-muted mt-1 text-sm">
        {places.length} adresse{places.length > 1 ? "s" : ""} recommandée{places.length > 1 ? "s" : ""} sur
        Boyoma Connect.
      </p>
      {places.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={<Heart className="size-10" />}
            title="Cette sélection est vide"
            action={<ButtonLink href="/explorer">Explorer les lieux</ButtonLink>}
          >
            Les adresses de ce lien ne sont plus disponibles.
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-5 space-y-3">
          {places.map((p, i) => (
            <li key={p.slug}>
              <PlaceCard place={p} index={i} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
