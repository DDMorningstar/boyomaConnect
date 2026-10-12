import type { Metadata } from "next";
import { SearchBar } from "@/components/search/search-bar";
import { SearchFilters, hrefWith } from "@/components/search/search-filters";
import { ResultsList } from "@/components/places/results-list";
import { searchPlaces } from "@/features/places/queries";
import { resolveSearchScope } from "@/features/zones/queries";
import { zoneIn } from "@/features/zones/zones";
import { parseSearchParams } from "@/lib/search-params";
import { LogSearch } from "@/components/search/log-search";

export const metadata: Metadata = { title: "Recherche", robots: { index: false, follow: true } };

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const scope = await resolveSearchScope(parseSearchParams(await searchParams));
  const { params, zone } = scope;
  const { rows, total } = await searchPlaces({ ...params, unitId: scope.unitId });
  const where = zone ? ` ${zoneIn(zone)}` : "";

  return (
    <div className="space-y-4 pt-5">
      <h1 className="sr-only">
        Recherche{params.q ? ` : ${params.q}` : ""}
        {where}
      </h1>
      <SearchBar defaultValue={params.q ?? ""} size="md" />
      <SearchFilters params={params} communes={scope.communes} zones={scope.zones} activeZone={zone} />
      <ResultsList
        rows={rows}
        total={total}
        page={params.page}
        buildHref={(page) => hrefWith(params, { page: String(page) })}
        emptyTitle={
          params.q
            ? `Aucun résultat pour « ${params.q} »${where}`
            : `Aucun lieu publié${where} pour ces critères`
        }
      />
      {params.q && params.page === 1 && <LogSearch query={params.q} results={total} />}
    </div>
  );
}
