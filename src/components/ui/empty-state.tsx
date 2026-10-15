import type { ReactNode } from "react";

/** Décor léger (SVG en ligne, aucune image téléchargée) masqué par l'économiseur de données. */
function Decor() {
  return (
    <svg
      data-decor
      aria-hidden="true"
      viewBox="0 0 160 120"
      className="text-brand pointer-events-none absolute inset-0 m-auto h-[120px] w-[160px]"
    >
      <path
        d="M20 92c18-10 34-10 52-2s36 8 52-2 22-8 28-6"
        fill="none"
        stroke="currentColor"
        strokeOpacity=".18"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <path
        d="M30 104c14-6 28-6 42 0s30 6 44 0"
        fill="none"
        stroke="currentColor"
        strokeOpacity=".12"
        strokeWidth="3"
        strokeLinecap="round"
      />
      <circle cx="28" cy="34" r="3" fill="currentColor" fillOpacity=".25" />
      <circle cx="136" cy="28" r="4" fill="#f59e0b" fillOpacity=".45" />
      <circle cx="128" cy="70" r="2.5" fill="currentColor" fillOpacity=".3" />
      <path
        d="M40 18l1.6 4.4L46 24l-4.4 1.6L40 30l-1.6-4.4L34 24l4.4-1.6z"
        fill="#f59e0b"
        fillOpacity=".5"
      />
      <path
        d="M118 48l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3-3.3-1.2 3.3-1.2z"
        fill="currentColor"
        fillOpacity=".35"
      />
    </svg>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="border-line bg-surface flex flex-col items-center rounded-[var(--radius-card)] border border-dashed px-6 py-10 text-center">
      {icon && (
        <div className="relative mb-4 grid h-[120px] w-[160px] place-items-center">
          <Decor />
          <div className="bg-brand/10 text-brand relative grid size-20 place-items-center rounded-full ring-8 ring-[color-mix(in_oklab,var(--color-brand)_5%,transparent)]">
            {icon}
          </div>
        </div>
      )}
      <h2 className="text-base font-semibold">{title}</h2>
      {children && <div className="text-muted mt-1.5 max-w-sm text-sm">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
