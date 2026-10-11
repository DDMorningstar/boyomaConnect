import Link from "next/link";
import { ChevronLeft, ChevronRight, SearchX } from "lucide-react";
import { PlaceCard } from "@/components/places/place-card";
import { EmptyState } from "@/components/ui/empty-state";
import { PAGE_SIZE } from "@/lib/search-params";
import { pluralize } from "@/lib/format";
import type { PlaceSearchRow } from "@/types/places";

export function ResultsList({
  rows,
  total,
  page,
  buildHref,
  emptyTitle = "Aucun résultat",
  emptyText,
}: {
  rows: PlaceSearchRow[];
  total: number;
  page: number;
  buildHref: (page: number) => string;
  emptyTitle?: string;
  emptyText?: React.ReactNode;
}) {
  if (rows.length === 0) {
    return (
      <EmptyState icon={<SearchX className="size-10" />} title={emptyTitle}>
        {emptyText ?? "Essayez un autre mot-clé, retirez un filtre ou élargissez la zone."}
      </EmptyState>
    );
  }
  const pages = Math.ceil(total / PAGE_SIZE);
  return (
    <div>
      <p className="mb-3 text-sm text-muted" aria-live="polite">
        {pluralize(total, "lieu trouvé", "lieux trouvés")}
      </p>
      <ul className="grid gap-3 md:grid-cols-2">
        {rows.map((p, i) => (
          <li key={p.id}>
            <PlaceCard place={p} index={i} />
          </li>
        ))}
      </ul>
      {pages > 1 && (
        <nav className="mt-6 flex items-center justify-center gap-2" aria-label="Pagination">
          {page > 1 ? (
            <Link href={buildHref(page - 1)} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-surface px-4 text-sm font-medium">
              <ChevronLeft className="size-4" aria-hidden="true" /> Précédent
            </Link>
          ) : null}
          <span className="px-2 text-sm text-muted">
            Page {page} / {pages}
          </span>
          {page < pages ? (
            <Link href={buildHref(page + 1)} className="inline-flex min-h-11 items-center gap-1 rounded-full border border-line bg-surface px-4 text-sm font-medium">
              Suivant <ChevronRight className="size-4" aria-hidden="true" />
            </Link>
          ) : null}
        </nav>
      )}
    </div>
  );
}
