import Link from "next/link";
import { Tag } from "lucide-react";
import { DecisionButtons } from "@/components/admin/action-form";
import { Card, EmptyState, PageHeader, StatusBadge, Tabs, relativeTime } from "@/components/admin/ui";
import { requirePermission } from "@/features/admin/access";
import { listPromotionsAdmin } from "@/features/admin/business";
import { adminModeratePromotion } from "@/features/admin/business-actions";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Offres" };

const TABS = [
  { value: "pending_review", label: "À vérifier" },
  { value: "active", label: "Publiées" },
  { value: "rejected", label: "Refusées" },
  { value: "ended", label: "Terminées" },
];

/** Modération des offres datées des établissements (jamais sponsorisées, aucun effet sur le classement). */
export default async function PromotionsAdmin({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  await requirePermission("campaigns.manage", "/admin/offres");
  const sp = await searchParams;
  const status = TABS.some((t) => t.value === sp.statut) ? sp.statut! : "pending_review";
  const rows = await listPromotionsAdmin(status);

  return (
    <>
      <PageHeader
        title="Offres des établissements"
        description="Vérifiez que l'offre est réelle, lisible et conforme (pas de prix trompeur, pas de contenu interdit). Les offres publiées apparaissent sur la fiche et dans « Offres du moment »."
      />
      <Tabs
        active={status}
        tabs={TABS.map((t) => ({
          ...t,
          href: t.value === "pending_review" ? "/admin/offres" : `/admin/offres?statut=${t.value}`,
        }))}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={Tag} title="Aucune offre dans cette liste" />
        ) : (
          <ul className="divide-line divide-y">
            {rows.map((o) => (
              <li key={o.id} className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <StatusBadge status={o.status} />
                    <span className="text-muted text-xs">{relativeTime(o.created_at)}</span>
                  </div>
                  {o.place && (
                    <p className="text-muted text-sm">
                      <Link
                        href={`/lieux/${o.place.slug}`}
                        className="text-ink hover:text-brand font-semibold"
                      >
                        {o.place.name}
                      </Link>
                    </p>
                  )}
                  <p className="font-semibold">{o.title}</p>
                  {o.description && <p className="text-sm whitespace-pre-line">{o.description}</p>}
                  <p className="text-muted text-xs">
                    Du {formatDate(o.starts_at)} au {formatDate(o.ends_at)}
                  </p>
                </div>
                <DecisionButtons
                  compact
                  action={adminModeratePromotion}
                  hidden={{ id: o.id }}
                  choices={
                    status === "pending_review"
                      ? [
                          { value: "approve", label: "Publier", tone: "primary" },
                          { value: "reject", label: "Refuser", tone: "danger", needsReason: true },
                        ]
                      : status === "active"
                        ? [{ value: "end", label: "Arrêter", tone: "danger", needsReason: true }]
                        : []
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
