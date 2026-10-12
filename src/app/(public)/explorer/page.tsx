import type { Metadata } from "next";
import Link from "next/link";
import { Map as MapIcon } from "lucide-react";
import { SearchBar } from "@/components/search/search-bar";
import { CategoryBadge } from "@/components/places/category-icon";
import { Section } from "@/components/ui/section";
import { ZoneSelector } from "@/components/zones/zone-selector";
import { getCategoriesWithCounts, getCityWithCommunes } from "@/features/places/queries";
import { resolveZone } from "@/features/zones/queries";
import { zoneIn, zoneLabel } from "@/features/zones/zones";
import { pluralize } from "@/lib/format";

export const metadata: Metadata = {
  title: "Explorer Kisangani et la Tshopo",
  description:
    "Parcourez les lieux de Kisangani et des territoires de la Tshopo par catégorie, par zone ou sur la carte.",
};

export default async function ExplorerPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { zone, zones } = await resolveZone(typeof sp.zone === "string" ? sp.zone : undefined);
  const [categories, city] = await Promise.all([
    getCategoriesWithCounts(zone?.id),
    zone?.type_key === "ville" ? getCityWithCommunes(zone.slug) : Promise.resolve(null),
  ]);
  const top = categories.filter((c) => !c.parent_id);
  const territories = zones.filter((z) => z.type_key !== "province");
  return (
    <div className="pt-5">
      <h1 className="text-2xl font-extrabold tracking-tight">Explorer</h1>
      <p className="text-muted mt-1 text-sm">Par zone, par catégorie ou sur la carte.</p>
      <div className="mt-4">
        <SearchBar size="md" />
      </div>
      <ZoneSelector
        zones={zones}
        active={zone?.slug}
        hrefFor={(slug) => `/explorer?zone=${slug}`}
        className="mt-3"
      />

      <Link
        href={zone ? `/carte?zone=${zone.slug}` : "/carte"}
        className="bg-night mt-4 flex items-center gap-4 rounded-[var(--radius-card)] p-5 text-white shadow-[var(--shadow-float)]"
      >
        <span className="flex size-12 items-center justify-center rounded-2xl bg-white/10">
          <MapIcon className="text-cyan size-6" aria-hidden="true" />
        </span>
        <span>
          <span className="block font-semibold">Ouvrir la carte</span>
          <span className="text-sm text-white/70">
            Lieux publiés {zone ? zoneIn(zone) : "dans la zone visible"}
          </span>
        </span>
      </Link>

      <Section title="Catégories" href="/categories" hrefLabel="Sous-catégories">
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {top.map((c) => (
            <li key={c.id}>
              <Link
                href={`/categories/${c.slug}`}
                className="border-line bg-surface hover:border-brand/40 flex items-center gap-3 rounded-2xl border p-3"
              >
                <CategoryBadge icon={c.icon} color={c.color} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="text-muted text-xs">
                    {c.place_count > 0
                      ? pluralize(c.place_count, "lieu", "lieux")
                      : "Aucun lieu publié pour l'instant"}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Section>

      {city && (
        <Section title={`Communes de ${city.city.name}`}>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {city.communes.map((c) => (
              <li key={c.unit_id}>
                <Link
                  href={`/communes/${c.slug}`}
                  className="border-line bg-surface hover:border-brand/40 flex flex-col rounded-2xl border p-4"
                >
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-muted text-xs">{pluralize(c.place_count, "lieu", "lieux")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {territories.length > 0 && (
        <Section title="Ville et territoires de la Tshopo" href="/zones/tshopo" hrefLabel="La province">
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {territories.map((z) => (
              <li key={z.id}>
                <Link
                  href={`/zones/${z.slug}`}
                  className="border-line bg-surface hover:border-brand/40 flex flex-col rounded-2xl border p-4"
                >
                  <span className="text-muted text-xs">
                    {z.type_key === "ville" ? "Ville" : "Territoire"}
                  </span>
                  <span className="font-semibold">{zoneLabel(z)}</span>
                  <span className="text-muted text-xs">{pluralize(z.place_count, "lieu", "lieux")}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
