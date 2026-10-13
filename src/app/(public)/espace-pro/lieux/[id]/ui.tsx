import Link from "next/link";
import type { ReactNode } from "react";
import { Lock } from "lucide-react";

/** Éléments communs de la console de l'établissement. */
export function Panel({
  title,
  description,
  action,
  children,
  id,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="border-line bg-surface scroll-mt-24 space-y-4 rounded-[var(--radius-card)] border p-4 shadow-[var(--shadow-card)] md:p-5"
    >
      {(title || action) && (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            {title && <h2 className="font-bold">{title}</h2>}
            {description && <p className="text-muted mt-0.5 text-sm">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}

export function PageTitle({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4">
      <h2 className="text-xl font-extrabold tracking-tight">{title}</h2>
      {description && <p className="text-muted mt-1 text-sm">{description}</p>}
    </div>
  );
}

/** Fonction réservée à un plan : bouton désactivé, explication et lien vers l'abonnement. */
export function PlanGate({ placeId, feature, plans }: { placeId: string; feature: string; plans: string }) {
  return (
    <div className="border-line bg-surface-2 flex flex-wrap items-center gap-3 rounded-2xl border border-dashed p-4 text-sm">
      <Lock className="text-muted size-5 shrink-0" aria-hidden="true" />
      <p className="min-w-0 flex-1">
        <strong>{feature}</strong> est inclus dans les plans {plans}.
      </p>
      <Link
        href={`/espace-pro/lieux/${placeId}/abonnement`}
        className="bg-brand hover:bg-brand-strong rounded-xl px-4 py-2 font-semibold text-white"
      >
        Voir les plans
      </Link>
    </div>
  );
}

export function Empty({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className="border-line text-muted flex flex-col items-center gap-2 rounded-2xl border border-dashed p-6 text-center text-sm">
      {icon}
      {children}
    </div>
  );
}

export const shortDate = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("fr-CD", { dateStyle: "medium", timeZone: "Africa/Lubumbashi" }).format(
        new Date(iso),
      )
    : "—";

export const dateTime = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("fr-CD", {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: "Africa/Lubumbashi",
      }).format(new Date(iso))
    : "—";
