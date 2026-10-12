import { Compass, Heart, House, LocateFixed, UserRound, type LucideIcon } from "lucide-react";

export interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
  match: (path: string) => boolean;
}

export const PUBLIC_NAV: NavItem[] = [
  { href: "/", label: "Accueil", icon: House, match: (p) => p === "/" },
  {
    href: "/explorer",
    label: "Explorer",
    icon: Compass,
    match: (p) =>
      ["/explorer", "/recherche", "/categories", "/carte", "/communes", "/zones", "/lieux"].some((x) =>
        p.startsWith(x),
      ),
  },
  { href: "/proximite", label: "À proximité", icon: LocateFixed, match: (p) => p.startsWith("/proximite") },
  { href: "/favoris", label: "Favoris", icon: Heart, match: (p) => p.startsWith("/favoris") },
  {
    href: "/profil",
    label: "Compte",
    icon: UserRound,
    match: (p) =>
      ["/profil", "/connexion", "/inscription", "/espace-pro", "/admin"].some((x) => p.startsWith(x)),
  },
];
