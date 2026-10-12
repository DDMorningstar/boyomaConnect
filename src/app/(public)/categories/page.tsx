import type { Metadata } from "next";
import Link from "next/link";
import { CategoryBadge } from "@/components/places/category-icon";
import { ZoneSelector } from "@/components/zones/zone-selector";
import { getCategoriesWithCounts } from "@/features/places/queries";
import { resolveZone } from "@/features/zones/queries";
import { zoneIn } from "@/features/zones/zones";

export const metadata: Metadata = {
  title: "Toutes les catégories",
  description: "Catégories et sous-catégories de lieux à Kisangani et dans la province de la Tshopo.",
};

export default async function CategoriesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { zone, zones } = await resolveZone(typeof sp.zone === "string" ? sp.zone : undefined);
  const categories = await getCategoriesWithCounts(zone?.id);
  const top = categories.filter((c) => !c.parent_id);
  return (
    <div className="pt-5">
      <h1 className="text-2xl font-extrabold tracking-tight">Catégories</h1>
      {zone && <p className="text-muted mt-1 text-sm">Nombre de lieux publiés {zoneIn(zone)}.</p>}
      <ZoneSelector
        zones={zones}
        active={zone?.slug}
        hrefFor={(slug) => `/categories?zone=${slug}`}
        className="mt-3"
      />
      <div className="mt-5 space-y-6">
        {top.map((c) => {
          const children = categories.filter((s) => s.parent_id === c.id);
          return (
            <section key={c.id}>
              <Link href={`/categories/${c.slug}`} className="flex items-center gap-3">
                <CategoryBadge icon={c.icon} color={c.color} />
                <h2 className="text-lg font-bold">{c.name}</h2>
                <span className="text-muted text-sm">({c.place_count})</span>
              </Link>
              {children.length > 0 && (
                <ul className="mt-3 flex flex-wrap gap-2">
                  {children.map((s) => (
                    <li key={s.id}>
                      <Link
                        href={`/categories/${s.slug}`}
                        className={`border-line bg-surface inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm ${s.place_count === 0 ? "text-muted" : "font-medium"}`}
                      >
                        {s.name}
                        <span className="text-muted text-xs">{s.place_count}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    </div>
  );
}
