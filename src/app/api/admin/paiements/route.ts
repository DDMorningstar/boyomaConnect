import { getCurrentUser } from "@/features/auth/session";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { parsePaymentFilters, queryCharges } from "@/features/admin/payments";
import { STATUS_LABEL, networkLabel, type ChargeStatus } from "@/features/payments/malipo/status";

/**
 * Export CSV des paiements Mobile Money (permission billing.read, mêmes filtres que la page).
 * Séparateur « ; » et BOM UTF-8 pour Excel ; cellules neutralisées contre l'injection de formules.
 */
export const dynamic = "force-dynamic";

function cell(v: unknown) {
  let s = v == null ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  if (!(await getCurrentUser())) return new Response("Non connecté", { status: 401 });
  const supabase = await createSupabaseServerClient();
  const { data: allowed } = await supabase.rpc("has_permission", { p_permission: "billing.read" });
  if (allowed !== true) return new Response("Accès refusé", { status: 403 });

  const sp = Object.fromEntries(new URL(request.url).searchParams.entries());
  const filters = parsePaymentFilters(sp);
  const { rows, error } = await queryCharges(filters, { from: 0, to: 9999 });
  if (error) return new Response("Export indisponible", { status: 503 });

  const header = [
    "Date (UTC)",
    "Statut",
    "Environnement",
    "Établissement",
    "Facture",
    "Montant",
    "Devise",
    "Opérateur",
    "Numéro (masqué)",
    "Référence Malipo",
    "Identifiant paiement",
    "Frais (unités API)",
    "Net (unités API)",
    "Motif d'échec",
    "Anomalie",
    "Utilisateur",
  ];
  const lines = rows.map((r) =>
    [
      r.created_at,
      STATUS_LABEL[r.status as ChargeStatus] ?? r.status,
      r.environment,
      r.place?.name,
      r.invoice?.number,
      Number(r.amount).toFixed(2),
      r.currency,
      networkLabel(r.network),
      r.phone_masked,
      r.charge_id,
      r.payment_id,
      r.fee_amount,
      r.net_amount,
      r.failure_reason,
      r.anomaly,
      r.initiated_by,
    ]
      .map(cell)
      .join(";"),
  );
  const csv = "﻿" + [header.map(cell).join(";"), ...lines].join("\r\n");
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="paiements-mobile-money-${stamp}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
