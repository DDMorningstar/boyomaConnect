"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";
import { Logo } from "@/components/layout/logo";
import { PUBLIC_NAV } from "@/components/layout/nav-items";

export function SiteHeader() {
  const pathname = usePathname() ?? "/";
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-bg/85 backdrop-blur-lg">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4">
        <Logo />
        <nav aria-label="Navigation principale" className="hidden items-center gap-1 md:flex">
          {PUBLIC_NAV.map(({ href, label, match }) => (
            <Link
              key={href}
              href={href}
              aria-current={match(pathname) ? "page" : undefined}
              className={`rounded-full px-3.5 py-2 text-sm font-medium transition-colors ${
                match(pathname) ? "bg-brand/10 text-brand" : "text-muted hover:text-ink"
              }`}
            >
              {label}
            </Link>
          ))}
        </nav>
        <Link
          href="/ajouter-un-lieu"
          className="inline-flex min-h-10 items-center gap-1.5 rounded-full bg-night px-3.5 text-sm font-semibold text-white dark:bg-brand"
        >
          <Plus className="size-4" aria-hidden="true" />
          <span className="hidden sm:inline">Ajouter un lieu</span>
          <span className="sr-only sm:hidden">Ajouter un lieu</span>
        </Link>
      </div>
    </header>
  );
}
