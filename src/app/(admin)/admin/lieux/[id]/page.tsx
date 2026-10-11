import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, History } from "lucide-react";
import { DecisionButtons } from "@/components/admin/action-form";
import { Card, CardHeader, PageHeader, StatusBadge, relativeTime } from "@/components/admin/ui";
import { LogoCover } from "@/components/places/place-visual";
import { requirePermission } from "@/features/admin/access";
import { adminSetPlaceStatus, adminVerifyPlace } from "@/features/admin/actions";
import { getAdminPlace, getGeoOptions } from "@/features/admin/queries";
import { placeMediaUrl } from "@/lib/supabase/storage";
import { PlaceEditForm } from "./place-edit-form";

export const metadata = { title: "Fiche lieu" };

const FIELD_LABEL: Record<string, string> = {
  name: "nom",
  publication_status: "statut",
  verification_status: "vérification",
  ownership_status: "gestion",
  logo_path: "logo",
  short_description: "présentation",
  full_description: "description",
  address_text: "adresse",
  landmark_description: "repère",
  latitude: "position",
  longitude: "position",
  primary_category_id: "catégorie",
  administrative_unit_id: "rattachement",
  activity_status: "activité",
};

export default async function AdminPlacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ctx = await requirePermission("places.read_all", `/admin/lieux/${id}`);
  const [data, options] = await Promise.all([getAdminPlace(id), getGeoOptions()]);
  if (!data) notFound();
  const { place: p, history, names } = data;
  const logo = placeMediaUrl(p.logo_path);
  const phone = p.place_contacts.find((c) => c.kind === "phone")?.value;

  const statusChoices = [
    p.publication_status !== "published" && {
      value: "published",
      label: "Publier",
      tone: "primary" as const,
    },
    p.publication_status === "published" && {
      value: "suspended",
      label: "Suspendre",
      tone: "danger" as const,
      needsReason: true,
    },
    p.publication_status !== "archived" &&
      ctx.can("places.archive") && {
        value: "archived",
        label: "Archiver",
        tone: "neutral" as const,
        needsReason: true,
      },
  ].filter(Boolean) as {
    value: string;
    label: string;
    tone: "primary" | "danger" | "neutral";
    needsReason?: boolean;
  }[];

  return (
    <>
      <Link
        href="/admin/lieux"
        className="text-muted hover:text-ink mb-3 inline-flex items-center gap-1 text-sm"
      >
        <ArrowLeft className="size-4" /> Tous les lieux
      </Link>
      <PageHeader
        title={p.name}
        description={`Créée ${relativeTime(p.created_at)} · modifiée ${relativeTime(p.updated_at)}`}
        actions={
          p.publication_status === "published" && (
            <Link
              href={`/lieux/${p.slug}`}
              target="_blank"
              className="border-line bg-surface hover:bg-surface-2 inline-flex h-10 items-center gap-1.5 rounded-xl border px-4 text-sm font-semibold"
            >
              Fiche publique <ExternalLink className="size-4" />
            </Link>
          )
        }
      />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          {logo && (
            <div className="relative h-36 overflow-hidden rounded-t-[var(--radius-card)]">
              <LogoCover logo={logo} name={p.name} size="sm" />
            </div>
          )}
          <PlaceEditForm place={p} options={options} canEdit={ctx.can("places.edit_any")} />
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader title="Publication" />
            <div className="space-y-4 p-5">
              <div className="flex flex-wrap gap-2">
                <StatusBadge status={p.publication_status} />
                <StatusBadge status={p.verification_status} />
                {p.ownership_status !== "unclaimed" && <StatusBadge status={p.ownership_status} />}
              </div>
              {p.rejection_reason && p.publication_status !== "published" && (
                <p className="bg-danger/8 text-danger rounded-xl p-3 text-sm">Motif : {p.rejection_reason}</p>
              )}
              {ctx.can("places.publish") && statusChoices.length > 0 && (
                <DecisionButtons
                  action={adminSetPlaceStatus}
                  hidden={{ id: p.id }}
                  field="status"
                  reasonName="reason"
                  reasonPlaceholder="Motif (obligatoire, visible dans le journal)"
                  choices={statusChoices}
                />
              )}
              {ctx.can("places.publish") && p.verification_status !== "admin_verified" && (
                <div className="border-line border-t pt-4">
                  <p className="text-muted mb-2 text-sm">
                    Informations confirmées par l&apos;équipe (appel, visite, document) ?
                  </p>
                  <DecisionButtons
                    action={adminVerifyPlace}
                    hidden={{ id: p.id }}
                    choices={[
                      {
                        value: "verify",
                        label: "Marquer comme vérifiée",
                        tone: "primary",
                        needsReason: true,
                      },
                    ]}
                    reasonPlaceholder="Comment avez-vous vérifié ? (ex. appel au +243…)"
                  />
                </div>
              )}
            </div>
          </Card>

          <Card>
            <CardHeader title="Informations" />
            <dl className="divide-line divide-y text-sm">
              {[
                ["Téléphone", phone ?? "—"],
                [
                  "Source",
                  p.place_external_refs.length
                    ? `OpenStreetMap (${p.place_external_refs[0]?.external_id})`
                    : "Saisie sur Boyoma Connect",
                ],
                [
                  "Gérée par",
                  p.place_owners.length
                    ? p.place_owners
                        .map(
                          (o) =>
                            `${names.get(o.user_id) ?? "Utilisateur"} (${o.role === "owner" ? "propriétaire" : "gérant"})`,
                        )
                        .join(", ")
                    : "Personne",
                ],
                [
                  "Photos",
                  `${p.place_media.length} (${p.place_media.filter((m) => m.moderation_status === "pending").length} en attente)`,
                ],
                ["Catalogue", `${p.catalog_items.length} article(s)`],
                ["Dernière vérification", p.last_verified_at ? relativeTime(p.last_verified_at) : "Jamais"],
              ].map(([k, v]) => (
                <div key={k} className="flex gap-3 px-5 py-3">
                  <dt className="text-muted w-32 shrink-0">{k}</dt>
                  <dd className="min-w-0 font-medium break-words">{v}</dd>
                </div>
              ))}
            </dl>
          </Card>

          <Card>
            <CardHeader title="Historique" />
            {history.length === 0 ? (
              <p className="text-muted p-5 text-sm">Aucune modification enregistrée.</p>
            ) : (
              <ol className="px-5 py-3">
                {history.map((h) => (
                  <li key={h.id} className="relative flex gap-3 pb-4 last:pb-0">
                    <span className="bg-surface-2 text-muted flex size-7 shrink-0 items-center justify-center rounded-full">
                      <History className="size-3.5" />
                    </span>
                    <div className="min-w-0 text-sm">
                      <p className="font-medium">
                        {h.operation === "insert"
                          ? "Création"
                          : `Modification : ${[...new Set(Object.keys(h.changes).map((k) => FIELD_LABEL[k] ?? k))].slice(0, 4).join(", ")}`}
                      </p>
                      <p className="text-muted text-xs">
                        {h.actor_id ? (names.get(h.actor_id) ?? "Utilisateur") : "Système"} ·{" "}
                        {relativeTime(h.created_at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
