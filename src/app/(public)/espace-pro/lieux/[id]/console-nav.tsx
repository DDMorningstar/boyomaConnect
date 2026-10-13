"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BadgeCheck,
  Clock,
  CreditCard,
  Inbox,
  LayoutDashboard,
  QrCode,
  ShoppingBag,
  Star,
  Store,
  Tag,
  Users,
  type LucideIcon,
} from "lucide-react";

const ITEMS: { path: string; label: string; icon: LucideIcon; badge?: "inquiries" }[] = [
  { path: "", label: "Tableau de bord", icon: LayoutDashboard },
  { path: "/fiche", label: "Ma fiche", icon: Store },
  { path: "/catalogue", label: "Catalogue", icon: ShoppingBag },
  { path: "/horaires", label: "Horaires", icon: Clock },
  { path: "/demandes", label: "Demandes", icon: Inbox, badge: "inquiries" },
  { path: "/offres", label: "Offres", icon: Tag },
  { path: "/avis", label: "Avis", icon: Star },
  { path: "/visibilite", label: "Visibilité", icon: QrCode },
  { path: "/equipe", label: "Équipe", icon: Users },
  { path: "/verification", label: "Vérification", icon: BadgeCheck },
  { path: "/abonnement", label: "Abonnement", icon: CreditCard },
];

/** Navigation de la console : onglets défilants sur mobile, colonne latérale sur grand écran. */
export function ConsoleNav({ base, newInquiries }: { base: string; newInquiries: number }) {
  const pathname = usePathname() ?? "";
  return (
    <nav aria-label="Gestion de l'établissement" className="-mx-4 lg:mx-0">
      <ul className="flex scrollbar-none gap-1.5 overflow-x-auto px-4 pb-1 lg:flex-col lg:overflow-visible lg:px-0">
        {ITEMS.map(({ path, label, icon: Icon, badge }) => {
          const href = `${base}${path}`;
          const active = path === "" ? pathname === base : pathname.startsWith(href);
          const count = badge === "inquiries" ? newInquiries : 0;
          return (
            <li key={path} className="shrink-0">
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2.5 rounded-xl px-3.5 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                  active
                    ? "bg-brand text-white shadow-[var(--shadow-float)]"
                    : "text-muted hover:bg-surface-2 hover:text-ink"
                }`}
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="lg:flex-1">{label}</span>
                {count > 0 && (
                  <span
                    className={`rounded-full px-1.5 text-xs font-bold ${active ? "bg-white/25" : "bg-brand text-white"}`}
                  >
                    {count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
