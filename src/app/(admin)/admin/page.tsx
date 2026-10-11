import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  ClipboardCheck,
  Eye,
  Flag,
  Image as ImageIcon,
  MapPinned,
  MessageSquareText,
  Navigation,
  Phone,
  ShoppingBag,
  Store,
  Users,
} from "lucide-react";
import { ActivityChart, BarList } from "@/components/admin/activity-chart";
import { Card, CardHeader, EmptyState, PageHeader, StatCard, relativeTime } from "@/components/admin/ui";
import { requireAdmin } from "@/features/admin/access";
import { getDashboard } from "@/features/admin/queries";

export const metadata = { title: "Tableau de bord" };

const ACTIONS: Record<string, string> = {
  "submission.reviewed": "Fiche examinée",
  "claim.reviewed": "Réclamation examinée",
  "place.status_changed": "Statut de fiche modifié",
  "place.owner_granted": "Propriétaire attribué",
  "place.verified": "Fiche vérifiée",
  "places.imported": "Import de lieux",
  "role.granted": "Rôle attribué",
  "role.revoked": "Rôle retiré",
  "user.status_changed": "Statut de compte modifié",
  "report.handled": "Signalement traité",
  "review.moderated": "Avis modéré",
  "media.moderated": "Photo modérée",
  "setting.changed": "Paramètre modifié",
};

export default async function AdminDashboard() {
  const ctx = await requireAdmin("/admin");
  const d = await getDashboard(30);
  if (!d) {
    return (
      <>
        <PageHeader title="Tableau de bord" />
        <Card>
          <EmptyState
            title="Statistiques indisponibles"
            text="Votre rôle ne donne pas accès aux statistiques globales."
          />
        </Card>
      </>
    );
  }
  const queue = [
    {
      label: "Fiches à valider",
      value: d.queue.submissions,
      href: "/admin/moderation",
      icon: ClipboardCheck,
      perm: "submissions.review",
    },
    {
      label: "Réclamations",
      value: d.queue.claims,
      href: "/admin/moderation?onglet=reclamations",
      icon: Store,
      perm: "claims.review",
    },
    {
      label: "Signalements ouverts",
      value: d.queue.reports,
      href: "/admin/signalements",
      icon: Flag,
      perm: "reports.handle",
    },
    {
      label: "Avis en attente",
      value: d.queue.reviews,
      href: "/admin/avis",
      icon: MessageSquareText,
      perm: "reviews.moderate",
    },
    {
      label: "Photos à modérer",
      value: d.queue.media,
      href: "/admin/medias",
      icon: ImageIcon,
      perm: "media.moderate",
    },
  ].filter((q) => ctx.can(q.perm));
  const pending = queue.reduce((s, q) => s + q.value, 0);
  const pct = (n: number) => (d.places.published ? Math.round((n / d.places.published) * 100) : 0);

  return (
    <>
      <PageHeader
        title={`Bonjour${ctx.name ? `, ${ctx.name.split(" ")[0]}` : ""}`}
        description={
          pending > 0
            ? `${pending} élément${pending > 1 ? "s" : ""} attend${pending > 1 ? "ent" : ""} votre décision. Voici l'activité des 30 derniers jours.`
            : "Aucune file d'attente : tout est à jour. Voici l'activité des 30 derniers jours."
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={0}
          label="Lieux publiés"
          value={d.places.published}
          hint={`${d.imported} importés d'OpenStreetMap`}
          icon={MapPinned}
          href="/admin/lieux"
        />
        <StatCard
          index={1}
          label="Fiches vérifiées"
          value={`${pct(d.places.verified)} %`}
          hint={`${d.places.verified} sur ${d.places.published}`}
          icon={BadgeCheck}
          tone="success"
          href="/admin/lieux?verification=non-verifie"
        />
        <StatCard
          index={2}
          label="Gérées par l'établissement"
          value={d.places.claimed}
          hint={`${d.catalog_items} article(s) de catalogue`}
          icon={Store}
          tone="violet"
        />
        <StatCard
          index={3}
          label="Utilisateurs"
          value={d.users.total}
          hint={`+${d.users.new_period} en 30 jours · ${d.users.owners} propriétaire(s)`}
          icon={Users}
          tone="cyan"
          href={ctx.can("users.read") ? "/admin/utilisateurs" : undefined}
        />
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <Card>
          <CardHeader title="Consultations des fiches — 30 jours" />
          <div className="p-5">
            <div className="mb-4 grid grid-cols-3 gap-3 text-sm">
              {[
                { label: "Consultations", value: d.totals.views, Icon: Eye },
                { label: "Appels et WhatsApp", value: d.totals.contacts, Icon: Phone },
                { label: "Itinéraires", value: d.totals.directions, Icon: Navigation },
              ].map(({ label, value, Icon }) => (
                <div key={label} className="bg-surface-2 rounded-xl p-3">
                  <p className="text-muted flex items-center gap-1.5 text-xs">
                    <Icon className="size-3.5" aria-hidden="true" /> {label}
                  </p>
                  <p className="mt-1 text-xl font-extrabold tabular-nums">{value.toLocaleString("fr-FR")}</p>
                </div>
              ))}
            </div>
            <ActivityChart
              label="Consultations"
              data={d.series.map((s) => ({ day: s.day, value: s.views }))}
            />
          </div>
        </Card>

        <Card>
          <CardHeader title="À traiter" />
          <ul className="divide-line divide-y">
            {queue.map(({ label, value, href, icon: Icon }) => (
              <li key={label}>
                <Link
                  href={href}
                  className="hover:bg-surface-2 flex items-center gap-3 px-5 py-3.5 transition-colors"
                >
                  <span
                    className={`flex size-9 items-center justify-center rounded-xl ${value ? "bg-warning/12 text-warning" : "bg-surface-2 text-muted"}`}
                  >
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </span>
                  <span className="flex-1 text-sm font-medium">{label}</span>
                  <span className={`text-lg font-extrabold tabular-nums ${value ? "" : "text-muted"}`}>
                    {value}
                  </span>
                  <ArrowRight className="text-muted size-4" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader
            title="Catégories les plus fournies"
            action={
              <Link href="/admin/categories" className="text-brand text-sm font-semibold">
                Tout voir
              </Link>
            }
          />
          <div className="p-5">
            <BarList items={d.top_categories.map((c) => ({ label: c.name, value: Number(c.count) }))} />
          </div>
        </Card>
        <Card>
          <CardHeader title="Fiches les plus consultées" />
          {d.top_places.length === 0 ? (
            <EmptyState title="Pas encore de consultations" />
          ) : (
            <ol className="divide-line divide-y">
              {d.top_places.map((p, i) => (
                <li key={p.id}>
                  <Link
                    href={`/admin/lieux/${p.id}`}
                    className="hover:bg-surface-2 flex items-center gap-3 px-5 py-3 text-sm transition-colors"
                  >
                    <span className="bg-surface-2 text-muted flex size-7 items-center justify-center rounded-lg text-xs font-bold">
                      {i + 1}
                    </span>
                    <span className="flex-1 truncate font-medium">{p.name}</span>
                    <span className="text-muted tabular-nums">
                      {Number(p.views).toLocaleString("fr-FR")} vues
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </Card>
        <Card>
          <CardHeader
            title="Activité récente"
            action={
              ctx.can("audit.read") ? (
                <Link href="/admin/journal" className="text-brand text-sm font-semibold">
                  Journal
                </Link>
              ) : undefined
            }
          />
          {d.recent_activity.length === 0 ? (
            <EmptyState title="Aucune activité" />
          ) : (
            <ul className="space-y-0 px-5 py-2">
              {d.recent_activity.map((a, i) => (
                <li key={`${a.created_at}-${i}`} className="relative flex gap-3 py-2.5 text-sm">
                  <span className="bg-brand mt-1.5 size-2 shrink-0 rounded-full" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium">{ACTIONS[a.action] ?? a.action}</span>
                    <span className="text-muted text-xs">
                      {a.actor ?? "Système"} · {relativeTime(a.created_at)}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <p className="text-muted mt-6 flex items-center gap-1.5 text-xs">
        <ShoppingBag className="size-3.5" aria-hidden="true" /> Données réelles de la base (événements
        dédupliqués, fuseau Africa/Lubumbashi).
      </p>
    </>
  );
}
