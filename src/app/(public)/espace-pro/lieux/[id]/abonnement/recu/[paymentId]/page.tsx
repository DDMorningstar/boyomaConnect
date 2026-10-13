import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BadgeCheck } from "lucide-react";
import { getConsolePlace } from "@/features/owner/business";
import { networkLabel } from "@/features/payments/malipo/status";
import { formatPrice } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { PrintButton } from "@/app/affiche/[slug]/print-button";

type Props = { params: Promise<{ id: string; paymentId: string }> };

interface ReceiptRow {
  id: string;
  status: string;
  amount: number;
  currency: string;
  provider: string;
  provider_reference: string | null;
  confirmed_at: string | null;
  confirmation_source: string | null;
  invoice: {
    number: string;
    description: string;
    place_id: string;
    subscription: { current_period_start: string | null; current_period_end: string | null } | null;
  } | null;
}

const dt = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("fr-CD", {
        dateStyle: "long",
        timeStyle: "short",
        timeZone: "Africa/Lubumbashi",
      }).format(new Date(iso))
    : "—";

/**
 * Preuve de paiement : affichée uniquement pour un paiement confirmé par le fournisseur
 * (webhook signé ou lecture de l'API) ou validé par l'équipe. Imprimable.
 */
export default async function ReceiptPage({ params }: Props) {
  const { id, paymentId } = await params;
  const place = await getConsolePlace(id);
  if (!place || !/^[0-9a-f-]{36}$/i.test(paymentId)) notFound();
  const supabase = await createSupabaseServerClient();
  const [{ data: pay }, { data: charge }] = await Promise.all([
    supabase
      .from("payments")
      .select(
        "id, status, amount, currency, provider, provider_reference, confirmed_at, confirmation_source, invoice:invoices (number, description, place_id, subscription:subscriptions (current_period_start, current_period_end))",
      )
      .eq("id", paymentId)
      .maybeSingle<ReceiptRow>(),
    supabase
      .from("malipo_charges")
      .select("network, phone_masked, environment, charge_id")
      .eq("payment_id", paymentId)
      .maybeSingle<{
        network: string;
        phone_masked: string;
        environment: string;
        charge_id: string | null;
      }>(),
  ]);
  if (!pay || pay.invoice?.place_id !== place.id) notFound();
  const confirmed = pay.status === "confirmed" || pay.status === "refunded";
  const base = `/espace-pro/lieux/${place.id}/abonnement`;

  return (
    <div className="max-w-xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={base} className="text-muted inline-flex items-center gap-1 text-sm">
          <ArrowLeft className="size-4" aria-hidden="true" /> Abonnement
        </Link>
        {confirmed && <PrintButton />}
      </div>
      {!confirmed ? (
        <div className="border-line bg-surface rounded-[var(--radius-card)] border p-5 text-sm">
          Ce paiement n&apos;est pas confirmé : aucune preuve de paiement n&apos;est disponible.
        </div>
      ) : (
        <article className="border-line bg-surface space-y-4 rounded-[var(--radius-card)] border p-6 shadow-[var(--shadow-card)] print:border-0 print:shadow-none">
          <header className="flex items-start justify-between gap-3">
            <div>
              <p className="text-muted text-xs font-semibold tracking-wide uppercase">Boyoma Connect</p>
              <h2 className="text-xl font-extrabold">Preuve de paiement</h2>
            </div>
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-bold ${
                pay.status === "refunded" ? "bg-surface-2 text-muted" : "bg-success/10 text-success"
              }`}
            >
              <BadgeCheck className="size-3.5" aria-hidden="true" />
              {pay.status === "refunded" ? "Remboursé" : "Payé"}
            </span>
          </header>
          {charge?.environment === "sandbox" && (
            <p className="bg-warning/10 text-warning rounded-xl px-3 py-2 text-xs font-semibold">
              Paiement de test (Sandbox) : aucune somme réelle n&apos;a été prélevée.
            </p>
          )}
          <dl className="divide-line divide-y text-sm">
            <Row label="Établissement" value={place.name} />
            <Row label="Objet" value={pay.invoice?.description ?? "—"} />
            <Row label="Facture" value={pay.invoice?.number ?? "—"} />
            <Row label="Montant" value={formatPrice(pay.amount, pay.currency)} strong />
            <Row
              label="Moyen de paiement"
              value={
                charge
                  ? `${networkLabel(charge.network)} · ${charge.phone_masked}`
                  : "Paiement validé par l'équipe"
              }
            />
            <Row label="Référence" value={charge?.charge_id ?? pay.provider_reference ?? "—"} mono />
            <Row label="Confirmé le" value={dt(pay.confirmed_at)} />
            {pay.invoice?.subscription?.current_period_end && (
              <Row
                label="Période couverte"
                value={`${dt(pay.invoice.subscription.current_period_start)} → ${dt(pay.invoice.subscription.current_period_end)}`}
              />
            )}
          </dl>
          <p className="text-muted text-xs">
            Paiement confirmé par{" "}
            {pay.confirmation_source === "manual_review"
              ? "l'équipe Boyoma Connect"
              : "le prestataire de paiement Malipo"}
            . Document généré par Boyoma Connect.
          </p>
        </article>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  mono,
}: {
  label: string;
  value: string;
  strong?: boolean;
  mono?: boolean;
}) {
  return (
    <div className="flex justify-between gap-4 py-2">
      <dt className="text-muted">{label}</dt>
      <dd
        className={`text-right ${strong ? "font-extrabold" : ""} ${mono ? "font-mono text-xs break-all" : ""}`}
      >
        {value}
      </dd>
    </div>
  );
}
