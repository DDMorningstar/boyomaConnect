import type { Metadata } from "next";
import { Compass } from "lucide-react";
import { ResultsList } from "@/components/places/results-list";
import { ZoneSelector } from "@/components/zones/zone-selector";
import { searchPlaces } from "@/features/places/queries";
import { resolveZone } from "@/features/zones/queries";
import { zoneIn } from "@/features/zones/zones";
import { parseSearchParams } from "@/lib/search-params";

export const metadata: Metadata = {
  title: "Boyoma Explore — tourisme à Kisangani et dans la Tshopo",
  description:
    "Sites naturels, monuments, lieux historiques et culturels de Kisangani et de la province de la Tshopo.",
};

export default async function TourismPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = parseSearchParams(await searchParams);
  const { zone, zones } = await resolveZone(sp.zone);
  const { rows, total } = await searchPlaces({ ...sp, categorySlug: "tourisme", unitId: zone?.id });
  const where = zone ? zoneIn(zone) : "dans la Tshopo";
  return (
    <div className="space-y-4 pt-5">
      <div className="from-night to-brand rounded-[var(--radius-card)] bg-gradient-to-br p-6 text-white">
        <Compass className="text-cyan size-8" aria-hidden="true" />
        <h1 className="mt-3 text-2xl font-extrabold">Boyoma Explore</h1>
        <p className="text-sm text-white/75">
          Sites, culture et patrimoine {where} — uniquement des informations vérifiées.
        </p>
      </div>
      <ZoneSelector zones={zones} active={zone?.slug} hrefFor={(slug) => `/tourisme?zone=${slug}`} />
      <ResultsList
        rows={rows}
        total={total}
        page={sp.page}
        buildHref={(page) => `/tourisme?page=${page}${zone ? `&zone=${zone.slug}` : ""}`}
        emptyTitle={`Aucun site touristique publié ${where} pour l'instant`}
        emptyText="Aucune information touristique n'est publiée sans source fiable."
      />
    </div>
  );
}
