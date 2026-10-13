import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  Check,
  Eye,
  Heart,
  Inbox,
  MapPinned,
  MessageCircle,
  Phone,
  Share2,
} from "lucide-react";
import {
  completeness,
  getConsolePlace,
  getInquiries,
  getPlaceStats,
  type StatKey,
} from "@/features/owner/business";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Empty, Panel, dateTime } from "./ui";
import { ViewsChart } from "./views-chart";

type Props = { params: Promise<{ id: string }>; searchParams: Promise<{ p?: string }> };

const KPIS: { key: StatKey; label: string; icon: typeof Eye }[] = [
  { key: "views", label: "Vues de la fiche", icon: Eye },
  { key: "calls", label: "Appels", icon: Phone },
  { key: "whatsapp", label: "WhatsApp", icon: MessageCircle },
  { key: "directions", label: "Itinéraires", icon: MapPinned },
  { key: "shares", label: "Partages", icon: Share2 },
  { key: "favorites", label: "Favoris", icon: Heart },
];

/** Tableau de bord : performance, complétude, statut du jour et dernières demandes. */
export default async function ConsoleDashboard({ params, searchParams }: Props) {
  const { id } = await params;
  const place = await getConsolePlace(id);
  if (!place) notFound();
  const requested = Number((await searchParams).p);
  const days = requested === 7 || requested === 90 ? requested : 30;
  const supabase = await createSupabaseServerClient();
  const [{ stats, error }, inquiries, openNow] = await Promise.all([
    getPlaceStats(place.id, days),
    getInquiries(place.id),
    supabase.rpc("is_place_open_at", { p_place_id: place.id }).then((r) => r.data as boolean | null),
  ]);
  const { score, steps } = completeness(place);
  const base = `/espace-pro/lieux/${place.id}`;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Africa/Lubumbashi" }).format(new Date());
  const closedToday = place.place_special_hours.some((s) => s.date === today && s.is_closed);
  const newCount = inquiries.filter((i) => i.status === "new").length;

  return (
    <div className="space-y-5">
      {/* Statut du jour */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatusTile
          href={`${base}/horaires`}
          label="Aujourd'hui"
          value={
            closedToday
              ? "Fermé aujourd'hui"
              : openNow === null
                ? "Horaires non renseignés"
                : openNow
                  ? "Ouvert maintenant"
                  : "Fermé maintenant"
          }
          tone={closedToday || openNow === false ? "warn" : openNow ? "good" : "muted"}
        />
        <StatusTile
          href={`${base}/demandes`}
          label="Demandes à traiter"
          value={newCount ? `${newCount} nouvelle${newCount > 1 ? "s" : ""}` : "Aucune en attente"}
          tone={newCount ? "brand" : "muted"}
        />
        <StatusTile
          href={`${base}/avis`}
          label="Avis"
          value={
            stats?.reviews.count
              ? `${Number(stats.reviews.average ?? 0).toFixed(1)} ★ · ${stats.reviews.count} avis`
              : "Aucun avis publié"
          }
          tone="muted"
        />
      </div>

      {/* Performance */}
      <Panel
        title="Performance"
        description="Actions des visiteurs sur votre fiche (comptage anonyme, sans données personnelles)."
        action={
          <div className="bg-surface-2 flex rounded-xl p-1 text-sm" role="group" aria-label="Période">
            {[7, 30, 90].map((d) => (
              <Link
                key={d}
                href={d === 30 ? base : `${base}?p=${d}`}
                scroll={false}
                aria-current={d === days ? "true" : undefined}
                className={`rounded-lg px-3 py-1.5 font-semibold ${d === days ? "bg-surface shadow-sm" : "text-muted"}`}
              >
                {d} j
              </Link>
            ))}
          </div>
        }
      >
        {!stats ? (
          <div className="border-line bg-surface-2 rounded-2xl border border-dashed p-4 text-sm">
            <p>{error}</p>
            {days === 90 && (
              <Link href={`${base}/abonnement`} className="text-brand mt-1 inline-block font-semibold">
                Voir les plans
              </Link>
            )}
          </div>
        ) : (
          <>
            <dl className="grid grid-cols-2 gap-3 md:grid-cols-3">
              {KPIS.map(({ key, label, icon: Icon }) => (
                <Kpi
                  key={key}
                  label={label}
                  icon={<Icon className="size-4" aria-hidden="true" />}
                  value={Number(stats.totals[key] ?? 0)}
                  previous={Number(stats.previous[key] ?? 0)}
                />
              ))}
            </dl>
            <div>
              <h3 className="mb-2 text-sm font-semibold">Vues par jour</h3>
              <ViewsChart series={stats.series} />
            </div>
            {stats.top_items.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-semibold">Articles les plus consultés</h3>
                <ol className="divide-line divide-y text-sm">
                  {stats.top_items.map((it, i) => (
                    <li key={it.id} className="flex items-center gap-3 py-2">
                      <span className="text-muted w-4 tabular-nums">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate">{it.name}</span>
                      <span className="text-muted tabular-nums">
                        {it.views} vue{it.views > 1 ? "s" : ""} · {it.contacts} contact
                        {it.contacts > 1 ? "s" : ""}
                      </span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </>
        )}
      </Panel>

      <div className="grid gap-5 lg:grid-cols-2">
        {/* Complétude */}
        <Panel
          title="Qualité de la fiche"
          description="Une fiche complète inspire confiance et reçoit plus de contacts."
        >
          <div className="flex items-center gap-4">
            <Ring score={score} />
            <p className="text-sm">
              {score === 100
                ? "Bravo, votre fiche est complète."
                : `Encore ${steps.filter((s) => !s.done).length} étape${steps.filter((s) => !s.done).length > 1 ? "s" : ""} pour une fiche complète.`}
            </p>
          </div>
          <ul className="space-y-1">
            {steps.map((s) => (
              <li key={s.key}>
                <Link
                  href={s.href}
                  className="hover:bg-surface-2 flex items-center gap-3 rounded-xl px-2 py-2 text-sm"
                >
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full ${
                      s.done ? "bg-success text-white" : "border-line border-2"
                    }`}
                  >
                    {s.done && <Check className="size-3.5" aria-hidden="true" />}
                  </span>
                  <span className={`flex-1 ${s.done ? "text-muted line-through" : "font-medium"}`}>
                    {s.label}
                  </span>
                  <span className="text-muted text-xs tabular-nums">+{s.weight}</span>
                  <span className="sr-only">{s.done ? "fait" : "à faire"}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Panel>

        {/* Dernières demandes */}
        <Panel
          title="Dernières demandes"
          action={
            <Link
              href={`${base}/demandes`}
              className="text-brand inline-flex items-center gap-1 text-sm font-semibold"
            >
              Tout voir <ArrowRight className="size-4" aria-hidden="true" />
            </Link>
          }
        >
          {inquiries.length === 0 ? (
            <Empty icon={<Inbox className="size-6" aria-hidden="true" />}>
              Les messages envoyés depuis votre fiche ou votre catalogue apparaîtront ici.
            </Empty>
          ) : (
            <ul className="divide-line divide-y">
              {inquiries.slice(0, 4).map((q) => (
                <li key={q.id}>
                  <Link href={`${base}/demandes#demande-${q.id}`} className="flex items-start gap-3 py-2.5">
                    {q.status === "new" && (
                      <span className="bg-brand mt-1.5 size-2 shrink-0 rounded-full" aria-label="Nouvelle" />
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {q.sender_name}
                        {q.item && <span className="text-muted font-normal"> · {q.item.name}</span>}
                      </p>
                      <p className="text-muted line-clamp-1 text-sm">{q.message}</p>
                    </div>
                    <span className="text-muted shrink-0 text-xs">{dateTime(q.created_at)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function Kpi({
  label,
  icon,
  value,
  previous,
}: {
  label: string;
  icon: React.ReactNode;
  value: number;
  previous: number;
}) {
  const diff = previous > 0 ? Math.round(((value - previous) / previous) * 100) : null;
  return (
    <div className="bg-surface-2 rounded-2xl p-3">
      <dt className="text-muted flex items-center gap-1.5 text-xs font-medium">
        {icon} {label}
      </dt>
      <dd className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-extrabold tabular-nums">{value.toLocaleString("fr-FR")}</span>
        {diff !== null && diff !== 0 && (
          <span
            className={`inline-flex items-center text-xs font-semibold ${diff > 0 ? "text-success" : "text-muted"}`}
            title="Par rapport à la période précédente"
          >
            {diff > 0 ? (
              <ArrowUpRight className="size-3.5" aria-hidden="true" />
            ) : (
              <ArrowDownRight className="size-3.5" aria-hidden="true" />
            )}
            {Math.abs(diff)} %<span className="sr-only"> par rapport à la période précédente</span>
          </span>
        )}
      </dd>
    </div>
  );
}

function StatusTile({
  href,
  label,
  value,
  tone,
}: {
  href: string;
  label: string;
  value: string;
  tone: "good" | "warn" | "brand" | "muted";
}) {
  const dot = { good: "bg-success", warn: "bg-warning", brand: "bg-brand", muted: "bg-line" }[tone];
  return (
    <Link
      href={href}
      className="border-line bg-surface hover:bg-surface-2 rounded-[var(--radius-card)] border p-4 shadow-[var(--shadow-card)]"
    >
      <p className="text-muted text-xs font-medium">{label}</p>
      <p className="mt-1 flex items-center gap-2 font-bold">
        <span className={`size-2.5 shrink-0 rounded-full ${dot}`} aria-hidden="true" />
        {value}
      </p>
    </Link>
  );
}

function Ring({ score }: { score: number }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative size-16 shrink-0" role="img" aria-label={`Fiche complète à ${score} %`}>
      <svg viewBox="0 0 64 64" className="size-16 -rotate-90">
        <circle cx="32" cy="32" r={r} className="stroke-surface-2" strokeWidth="7" fill="none" />
        <circle
          cx="32"
          cy="32"
          r={r}
          className={score === 100 ? "stroke-success" : "stroke-brand"}
          strokeWidth="7"
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${(score / 100) * c} ${c}`}
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-sm font-extrabold tabular-nums">
        {score}%
      </span>
    </div>
  );
}
