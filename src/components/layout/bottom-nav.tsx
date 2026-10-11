"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { PUBLIC_NAV } from "@/components/layout/nav-items";

export function BottomNav() {
  const pathname = usePathname() ?? "/";
  return (
    <nav
      aria-label="Navigation principale"
      className="border-line bg-surface/90 fixed inset-x-0 bottom-0 z-40 border-t pb-[env(safe-area-inset-bottom)] backdrop-blur-lg md:hidden"
    >
      <ul className="mx-auto grid max-w-lg grid-cols-5">
        {PUBLIC_NAV.map(({ href, label, icon: Icon, match }) => {
          const active = match(pathname);
          return (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex min-h-16 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors ${
                  active ? "text-brand" : "text-muted"
                }`}
              >
                <span className="relative flex h-7 w-12 items-center justify-center">
                  {active && (
                    <span
                      className="bg-brand/12 motion-safe:animate-pop absolute inset-0 rounded-full"
                      aria-hidden="true"
                    />
                  )}
                  <Icon
                    className={`relative size-5 transition-transform duration-300 ${active ? "-translate-y-px scale-110" : ""}`}
                    strokeWidth={active ? 2.4 : 2}
                    aria-hidden="true"
                  />
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
