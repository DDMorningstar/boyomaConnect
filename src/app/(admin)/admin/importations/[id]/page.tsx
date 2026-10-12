import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, ExternalLink, FileWarning, ImageIcon, Inbox, MapPin } from "lucide-react";
import { Card, CardHeader, EmptyState, PageHeader, Pagination, Tabs, tableCls } from "@/components/admin/ui";
import { DecisionButtons } from "@/components/admin/action-form";
import {
  BatchStatusBadge,
  ITEM_STATUS,
  IssueChips,
  ItemStatusBadge,
  ORIGIN,
  dateTime,
} from "@/components/admin/imports-ui";
import { requirePermission } from "@/features/admin/access";
import { cancelBatch, reanalyzeBatch } from "@/features/imports/actions";
import { ITEMS_PAGE_SIZE, getBatch, getImportFormOptions, listItems } from "@/features/imports/queries";
import { CommitPanel, ItemDecision } from "./batch-controls";

export const metadata = { title: "Lot d'importation" };

const ORDER = [
  "ready",
  "existing",
  "quarantined",
  "duplicate",
  "rejected",
  "imported",
  "updated",
  "skipped",
] as const;
const MATCH: Record<string, string> = {
  source_id: "même identifiant source",
  proximity_name: "à moins de 150 m, nom proche",
  same_name_unit: "même nom dans la même zone",
  batch: "répété dans ce lot",
};

export default async function BatchPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ statut?: string; page?: string }>;
}) {
  const { id } = await params;
  const ctx = await requirePermission("imports.view", `/admin/importations/${id}`);
  const canManage = ctx.can("imports.manage");
  const sp = await searchParams;
  const data = await getBatch(id);
  if (!data) notFound();
  const { batch, counts } = data;
  const status = ORDER.includes(sp.statut as (typeof ORDER)[number]) ? sp.statut : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const [{ rows, total, error }, options] = await Promise.all([
    listItems(batch.id, status, page),
    canManage ? getImportFormOptions() : Promise.resolve({ groups: [], zones: [] }),
  ]);
  const categories = options.groups.flatMap((g) =>
    g.children.map((c) => ({ id: c.id, name: c.name, group: g.name })),
  );
  const editable = canManage && (batch.status === "ready" || batch.status === "failed");
  const toCommit = (counts.ready ?? 0) + (counts.existing ?? 0);
  const base = `/admin/importations/${batch.id}`;
  const href = (p: number) =>
    `${base}?${new URLSearchParams({ ...(status ? { statut: status } : {}), page: String(p) })}`;

  return (
    <>
      <Link
        href="/admin/importations"
        className="text-muted hover:text-ink mb-3 inline-flex items-center gap-1 text-sm"
      >
        <ChevronLeft className="size-4" aria-hidden="true" /> Importations
      </Link>
      <PageHeader
        title={`${ORIGIN[batch.origin]} · ${batch.source?.name ?? batch.source_key}`}
        description={[
          batch.zone ? `Zone : ${batch.zone.name}` : "Sans zone de contrôle",
          batch.file_name,
          `créé le ${dateTime(batch.created_at)}`,
        ]
          .filter(Boolean)
          .join(" · ")}
        actions={<BatchStatusBadge status={batch.status} />}
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 space-y-6">
          <Card>
            <CardHeader title="Prévisualisation des lieux" />
            <div className="px-5 pt-4">
              <Tabs
                active={status ?? "all"}
                tabs={[
                  { value: "all", label: "Tous", count: batch.total_count, href: base },
                  ...ORDER.filter((s) => counts[s]).map((s) => ({
                    value: s,
                    label: ITEM_STATUS[s]!.label,
                    count: counts[s],
                    href: `${base}?statut=${s}`,
                  })),
                ]}
              />
            </div>
            {error ? (
              <EmptyState title="Chargement impossible" text={error} icon={FileWarning} />
            ) : rows.length === 0 ? (
              <EmptyState icon={Inbox} title="Aucun élément" text="Aucun lieu dans ce filtre." />
            ) : (
              <div className={tableCls.wrap}>
                <table className={`${tableCls.table} min-w-[960px]`}>
                  <thead>
                    <tr>
                      <th className={tableCls.th}>Lieu</th>
                      <th className={tableCls.th}>Catégorie</th>
                      <th className={tableCls.th}>Position</th>
                      <th className={tableCls.th}>Contrôle</th>
                      {editable && <th className={tableCls.th}>Décision</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((it) => (
                      <tr key={it.id} className={`${tableCls.tr} align-top`}>
                        <td className={`${tableCls.td} align-top`}>
                          <p className="font-semibold">
                            {it.name ?? <span className="text-muted italic">Sans nom</span>}
                          </p>
                          <p className="text-muted text-xs">
                            #{it.row_index + 1}
                            {it.external_id ? ` · ${it.external_id}` : ""}
                          </p>
                          {(it.address || it.phones.length > 0 || it.website || it.email) && (
                            <p className="text-muted mt-1 text-xs">
                              {[it.address, ...it.phones, it.website, it.email].filter(Boolean).join(" · ")}
                            </p>
                          )}
                          {it.opening_hours && (
                            <p className="text-muted text-xs">Horaires : {it.opening_hours}</p>
                          )}
                          {it.image_url && (
                            <a
                              href={it.image_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-brand inline-flex items-center gap-1 text-xs"
                            >
                              <ImageIcon className="size-3" aria-hidden="true" /> Image citée par la source
                            </a>
                          )}
                        </td>
                        <td className={`${tableCls.td} align-top`}>
                          {it.category ? (
                            <>
                              <p className="font-medium">{it.category.name}</p>
                              <p className="text-muted text-xs">{it.mapping_rule}</p>
                            </>
                          ) : (
                            <span className="text-warning text-xs font-semibold">Non reconnue</span>
                          )}
                        </td>
                        <td className={`${tableCls.td} align-top text-xs`}>
                          {it.latitude != null && it.longitude != null ? (
                            <>
                              <a
                                href={`https://www.openstreetmap.org/?mlat=${it.latitude}&mlon=${it.longitude}#map=17/${it.latitude}/${it.longitude}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-brand inline-flex items-center gap-1 font-mono"
                              >
                                <MapPin className="size-3" aria-hidden="true" />
                                {it.latitude.toFixed(5)}, {it.longitude.toFixed(5)}
                              </a>
                              <p className="text-muted">
                                {it.geographic_precision === "exact" ? "Point exact" : "Centre d'emprise"}
                                {it.unit ? ` · ${it.unit.name}` : ""}
                              </p>
                            </>
                          ) : (
                            <span className="text-muted">Inconnue</span>
                          )}
                        </td>
                        <td className={`${tableCls.td} max-w-72 space-y-1.5 align-top`}>
                          <ItemStatusBadge status={it.status} />
                          <IssueChips issues={it.issues} />
                          {it.match && (
                            <p className="text-xs">
                              {MATCH[it.match_reason ?? ""] ?? "Correspondance"} :{" "}
                              <Link href={`/admin/lieux/${it.match.id}`} className="text-brand font-semibold">
                                {it.match.name}
                              </Link>
                              {it.match_score != null && it.match_reason !== "source_id"
                                ? ` (${Math.round(it.match_score * 100)} %)`
                                : ""}
                            </p>
                          )}
                          {it.match_reason === "batch" && <p className="text-muted text-xs">{MATCH.batch}</p>}
                          {it.place && (
                            <Link
                              href={`/admin/lieux/${it.place.id}`}
                              className="text-brand inline-flex items-center gap-1 text-xs font-semibold"
                            >
                              Fiche {it.place.publication_status === "published" ? "publiée" : "à valider"}
                              <ExternalLink className="size-3" aria-hidden="true" />
                            </Link>
                          )}
                          {it.error && <p className="text-muted text-xs">{it.error}</p>}
                          {it.decision_note && (
                            <p className="text-muted text-xs">Note : {it.decision_note}</p>
                          )}
                        </td>
                        {editable && (
                          <td className={`${tableCls.td} w-56 align-top`}>
                            {["imported", "updated"].includes(it.status) ? null : (
                              <ItemDecision
                                itemId={it.id}
                                batchId={batch.id}
                                status={it.status}
                                needsCategory={!it.category}
                                hasMatch={Boolean(it.match)}
                                categories={categories}
                              />
                            )}
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <Pagination page={page} total={total} pageSize={ITEMS_PAGE_SIZE} href={href} />
          </Card>
        </div>

        <aside className="space-y-6">
          {editable || batch.status === "importing" ? (
            <Card>
              <CardHeader title="Importer" />
              <div className="p-5">
                {canManage ? (
                  <CommitPanel
                    batchId={batch.id}
                    pending={toCommit}
                    status={batch.status}
                    mode={batch.publication_mode}
                  />
                ) : (
                  <p className="text-muted text-sm">Import réservé aux administrateurs des importations.</p>
                )}
                {batch.error && (
                  <p className="bg-danger/8 text-danger mt-3 rounded-xl p-3 text-xs">
                    Dernière erreur : {batch.error}
                  </p>
                )}
              </div>
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Journal du lot" />
            <dl className="grid grid-cols-2 gap-x-4 gap-y-3 p-5 text-sm">
              {(
                [
                  ["Lus", batch.total_count],
                  ["Créés", batch.created_count],
                  ["Actualisés", batch.updated_count],
                  ["Ignorés", batch.skipped_count],
                  ["Rejetés", batch.rejected_count],
                  ["Quarantaine", batch.quarantined_count],
                ] as const
              ).map(([label, value]) => (
                <div key={label}>
                  <dt className="text-muted text-xs">{label}</dt>
                  <dd className="text-xl font-extrabold tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            <div className="border-line text-muted space-y-1 border-t px-5 py-4 text-xs">
              <p>
                Licence : <strong className="text-ink">{batch.license}</strong>
                {batch.license_url && (
                  <>
                    {" "}
                    (
                    <a
                      href={batch.license_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline"
                    >
                      texte
                    </a>
                    )
                  </>
                )}
              </p>
              <p>Attribution : {batch.attribution}</p>
              <p>Collecte : {dateTime(batch.collected_at)}</p>
              <p>
                Publication :{" "}
                {batch.publication_mode === "review" ? "après validation" : "directe (non vérifiée)"} ·
                actualisation {batch.update_existing ? "activée" : "désactivée"}
              </p>
              {batch.started_at && <p>Import démarré : {dateTime(batch.started_at)}</p>}
              {batch.finished_at && <p>Terminé : {dateTime(batch.finished_at)}</p>}
              {batch.attempts > 1 && <p>Tentatives : {batch.attempts}</p>}
            </div>
          </Card>

          {editable && (
            <Card>
              <CardHeader title="Actions sur le lot" />
              <div className="space-y-4 p-5 text-sm">
                <div>
                  <p className="text-muted mb-2 text-xs">
                    Recalcule zones et doublons (utile après un autre import). Les décisions manuelles sont
                    conservées.
                  </p>
                  <DecisionButtons
                    action={reanalyzeBatch}
                    hidden={{ batch_id: batch.id }}
                    compact
                    choices={[{ value: "go", label: "Réanalyser", tone: "neutral" }]}
                  />
                </div>
                <div>
                  <p className="text-muted mb-2 text-xs">Abandonne le lot : aucun lieu n&apos;est créé.</p>
                  <DecisionButtons
                    action={cancelBatch}
                    hidden={{ batch_id: batch.id }}
                    compact
                    choices={[{ value: "cancel", label: "Annuler le lot", tone: "danger" }]}
                  />
                </div>
              </div>
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
