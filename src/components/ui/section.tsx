import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

export function Section({
  title,
  subtitle,
  href,
  hrefLabel = "Tout voir",
  children,
}: {
  title: string;
  subtitle?: string;
  href?: string;
  hrefLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className="mt-8">
      <div className="mb-3 flex items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold tracking-tight">{title}</h2>
          {subtitle && <p className="text-muted text-sm">{subtitle}</p>}
        </div>
        {href && (
          <Link href={href} className="text-brand inline-flex shrink-0 items-center text-sm font-semibold">
            {hrefLabel}
            <ChevronRight className="size-4" aria-hidden="true" />
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}
