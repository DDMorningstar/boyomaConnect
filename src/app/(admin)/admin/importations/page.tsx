import Link from "next/link";
import {
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  DatabaseZap,
  FilePlus2,
  ListChecks,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Card, CardHeader, EmptyState, PageHeader, StatCard, tableCls } from "@/components/admin/ui";
import { DecisionButtons } from "@/components/admin/action-form";
import { BatchStatusBadge, ORIGIN, dateTime } from "@/components/admin/imports-ui";
import { requirePermission } from "@/features/admin/access";
import { runSchedule, toggleSchedule } from "@/features/imports/actions";
import { getImportOverview } from "@/features/imports/queries";

export const metadata = { title: "Importations" };

export default async function ImportsPage() {
  const ctx = await requirePermission("imports.view", "/admin/importations");
  const canManage = ctx.can("imports.manage");
  const { batches, schedules, sources, error } = await getImportOverview();
  const sum = (k: "created_count" | "updated_count" | "rejected_count") =>
    batches.reduce((s, b) => s + b[k], 0);
  const toReview = batches.filter((b) => b.status === "ready" || b.status === "failed");
  const quarantine = toReview.reduce((s, b) => s + b.quarantined_count, 0);
  const now = Date.now();

  return (
    <>
      <PageHeader
        title="Importations de données"
        description="Enrichissement de l'annuaire à partir de sources légalement réutilisables (OpenStreetMap, données ouvertes), avec contrôle, quarantaine et validation avant publication."
        actions={
          <>
            <Link
              href="/admin/importations/correspondances"
              className="border-line bg-surface hover:bg-surface-2 inline-flex h-10 items-center gap-2 rounded-xl border px-4 text-sm font-semibold"
            >
              <ListChecks className="size-4" aria-hidden="true" /> Correspondances
            </Link>
            {canManage ? (
              <Link
                href="/admin/importations/nouvelle"
                className="bg-brand hover:bg-brand-strong inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-semibold text-white"
              >
                <FilePlus2 className="size-4" aria-hidden="true" /> Nouvelle importation
              </Link>
            ) : (
              <span
                className="bg-surface-2 text-muted inline-flex h-10 cursor-not-allowed items-center gap-2 rounded-xl px-4 text-sm font-semibold"
                title="Permission imports.manage requise"
              >
                <FilePlus2 className="size-4" aria-hidden="true" /> Nouvelle importation (réservée)
              </span>
            )}
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Lots à contrôler"
          value={toReview.length}
          icon={ListChecks}
          tone="warning"
          index={0}
        />
        <StatCard
          label="Lieux créés"
          value={sum("created_count")}
          hint="Sur les 50 derniers lots"
          icon={Sparkles}
          tone="success"
          index={1}
        />
        <StatCard
          label="Lieux actualisés"
          value={sum("updated_count")}
          icon={RefreshCw}
          tone="cyan"
          index={2}
        />
        <StatCard
          label="En quarantaine"
          value={quarantine}
          hint="Dans les lots à contrôler"
          icon={ShieldAlert}
          tone="danger"
          index={3}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px]">
        <Card className="min-w-0">
          <CardHeader title="Journal des importations" />
          {error ? (
            <EmptyState title="Chargement impossible" text={error} icon={XCircle} />
          ) : batches.length === 0 ? (
            <EmptyState
              icon={DatabaseZap}
              title="Aucune importation"
              text="Lancez une recherche OpenStreetMap ou importez un fichier : rien n'est publié sans votre contrôle."
            />
          ) : (
            <div className={tableCls.wrap}>
              <table className={tableCls.table}>
                <thead>
                  <tr>
                    <th className={tableCls.th}>Lot</th>
                    <th className={tableCls.th}>Statut</th>
                    <th className={`${tableCls.th} text-right`}>Lus</th>
                    <th className={`${tableCls.th} text-right`}>Créés</th>
                    <th className={`${tableCls.th} text-right`}>Actualisés</th>
                    <th className={`${tableCls.th} text-right`}>Ignorés</th>
                    <th className={`${tableCls.th} text-right`}>Rejetés</th>
                    <th className={tableCls.th}>
                      <span className="sr-only">Ouvrir</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {batches.map((b) => (
                    <tr key={b.id} className={tableCls.tr}>
                      <td className={tableCls.td}>
                        <Link href={`/admin/importations/${b.id}`} className="block min-w-0">
                          <span className="hover:text-brand block font-semibold">
                            {ORIGIN[b.origin]} · {b.source?.name ?? b.source_key}
                          </span>
                          <span className="text-muted block text-xs">
                            {[b.zone?.name, b.file_name, dateTime(b.created_at)].filter(Boolean).join(" · ")}
                          </span>
                        </Link>
                      </td>
                      <td className={tableCls.td}>
                        <BatchStatusBadge status={b.status} />
                      </td>
                      <td className={`${tableCls.td} text-right tabular-nums`}>{b.total_count}</td>
                      <td className={`${tableCls.td} text-success text-right font-semibold tabular-nums`}>
                        {b.created_count}
                      </td>
                      <td className={`${tableCls.td} text-right tabular-nums`}>{b.updated_count}</td>
                      <td className={`${tableCls.td} text-muted text-right tabular-nums`}>
                        {b.skipped_count}
                      </td>
                      <td className={`${tableCls.td} text-right tabular-nums`}>{b.rejected_count}</td>
                      <td className={`${tableCls.td} text-right`}>
                        <Link
                          href={`/admin/importations/${b.id}`}
                          aria-label="Ouvrir le lot"
                          className="text-muted hover:text-brand inline-flex"
                        >
                          <ChevronRight className="size-5" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader
              title="Synchronisations"
              action={
                canManage ? (
                  <Link
                    href="/admin/importations/nouvelle#synchronisation"
                    className="text-brand text-sm font-semibold"
                  >
                    Programmer
                  </Link>
                ) : undefined
              }
            />
            {schedules.length === 0 ? (
              <EmptyState
                icon={CalendarClock}
                title="Aucune synchronisation"
                text="Une synchronisation relance périodiquement une recherche OSM (au plus une fois par semaine) ; chaque exécution produit un lot à contrôler."
              />
            ) : (
              <ul className="divide-line divide-y">
                {schedules.map((s) => {
                  const due = s.is_active && new Date(s.next_run_at).getTime() <= now;
                  return (
                    <li key={s.id} className="space-y-2 px-5 py-4 text-sm">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-semibold">{s.zone?.name ?? "Zone supprimée"}</p>
                          <p className="text-muted text-xs">
                            {s.category_slugs.length} catégorie{s.category_slugs.length > 1 ? "s" : ""} · tous
                            les {Math.round(s.interval_hours / 24)} j ·{" "}
                            {s.publication_mode === "review" ? "validation requise" : "publication directe"}
                          </p>
                          <p className="text-muted text-xs">
                            {s.is_active ? `Prochaine échéance : ${dateTime(s.next_run_at)}` : "Désactivée"}
                          </p>
                        </div>
                        {due && (
                          <span className="bg-warning/12 text-warning rounded-full px-2 py-0.5 text-xs font-semibold">
                            Due
                          </span>
                        )}
                      </div>
                      {canManage && (
                        <div className="flex flex-wrap gap-2">
                          {due && (
                            <DecisionButtons
                              action={runSchedule}
                              hidden={{ id: s.id }}
                              compact
                              choices={[{ value: "run", label: "Lancer maintenant", tone: "primary" }]}
                            />
                          )}
                          <DecisionButtons
                            action={toggleSchedule}
                            hidden={{ id: s.id }}
                            compact
                            choices={[
                              s.is_active
                                ? { value: "off", label: "Désactiver", tone: "neutral" }
                                : { value: "on", label: "Activer", tone: "neutral" },
                            ]}
                          />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          <Card>
            <CardHeader
              title="Sources et licences"
              action={
                <Link
                  href="/sources"
                  className="text-brand inline-flex items-center gap-1 text-sm font-semibold"
                >
                  Page publique <ArrowUpRight className="size-3.5" aria-hidden="true" />
                </Link>
              }
            />
            <ul className="divide-line divide-y">
              {sources.map((s) => (
                <li key={s.key} className="px-5 py-3.5 text-sm">
                  <div className="flex items-center justify-between gap-2">
                    <p className="font-semibold">{s.name}</p>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                        s.is_active ? "bg-success/12 text-success" : "bg-surface-2 text-muted"
                      }`}
                    >
                      {s.is_active ? "Active" : "Prévue"}
                    </span>
                  </div>
                  <p className="text-muted text-xs">
                    {s.license}
                    {s.share_alike ? " · partage à l'identique" : ""}
                    {s.api_url ? ` · 1 requête / ${s.min_request_interval_seconds} s max` : ""}
                  </p>
                  {s.notes && <p className="text-muted mt-1 text-xs">{s.notes}</p>}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
