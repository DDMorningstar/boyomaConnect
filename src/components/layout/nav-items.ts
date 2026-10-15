import { Compass, Heart, House, LocateFixed, UserRound, type LucideIcon } from "lucide-react";
import type { MessageKey } from "@/lib/i18n";

export interface NavItem {
  href: string;
  label: string;
  /** Libellé traduit (lingala, swahili). */
  key: MessageKey;
  icon: LucideIcon;
  match: (path: string) => boolean;
}

export const PUBLIC_NAV: NavItem[] = [
  { href: "/", label: "Accueil", key: "nav.home", icon: House, match: (p) => p === "/" },
  {
    href: "/explorer",
    label: "Explorer",
    key: "nav.explore",
    icon: Compass,
    match: (p) =>
      ["/explorer", "/recherche", "/categories", "/carte", "/communes", "/zones", "/lieux"].some((x) =>
        p.startsWith(x),
      ),
  },
  { href: "/proximite", label: "À proximité", key: "nav.nearby", icon: LocateFixed, match: (p) => p.startsWith("/proximite") },
  { href: "/favoris", label: "Favoris", key: "nav.favorites", icon: Heart, match: (p) => p.startsWith("/favoris") },
  {
    href: "/profil",
    label: "Compte",
    key: "nav.account",
    icon: UserRound,
    match: (p) =>
      ["/profil", "/connexion", "/inscription", "/espace-pro", "/admin"].some((x) => p.startsWith(x)),
  },
];
