"use client";
import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ClipboardCheck,
  DatabaseZap,
  ExternalLink,
  FileClock,
  Flag,
  FolderTree,
  Image as ImageIcon,
  LayoutDashboard,
  Menu,
  MapPinned,
  MessageSquareText,
  Settings,
  Users,
  X,
  type LucideIcon,
} from "lucide-react";
import { LogoMark } from "@/components/layout/logo";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { Avatar } from "@/components/ui/avatar";

export interface AdminNavCounts {
  moderation: number;
  reports: number;
  reviews: number;
  media: number;
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  permission: string;
  badge?: keyof AdminNavCounts;
}

const NAV: { title: string; items: NavItem[] }[] = [
  {
    title: "Vue d'ensemble",
    items: [{ href: "/admin", label: "Tableau de bord", icon: LayoutDashboard, permission: "*" }],
  },
  {
    title: "Modération",
    items: [
      {
        href: "/admin/moderation",
        label: "Validations",
        icon: ClipboardCheck,
        permission: "submissions.review",
        badge: "moderation",
      },
      {
        href: "/admin/signalements",
        label: "Signalements",
        icon: Flag,
        permission: "reports.handle",
        badge: "reports",
      },
      {
        href: "/admin/avis",
        label: "Avis",
        icon: MessageSquareText,
        permission: "reviews.moderate",
        badge: "reviews",
      },
      {
        href: "/admin/medias",
        label: "Photos",
        icon: ImageIcon,
        permission: "media.moderate",
        badge: "media",
      },
    ],
  },
  {
    title: "Annuaire",
    items: [
      { href: "/admin/lieux", label: "Lieux", icon: MapPinned, permission: "places.read_all" },
      { href: "/admin/categories", label: "Catégories", icon: FolderTree, permission: "categories.manage" },
      { href: "/admin/importations", label: "Importations", icon: DatabaseZap, permission: "imports.view" },
    ],
  },
  {
    title: "Communauté",
    items: [{ href: "/admin/utilisateurs", label: "Utilisateurs", icon: Users, permission: "users.read" }],
  },
  {
    title: "Système",
    items: [
      { href: "/admin/journal", label: "Journal d'audit", icon: FileClock, permission: "audit.read" },
      { href: "/admin/parametres", label: "Paramètres", icon: Settings, permission: "settings.manage" },
    ],
  },
];

function isActive(pathname: string, href: string) {
  return href === "/admin" ? pathname === "/admin" : pathname.startsWith(href);
}

function Sidebar({
  permissions,
  counts,
  onNavigate,
}: {
  permissions: string[];
  counts: AdminNavCounts;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() ?? "/admin";
  return (
    <nav aria-label="Administration" className="flex-1 space-y-6 overflow-y-auto px-3 py-4">
      {NAV.map((group) => {
        const items = group.items.filter((i) => i.permission === "*" || permissions.includes(i.permission));
        if (!items.length) return null;
        return (
          <div key={group.title}>
            <p className="text-muted px-3 pb-2 text-[11px] font-semibold tracking-wider uppercase">
              {group.title}
            </p>
            <ul className="space-y-0.5">
              {items.map(({ href, label, icon: Icon, badge }) => {
                const active = isActive(pathname, href);
                const count = badge ? counts[badge] : 0;
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      onClick={onNavigate}
                      aria-current={active ? "page" : undefined}
                      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                        active ? "bg-brand/10 text-brand" : "text-muted hover:bg-surface-2 hover:text-ink"
                      }`}
                    >
                      {active && (
                        <span className="bg-brand motion-safe:animate-pop absolute top-2 bottom-2 left-0 w-1 rounded-full" />
                      )}
                      <Icon
                        className="size-[18px] shrink-0 transition-transform group-hover:scale-110"
                        aria-hidden="true"
                      />
                      <span className="flex-1">{label}</span>
                      {count > 0 && (
                        <span className="bg-danger min-w-5 rounded-full px-1.5 text-center text-[11px] leading-5 font-bold text-white">
                          {count > 99 ? "99+" : count}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        );
      })}
    </nav>
  );
}

/** Mise en page de la console : barre latérale fixe (tiroir sur mobile) + barre supérieure. */
export function AdminShell({
  children,
  permissions,
  counts,
  user,
}: {
  children: ReactNode;
  permissions: string[];
  counts: AdminNavCounts;
  user: { name: string | null; email: string | null; avatar: string | null; role: string };
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const brand = (
    <Link href="/admin" className="flex items-center gap-2.5 px-5 py-4">
      <LogoMark className="size-9" />
      <span className="leading-tight">
        <span className="block text-[15px] font-extrabold tracking-tight">
          Boyoma <span className="text-brand">Admin</span>
        </span>
        <span className="text-muted block text-[11px]">Console d&apos;administration</span>
      </span>
    </Link>
  );
  const account = (
    <div className="border-line flex items-center gap-3 border-t p-4">
      <Avatar src={user.avatar} name={user.name ?? user.email} size={36} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{user.name ?? user.email}</p>
        <p className="text-muted truncate text-xs">{user.role}</p>
      </div>
    </div>
  );

  return (
    <div className="bg-bg min-h-dvh">
      {/* Barre latérale (écrans larges) */}
      <aside className="border-line bg-surface fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r lg:flex">
        {brand}
        <Sidebar permissions={permissions} counts={counts} />
        {account}
      </aside>

      {/* Tiroir (mobile / tablette) */}
      {open && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu d'administration"
        >
          <button
            type="button"
            aria-label="Fermer le menu"
            onClick={() => setOpen(false)}
            className="motion-safe:animate-fade-in absolute inset-0 bg-black/50"
          />
          <aside className="bg-surface relative flex h-full w-72 max-w-[85vw] flex-col shadow-2xl motion-safe:animate-[slide-in_0.25s_ease-out]">
            <div className="flex items-center justify-between pr-3">
              {brand}
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer le menu"
                className="hover:bg-surface-2 rounded-full p-2"
              >
                <X className="size-5" />
              </button>
            </div>
            <Sidebar permissions={permissions} counts={counts} onNavigate={() => setOpen(false)} />
            {account}
          </aside>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="border-line bg-bg/80 sticky top-0 z-30 flex h-16 items-center gap-3 border-b px-4 backdrop-blur-xl lg:px-8">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Ouvrir le menu"
            className="border-line bg-surface hover:bg-surface-2 rounded-full border p-2 lg:hidden"
          >
            <Menu className="size-5" />
          </button>
          <p className="text-muted hidden text-sm sm:block">
            Connecté en tant que <span className="text-ink font-semibold">{user.name ?? user.email}</span>
          </p>
          <div className="ml-auto flex items-center gap-2">
            <ThemeToggle />
            <Link
              href="/"
              className="border-line bg-surface hover:bg-surface-2 inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold"
            >
              <ExternalLink className="size-4" aria-hidden="true" />
              <span className="hidden sm:inline">Voir le site</span>
            </Link>
          </div>
        </header>
        <main id="contenu" className="mx-auto w-full max-w-7xl px-4 py-6 lg:px-8 lg:py-8">
          {children}
        </main>
      </div>
    </div>
  );
}
