import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { CategoryBadge } from "@/components/places/category-icon";
import { ResultsList } from "@/components/places/results-list";
import { SearchFilters, hrefWith } from "@/components/search/search-filters";
import { getCategoryBySlug, getCityWithCommunes, searchPlaces } from "@/features/places/queries";
import { parseSearchParams } from "@/lib/search-params";

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const data = await getCategoryBySlug(slug);
  if (!data) return { title: "Catégorie introuvable" };
  return {
    title: `${data.category.name} à Kisangani`,
    description: data.category.description ?? `${data.category.name} à Kisangani : adresses, contacts et localisation.`,
    alternates: { canonical: `/categories/${slug}` },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const data = await getCategoryBySlug(slug);
  if (!data) notFound();
  const sp = parseSearchParams(await searchParams);
  const [{ rows, total }, city] = await Promise.all([searchPlaces({ ...sp, categorySlug: slug }), getCityWithCommunes()]);
  const path = `/categories/${slug}`;

  return (
    <div className="space-y-4 pt-5">
      {data.parent && (
        <Link href={`/categories/${data.parent.slug}`} className="inline-flex items-center gap-1 text-sm text-muted">
          <ChevronLeft className="size-4" aria-hidden="true" /> {data.parent.name}
        </Link>
      )}
      <div className="flex items-center gap-3">
        <CategoryBadge icon={data.category.icon} color={data.category.color} size="lg" />
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">{data.category.name}</h1>
          {data.category.description && <p className="text-sm text-muted">{data.category.description}</p>}
        </div>
      </div>
      {data.children.length > 0 && (
        <ul className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4">
          {data.children.map((c) => (
            <li key={c.id}>
              <Link href={`/categories/${c.slug}`} className="inline-flex min-h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-2 px-3.5 text-sm font-medium">
                {c.name} <span className="text-xs text-muted">{c.place_count}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <SearchFilters params={{ ...sp, categorie: undefined }} communes={city?.communes ?? []} path={path} />
      <ResultsList
        rows={rows}
        total={total}
        page={sp.page}
        buildHref={(page) => hrefWith({ ...sp, categorie: undefined }, { page: String(page) }, path)}
        emptyTitle={`Aucun lieu publié dans « ${data.category.name} » pour l'instant`}
        emptyText="Les établissements sont ajoutés après vérification. Vous pouvez proposer un lieu manquant."
      />
    </div>
  );
}
