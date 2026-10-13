import Link from "next/link";
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  CreditCard,
  Download,
  RotateCcw,
  Smartphone,
  XCircle,
} from "lucide-react";
import {
  Card,
  EmptyState,
  PageHeader,
  Pagination,
  StatCard,
  fieldCls,
  relativeTime,
} from "@/components/admin/ui";
import { requirePermission } from "@/features/admin/access";
import {
  filtersToQuery,
  minorToText,
  parsePaymentFilters,
  paymentStats,
  queryCharges,
} from "@/features/admin/payments";
import { profileNames } from "@/features/admin/queries";
import { formatApiAmount, type AmountUnit } from "@/features/payments/malipo/money";
import { getMalipoRuntime } from "@/features/payments/malipo/server";
import {
  CHARGE_STATUSES,
  NETWORKS,
  STATUS_LABEL,
  isFailure,
  networkLabel,
  type ChargeStatus,
} from "@/features/payments/malipo/status";
import { formatPrice } from "@/lib/format";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { ReconcileButton } from "./reconcile-button";

export const metadata = { title: "Paiements Mobile Money" };

const PAGE = 25;

const tone = (s: string) =>
  s === "succeeded"
    ? "bg-success/12 text-success"
    : isFailure(s)
      ? "bg-danger/12 text-danger"
      : s === "refunded" || s === "partially_refunded"
        ? "bg-surface-2 text-muted"
        : "bg-warning/12 text-warning";

/** Paiements Mobile Money (Malipo) : suivi, indicateurs, recherche, export (décision D33). */
export default async function PaymentsAdmin({
  searchParams,
}: {
  searchParams: Promise<Record<string, string>>;
}) {
  const ctx = await requirePermission("billing.read", "/admin/paiements");
  const filters = parsePaymentFilters(await searchParams);
  const [{ rows, total, error }, stats] = await Promise.all([
    queryCharges(filters, { from: (filters.page - 1) * PAGE, to: filters.page * PAGE - 1 }),
    paymentStats(filters),
  ]);
  const names = await profileNames(rows.map((r) => r.initiated_by));
  const runtime = getMalipoRuntime();
  const supabase = await createSupabaseServerClient();
  const { data: feeSetting } = await supabase
    .from("application_settings")
    .select("value")
    .eq("key", "billing.malipo_fee_estimate_percent")
    .maybeSingle<{ value: unknown }>();
  const feePercent = typeof feeSetting?.value === "number" ? feeSetting.value : null;
  const failed = (stats.byStatus.failed ?? 0) + (stats.byStatus.declined ?? 0) + (stats.byStatus.error ?? 0);
  const waiting =
    (stats.byStatus.initiating ?? 0) + (stats.byStatus.pending ?? 0) + (stats.byStatus.processing ?? 0);
  const collected =
    Object.entries(stats.collected)
      .map(([c, v]) => minorToText(v, c))
      .join(" · ") || "0";

  return (
    <>
      <PageHeader
        title="Paiements Mobile Money"
        description="Transactions Malipo (M-Pesa, Orange Money, Airtel Money). Un paiement n'est réussi que confirmé par Malipo (webhook signé ou lecture de l'API)."
        actions={
          <>
            <a
              href={`/api/admin/paiements${filtersToQuery(filters)}`}
              className="bg-brand hover:bg-brand-strong inline-flex h-9 items-center gap-1.5 rounded-xl px-3.5 text-sm font-semibold text-white"
            >
              <Download className="size-4" aria-hidden="true" /> Export CSV
            </a>
            {ctx.can("billing.manage") && (
              <ReconcileButton disabledReason={runtime.available ? null : runtime.reason} />
            )}
          </>
        }
      />

      <div
        className={`mb-5 flex flex-wrap items-center gap-2 rounded-2xl border px-4 py-3 text-sm ${
          runtime.available ? "border-line bg-surface" : "border-warning/40 bg-warning/10"
        }`}
      >
        <Smartphone className="size-4" aria-hidden="true" />
        {runtime.available ? (
          <span>
            Malipo actif en mode{" "}
            <strong>{runtime.config.mode === "live" ? "LIVE (paiements réels)" : "Sandbox (test)"}</strong> ·
            unité de montant :{" "}
            {runtime.config.amountUnit === "minor" ? "plus petite unité" : "unité principale"} · webhook :{" "}
            {runtime.config.webhookSecret ? (
              "secret configuré"
            ) : (
              <strong>{runtime.config.webhookReason}</strong>
            )}
          </span>
        ) : (
          <span>
            Encaissement Mobile Money indisponible : <strong>{runtime.reason}</strong>
          </span>
        )}
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="Transactions"
          value={stats.total}
          icon={CreditCard}
          hint={stats.truncated ? "Indicateurs sur les 5 000 plus récentes" : undefined}
        />
        <StatCard
          label="Réussies"
          value={stats.byStatus.succeeded ?? 0}
          icon={CheckCircle2}
          tone="success"
          hint={`Encaissé : ${collected}`}
        />
        <StatCard label="En attente" value={waiting} icon={Clock} tone="warning" />
        <StatCard
          label="Échouées / refusées"
          value={failed}
          icon={XCircle}
          tone="danger"
          hint={`Expirées : ${stats.byStatus.expired ?? 0} · Remboursées : ${(stats.byStatus.refunded ?? 0) + (stats.byStatus.partially_refunded ?? 0)}`}
        />
      </div>

      <Card className="mb-5 p-5">
        <h2 className="mb-3 font-bold">Répartition par opérateur</h2>
        <ul className="grid gap-3 sm:grid-cols-3">
          {NETWORKS.map((n) => {
            const s = stats.byNetwork[n.id];
            return (
              <li key={n.id} className="bg-surface-2 rounded-xl p-3 text-sm">
                <p className="flex items-center gap-2 font-semibold">
                  <span
                    className="size-2.5 rounded-full"
                    style={{ background: n.color }}
                    aria-hidden="true"
                  />
                  {n.label}
                </p>
                <p className="text-muted tabular-nums">
                  {s?.count ?? 0} transaction{(s?.count ?? 0) > 1 ? "s" : ""} · {s?.succeeded ?? 0} réussie
                  {(s?.succeeded ?? 0) > 1 ? "s" : ""}
                </p>
              </li>
            );
          })}
        </ul>
        {feePercent !== null && (
          <p className="text-muted mt-3 text-xs">
            Estimation interne des frais : {feePercent} % (paramètre modifiable). Jamais ajoutée au prix payé
            ; les frais réels sont ceux communiqués par Malipo (colonne « Frais »).
          </p>
        )}
      </Card>

      <Card className="mb-5 p-4">
        <form className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6" method="get">
          <input
            name="q"
            defaultValue={filters.q}
            placeholder="Référence ch_…, établissement, identifiant"
            aria-label="Recherche"
            className={`${fieldCls} lg:col-span-2`}
          />
          <select name="statut" defaultValue={filters.status} aria-label="Statut" className={fieldCls}>
            <option value="">Tous les statuts</option>
            {CHARGE_STATUSES.map((s) => (
              <option key={s} value={s}>
                {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
          <select name="reseau" defaultValue={filters.network} aria-label="Opérateur" className={fieldCls}>
            <option value="">Tous les opérateurs</option>
            {NETWORKS.map((n) => (
              <option key={n.id} value={n.id}>
                {n.label}
              </option>
            ))}
          </select>
          <select
            name="env"
            defaultValue={filters.environment}
            aria-label="Environnement"
            className={fieldCls}
          >
            <option value="">Sandbox et live</option>
            <option value="sandbox">Sandbox (test)</option>
            <option value="live">Live</option>
          </select>
          <div className="flex gap-2 lg:col-span-6">
            <input type="date" name="du" defaultValue={filters.from} aria-label="Du" className={fieldCls} />
            <input type="date" name="au" defaultValue={filters.to} aria-label="Au" className={fieldCls} />
            <button
              type="submit"
              className="bg-brand hover:bg-brand-strong h-10 rounded-xl px-4 text-sm font-semibold text-white"
            >
              Filtrer
            </button>
            <Link
              href="/admin/paiements"
              className="text-muted grid h-10 place-items-center px-2 text-sm font-semibold"
            >
              Réinitialiser
            </Link>
          </div>
        </form>
      </Card>

      <Card>
        {error ? (
          <EmptyState icon={AlertTriangle} title="Lecture impossible" text={error} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={CreditCard}
            title="Aucun paiement"
            text="Les paiements Mobile Money apparaîtront ici."
          />
        ) : (
          <ul className="divide-line divide-y">
            {rows.map((r) => (
              <li
                key={r.id}
                className="grid gap-2 p-4 text-sm md:grid-cols-[minmax(0,1fr)_auto] md:items-start"
              >
                <div className="min-w-0 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone(r.status)}`}>
                      {STATUS_LABEL[r.status as ChargeStatus] ?? r.status}
                    </span>
                    {r.environment === "sandbox" && (
                      <span className="bg-warning/12 text-warning rounded-full px-2 py-0.5 text-[11px] font-semibold">
                        test
                      </span>
                    )}
                    <span className="text-muted text-xs">{relativeTime(r.created_at)}</span>
                  </div>
                  <p>
                    {r.place && (
                      <Link href={`/admin/lieux/${r.place.id}`} className="hover:text-brand font-semibold">
                        {r.place.name}
                      </Link>
                    )}{" "}
                    · {r.invoice?.number ?? "—"} · {networkLabel(r.network)} · {r.phone_masked}
                  </p>
                  <p className="text-muted text-xs">
                    Réf. Malipo : <span className="font-mono">{r.charge_id ?? "—"}</span> · par{" "}
                    {(r.initiated_by && names.get(r.initiated_by)) || "—"}
                  </p>
                  {r.failure_reason && <p className="text-danger text-xs">Motif : {r.failure_reason}</p>}
                  {r.anomaly && (
                    <p className="text-danger flex items-center gap-1 text-xs font-semibold">
                      <AlertTriangle className="size-3.5" aria-hidden="true" /> {r.anomaly}
                    </p>
                  )}
                  {r.sync_error && (
                    <p className="text-muted text-xs">Dernière vérification : {r.sync_error}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-bold tabular-nums">{formatPrice(r.amount, r.currency)}</p>
                  <p className="text-muted text-xs tabular-nums">
                    Frais : {formatApiAmount(r.fee_amount, r.currency, r.api_amount_unit as AmountUnit)} · Net
                    : {formatApiAmount(r.net_amount, r.currency, r.api_amount_unit as AmountUnit)}
                  </p>
                  {r.status === "refunded" && (
                    <p className="text-muted inline-flex items-center gap-1 text-xs">
                      <RotateCcw className="size-3" aria-hidden="true" /> remboursé
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        <Pagination
          page={filters.page}
          total={total}
          pageSize={PAGE}
          href={(p) => `/admin/paiements${filtersToQuery(filters, { page: String(p) })}`}
        />
      </Card>
    </>
  );
}
