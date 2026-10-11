import Image from "next/image";
import Link from "next/link";
import { Image as ImageIcon } from "lucide-react";
import { DecisionButtons } from "@/components/admin/action-form";
import { Card, EmptyState, PageHeader, Pagination, Tabs, relativeTime } from "@/components/admin/ui";
import { requirePermission } from "@/features/admin/access";
import { adminModerateMedia } from "@/features/admin/actions";
import { listMedia } from "@/features/admin/queries";
import { placeMediaUrl } from "@/lib/supabase/storage";

export const metadata = { title: "Photos" };

export default async function MediaAdmin({
  searchParams,
}: {
  searchParams: Promise<{ statut?: string; page?: string }>;
}) {
  await requirePermission("media.moderate", "/admin/medias");
  const sp = await searchParams;
  const status = ["approved", "rejected"].includes(sp.statut ?? "") ? sp.statut! : "pending";
  const page = Math.max(1, Number(sp.page) || 1);
  const { rows, total } = await listMedia(status, page);

  return (
    <>
      <PageHeader
        title="Photos"
        description="Photos envoyées hors fiche validée (collecte, contributions). Les photos des propriétaires validés sont publiées directement mais peuvent être retirées ici."
      />
      <Tabs
        active={status}
        tabs={[
          { value: "pending", label: "À modérer", href: "/admin/medias" },
          { value: "approved", label: "Approuvées", href: "/admin/medias?statut=approved" },
          { value: "rejected", label: "Refusées", href: "/admin/medias?statut=rejected" },
        ]}
      />
      {rows.length === 0 ? (
        <Card>
          <EmptyState icon={ImageIcon} title="Aucune photo dans cette liste" />
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {rows.map((m) => (
            <Card key={m.id} className="overflow-hidden">
              <a
                href={placeMediaUrl(m.storage_path)!}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-surface-2 relative block aspect-[4/3]"
              >
                <Image
                  src={placeMediaUrl(m.storage_path)!}
                  alt={`Photo de ${m.place?.name ?? "lieu"}`}
                  fill
                  sizes="300px"
                  className="object-cover"
                />
              </a>
              <div className="space-y-3 p-4">
                <div className="text-sm">
                  {m.place ? (
                    <Link href={`/admin/lieux/${m.place.id}`} className="hover:text-brand font-semibold">
                      {m.place.name}
                    </Link>
                  ) : (
                    <span className="text-muted">Lieu inconnu</span>
                  )}
                  <p className="text-muted text-xs">{relativeTime(m.created_at)}</p>
                </div>
                <DecisionButtons
                  compact
                  action={adminModerateMedia}
                  hidden={{ id: m.id }}
                  choices={[
                    status !== "approved" && {
                      value: "approved",
                      label: "Approuver",
                      tone: "primary" as const,
                    },
                    status !== "rejected" && {
                      value: "rejected",
                      label: "Refuser",
                      tone: "danger" as const,
                      needsReason: true,
                    },
                  ].filter((c): c is Exclude<typeof c, false> => Boolean(c))}
                />
              </div>
            </Card>
          ))}
        </div>
      )}
      {total > 24 && (
        <Card className="mt-4">
          <Pagination
            page={page}
            total={total}
            pageSize={24}
            href={(p) => `/admin/medias?statut=${status}&page=${p}`}
          />
        </Card>
      )}
    </>
  );
}
