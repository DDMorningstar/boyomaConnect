import Link from "next/link";
import { notFound } from "next/navigation";
import { Check, Info, Lock, Receipt, Smartphone } from "lucide-react";
import { inputClass, labelClass } from "@/components/forms/form-message";
import { getBilling, getConsolePlace, type Invoice, type Plan } from "@/features/owner/business";
import {
  cancelPlanRequest,
  startPlanRequest,
  submitPaymentReference,
} from "@/features/owner/business-actions";
import type { PaymentView } from "@/features/payments/malipo/actions";
import { getMalipoRuntime } from "@/features/payments/malipo/server";
import {
  STATUS_LABEL,
  failureMessage,
  isFailure,
  isInFlight,
  networkLabel,
  type ChargeStatus,
} from "@/features/payments/malipo/status";
import { formatPrice } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ActionButton, BizForm } from "@/components/forms/action-forms";
import { Panel, shortDate } from "../ui";
import { MobileMoneyCheckout } from "./mobile-money-checkout";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ payer?: string }> };

const INVOICE_STATUS: Record<string, string> = {
  draft: "Brouillon",
  open: "À payer",
  paid: "Payée",
  void: "Annulée",
  uncollectible: "Irrécouvrable",
};

interface ChargeListRow {
  id: string;
  payment_id: string;
  status: string;
  network: string;
  phone_masked: string;
  amount: number;
  currency: string;
  environment: "sandbox" | "live";
  charge_id: string | null;
  failure_reason: string | null;
  created_at: string;
}

/**
 * Abonnement : paiement Mobile Money via Malipo (D33, confirmé par webhook signé ou lecture de
 * l'API) et, si l'équipe a publié des instructions, paiement manuel validé par l'équipe (D32).
 * Aucun paiement n'est confirmé par un clic ou par le navigateur.
 */
export default async function BillingPage({ params, searchParams }: Props) {
  const { id } = await params;
  const { payer } = await searchParams;
  const place = await getConsolePlace(id);
  if (!place) notFound();
  const supabase = await createSupabaseServerClient();
  const [{ plans, subscriptions, invoices, activePlan, instructions }, charges] = await Promise.all([
    getBilling(place.id),
    supabase
      .from("malipo_charges")
      .select(
        "id, payment_id, status, network, phone_masked, amount, currency, environment, charge_id, failure_reason, created_at",
      )
      .eq("place_id", place.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .overrideTypes<ChargeListRow[], { merge: false }>()
      .then((r) => r.data ?? []),
  ]);
  const malipo = getMalipoRuntime();
  const mobileMoney = malipo.available;
  const hidden = { place_id: place.id };
  const pending = subscriptions.find((s) => s.status === "pending_payment");
  const current = subscriptions.find(
    (s) => s.status === "active" || s.status === "trialing" || s.status === "past_due",
  );
  const pendingInvoice = pending
    ? invoices.find((i) => i.subscription_id === pending.id && i.status === "open")
    : undefined;
  const pendingPayment = pendingInvoice?.payments.find(
    (p) => p.status === "pending" && p.provider !== "malipo",
  );
  const failedPayment = pendingInvoice?.payments.find(
    (p) => p.status === "failed" && p.provider !== "malipo",
  );
  const blocked = current
    ? `Votre abonnement ${current.plan?.name ?? ""} est actif jusqu'au ${shortDate(current.current_period_end)} : un changement de plan sera possible à son échéance.`
    : pending
      ? "Une demande d'abonnement est déjà en cours (voir ci-dessous)."
      : !instructions && !mobileMoney
        ? "Le paiement des abonnements n'est pas encore ouvert : l'équipe Boyoma Connect publiera bientôt les moyens de paiement."
        : null;

  // Plan à régler par Mobile Money : la demande en cours, sinon le plan choisi (?payer=…).
  const checkoutPlan = pending
    ? plans.find((p) => p.key === pending.plan?.key)
    : !current
      ? plans.find((p) => p.key === payer && Number(p.price_monthly) > 0)
      : undefined;
  const pendingPaymentIds = new Set(pendingInvoice?.payments.map((p) => p.id) ?? []);
  const lastRow =
    charges.find((c) => isInFlight(c.status) && Date.now() - Date.parse(c.created_at) < 30 * 60 * 1000) ??
    charges.find((c) => pendingPaymentIds.has(c.payment_id));
  const initialView: PaymentView | null = lastRow
    ? {
        rowId: lastRow.id,
        paymentId: lastRow.payment_id,
        status: lastRow.status,
        network: lastRow.network,
        phoneMasked: lastRow.phone_masked,
        amount: Number(lastRow.amount).toFixed(2),
        currency: lastRow.currency,
        environment: lastRow.environment,
        reference: lastRow.charge_id,
        message: isFailure(lastRow.status) ? failureMessage(lastRow.status, lastRow.failure_reason) : null,
      }
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
              manual={Boolean(instructions)}
              mobileMoney={mobileMoney}
            />
          ))}
        </ul>
        {blocked && (
          <p className="text-muted flex items-start gap-2 text-sm">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> {blocked}
          </p>
        )}
        {!mobileMoney && (
          <p className="text-muted flex items-start gap-2 text-sm">
            <Smartphone className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> Paiement Mobile Money
            (M-Pesa, Orange Money, Airtel Money) bientôt disponible.
          </p>
        )}
      </Panel>

      {mobileMoney && checkoutPlan && (
        <Panel
          id="paiement"
          title={`Payer par Mobile Money : ${checkoutPlan.name}`}
          description="Vodacom M-Pesa, Orange Money ou Airtel Money. Vous validez la demande sur votre téléphone avec votre code PIN."
        >
          <MobileMoneyCheckout
            key={checkoutPlan.key}
            placeId={place.id}
            plan={{ key: checkoutPlan.key, name: checkoutPlan.name }}
            amountLabel={formatPrice(
              pendingInvoice?.amount ?? checkoutPlan.price_monthly,
              pendingInvoice?.currency ?? checkoutPlan.currency,
            )}
            environment={malipo.config.mode}
            initial={initialView}
          />
        </Panel>
      )}

      {pending && pendingInvoice && (
        <Panel
          title={`Demande en cours : ${pending.plan?.name ?? "abonnement"}`}
          description={`Montant : ${formatPrice(pendingInvoice.amount, pendingInvoice.currency)} · à régler avant le ${shortDate(pendingInvoice.due_at)}`}
        >
          {instructions && (
            <div className="bg-surface-2 rounded-2xl p-4 text-sm">
              <p className="mb-1 font-semibold">Autre moyen de paiement</p>
              <p className="whitespace-pre-line">{instructions}</p>
            </div>
          )}
          {pendingPayment?.provider_reference ? (
            <p className="flex items-start gap-2 text-sm">
              <Check className="text-success mt-0.5 size-4 shrink-0" aria-hidden="true" />
              Référence « {pendingPayment.provider_reference} » envoyée : l&apos;équipe vérifie la transaction
              puis active votre plan. Vous serez notifié.
            </p>
          ) : pendingPayment && instructions ? (
            <BizForm
              action={submitPaymentReference}
              hidden={{ ...hidden, id: pendingPayment.id }}
              submit="Envoyer la référence"
            >
              <div>
                <label htmlFor="pay-ref" className={labelClass}>
                  Référence de la transaction (après paiement manuel)
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

      {charges.length > 0 && (
        <Panel title="Paiements Mobile Money">
          <ul className="divide-line divide-y text-sm">
            {charges.map((c) => (
              <li key={c.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold">{shortDate(c.created_at)}</span> · {networkLabel(c.network)}{" "}
                  · {c.phone_masked}
                  {c.environment === "sandbox" && <span className="text-warning"> · test</span>}
                </span>
                <span className="tabular-nums">{formatPrice(c.amount, c.currency)}</span>
                <span
                  className={`w-40 text-right text-xs font-semibold ${
                    c.status === "succeeded"
                      ? "text-success"
                      : isFailure(c.status)
                        ? "text-danger"
                        : "text-muted"
                  }`}
                >
                  {STATUS_LABEL[c.status as ChargeStatus] ?? c.status}
                </span>
                {c.status === "succeeded" && (
                  <Link
                    href={`/espace-pro/lieux/${place.id}/abonnement/recu/${c.payment_id}`}
                    className="text-brand w-full text-right text-xs font-semibold sm:w-auto"
                  >
                    Preuve de paiement
                  </Link>
                )}
              </li>
            ))}
          </ul>
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
  manual,
  mobileMoney,
}: {
  plan: Plan;
  active: boolean;
  placeId: string;
  blocked: string | null;
  manual: boolean;
  mobileMoney: boolean;
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
          <div className="flex flex-col gap-2">
            {mobileMoney && (
              <Link
                href={`/espace-pro/lieux/${placeId}/abonnement?payer=${plan.key}#paiement`}
                scroll={false}
                className="bg-brand hover:bg-brand-strong inline-flex min-h-10 items-center justify-center gap-1.5 rounded-full px-4 text-sm font-semibold text-white"
              >
                <Smartphone className="size-4" aria-hidden="true" /> Payer par Mobile Money
              </Link>
            )}
            {manual && (
              <ActionButton
                action={startPlanRequest}
                hidden={{ place_id: placeId, decision: plan.key }}
                variant={mobileMoney ? "secondary" : "primary"}
              >
                {mobileMoney ? "Autre moyen de paiement" : `Choisir ${plan.name}`}
              </ActionButton>
            )}
          </div>
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
