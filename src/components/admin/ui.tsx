import Link from "next/link";
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight, Inbox, type LucideIcon } from "lucide-react";

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight md:text-[1.75rem]">{title}</h1>
        {description && <p className="text-muted mt-1 max-w-2xl text-sm">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section
      className={`border-line bg-surface rounded-[var(--radius-card)] border shadow-[var(--shadow-card)] ${className}`}
    >
      {children}
    </section>
  );
}

export function CardHeader({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="border-line flex items-center justify-between gap-3 border-b px-5 py-3.5">
      <h2 className="font-bold">{title}</h2>
      {action}
    </div>
  );
}

export function StatCard({
  label,
  value,
  hint,
  icon: Icon,
  tone = "brand",
  href,
  index = 0,
}: {
  label: string;
  value: number | string;
  hint?: string;
  icon: LucideIcon;
  tone?: "brand" | "cyan" | "success" | "warning" | "danger" | "violet";
  href?: string;
  index?: number;
}) {
  const tones = {
    brand: "bg-brand/10 text-brand",
    cyan: "bg-cyan/10 text-cyan",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning",
    danger: "bg-danger/10 text-danger",
    violet: "bg-violet-500/10 text-violet-500",
  };
  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-muted text-sm font-medium">{label}</p>
        <span className={`flex size-10 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="size-5" aria-hidden="true" />
        </span>
      </div>
      <p className="mt-2 text-3xl font-extrabold tracking-tight tabular-nums">
        {typeof value === "number" ? value.toLocaleString("fr-FR") : value}
      </p>
      {hint && <p className="text-muted mt-1 text-xs">{hint}</p>}
    </>
  );
  const cls =
    "border-line bg-surface motion-safe:animate-fade-up block rounded-[var(--radius-card)] border p-5 shadow-[var(--shadow-card)]";
  return href ? (
    <Link
      href={href}
      style={{ animationDelay: `${index * 50}ms` }}
      className={`${cls} hover:border-brand/30 transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:shadow-[var(--shadow-float)]`}
    >
      {body}
    </Link>
  ) : (
    <div style={{ animationDelay: `${index * 50}ms` }} className={cls}>
      {body}
    </div>
  );
}

const STATUS: Record<string, { label: string; cls: string }> = {
  published: { label: "Publiée", cls: "bg-success/12 text-success" },
  draft: { label: "Brouillon", cls: "bg-surface-2 text-muted" },
  pending_review: { label: "À valider", cls: "bg-warning/12 text-warning" },
  suspended: { label: "Suspendue", cls: "bg-danger/12 text-danger" },
  archived: { label: "Archivée", cls: "bg-surface-2 text-muted" },
  rejected: { label: "Refusée", cls: "bg-danger/12 text-danger" },
  unverified: { label: "Non vérifiée", cls: "bg-surface-2 text-muted" },
  community_reported: { label: "Signalée", cls: "bg-warning/12 text-warning" },
  agent_verified: { label: "Vérifiée (agent)", cls: "bg-success/12 text-success" },
  owner_verified: { label: "Vérifiée (propriétaire)", cls: "bg-success/12 text-success" },
  admin_verified: { label: "Vérifiée (équipe)", cls: "bg-success/12 text-success" },
  claimed: { label: "Gérée", cls: "bg-brand/12 text-brand" },
  claim_pending: { label: "Réclamation", cls: "bg-warning/12 text-warning" },
  open: { label: "Ouvert", cls: "bg-warning/12 text-warning" },
  resolved: { label: "Résolu", cls: "bg-success/12 text-success" },
  dismissed: { label: "Classé", cls: "bg-surface-2 text-muted" },
  pending: { label: "En attente", cls: "bg-warning/12 text-warning" },
  approved: { label: "Approuvée", cls: "bg-success/12 text-success" },
  hidden: { label: "Masqué", cls: "bg-surface-2 text-muted" },
  active: { label: "Actif", cls: "bg-success/12 text-success" },
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const s = STATUS[status] ?? { label: status, cls: "bg-surface-2 text-muted" };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${s.cls}`}
    >
      {label ?? s.label}
    </span>
  );
}

export function EmptyState({
  title,
  text,
  icon: Icon = Inbox,
}: {
  title: string;
  text?: string;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex flex-col items-center px-6 py-14 text-center">
      <span className="bg-surface-2 text-muted flex size-14 items-center justify-center rounded-2xl">
        <Icon className="size-7" aria-hidden="true" />
      </span>
      <p className="mt-4 font-semibold">{title}</p>
      {text && <p className="text-muted mt-1 max-w-sm text-sm">{text}</p>}
    </div>
  );
}

/** Onglets en liens (filtre par statut), conservant les autres paramètres. */
export function Tabs({
  tabs,
  active,
}: {
  tabs: { href: string; label: string; count?: number; value: string }[];
  active: string;
}) {
  return (
    <div className="bg-surface-2 mb-5 inline-flex flex-wrap gap-1 rounded-2xl p-1">
      {tabs.map((t) => (
        <Link
          key={t.value}
          href={t.href}
          aria-current={t.value === active ? "page" : undefined}
          className={`rounded-xl px-4 py-2 text-sm font-semibold transition-all ${
            t.value === active
              ? "bg-surface text-ink shadow-[var(--shadow-card)]"
              : "text-muted hover:text-ink"
          }`}
        >
          {t.label}
          {t.count != null && t.count > 0 && (
            <span className="bg-brand/12 text-brand ml-2 rounded-full px-1.5 text-xs">{t.count}</span>
          )}
        </Link>
      ))}
    </div>
  );
}

export function Pagination({
  page,
  total,
  pageSize,
  href,
}: {
  page: number;
  total: number;
  pageSize: number;
  href: (page: number) => string;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const btn =
    "border-line bg-surface hover:bg-surface-2 inline-flex size-9 items-center justify-center rounded-xl border text-sm";
  return (
    <nav aria-label="Pagination" className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
      <p className="text-muted">
        Page {page} sur {pages} · {total.toLocaleString("fr-FR")} élément{total > 1 ? "s" : ""}
      </p>
      <div className="flex gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className={btn} aria-label="Page précédente">
            <ChevronLeft className="size-4" />
          </Link>
        ) : (
          <span className={`${btn} opacity-40`} aria-hidden="true">
            <ChevronLeft className="size-4" />
          </span>
        )}
        {page < pages ? (
          <Link href={href(page + 1)} className={btn} aria-label="Page suivante">
            <ChevronRight className="size-4" />
          </Link>
        ) : (
          <span className={`${btn} opacity-40`} aria-hidden="true">
            <ChevronRight className="size-4" />
          </span>
        )}
      </div>
    </nav>
  );
}

export const tableCls = {
  wrap: "overflow-x-auto",
  table: "w-full min-w-[720px] text-left text-sm",
  th: "text-muted border-line border-b px-5 py-3 text-xs font-semibold tracking-wide uppercase",
  td: "border-line border-b px-5 py-3.5 align-middle",
  tr: "hover:bg-surface-2/60 transition-colors",
};

export const fieldCls =
  "border-line bg-surface focus:border-brand focus:ring-brand/20 rounded-xl border px-3.5 py-2.5 text-sm outline-none focus:ring-4";

export function relativeTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  const rtf = new Intl.RelativeTimeFormat("fr", { numeric: "auto" });
  if (diff < 60) return "à l'instant";
  if (diff < 3600) return rtf.format(-Math.round(diff / 60), "minute");
  if (diff < 86400) return rtf.format(-Math.round(diff / 3600), "hour");
  if (diff < 86400 * 30) return rtf.format(-Math.round(diff / 86400), "day");
  return new Intl.DateTimeFormat("fr-CD", { dateStyle: "medium", timeZone: "Africa/Lubumbashi" }).format(
    new Date(iso),
  );
}
