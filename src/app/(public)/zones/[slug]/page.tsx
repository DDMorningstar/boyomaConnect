import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Map as MapIcon, MapPin, Search } from "lucide-react";
import { CategoryBadge } from "@/components/places/category-icon";
import { ResultsList } from "@/components/places/results-list";
import { hrefWith } from "@/components/search/search-filters";
import { Section } from "@/components/ui/section";
import { ButtonLink } from "@/components/ui/button";
import { getCategoriesWithCounts, getCityWithCommunes, searchPlaces } from "@/features/places/queries";
import { getZoneBySlug, getZones } from "@/features/zones/queries";
import { PROVINCE_SLUG, zoneIn, zoneLabel, zoneTitle } from "@/features/zones/zones";
import { pluralize } from "@/lib/format";
import { parseSearchParams } from "@/lib/search-params";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const zone = await getZoneBySlug(slug);
  if (!zone) return { title: "Zone introuvable", robots: { index: false } };
  return {
    title: zoneTitle(zone),
    description: `Lieux et services ${zoneIn(zone)} (province de la Tshopo, RDC) : contacts, position et itinéraire.`,
    alternates: { canonical: `/zones/${zone.slug}` },
  };
}

export default async function ZonePage({ params, searchParams }: Props) {
  const { slug } = await params;
  const zone = await getZoneBySlug(slug);
  if (!zone) notFound();
  const sp = parseSearchParams(await searchParams);
  const [{ rows, total }, categories, zones, city] = await Promise.all([
    searchPlaces({ ...sp, commune: undefined, unitId: zone.id }),
    getCategoriesWithCounts(zone.id),
    getZones(),
    zone.type_key === "ville" ? getCityWithCommunes(zone.slug) : Promise.resolve(null),
  ]);
  const where = zoneIn(zone);
  const path = `/zones/${zone.slug}`;
  const activeCategories = categories.filter((c) => !c.parent_id && c.place_count > 0);
  const children = zone.type_key === "province" ? zones.filter((z) => z.type_key !== "province") : [];

  return (
    <div className="space-y-4 pt-5">
      {zone.slug !== PROVINCE_SLUG && (
        <Link href={`/zones/${PROVINCE_SLUG}`} className="text-muted inline-flex items-center gap-1 text-sm">
          <ChevronLeft className="size-4" aria-hidden="true" /> Province de la Tshopo
        </Link>
      )}
      <header className="bg-night relative overflow-hidden rounded-[var(--radius-card)] p-5 text-white shadow-[var(--shadow-float)] md:p-7">
        <div
          aria-hidden="true"
          className="bg-cyan/25 motion-safe:animate-drift pointer-events-none absolute -top-16 -right-10 size-56 rounded-full blur-3xl"
        />
        <p className="relative inline-flex items-center gap-1.5 text-sm text-white/70">
          <MapPin className="text-cyan size-4" aria-hidden="true" />
          {zone.type_key === "province" ? "République démocratique du Congo" : "Province de la Tshopo"}
        </p>
        <h1 className="relative mt-1 text-2xl font-extrabold tracking-tight md:text-3xl">
          {zoneTitle(zone)}
        </h1>
        <p className="relative mt-1 text-sm text-white/70">
          {zone.place_count > 0
            ? `${pluralize(zone.place_count, "lieu publié", "lieux publiés")} ${where}`
            : `Aucun lieu publié ${where} pour l'instant.`}
        </p>
        <div className="relative mt-4 flex flex-wrap gap-2">
          <ButtonLink href={`/carte?zone=${zone.slug}`} variant="secondary" className="border-transparent">
            <MapIcon className="size-4" aria-hidden="true" /> Voir sur la carte
          </ButtonLink>
          <Link
            href={`/recherche?zone=${zone.slug}`}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-white/10 px-5 text-sm font-semibold text-white transition-[transform,background-color] hover:bg-white/20 active:scale-[0.97]"
          >
            <Search className="size-4" aria-hidden="true" /> Rechercher {where}
          </Link>
        </div>
      </header>

      {children.length > 0 && (
        <Section title="Ville et territoires">
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {children.map((z) => (
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

      {city && city.communes.length > 0 && (
        <Section title="Communes">
          <ul className="flex flex-wrap gap-2">
            {city.communes.map((c) => (
              <li key={c.unit_id}>
                <Link
                  href={`/communes/${c.slug}`}
                  className="border-line bg-surface hover:border-brand/40 inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-sm font-medium"
                >
                  {c.name}
                  <span className="bg-surface-2 text-muted rounded-full px-1.5 text-xs">{c.place_count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {activeCategories.length > 0 && (
        <Section title="Catégories présentes">
          <ul className="-mx-4 flex scrollbar-none gap-2 overflow-x-auto px-4 md:mx-0 md:flex-wrap md:px-0">
            {activeCategories.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/categories/${c.slug}?zone=${zone.slug}`}
                  className="bg-surface-2 inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3 text-sm font-medium whitespace-nowrap"
                >
                  <CategoryBadge icon={c.icon} color={c.color} size="sm" /> {c.name}
                  <span className="text-muted text-xs">{c.place_count}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}

      <Section title={`Lieux ${where}`}>
        <ResultsList
          rows={rows}
          total={total}
          page={sp.page}
          buildHref={(page) =>
            hrefWith({ ...sp, commune: undefined, zone: undefined }, { page: String(page) }, path)
          }
          emptyTitle={`Aucun lieu publié ${where} pour l'instant`}
          emptyText="Les établissements sont ajoutés après vérification. Vous connaissez un lieu ? Proposez-le."
        />
      </Section>

      <p className="text-muted text-xs">
        Limites administratives : Référentiel Géographique Commun de la RDC (OCHA, 2019), diffusé par
        geoBoundaries, licence{" "}
        <a
          href="https://creativecommons.org/licenses/by/3.0/igo/"
          target="_blank"
          rel="noopener noreferrer"
          className="underline"
        >
          CC BY 3.0 IGO
        </a>
        . Contours simplifiés, à titre indicatif.
      </p>
    </div>
  );
}
