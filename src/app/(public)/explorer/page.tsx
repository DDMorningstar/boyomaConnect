import type { Metadata } from "next";
import Link from "next/link";
import { Map as MapIcon } from "lucide-react";
import { SearchBar } from "@/components/search/search-bar";
import { CategoryBadge } from "@/components/places/category-icon";
import { Section } from "@/components/ui/section";
import { getCategoriesWithCounts, getCityWithCommunes } from "@/features/places/queries";

export const metadata: Metadata = {
  title: "Explorer Kisangani",
  description: "Parcourez les lieux de Kisangani par catégorie, par commune ou sur la carte.",
};

export default async function ExplorerPage() {
  const [categories, city] = await Promise.all([getCategoriesWithCounts(), getCityWithCommunes()]);
  const top = categories.filter((c) => !c.parent_id);
  return (
    <div className="pt-5">
      <h1 className="text-2xl font-extrabold tracking-tight">Explorer</h1>
      <p className="mt-1 text-sm text-muted">Par catégorie, par commune ou sur la carte.</p>
      <div className="mt-4"><SearchBar size="md" /></div>

      <Link href="/carte" className="mt-4 flex items-center gap-4 rounded-[var(--radius-card)] bg-night p-5 text-white shadow-[var(--shadow-float)]">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-white/10"><MapIcon className="size-6 text-cyan" aria-hidden="true" /></span>
        <span><span className="block font-semibold">Ouvrir la carte</span><span className="text-sm text-white/70">Lieux publiés dans la zone visible</span></span>
      </Link>

      <Section title="Catégories" href="/categories" hrefLabel="Sous-catégories">
        <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {top.map((c) => (
            <li key={c.id}>
              <Link href={`/categories/${c.slug}`} className="flex items-center gap-3 rounded-2xl border border-line bg-surface p-3 hover:border-brand/40">
                <CategoryBadge icon={c.icon} color={c.color} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-semibold">{c.name}</span>
                  <span className="text-xs text-muted">{c.place_count > 0 ? `${c.place_count} lieu${c.place_count > 1 ? "x" : ""}` : "Aucun lieu publié pour l'instant"}</span>
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
                <Link href={`/communes/${c.slug}`} className="flex flex-col rounded-2xl border border-line bg-surface p-4 hover:border-brand/40">
                  <span className="font-semibold">{c.name}</span>
                  <span className="text-xs text-muted">{c.place_count} lieu{c.place_count > 1 ? "x" : ""}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}
