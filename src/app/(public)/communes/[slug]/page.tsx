import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MapPin } from "lucide-react";
import { ResultsList } from "@/components/places/results-list";
import { hrefWith } from "@/components/search/search-filters";
import { getCommuneBySlug, searchPlaces } from "@/features/places/queries";
import { parseSearchParams } from "@/lib/search-params";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCommuneBySlug(slug);
  if (!data) return { title: "Commune introuvable" };
  return {
    title: `Commune de ${data.commune.name} — ${data.city.name}`,
    description: `Lieux et services de la commune de ${data.commune.name}, ${data.city.name}.`,
    alternates: { canonical: `/communes/${slug}` },
  };
}

export default async function CommunePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const data = await getCommuneBySlug(slug);
  if (!data) notFound();
  const sp = parseSearchParams(await searchParams);
  const { rows, total } = await searchPlaces({ ...sp, unitId: data.commune.unit_id });
  const path = `/communes/${slug}`;
  return (
    <div className="space-y-4 pt-5">
      <div>
        <p className="text-muted inline-flex items-center gap-1 text-sm">
          <MapPin className="size-4" aria-hidden="true" /> {data.city.name} · Tshopo
        </p>
        <h1 className="text-2xl font-extrabold tracking-tight">Commune de {data.commune.name}</h1>
      </div>
      <ResultsList
        rows={rows}
        total={total}
        page={sp.page}
        buildHref={(page) => hrefWith({ ...sp, commune: undefined }, { page: String(page) }, path)}
        emptyTitle={`Aucun lieu publié à ${data.commune.name} pour l'instant`}
      />
    </div>
  );
}
