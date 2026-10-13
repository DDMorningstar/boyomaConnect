import Link from "next/link";
import { BadgeCheck, Phone } from "lucide-react";
import { DecisionButtons } from "@/components/admin/action-form";
import {
  Card,
  EmptyState,
  PageHeader,
  StatusBadge,
  Tabs,
  fieldCls,
  relativeTime,
} from "@/components/admin/ui";
import { BizForm } from "@/components/forms/action-forms";
import { requirePermission } from "@/features/admin/access";
import { listVerificationsAdmin } from "@/features/admin/business";
import { adminHandleVerification } from "@/features/admin/business-actions";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Vérifications" };

const TABS = [
  { value: "pending", label: "À planifier" },
  { value: "scheduled", label: "Programmées" },
  { value: "completed", label: "Effectuées" },
  { value: "rejected", label: "Refusées" },
];

/** Demandes de vérification sur place : planifier la visite, puis valider après passage de l'agent. */
export default async function VerificationsAdmin({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string }>;
}) {
  await requirePermission("places.publish", "/admin/verifications");
  const sp = await searchParams;
  const status = TABS.some((t) => t.value === sp.statut) ? sp.statut! : "pending";
  const rows = await listVerificationsAdmin(status);
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lubumbashi" }).format(new Date());

  return (
    <>
      <PageHeader
        title="Vérifications sur place"
        description="Ne validez qu'après le passage effectif d'un agent : existence, position et contacts confirmés. La fiche reçoit alors le badge « Vérifiée (agent) »."
      />
      <Tabs
        active={status}
        tabs={TABS.map((t) => ({
          ...t,
          href: t.value === "pending" ? "/admin/verifications" : `/admin/verifications?statut=${t.value}`,
        }))}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={BadgeCheck} title="Aucune demande dans cette liste" />
        ) : (
          <ul className="divide-line divide-y">
            {rows.map((r) => (
              <li key={r.id} className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_320px] md:items-start">
                <div className="min-w-0 space-y-1.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      status={r.status === "scheduled" ? "active" : r.status}
                      label={TABS.find((t) => t.value === r.status)?.label}
                    />
                    <span className="text-muted text-xs">demandée {relativeTime(r.created_at)}</span>
                  </div>
                  {r.place && (
                    <p>
                      <Link href={`/admin/lieux/${r.place.id}`} className="hover:text-brand font-semibold">
                        {r.place.name}
                      </Link>
                      {r.place.address_text && <span className="text-muted"> · {r.place.address_text}</span>}
                    </p>
                  )}
                  {r.place?.landmark_description && (
                    <p className="text-muted">Repère : {r.place.landmark_description}</p>
                  )}
                  {r.contact_phone && (
                    <p>
                      <a
                        href={`tel:${r.contact_phone.replace(/\s/g, "")}`}
                        className="text-brand inline-flex items-center gap-1 font-semibold"
                      >
                        <Phone className="size-3.5" aria-hidden="true" /> {r.contact_phone}
                      </a>
                    </p>
                  )}
                  {r.preferred_time && <p>Disponibilité : {r.preferred_time}</p>}
                  {r.notes && <p className="whitespace-pre-line">Indications : {r.notes}</p>}
                  {r.scheduled_for && (
                    <p className="font-semibold">Visite prévue le {formatDate(r.scheduled_for)}</p>
                  )}
                  {r.admin_notes && <p className="text-muted">Note : {r.admin_notes}</p>}
                </div>
                {(status === "pending" || status === "scheduled") && (
                  <div className="space-y-3">
                    <BizForm
                      action={adminHandleVerification}
                      hidden={{ id: r.id, decision: "schedule" }}
                      submit={status === "scheduled" ? "Reprogrammer" : "Programmer la visite"}
                      className="space-y-2"
                    >
                      <input
                        name="date"
                        type="date"
                        min={today}
                        required
                        aria-label="Date de la visite"
                        className={`${fieldCls} w-full`}
                      />
                      <input
                        name="notes"
                        maxLength={300}
                        placeholder="Note pour l'établissement (facultatif)"
                        className={`${fieldCls} w-full`}
                      />
                    </BizForm>
                    <DecisionButtons
                      compact
                      action={adminHandleVerification}
                      hidden={{ id: r.id }}
                      reasonPlaceholder="Constat de l'agent / motif du refus"
                      choices={[
                        ...(status === "scheduled"
                          ? [
                              {
                                value: "complete",
                                label: "Visite faite : vérifiée",
                                tone: "primary" as const,
                                needsReason: true,
                              },
                            ]
                          : []),
                        { value: "reject", label: "Refuser", tone: "danger" as const, needsReason: true },
                      ]}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
