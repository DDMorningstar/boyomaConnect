import Link from "next/link";
import { FileClock } from "lucide-react";
import { Card, EmptyState, PageHeader, Pagination, fieldCls, tableCls } from "@/components/admin/ui";
import { requirePermission } from "@/features/admin/access";
import { listAudit } from "@/features/admin/queries";

export const metadata = { title: "Journal d'audit" };

const FAMILIES: Record<string, string> = {
  "": "Toutes les actions",
  "submission.": "Validations de fiches",
  "claim.": "Réclamations",
  "place.": "Fiches (statut, vérification, propriétaire)",
  "places.": "Imports",
  "role.": "Rôles",
  "user.": "Comptes",
  "report.": "Signalements",
  "review.": "Avis",
  "media.": "Photos",
  setting: "Paramètres",
};

const fmt = (iso: string) =>
  new Intl.DateTimeFormat("fr-CD", {
    dateStyle: "short",
    timeStyle: "medium",
    timeZone: "Africa/Lubumbashi",
  }).format(new Date(iso));

export default async function AuditAdmin({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; page?: string }>;
}) {
  await requirePermission("audit.read", "/admin/journal");
  const sp = await searchParams;
  const action = sp.action && sp.action in FAMILIES ? sp.action : "";
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total, names } = await listAudit(action || undefined, page);

  return (
    <>
      <PageHeader
        title="Journal d'audit"
        description="Historique infalsifiable des opérations sensibles : qui a fait quoi, quand. Aucune entrée ne peut être modifiée ni supprimée."
      />
      <Card>
        <form className="border-line flex flex-wrap gap-2 border-b p-4">
          <select name="action" defaultValue={action} className={fieldCls} aria-label="Type d'action">
            {Object.entries(FAMILIES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="bg-brand hover:bg-brand-strong rounded-xl px-4 text-sm font-semibold text-white"
          >
            Filtrer
          </button>
        </form>
        {rows.length === 0 ? (
          <EmptyState icon={FileClock} title="Aucune entrée" />
        ) : (
          <div className={tableCls.wrap}>
            <table className={tableCls.table}>
              <thead>
                <tr>
                  <th className={tableCls.th}>Date</th>
                  <th className={tableCls.th}>Auteur</th>
                  <th className={tableCls.th}>Action</th>
                  <th className={tableCls.th}>Objet</th>
                  <th className={tableCls.th}>Détails</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className={tableCls.tr}>
                    <td className={`${tableCls.td} text-muted font-mono text-xs whitespace-nowrap`}>
                      {fmt(r.created_at)}
                    </td>
                    <td className={`${tableCls.td} whitespace-nowrap`}>
                      {r.actor_id ? (names.get(r.actor_id) ?? "Utilisateur") : "Système"}
                    </td>
                    <td className={tableCls.td}>
                      <code className="bg-surface-2 rounded-md px-1.5 py-0.5 text-xs">{r.action}</code>
                    </td>
                    <td className={`${tableCls.td} text-xs`}>
                      {r.entity_type === "place" && r.entity_id ? (
                        <Link href={`/admin/lieux/${r.entity_id}`} className="text-brand">
                          Fiche
                        </Link>
                      ) : (
                        <span className="text-muted">{r.entity_type}</span>
                      )}
                    </td>
                    <td
                      className={`${tableCls.td} text-muted max-w-md truncate font-mono text-xs`}
                      title={JSON.stringify(r.details)}
                    >
                      {Object.keys(r.details ?? {}).length ? JSON.stringify(r.details) : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          page={page}
          total={total}
          pageSize={40}
          href={(p) => `/admin/journal?action=${encodeURIComponent(action)}&page=${p}`}
        />
      </Card>
    </>
  );
}
