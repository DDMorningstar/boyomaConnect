import type { ReactNode } from "react";

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
      {icon && <div className="text-muted mb-3">{icon}</div>}
      <h2 className="text-base font-semibold">{title}</h2>
      {children && <div className="text-muted mt-1.5 max-w-sm text-sm">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}
