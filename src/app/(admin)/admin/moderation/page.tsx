import Image from "next/image";
import Link from "next/link";
import { ClipboardCheck, ExternalLink, Mail, MapPin, Phone, Store } from "lucide-react";
import { ReviewForm } from "@/components/admin/review-form";
import { Card, EmptyState, PageHeader, Tabs, relativeTime } from "@/components/admin/ui";
import { requireAdmin } from "@/features/admin/access";
import { getModerationQueue } from "@/features/admin/moderation";
import { formatCoordinates } from "@/lib/format";
import { placeMediaUrl } from "@/lib/supabase/storage";

export const metadata = { title: "Validations" };

const ROLE: Record<string, string> = {
  owner: "Propriétaire",
  manager: "Gérant(e)",
  employee: "Employé(e)",
  other: "Autre",
};
const CONTACT: Record<string, string> = {
  phone: "Téléphone",
  whatsapp: "WhatsApp",
  email: "E-mail",
  website: "Site",
};

type Props = { searchParams: Promise<{ onglet?: string }> };

export default async function ModerationPage({ searchParams }: Props) {
  const ctx = await requireAdmin("/admin/moderation");
  const { onglet } = await searchParams;
  const tab = onglet === "reclamations" ? "reclamations" : "fiches";
  const { submissions, claims, names } = await getModerationQueue();
  const isSuperAdmin = ctx.roles.has("super_admin");

  // Seul le super-administrateur peut valider ses propres demandes (tracé dans le journal d'audit).
  const decision = (authorId: string, form: React.ReactNode) =>
    authorId !== ctx.userId ? (
      form
    ) : isSuperAdmin ? (
      <div className="space-y-2">
        <p className="bg-warning/10 text-warning rounded-xl px-3 py-2 text-xs font-medium">
          Votre propre demande : auto-validation possible en tant que super-administrateur (tracée dans le
          journal).
        </p>
        {form}
      </div>
    ) : (
      <p className="bg-surface-2 rounded-xl p-3 text-sm">
        Votre propre demande : un autre administrateur doit la valider.
      </p>
    );

  return (
    <>
      <PageHeader
        title="Validations"
        description="Vérifiez chaque demande (appel au numéro fourni, visite si besoin) avant de publier une fiche ou d'en confier la gestion."
      />
      <Tabs
        active={tab}
        tabs={[
          {
            value: "fiches",
            label: "Nouvelles fiches",
            count: submissions.length,
            href: "/admin/moderation",
          },
          {
            value: "reclamations",
            label: "Réclamations",
            count: claims.length,
            href: "/admin/moderation?onglet=reclamations",
          },
        ]}
      />

      {tab === "fiches" ? (
        submissions.length === 0 ? (
          <Card>
            <EmptyState
              icon={ClipboardCheck}
              title="Aucune fiche en attente"
              text="Les nouvelles fiches envoyées par les propriétaires apparaîtront ici."
            />
          </Card>
        ) : (
          <div className="grid gap-5 xl:grid-cols-2">
            {submissions.map((s) => (
              <Card key={s.id} className="flex flex-col">
                <header className="flex items-start gap-3 p-5 pb-3">
                  {s.logo_path ? (
                    <Image
                      src={placeMediaUrl(s.logo_path)!}
                      alt="Logo"
                      width={52}
                      height={52}
                      className="size-13 rounded-xl object-cover"
                    />
                  ) : (
                    <span className="bg-brand/10 text-brand flex size-13 items-center justify-center rounded-xl">
                      <Store className="size-6" aria-hidden="true" />
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <h2 className="truncate text-lg font-bold">{s.name}</h2>
                    <p className="text-muted text-sm">
                      {s.category?.name ?? "Sans catégorie"} · {s.unit?.name ?? "Commune inconnue"}
                    </p>
                    <p className="text-muted text-xs">
                      Par {names.get(s.submitted_by) ?? "utilisateur"} · {relativeTime(s.created_at)}
                      {s.owner_request && " · demande propriétaire"}
                    </p>
                  </div>
                </header>
                <div className="space-y-3 px-5 pb-4 text-sm">
                  {s.short_description && <p>{s.short_description}</p>}
                  <dl className="bg-surface-2 grid gap-1.5 rounded-xl p-3">
                    {s.contacts.map((c) => (
                      <div key={`${c.kind}-${c.value}`} className="flex items-center gap-2">
                        {c.kind === "phone" ? (
                          <Phone className="text-muted size-4" />
                        ) : (
                          <Mail className="text-muted size-4" />
                        )}
                        <dt className="text-muted w-20 shrink-0">{CONTACT[c.kind] ?? c.kind}</dt>
                        <dd className="truncate font-medium">{c.value}</dd>
                      </div>
                    ))}
                    {(s.address_text || s.landmark_description) && (
                      <div className="flex items-center gap-2">
                        <MapPin className="text-muted size-4" />
                        <dt className="text-muted w-20 shrink-0">Adresse</dt>
                        <dd className="truncate">
                          {[s.address_text, s.landmark_description].filter(Boolean).join(" — ")}
                        </dd>
                      </div>
                    )}
                    {s.latitude != null && s.longitude != null && (
                      <div className="flex items-center gap-2">
                        <MapPin className="text-muted size-4" />
                        <dt className="text-muted w-20 shrink-0">GPS</dt>
                        <dd>
                          <a
                            href={`https://www.google.com/maps/search/?api=1&query=${s.latitude},${s.longitude}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-brand inline-flex items-center gap-1 font-medium"
                          >
                            {formatCoordinates(s.latitude, s.longitude)} <ExternalLink className="size-3" />
                          </a>
                          {s.gps_accuracy_m != null && (
                            <span className="text-muted"> ± {Math.round(s.gps_accuracy_m)} m</span>
                          )}
                        </dd>
                      </div>
                    )}
                  </dl>
                  {s.photo_paths.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto">
                      {s.photo_paths.map((p) => (
                        <a
                          key={p}
                          href={placeMediaUrl(p)!}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="shrink-0"
                        >
                          <Image
                            src={placeMediaUrl(p)!}
                            alt="Photo proposée"
                            width={128}
                            height={96}
                            className="h-24 w-32 rounded-xl object-cover"
                          />
                        </a>
                      ))}
                    </div>
                  )}
                </div>
                <div className="border-line mt-auto border-t p-5">
                  {decision(s.submitted_by, <ReviewForm id={s.id} kind="submission" />)}
                </div>
              </Card>
            ))}
          </div>
        )
      ) : claims.length === 0 ? (
        <Card>
          <EmptyState
            icon={Store}
            title="Aucune réclamation en attente"
            text="Les demandes « C'est mon établissement » apparaîtront ici."
          />
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-2">
          {claims.map((c) => (
            <Card key={c.id} className="flex flex-col">
              <div className="space-y-3 p-5 text-sm">
                <h2 className="text-lg font-bold">
                  {c.place ? (
                    <Link
                      href={`/lieux/${c.place.slug}`}
                      target="_blank"
                      className="hover:text-brand inline-flex items-center gap-1.5"
                    >
                      {c.place.name} <ExternalLink className="size-4" />
                    </Link>
                  ) : (
                    "Fiche"
                  )}
                </h2>
                <p className="text-muted">
                  {names.get(c.claimant_id) ?? "Utilisateur"} · {ROLE[c.claimant_role] ?? c.claimant_role} ·{" "}
                  {relativeTime(c.created_at)}
                </p>
                <dl className="bg-surface-2 grid gap-1.5 rounded-xl p-3">
                  <div className="flex gap-2">
                    <dt className="text-muted w-20">Téléphone</dt>
                    <dd className="font-medium">{c.contact_phone ?? "—"}</dd>
                  </div>
                  <div className="flex gap-2">
                    <dt className="text-muted w-20">E-mail</dt>
                    <dd className="font-medium">{c.contact_email ?? "—"}</dd>
                  </div>
                </dl>
                {c.message && <p className="border-line rounded-xl border p-3 italic">« {c.message} »</p>}
              </div>
              <div className="border-line mt-auto border-t p-5">
                {decision(c.claimant_id, <ReviewForm id={c.id} kind="claim" />)}
              </div>
            </Card>
          ))}
        </div>
      )}
    </>
  );
}
