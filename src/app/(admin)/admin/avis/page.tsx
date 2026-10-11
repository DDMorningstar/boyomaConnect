import Link from "next/link";
import { MessageSquareText, Star } from "lucide-react";
import { DecisionButtons } from "@/components/admin/action-form";
import {
  Card,
  EmptyState,
  PageHeader,
  Pagination,
  StatusBadge,
  Tabs,
  relativeTime,
} from "@/components/admin/ui";
import { requirePermission } from "@/features/admin/access";
import { adminModerateReview } from "@/features/admin/actions";
import { PAGE_SIZE, listReviews } from "@/features/admin/queries";

export const metadata = { title: "Avis" };

export default async function ReviewsAdmin({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; page?: string }>;
}) {
  await requirePermission("reviews.moderate", "/admin/avis");
  const sp = await searchParams;
  const status = ["published", "rejected", "hidden"].includes(sp.statut ?? "") ? sp.statut! : "pending";
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total, names } = await listReviews(status, page);

  return (
    <>
      <PageHeader
        title="Avis"
        description="Les avis sont publiés après modération. Refusez les avis injurieux, hors sujet ou manifestement faux, avec un motif."
      />
      <Tabs
        active={status}
        tabs={[
          { value: "pending", label: "En attente", href: "/admin/avis" },
          { value: "published", label: "Publiés", href: "/admin/avis?statut=published" },
          { value: "rejected", label: "Refusés", href: "/admin/avis?statut=rejected" },
          { value: "hidden", label: "Masqués", href: "/admin/avis?statut=hidden" },
        ]}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={MessageSquareText}
            title="Aucun avis dans cette liste"
            text="Les avis des visiteurs apparaîtront ici."
          />
        ) : (
          <ul className="divide-line divide-y">
            {rows.map((r) => (
              <li key={r.id} className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="inline-flex items-center gap-0.5" aria-label={`${r.rating} sur 5`}>
                      {Array.from({ length: 5 }, (_, i) => (
                        <Star
                          key={i}
                          className={`size-4 ${i < r.rating ? "fill-amber-400 text-amber-400" : "text-line"}`}
                          aria-hidden="true"
                        />
                      ))}
                    </span>
                    <StatusBadge status={r.status} />
                    <span className="text-muted text-xs">
                      {names.get(r.author_id) ?? "Utilisateur"} · {relativeTime(r.created_at)}
                    </span>
                  </div>
                  {r.place && (
                    <p className="text-muted text-sm">
                      sur{" "}
                      <Link
                        href={`/admin/lieux/${r.place.id}`}
                        className="text-ink hover:text-brand font-semibold"
                      >
                        {r.place.name}
                      </Link>
                    </p>
                  )}
                  {r.title && <p className="font-semibold">{r.title}</p>}
                  {r.body && <p className="text-sm whitespace-pre-line">{r.body}</p>}
                  {r.moderation_reason && <p className="text-muted text-xs">Motif : {r.moderation_reason}</p>}
                </div>
                <DecisionButtons
                  compact
                  action={adminModerateReview}
                  hidden={{ id: r.id }}
                  choices={[
                    status !== "published" && {
                      value: "published",
                      label: "Publier",
                      tone: "primary" as const,
                    },
                    status !== "rejected" && {
                      value: "rejected",
                      label: "Refuser",
                      tone: "danger" as const,
                      needsReason: true,
                    },
                    status === "published" && {
                      value: "hidden",
                      label: "Masquer",
                      tone: "neutral" as const,
                      needsReason: true,
                    },
                  ].filter((c): c is Exclude<typeof c, false> => Boolean(c))}
                />
              </li>
            ))}
          </ul>
        )}
        <Pagination
          page={page}
          total={total}
          pageSize={PAGE_SIZE}
          href={(p) => `/admin/avis?statut=${status}&page=${p}`}
        />
      </Card>
    </>
  );
}
