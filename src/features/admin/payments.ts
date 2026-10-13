import "server-only";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { decimalToMinor } from "@/features/payments/malipo/money";
import { CHARGE_STATUSES, NETWORKS } from "@/features/payments/malipo/status";

/**
 * Paiements Mobile Money (décision D33) côté équipe : lecture soumise à la RLS
 * (permission billing.read). Filtres partagés entre la page et l'export CSV.
 */
export interface PaymentFilters {
  status: string;
  network: string;
  environment: string;
  from: string;
  to: string;
  q: string;
  page: number;
}

export interface AdminChargeRow {
  id: string;
  payment_id: string;
  charge_id: string | null;
  status: string;
  network: string;
  phone_masked: string;
  amount: number;
  currency: string;
  environment: string;
  failure_reason: string | null;
  fee_amount: number | null;
  net_amount: number | null;
  api_amount_unit: string;
  anomaly: string | null;
  sync_error: string | null;
  initiated_by: string | null;
  created_at: string;
  succeeded_at: string | null;
  place: { id: string; name: string; slug: string } | null;
  invoice: { number: string } | null;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f-]{36}$/i;

export function parsePaymentFilters(sp: Record<string, string | undefined>): PaymentFilters {
  const pick = (v: string | undefined, ok: (x: string) => boolean) => (v && ok(v) ? v : "");
  return {
    status: pick(sp.statut, (x) => (CHARGE_STATUSES as string[]).includes(x)),
    network: pick(sp.reseau, (x) => NETWORKS.some((n) => n.id === x)),
    environment: pick(sp.env, (x) => x === "sandbox" || x === "live"),
    from: pick(sp.du, (x) => DATE.test(x)),
    to: pick(sp.au, (x) => DATE.test(x)),
    q: (sp.q ?? "").trim().slice(0, 80),
    page: Math.max(1, Number(sp.page) || 1),
  };
}

export function filtersToQuery(f: PaymentFilters, extra: Record<string, string> = {}) {
  const params = new URLSearchParams();
  if (f.status) params.set("statut", f.status);
  if (f.network) params.set("reseau", f.network);
  if (f.environment) params.set("env", f.environment);
  if (f.from) params.set("du", f.from);
  if (f.to) params.set("au", f.to);
  if (f.q) params.set("q", f.q);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  const s = params.toString();
  return s ? `?${s}` : "";
}

const SELECT =
  "id, payment_id, charge_id, status, network, phone_masked, amount, currency, environment, failure_reason, fee_amount, net_amount, api_amount_unit, anomaly, sync_error, initiated_by, created_at, succeeded_at, place:places!inner (id, name, slug), invoice:invoices (number)";

/** Requête filtrée (dates à l'heure de Kisangani, bornes incluses). */
export async function queryCharges(f: PaymentFilters, range: { from: number; to: number }) {
  const supabase = await createSupabaseServerClient();
  let q = supabase.from("malipo_charges").select(SELECT, { count: "exact" });
  if (f.status) q = q.eq("status", f.status);
  if (f.network) q = q.eq("network", f.network);
  if (f.environment) q = q.eq("environment", f.environment);
  if (f.from) q = q.gte("created_at", `${f.from}T00:00:00+02:00`);
  if (f.to) q = q.lte("created_at", `${f.to}T23:59:59.999+02:00`);
  if (f.q) {
    if (UUID.test(f.q)) q = q.or(`id.eq.${f.q},payment_id.eq.${f.q},initiated_by.eq.${f.q}`);
    else if (/^[A-Za-z0-9_-]+$/.test(f.q) && f.q.includes("_")) q = q.ilike("charge_id", `%${f.q}%`);
    else q = q.ilike("place.name", `%${f.q.replace(/[%_,()]/g, " ")}%`);
  }
  const { data, count, error } = await q
    .order("created_at", { ascending: false })
    .range(range.from, range.to)
    .overrideTypes<AdminChargeRow[], { merge: false }>();
  return { rows: data ?? [], total: count ?? 0, error: error?.message ?? null };
}

export interface PaymentStats {
  total: number;
  byStatus: Record<string, number>;
  byNetwork: Record<string, { count: number; succeeded: number }>;
  /** Montants encaissés (statut réussi), par devise, en centimes. */
  collected: Record<string, bigint>;
  refunded: Record<string, bigint>;
  truncated: boolean;
}

/** Indicateurs calculés sur les mêmes filtres (hors statut), au plus 5 000 lignes. */
export async function paymentStats(f: PaymentFilters): Promise<PaymentStats> {
  const { rows, total } = await queryCharges({ ...f, status: "" }, { from: 0, to: 4999 });
  const stats: PaymentStats = {
    total,
    byStatus: {},
    byNetwork: {},
    collected: {},
    refunded: {},
    truncated: total > rows.length,
  };
  for (const r of rows) {
    stats.byStatus[r.status] = (stats.byStatus[r.status] ?? 0) + 1;
    const n = (stats.byNetwork[r.network] ??= { count: 0, succeeded: 0 });
    n.count += 1;
    const minor = decimalToMinor(String(r.amount));
    if (r.status === "succeeded" || r.status === "partially_refunded") {
      n.succeeded += 1;
      stats.collected[r.currency] = (stats.collected[r.currency] ?? 0n) + minor;
    }
    if (r.status === "refunded") stats.refunded[r.currency] = (stats.refunded[r.currency] ?? 0n) + minor;
  }
  return stats;
}

export function minorToText(minor: bigint, currency: string) {
  const units = (minor / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${units},${(minor % 100n).toString().padStart(2, "0")} ${currency}`;
}
