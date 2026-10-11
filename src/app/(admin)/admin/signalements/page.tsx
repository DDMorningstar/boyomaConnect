import Link from "next/link";
import { Flag } from "lucide-react";
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
import { adminHandleReport } from "@/features/admin/actions";
import { PAGE_SIZE, listReports } from "@/features/admin/queries";

export const metadata = { title: "Signalements" };

const REASON: Record<string, string> = {
  wrong_info: "Informations erronées",
  wrong_location: "Mauvaise position",
  closed: "Établissement fermé",
  duplicate: "Doublon",
  inappropriate: "Contenu inapproprié",
  fraud: "Fraude / arnaque",
  other: "Autre",
};

export default async function ReportsAdmin({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; page?: string }>;
}) {
  await requirePermission("reports.handle", "/admin/signalements");
  const sp = await searchParams;
  const status = ["resolved", "dismissed"].includes(sp.statut ?? "") ? sp.statut! : "open";
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total } = await listReports(status, page);

  return (
    <>
      <PageHeader
        title="Signalements"
        description="Problèmes signalés par les visiteurs sur les fiches : corrigez la fiche puis marquez le signalement comme résolu."
      />
      <Tabs
        active={status}
        tabs={[
          { value: "open", label: "Ouverts", href: "/admin/signalements" },
          { value: "resolved", label: "Résolus", href: "/admin/signalements?statut=resolved" },
          { value: "dismissed", label: "Classés", href: "/admin/signalements?statut=dismissed" },
        ]}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState
            icon={Flag}
            title={status === "open" ? "Aucun signalement ouvert" : "Rien ici pour l'instant"}
          />
        ) : (
          <ul className="divide-line divide-y">
            {rows.map((r) => (
              <li key={r.id} className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-start">
                <div className="min-w-0 space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="bg-warning/12 text-warning rounded-full px-2.5 py-0.5 text-xs font-semibold">
                      {REASON[r.reason] ?? r.reason}
                    </span>
                    <StatusBadge status={r.status} />
                    <span className="text-muted text-xs">{relativeTime(r.created_at)}</span>
                  </div>
                  {r.place && (
                    <p className="font-semibold">
                      <Link href={`/admin/lieux/${r.place.id}`} className="hover:text-brand">
                        {r.place.name}
                      </Link>
                    </p>
                  )}
                  {r.details ? (
                    <p className="text-sm">{r.details}</p>
                  ) : (
                    <p className="text-muted text-sm italic">Pas de détail fourni.</p>
                  )}
                  {r.resolution_notes && (
                    <p className="text-muted text-xs">Traitement : {r.resolution_notes}</p>
                  )}
                </div>
                {r.status === "open" && (
                  <DecisionButtons
                    compact
                    action={adminHandleReport}
                    hidden={{ id: r.id }}
                    choices={[
                      { value: "resolved", label: "Résolu", tone: "primary", needsReason: true },
                      { value: "dismissed", label: "Classer", tone: "neutral", needsReason: true },
                    ]}
                    reasonPlaceholder="Ce qui a été fait (ex. téléphone corrigé)"
                  />
                )}
              </li>
            ))}
          </ul>
        )}
        <Pagination
          page={page}
          total={total}
          pageSize={PAGE_SIZE}
          href={(p) => `/admin/signalements?statut=${status}&page=${p}`}
        />
      </Card>
    </>
  );
}
