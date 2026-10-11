import type { Metadata } from "next";
import { Compass } from "lucide-react";
import { ResultsList } from "@/components/places/results-list";
import { searchPlaces } from "@/features/places/queries";
import { parseSearchParams } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Boyoma Explore — tourisme à Kisangani",
  description: "Sites naturels, monuments, lieux historiques et culturels de Kisangani.",
};

export default async function TourismPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = parseSearchParams(await searchParams);
  const { rows, total } = await searchPlaces({ ...sp, categorySlug: "tourisme" });
  return (
    <div className="space-y-4 pt-5">
      <div className="rounded-[var(--radius-card)] bg-gradient-to-br from-night to-brand p-6 text-white">
        <Compass className="size-8 text-cyan" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-extrabold">Boyoma Explore</h1>
        <p className="text-sm text-white/75">Sites, culture et patrimoine de Kisangani — uniquement des informations vérifiées.</p>
      </div>
      <ResultsList
        rows={rows}
        total={total}
        page={sp.page}
        buildHref={(page) => `/tourisme?page=${page}`}
        emptyTitle="Les premiers sites touristiques sont en cours de vérification"
        emptyText="Aucune information touristique n'est publiée sans source fiable."
      />
    </div>
  );
}
