import Link from "next/link";
import { CreditCard, ShieldCheck } from "lucide-react";
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
import { listPaymentsAdmin } from "@/features/admin/business";
import { adminConfirmPayment, adminRejectPayment } from "@/features/admin/business-actions";
import { formatPrice } from "@/lib/format";

export const metadata = { title: "Facturation" };

const TABS = [
  { value: "pending", label: "En attente" },
  { value: "confirmed", label: "Validés" },
  { value: "failed", label: "Refusés" },
  { value: "cancelled", label: "Annulés" },
];

/**
 * Paiements manuels : validation uniquement après contrôle de la transaction sur le relevé
 * (Mobile Money, banque). Référence et justification obligatoires, journalisées ; un membre de
 * l'équipe ne peut pas valider un paiement qu'il a lui-même initié.
 */
export default async function BillingAdmin({ searchParams }: { searchParams: Promise<{ statut?: string }> }) {
  await requirePermission("billing.read", "/admin/facturation");
  const sp = await searchParams;
  const status = TABS.some((t) => t.value === sp.statut) ? sp.statut! : "pending";
  const rows = await listPaymentsAdmin(status);

  return (
    <>
      <PageHeader
        title="Facturation"
        description="Abonnements payés hors ligne. Comparez la référence indiquée par l'établissement avec votre relevé avant toute validation."
      />
      <p className="text-muted mb-4 flex items-start gap-2 text-sm">
        <ShieldCheck className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
        Les instructions de paiement affichées aux établissements se règlent dans Paramètres (clé «
        billing.manual_instructions ») ; tant qu&apos;elles sont vides, aucune demande d&apos;abonnement
        n&apos;est possible.
      </p>
      <Tabs
        active={status}
        tabs={TABS.map((t) => ({
          ...t,
          href: t.value === "pending" ? "/admin/facturation" : `/admin/facturation?statut=${t.value}`,
        }))}
      />
      <Card>
        {rows.length === 0 ? (
          <EmptyState icon={CreditCard} title="Aucun paiement dans cette liste" />
        ) : (
          <ul className="divide-line divide-y">
            {rows.map((p) => (
              <li key={p.id} className="grid gap-4 p-5 md:grid-cols-[minmax(0,1fr)_340px] md:items-start">
                <div className="min-w-0 space-y-1.5 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge
                      status={p.status === "confirmed" ? "approved" : p.status}
                      label={TABS.find((t) => t.value === p.status)?.label}
                    />
                    <span className="text-muted text-xs">mis à jour {relativeTime(p.updated_at)}</span>
                  </div>
                  {p.invoice?.place && (
                    <p>
                      <Link
                        href={`/admin/lieux/${p.invoice.place.id}`}
                        className="hover:text-brand font-semibold"
                      >
                        {p.invoice.place.name}
                      </Link>
                    </p>
                  )}
                  <p>
                    {p.invoice?.description} ·{" "}
                    <strong className="tabular-nums">{formatPrice(p.amount, p.currency)}</strong>
                  </p>
                  <p>
                    Référence indiquée :{" "}
                    {p.provider_reference ? (
                      <span className="font-mono">{p.provider_reference}</span>
                    ) : (
                      <span className="text-muted">pas encore fournie</span>
                    )}
                  </p>
                  {p.failure_reason && <p className="text-danger">Motif : {p.failure_reason}</p>}
                </div>
                {status === "pending" && (
                  <div className="space-y-3">
                    {p.provider_reference ? (
                      <BizForm
                        action={adminConfirmPayment}
                        hidden={{ id: p.id }}
                        submit="Valider le paiement"
                        confirm={`Confirmer avoir reçu ${formatPrice(p.amount, p.currency)} (référence ${p.provider_reference}) ?`}
                        className="space-y-2"
                      >
                        <input
                          name="reference"
                          required
                          defaultValue={p.provider_reference}
                          aria-label="Référence vérifiée sur le relevé"
                          className={`${fieldCls} w-full`}
                        />
                        <textarea
                          name="notes"
                          required
                          rows={2}
                          maxLength={500}
                          placeholder="Justification : où et comment la transaction a été vérifiée"
                          className={`${fieldCls} w-full`}
                        />
                      </BizForm>
                    ) : (
                      <p className="text-muted text-sm">
                        Validation possible quand l&apos;établissement aura indiqué sa référence.
                      </p>
                    )}
                    <DecisionButtons
                      compact
                      action={adminRejectPayment}
                      hidden={{ id: p.id }}
                      reasonPlaceholder="Motif (visible par l'établissement)"
                      choices={[{ value: "reject", label: "Refuser", tone: "danger", needsReason: true }]}
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
