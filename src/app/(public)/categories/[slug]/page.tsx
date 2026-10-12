import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { CategoryBadge } from "@/components/places/category-icon";
import { ResultsList } from "@/components/places/results-list";
import { SearchFilters, hrefWith } from "@/components/search/search-filters";
import { getCategoryBySlug, searchPlaces } from "@/features/places/queries";
import { resolveSearchScope } from "@/features/zones/queries";
import { zoneIn } from "@/features/zones/zones";
import { parseSearchParams } from "@/lib/search-params";

type Props = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCategoryBySlug(slug);
  if (!data) return { title: "Catégorie introuvable" };
  return {
    title: `${data.category.name} — Kisangani et Tshopo`,
    description:
      data.category.description ??
      `${data.category.name} à Kisangani et dans la province de la Tshopo : adresses, contacts et localisation.`,
    alternates: { canonical: `/categories/${slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const scope = await resolveSearchScope(parseSearchParams(await searchParams));
  const sp = scope.params;
  const data = await getCategoryBySlug(slug, scope.zone?.id);
  if (!data) notFound();
  const { rows, total } = await searchPlaces({ ...sp, categorySlug: slug, unitId: scope.unitId });
  const path = `/categories/${slug}`;
  const where = scope.zone ? ` ${zoneIn(scope.zone)}` : "";

  return (
    <div className="space-y-4 pt-5">
      {data.parent && (
        <Link
          href={`/categories/${data.parent.slug}`}
          className="text-muted inline-flex items-center gap-1 text-sm"
        >
          <ChevronLeft className="size-4" aria-hidden="true" /> {data.parent.name}
        </Link>
      )}
      <div className="flex items-center gap-3">
        <CategoryBadge icon={data.category.icon} color={data.category.color} size="lg" />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{data.category.name}</h1>
          {data.category.description && <p className="text-muted text-sm">{data.category.description}</p>}
        </div>
      </div>
      {data.children.length > 0 && (
        <ul className="-mx-4 flex scrollbar-none gap-2 overflow-x-auto px-4">
          {data.children.map((c) => (
            <li key={c.id}>
              <Link
                href={`/categories/${c.slug}`}
                className="bg-surface-2 inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-sm font-medium whitespace-nowrap"
              >
                {c.name} <span className="text-muted text-xs">{c.place_count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <SearchFilters
        params={{ ...sp, categorie: undefined }}
        communes={scope.communes}
        zones={scope.zones}
        activeZone={scope.zone}
        path={path}
      />
      <ResultsList
        rows={rows}
        total={total}
        page={sp.page}
        buildHref={(page) => hrefWith({ ...sp, categorie: undefined }, { page: String(page) }, path)}
        emptyTitle={`Aucun lieu publié dans « ${data.category.name} »${where} pour l'instant`}
        emptyText="Les établissements sont ajoutés après vérification. Essayez une autre zone ou proposez un lieu manquant."
      />
    </div>
  );
}
