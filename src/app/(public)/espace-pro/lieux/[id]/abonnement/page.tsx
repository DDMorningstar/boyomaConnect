import { notFound } from "next/navigation";
import { Check, Info, Lock, Receipt } from "lucide-react";
import { inputClass, labelClass } from "@/components/forms/form-message";
import { getBilling, getConsolePlace, type Invoice, type Plan } from "@/features/owner/business";
import {
  cancelPlanRequest,
  startPlanRequest,
  submitPaymentReference,
} from "@/features/owner/business-actions";
import { formatPrice } from "@/lib/format";
import { ActionButton, BizForm } from "@/components/forms/action-forms";
import { Panel, shortDate } from "../ui";

type Props = { params: Promise<{ id: string }> };

const INVOICE_STATUS: Record<string, string> = {
  draft: "Brouillon",
  open: "À payer",
  paid: "Payée",
  void: "Annulée",
  uncollectible: "Irrécouvrable",
};

/**
 * Abonnement (décision D32) : paiement manuel (Mobile Money, virement…) selon les instructions
 * publiées par l'équipe. L'établissement indique sa référence ; seule l'équipe valide le paiement,
 * après vérification, et l'opération est journalisée. Aucun paiement n'est confirmé par un clic ici.
 */
export default async function BillingPage({ params }: Props) {
  const { id } = await params;
  const place = await getConsolePlace(id);
  if (!place) notFound();
  const { plans, subscriptions, invoices, activePlan, instructions } = await getBilling(place.id);
  const hidden = { place_id: place.id };
  const pending = subscriptions.find((s) => s.status === "pending_payment");
  const current = subscriptions.find(
    (s) => s.status === "active" || s.status === "trialing" || s.status === "past_due",
  );
  const pendingInvoice = pending
    ? invoices.find((i) => i.subscription_id === pending.id && i.status === "open")
    : undefined;
  const pendingPayment = pendingInvoice?.payments.find((p) => p.status === "pending");
  const failedPayment = pendingInvoice?.payments.find((p) => p.status === "failed");
  const blocked = !instructions
    ? "Le paiement des abonnements n'est pas encore ouvert : l'équipe Boyoma Connect publiera bientôt les moyens de paiement."
    : pending
      ? "Une demande d'abonnement est déjà en cours (voir ci-dessous)."
      : current
        ? `Votre abonnement ${current.plan?.name ?? ""} est actif jusqu'au ${shortDate(current.current_period_end)} : un changement de plan sera possible à son échéance.`
        : null;

  return (
    <div className="space-y-5">
      <Panel
        title="Plans"
        description={
          <>
            Plan actuel : <strong>{plans.find((p) => p.key === activePlan)?.name ?? activePlan}</strong>
            {current?.current_period_end && <> · jusqu&apos;au {shortDate(current.current_period_end)}</>}
          </>
        }
      >
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              active={plan.key === activePlan}
              placeId={place.id}
              blocked={blocked}
            />
          ))}
        </ul>
        {blocked && (
          <p className="text-muted flex items-start gap-2 text-sm">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {blocked}
          </p>
        )}
      </Panel>

      {pending && pendingInvoice && (
        <Panel
          title={`Demande en cours : ${pending.plan?.name ?? "abonnement"}`}
          description={`Montant : ${formatPrice(pendingInvoice.amount, pendingInvoice.currency)} · à régler avant le ${shortDate(pendingInvoice.due_at)}`}
        >
          {instructions ? (
            <div className="bg-surface-2 rounded-2xl p-4 text-sm">
              <p className="mb-1 font-semibold">Comment payer</p>
              <p className="whitespace-pre-line">{instructions}</p>
            </div>
          ) : (
            <p className="text-muted text-sm">
              Les instructions de paiement ne sont pas disponibles pour le moment.
            </p>
          )}
          {pendingPayment?.provider_reference ? (
            <p className="flex items-start gap-2 text-sm">
              <Check className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Référence « {pendingPayment.provider_reference} » envoyée : l&apos;équipe vérifie la transaction
              puis active votre plan. Vous serez notifié.
            </p>
          ) : pendingPayment ? (
            <BizForm
              action={submitPaymentReference}
              hidden={{ ...hidden, id: pendingPayment.id }}
              submit="Envoyer la référence"
            >
              <div>
                <label htmlFor="pay-ref" className={labelClass}>
                  Référence de la transaction (après paiement)
                </label>
                <input
                  id="pay-ref"
                  name="reference"
                  required
                  minLength={4}
                  maxLength={80}
                  autoComplete="off"
                  placeholder="Ex. : identifiant reçu par SMS"
                  className={inputClass}
                />
              </div>
            </BizForm>
          ) : (
            failedPayment && (
              <p className="text-danger text-sm">
                Paiement non validé{failedPayment.failure_reason ? ` : ${failedPayment.failure_reason}` : ""}.
                Annulez cette demande puis recommencez.
              </p>
            )
          )}
          <ActionButton
            action={cancelPlanRequest}
            hidden={{ ...hidden, id: pending.id }}
            variant="danger"
            confirm="Annuler cette demande d'abonnement ?"
          >
            Annuler la demande
          </ActionButton>
        </Panel>
      )}

      <Panel title="Factures">
        {invoices.length === 0 ? (
          <p className="text-muted flex items-center gap-2 text-sm">
            <Receipt className="size-4" aria-hidden="true" /> Aucune facture.
          </p>
        ) : (
          <ul className="divide-line divide-y text-sm">
            {invoices.map((inv) => (
              <InvoiceRow key={inv.id} inv={inv} />
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
}

function PlanCard({
  plan,
  active,
  placeId,
  blocked,
}: {
  plan: Plan;
  active: boolean;
  placeId: string;
  blocked: string | null;
}) {
  const features = plan.plan_features.filter((f) => f.label && f.value !== false && f.value !== "false");
  return (
    <li
      className={`flex flex-col gap-3 rounded-2xl border p-4 ${active ? "border-brand ring-brand/15 ring-4" : "border-line"}`}
    >
      <div>
        <p className="flex items-center justify-between font-bold">
          {plan.name}
          {active && <span className="bg-brand rounded-full px-2 py-0.5 text-xs text-white">Actuel</span>}
        </p>
        <p className="mt-1 text-2xl font-extrabold tabular-nums">
          {Number(plan.price_monthly) === 0 ? "Gratuit" : formatPrice(plan.price_monthly, plan.currency)}
          {Number(plan.price_monthly) > 0 && <span className="text-muted text-sm font-medium"> / mois</span>}
        </p>
        {plan.description && <p className="text-muted mt-1 text-sm">{plan.description}</p>}
      </div>
      <ul className="flex-1 space-y-1 text-sm">
        {features.map((f) => (
          <li key={f.feature_key} className="flex items-start gap-2">
            <Check className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
            <span>
              {f.label}
              {typeof f.value === "number" && <span className="text-muted"> ({f.value})</span>}
            </span>
          </li>
        ))}
      </ul>
      {Number(plan.price_monthly) > 0 &&
        !active &&
        (blocked ? (
          <button
            type="button"
            disabled
            title={blocked}
            className="border-line text-muted inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full border px-4 text-sm font-semibold"
          >
            <Lock className="size-3.5" aria-hidden="true" /> Indisponible
          </button>
        ) : (
          <ActionButton
            action={startPlanRequest}
            hidden={{ place_id: placeId, decision: plan.key }}
            variant="primary"
          >
            Choisir {plan.name}
          </ActionButton>
        ))}
    </li>
  );
}

function InvoiceRow({ inv }: { inv: Invoice }) {
  return (
    <li className="flex flex-wrap items-center gap-3 py-2.5">
      <span className="min-w-0 flex-1">
        <span className="font-semibold">{inv.number ?? "Facture"}</span> · {inv.description}
      </span>
      <span className="tabular-nums">{formatPrice(inv.amount, inv.currency)}</span>
      <span className="text-muted w-28 text-right text-xs">
        {INVOICE_STATUS[inv.status] ?? inv.status}
        {inv.paid_at && ` · ${shortDate(inv.paid_at)}`}
      </span>
    </li>
  );
}
